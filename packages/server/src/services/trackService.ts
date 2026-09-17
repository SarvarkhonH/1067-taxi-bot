// 🛡 Share-my-trip (family safety): the rider mints an unguessable, ACTIVE-ONLY token; anyone with the
// link watches the trip READ-ONLY (car position + live fare + ETA + driver/car) until it ends. No login.
// The token reveals ONLY the public subset — never the rider's phone or any PII. Stored as an AppState
// row (track:<token> = {memberId, at, bookingId}); 6h TTL and the active-booking check both hide a finished trip.
// The token is bound to ONE booking: a link shared for this ride must not show the rider's NEXT ride
// (driver position, pickup) to whoever still holds it — an independent review found exactly that.
import crypto from "node:crypto";
import { prisma } from "../db";
import { env } from "../env";
import { getActiveBookingFor } from "./bookingService";
import { trackTokenShows } from "@t1067/shared";

const TTL_MS = 6 * 60 * 60 * 1000;

/** A link for the rider's CURRENT ride, or null: no ride, or the core could not say which one it is. */
export async function createTrackToken(memberId: number): Promise<string | null> {
  const active = await getActiveBookingFor(memberId, { strict: true }).catch(() => null);
  if (!active) return null;
  const token = crypto.randomBytes(9).toString("base64url"); // ~12 chars, unguessable
  const value = JSON.stringify({ memberId, at: Date.now(), bookingId: active.id, v: 2 });
  await prisma.appState.upsert({
    where: { key: `track:${token}` },
    create: { key: `track:${token}`, value },
    update: { value },
  });
  return token;
}



export interface PublicTrip {
  active: boolean;
  ended?: boolean; // trip finished (vs bad/expired token) → end screen still shows the viral CTA
  status?: string;
  statusLabel?: string;
  addressName?: string;
  pickup?: { lat: number; lng: number } | null;
  fare?: number | null;
  etaMin?: number | null;
  driver?: { name: string; carModel: string; carNumber: string; rating?: number; lat?: number; lng?: number; bearing?: number } | null;
  // 🛡→👥 trackcta flag: the sharer's referral deep-link ("birinchi safar bepul" banner target).
  // Server-gated — absent means the public page renders exactly as before. Never carries PII:
  // the code is the same 6-char invite code the sharer already hands out publicly.
  ctaLink?: string | null;
  // Win-badge fusion: the rider won a mid-ride wheel prize on THIS booking — the family viewer
  // sees "sovg'a oldi" (never the amount — win-publicity stays halal-safe). trackcta-gated.
  won?: boolean;
}

export async function resolveTrack(token: string): Promise<PublicTrip> {
  if (!/^[A-Za-z0-9_-]{6,24}$/.test(token)) return { active: false };
  const row = await prisma.appState.findUnique({ where: { key: `track:${token}` } }).catch(() => null);
  if (!row) return { active: false };
  let memberId = 0;
  let at = 0;
  let bookingId: number | null = null;
  let legacy = true;
  try {
    const v = JSON.parse(row.value) as { memberId: number; at: number; bookingId?: number | null; v?: number };
    memberId = v.memberId;
    at = v.at;
    bookingId = typeof v.bookingId === "number" ? v.bookingId : null;
    legacy = v.v !== 2;
  } catch {
    return { active: false };
  }
  if (!memberId || Date.now() - at > TTL_MS) return { active: false };

  // Viral CTA (trackcta flag): the sharer's referral deep-link. Resolved from memberId ALONE (no
  // booking needed) so it can also ride the TRIP-END screen — the peak viral moment: the family
  // viewer is relieved ("yaxshi yetib oldi"), most receptive to "senga ham kerak". Best-effort;
  // a lookup failure never breaks the safety page. Same 6-char public invite code — no PII.
  let ctaLink: string | null = null;
  const trackCtaOn = await import("./featureFlags").then((f) => f.featureOn("trackcta")).catch(() => false);
  if (trackCtaOn) {
    try {
      const tu = await prisma.telegramUser.findFirst({ where: { memberId }, select: { id: true } });
      if (tu) {
        const { getOrCreateCode } = await import("./referralService");
        ctaLink = `https://t.me/${env.BOT_USERNAME}?start=reft_${await getOrCreateCode(tu.id)}`;
      }
    } catch {
      ctaLink = null;
    }
  }

  const b = await getActiveBookingFor(memberId).catch(() => null);
  // finished / cancelled → stop revealing position, BUT keep the CTA so the end screen can invite.
  if (!b) return { active: false, ended: true, ctaLink };
  const bound = trackTokenShows(bookingId, b.id, legacy);
  if (bound === "other") return { active: false, ended: true, ctaLink }; // the shared ride is over; this is a new one
  if (bound === "bind") {
    await prisma.appState
      .update({ where: { key: row.key }, data: { value: JSON.stringify({ memberId, at, bookingId: b.id }) } })
      .catch(() => undefined);
  }
  const d = b.driver;
  // win-badge fusion: a winning mid-ride spin on THIS booking → "sovg'a oldi" (amount never shown)
  let won = false;
  if (trackCtaOn) {
    const spin = await prisma.wheelSpin
      .findUnique({ where: { memberId_bookingId: { memberId, bookingId: b.id } } })
      .catch(() => null);
    won = !!spin && spin.amount > 0;
  }
  return {
    active: true,
    ctaLink,
    won,
    status: b.status,
    statusLabel: b.statusLabel,
    addressName: b.addressName,
    pickup: b.pickup,
    fare: d?.meterPayment ?? null,
    etaMin: b.etaMin,
    driver: d ? { name: d.fullName, carModel: d.carModel, carNumber: d.carNumber, rating: d.rating, lat: d.lat, lng: d.lng, bearing: d.bearing } : null,
  };
}
