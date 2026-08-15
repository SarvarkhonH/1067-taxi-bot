/**
 * 🔍 FAQAT O'QISH — oxirgi 30 kunda a'zo boshiga NECHTA HAQIQIY safar bo'lganini hisoblaydi
 * (`RideReward`dan, xuddi ball shu yerdan hisoblanganidek) va shu asosda karta darajalariga
 * (600/1200/2400/3600 ball) qancha odam HAQIQATDA yeta olishini ko'rsatadi.
 *
 * Ega savoli (2026-08-13): "raqobatchilarda kunlik 2000... bir mijoz 3-4-10 martalab chaqiradi...
 * balkim bemalol odamlar yeta olar" — median emas, HAQIQIY taqsimotni ko'ramiz.
 *
 * VPS'da:
 *   cd /opt/app/packages/server
 *   npx dotenv -e ../../.env -- npx tsx src/scripts/auditRideDistribution.ts
 */
import { prisma } from "../db";
import { getBonusEcon } from "../services/bonusConfig";
import { OYIN_TIERS } from "@t1067/shared";

async function main(): Promise<void> {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const rows = await prisma.rideReward.groupBy({
    by: ["memberId"],
    where: { createdAt: { gte: since } },
    _count: { _all: true },
  });

  const counts = rows.map((r) => r._count._all).sort((a, b) => a - b);
  const n = counts.length;
  console.log(`═══ Oxirgi 30 kun — HAQIQIY safar (RideReward) ═══`);
  console.log(`  Kamida 1 marta yurgan a'zolar: ${n}\n`);
  if (n === 0) { console.log("  Ma'lumot yo'q."); return; }

  const buckets = [[1, 3], [4, 6], [7, 10], [11, 20], [21, 50], [51, Infinity]] as const;
  console.log("  Oyiga necha marta yurgan     A'zo soni   Ulush");
  for (const [lo, hi] of buckets) {
    const c = counts.filter((x) => x >= lo && x <= hi).length;
    const label = hi === Infinity ? `${lo}+` : `${lo}-${hi}`;
    console.log(`  ${label.padEnd(28)} ${String(c).padStart(6)}    ${((c / n) * 100).toFixed(1)}%`);
  }
  const median = counts[Math.floor(n / 2)];
  const p90 = counts[Math.floor(n * 0.9)];
  console.log(`\n  Median: ${median} safar/oy   ·   90-persentil: ${p90} safar/oy   ·   Eng ko'p: ${counts[n - 1]}`);

  const econ = await getBonusEcon();
  const rideBall = econ.oyinRideBall ?? 35;
  function report(title: string, tiers: Record<string, number>): void {
    console.log(`\n═══ ${title} (oyinRideBall=${rideBall}) ═══`);
    console.log("  Daraja     Ball    Kerak safar/oy   Shu oyoq hozir yetadi   Ulush");
    for (const [tier, ball] of Object.entries(tiers)) {
      const needed = Math.ceil(ball / rideBall);
      const reach = counts.filter((x) => x >= needed).length;
      console.log(`  ${tier.padEnd(9)} ${String(ball).padStart(5)}   ${String(needed).padStart(10)}       ${String(reach).padStart(6)} / ${n}        ${((reach / n) * 100).toFixed(1)}%`);
    }
  }
  report("HOZIRGI darajalar", OYIN_TIERS);
  report("TAKLIF qilingan darajalar (OYIN_KARTA_PLAN.md)", { kichik: 200, orta: 400, katta: 700, bosh: 1000 });
  console.log("\n  ⚠️ Bu FAQAT bitta oy safari bilan (jamg'armasiz) karta olishga yetadigan ulush.");
  console.log("     Ko'p oy davomida ball to'plash bilan ulush albatta YUQORI bo'ladi.");
}

main()
  .catch((e) => { console.error("💥", e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
