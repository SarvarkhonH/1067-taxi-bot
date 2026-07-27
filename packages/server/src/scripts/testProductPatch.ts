// 🏷 Katalog-pasporti validatsiyasi (cleanPatch) — DB'ga TEGMAYDI, sof funksiya sinovi.
// Yugurtirish: npx tsx src/scripts/testProductPatch.ts   (env ham kerak emas)
import { cleanPatch } from "../services/shopService";

let pass = 0, fail = 0;
function check(label: string, got: unknown, want: unknown): void {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "✅" : "❌"} ${label}${ok ? "" : `\n     kutilgan: ${JSON.stringify(want)}\n     kelgan:   ${JSON.stringify(got)}`}`);
  ok ? pass++ : fail++;
}

// — barkod —
check("barkod: to'g'ri EAN-13 saqlanadi", cleanPatch({ barcode: "5449000000999" }).barcode, "5449000000999");
check("barkod: defis/probel tozalanadi", cleanPatch({ barcode: "544-9000 000999" }).barcode, "5449000000999");
check("barkod: qisqa (7) → null", cleanPatch({ barcode: "1234567" }).barcode, null);
check("barkod: uzun (15) → null", cleanPatch({ barcode: "123456789012345" }).barcode, null);
check("barkod: harflar → null", cleanPatch({ barcode: "abc" }).barcode, null);
check("barkod: bo'sh satr → null (tozalash)", cleanPatch({ barcode: "" }).barcode, null);
check("barkod: yuborilmasa — tegilmaydi", "barcode" in cleanPatch({ name: "x" }), false);

// — matn maydonlari —
check("brend: probel kesiladi", cleanPatch({ brand: "  Coca-Cola  " }).brand, "Coca-Cola");
check("brend: bo'sh → null", cleanPatch({ brand: "   " }).brand, null);
check("brend: 40 belgidan kesiladi", cleanPatch({ brand: "B".repeat(50) }).brand?.length, 40);
check("SKU: 32 belgidan kesiladi", cleanPatch({ sku: "S".repeat(50) }).sku?.length, 32);
check("hajm: 24 belgidan kesiladi", cleanPatch({ unit: "U".repeat(50) }).unit?.length, 24);
check("ishlab chiqaruvchi: 60 belgi", cleanPatch({ manufacturer: "M".repeat(80) }).manufacturer?.length, 60);
check("yetkazib beruvchi: 60 belgi", cleanPatch({ supplier: "Y".repeat(80) }).supplier?.length, 60);
check("brend: yuborilmasa — tegilmaydi", "brand" in cleanPatch({ name: "x" }), false);

// — yaroqlilik muddati —
check("muddat: ISO sana → Date", cleanPatch({ expiryDate: "2027-01-31" }).expiryDate?.toISOString(), "2027-01-31T00:00:00.000Z");
check("muddat: noto'g'ri format → null", cleanPatch({ expiryDate: "31.01.2027" }).expiryDate, null);
check("muddat: mavjud bo'lmagan sana → null", cleanPatch({ expiryDate: "2027-13-45" }).expiryDate, null);
check("muddat: bo'sh → null (tozalash)", cleanPatch({ expiryDate: "" }).expiryDate, null);

// — eski maydonlar buzilmagani —
check("narx: pastki chegara 1", cleanPatch({ priceTanga: 0 }).priceTanga, 1);
check("narx: yuqori chegara", cleanPatch({ priceTanga: 9_999_999 }).priceTanga, 5_000_000);
check("soni: manfiy → 0", cleanPatch({ stock: -5 }).stock, 0);
check("nom: 80 belgidan kesiladi", cleanPatch({ name: "N".repeat(100) }).name?.length, 80);

console.log(`\n— ${pass} o'tdi · ${fail} yiqildi —`);
process.exitCode = fail ? 1 : 0;
