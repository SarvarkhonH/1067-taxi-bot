// 🧺 OZIQ-OVQAT KATALOGI (ega buyrug'i, 2026-07-28) — 4 do'kon, 225 mahsulot, hammasi rasm bilan.
//
// SOF MA'LUMOT: bu faylda prisma ham, I/O ham yo'q — shuning uchun uni ham seed-skript, ham
// lokal ko'rik (previewFoodCatalog.ts) bir xil o'qiydi. Ya'ni ega ko'rgan ro'yxat = bazaga
// yoziladigan ro'yxat, ikki xil haqiqat bo'lishi mumkin emas.
//
// KATEGORIYA NOMLARI `MARKET_CATEGORIES` (shared/types.ts) dagi nomlar bilan AYNAN bir xil —
// mijoz karuseli kategoriyani NOM bo'yicha solishtiradi (shop.tsx), slug bo'yicha emas.
//
// NARX: taxminiy — ega admin panelda ustidan tahrirlaydi. Shu sababli har mahsulot `active:false`
// yaratiladi: narx tasdiqlanmaguncha mijoz umuman ko'rmaydi (`listProducts` faqat active+stock>0).
import type { FoodArt } from "./foodArt";

export interface SeedShop {
  key: string; // idempotentlik kaliti (nom bo'yicha topiladi)
  name: string;
  category: string;
  workHours: string;
  deliveryText: string;
  deliveryFeeSom: number;
  minOrderTanga: number;
  story: string;
  announcement: string;
  logo: { kind: "market" | "bozor" | "non" | "gosht"; c1: string; c2: string };
  sortOrder: number;
}

export interface SeedProduct {
  shop: string; // SeedShop.key
  name: string;
  cat: string; // CategoryDef.name
  unit: string;
  price: number; // taxminiy — ega to'g'rilaydi
  art: FoodArt;
  brand?: string;
  desc?: string;
}

export const SHOPS: SeedShop[] = [
  {
    key: "market", name: "BirJoy Oziq-ovqat", category: "Oziq ovqat", workHours: "08:00-22:00",
    deliveryText: "Bugun 2-4 soat ichida", deliveryFeeSom: 10000, minOrderTanga: 30000, sortOrder: 1,
    story: "Kundalik oziq-ovqat: un, yorma, yog', ziravor, konserva, ichimlik va choy. Bir joydan buyurtma qiling — biz eshigingizgacha yetkazamiz.",
    announcement: "Yangi partiya keldi — un, guruch va yog' omborda bor.",
    logo: { kind: "market", c1: "#0d9668", c2: "#047857" },
  },
  {
    key: "bozor", name: "Yangi Bozor — meva-sabzavot", category: "Oziq ovqat", workHours: "07:00-20:00",
    deliveryText: "Ertalab uzilgan — kunduzi yetkazamiz", deliveryFeeSom: 10000, minOrderTanga: 25000, sortOrder: 2,
    story: "Har kuni ertalab dehqon bozoridan olinadigan meva-sabzavot, ko'kat, quruq meva va asal. Kechagi mahsulot sotilmaydi.",
    announcement: "Bugun: yangi uzilgan pomidor va ko'kat.",
    logo: { kind: "bozor", c1: "#22c55e", c2: "#15803d" },
  },
  {
    key: "non", name: "Non & Shirinlik uyi", category: "Oziq ovqat", workHours: "06:00-21:00",
    deliveryText: "Issiq non — 1 soat ichida", deliveryFeeSom: 8000, minOrderTanga: 20000, sortOrder: 3,
    story: "Kuniga uch marta yopiladigan issiq non va patir, uy tortlari, shirinlik, muzqaymoq hamda sut mahsulotlari.",
    announcement: "Non soat 07:00, 13:00 va 18:00 da issiq chiqadi.",
    logo: { kind: "non", c1: "#f59e0b", c2: "#b45309" },
  },
  {
    key: "gosht", name: "Go'sht & Baliq rastasi", category: "Oziq ovqat", workHours: "07:00-19:00",
    deliveryText: "Muzlatgichli yetkazish — 3 soat", deliveryFeeSom: 12000, minOrderTanga: 50000, sortOrder: 4,
    story: "Har kuni yangi so'yilgan mol, qo'y va tovuq go'shti, kolbasa, baliq, tuxum va muzlatilgan yarim tayyor mahsulotlar.",
    announcement: "Buyurtmani ertalab bersangiz — kunduzi yetkazamiz.",
    logo: { kind: "gosht", c1: "#dc2626", c2: "#991b1b" },
  },
];

