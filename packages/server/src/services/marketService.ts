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
import { getDataSource } from "../kas";
import { spendCoins, withPhoneLock } from "./coinService";
import { weekKey } from "./missionService";

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
  await import("./missionService")
    .then((m) => m.incrementMission(memberId, "weekly_market"))
    .catch(() => undefined);
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

// ── REDEEM settlement machinery (DEFAULT OFF — every shop starts ABSORB) ─────
// A shop the admin promotes to settlementMode="redeem" gets cash-settled
// weekly at (1 − spread), through its OWN revenue-linked budget — double-
// walled from the user withdraw budget. ABSORB shops never reach this code.

const BOZOR_BASE_BUDGET = Number(process.env.BOZOR_BASE_BUDGET) || 10_000;
const BOZOR_PER_RIDE = Number(process.env.BOZOR_PER_RIDE) || 100;

function tashkentDay(d = new Date()): string {
  return new Date(d.getTime() + 5 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Atomically reserve from the SEPARATE bozor budget (clone of withdraw wall). */
async function consumeBozorBudget(amount: number): Promise<boolean> {
  let rides = 0;
  try {
    rides = (await getDataSource().getMainReport()).completedYesterday;
  } catch {
    /* kas unreachable → floor only (fail-safe) */
  }
  const total = BOZOR_BASE_BUDGET + rides * BOZOR_PER_RIDE;
  const key = `bozor_budget_used:${tashkentDay()}`;
  await prisma.$executeRaw`
    INSERT INTO "AppState" ("key","value","updatedAt") VALUES (${key}, ${String(amount)}, NOW())
    ON CONFLICT ("key") DO UPDATE
      SET "value" = CAST((CAST("AppState"."value" AS DOUBLE PRECISION) + ${amount}) AS TEXT), "updatedAt" = NOW()`;
  const row = await prisma.appState.findUnique({ where: { key } });
  const used = row ? Number(row.value) || 0 : 0;
  if (used > total) {
    await prisma.$executeRaw`
      UPDATE "AppState" SET "value" = CAST((CAST("value" AS DOUBLE PRECISION) - ${amount}) AS TEXT) WHERE "key" = ${key}`;
    return false;
  }
  return true;
}

/**
 * Weekly cash settlement for REDEEM-mode shops (runs from the periodic loop,
 * once per ISO week). Pays each shop (redeemed, unsettled coin volume) ×
 * (1 − spread) into the owner's kas bonus; kas failure leaves orders
 * unsettled for the next week's retry.
 */
export async function settleShopsWeekly(): Promise<void> {
  const wk = weekKey(new Date());
  const marker = `bozor_settle:${wk}`;
  if (await prisma.appState.findUnique({ where: { key: marker } })) return;
  await prisma.appState.upsert({ where: { key: marker }, create: { key: marker, value: "1" }, update: { value: "1" } });

  const shops = await prisma.shop.findMany({ where: { settlementMode: "redeem", status: "active", ownerPhone: { not: null } } });
  for (const shop of shops) {
    const unsettled = await prisma.shopOrder.findMany({
      where: { shopId: shop.id, status: "redeemed", settledAt: null },
      select: { id: true, priceCoins: true },
    });
    if (!unsettled.length) continue;
    const volume = unsettled.reduce((s, o) => s + o.priceCoins, 0);
    const payout = Math.floor(volume * (1 - shop.spread));
    if (payout <= 0) continue;

    if (!(await consumeBozorBudget(payout))) {
      const { alertAdmins } = await import("./economyService");
      await alertAdmins(`🏪 Bozor settle KECHIKDI: ${shop.name} — ${payout} so'm byudjetga sig'madi (keyingi haftaga qoldi)`).catch(() => undefined);
      continue;
    }
    let ok = false;
    try {
      const res = await withPhoneLock(shop.ownerPhone!, () => getDataSource().addClientBonus(shop.ownerPhone!, payout));
      ok = res.ok;
    } catch {
      ok = false;
    }
    const { alertAdmins } = await import("./economyService");
    if (ok) {
      await prisma.shopOrder.updateMany({ where: { id: { in: unsettled.map((o) => o.id) } }, data: { settledAt: new Date() } });
      await alertAdmins(`🏪 Bozor settle: <b>${shop.name}</b> — ${unsettled.length} vaucher, ${volume} tanga → <b>${payout} so'm</b> (spread ${Math.round(shop.spread * 100)}%)`).catch(() => undefined);
    } else {
      // release the reserved bozor budget — the kas write didn't happen
      await prisma.$executeRaw`
        UPDATE "AppState" SET "value" = CAST(GREATEST(0, CAST("value" AS DOUBLE PRECISION) - ${payout}) AS TEXT)
        WHERE "key" = ${`bozor_budget_used:${tashkentDay()}`}`.catch(() => undefined);
      await alertAdmins(`🏪 Bozor settle XATO: ${shop.name} — kas yozuvi muvaffaqiyatsiz, keyingi haftada qayta uriniladi`).catch(() => undefined);
    }
  }
}

/** The shop the calling member owns (phone match) — powers "Mening do'konim". */
export async function myShop(phone: string): Promise<{ shop: { id: number; name: string; emoji: string }; pending: MarketOrderView[] } | null> {
  const norm = (p: string) => p.replace(/\D/g, "").slice(-9);
  const shops = await prisma.shop.findMany({ where: { ownerPhone: { not: null }, status: "active" } });
  const mine = shops.find((s) => s.ownerPhone && norm(s.ownerPhone) === norm(phone));
  if (!mine) return null;
  const orders = await prisma.shopOrder.findMany({ where: { shopId: mine.id, status: "issued" }, orderBy: { createdAt: "desc" }, take: 30 });
  const listings = await prisma.listing.findMany({ where: { id: { in: [...new Set(orders.map((o) => o.listingId))] } } });
  const lb = new Map(listings.map((l) => [l.id, l]));
  return {
    shop: { id: mine.id, name: mine.name, emoji: mine.emoji },
    pending: orders.map((o) => ({
      id: o.id,
      shopName: mine.name,
      title: lb.get(o.listingId)?.title ?? "Mahsulot",
      emoji: lb.get(o.listingId)?.emoji ?? "🎁",
      priceCoins: o.priceCoins,
      voucherCode: o.voucherCode,
      status: o.status,
      at: o.createdAt.toISOString(),
    })),
  };
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
  await alertAdmins(`🏪 Vaucher ishlatildi: <b>${shop?.name ?? "?"}</b> — ${listing?.title ?? "?"} (${order.priceCoins} tanga)`).catch(() => undefined);
  return { ok: true, title: listing?.title, shopName: shop?.name };
}
