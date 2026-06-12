import type {
  AdminActionResult,
  AdminAuditRow,
  AdminBotUsersResponse,
  AdminEconomy,
  AdminGrowth,
  AdminHealth,
  AdminIntegrity,
  AdminLiveBooking,
  AdminMemberRow,
  AdminStats,
  MemberType,
} from "@t1067/shared";

interface TgWindow {
  Telegram?: { WebApp?: { initData?: string } };
}

// Prod: absolute Render API base (set at build). Dev: same-origin via Vite proxy.
const API_BASE = ((import.meta.env.VITE_API_URL as string) || "").replace(/\/$/, "");
const IS_PROD = API_BASE.length > 0; // a real deploy points at the Render backend
const TOKEN_KEY = "admin_token";

// Desktop dashboard auth: a password/token, sent as the X-Admin-Token header and
// persisted to localStorage so the user logs in once. A ?key=… URL still works
// (legacy bookmark) and seeds the same store.
function adminToken(): string {
  try {
    const fromUrl = new URLSearchParams(location.search).get("key");
    if (fromUrl) localStorage.setItem(TOKEN_KEY, fromUrl);
    return fromUrl || localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

/** Store the entered password as the admin token (called by the login screen). */
export function setAdminToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token.trim());
  } catch {
    /* ignore */
  }
}

/** Forget the stored credential (logout / wrong password). */
export function clearAdminToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

/** True when a credential is already stored — used to skip the login screen. */
export function hasAdminToken(): boolean {
  return adminToken().length > 0;
}

function authHeaders(): Record<string, string> {
  const token = adminToken();
  if (token) return { "X-Admin-Token": token };
  const initData = (window as unknown as TgWindow).Telegram?.WebApp?.initData ?? "";
  if (initData) return { "X-Telegram-Init-Data": initData };
  // Prod has no implicit identity: without a token the request must 403 → login.
  if (IS_PROD) return {};
  const dbg = (import.meta.env.VITE_DEBUG_TG_ID as string) || "12345";
  return { "X-Debug-Telegram-Id": dbg };
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers: { ...authHeaders(), ...(init?.headers ?? {}) } });
  if (res.status === 403) throw new Error("forbidden");
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return (await res.json()) as T;
}

export interface SyncResult {
  membersSeen: number;
  newAchievements: unknown[];
}

const postJson = <T,>(path: string, body: unknown) =>
  req<T>(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const adminApi = {
  stats: (type: MemberType) => req<AdminStats>(`/api/admin/stats?type=${type}`),
  members: (type: MemberType) => req<AdminMemberRow[]>(`/api/admin/members?type=${type}`),
  botUsers: () => req<AdminBotUsersResponse>("/api/admin/botusers"),
  sync: () => req<SyncResult>("/api/admin/sync", { method: "POST" }),
  health: () => req<AdminHealth>("/api/admin/health"),
  economy: () => req<AdminEconomy>("/api/admin/economy"),
  growth: () => req<AdminGrowth>("/api/admin/growth"),
  bookings: () => req<AdminLiveBooking[]>("/api/admin/bookings"),
  audit: () => req<AdminAuditRow[]>("/api/admin/audit"),
  grant: (target: string, amount: number, reason: string) => postJson<AdminActionResult>("/api/admin/grant", { target, amount, reason }),
  announce: (text: string, segment: "all" | "linked") => postJson<AdminActionResult>("/api/admin/announce", { text, segment }),
  integrity: () => req<AdminIntegrity>("/api/admin/integrity"),
  features: () => req<{ features: { name: string; on: boolean }[]; mashinaFund: number }>("/api/admin/features"),
  setFeature: (name: string, on: boolean) => postJson<{ ok: boolean; features: { name: string; on: boolean }[] }>("/api/admin/features", { name, on }),
  corps: () => req<{ corps: { id: number; name: string; balance: number; employees: number }[] }>("/api/admin/corps"),
  corpCreate: (name: string, cap: number) => postJson<{ id: number }>("/api/admin/corps", { name, cap }),
  corpAddEmployee: (id: number, phone: string, name?: string) => postJson<{ ok: boolean; reason?: string }>(`/api/admin/corps/${id}/employees`, { phone, name }),
  corpBalance: (id: number, delta: number) => postJson<{ ok: boolean; balance?: number }>(`/api/admin/corps/${id}/balance`, { delta }),
  livemap: () => req<{ pins: { lat: number; lng: number; busy: boolean }[]; freeDrivers: number; bookings: { id: number; status: string; lat: number | null; lng: number | null; address: string }[] }>("/api/admin/livemap"),
  member360: (phone: string) => req<Member360>(`/api/admin/member360?phone=${encodeURIComponent(phone)}`),
  driver360: (car: string) => req<Driver360>(`/api/admin/driver360?car=${encodeURIComponent(car)}`),
  mashina: () => req<{ fund: number; tickets: { name: string; car: string; tickets: number }[]; rule: string }>("/api/admin/mashina"),
  optoken: () => postJson<{ ok: boolean; token: string; role: string }>("/api/admin/optoken", {}),
  recruitQrUrl: (driverId: number) => `${API_BASE}/api/admin/recruitqr/${driverId}`,
  corpReport: (id: number) => req<{ corp: { name: string; balance: number }; rows: { phone: string; name: string | null; rides: number; overCap: boolean }[]; totalRides: number }>(`/api/admin/corps/${id}/report`),
  northstar: () =>
    req<{ weekCompleted: number; prevWeekCompleted: number; botShare: number; weeklyActiveRiders: number; coinLiability: number }>(
      "/api/admin/analytics/northstar",
    ),
  driverAnalytics: () =>
    req<{
      windowDays: number;
      activeDrivers: number;
      histogram: { bucket: string; drivers: number }[];
      percentiles: { p50: number; p75: number; p90: number };
      top: { carNumber: string; carModel: string; rides: number }[];
      tierSuggestion: { kumush: number; oltin: number; olmos: number };
    }>("/api/admin/analytics/drivers"),
  heal: (memberId: number) => postJson<AdminActionResult>("/api/admin/heal", { memberId }),
};

export interface Member360 {
  member: { id: number; name: string; type: string; coins: number; trips: number; riskFlag: boolean; plusUntil: string | null; tier: string; createdAt: string };
  rides30: number;
  items: number;
  gap: string | null;
  recruitedByDriver: number | null;
  ratings: number;
  txns: { amount: number; kind: string; reason: string; at: string }[];
}

export interface Driver360 {
  driver: { id: number; name: string; tier: string; coins: number; phone: string | null } | null;
  rating: { avg: number; count: number; tags: { tag: string; n: number }[] };
  recruits: number;
  mashinaTickets: number;
}
