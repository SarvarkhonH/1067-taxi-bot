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
  reward: number; // so'm cashback paid when claimed
  // CORE daily missions (default) gate the mystery box + the daily-kombo boost.
  // A `core: false` daily is a BONUS quest: claimable on its own, but NOT required
  // for the box/kombo — so an optional task (e.g. garage, which needs owning a car)
  // can never lock a car-less rider out of the box or the kombo.
  core?: boolean;
}

export const MISSIONS: MissionDef[] = [
  { code: "daily_checkin", title: "Bugun belgilab chiqing", emoji: "🔥", period: "daily", target: 1, reward: 50 },
  { code: "daily_spin", title: "Safarda g'ildirak aylantiring", emoji: "🎡", period: "daily", target: 1, reward: 50 },
  { code: "daily_ride", title: "1 ta safar qiling", emoji: "🚕", period: "daily", target: 1, reward: 100 },
  { code: "daily_garage", title: "Garaj mashinangiz pul ishlasin", emoji: "🏎", period: "daily", target: 1, reward: 80, core: false },
  { code: "weekly_rides", title: "Haftada 5 ta safar", emoji: "🏁", period: "weekly", target: 5, reward: 700 },
  { code: "weekly_invite", title: "Do'st taklif qiling", emoji: "👥", period: "weekly", target: 1, reward: 1000 },
  // driver quests (Lyft Ride Challenge scale; completed-count only — no
  // acceptance tracking = no Uber sunk-cost backlash)
  { code: "drv_daily_5", title: "Bugun 5 safar", emoji: "🚖", period: "daily", target: 5, reward: 800, audience: "driver" },
  { code: "drv_weekly_25", title: "Haftada 25 safar", emoji: "🏁", period: "weekly", target: 25, reward: 5000, audience: "driver" },
  { code: "drv_weekly_40", title: "Haftada 40 safar", emoji: "🏆", period: "weekly", target: 40, reward: 12000, audience: "driver" },
];

export function missionByCode(code: string): MissionDef | undefined {
  return MISSIONS.find((m) => m.code === code);
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
