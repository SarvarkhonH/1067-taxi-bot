// Dual-wallet economy.
//
//   🚕 Cashback (so'm)  — ride money only, lives in kas1067 (Member.points)
//   🪙 Coin             — game money, lives in OUR DB (Member.coins + CoinTxn)
//
// 1 coin = 1 so'm. Coins flow freely in games (no caps); real money leaves the
// system ONLY through withdraw (coin -> kas1067 bonus), where the safety
// limits live.

export const COIN_PER_SOM = 1;

export const WITHDRAW_MIN = 5000; // min coins per conversion (coin → cashback)
export const WITHDRAW_DAILY_CAP = 50000; // max so'm leaving per member per day
export const TOPUP_MIN = 1000; // min bonus to move INTO coins (cashback → coin)

// Sinks (what coins buy) — these recycle coins back into the economy.
export const WHEEL_RESPIN_COST = 500; // > wheel EV (~350) so respins are a SINK, not a +EV money-mint
export const BOX_PREMIUM_COST = 2000; // unlimited premium boxes

// Premium box paytable (~94% RTP — generous but sustainable).
export const BOX_PRIZES_PREMIUM: { label: string; emoji: string; amount: number; weight: number }[] = [
  { label: "800 coin", emoji: "🪙", amount: 800, weight: 45 },
  { label: "1500 coin", emoji: "💵", amount: 1500, weight: 28 },
  { label: "2500 coin", emoji: "💰", amount: 2500, weight: 16 },
  { label: "5000 coin", emoji: "💎", amount: 5000, weight: 8 },
  { label: "MEGA 10000", emoji: "👑", amount: 10000, weight: 3 },
];

export interface CoinTxnView {
  amount: number;
  kind: string;
  reason: string;
  at: string;
}

export interface WalletResponse {
  coins: number; // game balance
  cashback: number; // ride balance (kas points)
  withdrawnToday: number;
  withdrawMin: number;
  withdrawDailyCap: number;
  canWithdraw: boolean;
  topupMin: number; // min cashback to convert INTO coins
  canTopup: boolean; // cashback >= topupMin
  txns: CoinTxnView[];
}

export interface WithdrawResponse {
  ok: boolean;
  reason?: "below_min" | "daily_cap" | "insufficient" | "not_client" | "kas_failed" | "no_ride";
  amount: number;
  coinsLeft: number;
  kasApplied: boolean;
}
