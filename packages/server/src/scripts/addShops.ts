// 🏬 Yangi do'kon ochish (ega so'rovi 2026-07-28: «Said Ota va Bahor Market uchun yangi do'kon och»).
//
// DARK OCHILADI (`active=false`) — bu ATAYLAB va sotuvchi-sehrgar bilan bir xil qoida: do'kon
// mijozga faqat ega yoqqanda ko'rinadi. Sabab — hozircha ikkalasida ham TELEFON RAQAMI YO'Q
// (vaqtinchalik dispetcher raqami qo'yildi) va mahsulot yo'q: shu holda mijozga ko'rsatilsa,
// u bo'sh javon va noto'g'ri raqamni ko'radi.
//
// Logo: shopLogoService generatori (vaqtinchalik). Ega bot `/logo` orqali haqiqiy logoni
// yuborsa — o'sha zahoti almashadi, kod o'zgartirilmaydi.
//
// IDEMPOTENT: nom bo'yicha tekshiradi, qayta yugurtirilsa dublikat yaratmaydi.
// Default DRY-RUN. Yozish: npx dotenv -e ../../.env -- npx tsx src/scripts/addShops.ts --apply
import { prisma } from "../db";
import { shopLogoDataUrl, monogram } from "../services/shopLogoService";

const APPLY = process.argv.includes("--apply");
const OWNER_TG = "6506297119";
const TEMP_PHONE = "+998916626060"; // kas1067 dispetcher — EGA o'z raqamiga almashtiradi

const NEW_SHOPS: { name: string; category: string; deliveryText: string }[] = [
  { name: "Said Ota Market", category: "oziq-ovqat", deliveryText: "Bugun yetkazamiz" },
  { name: "Bahor Market", category: "oziq-ovqat", deliveryText: "Bugun yetkazamiz" },
];

async function main(): Promise<void> {
  console.log(`— addShops ${APPLY ? "APPLY" : "DRY-RUN"} —\n`);
  let created = 0, skipped = 0;
  for (const s of NEW_SHOPS) {
    const exists = await prisma.marketShop.findFirst({ where: { name: s.name } });
    if (exists) { console.log(`⏭ «${s.name}» allaqachon bor (#${exists.id}) — tegilmadi`); skipped++; continue; }
    console.log(`+ «${s.name}» · logo ${monogram(s.name)} · telefon ${TEMP_PHONE} (VAQTINCHALIK) · DARK (active=false)`);
    if (!APPLY) continue;
    const row = await prisma.marketShop.create({
      data: {
        name: s.name,
        category: s.category,
        phone: TEMP_PHONE,
        deliveryText: s.deliveryText,
        ownerChatId: OWNER_TG, // buyurtma-kartalari egaga boradi (sotuvchi tayinlangunicha)
        photoUrl: shopLogoDataUrl(s.name),
        active: false,
        shopKind: "bozor",
      },
    });
    console.log(`  → yaratildi #${row.id}`);
    created++;
  }
  const [total, act] = await Promise.all([prisma.marketShop.count(), prisma.marketShop.count({ where: { active: true } })]);
  console.log(`\nISBOT: yaratildi=${created} · o'tkazildi=${skipped} · jami do'kon=${total} · faol=${act}`);
  if (APPLY && created) {
    console.log("\nKEYINGI QADAM (ega):");
    console.log("  1) admin panelda telefon raqamini to'g'rilash (hozir dispetcher raqami turibdi)");
    console.log("  2) botga /logo — haqiqiy logoni yuborish");
    console.log("  3) mahsulot qo'shish");
    console.log("  4) shundan keyin do'konni YOQISH (active) — mijozga o'shanda ko'rinadi");
  }
  if (!APPLY) console.log("(DRY-RUN — hech narsa yozilmadi. Yozish: --apply)");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
