// 🔔 AI eslatmalar (feature "airemind"). Create/list/cancel + sweep-driven delivery.
// Delivery rides the EXISTING adaptive booking sweep (index.ts calls deliverDueReminders
// each iteration — no new poller). Claim-before-send (updateMany pending→sent) is the
// proven race-safe idiom from dispatchScheduled. Delivery costs 0 LLM calls — the text
// is echoed verbatim from OUR row, never regenerated.
import type { Bot } from "grammy";
import { prisma } from "../../db";
import { featureOn } from "../featureFlags";

const MAX_PENDING = 5;
const MAX_PER_DAY = 10;
const MAX_TEXT = 120;
const MIN_AHEAD_MS = 5 * 60_000;
const MAX_AHEAD_MS = 30 * 86400_000;

export interface CreateResult {
  ok: boolean;
  id?: number;
  reason?: string; // user-facing Uzbek when !ok
}

export async function createReminder(
  memberId: number,
  telegramId: string,
  text: string,
  runAt: Date,
  kind: "oddiy" | "taksi" | "qarz" = "oddiy",
  actionJson?: string,
): Promise<CreateResult> {
  const clean = text.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
  if (!clean) return { ok: false, reason: "Eslatma matni bo'sh." };
  const ahead = runAt.getTime() - Date.now();
  if (ahead < MIN_AHEAD_MS) return { ok: false, reason: "Vaqt juda yaqin — kamida 5 daqiqa oldin bo'lsin." };
  if (ahead > MAX_AHEAD_MS) return { ok: false, reason: "30 kundan uzoqqa eslatma qo'yib bo'lmaydi." };
  const pending = await prisma.reminder.count({ where: { memberId, status: "pending" } });
  if (pending >= MAX_PENDING) return { ok: false, reason: `Sizda allaqachon ${MAX_PENDING} ta kutilayotgan eslatma bor — avval birini bekor qiling («eslatmalarim»).` };
  const day = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
  const { atomicIncrement } = await import("../appStateUtil");
  const made = await atomicIncrement(`rem_made:${memberId}:${day}`, 1);
  if (made > MAX_PER_DAY) return { ok: false, reason: "Bugungi eslatma limiti tugadi (10 ta/kun)." };
  const row = await prisma.reminder.create({
    data: { memberId, telegramId, text: clean, runAt, kind, actionJson },
  });
  return { ok: true, id: row.id };
}

export async function listPending(memberId: number): Promise<{ id: number; text: string; runAt: Date; kind: string }[]> {
  return prisma.reminder.findMany({
    where: { memberId, status: "pending" },
    orderBy: { runAt: "asc" },
    select: { id: true, text: true, runAt: true, kind: true },
    take: MAX_PENDING,
  });
}

/** Cancel by 1-based index into the pending list (how users refer to them). */
export async function cancelByIndex(memberId: number, idx: number): Promise<{ ok: boolean; text?: string }> {
  const rows = await listPending(memberId);
  const row = rows[idx - 1];
  if (!row) return { ok: false };
  const r = await prisma.reminder.updateMany({ where: { id: row.id, status: "pending" }, data: { status: "cancelled" } });
  return r.count === 1 ? { ok: true, text: row.text } : { ok: false };
}

export function tashkentLabel(runAt: Date): string {
  const w = new Date(runAt.getTime() + 5 * 3600_000);
  const days = ["yakshanba", "dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba"];
  return `${String(w.getUTCDate()).padStart(2, "0")}.${String(w.getUTCMonth() + 1).padStart(2, "0")} (${days[w.getUTCDay()]}) ${String(w.getUTCHours()).padStart(2, "0")}:${String(w.getUTCMinutes()).padStart(2, "0")}`;
}

/** Called from the adaptive sweep loop each iteration. One indexed query; ≤20 sends.
 *  Own try/catch per row — a reminder failure never blocks ride cards. */
export async function deliverDueReminders(bot: Bot): Promise<number> {
  if (!(await featureOn("airemind"))) return 0;
  const due = await prisma.reminder.findMany({
    where: { status: "pending", runAt: { lte: new Date() } },
    orderBy: { runAt: "asc" },
    take: 20,
  });
  let sent = 0;
  for (const r of due) {
    // claim first — a concurrent sweep/restart loses the race and skips
    const claim = await prisma.reminder.updateMany({ where: { id: r.id, status: "pending" }, data: { status: "sent", sentAt: new Date() } });
    if (claim.count !== 1) continue;
    try {
      const kb: { inline_keyboard: { text: string; callback_data: string }[][] } | undefined =
        r.kind === "taksi"
          ? { inline_keyboard: [[{ text: "🚕 Hozir chaqirish", callback_data: "bk:now" }], [{ text: "😴 15 daqiqadan keyin", callback_data: `rem:snooze:${r.id}` }]] }
          : undefined;
      await bot.api.sendMessage(r.telegramId, `🔔 <b>Eslatma!</b>\n${escapeHtml(r.text)}`, { parse_mode: "HTML", reply_markup: kb });
      sent++;
    } catch (e) {
      await prisma.reminder.updateMany({ where: { id: r.id }, data: { status: "failed" } }).catch(() => undefined);
      console.error(`[reminder] send failed id=${r.id}:`, e instanceof Error ? e.message : e);
    }
  }
  return sent;
}

/** rem:snooze — re-arm a just-fired taksi reminder 15 minutes out (new row, same caps skipped:
 *  snooze is bounded to one hop by only offering the button on delivery). */
export async function snooze(reminderId: number): Promise<Date | null> {
  const row = await prisma.reminder.findUnique({ where: { id: reminderId } });
  if (!row || row.status !== "sent") return null;
  const runAt = new Date(Date.now() + 15 * 60_000);
  await prisma.reminder.create({
    data: { memberId: row.memberId, telegramId: row.telegramId, text: row.text, runAt, kind: row.kind, actionJson: row.actionJson },
  });
  return runAt;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
