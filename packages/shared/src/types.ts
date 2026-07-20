// DTOs returned by the API and consumed by the Mini App + admin dashboard.
import type { MemberType } from "./gamify";

export interface BadgeView {
  code: string;
  name: string;
  emoji: string;
  description: string;
  earned: boolean;
  earnedAt?: string | null;
}

export interface MeResponse {
  luckyDay?: boolean;
  linked: boolean;
  type: MemberType;
  metricLabel: string; // "Bonus" (client) | "Balans" (driver)
  member: {
    id: number;
    fullName: string;
    phone?: string | null;
    carNumber?: string | null;
  };
  stats: {
    points: number;
    trips: number;
    rating: number;
  };
  level: { index: number; name: string; emoji: string; color: string };
  nextLevel: { index: number; name: string; emoji: string; minXp: number } | null;
  xp: number;
  xpIntoLevel: number;
  xpForNext: number | null;
  progress: number;
  rank: number | null;
  totalMembers: number; // members of the user's TYPE synced from kas1067 (rank denominator)
  botMembers?: number; // 👥 REAL bot users (TelegramUser count) — social-proof, excludes kas base
  badges: BadgeView[];
  streak: { current: number; longest: number; checkedToday: boolean };
  wheelAvailable: boolean; // a spin is available RIGHT NOW (active started ride, not yet spun)
  jackpot: number; // current escalating wheel jackpot
  coins: number; // game-wallet balance (1 coin = 1 so'm)
  leagueTier: string; // Bronza | Kumush | Oltin | Platina | Olmos
  // 🏅 Tier loyalty loop (feature "tierloyalty") — present/meaningful only when the flag is ON.
  ballPoints?: number; // game-only XP sub-component (daily-task ball), decayable
  decayWarning?: boolean; // rider is past the grace window → ball is decaying / about to
  idleDays?: number; // days since last qualifying activity (for display)
  flags?: {
    booking3?: boolean;
    livinghome?: boolean;
    intercity?: boolean; // 🚐 nationwide intercity seat-booking tab
    tierloyalty?: boolean; // 🏅 tier reward loop (multiplier + ball + decay) — UI reveals benefits only when ON
    shop?: boolean; // 🛍 tanga shop tab (owner-preview: admins see it while DARK)
    xizmatlar?: boolean; // 🔎 services directory tab (owner-preview: admins see it while DARK)
    elonlar?: boolean; // 📋 mahalla e'lon taxtasi tab, Reyting'ni tabbar'dan almashtiradi (owner-preview: admins see it while DARK)
    restoran?: boolean; // 🍽 restoran taom-buyurtma tab, "wallet" o'rnini egallaydi (owner-preview: admins see it while DARK)
  };
}

// 🏅 One ladder row's concrete benefit, derived SERVER-SIDE from live knobs so the
// displayed copy can never drift from the real cashback multiplier. (feature "tierloyalty")
export interface TierBenefit {
  levelIndex: number;
  levelName: string;
  emoji: string;
  color: string;
  minXp: number;
  multPct: number; // e.g. 15 means ×1.15 per-ride cashback
  benefitLabel: string; // e.g. "+15% har safar tanga"
}
export interface TierBenefitsResponse {
  rules: { ballHalf: number; ballFull: number; decayGraceDays: number; decayPct: number };
  tiers: TierBenefit[];
}

export interface CheckInResponse {
  alreadyChecked: boolean;
  current: number;
  longest: number;
  rewardAmount: number;
  rewardApplied: boolean;
  next: { day: number; reward: number } | null;
}

// In-ride wheel: one spin per real ride, only while the ride is in progress.
export interface WheelSpinResponse {
  noRide?: boolean; // no active started ride — the wheel only spins in the car
  alreadySpun: boolean; // this ride's spin was already used
  prize: { label: string; emoji: string; amount: number };
  applied: boolean;
  jackpot: number; // pool value after this spin
}

export interface LeaderboardEntry {
  rank: number;
  memberId: number;
  fullName: string;
  carNumber?: string | null;
  points: number;
  trips: number;
  level: { name: string; emoji: string; color: string };
  isMe: boolean;
}

export interface LeaderboardResponse {
  type: MemberType;
  metricLabel: string;
  entries: LeaderboardEntry[];
  me: LeaderboardEntry | null;
}

