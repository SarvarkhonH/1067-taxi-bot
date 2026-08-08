// 🧪 L9 — EKSPERIMENT-MATRITSASI: 8 mexanika-arm (pre-registered).
// Har arm SimConfig USTIGA overlay bo'lib qo'llanadi (applyArm) — baseline o'zgarmaydi.
// Master-reja (eager-crafting-dusk.md §L9): "Har armga YUGURISHDAN OLDIN muvaffaqiyat-mezoni
// config'da" — shuning uchun har armda preRegistered { savol, muvaffaqiyatMezoni } MAJBURIY.
//
// MANBA-TEKSHIRUVLAR (2026-08-08):
//  · flag-nomlar services/featureFlags.ts FEATURES ro'yxatidan grep bilan tasdiqlangan
//    (oyin · welcomebonus · refstaged · recruit · drvstaged · drvrecruit · baraban · wheel · jamoa);
//    provision.seedWorldConfig baribir ff.FEATURES'ga qarshi QAYTA tekshiradi (ikki darvoza).
//  · knob-kalitlar @t1067/shared BONUS_ECON_KNOBS'dan — quyida modul-yuklanishda assert qilinadi
//    (noma'lum kalit yoki min/max-dan tashqari qiymat = darhol throw, sim boshlanmasdan).
//  · Ball-ta'minot rideBase=0 bo'lganda ham OQADI: cashbackService.rollRideCashback RideReward
//    satrini amount'dan QAT'I NAZAR yozadi (services/cashbackService.ts:85), ball esa
//    RideReward-SANOG'idan hisoblanadi (oyinService computeBallMap) — shu fakt C-armni yashatadi.
//
// Bu modul SOF: services/ va ../db import QILMAYDI (@t1067/shared — sof konstantalar).
import { BONUS_ECON_KNOBS } from "@t1067/shared";
import type { BehaviorParams, SimConfig } from "../types";

// ── Lokal tiplar (types.ts'ga tegilmaydi — qoida №4) ──────────────────────────
export type ArmKey = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H";

/** provision.SMALL_CATALOG bilan bir xil shakl — provision keyin shu ro'yxatni o'qiydi (WIRING). */
export interface ArmCatalogPrize {
  icon: string;
  name: string;
  valueLabel: string;
  price: number; // chipta ball-narxi
  limit: number; // chipta-slotlar soni (tiraj sig'imi)
}

export interface ArmPreRegistered {
  savol: string;
  muvaffaqiyatMezoni: string;
}

export interface ArmDefinition {
  key: ArmKey;
  title: string;
  tarif: string;
  /** SimConfig.flags USTIGA yoziladi (faqat shu armga tegishli flaglar sanaladi). */
  flags: Readonly<Record<string, boolean>>;
  /** SimConfig.knobs USTIGA yoziladi (BONUS_ECON_KNOBS kalitlari). */
  knobs: Readonly<Record<string, number>>;
  /** Armning O'Z sovrin-katalogi. Bo'sh massiv = katalog BO'SH (chipta sotilmaydi). */
  catalogPreset: ReadonlyArray<ArmCatalogPrize>;
  /** Ixtiyoriy xulq-tuzatma. FARAZ-parametrlar (L3 qoidasi) izohda ANIQ belgilanadi. */
  behaviorOverlay?: Readonly<Partial<BehaviorParams>>;
  preRegistered: ArmPreRegistered;
}

// ── Umumiy overlay-bloklar ────────────────────────────────────────────────────
// Mijoz-mexanika flaglarining "hammasi o'chiq" holati. Har arm shu bazadan boshlaydi va faqat
// o'ziga kerakni yoqadi — arm o'zini TO'LIQ tasvirlaydi, baseline-drift ta'sir qilmaydi.
// (jamoa/gap/plus kabi 8-mexanika ro'yxatiga kirmagan flaglar ATAYLAB tegilmaydi — ular
// baseline'dan oqadi; eksperiment faqat sanalgan mexanikalarni ajratadi.)
const MECHANICS_OFF_FLAGS: Readonly<Record<string, boolean>> = {
  oyin: false, // ball→chipta→tiraj o'yini
  welcomebonus: false, // universal 1-safar bonusi
  refstaged: false, // bosqichli referral-to'lov
  recruit: false, // haydovchi-QR mijoz-recruit
  drvstaged: false, // bosqichli haydovchi-QR
  drvrecruit: false, // haydovchi→haydovchi
  baraban: false, // safar-oxiri spin (real tanga)
  wheel: false, // kunlik g'ildirak
};

