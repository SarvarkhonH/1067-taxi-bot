// CONTROLLED single test (owner-authorized): does addDriverPayment(debt=FALSE) — i.e. the kas
// "пластик/online" payment method — REDUCE the driver's debt? Run on the owner's own car
// (70A111AA, debt ~60000). Reads debt before + after a 5000 пластик payment.
//
// Run: KAS_MODE=live dotenv -e ../../.env -- tsx src/scripts/testDebtViaPlastik.ts
import "../env";
import { prisma } from "../db";
import { getDataSource } from "../kas";

const CAR = "70A111AA";
const AMOUNT = 5000;

async function main(): Promise<void> {
  const ds = getDataSource();
  if (ds.name !== "live") {
    console.log("⚠️  KAS_MODE is not live — aborting (this test must hit real kas).");
    process.exit(1);
  }

  const before = await ds.getDriverAccount(CAR);
  if (!before) {
    console.log(`❌ kas lookup failed for ${CAR}`);
    process.exit(1);
  }
  console.log(`BEFORE  ${CAR}: balance=${before.balance}  debt=${before.debt}  kasId=${before.kasId}`);

  console.log(`\n→ addDriverPayment(${before.kasId}, ${CAR}, ${AMOUNT}, debt=FALSE)  [пластик/online]`);
  const res = await ds.addDriverPayment(before.kasId, CAR, AMOUNT, "1067 bot — qarz test (plastik)", false);
  console.log(`   kas response: ok=${res.ok} status=${res.status} balance=${res.balance}`);

  // small wait so kas commits, then re-read
  const after = await ds.getDriverAccount(CAR);
  console.log(`\nAFTER   ${CAR}: balance=${after?.balance}  debt=${after?.debt}`);

  if (after) {
    const debtDelta = after.debt - before.debt;
    const balDelta = after.balance - before.balance;
    console.log(`\nΔ debt    = ${debtDelta >= 0 ? "+" : ""}${debtDelta}  (kutilgan: -${AMOUNT} agar пластик qarzni kamaytirsa)`);
    console.log(`Δ balance = ${balDelta >= 0 ? "+" : ""}${balDelta}`);
    if (debtDelta === -AMOUNT) console.log(`\n✅ TO'G'RI: debt=false (пластик) qarzni AYNAN ${AMOUNT} kamaytirdi. Fix = addDriverPayment(debt:false).`);
    else if (debtDelta < 0) console.log(`\n✅ qarz kamaydi (${debtDelta}) — пластик qarzga qarshi ishlaydi (lekin delta ${AMOUNT} emas — tekshir).`);
    else if (debtDelta === 0 && balDelta === AMOUNT) console.log(`\n⚠️  qarz O'ZGARMADI, balans +${AMOUNT} — пластик faqat balansga tushadi, qarzni avto-kamaytirmaydi. Boshqa yo'l kerak.`);
    else console.log(`\n❌ kutilmagan: debtΔ=${debtDelta} balansΔ=${balDelta}. Tahlil kerak.`);
  }

  await prisma.$disconnect();
}
main();
