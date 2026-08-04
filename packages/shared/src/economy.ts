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
  // pending_review: a previous kas write's outcome is UNKNOWN (crash/timeout mid-write) — the cash
  // door stays closed for this member until an admin confirms what kas actually did (no double-pay).
  // fund_low: the GLOBAL revenue-linked daily fund is short — NOT the member's personal 100k cap
  // (they used to be conflated: drivers with ~5k withdrawn were told "100 000 limit tugadi").
  reason?: "below_min" | "daily_cap" | "insufficient" | "not_client" | "kas_failed" | "no_ride" | "risk_hold" | "pending_review" | "fund_low";
  amount: number;
  coinsLeft: number;
  kasApplied: boolean;
  fundLeft?: number; // fund_low only: what the global fund can still pay right now
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

// 🚕 PAID-OUT GATE: a CLIENT must be a real taxi user before any tanga can LEAVE their account —
// i.e. withdraw (cash-out) AND P2P value-out (transfer / tip / fare). The welcome sovg'a is theirs
// to SPEND in-app immediately (shop/market/e'lon stay open), but it can't be cashed or handed to
// anyone until they've actually ridden ≥ this many times. Kills the "onboard people, sweep their
// 5000 to a mule" funnel at the root: a freshly-linked victim (trips 0) can move nothing out.
// Owner-set (2026-07-23). trips is synced from kas1067.
export const MIN_RIDES_FOR_PAID = 3;

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

// ── 💸 dashboard-configurable transfer commission (owner-tunable knobs) ─────
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

