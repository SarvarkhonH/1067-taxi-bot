// Unified /driver panel extras (getDriverPanelExtras), no-login. Proves the kas block aggregates
// from the member's own plate + admin kas, a non-driver/plate-less member is linked:false, and the
// canPayDebt gate respects BOTH the qarz flag AND a positive debt. Snapshot-restores feature:qarz.
//
// Run: KAS_MODE=mock pnpm tsx src/scripts/testDriverPanel.ts
import "../env";
import { prisma } from "../db";
import { getDriverPanelExtras, __clearDriverReportCache } from "../services/driverReportService";
import { setFeature, __resetFeatureCache } from "../services/featureFlags";

const TAG = "drvpanel-test";
let failed = 0;
const ok = (c: boolean, l: string): void => { console.log(`${c ? "✅" : "❌"} ${l}`); if (!c) failed++; };

async function cleanup(): Promise<void> {
  await prisma.member.deleteMany({ where: { kasId: { startsWith: TAG } } });
}

async function main(): Promise<void> {
  await cleanup();
  __clearDriverReportCache();
  const flagBefore = await prisma.appState.findUnique({ where: { key: "feature:qarz" } });

  try {
    // ── not a driver (client) → linked:false ──────────────────────────────────
    {
      const m = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-u`, fullName: "Client", phone: "+998900099002" } });
      const x = await getDriverPanelExtras(m.id);
      ok(!x.linked, `client → linked:false`);
      ok(x.canPayDebt === undefined, `client → no canPayDebt`);
    }

    // ── linked driver, qarz OFF → figures present, canPayDebt false ────────────
    const m = await prisma.member.create({ data: { type: "driver", kasId: `${TAG}-m`, fullName: "Panel Test", carNumber: "44Q002WW" } });

    await setFeature("qarz", false);
    __resetFeatureCache();
    __clearDriverReportCache();
    {
      const x = await getDriverPanelExtras(m.id);
      ok(x.linked, `linked → linked:true`);
      ok(x.balance === 18200, `kas balance surfaced (got ${x.balance})`);
      ok(x.debt === 45000, `kas debt surfaced (got ${x.debt})`);
      ok(x.ridesToday === 2, `rides today (got ${x.ridesToday})`);
      ok(x.fareToday === 23000, `fare today 14000+9000 (got ${x.fareToday})`);
      ok(x.canPayDebt === false, `qarz OFF → canPayDebt false even with debt`);
    }

    // ── qarz ON + debt>0 → canPayDebt true ─────────────────────────────────────
    await setFeature("qarz", true);
    __resetFeatureCache();
    __clearDriverReportCache();
    {
      const x = await getDriverPanelExtras(m.id);
      ok(x.canPayDebt === true, `qarz ON + debt>0 → canPayDebt true`);
    }
  } finally {
    if (flagBefore) await prisma.appState.upsert({ where: { key: "feature:qarz" }, create: { key: "feature:qarz", value: flagBefore.value }, update: { value: flagBefore.value } });
    else await prisma.appState.deleteMany({ where: { key: "feature:qarz" } });
    __resetFeatureCache();
    await cleanup();
    await prisma.$disconnect();
  }
  console.log(failed ? `\n❌ ${failed} FAIL` : "\n✅ DRIVER-PANEL: kas-blok agregatsiya + canPayDebt gate to'g'ri");
  process.exit(failed ? 1 : 0);
}
main();
