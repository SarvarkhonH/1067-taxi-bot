// Gamification engine — shared by the bot, the API and both web apps.
// Works for two member types mirrored out of kas1067:
//   • client  → gamifies the passenger loyalty "bonus" + ride count
//   • driver  → gamifies the driver "balance" (earnings) + trips + rating
// In both cases "points" is the headline metric that drives XP / levels / rank.

export type MemberType = "client" | "driver";

/** Human label for the headline metric of each member type. */
export function metricLabel(type: MemberType): string {
  return type === "client" ? "Bonus" : "Balans";
}

export interface Level {
  index: number;
  name: string;
  emoji: string;
  minXp: number; // inclusive lower bound of this level
  color: string; // hex, used by the web apps
}

// Tune thresholds per real kas1067 scale (clients and drivers may differ — see
// LEVELS_BY_TYPE if you need separate ladders later).
export const LEVELS: Level[] = [
  { index: 0, name: "Yangi", emoji: "🌱", minXp: 0, color: "#9CA3AF" },
  { index: 1, name: "Bronza", emoji: "🥉", minXp: 500, color: "#CD7F32" },
  { index: 2, name: "Kumush", emoji: "🥈", minXp: 2000, color: "#9CA3AF" },
  { index: 3, name: "Oltin", emoji: "🥇", minXp: 5000, color: "#F59E0B" },
  { index: 4, name: "Platina", emoji: "💎", minXp: 12000, color: "#22D3EE" },
  { index: 5, name: "Olmos", emoji: "💠", minXp: 25000, color: "#60A5FA" },
  { index: 6, name: "Afsona", emoji: "👑", minXp: 50000, color: "#A855F7" },
];

export interface MemberStats {
  points: number; // bonus (client) | balance (driver)
  trips: number; // bookingCount (client) | takeBookingCount (driver)
  rating: number; // driver rating 0..5; 0 for clients
  rank: number | null; // 1-based position on the (type-scoped) leaderboard
  ballPoints?: number; // 🏅 game-only XP from daily-task completion (feature "tierloyalty"); decayable; additive to XP
}

// XP: points are the backbone, trips add a little flavour. ballPoints (tierloyalty) adds on top.
export function computeXp(s: Pick<MemberStats, "points" | "trips"> & { ballPoints?: number }): number {
  return Math.round(s.points + s.trips * 2 + (s.ballPoints ?? 0));
}

export interface LevelProgress {
  level: Level;
  next: Level | null;
  xp: number;
  xpIntoLevel: number;
  xpForNext: number | null;
  progress: number; // 0..1 toward next level (1 when maxed)
}

export function levelForXp(xp: number): LevelProgress {
  let level = LEVELS[0]!;
  for (const l of LEVELS) {
    if (xp >= l.minXp) level = l;
    else break;
  }
  const next = LEVELS[level.index + 1] ?? null;
  const xpIntoLevel = xp - level.minXp;
  const xpForNext = next ? next.minXp - level.minXp : null;
  const progress = next && xpForNext ? Math.min(1, xpIntoLevel / xpForNext) : 1;
  return { level, next, xp, xpIntoLevel, xpForNext, progress };
}

// ─── Badges / achievements ───────────────────────────────────
export interface BadgeDef {
  code: string;
  name: string;
  emoji: string;
  description: string;
  types: MemberType[]; // which member types can earn it
  check: (s: MemberStats) => boolean;
}

const BOTH: MemberType[] = ["client", "driver"];

export const BADGES: BadgeDef[] = [
  { code: "first_points", name: "Boshlanish", emoji: "🎉", description: "Birinchi balllaringizni oldingiz", types: BOTH, check: (s) => s.points > 0 },
  { code: "trips_10", name: "10 safar", emoji: "🚕", description: "10 ta safar", types: BOTH, check: (s) => s.trips >= 10 },
  { code: "trips_100", name: "100 safar", emoji: "🚗", description: "100 ta safar", types: BOTH, check: (s) => s.trips >= 100 },
  { code: "trips_500", name: "500 safar", emoji: "🏎️", description: "500 ta safar", types: BOTH, check: (s) => s.trips >= 500 },
  { code: "trips_1000", name: "1000 safar", emoji: "🏁", description: "1000 ta safar marrasi", types: BOTH, check: (s) => s.trips >= 1000 },
  { code: "points_1k", name: "1K klubi", emoji: "✨", description: "1 000+ ball to'pladingiz", types: BOTH, check: (s) => s.points >= 1000 },
  { code: "points_10k", name: "10K klubi", emoji: "💰", description: "10 000+ ball to'pladingiz", types: BOTH, check: (s) => s.points >= 10000 },
  { code: "points_50k", name: "50K klubi", emoji: "💎", description: "50 000+ ball — afsonaviy!", types: BOTH, check: (s) => s.points >= 50000 },
  { code: "rating_5", name: "Reyting yulduzi", emoji: "⭐", description: "Reyting 4.9+ ushlab turibsiz", types: ["driver"], check: (s) => s.rating >= 4.9 },
  { code: "top3", name: "Top-3", emoji: "🥇", description: "Reytingda Top-3 ga kirdingiz", types: BOTH, check: (s) => s.rank !== null && s.rank <= 3 },
  { code: "champion", name: "Chempion", emoji: "🏆", description: "Reytingda 1-o'rin", types: BOTH, check: (s) => s.rank === 1 },
];

