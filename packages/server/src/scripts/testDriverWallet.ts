// 🚗 Driver wallet: a DRIVER can withdraw tanga → kas1067 balance (canWithdraw + ok), but
// CANNOT topup cashback→tanga (client-only). These two were swapped once (the so'm button got
// hidden from drivers) — this is the regression guard. TAG'd rows on the app DB + cleanup.
import "../env";
import { prisma } from "../db";
import { withdraw, getWallet, topUpFromBonus } from "../services/coinService";

const TAG = "DRVWALLET";
let failed = 0;
function ok(c: boolean, l: string): void {
  console.log(`${c ? "✅" : "❌"} ${l}`);
  if (!c) failed++;
}
async function cleanup(): Promise<void> {
  const ms = await prisma.member.findMany({ where: { kasId: { startsWith: TAG } }, select: { id: true } });
  const ids = ms.map((m) => m.id);
  await prisma.withdrawal.deleteMany({ where: { memberId: { in: ids } } });
  await prisma.coinTxn.deleteMany({ where: { memberId: { in: ids } } });
  await prisma.telegramUser.deleteMany({ where: { id: { startsWith: TAG } } });
  await prisma.member.deleteMany({ where: { id: { in: ids } } });
}

async function main(): Promise<void> {
  await cleanup();
  const drv = await prisma.member.create({ data: { type: "driver", kasId: `${TAG}-d`, fullName: "Drv", phone: "+998900007002", coins: 50000, trips: 0 } });
  const client = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-c`, fullName: "Cli", phone: "+998900007003", coins: 50000, trips: 5, points: 9000 } });

  // driver: CAN withdraw (tanga → kas balance), topup is HIDDEN (isClient=false)
  const wd = await getWallet(drv.id);
  ok(wd.canWithdraw === true, `driver canWithdraw=true (got ${wd.canWithdraw})`);
  ok(wd.isClient === false, `driver isClient=false → cashback→tanga hidden (got ${wd.isClient})`);
  const r1 = await withdraw(drv.id, 10000);
  ok(r1.ok && r1.reason !== "not_client", `driver withdraw → ok (ok=${r1.ok} reason=${r1.reason ?? "-"})`);
  const t1 = await topUpFromBonus(drv.id, 5000);
  ok(!t1.ok && t1.reason === "not_client", `driver topup refused — client-only (${t1.reason})`);

  // client: isClient=true → sees cashback→tanga; can also withdraw (has rides)
  const wc = await getWallet(client.id);
  ok(wc.isClient === true, `client isClient=true → cashback→tanga shown`);
  ok(wc.canWithdraw === true, `client canWithdraw=true`);

  await cleanup();
  await prisma.$disconnect();
  console.log(failed === 0 ? "\n🎉 driver-wallet checks passed" : `\n❌ ${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
