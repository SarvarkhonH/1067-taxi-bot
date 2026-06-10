import { Bot, Context, InlineKeyboard, Keyboard } from "grammy";
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
import { dailyCheckIn, spinWheel, type CheckInResult, type WheelResult } from "../services/rewardService";
import { claimMission, getMissions } from "../services/missionService";
import { getBoxStatus, openBox } from "../services/boxService";
import { attachPendingReferral, completeReferral, getReferralInfo } from "../services/referralService";
import { getWeeklyBoard } from "../services/weeklyService";
import type { CashbackDelta } from "../sync/sync";
import { registerBooking } from "./booking";
import {
  renderBadgeUnlocked,
  renderEarnPush,
  renderLeaderboard,
  renderLinkPrompt,
  renderMissions,
  renderNotFound,
  renderProfile,
  renderReferral,
  renderReferralWin,
  renderTaken,
  renderWeeklyBlock,
  renderWelcome,
} from "./render";

const canWebApp = env.TELEGRAM_WEBAPP_URL.startsWith("https://");

function mainMenu(): Keyboard {
  const kb = new Keyboard()
    .text("🚕 Taxi chaqirish")
    .text("📍 Buyurtmam")
    .row()
    .text("🔥 Kunlik")
    .text("🎡 G'ildirak")
    .row()
    .text("🎯 Vazifalar")
    .text("👥 Do'st taklif")
    .row()
    .text("💰 Hisobim")
    .text("🏆 Reyting")
    .row()
    .text("🎖 Nishonlar");
  if (canWebApp) kb.row().webApp("🚀 Ilova", env.TELEGRAM_WEBAPP_URL);
  return kb.resized();
}

function contactKeyboard(): Keyboard {
  return new Keyboard().requestContact("📱 Raqamni ulashish").resized().oneTime();
}

function profileOf(src: { username?: string; first_name?: string; last_name?: string; language_code?: string }) {
  return { username: src.username, firstName: src.first_name, lastName: src.last_name, languageCode: src.language_code };
}

function renderCheckIn(r: CheckInResult): string {
  if (r.alreadyChecked) {
    let s = `🔥 <b>Streak: ${r.current} kun</b>\n\nBugun allaqachon belgilangansiz ✅\nErtaga yana keling — streak'ni uzmang!`;
    if (r.next) s += `\n\n🎯 ${r.next.day}-kunda: <b>+${formatNumber(r.next.reward)} coin</b>`;
    return s;
  }
  let s = `🔥 <b>Streak: ${r.current} kun!</b>\n`;
  if (r.rewardAmount > 0) {
    s += `\n🎉 <b>+${formatNumber(r.rewardAmount)} coin!</b>${r.rewardApplied ? " — hamyoningizga tushdi 🪙" : ""}`;
  } else {
    s += `\nDavom eting — har kun streak o'sadi 💪`;
  }
  if (r.next) s += `\n\n🎯 Keyingi mukofot: ${r.next.day}-kun → <b>+${formatNumber(r.next.reward)} coin</b>`;
  return s;
}

function renderWheel(r: WheelResult): string {
  const pool = `\n\n🎰 JACKPOT hozir: <b>${formatNumber(r.jackpot)} coin</b> — har spin uni oshiradi!`;
  if (r.insufficient) {
    return `🪙 Qayta aylantirish uchun <b>${formatNumber(r.respinCost)} coin</b> kerak.\n\nVazifalar va o'yinlar bilan coin to'plang! 🎯${pool}`;
  }
  if (r.alreadySpun) {
    return `🎡 Bugungi BEPUL spin ishlatilgan.\nYutuq: ${r.prize.emoji} <b>${esc(r.prize.label)}</b>\n\n🪙 ${formatNumber(r.respinCost)} coin'ga xohlagancha qayta aylantiring 👇${pool}`;
  }
  if (r.prize.label.startsWith("JACKPOT")) {
    return `🎰🎰🎰 <b>JACKPOT!!!</b> 🎰🎰🎰\n\n💥 <b>+${formatNumber(r.prize.amount)} coin</b>${r.applied ? " — hamyoningizga tushdi 🪙" : ""}!\n\nButun jamg'arma sizniki bo'ldi! 👑${pool}`;
  }
  if (r.prize.amount > 0) {
    return `🎉 ${r.prize.emoji} <b>${esc(r.prize.label)}!</b>\n\n+${formatNumber(r.prize.amount)} coin${r.applied ? " — hamyoningizga tushdi 🪙" : ""}!${r.paid ? "" : `\n\n🪙 ${formatNumber(r.respinCost)} coin'ga yana aylantiring 👇`}${pool}`;
  }
  return `${r.prize.emoji} <b>${esc(r.prize.label)}</b>\n\nBu safar omad kulmadi — yana urinib ko'ring! 🎡${pool}`;
}

