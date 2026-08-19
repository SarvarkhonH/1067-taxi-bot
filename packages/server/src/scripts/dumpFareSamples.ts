// 💰 READ-ONLY — koson-sim uchun HAQIQIY narx namunalari: tugagan safarlarning (masofa, vaqt, to'lov)
// uchligi. Tarif formulasini TAXMIN QILMAY, real pulga moslash uchun (kas'ning clientTariffs javobi
// necha xil o'qilishi mumkin: 5000+2500/km mi, yoki 1-km 4000 + 2-km 4000 + keyingi 2500 mi).
//
// 🔒 SHAXSIY MA'LUMOT OLINMAYDI: manzil nomi, mashina raqami, telefon — HECH BIRI yozilmaydi.
// Faqat uchta raqam + sana. Bazaga tegilmaydi, hech narsa yozilmaydi (GET api/bookingReports).
//
// Yugurtirish: cd packages/server && npx tsx src/scripts/dumpFareSamples.ts [sahifalar=10]
import "../env";
import { env, repoRoot } from "../env";
import { KasLiveSource } from "../kas/client";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const PAGES = Math.max(1, Math.min(40, Number(process.argv[2]) || 10));
const SIZE = 50; // kas1067: sahifa ~50 cap (CLAUDE.md)
const OUT_DIR = resolve(repoRoot, "../koson-sim/data");

async function main(): Promise<void> {
  const kas = new KasLiveSource({ baseUrl: env.KAS_BASE_URL, username: env.KAS_USERNAME, password: env.KAS_PASSWORD });
  await kas.login();
  console.log("login ✓");

  const rows: { km: number; min: number; som: number; at: string }[] = [];
  for (let p = 0; p < PAGES; p++) {
    const page = await kas.getReportsPage(p, SIZE);
    if (!page.length) { console.log(`sahifa ${p}: bo'sh — to'xtadik`); break; }
    for (const b of page) {
      // faqat tugagan, masofasi va to'lovi bor safarlar
      if (!b.distance || !b.payment) continue;
      rows.push({ km: b.distance / 1000, min: b.time ?? 0, som: b.payment, at: (b.at ?? "").slice(0, 10) });
    }
    console.log(`sahifa ${p}: +${page.length} (yaroqli jami ${rows.length})`);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const out = {
    source: "kas1067 api/bookingReports (READ-ONLY, shaxsiy maydonlarsiz)",
    fetchedAt: new Date().toISOString().slice(0, 10),
    note: "km = kas taximetri masofasi, som = mijoz to'lagan summa, min = safar daqiqasi",
    rows,
  };
  writeFileSync(resolve(OUT_DIR, "fare-samples.json"), JSON.stringify(out, null, 2), "utf8");
  console.log(`\n${rows.length} namuna → ${OUT_DIR}\\fare-samples.json`);
  process.exit(0);
}

main().catch((e) => { console.error("XATO:", e instanceof Error ? e.message : e); process.exit(1); });
