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
  FLIP_DAILY_CAP,
  INSPECT_COSTS,
  TIMING_BONUS,
  REPAIR_QUALITY_MIN,
  REPAIR_QUALITY_MAX,
  KOZACHA_SHOP,
  computeFlipGrant,
  garajCarMeta,
  branchTier,
  garageTierFromRep,
  reputationTier,
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
    const row = await prisma.memberMechanicSkill.upsert({
      where: { memberId },
      create: {
        memberId,
        totalDiagnoses: patch.diag ?? 0,
        muhandisXp: patch.muhandis ?? 0,
        kuzovchiXp: patch.kuzovchi ?? 0,
        savdogarXp: patch.savdogar ?? 0,
        kollektsionerXp: patch.kollektsioner ?? 0,
      },
      update: {
        totalDiagnoses: { increment: patch.diag ?? 0 },
        muhandisXp: { increment: patch.muhandis ?? 0 },
        kuzovchiXp: { increment: patch.kuzovchi ?? 0 },
        savdogarXp: { increment: patch.savdogar ?? 0 },
        kollektsionerXp: { increment: patch.kollektsioner ?? 0 },
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
  const [enabled, meta, cars, coins, sk, streakRow, cipherSolved, cipherAttempts, cipherCode, mahalla] = await Promise.all([
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
  ]);
  const ownedCodes = new Set(cars.map((c) => c.carCode));
  const carViews: GarajCarView[] = cars.map((c) => {
    const cm = garajCarMeta(c.carCode);
    return {
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
      acquireCost: c.acquireCost,
      repairSpent: c.repairSpent,
    };
  });
  const shop = Object.keys(MAKE_BASE).map((code) => {
    const cm = garajCarMeta(code);
    return {
      carCode: code,
      name: cm?.name ?? code,
      emoji: cm?.emoji ?? "🚗",
      buyPrice: Math.round(MAKE_BASE[code]! * GARAJ_BUY_FACTOR),
      owned: ownedCodes.has(code),
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
  const season = activeSeasonalEvent(tashkentMonthDay());
  return {
    enabled,
    coins,
    kozacha: meta?.kozachaBalance ?? 0,
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
  };
}

// ── acquire a car (Phase 1: static buy at the sourcing-discount price) ────────
// No outer lock: spendCoinsIdempotent self-locks; the @@unique([memberId,carCode])
// + the idempotency key are the race guards.
export async function acquireCar(memberId: number, carCode: string): Promise<GarajActionResult> {
  if (!(await garajEnabledFor(memberId))) return { ok: false, reason: "off" };
  const basePrice = MAKE_BASE[carCode];
  if (!basePrice) return { ok: false, reason: "unknown" };
  const existing = await prisma.garajCar.findFirst({ where: { memberId, carCode } });
  if (existing) return { ok: false, reason: "owned", coins: await getCoins(memberId) };
  const buyPrice = Math.round(basePrice * GARAJ_BUY_FACTOR);
  const spend = await spendCoinsIdempotent(memberId, buyPrice, "garaj_acquire", `Garaj: ${carCode} sotib olindi`, `garaj:acquire:${memberId}:${carCode}`);
  if (!spend.ok) return { ok: false, reason: spend.skipped === "insufficient" ? "insufficient" : "error", coins: spend.balance };
  let car;
  try {
    car = await prisma.garajCar.create({ data: { memberId, carCode, source: "shop", condition: "worn", acquireCost: buyPrice } });
  } catch {
    return { ok: false, reason: "owned", coins: await getCoins(memberId) };
  }
  // ensure meta row exists (race → catch), then atomic increment of denormalized counts
  await prisma.memberGarajMeta.upsert({ where: { memberId }, create: { memberId }, update: {} }).catch(() => undefined);
  await prisma.memberGarajMeta.update({ where: { memberId }, data: { carsOwnedCount: { increment: 1 }, sumCarLevels: { increment: 1 }, reputationScore: { increment: 5 } } }).catch(() => undefined);
  return { ok: true, carId: car.id, coins: spend.balance };
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
  const zones = ["engine", "body", "transmission", "electric", "interior"];
  const all: Record<string, number> = {};
  zones.forEach((z, i) => {
    all[z] = 20 + ((seed >>> (i * 5)) % 80); // 20..99
  });
  const prior: Record<string, number> = car.diagnosisResult ? (JSON.parse(car.diagnosisResult) as Record<string, number>) : {};
  const reveal = tier === "EXPERT" ? zones : tier === "TOOL" ? ["engine", "transmission", "electric"] : ["body", "interior"];
  for (const z of reveal) prior[z] = all[z]!;
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
    const seasonalBonus = season && season.flipBonusStyle === style ? (season.flipBonus ?? 0) : 0;
    const grant = computeFlipGrant({
      basePrice,
      level: car.level,
      style,
      buyerArchetype,
      condition,
      repairQualityBonus: car.repairQualityBonus,
      prestigeMult: pMult,
      seasonalBonus,
      acquireCost: car.acquireCost,
      repairSpent: car.repairSpent,
    });
    // deterministic + unique per car instance (audit B1). NON-numeric tail (`g..c..`)
    // so the flip key can NEVER collide with the ride-clamp suffix `:memberId:bookingId`.
    const saleId = `g${memberId}c${garajCarId}`;
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
    return { ok: true, grant: result.grant, profit: result.profit, coins: await getCoins(memberId) };
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

// ── 🏺 Ko'zacha (second currency) — earn from rides, spend in the shop. SEPARATE
// from tanga: writes KozachaTxn + MemberGarajMeta.kozachaBalance only, NEVER CoinTxn,
// so it can never affect the 350/ride tanga clamp or be withdrawn.
export async function grantKozacha(memberId: number, amount: number, reason: string, idempotencyKey: string): Promise<number> {
  amount = Math.floor(amount);
  if (amount <= 0) return 0;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.kozachaTxn.create({ data: { memberId, amount, reason, idempotencyKey } }); // @unique key → P2002 on dup
      await tx.memberGarajMeta.upsert({ where: { memberId }, create: { memberId, kozachaBalance: amount }, update: { kozachaBalance: { increment: amount } } });
    });
    return amount;
  } catch (e) {
    if ((e as { code?: string } | null)?.code === "P2002") return 0; // already granted for this key
    throw e;
  }
}

export async function spendKozachaIdempotent(memberId: number, amount: number, reason: string, idempotencyKey: string): Promise<boolean> {
  amount = Math.floor(amount);
  if (amount <= 0) return false;
  return withMemberLock(memberId, async () => {
    const dup = await prisma.kozachaTxn.findUnique({ where: { idempotencyKey } });
    if (dup) return true;
    try {
      return await prisma.$transaction(async (tx) => {
        const upd = await tx.memberGarajMeta.updateMany({ where: { memberId, kozachaBalance: { gte: amount } }, data: { kozachaBalance: { decrement: amount } } });
        if (upd.count === 0) return false;
        await tx.kozachaTxn.create({ data: { memberId, amount: -amount, reason, idempotencyKey } });
        return true;
      });
    } catch (e) {
      if ((e as { code?: string } | null)?.code === "P2002") return true;
      throw e;
    }
  });
}

// ── Ko'zacha shop buy — spend kozacha to boost a car's flip price. Atomic + apply-once
// (decrement + ledger + boost in ONE tx, idempotent per item+car via the unique key).
export async function garajKozachaBuy(memberId: number, itemCode: string, garajCarId: number): Promise<GarajActionResult> {
  if (!(await garajEnabledFor(memberId))) return { ok: false, reason: "off" };
  const item = KOZACHA_SHOP.find((i) => i.code === itemCode);
  if (!item) return { ok: false, reason: "unknown" };
  return withMemberLock(memberId, async () => {
    const car = await prisma.garajCar.findFirst({ where: { id: garajCarId, memberId, soldAt: null } });
    if (!car) return { ok: false, reason: "not_found" };
    const key = `kozbuy:${itemCode}:${garajCarId}`;
    if (await prisma.kozachaTxn.findUnique({ where: { idempotencyKey: key } })) return { ok: false, reason: "already" };
    const newRQB = Math.max(REPAIR_QUALITY_MIN, Math.min(REPAIR_QUALITY_MAX, car.repairQualityBonus * item.factor));
    try {
      const done = await prisma.$transaction(async (tx) => {
        const upd = await tx.memberGarajMeta.updateMany({ where: { memberId, kozachaBalance: { gte: item.cost } }, data: { kozachaBalance: { decrement: item.cost } } });
        if (upd.count === 0) return false;
        await tx.kozachaTxn.create({ data: { memberId, amount: -item.cost, reason: `kozshop:${itemCode}`, idempotencyKey: key } });
        await tx.garajCar.update({ where: { id: garajCarId }, data: { repairQualityBonus: newRQB } });
        return true;
      });
      return done ? { ok: true } : { ok: false, reason: "insufficient_kozacha" };
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
  let dropType = "NONE";
  let dropCode = "";
  if (bucket < 400) {
    dropType = "PART";
    dropCode = "common";
  } else if (bucket < 600) {
    dropType = "PART";
    dropCode = "rare";
  } else if (bucket < 700) {
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
