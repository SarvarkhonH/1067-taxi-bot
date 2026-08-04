/**
 * 🔧 BIR MARTALIK MIGRATSIYA — `bonus:econ` dagi SAQLANGAN oyin knoblarini yangi jadvalga o'tkazadi.
 *
 * ⚠️ NEGA KERAK (nazoratchi agent 2026-08-04 topdi — deploy'ni to'xtatgan xato):
 * `bonusConfig.setBonusEcon` BUTUN konfigni yozadi (`JSON.stringify(cur)`), ya'ni ega panelda
 * BIR MARTA istalgan knobga tekkan bo'lsa `bonus:econ` qatorida oyin knoblari ham SAQLANGAN.
 * `getBonusEcon` esa saqlanganini `def` dan USTUN qo'yadi. Demak kodda `def: 150 → 35` qilish
 * jonlida HECH NARSA qilmaydi — `OYIN_SOM_PER_BALL` (kod konstantasi) esa darhol 2× bo'ladi.
 * Ikkalasi birga: emissiya eski sur'atda qoladi, ball bahosi ikkilanadi → mukofot xarajati
 * KAMAYMAYDI, IKKI BAROBAR OSHADI. Aynan S1 maqsadiga teskari.
 *
 * Bu skript SAQLANGAN qiymatlarni kod default'lariga qaytaradi — faqat `oyin*` knoblarini.
 * Boshqa knoblar (cashback, withdraw, missiyalar…) TEGILMAYDI.
 *
 * VPS'da:
 *   cd /opt/app/packages/server
 *   npx dotenv -e ../../.env -- npx tsx src/scripts/resetOyinKnobs.ts          # ko'rish (quruq)
 *   npx dotenv -e ../../.env -- npx tsx src/scripts/resetOyinKnobs.ts --apply  # yozish
 */
import { BONUS_ECON_KNOBS } from "@t1067/shared";
import { prisma } from "../db";

const APPLY = process.argv.includes("--apply");

async function main(): Promise<void> {
  const row = await prisma.appState.findUnique({ where: { key: "bonus:econ" } });
  if (!row) {
    console.log("ℹ️ `bonus:econ` qatori YO'Q — saqlangan qiymat yo'q, kod default'lari allaqachon amalda.");
    return;
  }
  let saved: Record<string, unknown>;
  try {
    saved = JSON.parse(row.value) as Record<string, unknown>;
  } catch {
    console.log("❌ `bonus:econ` JSON buzuq — qo'lda ko'rib chiqing, HECH NARSA o'zgartirilmadi.");
    process.exitCode = 1;
    return;
  }

  const oyinKnobs = BONUS_ECON_KNOBS.filter((k) => k.key.startsWith("oyin"));
  const changes: { key: string; from: unknown; to: number }[] = [];
  for (const k of oyinKnobs) {
    const cur = saved[k.key];
    // Saqlangan qiymat YO'Q bo'lsa — `getBonusEcon` allaqachon `def` ni oladi, tegish shart emas.
    if (typeof cur !== "number") continue;
    if (cur !== k.def) changes.push({ key: k.key, from: cur, to: k.def });
  }

  console.log(`🔧 OYIN KNOBLARI — ${oyinKnobs.length} ta knobdan ${changes.length} tasi FARQ QILADI\n`);
  if (changes.length === 0) {
    console.log("✅ Saqlangan qiymatlar kod default'lariga MOS — hech narsa qilish shart emas.");
    return;
  }
  console.log("   knob                        saqlangan  →  yangi");
  for (const c of changes) {
    console.log(`   ${c.key.padEnd(26)} ${String(c.from).padStart(9)}  →  ${String(c.to).padStart(5)}`);
  }

  if (!APPLY) {
    console.log("\n⚠️ QURUQ YURISH — hech narsa yozilmadi. Yozish uchun: --apply");
    return;
  }

  // ⚠️ Faqat `oyin*` kalitlari almashtiriladi — qolgan konfig BUTUNLIGICHA saqlanadi.
  const next = { ...saved };
  for (const c of changes) next[c.key] = c.to;
  await prisma.appState.update({ where: { key: "bonus:econ" }, data: { value: JSON.stringify(next) } });
  console.log(`\n✅ YOZILDI — ${changes.length} ta knob yangilandi.`);
  console.log("   ⏳ `getBonusEcon` keshi 30 soniya — ta'siri shundan keyin ko'rinadi.");
}

main()
  .catch((e) => { console.error("💥", e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
