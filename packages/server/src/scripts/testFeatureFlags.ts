// Proves the DEFAULT_OFF safety: booking3 (not owner-accepted) is OFF unless an
// explicit "on" row exists — so a missing/cleared kill-switch row can never silently
// take the un-QABUL'd flow live. Other features stay default-ON. Snapshot/restore the
// booking3 row so live state is untouched. Run: tsx src/scripts/testFeatureFlags.ts
import "./_testDb"; // isolated DB — never toggle a live feature flag on the app DB
import "../env";
import { prisma } from "../db";
import { featureOn, setFeature, listFeatures, __resetFeatureCache } from "../services/featureFlags";

let failed = 0;
const ok = (c: boolean, l: string): void => { console.log(`${c ? "✅" : "❌"} ${l}`); if (!c) failed++; };

async function main(): Promise<void> {
  const snap = await prisma.appState.findUnique({ where: { key: "feature:booking3" } });
  try {
    await setFeature("booking3", true);
    __resetFeatureCache();
    ok((await featureOn("booking3")) === true, "booking3 explicit ON row → ON");

    await setFeature("booking3", false);
    __resetFeatureCache();
    ok((await featureOn("booking3")) === false, "booking3 explicit OFF row → OFF");

    // THE FIX: no row at all → OFF (was ON under the old default — silent-live risk)
    await prisma.appState.deleteMany({ where: { key: "feature:booking3" } });
    __resetFeatureCache();
    ok((await featureOn("booking3")) === false, "booking3 NO row → OFF (default-off safety)");

    // a normal feature with no row stays default-ON
    const lf = await listFeatures();
    ok(lf.find((f) => f.name === "garage")?.on !== false, "garage (no DEFAULT_OFF) → still default-ON");
    ok(lf.find((f) => f.name === "booking3")?.on === false, "listFeatures reflects booking3 OFF");
  } finally {
    // restore exact prior state
    if (snap) await prisma.appState.upsert({ where: { key: "feature:booking3" }, create: { key: "feature:booking3", value: snap.value }, update: { value: snap.value } });
    else await prisma.appState.deleteMany({ where: { key: "feature:booking3" } });
    __resetFeatureCache();
    await prisma.$disconnect();
  }
  console.log(failed ? `\n❌ ${failed} FAIL` : "\n🔌 FEATURE-FLAGS: booking3 default-OFF safety holds");
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error("FATAL", e instanceof Error ? e.message : e); process.exit(1); });
