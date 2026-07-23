// 🏠 Home feed aggregate (feature "newhome", UY_REDESIGN Bosqich 2). ONE call for the premium home:
// promo banner + image-forward feed, computed from LOCAL DB (shop + restoran views — no kas, no new
// poller). Cached ~30s per audience (public vs owner-preview). The shop/restoran views already compute
// topSeller / avgRating / orderCount, so "auto top-seller + top-rated" is reuse, not re-implementation.
import type { HomeFeedResponse, HomeFeedItem, HomeBanner, ShopProductView, RestaurantView } from "@t1067/shared";
import { prisma } from "../db";
import { featureOn } from "./featureFlags";
import { listActiveProducts } from "./shopService";
import { listActiveRestaurants } from "./restoranService";

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
  const topR = restaurants.filter((r) => r.hasPhoto).sort((a, b) => b.orderCount - a.orderCount || b.avgRating - a.avgRating).slice(0, 3);

  const pItems: HomeFeedItem[] = topP.map((p) => ({
    kind: "product", id: p.id, name: p.name, photoUrl: `/api/shop/photo/${p.id}?s=1`,
    sub: `🏪 ${p.shopName ?? "Do'kon"}`, priceLabel: fmt(p.priceTanga),
    oldPriceLabel: p.oldPriceTanga ? fmt(p.oldPriceTanga) : undefined,
    badge: p.topSeller ? "top" : p.oldPriceTanga ? "disc" : p.isNew ? "new" : undefined, target: "dokon",
  }));
  const rItems: HomeFeedItem[] = topR.map((r) => ({
    kind: "restaurant", id: r.id, name: r.name, photoUrl: `/api/restoran/photo/${r.id}`,
    sub: `🍽 ${r.category}`, rating: r.avgRating, badge: r.orderCount > 0 ? "top" : undefined, target: "restoran",
  }));

  // interleave restaurant/product for visual variety; client renders the first card tall
  let items: HomeFeedItem[] = [];
  for (let i = 0; i < Math.max(rItems.length, pItems.length); i++) {
    const r = rItems[i]; if (r) items.push(r);
    const p = pItems[i]; if (p) items.push(p);
  }

  // promo banner: prefer a discounted product, else the top restaurant
  let banner: HomeBanner | null = null;
  const disc = topP.find((p) => p.oldPriceTanga);
  if (disc) banner = { id: disc.id, imageUrl: `/api/shop/photo/${disc.id}`, title: disc.name, subtitle: `🏪 ${disc.shopName ?? "Do'kon"} · chegirma`, target: "dokon", badge: "Chegirma" };
  else if (topR[0]) banner = { id: topR[0].id, imageUrl: `/api/restoran/photo/${topR[0].id}`, title: topR[0].name, subtitle: `🍽 ${topR[0].category} · ⭐ ${topR[0].avgRating.toFixed(1)}`, target: "restoran", badge: "Tavsiya" };

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
        banner = { id: feat.id, imageUrl: img, title: feat.title, subtitle: feat.subtitle ?? undefined, target: feat.target ?? (r ? "restoran" : "dokon"), badge: feat.badge ?? "Aksiya" };
      } else if (feat.kind === "product" && p) {
        pinned.push({ kind: "product", id: p.id, name: feat.title || p.name, photoUrl: `/api/shop/photo/${p.id}?s=1`, sub: feat.subtitle || `🏪 ${p.shopName ?? "Do'kon"}`, priceLabel: fmt(p.priceTanga), oldPriceLabel: p.oldPriceTanga ? fmt(p.oldPriceTanga) : undefined, badge: "top", target: "dokon" });
      } else if (feat.kind === "restaurant" && r) {
        pinned.push({ kind: "restaurant", id: r.id, name: feat.title || r.name, photoUrl: `/api/restoran/photo/${r.id}`, sub: feat.subtitle || `🍽 ${r.category}`, rating: r.avgRating, badge: "top", target: "restoran" });
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
