import { coreDriverIdFromKasId, MIN_RIDES_FOR_PAID, TOPUP_MIN, WITHDRAW_DAILY_CAP, WITHDRAW_MIN, type WalletResponse, type WithdrawResponse } from "@t1067/shared";
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

// P0 (QA fleet): serialize ride-grants per member so the grantRideCoins <=CAP clamp can't be
// raced — two mechanics on the same ride both read the same `paid`, both pass the room check,
// and combine over the cap. Single-instance (Render) in-process lock, same pattern as withPhoneLock.
const memberLocks = new Map<number, Promise<unknown>>();
export function withMemberLock<T>(memberId: number, fn: () => Promise<T>): Promise<T> {
  const prev = memberLocks.get(memberId) ?? Promise.resolve();
  const run = prev.catch(() => undefined).then(fn);
  memberLocks.set(memberId, run.catch(() => undefined));
  return run;
}

export interface CoinResult {
  ok: boolean;
  balance: number;
  skipped?: "duplicate" | "insufficient";
}

// reyting = tangalar: these positive-grant kinds are NOT "earned" (received transfers, the
// weekly prize itself, top-up conversion, admin) → excluded from the weekly tanga leaderboard.
// `oyin_convert`: mavsum yakunida BIR MARTA to'lanadigan katta summa (max 500). U haftalik
// reytingga tushsa butun mavsum bo'yi yig'ilgan ball BITTA haftaning hisobiga kirib, o'sha
// haftaning sovrinini ham yeb ketardi — ya'ni bitta yutuq ikki marta to'lanardi.
// `shop_refund`: a rejected order's refund is NOT "earned" — must not inflate the weekly board.
// `kas_cashback`: the one-off 2026-09-17 conversion of a passenger's kas1067 cashback into tanga —
// money they already had, not earned this week.
const REYTING_EXCLUDE = new Set(["transfer_in", "tip_in", "weekly", "manual", "topup", "admin_coin", "shop_refund", "oyin_convert", "kas_cashback"]);

/** Earn coins (game currency). Idempotent via key; NO caps — coins are internal. */
export async function grantCoins(
  memberId: number,
  amount: number,
  kind: string,
  reason: string,
  idempotencyKey?: string,
  bookingId?: number, // perf audit B4: ride-bound grants stamp this so the clamp reads it via index
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
      await tx.coinTxn.create({ data: { memberId, amount, kind, reason, idempotencyKey: idempotencyKey ?? null, bookingId: bookingId ?? null } });
      return tx.member.update({ where: { id: memberId }, data: { coins: { increment: amount } } });
    });
    // v3 (reyting = tangalar): EARNED tanga feeds the weekly leaderboard (best-effort, off the hot path)
    if (!REYTING_EXCLUDE.has(kind)) void import("./weeklyService").then((w) => w.addWeeklyTanga(memberId, amount)).catch(() => undefined);
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
  // serialized per member so the aggregate(paid)→grant read-then-write can't be raced over the cap
  return withMemberLock(memberId, async () => {
    const { RIDE_EMISSION_CAP } = await import("@t1067/shared");
    amount = Math.floor(amount);
    const suffix = `:${memberId}:${bookingId}`;
    // perf audit B4: sum THIS ride's prior emission via the indexed bookingId column (was an
    // unindexed endsWith suffix scan of the whole member ledger, run under the lock on every faucet).
    // The grant still carries the `:memberId:bookingId` idempotency key AND stamps bookingId — so a
    // backfilled/new row is found by the fast path; historical un-backfilled rows (bookingId=null)
    // are covered by the OR fallback until the one-shot backfill lands.
    const paid = await prisma.coinTxn.aggregate({
      where: { memberId, amount: { gt: 0 }, OR: [{ bookingId }, { bookingId: null, idempotencyKey: { endsWith: suffix } }] },
      _sum: { amount: true },
    });
    const room = Math.max(0, RIDE_EMISSION_CAP - (paid._sum.amount ?? 0));
    const granted = Math.min(amount, room);
    if (granted <= 0) return { ok: false, balance: await getCoins(memberId), clamped: amount };
    const res = await grantCoins(memberId, granted, kind, reason, `${keyPrefix}${suffix}`, bookingId);
    return granted < amount ? { ...res, clamped: amount - granted } : res;
  });
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