export interface BoxStatusResponse {
  eligible: boolean; // all daily missions completed today
  opened: boolean; // FREE box already opened today
  dailiesDone: number;
  dailiesTotal: number;
  prize: { label: string; emoji: string; amount: number } | null; // today's free prize if opened
}

export interface BoxOpenResponse {
  ok: boolean;
  reason?: "locked" | "opened";
  prize: { label: string; emoji: string; amount: number } | null;
  applied: boolean;
}

export interface ReferralResponse {
  code: string;
  link: string; // t.me deep link with the invite code
  invited: number; // completed referrals
  earned: number; // total so'm earned from referrals
  rewardReferrer: number; // what the inviter gets per completed invite
  rewardReferee: number; // what the new user gets
}

export interface AdminStats {
  type: MemberType;
  metricLabel: string;
  totalMembers: number;
  activeMembers: number;
  linkedMembers: number;
  pointsSum: number;
  tripsSum: number;
  lastSync: { at: string | null; status: string; source: string; membersSeen: number } | null;
  topMembers: LeaderboardEntry[];
}

export interface AdminBotUser {
  telegramId: string;
  name: string;
  username: string | null;
  phone: string | null;
  linked: boolean;
  memberType: MemberType | null;
  memberName: string | null;
  isAdmin: boolean;
  linkedAt: string | null;
  lastActive: string; // lastSeenAt when known, else updatedAt (progressively self-heals as users interact)
  seenReliable: boolean; // true once lastSeenAt exists — otherwise lastActive is the approximate updatedAt proxy
  online: boolean; // seen within ONLINE_WINDOW_MS (genuine, not a background write)
  joinedAt: string;
}

export interface AdminBotUsersResponse {
  total: number;
  linked: number;
  admins: number;
  newToday: number;
  users: AdminBotUser[];
}

// ─── v4 admin command center ───────────────────────────────────────────────
export interface AdminHealth {
  kas: { ok: boolean; ms: number; mode: string; message: string };
  db: { ok: boolean; ms: number };
  bot: boolean;
  bookingLive: boolean;
  lastSync: { at: string; status: string; ageMin: number } | null;
  serverTime: string;
}

export interface AdminEconomy {
  coinsOutstanding: number; // sum of all member coin balances (liability)
  emitted: number; // total coins ever granted (+)
  sunk: number; // total coins spent in games (-, excl withdraw)
  withdrawnTotal: number; // coins → real cashback (all time)
  withdrawnToday: number;
  jackpot: number;
  byKind: { kind: string; total: number; count: number }[]; // coin flow per source/sink
  withdrawBudget: { total: number; used: number; remaining: number; rides: number }; // revenue-linked
}

// 🏅 Tier loyalty monitoring — client tier distribution + ball stats (feature "tierloyalty").
export interface BallDistribution {
  members: number; // total clients
  withBall: number; // clients with ballPoints > 0
  totalBall: number; // sum of all ballPoints
  avgBall: number; // mean ballPoints over clients with ball
  maxBall: number;
  tiers: { index: number; name: string; emoji: string; color: string; count: number; ballSum: number }[];
}

export interface AdminGrowth {
  botUsers: number;
  linked: number;
  newToday: number;
  new7d: number;
  active24h: number; // updated in last 24h
  coinHolders: number; // members with coins > 0
}

export interface AdminLiveBooking {
  id: number;
  phone: string;
  addressName: string;
  status: string;
  carNumber: string | null;
  cashback: number;
  ageMin: number;
  hasDriver: boolean;
}

// ── T7 / M1 — operations pulse (today vs same weekday last week + live alerts) ──
export interface OpsPulseMetric {
  label: string; // "Safarlar" | "Bot ulushi" | "Bekor %"
  today: number;
  prev: number; // same weekday last week (from the local DailyStat rollup)
  prevAvailable: boolean; // false until the rollup has a row for that day (≈8 days of accrual)
  unit: "count" | "pct";
  goodWhen: "up" | "down"; // which direction is healthy (rides up, cancels down)
}
export interface OpsAlert {
  level: "red" | "amber";
  text: string;
}
export interface OpsPulse {
  weekday: string; // Uzbek weekday name
  metrics: OpsPulseMetric[];
  activeNow: number; // active bookings right now
  unassigned: number; // active bookings still without a driver
  emissionToday: number; // coins emitted today (+)
  emissionCapDay: number; // soft daily emission ceiling (drives the alert)
  alerts: OpsAlert[];
  reportsStale: boolean; // kas reports unavailable → pulse is partial
  // 🛡 trackcta viral-loop funnel (absent when the read fails): share → join → first ride
  trackcta?: {
    sharesTotal: number; // live-track links ever minted (track:* tokens)
    shares7d: number;
    joinsTotal: number; // bot joins that came via a shared track page (trackjoin:*)
    joins7d: number;
    activatedTotal: number; // of those joins, how many completed the referral (credited)
  };
}

