// 🚕 Paid-out ride-gate suite — a CLIENT must ride ≥ MIN_RIDES_FOR_PAID (3) before any tanga LEAVES
// their account (withdraw + P2P transfer/tip/fare). Closes the welcome-funnel: a freshly-linked victim
// (trips 0) can move nothing out. In-app SPENDING stays open. Welcome is given but locked-out until 3
// rides, then everything (welcome included) flows normally. Drivers (vetted kas) are exempt.
// Run: dotenv -e ../../.env -- tsx src/scripts/testPaidRideGate.ts
import { MIN_RIDES_FOR_PAID } from "@t1067/shared";
import "../env";
import { prisma } from "../db";
import { grantCoins, spendCoins, withdraw } from "../services/coinService";
import { transfer } from "../services/transferService";

const TAG = "paidgate-test";
let failed = 0;
function ok(cond: boolean, label: string): void {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) failed++;
}
async function invariant(memberId: number): Promise<boolean> {
  const m = await prisma.member.findUnique({ where: { id: memberId }, select: { coins: true } });
  const sum = await prisma.coinTxn.aggregate({ where: { memberId }, _sum: { amount: true } });
  return Math.abs((m?.coins ?? 0) - (sum._sum.amount ?? 0)) < 0.001;
}
// aged/established member (so the 48h age gate never interferes — only the ride-gate is under test)
async function mkMember(suffix: string, phone: string, opts: { type?: string; trips?: number; coins?: number } = {}): Promise<number> {
  const m = await prisma.member.create({
    data: { type: opts.type ?? "client", kasId: `${TAG}-${suffix}`, fullName: `Paid ${suffix}`, phone, trips: opts.trips ?? 0, createdAt: new Date(Date.now() - 72 * 3600 * 1000) },
  });
  if (opts.coins) await grantCoins(m.id, opts.coins, "manual", "test seed");
  return m.id;
}
async function seedWelcome(memberId: number, amount = 5000): Promise<void> {
  await grantCoins(memberId, amount, "referral", "🎁 Botga xush kelibsiz — sovg'a!", `welcome_join:${memberId}`);
}
async function cleanup(): Promise<void> {
  const members = await prisma.member.findMany({ where: { kasId: { startsWith: TAG } }, select: { id: true } });
  const ids = members.map((m) => m.id);
  await prisma.transfer.deleteMany({ where: { OR: [{ fromMemberId: { in: ids } }, { toMemberId: { in: ids } }] } });
  await prisma.coinTxn.deleteMany({ where: { memberId: { in: ids } } });
  await prisma.member.deleteMany({ where: { id: { in: ids } } });
}

async function main(): Promise<void> {
  ok(MIN_RIDES_FOR_PAID === 3, `MIN_RIDES_FOR_PAID = 3 (${MIN_RIDES_FOR_PAID})`);
  await cleanup();

  const MULE = await mkMember("mule", "+998922220001", { trips: 5 }); // recipient
  const DRVR = await mkMember("drvr", "+998922220002", { type: "driver", trips: 5 }); // tip/fare target

  // ── 1) fresh CLIENT (trips 0) with a welcome: every value-OUT path is closed ─────────────────
  const C0 = await mkMember("C0", "+998922220010", { trips: 0 });
  await seedWelcome(C0); // coins=5000
  let r = await transfer(C0, "+998922220001", 1000);
  ok(!r.ok && r.reason === "locked", `trips 0 → P2P transfer BLOCKED (${r.reason})`);
  r = await transfer(C0, "", 1000, { kind: "tip", toMemberId: DRVR });
  ok(!r.ok && r.reason === "locked", `trips 0 → driver TIP BLOCKED (${r.reason})`);
  r = await transfer(C0, "", 1000, { kind: "fare", toMemberId: DRVR });
  ok(!r.ok && r.reason === "locked", `trips 0 → driver FARE BLOCKED (${r.reason})`);
  const w = await withdraw(C0, 1000); // early return, before any kas write — safe
  ok(!w.ok && w.reason === "no_ride", `trips 0 → WITHDRAW BLOCKED (${w.reason})`);
  // …but SPENDING in-app stays open (shop/market/e'lon) — the sovg'a is usable, just not extractable
  const s = await spendCoins(C0, 1000, "shop", "in-app purchase test");
  ok(s.ok, `trips 0 → in-app SPEND allowed (welcome is spendable, not extractable)`);
  const c0 = await prisma.member.findUnique({ where: { id: C0 }, select: { coins: true } });
  ok((c0?.coins ?? 0) === 4000, `only the in-app spend moved coins (5000→${c0?.coins})`);

  // ── 2) partial rider (trips 2, one short) is still gated ─────────────────────────────────────
  const C2 = await mkMember("C2", "+998922220011", { trips: 2, coins: 5000 });
  r = await transfer(C2, "+998922220001", 1000);
  ok(!r.ok && r.reason === "locked", `trips 2 (< 3) → still BLOCKED (${r.reason})`);

  // ── 3) real rider (trips 3) → everything flows, welcome included ──────────────────────────────
  const C3 = await mkMember("C3", "+998922220012", { trips: 3 });
  await seedWelcome(C3); // welcome 5000, now unlocked at 3 rides
  r = await transfer(C3, "+998922220001", 1000);
  ok(r.ok, `trips 3 → transfer OK, welcome flows normally (${r.reason ?? "ok"})`);
  ok(await invariant(C3), `ledger invariant holds after unlocked send`);

  // ── 4) DRIVER is exempt (vetted kas identity), even at trips 0 ────────────────────────────────
  const DZ = await mkMember("DZ", "+998922220013", { type: "driver", trips: 0, coins: 5000 });
  r = await transfer(DZ, "+998922220001", 1000);
  ok(r.ok, `driver trips 0 → transfer OK (exempt, like the withdraw gate) (${r.reason ?? "ok"})`);

  await cleanup();
  await prisma.$disconnect();
  console.log(failed === 0 ? "\n🎉 all paid-out ride-gate checks passed" : `\n❌ ${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
