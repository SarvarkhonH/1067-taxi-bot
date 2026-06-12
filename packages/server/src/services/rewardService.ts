import {
  JACKPOT_INCREMENT,
  nextStreakMilestone,
  streakReward,
  WHEEL_PRIZES,
  type ScoreKind,
  type WheelPrize,
} from "@t1067/shared";
import { prisma } from "../db";
import { getDataSource } from "../kas";
import { grantCoins } from "./coinService";

const DAILY_GRANT_CAP = 50000; // anti-abuse: max so'm a member can be granted per rolling 24h

// Streak "day" boundary in Tashkent time (UTC+5).
function tashkentDayKey(d: Date): string {
  return new Date(d.getTime() + 5 * 3600 * 1000).toISOString().slice(0, 10);
}

// Dynamic import breaks the rewardService ↔ missionService cycle (missionService
// claims pay via grantCashback here). Failures must never block the core reward.
async function bumpMission(memberId: number, code: string): Promise<void> {
  try {
    const { incrementMission } = await import("./missionService");
    await incrementMission(memberId, code);
  } catch (e) {
    console.error("[mission] bump failed:", e instanceof Error ? e.message : e);
  }
}

// Same pattern for the weekly league (weeklyService pays prizes via grantCashback).
async function bumpScore(memberId: number, kind: ScoreKind): Promise<void> {
  try {
    const { addScore } = await import("./weeklyService");
    await addScore(memberId, kind);
  } catch (e) {
    console.error("[weekly] score bump failed:", e instanceof Error ? e.message : e);
  }
}

// T0.5 (AUDIT 1.1, ega qarori): legacy grantCashback + GrantResult olib tashlandi —
// coin-iqtisodga o'tilgach chaqiruvchisi qolmagan edi (grep-isbot AUDIT.md da).

export interface CheckInResult {
  alreadyChecked: boolean;
  current: number;
  longest: number;
  rewardAmount: number;
  rewardApplied: boolean;
  next: { day: number; reward: number } | null;
}

/** Daily check-in: advances the streak, pays real cashback at milestones. */
export async function dailyCheckIn(memberId: number): Promise<CheckInResult> {
  const now = new Date();
  const todayKey = tashkentDayKey(now);
  const yesterdayKey = tashkentDayKey(new Date(now.getTime() - 24 * 3600 * 1000));

  const streak = await prisma.streak.findUnique({ where: { memberId } });
  const lastKey = streak?.lastCheckIn ? tashkentDayKey(streak.lastCheckIn) : null;

  if (lastKey === todayKey) {
    return {
      alreadyChecked: true,
      current: streak?.current ?? 0,
      longest: streak?.longest ?? 0,
      rewardAmount: 0,
      rewardApplied: false,
      next: nextStreakMilestone(streak?.current ?? 0),
    };
  }

  const current = lastKey === yesterdayKey ? (streak?.current ?? 0) + 1 : 1;
  const longest = Math.max(current, streak?.longest ?? 0);
  await prisma.streak.upsert({
    where: { memberId },
    create: { memberId, current, longest, lastCheckIn: now },
    update: { current, longest, lastCheckIn: now },
  });

  await bumpMission(memberId, "daily_checkin");
  await bumpScore(memberId, "checkin");

  const reward = streakReward(current);
  let rewardApplied = false;
  if (reward > 0) {
    const g = await grantCoins(memberId, reward, "streak", `Streak ${current} kun`, `streak:${memberId}:${todayKey}`);
    rewardApplied = g.ok;
  }

  return { alreadyChecked: false, current, longest, rewardAmount: reward, rewardApplied, next: nextStreakMilestone(current) };
}

// ─── spin the wheel ───────────────────────────────────────────
function weightedPick(): WheelPrize {
  const total = WHEEL_PRIZES.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  for (const p of WHEEL_PRIZES) {
    r -= p.weight;
    if (r <= 0) return p;
  }
  return WHEEL_PRIZES[0]!;
}

