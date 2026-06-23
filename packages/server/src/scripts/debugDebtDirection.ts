// Diagnose the debt-direction bug. For every confirmed DriverDebtPayment, pull the driver's kas
// payment-history ledger (oldDebt→newDebt per row) to SEE what addDriverPayment(debt=true) actually
// did to their debt. Read-only.
import "../env";
import { prisma } from "../db";
import { getDataSource } from "../kas";

async function main(): Promise<void> {
  const pays = await prisma.driverDebtPayment.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
  console.log(`=== ${pays.length} DriverDebtPayment rows ===`);
  for (const p of pays) {
    console.log(`\n#${p.id} member=${p.memberId} car=${p.carNumber} amount=${p.amount} status=${p.status} at=${p.createdAt.toISOString()} kasBalance=${p.kasBalance ?? "?"} err=${p.errorNote ?? "-"}`);
  }

  // For the cars that had a CONFIRMED payment, show current kas debt + balance
  const confirmedCars = [...new Set(pays.filter((p) => p.status === "confirmed").map((p) => p.carNumber))];
  console.log(`\n=== current kas account for ${confirmedCars.length} cars that paid (confirmed) ===`);
  const ds = getDataSource();
  for (const car of confirmedCars) {
    const acct = await ds.getDriverAccount(car).catch(() => null);
    console.log(`[${car}] → ${acct ? `balance=${acct.balance} debt=${acct.debt}` : "(kas lookup failed)"}`);
  }

  await prisma.$disconnect();
}
main();
