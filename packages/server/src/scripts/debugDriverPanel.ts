// Debug why the Mini App driver debt-pay UI isn't visible. Checks, against the LIVE DB + kas:
//   1. owner's member (telegram 6506297119) — type + carNumber (driver tab only shows for type=driver)
//   2. a few real drivers — getDriverPanelExtras (linked? debt? canPayDebt?)
//   3. the qarz flag state
import "../env";
import { prisma } from "../db";
import { getDriverPanelExtras } from "../services/driverReportService";
import { featureOn } from "../services/featureFlags";

async function main(): Promise<void> {
  console.log("=== qarz flag ===");
  console.log("featureOn(qarz) =", await featureOn("qarz"));

  console.log("\n=== owner (tg 6506297119) ===");
  const ownerTu = await prisma.telegramUser.findUnique({ where: { id: "6506297119" }, include: { member: true } });
  if (!ownerTu?.member) {
    console.log("owner has NO linked member → no driver tab, no debt UI");
  } else {
    const m = ownerTu.member;
    console.log(`member id=${m.id} type=${m.type} carNumber=${m.carNumber ?? "(none)"} coins=${m.coins}`);
    console.log("→ driver tab shows?", m.type === "driver" ? "YES" : "NO (type != driver → BASE_TABS, no Daromad tab)");
    const ex = await getDriverPanelExtras(m.id);
    console.log("getDriverPanelExtras:", JSON.stringify(ex));
  }

  console.log("\n=== sample real drivers (type=driver, has carNumber) ===");
  const drivers = await prisma.member.findMany({ where: { type: "driver", carNumber: { not: null } }, take: 5, select: { id: true, fullName: true, carNumber: true } });
  console.log(`found ${drivers.length} drivers with a plate`);
  for (const d of drivers) {
    const ex = await getDriverPanelExtras(d.id).catch((e) => ({ error: String(e) }));
    console.log(`  [${d.carNumber}] ${d.fullName}:`, JSON.stringify(ex));
  }

  await prisma.$disconnect();
}
main();
