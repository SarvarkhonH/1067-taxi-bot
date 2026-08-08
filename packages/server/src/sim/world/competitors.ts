// ⚔️ L5 — TIRIK raqiblar (1415 javob qaytaradi). Sof modul: DB YO'Q, Math.random/Date.now TAQIQ —
// tasodif faqat berilgan Rng-oqimdan, vaqt faqat world.day dan.
//
// Mexanika (master-reja L5): BirJoy bozor-ulushi oxirgi 7 kunda TRIGGER'dan oshsa 1415 qaror qiladi:
//   a) reklama-kampaniya — keyingi K kun raqib-tomon bosim: dailyAwarenessInflow'ga jarima
//      (birjoyAwarenessPenalty) + switchingCost-effekt sifatida raqib-utility boost (competitorBoost);
//   b) narx-tushirish — 1415 tarifi pasayadi (fareDelta1415, ming so'm, manfiy).
// Modul market.ts'ga TEGMAYDI — effektlarni parametr-obyekt sifatida qaytaradi; ulash run.ts'da
// (WIRING builder-javobida). Chaqirish tartibi: har kun OXIRIDA (safarlar bajarilib bo'lgach,
// todayCounters nollanishidan OLDIN) — qaytgan effektlar KEYINGI kunga qo'llanadi.

import type { WorldState } from "../types";
import { rngBool, type Rng } from "../rng";

// ── Javob-qoidalar konfigi (L2/L9 shularni burashi mumkin) ────────────────────
/** 7-kunlik o'rtacha BirJoy-ulush shu %dan oshsa 1415 "uyg'onadi" (hozirgi real ulush ~0.7%). */
const SHARE_TRIGGER_PCT = 3;
/** Trigger yoqilganda har kun javob-boshlanish ehtimoli: baza + aggression-qo'shimcha. */
const P_RESPOND_BASE = 0.2;
const P_RESPOND_AGGRESSION = 0.5;
/** Kampaniya-davomiyliklari (kun). */
const AD_CAMPAIGN_DAYS = 10;
const PRICE_CUT_DAYS = 7;
/** Reklama-kampaniya kuchi: BirJoy awareness-oqimiga jarima (0..1 ulush) va raqib-utility boost. */
const AD_AWARENESS_PENALTY = 0.35; // dailyAwarenessInflow × (1 − shu) — WIRING'da qo'llanadi
const AD_COMPETITOR_BOOST = 0.6; // 1415-utility'ga qo'shiladigan had (switchingCost his-effekti)
/** Narx-tushirish chuqurligi (ming so'm, manfiy): 15 → 13. */
const PRICE_CUT_DELTA = -2;
/** Aggression-dinamikasi: har trigger-kun +o'sish, tinch kunlarda sekin so'nish. */
const AGGRESSION_GAIN = 0.08;
const AGGRESSION_DECAY = 0.01;
/** Ulush-oynasi uzunligi (kun). */
const SHARE_WINDOW_DAYS = 7;

// ── Lokal kontrakt (types.ts'ga tegilmaydi) ───────────────────────────────────
export interface CompetitorState {
  /** Reklama-kampaniya tugashigacha qolgan kunlar (0 = faol emas). */
  adCampaignDaysLeft: number;
  /** Narx-tushirish tugashigacha qolgan kunlar (0 = faol emas). */
  priceCutDaysLeft: number;
  /** 1415 agressiya-darajasi 0..1 — trigger takrorlangan sari javob tezlashadi/kuchayadi. */
  aggression: number;
  /** Oxirgi kunlardagi BirJoy-ulush (%, eng eskisi boshida; maks SHARE_WINDOW_DAYS ta). */
  shareHistoryPct: number[];
}

