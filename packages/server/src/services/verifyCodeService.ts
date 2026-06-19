// 🔑 4-digit link code: lets a user link a DIFFERENT number (their 1067 number when it
// isn't their Telegram number) WITHOUT SMS. The proof is human: the customer calls 1067,
// support confirms their identity, an admin generates a code (admin panel / `/kod`), and the
// customer enters it in the bot. The code is the evidence 1067 verified them.
//
// Stored in AppState (no schema change): vcode:<phone9> = {code, exp, attempts}. Single-use,
// 1-hour TTL, max-attempts lock so the 4 digits can't be brute-forced.
import { prisma } from "../db";

const CODE_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_ATTEMPTS = 5;

function norm9(p: string): string {
  return p.replace(/\D/g, "").slice(-9);
}
function gen4(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}
function keyFor(phone: string): string {
  return `vcode:${norm9(phone)}`;
}

interface CodeRow {
  code: string;
  exp: number;
  attempts: number;
}

/** Admin issues a fresh 4-digit code for a phone (after verifying the caller by phone). */
export async function generateLinkCode(phone: string): Promise<string> {
  const code = gen4();
  const value = JSON.stringify({ code, exp: Date.now() + CODE_TTL_MS, attempts: 0 } satisfies CodeRow);
  const key = keyFor(phone);
  await prisma.appState.upsert({ where: { key }, create: { key, value }, update: { value } });
  return code;
}

/**
 * Verify a user-entered code for a phone. Single-use (deleted on success), 1h TTL,
 * locked after MAX_ATTEMPTS wrong tries so the 4 digits can't be guessed.
 */
export async function checkLinkCode(phone: string, code: string): Promise<{ ok: boolean; reason?: "no_code" | "expired" | "wrong" | "locked" }> {
  const key = keyFor(phone);
  const row = await prisma.appState.findUnique({ where: { key } });
  if (!row) return { ok: false, reason: "no_code" };
  let data: CodeRow;
  try {
    data = JSON.parse(row.value) as CodeRow;
  } catch {
    await prisma.appState.delete({ where: { key } }).catch(() => undefined);
    return { ok: false, reason: "no_code" };
  }
  if (Date.now() > data.exp) {
    await prisma.appState.delete({ where: { key } }).catch(() => undefined);
    return { ok: false, reason: "expired" };
  }
  if (data.attempts >= MAX_ATTEMPTS) {
    await prisma.appState.delete({ where: { key } }).catch(() => undefined);
    return { ok: false, reason: "locked" };
  }
  if (data.code !== code.trim()) {
    data.attempts += 1;
    await prisma.appState.update({ where: { key }, data: { value: JSON.stringify(data) } }).catch(() => undefined);
    return { ok: false, reason: data.attempts >= MAX_ATTEMPTS ? "locked" : "wrong" };
  }
  await prisma.appState.delete({ where: { key } }).catch(() => undefined); // single-use
  return { ok: true };
}
