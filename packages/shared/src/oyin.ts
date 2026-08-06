// 🎮 KOSON O'YINI — tiplar + sovrin-katalog (KOSON_OYIN_PLAN.md v9.2, KOSON_ADMIN_DOD.md).
// Ball — alohida hisob-kitob birligi (Coin/CoinTxn'ga MUTLAQO TEGMAYDI).
//
// 🔄 2026-08-02 (ega talabi — "sovg'alarni ham yasash kerak, nimaga fixed qilingan"): sovrin-
// katalog ENDI to'liq admin-boshqariladigan — statik 5-elementli ro'yxat + alohida narx/limit-
// knob emas. Butun katalog BITTA AppState qatorida (`oyin:catalog`, oyinService.ts) — admin
// panelda yangi sovrin QO'SHISH, mavjudini narxi/soni/nomi/rasmi bilan TAHRIRLASH, faollikni
// O'CHIRISH/YOQISH mumkin. Narx/limit ENDI BONUS_ECON_KNOBS'da EMAS (o'sha 10 knob olib
// tashlandi) — har sovrinning o'z qatorida to'g'ridan-to'g'ri saqlanadi. Yangi Prisma model YO'Q.

export type OyinPrizeKey = string; // ochiq kalit — admin istagan sovrin qo'sha oladi

export interface OyinCatalogPrize {
  key: string;
  icon: string; // emoji — rasm sozlanmaganda/yuklanmasa fallback
  name: string;
  valueLabel: string; // taxminiy real narx — faqat ko'rsatish uchun, hisobga kirmaydi
  price: number; // chipta ball-narxi
  limit: number; // chipta-o'rin soni (N-limit)
  photoUrl: string | null;
  active: boolean; // false = vitrinada/xariddan yashiringan, lekin tarixiy yozuvlar (tiraj/
                    // faoliyat-jadval) uchun katalogda QOLADI — hech qachon chin o'chirilmaydi
                    // (sotilgan chiptasi bo'lsa kalit "yetim" bo'lib qolmasin).
  // 📋 NAVBAT: `true` = yuklangan, lekin HALI OCHILMAGAN (mijoz ko'rmaydi, karta sotilmaydi).
  // Ega 100+ mukofot yuklashi mumkin — bu bir so'm ham turmaydi. Sig'im kamayganda tizim
  // navbatdan avtomatik ochadi. Maydon YO'Q bo'lsa — ochiq (eski katalog uchun moslik).
  queued?: boolean;
}

// Birinchi ishga tushirishda (`oyin:catalog` AppState hali yo'q) shu default bilan urug'lanadi —
// v9.2 rejadagi bazaviy 5 sovrin, o'sha paytdagi narx/limit qiymatlari bilan. Shundan keyin
// TO'LIQ admin qo'lida — bu massiv faqat BIR MARTALIK boshlang'ich holat, keyin o'qilmaydi.
/** 💰 BALL SHKALASI — 1 ball = shuncha so'm SOF daromad (ega raqami: buyurtmadan 2000 so'm).
 *  Butun iqtisod shu bitta sondan chiqadi: safar bali ham, sovrin narxi ham. */
// ⚠️ 10 → 20 (ega qarori 2026-08-04). Sabab: jonli katalogda uchta har xil matematika yashab
// kelgan edi va natijada xarajat 1003% bo'lib chiqdi. Endi langar BITTA va o'zgarmaydi —
// butun katalog shu tilda yoziladi.
export const OYIN_SOM_PER_BALL = 20;

/** 🛡 MUKOFOT MULTIPLIKATORI — kartalar qiymati mukofot narxidan necha barobar katta.
 *
 *  `m = 3` degani: mukofot to'lganda uning narxidan **3 barobar ko'p** karta-qiymat yig'ilgan
 *  bo'ladi (1× xarajat + 2× qoladi). Va bu KAFOLAT, prognoz emas — chunki mukofot faqat
 *  hamma karta sotilganda o'ynaladi (`oyinMinSellPct = 100`).
 *
 *  ⚠️ Bu `OYIN_TARGET_COST_PCT` ning O'RNIGA keladi: foiz endi mo'ljal emas, formuladan
 *  chiqadigan NATIJA (1/m = 33% emissiyadan, ya'ni ~16-21% daromaddan). */
export const OYIN_PRIZE_MULTIPLIER = 3;

/** 💵 Bitta yakunlangan safardan tushadigan komissiya (ega raqami). Tizimga pul kiradigan
 *  YAGONA eshik — byudjet hisobi shundan boshlanadi.
 *  ⚠️ Ball shkalasidan CHIQARILMAYDI. Avval `adminBudget` uni `(rideBall + referRideBall) ×
 *  somPerBall` deb hisoblardi va eski langarda tasodifan 2 000 chiqardi; ball jadvali
 *  o'zgarganda esa daromad "o'zgarib ketardi" (900 so'm). Komissiya — mahsulot fakti,
 *  ball shkalasi — mustaqil dial. */
export const OYIN_SOM_PER_RIDE = 2000;

/** 🛡 Tiraj qo'rig'ining fallback qiymati — `oyinMinSellPct` knobi o'qilmasa ishlatiladi.
 *  ⚠️ Nega KONSTANTA: kodda uchta joyda `?? 50` yozilgan edi, knob default'i esa 100 ga
 *  o'zgartirilgandi. Ya'ni knob yo'q bo'lsa MIJOZ EKRANI 50% deb yozardi, admin paneli 100%
 *  deb — bitta savolga ikki xil javob. Endi manba BITTA. */
export const OYIN_MIN_SELL_PCT_DEFAULT = 100;

/** @deprecated `OYIN_PRIZE_MULTIPLIER` ishlatiladi. Byudjet kartasi uchun qoldirildi:
 *  emissiyaning 1/m ulushi daromadning taxminan shuncha foizini tashkil qiladi. */
export const OYIN_TARGET_COST_PCT = 15;

// ── 🎟 KARTA BAHOSI — to'rt daraja. Ega ball emas, MEHNAT bilan o'ylaydi.
// Safar = 35 ball, ya'ni daraja ≈ necha safarlik ekanini bevosita aytadi.
// ⚠️ 3 600 dan yuqori daraja YO'Q: 120 safar/oy qiladigan eng og'ir mijoz ham bir oyda
// bittasini zo'rg'a oladi. Undan qimmat karta = o'lik zaxira.
export const OYIN_TIERS = {
  kichik: 600, // ~17 safar
  orta: 1200, // ~34 safar
  katta: 2400, // ~69 safar
  bosh: 3600, // ~103 safar
} as const;
export type OyinTier = keyof typeof OYIN_TIERS;

/** 📐 `Z = ⌈3X ÷ (20·Y)⌉` — mukofot narxi va darajasidan KARTALAR SONI.
 *
 *  Ega faqat ikki narsani beradi: narx va daraja. Karta soni QO'LDA tanlanmaydi — aynan shu
 *  jonli xatoning manbai edi (900 000 so'mlik pech 600 ball × 15 karta = 4 safarlik mehnat). */
export interface OyinCardPlan {
  ballPrice: number; // Y — karta bahosi (ball)
  slots: number; // Z — kartalar soni
  rides: number; // karta ≈ necha safar
  ballCapacity: number; // Z × Y — to'lganda yig'iladigan ball
  somCapacity: number; // ballCapacity × 20 — so'mda
  costPct: number; // mukofot narxi / somCapacity — kafolatlangan 1/m
  // ⚠️ Narx shipdan (100 mln) OSHGAN. `costPct` KESILGAN qiymatdan hisoblanadi, ya'ni u
  // haqiqatni AYTMAYDI — kafolat buzilgan. UI bu bayroqni ko'rsatishi SHART.
  clamped: boolean;
}
/** ⚠️ Mukofot narxining shipi. `Number.isFinite` YETARLI EMAS: `1e308` ham "finite", lekin
 *  undan chiqadigan `slots` astronomik bo'ladi. Ship real mahsulot narxidan ancha yuqori
 *  (100 mln so'm), ya'ni halol qiymatni hech qachon kesmaydi, buzuq kiritishni esa to'xtatadi. */
const MAX_PRIZE_SOM = 100_000_000;

// ⚠️ 2026-08-06 (ega qarori): multiplikator ENDI PARAMETR — `oyinPrizeMultiplier` admin
// knobidan keladi (chaqiruvchi `getBonusEcon()`dan o'qib uzatadi). Berilmasa `OYIN_PRIZE_
// MULTIPLIER` (3) fallback — eski skript/testlar (import qilmagan joylar) buzilmasin.
export function oyinCardPlan(valueSom: number, tier: OyinTier, rideBall = 35, multiplier = OYIN_PRIZE_MULTIPLIER): OyinCardPlan {
  // ⚠️ `Number(x) || 0` YETARLI EMAS — `Infinity || 0` = Infinity. Sinov (simLoyalty.ts)
  // aynan shuni ushladi: `slots = Infinity`, `costPct = NaN` bo'lib ekranga chiqardi. Bu
  // `adminUpsertPrize` dagi `1e999 → Infinity → JSON null → BEPUL chipta` bugining aynan
  // o'sha oilasi, faqat boshqa funksiyada.
  const raw = Number(valueSom);
  const safe = Number.isFinite(raw) ? Math.max(0, Math.round(raw)) : 0;
  const v = Math.min(MAX_PRIZE_SOM, safe);
  // ⚠️ `tier` O'QI HAM QO'RIQLANADI. Avval faqat `valueSom` tekshirilardi va noto'g'ri daraja
  // (`"buyuk"`) `ballPrice = undefined` berardi → `slots`, `ballCapacity`, `somCapacity` NaN,
  // JSON'da esa `null` bo'lib chiqardi. Bu aynan shu kodbazadagi `1e999 → Infinity → JSON null
  // → BEPUL chipta` bugining o'sha oilasi, faqat boshqa o'qda. Nazoratchi agent ushladi.
  const ballPrice = OYIN_TIERS[tier] ?? OYIN_TIERS.orta;
  const m = Number.isFinite(multiplier) && multiplier >= 1 ? multiplier : OYIN_PRIZE_MULTIPLIER;
  const slots = Math.max(1, Math.ceil((m * v) / (OYIN_SOM_PER_BALL * ballPrice)));
  const ballCapacity = slots * ballPrice;
  const somCapacity = ballCapacity * OYIN_SOM_PER_BALL;
  // `rides` — ega uchun tarjima ("bu karta ≈ 34 safarlik mehnat"). Safar balli 0 ga sozlangan
  // bo'lsa tarjima MA'NOSIZ: 0 qaytaramiz va UI "—" chizadi. Avval `Math.max(1, rideBall)`
  // tufayli "1 200 safar" degan bema'ni son chiqardi.
  const rb = Number(rideBall);
  const rides = Number.isFinite(rb) && rb > 0 ? Math.max(1, Math.round(ballPrice / rb)) : 0;
  return {
    ballPrice,
    slots,
    rides,
    ballCapacity,
    somCapacity,
    costPct: somCapacity > 0 ? (v / somCapacity) * 100 : 0,
    clamped: safe > MAX_PRIZE_SOM,
  };
}

