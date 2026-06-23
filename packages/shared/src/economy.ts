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
  isClient: boolean; // only clients cash tanga out to so'm — drivers convert/transfer only
  topupMin: number; // min cashback to convert INTO coins
  canTopup: boolean; // cashback >= topupMin
  commissionPct: number; // live transfer/pay commission % (0 when the "komissiya" flag is off)
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
export const DRIVER_RIDE_BONUS = 100; // legacy flat (superseded by tier rebate)
export const DRIVER_DAILY_BONUS_CAP = 10000;
// Weekly tier rebate per completed ride (commission-discount equivalent we
// fully control). Tiers recomputed every Monday from MEASURED percentiles.
export const DRIVER_TIER_REBATE: Record<string, number> = { Bronza: 0, Kumush: 50, Oltin: 100, Olmos: 200 };
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
export const TRANSFER_MAX_COUNTERPARTIES = 5; // distinct recipients per day (driver tips/fares exempt)
export const TRANSFER_MIN_ACCOUNT_AGE_H = 48; // sender must be linked this long
export const TRANSFER_BURN_RATE = 0.02; // legacy (kept for back-compat; commission replaces it when the flag is on)
// A real ride FARE can far exceed the P2P friend cap, and pays a VETTED kas driver — so the
// fare kind gets its own high ceiling and bypasses the anti-mule walls (the driver recipient
// is a kas identity, not a farm mule; the withdraw gate still bounds real money out).
export const FARE_MAX_PER_TX = 200000;

// ── 💸 dashboard-configurable transfer commission (owner-tunable, like MOTOR_ECON_KNOBS) ─────
// commissionPct is a PERCENT (1 = 1%), charged ON TOP of the amount to the SENDER; the recipient
// receives the full amount and the fee is booked to the PlatformLedger. Gated by the "komissiya"
// feature flag (DEFAULT_OFF) so it ships dark until owner QABUL.
export interface TransferEconKnob { key: string; label: string; def: number; min: number; max: number; step: number }
export const TRANSFER_ECON_KNOBS: TransferEconKnob[] = [
  { key: "commissionPct", label: "💸 Komissiya (%) — har o'tkazma/to'lov", def: 1.0, min: 0, max: 10, step: 0.1 },
];
export function transferEconDefaults(): Record<string, number> {
  return Object.fromEntries(TRANSFER_ECON_KNOBS.map((k) => [k.key, k.def]));
}
export function clampTransferEcon(key: string, val: number): number {
  const k = TRANSFER_ECON_KNOBS.find((x) => x.key === key);
  if (!k || isNaN(val)) return k?.def ?? val;
  return Math.max(k.min, Math.min(k.max, val));
}

// ── 🎁 dashboard-configurable acquisition bonuses (owner-tunable, like MOTOR_ECON_KNOBS) ──────
// The growth levers the owner tunes WITHOUT a deploy. `firstRide` is the single first-ride bonus
// (welcome + referee + recruit-welcome all read it); the rest are the per-flow sharer rewards.
// Defaults match the shipped code constants (REFEREE_REWARD=5000, REFERRER_REWARD=1500, …).
export interface BonusEconKnob { key: string; label: string; def: number; min: number; max: number; step: number }
export const BONUS_ECON_KNOBS: BonusEconKnob[] = [
  { key: "firstRide", label: "🎁 Birinchi safar bonusi (tanga)", def: 5000, min: 0, max: 20000, step: 500 },
  { key: "referrer", label: "👥 Do'st taklif — taklif qilganga (tanga)", def: 1500, min: 0, max: 20000, step: 250 },
  { key: "recruitFirst", label: "🚖 Mijoz QR — haydovchiga 1-safar (tanga)", def: 500, min: 0, max: 10000, step: 100 },
  { key: "drvMilestone", label: "🚖 Haydovchi→haydovchi mukofot (tanga)", def: 5000, min: 0, max: 50000, step: 500 },
  { key: "drvRides", label: "🚖 Haydovchi→haydovchi — necha safar", def: 10, min: 1, max: 50, step: 1 },
];
export function bonusEconDefaults(): Record<string, number> {
  return Object.fromEntries(BONUS_ECON_KNOBS.map((k) => [k.key, k.def]));
}
export function clampBonusEcon(key: string, val: number): number {
  const k = BONUS_ECON_KNOBS.find((x) => x.key === key);
  if (!k || isNaN(val)) return k?.def ?? val;
  const clamped = Math.max(k.min, Math.min(k.max, val));
  return k.step >= 1 ? Math.round(clamped) : clamped; // integer knobs (drvRides) stay whole
}

// PURE fee math (no DB) — the single source of truth used by the server's feeModel, so it is
// directly unit-testable. The recipient ALWAYS gets the full amount. DARK (commission off) =
// no fee at all (replaces the legacy burn). LIVE = commission charged ON TOP of the sender,
// booked as platform income. Invariant: charged = received + commission; received == amount.
export function computeTransferFee(amount: number, commissionPct: number, commissionOn: boolean): { burn: number; commission: number; received: number; charged: number } {
  const commission = commissionOn ? Math.floor(amount * (commissionPct / 100)) : 0;
  return { burn: 0, commission, received: amount, charged: amount + commission };
}

// ── rich lookups for the redesigned pay flows ────────────────────────────────────────────────
// Driver pay-by-plate: exact details from kas (name, phone, model, rating) + typo suggestions.
export interface DriverPayLookup {
  found: boolean;
  id?: number;
  name?: string;
  phone?: string;
  carNumber?: string;
  carModel?: string;
  rating?: number;
  suggestions?: { car: string; name: string }[]; // closest plates when not found (typo tolerance)
}
// Friend pay-by-phone: name, type, phone + Telegram @username.
export interface RecipientLookup {
  found: boolean;
  name?: string;
  type?: string;
  phone?: string;
  username?: string | null;
}

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
  amount: number; // base — credited to the recipient IN FULL
  received: number; // = amount (recipient gets the full amount; commission is charged on top)
  burn: number; // legacy, 0 now
  commission: number; // platform fee charged to the sender on top of amount
  charged: number; // total debited from the sender = amount + commission
  coinsLeft: number; // sender balance after
  toName?: string;
}
