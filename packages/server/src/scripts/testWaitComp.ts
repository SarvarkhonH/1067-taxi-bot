// 🪙 Wait-compensation (feature "waitcomp") integration test — RUNS ON THE ISOLATED TEST DB
// (TEST_DATABASE_URL), never the app DB: this grants REAL CoinTxn/Member.coins rows for a
// synthetic member, which the "qonga yozilgan saboqlar" money-test rule requires isolating.
// Covers: PASSIVE formula (grace/ramp/ceiling — the game gate is GONE by owner decision),
// idempotency (double-fire grants once), the daily company-budget clamp, and the "topilmadi"
// next-ride voucher (note → redeem-once → expiry). TAG'd throwaway members, cleaned at the end.
//   pnpm --filter @t1067/server exec tsx src/scripts/testWaitComp.ts
import "./_testDb";
import { prisma } from "../db";
import { setFeature, __resetFeatureCache } from "../services/featureFlags";
import { setBonusEcon } from "../services/bonusConfig";
import { awardWaitComp, noteWaitVoucher, redeemWaitVoucher } from "../services/cashbackService";

let pass = 0,
  fail = 0;
function ok(cond: boolean, msg: string): void {
  if (cond) {
    pass++;
    console.log("✅", msg);
  } else {
    fail++;
    console.log("❌", msg);
  }
}

const TAG = "TEST-waitcomp-";

async function makeMember(suffix: string): Promise<number> {
  const m = await prisma.member.create({
    data: { type: "client", kasId: `${TAG}${suffix}`, fullName: `${TAG}${suffix}`, phone: `99${Date.now()}`.slice(0, 12), points: 0, coins: 0 },
  });
  return m.id;
}

async function coinsOf(memberId: number): Promise<number> {
  const m = await prisma.member.findUnique({ where: { id: memberId }, select: { coins: true } });
  return m?.coins ?? 0;
}

