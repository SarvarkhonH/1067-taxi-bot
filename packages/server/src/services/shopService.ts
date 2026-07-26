// 🛍 TANGA SHOP (feature "shop") — owner-listed real goods bought with tanga, owner-fulfilled by
// hand (delivery by his own drivers). "Cashout-in-reverse": tanga is HELD at purchase time inside
// ONE transaction (balance-conditional decrement + stock-conditional decrement + order insert +
// CoinTxn key shop:<orderId>), so no oversell and no partial state is possible; a rejected order
// refunds IN the same tx as the status flip (key shoprefund:<orderId>, exactly-once) + restocks
// (V0.2 BirJoy audit: flip+refund atomik — throw = rollback = order pending'da qoladi). NO lootboxes — the
// owner's hard rule: deterministic price ↔ product only. UI word is "tanga", never "coin".
import {
  SHOP_ANNOUNCEMENT_MAX,
  SHOP_LOW_STOCK,
  SHOP_MAX_PRICE,
  SHOP_NEIGHBORHOOD_MAX,
  SHOP_REVIEW_MAX_PHOTOS,
  SHOP_REVIEW_MAX_TEXT,
  SHOP_STORY_MAX,
  type ShopBuyResponse,
  type ShopProductView,
  type ShopProfileEditInput,
  type ShopProfileView,
  type ShopPurchaseView,
  type ShopStoryPost,
  type ShopStoryTrayItem,
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
/** AUDIT TOPDI: `take: 100` GLOBAL edi — jonli bazada 133 faol mahsulot bor, do'kon 1 ning
 *  116 tasidan faqat ~83 tasi mijozga yetib borardi, ya'ni vitrinasi JIMGINA kesilgan edi.
 *  Global limitni oshirish har ilova-ochilishida yukni oshiradi; o'rniga do'kon ochilganda
 *  `shopId` bo'yicha alohida, chegaralangan so'rov qilinadi. */
export async function listActiveProducts(preview = false, memberId?: number, shopId?: number): Promise<ShopProductView[]> {
  if (!preview && !(await featureOn("shop"))) return [];
  const rows = await prisma.product.findMany({
    where: { active: true, stock: { gt: 0 }, ...(shopId ? { shopId } : {}) },
    orderBy: [{ sortOrder: "asc" }, { id: "desc" }],
    take: shopId ? 300 : 100, // do'kon-ko'lamli so'rov cheklangan, shuning uchun kattaroq
  });
  const newCutoff = Date.now() - NEW_BADGE_DAYS * 86400_000;
  // grouped queries → per-product gallery size + top-3 sellers (delivered orders) + 👍/👎 tallies
  const [counts, sold, thumbs, myFavs] = await Promise.all([
    prisma.productPhoto.groupBy({ by: ["productId"], where: { productId: { in: rows.map((r) => r.id) } }, _count: { _all: true } }),
    prisma.shopPurchase.groupBy({ by: ["productId"], where: { status: "delivered" }, _count: { _all: true }, orderBy: { _count: { productId: "desc" } }, take: 3 }),
    prisma.productReview.groupBy({ by: ["productId", "thumb"], where: { productId: { in: rows.map((r) => r.id) } }, _count: { _all: true } }),
    memberId ? prisma.productFavorite.findMany({ where: { memberId, productId: { in: rows.map((r) => r.id) } }, select: { productId: true } }) : Promise.resolve([]),
  ]);
  const countOf = new Map(counts.map((c) => [c.productId, c._count._all]));
  const topIds = new Set(sold.filter((s) => s._count._all > 0).map((s) => s.productId));
  const thumbOf = new Map(thumbs.map((t) => [`${t.productId}:${t.thumb}`, t._count._all]));
  const favIds = new Set(myFavs.map((f) => f.productId));
  // 🏪 V1.4: bazar-qatlam uchun do'kon-ma'lumot (OFF holatda ham qaytadi — additiv, UI o'qimaydi)
  const shopIds = [...new Set(rows.map((r) => r.shopId).filter((v): v is number => v !== null))];
  const shops = shopIds.length ? await prisma.marketShop.findMany({ where: { id: { in: shopIds } }, select: { id: true, name: true, deliveryText: true } }) : [];
  const shopOf = new Map(shops.map((s) => [s.id, s]));
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
    shopId: p.shopId,
    shopName: p.shopId ? shopOf.get(p.shopId)?.name ?? null : null,
    deliveryText: p.shopId ? shopOf.get(p.shopId)?.deliveryText ?? null : null,
    favCount: p.favCount,
    isFav: favIds.has(p.id),
  }));
}

// ── 🧡 V2b: sevimlilar (ServiceFavorite naqshi, memberId-kalitli) ──────────────────────────────
export async function toggleProductFavorite(memberId: number, productId: number, on: boolean): Promise<{ ok: boolean; on: boolean; favCount: number }> {
  if (on) {
    // R4-gap fix: increment tied STRICTLY to this call's own create winning the unique-constraint
    // race (P2002 = someone else already favorited it concurrently — skip the increment; the old
    // findUnique-then-unconditional-increment let two concurrent ON calls both increment even
    // though only one ProductFavorite row could ever exist).
    try {
      await prisma.productFavorite.create({ data: { memberId, productId } });
      await prisma.product.update({ where: { id: productId }, data: { favCount: { increment: 1 } } }).catch(() => undefined);
    } catch (e) {
      if ((e as { code?: string } | null)?.code !== "P2002") throw e;
    }
  } else {
    const deleted = await prisma.productFavorite.deleteMany({ where: { memberId, productId } });
    if (deleted.count > 0) {
      await prisma.product.updateMany({ where: { id: productId, favCount: { gt: 0 } }, data: { favCount: { decrement: 1 } } }).catch(() => undefined);
    }
  }
  const p = await prisma.product.findUnique({ where: { id: productId }, select: { favCount: true } });
  return { ok: true, on, favCount: p?.favCount ?? 0 };
}

export async function listFavoriteProducts(memberId: number, preview = false): Promise<ShopProductView[]> {
  const favs = await prisma.productFavorite.findMany({ where: { memberId }, orderBy: { createdAt: "desc" }, select: { productId: true } });
  if (!favs.length) return [];
  const ids = new Set(favs.map((f) => f.productId));
  const all = await listActiveProducts(preview, memberId); // shu preview/flag-qoidasi — do'kon o'chsa sevimlilar ham ko'rinmaydi
  return all.filter((p) => ids.has(p.id));
}

// 📞 SOTUV-SIGNALI: «qidirildi-topilmadi» yozuvi egaga qaysi sotuvchini chaqirishni aytadi —
// shuning uchun ma'lumot TOZA bo'lishi shart. Mini App har bosishda (300ms debounce) qidiradi,
// ya'ni "sabzavot" bitta so'rov uchun 8 ta yozuv qoldirardi ("s","sa","sab",…) va ro'yxat
// o'qib bo'lmas holga kelardi (jonli DB'da 60 yozuvdan atigi ~8 tasi haqiqiy edi).
// Tuzatish: (1) 3 belgidan qisqasi umuman yozilmaydi, (2) bir foydalanuvchining bir soatlik
// yozuv-zanjiri BITTA satrga yig'iladi — satr har doim eng TO'LIQ yozilgan shaklni saqlaydi.
const DEMAND_MIN_LEN = 3;
const DEMAND_WINDOW_MS = 60 * 60_000;

