// QA P0-money: per-member WITHDRAW daily-cap race (real money out). Two concurrent
// withdrawals from the SAME member both read withdrawnToday=0, both pass the 50000/day
// cap, both create kasApplied rows → member cashes out 2× the cap. The global budget is
// inflated (WITHDRAW_BASE_BUDGET huge) so it isn't the limiter — we test ONLY the per-member cap.
// Run: KAS_MODE=mock WITHDRAW_BASE_BUDGET=100000000 dotenv -e ../../.env -- tsx src/scripts/testWithdrawRace.ts
import "../env";
import { prisma } from "../db";
import { withdraw } from "../services/coinService";
import { consumeWithdrawBudget, getWithdrawBudget, releaseWithdrawBudget } from "../services/economyService";
import { WITHDRAW_DAILY_CAP } from "@t1067/shared";

const TAG = "wdrace-test";
let failed = 0;
const ok = (c: boolean, l: string): void => { console.log(`${c ? "✅" : "❌"} ${l}`); if (!c) failed++; };

async function cleanup(): Promise<void> {
  const ms = await prisma.member.findMany({ where: { kasId: { startsWith: TAG } }, select: { id: true } });
  const ids = ms.map((m) => m.id);
  await prisma.withdrawal.deleteMany({ where: { memberId: { in: ids } } });
  await prisma.coinTxn.deleteMany({ where: { memberId: { in: ids } } });
  await prisma.member.deleteMany({ where: { id: { in: ids } } });
}

async function main(): Promise<void> {
  await cleanup();
  // snapshot the global budget used-key (test inflates BASE so global isn't the limiter,
  // but the used-key still increments — restore it exactly so prod budget is untouched)
  const day = new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10);
  const budgetKey = `wbudget_used:${day}`;
  const snap = await prisma.appState.findUnique({ where: { key: budgetKey } });
  try {
    const m = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-m`, fullName: "WdRace", phone: "+998900033001", trips: 5, coins: WITHDRAW_DAILY_CAP * 3 } });
    const [r1, r2] = await Promise.all([withdraw(m.id, WITHDRAW_DAILY_CAP), withdraw(m.id, WITHDRAW_DAILY_CAP)]);
    const succeeded = await prisma.withdrawal.count({ where: { memberId: m.id, kasApplied: true } });
    const total = (await prisma.withdrawal.aggregate({ where: { memberId: m.id, kasApplied: true }, _sum: { amount: true } }))._sum.amount ?? 0;
    const okCount = [r1, r2].filter((r) => r.ok).length;
    ok(succeeded === 1, `withdraw race → EXACTLY 1 kasApplied withdrawal (got ${succeeded})`);
    ok(total <= WITHDRAW_DAILY_CAP, `withdraw race → total real-money-out ≤ ${WITHDRAW_DAILY_CAP}/day cap (got ${total})`);
    ok(okCount === 1, `withdraw race → exactly 1 ok response, other → daily_cap (got ${okCount} ok)`);
    const loserReasons = [r1, r2].filter((r) => !r.ok).map((r) => r.reason);
    ok(loserReasons.includes("daily_cap"), `withdraw race → loser rejected specifically with daily_cap (got ${loserReasons.join(",") || "none"})`);

    // ── GLOBAL budget (consumeWithdrawBudget): 2 concurrent consumes each 60% of total →
    //    combined 120% > total → at most one fits, used never exceeds total (no overshoot).
    await prisma.appState.deleteMany({ where: { key: budgetKey } }); // clean used → 0
    const { total: budgetTotal } = await getWithdrawBudget();
    const chunk = Math.floor(budgetTotal * 0.6);
    const [c1, c2] = await Promise.all([consumeWithdrawBudget(chunk), consumeWithdrawBudget(chunk)]);
    const passed = [c1, c2].filter(Boolean).length;
    const used = (await getWithdrawBudget()).used;
    ok(passed === 1, `global budget race → exactly 1 of 2 over-combined consumes fits (got ${passed})`);
    ok(used <= budgetTotal, `global budget race → used ≤ total, NO overshoot (got ${used}/${budgetTotal})`);
    if (c1) await releaseWithdrawBudget(chunk);
    if (c2) await releaseWithdrawBudget(chunk);
  } finally {
    await cleanup();
    if (!snap) await prisma.appState.deleteMany({ where: { key: budgetKey } });
    else await prisma.appState.update({ where: { key: budgetKey }, data: { value: snap.value } });
    await prisma.$disconnect();
  }
  console.log(failed ? `\n❌ ${failed} FAIL` : "\n✅ WITHDRAW-RACE: per-member 50000/day cap holds under concurrency");
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error("FATAL", e instanceof Error ? e.message : e); process.exit(1); });
