// Client-facing reference data surfaced from kas1067 (read-only): how much
// cashback a ride earns, a fare estimate, car types, support contacts.

export interface CashbackRulesView {
  enabled: boolean;
  perAppRide: number; // cashback for a bot/app booking
  perCallRide: number; // cashback for a phone-call booking
  firstAppBonus: number;
  minDistanceKm: number; // ride must reach this to earn
}

export interface CarTypeView {
  id: number;
  name: string;
  category: string;
  rating: number;
}

export interface FareConfigResponse {
  minimalPayment: number;
  minimalDistanceKm: number;
  perKmCity: number;
  perKmRegion: number;
  perMinute: number;
  cars: CarTypeView[];
  cashback: CashbackRulesView;
  company: { name: string; phones: string[] };
}

export interface FareEstimate {
  distanceKm: number;
  inRegion: boolean;
  price: number;
  cashback: number;
}

/** Pure fare math — shared so the Mini App can estimate live without a round-trip. */
export function estimateFare(cfg: FareConfigResponse, distanceKm: number, inRegion: boolean): FareEstimate {
  const perKm = inRegion ? cfg.perKmRegion : cfg.perKmCity;
  const billableKm = Math.max(0, distanceKm - cfg.minimalDistanceKm);
  const price = Math.max(cfg.minimalPayment, Math.round(cfg.minimalPayment + billableKm * perKm));
  const earns = distanceKm >= cfg.cashback.minDistanceKm ? cfg.cashback.perAppRide : 0;
  return { distanceKm, inRegion, price, cashback: earns };
}
