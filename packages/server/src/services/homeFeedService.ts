// 🏠 Home feed aggregate (feature "newhome", UY_REDESIGN Bosqich 2). ONE call for the premium home:
// promo banner + image-forward feed, computed from LOCAL DB (shop + restoran views — no kas, no new
// poller). Cached ~30s per audience (public vs owner-preview). The shop/restoran views already compute
// topSeller / avgRating / orderCount, so "auto top-seller + top-rated" is reuse, not re-implementation.
import type { HomeFeedResponse, HomeFeedItem, HomeBanner, ShopProductView, RestaurantView, MenuItemView } from "@t1067/shared";
import { prisma } from "../db";
import { featureOn } from "./featureFlags";
import { listActiveProducts } from "./shopService";
import { listActiveRestaurants, getRestaurantDetail } from "./restoranService";

const TTL_MS = 30_000;
const cache = new Map<string, { at: number; data: HomeFeedResponse }>();
const fmt = (n: number) => n.toLocaleString("ru-RU");

/** Admin curation (Bosqich 3) changed → drop the cache so the next open reflects it immediately. */
export function bustHomeFeedCache(): void { cache.clear(); }

/** preview = admin owner-preview (see catalog while a flag is DARK), mirrors /api/me + shop/restoran. */
export async function getHomeFeed(preview: boolean): Promise<HomeFeedResponse> {
  const key = preview ? "p" : "u";
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  const [shopOn, restoranOn, xizmatlarOn, elonlarOn, intercityOn] = await Promise.all([
    featureOn("shop"), featureOn("restoran"), featureOn("xizmatlar"), featureOn("elonlar"), featureOn("intercity"),
  ]);
  const [products, restaurants] = await Promise.all([
    (shopOn || preview) ? listActiveProducts(preview).catch(() => [] as ShopProductView[]) : Promise.resolve([] as ShopProductView[]),
    (restoranOn || preview) ? listActiveRestaurants(preview).catch(() => [] as RestaurantView[]) : Promise.resolve([] as RestaurantView[]),
  ]);

  const rank = (p: ShopProductView) => (p.topSeller ? 0 : p.featured ? 1 : p.oldPriceTanga ? 2 : p.isNew ? 3 : 4);
  const topP = products.filter((p) => p.hasPhoto).sort((a, b) => rank(a) - rank(b)).slice(0, 4);

  // 🍽 a brand-new restaurant with a rich photographed menu (e.g. the Dasturxon import) had ZERO
  // orders/reviews, so pure orderCount/avgRating ranking buried it behind older photo-less
  // restaurants — defeating the whole point of showing appetizing dish photos. Rank by photo
  // QUALITY first (has a photographed dish > has only its own cover photo > no photo at all),
  // orderCount/avgRating only break ties within the same photo tier.
  const dishPhotoCounts = restaurants.length
    ? await prisma.menuItem.groupBy({
        by: ["restaurantId"],
        where: { restaurantId: { in: restaurants.map((r) => r.id) }, available: true, OR: [{ photoFileId: { not: null } }, { photoUrl: { not: null } }] },
        _count: true,
      }).catch(() => [] as { restaurantId: number; _count: number }[])
    : [];
  const dishPhotoCountById = new Map(dishPhotoCounts.map((d) => [d.restaurantId, d._count]));
  const photoTier = (r: RestaurantView) => ((dishPhotoCountById.get(r.id) ?? 0) > 0 ? 2 : r.hasPhoto ? 1 : 0);
  const topR = restaurants
    .filter((r) => photoTier(r) > 0)
    .sort((a, b) => photoTier(b) - photoTier(a) || b.orderCount - a.orderCount || b.avgRating - a.avgRating)
    .slice(0, 3);

  const pItems: HomeFeedItem[] = topP.map((p) => ({
    kind: "product", id: p.id, name: p.name, photoUrl: `/api/shop/photo/${p.id}?s=1`,
    sub: `🏪 ${p.shopName ?? "Do'kon"}`, priceLabel: `${fmt(p.priceTanga)} 🪙`,
    oldPriceLabel: p.oldPriceTanga ? `${fmt(p.oldPriceTanga)} 🪙` : undefined,
    badge: p.topSeller ? "top" : p.oldPriceTanga ? "disc" : p.isNew ? "new" : undefined, target: `dokon:${p.id}`,
  }));

  // 🍽 a real DISH photo sells food far better than the restaurant's own logo/exterior shot (owner
  // request, matches the Wolt/Yandex Eats pattern) — pull a couple of photographed, available dishes
  // per top restaurant. A restaurant with no photographed dish yet falls back to its own card.
  const dishSets = await Promise.all(topR.map((r) => getRestaurantDetail(r.id, preview).catch(() => ({ restaurant: r, items: [] as MenuItemView[] }))));
  const dItems: HomeFeedItem[] = [];
  topR.forEach((r, i) => {
    const dishes = (dishSets[i]?.items ?? []).filter((m) => m.hasPhoto && m.available).slice(0, 2);
    if (dishes.length === 0) {
      dItems.push({ kind: "restaurant", id: r.id, name: r.name, photoUrl: `/api/restoran/photo/${r.id}`, sub: `🍽 ${r.category}`, rating: r.avgRating, badge: r.orderCount > 0 ? "top" : undefined, target: `restoran:${r.id}` });
      return;
    }
    for (const m of dishes) {
      dItems.push({ kind: "dish", id: m.id, name: m.name, photoUrl: `/api/restoran/menuphoto/${m.id}`, sub: `🍽 ${r.name}`, priceLabel: `${fmt(m.priceSom)} so'm`, badge: r.orderCount > 0 ? "top" : undefined, target: `restoran:${r.id}` });
    }
  });

  // interleave dish/product for visual variety; client renders the first card tall
  let items: HomeFeedItem[] = [];
  for (let i = 0; i < Math.max(dItems.length, pItems.length); i++) {
    const d = dItems[i]; if (d) items.push(d);
    const p = pItems[i]; if (p) items.push(p);
  }

  // promo banner: prefer a discounted product, else a photographed dish, else the top restaurant
  let banner: HomeBanner | null = null;
  const disc = topP.find((p) => p.oldPriceTanga);
  const bannerDish = dItems.find((x) => x.kind === "dish");
  if (disc) banner = { id: disc.id, imageUrl: `/api/shop/photo/${disc.id}`, title: disc.name, subtitle: `🏪 ${disc.shopName ?? "Do'kon"} · chegirma`, target: `dokon:${disc.id}`, badge: "Chegirma" };
  else if (bannerDish) banner = { id: bannerDish.id, imageUrl: bannerDish.photoUrl!, title: bannerDish.name, subtitle: bannerDish.sub, target: bannerDish.target, badge: "Tavsiya" };
  else if (topR[0]) banner = { id: topR[0].id, imageUrl: `/api/restoran/photo/${topR[0].id}`, title: topR[0].name, subtitle: `🍽 ${topR[0].category} · ⭐ ${topR[0].avgRating.toFixed(1)}`, target: `restoran:${topR[0].id}`, badge: "Tavsiya" };

  // 🏠 admin curation (Bosqich 3): owner-set banner override + pinned items float to top. EMPTY →
  // auto feed above stands. try/catch so a not-yet-migrated table just leaves the auto feed intact.
  try {
    const now = new Date();
    const feats = await prisma.homeFeatured.findMany({
      where: { active: true, AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }] },
      orderBy: { sortOrder: "asc" },
    });
    const prodById = new Map(products.map((p) => [p.id, p]));
    const restById = new Map(restaurants.map((r) => [r.id, r]));
    const pinned: HomeFeedItem[] = [];
    for (const feat of feats) {
      const p = feat.refId ? prodById.get(feat.refId) : undefined;
      const r = feat.refId ? restById.get(feat.refId) : undefined;
      if (feat.kind === "banner") {
        const img = feat.imageKey || (p ? `/api/shop/photo/${p.id}` : r ? `/api/restoran/photo/${r.id}` : banner?.imageUrl ?? "");
        const fallbackTarget = r ? `restoran:${r.id}` : p ? `dokon:${p.id}` : "uy";
        banner = { id: feat.id, imageUrl: img, title: feat.title, subtitle: feat.subtitle ?? undefined, target: feat.target ?? fallbackTarget, badge: feat.badge ?? "Aksiya" };
      } else if (feat.kind === "product" && p) {
        pinned.push({ kind: "product", id: p.id, name: feat.title || p.name, photoUrl: `/api/shop/photo/${p.id}?s=1`, sub: feat.subtitle || `🏪 ${p.shopName ?? "Do'kon"}`, priceLabel: `${fmt(p.priceTanga)} 🪙`, oldPriceLabel: p.oldPriceTanga ? `${fmt(p.oldPriceTanga)} 🪙` : undefined, badge: "top", target: `dokon:${p.id}` });
      } else if (feat.kind === "restaurant" && r) {
        pinned.push({ kind: "restaurant", id: r.id, name: feat.title || r.name, photoUrl: `/api/restoran/photo/${r.id}`, sub: feat.subtitle || `🍽 ${r.category}`, rating: r.avgRating, badge: "top", target: `restoran:${r.id}` });
      }
    }
    if (pinned.length) {
      const seen = new Set(pinned.map((x) => x.kind + x.id));
      items = [...pinned, ...items.filter((x) => !seen.has(x.kind + x.id))];
    }
  } catch { /* HomeFeatured not migrated yet → auto feed only */ }

  const data: HomeFeedResponse = {
    banner,
    items: items.slice(0, 6),
    services: [
      { key: "dokon", on: shopOn }, { key: "restoran", on: restoranOn }, { key: "yol", on: intercityOn },
      { key: "xizmat", on: xizmatlarOn }, { key: "elonlar", on: elonlarOn },
    ],
  };
  cache.set(key, { at: Date.now(), data });
  return data;
}

