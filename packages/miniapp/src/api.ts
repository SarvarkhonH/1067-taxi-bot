import type {
  BoxOpenResponse,
  BoxStatusResponse,
  CheckInResponse,
  ActiveBookingView,
  BookingCancelResponse,
  BookingCreateBody,
  BookingCreateResponse,
  BookingInfoResponse,
  BookingNowResponse,
  SavedAddressView,
  HomeResponse,
  FareQuote,
  GeoPt,
  FareConfigResponse,
  LeaderboardResponse,
  MeResponse,
  MissionClaimResponse,
  MissionsResponse,
  ReferralResponse,
  DriverPayLookup,
  RecipientLookup,
  TransferResponse,
  WalletResponse,
  WeeklyBoardResponse,
  WheelSpinResponse,
  WithdrawResponse,
  CashoutResponse,
  TierBenefitsResponse,
  OyinBuyResult,
  OyinJamoamResponse,
  OyinJamoaResult,
  OyinJamoaView,
  OyinActivityResponse,
  OyinMyTicketsResponse,
  OyinStateResponse,
  OyinStorySubmitResult,
  OyinTeaserResponse,
  OyinThanksResult,
  OyinVitrinaResponse,
} from "@t1067/shared";
import { tg } from "./telegram";

// Telegram provides initData via the SDK AND in the URL hash (tgWebAppData). The signed initData
// stays valid for the whole session — we CACHE it in sessionStorage on first read so subsequent
// reads survive any hash-wiping navigation (e.g. ?go=… deeplinks, reload(), overlay close that does
// location.hash=""). Without this cache, reloading after a hash change → empty initData → 401 →
// "Telegram orqali oching" false-positive. Cache is sessionStorage-scoped so it dies with the tab.
const ID_KEY = "tg:initData";
export function getInitData(): string {
  // 1) Live SDK (most reliable — Telegram sets it directly on window.Telegram.WebApp)
  const sdk = tg?.initData ?? "";
  if (sdk) {
    try { sessionStorage.setItem(ID_KEY, sdk); } catch { /* private mode */ }
    return sdk;
  }
  // 2) URL hash — populated by Telegram on initial WebView open
  try {
    const fromHash = new URLSearchParams(location.hash.slice(1)).get("tgWebAppData");
    if (fromHash) {
      try { sessionStorage.setItem(ID_KEY, fromHash); } catch { /* ignore */ }
      return fromHash;
    }
  } catch { /* ignore */ }
  // 3) sessionStorage cache — survives reload + any code that wipes the hash
  try { return sessionStorage.getItem(ID_KEY) ?? ""; } catch { return ""; }
}

// Some Telegram clients (Web Z, Desktop) populate initData a few hundred ms AFTER the WebView
// opens — if our first /api/me fires immediately it sees the empty value, sends the debug header,
// gets a 401 in prod, and the user lands on "Telegram orqali oching" needlessly. This helper polls
// until initData is set (up to ~2.5s in 100ms steps) and only gives up if Telegram itself never
// fills it — at which point the user truly isn't in a Telegram WebApp.
export async function waitForInitData(maxMs = 2500, stepMs = 100): Promise<string> {
  let id = getInitData();
  if (id) return id;
  if (!tg) return ""; // not inside Telegram at all → don't wait
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, stepMs));
    id = getInitData();
    if (id) return id;
  }
  return "";
}

// In Telegram we authenticate with signed initData. Outside Telegram (local dev)
// we fall back to a debug id that the server trusts only when no bot token is set.
function authHeaders(): Record<string, string> {
  const initData = getInitData();
  if (initData) return { "X-Telegram-Init-Data": initData };
  // dev only (outside Telegram): pick the demo user via ?tg=<id> or env, else 12345
  const fromUrl = new URLSearchParams(location.search).get("tg");
  const dbg = fromUrl || (import.meta.env.VITE_DEBUG_TG_ID as string) || "12345";
  return { "X-Debug-Telegram-Id": dbg };
}

// Same-origin in dev (Vite proxy); absolute backend URL in production (set VITE_API_URL at build).
const API_BASE = ((import.meta.env.VITE_API_URL as string) || "").replace(/\/$/, "");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 🚪 Ulanmagan javob. `guest:true` = Telegram identifikatori umuman yo'q; guest:false = Telegram
 *  bor, lekin raqam ulanmagan. Ikkalasida ham katalog ochiq — flags qaysi tab borligini aytadi. */
