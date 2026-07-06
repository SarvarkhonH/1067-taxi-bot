import type {
  AdminActionResult,
  AdminAuditRow,
  AdminBotUsersResponse,
  AdminBroadcastDetail,
  AdminBroadcastRow,
  AdminEconomy,
  BallDistribution,
  AdminGrowth,
  AdminHealth,
  AdminFinance,
  AdminIntegrity,
  AdminLiveBooking,
  AdminMemberRow,
  AdminStats,
  MemberType,
  OpsPulse,
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
  ballDist: () => req<BallDistribution>("/api/admin/ball-distribution"),
  growth: () => req<AdminGrowth>("/api/admin/growth"),
  bookings: () => req<AdminLiveBooking[]>("/api/admin/bookings"),
  audit: () => req<AdminAuditRow[]>("/api/admin/audit"),
  grant: (target: string, amount: number, reason: string) => postJson<AdminActionResult>("/api/admin/grant", { target, amount, reason }),
  grantTanga: (phone: string, amount: number, reason: string) => postJson<AdminActionResult>("/api/admin/grant-tanga", { phone, amount, reason }),
  grantMemberCoins: (memberId: number, amount: number, reason: string) => postJson<AdminActionResult>("/api/admin/grant-coins", { memberId, amount, reason }),
  moveToBalance: (memberId: number, amount: number) => postJson<AdminActionResult>("/api/admin/move-to-balance", { memberId, amount }),
  announce: (text: string, segment: "all" | "linked" | "dormant", days?: number) => postJson<AdminActionResult>("/api/admin/announce", { text, segment, days }),
  // 📢 persistent broadcast history (who received / who didn't — survives refresh)
  broadcasts: (limit = 50) => req<AdminBroadcastRow[]>(`/api/admin/broadcasts?limit=${limit}`),
  broadcastDetail: (id: number) => req<AdminBroadcastDetail>(`/api/admin/broadcasts/${id}`),
  grantSegment: (segment: "all" | "linked" | "dormant", amount: number, reason: string, days?: number) => postJson<AdminActionResult>("/api/admin/grant-segment", { segment, amount, reason, days }),
  wakeUp: (text: string, bonus: number, days: number) => postJson<AdminActionResult>("/api/admin/wake-up", { text, bonus, days }),
  integrity: () => req<AdminIntegrity>("/api/admin/integrity"),
  features: () => req<{ features: { name: string; on: boolean }[]; mashinaFund: number }>("/api/admin/features"),
  setFeature: (name: string, on: boolean) => postJson<{ ok: boolean; features: { name: string; on: boolean }[] }>("/api/admin/features", { name, on }),
  transferEconomy: () => req<{ knobs: { key: string; label: string; def: number; min: number; max: number; step: number }[]; values: Record<string, number>; enabled: boolean; earned: { total: number; today: number } }>("/api/admin/transfer-economy"),
  setTransferEconomy: (key: string, value: number) => postJson<{ ok: boolean; values: Record<string, number> }>("/api/admin/transfer-economy", { key, value }),
  bonusEconomy: () => req<{ knobs: { key: string; label: string; def: number; min: number; max: number; step: number; group: string }[]; values: Record<string, number> }>("/api/admin/bonus-economy"),
  setBonusEconomy: (key: string, value: number) => postJson<{ ok: boolean; values: Record<string, number> }>("/api/admin/bonus-economy", { key, value }),
  corps: () => req<{ corps: { id: number; name: string; balance: number; employees: number }[] }>("/api/admin/corps"),
  corpCreate: (name: string, cap: number) => postJson<{ id: number }>("/api/admin/corps", { name, cap }),
  corpAddEmployee: (id: number, phone: string, name?: string) => postJson<{ ok: boolean; reason?: string }>(`/api/admin/corps/${id}/employees`, { phone, name }),
  corpBalance: (id: number, delta: number) => postJson<{ ok: boolean; balance?: number; reason?: string }>(`/api/admin/corps/${id}/balance`, { delta }),
  livemap: () => req<{ pins: { lat: number; lng: number; busy: boolean }[]; freeDrivers: number; bookings: { id: number; status: string; lat: number | null; lng: number | null; address: string }[] }>("/api/admin/livemap"),
  member360: (phone: string) => req<Member360>(`/api/admin/member360?phone=${encodeURIComponent(phone)}`),
  driver360: (car: string) => req<Driver360>(`/api/admin/driver360?car=${encodeURIComponent(car)}`),
  mashina: () => req<{ fund: number; tickets: { name: string; car: string; tickets: number }[]; rule: string }>("/api/admin/mashina"),
  optoken: (role: "operator" | "shopseller" = "operator") => postJson<{ ok: boolean; token: string; role: string }>("/api/admin/optoken", { role }),
  optokens: () => req<{ tokens: { token: string; role: string; createdAt: string }[] }>("/api/admin/optokens"),
  whoami: () => req<{ role: string }>("/api/admin/whoami"),
  optokenRevoke: (token: string) => req<{ ok: boolean }>(`/api/admin/optokens/${encodeURIComponent(token)}`, { method: "DELETE" }),
  unflag: (memberId: number) => postJson<AdminActionResult>("/api/admin/unflag", { memberId }),
  // 📷 driver portrait — upload a JPEG/PNG (≤5MB). base64 → server → Telegram CDN → file_id in DB.
  uploadDriverPhoto: (driverId: number, mime: string, base64: string) =>
    postJson<{ ok: boolean; fileId?: string; error?: string }>(`/api/admin/driver-photo/${driverId}`, { mime, base64 }),
  clearDriverPhoto: (driverId: number) =>
    req<{ ok: boolean }>(`/api/admin/driver-photo/${driverId}`, { method: "DELETE" }),
  driverPhotoUrl: (driverId: number) => `${API_BASE}/api/driver-photo/${driverId}`,
  recruitQrUrl: (driverId: number) => `${API_BASE}/api/admin/recruitqr/${driverId}`,
  driverStickerUrl: (driverId: number, token: string) => `${API_BASE}/api/admin/driver-sticker/${driverId}?token=${encodeURIComponent(token)}`,
  recruits: () => req<{ driverId: number; fullName: string; scanned: number; joined: number; rode: number; earned: number }[]>("/api/admin/recruits"),
  recruitDetail: (driverId: number) =>
    req<{
      driverId: number;
      fullName: string;
      clients: { name: string; phone: string; status: "scanned" | "joined" | "rode"; rides: number }[];
      earned: { start: number; share: number; revshare: number; legacy: number; total: number };
    }>(`/api/admin/recruits/${driverId}`),
  corpReport: (id: number) => req<{ corp: { name: string; balance: number }; rows: { phone: string; name: string | null; rides: number; overCap: boolean }[]; totalRides: number }>(`/api/admin/corps/${id}/report`),
  rides: (limit = 150) => req<AdminRideRow[]>(`/api/admin/rides?limit=${limit}`),
  driverDebts: () => req<AdminDebtRow[]>("/api/admin/driver-debts"),
  // 🚐 intercity (shaharlararo)
  intercityTrips: (status?: string) => req<IntercityAdminTrip[]>(`/api/intercity/admin/trips${status ? `?status=${encodeURIComponent(status)}` : ""}`),
  intercityDebts: () => req<{ rows: IntercityAdminDebt[]; totalPending: number }>("/api/intercity/admin/debts"),
  intercityForceCancel: (tripId: number) => postJson<{ ok: boolean }>("/api/intercity/admin/trip/cancel", { tripId }),
  referrals: () => req<AdminReferralRow[]>("/api/admin/referrals"),
  banned: () => req<AdminBannedRow[]>("/api/admin/banned"),
  ban: (memberId: number, reason: string) => postJson<{ ok: boolean; message: string }>("/api/admin/ban", { memberId, reason }),
  unban: (memberId: number) => postJson<{ ok: boolean; message: string }>("/api/admin/unban", { memberId }),
  northstar: () =>
    req<{ weekCompleted: number; prevWeekCompleted: number; botShare: number; weeklyActiveRiders: number; coinLiability: number; weekDays: number }>(
      "/api/admin/analytics/northstar",
    ),
  growthFunnel: () =>
    req<{ newRiders7d: number; newRidersPrev7d: number; retentionPct: number; retentionCohort: number; acqEmission7d: number; cacTanga: number; viralPct: number }>(
      "/api/admin/analytics/funnel",
    ),
  retentionCohorts: () =>
    req<{ cohorts: { cohort: string; users: number; d1: number; d7: number; d30: number }[] }>("/api/admin/analytics/retention"),
  // 📊 Phase-4 Overview insights
  anomalies: () =>
    req<{ level: "ok" | "warn" | "alert"; items: { level: "warn" | "alert"; text: string }[]; emissionToday: number; cashoutToday: number }>("/api/admin/anomalies"),
  inbox: () =>
    req<{ pending: { id: number; amount: number; method: string; mask: string; name: string; phone: string; at: string }[]; count: number }>("/api/admin/inbox"),
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
  pulse: () => req<OpsPulse>("/api/admin/pulse"),
  finance: () => req<AdminFinance>("/api/admin/finance"),
  // 👑 user management ("boshqaruv")
  searchUsers: (q: string) => req<AdminUserRow[]>(`/api/admin/users?q=${encodeURIComponent(q)}`),
  relinkUser: (telegramId: string, memberId: number) => postJson<{ ok: boolean; reason?: string }>("/api/admin/users/relink", { telegramId, memberId }),
  unlinkUser: (telegramId: string) => postJson<{ ok: boolean; reason?: string }>("/api/admin/users/unlink", { telegramId }),
  linkCode: (phone: string) => postJson<{ ok: boolean; code?: string; message?: string }>("/api/admin/linkcode", { phone }),
  withdrawals: (limit = 50) => req<AdminWithdrawalRow[]>(`/api/admin/withdrawals?limit=${limit}`),
  // 🎯 driver missions
  driverMissions: () => req<DriverMissionRow[]>("/api/admin/driver-missions"),
  addDriverMission: (title: string, target: number, reward: number) =>
    postJson<{ ok: boolean; reason?: string; id?: string }>("/api/admin/driver-missions", { title, target, reward }),
  toggleDriverMission: (id: string, active: boolean) =>
    postJson<{ ok: boolean; reason?: string }>("/api/admin/driver-missions/toggle", { id, active }),
  editDriverMission: (id: string, title: string, target: number, reward: number) =>
    postJson<{ ok: boolean; reason?: string }>("/api/admin/driver-missions/edit", { id, title, target, reward }),
  deleteDriverMission: (id: string) => postJson<{ ok: boolean; reason?: string }>("/api/admin/driver-missions/delete", { id }),
  // 🎁 promo campaigns
  campaigns: () => req<{ campaigns: CampaignRow[]; conds: { cond: string; label: string; unit: string }[]; enabled: boolean }>("/api/admin/campaigns"),
  addCampaign: (c: { title: string; emoji?: string; cond: string; target: number; windowDays: number; reward: number; audience: string }) =>
    postJson<{ ok: boolean; id?: string; reason?: string }>("/api/admin/campaigns", c),
  toggleCampaign: (id: string, active: boolean) => postJson<{ ok: boolean; reason?: string }>("/api/admin/campaigns/toggle", { id, active }),
  editCampaign: (id: string, patch: Record<string, unknown>) => postJson<{ ok: boolean; reason?: string }>("/api/admin/campaigns/edit", { id, ...patch }),
  deleteCampaign: (id: string) => postJson<{ ok: boolean }>("/api/admin/campaigns/delete", { id }),
  // 🛍 tanga shop
  shopProducts: () => req<{ products: ShopAdminProductRow[]; enabled: boolean; pendingOrders: number }>("/api/admin/shop/products"),
  shopCreate: (p: { name: string; priceTanga: number; stock: number; category?: string; description?: string }) =>
    postJson<{ ok: boolean; id?: number; error?: string }>("/api/admin/shop/products", p),
  shopEdit: (id: number, patch: Record<string, unknown>) => postJson<{ ok: boolean }>(`/api/admin/shop/products/${id}`, patch),
  shopToggle: (id: number, active: boolean) => postJson<{ ok: boolean }>(`/api/admin/shop/products/${id}/toggle`, { active }),
  shopDelete: (id: number) => req<{ ok: boolean }>(`/api/admin/shop/products/${id}`, { method: "DELETE" }),
  shopPhotoUpload: (id: number, mime: string, base64: string) => postJson<{ ok: boolean; error?: string; photoCount?: number }>(`/api/admin/shop/products/${id}/photo`, { mime, base64 }),
  shopPhotoClear: (id: number) => req<{ ok: boolean }>(`/api/admin/shop/products/${id}/photo`, { method: "DELETE" }),
  shopOrders: (status?: string) => req<{ orders: ShopAdminOrderRow[] }>(`/api/admin/shop/orders${status ? `?status=${status}` : ""}`),
  shopReviews: () => req<{ reviews: ShopAdminReviewRow[] }>("/api/admin/shop/reviews"),
  shopReviewDelete: (id: number) => req<{ ok: boolean }>(`/api/admin/shop/reviews/${id}`, { method: "DELETE" }),
  // 🔎 xizmatlar directory
  svcList: (status?: string) => req<{ rows: SvcAdminRow[]; enabled: boolean; pending: number; hiddenReviews: number; phoneFlagged: number; newRequests: number }>(`/api/admin/services${status ? `?status=${status}` : ""}`),
  svcRequests: (status = "new") => req<{ requests: { id: number; query: string; note: string; status: string; createdAt: string }[] }>(`/api/admin/service-requests?status=${status}`),
  svcRequestSet: (id: number, status: "new" | "done" | "dismissed") => postJson<{ ok: boolean }>(`/api/admin/service-requests/${id}`, { status }),
  svcCreate: (p: Record<string, unknown>) => postJson<{ ok: boolean; id?: number; error?: string }>("/api/admin/services", p),
  svcEdit: (id: number, patch: Record<string, unknown>) => postJson<{ ok: boolean; error?: string }>(`/api/admin/services/${id}`, patch),
  svcCats: () => req<{ categories: SvcAdminCat[] }>("/api/admin/service-categories"),
  svcCatUpsert: (p: { id?: number; name: string; emoji?: string; sortOrder?: number; active?: boolean }) => postJson<{ ok: boolean; id?: number }>("/api/admin/service-categories", p),
  svcReviewQueue: () => req<{ reviews: SvcAdminReview[] }>("/api/admin/service-reviews"),
  svcReviewModerate: (id: number, action: "restore" | "delete") => postJson<{ ok: boolean }>(`/api/admin/service-reviews/${id}`, { action }),
  svcSetPrices: (id: number, items: { label: string; priceSom: number }[]) => postJson<{ ok: boolean; count: number }>(`/api/admin/services/${id}/prices`, { items }),
  svcPhotoUpload: (id: number, mime: string, base64: string) => postJson<{ ok: boolean; error?: string; photoCount?: number }>(`/api/admin/services/${id}/photo`, { mime, base64 }),
  svcPhotoClear: (id: number) => req<{ ok: boolean }>(`/api/admin/services/${id}/photo`, { method: "DELETE" }),
  // 💸 withdrawals tab
  withdrawalsTab: (limit = 100) => req<AdminWithdrawalTabRow[]>(`/api/admin/withdrawals-tab?limit=${limit}`),
  // ⭐ ratings
  ratings: () => req<AdminRatingRow[]>("/api/admin/ratings"),
  transactions: (kind = "all", limit = 200) => req<AdminTxnRow[]>(`/api/admin/transactions?kind=${kind}&limit=${limit}`),
  blocked: (limit = 500) => req<AdminBlockedRow[]>(`/api/admin/blocked?limit=${limit}`),
  // 💬 support chat
  chatConversations: () => req<AdminChatConvo[]>("/api/admin/chat/conversations"),
  chatMessages: (telegramId: string) => req<AdminChatMsg[]>(`/api/admin/chat/messages/${encodeURIComponent(telegramId)}`),
  chatReply: (telegramId: string, text: string) => postJson<{ ok: boolean }>("/api/admin/chat/reply", { telegramId, text }),
  // 📱 message history
  msgHistory: (limit = 200) => req<AdminMsgHistoryRow[]>(`/api/admin/msg-history?limit=${limit}`),
  // 🔥 peak hours
  peakHours: () => req<PeakHourRow[]>("/api/admin/peak-hours"),
  savePeakHour: (data: Omit<PeakHourRow, "createdAt" | "updatedAt"> & { id?: number }) =>
    postJson<PeakHourRow>("/api/admin/peak-hours", data),
  deletePeakHour: (id: number) =>
    fetch(`${API_BASE}/api/admin/peak-hours/${id}`, { method: "DELETE", headers: authHeaders() }).then((r) => r.json() as Promise<{ ok: boolean }>),
  // 📞 obzvon — kas1067 driver call panel
  callsSync: () => postJson<DriverCallSync>("/api/admin/calls/sync", {}),
  calls: (opts: { status?: string; search?: string; segment?: string } = {}) => {
    const p = new URLSearchParams();
    if (opts.status) p.set("status", opts.status);
    if (opts.search) p.set("search", opts.search);
    if (opts.segment) p.set("segment", opts.segment);
    const qs = p.toString();
    return req<DriverCallList>(`/api/admin/calls${qs ? `?${qs}` : ""}`);
  },
  callUpdate: (id: number, patch: { status?: string; note?: string; callbackAt?: string | null }) =>
    postJson<{ ok: boolean; row?: DriverCallRow; error?: string }>(`/api/admin/calls/${id}`, patch),
};

