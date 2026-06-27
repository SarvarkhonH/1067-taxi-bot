// 🏆 GARAJ v2 server — the deep car-restoration + flipping game (gated by feature
// "garajx"). Replaces the idle garage. Guarantees:
//   • NO coin emission on ride-drop → the ≤350/ride clamp is untouched.
//   • Flip grants are mission-style (outside the ride-clamp) but bounded by the
//     canonical computeFlipGrant cap AND a per-member daily FLIP_DAILY_CAP.
//   • Every spend is idempotent (spendCoinsIdempotent — which self-serializes per
//     member); the flip grant uses a deterministic, non-numeric-tail saleId key
//     (audit B1) and an ATOMIC daily-cap check in the same transaction (audit B4).
//
// LOCK DISCIPLINE: spendCoinsIdempotent already takes withMemberLock internally,
// so acquire/diagnose/repair must NOT wrap it in another withMemberLock (the lock
// is not re-entrant → would deadlock). Their correctness rests on that inner lock
// plus the DB unique + idempotency-key guards. flipCar inlines its own tx (never
// calls a locking helper), so it holds the single withMemberLock itself.
import { createHmac } from "node:crypto";
import {
  MAKE_BASE,
  GARAJ_BUY_FACTOR,
  TOW_FACTOR,
  FLIP_DAILY_CAP,
  INSPECT_COSTS,
  TIMING_BONUS,
  REPAIR_QUALITY_MIN,
  REPAIR_QUALITY_MAX,
  REPAIR_ZONES,
  ZONE_NAMES,
  partTier,
  conditionFromZones,
  CRAFT_MAX_LEVEL,
  CRAFT_PAINT_STEP,
  CRAFT_STATIONS,
  craftCost,
  craftSpeedupCost,
  craftDurationMs,
  MOTOR_FLAG,
  MOTOR_MAX_ACCRUE_HOURS,
  MOTOR_WEAR_PER_DAY,
  motorEconDefaults,
  clampMotorEcon,
  effectiveEcon,
  motorSpeed,
  computeMotorEarn,
  computeMotorEarnNoFuel,
  computeMotorRefillCost,
  ofisBidPrice,
  OFIS_BID_FACTOR,
  hiddenDefectFor,
  repairNarxFactor,
  slotCost,
  SLOT_COSTS,
  CARCHECK_COSTS,
  type CarCheckTier,
  type CarCheckView,
  type HiddenDefect,
  type PublicProfileView,
  type OrzuBoardView,
  type OrzuTopOwner,
  type OrzuModelTop,
  KOZACHA_SHOP,
  computeFlipGrant,
  garajCarMeta,
  branchTier,
  garageTierFromRep,
  reputationTier,
  dailyOrders,
  demandMultiplier,
  demandFlipBonus,
  weeklyEvent,
  WEEKLY_EVENTS,
  ORDER_BONUS_EVENT_CAP,
  EXHIBITION_PRIZE,
  EXHIBITION_MIN_ENTRIES,
  type GarajDailyOrder,
  type GarajRoadDrop,
  type GarajWeeklyEvent,
  type GarajExhibitionView,
  type GarajCraftJobView,
  type GarajMuseumView,
  STREAK_LADDER,
  STREAK_FREEZE_DAY,
  COMEBACK_GRANT,
  COMEBACK_IDLE_DAYS,
  CIPHER_REWARD,
  CIPHER_MAX_ATTEMPTS,
  offlineBoxPayout,
  prestigeMultiplier,
  PRESTIGE_MAX,
  PRESTIGE_REP_HEADSTART,
  activeSeasonalEvent,
  type RestoreStyle,
  type RepairQuality,
  type BuyerArchetype,
  type CarCondition,
  type GarajStateResponse,
  type GarajCarView,
  type GarajActionResult,
  type GarajStreakView,
  type GarajCipherView,
  type GarajPrestigeView,
  type GarajMahallaView,
} from "@t1067/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { featureOn } from "./featureFlags";
import { getCoins, grantCoins, spendCoinsIdempotent, withMemberLock } from "./coinService";

const MAHALLA_MAX = 20; // group size cap (plan §4.8)
const SECRET = process.env.WORKSHOP_SECRET || process.env.KAS_BONUS_SECRET_KEY || "garaj-dev-secret";

// 🔑 Owner-preview gate (R6): the owner plays the REAL game on their real phone to give
// QABUL while the global "garajx" flag is still OFF — real users see nothing until the
// owner accepts and the flag is flipped. featureOn() short-circuits first, so the owner
// lookup only runs during the pre-launch preview window (and is cached for the process).
const GARAJ_PREVIEW_TG = "6506297119";
let _ownerMemberId: number | null | undefined;
async function garajEnabledFor(memberId: number): Promise<boolean> {
  if (await featureOn("garajx")) return true;
  if (_ownerMemberId === undefined) {
    const tu = await prisma.telegramUser.findUnique({ where: { id: GARAJ_PREVIEW_TG }, select: { memberId: true } }).catch(() => null);
    _ownerMemberId = tu?.memberId ?? null;
  }
  return memberId === _ownerMemberId;
}

// 🌍 MOTOR OLAMI gate — same owner-preview pattern (flag "motorolami", DEFAULT_OFF → dark).
async function motorEnabledFor(memberId: number): Promise<boolean> {
  if (await featureOn(MOTOR_FLAG)) return true;
  if (_ownerMemberId === undefined) {
    const tu = await prisma.telegramUser.findUnique({ where: { id: GARAJ_PREVIEW_TG }, select: { memberId: true } }).catch(() => null);
    _ownerMemberId = tu?.memberId ?? null;
  }
  return memberId === _ownerMemberId;
}
// Global, race-safe #serial — one atomic SQL upsert (ON CONFLICT increments). Starts at 1001.
async function nextMotorSerial(tx: Prisma.TransactionClient): Promise<number> {
  const rows = await tx.$queryRaw<{ value: string }[]>`
    INSERT INTO "AppState" ("key","value","updatedAt") VALUES ('mo:serial:next','1001', now())
    ON CONFLICT ("key") DO UPDATE SET value = (CAST("AppState"."value" AS INTEGER) + 1)::text, "updatedAt" = now()
    RETURNING "value"`;
  return parseInt(rows[0]!.value, 10);
}
// 🎛 OPERATOR IQTISOD — admin paneldan boshqariladigan dastaklar (AppState "mo:econ" JSON;
// defaults + override, har biri CLAMP'langan → admin xato qiymat bersa ham buzilmaydi).
export async function getMotorEcon(): Promise<Record<string, number>> {
  const defaults = motorEconDefaults();
  const row = await prisma.appState.findUnique({ where: { key: "mo:econ" } });
  if (!row) return defaults;
  let saved: Record<string, unknown> = {};
  try { saved = JSON.parse(row.value) as Record<string, unknown>; } catch { saved = {}; }
  const out: Record<string, number> = {};
  for (const k of Object.keys(defaults)) out[k] = clampMotorEcon(k, typeof saved[k] === "number" ? (saved[k] as number) : defaults[k]!);
  return out;
}
// admin: set one knob (clamped + persisted), returns the full config
export async function setMotorEcon(key: string, value: number): Promise<Record<string, number>> {
  const cur = await getMotorEcon();
  if (key in cur) cur[key] = clampMotorEcon(key, value);
  await prisma.appState.upsert({ where: { key: "mo:econ" }, create: { key: "mo:econ", value: JSON.stringify(cur) }, update: { value: JSON.stringify(cur) } });
  return cur;
}

// 🎁 BONUS HAFTASI — per-o'yinchi state. Stamp = motorBonusUntilAt (acquireCar'da bir martalik
// belgilanadi, faqat bonusDays>0 va meta'da hech ham bonus bo'lmagan bo'lsa). bonusActive =
// untilAt > now. Effektiv multiplikatorlar effectiveEcon() da hisoblanadi (admin base ×
// bonus mult, pol/tom himoyasi bilan).
export interface MotorBonusView { active: boolean; untilAt: string | null; daysLeft: number; speedMult: number; fuelMult: number }
export async function getMotorBonusFor(memberId: number, econ?: Record<string, number>): Promise<MotorBonusView> {
  const e = econ ?? (await getMotorEcon());
  const meta = await prisma.memberGarajMeta.findUnique({ where: { memberId }, select: { motorBonusUntilAt: true } });
  const until = meta?.motorBonusUntilAt ?? null;
  const active = until != null && until.getTime() > Date.now();
  const eff = effectiveEcon(e, active);
  return {
    active,
    untilAt: until ? until.toISOString() : null,
    daysLeft: active && until ? Math.max(0, Math.ceil((until.getTime() - Date.now()) / 86_400_000)) : 0,
    speedMult: eff.speedMult,
    fuelMult: eff.fuelMult,
  };
}

/** Deterministic, server-only seed (never sent to the client → drops/diagnoses unpredictable).
 *  Masked to 31 bits (0..2147483647) so it fits Postgres INT4 — a full uint32 overflows it. */
