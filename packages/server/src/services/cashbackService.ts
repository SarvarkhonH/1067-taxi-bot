// 🎲 Variable ride-cashback — the book's core HOOKED mechanic (80/15/4).
//
// Fires SERVER-SIDE from the booking sweep when a real metered ride finishes
// (the client can never claim a ride completed). The roll multiplies the
// ride's fare-derived base bonus and grants COINS via the idempotent ledger —
// a re-polled finish grants nothing, no ride = no roll, and real money still
// exits only through the budget-gated withdraw door.
import { RIDE_REWARD_BASE, RIDE_REWARD_TIERS, computeXp, formatNumber, levelForXp, tierMultFor } from "@t1067/shared";
import { prisma } from "../db";
import { grantCoins, withMemberLock } from "./coinService";
import { featureOn } from "./featureFlags";
import { weekKey } from "./missionService";
import { getBonusEcon } from "./bonusConfig";

export interface RideRollResult {
  tier: string;
  label: string;
  amount: number;
  lucky: boolean;
}

/** Deterministic lucky weekday for an ISO week (no cron, same for everyone). */
export function luckyWeekday(wk: string): number {
  let h = 0;
  for (const c of wk) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h) % 7; // 0=Sunday .. 6=Saturday (UTC+5 day-of-week)
}

export function isLuckyToday(now = new Date()): boolean {
  const tashkent = new Date(now.getTime() + 5 * 3600 * 1000);
  return tashkent.getUTCDay() === luckyWeekday(weekKey(now));
}

function rollTier(): (typeof RIDE_REWARD_TIERS)[number] {
  const total = RIDE_REWARD_TIERS.reduce((s, t) => s + t.weight, 0);
  let r = Math.random() * total;
  for (const t of RIDE_REWARD_TIERS) {
    r -= t.weight;
    if (r <= 0) return t;
  }
  return RIDE_REWARD_TIERS[0]!;
}

/**
 * Roll the variable reward for ONE completed ride. Idempotent per
 * (member, booking): the RideReward unique row is created FIRST — a concurrent
 * or re-polled sweep loses the insert race and grants nothing.
 */
