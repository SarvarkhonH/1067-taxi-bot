/**
 * 🎁 KATALOG YUKLASH — real mahsulotlar, formula bilan.
 *
 * Ega talabi (2026-08-04): "uzum.uz dan narxlarga moslab ol — hamma ayol, erkak, bolalarga
 * kerak, hammasidan. Lekin juda arzon narsalarni ko'paytirma va juda qimmatlarini ham."
 *
 * MANBA: uzum.uz bosh sahifasi ko'rildi (2026-08-04) — nomlar va narxlar SHU KUNGI real
 * ro'yxatdan olindi (Honor X9d 4 274 050 · maktab ryukzagi 49 900 · Artel Marvarid 12BE
 * 3 249 000 · Biryusa 205 l 2 618 030 · Keczz asboblar 484 990 va h.k.).
 * ⚠️ RASMLAR OLINMADI — ular Uzumning mualliflik obyekti. `photoUrl: null`, emoji fallback
 * ishlaydi; ega o'z rasmini panelda qo'yadi.
 * ⚠️ Narx VAQT O'TISHI bilan o'zgaradi va mukofotni EGA sotib oladi — demak Kosonda
 * topiladigan narx bo'lishi kerak. Panelda («🎁 Mukofotlar») to'g'irlanadi.
 *
 * NARX TAQSIMOTI (ega qarori bo'yicha o'rta segmentga OG'IR):
 *   <100 ming     18 ta (15%) — birinchi g'oliblar uchun, katalogning asosi EMAS
 *   100-500 ming  49 ta (41%) — ENG KO'P TALAB shu yerda
 *   0,5-1,5 mln   34 ta (28%) — "jiddiy mukofot" darajasi
 *   1,5-3 mln     16 ta (13%) — orzu, oylab to'ladi
 *   3 mln+         8 ta  (7%) — mavsum yulduzi
 *
 * Karta bahosi va SONI `oyinSuggestTier` + `oyinCardPlan` bilan (Z = ⌈3X ÷ (20·Y)⌉).
 *
 * VPS'da:
 *   npx dotenv -e ../../.env -- npx tsx src/scripts/seedPrizeCatalog.ts           # ko'rish
 *   npx dotenv -e ../../.env -- npx tsx src/scripts/seedPrizeCatalog.ts --apply   # yozish
 */
import { oyinCardPlan, oyinSuggestTier, OYIN_SOM_PER_BALL, OYIN_PRIZE_MULTIPLIER, type OyinCatalogPrize } from "@t1067/shared";
import { prisma } from "../db";

const APPLY = process.argv.includes("--apply");
/** Nechtasi DARHOL ochiq (ega qarori: 20). Qolgani navbatda — `autoOpenPrizes` sig'im
 *  kamayganda birma-bir ochadi. Navbatda turish bir so'm ham turmaydi. */
const OPEN_COUNT = 20;