/** KEYINGI kunga qo'llanadigan raqib-effektlar (hammasi doim mavjud; neytral = 0). */
export interface CompetitorEffects {
  /** 1415-utility'ga qo'shiladigan had (multinomial-logit'da raqib-tomon bosim). 0 = yo'q. */
  competitorBoost: number;
  /** BirJoy awareness-oqimiga jarima-ulush 0..1: effektiv inflow = inflow × (1 − shu). 0 = yo'q. */
  birjoyAwarenessPenalty: number;
  /** 1415 tarif-farqi (ming so'm, manfiy = arzonlashdi; FARE.d1415 + shu). 0 = yo'q. */
  fareDelta1415: number;
}

export function createCompetitorState(): CompetitorState {
  return { adCampaignDaysLeft: 0, priceCutDaysLeft: 0, aggression: 0, shareHistoryPct: [] };
}

/** Bugungi BirJoy-ulush (%) — todayCounters'dan (safarlar bajarilib bo'lgach chaqiriladi). */
function todaySharePct(world: WorldState): number {
  const { ridesBirjoy, rides1415, rides1313 } = world.todayCounters;
  const total = ridesBirjoy + rides1415 + rides1313;
  return total > 0 ? (ridesBirjoy / total) * 100 : 0;
}

/**
 * HAR KUN OXIRIDA bir marta chaqiriladi (safar-taqsimot bajarilgach, counter-reset'dan oldin).
 * Bugungi ulushni oynaga yozadi, 1415-qarorini yuritadi va KEYINGI kun effektlarini qaytaradi.
 * Determinizm: rng faqat trigger yoqiq kunlarda, qat'iy tartibda ikkitagacha tortishadi.
 */
export function updateCompetitors(
  world: WorldState,
  state: CompetitorState,
  rng: Rng,
): CompetitorEffects {
  // 1) Ulush-oynani yangilash
  state.shareHistoryPct.push(todaySharePct(world));
  if (state.shareHistoryPct.length > SHARE_WINDOW_DAYS) state.shareHistoryPct.shift();
  const avgShare =
    state.shareHistoryPct.reduce((s, x) => s + x, 0) / Math.max(1, state.shareHistoryPct.length);

  // 2) Faol kampaniyalar bir kunga kamayadi
  if (state.adCampaignDaysLeft > 0) state.adCampaignDaysLeft--;
  if (state.priceCutDaysLeft > 0) state.priceCutDaysLeft--;

  // 3) Trigger: 7-kunlik o'rtacha ulush chegaradan oshdimi?
  const triggered = avgShare > SHARE_TRIGGER_PCT;
  if (triggered) {
    state.aggression = Math.min(1, state.aggression + AGGRESSION_GAIN);
    // Yangi javob faqat bo'sh o'rin bo'lsa boshlanadi (bir vaqtda ikkalasi ham mumkin, lekin
    // har biri o'z slotida): avval reklama-moyillik, qolsa narx-tushirish.
    const pRespond = Math.min(1, P_RESPOND_BASE + P_RESPOND_AGGRESSION * state.aggression);
    if (rngBool(rng, pRespond)) {
      // Qaysi qurol? Aggression past — reklama (arzonroq); yuqori — narx-urushi ehtimoli o'sadi.
      const prefersPriceCut = rngBool(rng, 0.25 + 0.5 * state.aggression);
      if (prefersPriceCut && state.priceCutDaysLeft === 0) {
        state.priceCutDaysLeft = PRICE_CUT_DAYS;
      } else if (state.adCampaignDaysLeft === 0) {
        state.adCampaignDaysLeft = AD_CAMPAIGN_DAYS;
      }
    }
  } else {
    state.aggression = Math.max(0, state.aggression - AGGRESSION_DECAY);
  }

  // 4) KEYINGI kun effektlari (kampaniya hali faol bo'lsa)
  const adActive = state.adCampaignDaysLeft > 0;
  const cutActive = state.priceCutDaysLeft > 0;
  return {
    competitorBoost: adActive ? AD_COMPETITOR_BOOST * (0.6 + 0.4 * state.aggression) : 0,
    birjoyAwarenessPenalty: adActive ? AD_AWARENESS_PENALTY : 0,
    fareDelta1415: cutActive ? PRICE_CUT_DELTA : 0,
  };
}
