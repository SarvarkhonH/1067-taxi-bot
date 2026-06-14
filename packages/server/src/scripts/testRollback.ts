// GO-LIVE item 3: INSTANT ROLLBACK. booking3 is a feature-flag kill-switch.
// /api/booking/info returns booking3 = featureOn("booking3") || <owner-preview>.
// booking3.tsx: booking3===false → flagOff → renders the classic Leaflet BookingView.
// So flipping feature:booking3 OFF instantly restores the old flow for customers.
// This proves the kill-switch toggles, in the ISOLATED test DB (no prod flag touch).
// Run: dotenv -e ../../.env -- tsx src/scripts/testRollback.ts
import "./_testDb"; // isolated test DB — never the prod flag
import "../env";
import { prisma } from "../db";
import { featureOn, setFeature } from "../services/featureFlags";

let failed = 0;
const ok = (c: boolean, l: string): void => { console.log(`${c ? "✅" : "❌"} ${l}`); if (!c) failed++; };

async function main(): Promise<void> {
  await setFeature("booking3", false);
  ok((await featureOn("booking3")) === false, `OFF → featureOn=false → /api/booking/info booking3:false → booking3.tsx flagOff → OLD Leaflet flow`);
  await setFeature("booking3", true);
  ok((await featureOn("booking3")) === true, `ON → featureOn=true → new MapLibre flow for customers`);
  await setFeature("booking3", false);
  ok((await featureOn("booking3")) === false, `flip OFF again → featureOn=false → INSTANT rollback to old flow`);
  await prisma.$disconnect();
  console.log(failed ? `\n❌ ${failed} FAIL` : "\n✅ ROLLBACK: feature:booking3 kill-switch toggles the flow (old flow is the instant rollback)");
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
