// 🎨 OZIQ-OVQAT ILLYUSTRATSIYA KUTUBXONASI (ega, 2026-07-28)
//
// NEGA: jonli bazadagi 220 mahsulotning BIRORTASIDA ham rasm yo'q — mijoz kafellarida faqat
// «🛍» turibdi. Sotuvchilardan foto kutish = do'kon bo'sh ko'rinishda qolaveradi. Shu sabab
// kategoriya-ikonkalari (seedCategoryIcons.ts) naqshini davom ettiramiz: rasm SVG bo'lib
// `Product.photoUrl` ga `data:image/svg+xml;base64,…` ko'rinishida yoziladi. Server bu yo'lni
// allaqachon qo'llaydi (server.ts `serveShopPhoto` → `url.startsWith("data:")`), ya'ni hech
// qanday xosting, Telegram yuklash yoki ega mehnati kerak emas va har ekranda tiniq chiqadi.
//
// GRAMMATIKA (hammasi bir oilaga o'xshashi uchun):
//   · 320×320 kvadrat (kafel `aspect-ratio: 1/1`, `object-fit: cover`) · r=30 burchak
//   · fon #f3f7f4 + mahsulot rangining juda och doirasi — light/dark ikkalasida ham bir xil
//     ko'rinadi (rasm noshaffof, mavzuga bog'liq emas)
//   · tekis (flat) shakl, konturisz; hajm FAQAT bitta `url(#v)` gradient qatlami bilan
//   · pastda yumshoq soya-ellips — mahsulot "turibdi", suzmaydi
//   · yorliq (label) doim oq, ustida BITTA rangli chiziq + ixtiyoriy kichik belgi (glif)
//
// Har mahsulot = FORMA + 3 rang. 200 mahsulot uchun 200 chizma emas, ~34 forma × rang —
// shuning uchun katalog kengaysa ham kod o'smaydi.

export type FoodForm =
  | "shisha" | "yumshoqShisha" | "qadoq" | "quti" | "konserva" | "bankaMetall" | "banka"
  | "paket" | "qop" | "stakan" | "shaker" | "bolalarShisha"
  | "nonDumaloq" | "baton"
  | "mevaDumaloq" | "uzum" | "banan" | "barg" | "ildiz" | "piyoz"
  | "tuxum" | "gosht" | "tovuq" | "kolbasa" | "baliq" | "pishloq" | "sariyog"
  | "makaron" | "shokolad" | "pechenye" | "tort" | "muzqaymoq" | "yongoq" | "dukkakli";

export type FoodGlyph =
  | "barg" | "tomchi" | "bugdoy" | "qor" | "pufak" | "kakao" | "yulduz" | "sigir"
  | "achchiq" | "baliq" | "bug" | "quyosh" | "meva";

export interface FoodArt {
  form: FoodForm;
  /** asosiy rang — mahsulot tanasi */
  c1?: string;
  /** ikkinchi rang — qopqoq / fon detali */
  c2?: string;
  /** urg'u — yorliq chizig'i */
  c3?: string;
  /** yorliqdagi kichik belgi */
  glyph?: FoodGlyph;
}

// ── umumiy yordamchilar ──────────────────────────────────────────────────────────────────────
const DEFS =
  `<defs>` +
  `<linearGradient id="v" x1="0" y1="0" x2="1" y2="0">` +
  `<stop offset="0" stop-color="#ffffff" stop-opacity=".26"/>` +
  `<stop offset=".42" stop-color="#ffffff" stop-opacity="0"/>` +
  `<stop offset="1" stop-color="#000000" stop-opacity=".15"/>` +
  `</linearGradient>` +
  `</defs>`;

/** shakl + ustiga bitta gradient nusxa = arzon hajm (har formada takrorlanadi) */
const vol = (shape: (fill: string) => string, fill: string): string => shape(fill) + shape("url(#v)");

const floor = `<ellipse cx="160" cy="276" rx="76" ry="11" fill="#0f172a" opacity=".07"/>`;

