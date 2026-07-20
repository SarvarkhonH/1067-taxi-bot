// 🛍 TANGA SHOP (feature "shop") — owner-listed real goods bought with tanga, owner-fulfilled by
// hand (delivery by his own drivers). "Cashout-in-reverse": tanga is HELD at purchase time inside
// ONE transaction (balance-conditional decrement + stock-conditional decrement + order insert +
// CoinTxn key shop:<orderId>), so no oversell and no partial state is possible; a rejected order
// refunds IN the same tx as the status flip (key shoprefund:<orderId>, exactly-once) + restocks
// (V0.2 BirJoy audit: flip+refund atomik — throw = rollback = order pending'da qoladi). NO lootboxes — the
// owner's hard rule: deterministic price ↔ product only. UI word is "tanga", never "coin".
import {
  SHOP_LOW_STOCK,
  SHOP_MAX_PRICE,
  SHOP_REVIEW_MAX_PHOTOS,
  SHOP_REVIEW_MAX_TEXT,
  type ShopBuyResponse,
  type ShopProductView,
  type ShopPurchaseView,
  type ShopReviewSubmitResponse,
  type ShopReviewThumb,
  type ShopReviewView,
  type ShopReviewsResponse,
} from "@t1067/shared";
import { prisma } from "../db";
import { featureOn } from "./featureFlags";
import { withMemberLock } from "./coinService";

const NEW_BADGE_DAYS = 7;
const PENDING_PER_MEMBER = 3; // anti-spam: at most 3 open orders per rider

// ── rider surface ────────────────────────────────────────────────────────────────────────────────

/** preview=true (admin/owner) bypasses the DARK flag so the owner can QABUL the WHOLE flow —
 *  browse+buy — while ordinary riders still see nothing. Route layer decides preview. */
export async function listActiveProducts(preview = false): Promise<ShopProductView[]> {
  if (!preview && !(await featureOn("shop"))) return [];
  const rows = await prisma.product.findMany({
    where: { active: true, stock: { gt: 0 } },
    orderBy: [{ sortOrder: "asc" }, { id: "desc" }],
    take: 100,
  });
  const newCutoff = Date.now() - NEW_BADGE_DAYS * 86400_000;
  // grouped queries → per-product gallery size + top-3 sellers (delivered orders) + 👍/👎 tallies
  const [counts, sold, thumbs] = await Promise.all([
    prisma.productPhoto.groupBy({ by: ["productId"], where: { productId: { in: rows.map((r) => r.id) } }, _count: { _all: true } }),
    prisma.shopPurchase.groupBy({ by: ["productId"], where: { status: "delivered" }, _count: { _all: true }, orderBy: { _count: { productId: "desc" } }, take: 3 }),
    prisma.productReview.groupBy({ by: ["productId", "thumb"], where: { productId: { in: rows.map((r) => r.id) } }, _count: { _all: true } }),
  ]);
  const countOf = new Map(counts.map((c) => [c.productId, c._count._all]));
  const topIds = new Set(sold.filter((s) => s._count._all > 0).map((s) => s.productId));
  const thumbOf = new Map(thumbs.map((t) => [`${t.productId}:${t.thumb}`, t._count._all]));
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    category: p.category,
    priceTanga: p.priceTanga,
    oldPriceTanga: p.oldPriceTanga,
    stock: p.stock,
    hasPhoto: !!(p.photoFileId || p.photoUrl) || (countOf.get(p.id) ?? 0) > 0,
    photoCount: countOf.get(p.id) ?? (p.photoFileId || p.photoUrl ? 1 : 0),
    isNew: p.createdAt.getTime() > newCutoff,
    featured: p.featured,
    topSeller: topIds.has(p.id),
    likes: thumbOf.get(`${p.id}:up`) ?? 0,
    dislikes: thumbOf.get(`${p.id}:down`) ?? 0,
  }));
}

export async function myPurchases(memberId: number, take = 20): Promise<ShopPurchaseView[]> {
  const rows = await prisma.shopPurchase.findMany({ where: { memberId }, orderBy: { id: "desc" }, take });
  return rows.map((o) => ({
    id: o.id,
    productName: o.productName,
    priceTanga: o.priceTanga,
    payKind: o.payKind as ShopPurchaseView["payKind"],
    status: o.status as ShopPurchaseView["status"],
    note: o.note,
    address: o.address,
    createdAt: o.createdAt.toISOString(),
    decidedAt: o.decidedAt?.toISOString() ?? null,
  }));
}

