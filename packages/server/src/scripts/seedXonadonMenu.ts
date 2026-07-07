// 🍽 RESTORAN — Xonadon Milliy Taomlari haqiqiy menyusi (2026-07-07). Ega Xonadon kanalidan
// kirillcha menyu-matnini to'g'ridan-to'g'ri yubordi (59 taom, 6 bo'lim) — bulk-kiritadi.
// AMALIY BAZAGA yozadi (test DB emas). Idempotent EMAS — mavjud menyu bo'sh ekanini tekshiradi.
import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, "../../../..", ".env") });

const RESTAURANT_NAME = "Xonadon Milliy Taomlari";

const BIRINCHI = [
  "Qaynatma shurva — 30000",
  "Tushonka — 35000",
  "Uyg'ur lag'mon — 35000",
  "Tanakira — 20000",
];

const IKKINCHI = [
  "Qizilcha shirvoz 1 kg — 230000",
  "Umakay jiz 1 kg — 240000",
  "Kartoshka fri 1 kg — 25000",
  "Kurka jiz 1 kg — 160000",
  "Tildan jiz 1 kg — 180000",
  "Tovuq qizilcha — 80000",
];

const SHASHLIK = [
  "G'ijduvon — 16500",
  "Kuskavoy mol gushti — 22000",
  "Kuskavoy qo'y gushti — 22000",
  "Tovuq qanot — 17000",
  "Napoleon — 25000",
  "Rulet — 25000",
  "Jigar — 15000",
  "Tovuq file — 17000",
  "Kavkaz qo'y gushti — 76000",
  "Mol gushti file — 28000",
  "Dumba — 15000",
  "Sosiska (kanadskiy) — 14000",
  "Shashlik pomidor — 10000",
  "Barbekyu 1 kg — 200000",
  "G'ijduvon fars 1 kg — 140000",
  "G'ijduvon kavkaz — 36000",
  "Kavkaz qovurg'a — 78000",
];

const SOMSA = [
  "Qo'y gushti somsa — 10000",
  "Mol gushti somsa — 8000",
];

const SOKLAR = [
  "Sabzili sok (stakan) — 5000",
  "Olmali sok (stakan) — 12000",
  "Kadili sok (stakan) — 5000",
  "Lavlagili sok (stakan) — 12000",
  "Kompot (grafin) — 20000",
];

const SALATLAR = [
  "Svejiy salat — 15000",
  "Svejiy qatiqli — 17000",
  "Shakarob — 20000",
  "Bahor salat — 15000",
  "Chalop — 10000",
  "Chakki — 5000",
  "Zelen assorti — 20000",
  "Til salat — 40000",
  "Yaponskiy — 40000",
  "Xonadon salat — 40000",
  "Qo'ziqorinli salat — 40000",
  "Smak — 35000",
  "Sezar — 40000",
  "Grecheskiy — 35000",
  "Olivye — 35000",
  "Mujskoy kapriz — 45000",
  "Damskiy kapriz — 40000",
  "Frantsuzskiy — 40000",
  "Meva assorti — 100000",
  "Limon — 10000",
  "Karam salat — 15000",
  "Podvodichka — 40000",
  "Myasnoy assorti — 120000",
  "Fruktoviy salat — 40000",
  "Solyoniy — 15000",
];

async function main(): Promise<void> {
  const { prisma } = await import("../db");
  const { adminBulkCreateMenuItems } = await import("../services/restoranService");

  const restaurant = await prisma.restaurant.findFirst({ where: { name: RESTAURANT_NAME } });
  if (!restaurant) throw new Error(`"${RESTAURANT_NAME}" topilmadi — avval seedRestoranReal.ts ishga tushiring`);
  const existingMenu = await prisma.menuItem.count({ where: { restaurantId: restaurant.id } });
  if (existingMenu > 0) {
    console.log(`⚠ "${RESTAURANT_NAME}" (#${restaurant.id}) allaqachon ${existingMenu} ta taomga ega — qayta kiritilmadi.`);
    await prisma.$disconnect();
    return;
  }

  const sections: [string, string[]][] = [
    ["1-ovqatlar", BIRINCHI],
    ["2-ovqatlar", IKKINCHI],
    ["Shashliklar", SHASHLIK],
    ["Somsalar", SOMSA],
    ["Tabiiy soklar", SOKLAR],
    ["Salatlar", SALATLAR],
  ];
  let total = 0;
  for (const [section, lines] of sections) {
    const r = await adminBulkCreateMenuItems(restaurant.id, section, lines);
    console.log(`✅ ${section}: ${r.created}/${lines.length} kiritildi`);
    total += r.created;
  }

  console.log(`\n📋 Jami: ${RESTAURANT_NAME} (#${restaurant.id}) — ${total} ta taom, 6 bo'limda.`);
  console.log("⚠ Individual taom-rasmlari kiritilmadi — rasm kerak bo'lsa admin panelda qo'lda yuklang.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("❌ CRASHED:", e);
  process.exit(1);
});
