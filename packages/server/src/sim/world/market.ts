// 🚕 Bozor-taqsimot: har sim-kun qaysi agent safar qiladi va qaysi dispetcherni tanlaydi
// (BirJoy / 1415 / 1313 — multinomial-logit: narx, kutish, odat, psixo-bonus, ijtimoiy isbot).
// DB YO'Q — sof mantiq; tasodif faqat berilgan Rng-oqimdan, vaqt faqat world.day dan.

import type { AgentState, WorldState } from "../types";
import { rngBool, type Rng } from "../rng";
import { presentBiasDiscount, prospectValue, socialProofBoost } from "./psychology";

// ── Kalibratsiya-konstantalar (L2-halqa shularni burashi mumkin) ──────────────
/** Hafta-kuni to'lqini (indeks = world.day % 7), ±20% ichida — dam olishga qarab o'sadi. */
const WEEKDAY_WAVE = [1.0, 0.9, 0.85, 0.95, 1.05, 1.2, 1.05] as const;
/** Koson katta-yosh aholisi — fon-safar masshtabi (sim-populyatsiya bundan kichik bo'lishi mumkin). */
const CITY_ADULTS = 40_000;
/** Bir haydovchi kuniga qancha safarni sig'diradi (kutish-vaqt yuklamasi uchun). */
const RIDES_PER_DRIVER_DAY = 14;
/** Kutish-normallashtirish (daqiqa): shu qiymatda jazo-hadi ≈ 1 birlik. */
const WAIT_NORM_MIN = 10;
/** Nisbiy narxlar (ming so'm) — hozircha uchchala dispetcher bir xil tarif (real Koson). */
const FARE = { birjoy: 15, d1415: 15, d1313: 15 } as const;
/** Har BirJoy-safarda his qilinadigan aniq tanga-yutuq (shartli birlik, prospect-kirish). */
const CASHBACK_WIN_UNITS = 1;
/** Odat-siljish qadamlar: BirJoy tanlansa BirJoy tomon, raqib tanlansa raqib tomon (+0.01). */
const HABIT_SHIFT_BIRJOY = 0.05;
const HABIT_SHIFT_COMPETITOR = 0.01;

/** Multinomial-logit koeffitsiyentlari: U = b1·(−narxFarq) + b2·(−kutish^1.3) + b3·odat + b4·bonus + b5·ijtimoiy. */
const LOGIT = {
  b1Price: 0.8,
  b2Wait: 1.2,
  b3Habit: 2.2,
  b4Bonus: 0.9,
  b5Social: 1.1,
} as const;

// ── Churn-ostonalar ───────────────────────────────────────────────────────────
const CHURN_SAT_THRESHOLD = 35; // satisfaction shundan pastda churn-xavf keskin o'sadi
const CHURN_INACTIVE_DAYS = 28; // shuncha kun safarsiz = "uzoq faolsizlik"

export interface DailyRideAllocation {
  /** Bugun BirJoy bilan yuradiganlar — agent SAFAR-SONIga teng marta takrorlanadi (ko'pincha 1). */
  birjoyRiders: AgentState[];
  rides1415: number;
  rides1313: number;
}

/**
 * Kunlik safar-taqsimot. Agent-holatini o'zgartiradi (dispatcherHabit siljiydi), lekin
 * todayCounters/DBga TEGMAYDI — BirJoy-safarlarni bajarish (booking yozish) chaqirgan tomonning ishi.
 */
