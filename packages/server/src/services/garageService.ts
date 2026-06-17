// 🚗 Garaj — ride-to-earn cars. Buying/servicing are pure SINKS (spendCoins);
// earning happens ONLY from the booking sweep's ride meter and goes through
// the per-ride emission clamp. One equipped car at a time.
import {
  GARAGE_CARS,
  GARAGE_MAX_LEVEL,
  GARAGE_RIDE_CAP_MIN,
  GARAGE_SERVICE_COST_PCT,
  GARAGE_SERVICE_EVERY,
  GARAGE_UNSERVICED_RATE,
  garageCarByCode,
  garageLeveledRate,
  garageTier,
  garageUpgradeCost,
  type GarageResponse,
} from "@t1067/shared";
import { prisma } from "../db";
import { isPlus } from "./plusService";
import { getCoins, grantRideCoins, spendCoins } from "./coinService";

export async function getGarage(memberId: number): Promise<GarageResponse> {
  const owned = await prisma.memberCar.findMany({ where: { memberId } });
  const byCode = new Map(owned.map((c) => [c.carCode, c]));
  const cars = GARAGE_CARS.map((def) => {
    const o = byCode.get(def.code);
    const level = o?.level ?? 1;
    return {
      code: def.code,
      name: def.name,
      emoji: def.emoji,
      price: def.price,
      ratePerMin: Math.round(garageLeveledRate(def.ratePerMin, level) * 10) / 10, // leveled (1 dp)
      owned: !!o,
      equipped: o?.isEquipped ?? false,
      ridesSinceService: o?.ridesSinceService ?? 0,
      serviceDue: (o?.ridesSinceService ?? 0) >= GARAGE_SERVICE_EVERY,
      serviceCost: Math.floor(def.price * GARAGE_SERVICE_COST_PCT),
      level,
      tier: garageTier(level),
      upgradeCost: o && level < GARAGE_MAX_LEVEL ? garageUpgradeCost(def.price, level) : null,
    };
  });
  const [earned, estimate] = await Promise.all([
    prisma.coinTxn.aggregate({ where: { memberId, kind: "garage" }, _sum: { amount: true } }),
    equippedEstimate(memberId, GARAGE_RIDE_CAP_MIN), // earn for a full-length ride
  ]);
  return {
    cars,
    equippedCode: owned.find((c) => c.isEquipped)?.carCode ?? null,
    coins: await getCoins(memberId),
    totalEarned: Math.round(earned._sum.amount ?? 0),
    equippedEstimate: estimate,
  };
}

export async function buyCar(memberId: number, carCode: string): Promise<{ ok: boolean; reason?: "unknown" | "owned" | "insufficient"; coins: number }> {
  const def = garageCarByCode(carCode);
  if (!def) return { ok: false, reason: "unknown", coins: await getCoins(memberId) };
  const existing = await prisma.memberCar.findUnique({ where: { memberId_carCode: { memberId, carCode } } });
  if (existing) return { ok: false, reason: "owned", coins: await getCoins(memberId) };

  const spend = await spendCoins(memberId, def.price, "garage_buy", `🚗 Garaj: ${def.name} sotib olindi`);
  if (!spend.ok) return { ok: false, reason: "insufficient", coins: spend.balance };

  const hasAny = await prisma.memberCar.count({ where: { memberId } });
  try {
    await prisma.memberCar.create({ data: { memberId, carCode, isEquipped: hasAny === 0 } });
  } catch {
    // unique race — refund the duplicate purchase
    const { grantCoins } = await import("./coinService");
    await grantCoins(memberId, def.price, "garage_buy", "Garaj: dublikat xarid qaytarildi");
    return { ok: false, reason: "owned", coins: await getCoins(memberId) };
  }
  return { ok: true, coins: spend.balance };
}

export async function equipCar(memberId: number, carCode: string): Promise<boolean> {
  const car = await prisma.memberCar.findUnique({ where: { memberId_carCode: { memberId, carCode } } });
  if (!car) return false;
  await prisma.$transaction([
    prisma.memberCar.updateMany({ where: { memberId }, data: { isEquipped: false } }),
    prisma.memberCar.update({ where: { id: car.id }, data: { isEquipped: true } }),
  ]);
  return true;
}

export async function serviceCar(memberId: number, carCode: string): Promise<{ ok: boolean; reason?: "unknown" | "not_owned" | "not_due" | "insufficient"; coins: number }> {
  const def = garageCarByCode(carCode);
  if (!def) return { ok: false, reason: "unknown", coins: await getCoins(memberId) };
  const car = await prisma.memberCar.findUnique({ where: { memberId_carCode: { memberId, carCode } } });
  if (!car) return { ok: false, reason: "not_owned", coins: await getCoins(memberId) };
  if (car.ridesSinceService < GARAGE_SERVICE_EVERY) return { ok: false, reason: "not_due", coins: await getCoins(memberId) };

  const cost = Math.floor(def.price * GARAGE_SERVICE_COST_PCT);
  const spend = await spendCoins(memberId, cost, "garage_service", `🔧 Moy almashtirish: ${def.name}`);
  if (!spend.ok) return { ok: false, reason: "insufficient", coins: spend.balance };
  await prisma.memberCar.update({ where: { id: car.id }, data: { ridesSinceService: 0 } });
  return { ok: true, coins: spend.balance };
}