export interface ShopOwnerNotice {
  orderId: number;
  productName: string;
  priceTanga: number;
  payKind: "tanga" | "cash";
  buyerName: string;
  phone: string;
  address: string;
}

/**
 * Buy ONE unit. pay="tanga" (default): all-or-nothing inside one member-locked transaction —
 *   balance-conditional coins decrement → CoinTxn(shop:<orderId>) → stock-conditional decrement;
 * a failed conditional throws → full rollback → typed clean reason.
 * pay="cash" (naqd — yetkazganda to'lanadi): SAME atomic stock claim + order row, coin ops YO'Q —
 * balans tekshirilmaydi, hech narsa ushlanmaydi; reject'da refund ham YO'Q (faqat restock).
 */
export async function buyProduct(
  memberId: number,
  productId: number,
  address: string,
  preview = false, // admin/owner QABUL-test while the flag is DARK
  pay: "tanga" | "cash" = "tanga",
): Promise<ShopBuyResponse & { notice?: ShopOwnerNotice }> {
  if (!preview && !(await featureOn("shop"))) return { ok: false, reason: "off" };
  const addr = (address ?? "").trim().slice(0, 200);
  if (addr.length < 5) return { ok: false, reason: "bad_address" };

  return withMemberLock(memberId, async () => {
    const member = await prisma.member.findUnique({ where: { id: memberId }, select: { coins: true, fullName: true, displayName: true, phone: true } });
    if (!member) return { ok: false as const, reason: "unavailable" as const };
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product || !product.active) return { ok: false as const, reason: "unavailable" as const };
    if (product.stock < 1) return { ok: false as const, reason: "sold_out" as const };
    if (pay === "tanga" && member.coins < product.priceTanga) return { ok: false as const, reason: "insufficient" as const };
    // anti-spam: bound open orders per rider (tanga'da real tanga ushlab turadi; cash'da spam-qalqon)
    const open = await prisma.shopPurchase.count({ where: { memberId, status: "pending" } });
    if (open >= PENDING_PER_MEMBER) return { ok: false as const, reason: "pending_limit" as const };
    // V0.4 (BirJoy audit): dublikat-guard — prod'da ayni (member, product) 16s ichida 2 marta
    // kuzatildi (double-tap / sekin-internet qayta-bosish). 60s oynada ayni mahsulotga pending
    // buyurtma bo'lsa — ikkinchisi rad (lock ichidamiz, poyga yo'q).
    const dup = await prisma.shopPurchase.findFirst({
      where: { memberId, productId, status: "pending", createdAt: { gte: new Date(Date.now() - 60_000) } },
      select: { id: true },
    });
    if (dup) return { ok: false as const, reason: "duplicate" as const };

    try {
      const created = await prisma.$transaction(async (tx) => {
        // 1) atomic stock claim — of N concurrent buyers on the last unit exactly one passes
        const dec = await tx.product.updateMany({ where: { id: productId, active: true, stock: { gte: 1 } }, data: { stock: { decrement: 1 } } });
        if (dec.count === 0) throw new Error("SOLD_OUT");
        // 2) order row (snapshot name+price — survives product edits)
        const order = await tx.shopPurchase.create({
          data: {
            memberId,
            productId,
            productName: product.name,
            priceTanga: product.priceTanga,
            payKind: pay,
            address: addr,
            contact: member.phone ?? "—",
          },
        });
        // 3) TANGA'dagina: balance-conditional hold (never below 0) + ledger row, keyed to THIS order
        if (pay === "tanga") {
          const paid = await tx.member.updateMany({ where: { id: memberId, coins: { gte: product.priceTanga } }, data: { coins: { decrement: product.priceTanga } } });
          if (paid.count === 0) throw new Error("INSUFFICIENT");
          await tx.coinTxn.create({
            data: { memberId, amount: -product.priceTanga, kind: "shop", reason: `🛍 ${product.name} (#${order.id})`, idempotencyKey: `shop:${order.id}` },
          });
        }
        return order;
      });
      const balance = (await prisma.member.findUnique({ where: { id: memberId }, select: { coins: true } }))?.coins ?? 0;
      return {
        ok: true as const,
        orderId: created.id,
        balance,
        notice: {
          orderId: created.id,
          productName: product.name,
          priceTanga: product.priceTanga,
          payKind: pay,
          buyerName: member.displayName || member.fullName,
          phone: member.phone ?? "—",
          address: addr,
        },
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "SOLD_OUT") return { ok: false as const, reason: "sold_out" as const };
      if (msg === "INSUFFICIENT") return { ok: false as const, reason: "insufficient" as const };
      throw e;
    }
  });
}

