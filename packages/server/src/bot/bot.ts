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
import { attachPendingReferral, completeReferral, getReferralInfo } from "../services/referralService";
import { getWeeklyBoard } from "../services/weeklyService";
import { getEconomy, getHealth, getLiveBookings } from "../services/adminOps";
import { getIntegrity } from "../services/reconciliation";
import type { CashbackDelta } from "../sync/sync";
import { registerBooking } from "./booking";
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

// Telegram caches the Mini App aggressively BY URL — the owner kept seeing stale builds.
// Versioning the URL (?v=<build>) makes Telegram treat each release as a brand-new app →
// guaranteed fresh load. BUMP this on every frontend deploy (matches App.tsx build marker).
const WEBAPP_BUILD = "v14";
function webAppUrl(go?: string): string {
  const u = env.TELEGRAM_WEBAPP_URL;
  return u + (u.includes("?") ? "&" : "?") + "v=" + WEBAPP_BUILD + (go ? "&go=" + go : "");
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
  const btn = (label: string, go: string): void => {
    if (canWebApp) kb.webApp(label, webAppUrl(go));
    else kb.text(label);
  };
  btn("🚕 Taxi chaqirish", "book");
  btn("📍 Buyurtmam", "book"); // booking3 shows the live order if one is active
  kb.row();
  btn("💰 Hamyon", "home");
  btn("🎁 Bonuslar", "rewards");
  btn("👥 Do'st", "friends");
  if (isDriver) {
    kb.row();
    btn("🚗 Haydovchi paneli", "driver");
  }
  if (canWebApp) kb.row().webApp("🚀 Ilova — Hamyon & Bonus", webAppUrl());
  return kb.resized();
}

function contactKeyboard(): Keyboard {
  return new Keyboard().requestContact("📱 Raqamni ulashish").resized().oneTime();
}

function profileOf(src: { username?: string; first_name?: string; last_name?: string; language_code?: string }) {
  return { username: src.username, firstName: src.first_name, lastName: src.last_name, languageCode: src.language_code };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function createBot(): Bot {
  const bot = new Bot(env.BOT_TOKEN);

  bot.catch((err) => console.error("[bot] error:", err.error));

  bot.command("start", async (ctx) => {
    const id = String(ctx.from!.id);
    await touchTelegramUser(id, profileOf(ctx.from!));
    // referral deep link: t.me/<bot>?start=ref_<code>
    const payload = (typeof ctx.match === "string" ? ctx.match : "").trim();
    if (payload.startsWith("ref_")) {
      await attachPendingReferral(id, payload.slice(4)).catch(() => undefined);
    }
    if (payload.startsWith("drv_")) {
      const { attachDriverRecruit } = await import("../services/recruitService");
      await attachDriverRecruit(id, Number(payload.slice(4))).catch(() => undefined);
    }
    const me = await getMe(id);
    if (me) {
      await ctx.reply(renderProfile(me), { parse_mode: "HTML", reply_markup: mainMenu(me.type === "driver") });
    } else {
      await ctx.reply(renderWelcome(ctx.from!.first_name ?? "do'st"), { parse_mode: "HTML", reply_markup: contactKeyboard() });
      await ctx.reply(renderLinkPrompt(), { parse_mode: "HTML", reply_markup: contactKeyboard() });
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
    if (contact.user_id && contact.user_id !== ctx.from!.id) {
      await ctx.reply("Iltimos, o'zingizning raqamingizni ulashing 🙏", { reply_markup: contactKeyboard() });
      return;
    }
    await touchTelegramUser(String(ctx.from!.id), profileOf(ctx.from!));
    await handleLink(ctx, contact.phone_number);
  });

  // manual phone entry (typing a number), handy for testing + users who won't share a contact
  bot.hears(/^\+?\d[\d\s\-()]{8,}$/, async (ctx) => {
    await touchTelegramUser(String(ctx.from!.id), profileOf(ctx.from!));
    await handleLink(ctx, ctx.message!.text!);
  });

  const showProfile = async (ctx: Context) => {
    const me = await getMe(String(ctx.from!.id));
    if (!me) {
      await ctx.reply(renderLinkPrompt(), { parse_mode: "HTML", reply_markup: contactKeyboard() });
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
      await ctx.reply(renderLinkPrompt(), { parse_mode: "HTML", reply_markup: contactKeyboard() });
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
      await ctx.reply(renderLinkPrompt(), { parse_mode: "HTML", reply_markup: contactKeyboard() });
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
      await ctx.reply(renderLinkPrompt(), { parse_mode: "HTML", reply_markup: contactKeyboard() });
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
      reply_markup: new InlineKeyboard().text("📷 Mening QR kodim", "drv:qr"),
    });
  };
  bot.hears("🚗 Haydovchi paneli", showDriverPanel);
  bot.command("driver", showDriverPanel);
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
        "🚖 <b>Mening QR kodim</b>\n\nBuni mijozga ko'rsating. U skanerlab botga kirsa va birinchi safarini qilsa — sizga <b>500 tanga</b>, so'ng har safaridan ulush tushadi.\n\n📅 Oyiga 15 ta yangi mijoz · 30 000 tangagacha.",
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
      await ctx.reply(renderLinkPrompt(), { parse_mode: "HTML", reply_markup: contactKeyboard() });
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
      await ctx.reply(renderLinkPrompt(), { parse_mode: "HTML", reply_markup: contactKeyboard() });
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
      await ctx.reply(renderLinkPrompt(), { parse_mode: "HTML", reply_markup: contactKeyboard() });
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

  bot.hears("🎖 Nishonlar", async (ctx) => {
    const me = await getMe(String(ctx.from!.id));
    if (!me) {
      await ctx.reply(renderLinkPrompt(), { parse_mode: "HTML", reply_markup: contactKeyboard() });
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
      await ctx.reply(renderLinkPrompt(), { parse_mode: "HTML", reply_markup: contactKeyboard() });
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

  registerBooking(bot);

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
      "🔄 <b>Menyu yangilandi</b> — eski tugmalar o'zgargan bo'lishi mumkin.\nPastdagi yangi tugmalardan foydalaning yoki /start bosing. ☎️ Operator: 1067",
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
    { command: "missions", description: "🎯 Vazifalar (mukofot)" },
    { command: "invite", description: "👥 Do'st taklif qilish" },
    { command: "narx", description: "🚖 Narx va cashback" },
    { command: "me", description: "💰 Hamyon / profil" },
    { command: "account", description: "👤 Hisobim & sozlamalar" },
    { command: "top", description: "Reyting" },
    { command: "help", description: "ℹ️ Yordam" },
  ]);
}
