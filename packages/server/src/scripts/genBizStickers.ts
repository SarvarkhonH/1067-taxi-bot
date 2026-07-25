// 🖨 SOTUV VOSITASI: biznes eshigiga yopishtiriladigan QR stiker. Skanerlagan odam to'g'ridan-
// to'g'ri SHU biznesning BirJoy kartasiga tushadi (mavjud `svc_<id>` deep-link, bot.ts:303).
// Ikki tomonlama foyda: (a) biznesga bepul sovg'a — sotuvda "sizga stiker ham beramiz" deb
// aytiladi, (b) biznesning O'Z mijozi ilovaga kiradi (teskari oqim — bizga yangi foydalanuvchi).
// Naqsh: genDriverStickers.ts (o'sha QR + chop-etsa bo'ladigan HTML tartibi).
//
// Yugurtirish (hammasi):      tsx src/scripts/genBizStickers.ts
// Faqat tanlanganlar uchun:   tsx src/scripts/genBizStickers.ts --ids=25,69,81
// Faqat qo'ng'iroq olganlar:  tsx src/scripts/genBizStickers.ts --proof
import "../env";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import QR from "qrcode";
import { prisma } from "../db";
import { repoRoot } from "../env";

function bizQrLink(listingId: number): string {
  const user = process.env.BOT_USERNAME || "koson1067bot";
  return `https://t.me/${user}?start=svc_${listingId}`;
}

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function main(): Promise<void> {
  const idsArg = process.argv.find((a) => a.startsWith("--ids="))?.split("=")[1];
  const proofOnly = process.argv.includes("--proof");
  const ids = idsArg ? idsArg.split(",").map((s) => Number(s.trim())).filter(Number.isFinite) : null;

  const listings = await prisma.serviceListing.findMany({
    where: {
      status: "active",
      ...(ids ? { id: { in: ids } } : {}),
      ...(proofOnly ? { callCount: { gt: 0 } } : {}),
    },
    orderBy: [{ callCount: "desc" }, { viewCount: "desc" }],
    select: { id: true, name: true, phone: true, callCount: true },
  });
  if (!listings.length) {
    console.log("⚠️  Mos e'lon topilmadi (--ids / --proof filtrini tekshiring).");
    await prisma.$disconnect();
    return;
  }

  const cards: string[] = [];
  for (const l of listings) {
    const qr = await QR.toDataURL(bizQrLink(l.id), { width: 320, margin: 1 });
    cards.push(
      `<div class="card">` +
        `<div class="head">BirJoy'da bizni toping</div>` +
        `<div class="row">` +
          `<img class="qr" src="${qr}" alt="QR"/>` +
          `<div class="info">` +
            `<div class="biz">${esc(l.name)}</div>` +
            `<div class="scan">📲 Skanerlang</div>` +
            `<div class="sub">Narx · ish vaqti · sharhlar<br/>bir bosishda qo'ng'iroq</div>` +
          `</div>` +
        `</div>` +
        `<div class="foot">🚕 <b>BirJoy</b> — Koson taksi va bozori</div>` +
      `</div>`,
    );
  }
  // 8 ta stiker / A4 (2 ustun × 4 qator) — har sahifadan keyin qat'iy sahifa-uzilishi
  const pages: string[] = [];
  for (let i = 0; i < cards.length; i += 8) pages.push(`<div class="page">${cards.slice(i, i + 8).join("")}</div>`);
  const html =
    `<!doctype html><html><head><meta charset="utf-8"><title>BirJoy — biznes QR stikerlar</title><style>` +
    `@page{margin:6mm}*{box-sizing:border-box}` +
    `body{font-family:Arial,Helvetica,sans-serif;margin:0;color:#12261d;-webkit-print-color-adjust:exact;print-color-adjust:exact}` +
    `.page{display:grid;grid-template-columns:repeat(2,1fr);gap:4mm;page-break-after:always}` +
    `.page:last-child{page-break-after:auto}` +
    `.card{border:2px solid #0d9668;border-radius:12px;overflow:hidden;page-break-inside:avoid;background:#fff}` +
    `.head{background:linear-gradient(120deg,#0d9668,#059669);color:#fff;font-size:12px;font-weight:800;text-align:center;padding:4px;letter-spacing:.3px}` +
    `.row{display:flex;align-items:center;gap:8px;padding:7px}` +
    `.qr{width:34mm;height:34mm;flex:0 0 auto}` +
    `.info{flex:1;min-width:0;text-align:center}` +
    `.biz{font-size:14px;font-weight:800;line-height:1.2;margin-bottom:5px;word-break:break-word}` +
    `.scan{font-size:12px;font-weight:800;color:#0d9668;margin-bottom:4px}` +
    `.sub{font-size:10px;color:#5b6f66;line-height:1.35}` +
    `.foot{background:#12261d;color:#fff;font-size:10px;font-weight:700;padding:4px;text-align:center}` +
    `.foot b{color:#5eead4}` +
    `</style></head><body>${pages.join("")}</body></html>`;

  const out = resolve(repoRoot, "birjoy_biz_qr_stickers.html");
  writeFileSync(out, html, "utf-8");
  console.log(`✅ ${listings.length} ta stiker → ${out}`);
  console.log(`   Brauzerda oching → Print → PDF saqlang → chop eting → biznes eshigiga eltib bering.`);
  if (proofOnly) console.log(`   (--proof: faqat qo'ng'iroq olgan bizneslar — iqtibos so'raganda sovg'a qilib bering)`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