// ── owner decisions (Telegram ✅/❌ — cashout pattern) ───────────────────────────────────────────

export interface ShopDecision {
  ok: boolean;
  reason?: string;
  memberId?: number;
  amount?: number;
  productName?: string;
  payKind?: "tanga" | "cash";
}

/** ✅ Yetkazildi — terminal. V0.2 (BirJoy audit): read-check-write TOCTOU o'rniga ATOMIK shartli
 *  o'tish (scheduledService naqshi) — `count===0` = boshqa qaror allaqachon yutgan (parallel
 *  ✅/❌ poygada faqat bittasi o'tadi, grammY ketma-ketligiga tayanmaymiz). Tanga buy'da ushlangan,
 *  bu yerda coin-op YO'Q. */
export async function deliverPurchase(orderId: number): Promise<ShopDecision> {
  const o = await prisma.shopPurchase.findUnique({ where: { id: orderId } });
  if (!o) return { ok: false, reason: "not_found" };
  const flip = await prisma.shopPurchase.updateMany({
    where: { id: orderId, status: "pending" },
    data: { status: "delivered", decidedAt: new Date() },
  });
  if (flip.count === 0) {
    const now = await prisma.shopPurchase.findUnique({ where: { id: orderId }, select: { status: true } });
    return { ok: false, reason: now?.status ?? "not_found" };
  }
  return { ok: true, memberId: o.memberId, amount: o.priceTanga, productName: o.productName, payKind: o.payKind as "tanga" | "cash" };
}

/** ❌ Rad — V0.2 (BirJoy audit): flip + restock + refund BITTA tranzaksiyada.
 *  - Shartli flip (`status:"pending"`) tx ichida: parallel ❌×2 yoki ✅→❌ poygada faqat bittasi
 *    o'tadi — restock ham, refund ham aynan bir marta.
 *  - Refund tx ICHIDA (grantCoins EMAS): flip bilan birga commit/rollback — avvalgi kodda flip
 *    alohida commit bo'lib, refund throw qilsa mijoz tangasi butunlay yo'qolardi (terminal status
 *    qayta-urinishni berkitardi). Endi throw → hammasi rollback → order pending'da qoladi →
 *    qayta-bosish ishlaydi. `shoprefund:<id>` unique-kalit saqlangan (P2002 → allaqachon refund
 *    qilingan, dublikat imkonsiz).
 *  - Cash'da coin-op YO'Q (refund pul YARATGAN bo'lardi). */
