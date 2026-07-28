// 🎨 3-BOSQICH (ega, 2026-07-28): 30 ta kategoriya ikonkasi — bitta qo'lda chizilgan to'plam.
//
// NEGA SVG VA NEGA SKRIPT: ikonkalar `CategoryDef.iconUrl` ga `data:image/svg+xml;base64,…`
// bo'lib yoziladi — ya'ni hech qanday fayl-xosting, Telegram yuklash yoki ega mehnati kerak
// emas, va serveringiz rasm so'ralganda tayyor baytni beradi (server.ts `serveMarketImage`
// data-URL yo'lini allaqachon qo'llaydi). SVG har ekranda tiniq (rasterdan farqli).
//
// GRAMMATIKA (hammasi bir xil bo'lishi uchun): 24×24 to'r · faqat `currentColor` EMAS, rang
// ichkariga yoziladi (`<img>` orqali kelgani uchun CSS ranglay olmaydi) · chiziq 1.6px, uchlari
// dumaloq · zumrad #0d9668 chiziq + HAR ikonkada AYNAN BITTA amber #d98f00 urg'u.
// Faol kategoriya kafeli zumrad gradient bo'lganda ikonka CSS `filter: brightness(0) invert(1)`
// bilan oppoq qilinadi (shuning uchun ikonka ichida oq rang ISHLATILMAYDI).
//
// IDEMPOTENT: bir xil ikonka qayta yozilmaydi. Default DRY-RUN.
// Yozish: npx dotenv -e ../../.env -- npx tsx src/scripts/seedCategoryIcons.ts --apply
import { prisma } from "../db";

const APPLY = process.argv.includes("--apply");
const E = "#0d9668"; // zumrad — asosiy chiziq
const A = "#d98f00"; // amber — bitta urg'u