export interface WheelResult {
  noRide?: boolean; // no active started ride — wheel only spins IN the car
  alreadySpun: boolean; // this ride's spin already used
  prize: { label: string; emoji: string; amount: number };
  applied: boolean;
  jackpot: number; // displayed pool after this call
}

/**
 * IN-RIDE wheel: ONE spin per real ride, only while the booking is in
 * "started" (you're in the car). Every spin wins (no losing slice) and there
 * is no paid entry anywhere — chance rewards are only ever EARNED by riding
 * (UZ gambling posture). The JACKPOT slice pays the shared ride-fed pool.
 */
export async function spinWheel(memberId: number): Promise<WheelResult> {
  const { getJackpot, growJackpot, claimJackpot } = await import("./weeklyService");
  const { getActiveBookingFor } = await import("./bookingService");
  const empty = { label: "", emoji: "🎡", amount: 0 };

  const active = await getActiveBookingFor(memberId).catch(() => null);
  if (!active || active.status !== "started") {
    return { noRide: true, alreadySpun: false, prize: empty, applied: false, jackpot: await getJackpot() };
  }

  const used = await prisma.wheelSpin.findFirst({ where: { memberId, bookingId: active.id } });
  if (used) {
    const def = WHEEL_PRIZES.find((x) => x.label === used.prize);
    return {
      alreadySpun: true,
      prize: { label: used.prize, emoji: def?.emoji ?? "🎡", amount: used.amount },
      applied: false,
      jackpot: await getJackpot(),
    };
  }

  const prize = weightedPick();
  let jackpot = await growJackpot(JACKPOT_INCREMENT);
  let amount = prize.amount;
  const isJackpot = prize.label.startsWith("JACKPOT");
  if (isJackpot) {
    amount = await claimJackpot();
    jackpot = await getJackpot(); // back to the floor
  }

  try {
    await prisma.wheelSpin.create({
      data: { memberId, dayKey: tashkentDayKey(new Date()), bookingId: active.id, prize: prize.label, amount, paid: false },
    });
  } catch {
    // unique [memberId, bookingId] — concurrent double-tap lost the race
    return { alreadySpun: true, prize: empty, applied: false, jackpot };
  }
  await bumpMission(memberId, "daily_spin");
  await bumpScore(memberId, "spin");

  let applied = false;
  if (amount > 0) {
    const { grantRideCoins } = await import("./coinService");
    // jackpot pays the pre-funded pool in full (outside the per-ride clamp);
    // regular prizes share the ride's emission cap
    if (isJackpot) {
      const g = await grantCoins(memberId, amount, "wheel", `G'ildirak: JACKPOT`, `wheel:${memberId}:${active.id}`);
      applied = g.ok;
    } else {
      const g = await grantRideCoins(memberId, active.id, amount, "wheel", `G'ildirak: ${prize.label}`, "wheel");
      applied = g.ok;
    }
  }
  return { alreadySpun: false, prize: { label: prize.label, emoji: prize.emoji, amount }, applied, jackpot };
}

/** True when a spin is available RIGHT NOW: active started ride, not yet spun. */
export async function canSpinWheel(memberId: number): Promise<boolean> {
  const { getActiveBookingFor } = await import("./bookingService");
  const active = await getActiveBookingFor(memberId).catch(() => null);
  if (!active || active.status !== "started") return false;
  return !(await prisma.wheelSpin.findFirst({ where: { memberId, bookingId: active.id } }));
}

export async function getStreak(memberId: number): Promise<{ current: number; longest: number; checkedToday: boolean }> {
  const streak = await prisma.streak.findUnique({ where: { memberId } });
  const checkedToday = streak?.lastCheckIn ? tashkentDayKey(streak.lastCheckIn) === tashkentDayKey(new Date()) : false;
  return { current: streak?.current ?? 0, longest: streak?.longest ?? 0, checkedToday };
}
