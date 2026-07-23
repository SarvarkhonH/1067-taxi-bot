// 🍽 RESTORAN — Dasturxon (owner eski loyihasi, koson-dasturxon.uz) haqiqiy POS ma'lumotlarini
// BirJoy'ga import qiladi. Manba: packages/server/src/scripts/data/dasturxon/*.json (shu sessiyada
// koson-dasturxon.uz admin panelidan — owner o'zi kirgan — bevosita eksport qilingan, 2026-07-23).
// AMALIY BAZAGA yozadi (test DB emas). Idempotent: har restoran uchun mavjud menu>0 bo'lsa
// o'tkazib yuboriladi (Xonadon/Bahor allaqachon boshqa manbadan to'ldirilgan — ularga tegilmaydi).
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, "../../../..", ".env") });

interface Row {
  section: string;
  name: string;
  priceSom: number;
  photoUrl: string | null;
}

interface RestoranMap {
  /** BirJoy'dagi restoran nomi (mavjud bo'lsa shu nom bo'yicha topiladi) */
  name: string;
  /** Mavjud bo'lmasa shu ma'lumotlar bilan yaratiladi */
  create?: { phone: string; address: string; category: string };
  /** Mavjud bo'lsa, Dasturxon'dan aniqlangan haqiqiy telefonni yozadi (flag izohida "tozalash kerak" deb belgilangan edi) */
  fixPhone?: string;
  file: string;
}

const MAP: RestoranMap[] = [
  { name: "Chinor Oilaviy Restorant", fixPhone: "+998889511814", file: "chinor.json" },
  { name: "Qazili Hot-Dog", file: "qazili.json" },
  {
    name: "Uchqirra Baliq",
    create: { phone: "+998885190009", address: "Koson tumani, yoshlar bog'ida", category: "milliy" },
    file: "uchqirra.json",
  },
  {
    name: "Umar Ota",
    create: { phone: "+998882935000", address: "Koson tumani", category: "milliy" },
    file: "umarota.json",
  },
  {
    name: "Dehqon Bar",
    create: { phone: "+998901234567", address: "Koson tumani", category: "milliy" },
    file: "dehqonbar.json",
  },
  {
    name: "Uzoq Bobo",
    create: { phone: "+998912223500", address: "Koson tumani", category: "milliy" },
    file: "uzoqbobo.json",
  },
];

function loadRows(file: string): Row[] {
  const p = resolve(here, "data/dasturxon", file);
  return JSON.parse(readFileSync(p, "utf8")) as Row[];
}

async function main(): Promise<void> {
  const { prisma } = await import("../db");
  const { adminCreateRestaurant, adminEditRestaurant } = await import("../services/restoranService");

  for (const entry of MAP) {
    let restaurant = await prisma.restaurant.findFirst({ where: { name: entry.name } });

    if (!restaurant && entry.create) {
      const created = await adminCreateRestaurant({
        name: entry.name,
        phone: entry.create.phone,
        address: entry.create.address,
        category: entry.create.category,
      });
      if (!created.ok || !created.id) {
        console.log(`❌ ${entry.name}: yaratilmadi — ${JSON.stringify(created)}`);
        continue;
      }
      restaurant = await prisma.restaurant.findUnique({ where: { id: created.id } });
      console.log(`✅ yaratildi: ${entry.name} (#${created.id}) — active=false (owner ko'rib chiqib yoqadi)`);
    }

    if (!restaurant) {
      console.log(`⚠ ${entry.name}: topilmadi va "create" berilmagan — o'tkazib yuborildi`);
      continue;
    }

    if (entry.fixPhone && restaurant.phone !== entry.fixPhone) {
      await adminEditRestaurant(restaurant.id, { phone: entry.fixPhone });
      console.log(`   📞 telefon yangilandi: ${restaurant.phone} → ${entry.fixPhone}`);
    }

    const existingMenu = await prisma.menuItem.count({ where: { restaurantId: restaurant.id } });
    if (existingMenu > 0) {
      console.log(`↻ ${entry.name} (#${restaurant.id}): allaqachon ${existingMenu} ta taomga ega — menyu o'tkazib yuborildi`);
      continue;
    }

    const rows = loadRows(entry.file).filter((r) => r.name.trim() && r.priceSom >= 500);
    const skipped = loadRows(entry.file).length - rows.length;
    await prisma.menuItem.createMany({
      data: rows.map((r, i) => ({
        restaurantId: restaurant!.id,
        section: r.section.trim().slice(0, 40) || "Taomlar",
        name: r.name.trim().slice(0, 80),
        priceSom: Math.min(2_000_000, Math.floor(r.priceSom)),
        photoUrl: r.photoUrl,
        available: true,
        sortOrder: i,
      })),
    });
    console.log(`✅ ${entry.name} (#${restaurant.id}): ${rows.length} ta taom kiritildi${skipped ? ` (${skipped} ta narxsiz/nomsiz o'tkazib yuborildi)` : ""}`);
  }

  console.log("\n📋 Yakuniy holat:");
  const all = await prisma.restaurant.findMany({
    orderBy: { id: "asc" },
    include: { _count: { select: { menuItems: true } } },
  });
  for (const r of all) {
    console.log(`  #${r.id} ${r.name} — active=${r.active} · ${r.phone} · ${r._count.menuItems} taom`);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("❌ CRASHED:", e);
  process.exit(1);
});
