// 💎 Plus + 👬 Gap + 🏆 fond + 🔌 flags + 🏢 corp tests.
// Run: dotenv -e ../../.env -- tsx src/scripts/testPlusGap.ts
import "../env";
import { prisma } from "../db";
import { grantCoins } from "../services/coinService";
import { subscribePlus, isPlus, PLUS_PRICE } from "../services/plusService";
import { createGap, joinGap, getGapView, settleGapsWeekly, GAP_MAX } from "../services/gapService";
import { fundAddRide, fundTotal, setFeature, featureOn } from "../services/featureFlags";
import { createCorp, addCorpEmployee, adjustCorpBalance, corpReport } from "../services/corpService";

const TAG = "pg-test";
let failed = 0;
function ok(cond: boolean, label: string): void {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) failed++;
}

async function cleanup(): Promise<void> {
  const ms = await prisma.member.findMany({ where: { kasId: { startsWith: TAG } }, select: { id: true } });
  const ids = ms.map((m) => m.id);
  const gaps = await prisma.gap.findMany({ where: { creatorId: { in: ids } } });
  await prisma.gapMember.deleteMany({ where: { OR: [{ memberId: { in: ids } }, { gapId: { in: gaps.map((g) => g.id) } }] } });
  await prisma.gap.deleteMany({ where: { id: { in: gaps.map((g) => g.id) } } });
  await prisma.rideReward.deleteMany({ where: { memberId: { in: ids } } });
  await prisma.appState.deleteMany({ where: { key: { in: ["mashina_fund", "fundride:888001", "fundride:888002"] } } });
  await prisma.appState.deleteMany({ where: { key: { startsWith: "gap_settle:" } } });
  const corps = await prisma.corpAccount.findMany({ where: { name: { startsWith: TAG } } });
  await prisma.corpEmployee.deleteMany({ where: { corpId: { in: corps.map((c) => c.id) } } });
  await prisma.corpAccount.deleteMany({ where: { id: { in: corps.map((c) => c.id) } } });
  await prisma.member.deleteMany({ where: { id: { in: ids } } });
  await setFeature("plus", true);
}