// ── T7 / M2 — finance center (real money figures only; no speculative P&L) ──
export interface WithdrawQueueRow {
  member: string;
  amount: number;
  ageMin: number;
  failed: boolean; // kasApplied = false → cashout did not reach kas
  message: string | null;
}
export interface AdminFinance {
  coinLiability: number; // Σ member.coins — what the ecosystem owes
  liabilityByKind: { kind: string; total: number; count: number }[]; // emitters, biggest first
  withdrawnToday: number; // real so'm cashed out today
  withdrawnTotal: number; // all-time real cashout
  withdrawBudget: { total: number; used: number; remaining: number; rides: number };
  gmvToday: number; // gross fares today (Σ kas payment) — informational, not our revenue
  gmvWeek: number;
  daysToCoverLiability: number | null; // liability ÷ daily withdraw budget (null if budget 0)
  withdrawQueue: WithdrawQueueRow[]; // failed/unsent cashouts needing attention
  corpBalances: { name: string; balance: number; employees: number }[]; // B2B prepaid (separate ledger)
  corpTotal: number;
}

export interface AdminAuditRow {
  at: string;
  kind: string; // grant kind / withdraw / admin
  member: string;
  amount: number;
  reason: string;
  appliedToKas: boolean;
}

export interface AdminActionResult {
  ok: boolean;
  message: string;
  /** Recipients a broadcast could NOT reach (blocked the bot / deactivated). */
  failedList?: { telegramId: string; name: string; phone: string | null }[];
}

/** 📢 One past broadcast (persistent delivery log — survives page refresh). */
export interface AdminBroadcastRow {
  id: number;
  createdAt: string;
  text: string;
  segment: string; // "all" | "linked" | "dormant"
  sentCount: number;
  failedCount: number;
  totalCount: number;
}

/** 📢 Broadcast + the full FAILED recipient list (stored forever). */
export interface AdminBroadcastDetail extends AdminBroadcastRow {
  failed: { telegramId: string; name: string; phone: string | null }[];
}

export interface AdminIntegrity {
  checked: number;
  driftCount: number;
  driftTotal: number;
  drifts: { memberId: number; member: string; balance: number; ledger: number; drift: number }[];
  anomalyThreshold: number;
  anomalies: { memberId: number; member: string; gain24h: number }[];
}

export interface AdminMemberRow {
  id: number;
  kasId: string;
  type: MemberType;
  fullName: string;
  phone?: string | null;
  carNumber?: string | null;
  points: number;
  trips: number;
  rating: number;
  level: { name: string; emoji: string };
  linked: boolean;
  active: boolean;
  lastSyncAt: string | null;
}

// ── 🛍 TANGA SHOP (feature "shop") ────────────────────────────────────────────────────────────────
// Owner-listed real goods bought with tanga (NO lootboxes). Rider views + buy/order shapes.
export interface ShopProductView {
  id: number;
  name: string;
  description?: string | null;
  category: string;
  priceTanga: number;
  oldPriceTanga?: number | null; // discount display: strikethrough + −N% badge
  stock: number; // remaining units (UI shows "kam qoldi" when ≤5)
  hasPhoto: boolean; // render /api/shop/photo/:id when true
  photoCount: number; // gallery size (detail renders /api/shop/photo/:id/:n for n < photoCount)
  isNew: boolean; // createdAt < 7d — gold NEW badge
  featured: boolean; // hero-carousel slot
  topSeller: boolean; // top-3 by delivered orders — 🔥 TOP badge
  likes: number; // 👍 review count
  dislikes: number; // 👎 review count
}

export type ShopPurchaseStatus = "pending" | "delivered" | "rejected" | "cancelled";
export type ShopPayKind = "tanga" | "cash"; // cash = naqd — yetkazganda to'lanadi, tanga tegilmaydi

export interface ShopPurchaseView {
  id: number;
  productName: string;
  priceTanga: number;
  payKind: ShopPayKind;
  status: ShopPurchaseStatus;
  note?: string | null; // owner's rejection reason
  address: string;
  createdAt: string;
  decidedAt?: string | null;
}

