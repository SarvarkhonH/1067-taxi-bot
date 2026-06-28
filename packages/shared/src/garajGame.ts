// 🏆 GARAJ v2 — the deep car-restoration + flipping game config.
// PURE module (browser + node safe): NO node:crypto, NO prisma — it is imported
// by the React mini-app too. Server-only seeding/hashing lives in the server.
// When feature "garajx" is ON, this game REPLACES the old idle garage (garage.ts).

export type RestoreStyle = "QUICK_FLIP" | "FULL_RESTORE" | "TUNING" | "PERIOD_CORRECT";
export type BuyerArchetype = "FAMILY_DRIVER" | "YOUNG_TUNER" | "NEWLYWED" | "COLLECTOR";
export type CarCondition = "WORN" | "FAIR" | "GOOD" | "MINT";
export type RepairQuality = "EXCELLENT" | "GOOD" | "FAIR" | "DEFECT" | "AUTO";

// ── multipliers (canonical — computeFlipGrant is the ONLY consumer) ───────────
export const STYLE_BASE_MULT: Record<RestoreStyle, number> = {
  QUICK_FLIP: 1.0,
  FULL_RESTORE: 1.35,
  TUNING: 1.2,
  PERIOD_CORRECT: 1.3,
};

// additive on top of the style base mult; <= -1 means the buyer hard-refuses the style
export const BUYER_STYLE_MATCH: Record<BuyerArchetype, Record<RestoreStyle, number>> = {
  FAMILY_DRIVER: { QUICK_FLIP: -0.15, FULL_RESTORE: 0.4, TUNING: -0.1, PERIOD_CORRECT: 0 },
  YOUNG_TUNER: { QUICK_FLIP: 0, FULL_RESTORE: 0.1, TUNING: 0.45, PERIOD_CORRECT: -0.2 },
  NEWLYWED: { QUICK_FLIP: -0.2, FULL_RESTORE: 0.4, TUNING: 0.05, PERIOD_CORRECT: 0.3 },
  COLLECTOR: { QUICK_FLIP: 0.05, FULL_RESTORE: 0.15, TUNING: -9.9, PERIOD_CORRECT: 0.55 },
};

export const CONDITION_MULT: Record<CarCondition, number> = { WORN: 0.8, FAIR: 0.9, GOOD: 1.0, MINT: 1.1 };

// Base market value per car model (tanga) — basis for buy price, repair scope, resale.
export const MAKE_BASE: Record<string, number> = {
  tiko: 700,
  damas: 900,
  matiz: 1500,
  nexia: 2600,
  spark: 1900,
  cobalt: 3800,
  lacetti: 5500,
  malibu: 9000,
  tracker: 12000,
  tahoe: 26000,
  gelik: 42000,
};


// ── costs / sinks ─────────────────────────────────────────────────────────────
export const INSPECT_COSTS = { TOOL: 120, EXPERT: 400 } as const;

// 🔧 Repair-depth: a car has 5 ZONES; you fix each with a chosen PART tier. Better
// part = more condition gained + a higher repairQualityBonus (→ higher flip price),
// but costs more. The flip CAP (computeFlipGrant) already accounts for repairSpent,
// so spending more on parts can never extract a disproportionate grant (audit M4).
export const REPAIR_ZONES = ["engine", "body", "transmission", "electric", "interior"] as const;
export type RepairZone = (typeof REPAIR_ZONES)[number];
export const ZONE_NAMES: Record<string, string> = { engine: "Dvigatel", body: "Kuzov", transmission: "Transmissiya", electric: "Elektr", interior: "Salon" };
export const PART_TIERS: { code: string; name: string; cost: number; gain: number; quality: number }[] = [
  { code: "SALVAGE", name: "Salvage", cost: 40, gain: 16, quality: 0.99 },
  { code: "STD", name: "Standart", cost: 80, gain: 26, quality: 1.02 },
  { code: "OEM", name: "OEM", cost: 200, gain: 42, quality: 1.06 },
  { code: "SPORT", name: "Sport", cost: 500, gain: 62, quality: 1.1 },
];
export function partTier(code: string): { code: string; name: string; cost: number; gain: number; quality: number } | undefined {
  return PART_TIERS.find((p) => p.code === code);
}
/** Overall car condition from the 5 zone conditions (0-100). MINT needs a high
 *  average AND no neglected zone — so you must fix the worst zones, not just one. */
export function conditionFromZones(zones: Record<string, number>): CarCondition {
  const vals = REPAIR_ZONES.map((z) => Math.max(0, Math.min(100, zones[z] ?? 0)));
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const min = Math.min(...vals);
  if (avg >= 90 && min >= 80) return "MINT";
  if (avg >= 70 && min >= 55) return "GOOD";
  if (avg >= 45 && min >= 30) return "FAIR";
  return "WORN";
}

// cumulative branch XP per specialization tier (1..5)
export const MECH_XP_TIERS = [0, 25, 75, 150, 300] as const;
/** Specialization tier (1..5) from accumulated branch XP. */
export function branchTier(xp: number): number {
  let t = 1;
  for (let i = 1; i < MECH_XP_TIERS.length; i++) if (xp >= MECH_XP_TIERS[i]!) t = i + 1;
  return t;
}

// ── emission guards (the new game's own caps; ride-coins still ≤350 via grantRideCoins) ─
export const FLIP_DAILY_CAP = 8000; // tanga/member/day flip emission cap (audit B4)

// timing mini-game → repairQualityBonus multiplier (product across tasks, clamped).
// Better timing raises the flip price via computeFlipGrant's repairQualityBonus.
export const TIMING_BONUS: Record<RepairQuality, number> = { EXCELLENT: 1.05, GOOD: 1.0, FAIR: 1.0, DEFECT: 0.97, AUTO: 1.0 };
export const REPAIR_QUALITY_MIN = 0.9;
export const REPAIR_QUALITY_MAX = 1.25;

// 🏺 Ko'zacha shop — spend the ride-only currency to boost a car's flip price
// (one of each item per car; raises repairQualityBonus, clamped). Costs are tuned
// to the ≤8/ride earn rate (the premium currency stays precious).
export const KOZACHA_SHOP: { code: string; name: string; cost: number; factor: number }[] = [
  { code: "FLIP_BOOST_5", name: "Sotuv +5%", cost: 15, factor: 1.05 },
  { code: "FLIP_BOOST_10", name: "Sotuv +10%", cost: 30, factor: 1.1 },
];
export interface FlipParams {
  basePrice: number;
  level: number;
  style: RestoreStyle;
  buyerArchetype: BuyerArchetype;
  condition: CarCondition;
  repairQualityBonus?: number; // product of timing results, default 1.0
  savdogarTier5Bonus?: number; // 0.12 if Savdogar T5 passive buyer, else 0
  kuzovchiTier5Bonus?: number; // 0.08 if Kuzovchi T5 + body conds 80+, else 0
  seasonalBonus?: number; // e.g. 0.10 Navruz for PERIOD_CORRECT
  prestigeMult?: number; // W5 prestige (≤1.25); multiplies raw, cap still bounds it
  acquireCost: number;
  repairSpent: number;
}

