// Bosqich B (perf audit) — the money-correctness of the indexed clamp (B4). Runs on TEST_DATABASE_URL.
// The ≤350/ride clamp must behave IDENTICALLY after moving from an endsWith suffix scan to the indexed
// bookingId column: same sum, same cap, and STILL count legacy rows that only have the suffix key
// (bookingId=null) via the OR fallback — otherwise a mid-deploy ride could re-emit over the cap.
import "./_testDb";

const TAG = "AUDITB";

function ok(cond: boolean, label: string): void {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) process.exitCode = 1;
}

async function main(): Promise<void> {
  const { prisma } = await import("../db");
  const { grantRideCoins, getCoins } = await import("../services/coinService");
  const { RIDE_EMISSION_CAP } = await import("@t1067/shared");

  const cleanup = async (): Promise<void> => {
    const members = await prisma.member.findMany({ where: { kasId: { startsWith: TAG } } });
    const ids = members.map((m) => m.id);
    await prisma.coinTxn.deleteMany({ where: { memberId: { in: ids } } });
    await prisma.member.deleteMany({ where: { id: { in: ids } } });
  };
  await cleanup();

  const m = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-A`, fullName: "Clamp B", phone: null, coins: 0 } });
  const BID = 55501;

  // 1) grant stamps bookingId on the row (fast-path source)
  const g1 = await grantRideCoins(m.id, BID, 200, "cashback", "roll", "cb");
  ok(g1.ok, "B4: first ride grant ok (200)");
  const row1 = await prisma.coinTxn.findFirst({ where: { memberId: m.id, bookingId: BID } });
  ok(!!row1 && row1.amount === 200, "B4: grant stamped bookingId on the CoinTxn row");

  // 2) the clamp sums THIS ride via bookingId → a second 200 is cut to reach exactly the cap
  const g2 = await grantRideCoins(m.id, BID, 200, "wheel", "spin", "wh");
  ok(g2.clamped === 50, `B4: second grant clamped by 50 (200→150) to hit the ${RIDE_EMISSION_CAP} cap`);
  const total = await prisma.coinTxn.aggregate({ where: { memberId: m.id, bookingId: BID, amount: { gt: 0 } }, _sum: { amount: true } });
  ok(total._sum.amount === RIDE_EMISSION_CAP, `B4: ride total == ${RIDE_EMISSION_CAP} (clamp holds via indexed bookingId)`);
  ok((await getCoins(m.id)) === RIDE_EMISSION_CAP, "B4: member balance == cap (no over-emit)");

  // 3) a DIFFERENT ride is independent (clamp is per-booking, not per-member)
  const g3 = await grantRideCoins(m.id, BID + 1, 300, "cashback", "roll2", "cb");
  ok(g3.ok && !g3.clamped, "B4: a different bookingId gets its own fresh cap (300 ungated)");

  // 4) LEGACY fallback: a row with bookingId=NULL but the suffix key must STILL count (mid-deploy safety)
  const legacyBid = 55599;
  await prisma.coinTxn.create({
    data: { memberId: m.id, amount: 300, kind: "cashback", reason: "legacy", idempotencyKey: `cb:${m.id}:${legacyBid}`, bookingId: null },
  });
  const g4 = await grantRideCoins(m.id, legacyBid, 200, "wheel", "spin", "wh");
  ok(g4.clamped === 150, "B4: legacy null-bookingId row (suffix key) still counted → new grant clamped to 50");

  await cleanup();
  console.log(process.exitCode ? "\n❌ FAILED" : "\n✅ ALL GREEN");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