export interface DriverMissionRow {
  id: string;
  emoji: string;
  title: string;
  target: number;
  reward: number;
  period: string;
  active: boolean;
}

// 📞 obzvon
export interface DriverCallRow {
  id: number;
  kasDriverId: number;
  fullName: string;
  phone: string | null;
  carNumber: string | null;
  carModel: string | null;
  address: string | null;
  balance: number;
  debt: number;
  trips: number;
  rating: number;
  active: boolean;
  lastRideAt: string | null;
  licenseTerm: string | null;
  inBot: boolean;
  takingOrders: boolean;
  status: string;
  note: string | null;
  callbackAt: string | null;
  calledAt: string | null;
  calledBy: string | null;
  callCount: number;
}
export interface DriverCallStats {
  total: number;
  inBot: number;
  notInBot: number;
  taking: number;
  called: number;
  remaining: number;
  joined: number;
  byStatus: Record<string, number>;
  lastSyncAt: string | null;
}
export interface DriverCallList {
  rows: DriverCallRow[];
  stats: DriverCallStats;
}
export interface DriverCallSync {
  total: number;
  created: number;
  updated: number;
  inBot: number;
  taking: number;
}

export interface CampaignRow {
  id: string;
  emoji: string;
  title: string;
  cond: string;
  target: number;
  windowDays: number;
  reward: number;
  audience: string;
  active: boolean;
  startAt: string;
  endAt: string;
  ended: boolean;
  completions: number;
}

