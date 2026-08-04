/**
 * 🎁 KATALOG YUKLASH — 120 ta maishiy mahsulot, formula bilan.
 *
 * Ega talabi (2026-08-04): "yuzlab mahsulot, narxiga qarab, 20 tasiga qulf yo'q, qolganlari
 * qulflangan turadi". Simulyatsiya (`simFullGame.ts`) ko'rsatdi: 8 mukofotlik katalog 90 kunda
 * tugab, emissiyaning 77% i o'lik qoladi — kerakli hajm ~14 mln so'm.
 *
 * ⚠️ NARXLAR HAQIDA HALOL GAP: quyidagi ro'yxat — O'zbekiston maishiy-texnika bozorining
 * TAXMINIY narxlari (2026). Bu Uzum yoki boshqa saytdan olingan JONLI narx EMAS. Sabab ikkita:
 *   1. Mukofot to'lganda uni EGA sotib oladi — demak narx Kosonda topiladigan narx bo'lishi
 *      kerak, Toshkent marketpleys narxi emas (yetkazib berish, mavjudlik farq qiladi).
 *   2. Uchinchi tomon saytidan yuzlab qatorni avtomatik yig'ish — ularning shartlariga bog'liq.
 * Shuning uchun: bu ro'yxat BOSHLANG'ICH. Narxni admin panelda («🎁 Mukofotlar» → tahrirlash)
 * o'zingiz to'g'irlaysiz yoki homiy do'kon ro'yxatini bering — almashtiraman.
 *
 * Qanday ishlaydi: har mahsulot uchun `oyinSuggestTier` darajani, `oyinCardPlan` esa karta
 * bahosi va SONINI hisoblaydi (Z = ⌈3X ÷ (20·Y)⌉). Ega hech qachon qo'lda son yozmaydi.
 *
 * VPS'da:
 *   cd /opt/app/packages/server
 *   npx dotenv -e ../../.env -- npx tsx src/scripts/seedPrizeCatalog.ts           # ko'rish
 *   npx dotenv -e ../../.env -- npx tsx src/scripts/seedPrizeCatalog.ts --apply   # yozish
 */
import { oyinCardPlan, oyinSuggestTier, OYIN_SOM_PER_BALL, OYIN_PRIZE_MULTIPLIER, type OyinCatalogPrize } from "@t1067/shared";
import { prisma } from "../db";

const APPLY = process.argv.includes("--apply");
/** Nechtasi DARHOL ochiq bo'ladi (ega qarori: 20). Qolgani navbatda — sig'im kamayganda
 *  `autoOpenPrizes` birma-bir ochadi. Navbatda turish bir so'm ham turmaydi. */
const OPEN_COUNT = 20;