async function logMarketDemand(query: string, memberId?: number): Promise<void> {
  if (query.length < DEMAND_MIN_LEN) return;
  const since = new Date(Date.now() - DEMAND_WINDOW_MS);
  // memberId yo'q bo'lsa (anonim) — zanjir-yig'ish XAVFLI (turli odamlar aralashib ketadi),
  // shuning uchun faqat aynan bir xil so'rov takrorlanmasin.
  if (memberId == null) {
    const dup = await prisma.marketDemand.findFirst({ where: { memberId: null, query, createdAt: { gte: since } }, select: { id: true } });
    if (!dup) await prisma.marketDemand.create({ data: { query, memberId: null } }).catch(() => undefined);
    return;
  }
  const last = await prisma.marketDemand.findFirst({
    where: { memberId, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    select: { id: true, query: true },
  });
  if (last) {
    const a = query.toLowerCase();
    const b = last.query.toLowerCase();
    if (a.startsWith(b) || b.startsWith(a)) {
      // o'sha so'zni yozib turibdi (yoki o'chirib orqaga qaytdi) — yangi satr YO'Q,
      // mavjud satr eng to'liq shaklga yangilanadi
      if (query.length > last.query.length) {
        await prisma.marketDemand.update({ where: { id: last.id }, data: { query } }).catch(() => undefined);
      }
      return;
    }
  }
  await prisma.marketDemand.create({ data: { query, memberId } }).catch(() => undefined);
}

/** 🏪 V1.4 (BirJoy): Bozor-bosh payload — do'kon-rail + kategoriya-karusel + server-qidiruv.
 *  q berilsa: OR-contains qidiruv (serviceDirectory naqshi); nol natija → MarketDemand yozuvi
 *  («qidirildi-topilmadi» — egaga qaysi sotuvchini chaqirishni aytadi). */
export async function getMarketHome(preview = false, q?: string, memberId?: number): Promise<{
  shops: { id: number; name: string; open: boolean; deliveryText: string | null; rating: number; hasPhoto: boolean; deliveryFeeSom: number; minOrderTanga: number; shopKind: string; mahallaId: number | null; story?: string | null; weeklyOrders?: number }[];
  cats: { slug: string; name: string; emoji: string; hasIcon: boolean; id: number }[];
  products: ShopProductView[];
}> {
  if (!preview && !(await featureOn("bazar"))) return { shops: [], cats: [], products: [] };
  const query = (q ?? "").trim().slice(0, 60);
  // V1.5: mahalla-tur do'konlar bozor-tur bilan bitta take:20'ga sig'ishmasin (shahar ulg'aygach
  // mahalla-do'konlar top-20'dan siqib chiqarilib ko'rinmay qolardi) — ikkisi ALOHIDA so'raladi.
  const [bozorShops, mahallaShops, cats, products] = await Promise.all([
    prisma.marketShop.findMany({ where: { active: true, paused: false, shopKind: "bozor" }, orderBy: [{ sortOrder: "asc" }, { orderCount: "desc" }], take: 20 }),
    prisma.marketShop.findMany({ where: { active: true, paused: false, shopKind: "mahalla" }, orderBy: [{ sortOrder: "asc" }, { orderCount: "desc" }], take: 200 }),
    prisma.categoryDef.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, take: 20 }),
    listActiveProducts(true), // flag-tekshiruv yuqorida bo'ldi; preview=true — ichki qayta-gate emas
  ]);
  // AUDIT (2026-07-26, bazar hammaga yoqilgan kuni): sotiladigan mahsuloti YO'Q do'kon ham
  // mijoz-qatorida turardi — mijoz bosadi, bo'sh javon ko'radi va bozorga ishonchi qaytmaydi.
  // Endi mijozga faqat kamida 1 ta faol+zaxirali mahsuloti bor do'kon ko'rsatiladi. `preview`da
  // (ega/admin) HAMMASI qoladi — sotuvchi o'z bo'sh do'konini ko'rib, mahsulot qo'sha olishi kerak.
  // `products` ro'yxatidan hisoblanmaydi: u 100 ta bilan cheklangan, ya'ni katta katalogda
  // do'konlar noto'g'ri yashirinib qolardi — shuning uchun alohida groupBy.
  let bozor = bozorShops;
  let mahalla = mahallaShops;
  if (!preview) {
    const stocked = new Set(
      (await prisma.product.groupBy({ by: ["shopId"], where: { active: true, stock: { gt: 0 }, shopId: { not: null } }, _count: true }))
        .map((g) => g.shopId)
        .filter((id): id is number => id !== null),
    );
    bozor = bozorShops.filter((s) => stocked.has(s.id));
    mahalla = mahallaShops.filter((s) => stocked.has(s.id));
  }
  let filtered = products;
  if (query) {
    const ql = query.toLowerCase();
    filtered = products.filter((p) => p.name.toLowerCase().includes(ql) || (p.description ?? "").toLowerCase().includes(ql) || p.category.toLowerCase().includes(ql));
    // AUDIT TOPDI: mahsulot topilmasa "qidirildi-topilmadi" ro'yxatiga yozilardi — hatto mijoz
    // MAVJUD DO'KON nomini yozgan bo'lsa ham. Natijada eganing "yo'q mahsulotlar" hisoboti
    // allaqachon bor do'kon nomlari bilan to'lardi. Endi do'kon-nomi mos kelsa — bu talab emas.
    const shopNameHit = [...bozorShops, ...mahallaShops].some((s) => s.name.toLowerCase().includes(ql));
    if (filtered.length === 0 && !shopNameHit) await logMarketDemand(query, memberId);
  }
  // V1.5: "N mahalladosh bu hafta xarid qildi" — HAQIQIY hisob (soxta ijtimoiy-signal emas), faqat
  // mahalla-tur do'konlar uchun (bozor-tur ro'yxati bu maydonsiz, o'zgarishsiz qoladi).
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const weeklyCounts = mahalla.length
    ? await prisma.marketOrder.groupBy({
        by: ["shopId"],
        where: { shopId: { in: mahalla.map((s) => s.id) }, createdAt: { gte: weekAgo }, status: { notIn: ["rejected", "cancelled"] } },
        _count: { _all: true },
      })
    : [];
  const weeklyMap = new Map(weeklyCounts.map((w) => [w.shopId, w._count._all]));
  const shopView = (s: (typeof bozorShops)[number]) => ({
    id: s.id, name: s.name, open: isOpenNow(s.workHours), deliveryText: s.deliveryText, rating: s.avgRating,
    hasPhoto: !!(s.photoFileId || s.photoUrl), deliveryFeeSom: s.deliveryFeeSom, minOrderTanga: s.minOrderTanga,
    shopKind: s.shopKind, mahallaId: s.mahallaId,
    ...(s.shopKind === "mahalla" ? { story: s.story ? s.story.slice(0, 90) : null, weeklyOrders: weeklyMap.get(s.id) ?? 0 } : {}),
  });
  return {
    shops: [...bozor, ...mahalla].map(shopView),
    cats: cats.map((c) => ({ id: c.id, slug: c.slug, name: c.name, emoji: c.emoji, hasIcon: !!(c.iconFileId || c.iconUrl) })),
    products: filtered,
  };
}

/** 🏪 D2: bitta do'konning profil-sahifasi (hero/info-qator/e'lon/hikoya/reyting). Owner-preview
 *  (`preview`) — bazar OFF bo'lsa ham egaga/adminlarga ko'rinadi, xuddi getMarketHome kabi. */
/** Tashkent (UTC+5) bugungi kun boshlanishi, haqiqiy UTC'da — adminInsights.ts'dagi bir xil
 *  yordamchining kichik nusxasi (mijozga-ochiq ordersToday hisobida ishlatiladi). */
function tashkentTodayStart(): Date {
  const shifted = new Date(Date.now() + 5 * 3600_000);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - 5 * 3600_000);
}

// BirJoy Market v2: mijozga ko'rinadigan "Bugun N marta buyurtma qabul qilgan" — real, soxta-
// bo'lmaydigan signal ("tez javob beradi" belgisi o'rniga, dizaynerga aytilgan real cheklovga mos).
export async function getShopOrdersToday(shopId: number): Promise<number> {
  const todayStart = tashkentTodayStart();
  const productIds = (await prisma.product.findMany({ where: { shopId }, select: { id: true } })).map((p) => p.id);
  const [purchaseCount, orderCount] = await Promise.all([
    productIds.length ? prisma.shopPurchase.count({ where: { productId: { in: productIds }, createdAt: { gte: todayStart } } }) : 0,
    prisma.marketOrder.count({ where: { shopId, createdAt: { gte: todayStart } } }),
  ]);
  return purchaseCount + orderCount;
}

export async function getShopProfile(shopId: number, preview = false): Promise<ShopProfileView | null> {
  if (!preview && !(await featureOn("bazar"))) return null;
  const shop = await prisma.marketShop.findUnique({ where: { id: shopId } });
  if (!shop || (!shop.active && !preview)) return null;
  // V1.5: mahallaId bo'lsa Mahalla.name ustun keladi, aks holda eski erkin-matn neighborhood'ga fallback.
  const mahallaName = shop.mahallaId ? (await prisma.mahalla.findUnique({ where: { id: shop.mahallaId }, select: { name: true } }))?.name ?? null : null;
  const productIds = (await prisma.product.findMany({ where: { shopId }, select: { id: true } })).map((p) => p.id);
  const [ratingAgg, ordersToday] = await Promise.all([
    productIds.length
      ? prisma.productReview.aggregate({
          where: { productId: { in: productIds }, rating: { not: null } },
          _avg: { rating: true },
          _count: { rating: true },
        })
      : null,
    getShopOrdersToday(shopId),
  ]);
  return {
    id: shop.id,
    name: shop.name,
    open: isOpenNow(shop.workHours),
    neighborhood: mahallaName ?? shop.neighborhood,
    deliveryText: shop.deliveryText,
    story: shop.story,
    announcement: shop.announcement,
    hasPhoto: !!(shop.photoFileId || shop.photoUrl),
    avgRating: Math.round(((ratingAgg?._avg.rating ?? 0)) * 10) / 10,
    reviewCount: ratingAgg?._count.rating ?? 0,
    ordersToday,
  };
}