export interface AdminUserRow {
  id: number;
  type: string;
  kasId: string;
  fullName: string;
  phone: string | null;
  coins: number;
  points: number;
  trips: number;
  tier: string;
  telegram: { id: string; username: string | null; name: string | null; linkedAt: string | null } | null;
}

export interface AdminWithdrawalRow {
  id: number;
  amount: number;
  kasApplied: boolean;
  kasMessage: string | null;
  at: string;
  member: { name: string; phone: string | null; type: string } | null;
}

export interface Member360 {
  member: { id: number; name: string; type: string; coins: number; trips: number; riskFlag: boolean; plusUntil: string | null; tier: string; createdAt: string };
  rides30: number;
  items: number;
  gap: string | null;
  recruitedByDriver: number | null;
  ratings: number;
  txns: { amount: number; kind: string; reason: string; at: string }[];
}

export interface AdminWithdrawalTabRow {
  id: number;
  amount: number;
  kasApplied: boolean;
  kasMessage: string | null;
  memberName: string | null;
  phone: string | null;
  type: string | null;
  at: string;
}

export interface AdminBlockedRow {
  telegramId: string;
  name: string;
  phone: string | null;
  linked: boolean;
  at: string;
}

export interface AdminTxnRow {
  id: string;
  kind: string; // transfer | tip | fare | withdraw
  amount: number;
  commission: number;
  fromName: string | null;
  fromPhone: string | null;
  fromType: string | null;
  toName: string | null;
  toPhone: string | null;
  toType: string | null;
  note: string | null;
  at: string;
}

