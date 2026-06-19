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
  LeaderboardResponse,
  MeResponse,
  MissionClaimResponse,
  MissionsResponse,
  ReferralResponse,
  TransferResponse,
  WalletResponse,
  WeeklyBoardResponse,
  WheelSpinResponse,
  WithdrawResponse,
} from "@t1067/shared";
import { tg } from "./telegram";

// Telegram provides initData via the SDK AND in the URL hash (tgWebAppData).
// Read the hash as a fallback so it works even if telegram-web-app.js fails to load.
export function getInitData(): string {
  const sdk = tg?.initData ?? "";
  if (sdk) return sdk;
  try {
    return new URLSearchParams(location.hash.slice(1)).get("tgWebAppData") ?? "";
  } catch {
    return "";
  }
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

export const api = {
  me: () => get<MeResponse | { linked: false }>("/api/me"),
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
  recipient: (phone: string) => request<{ found: boolean; name?: string; type?: string }>("POST", "/api/wallet/recipient", { phone }, 1),
  transfer: (phone: string, amount: number, note?: string) => request<TransferResponse>("POST", "/api/wallet/transfer", { phone, amount, note }, 1),
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
  garajRepair: (garajCarId: number, taskCode: string, style?: string, quality?: string) => request<GarajActionResult>("POST", "/api/garaj/repair", { garajCarId, taskCode, style, quality }, 1),
  garajRepairZone: (garajCarId: number, zone: string, partTier: string, style?: string, quality?: string) => request<GarajActionResult & { zone?: string; zoneVal?: number; condition?: string }>("POST", "/api/garaj/repair-zone", { garajCarId, zone, partTier, style, quality }, 1),
  garajCraft: (garajCarId: number, station: string) => request<GarajActionResult & { level?: number; condition?: string }>("POST", "/api/garaj/craft", { garajCarId, station }, 1),
  garajFlip: (garajCarId: number, buyerArchetype: string) => request<GarajActionResult>("POST", "/api/garaj/flip", { garajCarId, buyerArchetype }, 1),
  garajOnboardFinish: () => request<GarajActionResult>("POST", "/api/garaj/onboard/finish", {}, 1),
  garajKozBuy: (itemCode: string, garajCarId: number) => request<GarajActionResult>("POST", "/api/garaj/kozshop/buy", { itemCode, garajCarId }, 1),
  garajBazaar: () => get<{ id: number; carCode: string; name: string; emoji: string; askPrice: number; mine: boolean }[]>("/api/garaj/bazaar"),
  garajBazaarList: (garajCarId: number, askPrice: number) => request<GarajActionResult>("POST", "/api/garaj/bazaar/list", { garajCarId, askPrice }, 1),
  garajBazaarBuy: (listingId: number) => request<GarajActionResult>("POST", "/api/garaj/bazaar/buy", { listingId }, 1),
  garajBazaarUnlist: (listingId: number) => request<GarajActionResult>("POST", "/api/garaj/bazaar/unlist", { listingId }, 1),
  garajHistory: () => get<{ kind: string; carCode: string; name: string; emoji: string; amount: number; profit: number | null; at: string }[]>("/api/garaj/history"),
  garajCollection: (memberId: number) => get<{ memberId: number; name: string; reputationScore: number; reputationName: string; garageTier: number; prestige: number; flips: number; bestProfit: number; carsOwned: number; mahalla: string | null; cars: { name: string; emoji: string; condition: string; level: number }[] } | null>(`/api/garaj/collection?memberId=${memberId}`),
  garajClaimTow: (dropId: number) => request<GarajActionResult>("POST", "/api/garaj/tow/claim", { dropId }, 1),
  garajDeclineTow: (dropId: number) => request<GarajActionResult>("POST", "/api/garaj/tow/decline", { dropId }, 1),
  garajExhibitionSubmit: (garajCarId: number) => request<GarajActionResult>("POST", "/api/garaj/exhibition/submit", { garajCarId }, 1),
  garajExhibitionVote: (entryId: number) => request<GarajActionResult>("POST", "/api/garaj/exhibition/vote", { entryId }, 1),
  garajAuctions: () => get<{ id: number; carCode: string; name: string; emoji: string; minBid: number; endsAt: string; mine: boolean }[]>("/api/garaj/auctions"),
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
  tolqinStart: () => request<{ off: boolean; token: string }>("POST", "/api/tolqin/start", {}, 1),
  tolqinFinish: (token: string, score: number) =>
    request<{ off?: boolean; ok: boolean; granted: number; dailyCap: number; roomLeft: number; reason?: string }>("POST", "/api/tolqin/finish", { token, score }, 1),
  bookingActive: () => get<ActiveBookingView | null>("/api/booking/active"),
  bookingSearch: (q: string) => request<SavedAddr[]>("POST", "/api/booking/search", { q }, 1),
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
