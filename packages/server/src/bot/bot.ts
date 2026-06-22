import { Bot, Context, InlineKeyboard, InputFile, Keyboard } from "grammy";
import { formatNumber } from "@t1067/shared";
import { env } from "../env";
import { prisma } from "../db";
import {
  getAdminStats,
  getLeaderboard,
  getMe,
  getMemberId,
  isAdmin,
  linkByPhone,
  touchTelegramUser,
} from "../services/memberService";
import { dailyCheckIn, spinWheel } from "../services/rewardService";
import { claimMission, getMissions } from "../services/missionService";
import { getBoxStatus, openBox } from "../services/boxService";
import { attachPendingReferral, completeReferral, getReferralInfo, REFERRER_REWARD } from "../services/referralService";
import { getWeeklyBoard } from "../services/weeklyService";
import { getEconomy, getHealth, getLiveBookings } from "../services/adminOps";
import { getIntegrity } from "../services/reconciliation";
import type { CashbackDelta } from "../sync/sync";
import { payDriver, registerBooking } from "./booking";
import {
  renderBadgeUnlocked,
  renderAccount,
  renderBadges,
  renderCheckIn,
  renderDriverPanel,
  renderEarnPush,
  renderLeaderboard,
  renderMahalla,
  renderLinkPrompt,
  renderMissions,
  renderNotFound,
  renderProfile,
  renderReferral,
  renderFare,
  renderHelp,
  renderLinked,
  renderReferralWin,
  renderTaken,
  renderWeeklyBlock,
  renderWelcome,
  renderWheel,
} from "./render";
import { getFareConfig } from "../services/clientInfoService";

const canWebApp = env.TELEGRAM_WEBAPP_URL.startsWith("https://");

// Telegram caches the Mini App aggressively BY URL — the owner kept seeing stale builds
// (worst: the persistent Menu Button, whose URL had NO version → permanently cached → the
// old UZ-blocked map → blank). We version the URL (?v=<token>) so Telegram treats each
// release as a brand-new app → guaranteed fresh load. The token AUTO-tracks the live
// frontend: we probe index.html's hashed bundle name at startup, so no manual bump is
// needed on a frontend deploy (the stale "v14" that caused this never auto-updated).
const WEBAPP_BUILD = "v16"; // static fallback if the live-hash probe fails
let webAppVer = WEBAPP_BUILD;
async function refreshWebAppVer(): Promise<void> {
  try {
    const res = await fetch(env.TELEGRAM_WEBAPP_URL);
    const m = (await res.text()).match(/index-([A-Za-z0-9_]+)\.js/);
    if (m) webAppVer = m[1]!;
  } catch (e) {
    console.error("[bot] webapp version probe failed → fallback", WEBAPP_BUILD, e instanceof Error ? e.message : e);
  }
}
function webAppUrl(go?: string): string {
  const u = env.TELEGRAM_WEBAPP_URL;
  return u + (u.includes("?") ? "&" : "?") + "v=" + webAppVer + (go ? "&go=" + go : "");
}

// Clean 2-row menu: booking first, everything else folded into Bonuslar/Ilova.
// Old button labels keep graceful hears-aliases (Telegram caches keyboards).
function mainMenu(isDriver = false): Keyboard {
  // Taxi ordering = the NEW Mini App flow. The button opens the Mini App straight to
  // booking (?go=book), not the old bot text flow. Old cached keyboards still send the
  // text → bot.hears("🚕 Taxi chaqirish") falls back to startBooking (graceful).
  const kb = new Keyboard();
  // Action-first: EVERY button deep-links straight into the Mini App on its exact
  // screen (?go=…). Old cached keyboards send the label as text → the bot.hears(…)
  // aliases below still answer in-chat (graceful fallback + the path when a client
  // doesn't support web-app buttons).
  // Eski usul (ega tilagi): menu tugmalari BOTNING O'ZIDA ishlaydi — mini-appsiz.
  // Har tugma matn → bot.hears(...) ushlaydi (taxi→startBooking, Hamyon→profil,
  // Bonuslar→vazifalar, Do'st→referral...). Mini App'ni xohlaganlar pastdagi "🚀 Ilova".
  const btn = (label: string, _go: string): void => {
    void _go;
    kb.text(label);
  };
  btn("🚕 Taxi chaqirish", "book");
  btn("📍 Buyurtmam", "book"); // booking3 shows the live order if one is active
  kb.row();
  btn("💰 Hamyon", "wallet");
  btn("🎁 Bonuslar", "play");
  btn("👥 Do'st", "friends");
  kb.row();
  btn("🏆 Reyting", "reyting");
  btn("👤 Hisobim", "profile");
  kb.row();
  btn("🙏 Haydovchiga to'lash", "tip"); // one-tap → booking.ts bot.hears → startPayDriver
  if (isDriver) {
    kb.row();
    btn("🚗 Haydovchi paneli", "driver");
  }
  if (canWebApp) kb.row().webApp("🚀 Ilova — O'yin, Bozor & ko'p", webAppUrl());
  return kb.resized();
}

function contactKeyboard(): Keyboard {
  return new Keyboard().requestContact("📱 Raqamni ulashish").resized().oneTime();
}

// Unlinked prompt — ALWAYS offers BOTH paths: the verified «Raqamni ulashish» (reply keyboard)
// AND the «Boshqa raqam» (1067 code) inline button. Previously the inline button only appeared
// on /start, so users reaching the prompt from a menu had no way to link a different number.
async function promptLink(ctx: Context): Promise<void> {
  await ctx.reply(renderLinkPrompt(), { parse_mode: "HTML", reply_markup: contactKeyboard() });
  await ctx.reply("1067 raqamingiz Telegram raqamingizdan <b>boshqa</b> bo'lsa 👇", {
    parse_mode: "HTML",
    reply_markup: new InlineKeyboard().text("📱 Boshqa raqam (1067 kodi bilan)", "clink:start"),
  });
}

