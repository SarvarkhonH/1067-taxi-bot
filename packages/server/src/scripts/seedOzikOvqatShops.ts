// 🧺 4 OZIQ-OVQAT DO'KONI + 225 MAHSULOT (ega buyrug'i, 2026-07-28)
//
// NIMA QILADI: `lib/foodCatalog.ts` dagi ro'yxatni bazaga yozadi — har mahsulot rasmi bilan
// (`lib/foodArt.ts` chizadi, `photoUrl` ga data-URL bo'lib tushadi).
//
// XAVFSIZLIK (ega qarori: «narxlarni menga qoldir»):
//   · Mahsulotlar `active: false` yaratiladi → `listProducts` faqat `active && stock>0` beradi,
//     ya'ni NARX TASDIQLANMAGUNCHA MIJOZ HECH NARSANI KO'RMAYDI (ega admin-ko'rikda ko'radi).
//   · Do'konlar ham `active: false` — bo'sh do'kon vitrinada osilib qolmaydi.
//   · Narxlar TAXMINIY; ega admin panelda to'g'rilaydi, keyin `--publish` hammasini yoqadi.
//
// IDEMPOTENT: kalit = (shopId, name, unit). Ikkinchi marta yugurtirilsa "yangi=0 · yangilandi=0".
// EGA QO'LDA O'ZGARTIRGAN NARX QAYTA YOZILMAYDI: `priceTanga` faqat mahsulot YARATILGANDA
// qo'yiladi (yangilashda tegilmaydi) — aks holda skript egadan keyin narxni orqaga tiklab qo'yardi.
//
// Yugurtirish (VPS'da, CLAUDE.md deploy bo'limi):
//   cd /opt/app/packages/server
//   npx dotenv -e ../../.env -- npx tsx src/scripts/seedOzikOvqatShops.ts            # DRY-RUN
//   npx dotenv -e ../../.env -- npx tsx src/scripts/seedOzikOvqatShops.ts --apply    # yozish
//   npx dotenv -e ../../.env -- npx tsx src/scripts/seedOzikOvqatShops.ts --publish  # narxlar
//                                                                                   # tayyor bo'lgach yoqish
import { prisma } from "../db";
import { env } from "../env";
import { foodArtDataUrl, shopLogoDataUrl } from "./lib/foodArt";
import { PRODUCTS, SHOPS } from "./lib/foodCatalog";

const APPLY = process.argv.includes("--apply");
const PUBLISH = process.argv.includes("--publish");
const STOCK = 20; // yoqilganda darrov sotuvga tayyor bo'lsin (0 zaxira = ko'rinmaydi)

/** ega chat_id — do'kon-buyurtmalari shu yerga tushadi */
function ownerChatId(): string {
  const id = env.adminIds[0];
  if (!id) throw new Error("ADMIN_TELEGRAM_IDS bo'sh — do'kon egasiz yaratilmaydi");
  return String(id);
}

/** ega telefonini uning mavjud do'konidan olamiz (yangi raqam o'ylab topilmaydi) */
async function ownerPhone(chatId: string): Promise<string> {
  const mine = await prisma.marketShop.findFirst({ where: { ownerChatId: chatId }, select: { phone: true } });
  const phone = mine?.phone?.trim();
  if (!phone) throw new Error("Egasining mavjud do'koni topilmadi — telefon raqamini qo'lda kiriting");
  return phone;
}

