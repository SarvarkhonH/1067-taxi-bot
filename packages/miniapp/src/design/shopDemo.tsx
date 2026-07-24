// 🛍 shopv2 vizual-QA laboratoriyasi — FAQAT `#shopdemo` hash bilan (App.tsx), production bundle
// haqiqiy foydalanuvchiga hech qachon ko'rinmaydi. Mini App Telegram initData-autentifikatsiyasini
// talab qilgani uchun (repo'da dev-bypass yo'q) real ShopView'ni real API'siz ko'rish imkonsiz edi —
// bu fayl window.fetch'ni faqat /api/shop*, /api/mahalla, /api/referral yo'llari uchun intercept
// qilib, ShopView'ni HAQIQIY komponent-daraxti bilan (mock-lar EMAS, aslida ishlatiladigan
// ProductCard/StoryViewer/CartCheckout) ko'rish imkonini beradi — shopv2 ON/OFF solishtirish uchun.
import { useMemo, useState } from "react";
import type {
  MahallaView,
  MarketHomeResponse,
  MeResponse,
  ShopProfileView,
  ShopProductView,
  ShopReviewsResponse,
  ShopStoryTrayItem,
  ReferralResponse,
} from "@t1067/shared";
import { ShopView } from "../shop";
import { Icon } from "../icons";

const MOCK_PRODUCTS: ShopProductView[] = [
  { id: 1, name: "Yangi uzum (1 kg)", description: "Bog'dan to'g'ridan-to'g'ri, shirin.", category: "Meva-sabzavot", priceTanga: 18000, oldPriceTanga: null, stock: 24, hasPhoto: false, photoCount: 0, isNew: true, featured: true, topSeller: true, likes: 12, dislikes: 1, shopId: 1, shopName: "Guliston bozorchasi", deliveryText: "30 daqiqada", favCount: 4, isFav: false },
  { id: 2, name: "Go'sht — mol (1 kg)", description: "Mahalliy fermer.", category: "Go'sht-baliq", priceTanga: 95000, oldPriceTanga: 105000, stock: 6, hasPhoto: false, photoCount: 0, isNew: false, featured: true, topSeller: false, likes: 5, dislikes: 0, shopId: 1, shopName: "Guliston bozorchasi", deliveryText: "30 daqiqada", favCount: 1, isFav: true },
  { id: 3, name: "Non (2 dona)", description: null, category: "Non-nonvoyxona", priceTanga: 6000, oldPriceTanga: null, stock: 40, hasPhoto: false, photoCount: 0, isNew: false, featured: false, topSeller: false, likes: 21, dislikes: 0, shopId: 1, shopName: "Guliston bozorchasi", deliveryText: "30 daqiqada", favCount: 0, isFav: false },
  { id: 4, name: "Kir yuvish kukuni 3kg", description: "Import, konsentrat.", category: "Maishiy kimyo", priceTanga: 42000, oldPriceTanga: 49000, stock: 3, hasPhoto: false, photoCount: 0, isNew: false, featured: false, topSeller: true, likes: 8, dislikes: 2, shopId: 2, shopName: "Kamol Market", deliveryText: "1 kun ichida", favCount: 2, isFav: false },
  { id: 5, name: "Bolalar futbolkasi", description: "100% paxta, 4-6 yosh.", category: "Kiyim", priceTanga: 38000, oldPriceTanga: null, stock: 11, hasPhoto: false, photoCount: 0, isNew: true, featured: false, topSeller: false, likes: 3, dislikes: 0, shopId: 2, shopName: "Kamol Market", deliveryText: "1 kun ichida", favCount: 1, isFav: false },
  { id: 6, name: "Choy to'plami (qora, 100g)", description: null, category: "Ichimlik", priceTanga: 15000, oldPriceTanga: null, stock: 0, hasPhoto: false, photoCount: 0, isNew: false, featured: false, topSeller: false, likes: 0, dislikes: 0, shopId: 2, shopName: "Kamol Market", deliveryText: "1 kun ichida", favCount: 0, isFav: false },
  // "O'xshash mahsulotlar" (product-detail'dagi kategoriya-bo'yicha row) sinash uchun — uzum
  // bilan bir xil kategoriya (Meva-sabzavot).
  { id: 7, name: "Qulupnay (0.5 kg)", description: "Mavsumiy.", category: "Meva-sabzavot", priceTanga: 22000, oldPriceTanga: null, stock: 15, hasPhoto: false, photoCount: 0, isNew: false, featured: false, topSeller: false, likes: 2, dislikes: 0, shopId: 1, shopName: "Guliston bozorchasi", deliveryText: "30 daqiqada", favCount: 0, isFav: false },
];

