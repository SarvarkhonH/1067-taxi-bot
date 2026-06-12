// 🚗 Garaj — ride-to-earn cars. Buying/servicing are pure SINKS (spendCoins);
// earning happens ONLY from the booking sweep's ride meter and goes through
// the per-ride emission clamp. One equipped car at a time.
import {
  GARAGE_CARS,
  GARAGE_RIDE_CAP_MIN,
  GARAGE_SERVICE_COST_PCT,
  GARAGE_SERVICE_EVERY,
  GARAGE_UNSERVICED_RATE,
  garageCarByCode,
  type GarageResponse,
} from "@t1067/shared";
import { prisma } from "../db";
import { getCoins, grantRideCoins, spendCoins } from "./coinService";

export async function getGarage(memberId: number): Promise<GarageResponse> {
  const owned = await prisma.memberCar.findMany({ where: { memberId } });
  const byCode = new Map(owned.map((c) => [c.carCode, c]));
  const cars = GARAGE_CARS.map((def) => {
    const o = byCode.get(def.code);
    return {
      code: def.code,
      name: def.name,
      emoji: def.emoji,
      price: def.price,
      ratePerMin: def.ratePerMin,
      owned: !!o,
      equipped: o?.isEquipped ?? false,
      ridesSinceService: o?.ridesSinceService ?? 0,
      serviceDue: (o?.ridesSinceService ?? 0) >= GARAGE_SERVICE_EVERY,
      serviceCost: Math.floor(def.price * GARAGE_SERVICE_COST_PCT),
    };
  });
  return {
    cars,
    equippedCode: owned.find((c) => c.isEquipped)?.carCode ?? null,
    coins: await getCoins(memberId),
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

/** The equipped car's live earn estimate for N minutes (the ride-card line). */
export async function equippedEstimate(memberId: number, minutes: number): Promise<{ name: string; emoji: string; amount: number } | null> {
  const car = await prisma.memberCar.findFirst({ where: { memberId, isEquipped: true } });
  if (!car) return null;
  const def = garageCarByCode(car.carCode);
  if (!def) return null;
  const rate = car.ridesSinceService >= GARAGE_SERVICE_EVERY ? def.ratePerMin * GARAGE_UNSERVICED_RATE : def.ratePerMin;
  const amount = Math.floor(Math.min(GARAGE_RIDE_CAP_MIN, Math.max(0, minutes)) * rate);
  return { name: def.name, emoji: def.emoji, amount };
}

/**
 * Credit the equipped car's earnings for ONE finished ride (called from the
 * sweep). Idempotent via the per-ride key; clamped by RIDE_EMISSION_CAP.
 */
export async function earnForRide(memberId: number, bookingId: number, minutes: number): Promise<{ amount: number; name: string } | null> {
  const car = await prisma.memberCar.findFirst({ where: { memberId, isEquipped: true } });
  if (!car || minutes <= 0) return null;
  const def = garageCarByCode(car.carCode);
  if (!def) return null;
  const overdue = car.ridesSinceService >= GARAGE_SERVICE_EVERY;
  const rate = overdue ? def.ratePerMin * GARAGE_UNSERVICED_RATE : def.ratePerMin;
  const amount = Math.floor(Math.min(GARAGE_RIDE_CAP_MIN, minutes) * rate);
  await prisma.memberCar.update({ where: { id: car.id }, data: { ridesSinceService: { increment: 1 } } });
  if (amount <= 0) return null;
  const g = await grantRideCoins(memberId, bookingId, amount, "garage", `🚗 ${def.name} ishladi (${Math.min(GARAGE_RIDE_CAP_MIN, Math.round(minutes))} daq)`, "garage");
  if (!g.ok) return null;
  return { amount: amount - (g.clamped ?? 0), name: def.name };
}
