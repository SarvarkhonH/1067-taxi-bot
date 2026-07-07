// 🍽 RESTORAN — Bahor Restaurant (id per DB, name-lookup) haqiqiy menyusi (2026-07-07). Ega Bahor
// kanalidan lotincha kirillcha menyu-ro'yxatini yubordi (54 taom) — bu skript uni lotinchaga
// o'girib, bo'limlarga ajratib (Birinchi taomlar / Ikkinchi taomlar / Shashlik) bulk-kiritadi.
// AMALIY BAZAGA yozadi (test DB emas). Idempotent EMAS — qayta ishga tushirilsa duplikat yaratadi,
// shuning uchun avval mavjud "Bahor Restaurant" menyusi bo'sh ekanini tekshiradi.
//
// 3 element narxi ANIQLASHTIRISH TALAB QILADI (admin panelda ko'rib chiqing):
//   - "Bahor assorti": asl 500 000–600 000 oralig'i — pastki chegara kiritildi, desc'da eslatma.
//   - "Zakaz osh": "300 000 кг" (1 kg narxi, oldindan buyurtma) — desc'da eslatma.
//   - "Shirvoz sh.": asl "22 00" (ehtimol yozuv xatosi, "22 000" bo'lishi kerak — atrofdagi
//     narxlar 19 000–30 000 oralig'ida, shuning uchun 22000 deb XULOSA QILINDI, TASDIQLANMAGAN).
import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, "../../../..", ".env") });

const RESTAURANT_NAME = "Bahor Restaurant";

const BIRINCHI = [
  "Mastava — 25000",
  "Mo'jiza — 35000",
  "Dolma — 30000",
  "Nuxat shurva — 35000",
  "Shurva — 35000",
  "Chuchvara — 25000",
  "Maxorra — 30000",
  "Salyanka — 30000",
  "Bahor bulon — 30000",
];

const IKKINCHI = [
  "Grechka — 37000",
  "Jizza — 260000",
  "Tushonka — 260000",
  "Archa gusht — 260000",
  "Tabaka — 90000",
  "Bo'yin gushti — 280000",
  "Ajabsanda — 260000",
  "Bahor gusht — 280000",
  "Tovuq tandir — 65000",
  "Uyg'ur jiz — 270000",
  "Qizilcha — 240000",
  "Manchuri — 260000",
  "Barra — 1600000",
  "Qozon kabob — 260000",
  "Kotlet — 12000",
  "Kurka chixombili — 180000",
  "Tovuq chixombili — 80000",
  "Tovuq qizilcha — 60000",
  "Jigar kabob — 100000",
  "Uyg'ur manti — 8000",
  "Bahor assorti — 500000", // desc: 500 000–600 000 (hajmga qarab), keyin edit qilinadi
  "Somsa — 9000",
  "Shirvoz chixombili — 260000",
  "Zakaz osh — 300000", // desc: 1 kg narxi, oldindan buyurtma
  "Piyozli gusht — 260000",
  "O'rdak chixombili — 200000",
  "Xo'roz (uy) chixombili — 180000",
  "Bedana maslenaya — 35000", // desc: 1 dona narxi
  "Bedana chixombili — 140000",
];

const SHASHLIK = [
  "Shirvoz sh. — 22000", // ⚠ asl "22 00" — ehtimol yozuv xatosi, tasdiqlanmagan
  "Gijduvon — 19000",
  "Napoleon — 22500",
  "File sh. — 22500",
  "Rulet kabob — 22500",
  "Tovuq kabob — 30000",
  "Kafkaz shirvoz — 90000",
  "Bikin — 75000",
  "Qiyma gelak — 25000",
  "Jigar sh. — 12500",
  "Kuskovoy (mol gusht) — 22500",
  "Tovuq file — 12500",
  "Qiyma rulet — 55000",
  "Qiyma kafkaz — 45000",
  "Kosoncha — 15000",
  "Bedana — 35000",
];

async function main(): Promise<void> {
  const { prisma } = await import("../db");
  const { adminBulkCreateMenuItems, adminEditMenuItem } = await import("../services/restoranService");

  const restaurant = await prisma.restaurant.findFirst({ where: { name: RESTAURANT_NAME } });
  if (!restaurant) throw new Error(`"${RESTAURANT_NAME}" topilmadi — avval seedRestoranReal.ts ishga tushiring`);
  const existingMenu = await prisma.menuItem.count({ where: { restaurantId: restaurant.id } });
  if (existingMenu > 0) {
    console.log(`⚠ "${RESTAURANT_NAME}" (#${restaurant.id}) allaqachon ${existingMenu} ta taomga ega — qayta kiritilmadi (duplikat oldini olish uchun).`);
    console.log("   Qayta kiritish uchun avval admin panelda mavjud taomlarni o'chiring.");
    await prisma.$disconnect();
    return;
  }

  const r1 = await adminBulkCreateMenuItems(restaurant.id, "Birinchi taomlar", BIRINCHI);
  console.log(`✅ Birinchi taomlar: ${r1.created}/${BIRINCHI.length} kiritildi`);
  const r2 = await adminBulkCreateMenuItems(restaurant.id, "Ikkinchi taomlar", IKKINCHI);
  console.log(`✅ Ikkinchi taomlar: ${r2.created}/${IKKINCHI.length} kiritildi`);
  const r3 = await adminBulkCreateMenuItems(restaurant.id, "Shashlik", SHASHLIK);
  console.log(`✅ Shashlik: ${r3.created}/${SHASHLIK.length} kiritildi`);

  // Narx-oraliq/birlik eslatmalari — 3 ta noaniq element uchun desc qo'shiladi
  const assorti = await prisma.menuItem.findFirst({ where: { restaurantId: restaurant.id, name: "Bahor assorti" } });
  if (assorti) await adminEditMenuItem(assorti.id, { desc: "Asl narx: 500 000 – 600 000 so'm (hajmga qarab) — admin aniqlashtirsin" });
  const osh = await prisma.menuItem.findFirst({ where: { restaurantId: restaurant.id, name: "Zakaz osh" } });
  if (osh) await adminEditMenuItem(osh.id, { desc: "1 kg narxi, oldindan buyurtma qilinadi" });
  const bedanaM = await prisma.menuItem.findFirst({ where: { restaurantId: restaurant.id, name: "Bedana maslenaya" } });
  if (bedanaM) await adminEditMenuItem(bedanaM.id, { desc: "1 dona narxi" });
  const shirvozSh = await prisma.menuItem.findFirst({ where: { restaurantId: restaurant.id, name: "Shirvoz sh." } });
  if (shirvozSh) await adminEditMenuItem(shirvozSh.id, { desc: "⚠ Narx tasdiqlanmagan — asl yozuvda \"22 00\" edi (ehtimol \"22 000\"), admin tekshirsin" });

  const total = await prisma.menuItem.count({ where: { restaurantId: restaurant.id } });
  console.log(`\n📋 Jami: ${RESTAURANT_NAME} (#${restaurant.id}) — ${total} ta taom kiritildi (barchasi 3 bo'limda).`);
  console.log("⚠ 3 ta element narxi/birligi aniqlashtirish talab qiladi (desc'da belgilangan) — admin panelda tekshiring.");
  console.log("⚠ Individual taom-rasmlari topilmadi (WebFetch chuqur post-tarixiga kira olmadi) — rasm kerak bo'lsa qo'lda yuklang.");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("❌ CRASHED:", e);
  process.exit(1);
});
