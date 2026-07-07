// 🍽 RESTORAN (feature "restoran", RESTORAN_PLAN.md) — R1: katalog o'qish only. V1 = CONCIERGE:
// naqd/so'm to'lov (CoinTxn TEGILMAYDI, D1); savat/buyurtma R2'da qo'shiladi. Shop patterni bilan
// bir xil admin-curated katalog, faqat narx real so'm.
import type { AdminFoodOrderRow, MenuItemView, RestaurantView } from "@t1067/shared";
import { prisma } from "../db";
import { featureOn } from "./featureFlags";

/** preview=true (admin) bypasses the DARK flag so the owner can QABUL the catalog while riders
 *  see nothing yet — bir xil shop/xizmatlar owner-preview patterni. */
export async function listActiveRestaurants(preview = false): Promise<RestaurantView[]> {
  if (!preview && !(await featureOn("restoran"))) return [];
  const rows = await prisma.restaurant.findMany({
    where: { active: true, paused: false },
    orderBy: [{ sortOrder: "asc" }, { id: "desc" }],
    take: 100,
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    address: r.address,
    workHours: r.workHours,
    deliveryFeeSom: r.deliveryFeeSom,
    minOrderSom: r.minOrderSom,
    pickupEnabled: r.pickupEnabled,
    prepMinutes: r.prepMinutes,
    hasPhoto: !!(r.photoFileId || r.photoUrl),
    avgRating: r.avgRating,
    reviewCount: r.reviewCount,
    orderCount: r.orderCount,
  }));
}