// ── 1) BirJoy Oziq-ovqat ─────────────────────────────────────────────────────────────────────
const MARKET: SeedProduct[] = [
  // Un va yorma
  { shop: "market", name: "Oliy nav un", cat: "Un va yorma", unit: "1 kg", price: 8000, art: { form: "qop", c1: "#f8fafc", c2: "#e2e8f0", c3: "#b45309", glyph: "bugdoy" } },
  { shop: "market", name: "Oliy nav un", cat: "Un va yorma", unit: "5 kg", price: 38000, art: { form: "qop", c1: "#f1f5f9", c2: "#e2e8f0", c3: "#b45309", glyph: "bugdoy" } },
  { shop: "market", name: "Lazer guruch", cat: "Un va yorma", unit: "1 kg", price: 24000, art: { form: "qop", c1: "#fef3c7", c2: "#fde68a", c3: "#b45309", glyph: "bugdoy" } },
  { shop: "market", name: "Devzira guruch", cat: "Un va yorma", unit: "1 kg", price: 42000, art: { form: "qop", c1: "#fcd9a8", c2: "#f5b971", c3: "#9a3412", glyph: "bugdoy" } },
  { shop: "market", name: "Bug'doy yormasi", cat: "Un va yorma", unit: "1 kg", price: 12000, art: { form: "paket", c1: "#e8c88a", c2: "#c9a227", c3: "#b45309", glyph: "bugdoy" } },
  { shop: "market", name: "Grechka (marjumak)", cat: "Un va yorma", unit: "1 kg", price: 26000, art: { form: "paket", c1: "#a97c50", c2: "#7c5b3f", c3: "#7c2d12", glyph: "bugdoy" } },
  { shop: "market", name: "Suli yormasi (gerkules)", cat: "Un va yorma", unit: "500 g", price: 14000, art: { form: "quti", c1: "#e8d5a8", c2: "#c9b27f", c3: "#b45309", glyph: "bugdoy" } },
  { shop: "market", name: "Manniy yormasi", cat: "Un va yorma", unit: "1 kg", price: 13000, art: { form: "paket", c1: "#f8f1de", c2: "#e2d5b8", c3: "#b45309", glyph: "bugdoy" } },
  { shop: "market", name: "Makkajo'xori yormasi", cat: "Un va yorma", unit: "1 kg", price: 12000, art: { form: "paket", c1: "#facc15", c2: "#ca8a04", c3: "#b45309", glyph: "quyosh" } },
  { shop: "market", name: "Shakar", cat: "Un va yorma", unit: "1 kg", price: 14000, art: { form: "qop", c1: "#f8fafc", c2: "#dbeafe", c3: "#2563eb" } },
  // Makaron
  { shop: "market", name: "Spagetti", cat: "Makaron", unit: "450 g", price: 12000, art: { form: "makaron", c1: "#f0c987", c2: "#2563eb", c3: "#dc2626", glyph: "bugdoy" } },
  { shop: "market", name: "Rojki makaron", cat: "Makaron", unit: "450 g", price: 11000, art: { form: "paket", c1: "#f0c987", c2: "#d1a054", c3: "#2563eb", glyph: "bugdoy" } },
  { shop: "market", name: "Perya makaron", cat: "Makaron", unit: "450 g", price: 11500, art: { form: "paket", c1: "#eec282", c2: "#cf9c4c", c3: "#15803d", glyph: "bugdoy" } },
  { shop: "market", name: "Vermishel", cat: "Makaron", unit: "400 g", price: 9000, art: { form: "paket", c1: "#f2d09a", c2: "#d6ab63", c3: "#b45309", glyph: "bugdoy" } },
  { shop: "market", name: "Spiral makaron", cat: "Makaron", unit: "450 g", price: 11500, art: { form: "paket", c1: "#efc47f", c2: "#cf9c4c", c3: "#7c2d12", glyph: "bugdoy" } },
  { shop: "market", name: "Uy lag'moni (qo'lda tortilgan)", cat: "Makaron", unit: "500 g", price: 16000, art: { form: "makaron", c1: "#f5dcae", c2: "#dc2626", c3: "#b45309" } },
  { shop: "market", name: "Lazanya varaqlari", cat: "Makaron", unit: "500 g", price: 24000, art: { form: "quti", c1: "#f0c987", c2: "#d1a054", c3: "#dc2626", glyph: "bugdoy" } },
  // Dukkaklilar
  { shop: "market", name: "Mosh", cat: "Dukkaklilar", unit: "1 kg", price: 22000, art: { form: "dukkakli", c1: "#4d7c0f", c2: "#e2e8f0" } },
  { shop: "market", name: "No'xat", cat: "Dukkaklilar", unit: "1 kg", price: 18000, art: { form: "dukkakli", c1: "#d6b56b", c2: "#e2e8f0" } },
  { shop: "market", name: "Oq loviya", cat: "Dukkaklilar", unit: "1 kg", price: 20000, art: { form: "dukkakli", c1: "#f1f5f9", c2: "#cbd5e1" } },
  { shop: "market", name: "Qizil loviya", cat: "Dukkaklilar", unit: "1 kg", price: 21000, art: { form: "dukkakli", c1: "#9b2c2c", c2: "#e2e8f0" } },
  { shop: "market", name: "Yasmiq (chechevitsa)", cat: "Dukkaklilar", unit: "1 kg", price: 24000, art: { form: "dukkakli", c1: "#e8833a", c2: "#e2e8f0" } },
  { shop: "market", name: "Soya donasi", cat: "Dukkaklilar", unit: "1 kg", price: 19000, art: { form: "dukkakli", c1: "#e8d5a8", c2: "#cbd5e1" } },
  // Yog'
  { shop: "market", name: "Paxta yog'i", cat: "Yog'", unit: "1 L", price: 26000, art: { form: "shisha", c1: "#eab308", c2: "#a16207", c3: "#15803d", glyph: "tomchi" } },
  { shop: "market", name: "Kungaboqar yog'i", cat: "Yog'", unit: "1 L", price: 28000, art: { form: "shisha", c1: "#facc15", c2: "#ca8a04", c3: "#15803d", glyph: "quyosh" } },
  { shop: "market", name: "Kungaboqar yog'i", cat: "Yog'", unit: "5 L", price: 132000, art: { form: "shisha", c1: "#fde047", c2: "#ca8a04", c3: "#15803d", glyph: "quyosh" } },
  { shop: "market", name: "Zaytun yog'i", cat: "Yog'", unit: "500 ml", price: 96000, art: { form: "shisha", c1: "#6b8e23", c2: "#3f5c14", c3: "#3f5c14", glyph: "barg" } },
  { shop: "market", name: "Makkajo'xori yog'i", cat: "Yog'", unit: "1 L", price: 34000, art: { form: "shisha", c1: "#f59e0b", c2: "#b45309", c3: "#b45309", glyph: "tomchi" } },
  { shop: "market", name: "Kunjut yog'i", cat: "Yog'", unit: "250 ml", price: 42000, art: { form: "yumshoqShisha", c1: "#b45309", c2: "#7c2d12", c3: "#7c2d12", glyph: "tomchi" } },
  // Ziravorlar
  { shop: "market", name: "Yodlangan tuz", cat: "Ziravorlar", unit: "1 kg", price: 4000, art: { form: "qop", c1: "#f8fafc", c2: "#e2e8f0", c3: "#0ea5e9" } },
  { shop: "market", name: "Qora murch (maydalangan)", cat: "Ziravorlar", unit: "50 g", price: 9000, art: { form: "shaker", c1: "#334155", c2: "#0f172a", c3: "#b45309" } },
  { shop: "market", name: "Qizil achchiq murch", cat: "Ziravorlar", unit: "50 g", price: 8000, art: { form: "shaker", c1: "#dc2626", c2: "#7f1d1d", c3: "#7f1d1d", glyph: "achchiq" } },
  { shop: "market", name: "Zira", cat: "Ziravorlar", unit: "50 g", price: 10000, art: { form: "shaker", c1: "#a97c50", c2: "#6b3f2a", c3: "#6b3f2a" } },
  { shop: "market", name: "Kashnich urug'i", cat: "Ziravorlar", unit: "50 g", price: 8000, art: { form: "shaker", c1: "#c9a227", c2: "#8a6d1f", c3: "#4d7c0f", glyph: "barg" } },
  { shop: "market", name: "Lavr bargi", cat: "Ziravorlar", unit: "20 g", price: 6000, art: { form: "paket", c1: "#4d7c0f", c2: "#3f5c14", c3: "#3f5c14", glyph: "barg" } },
  { shop: "market", name: "Sarimsoq kukuni", cat: "Ziravorlar", unit: "50 g", price: 9000, art: { form: "shaker", c1: "#f1f5f9", c2: "#cbd5e1", c3: "#4d7c0f" } },
  { shop: "market", name: "Osh ziravori (aralashma)", cat: "Ziravorlar", unit: "100 g", price: 12000, art: { form: "paket", c1: "#b45309", c2: "#7c2d12", c3: "#dc2626" } },
  { shop: "market", name: "Kabob ziravori", cat: "Ziravorlar", unit: "100 g", price: 12000, art: { form: "paket", c1: "#9a3412", c2: "#7c2d12", c3: "#dc2626", glyph: "achchiq" } },
  { shop: "market", name: "Za'faron (rang beruvchi)", cat: "Ziravorlar", unit: "10 g", price: 15000, art: { form: "shaker", c1: "#f59e0b", c2: "#b45309", c3: "#b45309", glyph: "quyosh" } },
  // Konservalar
  { shop: "market", name: "Tushonka (mol go'shti)", cat: "Konservalar", unit: "325 g", price: 42000, art: { form: "konserva", c1: "#94a3b8", c2: "#cbd5e1", c3: "#b91c1c", glyph: "sigir" } },
  { shop: "market", name: "Tovuq tushonkasi", cat: "Konservalar", unit: "325 g", price: 34000, art: { form: "konserva", c1: "#cbd5e1", c2: "#e2e8f0", c3: "#f59e0b" } },
  { shop: "market", name: "Sardina konservasi", cat: "Konservalar", unit: "240 g", price: 22000, art: { form: "konserva", c1: "#60a5fa", c2: "#cbd5e1", c3: "#1d4ed8", glyph: "baliq" } },
  { shop: "market", name: "Tunes konservasi", cat: "Konservalar", unit: "185 g", price: 32000, art: { form: "konserva", c1: "#0ea5e9", c2: "#cbd5e1", c3: "#0369a1", glyph: "baliq" } },
  { shop: "market", name: "Pomidor pastasi", cat: "Konservalar", unit: "500 g", price: 18000, art: { form: "banka", c1: "#b91c1c", c2: "#7f1d1d", c3: "#15803d", glyph: "meva" } },
  { shop: "market", name: "Konserva no'xat", cat: "Konservalar", unit: "400 g", price: 14000, art: { form: "konserva", c1: "#4d7c0f", c2: "#cbd5e1", c3: "#15803d", glyph: "barg" } },
  { shop: "market", name: "Konserva makkajo'xori", cat: "Konservalar", unit: "400 g", price: 15000, art: { form: "konserva", c1: "#facc15", c2: "#cbd5e1", c3: "#ca8a04", glyph: "quyosh" } },
  { shop: "market", name: "Marinadlangan bodring", cat: "Konservalar", unit: "700 g", price: 22000, art: { form: "banka", c1: "#6b8e23", c2: "#3f5c14", c3: "#3f5c14", glyph: "barg" } },
  // Ichimliklar
  { shop: "market", name: "Coca-Cola", cat: "Ichimliklar", unit: "1.5 L", price: 14000, brand: "Coca-Cola", art: { form: "shisha", c1: "#7f1d1d", c2: "#dc2626", c3: "#dc2626", glyph: "pufak" } },
  { shop: "market", name: "Coca-Cola", cat: "Ichimliklar", unit: "0.5 L", price: 7000, brand: "Coca-Cola", art: { form: "shisha", c1: "#991b1b", c2: "#ef4444", c3: "#dc2626", glyph: "pufak" } },
  { shop: "market", name: "Fanta", cat: "Ichimliklar", unit: "1.5 L", price: 14000, brand: "Fanta", art: { form: "shisha", c1: "#f97316", c2: "#c2410c", c3: "#ea580c", glyph: "meva" } },
  { shop: "market", name: "Sprite", cat: "Ichimliklar", unit: "1.5 L", price: 14000, brand: "Sprite", art: { form: "shisha", c1: "#22c55e", c2: "#15803d", c3: "#15803d", glyph: "pufak" } },
  { shop: "market", name: "Pepsi", cat: "Ichimliklar", unit: "1 L", price: 12000, brand: "Pepsi", art: { form: "shisha", c1: "#1e3a8a", c2: "#1d4ed8", c3: "#dc2626", glyph: "pufak" } },
  { shop: "market", name: "Ichimlik suvi (gazsiz)", cat: "Ichimliklar", unit: "1.5 L", price: 4000, art: { form: "shisha", c1: "#7dd3fc", c2: "#0ea5e9", c3: "#0ea5e9", glyph: "tomchi" } },
  { shop: "market", name: "Mineral suv (gazli)", cat: "Ichimliklar", unit: "1.5 L", price: 5000, art: { form: "shisha", c1: "#38bdf8", c2: "#0369a1", c3: "#0369a1", glyph: "pufak" } },
  { shop: "market", name: "Olma sharbati", cat: "Ichimliklar", unit: "1 L", price: 18000, art: { form: "qadoq", c1: "#f8fafc", c2: "#dc2626", c3: "#dc2626", glyph: "meva" } },
  { shop: "market", name: "Apelsin sharbati", cat: "Ichimliklar", unit: "1 L", price: 19000, art: { form: "qadoq", c1: "#fff7ed", c2: "#f97316", c3: "#ea580c", glyph: "meva" } },
  { shop: "market", name: "Shaftoli nektari", cat: "Ichimliklar", unit: "1 L", price: 18000, art: { form: "qadoq", c1: "#fff1f2", c2: "#fb7185", c3: "#e11d48", glyph: "meva" } },
  { shop: "market", name: "Multifrukt sharbati", cat: "Ichimliklar", unit: "2 L", price: 26000, art: { form: "qadoq", c1: "#fefce8", c2: "#f59e0b", c3: "#b45309", glyph: "meva" } },
  { shop: "market", name: "Limonad «Barhat»", cat: "Ichimliklar", unit: "1.5 L", price: 11000, art: { form: "shisha", c1: "#a16207", c2: "#78350f", c3: "#b45309", glyph: "pufak" } },
  // Choy va qahva
  { shop: "market", name: "Qora choy", cat: "Choy va qahva", unit: "100 g", price: 12000, art: { form: "quti", c1: "#b45309", c2: "#7c2d12", c3: "#7c2d12", glyph: "bug" } },
  { shop: "market", name: "Ko'k choy", cat: "Choy va qahva", unit: "100 g", price: 11000, art: { form: "quti", c1: "#4d7c0f", c2: "#3f5c14", c3: "#3f5c14", glyph: "barg" } },
  { shop: "market", name: "Qora choy paketda", cat: "Choy va qahva", unit: "25 dona", price: 14000, art: { form: "quti", c1: "#7c2d12", c2: "#581c0c", c3: "#b45309", glyph: "bug" } },
  { shop: "market", name: "Ko'k choy paketda", cat: "Choy va qahva", unit: "25 dona", price: 14000, art: { form: "quti", c1: "#3f7d34", c2: "#2f5f27", c3: "#15803d", glyph: "barg" } },
  { shop: "market", name: "Nescafé Classic", cat: "Choy va qahva", unit: "100 g", price: 48000, brand: "Nescafé", art: { form: "banka", c1: "#6b3f2a", c2: "#dc2626", c3: "#dc2626", glyph: "bug" } },
  { shop: "market", name: "3-in-1 qahva", cat: "Choy va qahva", unit: "20 paket", price: 42000, art: { form: "quti", c1: "#8b5a2b", c2: "#6b3f2a", c3: "#b45309", glyph: "bug" } },
  { shop: "market", name: "Qahva donasi (arabika)", cat: "Choy va qahva", unit: "250 g", price: 78000, art: { form: "paket", c1: "#3f2a1a", c2: "#241610", c3: "#b45309", glyph: "kakao" } },
  { shop: "market", name: "Mevali choy (karkade)", cat: "Choy va qahva", unit: "80 g", price: 16000, art: { form: "quti", c1: "#be123c", c2: "#881337", c3: "#e11d48", glyph: "meva" } },
  // Energetik ichimliklar
  { shop: "market", name: "Red Bull", cat: "Energetik ichimliklar", unit: "250 ml", price: 22000, brand: "Red Bull", art: { form: "bankaMetall", c1: "#1e3a8a", c2: "#94a3b8", c3: "#f59e0b", glyph: "yulduz" } },
  { shop: "market", name: "Adrenaline Rush", cat: "Energetik ichimliklar", unit: "500 ml", price: 18000, art: { form: "bankaMetall", c1: "#0f172a", c2: "#94a3b8", c3: "#dc2626", glyph: "yulduz" } },
  { shop: "market", name: "Hell Energy", cat: "Energetik ichimliklar", unit: "250 ml", price: 12000, art: { form: "bankaMetall", c1: "#7f1d1d", c2: "#94a3b8", c3: "#f59e0b", glyph: "yulduz" } },
  { shop: "market", name: "Flash Up", cat: "Energetik ichimliklar", unit: "450 ml", price: 13000, art: { form: "bankaMetall", c1: "#1e293b", c2: "#94a3b8", c3: "#22c55e", glyph: "yulduz" } },
  { shop: "market", name: "Non-Stop", cat: "Energetik ichimliklar", unit: "500 ml", price: 14000, art: { form: "bankaMetall", c1: "#3f3f46", c2: "#94a3b8", c3: "#0ea5e9", glyph: "yulduz" } },
  // Bolalar oziq-ovqati
  { shop: "market", name: "Sut aralashmasi 1 (0-6 oy)", cat: "Bolalar oziq-ovqati", unit: "300 g", price: 78000, art: { form: "quti", c1: "#93c5fd", c2: "#60a5fa", c3: "#2563eb", glyph: "sigir" } },
  { shop: "market", name: "Sut aralashmasi 2 (6-12 oy)", cat: "Bolalar oziq-ovqati", unit: "300 g", price: 78000, art: { form: "quti", c1: "#a7f3d0", c2: "#34d399", c3: "#0d9668", glyph: "sigir" } },
  { shop: "market", name: "Bolalar suti (steril)", cat: "Bolalar oziq-ovqati", unit: "200 ml", price: 9000, art: { form: "bolalarShisha", c1: "#f8fafc", c2: "#60a5fa", c3: "#60a5fa", glyph: "sigir" } },
  { shop: "market", name: "Meva pyuresi (olma)", cat: "Bolalar oziq-ovqati", unit: "100 g", price: 12000, art: { form: "banka", c1: "#fbbf24", c2: "#22c55e", c3: "#22c55e", glyph: "meva" } },
  { shop: "market", name: "Meva pyuresi (nok-banan)", cat: "Bolalar oziq-ovqati", unit: "100 g", price: 12000, art: { form: "banka", c1: "#fde68a", c2: "#facc15", c3: "#ca8a04", glyph: "meva" } },
  { shop: "market", name: "Bolalar bo'tqasi (guruchli)", cat: "Bolalar oziq-ovqati", unit: "200 g", price: 32000, art: { form: "quti", c1: "#fef3c7", c2: "#fcd34d", c3: "#f59e0b", glyph: "bugdoy" } },
  { shop: "market", name: "Bolalar pechenyesi", cat: "Bolalar oziq-ovqati", unit: "180 g", price: 18000, art: { form: "paket", c1: "#fcd34d", c2: "#f59e0b", c3: "#b45309", glyph: "yulduz" } },
  // Tayyor mahsulotlar
  { shop: "market", name: "Tez tayyor lag'mon (tuxumli)", cat: "Tayyor mahsulotlar", unit: "90 g", price: 6000, art: { form: "paket", c1: "#f59e0b", c2: "#b45309", c3: "#dc2626", glyph: "bugdoy" } },
  { shop: "market", name: "Tez tayyor lag'mon (tovuqli)", cat: "Tayyor mahsulotlar", unit: "90 g", price: 7000, art: { form: "paket", c1: "#ea580c", c2: "#9a3412", c3: "#facc15" } },
  { shop: "market", name: "Tez tayyor sho'rva (qo'ziqorinli)", cat: "Tayyor mahsulotlar", unit: "60 g", price: 5000, art: { form: "paket", c1: "#a97c50", c2: "#6b3f2a", c3: "#4d7c0f", glyph: "barg" } },
  { shop: "market", name: "Kartoshka pyuresi (tez tayyor)", cat: "Tayyor mahsulotlar", unit: "40 g", price: 4500, art: { form: "paket", c1: "#fde68a", c2: "#f59e0b", c3: "#b45309" } },
  { shop: "market", name: "Kartoshka chipsi", cat: "Tayyor mahsulotlar", unit: "130 g", price: 18000, art: { form: "paket", c1: "#dc2626", c2: "#991b1b", c3: "#facc15" } },
  { shop: "market", name: "Suxarik (qora non)", cat: "Tayyor mahsulotlar", unit: "60 g", price: 5000, art: { form: "paket", c1: "#8b5a2b", c2: "#6b3f2a", c3: "#f59e0b", glyph: "bugdoy" } },
  { shop: "market", name: "Popkorn (mikroto'lqin uchun)", cat: "Tayyor mahsulotlar", unit: "100 g", price: 9000, art: { form: "paket", c1: "#facc15", c2: "#ca8a04", c3: "#dc2626", glyph: "quyosh" } },
  { shop: "market", name: "Tuzli kreker", cat: "Tayyor mahsulotlar", unit: "180 g", price: 12000, art: { form: "paket", c1: "#eab308", c2: "#a16207", c3: "#15803d", glyph: "bugdoy" } },
];

