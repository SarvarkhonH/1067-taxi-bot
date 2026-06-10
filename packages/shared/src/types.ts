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
  wheelAvailable: boolean; // free spin still available today
  jackpot: number; // current escalating wheel jackpot
  coins: number; // game-wallet balance (1 coin = 1 so'm)
  leagueTier: string; // Bronza | Kumush | Oltin | Platina | Olmos
}

export interface CheckInResponse {
  alreadyChecked: boolean;
  current: number;
  longest: number;
  rewardAmount: number;
  rewardApplied: boolean;
  next: { day: number; reward: number } | null;
}

export interface WheelSpinResponse {
  alreadySpun: boolean;
  prize: { label: string; emoji: string; amount: number };
  applied: boolean;
  jackpot: number; // pool value after this spin
  paid: boolean; // coin respin
  insufficient?: boolean; // respin requested, not enough coins
  respinCost: number;
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
  premiumCost: number; // coins per premium box (unlimited)
}

export interface BoxOpenResponse {
  ok: boolean;
  reason?: "locked" | "opened" | "insufficient";
  prize: { label: string; emoji: string; amount: number } | null;
  applied: boolean;
  premium: boolean;
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