const MOCK_MARKET: MarketHomeResponse = {
  shops: [
    { id: 1, name: "Guliston bozorchasi", open: true, deliveryText: "30 daqiqada", rating: 4.8, hasPhoto: false, deliveryFeeSom: 5000, minOrderTanga: 20000, shopKind: "mahalla", mahallaId: 1, story: "Har kuni ertalab yangi meva-sabzavot — o'z bog'imizdan.", weeklyOrders: 34 },
    { id: 2, name: "Kamol Market", open: true, deliveryText: "1 kun ichida", rating: 4.5, hasPhoto: false, deliveryFeeSom: 8000, minOrderTanga: 30000, shopKind: "bozor", mahallaId: null },
    { id: 3, name: "Farrux do'koni", open: false, deliveryText: "Ertaga", rating: 4.2, hasPhoto: false, deliveryFeeSom: 6000, minOrderTanga: 15000, shopKind: "bozor", mahallaId: null },
  ],
  cats: [
    { id: 1, slug: "meva-sabzavot", name: "Meva-sabzavot", emoji: "🥕", hasIcon: false },
    { id: 2, slug: "gosht-baliq", name: "Go'sht-baliq", emoji: "🥩", hasIcon: false },
    { id: 3, slug: "maishiy-kimyo", name: "Maishiy kimyo", emoji: "🧴", hasIcon: false },
  ],
  products: MOCK_PRODUCTS,
};

const MOCK_PROFILE: ShopProfileView = {
  id: 1,
  name: "Guliston bozorchasi",
  open: true,
  neighborhood: "Guliston MFY",
  deliveryText: "30 daqiqada",
  story: "2019-yildan beri mahallamizga xizmat qilamiz. Har kuni ertalab yangi meva-sabzavot — o'z bog'imizdan, hech qanday oraliq sotuvchisiz.",
  announcement: "Bugun uzum va anor yangi keldi!",
  hasPhoto: false,
  avgRating: 4.8,
  reviewCount: 23,
  ordersToday: 7,
};

const MOCK_REVIEWS: ShopReviewsResponse = {
  likes: 19,
  dislikes: 1,
  reviews: [
    { id: 1, name: "Malika", thumb: "up", rating: 5, text: "Juda tez yetkazishdi, mahsulot yangi edi.", photoCount: 0, verified: true, mine: false, createdAt: new Date(Date.now() - 86400000).toISOString() },
    { id: 2, name: "Bobur", thumb: "up", rating: 4, text: "Yaxshi, faqat bir oz kechikdi.", photoCount: 0, verified: true, mine: false, createdAt: new Date(Date.now() - 3 * 86400000).toISOString() },
  ],
  myThumb: null,
  myRating: 0,
  avgRating: 4.6,
};

const MOCK_STORY_TRAY: ShopStoryTrayItem[] = [
  { shopId: 1, shopName: "Guliston bozorchasi", hasPhoto: false, seen: false },
  { shopId: 2, shopName: "Kamol Market", hasPhoto: false, seen: true },
];

const MOCK_MAHALLAS: MahallaView[] = [
  { id: 1, name: "Guliston MFY", lat: 39.02, lng: 65.6 },
  { id: 2, name: "Do'stlik MFY", lat: 39.03, lng: 65.61 },
];

const MOCK_REFERRAL: ReferralResponse = { code: "DEMO123", link: "https://t.me/koson1067bot?start=DEMO123", invited: 2, earned: 4000, rewardReferrer: 2000, rewardReferee: 1000 };

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