const wrap = (body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="${E}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

const ICONS: Record<string, string> = {
  non: `<path d="M4.5 10.5c0-2.5 3.4-4 7.5-4s7.5 1.5 7.5 4c0 1.2-.9 1.9-2 1.9v5.2a1.4 1.4 0 0 1-1.4 1.4H7.9a1.4 1.4 0 0 1-1.4-1.4v-5.2c-1.1 0-2-.7-2-1.9Z"/><path d="M9.6 12.4v6.6M14.4 12.4v6.6"/><circle cx="12" cy="9" r="1.15" fill="${A}" stroke="none"/>`,
  sut: `<path d="M8 9.6 9.8 6h4.4L16 9.6v9a1.4 1.4 0 0 1-1.4 1.4H9.4A1.4 1.4 0 0 1 8 18.6Z"/><path d="M8 12.4h8"/><path d="M9.8 6h4.4V4.2H9.8Z" fill="${A}" stroke="none"/>`,
  pishloq: `<path d="M4 13.4 12.6 7.6c3.4-.3 6.2 1.4 7.4 4.2v6a1.4 1.4 0 0 1-1.4 1.4H5.4A1.4 1.4 0 0 1 4 17.8Z"/><circle cx="8.4" cy="15.4" r="1.3"/><circle cx="14.6" cy="16" r="1.1"/><circle cx="12" cy="12.6" r="1.15" fill="${A}" stroke="none"/>`,
  tuxum: `<path d="M12 4.4c3 0 5.6 5 5.6 8.4a5.6 5.6 0 1 1-11.2 0c0-3.4 2.6-8.4 5.6-8.4Z"/><circle cx="10.4" cy="13.6" r="1.6" fill="${A}" stroke="none"/>`,
  gosht: `<path d="M14.9 5.4a4.3 4.3 0 0 1 3.9 6.2 4.3 4.3 0 0 1-5.8 5.6l-3.4 3.4a2 2 0 1 1-2.9-2.8l3.5-3.5a4.3 4.3 0 0 1 4.7-8.9Z"/><circle cx="14.6" cy="9.8" r="1.5" fill="${A}" stroke="none"/>`,
  kolbasa: `<path d="M5.4 8.6c4.6-1.4 9 .4 12.4 4.4"/><path d="M4.6 11.4c0-2 1.2-3.4 3-3.4 4 0 7.6 2.6 10.4 6.4 1 1.4.6 3.2-1 3.8-3.6 1.4-12.4-1-12.4-6.8Z"/><circle cx="9.4" cy="13.6" r="1.15" fill="${A}" stroke="none"/>`,
  baliq: `<path d="M3.6 12.4c3-3.4 6.2-5 9.4-5 3.4 0 6 2 7.4 5-1.4 3-4 5-7.4 5-3.2 0-6.4-1.6-9.4-5Z"/><path d="M17.2 8.4 20.4 5.8v13.2l-3.2-2.6"/><circle cx="8.4" cy="11.4" r="1.05" fill="${A}" stroke="none"/>`,
  yorma: `<path d="M8 8.6h8l1.4 9.2a2 2 0 0 1-2 2.3H8.6a2 2 0 0 1-2-2.3Z"/><path d="M9.4 8.6c0-1.6.4-2.6 2.6-2.6s2.6 1 2.6 2.6"/><path d="M9.6 13.4h4.8" stroke="${A}"/>`,
  makaron: `<path d="M6 20c0-5.4 1.2-9.6 6-9.6s6 4.2 6 9.6"/><path d="M9 20c0-4.4.6-7.2 3-7.2s3 2.8 3 7.2"/><path d="M4.6 8.2h14.8" stroke="${A}"/><path d="M6.2 5.4h11.6"/>`,
  dukkakli: `<path d="M6.4 15.6c-2-2-2.2-5 0-7.2s5.2-2 7.2 0l4 4c2 2 2 4.4 0 6.4s-4.4 1.8-6.4-.2Z"/><circle cx="9.4" cy="12.4" r="1.4"/><circle cx="13" cy="16" r="1.4" fill="${A}" stroke="none"/>`,
  yog: `<path d="M9 9.6h6v9.2a1.4 1.4 0 0 1-1.4 1.4h-3.2A1.4 1.4 0 0 1 9 18.8Z"/><path d="M10.4 9.6V6.4h3.2v3.2"/><path d="M10.6 4.2h2.8"/><path d="M12 12.6c1 1.2 1.6 2 1.6 2.8a1.6 1.6 0 1 1-3.2 0c0-.8.6-1.6 1.6-2.8Z" fill="${A}" stroke="none"/>`,
  ziravor: `<path d="M8.6 9.4h6.8l1 9.2a1.6 1.6 0 0 1-1.6 1.8H9.2a1.6 1.6 0 0 1-1.6-1.8Z"/><path d="M9.6 9.4V6.6a2.4 2.4 0 0 1 4.8 0v2.8"/><circle cx="10.8" cy="13.6" r=".9" fill="${A}" stroke="none"/><circle cx="13.4" cy="15.8" r=".9" fill="${A}" stroke="none"/>`,
  konserva: `<ellipse cx="12" cy="7.2" rx="5.4" ry="2.2"/><path d="M6.6 7.2v9.6c0 1.2 2.4 2.2 5.4 2.2s5.4-1 5.4-2.2V7.2"/><path d="M8.8 12.2h6.4" stroke="${A}"/>`,
  sabzavot: `<path d="M10.6 12 7 17.9a2.1 2.1 0 0 0 2.8 2.8l5.9-3.5c2-1.2 3.1-3.4 2.8-5.6l-.3-2-2 .3c-2.2.3-4.3 1.4-5.6 3.4Z"/><path d="M15.8 8.4 18 5.6"/><path d="M15.5 8.1c-.4-1.6.2-3.2 1.4-4.2 1 1.2 1.2 2.9.5 4.3Z" fill="${A}" stroke="${A}"/>`,
  meva: `<path d="M12 8.4c-3.6-2.6-7 .3-7 4 0 3.4 2.6 7.6 5 7.6.9 0 1.4-.5 2-.5s1.1.5 2 .5c2.4 0 5-4.2 5-7.6 0-3.7-3.4-6.6-7-4Z"/><path d="M12 8.4V6"/><path d="M12.2 6.2c1-1.6 2.6-2 3.5-2 .1 1.3-.6 2.9-2 3.4-.6.2-1.2.1-1.5-.1Z" fill="${A}" stroke="none"/>`,
  yongoq: `<path d="M12 4.6c3.4 0 6 2.8 6 6.4 0 4-2.6 8.4-6 8.4s-6-4.4-6-8.4c0-3.6 2.6-6.4 6-6.4Z"/><path d="M12 6.4v12.8"/><path d="M9.2 9.8c1 .8 1.6 1.8 1.8 3M14.8 9.8c-1 .8-1.6 1.8-1.8 3" stroke="${A}"/>`,
  shirinlik: `<circle cx="12" cy="12.6" r="7.4"/><circle cx="9.6" cy="10.8" r="1.05" fill="${A}" stroke="none"/><circle cx="14.2" cy="11.6" r="1.05" fill="${A}" stroke="none"/><circle cx="11.6" cy="15.4" r="1.05" fill="${A}" stroke="none"/>`,
  tort: `<path d="M5 12.6c0-1.6 3.1-2.8 7-2.8s7 1.2 7 2.8v5.6a1.4 1.4 0 0 1-1.4 1.4H6.4A1.4 1.4 0 0 1 5 18.2Z"/><path d="M5 15.2c1.4 1.2 2.6 1.2 3.5.2s2.1-1 3 .2 2.1 1 3 0 2.1-1.2 3.5.2"/><path d="M12 9.8V7.4"/><circle cx="12" cy="6" r="1.3" fill="${A}" stroke="none"/>`,
  muzqaymoq: `<path d="M8.6 11.4h6.8L12.6 20a.7.7 0 0 1-1.2 0Z"/><path d="M7.4 11.4a4.6 4.6 0 0 1 9.2 0"/><path d="M9.6 8.2a2.6 2.6 0 0 1 4.8 0" stroke="${A}"/>`,
  ichimlik: `<path d="M9 8.6h6v10.2a1.4 1.4 0 0 1-1.4 1.4h-3.2A1.4 1.4 0 0 1 9 18.8Z"/><path d="M10.3 8.6V6.2h3.4v2.4"/><rect x="10.2" y="4" width="3.6" height="2.2" rx=".7" fill="${A}" stroke="none"/><path d="M9 13.4h6"/>`,
  choy: `<path d="M5.6 10.2h10.2v5.2a4 4 0 0 1-4 4H9.6a4 4 0 0 1-4-4Z"/><path d="M15.8 11.4h1.6a2.1 2.1 0 1 1 0 4.2h-1.6"/><path d="M9.2 7.4c.8-.9.8-1.6 0-2.6M12.6 7.4c.8-.9.8-1.6 0-2.6" stroke="${A}"/>`,
  energetik: `<path d="M8.6 7.4h6.8v11.2a1.4 1.4 0 0 1-1.4 1.4H10a1.4 1.4 0 0 1-1.4-1.4Z"/><path d="M8.6 7.4 9.4 4h5.2l.8 3.4"/><path d="M12.6 9.6 10.6 13h2.8l-2 3.4" fill="none" stroke="${A}"/>`,
  "bolalar-ovqat": `<path d="M9 10.4h6v8.2a1.4 1.4 0 0 1-1.4 1.4h-3.2A1.4 1.4 0 0 1 9 18.6Z"/><path d="M9 13.4h6"/><path d="M10.4 10.4V8.2h3.2v2.2"/><path d="M12 8.2V6.4a2 2 0 0 1 2-2" stroke="${A}"/><circle cx="14.4" cy="4.2" r="1.1" fill="${A}" stroke="none"/>`,
  "uy-rozgor": `<path d="M9 9.8h5.2a1.6 1.6 0 0 1 1.6 1.6v7a1.6 1.6 0 0 1-1.6 1.6H9a1.6 1.6 0 0 1-1.6-1.6v-7A1.6 1.6 0 0 1 9 9.8Z"/><path d="M10.2 9.8V6.6h3V9.8"/><path d="M17.4 6.2h2M17.4 9.4h2M19 4.6v3.2" stroke="${A}"/>`,
  gigiyena: `<rect x="5.4" y="7.6" width="13.2" height="9.4" rx="2.6"/><path d="M9.6 7.6v9.4"/><circle cx="7.5" cy="12.3" r="1.15" fill="${A}" stroke="none"/><path d="M13 12h3.6"/>`,
  hayvon: `<ellipse cx="12" cy="15.6" rx="4.2" ry="3.4"/><circle cx="7.2" cy="10.4" r="1.9"/><circle cx="16.8" cy="10.4" r="1.9"/><circle cx="10" cy="7.4" r="1.9" fill="${A}" stroke="none"/><circle cx="14" cy="7.4" r="1.9"/>`,
  muzlatilgan: `<path d="M12 3.6v16.8M4.8 7.8l14.4 8.4M19.2 7.8 4.8 16.2"/><path d="M9.6 5.4 12 7.8l2.4-2.4M9.6 18.6 12 16.2l2.4 2.4"/><circle cx="12" cy="12" r="1.5" fill="${A}" stroke="none"/>`,
  asal: `<path d="M7.6 9.6h8.8l.8 8.4a2 2 0 0 1-2 2.2H8.8a2 2 0 0 1-2-2.2Z"/><path d="M7.2 9.6c0-1.4 2.2-2.2 4.8-2.2s4.8.8 4.8 2.2"/><path d="M12 4.4v3"/><path d="M9.8 13.4h4.4c.9 0 1.6.7 1.6 1.6s-.7 1.6-1.6 1.6H9.8c-.9 0-1.6-.7-1.6-1.6s.7-1.6 1.6-1.6Z" fill="${A}" stroke="none"/>`,
  tayyor: `<path d="M7.4 6.6h9.2l1.4 11.6a2 2 0 0 1-2 2.2H8a2 2 0 0 1-2-2.2Z"/><path d="M7.4 6.6 9 4h6l1.6 2.6"/><circle cx="10.4" cy="13.4" r="1.05" fill="${A}" stroke="none"/><circle cx="13.6" cy="16" r="1.05" fill="${A}" stroke="none"/>`,
  qoshimcha: `<rect x="4.6" y="8.6" width="12.8" height="7.8" rx="2.2"/><path d="M17.4 11.4h1.6v2.2h-1.6" fill="${A}" stroke="${A}"/><path d="M8.4 12.5h5.2M11 9.9v5.2"/>`,

  // ── Katalogdan OLDINGI kategoriyalar. Jonli dry-run ko'rsatdi: mijoz karuselida AYNAN SHU
  // beshtasi ko'rinadi (30 ta yangisida hali mahsulot yo'q, bo'sh kategoriya yashiriladi), ya'ni
  // ularsiz redizayn mijoz uchun umuman o'zgarmasdi. Mahsulotlar yangi kategoriyalarga ko'chgach
  // bular tabiiy ravishda yo'qoladi.
  aksiya: `<path d="M12 3.6c.6 3 3.2 4 4.4 6.4a6 6 0 1 1-10.4 4 6 6 0 0 1 1.8-4.2c.3 1 .9 1.8 1.8 2 .3-3.4 1.4-6.4 2.4-8.2Z"/><path d="M12 20a3 3 0 0 0 2.2-5.2c-.6-.6-1.6-1.2-2-2.4-.8 1.2-2.4 2-2.4 4.2A2.9 2.9 0 0 0 12 20Z" fill="${A}" stroke="none"/>`,
  umumiy: `<path d="M6.4 8.6h11.2l1 10.2a1.6 1.6 0 0 1-1.6 1.8H7a1.6 1.6 0 0 1-1.6-1.8Z"/><path d="M9.2 8.6V6.8a2.8 2.8 0 0 1 5.6 0v1.8"/><circle cx="12" cy="13.4" r="1.15" fill="${A}" stroke="none"/>`,
  "uy-anjomlari": `<path d="M5.6 10.4h11.2v5.4a3.4 3.4 0 0 1-3.4 3.4H9a3.4 3.4 0 0 1-3.4-3.4Z"/><path d="M16.8 11.6h1.8a1.9 1.9 0 1 1 0 3.8h-1.8"/><path d="M4.4 10.4h13.6" stroke-width="1.7"/><path d="M9.6 7.6c.7-.8.7-1.5 0-2.4M13.4 7.6c.7-.8.7-1.5 0-2.4" stroke="${A}"/>`,
  parfumeriya: `<path d="M8.4 10.4h7.2v8.4a1.6 1.6 0 0 1-1.6 1.6h-4a1.6 1.6 0 0 1-1.6-1.6Z"/><path d="M10.4 10.4V8h3.2v2.4"/><rect x="10.6" y="5.6" width="2.8" height="2.4" rx=".8"/><path d="M16.6 6.6a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z" fill="${A}" stroke="none"/><path d="M14.6 8.1h.9" stroke="${A}"/>`,
  "bolalar-uchun": `<circle cx="12" cy="13.6" r="5.4"/><circle cx="7.4" cy="8.4" r="2.4"/><circle cx="16.6" cy="8.4" r="2.4"/><circle cx="10.2" cy="12.6" r=".95" fill="${A}" stroke="none"/><circle cx="13.8" cy="12.6" r=".95" fill="${A}" stroke="none"/><path d="M10.6 16c.9.7 1.9.7 2.8 0"/>`,
};

async function main(): Promise<void> {
  console.log(`— seedCategoryIcons ${APPLY ? "APPLY" : "DRY-RUN"} —`);
  const cats = await prisma.categoryDef.findMany({ orderBy: { sortOrder: "asc" } });
  let set = 0, same = 0, missing = 0;
  for (const c of cats) {
    const body = ICONS[c.slug];
    if (!body) { console.log(`⚠️  ikonka yo'q: ${c.slug} (${c.name}) — emoji ${c.emoji} qoladi`); missing++; continue; }
    const dataUrl = `data:image/svg+xml;base64,${Buffer.from(wrap(body), "utf8").toString("base64")}`;
    if (c.iconUrl === dataUrl) { same++; continue; }
    console.log(`${c.iconUrl ? "~" : "+"} ${c.slug} (${c.name})`);
    // iconFileId tozalanadi: serveMarketImage avval iconUrl'ni oladi, lekin ikkisi bir vaqtda
    // turishi keyinchalik "qaysi biri haqiqiy?" savolini tug'diradi.
    if (APPLY) { await prisma.categoryDef.update({ where: { id: c.id }, data: { iconUrl: dataUrl, iconFileId: null } }); set++; }
  }
  const withIcon = (await prisma.categoryDef.findMany({ select: { iconUrl: true, iconFileId: true } })).filter((c) => c.iconUrl || c.iconFileId).length;
  console.log(`\nISBOT: yozildi=${set} · o'zgarmagan=${same} · ikonkasi yo'q slug=${missing} · jami kategoriya=${cats.length} · ikonkasi bor=${withIcon}`);
  if (!APPLY) console.log("(DRY-RUN — hech narsa yozilmadi. Yozish: --apply)");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
