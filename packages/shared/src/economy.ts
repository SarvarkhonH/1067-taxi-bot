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
  reason?: "below_min" | "daily_cap" | "insufficient" | "not_client" | "kas_failed" | "no_ride" | "risk_hold";
  amount: number;
  coinsLeft: number;
  kasApplied: boolean;
}

// ── 🎲 variable ride-cashback (the book's 80/15/4/1 — Hooked variable reward) ─
// Multiplier is applied to the ride's fare-derived base bonus and granted as
// COINS (never direct kas money). Jackpot pays the whole shared pool.
export const RIDE_REWARD_TIERS: { tier: "standard" | "double" | "triple" | "jackpot"; mult: number; weight: number; label: string }[] = [
  { tier: "standard", mult: 1, weight: 80, label: "Cashback" },
  { tier: "double", mult: 2, weight: 15, label: "2x DOUBLE" },
  { tier: "triple", mult: 3, weight: 4, label: "3x TRIPLE" },
  { tier: "jackpot", mult: 0, weight: 1, label: "JACKPOT" }, // pays the pool instead
];
export const RIDE_JACKPOT_FEED = 50; // every completed ride grows the pool
export const DRIVER_RIDE_BONUS = 250; // flat per-trip driver thank-you (≤ ~2000 net profit/order)
export const DRIVER_DAILY_BONUS_CAP = 20000;

// ── P2P transfer (closed-loop: coins MOVE, never mint) ───────────────────────
// Anti-funnel walls: two-sided daily caps (received-cap < withdraw-cap so
// funneling coins into a mule grants ZERO extra cash-out), small burn shrinks
// supply on every hop, counterparty fan-out capped, fresh accounts locked out.
export const TRANSFER_MIN = 500;
export const TRANSFER_MAX_PER_TX = 20000;
export const TRANSFER_DAILY_SENT = 30000;
export const TRANSFER_DAILY_RECEIVED = 30000;
export const TRANSFER_MAX_COUNTERPARTIES = 5; // distinct recipients per day (tips exempt)
export const TRANSFER_MIN_ACCOUNT_AGE_H = 48; // sender must be linked this long
export const TRANSFER_BURN_RATE = 0.02; // destroyed on every transfer

export interface TransferResponse {
  ok: boolean;
  reason?:
    | "below_min"
    | "over_max"
    | "insufficient"
    | "daily_sent_cap"
    | "daily_received_cap"
    | "too_many_recipients"
    | "account_too_new"
    | "self"
    | "ring"
    | "not_found"
    | "failed";
  amount: number; // debited from sender
  received: number; // credited to recipient (amount - burn)
  burn: number;
  coinsLeft: number; // sender balance after
  toName?: string;
}
