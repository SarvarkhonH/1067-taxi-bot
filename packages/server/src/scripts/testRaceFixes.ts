// QA P0-money batch race-proofs (concurrent duplicate → exactly one row / one grant):
//  - completeReferral: insert-first (refereeId @unique) + stamp-after
//  - payRecruitRevshare: P2002-catch + re-read on driverRecruit (riderMemberId @unique)
// Run: KAS_MODE=mock dotenv -e ../../.env -- tsx src/scripts/testRaceFixes.ts
import "../env";
import { prisma } from "../db";
import { completeReferral } from "../services/referralService";
import { payRecruitRevshare } from "../services/recruitService";
import { dailyCheckIn } from "../services/rewardService";
import { grantRideCoins } from "../services/coinService";
import { spinWheel } from "../services/rewardService";
import { mintItem } from "../services/itemService";
import { setFeature } from "../services/featureFlags";
import { RIDE_EMISSION_CAP, WHEEL_PRIZES, JACKPOT_FLOOR } from "@t1067/shared";

const TAG = "racefix-test";
let failed = 0;
const ok = (c: boolean, l: string): void => { console.log(`${c ? "✅" : "❌"} ${l}`); if (!c) failed++; };
const bal = async (id: number): Promise<number> => (await prisma.member.findUnique({ where: { id } }))!.coins;

async function cleanup(): Promise<void> {
  const ms = await prisma.member.findMany({ where: { kasId: { startsWith: TAG } }, select: { id: true } });
  const ids = ms.map((m) => m.id);
  await prisma.referral.deleteMany({ where: { OR: [{ refereeId: { startsWith: `${TAG}-tg` } }, { refereeMemberId: { in: ids } }] } });
  await prisma.driverRecruit.deleteMany({ where: { riderMemberId: { in: ids } } });
  await prisma.streak.deleteMany({ where: { memberId: { in: ids } } });
  await prisma.wheelSpin.deleteMany({ where: { memberId: { in: ids } } });
  await prisma.item.deleteMany({ where: { ownerId: { in: ids } } }); // test items are owned by TAG members
  await prisma.itemType.deleteMany({ where: { code: { startsWith: TAG } } });
  await prisma.coinTxn.deleteMany({ where: { memberId: { in: ids } } });
  await prisma.telegramUser.deleteMany({ where: { id: { startsWith: `${TAG}-tg` } } });
  await prisma.member.deleteMany({ where: { id: { in: ids } } });
}

