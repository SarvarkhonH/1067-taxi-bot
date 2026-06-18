// 🏆 GARAJ v2 tests: kill-switch, acquire sink, idempotent diagnose/repair,
// flip grant + double-flip idempotency, flip OUTSIDE the ride clamp, ride-drop
// zero-emission + idempotency, atomic daily flip cap (B4), ledger invariant.
// Live Postgres (app DB) — TAG'd throwaway member + full cleanup, NOT a sweep test.
// Run: dotenv -e ../../.env -- tsx src/scripts/testGaraj.ts
import "../env";
import { MAKE_BASE, GARAJ_BUY_FACTOR, FLIP_DAILY_CAP, CIPHER_REWARD, OFFLINE_DAILY_CAP, PRESTIGE_REP_HEADSTART, prestigeMultiplier, activeSeasonalEvent } from "@t1067/shared";
import { prisma } from "../db";
import { getCoins, grantCoins } from "../services/coinService";
import { acquireCar, completeRepairTask, diagnoseCar, flipCar, garajAuctionBid, garajAuctionCreate, garajBazaarBuy, garajBazaarList, garajBazaarUnlist, getGarajHistory, getMemberCollection, garajKozachaBuy, grantKozacha, processRideDrop, settleAuctions, spendKozachaIdempotent, updateStreakOnRide, garajCipherGuess, collectOfflineBox, garajPrestige, mahallaCreate, mahallaJoin, mahallaLeave, addMahallaScore, settleMahallaWeek, getMahallaLeague, getMahallaState } from "../services/garajService";
import { __resetFeatureCache, setFeature } from "../services/featureFlags";

const TAG = "garaj-test";
let failed = 0;
function ok(cond: boolean, label: string): void {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) failed++;
}
const todayKey = (): string => new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10);

async function cleanup(): Promise<void> {
  const ms = await prisma.member.findMany({ where: { kasId: { startsWith: TAG } }, select: { id: true } });
  const ids = ms.map((m) => m.id);
  if (ids.length) {
    // W5 mahalla: resolve every group these members touch (as member or founder), then purge
    const memberGroups = (await prisma.mahallaGroupMember.findMany({ where: { memberId: { in: ids } }, select: { groupId: true } })).map((g) => g.groupId);
    const founderGroups = (await prisma.mahallaGroup.findMany({ where: { founderId: { in: ids } }, select: { id: true } })).map((g) => g.id);
    const groupIds = [...new Set([...memberGroups, ...founderGroups])];
    await prisma.mahallaGroupMember.deleteMany({ where: { OR: [{ memberId: { in: ids } }, { groupId: { in: groupIds } }] } });
    await prisma.mahallaWeeklyResult.deleteMany({ where: { groupId: { in: groupIds } } });
    await prisma.mahallaGroup.deleteMany({ where: { id: { in: groupIds } } });
    await prisma.garajStreak.deleteMany({ where: { memberId: { in: ids } } });
    await prisma.garajHallOfFame.deleteMany({ where: { memberId: { in: ids } } });
    await prisma.garajCar.deleteMany({ where: { memberId: { in: ids } } });
    await prisma.garajFlip.deleteMany({ where: { memberId: { in: ids } } });
    await prisma.garajRideDrop.deleteMany({ where: { memberId: { in: ids } } });
    await prisma.kozachaTxn.deleteMany({ where: { memberId: { in: ids } } });
    await prisma.memberMechanicSkill.deleteMany({ where: { memberId: { in: ids } } });
    await prisma.garajBazaarListing.deleteMany({ where: { OR: [{ sellerId: { in: ids } }, { buyerId: { in: ids } }] } });
    await prisma.garajAuctionBid.deleteMany({ where: { bidderId: { in: ids } } });
    await prisma.garajAuction.deleteMany({ where: { sellerId: { in: ids } } });
    await prisma.memberGarajMeta.deleteMany({ where: { memberId: { in: ids } } });
    for (const id of ids) await prisma.appState.deleteMany({ where: { key: { startsWith: `garaj:flipbudget:${id}:` } } });
    for (const id of ids) await prisma.appState.deleteMany({ where: { key: { startsWith: `cipher:attempts:${id}:` } } });
    await prisma.member.deleteMany({ where: { id: { in: ids } } }); // cascades CoinTxn
  }
  await prisma.appState.deleteMany({ where: { key: `cipher:code:${todayKey()}` } }); // the test's daily cipher code
  await prisma.mahallaWeeklyResult.deleteMany({ where: { weekKey: "2026-W99" } }); // the test's settle weekKey
  // NOTE: do NOT delete feature:garajx here — on the LIVE DB that would knock the
  // game OFF for all real users. main() SAVES the flag's prior value and RESTORES it.
  __resetFeatureCache();
}