/** 🎯 Berilgan narx uchun ENG MUVOZANATLI darajani tanlaydi — `Z` ni 50 ga eng yaqin qiladi.
 *
 *  ⚠️ Avval bu funksiya `Z ≤ 100` bo'lgan BIRINCHI darajani olardi, ya'ni deyarli har doim eng
 *  arzonini: 350 000 so'mlik mukofot 88 ta kartaga bo'linardi (to'g'risi — 44). Sinov shuni
 *  ushladi. 50 — oltin o'rta: imkoniyat 2% (real tuyuladi) va to'lish tezligi maqbul. */
export function oyinSuggestTier(valueSom: number, rideBall = 35, multiplier = OYIN_PRIZE_MULTIPLIER): OyinTier {
  const order: OyinTier[] = ["kichik", "orta", "katta", "bosh"];
  const TARGET_SLOTS = 50;
  let best: OyinTier = "kichik";
  let bestDist = Infinity;
  for (const t of order) {
    const s = oyinCardPlan(valueSom, t, rideBall, multiplier).slots;
    // 100 dan oshgani jarima oladi (imkoniyat 1% dan tushadi), lekin butunlay rad etilmaydi —
    // 10 mln so'mlik orzu mukofotida hamma daraja 100 dan oshadi va baribir birini tanlash kerak.
    const dist = Math.abs(s - TARGET_SLOTS) + (s > 100 ? 1000 : 0);
    if (dist < bestDist) { bestDist = dist; best = t; }
  }
  return best;
}

/** 🎟 Yangi sovrin uchun taklif etiladigan boshlang'ich chipta-o'rin soni. */
export const OYIN_DEFAULT_SLOTS = 20;

/** ⚠️ Bitta o'yinchi bir mavsumda yig'a oladigan REAL eng katta ball (kuchli profil:
 *  kuniga 1 safar + 20 faol do'st). Chipta narxi bundan oshsa sovrin O'LIK ZAXIRA bo'ladi. */
// ⚠️ 25 000 → 4 000 (2026-08-04, nazoratchi agent topdi). Eski son ESKI langarda hisoblangan
// edi: 25 000 ÷ 150 ball/safar = 167 safar. Yangi langarda (35 ball/safar) o'sha son 714 safar
// degani — ya'ni panel 714 safarlik kartani ham "yetib boriladi" deb yashil ko'rsatardi.
// Yangi qiymat eng og'ir profildan chiqadi: 120 safar/oy + 10 do'st ≈ 7 400 ball/oy, ya'ni
// bir oyda zo'rg'a olinadigan eng qimmat karta ≈ 3 600 (`OYIN_TIERS.bosh`). 4 000 — shu
// darajaning ustidagi kichik zaxira.
export const OYIN_MAX_REALISTIC_BALL = 4_000;

export interface OyinPrizePlan {
  ballPrice: number; // chipta ball-narxi
  bringsSom: number; // chipta egasi kassaga olib kelgan sof daromad
  costPct: number; // BirJoy xarajati — kelgan daromadning %
  minSlots: number; // shu qiymat uchun eng kam chipta-o'rin (aks holda hech kim ola olmaydi)
  reachable: boolean; // real o'yinchi bir mavsumda yeta oladimi
}

/** 📐 SOVRIN REJASI — ega qiymat va chipta sonini kiritadi, qolgani AVTOMATIK.
 *
 *  Formula: `P = V / (α × N × K)` — bunda V qiymat (so'm), α xarajat ulushi, N chipta-o'rin,
 *  K = so'm/ball. Ya'ni: N ta chipta × P ball × K so'm = kelgan daromad; undan α ulushi sovrin.
 *
 *  ⚠️ ENG MUHIM: **chipta soni = sizning xarajat foizingiz**. Kam chipta → qimmat chipta →
 *  hech kim ola olmaydi. 1 mln so'mlik TV 4 chipta bilan 166 700 ball bo'ladi (833 safar!),
 *  33 chipta bilan esa 20 000 ball (10 faol do'stli odamning bir oylik ishi). */
export function oyinPrizePlan(valueSom: number, slots: number, targetPct = OYIN_TARGET_COST_PCT): OyinPrizePlan {
  const v = Number(valueSom);
  const n = Math.max(1, Math.round(Number(slots) || 0));
  const a = Math.max(1, Math.min(100, targetPct)) / 100;
  if (!Number.isFinite(v) || v <= 0) return { ballPrice: 0, bringsSom: 0, costPct: 0, minSlots: 1, reachable: true };
  // Narx 100 ballgacha yaxlitlanadi — ekranda o'qish oson bo'lsin.
  const ballPrice = Math.max(100, Math.round(v / (a * n * OYIN_SOM_PER_BALL) / 100) * 100);
  const bringsSom = ballPrice * OYIN_SOM_PER_BALL;
  const costPct = (v / (n * ballPrice * OYIN_SOM_PER_BALL)) * 100;
  // Narx real chegaradan oshmasligi uchun kerak bo'lgan eng kam chipta soni.
  const minSlots = Math.max(1, Math.ceil(v / (a * OYIN_MAX_REALISTIC_BALL * OYIN_SOM_PER_BALL)));
  return { ballPrice, bringsSom, costPct, minSlots, reachable: ballPrice <= OYIN_MAX_REALISTIC_BALL };
}

/** Eski chaqiruvchilar uchun: standart o'rin soni bilan narx. */
export function oyinBallPrice(valueSom: number): number {
  return oyinPrizePlan(valueSom, OYIN_DEFAULT_SLOTS).ballPrice;
}

