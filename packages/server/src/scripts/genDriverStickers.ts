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
        `<div class="hd">🚖 1067 TAXI</div>` +
        (d.carNumber ? `<div class="car">${d.carNumber}</div>` : "") +
        `<img src="${qr}" alt="QR"/>` +
        `<div class="big">📲 SKANERLANG → <b>${clientReward} tanga OLING!</b></div>` +
        `<div class="sub">🎁 Birinchi safaringiz <b>BEPUL</b> · har safardan cashback</div>` +
        `<div class="drv">🚖 Haydovchiga <b>+${driverBonus} bonus</b></div>` +
      `</div>`,
    );
  }
  const html =
    `<!doctype html><html><head><meta charset="utf-8"><title>1067 — haydovchi QR stikerlar</title><style>` +
    `@page{margin:8mm}body{font-family:Arial,Helvetica,sans-serif;margin:0;color:#111}` +
    `.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:6mm;padding:6mm}` +
    `.card{border:2px dashed #c9a93a;border-radius:14px;padding:10px 8px 12px;text-align:center;page-break-inside:avoid}` +
    `.hd{font-weight:800;color:#c79200;font-size:15px;letter-spacing:.5px}` +
    `.car{display:inline-block;margin:5px 0 2px;padding:3px 14px;border-radius:8px;background:#fff4cf;border:1px solid #e3c34d;font-weight:800;font-size:19px;letter-spacing:1px;color:#5a4300}` +
    `.card img{width:54mm;height:54mm;margin:3px 0}` +
    `.big{font-size:15px;font-weight:800;color:#b8860b;line-height:1.3}` +
    `.sub{font-size:12px;color:#333;margin-top:3px;line-height:1.4}` +
    `.drv{font-size:13px;font-weight:700;color:#0a7d3c;margin-top:5px}` +
    `</style></head><body><div class="grid">${cards.join("")}</div></body></html>`;
  const out = resolve(repoRoot, "1067_driver_qr_stickers.html");
  writeFileSync(out, html, "utf-8");
  console.log(`✅ ${drivers.length} ta stiker → ${out}\n   Mijoz 5000, haydovchi ${driverBonus} bonus. Print → PDF.`);
  await prisma.$disconnect();
}
main();
