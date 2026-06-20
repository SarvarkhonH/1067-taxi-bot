// 🚖 Mini App pay-driver-by-car: findDriverByCar tolerates Cyrillic/Latin lookalikes + spacing,
// paying reuses the closed-loop tip transfer, and the age-gate now trusts ACCOUNT age (not the
// telegram link) with any rider (trips>0) bypassing. TAG'd rows on the app DB + full cleanup.
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
  // established rider: trips>0 → bypasses the age gate regardless of account age
  const cust = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-c`, fullName: "Test Cust", phone: "+998900001111", trips: 5, coins: 50000 } });
  await prisma.telegramUser.create({ data: { id: `${TAG}-tg`, memberId: cust.id, linkedAt: new Date() } }); // linked NOW — must NOT block (trips>0)
  // driver plate has Cyrillic-mappable letters (K, M) to prove the lookalike fix
  const drv = await prisma.member.create({ data: { type: "driver", kasId: `${TAG}-d`, fullName: "Aziz Karimov", carNumber: "88K888MM", phone: "+998900002222", coins: 0 } });
  await prisma.telegramUser.create({ data: { id: `${TAG}-tg2`, memberId: drv.id, linkedAt: new Date() } });

  // 1. lookup — Latin normalized, Cyrillic lookalikes, miss, too-short
  ok((await findDriverByCar("88k 888 mm"))?.id === drv.id, `findDriverByCar("88k 888 mm") Latin → ok`);
  ok((await findDriverByCar("88К888ММ"))?.id === drv.id, `findDriverByCar("88К888ММ") CYRILLIC → ok`);
  ok((await findDriverByCar("NOPEZZ")) === null, `nonexistent plate → null`);
  ok((await findDriverByCar("ab")) === null, `too-short plate → null`);

  // 2. pay the driver — exact path /api/wallet/pay-driver runs (tip). Sender linked NOW but trips>0 → allowed.
  const r = await transfer(cust.id, "", 5000, { kind: "tip", toMemberId: drv.id });
  ok(r.ok, `pay-driver ok despite fresh link (trips>0 bypass) — sent=${r.amount} received=${r.received}`);
  const drv2 = await prisma.member.findUnique({ where: { id: drv.id }, select: { coins: true } });
  ok(drv2?.coins === r.received, `driver credited net ${r.received} (coins=${drv2?.coins})`);

  // 3. self-pay refused (use the established customer so it clears the age gate → reaches self-check)
  const self = await transfer(cust.id, "", 5000, { kind: "tip", toMemberId: cust.id });
  ok(!self.ok && self.reason === "self", `self-pay refused (${self.reason})`);

  // 4. age gate: a genuinely fresh account (trips=0, created now) IS blocked
  const fresh = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-f`, fullName: "Fresh", phone: "+998900003333", trips: 0, coins: 50000 } });
  await prisma.telegramUser.create({ data: { id: `${TAG}-tg3`, memberId: fresh.id, linkedAt: new Date() } });
  const fr = await transfer(fresh.id, "", 5000, { kind: "tip", toMemberId: drv.id });
  ok(!fr.ok && fr.reason === "account_too_new", `fresh zero-ride account blocked (${fr.reason})`);

  await cleanup();
  await prisma.$disconnect();
  console.log(failed === 0 ? "\n🎉 pay-driver checks passed" : `\n❌ ${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