/**
 * THE canonical flip sell-price. Imported by garajService (flip handler) AND
 * simEconomy (proof). No other file computes a sell price.
 * AUDIT M4: the cap uses Math.min (not max) so a cheap car + heavy Kozacha
 * boost cannot extract a disproportionate grant. AUDIT B4: the caller wraps the
 * grant + daily-cap decrement in ONE transaction.
 */
export function computeFlipGrant(p: FlipParams): number {
  const levelMult = 1.0 + (p.level - 1) * 0.15;
  const conditionMult = CONDITION_MULT[p.condition];
  const styleMult = STYLE_BASE_MULT[p.style];
  const buyerMult = BUYER_STYLE_MATCH[p.buyerArchetype][p.style];
  if (buyerMult <= -1) return 0; // hard buyer-style block (e.g. COLLECTOR × TUNING)

  const raw =
    p.basePrice *
    levelMult *
    (styleMult + buyerMult) *
    conditionMult *
    (p.repairQualityBonus ?? 1.0) *
    (1 + (p.savdogarTier5Bonus ?? 0)) *
    (1 + (p.kuzovchiTier5Bonus ?? 0)) *
    (1 + (p.seasonalBonus ?? 0)) *
    (p.prestigeMult ?? 1.0);

  // AUDIT M4/B4: the cap is independent of prestige/seasonal, so those bonuses can
  // only pull `raw` UP toward the cap — never past it. The flip printer stays bounded.
  const cap = Math.min(p.basePrice * 2.5, (p.acquireCost + p.repairSpent) * 3.0 + p.basePrice * 0.5);
  return Math.max(0, Math.min(Math.round(raw), Math.round(cap)));
}

// ── display catalog for the new game (prices come from MAKE_BASE) ─────────────
export const GARAJ_CARS: { code: string; name: string; emoji: string; era: boolean }[] = [
  { code: "tiko", name: "Tiko", emoji: "🚙", era: true },
  { code: "damas", name: "Damas", emoji: "🚐", era: true },
  { code: "matiz", name: "Matiz", emoji: "🚗", era: true },
  { code: "nexia", name: "Nexia", emoji: "🚙", era: true },
  { code: "spark", name: "Spark", emoji: "🚗", era: false },
  { code: "cobalt", name: "Cobalt", emoji: "🚘", era: false },
  { code: "lacetti", name: "Lacetti", emoji: "🚖", era: false },
  { code: "malibu", name: "Malibu", emoji: "🏎", era: false },
  { code: "tracker", name: "Tracker", emoji: "🛻", era: false },
  { code: "tahoe", name: "Tahoe", emoji: "🚙", era: false },
  { code: "gelik", name: "Gelandewagen", emoji: "🏁", era: false },
];
export function garajCarMeta(code: string): { code: string; name: string; emoji: string; era: boolean } | undefined {
  return GARAJ_CARS.find((c) => c.code === code);
}
export const GARAJ_BUY_FACTOR = 0.65; // Phase 1 static buy price = MAKE_BASE × this
export const TOW_FACTOR = 0.55; // #4 towed-car ride-find: cheaper than the shop (a real bargain)

// 🏭 #5 Ustaxona crafting — the UPGRADE layer (beyond repair): make a car better than
// stock for a higher flip. All 3 stations are pure TANGA SINKS (no emission); the flip
// CAP (computeFlipGrant) still bounds the output, so over-crafting a cheap car just loses
// tanga (cap-protected). Distinct from repairZone (which only fixes damage to baseline).
export const CRAFT_MAX_LEVEL = 5;
export const CRAFT_PAINT_STEP = 0.04; // permanent repairQualityBonus boost per paint (clamped REPAIR_QUALITY_MAX)
export const CRAFT_STATIONS: { code: string; name: string; desc: string }[] = [
  { code: "TUNE", name: "🔧 Tюнинг stendi", desc: "Daraja +1 — flip narxi oshadi" },
  { code: "PAINT", name: "🎨 Bo'yoq kamerasi", desc: "Sifat +4% (doimiy)" },
  { code: "RESTORE", name: "⚙ To'liq restavratsiya", desc: "Barcha zonalar A'lo (MINT)" },
];
/** Crafting cost (tanga sink). TUNE scales with the current level; PAINT/RESTORE flat-ish. */
export function craftCost(station: string, basePrice: number, level: number): number {
  if (station === "TUNE") return Math.round(basePrice * 0.25 * Math.max(1, level));
  if (station === "PAINT") return Math.round(basePrice * 0.15);
  if (station === "RESTORE") return Math.round(basePrice * 0.5);
  return 0;
}

// #5 TIMED CRAFTING — the Workshop has ONE craftsman: only a SINGLE job runs at a time per
// member (cross-car contention — the core tradeoff). A job takes real time; a paid tanga
// SPEEDUP finishes it now. Durations: alive-feeling yet long enough to make the slot a choice.
export const CRAFT_DURATION_MS: Record<string, number> = {
  TUNE: 60 * 60 * 1000, // 1h
  PAINT: 45 * 60 * 1000, // 45m
  RESTORE: 2 * 60 * 60 * 1000, // 2h
};
export const CRAFT_SPEEDUP_PER_HOUR = 200; // tanga per remaining hour (rounded up)
export const CRAFT_SPEEDUP_MIN = 60;
/** Cost to instantly finish a running craft, by remaining time. Pure tanga sink (the crafted
 *  output is still bounded by the flip CAP, so this only ever loses tanga on a cheap car). */
export function craftSpeedupCost(remainingMs: number): number {
  const hours = Math.ceil(Math.max(0, remainingMs) / 3_600_000);
  return Math.max(CRAFT_SPEEDUP_MIN, hours * CRAFT_SPEEDUP_PER_HOUR);
}
export function craftDurationMs(station: string): number {
  return CRAFT_DURATION_MS[station] ?? 60 * 60 * 1000;
}

// ══ 🏛 P1-A — Motor Olami P1 config: Ofis market-maker, slots, CarCheck, lifespan, defects ══

/** Capital-remont (RESTORE craft) discount on resale price. count=0 → 100%, 1 → 85%, ...
 *  ≥4 → 40%. Hard floor 0.40 — bozor halolligi: ko'p remont qilingan mashina kam turadi. */
export function repairNarxFactor(capitalRepairCount: number): number {
  const table = [1.0, 0.85, 0.70, 0.55, 0.40];
  const i = Math.max(0, Math.min(4, Math.floor(capitalRepairCount)));
  return table[i]!;
}

/** 1067 Ofis bid price = OFIS_BID_FACTOR × max(askPrice, basePrice). Pure floor — Ofis never
 *  pays MORE than the player's ask. Clamped to basePrice baseline to avoid lowball spam. */
export const OFIS_BID_FACTOR = 0.8;
export function ofisBidPrice(askPrice: number, basePrice: number): number {
  const ref = Math.max(askPrice, basePrice);
  return Math.max(1, Math.floor(ref * OFIS_BID_FACTOR));
}

/** Slot purchase costs (slot 2 / 3 / 4). Default slot 1 = free. Keskin oshish → ko'p o'yinchi
 *  1 mashina bilan qoladi → jami mashina ≈ o'yinchilar soni (supply-demand asos). */
export const SLOT_COSTS: number[] = [0, 50_000, 250_000, 1_000_000];
export function slotCost(targetSlot: number): number {
  return SLOT_COSTS[Math.max(0, Math.min(SLOT_COSTS.length - 1, Math.floor(targetSlot - 1)))] ?? 0;
}

