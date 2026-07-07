// 🍽 RESTORAN (feature "restoran", RESTORAN_PLAN.md) — R1: katalog o'qish only. V1 = CONCIERGE:
// naqd/so'm to'lov (CoinTxn TEGILMAYDI, D1); savat/buyurtma R2'da qo'shiladi. Shop patterni bilan
// bir xil admin-curated katalog, faqat narx real so'm.
import type { MenuItemView, RestaurantView } from "@t1067/shared";
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
