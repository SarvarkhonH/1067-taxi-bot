// 🏪 V1.1 (BirJoy) — marketplace-migratsiya: do'kon #1 «BirJoy o'z do'koni» (ega) + barcha mavjud
// mahsulotlar shopId=1 + CategoryDef seed (SHOP_CATEGORIES'dan, emoji bilan — ikonka-rasmni ega
// admin-panelda yuklaydi). IDEMPOTENT: qayta yugurtirilsa 0 o'zgarish. JONLI DB'ga ataylab.
// Default DRY-RUN; yozish: npx tsx src/scripts/migrateBirjoySeller.ts --apply
import { prisma } from "../db";
import { SHOP_CATEGORIES } from "@t1067/shared";

const APPLY = process.argv.includes("--apply");
const OWNER_TG = "6506297119"; // bot/shop.ts bilan bir xil

const CATEGORY_EMOJI: Record<string, string> = {
  Aksiya: "🔥", umumiy: "🛍", "Uy anjomlari": "🏠", Parfumeriya: "🌸",
  "Oziq-ovqat": "🍎", Elektronika: "📱", "Kiyim-kechak": "👕", "Bolalar uchun": "🧸", "Go'zallik": "💄",
};
const slugOf = (name: string): string => name.toLowerCase().replace(/['ʼ']/g, "").replace(/[^a-z0-9а-яё]+/gi, "-").replace(/^-|-$/g, "");

async function main(): Promise<void> {
  console.log(`— migrateBirjoySeller ${APPLY ? "APPLY" : "DRY-RUN"} —`);

  // 1) do'kon #1 — ega'ning o'z do'koni
  const existing = await prisma.marketShop.findFirst({ where: { name: "BirJoy o'z do'koni" } });
  console.log(`1) «BirJoy o'z do'koni»: ${existing ? `bor (#${existing.id})` : "YO'Q — yaratiladi"}`);
  let shopId = existing?.id;
  if (APPLY && !existing) {
    const s = await prisma.marketShop.create({
      data: {
        name: "BirJoy o'z do'koni",
        category: "umumiy",
        phone: "+998916626060", // kas1067 dispetcher raqami (bot /aloqa bilan bir xil)
        deliveryText: "Bugun-ertaga yetkazamiz",
        ownerChatId: OWNER_TG,
        active: true, // ega do'koni darhol faol — bugungi xatti-harakat AYNAN saqlanadi
      },
    });
    shopId = s.id;
    console.log(`   yaratildi: #${s.id}`);
  }

  // 2) egasiz mahsulotlar → do'kon #1
  const orphanProducts = await prisma.product.count({ where: { shopId: null } });
  console.log(`2) shopId=null mahsulotlar: ${orphanProducts}`);
  if (APPLY && shopId && orphanProducts) {
    const upd = await prisma.product.updateMany({ where: { shopId: null }, data: { shopId } });
    console.log(`   biriktirildi: ${upd.count} → do'kon #${shopId}`);
  }

  // 3) CategoryDef seed (bor slug'lar o'tkaziladi)
  for (let i = 0; i < SHOP_CATEGORIES.length; i++) {
    const name = SHOP_CATEGORIES[i]!;
    const slug = slugOf(name);
    const has = await prisma.categoryDef.findUnique({ where: { slug } });
    if (has) continue;
    console.log(`3) kategoriya seed: ${slug} (${name})`);
    if (APPLY) await prisma.categoryDef.create({ data: { slug, name, emoji: CATEGORY_EMOJI[name] ?? "🛍", sortOrder: i } });
  }

  if (APPLY) {
    const [shops, unassigned, cats] = await Promise.all([
      prisma.marketShop.count(), prisma.product.count({ where: { shopId: null } }), prisma.categoryDef.count(),
    ]);
    console.log(`ISBOT (V1.1): MarketShop=${shops} · shopId=null qolgan=${unassigned} · CategoryDef=${cats}`);
  }
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
