// 🎀📹 RAVELLA HIKOYA (flag "ravellastory", RAVELLA_V2_PLAN §5).
//
// EGA QOIDALARI (2026-07-28, aynan shunday so'ralgan):
//   • Eng ko'pi 10 ta hikoya turadi.
//   • Cheksiz joylash mumkin — 11-chisi kelganda eng ESKISI avtomatik o'chadi (FIFO).
//   • 24 soatlik muddat YO'Q: hikoya o'zi eskirmaydi, faqat yangisi siqib chiqaradi.
//   • Rasm va QISQA video.
// Shu sababli bu yerda hech qanday `expiresAt` ham, tozalash-poller ham yo'q — chegara
// yozish paytida qo'llanadi, ya'ni jadval 10 satrdan oshmaydi (do'kon hikoyalaridan farqi shu).
import { prisma } from "../db";
import { featureOn } from "./featureFlags";

export const RAVELLA_STORY_MAX = 10;

function validId(id: number): boolean {
  return Number.isInteger(id) && id > 0;
}

export interface RavellaStoryItem {
  id: number;
  kind: "photo" | "video";
  caption: string | null;
  createdAt: string;
  seen: boolean;
  viewCount: number;
}

/** Joylash. Yozgandan keyin DARHOL 10 tagacha qisqartiriladi — "keyin tozalaymiz" degan
 *  kechiktirilgan ish yo'q, ya'ni chegara buzilgan holat umuman yuzaga kelmaydi. */
export async function createRavellaStory(input: {
  photoFileId?: string;
  videoFileId?: string;
  caption?: string;
}): Promise<{ ok: boolean; id?: number; removed: number }> {
  if (!input.photoFileId && !input.videoFileId) return { ok: false, removed: 0 };
  const row = await prisma.ravellaStory.create({
    data: {
      photoFileId: input.photoFileId ?? null,
      videoFileId: input.videoFileId ?? null,
      caption: input.caption?.trim().slice(0, 200) || null,
    },
  });
  const removed = await trimToMax();
  return { ok: true, id: row.id, removed };
}

/** FIFO: 10 tadan oshgani — eng eskisi — o'chadi. Ko'rish-yozuvlari ham birga ketadi,
 *  aks holda `RavellaStoryView` cheksiz o'sadigan yetim satrlar to'plami bo'lib qolardi. */
async function trimToMax(): Promise<number> {
  const extra = await prisma.ravellaStory.findMany({
    orderBy: { id: "desc" },
    skip: RAVELLA_STORY_MAX,
    select: { id: true },
  });
  if (!extra.length) return 0;
  const ids = extra.map((e) => e.id);
  await prisma.ravellaStoryView.deleteMany({ where: { storyId: { in: ids } } });
  await prisma.ravellaStory.deleteMany({ where: { id: { in: ids } } });
  return ids.length;
}

/** Ro'yxat — eng eskisidan yangisiga (ko'ruvchi shu tartibda o'tadi, Instagram naqshi).
 *  `memberId` bo'lsa har hikoyaga `seen` qo'shiladi; mehmon uchun hammasi `false`. */
export async function listRavellaStories(memberId?: number, preview = false): Promise<RavellaStoryItem[]> {
  if (!preview && !(await featureOn("ravellastory"))) return [];
  const rows = await prisma.ravellaStory.findMany({ orderBy: { id: "asc" }, take: RAVELLA_STORY_MAX });
  if (!rows.length) return [];
  const seen = memberId
    ? new Set(
        (
          await prisma.ravellaStoryView.findMany({
            where: { memberId, storyId: { in: rows.map((r) => r.id) } },
            select: { storyId: true },
          })
        ).map((v) => v.storyId),
      )
    : new Set<number>();
  return rows.map((r) => ({
    id: r.id,
    kind: r.videoFileId ? "video" : "photo",
    caption: r.caption,
    createdAt: r.createdAt.toISOString(),
    seen: seen.has(r.id),
    viewCount: r.viewCount,
  }));
}

/** Halqa uchun: nechta hikoya bor va ko'rilmagani bormi. Katalog javobiga qo'shiladi —
 *  shu tufayli halqani chizish uchun ALOHIDA so'rov kerak emas (ro'yxat faqat bosilganda). */
export async function ravellaStoryBadge(memberId?: number, preview = false): Promise<{ count: number; unseen: boolean }> {
  if (!preview && !(await featureOn("ravellastory"))) return { count: 0, unseen: false };
  const count = await prisma.ravellaStory.count();
  if (!count) return { count: 0, unseen: false };
  if (!memberId) return { count, unseen: true }; // mehmon: har doim "yangi" (shaxsiy holat yo'q)
  const seen = await prisma.ravellaStoryView.count({ where: { memberId } });
  return { count, unseen: seen < count };
}

/** Ko'rildi — idempotent (unique storyId+memberId). Hisoblagich FAQAT birinchi ko'rishda oshadi. */
export async function markRavellaStoryViewed(storyId: number, memberId: number): Promise<{ ok: boolean }> {
  if (!validId(storyId) || !validId(memberId)) return { ok: false };
  try {
    await prisma.ravellaStoryView.create({ data: { storyId, memberId } });
    await prisma.ravellaStory.update({ where: { id: storyId }, data: { viewCount: { increment: 1 } } }).catch(() => undefined);
  } catch {
    return { ok: true }; // allaqachon ko'rilgan — xato emas
  }
  return { ok: true };
}

export async function deleteRavellaStory(storyId: number): Promise<{ ok: boolean }> {
  if (!validId(storyId)) return { ok: false };
  await prisma.ravellaStoryView.deleteMany({ where: { storyId } });
  await prisma.ravellaStory.delete({ where: { id: storyId } }).catch(() => undefined);
  return { ok: true };
}

/** Media manzili — rasm ham, video ham bir xil yo'ldan (Telegram file → CDN havolasi). */
export async function resolveRavellaStoryMedia(storyId: number): Promise<string | null> {
  if (!validId(storyId)) return null;
  const r = await prisma.ravellaStory.findUnique({ where: { id: storyId }, select: { photoFileId: true, videoFileId: true } });
  const fileId = r?.videoFileId || r?.photoFileId;
  if (!fileId) return null;
  const { resolveTelegramFileUrl } = await import("./driverPhotoService");
  return resolveTelegramFileUrl(fileId);
}