export async function rollRideCashback(
  memberId: number,
  bookingId: number,
  opts?: { _forceTier?: string }, // TEST-ONLY hook; ignored in production
): Promise<RideRollResult | null> {
  const lucky = isLuckyToday();
  let t = rollTier();
  if (opts?._forceTier && process.env.NODE_ENV !== "production") {
    t = RIDE_REWARD_TIERS.find((x) => x.tier === opts._forceTier) ?? t;
  }

  // daily combo completed yesterday → today's roll doubles (the comeback hook)
  const member = await prisma.member.findUnique({ where: { id: memberId }, select: { comboBoostDay: true, lastBookingSource: true, comebackOfferUntil: true, plusUntil: true, points: true, trips: true, ballPoints: true } });
  const today = new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10);
  const combo = member?.comboBoostDay === today;
  // 🎁 comeback win-back: the first ride inside the offer window is a
  // GUARANTEED 3x (then the offer is consumed)
  const comeback = !!member?.comebackOfferUntil && member.comebackOfferUntil.getTime() > Date.now();
  if (comeback) t = RIDE_REWARD_TIERS.find((x) => x.tier === "triple")!;

  const econ = await getBonusEcon();
  // 🏅 Tier loyalty multiplier (feature "tierloyalty", DARK): higher tier → bigger per-ride
  // cashback. Applied to the roll BEFORE grantRideCoins, so the ≤350 clamp is NEVER bypassed.
  // OFF (or no member) → levelMult = 1.0, identical to legacy behaviour.
  let levelMult = 1.0;
  if (member && (await featureOn("tierloyalty"))) {
    const lvl = levelForXp(computeXp({ points: member.points, trips: member.trips, ballPoints: member.ballPoints })).level;
    levelMult = tierMultFor(lvl.index, econ);
  }
  let amount = (econ.rideBase ?? RIDE_REWARD_BASE) * t.mult * (lucky ? 2 : 1) * (combo ? 2 : 1) * levelMult;
  // 💎 Plus: ×1.5 on the roll, extra capped at +150 (ride clamp still rules)
  const plus = !!member?.plusUntil && member.plusUntil.getTime() > Date.now();
  if (plus) amount += Math.min(150, Math.floor(amount * 0.5));

  let rewardId: number;
  try {
    const row = await prisma.rideReward.create({
      data: { memberId, bookingId, tier: t.tier, amount, lucky, source: member?.lastBookingSource ?? "bot" },
    });
    rewardId = row.id;
  } catch {
    return null; // already rolled for this ride (unique [memberId, bookingId]) — pool untouched
  }
  // 🤝 Gashtak-ledger — safar HAQIQIY tasdiqlangan zahoti, o'zgarmas yozuv (oyinService.ts).
  // Best-effort, hech qachon ushbu pul-yo'liga ta'sir qilmaydi (funksiya o'z ichida xatoni yutadi).
  {
    const { creditGashtakLedger } = await import("./oyinService");
    await creditGashtakLedger(memberId, rewardId);
  }

  if (comeback) await prisma.member.update({ where: { id: memberId }, data: { comebackOfferUntil: null } }).catch(() => undefined);
  const reason = `🎲 Safar cashback ${t.label}${lucky ? " · OMAD KUNI 2x" : ""}${combo ? " · KOMBO 2x" : ""}${comeback ? " · QAYTISH SOVG'ASI 3x" : ""}${member?.plusUntil && member.plusUntil.getTime() > Date.now() ? " · 💎PLUS" : ""}`;
  const { grantRideCoins } = await import("./coinService");
  const g = await grantRideCoins(memberId, bookingId, amount, "cashback", reason, "cashback");
  if (g.clamped) amount -= g.clamped; // report what was actually paid

  return { tier: t.tier, label: t.label, amount, lucky };
}

/** Push text for the completion message. */
export function renderRideRoll(r: RideRollResult): string {
  const head = r.tier === "standard" ? "💰" : r.tier === "double" ? "✨ 2x DOUBLE!" : "🔥 3x TRIPLE!";
  return `${head} Safar cashback: <b>+${formatNumber(r.amount)} tanga</b>${r.lucky ? " · 🍀 OMAD KUNI (2x)" : ""}`;
}

