// 🖨 Launch tool: print-ready QR stickers for EVERY driver (one per car). Each sticker = the driver's
// drv_ recruit QR — a client who scans it gets a FREE first ride, the driver earns 500 + revshare.
// Output: 1067_driver_qr_stickers.html at the repo root → open in a browser → Print → Save as PDF.
//   pnpm --filter @t1067/server exec tsx src/scripts/genDriverStickers.ts
import "../env";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import QR from "qrcode";
import { formatNumber } from "@t1067/shared";
import { prisma } from "../db";
import { driverQrLink } from "../services/recruitService";
import { getBonusEcon } from "../services/bonusConfig";
import { repoRoot } from "../env";

async function main(): Promise<void> {
  const econ = await getBonusEcon();
  const clientReward = formatNumber(econ.firstRide ?? 5000); // the SCANNER (client) gets this
  const driverBonus = formatNumber(econ.recruitFirst ?? 2000); // the driver who owns the sticker earns this
  const drivers = await prisma.member.findMany({
    where: { type: "driver" },
    select: { id: true, fullName: true, carNumber: true },
    orderBy: { fullName: "asc" },
  });
  const cards: string[] = [];
  for (const d of drivers) {
    const qr = await QR.toDataURL(driverQrLink(d.id), { width: 320, margin: 1 });
    cards.push(
      `<div class="card">` +
        `<div class="top"><b>1067</b> TAXI 🚖</div>` +
        `<div class="amt">🎁 ${clientReward} so'm <b>SOVG'A</b> — sizga</div>` +
        `<div class="qrwrap"><img src="${qr}" alt="QR"/></div>` +
        `<div class="scan">📲 SKANERLANG — taksi chaqiring</div>` +
        (d.carNumber ? `<div class="car">🚕 ${d.carNumber}</div>` : "") +
        `<div class="foot">🚖 Haydovchiga <b>+${driverBonus}</b> bonus</div>` +
      `</div>`,
    );
  }
  // 8 stickers per A4 page (2 columns × 4 rows) — chunk into pages with a hard break
  const pages: string[] = [];
  for (let i = 0; i < cards.length; i += 8) pages.push(`<div class="page">${cards.slice(i, i + 8).join("")}</div>`);
  const html =
    `<!doctype html><html><head><meta charset="utf-8"><title>1067 — haydovchi QR stikerlar</title><style>` +
    `@page{margin:6mm}*{box-sizing:border-box}` +
    `body{font-family:Arial,Helvetica,sans-serif;margin:0;color:#1a1205;-webkit-print-color-adjust:exact;print-color-adjust:exact}` +
    `.page{display:grid;grid-template-columns:repeat(2,1fr);gap:4mm;page-break-after:always}` +
    `.page:last-child{page-break-after:auto}` +
    `.card{border:2px solid #e3b81f;border-radius:12px;overflow:hidden;text-align:center;page-break-inside:avoid;background:#fff}` +
    `.top{background:#1a1205;color:#ffce3a;font-weight:800;font-size:13px;letter-spacing:1px;padding:4px 0}` +
    `.top b{color:#ffd24d}` +
    `.amt{font-size:13px;font-weight:700;color:#b8860b;margin:5px 4px 2px}.amt b{font-size:15px;color:#1a1205}` +
    `.qrwrap{padding:1px}.card img{width:35mm;height:35mm}` +
    `.scan{font-size:11px;font-weight:800;letter-spacing:.2px;margin:1px 0 5px}` +
    `.car{display:inline-block;padding:2px 12px;border-radius:7px;background:#fff4cf;border:1px solid #e3c34d;font-weight:800;font-size:15px;letter-spacing:.8px;color:#5a4300}` +
    `.foot{margin-top:6px;background:#0a7d3c;color:#fff;font-size:11px;font-weight:700;padding:4px 4px;line-height:1.3}` +
    `.foot b{color:#ffe08a}` +
    `</style></head><body>${pages.join("")}</body></html>`;
  const out = resolve(repoRoot, "1067_driver_qr_stickers.html");
  writeFileSync(out, html, "utf-8");
  console.log(`✅ ${drivers.length} ta stiker → ${out}\n   Mijoz 5000, haydovchi ${driverBonus} bonus. Print → PDF.`);
  await prisma.$disconnect();
}
main();
