// A4 analytics: the REAL numbers that gate Wave B decisions.
// - north-star: weekly completed rides (Uber/Lyft's NSM) + bot share + WAU
// - driver distribution: rides/driver last 7 days — tier thresholds come from
//   these PERCENTILES, never from guesses (plan: IV.1).
// Data source: kas bookingReports paged (3×500 ≈ last ~9 days at 165/day),
// cached 10 minutes — cheap enough for an admin dashboard.
import { prisma } from "../db";
import { getDataSource, type RideHistoryItem } from "../kas";

const DONE = new Set(["delivered", "completed", "finished"]); // kas reports vocab: terminal = "delivered" (probe 2026-06-12)
const WEEK_MS = 7 * 24 * 3600 * 1000;

let cache: { at: number; rows: RideHistoryItem[] } | null = null;
async function recentReports(): Promise<RideHistoryItem[]> {
  if (cache && Date.now() - cache.at < 600_000) return cache.rows;
  const ds = getDataSource();
  // kas silently caps page size around ~50 — page SEQUENTIALLY (rate-limit
  // polite) until we have 2 weeks of data or 40 pages (~2000 rows).
  const rows: RideHistoryItem[] = [];
  const cutoff = Date.now() - 2 * WEEK_MS;
  for (let p = 0; p < 40; p++) {
    const page = await ds.getReportsPage(p, 50);
    if (!page.length) break;
    rows.push(...page);
    const oldest = Date.parse(page[page.length - 1]!.at);
    if (Number.isFinite(oldest) && oldest < cutoff) break;
  }
  cache = { at: Date.now(), rows };
  return rows;
}

export interface DriverAnalytics {
  windowDays: number;
  activeDrivers: number; // drivers with ≥1 completed ride in the window
  histogram: { bucket: string; drivers: number }[];
  percentiles: { p50: number; p75: number; p90: number }; // rides per driver
  top: { carNumber: string; carModel: string; rides: number }[];
  tierSuggestion: { kumush: number; oltin: number; olmos: number }; // weekly ride thresholds
}

export async function getDriverAnalytics(): Promise<DriverAnalytics> {
  const rows = await recentReports();
  const since = Date.now() - WEEK_MS;
  const byCar = new Map<string, { model: string; rides: number }>();
  for (const r of rows) {
    if (!r.carNumber || !DONE.has(r.status)) continue;
    const t = Date.parse(r.at);
    if (Number.isFinite(t) && t < since) continue;
    const e = byCar.get(r.carNumber) ?? { model: r.carModel, rides: 0 };
    e.rides++;
    byCar.set(r.carNumber, e);
  }
  const counts = [...byCar.values()].map((x) => x.rides).sort((a, b) => a - b);
  const pct = (p: number) => (counts.length ? counts[Math.min(counts.length - 1, Math.floor((p / 100) * counts.length))]! : 0);
  const buckets: [string, (n: number) => boolean][] = [
    ["1-2", (n) => n <= 2],
    ["3-5", (n) => n >= 3 && n <= 5],
    ["6-10", (n) => n >= 6 && n <= 10],
    ["11-20", (n) => n >= 11 && n <= 20],
    ["21+", (n) => n >= 21],
  ];
  return {
    windowDays: 7,
    activeDrivers: counts.length,
    histogram: buckets.map(([bucket, f]) => ({ bucket, drivers: counts.filter(f).length })),
    percentiles: { p50: pct(50), p75: pct(75), p90: pct(90) },
    top: [...byCar.entries()]
      .map(([carNumber, v]) => ({ carNumber, carModel: v.model, rides: v.rides }))
      .sort((a, b) => b.rides - a.rides)
      .slice(0, 20),
    // tier gates = the measured distribution (top-50/25/10%), floored at sane minimums
    tierSuggestion: { kumush: Math.max(2, pct(50)), oltin: Math.max(3, pct(75)), olmos: Math.max(5, pct(90)) },
  };
}

/**
 * Weekly driver-tier recompute (Mondays, marker-guarded): thresholds come from
 * the MEASURED percentile suggestion, never from guesses. Drivers without a
 * single delivered ride drop to Bronza (status loss = the retention hook).
 */
export async function recomputeDriverTiers(): Promise<{ updated: number; thresholds: { kumush: number; oltin: number; olmos: number } } | null> {
  const { weekKey } = await import("./missionService");
  const wk = weekKey(new Date());
  const marker = `driver_tiers:${wk}`;
  if (await prisma.appState.findUnique({ where: { key: marker } })) return null;
  await prisma.appState.upsert({ where: { key: marker }, create: { key: marker, value: "1" }, update: { value: "1" } });

  const a = await getDriverAnalytics();
  const t = a.tierSuggestion;
  const ridesByCar = new Map(a.top.map((x) => [x.carNumber, x.rides]));
  // top covers 20; rebuild full map from reports for fairness
  const rows = await recentReports();
  const since = Date.now() - WEEK_MS;
  const full = new Map<string, number>();
  for (const r of rows) {
    if (!r.carNumber || !DONE.has(r.status)) continue;
    const ts = Date.parse(r.at);
    if (Number.isFinite(ts) && ts < since) continue;
    full.set(r.carNumber, (full.get(r.carNumber) ?? 0) + 1);
  }
  void ridesByCar;

  const drivers = await prisma.member.findMany({ where: { type: "driver" }, select: { id: true, carNumber: true } });
  let updated = 0;
  for (const d of drivers) {
    const rides = d.carNumber ? (full.get(d.carNumber) ?? 0) : 0;
    const tier = rides >= t.olmos ? "Olmos" : rides >= t.oltin ? "Oltin" : rides >= t.kumush ? "Kumush" : "Bronza";
    await prisma.member.update({ where: { id: d.id }, data: { driverTier: tier } });
    updated++;
  }
  const { alertAdmins } = await import("./economyService");
  await alertAdmins(`🥇 Haydovchi tierlari yangilandi (${wk}): chegaralar K≥${t.kumush}/O≥${t.oltin}/Ol≥${t.olmos} safar — ${updated} haydovchi`).catch(() => undefined);
  return { updated, thresholds: t };
}

export interface NorthStar {
  weekCompleted: number; // THE number (completed rides, last 7 days)
  prevWeekCompleted: number;
  botShare: number; // % of completed rides that ran through our bot (RideReward)
  weeklyActiveRiders: number; // distinct bot riders with a ride this week
  coinLiability: number; // Σ member.coins — what we owe the ecosystem
}

export async function getNorthStar(): Promise<NorthStar> {
  const rows = await recentReports();
  const now = Date.now();
  let weekCompleted = 0;
  let prevWeekCompleted = 0;
  for (const r of rows) {
    if (!DONE.has(r.status)) continue;
    const t = Date.parse(r.at);
    if (!Number.isFinite(t)) continue;
    if (t >= now - WEEK_MS) weekCompleted++;
    else if (t >= now - 2 * WEEK_MS) prevWeekCompleted++;
  }
  const since = new Date(now - WEEK_MS);
  const [botRides, riders, liability] = await Promise.all([
    prisma.rideReward.count({ where: { createdAt: { gte: since } } }),
    prisma.rideReward.findMany({ where: { createdAt: { gte: since } }, select: { memberId: true }, distinct: ["memberId"] }),
    prisma.member.aggregate({ _sum: { coins: true } }),
  ]);
  return {
    weekCompleted,
    prevWeekCompleted,
    botShare: weekCompleted ? Math.round((botRides / weekCompleted) * 100) : 0,
    weeklyActiveRiders: riders.length,
    coinLiability: Math.round(liability._sum.coins ?? 0),
  };
}