/** Hidden defect — 3% of acquired cars carry one (deterministic from serial seed). Only Premium
 *  CarCheck reveals it; not revealing it lets the seller pretend it's clean (reputation hit). */
export const HIDDEN_DEFECT_PROB = 0.03;
export interface HiddenDefect { zone: string; severity: "minor" | "major" }
/** Returns the defect if the serial hash falls in the 3% band, else null. Deterministic. */
export function hiddenDefectFor(serial: number, prob = HIDDEN_DEFECT_PROB): HiddenDefect | null {
  if (!Number.isFinite(serial) || serial <= 0) return null;
  const h = ((serial * 2654435761) >>> 0) % 10_000;
  const threshold = Math.max(0, Math.min(1, prob)) * 10_000;
  if (h >= threshold) return null;
  const zones = ["engine", "body", "transmission", "electric", "interior"];
  const zone = zones[(h >>> 4) % zones.length]!;
  const severity: "minor" | "major" = (h >>> 8) % 5 === 0 ? "major" : "minor";
  return { zone, severity };
}

/** CarCheck — 3 tier reveal of a car's history. Oddiy = basic; Ekspert = + zones + capital
 *  remont count; Premium = + hidden defect + reference price + seller rating. First Premium
 *  is FREE per player (newbie protection: don't burn a fresh player by hiding the defect rule). */
export const CARCHECK_TIERS = ["ODDIY", "EKSPERT", "PREMIUM"] as const;
export type CarCheckTier = (typeof CARCHECK_TIERS)[number];
export const CARCHECK_COSTS: Record<CarCheckTier, number> = { ODDIY: 50, EKSPERT: 500, PREMIUM: 5000 };
export interface CarCheckView {
  tier: CarCheckTier;
  serial: number | null;
  engineHp: number;
  ageDays: number;
  ownerCount: number;
  totalTrips: number;
  zones?: Record<string, number> | null; // EKSPERT+
  capitalRepairCount?: number; // EKSPERT+
  hiddenDefect?: HiddenDefect | null; // PREMIUM
  referencePrice?: number | null; // PREMIUM — taxminiy bozor narxi
  sellerRating?: number | null; // PREMIUM — 1..5
  freeOfChargeUsed?: boolean; // true if this was the player's free Premium
}

// reputation arc — the master-mechanic identity ladder (W5).
export const REPUTATION_TIERS: { name: string; min: number }[] = [
  { name: "Havaskor", min: 0 },
  { name: "Usta", min: 500 },
  { name: "Servis egasi", min: 2000 },
  { name: "Diler", min: 8000 },
  { name: "Koson afsonasi", min: 25000 },
];
export function reputationTier(score: number): string {
  let name = REPUTATION_TIERS[0]!.name;
  for (const t of REPUTATION_TIERS) if (score >= t.min) name = t.name;
  return name;
}
/** Garage tier 1..5 derived from reputation — gates style/feature unlocks. */
export function garageTierFromRep(score: number): number {
  let t = 1;
  for (let i = 0; i < REPUTATION_TIERS.length; i++) if (score >= REPUTATION_TIERS[i]!.min) t = i + 1;
  return t;
}

// ── W5 forgiving-streak ladder (grants are mission-style, OUTSIDE the ride clamp) ─
export const STREAK_LADDER: { day: number; grant: number; badge?: string }[] = [
  { day: 3, grant: 20 },
  { day: 5, grant: 30 },
  { day: 7, grant: 60, badge: "spare_tire" },
  { day: 14, grant: 100, badge: "14kun" },
  { day: 30, grant: 200, badge: "gold_plate" },
];
export const STREAK_FREEZE_DAY = 7; // a "spare tire" (one freeze) is earned at day 7
export const COMEBACK_GRANT = 25; // re-engagement bonus after ≥3 idle days (once/isoWeek)
export const COMEBACK_IDLE_DAYS = 3;

// ── W5 daily cipher (admin posts a 3-letter code; +30t once/day, 5 attempts max) ─
export const CIPHER_REWARD = 30;
export const CIPHER_MAX_ATTEMPTS = 5;

// ── W5 offline box — passive floor; tightly capped so it can never out-earn rides ─
export const OFFLINE_RATE_PER_LEVEL = 0.5; // tanga / (sumCarLevels·hour)
export const OFFLINE_MAX_HOURS = 24; // accrual stops at 24h since last collect
export const OFFLINE_DAILY_CAP = 75; // hard ceiling AFTER prestige multiplier (audit BLOCKER-4)
/** Offline-box payout: floor(sumCarLevels·rate·hours)·prestige, capped at OFFLINE_DAILY_CAP. */
export function offlineBoxPayout(sumCarLevels: number, hours: number, prestigeMultiplier = 1.0): number {
  const h = Math.max(0, Math.min(OFFLINE_MAX_HOURS, hours));
  const base = Math.floor(sumCarLevels * OFFLINE_RATE_PER_LEVEL * h);
  return Math.max(0, Math.min(OFFLINE_DAILY_CAP, Math.floor(base * prestigeMultiplier)));
}

// ── W5 prestige — reset for a permanent multiplier (≤1.25). Applies to offline box
// + flip raw (the flip CAP still bounds it, so this is pure within-cap upside). ───
export const PRESTIGE_MAX = 5;
export const PRESTIGE_STEP = 0.05;
export const PRESTIGE_REP_HEADSTART = 500; // +rep granted per prestige (matches the rep formula's prestigeCount·500)
export function prestigeMultiplier(count: number): number {
  return Math.min(1.25, 1.0 + Math.max(0, count) * PRESTIGE_STEP);
}

// ── W5 seasonal events (fixed-date ones are pure; lunar/admin ones are flag-driven) ─
export interface SeasonalEvent {
  code: string;
  name: string;
  rideEarnBonus: number; // pre-clamp ride-earn bonus (0 = none)
  flipBonusStyle?: RestoreStyle; // style that gets the flip bonus
  flipBonus?: number; // seasonalBonus fed to computeFlipGrant for the matching style
}
export const SEASONAL_EVENTS: { code: string; name: string; from: string; to: string; ev: SeasonalEvent }[] = [
  // Navruz: PERIOD_CORRECT cars sell +10% (spring classic-car season)
  { code: "navruz", name: "Navro'z", from: "03-21", to: "03-27", ev: { code: "navruz", name: "Navro'z", rideEarnBonus: 0.1, flipBonusStyle: "PERIOD_CORRECT", flipBonus: 0.1 } },
  // Mustaqillik: flag-color plate frame, no economy bonus (cosmetic week)
  { code: "mustaqillik", name: "Mustaqillik", from: "09-01", to: "09-07", ev: { code: "mustaqillik", name: "Mustaqillik", rideEarnBonus: 0 } },
  // Qish: winter — small flip nudge for FULL_RESTORE (cozy restorations)
  { code: "qish", name: "Qish", from: "12-20", to: "12-31", ev: { code: "qish", name: "Qish", rideEarnBonus: 0, flipBonusStyle: "FULL_RESTORE", flipBonus: 0.05 } },
  { code: "qish2", name: "Qish", from: "01-01", to: "01-03", ev: { code: "qish", name: "Qish", rideEarnBonus: 0, flipBonusStyle: "FULL_RESTORE", flipBonus: 0.05 } },
];
/** Active fixed-date seasonal event for a Tashkent "MM-DD" string, or null. */
export function activeSeasonalEvent(monthDay: string): SeasonalEvent | null {
  for (const s of SEASONAL_EVENTS) if (monthDay >= s.from && monthDay <= s.to) return s.ev;
  return null;
}

