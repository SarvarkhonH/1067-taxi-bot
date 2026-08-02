// 📅 BirJoy O'yinlar Mavsumi — mavsum konfiguratsiyasi (ega talabi 2026-08-02: "har mavsum
// vaxtlarini ham qo'yish kerak"). Sanalar ENDI koddagi konstanta emas — admin panelda kiritiladi.
//
// Naqsh: `sponsorService.ts` (bitta AppState qatori) + `bonusConfig.ts` (30s kesh). Yangi Prisma
// model YO'Q (ARCHITECTURE.md invarianti).
//
// Nega alohida fayl (oyinService.ts ichida emas):
//  1. Bog'liqlik bir tomonlama — bu fayl faqat `../db` ni biladi, oyinService undan o'qiydi.
//     Ichida bo'lsa, 60s ball-keshi va 30s config-keshi chalkashib ketishi oson edi.
//  2. `index.ts` (15-daq tick) va admin route'lari butun ball-mexanikasini import qilmasdan
//     mavsumni o'qiy oladi.
import type { OyinSeasonInput, OyinSeasonView } from "@t1067/shared";
import { prisma } from "../db";
import { weekKey } from "./missionService";

// ⚠️ `oyin:season` EMAS — u `oyin:seasonclosed` ning PREFIKSI bo'lardi va kelajakdagi
// `startsWith("oyin:season")` skani ikkalasini birga tortib ketardi. Ikkalasi endi qardosh.
const KEY = "oyin:seasoncfg";

interface SeasonCore {
  seasonNo: number;
  startIso: string | null;
  endIso: string | null;
  label: string | null;
}

const EMPTY_CORE: SeasonCore = { seasonNo: 1, startIso: null, endIso: null, label: null };

// UTC+5 (Toshkent) kun-kaliti. oyinService.ts dagi bilan bir xil — ATAYLAB nusxa: undan import
// qilinsa doiraviy bog'liqlik bo'lardi (u bu yerdan `getSeason` oladi). Bir xil sabab bilan
// oyinService ham missionService.dayKey ni nusxalagan (o'sha fayldagi izohga qarang).
function tashkentDayKey(d: Date): string {
  return new Date(d.getTime() + 5 * 3600_000).toISOString().slice(0, 10);
}

let cache: { at: number; core: SeasonCore } | null = null;

export function invalidateSeasonCache(): void {
  cache = null;
}

function parseCore(raw: string | undefined): SeasonCore {
  if (!raw) return EMPTY_CORE;
  try {
    const v = JSON.parse(raw) as Partial<SeasonCore>;
    return {
      seasonNo: typeof v.seasonNo === "number" && v.seasonNo >= 1 ? Math.floor(v.seasonNo) : 1,
      startIso: typeof v.startIso === "string" && v.startIso ? v.startIso : null,
      endIso: typeof v.endIso === "string" && v.endIso ? v.endIso : null,
      label: typeof v.label === "string" && v.label.trim() ? v.label.trim() : null,
    };
  } catch {
    return EMPTY_CORE;
  }
}

function toView(core: SeasonCore): OyinSeasonView {
  const startMs = core.startIso ? Date.parse(core.startIso) : NaN;
  const endMs = core.endIso ? Date.parse(core.endIso) : NaN;
  const configured = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs;
  const base = {
    seasonNo: core.seasonNo,
    seasonId: `s${core.seasonNo}`,
    label: core.label,
  };
  if (!configured) {
    return {
      ...base, configured: false, startIso: null, endIso: null, startMs: null, endMs: null,
      startDayKey: null, endDayKey: null, startWeekKey: null, endWeekKey: null, phase: "unset",
    };
  }
  const start = new Date(startMs);
  const end = new Date(endMs);
  const now = Date.now();
  // `phase` ATAYLAB keshlanmaydi — har chaqiruvda qayta hisoblanadi (30s eskirgan faza
  // "nega mavsum 25 soniya erta yopildi?" savolini keltirib chiqaradi).
  const phase = now < startMs ? "upcoming" : now > endMs ? "ended" : "active";
  return {
    ...base,
    configured: true,
    startIso: core.startIso,
    endIso: core.endIso,
    startMs,
    endMs,
    startDayKey: tashkentDayKey(start),
    endDayKey: tashkentDayKey(end),
    startWeekKey: weekKey(start),
    endWeekKey: weekKey(end),
    phase,
  };
}

/** Joriy mavsum (30s kesh). Sozlanmagan bo'lsa `configured:false`, `phase:"unset"`. */
export async function getSeason(): Promise<OyinSeasonView> {
  if (!cache || Date.now() - cache.at >= 30_000) {
    const row = await prisma.appState.findUnique({ where: { key: KEY } }).catch(() => null);
    cache = { at: Date.now(), core: parseCore(row?.value) };
  }
  return toView(cache.core);
}

export type SeasonValidation = { ok: true; startMs: number; endMs: number } | { ok: false; error: string };

/** ⚠️ Bu validatsiya — PUL QO'RIQCHISI, ko'rinish uchun emas. `seasonClose()` REAL tanga beradi va
 *  15-daqiqalik tickdan yuriladi: ega tugash sanasini o'tmishga qo'yib yuborsa, keyingi tick
 *  hammaning ballini yarmini tangaga aylantirib to'lab yuboradi. Shu sababli o'tmishdagi tugash
 *  sanasi YOZUV chegarasida rad etiladi. */
export function validateSeasonInput(i: OyinSeasonInput): SeasonValidation {
  const startMs = Date.parse(i.startIso);
  const endMs = Date.parse(i.endIso);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return { ok: false, error: "Sana noto'g'ri" };
  if (endMs <= startMs) return { ok: false, error: "Tugash sanasi boshlanishdan keyin bo'lishi kerak" };
  if (endMs - startMs < 86400_000) return { ok: false, error: "Mavsum kamida 1 kun bo'lishi kerak" };
  if (endMs - startMs > 365 * 86400_000) return { ok: false, error: "Mavsum 1 yildan uzun bo'lolmaydi" };
  if (endMs <= Date.now()) return { ok: false, error: "O'tgan sanaga mavsum belgilab bo'lmaydi" };
  return { ok: true, startMs, endMs };
}

/** Admin: mavsum sanalarini yozish. `seasonNo` berilsa — yangi mavsum (toza boshlash tugmasi
 *  uzatadi); berilmasa joriy raqam saqlanadi (shunchaki sanani tuzatish). */
export async function setSeason(input: OyinSeasonInput & { seasonNo?: number }): Promise<OyinSeasonView> {
  const v = validateSeasonInput(input);
  if (!v.ok) throw new Error(v.error);
  const cur = await getSeason();
  const core: SeasonCore = {
    seasonNo: input.seasonNo ?? cur.seasonNo,
    startIso: input.startIso,
    endIso: input.endIso,
    label: input.label?.trim().slice(0, 40) || null,
  };
  const value = JSON.stringify(core);
  await prisma.appState.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
  invalidateSeasonCache();
  return getSeason();
}
