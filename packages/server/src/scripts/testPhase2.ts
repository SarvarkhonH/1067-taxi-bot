// Phase 2/6 money-code tests: ride-cashback roll idempotency + tier sanity,
// riskFlag withdraw freeze. Run: dotenv -e ../../.env -- tsx src/scripts/testPhase2.ts
import "../env";
import { prisma } from "../db";
import { grantCoins, withdraw } from "../services/coinService";
import { rollRideCashback } from "../services/cashbackService";

const TAG = "p2-test";
let failed = 0;
function ok(cond: boolean, label: string): void {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) failed++;
}

async function cleanup(): Promise<void> {
  const ms = await prisma.member.findMany({ where: { kasId: { startsWith: TAG } }, select: { id: true } });
  await prisma.rideReward.deleteMany({ where: { memberId: { in: ms.map((m) => m.id) } } });
  await prisma.member.deleteMany({ where: { id: { in: ms.map((m) => m.id) } } });
}

async function main(): Promise<void> {
  await cleanup();
  const m = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-1`, fullName: "P2 Test", phone: "+998900003001", trips: 5 } });

  // one ride → one roll, coins granted, valid tier
  const r1 = await rollRideCashback(m.id, 555001, 500);
  ok(!!r1 && ["standard", "double", "triple", "jackpot"].includes(r1.tier), `roll fired (${r1?.tier} +${r1?.amount})`);
  const bal1 = (await prisma.member.findUnique({ where: { id: m.id } }))!.coins;
  ok(bal1 === (r1?.amount ?? -1), `coins granted exactly once (${bal1})`);

  // same booking re-polled → no double grant
  const r2 = await rollRideCashback(m.id, 555001, 500);
  const bal2 = (await prisma.member.findUnique({ where: { id: m.id } }))!.coins;
  ok(r2 === null && bal2 === bal1, `re-poll grants nothing (idempotent)`);

  // ledger invariant
  const sum = await prisma.coinTxn.aggregate({ where: { memberId: m.id }, _sum: { amount: true } });
  ok(Math.abs(bal2 - (sum._sum.amount ?? 0)) < 0.001, `ledger invariant holds`);

  // tier amounts respect multipliers (standard=base, double=2x, triple=3x; lucky doubles)
  let valid = true;
  for (let i = 0; i < 30; i++) {
    const r = await rollRideCashback(m.id, 555100 + i, 500);
    if (!r) {
      valid = false;
      break;
    }
    if (r.tier === "standard" && ![500, 1000].includes(r.amount)) valid = false;
    if (r.tier === "double" && ![1000, 2000].includes(r.amount)) valid = false;
    if (r.tier === "triple" && ![1500, 3000].includes(r.amount)) valid = false;
    if (r.tier === "jackpot" && r.amount < 5000) valid = false; // pool floor
  }
  ok(valid, `30 rolls — every tier amount consistent with base×mult(×lucky)`);

  // riskFlag freezes ONLY the withdraw door
  await grantCoins(m.id, 20000, "manual", "seed");
  await prisma.member.update({ where: { id: m.id }, data: { riskFlag: true, riskNote: "test" } });
  const w = await withdraw(m.id, 6000);
  ok(!w.ok && w.reason === "risk_hold", `riskFlag → withdraw blocked (${w.reason})`);
  const { unflagMember } = await import("../services/reconciliation");
  const u = await unflagMember(m.id);
  ok(u.ok, `unflag works`);
  const w2 = await withdraw(m.id, 6000); // fake phone → kas_failed, but GATE passed
  ok(w2.reason === "kas_failed", `after unflag the gate opens (reached kas: ${w2.reason})`);

  await cleanup();
  await prisma.$disconnect();
  console.log(failed === 0 ? "\n🎉 all phase-2/6 checks passed" : `\n❌ ${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
