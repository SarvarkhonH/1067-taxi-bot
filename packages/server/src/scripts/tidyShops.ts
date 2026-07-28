// 🏬 Do'konlarni tartibga solish (ega so'rovi, 2026-07-28):
//   1) mahsuloti YO'Q do'konlarni yopish
//   2) «Amazonbabykids» → «Amazon-kids»
//   3) qolganlariga chiroyli logo (SVG, do'kon nomidan barqaror rang + monogram + turi belgisi)
//
// ⚠️ O'CHIRISH EMAS, YOPISH: `active=false`. Sabab — do'kon o'chirilsa unga bog'liq buyurtma va
// mahsulot yozuvlari "egasiz" qolardi, va ega fikridan qaytsa tiklab bo'lmasdi. Yopilgan do'kon
// mijozga KO'RINMAYDI (getMarketHome faqat active oladi) — ya'ni natija ega so'raganidek.
// Buyurtmasi bo'lgan do'kon HECH QACHON yopilmaydi (tarix buziladi).
//
// Default DRY-RUN. Yozish: npx dotenv -e ../../.env -- npx tsx src/scripts/tidyShops.ts --apply
import { prisma } from "../db";

const APPLY = process.argv.includes("--apply");

const HUES = [162, 190, 258, 22, 340, 128];
function hueOf(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return HUES[h % HUES.length]!;
}
function monogram(name: string): string {
  const w = name.replace(/[^\p{L}\p{N}\s'-]/gu, " ").split(/\s+/).filter(Boolean);
  const a = w[0]?.[0] ?? "B";
  const b = w[1]?.[0] ?? (w[0]?.[1] ?? "");
  return (a + b).toLocaleUpperCase("uz");
}

/** Do'kon turiga qarab kichik belgi — logo shunchaki harf bo'lib qolmasin. */
function glyphFor(name: string): string {
  const n = name.toLowerCase();
  const g = (body: string): string => `<g transform="translate(150 176) scale(1.6)" fill="none" stroke="rgba(255,255,255,.92)" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">${body}</g>`;
  if (/(non|shirinlik|bakery|tort)/.test(n)) return g('<path d="M-14 -4c0-6 8-9 14-9s14 3 14 9c0 3-2 4.5-4 4.5v12a3 3 0 0 1-3 3h-14a3 3 0 0 1-3-3v-12c-2 0-4-1.5-4-4.5Z"/><path d="M-5 1v14M5 1v14"/>');
  if (/(go'sht|gosht|baliq|meat|fish)/.test(n)) return g('<path d="M6 -12a10 10 0 0 1 9 14 10 10 0 0 1-13 13l-8 8a4.6 4.6 0 1 1-6.6-6.5l8-8A10 10 0 0 1 6 -12Z"/>');
  if (/(meva|sabzavot|bozor|fruit)/.test(n)) return g('<path d="M0 -6c-8-6-16 .7-16 9 0 8 6 17 11 17 2 0 3-1 5-1s2.5 1 5 1c5 0 11-9 11-17 0-8.3-8-15-16-9Z"/><path d="M0 -6v-5"/>');
  if (/(kids|bola|baby)/.test(n)) return g('<circle cx="0" cy="2" r="12"/><circle cx="-10" cy="-11" r="5"/><circle cx="10" cy="-11" r="5"/><circle cx="-4" cy="0" r="1.6" fill="rgba(255,255,255,.92)"/><circle cx="4" cy="0" r="1.6" fill="rgba(255,255,255,.92)"/><path d="M-4 7c2.5 2 5.5 2 8 0"/>');
  // umumiy: savat
  return g('<path d="M-16 -4h32l-3 20a4 4 0 0 1-4 3.5h-18a4 4 0 0 1-4-3.5Z"/><path d="M-8 -4v-6a8 8 0 0 1 16 0v6"/>');
}

function logoSvg(name: string): string {
  const h = hueOf(name);
  const mono = monogram(name);
  const fontSize = mono.length > 2 ? 96 : 118;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">
<defs>
<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="hsl(${h} 62% 42%)"/><stop offset="0.58" stop-color="hsl(${h} 68% 26%)"/><stop offset="1" stop-color="hsl(${(h + 38) % 360} 70% 46%)"/>
</linearGradient>
<radialGradient id="s" cx="0.3" cy="0.2" r="0.9">
<stop offset="0" stop-color="rgba(255,255,255,.28)"/><stop offset="1" stop-color="rgba(255,255,255,0)"/>
</radialGradient>
</defs>
<rect width="300" height="300" rx="64" fill="url(#g)"/>
<rect width="300" height="300" rx="64" fill="url(#s)"/>
<text x="150" y="132" text-anchor="middle" font-family="-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif" font-size="${fontSize}" font-weight="800" letter-spacing="-4" fill="#ffffff">${mono}</text>
${glyphFor(name)}
</svg>`;
}

async function main(): Promise<void> {
  console.log(`— tidyShops ${APPLY ? "APPLY" : "DRY-RUN"} —\n`);
  const shops = await prisma.marketShop.findMany({ orderBy: { id: "asc" } });
  const prod = await prisma.product.groupBy({ by: ["shopId"], _count: { _all: true } });
  const ord = await prisma.marketOrder.groupBy({ by: ["shopId"], _count: { _all: true } });
  const pCount = new Map(prod.map((x) => [x.shopId, x._count._all]));
  const oCount = new Map(ord.map((x) => [x.shopId, x._count._all]));

  // 1) bo'sh do'konlarni yopish
  let closed = 0;
  for (const s of shops) {
    const p = pCount.get(s.id) ?? 0;
    const o = oCount.get(s.id) ?? 0;
    if (p > 0 || !s.active) continue;
    if (o > 0) { console.log(`1) ⏭ #${s.id} «${s.name}» — mahsuloti yo'q, LEKIN ${o} buyurtmasi bor → tegilmadi`); continue; }
    console.log(`1) ✖ #${s.id} «${s.name}» — 0 mahsulot, 0 buyurtma → YOPILADI`);
    if (APPLY) { await prisma.marketShop.update({ where: { id: s.id }, data: { active: false } }); closed++; }
  }

  // 2) nomni o'zgartirish
  const target = shops.find((s) => s.name.toLowerCase().replace(/[^a-z]/g, "") === "amazonbabykids");
  if (target && target.name !== "Amazon-kids") {
    console.log(`\n2) ✎ #${target.id} «${target.name}» → «Amazon-kids»`);
    if (APPLY) await prisma.marketShop.update({ where: { id: target.id }, data: { name: "Amazon-kids" } });
  }

  // 3) logolar — mahsuloti bor (yoki yopilmagan) do'konlarga
  console.log("\n3) logolar:");
  let logos = 0;
  for (const s of shops) {
    const p = pCount.get(s.id) ?? 0;
    const o = oCount.get(s.id) ?? 0;
    if (p === 0 && o === 0) continue; // yopilgan do'konga logo shart emas
    const name = s.id === target?.id ? "Amazon-kids" : s.name;
    const svg = logoSvg(name);
    const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
    if (s.photoUrl === dataUrl) { console.log(`   = #${s.id} «${name}» — logo allaqachon shu`); continue; }
    console.log(`   ${s.photoFileId || s.photoUrl ? "~" : "+"} #${s.id} «${name}» → ${monogram(name)} · hue ${hueOf(name)}`);
    if (APPLY) {
      // photoFileId tozalanadi: serveMarketImage avval photoUrl'ni oladi, ikkisi birga turishi
      // keyinchalik "qaysi biri haqiqiy?" savolini tug'diradi.
      await prisma.marketShop.update({ where: { id: s.id }, data: { photoUrl: dataUrl, photoFileId: null } });
      logos++;
    }
  }

  const after = await prisma.marketShop.count({ where: { active: true } });
  console.log(`\nISBOT: yopildi=${closed} · logo=${logos} · faol do'kon qoldi=${after}`);
  if (!APPLY) console.log("(DRY-RUN — hech narsa yozilmadi. Yozish: --apply)");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