/** oq yorliq + ustidagi rangli chiziq (+ glif) — har paketlangan mahsulotda bir xil */
const label = (x: number, y: number, w: number, h: number, accent: string, glyph?: FoodGlyph): string =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="7" fill="#ffffff" opacity=".95"/>` +
  `<rect x="${x}" y="${y + h - 13}" width="${w}" height="9" rx="4.5" fill="${accent}" opacity=".9"/>` +
  (glyph ? glyphAt(glyph, x + w / 2, y + (h - 13) / 2 + 2, Math.min(w, h - 13) * 0.66, accent) : "");

/** kichik belgi — yorliq markazida. `s` = to'liq o'lcham (px). */
function glyphAt(g: FoodGlyph, cx: number, cy: number, s: number, c: string): string {
  const k = s / 24; // 24×24 to'rdan masshtab
  const t = `<g transform="translate(${cx} ${cy}) scale(${k.toFixed(3)}) translate(-12 -12)" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">`;
  const body: Record<FoodGlyph, string> = {
    barg: `<path d="M5 19C5 10 11 5 19 5c0 8-5 14-14 14Z" fill="${c}" stroke="none"/><path d="M5 19 14 10"stroke="#fff"/>`,
    tomchi: `<path d="M12 3.5c3.6 4.6 6 7.8 6 10.6a6 6 0 1 1-12 0c0-2.8 2.4-6 6-10.6Z" fill="${c}" stroke="none"/>`,
    bugdoy: `<path d="M12 21V8"/><path d="M12 8c0-2.6 1.6-4.4 4-5 .4 2.8-1 4.8-4 5Zm0 0c0-2.6-1.6-4.4-4-5-.4 2.8 1 4.8 4 5Zm0 5c0-2.6 1.6-4.4 4-5 .4 2.8-1 4.8-4 5Zm0 0c0-2.6-1.6-4.4-4-5-.4 2.8 1 4.8 4 5Z" fill="${c}" stroke="none"/>`,
    qor: `<path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5 4.2 16.5"/><path d="M9.4 4.8 12 7.4l2.6-2.6M9.4 19.2 12 16.6l2.6 2.6"/>`,
    pufak: `<circle cx="9" cy="14" r="4" fill="${c}" stroke="none"/><circle cx="16" cy="9.5" r="2.8" fill="${c}" stroke="none" opacity=".7"/><circle cx="16.5" cy="17" r="2" fill="${c}" stroke="none" opacity=".5"/>`,
    kakao: `<ellipse cx="12" cy="12" rx="5.4" ry="8" transform="rotate(-28 12 12)" fill="${c}" stroke="none"/><path d="M8.4 15.6 15.6 8.4" stroke="#fff"/>`,
    yulduz: `<path d="m12 3.6 2.6 5.6 6 .8-4.4 4.3 1.1 6.1-5.3-3-5.3 3 1.1-6.1L3.4 10l6-.8Z" fill="${c}" stroke="none"/>`,
    sigir: `<path d="M5 9c0-2 1.4-3.4 3.4-3.4h7.2C17.6 5.6 19 7 19 9v4a7 7 0 0 1-14 0Z" fill="${c}" stroke="none"/><circle cx="9.4" cy="11" r="1.1" fill="#fff"/><circle cx="14.6" cy="11" r="1.1" fill="#fff"/>`,
    achchiq: `<path d="M8 20c-2.6-1.4-3.6-4-3-6.6.8-3.6 4-6 8-6.4v3c1.6 2.6 1.4 6.4-.8 8.6C10.8 20 9.4 20.6 8 20Z" fill="${c}" stroke="none"/><path d="M13 7c1.4-2 3-2.6 4.6-2.4"/>`,
    baliq: `<path d="M3.6 12c3-3.2 6-4.6 8.8-4.6 3.2 0 5.6 1.8 7 4.6-1.4 2.8-3.8 4.6-7 4.6-2.8 0-5.8-1.4-8.8-4.6Z" fill="${c}" stroke="none"/><path d="m18.4 8.4 3-2.4v12l-3-2.4Z" fill="${c}" stroke="none"/><circle cx="8" cy="11" r="1" fill="#fff"/>`,
    bug: `<path d="M6.5 11h11v5.4a5.5 5.5 0 0 1-11 0Z" fill="${c}" stroke="none"/><path d="M17.5 12.2h1.6a2 2 0 1 1 0 4h-1.6"/><path d="M10 8.4c.8-1 .8-1.8 0-2.8M14 8.4c.8-1 .8-1.8 0-2.8"/>`,
    quyosh: `<circle cx="12" cy="12" r="5" fill="${c}" stroke="none"/><path d="M12 2.6v2.6M12 18.8v2.6M2.6 12h2.6M18.8 12h2.6M5.4 5.4 7.2 7.2M16.8 16.8l1.8 1.8M18.6 5.4 16.8 7.2M7.2 16.8l-1.8 1.8"/>`,
    meva: `<circle cx="12" cy="14.4" r="6.4" fill="${c}" stroke="none"/><path d="M12 8V5.2"/><path d="M12.2 5.4c1-1.6 2.6-2 3.6-2 .1 1.4-.7 3-2.1 3.5-.6.2-1.2.1-1.5-.1Z" fill="${c}" stroke="none"/>`,
  };
  return `${t}${body[g]}</g>`;
}

// ── formalar ─────────────────────────────────────────────────────────────────────────────────
// Har biri (c1,c2,c3,glyph) qabul qiladi va SVG tanasini qaytaradi.
type Draw = (c1: string, c2: string, c3: string, g?: FoodGlyph) => string;