// §10.1: do'kon-operatsion holati — ADMIN-ONLY (customer-facing ShopProfileView'ga QO'SHILMAYDI,
// getShopProfile ikkalasiga ham xizmat qiladi — mijozga SLA-buzilish/pauza sonini ko'rsatish shart
// emas). Alohida, kichik funksiya: "muammoni tuzat" 1-bosishli pauza + hozirgi SLA-buzilish soni.
export interface ShopOpsStatus {
  paused: boolean;
  slaBreaches: number; // hozir pending + allaqachon 1 marta SLA-alert bo'lgan buyurtmalar soni
}

export async function getShopOpsStatus(shopId: number): Promise<ShopOpsStatus | null> {
  const shop = await prisma.marketShop.findUnique({ where: { id: shopId }, select: { paused: true } });
  if (!shop) return null;
  const productIds = (await prisma.product.findMany({ where: { shopId }, select: { id: true } })).map((p) => p.id);
  const [purchaseBreaches, orderBreaches] = await Promise.all([
    productIds.length ? prisma.shopPurchase.count({ where: { status: "pending", slaAlertedAt: { not: null }, productId: { in: productIds } } }) : 0,
    prisma.marketOrder.count({ where: { shopId, status: "pending", slaAlertedAt: { not: null } } }),
  ]);
  return { paused: shop.paused, slaBreaches: purchaseBreaches + orderBreaches };
}

// §10.1: rol-darajali audit-jurnal — do'kon-boshqaruv mutatsiyalari uchun (kim/qachon/nima
// o'zgartirdi). ATAYLAB route-darajasida chaqiriladi (bu yerda emas) — mavjud service-funksiyalar
// imzosini o'zgartirmaslik uchun (kam xavfli qo'shimcha, kam call-site). Best-effort, jim xato.
export interface AdminAuditLogRow {
  id: number;
  actorRole: string;
  actorTgId: string | null;
  action: string;
  targetType: string;
  targetId: number | null;
  detail: string | null;
  createdAt: string;
}

export async function logAudit(actorRole: string, actorTgId: string | null, action: string, targetType: string, targetId: number | null, detail?: string): Promise<void> {
  await prisma.adminAuditLog.create({ data: { actorRole, actorTgId, action, targetType, targetId, detail: detail?.slice(0, 200) } }).catch(() => undefined);
}

export async function listAuditLog(limit = 100): Promise<AdminAuditLogRow[]> {
  const rows = await prisma.adminAuditLog.findMany({ orderBy: { id: "desc" }, take: Math.min(limit, 200) });
  return rows.map((r) => ({ id: r.id, actorRole: r.actorRole, actorTgId: r.actorTgId, action: r.action, targetType: r.targetType, targetId: r.targetId, detail: r.detail, createdAt: r.createdAt.toISOString() }));
}

export async function toggleShopPause(shopId: number, paused: boolean): Promise<{ ok: boolean }> {
  await prisma.marketShop.update({ where: { id: shopId }, data: { paused } }).catch(() => undefined);
  return { ok: true };
}

// §10.1: do'kon "sog'lik-skori" — javob-tezlik (SLA-buzilish darajasi) + rad% + hikoya-faollik
// BITTA raqamda (0-100). NOTE: MarketShop.orderCount ustuni hech qachon increment qilinmagan (dead
// field, faqat getMarketHome sort'ida ishlatiladi) — shuning uchun bu yerda ShopPurchase/MarketOrder
// jadvallaridan TO'G'RIDAN-TO'G'RI hisoblanadi, o'sha eskirgan ustunga tayanmaydi.
export interface ShopHealthScore {
  score: number; // 0-100, yuqori = sog'lom
  totalOrders: number;
  rejectionRate: number; // 0-1
  slaBreachRate: number; // 0-1 — buyurtmalarning necha foizi 15+ daq javobsiz qolib alert bo'lgan
  activeRecently: boolean; // so'nggi 7 kunda hikoya qo'yganmi
}

export async function getShopHealthScore(shopId: number): Promise<ShopHealthScore | null> {
  const shop = await prisma.marketShop.findUnique({ where: { id: shopId }, select: { id: true } });
  if (!shop) return null;
  const productIds = (await prisma.product.findMany({ where: { shopId }, select: { id: true } })).map((p) => p.id);
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const [purchaseTotal, purchaseRejected, purchaseSla, orderTotal, orderRejected, orderSla, recentStory] = await Promise.all([
    productIds.length ? prisma.shopPurchase.count({ where: { productId: { in: productIds } } }) : 0,
    productIds.length ? prisma.shopPurchase.count({ where: { productId: { in: productIds }, status: "rejected" } }) : 0,
    productIds.length ? prisma.shopPurchase.count({ where: { productId: { in: productIds }, slaAlertedAt: { not: null } } }) : 0,
    prisma.marketOrder.count({ where: { shopId } }),
    prisma.marketOrder.count({ where: { shopId, status: "rejected" } }),
    prisma.marketOrder.count({ where: { shopId, slaAlertedAt: { not: null } } }),
    prisma.shopStory.count({ where: { shopId, createdAt: { gte: weekAgo } } }),
  ]);
  const totalOrders = purchaseTotal + orderTotal;
  const rejectionRate = totalOrders ? (purchaseRejected + orderRejected) / totalOrders : 0;
  const slaBreachRate = totalOrders ? (purchaseSla + orderSla) / totalOrders : 0;
  const activeRecently = recentStory > 0;
  const score = Math.max(0, Math.min(100, Math.round(100 - rejectionRate * 40 - slaBreachRate * 40 - (activeRecently ? 0 : 20))));
  return { score, totalOrders, rejectionRate, slaBreachRate, activeRecently };
}

// §10.2: "kuzatilmoqda-lekin-olinmayapti" signal — mijozlar ❤️-belgilagan (Product.favCount, V2b
// keshlangan hisoblagich), lekin hech kim SOTIB OLMAGAN mahsulotlar. Sotuvchiga "bu mahsulotga
// qiziqish bor, lekin sotilmayapti" signali beradi (narx/rasm/tavsifni ko'rib chiqish kerak bo'lishi
// mumkin). Faqat ShopPurchase (jonli, yagona-buyurtma yo'l) hisoblanadi — MarketOrder hali DARK
// (bazarcart) va itemsJson ichida, per-mahsulot hisoblash uchun alohida, kattaroq ish talab qiladi.
export interface WatchedNotBoughtItem {
  productId: number;
  name: string;
  favCount: number;
}

export async function listWatchedNotBought(shopId: number): Promise<WatchedNotBoughtItem[]> {
  const products = await prisma.product.findMany({ where: { shopId, favCount: { gt: 0 } }, select: { id: true, name: true, favCount: true } });
  if (!products.length) return [];
  const sold = await prisma.shopPurchase.groupBy({ by: ["productId"], where: { productId: { in: products.map((p) => p.id) }, status: { not: "rejected" } }, _count: { _all: true } });
  const soldMap = new Map(sold.map((s) => [s.productId, s._count._all]));
  return products
    .filter((p) => (soldMap.get(p.id) ?? 0) === 0)
    .map((p) => ({ productId: p.id, name: p.name, favCount: p.favCount }))
    .sort((a, b) => b.favCount - a.favCount);
}

// §10.2: sodiqlik-progress-bar — FAQAT KO'RSATKICH (ega qarori: mukofotsiz, hozircha). Haqiqiy
// yakunlangan xaridlar soni shu do'kondan, keyingi "davra"gacha (har 5 tadan) necha qoldi. Yangi
// pul-mexanika YO'Q — CLAUDE.md qoidasi ("pul-to'lab-omad mexanikasi TAQIQ") shu tarzda hurmat
// qilinadi: bu sof-informatsion, hech qanday tanga/mukofot berilmaydi.
const LOYALTY_MILESTONE = 5;
export interface ShopLoyaltyProgress {
  purchaseCount: number;
  milestone: number;
  remaining: number;
}

