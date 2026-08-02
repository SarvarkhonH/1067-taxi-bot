import type {
  AdminActionResult,
  AdminAdContactRow,
  AdminAdReactionRow,
  AdminAdViewerRow,
  AdminAuditRow,
  AdminBotUsersResponse,
  AdminBroadcastDetail,
  AdminBroadcastRow,
  AdminClassifiedListResponse,
  AdminEconomy,
  AdminFoodOrderRow,
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
  OyinActivityAction,
  OyinActivityResponse,
  OyinDrawExport,
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
  oyinSponsor: () => req<{ name: string; photoUrl: string | null; active: boolean; isDefault: boolean }>("/api/admin/oyin/sponsor"),
  oyinPrizePhotos: () => req<{ prizes: { key: string; name: string; icon: string; photoUrl: string | null }[] }>("/api/admin/oyin/prize-photos"),
  setOyinPrizePhoto: (key: string, photoUrl: string) =>
    postJson<{ prizes: { key: string; name: string; icon: string; photoUrl: string | null }[] }>("/api/admin/oyin/prize-photo", { key, photoUrl }),
  setOyinSponsor: (name: string, photoUrl: string | null, active: boolean) =>
    postJson<{ name: string; photoUrl: string | null; active: boolean; isDefault: boolean }>("/api/admin/oyin/sponsor", { name, photoUrl, active }),
  oyinActivity: (filter: { memberId?: number; action?: OyinActivityAction; from?: string; to?: string; page?: number }) => {
    const p = new URLSearchParams();
    if (filter.memberId) p.set("memberId", String(filter.memberId));
    if (filter.action) p.set("action", filter.action);
    if (filter.from) p.set("from", filter.from);
    if (filter.to) p.set("to", filter.to);
    if (filter.page) p.set("page", String(filter.page));
    return req<OyinActivityResponse>(`/api/admin/oyin/activity?${p.toString()}`);
  },
  oyinDraw: () => req<OyinDrawExport>("/api/admin/oyin/draw"),
  corps: () => req<{ corps: { id: number; name: string; balance: number; employees: number }[] }>("/api/admin/corps"),
  corpCreate: (name: string, cap: number) => postJson<{ id: number }>("/api/admin/corps", { name, cap }),
  corpAddEmployee: (id: number, phone: string, name?: string) => postJson<{ ok: boolean; reason?: string }>(`/api/admin/corps/${id}/employees`, { phone, name }),
  corpBalance: (id: number, delta: number) => postJson<{ ok: boolean; balance?: number; reason?: string }>(`/api/admin/corps/${id}/balance`, { delta }),
  livemap: () => req<{ pins: { lat: number; lng: number; busy: boolean }[]; freeDrivers: number; bookings: { id: number; status: string; lat: number | null; lng: number | null; address: string }[] }>("/api/admin/livemap"),
  member360: (phone: string) => req<Member360>(`/api/admin/member360?phone=${encodeURIComponent(phone)}`),
  driver360: (car: string) => req<Driver360>(`/api/admin/driver360?car=${encodeURIComponent(car)}`),
  mashina: () => req<{ fund: number; tickets: { name: string; car: string; tickets: number }[]; rule: string }>("/api/admin/mashina"),
  optoken: (role: "operator" | "shopseller" = "operator", shopId?: number) => postJson<{ ok: boolean; token: string; role: string; error?: string }>("/api/admin/optoken", { role, shopId }),
  marketShops: () => req<{ shops: { id: number; name: string; active: boolean }[] }>("/api/admin/market-shops"), // V1.6e
  optokens: () => req<{ tokens: { token: string; role: string; shopName?: string; createdAt: string }[] }>("/api/admin/optokens"),
  whoami: () => req<{ role: string; operatorName?: string }>("/api/admin/whoami"),
  optokenRevoke: (token: string) => req<{ ok: boolean }>(`/api/admin/optokens/${encodeURIComponent(token)}`, { method: "DELETE" }),
  unflag: (memberId: number) => postJson<AdminActionResult>("/api/admin/unflag", { memberId }),
  // 📷 driver portrait — upload a JPEG/PNG (≤5MB). base64 → server → Telegram CDN → file_id in DB.
  uploadDriverPhoto: (driverId: number, mime: string, base64: string) =>
    postJson<{ ok: boolean; fileId?: string; error?: string }>(`/api/admin/driver-photo/${driverId}`, { mime, base64 }),
  clearDriverPhoto: (driverId: number) =>
    req<{ ok: boolean }>(`/api/admin/driver-photo/${driverId}`, { method: "DELETE" }),
  driverPhotoUrl: (driverId: number) => `${API_BASE}/api/driver-photo/${driverId}`,
  restoranPhotoUrl: (restaurantId: number) => `${API_BASE}/api/restoran/photo/${restaurantId}`,
  restoranMenuPhotoUrl: (menuItemId: number) => `${API_BASE}/api/restoran/menuphoto/${menuItemId}`,
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
  // 🚫 hard ban — TOTAL bot lockout (bot + Mini App), a level above cash-freeze (ban/unban above)
  hardBan: (memberId: number, reason: string) => postJson<{ ok: boolean; message: string }>("/api/admin/hardban", { memberId, reason }),
  hardUnban: (memberId: number) => postJson<{ ok: boolean; message: string }>("/api/admin/hardunban", { memberId }),
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
  // 🏪 §10.1: "Bugungi holat" — barcha do'kon bo'yicha kunlik nabz
  shopDailyStatus: () => req<{ pendingOrders: number; unansweredChats: number; todayStories: number; activeShops: number }>("/api/admin/shop/daily-status"),
  // §10.1: "Nima o'zgardi" — bugun vs kecha
  shopDailyDiff: () => req<{ today: { newOrders: number; rejected: number; newReviews: number }; yesterday: { newOrders: number; rejected: number; newReviews: number } }>("/api/admin/shop/daily-diff"),
  // §10.1: "Prognoz-chiziq" — haftalik xarid-hajmi trendi
  shopWeeklyTrend: () => req<{ points: { weekStart: string; orders: number }[] }>("/api/admin/shop/weekly-trend"),
  // §10.1: birlashtirilgan moderatsiya-navbat — son-xulosa
  moderationSummary: () => req<{ aiKnowledgePending: number; classifiedAdsPending: number; shopsAwaitingActivation: number }>("/api/admin/moderation-summary"),
  // §10.1: rol-darajali audit-jurnal
  shopAuditLog: () => req<{ items: { id: number; actorRole: string; actorTgId: string | null; action: string; targetType: string; targetId: number | null; detail: string | null; createdAt: string }[] }>("/api/admin/shop/audit-log"),
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
  shopProducts: (shopId?: number) => req<{ products: ShopAdminProductRow[]; enabled: boolean; pendingOrders: number }>(`/api/admin/shop/products${shopId ? `?shopId=${shopId}` : ""}`),
  shopCreate: (p: { name: string; priceTanga: number; stock: number; category?: string; description?: string; brand?: string; unit?: string; barcode?: string }, shopId?: number) =>
    postJson<{ ok: boolean; id?: number; error?: string }>("/api/admin/shop/products", shopId ? { ...p, shopId } : p),
  shopEdit: (id: number, patch: Record<string, unknown>) => postJson<{ ok: boolean }>(`/api/admin/shop/products/${id}`, patch),
  shopToggle: (id: number, active: boolean) => postJson<{ ok: boolean }>(`/api/admin/shop/products/${id}/toggle`, { active }),
  shopDelete: (id: number) => req<{ ok: boolean }>(`/api/admin/shop/products/${id}`, { method: "DELETE" }),
  // 🌍 Open Food Facts: barkod bo'yicha nom/brend/hajm/rasm (faqat o'qish)
  shopBarcodeLookup: (code: string) => req<{ found: boolean; product: { barcode: string; name: string | null; brand: string | null; unit: string | null; imageUrl: string | null; credit: string } | null }>(`/api/admin/shop/barcode/${encodeURIComponent(code)}`),
  shopPhotoFromBarcode: (id: number) => postJson<{ ok: boolean; error?: string; photoCount?: number; credit?: string }>(`/api/admin/shop/products/${id}/photo-from-barcode`, {}),
  shopPhotoUpload: (id: number, mime: string, base64: string) => postJson<{ ok: boolean; error?: string; photoCount?: number }>(`/api/admin/shop/products/${id}/photo`, { mime, base64 }),
  shopPhotoClear: (id: number) => req<{ ok: boolean }>(`/api/admin/shop/products/${id}/photo`, { method: "DELETE" }),
  shopOrders: (status?: string, shopId?: number) => {
    const qs = [status ? `status=${status}` : "", shopId ? `shopId=${shopId}` : ""].filter(Boolean).join("&");
    return req<{ orders: ShopAdminOrderRow[] }>(`/api/admin/shop/orders${qs ? `?${qs}` : ""}`);
  },
  shopReviews: (shopId?: number) => req<{ reviews: ShopAdminReviewRow[] }>(`/api/admin/shop/reviews${shopId ? `?shopId=${shopId}` : ""}`),
  shopReviewDelete: (id: number) => req<{ ok: boolean }>(`/api/admin/shop/reviews/${id}`, { method: "DELETE" }),
  // 🏪 D2: do'kon-profil (story/e'lon/mahalla/muqova-rasm) — owner ?shopId= bilan ko'rsatadi
  shopProfile: (shopId?: number) =>
    req<{ profile: { id: number; name: string; open: boolean; neighborhood: string | null; deliveryText: string | null; story: string | null; announcement: string | null; hasPhoto: boolean; avgRating: number; reviewCount: number } }>(
      `/api/admin/shop/profile${shopId ? `?shopId=${shopId}` : ""}`,
    ),
  shopProfileSave: (patch: { story?: string; announcement?: string; neighborhood?: string }, shopId?: number) =>
    postJson<{ ok: boolean }>("/api/admin/shop/profile", shopId ? { ...patch, shopId } : patch),
  shopProfilePhotoUpload: (mime: string, base64: string, shopId?: number) =>
    postJson<{ ok: boolean }>("/api/admin/shop/profile/photo", shopId ? { mime, base64, shopId } : { mime, base64 }),
  // §10.1: "muammoni tuzat" — do'kon pauza + SLA-buzilish soni
  shopOpsStatus: (shopId?: number) => req<{ paused: boolean; slaBreaches: number }>(`/api/admin/shop/ops-status${shopId ? `?shopId=${shopId}` : ""}`),
  shopHealth: (shopId?: number) => req<{ score: number; totalOrders: number; rejectionRate: number; slaBreachRate: number; activeRecently: boolean }>(`/api/admin/shop/health${shopId ? `?shopId=${shopId}` : ""}`),
  // §10.2: kuzatilmoqda-lekin-olinmayapti
  shopWatchedNotBought: (shopId?: number) => req<{ items: { productId: number; name: string; favCount: number }[] }>(`/api/admin/shop/watched-not-bought${shopId ? `?shopId=${shopId}` : ""}`),
  shopTogglePause: (paused: boolean, shopId?: number) => postJson<{ ok: boolean }>("/api/admin/shop/toggle-pause", shopId ? { paused, shopId } : { paused }),
  // §10.1: mijozlar qidirgan-lekin-topilmagan so'rovlar (unmet demand)
  shopDemand: () => req<{ demand: { query: string; count: number; lastAt: string }[] }>("/api/admin/shop/demand"),
  // §10.1: shop-darajasidagi anomaliya-detektor
  shopAttention: () => req<{ items: { shopId: number; name: string; reason: string; rejectionRate: number; slaBreachRate: number }[] }>("/api/admin/shop/attention"),
  // §10.1: ommaviy e'lon-shablon — barcha faol do'konga bir yo'la
  shopBulkAnnouncement: (text: string) => postJson<{ count: number }>("/api/admin/shop/bulk-announcement", { text }),
  // 💬 C1.6: do'kon-chat inbox (bot-DM'ning zaxira/qo'shimcha yo'li)
  shopChatConversations: (shopId?: number) =>
    req<{ convos: { telegramId: string; name: string | null; username: string | null; lastMsg: string; lastAt: string; unread: number }[] }>(`/api/admin/shop/chat/conversations${shopId ? `?shopId=${shopId}` : ""}`),
  shopChatMessages: (telegramId: string, shopId?: number) =>
    req<{ id: number; direction: string; text: string; at: string }[]>(`/api/admin/shop/chat/messages/${encodeURIComponent(telegramId)}${shopId ? `?shopId=${shopId}` : ""}`),
  shopChatReply: (telegramId: string, text: string, shopId?: number) =>
    postJson<{ ok: boolean }>("/api/admin/shop/chat/reply", shopId ? { telegramId, text, shopId } : { telegramId, text }),
  // 🎠 BirJoy kategoriya-karusel boshqaruvi (owner-only)
  shopCats: () => req<{ cats: { id: number; slug: string; name: string; emoji: string; hasIcon: boolean; sortOrder: number; active: boolean; productCount: number }[] }>("/api/admin/shop/categories"),
  shopCatCreate: (name: string, emoji?: string) => postJson<{ ok: boolean; id?: number; error?: string }>("/api/admin/shop/categories", { name, emoji }),
  shopCatEdit: (id: number, patch: Record<string, unknown>) => postJson<{ ok: boolean }>(`/api/admin/shop/categories/${id}`, patch),
  shopCatDelete: (id: number) => req<{ ok: boolean }>(`/api/admin/shop/categories/${id}`, { method: "DELETE" }),
  shopCatIcon: (id: number, mime: string, base64: string) => postJson<{ ok: boolean; error?: string }>(`/api/admin/shop/categories/${id}/icon`, { mime, base64 }),
  shopCatIconUrl: (id: number) => `${API_BASE}/api/shop/cat-icon/${id}`,
  // 🍽 restoran — R3 sessiya-navbati
  restoranOrders: (status?: string) => req<{ orders: AdminFoodOrderRow[] }>(`/api/admin/restoran/orders${status ? `?status=${status}` : ""}`),
  restoranCall: (id: number) => postJson<{ ok: boolean }>(`/api/admin/restoran/orders/${id}/call`, {}),
  restoranAccept: (id: number) => postJson<{ ok: boolean; reason?: string }>(`/api/admin/restoran/orders/${id}/accept`, {}),
  restoranAdvance: (id: number) => postJson<{ ok: boolean; reason?: string; newStatus?: string }>(`/api/admin/restoran/orders/${id}/advance`, {}),
  restoranReject: (id: number, reason: string) => postJson<{ ok: boolean; reason?: string }>(`/api/admin/restoran/orders/${id}/reject`, { reason }),
  // 🍽 restoran — R4 restoran+menyu CRUD
  restoranList: () => req<{ restaurants: RestoranAdminRow[]; enabled: boolean }>("/api/admin/restoran/restaurants"),
  restoranCreate: (p: { name: string; phone: string; category?: string; address?: string; workHours?: string; deliveryFeeSom?: number; minOrderSom?: number; pickupEnabled?: boolean; prepMinutes?: number }) =>
    postJson<{ ok: boolean; id?: number; error?: string }>("/api/admin/restoran/restaurants", p),
  restoranEdit: (id: number, patch: Record<string, unknown>) => postJson<{ ok: boolean }>(`/api/admin/restoran/restaurants/${id}`, patch),
  restoranToggle: (id: number, active: boolean) => postJson<{ ok: boolean }>(`/api/admin/restoran/restaurants/${id}/toggle`, { active }),
  restoranDelete: (id: number) => req<{ ok: boolean }>(`/api/admin/restoran/restaurants/${id}`, { method: "DELETE" }),
  restoranPhotoUpload: (id: number, mime: string, base64: string) => postJson<{ ok: boolean }>(`/api/admin/restoran/restaurants/${id}/photo`, { mime, base64 }),
  restoranMenu: (id: number) => req<{ items: RestoranMenuItemRow[] }>(`/api/admin/restoran/restaurants/${id}/menu`),
  restoranMenuCreate: (restaurantId: number, p: { section?: string; name: string; desc?: string; priceSom: number }) =>
    postJson<{ ok: boolean; id?: number; error?: string }>("/api/admin/restoran/menu", { restaurantId, ...p }),
  restoranMenuBulk: (restaurantId: number, section: string, lines: string[]) =>
    postJson<{ ok: boolean; created: number }>("/api/admin/restoran/menu/bulk", { restaurantId, section, lines }),
  restoranMenuEdit: (id: number, patch: Record<string, unknown>) => postJson<{ ok: boolean }>(`/api/admin/restoran/menu/${id}`, patch),
  restoranMenuDelete: (id: number) => req<{ ok: boolean }>(`/api/admin/restoran/menu/${id}`, { method: "DELETE" }),
  restoranMenuPhotoUpload: (id: number, mime: string, base64: string) => postJson<{ ok: boolean }>(`/api/admin/restoran/menu/${id}/photo`, { mime, base64 }),
  // 👔 jamoa — xodimlar davomati + oylik (owner-only; JAMOA_PLAN J3). Tiplar jamoa.tsx'da
  // (type-only import — runtime aylanish yo'q).
  staffOverview: () => req<import("./jamoa").JamoaOverview>("/api/admin/staff/overview"),
  staffOrgs: () => req<{ orgs: import("./jamoa").OrgRow[] }>("/api/admin/staff/orgs"),
  staffEmployee: (id: number, month?: string) => req<import("./jamoa").EmpDetail>(`/api/admin/staff/employee/${id}${month ? `?month=${month}` : ""}`),
  staffEmployeeSave: (p: Record<string, unknown>) => postJson<{ ok: boolean; id?: number; error?: string }>("/api/admin/staff/employee", p),
  staffPay: (p: { employeeId: number; kind: string; amount: number; note?: string; idemKey: string }) => postJson<{ ok: boolean; error?: string }>("/api/admin/staff/pay", p),
  staffSessionSet: (p: Record<string, unknown>) => postJson<{ ok: boolean; error?: string; amountEarned?: number }>("/api/admin/staff/session", p),
  staffOrgCreate: (name: string, ownerTelegramId: string) => postJson<{ ok: boolean; id?: number; error?: string }>("/api/admin/staff/org", { name, ownerTelegramId }),
  staffOrgSave: (id: number, patch: Record<string, unknown>) => postJson<{ ok: boolean; error?: string }>(`/api/admin/staff/org/${id}`, patch),
  staffCalendarSet: (orgId: number, date: string, kind: string | null) => postJson<{ ok: boolean; error?: string }>("/api/admin/staff/calendar", { orgId, date, kind }),
  staffCoverSet: (p: { date: string; absentEmployeeId: number; coverEmployeeId: number | null; amount?: number }) => postJson<{ ok: boolean; error?: string; amount?: number }>("/api/admin/staff/cover", p),
  staffReport: (orgId: number, month?: string) => req<import("./jamoa").MonthReport>(`/api/admin/staff/report?orgId=${orgId}${month ? `&month=${month}` : ""}`),
  staffImport: (orgId: number, text: string) => postJson<{ ok: boolean; error?: string; results?: { line: string; ok: boolean; info: string }[] }>("/api/admin/staff/import", { orgId, text }),

  // 🎀 ravella — bezak konstruktori: kategoriya/bezak/qo'shimcha CRUD + rasm + buyurtma navbati
  ravellaAll: () => req<{
    enabled: boolean; partnerChatId: string | null; previewToken: string;
    categories: import("@t1067/shared").AdminRavellaCategoryRow[];
    items: import("@t1067/shared").AdminRavellaItemRow[];
    addons: import("@t1067/shared").AdminRavellaAddonRow[];
  }>("/api/admin/ravella"),
  ravellaPartnerChat: (chatId: string) => postJson<{ ok: boolean }>("/api/admin/ravella/partner-chat", { chatId }),
  ravellaCategoryCreate: (p: { name: string; emoji?: string; sortOrder?: number }) => postJson<{ ok: boolean; id?: number; error?: string }>("/api/admin/ravella/category", p),
  ravellaCategoryEdit: (id: number, patch: Record<string, unknown>) => postJson<{ ok: boolean }>(`/api/admin/ravella/category/${id}`, patch),
  ravellaCategoryDelete: (id: number) => req<{ ok: boolean }>(`/api/admin/ravella/category/${id}`, { method: "DELETE" }),
  ravellaItemCreate: (p: { categoryId: number; name: string; basePriceSom: number; desc?: string }) => postJson<{ ok: boolean; id?: number; error?: string }>("/api/admin/ravella/item", p),
  ravellaItemEdit: (id: number, patch: Record<string, unknown>) => postJson<{ ok: boolean }>(`/api/admin/ravella/item/${id}`, patch),
  ravellaItemDelete: (id: number) => req<{ ok: boolean }>(`/api/admin/ravella/item/${id}`, { method: "DELETE" }),
  ravellaItemPhoto: (id: number, mime: string, base64: string) => postJson<{ ok: boolean }>(`/api/admin/ravella/item/${id}/photo`, { mime, base64 }),
  ravellaAddonCreate: (p: { name: string; priceSom: number; itemId?: number | null; categoryId?: number | null; maxQty?: number }) => postJson<{ ok: boolean; id?: number; error?: string }>("/api/admin/ravella/addon", p),
  ravellaAddonEdit: (id: number, patch: Record<string, unknown>) => postJson<{ ok: boolean }>(`/api/admin/ravella/addon/${id}`, patch),
  ravellaAddonDelete: (id: number) => req<{ ok: boolean }>(`/api/admin/ravella/addon/${id}`, { method: "DELETE" }),
  ravellaAddonPhoto: (id: number, mime: string, base64: string) => postJson<{ ok: boolean }>(`/api/admin/ravella/addon/${id}/photo`, { mime, base64 }),
  ravellaOrders: (status?: string) => req<{ orders: import("@t1067/shared").AdminRavellaOrderRow[] }>(`/api/admin/ravella/orders${status ? `?status=${status}` : ""}`),
  ravellaOrderAction: (id: number, action: "accept" | "call" | "done" | "reject", reason?: string) =>
    postJson<{ ok: boolean; reason?: string; cashbackSom?: number }>(`/api/admin/ravella/orders/${id}/${action}`, { reason }),
  ravellaItemPhotoUrl: (id: number) => `${API_BASE}/api/ravella/photo/${id}`,
  ravellaAddonPhotoUrl: (id: number) => `${API_BASE}/api/ravella/addon-photo/${id}`,
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
  svcGetPrices: (id: number) => req<{ items: { label: string; priceSom: number }[] }>(`/api/admin/services/${id}/prices`),
  svcSetPrices: (id: number, items: { label: string; priceSom: number }[]) => postJson<{ ok: boolean; count: number }>(`/api/admin/services/${id}/prices`, { items }),
  svcPhotoUpload: (id: number, mime: string, base64: string) => postJson<{ ok: boolean; error?: string; photoCount?: number }>(`/api/admin/services/${id}/photo`, { mime, base64 }),
  svcPhotoClear: (id: number) => req<{ ok: boolean }>(`/api/admin/services/${id}/photo`, { method: "DELETE" }),
  // 🧠 Koson AI jamoaviy bilim — moderatsiya (odam yozadi → ega tasdiqlaydi → AI biladi)
  aiKnowledgeList: (status = "pending") => req<{ status: string; items: { id: number; text: string; submittedBy: string; createdAt: string }[] }>(`/api/admin/knowledge?status=${status}`),
  aiKnowledgeModerate: (id: number, approve: boolean) => postJson<{ ok: boolean }>(`/api/admin/knowledge/${id}/moderate`, { approve }),
  aiKnowledgeDelete: (id: number) => req<{ ok: boolean }>(`/api/admin/knowledge/${id}`, { method: "DELETE" }),
  // 📋 e'lonlar (E3) — approve/reject FAQAT Telegram orqali; panel = read + edit/rasm/o'chirish/arxivla/uzayt/TOP
  elonList: (status?: string) => req<AdminClassifiedListResponse>(`/api/admin/elonlar${status ? `?status=${status}` : ""}`),
  elonViewers: (id: number) => req<{ viewers: AdminAdViewerRow[] }>(`/api/admin/elonlar/${id}/viewers`),
  elonContacts: (id: number) => req<{ contacts: AdminAdContactRow[] }>(`/api/admin/elonlar/${id}/contacts`),
  elonArchive: (id: number) => postJson<{ ok: boolean }>(`/api/admin/elonlar/${id}/archive`, {}),
  elonExtend: (id: number, days?: number) => postJson<{ ok: boolean }>(`/api/admin/elonlar/${id}/extend`, { days }),
  elonSetTop: (id: number, on: boolean) => postJson<{ ok: boolean }>(`/api/admin/elonlar/${id}/top`, { on }),
  elonEdit: (id: number, patch: Record<string, unknown>) => postJson<{ ok: boolean; error?: string }>(`/api/admin/elonlar/${id}`, patch),
  elonDelete: (id: number) => req<{ ok: boolean }>(`/api/admin/elonlar/${id}`, { method: "DELETE" }),
  elonPhotoUpload: (id: number, mime: string, base64: string) => postJson<{ ok: boolean; error?: string; photoCount?: number }>(`/api/admin/elonlar/${id}/photo`, { mime, base64 }),
  elonReactions: (id: number) => req<{ reactions: AdminAdReactionRow[] }>(`/api/admin/elonlar/${id}/reactions`),
  elonCreate: (p: Record<string, unknown>) => postJson<{ ok: boolean; id?: number; error?: string; ownerMatched?: boolean; ownerName?: string }>("/api/admin/elonlar", p),
  elonPhotoClear: (id: number) => req<{ ok: boolean }>(`/api/admin/elonlar/${id}/photo`, { method: "DELETE" }),
  // 🏠 home feed curation (Bosqich 3, feature "homeadmin")
  homeFeaturedList: () => req<{ items: { id: number; kind: string; refId: number | null; title: string; subtitle: string | null; badge: string | null; target: string | null; sortOrder: number; active: boolean; createdAt: string }[] }>("/api/admin/home-featured"),
  homeFeaturedCreate: (b: { kind: string; title: string; refId?: number; subtitle?: string; target?: string; badge?: string; sortOrder?: number }) => postJson<{ id: number }>("/api/admin/home-featured", b),
  homeFeaturedActive: (id: number, active: boolean) => postJson<{ ok: boolean }>(`/api/admin/home-featured/${id}/active`, { active }),
  homeFeaturedDelete: (id: number) => req<{ ok: boolean }>(`/api/admin/home-featured/${id}`, { method: "DELETE" }),
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
  // 🎧 Super Operator console
  chatPause: (telegramId: string, on: boolean) => postJson<{ ok: boolean }>("/api/admin/chat/pause", { telegramId, on }),
  oprResolvePhone: (phone: string, fullName?: string) =>
    postJson<{ ok: boolean; memberId?: number; fullName?: string; message?: string }>("/api/admin/opr/resolve-phone", { phone, fullName }),
  oprAct: (memberId: number | null, telegramId: string | null, action: string, params: Record<string, unknown> = {}) =>
    postJson<{ ok: boolean; message: string; extra?: unknown }>("/api/admin/opr/act", { memberId, telegramId, action, params }),
  oprDashboard: () => req<{ rows: OprOpsRow[] }>("/api/admin/opr/dashboard"),
  oprHealth: () => req<OprSystemHealth>("/api/admin/opr/health"),
  oprMintToken: (name: string) => postJson<{ ok: boolean; token: string; role: string }>("/api/admin/optoken", { role: "chatops", name }),
  oprJurnal: () => req<{ items: OprJurnalRow[] }>("/api/admin/opr/jurnal"),
  // 📈 kunlik rollup — trend-grafiklar manbai (46+ kunlik tarix)
  dailyStats: (days = 60) => req<{ days: DailyStatRow[] }>(`/api/admin/daily-stats?days=${days}`),
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
  member: { id: number; name: string; type: string; coins: number; trips: number; riskFlag: boolean; banned: boolean; plusUntil: string | null; tier: string; createdAt: string };
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
  kind: string | null; // BLK-1: qaysi xabardan keyin bloklagan (eski yozuvlarda null)
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

// 🎧 Super Operator console
export interface OprOpsRow {
  module: "taxi" | "food" | "bazar" | "reys";
  id: number | string;
  memberId?: number;
  title: string;
  status: string;
  ageMin: number;
  stuck: boolean;
}
export interface OprSystemHealth {
  flags: { name: string; on: boolean }[];
  globalUsedToday: number;
  globalCap: number;
  memberCap: number;
}
/** Kunlik rollup qatori (`DailyStat`) — trend-grafiklar uchun. */
export interface DailyStatRow {
  day: string; // "YYYY-MM-DD" (Toshkent)
  completedRides: number;
  cancelledRides: number;
  botRides: number;
  gmv: number;
}

export interface OprJurnalRow {
  id: number;
  actorRole: string;
  actorTgId: string | null;
  action: string;
  targetType: string;
  targetId: number | null;
  detail: string | null;
  createdAt: string;
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
  hardBanned: boolean; // true = TOTAL bot lockout; false = cash freeze (riskFlag) only
  banReason: string | null;
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

// 🍽 restoran admin rows (R4)
export interface RestoranAdminRow {
  id: number;
  name: string;
  category: string;
  phone: string;
  address: string | null;
  workHours: string | null;
  deliveryFeeSom: number;
  minOrderSom: number;
  pickupEnabled: boolean;
  prepMinutes: number;
  hasPhoto: boolean;
  active: boolean;
  paused: boolean;
  menuCount: number;
  orderCount: number;
  createdAt: string;
}
export interface RestoranMenuItemRow {
  id: number;
  section: string;
  name: string;
  desc?: string;
  priceSom: number;
  hasPhoto: boolean;
  available: boolean;
}

// 🛍 tanga shop admin rows
export interface ShopAdminProductRow {
  id: number;
  shopId: number | null; // V1.7: ega ko'p-do'kon aralash ko'rinishida
  shopName: string | null;
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
  // 🏷 Katalog-pasport (server AdminProductRow bilan bir xil) — sotuvchi to'liq ko'radi
  barcode: string | null;
  sku: string | null;
  brand: string | null;
  unit: string | null;
  manufacturer: string | null;
  expiryDate: string | null; // "YYYY-MM-DD"
  supplier: string | null;
}
export interface ShopAdminOrderRow {
  id: number;
  shopId: number | null;
  shopName: string | null;
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
  shopId: number | null;
  shopName: string | null;
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
  inspClean: number | null;
  inspProf: number | null;
  inspPrice: number | null;
  inspTrust: number | null;
  inspQuality: number | null;
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
