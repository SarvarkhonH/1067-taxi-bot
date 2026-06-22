// 📊 Bosqich 4 — driver-side report aggregation for /safarlarim + /daromad. Pulls the driver's own
// kas reports (via their stored session creds) and rolls them up into today's figures. Read-only:
// no money path, no flag (the data is the driver's own, gated only by /driver_login). A short cache
// avoids hammering kas when a driver taps around.
import { getDriverSession } from "./driverAuth";
import { getDriverBookingHistory, getDriverPaymentHistory, type DriverRide, type DriverLedgerRow } from "./kasDriverApi";

const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; val: unknown }>();
async function cached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.val as T;
  const val = await fetcher();
  cache.set(key, { at: Date.now(), val });
  return val;
}

// Koson is UTC+5 — start-of-today in ms, local. kas's dateInMillisecond filter is day-based.
function startOfTodayMs(): number {
  const d = new Date();
  d.setUTCHours(d.getUTCHours() + 5); // shift into Koson local
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCHours(d.getUTCHours() - 5); // back to UTC instant of local midnight
  return d.getTime();
}

export interface DriverRidesReport {
  ok: boolean;
  reason?: "not_logged_in";
  carNumber?: string;
  rides?: DriverRide[];
  count?: number;
  totalFare?: number;
}

/** Today's rides for the logged-in driver. */
export async function getDriverRidesToday(memberId: number): Promise<DriverRidesReport> {
  const session = await getDriverSession(memberId);
  if (!session) return { ok: false, reason: "not_logged_in" };
  const rides = await cached(`rides:${memberId}`, () => getDriverBookingHistory(session.carNumber, session.secretKey, startOfTodayMs()));
  const totalFare = rides.reduce((s, r) => s + r.payment, 0);
  return { ok: true, carNumber: session.carNumber, rides, count: rides.length, totalFare };
}

export interface DriverEarningsReport {
  ok: boolean;
  reason?: "not_logged_in";
  carNumber?: string;
  ledger?: DriverLedgerRow[];
  earnedToday?: number; // Σ payment of "booking"-type rows today
  debtPaidToday?: number; // Σ payment of "debt"-type rows today
  latestBalance?: number;
  latestDebt?: number;
}

/** Today's earnings ledger for the logged-in driver. The ledger rows ARE the honest take-home view
 *  (each shows old→new balance + old→new debt, so commission shows as the balance delta). */
export async function getDriverEarningsToday(memberId: number): Promise<DriverEarningsReport> {
  const session = await getDriverSession(memberId);
  if (!session) return { ok: false, reason: "not_logged_in" };
  const ledger = await cached(`earn:${memberId}`, () => getDriverPaymentHistory(session.carNumber, session.secretKey, startOfTodayMs()));
  const earnedToday = ledger.filter((r) => r.type === "booking").reduce((s, r) => s + r.payment, 0);
  const debtPaidToday = ledger.filter((r) => r.type === "debt").reduce((s, r) => s + r.payment, 0);
  // ledger is newest-first → row[0] carries the latest balance/debt
  const latest = ledger[0];
  return {
    ok: true,
    carNumber: session.carNumber,
    ledger,
    earnedToday,
    debtPaidToday,
    latestBalance: latest?.newBalance,
    latestDebt: latest?.newDebt,
  };
}

/** TEST-ONLY: clear the in-memory cache so a test sees fresh data. */
export function __clearDriverReportCache(): void {
  cache.clear();
}
