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

  // v3 healthy-engagement: a 1-day grace (Duolingo "freeze") — missing a single day
  // keeps the streak alive (it still counts up); only 2+ missed days reset it to 1.
  const graceKey = tashkentDayKey(new Date(now.getTime() - 2 * 24 * 3600 * 1000));
  const kept = lastKey === yesterdayKey || lastKey === graceKey;
  const current = kept ? (streak?.current ?? 0) + 1 : 1;
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
export async function spinWheel(
  memberId: number,
  opts: { _forcePrize?: string; _active?: { id: number; status: string } } = {},
): Promise<WheelResult> {
  const { getJackpot, growJackpot, claimJackpot } = await import("./weeklyService");
  const { getActiveBookingFor } = await import("./bookingService");
  const empty = { label: "", emoji: "🎡", amount: 0 };

  // P0-sec (QA fleet): the wheel kill-switch was only enforced at /api/wheel — bot handlers
  // (hears/command/callback) called spinWheel directly, bypassing it. Gate at the SERVICE so
  // every caller is covered: disabled → no spin, no grant (graceful no-op).
  const { featureOn } = await import("./featureFlags");
  if (!(await featureOn("wheel"))) {
    return { noRide: true, alreadySpun: false, prize: empty, applied: false, jackpot: await getJackpot() };
  }

  const active = opts._active ?? (await getActiveBookingFor(memberId).catch(() => null));
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

  let picked = (opts._forcePrize ? WHEEL_PRIZES.find((p) => p.label === opts._forcePrize) : undefined) ?? weightedPick();
  let jackpot = await growJackpot(JACKPOT_INCREMENT);
  let isJackpot = picked.label.startsWith("JACKPOT");
  const jackpotKey = `jackpotwin:${active.id}:m${memberId}`; // SHARED with the finish-roll — one jackpot per ride
  // A4 (audit P1): the finish-roll can claim THIS ride's jackpot with the same shared key. The old
  // order claimed (reset) the pool FIRST and only then discovered the duplicate grant — the pool
  // was reset with NO payout and the UI showed a phantom win. Check the shared key BEFORE claiming;
  // an already-taken jackpot downgrades to a regular prize instead of draining the pool.
  if (isJackpot && (await prisma.coinTxn.findUnique({ where: { idempotencyKey: jackpotKey } }).catch(() => null))) {
    let repick = weightedPick();
    for (let i = 0; i < 8 && repick.label.startsWith("JACKPOT"); i++) repick = weightedPick();
    if (repick.label.startsWith("JACKPOT")) repick = WHEEL_PRIZES.find((p) => !p.label.startsWith("JACKPOT")) ?? repick;
    picked = repick;
    isJackpot = false;
  }
  // T0.5 / AUDIT 3.1 pattern: insert the wheelSpin (unique [member,booking]) FIRST. The
  // jackpot pool is claimed ONLY after we win that insert — so a duplicate/concurrent spin
  // can never drain the pool without paying out, and the pool is claimed at most once per ride.
  let amount = isJackpot ? 0 : picked.amount; // jackpot amount is set after the insert wins
  let spinId: number;
  try {
    const row = await prisma.wheelSpin.create({
      data: { memberId, dayKey: tashkentDayKey(new Date()), bookingId: active.id, prize: picked.label, amount, paid: false },
    });
    spinId = row.id;
  } catch {
    // unique [memberId, bookingId] — concurrent double-tap lost the race; NO claim happened
    return { alreadySpun: true, prize: empty, applied: false, jackpot };
  }
  if (isJackpot) {
    // we won the insert above → this claim happens at most once per ride (no double-drain)
    amount = Math.floor(await claimJackpot());
    jackpot = await getJackpot(); // back to the floor
    await prisma.wheelSpin.update({ where: { id: spinId }, data: { amount } }).catch(() => undefined);
  }
  await bumpMission(memberId, "daily_spin");
  await bumpScore(memberId, "spin");

  let applied = false;
  if (amount > 0) {
    const { grantRideCoins } = await import("./coinService");
    // jackpot pays the pre-funded pool in full (outside the per-ride clamp);
    // regular prizes share the ride's emission cap
    if (isJackpot) {
      const g = await grantCoins(memberId, amount, "wheel", `G'ildirak: JACKPOT`, jackpotKey);
      applied = g.ok;
      if (!g.ok) {
        // backstop for the micro-race (finish-roll claimed between our check and our claim):
        // the pool was already reset by US with no payout — put the value back + tell the owner.
        await growJackpot(amount).catch(() => undefined);
        const { alertAdmins } = await import("./economyService");
        await alertAdmins(`⚠️ Wheel-jackpot race (booking ${active.id}, m${memberId}): pool qaytarildi (+${amount}).`).catch(() => undefined);
      }
    } else {
      const g = await grantRideCoins(memberId, active.id, amount, "wheel", `G'ildirak: ${picked.label}`, "wheel");
      applied = g.ok;
    }
  }
  return { alreadySpun: false, prize: { label: picked.label, emoji: picked.emoji, amount }, applied, jackpot };
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

// 🎁 Free DAILY spin — the wheel is always playable now (not just in-ride). One per Tashkent
// day, idempotent by key, prizes capped to the wheel set minus the in-ride-only JACKPOT — a
// small, money-safe engagement faucet (real money still exits only via the budget-gated withdraw).
const FREE_SPIN_PRIZES = WHEEL_PRIZES.filter((p) => p.amount > 0);
export async function freeSpin(memberId: number): Promise<{ ok: boolean; alreadyUsed?: boolean; prize: WheelPrize; jackpot: number }> {
  const { getJackpot } = await import("./weeklyService");
  const key = `freespin:${memberId}:${tashkentDayKey(new Date())}`;
  if (await prisma.coinTxn.findUnique({ where: { idempotencyKey: key } })) {
    return { ok: false, alreadyUsed: true, prize: FREE_SPIN_PRIZES[0]!, jackpot: await getJackpot() };
  }
  const total = FREE_SPIN_PRIZES.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  let prize = FREE_SPIN_PRIZES[0]!;
  for (const p of FREE_SPIN_PRIZES) {
    r -= p.weight;
    if (r <= 0) {
      prize = p;
      break;
    }
  }
  await grantCoins(memberId, prize.amount, "freespin", `🎁 Bepul kunlik spin: ${prize.label}`, key);
  // C: the ride-independent daily quest — spinning the free wheel progresses it (bumpMission is
  // idempotent per period, so a second same-day spin is blocked upstream anyway by the freespin key).
  await bumpMission(memberId, "daily_freespin").catch(() => undefined);
  return { ok: true, prize, jackpot: await getJackpot() };
}
