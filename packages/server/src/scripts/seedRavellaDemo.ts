// 🎀 Ravella DEMO seed (ega so'radi 2026-07-27: "test kategoriya va bezak qo'shib ko'r").
// Nima qiladi: 1 kategoriya + 1 bezak + 2 qo'shimcha, HAR BIRIGA o'z rasmi bilan — shunda
// konstruktordagi "qo'shimcha qo'shilsa katta rasm SHUNGA o'tadi" xatti-harakati ko'z bilan
// tekshiriladi. Rasmlar shu yerda GENERATSIYA qilinadi (tashqi kutubxona yo'q) — ega o'z
// rasmlarini yuklagach ular ustiga yozadi.
//
// XAVFSIZLIK: bu jonli bazaga yozadi, LEKIN `ravella` flagi DARK bo'lgani uchun mijozlar hech
// nima ko'rmaydi (faqat ega owner-preview'da ko'radi). Tozalash: `tsx seedRavellaDemo.ts --clean`.
import { deflateSync } from "node:zlib";

const TAG = "[DEMO]"; // nomlarda qoladi — ega qaysi satr test ekanini bir qarashda ko'radi

// ── minimal PNG yozuvchi (RGB, filtr 0) ─────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** px(x,y) → [r,g,b]. Kichik o'lchamlar yetarli — bu vaqtinchalik demo rasmlari. */
function makePng(w: number, h: number, px: (x: number, y: number) => [number, number, number]): Buffer {
  const raw = Buffer.alloc(h * (1 + w * 3));
  let o = 0;
  for (let y = 0; y < h; y++) {
    raw[o++] = 0; // filtr turi: None
    for (let x = 0; x < w; x++) {
      const [r, g, b] = px(x, y);
      raw[o++] = r; raw[o++] = g; raw[o++] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // colour type: truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const INK: [number, number, number] = [11, 11, 13];      // brend qora fon
const AMBER: [number, number, number] = [249, 190, 62];  // brend amber

const W = 640, H = 480;
const inRect = (x: number, y: number, rx: number, ry: number, rw: number, rh: number): boolean =>
  x >= rx && x < rx + rw && y >= ry && y < ry + rh;
const inDisc = (x: number, y: number, cx: number, cy: number, r: number): boolean =>
  (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

/** Asosiy bezak: qora sahna + amber "yozuv" chizig'i (harflar o'rniga blok — demo). */
const baseArt = (x: number, y: number): [number, number, number] =>
  inRect(x, y, 120, 200, 400, 60) || inRect(x, y, 150, 275, 340, 14) ? AMBER : INK;

/** «Salyut qo'shilgan» holat: aynan shu sahna + tepada portlash nurlari. */
const salutArt = (x: number, y: number): [number, number, number] => {
  if (baseArt(x, y) === AMBER) return AMBER;
  const cx = 320, cy = 110;
  if (inDisc(x, y, cx, cy, 16)) return AMBER;
  for (let a = 0; a < 12; a++) {
    const rad = (a * Math.PI) / 6;
    for (let d = 24; d < 78; d += 2) {
      if (inDisc(x, y, Math.round(cx + Math.cos(rad) * d), Math.round(cy + Math.sin(rad) * d), 3)) return AMBER;
    }
  }
  return INK;
};

/** «Sharlar qo'shilgan» holat: shu sahna + yon tomonlarda sharlar. */
const sharArt = (x: number, y: number): [number, number, number] => {
  if (baseArt(x, y) === AMBER) return AMBER;
  for (const [cx, cy, r] of [[70, 150, 38], [570, 150, 38], [90, 330, 26], [550, 330, 26]] as const) {
    if (inDisc(x, y, cx, cy, r)) return AMBER;
  }
  return INK;
};

async function main(): Promise<void> {
  const { prisma } = await import("../db");
  const svc = await import("../services/ravellaService");
  const clean = process.argv.includes("--clean");

  const cats = await prisma.ravellaCategory.findMany({ where: { name: { contains: TAG } }, select: { id: true } });
  const catIds = cats.map((c) => c.id);
  const items = await prisma.ravellaItem.findMany({ where: { categoryId: { in: catIds } }, select: { id: true } });
  const itemIds = items.map((i) => i.id);
  if (catIds.length) {
    await prisma.ravellaAddon.deleteMany({ where: { OR: [{ itemId: { in: itemIds } }, { categoryId: { in: catIds } }] } });
    await prisma.ravellaItem.deleteMany({ where: { id: { in: itemIds } } });
    await prisma.ravellaCategory.deleteMany({ where: { id: { in: catIds } } });
    console.log(`🧹 eski demo tozalandi: ${catIds.length} kategoriya, ${itemIds.length} bezak`);
  }
  if (clean) {
    await prisma.$disconnect();
    console.log("✅ tozalash tugadi (buyurtma TARIXI tegilmadi — narx/nom snapshot bilan saqlanadi)");
    return;
  }

  const cat = await svc.adminCreateCategory({ name: `Saxna bezaklari ${TAG}`, emoji: "🎭", sortOrder: 0 });
  if (!cat.ok || !cat.id) throw new Error("kategoriya yaratilmadi");

  const item = await svc.adminCreateItem({
    categoryId: cat.id,
    name: `«Onajon» yozuvi ${TAG}`,
    basePriceSom: 100_000,
    desc: "Namuna bezak — ega o'z rasmi va narxini qo'yadi",
  });
  if (!item.ok || !item.id) throw new Error("bezak yaratilmadi");
  await svc.uploadRavellaItemPhoto(item.id, makePng(W, H, baseArt), "image/png");
  await svc.adminEditItem(item.id, { active: true }); // katalogda ko'rinsin (flag hali DARK)

  const salut = await svc.adminCreateAddon({ itemId: item.id, name: "Salyut", priceSom: 150_000, maxQty: 3, sortOrder: 0 });
  if (salut.ok && salut.id) await svc.uploadRavellaAddonPhoto(salut.id, makePng(W, H, salutArt), "image/png");

  const shar = await svc.adminCreateAddon({ itemId: item.id, name: "Sharlar", priceSom: 50_000, maxQty: 5, sortOrder: 1 });
  if (shar.ok && shar.id) await svc.uploadRavellaAddonPhoto(shar.id, makePng(W, H, sharArt), "image/png");

  // isbot: ega ko'radigan katalog (preview=true — flag DARK bo'lsa ham)
  const preview = await svc.getRavellaCatalog(true);
  const detail = await svc.getRavellaItemDetail(item.id, true);
  console.log(`✅ kategoriya #${cat.id} · bezak #${item.id} · qo'shimchalar: ${detail.addons.map((a) => `${a.name}(#${a.id}, rasm:${a.hasPhoto ? "bor" : "yo'q"})`).join(", ")}`);
  console.log(`   katalogda: ${preview.categories.length} kategoriya, ${preview.categories[0]?.items.length ?? 0} bezak · chegirma ${preview.discountPct}% · cashback ${preview.cashbackPct}%`);
  console.log(`   rasm manzillari: /api/ravella/photo/${item.id} · /api/ravella/addon-photo/${salut.id} · /api/ravella/addon-photo/${shar.id}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
