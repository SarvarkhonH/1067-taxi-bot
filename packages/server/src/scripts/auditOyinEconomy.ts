/**
 * 🔍 FAQAT O'QISH — Koson O'yini iqtisodini tekshiradi, HECH NARSA yozmaydi.
 *
 * Ega so'rovi (2026-08-13): "odamlar bir taksi chaqirishiga nechi ball olopti", "to'g'ir ball
 * bermoqdamizmi", "kecha qo'shgan sovg'alarga fair qo'yildimi". Uch bo'lim:
 *  1. Ball-iqtisod knoblari (safar/birinchi-safar) — joriy qiymat vs kod default'i.
 *  2. Butun katalog: har sovrin uchun narx×o'rin (ball) → so'mga aylantirilsa, real qiymatga
 *     nisbatan qoplash-koeffitsienti. `OYIN_PRIZE_MULTIPLIER` (3×) — "fair" chegara. Katta
 *     og'ish (< 2× yoki > 5×) BAYROQ bilan belgilanadi.
 *  3. Sog'lik tekshiruvi: sold > limit (imkonsiz bo'lishi kerak, lekin tasdiqlaymiz),
 *     navbatda (queued) qolgan sovg'alar soni.
 *
 * VPS'da:
 *   cd /opt/app/packages/server
 *   npx dotenv -e ../../.env -- npx tsx src/scripts/auditOyinEconomy.ts
 */
import { getBonusEcon } from "../services/bonusConfig";
import { adminListCatalog } from "../services/oyinService";
import { OYIN_PRIZE_MULTIPLIER, OYIN_SOM_PER_BALL } from "@t1067/shared";
import { prisma } from "../db";

function fmt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

async function main(): Promise<void> {
  console.log("═══ 1. BALL-IQTISOD KNOBLARI ═══");
  const econ = await getBonusEcon();
  console.log(`  oyinRideBall (safar uchun):        ${econ.oyinRideBall ?? "?"} ball  (kod default: 35)`);
  console.log(`  oyinFirstRideBall (birinchi safar): ${econ.oyinFirstRideBall ?? "?"} ball  (kod default: 100)`);
  console.log(`  oyinGashtakRejoinCooldownDays:       ${econ.oyinGashtakRejoinCooldownDays ?? "?"} kun`);

  console.log("\n═══ 2. KATALOG — NARX ADOLATI (maqsad: ~3.0×, OYIN_PRIZE_MULTIPLIER) ═══");
  const catalog = await adminListCatalog();
  const active = catalog.filter((p) => p.active);
  console.log(`  Jami faol sovrin: ${active.length} (${catalog.length - active.length} nofaol)\n`);
  console.log("  nomi                                          narx×limit=ball    →so'm kassa    real qiymat   nisbat   holat");
  const flagged: string[] = [];
  for (const p of active.slice().sort((a, b) => a.name.localeCompare(b.name))) {
    const ballCapacity = p.price * p.limit;
    const somCapacity = ballCapacity * OYIN_SOM_PER_BALL;
    const realSom = Number((p.valueLabel.match(/[\d\s]+/)?.[0] ?? "0").replace(/\s/g, "")) || 0;
    const ratio = realSom > 0 ? somCapacity / realSom : NaN;
    const flag = !Number.isFinite(ratio) ? "⚠️ narx o'qilmadi" : ratio < 2 ? "🔴 KAM (kassa yetmaydi)" : ratio > 5 ? "🟡 KO'P (juda qiyin)" : "✅";
    if (flag !== "✅") flagged.push(`${p.name} — ${ratio.toFixed(1)}×`);
    console.log(
      `  ${p.name.slice(0, 44).padEnd(46)} ${String(p.price).padStart(6)}×${String(p.limit).padStart(3)}=${String(ballCapacity).padStart(7)}  ${fmt(somCapacity).padStart(12)}   ${fmt(realSom).padStart(11)}   ${Number.isFinite(ratio) ? ratio.toFixed(1) + "×" : "—"}   ${flag}`,
    );
  }

  console.log("\n═══ 3. SOG'LIK TEKSHIRUVI ═══");
  const overSold = active.filter((p) => p.sold > p.limit);
  console.log(`  sold > limit (imkonsiz bo'lishi kerak): ${overSold.length} ta ${overSold.length > 0 ? "🔴 " + overSold.map((p) => p.key).join(", ") : "✅"}`);
  const queued = catalog.filter((p) => p.queued);
  console.log(`  Navbatda (hali vitrinada emas): ${queued.length} ta${queued.length > 0 ? " — " + queued.map((p) => p.name).join(", ") : ""}`);
  const willDrawCount = active.filter((p) => p.willDraw).length;
  console.log(`  Hozir tirajga tushadigan (sold ≥ minSell): ${willDrawCount} / ${active.length}`);

  if (flagged.length > 0) {
    console.log(`\n⚠️ ADOLATSIZ NARXLANGAN (${flagged.length} ta):`);
    for (const f of flagged) console.log(`   - ${f}`);
  } else {
    console.log("\n✅ Barcha faol sovrinlar 2-5× oralig'ida — narxlash adolatli.");
  }
}

main()
  .catch((e) => { console.error("💥", e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