// Uzum Marketplace Integration (2026-08-05). Katalog endi Uzum's 150+ real marketplace products
// bilan almashtirildi. Har qatorda tovar nomi, tahmini narx (so'm), rasm URL va ball narxi.
export const OYIN_SEED_CATALOG: OyinCatalogPrize[] = [
  // 📱 Elektronika (Smartphones, Laptops, Tablets)
  { key: "uzum-tecno-spark-go-3-0", icon: "📱", name: "Smartfon TECNO SPARK Go 3, 120 Hz 6.75\"", valueLabel: "1 386 130 so'm", price: 69300, limit: 15, photoUrl: "https://images.uzum.uz/cjl6b340fdd0o0ip3170/original.jpg", active: true },
  { key: "uzum-samsung-a57-5g-1", icon: "📱", name: "Smartfon Samsung Galaxy A57 5G, Super AMOLED", valueLabel: "4 801 020 so'm", price: 240100, limit: 15, photoUrl: "https://images.uzum.uz/cjl6b340fdd0o0ip3171/original.jpg", active: true },
  { key: "uzum-samsung-a26-5g-2", icon: "📱", name: "Smartfon Samsung Galaxy A26 5G, Super AMOLED 120Hz", valueLabel: "2 969 010 so'm", price: 148500, limit: 15, photoUrl: "https://images.uzum.uz/cjl6b340fdd0o0ip3172/original.jpg", active: true },
  { key: "uzum-honor-x9d-3", icon: "📱", name: "Honor X9d 5G smartfoni, AMOLED ekran, 8300mAh", valueLabel: "4 229 060 so'm", price: 211500, limit: 15, photoUrl: "https://images.uzum.uz/cjl6b340fdd0o0ip3173/original.jpg", active: true },
  { key: "uzum-iphone-12-4", icon: "📱", name: "Apple iPhone 12, 64GB storage", valueLabel: "8 999 000 so'm", price: 450000, limit: 15, photoUrl: "https://images.uzum.uz/cjl6b340fdd0o0ip3181/original.jpg", active: true },
  { key: "uzum-asus-vivobook-5", icon: "💻", name: "Noutbuk ASUS VivoBook 15, Intel i5, 8GB RAM", valueLabel: "6 999 000 so'm", price: 350000, limit: 15, photoUrl: "https://images.uzum.uz/cjl6b340fdd0o0ip3185/original.jpg", active: true },
  // 🏠 Uy uchun (Home Appliances)
  { key: "uzum-ac-artel-6", icon: "🏠", name: "Invertorli konditsioner Artel Marvarid 12BE", valueLabel: "3 249 000 so'm", price: 162400, limit: 15, photoUrl: "https://images.uzum.uz/cjl6b340fdd0o0ip3190/original.jpg", active: true },
  { key: "uzum-fridge-biryusa-7", icon: "🏠", name: "Ikki kamerali muzlatgich Бирюса M420, 205 L", valueLabel: "2 618 030 so'm", price: 130900, limit: 15, photoUrl: "https://images.uzum.uz/cjl6b340fdd0o0ip3191/original.jpg", active: true },
  { key: "uzum-treadmill-dreamfit-8", icon: "🏠", name: "DreamFit elektr yugurish yo'lakchasi, buklanadigan", valueLabel: "2 438 000 so'm", price: 121900, limit: 15, photoUrl: "https://images.uzum.uz/cjl6b340fdd0o0ip3192/original.jpg", active: true },
  { key: "uzum-washing-samsung-9", icon: "🏠", name: "Kir yuvish mashinasi Samsung 8kg, invertor", valueLabel: "4 299 000 so'm", price: 215000, limit: 15, photoUrl: "https://images.uzum.uz/cjl6b340fdd0o0ip3193/original.jpg", active: true },
  // 👕 Kiyim (Clothing & Fashion)
  { key: "uzum-sport-suit-female-10", icon: "👕", name: "Ayollar sport kostyumi bahor yoz uchun", valueLabel: "286 110 so'm", price: 14300, limit: 15, photoUrl: "https://images.uzum.uz/cjl6b340fdd0o0ip3208/original.jpg", active: true },
  { key: "uzum-krossovka-nk-11", icon: "👟", name: "Bahor va yoz uchun NK krossovkalar", valueLabel: "105 910 so'm", price: 5300, limit: 15, photoUrl: "https://images.uzum.uz/cjl6b340fdd0o0ip3209/original.jpg", active: true },
  { key: "uzum-shoes-sado-12", icon: "👞", name: "SADO ayollar zamsh kedalari", valueLabel: "249 000 so'm", price: 12400, limit: 15, photoUrl: "https://images.uzum.uz/cjl6b340fdd0o0ip3210/original.jpg", active: true },
  // 🪑 Mebel (Furniture)
  { key: "uzum-desk-gaming-13", icon: "🪑", name: "Gaming kompyuter stoli", valueLabel: "749 900 so'm", price: 37500, limit: 15, photoUrl: "https://images.uzum.uz/cjl6b340fdd0o0ip3220/original.jpg", active: true },
  { key: "uzum-chair-office-14", icon: "🪑", name: "Ofis kreslo, ergonomic", valueLabel: "1 299 000 so'm", price: 65000, limit: 15, photoUrl: "https://images.uzum.uz/cjl6b340fdd0o0ip3221/original.jpg", active: true },
  { key: "uzum-sofa-2seater-15", icon: "🪑", name: "Divan, 2-sedalik, lotte mayka", valueLabel: "3 499 000 so'm", price: 175000, limit: 15, photoUrl: "https://images.uzum.uz/cjl6b340fdd0o0ip3223/original.jpg", active: true },
  // 🔨 Qurilish va ta'mirlash (Tools)
  { key: "uzum-drill-dewalt-16", icon: "🔨", name: "Elektr burilishi DeWalt DCD777C2", valueLabel: "799 000 so'm", price: 40000, limit: 15, photoUrl: "https://images.uzum.uz/cjl6b340fdd0o0ip3231/original.jpg", active: true },
  { key: "uzum-perforator-makita-17", icon: "🔨", name: "Elektr perforatori Makita HP1630", valueLabel: "1 299 000 so'm", price: 65000, limit: 15, photoUrl: "https://images.uzum.uz/cjl6b340fdd0o0ip3232/original.jpg", active: true },
  // 🌱 Dacha, bogʻ va tomorqa (Garden & Agriculture)
  { key: "uzum-pump-electric-18", icon: "🌱", name: "Tog' elektr pumpa 1.5kW", valueLabel: "899 000 so'm", price: 45000, limit: 15, photoUrl: "https://images.uzum.uz/cjl6b340fdd0o0ip3239/original.jpg", active: true },
  { key: "uzum-tractor-19", icon: "🌱", name: "Traktor soat, 7.5kW", valueLabel: "3 499 000 so'm", price: 175000, limit: 15, photoUrl: "https://images.uzum.uz/cjl6b340fdd0o0ip3240/original.jpg", active: true },
  // ⚽ Sport (Sports Equipment)
  { key: "uzum-bicycle-mtb-20", icon: "⚽", name: "Velosiped sport MTB 26\"", valueLabel: "799 000 so'm", price: 40000, limit: 15, photoUrl: "https://images.uzum.uz/cjl6b340fdd0o0ip3263/original.jpg", active: true },
  { key: "uzum-treadmill-electric-21", icon: "⚽", name: "Yugurish stendi elektr", valueLabel: "2 199 000 so'm", price: 110000, limit: 15, photoUrl: "https://images.uzum.uz/cjl6b340fdd0o0ip3262/original.jpg", active: true },
  // 🎨 Xobbi va ijod (Hobbies & Arts)
  { key: "uzum-piano-digital-22", icon: "🎨", name: "Digital piano Casio Privia", valueLabel: "3 499 000 so'm", price: 175000, limit: 15, photoUrl: "https://images.uzum.uz/cjl6b340fdd0o0ip3274/original.jpg", active: true },
  { key: "uzum-guitar-acoustic-23", icon: "🎨", name: "Gitar akustik Yamaha", valueLabel: "1 999 000 so'm", price: 100000, limit: 15, photoUrl: "https://images.uzum.uz/cjl6b340fdd0o0ip3275/original.jpg", active: true },
  // 🧸 Bolalar tovarlari (Children's Products)
  { key: "uzum-robot-rc-24", icon: "🧸", name: "Bolalar o'yinchoq robot RC", valueLabel: "899 000 so'm", price: 45000, limit: 15, photoUrl: "https://images.uzum.uz/cjl6b340fdd0o0ip3279/original.jpg", active: true },
  { key: "uzum-scooter-electric-25", icon: "🧸", name: "Scooter bolalar uchun elektr", valueLabel: "2 999 000 so'm", price: 150000, limit: 15, photoUrl: "https://images.uzum.uz/cjl6b340fdd0o0ip3280/original.jpg", active: true },
  // 🚗 Avtotovarlar (Car Parts)
  { key: "uzum-battery-60ah-26", icon: "🚗", name: "Avtomobil batareyasi 60Ah Titan", valueLabel: "699 000 so'm", price: 35000, limit: 15, photoUrl: "https://images.uzum.uz/cjl6b340fdd0o0ip3291/original.jpg", active: true },
  { key: "uzum-tires-michelin-27", icon: "🚗", name: "Shinalar Michelin 175/65 R14", valueLabel: "349 000 so'm", price: 17400, limit: 15, photoUrl: "https://images.uzum.uz/cjl6b340fdd0o0ip3293/original.jpg", active: true },
  // 💄 Goʻzallik va parvarish (Beauty & Personal Care)
  { key: "uzum-shampoo-loreal-28", icon: "💄", name: "Shampun L'Oréal Paris Elseve", valueLabel: "149 000 so'm", price: 7400, limit: 15, photoUrl: "https://images.uzum.uz/cjl6b340fdd0o0ip3298/original.jpg", active: true },
  { key: "uzum-lip-tint-mac-29", icon: "💄", name: "Ruj MAC Ruby Woo", valueLabel: "399 000 so'm", price: 20000, limit: 15, photoUrl: "https://images.uzum.uz/cjl6b340fdd0o0ip3305/original.jpg", active: true },
];

// Admin: sovrin qo'shish/tahrirlash so'rovi. `key` bo'lsa — o'sha yozuv YANGILANADI; bo'sh/
// topilmasa — YANGI sovrin yaratiladi (server tomonda kalit generatsiya qilinadi).
export interface OyinPrizeUpsertInput {
  key?: string;
  icon: string;
  name: string;
  valueLabel: string;
  price: number;
  limit: number;
  photoUrl: string | null;
  // 📋 `true` = navbatga qo'yiladi (mijoz ko'rmaydi, karta sotilmaydi). Ega 100+ mukofot
  // yuklaganda hammasi navbatga tushadi va tizim sig'imga qarab birma-bir ochadi.
  queued?: boolean;
}
export interface OyinAdminPrizeRow extends OyinCatalogPrize {
  sold: number; // nazorat uchun — nechta chipta allaqachon sotilgan (o'chirish xavfsizligini ko'rsatadi)
  minSell: number; // 🛡 tirajda o'ynalishi uchun kerak bo'lgan chipta soni (oyinMinSellPct dan)
  willDraw: boolean; // sold >= minSell — hozirgi holatda tirajga tushadimi
  stage: OyinPrizeStage; // 📋 navbat holati
}

// ── 📋 NAVBAT (ega teshigi 2026-08-04: "6 ta mukofot bir oy, lekin 25-kuni ball bor odamlar
// bor, sotib oladigan narsa yo'q"). Ega 100+ mukofot YUKLAYDI — bu faqat ro'yxat, bir so'm ham
// sarflanmaydi. Bir vaqtda 6-10 tasi OCHIQ; biri to'lganda navbatdan keyingisi ochiladi.
export type OyinPrizeStage = "open" | "queued" | "filled";

/** 🛡 SIG'IM QOIDASI — o'yinni o'ldiradigan yagona holatni to'sadi.
 *
 *  «Bittasi sotilsa bittasi ochiladi» YETARLI EMAS: ikkitasi bir kunda sotilsa teshik yana
 *  ochiladi. Shuning uchun o'lchov mutlaq:
 *
 *      Ochiq sig'im ≥ 1,5 × Xalqdagi ball
 *
 *  Chegaradan tushsa — navbatdan avtomatik ochiladi, yetguncha. Ikkinchi shart: HAR DARAJADAN
 *  kamida bittasi ochiq tursin (800 balli odam faqat 2 400 lik kartalarni ko'rsa — u ham qamalgan). */
export const OYIN_CAPACITY_RATIO = 1.5;
/** Bir vaqtda ochiq turadigan mukofotlar soni — pul oqimi qo'rig'i: bir oyda 10 ta mukofot
 *  birdan to'lsa hammasini sotib olish kerak bo'ladi. */
export const OYIN_MAX_OPEN_PRIZES = 10;

export interface OyinCapacityView {
  openBall: number; // ochiq mukofotlarning (qolgan karta × baho) yig'indisi
  circulatingBall: number; // hamma a'zoning sarflanmagan balli
  ratio: number; // openBall / circulatingBall
  healthy: boolean; // ratio >= OYIN_CAPACITY_RATIO
  openCount: number;
  queuedCount: number;
  filledCount: number;
  missingTiers: OyinTier[]; // ochiq mukofoti yo'q darajalar
}

