// TAXI PARK — idle/empire collector. Buy virtual taxis with coins; they earn
// coins per hour, accruing offline up to an 8h cap so you must come back ~3x a
// day. Upgrades cost exponentially more (a near-bottomless coin sink that
// absorbs game payouts and protects withdraw liability). Output gets a bonus
// the days you actually take a real ride.

export const PARK_ACCRUAL_CAP_MS = 8 * 3600_000; // earnings stop after 8h offline
export const PARK_UPGRADE_GROWTH = 1.6; // cost multiplier per level
export const PARK_RIDE_BONUS_PCT = 0.25; // +25% output if you rode a real taxi today

export interface ParkCarDef {
  code: string;
  name: string;
  emoji: string;
  baseCost: number; // coins to buy level 1
  coinsPerHour: number; // output at level 1
}

export const PARK_CARS: ParkCarDef[] = [
  { code: "tico", name: "Tico", emoji: "🚗", baseCost: 1500, coinsPerHour: 30 },
  { code: "damas", name: "Damas", emoji: "🚐", baseCost: 6000, coinsPerHour: 110 },
  { code: "nexia", name: "Nexia", emoji: "🚙", baseCost: 20000, coinsPerHour: 320 },
  { code: "malibu", name: "Malibu", emoji: "🏎️", baseCost: 70000, coinsPerHour: 1000 },
];

export function parkCarByCode(code: string): ParkCarDef | undefined {
  return PARK_CARS.find((c) => c.code === code);
}

/** Cost to buy (level 0→1) or upgrade (level n→n+1). */
export function parkUpgradeCost(def: ParkCarDef, currentLevel: number): number {
  return Math.floor(def.baseCost * Math.pow(PARK_UPGRADE_GROWTH, currentLevel));
}

/** A level-`n` car's hourly output (output scales ~1.5x per level). */
export function parkCarOutput(def: ParkCarDef, level: number): number {
  return Math.floor(def.coinsPerHour * Math.pow(1.5, level - 1));
}

export interface ParkCarView {
  code: string;
  name: string;
  emoji: string;
  level: number; // 0 = not owned
  output: number; // coins/hour at current level
  upgradeCost: number; // cost to buy/upgrade
}

export interface ParkResponse {
  cars: ParkCarView[];
  perHour: number; // total output
  accrued: number; // collectable now (capped)
  capped: boolean; // accrual hit the 8h cap
  rideBonusActive: boolean;
  coins: number;
}