export interface GuestMe {
  linked: false;
  guest?: boolean;
  flags?: MeResponse["flags"];
}

async function request<T>(method: string, path: string, body?: unknown, retries = 2): Promise<T> {
  let lastErr: unknown;
  // ⏳ EVERY call waits for initData, not just /api/me. Telegram Desktop/Web Z fill initData a few
  // hundred ms after the WebView opens; any request that raced ahead of it went out unauthenticated,
  // came back 401, and — because 401 throws below without a retry — surfaced as «Yuklanmadi —
  // internetni tekshiring» on a perfectly good connection (owner report + `auth-header: NONE` 401s
  // for /api/shop/products in the access log, 2026-07-26). Resolves instantly once initData is set.
  if (tg && !getInitData()) await waitForInitData();
  let retried401 = false;
  // Retry network-level failures. The old policy — 5 attempts with 1.5/3/4.5/6s waits — was written
  // for Render's free tier, where a cold instance took ~30s to wake. The VPS never sleeps, so all
  // that shape does now is turn a one-second blip on a moving phone into a FIFTEEN-second frozen
  // screen: the user taps, nothing happens, they assume the app is broken and close it. Two attempts
  // with 400/1200ms cover a genuine transient and give up while the user is still watching.
  for (let attempt = 0; attempt < retries; attempt++) {
    // did THIS attempt carry a signed initData? a 401 despite one is a real auth failure, not a race.
    const sentInitData = !!getInitData();
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        method,
        headers: { ...authHeaders(), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      if (res.status === 401) {
        // Second net under the wait above: if initData landed LATER than the wait window (backgrounded
        // tab, slow client), one 401 would otherwise be permanent for that screen. Retry exactly once,
        // and only when initData actually appeared since — a genuinely unauthenticated user still
        // falls through to the real «Telegram orqali oching» / NotLinked screens.
        if (tg && !sentInitData && !retried401) {
          retried401 = true;
          if (await waitForInitData(1500, 50)) continue;
        }
        throw new Error("unauthorized");
      }
      if (!res.ok) throw new Error(`${path} -> ${res.status}`);
      return (await res.json()) as T;
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "unauthorized" || /-> \d{3}$/.test(msg)) throw e;
      // no sleep after the LAST attempt — the old loop waited 6s and then threw anyway
      if (attempt < retries - 1) await sleep(attempt === 0 ? 400 : 1200);
    }
  }
  throw lastErr;
}

const get = <T,>(path: string) => request<T>("GET", path);
const post = <T,>(path: string, body?: unknown) => request<T>("POST", path, body);
const del = <T,>(path: string) => request<T>("DELETE", path);

// 🛡 public read-only trip (family safety) — no PII, active-only
export interface PublicTrip {
  active: boolean;
  ended?: boolean; // trip finished (vs bad/expired token) → end screen still shows the viral CTA
  ctaLink?: string | null; // trackcta flag: sharer's referral deep-link ("birinchi safar bepul" banner)
  won?: boolean; // trackcta: rider won a mid-ride prize on THIS booking (badge only, amount never sent)
  status?: string;
  statusLabel?: string;
  addressName?: string;
  pickup?: { lat: number; lng: number } | null;
  fare?: number | null;
  etaMin?: number | null;
  driver?: { name: string; carModel: string; carNumber: string; rating?: number; lat?: number; lng?: number; bearing?: number } | null;
}