// Tanga-emissiya knoblarining nol-holati (hammasining min=0 — clamp bilan mos).
// drvRides (min=1) kabi "hisoblagich"-knoblar ataylab yo'q — ular emissiya emas.
const EMISSION_ZERO_KNOBS: Readonly<Record<string, number>> = {
  rideBase: 0, // safar-cashback bazasi
  firstRide: 0,
  refStart: 0, refShare: 0, refRide: 0, referrer: 0,
  drvStart: 0, drvShare: 0, recruitFirst: 0, recruit3: 0,
  revshareFresh: 0, revshareVeteran: 0, drvMilestone: 0,
  mDailyCheckin: 0, mDailySpin: 0, mDailyRide: 0, mWeeklyRides: 0, mWeeklyInvite: 0,
  mDrvDaily5: 0, mDrvWeekly25: 0, mDrvWeekly40: 0,
};

// ── Katalog-presetlar (provision.SMALL_CATALOG uslubi) ────────────────────────
/** Bo'sh katalog: provision "[]" yozadi va HECH NARSA qo'shmaydi (A/B/C/G armlari). */
export const ARM_CATALOG_EMPTY: ReadonlyArray<ArmCatalogPrize> = [];

/** E/H: kichik, tez yutiladigan sovrinlar — P1 SMALL_CATALOG bilan AYNAN bir xil 5 qator
 *  (kalibrlangan baseline bilan taqqoslanuvchanlik uchun ataylab nusxa). */
export const ARM_CATALOG_SMALL: ReadonlyArray<ArmCatalogPrize> = [
  { icon: "🫖", name: "Elektr choynak", valueLabel: "150 000 so'm", price: 600, limit: 20 },
  { icon: "🍚", name: "Guruch 25kg", valueLabel: "250 000 so'm", price: 750, limit: 16 },
  { icon: "🧺", name: "Oziq-ovqat savati", valueLabel: "300 000 so'm", price: 850, limit: 12 },
  { icon: "🔥", name: "Gaz plita", valueLabel: "450 000 so'm", price: 1000, limit: 10 },
  { icon: "📱", name: "Smartfon", valueLabel: "600 000 so'm", price: 1200, limit: 8 },
];

/** D: lotereya — arzon chipta, KATTA sovrin, uzoq tiraj (ko'p slot). Present-bias sinovi. */
export const ARM_CATALOG_LOTTERY: ReadonlyArray<ArmCatalogPrize> = [
  { icon: "📺", name: "Televizor 43\"", valueLabel: "2 500 000 so'm", price: 300, limit: 300 },
  { icon: "📱", name: "Smartfon Pro", valueLabel: "3 500 000 so'm", price: 350, limit: 350 },
  { icon: "🧊", name: "Muzlatgich", valueLabel: "4 500 000 so'm", price: 400, limit: 400 },
];

/** F: 1 katta "orzu"-sovrin (3-6 mln oralig'i — master-reja jadvali) + kichiklar.
 *  2500 ball ≈ 71 safar (rideBall≈35) — aspiratsion masofa ataylab uzoq. */
export const ARM_CATALOG_ASPIRATION: ReadonlyArray<ArmCatalogPrize> = [
  { icon: "🌟", name: "iPhone — orzu-sovrin", valueLabel: "6 000 000 so'm", price: 2500, limit: 60 },
  ...ARM_CATALOG_SMALL,
];

