// P2P transfer safety suite: ledger invariant (incl. under concurrency),
// two-sided caps, counterparty fan-out, ring guard, burn, tips.
// Run: dotenv -e ../../.env -- tsx src/scripts/testTransfer.ts
import { TRANSFER_DAILY_SENT } from "@t1067/shared";
import "../env";
import { prisma } from "../db";
import { grantCoins } from "../services/coinService";
import { getDriverEarnings, transfer } from "../services/transferService";

const TAG = "xfer-test";
let failed = 0;
function ok(cond: boolean, label: string): void {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) failed++;
}

async function mkMember(suffix: string, phone: string, opts: { type?: string; coins?: number; agedTg?: boolean; fresh?: boolean } = {}): Promise<number> {
  const m = await prisma.member.create({
    // the anti-sybil gate reads ACCOUNT age (member.createdAt) — backdate so normal senders are
    // "established"; opts.fresh keeps createdAt=now to exercise the gate. trips:5 clears the paid-out
    // ride-gate (MIN_RIDES_FOR_PAID=3) so these senders can transfer at all (see testPaidRideGate.ts
    // for the gate itself). NOTE: this suite is otherwise STALE since the 2026-06-29 P2P loosening
    // (asserts the removed 48h age gate / 30k caps / burn=20) — it needs a separate rewrite.
    data: { type: opts.type ?? "client", kasId: `${TAG}-${suffix}`, fullName: `Xfer ${suffix}`, phone, trips: 5, createdAt: opts.fresh ? new Date() : new Date(Date.now() - 72 * 3600 * 1000) },
  });
  if (opts.coins) await grantCoins(m.id, opts.coins, "manual", "test seed");
  if (opts.agedTg !== false) {
    await prisma.telegramUser.create({
      data: { id: `${TAG}-tg-${suffix}`, memberId: m.id, linkedAt: new Date(Date.now() - 72 * 3600 * 1000) },
    });
  }
  return m.id;
}

async function invariant(memberId: number): Promise<boolean> {
  const m = await prisma.member.findUnique({ where: { id: memberId }, select: { coins: true } });
  const sum = await prisma.coinTxn.aggregate({ where: { memberId }, _sum: { amount: true } });
  return Math.abs((m?.coins ?? 0) - (sum._sum.amount ?? 0)) < 0.001;
}

async function cleanup(): Promise<void> {
  const members = await prisma.member.findMany({ where: { kasId: { startsWith: TAG } }, select: { id: true } });
  const ids = members.map((m) => m.id);
  await prisma.transfer.deleteMany({ where: { OR: [{ fromMemberId: { in: ids } }, { toMemberId: { in: ids } }] } });
  await prisma.telegramUser.deleteMany({ where: { id: { startsWith: `${TAG}-tg` } } });
  await prisma.member.deleteMany({ where: { id: { in: ids } } });
}

