// 🌍 Open Food Facts — barkod bo'yicha mahsulot ma'lumoti va rasmi (ega so'rovi, 2026-07-28).
//
// NEGA AYNAN OFF: ega Korzinka/Yandex Lavka bazasidan ko'chirishni so'radi — bu mumkin emas
// (o'zga kompaniyaning katalogi va fotolari mualliflik huquqi bilan himoyalangan). Open Food Facts
// esa OCHIQ ma'lumot: ma'lumot ODbL, rasmlar CC-BY-SA. Ya'ni ishlatsa BO'LADI, sharti — manbani
// ko'rsatish. Shuning uchun har olingan rasmga `photoCredit` yoziladi va mahsulot sahifasida
// ko'rsatiladi.
//
// ⚠️ QAMROV (jonli sinov, 2026-07-28): xalqaro brendlar topiladi (Coca-Cola 5449000054227 →
// nom + brend + hajm + rasm), MAHALLIY o'zbek mahsulotlari (4870… prefiksi) topilMAYDI. Ya'ni bu
// import katalogning IMPORT qismini to'ldiradi; mahalliy non/sut/go'sht uchun baribir o'z
// fotolaringiz kerak. Bu chegara ochiq aytilgan — "hammasini to'ldiradi" degan va'da yo'q.
//
// Tezlik/odob: OFF User-Agent talab qiladi (anonim so'rovlar bloklanadi) va so'rovni tejashni
// so'raydi — shuning uchun bitta barkod bitta so'rov, timeout 8s, retry YO'Q.

const OFF_BASE = "https://world.openfoodfacts.org/api/v2/product";
const UA = "BirJoy/1.0 (https://birjoy.online; market catalog import)";
const FIELDS = "product_name,product_name_ru,product_name_uz,brands,quantity,image_front_url";

export interface OffProduct {
  barcode: string;
  name: string | null;
  brand: string | null;
  unit: string | null; // OFF "quantity" — bizdagi `unit` maydoniga to'g'ri keladi
  imageUrl: string | null;
  credit: string; // CC-BY-SA talabi: manba ko'rsatilishi shart
}

/** Barkodni tozalash: faqat raqam, 8–14 xona (cleanPatch bilan bir xil qoida). */
export function normalizeBarcode(raw: string): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  return d.length >= 8 && d.length <= 14 ? d : null;
}

export async function lookupBarcode(raw: string): Promise<OffProduct | null> {
  const barcode = normalizeBarcode(raw);
  if (!barcode) return null;
  try {
    const res = await fetch(`${OFF_BASE}/${barcode}.json?fields=${FIELDS}`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { status?: number; product?: Record<string, unknown> };
    if (data.status !== 1 || !data.product) return null;
    const p = data.product;
    const pick = (k: string): string | null => {
      const v = p[k];
      return typeof v === "string" && v.trim() ? v.trim() : null;
    };
    // Nomni tilga qarab tanlaymiz: o'zbekcha bo'lsa u, bo'lmasa ruscha, bo'lmasa asosiy.
    const name = pick("product_name_uz") ?? pick("product_name_ru") ?? pick("product_name");
    // "Coca Cola Life, Coca-Cola" kabi ro'yxatdan BIRINCHISI olinadi — bizda brend bitta maydon.
    const brand = (pick("brands") ?? "").split(",")[0]?.trim() || null;
    return {
      barcode,
      name,
      brand,
      unit: pick("quantity"),
      imageUrl: pick("image_front_url"),
      credit: `Open Food Facts (CC BY-SA) · ${barcode}`,
    };
  } catch {
    return null; // tarmoq/timeout — sotuvchi qo'lda to'ldiraveradi
  }
}

/** Rasmni yuklab olish. Faqat OFF domenidan — boshqa manzil berilsa RAD etiladi (aks holda bu
 *  funksiya "internetdan istalgan rasmni olib kel" ga aylanardi, bu esa aynan qilmaydigan ishimiz). */
export async function fetchOffImage(url: string): Promise<{ buf: Buffer; mime: string } | null> {
  if (!/^https:\/\/images\.openfoodfacts\.org\//.test(url)) return null;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const mime = res.headers.get("content-type") ?? "image/jpeg";
    if (!mime.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 4 * 1024 * 1024) return null; // 4 MB dan katta rasm kerak emas
    return { buf, mime };
  } catch {
    return null;
  }
}