// ── 8 arm ─────────────────────────────────────────────────────────────────────
export const ARMS: Readonly<Record<ArmKey, ArmDefinition>> = {
  A: {
    key: "A",
    title: "Hammasi-OFF (sof taksi)",
    tarif:
      "Nazorat-arm: hech qanday bonus-mexanika yo'q — cashback 0, o'yin o'chiq, referral-to'lovlar 0, " +
      "katalog bo'sh. Har boshqa armning deltasi SHU armga nisbatan o'lchanadi (L6 VETO-bazasi).",
    flags: { ...MECHANICS_OFF_FLAGS },
    knobs: { ...EMISSION_ZERO_KNOBS },
    catalogPreset: ARM_CATALOG_EMPTY,
    preRegistered: {
      savol: "Bonus-mexanikasiz sof taksi-servis o'z-o'zidan qancha o'sadi (og'zaki tarqalish + sifat)?",
      muvaffaqiyatMezoni:
        "Nazorat-arm o'zi 'yutmaydi': sanity = monthlyRides > 0 VA bonusSpend ≈ 0 VA solvencyEnd ∈ " +
        "{Healthy, Growing}. Barcha B..H armlar deltasi shu armning monthlyRides'iga nisbatan hisoblanadi.",
    },
  },

  B: {
    key: "B",
    title: "Faqat-cashback",
    tarif:
      "Yolg'iz deterministik safar-cashback (rideBase=100, ×1/×2/×3 roll) — o'yin, referral, katalog yo'q.",
    flags: { ...MECHANICS_OFF_FLAGS },
    knobs: { ...EMISSION_ZERO_KNOBS, rideBase: 100 },
    catalogPreset: ARM_CATALOG_EMPTY,
    preRegistered: {
      savol: "Safar-cashback yolg'iz o'zi qancha QO'SHIMCHA safar yaratadi va u o'zini oqlaydimi?",
      muvaffaqiyatMezoni:
        "monthlyRides(B) ≥ 1.10 × monthlyRides(A) VA bonusSpend / max(1, monthlyRides(B) − monthlyRides(A)) " +
        "≤ 2000 so'm (OYIN_SOM_PER_RIDE komissiya) — har qo'shimcha safar komissiyadan qimmatga tushmasin.",
    },
  },

  C: {
    key: "C",
    title: "Faqat-ball (katalog bo'sh)",
    tarif:
      "O'yin yoqiq, lekin katalog BO'SH — ball yig'iladi, sarflab bo'lmaydi. Tanga-cashback 0 " +
      "(ball baribir RideReward-sanoqdan oqadi — rollRideCashback satrni amount=0 bilan ham yozadi). " +
      "Sof 'progress-illyuziya' sinovi.",
    flags: { ...MECHANICS_OFF_FLAGS, oyin: true },
    knobs: { ...EMISSION_ZERO_KNOBS },
    catalogPreset: ARM_CATALOG_EMPTY,
    preRegistered: {
      savol: "Sarflab bo'lmaydigan ball o'z-o'zidan safar-motivatsiya beradimi (progress-illyuziya)?",
      muvaffaqiyatMezoni:
        "monthlyRides(C) ≥ 1.05 × monthlyRides(A) bo'lsa ball-hisobning o'zi qiymatli; " +
        "aks holda ballning kuchi faqat katalog bilan (D/E/F talqiniga kirish sifatida yoziladi).",
    },
  },

  D: {
    key: "D",
    title: "Lotereya",
    tarif:
      "Katta-sovrinli lotereya: arzon chipta (300-400 ball), 2.5-4.5 mln sovrinlar, uzoq tiraj " +
      "(300-400 slot). Boshqa emissiya 0 — prospect-nazariya w(p) va present-bias to'g'ridan-to'g'ri sinaladi.",
    flags: { ...MECHANICS_OFF_FLAGS, oyin: true },
    knobs: { ...EMISSION_ZERO_KNOBS },
    catalogPreset: ARM_CATALOG_LOTTERY,
    preRegistered: {
      savol: "Uzoq-tirajli katta-sovrin lotereyasi qatnashuvni ochadimi yoki present-bias uni o'ldiradimi?",
      muvaffaqiyatMezoni:
        "ticketsTotal(D) > 0 VA monthlyRides(D) ≥ 1.15 × monthlyRides(A) VA " +
        "solvencyEnd ∉ {Critical, Insolvent} (katta sovrin-majburiyat ownerBooks'da ko'tarilgan holda).",
    },
  },

  E: {
    key: "E",
    title: "Kichik-sovrinlar",
    tarif:
      "Tez-tez, kichik yutuqlar (150-600 ming, 8-20 slot) — variable-ratio/Skinner odati sinovi. " +
      "Boshqa emissiya 0.",
    flags: { ...MECHANICS_OFF_FLAGS, oyin: true },
    knobs: { ...EMISSION_ZERO_KNOBS },
    catalogPreset: ARM_CATALOG_SMALL,
    preRegistered: {
      savol: "Tez-tez kichik yutuqlar barqaror safar-odat quradimi (chastota > kattalik gipotezasi)?",
      muvaffaqiyatMezoni:
        "monthlyRides(E) ≥ 1.15 × monthlyRides(A) VA share10Pct(E) > share10Pct(A) VA " +
        "prizeSpend ≤ 0.25 × revenue (sovrin-xarajat nazorati).",
    },
  },

  F: {
    key: "F",
    title: "Aspiratsiya + kichik",
    tarif:
      "E-arm katalogi USTIGA 1 katta 'orzu'-sovrin (6 mln, 2500 ball ≈ 71 safar) — goal-gradient/" +
      "aspiratsion tortishish kichik-yutuq odatiga qo'shimcha beradimi.",
    flags: { ...MECHANICS_OFF_FLAGS, oyin: true },
    knobs: { ...EMISSION_ZERO_KNOBS },
    catalogPreset: ARM_CATALOG_ASPIRATION,
    preRegistered: {
      savol: "1 katta orzu-sovrin kichiklar ustiga qo'shilsa QO'SHIMCHA o'sish beradimi (E'ga nisbatan)?",
      muvaffaqiyatMezoni:
        "monthlyRides(F) ≥ 1.05 × monthlyRides(E) VA ticketsTotal(F) > ticketsTotal(E) VA " +
        "solvencyEnd ∉ {Critical, Insolvent} (6 mln majburiyatga qaramay).",
    },
  },

  G: {
    key: "G",
    title: "Referral-og'ir",
    tarif:
      "Bosqichli referral to'liq quvvatda: refstaged ON, do'st JOIN'da firstRide=5000, taklif qilganga " +
      "refStart=1000 / refShare=1500 / refRide=3000 (defaultdan 2-3×). Boshqa mexanika o'chiq — " +
      "L4 viral-threshold shu armda qidiriladi.",
    flags: { ...MECHANICS_OFF_FLAGS, refstaged: true },
    knobs: {
      ...EMISSION_ZERO_KNOBS,
      firstRide: 5000,
      refStart: 1000,
      refShare: 1500,
      refRide: 3000,
    },
    // ⚠️ FARAZ-parametr (L3 qoidasi: manba=faraz, hisobotda ALOHIDA belgilanadi): run.ts
    // inviteFlow'da mukofot-hajmi pInviteBase'ga endogen ta'sir qilmaydi (run.ts:113 — faqat
    // trait-koeff). Oshirilgan to'lovning xulq-ta'siri shu overlay bilan ifodalanadi:
    // baseline 0.05 → 0.09 (≈×1.8, referral-incentive elastikligi adabiyot-prior atrofida).
    // run.ts reward-elastiklikni endogen modellagach bu overlay OLIB TASHLANADI.
    behaviorOverlay: { pInviteBase: 0.09 },
    catalogPreset: ARM_CATALOG_EMPTY,
    preRegistered: {
      savol: "Og'ir bosqichli referral viral-halqani yoqadimi — L4 threshold-rejimga o'tish bormi?",
      muvaffaqiyatMezoni:
        "monthlyRides(G) ≥ 1.20 × monthlyRides(A) VA metrics.jsonl funnel.referrals yig'indisi ≥ 2 × H-arm " +
        "VA solvencyEnd ∉ {Critical, Insolvent} VA fraud.blocked / max(1, fraud.attempts) yig'indisi " +
        "hisobotda alohida (farm-hujum ulushi sanaladi, mezonni buzmaydi).",
    },
  },

  H: {
    key: "H",
    title: "Joriy-aralash (baseline)",
    tarif:
      "Jonli 2026-08-08 holatining aynan o'zi (BASELINE_CONFIG bilan bir xil): cashback default, " +
      "o'yin+kichik katalog yoqiq, referral-to'lovlar OFF. Kalibratsiya-langar arm.",
    flags: { oyin: true, jamoa: true, welcomebonus: false, refstaged: false, recruit: false },
    knobs: {}, // jonli BONUS_ECON_KNOBS defaultlari o'zgarishsiz (rideBase=100 va h.k.)
    catalogPreset: ARM_CATALOG_SMALL,
    preRegistered: {
      savol: "Joriy jonli aralash kalibrlangan haqiqatni qayta chiqaradimi (langar-tekshiruv)?",
      muvaffaqiyatMezoni:
        "N1 (642 safar/oy ±20%) va N2 (127 rider ±20%) tolerans ichida — bu arm baseline bilan " +
        "AYNAN bir xil bo'lgani uchun kalibratsiya o'tgan bo'lsa avtomatik o'tadi; boshqa armlar " +
        "deltasi A'ga QO'SHIMCHA shu armga nisbatan ham hisoblanadi.",
    },
  },
};

