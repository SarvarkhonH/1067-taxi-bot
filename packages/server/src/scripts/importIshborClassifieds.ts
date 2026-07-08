// 📋 E'LONLAR seed: real "sotiladi/ijara" posts curated from the @koson_ishbor group export
// (see importIshborServices.ts for the same source). ClassifiedAd requires a REAL member tgId
// (edit rights + payment resolve at submit time) — these ads have no real 1067 account behind
// them, so they're admin-entered under the OWNER's own tgId (same pattern as the 2 existing
// owner-test listings), free (paidCoins 0), straight to "active". Idempotent-ish: reruns will
// duplicate if run twice — check ADMIN_TAG marker before rerunning.
// Usage: npx tsx src/scripts/importIshborClassifieds.ts
import "../env";
import { prisma } from "../db";
import { normalizeUzPhone } from "../services/serviceDirectory";

const OWNER_TG_ID = BigInt("6506297119");
const ADMIN_TAG = "[ishbor-import]"; // marker in desc so a rerun can be detected/cleaned

interface Row {
  authorName: string; category: string; subtype: string; title: string;
  desc: string; priceSom: number | null; phone: string;
}

const ROWS: Row[] = [
  {
    authorName: "Farzandlarim baxtim", category: "oldi_sotdi", subtype: "sotaman",
    title: "Beton plita — 8 dona (6x1.20)", desc: "O'lchami 6x1.20, 8 dona. Narx kelishiladi.",
    priceSom: null, phone: "950852174",
  },
  {
    authorName: "Turg'unov Muhammad Mustafo", category: "oldi_sotdi", subtype: "sotaman",
    title: "Qamish sotiladi", desc: "Kelishilgan narxda.",
    priceSom: null, phone: "880410300",
  },
  {
    authorName: "Nigora Irgashova", category: "oldi_sotdi", subtype: "sotaman",
    title: "O'tin sotiladi", desc: "Kelishilgan narxda.",
    priceSom: null, phone: "930908227",
  },
  {
    authorName: "Mustafo Jurayev", category: "oldi_sotdi", subtype: "sotaman",
    title: "Beda sotiladi", desc: "Chorva uchun beda (yonchqa).",
    priceSom: null, phone: "979526060",
  },
  {
    authorName: "HR Nargiza", category: "uyjoy", subtype: "ijara",
    title: "Ofis/biznes joyi ijaraga beriladi", desc: "Koson, bino 2-qavati. Maydoni 14x6 m yoki 20x5.5 m. Narx kelishiladi.",
    priceSom: null, phone: "906786327",
  },
];

async function main(): Promise<void> {
  let created = 0, skipped = 0;
  for (const r of ROWS) {
    const phone = normalizeUzPhone(r.phone);
    if (!phone) { skipped++; console.log(`  ⚠️ yaroqsiz telefon: ${r.phone} (${r.title})`); continue; }
    const dup = await prisma.classifiedAd.findFirst({ where: { phone, title: r.title } });
    if (dup) { skipped++; console.log(`  · dublikat, o'tkazildi: ${r.title} (${phone})`); continue; }
    await prisma.classifiedAd.create({
      data: {
        tgId: OWNER_TG_ID,
        authorName: r.authorName,
        category: r.category,
        subtype: r.subtype,
        title: r.title,
        desc: `${ADMIN_TAG} ${r.desc}`.trim(),
        priceSom: r.priceSom,
        phone,
        status: "active",
        paidCoins: 0,
        expiresAt: new Date(Date.now() + 30 * 86400_000),
      },
    });
    created++;
  }
  console.log(`\n✅ E'lonlar import: ${created} yangi · ${skipped} o'tkazildi`);
  await prisma.$disconnect();
}

void main();