// ── #9 Muzey — a read-only showcase: which of the 11 models you've ever owned,
// your personal records, and the Hall of Fame (Prestige-5 legends). No money path.
export interface GarajMuseumView {
  collection: { carCode: string; name: string; emoji: string; owned: boolean }[];
  collectedCount: number;
  totalModels: number;
  totalFlips: number;
  bestProfit: number;
  hallOfFame: { name: string; prestigeCount: number; repAtEntry: number }[];
}

// ── #8 Exhibition — weekly car show. Winner prize is a bounded, idempotent grant;
// requires ≥2 entries so a solo player can't auto-farm it every week.
export const EXHIBITION_PRIZE = 1000;
export const EXHIBITION_MIN_ENTRIES = 2;
export interface GarajExhibitionEntryView {
  id: number;
  carCode: string;
  name: string;
  emoji: string;
  level: number;
  condition: string;
  votes: number;
  mine: boolean;
}
export interface GarajExhibitionView {
  entries: GarajExhibitionEntryView[];
  myEntryId: number | null;
  myVoteEntryId: number | null;
  lastWinner: { name: string; carName: string; emoji: string; votes: number } | null;
}

// ── #7 NPC personajlar — the 4 buyer archetypes become named, characterful people
// (Koson mahalla residents). Pure flavor/config (no money path): orders read like real
// commissions and the flip buyers have a face + a line. Browser + node safe.
export interface GarajNpc {
  code: string;
  name: string;
  emoji: string;
  buyer: BuyerArchetype;
  tagline: string;
  lines: string[];
}
// 12 NPCs — 3 distinct people per buyer archetype. The order board + flip buyer-picker
// pick one DETERMINISTICALLY by seed (order slot / saleId), so the same commission always
// shows the same face, and different commissions rotate through the cast. Pure flavor.
export const GARAJ_NPCS: GarajNpc[] = [
  // FAMILY_DRIVER ──
  { code: "hamid", name: "Hamid aka", emoji: "👨‍👧‍👦", buyer: "FAMILY_DRIVER", tagline: "Oilaviy haydovchi", lines: ["Oilam uchun ishonchli, keng mashina kerak.", "Bolalarni maktabga tashiyman — xavfsiz bo'lsin.", "Tejamkor bo'lsa — zo'r, aka."] },
  { code: "dilshod", name: "Dilshod aka", emoji: "🧔", buyer: "FAMILY_DRIVER", tagline: "Uch bolaning otasi", lines: ["Bagaji keng bo'lsin — bozorga boraman.", "Mator ishonchli bo'lsa bas, ortiqchasi shart emas.", "Yo'lda qolib ketmaydigani bo'lsin."] },
  { code: "nodira", name: "Nodira opa", emoji: "👩", buyer: "FAMILY_DRIVER", tagline: "Maktab o'qituvchisi", lines: ["Har kuni ishga qatnayman — kam yoqilg'i yesin.", "Toza, ozoda bo'lsa — menga shu yetadi.", "Pulга-arziydigan bo'lsin."] },
  // YOUNG_TUNER ──
  { code: "jahongir", name: "Jahongir", emoji: "🏎", buyer: "YOUNG_TUNER", tagline: "Yosh tюner", lines: ["Ko'chada eng zo'ri men bo'lay!", "Tюнинг bo'lsin — ovozi gumburlasin.", "Sport ruhi bo'lsin, aka."] },
  { code: "sardor", name: "Sardor", emoji: "🔥", buyer: "YOUNG_TUNER", tagline: "Drift ishqibozi", lines: ["Past tushirilgan, qattiq podveska — shu!", "Disklari yarqirasin, akusi bo'g'iq bo'lsin.", "Tezligi bo'lsin — qolgani keyin."] },
  { code: "bekzod", name: "Bekzod", emoji: "🎧", buyer: "YOUNG_TUNER", tagline: "Studentlar lideri", lines: ["Ichi yangilangan, ekranli bo'lsin.", "Rangi yorqin — ko'zga tashlanadigan bo'lsin.", "Instagramga qo'yaman — chiroyli bo'lsin!"] },
  // NEWLYWED ──
  { code: "maftuna", name: "Maftuna", emoji: "💍", buyer: "NEWLYWED", tagline: "Kelin", lines: ["To'yimga chiroyli, yaltiroq mashina kerak.", "Bir kunlik — lekin esda qolsin.", "Toza va nafis bo'lsin."] },
  { code: "gulnoza", name: "Gulnoza", emoji: "💐", buyer: "NEWLYWED", tagline: "Kuyov singlisi", lines: ["Oq rangli, bezatilgan bo'lsin.", "Kortejda eng ko'rkamı bo'lsin.", "Suratga tushganda yarqirasin."] },
  { code: "aziz", name: "Aziz", emoji: "🤵", buyer: "NEWLYWED", tagline: "Kuyov", lines: ["Hayotimning eng katta kuni — eng yaxshisi bo'lsin.", "Ichi-tashi besh baho bo'lsin.", "Pulni ayamayman — sifat bo'lsin."] },
  // COLLECTOR ──
  { code: "karim", name: "Usta Karim", emoji: "🎩", buyer: "COLLECTOR", tagline: "Kolleksioner", lines: ["Faqat asl holat — davr ruhi bo'lsin.", "Retro qadrli; tюнинг — yo'q.", "Kolleksiyamga arziydigan bo'lsin."] },
  { code: "rustam", name: "Rustam aka", emoji: "📜", buyer: "COLLECTOR", tagline: "Antikvar", lines: ["Zavoddan qanday chiqqan bo'lsa — shundayligi muhim.", "Har bir detal asl bo'lsin.", "Davr guvohi — uni asrayman."] },
  { code: "anvar", name: "Anvar boboy", emoji: "🧓", buyer: "COLLECTOR", tagline: "Keksa havaskor", lines: ["Yoshligimdagi mashina — qadrini bilaman.", "Toza restavratsiya bo'lsin, bo'yoq asl rangda.", "Bunaqasini endi topib bo'lmaydi."] },
];
/** Pick one NPC of the buyer's archetype, deterministically by seed (so a given order/sale
 *  always shows the same person, and different ones rotate through the 3 per archetype). */
export function npcForBuyer(buyer: BuyerArchetype, seed = 0): GarajNpc {
  const pool = GARAJ_NPCS.filter((n) => n.buyer === buyer);
  if (pool.length === 0) return GARAJ_NPCS[0]!;
  return pool[Math.abs(seed) % pool.length]!;
}
export function npcLine(npc: GarajNpc, seed: number): string {
  return npc.lines[Math.abs(seed) % npc.lines.length]!;
}

