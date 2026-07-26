// 🧺 BirJoy V2 — MarketOrder pul-yadrosi (flag `bazarcart`). Ikki isbotlangan naqsh birlashmasi:
//   • restoran createFoodOrder: server-side qayta-fetch + narx-SNAPSHOT itemsJson + minOrder + cap;
//   • shop buyProduct: withMemberLock + BITTA $transaction (shartli stock-claim + shartli tanga-hold
//     + CoinTxn `mkt:<orderId>`) — birortasi yiqilsa HAMMASI rollback.
// V0.2 saboqlari TUG'MA: har status-o'tish SHARTLI updateMany; reject/cancel = flip + restock-hammasi
// + refund (`mktrefund:<orderId>`, kind "shop_refund" — REYTING_EXCLUDE'da) BITTA tranzaksiyada:
// throw → rollback → order avvalgi holatida qoladi → qayta-urinish mumkin, tanga YO'QOLMAYDI.
// Cash-guard: payKind="cash"da coin-op HECH QAYERDA yo'q (refund pul YARATGAN bo'lardi).
import { createHash } from "node:crypto";
import { prisma } from "../db";
import { withMemberLock } from "./coinService";
import { featureOn } from "./featureFlags";
import type { MarketCartItemInput, MarketOrderView, MarketOrderStatus, MarketCheckoutResponse } from "@t1067/shared";

const PENDING_PER_MEMBER = 3;
const MAX_QTY_PER_LINE = 20;
const MAX_LINES = 20;

interface Line { productId: number; name: string; qty: number; priceTanga: number }

const parseLines = (j: unknown): Line[] => (Array.isArray(j) ? (j as Line[]) : []);

function toView(o: {
  id: number; shopId: number; shopName: string; itemsJson: unknown; itemsTotal: number; deliveryFee: number;
  total: number; payKind: string; address: string; note: string | null; status: string; rejectReason: string | null;
  createdAt: Date; decidedAt: Date | null; etaMinutes?: number | null; etaSetAt?: Date | null;
}): MarketOrderView {
  return {
    id: o.id,
    shopId: o.shopId,
    shopName: o.shopName,
    items: parseLines(o.itemsJson),
    itemsTotal: o.itemsTotal,
    deliveryFee: o.deliveryFee,
    total: o.total,
    payKind: o.payKind as "tanga" | "cash",
    address: o.address,
    // R4-gap: ichki dublikat-hash markeri (`#<hash>`) hech qaysi client-yuzasiga chiqmasin
    note: (o.note ?? "").replace(/^#[0-9a-f]{16}\s?/, "") || null,
    status: o.status as MarketOrderStatus,
    rejectReason: o.rejectReason,
    createdAt: o.createdAt.toISOString(),
    decidedAt: o.decidedAt?.toISOString() ?? null,
    etaMinutes: o.etaMinutes ?? null,
    etaSetAt: o.etaSetAt?.toISOString() ?? null,
  };
}

/** ⏱ §10.3: sotuvchi qabul qilgandan keyin bergan yetkazish-va'dasi. Faqat JONLI buyurtmada
 *  (accepted/delivering) — yetkazilgan/rad etilgan buyurtmaning vaqtini o'zgartirish mantiqsiz.
 *  Qayta bosilsa va'da yangilanadi (sotuvchi kechikayotganini halol aytishi mumkin). */
export async function setMarketOrderEta(orderId: number, minutes: number): Promise<{ ok: boolean; memberId?: number; shopName?: string }> {
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 240) return { ok: false };
  const o = await prisma.marketOrder.findUnique({ where: { id: orderId }, select: { status: true, memberId: true, shopName: true } });
  if (!o || (o.status !== "accepted" && o.status !== "delivering")) return { ok: false };
  await prisma.marketOrder.update({ where: { id: orderId }, data: { etaMinutes: minutes, etaSetAt: new Date() } });
  return { ok: true, memberId: o.memberId, shopName: o.shopName };
}

