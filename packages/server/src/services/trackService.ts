// 🛡 Share-my-trip (family safety): the rider mints an unguessable, ACTIVE-ONLY token; anyone with the
// link watches the trip READ-ONLY (car position + live fare + ETA + driver/car) until it ends. No login.
// The token reveals ONLY the public subset — never the rider's phone or any PII. Stored as an AppState
// row (track:<token> = {memberId, at}); 6h TTL and the active-booking check both hide a finished trip.
import crypto from "node:crypto";
import { prisma } from "../db";
import { getActiveBookingFor } from "./bookingService";

const TTL_MS = 6 * 60 * 60 * 1000;

export async function createTrackToken(memberId: number): Promise<string> {
  const token = crypto.randomBytes(9).toString("base64url"); // ~12 chars, unguessable
  await prisma.appState.upsert({
    where: { key: `track:${token}` },
    create: { key: `track:${token}`, value: JSON.stringify({ memberId, at: Date.now() }) },
    update: { value: JSON.stringify({ memberId, at: Date.now() }) },
  });
  return token;
}

export interface PublicTrip {
  active: boolean;
  status?: string;
  statusLabel?: string;
  addressName?: string;
  pickup?: { lat: number; lng: number } | null;
  fare?: number | null;
  etaMin?: number | null;
  driver?: { name: string; carModel: string; carNumber: string; rating?: number; lat?: number; lng?: number; bearing?: number } | null;
}

export async function resolveTrack(token: string): Promise<PublicTrip> {
  if (!/^[A-Za-z0-9_-]{6,24}$/.test(token)) return { active: false };
  const row = await prisma.appState.findUnique({ where: { key: `track:${token}` } }).catch(() => null);
  if (!row) return { active: false };
  let memberId = 0;
  let at = 0;
  try {
    const v = JSON.parse(row.value) as { memberId: number; at: number };
    memberId = v.memberId;
    at = v.at;
  } catch {
    return { active: false };
  }
  if (!memberId || Date.now() - at > TTL_MS) return { active: false };
  const b = await getActiveBookingFor(memberId).catch(() => null);
  if (!b) return { active: false }; // finished / cancelled → stop revealing position
  const d = b.driver;
  return {
    active: true,
    status: b.status,
    statusLabel: b.statusLabel,
    addressName: b.addressName,
    pickup: b.pickup,
    fare: d?.meterPayment ?? null,
    etaMin: b.etaMin,
    driver: d ? { name: d.fullName, carModel: d.carModel, carNumber: d.carNumber, rating: d.rating, lat: d.lat, lng: d.lng, bearing: d.bearing } : null,
  };
}