function seedFor(input: string): number {
  return createHmac("sha256", SECRET).update(input).digest().readUInt32BE(0) & 0x7fffffff;
}
function tashkentDate(d = new Date()): string {
  return new Date(d.getTime() + 5 * 3600 * 1000).toISOString().slice(0, 10);
}
/** Tashkent "MM-DD" for fixed-date seasonal events. */
function tashkentMonthDay(d = new Date()): string {
  return tashkentDate(d).slice(5);
}
/** Whole-day gap between two YYYY-MM-DD strings (b − a). */
function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}
/** ISO-week key "YYYY-Www" (Tashkent) — the mahalla league + comeback-bonus period. */
function isoWeekKey(d = new Date()): string {
  const t = new Date(d.getTime() + 5 * 3600 * 1000);
  const day = (t.getUTCDay() + 6) % 7; // Mon=0
  t.setUTCDate(t.getUTCDate() - day + 3); // nearest Thursday
  const firstThu = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round((t.getTime() - firstThu.getTime()) / 86400000 / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
/** ISO-week key for the week that just CLOSED (7 days ago) — what the sweep settles. */
export function closedWeekKey(d = new Date()): string {
  return isoWeekKey(new Date(d.getTime() - 7 * 86400000));
}

// #6 weekly event — deterministic by ISO week (admin can override via AppState
// garaj:weekevent). Cached in-process (~10 min) so the hot paths that read it
// (repair/craft cost, order bonus, drop rate, xp) don't each hit the DB.
let _weekEvCache: { at: number; ev: GarajWeeklyEvent } | null = null;
async function getWeeklyEvent(): Promise<GarajWeeklyEvent> {
  if (_weekEvCache && Date.now() - _weekEvCache.at < 10 * 60 * 1000) return _weekEvCache.ev;
  let ev = weeklyEvent(seedFor(`week:${isoWeekKey()}`));
  const override = await prisma.appState.findUnique({ where: { key: "garaj:weekevent" } }).catch(() => null);
  if (override?.value) {
    const m = WEEKLY_EVENTS.find((e) => e.type === override.value);
    if (m) ev = m;
  }
  _weekEvCache = { at: Date.now(), ev };
  return ev;
}
/** TEST-ONLY: force getWeeklyEvent to re-read (after setting the admin override). */
export function __resetWeekEventCache(): void {
  _weekEvCache = null;
}
const CONDITIONS = ["worn", "fair", "good", "mint"] as const;
function nextCondition(c: string): string {
  const i = CONDITIONS.indexOf(c as (typeof CONDITIONS)[number]);
  return CONDITIONS[Math.min(CONDITIONS.length - 1, (i < 0 ? 0 : i) + 1)]!;
}

// Mechanic-skill XP accrual (best-effort — never blocks the core action). ustaKozRank
// = floor(totalDiagnoses/3) capped 100; branch tiers derive from XP via branchTier().
async function bumpSkill(
  memberId: number,
  patch: { diag?: number; muhandis?: number; kuzovchi?: number; savdogar?: number; kollektsioner?: number },
): Promise<void> {
  try {
    const ev = await getWeeklyEvent(); // #6 XP ×2 week (branch XP only; diagnoses count is unscaled)
    const xm = ev.type === "xp_boost" ? ev.mult : 1;
    const row = await prisma.memberMechanicSkill.upsert({
      where: { memberId },
      create: {
        memberId,
        totalDiagnoses: patch.diag ?? 0,
        muhandisXp: (patch.muhandis ?? 0) * xm,
        kuzovchiXp: (patch.kuzovchi ?? 0) * xm,
        savdogarXp: (patch.savdogar ?? 0) * xm,
        kollektsionerXp: (patch.kollektsioner ?? 0) * xm,
      },
      update: {
        totalDiagnoses: { increment: patch.diag ?? 0 },
        muhandisXp: { increment: (patch.muhandis ?? 0) * xm },
        kuzovchiXp: { increment: (patch.kuzovchi ?? 0) * xm },
        savdogarXp: { increment: (patch.savdogar ?? 0) * xm },
        kollektsionerXp: { increment: (patch.kollektsioner ?? 0) * xm },
      },
    });
    const rank = Math.min(100, Math.floor(row.totalDiagnoses / 3));
    if (rank !== row.ustaKozRank) await prisma.memberMechanicSkill.update({ where: { memberId }, data: { ustaKozRank: rank } });
  } catch {
    /* best-effort */
  }
}

// ── read: full state for the dedicated shell (one round-trip) ─────────────────
export async function getGarajState(memberId: number): Promise<GarajStateResponse> {
  const today = tashkentDate();
  const [enabled, meta, cars, coins, sk, streakRow, cipherSolved, cipherAttempts, cipherCode, mahalla, demand, orders, roadDrops, weekEv, exhibition, craftJobRow, motorEnabled, motorEcon, motorBonus] = await Promise.all([
    garajEnabledFor(memberId),
    prisma.memberGarajMeta.findUnique({ where: { memberId } }),
    prisma.garajCar.findMany({ where: { memberId, soldAt: null } }),
    getCoins(memberId),
    prisma.memberMechanicSkill.findUnique({ where: { memberId } }),
    prisma.garajStreak.findUnique({ where: { memberId } }),
    prisma.coinTxn.findUnique({ where: { idempotencyKey: `cipher:${memberId}:${today}` } }),
    prisma.appState.findUnique({ where: { key: `cipher:attempts:${memberId}:${today}` } }),
    prisma.appState.findUnique({ where: { key: `cipher:code:${today}` } }),
    getMahallaState(memberId),
    getDemandMap(),
    getDailyOrders(memberId),
    getRoadDrops(memberId),
    getWeeklyEvent(),
    getExhibition(memberId),
    prisma.garajCraftJob.findFirst({ where: { memberId, status: "in_progress" } }), // #5 shared craft slot
    motorEnabledFor(memberId), // 🌍 motorolami flag/owner-preview
    getMotorEcon(), // 🎛 admin iqtisod-dastaklar (fuelMult + speedMult)
    getMotorBonusFor(memberId), // 🎁 bonus-hafta o'yinchi-darajasidagi
  ]);
  const nowMs = Date.now();
  const ownedCodes = new Set(cars.map((c) => c.carCode));
  const carViews: GarajCarView[] = cars.map((c) => {
    const cm = garajCarMeta(c.carCode);
    const view: GarajCarView = {
      id: c.id,
      carCode: c.carCode,
      name: cm?.name ?? c.carCode,
      emoji: cm?.emoji ?? "🚗",
      basePrice: MAKE_BASE[c.carCode] ?? 0,
      source: c.source,
      condition: c.condition.toUpperCase() as CarCondition,
      style: (c.style as RestoreStyle | null) ?? null,
      level: c.level,
      diagnosed: !!c.diagnosedAt,
      diagnosis: c.diagnosisResult ? (JSON.parse(c.diagnosisResult) as Record<string, number>) : null,
      zones: c.repairZones ? (JSON.parse(c.repairZones) as Record<string, number>) : null,
      acquireCost: c.acquireCost,
      repairSpent: c.repairSpent,
    };
    if (motorEnabled && c.serial != null) {
      // 🌍 motorolami: surface serial, engine wear, age + the pending «Yig'ish» net (preview math)
      const hp = c.engineHp ?? 100;
      const eff = effectiveEcon(motorEcon, motorBonus.active); // 🎁 bonus-hafta multiplikator
      const speed = Math.round(motorSpeed(c.carCode) * eff.speedMult);
      view.serial = c.serial;
      view.engineHp = hp;
      view.dead = hp <= 0;
      view.speed = speed;
      view.ageDays = c.bornAt ? Math.floor((nowMs - c.bornAt.getTime()) / 86_400_000) : 0;
      view.ownerCount = c.ownerCount ?? 1;
      view.totalTrips = c.totalTrips ?? 0;
      // 🔥 P-Fuel-A — fuel state (runway from now until fueledUntilAt; dry-tank → 0 net preview)
      const tankHoursForView = Math.max(1, Math.min(72, motorEcon.fuelTankHours ?? 24));
      const fueledUntilMs = c.fueledUntilAt?.getTime() ?? 0;
      const lastMs = c.lastAccrualAt?.getTime() ?? nowMs;
      const runwayEnd = Math.min(nowMs, fueledUntilMs);
      const hrs = Math.max(0, (runwayEnd - lastMs) / 3_600_000);
      const hoursLeft = Math.max(0, (fueledUntilMs - nowMs) / 3_600_000);
      view.fuelPct = Math.max(0, Math.min(100, Math.round((hoursLeft / tankHoursForView) * 100)));
      view.fuelHoursLeft = Math.round(hoursLeft * 10) / 10;
      view.fuelDry = fueledUntilMs <= lastMs;
      view.fuelRefillCost = computeMotorRefillCost(c.carCode, tankHoursForView, eff.fuelMult);
      view.earnPendingNet = hp <= 0 || view.fuelDry ? 0 : computeMotorEarnNoFuel(speed, hrs, 0).net;
      // 🏛 P1-A/F — surface motor history + Ofis bid + Clean History badge
      view.capitalRepairCount = c.capitalRepairCount ?? 0;
      view.hasHiddenDefect = !!c.hiddenDefect;
      view.ofisBidPrice = ofisBidPrice(MAKE_BASE[c.carCode] ?? 0, MAKE_BASE[c.carCode] ?? 0);
      view.cleanHistory = (c.capitalRepairCount ?? 0) === 0 && (c.ownerCount ?? 1) === 1;
    }
    return view;
  });
  const shop = Object.keys(MAKE_BASE).map((code) => {
    const cm = garajCarMeta(code);
    const dm = demand[code] ?? 1.0; // #3 live demand drives the buy price
    return {
      carCode: code,
      name: cm?.name ?? code,
      emoji: cm?.emoji ?? "🚗",
      buyPrice: Math.round(MAKE_BASE[code]! * GARAJ_BUY_FACTOR * dm),
      owned: ownedCodes.has(code),
      demandMult: dm,
    };
  });
  const rep = meta?.reputationScore ?? 0;
  const prestigeCount = meta?.prestigeCount ?? 0;
  // streak view + next ladder rung
  const cur = streakRow?.current ?? 0;
  const nextMilestone = STREAK_LADDER.find((r) => r.day > cur)?.day ?? null;
  const streak: GarajStreakView = {
    current: cur,
    longest: streakRow?.longest ?? 0,
    freezeAvailable: streakRow?.freezeAvailable ?? false,
    nextMilestone,
  };
  // cipher view — solved today? attempts left? (only "available" if admin set a code)
  const attempts = parseInt(cipherAttempts?.value ?? "0", 10) || 0;
  const cipher: GarajCipherView = {
    solvedToday: !!cipherSolved,
    attemptsLeft: cipherCode ? Math.max(0, CIPHER_MAX_ATTEMPTS - attempts) : 0,
    reward: CIPHER_REWARD,
    hasCode: !!cipherCode,
  };
  const prestige: GarajPrestigeView = {
    count: prestigeCount,
    multiplier: prestigeMultiplier(prestigeCount),
    eligible: garageTierFromRep(rep) >= 5 && prestigeCount < PRESTIGE_MAX,
  };
  // offline-box preview (does NOT grant; mirrors collectOfflineBox math)
  let offlineBoxPending = 0;
  if (meta && !(await prisma.coinTxn.findUnique({ where: { idempotencyKey: `garajbox:${memberId}:${today}` } }))) {
    const since = meta.lastBoxCollectedAt ?? meta.createdAt;
    const hours = (Date.now() - since.getTime()) / 3600000;
    offlineBoxPending = offlineBoxPayout(meta.sumCarLevels, hours, prestigeMultiplier(prestigeCount));
  }
  // #5 active craft job (the shared Workshop slot) — name/emoji from the owned-car view
  let craftJob: GarajCraftJobView | null = null;
  if (craftJobRow) {
    const cm = garajCarMeta(carViews.find((c) => c.id === craftJobRow.garajCarId)?.carCode ?? "");
    const remaining = craftJobRow.finishesAt.getTime() - Date.now();
    craftJob = {
      id: craftJobRow.id,
      garajCarId: craftJobRow.garajCarId,
      carName: cm?.name ?? "Mashina",
      emoji: cm?.emoji ?? "🚗",
      station: craftJobRow.station,
      stationName: CRAFT_STATIONS.find((s) => s.code === craftJobRow.station)?.name ?? craftJobRow.station,
      finishesAt: craftJobRow.finishesAt.toISOString(),
      ready: remaining <= 0,
      speedupCost: remaining <= 0 ? 0 : craftSpeedupCost(remaining),
    };
  }
  const season = activeSeasonalEvent(tashkentMonthDay());
  return {
    enabled,
    coins,
    kozacha: coins, // ONE currency: the garaj "purse" IS the player's tanga wallet now
    garageTier: garageTierFromRep(rep),
    reputationScore: rep,
    reputationName: reputationTier(rep),
    onboardStep: meta?.onboardStep ?? 0,
    cars: carViews,
    shop,
    skill: {
      ustaKozRank: sk?.ustaKozRank ?? 0,
      muhandis: branchTier(sk?.muhandisXp ?? 0),
      kuzovchi: branchTier(sk?.kuzovchiXp ?? 0),
      savdogar: branchTier(sk?.savdogarXp ?? 0),
      kollektsioner: branchTier(sk?.kollektsionerXp ?? 0),
      muhandisXp: sk?.muhandisXp ?? 0,
      kuzovchiXp: sk?.kuzovchiXp ?? 0,
      savdogarXp: sk?.savdogarXp ?? 0,
      kollektsionerXp: sk?.kollektsionerXp ?? 0,
    },
    streak,
    cipher,
    prestige,
    offlineBoxPending,
    seasonalEvent: season?.name ?? null,
    mahalla,
    orders,
    roadDrops,
    weeklyEvent: weekEv,
    exhibition,
    craftJob,
    motorEnabled,
    motorBonus: motorEnabled ? motorBonus : null,
  };
}

// ── acquire a car (Phase 1: static buy at the sourcing-discount price) ────────
// The core loop is buy→restore→SELL→buy-AGAIN. A previously-sold car keeps its
// GarajCar row (soldAt set) under @@unique([memberId,carCode]), so re-buying the
// SAME model must RESET that row, not create a new one. We "own" only when an
// ACTIVE (soldAt:null) row exists. Holds withMemberLock + an INLINE tx (never a
// re-locking helper → no re-entrant deadlock, same discipline as flipCar) so a
// double-tap can't double-charge and a re-buy charges correctly.
export async function acquireCar(memberId: number, carCode: string): Promise<GarajActionResult> {
  if (!(await garajEnabledFor(memberId))) return { ok: false, reason: "off" };
  const motorOn = await motorEnabledFor(memberId); // 🌍 assign a global #serial + start the earn/age clock
  const basePrice = MAKE_BASE[carCode];
  if (!basePrice) return { ok: false, reason: "unknown" };
  const buyPrice = Math.round(basePrice * GARAJ_BUY_FACTOR);
  return withMemberLock(memberId, async () => {
    // own = an ACTIVE (unsold) car of this model. Sold rows do NOT block re-buying.
    const active = await prisma.garajCar.findFirst({ where: { memberId, carCode, soldAt: null } });
    if (active) return { ok: false, reason: "owned", coins: await getCoins(memberId) };
    // 🪪 P1-D — slot enforcement: total active cars ≤ slotCount (default 1). Buy more slots via purchaseSlot.
    // Only enforced when motorolami flag is ON (so P0-only players keep the old free-multi behavior).
    if (await motorEnabledFor(memberId)) {
      const slotMeta = await prisma.memberGarajMeta.findUnique({ where: { memberId }, select: { slotCount: true } });
      const slotCount = Math.max(1, slotMeta?.slotCount ?? 1);
      const activeCount = await prisma.garajCar.count({ where: { memberId, soldAt: null } });
      if (activeCount >= slotCount) return { ok: false, reason: "no_slot", coins: await getCoins(memberId) };
    }
    const result = await prisma.$transaction(async (tx) => {
      const m = await tx.member.findUnique({ where: { id: memberId }, select: { coins: true } });
      if ((m?.coins ?? 0) < buyPrice) return { ok: false as const, reason: "insufficient" as const };
      await tx.coinTxn.create({ data: { memberId, amount: -buyPrice, kind: "garaj_acquire", reason: `Garaj: ${carCode} sotib olindi`, idempotencyKey: `garaj:acquire:${memberId}:${carCode}:${Date.now()}` } });
      await tx.member.update({ where: { id: memberId }, data: { coins: { decrement: buyPrice } } });
      // reset-or-create: re-buying a sold model reuses its unique row (fresh worn state)
      const car = await tx.garajCar.upsert({
        where: { memberId_carCode: { memberId, carCode } },
        create: { memberId, carCode, source: "shop", condition: "worn", acquireCost: buyPrice },
        update: { source: "shop", condition: "worn", acquireCost: buyPrice, repairSpent: 0, level: 1, style: null, styleLockedAt: null, diagnosisSeed: null, diagnosisResult: null, repairZones: null, diagnosedAt: null, repairQualityBonus: 1.0, ridesSinceService: 0, soldAt: null, onboardCar: false },
      });
      if (motorOn) {
        // 🌍 fresh global #serial + restart the earn/age clock (re-buy = a NEW car identity)
        // 🔥 P-Fuel-A — free first tank on every acquire (FTUE-friction relief; safe: acquireCost >
        // tank value → no sell→rebuy exploit). fuelRefillCount NOT TOUCHED (audit-B1 guard).
        const serial = await nextMotorSerial(tx);
        const econForTank = await getMotorEcon();
        const tankHours = Math.max(1, Math.min(72, econForTank.fuelTankHours ?? 24));
        const freeTankUntil = new Date(Date.now() + tankHours * 3_600_000);
        // 🏛 P1-C — hidden defect stamp (3% by default, admin-tunable hiddenDefectPct knob)
        const defectPct = Math.max(0, Math.min(10, econForTank.hiddenDefectPct ?? 3)) / 100;
        const defect = hiddenDefectFor(serial, defectPct);
        await tx.garajCar.update({ where: { id: car.id }, data: { serial, bornAt: new Date(), engineHp: 100, lastAccrualAt: new Date(), ownerCount: 1, totalTrips: 0, fueledUntilAt: freeTankUntil, hiddenDefect: defect ? JSON.stringify(defect) : null } });
      }
      await tx.memberGarajMeta.upsert({
        where: { memberId },
        create: { memberId, carsOwnedCount: 1, sumCarLevels: 1, reputationScore: 5 },
        update: { carsOwnedCount: { increment: 1 }, sumCarLevels: { increment: 1 }, reputationScore: { increment: 5 } },
      });
      if (motorOn) {
        // 🎁 BONUS HAFTASI — bir martalik stamp (faqat admin bonusDays>0 qo'ygan bo'lsa AND
        // o'yinchi ilgari hech bonus olmagan bo'lsa). Re-buy = re-stamp YO'Q. AFTER upsert
        // (yuqorida) ishlaydi, shunda meta-row har doim mavjud (P2025'dan saqlanadi).
        const econ = await getMotorEcon();
        const days = Math.floor(econ.bonusDays ?? 0);
        const existing = await tx.memberGarajMeta.findUnique({ where: { memberId }, select: { motorBonusUntilAt: true } });
        if (days > 0 && existing?.motorBonusUntilAt == null) {
          await tx.memberGarajMeta.update({ where: { memberId }, data: { motorBonusUntilAt: new Date(Date.now() + days * 86_400_000) } });
        }
      }
      return { ok: true as const, carId: car.id };
    });
    return result.ok ? { ok: true, carId: result.carId, coins: await getCoins(memberId) } : { ok: false, reason: result.reason, coins: await getCoins(memberId) };
  });
}

// ══ 🌍 MOTOR OLAMI (v3) — passiv earn («Yig'ish») + ochiq profil ══════════════
// «Yig'ish»: oxirgi accrual'dan beri o'tgan soat (≤24) × speed = gross; yoqilg'i(dial)+eyilish
// CHIQARILMAYDI (faqat net minted → emission past). engineHp vaqt bilan tushadi (~14 kun → o'lim).
// net grantCoins bilan (idempotent, ride-clamp'dan tashqari faucet, ALOHIDA cap=24soat-vaqt).
// withMemberLock + inline grant → re-entrant deadlock yo'q (grantCoins o'zi lock oladi → uni
// lock TASHQARISIDA chaqiramiz). Withdraw o'zgarmaydi (real safar + revenue byudjet).
export async function motorCollect(memberId: number): Promise<GarajActionResult & { gross?: number; fuel?: number; wear?: number; net?: number; engineHp?: number; dead?: boolean; dry?: boolean }> {
  if (!(await motorEnabledFor(memberId))) return { ok: false, reason: "off" };
  const car = await prisma.garajCar.findFirst({ where: { memberId, soldAt: null, serial: { not: null } } });
  if (!car) return { ok: false, reason: "no_car", coins: await getCoins(memberId) };
  const now = Date.now();
  const last = car.lastAccrualAt?.getTime() ?? now;
  if ((car.engineHp ?? 0) <= 0) {
    await prisma.garajCar.update({ where: { id: car.id }, data: { lastAccrualAt: new Date() } });
    return { ok: true, gross: 0, fuel: 0, wear: 0, net: 0, engineHp: 0, dead: true, coins: await getCoins(memberId) };
  }
  const econ = await getMotorEcon();
  const bonus = await getMotorBonusFor(memberId, econ);
  const eff = effectiveEcon(econ, bonus.active);
  // 🔥 P-Fuel-A — dry tank guard: agar fueledUntilAt yo'q (yangi mashina) yoki o'tib ketgan,
  // tank quruq. Old NET = gross−fuel−wear modeli o'rniga yangi: runway oxirigacha gross+wear only.
  // Fuel auto-yechilmaydi — refill alohida spend qiladi (motorRefuel). Bonus-week SAQLANADI.
  const fueledUntilMs = car.fueledUntilAt?.getTime() ?? 0;
  const runwayEnd = Math.min(now, fueledUntilMs);
  const hours = Math.max(0, (runwayEnd - last) / 3_600_000);
  const dry = fueledUntilMs <= last; // tank tugagan / hech qachon quyilmagan
  const speed = Math.round(motorSpeed(car.carCode) * eff.speedMult);
  const { gross, wear, net } = computeMotorEarnNoFuel(speed, hours, 0); // taxi 2× = sweep ride-hooki (P0.4)
  const cappedHours = Math.min(hours, MOTOR_MAX_ACCRUE_HOURS);
  const newHp = Math.max(0, Math.round((car.engineHp ?? 100) - MOTOR_WEAR_PER_DAY * (cappedHours / 24)));
  if (net > 0) await grantCoins(memberId, net, "motor_earn", `🚗 Mashina daromadi (${car.carCode} #${car.serial})`, `mo:earn:${memberId}:${last}`);
  await prisma.garajCar.update({ where: { id: car.id }, data: { lastAccrualAt: new Date(runwayEnd), engineHp: newHp } });
  // back-compat: fuel field present but always 0 in new model (UI old assertions may read it)
  return { ok: true, gross, fuel: 0, wear, net, engineHp: newHp, dead: newHp <= 0, dry, coins: await getCoins(memberId) };
}

// 🔥 P-Fuel-A — manual fuel-fill. Player pays the refill upfront, the tank extends by tankHours
// from MAX(now, current fueledUntilAt). MONOTONIC (never shrinks). Idempotent on fuelRefillCount.
// MUST NOT RESET fuelRefillCount on re-buy (audit-B1 pattern): the deterministic key prevents
// silent double-spend across the buy→sell→rebuy cycle. acquireCar above leaves the field alone.
export async function motorRefuel(memberId: number, garajCarId: number): Promise<GarajActionResult & { cost?: number; fueledUntilAt?: string; fuelPct?: number }> {
  if (!(await motorEnabledFor(memberId))) return { ok: false, reason: "off" };
  return withMemberLock(memberId, async () => {
    const car = await prisma.garajCar.findFirst({ where: { id: garajCarId, memberId, soldAt: null, serial: { not: null } } });
    if (!car) return { ok: false, reason: "not_found", coins: await getCoins(memberId) };
    if ((car.engineHp ?? 0) <= 0) return { ok: false, reason: "dead_car", coins: await getCoins(memberId) };
    const econ = await getMotorEcon();
    const bonus = await getMotorBonusFor(memberId, econ);
    const eff = effectiveEcon(econ, bonus.active);
    const tankHours = Math.max(1, Math.min(72, econ.fuelTankHours ?? 24));
    // Hard-block stockpiling: refuse if existing runway is already > tankHours - 1 (only 1h headroom).
    const now = Date.now();
    const remainHours = Math.max(0, ((car.fueledUntilAt?.getTime() ?? 0) - now) / 3_600_000);
    if (remainHours > tankHours - 1) return { ok: false, reason: "already_full", coins: await getCoins(memberId) };
    const cost = computeMotorRefillCost(car.carCode, tankHours, eff.fuelMult);
    const result = await prisma.$transaction(async (tx) => {
      const m = await tx.member.findUnique({ where: { id: memberId }, select: { coins: true } });
      if ((m?.coins ?? 0) < cost) return { ok: false as const, reason: "insufficient" as const };
      // Idempotent key uses fuelRefillCount (immutable counter, never reset on re-buy → audit-B1 safe).
      // Pre-increment + dedup happens via CoinTxn @unique idempotencyKey constraint.
      const nextCount = (car.fuelRefillCount ?? 0) + 1;
      await tx.coinTxn.create({ data: { memberId, amount: -cost, kind: "motor_fuel", reason: `⛽ ${car.carCode} #${car.serial} yoqilg'i`, idempotencyKey: `mo:fuel:${memberId}:${car.id}:${nextCount}` } });
      await tx.member.update({ where: { id: memberId }, data: { coins: { decrement: cost } } });
      // Monotonic: new runway = MAX(now, current) + tankHours (never shrink).
      const baseMs = Math.max(now, car.fueledUntilAt?.getTime() ?? now);
      const nextUntil = new Date(baseMs + tankHours * 3_600_000);
      await tx.garajCar.update({ where: { id: car.id }, data: { fueledUntilAt: nextUntil, fuelRefillCount: nextCount, lastAccrualAt: car.lastAccrualAt ?? new Date() } });
      return { ok: true as const, cost, until: nextUntil };
    });
    if (!result.ok) return { ok: false, reason: result.reason, coins: await getCoins(memberId) };
    return { ok: true, cost: result.cost, fueledUntilAt: result.until.toISOString(), fuelPct: 100, coins: await getCoins(memberId) };
  });
}

// 🌍 ochiq profil — boshqa o'yinchining garaji (status/maqtanish). Read-only, pulga tegmaydi.
// 🔥 P-Fuel-C — fuel-push sweep. Piggybacks bookingNotifier (no new poller).
// Triggers: 30% soft warn + 0% urgent. Idempotent per car per day via AppState fuelpush:<carId>:<date>:<kind>.
// Hard caps: 2 push/owner/day (kind-counted); Tashkent quiet hours 23:00–07:00 → DEFERRED (not silent
// — when next sweep lands in waking hours, push goes out). Admin kill: feature flag motorolami=off
// OR mo:econ knob pushFeatureOn=0. Owner-preview + flag-off → no-op.
export async function sweepFuelPushes(send: (chatId: string, html: string) => Promise<void>): Promise<number> {
  if (!(await featureOn(MOTOR_FLAG))) return 0;
  const econ = await getMotorEcon();
  if ((econ.pushFeatureOn ?? 1) <= 0) return 0;
  const tankHours = Math.max(1, Math.min(72, econ.fuelTankHours ?? 24));
  const warnPct = Math.max(10, Math.min(50, Math.round(econ.pushWarnPct ?? 30)));
  // Tashkent quiet hours — if current TSK hour is in [start, end), defer (skip; next sweep retries).
  const qStart = Math.max(18, Math.min(23, Math.round(econ.pushQuietStartHour ?? 23)));
  const qEnd = Math.max(5, Math.min(10, Math.round(econ.pushQuietEndHour ?? 7)));
  if (qStart === qEnd) return 0; // misconfigured (would silence all day); refuse
  const tskHour = (new Date().getUTCHours() + 5) % 24; // Asia/Tashkent = UTC+5
  const inQuiet = qStart < qEnd ? tskHour >= qStart && tskHour < qEnd : tskHour >= qStart || tskHour < qEnd;
  if (inQuiet) return 0;
  const today = tashkentDate();
  const now = Date.now();
  const cars = await prisma.garajCar.findMany({ where: { soldAt: null, serial: { not: null }, engineHp: { gt: 0 } }, select: { id: true, memberId: true, carCode: true, serial: true, fueledUntilAt: true } });
  let sent = 0;
  // Per-owner cap: count how many fuel pushes today already
  const ownerCount = new Map<number, number>();
  const todayCounts = await prisma.appState.findMany({ where: { key: { startsWith: "fuelpush:" }, value: today } });
  for (const r of todayCounts) {
    const parts = r.key.split(":");
    const carId = parts[1] ? parseInt(parts[1], 10) : NaN;
    if (!Number.isFinite(carId)) continue;
    const c = cars.find((x) => x.id === carId);
    if (c) ownerCount.set(c.memberId, (ownerCount.get(c.memberId) ?? 0) + 1);
  }
  for (const c of cars) {
    const ownedSent = ownerCount.get(c.memberId) ?? 0;
    if (ownedSent >= 2) continue; // hard cap
    const untilMs = c.fueledUntilAt?.getTime() ?? 0;
    const hoursLeft = Math.max(0, (untilMs - now) / 3_600_000);
    const pct = Math.max(0, Math.min(100, (hoursLeft / tankHours) * 100));
    let kind: "warn" | "empty" | null = null;
    if (untilMs > 0 && pct <= 0) kind = "empty";
    else if (untilMs > 0 && pct <= warnPct) kind = "warn";
    if (!kind) continue;
    // Idempotent — key fuelpush:carId:YYYY-MM-DD:kind
    const dedupeKey = `fuelpush:${c.id}:${today}:${kind}`;
    try {
      await prisma.appState.create({ data: { key: dedupeKey, value: today } });
    } catch {
      continue; // already sent today
    }
    const tu = await prisma.telegramUser.findFirst({ where: { memberId: c.memberId }, select: { id: true } }).catch(() => null);
    if (!tu) continue;
    const cm = garajCarMeta(c.carCode);
    const carName = cm?.name ?? c.carCode;
    const html = kind === "warn"
      ? `⛽ <b>${carName} #${c.serial}</b> da yoqilg'i kam (~${Math.round(pct)}%).\n${Math.round(hoursLeft)} soat qoldi — qachondir to'ldirib qo'ying.\n👉 Garaj → Quyish`
      : `🛑 <b>${carName} #${c.serial} to'xtadi</b> — yoqilg'i tugadi.\nHozir pul ishlamayapti. Bir tap — yana yo'lga.\n👉 Garaj → Quyish`;
    await send(tu.id, html).catch(() => undefined);
    ownerCount.set(c.memberId, ownedSent + 1);
    sent++;
  }
  return sent;
}

// ══ 🏛 P1-B — 1067 OFIS market-maker ═════════════════════════════════════════
// Ofis = always-on buyer. Every active GarajCar can be sold to Ofis at OFIS_BID_FACTOR × max(askPrice, basePrice).
// Budget: AppState "ofis:budget:{TashkentDate}" tracks spent-today; cap = econ.ofisDailyBudget.
// Once tugagan, ofisBuy returns reason:'budget_exhausted' (bid is paused for the day).
// Cars become "held" (GarajCar.ofisHeld=true, ownership stays with last seller for history;
// the seller is paid + the row is moved to a virtual Ofis pool via the flag + ledger row).
// Re-list (release): create a GarajBazaarListing with Ofis-as-seller marker. Scrap: hard
// delete the GarajCar row — true global supply destruction (engine of scarcity).
// All money paths use spendCorp/grantCoins idempotent keys.

/** Read today's Ofis budget spent (sum of |amount| for kind='buy', dayKey=today). */
async function ofisSpentToday(): Promise<number> {
  const today = tashkentDate();
  const agg = await prisma.ofisLedger.aggregate({ where: { dayKey: today, kind: "buy" }, _sum: { amount: true } });
  return Math.abs(agg._sum.amount ?? 0);
}

/** Headroom remaining in today's Ofis budget; 0 means closed for the day. */
export async function ofisBudgetLeftToday(): Promise<{ budget: number; spent: number; left: number }> {
  const econ = await getMotorEcon();
  const budget = Math.max(0, Math.floor(econ.ofisDailyBudget ?? 100000));
  const spent = await ofisSpentToday();
  return { budget, spent, left: Math.max(0, budget - spent) };
}

/** Compute the current Ofis bid for a specific car (admin factor + max(ask, basePrice)). */
export async function getOfisBid(garajCarId: number, askPriceHint?: number): Promise<{ bid: number; basePrice: number; carCode: string } | null> {
  const car = await prisma.garajCar.findFirst({ where: { id: garajCarId, soldAt: null, ofisHeld: false } });
  if (!car) return null;
  const econ = await getMotorEcon();
  const factor = Math.max(0.5, Math.min(0.95, econ.ofisBidFactor ?? OFIS_BID_FACTOR));
  const basePrice = MAKE_BASE[car.carCode] ?? 0;
  const ref = Math.max(askPriceHint ?? basePrice, basePrice);
  const bid = Math.max(1, Math.floor(ref * factor));
  return { bid, basePrice, carCode: car.carCode };
}

/** Sell to 1067 Ofis. Player gets the bid; car flag ofisHeld=true; budget logged. Money-safe:
 *  withMemberLock + inline tx; idempotent key includes the car's ledger generation. */
export async function ofisSellToOfis(memberId: number, garajCarId: number): Promise<GarajActionResult & { received?: number; bid?: number }> {
  if (!(await garajEnabledFor(memberId))) return { ok: false, reason: "off" };
  return withMemberLock(memberId, async () => {
    const car = await prisma.garajCar.findFirst({ where: { id: garajCarId, memberId, soldAt: null, ofisHeld: false } });
    if (!car) return { ok: false, reason: "not_found", coins: await getCoins(memberId) };
    const econ = await getMotorEcon();
    const factor = Math.max(0.5, Math.min(0.95, econ.ofisBidFactor ?? OFIS_BID_FACTOR));
    const basePrice = MAKE_BASE[car.carCode] ?? 0;
    const bid = Math.max(1, Math.floor(Math.max(basePrice, basePrice) * factor)); // basePrice baseline (player can't set their own bait price)
    // Budget check (read fresh inside the lock for race-safety)
    const today = tashkentDate();
    const dailyCap = Math.max(0, Math.floor(econ.ofisDailyBudget ?? 100000));
    const spentBefore = await ofisSpentToday();
    if (spentBefore + bid > dailyCap) return { ok: false, reason: "budget_exhausted", coins: await getCoins(memberId) };
    const result = await prisma.$transaction(async (tx) => {
      // Mark the car as Ofis-held (kept for history; ownership flag, not delete)
      await tx.garajCar.update({ where: { id: car.id }, data: { ofisHeld: true, soldAt: new Date() } });
      // Pay the seller (idempotent grant — key includes car.id + a stable counter via OfisLedger.id)
      // First create the ledger row to get a deterministic id, then grant against it
      const ledger = await tx.ofisLedger.create({ data: { kind: "buy", amount: -bid, carCode: car.carCode, refCarId: car.id, dayKey: today, status: "held" } });
      await tx.coinTxn.create({ data: { memberId, amount: bid, kind: "ofis_sell", reason: `🏛 1067 Ofis: ${car.carCode} #${car.serial ?? "?"}`, idempotencyKey: `ofis:sell:${ledger.id}` } });
      await tx.member.update({ where: { id: memberId }, data: { coins: { increment: bid } } });
      return { ok: true as const, bid };
    });
    return { ok: true, received: result.bid, bid: result.bid, coins: await getCoins(memberId) };
  });
}

/** Ofis releases a held car back into the bazaar at +5% (small markup keeps Ofis solvent). */
export async function ofisRelease(garajCarId: number): Promise<{ ok: boolean; reason?: string; listingId?: number }> {
  const car = await prisma.garajCar.findFirst({ where: { id: garajCarId, ofisHeld: true } });
  if (!car) return { ok: false, reason: "not_found" };
  const econ = await getMotorEcon();
  const factor = Math.max(0.5, Math.min(0.95, econ.ofisBidFactor ?? OFIS_BID_FACTOR));
  const basePrice = MAKE_BASE[car.carCode] ?? 0;
  // Re-list at 1.05× of the bid we paid (Ofis margin ~25% before tax)
  const askPrice = Math.max(1, Math.floor(basePrice * factor * 1.05));
  // Use a sentinel sellerId for Ofis (member id 0 = Ofis — guaranteed not a real player; convention)
  const ofisSellerId = 0;
  const ledger = await prisma.ofisLedger.create({ data: { kind: "release", amount: 0, carCode: car.carCode, refCarId: car.id, dayKey: tashkentDate(), status: "relisted" } });
  const listing = await prisma.garajBazaarListing.create({ data: { sellerId: ofisSellerId, garajCarId: car.id, carCode: car.carCode, askPrice, status: "open", expiresAt: new Date(Date.now() + 48 * 3600 * 1000) } });
  // Mark the car released (still ofisHeld = true until a buyer claims; release just creates the listing)
  return { ok: true, listingId: listing.id };
}

/** Ofis scraps a held car — permanent global supply destruction. The GarajCar row is hard
 *  deleted (true scarcity). Ledger row preserves the audit trail (refCarId points at a row
 *  that no longer exists, intentionally). */
export async function ofisScrap(garajCarId: number): Promise<{ ok: boolean; reason?: string; carCode?: string }> {
  const car = await prisma.garajCar.findFirst({ where: { id: garajCarId, ofisHeld: true } });
  if (!car) return { ok: false, reason: "not_found" };
  await prisma.ofisLedger.create({ data: { kind: "scrap", amount: 0, carCode: car.carCode, refCarId: car.id, dayKey: tashkentDate(), status: "scrapped" } });
  // Hard delete — true supply destruction. Cascade to dependent rows handled by FK defaults.
  await prisma.garajCar.delete({ where: { id: car.id } }).catch(() => undefined);
  return { ok: true, carCode: car.carCode };
}

/** Stats endpoint for admin/UI: budget left + held cars + scrapped count today. */
export async function getOfisStats(): Promise<{ budget: number; spent: number; left: number; heldCount: number; scrappedToday: number }> {
  const { budget, spent, left } = await ofisBudgetLeftToday();
  const today = tashkentDate();
  const [heldCount, scrappedToday] = await Promise.all([
    prisma.garajCar.count({ where: { ofisHeld: true } }),
    prisma.ofisLedger.count({ where: { kind: "scrap", dayKey: today } }),
  ]);
  return { budget, spent, left, heldCount, scrappedToday };
}

// 🪪 P1-D — purchase one extra slot. Default slot 1 = free; slot 2 = 50k, 3 = 250k, 4 = 1M
// (admin-tunable via slot2Cost/slot3Cost/slot4Cost knobs). Pure tanga sink (corp-ledger-safe).
// Idempotency key uses the TARGET slot number (so retry of the same target is rejected as duplicate).
export async function purchaseSlot(memberId: number): Promise<GarajActionResult & { newSlotCount?: number; cost?: number }> {
  if (!(await motorEnabledFor(memberId))) return { ok: false, reason: "off" };
  return withMemberLock(memberId, async () => {
    const meta = await prisma.memberGarajMeta.findUnique({ where: { memberId }, select: { slotCount: true } });
    const current = Math.max(1, meta?.slotCount ?? 1);
    const target = current + 1;
    if (target > SLOT_COSTS.length - 1 + 1) return { ok: false, reason: "max_slots", coins: await getCoins(memberId) };
    const econ = await getMotorEcon();
    // Per-slot admin knob override (slot2Cost/slot3Cost/slot4Cost), falls back to shared default.
    const knob = target === 2 ? econ.slot2Cost : target === 3 ? econ.slot3Cost : target === 4 ? econ.slot4Cost : null;
    const cost = Math.max(1, Math.floor(knob ?? slotCost(target)));
    const result = await prisma.$transaction(async (tx) => {
      const m = await tx.member.findUnique({ where: { id: memberId }, select: { coins: true } });
      if ((m?.coins ?? 0) < cost) return { ok: false as const, reason: "insufficient" as const };
      await tx.coinTxn.create({ data: { memberId, amount: -cost, kind: "garaj_slot", reason: `🪪 Slot ${target}`, idempotencyKey: `slot:${memberId}:${target}` } });
      await tx.member.update({ where: { id: memberId }, data: { coins: { decrement: cost } } });
      await tx.memberGarajMeta.upsert({ where: { memberId }, create: { memberId, slotCount: target }, update: { slotCount: target } });
      return { ok: true as const, target, cost };
    });
    if (!result.ok) return { ok: false, reason: result.reason, coins: await getCoins(memberId) };
    return { ok: true, newSlotCount: result.target, cost: result.cost, coins: await getCoins(memberId) };
  });
}

/** Read the current slot status + next-slot cost (for UI). */
export async function getSlotStatus(memberId: number): Promise<{ slotCount: number; activeCount: number; nextSlotCost: number | null }> {
  const econ = await getMotorEcon();
  const [meta, activeCount] = await Promise.all([
    prisma.memberGarajMeta.findUnique({ where: { memberId }, select: { slotCount: true } }),
    prisma.garajCar.count({ where: { memberId, soldAt: null } }),
  ]);
  const slotCount = Math.max(1, meta?.slotCount ?? 1);
  const next = slotCount + 1;
  let nextSlotCost: number | null = null;
  if (next <= SLOT_COSTS.length - 1 + 1) {
    const knob = next === 2 ? econ.slot2Cost : next === 3 ? econ.slot3Cost : next === 4 ? econ.slot4Cost : null;
    nextSlotCost = Math.max(1, Math.floor(knob ?? slotCost(next)));
  }
  return { slotCount, activeCount, nextSlotCost };
}

// 🏛 P1-C — sweep-side lifespan aging. motorCollect already decays engineHp on collect,
// but PARKED cars (never collected) would never age. This sweep tick processes all active
// motor cars, decaying engineHp based on wall-clock since lastAccrualAt. Idempotent, bounded
// batch, NO new poller (called from bookingNotifier's existing sweep). OFF-safe.
export async function sweepMotorAging(): Promise<number> {
  if (!(await featureOn(MOTOR_FLAG))) return 0;
  const econ = await getMotorEcon();
  const lifespanDays = Math.max(7, Math.min(30, Math.floor(econ.lifespanDays ?? 14)));
  const hpPerDay = 100 / lifespanDays;
  const now = Date.now();
  // Take a batch — keep memory bounded; each sweep handles up to 200 cars.
  const cars = await prisma.garajCar.findMany({ where: { soldAt: null, serial: { not: null }, engineHp: { gt: 0 }, ofisHeld: false }, select: { id: true, engineHp: true, lastAccrualAt: true }, take: 200 });
  let aged = 0;
  for (const c of cars) {
    const last = c.lastAccrualAt?.getTime() ?? now;
    const hours = Math.max(0, (now - last) / 3_600_000);
    if (hours < 1) continue; // skip if collected recently (motorCollect already aged it)
    const decay = Math.max(0, Math.round(hpPerDay * (hours / 24)));
    if (decay <= 0) continue;
    const newHp = Math.max(0, (c.engineHp ?? 100) - decay);
    if (newHp === c.engineHp) continue;
    // CAS-style update: only write if engineHp hasn't moved (collect may have already aged it)
    await prisma.garajCar.updateMany({ where: { id: c.id, engineHp: c.engineHp }, data: { engineHp: newHp, lastAccrualAt: new Date() } });
    aged++;
  }
  return aged;
}

// ══ 🔍 P1-E — CarCheck (3 tier reveal) + seller reputation ════════════════════
// Pay-for-truth: 50/500/5000 tanga to progressively reveal a car's IMMUTABLE history.
// Tizim yozadi → soxtalashtirib bo'lmaydi. First Premium check per player = FREE
// (newbie protection: don't burn a fresh player by hiding the defect rule).
// Costs are pure tanga SINK. Idempotent: each tier purchase is a separate CoinTxn.

export async function getCarCheck(viewerId: number, garajCarId: number, tier: CarCheckTier): Promise<GarajActionResult & { check?: CarCheckView }> {
  if (!(await motorEnabledFor(viewerId))) return { ok: false, reason: "off" };
  const car = await prisma.garajCar.findFirst({ where: { id: garajCarId, soldAt: null } });
  if (!car) return { ok: false, reason: "not_found" };
  const econ = await getMotorEcon();
  const baseCost = tier === "ODDIY" ? (econ.carCheckOddiy ?? CARCHECK_COSTS.ODDIY)
    : tier === "EKSPERT" ? (econ.carCheckEkspert ?? CARCHECK_COSTS.EKSPERT)
    : (econ.carCheckPremium ?? CARCHECK_COSTS.PREMIUM);
  const cost = Math.max(1, Math.floor(baseCost));
  // First-Premium-free for newbies (one-shot per player)
  let freeUsed = false;
  let actualCost = cost;
  if (tier === "PREMIUM") {
    const meta = await prisma.memberGarajMeta.findUnique({ where: { memberId: viewerId }, select: { carCheckFreeUsed: true } });
    if (!meta?.carCheckFreeUsed) {
      actualCost = 0;
      freeUsed = true;
    }
  }
  // Spend the tanga (skip if free)
  if (actualCost > 0) {
    const spend = await spendCoinsIdempotent(viewerId, actualCost, "garaj_carcheck", `🔍 CarCheck ${tier}: ${car.carCode} #${car.serial ?? "?"}`, `carcheck:${viewerId}:${garajCarId}:${tier}:${Date.now()}`);
    if (!spend.ok && spend.skipped !== "duplicate") return { ok: false, reason: "insufficient", coins: spend.balance };
  }
  // If freeUsed: mark it as consumed (only AFTER we know the read will succeed)
  if (freeUsed) {
    await prisma.memberGarajMeta.upsert({ where: { memberId: viewerId }, create: { memberId: viewerId, carCheckFreeUsed: true }, update: { carCheckFreeUsed: true } });
  }
  // Build the view (tier-gated fields)
  const nowMs = Date.now();
  const ageDays = car.bornAt ? Math.floor((nowMs - car.bornAt.getTime()) / 86_400_000) : 0;
  const baseView: CarCheckView = {
    tier,
    serial: car.serial ?? null,
    engineHp: car.engineHp ?? 100,
    ageDays,
    ownerCount: car.ownerCount ?? 1,
    totalTrips: car.totalTrips ?? 0,
  };
  if (tier === "EKSPERT" || tier === "PREMIUM") {
    baseView.zones = car.repairZones ? (JSON.parse(car.repairZones) as Record<string, number>) : null;
    baseView.capitalRepairCount = car.capitalRepairCount ?? 0;
  }
  if (tier === "PREMIUM") {
    // Hidden defect (if any) + reference price + seller rating
    let defect: HiddenDefect | null = null;
    try { if (car.hiddenDefect) defect = JSON.parse(car.hiddenDefect) as HiddenDefect; } catch { /* tolerate corrupt JSON */ }
    baseView.hiddenDefect = defect;
    const basePrice = MAKE_BASE[car.carCode] ?? 0;
    baseView.referencePrice = Math.max(1, Math.floor(basePrice * repairNarxFactor(car.capitalRepairCount ?? 0)));
    const sellerMeta = await prisma.memberGarajMeta.findUnique({ where: { memberId: car.memberId }, select: { sellerRatingSum: true, sellerRatingCount: true } });
    const count = sellerMeta?.sellerRatingCount ?? 0;
    baseView.sellerRating = count > 0 ? Math.round(((sellerMeta?.sellerRatingSum ?? 0) / count) * 10) / 10 : null;
    baseView.freeOfChargeUsed = freeUsed;
  }
  return { ok: true, check: baseView, coins: await getCoins(viewerId) };
}

/** Buyer rates a seller after a bazaar purchase (1-5). Idempotent: ONE rating per buyer per
 *  listing. Updates MemberGarajMeta.sellerRatingSum/Count atomically. */
export async function rateSeller(buyerId: number, listingId: number, stars: number): Promise<GarajActionResult> {
  if (!(await motorEnabledFor(buyerId))) return { ok: false, reason: "off" };
  const score = Math.max(1, Math.min(5, Math.floor(stars)));
  // Look up the listing — must be sold, buyer must match
  const listing = await prisma.garajBazaarListing.findUnique({ where: { id: listingId } });
  if (!listing || listing.status !== "sold" || listing.buyerId !== buyerId) return { ok: false, reason: "not_found" };
  if (listing.sellerId === buyerId) return { ok: false, reason: "self_rating" };
  // Idempotent via AppState marker (one rating per listing per buyer)
  const dedupeKey = `sellerrate:${listingId}:${buyerId}`;
  try {
    await prisma.appState.create({ data: { key: dedupeKey, value: String(score) } });
  } catch {
    return { ok: false, reason: "already_rated" };
  }
  await prisma.memberGarajMeta.upsert({
    where: { memberId: listing.sellerId },
    create: { memberId: listing.sellerId, sellerRatingSum: score, sellerRatingCount: 1 },
    update: { sellerRatingSum: { increment: score }, sellerRatingCount: { increment: 1 } },
  });
  return { ok: true };
}

export async function getPublicProfile(viewerId: number, targetId: number): Promise<PublicProfileView | null> {
  if (!(await motorEnabledFor(viewerId))) return null;
  const member = await prisma.member.findUnique({ where: { id: targetId }, select: { fullName: true } });
  if (!member) return null;
  const [meta, cars] = await Promise.all([
    prisma.memberGarajMeta.findUnique({ where: { memberId: targetId } }),
    prisma.garajCar.findMany({ where: { memberId: targetId, soldAt: null } }),
  ]);
  const carViews = cars.map((c) => {
    const cm = garajCarMeta(c.carCode);
    return { serial: c.serial ?? null, carCode: c.carCode, name: cm?.name ?? c.carCode, emoji: cm?.emoji ?? "🚗", engineHp: c.engineHp ?? 100, dead: (c.engineHp ?? 100) <= 0 };
  });
  const garageValue = cars.reduce((s, c) => s + (MAKE_BASE[c.carCode] ?? 0), 0);
  // ✨ P1-F — sellerRating (avg of stars) + cleanHistoryCount (cars meeting badge criteria)
  const ratingCount = meta?.sellerRatingCount ?? 0;
  const sellerRating = ratingCount > 0
    ? { avg: Math.round(((meta?.sellerRatingSum ?? 0) / ratingCount) * 10) / 10, count: ratingCount }
    : null;
  const cleanHistoryCount = cars.filter((c) => (c.capitalRepairCount ?? 0) === 0 && (c.ownerCount ?? 1) === 1).length;
  return { memberId: targetId, name: member.fullName ?? "O'yinchi", reputation: meta?.reputationScore ?? 0, garageValue, rank: null, cars: carViews, sellerRating, cleanHistoryCount };
}

// ══ ✨ P1-F — ORZU board (global ranking + per-model Top-1 podium) ═════════════
// Pure SHOWCASE — no tanga, no rewards. Visible to ALL motorolami-enabled players.
// Aggregates over GarajCar (soldAt:null) — no extra table needed. Top 20 by sum of
// MAKE_BASE; per-model champion = OLDEST active serial alive (Muzey extend: the OG
// of each model is a permanent display). Money-safe: read-only, no CoinTxn.
export async function getOrzuBoard(viewerId: number): Promise<{ ok: boolean; reason?: string; board?: OrzuBoardView }> {
  if (!(await motorEnabledFor(viewerId))) return { ok: false, reason: "off" };
  // Pull every active motor car (serial != null). Garage is small (≤4 cars/player × few hundred),
  // single scan + in-memory aggregation beats N queries.
  const cars = await prisma.garajCar.findMany({
    where: { soldAt: null, serial: { not: null } },
    select: { memberId: true, carCode: true, serial: true, engineHp: true, capitalRepairCount: true, ownerCount: true },
  });
  if (cars.length === 0) {
    return { ok: true, board: { topGarages: [], modelChampions: [], myRank: null } };
  }
  // Aggregate per-member
  const byMember = new Map<number, { value: number; count: number; clean: number; topSerial: number | null }>();
  for (const c of cars) {
    const v = MAKE_BASE[c.carCode] ?? 0;
    const existing = byMember.get(c.memberId) ?? { value: 0, count: 0, clean: 0, topSerial: null };
    existing.value += v;
    existing.count += 1;
    if ((c.capitalRepairCount ?? 0) === 0 && (c.ownerCount ?? 1) === 1) existing.clean += 1;
    if (c.serial != null && (existing.topSerial == null || c.serial < existing.topSerial)) existing.topSerial = c.serial;
    byMember.set(c.memberId, existing);
  }
  const memberIds = Array.from(byMember.keys());
  const members = await prisma.member.findMany({ where: { id: { in: memberIds } }, select: { id: true, fullName: true } });
  const nameById = new Map(members.map((m) => [m.id, m.fullName ?? "O'yinchi"]));
  // Sort by garageValue desc, take Top 20
  const ranked = Array.from(byMember.entries())
    .map(([memberId, agg]) => ({ memberId, ...agg }))
    .sort((a, b) => b.value - a.value || a.memberId - b.memberId);
  const topGarages: OrzuTopOwner[] = ranked.slice(0, 20).map((r, i) => ({
    rank: i + 1,
    memberId: r.memberId,
    name: nameById.get(r.memberId) ?? "O'yinchi",
    garageValue: r.value,
    carCount: r.count,
    cleanHistoryCount: r.clean,
    topSerial: r.topSerial,
  }));
  // Per-model champion: lowest serial = OLDEST = Muzey-tier OG
  const byCode = new Map<string, { memberId: number; serial: number; engineHp: number }>();
  for (const c of cars) {
    if (c.serial == null) continue;
    const cur = byCode.get(c.carCode);
    if (!cur || c.serial < cur.serial) {
      byCode.set(c.carCode, { memberId: c.memberId, serial: c.serial, engineHp: c.engineHp ?? 100 });
    }
  }
  const modelChampions: OrzuModelTop[] = Object.keys(MAKE_BASE).map((carCode) => {
    const cm = garajCarMeta(carCode);
    const champ = byCode.get(carCode);
    return {
      carCode,
      name: cm?.name ?? carCode,
      emoji: cm?.emoji ?? "🚗",
      champion: champ ? { memberId: champ.memberId, name: nameById.get(champ.memberId) ?? "O'yinchi", serial: champ.serial, engineHp: champ.engineHp } : null,
    };
  });
  // Viewer's own rank (1-based; null if unranked)
  const myIdx = ranked.findIndex((r) => r.memberId === viewerId);
  const myRank = myIdx >= 0 ? myIdx + 1 : null;
  return { ok: true, board: { topGarages, modelChampions, myRank } };
}

// Hidden per-zone STARTING condition (20..99) derived from the server-only seed.
// Diagnosis reveals these; repairZone improves them. One source of truth for both.
function zonesFromSeed(seed: number): Record<string, number> {
  const all: Record<string, number> = {};
  REPAIR_ZONES.forEach((z, i) => {
    all[z] = 20 + ((seed >>> (i * 5)) % 80); // 20..99 (lower = more damaged)
  });
  return all;
}

// ── diagnose (reveal hidden condition zones; cost by tier) ────────────────────
export async function diagnoseCar(memberId: number, garajCarId: number, tier: "VISUAL" | "TOOL" | "EXPERT"): Promise<GarajActionResult> {
  if (!(await garajEnabledFor(memberId))) return { ok: false, reason: "off" };
  const car = await prisma.garajCar.findFirst({ where: { id: garajCarId, memberId, soldAt: null } });
  if (!car) return { ok: false, reason: "not_found" };
  const cost = tier === "TOOL" ? INSPECT_COSTS.TOOL : tier === "EXPERT" ? INSPECT_COSTS.EXPERT : 0;
  if (cost > 0) {
    const spend = await spendCoinsIdempotent(memberId, cost, "garaj_inspect", `Diagnoz (${tier}): ${car.carCode}`, `inspect:${memberId}:${garajCarId}:${tier}`);
    if (!spend.ok && spend.skipped !== "duplicate") return { ok: false, reason: "insufficient", coins: spend.balance };
  }
  const seed = car.diagnosisSeed ?? seedFor(`diag:${memberId}:${car.carCode}:${car.id}`);
  // if zones already repaired, reveal the CURRENT condition (not the original damage)
  const live: Record<string, number> = car.repairZones ? (JSON.parse(car.repairZones) as Record<string, number>) : zonesFromSeed(seed);
  const prior: Record<string, number> = car.diagnosisResult ? (JSON.parse(car.diagnosisResult) as Record<string, number>) : {};
  const reveal = tier === "EXPERT" ? [...REPAIR_ZONES] : tier === "TOOL" ? ["engine", "transmission", "electric"] : ["body", "interior"];
  for (const z of reveal) prior[z] = live[z]!;
  await prisma.garajCar.update({ where: { id: garajCarId }, data: { diagnosisSeed: seed, diagnosisResult: JSON.stringify(prior), diagnosedAt: new Date() } });
  await bumpSkill(memberId, { diag: 1 });
  return { ok: true, coins: await getCoins(memberId) };
}

// ── repair one task (charges tanga, bumps condition, locks style on first task) ─
export async function completeRepairTask(memberId: number, garajCarId: number, taskCode: string, style?: RestoreStyle, quality?: RepairQuality): Promise<GarajActionResult> {
  if (!(await garajEnabledFor(memberId))) return { ok: false, reason: "off" };
  const car = await prisma.garajCar.findFirst({ where: { id: garajCarId, memberId, soldAt: null } });
  if (!car) return { ok: false, reason: "not_found" };
  const cost = 80; // Phase 1 flat task cost (STD part-equivalent)
  const spend = await spendCoinsIdempotent(memberId, cost, "garaj_repair", `Ta'mir (${taskCode}): ${car.carCode}`, `repair:${garajCarId}:${taskCode}`);
  if (!spend.ok && spend.skipped !== "duplicate") return { ok: false, reason: "insufficient", coins: spend.balance };
  if (spend.skipped === "duplicate") return { ok: true, reason: "already", coins: spend.balance };
  const lockedStyle = car.style ?? style ?? "QUICK_FLIP";
  // timing mini-game result compounds the car's repairQualityBonus (clamped) — it
  // feeds computeFlipGrant, so better timing => higher flip price. Money-safe: the
  // bonus is bounded [0.9, 1.25] and the flip MAX_SELL_PRICE cap still applies.
  const bonus = quality ? (TIMING_BONUS[quality] ?? 1.0) : 1.0;
  const newRQB = Math.max(REPAIR_QUALITY_MIN, Math.min(REPAIR_QUALITY_MAX, car.repairQualityBonus * bonus));
  await prisma.garajCar.update({
    where: { id: garajCarId },
    data: {
      style: lockedStyle,
      styleLockedAt: car.styleLockedAt ?? new Date(),
      condition: nextCondition(car.condition),
      repairSpent: { increment: cost },
      repairQualityBonus: newRQB,
    },
  });
  if (quality === "EXCELLENT") await bumpSkill(memberId, /engine|oil/.test(taskCode) ? { muhandis: 5 } : { kuzovchi: 5 });
  return { ok: true, coins: spend.balance };
}

// ── repairZone — the DEEP repair: fix one of the 5 zones with a chosen PART tier.
// Better part = more condition gained (×timing) + higher repairQualityBonus, costs
// more. Overall condition derives from all 5 zones (conditionFromZones), so you must
// fix the worst ones to reach MINT. Money-safe: inline spend within withMemberLock
// (no re-locking helper → no deadlock, like flipCar/acquireCar); the zone-state guard
// prevents double-tap; the flip CAP already accounts for repairSpent so heavier spend
// never extracts a disproportionate grant (audit M4). repairZones resets on re-buy.
export async function repairZone(memberId: number, garajCarId: number, zone: string, partTierCode: string, style?: RestoreStyle, quality?: RepairQuality): Promise<GarajActionResult & { zone?: string; zoneVal?: number; condition?: string }> {
  if (!(await garajEnabledFor(memberId))) return { ok: false, reason: "off" };
  if (!(REPAIR_ZONES as readonly string[]).includes(zone)) return { ok: false, reason: "unknown_zone" };
  const tier = partTier(partTierCode) ?? partTier("STD")!;
  return withMemberLock(memberId, async () => {
    const car = await prisma.garajCar.findFirst({ where: { id: garajCarId, memberId, soldAt: null } });
    if (!car) return { ok: false, reason: "not_found" };
    if (car.onboardCar) return { ok: false, reason: "onboard_car" };
    const seed = car.diagnosisSeed ?? seedFor(`diag:${memberId}:${car.carCode}:${car.id}`);
    const zones: Record<string, number> = car.repairZones ? (JSON.parse(car.repairZones) as Record<string, number>) : zonesFromSeed(seed);
    const cur = Math.max(0, Math.min(100, zones[zone] ?? 0));
    if (cur >= 96) return { ok: false, reason: "zone_done", coins: await getCoins(memberId) }; // already pristine
    const lockedStyle = car.style ?? style ?? "QUICK_FLIP";
    const timing = quality ? (TIMING_BONUS[quality] ?? 1.0) : 1.0;
    const newZoneVal = Math.min(100, Math.round(cur + tier.gain * timing)); // timing → condition gained
    zones[zone] = newZoneVal;
    const newCond = conditionFromZones(zones).toLowerCase();
    const newRQB = Math.max(REPAIR_QUALITY_MIN, Math.min(REPAIR_QUALITY_MAX, car.repairQualityBonus * tier.quality)); // part tier → flip-quality (clamped 1.25)
    const ev = await getWeeklyEvent();
    const cost = ev.type === "discount_service" ? Math.round(tier.cost * ev.mult) : tier.cost; // #6 cheap-repair week
    const result = await prisma.$transaction(async (tx) => {
      const m = await tx.member.findUnique({ where: { id: memberId }, select: { coins: true } });
      if ((m?.coins ?? 0) < cost) return { ok: false as const, reason: "insufficient" as const };
      await tx.coinTxn.create({ data: { memberId, amount: -cost, kind: "garaj_repair", reason: `Ta'mir ${ZONE_NAMES[zone] ?? zone} (${tier.name})`, idempotencyKey: `repairzone:${memberId}:${garajCarId}:${zone}:${Date.now()}` } });
      await tx.member.update({ where: { id: memberId }, data: { coins: { decrement: cost } } });
      // seed diagnosisSeed too (so a blind repair fixes a deterministic zone set)
      await tx.garajCar.update({
        where: { id: garajCarId },
        data: { diagnosisSeed: seed, repairZones: JSON.stringify(zones), condition: newCond, style: lockedStyle, styleLockedAt: car.styleLockedAt ?? new Date(), repairSpent: { increment: cost }, repairQualityBonus: newRQB },
      });
      return { ok: true as const };
    });
    if (!result.ok) return { ok: false, reason: result.reason, coins: await getCoins(memberId) };
    if (newZoneVal >= 80) await bumpSkill(memberId, /engine|transmission|electric/.test(zone) ? { muhandis: 4 } : { kuzovchi: 4 });
    return { ok: true, zone, zoneVal: newZoneVal, condition: newCond, coins: await getCoins(memberId) };
  });
}

// ── 🏭 #5 Ustaxona crafting — UPGRADE a car beyond stock (tune level / paint / full restore).
// TIMED + single shared craftsman slot: garajCraft ENQUEUES a job (charges the tanga sink up
// front, the spend is inline in withMemberLock → no re-locking deadlock). Only ONE job runs at
// a time per member (cross-car contention). The effect applies when finishesAt passes
// (settleCraftJobs, in the sweep) or instantly via a paid speedup. The flip CAP still bounds the
// crafted output, so over-crafting a cheap car only loses tanga.
export async function garajCraft(memberId: number, garajCarId: number, station: string): Promise<GarajActionResult & { queued?: boolean; finishesAt?: string }> {
  if (!(await garajEnabledFor(memberId))) return { ok: false, reason: "off" };
  if (!["TUNE", "PAINT", "RESTORE"].includes(station)) return { ok: false, reason: "unknown_station" };
  return withMemberLock(memberId, async () => {
    const car = await prisma.garajCar.findFirst({ where: { id: garajCarId, memberId, soldAt: null } });
    if (!car) return { ok: false, reason: "not_found" };
    if (car.onboardCar) return { ok: false, reason: "onboard_car" };
    // single shared craftsman slot — one job at a time across ALL the member's cars
    const busyJob = await prisma.garajCraftJob.findFirst({ where: { memberId, status: "in_progress" } });
    if (busyJob) return { ok: false, reason: "workshop_busy", coins: await getCoins(memberId) };
    const basePrice = MAKE_BASE[car.carCode] ?? 1000;
    if (station === "TUNE" && car.level >= CRAFT_MAX_LEVEL) return { ok: false, reason: "max_level", coins: await getCoins(memberId) };
    if (station === "PAINT" && car.repairQualityBonus >= REPAIR_QUALITY_MAX - 0.001) return { ok: false, reason: "max_quality", coins: await getCoins(memberId) };
    const ev = await getWeeklyEvent();
    const cost = Math.round(craftCost(station, basePrice, car.level) * (ev.type === "discount_service" ? ev.mult : 1)); // #6 cheap-repair week
    const finishesAt = new Date(Date.now() + craftDurationMs(station));
    const result = await prisma.$transaction(async (tx) => {
      const m = await tx.member.findUnique({ where: { id: memberId }, select: { coins: true } });
      if ((m?.coins ?? 0) < cost) return { ok: false as const, reason: "insufficient" as const };
      if ((await tx.garajCraftJob.count({ where: { memberId, status: "in_progress" } })) > 0) return { ok: false as const, reason: "workshop_busy" as const }; // re-check in tx
      await tx.coinTxn.create({ data: { memberId, amount: -cost, kind: "garaj_craft", reason: `Ustaxona ${station}: ${car.carCode}`, idempotencyKey: `craft:${memberId}:${garajCarId}:${station}:${Date.now()}` } });
      await tx.member.update({ where: { id: memberId }, data: { coins: { decrement: cost } } });
      await tx.garajCraftJob.create({ data: { memberId, garajCarId, station, cost, finishesAt } });
      return { ok: true as const };
    });
    if (!result.ok) return { ok: false, reason: result.reason, coins: await getCoins(memberId) };
    return { ok: true, queued: true, finishesAt: finishesAt.toISOString(), coins: await getCoins(memberId) };
  });
}

// Apply a finished craft job's effect to the car. IDEMPOTENT: atomically flips in_progress→done
// (updateMany guard) so a double-settle (sweep + speedup) applies the effect exactly once. No
// coin movement here (already charged at enqueue). Returns the member+station for skill XP, or
// null if already settled / car no longer eligible.
async function applyCraftEffect(jobId: number): Promise<{ memberId: number; station: string } | null> {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.garajCraftJob.updateMany({ where: { id: jobId, status: "in_progress" }, data: { status: "done" } });
    if (claimed.count === 0) return null; // someone already settled it
    const job = await tx.garajCraftJob.findUnique({ where: { id: jobId } });
    if (!job) return null;
    const car = await tx.garajCar.findFirst({ where: { id: job.garajCarId, memberId: job.memberId, soldAt: null } });
    if (car && !car.onboardCar) {
      const data: { level?: number; repairQualityBonus?: number; condition?: string; repairZones?: string } = {};
      if (job.station === "TUNE") {
        if (car.level < CRAFT_MAX_LEVEL) {
          data.level = car.level + 1;
          await tx.memberGarajMeta.upsert({ where: { memberId: job.memberId }, create: { memberId: job.memberId, sumCarLevels: 1 }, update: { sumCarLevels: { increment: 1 } } });
        }
      } else if (job.station === "PAINT") {
        data.repairQualityBonus = Math.min(REPAIR_QUALITY_MAX, car.repairQualityBonus + CRAFT_PAINT_STEP);
      } else {
        const zones: Record<string, number> = {};
        for (const z of REPAIR_ZONES) zones[z] = 90; // RESTORE: all 5 zones to 90 → MINT
        data.repairZones = JSON.stringify(zones);
        data.condition = conditionFromZones(zones).toLowerCase();
        // 🏛 P1-C — RESTORE = kapital remont → increment immutable counter (feeds REPAIR_NARX_FACTOR
        // resale discount). MUST NOT RESET on re-buy (audit-B1 pattern, like fuelRefillCount).
        await tx.garajCar.update({ where: { id: car.id }, data: { capitalRepairCount: { increment: 1 } } });
      }
      if (Object.keys(data).length) await tx.garajCar.update({ where: { id: car.id }, data });
    }
    return { memberId: job.memberId, station: job.station };
  });
}

