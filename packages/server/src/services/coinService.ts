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
  // P0 (QA fleet): the audit insert + balance increment MUST be atomic. The old code
  // incremented coins then created the CoinTxn in two separate statements — two concurrent
  // callers with the same key both passed the findUnique guard, both incremented, and only
  // the second create hit the unique constraint (AFTER money already double-moved). Now both
  // run in ONE transaction with the unique-keyed insert FIRST, so a concurrent duplicate
  // aborts the whole tx before any coins move (P2002 → reported as a clean duplicate-skip).
  try {
    const member = await prisma.$transaction(async (tx) => {
      await tx.coinTxn.create({ data: { memberId, amount, kind, reason, idempotencyKey: idempotencyKey ?? null } });
      return tx.member.update({ where: { id: memberId }, data: { coins: { increment: amount } } });
    });
    return { ok: true, balance: member.coins };
  } catch (e) {
    if (idempotencyKey && (e as { code?: string } | null)?.code === "P2002") {
      return { ok: false, balance: await getCoins(memberId), skipped: "duplicate" };
    }
    throw e;
  }
}

/**
 * Grant coins TIED TO ONE RIDE, under the hard per-ride emission cap.
 * Every ride-bound mechanic (roll, wheel, garage, guess) must come through
 * here with an idempotency key ending `:<memberId>:<bookingId>` — the clamp
 * sums what this ride already paid and cuts the excess, so individually-valid
 * mechanics can never COMBINE over budget (plan: O'LCHOV VA BOSHQARUV §1).
 */
export async function grantRideCoins(
  memberId: number,
  bookingId: number,
  amount: number,
  kind: string,
  reason: string,
  keyPrefix: string,
): Promise<CoinResult & { clamped?: number }> {
  const { RIDE_EMISSION_CAP } = await import("@t1067/shared");
  amount = Math.floor(amount);
  const suffix = `:${memberId}:${bookingId}`;
  const paid = await prisma.coinTxn.aggregate({
    where: { memberId, amount: { gt: 0 }, idempotencyKey: { endsWith: suffix } },
    _sum: { amount: true },
  });
  const room = Math.max(0, RIDE_EMISSION_CAP - (paid._sum.amount ?? 0));
  const granted = Math.min(amount, room);
  if (granted <= 0) return { ok: false, balance: await getCoins(memberId), clamped: amount };
  const res = await grantCoins(memberId, granted, kind, reason, `${keyPrefix}${suffix}`);
  return granted < amount ? { ...res, clamped: amount - granted } : res;
}

/** Spend coins (sinks: stakes, purchases). Atomic — never goes negative. */
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
  if (!member || !member.phone || (member.type !== "client" && member.type !== "driver")) return fail("not_client");
  // RIDE-GATE (load-bearing): real money can only leave an account that has
  // generated real revenue. Without this, a fresh fake account farms coins
  // (referral/box/wheel/streak) and cashes out 1:1 — a farm of fakes drains the
  // whole daily budget. trips is synced from kas1067. Drivers are exempt: a
  // driver Member exists only if kas1067 has the driver (vetted identity), and
  // their kas write below still requires a client record for their phone (A1).
  if (member.type === "client" && (member.trips ?? 0) < 1) return fail("no_ride");
  // anomaly hold: freezes ONLY the cash door — coins stay spendable in-app,
  // so a falsely-flagged real user loses nothing while an admin reviews
  if (member.riskFlag) return fail("risk_hold");
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
    // T0.5 (AUDIT 3.3): refund is OWED — write the marker FIRST, so a crash or
    // PG drop between here and the grant can never strand the user's coins;
    // the periodic tick retries via the same idempotent key (max 5, then alert).
    const { pendingCreate, pendingResolve } = await import("./appStateUtil");
    const reqId = `${memberId}-${Date.now()}`;
    await pendingCreate("wd", reqId, { memberId, amount, note: kasMessage.slice(0, 80) });
    const refund = await grantCoins(memberId, amount, "withdraw_refund", "Aylantirish amalga oshmadi — tanga qaytarildi", `wdrefund:${reqId}`);
    if (refund.ok || refund.skipped === "duplicate") {
      await releaseWithdrawBudget(amount);
      await prisma.withdrawal.create({ data: { memberId, amount, kasApplied: false, kasMessage } }).catch(() => null);
      await pendingResolve("wd", reqId);
    }
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

  // T0.5 (AUDIT 3.8): kas bonus is ALREADY debited here — the coin grant is
  // owed. Marker + idempotent key: a crash before the grant gets retried by
  // the tick with the SAME key, so the user gets the coins exactly once.
  const { pendingCreate, pendingResolve } = await import("./appStateUtil");
  const reqId = `${memberId}-${Date.now()}`;
  await pendingCreate("tp", reqId, { memberId, amount });
  const g = await grantCoins(memberId, amount, "topup", `Cashback → tanga: ${amount}`, `topup:${reqId}`);
  if (g.ok || g.skipped === "duplicate") {
    // keep the denormalized kas balance roughly in sync
    await prisma.member.update({ where: { id: memberId }, data: { points: { decrement: amount } } }).catch(() => undefined);
    await pendingResolve("tp", reqId);
  }
  return { ok: true, amount, coinsLeft: g.balance, kasApplied: true };
}

