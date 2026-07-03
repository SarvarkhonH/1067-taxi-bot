// drvrank tests: monthly QR-income leaderboard + weekly push picker + dedup. Runs ONLY on
// TEST_DATABASE_URL (_testDb refuses the app DB) — the suite creates CoinTxn/NotifyLog rows and
// reads the GLOBAL leaderboard, which on the app DB would mix test money into real drivers' ranks.
import "./_testDb";

const TAG = "DRVRNK";

function ok(cond: boolean, label: string): void {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) process.exitCode = 1;
}

async function main(): Promise<void> {
  const { prisma } = await import("../db");
  const { recruitLeaderboard } = await import("../services/recruitService");
  const { pickQrWeekly } = await import("../services/driverEngageService");
  const { featureOn, __resetFeatureCache } = await import("../services/featureFlags");
  const { notifyOnce } = await import("../services/notifyService");

  const cleanup = async (): Promise<void> => {
    const members = await prisma.member.findMany({ where: { kasId: { startsWith: TAG } } });
    const ids = members.map((m) => m.id);
    await prisma.notifyLog.deleteMany({ where: { memberId: { in: ids } } });
    await prisma.coinTxn.deleteMany({ where: { memberId: { in: ids } } });
    await prisma.telegramUser.deleteMany({ where: { id: { startsWith: TAG } } });
    await prisma.member.deleteMany({ where: { id: { in: ids } } });
  };
  await cleanup();

  // 1) flag default OFF
  __resetFeatureCache();
  ok((await featureOn("drvrank")) === false, "drvrank is DEFAULT_OFF (no row → off)");

  // three drivers: A=5000 (this month), B=3000 (this month), C=old money only (LAST month → excluded)
  const mk = async (suffix: string) =>
    prisma.member.create({ data: { type: "driver", kasId: `${TAG}-${suffix}`, fullName: `${TAG} DRIVER ${suffix}`, phone: null } });
  const [a, b, c] = await Promise.all([mk("A"), mk("B"), mk("C")]);
  const lastMonth = new Date(Date.now() - 45 * 24 * 3600 * 1000);
  await prisma.coinTxn.createMany({
    data: [
      { memberId: a.id, amount: 4000, kind: "recruit", reason: "t", idempotencyKey: `${TAG}:a1` },
      { memberId: a.id, amount: 1000, kind: "revshare", reason: "t", idempotencyKey: `${TAG}:a2` },
      { memberId: b.id, amount: 3000, kind: "drvrecruit", reason: "t", idempotencyKey: `${TAG}:b1` },
      { memberId: c.id, amount: 9000, kind: "recruit", reason: "t", idempotencyKey: `${TAG}:c1`, createdAt: lastMonth },
    ],
  });

  // 2) order + amounts: A(5000) above B(3000); C's last-month 9000 NOT counted
  const lb = await recruitLeaderboard(b.id);
  const ai = lb.ranked.findIndex((r) => r.driverId === a.id);
  const bi = lb.ranked.findIndex((r) => r.driverId === b.id);
  ok(ai >= 0 && bi >= 0 && ai < bi, "A (5000) ranks above B (3000)");
  ok(lb.ranked[ai]!.earned === 5000 && lb.ranked[bi]!.earned === 3000, "monthly sums correct (recruit+revshare, drvrecruit)");
  ok(!lb.ranked.some((r) => r.driverId === c.id), "last-month-only driver NOT on this month's board");
  ok(lb.myRank === bi + 1 && lb.myEarned === 3000, "myRank/myEarned computed for the calling driver");
  const topA = lb.top.find((r) => r.driverId === a.id);
  ok(!!topA && topA.name.includes(TAG), "top rows carry driver names");

  // 3) weekly picker: window + activity gates
  ok(pickQrWeekly({ weekday: 1, hour: 9, joined7d: 2, earned7d: 1500, rank: 3 }) !== null, "Monday 09 + activity → push");
  const html = pickQrWeekly({ weekday: 1, hour: 10, joined7d: 2, earned7d: 1500, rank: 3 })!;
  ok(html.includes("2 mijoz") && html.includes("1 500") && html.includes("№3"), "push text carries joined/earned/rank");
  ok(pickQrWeekly({ weekday: 2, hour: 9, joined7d: 2, earned7d: 1500, rank: 3 }) === null, "not Monday → no push");
  ok(pickQrWeekly({ weekday: 1, hour: 11, joined7d: 2, earned7d: 1500, rank: 3 }) === null, "outside 09-11 window → no push");
  ok(pickQrWeekly({ weekday: 1, hour: 9, joined7d: 0, earned7d: 0, rank: null }) === null, "zero QR activity → NO push (no fatigue)");

  // 4) weekly dedup: notifyOnce(kind=drv_qr_weekly) sends once per day → Monday gate = once a week
  const stubBot = { api: { sendMessage: async () => ({}) } } as never;
  await prisma.telegramUser.create({ data: { id: `${TAG}_A`, memberId: a.id, linkedAt: new Date() } });
  const first = await notifyOnce(stubBot, `${TAG}_A`, a.id, "drv_qr_weekly", "<b>t</b>");
  const second = await notifyOnce(stubBot, `${TAG}_A`, a.id, "drv_qr_weekly", "<b>t</b>");
  ok(first === true && second === false, "same-day re-send blocked (NotifyLog unique) → 1×/week");

  await cleanup();
  console.log(process.exitCode ? "\n❌ FAILED" : "\n✅ ALL GREEN");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
