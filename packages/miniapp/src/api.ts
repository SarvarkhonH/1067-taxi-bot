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
  HomeResponse,
  FareQuote,
  GeoPt,
  FareConfigResponse,
  GarageResponse,
  GarajActionResult,
  GarajStateResponse,
  GarajPartView,
  GarajPartCatalogView,
  GarajPartBazaarView,
  PublicProfileView,
  CarCheckView,
  OrzuBoardView,
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
} from "@t1067/shared";
import { tg } from "./telegram";

// Telegram provides initData via the SDK AND in the URL hash (tgWebAppData). The signed initData
// stays valid for the whole session — we CACHE it in sessionStorage on first read so subsequent
// reads survive any hash-wiping navigation (e.g. ?go=… deeplinks, reload(), garaj close that does
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

async function request<T>(method: string, path: string, body?: unknown, retries = 5): Promise<T> {
  let lastErr: unknown;
  // Retry network-level failures (Render free-tier cold start can take ~30s to wake).
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        method,
        headers: { ...authHeaders(), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      if (res.status === 401) throw new Error("unauthorized");
      if (!res.ok) throw new Error(`${path} -> ${res.status}`);
      return (await res.json()) as T;
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "unauthorized" || /-> \d{3}$/.test(msg)) throw e;
      await sleep(1500 * (attempt + 1));
    }
  }
  throw lastErr;
}

const get = <T,>(path: string) => request<T>("GET", path);
const post = <T,>(path: string, body?: unknown) => request<T>("POST", path, body);

// 🛡 public read-only trip (family safety) — no PII, active-only
export interface PublicTrip {
  active: boolean;
  status?: string;
  statusLabel?: string;
  addressName?: string;
  pickup?: { lat: number; lng: number } | null;
  fare?: number | null;
  etaMin?: number | null;
  driver?: { name: string; carModel: string; carNumber: string; rating?: number; lat?: number; lng?: number; bearing?: number } | null;
}

