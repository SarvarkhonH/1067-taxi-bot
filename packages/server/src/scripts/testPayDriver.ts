// 🚖 Mini App pay-driver-by-car: findDriverByCar normalizes the plate, and paying reuses the
// same closed-loop tip transfer as the bot. TAG'd rows on the app DB + full cleanup (no sweep).
import "../env";
import { prisma } from "../db";
import { findDriverByCar, transfer } from "../services/transferService";

const TAG = "PAYDRVTEST";
let failed = 0;
function ok(c: boolean, l: string): void {
  console.log(`${c ? "✅" : "❌"} ${l}`);
  if (!c) failed++;
}
async function cleanup(): Promise<void> {
  const ms = await prisma.member.findMany({ where: { kasId: { startsWith: TAG } }, select: { id: true } });
  const ids = ms.map((m) => m.id);
  await prisma.coinTxn.deleteMany({ where: { memberId: { in: ids } } });
  await prisma.transfer.deleteMany({ where: { OR: [{ fromMemberId: { in: ids } }, { toMemberId: { in: ids } }] } });
  await prisma.telegramUser.deleteMany({ where: { id: { startsWith: TAG } } });
  await prisma.member.deleteMany({ where: { id: { in: ids } } });
}

async function main(): Promise<void> {
  await cleanup();
  const cust = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-c`, fullName: "Test Cust", phone: "+998900001111", trips: 5, coins: 50000 } });
  // sender must be an established account (>48h) — link 3 days ago
  await prisma.telegramUser.create({ data: { id: `${TAG}-tg`, memberId: cust.id, linkedAt: new Date(Date.now() - 3 * 24 * 3600 * 1000) } });
  const drv = await prisma.member.create({ data: { type: "driver", kasId: `${TAG}-d`, fullName: "Aziz Karimov", carNumber: "99Z999ZZ", phone: "+998900002222", coins: 0 } });
  await prisma.telegramUser.create({ data: { id: `${TAG}-tg2`, memberId: drv.id, linkedAt: new Date(Date.now() - 3 * 24 * 3600 * 1000) } });

  // 1. lookup by car — normalized (lowercase + spaces stripped), miss → null, too-short → null
  const found = await findDriverByCar("99z 999 zz");
  ok(found?.id === drv.id, `findDriverByCar("99z 999 zz") → ${found?.fullName}`);
  ok((await findDriverByCar("NOPE123")) === null, `nonexistent plate → null`);
  ok((await findDriverByCar("ab")) === null, `too-short plate → null`);

  // 2. pay the driver — exact path the /api/wallet/pay-driver route runs (tip transfer)
  const r = await transfer(cust.id, "", 5000, { kind: "tip", toMemberId: drv.id });
  ok(r.ok, `pay-driver transfer ok (sent=${r.amount} received=${r.received} burn=${r.burn})`);
  const drv2 = await prisma.member.findUnique({ where: { id: drv.id }, select: { coins: true } });
  const cust2 = await prisma.member.findUnique({ where: { id: cust.id }, select: { coins: true } });
  ok(drv2?.coins === r.received, `driver credited net ${r.received} (coins=${drv2?.coins})`);
  ok(cust2?.coins === 50000 - r.amount, `customer debited ${r.amount} (coins=${cust2?.coins})`);

  // 3. can't pay yourself by car
  const self = await transfer(drv.id, "", 5000, { kind: "tip", toMemberId: drv.id });
  ok(!self.ok && self.reason === "self", `self-pay refused (${self.reason})`);

  await cleanup();
  await prisma.$disconnect();
  console.log(failed === 0 ? "\n🎉 pay-driver checks passed" : `\n❌ ${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
