// 🗺 Booking 3.0 server layer:
//  - predictFare: REAL price stats from delivered bookingReports (probe 2026-06-12:
//    terminal status "delivered" carries real `payment`) — overall + per-address.
//  - nearbyPins: live driver map pins for the E1 map-first home.
//  - rateRide: E7 post-ride stars + quick tags (idempotent per booking).
import { prisma } from "../db";
import { getDataSource } from "../kas";
import type { NearbyFreeCars } from "../kas/types";
import { recentReports } from "./analyticsService";

const DONE = new Set(["delivered", "completed", "finished"]);

export interface FarePrediction {
  rides: number;
  avg: number;
  p50: number;
  byAddress?: { name: string; avg: number; rides: number } | null;
}

export async function predictFare(addressName?: string): Promise<FarePrediction> {
  const rows = (await recentReports()).filter((r) => DONE.has(r.status) && r.payment > 0);
  const pays = rows.map((r) => r.payment).sort((a, b) => a - b);
  const avg = pays.length ? Math.round(pays.reduce((a, b) => a + b, 0) / pays.length) : 0;
  const p50 = pays.length ? Math.round(pays[Math.floor(pays.length / 2)]!) : 0;
  let byAddress: FarePrediction["byAddress"] = null;
  if (addressName) {
    const q = addressName.toLowerCase();
    const sub = rows.filter((r) => r.addressName.toLowerCase().includes(q));
    if (sub.length >= 3) {
      byAddress = {
        name: addressName,
        avg: Math.round(sub.reduce((a, r) => a + r.payment, 0) / sub.length),
        rides: sub.length,
      };
    }
  }
  return { rides: pays.length, avg, p50, byAddress };
}

let pinCache: { at: number; pins: { lat: number; lng: number; bearing: number; busy: boolean }[] } | null = null;
// The taxi core reads these from the drivers' own GPS stream (Redis, refreshed every few seconds),
// and the call never leaves the machine — so the cache only has to absorb a burst of riders opening
// the map at once, not protect a slow upstream. Ten seconds keeps the cars moving.
const PIN_TTL_MS = 10_000;

export async function nearbyPins(opts: { honest?: boolean } = {}): Promise<{ pins: { lat: number; lng: number; bearing: number; busy: boolean; id: string }[]; freeDrivers: number }> {
  if (!pinCache || Date.now() - pinCache.at > PIN_TTL_MS) {
    const pins = await getDataSource().getDriverPins().catch(() => pinCache?.pins ?? []);
    pinCache = { at: Date.now(), pins };
  }
  // Free cars on the map ARE the honest count; the daily report's online figure is the fallback
  // for a map with no fixes yet (fresh boot, drivers' GPS still connecting).
  let freeDrivers = pinCache.pins.filter((p) => !p.busy).length;
  // `honest` (livecars): "online" counts cars carrying passengers too, so it is not a free-car number.
  if (!freeDrivers && !opts.honest) {
    try {
      freeDrivers = (await getDataSource().getMainReport()).onlineDrivers || 0;
    } catch {
      /* optional */
    }
  }
  // Pins carry no identity (privacy: a passenger must not be able to follow a named driver) → a
  // per-position id lets the client reconcile markers within one cache window.
  return { pins: pinCache.pins.slice(0, 40).map((p, i) => ({ ...p, id: `r${i}` })), freeDrivers };
}

// 🚕 B qism P0-3: free cars around a point for the taxi screen. The core does the hiding and answers
// from a 15 s town snapshot per 1 km query cell; this only absorbs a burst of riders. Keyed by a
// ~1.1 km square (2 decimals), 5 s, bounded.
const FREE_TTL_MS = 5_000;
const freeCache = new Map<string, { at: number; value: NearbyFreeCars }>();

export async function nearbyFree(lat: number, lng: number): Promise<NearbyFreeCars> {
  const key = `${lat.toFixed(2)}:${lng.toFixed(2)}`;
  const hit = freeCache.get(key);
  if (hit && Date.now() - hit.at < FREE_TTL_MS) return hit.value;
  // Ask for the square's corner, not the rider's exact point: every rider in the square gets one answer.
  const value = await getDataSource()
    .getNearbyFreeCars(Number(lat.toFixed(2)), Number(lng.toFixed(2)))
    .catch((): NearbyFreeCars => ({ freeCount: null, cars: [] })); // unknown — never "no cars"
  if (freeCache.size > 2_000) freeCache.clear(); // bound memory
  freeCache.set(key, { at: Date.now(), value });
  return value;
}

export const RATING_TAGS = ["Toza mashina", "Xushmuomala", "Tez yetib keldi", "Sekin haydadi", "Mashina eski"];

export async function rateRide(
  memberId: number,
  bookingId: number,
  stars: number,
  tags: string[],
): Promise<{ ok: boolean; reason?: string }> {
  const s = Math.round(stars);
  if (s < 1 || s > 5) return { ok: false, reason: "bad_stars" };
  const m = await prisma.member.findUnique({ where: { id: memberId }, select: { lastBookingCar: true, lastBookingId: true } });
  if (!m) return { ok: false, reason: "not_your_ride" };
  // P1 (QA fleet): the rating window was effectively ZERO — the finish-sweep nulls lastBookingId
  // before the Mini App can prompt, so `lastBookingId === bookingId` always failed. Accept a
  // DURABLE ownership signal: the member has a RideReward for this ride (created at finish), OR
  // it's still their current ride. Double-rating is still blocked by the RideRating unique key.
  const owns =
    m.lastBookingId === bookingId ||
    (await prisma.rideReward.findFirst({ where: { memberId, bookingId }, select: { id: true } })) !== null;
  if (!owns) return { ok: false, reason: "not_your_ride" };
  const clean = tags.filter((t) => RATING_TAGS.includes(t)).slice(0, 3);
  try {
    await prisma.rideRating.create({
      data: { memberId, bookingId, carNumber: m.lastBookingCar ?? "", stars: s, tags: clean.join(",") },
    });
  } catch {
    return { ok: false, reason: "already" };
  }
  return { ok: true };
}

/** Driver-360: rating summary + tag cloud for a car. */
export async function carRatingSummary(carNumber: string): Promise<{ avg: number; count: number; tags: { tag: string; n: number }[] }> {
  const rows = await prisma.rideRating.findMany({ where: { carNumber }, take: 500, orderBy: { id: "desc" } });
  const count = rows.length;
  const avg = count ? Math.round((rows.reduce((a, r) => a + r.stars, 0) / count) * 10) / 10 : 0;
  const tagN = new Map<string, number>();
  for (const r of rows) for (const t of r.tags.split(",").filter(Boolean)) tagN.set(t, (tagN.get(t) ?? 0) + 1);
  return { avg, count, tags: [...tagN.entries()].map(([tag, n]) => ({ tag, n })).sort((a, b) => b.n - a.n) };
}