export function badgesForType(type: MemberType): BadgeDef[] {
  return BADGES.filter((b) => b.types.includes(type));
}

export function earnedBadges(type: MemberType, s: MemberStats): BadgeDef[] {
  return badgesForType(type).filter((b) => b.check(s));
}

export function badgeByCode(code: string): BadgeDef | undefined {
  return BADGES.find((b) => b.code === code);
}

// ─── daily streak ─────────────────────────────────────────────
// Real cashback (so'm) paid when a daily-check-in streak reaches these days.
// Rebalanced to unit economics: company nets ~2000 so'm/ride — every reward
// number in the system is sized against that (industry norm: 0.6-3% of fare).
// Day 2 pays a small hook (gamification audit: the 1→3 gap left day 2 with zero feedback, so a
// 2-day habit never formed). The company nets ~2000 so'm/ride now, so a 50-so'm day-2 nudge is noise.
export const STREAK_REWARDS: Record<number, number> = {
  2: 50,
  3: 100,
  7: 300,
  14: 700,
  30: 2000,
  60: 5000,
  100: 10000,
};

export function streakReward(day: number): number {
  return STREAK_REWARDS[day] ?? 0;
}

// ─── spin the wheel (variable-ratio reward) ───────────────────
export interface WheelPrize {
  label: string;
  emoji: string;
  amount: number; // so'm cashback (0 = no money prize)
  weight: number; // relative probability
  color: string;
}

// In-ride wheel: EVERY spin wins (no losing slice — legal posture + better
// psychology), no paid entry anywhere. EV = (40·42+50·30+100·17+200·7+500·3)/99
// ≈ 79 so'm — inside the ≤80 target.
export const WHEEL_PRIZES: WheelPrize[] = [
  { label: "40 so'm", emoji: "🪙", amount: 40, weight: 42, color: "#9CA3AF" },
  { label: "50 so'm", emoji: "💵", amount: 50, weight: 30, color: "#CD7F32" },
  { label: "100 so'm", emoji: "💰", amount: 100, weight: 17, color: "#F59E0B" },
  { label: "200 so'm", emoji: "💎", amount: 200, weight: 7, color: "#22D3EE" },
  { label: "500 so'm", emoji: "🔥", amount: 500, weight: 3, color: "#A855F7" },
];

// ─── mystery box (perfect-day meta reward) ────────────────────
// Unlocks only when ALL daily missions are completed → compulsion loop on top
// of the quest loop (Octalysis: Unpredictability; "perfect day" completion).
export interface BoxPrize {
  label: string;
  emoji: string;
  amount: number; // so'm cashback
  weight: number;
}

// EV ≈ 200 so'm per perfect day (ride-anchored via daily_ride mission).
export const BOX_PRIZES: BoxPrize[] = [
  { label: "100 so'm", emoji: "🪙", amount: 100, weight: 50 },
  { label: "200 so'm", emoji: "💵", amount: 200, weight: 28 },
  { label: "300 so'm", emoji: "💰", amount: 300, weight: 14 },
  { label: "500 so'm", emoji: "💎", amount: 500, weight: 6 },
  { label: "SUPER 1000", emoji: "👑", amount: 1000, weight: 2 },
];

export function nextStreakMilestone(day: number): { day: number; reward: number } | null {
  const days = Object.keys(STREAK_REWARDS)
    .map(Number)
    .sort((a, b) => a - b);
  const next = days.find((d) => d > day);
  return next ? { day: next, reward: STREAK_REWARDS[next]! } : null;
}