export async function rejectPurchase(orderId: number, note?: string): Promise<ShopDecision> {
  const o = await prisma.shopPurchase.findUnique({ where: { id: orderId } });
  if (!o) return { ok: false, reason: "not_found" };
  if (o.status !== "pending") return { ok: false, reason: o.status };
  try {
    await prisma.$transaction(async (tx) => {
      const flip = await tx.shopPurchase.updateMany({
        where: { id: orderId, status: "pending" },
        data: { status: "rejected", decidedAt: new Date(), note: note?.slice(0, 200) ?? null },
      });
      if (flip.count === 0) throw new Error("ALREADY_DECIDED");
      // restock tx ichida (mahsulot o'chirilgan bo'lsa updateMany 0 — jim o'tadi, xato emas)
      await tx.product.updateMany({ where: { id: o.productId }, data: { stock: { increment: 1 } } });
      if (o.payKind !== "cash") {
        await tx.coinTxn.create({
          data: {
            memberId: o.memberId,
            amount: o.priceTanga,
            kind: "shop_refund",
            reason: `🛍 «${o.productName}» rad etildi — tanga qaytarildi`,
            idempotencyKey: `shoprefund:${orderId}`,
          },
        });
        await tx.member.update({ where: { id: o.memberId }, data: { coins: { increment: o.priceTanga } } });
      }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "ALREADY_DECIDED") {
      const now = await prisma.shopPurchase.findUnique({ where: { id: orderId }, select: { status: true } });
      return { ok: false, reason: now?.status ?? "not_found" };
    }
    // P2002 on shoprefund:<id> — refund allaqachon boshqa yo'l bilan berilgan (nazariy): flip
    // rollback bo'ldi, order pending'da — adminga signal berib qayta-urinishga qoldiramiz.
    const { alertAdmins } = await import("./economyService");
    await alertAdmins(`⚠️ Shop reject FAILED (order pending'da qoldi, qayta bosing): #${orderId}, m${o.memberId} — ${msg.slice(0, 120)}`).catch(() => undefined);
    return { ok: false, reason: "retry" };
  }
  return { ok: true, memberId: o.memberId, amount: o.priceTanga, productName: o.productName, payKind: o.payKind as "tanga" | "cash" };
}

// ── admin CRUD (owner-gated at the route layer) ──────────────────────────────────────────────────

export interface AdminProductRow {
  id: number;
  name: string;
  description: string | null;
  category: string;
  priceTanga: number;
  oldPriceTanga: number | null;
  featured: boolean;
  stock: number;
  active: boolean;
  sortOrder: number;
  hasPhoto: boolean;
  photoCount: number;
  soldCount: number;
  createdAt: string;
}

export async function adminListProducts(): Promise<{ products: AdminProductRow[]; enabled: boolean; pendingOrders: number }> {
  const [rows, sold, enabled, pendingOrders, photoCounts] = await Promise.all([
    prisma.product.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "desc" }] }),
    prisma.shopPurchase.groupBy({ by: ["productId"], where: { status: "delivered" }, _count: { _all: true } }),
    featureOn("shop"),
    prisma.shopPurchase.count({ where: { status: "pending" } }),
    prisma.productPhoto.groupBy({ by: ["productId"], _count: { _all: true } }),
  ]);
  const soldOf = new Map(sold.map((s) => [s.productId, s._count._all]));
  const photosOf = new Map(photoCounts.map((c) => [c.productId, c._count._all]));
  return {
    enabled,
    pendingOrders,
    products: rows.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      category: p.category,
      priceTanga: p.priceTanga,
      oldPriceTanga: p.oldPriceTanga,
      featured: p.featured,
      stock: p.stock,
      active: p.active,
      sortOrder: p.sortOrder,
      hasPhoto: !!(p.photoFileId || p.photoUrl) || (photosOf.get(p.id) ?? 0) > 0,
      photoCount: photosOf.get(p.id) ?? (p.photoFileId || p.photoUrl ? 1 : 0),
      soldCount: soldOf.get(p.id) ?? 0,
      createdAt: p.createdAt.toISOString(),
    })),
  };
}

export interface ProductPatch {
  name?: string;
  description?: string | null;
  category?: string;
  priceTanga?: number;
  oldPriceTanga?: number | null; // 0/null clears the discount
  featured?: boolean;
  stock?: number;
  sortOrder?: number;
}

function cleanPatch(b: ProductPatch): ProductPatch {
  const out: ProductPatch = {};
  if (typeof b.name === "string" && b.name.trim()) out.name = b.name.trim().slice(0, 80);
  if (typeof b.description === "string") out.description = b.description.trim().slice(0, 400) || null;
  if (typeof b.category === "string" && b.category.trim()) out.category = b.category.trim().slice(0, 40);
  if (typeof b.priceTanga === "number" && Number.isFinite(b.priceTanga)) out.priceTanga = Math.min(SHOP_MAX_PRICE, Math.max(1, Math.floor(b.priceTanga)));
  if (b.oldPriceTanga !== undefined) {
    const v = Number(b.oldPriceTanga);
    out.oldPriceTanga = Number.isFinite(v) && v > 0 ? Math.min(SHOP_MAX_PRICE, Math.floor(v)) : null;
  }
  if (typeof b.featured === "boolean") out.featured = b.featured;
  if (typeof b.stock === "number" && Number.isFinite(b.stock)) out.stock = Math.min(100000, Math.max(0, Math.floor(b.stock)));
  if (typeof b.sortOrder === "number" && Number.isFinite(b.sortOrder)) out.sortOrder = Math.floor(b.sortOrder);
  return out;
}

