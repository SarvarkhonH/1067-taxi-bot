// 🗂 BirJoyMarket katalogi (ega, 2026-07-27) — 30 ta supermarket-darajali kategoriyani
// `CategoryDef` jadvaliga seed qiladi va katalogdan oldingi tartibsizlikni tozalaydi.
//
// IDEMPOTENT: ikkinchi marta yugurtirilsa "yangi=0 · yangilandi=0 · o'chirildi=0" beradi.
// Default DRY-RUN; yozish: npx dotenv -e ../../.env -- tsx src/scripts/seedMarketCategories.ts --apply
//
// NIMA QILADI (shu tartibda):
//  1) `PARFUMERIYA` → `Parfumeriya` — bir kategoriya ikki xil yozilgan (jonli bazada 27+22 mahsulot
//     ikki chipga bo'linib ketgan edi).
//  2) 30 ta kategoriyani upsert (slug-kalit): yo'g'ini yaratadi, borining nom/emoji/tartibini
//     to'g'rilaydi. Ega yuklagan IKONKA-RASM (iconFileId/iconUrl) HECH QACHON tegilmaydi.
//  3) `Aksiya` — merchandising javoni, doim birinchi (sortOrder 0).
//  4) Katalogdan tashqari eski kategoriyalar: mahsuloti BOR bo'lsa ro'yxat oxirida saqlanadi
//     (sortOrder 90+), mahsuloti YO'Q bo'lsa o'chiriladi.
//  5) ISBOT: kategoriyasiz (hech qaysi CategoryDef nomiga mos kelmaydigan) mahsulot soni — 0 bo'lishi
//     SHART, aks holda karusel o'sha mahsulotlarni jimgina yashiradi (shop.tsx nom bo'yicha
//     solishtiradi).
import { prisma } from "../db";
import { MARKET_CATEGORIES, MARKET_PROMO_CATEGORY } from "@t1067/shared";

const APPLY = process.argv.includes("--apply");
const PROMO_SORT = 0;
const LEGACY_SORT_BASE = 90;

// Bir xil kategoriyaning turli yozilishi → kanonik nom. Sof kosmetik emas: mijoz ikkita bir xil
// chipni ko'rmasligi kerak, sotuvchi esa qaysi biriga qo'shishni o'ylab o'tirmasligi kerak.
const RENAME: Record<string, string> = { PARFUMERIYA: "Parfumeriya" };

async function main(): Promise<void> {
  console.log(`— seedMarketCategories ${APPLY ? "APPLY" : "DRY-RUN"} —`);
  let created = 0, updated = 0, deleted = 0, moved = 0;

  // 1) mahsulot-kategoriya nomlarini normalizatsiya
  for (const [from, to] of Object.entries(RENAME)) {
    const n = await prisma.product.count({ where: { category: from } });
    if (!n) continue;
    console.log(`1) «${from}» → «${to}»: ${n} mahsulot`);
    if (APPLY) {
      const r = await prisma.product.updateMany({ where: { category: from }, data: { category: to } });
      moved += r.count;
    }
    // eski nomdagi CategoryDef satri endi keraksiz (kanonik nom o'z satriga ega)
    const dup = await prisma.categoryDef.findFirst({ where: { name: from } });
    if (dup) {
      console.log(`   dublikat CategoryDef #${dup.id} («${from}») o'chiriladi`);
      if (APPLY) { await prisma.categoryDef.delete({ where: { id: dup.id } }); deleted++; }
    }
  }

  // 2) 🔥 Aksiya — doim birinchi
  const promo = await prisma.categoryDef.findFirst({ where: { name: MARKET_PROMO_CATEGORY } });
  if (!promo) {
    console.log(`2) «${MARKET_PROMO_CATEGORY}» yaratiladi`);
    if (APPLY) { await prisma.categoryDef.create({ data: { slug: "aksiya", name: MARKET_PROMO_CATEGORY, emoji: "🔥", sortOrder: PROMO_SORT } }); created++; }
  } else if (promo.sortOrder !== PROMO_SORT || !promo.active) {
    console.log(`2) «${MARKET_PROMO_CATEGORY}» tartibi/holati to'g'rilanadi`);
    if (APPLY) { await prisma.categoryDef.update({ where: { id: promo.id }, data: { sortOrder: PROMO_SORT, active: true } }); updated++; }
  }

  // 3) 30 ta katalog-kategoriya (slug — kalit)
  for (let i = 0; i < MARKET_CATEGORIES.length; i++) {
    const c = MARKET_CATEGORIES[i]!;
    const sortOrder = i + 1;
    const row = await prisma.categoryDef.findUnique({ where: { slug: c.slug } });
    if (!row) {
      console.log(`3) + ${c.emoji} ${c.name} [${c.slug}]`);
      if (APPLY) { await prisma.categoryDef.create({ data: { slug: c.slug, name: c.name, emoji: c.emoji, sortOrder } }); created++; }
      continue;
    }
    // ikonka-rasm ATAYLAB tegilmaydi — uni ega yuklagan
    const needs = row.name !== c.name || row.emoji !== c.emoji || row.sortOrder !== sortOrder || !row.active;
    if (needs) {
      console.log(`3) ~ ${c.name}: nom/emoji/tartib to'g'rilanadi (#${row.id})`);
      if (APPLY) { await prisma.categoryDef.update({ where: { id: row.id }, data: { name: c.name, emoji: c.emoji, sortOrder, active: true } }); updated++; }
    }
  }

  // 4) katalogdan tashqari eskilari: mahsuloti bor → oxiriga, yo'q → o'chirish
  const canonSlugs = new Set<string>([...MARKET_CATEGORIES.map((c) => c.slug), "aksiya"]);
  const others = (await prisma.categoryDef.findMany()).filter((r) => !canonSlugs.has(r.slug));
  let legacyIdx = 0;
  for (const row of others) {
    const n = await prisma.product.count({ where: { category: row.name } });
    if (n === 0) {
      console.log(`4) − «${row.name}» (0 mahsulot) o'chiriladi`);
      if (APPLY) { await prisma.categoryDef.delete({ where: { id: row.id } }); deleted++; }
      continue;
    }
    const sortOrder = LEGACY_SORT_BASE + legacyIdx++;
    console.log(`4) = «${row.name}» saqlanadi (${n} mahsulot) → tartib ${sortOrder}`);
    if (APPLY && (row.sortOrder !== sortOrder || !row.active)) {
      await prisma.categoryDef.update({ where: { id: row.id }, data: { sortOrder, active: true } });
      updated++;
    }
  }

  // 5) ISBOT
  const cats = await prisma.categoryDef.findMany({ orderBy: { sortOrder: "asc" } });
  const names = new Set(cats.map((c) => c.name));
  const byCat = await prisma.product.groupBy({ by: ["category"], _count: { _all: true } });
  const orphans = byCat.filter((g) => !names.has(g.category));
  console.log(`\nISBOT: yangi=${created} · yangilandi=${updated} · o'chirildi=${deleted} · ko'chirilgan mahsulot=${moved}`);
  console.log(`ISBOT: CategoryDef=${cats.length} (faol ${cats.filter((c) => c.active).length})`);
  console.log(`ISBOT: kategoriyasiz mahsulot: ${orphans.reduce((s, g) => s + g._count._all, 0)}${orphans.length ? ` → ${orphans.map((g) => `«${g.category}»×${g._count._all}`).join(", ")}` : ""}`);
  if (!APPLY) console.log("\n(DRY-RUN — hech narsa yozilmadi. Yozish uchun: --apply)");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
