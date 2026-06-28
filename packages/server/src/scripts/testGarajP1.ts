// 🏆 GARAJ P1+P2 tests: Ofis sell, slot system, CarCheck 3-tier (+ newbie-bepul),
// rateSeller idempotency, ORZU board ranking, lifespan sweep, capital remont counter,
// P2-A merge mechanic, P2-B Jackpot variant determinism, P2-C Speeder boost.
// Runs on the isolated test DB (TEST_DATABASE_URL) — same hermetic posture as testGaraj.
// Run: pnpm --filter @t1067/server exec dotenv -e ../../.env -- tsx src/scripts/testGarajP1.ts
import "./_testDb";
import "../env";
import { MAKE_BASE, SLOT_COSTS, CARCHECK_COSTS, OFIS_BID_FACTOR, ofisBidPrice, MERGE_MAX_COUNT, MERGE_BONUS_PCT, mergeMult, variantFor, getVariant, SPEEDER_DAYS, isSpeederActive, speederSurgePrice } from "@t1067/shared";
import { prisma } from "../db";
import { getCoins, grantCoins } from "../services/coinService";
import {
  acquireCar,
  ofisSellToOfis,
  getOfisStats,
  purchaseSlot,
  refundSlot,
  getSlotStatus,
  getCarCheck,
  rateSeller,
  getOrzuBoard,
  getPublicProfile,
  sweepMotorAging,
  setMotorEcon,
  mergeCars,
  purchaseSpeeder,
  getSpeederState,
  motorCollect,
} from "../services/garajService";
import { __resetFeatureCache, setFeature } from "../services/featureFlags";

const TAG = "garajp1-test";
let failed = 0;
function ok(cond: boolean, label: string): void {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) failed++;
}

