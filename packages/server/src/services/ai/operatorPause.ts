// 🆘 Operator escalation — a customer can ask for a human ("operator", "yordam kerak", "odam
// bilan gaplashtir") and the AI steps back for that ONE conversation so it doesn't keep
// guessing/looping while the owner replies through the admin panel's existing "Mijozlar chat"
// tab (ChatView + POST /api/admin/chat/reply — already works, no new admin-side code needed).
// AppState-backed, same ephemeral-flag pattern as mashina_fund/fundride:<id> — no schema change,
// no new poller (auto-expires on read).
import { prisma } from "../../db";

const DEFAULT_MINUTES = 60;

export async function pauseAiForOperator(telegramId: string, minutes = DEFAULT_MINUTES): Promise<void> {
  const until = new Date(Date.now() + minutes * 60_000).toISOString();
  await prisma.appState.upsert({
    where: { key: `oprpause:${telegramId}` },
    update: { value: until },
    create: { key: `oprpause:${telegramId}`, value: until },
  });
}

export async function isAiPausedForOperator(telegramId: string): Promise<boolean> {
  const row = await prisma.appState.findUnique({ where: { key: `oprpause:${telegramId}` } });
  if (!row) return false;
  return new Date(row.value).getTime() > Date.now();
}

// 🎧 Super Operator console: explicit "🤖 AI faol" resume button — the auto-expire above handles
// the customer-escalation case fine, but an operator ending a chat-console session early needs
// to hand the conversation straight back rather than wait out the remaining TTL.
export async function resumeAiForOperator(telegramId: string): Promise<void> {
  await prisma.appState.delete({ where: { key: `oprpause:${telegramId}` } }).catch(() => undefined);
}
