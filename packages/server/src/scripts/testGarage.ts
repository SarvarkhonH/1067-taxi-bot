// 🚗 Garaj tests: buy=sink, one equipped, ride earn (cap+clamp), service sink,
// overdue half-rate, payback floor. Run: dotenv -e ../../.env -- tsx src/scripts/testGarage.ts
import "../env";
import { GARAGE_CARS, GARAGE_RIDE_CAP_MIN, GARAGE_SERVICE_EVERY } from "@t1067/shared";
import { prisma } from "../db";
import { grantCoins } from "../services/coinService";
import { buyCar, earnForRide, equipCar, getGarage, serviceCar } from "../services/garageService";

const TAG = "garage-test";
let failed = 0;
function ok(cond: boolean, label: string): void {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) failed++;
}

async function cleanup(): Promise<void> {
  const ms = await prisma.member.findMany({ where: { kasId: { startsWith: TAG } }, select: { id: true } });
  await prisma.memberCar.deleteMany({ where: { memberId: { in: ms.map((m) => m.id) } } });
  await prisma.member.deleteMany({ where: { id: { in: ms.map((m) => m.id) } } });
}

async function main(): Promise<void> {
  await cleanup();
  const m = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-1`, fullName: "Garage Tester", phone: "+998900005001", trips: 5 } });
  await grantCoins(m.id, 10000, "manual", "seed");

  // payback floor: every car ≥ 30 rides at the 20-min cap
  for (const c of GARAGE_CARS) {
    const payback = c.price / (c.ratePerMin * GARAGE_RIDE_CAP_MIN);
    ok(payback >= 30, `${c.name} payback ${payback.toFixed(0)} safar ≥ 30`);
  }

  // buy damas → auto-equipped, coins sunk
  let r = await buyCar(m.id, "damas");
  ok(r.ok && r.coins === 9400, `damas bought (sink 600 → ${r.coins})`);
  r = await buyCar(m.id, "damas");
  ok(!r.ok && r.reason === "owned", `double-buy blocked`);
  let g = await getGarage(m.id);
  ok(g.equippedCode === "damas", `first car auto-equipped`);

  // buy matiz, equip it → only one equipped
  await buyCar(m.id, "matiz");
  await equipCar(m.id, "matiz");
  g = await getGarage(m.id);
  ok(g.equippedCode === "matiz" && g.cars.filter((c) => c.equipped).length === 1, `exactly one equipped (matiz)`);

  // ride earn: 10 min × 2/min = 20; 30 min capped at 20 min × 2 = 40
  let e = await earnForRide(m.id, 666001, 10);
  ok(e?.amount === 20, `10-min ride → +20 (matiz 2/min): ${e?.amount}`);
  e = await earnForRide(m.id, 666002, 35);
  ok(e?.amount === 40, `35-min ride capped at 20 min → +40: ${e?.amount}`);

  // idempotent per ride (same booking id → duplicate key, no double pay)
  const before = (await prisma.member.findUnique({ where: { id: m.id } }))!.coins;
  e = await earnForRide(m.id, 666001, 10);
  const after = (await prisma.member.findUnique({ where: { id: m.id } }))!.coins;
  ok(after === before, `re-earn same ride grants nothing (idempotent)`);

  // service flow: force overdue → half rate → service resets
  await prisma.memberCar.updateMany({ where: { memberId: m.id, carCode: "matiz" }, data: { ridesSinceService: GARAGE_SERVICE_EVERY } });
  e = await earnForRide(m.id, 666003, 10);
  ok(e?.amount === 10, `overdue car earns HALF (10 min × 1/min): ${e?.amount}`);
  let sv = await serviceCar(m.id, "matiz");
  ok(sv.ok, `service paid (10% = 150)`);
  sv = await serviceCar(m.id, "matiz");
  ok(!sv.ok && sv.reason === "not_due", `service only when due`);
  e = await earnForRide(m.id, 666004, 10);
  ok(e?.amount === 20, `after service full rate again: ${e?.amount}`);

  // per-ride clamp shared with roll: garage grant key ends :member:booking
  const sum = await prisma.coinTxn.aggregate({
    where: { memberId: m.id, amount: { gt: 0 }, idempotencyKey: { endsWith: `:${m.id}:666002` } },
    _sum: { amount: true },
  });
  ok((sum._sum.amount ?? 0) <= 350, `ride 666002 emission ≤ 350 (clamp shared)`);

  // ledger invariant
  const bal = (await prisma.member.findUnique({ where: { id: m.id } }))!.coins;
  const tx = await prisma.coinTxn.aggregate({ where: { memberId: m.id }, _sum: { amount: true } });
  ok(Math.abs(bal - (tx._sum.amount ?? 0)) < 0.001, `ledger invariant holds`);

  await cleanup();
  await prisma.$disconnect();
  console.log(failed === 0 ? "\n🎉 all garage checks passed" : `\n❌ ${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
