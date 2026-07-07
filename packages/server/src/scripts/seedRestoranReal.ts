// 🍽 RESTORAN — R5 real-data seed (2026-07-07). Elbek (ega) 7 ta haqiqiy Koson restorani/choyxonasi
// ijtimoiy tarmoq havolasini yubordi. Bu skript ochiq Telegram kanallardan tasdiqlangan faktlarni
// (nom, telefon, manzil, ish vaqti, logotip) kiritadi — MENYU/NARX ATAYLAB kiritilmagan: hech qaysi
// kanalda matn-holidagi narx topilmadi (rasm-menyu bo'lishi mumkin, OCR imkoniyati yo'q), va real
// pul-operatsiya uchun narxni o'ylab topish YO'L QO'YILMAYDI. Har biri active=false (admin ko'radi,
// mijoz yo'q) — ega tekshirib, telefon orqali menyu yig'ib, keyin yoqadi (R5 pilot bosqichi).
//
// AMALIY BAZAGA yozadi ("./_testDb" YO'Q — TEST DB emas). Idempotent: nomi bo'yicha mavjud bo'lsa
// qayta yaratmaydi, faqat rasmni yangilaydi.
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, "../../../..", ".env") });

interface SeedRow {
  name: string;
  phone: string | null;
  address: string | null;
  workHours: string | null;
  category: string;
  telegram: string;
  photoPath: string | null;
}

const SCRATCH = "C:\\Users\\sarva\\AppData\\Local\\Temp\\claude\\C--Users-sarva-Desktop-1067-bot\\336dc278-27bb-4206-a8b2-fbd5253ed91b\\scratchpad";

const ROWS: SeedRow[] = [
  { name: "Bahor Restaurant", phone: "+998771361234", address: null, workHours: null, category: "milliy", telegram: "t.me/koson_bahor", photoPath: `${SCRATCH}\\bahor.jpg` },
  { name: "Jazira", phone: "+998914665050", address: null, workHours: "00:00-23:59", category: "fastfood", telegram: "t.me/Jazira_Uzb", photoPath: `${SCRATCH}\\jazira.jpg` },
  { name: "Orif Bar", phone: "+998919610100", address: null, workHours: "08:00-23:00", category: "milliy", telegram: "t.me/ORIFBAR_Oilaviy_choyhonasi", photoPath: `${SCRATCH}\\orifbar.jpg` },
  { name: "Xonadon Milliy Taomlari", phone: "+998979635577", address: "Koson tumani, Shabada chorrahasidan o'tib, o'ng qo'lda", workHours: "09:00-23:00", category: "milliy", telegram: "t.me/xonadon_restaurant", photoPath: `${SCRATCH}\\xonadon.jpg` },
  { name: "Qazili Hot-Dog", phone: "+998331926666", address: "Koson tumani, Eski Uchqirra, Madaniyat markazi yonida", workHours: null, category: "fastfood", telegram: "t.me/QaziliHotdog_uz", photoPath: `${SCRATCH}\\qazi.jpg` },
  { name: "Do'stlar Choyxonasi", phone: null, address: null, workHours: null, category: "milliy", telegram: "instagram.com/dustlar_choyxonasi", photoPath: null },
  { name: "Chinor Oilaviy Restorant", phone: null, address: null, workHours: null, category: "milliy", telegram: "instagram.com/chinor_oilaviy_restorant", photoPath: null },
];

async function main(): Promise<void> {
  const { prisma } = await import("../db");
  const { adminCreateRestaurant, uploadRestaurantPhoto } = await import("../services/restoranService");

  for (const row of ROWS) {
    const existing = await prisma.restaurant.findFirst({ where: { name: row.name } });
    let id: number;
    if (existing) {
      id = existing.id;
      console.log(`↻ mavjud: ${row.name} (#${id}) — o'tkazib yuborildi (o'chirib qayta seed qiling agar yangilamoqchi bo'lsangiz)`);
    } else {
      const created = await adminCreateRestaurant({
        name: row.name,
        phone: row.phone ?? "noma'lum — telefon orqali aniqlanadi",
        category: row.category,
        address: row.address ?? undefined,
        workHours: row.workHours ?? undefined,
      });
      if (!created.ok || !created.id) {
        console.log(`❌ ${row.name}: yaratilmadi — ${JSON.stringify(created)}`);
        continue;
      }
      id = created.id;
      console.log(`✅ yaratildi: ${row.name} (#${id}) — active=false, menu=0 (R5: telefon orqali menyu yig'iladi)`);
    }
    if (row.photoPath) {
      try {
        const buf = readFileSync(row.photoPath);
        await uploadRestaurantPhoto(id, buf, "image/jpeg");
        console.log(`   🖼 logotip yuklandi (${row.telegram})`);
      } catch (e) {
        console.log(`   ⚠ rasm topilmadi/yuklanmadi: ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  console.log("\n📋 Yakuniy holat:");
  const { adminListRestaurants } = await import("../services/restoranService");
  const { restaurants } = await adminListRestaurants();
  for (const r of restaurants) {
    console.log(`  #${r.id} ${r.name} — ${r.active ? "🟢 active" : "🔴 inactive"} · ${r.phone} · ${r.menuCount} taom · foto=${r.hasPhoto ? "bor" : "yo'q"}`);
  }
  console.log("\n⚠ HECH BIRIDA MENYU YO'Q — bu ataylab shunday: hech qaysi ijtimoiy tarmoq sahifasida matn-narx topilmadi.");
  console.log("   Keyingi qadam: har biriga telefon qiling, menyuni admin panel > Restoran > Bulk qo'shish orqali kiriting.");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("❌ CRASHED:", e);
  process.exit(1);
});