export async function getShopLoyaltyProgress(memberId: number, shopId: number): Promise<ShopLoyaltyProgress> {
  const productIds = (await prisma.product.findMany({ where: { shopId }, select: { id: true } })).map((p) => p.id);
  const purchaseCount = productIds.length
    ? await prisma.shopPurchase.count({ where: { memberId, productId: { in: productIds }, status: "delivered" } })
    : 0;
  const milestone = (Math.floor(purchaseCount / LOYALTY_MILESTONE) + 1) * LOYALTY_MILESTONE;
  return { purchaseCount, milestone, remaining: milestone - purchaseCount };
}

// §10.1: shop-darajasidagi anomaliya-detektor — "g'ayrioddiy rad-etish naqshi" / sekin-javob shop'lar
// (kamida 3 buyurtma — kam-namunali yangi do'konni bekorga "muammo" deb belgilamaslik uchun).
export interface ShopAttentionItem {
  shopId: number;
  name: string;
  reason: string;
  rejectionRate: number;
  slaBreachRate: number;
}

const ATTENTION_MIN_ORDERS = 3;
const ATTENTION_RATE_THRESHOLD = 0.3;

export async function listShopsNeedingAttention(): Promise<ShopAttentionItem[]> {
  const shops = await prisma.marketShop.findMany({ where: { active: true }, select: { id: true, name: true } });
  const items: ShopAttentionItem[] = [];
  for (const s of shops) {
    const h = await getShopHealthScore(s.id);
    if (!h || h.totalOrders < ATTENTION_MIN_ORDERS) continue;
    const reasons: string[] = [];
    if (h.rejectionRate > ATTENTION_RATE_THRESHOLD) reasons.push(`rad-etish ${Math.round(h.rejectionRate * 100)}%`);
    if (h.slaBreachRate > ATTENTION_RATE_THRESHOLD) reasons.push(`sekin-javob ${Math.round(h.slaBreachRate * 100)}%`);
    if (reasons.length) items.push({ shopId: s.id, name: s.name, reason: reasons.join(" · "), rejectionRate: h.rejectionRate, slaBreachRate: h.slaBreachRate });
  }
  return items.sort((a, b) => b.rejectionRate + b.slaBreachRate - (a.rejectionRate + a.slaBreachRate));
}

/** 🏪 D2: sotuvchi o'z do'kon-profilini tahrirlaydi (admin-panel `ShopProfilePanel`).
 *  `scopeShopId` berilsa (shopseller token) — faqat SHU shopId'ga ruxsat, choke-point server.ts'da. */
export async function updateShopProfile(shopId: number, input: ShopProfileEditInput): Promise<{ ok: boolean }> {
  const data: { story?: string | null; announcement?: string | null; announcementAt?: Date; neighborhood?: string | null } = {};
  if (input.story !== undefined) data.story = input.story.trim().slice(0, SHOP_STORY_MAX) || null;
  if (input.announcement !== undefined) {
    data.announcement = input.announcement.trim().slice(0, SHOP_ANNOUNCEMENT_MAX) || null;
    data.announcementAt = new Date();
  }
  if (input.neighborhood !== undefined) data.neighborhood = input.neighborhood.trim().slice(0, SHOP_NEIGHBORHOOD_MAX) || null;
  await prisma.marketShop.update({ where: { id: shopId }, data });
  return { ok: true };
}

// §10.1: "Ommaviy e'lon-shablon ko'p-do'konga" — owner-only, BARCHA faol do'konga bir yo'la
// (masalan «Ertaga bayram tufayli yetkazish kechikadi»). Bo'sh matn = e'lonni tozalash (hammasida).
export async function bulkSetAnnouncement(text: string): Promise<{ count: number }> {
  const announcement = text.trim().slice(0, SHOP_ANNOUNCEMENT_MAX) || null;
  const r = await prisma.marketShop.updateMany({ where: { active: true }, data: { announcement, announcementAt: new Date() } });
  return { count: r.count };
}

/** "09:00-21:00" → hozir ochiqmi (restoran client-side hisobining server-versiyasi, Asia/Tashkent). */
function isOpenNow(workHours: string | null): boolean {
  if (!workHours) return true;
  const m = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/.exec(workHours.trim());
  if (!m) return true;
  const now = new Date(Date.now() + 5 * 3600_000); // UTC+5 Tashkent
  const cur = now.getUTCHours() * 60 + now.getUTCMinutes();
  const from = Number(m[1]) * 60 + Number(m[2]);
  const to = Number(m[3]) * 60 + Number(m[4]);
  return to > from ? cur >= from && cur < to : cur >= from || cur < to; // yarim-tun oshgan smenalar
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
  // V3.1: xarid-cashback — FAQAT shu flip (count===1) muvaffaqiyatli bo'lgach; grant xatosi
  // yetkazishni bekor QILMAYDI (delivery allaqachon haqiqiy) — shuning uchun alohida try/catch.
  await grantShopCashback(o.memberId, o.priceTanga, "sp", orderId).catch((e) => console.error("[shopcb] sp deliver failed:", e));
  return { ok: true, memberId: o.memberId, amount: o.priceTanga, productName: o.productName, payKind: o.payKind as "tanga" | "cash" };
}

/** V3.1 (BirJoy): xarid-cashback — Kaspi-Bonus modeli, YANGI emissiya-manba. Safar ≤350 clamp'ga
 *  HECH QACHON tegmaydi — grantCoins bookingId param bermay chaqiriladi, shu bilan clamp-indeks
 *  (`bookingId` bo'yicha) bu grantlarni umuman ko'rmaydi. Grant FAQAT chaqiruvchi (deliver-flip)
 *  o'zi allaqachon bir martalik ekanini tasdiqlagach ishga tushadi — reject-ferma+soxta-buyurtma
 *  strukturaviy nol to'laydi (delivered holatiga hech qachon yetmaydi). Durability: T0.5 naqshi
 *  (pendingCreate→grantCoins→pendingResolve) — crash bo'lsa `retryPendingMoney` tick'i "shopcb"
 *  markerini qayta uradi (yangi poller YO'Q). */