function tashkentDay(d = new Date()): string {
  return new Date(d.getTime() + 5 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Shared grace→ceiling ramp — the ONE formula for accrual, voucher amount, and the client preview. */
async function waitCompAmount(waitSeconds: number): Promise<number> {
  const econ = await getBonusEcon();
  const grace = Math.max(0, econ.waitCompGraceSec ?? 30);
  const full = Math.max(grace + 1, econ.waitCompFullSec ?? 180);
  const ceiling = Math.max(0, econ.waitCompCeiling ?? 1500);
  const effective = Math.max(0, Math.min(waitSeconds, full) - grace);
  return Math.floor(ceiling * (effective / (full - grace)));
}

/**
 * 🪙 Wait compensation (feature "waitcomp"): tanga for search time before a driver accepted —
 * OUR failure to match fast (apology model), so it's OUTSIDE the ≤350/ride clamp and instead
 * bounded by its own daily company-wide budget (waitCompDailyBudget). PASSIVE: no game, no score —
 * the wait itself earns (owner rejected the tap-game as "bachkana"). Farm-safe because it pays ONLY
 * at ride-finish (a cancelled search pays nothing directly — see the voucher below).
 * Idempotent per (member, booking) via the WaitCompReward unique row — a re-polled finish-sweep
 * grants nothing on the second attempt. Called ONLY from the ride-finish branch of the booking sweep
 * (server-authoritative; the Mini App never grants), same place as rollRideCashback.
 */
export async function awardWaitComp(memberId: number, bookingId: number, waitSeconds: number): Promise<number> {
  if (!(await featureOn("waitcomp")) || waitSeconds <= 0) return 0;
  let amount = await waitCompAmount(waitSeconds);
  if (amount <= 0) return 0;
  const econ = await getBonusEcon();

  const dayKey = tashkentDay();
  // Idempotent insert-first (the unique [member,booking] row wins the race so a duplicate sweep/retry
  // can't double-pay). Audit P0-2: insert with amount=0 — the REAL amount is written only AFTER the
  // budget reserve. The old code inserted the full amount here, so N concurrent grants inflated each
  // other's budget seed (each saw the others' pending rows) → out-of-pocket overshoot on a shortage
  // spike. With 0, concurrent in-flight rows contribute nothing to the seed.
  let rewardId: number;
  try {
    const row = await prisma.waitCompReward.create({ data: { memberId, bookingId, waitSeconds, score: 0, amount: 0, dayKey } }); // score legacy (game removed); amount set post-reserve
    rewardId = row.id;
  } catch {
    return 0; // already awarded for this ride
  }

  // Company-wide daily budget via an ATOMIC AppState counter (mirrors consumeWithdrawBudget), seeded
  // once/day from committed rows so the transition day doesn't double-count. Returns the actually-
  // reserved amount (partial when the budget is tight); the unusable overshoot is rolled back so the
  // counter converges to the budget under concurrency instead of blowing past it.
  const dailyBudget = Math.max(0, econ.waitCompDailyBudget ?? 200_000);
  amount = await reserveWaitCompBudget(amount, dailyBudget, dayKey);
  await prisma.waitCompReward.update({ where: { id: rewardId }, data: { amount } }).catch(() => undefined);
  if (amount <= 0) return 0;

  await grantCoins(memberId, amount, "waitcomp", "🪙 Kutish kompensatsiyasi — haydovchi kutilgan vaqt uchun", `waitcomp:${bookingId}:m${memberId}`);
  return amount;
}

/** Atomically reserve up to `amount` from today's company-wide wait-comp budget via an AppState
 *  counter (audit P0-2). Seeded once/day from the day's existing WaitCompReward rows EXCLUDING the
 *  caller's own just-inserted row, so no double-count on the first grant after deploy. Returns the
 *  amount actually reserved (0..amount); the unusable overshoot is rolled back so the counter
 *  converges to the budget under concurrency instead of blowing past it. */
const WAITCOMP_BUDGET_LOCK = -9_100_001; // sentinel memberId → a GLOBAL in-memory lock for the counter
async function reserveWaitCompBudget(amount: number, total: number, dayKey: string): Promise<number> {
  if (amount <= 0) return 0;
  // Serialize the read→clamp→write behind one global lock (the app is single-instance). The earlier
  // add-then-read-then-rollback SQL was theoretically atomic but the read saw OTHER concurrent adds'
  // inflated intermediate value, so a legit grant could be denied even with budget free (safety held,
  // fairness didn't → flaky). A serialized counter is exact: never overshoots AND never under-pays.
  return withMemberLock(WAITCOMP_BUDGET_LOCK, async () => {
    const key = `budget:waitcomp:${dayKey}`;
    const row = await prisma.appState.findUnique({ where: { key } });
    let used: number;
    if (!row) {
      // seed = today's already-COMMITTED spend (in-flight rows are amount=0, so they don't inflate it)
      used = Math.floor((await prisma.waitCompReward.aggregate({ where: { dayKey }, _sum: { amount: true } }))._sum.amount ?? 0);
      await prisma.appState.create({ data: { key, value: String(used) } }).catch(() => undefined);
    } else {
      used = Number(row.value) || 0;
    }
    const usable = Math.max(0, Math.min(Math.floor(amount), total - used));
    if (usable > 0) {
      await prisma.appState.upsert({ where: { key }, create: { key, value: String(used + usable) }, update: { value: String(used + usable) } });
    }
    return usable;
  });
}

// ── 🎁 "Topilmadi" vaucheri ───────────────────────────────────────────────────
// Owner spec: mashina umuman TOPILMASA ham kutish bekor ketmasin — lekin naqd to'lash ochiq ferma
// bo'lardi (buyurtma→kut→bekor→yig'ish sikli). Shuning uchun summa "KEYINGI safar" vaucheriga
// aylanadi: faqat keyingi TUGALLANGAN safarda to'lanadi. Retention-mexanika ham o'zi: mijozning
// puli bizda "kutib turadi" — qaytish sababi. To'lov redeemda awardWaitComp orqali o'tadi, ya'ni
// WaitCompReward unique (bir marta) + kunlik byudjet nazorati meros qilib olinadi.

interface WaitVoucher {
  b: number; // source (failed) bookingId — the idempotency anchor at redeem time
  w: number; // waitSeconds measured server-side when the search died
  exp: number; // epoch ms
}

/** Record a next-ride voucher after a FAILED search (no driver ever accepted). Returns the amount
 *  the voucher is worth right now (for the apology message), 0 if nothing to grant. Idempotent per
 *  failed booking via the waitvfail:<bookingId> marker. One active voucher per member — a newer
 *  failure only overwrites a SMALLER or expired one (never shrinks a waiting reward). */
export async function noteWaitVoucher(memberId: number, srcBookingId: number, waitSeconds: number): Promise<number> {
  if (!(await featureOn("waitcomp")) || waitSeconds <= 0) return 0;
  const amount = await waitCompAmount(waitSeconds);
  if (amount <= 0) return 0;
  try {
    await prisma.appState.create({ data: { key: `waitvfail:${srcBookingId}`, value: "1" } });
  } catch {
    return 0; // this failed search already produced a voucher (re-polled sweep)
  }
  const econ = await getBonusEcon();
  const exp = Date.now() + Math.max(12, econ.waitVoucherExpiryH ?? 72) * 3600_000;
  const key = `waitvoucher:${memberId}`;
  const cur = await prisma.appState.findUnique({ where: { key } }).catch(() => null);
  if (cur) {
    try {
      const v = JSON.parse(cur.value) as WaitVoucher;
      const curAmount = v.exp > Date.now() ? await waitCompAmount(v.w) : 0;
      if (curAmount >= amount) return 0; // an equal-or-better voucher is already waiting
    } catch {
      /* corrupt row → overwrite below */
    }
  }
  const v: WaitVoucher = { b: srcBookingId, w: waitSeconds, exp };
  await prisma.appState.upsert({ where: { key }, create: { key, value: JSON.stringify(v) }, update: { value: JSON.stringify(v) } });
  return amount;
}

/** Redeem the member's pending voucher on a COMPLETED ride. Pays via awardWaitComp against the
 *  FAILED booking's id — so the WaitCompReward unique row + daily budget guard both apply. Returns
 *  the paid amount (0 = no/expired voucher). */
export async function redeemWaitVoucher(memberId: number): Promise<number> {
  if (!(await featureOn("waitcomp"))) return 0;
  const key = `waitvoucher:${memberId}`;
  const row = await prisma.appState.findUnique({ where: { key } }).catch(() => null);
  if (!row) return 0;
  let v: WaitVoucher;
  try {
    v = JSON.parse(row.value) as WaitVoucher;
  } catch {
    await prisma.appState.delete({ where: { key } }).catch(() => undefined);
    return 0;
  }
  await prisma.appState.delete({ where: { key } }).catch(() => undefined); // consume first — a crash retry re-reads nothing, and the awardWaitComp unique row already guards double-pay
  if (!v.exp || v.exp <= Date.now()) return 0; // expired quietly
  return awardWaitComp(memberId, v.b, v.w);
}