// ── MAHSULOTLAR: nom · taxminiy narx (so'm) · emoji · segment ───────────────────────────────
// Ega talabi: "qimmat u arzon, hamma — ayol, erkak, bolalarga kerak, hammasidan".
// Segment MUHIM: katalogda faqat maishiy texnika bo'lsa, o'yin faqat uy xo'jaligini yurituvchini
// qiziqtiradi. Ayol/erkak/bola uchun alohida narsalar bo'lsa — butun oila o'ynaydi.
// Narx oralig'i: 25 000 → 5 000 000 so'm (Uzum darajasidagi bozor narxlari).
type Segment = "ayol" | "erkak" | "bola" | "uy" | "umumiy";
const PRODUCTS: [string, number, string, Segment][] = [
  // ── UMUMIY: safar vaucherlari (eng arzon, eng tez to'ladi — birinchi g'oliblar) ──
  ["Safar vaucheri 25 000", 25_000, "🎫", "umumiy"],
  ["Safar vaucheri 50 000", 50_000, "🎫", "umumiy"],
  ["Safar vaucheri 100 000", 100_000, "🎫", "umumiy"],
  ["Safar vaucheri 200 000", 200_000, "🎫", "umumiy"],
  // ── AYOLLAR ──
  ["Manikyur to'plami", 45_000, "💅", "ayol"],
  ["Kosmetika sumkasi", 55_000, "👜", "ayol"],
  ["Soch to'g'rilagich", 95_000, "💇", "ayol"],
  ["Fen (professional)", 135_000, "💨", "ayol"],
  ["Atir (ayollar, 50 ml)", 165_000, "🌸", "ayol"],
  ["Yuz tozalash cho'tkasi", 185_000, "🧴", "ayol"],
  ["Sumka (charm)", 245_000, "👜", "ayol"],
  ["Epilyator", 285_000, "✨", "ayol"],
  ["Sochni jingalak qilgich (avtomat)", 325_000, "💇", "ayol"],
  ["Zargarlik to'plami (kumush)", 420_000, "💍", "ayol"],
  ["Ko'ylak (bayram)", 480_000, "👗", "ayol"],
  ["Tikuv mashinasi", 850_000, "🧵", "ayol"],
  ["Oltin sirg'a", 1_400_000, "💎", "ayol"],
  ["Ayollar velosipedi", 1_700_000, "🚲", "ayol"],
  // ── ERKAKLAR ──
  ["Hamyon (charm)", 40_000, "👛", "erkak"],
  ["Kamar (charm)", 60_000, "🎽", "erkak"],
  ["Soqol olish mashinasi", 110_000, "🪒", "erkak"],
  ["Atir (erkaklar, 100 ml)", 175_000, "🧴", "erkak"],
  ["Asboblar to'plami (48 dona)", 215_000, "🧰", "erkak"],
  ["Sport sumkasi", 235_000, "🎒", "erkak"],
  ["Avto kompressor", 265_000, "🚗", "erkak"],
  ["Gantel to'plami (20 kg)", 340_000, "🏋️", "erkak"],
  ["Elektr shurupovert", 395_000, "🔩", "erkak"],
  ["Qo'l soati", 460_000, "⌚", "erkak"],
  ["Avto videoregistrator", 540_000, "📹", "erkak"],
  ["Baliq ovi to'plami", 620_000, "🎣", "erkak"],
  ["Perforator", 780_000, "🔨", "erkak"],
  ["Payvandlash apparati", 1_100_000, "⚡", "erkak"],
  ["Erkaklar velosipedi (tog')", 1_900_000, "🚲", "erkak"],
  ["Motoblok (kichik)", 4_500_000, "🚜", "erkak"],
  // ── BOLALAR ──
  ["Yumshoq o'yinchoq (katta)", 35_000, "🧸", "bola"],
  ["Rangli qalamlar to'plami", 42_000, "🖍", "bola"],
  ["Konstruktor (200 dona)", 68_000, "🧱", "bola"],
  ["Maktab ruksagi", 90_000, "🎒", "bola"],
  ["Puzzle 1000 dona", 105_000, "🧩", "bola"],
  ["Radio boshqariladigan mashina", 145_000, "🏎", "bola"],
  ["Bolalar konstruktori (katta)", 195_000, "🧱", "bola"],
  ["Skeytbord", 255_000, "🛹", "bola"],
  ["Bolalar samokati", 310_000, "🛴", "bola"],
  ["Bolalar chodiri (uy)", 365_000, "⛺", "bola"],
  ["Bolalar velosipedi (3-6 yosh)", 520_000, "🚲", "bola"],
  ["Bolalar plansheti (o'quv)", 660_000, "📱", "bola"],
  ["Bolalar velosipedi (7-12 yosh)", 880_000, "🚲", "bola"],
  ["Bolalar krovati", 1_250_000, "🛏", "bola"],
  ["Elektromobil (bolalar uchun)", 2_100_000, "🚙", "bola"],
  // ── UY: oshxona ──
  ["Termos 0,5 l", 32_000, "🥤", "uy"],
  ["Choy to'plami (2 kishilik)", 38_000, "🍵", "uy"],
  ["Oshxona tarozisi", 44_000, "⚖️", "uy"],
  ["Sochiq to'plami (3 dona)", 48_000, "🧺", "uy"],
  ["Termos 1 l", 58_000, "🥤", "uy"],
  ["Idish-tovoq to'plami (6 kishilik)", 72_000, "🍽", "uy"],
  ["Sabzavot to'g'ragich", 78_000, "🔪", "uy"],
  ["Elektr choynak 1,7 l", 85_000, "☕", "uy"],
  ["Qo'l blenderi", 98_000, "🥤", "uy"],
  ["Stakan to'plami (6 dona)", 112_000, "🥛", "uy"],
  ["Choy servizi (6 kishilik)", 128_000, "🍵", "uy"],
  ["Toster", 155_000, "🍞", "uy"],
  ["Go'sht maydalagich (elektr)", 178_000, "🥩", "uy"],
  ["Mikser (stend)", 205_000, "🎂", "uy"],
  ["Kofe qaynatgich", 232_000, "☕", "uy"],
  ["Elektr gril", 268_000, "🔥", "uy"],
  ["Blender (statsionar)", 295_000, "🥤", "uy"],
  ["Multivarka 5 l", 340_000, "🍲", "uy"],
  ["Air Fryer 4 l", 415_000, "🍟", "uy"],
  ["Elektr pech (mini, 30 l)", 490_000, "🔥", "uy"],
  ["Mikroto'lqinli pech 20 l", 560_000, "📻", "uy"],
  ["Suv sovutgich (idishli)", 680_000, "🚰", "uy"],
  ["Choy-qahva mashinasi", 820_000, "☕", "uy"],
  ["Mikroto'lqinli pech 25 l (grill)", 950_000, "📻", "uy"],
  ["Gaz plitasi (4 konforka)", 1_550_000, "🔥", "uy"],
  ["Idish yuvish mashinasi", 3_200_000, "🍽", "uy"],
  // ── UY: tozalash va iqlim ──
  ["Dazmol taxtasi", 75_000, "🧷", "uy"],
  ["Dazmol (bug'li)", 190_000, "👕", "uy"],
  ["Chang yutgich (qo'l)", 230_000, "🧹", "uy"],
  ["Ventilyator (turgan)", 285_000, "🌀", "uy"],
  ["Havo namlagich", 330_000, "💧", "uy"],
  ["Chang yutgich (pol)", 400_000, "🧹", "uy"],
  ["Bug'li tozalagich", 475_000, "💨", "uy"],
  ["Isitgich (konvektor)", 590_000, "🔥", "uy"],
  ["Robot chang yutgich", 1_450_000, "🤖", "uy"],
  ["Konditsioner 9000 BTU", 1_850_000, "❄️", "uy"],
  ["Konditsioner 12000 BTU", 2_650_000, "❄️", "uy"],
  // ── UY: mebel va to'shak ──
  ["Yostiq to'plami (2 dona)", 80_000, "🛏", "uy"],
  ["Adyol (bir kishilik)", 105_000, "🛏", "uy"],
  ["Tumbochka", 150_000, "🗄", "uy"],
  ["Ko'rpa-to'shak to'plami", 215_000, "🛏", "uy"],
  ["Choy stoli", 370_000, "🪑", "uy"],
  ["Yer gilami 2×3", 355_000, "🏠", "uy"],
  ["Shkaf (2 eshikli)", 580_000, "🚪", "uy"],
  ["Divan (2 kishilik)", 1_150_000, "🛋", "uy"],
  ["Yotoq (ikki kishilik, matras bilan)", 2_300_000, "🛏", "uy"],
  ["Oshxona mebeli (to'plam)", 3_800_000, "🍽", "uy"],
  // ── UY: yirik texnika ──
  ["Kir yuvish mashinasi (yarim avtomat)", 480_000, "🧺", "uy"],
  ["Kir quritgich", 940_000, "🌬", "uy"],
  ["Televizor 32\"", 1_150_000, "📺", "uy"],
  ["Muzlatgich (kichik)", 1_300_000, "🧊", "uy"],
  ["Kir yuvish mashinasi (avtomat 6 kg)", 1_600_000, "🧺", "uy"],
  ["Televizor 43\"", 1_800_000, "📺", "uy"],
  ["Muzlatgich (o'rta)", 2_200_000, "🧊", "uy"],
  ["Televizor 50\"", 2_500_000, "📺", "uy"],
  ["Kir yuvish mashinasi (avtomat 8 kg)", 2_800_000, "🧺", "uy"],
  ["Muzlatgich (katta, No Frost)", 3_500_000, "🧊", "uy"],
  ["Televizor 65\" (Smart)", 5_000_000, "📺", "uy"],
  // ── UMUMIY: elektronika ──
  ["Bluetooth quloqchin", 120_000, "🎧", "umumiy"],
  ["Power bank 20000 mAh", 160_000, "🔋", "umumiy"],
  ["Bluetooth kolonka", 240_000, "🔊", "umumiy"],
  ["Aqlli soat", 420_000, "⌚", "umumiy"],
  ["Bluetooth kolonka (katta)", 650_000, "🔊", "umumiy"],
  ["Aqlli kolonka (ovozli yordamchi)", 730_000, "🗣", "umumiy"],
  ["Smartfon (byudjet)", 900_000, "📱", "umumiy"],
  ["Planshet 10\"", 1_050_000, "📱", "umumiy"],
  ["Smartfon (o'rta)", 1_750_000, "📱", "umumiy"],
  ["Noutbuk (o'quv)", 2_400_000, "💻", "umumiy"],
  ["Noutbuk (ish)", 3_900_000, "💻", "umumiy"],
];