export function allocateDailyRides(world: WorldState, rng: Rng): DailyRideAllocation {
  const { behavior, market, population } = world.cfg;
  const wave = WEEKDAY_WAVE[world.day % 7] ?? 1;
  const birjoyRiders: AgentState[] = [];
  let agent1415 = 0;
  let agent1313 = 0;
  let birjoyLoad = 0; // bugungi BirJoy-yuklama — keyingi tanlovchilar kutishini oshiradi

  for (const agent of world.agents) {
    if (agent.stage !== "linked" && agent.stage !== "rode" && agent.stage !== "habitual") continue;

    // "Hech qachon minmaydiganlar" darvozasi (N4: real ulangan→1-safar atigi 19.4%)
    if (
      agent.firstRideDay === null &&
      0.6 * agent.traits.rideNeed + 0.4 * agent.traits.trust < behavior.firstRideGate
    ) {
      continue;
    }

    // 1) Bugun umuman taksi kerakmi (dispetcherdan qat'i nazar)
    const habitFactor = agent.firstRideDay !== null ? 1 + behavior.habitBoost : 1;
    const pRide = Math.min(
      0.95,
      (behavior.ridesPerWeekBase / 7) * (0.4 + 1.2 * agent.traits.rideNeed) * wave * habitFactor,
    );
    if (!rngBool(rng, pRide)) continue;

    // 2) Dispetcher-tanlov: multinomial-logit
    const capacity = Math.max(1, market.birjoyDrivers * RIDES_PER_DRIVER_DAY);
    const waitBirjoy = market.waitBirjoyBaseMin * (1 + birjoyLoad / capacity);
    const waitComp = market.waitCompetitorMin;
    const minFare = Math.min(FARE.birjoy, FARE.d1415, FARE.d1313);

    const habitB = agent.dispatcherHabit; // 0=1415 odat .. 1=BirJoy odat
    const habit1415 = (1 - habitB) * agent.traits.familiarity1415;
    const habit1313 = (1 - habitB) * (1 - agent.traits.familiarity1415) * 0.5;

    // Psixo-bonus (faqat BirJoy): aniq tanga-cashback prospect-qiymati × hozir-moyillik × sezgirlik
    const bonus =
      Math.max(0, prospectValue(CASHBACK_WIN_UNITS, 0, 1)) *
      presentBiasDiscount(0) *
      agent.traits.rewardSensitivity;

    // Ijtimoiy isbot (faqat BirJoy): mahalladagi so'nggi yutuqlar + faol do'stlar ulushi
    const mahalla = world.mahallas[agent.mahallaId];
    const winsNearby = mahalla ? mahalla.recentWins.length : 0;
    let activeFriends = 0;
    for (const fid of agent.friends) {
      const f = world.agents[fid];
      if (f && (f.stage === "rode" || f.stage === "habitual")) activeFriends++;
    }
    const friendShare = agent.friends.length > 0 ? activeFriends / agent.friends.length : 0;
    const social =
      (socialProofBoost(winsNearby, behavior.socialContagion) - 1) +
      friendShare * agent.traits.socialInfluence;

    const waitPenalty = (waitMin: number): number => Math.pow(waitMin / WAIT_NORM_MIN, 1.3);
    const priceTerm = (fare: number): number =>
      LOGIT.b1Price * -(fare - minFare) * agent.traits.priceSensitivity;

    const uBirjoy =
      priceTerm(FARE.birjoy) -
      LOGIT.b2Wait * waitPenalty(waitBirjoy) +
      LOGIT.b3Habit * habitB +
      LOGIT.b4Bonus * bonus +
      LOGIT.b5Social * social;
    const u1415 =
      priceTerm(FARE.d1415) - LOGIT.b2Wait * waitPenalty(waitComp) + LOGIT.b3Habit * habit1415;
    const u1313 =
      priceTerm(FARE.d1313) - LOGIT.b2Wait * waitPenalty(waitComp) + LOGIT.b3Habit * habit1313;

    const expB = Math.exp(uBirjoy);
    const exp1415 = Math.exp(u1415);
    const exp1313 = Math.exp(u1313);
    const draw = rng() * (expB + exp1415 + exp1313);

    if (draw < expB) {
      // BirJoy: odat BirJoy tomon siljiydi; yuqori rideNeed'da ba'zan 2-safar ham
      agent.dispatcherHabit = Math.min(
        1,
        agent.dispatcherHabit + HABIT_SHIFT_BIRJOY * (1 - agent.dispatcherHabit),
      );
      const rides = 1 + (rngBool(rng, Math.min(0.25, agent.traits.rideNeed * 0.2)) ? 1 : 0);
      for (let i = 0; i < rides; i++) birjoyRiders.push(agent);
      birjoyLoad += rides;
    } else {
      // Raqib: eski odat +0.01 kuchayadi (BirJoy-shkalada −0.01)
      agent.dispatcherHabit = Math.max(0, agent.dispatcherHabit - HABIT_SHIFT_COMPETITOR);
      if (draw < expB + exp1415) agent1415++;
      else agent1313++;
    }
  }

  // Fon-safarlar: sim-populyatsiyadan tashqaridagi shahar-oqimi (share-metrika real bo'lishi uchun)
  const popShare = Math.min(1, population / CITY_ADULTS);
  const rides1415 = agent1415 + Math.round(market.rides1415PerDay * (1 - popShare) * wave);
  const rides1313 = agent1313 + Math.round(market.rides1313PerDay * (1 - popShare) * wave);

  return { birjoyRiders, rides1415, rides1313 };
}

/** Satisfaction-yangilash: delta qo'shib [floor..cap] ichida qisadi (default 0..100). */
export function applySatisfaction(agent: AgentState, delta: number, floor = 0, cap = 100): void {
  agent.satisfaction = Math.min(cap, Math.max(floor, agent.satisfaction + delta));
}

/**
 * Churn-tekshiruv: satisfaction past yoki uzoq faolsizlik → "churned" (quitAfterLoss kuchaytiradi,
 * loyalty yumshatadi). true = agent bugun ketdi. Vaqt faqat world.day dan (Date.now TAQIQ).
 */
export function checkChurn(agent: AgentState, rng: Rng, world: WorldState): boolean {
  if (agent.stage !== "linked" && agent.stage !== "rode" && agent.stage !== "habitual") return false;
  const behavior = world.cfg.behavior;
  const today = world.day;

  let p = behavior.pChurnBase;
  if (agent.satisfaction < CHURN_SAT_THRESHOLD) {
    p *= 1 + ((CHURN_SAT_THRESHOLD - agent.satisfaction) / CHURN_SAT_THRESHOLD) * 4;
  }
  const lastActive = agent.lastRideDay ?? agent.firstRideDay;
  if (lastActive !== null && today - lastActive > CHURN_INACTIVE_DAYS) p *= 3;
  if (agent.lossStreak > 0) {
    p *= 1 + agent.traits.quitAfterLoss * Math.min(agent.lossStreak, 5) * 0.35;
  }
  p *= 1 - 0.5 * agent.traits.loyalty;

  if (!rngBool(rng, Math.min(0.5, p))) return false;
  agent.stage = "churned";
  world.todayCounters.churnedToday++;
  return true;
}
