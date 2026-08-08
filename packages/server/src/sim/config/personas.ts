// 🎭 8 arxetip (master-reja): aholi-ulushlari + har trait uchun gauss-prior (mean/std).
// sampleTraits TRAIT_KEYS tartibida yuradi — rng-oqim tartibi qat'iy (determinizm).
import type { ArchetypeKey, Traits } from "../types";
import type { Rng } from "../rng";
import { rngTrait } from "../rng";

export interface TraitPrior {
  mean: number;
  std: number;
}

/** Qat'iy tartib — sampleArchetype kumulyativ yurishi shu tartibda (determinizm). */
export const ARCHETYPE_ORDER: readonly ArchetypeKey[] = [
  "oddiy", "qatnovchi", "oyinchi", "chempion",
  "talaba", "savdogar", "sinovchi", "konservator",
] as const;

/** Aholi-ulushlari (yig'indi = 1.00, master-reja). */
export const ARCHETYPE_SHARES: Record<ArchetypeKey, number> = {
  oddiy: 0.34,
  qatnovchi: 0.15,
  oyinchi: 0.12,
  chempion: 0.03,
  talaba: 0.12,
  savdogar: 0.08,
  sinovchi: 0.1,
  konservator: 0.06,
};

/** Trait-namuna olish tartibi — Traits interfeysi tartibida, o'zgartirilmaydi. */
export const TRAIT_KEYS: readonly (keyof Traits)[] = [
  "income", "age", "rideNeed", "priceSensitivity", "loyalty", "patience",
  "socialInfluence", "riskTolerance", "rewardSensitivity", "familiarity1415",
  "inviteProclivity", "quitAfterLoss", "returnAfterWin", "trust", "techAffinity", "cashNeed",
] as const;

/** Shahar-o'rtachasi (oddiy arxetip aynan shu; boshqalar ustidan yozadi). */
const BASE_PRIORS: Record<keyof Traits, TraitPrior> = {
  income: { mean: 0.4, std: 0.15 },
  age: { mean: 0.45, std: 0.2 },
  rideNeed: { mean: 0.35, std: 0.15 },
  priceSensitivity: { mean: 0.6, std: 0.15 }, // Koson — narxga sezgir bozor
  loyalty: { mean: 0.5, std: 0.15 },
  patience: { mean: 0.5, std: 0.15 },
  socialInfluence: { mean: 0.4, std: 0.15 },
  riskTolerance: { mean: 0.4, std: 0.15 },
  rewardSensitivity: { mean: 0.5, std: 0.15 },
  familiarity1415: { mean: 0.7, std: 0.15 }, // 1415 dominant (2000 safar/kun)
  inviteProclivity: { mean: 0.35, std: 0.15 },
  quitAfterLoss: { mean: 0.5, std: 0.15 },
  returnAfterWin: { mean: 0.55, std: 0.15 },
  trust: { mean: 0.45, std: 0.15 },
  techAffinity: { mean: 0.45, std: 0.2 },
  cashNeed: { mean: 0.5, std: 0.15 },
};

