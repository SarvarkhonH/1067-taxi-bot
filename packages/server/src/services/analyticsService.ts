// A4 analytics: the REAL numbers that gate Wave B decisions.
// - north-star: weekly completed rides (Uber/Lyft's NSM) + bot share + WAU
// - driver distribution: rides/driver last 7 days — tier thresholds come from
//   these PERCENTILES, never from guesses (plan: IV.1).
// Data source: kas bookingReports, paged 50/row in rate-limit-polite batches,
// cached 10 minutes. REALITY CHECK (live, 2026-06-16): kas emits ~1650 report
// rows/DAY (≈10× the old "165/day" guess), so the 40-page (~2100-row) cap spans
// only ~1.3 days. That is plenty for "today" metrics, but the WEEK-OVER-WEEK
// numbers (prevWeek*, getOpsPulse "prev") will read ~0 — reaching 7+ days would
// need ~260 pages, too heavy to fetch politely every 10 min. The correct fix for
// "vs last week" is a LOCAL daily-rollup table fed by the sweep, NOT deeper kas
// paging (separate follow-up). What WAS fixed here: a rate-limited page no longer
// masquerades as end-of-data and truncates the window early.
import { prisma } from "../db";
import { getDataSource, type RideHistoryItem } from "../kas";

const DONE = new Set(["delivered", "completed", "finished"]); // kas reports vocab: terminal = "delivered" (probe 2026-06-12)
const WEEK_MS = 7 * 24 * 3600 * 1000;

// Report-window paging config. kas silently caps page size ~50; we page in
// rate-limit-polite parallel batches up to a 2-week cutoff.
const REPORTS_WINDOW_DAYS = 14; // cutoff target; at real volume MAX_PAGES binds first (~1.3 days)
const REPORTS_MAX_PAGES = 40; // ~2100 rows; polite ceiling — deeper needs a local rollup, not more pages
const REPORTS_PAGE_SIZE = 50;
const REPORTS_BATCH = 3; // pages per parallel batch (AUDIT 2.8: 8-20s → ~1/3)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Fetch one reports page, retrying transient failures (kas 429 / network — note
// getJson does NOT retry data 429s, only login does). Returns the rows on
// success (possibly []), or null after persistent failure. null is DISTINCT
// from [] so a rate-limited page is NEVER mistaken for the real end of data
// (the old `.catch(() => [])` conflated them → premature stop → shallow window).
async function fetchReportsPage(ds: ReturnType<typeof getDataSource>, page: number): Promise<RideHistoryItem[] | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await ds.getReportsPage(page, REPORTS_PAGE_SIZE);
    } catch {
      if (attempt < 2) await sleep(500 * (attempt + 1)); // 0.5s → 1s backoff, polite to kas 429
    }
  }
  return null;
}

let cache: { at: number; rows: RideHistoryItem[] } | null = null;
export async function recentReports(): Promise<RideHistoryItem[]> {
  if (cache && Date.now() - cache.at < 600_000) return cache.rows;
  const ds = getDataSource();
  const rows: RideHistoryItem[] = [];
  const cutoff = Date.now() - REPORTS_WINDOW_DAYS * 24 * 3600 * 1000;
  let stop = false;
  for (let base = 0; base < REPORTS_MAX_PAGES && !stop; base += REPORTS_BATCH) {
    const results = await Promise.all(Array.from({ length: REPORTS_BATCH }, (_, i) => fetchReportsPage(ds, base + i)));
    // A whole batch of failures → kas is unreachable right now; stop hammering.
    if (results.every((p) => p === null)) break;
    for (const page of results) {
      if (page === null) continue; // transient page failure → SKIP, keep paging (was: premature stop)
      if (page.length === 0) {
        stop = true; // genuinely-empty page = the real end of the report history
        continue;
      }
      rows.push(...page);
      const oldest = Date.parse(page[page.length - 1]!.at);
      if (Number.isFinite(oldest) && oldest < cutoff) stop = true; // reached the 2-week window
    }
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
  weekCompleted: number; // completed rides, last 7 days (from the local DailyStat rollup)
  prevWeekCompleted: number; // completed rides, the 7 days before that
  botShare: number; // % of completed rides that ran through our bot (RideReward)
  weeklyActiveRiders: number; // distinct bot riders with a ride this week
  coinLiability: number; // Σ member.coins — what we owe the ecosystem
  weekDays: number; // DailyStat rows present in the last 7 days (week-compare meaningful at 7)
}

// week-over-week now comes from the local DailyStat rollup — kas can't serve 7
// days through bookingReports at real volume. weekCompleted is partial until the
// rollup accrues 7 days (weekDays < 7); the consumer can show that honestly.
export async function getNorthStar(): Promise<NorthStar> {
  const { sumDailyRange, addDays, tashkentDay } = await import("./rollupService");
  const today = tashkentDay();
  const [week, prev, riders, liability] = await Promise.all([
    sumDailyRange(addDays(today, -6), today), // last 7 days incl. today
    sumDailyRange(addDays(today, -13), addDays(today, -7)), // the 7 days before that
    prisma.rideReward.findMany({ where: { createdAt: { gte: new Date(Date.now() - WEEK_MS) } }, select: { memberId: true }, distinct: ["memberId"] }),
    prisma.member.aggregate({ _sum: { coins: true } }),
  ]);
  return {
    weekCompleted: week.completedRides,
    prevWeekCompleted: prev.completedRides,
    botShare: week.completedRides ? Math.round((week.botRides / week.completedRides) * 100) : 0,
    weeklyActiveRiders: riders.length,
    coinLiability: Math.round(liability._sum.coins ?? 0),
    weekDays: week.days,
  };
}