export async function grantShopCashback(memberId: number, total: number, orderKind: "sp" | "mo", orderId: number): Promise<void> {
  if (total <= 0) return;
  if (!(await featureOn("shopcashback"))) return;
  const { getBonusEcon } = await import("./bonusConfig");
  const econ = await getBonusEcon();
  const pct = econ.shopCashbackPct ?? 0;
  if (pct <= 0) return;
  const perOrder = econ.shopCashbackPerOrder ?? 0;
  const base = Math.min(Math.floor((total * pct) / 100), perOrder);
  if (base <= 0) return;
  const dailyMax = econ.shopCashbackDaily ?? 0;
  // R4-gap fix: daily-remaining read + grant serialized per member (withMemberLock — same
  // pattern buyProduct/withdraw use) — two deliveries for the same member completing near-
  // simultaneously can no longer both read the same daily-sum and jointly exceed dailyMax.
  await withMemberLock(memberId, async () => {
    let amount = base;
    if (dailyMax > 0) {
      const since = new Date();
      since.setHours(0, 0, 0, 0);
      const sum = await prisma.coinTxn.aggregate({ where: { memberId, kind: "shop_cashback", createdAt: { gte: since } }, _sum: { amount: true } });
      amount = Math.max(0, Math.min(amount, dailyMax - (sum._sum.amount ?? 0)));
    }
    if (amount <= 0) return;
    const id = `${orderKind}${orderId}`;
    const { pendingCreate, pendingResolve } = await import("./appStateUtil");
    const { grantCoins } = await import("./coinService");
    await pendingCreate("shopcb", id, { memberId, amount });
    const r = await grantCoins(memberId, amount, "shop_cashback", "🛍 Xarid uchun tanga qaytdi", `shopcb:${id}`);
    if (r.ok || r.skipped === "duplicate") await pendingResolve("shopcb", id);
  });
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
  shopId: number | null; // V1.7: ega ko'p-do'kon aralash ko'rinishida qaysi do'konga tegishli
  shopName: string | null;
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

// ── 📹 S1: do'kon-hikoya (Instagram/Snapchat-uslub, 24 soatda yo'qoladi) ──────────────────────────
// Muddati tugashi — YANGI POLLER YO'Q: har o'qishda `expiresAt > now()` filtr, hech qanday
// rejalashtirilgan job kerak emas (schema.prisma'dagi izohga mos).

/** Botdan kelgan video/foto file_id'ni to'g'ridan-to'g'ri saqlaydi — bu ALLAQACHON Telegram
 *  file_id (bot ustiga to'g'ridan-to'g'ri yuborilgan xabar), tgUploadPhoto-uslub relay KERAK EMAS
 *  (u faqat mini-app'dan base64 kelganda, hali file_id yo'q holatda ishlatiladi). */
export async function createShopStory(shopId: number, input: { videoFileId?: string; photoFileId?: string; caption?: string }): Promise<{ ok: boolean; id?: number }> {
  if (!input.videoFileId && !input.photoFileId) return { ok: false };
  const caption = input.caption?.trim().slice(0, 200) || null;
  const row = await prisma.shopStory.create({
    data: {
      shopId,
      videoFileId: input.videoFileId ?? null,
      photoFileId: input.photoFileId ?? null,
      caption,
      expiresAt: new Date(Date.now() + 24 * 3600_000),
    },
  });
  return { ok: true, id: row.id };
}

/** Bozor-bosh hikoya-tray: har DO'KON uchun bitta yozuv (bir nechta faol hikoyasi bo'lsa ham),
 *  `seen` = shu do'konning BARCHA faol hikoyalari shu a'zo tomonidan ko'rilganmi (halqa-holat). */
export async function listStoryTray(memberId?: number, preview = false): Promise<ShopStoryTrayItem[]> {
  if (!preview && !(await featureOn("shopstory"))) return [];
  const stories = await prisma.shopStory.findMany({ where: { expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } });
  if (!stories.length) return [];
  const shopIds = [...new Set(stories.map((s) => s.shopId))];
  const shops = await prisma.marketShop.findMany({ where: { id: { in: shopIds }, active: true }, select: { id: true, name: true, photoFileId: true, photoUrl: true, sortOrder: true } });
  const shopMap = new Map(shops.map((s) => [s.id, s]));
  const viewedIds = memberId
    ? new Set((await prisma.shopStoryView.findMany({ where: { memberId, storyId: { in: stories.map((s) => s.id) } }, select: { storyId: true } })).map((v) => v.storyId))
    : new Set<number>();
  const byShop = new Map<number, typeof stories>();
  for (const s of stories) {
    if (!shopMap.has(s.shopId)) continue; // do'kon nofaol bo'lib qolgan bo'lsa — hikoyasi ham ko'rinmaydi
    const arr = byShop.get(s.shopId) ?? [];
    arr.push(s);
    byShop.set(s.shopId, arr);
  }
  return [...byShop.entries()]
    .map(([shopId, list]) => {
      const shop = shopMap.get(shopId)!;
      return { shopId, shopName: shop.name, hasPhoto: !!(shop.photoFileId || shop.photoUrl), seen: list.every((s) => viewedIds.has(s.id)), sortOrder: shop.sortOrder };
    })
    .sort((a, b) => (a.seen === b.seen ? a.sortOrder - b.sortOrder : a.seen ? 1 : -1)) // ko'rilmagan — oldinda (IG/Snap naqshi)
    .map(({ shopId, shopName, hasPhoto, seen }) => ({ shopId, shopName, hasPhoto, seen }));
}

/** Bitta do'konning to'liq-ekran ko'ruvchisi uchun barcha faol hikoyalari (eskidan-yangiga). */
export async function getShopStories(shopId: number, memberId?: number, preview = false): Promise<ShopStoryPost[]> {
  if (!preview && !(await featureOn("shopstory"))) return [];
  const shop = await prisma.marketShop.findUnique({ where: { id: shopId }, select: { name: true, active: true } });
  if (!shop || !shop.active) return [];
  const stories = await prisma.shopStory.findMany({ where: { shopId, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "asc" } });
  const viewedIds = memberId
    ? new Set((await prisma.shopStoryView.findMany({ where: { memberId, storyId: { in: stories.map((s) => s.id) } }, select: { storyId: true } })).map((v) => v.storyId))
    : new Set<number>();
  return stories.map((s) => ({
    id: s.id, shopId: s.shopId, shopName: shop.name, videoFileId: s.videoFileId, photoFileId: s.photoFileId,
    caption: s.caption, createdAt: s.createdAt.toISOString(), seen: viewedIds.has(s.id),
  }));
}

/** Ko'rilgan-belgisi — race-xavfsiz (mavjud toggleProductFavorite naqshi: create+increment, P2002
 *  bo'lsa allaqachon ko'rilgan, hisoblagichni ikki marta oshirmaydi).
 *  R4-gap fix: avvalgi bare `catch {}` P2002'dan BOSHQA har qanday xatoni ham (masalan yo'q
 *  storyId'ga `update` P2025'i) jimgina yutib, orphan `ShopStoryView` qatorini qoldirardi —
 *  `toggleProductFavorite`ning O'ZI qilgani kabi (yuqorida), faqat P2002 yutiladi, qolgani throw. */
export async function markStoryViewed(storyId: number, memberId: number): Promise<{ ok: boolean }> {
  try {
    await prisma.shopStoryView.create({ data: { storyId, memberId } });
    await prisma.shopStory.update({ where: { id: storyId }, data: { viewCount: { increment: 1 } } });
  } catch (e) {
    if ((e as { code?: string } | null)?.code !== "P2002") throw e;
  }
  return { ok: true };
}

// ── 🔑 V1.6: sotuvchi o'zi-xizmat kirish — do'kon-scoped operator-token mint-yoki-qayta-ishlatish.
// V1.2 (seller-scope) + V1.3 (/sotuvchi wizard) orasidagi ko'prik: QABUL'dan keyin do'kon endi
// scope'langan, lekin uni HECH KIM avtomatik bermasdi (owner qo'lda CLI-skript yugurtirishi kerak
// edi, u ham faqat shop#1'ga). Endi shopId-token markazlashgan yagona joydan chiqadi. Idempotent:
// bir do'konga har chaqiriqda YANGI token yaratmaydi — mavjudini topib qayta beradi.
export async function getOrCreateSellerToken(shopId: number): Promise<string> {
  const value = `shopseller:${shopId}`;
  const existing = await prisma.appState.findFirst({ where: { key: { startsWith: "oprtoken:" }, value }, select: { key: true } });
  if (existing) return existing.key.slice("oprtoken:".length);
  // race-guard: `value` (=shopseller:<shopId>) has no unique constraint of its own (AppState.value
  // is free-form across many unrelated features), so a naive find-then-create could let two
  // concurrent callers both mint a DIFFERENT valid token for the same brand-new shop. A
  // deterministic pointer row `sellertoken:<shopId>` (key IS unique) resolves the race: whichever
  // caller's `create` wins keeps its token; the loser's create throws P2002, and it re-reads the
  // winner's token instead of using its own (which it then simply discards, unpersisted).
  const token = Array.from({ length: 24 }, () => "abcdefghjkmnpqrstuvwxyz23456789"[Math.floor(Math.random() * 31)]).join("");
  try {
    await prisma.appState.create({ data: { key: `sellertoken:${shopId}`, value: token } });
  } catch (e) {
    if ((e as { code?: string } | null)?.code !== "P2002") throw e;
    const winner = await prisma.appState.findUnique({ where: { key: `sellertoken:${shopId}` }, select: { value: true } });
    if (winner) return winner.value; // boshqa chaqiruv g'olib chiqdi — o'zining tokenini eslatmasdan qaytadi
  }
  await prisma.appState.create({ data: { key: `oprtoken:${token}`, value } }).catch(() => undefined); // g'olib bo'lsak — haqiqiy auth-qator
  return token;
}

// ── 🎠 D1: CategoryDef CRUD (admin) — karusel-ikonka boshqaruvi ─────────────────────────────────
export interface AdminCategoryRow { id: number; slug: string; name: string; emoji: string; hasIcon: boolean; sortOrder: number; active: boolean; productCount: number }

export async function adminListCategories(): Promise<AdminCategoryRow[]> {
  const [cats, counts] = await Promise.all([
    prisma.categoryDef.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.product.groupBy({ by: ["category"], _count: { _all: true } }),
  ]);
  const countOf = new Map(counts.map((c) => [c.category, c._count._all]));
  return cats.map((c) => ({ id: c.id, slug: c.slug, name: c.name, emoji: c.emoji, hasIcon: !!(c.iconFileId || c.iconUrl), sortOrder: c.sortOrder, active: c.active, productCount: countOf.get(c.name) ?? 0 }));
}

const slugify = (name: string): string => name.toLowerCase().replace(/['ʼ']/g, "").replace(/[^a-z0-9а-яё]+/gi, "-").replace(/^-|-$/g, "") || "cat";

export async function adminCreateCategory(name: string, emoji?: string): Promise<{ ok: boolean; id?: number; error?: string }> {
  const n = (name ?? "").trim().slice(0, 40);
  if (n.length < 2) return { ok: false, error: "bad_name" };
  let slug = slugify(n);
  if (await prisma.categoryDef.findUnique({ where: { slug } })) slug = `${slug}-${Date.now() % 1000}`; // to'qnashuv — nodir
  const max = await prisma.categoryDef.aggregate({ _max: { sortOrder: true } });
  const row = await prisma.categoryDef.create({ data: { slug, name: n, emoji: (emoji ?? "🛍").slice(0, 8), sortOrder: (max._max.sortOrder ?? 0) + 1 } });
  return { ok: true, id: row.id };
}

export async function adminEditCategory(id: number, patch: { name?: string; emoji?: string; sortOrder?: number; active?: boolean }): Promise<{ ok: boolean }> {
  const data: Record<string, unknown> = {};
  if (typeof patch.name === "string" && patch.name.trim().length >= 2) data.name = patch.name.trim().slice(0, 40);
  if (typeof patch.emoji === "string" && patch.emoji.trim()) data.emoji = patch.emoji.trim().slice(0, 8);
  if (typeof patch.sortOrder === "number" && Number.isFinite(patch.sortOrder)) data.sortOrder = Math.floor(patch.sortOrder);
  if (typeof patch.active === "boolean") data.active = patch.active;
  if (!Object.keys(data).length) return { ok: false };
  await prisma.categoryDef.update({ where: { id }, data }).catch(() => undefined);
  return { ok: true };
}

export async function adminDeleteCategory(id: number): Promise<{ ok: boolean }> {
  await prisma.categoryDef.delete({ where: { id } }).catch(() => undefined); // mahsulot-category string tegilmaydi (loose)
  return { ok: true };
}

/** karusel-ikonka yuklash — tgUploadPhoto pipeline (sharh-foto validatsiyasi bilan: hajm-chek). */
export async function uploadCategoryIcon(id: number, buf: Buffer, mime = "image/jpeg"): Promise<{ ok: boolean; error?: string }> {
  if (buf.length < 100 || buf.length > 2_500_000) return { ok: false, error: "bad_size" };
  const cat = await prisma.categoryDef.findUnique({ where: { id } });
  if (!cat) return { ok: false, error: "not_found" };
  const up = await tgUploadPhoto(buf, mime, `🎠 kategoriya-ikonka: ${cat.name}`);
  if (up.fileId) {
    await prisma.categoryDef.update({ where: { id }, data: { iconFileId: up.thumbFileId ?? up.fileId, iconUrl: null } });
  } else {
    await prisma.categoryDef.update({ where: { id }, data: { iconUrl: `data:${mime};base64,${buf.toString("base64")}`, iconFileId: null } });
  }
  return { ok: true };
}

/** V1.5 (BirJoy): do'kon-buyurtma SLA-sweep — restoran naqshi AYNAN (yangi poller YO'Q, mavjud
 *  booking-tick chaqiradi). Har do'konning O'Z slaMinutes'i (default 15); shopId'siz mahsulot 15.
 *  Idempotent: slaAlertedAt BIR marta. Mijozga ko'rinmaydi — faqat egaga ichki nazorat. */
export async function checkShopSlaAndAlert(
  alertAdmins: (html: string) => Promise<void>,
  // AUDIT (bazar hammaga yoqilgan kun): eslatma faqat ADMINLARGA borardi — javob bermagan
  // sotuvchining o'ziga emas, ya'ni nishonni chetlab o'tardi. Ixtiyoriy callback (index.ts
  // `notifyMarketOrder` naqshi) — berilmasa xatti-harakat eski holicha qoladi.
  remindSeller?: (n: { orderId: number; shopId: number; shopName: string; ageMin: number }) => Promise<void>,
): Promise<void> {
  const maxCutoff = new Date(Date.now() - 15 * 60_000);
  const stale = await prisma.shopPurchase.findMany({
    where: { status: "pending", createdAt: { lt: maxCutoff }, slaAlertedAt: null },
    select: { id: true, productId: true, productName: true, createdAt: true },
    take: 50,
  });
  // 🧺 V2: MarketOrder pending'lari ham shu supurgida (yangi poller YO'Q)
  const staleMkt = await prisma.marketOrder.findMany({
    where: { status: "pending", createdAt: { lt: maxCutoff }, slaAlertedAt: null },
    select: { id: true, shopId: true, shopName: true, createdAt: true },
    take: 50,
  });
  if (!stale.length && !staleMkt.length) return;
  const ageOf = (d: Date): number => Math.floor((Date.now() - d.getTime()) / 60_000);
  const lines = [
    ...stale.map((s) => `#${s.id} · ${s.productName.slice(0, 40)} · ${ageOf(s.createdAt)} daq javobsiz`),
    ...staleMkt.map((s) => `🧺 #${s.id} · ${s.shopName.slice(0, 40)} · ${ageOf(s.createdAt)} daq javobsiz`),
  ];
  await alertAdmins(`🛍 <b>Do'kon: ${lines.length} ta buyurtma 15+ daq javobsiz</b>\n${lines.join("\n")}`).catch(() => undefined);
  // Sotuvchiga eslatma — marker qo'yishdan OLDIN (marker qo'yilgach bu satrlar boshqa
  // tanlanmaydi, ya'ni har buyurtma uchun aynan bitta eslatma ketadi — spam yo'q).
  if (remindSeller) {
    for (const s of staleMkt) {
      await remindSeller({ orderId: s.id, shopId: s.shopId, shopName: s.shopName, ageMin: ageOf(s.createdAt) }).catch(() => undefined);
    }
  }
  if (stale.length) await prisma.shopPurchase.updateMany({ where: { id: { in: stale.map((s) => s.id) } }, data: { slaAlertedAt: new Date() } });
  if (staleMkt.length) await prisma.marketOrder.updateMany({ where: { id: { in: staleMkt.map((s) => s.id) } }, data: { slaAlertedAt: new Date() } });
}

/** V1.2: mahsulot shu do'kongami — seller-scope choke-point uchun (server.ts sellerOwnsProduct). */
export async function productBelongsToShop(productId: number, shopId: number): Promise<boolean> {
  if (!Number.isFinite(productId)) return false;
  const p = await prisma.product.findUnique({ where: { id: productId }, select: { shopId: true } });
  return p?.shopId === shopId;
}

export async function adminListProducts(scopeShopId?: number): Promise<{ products: AdminProductRow[]; enabled: boolean; pendingOrders: number }> {
  // V1.2: seller-token faqat O'Z do'koni; pendingOrders ham shu scope'da (badge to'g'ri bo'lsin)
  const scopeProductIds = scopeShopId === undefined
    ? undefined
    : (await prisma.product.findMany({ where: { shopId: scopeShopId }, select: { id: true } })).map((p) => p.id);
  const [rows, sold, enabled, pendingOrders, photoCounts] = await Promise.all([
    prisma.product.findMany({ where: scopeShopId === undefined ? undefined : { shopId: scopeShopId }, orderBy: [{ sortOrder: "asc" }, { id: "desc" }] }),
    prisma.shopPurchase.groupBy({ by: ["productId"], where: { status: "delivered" }, _count: { _all: true } }),
    featureOn("shop"),
    prisma.shopPurchase.count({ where: { status: "pending", ...(scopeProductIds ? { productId: { in: scopeProductIds } } : {}) } }),
    prisma.productPhoto.groupBy({ by: ["productId"], _count: { _all: true } }),
  ]);
  const soldOf = new Map(sold.map((s) => [s.productId, s._count._all]));
  const photosOf = new Map(photoCounts.map((c) => [c.productId, c._count._all]));
  // V1.7: aralash (barcha-do'kon) ko'rinishida har qatorga do'kon-nomini bog'lash uchun
  const shopIds = Array.from(new Set(rows.map((p) => p.shopId).filter((id): id is number => id != null)));
  const shopNames = shopIds.length
    ? new Map((await prisma.marketShop.findMany({ where: { id: { in: shopIds } }, select: { id: true, name: true } })).map((s) => [s.id, s.name]))
    : new Map<number, string>();
  return {
    enabled,
    pendingOrders,
    products: rows.map((p) => ({
      id: p.id,
      shopId: p.shopId,
      shopName: p.shopId != null ? shopNames.get(p.shopId) ?? null : null,
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

export async function adminCreateProduct(body: ProductPatch, forceShopId?: number): Promise<{ ok: boolean; id?: number; error?: string }> {
  const p = cleanPatch(body);
  if (!p.name || !p.priceTanga) return { ok: false, error: "name_price_required" };
  // V1.2: seller-token yaratgani MAJBURAN o'z do'koniga; owner uchun default = do'kon #1 (BirJoy o'z do'koni)
  const row = await prisma.product.create({ data: { ...p, name: p.name, priceTanga: p.priceTanga, active: false, shopId: forceShopId ?? 1 } }); // created OFF — owner flips on
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

export async function adminListPurchases(status?: string, scopeShopId?: number): Promise<(ShopPurchaseView & { buyerName: string; contact: string; shopId: number | null; shopName: string | null })[]> {
  // V1.2: seller faqat O'Z do'koni mahsulotlarining buyurtmalarini ko'radi (PII shu subset'gagina)
  const scopeIds = scopeShopId === undefined
    ? undefined
    : (await prisma.product.findMany({ where: { shopId: scopeShopId }, select: { id: true } })).map((p) => p.id);
  const rows = await prisma.shopPurchase.findMany({
    where: { ...(status ? { status } : {}), ...(scopeIds ? { productId: { in: scopeIds } } : {}) },
    orderBy: { id: "desc" },
    take: 100,
    include: { member: { select: { fullName: true, displayName: true } } },
  });
  // V1.7: aralash (barcha-do'kon) ko'rinishida har buyurtmaga do'kon-nomini bog'lash uchun
  const prodShopOf = new Map(
    (await prisma.product.findMany({ where: { id: { in: Array.from(new Set(rows.map((o) => o.productId))) } }, select: { id: true, shopId: true } })).map((p) => [p.id, p.shopId]),
  );
  const shopIds = Array.from(new Set(Array.from(prodShopOf.values()).filter((id): id is number => id != null)));
  const shopNames = shopIds.length
    ? new Map((await prisma.marketShop.findMany({ where: { id: { in: shopIds } }, select: { id: true, name: true } })).map((s) => [s.id, s.name]))
    : new Map<number, string>();
  return rows.map((o) => ({
    id: o.id,
    shopId: prodShopOf.get(o.productId) ?? null,
    shopName: (() => { const sid = prodShopOf.get(o.productId); return sid != null ? shopNames.get(sid) ?? null : null; })(),
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

/** 🏪 D2: do'kon-hero muqova-rasmi (product-photo pipeline bilan bir xil tgUploadPhoto). */
export async function uploadShopPhoto(shopId: number, buf: Buffer, mime = "image/jpeg"): Promise<{ ok: boolean }> {
  const { fileId } = await tgUploadPhoto(buf, mime, `🏪 Shop cover · #${shopId}`);
  const url = fileId ? null : `data:${mime};base64,${buf.toString("base64")}`;
  await prisma.marketShop.update({ where: { id: shopId }, data: { photoFileId: fileId, photoUrl: url } });
  return { ok: true };
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
  const [likes, dislikes, buyers, members, ratingAgg] = await Promise.all([
    prisma.productReview.count({ where: { productId, thumb: "up" } }),
    prisma.productReview.count({ where: { productId, thumb: "down" } }),
    prisma.shopPurchase.findMany({ where: { productId, status: "delivered", memberId: { in: rows.map((r) => r.memberId) } }, select: { memberId: true }, distinct: ["memberId"] }),
    prisma.member.findMany({ where: { id: { in: rows.map((r) => r.memberId) } }, select: { id: true, fullName: true, displayName: true } }),
    prisma.productReview.aggregate({ where: { productId, rating: { not: null } }, _avg: { rating: true } }), // ⭐ V3.2
  ]);
  const verified = new Set(buyers.map((b) => b.memberId));
  const nameOf = new Map(members.map((m) => [m.id, (m.displayName || m.fullName || "Mijoz").trim().split(/\s+/)[0]!]));
  const reviews: ShopReviewView[] = rows.map((r) => ({
    id: r.id,
    name: nameOf.get(r.memberId) ?? "Mijoz",
    thumb: r.thumb as ShopReviewThumb,
    rating: r.rating,
    text: r.text,
    photoCount: parseReviewPhotos(r.photosJson).length,
    createdAt: r.createdAt.toISOString(),
    mine: r.memberId === memberId,
    verified: verified.has(r.memberId),
  }));
  const mine = rows.find((r) => r.memberId === memberId);
  return {
    likes, dislikes, reviews,
    myThumb: (mine?.thumb as ShopReviewThumb) ?? null,
    myRating: mine?.rating ?? null,
    avgRating: Math.round((ratingAgg._avg.rating ?? 0) * 10) / 10,
  };
}

/** 🏪 D2: do'kon-darajali sharhlar — `Product.shopId` orqali agregatsiya, jonli hisoblanadi
 *  (MarketShop.avgRating/reviewCount ustunlariga yozilmaydi — ular hech qachon yozilmagan, o'lik). */
export async function listShopReviews(shopId: number, take = 30): Promise<ShopReviewsResponse> {
  const productIds = (await prisma.product.findMany({ where: { shopId }, select: { id: true } })).map((p) => p.id);
  if (!productIds.length) return { likes: 0, dislikes: 0, reviews: [], totalCount: 0, myThumb: null, myRating: null, avgRating: 0 };
  const rows = await prisma.productReview.findMany({
    where: { productId: { in: productIds } },
    orderBy: { id: "desc" },
    take,
  });
  // AUDIT: likes/dislikes/jami — `rows` CHEKLANGAN (take=30) bo'lgani uchun undan hisoblanmaydi.
  // 40 ta sharhli do'konda 👍 faqat oxirgi 30 tasidan sanalardi, ya'ni raqam jimgina noto'g'ri
  // edi. Endi uchalasi ham butun to'plamdan `count` bilan olinadi (ro'yxat baribir 30 ta qoladi).
  const [members, ratingAgg, totalCount, upCount, downCount] = await Promise.all([
    prisma.member.findMany({ where: { id: { in: rows.map((r) => r.memberId) } }, select: { id: true, fullName: true, displayName: true } }),
    prisma.productReview.aggregate({ where: { productId: { in: productIds }, rating: { not: null } }, _avg: { rating: true } }),
    prisma.productReview.count({ where: { productId: { in: productIds } } }),
    prisma.productReview.count({ where: { productId: { in: productIds }, thumb: "up" } }),
    prisma.productReview.count({ where: { productId: { in: productIds }, thumb: "down" } }),
  ]);
  const nameOf = new Map(members.map((m) => [m.id, (m.displayName || m.fullName || "Mijoz").trim().split(/\s+/)[0]!]));
  const reviews: ShopReviewView[] = rows.map((r) => ({
    id: r.id,
    name: nameOf.get(r.memberId) ?? "Mijoz",
    thumb: r.thumb as ShopReviewThumb,
    rating: r.rating,
    text: r.text,
    photoCount: parseReviewPhotos(r.photosJson).length,
    createdAt: r.createdAt.toISOString(),
    mine: false,
    verified: true, // shop-darajali ro'yxatda "verified" mahsulot-darajali xarid-tekshiruvi shart emas
  }));
  return {
    likes: upCount,
    dislikes: downCount,
    reviews,
    totalCount,
    myThumb: null,
    myRating: null,
    avgRating: Math.round((ratingAgg._avg.rating ?? 0) * 10) / 10,
  };
}

/** ⭐ V3.2 (BirJoy): sharh-uchun-tanga (Ozon mexanikasi). Kalit `revtanga:<memberId>:<productId>`
 *  BIR UMR — CoinTxn'da tekshiriladi (ProductReview qatori o'chirilib qayta yaratilsa ham kalit
 *  qoladi, shuning uchun edit/delete-resubmit hech qachon ikkinchi marta to'lamaydi). Durability
 *  markeri kerak EMAS: bu foydalanuvchi-harakati bilan qayta tetiklanadi (sharh qayta yuborilsa
 *  funksiya yana chaqiriladi, kalit hali yo'q bo'lsa qayta uriniladi) — cashback'dagi bir martalik
 *  server-hodisadan farqli. Faqat DELIVERED xaridor (ShopPurchase YOKI MarketOrder ichida). */
async function grantReviewTanga(memberId: number, productId: number, textLen: number, hasPhoto: boolean): Promise<number> {
  if (!(await featureOn("revtanga"))) return 0;
  if (textLen < 30) return 0;
  const key = `revtanga:${memberId}:${productId}`;
  if (await prisma.coinTxn.findUnique({ where: { idempotencyKey: key }, select: { id: true } })) return 0; // BIR UMR
  const boughtSp = await prisma.shopPurchase.findFirst({ where: { memberId, productId, status: "delivered" }, select: { id: true } });
  let bought = !!boughtSp;
  if (!bought) {
    const mos = await prisma.marketOrder.findMany({ where: { memberId, status: "delivered" }, select: { itemsJson: true } });
    bought = mos.some((o) => (o.itemsJson as unknown as { productId: number }[]).some((l) => l.productId === productId));
  }
  if (!bought) return 0;
  const { getBonusEcon } = await import("./bonusConfig");
  const econ = await getBonusEcon();
  const dailyMax = econ.reviewTangaDailyMax ?? 0;
  if (dailyMax > 0) {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    const count = await prisma.coinTxn.count({ where: { memberId, kind: "shop_review", createdAt: { gte: since } } });
    if (count >= dailyMax) return 0;
  }
  const amount = (econ.reviewTangaBase ?? 0) + (hasPhoto ? (econ.reviewTangaPhotoBonus ?? 0) : 0);
  if (amount <= 0) return 0;
  const { grantCoins } = await import("./coinService");
  const r = await grantCoins(memberId, amount, "shop_review", "🗣 Sharh uchun tanga", key);
  if (!r.ok) return 0;
  await prisma.productReview.updateMany({ where: { productId, memberId }, data: { tangaPaid: true } }).catch(() => undefined);
  return amount;
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
  rating?: number,
): Promise<ShopReviewSubmitResponse> {
  if (!preview && !(await featureOn("shop"))) return { ok: false, reason: "off" };
  if (thumb !== "up" && thumb !== "down") return { ok: false, reason: "bad_thumb" };
  if (rating !== undefined && (!Number.isInteger(rating) || rating < 1 || rating > 5)) return { ok: false, reason: "bad_rating" };
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

  const saved = await prisma.productReview.upsert({
    where: { productId_memberId: { productId, memberId } },
    create: { productId, memberId, thumb, rating: rating ?? null, text: cleanText, photosJson: photosJson ?? null },
    update: { thumb, rating: rating ?? null, text: cleanText, ...(photosJson !== undefined ? { photosJson } : {}) },
  });
  // 🗣 bonus-shart uchun HAQIQIY saqlangan holat (bu safar photosBase64 yuborilmagan bo'lsa ham,
  // avvalgi submitdan rasm qolgan bo'lishi mumkin — shuning uchun bazadan qayta o'qiladi)
  const hasPhoto = parseReviewPhotos(saved.photosJson).length > 0;
  const tangaGranted = await grantReviewTanga(memberId, productId, cleanText?.length ?? 0, hasPhoto).catch((e) => { console.error("[revtanga] grant failed:", e); return 0; });
  return { ok: true, ...(tangaGranted > 0 ? { tangaGranted } : {}) };
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
  shopId: number | null;
  shopName: string | null;
  productName: string;
  memberName: string;
  thumb: string;
  text: string | null;
  photoCount: number;
  createdAt: string;
}

export async function adminListReviews(scopeShopId?: number): Promise<AdminReviewRow[]> {
  // V1.2: seller faqat O'Z mahsulotlarining sharhlarini ko'radi
  const scopeIds = scopeShopId === undefined
    ? undefined
    : (await prisma.product.findMany({ where: { shopId: scopeShopId }, select: { id: true } })).map((p) => p.id);
  const rows = await prisma.productReview.findMany({ where: scopeIds ? { productId: { in: scopeIds } } : undefined, orderBy: { id: "desc" }, take: 50 });
  const [products, members] = await Promise.all([
    prisma.product.findMany({ where: { id: { in: rows.map((r) => r.productId) } }, select: { id: true, name: true, shopId: true } }),
    prisma.member.findMany({ where: { id: { in: rows.map((r) => r.memberId) } }, select: { id: true, fullName: true, displayName: true } }),
  ]);
  const pName = new Map(products.map((p) => [p.id, p.name]));
  const pShop = new Map(products.map((p) => [p.id, p.shopId]));
  const mName = new Map(members.map((m) => [m.id, m.displayName || m.fullName]));
  // V1.7: aralash (barcha-do'kon) ko'rinishida har sharhga do'kon-nomini bog'lash uchun
  const shopIds = Array.from(new Set(Array.from(pShop.values()).filter((id): id is number => id != null)));
  const shopNames = shopIds.length
    ? new Map((await prisma.marketShop.findMany({ where: { id: { in: shopIds } }, select: { id: true, name: true } })).map((s) => [s.id, s.name]))
    : new Map<number, string>();
  return rows.map((r) => {
    const sid = pShop.get(r.productId) ?? null;
    return {
      id: r.id,
      productId: r.productId,
      shopId: sid,
      shopName: sid != null ? shopNames.get(sid) ?? null : null,
      productName: pName.get(r.productId) ?? `#${r.productId}`,
      memberName: mName.get(r.memberId) ?? `m${r.memberId}`,
      thumb: r.thumb,
      text: r.text,
      photoCount: parseReviewPhotos(r.photosJson).length,
      createdAt: r.createdAt.toISOString(),
    };
  });
}

export async function adminDeleteReview(id: number): Promise<{ ok: boolean }> {
  await prisma.productReview.delete({ where: { id } }).catch(() => undefined);
  return { ok: true };
}

// §10.1: "MarketDemand'dan bitta-bosishda taklif" poydevori — mijozlar qidirgan-lekin-topilmagan
// so'rovlarni egaga ko'rsatish (qaysi sotuvchini chaqirish kerakligini ayt). Owner-wide (aniq
// do'konga bog'liq emas — unmet-demand butun bozor bo'ylab).
export interface MarketDemandRow {
  query: string;
  count: number;
  lastAt: string;
}

// Har bosishda (keystroke) so'rov yuboriladi — bitta odam "koptok" deb yozganda "k","ko","kop",...
// har biri ALOHIDA MarketDemand qatori bo'lib qoladi. Xom log shu tarixiy fragmentlarga to'lib
// ketadi (haqiqiy so'z emas). Shuning uchun avval BIR ODAMNING tez ketma-ket (≤45s) so'rovlarini
// bitta "burst"ga yig'amiz — burstning OXIRGI (eng to'liq) so'zi haqiqiy qidiruv-niyat hisoblanadi.
const DEMAND_BURST_GAP_MS = 45_000;

export async function adminListMarketDemand(): Promise<MarketDemandRow[]> {
  const rows = await prisma.marketDemand.findMany({
    orderBy: [{ memberId: "asc" }, { createdAt: "asc" }],
    take: 2000,
    select: { query: true, createdAt: true, memberId: true },
  });
  const finals: { query: string; at: Date }[] = [];
  let burstMember: number | null = null;
  let burstLast: Date | null = null;
  let burstQuery = "";
  const flush = () => { if (burstQuery.trim()) finals.push({ query: burstQuery.trim(), at: burstLast! }); };
  for (const r of rows) {
    const sameBurst = r.memberId === burstMember && burstLast && r.createdAt.getTime() - burstLast.getTime() <= DEMAND_BURST_GAP_MS;
    if (!sameBurst) flush();
    burstMember = r.memberId;
    burstLast = r.createdAt;
    burstQuery = r.query; // burst ichida har doim ENG OXIRGI (to'liqroq) matn yutadi
  }
  flush();

  const byKey = new Map<string, { query: string; count: number; lastAt: Date }>();
  for (const f of finals) {
    const key = f.query.trim().toLowerCase();
    if (!key) continue;
    const existing = byKey.get(key);
    if (existing) { existing.count++; if (f.at > existing.lastAt) existing.lastAt = f.at; }
    else byKey.set(key, { query: f.query.trim(), count: 1, lastAt: f.at });
  }
  return Array.from(byKey.values())
    .sort((a, b) => b.count - a.count || b.lastAt.getTime() - a.lastAt.getTime())
    .slice(0, 50)
    .map((v) => ({ query: v.query, count: v.count, lastAt: v.lastAt.toISOString() }));
}
