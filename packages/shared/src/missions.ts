// Daily / weekly quests. Definitions live here (like BADGES); per-member
// progress is tracked server-side per period (tashkent day or ISO week).
//
// Psychology: Octalysis Accomplishment + Scarcity (resets create urgency),
// Kahneman goal-gradient (progress bar pulls toward the finish), endowed
// progress. Each completion pays REAL cashback on claim.

export type MissionPeriod = "daily" | "weekly";

export interface MissionDef {
  code: string;
  title: string;
  emoji: string;
  period: MissionPeriod;
  target: number;
  reward: number; // so'm cashback paid when claimed
}

export const MISSIONS: MissionDef[] = [
  { code: "daily_checkin", title: "Bugun belgilab chiqing", emoji: "🔥", period: "daily", target: 1, reward: 200 },
  { code: "daily_spin", title: "G'ildirakni aylantiring", emoji: "🎡", period: "daily", target: 1, reward: 200 },
  { code: "daily_ride", title: "1 ta safar qiling", emoji: "🚕", period: "daily", target: 1, reward: 500 },
  { code: "weekly_rides", title: "Haftada 5 ta safar", emoji: "🏁", period: "weekly", target: 5, reward: 3000 },
  { code: "weekly_invite", title: "Do'st taklif qiling", emoji: "👥", period: "weekly", target: 1, reward: 3000 },
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