// Sweep hook: apply every craft job whose timer has elapsed. Idempotent + bounded batch; no
// new poller (called from bookingNotifier's existing sweep).
export async function settleCraftJobs(): Promise<number> {
  if (!(await featureOn("garajx"))) return 0;
  const due = await prisma.garajCraftJob.findMany({ where: { status: "in_progress", finishesAt: { lte: new Date() } }, take: 50, select: { id: true } });
  let n = 0;
  for (const d of due) {
    const applied = await applyCraftEffect(d.id);
    if (applied) {
      if (applied.station === "TUNE") await bumpSkill(applied.memberId, { muhandis: 3 });
      if (applied.station === "PAINT") await bumpSkill(applied.memberId, { kuzovchi: 3 });
      n++;
    }
  }
  return n;
}

// Pay a tanga SPEEDUP to finish the running craft NOW (sink; cost by remaining time). Applies
// the effect immediately (doesn't wait for the sweep). Inline spend in withMemberLock; the
// effect-apply (applyCraftEffect) uses its own tx with no lock → no re-entrant deadlock.
export async function garajCraftSpeedup(memberId: number): Promise<GarajActionResult & { level?: number; condition?: string }> {
  if (!(await garajEnabledFor(memberId))) return { ok: false, reason: "off" };
  return withMemberLock(memberId, async () => {
    const job = await prisma.garajCraftJob.findFirst({ where: { memberId, status: "in_progress" } });
    if (!job) return { ok: false, reason: "no_job", coins: await getCoins(memberId) };
    const remaining = job.finishesAt.getTime() - Date.now();
    const cost = remaining <= 0 ? 0 : craftSpeedupCost(remaining);
    const result = await prisma.$transaction(async (tx) => {
      if (cost > 0) {
        const m = await tx.member.findUnique({ where: { id: memberId }, select: { coins: true } });
        if ((m?.coins ?? 0) < cost) return { ok: false as const, reason: "insufficient" as const };
        await tx.coinTxn.create({ data: { memberId, amount: -cost, kind: "garaj_craft", reason: `Ustaxona tezlashtirish: ${job.station}`, idempotencyKey: `craftspeed:${memberId}:${job.id}` } });
        await tx.member.update({ where: { id: memberId }, data: { coins: { decrement: cost } } });
      }
      await tx.garajCraftJob.update({ where: { id: job.id }, data: { finishesAt: new Date() } });
      return { ok: true as const };
    });
    if (!result.ok) return { ok: false, reason: result.reason, coins: await getCoins(memberId) };
    const applied = await applyCraftEffect(job.id); // apply now, don't wait for the sweep
    if (applied) {
      if (applied.station === "TUNE") await bumpSkill(memberId, { muhandis: 3 });
      if (applied.station === "PAINT") await bumpSkill(memberId, { kuzovchi: 3 });
    }
    const car = await prisma.garajCar.findFirst({ where: { id: job.garajCarId, memberId } });
    return { ok: true, level: car?.level, condition: car?.condition, coins: await getCoins(memberId) };
  });
}

