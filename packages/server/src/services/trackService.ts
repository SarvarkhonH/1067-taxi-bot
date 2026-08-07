// 🛡 Share-my-trip (family safety): the rider mints an unguessable, ACTIVE-ONLY token; anyone with the
// link watches the trip READ-ONLY (car position + live fare + ETA + driver/car) until it ends. No login.
// The token reveals ONLY the public subset — never the rider's phone or any PII. Stored as an AppState
// row (track:<token> = {memberId, at}); 6h TTL and the active-booking check both hide a finished trip.
import crypto from "node:crypto";
import { prisma } from "../db";
import { env } from "../env";
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
  try {
    const v = JSON.parse(row.value) as { memberId: number; at: number };
    memberId = v.memberId;
    at = v.at;
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
