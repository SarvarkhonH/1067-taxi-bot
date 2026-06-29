// 📢 Owner broadcast: /elon → type the announcement → preview + confirm → sent to every linked user.
// Owner-only (not in the public command menu). Rate-limited (~22 msg/s) to stay under Telegram's flood
// limit; failures (users who blocked/deleted the bot) are counted, never fatal.
import { Bot, Context, InlineKeyboard } from "grammy";
import { prisma } from "../db";

const OWNER_TG = "6506297119";
const draft = new Map<string, string>(); // owner tg → "" (awaiting text) | the pending announcement

export function registerBroadcast(bot: Bot): void {
  bot.command("elon", async (ctx: Context) => {
    if (String(ctx.from!.id) !== OWNER_TG) return;
    draft.set(OWNER_TG, "");
    await ctx.reply(
      "📢 <b>E'lon (yangilik) yuborish</b>\n\nBarcha foydalanuvchilarga yuboriladigan xabarni yozing.\n<i>HTML mumkin: &lt;b&gt;qalin&lt;/b&gt;, emoji, havola.</i>\n\n❌ Bekor qilish: /bekor",
      { parse_mode: "HTML" },
    );
  });
  bot.command("bekor", async (ctx) => {
    if (String(ctx.from!.id) === OWNER_TG && draft.has(OWNER_TG)) {
      draft.delete(OWNER_TG);
      await ctx.reply("❌ E'lon bekor qilindi.");
    }
  });

  // capture the announcement text — owner only, only while a draft is awaiting; everyone else next()
  bot.on("message:text", async (ctx, next) => {
    const tg = String(ctx.from.id);
    if (tg !== OWNER_TG || draft.get(tg) !== "") return next();
    const text = ctx.message.text;
    if (text.startsWith("/")) return next(); // a command, not the announcement body
    draft.set(tg, text);
    const count = await prisma.telegramUser.count({ where: { memberId: { not: null } } });
    const kb = new InlineKeyboard().text(`📢 Yuborish (${count} kishi)`, "elon:send").row().text("❌ Bekor", "elon:cancel");
    await ctx.reply(`📢 <b>Ko'rib chiqing — quyidagi xabar ${count} kishiga yuboriladi:</b>\n\n━━━━━━\n${text}\n━━━━━━`, {
      parse_mode: "HTML",
      reply_markup: kb,
    });
  });

  bot.callbackQuery("elon:cancel", async (ctx) => {
    if (String(ctx.from.id) !== OWNER_TG) return;
    draft.delete(OWNER_TG);
    await ctx.answerCallbackQuery({ text: "Bekor qilindi" });
    await ctx.editMessageText("❌ E'lon bekor qilindi.").catch(() => undefined);
  });

  bot.callbackQuery("elon:send", async (ctx) => {
    if (String(ctx.from.id) !== OWNER_TG) return;
    const text = draft.get(OWNER_TG);
    if (!text) {
      await ctx.answerCallbackQuery({ text: "Matn topilmadi" });
      return;
    }
    draft.delete(OWNER_TG);
    await ctx.answerCallbackQuery({ text: "Fonda yuborilmoqda…" });
    const users = await prisma.telegramUser.findMany({ where: { memberId: { not: null } }, select: { id: true } });
    await ctx.editMessageText(`📤 <b>${users.length} kishiga yuborilmoqda…</b> (fonda — tugagach xabar beraman)`, { parse_mode: "HTML" }).catch(() => undefined);
    // Run the send loop in the BACKGROUND. It takes ~users/22 seconds; doing it inside the handler
    // blocked the grammY webhook (10s timeout → unhandledRejection). Detached, the handler returns now.
    void (async () => {
      let ok = 0;
      let fail = 0;
      for (let i = 0; i < users.length; i++) {
        try {
          await bot.api.sendMessage(users[i]!.id, text, { parse_mode: "HTML" });
          ok++;
        } catch {
          fail++;
        }
        if (i % 22 === 21) await new Promise((r) => setTimeout(r, 1000)); // ~22 msg/s, under Telegram's flood limit
      }
      await bot.api
        .sendMessage(OWNER_TG, `✅ <b>E'lon yuborildi</b>\n📬 Yetkazildi: <b>${ok}</b>\n${fail ? `❌ Yetmadi: <b>${fail}</b> (bloklagan/o'chirgan)` : ""}`, { parse_mode: "HTML" })
        .catch(() => undefined);
    })().catch((e) => console.error("[broadcast] failed", e));
  });
}