async function main(): Promise<void> {
  await cleanup();
  const mk = (i: number, trips = 5) =>
    prisma.member.create({ data: { type: "client", kasId: `${TAG}-${i}`, fullName: `PG Test${i}`, phone: `+9989000070${String(i).padStart(2, "0")}`, trips } });
  const a = await mk(1);
  const b = await mk(2);
  const c = await mk(3);
  const d = await mk(4);
  const e = await mk(5);
  const fresh = await mk(6, 0); // no rides yet

  // 💎 Plus: trial free, then paid; need_ride gate
  const t1 = await subscribePlus(a.id);
  ok(t1.ok && t1.free === true, `first Plus month is a FREE trial`);
  const t2 = await subscribePlus(a.id);
  ok(!t2.ok && t2.reason === "already_active", `double-subscribe blocked while active`);
  const gate = await subscribePlus(fresh.id);
  ok(!gate.ok && gate.reason === "need_ride", `Plus needs ≥1 ride`);
  // expire a's plus, then paid renewal burns 9990
  await prisma.member.update({ where: { id: a.id }, data: { plusUntil: new Date(Date.now() - 1000) } });
  await grantCoins(a.id, 20000, "manual", "seed");
  const before = (await prisma.member.findUnique({ where: { id: a.id } }))!.coins;
  const t3 = await subscribePlus(a.id);
  const after = (await prisma.member.findUnique({ where: { id: a.id } }))!.coins;
  ok(t3.ok && !t3.free && before - after === PLUS_PRICE, `renewal burns ${PLUS_PRICE} (sink)`);
  ok(isPlus((await prisma.member.findUnique({ where: { id: a.id } }))!), `isPlus true after renewal`);

  // 👬 Gap: create, join, dup-join, need_ride, full-at-5 creator bonus
  const g1 = await createGap(b.id, "Test Gap");
  ok(g1.ok && !!g1.code, `gap created with code`);
  const j1 = await joinGap(c.id, g1.code!);
  ok(j1.ok, `friend joined by code`);
  const jDup = await joinGap(c.id, g1.code!);
  ok(!jDup.ok && jDup.reason === "already_in_gap", `double-join blocked`);
  const jGate = await joinGap(fresh.id, g1.code!);
  ok(!jGate.ok && jGate.reason === "need_ride", `join needs ≥1 ride`);
  const bBefore = (await prisma.member.findUnique({ where: { id: b.id } }))!.coins;
  await joinGap(d.id, g1.code!);
  await joinGap(e.id, g1.code!);
  await joinGap(a.id, g1.code!); // 5th joiner? b,c,d,e,a = 5 members → creator bonus fired at 5th
  const bAfter = (await prisma.member.findUnique({ where: { id: b.id } }))!.coins;
  ok(bAfter - bBefore === 1000, `creator +1000 when gap reaches 5 (got ${bAfter - bBefore})`);
  const full = await joinGap(fresh.id, g1.code!);
  ok(!full.ok, `7th member rejected (max ${GAP_MAX}; fresh also lacks rides)`);

  // weekly settle: seed LAST week rides ≥ goal (5 members → goal 8),
  // placed just after last Monday 00:00 Tashkent so they land in the window
  const tash = new Date(Date.now() + 5 * 3600_000);
  const dow = (tash.getUTCDay() + 6) % 7;
  const thisMon = new Date(Date.UTC(tash.getUTCFullYear(), tash.getUTCMonth(), tash.getUTCDate() - dow) - 5 * 3600_000);
  const ids5 = [a.id, b.id, c.id, d.id, e.id];
  for (let i = 0; i < 8; i++) {
    await prisma.rideReward.create({
      data: { memberId: ids5[i % 5]!, bookingId: 888200 + i, tier: "standard", amount: 100, createdAt: new Date(thisMon.getTime() - 7 * 86_400_000 + (i + 1) * 3600_000) },
    });
  }
  const balsBefore = await Promise.all(ids5.map(async (id) => (await prisma.member.findUnique({ where: { id } }))!.coins));
  const fakeBot = { api: { sendMessage: async () => null } } as never;
  await settleGapsWeekly(fakeBot);
  await settleGapsWeekly(fakeBot); // idempotent re-run
  const balsAfter = await Promise.all(ids5.map(async (id) => (await prisma.member.findUnique({ where: { id } }))!.coins));
  const gains = balsAfter.map((v, i) => v - balsBefore[i]!);
  const each500 = gains.filter((g) => g === 500).length;
  const pot2500 = gains.filter((g) => g === 2500).length;
  ok(each500 === 4 && pot2500 === 1, `settle: 4×(+500) + 1×(+2500 incl pot), idempotent (gains: ${gains.join(",")})`);

  // 🏆 fund: +100 per ride, idempotent per booking
  await fundAddRide(888001);
  await fundAddRide(888001);
  await fundAddRide(888002);
  ok((await fundTotal()) === 200, `mashina fund = 200 after 2 unique rides (dup ignored)`);

  // 🔌 kill-switch
  await setFeature("plus", false);
  ok(!(await featureOn("plus")), `feature plus switched OFF`);
  await setFeature("plus", true);
  ok(await featureOn("plus"), `feature plus back ON`);

  // 🏢 corp: create, employees, balance, report counts this-month rides
  const corp = await createCorp(`${TAG} Restoran`, 30);
  const ae = await addCorpEmployee(corp.id, "+998900007003"); // = member c's phone
  ok(ae.ok, `employee whitelisted by phone`);
  const dup = await addCorpEmployee(corp.id, "900007003");
  ok(!dup.ok && dup.reason === "already", `duplicate employee phone blocked`);
  await adjustCorpBalance(corp.id, 500000);
  await prisma.rideReward.create({ data: { memberId: c.id, bookingId: 888300, tier: "standard", amount: 100 } });
  const rep = await corpReport(corp.id);
  ok(rep!.corp.balance === 500000 && rep!.rows.length === 1 && rep!.rows[0]!.rides >= 1, `corp report: balance 500k, employee rides ≥1 (got ${rep!.rows[0]!.rides})`);

  // ledger invariants
  for (const id of [a.id, b.id, c.id]) {
    const bal = (await prisma.member.findUnique({ where: { id } }))!.coins;
    const sum = await prisma.coinTxn.aggregate({ where: { memberId: id }, _sum: { amount: true } });
    ok(Math.abs(bal - (sum._sum.amount ?? 0)) < 0.001, `ledger invariant (member ${id})`);
  }

  await cleanup();
  await prisma.$disconnect();
  console.log(failed === 0 ? "\n🎉 all plus/gap/fund/corp checks passed" : `\n❌ ${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