export interface ShopBuyResponse {
  ok: boolean;
  reason?: "off" | "unavailable" | "sold_out" | "insufficient" | "bad_address" | "pending_limit" | "duplicate";
  orderId?: number;
  balance?: number; // post-purchase tanga balance (cash'da o'zgarmaydi)
}

export const SHOP_MAX_PRICE = 5_000_000; // sanity ceiling for admin-entered prices
// V0.5 (BirJoy): kanonik kategoriya-ro'yxat — erkin-string tartibsizligi (umumiy/umum/uy ro'zgo'or)
// shu bilan tugaydi. Majburlash FAQAT admin-UI select darajasida (cleanPatch ataylab erkin qoldi —
// test-TAG kategoriyalari va kelajak-migratsiyalar uchun); to'liq enforcement D1'da CategoryDef
// jadvaliga ko'chganda (ikonka-rasm + tartib bilan).
export const SHOP_CATEGORIES = ["Aksiya", "umumiy", "Uy anjomlari", "Parfumeriya", "Oziq-ovqat", "Elektronika", "Kiyim-kechak", "Bolalar uchun", "Go'zallik"] as const;
export const SHOP_LOW_STOCK = 5; // "kam qoldi" badge threshold

// ── 🛍 shop reviews: sharh + 👍/👎 + 2-3 rasm (Uzum pattern) ─────────────────────────────────────
export type ShopReviewThumb = "up" | "down";

export interface ShopReviewView {
  id: number;
  name: string; // first name only — small-town privacy
  thumb: ShopReviewThumb;
  text?: string | null;
  photoCount: number; // render /api/shop/review-photo/:id/:n for n < photoCount
  createdAt: string;
  mine: boolean;
  verified: boolean; // has a DELIVERED purchase of this product — "✅ Xarid qilgan"
}

export interface ShopReviewsResponse {
  likes: number;
  dislikes: number;
  reviews: ShopReviewView[];
  myThumb?: ShopReviewThumb | null;
}

export interface ShopReviewSubmitResponse {
  ok: boolean;
  reason?: "off" | "unavailable" | "bad_thumb" | "too_long" | "too_many_photos" | "bad_photo";
}

export const SHOP_REVIEW_MAX_PHOTOS = 3;
export const SHOP_REVIEW_MAX_TEXT = 280;

// ── 🍽 RESTORAN (feature "restoran") — R1: katalog o'qish only (savat/buyurtma R2'da) ─────────────
// Narx REAL SO'M (tanga emas, RESTORAN_PLAN D1). V1 = concierge: bu turlar faqat KO'RISH uchun.

export interface RestaurantView {
  id: number;
  name: string;
  category: string;
  address?: string | null;
  workHours?: string | null; // "09:00-22:00" — Ochiq/Yopiq client-side hisoblanadi (xizmatlar patterni)
  deliveryFeeSom: number;
  minOrderSom: number;
  pickupEnabled: boolean;
  prepMinutes: number;
  hasPhoto: boolean; // render /api/restoran/photo/:id when true
  avgRating: number;
  reviewCount: number;
  orderCount: number; // sotuv-quroli: "N buyurtma qabul qilingan"
}

export interface MenuItemView {
  id: number;
  section: string;
  name: string;
  desc?: string;
  priceSom: number;
  hasPhoto: boolean; // render /api/restoran/menuphoto/:id when true
  available: boolean;
}

export interface RestoranListResponse {
  restaurants: RestaurantView[];
}

export interface RestoranDetailResponse {
  restaurant: RestaurantView | null;
  items: MenuItemView[]; // client groups by `section` for display
}

// ── 🍽 RESTORAN R2 — savat + checkout + FoodOrder. Naqd/so'm to'lov (D1), CoinTxn YO'Q. ──────────

export interface FoodOrderCartItem {
  menuItemId: number;
  qty: number;
}

export interface FoodOrderCreateBody {
  restaurantId: number;
  items: FoodOrderCartItem[];
  address: string;
  contact: string;
  note?: string;
  isPickup?: boolean;
}

export interface FoodOrderCreateResponse {
  ok: boolean;
  reason?: "off" | "unavailable" | "paused" | "closed" | "empty_cart" | "bad_item" | "below_min" | "bad_address" | "pending_limit";
  orderId?: number;
  totalSom?: number;
}