/** Upgrade an owned car one level (pure SINK) — raises its earn rate. */
export async function upgradeCar(memberId: number, carCode: string): Promise<{ ok: boolean; reason?: "unknown" | "not_owned" | "maxed" | "insufficient"; coins: number; level?: number }> {
  const def = garageCarByCode(carCode);
  if (!def) return { ok: false, reason: "unknown", coins: await getCoins(memberId) };
  const car = await prisma.memberCar.findUnique({ where: { memberId_carCode: { memberId, carCode } } });
  if (!car) return { ok: false, reason: "not_owned", coins: await getCoins(memberId) };
  if (car.level >= GARAGE_MAX_LEVEL) return { ok: false, reason: "maxed", coins: await getCoins(memberId) };
  const cost = garageUpgradeCost(def.price, car.level);
  const spend = await spendCoins(memberId, cost, "garage_upgrade", `🔧 ${def.name} → daraja ${car.level + 1}`);
  if (!spend.ok) return { ok: false, reason: "insufficient", coins: spend.balance };
  await prisma.memberCar.update({ where: { id: car.id }, data: { level: { increment: 1 } } });
  return { ok: true, coins: spend.balance, level: car.level + 1 };
}

/** The equipped car's live earn estimate for N minutes (the ride-card line). */
export async function equippedEstimate(memberId: number, minutes: number): Promise<{ name: string; emoji: string; amount: number } | null> {
  const car = await prisma.memberCar.findFirst({ where: { memberId, isEquipped: true } });
  if (!car) return null;
  const def = garageCarByCode(car.carCode);
  if (!def) return null;
  const leveled = garageLeveledRate(def.ratePerMin, car.level);
  let rate = car.ridesSinceService >= GARAGE_SERVICE_EVERY ? leveled * GARAGE_UNSERVICED_RATE : leveled;
  const m = await prisma.member.findUnique({ where: { id: memberId }, select: { plusUntil: true } });
  if (m && isPlus(m)) rate *= 1.2; // 💎 Plus garage boost
  const amount = Math.floor(Math.min(GARAGE_RIDE_CAP_MIN, Math.max(0, minutes)) * rate);
  return { name: def.name, emoji: def.emoji, amount };
}

/**
 * Credit the equipped car's earnings for ONE finished ride (called from the
 * sweep). Idempotent via the per-ride key; clamped by RIDE_EMISSION_CAP.
 */
export async function earnForRide(memberId: number, bookingId: number, minutes: number): Promise<{ amount: number; name: string } | null> {
  // P1 (QA fleet): the garage kill-switch was declared in FEATURES but never enforced —
  // earning kept paying even when feature:garage was OFF. Gate it here (the only earn path).
  const { featureOn } = await import("./featureFlags");
  if (!(await featureOn("garage"))) return null;
  const car = await prisma.memberCar.findFirst({ where: { memberId, isEquipped: true } });
  if (!car || minutes <= 0) return null;
  const def = garageCarByCode(car.carCode);
  if (!def) return null;
  const overdue = car.ridesSinceService >= GARAGE_SERVICE_EVERY;
  const leveled = garageLeveledRate(def.ratePerMin, car.level);
  let rate = overdue ? leveled * GARAGE_UNSERVICED_RATE : leveled;
  const pm = await prisma.member.findUnique({ where: { id: memberId }, select: { plusUntil: true } });
  if (pm && isPlus(pm)) rate *= 1.2; // 💎 Plus garage boost
  const amount = Math.floor(Math.min(GARAGE_RIDE_CAP_MIN, minutes) * rate);
  if (amount <= 0) return null;
  const g = await grantRideCoins(memberId, bookingId, amount, "garage", `🚗 ${def.name} ishladi (${Math.min(GARAGE_RIDE_CAP_MIN, Math.round(minutes))} daq)`, "garage");
  // Exactly-once wear: advance ONLY when the grant actually landed. grantRideCoins
  // is ok:false on (a) a fully-clamped ride (0 coins → 0 wear) and (b) a retry/concurrent
  // duplicate (the per-ride key garage:<m>:<b> already paid). Gating on g.ok ties the
  // increment to that same atomic CoinTxn unique-key guarantee, so a sweep retry or two
  // concurrent calls for the same (memberId, bookingId) increment ridesSinceService once total.
  if (!g.ok) return null;
  await prisma.memberCar.update({ where: { id: car.id }, data: { ridesSinceService: { increment: 1 } } });
  return { amount: amount - (g.clamped ?? 0), name: def.name };
}
