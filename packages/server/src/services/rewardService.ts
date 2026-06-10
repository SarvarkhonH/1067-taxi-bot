import {
  JACKPOT_INCREMENT,
  WHEEL_RESPIN_COST,
  nextStreakMilestone,
  streakReward,
  WHEEL_PRIZES,
  type ScoreKind,
  type WheelPrize,
} from "@t1067/shared";
import { prisma } from "../db";
import { getDataSource } from "../kas";
import { grantCoins, spendCoins } from "./coinService";

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

export interface GrantResult {
  ok: boolean;
  amount: number;
  appliedToKas: boolean;
  reason: string;
  skipped?: "duplicate" | "cap";
}

/** Grant cashback — records it (audited) and writes REAL money to kas1067 for clients. */
export async function grantCashback(
  memberId: number,
  amount: number,
  reason: string,
  kind: string,
  idempotencyKey?: string,
): Promise<GrantResult> {
  if (amount <= 0) return { ok: false, amount: 0, appliedToKas: false, reason };

  if (idempotencyKey) {
    const existing = await prisma.rewardGrant.findUnique({ where: { idempotencyKey } });
    if (existing) return { ok: false, amount, appliedToKas: existing.appliedToKas, reason, skipped: "duplicate" };
  }

  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const agg = await prisma.rewardGrant.aggregate({ where: { memberId, createdAt: { gte: since } }, _sum: { amount: true } });
  if ((agg._sum.amount ?? 0) + amount > DAILY_GRANT_CAP) {
    return { ok: false, amount, appliedToKas: false, reason, skipped: "cap" };
  }

  const member = await prisma.member.findUnique({ where: { id: memberId } });
  if (!member) return { ok: false, amount: 0, appliedToKas: false, reason };

  let appliedToKas = false;
  let kasMessage = "status-only (driver or no phone)";
  if (member.type === "client" && member.phone) {
    try {
      const res = await getDataSource().addClientBonus(member.phone, amount);
      appliedToKas = res.ok;
      kasMessage = res.ok ? `${res.oldBonus} -> ${res.newBonus}` : `failed (status ${res.status})`;
    } catch (e) {
      kasMessage = e instanceof Error ? e.message : String(e);
    }
  }

  await prisma.rewardGrant.create({
    data: { memberId, amount, reason, kind, appliedToKas, kasMessage, idempotencyKey: idempotencyKey ?? null },
  });
  if (appliedToKas) {
    await prisma.member.update({ where: { id: memberId }, data: { points: { increment: amount } } });
  }

  return { ok: true, amount, appliedToKas, reason };
}

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
  alreadySpun: boolean; // free spin used and no respin requested
  prize: { label: string; emoji: string; amount: number };
  applied: boolean;
  jackpot: number; // displayed pool after this call
  paid: boolean; // this spin was a coin respin
  insufficient?: boolean; // respin requested but not enough coins
  respinCost: number;
}

/**
 * One FREE spin per day; unlimited respins for coins (the "no limits" engine).
 * Free spin feeds the jackpot +50, paid respins +10% of their cost.
 */
export async function spinWheel(memberId: number, opts: { respin?: boolean } = {}): Promise<WheelResult> {
  const { getJackpot, growJackpot, claimJackpot } = await import("./weeklyService");
  const dayKey = tashkentDayKey(new Date());
  const freeUsed = await prisma.wheelSpin.findFirst({ where: { memberId, dayKey, paid: false } });

  const base = { respinCost: WHEEL_RESPIN_COST };
  let paid = false;
  if (freeUsed) {
    if (!opts.respin) {
      const def = WHEEL_PRIZES.find((x) => x.label === freeUsed.prize);
      return {
        ...base,
        alreadySpun: true,
        prize: { label: freeUsed.prize, emoji: def?.emoji ?? "🎡", amount: freeUsed.amount },
        applied: false,
        jackpot: await getJackpot(),
        paid: false,
      };
    }
    const spend = await spendCoins(memberId, WHEEL_RESPIN_COST, "respin", "G'ildirak qayta aylantirish");
    if (!spend.ok) {
      return {
        ...base,
        alreadySpun: false,
        prize: { label: "", emoji: "🎡", amount: 0 },
        applied: false,
        jackpot: await getJackpot(),
        paid: true,
        insufficient: true,
      };
    }
    paid = true;
  }

  const prize = weightedPick();
  // every spin escalates the pool; the JACKPOT slice wins the whole pool
  let jackpot = await growJackpot(paid ? Math.round(WHEEL_RESPIN_COST * 0.1) : JACKPOT_INCREMENT);
  let amount = prize.amount;
  if (prize.label.startsWith("JACKPOT")) {
    amount = await claimJackpot();
    jackpot = await getJackpot(); // back to the floor
  }

  await prisma.wheelSpin.create({ data: { memberId, dayKey, prize: prize.label, amount, paid } });
  if (!paid) {
    await bumpMission(memberId, "daily_spin");
    await bumpScore(memberId, "spin");
  }

  let applied = false;
  if (amount > 0) {
    const g = await grantCoins(
      memberId,
      amount,
      "wheel",
      `G'ildirak: ${prize.label}`,
      paid ? undefined : `wheel:${memberId}:${dayKey}`,
    );
    applied = g.ok;
  }
  return { ...base, alreadySpun: false, prize: { label: prize.label, emoji: prize.emoji, amount }, applied, jackpot, paid };
}

/** True while today's FREE spin is still available (paid respins are always available). */
export async function canSpinWheel(memberId: number): Promise<boolean> {
  const dayKey = tashkentDayKey(new Date());
  return !(await prisma.wheelSpin.findFirst({ where: { memberId, dayKey, paid: false } }));
}

export async function getStreak(memberId: number): Promise<{ current: number; longest: number; checkedToday: boolean }> {
  const streak = await prisma.streak.findUnique({ where: { memberId } });
  const checkedToday = streak?.lastCheckIn ? tashkentDayKey(streak.lastCheckIn) === tashkentDayKey(new Date()) : false;
  return { current: streak?.current ?? 0, longest: streak?.longest ?? 0, checkedToday };
}
