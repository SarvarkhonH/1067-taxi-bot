// 💰 READ-ONLY — R2 muhokamasi uchun: jonli o'yin-katalog + byudjet raqamlari (adminBudget()
// mantig'ining aynan o'zi, panel qanday hisoblasa shunday). Bazaga HECH NARSA yozilmaydi.
//
// Yugurtirish: cd packages/server && npx tsx src/scripts/dumpOyinBudget.ts
import "../env";

async function main(): Promise<void> {
  const svc = await import("../services/oyinService");
  const budget = await svc.adminBudget();
  const catalog = await svc.getCatalog();

  console.log("═══ BYUDJET ═══");
  console.log(`So'nggi 30 kun safar: ${budget.rides30d}`);
  console.log(`Mavsum uzunligi: ${budget.seasonDays} kun`);
  console.log(`Proyeksiya qilingan safar (mavsum bo'yicha): ${budget.projectedRides}`);
  console.log(`Safar boshiga komissiya: ${budget.somPerRide} so'm`);
  console.log(`Kutilayotgan daromad: ${budget.revenueSom.toLocaleString("ru")} so'm`);
  console.log(`Maqsadli sovrin-xarajat foizi: ${budget.targetPct}%`);
  console.log(`RUXSAT ETILGAN byudjet: ${budget.budgetSom.toLocaleString("ru")} so'm`);
  console.log(`JORIY katalog qiymati (active && !queued): ${budget.catalogSom.toLocaleString("ru")} so'm`);
  console.log(`Nisbat: ${(budget.catalogSom / Math.max(1, budget.budgetSom)).toFixed(1)}×`);
  console.log(`Byudjetdan oshganmi: ${budget.overBudget}`);

  console.log("\n═══ KATALOG (active && !queued, byudjetga hisoblanadigan) ═══");
  const live = catalog.filter((p) => p.active && p.queued !== true).sort((a, b) => {
    const av = Number(String(a.valueLabel).replace(/[^\d]/g, "")) || 0;
    const bv = Number(String(b.valueLabel).replace(/[^\d]/g, "")) || 0;
    return bv - av;
  });
  for (const p of live) {
    console.log(`${p.key.padEnd(38)} | ${p.name.slice(0, 40).padEnd(40)} | ${p.valueLabel.padEnd(14)} | ball=${String(p.price).padEnd(6)} | limit=${p.limit}`);
  }

  console.log("\n═══ NAVBATDA (queued=true, byudjetga HISOBLANMAYDI) ═══");
  const queued = catalog.filter((p) => p.queued === true);
  for (const p of queued) {
    console.log(`${p.key.padEnd(38)} | ${p.name.slice(0, 40).padEnd(40)} | ${p.valueLabel.padEnd(14)}`);
  }
  console.log(`\n(active && !queued: ${live.length} ta, queued: ${queued.length} ta, active=false: ${catalog.length - live.length - queued.length} ta, jami: ${catalog.length} ta)`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => process.exit(process.exitCode ?? 0));
