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
    name: "Saxna va foto-zona",
    emoji: "🎭",
    items: [
      {
        name: "Bitiruv sahnasi — foto-zona",
        desc: "Bosma taxta (nomi va yili bilan), balon arkasi, figuralar. Bog'cha va maktab bitiruvlari uchun.",
        priceSom: 0,
        photo: "ish-bitiruv-sahna.jpg",
        addons: [
          // ⭐ Bu qo'shimchaning rasmi AYNAN shu zalning shift bezagi bilan olingan surati —
          // mijoz «+» bosganda sahna rasmi shu kadrga o'tadi va farqni o'z ko'zi bilan ko'radi.
          { name: "Zal shifti bezagi", priceSom: 0, maxQty: 1, photo: "ish-zal-shift.jpg" },
          { name: "Ismli banner (qo'shimcha taxta)", priceSom: 0, maxQty: 2 },
        ],
      },
      {
        name: "Sahna arkasi — oltin/oq",
        desc: "Sahna markazi uchun spiral arka. Tadbir turiga qarab rang tanlanadi.",
        priceSom: 0,
        photo: "ish-oltin-arka.jpg",
      },
      {
        name: "Premium bitiruv zali — chiroqli",
        desc: "Logotipli taxta, qora-oltin gulchambar, kapalak chiroqlari va gul lampalari bilan to'liq zal.",
        priceSom: 0,
        photo: "ish-premium-zal.jpg",
      },
    ],
  },
  {
    name: "Kirish va tashqi bezak",
    emoji: "🎈",
    items: [
      {
        name: "Kirish arkasi — bayram",
        desc: "Eshik oldi arkasi: yulduzlar, qo'ng'iroq va ustunlar bilan. 1-sentabr va bitiruv uchun.",
        priceSom: 0,
        photo: "ish-kirish-arka.jpg",
      },
      {
        name: "Bino kirishi + yo'lak gulchambari",
        desc: "Tashqi bezak: kirish arkasi va yo'lak bo'ylab osma gulchambarlar. Ochilish marosimlari uchun.",
        priceSom: 0,
        photo: "ish-bino-kirish.jpg",
      },
    ],
    // Kategoriya-bo'ylab qo'shimchalar — ikkala bezakka ham mos keladi
    addons: [
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

    for (const it of cat.items) {
      let itemRow = await prisma.ravellaItem.findFirst({ where: { name: it.name, categoryId } });
      if (!itemRow) {
        const r = await svc.adminCreateItem({ categoryId, name: it.name, basePriceSom: it.priceSom, desc: it.desc });
        itemRow = await prisma.ravellaItem.findUnique({ where: { id: r.id! } });
        console.log(`  🎭 ${it.name} — ${it.priceSom.toLocaleString("ru-RU")} so'm (#${itemRow!.id})`);
      } else {
        console.log(`  ↻ ${it.name} allaqachon bor (#${itemRow.id}) — narx TEGILMADI`);
      }
      const buf = photoBuf(it.photo);
      if (buf) await svc.uploadRavellaItemPhoto(itemRow!.id, buf, "image/jpeg");
      await svc.adminEditItem(itemRow!.id, { active: true });

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
