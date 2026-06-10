import { TOPUP_MIN, WITHDRAW_DAILY_CAP, WITHDRAW_MIN, type WalletResponse, type WithdrawResponse } from "@t1067/shared";
import { prisma } from "../db";
import { getDataSource } from "../kas";

// kas1067 has no compare-and-set, so serialize our own writes per phone to stop
// concurrent withdraw/top-up from racing (read-modify-write on the bonus).
const phoneLocks = new Map<string, Promise<unknown>>();
export function withPhoneLock<T>(phone: string, fn: () => Promise<T>): Promise<T> {
  const prev = phoneLocks.get(phone) ?? Promise.resolve();
  const run = prev.catch(() => undefined).then(fn);
  phoneLocks.set(
    phone,
    run.catch(() => undefined),
  );
  return run;
}

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
  amount = Math.floor(amount); // money is whole-coin only
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
  amount = Math.floor(amount);
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
    topupMin: TOPUP_MIN,
    canTopup: (member?.points ?? 0) >= TOPUP_MIN,
    txns: txns.map((t) => ({ amount: t.amount, kind: t.kind, reason: t.reason, at: t.createdAt.toISOString() })),
  };
}

/**
 * Convert coins to REAL so'm: deduct coins (atomic), write to kas1067 bonus
 * (1303). On kas failure the coins are refunded — money never disappears.
 * This is the ONLY point where real money leaves the system.
 */
export async function withdraw(memberId: number, amount: number): Promise<WithdrawResponse> {
  amount = Math.floor(amount);
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

  // revenue-linked GLOBAL budget: real money out can't outrun real taxi revenue
  const { consumeWithdrawBudget, releaseWithdrawBudget, alertAdmins } = await import("./economyService");
  if (!(await consumeWithdrawBudget(amount))) return fail("daily_cap"); // global budget exhausted (rides too low today)

  // optimistic deduct first — blocks double-spend races
  const spent = await spendCoins(memberId, amount, "withdraw", `So'mga aylantirish: ${amount}`);
  if (!spent.ok) {
    await releaseWithdrawBudget(amount);
    return fail("insufficient");
  }

  let kasApplied = false;
  let kasMessage = "";
  try {
    // per-phone lock: serialize our concurrent bonus writes (kas has no CAS)
    const res = await withPhoneLock(member.phone, () => getDataSource().addClientBonus(member.phone!, amount));
    kasApplied = res.ok;
    kasMessage = res.ok ? `${res.oldBonus} -> ${res.newBonus}` : `failed (status ${res.status})`;
  } catch (e) {
    kasMessage = e instanceof Error ? e.message : String(e);
  }

  if (!kasApplied) {
    // refund — the conversion did not happen
    await grantCoins(memberId, amount, "withdraw_refund", "Aylantirish amalga oshmadi — coin qaytarildi");
    await releaseWithdrawBudget(amount);
    await prisma.withdrawal.create({ data: { memberId, amount, kasApplied: false, kasMessage } });
    return { ok: false, reason: "kas_failed", amount, coinsLeft: await getCoins(memberId), kasApplied: false };
  }

  await prisma.withdrawal.create({ data: { memberId, amount, kasApplied: true, kasMessage } });
  await prisma.member.update({ where: { id: memberId }, data: { points: { increment: amount } } });
  // alert admins on every real-money-out (anomaly visibility)
  await alertAdmins(`💸 Withdraw: <b>${amount.toLocaleString("ru-RU")} so'm</b> — ${member.fullName} (today ${(today + amount).toLocaleString("ru-RU")})`).catch(() => undefined);
  return { ok: true, amount, coinsLeft: await getCoins(memberId), kasApplied: true };
}

/**
 * Reverse direction (user-requested two-way wallet): move the user's OWN kas
 * cashback bonus INTO their game-coin wallet so they can play. Deduct the kas
 * bonus first (per-phone lock); credit coins only if the kas write succeeded.
 */
export async function topUpFromBonus(memberId: number, amount: number): Promise<WithdrawResponse> {
  amount = Math.floor(amount);
  const member = await prisma.member.findUnique({ where: { id: memberId } });
  const fail = (reason: WithdrawResponse["reason"]): WithdrawResponse => ({
    ok: false,
    reason,
    amount,
    coinsLeft: member?.coins ?? 0,
    kasApplied: false,
  });
  if (!member || member.type !== "client" || !member.phone) return fail("not_client");
  if (amount < TOPUP_MIN) return fail("below_min");

  const phone = member.phone;
  const res = await withPhoneLock(phone, async () => {
    // re-read the live bonus inside the lock, then deduct
    const cur = (await getDataSource().fetchByPhone(phone)).find((m) => m.type === "client")?.points ?? null;
    if (cur === null || cur < amount) return { ok: false as const, reason: "insufficient" as const };
    const w = await getDataSource().setClientBonus(phone, cur - amount);
    return w.ok ? { ok: true as const } : { ok: false as const, reason: "kas_failed" as const };
  });

  if (!res.ok) return fail(res.reason === "insufficient" ? "insufficient" : "kas_failed");

  const g = await grantCoins(memberId, amount, "topup", `Cashback → coin: ${amount}`);
  // keep the denormalized kas balance roughly in sync
  await prisma.member.update({ where: { id: memberId }, data: { points: { decrement: amount } } }).catch(() => undefined);
  return { ok: true, amount, coinsLeft: g.balance, kasApplied: true };
}
