// READ-ONLY: dump effective state of the flags that gate UY rail/hub sections, plus the
// EXPECTED_ON reconcile report (owner-accepted features that should be ON but currently aren't).
import "../env";
import { prisma } from "../db";
import { listFeatures, reconcileFlags } from "../services/featureFlags";

async function main(): Promise<void> {
  const list = await listFeatures();
  const wanted = ["xizmatlar", "elonlar", "restoran", "shop", "intercity", "newhome", "newprofile", "homeadmin"];
  console.log("=== flag states ===");
  for (const f of list) if (wanted.includes(f.name)) console.log(f.name.padEnd(12), f.on ? "ON" : "OFF");
  const rec = await reconcileFlags();
  console.log("\n=== reconcile: EXPECTED_ON but currently OFF ===");
  console.log(rec.missing.length ? rec.missing : "(none — all expected flags are ON)");
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