const FORMS: Record<FoodForm, Draw> = {
  // 🥤 PET shisha — ichimlik, yog', suv
  shisha: (c1, c2, c3, g) =>
    `<rect x="138" y="30" width="44" height="26" rx="7" fill="${c2}"/>` +
    `<rect x="134" y="52" width="52" height="10" rx="5" fill="${c2}" opacity=".75"/>` +
    vol((f) => `<path d="M144 60h32v24c0 16 44 22 44 60v98a22 22 0 0 1-22 22h-76a22 22 0 0 1-22-22v-98c0-38 44-44 44-60z" fill="${f}"/>`, c1) +
    label(104, 168, 112, 62, c3, g),

  // 🧴 yumshoq shisha — ketchup, mayonez, kichik yog'
  yumshoqShisha: (c1, c2, c3, g) =>
    `<path d="M140 34h40v22h-40z" fill="${c2}"/>` +
    vol((f) => `<path d="M140 54h40l30 56v132a20 20 0 0 1-20 20h-60a20 20 0 0 1-20-20V110z" fill="${f}"/>`, c1) +
    label(112, 152, 96, 66, c3, g),

  // 🥛 qirrali qadoq — sut, sok (uchburchak tomi ANIQ ko'rinishi kerak, aks holda shishaga o'xshaydi)
  qadoq: (c1, c2, c3, g) =>
    `<rect x="146" y="54" width="28" height="18" rx="4" fill="${c2}"/>` +
    vol((f) => `<path d="M100 132h120v122a12 12 0 0 1-12 12H112a12 12 0 0 1-12-12z" fill="${f}"/>`, c1) +
    `<path d="M100 132 160 70v62z" fill="${c1}"/>` +
    `<path d="M160 70l60 62h-60z" fill="#000" opacity=".16"/>` +
    `<path d="M100 132h120" stroke="#000" stroke-opacity=".12" stroke-width="3"/>` +
    label(112, 158, 96, 68, c3, g),

  // 📦 quti — choy, xlopya, makaron
  quti: (c1, c2, c3, g) =>
    vol((f) => `<path d="M96 96h112v172H96z" fill="${f}"/>`, c1) +
    `<path d="M96 96l26-26h112l-26 26z" fill="${c2}"/>` +
    `<path d="M208 96l26-26v172l-26 26z" fill="#000" opacity=".14"/>` +
    label(110, 130, 84, 82, c3, g),

  // 🥫 konserva — past va keng banka
  konserva: (c1, c2, c3, g) =>
    vol((f) => `<path d="M96 116h128v128a12 12 0 0 1-12 12h-104a12 12 0 0 1-12-12z" fill="${f}"/>`, c1) +
    `<ellipse cx="160" cy="116" rx="64" ry="17" fill="${c2}"/>` +
    `<ellipse cx="160" cy="116" rx="50" ry="12" fill="#000" opacity=".08"/>` +
    label(96, 150, 128, 62, c3, g),

  // 🥤 metall banka — gazli/energetik
  bankaMetall: (c1, c2, c3, g) =>
    `<ellipse cx="160" cy="76" rx="46" ry="12" fill="#cbd5e1"/>` +
    `<ellipse cx="160" cy="76" rx="34" ry="8" fill="#94a3b8"/>` +
    vol((f) => `<path d="M114 78h92v160a14 14 0 0 1-14 14h-64a14 14 0 0 1-14-14z" fill="${f}"/>`, c1) +
    label(114, 122, 92, 74, c3, g),

  // 🍯 shisha banka — asal, murabbo, konserva
  banka: (c1, c2, c3, g) =>
    `<rect x="108" y="54" width="104" height="28" rx="9" fill="${c2}"/>` +
    `<rect x="118" y="80" width="84" height="14" fill="${c2}" opacity=".55"/>` +
    vol((f) => `<path d="M100 108a16 16 0 0 1 16-16h88a16 16 0 0 1 16 16v130a22 22 0 0 1-22 22h-76a22 22 0 0 1-22-22z" fill="${f}"/>`, c1) +
    `<rect x="112" y="112" width="14" height="90" rx="7" fill="#ffffff" opacity=".26"/>` +
    label(110, 178, 100, 58, c3, g),

  // 🍬 yostiq-paket — shirinlik, muzlatilgan, sut-paket
  paket: (c1, c2, c3, g) =>
    `<path d="M96 84h128v18H96z" fill="${c2}"/>` +
    vol((f) => `<path d="M96 100c26-14 102-14 128 0v134c-26 16-102 16-128 0z" fill="${f}"/>`, c1) +
    label(114, 148, 92, 62, c3, g),

  // 🌾 qop — un, guruch, shakar (yig'ilgan bo'yin + kengaygan tag = "qop", silindr emas)
  qop: (c1, c2, c3, g) =>
    `<path d="M126 84c10-10 58-10 68 0l10 34h-88z" fill="${c2}"/>` +
    `<rect x="128" y="76" width="64" height="16" rx="8" fill="${c2}" opacity=".7"/>` +
    vol((f) => `<path d="M116 118h88c10 42 14 82 8 106a22 22 0 0 1-21 16h-62a22 22 0 0 1-21-16c-6-24-2-64 8-106z" fill="${f}"/>`, c1) +
    `<path d="M136 120c-8 30-10 68-6 96M184 120c8 30 10 68 6 96" stroke="#000" stroke-opacity=".08" stroke-width="6" fill="none"/>` +
    label(114, 162, 92, 60, c3, g),

  // 🥛 stakan — qatiq, ayron, qahva
  stakan: (c1, c2, c3, g) =>
    `<rect x="104" y="98" width="112" height="18" rx="7" fill="${c2}"/>` +
    vol((f) => `<path d="M110 116h100l-13 138a14 14 0 0 1-14 12h-46a14 14 0 0 1-14-12z" fill="${f}"/>`, c1) +
    label(116, 156, 88, 62, c3, g),

  // 🧂 idish — ziravor, tuz
  shaker: (c1, c2, c3, g) =>
    `<rect x="112" y="88" width="96" height="32" rx="12" fill="${c2}"/>` +
    `<circle cx="140" cy="102" r="4" fill="#0f172a" opacity=".28"/><circle cx="160" cy="98" r="4" fill="#0f172a" opacity=".28"/><circle cx="180" cy="102" r="4" fill="#0f172a" opacity=".28"/>` +
    vol((f) => `<path d="M116 120h88v122a18 18 0 0 1-18 18h-52a18 18 0 0 1-18-18z" fill="${f}"/>`, c1) +
    label(122, 156, 76, 62, c3, g),

  // 🍼 bolalar shishasi
  bolalarShisha: (c1, c2, c3, g) =>
    `<path d="M148 24c8-6 16-6 24 0 6 5 4 14-2 16h-20c-6-2-8-11-2-16z" fill="#f7cfae"/>` +
    `<rect x="132" y="40" width="56" height="20" rx="7" fill="${c2}"/>` +
    vol((f) => `<path d="M124 62h72a12 12 0 0 1 12 12v168a20 20 0 0 1-20 20h-56a20 20 0 0 1-20-20V74a12 12 0 0 1 12-12z" fill="${f}"/>`, c1) +
    `<path d="M188 108h12M188 130h12M188 152h12" stroke="#0f172a" stroke-opacity=".2" stroke-width="4" stroke-linecap="round"/>` +
    label(124, 168, 62, 56, c3, g),

  // 🥖 dumaloq non / patir
  nonDumaloq: (c1, c2) =>
    vol((f) => `<circle cx="160" cy="170" r="88" fill="${f}"/>`, c1) +
    `<circle cx="160" cy="170" r="56" fill="${c2}"/>` +
    `<circle cx="160" cy="170" r="40" fill="#000" opacity=".07"/>` +
    `<circle cx="140" cy="152" r="4" fill="#fff" opacity=".7"/><circle cx="176" cy="146" r="4" fill="#fff" opacity=".7"/>` +
    `<circle cx="184" cy="184" r="4" fill="#fff" opacity=".7"/><circle cx="138" cy="190" r="4" fill="#fff" opacity=".7"/>` +
    `<circle cx="160" cy="168" r="4" fill="#fff" opacity=".7"/>`,

  // 🥐 uzun non / baton
  baton: (c1, c2) =>
    vol((f) => `<path d="M56 172c0-40 46-64 104-64s104 24 104 64c0 32-46 50-104 50S56 204 56 172z" fill="${f}"/>`, c1) +
    `<g stroke="${c2}" stroke-width="9" stroke-linecap="round">` +
    `<path d="M108 140 96 168"/><path d="M148 132 136 164"/><path d="M188 134 176 166"/><path d="M226 146 214 172"/></g>`,

  // 🍎 dumaloq meva — olma, apelsin, pomidor
  mevaDumaloq: (c1, c2) =>
    `<rect x="155" y="86" width="10" height="30" rx="5" fill="#7c5b3f"/>` +
    `<path d="M166 100c16-16 38-16 50-6-10 18-34 24-50 14z" fill="${c2}"/>` +
    vol((f) => `<circle cx="160" cy="182" r="82" fill="${f}"/>`, c1) +
    `<ellipse cx="128" cy="150" rx="20" ry="13" fill="#fff" opacity=".26" transform="rotate(-30 128 150)"/>`,

  // 🍇 uzum / rezavor
  uzum: (c1, c2) =>
    `<rect x="156" y="60" width="8" height="30" rx="4" fill="#7c5b3f"/>` +
    `<path d="M164 76c16-18 40-20 54-10-12 20-38 26-54 16z" fill="${c2}"/>` +
    vol((f) =>
      [[110, 128], [160, 128], [210, 128], [135, 168], [185, 168], [110, 208], [160, 208], [210, 208], [135, 246], [185, 246]]
        .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="26" fill="${f}"/>`).join(""), c1),

  // 🍌 banan
  banan: (c1, c2) =>
    vol((f) => `<path d="M72 106c6 74 62 132 136 132 22 0 38-8 44-18-10 4-24 4-38 0-52-16-88-58-104-116-6-20-32-18-38 2z" fill="${f}"/>`, c1) +
    `<path d="M212 238c14 0 26-4 32-12-10 4-22 4-32 2z" fill="${c2}"/>` +
    `<path d="M78 104c-4-14 18-16 22-2" stroke="${c2}" stroke-width="10" fill="none" stroke-linecap="round"/>`,

  // 🥬 karam / ko'kat — bosh + chetdan chiqib turgan tashqi barglar + barg burmalari
  barg: (c1, c2) =>
    `<ellipse cx="102" cy="216" rx="46" ry="28" transform="rotate(-22 102 216)" fill="${c2}"/>` +
    `<ellipse cx="218" cy="216" rx="46" ry="28" transform="rotate(22 218 216)" fill="${c2}"/>` +
    vol((f) => `<circle cx="160" cy="176" r="80" fill="${f}"/>`, c1) +
    `<g stroke="#ffffff" stroke-opacity=".38" stroke-width="7" fill="none" stroke-linecap="round">` +
    `<path d="M108 146c28 8 46 32 46 62"/><path d="M212 146c-28 8-46 32-46 62"/>` +
    `<path d="M160 100c-9 26-9 48 0 66"/><path d="M96 190c22 4 38 18 46 38"/><path d="M224 190c-22 4-38 18-46 38"/></g>` +
    `<circle cx="160" cy="180" r="20" fill="#ffffff" opacity=".22"/>`,

  // 🥕 ildizmeva — sabzi, turp
  ildiz: (c1, c2) =>
    `<g fill="${c2}"><path d="M158 104c-18-18-22-42-16-58 18 6 32 26 32 48z"/><path d="M162 104c18-18 40-22 56-16-8 18-30 32-52 32z"/><path d="M160 106c-6-24 2-46 12-58 10 18 10 42 2 60z"/></g>` +
    vol((f) => `<path d="M160 272c-14 0-42-118-42-136 0-18 20-30 42-30s42 12 42 30c0 18-28 136-42 136z" fill="${f}"/>`, c1) +
    `<g stroke="#fff" stroke-opacity=".45" stroke-width="6" stroke-linecap="round"><path d="M136 148h14"/><path d="M172 176h14"/><path d="M144 208h12"/></g>`,

  // 🧅 piyoz / kartoshka
  piyoz: (c1, c2) =>
    `<path d="M156 84c-4-16 4-26 12-30 2 14-2 24-6 30z" fill="${c2}"/>` +
    vol((f) => `<path d="M160 82c40 0 76 42 76 92 0 52-34 88-76 88s-76-36-76-88c0-50 36-92 76-92z" fill="${f}"/>`, c1) +
    `<g stroke="#fff" stroke-opacity=".4" stroke-width="6" fill="none"><path d="M160 88c-22 34-24 106 0 168"/><path d="M160 88c22 34 24 106 0 168"/></g>`,

  // 🥚 tuxum lotogi — tuxumlar lotokdan ANIQ chiqib turadi
  tuxum: (c1, c2, c3, g) =>
    `<g fill="${c1}"><ellipse cx="108" cy="146" rx="32" ry="42"/><ellipse cx="160" cy="132" rx="32" ry="42"/><ellipse cx="212" cy="146" rx="32" ry="42"/></g>` +
    `<g fill="#ffffff" opacity=".4"><ellipse cx="99" cy="132" rx="10" ry="14"/><ellipse cx="151" cy="118" rx="10" ry="14"/><ellipse cx="203" cy="132" rx="10" ry="14"/></g>` +
    vol((f) => `<path d="M76 182h168l-8 66a14 14 0 0 1-14 12H98a14 14 0 0 1-14-12z" fill="${f}"/>`, c2) +
    `<path d="M76 182h168" stroke="#000" stroke-opacity=".1" stroke-width="4"/>` +
    label(100, 198, 120, 48, c3, g),

  // 🥩 go'sht bo'lagi — yog' qatlami (oq chekka) + suyak: "steyk" darrov o'qiladi
  gosht: (c1, c2) =>
    `<path d="M212 118c30 18 40 62 20 92-10 16-26 28-44 34 26-40 32-92 24-126z" fill="#f8fafc"/>` +
    vol((f) => `<path d="M96 132c26-32 92-40 128-16 34 22 30 76 4 104-28 30-96 34-126 6-26-24-28-72-6-94z" fill="${f}"/>`, c1) +
    `<g stroke="#ffffff" stroke-opacity=".55" stroke-width="9" stroke-linecap="round" fill="none">` +
    `<path d="M126 168c16 4 26 16 30 30"/><path d="M160 148c12 12 18 28 16 44"/><path d="M116 208c14 2 24 10 30 22"/></g>`,

  // 🍗 tovuq son — et (yuqorida) + suyak (pastda) + bo'g'im: "nogo" siluetiga o'xshamasin
  tovuq: (c1, c2) =>
    `<path d="M150 176 116 226" stroke="${c2}" stroke-width="30" stroke-linecap="round"/>` +
    `<circle cx="110" cy="234" r="22" fill="${c2}"/><circle cx="132" cy="246" r="18" fill="${c2}"/>` +
    vol((f) => `<ellipse cx="178" cy="132" rx="64" ry="58" transform="rotate(-24 178 132)" fill="${f}"/>`, c1) +
    `<path d="M148 96c18-14 44-14 62 2" stroke="#ffffff" stroke-opacity=".4" stroke-width="10" fill="none" stroke-linecap="round"/>`,

  // 🌭 kolbasa halqasi — teshigi bor HALQA (yopiq blob emas) + bog'ich + bo'g'im belgilari
  kolbasa: (c1, c2) =>
    `<ellipse cx="160" cy="184" rx="66" ry="60" fill="none" stroke="${c1}" stroke-width="44"/>` +
    `<ellipse cx="160" cy="184" rx="66" ry="60" fill="none" stroke="url(#v)" stroke-width="44"/>` +
    `<g stroke="${c2}" stroke-width="5" stroke-opacity=".5" stroke-linecap="round">` +
    `<path d="M94 168h-14M226 168h14M120 120l-10-10M200 120l10-10M120 248l-10 10M200 248l10 10"/></g>` +
    `<path d="M144 112c8-16 24-16 32 0" stroke="${c2}" stroke-width="9" fill="none" stroke-linecap="round"/>` +
    `<rect x="148" y="98" width="24" height="18" rx="7" fill="${c2}"/>`,

  // 🐟 baliq
  baliq: (c1, c2) =>
    vol((f) => `<path d="M60 174c40-50 84-72 128-72 42 0 74 26 94 66-20 44-52 70-94 70-44 0-88-22-128-64z" fill="${f}"/>`, c1) +
    `<path d="M282 168c14-14 24-24 30-24v70c-6 0-16-12-30-26z" fill="${c2}"/>` +
    `<path d="M150 112c14 26 14 88 0 122" stroke="${c2}" stroke-width="8" fill="none" opacity=".7"/>` +
    `<circle cx="106" cy="160" r="10" fill="#ffffff"/><circle cx="106" cy="160" r="5" fill="#0f172a"/>`,

  // 🧀 pishloq
  pishloq: (c1, c2) =>
    `<path d="M72 148 236 110l0 26L72 174z" fill="${c2}"/>` +
    vol((f) => `<path d="M72 174 236 136v72a14 14 0 0 1-11 14L86 250a12 12 0 0 1-14-12z" fill="${f}"/>`, c1) +
    `<g fill="#000" opacity=".14"><circle cx="112" cy="206" r="13"/><circle cx="166" cy="192" r="10"/><circle cx="206" cy="204" r="8"/></g>`,

  // 🧈 sariyog'
  sariyog: (c1, c2, c3, g) =>
    `<path d="M76 150 116 122h134l-40 28z" fill="${c1}" opacity=".75"/>` +
    vol((f) => `<path d="M76 150h134v86a12 12 0 0 1-12 12H88a12 12 0 0 1-12-12z" fill="${f}"/>`, c1) +
    `<path d="M210 150 250 122v86a12 12 0 0 1-12 12h-28z" fill="#000" opacity=".12"/>` +
    label(88, 168, 110, 52, c3 || c2, g),

  // 🍝 makaron dastasi
  makaron: (c1, c2, c3, g) =>
    vol((f) =>
      Array.from({ length: 9 }, (_, i) => `<rect x="${100 + i * 15}" y="70" width="10" height="192" rx="5" fill="${f}"/>`).join(""), c1) +
    `<rect x="92" y="140" width="136" height="70" rx="8" fill="${c2}"/>` +
    label(102, 152, 116, 48, c3, g),

  // 🍫 shokolad
  shokolad: (c1, c2, c3, g) =>
    vol((f) => `<path d="M84 108h152v104a12 12 0 0 1-12 12H96a12 12 0 0 1-12-12z" fill="${f}"/>`, c1) +
    `<g stroke="#000" stroke-opacity=".18" stroke-width="5"><path d="M135 108v116M186 108v116M84 166h152"/></g>` +
    `<path d="M84 108h152v26H84z" fill="${c2}" opacity=".9"/>` +
    label(104, 140, 112, 56, c3, g),

  // 🍪 pechenye
  pechenye: (c1, c2) =>
    vol((f) =>
      `<circle cx="118" cy="212" r="54" fill="${f}"/><circle cx="196" cy="200" r="54" fill="${f}"/><circle cx="158" cy="140" r="54" fill="${f}"/>`, c1) +
    `<g fill="${c2}">` +
    `<circle cx="106" cy="200" r="7"/><circle cx="132" cy="224" r="6"/><circle cx="188" cy="188" r="7"/><circle cx="210" cy="212" r="6"/>` +
    `<circle cx="146" cy="128" r="7"/><circle cx="172" cy="150" r="6"/><circle cx="158" cy="172" r="5"/></g>`,

  // 🍰 tort bo'lagi — yonidan ko'rinish: qavatlar + krem oralig'i + gilos (konusga o'xshamasin)
  tort: (c1, c2) =>
    vol((f) => `<path d="M88 250 226 122v116a12 12 0 0 1-12 12z" fill="${f}"/>`, c1) +
    `<path d="M137 206h89v-16h-72z" fill="#ffffff" opacity=".8"/>` +
    `<path d="M178 168h48v-16h-31z" fill="#ffffff" opacity=".8"/>` +
    `<path d="M88 250 226 122" stroke="${c2}" stroke-width="14" stroke-linecap="round" fill="none"/>` +
    `<path d="M226 122v116a12 12 0 0 1-12 12h-24V134z" fill="#000" opacity=".08"/>` +
    `<circle cx="206" cy="124" r="15" fill="#e0245e"/><path d="M206 110v-12" stroke="#3f7d34" stroke-width="5" stroke-linecap="round"/>`,

  // 🍦 muzqaymoq
  muzqaymoq: (c1, c2) =>
    vol((f) => `<circle cx="160" cy="128" r="58" fill="${f}"/>`, c1) +
    `<circle cx="122" cy="160" r="40" fill="${c2}"/><circle cx="198" cy="160" r="40" fill="${c2}" opacity=".85"/>` +
    `<path d="M108 178h104l-42 96a12 12 0 0 1-22 0z" fill="#d9a066"/>` +
    `<g stroke="#b87e46" stroke-width="5" opacity=".8"><path d="M124 196l58 46M156 190l30 24M136 216l34 28"/></g>`,

  // 🥜 yong'oq / quruq meva uyumi
  yongoq: (c1, c2) =>
    vol((f) =>
      [[118, 214, -18], [200, 210, 14], [160, 232, 4], [138, 168, 24], [190, 164, -12], [160, 186, -6]]
        .map(([x, y, r]) => `<ellipse cx="${x}" cy="${y}" rx="34" ry="26" transform="rotate(${r} ${x} ${y})" fill="${f}"/>`).join(""), c1) +
    `<g stroke="${c2}" stroke-width="5" opacity=".8" fill="none"><path d="M100 214h36M182 210h36M142 232h36M120 168h36M172 164h36"/></g>`,

  // 🫘 dukkakli — kosadagi loviya
  dukkakli: (c1, c2) =>
    `<g fill="${c1}">` +
    [[126, 158, -20], [160, 148, 10], [194, 158, 22], [142, 176, 6], [178, 176, -14]]
      .map(([x, y, r]) => `<ellipse cx="${x}" cy="${y}" rx="20" ry="14" transform="rotate(${r} ${x} ${y})"/>`).join("") +
    `</g>` +
    vol((f) => `<path d="M76 178h168c0 48-38 84-84 84s-84-36-84-84z" fill="${f}"/>`, c2) +
    `<rect x="70" y="170" width="180" height="16" rx="8" fill="${c2}"/>`,
};

// ── ommaviy API ──────────────────────────────────────────────────────────────────────────────
/** forma bo'yicha standart ranglar — katalogda faqat kerak bo'lganda ustidan yoziladi */
const DEFAULT_COLORS: Record<FoodForm, [string, string, string]> = {
  shisha: ["#38bdf8", "#0ea5e9", "#0d9668"], yumshoqShisha: ["#ef4444", "#7f1d1d", "#d98f00"],
  qadoq: ["#e8eef5", "#2563eb", "#2563eb"], quti: ["#f59e0b", "#b45309", "#7c2d12"],
  konserva: ["#94a3b8", "#cbd5e1", "#dc2626"], bankaMetall: ["#1e293b", "#94a3b8", "#f59e0b"],
  banka: ["#f59e0b", "#b45309", "#b45309"], paket: ["#22c55e", "#15803d", "#0d9668"],
  qop: ["#f1f5f9", "#e2e8f0", "#b45309"], stakan: ["#f8fafc", "#e2e8f0", "#0d9668"],
  shaker: ["#e2e8f0", "#94a3b8", "#b45309"], bolalarShisha: ["#f8fafc", "#60a5fa", "#60a5fa"],
  nonDumaloq: ["#e0a561", "#c07f3c", "#b45309"], baton: ["#dfa762", "#b97434", "#b45309"],
  mevaDumaloq: ["#ef4444", "#3f7d34", "#dc2626"], uzum: ["#7e3af2", "#3f7d34", "#7e3af2"],
  banan: ["#facc15", "#a16207", "#a16207"], barg: ["#4ade80", "#22c55e", "#15803d"],
  ildiz: ["#f97316", "#3f7d34", "#c2410c"], piyoz: ["#e9c46a", "#3f7d34", "#b45309"],
  tuxum: ["#f5e6cf", "#cbd5e1", "#b45309"], gosht: ["#e05555", "#a3283f", "#a3283f"],
  tovuq: ["#e8a06a", "#f1f5f9", "#b45309"], kolbasa: ["#c2506b", "#8b3a4e", "#8b3a4e"],
  baliq: ["#7dd3fc", "#0ea5e9", "#0369a1"], pishloq: ["#f7c948", "#fde68a", "#b45309"],
  sariyog: ["#fde68a", "#f59e0b", "#b45309"], makaron: ["#f0c987", "#f59e0b", "#b45309"],
  shokolad: ["#6b3f2a", "#4a2a1a", "#b45309"], pechenye: ["#dda15e", "#6b3f2a", "#6b3f2a"],
  tort: ["#f9d7b8", "#e0245e", "#e0245e"], muzqaymoq: ["#fbcfe8", "#fde68a", "#d97706"],
  yongoq: ["#c98a4b", "#8b5a2b", "#8b5a2b"], dukkakli: ["#d97757", "#e2e8f0", "#b45309"],
};

/** to'liq SVG matni (320×320) */
export function foodArtSvg(a: FoodArt): string {
  const [d1, d2, d3] = DEFAULT_COLORS[a.form];
  const c1 = a.c1 ?? d1, c2 = a.c2 ?? d2, c3 = a.c3 ?? d3;
  const tint = a.c1 ?? d1;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320">` +
    DEFS +
    `<rect width="320" height="320" rx="30" fill="#f3f7f4"/>` +
    `<circle cx="160" cy="140" r="118" fill="${tint}" opacity=".14"/>` +
    floor +
    FORMS[a.form](c1, c2, c3, a.glyph) +
    `</svg>`
  );
}

