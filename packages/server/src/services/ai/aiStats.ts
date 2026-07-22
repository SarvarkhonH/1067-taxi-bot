// 📊 AI hisob-kitob (feature "aihisob") — LOCAL aggregates over the member's own
// ledger. These numbers are rendered into template strings by the bot layer and
// NEVER placed in an LLM prompt (the agent only picks {metric, period} enums).
import { prisma } from "../../db";

export type StatsPeriod = "bugun" | "hafta" | "oy";

export interface MemberStats {
  periodLabel: string;
  rides: number; // rides rewarded in the period (RideReward rows)
  cashback: number; // tanga from ride-bound faucets (CoinTxn amount>0, bookingId set)
  earnedTotal: number; // ALL tanga earned in period (amount>0)
  spent: number; // tanga spent (amount<0, absolute)
}

/** Tashkent-time period start (UTC+5, no DST). */
function periodStart(period: StatsPeriod, nowUtc = new Date()): Date {
  const wall = new Date(nowUtc.getTime() + 5 * 3600_000);
  const startWall = new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate()));
  if (period === "hafta") {
    const dow = (startWall.getUTCDay() + 6) % 7; // dushanba=0
    startWall.setUTCDate(startWall.getUTCDate() - dow);
  } else if (period === "oy") {
    startWall.setUTCDate(1);
  }
  return new Date(startWall.getTime() - 5 * 3600_000);
}

const LABELS: Record<StatsPeriod, string> = { bugun: "Bugun", hafta: "Bu hafta", oy: "Bu oy" };

export async function memberStats(memberId: number, period: StatsPeriod): Promise<MemberStats> {
  const since = periodStart(period);
  const [rides, cash, earned, spent] = await Promise.all([
    prisma.rideReward.count({ where: { memberId, createdAt: { gte: since } } }),
    prisma.coinTxn.aggregate({
      _sum: { amount: true },
      where: { memberId, createdAt: { gte: since }, amount: { gt: 0 }, bookingId: { not: null } },
    }),
    prisma.coinTxn.aggregate({ _sum: { amount: true }, where: { memberId, createdAt: { gte: since }, amount: { gt: 0 } } }),
    prisma.coinTxn.aggregate({ _sum: { amount: true }, where: { memberId, createdAt: { gte: since }, amount: { lt: 0 } } }),
  ]);
  return {
    periodLabel: LABELS[period],
    rides,
    cashback: Math.round(cash._sum.amount ?? 0),
    earnedTotal: Math.round(earned._sum.amount ?? 0),
    spent: Math.abs(Math.round(spent._sum.amount ?? 0)),
  };
}

/** Bot-layer template (HTML). Numbers never leave this string into any prompt. */
export function renderStats(s: MemberStats): string {
  const f = (n: number): string => n.toLocaleString("ru-RU");
  const lines = [
    `📊 <b>${s.periodLabel}gi hisobingiz:</b>`,
    `🚕 Safarlar: <b>${s.rides}</b>`,
    `💰 Safar-cashback: <b>+${f(s.cashback)}</b> tanga`,
    `🪙 Jami tushum: <b>+${f(s.earnedTotal)}</b> tanga`,
  ];
  if (s.spent > 0) lines.push(`🛍 Sarflangan: <b>−${f(s.spent)}</b> tanga`);
  lines.push(`\nMini App → Hamyon'da to'liq tarix bor.`);
  return lines.join("\n");
}
