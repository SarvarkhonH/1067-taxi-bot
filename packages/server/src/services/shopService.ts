// 🛍 TANGA SHOP (feature "shop") — owner-listed real goods bought with tanga, owner-fulfilled by
// hand (delivery by his own drivers). "Cashout-in-reverse": tanga is HELD at purchase time inside
// ONE transaction (balance-conditional decrement + stock-conditional decrement + order insert +
// CoinTxn key shop:<orderId>), so no oversell and no partial state is possible; a rejected order
// refunds via grantCoins key shoprefund:<orderId> (exactly-once) + restocks. NO lootboxes — the
// owner's hard rule: deterministic price ↔ product only. UI word is "tanga", never "coin".
import { SHOP_LOW_STOCK, SHOP_MAX_PRICE, type ShopBuyResponse, type ShopProductView, type ShopPurchaseView } from "@t1067/shared";
import { prisma } from "../db";
import { featureOn } from "./featureFlags";
import { grantCoins, withMemberLock } from "./coinService";

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
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    category: p.category,
    priceTanga: p.priceTanga,
    stock: p.stock,
    hasPhoto: !!(p.photoFileId || p.photoUrl),
    isNew: p.createdAt.getTime() > newCutoff,
  }));
}

export async function myPurchases(memberId: number, take = 20): Promise<ShopPurchaseView[]> {
  const rows = await prisma.shopPurchase.findMany({ where: { memberId }, orderBy: { id: "desc" }, take });
  return rows.map((o) => ({
    id: o.id,
    productName: o.productName,
    priceTanga: o.priceTanga,
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
  buyerName: string;
  phone: string;
  address: string;
}

/**
 * Buy ONE unit with tanga. All-or-nothing inside one member-locked transaction:
 *   balance-conditional coins decrement → CoinTxn(shop:<orderId>) → stock-conditional decrement →
 * a failed conditional throws → full rollback → typed clean reason. Mirrors spendCoinsIdempotent's
 * body inline (the idempotency key needs the orderId, which only exists inside the tx).
 */
export async function buyProduct(
  memberId: number,
  productId: number,
  address: string,
  preview = false, // admin/owner QABUL-test while the flag is DARK
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
    if (member.coins < product.priceTanga) return { ok: false as const, reason: "insufficient" as const };
    // anti-spam: bound open orders per rider (each holds real tanga, so this also bounds exposure)
    const open = await prisma.shopPurchase.count({ where: { memberId, status: "pending" } });
    if (open >= PENDING_PER_MEMBER) return { ok: false as const, reason: "pending_limit" as const };

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
            address: addr,
            contact: member.phone ?? "—",
          },
        });
        // 3) balance-conditional hold (never below 0) + ledger row, keyed to THIS order
        const pay = await tx.member.updateMany({ where: { id: memberId, coins: { gte: product.priceTanga } }, data: { coins: { decrement: product.priceTanga } } });
        if (pay.count === 0) throw new Error("INSUFFICIENT");
        await tx.coinTxn.create({
          data: { memberId, amount: -product.priceTanga, kind: "shop", reason: `🛍 ${product.name} (#${order.id})`, idempotencyKey: `shop:${order.id}` },
        });
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
}

/** ✅ Yetkazildi — terminal; tanga already held at buy, so NO coin op here. */
export async function deliverPurchase(orderId: number): Promise<ShopDecision> {
  const o = await prisma.shopPurchase.findUnique({ where: { id: orderId } });
  if (!o) return { ok: false, reason: "not_found" };
  if (o.status !== "pending") return { ok: false, reason: o.status };
  await prisma.shopPurchase.update({ where: { id: orderId }, data: { status: "delivered", decidedAt: new Date() } });
  return { ok: true, memberId: o.memberId, amount: o.priceTanga, productName: o.productName };
}

/** ❌ Rad — refund (exactly once via shoprefund:<id>) + restock. Status guard makes a double-tap
 *  and a ✅→❌ race no-ops: the first decision wins, the refund key physically can't double-pay. */