/**
 * Spend coins IDEMPOTENTLY (sinks tied to a specific action: market buy /
 * acquire / repair task). The unique idempotencyKey turns a double-tap or retry
 * into a no-op instead of a double-debit (plain spendCoins has no key → debits
 * twice). Atomic: the balance check + decrement + ledger insert run in ONE
 * transaction, so a crash between them rolls back both (audit B1/B4 pattern).
 */
export async function spendCoinsIdempotent(
  memberId: number,
  amount: number,
  kind: string,
  reason: string,
  idempotencyKey: string,
): Promise<CoinResult> {
  amount = Math.floor(amount);
  if (amount <= 0) return { ok: false, balance: await getCoins(memberId) };
  return withMemberLock(memberId, async () => {
    const existing = await prisma.coinTxn.findUnique({ where: { idempotencyKey } });
    if (existing) return { ok: true, balance: await getCoins(memberId), skipped: "duplicate" };
    try {
      const r = await prisma.$transaction(async (tx) => {
        const upd = await tx.member.updateMany({
          where: { id: memberId, coins: { gte: amount } },
          data: { coins: { decrement: amount } },
        });
        if (upd.count === 0) return { ok: false as const, skipped: "insufficient" as const };
        await tx.coinTxn.create({ data: { memberId, amount: -amount, kind, reason, idempotencyKey } });
        return { ok: true as const, skipped: undefined };
      });
      return { ...r, balance: await getCoins(memberId) };
    } catch (e) {
      // concurrent duplicate raced past the findUnique guard → unique constraint catches it
      if ((e as { code?: string } | null)?.code === "P2002") {
        return { ok: true, balance: await getCoins(memberId), skipped: "duplicate" };
      }
      throw e;
    }
  });
}

export async function getCoins(memberId: number): Promise<number> {
  const m = await prisma.member.findUnique({ where: { id: memberId }, select: { coins: true } });
  return m?.coins ?? 0;
}

/** Owner-tunable withdraw limits (admin panel «Naqd fond» knobs) with the shipped constants as
 *  defaults — so the owner adjusts money policy WITHOUT code or env access. */
async function withdrawLimits(): Promise<{ min: number; dailyCap: number }> {
  try {
    const { getBonusEcon } = await import("./bonusConfig");
    const econ = await getBonusEcon();
    return {
      min: Number.isFinite(econ.wdMin) ? econ.wdMin! : WITHDRAW_MIN,
      dailyCap: Number.isFinite(econ.wdDailyCapUser) ? econ.wdDailyCapUser! : WITHDRAW_DAILY_CAP,
    };
  } catch {
    return { min: WITHDRAW_MIN, dailyCap: WITHDRAW_DAILY_CAP };
  }
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
    prisma.member.findUnique({ where: { id: memberId }, select: { coins: true, points: true, type: true } }),
    prisma.coinTxn.findMany({ where: { memberId }, orderBy: { createdAt: "desc" }, take: 20 }),
    withdrawnToday(memberId),
  ]);
  const coins = member?.coins ?? 0;
  // live commission % (0 unless the "komissiya" flag is on) — lets the Mini App preview the fee
  const { featureOn } = await import("./featureFlags");
  let commissionPct = 0;
  if (await featureOn("komissiya")) {
    const { getTransferEcon } = await import("./transferService");
    commissionPct = (await getTransferEcon()).commissionPct ?? 0;
  }
  const limits = await withdrawLimits();
  return {
    coins,
    cashback: member?.points ?? 0,
    withdrawnToday: today,
    withdrawMin: limits.min,
    withdrawDailyCap: limits.dailyCap,
    // Only DRIVERS turn tanga into so'm (their balance in the taxi core). The passenger so'm wallet
    // and its cashback → tanga top-up lived in kas1067 and were removed with it on 2026-09-17.
    canWithdraw: member?.type === "driver" && coins >= limits.min && today < limits.dailyCap,
    isClient: member?.type === "client",
    topupMin: TOPUP_MIN,
    canTopup: false,
    commissionPct,
    txns: txns.map((t) => ({ amount: t.amount, kind: t.kind, reason: t.reason, at: t.createdAt.toISOString() })),
  };
}

