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

  const cap = await svc.getCapacity();
  console.log("\n═══ SIG'IM (getCapacity — navbatdan avtomatik ochish shu raqamga qaraydi) ═══");
  console.log(`Xalq qo'lidagi aylanma ball: ${cap.circulatingBall.toLocaleString("ru")}`);
  console.log(`Ochiq mukofotlarning bo'sh o'rin-balli: ${cap.openBall.toLocaleString("ru")}`);
  console.log(`Nisbat: ${cap.ratio}× (sog'lom chegara: ≥1.5×) — healthy=${cap.healthy}`);
  console.log(`Ochiq: ${cap.openCount} · navbatda: ${cap.queuedCount} · to'lgan: ${cap.filledCount}`);

  // 🎯 R2 ning HAQIQIY o'lchovi. `catalogSom vs budgetSom` (yuqoridagi 249×) DEPRECATED
  // `OYIN_TARGET_COST_PCT` ga tayanadi; amaldagi kafolat esa HAR SOVRIN uchun alohida:
  // to'lganda yig'ilgan pul (price × limit × 20 so'm) sovrin narxidan ≥3× bo'lishi kerak.
  const SOM_PER_BALL = 20;
  console.log("\n═══ KATALOG — har sovrinning KAFOLAT sog'lig'i (m = kassa ÷ narx, kerak ≥3) ═══");
  const live = catalog.filter((p) => p.active && p.queued !== true).map((p) => {
    const valueSom = Number(String(p.valueLabel).replace(/[^\d]/g, "")) || 0;
    const fillBall = p.price * p.limit;
    const kassaSom = fillBall * SOM_PER_BALL;
    return { p, valueSom, fillBall, m: valueSom > 0 ? kassaSom / valueSom : 0 };
  }).sort((a, b) => a.m - b.m);
  for (const r of live) {
    const flag = r.m < 1 ? "🔴 ZARAR" : r.m < 2.5 ? "🟠 past" : r.m > 6 ? "🔵 qimmat" : "✅";
    console.log(
      `${flag.padEnd(9)} m=${r.m.toFixed(2).padStart(6)} | to'lish=${String(r.fillBall).padStart(9)} ball | ` +
      `${r.p.valueLabel.padStart(14)} | ball=${String(r.p.price).padStart(6)} ×${String(r.p.limit).padStart(4)} | ${r.p.name.slice(0, 34)}`,
    );
  }
  const totalFill = live.reduce((s, r) => s + r.fillBall, 0);
  console.log(`\nButun ochiq katalogni to'ldirish uchun kerak: ${totalFill.toLocaleString("ru")} ball`);
  console.log(`Bir mavsumda tug'iladigan ball (faqat safardan, ${budget.projectedRides} safar × 35): ~${(budget.projectedRides * 35).toLocaleString("ru")}`);
  console.log(`Ya'ni butun katalog to'lishi uchun ~${Math.round(totalFill / Math.max(1, budget.projectedRides * 35))} mavsum kerak.`);

  console.log("\n═══ NAVBATDA (queued=true, byudjetga HISOBLANMAYDI) ═══");
  const queued = catalog.filter((p) => p.queued === true);
  for (const p of queued) {
    console.log(`${p.key.padEnd(38)} | ${p.name.slice(0, 40).padEnd(40)} | ${p.valueLabel.padEnd(14)}`);
  }
  console.log(`\n(active && !queued: ${live.length} ta, queued: ${queued.length} ta, active=false: ${catalog.length - live.length - queued.length} ta, jami: ${catalog.length} ta)`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => process.exit(process.exitCode ?? 0));
