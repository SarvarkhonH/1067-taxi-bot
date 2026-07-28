// 🏬 Do'konlarni tartibga solish (ega so'rovi, 2026-07-28):
//   1) mahsuloti YO'Q do'konlarni yopish
//   2) «Amazonbabykids» → «Amazon-kids»
//   3) qolganlariga chiroyli logo (SVG, do'kon nomidan barqaror rang + monogram + turi belgisi)
//
// ⚠️ O'CHIRISH EMAS, YOPISH: `active=false`. Sabab — do'kon o'chirilsa unga bog'liq buyurtma va
// mahsulot yozuvlari "egasiz" qolardi, va ega fikridan qaytsa tiklab bo'lmasdi. Yopilgan do'kon
// mijozga KO'RINMAYDI (getMarketHome faqat active oladi) — ya'ni natija ega so'raganidek.
// Buyurtmasi bo'lgan do'kon HECH QACHON yopilmaydi (tarix buziladi).
//
// Default DRY-RUN. Yozish: npx dotenv -e ../../.env -- npx tsx src/scripts/tidyShops.ts --apply
import { prisma } from "../db";

const APPLY = process.argv.includes("--apply");

import { shopLogoDataUrl, monogram, hueOf } from "../services/shopLogoService";

async function main(): Promise<void> {
  console.log(`— tidyShops ${APPLY ? "APPLY" : "DRY-RUN"} —\n`);
  const shops = await prisma.marketShop.findMany({ orderBy: { id: "asc" } });
  const prod = await prisma.product.groupBy({ by: ["shopId"], _count: { _all: true } });
  const ord = await prisma.marketOrder.groupBy({ by: ["shopId"], _count: { _all: true } });
  const pCount = new Map(prod.map((x) => [x.shopId, x._count._all]));
  const oCount = new Map(ord.map((x) => [x.shopId, x._count._all]));

  // 1) bo'sh do'konlarni yopish
  let closed = 0;
  for (const s of shops) {
    const p = pCount.get(s.id) ?? 0;
    const o = oCount.get(s.id) ?? 0;
    if (p > 0 || !s.active) continue;
    if (o > 0) { console.log(`1) ⏭ #${s.id} «${s.name}» — mahsuloti yo'q, LEKIN ${o} buyurtmasi bor → tegilmadi`); continue; }
    console.log(`1) ✖ #${s.id} «${s.name}» — 0 mahsulot, 0 buyurtma → YOPILADI`);
    if (APPLY) { await prisma.marketShop.update({ where: { id: s.id }, data: { active: false } }); closed++; }
  }

  // 2) nomni o'zgartirish
  const target = shops.find((s) => s.name.toLowerCase().replace(/[^a-z]/g, "") === "amazonbabykids");
  if (target && target.name !== "Amazon-kids") {
    console.log(`\n2) ✎ #${target.id} «${target.name}» → «Amazon-kids»`);
    if (APPLY) await prisma.marketShop.update({ where: { id: target.id }, data: { name: "Amazon-kids" } });
  }

  // 3) logolar — mahsuloti bor (yoki yopilmagan) do'konlarga
  console.log("\n3) logolar:");
  let logos = 0;
  for (const s of shops) {
    const p = pCount.get(s.id) ?? 0;
    const o = oCount.get(s.id) ?? 0;
    if (p === 0 && o === 0) continue; // yopilgan do'konga logo shart emas
    const name = s.id === target?.id ? "Amazon-kids" : s.name;
    const dataUrl = shopLogoDataUrl(name);
    if (s.photoUrl === dataUrl) { console.log(`   = #${s.id} «${name}» — logo allaqachon shu`); continue; }
    console.log(`   ${s.photoFileId || s.photoUrl ? "~" : "+"} #${s.id} «${name}» → ${monogram(name)} · hue ${hueOf(name)}`);
    if (APPLY) {
      // photoFileId tozalanadi: serveMarketImage avval photoUrl'ni oladi, ikkisi birga turishi
      // keyinchalik "qaysi biri haqiqiy?" savolini tug'diradi.
      await prisma.marketShop.update({ where: { id: s.id }, data: { photoUrl: dataUrl, photoFileId: null } });
      logos++;
    }
  }

  const after = await prisma.marketShop.count({ where: { active: true } });
  console.log(`\nISBOT: yopildi=${closed} · logo=${logos} · faol do'kon qoldi=${after}`);
  if (!APPLY) console.log("(DRY-RUN — hech narsa yozilmadi. Yozish: --apply)");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
