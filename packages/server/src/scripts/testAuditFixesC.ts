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

  // ── C5: free-spin reminder eligibility — the "spun today" detection the push loop batches ──
  const { featureOn, setFeature, __resetFeatureCache } = await import("../services/featureFlags");
  __resetFeatureCache();
  ok((await featureOn("spinreminder")) === false, "C5: spinreminder is DEFAULT_OFF (owner pilots it)");
  const { dayKey: dkFn } = await import("../services/notifyService"); // matches what pushEngineTick uses
  const dk = dkFn();
  // `m` (from C2) already used its free spin above → must be detected as "spun today"
  const spunRows = await prisma.coinTxn.findMany({ where: { kind: "freespin", idempotencyKey: { endsWith: `:${dk}` } }, select: { memberId: true } });
  const spun = new Set(spunRows.map((r) => r.memberId));
  ok(spun.has(m.id), "C5: a member who used the free spin IS detected as spun-today (won't be nudged)");
  // a fresh member who hasn't spun → NOT in the set → eligible for the nudge (has a phone = real rider)
  const fresh = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-F`, fullName: "Fresh Rider", phone: "+998900000077" } });
  ok(!spun.has(fresh.id), "C5: a member who hasn't spun is NOT in the set → eligible for the reminder");
  await setFeature("spinreminder", false);
  await prisma.appState.deleteMany({ where: { key: "feature:spinreminder" } });

  await cleanup();
  console.log(process.exitCode ? "\n❌ FAILED" : "\n✅ ALL GREEN");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
