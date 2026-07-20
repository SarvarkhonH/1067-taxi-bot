// 🧹 V0.5 (BirJoy audit) — do'kon ma'lumot-gigiyenasi. JONLI DB'ga ataylab (prod data-fix).
// Default = DRY-RUN (faqat hisobot); yozish uchun: npx tsx src/scripts/cleanShopData.ts --apply
//
// 1) Yetim ProductPhoto satrlari (mahsuloti o'chirilgan) — audit: 151 dona.
// 2) Kategoriya-normalizatsiya: umum→umumiy, "uy ro'zgo'or"→"Uy anjomlari" (SHOP_CATEGORIES kanonik).
// Idempotent: qayta yugurtirilsa 0 o'zgarish chiqadi.
import { prisma } from "../db";
import { SHOP_CATEGORIES } from "@t1067/shared";

const APPLY = process.argv.includes("--apply");

// eski erkin-string qiymatlar → kanonik
const CATEGORY_MAP: Record<string, string> = {
  umum: "umumiy",
  "uy ro'zgo'or": "Uy anjomlari",
  "uy ro'zg'or": "Uy anjomlari",
  "uy-ro'zg'or": "Uy anjomlari",
};

async function main(): Promise<void> {
  console.log(`— cleanShopData ${APPLY ? "APPLY (yozadi!)" : "DRY-RUN (faqat hisobot)"} —`);

  // 1) yetim rasmlar
  const orphans = await prisma.$queryRaw<{ id: number }[]>`
    SELECT ph.id FROM "ProductPhoto" ph
    WHERE NOT EXISTS (SELECT 1 FROM "Product" pr WHERE pr.id = ph."productId")`;
  console.log(`1) yetim ProductPhoto: ${orphans.length}`);
  if (APPLY && orphans.length) {
    const del = await prisma.productPhoto.deleteMany({ where: { id: { in: orphans.map((o) => o.id) } } });
    console.log(`   o'chirildi: ${del.count}`);
  }

  // 2) kategoriya-normalizatsiya
  const cats = await prisma.$queryRaw<{ category: string; n: bigint }[]>`
    SELECT category, COUNT(*) AS n FROM "Product" GROUP BY category ORDER BY n DESC`;
  console.log("2) kategoriya-taqsimot (hozir):", cats.map((c) => `${c.category}=${c.n}`).join(" · "));
  for (const [bad, good] of Object.entries(CATEGORY_MAP)) {
    const n = await prisma.product.count({ where: { category: bad } });
    if (n === 0) continue;
    console.log(`   "${bad}" → "${good}": ${n} ta mahsulot`);
    if (APPLY) await prisma.product.updateMany({ where: { category: bad }, data: { category: good } });
  }

  // yakuniy tekshiruv-hisobot (DoD 0.5a)
  if (APPLY) {
    const orphansAfter = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*) AS n FROM "ProductPhoto" ph
      WHERE NOT EXISTS (SELECT 1 FROM "Product" pr WHERE pr.id = ph."productId")`;
    const catsAfter = await prisma.$queryRaw<{ category: string; n: bigint }[]>`
      SELECT category, COUNT(*) AS n FROM "Product" GROUP BY category ORDER BY n DESC`;
    const canon = new Set<string>(SHOP_CATEGORIES);
    const offList = catsAfter.filter((c) => !canon.has(c.category));
    console.log(`ISBOT: yetim=${orphansAfter[0]!.n} · kategoriyalar: ${catsAfter.map((c) => `${c.category}=${c.n}`).join(" · ")}`);
    console.log(offList.length ? `⚠️ kanonik-tashqari qoldi: ${offList.map((c) => c.category).join(", ")}` : "✅ hamma kategoriya kanonik ro'yxatdan");
  }
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
