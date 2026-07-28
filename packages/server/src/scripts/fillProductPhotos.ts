// 📷 Rasmsiz (yoki chizilgan-SVG'li) mahsulotlarga OCHIQ LITSENZIYALI rasm topib qo'yish.
//
// Ega so'radi: «rasmlarni topib yukla». Manba FAQAT ikkita ochiq baza (stockPhotoService):
// Open Food Facts (brendli qadoq) va Openverse CC0/PDM (oddiy mahsulot). Internetdan tasodifiy
// rasm OLINMAYDI — u o'zganing mulki.
//
// TARTIB: default DRY-RUN — nima topilgani jadval bo'lib chiqadi va `--json` bilan faylga
// yoziladi (ega ko'rish varag'ida ko'radi). `--apply` bo'lgandagina yuklanadi.
// Qoida: qidiruv-so'zi topilmagan mahsulot TEGILMAYDI (noto'g'ri rasmdan ko'ra rasmsiz yaxshi).
//
// Yugurtirish:
//   npx dotenv -e ../../.env -- npx tsx src/scripts/fillProductPhotos.ts --json out.json
//   npx dotenv -e ../../.env -- npx tsx src/scripts/fillProductPhotos.ts --apply
import { prisma } from "../db";
import { findPhotoFor, downloadPhoto, searchTermFor } from "../services/stockPhotoService";
import { uploadProductPhoto } from "../services/shopService";

const APPLY = process.argv.includes("--apply");
const jsonIdx = process.argv.indexOf("--json");
const JSON_OUT = jsonIdx > -1 ? process.argv[jsonIdx + 1] : null;
const limIdx = process.argv.indexOf("--limit");
const LIMIT = limIdx > -1 ? Number(process.argv[limIdx + 1]) : 250;
const GAP_MS = 700; // ochiq/bepul xizmatlarga hurmat

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const isSvg = (u?: string | null): boolean => !!u && u.startsWith("data:image/svg");

async function main(): Promise<void> {
  console.log(`— fillProductPhotos ${APPLY ? "APPLY" : "DRY-RUN"} (chegara ${LIMIT}) —`);
  const all = await prisma.product.findMany({ where: { active: true, stock: { gt: 0 } }, select: { id: true, name: true, category: true, photoUrl: true, photoFileId: true } });
  const gallery = await prisma.productPhoto.findMany({ select: { productId: true, fileId: true, url: true } });
  const hasReal = new Set(gallery.filter((g) => g.fileId || (g.url && !isSvg(g.url))).map((g) => g.productId));
  const need = all.filter((p) => !hasReal.has(p.id) && !p.photoFileId && (!p.photoUrl || isSvg(p.photoUrl))).slice(0, LIMIT);
  console.log(`rasm kerak: ${need.length} ta (jami faol ${all.length})`);

  const rows: { id: number; name: string; category: string; term: string | null; title?: string; source?: string; license?: string; url?: string }[] = [];
  let found = 0, noTerm = 0, noPhoto = 0, uploaded = 0;

  for (const p of need) {
    const t = searchTermFor(p.name);
    if (!t) { noTerm++; rows.push({ id: p.id, name: p.name, category: p.category, term: null }); continue; }
    const photo = await findPhotoFor(p.name);
    await sleep(GAP_MS);
    if (!photo) { noPhoto++; rows.push({ id: p.id, name: p.name, category: p.category, term: t.term }); continue; }
    found++;
    rows.push({ id: p.id, name: p.name, category: p.category, term: t.term, title: photo.title, source: photo.source, license: photo.license, url: photo.url });
    console.log(`  ✔ #${p.id} «${p.name.slice(0, 26)}» → [${t.term}] ${photo.source} · ${photo.title.slice(0, 40)}`);
    if (!APPLY) continue;
    const img = await downloadPhoto(photo.url);
    if (!img) { console.log(`      ⚠️ yuklab bo'lmadi`); continue; }
    const r = await uploadProductPhoto(p.id, img.buf, img.mime).catch(() => ({ ok: false }));
    if ((r as { ok: boolean }).ok) {
      uploaded++;
      await prisma.product.update({ where: { id: p.id }, data: { photoCredit: photo.credit.slice(0, 190) } }).catch(() => undefined);
    }
    await sleep(GAP_MS);
  }

  console.log(`\nISBOT: topildi=${found} · qidiruv-so'zi yo'q (tegilmadi)=${noTerm} · bazada rasm yo'q=${noPhoto} · YUKLANDI=${uploaded}`);
  if (JSON_OUT) {
    const fs = await import("node:fs/promises");
    await fs.writeFile(JSON_OUT, JSON.stringify(rows, null, 1), "utf8");
    console.log(`ro'yxat yozildi: ${JSON_OUT}`);
  }
  if (!APPLY) console.log("(DRY-RUN — hech narsa yuklanmadi. Yozish: --apply)");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