export async function rejectPurchase(orderId: number, note?: string): Promise<ShopDecision> {
  const o = await prisma.shopPurchase.findUnique({ where: { id: orderId } });
  if (!o) return { ok: false, reason: "not_found" };
  if (o.status !== "pending") return { ok: false, reason: o.status };
  await prisma.shopPurchase.update({
    where: { id: orderId },
    data: { status: "rejected", decidedAt: new Date(), note: note?.slice(0, 200) ?? null },
  });
  await prisma.product.updateMany({ where: { id: o.productId }, data: { stock: { increment: 1 } } }).catch(() => undefined); // best-effort restock (product may be deleted)
  const refund = await grantCoins(o.memberId, o.priceTanga, "shop_refund", `🛍 «${o.productName}» rad etildi — tanga qaytarildi`, `shoprefund:${orderId}`);
  if (!refund.ok && refund.skipped !== "duplicate") {
    // refund MUST land — surface loudly rather than silently losing the rider's tanga
    const { alertAdmins } = await import("./economyService");
    await alertAdmins(`⚠️ Shop refund FAILED: order #${orderId}, m${o.memberId}, ${o.priceTanga} tanga — qo'lda tekshiring.`).catch(() => undefined);
  }
  return { ok: true, memberId: o.memberId, amount: o.priceTanga, productName: o.productName };
}

// ── admin CRUD (owner-gated at the route layer) ──────────────────────────────────────────────────

export interface AdminProductRow {
  id: number;
  name: string;
  description: string | null;
  category: string;
  priceTanga: number;
  stock: number;
  active: boolean;
  sortOrder: number;
  hasPhoto: boolean;
  soldCount: number;
  createdAt: string;
}

export async function adminListProducts(): Promise<{ products: AdminProductRow[]; enabled: boolean; pendingOrders: number }> {
  const [rows, sold, enabled, pendingOrders] = await Promise.all([
    prisma.product.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "desc" }] }),
    prisma.shopPurchase.groupBy({ by: ["productId"], where: { status: "delivered" }, _count: { _all: true } }),
    featureOn("shop"),
    prisma.shopPurchase.count({ where: { status: "pending" } }),
  ]);
  const soldOf = new Map(sold.map((s) => [s.productId, s._count._all]));
  return {
    enabled,
    pendingOrders,
    products: rows.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      category: p.category,
      priceTanga: p.priceTanga,
      stock: p.stock,
      active: p.active,
      sortOrder: p.sortOrder,
      hasPhoto: !!(p.photoFileId || p.photoUrl),
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
  stock?: number;
  sortOrder?: number;
}

function cleanPatch(b: ProductPatch): ProductPatch {
  const out: ProductPatch = {};
  if (typeof b.name === "string" && b.name.trim()) out.name = b.name.trim().slice(0, 80);
  if (typeof b.description === "string") out.description = b.description.trim().slice(0, 400) || null;
  if (typeof b.category === "string" && b.category.trim()) out.category = b.category.trim().slice(0, 40);
  if (typeof b.priceTanga === "number" && Number.isFinite(b.priceTanga)) out.priceTanga = Math.min(SHOP_MAX_PRICE, Math.max(1, Math.floor(b.priceTanga)));
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

export async function uploadProductPhoto(productId: number, buf: Buffer, mime = "image/jpeg"): Promise<{ ok: boolean }> {
  const { env } = await import("../env");
  const TG_API = "https://api.telegram.org";
  const adminId = env.adminIds.find((id) => id.trim() !== "");
  if (env.BOT_TOKEN && adminId) {
    try {
      const form = new FormData();
      form.append("chat_id", adminId);
      form.append("photo", new Blob([buf], { type: mime }), "product.jpg");
      form.append("caption", `🛍 Product photo · #${productId}`);
      form.append("disable_notification", "true");
      const res = await fetch(`${TG_API}/bot${env.BOT_TOKEN}/sendPhoto`, { method: "POST", body: form });
      const data = (await res.json()) as { ok: boolean; result?: { photo?: { file_id: string }[] } };
      if (data.ok && data.result?.photo?.length) {
        const biggest = data.result.photo[data.result.photo.length - 1]!;
        await prisma.product.update({ where: { id: productId }, data: { photoFileId: biggest.file_id, photoUrl: null } });
        return { ok: true };
      }
    } catch {
      /* fall through to data-URL */
    }
  }
  const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;
  await prisma.product.update({ where: { id: productId }, data: { photoUrl: dataUrl, photoFileId: null } });
  return { ok: true };
}

export async function resolveProductPhoto(productId: number): Promise<string | null> {
  const p = await prisma.product.findUnique({ where: { id: productId }, select: { photoUrl: true, photoFileId: true } });
  if (!p) return null;
  if (p.photoUrl) return p.photoUrl;
  if (p.photoFileId) {
    const { resolveTelegramFileUrl } = await import("./driverPhotoService");
    return resolveTelegramFileUrl(p.photoFileId);
  }
  return null;
}
