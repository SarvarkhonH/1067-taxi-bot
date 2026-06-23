// 📊 Driver-side report aggregation for the /driver panel + Mini App. The driver is ALREADY linked
// (phone → kas member, type=driver, carNumber mirrored from kas), so NO /driver_login is needed —
// every read here uses the member's own plate + the ADMIN kas client (getRidesByCar, getDriverAccount).
// Read-only, no money path. A short cache avoids hammering kas when a driver taps around.
import { prisma } from "../db";
import { getDataSource } from "../kas";
import { featureOn } from "./featureFlags";
import type { RideHistoryItem } from "../kas/types";

const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; val: unknown }>();
async function cached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.val as T;
  const val = await fetcher();
  cache.set(key, { at: Date.now(), val });
  return val;
}

// Koson is UTC+5 — count a ride against the LOCAL day so late-night rides land on the right date.
function kosonDay(at: string | Date): string {
  const d = new Date(at);
  if (isNaN(d.getTime())) return "";
  d.setUTCHours(d.getUTCHours() + 5);
  return d.toISOString().slice(0, 10);
}
function todayKoson(): string {
  return kosonDay(new Date());
}

/** The member's plate if they're a linked driver, else null. */
async function driverCar(memberId: number): Promise<string | null> {
  const m = await prisma.member.findUnique({ where: { id: memberId }, select: { type: true, carNumber: true } });
  if (m?.type !== "driver" || !m.carNumber) return null;
  return m.carNumber;
}

/** This car's recent rides (admin getRidesByCar), cached. */
async function recentRides(memberId: number, carNumber: string): Promise<RideHistoryItem[]> {
  return cached(`rides:${memberId}`, () => getDataSource().getRidesByCar(carNumber, 25).catch(() => [] as RideHistoryItem[]));
}

export interface DriverRidesReport {
  ok: boolean;
  reason?: "not_driver";
  carNumber?: string;
  rides?: RideHistoryItem[];
  count?: number;
  totalFare?: number;
}

/** Today's rides for the linked driver (filtered to the Koson day). */
export async function getDriverRidesToday(memberId: number): Promise<DriverRidesReport> {
  const carNumber = await driverCar(memberId);
  if (!carNumber) return { ok: false, reason: "not_driver" };
  const all = await recentRides(memberId, carNumber);
  const today = todayKoson();
  const rides = all.filter((r) => kosonDay(r.at) === today);
  const totalFare = rides.reduce((s, r) => s + r.payment, 0);
  return { ok: true, carNumber, rides, count: rides.length, totalFare };
}

export interface DriverEarningsReport {
  ok: boolean;
  reason?: "not_driver";
  carNumber?: string;
  earnedToday?: number; // Σ fare of today's rides
  debtPaidToday?: number; // Σ tanga debt-payments we processed today (our own log)
  balance?: number; // current kas wallet
  debt?: number; // current kas debt
}

/** Today's earnings snapshot: today's ride fares + current kas balance/debt + our debt-payments. */
export async function getDriverEarningsToday(memberId: number): Promise<DriverEarningsReport> {
  const carNumber = await driverCar(memberId);
  if (!carNumber) return { ok: false, reason: "not_driver" };
  const [all, acct, debtPaid] = await Promise.all([
    recentRides(memberId, carNumber),
    getDataSource().getDriverAccount(carNumber).catch(() => null),
    // our own confirmed debt-payments today (the part WE moved)
    prisma.driverDebtPayment.aggregate({
      where: { memberId, status: "confirmed", createdAt: { gte: new Date(`${todayKoson()}T00:00:00.000Z`) } },
      _sum: { amount: true },
    }).catch(() => ({ _sum: { amount: 0 } })),
  ]);
  const today = todayKoson();
  const earnedToday = all.filter((r) => kosonDay(r.at) === today).reduce((s, r) => s + r.payment, 0);
  return {
    ok: true,
    carNumber,
    earnedToday,
    debtPaidToday: debtPaid._sum.amount ?? 0,
    balance: acct?.balance,
    debt: acct?.debt,
  };
}

export interface HotZone {
  name: string;
  count: number;
}
export interface DriverPanelExtras {
  linked: boolean; // is a linked driver (type=driver + carNumber)
  carNumber?: string;
  balance?: number;
  debt?: number;
  ridesToday?: number;
  fareToday?: number;
  canPayDebt?: boolean; // qarz feature flag is on AND there's debt
  // enrichment
  rating?: number;
  takeCount?: number;
  cancelCount?: number;
  blocked?: boolean; // kas account disabled → driver can't take orders
  dispatcherPhones?: string[]; // company hotlines (tap-to-call)
  hotZones?: HotZone[]; // this driver's most-frequent pickup areas (where to wait)
}

/** Top pickup areas from a driver's recent rides (where they earn most → "where to wait"). */
function computeHotZones(rides: RideHistoryItem[]): HotZone[] {
  const tally = new Map<string, number>();
  for (const r of rides) {
    const name = (r.addressName || "").trim();
    if (!name || name === "-") continue;
    tally.set(name, (tally.get(name) ?? 0) + 1);
  }
  return [...tally.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);
}

/** One bundle for the unified /driver panel: kas balance/debt/rating + today's rides + dispatcher
 *  hotlines + hot zones. Read-only, degrades gracefully (kas unreachable → figures undefined). */
export async function getDriverPanelExtras(memberId: number): Promise<DriverPanelExtras> {
  const carNumber = await driverCar(memberId);
  if (!carNumber) return { linked: false };
  const [acct, all, qarzOn, company] = await Promise.all([
    getDataSource().getDriverAccount(carNumber).catch(() => null),
    recentRides(memberId, carNumber),
    featureOn("qarz").catch(() => false),
    getDataSource().getCompanyInfo().catch(() => null),
  ]);
  const today = todayKoson();
  const todays = all.filter((r) => kosonDay(r.at) === today);
  const fareToday = todays.reduce((s, r) => s + r.payment, 0);
  return {
    linked: true,
    carNumber,
    balance: acct?.balance,
    debt: acct?.debt,
    ridesToday: todays.length,
    fareToday,
    canPayDebt: qarzOn && (acct?.debt ?? 0) > 0,
    rating: acct?.rating,
    takeCount: acct?.takeCount,
    cancelCount: acct?.cancelCount,
    blocked: acct?.active === false,
    dispatcherPhones: company?.dispatcherPhones ?? [],
    hotZones: computeHotZones(all),
  };
}

/** TEST-ONLY: clear the in-memory cache so a test sees fresh data. */
export function __clearDriverReportCache(): void {
  cache.clear();
}
