// 👁 KATALOG KO'RIGI (lokal, bazasiz) — ega bazaga yozishdan OLDIN ko'radi.
//
// NEGA BAZASIZ: skript faqat `lib/foodCatalog.ts` + `lib/foodArt.ts` ni o'qiydi (ikkalasi ham sof
// ma'lumot/chizma), shuning uchun VPS ham, Postgres ham kerak emas — lokal `npx tsx` bilan yuradi.
// Ega ko'rgan ro'yxat = `seedOzikOvqatShops.ts` bazaga yozadigan AYNAN o'sha ro'yxat.
//
//   npx tsx src/scripts/previewFoodCatalog.ts [chiqish.html]
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { foodArtDataUrl, shopLogoDataUrl } from "./lib/foodArt";
import { PRODUCTS, SHOPS } from "./lib/foodCatalog";

const out = resolve(process.argv[2] ?? "oziq_ovqat_katalog.html");
const som = (n: number): string => n.toLocaleString("ru-RU").replace(/ /g, " ");

const cards = (shopKey: string): string =>
  PRODUCTS.filter((p) => p.shop === shopKey)
    .map((p) => `<figure class="c">
      <img src="${foodArtDataUrl(p.art)}" alt="" loading="lazy"/>
      <figcaption>
        <span class="cat">${p.cat}</span>
        <b>${p.name}</b>
        <span class="unit">${p.unit}${p.brand ? ` · ${p.brand}` : ""}</span>
        <span class="price">${som(p.price)} so'm</span>
      </figcaption>
    </figure>`).join("");

const sections = SHOPS.map((s) => {
  const n = PRODUCTS.filter((p) => p.shop === s.key).length;
  const cats = [...new Set(PRODUCTS.filter((p) => p.shop === s.key).map((p) => p.cat))];
  return `<section>
    <header class="sh">
      <img class="logo" src="${shopLogoDataUrl(s.logo.kind, s.logo.c1, s.logo.c2)}" alt=""/>
      <div>
        <h2>${s.name}</h2>
        <p class="meta">${n} mahsulot · ${cats.length} kategoriya · ${s.workHours} · ${s.deliveryText}</p>
        <p class="meta dim">${s.story}</p>
        <p class="chips">${cats.map((c) => `<span>${c}</span>`).join("")}</p>
      </div>
    </header>
    <div class="grid">${cards(s.key)}</div>
  </section>`;
}).join("");

const html = `<!doctype html><html lang="uz"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>BirJoy — oziq-ovqat katalogi (ko'rik)</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px 16px 64px; font: 15px/1.45 -apple-system,Segoe UI,Roboto,sans-serif;
    background: #f6f8f7; color: #12211a; }
  h1 { font-size: 24px; margin: 0 0 4px; }
  .top { max-width: 1180px; margin: 0 auto 28px; }
  .top p { margin: 4px 0 0; color: #5a6b62; }
  section { max-width: 1180px; margin: 0 auto 40px; background: #fff; border: 1px solid #e3ebe6;
    border-radius: 20px; padding: 18px; }
  .sh { display: flex; gap: 16px; align-items: flex-start; margin-bottom: 16px; }
  .logo { width: 76px; height: 76px; border-radius: 20px; flex: none; }
  h2 { font-size: 19px; margin: 2px 0 4px; }
  .meta { margin: 0; font-size: 13px; color: #5a6b62; }
  .meta.dim { color: #8a9a92; margin-top: 3px; }
  .chips { margin: 8px 0 0; display: flex; flex-wrap: wrap; gap: 5px; }
  .chips span { font-size: 11px; padding: 3px 9px; border-radius: 999px; background: #eaf5ee; color: #15803d; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(155px, 1fr)); gap: 12px; }
  .c { margin: 0; background: #fff; border: 1px solid #e8efea; border-radius: 16px; overflow: hidden; }
  .c img { width: 100%; aspect-ratio: 1/1; display: block; background: #f3f7f4; }
  figcaption { padding: 9px 10px 11px; display: flex; flex-direction: column; gap: 3px; }
  .cat { font-size: 10px; color: #93a29a; text-transform: uppercase; letter-spacing: .03em; }
  .c b { font-size: 13px; line-height: 1.25; min-height: 2.4em; }
  .unit { font-size: 11.5px; color: #6b7a72; }
  .price { margin-top: 4px; font-size: 14px; font-weight: 800; color: #15803d; }
</style></head><body>
<div class="top">
  <h1>BirJoy — oziq-ovqat katalogi</h1>
  <p>${SHOPS.length} do'kon · ${PRODUCTS.length} mahsulot · hammasida rasm bor.
  <b>Narxlar taxminiy</b> — siz to'g'rilaysiz. Bazaga yozilganda hammasi <b>o'chiq</b> (mijoz ko'rmaydi)
  holatda yaratiladi.</p>
</div>
${sections}
</body></html>`;

writeFileSync(out, html, "utf8");
console.log(`✅ ${out}`);
console.log(`   ${SHOPS.length} do'kon · ${PRODUCTS.length} mahsulot`);
for (const s of SHOPS) {
  const list = PRODUCTS.filter((p) => p.shop === s.key);
  console.log(`   · ${s.name}: ${list.length} mahsulot / ${new Set(list.map((p) => p.cat)).size} kategoriya`);
}