// ── 2) Yangi Bozor — meva-sabzavot ───────────────────────────────────────────────────────────
const BOZOR: SeedProduct[] = [
  // Sabzavotlar
  { shop: "bozor", name: "Kartoshka", cat: "Sabzavotlar", unit: "1 kg", price: 6000, art: { form: "piyoz", c1: "#d9b382", c2: "#8b5a2b" } },
  { shop: "bozor", name: "Piyoz", cat: "Sabzavotlar", unit: "1 kg", price: 5000, art: { form: "piyoz", c1: "#e9c46a", c2: "#3f7d34" } },
  { shop: "bozor", name: "Sabzi", cat: "Sabzavotlar", unit: "1 kg", price: 6500, art: { form: "ildiz", c1: "#f97316", c2: "#3f7d34" } },
  { shop: "bozor", name: "Pomidor", cat: "Sabzavotlar", unit: "1 kg", price: 12000, art: { form: "mevaDumaloq", c1: "#dc2626", c2: "#3f7d34" } },
  { shop: "bozor", name: "Bodring", cat: "Sabzavotlar", unit: "1 kg", price: 11000, art: { form: "ildiz", c1: "#4d7c0f", c2: "#22c55e" } },
  { shop: "bozor", name: "Bulg'or qalampiri", cat: "Sabzavotlar", unit: "1 kg", price: 16000, art: { form: "mevaDumaloq", c1: "#f59e0b", c2: "#3f7d34" } },
  { shop: "bozor", name: "Baqlajon", cat: "Sabzavotlar", unit: "1 kg", price: 12000, art: { form: "ildiz", c1: "#6b21a8", c2: "#3f7d34" } },
  { shop: "bozor", name: "Oq karam", cat: "Sabzavotlar", unit: "1 kg", price: 5000, art: { form: "barg", c1: "#a3e635", c2: "#65a30d" } },
  { shop: "bozor", name: "Pekin karami", cat: "Sabzavotlar", unit: "1 kg", price: 9000, art: { form: "barg", c1: "#bef264", c2: "#84cc16" } },
  { shop: "bozor", name: "Sarimsoq", cat: "Sabzavotlar", unit: "250 g", price: 12000, art: { form: "piyoz", c1: "#f1f5f9", c2: "#65a30d" } },
  { shop: "bozor", name: "Qizil turp", cat: "Sabzavotlar", unit: "500 g", price: 7000, art: { form: "ildiz", c1: "#ef4444", c2: "#22c55e" } },
  { shop: "bozor", name: "Lavlagi", cat: "Sabzavotlar", unit: "1 kg", price: 6000, art: { form: "piyoz", c1: "#9d174d", c2: "#3f7d34" } },
  { shop: "bozor", name: "Ko'k piyoz", cat: "Sabzavotlar", unit: "bog'lam", price: 4000, art: { form: "barg", c1: "#4ade80", c2: "#16a34a" } },
  { shop: "bozor", name: "Rayhon", cat: "Sabzavotlar", unit: "bog'lam", price: 3000, art: { form: "barg", c1: "#22c55e", c2: "#15803d" } },
  { shop: "bozor", name: "Shivit (ukrop)", cat: "Sabzavotlar", unit: "bog'lam", price: 3000, art: { form: "barg", c1: "#34d399", c2: "#059669" } },
  { shop: "bozor", name: "Oshqovoq", cat: "Sabzavotlar", unit: "1 kg", price: 7000, art: { form: "mevaDumaloq", c1: "#f97316", c2: "#3f7d34" } },
  // Mevalar
  { shop: "bozor", name: "Olma (oq)", cat: "Mevalar", unit: "1 kg", price: 12000, art: { form: "mevaDumaloq", c1: "#a3e635", c2: "#3f7d34" } },
  { shop: "bozor", name: "Olma (qizil)", cat: "Mevalar", unit: "1 kg", price: 13000, art: { form: "mevaDumaloq", c1: "#dc2626", c2: "#3f7d34" } },
  { shop: "bozor", name: "Nok", cat: "Mevalar", unit: "1 kg", price: 18000, art: { form: "mevaDumaloq", c1: "#d4d94a", c2: "#3f7d34" } },
  { shop: "bozor", name: "Banan", cat: "Mevalar", unit: "1 kg", price: 22000, art: { form: "banan", c1: "#facc15", c2: "#a16207" } },
  { shop: "bozor", name: "Apelsin", cat: "Mevalar", unit: "1 kg", price: 20000, art: { form: "mevaDumaloq", c1: "#f97316", c2: "#3f7d34" } },
  { shop: "bozor", name: "Mandarin", cat: "Mevalar", unit: "1 kg", price: 19000, art: { form: "mevaDumaloq", c1: "#fb923c", c2: "#3f7d34" } },
  { shop: "bozor", name: "Limon", cat: "Mevalar", unit: "1 kg", price: 24000, art: { form: "mevaDumaloq", c1: "#facc15", c2: "#3f7d34" } },
  { shop: "bozor", name: "Qora uzum", cat: "Mevalar", unit: "1 kg", price: 24000, art: { form: "uzum", c1: "#6b21a8", c2: "#3f7d34" } },
  { shop: "bozor", name: "Husayni uzum", cat: "Mevalar", unit: "1 kg", price: 26000, art: { form: "uzum", c1: "#a3e635", c2: "#3f7d34" } },
  { shop: "bozor", name: "Anor", cat: "Mevalar", unit: "1 kg", price: 22000, art: { form: "mevaDumaloq", c1: "#b91c1c", c2: "#3f7d34" } },
  { shop: "bozor", name: "Shaftoli", cat: "Mevalar", unit: "1 kg", price: 20000, art: { form: "mevaDumaloq", c1: "#fb7185", c2: "#3f7d34" } },
  { shop: "bozor", name: "O'rik", cat: "Mevalar", unit: "1 kg", price: 18000, art: { form: "mevaDumaloq", c1: "#fbbf24", c2: "#3f7d34" } },
  { shop: "bozor", name: "Tarvuz", cat: "Mevalar", unit: "1 kg", price: 5000, art: { form: "mevaDumaloq", c1: "#16a34a", c2: "#14532d" } },
  { shop: "bozor", name: "Qovun", cat: "Mevalar", unit: "1 kg", price: 7000, art: { form: "mevaDumaloq", c1: "#eab308", c2: "#3f7d34" } },
  { shop: "bozor", name: "Qulupnay", cat: "Mevalar", unit: "500 g", price: 28000, art: { form: "mevaDumaloq", c1: "#e11d48", c2: "#22c55e" } },
  // Yong'oq va quruq mevalar
  { shop: "bozor", name: "Yong'oq mag'zi", cat: "Yong'oq va quruq mevalar", unit: "500 g", price: 65000, art: { form: "yongoq", c1: "#c98a4b", c2: "#8b5a2b" } },
  { shop: "bozor", name: "Bodom", cat: "Yong'oq va quruq mevalar", unit: "500 g", price: 78000, art: { form: "yongoq", c1: "#d8b48c", c2: "#8b5a2b" } },
  { shop: "bozor", name: "Pista (tuzlangan)", cat: "Yong'oq va quruq mevalar", unit: "500 g", price: 92000, art: { form: "yongoq", c1: "#a3b18a", c2: "#4d7c0f" } },
  { shop: "bozor", name: "Yeryong'oq (qovurilgan)", cat: "Yong'oq va quruq mevalar", unit: "500 g", price: 28000, art: { form: "yongoq", c1: "#b97a4a", c2: "#7c4a24" } },
  { shop: "bozor", name: "Oq mayiz", cat: "Yong'oq va quruq mevalar", unit: "500 g", price: 32000, art: { form: "yongoq", c1: "#c8a45c", c2: "#8a6d1f" } },
  { shop: "bozor", name: "Qora mayiz", cat: "Yong'oq va quruq mevalar", unit: "500 g", price: 30000, art: { form: "yongoq", c1: "#4a3728", c2: "#241610" } },
  { shop: "bozor", name: "Turshak (quruq o'rik)", cat: "Yong'oq va quruq mevalar", unit: "500 g", price: 38000, art: { form: "yongoq", c1: "#f59e0b", c2: "#b45309" } },
  { shop: "bozor", name: "Xurmo", cat: "Yong'oq va quruq mevalar", unit: "500 g", price: 42000, art: { form: "yongoq", c1: "#6b3f2a", c2: "#3f2a1a" } },
  { shop: "bozor", name: "Yong'oq assorti", cat: "Yong'oq va quruq mevalar", unit: "400 g", price: 58000, art: { form: "yongoq", c1: "#d1a054", c2: "#7c4a24" } },
  { shop: "bozor", name: "Kunjut urug'i", cat: "Yong'oq va quruq mevalar", unit: "200 g", price: 16000, art: { form: "paket", c1: "#f5deb3", c2: "#d1a054", c3: "#b45309", glyph: "bugdoy" } },
  // Asal va murabbo
  { shop: "bozor", name: "Tog' asali", cat: "Asal va murabbo", unit: "1 kg", price: 120000, art: { form: "banka", c1: "#f59e0b", c2: "#b45309", c3: "#b45309", glyph: "quyosh" } },
  { shop: "bozor", name: "Oq asal (esparset)", cat: "Asal va murabbo", unit: "1 kg", price: 140000, art: { form: "banka", c1: "#fde68a", c2: "#f59e0b", c3: "#b45309", glyph: "quyosh" } },
  { shop: "bozor", name: "Asal", cat: "Asal va murabbo", unit: "500 g", price: 68000, art: { form: "banka", c1: "#fbbf24", c2: "#d97706", c3: "#b45309", glyph: "quyosh" } },
  { shop: "bozor", name: "Olma murabbosi", cat: "Asal va murabbo", unit: "700 g", price: 26000, art: { form: "banka", c1: "#b91c1c", c2: "#7f1d1d", c3: "#22c55e", glyph: "meva" } },
  { shop: "bozor", name: "O'rik murabbosi", cat: "Asal va murabbo", unit: "700 g", price: 28000, art: { form: "banka", c1: "#f59e0b", c2: "#b45309", c3: "#ea580c", glyph: "meva" } },
  { shop: "bozor", name: "Qulupnay murabbosi", cat: "Asal va murabbo", unit: "700 g", price: 32000, art: { form: "banka", c1: "#e11d48", c2: "#9f1239", c3: "#22c55e", glyph: "meva" } },
  { shop: "bozor", name: "Behi murabbosi", cat: "Asal va murabbo", unit: "700 g", price: 30000, art: { form: "banka", c1: "#eab308", c2: "#a16207", c3: "#b45309", glyph: "meva" } },
];