type Segment = "ayol" | "erkak" | "bola" | "uy" | "umumiy";
const PRODUCTS: [string, number, string, Segment][] = [
  // ── ARZON (<100 ming) — 18 ta. ATAYLAB KAM.
  ["Safar vaucheri 50 000", 50_000, "🎫", "umumiy"],
  ["Maktab ryukzagi (bolalar)", 49_900, "🎒", "bola"],
  ["Maktab loferlari (o'g'il bolalar)", 43_900, "👞", "bola"],
  ["Shampun L'Oreal Elseve 400 ml", 34_990, "🧴", "ayol"],
  ["Erkaklar sport futbolkasi (paxta)", 32_690, "👕", "erkak"],
  ["Dush geli My Muse 250 ml", 28_990, "🧼", "ayol"],
  ["Gigiyena geli My Muse 250 ml", 45_990, "🌸", "ayol"],
  ["Rashgard (kompression futbolka)", 60_790, "🏋️", "erkak"],
  ["Yumshoq o'yinchoq — quyon", 76_630, "🧸", "bola"],
  ["Maktab to'plami (1-11 sinf)", 74_980, "📚", "bola"],
  ["Kuchaytiruvchi shampun My Muse 1 l", 74_990, "🧴", "ayol"],
  ["Termos 1 l (steel)", 68_000, "🥤", "uy"],
  ["Hamyon (charm, erkaklar)", 55_000, "👛", "erkak"],
  ["Oshxona pichoqlari to'plami", 89_000, "🔪", "uy"],
  ["Sochiq to'plami (3 dona)", 62_000, "🧺", "uy"],
  ["Konstruktor (300 dona)", 85_000, "🧱", "bola"],
  ["Manikyur to'plami", 58_000, "💅", "ayol"],
  ["Kamar (tabiiy charm)", 72_000, "🎽", "erkak"],
  // ── 100-500 ming — KATALOGNING ASOSI.
  ["DISHER Calvion erkaklar kedasi", 95_450, "👟", "erkak"],
  ["Elektr choynak 1,7 l (steel)", 115_000, "☕", "uy"],
  ["Maktab sumkasi (qizlar va bolalar)", 119_000, "🎒", "bola"],
  ["Puzzle 2000 dona + ramka", 128_000, "🧩", "bola"],
  ["Soch to'g'rilagich (keramik)", 135_000, "💇", "ayol"],
  ["Toster (2 bo'lim)", 138_000, "🍞", "uy"],
  ["Bluetooth quloqchin (TWS)", 145_000, "🎧", "umumiy"],
  ["Bolalar sport kostyumi", 145_000, "👕", "bola"],
  ["Masofadan boshqariladigan tryuk mashina", 149_490, "🏎", "bola"],
  ["Choy servizi (6 kishilik, farfor)", 152_000, "🍵", "uy"],
  ["Sport sumkasi (katta)", 155_000, "🎒", "erkak"],
  ["Power bank 20000 mAh", 165_000, "🔋", "umumiy"],
  ["Skeytbord", 165_000, "🛹", "bola"],
  ["Fen (professional, 2200 W)", 168_000, "💨", "ayol"],
  ["Atir (ayollar, 50 ml)", 175_000, "🌸", "ayol"],
  ["Kofe qaynatgich (geyzer)", 178_000, "☕", "uy"],
  ["Atir (erkaklar, 100 ml)", 185_000, "🧴", "erkak"],
  ["Bluetooth kolonka (portativ)", 189_000, "🔊", "umumiy"],
  ["Bolalar chodiri (o'yin uyi)", 195_000, "⛺", "bola"],
  ["Go'sht maydalagich (elektr, 1500 W)", 198_000, "🥩", "uy"],
  ["Safar vaucheri 200 000", 200_000, "🎫", "umumiy"],
  ["Dazmol (bug'li, 2400 W)", 205_000, "👕", "uy"],
  ["Bolalar partasi (ortopedik, stul bilan)", 212_490, "🪑", "bola"],
  ["Avto kompressor (12 V)", 215_000, "🚗", "erkak"],
  ["Mikser (stend, kosachali)", 225_000, "🎂", "uy"],
  ["Soqol olish mashinasi (suvga chidamli)", 235_000, "🪒", "erkak"],
  ["Epilyator (elektr)", 245_000, "✨", "ayol"],
  ["Ventilyator (turgan, pultli)", 245_000, "🌀", "uy"],
  ["SADO ayollar zamsh kedalari", 249_000, "👟", "ayol"],
  ["Chang yutgich (qo'l, simsiz)", 268_000, "🧹", "uy"],
  ["Bolalar samokati (2 g'ildirakli)", 285_000, "🛴", "bola"],
  ["Ko'rpa-to'shak to'plami (2 kishilik)", 285_000, "🛏", "uy"],
  ["Ayollar sumkasi (charm)", 289_000, "👜", "ayol"],
  ["Blender (statsionar, 1000 W)", 295_000, "🥤", "uy"],
  ["Sochni jingalak qilgich (avtomat)", 325_000, "💇", "ayol"],
  ["Kungaboqar yog'i 5 l × 3 dona", 324_990, "🫒", "uy"],
  ["Havo namlagich (ultratovush)", 330_000, "💧", "uy"],
  ["Gantel to'plami (20 kg)", 340_000, "🏋️", "erkak"],
  ["Yer gilami 2×3 m", 355_000, "🏠", "uy"],
  ["Multivarka 5 l (12 rejim)", 365_000, "🍲", "uy"],
  ["Kosmetika to'plami (parvarish)", 385_000, "💄", "ayol"],
  ["Qo'l soati (klassik)", 395_000, "⌚", "erkak"],
  ["Chang yutgich (pol, 2000 W)", 398_000, "🧹", "uy"],
  ["Avto o'rindiq g'iloflari (butun salon)", 415_000, "🚗", "erkak"],
  ["Bolalar velosipedi (3-6 yosh)", 420_000, "🚲", "bola"],
  ["Aqlli soat (fitnes)", 420_000, "⌚", "umumiy"],
  ["Air Fryer 5 l", 425_000, "🍟", "uy"],
  ["Zargarlik to'plami (kumush)", 460_000, "💍", "ayol"],
  ["Keczz akkumulyatorli asboblar to'plami", 484_990, "🧰", "erkak"],
  // ── 0,5-1,5 mln — "jiddiy mukofot".
  ["Elektr pech (mini, 45 l)", 520_000, "🔥", "uy"],
  ["Avto videoregistrator (2 kamera)", 540_000, "📹", "erkak"],
  ["Oshxona to'plami (kastryulkalar, 10 dona)", 560_000, "🍲", "uy"],
  ["Mikroto'lqinli pech 20 l", 585_000, "📻", "uy"],
  ["Ko'ylak (bayram, ipak)", 590_000, "👗", "ayol"],
  ["Isitgich (konvektor, 2000 W)", 620_000, "🔥", "uy"],
  ["Baliq ovi to'plami (spinning + g'altak)", 620_000, "🎣", "erkak"],
  ["Bug'li tozalagich (uy uchun)", 640_000, "💨", "uy"],
  ["Bluetooth kolonka (katta, 60 W)", 650_000, "🔊", "umumiy"],
  ["Bolalar plansheti (o'quv, 10 dyuym)", 660_000, "📱", "bola"],
  ["Kosmetologiya apparati (uy uchun)", 680_000, "💆", "ayol"],
  ["Suv sovutgich (idishli, sovuq-issiq)", 695_000, "🚰", "uy"],
  ["Kir quritgich (osma, elektr)", 720_000, "🌬", "uy"],
  ["Aqlli kolonka (ovozli yordamchi)", 730_000, "🗣", "umumiy"],
  ["Gaming/o'quv stoli (noutbuk uchun)", 749_900, "🪑", "uy"],
  ["Bolalar velosipedi (7-12 yosh)", 780_000, "🚲", "bola"],
  ["Perforator (SDS-plus, 850 W)", 780_000, "🔨", "erkak"],
  ["Choy-qahva mashinasi (avtomat)", 820_000, "☕", "uy"],
  ["Tikuv mashinasi (elektromexanik)", 850_000, "🧵", "ayol"],
  ["Shkaf (2 eshikli, kupe)", 880_000, "🚪", "uy"],
  ["Kir yuvish mashinasi (yarim avtomat, 8 kg)", 880_000, "🧺", "uy"],
  ["Bolalar kompyuter stoli + stul", 890_000, "🪑", "bola"],
  ["Mikroto'lqinli pech 25 l (grill)", 950_000, "📻", "uy"],
  ["Planshet 10 dyuym (WiFi, 128 GB)", 1_050_000, "📱", "umumiy"],
  ["Payvandlash apparati (invertor)", 1_100_000, "⚡", "erkak"],
  ["Ayollar velosipedi (shahar)", 1_100_000, "🚲", "ayol"],
  ["Divan (2 kishilik, buklanadigan)", 1_150_000, "🛋", "uy"],
  ["Idish yuvish mashinasi (stol usti)", 1_250_000, "🍽", "uy"],
  ["Bolalar krovati (o'smir, matras bilan)", 1_250_000, "🛏", "bola"],
  ["Erkaklar velosipedi (tog', 21 tezlik)", 1_250_000, "🚲", "erkak"],
  ["Yotoq matrasi (ortopedik, 160×200)", 1_350_000, "🛏", "uy"],
  ["Smartfon TECNO Spark Go (128 GB)", 1_386_130, "📱", "umumiy"],
  ["Oltin sirg'a (585 proba)", 1_400_000, "💎", "ayol"],
  ["Robot chang yutgich", 1_450_000, "🤖", "uy"],
  // ── 1,5-3 mln — orzu darajasi.
  ["Televizor 32 dyuym (Smart)", 1_650_000, "📺", "uy"],
  ["Kir yuvish mashinasi (avtomat, 6 kg)", 1_750_000, "🧺", "uy"],
  ["Muzlatgich (kichik, 150 l)", 1_850_000, "🧊", "uy"],
  ["Gaz plitasi (4 konforka, duxovka)", 1_950_000, "🔥", "uy"],
  ["Elektromobil (bolalar uchun, akkumulyatorli)", 2_100_000, "🚙", "bola"],
  ["Televizor 43 dyuym (Smart, 4K)", 2_150_000, "📺", "uy"],
  ["Oshxona mebeli (to'plam, 2 m)", 2_350_000, "🍽", "uy"],
  ["Konditsioner 9000 BTU (invertor)", 2_450_000, "❄️", "uy"],
  ["Yotoq (2 kishilik, matras bilan)", 2_450_000, "🛏", "uy"],
  ["Yugurish yo'lakchasi DreamFit (buklanadigan)", 2_464_500, "🏃", "erkak"],
  ["Noutbuk (o'quv, 8/256)", 2_600_000, "💻", "umumiy"],
  ["Muzlatgich Biryusa (205 l, 2 kamerali)", 2_618_030, "🧊", "uy"],
  ["Divan-krovat (burchakli)", 2_700_000, "🛋", "uy"],
  ["Kir yuvish mashinasi (avtomat, 8 kg)", 2_800_000, "🧺", "uy"],
  ["Elektr velosiped", 2_900_000, "🚴", "erkak"],
  ["Smartfon Samsung Galaxy A26 5G", 2_969_010, "📱", "umumiy"],
  // ── 3 mln+ — ATAYLAB KAM. Mavsumning yulduzi, katalogning yuragi EMAS.
  ["Konditsioner Artel Marvarid 12BE (invertor)", 3_249_000, "❄️", "uy"],
  ["Televizor 55 dyuym (Smart, 4K)", 3_400_000, "📺", "uy"],
  ["Muzlatgich (katta, No Frost, 350 l)", 3_650_000, "🧊", "uy"],
  ["Noutbuk (ish, 16/512)", 3_900_000, "💻", "umumiy"],
  ["Oshxona to'liq jihozi (plita + duxovka + vytyajka)", 4_200_000, "🍽", "uy"],
  ["Smartfon Honor X9d 5G (256 GB)", 4_274_050, "📱", "umumiy"],
  ["Smartfon Samsung Galaxy A57 5G", 4_507_080, "📱", "umumiy"],
  ["Motoblok (bog' uchun)", 4_800_000, "🚜", "erkak"],
];