export async function getRestaurantDetail(id: number, preview = false): Promise<{ restaurant: RestaurantView | null; items: MenuItemView[] }> {
  if (!preview && !(await featureOn("restoran"))) return { restaurant: null, items: [] };
  const r = await prisma.restaurant.findUnique({ where: { id } });
  if (!r || !r.active) return { restaurant: null, items: [] };
  const menuItems = await prisma.menuItem.findMany({
    where: { restaurantId: id },
    orderBy: [{ section: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
  });
  return {
    restaurant: {
      id: r.id,
      name: r.name,
      category: r.category,
      address: r.address,
      workHours: r.workHours,
      deliveryFeeSom: r.deliveryFeeSom,
      minOrderSom: r.minOrderSom,
      pickupEnabled: r.pickupEnabled,
      prepMinutes: r.prepMinutes,
      hasPhoto: !!(r.photoFileId || r.photoUrl),
      avgRating: r.avgRating,
      reviewCount: r.reviewCount,
      orderCount: r.orderCount,
    },
    items: menuItems.map((m) => ({
      id: m.id,
      section: m.section,
      name: m.name,
      desc: m.desc || undefined,
      priceSom: m.priceSom,
      hasPhoto: !!(m.photoFileId || m.photoUrl),
      available: m.available,
    })),
  };
}

// ── R2: savat + checkout + FoodOrder ────────────────────────────────────────────────────────────
// V1 = CONCIERGE (D1/D2): naqd/so'm to'lov, CoinTxn TEGILMAYDI. Operator qo'lda holatni boshqaradi
// (R3) — bu yerda faqat buyurtmani to'g'ri, atomik yaratish.

const PENDING_PER_MEMBER = 3; // shop bilan bir xil anti-spam chegarasi

/** "09:00-22:00" formatini o'qiydi — services.tsx/restoran.tsx client-side openNow() bilan bir xil
 *  mantiq, lekin serverda: checkout paytida haqiqiy vaqt tekshiriladi (mijoz eski cache bilan
 *  yopiq restoranga buyurtma yubormasin). */
function isOpenNow(wh: string | null): boolean {
  if (!wh) return true; // ish-vaqti kiritilmagan — cheklov yo'q
  const m = /^(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})$/.exec(wh.trim());
  if (!m) return true;
  const cur = new Date().getHours() * 60 + new Date().getMinutes();
  const a = Number(m[1]) * 60 + Number(m[2]);
  const b = Number(m[3]) * 60 + Number(m[4]);
  return a <= b ? cur >= a && cur < b : cur >= a || cur < b;
}

export interface FoodOrderCartItemIn {
  menuItemId: number;
  qty: number;
}

export interface FoodOrderOwnerNotice {
  orderId: number;
  restaurantName: string;
  restaurantPhone: string;
  itemsText: string;
  totalSom: number;
  isPickup: boolean;
  buyerName: string;
  contact: string;
  address: string;
  note: string;
}

/**
 * Bitta restorandan (D7: bir savat = bir restoran — cart har doim shu restoranga tegishli,
 * aralashtirish struktura jihatidan mumkin emas) ko'p-taomli buyurtma. Narx SNAPSHOT — checkout
 * paytidagi jonli menyu narxidan olinadi (admin keyin narxni o'zgartirsa ham eski buyurtma
 * o'zgarmaydi). Atomik: restoran+itemlar bitta so'rovda tekshiriladi, keyin bitta insert.
 */
export async function createFoodOrder(
  memberId: number,
  restaurantId: number,
  cartItems: FoodOrderCartItemIn[],
  address: string,
  contact: string,
  note: string,
  isPickup: boolean,
  preview = false,
): Promise<{ ok: boolean; reason?: string; orderId?: number; totalSom?: number; notice?: FoodOrderOwnerNotice }> {
  if (!preview && !(await featureOn("restoran"))) return { ok: false, reason: "off" };
  const addr = (address ?? "").trim().slice(0, 200);
  if (!isPickup && addr.length < 5) return { ok: false, reason: "bad_address" };
  const cleanItems = (cartItems ?? []).filter((c) => Number.isFinite(c.menuItemId) && Number.isFinite(c.qty) && c.qty > 0 && c.qty <= 20);
  if (!cleanItems.length) return { ok: false, reason: "empty_cart" };

  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
  if (!restaurant || !restaurant.active || restaurant.paused === true) return { ok: false, reason: restaurant?.paused ? "paused" : "unavailable" };
  if (!isOpenNow(restaurant.workHours)) return { ok: false, reason: "closed" };
  if (isPickup && !restaurant.pickupEnabled) return { ok: false, reason: "unavailable" };

  const open = await prisma.foodOrder.count({ where: { memberId, status: "pending" } });
  if (open >= PENDING_PER_MEMBER) return { ok: false, reason: "pending_limit" };

  const menuItems = await prisma.menuItem.findMany({ where: { id: { in: cleanItems.map((c) => c.menuItemId) }, restaurantId, available: true } });
  const menuOf = new Map(menuItems.map((m) => [m.id, m]));
  if (menuItems.length !== new Set(cleanItems.map((c) => c.menuItemId)).size) return { ok: false, reason: "bad_item" };

  const itemsJson = cleanItems.map((c) => {
    const m = menuOf.get(c.menuItemId)!;
    return { menuItemId: m.id, name: m.name, qty: c.qty, priceSom: m.priceSom };
  });
  const itemsTotalSom = itemsJson.reduce((sum, i) => sum + i.priceSom * i.qty, 0);
  if (itemsTotalSom < restaurant.minOrderSom) return { ok: false, reason: "below_min" };
  const deliveryFeeSom = isPickup ? 0 : restaurant.deliveryFeeSom;
  const totalSom = itemsTotalSom + deliveryFeeSom;

  const member = await prisma.member.findUnique({ where: { id: memberId }, select: { fullName: true, displayName: true, phone: true } });
  const order = await prisma.foodOrder.create({
    data: {
      memberId, restaurantId, itemsJson, itemsTotalSom, deliveryFeeSom, totalSom,
      isPickup, address: isPickup ? (restaurant.address ?? "Olib ketish") : addr,
      contact: (contact ?? member?.phone ?? "").trim().slice(0, 30) || "—",
      note: (note ?? "").trim().slice(0, 300),
    },
  });
  await prisma.restaurant.update({ where: { id: restaurantId }, data: { orderCount: { increment: 1 } } }).catch(() => undefined);

  return {
    ok: true,
    orderId: order.id,
    totalSom,
    notice: {
      orderId: order.id,
      restaurantName: restaurant.name,
      restaurantPhone: restaurant.phone,
      itemsText: itemsJson.map((i) => `${i.name} ×${i.qty}`).join(", "),
      totalSom,
      isPickup,
      buyerName: member?.displayName || member?.fullName || "Mijoz",
      contact: order.contact,
      address: order.address,
      note: order.note,
    },
  };
}

export interface FoodOrderRow {
  id: number;
  restaurantId: number;
  restaurantName: string;
  itemsJson: { menuItemId: number; name: string; qty: number; priceSom: number }[];
  itemsTotalSom: number;
  deliveryFeeSom: number;
  totalSom: number;
  isPickup: boolean;
  address: string;
  status: string;
  rejectReason: string | null;
  createdAt: string;
}

export async function myFoodOrders(memberId: number, take = 20): Promise<FoodOrderRow[]> {
  const rows = await prisma.foodOrder.findMany({ where: { memberId }, orderBy: { id: "desc" }, take });
  const restaurants = await prisma.restaurant.findMany({ where: { id: { in: rows.map((r) => r.restaurantId) } }, select: { id: true, name: true } });
  const nameOf = new Map(restaurants.map((r) => [r.id, r.name]));
  return rows.map((o) => ({
    id: o.id,
    restaurantId: o.restaurantId,
    restaurantName: nameOf.get(o.restaurantId) ?? "Restoran",
    itemsJson: o.itemsJson as FoodOrderRow["itemsJson"],
    itemsTotalSom: o.itemsTotalSom,
    deliveryFeeSom: o.deliveryFeeSom,
    totalSom: o.totalSom,
    isPickup: o.isPickup,
    address: o.address,
    status: o.status,
    rejectReason: o.rejectReason,
    createdAt: o.createdAt.toISOString(),
  }));
}

// ── R3: admin sessiya-navbati + qo'lda holat-boshqaruv + SLA (RESTORAN_PLAN §2/§3/§6) ────────────
// Operator ODAM — Telegram-bot integratsiyasi YO'Q (V2ga qoldirilgan, D3). Holat o'tishlari FAQAT
// admin panel tugmalari orqali, atomik status-guard bilan (updateMany where status=<kutilgan>) —
// holat-poyga (ikki operator bir vaqtda bossa) natijasida bittasi g'olib chiqadi, ikkinchisi no-op.

const SLA_MINUTES = 3; // §3: shundan keyin admin panelda rang o'zgaradi + bir martalik operator-eslatma

export async function adminListFoodOrders(status?: string): Promise<AdminFoodOrderRow[]> {
  const rows = await prisma.foodOrder.findMany({
    where: status ? { status } : undefined,
    orderBy: { id: "desc" },
    take: 200,
  });
  const [restaurants, members] = await Promise.all([
    prisma.restaurant.findMany({ where: { id: { in: rows.map((r) => r.restaurantId) } }, select: { id: true, name: true, phone: true } }),
    prisma.member.findMany({ where: { id: { in: rows.map((r) => r.memberId) } }, select: { id: true, fullName: true, displayName: true } }),
  ]);
  const restOf = new Map(restaurants.map((r) => [r.id, r]));
  const memberOf = new Map(members.map((m) => [m.id, m]));
  const now = Date.now();
  return rows.map((o) => {
    const r = restOf.get(o.restaurantId);
    const m = memberOf.get(o.memberId);
    return {
      id: o.id,
      restaurantId: o.restaurantId,
      restaurantName: r?.name ?? "Restoran",
      restaurantPhone: r?.phone ?? "—",
      buyerName: m?.displayName || m?.fullName || "Mijoz",
      contact: o.contact,
      itemsJson: o.itemsJson as AdminFoodOrderRow["itemsJson"],
      itemsTotalSom: o.itemsTotalSom,
      deliveryFeeSom: o.deliveryFeeSom,
      totalSom: o.totalSom,
      isPickup: o.isPickup,
      address: o.address,
      note: o.note,
      status: o.status as AdminFoodOrderRow["status"],
      rejectReason: o.rejectReason,
      calledAt: o.calledAt?.toISOString() ?? null,
      ageMinutes: Math.floor((now - o.createdAt.getTime()) / 60_000),
      createdAt: o.createdAt.toISOString(),
    };
  });
}

/** ☎ "Restoranga qo'ng'iroq qildim" belgisi — SLA soatini ko'rinishda to'xtatadi, holat hali pending. */
export async function markOrderCalled(orderId: number): Promise<{ ok: boolean }> {
  await prisma.foodOrder.updateMany({ where: { id: orderId, status: "pending" }, data: { calledAt: new Date() } });
  return { ok: true };
}

/** ✅ Qabul qildi — pending→accepted. Atomik status-guard: ikki operator bir vaqtda bossa faqat biri o'tadi. */
export async function acceptFoodOrder(orderId: number, operatorId?: number): Promise<{ ok: boolean; reason?: string }> {
  const r = await prisma.foodOrder.updateMany({
    where: { id: orderId, status: "pending" },
    data: { status: "accepted", acceptedAt: new Date(), operatorId: operatorId ?? null },
  });
  return r.count > 0 ? { ok: true } : { ok: false, reason: "not_pending" };
}

/** ❌ Rad — FAQAT pending'dan (§2 state machine). Naqd-only (D1) — refund logikasi kerak emas. */
export async function rejectFoodOrder(orderId: number, reason: string): Promise<{ ok: boolean; reason?: string; notice?: { memberId: number; restaurantName: string; reason: string } }> {
  const order = await prisma.foodOrder.findUnique({ where: { id: orderId } });
  if (!order) return { ok: false, reason: "not_found" };
  const r = await prisma.foodOrder.updateMany({
    where: { id: orderId, status: "pending" },
    data: { status: "rejected", rejectReason: reason.trim().slice(0, 300) || "Sabab ko'rsatilmagan" },
  });
  if (r.count === 0) return { ok: false, reason: "not_pending" };
  const restaurant = await prisma.restaurant.findUnique({ where: { id: order.restaurantId }, select: { name: true } });
  return { ok: true, notice: { memberId: order.memberId, restaurantName: restaurant?.name ?? "Restoran", reason: reason.trim() || "Sabab ko'rsatilmagan" } };
}

const NEXT_STATUS: Record<string, string> = { accepted: "preparing", preparing: "delivering", delivering: "delivered" };

/** 🍳→🛵→✅ — §2 state machine bo'yicha KEYINGI bosqichga o'tkazadi (qaysi holatdan qaysi holatga
 *  o'tish mumkinligini admin so'ramaydi — tugma bosilganda joriy holat serverda tekshiriladi). */
export async function advanceFoodOrderStatus(orderId: number): Promise<{ ok: boolean; reason?: string; newStatus?: string; notice?: { memberId: number; restaurantName: string; newStatus: string } }> {
  const order = await prisma.foodOrder.findUnique({ where: { id: orderId } });
  if (!order) return { ok: false, reason: "not_found" };
  const next = NEXT_STATUS[order.status];
  if (!next) return { ok: false, reason: "no_next" };
  const data: { status: string; deliveredAt?: Date } = { status: next };
  if (next === "delivered") data.deliveredAt = new Date();
  const r = await prisma.foodOrder.updateMany({ where: { id: orderId, status: order.status }, data });
  if (r.count === 0) return { ok: false, reason: "race" };
  const restaurant = await prisma.restaurant.findUnique({ where: { id: order.restaurantId }, select: { name: true } });
  return { ok: true, newStatus: next, notice: { memberId: order.memberId, restaurantName: restaurant?.name ?? "Restoran", newStatus: next } };
}

/** §3: SLA-sweep — bookingNotifier'ning MAVJUD tick'iga qo'shiladi (D4/D5: yangi poller YO'Q).
 *  3+ daqiqa `pending` va hali ogohlantirilmagan buyurtmalarni BIR MARTA (idempotent, slaAlertedAt)
 *  operatorlarga eslatadi. Mijozga HECH NARSA ko'rinmaydi — bu faqat ichki nazorat (§0). */
export async function checkRestoranSlaAndAlert(alertAdmins: (html: string) => Promise<void>): Promise<void> {
  const cutoff = new Date(Date.now() - SLA_MINUTES * 60_000);
  const stale = await prisma.foodOrder.findMany({
    where: { status: "pending", createdAt: { lt: cutoff }, slaAlertedAt: null },
    select: { id: true, restaurantId: true, createdAt: true },
    take: 50,
  });
  if (!stale.length) return;
  const restaurants = await prisma.restaurant.findMany({ where: { id: { in: stale.map((s) => s.restaurantId) } }, select: { id: true, name: true } });
  const nameOf = new Map(restaurants.map((r) => [r.id, r.name]));
  const lines = stale.map((s) => {
    const age = Math.floor((Date.now() - s.createdAt.getTime()) / 60_000);
    return `#${s.id} · ${nameOf.get(s.restaurantId) ?? "Restoran"} · ${age} daq kutmoqda`;
  });
  await alertAdmins(`🍽 <b>Restoran: ${stale.length} ta buyurtma ${SLA_MINUTES}+ daq javobsiz</b>\n${lines.join("\n")}`).catch(() => undefined);
  await prisma.foodOrder.updateMany({ where: { id: { in: stale.map((s) => s.id) } }, data: { slaAlertedAt: new Date() } });
}

/** Public photo proxy resolution — driver-photo/shop pattern (Telegram file_id → CDN redirect). */
export async function resolveRestaurantPhoto(restaurantId: number): Promise<string | null> {
  const r = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { photoUrl: true, photoFileId: true } });
  if (!r) return null;
  if (r.photoUrl) return r.photoUrl;
  if (r.photoFileId) {
    const { resolveTelegramFileUrl } = await import("./driverPhotoService");
    return resolveTelegramFileUrl(r.photoFileId);
  }
  return null;
}

