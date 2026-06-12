// 🎲 Variable ride-cashback — the book's core HOOKED mechanic (80/15/4/1).
//
// Fires SERVER-SIDE from the booking sweep when a real metered ride finishes
// (the client can never claim a ride completed). The roll multiplies the
// ride's fare-derived base bonus and grants COINS via the idempotent ledger —
// a re-polled finish grants nothing, no ride = no roll, and real money still
// exits only through the budget-gated withdraw door.
import { RIDE_JACKPOT_FEED, RIDE_REWARD_BASE, RIDE_REWARD_TIERS, formatNumber } from "@t1067/shared";
import { prisma } from "../db";
import { grantCoins } from "./coinService";
import { weekKey } from "./missionService";
import { claimJackpot, growJackpot } from "./weeklyService";

export interface RideRollResult {
  tier: string;
  label: string;
  amount: number;
  lucky: boolean;
  jackpot: boolean;
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
export async function rollRideCashback(memberId: number, bookingId: number): Promise<RideRollResult | null> {
  const lucky = isLuckyToday();
  const t = rollTier();

  // daily combo completed yesterday → today's roll doubles (the comeback hook)
  const member = await prisma.member.findUnique({ where: { id: memberId }, select: { comboBoostDay: true, lastBookingSource: true } });
  const today = new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10);
  const combo = member?.comboBoostDay === today;

  let amount: number;
  let jackpot = false;
  if (t.tier === "jackpot") {
    amount = Math.floor(await claimJackpot());
    jackpot = true;
  } else {
    amount = RIDE_REWARD_BASE * t.mult * (lucky ? 2 : 1) * (combo ? 2 : 1);
  }

  try {
    await prisma.rideReward.create({
      data: { memberId, bookingId, tier: t.tier, amount, lucky, source: member?.lastBookingSource ?? "bot" },
    });
  } catch {
    return null; // already rolled for this ride (unique [memberId, bookingId])
  }

  const reason = `🎲 Safar cashback ${t.label}${lucky ? " · OMAD KUNI 2x" : ""}${combo ? " · KOMBO 2x" : ""}`;
  if (jackpot) {
    // jackpot pays the pre-funded pool in full — outside the per-ride clamp
    await grantCoins(memberId, amount, "cashback", reason, `cashback:${memberId}:${bookingId}`);
  } else {
    const { grantRideCoins } = await import("./coinService");
    const g = await grantRideCoins(memberId, bookingId, amount, "cashback", reason, "cashback");
    if (g.clamped) amount -= g.clamped; // report what was actually paid
  }
  // every ride feeds the pool — the most exciting reward grows with orders/day
  await growJackpot(RIDE_JACKPOT_FEED).catch(() => undefined);

  if (jackpot) {
    const { alertAdmins } = await import("./economyService");
    const m = await prisma.member.findUnique({ where: { id: memberId }, select: { fullName: true } });
    await alertAdmins(`🎰 RIDE-JACKPOT: <b>${m?.fullName ?? memberId}</b> yutdi — ${formatNumber(amount)} coin!`).catch(() => undefined);
  }
  return { tier: t.tier, label: t.label, amount, lucky, jackpot };
}

/** Push text for the completion message. */
export function renderRideRoll(r: RideRollResult): string {
  if (r.jackpot) return `🎰🎰🎰 <b>JACKPOT!</b> Bu safar butun jamg'armani yutdingiz: <b>+${formatNumber(r.amount)} coin</b>! 👑`;
  const head = r.tier === "standard" ? "💰" : r.tier === "double" ? "✨ 2x DOUBLE!" : "🔥 3x TRIPLE!";
  return `${head} Safar cashback: <b>+${formatNumber(r.amount)} coin</b>${r.lucky ? " · 🍀 OMAD KUNI (2x)" : ""}`;
}
