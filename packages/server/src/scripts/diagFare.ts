// Diagnose the "Yo'l haqi" (fare) message: are there stuck farepending markers, and does the
// booking id actually match a bookingReports row (with payment)? Run: npx tsx src/scripts/diagFare.ts
import { prisma } from "../db";
import { getDataSource } from "../kas";

async function main() {
  const pend = await prisma.appState.findMany({ where: { key: { startsWith: "farepending:" } } });
  const done = await prisma.appState.findMany({ where: { key: { startsWith: "faredone:" } } });
  console.log(`farepending (stuck/awaiting): ${pend.length} | faredone (delivered): ${done.length}`);

  const ds = getDataSource();
  for (const p of pend) {
    const bid = Number(p.key.split(":")[1] ?? 0);
    const [chatId, phone, att] = p.value.split("|");
    console.log(`\n• bid=${bid} chat=${chatId} phone=${phone} attempts=${att}`);
    const hist = await ds.getRideHistory(phone ?? "", 10).catch((e) => { console.log("  getRideHistory err:", e); return []; });
    console.log(`  history rows: ${hist.length}`);
    const match = hist.find((h) => h.id === bid);
    if (match) console.log(`  ✅ id MATCH → payment=${match.payment} status=${match.status} addr=${match.addressName}`);
    else {
      console.log(`  ❌ NO row with id=${bid}. Recent ids: ${hist.slice(0, 8).map((h) => `${h.id}(pay${h.payment})`).join(", ")}`);
    }
  }
  if (!pend.length) console.log("\nNo pending fares right now — last delivered:", done.slice(-3).map((d) => d.key));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