function keyOf(name: string, taken: Set<string>): string {
  const base = name.toLowerCase()
    .replace(/[^a-z0-9\s-]/gi, "").trim().replace(/\s+/g, "-").slice(0, 40) || "mukofot";
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

/** `--fresh` — eski yuklamani ALMASHTIRISH.
 *  ⚠️ Sotilgan kartasi BOR mukofot HECH QACHON o'chirilmaydi: uning egasi bor va mukofot
 *  kunini kutyapti. Faqat `sold === 0` bo'lganlari tozalanadi. */
const FRESH = process.argv.includes("--fresh");

async function main(): Promise<void> {
  const row = await prisma.appState.findUnique({ where: { key: "oyin:catalog" } });
  let existing: OyinCatalogPrize[] = [];
  if (row) {
    try { existing = JSON.parse(row.value) as OyinCatalogPrize[]; } catch { existing = []; }
  }
  if (FRESH && existing.length > 0) {
    const soldRows = await prisma.appState.findMany({ where: { key: { startsWith: "oyin_sold:" } } });
    const sold = new Map<string, number>();
    for (const r of soldRows) sold.set(r.key.slice("oyin_sold:".length), Number(r.value) || 0);
    const before = existing.length;
    existing = existing.filter((p) => (sold.get(p.key) ?? 0) > 0);
    console.log(`♻️ FRESH: ${before} tadan ${existing.length} tasi saqlandi (sotilgan kartasi bor), ${before - existing.length} tasi tozalandi\n`);
  }
  const takenKeys = new Set(existing.map((p) => p.key));
  const takenNames = new Set(existing.map((p) => p.name.toLowerCase().trim()));

  const fresh: OyinCatalogPrize[] = [];
  let skipped = 0;
  // Arzondan qimmatga — birinchi 20 tasi OCHIQ. Ataylab: arzon mukofot tez to'ladi va
  // birinchi haftadayoq haqiqiy g'olib chiqadi. G'olibsiz oy dasturni o'ldiradi.
  const sorted = [...PRODUCTS].sort((a, b) => a[1] - b[1]);
  const bySegment = new Map<Segment, number>();
  const byBand = new Map<string, number>();
  for (const [name, value, icon, segment] of sorted) {
    if (takenNames.has(name.toLowerCase().trim())) { skipped++; continue; }
    bySegment.set(segment, (bySegment.get(segment) ?? 0) + 1);
    const band = value < 100_000 ? "<100k" : value < 500_000 ? "100-500k" : value < 1_500_000 ? "0,5-1,5mln" : value < 3_000_000 ? "1,5-3mln" : "3mln+";
    byBand.set(band, (byBand.get(band) ?? 0) + 1);
    const plan = oyinCardPlan(value, oyinSuggestTier(value));
    const key = keyOf(name, takenKeys);
    takenKeys.add(key);
    fresh.push({
      key, icon, name,
      valueLabel: `${value.toLocaleString("ru-RU").replace(/ /g, " ")} so'm`,
      price: plan.ballPrice,
      limit: plan.slots,
      photoUrl: null, // ⚠️ Uzum rasmlari OLINMADI (mualliflik). Ega panelda o'z rasmini qo'yadi.
      ...(fresh.length < OPEN_COUNT ? {} : { queued: true as const }),
      active: true,
    });
  }

  const totalValue = fresh.reduce((s, p) => s + (Number(p.valueLabel.replace(/\D/g, "")) || 0), 0);
  const totalBall = fresh.reduce((s, p) => s + p.price * p.limit, 0);
  const openN = fresh.filter((p) => p.queued !== true).length;

  console.log("🎁 KATALOG YUKLASH (uzum.uz nom va narxlari, 2026-08-04)\n");
  console.log(`   Katalogda hozir: ${existing.length} · qo'shiladi: ${fresh.length} · o'tkazildi: ${skipped}`);
  console.log(`   Ochiq: ${openN} · navbatda: ${fresh.length - openN}`);
  console.log(`   Katalog qiymati: ${totalValue.toLocaleString("ru-RU")} so'm`);
  console.log(`   To'liq to'lsa yig'iladi: ${(totalBall * OYIN_SOM_PER_BALL).toLocaleString("ru-RU")} so'm (${OYIN_PRIZE_MULTIPLIER}× qoplash)`);
  console.log(`   Segmentlar: ${[...bySegment].map(([s, c]) => `${s} ${c}`).join(" · ")}`);
  console.log(`   Narx bandlari: ${[...byBand].map(([b, c]) => `${b} ${c}`).join(" · ")}\n`);
  for (const p of fresh.slice(0, OPEN_COUNT)) {
    console.log(`   🟢 ${p.name.slice(0, 40).padEnd(42)} ${p.valueLabel.padStart(13)} ${String(p.price).padStart(6)} ball × ${p.limit}`);
  }
  console.log(`   … va yana ${fresh.length - openN} ta navbatda`);

  if (!APPLY) { console.log("\n⚠️ QURUQ YURISH — hech narsa yozilmadi. Yozish uchun: --apply"); return; }
  const next = [...existing, ...fresh];
  await prisma.appState.upsert({
    where: { key: "oyin:catalog" },
    create: { key: "oyin:catalog", value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) },
  });
  console.log(`\n✅ YOZILDI — katalogda endi ${next.length} ta mukofot.`);
  console.log("   ⚠️ Narx va rasm panelda to'g'irlanadi («🎁 Mukofotlar»).");
}

main()
  .catch((e) => { console.error("💥", e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
