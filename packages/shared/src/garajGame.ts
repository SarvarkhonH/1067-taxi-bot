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

// era cars eligible for PERIOD_CORRECT style + COLLECTOR buyer
export const ERA_CARS = ["tiko", "damas", "matiz", "nexia"] as const;

// ── ride → game drop table (deterministic bucket 0..999, server seeds it) ─────
export const DROP_BUCKETS: Record<string, readonly [number, number]> = {
  PART_COMMON: [0, 399],
  PART_RARE: [400, 599],
  TOWED_CAR: [600, 699],
  CUSTOMER_VISIT: [700, 799],
  GUEST_CAR: [800, 879],
  PARTS_CRATE: [880, 929],
  BARN_FIND_HINT: [930, 969],
  MECHANIC_TIP: [970, 989],
  LEGENDARY_PART: [990, 999],
};

// ── costs / sinks ─────────────────────────────────────────────────────────────
export const INSPECT_COSTS = { VISUAL_OWN: 0, VISUAL_MARKET: 30, TOOL: 120, EXPERT: 400 } as const;
export const PART_SHOP_PRICES: Record<string, number> = { SALVAGE: 40, STD: 80, OEM: 200, SPORT: 500 };

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

// repair outcome thresholds on the 0..1 quality score
export const REPAIR_OUTCOME = {
  EXCELLENT: { min: 0.85, cond: [55, 70] as const, bonus: 1.05 },
  GOOD: { min: 0.65, cond: [35, 50] as const, bonus: 1.0 },
  FAIR: { min: 0.4, cond: [15, 25] as const, bonus: 1.0 },
  DEFECT: { min: 0, cond: [-20, -10] as const, bonus: 1.0 },
} as const;

// ── emission guards (the new game's own caps; ride-coins still ≤350 via grantRideCoins) ─
export const FLIP_DAILY_CAP = 8000; // tanga/member/day flip emission cap (audit B4)
export const KOZACHA_PER_MIN = 1; // 🏺 kozacha per ride-minute
export const KOZACHA_RIDE_CAP = 8; // max kozacha per ride
export const NPC_FLOOR_RATE = 0.7; // NPC "Avtokomissiya" buys at 70% of resale
export const NPC_DAILY_BUDGET = 5000; // tanga/day total NPC floor emission

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
export function kozachaItem(code: string): { code: string; name: string; cost: number; factor: number } | undefined {
  return KOZACHA_SHOP.find((i) => i.code === code);
}

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

/** Resale value used by the NPC floor + as the flip basePrice anchor. */
export function resaleValue(basePrice: number, condition: CarCondition, bestStyleMult = 1.0): number {
  return Math.round(basePrice * bestStyleMult * CONDITION_MULT[condition]);
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
export const GARAJ_NPCS: GarajNpc[] = [
  { code: "hamid", name: "Hamid aka", emoji: "👨‍👧‍👦", buyer: "FAMILY_DRIVER", tagline: "Oilaviy haydovchi", lines: ["Oilam uchun ishonchli, keng mashina kerak.", "Bolalarni maktabga tashiyman — xavfsiz bo'lsin.", "Tejamkor bo'lsa — zo'r."] },
  { code: "jahongir", name: "Jahongir", emoji: "🏎", buyer: "YOUNG_TUNER", tagline: "Yosh tюner", lines: ["Ko'chada eng zo'ri men bo'lay!", "Tюнинг bo'lsin — ovozi gumburlasin.", "Sport ruhi bo'lsin, aka."] },
  { code: "maftuna", name: "Maftuna", emoji: "💍", buyer: "NEWLYWED", tagline: "Kelin-kuyov", lines: ["To'yimga chiroyli, yaltiroq mashina kerak.", "Bir kunlik — lekin esda qolsin.", "Toza va nafis bo'lsin."] },
  { code: "karim", name: "Usta Karim", emoji: "🎩", buyer: "COLLECTOR", tagline: "Kolleksioner", lines: ["Faqat asl holat — davr ruhi bo'lsin.", "Retro qadrli; tюнинг — yo'q.", "Kolleksiyamga arziydigan bo'lsin."] },
];
export function npcForBuyer(buyer: BuyerArchetype): GarajNpc {
  return GARAJ_NPCS.find((n) => n.buyer === buyer) ?? GARAJ_NPCS[0]!;
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

// ── #3 Demand waves — a per-car multiplier (0.85..1.20) from real activity. Stored in
// AppState market:demand:{carCode}, recomputed in the sweep. Drives the shop buy price
// and a small flip nudge (fed like seasonalBonus, so the flip CAP still bounds it). ─
export const DEMAND_MIN = 0.85;
export const DEMAND_MAX = 1.2;
export const DEMAND_FLIP_BONUS_MAX = 0.12; // demand's flip contribution caps at +12% (within-cap)
/** Demand multiplier from activity signals (all non-negative). More rides for the model
 *  and more recent sales lift demand; a glut of open listings cools it. Clamped. */
export function demandMultiplier(sig: { ridesLast7d: number; salesLast24h: number; listingVolume: number }): number {
  const raw = 1.0 + 0.04 * Math.min(10, sig.ridesLast7d) + 0.06 * Math.min(6, sig.salesLast24h) - 0.05 * Math.min(8, sig.listingVolume);
  return Math.max(DEMAND_MIN, Math.min(DEMAND_MAX, Math.round(raw * 100) / 100));
}
/** The flip-side nudge from demand: maps the [0.85,1.20] multiplier to a [−,+0.12] bonus
 *  fed into computeFlipGrant as seasonalBonus-style (cap-bounded). */
export function demandFlipBonus(mult: number): number {
  return Math.max(-DEMAND_FLIP_BONUS_MAX, Math.min(DEMAND_FLIP_BONUS_MAX, mult - 1.0));
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
