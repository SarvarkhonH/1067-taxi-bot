// Bosqich 3 money-shield: driver debt repayment must be atomic + idempotent + refund-on-failure.
// Runs against the mock kas (getDriverAccount → debt 45000, addDriverPayment → ok) + real Postgres.
// Proves, against synthetic TAG'd rows:
//   - feature flag gates the whole thing (off → no money moves)
//   - happy path: tanga held once, kas write once, DriverDebtPayment=confirmed
//   - double-tap (same nonce): exactly ONE debit, second is a no-op (no double-pay)
//   - insufficient tanga: nothing moves, clean error
//   - kas failure: tanga REFUNDED exactly, row=refunded (the critical safety)
//   - over-debt amount rejected
//
// Run: DRIVER_KEY_AES=<hex> KAS_MODE=mock pnpm tsx src/scripts/testDriverDebt.ts
import "../env";
import { prisma } from "../db";
import { getDataSource } from "../kas";
import { getDriverDebtInfo, payDebtWithCoins } from "../services/driverDebtService";
import { getCoins } from "../services/coinService";
import { setFeature, __resetFeatureCache } from "../services/featureFlags";

const TAG = "drvdebt-test";
let failed = 0;
const ok = (c: boolean, l: string): void => { console.log(`${c ? "✅" : "❌"} ${l}`); if (!c) failed++; };

async function cleanup(): Promise<void> {
  const ids = (await prisma.member.findMany({ where: { kasId: { startsWith: TAG } }, select: { id: true } })).map((m) => m.id);
  if (ids.length) {
    await prisma.driverDebtPayment.deleteMany({ where: { memberId: { in: ids } } }).catch(() => undefined);
    await prisma.coinTxn.deleteMany({ where: { memberId: { in: ids } } });
    await prisma.driverSession.deleteMany({ where: { memberId: { in: ids } } });
  }
  await prisma.member.deleteMany({ where: { kasId: { startsWith: TAG } } });
}

let carSeq = 0;
async function freshDriver(coins: number): Promise<number> {
  // The driver is already linked (type=driver + carNumber) — no session needed; the kas writes are admin-side.
  const car = `99T${String(++carSeq).padStart(3, "0")}ZZ`;
  const m = await prisma.member.create({ data: { type: "driver", kasId: `${TAG}-${Math.random().toString(36).slice(2, 8)}`, fullName: "Debt Test", carNumber: car, coins } });
  return m.id;
}

async function main(): Promise<void> {
  await cleanup();

  // Snapshot the LIVE qarz flag so the test never leaves it flipped (it ships dark until owner
  // pilot — a stray "on" row would take a real money path live). Restored in finally.
  const flagBefore = await prisma.appState.findUnique({ where: { key: "feature:qarz" } });

  try {
    await runTests();
  } finally {
    // restore exactly: delete if there was no row, else write the prior value back
    if (flagBefore) {
      await prisma.appState.upsert({ where: { key: "feature:qarz" }, create: { key: "feature:qarz", value: flagBefore.value }, update: { value: flagBefore.value } });
    } else {
      await prisma.appState.deleteMany({ where: { key: "feature:qarz" } });
    }
    __resetFeatureCache();
    await cleanup();
    await prisma.$disconnect();
  }
  console.log(failed ? `\n❌ ${failed} FAIL` : "\n✅ DRIVER-DEBT: atomik + idempotent + refund — pul-xavfsiz");
  process.exit(failed ? 1 : 0);
}