/**
 * Convert a DRIVER's tanga to REAL so'm on their balance in the taxi core: deduct tanga
 * (atomic), pay into the core with an idempotency key. Refused → tanga refunded; no answer →
 * held for review (the money may have moved). This is the ONLY point where real money leaves
 * the system.
 *
 * Passengers cannot withdraw any more: their so'm wallet lived inside kas1067, and the owner
 * decided on 2026-09-17 that it goes away with it — tanga stays spendable in-app.
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
  if (member?.type === "client") return fail("drivers_only");
  if (!member || member.type !== "driver") return fail("not_client");
  // A driver Member exists only for a driver the taxi core knows (vetted identity); the plate is
  // what names their balance there.
  if (!member.carNumber) return fail("not_client");
  // anomaly hold: freezes ONLY the cash door — coins stay spendable in-app,
  // so a falsely-flagged real user loses nothing while an admin reviews
  if (member.riskFlag) return fail("risk_hold");
  const limits = await withdrawLimits(); // owner-tunable (admin «Naqd fond» knobs)
  if (amount < limits.min) return fail("below_min");
  // P0 (QA fleet): serialize per member — the cap check + budget + spend + write + row-create
  // must run atomically per member, else two concurrent withdrawals both read withdrawnToday=0
  // and both blow past the daily cap (real money out 2x). Same in-process lock as grantRideCoins.
  return withMemberLock(memberId, async () => {
    const { consumeWithdrawBudget, releaseWithdrawBudget, alertAdmins } = await import("./economyService");
    const { pendingCreate, pendingResolve } = await import("./appStateUtil");

    // An unresolved "sent" marker = a previous withdraw's outcome is UNKNOWN (no answer came back).
    // The cash door stays closed for this member until an admin confirms what the core did
    // (boot alert lists the marker; clearPending.ts releases it).
    const stale = await prisma.appState.findFirst({ where: { key: { startsWith: `pending:wdsent:m${memberId}-` } }, select: { key: true } });
    if (stale) return fail("pending_review");

    const today = await withdrawnToday(memberId);
    if (today + amount > limits.dailyCap) return fail("daily_cap");

    // revenue-linked GLOBAL budget: real money out can't outrun real taxi revenue. fundLeft lets
    // the UI say exactly how much can still be withdrawn right now.
    if (!(await consumeWithdrawBudget(amount))) {
      const { getWithdrawBudget } = await import("./economyService");
      const b = await getWithdrawBudget().catch(() => null);
      return { ok: false, reason: "fund_low", amount, coinsLeft: member.coins, kasApplied: false, fundLeft: Math.max(0, Math.floor(b?.remaining ?? 0)) };
    }

    // optimistic deduct first — blocks double-spend races
    const spent = await spendCoins(memberId, amount, "withdraw", `So'mga aylantirish: ${amount}`);
    if (!spent.ok) {
      await releaseWithdrawBudget(amount);
      return fail("insufficient");
    }

    // "sent" guard goes down BEFORE the write: a crash between here and the outcome leaves a
    // durable marker instead of an invisible maybe-paid write.
    const reqId = `m${memberId}-${Date.now()}`;
    await pendingCreate("wdsent", reqId, { memberId, amount, note: member.type });

    const res = await getDataSource().addDriverPayment(member.carNumber!, amount, `wd:${reqId}`, "1067 ilova: tanga → balans", coreDriverIdFromKasId(member.kasId));
    const message = res.unknown ? "no answer" : !res.ok ? `failed (status ${res.status})` : `driver balance: ${res.balance}`;

    if (res.unknown) {
      // UNKNOWN outcome: the core MAY have applied it. Refunding would be a double pay. Keep the
      // tanga held, keep the "sent" marker (blocks this member's next withdraw), page the owner.
      // A manual retry with the same requestId is applied once by the core.
      await alertAdmins(
        `⚠️ <b>Withdraw NOANIQ:</b> ${member.fullName ?? memberId} — <b>${amount.toLocaleString("ru-RU")} so'm</b>, taksi tizimi javob bermadi.\n` +
          `Haydovchi balansini tekshirib: yetib borgan bo'lsa marker'ni yeching, bormagan bo'lsa refund qiling.\n<code>pending:wdsent:${reqId}</code>`,
      ).catch(() => undefined);
      return { ok: false, reason: "pending_review", amount, coinsLeft: await getCoins(memberId), kasApplied: false };
    }
    await pendingResolve("wdsent", reqId); // outcome is KNOWN → the crash-guard has done its job

    if (!res.ok) {
      // T0.5 (AUDIT 3.3): refund is OWED — write the marker FIRST, so a crash or
      // PG drop between here and the grant can never strand the user's coins;
      // the periodic tick retries via the same idempotent key (max 5, then alert).
      const refundId = `${memberId}-${Date.now()}`;
      await pendingCreate("wd", refundId, { memberId, amount, note: message.slice(0, 80) });
      const refund = await grantCoins(memberId, amount, "withdraw_refund", "Aylantirish amalga oshmadi — tanga qaytarildi", `wdrefund:${refundId}`);
      if (refund.ok || refund.skipped === "duplicate") {
        await releaseWithdrawBudget(amount);
        await prisma.withdrawal.create({ data: { memberId, amount, kasApplied: false, kasMessage: message } }).catch(() => null);
        await pendingResolve("wd", refundId);
      }
      return { ok: false, reason: "kas_failed", amount, coinsLeft: await getCoins(memberId), kasApplied: false };
    }

    await prisma.withdrawal.create({ data: { memberId, amount, kasApplied: true, kasMessage: message } });
    // points mirrors the driver's balance in the core; take the figure it answered with
    if (res.balance != null) await prisma.member.update({ where: { id: memberId }, data: { points: Math.round(res.balance) } }).catch(() => undefined);
    // alert admins on every real-money-out (anomaly visibility)
    await alertAdmins(`💸 Withdraw: <b>${amount.toLocaleString("ru-RU")} so'm</b> — ${member.fullName} (today ${(today + amount).toLocaleString("ru-RU")})`).catch(() => undefined);
    return { ok: true, amount, coinsLeft: await getCoins(memberId), kasApplied: true };
  });
}

/**
 * The passenger's cashback → tanga top-up. It moved so'm out of their kas1067 cashback into
 * tanga; that wallet went away with kas1067 on 2026-09-17. Whatever a passenger held there was
 * converted to tanga once, at the cutover (scripts/convertKasCashback.ts), so nothing is left to
 * move. The route stays so an old Mini App build gets a clear answer instead of a 404.
 */