async function main(): Promise<void> {
  await setFeature("waitcomp", true);
  // owner-spec defaults (2026-07-02): ~500/min, full at 3 min → 1500
  await setBonusEcon("waitCompGraceSec", 30);
  await setBonusEcon("waitCompFullSec", 180);
  await setBonusEcon("waitCompCeiling", 1500);
  await setBonusEcon("waitCompDailyBudget", 200_000);
  await setBonusEcon("waitVoucherExpiryH", 72);
  __resetFeatureCache();

  // 1) grace period: wait < grace → 0
  {
    const mid = await makeMember("grace");
    const paid = await awardWaitComp(mid, 900001, 10);
    ok(paid === 0, `wait<grace(10s<30s) → 0 tanga (got ${paid})`);
  }

  // 2) mid-ramp: 105s wait (= grace + span/2) → half the ceiling (750). PASSIVE — no score arg.
  {
    const mid = await makeMember("mid");
    const paid = await awardWaitComp(mid, 900003, 105);
    ok(paid === 750, `105s wait → half ceiling = 750 (got ${paid})`);
    const bal = await coinsOf(mid);
    ok(bal === 750, `member.coins credited 750 (got ${bal})`);
  }

  // 3) full ceiling: wait >= full (180s) → exactly the ceiling (1500), never more
  {
    const mid = await makeMember("full");
    const paid = await awardWaitComp(mid, 900004, 999);
    ok(paid === 1500, `wait>=full → clamped to ceiling 1500 (got ${paid})`);
  }

  // 4) idempotency: same (member, bookingId) fired twice → paid only once
  {
    const mid = await makeMember("idempotent");
    const first = await awardWaitComp(mid, 900005, 300);
    const second = await awardWaitComp(mid, 900005, 300); // re-polled sweep, same ride
    ok(first === 1500 && second === 0, `double-fire same ride: first=${first} second=${second} (expect 1500, 0)`);
    const bal = await coinsOf(mid);
    ok(bal === 1500, `member.coins NOT double-credited (got ${bal}, expect 1500)`);
  }

  // 5) flag OFF → always 0
  {
    await setFeature("waitcomp", false);
    __resetFeatureCache();
    const mid = await makeMember("flagoff");
    const paid = await awardWaitComp(mid, 900006, 300);
    ok(paid === 0, `flag OFF → 0 tanga (got ${paid})`);
    await setFeature("waitcomp", true);
    __resetFeatureCache();
  }

  // 6) 🎁 voucher lifecycle: note on failed search → redeem ONCE on next ride → gone
  {
    const mid = await makeMember("voucher");
    const worth = await noteWaitVoucher(mid, 900100, 105); // failed search after 105s
    ok(worth === 750, `failed-search voucher worth = ramp amount 750 (got ${worth})`);
    const dup = await noteWaitVoucher(mid, 900100, 999); // re-polled sweep, same failed booking
    ok(dup === 0, `same failed booking twice → second note is a no-op (got ${dup})`);
    const balBefore = await coinsOf(mid);
    ok(balBefore === 0, `voucher note pays NOTHING immediately (coins=${balBefore}) — farm-safe`);
    const redeemed = await redeemWaitVoucher(mid);
    ok(redeemed === 750, `redeem on next completed ride pays 750 (got ${redeemed})`);
    const again = await redeemWaitVoucher(mid);
    ok(again === 0, `voucher single-use: second redeem → 0 (got ${again})`);
    const bal = await coinsOf(mid);
    ok(bal === 750, `member.coins exactly 750 after the full cycle (got ${bal})`);
  }

  // 7) voucher upgrade: a later, LONGER failed wait replaces a smaller pending voucher (never shrinks)
  {
    const mid = await makeMember("voucher-upgrade");
    const small = await noteWaitVoucher(mid, 900200, 60); // 60s → 300
    const big = await noteWaitVoucher(mid, 900201, 180); // 180s → 1500, different failed booking
    const shrunk = await noteWaitVoucher(mid, 900202, 60); // smaller again → must NOT downgrade
    const redeemed = await redeemWaitVoucher(mid);
    ok(small === 300 && big === 1500 && shrunk === 0 && redeemed === 1500, `upgrade keeps the BIGGEST voucher: ${small}/${big}/${shrunk} → redeem ${redeemed} (expect 300/1500/0 → 1500)`);
  }

  // 8) daily company budget clamp (isolated from earlier spend regardless of run day)
  {
    const dayKey = new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10);
    const spentSoFar = (await prisma.waitCompReward.aggregate({ where: { dayKey }, _sum: { amount: true } }))._sum.amount ?? 0;
    await setBonusEcon("waitCompDailyBudget", spentSoFar + 500);
    __resetFeatureCache();
    const a = await makeMember("budget-a");
    const b = await makeMember("budget-b");
    const paidA = await awardWaitComp(a, 900007, 300); // wants full 1500, only 500 room left
    ok(paidA === 500, `first ride clamped to remaining daily budget 500 (got ${paidA})`);
    const paidB = await awardWaitComp(b, 900008, 300); // budget now exhausted
    ok(paidB === 0, `second ride same day, budget exhausted → 0 (got ${paidB})`);
    await setBonusEcon("waitCompDailyBudget", 200_000); // restore
    __resetFeatureCache();
  }

  // cleanup: throwaway members + their coin txns + wait-comp rows + voucher/marker AppState rows
  const tagged = await prisma.member.findMany({ where: { fullName: { startsWith: TAG } }, select: { id: true } });
  const ids = tagged.map((m) => m.id);
  await prisma.coinTxn.deleteMany({ where: { memberId: { in: ids } } });
  await prisma.waitCompReward.deleteMany({ where: { memberId: { in: ids } } });
  await prisma.appState.deleteMany({ where: { OR: [...ids.map((id) => ({ key: `waitvoucher:${id}` })), { key: { startsWith: "waitvfail:9001" } }, { key: { startsWith: "waitvfail:9002" } }] } });
  await prisma.member.deleteMany({ where: { id: { in: ids } } });
  console.log(`\n[cleanup] removed ${ids.length} throwaway members + their coin/reward/voucher rows`);

  console.log(`\n${fail === 0 ? "ALL GREEN" : "FAILED"} — ${pass} pass, ${fail} fail`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}
main();
