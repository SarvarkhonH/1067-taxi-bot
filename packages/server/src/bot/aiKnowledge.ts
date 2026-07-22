// 🧠 Koson AI jamoaviy bilim — owner side. A submitted fact fires a card to the OWNER's
// Telegram with [✅ Tasdiqlash] [❌ Rad]. knowledgeService owns the status logic (status
// guard = double-tap / race no-op). No bot-side session state → restart-proof. Approved
// facts feed the agent's system prompt (grounding). xizmatlar.ts clone, zero money.
import { Bot, InlineKeyboard } from "grammy";
import { moderate, type KnowledgeNotice } from "../services/ai/knowledgeService";

const OWNER_TG = "6506297119"; // same single source as cashout.ts / shop.ts / xizmatlar.ts

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** New submitted fact → owner card. Exported for the bot capture handler (bot-bound). */
export async function notifyOwnerKnowledge(bot: Bot, n: KnowledgeNotice): Promise<void> {
  const kb = new InlineKeyboard().text("✅ Tasdiqlash", `bilim:ok:${n.id}`).text("❌ Rad", `bilim:no:${n.id}`);
  await bot.api
    .sendMessage(
      OWNER_TG,
      `🧠 <b>YANGI AI-BILIM</b> #${n.id}\n\n` +
        `💬 «${esc(n.text)}»\n` +
        `👤 Yubordi: ${esc(n.submitterName)}\n\n` +
        `<i>✅ — Koson AI shu ma'lumotni biladi. ❌ — rad (bilimga qo'shilmaydi).</i>`,
      { parse_mode: "HTML", reply_markup: kb },
    )
    .catch(() => undefined);
}

/** Owner ✅/❌ moderation callbacks (callback-only → lazy-register is order-safe). */
export function registerAiKnowledge(bot: Bot): void {
  bot.callbackQuery(/^bilim:(ok|no):(\d+)$/, async (ctx) => {
    const byTg = String(ctx.from.id);
    if (byTg !== OWNER_TG) {
      await ctx.answerCallbackQuery("⛔ Faqat ega");
      return;
    }
    const approve = ctx.match[1] === "ok";
    const id = Number(ctx.match[2]);
    const r = await moderate(id, approve, byTg);
    await ctx.answerCallbackQuery(r.ok ? (approve ? "✅ Tasdiqlandi" : "❌ Rad etildi") : "Allaqachon hal qilingan");
    if (!r.ok) return;
    await ctx.editMessageText(`🧠 AI-bilim #${id} — ${approve ? "✅ TASDIQLANDI (AI biladi)" : "❌ RAD ETILDI"}\n\n💬 «${esc(r.text ?? "")}»`, { parse_mode: "HTML" }).catch(() => undefined);
    // tell the submitter (best-effort; they may have blocked the bot)
    if (r.submittedBy) {
      const msg = approve
        ? "✅ Yuborgan ma'lumotingiz tasdiqlandi — endi Koson AI uni biladi. Rahmat! 🧠"
        : "ℹ️ Yuborgan ma'lumotingiz bu safar qo'shilmadi. Baribir rahmat — yana yuborishingiz mumkin!";
      await bot.api.sendMessage(r.submittedBy, msg).catch(() => undefined);
    }
  });
}
