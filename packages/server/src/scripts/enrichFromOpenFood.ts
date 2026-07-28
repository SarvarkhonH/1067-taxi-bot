// 🌍 Barkodi bor mahsulotlarni Open Food Facts'dan to'ldirish (ega so'rovi, 2026-07-28).
//
// NIMA QILADI: `barcode` to'ldirilgan, lekin brend/hajm yoki RASMI yo'q mahsulotlarni OFF'dan
// boyitadi. Faqat BO'SH maydon to'ldiriladi — sotuvchi qo'lda yozgan qiymat HECH QACHON
// ustidan yozilmaydi.
//
// ⚠️ QAMROV: OFF xalqaro brendlarni biladi (Coca-Cola, Nestlé, Mars…), MAHALLIY o'zbek
// mahsulotlarini (4870… prefiks) deyarli bilmaydi. Ya'ni bu skript katalogning IMPORT qismini
// to'ldiradi, mahalliy non/sut/go'sht uchun baribir o'z fotolaringiz kerak.
//
// ODOB: OFF bepul va ommaviy — so'rovlar orasida pauza qo'yilgan, bir yugurishda 60 tadan
// oshmaydi. Default DRY-RUN.
// Yozish: npx dotenv -e ../../.env -- npx tsx src/scripts/enrichFromOpenFood.ts --apply
import { prisma } from "../db";
import { lookupBarcode, fetchOffImage } from "../services/openFoodService";
import { uploadProductPhoto } from "../services/shopService";

const APPLY = process.argv.includes("--apply");
const LIMIT = 60;
const GAP_MS = 900; // OFF'ga hurmat: sekundiga ~1 so'rov

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  console.log(`— enrichFromOpenFood ${APPLY ? "APPLY" : "DRY-RUN"} —`);
  const rows = await prisma.product.findMany({
    where: { barcode: { not: null }, active: true },
    select: { id: true, name: true, barcode: true, brand: true, unit: true, photoFileId: true, photoUrl: true, photoCredit: true },
    take: LIMIT,
    orderBy: { id: "desc" },
  });
  console.log(`barkodi bor faol mahsulot: ${rows.length} (chegara ${LIMIT})`);
  if (!rows.length) { console.log("Barkod kiritilgan mahsulot yo'q — avval sotuvchi barkodlarni kiritsin."); await prisma.$disconnect(); return; }

  let found = 0, filled = 0, photos = 0, miss = 0;
  for (const p of rows) {
    const off = await lookupBarcode(p.barcode!);
    await sleep(GAP_MS);
    if (!off) { miss++; console.log(`  ✖ ${p.barcode} «${p.name.slice(0, 30)}» — OFF'da yo'q`); continue; }
    found++;
    const patch: { brand?: string; unit?: string } = {};
    if (!p.brand && off.brand) patch.brand = off.brand.slice(0, 40);
    if (!p.unit && off.unit) patch.unit = off.unit.slice(0, 24);
    const needPhoto = !p.photoFileId && !p.photoUrl && !!off.imageUrl;
    console.log(`  ✔ ${p.barcode} «${p.name.slice(0, 28)}» → ${off.name ?? "?"} · brend=${off.brand ?? "-"} · hajm=${off.unit ?? "-"} · rasm=${off.imageUrl ? "bor" : "yo'q"}${Object.keys(patch).length ? ` · to'ldiriladi: ${Object.keys(patch).join(",")}` : ""}${needPhoto ? " · RASM QO'SHILADI" : ""}`);
    if (!APPLY) continue;
    if (Object.keys(patch).length) { await prisma.product.update({ where: { id: p.id }, data: patch }).catch(() => undefined); filled++; }
    if (needPhoto) {
      const img = await fetchOffImage(off.imageUrl!);
      if (img) {
        const r = await uploadProductPhoto(p.id, img.buf, img.mime).catch(() => ({ ok: false }));
        if ((r as { ok: boolean }).ok) {
          photos++;
          await prisma.product.update({ where: { id: p.id }, data: { photoCredit: off.credit } }).catch(() => undefined);
        }
      }
      await sleep(GAP_MS);
    }
  }
  console.log(`\nISBOT: OFF'da topildi=${found} · topilmadi=${miss} · maydon to'ldirildi=${filled} · rasm qo'shildi=${photos}`);
  if (!APPLY) console.log("(DRY-RUN — hech narsa yozilmadi. Yozish: --apply)");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