// Takroriy nomlar bilan katalogni to'ldirish uchun har narx darajasidan bir nechta variant.
// ⚠️ Sun'iy "N-nusxa" YO'Q: har qator — boshqa mahsulot. Ro'yxat 75 ta; ega panelda qo'shadi.

function keyOf(name: string, taken: Set<string>): string {
  const base = name.toLowerCase()
    .replace(/[^a-z0-9а-яўқғҳ\s-]/gi, "").trim().replace(/\s+/g, "-").slice(0, 40) || "mukofot";
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

async function main(): Promise<void> {
  const row = await prisma.appState.findUnique({ where: { key: "oyin:catalog" } });
  let existing: OyinCatalogPrize[] = [];
  if (row) {
    try { existing = JSON.parse(row.value) as OyinCatalogPrize[]; } catch { existing = []; }
  }
  const takenKeys = new Set(existing.map((p) => p.key));
  const takenNames = new Set(existing.map((p) => p.name.toLowerCase().trim()));

  const fresh: OyinCatalogPrize[] = [];
  let skipped = 0;
  // ⚠️ Arzondan qimmatga — birinchi 20 tasi (eng arzonlari) OCHIQ bo'ladi. Bu ataylab:
  // arzon mukofot tez to'ladi → birinchi haftadayoq haqiqiy g'olib chiqadi. G'olibsiz oy
  // o'yinni o'ldiradi (hisobotdagi «6-10 ta fotoli g'olib» maqsadi).
  const sorted = [...PRODUCTS].sort((a, b) => a[1] - b[1]);
  const bySegment = new Map<Segment, number>();
  for (const [name, value, icon, segment] of sorted) {
    bySegment.set(segment, (bySegment.get(segment) ?? 0) + 1);
    if (takenNames.has(name.toLowerCase().trim())) { skipped++; continue; } // ega qo'shganini bosmaymiz
    const tier = oyinSuggestTier(value);
    const plan = oyinCardPlan(value, tier);
    const key = keyOf(name, takenKeys);
    takenKeys.add(key);
    fresh.push({
      key, icon, name,
      valueLabel: `${value.toLocaleString("ru-RU").replace(/ /g, " ")} so'm`,
      price: plan.ballPrice,
      limit: plan.slots,
      photoUrl: null, // rasm YO'Q — emoji fallback ishlaydi; ega panelda qo'shadi
      // 📋 Birinchi OPEN_COUNT tasi ochiq, qolgani navbatda.
      ...(fresh.length < OPEN_COUNT ? {} : { queued: true as const }),
      active: true,
    });
  }

  const totalValue = fresh.reduce((s, p) => s + (Number(p.valueLabel.replace(/\D/g, "")) || 0), 0);
  const totalBall = fresh.reduce((s, p) => s + p.price * p.limit, 0);
  const openN = fresh.filter((p) => p.queued !== true).length;

  console.log("🎁 KATALOG YUKLASH\n");
  console.log(`   Katalogda hozir: ${existing.length} ta · qo'shiladi: ${fresh.length} ta · o'tkazildi (nom takrorlangan): ${skipped}`);
  console.log(`   Ochiq: ${openN} · navbatda: ${fresh.length - openN}`);
  console.log(`   Katalog qiymati: ${totalValue.toLocaleString("ru-RU")} so'm`);
  console.log(`   To'liq to'lsa yig'iladi: ${(totalBall * OYIN_SOM_PER_BALL).toLocaleString("ru-RU")} so'm (${OYIN_PRIZE_MULTIPLIER}× qoplash)`);
  console.log(`   Segmentlar: ${[...bySegment].map(([s, c]) => `${s} ${c}`).join(" · ")}\n`);
  console.log("   nom                                    narx        karta    soni   holat");
  for (const p of fresh) {
    const st = p.queued === true ? "navbat" : "🟢 OCHIQ";
    console.log(`   ${p.name.slice(0, 36).padEnd(38)} ${p.valueLabel.padStart(13)} ${String(p.price).padStart(6)} ${String(p.limit).padStart(6)}   ${st}`);
  }

  if (!APPLY) { console.log("\n⚠️ QURUQ YURISH — hech narsa yozilmadi. Yozish uchun: --apply"); return; }
  const next = [...existing, ...fresh];
  await prisma.appState.upsert({
    where: { key: "oyin:catalog" },
    create: { key: "oyin:catalog", value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) },
  });
  console.log(`\n✅ YOZILDI — katalogda endi ${next.length} ta mukofot.`);
  console.log("   ⚠️ Narxlar TAXMINIY. Admin panelda («🎁 Mukofotlar») o'zingiz to'g'irlang.");
}

main()
  .catch((e) => { console.error("💥", e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