// ── 3) Non & Shirinlik uyi ───────────────────────────────────────────────────────────────────
const NON: SeedProduct[] = [
  // Non mahsulotlari
  { shop: "non", name: "Toshkent noni", cat: "Non mahsulotlari", unit: "1 dona", price: 4000, art: { form: "nonDumaloq", c1: "#e0a561", c2: "#c07f3c" } },
  { shop: "non", name: "Obi non (issiq)", cat: "Non mahsulotlari", unit: "1 dona", price: 4000, art: { form: "nonDumaloq", c1: "#e8b96c", c2: "#c07f3c" } },
  { shop: "non", name: "Patir non", cat: "Non mahsulotlari", unit: "1 dona", price: 6000, art: { form: "nonDumaloq", c1: "#d2a35c", c2: "#a97335" } },
  { shop: "non", name: "Qatlama", cat: "Non mahsulotlari", unit: "1 dona", price: 7000, art: { form: "nonDumaloq", c1: "#eec282", c2: "#cf9c4c" } },
  { shop: "non", name: "Baton (oq non)", cat: "Non mahsulotlari", unit: "1 dona", price: 5000, art: { form: "baton", c1: "#dfa762", c2: "#b97434" } },
  { shop: "non", name: "Qora non", cat: "Non mahsulotlari", unit: "1 dona", price: 6000, art: { form: "baton", c1: "#8b5e34", c2: "#5f3f22" } },
  { shop: "non", name: "Yupqa lavash", cat: "Non mahsulotlari", unit: "5 dona", price: 8000, art: { form: "paket", c1: "#f5deb3", c2: "#d1a054", c3: "#b45309", glyph: "bugdoy" } },
  { shop: "non", name: "Shirin bulochka", cat: "Non mahsulotlari", unit: "1 dona", price: 3500, art: { form: "nonDumaloq", c1: "#e9b168", c2: "#c07f3c" } },
  { shop: "non", name: "Somsa (mol go'shtli)", cat: "Non mahsulotlari", unit: "1 dona", price: 8000, art: { form: "nonDumaloq", c1: "#d99a4e", c2: "#a97335" } },
  // Tort va pishiriqlar
  { shop: "non", name: "Napoleon torti", cat: "Tort va pishiriqlar", unit: "1 kg", price: 120000, art: { form: "tort", c1: "#f9d7b8", c2: "#e0245e" } },
  { shop: "non", name: "Medovik torti", cat: "Tort va pishiriqlar", unit: "1 kg", price: 130000, art: { form: "tort", c1: "#d9a066", c2: "#b45309" } },
  { shop: "non", name: "Shokoladli tort", cat: "Tort va pishiriqlar", unit: "1 kg", price: 140000, art: { form: "tort", c1: "#6b3f2a", c2: "#3f2a1a" } },
  { shop: "non", name: "Cheesecake", cat: "Tort va pishiriqlar", unit: "1 bo'lak", price: 28000, art: { form: "tort", c1: "#fde68a", c2: "#e11d48" } },
  { shop: "non", name: "Ekler (4 dona)", cat: "Tort va pishiriqlar", unit: "4 dona", price: 24000, art: { form: "pechenye", c1: "#e8c39e", c2: "#6b3f2a" } },
  { shop: "non", name: "Keks (mayizli)", cat: "Tort va pishiriqlar", unit: "400 g", price: 26000, art: { form: "baton", c1: "#c9884a", c2: "#7c4a24" } },
  { shop: "non", name: "Shokoladli rulet", cat: "Tort va pishiriqlar", unit: "300 g", price: 22000, art: { form: "baton", c1: "#8b5a3c", c2: "#4a2a1a" } },
  { shop: "non", name: "Pirojnoe assorti", cat: "Tort va pishiriqlar", unit: "500 g", price: 45000, art: { form: "tort", c1: "#fbcfe8", c2: "#e0245e" } },
  // Shirinliklar
  { shop: "non", name: "Sut shokoladi", cat: "Shirinliklar", unit: "90 g", price: 14000, art: { form: "shokolad", c1: "#6b3f2a", c2: "#b45309", c3: "#b45309", glyph: "kakao" } },
  { shop: "non", name: "Qora shokolad 70%", cat: "Shirinliklar", unit: "90 g", price: 18000, art: { form: "shokolad", c1: "#3f2a1a", c2: "#241610", c3: "#b45309", glyph: "kakao" } },
  { shop: "non", name: "Oq shokolad", cat: "Shirinliklar", unit: "90 g", price: 16000, art: { form: "shokolad", c1: "#f0dcb4", c2: "#d9bd8a", c3: "#b45309", glyph: "kakao" } },
  { shop: "non", name: "Konfet assorti", cat: "Shirinliklar", unit: "500 g", price: 38000, art: { form: "paket", c1: "#b91c1c", c2: "#7f1d1d", c3: "#f59e0b", glyph: "yulduz" } },
  { shop: "non", name: "Karamel konfet", cat: "Shirinliklar", unit: "500 g", price: 26000, art: { form: "paket", c1: "#f59e0b", c2: "#b45309", c3: "#7c2d12", glyph: "yulduz" } },
  { shop: "non", name: "Yulafli pechenye", cat: "Shirinliklar", unit: "300 g", price: 16000, art: { form: "pechenye", c1: "#dda15e", c2: "#8b5a2b" } },
  { shop: "non", name: "Shokoladli pechenye", cat: "Shirinliklar", unit: "300 g", price: 18000, art: { form: "pechenye", c1: "#a97c50", c2: "#3f2a1a" } },
  { shop: "non", name: "Vafli tort", cat: "Shirinliklar", unit: "250 g", price: 14000, art: { form: "shokolad", c1: "#d9a066", c2: "#b45309", c3: "#7c2d12", glyph: "kakao" } },
  { shop: "non", name: "Zefir (vanilli)", cat: "Shirinliklar", unit: "250 g", price: 18000, art: { form: "pechenye", c1: "#fbcfe8", c2: "#f9a8d4" } },
  { shop: "non", name: "Marmelad", cat: "Shirinliklar", unit: "300 g", price: 16000, art: { form: "paket", c1: "#22c55e", c2: "#15803d", c3: "#f59e0b", glyph: "meva" } },
  { shop: "non", name: "Kunjutli halva", cat: "Shirinliklar", unit: "350 g", price: 24000, art: { form: "shokolad", c1: "#c9a227", c2: "#8a6d1f", c3: "#b45309", glyph: "bugdoy" } },
  { shop: "non", name: "Novvot", cat: "Shirinliklar", unit: "500 g", price: 22000, art: { form: "paket", c1: "#fde68a", c2: "#f59e0b", c3: "#b45309", glyph: "yulduz" } },
  // Muzqaymoq
  { shop: "non", name: "Plombir (vafli stakan)", cat: "Muzqaymoq", unit: "1 dona", price: 8000, art: { form: "muzqaymoq", c1: "#f8fafc", c2: "#fde68a" } },
  { shop: "non", name: "Shokoladli eskimo", cat: "Muzqaymoq", unit: "1 dona", price: 9000, art: { form: "muzqaymoq", c1: "#6b3f2a", c2: "#f8fafc" } },
  { shop: "non", name: "Qulupnayli rojok", cat: "Muzqaymoq", unit: "1 dona", price: 9500, art: { form: "muzqaymoq", c1: "#fbcfe8", c2: "#f9a8d4" } },
  { shop: "non", name: "Muzqaymoq (chelak)", cat: "Muzqaymoq", unit: "1 L", price: 42000, art: { form: "stakan", c1: "#f8fafc", c2: "#60a5fa", c3: "#0ea5e9", glyph: "qor" } },
  { shop: "non", name: "Pistali muzqaymoq", cat: "Muzqaymoq", unit: "1 dona", price: 12000, art: { form: "muzqaymoq", c1: "#a3b18a", c2: "#f8fafc" } },
  { shop: "non", name: "Muzqaymoq tort", cat: "Muzqaymoq", unit: "500 g", price: 68000, art: { form: "tort", c1: "#f8fafc", c2: "#60a5fa" } },
  // Sut mahsulotlari
  { shop: "non", name: "Sut 2.5%", cat: "Sut mahsulotlari", unit: "1 L", price: 12000, art: { form: "qadoq", c1: "#f8fafc", c2: "#2563eb", c3: "#2563eb", glyph: "sigir" } },
  { shop: "non", name: "Sut 3.2%", cat: "Sut mahsulotlari", unit: "1 L", price: 13000, art: { form: "qadoq", c1: "#f1f5f9", c2: "#1d4ed8", c3: "#1d4ed8", glyph: "sigir" } },
  { shop: "non", name: "Qatiq", cat: "Sut mahsulotlari", unit: "500 g", price: 10000, art: { form: "stakan", c1: "#f8fafc", c2: "#e2e8f0", c3: "#0d9668", glyph: "sigir" } },
  { shop: "non", name: "Ayron", cat: "Sut mahsulotlari", unit: "1 L", price: 11000, art: { form: "qadoq", c1: "#f8fafc", c2: "#0ea5e9", c3: "#0ea5e9", glyph: "tomchi" } },
  { shop: "non", name: "Suzma", cat: "Sut mahsulotlari", unit: "400 g", price: 18000, art: { form: "stakan", c1: "#f8fafc", c2: "#e2e8f0", c3: "#2563eb", glyph: "sigir" } },
  { shop: "non", name: "Smetana 20%", cat: "Sut mahsulotlari", unit: "400 g", price: 20000, art: { form: "stakan", c1: "#f8fafc", c2: "#cbd5e1", c3: "#15803d", glyph: "sigir" } },
  { shop: "non", name: "Mevali yogurt", cat: "Sut mahsulotlari", unit: "290 g", price: 8000, art: { form: "stakan", c1: "#fbcfe8", c2: "#f9a8d4", c3: "#e11d48", glyph: "meva" } },
  { shop: "non", name: "Kefir", cat: "Sut mahsulotlari", unit: "900 ml", price: 13000, art: { form: "qadoq", c1: "#f8fafc", c2: "#22c55e", c3: "#15803d", glyph: "sigir" } },
  { shop: "non", name: "Tvorog (nordon)", cat: "Sut mahsulotlari", unit: "500 g", price: 24000, art: { form: "paket", c1: "#f8fafc", c2: "#e2e8f0", c3: "#2563eb", glyph: "sigir" } },
  { shop: "non", name: "Quyultirilgan sut", cat: "Sut mahsulotlari", unit: "380 g", price: 22000, art: { form: "konserva", c1: "#60a5fa", c2: "#cbd5e1", c3: "#1d4ed8", glyph: "sigir" } },
  // Pishloq va sariyog'
  { shop: "non", name: "Sariyog' 72.5%", cat: "Pishloq va sariyog'", unit: "200 g", price: 26000, art: { form: "sariyog", c1: "#fde68a", c2: "#f59e0b", c3: "#b45309", glyph: "sigir" } },
  { shop: "non", name: "Sariyog' 82%", cat: "Pishloq va sariyog'", unit: "400 g", price: 52000, art: { form: "sariyog", c1: "#fcd34d", c2: "#d97706", c3: "#b45309", glyph: "sigir" } },
  { shop: "non", name: "Margarin", cat: "Pishloq va sariyog'", unit: "200 g", price: 12000, art: { form: "sariyog", c1: "#f5e6cf", c2: "#e2c9a0", c3: "#15803d", glyph: "barg" } },
  { shop: "non", name: "Pishloq «Rossiyskiy»", cat: "Pishloq va sariyog'", unit: "250 g", price: 34000, art: { form: "pishloq", c1: "#f7c948", c2: "#fde68a" } },
  { shop: "non", name: "Mozzarella", cat: "Pishloq va sariyog'", unit: "250 g", price: 42000, art: { form: "pishloq", c1: "#f8fafc", c2: "#f1f5f9" } },
  { shop: "non", name: "Suluguni", cat: "Pishloq va sariyog'", unit: "300 g", price: 46000, art: { form: "pishloq", c1: "#f5f5dc", c2: "#e8e8c8" } },
  { shop: "non", name: "Eritilgan pishloq", cat: "Pishloq va sariyog'", unit: "180 g", price: 14000, art: { form: "stakan", c1: "#fde68a", c2: "#f59e0b", c3: "#b45309" } },
  { shop: "non", name: "Brinza (tuzlangan)", cat: "Pishloq va sariyog'", unit: "250 g", price: 32000, art: { form: "pishloq", c1: "#f8fafc", c2: "#e2e8f0" } },
];