export async function adminCreateProduct(body: ProductPatch): Promise<{ ok: boolean; id?: number; error?: string }> {
  const p = cleanPatch(body);
  if (!p.name || !p.priceTanga) return { ok: false, error: "name_price_required" };
  const row = await prisma.product.create({ data: { ...p, name: p.name, priceTanga: p.priceTanga, active: false } }); // created OFF — owner flips on
  return { ok: true, id: row.id };
}

export async function adminEditProduct(id: number, body: ProductPatch): Promise<{ ok: boolean }> {
  await prisma.product.update({ where: { id }, data: cleanPatch(body) }).catch(() => undefined);
  return { ok: true };
}

export async function adminToggleProduct(id: number, active: boolean): Promise<{ ok: boolean }> {
  await prisma.product.update({ where: { id }, data: { active: !!active } }).catch(() => undefined);
  return { ok: true };
}

export async function adminDeleteProduct(id: number): Promise<{ ok: boolean }> {
  await prisma.product.delete({ where: { id } }).catch(() => undefined); // orders snapshot name/price → safe
  await prisma.productReview.deleteMany({ where: { productId: id } }).catch(() => undefined); // loose FK — clean by hand
  return { ok: true };
}

export async function adminListPurchases(status?: string): Promise<(ShopPurchaseView & { buyerName: string; contact: string })[]> {
  const rows = await prisma.shopPurchase.findMany({
    where: status ? { status } : undefined,
    orderBy: { id: "desc" },
    take: 100,
    include: { member: { select: { fullName: true, displayName: true } } },
  });
  return rows.map((o) => ({
    id: o.id,
    productName: o.productName,
    priceTanga: o.priceTanga,
    payKind: o.payKind as ShopPurchaseView["payKind"],
    status: o.status as ShopPurchaseView["status"],
    note: o.note,
    address: o.address,
    createdAt: o.createdAt.toISOString(),
    decidedAt: o.decidedAt?.toISOString() ?? null,
    buyerName: o.member.displayName || o.member.fullName,
    contact: o.contact,
  }));
}

// ── product photos (driver-photo pattern: Telegram file_id = free durable storage) ───────────────

export const PRODUCT_MAX_PHOTOS = 5;

/** APPEND one photo to the product gallery (max 5 — "real market feel" swipeable detail). Storage
 *  identical to the driver-photo pattern: Telegram file_id (durable) with data-URL fallback. */
/** Send a photo to the owner's DM and return Telegram's size ladder: full = largest, thumb = the
 *  smallest size ≥280px wide (~320px tier) — list views load ~15KB instead of ~200KB. */