export async function resolveMenuItemPhoto(menuItemId: number): Promise<string | null> {
  const m = await prisma.menuItem.findUnique({ where: { id: menuItemId }, select: { photoUrl: true, photoFileId: true } });
  if (!m) return null;
  if (m.photoUrl) return m.photoUrl;
  if (m.photoFileId) {
    const { resolveTelegramFileUrl } = await import("./driverPhotoService");
    return resolveTelegramFileUrl(m.photoFileId);
  }
  return null;
}

// ── admin CRUD (owner-gated at the route layer; R1 = create/list, full edit/photo-upload lands with R4) ──

export interface AdminRestaurantRow {
  id: number;
  name: string;
  category: string;
  phone: string;
  active: boolean;
  paused: boolean;
  menuCount: number;
  orderCount: number;
  createdAt: string;
}

export async function adminListRestaurants(): Promise<{ restaurants: AdminRestaurantRow[]; enabled: boolean }> {
  const [rows, menuCounts, enabled] = await Promise.all([
    prisma.restaurant.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "desc" }] }),
    prisma.menuItem.groupBy({ by: ["restaurantId"], _count: { _all: true } }),
    featureOn("restoran"),
  ]);
  const menuOf = new Map(menuCounts.map((c) => [c.restaurantId, c._count._all]));
  return {
    enabled,
    restaurants: rows.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      phone: r.phone,
      active: r.active,
      paused: r.paused,
      menuCount: menuOf.get(r.id) ?? 0,
      orderCount: r.orderCount,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

export interface RestaurantPatch {
  name?: string;
  category?: string;
  phone?: string;
  address?: string | null;
  workHours?: string | null;
  deliveryFeeSom?: number;
  minOrderSom?: number;
  pickupEnabled?: boolean;
  prepMinutes?: number;
  sortOrder?: number;
}

function cleanRestaurantPatch(b: RestaurantPatch): RestaurantPatch {
  const out: RestaurantPatch = {};
  if (typeof b.name === "string" && b.name.trim()) out.name = b.name.trim().slice(0, 80);
  if (typeof b.category === "string" && b.category.trim()) out.category = b.category.trim().slice(0, 40);
  if (typeof b.phone === "string" && b.phone.trim()) out.phone = b.phone.trim().slice(0, 20);
  if (b.address !== undefined) out.address = (b.address ?? "").toString().trim().slice(0, 200) || null;
  if (b.workHours !== undefined) out.workHours = (b.workHours ?? "").toString().trim().slice(0, 20) || null;
  if (typeof b.deliveryFeeSom === "number" && Number.isFinite(b.deliveryFeeSom)) out.deliveryFeeSom = Math.max(0, Math.floor(b.deliveryFeeSom));
  if (typeof b.minOrderSom === "number" && Number.isFinite(b.minOrderSom)) out.minOrderSom = Math.max(0, Math.floor(b.minOrderSom));
  if (typeof b.pickupEnabled === "boolean") out.pickupEnabled = b.pickupEnabled;
  if (typeof b.prepMinutes === "number" && Number.isFinite(b.prepMinutes)) out.prepMinutes = Math.min(180, Math.max(5, Math.floor(b.prepMinutes)));
  if (typeof b.sortOrder === "number" && Number.isFinite(b.sortOrder)) out.sortOrder = Math.floor(b.sortOrder);
  return out;
}

export async function adminCreateRestaurant(body: RestaurantPatch): Promise<{ ok: boolean; id?: number; error?: string }> {
  const p = cleanRestaurantPatch(body);
  if (!p.name || !p.phone) return { ok: false, error: "name_phone_required" };
  const row = await prisma.restaurant.create({ data: { ...p, name: p.name, phone: p.phone, active: false } }); // created OFF — admin flips on
  return { ok: true, id: row.id };
}

export async function adminEditRestaurant(id: number, body: RestaurantPatch): Promise<{ ok: boolean }> {
  await prisma.restaurant.update({ where: { id }, data: cleanRestaurantPatch(body) }).catch(() => undefined);
  return { ok: true };
}

export async function adminToggleRestaurant(id: number, active: boolean): Promise<{ ok: boolean }> {
  await prisma.restaurant.update({ where: { id }, data: { active: !!active } }).catch(() => undefined);
  return { ok: true };
}

export async function adminDeleteRestaurant(id: number): Promise<{ ok: boolean }> {
  await prisma.menuItem.deleteMany({ where: { restaurantId: id } }).catch(() => undefined);
  await prisma.restaurant.delete({ where: { id } }).catch(() => undefined); // FoodOrder.restaurantId is loose — order history survives
  return { ok: true };
}

export interface MenuItemPatch {
  section?: string;
  name?: string;
  desc?: string;
  priceSom?: number;
  available?: boolean;
  sortOrder?: number;
}

function cleanMenuItemPatch(b: MenuItemPatch): MenuItemPatch {
  const out: MenuItemPatch = {};
  if (typeof b.section === "string" && b.section.trim()) out.section = b.section.trim().slice(0, 40);
  if (typeof b.name === "string" && b.name.trim()) out.name = b.name.trim().slice(0, 80);
  if (typeof b.desc === "string") out.desc = b.desc.trim().slice(0, 200);
  if (typeof b.priceSom === "number" && Number.isFinite(b.priceSom)) out.priceSom = Math.min(2_000_000, Math.max(500, Math.floor(b.priceSom)));
  if (typeof b.available === "boolean") out.available = b.available;
  if (typeof b.sortOrder === "number" && Number.isFinite(b.sortOrder)) out.sortOrder = Math.floor(b.sortOrder);
  return out;
}

export async function adminCreateMenuItem(restaurantId: number, body: MenuItemPatch): Promise<{ ok: boolean; id?: number; error?: string }> {
  const p = cleanMenuItemPatch(body);
  if (!p.name || !p.priceSom) return { ok: false, error: "name_price_required" };
  const row = await prisma.menuItem.create({ data: { restaurantId, ...p, name: p.name, priceSom: p.priceSom } });
  return { ok: true, id: row.id };
}

/** §6.1 bulk-menyu kiritish: "nom — narx" qatorlari → ko'p menu-item bir bosishda. */
export async function adminBulkCreateMenuItems(restaurantId: number, section: string, lines: string[]): Promise<{ ok: boolean; created: number }> {
  const sec = section.trim().slice(0, 40) || "Taomlar";
  const existing = await prisma.menuItem.count({ where: { restaurantId } });
  const rows = lines
    .map((line) => {
      const m = /^(.+?)\s*[—\-–]\s*([\d\s]+)$/.exec(line.trim());
      if (!m) return null;
      const name = m[1]!.trim().slice(0, 80);
      const priceSom = Math.floor(Number(m[2]!.replace(/\s/g, "")));
      if (!name || !Number.isFinite(priceSom) || priceSom < 500) return null;
      return { name, priceSom: Math.min(2_000_000, priceSom) };
    })
    .filter((r): r is { name: string; priceSom: number } => r !== null);
  if (!rows.length) return { ok: false, created: 0 };
  await prisma.menuItem.createMany({
    data: rows.map((r, i) => ({ restaurantId, section: sec, name: r.name, priceSom: r.priceSom, sortOrder: existing + i })),
  });
  return { ok: true, created: rows.length };
}

export async function adminEditMenuItem(id: number, body: MenuItemPatch): Promise<{ ok: boolean }> {
  await prisma.menuItem.update({ where: { id }, data: cleanMenuItemPatch(body) }).catch(() => undefined);
  return { ok: true };
}

export async function adminDeleteMenuItem(id: number): Promise<{ ok: boolean }> {
  await prisma.menuItem.delete({ where: { id } }).catch(() => undefined);
  return { ok: true };
}
