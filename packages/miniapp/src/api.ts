import type {
  BoxOpenResponse,
  BoxStatusResponse,
  CheckInResponse,
  ActiveBookingView,
  BookingCancelResponse,
  BookingCreateBody,
  BookingCreateResponse,
  BookingInfoResponse,
  CrashCashoutResponse,
  FareQuote,
  GeoPt,
  CrashStartResponse,
  DuelCreateResponse,
  DuelListResponse,
  DuelRunBody,
  DuelRunResponse,
  FareConfigResponse,
  QuizAnswerResponse,
  QuizResponse,
  LeaderboardResponse,
  MeResponse,
  MissionClaimResponse,
  MissionsResponse,
  ParkResponse,
  RaceBoardResponse,
  RaceFinishBody,
  RaceFinishResponse,
  RaceStartResponse,
  ReferralResponse,
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
  spinWheel: (respin = false) => request<WheelSpinResponse>("POST", `/api/wheel${respin ? "?respin=1" : ""}`, undefined, 1),
  missions: () => get<MissionsResponse>("/api/missions"),
  claimMission: (code: string) => post<MissionClaimResponse>(`/api/missions/claim?code=${encodeURIComponent(code)}`),
  referral: () => get<ReferralResponse>("/api/referral"),
  box: () => get<BoxStatusResponse>("/api/box"),
  openBox: (premium = false) => request<BoxOpenResponse>("POST", `/api/box/open${premium ? "?premium=1" : ""}`, undefined, 1),
  weekly: () => get<WeeklyBoardResponse>("/api/weekly"),
  wallet: () => get<WalletResponse>("/api/wallet"),
  withdraw: (amount: number) => request<WithdrawResponse>("POST", "/api/wallet/withdraw", { amount }, 1),
  topup: (amount: number) => request<WithdrawResponse>("POST", "/api/wallet/topup", { amount }, 1),
  // games (money ops → no auto-retry)
  raceStart: (stake: number) => request<RaceStartResponse>("POST", "/api/race/create", { stake }, 1),
  raceFinish: (body: RaceFinishBody) => request<RaceFinishResponse>("POST", "/api/race/finish", body, 1),
  raceBoard: (stake: number) => request<RaceBoardResponse>("GET", `/api/race/board?stake=${stake}`),
  crashStart: (stake: number) => request<CrashStartResponse>("POST", "/api/crash/start", { stake }, 1),
  crashCashout: (roundId: string) => request<CrashCashoutResponse>("POST", "/api/crash/cashout", { roundId }, 1),
  park: () => get<ParkResponse>("/api/park"),
  parkBuy: (car: string) => request<{ ok: boolean; reason?: string; coins: number }>("POST", "/api/park/buy", { car }, 1),
  parkCollect: () => request<{ ok: boolean; collected: number; coins: number }>("POST", "/api/park/collect", undefined, 1),
  fareConfig: () => get<FareConfigResponse>("/api/fare/config"),
  duelList: () => get<DuelListResponse>("/api/duel/list"),
  duelCreate: (stake: number) => request<DuelCreateResponse>("POST", "/api/duel/create", { stake }, 1),
  duelAccept: (duelId: string) => request<DuelCreateResponse>("POST", "/api/duel/accept", { duelId }, 1),
  duelRun: (body: DuelRunBody) => request<DuelRunResponse>("POST", "/api/duel/run", body, 1),
  quiz: () => get<QuizResponse>("/api/quiz"),
  quizAnswer: (qIdx: number, answerIdx: number) => request<QuizAnswerResponse>("POST", "/api/quiz/answer", { qIdx, answerIdx }, 1),
  bookingInfo: () => get<BookingInfoResponse | { error: string }>("/api/booking/info"),
  bookingActive: () => get<ActiveBookingView | null>("/api/booking/active"),
  bookingSearch: (q: string) => request<SavedAddr[]>("POST", "/api/booking/search", { q }, 1),
  bookingCreate: (body: BookingCreateBody) => request<BookingCreateResponse>("POST", "/api/booking/create", body, 1),
  bookingCancel: () => request<BookingCancelResponse>("POST", "/api/booking/cancel", undefined, 1),
  bookingEstimate: (pickup: GeoPt, dest: GeoPt, surcharge: number) => request<FareQuote>("POST", "/api/booking/estimate", { pickup, dest, surcharge }),
};

interface SavedAddr {
  id: number;
  name: string;
  lat?: number;
  lng?: number;
  surcharge?: number;
}