function profileOf(src: { username?: string; first_name?: string; last_name?: string; language_code?: string }) {
  return { username: src.username, firstName: src.first_name, lastName: src.last_name, languageCode: src.language_code };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// 🔑 in-flight "link a different number via 1067 code" sessions. No phone yet → awaiting the
// number; phone set → awaiting the 4-digit code. Transient (in-memory) by design.
const codeLink = new Map<string, { phone?: string }>();

export function createBot(): Bot {
  const bot = new Bot(env.BOT_TOKEN);

  bot.catch((err) => console.error("[bot] error:", err.error));

  bot.command("start", async (ctx) => {
    const id = String(ctx.from!.id);
    codeLink.delete(id); // /start cancels any pending "link a different number" flow
    payDriver.delete(id); // …and the "pay a driver by car number" flow
    await touchTelegramUser(id, profileOf(ctx.from!));
    // referral deep link: t.me/<bot>?start=ref_<code>
    const payload = (typeof ctx.match === "string" ? ctx.match : "").trim();
    const joinerName = esc(ctx.from!.first_name ?? "Yangi mijoz"); // the person who clicked/scanned the invite
    if (payload.startsWith("ref_")) {
      // tell the inviter the moment their link is clicked — "you invited <name>" (the proof they asked for)
      const r = await attachPendingReferral(id, payload.slice(4)).catch(() => ({ attached: false }) as { attached: boolean; referrerTelegramId?: string });
      if (r.attached && r.referrerTelegramId) {
        await bot.api
          .sendMessage(
            r.referrerTelegramId,
            `🎉 <b>Siz ${joinerName}ni taklif qildingiz!</b>\n\n<b>${joinerName}</b> havolangiz orqali botga kirdi. U telefon ulab birinchi safarini qilsa — sizga <b>${formatNumber(REFERRER_REWARD)} tanga</b> tushadi. 🎁`,
            { parse_mode: "HTML" },
          )
          .catch(() => undefined);
      }
    }
    if (payload.startsWith("drv_")) {
      const { attachDriverRecruit } = await import("../services/recruitService");
      const r = await attachDriverRecruit(id, Number(payload.slice(4))).catch(() => ({ attached: false }) as { attached: boolean; driverTelegramId?: string });
      // immediate driver feedback — "you invited <name>" the moment their QR is scanned
      if (r.attached && r.driverTelegramId) {
        await bot.api
          .sendMessage(
            r.driverTelegramId,
            `🎉 <b>Siz ${joinerName}ni taklif qildingiz!</b>\n\n<b>${joinerName}</b> QR kodingiz orqali qo'shildi. U birinchi safarini qilganda siz <b>500 tanga</b> olasiz, keyin har safaridan ulush. 🚖\n<i>Panelda «⏳ Kutilmoqda» da ko'rinadi.</i>`,
            { parse_mode: "HTML" },
          )
          .catch(() => undefined);
      }
    }
    const me = await getMe(id);
    if (me) {
      await ctx.reply(renderProfile(me), { parse_mode: "HTML", reply_markup: mainMenu(me.type === "driver") });
    } else {
      await ctx.reply(renderWelcome(ctx.from!.first_name ?? "do'st"), { parse_mode: "HTML", reply_markup: contactKeyboard() });
      await ctx.reply(renderLinkPrompt(), { parse_mode: "HTML", reply_markup: contactKeyboard() });
      await ctx.reply("1067 raqamingiz Telegram raqamingizdan <b>boshqa</b> bo'lsa 👇", {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard().text("📱 Boshqa raqam (1067 kodi bilan)", "clink:start"),
      });
    }
  });

  const handleLink = async (ctx: Context, phone: string) => {
    const id = String(ctx.from!.id);
    await ctx.reply("🔎 Tekshiryapman…");
    const res = await linkByPhone(id, phone, profileOf(ctx.from!));
    if (res.status === "linked") {
      const me = await getMe(id);
      const role = res.type === "driver" ? "Haydovchi" : "Mijoz";
      await ctx.reply(renderLinked(res.fullName ?? "Mijoz", role), { parse_mode: "HTML", reply_markup: mainMenu(res.type === "driver") });
      // pay out a pending referral (this user joined via someone's invite)
      if (res.memberId) {
        const credit = await completeReferral(id, res.memberId).catch(() => null);
        if (credit) {
          await ctx
            .reply(
              `🎁 Do'st taklifi qabul qilindi!\nBirinchi safaringizdan keyin <b>+${formatNumber(credit.refereeReward)} tanga</b> sovg'a olasiz 🚕`,
              { parse_mode: "HTML" },
            )
            .catch(() => undefined);
          if (credit.referrerReward > 0) {
            await ctx.api
              .sendMessage(credit.referrerTelegramId, renderReferralWin(credit.referrerReward), { parse_mode: "HTML" })
              .catch(() => undefined);
          }
        }
      }
      if (me) await ctx.reply(renderProfile(me), { parse_mode: "HTML", reply_markup: mainMenu(me.type === "driver") });
    } else if (res.status === "taken") {
      await ctx.reply(renderTaken(), { parse_mode: "HTML" });
    } else {
      await ctx.reply(renderNotFound(), { parse_mode: "HTML" });
    }
  };

  bot.on("message:contact", async (ctx) => {
    const contact = ctx.message.contact;
    // SECURITY: accept ONLY the user's OWN Telegram-verified number. The «Raqamni ulashish»
    // button always sets contact.user_id = the sharer; a MANUALLY-added contact (someone else's
    // number) has no/other user_id → reject. This is the identity proof — you can only register
    // the number Telegram confirmed is yours, so nobody can claim another person's account.
    if (contact.user_id !== ctx.from!.id) {
      await ctx.reply(
        "⚠️ Faqat <b>o'z</b> raqamingizni — pastdagi «📱 Raqamni ulashish» tugmasi orqali ulashing.\n<i>Qo'lda kiritilgan begona raqam qabul qilinmaydi.</i>",
        { parse_mode: "HTML", reply_markup: contactKeyboard() },
      );
      return;
    }
    await touchTelegramUser(String(ctx.from!.id), profileOf(ctx.from!));
    await handleLink(ctx, contact.phone_number);
  });

  // ── 🔑 link a DIFFERENT number via a 1067-issued 4-digit code (Telegram ≠ 1067 number) ──
  const startCodeLink = async (ctx: Context): Promise<void> => {
    codeLink.set(String(ctx.from!.id), {});
    await ctx.reply(
      "📱 <b>Boshqa raqam ulash</b>\n\n1067'da ishlatadigan raqamingizni yozing (masalan <code>+998901234567</code>):\n<i>Bekor qilish — /start</i>",
      { parse_mode: "HTML" },
    );
  };
  bot.command("boshqaraqam", (ctx) => startCodeLink(ctx));
  bot.callbackQuery("clink:start", async (ctx) => {
    await ctx.answerCallbackQuery();
    await startCodeLink(ctx);
  });

  // admin issues the code (after verifying the caller by phone): /kod +998901234567
  bot.command("kod", async (ctx) => {
    const id = String(ctx.from!.id);
    if (!isAdmin(id)) return; // admin-only (silent for others)
    const phone = (typeof ctx.match === "string" ? ctx.match : "").trim();
    if (!/^\+?\d[\d\s\-()]{8,}$/.test(phone)) {
      await ctx.reply("Foydalanish: <code>/kod +998901234567</code>", { parse_mode: "HTML" });
      return;
    }
    const { generateLinkCode } = await import("../services/verifyCodeService");
    const code = await generateLinkCode(phone);
    await ctx.reply(
      `🔑 <b>${esc(phone)}</b> uchun kod: <b>${code}</b>\n\nMijozga ayting — u botda /boshqaraqam orqali kiritadi. 1 soat amal qiladi.`,
      { parse_mode: "HTML" },
    );
  });

  // code-link text steps — BEFORE the phone-regex below so the number step isn't swallowed by
  // the admin-only typed-number guard. Falls through (next) when not in the code-link flow.
  bot.on("message:text", async (ctx, next) => {
    const id = String(ctx.from!.id);
    const sess = codeLink.get(id);
    if (!sess) return next();
    const text = ctx.message.text.trim();
    if (text.startsWith("/")) {
      codeLink.delete(id);
      return next();
    }
    if (!sess.phone) {
      if (!/^\+?\d[\d\s\-()]{8,}$/.test(text)) {
        await ctx.reply("❌ Raqam noto'g'ri. Masalan: <code>+998901234567</code>", { parse_mode: "HTML" });
        return;
      }
      sess.phone = text;
      await ctx.reply("✅ Raqam qabul qilindi.\n\n📞 Endi <b>1067'ga qo'ng'iroq qiling</b>, <b>4-xonali kod</b> oling va shu yerga yozing:", { parse_mode: "HTML" });
      return;
    }
    if (!/^\d{4}$/.test(text)) {
      await ctx.reply("❌ Kod 4 xonali bo'lishi kerak. Qayta yozing (yoki /start bilan bekor):");
      return;
    }
    const { checkLinkCode } = await import("../services/verifyCodeService");
    const r = await checkLinkCode(sess.phone, text);
    if (!r.ok) {
      const msg: Record<string, string> = {
        no_code: "Bu raqamga kod berilmagan. 1067'ga qo'ng'iroq qiling.",
        expired: "Kod muddati tugadi. 1067'dan yangi kod oling.",
        wrong: "Kod xato. Qayta urinib ko'ring.",
        locked: "Juda ko'p urinish. 1067'dan yangi kod oling.",
      };
      await ctx.reply(`❌ ${msg[r.reason ?? "wrong"]}`);
      if (r.reason !== "wrong") codeLink.delete(id);
      return;
    }
    // verified by 1067 → link the number to this Telegram account
    codeLink.delete(id);
    await touchTelegramUser(id, profileOf(ctx.from!));
    const res = await linkByPhone(id, sess.phone, profileOf(ctx.from!));
    if (res.status === "linked") {
      await ctx.reply(`✅ <b>Raqam tasdiqlandi va ulandi!</b> Xush kelibsiz, ${esc(res.fullName ?? "Mijoz")} 🎉`, { parse_mode: "HTML", reply_markup: mainMenu(res.type === "driver") });
      const me = await getMe(id);
      if (me) await ctx.reply(renderProfile(me), { parse_mode: "HTML", reply_markup: mainMenu(me.type === "driver") });
    } else if (res.status === "taken") {
      await ctx.reply("⚠️ Bu raqam allaqachon boshqa akkauntga ulangan. 1067 support bilan bog'laning.");
    } else {
      await ctx.reply("⚠️ Ulashda xatolik. Qayta urinib ko'ring.");
    }
  });

  // SECURITY: typing a number proves NOTHING — anyone (INCLUDING an admin) could type someone
  // else's number and walk into their account. There is NO typed-number auto-link anymore —
  // not even for admins. Two safe paths only: (1) OWN number → the verified «Raqamni ulashish»
  // button (Telegram confirms it's yours); (2) a DIFFERENT number (1067 ≠ Telegram) → «📱 Boshqa
  // raqam» + a 4-digit code that an admin generates in the panel (👑 Boshqaruv → «🔑 Kod
  // yaratish»). Admins manage other people's accounts from the panel (search → relink), never
  // by typing a number here. This closes the "anyone can enter anyone's account" hole.
  bot.hears(/^\+?\d[\d\s\-()]{8,}$/, async (ctx) => {
    await ctx.reply(
      "🔒 Raqamni <b>qo'lda yozib bo'lmaydi</b> — bu xavfsiz emas.\n\n" +
        "• <b>O'z</b> raqamingiz → pastdagi «📱 Raqamni ulashish» tugmasi (Telegram tasdiqlaydi)\n" +
        "• <b>Boshqa</b> raqam (1067 raqamingiz Telegramnikidan farq qilsa) → pastdagi «📱 Boshqa raqam» tugmasi 👇",
      { parse_mode: "HTML", reply_markup: contactKeyboard() },
    );
    // The «📱 Boshqa raqam» button referenced above was only ever sent on /start — a user who
    // typed a number saw the instruction with NO button to tap. Re-offer it right here (one
    // message can't carry both a reply + inline keyboard, so it's a second message, like /start).
    await ctx.reply("1067 raqamingiz Telegram raqamingizdan <b>boshqa</b> bo'lsa 👇", {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().text("📱 Boshqa raqam (1067 kodi bilan)", "clink:start"),
    });
  });

  const showProfile = async (ctx: Context) => {
    const me = await getMe(String(ctx.from!.id));
    if (!me) {
      await promptLink(ctx);
      return;
    }
    await ctx.reply(renderProfile(me), {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().text("⚙️ Hisobim / Sozlamalar", "acct:open"),
    });
  };
  bot.hears("💰 Hamyon", showProfile);
  bot.hears("💰 Hisobim", showProfile); // old cached keyboards
  bot.command("me", showProfile);

  // 👤 Account & settings — see full info (kas-managed name/phone) + edit what we own (notifications).
  const showAccount = async (ctx: Context) => {
    const me = await getMe(String(ctx.from!.id));
    if (!me) {
      await promptLink(ctx);
      return;
    }
    const { isNotifyOff } = await import("../services/notifyService");
    const [tu, notifyOff] = await Promise.all([
      prisma.telegramUser.findFirst({ where: { memberId: me.member.id }, select: { linkedAt: true, createdAt: true } }),
      isNotifyOff(me.member.id),
    ]);
    const kb = new InlineKeyboard().text(notifyOff ? "🔔 Bildirishnomani yoqish" : "🔕 Bildirishnomani o'chirish", "acct:notify");
    await ctx.reply(renderAccount(me, { joined: tu?.linkedAt ?? tu?.createdAt ?? null, notifyOff }), { parse_mode: "HTML", reply_markup: kb });
  };
  bot.hears("👤 Hisobim", showAccount);
  bot.hears("⚙️ Sozlamalar", showAccount);
  bot.command("account", showAccount);
  bot.callbackQuery("acct:open", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    await showAccount(ctx);
  });
  bot.callbackQuery("acct:notify", async (ctx) => {
    await ctx.answerCallbackQuery({ text: "Saqlandi ✅" }).catch(() => undefined);
    const me = await getMe(String(ctx.from!.id));
    if (!me) return;
    const { isNotifyOff, setNotifyOff } = await import("../services/notifyService");
    await setNotifyOff(me.member.id, !(await isNotifyOff(me.member.id)));
    await showAccount(ctx);
  });

  // 🏘 V5 — mahalla (gap-vs-gap) league
  const showMahalla = async (ctx: Context) => {
    const me = await getMe(String(ctx.from!.id));
    if (!me) {
      await promptLink(ctx);
      return;
    }
    const { featureOn } = await import("../services/featureFlags");
    if (!(await featureOn("mahalla"))) {
      await ctx.reply("🏘 Mahalla ligasi tez orada!");
      return;
    }
    const { getMahallaBoard } = await import("../services/mahallaService");
    await ctx.reply(renderMahalla(await getMahallaBoard(me.member.id)), { parse_mode: "HTML" });
  };
  bot.hears("🏘 Mahalla", showMahalla);
  bot.command("mahalla", showMahalla);

  // 🚗 driver panel: earnings (tips + transfers in), recent ledger, cash-out hint
  const showDriverPanel = async (ctx: Context) => {
    const me = await getMe(String(ctx.from!.id));
    if (!me) {
      await promptLink(ctx);
      return;
    }
    if (me.type !== "driver" && String(ctx.from!.id) !== "6506297119") {
      await ctx.reply("Bu bo'lim faqat 1067 haydovchilari uchun 🚗");
      return;
    }
    const { getDriverEarnings } = await import("../services/transferService");
    const { driverRecruitStats } = await import("../services/recruitService");
    const [e, recruit] = await Promise.all([getDriverEarnings(me.member.id), driverRecruitStats(me.member.id)]);
    await ctx.reply(renderDriverPanel(me.coins, e, recruit), {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().text("🎯 Topshiriqlar", "drvm:list").text("📷 QR kodim", "drv:qr"),
    });
  };
  bot.hears("🚗 Haydovchi paneli", showDriverPanel);
  bot.command("driver", showDriverPanel);

  // 🎯 Driver missions — daily ride-count tasks (separate from client missions). Drivers see live
  // progress + claim; the owner manages them with /topshiriq add|on|off (panel UI is a follow-up).
  const showDriverMissions = async (ctx: Context): Promise<void> => {
    const me = await getMe(String(ctx.from!.id));
    if (!me || (me.type !== "driver" && String(ctx.from!.id) !== "6506297119")) {
      await ctx.reply("Bu bo'lim faqat 1067 haydovchilari uchun 🚗").catch(() => undefined);
      return;
    }
    const { getDriverMissions } = await import("../services/driverMissionService");
    const { missions, ridesToday } = await getDriverMissions(me.member.id);
    if (missions.length === 0) {
      await ctx.reply("🎯 Hozircha faol topshiriq yo'q.").catch(() => undefined);
      return;
    }
    const lines = ["🎯 <b>Bugungi topshiriqlar</b>", `🚕 Bugun bajarilgan safar: <b>${ridesToday}</b>`, ""];
    const kb = new InlineKeyboard();
    for (const m of missions) {
      const status = m.claimed ? "✅ olingan" : m.claimable ? "🎁 TAYYOR!" : `${m.progress}/${m.target}`;
      lines.push(`${m.emoji} <b>${esc(m.title)}</b> — ${status} · +${formatNumber(m.reward)} tanga`);
      if (m.claimable) kb.text(`🎁 Olish: ${m.title}`, `drvm:claim:${m.id}`).row();
    }
    await ctx.reply(lines.join("\n"), { parse_mode: "HTML", reply_markup: kb }).catch(() => undefined);
  };
  bot.callbackQuery("drvm:list", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    await showDriverMissions(ctx);
  });
  bot.callbackQuery(/^drvm:claim:(.+)$/, async (ctx) => {
    const id = ctx.match?.[1];
    const me = await getMe(String(ctx.from!.id));
    if (!me || !id) {
      await ctx.answerCallbackQuery({ text: "Avval /start" }).catch(() => undefined);
      return;
    }
    const { claimDriverMission } = await import("../services/driverMissionService");
    const r = await claimDriverMission(me.member.id, id);
    if (r.ok) {
      await ctx.answerCallbackQuery({ text: `🎁 +${r.reward} tanga!`, show_alert: true }).catch(() => undefined);
      await ctx.reply(`🎁 Tabriklaymiz! Topshiriq uchun <b>+${formatNumber(r.reward ?? 0)} tanga</b> 🚗`, { parse_mode: "HTML" }).catch(() => undefined);
    } else {
      const msg = r.reason === "not_ready" ? "Hali bajarilmadi" : r.reason === "claimed" ? "Allaqachon olingan" : "Olib bo'lmadi";
      await ctx.answerCallbackQuery({ text: msg }).catch(() => undefined);
    }
  });
  // /topshiriq — drivers see their missions; the owner manages with add|on|off|list
  bot.command("topshiriq", async (ctx) => {
    const parts = (ctx.message?.text ?? "").trim().split(/\s+/);
    if (isAdmin(String(ctx.from!.id)) && parts.length >= 2) {
      const { adminAddMission, adminToggleMission, adminListMissions } = await import("../services/driverMissionService");
      const sub = parts[1];
      if (sub === "add" && parts.length >= 5) {
        const r = await adminAddMission(parts.slice(4).join(" "), Number(parts[2]), Number(parts[3]));
        await ctx.reply(r.ok ? `✅ Qo'shildi: ${parts.slice(4).join(" ")} (${parts[2]} safar → ${parts[3]} tanga)` : `❌ ${r.reason}`);
        return;
      }
      if ((sub === "on" || sub === "off") && parts[2]) {
        const r = await adminToggleMission(parts[2], sub === "on");
        await ctx.reply(r.ok ? `✅ ${parts[2]} → ${sub}` : `❌ ${r.reason}`);
        return;
      }
      if (sub === "list") {
        const ms = await adminListMissions();
        await ctx.reply(
          "🎯 <b>Topshiriqlar</b>:\n" +
            ms.map((m) => `${m.active ? "🟢" : "🔴"} <code>${m.id}</code> ${esc(m.title)} — ${m.target} safar → ${formatNumber(m.reward)} tanga`).join("\n") +
            "\n\n<i>/topshiriq add &lt;safar&gt; &lt;tanga&gt; &lt;nom&gt;\n/topshiriq off &lt;id&gt; · /topshiriq on &lt;id&gt;</i>",
          { parse_mode: "HTML" },
        );
        return;
      }
    }
    await showDriverMissions(ctx);
  });
  // Driver self-serves their in-car recruit QR (was admin-download-only) — show it to
  // passengers; when they scan + ride, the driver earns 500 then per-ride revshare.
  bot.callbackQuery("drv:qr", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    const me = await getMe(String(ctx.from!.id));
    if (!me || (me.type !== "driver" && String(ctx.from!.id) !== "6506297119")) return;
    const { driverQrLink } = await import("../services/recruitService");
    const QR = await import("qrcode");
    const png = await QR.toBuffer(driverQrLink(me.member.id), { width: 600, margin: 2 });
    await ctx.replyWithPhoto(new InputFile(png), {
      caption:
        "🚖 <b>Mening QR kodim</b>\n\n📣 <b>Mijozga ayting:</b>\n«Bu QR'ni skanlang, botga ulaning va <b>birinchi safaringiz uchun 2000 tanga</b> oling! 🎁»\n\n✅ U birinchi safarini qilsa — sizga <b>500 tanga</b>, so'ng har safaridan ulush.\n📅 Oyiga 15 ta yangi mijoz · 30 000 tangagacha.",
      parse_mode: "HTML",
    });
  });

  // 🏪 shop owner redeems a customer's voucher: /vaucher KOD123
  bot.command("vaucher", async (ctx) => {
    const code = (typeof ctx.match === "string" ? ctx.match : "").trim();
    if (!code) {
      await ctx.reply("Foydalanish: <code>/vaucher KOD</code> — mijoz ko'rsatgan 6 belgili kod.", { parse_mode: "HTML" });
      return;
    }
    const me = await getMe(String(ctx.from!.id));
    if (!me?.member.phone) {
      await ctx.reply("Avval telefon raqamingizni ulang — /start.");
      return;
    }
    const { redeemVoucher } = await import("../services/marketService");
    const r = await redeemVoucher(code, me.member.phone);
    if (r.ok) {
      await ctx.reply(`✅ Vaucher qabul qilindi!\n🏪 ${r.shopName ?? ""} — <b>${r.title ?? ""}</b>`, { parse_mode: "HTML" });
    } else {
      const msgs: Record<string, string> = {
        not_found: "❌ Bunday kod topilmadi.",
        already: "⚠️ Bu vaucher allaqachon ishlatilgan.",
        not_owner: "⛔ Bu vaucher sizning do'koningizniki emas.",
      };
      await ctx.reply(msgs[r.reason ?? ""] ?? "Xatolik.");
    }
  });

  const showLeaderboard = async (ctx: Context) => {
    const id = String(ctx.from!.id);
    const me = await getMe(id);
    if (!me) {
      await promptLink(ctx);
      return;
    }
    const [lb, weekly] = await Promise.all([getLeaderboard(me.type, id), getWeeklyBoard(me.member.id)]);
    await ctx.reply(renderLeaderboard(lb) + renderWeeklyBlock(weekly), { parse_mode: "HTML", reply_markup: mainMenu() });
  };
  bot.hears("🏆 Reyting", showLeaderboard);
  bot.command("top", showLeaderboard);

  const checkIn = async (ctx: Context) => {
    const me = await getMe(String(ctx.from!.id));
    if (!me) {
      await promptLink(ctx);
      return;
    }
    const r = await dailyCheckIn(me.member.id);
    await ctx.reply(renderCheckIn(r), { parse_mode: "HTML", reply_markup: mainMenu() });
  };
  bot.hears("🔥 Kunlik", checkIn);
  bot.command("daily", checkIn);

  const spin = async (ctx: Context) => {
    const me = await getMe(String(ctx.from!.id));
    if (!me) {
      await promptLink(ctx);
      return;
    }
    const msg = await ctx.reply("🎡 G'ildirak aylanmoqda…");
    const r = await spinWheel(me.member.id);
    await ctx.api.editMessageText(msg.chat.id, msg.message_id, renderWheel(r), { parse_mode: "HTML" });
  };
  bot.hears("🎡 G'ildirak", spin); // old cached keyboards still work
  bot.command("wheel", spin);
  // in-ride card button (the primary entry from A2's live ride card)
  bot.callbackQuery("wheel:ride", async (ctx) => {
    const memberId = await getMemberId(String(ctx.from!.id));
    if (!memberId) {
      await ctx.answerCallbackQuery({ text: "Avval raqamingizni ulang 🙏", show_alert: true });
      return;
    }
    const r = await spinWheel(memberId);
    await ctx.answerCallbackQuery({
      text: r.noRide
        ? "G'ildirak safar paytida aylanadi 🚕"
        : r.alreadySpun
          ? "Bu safarning spini ishlatilgan ✅"
          : `${r.prize.emoji} +${formatNumber(r.prize.amount)} tanga!`,
      show_alert: !r.noRide && !r.alreadySpun,
    });
  });

  // ─── 🎰 BARABAN — post-ride spin wheel (5-min token granted on ride finish) ───
  const spinBaraban = async (ctx: Context): Promise<{ replied: boolean }> => {
    const memberId = await getMemberId(String(ctx.from!.id));
    if (!memberId) return { replied: false };
    const { spinRideWheel } = await import("../services/rideWheelService");
    const r = await spinRideWheel(memberId);
    if (!r.ok) {
      await ctx
        .reply("Baraban tayyor emas — safardan keyin 5 daqiqa ichida aylantiring 🚕", { reply_markup: mainMenu() })
        .catch(() => undefined);
      return { replied: true };
    }
    if ((r.prize ?? 0) > 0) {
      await ctx
        .reply(`🎉 Tabriklaymiz! <b>+${formatNumber(r.prize ?? 0)} tanga</b> yutdingiz! 🎰`, { parse_mode: "HTML", reply_markup: mainMenu() })
        .catch(() => undefined);
    } else {
      await ctx.reply("😢 Bu safar omad kulmadi — keyingi safar! 🎰", { reply_markup: mainMenu() }).catch(() => undefined);
    }
    return { replied: true };
  };
  bot.command("baraban", async (ctx) => {
    const memberId = await getMemberId(String(ctx.from!.id));
    if (!memberId) {
      await promptLink(ctx);
      return;
    }
    await spinBaraban(ctx);
  });
  // 🎰 inline button from the ride-finish notification
  bot.callbackQuery("baraban:spin", async (ctx) => {
    const memberId = await getMemberId(String(ctx.from!.id));
    if (!memberId) {
      await ctx.answerCallbackQuery({ text: "Avval raqamingizni ulang 🙏", show_alert: true }).catch(() => undefined);
      return;
    }
    const { spinRideWheel } = await import("../services/rideWheelService");
    const r = await spinRideWheel(memberId);
    if (!r.ok) {
      await ctx.answerCallbackQuery({ text: "Baraban tayyor emas — safardan keyin 5 daqiqa ichida 🚕", show_alert: true }).catch(() => undefined);
      return;
    }
    await ctx
      .answerCallbackQuery({
        text: (r.prize ?? 0) > 0 ? `🎉 +${formatNumber(r.prize ?? 0)} tanga yutdingiz! 🎰` : "😢 Bu safar omad kulmadi — keyingi safar! 🎰",
        show_alert: true,
      })
      .catch(() => undefined);
  });

  // 🪙 Pay the ride fare with tanga from the finish card → straight to the driver (driver gets TANGA).
  // Reuses the SAME closed-loop tip transfer (no new money logic): rider's tanga → driver member id.
  bot.callbackQuery(/^payfare:(\d+):(\d+)$/, async (ctx) => {
    const riderId = await getMemberId(String(ctx.from.id));
    if (!riderId) {
      await ctx.answerCallbackQuery({ text: "Avval raqamingizni ulang 🙏", show_alert: true }).catch(() => undefined);
      return;
    }
    const driverId = Number(ctx.match[1]);
    const amount = Number(ctx.match[2]);
    const { transfer } = await import("../services/transferService");
    // FARE payment (not a tip): high cap so a real 20k+ fare goes through; driver gets the full fare.
    const r = await transfer(riderId, "", amount, { kind: "fare", toMemberId: driverId });
    if (r.ok) {
      await ctx.answerCallbackQuery({ text: `✅ Yo'l haqi to'landi 🚕`, show_alert: true }).catch(() => undefined);
      await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => undefined);
      await ctx.reply(`✅ Yo'l haqi <b>${formatNumber(amount)} tanga</b> haydovchiga to'landi 🚕`, { parse_mode: "HTML" }).catch(() => undefined);
      // notify the driver
      const tg = await prisma.telegramUser.findUnique({ where: { memberId: driverId } });
      if (tg) {
        await ctx.api
          .sendMessage(tg.id, `🪙 Mijoz yo'l haqini tanga bilan to'ladi: <b>+${formatNumber(r.received)} tanga</b> 🚗\n«🚗 Haydovchi paneli»da ko'ring.`, { parse_mode: "HTML" })
          .catch(() => undefined);
      }
    } else {
      const msgs: Record<string, string> = {
        insufficient: "Tanga yetarli emas",
        self: "O'zingizga to'lab bo'lmaydi",
        account_too_new: "Hisobingiz hali juda yangi (48 soat kutiladi)",
        daily_sent_cap: "Bugungi o'tkazma limiti tugadi",
        daily_received_cap: "Haydovchining bugungi limiti to'ldi",
        ring: "Bu amal hozircha bloklangan",
      };
      await ctx.answerCallbackQuery({ text: msgs[r.reason ?? ""] ?? "To'lanmadi", show_alert: true }).catch(() => undefined);
    }
  });

  bot.hears("🎖 Nishonlar", async (ctx) => {
    const me = await getMe(String(ctx.from!.id));
    if (!me) {
      await promptLink(ctx);
      return;
    }
    await ctx.reply(renderBadges(me), { parse_mode: "HTML", reply_markup: mainMenu() });
  });

  // ─── 🎁 Bonuslar: ONE combined screen (streak + missions + box) ──────────────
  function claimKeyboard(
    m: Awaited<ReturnType<typeof getMissions>>,
    box: Awaited<ReturnType<typeof getBoxStatus>>,
    checkedToday: boolean,
  ): InlineKeyboard {
    const kb = new InlineKeyboard();
    if (!checkedToday) kb.text("✅ Bugunni belgilash (+streak)", "bonus:checkin").row();
    [...m.daily, ...m.weekly]
      .filter((x) => x.claimable)
      .forEach((x) => kb.text(`🎁 ${x.emoji} +${formatNumber(x.reward)} tanga`, `claim:${x.code}`).row());
    if (box.eligible && !box.opened) kb.text("🎁 BEPUL QUTINI OCHISH", "openbox").row();
    return kb;
  }

  const missionsView = async (memberId: number) => {
    const { getStreak } = await import("../services/rewardService");
    const [m, box, streak] = await Promise.all([getMissions(memberId), getBoxStatus(memberId), getStreak(memberId)]);
    const head = `🔥 Streak: <b>${streak.current} kun</b>${streak.checkedToday ? " ✅" : " — bugun belgilang!"}\n\n`;
    return { text: head + renderMissions(m, box), kb: claimKeyboard(m, box, streak.checkedToday) };
  };

  const showMissions = async (ctx: Context) => {
    const memberId = await getMemberId(String(ctx.from!.id));
    if (!memberId) {
      await promptLink(ctx);
      return;
    }
    const { text, kb } = await missionsView(memberId);
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb.inline_keyboard.length ? kb : mainMenu() });
  };
  bot.hears("🎁 Bonuslar", showMissions);
  bot.hears("🎯 Vazifalar", showMissions); // old cached keyboards
  bot.command("missions", showMissions);

  // streak check-in from the combined screen
  bot.callbackQuery("bonus:checkin", async (ctx) => {
    const memberId = await getMemberId(String(ctx.from!.id));
    if (!memberId) {
      await ctx.answerCallbackQuery({ text: "Avval raqamingizni ulang 🙏", show_alert: true });
      return;
    }
    const r = await dailyCheckIn(memberId);
    await ctx.answerCallbackQuery({
      text: r.alreadyChecked
        ? `Bugun belgilangansiz ✅ (streak ${r.current})`
        : `🔥 Streak ${r.current} kun!${r.rewardAmount > 0 ? ` +${formatNumber(r.rewardAmount)} tanga!` : ""}`,
      show_alert: r.rewardAmount > 0,
    });
    await refreshMissionsMessage(ctx, memberId);
  });

  const refreshMissionsMessage = async (ctx: Context, memberId: number) => {
    const { text, kb } = await missionsView(memberId);
    await ctx
      .editMessageText(text, { parse_mode: "HTML", reply_markup: kb.inline_keyboard.length ? kb : undefined })
      .catch(() => undefined);
  };

  bot.callbackQuery(/^claim:(.+)$/, async (ctx) => {
    const code = ctx.match[1]!;
    const memberId = await getMemberId(String(ctx.from!.id));
    if (!memberId) {
      await ctx.answerCallbackQuery({ text: "Avval raqamingizni ulang 🙏", show_alert: true });
      return;
    }
    const r = await claimMission(memberId, code);
    if (r.ok) {
      await ctx.answerCallbackQuery({ text: `🎉 +${formatNumber(r.reward)} tanga xazinangizga tushdi!`, show_alert: true });
    } else if (r.reason === "claimed") {
      await ctx.answerCallbackQuery({ text: "Bu mukofot allaqachon olingan ✅" });
    } else {
      await ctx.answerCallbackQuery({ text: "Bu vazifa hali tugamagan 🎯" });
    }
    await refreshMissionsMessage(ctx, memberId);
  });

  bot.callbackQuery("openbox", async (ctx) => {
    const memberId = await getMemberId(String(ctx.from!.id));
    if (!memberId) {
      await ctx.answerCallbackQuery({ text: "Avval raqamingizni ulang 🙏", show_alert: true });
      return;
    }
    const r = await openBox(memberId);
    if (r.ok && r.prize) {
      await ctx.answerCallbackQuery({
        text: `🎁 ${r.prize.emoji} ${r.prize.label}! +${formatNumber(r.prize.amount)} tanga xazinangizga tushdi!`,
        show_alert: true,
      });
    } else if (r.reason === "opened") {
      await ctx.answerCallbackQuery({ text: "Bugungi bepul quti ochilgan — ertaga yana! 🎁" });
    } else {
      await ctx.answerCallbackQuery({ text: "Avval barcha kunlik vazifalarni tugating 🎯" });
    }
    await refreshMissionsMessage(ctx, memberId);
  });

  // ─── referral ───────────────────────────────────────────────────────────────
  const showReferral = async (ctx: Context) => {
    const r = await getReferralInfo(String(ctx.from!.id));
    const shareUrl =
      `https://t.me/share/url?url=${encodeURIComponent(r.link)}` +
      `&text=${encodeURIComponent("🚕 1067 Taxi — har safardan cashback, kunlik sovg'alar va omad g'ildiragi! Qo'shiling:")}`;
    const kb = new InlineKeyboard().url("📤 Do'stga yuborish", shareUrl);
    await ctx.reply(renderReferral(r), { parse_mode: "HTML", reply_markup: kb });
  };
  bot.hears("👥 Do'st", showReferral);
  bot.hears("👥 Do'st taklif", showReferral); // old cached keyboards
  bot.command("invite", showReferral);

  // ─── kas1067 client power-up: fare + cashback rules ───────────────────────────
  const showFare = async (ctx: Context) => {
    try {
      const cfg = await getFareConfig();
      await ctx.reply(renderFare(cfg), { parse_mode: "HTML", reply_markup: mainMenu() });
    } catch {
      await ctx.reply("Narx ma'lumotini hozir olib bo'lmadi. Birozdan keyin urinib ko'ring.", { reply_markup: mainMenu() });
    }
  };
  bot.hears("🚖 Narx & cashback", showFare);
  bot.command("narx", showFare);

  bot.command("help", async (ctx) => {
    await ctx.reply(renderHelp(), { parse_mode: "HTML", reply_markup: mainMenu() });
  });

  bot.command("admin", async (ctx) => {
    const id = String(ctx.from!.id);
    if (!isAdmin(id)) {
      await ctx.reply("⛔ Bu buyruq faqat administratorlar uchun.");
      return;
    }
    const [drivers, clients] = await Promise.all([getAdminStats("driver"), getAdminStats("client")]);
    const block = (s: typeof drivers, title: string) =>
      `${title}\n` +
      `  👥 ${s.totalMembers} ta (bog'langan ${s.linkedMembers})\n` +
      `  💰 Jami ${s.metricLabel.toLowerCase()}: <b>${formatNumber(s.pointsSum)}</b>`;
    await ctx.reply(
      `🛠 <b>Admin · 1067 Taxi</b>\n\n` +
        `${block(drivers, "🚗 <b>Haydovchilar</b>")}\n\n` +
        `${block(clients, "🏅 <b>Mijozlar</b>")}\n\n` +
        `🔄 Oxirgi sync: ${drivers.lastSync ? `${drivers.lastSync.status} · ${drivers.lastSync.membersSeen} ta` : "—"}`,
      { parse_mode: "HTML" },
    );
  });

  // ─── in-bot operations console (admins monitor everything from Telegram) ──────
  const opsDash = async (ctx: Context) => {
    if (!isAdmin(String(ctx.from!.id))) {
      await ctx.reply("⛔ Faqat administratorlar uchun.");
      return;
    }
    const [h, e, integ] = await Promise.all([getHealth(), getEconomy(), getIntegrity()]);
    const dot = (ok: boolean) => (ok ? "🟢" : "🔴");
    const b = e.withdrawBudget;
    await ctx.reply(
      `🛡 <b>1067 — Operatsion holat</b>\n\n` +
        `🚦 <b>Salomatlik</b>\n` +
        `  kas1067 ${dot(h.kas.ok)} ${h.kas.ms}ms · baza ${dot(h.db.ok)} · bot ${dot(h.bot)}\n` +
        `  Sync: ${h.lastSync ? `${h.lastSync.status} (${h.lastSync.ageMin} daq)` : "—"} · Booking: ${h.bookingLive ? "JONLI" : "test"}\n\n` +
        `💰 <b>Iqtisod (tanga)</b>\n` +
        `  Muomalada: <b>${formatNumber(e.coinsOutstanding)}</b> · Jackpot: ${formatNumber(e.jackpot)}\n` +
        `  Berilgan ${formatNumber(e.emitted)} · Sarflangan ${formatNumber(e.sunk)}\n` +
        `  💸 So'mga bugun: <b>${formatNumber(e.withdrawnToday)}</b> (jami ${formatNumber(e.withdrawnTotal)})\n\n` +
        `🛡 <b>Revenue byudjet</b> (${b.rides} safardan)\n` +
        `  ${formatNumber(b.used)}/${formatNumber(b.total)} · qoldi <b>${formatNumber(b.remaining)}</b>\n\n` +
        `🔐 <b>Yaxlitlik</b>: ${integ.driftCount === 0 ? "✅ drift yo'q" : `⚠️ ${integ.driftCount} drift`} · anomaliya: ${integ.anomalies.length || "yo'q"}\n\n` +
        `📋 /orders — jonli buyurtmalar · 🖥 Panel: admin web`,
      { parse_mode: "HTML" },
    );
  };
  bot.command("dash", opsDash);

  bot.command("orders", async (ctx) => {
    if (!isAdmin(String(ctx.from!.id))) {
      await ctx.reply("⛔ Faqat administratorlar uchun.");
      return;
    }
    const list = await getLiveBookings();
    if (!list.length) {
      await ctx.reply("🚖 Hozir faol buyurtma yo'q.");
      return;
    }
    const rows = list
      .slice(0, 20)
      .map((b) => `${b.hasDriver ? "🚖" : "⏳"} ${esc(b.addressName)} — ${b.hasDriver ? esc(b.carNumber ?? "") : "<b>haydovchi yo'q</b>"} · +${formatNumber(b.cashback)}`);
    const noDriver = list.filter((b) => !b.hasDriver).length;
    await ctx.reply(
      `🚖 <b>Jonli buyurtmalar: ${list.length}</b>${noDriver ? ` · ⚠️ ${noDriver} haydovchisiz` : ""}\n\n${rows.join("\n")}`,
      { parse_mode: "HTML" },
    );
  });

  registerBooking(bot, mainMenu);

  // 🤖 AI-1 rules-first free text: runs AFTER booking's own text handler
  // (which next()s when no session is waiting). Buttons stay the main UX —
  // this just catches "bozorga taksi kerak" style messages.
  // V2 AI brain: a pending "schedule this ride?" offer per member (in-process, single-instance).
  const pendingSchedule = new Map<number, { addrId: number; name: string; runMs: number }>();
  bot.callbackQuery("bk:sched", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    const me = await getMe(String(ctx.from!.id));
    if (!me) return;
    const p = pendingSchedule.get(me.member.id);
    if (!p) {
      await ctx.reply("Reja muddati o'tdi — qaytadan yozing (masalan: «ertaga 8:00 ishxonaga»).");
      return;
    }
    pendingSchedule.delete(me.member.id);
    const { createScheduled } = await import("../services/scheduledService");
    const { fmtRideTime } = await import("../services/ai/concierge");
    const r = await createScheduled(me.member.id, p.addrId, p.name, new Date(p.runMs).toISOString());
    if (r.ok) {
      await ctx.reply(
        `✅ <b>Rejalashtirildi!</b>\n📍 ${p.name}\n⏰ ${fmtRideTime(new Date(p.runMs))}\n\nVaqti kelganda mashina avtomatik chaqiriladi. Bekor qilish: «📍 Buyurtmam».`,
        { parse_mode: "HTML" },
      );
    } else {
      const why: Record<string, string> = { too_soon: "kamida 15 daqiqa oldin bo'lsin", too_far: "7 kun ichida bo'lsin", too_many: "3 tadan ortiq reja bo'lmaydi", no_phone: "telefon ulanmagan", bad_time: "vaqt noto'g'ri" };
      await ctx.reply(`⚠️ Rejalashtirib bo'lmadi: ${why[r.reason ?? ""] ?? "xatolik"}.`);
    }
  });
  bot.on("message:text", async (ctx) => {
    const { parseIntent, aiSupport, resolveAddress } = await import("../services/ai/intent");
    const { featureOn } = await import("../services/featureFlags");
    const intent = parseIntent(ctx.message.text);
    if (intent.type === "faq") {
      await ctx.reply(intent.answer + "\n\n☎️ Operator: 1067", { reply_markup: undefined });
      return;
    }
    if (intent.type === "book") {
      const { InlineKeyboard } = await import("grammy");
      const aibrain = await featureOn("aibrain");
      const found = intent.addressQuery ? await resolveAddress(intent.addressQuery) : [];
      // V2: real conversational scheduling — "ertaga 8:00 ishxonaga" → confirm → createScheduled
      if (aibrain && intent.when === "later") {
        const { parseRideTime, fmtRideTime } = await import("../services/ai/concierge");
        const when = parseRideTime(ctx.message.text);
        const me = await getMe(String(ctx.from!.id));
        if (when && found.length && me) {
          pendingSchedule.set(me.member.id, { addrId: found[0]!.id, name: found[0]!.name, runMs: when.getTime() });
          const kb = new InlineKeyboard().text("✅ Ha, rejalashtir", "bk:sched").row().text("🚕 Hozir chaqirish", "bk:now");
          await ctx.reply(`🤖 <b>Rejali safar</b>\n📍 ${found[0]!.name}\n⏰ ${fmtRideTime(when)}\n\nShu vaqtga rejalashtiraymi?`, { parse_mode: "HTML", reply_markup: kb });
          return;
        }
      }
      const kb = new InlineKeyboard();
      for (const a of found) kb.text(`📍 ${a.name}`, `bk:addr:${a.id}`).row();
      kb.text("🚕 1-bosishda chaqirish", "bk:now");
      const later = intent.when === "later"
        ? aibrain
          ? `\n⏰ Vaqt va manzilni yozing — masalan: «ertaga 8:00 ishxonaga»`
          : `\n⏰ ${intent.timeText ?? "Keyinroqqa"} — rejali safar tez orada!`
        : "";
      await ctx.reply(`🚕 Taksi kerak shekilli!${later}\nQuyidan tanlang:`, { reply_markup: kb });
      return;
    }
    // not understood: try LLM support (disabled w/o keys), else gentle nudge
    const tu = await (await import("../db")).prisma.telegramUser.findUnique({ where: { id: String(ctx.from!.id) } });
    if (tu?.memberId) {
      const ans = await aiSupport(tu.memberId, ctx.message.text).catch(() => null);
      if (ans) {
        await ctx.reply(ans + "\n\n☎️ Operator: 1067");
        return;
      }
    }
    const meF = await getMe(String(ctx.from!.id)).catch(() => null);
    await ctx.reply(
      "🤔 <b>Tushunmadim.</b>\n📍 Manzilni yozing (masalan «Saripul bozorcha») yoki joylashuvingizni yuboring — darrov taksi chaqiraman.\nYoki «🚕 Taxi chaqirish» tugmasi · /start · ☎️ 1067",
      { parse_mode: "HTML", reply_markup: mainMenu(meF?.type === "driver") },
    );
  });
  return bot;
}

