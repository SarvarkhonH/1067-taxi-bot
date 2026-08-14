/**
 * 🔧 BIR MARTALIK: `oyinGashtakRejoinCooldownDays` knobini o'zgartiradi (default 30 kun).
 *
 * Ega talabi (2026-08-13): "xoxlagan odam xoxlagan payt qo'shilib chiqa olsin" — gashtakdan
 * chiqib qayta qo'shilishni cheklovchi sovutish davri yo'q qilinsin. Bu skript admin panel
 * Sozlama → 🎚 Ball jadvali → "Gashtak — qayta qo'shilish sovutish kuni" bilan BIR XIL yozuvni
 * (`bonus:econ` AppState qatori) to'g'ridan-to'g'ri o'zgartiradi — natija bir xil, faqat
 * panelga kirmasdan.
 *
 * VPS'da:
 *   cd /opt/app/packages/server
 *   npx dotenv -e ../../.env -- npx tsx src/scripts/setGashtakCooldown.ts          # ko'rish (quruq)
 *   npx dotenv -e ../../.env -- npx tsx src/scripts/setGashtakCooldown.ts --apply  # 0 kunga yozish
 *   npx dotenv -e ../../.env -- npx tsx src/scripts/setGashtakCooldown.ts --apply --days=7  # boshqa qiymat
 */
import { getBonusEcon, setBonusEcon } from "../services/bonusConfig";
import { prisma } from "../db";

const APPLY = process.argv.includes("--apply");
const daysArg = process.argv.find((a) => a.startsWith("--days="));
const target = daysArg ? Number(daysArg.slice("--days=".length)) : 0;

async function main(): Promise<void> {
  if (!Number.isFinite(target) || target < 0) {
    console.log("❌ --days qiymati noto'g'ri.");
    process.exitCode = 1;
    return;
  }
  const cur = (await getBonusEcon()).oyinGashtakRejoinCooldownDays ?? 30;
  console.log(`🔧 oyinGashtakRejoinCooldownDays: hozir ${cur} kun → maqsad ${target} kun`);
  if (cur === target) {
    console.log("✅ Allaqachon shu qiymatda — hech narsa qilish shart emas.");
    return;
  }
  if (!APPLY) {
    console.log("⚠️ QURUQ YURISH — hech narsa yozilmadi. Yozish uchun: --apply");
    return;
  }
  const next = await setBonusEcon("oyinGashtakRejoinCooldownDays", target);
  console.log(`✅ YOZILDI — endi ${next.oyinGashtakRejoinCooldownDays} kun.`);
  console.log("   Ta'siri DARHOL — setBonusEcon keshni o'zi bekor qiladi.");
}

main()
  .catch((e) => { console.error("💥", e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
