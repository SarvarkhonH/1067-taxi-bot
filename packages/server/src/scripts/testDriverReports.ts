// Bosqich 4: driver reports (/safarlarim + /daromad) aggregation. Read-only — no money path. Runs
// against mock kas + real Postgres. Proves: not-logged-in is refused, rides/earnings aggregate
// correctly, the type-split (booking vs debt) sums right, and the cache returns stable data.
//
// Run: DRIVER_KEY_AES=<hex> KAS_MODE=mock pnpm tsx src/scripts/testDriverReports.ts
import "../env";
import { prisma } from "../db";
import { saveDriverSession } from "../services/driverAuth";
import { getDriverRidesToday, getDriverEarningsToday, __clearDriverReportCache } from "../services/driverReportService";

const TAG = "drvrep-test";
let failed = 0;
const ok = (c: boolean, l: string): void => { console.log(`${c ? "✅" : "❌"} ${l}`); if (!c) failed++; };

async function cleanup(): Promise<void> {
  const ids = (await prisma.member.findMany({ where: { kasId: { startsWith: TAG } }, select: { id: true } })).map((m) => m.id);
  if (ids.length) await prisma.driverSession.deleteMany({ where: { memberId: { in: ids } } });
  await prisma.member.deleteMany({ where: { kasId: { startsWith: TAG } } });
}

async function main(): Promise<void> {
  await cleanup();
  __clearDriverReportCache();

  // ── not logged in ─────────────────────────────────────────────────────────
  {
    const m = await prisma.member.create({ data: { type: "driver", kasId: `${TAG}-nologin`, fullName: "No Login", carNumber: "55X001YY" } });
    const r = await getDriverRidesToday(m.id);
    ok(!r.ok && r.reason === "not_logged_in", `rides: no session → refused (reason=${r.reason})`);
    const e = await getDriverEarningsToday(m.id);
    ok(!e.ok && e.reason === "not_logged_in", `earnings: no session → refused`);
  }

  // ── logged-in driver ──────────────────────────────────────────────────────
  const m = await prisma.member.create({ data: { type: "driver", kasId: `${TAG}-main`, fullName: "Report Test", carNumber: "55X002YY" } });
  await saveDriverSession(m.id, "55X002YY", "mock-secret-55X002YY");

  // ── rides today ───────────────────────────────────────────────────────────
  {
    const r = await getDriverRidesToday(m.id);
    ok(r.ok, `rides ok`);
    ok(r.count === 2, `rides: 2 mock rides (got ${r.count})`);
    ok(r.totalFare === 23000, `rides: total fare 14000+9000=23000 (got ${r.totalFare})`);
    ok(r.rides?.[0]?.addressName === "Koson bozori", `rides: first addr "${r.rides?.[0]?.addressName}"`);
  }

  // ── earnings today ────────────────────────────────────────────────────────
  {
    const e = await getDriverEarningsToday(m.id);
    ok(e.ok, `earnings ok`);
    ok(e.earnedToday === 14000, `earnings: booking-type sum 14000 (got ${e.earnedToday})`);
    ok(e.debtPaidToday === 5000, `earnings: debt-type sum 5000 (got ${e.debtPaidToday})`);
    ok(e.latestBalance === 32200, `earnings: latest balance = newest row's newBalance 32200 (got ${e.latestBalance})`);
    ok(e.latestDebt === 45000, `earnings: latest debt from row[0] (got ${e.latestDebt})`);
  }

  // ── cache returns stable data (no second fetch within TTL) ──────────────────
  {
    const a = await getDriverRidesToday(m.id);
    const b = await getDriverRidesToday(m.id);
    ok(a.totalFare === b.totalFare && a.count === b.count, `cache: repeat call stable (${a.totalFare})`);
  }

  await cleanup();
  await prisma.$disconnect();
  console.log(failed ? `\n❌ ${failed} FAIL` : "\n✅ DRIVER-REPORTS: /safarlarim + /daromad agregatsiya to'g'ri (read-only)");
  process.exit(failed ? 1 : 0);
}
main();