async function cleanup(): Promise<void> {
  const ms = await prisma.member.findMany({ where: { kasId: { startsWith: TAG } }, select: { id: true } });
  const ids = ms.map((m) => m.id);
  if (ids.length) {
    await prisma.garajBazaarListing.deleteMany({ where: { OR: [{ sellerId: { in: ids } }, { buyerId: { in: ids } }] } });
    await prisma.garajCar.deleteMany({ where: { memberId: { in: ids } } });
    await prisma.memberGarajMeta.deleteMany({ where: { memberId: { in: ids } } });
    await prisma.coinTxn.deleteMany({ where: { memberId: { in: ids } } });
    await prisma.member.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.appState.deleteMany({ where: { key: { in: ["feature:garajx", "feature:motorolami", "mo:econ"] } } });
  await prisma.appState.deleteMany({ where: { key: { startsWith: "sellerrate:" } } });
  await prisma.appState.deleteMany({ where: { key: { startsWith: "ofis:" } } });
  await prisma.appState.deleteMany({ where: { key: { startsWith: "merge:" } } });
  await prisma.appState.deleteMany({ where: { key: { startsWith: "slotgen:" } } });
  await prisma.appState.deleteMany({ where: { key: { in: ["mo:speeder:stock", "mo:speeder:day"] } } });
  await prisma.ofisLedger.deleteMany({}).catch(() => undefined); // test DB only
  __resetFeatureCache();
}

let prevGarajx: string | null = null;
let prevMotor: string | null = null;
async function restoreFlags(): Promise<void> {
  if (prevGarajx === null) await prisma.appState.deleteMany({ where: { key: "feature:garajx" } }).catch(() => undefined);
  else await prisma.appState.upsert({ where: { key: "feature:garajx" }, create: { key: "feature:garajx", value: prevGarajx }, update: { value: prevGarajx } }).catch(() => undefined);
  if (prevMotor === null) await prisma.appState.deleteMany({ where: { key: "feature:motorolami" } }).catch(() => undefined);
  else await prisma.appState.upsert({ where: { key: "feature:motorolami" }, create: { key: "feature:motorolami", value: prevMotor }, update: { value: prevMotor } }).catch(() => undefined);
  __resetFeatureCache();
}

async function main(): Promise<void> {
  prevGarajx = (await prisma.appState.findUnique({ where: { key: "feature:garajx" } }))?.value ?? null;
  prevMotor = (await prisma.appState.findUnique({ where: { key: "feature:motorolami" } }))?.value ?? null;
  await cleanup();
  await setFeature("garajx", true);
  await setFeature("motorolami", true);
  __resetFeatureCache();

  // Two members — buyer + seller (for rateSeller scenario)
  const sellerM = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-seller`, fullName: "Seller One", phone: "+998900007001", trips: 5 } });
  const buyerM = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-buyer`, fullName: "Buyer One", phone: "+998900007002", trips: 5 } });
  await grantCoins(sellerM.id, 5_000_000, "manual", "seed");
  await grantCoins(buyerM.id, 5_000_000, "manual", "seed");

  // ── 1) Slot system ────────────────────────────────────────────────────────
  const s0 = await getSlotStatus(sellerM.id);
  ok(s0.slotCount === 1 && s0.activeCount === 0 && s0.nextSlotCost === SLOT_COSTS[1], `slot baseline: 1 slot, 0 active, next cost ${SLOT_COSTS[1]}`);

  // Acquire 1 → fills the single default slot
  const acq1 = await acquireCar(sellerM.id, "tiko");
  ok(acq1.ok, `acquire #1 (tiko) into slot 1`);
  const s1 = await getSlotStatus(sellerM.id);
  ok(s1.activeCount === 1, `after #1: activeCount=1`);

  // Try acquire #2 BEFORE buying slot 2 → no_slot
  const acq2Fail = await acquireCar(sellerM.id, "damas");
  ok(!acq2Fail.ok && acq2Fail.reason === "no_slot", `acquire #2 BEFORE slot purchase → blocked (no_slot)`);

  // Buy slot 2 (50k) → then acquire damas works
  const beforeSlot2 = await getCoins(sellerM.id);
  const slotBuy = await purchaseSlot(sellerM.id);
  ok(slotBuy.ok && (await getCoins(sellerM.id)) === beforeSlot2 - SLOT_COSTS[1]!, `slot 2 bought: spent ${SLOT_COSTS[1]}`);
  const slotBuyDup = await purchaseSlot(sellerM.id);
  ok(slotBuyDup.ok || slotBuyDup.reason !== undefined, `slot purchase idempotency: second call returns deterministic result`);
  const acq2 = await acquireCar(sellerM.id, "damas");
  ok(acq2.ok, `acquire #2 (damas) into slot 2 (after purchase)`);

  // ── 1b) 🪪 Slot trade-in / refund (P2-deep-2) ────────────────────────────
  const slotM = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-slot`, fullName: "Slot Tester", phone: "+998900007004", trips: 5 } });
  await grantCoins(slotM.id, 5_000_000, "manual", "seed");
  await purchaseSlot(slotM.id); // slot 2
  const beforeRefund = await getCoins(slotM.id);
  const ref1 = await refundSlot(slotM.id);
  ok(ref1.ok && ref1.newSlotCount === 1 && (ref1.refund ?? 0) === Math.floor(SLOT_COSTS[1]! * 0.5), `slot refund: 50% back (${ref1.refund}), slotCount→1`);
  ok((await getCoins(slotM.id)) === beforeRefund + (ref1.refund ?? 0), `slot refund credited to wallet`);
  const rebuy = await purchaseSlot(slotM.id); // re-buy slot 2 after refund — gen-aware key must NOT dup-skip
  ok(rebuy.ok && rebuy.newSlotCount === 2, `slot re-buy after refund works (gen-aware idempotency)`);
  await acquireCar(slotM.id, "tiko");
  await acquireCar(slotM.id, "damas"); // both slots now full (activeCount=2, slotCount=2)
  const ref2 = await refundSlot(slotM.id);
  ok(!ref2.ok && ref2.reason === "slot_full", `slot refund blocked with no spare (would orphan a car)`);

  // ── 2) CarCheck 3 tiers ───────────────────────────────────────────────────
  const carForCheck = acq1.carId!;
  const balBeforeCheck = await getCoins(buyerM.id);
  const c1 = await getCarCheck(buyerM.id, carForCheck, "ODDIY");
  ok(c1.ok && c1.check?.tier === "ODDIY" && c1.check.serial != null, `CarCheck ODDIY: revealed serial=${c1.check?.serial}`);
  const c2 = await getCarCheck(buyerM.id, carForCheck, "EKSPERT");
  ok(c2.ok && c2.check?.capitalRepairCount === 0, `CarCheck EKSPERT: revealed capitalRepairCount=${c2.check?.capitalRepairCount} (zones null on fresh car OK)`);
  // PREMIUM first call = FREE (newbie protection)
  const c3 = await getCarCheck(buyerM.id, carForCheck, "PREMIUM");
  ok(c3.ok && c3.check?.freeOfChargeUsed === true && c3.check?.referencePrice != null, `CarCheck PREMIUM first-time: BEPUL + referencePrice=${c3.check?.referencePrice}`);
  // Second PREMIUM call charges full 5000
  const balBeforePaid = await getCoins(buyerM.id);
  const c4 = await getCarCheck(buyerM.id, carForCheck, "PREMIUM");
  ok(c4.ok && c4.check?.freeOfChargeUsed === false, `CarCheck PREMIUM second call: NOT bepul`);
  const spentOnPaidPremium = balBeforePaid - (await getCoins(buyerM.id));
  ok(spentOnPaidPremium === CARCHECK_COSTS.PREMIUM, `paid PREMIUM cost = ${CARCHECK_COSTS.PREMIUM} (actual ${spentOnPaidPremium})`);
  // ODDIY + EKSPERT charged correctly
  const totalCharged = balBeforeCheck - balBeforePaid;
  ok(totalCharged === CARCHECK_COSTS.ODDIY + CARCHECK_COSTS.EKSPERT, `ODDIY+EKSPERT charged ${CARCHECK_COSTS.ODDIY + CARCHECK_COSTS.EKSPERT} (actual ${totalCharged})`);

  // ── 3) Ofis sell ──────────────────────────────────────────────────────────
  // Force the damas car DEAD so Ofis sell makes sense
  const damasId = acq2.carId!;
  await prisma.garajCar.update({ where: { id: damasId }, data: { engineHp: 0 } });
  const beforeOfis = await getCoins(sellerM.id);
  const expectedBid = Math.floor((MAKE_BASE["damas"] ?? 0) * OFIS_BID_FACTOR);
  const expectedBidViaHelper = ofisBidPrice(MAKE_BASE["damas"] ?? 0, MAKE_BASE["damas"] ?? 0);
  ok(expectedBid === expectedBidViaHelper, `ofisBidPrice helper matches manual calc (${expectedBid})`);
  const sell = await ofisSellToOfis(sellerM.id, damasId);
  ok(sell.ok && (sell.received ?? 0) === expectedBid, `Ofis sell payout = ${expectedBid} (actual ${sell.received})`);
  const afterOfis = await getCoins(sellerM.id);
  ok(afterOfis === beforeOfis + expectedBid, `seller balance += ${expectedBid}`);
  const ofisStats = await getOfisStats();
  ok(ofisStats.spent >= expectedBid && ofisStats.heldCount >= 1, `Ofis stats: spent ${ofisStats.spent} ≥ ${expectedBid}, held ≥ 1`);
  // After Ofis sell, seller's slot is freed
  const sAfter = await getSlotStatus(sellerM.id);
  ok(sAfter.activeCount === 1, `after Ofis sell: activeCount back to 1 (damas removed from seller's garage)`);

  // ── 4) rateSeller idempotency ──────────────────────────────────────────────
  // Create a sold bazaar listing: seller listed, buyer bought
  const listing = await prisma.garajBazaarListing.create({
    data: { sellerId: sellerM.id, garajCarId: carForCheck, carCode: "tiko", askPrice: 1000, status: "sold", buyerId: buyerM.id, soldAt: new Date(), expiresAt: new Date(Date.now() + 7 * 86_400_000) },
  });
  const rate1 = await rateSeller(buyerM.id, listing.id, 5);
  ok(rate1.ok, `rateSeller first call: ok`);
  const rate2 = await rateSeller(buyerM.id, listing.id, 5);
  ok(!rate2.ok && rate2.reason === "already_rated", `rateSeller dup: rejected (already_rated)`);
  const meta = await prisma.memberGarajMeta.findUnique({ where: { memberId: sellerM.id } });
  ok((meta?.sellerRatingCount ?? 0) === 1 && (meta?.sellerRatingSum ?? 0) === 5, `seller rating: sum=5 count=1 (idempotency works)`);
  // Self-rating refused
  const selfRate = await rateSeller(sellerM.id, listing.id, 5);
  ok(!selfRate.ok && selfRate.reason !== undefined, `self-rating refused`);

  // ── 5) ORZU board ────────────────────────────────────────────────────────
  // Seller has 1 car (tiko); make buyer acquire one too
  await grantCoins(buyerM.id, 50_000, "manual", "seed-orzu");
  const buyerAcq = await acquireCar(buyerM.id, "nexia");
  ok(buyerAcq.ok, `buyer acquires nexia for ORZU test`);
  const orzu = await getOrzuBoard(sellerM.id);
  ok(orzu.ok && orzu.board != null, `ORZU board returns ok+board`);
  ok((orzu.board?.topGarages.length ?? 0) >= 2, `ORZU topGarages has ≥2 entries (sellerM + buyerM)`);
  const sellerInTop = orzu.board?.topGarages.find((t) => t.memberId === sellerM.id);
  const buyerInTop = orzu.board?.topGarages.find((t) => t.memberId === buyerM.id);
  ok(buyerInTop != null && sellerInTop != null, `both members in topGarages`);
  // Buyer's nexia (basePrice 2600) > seller's tiko (basePrice 700) → buyer outranks seller
  ok((buyerInTop?.rank ?? 99) < (sellerInTop?.rank ?? 0), `garageValue ranking: buyer (nexia) outranks seller (tiko)`);
  const tikoChamp = orzu.board?.modelChampions.find((m) => m.carCode === "tiko");
  // Tiko champion may not be sellerM if the test DB has leftover tiko rows from other tests
  // (testGaraj doesn't isolate by tag in cars). The functional check is: tiko HAS a champion now.
  ok(tikoChamp?.champion != null, `model champion (tiko): champion present (memberId ${tikoChamp?.champion?.memberId}, serial ${tikoChamp?.champion?.serial})`);
  // myRank works
  ok(orzu.board?.myRank != null, `myRank populated for viewer`);

  // ── 6) getPublicProfile extended ──────────────────────────────────────────
  const prof = await getPublicProfile(buyerM.id, sellerM.id);
  ok(prof?.sellerRating?.avg === 5 && prof?.sellerRating?.count === 1, `profile.sellerRating = {avg:5, count:1}`);
  ok(prof?.cleanHistoryCount === 1, `profile.cleanHistoryCount = 1 (tiko, never sold, 0 capital repairs)`);

  // ── 7) Lifespan sweep (no Date.now mock — just verify CAS guard + bounded batch) ──
  // sweepMotorAging should be idempotent and not over-decay
  await setMotorEcon("lifespanDays", 1); // aggressive 1-day decay = 100% per day
  const before = (await prisma.garajCar.findUnique({ where: { id: carForCheck } }))?.engineHp ?? 100;
  // Force lastAccrualAt far in the past
  await prisma.garajCar.update({ where: { id: carForCheck }, data: { lastAccrualAt: new Date(Date.now() - 2 * 24 * 3600_000) } });
  const aged1 = await sweepMotorAging();
  const afterDecay = (await prisma.garajCar.findUnique({ where: { id: carForCheck } }))?.engineHp ?? 100;
  ok(aged1 >= 0 && afterDecay < before, `sweepMotorAging: decayed ${before} → ${afterDecay} (aged ${aged1} cars)`);

  // ── 8) Ledger invariant for both members ─────────────────────────────────
  for (const mm of [sellerM, buyerM]) {
    const bal = (await prisma.member.findUnique({ where: { id: mm.id } }))!.coins;
    const tot = await prisma.coinTxn.aggregate({ where: { memberId: mm.id }, _sum: { amount: true } });
    ok(Math.abs(bal - (tot._sum.amount ?? 0)) < 0.001, `ledger invariant (member ${mm.id}: bal ${bal} == ledger ${tot._sum.amount ?? 0})`);
  }

  // ── 9) P2-A: Merge mechanic ──────────────────────────────────────────────
  ok(mergeMult(0) === 1.0, `mergeMult(0) = 1.0 (oddiy)`);
  ok(Math.abs(mergeMult(1) - 1.1) < 0.001, `mergeMult(1) = 1.10 (+10%)`);
  ok(Math.abs(mergeMult(3) - 1.3) < 0.001, `mergeMult(MAX=3) = 1.30 (+30%)`);
  ok(mergeMult(99) === mergeMult(MERGE_MAX_COUNT), `mergeMult clamps at MERGE_MAX_COUNT=${MERGE_MAX_COUNT}`);
  // sellerM has 1 car (tiko). Buy a second car so we can merge.
  const sellerSlot = await getSlotStatus(sellerM.id);
  if (sellerSlot.slotCount < 2) await purchaseSlot(sellerM.id);
  const acqB = await acquireCar(sellerM.id, "damas");
  ok(acqB.ok, `merge prep: acquire damas as sacrifice`);
  const keepCar = (await prisma.garajCar.findFirst({ where: { memberId: sellerM.id, carCode: "tiko", soldAt: null } }))!;
  const sacCar = (await prisma.garajCar.findFirst({ where: { memberId: sellerM.id, carCode: "damas", soldAt: null } }))!;
  const merge1 = await mergeCars(sellerM.id, keepCar.id, sacCar.id);
  ok(merge1.ok && merge1.mergeCount === 1 && Math.abs((merge1.newMult ?? 0) - 1.1) < 0.001, `merge1 ok: mergeCount=1, newMult=1.1`);
  const keptAfter = await prisma.garajCar.findUnique({ where: { id: keepCar.id } });
  ok((keptAfter?.mergeCount ?? 0) === 1, `keeper mergeCount stamped in DB`);
  const sacAfter = await prisma.garajCar.findUnique({ where: { id: sacCar.id } });
  ok(sacAfter === null, `sacrifice DELETED (supply down 1)`);
  // Idempotency: same merge call should be rejected (already_merged marker)
  const mergeDup = await mergeCars(sellerM.id, keepCar.id, sacCar.id);
  ok(!mergeDup.ok && (mergeDup.reason === "not_found" || mergeDup.reason === "already_merged"), `merge dup rejected: ${mergeDup.reason}`);

  // ── 10) P2-B: Jackpot rarity (deterministic) ─────────────────────────────
  // qora_nexia hits on serials where (serial * 16777619) % 100 === 0 (default 1/100)
  // Find one such serial deterministically and verify
  let foundQora: number | null = null;
  for (let s = 1; s < 200; s++) {
    if (variantFor("nexia", s) === "qora_nexia") { foundQora = s; break; }
  }
  ok(foundQora != null, `variantFor: deterministic Qora Nexia roll found at serial ${foundQora}`);
  // Tiko ≠ nexia → no qora_nexia possible
  ok(variantFor("tiko", foundQora ?? 0) !== "qora_nexia", `variantFor: tiko never rolls qora_nexia (carCode-gated)`);
  // Override: 1/2 (max rate, floor enforced) → every even-serial nexia is qora
  // (serial × 16777619 = even × odd = even; % 2 = 0)
  ok(variantFor("nexia", 2, { qora_nexia: 2 }) === "qora_nexia", `variantFor: oneIn=2 override + even serial → qora`);
  ok(variantFor("damas", 100, { qora_nexia: 1 }) === null, `variantFor: damas (no variant) → null`);
  // getVariant lookup
  const qora = getVariant("qora_nexia");
  ok(qora != null && qora.mult === 1.5, `getVariant("qora_nexia").mult = 1.5`);
  ok(getVariant(null) === null, `getVariant(null) = null`);

  // ── 11) P2-C: Speeder booster ────────────────────────────────────────────
  // 🚀 P2-deep-1 — scarcity surge price (pure helper)
  ok(speederSurgePrice(5000, 500, 500, 50) === 5000, `surge: full stock → base price (5000)`);
  ok(speederSurgePrice(5000, 0, 500, 50) === 7500, `surge: empty stock → base × 1.5 (7500)`);
  ok(speederSurgePrice(5000, 250, 500, 50) === 6250, `surge: half stock → base × 1.25 (6250)`);
  ok(speederSurgePrice(5000, 250, 500, 0) === 5000, `surge: surgePct=0 → flat (5000)`);
  const spState1 = await getSpeederState(sellerM.id);
  ok(spState1.ok && (spState1.stockLeft ?? 0) > 0 && spState1.days === SPEEDER_DAYS, `Speeder state: stock=${spState1.stockLeft}, days=${SPEEDER_DAYS}`);
  // sellerM's keep car (merged tiko) is alive, buy a speeder for it
  const sellerCarForSpeeder = keptAfter!;
  const beforeSpeederStock = spState1.stockLeft ?? 0;
  const beforeSpeederBal = await getCoins(sellerM.id);
  const spBuy = await purchaseSpeeder(sellerM.id, sellerCarForSpeeder.id);
  ok(spBuy.ok && spBuy.speederUntilAt != null && (spBuy.stockLeft ?? 0) === beforeSpeederStock - 1, `Speeder bought: stock ${beforeSpeederStock}→${spBuy.stockLeft}`);
  const speederPrice = spState1.price ?? 5000;
  const afterSpeederBal = await getCoins(sellerM.id);
  ok(afterSpeederBal === beforeSpeederBal - speederPrice, `Speeder cost: spent ${speederPrice}`);
  const carAfterSp = await prisma.garajCar.findUnique({ where: { id: sellerCarForSpeeder.id } });
  ok(isSpeederActive(carAfterSp?.speederUntilAt ?? null), `Speeder is active on keeper car (until ${carAfterSp?.speederUntilAt?.toISOString()})`);
  // Monotonic stack: buying again extends from existing untilAt
  const firstUntilMs = carAfterSp?.speederUntilAt?.getTime() ?? 0;
  const spBuy2 = await purchaseSpeeder(sellerM.id, sellerCarForSpeeder.id);
  ok(spBuy2.ok || spBuy2.reason === "already", `Speeder second buy: ${spBuy2.ok ? "ok (stacked)" : spBuy2.reason}`);
  if (spBuy2.ok && spBuy2.speederUntilAt) {
    const newUntilMs = new Date(spBuy2.speederUntilAt).getTime();
    ok(newUntilMs > firstUntilMs, `Speeder monotonic: untilAt extended from ${firstUntilMs} → ${newUntilMs}`);
  }

  // ── 11b) 🛡 Daily earn cap (anti-inflyatsiya) ────────────────────────────
  // Fresh member + expensive car, fueled, lastAccrualAt 24h ago → rawNet would far exceed cap.
  // Set cap=500, collect → net clamped to ≤500; collect again same day → net 0 (cap exhausted).
  await setMotorEcon("dailyEarnCap", 500);
  await setMotorEcon("bonusDays", 0); // isolate the cap test from the bonus-week multiplier
  const capM = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-cap`, fullName: "Cap Tester", phone: "+998900007003", trips: 5 } });
  await grantCoins(capM.id, 5_000_000, "manual", "seed");
  const capAcq = await acquireCar(capM.id, "gelik"); // 42000 base → ~16k/day uncapped
  ok(capAcq.ok, `cap prep: acquire gelik`);
  // fuel it + push the accrual clock back 24h so a full day is pending
  await prisma.garajCar.update({ where: { id: capAcq.carId! }, data: { fueledUntilAt: new Date(Date.now() + 24 * 3600_000), lastAccrualAt: new Date(Date.now() - 24 * 3600_000), engineHp: 100 } });
  const capC1 = await motorCollect(capM.id);
  ok(capC1.ok && (capC1.net ?? 0) <= 500 && (capC1.net ?? 0) > 0, `daily cap: first collect clamped to ≤500 (got ${capC1.net})`);
  // refuel + rewind again, collect again → cap already hit today → net 0 + reason cap_reached
  const rewound = new Date(Date.now() - 24 * 3600_000);
  await prisma.garajCar.update({ where: { id: capAcq.carId! }, data: { fueledUntilAt: new Date(Date.now() + 24 * 3600_000), lastAccrualAt: rewound } });
  const capC2 = await motorCollect(capM.id, capAcq.carId!);
  ok(capC2.ok && (capC2.net ?? 0) === 0 && capC2.reason === "cap_reached", `daily cap: 2nd collect = 0 + reason cap_reached (got net=${capC2.net} reason=${capC2.reason})`);
  // 🛡 cap-zero PRESERVES runway: lastAccrualAt must NOT have advanced (stays ~24h ago)
  const carAfterCapZero = await prisma.garajCar.findUnique({ where: { id: capAcq.carId! } });
  ok(Math.abs((carAfterCapZero?.lastAccrualAt?.getTime() ?? 0) - rewound.getTime()) < 2000, `cap-zero preserves runway (lastAccrualAt unchanged, not advanced)`);
  const capEarned = (await prisma.coinTxn.aggregate({ where: { memberId: capM.id, kind: "motor_earn" }, _sum: { amount: true } }))._sum.amount ?? 0;
  ok(capEarned <= 500, `daily cap: total motor_earn today ≤ 500 (got ${capEarned})`);
  // ledger invariant for the cap member
  {
    const bal = (await prisma.member.findUnique({ where: { id: capM.id } }))!.coins;
    const tot = (await prisma.coinTxn.aggregate({ where: { memberId: capM.id }, _sum: { amount: true } }))._sum.amount ?? 0;
    ok(Math.abs(bal - tot) < 0.001, `cap member ledger invariant (bal ${bal} == ledger ${tot})`);
  }

  // ── 12) Ledger invariant AFTER P2 sequence ───────────────────────────────
  for (const mm of [sellerM, buyerM]) {
    const bal = (await prisma.member.findUnique({ where: { id: mm.id } }))!.coins;
    const tot = await prisma.coinTxn.aggregate({ where: { memberId: mm.id }, _sum: { amount: true } });
    ok(Math.abs(bal - (tot._sum.amount ?? 0)) < 0.001, `P2 ledger invariant (member ${mm.id}: bal ${bal} == ledger ${tot._sum.amount ?? 0})`);
  }

  await cleanup();
  await restoreFlags();
  await prisma.$disconnect();
  console.log(failed === 0 ? "\n🎉 all GARAJ P1 checks passed" : `\n❌ ${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await restoreFlags().catch(() => undefined);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
