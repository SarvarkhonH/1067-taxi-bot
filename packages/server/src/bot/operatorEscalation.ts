// 🆘 Operator escalation — owner-side alert. A customer asked for a human (keyword-triggered,
// see intent.ts's looksLikeOperatorRequest) → AI pauses for that conversation (operatorPause.ts)
// and the owner gets pinged here. The owner replies through the EXISTING admin "Mijozlar chat"
// tab (ChatView + POST /api/admin/chat/reply) — no new reply path needed, this file only alerts.
import { Bot } from "grammy";

const OWNER_TG = "6506297119"; // same single source as aiKnowledge.ts / cashout.ts / shop.ts

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function notifyOwnerOperatorRequest(bot: Bot, name: string, telegramId: string, lastMessage: string): Promise<void> {
  await bot.api
    .sendMessage(
      OWNER_TG,
      `🆘 <b>OPERATOR SO'RALDI</b>\n\n` +
        `👤 ${esc(name)} (tg=${esc(telegramId)})\n` +
        `💬 «${esc(lastMessage.slice(0, 300))}»\n\n` +
        `<i>AI shu suhbat uchun 1 soatga to'xtatildi — admin panel → «Mijozlar chat»dan javob bering.</i>`,
      { parse_mode: "HTML" },
    )
    .catch(() => undefined);
}
