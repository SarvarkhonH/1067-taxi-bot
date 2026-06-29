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
        `<div class="row">` +
          `<img class="qr" src="${qr}" alt="QR"/>` +
          `<div class="info">` +
            `<div class="top"><b>1067</b> TAXI 🚖</div>` +
            `<div class="amt">🎁 ${clientReward} so'm <b>SOVG'A</b></div>` +
            `<div class="scan">📲 SKANERLANG — chaqiring</div>` +
            (d.carNumber ? `<div class="car">🚕 ${d.carNumber}</div>` : "") +
          `</div>` +
        `</div>` +
        `<div class="foot">🚖 Haydovchiga <b>+${driverBonus}</b> bonus · har safardan cashback 💸</div>` +
      `</div>`,
    );
  }
  // 10 stickers per A4 page (2 columns × 5 rows, horizontal cards) — hard page break per chunk
  const pages: string[] = [];
  for (let i = 0; i < cards.length; i += 10) pages.push(`<div class="page">${cards.slice(i, i + 10).join("")}</div>`);
  const html =
    `<!doctype html><html><head><meta charset="utf-8"><title>1067 — haydovchi QR stikerlar</title><style>` +
    `@page{margin:6mm}*{box-sizing:border-box}` +
    `body{font-family:Arial,Helvetica,sans-serif;margin:0;color:#1a1205;-webkit-print-color-adjust:exact;print-color-adjust:exact}` +
    `.page{display:grid;grid-template-columns:repeat(2,1fr);gap:4mm;page-break-after:always}` +
    `.page:last-child{page-break-after:auto}` +
    `.card{border:2px solid #e3b81f;border-radius:12px;overflow:hidden;page-break-inside:avoid;background:#fff}` +
    `.row{display:flex;align-items:center;gap:7px;padding:5px 7px}` +
    `.qr{width:36mm;height:36mm;flex:0 0 auto}` +
    `.info{flex:1;min-width:0;text-align:center}` +
    `.top{font-weight:800;color:#1a1205;font-size:13px;letter-spacing:.5px}.top b{color:#c79200}` +
    `.amt{font-size:13px;font-weight:700;color:#b8860b;margin:3px 0}.amt b{font-size:15px;color:#1a1205}` +
    `.scan{font-size:11px;font-weight:800;margin-bottom:4px}` +
    `.car{display:inline-block;padding:2px 12px;border-radius:7px;background:#fff4cf;border:1px solid #e3c34d;font-weight:800;font-size:15px;letter-spacing:.8px;color:#5a4300}` +
    `.foot{background:#0a7d3c;color:#fff;font-size:11px;font-weight:700;padding:4px;text-align:center;line-height:1.3}` +
    `.foot b{color:#ffe08a}` +
    `</style></head><body>${pages.join("")}</body></html>`;
  const out = resolve(repoRoot, "1067_driver_qr_stickers.html");
  writeFileSync(out, html, "utf-8");
  console.log(`✅ ${drivers.length} ta stiker → ${out}\n   Mijoz 5000, haydovchi ${driverBonus} bonus. Print → PDF.`);
  await prisma.$disconnect();
}
main();
