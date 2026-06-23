// Undo our debt-direction bug on the owner's car. We wrongly added 10000 debt via one debt=true
// call (#43); the 5000 пластик test already reversed half. This reverses the remaining 5000 so the
// owner is made whole on OUR mistake (net-zero ledger correction — we added 10000, we remove 10000).
// Their own driver-app takeDebt testing (the rest) is NOT touched. Owner-authorized cleanup.
import "../env";
import { prisma } from "../db";
import { getDataSource } from "../kas";

const CAR = "70A111AA";
const REVERSE = 5000; // remaining half of our wrongful 10000

async function main(): Promise<void> {
  const ds = getDataSource();
  if (ds.name !== "live") { console.log("not live — abort"); process.exit(1); }

  const before = await ds.getDriverAccount(CAR);
  if (!before) { console.log("kas lookup failed"); process.exit(1); }
  console.log(`BEFORE ${CAR}: debt=${before.debt} balance=${before.balance}`);

  const res = await ds.addDriverPayment(before.kasId, CAR, REVERSE, "1067 bot — bug-tuzatish (debt qaytarish)", false);
  console.log(`reverse ${REVERSE} via пластик: ok=${res.ok} status=${res.status}`);

  const after = await ds.getDriverAccount(CAR);
  console.log(`AFTER  ${CAR}: debt=${after?.debt} balance=${after?.balance}`);
  console.log(`Δ debt = ${(after?.debt ?? 0) - before.debt} (kutilgan -${REVERSE})`);
  console.log(after && after.debt === before.debt - REVERSE ? "\n✅ Bizning 10000 bug to'liq qaytarildi. Qolgan qarz = egasining o'z testi (takeDebt)." : "\n⚠️ kutilmagan natija — tekshir.");
  await prisma.$disconnect();
}
main();
