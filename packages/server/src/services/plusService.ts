// 💎 1067 Plus — coin-paid subscription (pure sink, burns liability).
// 9 990 tanga/30 days; first month FREE (trial); benefits are CAPPED:
// roll ×1.5 (extra ≤ +150/ride, ride-clamp 350 still rules) + garage +20%.
import { prisma } from "../db";
import { spendCoins } from "./coinService";

export const PLUS_PRICE = 9990;
export const PLUS_DAYS = 30;

export function isPlus(m: { plusUntil: Date | null }): boolean {
  return !!m.plusUntil && m.plusUntil.getTime() > Date.now();
}

export async function subscribePlus(
  memberId: number,
): Promise<{ ok: boolean; reason?: string; until?: string; free?: boolean; coins?: number }> {
  const m = await prisma.member.findUnique({ where: { id: memberId } });
  if (!m) return { ok: false, reason: "not_found" };
  if (isPlus(m)) return { ok: false, reason: "already_active" };
  if (m.trips < 1) return { ok: false, reason: "need_ride" };

  const hadBefore = await prisma.coinTxn.findFirst({ where: { memberId, kind: "plus_sub" } });
  const until = new Date(Date.now() + PLUS_DAYS * 86_400_000);

  if (!hadBefore && !m.plusUntil) {
    // first month free (Wolt+ trial pattern); marker txn of 0 so the trial is one-shot
    await prisma.$transaction([
      prisma.member.update({ where: { id: memberId }, data: { plusUntil: until } }),
      prisma.coinTxn.create({ data: { memberId, amount: 0, kind: "plus_sub", reason: "💎 1067 Plus — birinchi oy BEPUL" } }),
    ]);
    return { ok: true, until: until.toISOString(), free: true, coins: m.coins };
  }

  const spend = await spendCoins(memberId, PLUS_PRICE, "plus_sub", "💎 1067 Plus — 30 kun");
  if (!spend.ok) return { ok: false, reason: spend.skipped ?? "insufficient" };
  await prisma.member.update({ where: { id: memberId }, data: { plusUntil: until } });
  return { ok: true, until: until.toISOString(), free: false, coins: spend.balance };
}