// ── #2 NPC Buyurtma (order) board — 3 deterministic daily commissions. Fulfilling
// one (flip a matching car: carCode + style + buyer) pays a BONUS on top of the flip.
// The bonus is a separate idempotent grant (NOT through computeFlipGrant), bounded by
// 3 slots × ORDER_BONUS_MAX/day, so it can't touch the flip cap or the ride clamp. ─
export const ORDER_SLOTS = 3;
export const ORDER_BONUS_MIN = 120;
export const ORDER_BONUS_MAX = 400;
export interface GarajDailyOrder {
  slot: number;
  carCode: string;
  style: RestoreStyle;
  buyer: BuyerArchetype;
  bonus: number;
  done?: boolean; // filled per-member by the server
}
/** 3 deterministic daily orders from a day-seed. Always picks a profitable (non-rejected)
 *  buyer×style so the order is fulfillable; bonus scales with car value (clamped). */
export function dailyOrders(seed: number): GarajDailyOrder[] {
  const cars = Object.keys(MAKE_BASE);
  const styles: RestoreStyle[] = ["QUICK_FLIP", "FULL_RESTORE", "TUNING", "PERIOD_CORRECT"];
  const buyers: BuyerArchetype[] = ["FAMILY_DRIVER", "YOUNG_TUNER", "NEWLYWED", "COLLECTOR"];
  const out: GarajDailyOrder[] = [];
  for (let s = 0; s < ORDER_SLOTS; s++) {
    const r = (seed >>> (s * 7)) >>> 0;
    const carCode = cars[r % cars.length]!;
    let style = styles[(r >>> 3) % styles.length]!;
    let buyer = buyers[(r >>> 6) % buyers.length]!;
    if (BUYER_STYLE_MATCH[buyer][style] <= -1) {
      style = "FULL_RESTORE";
      buyer = "FAMILY_DRIVER";
    } // never an impossible order
    const base = MAKE_BASE[carCode] ?? 1000;
    const bonus = Math.max(ORDER_BONUS_MIN, Math.min(ORDER_BONUS_MAX, Math.round(base * 0.08)));
    out.push({ slot: s, carCode, style, buyer, bonus });
  }
  return out;
}

// ── #6 Haftalik eventlar — one auto-rotating live event per ISO week (admin can
// override). Each effect is money-safe: discount LOWERS a sink; bonus_orders only
// scales the already-bounded order bonus; double_drops adds item offers (no emission);
// xp_boost is progression. The active event shows as a chip at the top of the screen.
export interface GarajWeeklyEvent {
  type: string;
  label: string;
  mult: number;
}
export const WEEKLY_EVENTS: GarajWeeklyEvent[] = [
  { type: "discount_service", label: "🔧 Arzon ta'mir haftasi (−20%)", mult: 0.8 },
  { type: "bonus_orders", label: "📋 Buyurtma bonusi ×1.5", mult: 1.5 },
  { type: "double_drops", label: "📦 Ko'p yo'l-sovg'asi haftasi", mult: 2 },
  { type: "xp_boost", label: "⭐ Tezkor o'sish — XP ×2", mult: 2 },
];
export const ORDER_BONUS_EVENT_CAP = 600; // hard ceiling on a single order bonus even with the event mult
/** Deterministic weekly event from a week-seed (rotates each ISO week). */
export function weeklyEvent(weekSeed: number): GarajWeeklyEvent {
  return WEEKLY_EVENTS[Math.abs(weekSeed) % WEEKLY_EVENTS.length]!;
}

// ── #3 Demand waves — a per-car multiplier (0.70..1.50) from real activity, via a tanh
// sigmoid on NET pressure = demand − supply. Stored in AppState market:demand:{carCode},
// recomputed in the sweep. Drives the shop buy price (full range — a SINK, so safe) and a
// small flip nudge (clamped ≤±0.12, fed like seasonalBonus, so the flip CAP still bounds it). ─
export const DEMAND_MIN = 0.7;
export const DEMAND_MAX = 1.5;
export const DEMAND_FLIP_BONUS_MAX = 0.12; // demand's flip contribution caps at +12% (within-cap)
/** Demand multiplier via a logistic (tanh) curve, neutral = 1.0.
 *  - demand rises with recent SALES (completed flips) + real ride activity for the model.
 *  - supply COOLS it and is VALUE-WEIGHTED inventory: Σ(open-listing askPrice) ÷ basePrice,
 *    NOT a raw listing count — so a player cannot pump demand by spamming cheap listings
 *    (more/pricier listings only push demand DOWN). [MAJOR-2 anti-manipulation guard.]
 *  Range [0.70, 1.50], centered at 1.0. */
export function demandMultiplier(sig: { ridesLast7d: number; salesLast24h: number; supplyUnits: number }): number {
  const demand = Math.min(12, Math.max(0, sig.salesLast24h)) * 1.0 + Math.min(20, Math.max(0, sig.ridesLast7d)) * 0.15;
  const supply = Math.min(15, Math.max(0, sig.supplyUnits));
  const s = Math.tanh(0.4 * (demand - supply)); // −1..1, 0 at neutral (demand == supply)
  const raw = s >= 0 ? 1.0 + (DEMAND_MAX - 1.0) * s : 1.0 + (1.0 - DEMAND_MIN) * s;
  return Math.max(DEMAND_MIN, Math.min(DEMAND_MAX, Math.round(raw * 100) / 100));
}
/** The flip-side nudge from demand: maps the multiplier to a [−0.12,+0.12] bonus fed into
 *  computeFlipGrant as seasonalBonus-style (cap-bounded). Stays small even though the buy-
 *  price range widened, so the flip worst-case is unchanged. */
export function demandFlipBonus(mult: number): number {
  return Math.max(-DEMAND_FLIP_BONUS_MAX, Math.min(DEMAND_FLIP_BONUS_MAX, mult - 1.0));
}

// ══ 🌍 MOTOR OLAMI (v3) — mashina pul ishlaydi (passiv earn). Flag "motorolami" (DEFAULT_OFF).
// Earn = speed×soat; yoqilg'i (70%, dial bilan) + eyilish (10%, engineHp↓) SINK; net qoladi.
// engineHp 100→0 (~14 kun) = umr → o'lim. Chore yo'q: kunlik avtomatik, «Yig'ish» tugmasi. ══
export const MOTOR_FLAG = "motorolami";
export const MOTOR_SPEED_RATE = 0.018; // speed (t/soat) = basePrice × rate (sim-tuned)
export const MOTOR_FUEL_PCT = 0.7; // yoqilg'i = gross×70% (SINK; ×fuelMult dial)
export const MOTOR_WEAR_PCT = 0.1; // eyilish = gross×10% (SINK + engineHp↓)
export const MOTOR_MAX_ACCRUE_HOURS = 24; // bir «Yig'ish»da ≤24 soat (anti-hoard + emission bound)
export const MOTOR_TAXI_MULT = 2; // real taksida 2×
export const MOTOR_LIFESPAN_DAYS = 14; // umr (engineHp 0 ga tushishi)
export const MOTOR_WEAR_PER_DAY = 100 / MOTOR_LIFESPAN_DAYS; // engineHp/kun (~7.14)
export const MOTOR_FUELMULT_MIN = 0.5; // yoqilg'i-dial chegarasi (sink o'lmasin / absurd bo'lmasin)
export const MOTOR_FUELMULT_MAX = 2.0;