export interface AdminRatingRow {
  id: number;
  memberId: number;
  bookingId: number;
  carNumber: string;
  stars: number;
  tags: string;
  at: string;
}

export interface AdminChatConvo {
  telegramId: string;
  name: string | null;
  username: string | null;
  lastMsg: string;
  lastAt: string;
  unread: number;
}

export interface AdminChatMsg {
  id: number;
  direction: string;
  text: string;
  at: string;
}

export interface AdminMsgHistoryRow {
  id: number;
  telegramId: string;
  direction: string;
  text: string;
  at: string;
}

export interface AdminRideRow {
  id: number;
  memberId: number;
  memberName: string;
  phone: string | null;
  bookingId: number;
  amount: number;
  tier: string;
  lucky: boolean;
  source: string;
  at: string;
}

export interface AdminDebtRow {
  id: number;
  memberId: number;
  carNumber: string;
  amount: number;
  status: string;
  kasBalance: number | null;
  errorNote: string | null;
  at: string;
}

export interface IntercityAdminTrip {
  id: number;
  status: string;
  scheduledAt: string;
  fareSom: number;
  commissionSom: number;
  bookedSeats: number;
  carCapacity: number;
  originCity: { name: string };
  destCity: { name: string };
  driver: { fullName: string | null; carNumber: string | null };
  _count: { bookings: number };
}
export interface IntercityAdminDebt {
  id: number;
  commissionSom: number;
  status: string;
  createdAt: string;
  driver: { fullName: string | null; carNumber: string | null };
  trip: { id: number };
}

