// 🔧 P2-deep-5 — open/close a limited-event part's mint window from the CLI.
// Opening a part = it becomes mintable for ALL users (the catalog "Yopiq" → "Olish"); the hard
// mint-cap still applies (event tugasa qayta yo'q). Closing freezes supply (P2P resale only).
// Usage: npx dotenv -e ../../.env -- tsx src/scripts/setPartEvent.ts <partCode|all> <on|off>
//        npx dotenv -e ../../.env -- tsx src/scripts/setPartEvent.ts            (no args → just print state)
import "../env";
import { MOTOR_PARTS } from "@t1067/shared";
import { setPartMintEvent, getPartEvents } from "../services/garajService";
import { prisma } from "../db";

async function main(): Promise<void> {
  const [codeArg, stateArg] = process.argv.slice(2);
  if (codeArg) {
    if (stateArg !== "on" && stateArg !== "off") {
      console.error("usage: setPartEvent.ts <partCode|all> <on|off>");
      process.exit(1);
    }
    const open = stateArg === "on";
    const codes = codeArg === "all" ? MOTOR_PARTS.map((p) => p.code) : [codeArg];
    for (const c of codes) {
      if (!MOTOR_PARTS.some((p) => p.code === c)) { console.error(`unknown part: ${c} (have: ${MOTOR_PARTS.map((p) => p.code).join(", ")})`); process.exit(1); }
      await setPartMintEvent(c, open);
    }
  }
  const ev = await getPartEvents();
  console.log("\n🔧 Detal mint-event holati:");
  for (const e of ev) console.log(`  ${e.eventOpen ? "🟢 OCHIQ" : "⚫ yopiq"}  ${e.emoji} ${e.code.padEnd(12)} ${e.minted}/${e.mintCap} chiqarildi · +${e.earnBonusPct}% · 🪙${e.cost.toLocaleString("ru-RU")}`);
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect().catch(() => undefined); process.exit(1); });