async function main(): Promise<void> {
  console.log(`— seedOzikOvqatShops ${PUBLISH ? "PUBLISH" : APPLY ? "APPLY" : "DRY-RUN"} —`);
  const chatId = ownerChatId();
  const phone = await ownerPhone(chatId);
  console.log(`ega: chat_id=${chatId} · tel=${phone}`);

  // ── 1) do'konlar ───────────────────────────────────────────────────────────────────────────
  const shopIdByKey = new Map<string, number>();
  let shopNew = 0, shopUpd = 0;
  for (const s of SHOPS) {
    const logo = shopLogoDataUrl(s.logo.kind, s.logo.c1, s.logo.c2);
    const data = {
      name: s.name, category: s.category, phone, workHours: s.workHours,
      deliveryText: s.deliveryText, deliveryFeeSom: s.deliveryFeeSom, minOrderTanga: s.minOrderTanga,
      ownerChatId: chatId, photoUrl: logo, photoFileId: null, story: s.story,
      announcement: s.announcement, announcementAt: new Date(), shopKind: "bozor",
      sortOrder: s.sortOrder, paused: false,
    };
    const exist = await prisma.marketShop.findFirst({ where: { name: s.name } });
    if (!exist) {
      console.log(`+ do'kon «${s.name}» (o'chiq holatda)`);
      if (APPLY || PUBLISH) {
        const created = await prisma.marketShop.create({ data: { ...data, active: PUBLISH } });
        shopIdByKey.set(s.key, created.id);
      }
      shopNew++;
      continue;
    }
    shopIdByKey.set(s.key, exist.id);
    console.log(`~ do'kon «${s.name}» #${exist.id} yangilanadi${PUBLISH ? " + YOQILADI" : ""}`);
    if (APPLY || PUBLISH) {
      await prisma.marketShop.update({ where: { id: exist.id }, data: PUBLISH ? { ...data, active: true } : data });
    }
    shopUpd++;
  }

  // ── 2) mahsulotlar ─────────────────────────────────────────────────────────────────────────
  let pNew = 0, pUpd = 0, pSame = 0, pOn = 0;
  for (const [i, p] of PRODUCTS.entries()) {
    const shopId = shopIdByKey.get(p.shop);
    if (!shopId) { // DRY-RUN'da do'kon hali yo'q — mahsulotni faqat sanaymiz
      pNew++;
      continue;
    }
    const photoUrl = foodArtDataUrl(p.art);
    const exist = await prisma.product.findFirst({ where: { shopId, name: p.name, unit: p.unit } });
    if (!exist) {
      if (APPLY || PUBLISH) {
        await prisma.product.create({
          data: {
            shopId, name: p.name, category: p.cat, unit: p.unit, brand: p.brand ?? null,
            description: p.desc ?? null, priceTanga: p.price, stock: STOCK, photoUrl,
            active: PUBLISH, sortOrder: i,
          },
        });
      }
      pNew++;
      continue;
    }
    // NARX TEGILMAYDI — ega tahrirlagan bo'lishi mumkin
    const next = {
      category: p.cat, unit: p.unit, brand: p.brand ?? exist.brand, photoUrl,
      sortOrder: i, ...(PUBLISH ? { active: true, stock: exist.stock > 0 ? exist.stock : STOCK } : {}),
    };
    const changed =
      exist.category !== next.category || exist.unit !== next.unit || exist.photoUrl !== photoUrl ||
      exist.sortOrder !== i || (PUBLISH && !exist.active);
    if (!changed) { pSame++; continue; }
    if (APPLY || PUBLISH) await prisma.product.update({ where: { id: exist.id }, data: next });
    if (PUBLISH && !exist.active) pOn++;
    pUpd++;
  }

  // ── 3) hisobot ─────────────────────────────────────────────────────────────────────────────
  console.log(`\ndo'kon: yangi=${shopNew} · yangilandi=${shopUpd}`);
  console.log(`mahsulot: yangi=${pNew} · yangilandi=${pUpd} · o'zgarmadi=${pSame}${PUBLISH ? ` · yoqildi=${pOn}` : ""}`);
  for (const s of SHOPS) {
    const list = PRODUCTS.filter((x) => x.shop === s.key);
    console.log(`  · ${s.name}: ${list.length} mahsulot / ${new Set(list.map((x) => x.cat)).size} kategoriya`);
  }
  if (APPLY || PUBLISH) {
    const ids = [...shopIdByKey.values()];
    const live = await prisma.product.groupBy({ by: ["shopId"], where: { shopId: { in: ids } }, _count: true });
    const on = await prisma.product.count({ where: { shopId: { in: ids }, active: true, stock: { gt: 0 } } });
    console.log(`\nISBOT — bazada: ${live.map((r) => `#${r.shopId}=${r._count}`).join(" · ")} · mijozga ko'rinadigan (active+stock>0): ${on}`);
  }
  if (!APPLY && !PUBLISH) console.log("\n(DRY-RUN — hech narsa yozilmadi. Yozish: --apply)");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exitCode = 1;
});
