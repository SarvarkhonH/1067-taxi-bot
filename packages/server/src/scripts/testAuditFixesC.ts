// Bosqich C (growth-polish) — the retention + privacy tweaks. Runs on TEST_DATABASE_URL.
//   C2 ride-independent daily quest (daily_freespin, progressed by the free wheel) ·
//   C3 streak day-2 hook (50) · C4 weekly board short-names for others, full name for self.
import "./_testDb";

const TAG = "AUDITC";

function ok(cond: boolean, label: string): void {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) process.exitCode = 1;
}

async function main(): Promise<void> {
  const { prisma } = await import("../db");
  const { missionByCode, streakReward } = await import("@t1067/shared");
  const { freeSpin } = await import("../services/rewardService");
  const { getMissions } = await import("../services/missionService");
  const { getWeeklyBoard } = await import("../services/weeklyService");

  const cleanup = async (): Promise<void> => {
    const members = await prisma.member.findMany({ where: { kasId: { startsWith: TAG } } });
    const ids = members.map((m) => m.id);
    await prisma.weeklyScore.deleteMany({ where: { memberId: { in: ids } } });
    await prisma.coinTxn.deleteMany({ where: { memberId: { in: ids } } });
    await prisma.missionProgress.deleteMany({ where: { memberId: { in: ids } } }).catch(() => undefined);
    await prisma.member.deleteMany({ where: { id: { in: ids } } });
  };
  await cleanup();

  // ── C2: ride-independent daily quest exists + free spin progresses it ──────
  const def = missionByCode("daily_freespin");
  ok(!!def && def.period === "daily" && def.rotatable === true && def.core === false, "C2: daily_freespin is a rotatable, non-core (ride-independent) daily quest");

  const m = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-A`, fullName: "Free Spinner", phone: null } });
  const spin = await freeSpin(m.id);
  ok(spin.ok, "C2: free daily spin succeeds (no ride needed)");
  const missions = await getMissions(m.id);
  const fs = [...missions.daily, ...missions.weekly].find((x) => x.code === "daily_freespin");
  // the quest is only SHOWN on days it rotates in, but progress is tracked regardless — assert the bump landed
  const prog = await prisma.missionProgress.findFirst({ where: { memberId: m.id, code: "daily_freespin" } }).catch(() => null);
  ok(!!prog && prog.progress >= 1, "C2: free spin bumped daily_freespin progress (ride-independent completion)");
  void fs;

  // ── C3: streak day-2 hook ──────────────────────────────────────────────────
  ok(streakReward(2) === 50, "C3: day-2 streak pays 50 (was 0 — the 1→3 dead zone is closed)");
  ok(streakReward(3) === 100, "C3: day-3 unchanged (100)");
  ok(streakReward(1) === 0, "C3: day-1 still 0 (no reward for merely starting)");

  // ── C4: weekly board short-names for others, full for self ─────────────────
  const other = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-B`, fullName: "AXMEDOV YOKUB", phone: null } });
  const meM = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-C`, fullName: "SOBIROV ALISHER", phone: null } });
  const { weekKey } = await import("../services/missionService");
  const wk = weekKey(new Date());
  await prisma.weeklyScore.create({ data: { memberId: other.id, weekKey: wk, score: 500 } });
  await prisma.weeklyScore.create({ data: { memberId: meM.id, weekKey: wk, score: 300 } });
  const board = await getWeeklyBoard(meM.id, 20);
  const otherEntry = board.entries.find((e) => e.memberId === other.id);
  const meEntry = board.entries.find((e) => e.memberId === meM.id);
  ok(otherEntry?.fullName === "Axmedov Y.", `C4: OTHER shown short ("${otherEntry?.fullName}")`);
  ok(meEntry?.fullName === "SOBIROV ALISHER", `C4: SELF shown full ("${meEntry?.fullName}")`);

  await cleanup();
  console.log(process.exitCode ? "\n❌ FAILED" : "\n✅ ALL GREEN");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
