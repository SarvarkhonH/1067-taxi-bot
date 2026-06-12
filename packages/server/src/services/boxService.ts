import { BOX_PRIZES, type BoxOpenResponse, type BoxStatusResponse } from "@t1067/shared";
import { prisma } from "../db";
import { grantCoins } from "./coinService";
import { getMissions } from "./missionService";

function tashkentDayKey(d: Date): string {
  return new Date(d.getTime() + 5 * 3600 * 1000).toISOString().slice(0, 10);
}

interface Weighted {
  label: string;
  emoji: string;
  amount: number;
  weight: number;
}

function weightedPick(prizes: Weighted[]): Weighted {
  const total = prizes.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  for (const p of prizes) {
    r -= p.weight;
    if (r <= 0) return p;
  }
  return prizes[0]!;
}

/** Free box unlocks when ALL daily missions are completed (ride-anchored via daily_ride). */
export async function getBoxStatus(memberId: number): Promise<BoxStatusResponse> {
  const dayKey = tashkentDayKey(new Date());
  const [missions, freeOpen] = await Promise.all([
    getMissions(memberId),
    prisma.boxOpen.findFirst({ where: { memberId, dayKey, premium: false } }),
  ]);
  const dailiesDone = missions.daily.filter((m) => m.progress >= m.target).length;
  const dailiesTotal = missions.daily.length;
  const def = freeOpen ? BOX_PRIZES.find((p) => p.label === freeOpen.prize) : null;
  return {
    eligible: dailiesDone === dailiesTotal,
    opened: !!freeOpen,
    dailiesDone,
    dailiesTotal,
    prize: freeOpen ? { label: freeOpen.prize, emoji: def?.emoji ?? "🎁", amount: freeOpen.amount } : null,
  };
}

export async function openBox(memberId: number): Promise<BoxOpenResponse> {
  const dayKey = tashkentDayKey(new Date());
  const status = await getBoxStatus(memberId);
  if (status.opened) return { ok: false, reason: "opened", prize: status.prize, applied: false };
  if (!status.eligible) return { ok: false, reason: "locked", prize: null, applied: false };

  const prize = weightedPick(BOX_PRIZES);
  await prisma.boxOpen.create({ data: { memberId, dayKey, prize: prize.label, amount: prize.amount, premium: false } });
  const g = await grantCoins(memberId, prize.amount, "box", `Sirli quti: ${prize.label}`, `box:${memberId}:${dayKey}`);
  await import("./weeklyService")
    .then((w) => w.addScore(memberId, "box"))
    .catch(() => undefined);
  return { ok: true, prize: { label: prize.label, emoji: prize.emoji, amount: prize.amount }, applied: g.ok };
}