// ── admin curation CRUD (Bosqich 3, feature "homeadmin") ──
export async function adminListFeatured() {
  return prisma.homeFeatured.findMany({ orderBy: [{ active: "desc" }, { sortOrder: "asc" }] });
}
export async function adminCreateFeatured(input: {
  kind: string; title: string; refId?: number | null; imageKey?: string | null; subtitle?: string | null;
  target?: string | null; badge?: string | null; sortOrder?: number; startsAt?: string | null; endsAt?: string | null;
  region?: string | null; active?: boolean;
}) {
  const row = await prisma.homeFeatured.create({
    data: {
      kind: input.kind, title: input.title, refId: input.refId ?? null, imageKey: input.imageKey ?? null,
      subtitle: input.subtitle ?? null, target: input.target ?? null, badge: input.badge ?? null,
      sortOrder: input.sortOrder ?? 0,
      startsAt: input.startsAt ? new Date(input.startsAt) : null, endsAt: input.endsAt ? new Date(input.endsAt) : null,
      region: input.region ?? null, active: input.active ?? true,
    },
  });
  bustHomeFeedCache();
  return row;
}
export async function adminSetFeaturedActive(id: number, active: boolean) {
  await prisma.homeFeatured.update({ where: { id }, data: { active } }).catch(() => undefined);
  bustHomeFeedCache();
}
export async function adminDeleteFeatured(id: number) {
  await prisma.homeFeatured.delete({ where: { id } }).catch(() => undefined);
  bustHomeFeedCache();
}