async function main(): Promise<void> {
  await cleanup();

  const A = await mkMember("A", "+998900001001", { coins: 50000 });
  const B = await mkMember("B", "+998900001002", { coins: 5000 });
  const D = await mkMember("D", "+998900001003", { type: "driver", coins: 0 });

  // happy path + burn + paired ledger rows
  let r = await transfer(A, "+998900001002", 1000);
  ok(r.ok && r.received === 980 && r.burn === 20, `transfer 1000 → recipient gets 980, burn 20 (${r.received}/${r.burn})`);
  ok((await invariant(A)) && (await invariant(B)), `ledger invariant holds for both sides`);
  const pair = await prisma.coinTxn.findMany({ where: { kind: { in: ["transfer_out", "transfer_in"] }, memberId: { in: [A, B] } } });
  ok(pair.length === 2 && pair.reduce((s, t) => s + t.amount, 0) === -20, `paired txns sum to -burn (${pair.reduce((s, t) => s + t.amount, 0)})`);

  // guards
  r = await transfer(A, "+998900001002", 100);
  ok(!r.ok && r.reason === "below_min", `below min blocked`);
  r = await transfer(A, "+998900001002", 25000);
  ok(!r.ok && r.reason === "over_max", `over per-tx max blocked`);
  r = await transfer(A, "+998900001001", 1000);
  ok(!r.ok && r.reason === "self", `self-transfer blocked`);
  r = await transfer(B, "+998900009999", 1000);
  ok(!r.ok && r.reason === "not_found", `unknown phone blocked`);

  // fresh account can't send
  const F = await mkMember("F", "+998900001004", { coins: 5000, agedTg: false, fresh: true });
  await prisma.telegramUser.create({ data: { id: `${TAG}-tg-F`, memberId: F, linkedAt: new Date() } });
  r = await transfer(F, "+998900001002", 1000);
  ok(!r.ok && r.reason === "account_too_new", `fresh account blocked (48h gate)`);

  // ring: B got coins from A, now B sends back to A → blocked
  r = await transfer(B, "+998900001001", 500);
  ok(!r.ok && r.reason === "ring", `A→B→A ring blocked`);

  // counterparty fan-out: 5 distinct recipients max per day (B is already #1)
  const extra: number[] = [];
  for (let i = 0; i < 5; i++) extra.push(await mkMember(`R${i}`, `+99890000110${i}`, {}));
  for (let i = 0; i < 4; i++) {
    r = await transfer(A, `+99890000110${i}`, 500);
    ok(r.ok, `fan-out send #${i + 2} ok`);
  }
  r = await transfer(A, "+998900001104", 500);
  ok(!r.ok && r.reason === "too_many_recipients", `6th distinct recipient blocked`);

  // daily sent cap (A sent 3000 so far): 20000 ok → next pushes past 30000 → blocked
  r = await transfer(A, "+998900001100", 20000);
  ok(r.ok, `large send under daily cap ok`);
  r = await transfer(A, "+998900001100", 8000);
  ok(!r.ok && r.reason === "daily_sent_cap", `daily sent cap (30k) enforced`);

  // daily received cap: mule M gets 20000 + 10000 = 30000, then any more is blocked
  const M = await mkMember("M", "+998900001005", {});
  const C1 = await mkMember("C1", "+998900001006", { coins: 30000 });
  const C2 = await mkMember("C2", "+998900001007", { coins: 30000 });
  r = await transfer(C1, "+998900001005", 20000);
  ok(r.ok, `mule funding 1 ok`);
  r = await transfer(C2, "+998900001005", 10000);
  ok(r.ok, `mule funding 2 ok (at 30k)`);
  r = await transfer(C2, "+998900001005", 500);
  ok(!r.ok && r.reason === "daily_received_cap", `daily RECEIVED cap caps the funnel target`);

  // tip to driver by memberId (kind=tip), shows up in driver earnings
  r = await transfer(B, "", 1000, { kind: "tip", toMemberId: D });
  ok(r.ok && r.received === 980, `tip 1000 → driver +980`);
  const e = await getDriverEarnings(D);
  ok(e.todayIn === 980 && e.totalIn === 980, `driver earnings view (today ${e.todayIn})`);
  ok(await invariant(D), `driver ledger invariant holds`);

  // concurrency: 20 parallel sends of 500 from a 5000-coin account to a FRESH
  // recipient → at most 10 can succeed (balance), balance never negative
  const P = await mkMember("P", "+998900001008", { coins: 5000 });
  const Q = await mkMember("Q", "+998900001009", {});
  const results = await Promise.all(Array.from({ length: 20 }, () => transfer(P, "+998900001009", 500).catch(() => ({ ok: false }) as { ok: boolean })));
  const okCount = results.filter((x) => x.ok).length;
  const pAfter = await prisma.member.findUnique({ where: { id: P }, select: { coins: true } });
  ok(okCount > 0 && okCount <= 10 && (pAfter?.coins ?? -1) === 5000 - okCount * 500, `concurrency: ${okCount}/20 succeeded, balance ${pAfter?.coins} (never negative)`);
  ok((await invariant(P)) && (await invariant(Q)), `ledger invariant holds after concurrent sends`);

  // total supply check: coins only moved or burned, never minted
  const all = await prisma.member.findMany({ where: { kasId: { startsWith: TAG } }, select: { coins: true } });
  const totalCoins = all.reduce((s, m) => s + m.coins, 0);
  const seeded = 50000 + 5000 + 5000 + 30000 + 30000 + 5000;
  ok(totalCoins < seeded, `supply shrank by burns (${seeded} → ${totalCoins})`);

  // CONCURRENCY — daily SENT cap can't be raced (the one money path flagged as inspection-only).
  // Seed S to 22000 sent today, then fire 5 concurrent 5000-sends: each individually passes
  // (22000+5000 ≤ 30000) but two together hit 32000 > 30000. Without the per-sender lock several
  // slip past the read-then-check; with it, exactly ONE succeeds and the cap holds.
  const S = await mkMember("S", "+998900001010", { coins: 100000 });
  await mkMember("Rr", "+998900001011", {});
  const dummy = await mkMember("dummy", "+998900001012", {});
  await prisma.transfer.create({ data: { fromMemberId: S, toMemberId: dummy, amount: 22000, burn: 440, kind: "transfer" } });
  const capRes = await Promise.all(
    Array.from({ length: 5 }, () => transfer(S, "+998900001011", 5000).catch(() => ({ ok: false }) as { ok: boolean })),
  );
  const capOk = capRes.filter((x) => x.ok).length;
  const sentAgg = await prisma.transfer.aggregate({
    where: { fromMemberId: S, createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } },
    _sum: { amount: true },
  });
  ok(capOk === 1, `daily-sent-cap race: exactly 1/5 concurrent sends passed (got ${capOk})`);
  ok((sentAgg._sum.amount ?? 0) <= TRANSFER_DAILY_SENT, `daily-sent total ≤ cap under concurrency (${sentAgg._sum.amount} ≤ ${TRANSFER_DAILY_SENT})`);
  ok(await invariant(S), `sender ledger invariant holds after cap-race`);

  await cleanup();
  await prisma.$disconnect();
  console.log(failed === 0 ? "\n🎉 all transfer checks passed" : `\n❌ ${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
