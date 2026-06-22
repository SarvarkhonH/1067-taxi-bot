// Driver reports (no-login): getDriverRidesToday + getDriverEarningsToday now use the member's
// already-linked plate + the ADMIN kas client (getRidesByCar, getDriverAccount) — NO /driver_login.
// Runs against mock kas + real Postgres. Proves: a non-driver member is refused, a linked driver's
// rides/earnings aggregate from the admin mock, and the cache returns stable data.
//
// Run: KAS_MODE=mock pnpm tsx src/scripts/testDriverReports.ts
import "../env";
import { prisma } from "../db";
import { getDriverRidesToday, getDriverEarningsToday, __clearDriverReportCache } from "../services/driverReportService";

const TAG = "drvrep-test";
let failed = 0;
const ok = (c: boolean, l: string): void => { console.log(`${c ? "✅" : "❌"} ${l}`); if (!c) failed++; };

async function cleanup(): Promise<void> {
  await prisma.member.deleteMany({ where: { kasId: { startsWith: TAG } } });
}

async function main(): Promise<void> {
  await cleanup();
  __clearDriverReportCache();

  // ── non-driver member → refused ─────────────────────────────────────────────
  {
    const m = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-client`, fullName: "Not Driver", phone: "+998900099001" } });
    const r = await getDriverRidesToday(m.id);
    ok(!r.ok && r.reason === "not_driver", `client member → refused (reason=${r.reason})`);
    const e = await getDriverEarningsToday(m.id);
    ok(!e.ok && e.reason === "not_driver", `client member earnings → refused`);
  }

  // ── driver with no carNumber → refused ──────────────────────────────────────
  {
    const m = await prisma.member.create({ data: { type: "driver", kasId: `${TAG}-nocar`, fullName: "No Car" } });
    const r = await getDriverRidesToday(m.id);
    ok(!r.ok && r.reason === "not_driver", `driver without plate → refused`);
  }

  // ── linked driver (type=driver + carNumber) ─────────────────────────────────
  const m = await prisma.member.create({ data: { type: "driver", kasId: `${TAG}-main`, fullName: "Report Test", carNumber: "55X002YY" } });
  __clearDriverReportCache();

  // ── rides today (admin mock getRidesByCar → 2 rides, today) ─────────────────
  {
    const r = await getDriverRidesToday(m.id);
    ok(r.ok, `rides ok`);
    ok(r.count === 2, `rides: 2 mock rides today (got ${r.count})`);
    ok(r.totalFare === 23000, `rides: total fare 14000+9000=23000 (got ${r.totalFare})`);
  }

  // ── earnings today (rides fare + kas account balance/debt) ──────────────────
  {
    const e = await getDriverEarningsToday(m.id);
    ok(e.ok, `earnings ok`);
    ok(e.earnedToday === 23000, `earnings: today's fare sum 23000 (got ${e.earnedToday})`);
    ok(e.debtPaidToday === 0, `earnings: no debt payments today → 0 (got ${e.debtPaidToday})`);
    ok(e.balance === 18200, `earnings: kas balance from getDriverAccount (got ${e.balance})`);
    ok(e.debt === 45000, `earnings: kas debt from getDriverAccount (got ${e.debt})`);
  }

  // ── cache stable within TTL ─────────────────────────────────────────────────
  {
    const a = await getDriverRidesToday(m.id);
    const b = await getDriverRidesToday(m.id);
    ok(a.totalFare === b.totalFare && a.count === b.count, `cache: repeat call stable (${a.totalFare})`);
  }

  await cleanup();
  await prisma.$disconnect();
  console.log(failed ? `\n❌ ${failed} FAIL` : "\n✅ DRIVER-REPORTS: no-login (member plate + admin kas) agregatsiya to'g'ri");
  process.exit(failed ? 1 : 0);
}
main();
