// 🕰 SimClock — vaqt-siqish shimi. Servis-importlardan OLDIN o'rnatiladi (run.ts tartibi QATTIQ).
//
// Butun jonli kod `Date.now()` / `new Date()` ishlatadi (tekshirilgan; performance.now yo'q) —
// shuning uchun global Date'ni almashtirish TTL-keshlar, ball-oynalar (730 kun), decay (183 kun),
// sezon-fazalar — hammasini sim-vaqtga ergashtiradi. Sub-faza ichida vaqt soatma-soat suriladi,
// tik orasida kunga sakraydi — 30-60s keshlar har tik boshida o'z-o'zidan eskiradi (jonli
// xatti-harakatga mos).
//
// ⚠️ QAMRAMAYDI: Prisma `@default(now())` ustunlari (RideReward.createdAt va h.k.) POSTGRES
// tomonida to'ladi — ularni run.ts'dagi timestamp-fixup pass tuzatadi (olam O'TMISHDA yashaydi,
// real-hozirdan keyingi tamg'a = sentinel). Bu fayl faqat JS-tomonni boshqaradi.

const RealDate = Date;
let simNowMs = 0;
let installed = false;

class SimDate extends RealDate {
  constructor(...args: unknown[]) {
    if (args.length === 0) {
      super(simNowMs);
    } else {
      // @ts-expect-error — Date'ning har qanday konstruktor-formasi o'tkaziladi
      super(...args);
    }
  }
  static override now(): number {
    return simNowMs;
  }
}
// Statik yordamchilar o'zgarishsiz qoladi
SimDate.parse = RealDate.parse;
SimDate.UTC = RealDate.UTC;

/** Shimni o'rnatish. run.ts servislarni DINAMIK import qilishidan OLDIN chaqiriladi. */
export function installSimClock(t0Ms: number): void {
  simNowMs = t0Ms;
  (globalThis as { Date: DateConstructor }).Date = SimDate as unknown as DateConstructor;
  installed = true;
}

/** Sim-vaqtni surish (tik/sub-faza). Faqat OLDINGA — orqaga surish kesh-mantiqni buzadi. */
export function setSimNow(ms: number): void {
  if (ms < simNowMs) throw new Error(`[simClock] vaqt orqaga surilmaydi (${ms} < ${simNowMs})`);
  simNowMs = ms;
}

export function simNow(): number {
  return simNowMs;
}

/** Haqiqiy devor-soat (jurnal, runtime-o'lchov uchun) — shim ta'sir qilmaydi. */
export function realNow(): number {
  return RealDate.now();
}

export function assertClockInstalled(): void {
  if (!installed) throw new Error("[simClock] installSimClock chaqirilmagan — import-tartib buzilgan");
}

export const DAY_MS = 24 * 60 * 60 * 1000;
export const HOUR_MS = 60 * 60 * 1000;
