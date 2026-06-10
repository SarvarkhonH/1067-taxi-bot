import {
  PARK_ACCRUAL_CAP_MS,
  PARK_CARS,
  PARK_RIDE_BONUS_PCT,
  parkCarByCode,
  parkCarOutput,
  parkUpgradeCost,
  type ParkResponse,
  type ParkCarView,
} from "@t1067/shared";
import { prisma } from "../db";
import { getCoins, grantCoins, spendCoins } from "./coinService";

function tashkentDayKey(d: Date): string {
  return new Date(d.getTime() + 5 * 3600 * 1000).toISOString().slice(0, 10);
}

async function rodeRealTaxiToday(memberId: number): Promise<boolean> {
  // a ride completion bumps the daily_ride mission for the current tashkent day
  const today = tashkentDayKey(new Date());
  const row = await prisma.missionProgress.findFirst({
    where: { memberId, code: "daily_ride", periodKey: today, progress: { gt: 0 } },
  });
  return !!row;
}

async function computeAccrued(memberId: number): Promise<{ accrued: number; perHour: number; capped: boolean; rideBonus: boolean }> {
  const [cars, state, rideBonus] = await Promise.all([
    prisma.parkCar.findMany({ where: { memberId } }),
    prisma.parkState.findUnique({ where: { memberId } }),
    rodeRealTaxiToday(memberId),
  ]);
  let perHour = 0;
  for (const c of cars) {
    const def = parkCarByCode(c.carCode);
    if (def) perHour += parkCarOutput(def, c.level);
  }
  const mult = rideBonus ? 1 + PARK_RIDE_BONUS_PCT : 1;
  const last = state?.lastCollectAt?.getTime() ?? Date.now();
  const elapsed = Math.min(PARK_ACCRUAL_CAP_MS, Date.now() - last);
  const capped = Date.now() - last >= PARK_ACCRUAL_CAP_MS && perHour > 0;
  const accrued = Math.floor((perHour * mult * elapsed) / 3600_000);
  return { accrued, perHour: Math.floor(perHour * mult), capped, rideBonus };
}

export async function getPark(memberId: number): Promise<ParkResponse> {
  const owned = await prisma.parkCar.findMany({ where: { memberId } });
  const levelOf = new Map(owned.map((c) => [c.carCode, c.level]));
  const cars: ParkCarView[] = PARK_CARS.map((def) => {
    const level = levelOf.get(def.code) ?? 0;
    return {
      code: def.code,
      name: def.name,
      emoji: def.emoji,
      level,
      output: level > 0 ? parkCarOutput(def, level) : def.coinsPerHour,
      upgradeCost: parkUpgradeCost(def, level),
    };
  });
  const acc = await computeAccrued(memberId);
  return { cars, perHour: acc.perHour, accrued: acc.accrued, capped: acc.capped, rideBonusActive: acc.rideBonus, coins: await getCoins(memberId) };
}

export async function buyOrUpgradeCar(memberId: number, carCode: string): Promise<{ ok: boolean; reason?: string; coins: number }> {
  const def = parkCarByCode(carCode);
  if (!def) return { ok: false, reason: "bad_car", coins: await getCoins(memberId) };
  const existing = await prisma.parkCar.findUnique({ where: { memberId_carCode: { memberId, carCode } } });
  const level = existing?.level ?? 0;
  const cost = parkUpgradeCost(def, level);
  const spend = await spendCoins(memberId, cost, "park", `${def.name} ${level === 0 ? "sotib olindi" : `daraja ${level + 1}`}`);
  if (!spend.ok) return { ok: false, reason: "insufficient", coins: spend.balance };

  if (existing) {
    await prisma.parkCar.update({ where: { id: existing.id }, data: { level: existing.level + 1 } });
  } else {
    await prisma.parkCar.create({ data: { memberId, carCode, level: 1 } });
    // start the accrual clock on first purchase
    await prisma.parkState.upsert({ where: { memberId }, create: { memberId, lastCollectAt: new Date() }, update: {} });
  }
  return { ok: true, coins: spend.balance };
}

export async function collectPark(memberId: number): Promise<{ ok: boolean; collected: number; coins: number }> {
  const acc = await computeAccrued(memberId);
  if (acc.accrued <= 0) return { ok: false, collected: 0, coins: await getCoins(memberId) };
  await prisma.parkState.upsert({
    where: { memberId },
    create: { memberId, lastCollectAt: new Date() },
    update: { lastCollectAt: new Date() },
  });
  const g = await grantCoins(memberId, acc.accrued, "park", "Park yig'imi");
  return { ok: true, collected: acc.accrued, coins: g.balance };
}