/** Congratulate members on badges earned during the last sync. */
export async function notifyNewAchievements(bot: Bot): Promise<void> {
  const pending = await prisma.memberAchievement.findMany({
    where: { notified: false, member: { telegramUser: { isNot: null } } },
    include: { member: { include: { telegramUser: true } } },
  });

  for (const a of pending) {
    const chatId = a.member.telegramUser?.id;
    const text = renderBadgeUnlocked(a.code);
    if (chatId && text) {
      try {
        await bot.api.sendMessage(chatId, text, { parse_mode: "HTML" });
      } catch (e) {
        console.error("[bot] failed to notify", chatId, e);
      }
    }
    await prisma.memberAchievement.update({ where: { id: a.id }, data: { notified: true } });
  }
}

/** Push "+X so'm" messages for cashback that grew during the last refresh. */
export async function notifyCashback(bot: Bot, deltas: CashbackDelta[]): Promise<void> {
  for (const d of deltas) {
    try {
      await bot.api.sendMessage(d.telegramId, renderEarnPush(d.delta, d.total, d.type), { parse_mode: "HTML" });
    } catch (e) {
      console.error("[bot] cashback notify failed", d.telegramId, e);
    }
  }
}

export async function setupBotCommands(bot: Bot): Promise<void> {
  await bot.api.setMyCommands([
    { command: "start", description: "Botni boshlash / profil" },
    { command: "book", description: "🚕 Taxi chaqirish" },
    { command: "status", description: "📍 Buyurtmam holati" },
    { command: "daily", description: "🔥 Kunlik bonus" },
    { command: "wheel", description: "🎡 Omad g'ildiragi" },
    { command: "baraban", description: "🎰 Safar barabani (yutuq)" },
    { command: "missions", description: "🎯 Vazifalar (mukofot)" },
    { command: "invite", description: "👥 Do'st taklif qilish" },
    { command: "narx", description: "🚖 Narx va cashback" },
    { command: "rahmat", description: "🙏 Haydovchiga choychaqa" },
    { command: "haydovchi", description: "🚖 Mashina raqami bo'yicha haydovchiga to'lash" },
    { command: "topshiriq", description: "🎯 Haydovchi topshiriqlari" },
    { command: "me", description: "💰 Hamyon / profil" },
    { command: "account", description: "👤 Hisobim & sozlamalar" },
    { command: "top", description: "Reyting" },
    { command: "help", description: "ℹ️ Yordam" },
  ]);

  // Point the persistent Menu Button at the VERSIONED app URL. The old menu button had no
  // ?v= → Telegram cached it forever → users opened the stale (UZ-blocked-map) build. This
  // syncs to EVERY user automatically (no /start needed); re-runs each boot with the live hash.
  await refreshWebAppVer();
  if (canWebApp) {
    try {
      await bot.api.setChatMenuButton({ menu_button: { type: "web_app", text: "Ilova", web_app: { url: webAppUrl() } } });
    } catch (e) {
      console.error("[bot] setChatMenuButton failed", e instanceof Error ? e.message : e);
    }
  }
}
