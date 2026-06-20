// 🪙 adminGrantCoins: grant/deduct TANGA to the EXACT account by id. Regression for the Laziz case
// — a person with BOTH a client and a driver account (same phone): a grant to the driver must land
// on the DRIVER, not the same-phone client (the old adminGrant was client-only + by phone). TAG'd + cleanup.
import "../env";
import { prisma } from "../db";
import { adminGrantCoins } from "../services/adminOps";

const TAG = "AGCTEST";
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

async function main(): Promise<void> {
  await cleanup();
  // same phone, two accounts — the Laziz Shoimov case
  const client = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-c`, fullName: "Laziz", phone: "+998900009001", coins: 0 } });
  const driver = await prisma.member.create({ data: { type: "driver", kasId: `${TAG}-d`, fullName: "Laziz", phone: "+998900009001", coins: 0 } });

  // grant TANGA to the DRIVER (by exact id)
  const g = await adminGrantCoins(driver.id, 5000, "test", "admin9999");
  ok(g.ok, `grant +5000 → driver ok (${g.message})`);
  ok((await coinsOf(driver.id)) === 5000, `driver got 5000`);
  ok((await coinsOf(client.id)) === 0, `client UNTOUCHED (the old bug landed here)`);

  // deduct
  ok((await adminGrantCoins(driver.id, -2000, "test", "admin9999")).ok, `deduct -2000 ok`);
  ok((await coinsOf(driver.id)) === 3000, `driver now 3000`);

  // deduct can't go below 0
  await adminGrantCoins(driver.id, -999999, "test", "admin9999");
  ok((await coinsOf(driver.id)) === 0, `deduct clamps to 0`);

  // missing account
  ok(!(await adminGrantCoins(999999999, 100, "x", "a")).ok, `missing account → fail`);

  await cleanup();
  await prisma.$disconnect();
  console.log(failed === 0 ? "\n🎉 admin-grant-coins checks passed" : `\n❌ ${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
