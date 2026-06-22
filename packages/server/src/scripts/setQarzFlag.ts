// Flip the `qarz` feature flag (driver debt-pay with tanga) ON/OFF on the live DB.
//   on:  dotenv -e ../../.env -- tsx src/scripts/setQarzFlag.ts on
//   off: dotenv -e ../../.env -- tsx src/scripts/setQarzFlag.ts off   (instant rollback)
import "../env";
import { prisma } from "../db";
import { setFeature, featureOn, __resetFeatureCache } from "../services/featureFlags";

async function main(): Promise<void> {
  const arg = (process.argv[2] || "").toLowerCase();
  if (arg !== "on" && arg !== "off") {
    console.log("usage: setQarzFlag.ts <on|off>");
    process.exit(1);
  }
  await setFeature("qarz", arg === "on");
  __resetFeatureCache();
  const now = await featureOn("qarz");
  console.log(`feature:qarz = ${now ? "ON ✅" : "OFF (dark)"}`);
  await prisma.$disconnect();
}
main();
