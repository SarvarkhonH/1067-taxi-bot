// 🏙 RAQAMLI EGIZAK — izolyatsiya-qo'riqchi (`_testDb.ts` naqshining sim-varianti).
//
// Sim minglab soxta a'zo/safar/chipta YOZADI — bu jonli bazaga HECH QACHON tushmasligi kerak
// (tiraj-ro'yxatlari, statistika, sweep-poyga — CLAUDE.md dagi hujjatlashgan saboqlar).
// Shuning uchun bu fayl sim jarayonining ENG BIRINCHI importi bo'ladi (../env va db.ts dan
// OLDIN), SIM_DATABASE_URL ni talab qiladi va Prisma clientni FAQAT shunga yo'naltiradi.
//
// Qat'iy qoidalar (har biri ega-qarori/saboqdan):
//  1. SIM_DATABASE_URL yo'q → O'LIM. Jim fallback yo'q — fallback aynan poyga-xavfi.
//  2. URL localhost'da bo'lishi va baza nomi `birjoy_sim` bilan boshlanishi SHART —
//     tasodifan app-DB (birjoy) yoki boshqa bazaga ulanish strukturaviy imkonsiz.
//  3. Neon-host ko'rinsa → O'LIM (Neon muzlatilgan, unga o'qish ham yozish ham taqiq).
import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, "../../../..", ".env") });
// sim-uchun alohida env-fayl ham o'qiladi (asosiy .env ni iflos qilmaslik uchun ixtiyoriy)
config({ path: resolve(here, ".env.sim") });

const url = process.env.SIM_DATABASE_URL;
if (!url) {
  throw new Error(
    "[simDb] SIM_DATABASE_URL kerak (alohida lokal Docker-Postgres). App-DB'da yugurish RAD ETILADI — " +
      "jonli tiraj/statistika soxta a'zolar bilan ifloslanadi va sweep-poyga xavfi bor. " +
      "Misol: postgresql://sim:sim@localhost:5434/birjoy_sim_t1",
  );
}
if (/neon\.tech|neon\.build/i.test(url)) {
  throw new Error("[simDb] Neon host taqiqlangan (muzlatilgan nusxa, 2026-07-27 ega qarori).");
}
const m = url.match(/@(localhost|127\.0\.0\.1):(\d+)\/([A-Za-z0-9_]+)/);
if (!m) {
  throw new Error(`[simDb] SIM_DATABASE_URL localhost bo'lishi shart (sim faqat lokal yuguradi).`);
}
if (!m[3]!.startsWith("birjoy_sim")) {
  throw new Error(
    `[simDb] Baza nomi 'birjoy_sim' bilan boshlanishi shart (hozir: '${m[3]}') — app-DB himoyasi.`,
  );
}

process.env.DATABASE_URL = url;
process.env.DIRECT_URL = url;
// Booking jonli-integratsiyalar sim ichida hech qachon yoqilmasin
process.env.BOOKING_LIVE = "false";

/** Sim qaysi bazada yurayotgani — jurnal/hisobot uchun. */
export const SIM_DB_NAME = m[3]!;
export const SIM_DB_PORT = Number(m[2]);