// ── flip (sell) — the money moment. B1 saleId + B4 atomic daily cap ───────────
// Holds the single withMemberLock itself (it inlines its tx — never calls a
// locking helper, so no re-entrant deadlock).
export async function flipCar(memberId: number, garajCarId: number, buyerArchetype: BuyerArchetype): Promise<GarajActionResult> {
  if (!(await garajEnabledFor(memberId))) return { ok: false, reason: "off" };
  return withMemberLock(memberId, async () => {
    const car = await prisma.garajCar.findFirst({ where: { id: garajCarId, memberId, soldAt: null } });
    if (!car) return { ok: false, reason: "not_found" };
    if (car.onboardCar) return { ok: false, reason: "onboard_car" }; // FTUE car uses its own flow
    const basePrice = MAKE_BASE[car.carCode] ?? 0;
    const style = (car.style as RestoreStyle | null) ?? "QUICK_FLIP";
    const condition = car.condition.toUpperCase() as CarCondition;
    // W5: prestige multiplier (≤1.25) + active seasonal style-bonus both feed raw;
    // the computeFlipGrant cap is independent of them, so they stay within-cap upside.
    const meta = await prisma.memberGarajMeta.findUnique({ where: { memberId } });
    const pMult = prestigeMultiplier(meta?.prestigeCount ?? 0);
    const season = activeSeasonalEvent(tashkentMonthDay());
    const seasonal = season && season.flipBonusStyle === style ? (season.flipBonus ?? 0) : 0;
    // #3 demand nudge (≤±12%) — combined with seasonal into the cap-bounded seasonalBonus slot.
    const demandRow = await prisma.appState.findUnique({ where: { key: `market:demand:${car.carCode}` } });
    const demandBonus = demandRow ? demandFlipBonus(parseFloat(demandRow.value) || 1.0) : 0;
    const grant = computeFlipGrant({
      basePrice,
      level: car.level,
      style,
      buyerArchetype,
      condition,
      repairQualityBonus: car.repairQualityBonus,
      prestigeMult: pMult,
      seasonalBonus: seasonal + demandBonus,
      acquireCost: car.acquireCost,
      repairSpent: car.repairSpent,
    });
    // unique per SALE (audit B1). The car row is REUSED across buy→sell→re-buy cycles
    // (acquire upsert), so the key must include a per-car flip generation — else a
    // re-bought car's flip would collide with the first sale's key and be treated as a
    // duplicate (no sale). NON-numeric tail (`g..c..g..`) so it can never collide with
    // the ride-clamp suffix `:memberId:bookingId`.
    const flipGen = await prisma.garajFlip.count({ where: { memberId, garajCarId } });
    const saleId = `g${memberId}c${garajCarId}g${flipGen}`;
    const flipKey = `flip:${saleId}`;
    const dup = await prisma.coinTxn.findUnique({ where: { idempotencyKey: flipKey } });
    if (dup) return { ok: true, reason: "already", grant, profit: grant - car.acquireCost - car.repairSpent, coins: await getCoins(memberId) };

    const budgetKey = `garaj:flipbudget:${memberId}:${tashkentDate()}`;
    const result = await prisma.$transaction(async (tx) => {
      const row = await tx.appState.upsert({ where: { key: budgetKey }, create: { key: budgetKey, value: "0" }, update: {} });
      const used = parseInt(row.value, 10) || 0;
      if (grant > 0 && used + grant > FLIP_DAILY_CAP) return { ok: false as const, reason: "daily_cap" as const };
      if (grant > 0) {
        // inline ledger insert + balance bump (can't nest grantCoins' own tx) — same atomic pattern
        await tx.coinTxn.create({ data: { memberId, amount: grant, kind: "garaj_flip", reason: `Flip: ${car.carCode}`, idempotencyKey: flipKey } });
        await tx.member.update({ where: { id: memberId }, data: { coins: { increment: grant } } });
        await tx.appState.update({ where: { key: budgetKey }, data: { value: String(used + grant) } });
      }
      await tx.garajFlip.create({
        data: {
          memberId,
          garajCarId,
          carCode: car.carCode,
          saleId,
          boughtForT: car.acquireCost,
          repairSpentT: car.repairSpent,
          soldForT: grant,
          profitT: grant - car.acquireCost - car.repairSpent,
          style,
          buyerArchetype,
        },
      });
      await tx.garajCar.update({ where: { id: garajCarId }, data: { soldAt: new Date() } });
      return { ok: true as const, grant, profit: grant - car.acquireCost - car.repairSpent };
    });
    if (!result.ok) return { ok: false, reason: result.reason, coins: await getCoins(memberId) };
    await prisma.memberGarajMeta
      .update({ where: { memberId }, data: { carsOwnedCount: { decrement: 1 }, sumCarLevels: { decrement: car.level }, reputationScore: { increment: 30 } } })
      .catch(() => undefined);
    await bumpSkill(memberId, { savdogar: 4, kollektsioner: condition === "MINT" ? 2 : 0 });
    // #2: did this flip fulfill a daily NPC order? (carCode + style + buyer match) → bonus,
    // idempotent per (member, day, slot); bounded by 3 slots/day. Separate from the flip cap.
    let orderBonus = 0;
    const oDate = tashkentDate();
    const match = dailyOrders(seedFor(`orders:${oDate}`)).find((o) => o.carCode === car.carCode && o.style === style && o.buyer === buyerArchetype);
    if (match) {
      const ev = await getWeeklyEvent();
      const bonusAmt = ev.type === "bonus_orders" ? Math.min(ORDER_BONUS_EVENT_CAP, Math.round(match.bonus * ev.mult)) : match.bonus; // #6 bonus-orders week (hard-capped)
      const ob = await grantCoins(memberId, bonusAmt, "garaj_order", `📋 Buyurtma bajarildi: ${car.carCode}`, `orderbonus:${memberId}:${oDate}:${match.slot}`);
      orderBonus = ob.skipped === "duplicate" ? 0 : bonusAmt;
    }
    return { ok: true, grant: result.grant, profit: result.profit, orderBonus, coins: await getCoins(memberId) };
  });
}

