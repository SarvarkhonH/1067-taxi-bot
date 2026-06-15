// QA P0-money batch race-proofs (concurrent duplicate → exactly one row / one grant):
//  - completeReferral: insert-first (refereeId @unique) + stamp-after
//  - payRecruitRevshare: P2002-catch + re-read on driverRecruit (riderMemberId @unique)
// Run: KAS_MODE=mock dotenv -e ../../.env -- tsx src/scripts/testRaceFixes.ts
import "../env";
import { prisma } from "../db";
import { completeReferral } from "../services/referralService";
import { payRecruitRevshare } from "../services/recruitService";
import { setFeature } from "../services/featureFlags";

const TAG = "racefix-test";
let failed = 0;
const ok = (c: boolean, l: string): void => { console.log(`${c ? "✅" : "❌"} ${l}`); if (!c) failed++; };
const bal = async (id: number): Promise<number> => (await prisma.member.findUnique({ where: { id } }))!.coins;

async function cleanup(): Promise<void> {
  const ms = await prisma.member.findMany({ where: { kasId: { startsWith: TAG } }, select: { id: true } });
  const ids = ms.map((m) => m.id);
  await prisma.referral.deleteMany({ where: { OR: [{ refereeId: { startsWith: `${TAG}-tg` } }, { refereeMemberId: { in: ids } }] } });
  await prisma.driverRecruit.deleteMany({ where: { riderMemberId: { in: ids } } });
  await prisma.coinTxn.deleteMany({ where: { memberId: { in: ids } } });
  await prisma.telegramUser.deleteMany({ where: { id: { startsWith: `${TAG}-tg` } } });
  await prisma.member.deleteMany({ where: { id: { in: ids } } });
}

async function main(): Promise<void> {
  // snapshot the recruit flag (restore exactly at the end), force ON for the test
  const snap = await prisma.appState.findUnique({ where: { key: "feature:recruit" } });
  await setFeature("recruit", true);
  await cleanup();
  try {
    // ── completeReferral concurrent-duplicate → 1 Referral row, 1 non-null credit ──
    const refMem = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-ref`, fullName: "Ref", phone: "+998900022001" } });
    await prisma.telegramUser.create({ data: { id: `${TAG}-tg-ref`, referralCode: `${TAG}-CODE`, memberId: refMem.id } });
    const refeMem = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-refe`, fullName: "Refe", phone: "+998900022002" } });
    await prisma.telegramUser.create({ data: { id: `${TAG}-tg-refe`, referredByCode: `${TAG}-CODE`, memberId: refeMem.id } });
    const rr = await Promise.allSettled([completeReferral(`${TAG}-tg-refe`, refeMem.id), completeReferral(`${TAG}-tg-refe`, refeMem.id)]);
    const refRows = await prisma.referral.count({ where: { refereeId: `${TAG}-tg-refe` } });
    const nonNull = rr.filter((r) => r.status === "fulfilled" && r.value !== null).length;
    ok(refRows === 1, `completeReferral race → EXACTLY 1 Referral row (got ${refRows})`);
    ok(nonNull === 1, `completeReferral race → exactly 1 non-null credit (got ${nonNull})`);

    // ── payRecruitRevshare concurrent first-ride → 1 DriverRecruit row, recruit1 paid once (+500) ──
    const driver = await prisma.member.create({ data: { type: "driver", kasId: `${TAG}-drv`, fullName: "Drv", phone: "+998900022003" } });
    const rider = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-rid`, fullName: "Rid", phone: "+998900022004" } });
    await prisma.telegramUser.create({ data: { id: `${TAG}-tg-rid`, referredByCode: `drv_${driver.id}`, memberId: rider.id } });
    const dBefore = await bal(driver.id);
    await Promise.allSettled([payRecruitRevshare(rider.id, 5001), payRecruitRevshare(rider.id, 5002)]);
    const recRows = await prisma.driverRecruit.count({ where: { riderMemberId: rider.id } });
    const dAfter = await bal(driver.id);
    ok(recRows === 1, `payRecruitRevshare race → EXACTLY 1 DriverRecruit row (got ${recRows})`);
    ok(dAfter - dBefore === 500, `payRecruitRevshare race → recruit1 paid EXACTLY once (+500, got +${dAfter - dBefore})`);
  } finally {
    await cleanup();
    // restore the recruit flag exactly as it was
    if (!snap) await prisma.appState.deleteMany({ where: { key: "feature:recruit" } });
    else await prisma.appState.update({ where: { key: "feature:recruit" }, data: { value: snap.value } });
    await prisma.$disconnect();
  }
  console.log(failed ? `\n❌ ${failed} FAIL` : "\n✅ RACE-FIXES: referral + recruit concurrent-duplicate → exactly one row/grant");
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error("FATAL", e instanceof Error ? e.message : e); process.exit(1); });
