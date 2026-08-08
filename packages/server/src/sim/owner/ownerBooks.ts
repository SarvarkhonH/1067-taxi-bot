// 💼 Ega-daftari (soxta kas1067): kunlik kirim/chiqim + majburiyatlarni DB'dan o'lchash +
// solvency-holat mashinasi. Sof yozuvlar world.owner'da; DB faqat funksiya ichida dinamik
// import bilan o'qiladi (run.ts import-tartibi buzilmasin).

import { OYIN_SOM_PER_BALL, OYIN_SOM_PER_RIDE } from "@t1067/shared";
import type { OwnerBooksState, SimEvent, WorldState } from "../types";

/** Bir safarning operatsion xarajati (so'm) — dispetcher/aloqa/infra taxmini, parametr. */
export const SIM_OP_COST_PER_RIDE = 200;

export function initBooks(seedCash = 5_000_000): OwnerBooksState {
  return {
    cash: seedCash,
    revenueTotal: 0,
    prizeSpendTotal: 0,
    bonusSpendTotal: 0,
    opCostTotal: 0,
    outstandingTangaSom: 0,
    outstandingBallSom: 0,
    solvencyStatus: "Healthy",
    criticalSince: null,
    bankruptDay: null,
  };
}

/** Kunlik yangilash: bugungi safar-daromad/xarajat, majburiyatlar o'lchovi, solvency-mashina.
 *  Holat o'zgarishlari SimEvent sifatida qaytadi (events.jsonl uchun). */
export async function updateBooks(
  world: WorldState,
  opCostPerRide = SIM_OP_COST_PER_RIDE,
): Promise<SimEvent[]> {
  const o = world.owner;
  const events: SimEvent[] = [];

  // 1) Bugungi kirim/chiqim (sovrin-xarajatni ownerAgent tiraj lahzasida yozadi)
  const revenueToday = world.todayCounters.ridesBirjoy * OYIN_SOM_PER_RIDE;
  const opCostToday = world.todayCounters.ridesBirjoy * opCostPerRide;
  o.revenueTotal += revenueToday;
  o.opCostTotal += opCostToday;
  o.cash += revenueToday - opCostToday;

  // 2) Majburiyatlar — DB'dan qayta o'lchanadi (sim-DB izolyatsiyalangan, hamma satr sim'niki)
  const { prisma } = await import("../../db");
  const { getBonusEcon } = await import("../../services/bonusConfig");
  const [coinAgg, rideRewardCount, ticketRows, econ] = await Promise.all([
    prisma.member.aggregate({ _sum: { coins: true }, where: { kasId: { startsWith: "SIM-" } } }),
    prisma.rideReward.count(),
    prisma.appState.findMany({ where: { key: { startsWith: "oyin:tickets:" } }, select: { value: true } }),
    getBonusEcon(),
  ]);
  o.outstandingTangaSom = Math.max(0, Math.round(coinAgg._sum.coins ?? 0));

  // ⚠️ TAXMIN (P1-soddalik): to'liq computeBallMap og'ir — ball ≈ RideReward-soni × oyinRideBall
  // minus chipta-sarflar (oyin:tickets dagi priceAtPurchase yig'indisi). Birinchi-safar bonusi,
  // login/quest/referral ballari ATAYLAB hisobga olinmagan — bu pastki baho, aniq buxgalteriya emas.
  let spentBall = 0;
  for (const row of ticketRows) {
    try {
      const arr = JSON.parse(row.value) as unknown;
      if (!Array.isArray(arr)) continue;
      for (const item of arr) {
        if (!item || typeof item !== "object") continue;
        const p = Number((item as Record<string, unknown>).priceAtPurchase);
        if (Number.isFinite(p) && p > 0) spentBall += Math.round(p);
      }
    } catch {
      // buzuq qator — o'tkazamiz (taxminiy o'lchovda halokat emas)
    }
  }
  const earnedBallEst = rideRewardCount * (econ.oyinRideBall ?? 0);
  o.outstandingBallSom = Math.max(0, Math.round((earnedBallEst - spentBall) * OYIN_SOM_PER_BALL));

  // 3) Solvency-mashina: kassa majburiyatlarni qoplaydimi
  const liabilities = o.outstandingTangaSom + o.outstandingBallSom;
  const netToday = revenueToday - opCostToday;
  const prev = o.solvencyStatus;
  let next: OwnerBooksState["solvencyStatus"];
  if (o.cash <= 0) next = "Insolvent";
  else if (liabilities > 0 && o.cash < 0.5 * liabilities) next = "Critical";
  else if (liabilities > 0 && o.cash < liabilities) next = "Fragile";
  else next = netToday > 0 ? "Growing" : "Healthy";
  o.solvencyStatus = next;

  if (next === "Critical" || next === "Insolvent") {
    if (!o.criticalSince) {
      o.criticalSince = {
        day: world.day,
        reason: `kassa ${Math.round(o.cash)} so'm < majburiyat ${liabilities} so'mning yarmi`,
      };
    }
  } else if (next === "Healthy" || next === "Growing") {
    o.criticalSince = null;
  }
  if (next === "Insolvent" && o.bankruptDay == null) {
    o.bankruptDay = world.day;
    events.push({
      day: world.day,
      type: "bankrupt",
      detail: `kassa ${Math.round(o.cash)} so'm — to'lovga layoqatsiz`,
      data: { cash: o.cash, liabilities },
    });
  }
  if (next !== prev) {
    events.push({
      day: world.day,
      type: "solvency",
      detail: `${prev} → ${next}`,
      data: { cash: Math.round(o.cash), liabilities, revenueToday, opCostToday },
    });
  }
  return events;
}