export type FoodOrderStatus = "pending" | "accepted" | "preparing" | "delivering" | "delivered" | "rejected" | "cancelled_by_user";

export interface FoodOrderView {
  id: number;
  restaurantId: number;
  restaurantName: string;
  itemsJson: { menuItemId: number; name: string; qty: number; priceSom: number }[];
  itemsTotalSom: number;
  deliveryFeeSom: number;
  totalSom: number;
  isPickup: boolean;
  address: string;
  status: FoodOrderStatus;
  rejectReason?: string | null;
  createdAt: string;
}

// ── 🍽 RESTORAN R3 — admin sessiya-navbati + qo'lda holat-boshqaruv + SLA (RESTORAN_PLAN §2/§6) ──

export interface AdminFoodOrderRow {
  id: number;
  restaurantId: number;
  restaurantName: string;
  restaurantPhone: string;
  buyerName: string;
  contact: string;
  itemsJson: { menuItemId: number; name: string; qty: number; priceSom: number }[];
  itemsTotalSom: number;
  deliveryFeeSom: number;
  totalSom: number;
  isPickup: boolean;
  address: string;
  note: string;
  status: FoodOrderStatus;
  rejectReason: string | null;
  calledAt: string | null;
  ageMinutes: number; // "hozir necha daqiqadan beri" — admin panel SLA-rang shu bilan hisoblanadi
  createdAt: string;
}

// ── 🍽 RESTORAN qulayliklar: bekor qilish, qayta buyurtma, qidiruv/filtr, sharh ──────────────────

export interface RestaurantReviewView {
  id: number;
  memberName: string; // ism, faqat birinchi (xizmatlar/do'kon patterni)
  stars: number;
  text?: string | null;
  createdAt: string;
  mine: boolean;
}

export interface RestaurantReviewsResponse {
  avgRating: number;
  reviewCount: number;
  reviews: RestaurantReviewView[];
  myReview: RestaurantReviewView | null;
}

export interface RestaurantReviewSubmitResponse {
  ok: boolean;
  reason?: "off" | "unavailable" | "bad_stars" | "bad_text";
  avgRating?: number;
  reviewCount?: number;
}

// ── 🔎 XIZMATLAR (feature "xizmatlar") — Koson services directory ────────────────────────────────
// Read/search/call/review only — NO money shapes here by design.

export interface ServiceCategoryView {
  id: number;
  name: string;
  emoji: string;
  count: number; // active listings inside — proves the catalog is alive
}

export interface ServiceListingCard {
  id: number;
  name: string;
  categoryId: number;
  categoryName: string;
  categoryEmoji: string;
  tags: string;
  address?: string | null;
  workHours?: string | null;
  isVip: boolean;
  verified: boolean;
  avgRating: number; // 1 decimal, 0 = no reviews yet
  reviewCount: number;
  hasPhoto: boolean;
  photoCount: number;
  priceFrom?: number | null; // min preyskurant narxi — "25 000 so'mdan" (2GIS price-from)
  inspTotal?: number | null; // 🏅 «1067 tekshiruvi» 100-ballik audit natijasi — mijoz avgRating'dan MUSTAQIL
  inspTier?: "gold" | "silver" | "bronze" | null; // 60dan past yoki tekshirilmagan = null (belgi chiqmaydi)
  favCount: number; // ❤️ Like soni — OMMAVIY (viral: "N kishi like bosgan, siz ham bosing")
}

export interface ServicePriceView {
  label: string;
  priceSom: number;
}

export interface ServiceListingDetail extends ServiceListingCard {
  phone: string;
  phone2?: string | null;
  desc: string;
  callCount: number;
  viewCount: number;
  createdAt: string;
  myReview?: { stars: number; text: string } | null;
  prices: ServicePriceView[]; // preyskurant (bo'sh = ko'rsatilmaydi)
  isFav: boolean; // ❤️ shu foydalanuvchi like bosganmi (=saqlangan)
  geoLat?: number | null; // «Borish» tugmasi uchun
  geoLng?: number | null;
  instagram?: string | null;
  telegramUrl?: string | null;
  facebook?: string | null;
  website?: string | null;
  inspNote?: string | null; // 🏅 auditor xulosasi (faqat inspTotal bo'lsa mazmunli)
  inspAt?: string | null;
  inspBreakdown?: { clean: number; prof: number; price: number; trust: number; quality: number } | null; // to'liq 5-mezon taqsimoti
  claimable: boolean; // 🏪 "Bu meniki" tugmasi ko'rsatilsinmi (hali hech kim da'vo qilmagan)
  isMine: boolean; // shu foydalanuvchi allaqachon egasi
}

