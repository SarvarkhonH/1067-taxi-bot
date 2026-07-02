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
export const WITHDRAW_DAILY_CAP = 100000; // max so'm leaving per member per day (owner-raised 50k→100k 2026-06-27)
export const TOPUP_MIN = 1000; // min bonus to move INTO coins (cashback → coin)

// NOTE: paid respins and the premium box were REMOVED deliberately —
// paying coins for a chance outcome is the gambling pattern Uzbek authorities
// flagged (Hamster Kombat precedent). Chance rewards are only ever EARNED by
// riding; coin sinks are deterministic purchases (Kolleksiya, Bozor).

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

// 💵 real cash-out (tanga → plastik karta / naxt uyga). Request is recorded + forwarded to the owner;
// tangas are spent only on owner approval. The Mini App shows the result of LODGING the request.
export interface CashoutResponse {
  ok: boolean;
  reason?: "off" | "not_linked" | "below_min" | "pending_exists" | "bad_card" | "no_holder" | "bad_address";
  id?: number;
  amount?: number;
  method?: "card" | "home";
  min?: number; // present on "below_min" — the threshold that wasn't met
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
// 2026-06-29 owner opened P2P fully — no anti-mule walls (new accounts can send, caps lifted to 100k,
// unlimited recipients, no account-age gate). Real-money-out is still bounded by the withdraw gate
// (ride-gated + 100k/day cap), so opening internal coin movement is a soft risk.
export const TRANSFER_MAX_PER_TX = 100000;
export const TRANSFER_DAILY_SENT = 100000;
export const TRANSFER_DAILY_RECEIVED = 100000;
export const TRANSFER_MAX_COUNTERPARTIES = 1000; // effectively unlimited recipients per day
export const TRANSFER_MIN_ACCOUNT_AGE_H = 0; // new accounts can transfer immediately
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

// ── 🚗 perceived liveliness: online-driver count shown to RIDERS is inflated (the city must never
// read "empty"). Riders see ~2× the real free-driver count everywhere it's displayed (home badge,
// booking map, bot search timeline). Dispatch + the ADMIN livemap always use the REAL number — this
// helper is DISPLAY-ONLY. Single source so "2×" is changed in one place. ──────────────────────────
export const ONLINE_DISPLAY_MULT = 2;
export function inflateOnline(real: number): number {
  return Math.round((real || 0) * ONLINE_DISPLAY_MULT);
}

// ── 🎁 dashboard-configurable acquisition bonuses (owner-tunable, like MOTOR_ECON_KNOBS) ──────
// The growth levers the owner tunes WITHOUT a deploy. `firstRide` is the single first-ride bonus
// (welcome + referee + recruit-welcome all read it); the rest are the per-flow sharer rewards.
// Defaults match the shipped code constants (REFEREE_REWARD=5000, REFERRER_REWARD=1500, …).
export interface BonusEconKnob { key: string; label: string; def: number; min: number; max: number; step: number; group: string }
export const BONUS_ECON_KNOBS: BonusEconKnob[] = [
  // ── Taklif & Recruit ──
  { key: "firstRide", label: "🎁 Birinchi safar bonusi (tanga)", def: 5000, min: 0, max: 20000, step: 500, group: "Taklif & Recruit" },
  // Bosqichli taklif mukofoti (refstaged flag ON bo'lganda) — taklif qilgan har bosqichda oladi:
  { key: "refStart", label: "👥 Do'st START bosganda → taklif qilganga", def: 500, min: 0, max: 10000, step: 100, group: "Taklif & Recruit" },
  { key: "refShare", label: "👥 Do'st raqam ulaganda → taklif qilganga", def: 500, min: 0, max: 10000, step: 100, group: "Taklif & Recruit" },
  { key: "refRide", label: "👥 Do'st 1-safar qilganda → taklif qilganga", def: 1000, min: 0, max: 10000, step: 100, group: "Taklif & Recruit" },
  { key: "referrer", label: "👥 Do'st taklif — ESKI (bosqichsiz, refstaged OFF)", def: 1500, min: 0, max: 20000, step: 250, group: "Taklif & Recruit" },
  // Bosqichli haydovchi-QR mukofoti (drvstaged flag ON) — haydovchi mijozini funnel bo'ylab kuzatib oladi:
  { key: "drvStart", label: "🚖 Mijoz QR skaner+START → haydovchiga", def: 500, min: 0, max: 10000, step: 100, group: "Taklif & Recruit" },
  { key: "drvShare", label: "🚖 Mijoz QR raqam ulaganda → haydovchiga", def: 500, min: 0, max: 10000, step: 100, group: "Taklif & Recruit" },
  { key: "recruitFirst", label: "🚖 Mijoz QR — ESKI 1-safar (drvstaged OFF)", def: 500, min: 0, max: 10000, step: 100, group: "Taklif & Recruit" },
  { key: "recruit3", label: "🚖 Mijoz QR — ESKI 3-safar (drvstaged OFF)", def: 1000, min: 0, max: 10000, step: 100, group: "Taklif & Recruit" },
  { key: "revshareFresh", label: "🚖 Revshare — yangi davrda (/safar)", def: 100, min: 0, max: 1000, step: 10, group: "Taklif & Recruit" },
  { key: "revshareMonths", label: "🚖 Revshare — yangi davr (oy, staged)", def: 1, min: 0, max: 24, step: 1, group: "Taklif & Recruit" },
  { key: "revshareVeteran", label: "🚖 Revshare — davrdan keyin (/safar)", def: 25, min: 0, max: 1000, step: 5, group: "Taklif & Recruit" },
  { key: "revshareMonthCap", label: "🚖 Revshare — oylik cap (haydovchiga)", def: 30000, min: 0, max: 200000, step: 1000, group: "Taklif & Recruit" },
  { key: "drvMilestone", label: "🚖 Haydovchi→haydovchi mukofot", def: 5000, min: 0, max: 50000, step: 500, group: "Taklif & Recruit" },
  { key: "drvRides", label: "🚖 Haydovchi→haydovchi — necha safar", def: 10, min: 1, max: 50, step: 1, group: "Taklif & Recruit" },
  // ── Safar mukofoti ──
  { key: "rideBase", label: "🎲 Safar cashback bazasi (×1/×2/×3)", def: 100, min: 0, max: 2000, step: 10, group: "Safar mukofoti" },
  { key: "jackpotFeed", label: "🎰 Jackpot pul to'ldirish (/safar)", def: 50, min: 0, max: 1000, step: 10, group: "Safar mukofoti" },
  { key: "driverDailyCap", label: "🚕 Haydovchi kunlik bonus cap", def: 10000, min: 0, max: 100000, step: 1000, group: "Safar mukofoti" },
  // ── Haydovchi tier rebate (/safar) ──
  { key: "tierKumush", label: "🥈 Kumush rebate (/safar)", def: 50, min: 0, max: 2000, step: 10, group: "Haydovchi tier" },
  { key: "tierOltin", label: "🥇 Oltin rebate (/safar)", def: 100, min: 0, max: 2000, step: 10, group: "Haydovchi tier" },
  { key: "tierOlmos", label: "💎 Olmos rebate (/safar)", def: 200, min: 0, max: 2000, step: 10, group: "Haydovchi tier" },
  // ── Missionlar (mukofot) ──
  { key: "mDailyCheckin", label: "✅ Kunlik kirish", def: 50, min: 0, max: 5000, step: 10, group: "Missionlar" },
  { key: "mDailySpin", label: "🎡 Kunlik g'ildirak", def: 50, min: 0, max: 5000, step: 10, group: "Missionlar" },
  { key: "mDailyRide", label: "🚕 Kunlik 1-safar", def: 100, min: 0, max: 5000, step: 10, group: "Missionlar" },
  { key: "mWeeklyRides", label: "🚕 Haftalik 5-safar", def: 700, min: 0, max: 20000, step: 50, group: "Missionlar" },
  { key: "mWeeklyInvite", label: "👥 Haftalik taklif", def: 1000, min: 0, max: 20000, step: 50, group: "Missionlar" },
  { key: "mDrvDaily5", label: "🚖 Haydovchi kunlik 5-safar", def: 800, min: 0, max: 20000, step: 50, group: "Missionlar" },
  { key: "mDrvWeekly25", label: "🚖 Haydovchi haftalik 25-safar", def: 5000, min: 0, max: 50000, step: 100, group: "Missionlar" },
  { key: "mDrvWeekly40", label: "🚖 Haydovchi haftalik 40-safar", def: 12000, min: 0, max: 50000, step: 100, group: "Missionlar" },
  // ── 🏅 Daraja multiplikator (feature "tierloyalty") — har safar cashback'ni daraja bo'yicha ko'paytiradi (≤350 clamp baribir ustun) ──
  { key: "tierMultBronza", label: "🥉 Bronza — har safar cashback ×", def: 1.05, min: 1, max: 2, step: 0.01, group: "Daraja multiplikator" },
  { key: "tierMultKumush", label: "🥈 Kumush — har safar cashback ×", def: 1.1, min: 1, max: 2, step: 0.01, group: "Daraja multiplikator" },
  { key: "tierMultOltin", label: "🥇 Oltin — har safar cashback ×", def: 1.15, min: 1, max: 2, step: 0.01, group: "Daraja multiplikator" },
  { key: "tierMultPlatina", label: "💎 Platina — har safar cashback ×", def: 1.2, min: 1, max: 2, step: 0.01, group: "Daraja multiplikator" },
  { key: "tierMultOlmos", label: "💠 Olmos — har safar cashback ×", def: 1.25, min: 1, max: 2, step: 0.01, group: "Daraja multiplikator" },
  { key: "tierMultAfsona", label: "👑 Afsona — har safar cashback ×", def: 1.3, min: 1, max: 2, step: 0.01, group: "Daraja multiplikator" },
  // ── 🏅 Daraja balli (feature "tierloyalty") — kunlik vazifa → ball; faolsizlik → decay ──
  { key: "ballHalf", label: "🎯 Kunlik ≥50% vazifa → ball", def: 100, min: 0, max: 2000, step: 10, group: "Daraja balli" },
  { key: "ballFull", label: "🎯 Kunlik 100% vazifa → ball", def: 250, min: 0, max: 5000, step: 10, group: "Daraja balli" },
  { key: "decayGraceDays", label: "⏳ Faolsiz kun (ogohlantirishdan oldin)", def: 7, min: 1, max: 30, step: 1, group: "Daraja balli" },
  { key: "decayPct", label: "📉 Kunlik ball yechilishi (%)", def: 5, min: 0, max: 30, step: 1, group: "Daraja balli" },
  { key: "decayFloor", label: "📉 Ball minimumi (decay shu yerda to'xtaydi)", def: 0, min: 0, max: 10000, step: 100, group: "Daraja balli" },
  // ── 🪙 Kutish kompensatsiyasi (feature "waitcomp") — haydovchi topa olmagan har soniya uchun
  // o'ynab ishlanadigan tanga. 350/safar clamp'dan TASHQARI (kompensatsiya, oddiy cashback emas) —
  // shuning uchun o'zining kunlik kompaniya-byudjeti bilan cheklanadi.
  { key: "waitCompCeiling", label: "🪙 Kutish bonusi — maksimal (/safar)", def: 2000, min: 0, max: 3000, step: 100, group: "Kutish kompensatsiyasi" },
  { key: "waitCompGraceSec", label: "⏳ Bepul boshlanish (soniya, hali 0)", def: 20, min: 0, max: 120, step: 5, group: "Kutish kompensatsiyasi" },
  { key: "waitCompFullSec", label: "⏱ Maksimalgacha necha soniya", def: 300, min: 60, max: 900, step: 30, group: "Kutish kompensatsiyasi" },
  { key: "waitCompDailyBudget", label: "🏦 Kunlik kompaniya byudjeti (tanga)", def: 200000, min: 0, max: 2000000, step: 10000, group: "Kutish kompensatsiyasi" },
];
// 🏅 level index → cashback-multiplier knob key (null for Yangi = baseline ×1.0).
const TIER_MULT_KNOB: Record<number, string> = {
  1: "tierMultBronza", 2: "tierMultKumush", 3: "tierMultOltin",
  4: "tierMultPlatina", 5: "tierMultOlmos", 6: "tierMultAfsona",
};
export function tierMultKnobKey(levelIndex: number): string | null {
  return TIER_MULT_KNOB[levelIndex] ?? null;
}
/** Per-ride cashback multiplier for a level index from a knob blob (1.0 default = Yangi/unknown). */
export function tierMultFor(levelIndex: number, econ: Record<string, number>): number {
  const k = tierMultKnobKey(levelIndex);
  return k && typeof econ[k] === "number" ? econ[k]! : 1.0;
}
export function bonusEconDefaults(): Record<string, number> {
  return Object.fromEntries(BONUS_ECON_KNOBS.map((k) => [k.key, k.def]));
}
export function clampBonusEcon(key: string, val: number): number {
  const k = BONUS_ECON_KNOBS.find((x) => x.key === key);
  if (!k || isNaN(val)) return k?.def ?? val;
  const clamped = Math.max(k.min, Math.min(k.max, val));
  return k.step >= 1 ? Math.round(clamped) : clamped; // integer knobs (drvRides) stay whole
}

// ── 🎁 admin-configurable PROMO campaigns ("tasks with promises") ──────────────────────────────
// Owner builds time-bound challenges in the dashboard ("invite 5 friends in 5 days who ride → 10k").
// Progress is computed live from OUR DB (referrals/rides/coin txns) within the campaign window;
// completion grants the reward once (idempotent) + pushes a message. Gated by the "promo" flag.
export type CampaignCond =
  | "invite_ride" | "invite_signup" | "rides" | "streak" | "comeback"
  | "first_ride" | "spend_tanga" | "earn_tanga" | "pay_fare" | "weekend_rides";
export const CAMPAIGN_CONDS: { cond: CampaignCond; label: string; unit: string }[] = [
  { cond: "invite_ride", label: "Do'st taklif — har biri safar qilsa", unit: "kishi" },
  { cond: "invite_signup", label: "Do'st taklif — ulansa (telefon)", unit: "kishi" },
  { cond: "rides", label: "O'zi safar qilsa", unit: "safar" },
  { cond: "streak", label: "Ketma-ket kunlar (streak)", unit: "kun" },
  { cond: "comeback", label: "Tanaffusdan keyin qaytib safar", unit: "safar" },
  { cond: "first_ride", label: "Birinchi safarini qilsa", unit: "safar" },
  { cond: "spend_tanga", label: "Tanga sarflasa (bozor)", unit: "tanga" },
  { cond: "earn_tanga", label: "Tanga ishlasa", unit: "tanga" },
  { cond: "pay_fare", label: "Yo'l haqini tanga bilan to'lasa", unit: "marta" },
  { cond: "weekend_rides", label: "Dam olish kunlari safar", unit: "safar" },
];
export interface Campaign {
  id: string;
  emoji: string;
  title: string;
  cond: CampaignCond;
  target: number;
  windowDays: number; // promo runs this many days from startAt
  reward: number; // tanga on completion
  audience: "client" | "driver" | "all";
  active: boolean;
  startAt: string; // ISO — when the window opened
}
export const CAMPAIGN_MAX_REWARD = 50000; // safety ceiling per completion
export interface CampaignView extends Campaign {
  endAt: string;
  ended: boolean;
  completions: number; // how many members already earned it
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