async function runTests(): Promise<void> {
  // ── feature gate ────────────────────────────────────────────────────────────
  await setFeature("qarz", false);
  __resetFeatureCache();
  {
    const id = await freshDriver(100_000);
    const info = await getDriverDebtInfo(id);
    ok(!info.ok && info.reason === "feature_off", `flag OFF → getDriverDebtInfo refuses (reason=${info.reason})`);
    const r = await payDebtWithCoins(id, 10_000, "n1");
    ok(!r.ok, `flag OFF → payDebtWithCoins refuses`);
    ok((await getCoins(id)) === 100_000, `flag OFF → no tanga moved`);
  }

  await setFeature("qarz", true);
  __resetFeatureCache();

  // ── info card ───────────────────────────────────────────────────────────────
  {
    const id = await freshDriver(100_000);
    const info = await getDriverDebtInfo(id);
    ok(info.ok && info.debt === 45_000, `getDriverDebtInfo: debt 45000 from mock (got ${info.debt})`);
    ok(info.coins === 100_000, `coins surfaced (got ${info.coins})`);
  }

  // ── happy path ────────────────────────────────────────────────────────────────
  {
    const id = await freshDriver(100_000);
    const r = await payDebtWithCoins(id, 45_000, "card1");
    ok(r.ok && r.paid === 45_000, `happy: paid 45000 (ok=${r.ok})`);
    ok((await getCoins(id)) === 55_000, `happy: tanga 100000 → 55000 (got ${await getCoins(id)})`);
    const row = await prisma.driverDebtPayment.findFirst({ where: { memberId: id } });
    ok(row?.status === "confirmed", `happy: DriverDebtPayment.status=confirmed (got ${row?.status})`);
    const debits = await prisma.coinTxn.count({ where: { memberId: id, amount: { lt: 0 } } });
    ok(debits === 1, `happy: exactly 1 debit CoinTxn (got ${debits})`);
  }

  // ── double-tap same nonce → no double pay ────────────────────────────────────
  {
    const id = await freshDriver(100_000);
    const [a, b] = await Promise.all([payDebtWithCoins(id, 20_000, "dup"), payDebtWithCoins(id, 20_000, "dup")]);
    const okCount = [a, b].filter((x) => x.ok).length;
    ok(okCount >= 1, `double-tap: at least one ok`);
    ok((await getCoins(id)) === 80_000, `double-tap: EXACTLY 20000 debited once (got ${100_000 - (await getCoins(id))})`);
    const debits = await prisma.coinTxn.count({ where: { memberId: id, amount: -20_000 } });
    ok(debits === 1, `double-tap: exactly 1 debit row (got ${debits})`);
    const rows = await prisma.driverDebtPayment.count({ where: { memberId: id } });
    ok(rows === 1, `double-tap: 1 payment row (upsert, got ${rows})`);
  }

  // ── insufficient tanga ───────────────────────────────────────────────────────
  {
    const id = await freshDriver(5_000);
    const r = await payDebtWithCoins(id, 45_000, "poor");
    ok(!r.ok, `insufficient: rejected`);
    ok((await getCoins(id)) === 5_000, `insufficient: no tanga moved (got ${await getCoins(id)})`);
  }

  // ── over-debt amount ─────────────────────────────────────────────────────────
  {
    const id = await freshDriver(100_000);
    const r = await payDebtWithCoins(id, 50_000, "over"); // debt is only 45000
    ok(!r.ok, `over-debt: 50000 > 45000 debt → rejected`);
    ok((await getCoins(id)) === 100_000, `over-debt: no tanga moved`);
  }

  // ── kas failure → refund ─────────────────────────────────────────────────────
  {
    const id = await freshDriver(100_000);
    const ds = getDataSource();
    const realPay = ds.addDriverPayment.bind(ds);
    ds.addDriverPayment = async () => ({ ok: false, balance: null, status: 500 }); // force kas failure
    const r = await payDebtWithCoins(id, 30_000, "kasdown");
    ds.addDriverPayment = realPay; // restore
    ok(!r.ok, `kas-fail: returns error`);
    ok((await getCoins(id)) === 100_000, `kas-fail: tanga REFUNDED exactly (got ${await getCoins(id)})`);
    const row = await prisma.driverDebtPayment.findFirst({ where: { memberId: id } });
    ok(row?.status === "refunded", `kas-fail: row=refunded (got ${row?.status})`);
    // net CoinTxn for this member is zero (debit + refund)
    const txns = await prisma.coinTxn.findMany({ where: { memberId: id }, select: { amount: true } });
    const net = txns.reduce((s, t) => s + t.amount, 0);
    ok(net === 0, `kas-fail: net CoinTxn = 0 (debit + refund cancel; got ${net})`);
  }

  // ── kas throw → refund ───────────────────────────────────────────────────────
  {
    const id = await freshDriver(100_000);
    const ds = getDataSource();
    const realPay = ds.addDriverPayment.bind(ds);
    ds.addDriverPayment = async () => { throw new Error("network down"); };
    const r = await payDebtWithCoins(id, 15_000, "kasthrow");
    ds.addDriverPayment = realPay;
    ok(!r.ok, `kas-throw: returns error`);
    ok((await getCoins(id)) === 100_000, `kas-throw: tanga refunded (got ${await getCoins(id)})`);
  }
}
main();