/** Absolute URL for <img src> endpoints (same-origin in dev, backend origin in prod). */
export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export const api = {
  me: () => get<MeResponse | GuestMe>("/api/me"),
  /** 📱 Raqamni ilova ichida ulash: `askContact()` javobini serverga uzatadi. Imzo va «bu raqam
   *  shu foydalanuvchiniki» tekshiruvi SERVERDA (/api/link/contact) — bu yerda hech narsa
   *  tasdiqlanmaydi. `status`: linked | not_found | taken | banned | bad_contact | not_own_contact. */
  linkContact: (response: string, hash?: string) =>
    post<{ ok: boolean; status: string; extras?: string[] }>("/api/link/contact", { response, hash }),
  // 🛍 tanga shop (feature "shop")
  // shopId berilsa — O'SHA do'konning to'liq vitrinasi (global 100-limit katta do'konni kesardi)
  shopProducts: (shopId?: number) => get<{ products: import("@t1067/shared").ShopProductView[] }>(`/api/shop/products${shopId ? `?shopId=${shopId}` : ""}`),
  shopProduct: (id: number) => get<{ product: import("@t1067/shared").ShopProductView }>(`/api/shop/product/${id}`),
  // 🏪 V1.4 BirJoy bozor-bosh. `cat` — kategoriya SERVERDA filtrlansin (2026-07-28 xatosi: mijoz
  // tarafida 100 ta yuklangan ro'yxatdan filtrlanardi va 26 chip bo'sh ekran berardi).
  shopMarket: (q?: string, cat?: string) => {
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    if (cat) qs.set("cat", cat);
    const t = qs.toString();
    return get<import("@t1067/shared").MarketHomeResponse>(`/api/shop/market${t ? `?${t}` : ""}`);
  },
  // 🏠 V1.5 Mahalla bozori
  mahallaList: () => get<{ mahallas: import("@t1067/shared").MahallaView[] }>("/api/mahalla"),
  mahallaNearest: (lat: number, lng: number) => post<{ mahalla: import("@t1067/shared").MahallaView | null }>("/api/mahalla/nearest", { lat, lng }),
  setMahalla: (mahallaId: number, mode: "home" | "travel") => post<{ ok: boolean }>("/api/member/mahalla", { mahallaId, mode }),
  // 🧺 V2 savat
  shopCheckout: (shopId: number, items: import("@t1067/shared").MarketCartItemInput[], address: string, pay: "tanga" | "cash", note?: string) =>
    post<import("@t1067/shared").MarketCheckoutResponse>("/api/shop/checkout", { shopId, items, address, pay, note }),
  shopMarketOrders: () => get<{ orders: import("@t1067/shared").MarketOrderView[] }>("/api/shop/market-orders"),
  shopMarketOrderCancel: (id: number) => post<{ ok: boolean; reason?: string }>(`/api/shop/market-orders/${id}/cancel`, {}),
  // 🧡 V2b sevimlilar
  shopFav: (productId: number, on: boolean) => post<{ ok: boolean; on: boolean; favCount: number }>("/api/shop/fav", { productId, on }),
  shopFavs: () => get<{ products: import("@t1067/shared").ShopProductView[] }>("/api/shop/favs"),
  // 🏪 D2 do'kon-profil
  shopProfile: (shopId: number) => get<{ profile: import("@t1067/shared").ShopProfileView; reviews: import("@t1067/shared").ShopReviewsResponse }>(`/api/shop/profile/${shopId}`),
  // §10.2: sodiqlik-progress-bar — ko'rsatkich-only
  shopLoyalty: (shopId: number) => get<{ purchaseCount: number; milestone: number; remaining: number }>(`/api/shop/loyalty/${shopId}`),
  // 📹 S1 do'kon-hikoya
  shopStories: () => get<{ shops: import("@t1067/shared").ShopStoryTrayItem[] }>("/api/shop/stories"),
  shopStoriesFor: (shopId: number) => get<{ stories: import("@t1067/shared").ShopStoryPost[] }>(`/api/shop/stories/${shopId}`),
  shopStoryView: (id: number) => post<{ ok: boolean }>(`/api/shop/stories/${id}/view`, {}),
  // 💬 C1 mijoz↔do'kon chat
  shopChatSend: (shopId: number, text: string) => post<import("@t1067/shared").ShopChatSendResponse>("/api/shop/chat/send", { shopId, text }),
  shopChatThread: (shopId: number) => get<import("@t1067/shared").ShopChatThreadResponse>(`/api/shop/chat/${shopId}`),

  shopBuy: (productId: number, address: string, pay: "tanga" | "cash" = "tanga") => post<import("@t1067/shared").ShopBuyResponse>("/api/shop/buy", { productId, address, pay }),
  shopOrders: () => get<{ orders: import("@t1067/shared").ShopPurchaseView[] }>("/api/shop/orders"),
  shopReviews: (productId: number) => get<import("@t1067/shared").ShopReviewsResponse>(`/api/shop/reviews/${productId}`),
  shopReviewSubmit: (p: { productId: number; thumb: "up" | "down"; rating?: number; text?: string; photos?: string[] }) =>
    post<import("@t1067/shared").ShopReviewSubmitResponse>("/api/shop/review", p),
  shopReviewDelete: (productId: number) => del<{ ok: boolean }>(`/api/shop/review/${productId}`),
  // 🍽 restoran (feature "restoran") — R1: katalog o'qish only
  restoranList: () => get<import("@t1067/shared").RestoranListResponse>("/api/restoran/list"),
  // 🏠 home feed aggregate (feature "newhome", Bosqich 2) — one call for the premium home
  homeFeed: () => get<import("@t1067/shared").HomeFeedResponse>("/api/home/feed"),
  restoranDetail: (id: number) => get<import("@t1067/shared").RestoranDetailResponse>(`/api/restoran/${id}`),
  restoranOrder: (b: import("@t1067/shared").FoodOrderCreateBody) => post<import("@t1067/shared").FoodOrderCreateResponse>("/api/restoran/order", b),
  restoranOrders: () => get<{ orders: import("@t1067/shared").FoodOrderView[] }>("/api/restoran/orders"),
  restoranCancel: (orderId: number) => post<{ ok: boolean; reason?: string }>(`/api/restoran/orders/${orderId}/cancel`),
  restoranReviews: (id: number) => get<import("@t1067/shared").RestaurantReviewsResponse>(`/api/restoran/${id}/reviews`),
  restoranReviewSubmit: (id: number, stars: number, text?: string) => post<import("@t1067/shared").RestaurantReviewSubmitResponse>(`/api/restoran/${id}/review`, { stars, text }),
  restoranReviewDelete: (id: number) => del<{ ok: boolean }>(`/api/restoran/${id}/review`),
  // 🎀 ravella (feature "ravella") — bezak konstruktori. Narx SERVERDA hisoblanadi: order body'da
  // hech qanday summa YO'Q, faqat id'lar + "chegirmani xohlayman" bayrog'i.
  ravellaCatalog: () => get<import("@t1067/shared").RavellaCatalogResponse>("/api/ravella/catalog"),
  ravellaItem: (id: number) => get<import("@t1067/shared").RavellaItemDetailResponse>(`/api/ravella/item/${id}`),
  ravellaOrder: (b: import("@t1067/shared").RavellaOrderCreateBody) => post<import("@t1067/shared").RavellaOrderCreateResponse>("/api/ravella/order", b),
  ravellaOrders: () => get<{ orders: import("@t1067/shared").RavellaOrderView[] }>("/api/ravella/orders"),
  ravellaCancel: (orderId: number) => post<{ ok: boolean; reason?: string }>(`/api/ravella/orders/${orderId}/cancel`),
  ravellaStories: () => get<{ stories: import("@t1067/shared").RavellaStoryView[] }>("/api/ravella/stories"),
  ravellaStoryViewed: (id: number) => post<{ ok: boolean }>(`/api/ravella/stories/${id}/viewed`),
  // 🔎 xizmatlar (feature "xizmatlar") — Koson services directory
  svcCategories: () => get<{ categories: import("@t1067/shared").ServiceCategoryView[]; popularTags: string[] }>("/api/services/categories"),
  svcList: (p: { cat?: number; q?: string; limit?: number; offset?: number; sort?: "new" } = {}) => {
    const sp = new URLSearchParams();
    if (p.cat) sp.set("cat", String(p.cat));
    if (p.q) sp.set("q", p.q);
    if (p.limit) sp.set("limit", String(p.limit));
    if (p.offset) sp.set("offset", String(p.offset));
    if (p.sort) sp.set("sort", p.sort);
    const qs = sp.toString();
    return get<{ listings: import("@t1067/shared").ServiceListingCard[]; total: number }>(`/api/services/list${qs ? `?${qs}` : ""}`);
  },
  svcRequest: (query: string, note: string) => request<{ ok: boolean; reason?: string }>("POST", "/api/services/request", { query, note }, 1),
  svcPhoneReport: (id: number) => request<{ ok: boolean }>("POST", "/api/services/phone-report", { id }, 1),
  svcFav: (id: number, on: boolean) => request<{ ok: boolean; on: boolean; favCount?: number }>("POST", "/api/services/fav", { id, on }, 1),
  svcFavs: () => get<{ listings: import("@t1067/shared").ServiceListingCard[] }>("/api/services/favs"),
  svcInspected: (limit = 8) => get<{ listings: import("@t1067/shared").ServiceListingCard[] }>(`/api/services/inspected?limit=${limit}`),
  svcItem: (id: number) => get<import("@t1067/shared").ServiceListingDetail>(`/api/services/item/${id}`),
  svcCall: (id: number) => post<{ ok: boolean }>("/api/services/call", { id }),
  svcSubmit: (b: import("@t1067/shared").ServiceSubmitBody) => request<import("@t1067/shared").ServiceSubmitResponse>("POST", "/api/services/submit", b, 1),
  svcMine: () => get<{ listings: { id: number; name: string; status: string; callCount: number; viewCount: number; avgRating: number; reviewCount: number }[] }>("/api/services/mine"),
  svcMinePhoto: (id: number, mime: string, base64: string) => request<{ ok: boolean; error?: string; photoCount?: number }>("POST", `/api/services/mine/${id}/photo`, { mime, base64 }, 3),
  svcReviews: (listingId: number, offset = 0) => get<{ reviews: import("@t1067/shared").ServiceReviewView[] }>(`/api/services/reviews?listingId=${listingId}${offset ? `&offset=${offset}` : ""}`),
  svcReview: (listingId: number, stars: number, text: string) => request<import("@t1067/shared").ServiceReviewResponse>("POST", "/api/services/review", { listingId, stars, text }, 1),
  svcReport: (reviewId: number) => request<{ ok: boolean; hidden?: boolean }>("POST", "/api/services/report", { reviewId }, 1),
  // 📋 e'lonlar (feature "elonlar") — mahalla e'lon taxtasi
  elonAds: (p: { category?: string; subtype?: string; priceBand?: "arzon" | "ortacha" | "qimmat"; q?: string; limit?: number; offset?: number } = {}) => {
    const sp = new URLSearchParams();
    if (p.category) sp.set("category", p.category);
    if (p.subtype) sp.set("subtype", p.subtype);
    if (p.priceBand) sp.set("price", p.priceBand);
    if (p.q) sp.set("q", p.q);
    if (p.limit) sp.set("limit", String(p.limit));
    if (p.offset) sp.set("offset", String(p.offset));
    const qs = sp.toString();
    return get<import("@t1067/shared").ClassifiedListResponse>(`/api/elonlar/ads${qs ? `?${qs}` : ""}`);
  },
  elonAd: (id: number) => get<import("@t1067/shared").ClassifiedDetail>(`/api/elonlar/ads/${id}`),
  elonSubmit: (b: import("@t1067/shared").ClassifiedSubmitBody) => request<import("@t1067/shared").ClassifiedSubmitResponse>("POST", "/api/elonlar/ads", b, 1),
  elonContact: (id: number, kind: "call" | "message") => post<{ ok: boolean }>(`/api/elonlar/ads/${id}/contact`, { kind }),
  elonMine: () => get<{ ads: import("@t1067/shared").MyClassifiedRow[] }>("/api/elonlar/mine"),
  elonSold: (id: number) => post<{ ok: boolean }>(`/api/elonlar/ads/${id}/sold`),
  elonReactivate: (id: number) => post<{ ok: boolean }>(`/api/elonlar/ads/${id}/reactivate`),
  elonDelete: (id: number) => del<{ ok: boolean }>(`/api/elonlar/ads/${id}`),
  elonPhoto: (id: number, base64: string, mime: string) => post<{ ok: boolean; error?: string; photoCount?: number }>(`/api/elonlar/ads/${id}/photo`, { base64, mime }),
  elonReport: (id: number) => post<import("@t1067/shared").ClassifiedReportResponse>(`/api/elonlar/ads/${id}/report`),
  elonReact: (id: number, b: import("@t1067/shared").ClassifiedReactBody) => post<import("@t1067/shared").ClassifiedReactResponse>(`/api/elonlar/ads/${id}/react`, b),
  elonTop: (id: number) => post<import("@t1067/shared").ClassifiedTopBuyResponse>(`/api/elonlar/ads/${id}/top`),
  createTrack: () => post<{ token: string }>("/api/track"),
  trackTrip: (token: string) => get<PublicTrip>(`/api/track/${encodeURIComponent(token)}`),
  // server defaults the leaderboard to the caller's own member type
  leaderboard: () => get<LeaderboardResponse>("/api/leaderboard"),
  // 🎮 Koson O'yini (feature "oyin") — KOSON_OYIN_PLAN.md v9.2. `oyinState` GET har chaqirilganda
  // serverda kunlik-kirish belgisi ham qo'yiladi ("miniapp ochish" = kirish, alohida POST shart emas).
  oyinThanks: (friendMemberId: number) => post<OyinThanksResult>("/api/oyin/thanks", { friendMemberId }),
  oyinStory: (url: string) => post<OyinStorySubmitResult>("/api/oyin/story", { url }),
  oyinGoal: (prizeKey: string) => post<{ ok: boolean }>("/api/oyin/goal", { prizeKey }),
  // 🔔 Qo'ng'iroq — ball qayerdan kelgani (shaxsiy voqealar ro'yxati).
  oyinBell: (page = 1) => get<OyinActivityResponse>(`/api/oyin/bell?page=${page}`),
  oyinHomeScreen: (added: boolean) => post<{ ok: boolean }>("/api/oyin/home", { added }),
  oyinTickets: () => get<OyinMyTicketsResponse>("/api/oyin/tickets"),
  oyinTeaser: () => get<OyinTeaserResponse>("/api/oyin/teaser"),
  oyinState: () => get<OyinStateResponse>("/api/oyin/state"),
  oyinVitrina: () => get<OyinVitrinaResponse>("/api/oyin/vitrina"),
  oyinJamoam: () => get<OyinJamoamResponse>("/api/oyin/jamoam"),
  // 🤝 Gap-jamoa (gashtak) — guruh tuzish/qo'shilish/chiqish. Ball ko'chirish YO'Q.
  oyinJamoa: () => get<OyinJamoaView>("/api/oyin/jamoa"),
  oyinJamoaAct: (action: "create" | "join" | "leave", v?: string) =>
    post<OyinJamoaResult & { view: OyinJamoaView }>("/api/oyin/jamoa",
      action === "create" ? { action, name: v } : action === "join" ? { action, code: v } : { action }),
  oyinBuyTicket: (prizeKey: string) => post<OyinBuyResult>("/api/oyin/ticket", { prizeKey }),
  oyinShare: () => post<{ ok: boolean }>("/api/oyin/share"),
  checkin: () => post<CheckInResponse>("/api/checkin"),
  spinWheel: () => request<WheelSpinResponse>("POST", "/api/wheel", undefined, 1),
  wheelFree: () =>
    request<{ ok: boolean; alreadyUsed?: boolean; prize: { label: string; emoji: string; amount: number }; jackpot: number }>(
      "POST",
      "/api/wheel/free",
      undefined,
      1,
    ),
  missions: () => get<MissionsResponse>("/api/missions"),
  claimMission: (code: string) => post<MissionClaimResponse>(`/api/missions/claim?code=${encodeURIComponent(code)}`),
  referral: () => get<ReferralResponse>("/api/referral"),
  box: () => get<BoxStatusResponse>("/api/box"),
  openBox: () => request<BoxOpenResponse>("POST", "/api/box/open", undefined, 1),
  weekly: () => get<WeeklyBoardResponse>("/api/weekly"),
  wallet: () => get<WalletResponse>("/api/wallet"),
  withdraw: (amount: number) => request<WithdrawResponse>("POST", "/api/wallet/withdraw", { amount }, 1),
  // 💵 real cash-out (tanga → plastik karta / naxt uyga) — money op, no auto-retry
  cashout: (p: { method: "card" | "home"; cardNumber?: string; cardHolder?: string; address?: string }) =>
    request<CashoutResponse>("POST", "/api/wallet/cashout", p, 1),
  topup: (amount: number) => request<WithdrawResponse>("POST", "/api/wallet/topup", { amount }, 1),
  recipient: (phone: string) => request<RecipientLookup>("POST", "/api/wallet/recipient", { phone }, 1),
  transfer: (phone: string, amount: number, note?: string) => request<TransferResponse>("POST", "/api/wallet/transfer", { phone, amount, note }, 1),
  driverByCar: (car: string) => request<DriverPayLookup>("POST", "/api/wallet/driver-by-car", { car }, 1),
  payDriver: (car: string, amount: number) => request<TransferResponse>("POST", "/api/wallet/pay-driver", { car, amount }, 1),
  driverEarnings: () =>
    get<{ todayIn: number; totalIn: number; txns: { amount: number; kind: string; reason: string; at: string }[] }>("/api/driver/earnings"),
  driverRides: () =>
    get<{ rides: { id: number; addressName: string; status: string; carModel: string; payment: number; cashback: number; at: string }[] }>("/api/driver/rides"),
  driverMissions: () =>
    get<{ missions: { id: string; emoji: string; title: string; target: number; reward: number; progress: number; claimable: boolean; claimed: boolean }[]; ridesToday: number }>("/api/driver/missions"),
  claimDriverMission: (missionId: string) => request<{ ok: boolean; reason?: string; reward?: number }>("POST", "/api/driver/missions/claim", { missionId }, 1),
  driverAccount: () =>
    get<{ linked: boolean; carNumber?: string; balance?: number; debt?: number; ridesToday?: number; fareToday?: number; canPayDebt?: boolean }>("/api/driver/account"),
  payDriverDebt: (amount: number, nonce: string) =>
    request<{ ok: boolean; message: string; paid?: number; kasBalance?: number | null }>("POST", "/api/driver/debt/pay", { amount, nonce }, 1),
  driverQr: () => get<{ ok: boolean; reason?: string; link?: string; png?: string; shareText?: string }>("/api/driver/qr"),
  fareConfig: () => get<FareConfigResponse>("/api/fare/config"),
  bookingNearby: () => get<{ pins: { lat: number; lng: number; bearing: number; busy: boolean; id: string }[]; freeDrivers: number }>("/api/booking/nearby"),
  bookingPredict: (address?: string) => get<{ rides: number; avg: number; p50: number; byAddress?: { name: string; avg: number; rides: number } | null }>(`/api/booking/predict${address ? `?address=${encodeURIComponent(address)}` : ""}`),
  bookingRate: (bookingId: number, stars: number, tags: string[]) => request<{ ok: boolean; reason?: string }>("POST", "/api/booking/rate", { bookingId, stars, tags }, 1),
  bookingScheduled: () => get<{ scheduled: { id: number; addressName: string; runAt: string; phone: string }[]; family: { id: number; phone: string; name: string }[] }>("/api/booking/scheduled"),
  bookingSchedule: (pickupId: number, pickupName: string, runAt: string, forPhone?: string) => request<{ ok: boolean; reason?: string }>("POST", "/api/booking/schedule", { pickupId, pickupName, runAt, forPhone }, 1),
  bookingScheduleCancel: (id: number) => request<{ ok: boolean }>("POST", "/api/booking/schedule/cancel", { id }, 1),
  familyAdd: (phone: string, name: string) => request<{ ok: boolean; reason?: string }>("POST", "/api/family/add", { phone, name }, 1),
  familyBook: (familyId: number, pickupId: number, pickupName: string) => request<{ ok: boolean; live: boolean; message?: string }>("POST", "/api/family/book", { familyId, pickupId, pickupName }, 1),
  plus: () => get<{ active: boolean; until: string | null; price: number; trialAvailable: boolean; canBuy: boolean }>("/api/plus"),
  plusSubscribe: () => request<{ ok: boolean; reason?: string; until?: string; free?: boolean }>("POST", "/api/plus/subscribe", {}, 1),
  gap: () => get<{ inGap: boolean; name?: string; code?: string; goal?: number; progress?: number; members?: { name: string; rides: number; isCreator: boolean }[] }>("/api/gap"),
  gapCreate: (name: string) => request<{ ok: boolean; reason?: string; code?: string }>("POST", "/api/gap/create", { name }, 1),
  gapJoin: (code: string) => request<{ ok: boolean; reason?: string; name?: string }>("POST", "/api/gap/join", { code }, 1),
  bookingInfo: () => get<BookingInfoResponse | { error: string }>("/api/booking/info"),
  home: () => get<HomeResponse>("/api/home"),
  account: () =>
    get<{ name: string; phone: string; joined: string | null; type: string; coins: number; cashback: number; streak: number; trips: number; notifyOff: boolean }>(
      "/api/account",
    ),
  accountNotify: (off: boolean) => request<{ ok: boolean; off: boolean }>("POST", "/api/account/notify", { off }, 1),
  accountName: (name: string) => request<{ ok: boolean; name?: string; reason?: string }>("POST", "/api/account/name", { name }, 1),
  bookingActive: () => get<ActiveBookingView | null>("/api/booking/active"),
  bookingSearch: (q: string) => request<SavedAddr[]>("POST", "/api/booking/search", { q }, 1),
  bookingNearestAddr: (lat: number, lng: number) => request<SavedAddr | null>("POST", "/api/booking/nearest", { lat, lng }, 1),
  bookingCreate: (body: BookingCreateBody) => request<BookingCreateResponse>("POST", "/api/booking/create", body, 1),
  bookingNow: (body: { lat?: number; lng?: number; addressId?: number } = {}) => request<BookingNowResponse>("POST", "/api/booking/now", body, 1),
  recentPickups: () => request<SavedAddressView[]>("GET", "/api/booking/recent"),
  bookingCancel: () => request<BookingCancelResponse>("POST", "/api/booking/cancel", undefined, 1),
  bookingEstimate: (pickup: GeoPt, dest: GeoPt, surcharge: number) => request<FareQuote>("POST", "/api/booking/estimate", { pickup, dest, surcharge }),
  bookingHistory: () =>
    get<RideHistoryResponse>("/api/booking/history"),
  // 🏅 Tier ladder benefits (labels from live knobs)
  tierBenefits: () => get<TierBenefitsResponse>("/api/tier-benefits"),
  // 🚐 Intercity (nationwide seat booking)
  icCities: (q?: string) => get<IntercityCity[]>(`/api/intercity/cities${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  icTrips: (originId: number, destId: number, date: string) =>
    get<IntercityTripRow[]>(`/api/intercity/trips?originId=${originId}&destId=${destId}&date=${encodeURIComponent(date)}`),
  icBook: (tripId: number, seatCount: number, paymentMethod: "CASH" | "PREPAY", tangaDiscount?: number) =>
    request<{ ok: boolean; bookingId?: number; duplicate?: boolean; error?: string }>("POST", "/api/intercity/book", { tripId, seatCount, paymentMethod, tangaDiscount }, 1),
  icMyActive: () => get<IntercityBookingRow[]>("/api/intercity/my-active"),
  icMyBookings: () => get<IntercityBookingRow[]>("/api/intercity/my-bookings"),
  icCancel: (bookingId: number) => request<{ ok: boolean; outcome?: string; error?: string }>("POST", "/api/intercity/cancel", { bookingId }, 1),
  // 🚐 driver side
  icDriverTrips: () => get<IntercityDriverTrip[]>("/api/intercity/driver/trips"),
  icPublish: (b: { originCityId: number; destCityId: number; scheduledAt: string; carCapacity: number; fareSom?: number; note?: string }) =>
    request<{ ok: boolean; tripId?: number; error?: string }>("POST", "/api/intercity/trip", b, 1),
  icDepart: (tripId: number) => request<{ ok: boolean; error?: string }>("POST", "/api/intercity/trip/depart", { tripId }, 1),
  icArrive: (tripId: number) => request<{ ok: boolean; error?: string }>("POST", "/api/intercity/trip/arrive", { tripId }, 1),
  icTripCancel: (tripId: number) => request<{ ok: boolean; error?: string }>("POST", "/api/intercity/trip/cancel", { tripId }, 1),
  icManifest: (tripId: number) => get<IntercityManifest | null>(`/api/intercity/driver/manifest?tripId=${tripId}`),
};

// 🚐 Intercity client shapes (mirror intercityService includes)
export interface IntercityCity { id: number; name: string; nameRu: string | null; regionCode: string }
export interface IntercityDriverLite { fullName: string | null; displayName: string | null; carNumber: string | null; rating?: number; phone: string | null }
export interface IntercityTripRow {
  id: number; scheduledAt: string; fareSom: number; bookedSeats: number; carCapacity: number; status: string; note: string | null;
  originCity: { name: string }; destCity: { name: string }; driver: IntercityDriverLite;
}
export interface IntercityBookingRow {
  id: number; status: string; seatsBooked: number; agreedFareSom: number; paymentMethod: string; createdAt: string;
  trip: { scheduledAt: string; status: string; originCity: { name: string }; destCity: { name: string }; driver: IntercityDriverLite };
}
export interface IntercityDriverTrip {
  id: number; scheduledAt: string; status: string; bookedSeats: number; carCapacity: number;
  originCity: { name: string }; destCity: { name: string }; _count: { bookings: number };
}
export interface IntercityManifestRow {
  id: number; seatsBooked: number; status: string; paymentMethod: string;
  rider: { fullName: string | null; displayName: string | null; phone: string | null };
  boardingCity: { name: string } | null; alightingCity: { name: string } | null;
}
export interface IntercityManifest {
  id: number; status: string; scheduledAt: string; originCity: { name: string }; destCity: { name: string };
  bookings: IntercityManifestRow[];
}

export interface RideHistoryResponse {
  rides: RideHistoryRow[];
  totals: { count: number; spent: number; cashback: number; savingsPct: number };
}

// One row of the rider's ride history (kas bookingReports). distance is in METRES (÷1000 = km);
// time follows kas's taximeter — guarded in the UI (seconds vs minutes) since kas units vary.
export interface RideHistoryRow {
  id: number;
  addressName: string;
  status: string;
  carModel: string;
  carNumber?: string;
  payment: number; // total paid (so'm)
  cashback: number; // cashback earned (so'm)
  distance?: number; // metres
  time?: number; // kas taximeter time
  at: string; // ISO date
}

interface SavedAddr {
  id: number;
  name: string;
  lat?: number;
  lng?: number;
  surcharge?: number;
}

