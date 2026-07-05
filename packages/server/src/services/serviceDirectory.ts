// 🔎 XIZMATLAR (feature "xizmatlar", DARK) — Koson services directory ("Koson 2GIS'i").
// Categories → listings (phone/photos/hours) → one-tap call + ratings/reviews + self-submit with
// owner ✅/❌ moderation (cashout/shop pattern). Moves NO money: the only writes here are listing
// rows, counters and reviews — the coin ledger is never imported. Rating aggregates are CACHED on
// the listing row (avgRating/reviewCount/rankScore) so list renders never join reviews; rankScore
// is a bayes blend ((avg·n + PRIOR·W)/(n+W)) so two fresh 5★ can't outrank a 200-review 4.8.
import { SERVICE_SUBMITS_PER_DAY, type ServiceCategoryView, type ServiceListingCard, type ServiceListingDetail, type ServiceReviewResponse, type ServiceReviewView, type ServiceSubmitBody, type ServiceSubmitResponse } from "@t1067/shared";
import { prisma } from "../db";
import { featureOn } from "./featureFlags";

const RANK_PRIOR = 4.0; // bayes prior mean
const RANK_PRIOR_W = 5; // prior weight (≈ "5 imaginary 4.0 reviews")
const REPORTS_TO_HIDE = 3; // community reports → auto-hide + moderation queue
const LIST_PAGE_MAX = 50;

// ── helpers ──────────────────────────────────────────────────────────────────────────────────────

/** Normalize an Uzbek phone to +998XXXXXXXXX; null = invalid. Accepts spaces/dashes/leading 8. */
export function normalizeUzPhone(raw: string): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  const nine = digits.length === 12 && digits.startsWith("998")
    ? digits.slice(3)
    : digits.length === 9
      ? digits
      : null;
  if (!nine || !/^[1-9]\d{8}$/.test(nine)) return null;
  return `+998${nine}`;
}

function rankOf(avg: number, n: number): number {
  return (avg * n + RANK_PRIOR * RANK_PRIOR_W) / (n + RANK_PRIOR_W);
}

async function dirOn(preview: boolean): Promise<boolean> {
  return preview || (await featureOn("xizmatlar"));
}

type ListingRow = {
  id: number; name: string; categoryId: number; tags: string; address: string | null;
  workHours: string | null; isVip: boolean; verified: boolean; avgRating: number; reviewCount: number;
  category: { name: string; emoji: string };
};

function toCard(l: ListingRow, photoCount: number): ServiceListingCard {
  return {
    id: l.id,
    name: l.name,
    categoryId: l.categoryId,
    categoryName: l.category.name,
    categoryEmoji: l.category.emoji,
    tags: l.tags,
    address: l.address,
    workHours: l.workHours,
    isVip: l.isVip,
    verified: l.verified,
    avgRating: Math.round(l.avgRating * 10) / 10,
    reviewCount: l.reviewCount,
    hasPhoto: photoCount > 0,
    photoCount,
  };
}

async function photoCounts(ids: number[]): Promise<Map<number, number>> {
  if (!ids.length) return new Map();
  const rows = await prisma.servicePhoto.groupBy({ by: ["listingId"], where: { listingId: { in: ids } }, _count: { _all: true } });
  return new Map(rows.map((r) => [r.listingId, r._count._all]));
}

// ── rider surface ────────────────────────────────────────────────────────────────────────────────

export async function listCategories(preview = false): Promise<ServiceCategoryView[]> {
  if (!(await dirOn(preview))) return [];
  const [cats, counts] = await Promise.all([
    prisma.serviceCategory.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
    prisma.serviceListing.groupBy({ by: ["categoryId"], where: { status: "active" }, _count: { _all: true } }),
  ]);
  const countOf = new Map(counts.map((c) => [c.categoryId, c._count._all]));
  return cats.map((c) => ({ id: c.id, name: c.name, emoji: c.emoji, count: countOf.get(c.id) ?? 0 }));
}