let installed = false;
function installShopMockFetch(): void {
  if (installed) return;
  installed = true;
  const real = window.fetch.bind(window);
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const path = url.replace(location.origin, "");
    if (path.startsWith("/api/shop/photo") || path.startsWith("/api/shop/shop-photo") || path.startsWith("/api/shop/story-media") || path.startsWith("/api/shop/review-photo") || path.startsWith("/api/shop/cat-icon")) {
      return new Response(null, { status: 404 });
    }
    if (path === "/api/shop/products") return json({ products: MOCK_PRODUCTS });
    if (path.startsWith("/api/shop/market")) return json(MOCK_MARKET);
    if (path === "/api/mahalla") return json({ mahallas: MOCK_MAHALLAS });
    if (path === "/api/shop/market-orders") return json({ orders: [] });
    if (path.startsWith("/api/shop/profile/")) return json({ profile: MOCK_PROFILE, reviews: MOCK_REVIEWS });
    if (path.startsWith("/api/shop/loyalty/")) return json({ purchaseCount: 6, milestone: 10, remaining: 4 });
    if (path === "/api/shop/stories") return json({ shops: MOCK_STORY_TRAY });
    if (path.startsWith("/api/shop/stories/")) return json({
      stories: [
        { id: 1, shopId: 1, shopName: "Guliston bozorchasi", videoFileId: null, photoFileId: null, caption: "Bugun yangi uzum keldi — kelib ko'ring!", createdAt: new Date().toISOString(), seen: false },
        { id: 2, shopId: 1, shopName: "Guliston bozorchasi", videoFileId: null, photoFileId: null, caption: null, createdAt: new Date().toISOString(), seen: false },
      ],
    });
    if (path.startsWith("/api/shop/chat/")) return json({ shopName: "Guliston bozorchasi", messages: [] });
    if (path === "/api/shop/orders") return json({ orders: [] });
    if (path.startsWith("/api/shop/reviews/")) return json(MOCK_REVIEWS);
    if (path === "/api/referral") return json(MOCK_REFERRAL);
    return real(input, init);
  }) as typeof window.fetch;
}

function mockMe(shopv2: boolean): MeResponse {
  return {
    linked: true,
    type: "client",
    metricLabel: "Bonus",
    member: { id: 999999, fullName: "Demo Foydalanuvchi" },
    stats: { points: 0, trips: 12, rating: 4.9 },
    level: { index: 2, name: "Kumush", emoji: "🥈", color: "#c0c0c0" },
    nextLevel: null,
    xp: 0, xpIntoLevel: 0, xpForNext: null, progress: 0,
    rank: null, totalMembers: 0,
    badges: [],
    streak: { current: 3, longest: 10, checkedToday: true },
    wheelAvailable: false,
    jackpot: 0,
    coins: 45000,
    leagueTier: "Kumush",
    flags: { shop: true, bazar: true, bazarcart: true, shopstory: true, shopchat: true, revtanga: true, shopv2 },
  } as unknown as MeResponse;
}

/** #shopdemo — App.tsx shu sahifani real App shell (aurora/topbar/tabbar) ichida ko'rsatadi,
 *  toolbar orqali shopv2 ON/OFF'ni jonli almashtirish mumkin (eski vs yangi solishtirish). */
export function ShopDemoPage() {
  installShopMockFetch();
  const [shopv2, setShopv2] = useState(true);
  const me = useMemo(() => mockMe(shopv2), [shopv2]);
  const shellCls = shopv2 ? "app bjm" : "app shop-light bazar-light";
  return (
    <div className={shellCls}>
      <div className="aurora" />
      <header className="topbar">
        <div className="brand">
          <span className="brand-name"><b>Do'kon</b></span>
          <span className="member-chip">👥 12 400 a'zo</span>
        </div>
        <div className="topbar-right">
          <div className="coin-pill"><span className="coin-dot">🪙</span>{me.coins.toLocaleString("ru-RU")}</div>
        </div>
      </header>
      <div style={{ position: "sticky", top: 0, zIndex: 90, display: "flex", justifyContent: "center", padding: "8px 0", background: "rgba(0,0,0,.5)", backdropFilter: "blur(8px)" }}>
        <button
          onClick={() => setShopv2((v) => !v)}
          style={{ padding: "8px 16px", borderRadius: 999, border: "1px solid rgba(255,255,255,.25)", background: shopv2 ? "linear-gradient(120deg,#0d9668,#34d399)" : "#fff", color: shopv2 ? "#06231a" : "#12261d", fontWeight: 800, fontSize: 13 }}
        >
          {shopv2 ? "🌘 shopv2 ON — bosib eskisini ko'ring" : "☀️ shopv2 OFF — bosib yangisini ko'ring"}
        </button>
      </div>
      <main className="content">
        <div className="page">
          <ShopView me={me} onBanner={(m) => console.log("[banner]", m)} reload={() => undefined} onBook={() => undefined} openProductId={null} />
        </div>
      </main>
      <nav className="tabbar">
        {[{ icon: "home", label: "Uy" }, { icon: "market", label: "Do'kon" }, { icon: "food", label: "Restoran" }, { icon: "user", label: "Profil" }].map((t, i) => (
          <button key={t.label} className={i === 1 ? "tab active" : "tab"}>
            <Icon name={t.icon} filled={i === 1} size={23} />
            <span className="tab-label">{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
