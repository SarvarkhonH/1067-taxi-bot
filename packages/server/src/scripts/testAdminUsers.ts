// 👑 admin user-management: search finds all accounts of a phone, re-link moves the Telegram
// link (refuses a member already linked elsewhere), unlink clears it. TAG'd rows + cleanup.
import "../env";
import { prisma } from "../db";
import { adminRelink, adminSearchUsers, adminUnlink, adminWithdrawals } from "../services/adminUsers";

const TAG = "ADMUSR";
const PHONE = "+998900007777";
let failed = 0;
function ok(c: boolean, l: string): void {
  console.log(`${c ? "✅" : "❌"} ${l}`);
  if (!c) failed++;
}
async function cleanup(): Promise<void> {
  const ms = await prisma.member.findMany({ where: { kasId: { startsWith: TAG } }, select: { id: true } });
  await prisma.telegramUser.deleteMany({ where: { id: { startsWith: TAG } } });
  await prisma.member.deleteMany({ where: { id: { in: ms.map((m) => m.id) } } });
}

async function main(): Promise<void> {
  await cleanup();
  const client = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-c`, fullName: "Test C", phone: PHONE, trips: 10, coins: 500, points: 9000 } });
  const driver = await prisma.member.create({ data: { type: "driver", kasId: `${TAG}-d`, fullName: "Test D", phone: PHONE, trips: 0, coins: 100 } });
  const tg = `${TAG}-tg`;
  await prisma.telegramUser.create({ data: { id: tg, memberId: driver.id, linkedAt: new Date() } });

  // 1. search by phone → BOTH accounts, telegram shown on the driver
  const found = await adminSearchUsers("7777");
  const mine = found.filter((u) => u.phone === PHONE).map((u) => u.id);
  ok(mine.includes(client.id) && mine.includes(driver.id), `search by phone → both accounts (${mine})`);
  ok(found.find((u) => u.id === driver.id)?.telegram?.id === tg, `telegram shown on the linked (driver) account`);

  // 2. re-link the Telegram → client account (the Elbek fix)
  const r1 = await adminRelink(tg, client.id);
  ok(r1.ok, `relink → client ok`);
  ok((await prisma.telegramUser.findUnique({ where: { id: tg } }))?.memberId === client.id, `telegram now on the client account`);

  // 3. re-link a member that's already linked to a DIFFERENT telegram → refused
  const tg2 = `${TAG}-tg2`;
  await prisma.telegramUser.create({ data: { id: tg2 } });
  const r2 = await adminRelink(tg2, client.id);
  ok(!r2.ok && r2.reason === "member_taken", `relink to a taken member → member_taken (${r2.reason})`);

  // 4. unlink → memberId cleared (user can re-/start fresh)
  const r3 = await adminUnlink(tg);
  ok(r3.ok && (await prisma.telegramUser.findUnique({ where: { id: tg } }))?.memberId === null, `unlink → memberId null`);

  // 5. withdrawals smoke
  ok(Array.isArray(await adminWithdrawals(5)), `withdrawals returns an array`);

  await cleanup();
  await prisma.$disconnect();
  console.log(failed === 0 ? "\n🎉 admin-users checks passed" : `\n❌ ${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