export async function listListings(
  opts: { categoryId?: number; q?: string; limit?: number; offset?: number },
  preview = false,
): Promise<{ listings: ServiceListingCard[]; total: number }> {
  if (!(await dirOn(preview))) return { listings: [], total: 0 };
  const take = Math.min(LIST_PAGE_MAX, Math.max(1, opts.limit ?? 20));
  const skip = Math.max(0, opts.offset ?? 0);
  const q = (opts.q ?? "").trim().slice(0, 60);
  const where = {
    status: "active",
    ...(opts.categoryId ? { categoryId: opts.categoryId } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { tags: { contains: q, mode: "insensitive" as const } },
            { phone: { contains: q.replace(/\s/g, "") } },
            { desc: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.serviceListing.findMany({
      where,
      include: { category: { select: { name: true, emoji: true } } },
      orderBy: [{ isVip: "desc" }, { rankScore: "desc" }, { reviewCount: "desc" }, { name: "asc" }],
      take,
      skip,
    }),
    prisma.serviceListing.count({ where }),
  ]);
  const photos = await photoCounts(rows.map((r) => r.id));
  return { listings: rows.map((r) => toCard(r, photos.get(r.id) ?? 0)), total };
}

export async function getListing(id: number, tgId: string | null, preview = false): Promise<ServiceListingDetail | null> {
  if (!(await dirOn(preview))) return null;
  const l = await prisma.serviceListing.findUnique({ where: { id }, include: { category: { select: { name: true, emoji: true } } } });
  if (!l || l.status !== "active") return null;
  // view counter: fire-and-forget, never blocks the render
  void prisma.serviceListing.update({ where: { id }, data: { viewCount: { increment: 1 } } }).catch(() => undefined);
  const [photos, mine] = await Promise.all([
    prisma.servicePhoto.count({ where: { listingId: id } }),
    tgId ? prisma.serviceReview.findUnique({ where: { listingId_tgId: { listingId: id, tgId: BigInt(tgId) } } }) : null,
  ]);
  return {
    ...toCard(l, photos),
    phone: l.phone,
    phone2: l.phone2,
    desc: l.desc,
    callCount: l.callCount,
    viewCount: l.viewCount + 1,
    createdAt: l.createdAt.toISOString(),
    myReview: mine && mine.status !== "hidden" ? { stars: mine.stars, text: mine.text } : null,
  };
}

/** Server-side call counter — the "sizni N marta izlashdi" sales proof. Idempotence not needed:
 *  every tap IS a real call intent; rate-limited at the route layer. */
export async function trackCall(id: number, preview = false): Promise<{ ok: boolean }> {
  if (!(await dirOn(preview))) return { ok: false };
  await prisma.serviceListing.updateMany({ where: { id, status: "active" }, data: { callCount: { increment: 1 } } });
  return { ok: true };
}

// ── self-submit + owner moderation (cashout/shop ✅/❌ pattern) ──────────────────────────────────

export interface ServiceOwnerNotice {
  listingId: number;
  name: string;
  phone: string;
  categoryName: string;
  desc: string;
  submitterName: string;
}

export async function submitListing(
  tgId: string,
  submitterName: string,
  body: ServiceSubmitBody,
  preview = false,
): Promise<ServiceSubmitResponse & { notice?: ServiceOwnerNotice }> {
  if (!(await dirOn(preview))) return { ok: false, reason: "off" };
  const name = (body.name ?? "").trim().slice(0, 80);
  if (name.length < 3) return { ok: false, reason: "bad_name" };
  const phone = normalizeUzPhone(body.phone ?? "");
  if (!phone) return { ok: false, reason: "bad_phone" };
  const phone2 = body.phone2 ? normalizeUzPhone(body.phone2) : null;
  const cat = await prisma.serviceCategory.findFirst({ where: { id: Number(body.categoryId), active: true } });
  if (!cat) return { ok: false, reason: "bad_category" };

  // spam cap: N submissions per Telegram user per Tashkent day
  const dayStart = new Date();
  dayStart.setHours(dayStart.getHours() + 5); // UTC → Tashkent
  dayStart.setUTCHours(0, 0, 0, 0);
  dayStart.setHours(dayStart.getHours() - 5);
  const todays = await prisma.serviceListing.count({ where: { ownerTgId: BigInt(tgId), createdAt: { gte: dayStart } } });
  if (todays >= SERVICE_SUBMITS_PER_DAY) return { ok: false, reason: "daily_limit" };

  // duplicate: same phone already listed/pending
  const dup = await prisma.serviceListing.findFirst({ where: { phone, status: { in: ["pending", "active"] } } });
  if (dup) return { ok: false, reason: "duplicate" };

  const row = await prisma.serviceListing.create({
    data: {
      categoryId: cat.id,
      name,
      phone,
      phone2,
      desc: (body.desc ?? "").trim().slice(0, 500),
      tags: (body.tags ?? "").trim().slice(0, 200),
      address: (body.address ?? "").trim().slice(0, 160) || null,
      workHours: (body.workHours ?? "").trim().slice(0, 20) || null,
      ownerTgId: BigInt(tgId),
      rankScore: rankOf(0, 0),
    },
  });
  return {
    ok: true,
    id: row.id,
    notice: { listingId: row.id, name, phone, categoryName: cat.name, desc: row.desc, submitterName },
  };
}

export interface ServiceDecision {
  ok: boolean;
  reason?: string;
  ownerTgId?: string | null;
  name?: string;
}

/** ✅ owner approve → active (visible to everyone). Status guard = double-tap no-op. */
export async function approveListing(listingId: number): Promise<ServiceDecision> {
  const l = await prisma.serviceListing.findUnique({ where: { id: listingId } });
  if (!l) return { ok: false, reason: "not_found" };
  if (l.status !== "pending") return { ok: false, reason: l.status };
  await prisma.serviceListing.update({ where: { id: listingId }, data: { status: "active" } });
  return { ok: true, ownerTgId: l.ownerTgId?.toString() ?? null, name: l.name };
}

/** ❌ owner reject. */
export async function rejectListing(listingId: number): Promise<ServiceDecision> {
  const l = await prisma.serviceListing.findUnique({ where: { id: listingId } });
  if (!l) return { ok: false, reason: "not_found" };
  if (l.status !== "pending") return { ok: false, reason: l.status };
  await prisma.serviceListing.update({ where: { id: listingId }, data: { status: "rejected" } });
  return { ok: true, ownerTgId: l.ownerTgId?.toString() ?? null, name: l.name };
}

export async function myListings(tgId: string): Promise<{ id: number; name: string; status: string; callCount: number; viewCount: number; avgRating: number; reviewCount: number }[]> {
  const rows = await prisma.serviceListing.findMany({ where: { ownerTgId: BigInt(tgId) }, orderBy: { id: "desc" }, take: 20 });
  return rows.map((l) => ({
    id: l.id,
    name: l.name,
    status: l.status,
    callCount: l.callCount,
    viewCount: l.viewCount,
    avgRating: Math.round(l.avgRating * 10) / 10,
    reviewCount: l.reviewCount,
  }));
}

// ── reviews (reputation core) ────────────────────────────────────────────────────────────────────

async function recomputeAggregates(listingId: number): Promise<{ avgRating: number; reviewCount: number }> {
  const agg = await prisma.serviceReview.aggregate({
    where: { listingId, status: "visible" },
    _avg: { stars: true },
    _count: { _all: true },
  });
  const n = agg._count._all;
  const avg = n > 0 ? agg._avg.stars ?? 0 : 0;
  await prisma.serviceListing.update({
    where: { id: listingId },
    data: { avgRating: avg, reviewCount: n, rankScore: rankOf(avg, n) },
  });
  return { avgRating: Math.round(avg * 10) / 10, reviewCount: n };
}

/** Upsert (1 user = 1 review per listing — editing replaces, never stacks). */
export async function upsertReview(
  tgId: string,
  authorName: string,
  listingId: number,
  stars: number,
  text: string,
  preview = false,
): Promise<ServiceReviewResponse> {
  if (!(await dirOn(preview))) return { ok: false, reason: "off" };
  const s = Math.floor(Number(stars));
  if (!Number.isFinite(s) || s < 1 || s > 5) return { ok: false, reason: "bad_stars" };
  const body = (text ?? "").trim().slice(0, 400);
  const l = await prisma.serviceListing.findUnique({ where: { id: listingId }, select: { status: true } });
  if (!l || l.status !== "active") return { ok: false, reason: "not_found" };
  await prisma.serviceReview.upsert({
    where: { listingId_tgId: { listingId, tgId: BigInt(tgId) } },
    update: { stars: s, text: body, authorName: authorName.slice(0, 60), status: "visible", reports: 0 },
    create: { listingId, tgId: BigInt(tgId), authorName: authorName.slice(0, 60), stars: s, text: body },
  });
  const agg = await recomputeAggregates(listingId);
  return { ok: true, ...agg };
}

export async function listReviews(listingId: number, tgId: string | null, take = 20, skip = 0): Promise<ServiceReviewView[]> {
  const rows = await prisma.serviceReview.findMany({
    where: { listingId, status: "visible" },
    orderBy: { createdAt: "desc" },
    take: Math.min(50, take),
    skip,
  });
  return rows.map((r) => ({
    id: r.id,
    authorName: r.authorName,
    stars: r.stars,
    text: r.text,
    createdAt: r.createdAt.toISOString(),
    mine: tgId != null && r.tgId === BigInt(tgId),
  }));
}

/** Community report: one report per user per review (AppState marker), 3 → auto-hide + re-aggregate. */
export async function reportReview(reviewId: number, tgId: string): Promise<{ ok: boolean; hidden?: boolean }> {
  try {
    await prisma.appState.create({ data: { key: `svcrep:${reviewId}:${tgId}`, value: "1" } });
  } catch {
    return { ok: true }; // already reported by this user — silent no-op
  }
  const r = await prisma.serviceReview.update({ where: { id: reviewId }, data: { reports: { increment: 1 } } }).catch(() => null);
  if (!r) return { ok: false };
  if (r.reports >= REPORTS_TO_HIDE && r.status === "visible") {
    await prisma.serviceReview.update({ where: { id: reviewId }, data: { status: "hidden" } });
    await recomputeAggregates(r.listingId);
    return { ok: true, hidden: true };
  }
  return { ok: true };
}

// ── admin (owner-gated at the route layer) ──────────────────────────────────────────────────────

export interface AdminServiceRow {
  id: number;
  name: string;
  phone: string;
  categoryId: number;
  categoryName: string;
  tags: string;
  address: string | null;
  workHours: string | null;
  status: string;
  isVip: boolean;
  verified: boolean;
  viewCount: number;
  callCount: number;
  avgRating: number;
  reviewCount: number;
  photoCount: number;
  createdAt: string;
}

export async function adminListListings(status?: string): Promise<{ rows: AdminServiceRow[]; enabled: boolean; pending: number; hiddenReviews: number }> {
  const [rows, enabled, pending, hiddenReviews] = await Promise.all([
    prisma.serviceListing.findMany({
      where: status ? { status } : undefined,
      include: { category: { select: { name: true } } },
      orderBy: { id: "desc" },
      take: 300,
    }),
    featureOn("xizmatlar"),
    prisma.serviceListing.count({ where: { status: "pending" } }),
    prisma.serviceReview.count({ where: { status: "hidden" } }),
  ]);
  const photos = await photoCounts(rows.map((r) => r.id));
  return {
    enabled,
    pending,
    hiddenReviews,
    rows: rows.map((l) => ({
      id: l.id,
      name: l.name,
      phone: l.phone,
      categoryId: l.categoryId,
      categoryName: l.category.name,
      tags: l.tags,
      address: l.address,
      workHours: l.workHours,
      status: l.status,
      isVip: l.isVip,
      verified: l.verified,
      viewCount: l.viewCount,
      callCount: l.callCount,
      avgRating: Math.round(l.avgRating * 10) / 10,
      reviewCount: l.reviewCount,
      photoCount: photos.get(l.id) ?? 0,
      createdAt: l.createdAt.toISOString(),
    })),
  };
}

export interface ServicePatch {
  name?: string;
  phone?: string;
  phone2?: string | null;
  desc?: string;
  tags?: string;
  address?: string | null;
  workHours?: string | null;
  categoryId?: number;
  status?: string;
  isVip?: boolean;
  verified?: boolean;
}

export async function adminEditListing(id: number, b: ServicePatch): Promise<{ ok: boolean; error?: string }> {
  const data: Record<string, unknown> = {};
  if (typeof b.name === "string" && b.name.trim().length >= 3) data.name = b.name.trim().slice(0, 80);
  if (typeof b.phone === "string") {
    const p = normalizeUzPhone(b.phone);
    if (!p) return { ok: false, error: "bad_phone" };
    data.phone = p;
  }
  if (b.phone2 !== undefined) data.phone2 = b.phone2 ? normalizeUzPhone(b.phone2) : null;
  if (typeof b.desc === "string") data.desc = b.desc.trim().slice(0, 500);
  if (typeof b.tags === "string") data.tags = b.tags.trim().slice(0, 200);
  if (b.address !== undefined) data.address = (b.address ?? "").trim().slice(0, 160) || null;
  if (b.workHours !== undefined) data.workHours = (b.workHours ?? "").trim().slice(0, 20) || null;
  if (typeof b.categoryId === "number") data.categoryId = b.categoryId;
  if (typeof b.status === "string" && ["pending", "active", "rejected", "archived"].includes(b.status)) data.status = b.status;
  if (typeof b.isVip === "boolean") data.isVip = b.isVip;
  if (typeof b.verified === "boolean") data.verified = b.verified;
  await prisma.serviceListing.update({ where: { id }, data }).catch(() => undefined);
  return { ok: true };
}

export async function adminCreateListing(b: ServicePatch & { name: string; phone: string; categoryId: number }): Promise<{ ok: boolean; id?: number; error?: string }> {
  const phone = normalizeUzPhone(b.phone ?? "");
  const name = (b.name ?? "").trim().slice(0, 80);
  if (!phone) return { ok: false, error: "bad_phone" };
  if (name.length < 3) return { ok: false, error: "bad_name" };
  if (!b.categoryId) return { ok: false, error: "bad_category" };
  const row = await prisma.serviceListing.create({
    data: {
      categoryId: Number(b.categoryId),
      name,
      phone,
      phone2: b.phone2 ? normalizeUzPhone(b.phone2) : null,
      desc: (b.desc ?? "").trim().slice(0, 500),
      tags: (b.tags ?? "").trim().slice(0, 200),
      address: (b.address ?? "").trim().slice(0, 160) || null,
      workHours: (b.workHours ?? "").trim().slice(0, 20) || null,
      status: "active", // admin-seeded rows go straight live
      verified: b.verified ?? false,
      rankScore: rankOf(0, 0),
    },
  });
  return { ok: true, id: row.id };
}

export async function adminListCategories(): Promise<{ id: number; name: string; emoji: string; sortOrder: number; active: boolean }[]> {
  const rows = await prisma.serviceCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
  return rows.map((c) => ({ id: c.id, name: c.name, emoji: c.emoji, sortOrder: c.sortOrder, active: c.active }));
}

export async function adminUpsertCategory(b: { id?: number; name: string; emoji?: string; sortOrder?: number; active?: boolean }): Promise<{ ok: boolean; id?: number }> {
  const name = (b.name ?? "").trim().slice(0, 40);
  if (!name) return { ok: false };
  if (b.id) {
    await prisma.serviceCategory.update({
      where: { id: b.id },
      data: { name, emoji: (b.emoji ?? "").slice(0, 8), sortOrder: b.sortOrder ?? 0, active: b.active ?? true },
    }).catch(() => undefined);
    return { ok: true, id: b.id };
  }
  const row = await prisma.serviceCategory.create({ data: { name, emoji: (b.emoji ?? "").slice(0, 8), sortOrder: b.sortOrder ?? 0 } });
  return { ok: true, id: row.id };
}

export async function adminReviewQueue(): Promise<{ id: number; listingId: number; listingName: string; authorName: string; stars: number; text: string; reports: number; status: string }[]> {
  const rows = await prisma.serviceReview.findMany({
    where: { status: "hidden" },
    include: { listing: { select: { name: true } } },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  return rows.map((r) => ({
    id: r.id,
    listingId: r.listingId,
    listingName: r.listing.name,
    authorName: r.authorName,
    stars: r.stars,
    text: r.text,
    reports: r.reports,
    status: r.status,
  }));
}

export async function adminModerateReview(reviewId: number, action: "restore" | "delete"): Promise<{ ok: boolean }> {
  const r = await prisma.serviceReview.findUnique({ where: { id: reviewId } });
  if (!r) return { ok: false };
  if (action === "restore") {
    await prisma.serviceReview.update({ where: { id: reviewId }, data: { status: "visible", reports: 0 } });
  } else {
    await prisma.serviceReview.delete({ where: { id: reviewId } });
  }
  await recomputeAggregates(r.listingId);
  return { ok: true };
}

// ── photos (ProductPhoto pattern: Telegram file_id = free durable storage) ──────────────────────

export async function uploadServicePhoto(listingId: number, buf: Buffer, mime = "image/jpeg"): Promise<{ ok: boolean; error?: string; photoCount?: number }> {
  const { SERVICE_MAX_PHOTOS } = await import("@t1067/shared");
  const existing = await prisma.servicePhoto.count({ where: { listingId } });
  if (existing >= SERVICE_MAX_PHOTOS) return { ok: false, error: "max_photos" };
  const { env } = await import("../env");
  const adminId = env.adminIds.find((id) => id.trim() !== "");
  let fileId: string | null = null;
  let url: string | null = null;
  if (env.BOT_TOKEN && adminId) {
    try {
      const form = new FormData();
      form.append("chat_id", adminId);
      form.append("photo", new Blob([buf], { type: mime }), "service.jpg");
      form.append("caption", `🔎 Xizmat foto · #${listingId}`);
      form.append("disable_notification", "true");
      const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendPhoto`, { method: "POST", body: form });
      const data = (await res.json()) as { ok: boolean; result?: { photo?: { file_id: string }[] } };
      if (data.ok && data.result?.photo?.length) fileId = data.result.photo[data.result.photo.length - 1]!.file_id;
    } catch {
      /* fall through to data-URL */
    }
  }
  if (!fileId) url = `data:${mime};base64,${buf.toString("base64")}`;
  await prisma.servicePhoto.create({ data: { listingId, fileId, url, sortOrder: existing } });
  return { ok: true, photoCount: existing + 1 };
}

export async function clearServicePhotos(listingId: number): Promise<{ ok: boolean }> {
  await prisma.servicePhoto.deleteMany({ where: { listingId } });
  return { ok: true };
}

export async function resolveServicePhoto(listingId: number, idx = 0): Promise<string | null> {
  const photos = await prisma.servicePhoto.findMany({ where: { listingId }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
  const pick = photos[idx];
  if (!pick) return null;
  if (pick.url) return pick.url;
  if (pick.fileId) {
    const { resolveTelegramFileUrl } = await import("./driverPhotoService");
    return resolveTelegramFileUrl(pick.fileId);
  }
  return null;
}

// ── seed ─────────────────────────────────────────────────────────────────────────────────────────

export const DEFAULT_CATEGORIES: { name: string; emoji: string }[] = [
  { name: "Qurilish", emoji: "🧱" },
  { name: "Usta-servis", emoji: "🔧" },
  { name: "Go'zallik", emoji: "💇" },
  { name: "Oziq-ovqat", emoji: "🍞" },
  { name: "Tibbiyot", emoji: "🩺" },
  { name: "Ta'lim", emoji: "📚" },
  { name: "To'y-marosim", emoji: "🎉" },
  { name: "Transport", emoji: "🚚" },
  { name: "Do'kon-savdo", emoji: "🛒" },
  { name: "Boshqa", emoji: "📌" },
];

/** Idempotent: creates only the categories that don't exist yet (matched by name). */
export async function seedDefaultCategories(): Promise<number> {
  const existing = new Set((await prisma.serviceCategory.findMany({ select: { name: true } })).map((c) => c.name));
  let created = 0;
  for (let i = 0; i < DEFAULT_CATEGORIES.length; i++) {
    const c = DEFAULT_CATEGORIES[i]!;
    if (existing.has(c.name)) continue;
    await prisma.serviceCategory.create({ data: { name: c.name, emoji: c.emoji, sortOrder: i } });
    created++;
  }
  return created;
}
