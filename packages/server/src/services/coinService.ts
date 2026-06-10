import { WITHDRAW_DAILY_CAP, WITHDRAW_MIN, type WalletResponse, type WithdrawResponse } from "@t1067/shared";
import { prisma } from "../db";
import { getDataSource } from "../kas";

export interface CoinResult {
  ok: boolean;
  balance: number;
  skipped?: "duplicate" | "insufficient";
}

/** Earn coins (game currency). Idempotent via key; NO caps — coins are internal. */
export async function grantCoins(
  memberId: number,
  amount: number,
  kind: string,
  reason: string,
  idempotencyKey?: string,
): Promise<CoinResult> {
  if (amount <= 0) return { ok: false, balance: await getCoins(memberId) };
  if (idempotencyKey) {
    const existing = await prisma.coinTxn.findUnique({ where: { idempotencyKey } });
    if (existing) return { ok: false, balance: await getCoins(memberId), skipped: "duplicate" };
  }
  const member = await prisma.member.update({
    where: { id: memberId },
    data: { coins: { increment: amount } },
  });
  await prisma.coinTxn.create({
    data: { memberId, amount, kind, reason, idempotencyKey: idempotencyKey ?? null },
  });
  return { ok: true, balance: member.coins };
}

/** Spend coins (sinks: respins, premium boxes, stakes, upgrades). Atomic — never goes negative. */
export async function spendCoins(memberId: number, amount: number, kind: string, reason: string): Promise<CoinResult> {
  if (amount <= 0) return { ok: false, balance: await getCoins(memberId) };
  const res = await prisma.member.updateMany({
    where: { id: memberId, coins: { gte: amount } },
    data: { coins: { decrement: amount } },
  });
  if (res.count === 0) return { ok: false, balance: await getCoins(memberId), skipped: "insufficient" };
  await prisma.coinTxn.create({ data: { memberId, amount: -amount, kind, reason } });
  return { ok: true, balance: await getCoins(memberId) };
}

export async function getCoins(memberId: number): Promise<number> {
  const m = await prisma.member.findUnique({ where: { id: memberId }, select: { coins: true } });
  return m?.coins ?? 0;
}

async function withdrawnToday(memberId: number): Promise<number> {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const agg = await prisma.withdrawal.aggregate({
    where: { memberId, createdAt: { gte: since }, kasApplied: true },
    _sum: { amount: true },
  });
  return agg._sum.amount ?? 0;
}

export async function getWallet(memberId: number): Promise<WalletResponse> {
  const [member, txns, today] = await Promise.all([
    prisma.member.findUnique({ where: { id: memberId }, select: { coins: true, points: true } }),
    prisma.coinTxn.findMany({ where: { memberId }, orderBy: { createdAt: "desc" }, take: 20 }),
    withdrawnToday(memberId),
  ]);
  const coins = member?.coins ?? 0;
  return {
    coins,
    cashback: member?.points ?? 0,
    withdrawnToday: today,
    withdrawMin: WITHDRAW_MIN,
    withdrawDailyCap: WITHDRAW_DAILY_CAP,
    canWithdraw: coins >= WITHDRAW_MIN && today < WITHDRAW_DAILY_CAP,
    txns: txns.map((t) => ({ amount: t.amount, kind: t.kind, reason: t.reason, at: t.createdAt.toISOString() })),
  };
}

/**
 * Convert coins to REAL so'm: deduct coins (atomic), write to kas1067 bonus
 * (1303). On kas failure the coins are refunded — money never disappears.
 * This is the ONLY point where real money leaves the system.
 */
export async function withdraw(memberId: number, amount: number): Promise<WithdrawResponse> {
  const member = await prisma.member.findUnique({ where: { id: memberId } });
  const fail = (reason: WithdrawResponse["reason"]): WithdrawResponse => ({
    ok: false,
    reason,
    amount,
    coinsLeft: member?.coins ?? 0,
    kasApplied: false,
  });
  if (!member || member.type !== "client" || !member.phone) return fail("not_client");
  if (amount < WITHDRAW_MIN) return fail("below_min");
  const today = await withdrawnToday(memberId);
  if (today + amount > WITHDRAW_DAILY_CAP) return fail("daily_cap");

  // optimistic deduct first — blocks double-spend races
  const spent = await spendCoins(memberId, amount, "withdraw", `So'mga aylantirish: ${amount}`);
  if (!spent.ok) return fail("insufficient");

  let kasApplied = false;
  let kasMessage = "";
  try {
    const res = await getDataSource().addClientBonus(member.phone, amount);
    kasApplied = res.ok;
    kasMessage = res.ok ? `${res.oldBonus} -> ${res.newBonus}` : `failed (status ${res.status})`;
  } catch (e) {
    kasMessage = e instanceof Error ? e.message : String(e);
  }

  if (!kasApplied) {
    // refund — the conversion did not happen
    await grantCoins(memberId, amount, "withdraw_refund", "Aylantirish amalga oshmadi — coin qaytarildi");
    await prisma.withdrawal.create({ data: { memberId, amount, kasApplied: false, kasMessage } });
    return { ok: false, reason: "kas_failed", amount, coinsLeft: await getCoins(memberId), kasApplied: false };
  }

  await prisma.withdrawal.create({ data: { memberId, amount, kasApplied: true, kasMessage } });
  await prisma.member.update({ where: { id: memberId }, data: { points: { increment: amount } } });
  return { ok: true, amount, coinsLeft: await getCoins(memberId), kasApplied: true };
}