// 🎛 OPERATOR IQTISOD-DASTAKLARI — admin paneldan jonli boshqariladi (AppState "mo:econ" JSON).
// Har knob CLAMP'langan (admin xato qiymat bersa ham iqtisod buzilmaydi). live:true = P0'da
// hozir qo'llanadi (fuelMult, speedMult); live:false = P2 speeder uchun ro'yxatga olingan.
export interface MotorEconKnob { key: string; label: string; def: number; min: number; max: number; step: number; live: boolean }
export const MOTOR_ECON_KNOBS: MotorEconKnob[] = [
  { key: "fuelMult", label: "⛽ Yoqilg'i narxi (×)", def: 1, min: MOTOR_FUELMULT_MIN, max: MOTOR_FUELMULT_MAX, step: 0.05, live: true },
  { key: "speedMult", label: "⚡ Daromad tezligi (×)", def: 1, min: 0.25, max: 2, step: 0.05, live: true },
  // 🎁 BONUS HAFTASI — yangi o'yinchini ilashtirish ("birinchi N kun zo'r pul ishlasin"). bonusDays=0 → OFF.
  // Stamp acquireCar'da: motorBonusUntilAt = now + bonusDays. Vaqt o'tguncha bonus* multiplikator qo'llanadi.
  { key: "bonusDays", label: "🎁 Bonus kunlar (0=o'chiq)", def: 0, min: 0, max: 30, step: 1, live: true },
  { key: "bonusFuelMult", label: "🎁 Bonus yoqilg'i (×)", def: 0.3, min: 0.1, max: 1, step: 0.05, live: true },
  { key: "bonusSpeedMult", label: "🎁 Bonus tezlik (×)", def: 2, min: 1, max: 3, step: 0.1, live: true },
  { key: "speederPrice", label: "🚀 Speeder narxi (tanga)", def: 5000, min: 500, max: 50000, step: 100, live: true },
  { key: "speederStock", label: "🚀 Speeder zaxira (dona)", def: 500, min: 0, max: 100000, step: 50, live: true },
  { key: "speederMult", label: "🚀 Speeder kuchi (×)", def: 4, min: 2, max: 6, step: 1, live: true },
  // 🔥 P-Fuel-A — bak o'lchami va push siyosati (push P-Fuel-C da jonlanadi)
  { key: "fuelTankHours", label: "⛽ Bak hajmi (soat)", def: 24, min: 6, max: 72, step: 1, live: true },
  { key: "pushFeatureOn", label: "🔔 Push kill-switch", def: 1, min: 0, max: 1, step: 1, live: false },
  { key: "pushWarnPct", label: "🔔 Ogohlantirish % (yoqilg'i)", def: 30, min: 10, max: 50, step: 1, live: false },
  { key: "pushQuietStartHour", label: "🌙 Sukut boshi (Toshkent)", def: 23, min: 18, max: 23, step: 1, live: false },
  { key: "pushQuietEndHour", label: "🌅 Sukut oxiri (Toshkent)", def: 7, min: 5, max: 10, step: 1, live: false },
  // 🏛 P1-A — Motor Olami P1 admin dastaklari (Ofis market-maker, slots, CarCheck, defects)
  { key: "ofisBidFactor", label: "🏛 Ofis bid foizi", def: 0.8, min: 0.5, max: 0.95, step: 0.05, live: false },
  { key: "ofisDailyBudget", label: "🏛 Ofis kunlik byudjet (tanga)", def: 100000, min: 10000, max: 1000000, step: 5000, live: false },
  { key: "lifespanDays", label: "⏳ Mashina umri (kun)", def: 14, min: 7, max: 30, step: 1, live: false },
  { key: "hiddenDefectPct", label: "🕵 Yashirin nuqson %", def: 3, min: 0, max: 10, step: 0.5, live: false },
  { key: "carCheckOddiy", label: "🔍 CarCheck Oddiy (tanga)", def: 50, min: 10, max: 200, step: 10, live: false },
  { key: "carCheckEkspert", label: "🔍 CarCheck Ekspert (tanga)", def: 500, min: 100, max: 2000, step: 50, live: false },
  { key: "carCheckPremium", label: "🔍 CarCheck Premium (tanga)", def: 5000, min: 1000, max: 20000, step: 100, live: false },
  { key: "slot2Cost", label: "🪪 Slot 2 narxi", def: 50000, min: 10000, max: 200000, step: 1000, live: false },
  { key: "slot3Cost", label: "🪪 Slot 3 narxi", def: 250000, min: 50000, max: 500000, step: 5000, live: false },
  { key: "slot4Cost", label: "🪪 Slot 4 narxi", def: 1000000, min: 200000, max: 2000000, step: 10000, live: false },
  // 🔗 P2-A — Merge mechanic admin dastaklari (anti-inflyatsiya bounded)
  { key: "mergeBonusPct", label: "🔗 Merge bonus % (har bosqich)", def: 10, min: 0, max: 30, step: 1, live: false },
  { key: "mergeMaxCount", label: "🔗 Merge maksimum bosqich", def: 3, min: 1, max: 5, step: 1, live: false },
  // 🎁 P2-B — Jackpot rarity admin dastaklari (1/N qiymati past = ko'p uchraydi)
  { key: "variantQoraNexiaOneIn", label: "🎁 Qora Nexia (1/N)", def: 100, min: 10, max: 10000, step: 10, live: false },
  { key: "variantAfsonaviyTikoOneIn", label: "🎁 Afsonaviy Tiko (1/N)", def: 2000, min: 100, max: 100000, step: 50, live: false },
];

// 🚀 P2-C — Speeder booster (limited stock, 10-day duration, admin-tuned ×N to speedMult)
export const SPEEDER_DAYS = 10;
/** True iff `speederUntilAt` is in the future. */
export function isSpeederActive(speederUntilAt: Date | string | null | undefined, now: number = -1): boolean {
  if (!speederUntilAt) return false;
  const u = typeof speederUntilAt === "string" ? new Date(speederUntilAt).getTime() : speederUntilAt.getTime();
  // -1 sentinel = read clock now (caller can pass an explicit number for determinism)
  const n = now === -1 ? Date.now() : now;
  return u > n;
}

// 🎁 P2-B — Jackpot rarity variants (deterministic from serial — no grinding, no manipulation).
// Each variant gates on a specific carCode (only Nexia rolls Qora, only Tiko rolls Afsonaviy)
// and has a fixed `oneIn` rarity. variantFor(carCode, serial, oneIn) returns the variant key
// or null. Display side reads the variant key from GarajCar.variant and renders the badge.
export interface MotorVariant { key: string; carCode: string; oneInDefault: number; mult: number; label: string; emoji: string }
export const MOTOR_VARIANTS: MotorVariant[] = [
  { key: "qora_nexia", carCode: "nexia", oneInDefault: 100, mult: 1.5, label: "Qora Nexia", emoji: "⚫" },
  { key: "afsonaviy_tiko", carCode: "tiko", oneInDefault: 2000, mult: 3.0, label: "Afsonaviy Tiko", emoji: "🏆" },
];
/** Look up variant metadata by key (server reads from GarajCar.variant string). */
export function getVariant(key: string | null | undefined): MotorVariant | null {
  if (!key) return null;
  return MOTOR_VARIANTS.find((v) => v.key === key) ?? null;
}
/** Deterministic variant roll for a specific carCode given the global #serial.
 *  Hash uses a different multiplier than hiddenDefectFor to ensure independence
 *  (a defective car can still be Qora — they're separate rolls).
 *  Returns the variant key (string) or null. `oneInOverride` lets the admin tune rarity. */
