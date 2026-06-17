// 🚗 GARAJ — ride-to-earn virtual cars. A car earns coins ONLY while its owner
// is on a REAL kas ride (status "started"), measured by the booking sweep.
// Payback is deliberately slow (≥30 rides at the 20-min cap) — STEPN's death
// spiral came from fast-yield assets; ours are engagement assets.

export interface GarageCarDef {
  code: string;
  name: string;
  emoji: string;
  price: number; // coins (sink)
  ratePerMin: number; // coins per ride-minute while equipped
}

export const GARAGE_CARS: GarageCarDef[] = [
  { code: "damas", name: "Damas", emoji: "🚐", price: 600, ratePerMin: 1 },
  { code: "matiz", name: "Matiz", emoji: "🚗", price: 1500, ratePerMin: 2 },
  { code: "nexia", name: "Nexia", emoji: "🚙", price: 2800, ratePerMin: 3 },
  { code: "cobalt", name: "Cobalt", emoji: "🚘", price: 5000, ratePerMin: 5 },
  { code: "malibu", name: "Malibu", emoji: "🏎", price: 9000, ratePerMin: 8 },
];

export const GARAGE_RIDE_CAP_MIN = 20; // max earning minutes per ride
export const GARAGE_SERVICE_EVERY = 25; // rides between "Moy almashtirish"
export const GARAGE_SERVICE_COST_PCT = 0.1; // service costs 10% of car price (recurring sink)
export const GARAGE_UNSERVICED_RATE = 0.5; // overdue car earns at half rate

export function garageCarByCode(code: string): GarageCarDef | undefined {
  return GARAGE_CARS.find((c) => c.code === code);
}

export interface GarageCarView {
  code: string;
  name: string;
  emoji: string;
  price: number;
  ratePerMin: number;
  owned: boolean;
  equipped: boolean;
  ridesSinceService: number;
  serviceDue: boolean; // earning at half rate until serviced
  serviceCost: number;
}

export interface GarageResponse {
  cars: GarageCarView[];
  equippedCode: string | null;
  coins: number;
  totalEarned: number; // lifetime tanga the garage has earned (sum of "garage" grants)
  equippedEstimate: { name: string; emoji: string; amount: number } | null; // equipped car's earn per full ride
}