// ── 90-second onboarding: one-time guaranteed first-flip grant. Keyed by the
// TELEGRAM user id (not memberId) so a second account on the same Telegram can't
// re-farm the +80 (audit multi-account guard). Advances onboardStep to done.
export async function garajOnboardFinish(memberId: number, telegramUserId: string): Promise<GarajActionResult> {
  if (!(await garajEnabledFor(memberId))) return { ok: false, reason: "off" };
  const meta = await prisma.memberGarajMeta.findUnique({ where: { memberId } });
  if (meta && meta.onboardStep >= 5) return { ok: true, reason: "already", grant: 0, coins: await getCoins(memberId) };
  const key = telegramUserId ? `garaj:onboard:tg:${telegramUserId}` : `garaj:onboard:m:${memberId}`;
  const g = await grantCoins(memberId, 80, "garaj_onboard", "🏆 Garaj: birinchi foyda", key);
  await prisma.memberGarajMeta.upsert({ where: { memberId }, create: { memberId, onboardStep: 5 }, update: { onboardStep: 5 } });
  return { ok: true, grant: g.skipped === "duplicate" ? 0 : 80, coins: await getCoins(memberId) };
}

// ── 🪙 Garaj currency (ONE currency: tanga) — earn from rides, spend in the shop.
// These were the old "ko'zacha" second-currency faucets/sinks; they now move REAL
// tanga (Member.coins + CoinTxn, kind "garaj"). grantKozacha grants via grantCoins
// (a game faucet OUTSIDE the 350/ride clamp — that clamp lives only in grantRideCoins,
// audit M-emission). The function names are kept to avoid churn at the call sites.
export async function grantKozacha(memberId: number, amount: number, reason: string, idempotencyKey: string): Promise<number> {
  amount = Math.floor(amount);
  if (amount <= 0) return 0;
  const g = await grantCoins(memberId, amount, "garaj", reason, idempotencyKey); // idempotent via the CoinTxn unique key
  return g.ok ? amount : 0; // 0 on a duplicate (already granted for this key) or non-positive
}