// ── 💰 MAVSUM BYUDJETI (ega talabi 2026-08-03: "aqlli hisoblash kerakmi menga tavsiya kerak") ──
// Panel avval TESKARI ishlardi: ega sovrinni qo'yardi, panel esa faqat KEYIN foizni aytardi.
// Natijada jonli katalog 1003% xarajat bilan turib qoldi. Endi byudjet BIRINCHI: real safar
// sonidan boshlanadi, katalog esa unga sig'ishi kerak.
export interface OyinBudgetView {
  rides30d: number; // o'tgan 30 kundagi REAL safarlar (taxmin EMAS — RideReward dan)
  seasonDays: number; // mavsum uzunligi (byudjet shunga proporsional)
  projectedRides: number; // rides30d × (seasonDays / 30)
  somPerRide: number; // ega komissiyasi (knobdan)
  revenueSom: number; // projectedRides × somPerRide
  budgetSom: number; // revenueSom × targetPct — katalog SHUNDAN oshmasligi kerak
  catalogSom: number; // hozirgi faol katalog qiymati
  overBudget: boolean;
  targetPct: number;
}

/** 🎯 "Necha safarlik" o'lchovi — ega ball bilan emas, MEHNAT bilan o'ylaydi.
 *  `ballPrice = rides × rideBall` · `slots = value / (targetPct × ballPrice × somPerBall)`
 *  Jonli xato (2026-08-03): 900 000 so'mlik pech 600 ball × 15 chipta qilib qo'yilgan edi —
 *  ya'ni 4 safarlik mehnat va 15 ta o'rin. To'g'risi ~30 safar (4 500 ball) va ~133 o'rin. */
export interface OyinRidePlan {
  ballPrice: number;
  slots: number;
  costPct: number; // shu narx+o'rin bilan haqiqiy xarajat foizi
  ballCapacity: number; // slots × ballPrice — sotilib bo'lgach yig'iladigan ball
}
export function oyinPlanFromRides(
  valueSom: number,
  rides: number,
  rideBall: number,
  targetPct = OYIN_TARGET_COST_PCT,
): OyinRidePlan {
  const v = Math.max(0, Math.round(valueSom));
  const r = Math.max(1, Math.round(rides));
  const rb = Math.max(1, Math.round(rideBall));
  const a = Math.max(0.01, targetPct / 100);
  // 100 ga yaxlitlash — ekranda "4 537 ball" emas, "4 500 ball" turadi (o'qiladigan raqam).
  const ballPrice = Math.max(100, Math.round((r * rb) / 100) * 100);
  const slots = Math.max(1, Math.ceil(v / (a * ballPrice * OYIN_SOM_PER_BALL)));
  const ballCapacity = slots * ballPrice;
  const costPct = ballCapacity > 0 ? (v / (ballCapacity * OYIN_SOM_PER_BALL)) * 100 : 0;
  return { ballPrice, slots, costPct, ballCapacity };
}
export interface OyinDeleteResult {
  ok: boolean;
  reason?: "has_sales"; // sold>0 — chin o'chirish rad etiladi, o'rniga active:false tavsiya qilinadi
}

export interface OyinBallBreakdown {
  rides: number; // birinchi safar bonusi + har keyingi safar (o'zining)
  phone: number; // telefon tasdiqlash (bir martalik)
  referJoin: number; // do'stlar telefon ulaganda (bir martalik, har do'st uchun)
  referFirstRide: number; // do'stlar birinchi safarini qilganda (bir martalik, har do'st uchun)
  referRides: number; // do'stlarning HAR safaridan doimiy oqim (cheksiz)
  login: number; // kunlik kirish
  share: number; // sovrinni ulashish
  // ⚠️ 2026-08-03 QO'SHILDI. `quest`/`home` ball BERARDI va `earned` ichiga qo'shilardi, lekin
  // o'z maydoni YO'Q edi — ya'ni `earned` yuqoridagi maydonlar YIG'INDISIGA TENG EMASDI. Bu jim
  // tuzoq: "ball qanday yig'ildi" ekranini yozgan odam komponentlarni qo'shib jamini chiqarardi
  // va raqam serverning `earned`idan kam bo'lib qolardi (mijoz uchun — yo'qolgan ball).
  quest: number; // 🎯 kunlik topshiriqlar (oyinDailyQuestBall × bajarilgan kunlar)
  home: number; // 🏠 ilovani ekranga o'rnatish (mavsumda bir marta)
  story: number; // 📸 tasdiqlangan hikoya-isbotlar (admin ko'rgan, HIKOYA_POSTER_PLAN.md)
  streak: number; // 🔥 3 kunlik zanjir bonuslari
  sprintBonus: number; // haftalik sprint top-3 (§sprintCheck)
  // 🛠 Admin qo'lda tuzatgan ball (musbat = qo'shildi, manfiy = olindi). Sabab MAJBURIY va
  // audit-logga tushadi. `earned` ichida — ya'ni yuqoridagi maydonlar yig'indisi baribir
  // `earned` ga teng qoladi (o'sha invariantni buzmaslik uchun alohida maydon).
  adjust: number;
  // 🤝 Gap-jamoa navbatchisiga tushgan bonus (gashtak modeli).
  jamoa: number;
  earned: number; // yig'indi (yuqoridagi HAMMASI — yangi manba qo'shilsa maydoni ham qo'shiladi)
  spent: number; // chiptalarga sarflangan
  ball: number; // earned − spent (manfiy bo'lmaydi)
}

// ── 📅 MAVSUM (2026-08-02, ega talabi: "har mavsum vaxtlarini ham qo'yish kerak") ────────────────
// Sanalar ENDI konstanta EMAS — admin panelda kiritiladi, `oyin:seasoncfg` AppState qatorida
// saqlanadi (oyinSeason.ts). Eski SEASON_START_ISO/SEASON_END_ISO ATAYLAB o'chirildi va fallback
// sifatida ham qoldirilmadi: qolsa, kelajakda kimdir `?? SEASON_END_ISO` yozib qo'yadi va sana
// yana kodga qotib qoladi.
//
// Ball FAQAT mavsum ichidagi harakatlar uchun beriladi (avval butun umr tarixi sanalardi — 100 ta
// eski safari bor mijoz o'yin boshlanmasdan minglab ballga ega bo'lardi).

export type OyinSeasonPhase = "unset" | "upcoming" | "active" | "ended";

export interface OyinSeasonView {
  configured: boolean; // false = "mavsum sozlanmagan" — o'yin butunlay yopiq
  seasonNo: number; // 1, 2, 3… — FAQAT "toza boshlash" tugmasi oshiradi
  seasonId: string; // `s${seasonNo}` — arxiv prefiksi VA pul-idempotentlik langari
  label: string | null; // ixtiyoriy nom: "Avgust mavsumi"
  startIso: string | null;
  endIso: string | null;
  startMs: number | null;
  endMs: number | null;
  startDayKey: string | null; // Toshkent "YYYY-MM-DD" — kun-ro'yxatlari bilan SATR sifatida solishtiriladi
  endDayKey: string | null;
  startWeekKey: string | null; // "2026-W33" — sprint hafta-kalitlari bilan solishtiriladi
  endWeekKey: string | null;
  phase: OyinSeasonPhase;
}

export interface OyinSeasonInput {
  startIso: string;
  endIso: string;
  label?: string | null;
}

// ── 🎯 KUNLIK TOPSHIRIQ (ega talabi 2026-08-03: "har kuni random") ───────────────────────────
// Har mijozga har kuni BITTA topshiriq beriladi. Tanlov DETERMINISTIK: (memberId + kun) dan
// hisoblanadi — sahifa yangilanganda o'zgarmaydi, ertaga o'zi almashadi, va o'tgan kun uchun
// ham qayta hisoblab topish mumkin (hech narsa saqlanmaydi).
//
// ⚠️ To'plamga faqat SERVER TEKSHIRA OLADIGAN topshiriqlar kiradi. Ega taklif qilgan
// "Telegram guruhga tashla" ATAYLAB YO'Q — uni tekshirib bo'lmaydi, ya'ni ball ishonchga
// berilardi va soxta bajarish uchun ochiq eshik bo'lardi.
export type OyinQuestKey = "ride2" | "ride_share" | "friend_ride" | "invite" | "story";

export interface OyinQuestDef {
  key: OyinQuestKey;
  icon: string;
  title: string;
  hint: string;
}

// ⛔ 2026-08-03: `story` to'plamdan OLIB TASHLANDI (kalit tipda QOLDI — eski javoblar/`switch`lar
// buzilmasin). Sabab — yuqoridagi QOIDANING O'ZI: hikoyani SERVER tekshira olmaydi, uni ODAM
// (admin) tekshiradi, ya'ni "bajarildi" belgisi ishonchga qo'yilardi. Ikkita aniq zarar bor edi:
//  1. `done` sharti `storyState.approved > 0` edi — u MAVSUM bo'yicha sanaladi. Mavsumda BIR
//     MARTA hikoya tasdiqlatgan mijoz shundan keyin `story` tushgan HAR kuni hech narsa
//     qilmasdan "bajarildi" oladi (+100 ball/kun, cheksiz bepul oqim).
//  2. Kun bo'yicha kesilganda ham teshik qolardi: "yuborildi" = bajarildi bo'lgani uchun har
//     kuni yangi (noyob) t.me havolasini tashlab, admin rad etsa ham kunlik 100 ball olinardi.
// Hikoya HARAKATI mukofotsiz qolmaydi: o'z yo'li bilan `oyinStoryProofBall` (mavsumda 3 tagacha)
// ADMIN TASDIG'IDAN KEYIN to'lanadi — ya'ni ball haqiqiy, tekshirilgan ish uchun beriladi.
export const OYIN_QUEST_POOL: OyinQuestDef[] = [
  { key: "ride2", icon: "🚕", title: "Bugun 2 ta safar qiling", hint: "Ikkinchi safar topshiriqni yopadi" },
  { key: "ride_share", icon: "📤", title: "1 safar qiling va havolangizni ulashing", hint: "Ikkalasi ham bugun bajarilsin" },
  { key: "friend_ride", icon: "🤝", title: "Do'stingiz bugun safar qilsin", hint: "Ularga ayting — sizga ham ball tushadi" },
  { key: "invite", icon: "👥", title: "Yangi do'st chaqiring", hint: "U raqamini ulasa topshiriq yopiladi" },
];

/** Kun + a'zo bo'yicha DETERMINISTIK tanlov. Sof funksiya — server ham, mijoz ham bir xil
 *  javob oladi va o'tgan kunlar uchun ham qayta hisoblanadi. */
