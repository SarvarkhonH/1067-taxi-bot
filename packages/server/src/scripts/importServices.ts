// 🔎 XIZMATLAR seed: import the owner's OLD business-directory (Express+Mongo prototype) export
// into ServiceListing. Idempotent: skips rows whose normalized phone already exists. The old
// 45 messy micro-categories collapse into our 10 clean ones; the ORIGINAL category name is
// preserved as a search tag (so "santexnik" / "to'yxona" still hit). ALL-CAPS names → Title Case.
// Usage: npx tsx src/scripts/importServices.ts <path-to-businesses.json>
import "../env"; // repo-root .env → DATABASE_URL (app DB); flag stays OFF so riders see nothing
import { readFileSync } from "node:fs";
import { prisma } from "../db";
import { normalizeUzPhone } from "../services/serviceDirectory";

interface OldRow { name: string; number: string; tags: string; isVip: boolean; category: string | null; createdAt?: string }

// old category (lowercased, trimmed) → our clean category name
const CAT_MAP: Record<string, string> = {
  "fasfud": "Oziq-ovqat", "restoran": "Oziq-ovqat", "non magazn": "Oziq-ovqat", "suv": "Oziq-ovqat",
  "qurilish mollari": "Qurilish", "metalon": "Qurilish", "eshik do`koni": "Qurilish", "xovuz qurish xizmati": "Qurilish",
  "quduq kovlash": "Qurilish", "zina quruvchi": "Qurilish", "blokchi": "Qurilish", "betonchi": "Qurilish",
  "kafel teruvchi": "Qurilish", "malyar": "Qurilish",
  "mebel usta": "Usta-servis", "tikuvchi": "Usta-servis", "telefon ustasi": "Usta-servis", "kanditsaner usto": "Usta-servis",
  "santexnka": "Usta-servis", "ariston ustasi": "Usta-servis", "gaz pilita usto": "Usta-servis", "elektrik": "Usta-servis",
  "televizor usto": "Usta-servis", "gilam yuvish": "Usta-servis",
  "sartarosh": "Go'zallik",
  "tish shifokori": "Tibbiyot", "dorixona": "Tibbiyot", "labo": "Tibbiyot",
  "o`quv markaz": "Ta'lim", "avto maktab": "Ta'lim",
  "to`yxona": "To'y-marosim",
  "avia": "Transport", "avto zapchas": "Transport", "avto servis": "Transport", "o`rta yuklar": "Transport", "kamaz - zill": "Transport",
  "kredit magazn": "Do'kon-savdo", "bozor": "Do'kon-savdo", "chinni magazin": "Do'kon-savdo", "kiyim magazin": "Do'kon-savdo",
  "ko`rpacha magazin": "Do'kon-savdo", "kamera magazn": "Do'kon-savdo", "stol stul": "Do'kon-savdo",
  "natarius": "Boshqa",
};

function titleCase(s: string): string {
  return s.trim().replace(/\s+/g, " ").split(" ").map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w)).join(" ");
}

async function main(): Promise<void> {
  const path = process.argv[2];
  if (!path) { console.error("usage: importServices <businesses.json>"); process.exit(1); }
  const rows = JSON.parse(readFileSync(path, "utf8")) as OldRow[];

  const cats = await prisma.serviceCategory.findMany();
  const catId = new Map(cats.map((c) => [c.name, c.id]));
  const boshqa = catId.get("Boshqa");
  if (!boshqa) { console.error("Run seedServiceCategories first (Boshqa yo'q)."); process.exit(1); }

  let created = 0, skippedDup = 0, badPhone = 0, unmapped = 0;
  for (const r of rows) {
    const oldCat = (r.category ?? "").trim().toLowerCase();
    const mapped = CAT_MAP[oldCat];
    if (oldCat && !mapped) { unmapped++; console.log(`  ⚠️ mapping yo'q: "${r.category}" → Boshqa (${r.name})`); }
    const phone = normalizeUzPhone(r.number);
    if (!phone) { badPhone++; console.log(`  ⚠️ telefon yaroqsiz, O'TKAZIB YUBORILDI: "${r.number}" (${r.name})`); continue; }
    const dup = await prisma.serviceListing.findFirst({ where: { phone }, select: { id: true } });
    if (dup) { skippedDup++; continue; }
    // original category name becomes a search tag ("santexnika", "to'yxona" still findable)
    const tagParts = [r.tags, oldCat.replace(/`/g, "'")].map((t) => t.trim()).filter(Boolean);
    await prisma.serviceListing.create({
      data: {
        categoryId: (mapped && catId.get(mapped)) || boshqa,
        name: titleCase(r.name).slice(0, 80),
        phone,
        tags: tagParts.join(", ").slice(0, 200),
        isVip: !!r.isVip,
        status: "active", // owner's own vetted list → straight live (flag still hides everything)
        rankScore: 4.0, // bayes prior (no reviews yet)
      },
    });
    created++;
  }
  const total = await prisma.serviceListing.count({ where: { status: "active" } });
  console.log(`\n✅ Import: ${created} yangi · ${skippedDup} dublikat o'tkazildi · ${badPhone} yaroqsiz telefon · ${unmapped} mapping'siz (Boshqa'ga)`);
  console.log(`📊 Katalogda jami ${total} ta aktiv xizmat.`);
  await prisma.$disconnect();
}

void main();
