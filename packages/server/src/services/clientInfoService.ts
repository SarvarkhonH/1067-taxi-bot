import type { FareConfigResponse } from "@t1067/shared";
import { getDataSource } from "../kas";

const M_PER_KM = 1000;

// kas tariff/bonus/car data changes rarely; cache the assembled config ~5 min.
let cache: { at: number; val: FareConfigResponse } | null = null;

/** Assemble the client-facing fare + cashback + car-type config from kas1067. */
export async function getFareConfig(): Promise<FareConfigResponse> {
  if (cache && Date.now() - cache.at < 300_000) return cache.val;
  const ds = getDataSource();
  const [tariff, bonus, cars, company] = await Promise.all([
    ds.getTariff(),
    ds.getBonusRules(),
    ds.getCarModels(),
    ds.getCompanyInfo(),
  ]);
  const val: FareConfigResponse = {
    minimalPayment: tariff.minimalPayment,
    minimalDistanceKm: tariff.minimalDistance / M_PER_KM,
    perKmCity: tariff.distancePaymentInCity,
    perKmRegion: tariff.distancePaymentInRegion,
    perMinute: tariff.timePayment,
    cars: cars.map((c) => ({ id: c.id, name: c.name, category: c.category, rating: c.rating })),
    cashback: {
      enabled: bonus.enabled,
      perAppRide: bonus.clientBonusApp,
      perCallRide: bonus.clientBonusCall,
      firstAppBonus: bonus.clientBonusAppFirstTime,
      minDistanceKm: bonus.clientBonusMinimalDistance / M_PER_KM,
    },
    company: { name: company.companyName, phones: company.dispatcherPhones },
  };
  cache = { at: Date.now(), val };
  return val;
}