async function main(): Promise<void> {
  // snapshot the recruit flag (restore exactly at the end), force ON for the test
  const snap = await prisma.appState.findUnique({ where: { key: "feature:recruit" } });
  const jpSnap = await prisma.appState.findUnique({ where: { key: "jackpot_pool" } }); // global — restore at end
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

    // ── dailyCheckIn concurrent → streak advances ONCE, milestone reward granted ONCE ──
    // (test-first: the grant key streak:m:today + atomic grantCoins may already protect it)
    const chk = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-chk`, fullName: "Chk", phone: "+998900022005", trips: 1 } });
    await prisma.streak.create({ data: { memberId: chk.id, current: 6, longest: 6, lastCheckIn: new Date(Date.now() - 24 * 3600 * 1000) } });
    await Promise.allSettled([dailyCheckIn(chk.id), dailyCheckIn(chk.id)]);
    const st = await prisma.streak.findUnique({ where: { memberId: chk.id } });
    const streakGrants = await prisma.coinTxn.count({ where: { memberId: chk.id, kind: "streak" } });
    ok(st?.current === 7, `dailyCheckIn race → streak advances EXACTLY once (6→7, got ${st?.current})`);
    ok(streakGrants <= 1, `dailyCheckIn race → streak reward granted at most once (got ${streakGrants})`);

    // ── grantRideCoins concurrent (2 mechanics, same ride) → combined emission CLAMPED ≤ CAP ──
    const clampM = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-clamp`, fullName: "Clamp", phone: "+998900022006", trips: 1 } });
    const bid = 6001;
    const half = Math.floor(RIDE_EMISSION_CAP * 0.6); // each alone is valid; combined (1.2x) must be clamped
    await Promise.allSettled([
      grantRideCoins(clampM.id, bid, half, "cashback", "race", "cashback"),
      grantRideCoins(clampM.id, bid, half, "wheel", "race", "wheel"),
    ]);
    const ridePaid = (await prisma.coinTxn.aggregate({ where: { memberId: clampM.id, amount: { gt: 0 }, idempotencyKey: { endsWith: `:${clampM.id}:${bid}` } }, _sum: { amount: true } }))._sum.amount ?? 0;
    ok(ridePaid <= RIDE_EMISSION_CAP, `grantRideCoins race → combined ride emission CLAMPED ≤${RIDE_EMISSION_CAP} (got ${ridePaid})`);

    // ── wheel JACKPOT: concurrent spins → pool claimed ONCE, NO drain-without-payout ──
    // (T0.5/3.1: wheelSpin insert BEFORE claim → only the winner claims AND pays out)
    const jpLabel = WHEEL_PRIZES.find((p) => p.label.startsWith("JACKPOT"))!.label;
    const jpPool = JACKPOT_FLOOR + 5000; // clearly above the floor so "claimed→reset" is visible
    await prisma.appState.upsert({ where: { key: "jackpot_pool" }, update: { value: String(jpPool) }, create: { key: "jackpot_pool", value: String(jpPool) } });
    const jm = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-jp`, fullName: "JP", phone: "+998900022007", trips: 1 } });
    const jbid = 7700;
    const jpBefore = await bal(jm.id);
    const active = { id: jbid, status: "started" };
    await Promise.all([spinWheel(jm.id, { _forcePrize: jpLabel, _active: active }), spinWheel(jm.id, { _forcePrize: jpLabel, _active: active })]);
    const jpAfter = await bal(jm.id);
    const spinRows = await prisma.wheelSpin.count({ where: { memberId: jm.id, bookingId: jbid } });
    const jpGrants = await prisma.coinTxn.count({ where: { memberId: jm.id, idempotencyKey: `jackpotwin:${jbid}:m${jm.id}` } });
    const poolNow = Number((await prisma.appState.findUnique({ where: { key: "jackpot_pool" } }))!.value);
    ok(spinRows === 1, `wheel jackpot race → exactly 1 wheelSpin row (got ${spinRows})`);
    ok(jpGrants === 1, `wheel jackpot race → exactly 1 jackpot grant, NO double-payout (got ${jpGrants})`);
    ok(jpAfter - jpBefore >= jpPool, `wheel jackpot → full pool PAID OUT to winner (claim→payout, got +${jpAfter - jpBefore} of ${jpPool})`);
    ok(poolNow <= JACKPOT_FLOOR + 200, `wheel jackpot → pool claimed once & reset to floor (no drain-without-payout, got ${poolNow})`);

    // ── mintItem: SOLD-OUT must NOT deduct coins (spend is now INSIDE the mint tx → rolls back) ──
    await prisma.itemType.create({ data: { code: `${TAG}-so`, name: "SoldOut", kind: "plate", mintPrice: 500, mintCap: 1, mintedCount: 1 } });
    const mm = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-mint`, fullName: "Mint", phone: "+998900022008", trips: 1, coins: 2000 } });
    const mBefore = await bal(mm.id);
    const soldOut = await mintItem(mm.id, `${TAG}-so`);
    const mAfterSold = await bal(mm.id);
    ok(soldOut.ok === false && soldOut.reason === "sold_out", `mintItem sold-out → rejected (reason: ${soldOut.reason})`);
    ok(mAfterSold === mBefore, `mintItem sold-out → coins NOT deducted (tx rollback, ${mBefore}→${mAfterSold})`);
    await prisma.itemType.update({ where: { code: `${TAG}-so` }, data: { mintCap: 5, mintedCount: 0 } });
    const minted = await mintItem(mm.id, `${TAG}-so`);
    const mAfterOk = await bal(mm.id);
    ok(minted.ok === true, `mintItem available → minted (serial ${minted.serial})`);
    ok(mAfterOk === mBefore - 500, `mintItem success → coins deducted exactly 500 (${mBefore}→${mAfterOk})`);
  } finally {
    await cleanup();
    // restore the recruit flag exactly as it was
    if (!snap) await prisma.appState.deleteMany({ where: { key: "feature:recruit" } });
    else await prisma.appState.update({ where: { key: "feature:recruit" }, data: { value: snap.value } });
    if (!jpSnap) await prisma.appState.deleteMany({ where: { key: "jackpot_pool" } });
    else await prisma.appState.update({ where: { key: "jackpot_pool" }, data: { value: jpSnap.value } });
    await prisma.$disconnect();
  }
  console.log(failed ? `\n❌ ${failed} FAIL` : "\n✅ RACE-FIXES: referral + recruit concurrent-duplicate → exactly one row/grant");
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error("FATAL", e instanceof Error ? e.message : e); process.exit(1); });
