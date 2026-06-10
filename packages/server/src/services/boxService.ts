import { BOX_PRIZES, type BoxOpenResponse, type BoxStatusResponse, type BoxPrize } from "@t1067/shared";
import { prisma } from "../db";
import { grantCashback } from "./rewardService";
import { getMissions } from "./missionService";

function tashkentDayKey(d: Date): string {
  return new Date(d.getTime() + 5 * 3600 * 1000).toISOString().slice(0, 10);
}

function weightedPick(): BoxPrize {
  const total = BOX_PRIZES.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  for (const p of BOX_PRIZES) {
    r -= p.weight;
    if (r <= 0) return p;
  }
  return BOX_PRIZES[0]!;
}

/** Box unlocks when ALL daily missions are completed (the "perfect day"). */
export async function getBoxStatus(memberId: number): Promise<BoxStatusResponse> {
  const dayKey = tashkentDayKey(new Date());
  const [missions, open] = await Promise.all([
    getMissions(memberId),
    prisma.boxOpen.findUnique({ where: { memberId_dayKey: { memberId, dayKey } } }),
  ]);
  const dailiesDone = missions.daily.filter((m) => m.progress >= m.target).length;
  const dailiesTotal = missions.daily.length;
  const def = open ? BOX_PRIZES.find((p) => p.label === open.prize) : null;
  return {
    eligible: dailiesDone === dailiesTotal,
    opened: !!open,
    dailiesDone,
    dailiesTotal,
    prize: open ? { label: open.prize, emoji: def?.emoji ?? "🎁", amount: open.amount } : null,
  };
}

export async function openBox(memberId: number): Promise<BoxOpenResponse> {
  const status = await getBoxStatus(memberId);
  if (status.opened) return { ok: false, reason: "opened", prize: status.prize, applied: false };
  if (!status.eligible) return { ok: false, reason: "locked", prize: null, applied: false };

  const dayKey = tashkentDayKey(new Date());
  const prize = weightedPick();
  // unique [memberId, dayKey] makes a concurrent double-open throw — treat as "opened"
  try {
    await prisma.boxOpen.create({ data: { memberId, dayKey, prize: prize.label, amount: prize.amount } });
  } catch {
    return { ok: false, reason: "opened", prize: null, applied: false };
  }
  const g = await grantCashback(memberId, prize.amount, `Sirli quti: ${prize.label}`, "box", `box:${memberId}:${dayKey}`);
  return { ok: true, prize: { label: prize.label, emoji: prize.emoji, amount: prize.amount }, applied: g.appliedToKas };
}
