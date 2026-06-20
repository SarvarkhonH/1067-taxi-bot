// 💼 adminMoveToBalance: admin moves an account's OWN tanga → their OWN kas balance with NO daily
// cap. Money-safe: atomic deduct (never <0) + audited CoinTxn; on kas-write FAILURE the tanga is
// REFUNDED (audited) so it's never lost. Runs KAS_MODE=mock; the refund path is exercised by
// monkey-patching the cached mock data source to return {ok:false} for one call. TAG'd + cleanup.
import "../env";
import { prisma } from "../db";
import { getDataSource } from "../kas";
import { adminMoveToBalance } from "../services/adminOps";

const TAG = "AMBTEST";
let failed = 0;
function ok(c: boolean, l: string): void {
  console.log(`${c ? "✅" : "❌"} ${l}`);
  if (!c) failed++;
}
async function cleanup(): Promise<void> {
  const ms = await prisma.member.findMany({ where: { kasId: { startsWith: TAG } }, select: { id: true } });
  const ids = ms.map((m) => m.id);
  await prisma.coinTxn.deleteMany({ where: { memberId: { in: ids } } });
  await prisma.member.deleteMany({ where: { id: { in: ids } } });
}
const coinsOf = async (id: number) => (await prisma.member.findUnique({ where: { id }, select: { coins: true } }))?.coins;
const txnSum = async (id: number) => (await prisma.coinTxn.aggregate({ where: { memberId: id }, _sum: { amount: true } }))._sum.amount ?? 0;

async function main(): Promise<void> {
  await cleanup();
  const ds = getDataSource();

  // ── driver: move tanga → driver kas balance (mock addDriverPayment ok) ──
  const driver = await prisma.member.create({ data: { type: "driver", kasId: `${TAG}-d`, fullName: "Haydovchi A", phone: "+998900008001", carNumber: "01A001AA", coins: 10_000 } });
  // spy that addDriverPayment is actually called with the right args (holder object defeats the
  // control-flow narrowing TS applies to a captured `let`)
  const spy: { called: boolean; id: number; car: string; amt: number } = { called: false, id: 0, car: "", amt: 0 };
  const realDrvPay = ds.addDriverPayment.bind(ds);
  ds.addDriverPayment = async (id, car, amt, comment) => {
    spy.called = true;
    spy.id = id;
    spy.car = car;
    spy.amt = amt;
    return realDrvPay(id, car, amt, comment);
  };
  const m1 = await adminMoveToBalance(driver.id, 4000, "admin1234");
  ds.addDriverPayment = realDrvPay; // restore
  ok(m1.ok, `driver move ok (${m1.message})`);
  ok((await coinsOf(driver.id)) === 6000, `driver tanga 10000 → 6000 (decremented)`);
  ok(spy.called && spy.amt === 4000 && spy.car === "01A001AA", `addDriverPayment called with amount 4000 + carNumber (spy=${JSON.stringify(spy)})`);
  // ledger invariant: every coin move is mirrored by a CoinTxn → openingBalance + Σ CoinTxn == coins
  ok(10_000 + (await txnSum(driver.id)) === (await coinsOf(driver.id)), `ledger invariant: 10000 + ΣCoinTxn(−4000) == coins 6000`);

  // ── insufficient tanga → rejected, NO change ──
  const before = await coinsOf(driver.id);
  const beforeTx = await txnSum(driver.id);
  const m2 = await adminMoveToBalance(driver.id, 999_999, "admin1234");
  ok(!m2.ok, `insufficient → rejected (${m2.message})`);
  ok((await coinsOf(driver.id)) === before, `coins UNCHANGED after insufficient (${before})`);
  ok((await txnSum(driver.id)) === beforeTx, `no stray CoinTxn written on insufficient`);

  // ── never below 0: amount exactly at balance works, +1 over fails ──
  const drained = await coinsOf(driver.id);
  const m3 = await adminMoveToBalance(driver.id, (drained ?? 0) + 1, "admin1234");
  ok(!m3.ok, `(balance+1) rejected — never below 0`);
  const m4 = await adminMoveToBalance(driver.id, drained ?? 0, "admin1234");
  ok(m4.ok && (await coinsOf(driver.id)) === 0, `exact-balance move → coins 0 (never negative)`);

  // ── client: refund-on-failure path (force kas addClientBonus to fail) ──
  const client = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-c`, fullName: "Mijoz B", phone: "+998900008002", coins: 5000 } });
  const realBonus = ds.addClientBonus.bind(ds);
  ds.addClientBonus = async () => ({ ok: false, oldBonus: 0, newBonus: 0, status: 500 });
  const m5 = await adminMoveToBalance(client.id, 3000, "admin1234");
  ds.addClientBonus = realBonus; // restore
  ok(!m5.ok, `client kas-fail → rejected (${m5.message})`);
  ok((await coinsOf(client.id)) === 5000, `REFUND: client tanga back to 5000 (deduct −3000 then +3000)`);
  // refund is audited: a −3000 deduct row AND a +3000 refund row → Σ CoinTxn nets to 0
  ok((await txnSum(client.id)) === 0, `REFUND audited: ΣCoinTxn nets to 0 (−3000 + +3000)`);
  ok(5000 + (await txnSum(client.id)) === (await coinsOf(client.id)), `REFUND ledger invariant: 5000 + ΣCoinTxn(0) == coins 5000`);

  // ── client: happy path (mock addClientBonus ok) ──
  const m6 = await adminMoveToBalance(client.id, 2000, "admin1234");
  ok(m6.ok, `client move ok (${m6.message})`);
  ok((await coinsOf(client.id)) === 3000, `client tanga 5000 → 3000`);

  // ── validation: zero / negative / over-max rejected; missing account rejected ──
  ok(!(await adminMoveToBalance(client.id, 0, "a")).ok, `amount 0 rejected`);
  ok(!(await adminMoveToBalance(client.id, -100, "a")).ok, `negative rejected`);
  ok(!(await adminMoveToBalance(client.id, 1_000_001, "a")).ok, `over 1_000_000 rejected`);
  ok(!(await adminMoveToBalance(999_999_999, 100, "a")).ok, `missing account rejected`);

  await cleanup();
  await prisma.$disconnect();
  console.log(failed === 0 ? "\n🎉 admin-move-balance checks passed" : `\n❌ ${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
