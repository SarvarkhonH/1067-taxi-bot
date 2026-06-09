import { nextStreakMilestone, streakReward } from "@t1067/shared";
import { prisma } from "../db";
import { getDataSource } from "../kas";

const DAILY_GRANT_CAP = 50000; // anti-abuse: max so'm a member can be granted per rolling 24h

// Streak "day" boundary in Tashkent time (UTC+5).
function tashkentDayKey(d: Date): string {
  return new Date(d.getTime() + 5 * 3600 * 1000).toISOString().slice(0, 10);
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

  const reward = streakReward(current);
  let rewardApplied = false;
  if (reward > 0) {
    const g = await grantCashback(memberId, reward, `Streak ${current} kun`, "streak", `streak:${memberId}:${todayKey}`);
    rewardApplied = g.appliedToKas;
  }

  return { alreadyChecked: false, current, longest, rewardAmount: reward, rewardApplied, next: nextStreakMilestone(current) };
}

export async function getStreak(memberId: number): Promise<{ current: number; longest: number; checkedToday: boolean }> {
  const streak = await prisma.streak.findUnique({ where: { memberId } });
  const checkedToday = streak?.lastCheckIn ? tashkentDayKey(streak.lastCheckIn) === tashkentDayKey(new Date()) : false;
  return { current: streak?.current ?? 0, longest: streak?.longest ?? 0, checkedToday };
}