/** Arxetip-markazlar: faqat farq qiladigan traitlar (qolgani BASE_PRIORS). */
const ARCHETYPE_OVERRIDES: Record<ArchetypeKey, Partial<Record<keyof Traits, TraitPrior>>> = {
  // O'rtacha shahar-aholi — hech qanday og'ish yo'q.
  oddiy: {},
  // Har kuni ishga/bozorga qatnaydi (~5 safar/hafta), eski dispetcherga o'rgangan.
  qatnovchi: {
    rideNeed: { mean: 0.8, std: 0.1 },
    familiarity1415: { mean: 0.75, std: 0.1 },
    loyalty: { mean: 0.55, std: 0.12 },
    priceSensitivity: { mean: 0.65, std: 0.12 },
  },
  // O'yin/sovrin-magniti: yutuq-sezgir, tavakkalchi, yutqazsa ham qaytadi.
  oyinchi: {
    rewardSensitivity: { mean: 0.85, std: 0.1 },
    riskTolerance: { mean: 0.75, std: 0.12 },
    returnAfterWin: { mean: 0.75, std: 0.1 },
    quitAfterLoss: { mean: 0.35, std: 0.12 },
    techAffinity: { mean: 0.6, std: 0.15 },
    rideNeed: { mean: 0.3, std: 0.12 },
    inviteProclivity: { mean: 0.45, std: 0.15 },
  },
  // Super-user (~7 safar/hafta): sodiq, atrofga kuchli ta'sir, faol taklifchi.
  chempion: {
    rideNeed: { mean: 0.95, std: 0.05 },
    loyalty: { mean: 0.75, std: 0.1 },
    socialInfluence: { mean: 0.75, std: 0.12 },
    inviteProclivity: { mean: 0.7, std: 0.12 },
    rewardSensitivity: { mean: 0.65, std: 0.12 },
    trust: { mean: 0.6, std: 0.12 },
  },
  // Yosh, kam daromad, narxga o'ta sezgir, ilova-usta, bonusga qiziq.
  talaba: {
    age: { mean: 0.1, std: 0.05 },
    income: { mean: 0.2, std: 0.1 },
    priceSensitivity: { mean: 0.85, std: 0.08 },
    techAffinity: { mean: 0.85, std: 0.1 },
    rewardSensitivity: { mean: 0.7, std: 0.12 },
    socialInfluence: { mean: 0.55, std: 0.15 },
    inviteProclivity: { mean: 0.5, std: 0.15 },
    familiarity1415: { mean: 0.45, std: 0.15 },
    rideNeed: { mean: 0.4, std: 0.12 },
  },
  // Bozor-savdogar: pulli, tez-tez qatnaydi, naqdga muhtoj, keng tanish-bilish.
  savdogar: {
    income: { mean: 0.7, std: 0.12 },
    rideNeed: { mean: 0.6, std: 0.12 },
    cashNeed: { mean: 0.75, std: 0.1 },
    socialInfluence: { mean: 0.65, std: 0.12 },
    inviteProclivity: { mean: 0.55, std: 0.12 },
    familiarity1415: { mean: 0.75, std: 0.12 },
    age: { mean: 0.55, std: 0.15 },
  },
  // Erta-sinovchi: hamma yangilikni ochadi, lekin sabri JUDA past — bitta confusion = ketdi.
  sinovchi: {
    patience: { mean: 0.12, std: 0.06 },
    techAffinity: { mean: 0.8, std: 0.1 },
    riskTolerance: { mean: 0.7, std: 0.12 },
    trust: { mean: 0.6, std: 0.12 },
    loyalty: { mean: 0.25, std: 0.1 },
    quitAfterLoss: { mean: 0.7, std: 0.1 },
    rewardSensitivity: { mean: 0.65, std: 0.12 },
    familiarity1415: { mean: 0.5, std: 0.15 },
  },
  // 1415-sodiq keksa-avlod: yangi xizmatga ishonmaydi, telefon-ilova yot.
  konservator: {
    familiarity1415: { mean: 0.92, std: 0.05 },
    trust: { mean: 0.2, std: 0.1 },
    techAffinity: { mean: 0.2, std: 0.1 },
    age: { mean: 0.75, std: 0.12 },
    patience: { mean: 0.75, std: 0.1 },
    loyalty: { mean: 0.8, std: 0.1 },
    riskTolerance: { mean: 0.15, std: 0.08 },
    rewardSensitivity: { mean: 0.25, std: 0.1 },
  },
};

/** Ulush-jadval bo'yicha arxetip tanlash (kumulyativ, ARCHETYPE_ORDER tartibida). */
export function sampleArchetype(rng: Rng): ArchetypeKey {
  const r = rng();
  let acc = 0;
  for (const key of ARCHETYPE_ORDER) {
    acc += ARCHETYPE_SHARES[key];
    if (r < acc) return key;
  }
  return ARCHETYPE_ORDER[ARCHETYPE_ORDER.length - 1]!;
}

/** Arxetip-priorlardan to'liq Traits namunasi (TRAIT_KEYS tartibida — rng-oqim qat'iy). */
export function sampleTraits(rng: Rng, archetype: ArchetypeKey): Traits {
  const overrides = ARCHETYPE_OVERRIDES[archetype];
  const out = {} as Traits;
  for (const key of TRAIT_KEYS) {
    const prior = overrides[key] ?? BASE_PRIORS[key];
    out[key] = rngTrait(rng, prior.mean, prior.std);
  }
  return out;
}