export const ARM_ORDER: ReadonlyArray<ArmKey> = ["A", "B", "C", "D", "E", "F", "G", "H"];

export function isArmKey(s: string): s is ArmKey {
  return (ARM_ORDER as readonly string[]).includes(s);
}

// ── Overlay-qo'llash ──────────────────────────────────────────────────────────
/**
 * Armni SimConfig USTIGA qo'llaydi — YANGI konfiguratsiya qaytaradi (kirish mutatsiya qilinmaydi).
 * `name` ga arm-suffiks qo'shiladi (run/RUN_NAME va sim-out papkalari armlar bo'yicha ajralsin).
 * `catalog` HAR DOIM "small"ga o'rnatiladi: "live" seed-katalog eksperimentga aralashmasin —
 * haqiqiy katalog-QATORLARINI provision arm-presetdan yozadi (WIRING bo'limiga qarang).
 */
export function applyArm(cfg: SimConfig, armKey: ArmKey): SimConfig {
  const arm = ARMS[armKey];
  return {
    ...cfg,
    name: `${cfg.name}-arm${arm.key}`,
    flags: { ...cfg.flags, ...arm.flags },
    knobs: { ...cfg.knobs, ...arm.knobs },
    catalog: "small",
    behavior: { ...cfg.behavior, ...(arm.behaviorOverlay ?? {}) },
  };
}