export async function topUpFromBonus(memberId: number, amount: number): Promise<WithdrawResponse> {
  const member = await prisma.member.findUnique({ where: { id: memberId }, select: { coins: true } });
  return { ok: false, reason: "closed", amount: Math.floor(amount), coinsLeft: member?.coins ?? 0, kasApplied: false };
}

/** T0.5 (AUDIT 3.3/3.8): periodik tick — osilib qolgan refund/topup markerlari.
 *  Har marker idempotent kalit bilan qayta uriladi; 5 urinishdan keyin stuck →
 *  egaga TG alert ("qo'lda ko'rish kerak"). */
export async function retryPendingMoney(): Promise<{ wd: number; tp: number; shopcb: number; stuck: number }> {
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
  // V3.1 (BirJoy): xarid-cashback grantlari — crash grantCoins'dan OLDIN bo'lsa shu yerda qayta uriladi.
  const cb = await pendingScan("shopcb");
  for (const r of cb.retry) {
    const g = await safeGrant(r.payload.memberId, r.payload.amount, "shop_cashback", "🛍 Xarid uchun tanga qaytdi (retry)", `shopcb:${r.id}`);
    if (g.ok || g.skipped === "duplicate") await pendingResolve("shopcb", r.id);
  }
  for (const st of [...wd.stuck, ...tp.stuck, ...sp.stuck, ...cb.stuck]) {
    stuckN++;
    await alertAdmins(`🛑 Qo'lda ko'rish kerak: pending:${st.id} — member ${st.payload.memberId}, ${st.payload.amount} tanga, 5 urinish muvaffaqiyatsiz`).catch(() => undefined);
  }
  return { wd: wd.retry.length, tp: tp.retry.length, shopcb: cb.retry.length, stuck: stuckN };
}
