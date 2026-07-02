// Daily / weekly quests. Definitions live here (like BADGES); per-member
// progress is tracked server-side per period (tashkent day or ISO week).
//
// Psychology: Octalysis Accomplishment + Scarcity (resets create urgency),
// Kahneman goal-gradient (progress bar pulls toward the finish), endowed
// progress. Each completion pays REAL cashback on claim.

export type MissionPeriod = "daily" | "weekly";

export interface MissionDef {
  audience?: "client" | "driver"; // default client
  code: string;
  title: string;
  emoji: string;
  period: MissionPeriod;
  target: number;
  reward: number; // tanga cashback paid when claimed
  // CORE daily missions gate the mystery box + the daily-kombo boost.
  // A `core: false` daily is a BONUS quest: claimable on its own, but NOT required
  // for the box/kombo — so a car-less rider is never locked out.
  core?: boolean;
  // rotatable: true → belongs to the daily BONUS pool (2 shown per day, deterministic by day key).
  // rotatable: false (default) → always shown.
  rotatable?: boolean;
}

// Always-shown client daily core missions (gate the mystery box + kombo).
const DAILY_CORE: MissionDef[] = [
  { code: "daily_checkin", title: "Bugun belgilab chiqing", emoji: "🔥", period: "daily", target: 1, reward: 50 },
  { code: "daily_ride", title: "1 ta safar qiling", emoji: "🚕", period: "daily", target: 1, reward: 100 },
];

// Rotatable bonus pool — pick 2 per day (deterministic: dayKey hash → indices).
// Adding a new entry here never breaks existing progress: codes are stable, progress tracked by code.
const DAILY_BONUS_POOL: MissionDef[] = [
  { code: "daily_spin",    title: "Safarda g'ildirak aylantiring", emoji: "🎡", period: "daily", target: 1, reward: 50,  core: false, rotatable: true },
  { code: "daily_rate",    title: "Haydovchini baholang",           emoji: "⭐", period: "daily", target: 1, reward: 80,  core: false, rotatable: true },
  { code: "daily_2rides",  title: "Bugun 2 ta safar qiling",        emoji: "🚕", period: "daily", target: 2, reward: 180, core: false, rotatable: true },
  { code: "daily_morning", title: "Ertalab 7–10 da safar",          emoji: "🌅", period: "daily", target: 1, reward: 120, core: false, rotatable: true },
  { code: "daily_share",   title: "Safar yo'lini do'stga ulashing", emoji: "🔗", period: "daily", target: 1, reward: 80,  core: false, rotatable: true },
  { code: "daily_streak",  title: "3 kun ketma-ket kiring",         emoji: "🔥", period: "daily", target: 3, reward: 200, core: false, rotatable: true },
];

// All missions flat (for missionByCode lookups and server incrementMission).
export const MISSIONS: MissionDef[] = [
  ...DAILY_CORE,
  ...DAILY_BONUS_POOL,
  { code: "weekly_rides",  title: "Haftada 5 ta safar",  emoji: "🏁", period: "weekly", target: 5,  reward: 700 },
  { code: "weekly_10",     title: "Haftada 10 ta safar", emoji: "🏆", period: "weekly", target: 10, reward: 2000 },
  { code: "weekly_invite", title: "Do'st taklif qiling", emoji: "👥", period: "weekly", target: 1,  reward: 1000 },
  // driver quests
  { code: "drv_daily_5",   title: "Bugun 5 safar",    emoji: "🚖", period: "daily",  target: 5,  reward: 800,   audience: "driver" },
  { code: "drv_weekly_25", title: "Haftada 25 safar", emoji: "🏁", period: "weekly", target: 25, reward: 5000,  audience: "driver" },
  { code: "drv_weekly_40", title: "Haftada 40 safar", emoji: "🏆", period: "weekly", target: 40, reward: 12000, audience: "driver" },
];

export function missionByCode(code: string): MissionDef | undefined {
  return MISSIONS.find((m) => m.code === code);
}

// Simple deterministic day hash (djb2-lite, string → number).
function dayHash(dayKey: string): number {
  let h = 5381;
  for (let i = 0; i < dayKey.length; i++) h = (h * 33) ^ dayKey.charCodeAt(i);
  return h >>> 0; // unsigned 32-bit
}

// Returns the 4 client daily missions to show on a given day:
// 2 core (always) + 2 bonus (deterministic from pool by dayKey).
export function getDailyClientMissions(dayKey: string): MissionDef[] {
  const pool = DAILY_BONUS_POOL;
  const h = dayHash(dayKey);
  const i1 = h % pool.length;
  const i2 = (h >> 4) % pool.length;
  const bonus = i1 === i2
    ? [pool[i1]!, pool[(i1 + 1) % pool.length]!]
    : [pool[i1]!, pool[i2]!];
  return [...DAILY_CORE, ...bonus];
}

export interface MissionView {
  code: string;
  title: string;
  emoji: string;
  period: MissionPeriod;
  target: number;
  reward: number;
  progress: number;
  claimable: boolean; // progress >= target && !claimed
  claimed: boolean;
}

export interface MissionsResponse {
  daily: MissionView[];
  weekly: MissionView[];
}

export interface MissionClaimResponse {
  ok: boolean;
  reason?: "not_complete" | "claimed" | "not_found";
  reward: number;
  applied: boolean; // written to kas1067 as real money
}