export async function spendKozachaIdempotent(memberId: number, amount: number, reason: string, idempotencyKey: string): Promise<boolean> {
  amount = Math.floor(amount);
  if (amount <= 0) return false;
  return withMemberLock(memberId, async () => {
    const dup = await prisma.coinTxn.findUnique({ where: { idempotencyKey } });
    if (dup) return true;
    try {
      return await prisma.$transaction(async (tx) => {
        // never below 0: guarded by `coins >= amount` in the updateMany
        const upd = await tx.member.updateMany({ where: { id: memberId, coins: { gte: amount } }, data: { coins: { decrement: amount } } });
        if (upd.count === 0) return false;
        await tx.coinTxn.create({ data: { memberId, amount: -amount, kind: "garaj", reason, idempotencyKey } });
        return true;
      });
    } catch (e) {
      if ((e as { code?: string } | null)?.code === "P2002") return true; // concurrent dup raced past the findUnique → treat as success
      throw e;
    }
  });
}

// ── Garaj shop buy — spend tanga to boost a car's flip price. Atomic + apply-once
// (decrement coins + CoinTxn ledger + boost in ONE tx, idempotent per item+car via the
// unique key). Tanga sink (kind "garaj"); the flip CAP still bounds the boosted output.
export async function garajKozachaBuy(memberId: number, itemCode: string, garajCarId: number): Promise<GarajActionResult> {
  if (!(await garajEnabledFor(memberId))) return { ok: false, reason: "off" };
  const item = KOZACHA_SHOP.find((i) => i.code === itemCode);
  if (!item) return { ok: false, reason: "unknown" };
  return withMemberLock(memberId, async () => {
    const car = await prisma.garajCar.findFirst({ where: { id: garajCarId, memberId, soldAt: null } });
    if (!car) return { ok: false, reason: "not_found" };
    const key = `kozbuy:${itemCode}:${garajCarId}`;
    if (await prisma.coinTxn.findUnique({ where: { idempotencyKey: key } })) return { ok: false, reason: "already" };
    const newRQB = Math.max(REPAIR_QUALITY_MIN, Math.min(REPAIR_QUALITY_MAX, car.repairQualityBonus * item.factor));
    try {
      const done = await prisma.$transaction(async (tx) => {
        // never below 0: guarded by `coins >= item.cost`
        const upd = await tx.member.updateMany({ where: { id: memberId, coins: { gte: item.cost } }, data: { coins: { decrement: item.cost } } });
        if (upd.count === 0) return false;
        await tx.coinTxn.create({ data: { memberId, amount: -item.cost, kind: "garaj", reason: `kozshop:${itemCode}`, idempotencyKey: key } });
        await tx.garajCar.update({ where: { id: garajCarId }, data: { repairQualityBonus: newRQB } });
        return true;
      });
      return done ? { ok: true } : { ok: false, reason: "insufficient" };
    } catch (e) {
      if ((e as { code?: string } | null)?.code === "P2002") return { ok: false, reason: "already" };
      throw e;
    }
  });
}

// ── ride → game drop (called from the bookingNotifier finish sweep) ───────────
// Idempotent per (memberId, bookingId) via the GarajRideDrop unique. NO coin
// emission (the 350 clamp is untouched). Materialization of parts/towed offers
// ships in a later wave; this row is the idempotency anchor + record.
// Returns TRUE only on the FIRST time this ride is processed (the GarajRideDrop
// insert won the unique). The notifier uses that to fire the once-per-ride W5
// hooks (streak, mahalla score) exactly once — the finish block itself re-runs
// across sweeps, so those must NOT be re-counted.
export async function processRideDrop(memberId: number, bookingId: number, _rideStartedAt: Date | null): Promise<boolean> {
  if (!(await featureOn("garajx"))) return false;
  const bucket = seedFor(`drop:${memberId}:${bookingId}`) % 1000;
  const ev = await getWeeklyEvent();
  const towHi = ev.type === "double_drops" ? 800 : 700; // #6 more ride finds this week
  let dropType = "NONE";
  let dropCode = "";
  if (bucket < 400) {
    dropType = "PART";
    dropCode = "common";
  } else if (bucket < 600) {
    dropType = "PART";
    dropCode = "rare";
  } else if (bucket < towHi) {
    dropType = "TOWED_CAR";
    const codes = Object.keys(MAKE_BASE);
    dropCode = codes[seedFor(`tow:${memberId}:${bookingId}`) % codes.length]!;
  }
  try {
    await prisma.garajRideDrop.create({ data: { memberId, bookingId, dropType, dropCode, seed: bucket } });
    return true;
  } catch (e) {
    if ((e as { code?: string } | null)?.code === "P2002") return false; // already dropped for this ride
    throw e;
  }
}

// ══ W4 Bazaar (player-to-player car market) ══════════════════════════════════
// Money-safe: claim-before-pay (status open→pending_payment is an atomic single
// winner), 3% tax burn (anti-wash), self-trade blocked, price ceiling 3× base.
export async function getBazaar(memberId: number): Promise<{ id: number; carCode: string; name: string; emoji: string; askPrice: number; mine: boolean }[]> {
  if (!(await garajEnabledFor(memberId))) return [];
  const rows = await prisma.garajBazaarListing.findMany({ where: { status: "open" }, orderBy: { createdAt: "desc" }, take: 50 });
  return rows.map((r) => {
    const cm = garajCarMeta(r.carCode);
    return { id: r.id, carCode: r.carCode, name: cm?.name ?? r.carCode, emoji: cm?.emoji ?? "🚗", askPrice: r.askPrice, mine: r.sellerId === memberId };
  });
}

export async function garajBazaarList(memberId: number, garajCarId: number, askPrice: number): Promise<GarajActionResult> {
  if (!(await garajEnabledFor(memberId))) return { ok: false, reason: "off" };
  return withMemberLock(memberId, async () => {
    const car = await prisma.garajCar.findFirst({ where: { id: garajCarId, memberId, soldAt: null } });
    if (!car) return { ok: false, reason: "not_found" };
    const base = MAKE_BASE[car.carCode] ?? 1000;
    const price = Math.max(1, Math.min(Math.floor(askPrice), base * 3)); // ceiling 3× base — anti wash-inflation
    const active = await prisma.garajBazaarListing.findFirst({ where: { garajCarId, status: { in: ["open", "pending_payment"] } } });
    if (active) return { ok: false, reason: "already_listed" };
    await prisma.garajBazaarListing.create({ data: { sellerId: memberId, garajCarId, carCode: car.carCode, askPrice: price, status: "open", expiresAt: new Date(Date.now() + 48 * 3600 * 1000) } });
    return { ok: true };
  });
}

export async function garajBazaarBuy(buyerId: number, listingId: number): Promise<GarajActionResult> {
  if (!(await garajEnabledFor(buyerId))) return { ok: false, reason: "off" };
  // claim-before-pay: atomically flip open→pending_payment (exactly one buyer wins)
  const claim = await prisma.garajBazaarListing.updateMany({ where: { id: listingId, status: "open" }, data: { status: "pending_payment", buyerId } });
  if (claim.count === 0) return { ok: false, reason: "already_sold" };
  const listing = await prisma.garajBazaarListing.findUnique({ where: { id: listingId } });
  if (!listing) return { ok: false, reason: "not_found" };
  const revert = () => prisma.garajBazaarListing.update({ where: { id: listingId }, data: { status: "open", buyerId: null } }).catch(() => undefined);
  if (listing.sellerId === buyerId) {
    await revert();
    return { ok: false, reason: "self_trade" };
  }
  const spend = await spendCoinsIdempotent(buyerId, listing.askPrice, "garaj_bazaar_buy", `Bozor xarid: ${listing.carCode}`, `bazaarbuy:${listingId}`);
  if (!spend.ok && spend.skipped !== "duplicate") {
    await revert();
    return { ok: false, reason: "insufficient", coins: spend.balance };
  }
  const tax = Math.round(listing.askPrice * 0.03); // burned (anti-wash)
  await prisma.$transaction(async (tx) => {
    const existing = await tx.coinTxn.findUnique({ where: { idempotencyKey: `bazaarsell:${listingId}` } });
    if (!existing) {
      await tx.coinTxn.create({ data: { memberId: listing.sellerId, amount: listing.askPrice - tax, kind: "garaj_bazaar_sell", reason: `Bozor sotuv: ${listing.carCode}`, idempotencyKey: `bazaarsell:${listingId}` } });
      await tx.member.update({ where: { id: listing.sellerId }, data: { coins: { increment: listing.askPrice - tax } } });
    }
    await tx.garajCar.update({ where: { id: listing.garajCarId }, data: { memberId: buyerId } });
    await tx.garajBazaarListing.update({ where: { id: listingId }, data: { status: "sold", soldAt: new Date() } });
  });
  return { ok: true };
}

// Cancel your own OPEN listing (the car returns to your garage — it was never moved).
export async function garajBazaarUnlist(memberId: number, listingId: number): Promise<GarajActionResult> {
  if (!(await garajEnabledFor(memberId))) return { ok: false, reason: "off" };
  const upd = await prisma.garajBazaarListing.updateMany({ where: { id: listingId, sellerId: memberId, status: "open" }, data: { status: "cancelled" } });
  return upd.count > 0 ? { ok: true } : { ok: false, reason: "not_found" };
}

// 👤 Public collection — what OTHERS see of a player's garage (from the Reyting tab):
// owned cars, reputation/tier, prestige, flip stats, mahalla. Read-only, no money path.
export async function getMemberCollection(
  viewerId: number,
  targetId: number,
): Promise<{
  memberId: number;
  name: string;
  reputationScore: number;
  reputationName: string;
  garageTier: number;
  prestige: number;
  flips: number;
  bestProfit: number;
  carsOwned: number;
  mahalla: string | null;
  cars: { name: string; emoji: string; condition: string; level: number }[];
} | null> {
  if (!(await garajEnabledFor(viewerId))) return null;
  const [meta, cars, flipAgg, flipCount, mship, member] = await Promise.all([
    prisma.memberGarajMeta.findUnique({ where: { memberId: targetId } }),
    prisma.garajCar.findMany({ where: { memberId: targetId, soldAt: null }, orderBy: [{ level: "desc" }, { acquireCost: "desc" }], take: 12 }),
    prisma.garajFlip.aggregate({ where: { memberId: targetId }, _max: { profitT: true } }),
    prisma.garajFlip.count({ where: { memberId: targetId } }),
    prisma.mahallaGroupMember.findUnique({ where: { memberId: targetId } }),
    prisma.member.findUnique({ where: { id: targetId }, select: { fullName: true } }),
  ]);
  let mahallaName: string | null = null;
  if (mship) mahallaName = (await prisma.mahallaGroup.findUnique({ where: { id: mship.groupId }, select: { name: true } }))?.name ?? null;
  const rep = meta?.reputationScore ?? 0;
  return {
    memberId: targetId,
    name: member?.fullName ?? "Usta",
    reputationScore: rep,
    reputationName: reputationTier(rep),
    garageTier: garageTierFromRep(rep),
    prestige: meta?.prestigeCount ?? 0,
    flips: flipCount,
    bestProfit: flipAgg._max.profitT ?? 0,
    carsOwned: meta?.carsOwnedCount ?? cars.length,
    mahalla: mahallaName,
    cars: cars.map((c) => {
      const cm = garajCarMeta(c.carCode);
      return { name: cm?.name ?? c.carCode, emoji: cm?.emoji ?? "🚗", condition: c.condition.toUpperCase(), level: c.level };
    }),
  };
}

