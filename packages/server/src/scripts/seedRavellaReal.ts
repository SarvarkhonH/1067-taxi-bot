// 🎀 Ravella HAQIQIY katalogi (ega bergan suratlar, 2026-07-27). Namuna `[DEMO]` satrlari
// o'chiriladi va o'rniga Ravella'ning REAL ishlari qo'yiladi — rasm, nom, narx.
//
// NARX QO'YILMAYDI (ega qarori 2026-07-27): hamma narx 0 — mijozga "Narxi kelishiladi" deb
// ko'rsatiladi, ega esa admin panelda o'zi kiritadi. Skript mavjud bezakning narxiga TEGMAYDI
// (nom bo'yicha topadi, faqat yo'qini yaratadi) — ya'ni ega kiritgan narx qayta yugurtirilganda
// nolga qaytmaydi. Rasmlar esa har safar yangilanadi (fayl almashsa yangisi chiqsin).
//
// Rasmlar: packages/miniapp/public/ravella/*.jpg (repo bilan birga deploy bo'ladi).
// Tozalash/qayta qurish: `--reset` — Ravella katalogini butunlay o'chirib qaytadan yaratadi.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PHOTO_DIR = resolve(process.cwd(), "../../packages/miniapp/public/ravella");

interface AddonSpec { name: string; priceSom: number; maxQty?: number; photo?: string }
interface ItemSpec { name: string; desc: string; priceSom: number; photo: string; addons?: AddonSpec[] }
interface CatSpec { name: string; emoji: string; items: ItemSpec[]; addons?: AddonSpec[] }

const CATALOGUE: CatSpec[] = [
  {
    // Ega qarori (2026-07-27): kartalar TADBIR TURI bo'yicha, aynan shu tartibda — mijoz
    // "menda qanday tadbir?" deb o'ylaydi, "qanday bezak kerak?" deb emas. Bitta bo'lim
    // bo'lgani uchun ekranda bo'lim sarlavhasi ko'rsatilmaydi (faqat kartalar).
    name: "Bezaklar",
    emoji: "🎀",
    items: [
      { name: "Restoran uchun", desc: "To'yxona va restoran zali: sahna, stol va kirish bezagi.", priceSom: 0, photo: "" },
      { name: "Kelin uyi", desc: "Kelin uyi bezagi: kirish, hovli va ichkari zal.", priceSom: 0, photo: "" },
      { name: "Kiyov uyi", desc: "Kuyov uyi bezagi: darvoza, hovli va mehmon qismi.", priceSom: 0, photo: "" },
      { name: "Sunnat to'y", desc: "Sunnat to'yi uchun bezak: sahna, foto-zona va shar bezaklari.", priceSom: 0, photo: "" },
      { name: "Ochilish marosimi", desc: "Yangi bino ochilishi: kirish arkasi va yo'lak gulchambarlari.", priceSom: 0, photo: "ish-bino-kirish.jpg" },
      { name: "Davlat tadbirlari", desc: "Rasmiy tadbirlar: logotipli taxta, zal va sahna bezagi.", priceSom: 0, photo: "ish-premium-zal.jpg" },
      { name: "Sharlar", desc: "Shar arkalari, gulchambarlar va shar kompozitsiyalari.", priceSom: 0, photo: "ish-oltin-arka.jpg" },
      { name: "Boshqa", desc: "Bitiruv, tug'ilgan kun va boshqa tadbirlar — aytganingizga qarab tayyorlanadi.", priceSom: 0, photo: "ish-bitiruv-sahna.jpg" },
    ],
    // Qo'shimchalar BUTUN bo'limga tegishli — ya'ni har 8 ta kartada chiqadi. Rasmi borlari
    // «qo'shilgan holat» suratini ko'rsatadi: mijoz «+» bosganda katta rasm shunga o'zgaradi.
    addons: [
      { name: "Zal shifti bezagi", priceSom: 0, maxQty: 1, photo: "ish-zal-shift.jpg" },
      { name: "Kirish arkasi", priceSom: 0, maxQty: 2, photo: "ish-kirish-arka.jpg" },
      { name: "Sovuq salyut (juft)", priceSom: 0, maxQty: 4 },
      { name: "Foil yulduzlar (5 dona)", priceSom: 0, maxQty: 4 },
    ],
  },
];

function photoBuf(file: string): Buffer | null {
  try {
    return readFileSync(resolve(PHOTO_DIR, file));
  } catch {
    console.error(`  ⚠️ rasm topilmadi: ${file} (${PHOTO_DIR})`);
    return null;
  }
}

