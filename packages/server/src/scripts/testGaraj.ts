// 🏆 GARAJ v2 tests: kill-switch, acquire sink, idempotent diagnose/repair,
// flip grant + double-flip idempotency, flip OUTSIDE the ride clamp, ride-drop
// zero-emission + idempotency, atomic daily flip cap (B4), ledger invariant.
// Runs on the ISOLATED test DB (TEST_DATABASE_URL). Even though it doesn't drive the
// sweep itself, it shares GLOBAL game state with the live bot's 90s sweep — mahalla weekly
// settle, auction settle, the garajx flag — so on the app DB that sweep races the test's
// members (intermittent null member reads at the ledger invariant). _testDb points Prisma
// at the separate DB the live bot never touches → hermetic. TAG'd rows + full cleanup.
// Run: dotenv -e ../../.env -- tsx src/scripts/testGaraj.ts
import "./_testDb"; // ENG BIRINCHI: izolyatsiyalangan test-DB (jonli sweep poygasini oldini oladi)
import "../env";
import { MAKE_BASE, GARAJ_BUY_FACTOR, FLIP_DAILY_CAP, CIPHER_REWARD, OFFLINE_DAILY_CAP, PRESTIGE_REP_HEADSTART, CRAFT_MAX_LEVEL, CRAFT_SPEEDUP_MIN, prestigeMultiplier, activeSeasonalEvent, demandMultiplier, GARAJ_NPCS, npcForBuyer, npcLine, motorSpeed, MOTOR_MAX_ACCRUE_HOURS } from "@t1067/shared";
import { prisma } from "../db";
import { getCoins, grantCoins } from "../services/coinService";
import { acquireCar, completeRepairTask, repairZone, diagnoseCar, flipCar, garajAuctionBid, garajAuctionCreate, garajBazaarBuy, garajBazaarList, garajBazaarUnlist, getGarajHistory, getMemberCollection, garajKozachaBuy, grantKozacha, processRideDrop, settleAuctions, spendKozachaIdempotent, updateStreakOnRide, garajCipherGuess, collectOfflineBox, garajPrestige, mahallaCreate, mahallaJoin, mahallaLeave, addMahallaScore, settleMahallaWeek, getMahallaLeague, getMahallaState, getDailyOrders, recomputeDemand, getRoadDrops, claimTowedCar, declineTowedCar, garajCraft, garajCraftSpeedup, settleCraftJobs, __resetWeekEventCache, exhibitionSubmit, exhibitionVote, settleExhibition, getMuseum, motorCollect, getPublicProfile, getMotorEcon, setMotorEcon, getMotorBonusFor } from "../services/garajService";
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
    await prisma.garajExhibitionVote.deleteMany({ where: { voterId: { in: ids } } });
    await prisma.garajExhibitionEntry.deleteMany({ where: { memberId: { in: ids } } });
    await prisma.garajCraftJob.deleteMany({ where: { memberId: { in: ids } } });
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
    // explicit CoinTxn delete: the test DB has NO member→CoinTxn cascade, so relying on
    // it left ORPHAN idempotency keys (repair:/flip:/acquire:) from crashed runs that
    // then collided with fresh car ids → silent duplicate-skips. Delete them by member.
    await prisma.coinTxn.deleteMany({ where: { memberId: { in: ids } } });
    await prisma.member.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.appState.deleteMany({ where: { key: `cipher:code:${todayKey()}` } }); // the test's daily cipher code
  await prisma.appState.deleteMany({ where: { key: { startsWith: "market:demand:" } } }); // #3 demand cache
  await prisma.appState.deleteMany({ where: { key: "garaj:weekevent" } }); // #6 admin override
  await prisma.appState.deleteMany({ where: { key: { in: ["feature:motorolami", "mo:econ"] } } }); // 🌍 motor test flag/econ (test DB only)
  __resetWeekEventCache();
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
  // #6: pin a NEUTRAL weekly event (double_drops touches only drop-rate, not any exact
  // cost/bonus the economy tests assert) so those checks are deterministic regardless of
  // the real ISO week. The #6 test below overrides this explicitly; cleanup clears it.
  await prisma.appState.upsert({ where: { key: "garaj:weekevent" }, create: { key: "garaj:weekevent", value: "double_drops" }, update: { value: "double_drops" } });
  __resetWeekEventCache();

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

  // 5b. repairZone (DEEP repair) + re-buy→re-flip cycle — on a DEDICATED member so
  // it doesn't consume m's daily flip budget (which later tests assert against).
  const rzM = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-rz`, fullName: "Zoner", phone: "+998900006009", trips: 5 } });
  await grantCoins(rzM.id, 50000, "manual", "seed");
  await acquireCar(rzM.id, "spark");
  const spark = (await prisma.garajCar.findFirst({ where: { memberId: rzM.id, carCode: "spark", soldAt: null } }))!;
  // pin zones low so "engine" is definitely damaged (seed could otherwise roll ≥96 = already pristine)
  await prisma.garajCar.update({ where: { id: spark.id }, data: { repairZones: JSON.stringify({ engine: 30, body: 30, transmission: 30, electric: 30, interior: 30 }) } });
  const cz0 = await getCoins(rzM.id);
  const rz = await repairZone(rzM.id, spark.id, "engine", "OEM", "FULL_RESTORE", "GOOD");
  ok(rz.ok && cz0 - (rz.coins ?? 0) === 200, `repairZone OEM charged 200 (got ${cz0 - (rz.coins ?? 0)})`);
  const sparkRow = (await prisma.garajCar.findUnique({ where: { id: spark.id } }))!;
  const sparkZones = JSON.parse(sparkRow.repairZones ?? "{}") as Record<string, number>;
  ok(typeof sparkZones.engine === "number" && sparkZones.engine > 0, `repairZone improved the engine zone (${sparkZones.engine})`);
  ok(sparkRow.repairSpent >= 200 && sparkRow.repairQualityBonus > 1.0, `repairZone bumped repairSpent (${sparkRow.repairSpent}) + quality (${sparkRow.repairQualityBonus.toFixed(2)})`);
  ok((await repairZone(rzM.id, spark.id, "spoiler", "STD")).reason === "unknown_zone", `repairZone rejects an unknown zone`);
  // the FULL cycle: flip (gen0) → re-buy (resets zones) → flip AGAIN (gen1, no key collision)
  const f1 = await flipCar(rzM.id, spark.id, "YOUNG_TUNER");
  ok(f1.ok && (f1.grant ?? 0) > 0, `repaired car flips (gen0, +${f1.grant})`);
  await acquireCar(rzM.id, "spark");
  const spark2 = (await prisma.garajCar.findUnique({ where: { id: spark.id } }))!;
  ok(spark2.repairZones === null && spark2.soldAt === null, `re-bought car resets zones (fresh project)`);
  const f2 = await flipCar(rzM.id, spark.id, "YOUNG_TUNER");
  ok(f2.ok && f2.reason !== "already", `re-bought car FLIPS AGAIN (flipGen fix — no key collision)`);

  // 6+7. flip → grant; retry → no double grant
  const c7 = await getCoins(m.id);
  const f = await flipCar(m.id, carId, "FAMILY_DRIVER");
  const c8 = await getCoins(m.id);
  ok(f.ok && (f.grant ?? 0) > 0 && c8 - c7 === f.grant, `flip grant +${f.grant} credited once`);
  const flipKey = `flip:g${m.id}c${carId}g0`; // first flip of this car instance (generation 0)
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

  // 11b. Garaj currency = TANGA now (ONE currency): grantKozacha is a game faucet that
  // moves Member.coins via a CoinTxn (kind "garaj"), idempotent per key. spendKozacha
  // decrements coins atomically (never below 0) and is insufficient-rejected.
  const tangaBeforeKoz = await getCoins(m.id);
  const gk = await grantKozacha(m.id, 5, "ride", `garajtanga:test:${m.id}:1`);
  ok(gk === 5 && (await getCoins(m.id)) === tangaBeforeKoz + 5, `garaj grant credits tanga (+5, coins ${tangaBeforeKoz}→${await getCoins(m.id)})`);
  ok((await prisma.coinTxn.count({ where: { idempotencyKey: `garajtanga:test:${m.id}:1` } })) === 1, `garaj grant wrote exactly 1 CoinTxn (real ledger, kind garaj)`);
  const gkDup = await grantKozacha(m.id, 5, "ride", `garajtanga:test:${m.id}:1`);
  ok(gkDup === 0 && (await getCoins(m.id)) === tangaBeforeKoz + 5, `garaj grant idempotent (same key → no double credit)`);
  const tangaBeforeSpend = await getCoins(m.id);
  const spent = await spendKozachaIdempotent(m.id, 3, "shop", `garajspend:${m.id}:1`);
  ok(spent && (await getCoins(m.id)) === tangaBeforeSpend - 3, `garaj spend -3 tanga (atomic CoinTxn decrement)`);
  const spentDup = await spendKozachaIdempotent(m.id, 3, "shop", `garajspend:${m.id}:1`);
  ok(spentDup && (await getCoins(m.id)) === tangaBeforeSpend - 3, `garaj spend idempotent (same key → no second debit)`);
  const over = await spendKozachaIdempotent(m.id, 9999999, "shop", `garajspend:${m.id}:over`);
  ok(!over && (await getCoins(m.id)) === tangaBeforeSpend - 3, `garaj overspend rejected (never negative)`);

  // 11b2. Garaj shop — buy a flip boost on the tracker (atomic tanga sink, apply-once)
  const rqbBefore = (await prisma.garajCar.findUnique({ where: { id: tracker.id } }))?.repairQualityBonus ?? 1;
  const tangaBeforeBuy = await getCoins(m.id);
  const buy = await garajKozachaBuy(m.id, "FLIP_BOOST_5", tracker.id);
  const rqbAfter = (await prisma.garajCar.findUnique({ where: { id: tracker.id } }))?.repairQualityBonus ?? 1;
  ok(buy.ok && rqbAfter > rqbBefore && (await getCoins(m.id)) === tangaBeforeBuy - 15, `garaj shop: flip boost applied + 15 tanga spent (RQB ${rqbBefore}→${rqbAfter.toFixed(2)})`);
  const buy2 = await garajKozachaBuy(m.id, "FLIP_BOOST_5", tracker.id);
  ok(!buy2.ok && buy2.reason === "already" && (await getCoins(m.id)) === tangaBeforeBuy - 15, `garaj shop buy idempotent (one boost per car, no second debit)`);

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
  const bAcq = await acquireCar(bM.id, "tiko"); // sumCarLevels = 1
  ok(bAcq.ok, `bM acquired tiko (${bAcq.reason ?? "ok"}, coins ${bAcq.coins})`);
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

  // 19b. #7 NPC personas — 12 people, 3 per buyer archetype, deterministic seed pick (pure config)
  ok(GARAJ_NPCS.length === 12, `NPC: 12 personas (got ${GARAJ_NPCS.length})`);
  ok((["FAMILY_DRIVER", "YOUNG_TUNER", "NEWLYWED", "COLLECTOR"] as const).every((b) => GARAJ_NPCS.filter((n) => n.buyer === b).length === 3), `NPC: exactly 3 per archetype`);
  ok(npcForBuyer("FAMILY_DRIVER", 0).name === "Hamid aka" && npcForBuyer("COLLECTOR", 0).name === "Usta Karim", `NPC: buyer→persona (seed 0)`);
  ok(npcForBuyer("FAMILY_DRIVER", 0).code !== npcForBuyer("FAMILY_DRIVER", 1).code, `NPC: seed rotates within an archetype`);
  ok(npcForBuyer("YOUNG_TUNER", 2).lines.length > 0 && typeof npcLine(npcForBuyer("YOUNG_TUNER", 2), 1) === "string", `NPC: dialogue lines present`);

  // 21. #2 NPC order bonus — a flip matching today's order pays the bonus, once/slot/day
  const oM = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-ord`, fullName: "Orderer", phone: "+998900006010", trips: 5 } });
  await grantCoins(oM.id, 50000, "manual", "seed");
  const ords = await getDailyOrders(oM.id);
  ok(ords.length === 3, `daily orders: 3 slots (got ${ords.length})`);
  const o0 = ords[0]!;
  await acquireCar(oM.id, o0.carCode);
  const oc = (await prisma.garajCar.findFirst({ where: { memberId: oM.id, carCode: o0.carCode, soldAt: null } }))!;
  await prisma.garajCar.update({ where: { id: oc.id }, data: { style: o0.style, condition: "good" } });
  const of1 = await flipCar(oM.id, oc.id, o0.buyer);
  ok(of1.ok && (of1.orderBonus ?? 0) === o0.bonus, `order bonus paid on matching flip (+${of1.orderBonus} === ${o0.bonus})`);
  ok((await getDailyOrders(oM.id))[0]!.done === true, `order slot marked done after fulfilment`);
  // re-buy + re-flip the SAME match today → no second order bonus (idempotent per slot/day)
  await acquireCar(oM.id, o0.carCode);
  await prisma.garajCar.update({ where: { id: oc.id }, data: { style: o0.style, condition: "good" } });
  const of2 = await flipCar(oM.id, oc.id, o0.buyer);
  ok(of2.ok && (of2.orderBonus ?? 0) === 0, `order bonus NOT re-paid same slot/day (idempotent)`);

  // 22. #3 demand waves — tanh sigmoid [0.70,1.50], value-weighted supply (anti-manip), 15-min guard
  ok(demandMultiplier({ ridesLast7d: 0, salesLast24h: 0, supplyUnits: 0 }) === 1.0, `demand neutral (no activity) = 1.0`);
  ok(demandMultiplier({ ridesLast7d: 20, salesLast24h: 12, supplyUnits: 0 }) > 1.2, `demand: heavy sales lift it high`);
  ok(demandMultiplier({ ridesLast7d: 0, salesLast24h: 0, supplyUnits: 15 }) < 0.85, `demand: heavy SUPPLY cools it (anti-manip via Σ ask)`);
  const dmAll = [0, 5, 12].flatMap((s) => [0, 8, 15].map((v) => demandMultiplier({ ridesLast7d: 6, salesLast24h: s, supplyUnits: v })));
  ok(dmAll.every((m) => m >= 0.7 && m <= 1.5), `demand multiplier bounded 0.70–1.50 across signals`);
  await prisma.appState.deleteMany({ where: { key: "market:demand:nextRecalcAt" } }); // force due
  const dN = await recomputeDemand();
  ok(dN > 0, `demand recomputed for ${dN} cars`);
  const dRow = await prisma.appState.findUnique({ where: { key: "market:demand:nexia" } });
  const dMult = parseFloat(dRow?.value ?? "1");
  ok(dMult >= 0.7 && dMult <= 1.5, `demand multiplier bounded 0.70–1.50 (nexia=${dMult})`);
  ok((await recomputeDemand()) === 0, `demand recompute guarded — immediate 2nd call is a no-op (≤15min)`);

  // 23. #4 towed-car ride-find: offer → claim (discounted acquire) / decline
  const tM = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-tow`, fullName: "Towed", phone: "+998900006011", trips: 5 } });
  await grantCoins(tM.id, 50000, "manual", "seed");
  await prisma.garajRideDrop.create({ data: { memberId: tM.id, bookingId: 991001, dropType: "TOWED_CAR", dropCode: "lacetti", seed: 650, status: "pending" } });
  const rd = await getRoadDrops(tM.id);
  const towPrice = Math.round(MAKE_BASE["lacetti"]! * 0.55);
  ok(rd.length >= 1 && rd[0]!.carCode === "lacetti" && rd[0]!.price === towPrice, `road-find offer surfaces at 55% base (🪙${rd[0]?.price})`);
  const cT0 = await getCoins(tM.id);
  const claim = await claimTowedCar(tM.id, rd[0]!.id);
  ok(claim.ok && cT0 - (claim.coins ?? 0) === towPrice, `claim towed car charged ${towPrice} (got ${cT0 - (claim.coins ?? 0)})`);
  ok((await prisma.garajCar.count({ where: { memberId: tM.id, carCode: "lacetti", soldAt: null } })) === 1, `claimed car added to garage`);
  ok(!(await claimTowedCar(tM.id, rd[0]!.id)).ok, `2nd claim → not_found (idempotent)`);
  await prisma.garajRideDrop.create({ data: { memberId: tM.id, bookingId: 991002, dropType: "TOWED_CAR", dropCode: "tahoe", seed: 650, status: "pending" } });
  const tahoe = (await getRoadDrops(tM.id)).find((x) => x.carCode === "tahoe")!;
  ok((await declineTowedCar(tM.id, tahoe.id)).ok, `decline towed offer`);
  ok((await getRoadDrops(tM.id)).every((x) => x.carCode !== "tahoe"), `declined offer no longer shown`);

  // 24. #5 Ustaxona TIMED crafting — enqueue (charges up front) → single shared slot →
  // settle (sweep) / speedup applies the effect; all pure tanga sinks.
  const xM = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-craft`, fullName: "Crafter", phone: "+998900006012", trips: 5 } });
  await grantCoins(xM.id, 80000, "manual", "seed");
  await acquireCar(xM.id, "cobalt");
  const xc = (await prisma.garajCar.findFirst({ where: { memberId: xM.id, carCode: "cobalt", soldAt: null } }))!;
  const xbase = MAKE_BASE["cobalt"]!;
  const dueNow = async (): Promise<void> => { await prisma.garajCraftJob.updateMany({ where: { memberId: xM.id, status: "in_progress" }, data: { finishesAt: new Date(Date.now() - 1000) } }); };
  const cx0 = await getCoins(xM.id);
  const tune = await garajCraft(xM.id, xc.id, "TUNE");
  ok(tune.ok && tune.queued === true && cx0 - (tune.coins ?? 0) === Math.round(xbase * 0.25 * 1), `craft TUNE: queued + charged up front (${cx0 - (tune.coins ?? 0)})`);
  ok((await prisma.garajCraftJob.count({ where: { memberId: xM.id, status: "in_progress" } })) === 1, `one in-progress craft job created`);
  ok((await prisma.garajCar.findUnique({ where: { id: xc.id } }))!.level === 1, `effect deferred — level still 1 until settle`);
  ok((await garajCraft(xM.id, xc.id, "PAINT")).reason === "workshop_busy", `single shared slot: 2nd craft blocked while busy`);
  await dueNow();
  const settledN = await settleCraftJobs();
  ok(settledN >= 1 && (await prisma.garajCar.findUnique({ where: { id: xc.id } }))!.level === 2, `settle applies TUNE: level→2 (settled ${settledN})`);
  ok((await prisma.garajCraftJob.count({ where: { memberId: xM.id, status: "in_progress" } })) === 0, `slot freed after settle`);
  await settleCraftJobs(); // idempotent
  ok((await prisma.garajCar.findUnique({ where: { id: xc.id } }))!.level === 2, `settle idempotent — no double level`);
  // speedup path — enqueue PAINT, pay a tanga sink to finish instantly
  const rqbB4Paint = (await prisma.garajCar.findUnique({ where: { id: xc.id } }))!.repairQualityBonus;
  ok((await garajCraft(xM.id, xc.id, "PAINT")).queued === true, `PAINT queued`);
  const cSpeed0 = await getCoins(xM.id);
  const sp = await garajCraftSpeedup(xM.id);
  ok(sp.ok && cSpeed0 - (sp.coins ?? 0) >= CRAFT_SPEEDUP_MIN, `speedup is a tanga sink (charged ${cSpeed0 - (sp.coins ?? 0)} ≥ ${CRAFT_SPEEDUP_MIN})`);
  ok((await prisma.garajCar.findUnique({ where: { id: xc.id } }))!.repairQualityBonus > rqbB4Paint, `speedup applied PAINT instantly`);
  ok((await prisma.garajCraftJob.count({ where: { memberId: xM.id, status: "in_progress" } })) === 0, `slot freed after speedup`);
  // RESTORE via settle → MINT
  await garajCraft(xM.id, xc.id, "RESTORE");
  await dueNow();
  await settleCraftJobs();
  ok((await prisma.garajCar.findUnique({ where: { id: xc.id } }))!.condition === "mint", `craft RESTORE via settle → MINT`);
  for (let i = 0; i < 3; i++) { await garajCraft(xM.id, xc.id, "TUNE"); await dueNow(); await settleCraftJobs(); } // 2→3→4→5
  ok((await garajCraft(xM.id, xc.id, "TUNE")).reason === "max_level", `craft TUNE blocked at level ${CRAFT_MAX_LEVEL}`);
  ok((await garajCraft(xM.id, xc.id, "XXX")).reason === "unknown_station", `craft rejects an unknown station`);

  // 25. #6 weekly event — discount_service lowers repair cost (admin override + cache reset)
  const wM = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-week`, fullName: "Weeker", phone: "+998900006013", trips: 5 } });
  await grantCoins(wM.id, 50000, "manual", "seed");
  await acquireCar(wM.id, "nexia");
  const wc = (await prisma.garajCar.findFirst({ where: { memberId: wM.id, carCode: "nexia", soldAt: null } }))!;
  await prisma.appState.upsert({ where: { key: "garaj:weekevent" }, create: { key: "garaj:weekevent", value: "discount_service" }, update: { value: "discount_service" } });
  __resetWeekEventCache();
  const wc0 = await getCoins(wM.id);
  await repairZone(wM.id, wc.id, "engine", "STD"); // STD = 80; discount → 64
  ok(wc0 - (await getCoins(wM.id)) === 64, `discount week: STD repair 80→64 (got ${wc0 - (await getCoins(wM.id))})`);
  await prisma.appState.update({ where: { key: "garaj:weekevent" }, data: { value: "xp_boost" } });
  __resetWeekEventCache();
  const wc1 = await getCoins(wM.id);
  await repairZone(wM.id, wc.id, "body", "STD"); // non-discount week → full 80
  ok(wc1 - (await getCoins(wM.id)) === 80, `non-discount week: STD repair full 80 (got ${wc1 - (await getCoins(wM.id))})`);

  // 26. #8 Exhibition — submit, vote (self/double blocked), settle picks winner (idempotent, ≥2 gate)
  const eM = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-exA`, fullName: "Exhibitor A", phone: "+998900006014", trips: 5 } });
  const fM = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-exB`, fullName: "Exhibitor B", phone: "+998900006015", trips: 5 } });
  const gM = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-exC`, fullName: "Voter C", phone: "+998900006016", trips: 5 } });
  for (const mm of [eM, fM, gM]) await grantCoins(mm.id, 50000, "manual", "seed");
  await acquireCar(eM.id, "tahoe");
  await acquireCar(fM.id, "malibu");
  const ec = (await prisma.garajCar.findFirst({ where: { memberId: eM.id, carCode: "tahoe", soldAt: null } }))!;
  const fc = (await prisma.garajCar.findFirst({ where: { memberId: fM.id, carCode: "malibu", soldAt: null } }))!;
  ok((await exhibitionSubmit(eM.id, ec.id)).ok && (await exhibitionSubmit(fM.id, fc.id)).ok, `exhibition: 2 entries submitted`);
  const eEntry = (await prisma.garajExhibitionEntry.findFirst({ where: { memberId: eM.id } }))!;
  const fEntry = (await prisma.garajExhibitionEntry.findFirst({ where: { memberId: fM.id } }))!;
  const wk = eEntry.weekKey;
  ok((await exhibitionVote(eM.id, eEntry.id)).reason === "self_vote", `exhibition: self-vote blocked`);
  ok((await exhibitionVote(gM.id, eEntry.id)).ok && (await exhibitionVote(fM.id, eEntry.id)).ok, `exhibition: 2 votes for entry A`);
  ok((await exhibitionVote(gM.id, fEntry.id)).reason === "already_voted", `exhibition: one vote per member per week`);
  ok((await prisma.garajExhibitionEntry.findUnique({ where: { id: eEntry.id } }))!.votes === 2, `exhibition: vote count = 2`);
  const eBal0 = (await prisma.member.findUnique({ where: { id: eM.id } }))!.coins;
  ok((await settleExhibition(wk)) === true, `exhibition: settle pays the winner`);
  ok((await prisma.member.findUnique({ where: { id: eM.id } }))!.coins === eBal0 + 1000, `exhibition: winner +1000 prize`);
  ok((await settleExhibition(wk)) === false && (await prisma.member.findUnique({ where: { id: eM.id } }))!.coins === eBal0 + 1000, `exhibition: re-settle idempotent (no double prize)`);
  ok((await settleExhibition("2099-W01")) === false, `exhibition: <2 entries → no prize (no solo farming)`);

  // 27. #9 Museum — collection (ever-owned models) + records (read-only)
  const museum = await getMuseum(m.id);
  ok(museum.totalModels === 11 && museum.collectedCount >= 3, `museum: collection counted (${museum.collectedCount}/${museum.totalModels})`);
  ok(museum.collection.some((c) => c.carCode === "nexia" && c.owned) && museum.totalFlips >= 1 && museum.bestProfit > 0, `museum: owned models + flip records (flips ${museum.totalFlips}, best ${museum.bestProfit})`);

  // 28. 🌍 MOTOR OLAMI — serial + accrual (gross−fuel−wear) + time-cap + lifespan + public profile
  await setFeature("motorolami", true);
  __resetFeatureCache();
  const moM = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-motor`, fullName: "Motorchi", phone: "+998900006016", trips: 5 } });
  await grantCoins(moM.id, 50000, "manual", "seed");
  ok((await acquireCar(moM.id, "nexia")).ok, `motor: acquire ok`);
  const moCar = (await prisma.garajCar.findFirst({ where: { memberId: moM.id, carCode: "nexia", soldAt: null } }))!;
  const moSpeed = motorSpeed("nexia");
  ok(moCar.serial != null && moCar.serial >= 1001, `motor: global #serial assigned (#${moCar.serial})`);
  ok(moCar.engineHp === 100 && moCar.bornAt != null, `motor: engineHp 100 + bornAt set on acquire`);
  // accrual: backdate 10h → collect → gross = speed×10, only NET credited, fuel+wear are sink
  await prisma.garajCar.update({ where: { id: moCar.id }, data: { lastAccrualAt: new Date(Date.now() - 10 * 3600 * 1000) } });
  const moC0 = await getCoins(moM.id);
  const col = await motorCollect(moM.id);
  ok(col.ok && col.gross === moSpeed * 10, `motor: gross = speed×10h (${col.gross})`);
  ok((col.net ?? 0) > 0 && (col.fuel ?? 0) + (col.wear ?? 0) > (col.net ?? 0) && (col.net ?? 0) < (col.gross ?? 0), `motor: fuel+wear sink → net<gross (net ${col.net})`);
  ok((await getCoins(moM.id)) - moC0 === (col.net ?? 0), `motor: ONLY net credited (${col.net}) — gross not minted`);
  // idempotent / no-time: immediate re-collect ~0
  ok(((await motorCollect(moM.id)).net ?? 0) < 5, `motor: immediate re-collect ~0 (no time / idempotent)`);
  // time-cap: backdate 100h → gross capped at MOTOR_MAX_ACCRUE_HOURS
  await prisma.garajCar.update({ where: { id: moCar.id }, data: { lastAccrualAt: new Date(Date.now() - 100 * 3600 * 1000) } });
  ok((await motorCollect(moM.id)).gross === moSpeed * MOTOR_MAX_ACCRUE_HOURS, `motor: accrual capped at ${MOTOR_MAX_ACCRUE_HOURS}h`);
  // lifespan: engineHp 0 → dead → earns 0
  await prisma.garajCar.update({ where: { id: moCar.id }, data: { engineHp: 0, lastAccrualAt: new Date(Date.now() - 10 * 3600 * 1000) } });
  const colDead = await motorCollect(moM.id);
  ok(colDead.dead === true && colDead.net === 0, `motor: dead car (engineHp 0) earns 0`);
  // public profile
  const prof = await getPublicProfile(moM.id, moM.id);
  ok(prof != null && prof.cars.some((c) => c.serial === moCar.serial) && prof.garageValue > 0, `motor: public profile shows #serial + garageValue`);
  // 🎛 admin economy control — out-of-range CLAMPED; speedMult applied to earnings
  await setMotorEcon("fuelMult", 99);
  ok((await getMotorEcon()).fuelMult === 2, `econ: fuelMult clamped to max (admin can't break it)`);
  await setMotorEcon("speedMult", 0.5);
  await prisma.garajCar.update({ where: { id: moCar.id }, data: { engineHp: 100, lastAccrualAt: new Date(Date.now() - 10 * 3600 * 1000) } });
  ok((await motorCollect(moM.id)).gross === Math.round(moSpeed * 0.5) * 10, `econ: speedMult 0.5 halves earnings (admin earn-dial works)`);
  await setMotorEcon("fuelMult", 1);
  await setMotorEcon("speedMult", 1);
  // 🎁 BONUS HAFTASI — admin-tunable per-player onboard hook
  // (a) bonusDays=0 (OFF default) → new acquire does NOT stamp
  await setMotorEcon("bonusDays", 0);
  const bM0 = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-bonusoff`, fullName: "BonusOff", phone: "+998900006017", trips: 5 } });
  await grantCoins(bM0.id, 50000, "manual", "seed");
  await acquireCar(bM0.id, "tiko");
  ok((await prisma.memberGarajMeta.findUnique({ where: { memberId: bM0.id }, select: { motorBonusUntilAt: true } }))?.motorBonusUntilAt == null, `bonus: bonusDays=0 → no stamp (OFF)`);
  ok((await getMotorBonusFor(bM0.id)).active === false, `bonus: not active when no stamp`);
  // (b) bonusDays=7 → new acquire stamps + motorCollect yields ~2× net (default bonusSpeedMult=2)
  await setMotorEcon("bonusDays", 7);
  await setMotorEcon("bonusFuelMult", 0.3);
  await setMotorEcon("bonusSpeedMult", 2);
  const bM1 = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-bonuson`, fullName: "BonusOn", phone: "+998900006018", trips: 5 } });
  await grantCoins(bM1.id, 50000, "manual", "seed");
  await acquireCar(bM1.id, "nexia");
  const bMeta = await prisma.memberGarajMeta.findUnique({ where: { memberId: bM1.id }, select: { motorBonusUntilAt: true } });
  ok(bMeta?.motorBonusUntilAt != null && bMeta.motorBonusUntilAt.getTime() > Date.now() + 6 * 86_400_000, `bonus: bonusDays=7 → stamped ~7d ahead`);
  const bView = await getMotorBonusFor(bM1.id);
  ok(bView.active === true && bView.daysLeft >= 6 && bView.daysLeft <= 7, `bonus: active + ${bView.daysLeft} days left`);
  // earn check: bonus 2× speed + 0.3 fuel → gross 2×, net higher than normal
  const bCar = (await prisma.garajCar.findFirst({ where: { memberId: bM1.id, carCode: "nexia", soldAt: null } }))!;
  await prisma.garajCar.update({ where: { id: bCar.id }, data: { lastAccrualAt: new Date(Date.now() - 10 * 3600 * 1000) } });
  const bColB = await motorCollect(bM1.id);
  const bonusSpeed = Math.round(motorSpeed("nexia") * 2);
  ok(bColB.gross === bonusSpeed * 10, `bonus: gross uses bonus speed (${bColB.gross} == ${bonusSpeed * 10})`);
  ok((bColB.net ?? 0) > (col.net ?? 0), `bonus: net > non-bonus baseline (${bColB.net} > ${col.net})`);
  // (c) bonus is ONE-SHOT: re-buying does NOT re-stamp
  const prevUntil = bMeta!.motorBonusUntilAt;
  await prisma.garajCar.update({ where: { id: bCar.id }, data: { soldAt: new Date() } });
  await acquireCar(bM1.id, "nexia");
  const bMeta2 = await prisma.memberGarajMeta.findUnique({ where: { memberId: bM1.id }, select: { motorBonusUntilAt: true } });
  ok(bMeta2?.motorBonusUntilAt?.getTime() === prevUntil!.getTime(), `bonus: re-buy does NOT re-stamp (one-shot per player)`);
  // (d) expired bonus → active=false, normal earnings
  await prisma.memberGarajMeta.update({ where: { memberId: bM1.id }, data: { motorBonusUntilAt: new Date(Date.now() - 60_000) } });
  ok((await getMotorBonusFor(bM1.id)).active === false, `bonus: expired → active=false`);
  await setMotorEcon("bonusDays", 0);
  await setMotorEcon("bonusFuelMult", 0.3);
  await setMotorEcon("bonusSpeedMult", 2);
  await setFeature("motorolami", false);
  __resetFeatureCache();

  // 20. W5 ledger invariant across all new members (every grant is a real CoinTxn)
  for (const mm of [sM, cM, bM, oM, tM, xM, wM, eM, fM, gM, moM, bM0, bM1]) {
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