export interface AdminReferralRow {
  id: number;
  referrerId: string;
  referrerName: string;
  refereeId: string;
  refereeName: string;
  rewardReferrer: number;
  rewardReferee: number;
  paid: boolean;
  at: string;
}

export interface AdminBannedRow {
  id: number;
  fullName: string | null;
  phone: string | null;
  type: string;
  riskNote: string | null;
  trips: number;
  coins: number;
}

export interface PeakHourRow {
  id: number;
  label: string;
  startTime: string;
  endTime: string;
  bonusTanga: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Driver360 {
  driver: { id: number; name: string; tier: string; coins: number; phone: string | null } | null;
  rating: { avg: number; count: number; tags: { tag: string; n: number }[] };
  recruits: number;
  mashinaTickets: number;
}

// 🛍 tanga shop admin rows
export interface ShopAdminProductRow {
  id: number;
  name: string;
  description: string | null;
  category: string;
  priceTanga: number;
  stock: number;
  active: boolean;
  sortOrder: number;
  hasPhoto: boolean;
  photoCount: number;
  oldPriceTanga: number | null;
  featured: boolean;
  soldCount: number;
  createdAt: string;
}
export interface ShopAdminOrderRow {
  id: number;
  productName: string;
  priceTanga: number;
  payKind: "tanga" | "cash";
  status: string;
  note?: string | null;
  address: string;
  createdAt: string;
  decidedAt?: string | null;
  buyerName: string;
  contact: string;
}
export interface ShopAdminReviewRow {
  id: number;
  productId: number;
  productName: string;
  memberName: string;
  thumb: string;
  text: string | null;
  photoCount: number;
  createdAt: string;
}

// 🔎 xizmatlar directory admin rows
export interface SvcAdminRow {
  id: number;
  name: string;
  phone: string;
  phone2: string | null;
  desc: string;
  categoryId: number;
  categoryName: string;
  tags: string;
  address: string | null;
  workHours: string | null;
  geoLat: number | null;
  geoLng: number | null;
  priceCount: number;
  instagram: string | null;
  telegramUrl: string | null;
  facebook: string | null;
  website: string | null;
  inspStars: number | null;
  inspNote: string | null;
  status: string;
  isVip: boolean;
  verified: boolean;
  viewCount: number;
  callCount: number;
  phoneReports: number;
  avgRating: number;
  reviewCount: number;
  photoCount: number;
  createdAt: string;
}
export interface SvcAdminCat {
  id: number;
  name: string;
  emoji: string;
  sortOrder: number;
  active: boolean;
}
export interface SvcAdminReview {
  id: number;
  listingId: number;
  listingName: string;
  authorName: string;
  stars: number;
  text: string;
  reports: number;
  status: string;
}
