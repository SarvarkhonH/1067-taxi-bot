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
const REYTING_EXCLUDE = new Set(["transfer_in", "tip_in", "weekly", "manual", "topup", "admin_coin", "shop_refund"]); // shop_refund: a rejected order's refund is NOT "earned" — must not inflate the weekly board

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
    canWithdraw: (member?.type === "client" || member?.type === "driver") && coins >= limits.min && today < limits.dailyCap,
    isClient: member?.type === "client", // ONLY clients convert cashback→tanga (topup); BOTH can withdraw tanga→kas balance
    topupMin: TOPUP_MIN,
    canTopup: (member?.points ?? 0) >= TOPUP_MIN,
    commissionPct,
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
  const limits = await withdrawLimits(); // owner-tunable (admin «Naqd fond» knobs)
  if (amount < limits.min) return fail("below_min");
  // P0 (QA fleet): serialize per member — the cap check + budget + spend + kas + row-create
  // must run atomically per member, else two concurrent withdrawals both read withdrawnToday=0
  // and both blow past the 50000/day cap (real money out 2x). Same in-process lock as grantRideCoins.
  return withMemberLock(memberId, async () => {
    const { consumeWithdrawBudget, releaseWithdrawBudget, alertAdmins } = await import("./economyService");
    const { pendingCreate, pendingResolve } = await import("./appStateUtil");

    // A3 (audit P0): kas has NO idempotency key — if a previous withdraw crashed/timed out AFTER
    // the kas write went out but BEFORE its outcome was recorded, re-running would pay real money
    // TWICE. An unresolved "sent" marker therefore blocks this member's cash door until an admin
    // confirms what kas actually did (boot alert lists the marker; clearPending.ts releases it).
    const stale = await prisma.appState.findFirst({ where: { key: { startsWith: `pending:wdsent:m${memberId}-` } }, select: { key: true } });
    if (stale) return fail("pending_review");

    const today = await withdrawnToday(memberId);
    if (today + amount > limits.dailyCap) return fail("daily_cap");

    // revenue-linked GLOBAL budget: real money out can't outrun real taxi revenue. Distinct reason
    // (bug fix): this used to return "daily_cap", so a driver with ~5k withdrawn saw «100 000/kun
    // limit tugadi» when actually the COMPANY fund for today was short. fundLeft lets the UI say
    // exactly how much can still be withdrawn right now.
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

    // "sent" guard goes down BEFORE the kas write (driverDebtService pattern): a crash between
    // here and the outcome leaves a durable marker instead of an invisible maybe-paid write.
    const reqId = `m${memberId}-${Date.now()}`;
    await pendingCreate("wdsent", reqId, { memberId, amount, note: member.type });

    let kasApplied = false;
    let kasOutcomeKnown = false;
    let kasMessage = "";
    try {
      // per-phone lock: serialize our concurrent balance writes (kas has no CAS).
      // DRIVER → their own kas driver balance (drivers/payment); CLIENT → the client bonus.
      type KasWriteRes = { ok: boolean; status?: number; balance?: number | null; oldBonus?: number; newBonus?: number };
      const res: KasWriteRes = await withPhoneLock<KasWriteRes>(member.phone!, () =>
        member.type === "driver"
          ? getDataSource().addDriverPayment(Number(member.kasId), member.carNumber ?? "", amount, "1067 ilova: tanga → balans")
          : getDataSource().addClientBonus(member.phone!, amount),
      );
      kasOutcomeKnown = true; // kas ANSWERED — ok or a clean reject, either way we know
      kasApplied = res.ok;
      kasMessage = !res.ok ? `failed (status ${res.status})` : res.balance != null ? `driver balance: ${res.balance}` : `${res.oldBonus} -> ${res.newBonus}`;
    } catch (e) {
      kasMessage = e instanceof Error ? e.message : String(e);
    }

    if (!kasOutcomeKnown) {
      // UNKNOWN outcome (timeout/socket death mid-write): kas MAY have applied it. The old code
      // auto-refunded here — a double-pay if the write actually landed. Now: keep the coins held,
      // keep the "sent" marker (blocks this member's next withdraw), and page the owner.
      await alertAdmins(
        `⚠️ <b>Withdraw NOANIQ:</b> ${member.fullName ?? memberId} — <b>${amount.toLocaleString("ru-RU")} so'm</b>, kas javob bermadi (${kasMessage.slice(0, 80)}).\n` +
          `Kas balansini tekshirib: yetib borgan bo'lsa marker'ni yeching, bormagan bo'lsa refund qiling.\n<code>pending:wdsent:${reqId}</code>`,
      ).catch(() => undefined);
      return { ok: false, reason: "pending_review", amount, coinsLeft: await getCoins(memberId), kasApplied: false };
    }
    await pendingResolve("wdsent", reqId); // outcome is KNOWN → the crash-guard has done its job

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
  });
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
