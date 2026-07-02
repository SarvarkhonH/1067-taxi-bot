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

// ── "capturing Koson" acquisition funnel — the are-we-winning scoreboard ──────
// All bot-native (RideReward = a completed BOT ride; a member's FIRST RideReward = their first bot
// ride, so this naturally counts riders NEW TO THE BOT, incl. existing 1067 customers who just joined).
export interface GrowthFunnel {
  newRiders7d: number; // riders whose first bot ride was in the last 7 days
  newRidersPrev7d: number; // the 7 days before that (trend)
  retentionPct: number; // of riders whose 1st ride was 8–30d ago, % who did a 2nd ride
  retentionCohort: number; // size of that cohort (keeps the % honest)
  acqEmission7d: number; // acquisition tanga emitted in 7d (first-ride + sharer bonuses)
  cacTanga: number; // acqEmission7d / newRiders7d — bonus cost per new rider
  viralPct: number; // % of new riders (7d) who arrived via referral/recruit (self-spread)
}

export async function getGrowthFunnel(): Promise<GrowthFunnel> {
  const now = Date.now();
  const d7 = now - WEEK_MS;
  const d14 = now - 2 * WEEK_MS;
  const d8 = now - 8 * 24 * 3600 * 1000;
  const d30 = now - 30 * 24 * 3600 * 1000;

  // one pass over RideReward: per-member FIRST ride + total ride count
  const grp = await prisma.rideReward.groupBy({ by: ["memberId"], _min: { createdAt: true }, _count: true });
  let newRiders7d = 0,
    newRidersPrev7d = 0,
    cohort = 0,
    cohortRetained = 0;
  const newMemberIds: number[] = [];
  for (const g of grp) {
    const first = g._min.createdAt?.getTime() ?? 0;
    const rides = g._count;
    if (first >= d7) {
      newRiders7d++;
      newMemberIds.push(g.memberId);
    } else if (first >= d14) {
      newRidersPrev7d++;
    }
    if (first >= d30 && first < d8) {
      cohort++;
      if (rides >= 2) cohortRetained++;
    }
  }
  const retentionPct = cohort ? Math.round((cohortRetained / cohort) * 100) : 0;

  // acquisition emission (7d): every first-ride/referral/recruit/driver→driver payout
  const acq = await prisma.coinTxn.aggregate({
    where: { kind: { in: ["referral", "recruit", "revshare", "drvrecruit"] }, amount: { gt: 0 }, createdAt: { gte: new Date(d7) } },
    _sum: { amount: true },
  });
  const acqEmission7d = Math.round(acq._sum.amount ?? 0);
  const cacTanga = newRiders7d ? Math.round(acqEmission7d / newRiders7d) : 0;

  // viral share: how many of THIS week's new riders arrived via a referral or a driver QR
  let viral = 0;
  if (newMemberIds.length) {
    const [tus, refs] = await Promise.all([
      prisma.telegramUser.findMany({ where: { memberId: { in: newMemberIds }, referredByCode: { not: null } }, select: { memberId: true } }),
      prisma.referral.findMany({ where: { refereeMemberId: { in: newMemberIds } }, select: { refereeMemberId: true } }),
    ]);
    const viralSet = new Set<number>();
    for (const t of tus) if (t.memberId != null) viralSet.add(t.memberId);
    for (const r of refs) if (r.refereeMemberId != null) viralSet.add(r.refereeMemberId);
    viral = viralSet.size;
  }
  const viralPct = newRiders7d ? Math.round((viral / newRiders7d) * 100) : 0;

  return { newRiders7d, newRidersPrev7d, retentionPct, retentionCohort: cohort, acqEmission7d, cacTanga, viralPct };
}

// ── 0.7 measurement baseline: weekly first-ride cohorts × D1/D7/D30 return ───────────────────────
// CUMULATIVE definition (fits sparse small-city data): dN = % of the cohort with ANY repeat ride
// within N days of their first. Phases 1-3 of NEXT_LEVEL_PLAN are judged against this baseline —
// measure BEFORE building loops. One read-only SQL pass over RideReward; no new tables.
export interface RetentionCohortRow {
  cohort: string; // ISO Monday of the first-ride week
  users: number;
  d1: number; // riders with a repeat ride ≤1 day after their first
  d7: number;
  d30: number;
}

export async function getRetentionCohorts(weeks = 10): Promise<RetentionCohortRow[]> {
  const rows = await prisma.$queryRaw<{ cohort: string; users: number; d1: number; d7: number; d30: number }[]>`
    WITH firsts AS (
      SELECT "memberId", MIN("createdAt") AS first_ride
      FROM "RideReward"
      GROUP BY "memberId"
    )
    SELECT to_char(date_trunc('week', f.first_ride), 'YYYY-MM-DD') AS cohort,
           COUNT(*)::int AS users,
           COUNT(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM "RideReward" r WHERE r."memberId" = f."memberId"
               AND r."createdAt" > f.first_ride AND r."createdAt" <= f.first_ride + interval '1 day'))::int AS d1,
           COUNT(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM "RideReward" r WHERE r."memberId" = f."memberId"
               AND r."createdAt" > f.first_ride AND r."createdAt" <= f.first_ride + interval '7 day'))::int AS d7,
           COUNT(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM "RideReward" r WHERE r."memberId" = f."memberId"
               AND r."createdAt" > f.first_ride AND r."createdAt" <= f.first_ride + interval '30 day'))::int AS d30
    FROM firsts f
    WHERE f.first_ride >= NOW() - (${weeks} * interval '7 day')
    GROUP BY 1
    ORDER BY 1 DESC`;
  return rows.map((r) => ({ cohort: r.cohort, users: Number(r.users), d1: Number(r.d1), d7: Number(r.d7), d30: Number(r.d30) }));
}