async function main(): Promise<void> {
  const { prisma } = await import("../db");
  const svc = await import("../services/ravellaService");
  const reset = process.argv.includes("--reset");

  // namuna satrlari HAR DOIM ketadi — ular faqat ko'rsatish uchun edi
  const demo = await prisma.ravellaCategory.findMany({ where: { name: { contains: "[DEMO]" } }, select: { id: true } });
  const demoIds = demo.map((c) => c.id);
  if (demoIds.length || reset) {
    const where = reset ? {} : { categoryId: { in: demoIds } };
    const items = await prisma.ravellaItem.findMany({ where, select: { id: true } });
    await prisma.ravellaAddon.deleteMany({ where: reset ? {} : { OR: [{ itemId: { in: items.map((i) => i.id) } }, { categoryId: { in: demoIds } }] } });
    await prisma.ravellaItem.deleteMany({ where });
    await prisma.ravellaCategory.deleteMany({ where: reset ? {} : { id: { in: demoIds } } });
    console.log(reset ? "🧹 butun katalog tozalandi" : `🧹 ${demoIds.length} ta [DEMO] kategoriya o'chirildi`);
  }

  for (const cat of CATALOGUE) {
    let catRow = await prisma.ravellaCategory.findFirst({ where: { name: cat.name } });
    if (!catRow) {
      const r = await svc.adminCreateCategory({ name: cat.name, emoji: cat.emoji });
      catRow = await prisma.ravellaCategory.findUnique({ where: { id: r.id! } });
      console.log(`📂 kategoriya: ${cat.emoji} ${cat.name} (#${catRow!.id})`);
    }
    const categoryId = catRow!.id;

    for (const [idx, it] of cat.items.entries()) {
      let itemRow = await prisma.ravellaItem.findFirst({ where: { name: it.name, categoryId } });
      if (!itemRow) {
        const r = await svc.adminCreateItem({ categoryId, name: it.name, basePriceSom: it.priceSom, desc: it.desc });
        itemRow = await prisma.ravellaItem.findUnique({ where: { id: r.id! } });
        console.log(`  🎭 ${it.name} — ${it.priceSom.toLocaleString("ru-RU")} so'm (#${itemRow!.id})`);
      } else {
        console.log(`  ↻ ${it.name} allaqachon bor (#${itemRow.id}) — narx TEGILMADI`);
      }
      // rasm hali yo'q bo'lishi mumkin (hamkor botdan yuklaydi) — bu xato emas
      const buf = it.photo ? photoBuf(it.photo) : null;
      if (buf) await svc.uploadRavellaItemPhoto(itemRow!.id, buf, "image/jpeg");
      await svc.adminEditItem(itemRow!.id, { active: true, sortOrder: idx }); // ega bergan tartib

      for (const a of it.addons ?? []) {
        let addonRow = await prisma.ravellaAddon.findFirst({ where: { name: a.name, itemId: itemRow!.id } });
        if (!addonRow) {
          const r = await svc.adminCreateAddon({ itemId: itemRow!.id, name: a.name, priceSom: a.priceSom, maxQty: a.maxQty ?? 3 });
          addonRow = await prisma.ravellaAddon.findUnique({ where: { id: r.id! } });
          console.log(`     ➕ ${a.name} +${a.priceSom.toLocaleString("ru-RU")}${a.photo ? " (o'z rasmi bilan)" : ""}`);
        }
        if (a.photo) {
          const ab = photoBuf(a.photo);
          if (ab) await svc.uploadRavellaAddonPhoto(addonRow!.id, ab, "image/jpeg");
        }
      }
    }

    for (const a of cat.addons ?? []) {
      const exists = await prisma.ravellaAddon.findFirst({ where: { name: a.name, categoryId } });
      if (!exists) {
        await svc.adminCreateAddon({ categoryId, name: a.name, priceSom: a.priceSom, maxQty: a.maxQty ?? 3 });
        console.log(`     ➕ (kategoriya) ${a.name} +${a.priceSom.toLocaleString("ru-RU")}`);
      }
    }
  }

  const preview = await svc.getRavellaCatalog(true);
  console.log(`\n✅ katalog: ${preview.categories.length} kategoriya, ${preview.categories.reduce((s, c) => s + c.items.length, 0)} bezak · chegirma ${preview.discountPct}% · cashback ${preview.cashbackPct}%`);
  for (const c of preview.categories) {
    for (const i of c.items) {
      const d = await svc.getRavellaItemDetail(i.id, true);
      console.log(`   ${c.emoji} ${i.name} — ${i.basePriceSom.toLocaleString("ru-RU")} so'm · rasm:${i.hasPhoto ? "bor" : "YO'Q"} · qo'shimcha:${d.addons.length}`);
    }
  }
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