// 📜 Sotuvlar tarixi — your recent sales (NPC flips + P2P bazaar sells), newest first.
export async function getGarajHistory(memberId: number): Promise<{ kind: string; carCode: string; name: string; emoji: string; amount: number; profit: number | null; at: string }[]> {
  if (!(await garajEnabledFor(memberId))) return [];
  const [flips, sells] = await Promise.all([
    prisma.garajFlip.findMany({ where: { memberId }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.coinTxn.findMany({ where: { memberId, kind: "garaj_bazaar_sell" }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  const rows = [
    ...flips.map((f) => {
      const cm = garajCarMeta(f.carCode);
      return { kind: "flip", carCode: f.carCode, name: cm?.name ?? f.carCode, emoji: cm?.emoji ?? "🚗", amount: f.soldForT, profit: f.profitT, at: f.createdAt.toISOString() };
    }),
    ...sells.map((s) => {
      const code = s.reason.replace(/^Bozor sotuv:\s*/, "").trim();
      const cm = garajCarMeta(code);
      return { kind: "bazaar", carCode: code, name: cm?.name ?? code, emoji: cm?.emoji ?? "🛒", amount: s.amount, profit: null as number | null, at: s.createdAt.toISOString() };
    }),
  ];
  rows.sort((a, b) => (a.at < b.at ? 1 : -1));
  return rows.slice(0, 25);
}

// ══ W4 sealed-bid auction ════════════════════════════════════════════════════
export async function getAuctions(memberId: number): Promise<{ id: number; carCode: string; name: string; emoji: string; minBid: number; endsAt: string; mine: boolean }[]> {
  if (!(await garajEnabledFor(memberId))) return [];
  const rows = await prisma.garajAuction.findMany({ where: { status: "open" }, orderBy: { endsAt: "asc" }, take: 50 });
  return rows.map((r) => {
    const cm = garajCarMeta(r.carCode);
    return { id: r.id, carCode: r.carCode, name: cm?.name ?? r.carCode, emoji: cm?.emoji ?? "🚗", minBid: r.minBid, endsAt: r.endsAt.toISOString(), mine: r.sellerId === memberId };
  });
}

export async function garajAuctionCreate(memberId: number, garajCarId: number, minBid: number, hours = 24): Promise<GarajActionResult> {
  if (!(await garajEnabledFor(memberId))) return { ok: false, reason: "off" };
  return withMemberLock(memberId, async () => {
    const car = await prisma.garajCar.findFirst({ where: { id: garajCarId, memberId, soldAt: null } });
    if (!car) return { ok: false, reason: "not_found" };
    if (await prisma.garajAuction.findFirst({ where: { garajCarId, status: "open" } })) return { ok: false, reason: "already" };
    await prisma.garajAuction.create({ data: { sellerId: memberId, garajCarId, carCode: car.carCode, minBid: Math.max(1, Math.floor(minBid)), endsAt: new Date(Date.now() + hours * 3600 * 1000) } });
    return { ok: true };
  });
}

export async function garajAuctionBid(bidderId: number, auctionId: number, amount: number): Promise<GarajActionResult> {
  if (!(await garajEnabledFor(bidderId))) return { ok: false, reason: "off" };
  amount = Math.floor(amount);
  const a = await prisma.garajAuction.findUnique({ where: { id: auctionId } });
  if (!a || a.status !== "open") return { ok: false, reason: "closed" };
  if (a.endsAt < new Date()) return { ok: false, reason: "ended" };
  if (a.sellerId === bidderId) return { ok: false, reason: "self" };
  if (amount < a.minBid) return { ok: false, reason: "low_bid" }; // sealed-bid: only the minBid floor; highest wins at settle
  const bidKey = `auctionbid:${auctionId}:${bidderId}`;
  if (await prisma.coinTxn.findUnique({ where: { idempotencyKey: bidKey } })) return { ok: false, reason: "already_bid" };
  try {
    const res = await prisma.$transaction(async (tx) => {
      const upd = await tx.member.updateMany({ where: { id: bidderId, coins: { gte: amount } }, data: { coins: { decrement: amount } } });
      if (upd.count === 0) return "insufficient";
      await tx.coinTxn.create({ data: { memberId: bidderId, amount: -amount, kind: "garaj_auction_bid", reason: `Auksion bid: ${a.carCode}`, idempotencyKey: bidKey } });
      await tx.garajAuctionBid.create({ data: { auctionId, bidderId, amount } });
      const data: { highBid?: number; highBidderId?: number; endsAt?: Date } = {};
      if (amount > a.highBid) {
        data.highBid = amount;
        data.highBidderId = bidderId;
      }
      if (a.endsAt.getTime() - Date.now() < 5 * 60 * 1000) data.endsAt = new Date(Date.now() + 5 * 60 * 1000); // anti-snipe
      if (Object.keys(data).length) await tx.garajAuction.update({ where: { id: auctionId }, data });
      return "ok";
    });
    return res === "insufficient" ? { ok: false, reason: "insufficient" } : { ok: true };
  } catch (e) {
    if ((e as { code?: string } | null)?.code === "P2002") return { ok: false, reason: "already_bid" };
    throw e;
  }
}

// Settle due auctions — called from the sweep. Highest bid wins (authoritative
// max over bids), seller credited (−5% fee), all losers refunded. Atomic +
// status-gated, so a re-run never double-pays.
export async function settleAuctions(): Promise<number> {
  if (!(await featureOn("garajx"))) return 0;
  const due = await prisma.garajAuction.findMany({ where: { status: "open", endsAt: { lt: new Date() } }, take: 50 });
  let settled = 0;
  for (const a of due) {
    const bids = await prisma.garajAuctionBid.findMany({ where: { auctionId: a.id } });
    let winner: (typeof bids)[number] | null = null;
    for (const b of bids) if (!winner || b.amount > winner.amount) winner = b;
    await prisma.$transaction(async (tx) => {
      const fresh = await tx.garajAuction.findUnique({ where: { id: a.id } });
      if (!fresh || fresh.status !== "open") return; // already settled — idempotent
      if (winner) {
        // A member can hold at most ONE GarajCar per carCode (@@unique([memberId, carCode]); a SOLD
        // row still occupies the slot). If the winner already owns this model, transferring the car
        // would throw P2002 and the whole $transaction would roll back — leaving the auction "open"
        // so the sweep re-settles it EVERY tick forever (the recurring "[garaj] auction settle
        // failed" (memberId, carCode) flood, with bidders' coins frozen). Void it money-safely:
        // refund ALL bidders, leave the car with the seller, close the auction. (Bidding on an
        // already-owned model should also be blocked upstream; this is the safe settlement-side cure.)
        const clash = await tx.garajCar.findUnique({
          where: { memberId_carCode: { memberId: winner.bidderId, carCode: a.carCode } },
        });
        if (clash) {
          for (const b of bids) {
            await tx.coinTxn.create({ data: { memberId: b.bidderId, amount: b.amount, kind: "garaj_auction_refund", reason: `Auksion bekor (dublikat model): ${a.carCode}`, idempotencyKey: `auctionrefund:${b.id}` } });
            await tx.member.update({ where: { id: b.bidderId }, data: { coins: { increment: b.amount } } });
          }
          await tx.garajAuction.update({ where: { id: a.id }, data: { status: "cancelled" } });
          return;
        }
        const fee = Math.round(winner.amount * 0.05);
        await tx.coinTxn.create({ data: { memberId: a.sellerId, amount: winner.amount - fee, kind: "garaj_auction_sell", reason: `Auksion sotuv: ${a.carCode}`, idempotencyKey: `auctionsell:${a.id}` } });
        await tx.member.update({ where: { id: a.sellerId }, data: { coins: { increment: winner.amount - fee } } });
        await tx.garajCar.update({ where: { id: a.garajCarId }, data: { memberId: winner.bidderId } });
        for (const b of bids) {
          if (b.id === winner.id) continue;
          await tx.coinTxn.create({ data: { memberId: b.bidderId, amount: b.amount, kind: "garaj_auction_refund", reason: `Auksion qaytdi: ${a.carCode}`, idempotencyKey: `auctionrefund:${b.id}` } });
          await tx.member.update({ where: { id: b.bidderId }, data: { coins: { increment: b.amount } } });
        }
      }
      await tx.garajAuction.update({ where: { id: a.id }, data: { status: "settled" } });
    });
    settled++;
  }
  return settled;
}

// ══ W5 Forgiving streak ═══════════════════════════════════════════════════════
// Called once per ride-finish from the sweep. One increment per Tashkent day; a
// "spare tire" (earned at day 7) covers exactly one missed day. Milestone grants
// are mission-style (grantCoins → OUTSIDE the 350/ride clamp), keyed by
// milestone+date so one climb grants each rung once.
export async function updateStreakOnRide(memberId: number, rideDate: string): Promise<number> {
  if (!(await featureOn("garajx"))) return 0;
  const s = await prisma.garajStreak.findUnique({ where: { memberId } });
  let current = 1;
  let freezeAvailable = false;
  let freezeUsed = false;
  if (s) {
    if (s.lastRideDate === rideDate) return s.current; // same day → no-op
    freezeAvailable = s.freezeAvailable;
    freezeUsed = s.freezeUsed;
    if (s.lastRideDate) {
      const diff = dayDiff(s.lastRideDate, rideDate);
      if (diff === 1) current = s.current + 1;
      else if (diff === 2 && freezeAvailable && !freezeUsed) {
        current = s.current + 1;
        freezeUsed = true;
      } else current = 1; // gap too big → reset
    }
  }
  if (current === 1) {
    freezeAvailable = false;
    freezeUsed = false;
  } // a reset clears the spare tire
  if (current >= STREAK_FREEZE_DAY) freezeAvailable = true; // earn/keep the spare tire from day 7
  const longest = Math.max(s?.longest ?? 0, current);
  await prisma.garajStreak.upsert({
    where: { memberId },
    create: { memberId, current, longest, lastRideDate: rideDate, freezeAvailable, freezeUsed },
    update: { current, longest, lastRideDate: rideDate, freezeAvailable, freezeUsed },
  });
  const rung = STREAK_LADDER.find((r) => r.day === current);
  if (rung) await grantCoins(memberId, rung.grant, "garaj_streak", `🔥 ${current} kun streak`, `streak:${memberId}:${current}:${rideDate}`);
  return current;
}

// Comeback bonus — app-open handler (NOT the sweep): if the player has been idle
// ≥3 days, a one-per-isoWeek welcome-back grant. Safe: tiny + idempotent.
export async function garajComebackBonus(memberId: number): Promise<GarajActionResult> {
  if (!(await garajEnabledFor(memberId))) return { ok: false, reason: "off" };
  const s = await prisma.garajStreak.findUnique({ where: { memberId } });
  if (!s?.lastRideDate) return { ok: false, reason: "no_history", grant: 0 };
  if (dayDiff(s.lastRideDate, tashkentDate()) < COMEBACK_IDLE_DAYS) return { ok: false, reason: "not_idle", grant: 0 };
  const g = await grantCoins(memberId, COMEBACK_GRANT, "garaj_comeback", "👋 Qaytganingiz bilan", `comeback:${memberId}:${isoWeekKey()}`);
  return { ok: g.ok, reason: g.skipped === "duplicate" ? "already" : undefined, grant: g.skipped === "duplicate" ? 0 : COMEBACK_GRANT, coins: g.balance };
}

// ══ W5 Daily cipher ══════════════════════════════════════════════════════════
// Admin posts a 3-letter code (AppState cipher:code:{date}); player guesses. Server-
// side attempt counter (5 max/day), +30t once/day (idempotent). Serialized per
// member so the counter + grant never race.
export async function garajCipherGuess(memberId: number, guess: string): Promise<GarajActionResult & { attemptsLeft?: number }> {
  if (!(await garajEnabledFor(memberId))) return { ok: false, reason: "off" };
  const date = tashkentDate();
  const solvedKey = `cipher:${memberId}:${date}`;
  return withMemberLock(memberId, async () => {
    if (await prisma.coinTxn.findUnique({ where: { idempotencyKey: solvedKey } })) return { ok: true, reason: "already", grant: 0, coins: await getCoins(memberId) };
    const codeRow = await prisma.appState.findUnique({ where: { key: `cipher:code:${date}` } });
    const code = (codeRow?.value || "").trim().toUpperCase();
    if (!code) return { ok: false, reason: "no_cipher", grant: 0 };
    const attemptsKey = `cipher:attempts:${memberId}:${date}`;
    const attemptRow = await prisma.appState.upsert({ where: { key: attemptsKey }, create: { key: attemptsKey, value: "0" }, update: {} });
    const attempts = parseInt(attemptRow.value, 10) || 0;
    if (attempts >= CIPHER_MAX_ATTEMPTS) return { ok: false, reason: "locked", attemptsLeft: 0 };
    if ((guess || "").trim().toUpperCase() !== code) {
      await prisma.appState.update({ where: { key: attemptsKey }, data: { value: String(attempts + 1) } });
      return { ok: false, reason: "wrong", grant: 0, attemptsLeft: Math.max(0, CIPHER_MAX_ATTEMPTS - attempts - 1) };
    }
    const g = await grantCoins(memberId, CIPHER_REWARD, "garaj_cipher", "🔐 Kunlik shifr", solvedKey);
    return { ok: true, grant: g.skipped === "duplicate" ? 0 : CIPHER_REWARD, coins: g.balance };
  });
}

// ══ W5 Offline box ═══════════════════════════════════════════════════════════
// Passive floor: floor(sumCarLevels·0.5·hours)·prestige, capped 24h AND ≤75/day.
// Daily idempotency key (Tashkent date) so one collect/day; prestige can only push
// toward the 75 ceiling (audit BLOCKER-4 — never compounds past it).
export async function collectOfflineBox(memberId: number): Promise<GarajActionResult> {
  if (!(await garajEnabledFor(memberId))) return { ok: false, reason: "off" };
  return withMemberLock(memberId, async () => {
    const meta = await prisma.memberGarajMeta.findUnique({ where: { memberId } });
    if (!meta) return { ok: false, reason: "no_garage", grant: 0 };
    const key = `garajbox:${memberId}:${tashkentDate()}`;
    if (await prisma.coinTxn.findUnique({ where: { idempotencyKey: key } })) return { ok: false, reason: "already", grant: 0, coins: await getCoins(memberId) };
    const since = meta.lastBoxCollectedAt ?? meta.createdAt;
    const hours = (Date.now() - since.getTime()) / 3600000;
    const payout = offlineBoxPayout(meta.sumCarLevels, hours, prestigeMultiplier(meta.prestigeCount));
    if (payout <= 0) return { ok: false, reason: "empty", grant: 0, coins: await getCoins(memberId) };
    const g = await grantCoins(memberId, payout, "garaj_offline_box", "📦 Offline quti", key);
    await prisma.memberGarajMeta.update({ where: { memberId }, data: { lastBoxCollectedAt: new Date() } }).catch(() => undefined);
    return { ok: true, grant: g.skipped === "duplicate" ? 0 : payout, coins: g.balance };
  });
}

// ══ W5 Prestige ══════════════════════════════════════════════════════════════
// End-game reset: burns all owned cars, bumps prestigeCount/multiplier (≤1.25),
// preserves reputation (+500 head-start). At Prestige 5 → permanent Hall of Fame.
// No coin emission — pure progression. Gated on garage tier 5 (rep ≥ 25000).
export async function garajPrestige(memberId: number): Promise<GarajActionResult & { prestigeCount?: number }> {
  if (!(await garajEnabledFor(memberId))) return { ok: false, reason: "off" };
  return withMemberLock(memberId, async () => {
    const meta = await prisma.memberGarajMeta.findUnique({ where: { memberId } });
    if (!meta) return { ok: false, reason: "no_garage" };
    if (meta.prestigeCount >= PRESTIGE_MAX) return { ok: false, reason: "max_prestige" };
    if (garageTierFromRep(meta.reputationScore) < 5) return { ok: false, reason: "not_eligible" };
    // must clear the market first — prestige burns the fleet, so a live listing/auction
    // pointing at a soon-to-be-burned car would orphan. Settle the market, then prestige.
    const openListings = await prisma.garajBazaarListing.count({ where: { sellerId: memberId, status: { in: ["open", "pending_payment"] } } });
    const openAuctions = await prisma.garajAuction.count({ where: { sellerId: memberId, status: "open" } });
    if (openListings > 0 || openAuctions > 0) return { ok: false, reason: "settle_market" };
    const newCount = meta.prestigeCount + 1;
    const newMult = prestigeMultiplier(newCount);
    await prisma.$transaction(async (tx) => {
      await tx.garajCar.updateMany({ where: { memberId, soldAt: null }, data: { soldAt: new Date() } }); // reset the fleet
      await tx.memberGarajMeta.update({
        where: { memberId },
        data: { prestigeCount: newCount, prestigeMultiplier: newMult, carsOwnedCount: 0, sumCarLevels: 0, reputationScore: { increment: PRESTIGE_REP_HEADSTART } },
      });
    });
    if (newCount >= PRESTIGE_MAX) {
      await prisma.garajHallOfFame
        .upsert({ where: { memberId }, create: { memberId, prestigeCount: newCount, repAtEntry: meta.reputationScore + PRESTIGE_REP_HEADSTART }, update: { prestigeCount: newCount, repAtEntry: meta.reputationScore + PRESTIGE_REP_HEADSTART } })
        .catch(() => undefined);
    }
    return { ok: true, prestigeCount: newCount, coins: await getCoins(memberId) };
  });
}

export async function getHallOfFame(): Promise<{ memberId: number; prestigeCount: number; repAtEntry: number }[]> {
  if (!(await featureOn("garajx"))) return [];
  const rows = await prisma.garajHallOfFame.findMany({ orderBy: [{ prestigeCount: "desc" }, { repAtEntry: "desc" }], take: 20 });
  return rows.map((r) => ({ memberId: r.memberId, prestigeCount: r.prestigeCount, repAtEntry: r.repAtEntry }));
}

// ══ W5 Mahalla (neighbourhood clan + weekly league) ══════════════════════════
// Score is ride-time × garage-quality (NOT tanga), so the league can never be
// coin-farmed. One mahalla per member (DB unique). Capacity guarded atomically.
const MAHALLA_ALPH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O/1/I
function mahallaCode(seedInput: string): string {
  let n = seedFor(seedInput);
  let s = "";
  for (let i = 0; i < 6; i++) {
    s += MAHALLA_ALPH[n % MAHALLA_ALPH.length];
    n = Math.floor(n / MAHALLA_ALPH.length) + (i + 1) * 31;
  }
  return s;
}

export async function mahallaCreate(memberId: number, name: string): Promise<GarajActionResult & { code?: string; mahallaId?: number }> {
  if (!(await garajEnabledFor(memberId))) return { ok: false, reason: "off" };
  return withMemberLock(memberId, async () => {
    if (await prisma.mahallaGroupMember.findUnique({ where: { memberId } })) return { ok: false, reason: "already_in_mahalla" };
    const clean = (name || "").trim().slice(0, 24) || `Mahalla ${memberId}`;
    let code = mahallaCode(`mahalla:${memberId}:${clean}`);
    for (let i = 0; i < 4 && (await prisma.mahallaGroup.findUnique({ where: { code } })); i++) code = mahallaCode(`mahalla:${memberId}:${clean}:${i}`);
    try {
      const group = await prisma.$transaction(async (tx) => {
        const g = await tx.mahallaGroup.create({ data: { name: clean, code, founderId: memberId, memberCount: 1 } });
        await tx.mahallaGroupMember.create({ data: { groupId: g.id, memberId, role: "FOUNDER" } }); // P2002 → rolls the group back
        return g;
      });
      return { ok: true, code, mahallaId: group.id };
    } catch (e) {
      if ((e as { code?: string } | null)?.code === "P2002") return { ok: false, reason: "already_in_mahalla" };
      throw e;
    }
  });
}

export async function mahallaJoin(memberId: number, code: string): Promise<GarajActionResult & { mahallaId?: number }> {
  if (!(await garajEnabledFor(memberId))) return { ok: false, reason: "off" };
  return withMemberLock(memberId, async () => {
    if (await prisma.mahallaGroupMember.findUnique({ where: { memberId } })) return { ok: false, reason: "already_in_mahalla" };
    const group = await prisma.mahallaGroup.findUnique({ where: { code: (code || "").trim().toUpperCase() } });
    if (!group) return { ok: false, reason: "not_found" };
    try {
      await prisma.$transaction(async (tx) => {
        // atomic capacity guard — only join while still under the cap
        const upd = await tx.mahallaGroup.updateMany({ where: { id: group.id, memberCount: { lt: MAHALLA_MAX } }, data: { memberCount: { increment: 1 } } });
        if (upd.count === 0) throw new Error("full");
        await tx.mahallaGroupMember.create({ data: { groupId: group.id, memberId } });
      });
      return { ok: true, mahallaId: group.id };
    } catch (e) {
      if ((e as Error)?.message === "full") return { ok: false, reason: "full" };
      if ((e as { code?: string } | null)?.code === "P2002") return { ok: false, reason: "already_in_mahalla" };
      throw e;
    }
  });
}

export async function mahallaLeave(memberId: number): Promise<GarajActionResult> {
  if (!(await garajEnabledFor(memberId))) return { ok: false, reason: "off" };
  return withMemberLock(memberId, async () => {
    const m = await prisma.mahallaGroupMember.findUnique({ where: { memberId } });
    if (!m) return { ok: false, reason: "not_in_mahalla" };
    await prisma.$transaction(async (tx) => {
      await tx.mahallaGroupMember.delete({ where: { memberId } });
      await tx.mahallaGroup.update({ where: { id: m.groupId }, data: { memberCount: { decrement: 1 } } });
    });
    return { ok: true };
  });
}

// Per-ride league score (sweep). pts = rideMinutes × max(1, sumCarLevels) × prestige.
// Ride-time × quality — NOT tanga — so it can't be coin-farmed (plan §4.8).
export async function addMahallaScore(memberId: number, rideMinutes: number): Promise<void> {
  const m = await prisma.mahallaGroupMember.findUnique({ where: { memberId } });
  if (!m) return;
  const meta = await prisma.memberGarajMeta.findUnique({ where: { memberId } });
  const quality = Math.max(1, meta?.sumCarLevels ?? 1);
  const pts = Math.floor(Math.max(0, rideMinutes) * quality * prestigeMultiplier(meta?.prestigeCount ?? 0));
  if (pts <= 0) return;
  await prisma.$transaction(async (tx) => {
    await tx.mahallaGroupMember.update({ where: { memberId }, data: { weekContrib: { increment: pts } } });
    await tx.mahallaGroup.update({ where: { id: m.groupId }, data: { weeklyScore: { increment: pts } } });
  });
}

// Weekly reset (sweep). The MahallaWeeklyResult row IS the idempotency marker —
// if any row exists for this weekKey the reset already ran (crash-safe partial).
export async function settleMahallaWeek(weekKey: string): Promise<number> {
  if (!(await featureOn("garajx"))) return 0;
  if (await prisma.mahallaWeeklyResult.findFirst({ where: { weekKey } })) return 0;
  const groups = await prisma.mahallaGroup.findMany({ orderBy: { weeklyScore: "desc" } });
  if (groups.length === 0) return 0;
  let rank = 1;
  let settled = 0;
  for (const g of groups) {
    try {
      await prisma.mahallaWeeklyResult.create({ data: { groupId: g.id, weekKey, rank, score: g.weeklyScore } });
      settled++;
    } catch (e) {
      if ((e as { code?: string } | null)?.code !== "P2002") throw e; // already recorded → idempotent
    }
    rank++;
  }
  await prisma.mahallaGroup.updateMany({ data: { weeklyScore: 0 } });
  await prisma.mahallaGroupMember.updateMany({ data: { weekContrib: 0 } });
  return settled;
}

export async function getMahallaState(memberId: number): Promise<GarajMahallaView | null> {
  const m = await prisma.mahallaGroupMember.findUnique({ where: { memberId } });
  if (!m) return null;
  const g = await prisma.mahallaGroup.findUnique({ where: { id: m.groupId } });
  if (!g) return null;
  const higher = await prisma.mahallaGroup.count({ where: { weeklyScore: { gt: g.weeklyScore } } });
  return { id: g.id, name: g.name, code: g.code, weeklyScore: g.weeklyScore, memberCount: g.memberCount, rank: higher + 1, role: m.role };
}

export async function getMahallaLeague(viewerId?: number): Promise<{ rank: number; name: string; score: number; memberCount: number }[]> {
  if (!(viewerId !== undefined ? await garajEnabledFor(viewerId) : await featureOn("garajx"))) return [];
  const groups = await prisma.mahallaGroup.findMany({ orderBy: { weeklyScore: "desc" }, take: 20 });
  return groups.map((g, i) => ({ rank: i + 1, name: g.name, score: g.weeklyScore, memberCount: g.memberCount }));
}

// ══ #3 Demand waves ══════════════════════════════════════════════════════════
// Per-car demand multiplier from REAL activity (recent sales lift it, an open-listing
// glut cools it). Recomputed at most every 15 min (AppState nextRecalcAt guard — NOT
// every sweep, audit M1). Stored in market:demand:{carCode}; drives the shop buy price
// + a capped flip nudge (fed like seasonalBonus, so computeFlipGrant's cap still bounds it).
const DEMAND_RECALC_MS = 15 * 60 * 1000;
export async function recomputeDemand(): Promise<number> {
  if (!(await featureOn("garajx"))) return 0;
  const nextRow = await prisma.appState.findUnique({ where: { key: "market:demand:nextRecalcAt" } });
  if (Date.now() < (nextRow ? parseInt(nextRow.value, 10) || 0 : 0)) return 0; // not due → skip the whole block
  const since24 = new Date(Date.now() - 24 * 3600 * 1000);
  const since7d = new Date(Date.now() - 7 * 86400 * 1000);
  let n = 0;
  for (const carCode of Object.keys(MAKE_BASE)) {
    const [salesLast24h, ridesLast7d, listingAgg] = await Promise.all([
      prisma.garajFlip.count({ where: { carCode, createdAt: { gte: since24 } } }),
      prisma.garajFlip.count({ where: { carCode, createdAt: { gte: since7d } } }),
      // #3 MAJOR-2 anti-manipulation: SUM of open-listing askPrice, not a raw count, so a
      // seller can't pump demand by spamming cheap listings (value-weighted supply).
      prisma.garajBazaarListing.aggregate({ _sum: { askPrice: true }, where: { carCode, status: "open" } }),
    ]);
    const supplyUnits = (listingAgg._sum.askPrice ?? 0) / (MAKE_BASE[carCode] ?? 1000); // inventory in car-value units
    const mult = demandMultiplier({ ridesLast7d, salesLast24h, supplyUnits });
    await prisma.appState.upsert({ where: { key: `market:demand:${carCode}` }, create: { key: `market:demand:${carCode}`, value: String(mult) }, update: { value: String(mult) } });
    n++;
  }
  const nv = String(Date.now() + DEMAND_RECALC_MS);
  await prisma.appState.upsert({ where: { key: "market:demand:nextRecalcAt" }, create: { key: "market:demand:nextRecalcAt", value: nv }, update: { value: nv } });
  return n;
}
async function getDemandMap(): Promise<Record<string, number>> {
  const rows = await prisma.appState.findMany({ where: { key: { startsWith: "market:demand:" } } });
  const map: Record<string, number> = {};
  for (const r of rows) {
    const code = r.key.slice("market:demand:".length);
    if (code !== "nextRecalcAt") map[code] = parseFloat(r.value) || 1.0;
  }
  return map;
}

// ══ #2 NPC Buyurtma board ════════════════════════════════════════════════════
// 3 deterministic daily orders (shared, seeded by Tashkent date). Fulfilled when a
// flip matches (carCode+style+buyer) → a bonus grant (in flipCar). Done flag = the
// per-member orderbonus CoinTxn key exists.
export async function getDailyOrders(memberId: number): Promise<GarajDailyOrder[]> {
  if (!(await garajEnabledFor(memberId))) return [];
  const date = tashkentDate();
  const orders = dailyOrders(seedFor(`orders:${date}`));
  const keys = orders.map((o) => `orderbonus:${memberId}:${date}:${o.slot}`);
  const done = await prisma.coinTxn.findMany({ where: { idempotencyKey: { in: keys } }, select: { idempotencyKey: true } });
  const doneSet = new Set(done.map((d) => d.idempotencyKey));
  return orders.map((o) => ({ ...o, done: doneSet.has(`orderbonus:${memberId}:${date}:${o.slot}`) }));
}

// ══ #4 Yo'l sovg'alari — towed-car offers from real rides ════════════════════
// processRideDrop already records a TOWED_CAR drop (status "pending"). These surface
// it as a 48h discounted offer; claiming = a cheaper acquire (spend-gated, idempotent),
// declining marks it done. Money-safe: claim spends tanga (no emission); the upsert
// reuses the per-model row like acquireCar so re-acquiring a sold model works.
const TOW_TTL_MS = 48 * 3600 * 1000;
export async function getRoadDrops(memberId: number): Promise<GarajRoadDrop[]> {
  if (!(await garajEnabledFor(memberId))) return [];
  const drops = await prisma.garajRideDrop.findMany({ where: { memberId, dropType: "TOWED_CAR", status: "pending", createdAt: { gte: new Date(Date.now() - TOW_TTL_MS) } }, orderBy: { createdAt: "desc" }, take: 10 });
  const owned = new Set((await prisma.garajCar.findMany({ where: { memberId, soldAt: null }, select: { carCode: true } })).map((c) => c.carCode));
  return drops
    .filter((d) => MAKE_BASE[d.dropCode] && !owned.has(d.dropCode))
    .map((d) => {
      const cm = garajCarMeta(d.dropCode);
      return { id: d.id, carCode: d.dropCode, name: cm?.name ?? d.dropCode, emoji: cm?.emoji ?? "🚗", price: Math.round((MAKE_BASE[d.dropCode] ?? 1000) * TOW_FACTOR), expiresAt: new Date(d.createdAt.getTime() + TOW_TTL_MS).toISOString() };
    });
}

export async function claimTowedCar(memberId: number, dropId: number): Promise<GarajActionResult> {
  if (!(await garajEnabledFor(memberId))) return { ok: false, reason: "off" };
  return withMemberLock(memberId, async () => {
    const drop = await prisma.garajRideDrop.findFirst({ where: { id: dropId, memberId, dropType: "TOWED_CAR", status: "pending" } });
    if (!drop) return { ok: false, reason: "not_found" };
    const carCode = drop.dropCode;
    if (!MAKE_BASE[carCode]) return { ok: false, reason: "unknown" };
    if (await prisma.garajCar.findFirst({ where: { memberId, carCode, soldAt: null } })) return { ok: false, reason: "owned" };
    const price = Math.round((MAKE_BASE[carCode] ?? 1000) * TOW_FACTOR);
    const result = await prisma.$transaction(async (tx) => {
      const m = await tx.member.findUnique({ where: { id: memberId }, select: { coins: true } });
      if ((m?.coins ?? 0) < price) return { ok: false as const, reason: "insufficient" as const };
      await tx.coinTxn.create({ data: { memberId, amount: -price, kind: "garaj_tow", reason: `Yo'l topildi: ${carCode}`, idempotencyKey: `tow:${memberId}:${dropId}` } });
      await tx.member.update({ where: { id: memberId }, data: { coins: { decrement: price } } });
      const car = await tx.garajCar.upsert({
        where: { memberId_carCode: { memberId, carCode } },
        create: { memberId, carCode, source: "ride_drop", condition: "worn", acquireCost: price },
        update: { source: "ride_drop", condition: "worn", acquireCost: price, repairSpent: 0, level: 1, style: null, styleLockedAt: null, diagnosisSeed: null, diagnosisResult: null, repairZones: null, diagnosedAt: null, repairQualityBonus: 1.0, ridesSinceService: 0, soldAt: null, onboardCar: false },
      });
      await tx.garajRideDrop.update({ where: { id: dropId }, data: { status: "claimed" } });
      await tx.memberGarajMeta.upsert({ where: { memberId }, create: { memberId, carsOwnedCount: 1, sumCarLevels: 1, reputationScore: 5 }, update: { carsOwnedCount: { increment: 1 }, sumCarLevels: { increment: 1 }, reputationScore: { increment: 5 } } });
      return { ok: true as const, carId: car.id };
    });
    return result.ok ? { ok: true, carId: result.carId, coins: await getCoins(memberId) } : { ok: false, reason: result.reason, coins: await getCoins(memberId) };
  });
}

export async function declineTowedCar(memberId: number, dropId: number): Promise<GarajActionResult> {
  if (!(await garajEnabledFor(memberId))) return { ok: false, reason: "off" };
  const upd = await prisma.garajRideDrop.updateMany({ where: { id: dropId, memberId, dropType: "TOWED_CAR", status: "pending" }, data: { status: "declined" } });
  return upd.count > 0 ? { ok: true } : { ok: false, reason: "not_found" };
}

// ══ #8 Exhibition — weekly car show ══════════════════════════════════════════
// Submit a snapshot of your best car (one/week); others vote (one/week, not your own);
// the top-voted entry of the CLOSED week wins a bounded, idempotent prize (sweep-settled,
// only if ≥EXHIBITION_MIN_ENTRIES so a solo player can't auto-farm it). Votes are NOT
// tanga, so the leaderboard can't be coin-farmed.
export async function exhibitionSubmit(memberId: number, garajCarId: number): Promise<GarajActionResult> {
  if (!(await garajEnabledFor(memberId))) return { ok: false, reason: "off" };
  return withMemberLock(memberId, async () => {
    const car = await prisma.garajCar.findFirst({ where: { id: garajCarId, memberId, soldAt: null } });
    if (!car) return { ok: false, reason: "not_found" };
    const weekKey = isoWeekKey();
    // snapshot (persists even if the car is later sold). One entry/week — re-submitting updates it.
    await prisma.garajExhibitionEntry.upsert({
      where: { memberId_weekKey: { memberId, weekKey } },
      create: { memberId, weekKey, carCode: car.carCode, level: car.level, condition: car.condition },
      update: { carCode: car.carCode, level: car.level, condition: car.condition },
    });
    return { ok: true };
  });
}

export async function exhibitionVote(voterId: number, entryId: number): Promise<GarajActionResult> {
  if (!(await garajEnabledFor(voterId))) return { ok: false, reason: "off" };
  const weekKey = isoWeekKey();
  const entry = await prisma.garajExhibitionEntry.findUnique({ where: { id: entryId } });
  if (!entry || entry.weekKey !== weekKey) return { ok: false, reason: "not_found" };
  if (entry.memberId === voterId) return { ok: false, reason: "self_vote" };
  try {
    await prisma.$transaction(async (tx) => {
      await tx.garajExhibitionVote.create({ data: { entryId, voterId, weekKey } }); // @@unique(voterId,weekKey) → P2002 on 2nd vote
      await tx.garajExhibitionEntry.update({ where: { id: entryId }, data: { votes: { increment: 1 } } });
    });
    return { ok: true };
  } catch (e) {
    if ((e as { code?: string } | null)?.code === "P2002") return { ok: false, reason: "already_voted" };
    throw e;
  }
}

export async function getExhibition(memberId: number): Promise<GarajExhibitionView> {
  if (!(await garajEnabledFor(memberId))) return { entries: [], myEntryId: null, myVoteEntryId: null, lastWinner: null };
  const weekKey = isoWeekKey();
  const [rows, myVote, lastWin] = await Promise.all([
    prisma.garajExhibitionEntry.findMany({ where: { weekKey }, orderBy: [{ votes: "desc" }, { createdAt: "asc" }], take: 30 }),
    prisma.garajExhibitionVote.findUnique({ where: { voterId_weekKey: { voterId: memberId, weekKey } } }),
    prisma.garajExhibitionEntry.findFirst({ where: { weekKey: closedWeekKey() }, orderBy: [{ votes: "desc" }, { createdAt: "asc" }] }),
  ]);
  const entries = rows.map((r) => {
    const cm = garajCarMeta(r.carCode);
    return { id: r.id, carCode: r.carCode, name: cm?.name ?? r.carCode, emoji: cm?.emoji ?? "🚗", level: r.level, condition: r.condition.toUpperCase(), votes: r.votes, mine: r.memberId === memberId };
  });
  let lastWinner: GarajExhibitionView["lastWinner"] = null;
  if (lastWin && lastWin.votes > 0) {
    const member = await prisma.member.findUnique({ where: { id: lastWin.memberId }, select: { fullName: true } });
    const cm = garajCarMeta(lastWin.carCode);
    lastWinner = { name: member?.fullName ?? "Usta", carName: cm?.name ?? lastWin.carCode, emoji: cm?.emoji ?? "🚗", votes: lastWin.votes };
  }
  return { entries, myEntryId: rows.find((r) => r.memberId === memberId)?.id ?? null, myVoteEntryId: myVote?.entryId ?? null, lastWinner };
}

// Settle the CLOSED week's exhibition: top-voted entry wins the prize (bounded + idempotent
// via exhibwin:{weekKey}); only pays when ≥EXHIBITION_MIN_ENTRIES (no solo farming). Sweep-run.
export async function settleExhibition(weekKey: string): Promise<boolean> {
  if (!(await featureOn("garajx"))) return false;
  const key = `exhibwin:${weekKey}`;
  if (await prisma.coinTxn.findUnique({ where: { idempotencyKey: key } })) return false; // already settled
  const entries = await prisma.garajExhibitionEntry.findMany({ where: { weekKey }, orderBy: [{ votes: "desc" }, { createdAt: "asc" }] });
  if (entries.length < EXHIBITION_MIN_ENTRIES) return false; // not enough competition → no prize
  const winner = entries[0]!;
  if (winner.votes <= 0) return false; // nobody voted
  const g = await grantCoins(winner.memberId, EXHIBITION_PRIZE, "garaj_exhibition", `🏆 Ko'rgazma g'olibi: ${winner.carCode}`, key);
  return g.ok;
}

// ══ #9 Muzey — read-only showcase (collection / records / Hall of Fame) ═══════
export async function getMuseum(memberId: number): Promise<GarajMuseumView> {
  const empty: GarajMuseumView = { collection: [], collectedCount: 0, totalModels: Object.keys(MAKE_BASE).length, totalFlips: 0, bestProfit: 0, hallOfFame: [] };
  if (!(await garajEnabledFor(memberId))) return empty;
  // "ever-owned" = current cars + NPC-flipped + P2P-sold (bazaar/auction move the row's
  // memberId to the buyer, so those models must be counted from the sale records too).
  const [cur, flipped, bzSold, aucSold, flipAgg, flipCount, hof] = await Promise.all([
    prisma.garajCar.findMany({ where: { memberId }, select: { carCode: true }, distinct: ["carCode"] }),
    prisma.garajFlip.findMany({ where: { memberId }, select: { carCode: true }, distinct: ["carCode"] }),
    prisma.garajBazaarListing.findMany({ where: { sellerId: memberId, status: "sold" }, select: { carCode: true }, distinct: ["carCode"] }),
    prisma.garajAuction.findMany({ where: { sellerId: memberId, status: "settled" }, select: { carCode: true }, distinct: ["carCode"] }),
    prisma.garajFlip.aggregate({ where: { memberId }, _max: { profitT: true } }),
    prisma.garajFlip.count({ where: { memberId } }),
    prisma.garajHallOfFame.findMany({ orderBy: [{ prestigeCount: "desc" }, { repAtEntry: "desc" }], take: 10 }),
  ]);
  const ownedSet = new Set([...cur, ...flipped, ...bzSold, ...aucSold].map((o) => o.carCode));
  const collection = Object.keys(MAKE_BASE).map((code) => {
    const cm = garajCarMeta(code);
    return { carCode: code, name: cm?.name ?? code, emoji: cm?.emoji ?? "🚗", owned: ownedSet.has(code) };
  });
  const hofMembers = hof.length ? await prisma.member.findMany({ where: { id: { in: hof.map((h) => h.memberId) } }, select: { id: true, fullName: true } }) : [];
  const nameById = new Map(hofMembers.map((m) => [m.id, m.fullName]));
  const hallOfFame = hof.map((h) => ({ name: nameById.get(h.memberId) ?? "Usta", prestigeCount: h.prestigeCount, repAtEntry: h.repAtEntry }));
  return { collection, collectedCount: ownedSet.size, totalModels: collection.length, totalFlips: flipCount, bestProfit: flipAgg._max.profitT ?? 0, hallOfFame };
}