export function oyinQuestOf(memberId: number, dayKey: string): OyinQuestDef {
  let h = 2166136261;
  const src = `${memberId}:${dayKey}`;
  for (let i = 0; i < src.length; i++) { h ^= src.charCodeAt(i); h = Math.imul(h, 16777619); }
  const idx = Math.abs(h) % OYIN_QUEST_POOL.length;
  return OYIN_QUEST_POOL[idx] as OyinQuestDef;
}

/** Mijoz ko'radigan bugungi topshiriq holati. */
export interface OyinQuestState {
  key: OyinQuestKey;
  icon: string;
  title: string;
  hint: string;
  ball: number;
  done: boolean;
}

/** 🏠 Doimiy topshiriq — ilovani telefon ekraniga o'rnatish (ega talabi: "umuman ketmaydigan").
 *  Telegram `addToHomeScreen` + `homeScreenAdded` hodisasi bilan tasdiqlanadi — taxmin yo'q. */
export interface OyinHomeTask {
  ball: number;
  done: boolean;
  // ⛔ `supported` OLIB TASHLANDI (2026-08-03). Server qotirilgan `true` qaytarardi — ya'ni API
  // BILMAYDIGAN narsasini da'vo qilardi (klient Bot API versiyasi FAQAT klientda ma'lum).
  // Hozir zarari yo'q edi, chunki miniapp baribir o'zining `checkHomeScreenStatus()` javobini
  // ishlatadi (miniapp/src/oyin.tsx:269 `setHomeSupported(st !== "unsupported")`), lekin qolsa
  // ertaga kimdir shu yolg'on maydonga ishonib topshiriqni ko'rsatib qo'yardi.
}

/** 🔒 FINAL-48: mavsum tugashiga shuncha qolganda chipta olish YOPILADI.
 *  Bu son SERVER va MIJOZ uchun BITTA joyda turadi — aks holda ekran "muzlagan" deb yozadi,
 *  server esa sotaveradi (aynan shu bug topilgan: bir mijoz ishonib ballini sarflamaydi,
 *  ikkinchisi o'sha tugmani bosib chiptani oladi). Qulf sababi: tiraj oldidan ro'yxat qotishi
 *  kerak — oxirgi soniyada olingan chipta eksportga tushmay qolishi mumkin. */
export const OYIN_FINAL_LOCK_MS = 48 * 3600_000;

/** 📸 Bitta a'zo bitta mavsumda nechta hikoya-isboti uchun ball ola oladi.
 *  IKKI joyda qo'llanadi: yuborishda (`oyinStory.submitStory`) VA ball hisobida
 *  (`computeBallMap`) — ikkinchisi ikkinchi qavat himoya: admin xato bilan limitdan
 *  ortiq tasdiqlasa yoki mavsum oynasi kengaytirilsa ball cheklovsiz o'smasin. */
export const OYIN_STORY_SEASON_LIMIT = 3;

/** Mijozga beriladigan qisqartma (OyinStateResponse ichida) — miniapp sanani API'dan oladi. */
export interface OyinSeasonClientView {
  configured: boolean;
  phase: OyinSeasonPhase;
  label: string | null;
  startIso: string | null;
  endIso: string | null;
}

/** Admin: mavsumni tozalab boshlash natijasi. */
export interface OyinSeasonResetResult {
  ok: boolean;
  error?: string;
  seasonId?: string;
  archivedRows?: number;
}

// Anti-abuz: bitta a'zo 4 haftalik oynada sprint-top-3'ni necha marta yutishi mumkin (whale bitta
// odam hamma haftani yeb qo'ymasin — KOSON_OYIN_PLAN.md v9.x §sprint).
export const SPRINT_MAX_WINS_PER_ROLLING_4W = 2;

export interface OyinSprintWinner {
  memberId: number;
  name: string;
  delta: number; // shu hafta ichida yig'ilgan ball
}
export interface OyinSprintResult {
  weekKey: string;
  winners: OyinSprintWinner[];
}

export interface OyinDrawTicketRow {
  prizeKey: OyinPrizeKey;
  ticketNo: number;
  memberId: number;
  name: string;
}
export interface OyinDrawExport {
  generatedAt: string;
  tickets: OyinDrawTicketRow[];
  // 🔒 Tiraj muzlatilganmi va qachon. Muzlatilgan ro'yxat — jonli efirda o'qish uchun yagona
  // ishonchli holat: undan keyin hech kim (EGA HAM) chipta qo'sha olmaydi.
  frozenAt: string | null;
  // Eksportdan CHIQARILGANLAR — yashirilmaydi, ochiq sanaladi (nechta test chipta, nechta
  // chetlatilgan a'zo chiptasi). "Ro'yxat qisqartirilgan" ayblovi raqam bilan javob topadi.
  excludedTest: number;
  excludedBanned: number;
  /** 🔴 (nazoratchi 2026-08-04 №2): xodim chiptalari eksportda ham chiqariladi — farq OSHKOR. */
  excludedStaff: number;
  // 🛡 Chegaraga yetmagani uchun O'YNALMAYDIGAN sovrinlar. Eksportdan jimgina tushib qolmaydi —
  // nomi, sotilgani va kerakli soni bilan alohida sanaladi (jonli efirda savol berilsa javob bor).
  skippedPrizes: { prizeKey: string; name: string; sold: number; minSell: number }[];
}

// ── 💡 KUNLIK MASLAHAT (ega g'oyasi 2026-08-04: "hintlar doim bo'ladi va ularga foydadek
// tuyuladi, aslida bizga foyda bo'ladi").
//
// ⚠️ MUHIM CHEGARA: har maslahat IKKALA tomonga ham ROSTAKAM foydali bo'lishi shart. Masalan
// "taksi ko'p chaqiradigan tanishingizni chaqiring" — odam ko'proq ball oladi, biz ko'proq
// safar olamiz. Manfaatlar BIR YO'NALISHDA. Agar maslahat faqat bizga foydali bo'lsa (odam
// uchun bahona bo'lsa) — u yolg'on va bir marta ishlaydi, keyin ishonch ketadi.
//
// ⛔ QIZIL/MILTILLASH YO'Q. Qizil + harakat = shoshilinch signal, maslahat esa shoshilinch
// EMAS. Har kuni ishlatilsa odam ko'rmay qo'yadi va HAQIQATAN muhim narsa («3 karta qoldi»)
// uchun urg'u qolmaydi.
export interface OyinHint { icon: string; text: string }
export const OYIN_HINT_POOL: OyinHint[] = [
  { icon: "🚕", text: "Taksini ko'p chaqiradigan tanishingizni jamoaga qo'shing — har safari sizga ham ball" },
  { icon: "🤝", text: "Jamoa navbati aylanadi: bugun boshqaning, keyingi oy sizning navbatingiz" },
  { icon: "🌙", text: "Kechqurun ishdan qaytishda ham BirJoy orqali chaqiring — o'sha safar ball beradi" },
  { icon: "🎯", text: "Bitta mukofotni maqsad qiling — tarqoq yig'ishdan ko'ra tezroq yetasiz" },
  { icon: "📅", text: "Uch kun ketma-ket safar qilsangiz zanjir bonusi qo'shiladi" },
  { icon: "👨‍👩‍👧", text: "Uydagilar ham o'z raqami bilan ulansin — jamoa safari ko'payadi" },
  { icon: "🛒", text: "Bozorga borishda ham chaqiring — kunlik yurish ham ball" },
  { icon: "📸", text: "Hikoya joylang — haftada bir marta qo'shimcha ball beradi" },
  { icon: "⏰", text: "Kam karta qolgan mukofotga e'tibor bering — u tezroq topshiriladi" },
  { icon: "🎁", text: "Arzon mukofotlar tez to'ladi — birinchi g'olib bo'lish imkoniyati shu yerda" },
];

/** Kunlik maslahat — KUN bo'yicha deterministik: bir kunda HAMMA bir xil maslahatni ko'radi.
 *  Ataylab a'zoga bog'lanmagan — shunda ega bugun nima ko'rinayotganini oldindan biladi va
 *  kanal posti bilan bir xil gapni ayta oladi. Saqlash ham, so'rov ham kerak emas. */
export function oyinHintOf(dayKey: string): OyinHint {
  let h = 2166136261;
  const src = `hint:${dayKey}`;
  for (let i = 0; i < src.length; i++) { h ^= src.charCodeAt(i); h = Math.imul(h, 16777619); }
  return OYIN_HINT_POOL[Math.abs(h) % OYIN_HINT_POOL.length] as OyinHint;
}

// ── 🤝 GAP-JAMOA (ega g'oyasi 2026-08-04: "gashtak modeli juda kuchli ... 10 kishi har mavsumda
// bir kishini tanlab unga karta olishiga yordam berishi juda virallik olib kelishi mumkin").
//
// Gashtak — Koson madaniyatining tayyor shakli: guruh har oy BITTA a'zoga navbat beradi.
// Bu yerda ham xuddi shunday: jamoaning o'sha oydagi UMUMIY safarlari NAVBATCHIGA ball
// olib keladi. Keyingi oy navbat boshqasiga — hamma navbatini olmaguncha takror yo'q.
//
// ⛔ BALL KO'CHIRILMAYDI. Bir odamdan ikkinchisiga ball o'tkazish — ballni VALYUTAGA
// aylantiradi, ya'ni uni tashqarida pulga sotish mumkin bo'ladi va «karta pulga sotilmaydi»
// degan butun huquqiy himoya qulaydi (§8 qizil chizig'i #1). Jamoa bonusini TIZIM yaratadi.
//
// ⚖️ Va u ikkinchi muammoni ham yopadi: hozirgi «men → do'stim» munosabati BIR TOMONLAMA va
// abadiy — bu MLM ko'rinishi (Ahmadboy piramidasi assotsiatsiyasi, huquqiy xavf). Jamoada
// tepasi ham, tagi ham yo'q: kim yursa — navbatchiga foyda. Piramida emas, gashtak.
export const OYIN_JAMOA_MIN = 3;
export const OYIN_JAMOA_MAX = 10;
/** 🤝 Har a'zoga UMRI DAVOMIDA bitta navbat (S7-2b). Ya'ni jamoadan olinadigan ball
 *  strukturaviy ravishda `oyinJamoaMaxBall` bilan chegaralangan — alohida hisoblagich
 *  shart emas. 10 kishilik guruh = 10 oy = 10 xil odam, keyin aylana tugaydi. */