/** T0.5 (AUDIT 3.3/3.8): periodik tick — osilib qolgan refund/topup markerlari.
 *  Har marker idempotent kalit bilan qayta uriladi; 5 urinishdan keyin stuck →
 *  egaga TG alert ("qo'lda ko'rish kerak"). */
export async function retryPendingMoney(): Promise<{ wd: number; tp: number; stuck: number }> {
  const { pendingScan, pendingResolve } = await import("./appStateUtil");
  const { alertAdmins } = await import("./economyService");
  let stuckN = 0;

  // bitta buzuq marker butun tickni yiqitmasin — har biri o'z try/catch ida
  const safeGrant = async (...args: Parameters<typeof grantCoins>): Promise<CoinResult> => {
    try {
      return await grantCoins(...args);
    } catch {
      return { ok: false, balance: 0 };
    }
  };
  const wd = await pendingScan("wd");
  for (const r of wd.retry) {
    const g = await safeGrant(r.payload.memberId, r.payload.amount, "withdraw_refund", "Aylantirish amalga oshmadi — tanga qaytarildi (retry)", `wdrefund:${r.id}`);
    if (g.ok || g.skipped === "duplicate") {
      const { releaseWithdrawBudget } = await import("./economyService");
      await releaseWithdrawBudget(r.payload.amount).catch(() => undefined);
      await prisma.withdrawal.create({ data: { memberId: r.payload.memberId, amount: r.payload.amount, kasApplied: false, kasMessage: "retry-refund" } }).catch(() => null);
      await pendingResolve("wd", r.id);
    }
  }
  const tp = await pendingScan("tp");
  for (const r of tp.retry) {
    const g = await safeGrant(r.payload.memberId, r.payload.amount, "topup", `Cashback → tanga: ${r.payload.amount} (retry)`, `topup:${r.id}`);
    if (g.ok || g.skipped === "duplicate") {
      await prisma.member.update({ where: { id: r.payload.memberId }, data: { points: { decrement: r.payload.amount } } }).catch(() => undefined);
      await pendingResolve("tp", r.id);
    }
  }
  const sp = await pendingScan("sellerpay");
  for (const r of sp.retry) {
    const g = await safeGrant(r.payload.memberId, r.payload.amount, r.payload.note === "trade" ? "trade_sale" : "item_sell", "Buyum sotildi (retry)", `sellerpay:${r.id}`);
    if (g.ok || g.skipped === "duplicate") await pendingResolve("sellerpay", r.id);
  }
  for (const st of [...wd.stuck, ...tp.stuck, ...sp.stuck]) {
    stuckN++;
    await alertAdmins(`🛑 Qo'lda ko'rish kerak: pending:${st.id} — member ${st.payload.memberId}, ${st.payload.amount} tanga, 5 urinish muvaffaqiyatsiz`).catch(() => undefined);
  }
  return { wd: wd.retry.length, tp: tp.retry.length, stuck: stuckN };
}