/** `Product.photoUrl` ga yoziladigan data-URL */
export function foodArtDataUrl(a: FoodArt): string {
  return `data:image/svg+xml;base64,${Buffer.from(foodArtSvg(a), "utf8").toString("base64")}`;
}

// ── do'kon logotipi ──────────────────────────────────────────────────────────────────────────
/** 4 do'kon uchun bir oiladan chiqqan rastalar (BirJoy zumrad/amber tili) */
export function shopLogoSvg(kind: "market" | "bozor" | "non" | "gosht", c1: string, c2: string): string {
  // Har logo: bitta KATTA oq belgi (savat / meva / non / baliq). Rasta-soyaboni ingichka
  // yuqori chiziq bo'lib qoladi — oila belgisi, lekin belgini bosib ketmaydi.
  const glyphs: Record<typeof kind, string> = {
    // savat — "market"
    market: `<path d="M124 148a36 36 0 0 1 72 0" stroke="#fff" stroke-width="13" fill="none" stroke-linecap="round"/>` +
      `<rect x="84" y="146" width="152" height="24" rx="12" fill="#fff"/>` +
      `<path d="M98 176h124l-18 74a18 18 0 0 1-18 14h-52a18 18 0 0 1-18-14z" fill="#fff"/>` +
      `<g stroke="${c2}" stroke-width="8" stroke-linecap="round" opacity=".8">` +
      `<path d="M112 188l18 68M148 188l6 68M208 188l-18 68M172 188l-6 68M104 214h112"/></g>`,
    // olma + barg — "yangi bozor"
    bozor: `<circle cx="152" cy="196" r="62" fill="#fff"/><circle cx="205" cy="205" r="42" fill="#fff" opacity=".85"/>` +
      `<path d="M160 134c22-26 54-28 70-18-8 28-42 40-70 26z" fill="#fff"/>` +
      `<path d="M152 138v22" stroke="${c2}" stroke-width="10" stroke-linecap="round"/>`,
    // non — "non & shirinlik"
    non: `<circle cx="160" cy="196" r="66" fill="#fff"/><circle cx="160" cy="196" r="38" fill="${c2}" opacity=".35"/>` +
      `<g fill="${c2}" opacity=".8"><circle cx="134" cy="172" r="6"/><circle cx="184" cy="178" r="6"/><circle cx="188" cy="216" r="6"/><circle cx="136" cy="214" r="6"/><circle cx="160" cy="194" r="6"/></g>`,
    // baliq — "go'sht & baliq"
    gosht: `<path d="M78 198c34-42 74-60 110-60 34 0 60 22 76 56-16 36-42 58-76 58-36 0-76-18-110-54z" fill="#fff"/>` +
      `<path d="M264 176c12-12 20-20 26-20v78c-6 0-14-10-26-24z" fill="#fff" opacity=".85"/>` +
      `<circle cx="112" cy="186" r="9" fill="${c2}"/>`,
  };
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320">` +
    `<defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>` +
    `<rect width="320" height="320" rx="72" fill="url(#lg)"/>` +
    // rasta soyaboni — 4 logoda ham bir xil ingichka element (oila belgisi)
    `<path d="M56 96h208l-14-26H70z" fill="#fff" opacity=".55"/>` +
    `<path d="M56 96h208v6a16 16 0 0 1-16 16H72a16 16 0 0 1-16-16z" fill="#fff" opacity=".35"/>` +
    glyphs[kind] +
    `</svg>`
  );
}

export function shopLogoDataUrl(kind: "market" | "bozor" | "non" | "gosht", c1: string, c2: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(shopLogoSvg(kind, c1, c2), "utf8").toString("base64")}`;
}