function wheelKb(r: WheelResult): InlineKeyboard | undefined {
  if (r.insufficient) return undefined;
  return new InlineKeyboard().text(`🪙 ${formatNumber(r.respinCost)} — yana aylantirish`, "wheel:respin");
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
    const me = await getMe(id);
    if (me) {
      await ctx.reply(renderProfile(me), { parse_mode: "HTML", reply_markup: mainMenu() });
    } else {
      await ctx.reply(renderWelcome(ctx.from!.first_name ?? "do'st"), { parse_mode: "HTML" });
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
      await ctx.reply(`✅ Bog'landi: <b>${res.fullName}</b> (${role})`, { parse_mode: "HTML" });
      // pay out a pending referral (this user joined via someone's invite)
      if (res.memberId) {
        const credit = await completeReferral(id, res.memberId).catch(() => null);
        if (credit) {
          await ctx
            .reply(`🎁 Do'st taklifi bo'yicha <b>+${formatNumber(credit.refereeReward)} so'm</b> sovg'a!`, { parse_mode: "HTML" })
            .catch(() => undefined);
          if (credit.referrerReward > 0) {
            await ctx.api
              .sendMessage(credit.referrerTelegramId, renderReferralWin(credit.referrerReward), { parse_mode: "HTML" })
              .catch(() => undefined);
          }
        }
      }
      if (me) await ctx.reply(renderProfile(me), { parse_mode: "HTML", reply_markup: mainMenu() });
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
    await ctx.reply(renderProfile(me), { parse_mode: "HTML", reply_markup: mainMenu() });
  };
  bot.hears("💰 Hisobim", showProfile);
  bot.command("me", showProfile);

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
    await ctx.api.editMessageText(msg.chat.id, msg.message_id, renderWheel(r), {
      parse_mode: "HTML",
      reply_markup: wheelKb(r),
    });
  };
  bot.hears("🎡 G'ildirak", spin);
  bot.command("wheel", spin);

  // unlimited coin respins — the "no limits" loop
  bot.callbackQuery("wheel:respin", async (ctx) => {
    const memberId = await getMemberId(String(ctx.from!.id));
    if (!memberId) {
      await ctx.answerCallbackQuery({ text: "Avval raqamingizni ulang 🙏", show_alert: true });
      return;
    }
    const r = await spinWheel(memberId, { respin: true });
    if (r.insufficient) {
      await ctx.answerCallbackQuery({ text: `Coin yetarli emas (kerak: ${formatNumber(r.respinCost)}) 🪙`, show_alert: true });
      return;
    }
    await ctx.answerCallbackQuery({
      text: r.prize.amount > 0 ? `${r.prize.emoji} +${formatNumber(r.prize.amount)} coin!` : `${r.prize.emoji} ${r.prize.label}`,
    });
    await ctx
      .editMessageText(renderWheel(r), { parse_mode: "HTML", reply_markup: wheelKb(r) })
      .catch(() => undefined);
  });

  bot.hears("🎖 Nishonlar", async (ctx) => {
    const me = await getMe(String(ctx.from!.id));
    if (!me) {
      await ctx.reply(renderLinkPrompt(), { parse_mode: "HTML", reply_markup: contactKeyboard() });
      return;
    }
    const lines = me.badges.map(
      (b) => `${b.earned ? b.emoji : "🔒"} <b>${b.name}</b> — ${b.earned ? "olingan ✅" : b.description}`,
    );
    const earned = me.badges.filter((b) => b.earned).length;
    await ctx.reply(`🎖 <b>Nishonlar</b> (${earned}/${me.badges.length})\n\n${lines.join("\n")}`, {
      parse_mode: "HTML",
      reply_markup: mainMenu(),
    });
  });

  // ─── missions / quests + mystery box ────────────────────────────────────────
  function claimKeyboard(
    m: Awaited<ReturnType<typeof getMissions>>,
    box: Awaited<ReturnType<typeof getBoxStatus>>,
  ): InlineKeyboard {
    const kb = new InlineKeyboard();
    [...m.daily, ...m.weekly]
      .filter((x) => x.claimable)
      .forEach((x) => kb.text(`🎁 ${x.emoji} +${formatNumber(x.reward)} coin`, `claim:${x.code}`).row());
    if (box.eligible && !box.opened) kb.text("🎁 BEPUL QUTINI OCHISH", "openbox").row();
    kb.text(`💎 Premium quti — ${formatNumber(box.premiumCost)} coin`, "openbox:premium").row();
    return kb;
  }

  const missionsView = async (memberId: number) => {
    const [m, box] = await Promise.all([getMissions(memberId), getBoxStatus(memberId)]);
    return { text: renderMissions(m, box), kb: claimKeyboard(m, box) };
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
  bot.hears("🎯 Vazifalar", showMissions);
  bot.command("missions", showMissions);

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
      await ctx.answerCallbackQuery({ text: `🎉 +${formatNumber(r.reward)} coin hamyoningizga tushdi!`, show_alert: true });
    } else if (r.reason === "claimed") {
      await ctx.answerCallbackQuery({ text: "Bu mukofot allaqachon olingan ✅" });
    } else {
      await ctx.answerCallbackQuery({ text: "Bu vazifa hali tugamagan 🎯" });
    }
    await refreshMissionsMessage(ctx, memberId);
  });

  bot.callbackQuery(/^openbox(:premium)?$/, async (ctx) => {
    const premium = !!ctx.match[1];
    const memberId = await getMemberId(String(ctx.from!.id));
    if (!memberId) {
      await ctx.answerCallbackQuery({ text: "Avval raqamingizni ulang 🙏", show_alert: true });
      return;
    }
    const r = await openBox(memberId, { premium });
    if (r.ok && r.prize) {
      await ctx.answerCallbackQuery({
        text: `🎁 ${r.prize.emoji} ${r.prize.label}! +${formatNumber(r.prize.amount)} coin hamyoningizga tushdi!`,
        show_alert: true,
      });
    } else if (r.reason === "insufficient") {
      await ctx.answerCallbackQuery({ text: "Coin yetarli emas 🪙 — vazifalar bilan to'plang!", show_alert: true });
    } else if (r.reason === "opened") {
      await ctx.answerCallbackQuery({ text: "Bugungi bepul quti ochilgan — 💎 Premium esa doim ochiq!" });
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
  bot.hears("👥 Do'st taklif", showReferral);
  bot.command("invite", showReferral);

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

  registerBooking(bot);
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
    { command: "me", description: "Mening hisobim" },
    { command: "top", description: "Reyting" },
  ]);
}
