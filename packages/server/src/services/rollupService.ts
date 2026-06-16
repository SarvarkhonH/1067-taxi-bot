// T8 — local daily ride rollup. The kas bookingReports feed reliably covers only
// ~1.3 days at real volume (~1650 rows/day), so week-over-week / 7-day metrics
// can't be paged from kas politely. Instead the sync tick recomputes the last 2
// Tashkent days from kas's (complete) recent window into our own DailyStat table,
// and the analytics read week-over-week from THAT. No new poller — extends the tick.
//
// Max-merge: a day's counts only grow as rides complete, so we never lower a row
// from a later, shallower recompute — today converges to its full value by the
// last tick before midnight, then it's a frozen past day.
import { prisma } from "../db";
import { recentReports } from "./analyticsService";

const DONE = new Set(["delivered", "completed", "finished"]);
const isCancel = (s: string) => s.startsWith("cancel");

/** Tashkent (UTC+5) calendar day for a UTC instant. */
export function tashkentDay(ms: number = Date.now()): string {
  return new Date(ms + 5 * 3600 * 1000).toISOString().slice(0, 10);
}
/** Shift a Tashkent day-string by n days (no DST in UZ → noon anchor is safe). */
export function addDays(day: string, n: number): string {
  return tashkentDay(new Date(`${day}T12:00:00.000+05:00`).getTime() + n * 24 * 3600 * 1000);
}
function dayBoundsUtc(day: string): { start: Date; end: Date } {
  const start = new Date(`${day}T00:00:00.000+05:00`);
  return { start, end: new Date(start.getTime() + 24 * 3600 * 1000) };
}

export interface DailyAgg {
  completedRides: number;
  cancelledRides: number;
  botRides: number;
  gmv: number;
  days: number; // how many DailyStat rows actually exist in the range (accrual indicator)
}

/** Sum DailyStat rows over an inclusive Tashkent day range (day strings sort chronologically). */
export async function sumDailyRange(startDay: string, endDay: string): Promise<DailyAgg> {
  const rows = await prisma.dailyStat.findMany({ where: { day: { gte: startDay, lte: endDay } } });
  return {
    completedRides: rows.reduce((s, r) => s + r.completedRides, 0),
    cancelledRides: rows.reduce((s, r) => s + r.cancelledRides, 0),
    botRides: rows.reduce((s, r) => s + r.botRides, 0),
    gmv: rows.reduce((s, r) => s + r.gmv, 0),
    days: rows.length,
  };
}

export interface DailyStatRow {
  completedRides: number;
  cancelledRides: number;
  botRides: number;
  gmv: number;
}
export async function getDailyStat(day: string): Promise<DailyStatRow | null> {
  const r = await prisma.dailyStat.findUnique({ where: { day } });
  return r ? { completedRides: r.completedRides, cancelledRides: r.cancelledRides, botRides: r.botRides, gmv: r.gmv } : null;
}

/** Recompute the last 2 Tashkent days from kas's recent window + RideReward, and
 *  max-merge them into DailyStat. Called from the sync tick (no new poller). */
export async function rollupRecentDays(): Promise<void> {
  let rows: Awaited<ReturnType<typeof recentReports>>;
  try {
    rows = await recentReports();
  } catch {
    return; // kas unavailable this tick — leave DailyStat untouched, retry next tick
  }
  const today = tashkentDay();
  for (const day of [addDays(today, -1), today]) {
    const { start, end } = dayBoundsUtc(day);
    const s = start.getTime();
    const e = end.getTime();
    let completed = 0;
    let cancelled = 0;
    let gmv = 0;
    for (const r of rows) {
      const t = Date.parse(r.at);
      if (!Number.isFinite(t) || t < s || t >= e) continue;
      if (DONE.has(r.status)) {
        completed++;
        gmv += r.payment || 0;
      } else if (isCancel(r.status)) {
        cancelled++;
      }
    }
    const botRides = await prisma.rideReward.count({ where: { createdAt: { gte: start, lt: end } } });
    const g = Math.round(gmv);
    const existing = await prisma.dailyStat.findUnique({ where: { day } });
    await prisma.dailyStat.upsert({
      where: { day },
      create: { day, completedRides: completed, cancelledRides: cancelled, botRides, gmv: g },
      update: {
        // max-merge: never lower a day from a shallower recompute
        completedRides: Math.max(existing?.completedRides ?? 0, completed),
        cancelledRides: Math.max(existing?.cancelledRides ?? 0, cancelled),
        botRides: Math.max(existing?.botRides ?? 0, botRides),
        gmv: Math.max(existing?.gmv ?? 0, g),
      },
    });
  }
}