// ── 4) Go'sht & Baliq rastasi ────────────────────────────────────────────────────────────────
const GOSHT: SeedProduct[] = [
  // Go'sht
  { shop: "gosht", name: "Mol go'shti (toza et)", cat: "Go'sht", unit: "1 kg", price: 120000, art: { form: "gosht", c1: "#d94f4f", c2: "#a3283f" } },
  { shop: "gosht", name: "Mol go'shti (suyakli)", cat: "Go'sht", unit: "1 kg", price: 95000, art: { form: "gosht", c1: "#c0392b", c2: "#8b2635" } },
  { shop: "gosht", name: "Qo'y go'shti", cat: "Go'sht", unit: "1 kg", price: 145000, art: { form: "gosht", c1: "#e05555", c2: "#a3283f" } },
  { shop: "gosht", name: "Qo'y qovurg'asi", cat: "Go'sht", unit: "1 kg", price: 130000, art: { form: "gosht", c1: "#d9534f", c2: "#8b2635" } },
  { shop: "gosht", name: "Dumba yog'i", cat: "Go'sht", unit: "1 kg", price: 70000, art: { form: "sariyog", c1: "#f8fafc", c2: "#e2e8f0", c3: "#dc2626" } },
  { shop: "gosht", name: "Mol jigari", cat: "Go'sht", unit: "1 kg", price: 65000, art: { form: "gosht", c1: "#7f1d1d", c2: "#4a0f0f" } },
  { shop: "gosht", name: "Tovuq (butun)", cat: "Go'sht", unit: "1 kg", price: 42000, art: { form: "tovuq", c1: "#e8a06a", c2: "#f1f5f9" } },
  { shop: "gosht", name: "Tovuq son", cat: "Go'sht", unit: "1 kg", price: 46000, art: { form: "tovuq", c1: "#dd9159", c2: "#f1f5f9" } },
  { shop: "gosht", name: "Tovuq filesi", cat: "Go'sht", unit: "1 kg", price: 62000, art: { form: "gosht", c1: "#f5deb3", c2: "#e0c090" } },
  { shop: "gosht", name: "Mol qiymasi", cat: "Go'sht", unit: "1 kg", price: 98000, art: { form: "gosht", c1: "#c0392b", c2: "#8b2635" } },
  // Kolbasa va sosiska
  { shop: "gosht", name: "Sutli sosiska", cat: "Kolbasa va sosiska", unit: "500 g", price: 38000, art: { form: "kolbasa", c1: "#e0836f", c2: "#b45309" } },
  { shop: "gosht", name: "Tovuqli sosiska", cat: "Kolbasa va sosiska", unit: "500 g", price: 32000, art: { form: "kolbasa", c1: "#e8a58a", c2: "#b45309" } },
  { shop: "gosht", name: "Varyoniy kolbasa", cat: "Kolbasa va sosiska", unit: "500 g", price: 42000, art: { form: "kolbasa", c1: "#d98a8a", c2: "#8b3a4e" } },
  { shop: "gosht", name: "Servelat (dudlangan)", cat: "Kolbasa va sosiska", unit: "400 g", price: 62000, art: { form: "kolbasa", c1: "#8b3a2f", c2: "#5f2419" } },
  { shop: "gosht", name: "Kazi (ot go'shti)", cat: "Kolbasa va sosiska", unit: "500 g", price: 140000, art: { form: "kolbasa", c1: "#7f1d1d", c2: "#4a0f0f" } },
  { shop: "gosht", name: "Vetchina (tovuqli)", cat: "Kolbasa va sosiska", unit: "400 g", price: 44000, art: { form: "kolbasa", c1: "#e0a09a", c2: "#b45309" } },
  { shop: "gosht", name: "Salyami", cat: "Kolbasa va sosiska", unit: "300 g", price: 58000, art: { form: "kolbasa", c1: "#9b2c2c", c2: "#5f1616" } },
  { shop: "gosht", name: "Barbekyu sosiska", cat: "Kolbasa va sosiska", unit: "600 g", price: 46000, art: { form: "kolbasa", c1: "#c2506b", c2: "#7c2d12" } },
  // Baliq va dengiz mahsulotlari
  { shop: "gosht", name: "Sazan (zog'ora baliq)", cat: "Baliq va dengiz mahsulotlari", unit: "1 kg", price: 48000, art: { form: "baliq", c1: "#94a3b8", c2: "#475569" } },
  { shop: "gosht", name: "Forel", cat: "Baliq va dengiz mahsulotlari", unit: "1 kg", price: 120000, art: { form: "baliq", c1: "#fb7185", c2: "#be123c" } },
  { shop: "gosht", name: "Losos filesi", cat: "Baliq va dengiz mahsulotlari", unit: "500 g", price: 145000, art: { form: "baliq", c1: "#fb923c", c2: "#c2410c" } },
  { shop: "gosht", name: "Skumbriya (dudlangan)", cat: "Baliq va dengiz mahsulotlari", unit: "1 kg", price: 72000, art: { form: "baliq", c1: "#64748b", c2: "#334155" } },
  { shop: "gosht", name: "Seld (tuzlangan)", cat: "Baliq va dengiz mahsulotlari", unit: "500 g", price: 34000, art: { form: "baliq", c1: "#a8b8c8", c2: "#556677" } },
  { shop: "gosht", name: "Qisqichbaqa (muzlatilgan)", cat: "Baliq va dengiz mahsulotlari", unit: "500 g", price: 98000, art: { form: "paket", c1: "#fb7185", c2: "#be123c", c3: "#0ea5e9", glyph: "qor" } },
  { shop: "gosht", name: "Baliq filesi (muzlatilgan)", cat: "Baliq va dengiz mahsulotlari", unit: "1 kg", price: 68000, art: { form: "paket", c1: "#7dd3fc", c2: "#0369a1", c3: "#0369a1", glyph: "qor" } },
  // Tuxum
  { shop: "gosht", name: "Tovuq tuxumi", cat: "Tuxum", unit: "10 dona", price: 16000, art: { form: "tuxum", c1: "#f5e6cf", c2: "#cbd5e1", c3: "#b45309" } },
  { shop: "gosht", name: "Tovuq tuxumi", cat: "Tuxum", unit: "30 dona", price: 46000, art: { form: "tuxum", c1: "#f5e6cf", c2: "#94a3b8", c3: "#b45309" } },
  { shop: "gosht", name: "Uy tuxumi (qishloqdan)", cat: "Tuxum", unit: "10 dona", price: 22000, art: { form: "tuxum", c1: "#d9a066", c2: "#a97335", c3: "#7c2d12", glyph: "quyosh" } },
  { shop: "gosht", name: "Bedana tuxumi", cat: "Tuxum", unit: "20 dona", price: 24000, art: { form: "tuxum", c1: "#e8d5a8", c2: "#94a3b8", c3: "#4d7c0f" } },
  // Muzlatilgan mahsulotlar
  { shop: "gosht", name: "Pelmen (mol go'shtli)", cat: "Muzlatilgan mahsulotlar", unit: "800 g", price: 42000, art: { form: "paket", c1: "#cbd5e1", c2: "#94a3b8", c3: "#0ea5e9", glyph: "qor" } },
  { shop: "gosht", name: "Manti (yarim tayyor)", cat: "Muzlatilgan mahsulotlar", unit: "800 g", price: 46000, art: { form: "paket", c1: "#e2e8f0", c2: "#94a3b8", c3: "#0ea5e9", glyph: "qor" } },
  { shop: "gosht", name: "Chuchvara", cat: "Muzlatilgan mahsulotlar", unit: "800 g", price: 38000, art: { form: "paket", c1: "#dbe3ea", c2: "#94a3b8", c3: "#0ea5e9", glyph: "qor" } },
  { shop: "gosht", name: "Kartoshka fri", cat: "Muzlatilgan mahsulotlar", unit: "750 g", price: 24000, art: { form: "paket", c1: "#f59e0b", c2: "#b45309", c3: "#0ea5e9", glyph: "qor" } },
  { shop: "gosht", name: "Muzlatilgan sabzavot aralashmasi", cat: "Muzlatilgan mahsulotlar", unit: "400 g", price: 18000, art: { form: "paket", c1: "#22c55e", c2: "#15803d", c3: "#0ea5e9", glyph: "qor" } },
  { shop: "gosht", name: "Muzlatilgan qulupnay", cat: "Muzlatilgan mahsulotlar", unit: "300 g", price: 26000, art: { form: "paket", c1: "#e11d48", c2: "#9f1239", c3: "#0ea5e9", glyph: "qor" } },
  { shop: "gosht", name: "Tovuqli nagets", cat: "Muzlatilgan mahsulotlar", unit: "300 g", price: 28000, art: { form: "paket", c1: "#f59e0b", c2: "#b45309", c3: "#0ea5e9", glyph: "qor" } },
  { shop: "gosht", name: "Slonniy xamir", cat: "Muzlatilgan mahsulotlar", unit: "500 g", price: 16000, art: { form: "paket", c1: "#f5e6cf", c2: "#d1a054", c3: "#0ea5e9", glyph: "qor" } },
];

export const PRODUCTS: SeedProduct[] = [...MARKET, ...BOZOR, ...NON, ...GOSHT];
