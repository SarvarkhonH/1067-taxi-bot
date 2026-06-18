// Proves the recruit-feedback change: fresh scan attaches + yields the driver's tg id
// (for the "someone joined" notification); existing user is ignored; pendingRecruits counts.
// TAG'd throwaway rows + full cleanup. Run: dotenv -e ../../.env -- tsx src/scripts/_testRecruitFeedback.ts
import "../env";
import { prisma } from "../db";
import { attachDriverRecruit, driverRecruitStats } from "../services/recruitService";

const TAG = "RECFB";
let failed = 0;
function ok(c: boolean, label: string): void {
  console.log(`${c ? "✅" : "❌"} ${label}`);
  if (!c) failed++;
}

async function cleanup(): Promise<void> {
  const ms = await prisma.member.findMany({ where: { kasId: { startsWith: TAG } }, select: { id: true } });
  const ids = ms.map((m) => m.id);
  await prisma.driverRecruit.deleteMany({ where: { driverId: { in: ids } } });
  await prisma.driverRecruit.deleteMany({ where: { riderMemberId: { in: ids } } });
  await prisma.telegramUser.deleteMany({ where: { id: { startsWith: TAG } } });
  await prisma.member.deleteMany({ where: { id: { in: ids } } });
}

async function main(): Promise<void> {
  await cleanup();

  // a driver + their telegram link (notification target)
  const driver = await prisma.member.create({ data: { type: "driver", kasId: `${TAG}-drv`, fullName: "QR Driver", phone: "+998900007001" } });
  const drvTgId = `${TAG}_drvtg`;
  await prisma.telegramUser.create({ data: { id: drvTgId, memberId: driver.id, linkedAt: new Date() } });

  // 1) a BRAND-NEW rider scans → attaches + returns the driver's tg id
  const freshTg = `${TAG}_fresh`;
  const r1 = await attachDriverRecruit(freshTg, driver.id);
  ok(r1.attached === true && r1.driverTelegramId === drvTgId, `fresh scan → attached=true, driverTelegramId=${r1.driverTelegramId}`);
  const tu = await prisma.telegramUser.findUnique({ where: { id: freshTg } });
  ok(tu?.referredByCode === `drv_${driver.id}`, `referredByCode set to drv_${driver.id}`);

  // 2) re-scan the SAME user → already has a code → ignored (no double-attach)
  const r2 = await attachDriverRecruit(freshTg, driver.id);
  ok(r2.attached === false, `re-scan (already attached) → attached=false`);

  // 3) an EXISTING user (has memberId) scans → IGNORED (this is exactly Elbek's case)
  const existingMember = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-cli`, fullName: "Existing", phone: "+998900007002" } });
  const existTg = `${TAG}_exist`;
  await prisma.telegramUser.create({ data: { id: existTg, memberId: existingMember.id, linkedAt: new Date() } });
  const r3 = await attachDriverRecruit(existTg, driver.id);
  ok(r3.attached === false, `EXISTING user scan → attached=false (Elbek's case: not brand-new)`);

  // 4) pendingRecruits = scanned-but-not-yet-ridden = 1 (the fresh rider, no driverRecruit row)
  let stats = await driverRecruitStats(driver.id);
  ok(stats.pendingRecruits === 1 && stats.recruits === 0, `pending=1, recruits=0 (scanned, no ride yet) → pending=${stats.pendingRecruits}`);

  // 5) once they ride (driverRecruit row exists), pending drops to 0
  const rider = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-rider`, fullName: "Rider", phone: "+998900007003" } });
  await prisma.telegramUser.update({ where: { id: freshTg }, data: { memberId: rider.id, linkedAt: new Date() } });
  await prisma.driverRecruit.create({ data: { driverId: driver.id, riderMemberId: rider.id } });
  stats = await driverRecruitStats(driver.id);
  ok(stats.pendingRecruits === 0 && stats.recruits === 1, `after ride: pending=0, recruits=1 → pending=${stats.pendingRecruits}, recruits=${stats.recruits}`);

  await cleanup();
  await prisma.$disconnect();
  console.log(failed === 0 ? "\n🎉 recruit-feedback checks passed" : `\n❌ ${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await cleanup().catch(() => undefined); process.exit(1); });
