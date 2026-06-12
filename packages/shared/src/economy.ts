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

// NOTE: paid respins and the premium box were REMOVED deliberately —
// paying coins for a chance outcome is the gambling pattern Uzbek authorities
// flagged (Hamster Kombat precedent). Chance rewards are only ever EARNED by
// riding; coin sinks are deterministic purchases (Garaj, Kolleksiya, Bozor).

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
export const RIDE_REWARD_BASE = 100; // fixed roll base (so'm) — sized to 2000/ride net
export const RIDE_JACKPOT_FEED = 50; // every completed ride grows the pool
export const DRIVER_RIDE_BONUS = 100; // flat per-trip driver thank-you
export const DRIVER_DAILY_BONUS_CAP = 10000;
// Hard ceiling on the TOTAL client-side coin emission of ONE ride (roll ×
// boosts + wheel + garage + guesses). Individual mechanics can be correct yet
// COMBINE over budget — the clamp cuts the excess at grant time.
export const RIDE_EMISSION_CAP = 350;

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