async function tgUploadPhoto(buf: Buffer, mime: string, caption: string): Promise<{ fileId: string | null; thumbFileId: string | null }> {
  const { env } = await import("../env");
  const adminId = env.adminIds.find((id) => id.trim() !== "");
  if (!env.BOT_TOKEN || !adminId) return { fileId: null, thumbFileId: null };
  try {
    const form = new FormData();
    form.append("chat_id", adminId);
    form.append("photo", new Blob([buf], { type: mime }), "photo.jpg");
    form.append("caption", caption);
    form.append("disable_notification", "true");
    const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendPhoto`, { method: "POST", body: form });
    const data = (await res.json()) as { ok: boolean; result?: { photo?: { file_id: string; width: number }[] } };
    const sizes = data.ok ? (data.result?.photo ?? []) : [];
    if (!sizes.length) return { fileId: null, thumbFileId: null };
    const full = sizes[sizes.length - 1]!;
    const thumb = sizes.find((s) => s.width >= 280) ?? full;
    return { fileId: full.file_id, thumbFileId: thumb.file_id === full.file_id ? null : thumb.file_id };
  } catch {
    return { fileId: null, thumbFileId: null };
  }
}

export async function uploadProductPhoto(productId: number, buf: Buffer, mime = "image/jpeg"): Promise<{ ok: boolean; error?: string; photoCount?: number }> {
  const existing = await prisma.productPhoto.count({ where: { productId } });
  if (existing >= PRODUCT_MAX_PHOTOS) return { ok: false, error: "max_photos" };
  const { fileId, thumbFileId } = await tgUploadPhoto(buf, mime, `🛍 Product photo · #${productId}`);
  const url = fileId ? null : `data:${mime};base64,${buf.toString("base64")}`;
  await prisma.productPhoto.create({ data: { productId, fileId, url, thumbFileId, sortOrder: existing } });
  return { ok: true, photoCount: existing + 1 };
}

/** Clear the whole gallery (owner starts over). Legacy cover fields cleared too. */
export async function clearProductPhotos(productId: number): Promise<{ ok: boolean }> {
  await prisma.productPhoto.deleteMany({ where: { productId } });
  await prisma.product.update({ where: { id: productId }, data: { photoFileId: null, photoUrl: null } }).catch(() => undefined);
  return { ok: true };
}

/** Resolve the Nth gallery photo (0 = cover). Falls back to the legacy single-photo fields when the
 *  gallery is empty — pre-gallery products keep working untouched. */
export async function resolveProductPhoto(productId: number, idx = 0, small = false): Promise<string | null> {
  const photos = await prisma.productPhoto.findMany({ where: { productId }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
  const pick = photos[idx];
  const { resolveTelegramFileUrl } = await import("./driverPhotoService");
  if (pick) {
    if (pick.url) return pick.url;
    const fid = (small && pick.thumbFileId) || pick.fileId; // small → ~320px tier; legacy rows fall back to full
    if (fid) return resolveTelegramFileUrl(fid);
    return null;
  }
  if (idx > 0) return null; // gallery miss beyond cover
  const p = await prisma.product.findUnique({ where: { id: productId }, select: { photoUrl: true, photoFileId: true } });
  if (!p) return null;
  if (p.photoUrl) return p.photoUrl;
  if (p.photoFileId) return resolveTelegramFileUrl(p.photoFileId);
  return null;
}

// ── 🗣 reviews: sharh + 👍/👎 + up to 3 photos (one review per member per product) ───────────────

interface ReviewPhotoRef { f?: string; t?: string; u?: string } // fileId / thumbFileId / dataUrl

function parseReviewPhotos(json: string | null): ReviewPhotoRef[] {
  if (!json) return [];
  try {
    const a = JSON.parse(json) as unknown;
    return Array.isArray(a) ? (a as ReviewPhotoRef[]).slice(0, SHOP_REVIEW_MAX_PHOTOS) : [];
  } catch {
    return [];
  }
}

export async function listReviews(productId: number, memberId: number, preview = false): Promise<ShopReviewsResponse> {
  if (!preview && !(await featureOn("shop"))) return { likes: 0, dislikes: 0, reviews: [] };
  const rows = await prisma.productReview.findMany({ where: { productId }, orderBy: { id: "desc" }, take: 30 });
  const [likes, dislikes, buyers, members] = await Promise.all([
    prisma.productReview.count({ where: { productId, thumb: "up" } }),
    prisma.productReview.count({ where: { productId, thumb: "down" } }),
    prisma.shopPurchase.findMany({ where: { productId, status: "delivered", memberId: { in: rows.map((r) => r.memberId) } }, select: { memberId: true }, distinct: ["memberId"] }),
    prisma.member.findMany({ where: { id: { in: rows.map((r) => r.memberId) } }, select: { id: true, fullName: true, displayName: true } }),
  ]);
  const verified = new Set(buyers.map((b) => b.memberId));
  const nameOf = new Map(members.map((m) => [m.id, (m.displayName || m.fullName || "Mijoz").trim().split(/\s+/)[0]!]));
  const reviews: ShopReviewView[] = rows.map((r) => ({
    id: r.id,
    name: nameOf.get(r.memberId) ?? "Mijoz",
    thumb: r.thumb as ShopReviewThumb,
    text: r.text,
    photoCount: parseReviewPhotos(r.photosJson).length,
    createdAt: r.createdAt.toISOString(),
    mine: r.memberId === memberId,
    verified: verified.has(r.memberId),
  }));
  return { likes, dislikes, reviews, myThumb: (rows.find((r) => r.memberId === memberId)?.thumb as ShopReviewThumb) ?? null };
}

/** Upsert (unique productId+memberId): re-submitting EDITS the member's review. Photos sent as
 *  data-URLs ride the product-photo Telegram pipeline; when photos are omitted the old set stays. */
export async function submitReview(
  memberId: number,
  productId: number,
  thumb: string,
  text?: string,
  photosBase64?: string[],
  preview = false,
): Promise<ShopReviewSubmitResponse> {
  if (!preview && !(await featureOn("shop"))) return { ok: false, reason: "off" };
  if (thumb !== "up" && thumb !== "down") return { ok: false, reason: "bad_thumb" };
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
  if (!product) return { ok: false, reason: "unavailable" };
  const cleanText = (text ?? "").trim().slice(0, SHOP_REVIEW_MAX_TEXT) || null;
  if ((photosBase64?.length ?? 0) > SHOP_REVIEW_MAX_PHOTOS) return { ok: false, reason: "too_many_photos" };

  let photosJson: string | undefined; // undefined = keep existing photos on edit
  if (photosBase64) {
    const refs: ReviewPhotoRef[] = [];
    for (const dataUrl of photosBase64.slice(0, SHOP_REVIEW_MAX_PHOTOS)) {
      const m = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(dataUrl);
      if (!m) return { ok: false, reason: "bad_photo" };
      const buf = Buffer.from(m[2]!, "base64");
      if (buf.length < 100 || buf.length > 2_500_000) return { ok: false, reason: "bad_photo" };
      const { fileId, thumbFileId } = await tgUploadPhoto(buf, m[1]!, `🗣 Review photo · product #${productId} · m${memberId}`);
      refs.push(fileId ? { f: fileId, t: thumbFileId ?? undefined } : { u: dataUrl });
    }
    photosJson = JSON.stringify(refs);
  }

  await prisma.productReview.upsert({
    where: { productId_memberId: { productId, memberId } },
    create: { productId, memberId, thumb, text: cleanText, photosJson: photosJson ?? null },
    update: { thumb, text: cleanText, ...(photosJson !== undefined ? { photosJson } : {}) },
  });
  return { ok: true };
}

export async function deleteMyReview(memberId: number, productId: number): Promise<{ ok: boolean }> {
  await prisma.productReview.deleteMany({ where: { productId, memberId } });
  return { ok: true };
}

export async function resolveReviewPhoto(reviewId: number, idx = 0, small = false): Promise<string | null> {
  const r = await prisma.productReview.findUnique({ where: { id: reviewId }, select: { photosJson: true } });
  const pick = parseReviewPhotos(r?.photosJson ?? null)[idx];
  if (!pick) return null;
  if (pick.u) return pick.u;
  const fid = (small && pick.t) || pick.f;
  if (!fid) return null;
  const { resolveTelegramFileUrl } = await import("./driverPhotoService");
  return resolveTelegramFileUrl(fid);
}

// admin moderation — the owner deletes spam/abuse whole
export interface AdminReviewRow {
  id: number;
  productId: number;
  productName: string;
  memberName: string;
  thumb: string;
  text: string | null;
  photoCount: number;
  createdAt: string;
}

export async function adminListReviews(): Promise<AdminReviewRow[]> {
  const rows = await prisma.productReview.findMany({ orderBy: { id: "desc" }, take: 50 });
  const [products, members] = await Promise.all([
    prisma.product.findMany({ where: { id: { in: rows.map((r) => r.productId) } }, select: { id: true, name: true } }),
    prisma.member.findMany({ where: { id: { in: rows.map((r) => r.memberId) } }, select: { id: true, fullName: true, displayName: true } }),
  ]);
  const pName = new Map(products.map((p) => [p.id, p.name]));
  const mName = new Map(members.map((m) => [m.id, m.displayName || m.fullName]));
  return rows.map((r) => ({
    id: r.id,
    productId: r.productId,
    productName: pName.get(r.productId) ?? `#${r.productId}`,
    memberName: mName.get(r.memberId) ?? `m${r.memberId}`,
    thumb: r.thumb,
    text: r.text,
    photoCount: parseReviewPhotos(r.photosJson).length,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function adminDeleteReview(id: number): Promise<{ ok: boolean }> {
  await prisma.productReview.delete({ where: { id } }).catch(() => undefined);
  return { ok: true };
}