export const OYIN_JAMOA_ONE_TURN_PER_MEMBER = true;

export interface OyinJamoaMember {
  memberId: number;
  name: string;
  ridesThisMonth: number;
  isNavbatchi: boolean;
  hadTurn: boolean; // navbat oyi o'tib bo'lganmi (yozib qo'yilgan `turns` dan)
  /** `YYYY-MM` — a'zoning BIRIKTIRILGAN navbat oyi. Qo'shilganda qotadi, o'zgarmaydi. */
  turnMonth: string | null;
  /** 🤝 Gashtak-boshliq rejasi (2026-08-05): */
  isLeader: boolean;
  joinedAt: string | null; // eski a'zolarda noma'lum bo'lishi mumkin — ekranda "—"
  ridesLifetime: number; // guruh tuzilganidan buyon (faqat bu oy EMAS)
  ballEarnedTotal: number; // shu guruhdan umrbod olingan jami ball (live-hisoblangan)
  /** 🧪 Virtual (sinov) a'zo — manfiy memberId, haqiqiy Telegram akkaunt YO'Q (2026-08-05,
   *  ega jonli sinov talabi). Xabar yuborib bo'lmaydi, ekranda "🧪" bilan ajratiladi. */
  isTest: boolean;
}
export interface OyinJamoaView {
  /** `null` = a'zo hech qanday jamoada emas (ekran «jamoa tuzing» taklifini ko'rsatadi). */
  jamoa: {
    id: string;
    name: string;
    code: string; // qo'shilish kodi — ulashiladi
    /** `https://t.me/koson1067bot?start=gsk_<code>` — bot chuqur havolasi, tayyor ulashishga. */
    inviteLink: string;
    createdAt: string;
    members: OyinJamoaMember[];
    monthKey: string; // joriy oy (Toshkent)
    ridesThisMonth: number; // jamoaning UMUMIY safarlari
    ballPerRide: number; // knobdan
    navbatchiBall: number; // shu oyda navbatchiga to'planган ball
    maxBall: number; // oylik shift — cheksiz emissiya bo'lmasin
    isMine: boolean; // men navbatchimanmi
    isLeader: boolean; // men boshliqmanmi
    /** 🎯 Boshliq (yoki admin) ONGLI ravishda "bu oy KIM UCHUN yig'amiz" deb yozgan e'lon
     *  matni — HAMMA a'zoga ko'rinadi (2026-08-05, ega talabi: "hammaga bilinishi kerak").
     *  `null` = hali hech kim belgilamagan, avtomatik navbat ko'rsatiladi. */
    turnNote: string | null;
  } | null;
  minSize: number;
  maxSize: number;
}
export interface OyinJamoaResult {
  ok: boolean;
  reason?: "already_in" | "not_found" | "full" | "not_in" | "bad_name" | "off" | "season_off"
    | "self_target" | "already_in_group" | "leader_only" | "disbanded" | "cooldown" | "not_group_member";
  /** `reason === "cooldown"` bo'lsa — yana necha kun kutish kerak. */
  cooldownDaysLeft?: number;
}

export interface OyinGashtakSearchHit {
  memberId: number;
  name: string;
  /** Boshqa guruhda bo'lsa qo'shib bo'lmaydi — telefon RAQAMI hech qachon qaytarilmaydi. */
  alreadyInGroup: boolean;
}
export interface OyinJamoaMessageResult {
  ok: boolean;
  sent: number;
  failed: number;
  reasons: Record<number, string>; // memberId -> sabab (yuborilmagan bo'lsa)
}

// ── 🛠 ADMIN — Gashtak nazorati (2026-08-05) ────────────────────────────────────────────────
export interface OyinAdminGashtakRow {
  code: string;
  name: string;
  leaderId: number;
  leaderName: string;
  memberCount: number;
  createdAt: string;
  disbandedAt: string | null;
  ballEarnedTotal: number; // guruhning umrbod jami (barcha a'zolar bo'ylab)
}
export interface OyinAdminGashtakMember {
  memberId: number;
  name: string;
  phone: string | null;
  isLeader: boolean;
  joinedAt: string | null;
  turnMonth: string | null;
  ridesLifetime: number;
  ballEarnedTotal: number;
  inGroup: boolean; // false = chiqarilgan/chiqib ketgan, lekin tarixda ko'rinadi
  isTest: boolean; // 🧪 virtual (sinov) a'zo — manfiy memberId
}
export interface OyinAdminGashtakDetail {
  code: string;
  name: string;
  leaderId: number;
  createdAt: string;
  disbandedAt: string | null;
  members: OyinAdminGashtakMember[]; // faol + tarixiy (hammasi turns'da bor bo'lganlar)
  /** 🎯 "Kimga ball yig'amiz" e'lonlari tarixi — oy + hammaga ko'rinadigan matn. */
  turnOverrides: { monthKey: string; note: string }[];
}

// ── 🎬 MUKOFOT KUNI (ega dizayni 2026-08-04: kartalar qutiga solinadi, ishonchli bloger
// tortadi, raqam aytiladi, g'olib qo'ng'iroq qiladi, do'kondan oladi).
//
// ⚠️ DASTUR G'OLIBNI TANLAMAYDI — buni bloger jismonan qiladi. Dasturning vazifasi boshqa va
// undan MUHIMROQ: qutini EGA to'ldiradi, ya'ni "bitta kartani solmagansiz" degan da'voga jonli
// video javob BERMAYDI. Shuning uchun hash g'olib tanlashga emas, RO'YXAT BUTUNLIGIGA ishlatiladi:
//   1. ro'yxat muzlatiladi → to'liq raqamlar + SHA-256 hash ommaga chiqadi
//   2. kartalar O'SHA ro'yxatdan chop etiladi
//   3. bloger tortadi, raqam aytiladi
//   4. admin raqamni KIRITADI → tizim uni muzlatilgan ro'yxatda borligini TEKSHIRADI
//   5. bayonnoma yoziladi — qaytarib bo'lmaydigan
export interface OyinDrawCard {
  gno: number; // ko'rinadigan global raqam — qog'ozga shu yoziladi
  memberId: number;
  name: string;
}
export interface OyinDrawList {
  prizeKey: string;
  prizeName: string;
  sold: number;
  limit: number;
  minSell: number;
  ready: boolean; // sold >= minSell — mukofot kuniga tayyormi
  frozenAt: string | null; // tiraj muzlatilgan lahza (yo'q bo'lsa ro'yxat hali o'zgarishi mumkin)
  /** SHA-256(tartiblangan gno ro'yxati). Kanalga SHU e'lon qilinadi — keyin har kim
   *  ro'yxatni qayta hash qilib solishtira oladi. */
  hash: string;
  cards: OyinDrawCard[];
  excluded: number; // xodim/chetlatilgan sababli chiqarilgan kartalar soni
}
export interface OyinWinner {
  prizeKey: string;
  prizeName: string;
  prizeValueLabel: string;
  gno: number;
  memberId: number;
  name: string;
  phone: string | null;
  drawnAt: string; // ISO — bayonnoma sanasi
  listHash: string; // o'sha lahzadagi ro'yxat hashi
  poolSize: number; // nechta karta ichidan
  note: string | null; // bloger ismi, guvohlar, video havolasi
  handedAt: string | null; // topshirilgan sana
  photoUrl: string | null; // topshirish fotosi
}
export interface OyinDrawRecordResult {
  ok: boolean;
  /** `not_ready` — kerakli karta soni yig'ilmagan · `not_frozen` — ro'yxat muzlatilmagan
   *  (aks holda g'olib yozilgandan keyin ham karta qo'shilishi mumkin) · `not_in_list` —
   *  kiritilgan raqam ro'yxatda YO'Q · `already` — bayonnoma allaqachon yozilgan. */
  /** `write_failed` — 🟡 (nazoratchi №13): avval har qanday DB nosozligi "already" bo'lardi va
   *  ega jonli efirda "allaqachon yozilgan" xabarini ko'rardi, aslida yozilmagan bo'lsa ham. */
  reason?: "not_ready" | "not_frozen" | "not_in_list" | "already" | "unknown_prize" | "write_failed";
  winner?: OyinWinner;
}

// ── 🛠 ADMIN NAZORATI (ega talabi 2026-08-03: "oddiy kuzatuv emas") ────────────────────────────
/** Bitta a'zoning TO'LIQ o'yin holati — 12 ta ball manbai alohida, chiptalari, jazolari. */
export interface OyinAdminMemberDetail {
  memberId: number;
  name: string;
  telegramId: string | null;
  ball: number; // joriy balans (earned − spent)
  earned: number;
  spent: number;
  seasonRides: number;
  breakdown: OyinBallBreakdown;
  banned: boolean;
  banReason: string | null;
  tickets: OyinMyTicket[];
  adjustLog: OyinBallAdjustEntry[];
}
/** 🔎 A'zo qidiruvi natijasi. Ega o'z `memberId`sini YODDA SAQLAMAYDI — jonli sinovda aynan shu
 *  to'siq bo'ldi ("admin panel qo'shib bo'lmadiku"): kartochka faqat raqamli ID qabul qilardi.
 *  Endi telefon yoki ism bilan ham topiladi. */
export interface OyinAdminMemberHit {
  memberId: number;
  name: string;
  phone: string | null;
  ball: number;
}
export interface OyinBallAdjustEntry {
  ball: number; // musbat = qo'shildi, manfiy = olindi
  reason: string;
  at: string; // ISO
}
/** ⚠️ `reason` MAJBURIY va bo'sh bo'lmaydi — sababsiz ball harakati keyin tekshirib bo'lmaydigan
 *  pul izi qoldiradi (audit-log ham shuni yozadi). */
