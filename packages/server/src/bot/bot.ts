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
import { attachPendingReferral, completeReferral, getReferralInfo } from "../services/referralService";
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
    if (r.next) s += `\n\n🎯 ${r.next.day}-kunda: <b>+${formatNumber(r.next.reward)} so'm</b>`;
    return s;
  }
  let s = `🔥 <b>Streak: ${r.current} kun!</b>\n`;
  if (r.rewardAmount > 0) {
    s += `\n🎉 <b>+${formatNumber(r.rewardAmount)} so'm cashback!</b>${r.rewardApplied ? " — hisobingizga qo'shildi 💰" : ""}`;
  } else {
    s += `\nDavom eting — har kun streak o'sadi 💪`;
  }
  if (r.next) s += `\n\n🎯 Keyingi mukofot: ${r.next.day}-kun → <b>+${formatNumber(r.next.reward)} so'm</b>`;
  return s;
}

function renderWheel(r: WheelResult): string {
  if (r.alreadySpun) {
    return `🎡 Bugun allaqachon aylantirdingiz!\nYutuq: ${r.prize.emoji} <b>${esc(r.prize.label)}</b>\n\nErtaga yana keling 🌙`;
  }
  if (r.prize.amount > 0) {
    return `🎉 ${r.prize.emoji} <b>${esc(r.prize.label)}!</b>\n\n+${formatNumber(r.prize.amount)} so'm cashback${r.applied ? " — hisobingizga qo'shildi 💰" : ""}!\n\nErtaga yana aylantiring 🎡`;
  }
  return `${r.prize.emoji} <b>${esc(r.prize.label)}</b>\n\nBu safar omad kulmadi — ertaga yana urinib ko'ring! 🎡`;
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
    const lb = await getLeaderboard(me.type, id);
    await ctx.reply(renderLeaderboard(lb), { parse_mode: "HTML", reply_markup: mainMenu() });
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
  bot.hears("🎡 G'ildirak", spin);
  bot.command("wheel", spin);

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

  // ─── missions / quests ──────────────────────────────────────────────────────
  function claimKeyboard(m: Awaited<ReturnType<typeof getMissions>>): InlineKeyboard {
    const kb = new InlineKeyboard();
    [...m.daily, ...m.weekly]
      .filter((x) => x.claimable)
      .forEach((x) => kb.text(`🎁 ${x.emoji} +${formatNumber(x.reward)} so'm`, `claim:${x.code}`).row());
    return kb;
  }

  const showMissions = async (ctx: Context) => {
    const memberId = await getMemberId(String(ctx.from!.id));
    if (!memberId) {
      await ctx.reply(renderLinkPrompt(), { parse_mode: "HTML", reply_markup: contactKeyboard() });
      return;
    }
    const m = await getMissions(memberId);
    const kb = claimKeyboard(m);
    await ctx.reply(renderMissions(m), {
      parse_mode: "HTML",
      reply_markup: kb.inline_keyboard.length ? kb : mainMenu(),
    });
  };
  bot.hears("🎯 Vazifalar", showMissions);
  bot.command("missions", showMissions);

  bot.callbackQuery(/^claim:(.+)$/, async (ctx) => {
    const code = ctx.match[1]!;
    const memberId = await getMemberId(String(ctx.from!.id));
    if (!memberId) {
      await ctx.answerCallbackQuery({ text: "Avval raqamingizni ulang 🙏", show_alert: true });
      return;
    }
    const r = await claimMission(memberId, code);
    if (r.ok) {
      await ctx.answerCallbackQuery({ text: `🎉 +${formatNumber(r.reward)} so'm hisobingizga qo'shildi!`, show_alert: true });
    } else if (r.reason === "claimed") {
      await ctx.answerCallbackQuery({ text: "Bu mukofot allaqachon olingan ✅" });
    } else {
      await ctx.answerCallbackQuery({ text: "Bu vazifa hali tugamagan 🎯" });
    }
    const m = await getMissions(memberId);
    const kb = claimKeyboard(m);
    await ctx
      .editMessageText(renderMissions(m), { parse_mode: "HTML", reply_markup: kb.inline_keyboard.length ? kb : undefined })
      .catch(() => undefined);
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