export function variantFor(carCode: string, serial: number, oneInOverride?: Partial<Record<string, number>>): string | null {
  for (const v of MOTOR_VARIANTS) {
    if (v.carCode !== carCode) continue;
    const oneIn = Math.max(2, Math.floor(oneInOverride?.[v.key] ?? v.oneInDefault));
    // Deterministic — different prime from hiddenDefect (16777619 = FNV prime)
    const hash = ((serial * 16777619) >>> 0) % oneIn;
    if (hash === 0) return v.key;
  }
  return null;
}

// 🔗 P2-A — Merge mechanic constants + helpers (anti-inflyatsiya: 2 cars → 1 buffed; supply DROPS)
export const MERGE_BONUS_PCT = 0.10; // each merge step adds +10% to basePrice/flip computation
export const MERGE_MAX_COUNT = 3; // hard cap (anti-runaway: cap +30%, then the car must be sold)
/** mergeMult — multiplies the promoted car's effective basePrice for flip/Ofis-bid/CarCheck.
 *  e.g., mergeCount=0 → 1.00; mergeCount=1 → 1.10; mergeCount=2 → 1.20; mergeCount=3 → 1.30. */
export function mergeMult(mergeCount: number, bonusPctOverride?: number): number {
  const pct = (bonusPctOverride ?? MERGE_BONUS_PCT * 100) / 100;
  const n = Math.max(0, Math.min(MERGE_MAX_COUNT, mergeCount));
  return 1 + n * pct;
}
/** Bonus aktivmi va effektiv (fuel, speed) multiplikatorlar — bonus base econ ustiga ko'paytiriladi.
 *  Pol/tom himoyasi: bonus paytida ham fuel ≥0.1 (sink hech qachon o'lmasin), speed ≤6 (worst-case ceil). */
export function effectiveEcon(base: Record<string, number>, bonusActive: boolean): { fuelMult: number; speedMult: number } {
  const f = (base.fuelMult ?? 1) * (bonusActive ? (base.bonusFuelMult ?? 0.3) : 1);
  const s = (base.speedMult ?? 1) * (bonusActive ? (base.bonusSpeedMult ?? 2) : 1);
  return { fuelMult: Math.max(0.1, Math.min(2, f)), speedMult: Math.max(0.25, Math.min(6, s)) };
}
export function clampMotorEcon(key: string, val: number): number {
  const k = MOTOR_ECON_KNOBS.find((x) => x.key === key);
  if (!k || isNaN(val)) return k?.def ?? val;
  return Math.max(k.min, Math.min(k.max, val));
}
export function motorEconDefaults(): Record<string, number> {
  return Object.fromEntries(MOTOR_ECON_KNOBS.map((k) => [k.key, k.def]));
}
/** speed (t/soat) modelga qarab — basePrice'dan kelib chiqadi (hamma 11 mashina avto-qamraladi). */
export function motorSpeed(carCode: string): number {
  return Math.max(1, Math.round((MAKE_BASE[carCode] ?? 1000) * MOTOR_SPEED_RATE));
}
/** Bir «Yig'ish» daromadi. hours service'da ≤MOTOR_MAX_ACCRUE_HOURS ga capped. fuelMult = dial.
 *  taxiHours = shu davrda real taksida o'tgan soat (o'sha qismda 2×). net = gross − fuel − wear.
 *  LEGACY (auto-deduct model) — saqlanadi backward-compat uchun va testlar uchun. P-Fuel-A
 *  dan keyin motorCollect computeMotorEarnNoFuel ni ishlatadi (manual refuel modeli). */
export function computeMotorEarn(speedPerHour: number, hours: number, fuelMult = 1, taxiHours = 0): { gross: number; fuel: number; wear: number; net: number } {
  const h = Math.max(0, Math.min(hours, MOTOR_MAX_ACCRUE_HOURS));
  const taxiBonus = speedPerHour * Math.min(h, Math.max(0, taxiHours)) * (MOTOR_TAXI_MULT - 1);
  const gross = Math.round(speedPerHour * h + taxiBonus);
  const fm = Math.max(MOTOR_FUELMULT_MIN, Math.min(MOTOR_FUELMULT_MAX, fuelMult));
  const fuel = Math.round(gross * MOTOR_FUEL_PCT * fm);
  const wear = Math.round(gross * MOTOR_WEAR_PCT);
  const net = Math.max(0, gross - fuel - wear);
  return { gross, fuel, wear, net };
}

/** P-Fuel-A: manual fuel-fill model. Yoqilg'i AVTO yechilmaydi — o'yinchi oldindan to'laydi
 *  (motorRefuel), keyin tank davomida gross−wear minted bo'ladi. NET ekspektatsiyada bir xil
 *  (refill cost ≈ avvalgi auto-fuel sink). speedMult faqat EARN ga ta'sir qiladi, fuelMult
 *  faqat REFILL narxiga (burn-rate wall-clock only). */
export function computeMotorEarnNoFuel(speedPerHour: number, hours: number, taxiHours = 0): { gross: number; wear: number; net: number } {
  const h = Math.max(0, Math.min(hours, MOTOR_MAX_ACCRUE_HOURS));
  const taxiBonus = speedPerHour * Math.min(h, Math.max(0, taxiHours)) * (MOTOR_TAXI_MULT - 1);
  const gross = Math.round(speedPerHour * h + taxiBonus);
  const wear = Math.round(gross * MOTOR_WEAR_PCT);
  const net = Math.max(0, gross - wear);
  return { gross, wear, net };
}
/** Refill narxi. Har refill da QAYTA hisoblanadi (cache YO'Q) — admin fuelMult o'zgarsa darhol qo'llanadi.
 *  Tank lasts tankHours wall-clock. cost ≈ avvalgi auto-sink (gross × fuel_pct × fuelMult). */
export function computeMotorRefillCost(carCode: string, tankHours: number, fuelMult: number): number {
  const sp = motorSpeed(carCode);
  const h = Math.max(1, Math.min(72, tankHours));
  const fm = Math.max(MOTOR_FUELMULT_MIN, Math.min(MOTOR_FUELMULT_MAX, fuelMult));
  // Math.ceil → refill always over-charges by ≤0.5 tanga, keeps sink ≥80% gross at all rounding edges
  return Math.max(1, Math.ceil(sp * h * MOTOR_FUEL_PCT * fm));
}

// 🌍 ochiq profil — boshqa o'yinchining garajini ko'rish (status/maqtanish, P0 litmus).
export interface PublicProfileView {
  memberId: number;
  name: string;
  reputation: number;
  garageValue: number; // jami taxminiy qiymat
  rank: number | null;
  cars: { serial: number | null; carCode: string; name: string; emoji: string; engineHp: number; dead: boolean }[];
  // P1-E — sotuvchi reputatsiyasi (rateSeller average); null if no ratings yet
  sellerRating?: { avg: number; count: number } | null;
  // P1-F — ✨ ORZU: Clean History badge holder?
  cleanHistoryCount?: number; // how many cars meet capitalRepairCount===0 && ownerCount===1
}