// The garajx flag's value BEFORE this test ran (so a run on the live DB never leaves
// the game OFF). Captured at main() start, restored in finally + the crash handler.
let prevGarajx: string | null = null;
async function restoreGarajxFlag(): Promise<void> {
  if (prevGarajx === null) await prisma.appState.deleteMany({ where: { key: "feature:garajx" } }).catch(() => undefined);
  else await prisma.appState.upsert({ where: { key: "feature:garajx" }, create: { key: "feature:garajx", value: prevGarajx }, update: { value: prevGarajx } }).catch(() => undefined);
  __resetFeatureCache();
}

async function main(): Promise<void> {
  prevGarajx = (await prisma.appState.findUnique({ where: { key: "feature:garajx" } }))?.value ?? null; // SAVE prod state first
  await cleanup();
  await setFeature("garajx", false); // kill-switch test needs OFF (restored to prevGarajx at the end)
  __resetFeatureCache();
  const m = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-1`, fullName: "Garaj Tester", phone: "+998900006001", trips: 5 } });
  await grantCoins(m.id, 50000, "manual", "seed");

  // 1. kill-switch: flag OFF (DEFAULT_OFF) → service refuses
  let r = await acquireCar(m.id, "nexia");
  ok(!r.ok && r.reason === "off", `flag OFF → acquire refused (kill-switch works)`);

  await setFeature("garajx", true);
  __resetFeatureCache();

  // 2. acquire nexia: sink = round(MAKE_BASE.nexia × 0.65)
  const expectBuy = Math.round(MAKE_BASE["nexia"]! * GARAJ_BUY_FACTOR);
  const coins0 = await getCoins(m.id);
  r = await acquireCar(m.id, "nexia");
  const carId = r.carId!;
  ok(r.ok && coins0 - r.coins! === expectBuy, `nexia acquired (sink ${expectBuy}): spent ${coins0 - (r.coins ?? 0)}`);

  // 3. double acquire → owned, no double charge
  const beforeDup = await getCoins(m.id);
  r = await acquireCar(m.id, "nexia");
  ok(!r.ok && r.reason === "owned" && (await getCoins(m.id)) === beforeDup, `double-acquire blocked, no charge`);

  // 4. diagnose TOOL: -120, then idempotent on retry
  const c1 = await getCoins(m.id);
  await diagnoseCar(m.id, carId, "TOOL");
  const c2 = await getCoins(m.id);
  ok(c1 - c2 === 120, `TOOL diagnose -120 (got ${c1 - c2})`);
  await diagnoseCar(m.id, carId, "TOOL");
  ok((await getCoins(m.id)) === c2, `diagnose 2× same tier idempotent (no double debit)`);

  // 5. repair task: -80, condition bumps; 2-tap idempotent
  const c4 = await getCoins(m.id);
  await completeRepairTask(m.id, carId, "oil_change", "FULL_RESTORE");
  const c5 = await getCoins(m.id);
  ok(c4 - c5 === 80, `repair -80 (got ${c4 - c5})`);
  const dup = await completeRepairTask(m.id, carId, "oil_change");
  ok((await getCoins(m.id)) === c5 && dup.reason === "already", `repair 2-tap idempotent (no double debit)`);
  await completeRepairTask(m.id, carId, "tyre");
  await completeRepairTask(m.id, carId, "body"); // worn → mint over 3 task bumps

  // 6+7. flip → grant; retry → no double grant
  const c7 = await getCoins(m.id);
  const f = await flipCar(m.id, carId, "FAMILY_DRIVER");
  const c8 = await getCoins(m.id);
  ok(f.ok && (f.grant ?? 0) > 0 && c8 - c7 === f.grant, `flip grant +${f.grant} credited once`);
  const flipKey = `flip:g${m.id}c${carId}`;
  ok((await prisma.coinTxn.count({ where: { idempotencyKey: flipKey } })) === 1, `exactly 1 flip CoinTxn`);
  await flipCar(m.id, carId, "FAMILY_DRIVER");
  ok((await getCoins(m.id)) === c8, `flip 2× → no double grant (idempotent)`);
  ok((await prisma.coinTxn.count({ where: { idempotencyKey: flipKey } })) === 1, `still exactly 1 flip CoinTxn after retry`);

  // 7b. RE-BUY after sell — the CORE LOOP must repeat (bug: sold row + @@unique blocked it)
  const cReb0 = await getCoins(m.id);
  const reb = await acquireCar(m.id, "nexia");
  ok(reb.ok && !!reb.carId, `re-buy nexia after flip succeeds (loop repeats)`);
  ok(cReb0 - (reb.coins ?? 0) === expectBuy, `re-buy CHARGED again (${cReb0 - (reb.coins ?? 0)} === ${expectBuy})`);
  ok((await prisma.garajCar.count({ where: { memberId: m.id, carCode: "nexia", soldAt: null } })) === 1, `exactly 1 ACTIVE nexia after re-buy`);
  const ownNow = await acquireCar(m.id, "nexia");
  ok(!ownNow.ok && ownNow.reason === "owned", `can't buy a model you currently own (active) again`);

  // 8. flip is OUTSIDE the ride clamp: its key can't match the suffix `:memberId:<carId>`
  const clampAgg = await prisma.coinTxn.aggregate({
    where: { memberId: m.id, amount: { gt: 0 }, idempotencyKey: { endsWith: `:${m.id}:${carId}` } },
    _sum: { amount: true },
  });
  ok((clampAgg._sum.amount ?? 0) === 0, `flip grant is OUTSIDE the ride clamp (key can't collide with :member:booking)`);

  // 9. ride-drop: zero emission + idempotent
  const beforeDrop = await getCoins(m.id);
  await processRideDrop(m.id, 777001, new Date());
  ok((await getCoins(m.id)) === beforeDrop, `ride-drop emits 0 tanga (≤350 clamp untouched)`);
  await processRideDrop(m.id, 777001, new Date());
  ok((await prisma.garajRideDrop.count({ where: { memberId: m.id, bookingId: 777001 } })) === 1, `ride-drop idempotent (1 row for 2 sweeps)`);

  // 10. atomic daily flip cap (B4): park budget near the cap → next flip blocked
  await acquireCar(m.id, "tracker");
  const tracker = (await prisma.garajCar.findFirst({ where: { memberId: m.id, carCode: "tracker", soldAt: null } }))!;
  await prisma.appState.upsert({
    where: { key: `garaj:flipbudget:${m.id}:${todayKey()}` },
    create: { key: `garaj:flipbudget:${m.id}:${todayKey()}`, value: String(FLIP_DAILY_CAP - 50) },
    update: { value: String(FLIP_DAILY_CAP - 50) },
  });
  const fcap = await flipCar(m.id, tracker.id, "FAMILY_DRIVER");
  ok(!fcap.ok && fcap.reason === "daily_cap", `flip blocked by daily cap (B4 atomic): ${fcap.reason}`);

  // 11b. Ko'zacha: separate currency — ride-earned, idempotent, never touches tanga
  const tangaBeforeKoz = await getCoins(m.id);
  const gk = await grantKozacha(m.id, 5, "ride", `kozacha:test:${m.id}:1`);
  const meta1 = await prisma.memberGarajMeta.findUnique({ where: { memberId: m.id } });
  ok(gk === 5 && (meta1?.kozachaBalance ?? 0) >= 5, `kozacha earned (+5, balance ${meta1?.kozachaBalance})`);
  ok((await getCoins(m.id)) === tangaBeforeKoz, `kozacha earn does NOT touch tanga (separate ledger)`);
  await grantKozacha(m.id, 5, "ride", `kozacha:test:${m.id}:1`);
  const meta2 = await prisma.memberGarajMeta.findUnique({ where: { memberId: m.id } });
  ok((meta2?.kozachaBalance ?? 0) === (meta1?.kozachaBalance ?? 0), `kozacha grant idempotent (same key → no double)`);
  const spent = await spendKozachaIdempotent(m.id, 3, "shop", `kozspend:${m.id}:1`);
  const meta3 = await prisma.memberGarajMeta.findUnique({ where: { memberId: m.id } });
  ok(spent && (meta3?.kozachaBalance ?? 0) === (meta2?.kozachaBalance ?? 0) - 3, `kozacha spent -3`);
  const over = await spendKozachaIdempotent(m.id, 9999, "shop", `kozspend:${m.id}:over`);
  ok(!over, `kozacha overspend rejected (never negative)`);

  // 11b2. Ko'zacha shop — buy a flip boost on the tracker (atomic, apply-once)
  await grantKozacha(m.id, 20, "ride", `kozacha:test:${m.id}:2`);
  const rqbBefore = (await prisma.garajCar.findUnique({ where: { id: tracker.id } }))?.repairQualityBonus ?? 1;
  const buy = await garajKozachaBuy(m.id, "FLIP_BOOST_5", tracker.id);
  const rqbAfter = (await prisma.garajCar.findUnique({ where: { id: tracker.id } }))?.repairQualityBonus ?? 1;
  ok(buy.ok && rqbAfter > rqbBefore, `kozacha shop: flip boost applied (RQB ${rqbBefore}→${rqbAfter.toFixed(2)})`);
  const buy2 = await garajKozachaBuy(m.id, "FLIP_BOOST_5", tracker.id);
  ok(!buy2.ok && buy2.reason === "already", `kozacha shop buy idempotent (one boost per car)`);

  // 11d. W4 Bazaar — list (seller m) → buy (member2): atomic, 3% tax, self-trade block
  const m2 = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-2`, fullName: "Garaj Buyer", phone: "+998900006002", trips: 5 } });
  await grantCoins(m2.id, 50000, "manual", "seed");
  const listRes = await garajBazaarList(m.id, tracker.id, 9000);
  ok(listRes.ok, `bazaar: car listed`);
  const listing = (await prisma.garajBazaarListing.findFirst({ where: { sellerId: m.id, status: "open" } }))!;
  const self = await garajBazaarBuy(m.id, listing.id);
  ok(!self.ok && self.reason === "self_trade", `bazaar: self-trade blocked`);
  const sellerBefore = (await prisma.member.findUnique({ where: { id: m.id } }))!.coins;
  const buyerBefore = await getCoins(m2.id);
  const bzBuy = await garajBazaarBuy(m2.id, listing.id);
  ok(bzBuy.ok && (await prisma.garajCar.findUnique({ where: { id: tracker.id } }))?.memberId === m2.id, `bazaar: ownership → buyer`);
  ok((await getCoins(m2.id)) === buyerBefore - 9000, `bazaar: buyer charged 9000`);
  ok((await prisma.member.findUnique({ where: { id: m.id } }))!.coins === sellerBefore + 9000 - Math.round(9000 * 0.03), `bazaar: seller credited 9000 − 3% tax burn`);
  const rebuy = await garajBazaarBuy(m2.id, listing.id);
  ok(!rebuy.ok && rebuy.reason === "already_sold", `bazaar: re-buy sold listing rejected (claim-before-pay)`);

  // 11e. W4 Auction — create + 2 sealed bids + settle: highest wins, loser refunded, seller −5%
  const m3 = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-3`, fullName: "Garaj Bidder", phone: "+998900006003", trips: 5 } });
  await grantCoins(m3.id, 50000, "manual", "seed");
  await acquireCar(m.id, "cobalt");
  const cobalt = (await prisma.garajCar.findFirst({ where: { memberId: m.id, carCode: "cobalt", soldAt: null } }))!;
  ok((await garajAuctionCreate(m.id, cobalt.id, 100, 24)).ok, `auction: created`);
  const auction = (await prisma.garajAuction.findFirst({ where: { sellerId: m.id, status: "open" } }))!;
  const bid1 = await garajAuctionBid(m2.id, auction.id, 500);
  const bid2 = await garajAuctionBid(m3.id, auction.id, 800);
  ok(bid1.ok && bid2.ok, `auction: 2 sealed bids escrowed`);
  ok(!(await garajAuctionBid(m.id, auction.id, 900)).ok, `auction: seller can't bid`);
  await prisma.garajAuction.update({ where: { id: auction.id }, data: { endsAt: new Date(Date.now() - 1000) } });
  const m2Before = await getCoins(m2.id);
  const sellerB = (await prisma.member.findUnique({ where: { id: m.id } }))!.coins;
  await settleAuctions();
  ok((await prisma.garajCar.findUnique({ where: { id: cobalt.id } }))?.memberId === m3.id, `auction: highest bidder (m3) won the car`);
  ok((await getCoins(m2.id)) === m2Before + 500, `auction: loser (m2) refunded 500`);
  ok((await prisma.member.findUnique({ where: { id: m.id } }))!.coins === sellerB + 800 - Math.round(800 * 0.05), `auction: seller credited 800 − 5% fee`);
  const m2AfterSettle = await getCoins(m2.id);
  await settleAuctions();
  ok((await getCoins(m2.id)) === m2AfterSettle, `auction: re-settle idempotent (no double refund)`);

  // 11c. skill XP accrued from diagnose + flip
  const skill = await prisma.memberMechanicSkill.findUnique({ where: { memberId: m.id } });
  ok(!!skill && skill.totalDiagnoses >= 1, `usta-ko'z: diagnoses tracked (${skill?.totalDiagnoses})`);
  ok(!!skill && skill.savdogarXp >= 4, `savdogar XP accrued from flip (${skill?.savdogarXp})`);

  // 11f. W5 reputation accrues from flip + acquire
  ok((await prisma.memberGarajMeta.findUnique({ where: { memberId: m.id } }))!.reputationScore >= 30, `reputation accrues (flip +30 / acquire +5)`);

  // 11g. sales history surfaces past sells (flip + bazaar) — fixes "istoriya yo'q"
  const hist = await getGarajHistory(m.id);
  ok(hist.some((h) => h.kind === "flip") && hist.some((h) => h.kind === "bazaar"), `sales history has both flip + bazaar rows (${hist.length})`);
  ok(hist.length >= 2 && hist[0]!.at >= hist[hist.length - 1]!.at, `history sorted newest-first`);

  // 11h. bazaar unlist — own open listing cancels, car stays owned (fixes stuck listing)
  await acquireCar(m.id, "matiz");
  const matiz = (await prisma.garajCar.findFirst({ where: { memberId: m.id, carCode: "matiz", soldAt: null } }))!;
  await garajBazaarList(m.id, matiz.id, 2000);
  const myList = (await prisma.garajBazaarListing.findFirst({ where: { sellerId: m.id, garajCarId: matiz.id, status: "open" } }))!;
  const unl = await garajBazaarUnlist(m.id, myList.id);
  ok(unl.ok && (await prisma.garajBazaarListing.findUnique({ where: { id: myList.id } }))?.status === "cancelled", `bazaar unlist cancels own open listing`);
  ok((await prisma.garajCar.findUnique({ where: { id: matiz.id } }))?.memberId === m.id, `unlisted car stays owned by seller`);
  ok(!(await garajBazaarUnlist(m2.id, myList.id)).ok, `cannot unlist someone else's listing`);

  // 11i. public collection (Reyting → garage) — viewer sees target's cars + rep + flips
  const coll = await getMemberCollection(m2.id, m.id);
  ok(!!coll && coll.memberId === m.id && coll.reputationScore > 0, `collection: rep visible (${coll?.reputationScore})`);
  ok(!!coll && coll.flips >= 1 && coll.cars.some((c) => c.name === "Matiz"), `collection: flips counted + owned cars listed`);

  // ═══ W5 social + meta ══════════════════════════════════════════════════════
  const sM = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-streak`, fullName: "Streaker", phone: "+998900006004", trips: 5 } });
  await grantCoins(sM.id, 5000, "manual", "seed");
  const cM = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-cipher`, fullName: "Cipherer", phone: "+998900006005", trips: 5 } });
  await grantCoins(cM.id, 5000, "manual", "seed");
  const bM = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-box`, fullName: "Boxer", phone: "+998900006006", trips: 5 } });
  await grantCoins(bM.id, 5000, "manual", "seed");

  // 12. Streak: consecutive days increment + day-3 milestone grant (OUTSIDE ride clamp)
  await updateStreakOnRide(sM.id, "2026-01-01");
  await updateStreakOnRide(sM.id, "2026-01-02");
  const day3 = await updateStreakOnRide(sM.id, "2026-01-03");
  ok(day3 === 3, `streak climbs to 3 over consecutive days (got ${day3})`);
  ok(!!(await prisma.coinTxn.findUnique({ where: { idempotencyKey: `streak:${sM.id}:3:2026-01-03` } })), `streak day-3 milestone granted (idempotent key)`);
  const sameDay = await updateStreakOnRide(sM.id, "2026-01-03");
  ok(sameDay === 3, `same-day ride → streak no-op (stays 3)`);
  const afterGap = await updateStreakOnRide(sM.id, "2026-01-20");
  ok(afterGap === 1, `>2-day gap (no spare tire) → streak resets to 1 (got ${afterGap})`);

  // 13. Streak freeze (spare tire): seed day-7 + freeze, skip exactly one day → covered
  await prisma.garajStreak.update({ where: { memberId: sM.id }, data: { current: 7, longest: 7, lastRideDate: "2026-02-07", freezeAvailable: true, freezeUsed: false } });
  const frozen = await updateStreakOnRide(sM.id, "2026-02-09"); // diff 2, freeze available
  ok(frozen === 8, `1 missed day covered by spare tire (7→8, no reset; got ${frozen})`);
  ok((await prisma.garajStreak.findUnique({ where: { memberId: sM.id } }))?.freezeUsed === true, `spare tire consumed`);
  const broke = await updateStreakOnRide(sM.id, "2026-02-12"); // diff 3, freeze spent → reset
  ok(broke === 1, `2nd missed day (freeze spent) → streak resets (got ${broke})`);

  // 14. Daily cipher: no code → no_cipher; set code; wrong consumes attempt; correct +30 once
  const date = todayKey();
  await prisma.appState.deleteMany({ where: { key: `cipher:code:${date}` } });
  ok((await garajCipherGuess(sM.id, "ABC")).reason === "no_cipher", `cipher: no code → no_cipher`);
  await prisma.appState.upsert({ where: { key: `cipher:code:${date}` }, create: { key: `cipher:code:${date}`, value: "XYZ" }, update: { value: "XYZ" } });
  const wrong = await garajCipherGuess(sM.id, "AAA");
  ok(!wrong.ok && wrong.reason === "wrong" && wrong.attemptsLeft === 4, `cipher: wrong guess consumes 1 attempt (4 left, got ${wrong.attemptsLeft})`);
  const cipBefore = await getCoins(sM.id);
  const right = await garajCipherGuess(sM.id, "xyz"); // case-insensitive
  ok(right.ok && (right.grant ?? 0) === CIPHER_REWARD && (await getCoins(sM.id)) === cipBefore + CIPHER_REWARD, `cipher: correct → +${CIPHER_REWARD} once`);
  const cipAgain = await garajCipherGuess(sM.id, "XYZ");
  ok(cipAgain.reason === "already" && (await getCoins(sM.id)) === cipBefore + CIPHER_REWARD, `cipher: 2nd solve same day → no double grant`);

  // 15. Cipher lockout: 5 wrong → 6th locked (even a correct guess is refused)
  for (let i = 0; i < 5; i++) await garajCipherGuess(cM.id, "NOPE");
  const locked = await garajCipherGuess(cM.id, "XYZ");
  ok(!locked.ok && locked.reason === "locked", `cipher: locked after 5 wrong attempts (got ${locked.reason})`);

  // 16. Offline box: bounded payout ≤ cap, daily idempotent
  await acquireCar(bM.id, "tiko"); // sumCarLevels = 1
  await prisma.memberGarajMeta.update({ where: { memberId: bM.id }, data: { lastBoxCollectedAt: new Date(Date.now() - 48 * 3600 * 1000) } });
  const box = await collectOfflineBox(bM.id);
  ok(box.ok && (box.grant ?? 0) > 0 && (box.grant ?? 0) <= OFFLINE_DAILY_CAP, `offline box pays bounded (+${box.grant}, ≤${OFFLINE_DAILY_CAP})`);
  const box2 = await collectOfflineBox(bM.id);
  ok(!box2.ok && box2.reason === "already", `offline box once/day (idempotent 2nd collect)`);

  // 17. Prestige: gated below tier 5; at rep≥25000 → resets fleet, +mult, rep preserved +500
  ok((await garajPrestige(bM.id)).reason === "not_eligible", `prestige gated below garage tier 5`);
  await prisma.memberGarajMeta.update({ where: { memberId: bM.id }, data: { reputationScore: 25000 } });
  // market must be clear first — prestige burns the fleet (no orphaned listing)
  const bTiko = (await prisma.garajCar.findFirst({ where: { memberId: bM.id, soldAt: null } }))!;
  await garajBazaarList(bM.id, bTiko.id, 500);
  ok((await garajPrestige(bM.id)).reason === "settle_market", `prestige blocked while a listing is open (no orphan burn)`);
  await prisma.garajBazaarListing.updateMany({ where: { sellerId: bM.id, status: "open" }, data: { status: "cancelled" } });
  const pr = await garajPrestige(bM.id);
  ok(pr.ok && pr.prestigeCount === 1, `prestige 1 done (count ${pr.prestigeCount})`);
  const pMeta = (await prisma.memberGarajMeta.findUnique({ where: { memberId: bM.id } }))!;
  ok(pMeta.prestigeMultiplier === prestigeMultiplier(1) && pMeta.carsOwnedCount === 0 && pMeta.sumCarLevels === 0, `prestige reset fleet + set mult ${prestigeMultiplier(1)}`);
  ok(pMeta.reputationScore === 25000 + PRESTIGE_REP_HEADSTART, `prestige preserves rep + ${PRESTIGE_REP_HEADSTART} head-start (got ${pMeta.reputationScore})`);
  ok((await prisma.garajCar.count({ where: { memberId: bM.id, soldAt: null } })) === 0, `prestige burned all owned cars`);

  // 18. Mahalla: create → join → score → league → weekly settle idempotent → leave
  const mc = await mahallaCreate(sM.id, "Koson Ustalari");
  ok(mc.ok && !!mc.code && mc.code.length === 6, `mahalla created (code ${mc.code})`);
  ok((await mahallaCreate(sM.id, "Another")).reason === "already_in_mahalla", `one mahalla per member (create blocked)`);
  ok((await mahallaJoin(cM.id, mc.code!)).ok, `member joins by code`);
  ok((await mahallaJoin(bM.id, "ZZZZZZ")).reason === "not_found", `join with bad code → not_found`);
  ok((await mahallaJoin(cM.id, mc.code!)).reason === "already_in_mahalla", `already-in-mahalla join blocked`);
  await addMahallaScore(sM.id, 10); // ride-time × max(1, quality) × prestige
  const mState = await getMahallaState(sM.id);
  ok((mState?.weeklyScore ?? 0) > 0 && mState?.memberCount === 2, `mahalla score accrues (score ${mState?.weeklyScore}, 2 members)`);
  const league = await getMahallaLeague();
  ok(league.length >= 1 && league[0]!.rank === 1, `league leaderboard ranks groups (top rank 1)`);
  const s1 = await settleMahallaWeek("2026-W99");
  const s2 = await settleMahallaWeek("2026-W99");
  ok(s1 > 0 && s2 === 0, `mahalla weekly settle idempotent (1st ${s1} groups, 2nd no-op)`);
  ok((await getMahallaState(sM.id))?.weeklyScore === 0, `weekly settle reset scores to 0`);
  ok((await mahallaLeave(cM.id)).ok && (await getMahallaState(cM.id)) === null, `member leaves mahalla`);

  // 19. Seasonal events — pure date function
  ok(activeSeasonalEvent("03-22")?.code === "navruz", `seasonal: Navruz active 03-22`);
  ok(activeSeasonalEvent("12-25")?.code === "qish", `seasonal: Qish active 12-25`);
  ok(activeSeasonalEvent("07-15") === null, `seasonal: no event mid-July`);

  // 20. W5 ledger invariant across all new members (every grant is a real CoinTxn)
  for (const mm of [sM, cM, bM]) {
    const b = (await prisma.member.findUnique({ where: { id: mm.id } }))!.coins;
    const t = await prisma.coinTxn.aggregate({ where: { memberId: mm.id }, _sum: { amount: true } });
    ok(Math.abs(b - (t._sum.amount ?? 0)) < 0.001, `W5 ledger invariant (member ${mm.id}: bal ${b} == ledger ${t._sum.amount ?? 0})`);
  }

  // 11. ledger invariant: balance == sum(CoinTxn)
  const bal = (await prisma.member.findUnique({ where: { id: m.id } }))!.coins;
  const tx = await prisma.coinTxn.aggregate({ where: { memberId: m.id }, _sum: { amount: true } });
  ok(Math.abs(bal - (tx._sum.amount ?? 0)) < 0.001, `ledger invariant holds (bal ${bal} == ledger ${tx._sum.amount ?? 0})`);

  await cleanup();
  await restoreGarajxFlag(); // put the live flag back exactly as it was (never leave the game OFF)
  await prisma.$disconnect();
  console.log(failed === 0 ? "\n🎉 all GARAJ checks passed" : `\n❌ ${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await restoreGarajxFlag().catch(() => undefined); // crash mid-test must NOT leave the live game OFF
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
