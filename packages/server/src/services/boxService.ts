import {
  BOX_PRIZES,
  BOX_PRIZES_PREMIUM,
  BOX_PREMIUM_COST,
  type BoxOpenResponse,
  type BoxStatusResponse,
} from "@t1067/shared";
import { prisma } from "../db";
import { grantCoins, spendCoins } from "./coinService";
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

/** Free box unlocks when ALL daily missions are completed; premium is always buyable. */
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
    premiumCost: BOX_PREMIUM_COST,
  };
}

export async function openBox(memberId: number, opts: { premium?: boolean } = {}): Promise<BoxOpenResponse> {
  const dayKey = tashkentDayKey(new Date());

  if (opts.premium) {
    // unlimited — coins are the gate
    const spend = await spendCoins(memberId, BOX_PREMIUM_COST, "premium_box", "Premium quti");
    if (!spend.ok) return { ok: false, reason: "insufficient", prize: null, applied: false, premium: true };
    const prize = weightedPick(BOX_PRIZES_PREMIUM);
    await prisma.boxOpen.create({ data: { memberId, dayKey, prize: prize.label, amount: prize.amount, premium: true } });
    const g = await grantCoins(memberId, prize.amount, "box", `Premium quti: ${prize.label}`);
    await import("./weeklyService")
      .then((w) => w.addScore(memberId, "box"))
      .catch(() => undefined);
    return { ok: true, prize: { label: prize.label, emoji: prize.emoji, amount: prize.amount }, applied: g.ok, premium: true };
  }

  const status = await getBoxStatus(memberId);
  if (status.opened) return { ok: false, reason: "opened", prize: status.prize, applied: false, premium: false };
  if (!status.eligible) return { ok: false, reason: "locked", prize: null, applied: false, premium: false };

  const prize = weightedPick(BOX_PRIZES);
  await prisma.boxOpen.create({ data: { memberId, dayKey, prize: prize.label, amount: prize.amount, premium: false } });
  const g = await grantCoins(memberId, prize.amount, "box", `Sirli quti: ${prize.label}`, `box:${memberId}:${dayKey}`);
  await import("./weeklyService")
    .then((w) => w.addScore(memberId, "box"))
    .catch(() => undefined);
  return { ok: true, prize: { label: prize.label, emoji: prize.emoji, amount: prize.amount }, applied: g.ok, premium: false };
}