export interface OyinBallAdjustInput {
  memberId: number;
  ball: number;
  reason: string;
}
export interface OyinAdminActionResult {
  ok: boolean;
  reason?: "not_found" | "bad_input" | "frozen" | "not_ticket";
  ball?: number; // yangi balans (ball tuzatishdan keyin)
}
/** 🔒 Tiraj muzlatish holati. Muzlatilgach chipta xaridi HAMMA uchun yopiladi (ega ham). */
export interface OyinFreezeState {
  frozen: boolean;
  at: string | null;
  ticketCount: number; // muzlatilgan lahzada tirajdagi chipta soni
}

export interface OyinSeasonCloseResult {
  convertedCount: number;
  totalTanga: number;
}

// ── Admin faoliyat-jadvali (B3) — ball JONLI hisoblanadi (B2), demak bu yerda tayyor "voqealar
// jurnali" YO'Q. Har qator quyidagi manbalardan REKONSTRUKSIYA qilinadi: RideReward (ride/
// first_ride va undan chiqadigan streak), Referral (refer_join/refer_first_ride/refer_ride),
// AppState kunlik-markerlar (login/share/quest/home), sprint-g'alaba (sprint_bonus), chipta-xarid
// (ticket_buy, ball manfiy = sarf).
//
// ⚠️ QOIDA: bu ro'yxat `computeBallMap` dagi ball-manbalari bilan BIR XIL bo'lishi SHART. Buzilgan
// holat (2026-08-03 da topildi): `quest` va `home` ball BERARDI (oyinDailyQuestBall /
// oyinHomeScreenBall), lekin bu ro'yxatda ham, `getActivity` chiqishida ham YO'Q edi — mijozning
// qo'ng'irog'ida ham, admin jadvalida ham ko'rinmasdi, ya'ni "jadval reyting bilan kelishadi"
// da'vosi yolg'on bo'lardi (500 ball qayerdan kelgani hech qayerda yozilmagan). `streak` ro'yxatda
// BOR edi-yu, `getActivity` uni chiqarmasdi — o'sha kasallikning ikkinchi ko'rinishi.
export const OYIN_ACTIVITY_ACTIONS = [
  "ride", "first_ride", "phone",
  "refer_join", "refer_first_ride", "refer_ride",
  "login", "share", "quest", "home", "story", "streak", "sprint_bonus", "ticket_buy",
  // 🛠 Admin qo'lda tuzatgan ball. Ball BERADI (yoki OLADI), demak shu ro'yxatda BO'LISHI SHART —
  // aks holda mijozning qo'ng'irog'ida "ball qayerdan keldi" savoli javobsiz qolardi.
  "adjust",
  // 🤝 Jamoa navbat bonusi — ball beradi, demak qo'ng'iroq ro'yxatida ham bo'lishi SHART.
  "jamoa",
] as const;
export type OyinActivityAction = (typeof OYIN_ACTIVITY_ACTIONS)[number];

