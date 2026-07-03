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
  totalMembers: number;
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
  lastActive: string;
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