/** Savat-checkout. Hammasi-yoki-hech-nima: birorta satr stock'i yetmasa BUTUN buyurtma rad. */
export async function createMarketOrder(
  memberId: number,
  shopId: number,
  items: MarketCartItemInput[],
  address: string,
  pay: "tanga" | "cash" = "tanga",
  note?: string,
  preview = false,
): Promise<MarketCheckoutResponse> {
  if (!preview && !(await featureOn("bazarcart"))) return { ok: false, reason: "off" };
  const addr = (address ?? "").trim().slice(0, 200);
  if (addr.length < 5) return { ok: false, reason: "bad_address" };
  const clean = (items ?? [])
    .filter((i) => Number.isFinite(i.productId) && Number.isFinite(i.qty) && i.qty > 0)
    .map((i) => ({ productId: Math.floor(i.productId), qty: Math.min(MAX_QTY_PER_LINE, Math.floor(i.qty)) }))
    .slice(0, MAX_LINES);
  if (!clean.length) return { ok: false, reason: "empty_cart" };

  return withMemberLock(memberId, async () => {
    const member = await prisma.member.findUnique({ where: { id: memberId }, select: { coins: true, fullName: true, displayName: true, phone: true } });
    if (!member) return { ok: false as const, reason: "unavailable" as const };
    const shop = await prisma.marketShop.findUnique({ where: { id: shopId } });
    if (!shop || !shop.active || shop.paused) return { ok: false as const, reason: "shop_closed" as const };

    // jonli qayta-fetch — narx/faollik/do'kon-tegishlilik server manbaidan (restoran naqshi)
    const prods = await prisma.product.findMany({ where: { id: { in: clean.map((i) => i.productId) }, active: true, shopId } });
    const prodOf = new Map(prods.map((p) => [p.id, p]));
    const lines: Line[] = [];
    for (const i of clean) {
      const p = prodOf.get(i.productId);
      if (!p) return { ok: false as const, reason: "unavailable" as const };
      lines.push({ productId: p.id, name: p.name, qty: i.qty, priceTanga: p.priceTanga });
    }
    const itemsTotal = lines.reduce((s, l) => s + l.qty * l.priceTanga, 0);
    const deliveryFee = shop.deliveryFeeSom;
    const total = itemsTotal + deliveryFee;
    if (itemsTotal < shop.minOrderTanga) return { ok: false as const, reason: "min_order" as const, minOrder: shop.minOrderTanga };
    if (pay === "tanga" && member.coins < total) return { ok: false as const, reason: "insufficient" as const };

    const open = await prisma.marketOrder.count({ where: { memberId, status: "pending" } });
    if (open >= PENDING_PER_MEMBER) return { ok: false as const, reason: "pending_limit" as const };
    // dublikat-guard (V0.4 naqshi): ayni savat ayni do'konga 60s ichida
    const itemsHash = createHash("sha1").update(JSON.stringify(lines.map((l) => [l.productId, l.qty]))).digest("hex").slice(0, 16);
    const dup = await prisma.marketOrder.findFirst({
      where: { memberId, shopId, status: "pending", createdAt: { gte: new Date(Date.now() - 60_000) }, note: { startsWith: `#${itemsHash}` } },
      select: { id: true },
    });
    if (dup) return { ok: false as const, reason: "duplicate" as const };

    try {
      const created = await prisma.$transaction(async (tx) => {
        // 1) har satr uchun ATOMIK stock-claim — birortasi 0 bo'lsa BUTUN tx rollback
        for (const l of lines) {
          const dec = await tx.product.updateMany({ where: { id: l.productId, active: true, stock: { gte: l.qty } }, data: { stock: { decrement: l.qty } } });
          if (dec.count === 0) throw new Error(`SOLD_OUT:${l.productId}`);
        }
        // 2) buyurtma-satr (narx-snapshot; note boshiga dup-hash marker)
        const order = await tx.marketOrder.create({
          data: {
            memberId, shopId, shopName: shop.name,
            itemsJson: lines as unknown as object,
            itemsTotal, deliveryFee, total,
            payKind: pay, address: addr, contact: member.phone ?? "—",
            note: `#${itemsHash}${note?.trim() ? " " + note.trim().slice(0, 180) : ""}`,
          },
        });
        // 3) TANGA'dagina: shartli hold (hech qachon manfiy emas) + ledger, shu order'ga kalitlangan
        if (pay === "tanga") {
          const paid = await tx.member.updateMany({ where: { id: memberId, coins: { gte: total } }, data: { coins: { decrement: total } } });
          if (paid.count === 0) throw new Error("INSUFFICIENT");
          await tx.coinTxn.create({
            data: { memberId, amount: -total, kind: "shop", reason: `🧺 ${shop.name} — ${lines.length} mahsulot (#${order.id})`, idempotencyKey: `mkt:${order.id}` },
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
          orderId: created.id, shopId, shopName: shop.name,
          lines, itemsTotal, deliveryFee, total, payKind: pay,
          buyerName: member.displayName || member.fullName, phone: member.phone ?? "—", address: addr,
        },
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.startsWith("SOLD_OUT")) return { ok: false as const, reason: "sold_out" as const, soldOutProductId: Number(msg.split(":")[1]) || undefined };
      if (msg === "INSUFFICIENT") return { ok: false as const, reason: "insufficient" as const };
      throw e;
    }
  });
}

export interface MarketDecision {
  ok: boolean;
  reason?: string;
  memberId?: number;
  shopId?: number;
  total?: number;
  payKind?: "tanga" | "cash";
  newStatus?: MarketOrderStatus;
  shopName?: string;
}

/** pending→accepted / accepted→delivering / delivering→delivered — SHARTLI o'tishlar (coin-op yo'q:
 *  tanga buy'da ushlangan, cash yetkazganda naqd olinadi). */
export async function advanceMarketOrder(orderId: number): Promise<MarketDecision> {
  const o = await prisma.marketOrder.findUnique({ where: { id: orderId } });
  if (!o) return { ok: false, reason: "not_found" };
  const NEXT: Record<string, MarketOrderStatus> = { pending: "accepted", accepted: "delivering", delivering: "delivered" };
  const next = NEXT[o.status];
  if (!next) return { ok: false, reason: o.status };
  const flip = await prisma.marketOrder.updateMany({
    where: { id: orderId, status: o.status },
    data: { status: next, ...(next === "delivered" ? { decidedAt: new Date() } : {}) },
  });
  if (flip.count === 0) {
    const now = await prisma.marketOrder.findUnique({ where: { id: orderId }, select: { status: true } });
    return { ok: false, reason: now?.status ?? "not_found" };
  }
  // V3.1: xarid-cashback — FAQAT delivered-o'tish shu flip (count===1) muvaffaqiyatli bo'lgach
  if (next === "delivered") {
    const { grantShopCashback } = await import("./shopService");
    await grantShopCashback(o.memberId, o.total, "mo", orderId).catch((e) => console.error("[shopcb] mo deliver failed:", e));
  }
  return { ok: true, memberId: o.memberId, shopId: o.shopId, total: o.total, payKind: o.payKind as "tanga" | "cash", newStatus: next, shopName: o.shopName };
}

/** ❌ Rad (seller/ega, terminal-oldi holatlardan) yoki rider-cancel (faqat pending) — BITTA tx:
 *  shartli flip + har satr restock + tanga-refund. Throw → rollback → avvalgi holat qoladi. */
async function terminateWithRefund(orderId: number, toStatus: "rejected" | "cancelled", fromStatuses: string[], reason?: string): Promise<MarketDecision> {
  const o = await prisma.marketOrder.findUnique({ where: { id: orderId } });
  if (!o) return { ok: false, reason: "not_found" };
  if (!fromStatuses.includes(o.status)) return { ok: false, reason: o.status };
  const lines = parseLines(o.itemsJson);
  try {
    await prisma.$transaction(async (tx) => {
      const flip = await tx.marketOrder.updateMany({
        where: { id: orderId, status: { in: fromStatuses } },
        data: { status: toStatus, decidedAt: new Date(), rejectReason: reason?.slice(0, 200) ?? null },
      });
      if (flip.count === 0) throw new Error("ALREADY_DECIDED");
      for (const l of lines) {
        await tx.product.updateMany({ where: { id: l.productId }, data: { stock: { increment: l.qty } } }); // o'chirilgan mahsulot → 0 satr, jim
      }
      if (o.payKind !== "cash") {
        await tx.coinTxn.create({
          data: { memberId: o.memberId, amount: o.total, kind: "shop_refund", reason: `🧺 «${o.shopName}» buyurtma ${toStatus === "cancelled" ? "bekor qilindi" : "rad etildi"} — tanga qaytarildi`, idempotencyKey: `mktrefund:${orderId}` },
        });
        await tx.member.update({ where: { id: o.memberId }, data: { coins: { increment: o.total } } });
      }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "ALREADY_DECIDED") {
      const now = await prisma.marketOrder.findUnique({ where: { id: orderId }, select: { status: true } });
      return { ok: false, reason: now?.status ?? "not_found" };
    }
    const { alertAdmins } = await import("./economyService");
    await alertAdmins(`⚠️ MarketOrder ${toStatus} FAILED (avvalgi holatda qoldi, qayta uring): #${orderId} — ${msg.slice(0, 120)}`).catch(() => undefined);
    return { ok: false, reason: "retry" };
  }
  return { ok: true, memberId: o.memberId, shopId: o.shopId, total: o.total, payKind: o.payKind as "tanga" | "cash", newStatus: toStatus, shopName: o.shopName };
}

export const rejectMarketOrder = (orderId: number, reason?: string): Promise<MarketDecision> =>
  terminateWithRefund(orderId, "rejected", ["pending", "accepted", "delivering"], reason);

/** ⏳ Javobsiz buyurtmalarni avtomatik bekor qilish + tangani qaytarish (flag `mktexpire`).
 *
 *  Nima uchun kerak: sotuvchi kartani e'tiborsiz qoldirsa buyurtma `pending`da MANGU qolardi va
 *  mijozning tangasi ushlab turaverardi. Mijoz o'zi bekor qila olardi — lekin ko'pchilik shunchaki
 *  aldangandek his qiladi va qaytib kelmaydi. Endi belgilangan muddatdan keyin tizim o'zi yopadi.
 *
 *  Xavfsizlik: yangi pul-mantiq YOZILMADI — ayni `terminateWithRefund` yo'li (shartli flip +
 *  restock + idempotent `mktrefund:<id>` kaliti). Faqat `pending` tegiladi: sotuvchi allaqachon
 *  qabul qilgan buyurtma HECH QACHON avtomatik bekor qilinmaydi (u telefon orqali kelishilgan
 *  bo'lishi mumkin). Bir tick'da ko'pi bilan 20 ta — supurgi tishlab qolmasin. */
export async function expireStaleMarketOrders(hours = 6): Promise<{ orderId: number; memberId: number; shopName: string; total: number; payKind: string }[]> {
  const { featureOn } = await import("./featureFlags");
  if (!(await featureOn("mktexpire"))) return [];
  const cutoff = new Date(Date.now() - hours * 3600_000);
  const stale = await prisma.marketOrder.findMany({
    where: { status: "pending", createdAt: { lt: cutoff } },
    select: { id: true },
    take: 20,
  });
  const done: { orderId: number; memberId: number; shopName: string; total: number; payKind: string }[] = [];
  for (const s of stale) {
    const r = await terminateWithRefund(s.id, "cancelled", ["pending"], `${hours} soat javobsiz — tizim bekor qildi`).catch(() => ({ ok: false }) as MarketDecision);
    if (r.ok) done.push({ orderId: s.id, memberId: r.memberId!, shopName: r.shopName ?? "", total: r.total ?? 0, payKind: r.payKind ?? "tanga" });
  }
  return done;
}

/** Rider o'zi bekor qiladi — FAQAT pending'da (seller qabul qilgach — telefon orqali kelishiladi). */
export const cancelMarketOrder = async (orderId: number, memberId: number): Promise<MarketDecision> => {
  const o = await prisma.marketOrder.findUnique({ where: { id: orderId }, select: { memberId: true } });
  if (!o || o.memberId !== memberId) return { ok: false, reason: "not_found" }; // egalik-guard
  return terminateWithRefund(orderId, "cancelled", ["pending"]);
};

export async function myMarketOrders(memberId: number, take = 20): Promise<MarketOrderView[]> {
  const rows = await prisma.marketOrder.findMany({ where: { memberId }, orderBy: { id: "desc" }, take });
  return rows.map(toView);
}

export async function adminListMarketOrders(status?: string, scopeShopId?: number): Promise<(MarketOrderView & { buyerName: string; contact: string })[]> {
  const rows = await prisma.marketOrder.findMany({
    where: { ...(status ? { status } : {}), ...(scopeShopId !== undefined ? { shopId: scopeShopId } : {}) },
    orderBy: { id: "desc" },
    take: 100,
  });
  const members = await prisma.member.findMany({ where: { id: { in: rows.map((r) => r.memberId) } }, select: { id: true, fullName: true, displayName: true } });
  const nameOf = new Map(members.map((m) => [m.id, m.displayName || m.fullName]));
  return rows.map((o) => ({ ...toView(o), buyerName: nameOf.get(o.memberId) ?? `m${o.memberId}`, contact: o.contact }));
}