// ── DTOs shared between the server and the mini-app (browser-safe) ────────────
export interface GarajCarView {
  id: number;
  carCode: string;
  name: string;
  emoji: string;
  basePrice: number;
  source: string;
  condition: CarCondition;
  style: RestoreStyle | null;
  level: number;
  diagnosed: boolean;
  diagnosis: Record<string, number> | null; // revealed condition zones (0-100)
  zones: Record<string, number> | null; // CURRENT per-zone condition (post-repair), 0-100
  acquireCost: number;
  repairSpent: number;
  // 🌍 motorolami (flag ON bo'lsa to'ldiriladi; OFF da null/undefined)
  serial?: number | null; // global #raqam
  engineHp?: number; // 0-100 (eyilish)
  ageDays?: number; // bornAt'dan beri
  dead?: boolean; // engineHp ≤ 0 → daromad 0, "eskirdi" prompt
  speed?: number; // t/soat
  earnPendingNet?: number; // hozir «Yig'ish» bersa keladigan net
  ownerCount?: number;
  totalTrips?: number;
  // 🔥 P-Fuel-A — manual fuel-fill model
  fuelPct?: number; // 0-100, qancha qoldi (hozirgi hisob: clamp(((fueledUntilAt - now) / tankMs) * 100))
  fuelHoursLeft?: number; // float, soatlarda — push trigger uchun + UI countdown
  fuelDry?: boolean; // tank tugagan → daromad 0 · «Quyish» CTA Yig'ish o'rnini bosadi
  fuelRefillCost?: number; // hozirgi refill narxi (admin fuelMult o'zgarsa darhol yangilanadi)
  // 🏛 P1-A — Motor Olami P1 (P1-B+ services populate)
  capitalRepairCount?: number; // capital remont counter — feeds REPAIR_NARX_FACTOR (CarCheck Ekspert)
  hasHiddenDefect?: boolean; // boolean hint for UI (true → "yashirin nuqson bo'lishi mumkin"); actual zone/severity at Premium tier
  ofisBidPrice?: number; // hozirgi 1067 Ofis bid (basePrice + factor); UI "Ofis 80% ga oladi" chip
  cleanHistory?: boolean; // ✨ badge: capitalRepairCount===0 && ownerCount===1 (P1-F ORZU)
  mergeCount?: number; // 🔗 P2-A — merge bosqichi (0..MERGE_MAX_COUNT); 0 → oddiy, 1+ → "Toplangan ★N"
  variant?: string | null; // 🎁 P2-B — Jackpot variant key (qora_nexia, afsonaviy_tiko); null=oddiy
  speederActive?: boolean; // 🚀 P2-C — speeder shu mashinada aktivmi
  speederHoursLeft?: number; // 🚀 P2-C — qancha soat qoldi (countdown UCHUN)
  speederMult?: number; // 🚀 P2-C — aktiv bo'lsa: admin's speederMult; aks holda 1
}
export interface GarajShopItem {
  carCode: string;
  name: string;
  emoji: string;
  buyPrice: number;
  owned: boolean;
  demandMult?: number; // #3 live demand (1.0 = neutral); buyPrice already reflects it
}
export interface GarajSkillView {
  ustaKozRank: number; // 0..100
  muhandis: number; // tier 1..5
  kuzovchi: number;
  savdogar: number;
  kollektsioner: number;
  muhandisXp: number;
  kuzovchiXp: number;
  savdogarXp: number;
  kollektsionerXp: number;
}
export interface GarajStreakView {
  current: number;
  longest: number;
  freezeAvailable: boolean;
  nextMilestone: number | null; // next ladder day, or null if past the top
}
export interface GarajCipherView {
  solvedToday: boolean;
  attemptsLeft: number;
  reward: number;
  hasCode: boolean; // admin set today's code? (UI shows pad vs "bugun kod yo'q")
}
export interface GarajPrestigeView {
  count: number;
  multiplier: number;
  eligible: boolean; // tier 5 + all cars maxed (computed server-side)
}
export interface GarajMahallaView {
  id: number;
  name: string;
  code: string;
  weeklyScore: number;
  memberCount: number;
  rank: number; // live league rank (1-based), 0 if unranked
  role: string;
}
export interface GarajRoadDrop {
  id: number;
  carCode: string;
  name: string;
  emoji: string;
  price: number; // discounted tow price (TOW_FACTOR × base)
  expiresAt: string;
}
// #5 the single in-progress craft job (the shared Workshop slot), or null when idle.
export interface GarajCraftJobView {
  id: number;
  garajCarId: number;
  carName: string;
  emoji: string;
  station: string;
  stationName: string;
  finishesAt: string; // ISO; client counts down
  ready: boolean; // finishesAt <= now (effect applies on the next sweep)
  speedupCost: number; // tanga to finish now (0 once ready)
}
export interface GarajStateResponse {
  enabled: boolean;
  coins: number;
  kozacha: number;
  garageTier: number;
  reputationScore: number;
  reputationName: string;
  onboardStep: number;
  cars: GarajCarView[];
  shop: GarajShopItem[];
  skill: GarajSkillView;
  streak: GarajStreakView;
  cipher: GarajCipherView;
  prestige: GarajPrestigeView;
  offlineBoxPending: number; // collectable tanga right now (0 if none / already today)
  seasonalEvent: string | null; // active event display name, or null
  mahalla: GarajMahallaView | null;
  orders: GarajDailyOrder[]; // #2 today's 3 NPC commissions (done flag per member)
  roadDrops: GarajRoadDrop[]; // #4 pending towed-car offers from real rides
  weeklyEvent: GarajWeeklyEvent | null; // #6 this week's live event (chip)
  exhibition: GarajExhibitionView; // #8 weekly car show (entries + my vote + last winner)
  craftJob: GarajCraftJobView | null; // #5 the one running Workshop craft (shared slot), or null
  motorEnabled?: boolean; // 🌍 motorolami flag — UI shows earn/serial/age when true
  motorBonus?: { active: boolean; untilAt: string | null; daysLeft: number; speedMult: number; fuelMult: number } | null;
}
export interface GarajActionResult {
  ok: boolean;
  reason?: string;
  coins?: number;
  carId?: number;
  grant?: number;
  profit?: number;
  orderBonus?: number; // #2 NPC-order bonus paid on this flip (matched a daily order)
}

// ✨ P1-F — ORZU board (global ranking + per-model Top-1)
export interface OrzuTopOwner {
  rank: number;
  memberId: number;
  name: string;
  garageValue: number; // sum of MAKE_BASE × active cars
  carCount: number;
  cleanHistoryCount: number; // cars meeting cleanHistory criteria
  topSerial?: number | null; // shiniest serial in the garage (lowest serial wins)
}
export interface OrzuModelTop {
  carCode: string;
  name: string;
  emoji: string;
  champion: { memberId: number; name: string; serial: number; engineHp: number } | null;
}
export interface OrzuBoardView {
  topGarages: OrzuTopOwner[]; // global Top 20 by garageValue
  modelChampions: OrzuModelTop[]; // per-model #1 (oldest active serial wins — Muzey extend)
  myRank: number | null; // viewer's own rank (null if unranked)
}
