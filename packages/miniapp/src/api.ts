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

