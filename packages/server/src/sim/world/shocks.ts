// 🦢 T6 — Black-Swan jadval-moduli. Sof modul: DB YO'Q, rng YO'Q (jadval deterministik),
// vaqt faqat berilgan `day` parametridan. Master-reja L9/T6: "agressiv reklama + sovrin-ta'minot
// muammosi + referral-portlash + downtime — qaysi kombinatsiyada sinadi?"
//
// Jadval konfigdan o'qiladi: SimConfig'da `shocks` maydoni YO'Q (types.ts'ga tegilmaydi), shuning
// uchun lokal kengaytma-interfeys orqali ixtiyoriy maydon sifatida o'qiladi — arm-konfiguratsiya
// `{ ...BASELINE_CONFIG, shocks: [...] } satisfies SimConfigWithShocks` deb beradi. Jadval bo'lmasa
// har kun NEYTRAL effekt qaytadi (mavjud runlarga nol-ta'sir).

import type { SimConfig, WorldState } from "../types";

// ── Lokal kontrakt (types.ts'ga tegilmaydi) ───────────────────────────────────
export type ShockKind =
  | "demand_drop" // shahar bo'ylab talab-pasayish (masalan −30%)
  | "prize_supply_issue" // sovrin-yetkazib-berish muammosi: ega restock qila olmaydi
  | "downtime" // BirJoy texnik uzilish: bugungi safarlarning bir qismi yo'qoladi
  | "referral_burst"; // viral referral-portlash: taklif/awareness-oqim ko'payadi

export interface ShockEvent {
  /** Boshlanish sim-kuni (0-index, world.day bilan bir shkala). */
  day: number;
  kind: ShockKind;
  /** Kuch (%). Ma'nosi kind'ga qarab: demand_drop=pasayish%, downtime=yo'qolgan safar%,
   *  referral_burst=oqim-o'sish%. prize_supply_issue uchun ishlatilmaydi. Default: DEFAULTS. */
  magnitudePct?: number;
  /** Davomiylik (kun). Default: DEFAULTS (downtime odatda 1 kun). */
  durationDays?: number;
}

/** Konfig-kengaytma: baseline SimConfig + ixtiyoriy shok-jadval. */
export interface SimConfigWithShocks extends SimConfig {
  shocks?: ShockEvent[];
}

/** Berilgan kunga AGREGAT effektlar (bir kunda bir necha shok ustma-ust tushishi mumkin). */
export interface ShockEffects {
  /** Umumiy talab-ko'paytirgich (1 = normal; 0.7 = −30%). Bir necha drop MULTIPLIKATIV. */
  demandMultiplier: number;
  /** true = ega bugun sovrin-restock qila olmaydi (ownerAgent shu bayroqni hurmat qiladi). */
  ownerRestockPaused: boolean;
  /** Bugungi BirJoy-safarlarning yo'qoladigan ulushi 0..1 (0.5 = yarmi bekor). Bir nechtasidan MAX. */
  birjoyDowntimeLossPct: number;
  /** Taklif/awareness-oqim ko'paytirgichi (1 = normal; 2.5 = portlash). MULTIPLIKATIV. */
  referralBoost: number;
}

const DEFAULTS: Record<ShockKind, { magnitudePct: number; durationDays: number }> = {
  demand_drop: { magnitudePct: 30, durationDays: 14 },
  prize_supply_issue: { magnitudePct: 0, durationDays: 14 },
  downtime: { magnitudePct: 50, durationDays: 1 },
  referral_burst: { magnitudePct: 150, durationDays: 7 },
};

export const NEUTRAL_SHOCK_EFFECTS: ShockEffects = Object.freeze({
  demandMultiplier: 1,
  ownerRestockPaused: false,
  birjoyDowntimeLossPct: 0,
  referralBoost: 1,
});

/** Shok shu kunda faolmi: [day, day+duration) yarim-ochiq oraliq. */
function isActive(ev: ShockEvent, day: number): boolean {
  const dur = ev.durationDays ?? DEFAULTS[ev.kind].durationDays;
  return day >= ev.day && day < ev.day + Math.max(1, dur);
}

/**
 * HAR KUN BOSHIDA chaqiriladi — shu kunga faol shoklarni jadvaldan yig'ib, agregat effekt
 * qaytaradi. Jadval yo'q/bo'sh bo'lsa NEYTRAL nusxa qaytadi. Sof-deterministik: rng yo'q.
 */
export function applyShocks(world: WorldState, day: number): ShockEffects {
  const schedule = (world.cfg as SimConfigWithShocks).shocks ?? [];
  if (schedule.length === 0) return { ...NEUTRAL_SHOCK_EFFECTS };

  const fx: ShockEffects = { ...NEUTRAL_SHOCK_EFFECTS };
  for (const ev of schedule) {
    if (!isActive(ev, day)) continue;
    const mag = ev.magnitudePct ?? DEFAULTS[ev.kind].magnitudePct;
    switch (ev.kind) {
      case "demand_drop":
        fx.demandMultiplier *= Math.max(0, 1 - mag / 100);
        break;
      case "prize_supply_issue":
        fx.ownerRestockPaused = true;
        break;
      case "downtime":
        fx.birjoyDowntimeLossPct = Math.min(1, Math.max(fx.birjoyDowntimeLossPct, mag / 100));
        break;
      case "referral_burst":
        fx.referralBoost *= 1 + Math.max(0, mag) / 100;
        break;
    }
  }
  return fx;
}
