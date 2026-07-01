// 🗺 Booking 3.0 server layer:
//  - predictFare: REAL price stats from delivered bookingReports (probe 2026-06-12:
//    terminal status "delivered" carries real `payment`) — overall + per-address.
//  - nearbyPins: live driver map pins for the E1 map-first home.
//  - rateRide: E7 post-ride stars + quick tags (idempotent per booking).
import { prisma } from "../db";
import { getDataSource } from "../kas";
import { recentReports } from "./analyticsService";
import { kasMapSocket } from "./kasMapSocket";

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

export async function nearbyPins(): Promise<{ pins: { lat: number; lng: number; bearing: number; busy: boolean; id: string }[]; freeDrivers: number }> {
  // PRIMARY: the live WS fleet (kasMapSocket) — the SAME source the official rider app shows. The
  // REST drivers/byFilter snapshot carries lat/lng=0 (probed: 50 drivers, 0 with coords), so it was
  // returning ZERO pins — that's why the bot map had no cars. Use the socket; fall back to REST only
  // if the socket hasn't filled yet (fresh boot / disconnected).
  const live = kasMapSocket.livePins();
  if (live.length) {
    return { pins: live.slice(0, 40), freeDrivers: live.filter((p) => !p.busy).length };
  }
  if (!pinCache || Date.now() - pinCache.at > 45_000) {
    const pins = await getDataSource().getDriverPins().catch(() => []);
    pinCache = { at: Date.now(), pins };
  }
  let freeDrivers = 0;
  try {
    freeDrivers = (await getDataSource().getMainReport()).onlineDrivers || 0;
  } catch {
    /* optional */
  }
  // REST-fallback pins carry no car key → synthesize a stable per-position id so the client can still
  // reconcile markers by id. (index is stable within a 45s cache window; good enough for the glide.)
  return { pins: pinCache.pins.map((p, i) => ({ ...p, id: `r${i}` })), freeDrivers };
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
