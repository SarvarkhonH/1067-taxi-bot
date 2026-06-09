import { Bot, Context, Keyboard } from "grammy";
import { formatNumber } from "@t1067/shared";
import { env } from "../env";
import { prisma } from "../db";
import {
  getAdminStats,
  getLeaderboard,
  getMe,
  isAdmin,
  linkByPhone,
  touchTelegramUser,
} from "../services/memberService";
import { dailyCheckIn, type CheckInResult } from "../services/rewardService";
import type { CashbackDelta } from "../sync/sync";
import { registerBooking } from "./booking";
import {
  renderBadgeUnlocked,
  renderEarnPush,
  renderLeaderboard,
  renderLinkPrompt,
  renderNotFound,
  renderProfile,
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
    .text("💰 Hisobim")
    .row()
    .text("🏆 Reyting")
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

export function createBot(): Bot {
  const bot = new Bot(env.BOT_TOKEN);

  bot.catch((err) => console.error("[bot] error:", err.error));

  bot.command("start", async (ctx) => {
    const id = String(ctx.from!.id);
    await touchTelegramUser(id, profileOf(ctx.from!));
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
    { command: "me", description: "Mening hisobim" },
    { command: "top", description: "Reyting" },
  ]);
}