/** Provision uchun: armning katalog-presetini qaytaradi (bo'sh massiv = katalog bo'sh qoladi). */
export function armCatalogOf(armKey: ArmKey): ReadonlyArray<ArmCatalogPrize> {
  return ARMS[armKey].catalogPreset;
}

// ── Modul-yuklanish assertlari (sim boshlanmasdan YIQILSIN) ───────────────────
// Knob-kalitlar va qiymat-oraliqlar BONUS_ECON_KNOBS'ga qarshi tekshiriladi. Flag-nomlar uchun
// lokal ro'yxat (FEATURES'dan grep-tasdiq, yuqoridagi sarlavha) — provision baribir ff.FEATURES
// bilan ikkinchi marta tekshiradi, bu yerdagi tekshiruv xatoni ERTAROQ ushlaydi.
const GREP_VERIFIED_FLAGS = new Set([
  "oyin", "jamoa", "welcomebonus", "refstaged", "recruit",
  "drvstaged", "drvrecruit", "baraban", "wheel",
]);

function assertArmsValid(): void {
  const knobByKey = new Map(BONUS_ECON_KNOBS.map((k) => [k.key, k]));
  for (const arm of Object.values(ARMS)) {
    for (const [key, val] of Object.entries(arm.knobs)) {
      const def = knobByKey.get(key);
      if (!def) throw new Error(`[arms] ${arm.key}: noma'lum bonus-knob "${key}" (BONUS_ECON_KNOBS'da yo'q)`);
      if (val < def.min || val > def.max) {
        throw new Error(`[arms] ${arm.key}: knob ${key}=${val} oraliqdan tashqari [${def.min}..${def.max}]`);
      }
    }
    for (const flag of Object.keys(arm.flags)) {
      if (!GREP_VERIFIED_FLAGS.has(flag)) {
        throw new Error(`[arms] ${arm.key}: flag "${flag}" grep-tasdiqlangan ro'yxatda yo'q — featureFlags.FEATURES bilan solishtir`);
      }
    }
    for (const p of arm.catalogPreset) {
      if (!(p.price > 0) || !(p.limit > 0)) {
        throw new Error(`[arms] ${arm.key}: katalog "${p.name}" price/limit musbat bo'lishi shart`);
      }
    }
  }
}
assertArmsValid();