// ── 🎁 dashboard-configurable acquisition bonuses (owner-tunable knobs) ──────
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
  // ── 💸 Naqd fond (withdraw) — endi admin-paneldan, env/kod shart emas ──
  // Kunlik umumiy fond = wdBase + kechagi safarlar × wdPerRide. 2000 so'm/safar komissiya davrida
  // xavfsiz yuqori chegara: perRide ≤ komissiya − bonuslar (~1500). Def'lar eski xatti-harakatga teng.
  { key: "wdBase", label: "💸 Kunlik fond — baza (so'm)", def: 20000, min: 0, max: 2000000, step: 5000, group: "Naqd fond" },
  { key: "wdPerRide", label: "💸 Kunlik fond — har safar uchun (so'm)", def: 300, min: 0, max: 2000, step: 50, group: "Naqd fond" },
  { key: "wdDailyCapUser", label: "💸 Bir odam kunlik limiti (so'm)", def: 100000, min: 5000, max: 1000000, step: 5000, group: "Naqd fond" },
  { key: "wdMin", label: "💸 Minimal yechish (tanga)", def: 5000, min: 1000, max: 50000, step: 500, group: "Naqd fond" },
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
  // ── 🪙 Kutish kompensatsiyasi (feature "waitcomp") — haydovchi TOPILGUNCHA o'tgan har soniya uchun
  // PASSIV tanga (o'yin YO'Q — ega rad etdi: "bachkana"). Uzr-model: sekin qidiruv bizning aybimiz.
  // 350/safar clamp'dan TASHQARI — o'zining kunlik kompaniya-byudjeti bilan. Owner spec 2026-07-02:
  // ~500/daqiqa, 3 daqiqada to'liq (1500). Safar bo'lsa — yakunida to'lanadi; mashina TOPILMASA —
  // xuddi shu summa "keyingi safar" VAUCHERIga aylanadi (farm-yopiq: pul faqat real safar bilan).
  { key: "waitCompCeiling", label: "🪙 Kutish kompensatsiyasi — maksimal (/safar)", def: 1500, min: 0, max: 3000, step: 100, group: "Kutish kompensatsiyasi" },
  { key: "waitCompGraceSec", label: "⏳ Hisob boshlanishi (soniya)", def: 30, min: 0, max: 120, step: 5, group: "Kutish kompensatsiyasi" },
  { key: "waitCompFullSec", label: "⏱ Maksimalgacha necha soniya", def: 180, min: 60, max: 900, step: 30, group: "Kutish kompensatsiyasi" },
  { key: "waitCompDailyBudget", label: "🏦 Kunlik kompaniya byudjeti (tanga)", def: 200000, min: 0, max: 2000000, step: 10000, group: "Kutish kompensatsiyasi" },
  { key: "waitVoucherExpiryH", label: "🎁 Topilmadi-vaucheri amal muddati (soat)", def: 72, min: 12, max: 336, step: 12, group: "Kutish kompensatsiyasi" },
  // ── 📋 E'lonlar (feature "elonlar") — joylash narxi zinapoyasi (ELONLAR_PLAN.md §6). 0 = bepul
  // davr; Yo'qoldi-Topildi kategoriyasi bu knobdan qat'i nazar DOIM bepul (community-good, viral).
  // TOP boost alohida knob, flag `elontop` (E4) — E2'da faqat qiymati mavjud, sotib olish yo'q.
  { key: "elonPostPrice", label: "📋 E'lon joylash narxi (tanga)", def: 0, min: 0, max: 5000, step: 100, group: "E'lonlar" },
  { key: "elonTopPrice", label: "📌 TOP e'lon — 24 soat (tanga, E4)", def: 2000, min: 0, max: 20000, step: 250, group: "E'lonlar" },
  { key: "elonMaxActive", label: "📋 1 kishi — max aktiv e'lon", def: 3, min: 1, max: 20, step: 1, group: "E'lonlar" },
  // ── 🏪 BirJoy V3 (flag `shopcashback`) — xarid-cashback, Kaspi-Bonus modeli. YANGI emissiya-manba,
  // safar ≤350 clamp'ga TEGMAYDI (bookingId=null → clamp-indeks tashqarisida). Grant faqat
  // delivered-o'tishda (soxta-buyurtma+reject fermasi strukturaviy 0 to'laydi).
  { key: "shopCashbackPct", label: "🪙 Xarid-cashback foizi (%)", def: 2, min: 0, max: 10, step: 1, group: "BirJoy bozor" },
  { key: "shopCashbackPerOrder", label: "🪙 Cashback — max/buyurtma (tanga)", def: 2000, min: 0, max: 10000, step: 100, group: "BirJoy bozor" },
  { key: "shopCashbackDaily", label: "🪙 Cashback — max/kun/a'zo (tanga)", def: 5000, min: 0, max: 20000, step: 500, group: "BirJoy bozor" },
  // ── 🗣 BirJoy V3 (flag `revtanga`) — sharh-uchun-tanga (Ozon mexanikasi). FAQAT delivered-xaridor,
  // BIR UMR bir marta (edit/delete-resubmit qayta to'lamaydi).
  { key: "reviewTangaBase", label: "🗣 Sharh uchun tanga", def: 300, min: 0, max: 1000, step: 50, group: "BirJoy bozor" },
  { key: "reviewTangaPhotoBonus", label: "🗣 Sharh + rasm — qo'shimcha", def: 200, min: 0, max: 1000, step: 50, group: "BirJoy bozor" },
  { key: "reviewTangaDailyMax", label: "🗣 Sharh-tanga — max/kun/a'zo (dona)", def: 3, min: 0, max: 10, step: 1, group: "BirJoy bozor" },
  // ── 🎀 RAVELLA (flag `ravella`, RAVELLA_PLAN §7) — hamkor-brend bezak konstruktori.
  // CHEGIRMA foizi RAVELLA hisobidan (bizga 0 so'm — hamkor kelishuvi, buyurtmada audit uchun
  // yoziladi). CASHBACK foizi esa BIZNING yangi emissiya-manbamiz: safar ≤350 clamp'iga TEGMAYDI
  // (grantCoins bookingId'siz), grant FAQAT ish "done"ga o'tganda, buyurtma+kunlik cap ichida.
  { key: "ravellaDiscountPct", label: "🎀 BirJoy chegirmasi (%) — Ravella hisobidan", def: 10, min: 0, max: 30, step: 1, group: "Ravella" },
  { key: "ravellaCashbackPct", label: "🎀 Cashback foizi (%) — biz to'laymiz", def: 1, min: 0, max: 5, step: 1, group: "Ravella" },
  { key: "ravellaCashbackPerOrder", label: "🎀 Cashback — max/buyurtma (tanga)", def: 20000, min: 0, max: 100000, step: 1000, group: "Ravella" },
  { key: "ravellaCashbackDaily", label: "🎀 Cashback — max/kun/a'zo (tanga)", def: 20000, min: 0, max: 100000, step: 1000, group: "Ravella" },
  { key: "ravellaSlaMinutes", label: "🎀 Javobsiz buyurtma — alert (daqiqa)", def: 15, min: 3, max: 120, step: 1, group: "Ravella" },
  // ── 🎮 KOSON O'YINI (flag `oyin`, KOSON_OYIN_PLAN.md v9.2) — ball og'irliklari. Ball — alohida
  // hisob-kitob birligi (Coin/CoinTxn EMAS), lekin mavsum yopilishida oyinService qoldiqni
  // tangaga aylantiradi — shuning uchun bu massivda, ega "nimaga nechi ball" nazoratini shu
  // yerdan oladi. Sovrin-katalog (narx/limit/rasm) ENDI bu yerda EMAS — 2026-08-02'dan boshlab
  // to'liq admin-CRUD, `oyin:catalog` AppState qatorida saqlanadi (oyinService.ts, oyin.ts).
  // ── 💰 BALL = DAROMAD KVITANSIYASI (ega qarori 2026-08-03) ────────────────────────────────
  // Yagona shkala: **1 ball = 10 so'm SOF daromad**, bitta buyurtmadan 2000 so'm (ega raqami).
  // Ya'ni bitta safar tizimga AYNAN 200 ball kiritadi — na ko'p, na kam. Avval ball "harakat
  // uchun mukofot" edi va safarsiz odam kunlik kirish bilan oyiga 560 ball yig'ib, kassaga bir
  // tiyin keltirmasdan sovrin yutardi. Endi ball ishlab chiqarishning yagona yo'li — kassaga
  // pul kelishi. Sovrin narxi ham shu shkaladan chiqadi: `ball = qiymat ÷ 30` (qiymat ÷ 3
  // odam ÷ 10 so'm). Har sovrinda 20 o'rin → BirJoy'ning xarajati kelgan daromadning 15% i.
  //
  // TAQSIMOT (bitta safarning 200 balli ikki marta sanalmaydi):
  //   safarchiga 150 (75%) · uni chaqirganga 50 (25%)
  // Sabab: pulni kassaga safarchi keltirdi. Chaqiruvchining kuchi SONDA — 20 do'st oyiga
  // 8 000 ball beradi, o'zining 30 safari esa 4 500. "Do'st chaqirish eng foydali" saqlanadi.
  { key: "oyinRideBall", label: "🎮 O'z safari — ball (2000 so'm × 75% ÷ 10)", def: 35, min: 0, max: 5000, step: 10, group: "Koson O'yini" },
  { key: "oyinFirstRideBall", label: "🎮 Mavsumdagi birinchi safar — ball", def: 100, min: 0, max: 5000, step: 10, group: "Koson O'yini" },
  { key: "oyinPhoneBall", label: "🎮 Telefon tasdiqlash — ball (bepul yo'l)", def: 20, min: 0, max: 1000, step: 10, group: "Koson O'yini" },
  // ⚠️ 0 — ATAYLAB. Bu knob soxta-do'st fabrikasining dvigateli edi: har SIM karta uchun
  // safarsiz 40 ball. Endi taklifchi faqat do'st HAQIQATAN yurganda to'lanadi (pastdagi knob).
  { key: "oyinReferJoinBall", label: "🎮 Do'st telefon ulaganda — taklifchiga ball (0 = safarsiz to'lov yo'q)", def: 0, min: 0, max: 2000, step: 10, group: "Koson O'yini" },
  // Mijoz jalb qilish mukofoti. Real xarajati: 500 ball × 10 so'm × 15% = 750 so'm — bu
  // tanga tomonidagi `firstRide` bonusidan (5 000 so'm) 6× arzon va faqat REAL safarga to'lanadi.
  { key: "oyinReferFirstRideBall", label: "🎮 Do'st BIRINCHI safarini qilganda — taklifchiga ball", def: 175, min: 0, max: 5000, step: 10, group: "Koson O'yini" },
  { key: "oyinReferRideBall", label: "🎮 Do'stning har safaridan — taklifchiga ball (2000 × 25% ÷ 10)", def: 10, min: 0, max: 2000, step: 5, group: "Koson O'yini" },
  // ── ⚠️ BEPUL YO'L — 2026-08-04 da KESKIN QISILDI (ega qarori).
  //
  // Nega: to'lish-qulfi (`oyinMinSellPct = 100`) NISBATNI himoya qiladi, MANBANI emas. Mukofot
  // to'lganda 3X ball yig'ilgan bo'ladi — lekin uning bir qismi ortida DAROMAD BO'LMASA, real
  // marja o'shancha yeyiladi. Matematik chegara aniq: bepul ball emissiyaning 66% idan oshsa,
  // mukofot ortidagi daromad uning narxidan KAM bo'ladi va bu haqiqiy zarar.
  //
  // Eski holat (2026-08-03): kirish 5/kun + ulashish 10/kun + ekranga o'rnatish 300 → oyiga
  // ~750 ball, ya'ni 810 a'zoning HAMMASI hech narsa qilmasdan yig'sa oyiga ~486 000 so'mlik
  // mukofot majburiyati. Daromadning 40% i.
  //
  // Yangi holat: ulashish 0 · ekranga o'rnatish 20 (bir marta) · kunlik kirish 1.
  //
  // ⚠️ IKKI OCHIQ QARZ (nazoratchi agent 2026-08-04):
  //  1. "Kunlik kirish FAQAT safar qilganlarga" — bu qo'riq KODDA YO'Q. `oyinService.ts`
  //     `loginBall` hech qanday safar shartini tekshirmaydi. Bugun zarari kichik (1 ball/kun),
  //     lekin izoh mavjud bo'lmagan himoyani va'da qilmasin: qo'riq S1b da qo'shiladi.
  //  2. Hikoya (100 ball, `oyinStoryProofBall`) ham SAFAR TALAB QILMAYDI — ya'ni u ham bepul
  //     yo'lning bir qismi. Ega qarori: u REKLAMA xarajati (hikoya ~200 odamga yetadi, 100 ball
  //     = 667 so'm real xarajat — eng arzon kanal), shuning uchun "leak" deb sanalmaydi.
  //     Lekin cheklovchi — ADMIN TASDIG'I: haftada nechtasini ko'ra olsangiz, shuncha to'lanadi.
  //     ⚠️ `OYIN_STORY_SEASON_LIMIT` hozir 3/mavsum; ega "haftada 1" so'ragan — S1b da.
  //
  // ⚠️ Kunlik topshiriq bu hisobga KIRMAYDI va bu ATAYLAB: to'plamdagi 4 topshiriqning
  // uchtasi REAL safar talab qiladi (o'z safari / do'st safari), to'rtinchisi esa yangi
  // HAQIQIY foydalanuvchi. Bepul emas.
  //
  // Karta darvozasi (`no_ride`: ≥1 real safar) baribir kuchda — bepul ball yig'ilsa ham,
  // safarsiz odam kartaga AYLANTIRA olmaydi.
  { key: "oyinDailyLoginBall", label: "🎮 Kunlik kirish — ball (bepul yo'l)", def: 1, min: 0, max: 100, step: 1, group: "Koson O'yini" },
  { key: "oyinShareBall", label: "🎮 Ulashish — ball (bepul yo'l)", def: 0, min: 0, max: 200, step: 1, group: "Koson O'yini" },
  { key: "oyinStoryProofBall", label: "🎮 Hikoya joylash (admin tasdig'i) — ball (bepul yo'l)", def: 100, min: 0, max: 2000, step: 10, group: "Koson O'yini" },
  // 🎯 Kunlik topshiriq (har kuni random, server tekshiradi) va 🏠 doimiy topshiriq.
  { key: "oyinDailyQuestBall", label: "🎯 Kunlik topshiriq — bonus ball", def: 20, min: 0, max: 2000, step: 10, group: "Koson O'yini" },
  // Real xarajat: 300 ball × 10 so'm × 15% = 450 so'm, MAVSUMDA BIR MARTA. Telegram
  // `homeScreenAdded` hodisasi bilan tasdiqlanadi — mijoz "bosdim" desa yetarli emas.
  // ⚠️ 500 → 300 (ega qarori 2026-08-03). Ikki sabab: (1) 500 da bu knob bepul yo'lning 53% i
  // edi — bitta knob butun bepul iqtisodni belgilab turardi; (2) tasdiq oxir-oqibat KLIENTdan
  // keladi (`checkHomeScreenStatus()` → POST /api/oyin/home), ya'ni texnik odam route'ni qo'lda
  // chaqira oladi. 300 da bepul yo'l 750 bo'lib eng arzon sovrindan (1 000) marja bilan past
  // qoladi va 90 kunlik mavsumda ham oshmaydi (1 650 tomning ichida 300 ulushi kichik).
  { key: "oyinHomeScreenBall", label: "🏠 Ilovani ekranga o'rnatish — bonus ball", def: 20, min: 0, max: 5000, step: 50, group: "Koson O'yini" },
  { key: "oyinSprintBonusBall", label: "🎮 Haftalik sprint top-3 — bonus ball", def: 70, min: 0, max: 5000, step: 10, group: "Koson O'yini" },
  // 🛡 TIRAJ QO'RIG'I (ega qarori 2026-08-03, jonli sinovdan keyin). Sovrin chiptalarining shu
  // foizi sotilmasa — TIRAJDA O'YNALMAYDI.
  // Nega kerak: sovrin sotilgan chipta soniga QARAMASDAN beriladi. 900 000 so'mlik pechga 133 ta
  // chipta qo'yilib 5 tasi sotilsa, ega 900 000 so'mni 30 000 so'm evaziga berardi — ya'ni 3000%.
  // Narx formulasi qanchalik to'g'ri bo'lmasin, bu teshik ochiq turganda xarajat foizi CHEKSIZ
  // bo'lib qolaveradi. Chegara xarajatni eng yomon holatda mo'ljaldan 100/pct barobar oshishi
  // bilan CHEKLAYDI (50% → 2×).
  // ⚠️ Mijozga OLDINDAN ochiq aytiladi (vitrina + chipta + varaq): "kamida N ta chipta sotilsa
  // o'ynaladi · hozir M ta". Yashirin shart = ishonchni buzish.
  { key: "oyinMinSellPct", label: "🛡 Tiraj qo'rig'i — sovrin o'ynalishi uchun min sotilgan (%)", def: 100, min: 0, max: 100, step: 5, group: "Koson O'yini" },
  // ⚠️ Zanjir endi SAFAR kunlari bo'yicha (avval ilova ochish sanalardi — safarsiz 500 ball/oy).
  { key: "oyinStreakBall", label: "🔥 3 kunlik SAFAR zanjiri — bonus ball", def: 35, min: 0, max: 1000, step: 10, group: "Koson O'yini" },
  // ⚖️ Adolat qo'rig'i: do'st-safari 40 ga chiqqach, ko'p do'stli odam bitta sovrinning BARCHA
  // chiptasini sotib olishi mumkin edi. Pul xavfi yo'q (seasonClose 500 tanga bilan cheklaydi),
  // lekin tiraj adolati buzilardi — bitta odam butun sovrinni egallab olardi.
  { key: "oyinMaxTicketsPerPrize", label: "⚖️ Bitta odam bitta sovrindan max chipta", def: 3, min: 1, max: 50, step: 1, group: "Koson O'yini" },
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
    | "locked" // 🎁 sender's welcome sovg'a is still ride-locked (non-transferable until their own first ride)
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