export interface ServiceReviewView {
  id: number;
  authorName: string;
  stars: number;
  text: string;
  createdAt: string;
  mine: boolean;
}

export interface ServiceSubmitBody {
  categoryId: number;
  name: string;
  phone: string;
  phone2?: string;
  desc?: string;
  tags?: string;
  address?: string;
  workHours?: string;
  instagram?: string;
  telegramUrl?: string;
  facebook?: string;
  website?: string;
}

export interface ServiceSubmitResponse {
  ok: boolean;
  reason?: "off" | "bad_name" | "bad_phone" | "bad_category" | "daily_limit" | "duplicate";
  id?: number;
}

export interface ServiceReviewResponse {
  ok: boolean;
  reason?: "off" | "bad_stars" | "not_found" | "too_long";
  avgRating?: number;
  reviewCount?: number;
}

export const SERVICE_SUBMITS_PER_DAY = 2; // self-submit spam cap per Telegram user
export const SERVICE_MAX_PHOTOS = 6; // gallery cap (shop pattern is 5; profiles feel richer with 6)

// ── 📋 E'LONLAR (feature "elonlar") — mahalla e'lon taxtasi (OLX-uslub, ELONLAR_PLAN.md) ─────────
// Narx REAL SO'M (tanga EMAS); joylash tanga bilan to'lanadi (knob elonPostPrice, §6).

export type ClassifiedCategory = "oldi_sotdi" | "ish" | "yoqoldi" | "uyjoy" | "transport";

export interface ClassifiedCategoryDef {
  id: ClassifiedCategory;
  label: string;
  emoji: string;
  accent: string; // §4.1 kategoriya aksenti (yoqoldi 2-holatli — UI o'zi qizil/yashil tanlaydi)
  subtypes: [string, string]; // [A, B] segment-toggle jufti
  subtypeLabels: [string, string];
  priced: boolean; // false = yoqoldi — narx maydoni umuman yo'q, doim bepul
}

export const CLASSIFIED_CATEGORIES: ClassifiedCategoryDef[] = [
  { id: "oldi_sotdi", label: "Oldi-sotdi", emoji: "🛒", accent: "#c2622f", subtypes: ["sotaman", "olaman"], subtypeLabels: ["Sotaman", "Olaman"], priced: true },
  { id: "ish", label: "Ish", emoji: "💼", accent: "#5b6b7a", subtypes: ["beraman", "izlayman"], subtypeLabels: ["Ish beraman", "Ish izlayman"], priced: true },
  { id: "yoqoldi", label: "Yo'qoldi–Topildi", emoji: "🔍", accent: "#c2622f", subtypes: ["yoqoldi", "topildi"], subtypeLabels: ["Yo'qoldi", "Topildi"], priced: false },
  { id: "uyjoy", label: "Uy-joy", emoji: "🏠", accent: "#b08a3e", subtypes: ["ijara", "sotuv"], subtypeLabels: ["Ijara", "Sotuv"], priced: true },
  { id: "transport", label: "Transport & chorva", emoji: "🚜", accent: "#6f7d4a", subtypes: ["mashina", "molhol"], subtypeLabels: ["Mashina", "Mol-hol"], priced: true },
];
export function classifiedCategoryDef(id: string): ClassifiedCategoryDef | null {
  return CLASSIFIED_CATEGORIES.find((c) => c.id === id) ?? null;
}

export type ClassifiedStatus = "pending" | "active" | "sold" | "rejected" | "archived" | "expired";

export interface ClassifiedCard {
  id: number;
  category: ClassifiedCategory;
  subtype: string;
  title: string;
  priceSom: number | null; // null = "Kelishiladi"
  isTop: boolean;
  hasPhoto: boolean;
  photoCount: number;
  createdAt: string;
  isNew: boolean; // <1 soat — "Yangi" pulse-nuqta (§4.1)
}

export interface ClassifiedDetail extends ClassifiedCard {
  desc: string;
  phone: string;
  authorName: string;
  viewCount: number;
  callCount: number;
  owner: ClassifiedOwnerProfile;
  likeCount: number;
  dislikeCount: number;
  myReaction: "like" | "dislike" | null;
}