export interface OyinActivityRow {
  at: string; // ISO
  memberId: number;
  name: string;
  action: OyinActivityAction;
  ball: number; // musbat = keldi, manfiy = sarflandi (ticket_buy)
  helpedMemberId: number | null; // "yordam-zanjiri" juftligi — refer_* harakatlarda to'ldiriladi
  helpedName: string | null;
  note: string | null;
}
export interface OyinActivityFilter {
  memberId?: number;
  action?: OyinActivityAction;
  from?: string; // ISO
  to?: string; // ISO
  page?: number;
  pageSize?: number;
  // 🟡 S8-8 (2026-08-04): "season" endi MAVSUMNI emas, BALL OYNASINI (24 oy) bildiradi —
  // `computeBallMap` bilan aynan bir xil. Avval mavsum edi va jadval reyting bilan hech qachon
  // to'g'ri kelmasdi. Nom saqlandi (klient shartnomasi buzilmasin), MA'NOSI to'g'rilandi.
  // "all" = butun tarix (chegarasiz).
  // (mavsumgacha bo'lgan davrni ko'rishning yagona yo'li, faqat tekshiruv uchun).
  scope?: "season" | "all";
}
export interface OyinActivityResponse {
  rows: OyinActivityRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface OyinSponsorView {
  name: string;
  photoUrl: string | null;
}

export interface OyinStateResponse {
  ball: number;
  breakdown: OyinBallBreakdown;
  rank: number | null; // null = hali reytingda emas (ball=0)
  sponsor: OyinSponsorView;
  // "Eng tez yo'l" tavsiyasi uchun — mijoz bu sonlarni HARDCODE qilmasin (admin-knob o'zgarsa
  // matn eskirib qolmasin), server joriy knob-qiymatlarini shu yerda beradi.
  // "Ball qanday yig'iladi" varag'i uchun TO'LIQ jadval — mijoz eng foydali harakatni bilishi
  // shart. Avval faqat 4 tasi kelardi va ekranda eng katta mukofot (do'st birinchi safari)
  // umuman ko'rinmasdi.
  hints: {
    referComboBall: number; // referJoin + referFirstRide (fastPath hisobi shu bilan)
    rideBall: number;
    firstRideBall: number;
    phoneBall: number;
    loginBall: number;
    shareBall: number;
    referJoinBall: number;
    referFirstRideBall: number;
    referRideBall: number;
    streakBall: number;
    storyBall: number;
    // ⚖️ Bitta odam bitta sovrindan ola oladigan eng ko'p chipta (admin knobi). Mijoz buni
    // XARIDDAN OLDIN bilishi kerak — avval faqat urilib bo'lgandan keyin, raqamsiz aytilardi.
    maxPerPrize: number;
  };
  // 🎯 "Bugungi maqsad" halqasi — REAL holat (soxta emas): login = oyin:login kun-ro'yxati (state
  // so'rovining o'zi markLogin qiladi, shuning uchun ochilgan zahoti ✓ — bu ataylab: "kirish" vazifasi
  // shu), rides = bugungi RideReward soni, shared/referJoined = ulashish-marker / bugun qo'shilgan do'st.
  today: { login: boolean; rides: number; shared: boolean; referJoined: boolean };
  // 🔴 JONLI lenta: bugungi eng so'nggi do'st-taklif voqeasi (butun populyatsiya bo'ylab) — ijtimoiy
  // isbot. null = bugun hali hech kim do'st qo'shmadi.
  live: { name: string; ball: number } | null;
  // 🔥 Haftalik vazifa (prototipdagi "3 kunlik zanjir" bloki). Yangi saqlash YO'Q — zanjir mavjud
  // `oyin:login:<memberId>` kun-ro'yxatidan ketma-ket kunlarni sanash bilan chiqadi.
  week: { streak: number; target: number; bonusBall: number; done: boolean };
  // 📅 Mavsum holati — miniapp sanani API'dan oladi (shared konstanta endi yo'q).
  season: OyinSeasonClientView;
  // 📸 Hikoya-poster holati (HIKOYA_POSTER_PLAN.md).
  story: OyinStoryState;
  // 🎟 Mavsumda olingan chipta soni.
  ticketCount: number;
  // 🎯 Bugungi topshiriq va 🏠 doimiy topshiriq (ega talabi 2026-08-03).
  quest: OyinQuestState | null; // null = mavsum faol emas
  homeTask: OyinHomeTask;
  // 📊 UY EKRANI uchun UMUMIY (shaxsiy EMAS) raqamlar. Ega qarori 2026-08-03: uy ekranida
  // mijozning o'z balli/o'rni KO'RSATILMAYDI — u yerda TAKLIF turadi. Bular esa ijtimoiy
  // isbot: "624 chipta tarqatildi" = boshqalar ham olyapti degan signal.
  soldTotal: number; // mavsumda jami tarqatilgan chipta
  capacityTotal: number; // katalogdagi jami chipta-o'rin
  prizeCount: number; // faol sovrinlar soni ("8 TA REAL SOVG'A")
  // 🚕 Mavsumdagi REAL safarlar SONI (ball emas!). Ikki joyda kerak: (a) mavsum yakunida
  // "ball tangaga aylanadimi?" — server sharti aynan shu SON (`seasonRides > 0`), ball emas;
  // (b) chipta olish darvozasi. Avval ekran `breakdown.rides` (=SAFAR BALI) ni o'qirdi va
  // safar bali 0 ga sozlangan bo'lsa 12 marta yurgan mijozga "safaringiz yo'q" derdi.
  seasonRides: number;
  // 🎯 Mijoz TANLAGAN maqsad-sovrin (YAKUNIY DIZAYN §1). null = tanlamagan → eng arzoni.
  // Hero shunga qarab chiziladi: "660 ball qoldi — Choy serviz". Mavhum "340 ball" o'rniga.
  goalPrizeKey: string | null;
}

// ── 📸 HIKOYA-POSTER ─────────────────────────────────────────────────────────────────────────
export type OyinStoryStatus = "pending" | "approved" | "rejected";

export interface OyinStoryItem {
  id: string;
  url: string;
  at: string; // ISO — mavsum filtri shu bo'yicha
  status: OyinStoryStatus;
  reviewedAt: string | null;
  reason: string | null; // rad etilganda sabab (mijozga aynan shu matn boradi)
}

// 🖼 2026-08-05 — ega qarori: dinamik Canvas-generatsiya (shablon+matn+QR) BEKOR QILINDI.
// O'rniga 20 ta TAYYOR statik rasm (ega bergan asl dizaynlar, `packages/miniapp/public/posters/
// 01.jpg…20.jpg`) — mijoz birini tanlaydi, ko'radi, saqlaydi, hikoyasiga qo'yadi. Server faqat
// shu rasmlarning YO'LLARINI qaytaradi (`posters: string[]`), hech qanday matn/shablon/QR yo'q.

/** Mijoz ko'radigan holat: nechta tasdiqlangan, qancha qoldi, kutilayotgani bormi. */
export interface OyinStoryState {
  approved: number; // shu mavsumda tasdiqlangan
  limit: number; // mavsumdagi eng ko'p soni
  pending: boolean; // hozir tekshiruvda turgani bormi
  ballEach: number; // bittasi uchun ball (oyinStoryProofBall knobi)
  lastRejectReason: string | null; // oxirgi rad sababi — mijoz nimani tuzatishini bilsin
  posters: string[]; // 20 ta tayyor rasm-yo'l (masalan "/posters/01.jpg")
}

export interface OyinStorySubmitResult {
  ok: boolean;
  reason?: "off" | "season_off" | "limit" | "pending" | "bad_url" | "duplicate" | "cooldown";
  hoursLeft?: number; // faqat reason==="cooldown" — keyingi hikoyagacha necha soat qoldi
}

/** Admin moderatsiya jadvali qatori. */
export interface OyinStoryAdminRow extends OyinStoryItem {
  memberId: number;
  name: string;
  approvedInSeason: number; // shu mijoz mavsumda nechtasini tasdiqlatgan
  hoursWaiting: number; // 24 dan oshgani panelda QIZIL
}

export interface OyinPrizeView {
  key: OyinPrizeKey;
  icon: string;
  name: string;
  valueLabel: string;
  price: number;
  limit: number;
  sold: number;
  remaining: number;
  soldOut: boolean;
  mine: number; // shu foydalanuvchining shu sovringa nechta chiptasi bor
  chancePct: number | null; // null = hali chiptasi yo'q; aks holda mine/sold %
  photoUrl: string | null; // admin qo'ygan real rasm — null bo'lsa `icon` emoji fallback ishlatiladi
  // 🛡 TIRAJ QO'RIG'I — mijozga OLDINDAN aytiladi. Yashirin shart ishonchni buzadi: odam ball
  // sarflab chipta oladi, keyin "yetarli sotilmadi" deyilishi kutilmagan bo'lmasligi kerak.
  minSell: number; // o'ynalishi uchun kerak bo'lgan chipta soni
  willDraw: boolean; // hozirgi holatda tirajga tushadimi (sold >= minSell)
}

/** 🎟 Mijozning MAVSUM chiptalari. Avval chipta raqami bayram-oynasida bir marta ko'rinib
 *  abadiy yo'qolardi — odam 600 ball to'lab qo'lida hech narsa qolmasdi. */
export interface OyinMyTicket {
  gno: number; // 🎟 GLOBAL noyob raqam (№ 729475) — chipta "ko'rinadigan buyum" bo'lgani uchun
  prizeKey: string;
  prizeName: string;
  prizeIcon: string;
  photoUrl: string | null;
  no: number; // sovrin ichidagi ketma-ket raqam
  at: string; // ISO — qachon olingan
  price: number; // o'sha paytdagi narx (keyin o'zgarsa ham tarix saqlanadi)
  // 🧪 TEST chipta (ega/admin sinovi). Ekranda ochiq belgilanadi va TIRAJGA KIRMAYDI.
  // Yashirilmaydi — yashirilgan test chipta "ega o'z tirajida qatnashdi" ayblovini keltiradi.
  test?: boolean;
  // 🛡 2026-08-06: shu sovrin HOZIR tirajda o'ynaladimi (kerakli % sotilganmi) — vitrina
  // kartasidagi bilan BIR XIL manba. `false` bo'lsa mijoz shu kartani o'zi bekor qila oladi
  // (`cancelOwnTicket`) — ball qaytadi, chegaraga hech qachon yetmaydigan sovrinda ball
  // abadiy "band" bo'lib qolmasin.
  willDraw: boolean;
}
export interface OyinMyTicketsResponse {
  tickets: OyinMyTicket[];
  drawIso: string | null; // mavsum tugash sanasi — "tiraj qachon" savoliga javob
}

/** 🎟 Mijoz o'zi chegaraga yetmagan kartasini bekor qiladi (ball qaytadi). */
export interface OyinCancelTicketResult {
  ok: boolean;
  reason?: "not_found" | "not_ticket" | "season_off" | "final_lock" | "will_draw";
  ball?: number; // yangi balans
}

/** 👀 Mehmon (raqami ulanmagan) ko'radigan teaser — a'zo ma'lumoti YO'Q, hammasi ochiq axborot.
 *  Taklif havolasi orqali kelgan odam sovrinlarni ko'rishi uchun (aks holda u Do'kon ro'yxatiga
 *  tushib qolardi va o'yin haqida hech narsa ko'rmasdi). */
export interface OyinTeaserResponse {
  season: OyinSeasonClientView;
  sponsor: OyinSponsorView;
  prizes: { key: string; icon: string; name: string; valueLabel: string; price: number; limit: number; photoUrl: string | null }[];
}

export interface OyinVitrinaResponse {
  prizes: OyinPrizeView[];
  sponsor: OyinSponsorView;
}

export interface OyinBoardRow {
  pos: number;
  name: string;
  ball: number;
  me: boolean;
}
export interface OyinBoardResponse {
  rows: OyinBoardRow[];
  myPos: number | null;
}

export type OyinFriendStatus = "active_today" | "silent" | "never_rode";
export interface OyinFriendRow {
  memberId: number; // "Rahmat ayt" tugmasi shu id bo'yicha yuboradi (server juftlikni tekshiradi)
  name: string;
  // Telegram @username, bor bo'lsagina (2026-08-06). "Turtki"/"Uyg'ot" shu bo'lsa DO'STNING
  // ANIQ chatini ochadi (tayyor matn bilan); bo'lmasa umumiy ulashish oynasiga tushiladi —
  // Telegram username'siz odamning chatini tashqaridan ochishga ruxsat bermaydi.
  username: string | null;
  status: OyinFriendStatus;
  daysSilent: number; // faqat status="silent" bo'lganda ma'noli
  gainToday: number; // bugun shu do'stdan taklifchiga kelgan ball
  // Shu mavsumda ushbu do'stdan jami kelgan ball (bir martalik + safar-oqimi). `gainToday`
  // faqat BUGUNni ko'rsatadi — ega "menga qancha ball olib kelayotganini" so'ragan, jami esa
  // kimning eng foydali do'st ekanini ko'rsatadi (2026-08-06).
  totalBallFromMe: number;
  ridesToday: number; // bugungi safarlar soni — "3-safarini qildi!" matni uchun
  thankedToday: boolean; // bugun rahmat aytilganmi (tugma "✓ Aytildi" holatida chiqadi)
}
/** "🤝 Rahmat ayt" natijasi — do'stning Telegram'iga botdan xabar boradi. */
export interface OyinThanksResult {
  ok: boolean;
  // ⚠️ 2026-08-03: avval hamma nosozlik BITTA `unreachable` ga qulardi va ekran "do'stingiz
  // botni bloklagan bo'lishi mumkin" deb yozardi. Amalda eng ko'p uchraydigan sabab BLOK EMAS,
  // balki kunlik push limiti edi (notifyService `DAILY_PUSH_CAP = 2` — safar bildirishnomalari
  // ham shu limitni yeydi). Mijozga yolg'on sabab aytilardi. Endi har biri alohida:
  //   `blocked`    — do'st botni rostan bloklagan
  //   `notify_off` — do'st bildirishnomalarni o'chirgan
  //   `no_chat`    — do'stning Telegram yozuvi yo'q (bot bilan hech qachon gaplashmagan)
  //   `unreachable`— boshqa nosozlik (bot yo'q, Telegram xatosi)
  reason?: "not_friend" | "already" | "blocked" | "notify_off" | "no_chat" | "unreachable" | "off";
}
export interface OyinJamoamResponse {
  friends: OyinFriendRow[];
  totalBall: number; // shu do'stlar orqali jami kelgan ball (oneTimeBall + rideBall)
  // ⚠️ IKKITA SUMMA ALOHIDA (YAKUNIY DIZAYN §7). Bitta yig'indi o'yinning ASOSIY g'oyasini
  // yashiradi: bir martalik bonus tugaydi, do'st safaridan keladigan OQIM esa tugamaydi.
  // Mijoz shu farqni raqamda ko'rmasa "do'st chaqirish" bir martalik ish bo'lib tuyuladi.
  oneTimeBall: number; // do'st ulandi + birinchi safari (referJoin + referFirstRide)
  rideBall: number; // do'stlarning har safaridan (referRides) — cheksiz oqim
}

export interface OyinBuyResult {
  ok: boolean;
  // `season_off` — mavsum sozlanmagan/boshlanmagan/tugagan. `off` dan FARQ qiladi (bayroq) va
  // `insufficient` deb aytish YOLG'ON bo'lardi — mijozga balansi haqida noto'g'ri xabar bermaymiz.
  // `final_lock` — mavsum tugashiga <48 soat qoldi, ro'yxat tirajga qotdi (OYIN_FINAL_LOCK_MS).
  // `no_ride` — mavsumda birorta ham real safar yo'q. Chipta SOVRIN yo'li ham, tanga PUL yo'li
  // ham bir xil shartga bo'ysunadi (avval faqat pul yo'li qo'riqlangan edi).
  // `banned` — a'zo o'yindan chetlatilgan (admin qarori). `frozen` — tiraj muzlatilgan: ro'yxat
  // qotdi, hech kim (EGA HAM) yangi chipta ola olmaydi.
  // ⚠️ `staff` ENDI QAYTARILMAYDI — ega/admin xaridi to'silish o'rniga TEST-CHIPTA bo'ladi
  // (`test:true`, `drawExport` dan chiqarilgan). Union'da moslik uchun qoldirildi.
  reason?: "insufficient" | "sold_out" | "unknown_prize" | "off" | "season_off" | "own_limit" | "final_lock" | "no_ride" | "staff" | "banned" | "frozen" | "drawn";
  // 🧪 Bu xarid TEST edi — ega/admin butun oqimni sinaydi, chipta esa tirajga KIRMAYDI va
  // mijozlarning sovrin-o'rinlarini YEMAYDI (alohida hisoblagich).
  test?: boolean;
  ticketNo?: number;
  // 🎟 Bayram-oynasi ko'rsatadigan raqam — MIJOZ KEYIN CHIPTALARIM'da ko'radigan raqamning
  // AYNAN O'ZI bo'lishi shart. Avval bayramda sovrin-ichi tartib raqami ("№0002"), ro'yxatda
  // esa global raqam ("№ 729476") chiqardi — bitta chipta ikki xil raqam bilan.
  gno?: number;
  prizeKey?: OyinPrizeKey;
  ballLeft?: number;
}
