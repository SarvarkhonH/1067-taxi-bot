// 🏪 Bozor — spendable-cashback marketplace (ABSORB-only MVP).
//
// The economic point: coins gain REAL utility (haircuts, food, services from
// Koson shops) without us paying out cash. Buying BURNS the buyer's coins
// (atomic spendCoins — money never re-enters the buyer's wallet, so there is
// no farmable buy-side loop); the shop honors the voucher as its own
// discount/marketing. Cash settlement to shops is a later phase behind its
// own revenue-linked budget.
import { randomBytes } from "node:crypto";
import { prisma } from "../db";
import { spendCoins } from "./coinService";

export interface MarketShopView {
  id: number;
  name: string;
  emoji: string;
  category: string;
  listings: { id: number; title: string; emoji: string; priceCoins: number }[];
}

export interface MarketBuyResponse {
  ok: boolean;
  reason?: "not_found" | "insufficient" | "per_user_limit" | "failed";
  voucherCode?: string;
  shopName?: string;
  title?: string;
  priceCoins?: number;
  coinsLeft: number;
}

export interface MarketOrderView {
  id: number;
  shopName: string;
  title: string;
  emoji: string;
  priceCoins: number;
  voucherCode: string;
  status: string;
  at: string;
}

/** Unambiguous voucher alphabet (no 0/O/1/I). */
function voucherCode(): string {
  const a = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const b = randomBytes(6);
  let s = "";
  for (const x of b) s += a[x % a.length];
  return s;
}

export async function listShops(): Promise<MarketShopView[]> {
  const shops = await prisma.shop.findMany({
    where: { status: "active" },
    include: { listings: { where: { active: true }, orderBy: { priceCoins: "asc" } } },
    orderBy: { id: "asc" },
  });
  return shops
    .filter((s) => s.listings.length > 0)
    .map((s) => ({
      id: s.id,
      name: s.name,
      emoji: s.emoji,
      category: s.category,
      listings: s.listings.map((l) => ({ id: l.id, title: l.title, emoji: l.emoji, priceCoins: l.priceCoins })),
    }));
}

export async function buyListing(memberId: number, listingId: number): Promise<MarketBuyResponse> {
  const listing = await prisma.listing.findUnique({ where: { id: listingId }, include: { shop: true } });
  const coinsOf = async () => (await prisma.member.findUnique({ where: { id: memberId }, select: { coins: true } }))?.coins ?? 0;
  if (!listing || !listing.active || listing.shop.status !== "active") {
    return { ok: false, reason: "not_found", coinsLeft: await coinsOf() };
  }

  // anti-wash: per-member cap per listing
  const bought = await prisma.shopOrder.count({ where: { buyerMemberId: memberId, listingId } });
  if (bought >= listing.perUserLimit) return { ok: false, reason: "per_user_limit", coinsLeft: await coinsOf() };

  // burn first (atomic, never negative) — then issue the durable voucher
  const spent = await spendCoins(memberId, listing.priceCoins, "market_spend", `🏪 ${listing.shop.name}: ${listing.title}`);
  if (!spent.ok) return { ok: false, reason: "insufficient", coinsLeft: spent.balance };

  const order = await prisma.shopOrder.create({
    data: {
      shopId: listing.shopId,
      listingId,
      buyerMemberId: memberId,
      priceCoins: listing.priceCoins,
      voucherCode: voucherCode(),
    },
  });
  return {
    ok: true,
    voucherCode: order.voucherCode,
    shopName: listing.shop.name,
    title: listing.title,
    priceCoins: listing.priceCoins,
    coinsLeft: spent.balance,
  };
}

export async function myOrders(memberId: number): Promise<MarketOrderView[]> {
  const orders = await prisma.shopOrder.findMany({
    where: { buyerMemberId: memberId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const shopIds = [...new Set(orders.map((o) => o.shopId))];
  const listingIds = [...new Set(orders.map((o) => o.listingId))];
  const [shops, listings] = await Promise.all([
    prisma.shop.findMany({ where: { id: { in: shopIds } } }),
    prisma.listing.findMany({ where: { id: { in: listingIds } } }),
  ]);
  const shopBy = new Map(shops.map((s) => [s.id, s]));
  const listBy = new Map(listings.map((l) => [l.id, l]));
  return orders.map((o) => ({
    id: o.id,
    shopName: shopBy.get(o.shopId)?.name ?? "Do'kon",
    title: listBy.get(o.listingId)?.title ?? "Mahsulot",
    emoji: listBy.get(o.listingId)?.emoji ?? "🎁",
    priceCoins: o.priceCoins,
    voucherCode: o.voucherCode,
    status: o.status,
    at: o.createdAt.toISOString(),
  }));
}

/**
 * Shop-side redeem: the buyer shows the code, the shop owner (or an admin)
 * marks it used. Idempotent — flipping an already-redeemed voucher fails.
 */
export async function redeemVoucher(code: string, byPhone?: string): Promise<{ ok: boolean; reason?: "not_found" | "already" | "not_owner"; title?: string; shopName?: string }> {
  const order = await prisma.shopOrder.findUnique({ where: { voucherCode: code.trim().toUpperCase() } });
  if (!order) return { ok: false, reason: "not_found" };
  const shop = await prisma.shop.findUnique({ where: { id: order.shopId } });
  // owner gate: when the shop has a registered owner phone, only that phone (or admin path passing undefined) may redeem
  if (byPhone && shop?.ownerPhone) {
    const norm = (p: string) => p.replace(/\D/g, "").slice(-9);
    if (norm(byPhone) !== norm(shop.ownerPhone)) return { ok: false, reason: "not_owner" };
  }
  const flipped = await prisma.shopOrder.updateMany({
    where: { id: order.id, status: "issued" },
    data: { status: "redeemed", redeemedAt: new Date() },
  });
  if (flipped.count === 0) return { ok: false, reason: "already" };
  const listing = await prisma.listing.findUnique({ where: { id: order.listingId } });
  const { alertAdmins } = await import("./economyService");
  await alertAdmins(`🏪 Vaucher ishlatildi: <b>${shop?.name ?? "?"}</b> — ${listing?.title ?? "?"} (${order.priceCoins} coin)`).catch(() => undefined);
  return { ok: true, title: listing?.title, shopName: shop?.name };
}
