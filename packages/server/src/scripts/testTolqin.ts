// 🎮 Yashil to'lqin money-safety: tanga-only, ride-scaled HARD daily cap, one-time token,
// idempotent grant. A cheater reporting max score can never exceed the cap.
// Run: dotenv -e ../../.env -- tsx src/scripts/testTolqin.ts
import "../env";
import { prisma } from "../db";
import { getCoins } from "../services/coinService";
import { finishTolqinRun, startTolqinRun } from "../services/tolqinService";

const TAG = "tolqin-test";
let failed = 0;
const ok = (c: boolean, l: string): void => { console.log(`${c ? "✅" : "❌"} ${l}`); if (!c) failed++; };

async function cleanup(): Promise<void> {
  const m = await prisma.member.findMany({ where: { kasId: { startsWith: TAG } }, select: { id: true } });
  const ids = m.map((x) => x.id);
  await prisma.coinTxn.deleteMany({ where: { memberId: { in: ids } } });
  await prisma.rideReward.deleteMany({ where: { memberId: { in: ids } } });
  await prisma.appState.deleteMany({ where: { key: { startsWith: "tolqintok:" } } }); // throwaway run tokens
  await prisma.member.deleteMany({ where: { id: { in: ids } } });
}

async function main(): Promise<void> {
  await cleanup();
  const m = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-A`, fullName: "Tolqin A", phone: "+998900003001", trips: 0 } });
  // 3 real rides this week → dailyCap = 15 + 3*3 = 24
  for (let i = 0; i < 3; i++) await prisma.rideReward.create({ data: { memberId: m.id, bookingId: 900000 + i, tier: "standard", amount: 100 } });

  // single run, absurd score → capped at PER_RUN_MAX (12)
  let r = await startTolqinRun(m.id);
  let res = await finishTolqinRun(m.id, r.token, 999999);
  ok(res.ok && res.granted === 12, `huge score capped at per-run max (granted ${res.granted})`);

  // replay the SAME token → rejected, no double grant
  const before = await getCoins(m.id);
  res = await finishTolqinRun(m.id, r.token, 999999);
  ok(!res.ok && res.reason === "bad_token" && (await getCoins(m.id)) === before, `token is one-time (replay rejected, no double grant)`);

  // keep playing max → total tanga today must NEVER exceed the daily cap (24)
  for (let i = 0; i < 10; i++) {
    const s = await startTolqinRun(m.id);
    await finishTolqinRun(m.id, s.token, 999999);
  }
  const todaySum = await prisma.coinTxn.aggregate({ where: { memberId: m.id, kind: "tolqin" }, _sum: { amount: true } });
  ok((todaySum._sum.amount ?? 0) === 24, `daily cap holds: total tanga today = ${todaySum._sum.amount} (cap 24)`);

  // a run past the cap → 0 granted
  const s = await startTolqinRun(m.id);
  res = await finishTolqinRun(m.id, s.token, 999999);
  ok(res.ok && res.granted === 0 && res.roomLeft === 0, `past cap → 0 granted`);

  // unknown token rejected
  res = await finishTolqinRun(m.id, "deadbeefdeadbeef", 100);
  ok(!res.ok && res.reason === "bad_token", `unknown token rejected`);

  await cleanup();
  await prisma.$disconnect();
  console.log(failed === 0 ? "\n🎮 TOLQIN: tanga-only, daily cap holds, token one-time + idempotent" : `\n❌ ${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
