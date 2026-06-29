// 📷 Driver portraits: synced once from each linked driver's Telegram profile photo, then served
// to riders via /api/driver-photo/:memberId. We store the durable Telegram file_id (it never
// changes for a given photo), and resolve to a fresh CDN URL on demand via getFile (the URL
// itself has a ~1h TTL — file_id is the long-lived handle). Owner can override with a permanent
// URL (Member.photoUrl, e.g. Cloudinary) for cases where the Telegram avatar isn't suitable.
import { prisma } from "../db";
import { env } from "../env";

const TG_API = "https://api.telegram.org";

interface ResolvedPhoto {
  url: string;
  source: "override" | "telegram";
}

/** Pull this driver's largest Telegram profile photo + store its file_id. Returns true if a photo
 *  was captured (false if the user has no public profile photo, or isn't linked to the bot). */
export async function syncDriverPhotoFromTelegram(memberId: number): Promise<boolean> {
  if (!env.BOT_TOKEN) return false;
  const tu = await prisma.telegramUser.findFirst({ where: { memberId }, select: { id: true } });
  if (!tu) return false;
  try {
    const res = await fetch(`${TG_API}/bot${env.BOT_TOKEN}/getUserProfilePhotos?user_id=${tu.id}&limit=1`);
    const data = (await res.json()) as { ok: boolean; result?: { photos?: { file_id: string }[][] } };
    if (!data.ok || !data.result?.photos?.length) return false;
    const sizes = data.result.photos[0];
    if (!sizes?.length) return false;
    const biggest = sizes[sizes.length - 1]!; // largest variant
    await prisma.member.update({ where: { id: memberId }, data: { photoFileId: biggest.file_id } });
    return true;
  } catch {
    return false;
  }
}

/** Resolve the current CDN URL for a stored Telegram file_id (TTL ~1h, but we ALWAYS resolve fresh
 *  per request so staleness isn't a concern). Returns null on any failure. */
export async function resolveTelegramFileUrl(fileId: string): Promise<string | null> {
  if (!env.BOT_TOKEN) return null;
  try {
    const res = await fetch(`${TG_API}/bot${env.BOT_TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`);
    const data = (await res.json()) as { ok: boolean; result?: { file_path?: string } };
    if (!data.ok || !data.result?.file_path) return null;
    return `${TG_API}/file/bot${env.BOT_TOKEN}/${data.result.file_path}`;
  } catch {
    return null;
  }
}

/** Top-level resolver — checks the override URL first (permanent), then Telegram file_id (live
 *  resolve). Used by the proxy endpoint. Returns null when no photo is configured for this member. */
export async function resolveDriverPhoto(memberId: number): Promise<ResolvedPhoto | null> {
  const m = await prisma.member.findUnique({ where: { id: memberId }, select: { photoUrl: true, photoFileId: true } });
  if (!m) return null;
  if (m.photoUrl) return { url: m.photoUrl, source: "override" };
  if (m.photoFileId) {
    const url = await resolveTelegramFileUrl(m.photoFileId);
    if (url) return { url, source: "telegram" };
  }
  return null;
}

/** Has this driver got a photo configured? Cheap DB read — used by the booking sweep to decide
 *  whether to emit a photoUrl in BookingDriverView (saves the rider a wasted /api round-trip). */
export async function driverHasPhoto(memberId: number): Promise<boolean> {
  const m = await prisma.member.findUnique({ where: { id: memberId }, select: { photoUrl: true, photoFileId: true } });
  return !!(m?.photoUrl || m?.photoFileId);
}

/** Bulk sync — admin one-shot to populate all linked drivers at once. Idempotent: re-running just
 *  refreshes file_ids (drivers who changed their avatar get the new one). */
export async function syncAllLinkedDriverPhotos(): Promise<{ checked: number; captured: number }> {
  const drivers = await prisma.member.findMany({
    where: { type: "driver", telegramUser: { isNot: null } },
    select: { id: true },
  });
  let captured = 0;
  for (const d of drivers) {
    const ok = await syncDriverPhotoFromTelegram(d.id);
    if (ok) captured++;
    // gentle rate limit — Telegram API friendly (~30 req/s ceiling; we go far below)
    await new Promise((r) => setTimeout(r, 80));
  }
  return { checked: drivers.length, captured };
}
