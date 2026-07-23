// 🍽 RESTORAN — Dasturxon'da alohida restoran-kover-rasm manbasi yo'q edi (Alipos ham, Dasturxon admin
// ham restoran uchun photo/logo saqlamagan). Shu skript har bo'sh-fotoli restoran uchun o'zining eng
// arzon bo'lmagan, rasmga ega birinchi taomini "vakillik" rasm sifatida Restaurant.photoUrl'ga qo'yadi —
// bo'sh/placeholder kartadan ko'ra yaxshiroq. AMALIY BAZAGA yozadi. Idempotent: photoUrl allaqachon
// bo'lsa o'tkazib yuboriladi.
import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, "../../../..", ".env") });

const TARGET_NAMES = ["Chinor Oilaviy Restorant", "Uchqirra Baliq", "Umar Ota", "Dehqon Bar", "Uzoq Bobo"];

async function main(): Promise<void> {
  const { prisma } = await import("../db");

  for (const name of TARGET_NAMES) {
    const restaurant = await prisma.restaurant.findFirst({ where: { name } });
    if (!restaurant) {
      console.log(`⚠ ${name}: topilmadi`);
      continue;
    }
    if (restaurant.photoUrl || restaurant.photoFileId) {
      console.log(`↻ ${name} (#${restaurant.id}): rasmi allaqachon bor — o'tkazib yuborildi`);
      continue;
    }
    const item = await prisma.menuItem.findFirst({
      where: { restaurantId: restaurant.id, photoUrl: { not: null } },
      orderBy: { sortOrder: "asc" },
    });
    if (!item?.photoUrl) {
      console.log(`⚠ ${name} (#${restaurant.id}): rasmli taom topilmadi — o'tkazib yuborildi`);
      continue;
    }
    await prisma.restaurant.update({ where: { id: restaurant.id }, data: { photoUrl: item.photoUrl } });
    console.log(`✅ ${name} (#${restaurant.id}): kover-rasm o'rnatildi ("${item.name}" taomidan)`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("❌ CRASHED:", e);
  process.exit(1);
});
