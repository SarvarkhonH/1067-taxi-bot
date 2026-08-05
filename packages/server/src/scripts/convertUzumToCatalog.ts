import * as fs from "fs";
import * as path from "path";
import type { OyinCatalogPrize } from "@t1067/shared";

interface UzumProduct {
  name: string;
  price: number;
  category: string;
  photoPath: string;
}

const CATEGORY_ICONS: Record<string, string> = {
  "Elektronika": "📱",
  "Uy uchun": "🏠",
  "Kiyim": "👕",
  "Poyabzallar": "👞",
  "Mebel": "🪑",
  "Qurilish va ta'mirlash": "🔨",
  "Dacha, bogʻ va tomorqa": "🌱",
  "Sport": "⚽",
  "Xobbi va ijod": "🎨",
  "Bolalar tovarlari": "🧸",
  "Avtotovarlar": "🚗",
  "Goʻzallik va parvarish": "💄",
  "Salomatlik": "💊",
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

function calculateBallPrice(somPrice: number, somPerBall = 20): number {
  // Round to nearest 100 for clean numbers
  return Math.max(100, Math.round(somPrice / somPerBall / 100) * 100);
}

async function convertProducts() {
  // Read products.json - use relative path from this script location
  const jsonPath = path.join(process.cwd(), "..", "..", "products.json");
  const jsonContent = fs.readFileSync(jsonPath, "utf-8");
  const products: UzumProduct[] = JSON.parse(jsonContent);

  console.log(`Converting ${products.length} Uzum products to OyinCatalogPrize format...`);

  const catalog: OyinCatalogPrize[] = products.map((product, idx) => {
    const icon = CATEGORY_ICONS[product.category] || "📦";
    const ballPrice = calculateBallPrice(product.price);

    return {
      key: `uzum-${slugify(product.name)}-${idx}`,
      icon,
      name: product.name,
      valueLabel: `${product.price.toLocaleString("uz-UZ")} so'm`,
      price: ballPrice,
      limit: 15, // Default 15 tickets per product
      photoUrl: product.photoPath || null,
      active: true,
    };
  });

  console.log("\n✅ Conversion complete!");
  console.log(`Total products: ${catalog.length}`);
  console.log(`Price range: ${Math.min(...catalog.map(p => p.price))} - ${Math.max(...catalog.map(p => p.price))} ball`);
  console.log(`Estimated value range: ${Math.min(...products.map(p => p.price)).toLocaleString("uz-UZ")} - ${Math.max(...products.map(p => p.price)).toLocaleString("uz-UZ")} so'm`);

  // Output sample
  console.log("\n📋 Sample products:");
  catalog.slice(0, 3).forEach(p => {
    console.log(`  - ${p.icon} ${p.name} (${p.valueLabel} → ${p.price} ball × ${p.limit} tickets)`);
  });

  // Write to file for import
  const outputPath = path.join(process.cwd(), "..", "..", "uzum-catalog.json");
  fs.writeFileSync(outputPath, JSON.stringify(catalog, null, 2));
  console.log(`\n✅ Catalog exported to: ${outputPath}`);

  return catalog;
}

convertProducts().catch(console.error);