export interface ClassifiedReactBody {
  kind: "like" | "dislike";
  comment?: string; // dislike uchun majburiy (>=3 belgi)
}

export interface ClassifiedReactResponse {
  ok: boolean;
  reason?: "off" | "bad_kind" | "need_comment" | "banned_word" | "not_found";
  likeCount?: number;
  dislikeCount?: number;
  myReaction?: "like" | "dislike" | null;
}

export interface AdminAdReactionRow {
  id: number;
  tgId: string;
  authorName: string;
  kind: "like" | "dislike";
  comment: string;
  at: string;
}

// 🤝 Ishonch badge'lari (§4.2) — xatti-harakat asosida, pul-mexanika YO'Q
export interface ClassifiedOwnerProfile {
  memberSince: string | null; // member.createdAt — "N oydan beri 1067'da"
  rideCount: number; // 🚗 N marta safar qilgan
  soldCount: number; // 🤝 N muvaffaqiyatli savdo
  isNewMember: boolean; // ⚠️ <7 kun VA 0 safar — yumshoq ogohlantirish
  activeAdsCount: number;
  username: string | null; // ✍️ "Yozish" t.me deep-link uchun (yo'q bo'lsa tugma yashiriladi)
}

export interface ClassifiedSubmitBody {
  category: ClassifiedCategory;
  subtype: string;
  title: string;
  desc?: string;
  priceSom?: number | null;
  phone?: string; // bo'sh = member.phone (default)
}

export interface ClassifiedSubmitResponse {
  ok: boolean;
  reason?: "off" | "bad_category" | "bad_subtype" | "bad_title" | "bad_price" | "no_phone" | "insufficient" | "max_active" | "banned_word" | "unavailable";
  id?: number;
  paidCoins?: number;
  balance?: number;
}

// ── E3: admin moderatsiya + community report (§5) ────────────────────────────────────────────────

export interface ClassifiedReportResponse {
  ok: boolean;
  hidden?: boolean; // 3-report chegarasiga yetdi → status pending'ga qaytdi (qayta moderatsiya)
}

export interface AdminClassifiedOwnerInfo {
  tgId: string;
  name: string;
  phone: string | null;
  activeAdsCount: number;
}

export interface AdminClassifiedRow {
  id: number;
  category: ClassifiedCategory;
  subtype: string;
  title: string;
  desc: string;
  phone: string; // ad's own contact number — may differ from owner.phone (member's registered phone)
  priceSom: number | null;
  status: ClassifiedStatus;
  paidCoins: number;
  hasPhoto: boolean;
  photoCount: number;
  viewCount: number; // AdView jami soni (cache)
  contactCount: number; // AdContact jami soni (cache)
  likeCount: number;
  dislikeCount: number;
  reports: number;
  owner: AdminClassifiedOwnerInfo;
  createdAt: string;
  expiresAt: string;
  pendingMinutes: number | null; // faqat status=pending — SLA hisoblagichi uchun
  isTop: boolean;
  topUntil: string | null;
}

export interface AdminClassifiedListResponse {
  rows: AdminClassifiedRow[];
  pending: number;
  active: number;
  todayViews: number;
  todayCoins: number; // bugungi joylashdan tushgan tanga
}

export interface AdminAdViewerRow {
  tgId: string;
  name: string;
  at: string;
}

export interface AdminAdContactRow {
  tgId: string;
  name: string;
  kind: "call" | "message";
  at: string;
}

// ── E4: TOP boost (tanga-sink) — §6 ───────────────────────────────────────────────────────────────
export interface ClassifiedTopBuyResponse {
  ok: boolean;
  reason?: "off" | "not_found" | "not_owner" | "not_active" | "insufficient" | "elontop_off";
  topUntil?: string;
  balance?: number;
}

export interface ClassifiedListResponse {
  ads: ClassifiedCard[];
  total: number;
}

export interface MyClassifiedRow {
  id: number;
  category: ClassifiedCategory;
  subtype: string;
  title: string;
  priceSom: number | null;
  status: ClassifiedStatus;
  viewCount: number;
  callCount: number;
  paidCoins: number;
  isTop: boolean; // §6 TOP boost — 24 soat faol
  topUntil: string | null;
  expiresAt: string;
  createdAt: string;
}

export const CLASSIFIED_MAX_PHOTOS = 4; // §4 post wizard: foto 0-4
export const CLASSIFIED_AD_DAYS = 30; // §7 expiresAt = createdAt + 30 kun
