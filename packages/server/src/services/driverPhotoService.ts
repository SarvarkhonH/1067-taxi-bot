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
/** ⚡ file_id → URL KESHI (ega, 2026-07-28 — «do'kon qotmoqda»): har rasm so'rovi avval
 *  Telegram'ga `getFile` yuborardi, ya'ni 24 kafelli ekran = 24 ta ortiqcha aylanma (Telegram
 *  serverigacha borib-kelish). `file_path` bir necha soat barqaror, shuning uchun 45 daqiqa
 *  keshlaymiz — TTL Telegram URL amal qilish muddatidan (~1 soat) qisqa qilib olindi. */
const fileUrlCache = new Map<string, { url: string; at: number }>();
const FILE_URL_TTL_MS = 45 * 60_000;

export async function resolveTelegramFileUrl(fileId: string): Promise<string | null> {
  if (!env.BOT_TOKEN) return null;
  const hit = fileUrlCache.get(fileId);
  if (hit && Date.now() - hit.at < FILE_URL_TTL_MS) return hit.url;
  try {
    const res = await fetch(`${TG_API}/bot${env.BOT_TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`);
    const data = (await res.json()) as { ok: boolean; result?: { file_path?: string } };
    if (!data.ok || !data.result?.file_path) return null;
    const url = `${TG_API}/file/bot${env.BOT_TOKEN}/${data.result.file_path}`;
    if (fileUrlCache.size > 5_000) fileUrlCache.clear(); // xotira chegarasi (driver-photo naqshi)
    fileUrlCache.set(fileId, { url, at: Date.now() });
    return url;
  } catch {
    return null;
  }
}

/** Admin upload — receives raw image bytes (from the admin panel), pushes them to Telegram via
 *  bot.sendPhoto, captures the durable file_id. Telegram becomes the storage; our DB stores ~30
 *  chars. The bot sends the photo to the primary admin's DM (silent, no notification) — owner can
 *  delete that copy at will; the file_id keeps working forever. Returns null on failure. */
export async function uploadDriverPhotoFromBuffer(memberId: number, buf: Buffer, mime = "image/jpeg"): Promise<string | null> {
  if (!env.BOT_TOKEN) return null;

  // Fast path: if ADMIN_TELEGRAM_IDS is set, use Telegram CDN (durable file_id)
  const adminId = env.adminIds.find((id) => id.trim() !== "");
  if (adminId) {
    try {
      const form = new FormData();
      form.append("chat_id", adminId);
      form.append("photo", new Blob([buf], { type: mime }), "driver.jpg");
      form.append("caption", `📷 Driver portrait upload · member ${memberId}`);
      form.append("disable_notification", "true");
      const res = await fetch(`${TG_API}/bot${env.BOT_TOKEN}/sendPhoto`, { method: "POST", body: form });
      const data = (await res.json()) as { ok: boolean; result?: { photo?: { file_id: string }[] } };
      if (data.ok && data.result?.photo?.length) {
        const biggest = data.result.photo[data.result.photo.length - 1]!;
        await prisma.member.update({ where: { id: memberId }, data: { photoFileId: biggest.file_id, photoUrl: null } });
        return biggest.file_id;
      }
    } catch {
      // fall through to data-URL fallback
    }
  }

  // Fallback: store as base64 data-URL directly in photoUrl (no external storage needed)
  const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;
  await prisma.member.update({ where: { id: memberId }, data: { photoUrl: dataUrl, photoFileId: null } });
  return "data-url";
}

/** Admin clear — wipe a stored portrait (file_id, override URL, and any pending submission). */
export async function clearDriverPhoto(memberId: number): Promise<void> {
  await prisma.member.update({ where: { id: memberId }, data: { photoFileId: null, photoUrl: null, photoPendingFileId: null } });
}

// ── 🧑‍✈️ Driver self-submit + admin moderation ────────────────────────────────────────────────
/** A driver submitted a photo via the bot → park it as PENDING (not shown to riders yet). Replaces
 *  any earlier pending submission. The currently-approved photo (if any) stays live until approved. */
export async function submitPendingDriverPhoto(memberId: number, fileId: string): Promise<void> {
  await prisma.member.update({ where: { id: memberId }, data: { photoPendingFileId: fileId } });
}

/** Admin approves the pending photo → it becomes the live portrait. Returns the driver (for notify). */
export async function approveDriverPhoto(memberId: number): Promise<{ id: number; fullName: string; telegramId: string | null } | null> {
  const m = await prisma.member.findUnique({ where: { id: memberId }, select: { photoPendingFileId: true, fullName: true } });
  if (!m?.photoPendingFileId) return null;
  await prisma.member.update({ where: { id: memberId }, data: { photoFileId: m.photoPendingFileId, photoUrl: null, photoPendingFileId: null } });
  const tu = await prisma.telegramUser.findFirst({ where: { memberId }, select: { id: true } });
  return { id: memberId, fullName: m.fullName, telegramId: tu?.id ?? null };
}

/** Admin rejects the pending photo → cleared, the approved one (if any) is untouched. */
export async function rejectDriverPhoto(memberId: number): Promise<{ id: number; fullName: string; telegramId: string | null } | null> {
  const m = await prisma.member.findUnique({ where: { id: memberId }, select: { fullName: true } });
  if (!m) return null;
  await prisma.member.update({ where: { id: memberId }, data: { photoPendingFileId: null } });
  const tu = await prisma.telegramUser.findFirst({ where: { memberId }, select: { id: true } });
  return { id: memberId, fullName: m.fullName, telegramId: tu?.id ?? null };
}

/** Linked drivers with NO approved photo yet — the broadcast target for "please upload a photo". */
export async function driversNeedingPhoto(): Promise<{ memberId: number; telegramId: string; fullName: string }[]> {
  const rows = await prisma.member.findMany({
    where: { type: "driver", photoFileId: null, photoUrl: null, telegramUser: { isNot: null } },
    select: { id: true, fullName: true, telegramUser: { select: { id: true } } },
  });
  return rows
    .filter((r) => r.telegramUser?.id)
    .map((r) => ({ memberId: r.id, telegramId: r.telegramUser!.id, fullName: r.fullName }));
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
