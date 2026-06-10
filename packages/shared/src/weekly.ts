// Weekly engagement league + surprise drops.
//
// Psychology: the league is a fresh-start competition every Monday (Cialdini:
// Social Proof + competition; Kahneman: fresh-start effect — last week's loss
// doesn't discourage, everyone restarts at 0). Surprise drops are variable-
// INTERVAL reinforcement (Reciprocity: an unearned gift creates debt).

/** Points each bot action adds to the current week's score. */
export const SCORE_VALUES = {
  checkin: 10,
  spin: 10,
  mission: 15,
  box: 20,
  ride: 30,
  referral: 50,
} as const;

export type ScoreKind = keyof typeof SCORE_VALUES;

/** Real-cashback prizes for the top-3 of a closed week. */
export const WEEKLY_PRIZES: { rank: number; amount: number; medal: string }[] = [
  { rank: 1, amount: 10000, medal: "🥇" },
  { rank: 2, amount: 5000, medal: "🥈" },
  { rank: 3, amount: 3000, medal: "🥉" },
];

/** Random unearned gifts pushed to active linked users (variable interval). */
export const SURPRISE_PRIZES: { amount: number; weight: number }[] = [
  { amount: 200, weight: 50 },
  { amount: 300, weight: 25 },
  { amount: 500, weight: 15 },
  { amount: 1000, weight: 10 },
];

export interface WeeklyEntry {
  rank: number;
  memberId: number;
  fullName: string;
  score: number;
  isMe: boolean;
}

export interface WeeklyBoardResponse {
  weekKey: string;
  daysLeft: number; // days until the week closes (Monday payout)
  prizes: typeof WEEKLY_PRIZES;
  entries: WeeklyEntry[];
  me: WeeklyEntry | null;
}
