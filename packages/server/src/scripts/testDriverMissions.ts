// 🎯 Haydovchi topshiriqlari: a driver sees daily ride-count missions with live progress, claims
// once per day (idempotent — no double-grant), clients see none. Admin add/toggle works. Snapshots
// the GLOBAL drvmissions AppState + restores it; TAG'd members cleaned. Runs KAS_MODE=mock (2 rides/day).
import "../env";
import { prisma } from "../db";
import { getDriverMissions, claimDriverMission, adminAddMission, adminToggleMission, adminEditMission, adminDeleteMission, adminListMissions } from "../services/driverMissionService";

const TAG = "DRVMISSION";
let failed = 0;
function ok(c: boolean, l: string): void {
  console.log(`${c ? "✅" : "❌"} ${l}`);
  if (!c) failed++;
}
async function cleanup(): Promise<void> {
  const ms = await prisma.member.findMany({ where: { kasId: { startsWith: TAG } }, select: { id: true } });
  const ids = ms.map((m) => m.id);
  await prisma.coinTxn.deleteMany({ where: { memberId: { in: ids } } });
  await prisma.telegramUser.deleteMany({ where: { id: { startsWith: TAG } } });
  await prisma.member.deleteMany({ where: { id: { in: ids } } });
}

async function main(): Promise<void> {
  const snapshot = await prisma.appState.findUnique({ where: { key: "drvmissions" } }); // restore global after
  await cleanup();
  const drv = await prisma.member.create({ data: { type: "driver", kasId: `${TAG}-d`, fullName: "Drv", phone: "+998900008001", carNumber: "55D555DD", coins: 0 } });
  const cli = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-c`, fullName: "Cli", phone: "+998900008002", coins: 0 } });

  // 1. live progress from kas (mock = 2 delivered rides today)
  const v1 = await getDriverMissions(drv.id);
  ok(v1.ridesToday === 2, `ridesToday from kas = 2 (got ${v1.ridesToday})`);
  ok(v1.missions.length > 0, `driver sees missions (${v1.missions.length})`);

  // 2. admin adds a target-1 mission → claimable with 2 rides
  const add = await adminAddMission("Test 1 safar", 1, 200);
  ok(add.ok && !!add.id, `admin add mission`);
  const v2 = await getDriverMissions(drv.id);
  const t1 = v2.missions.find((x) => x.id === add.id);
  ok(t1?.claimable === true, `target-1 mission claimable (progress ${t1?.progress}/${t1?.target})`);

  // 3. claim → reward granted
  const c1 = await claimDriverMission(drv.id, add.id!);
  ok(c1.ok && c1.reward === 200, `claim ok (+${c1.reward})`);
  const coins1 = (await prisma.member.findUnique({ where: { id: drv.id }, select: { coins: true } }))?.coins;
  ok(coins1 === 200, `driver credited 200 (coins=${coins1})`);

  // 4. claim again → idempotent, no double-grant
  const c2 = await claimDriverMission(drv.id, add.id!);
  ok(!c2.ok && c2.reason === "claimed", `re-claim refused (${c2.reason})`);
  const coins2 = (await prisma.member.findUnique({ where: { id: drv.id }, select: { coins: true } }))?.coins;
  ok(coins2 === 200, `no double-grant (coins=${coins2})`);

  // 5. reward cap: admin can't mint > 10000
  const big = await adminAddMission("Cheat", 1, 999999);
  ok(!big.ok && big.reason === "bad_reward", `reward cap enforced (${big.reason})`);

  // 6. clients see no driver missions
  ok((await getDriverMissions(cli.id)).missions.length === 0, `client sees no driver missions`);

  // 7. admin toggle off
  ok((await adminToggleMission(add.id!, false)).ok, `admin toggle off`);

  // 8. edit changes title/target/reward
  ok((await adminEditMission(add.id!, "Edited", 9, 999)).ok, `edit mission`);
  const edited = (await adminListMissions()).find((x) => x.id === add.id);
  ok(edited?.title === "Edited" && edited?.target === 9 && edited?.reward === 999, `edit applied (${edited?.title}/${edited?.target}/${edited?.reward})`);
  ok(!(await adminEditMission(add.id!, "X", 1, 999999)).ok, `edit reward cap enforced`);

  // 9. delete removes it
  ok((await adminDeleteMission(add.id!)).ok, `delete mission`);
  ok(!(await adminListMissions()).some((x) => x.id === add.id), `mission gone after delete`);
  ok((await adminDeleteMission("nope")).reason === "not_found", `delete missing → not_found`);

  await cleanup();
  if (snapshot) await prisma.appState.upsert({ where: { key: "drvmissions" }, create: { key: "drvmissions", value: snapshot.value }, update: { value: snapshot.value } });
  else await prisma.appState.deleteMany({ where: { key: "drvmissions" } });
  await prisma.$disconnect();
  console.log(failed === 0 ? "\n🎉 driver-missions checks passed" : `\n❌ ${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