export const api = {
  me: () => get<MeResponse | { linked: false }>("/api/me"),
  createTrack: () => post<{ token: string }>("/api/track"),
  trackTrip: (token: string) => get<PublicTrip>(`/api/track/${encodeURIComponent(token)}`),
  // server defaults the leaderboard to the caller's own member type
  leaderboard: () => get<LeaderboardResponse>("/api/leaderboard"),
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
  topup: (amount: number) => request<WithdrawResponse>("POST", "/api/wallet/topup", { amount }, 1),
  recipient: (phone: string) => request<RecipientLookup>("POST", "/api/wallet/recipient", { phone }, 1),
  transfer: (phone: string, amount: number, note?: string) => request<TransferResponse>("POST", "/api/wallet/transfer", { phone, amount, note }, 1),
  driverByCar: (car: string) => request<DriverPayLookup>("POST", "/api/wallet/driver-by-car", { car }, 1),
  payDriver: (car: string, amount: number) => request<TransferResponse>("POST", "/api/wallet/pay-driver", { car, amount }, 1),
  // market (buy = money op → no auto-retry)
  marketShops: () => get<MarketShop[]>("/api/market/shops"),
  marketBuy: (listingId: number) =>
    request<{ ok: boolean; reason?: string; voucherCode?: string; shopName?: string; title?: string; priceCoins?: number; coinsLeft: number }>(
      "POST",
      "/api/market/buy",
      { listingId },
      1,
    ),
  marketOrders: () =>
    get<{ id: number; shopName: string; title: string; emoji: string; priceCoins: number; voucherCode: string; status: string; at: string }[]>(
      "/api/market/orders",
    ),
  marketMyShop: () =>
    get<{
      shop: { id: number; name: string; emoji: string };
      pending: { id: number; title: string; emoji: string; priceCoins: number; voucherCode: string; at: string }[];
    } | null>("/api/market/myshop"),
  marketRedeem: (code: string) =>
    request<{ ok: boolean; reason?: string; title?: string; shopName?: string }>("POST", "/api/market/redeem", { code }, 1),
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
  garage: () => get<GarageResponse>("/api/garage"),
  garageBuy: (car: string) => request<{ ok: boolean; reason?: string; coins: number }>("POST", "/api/garage/buy", { car }, 1),
  garageEquip: (car: string) => request<{ ok: boolean }>("POST", "/api/garage/equip", { car }, 1),
  garageService: (car: string) => request<{ ok: boolean; reason?: string; coins: number }>("POST", "/api/garage/service", { car }, 1),
  garageUpgrade: (car: string) => request<{ ok: boolean; reason?: string; coins: number; level?: number }>("POST", "/api/garage/upgrade", { car }, 1),
  // 🏆 GARAJ v2 — the new dedicated restoration game
  garajState: () => get<GarajStateResponse>("/api/garaj/state"),
  garajAcquire: (carCode: string) => request<GarajActionResult>("POST", "/api/garaj/acquire", { carCode }, 1),
  garajDiagnose: (garajCarId: number, tier: "VISUAL" | "TOOL" | "EXPERT") => request<GarajActionResult>("POST", "/api/garaj/diagnose", { garajCarId, tier }, 1),
  garajRepairZone: (garajCarId: number, zone: string, partTier: string, style?: string, quality?: string) => request<GarajActionResult & { zone?: string; zoneVal?: number; condition?: string }>("POST", "/api/garaj/repair-zone", { garajCarId, zone, partTier, style, quality }, 1),
  garajCraft: (garajCarId: number, station: string) => request<GarajActionResult & { queued?: boolean; finishesAt?: string }>("POST", "/api/garaj/craft", { garajCarId, station }, 1),
  garajCraftSpeedup: () => request<GarajActionResult & { level?: number; condition?: string }>("POST", "/api/garaj/craft/speedup", {}, 1),
  garajFlip: (garajCarId: number, buyerArchetype: string) => request<GarajActionResult>("POST", "/api/garaj/flip", { garajCarId, buyerArchetype }, 1),
  garajOnboardFinish: () => request<GarajActionResult>("POST", "/api/garaj/onboard/finish", {}, 1),
  garajKozBuy: (itemCode: string, garajCarId: number) => request<GarajActionResult>("POST", "/api/garaj/kozshop/buy", { itemCode, garajCarId }, 1),
  garajBazaar: () => get<{ id: number; garajCarId: number; carCode: string; name: string; emoji: string; askPrice: number; mine: boolean; serial: number | null }[]>("/api/garaj/bazaar"),
  garajBazaarList: (garajCarId: number, askPrice: number) => request<GarajActionResult>("POST", "/api/garaj/bazaar/list", { garajCarId, askPrice }, 1),
  garajBazaarBuy: (listingId: number) => request<GarajActionResult & { defectRevealed?: { zone: string; severity: "minor" | "major" } | null }>("POST", "/api/garaj/bazaar/buy", { listingId }, 1),
  garajBazaarUnlist: (listingId: number) => request<GarajActionResult>("POST", "/api/garaj/bazaar/unlist", { listingId }, 1),
  garajHistory: () => get<{ kind: string; carCode: string; name: string; emoji: string; amount: number; profit: number | null; at: string }[]>("/api/garaj/history"),
  garajCollection: (memberId: number) => get<{ memberId: number; name: string; reputationScore: number; reputationName: string; garageTier: number; prestige: number; flips: number; bestProfit: number; carsOwned: number; mahalla: string | null; cars: { name: string; emoji: string; condition: string; level: number }[] } | null>(`/api/garaj/collection?memberId=${memberId}`),
  garajClaimTow: (dropId: number) => request<GarajActionResult>("POST", "/api/garaj/tow/claim", { dropId }, 1),
  garajDeclineTow: (dropId: number) => request<GarajActionResult>("POST", "/api/garaj/tow/decline", { dropId }, 1),
  garajExhibitionSubmit: (garajCarId: number) => request<GarajActionResult>("POST", "/api/garaj/exhibition/submit", { garajCarId }, 1),
  garajExhibitionVote: (entryId: number) => request<GarajActionResult>("POST", "/api/garaj/exhibition/vote", { entryId }, 1),
  garajMuseum: () => get<{ collection: { carCode: string; name: string; emoji: string; owned: boolean }[]; collectedCount: number; totalModels: number; totalFlips: number; bestProfit: number; hallOfFame: { name: string; prestigeCount: number; repAtEntry: number }[] }>("/api/garaj/museum"),
  // 🌍 MOTOR OLAMI (v3)
  garajMotorCollect: (garajCarId?: number) => request<GarajActionResult & { gross?: number; fuel?: number; wear?: number; net?: number; engineHp?: number; dead?: boolean; dry?: boolean }>("POST", "/api/garaj/motor/collect", { garajCarId }, 1),
  garajMotorRefuel: (garajCarId: number) => request<GarajActionResult & { cost?: number; fueledUntilAt?: string; fuelPct?: number }>("POST", "/api/garaj/motor/refuel", { garajCarId }, 1),
  // 🏛 P1-B — 1067 Ofis market-maker (always-on buyer)
  garajOfisStats: () => get<{ budget: number; spent: number; left: number; heldCount: number; scrappedToday: number }>("/api/garaj/ofis/stats"),
  garajOfisBid: (garajCarId: number) => get<{ bid: number; basePrice: number; carCode: string } | { error: string }>(`/api/garaj/ofis/bid/${garajCarId}`),
  garajOfisSell: (garajCarId: number) => request<GarajActionResult & { received?: number; bid?: number }>("POST", "/api/garaj/ofis/sell", { garajCarId }, 1),
  // 🪪 P1-D — slot system
  garajSlotStatus: () => get<{ slotCount: number; activeCount: number; nextSlotCost: number | null }>("/api/garaj/slot/status"),
  garajSlotPurchase: () => request<GarajActionResult & { newSlotCount?: number; cost?: number }>("POST", "/api/garaj/slot/purchase", {}, 1),
  garajSlotRefund: () => request<GarajActionResult & { newSlotCount?: number; refund?: number }>("POST", "/api/garaj/slot/refund", {}, 1),
  // 🔍 P1-E — CarCheck
  garajCarCheck: (garajCarId: number, tier: "ODDIY" | "EKSPERT" | "PREMIUM") => request<GarajActionResult & { check?: CarCheckView }>("POST", "/api/garaj/carcheck", { garajCarId, tier }, 1),
  garajRateSeller: (listingId: number, stars: number) => request<GarajActionResult>("POST", "/api/garaj/rate-seller", { listingId, stars }, 1),
  // ✨ P1-F — ORZU board
  garajOrzu: () => get<{ ok: boolean; reason?: string; board?: OrzuBoardView }>("/api/garaj/orzu"),
  // 🔗 P2-A — Merge (sacrifice → promote)
  garajMerge: (keepCarId: number, sacrificeCarId: number) => request<GarajActionResult & { mergeCount?: number; newMult?: number }>("POST", "/api/garaj/merge", { keepCarId, sacrificeCarId }, 1),
  // 🚀 P2-C — Speeder
  garajSpeederState: () => get<{ ok: boolean; reason?: string; price?: number; mult?: number; stockLeft?: number; stockMax?: number; days?: number; activeCarId?: number | null; activeUntilAt?: string | null }>("/api/garaj/speeder/state"),
  garajSpeederBuy: (garajCarId: number) => request<GarajActionResult & { speederUntilAt?: string; stockLeft?: number }>("POST", "/api/garaj/speeder/buy", { garajCarId }, 1),
  // 🚗 FAZA2 — model-upgrade ladder (no client retry → a network retry can't double-upgrade past one step)
  garajUpgradeModel: (garajCarId: number) => request<GarajActionResult & { newCode?: string; cost?: number }>("POST", "/api/garaj/upgrade-model", { garajCarId }, 0),
  // 🔧 P2-deep-5 — Limited-event parts (detallar): mint + install/uninstall
  garajParts: () => get<{ parts: GarajPartView[]; catalog: GarajPartCatalogView[] }>("/api/garaj/parts"),
  garajPartMint: (partCode: string) => request<GarajActionResult & { partId?: number; serial?: number; cap?: number }>("POST", "/api/garaj/parts/mint", { partCode }, 1),
  garajPartInstall: (partId: number, garajCarId: number) => request<GarajActionResult>("POST", "/api/garaj/parts/install", { partId, garajCarId }, 1),
  garajPartUninstall: (partId: number) => request<GarajActionResult>("POST", "/api/garaj/parts/uninstall", { partId }, 1),
  // 🛠 P2-deep-6 — Detal-bozori (parts P2P market)
  garajPartBazaar: () => get<GarajPartBazaarView[]>("/api/garaj/parts/bazaar"),
  garajPartList: (partId: number, askPrice: number) => request<GarajActionResult>("POST", "/api/garaj/parts/list", { partId, askPrice }, 1),
  garajPartBuy: (listingId: number) => request<GarajActionResult>("POST", "/api/garaj/parts/buy", { listingId }, 1),
  garajPartUnlist: (listingId: number) => request<GarajActionResult>("POST", "/api/garaj/parts/unlist", { listingId }, 1),
  garajProfile: (id: number | "me") => get<PublicProfileView | null>(`/api/garaj/profile/${id}`),
  garajAuctions: () => get<{ id: number; garajCarId: number; carCode: string; name: string; emoji: string; minBid: number; endsAt: string; mine: boolean }[]>("/api/garaj/auctions"),
  garajAuctionCreate: (garajCarId: number, minBid: number) => request<GarajActionResult>("POST", "/api/garaj/auction/create", { garajCarId, minBid }, 1),
  garajAuctionBid: (auctionId: number, amount: number) => request<GarajActionResult>("POST", "/api/garaj/auction/bid", { auctionId, amount }, 1),
  garajCipher: (guess: string) => request<GarajActionResult & { attemptsLeft?: number }>("POST", "/api/garaj/cipher", { guess }, 1),
  garajCollectBox: () => request<GarajActionResult>("POST", "/api/garaj/box/collect", {}, 1),
  garajComeback: () => request<GarajActionResult>("POST", "/api/garaj/comeback", {}, 1),
  garajPrestige: () => request<GarajActionResult & { prestigeCount?: number }>("POST", "/api/garaj/prestige", {}, 1),
  garajHall: () => get<{ memberId: number; prestigeCount: number; repAtEntry: number }[]>("/api/garaj/hall"),
  garajMahallaLeague: () => get<{ rank: number; name: string; score: number; memberCount: number }[]>("/api/garaj/mahalla/league"),
  garajMahallaCreate: (name: string) => request<GarajActionResult & { code?: string; mahallaId?: number }>("POST", "/api/garaj/mahalla/create", { name }, 1),
  garajMahallaJoin: (code: string) => request<GarajActionResult & { mahallaId?: number }>("POST", "/api/garaj/mahalla/join", { code }, 1),
  garajMahallaLeave: () => request<GarajActionResult>("POST", "/api/garaj/mahalla/leave", {}, 1),
  bookingNearby: () => get<{ pins: { lat: number; lng: number; bearing: number; busy: boolean }[]; freeDrivers: number }>("/api/booking/nearby"),
  bookingPredict: (address?: string) => get<{ rides: number; avg: number; p50: number; byAddress?: { name: string; avg: number; rides: number } | null }>(`/api/booking/predict${address ? `?address=${encodeURIComponent(address)}` : ""}`),
  bookingRate: (bookingId: number, stars: number, tags: string[]) => request<{ ok: boolean; reason?: string }>("POST", "/api/booking/rate", { bookingId, stars, tags }, 1),
  bookingScheduled: () => get<{ scheduled: { id: number; addressName: string; runAt: string; phone: string }[]; family: { id: number; phone: string; name: string }[] }>("/api/booking/scheduled"),
  bookingSchedule: (pickupId: number, pickupName: string, runAt: string, forPhone?: string) => request<{ ok: boolean; reason?: string }>("POST", "/api/booking/schedule", { pickupId, pickupName, runAt, forPhone }, 1),
  bookingScheduleCancel: (id: number) => request<{ ok: boolean }>("POST", "/api/booking/schedule/cancel", { id }, 1),
  familyAdd: (phone: string, name: string) => request<{ ok: boolean; reason?: string }>("POST", "/api/family/add", { phone, name }, 1),
  familyBook: (familyId: number, pickupId: number, pickupName: string) => request<{ ok: boolean; live: boolean; message?: string }>("POST", "/api/family/book", { familyId, pickupId, pickupName }, 1),
  trades: () => get<TradesResponse>("/api/trade"),
  tradeOffer: (itemId: number, coins: number, offerItemId?: number) => request<{ ok: boolean; reason?: string; offerId?: number }>("POST", "/api/trade/offer", { itemId, coins, offerItemId }, 1),
  tradeAccept: (offerId: number) => request<{ ok: boolean; reason?: string }>("POST", "/api/trade/accept", { offerId }, 1),
  tradeCancel: (offerId: number) => request<{ ok: boolean; reason?: string }>("POST", "/api/trade/cancel", { offerId }, 1),
  tradeMessage: (offerId: number, text: string) => request<{ ok: boolean; reason?: string }>("POST", "/api/trade/message", { offerId, text }, 1),
  plus: () => get<{ active: boolean; until: string | null; price: number; trialAvailable: boolean; canBuy: boolean }>("/api/plus"),
  plusSubscribe: () => request<{ ok: boolean; reason?: string; until?: string; free?: boolean }>("POST", "/api/plus/subscribe", {}, 1),
  gap: () => get<{ inGap: boolean; name?: string; code?: string; goal?: number; progress?: number; members?: { name: string; rides: number; isCreator: boolean }[] }>("/api/gap"),
  gapCreate: (name: string) => request<{ ok: boolean; reason?: string; code?: string }>("POST", "/api/gap/create", { name }, 1),
  gapJoin: (code: string) => request<{ ok: boolean; reason?: string; name?: string }>("POST", "/api/gap/join", { code }, 1),
  items: () => get<ItemsResponse>("/api/items"),
  itemMint: (code: string) => request<{ ok: boolean; reason?: string; serial?: number; name?: string }>("POST", "/api/items/mint", { code }, 1),
  itemList: (itemId: number, price: number) => request<{ ok: boolean; reason?: string }>("POST", "/api/items/list", { itemId, price }, 1),
  itemUnlist: (itemId: number) => request<{ ok: boolean }>("POST", "/api/items/unlist", { itemId }, 1),
  itemBuy: (listingId: number) => request<{ ok: boolean; reason?: string; name?: string; coins: number }>("POST", "/api/items/buy", { listingId }, 1),
  bookingInfo: () => get<BookingInfoResponse | { error: string }>("/api/booking/info"),
  home: () => get<HomeResponse>("/api/home"),
  mahalla: () =>
    get<{
      off: boolean;
      week: string;
      gaps: { gapId: number; name: string; members: number; score: number; rank: number }[];
      me: { gapId: number; name: string; rank: number; score: number } | null;
    }>("/api/mahalla"),
  account: () =>
    get<{ name: string; phone: string; joined: string | null; type: string; coins: number; cashback: number; streak: number; trips: number; notifyOff: boolean }>(
      "/api/account",
    ),
  accountNotify: (off: boolean) => request<{ ok: boolean; off: boolean }>("POST", "/api/account/notify", { off }, 1),
  accountName: (name: string) => request<{ ok: boolean; name?: string; reason?: string }>("POST", "/api/account/name", { name }, 1),
  tolqinStart: () => request<{ off: boolean; token: string }>("POST", "/api/tolqin/start", {}, 1),
  tolqinFinish: (token: string, score: number) =>
    request<{ off?: boolean; ok: boolean; granted: number; dailyCap: number; roomLeft: number; reason?: string }>("POST", "/api/tolqin/finish", { token, score }, 1),
  bookingActive: () => get<ActiveBookingView | null>("/api/booking/active"),
  bookingSearch: (q: string) => request<SavedAddr[]>("POST", "/api/booking/search", { q }, 1),
  bookingNearestAddr: (lat: number, lng: number) => request<SavedAddr | null>("POST", "/api/booking/nearest", { lat, lng }, 1),
  bookingCreate: (body: BookingCreateBody) => request<BookingCreateResponse>("POST", "/api/booking/create", body, 1),
  bookingNow: (body: { lat?: number; lng?: number; addressId?: number } = {}) => request<BookingNowResponse>("POST", "/api/booking/now", body, 1),
  bookingCancel: () => request<BookingCancelResponse>("POST", "/api/booking/cancel", undefined, 1),
  bookingEstimate: (pickup: GeoPt, dest: GeoPt, surcharge: number) => request<FareQuote>("POST", "/api/booking/estimate", { pickup, dest, surcharge }),
  bookingHistory: () =>
    get<{ id: number; addressName: string; status: string; carModel: string; payment: number; cashback: number; at: string }[]>("/api/booking/history"),
};

interface SavedAddr {
  id: number;
  name: string;
  lat?: number;
  lng?: number;
  surcharge?: number;
}

export interface TradesResponse {
  incoming: { id: number; item: string; offerCoins: number; offerItem: string | null; from: string; mine: boolean; chat: { me: boolean; text: string }[] }[];
  outgoing: { id: number; item: string; offerCoins: number; offerItem: string | null; from: string; mine: boolean; chat: { me: boolean; text: string }[] }[];
}

export interface ItemsResponse {
  catalog: { code: string; name: string; emoji: string; rarity: string; price: number; left: number | null }[];
  mine: { id: number; code: string; name: string; emoji: string; serial: number; cap: number; sellable: boolean; listed: boolean }[];
  partsProgress: { have: number; total: number };
  market: { listingId: number; itemId: number; name: string; emoji: string; serial: number; price: number; mine: boolean }[];
  coins: number;
}

interface MarketShop {
  id: number;
  name: string;
  emoji: string;
  category: string;
  listings: { id: number; title: string; emoji: string; priceCoins: number }[];
}
