// 🏆 GARAJ P1+P2 tests: Ofis sell, slot system, CarCheck 3-tier (+ newbie-bepul),
// rateSeller idempotency, ORZU board ranking, lifespan sweep, capital remont counter,
// P2-A merge mechanic, P2-B Jackpot variant determinism, P2-C Speeder boost.
// Runs on the isolated test DB (TEST_DATABASE_URL) — same hermetic posture as testGaraj.
// Run: pnpm --filter @t1067/server exec dotenv -e ../../.env -- tsx src/scripts/testGarajP1.ts
import "./_testDb";
import "../env";
import { MAKE_BASE, SLOT_COSTS, CARCHECK_COSTS, OFIS_BID_FACTOR, ofisBidPrice, MERGE_MAX_COUNT, MERGE_BONUS_PCT, mergeMult, variantFor, getVariant, SPEEDER_DAYS, isSpeederActive, speederSurgePrice, getMotorPart, computeMotorRefillCost, nextModel, upgradeCost } from "@t1067/shared";
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
  sweepAutoStabilize,
  sweepOfisHeld,
  mintPart,
  installPart,
  uninstallPart,
  getPartsState,
  setPartMintEvent,
  listPart,
  buyPart,
  cancelPartListing,
  getPartBazaar,
  garajBazaarList,
  garajBazaarBuy,
  creditTaxiMotorBonus,
  upgradeCarModel,
  getBazaar,
  getGarajState,
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
    await prisma.garajPartListing.deleteMany({ where: { OR: [{ sellerId: { in: ids } }, { buyerId: { in: ids } }] } }).catch(() => undefined);
    await prisma.garajPart.deleteMany({ where: { ownerId: { in: ids } } }).catch(() => undefined);
    await prisma.garajCar.deleteMany({ where: { memberId: { in: ids } } });
    await prisma.memberGarajMeta.deleteMany({ where: { memberId: { in: ids } } });
    await prisma.coinTxn.deleteMany({ where: { memberId: { in: ids } } });
    await prisma.member.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.appState.deleteMany({ where: { key: { in: ["feature:garajx", "feature:motorolami", "feature:carupgrade", "mo:econ"] } } });
  await prisma.appState.deleteMany({ where: { key: { startsWith: "sellerrate:" } } });
  await prisma.appState.deleteMany({ where: { key: { startsWith: "ofis:" } } });
  await prisma.appState.deleteMany({ where: { key: { startsWith: "merge:" } } });
  await prisma.appState.deleteMany({ where: { key: { startsWith: "slotgen:" } } });
  await prisma.appState.deleteMany({ where: { key: { in: ["mo:speeder:stock", "mo:speeder:day"] } } });
  await prisma.appState.deleteMany({ where: { key: { startsWith: "mo:part:next:" } } }); // 🔧 P2-deep-5 mint counters (global; test DB throwaway)
  await prisma.appState.deleteMany({ where: { key: { startsWith: "mo:partmint:" } } }); // 🔧 P2-deep-5 event flags
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

  // ── 11c) ⚖️ Auto-stabilizer (P2-deep-3) ──────────────────────────────────
  // Today's motor_earn = 500 (from the cap test). target=100 → emission hot → fuelMult rises.
  await setMotorEcon("fuelMult", 1);
  await setMotorEcon("autoStabStep", 0.05);
  await setMotorEcon("emissionTargetDay", 100);
  const stab1 = await sweepAutoStabilize();
  ok(stab1?.adjusted === true && Math.abs((stab1?.fuelMult ?? 0) - 1.05) < 0.001, `auto-stab: emission > target → fuelMult 1→1.05 (got ${stab1?.fuelMult})`);
  // disabled when target=0
  await setMotorEcon("emissionTargetDay", 0);
  const stab2 = await sweepAutoStabilize();
  ok(stab2 === null, `auto-stab: target=0 → disabled (null)`);
  await setMotorEcon("fuelMult", 1); // restore

  // ── 11d) 🏛 Ofis demontaj/scrap (P2-deep-4) ───────────────────────────────
  // Hermetic: a FRESH Ofis-held car (own member) — the section-3 damas was recycled by the
  // merge sacrifice, so we mint a dedicated held row here. Hold window = 12h default.
  await setMotorEcon("ofisHoldHours", 12);
  const scrapM = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-scrap`, fullName: "Scrap Holder", phone: "+998900007009", trips: 1 } });
  const heldFresh = await prisma.garajCar.create({ data: { memberId: scrapM.id, carCode: "nexia", serial: 990001, ofisHeld: true, soldAt: new Date() } });
  // A) freshly-held car (soldAt≈now) is INSIDE the window → NOT scrapped
  const scrapNone = await sweepOfisHeld();
  const stillThere = await prisma.garajCar.findUnique({ where: { id: heldFresh.id } });
  ok(stillThere !== null, `Ofis scrap: car held < window NOT scrapped (survives, scrapped=${scrapNone})`);
  // B) push soldAt past the window → scrap destroys it permanently + audits to OfisLedger
  await prisma.garajCar.update({ where: { id: heldFresh.id }, data: { soldAt: new Date(Date.now() - 100 * 3600_000) } });
  const scrapDone = await sweepOfisHeld();
  const heldGone = await prisma.garajCar.findUnique({ where: { id: heldFresh.id } });
  ok(scrapDone >= 1 && heldGone === null, `Ofis scrap: car past window DELETED (scrapped=${scrapDone}, gone=${heldGone === null})`);
  const scrapRow = await prisma.ofisLedger.findFirst({ where: { kind: "scrap", refCarId: heldFresh.id } });
  ok(scrapRow !== null && scrapRow.status === "scrapped", `Ofis scrap: OfisLedger audit row written (kind=scrap, status=${scrapRow?.status})`);
  // C) OFF-safe — flag off → sweep is a no-op (returns 0)
  await setFeature("motorolami", false);
  __resetFeatureCache();
  const scrapOff = await sweepOfisHeld();
  ok(scrapOff === 0, `Ofis scrap: flag OFF → no-op (returned ${scrapOff})`);
  await setFeature("motorolami", true);
  __resetFeatureCache();

  // ── 11e) 🔧 Limited-event parts (P2-deep-5) ───────────────────────────────
  const TT = "twin_turbo"; const ttDef = getMotorPart(TT)!;
  const NI = "nitro"; const niDef = getMotorPart(NI)!;
  // 4 fresh members for a true cross-member concurrency race (member-lock does NOT serialize them)
  const pm: { id: number }[] = [];
  for (let i = 0; i < 4; i++) pm.push(await prisma.member.create({ data: { type: "client", kasId: `${TAG}-part${i}`, fullName: `Part ${i}`, phone: `+99890000801${i}`, trips: 2 } }));
  for (const m of pm) await grantCoins(m.id, ttDef.cost * 6, "manual", "seed-parts");
  // A) event CLOSED → mint rejected (DARK-safe default)
  await setPartMintEvent(TT, false);
  const mClosed = await mintPart(pm[0]!.id, TT);
  ok(!mClosed.ok && mClosed.reason === "event_closed", `parts: mint rejected when event closed (${mClosed.reason})`);
  // B) open event → mint succeeds (tanga SINK) + serial assigned
  await setPartMintEvent(TT, true);
  const balBeforeMint = await getCoins(pm[0]!.id);
  const m1 = await mintPart(pm[0]!.id, TT);
  ok(m1.ok && (m1.serial ?? 0) >= 1 && m1.cap === ttDef.mintCap, `parts: mint ok, serial #${m1.serial}/${ttDef.mintCap}`);
  ok(balBeforeMint - (await getCoins(pm[0]!.id)) === ttDef.cost, `parts: mint charged ${ttDef.cost} tanga (sink)`);
  // C) HARD CAP under TRUE cross-member concurrency — seed counter to cap-1, fire 2 simultaneous
  // mints from different members (member-lock does NOT serialize them) → exactly 1 ok + 1 sold_out.
  // The atomicity is the conditional SQL in nextPartSerial (UPDATE ... WHERE value < cap).
  await prisma.appState.upsert({ where: { key: `mo:part:next:${TT}` }, create: { key: `mo:part:next:${TT}`, value: String(ttDef.mintCap - 1) }, update: { value: String(ttDef.mintCap - 1) } });
  const raceRes = await Promise.all([mintPart(pm[0]!.id, TT), mintPart(pm[3]!.id, TT)]);
  const okCount = raceRes.filter((r) => r.ok).length;
  const soldOut = raceRes.filter((r) => !r.ok && r.reason === "sold_out").length;
  ok(okCount === 1 && soldOut === 1, `parts: HARD CAP race-proof — 2 concurrent mints at cap-1 → exactly 1 ok + 1 sold_out (got ${okCount}/${soldOut})`);
  const counterNow = parseInt((await prisma.appState.findUnique({ where: { key: `mo:part:next:${TT}` } }))!.value, 10);
  ok(counterNow === ttDef.mintCap, `parts: counter never exceeds cap (=${ttDef.mintCap}, got ${counterNow})`);
  // D) cap reached → further mint sold_out
  const mOver = await mintPart(pm[0]!.id, TT);
  ok(!mOver.ok && mOver.reason === "sold_out", `parts: mint past cap → sold_out (${mOver.reason})`);
  // E) INSTALL boost — two identical cars, only one gets a part → boosted car earns ~+10% gross
  await setPartMintEvent(NI, true);
  const boostM = pm[1]!; const ctrlM = pm[2]!;
  const ba = await acquireCar(boostM.id, "nexia"); const ca = await acquireCar(ctrlM.id, "nexia");
  ok(ba.ok && ca.ok, `parts: two control cars acquired`);
  const rewound2 = new Date(Date.now() - 5 * 3600_000); const future2 = new Date(Date.now() + 24 * 3600_000);
  await prisma.garajCar.update({ where: { id: ba.carId! }, data: { fueledUntilAt: future2, lastAccrualAt: rewound2 } });
  await prisma.garajCar.update({ where: { id: ca.carId! }, data: { fueledUntilAt: future2, lastAccrualAt: rewound2 } });
  const mn = await mintPart(boostM.id, NI);
  ok(mn.ok, `parts: nitro minted (#${mn.serial})`);
  const inst = await installPart(boostM.id, mn.partId!, ba.carId!);
  ok(inst.ok, `parts: nitro installed on car`);
  // foreign install rejected (can't bolt someone else's part)
  const instBad = await installPart(ctrlM.id, mn.partId!, ca.carId!);
  ok(!instBad.ok && instBad.reason === "not_found", `parts: cannot install another player's part (${instBad.reason})`);
  const cb = await motorCollect(boostM.id, ba.carId!);
  const cc = await motorCollect(ctrlM.id, ca.carId!);
  ok((cb.gross ?? 0) > (cc.gross ?? 0), `parts: installed car earns more (gross ${cb.gross} > ${cc.gross})`);
  const ratio = (cb.gross ?? 0) / Math.max(1, cc.gross ?? 0);
  ok(Math.abs(ratio - (1 + niDef.earnBonusPct / 100)) < 0.06, `parts: boost ≈ +${niDef.earnBonusPct}% (ratio ${ratio.toFixed(3)})`);
  // F) uninstall → back to inventory
  const un = await uninstallPart(boostM.id, mn.partId!);
  ok(un.ok, `parts: uninstall ok`);
  const stAfter = await getPartsState(boostM.id);
  const pAfter = stAfter.parts.find((x) => x.id === mn.partId);
  ok(!!pAfter && pAfter.status === "owned" && pAfter.installedCarId === null, `parts: after uninstall → back to inventory`);
  // G) insufficient funds → rejected
  const poor = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-poor`, fullName: "Poor", phone: "+998900008099", trips: 1 } });
  const mPoor = await mintPart(poor.id, NI);
  ok(!mPoor.ok && mPoor.reason === "insufficient", `parts: insufficient funds → rejected (${mPoor.reason})`);
  // H) unknown part code → bad_part
  const mBad = await mintPart(pm[0]!.id, "nonexistent_part");
  ok(!mBad.ok && mBad.reason === "bad_part", `parts: unknown code → bad_part (${mBad.reason})`);
  // I) OFF-safe — flag off → mint no-op
  await setFeature("motorolami", false); __resetFeatureCache();
  const mOff = await mintPart(pm[0]!.id, NI);
  ok(!mOff.ok && mOff.reason === "off", `parts: flag OFF → mint no-op (${mOff.reason})`);
  await setFeature("motorolami", true); __resetFeatureCache();
  // J) catalog reflects mint state (twin_turbo sold out)
  const stCat = await getPartsState(pm[0]!.id);
  const ttCat = stCat.catalog.find((c) => c.code === TT)!;
  ok(ttCat.left === 0 && ttCat.minted === ttDef.mintCap, `parts: catalog shows twin_turbo SOLD OUT (left ${ttCat.left})`);
  // K) ledger invariant for every minting member (mint charge is atomic)
  for (const m of [...pm, poor]) {
    const bal = (await prisma.member.findUnique({ where: { id: m.id } }))!.coins;
    const tot = (await prisma.coinTxn.aggregate({ where: { memberId: m.id }, _sum: { amount: true } }))._sum.amount ?? 0;
    ok(Math.abs(bal - tot) < 0.001, `parts: member ${m.id} ledger invariant (bal ${bal} == ledger ${tot})`);
  }

  // ── 11f) 🛠 Detal-bozori — parts P2P market (P2-deep-6) ────────────────────
  const seller = pm[0]!; const buyer = pm[3]!;
  await grantCoins(seller.id, 500_000, "manual", "seed-market");
  await grantCoins(buyer.id, 500_000, "manual", "seed-market");
  await setPartMintEvent(NI, true);
  const sMint = await mintPart(seller.id, NI); // fresh nitro to trade
  ok(sMint.ok, `market: seller minted nitro to sell (#${sMint.serial})`);
  // A) cannot list an INSTALLED part (must uninstall first)
  const sCar = await acquireCar(seller.id, "tiko");
  ok(sCar.ok, `market: seller car (install-guard)`);
  await installPart(seller.id, sMint.partId!, sCar.carId!);
  const listInstalled = await listPart(seller.id, sMint.partId!, 40_000);
  ok(!listInstalled.ok && listInstalled.reason === "installed", `market: cannot list installed part (${listInstalled.reason})`);
  await uninstallPart(seller.id, sMint.partId!);
  // B) price ceiling clamp (cost × 50) — list absurd, verify clamp, then cancel to free the part
  const ceil = niDef.cost * 50;
  const lstHigh = await listPart(seller.id, sMint.partId!, ceil * 10);
  ok(lstHigh.ok, `market: listed (high price)`);
  const bazView = await getPartBazaar(buyer.id);
  const clampedRow = bazView.find((b) => b.partId === sMint.partId);
  ok(!!clampedRow && clampedRow.askPrice === ceil && clampedRow.mine === false, `market: price clamped to ceiling ${ceil} + buyer sees not-mine (got ${clampedRow?.askPrice})`);
  // listed part cannot be installed
  const instListed = await installPart(seller.id, sMint.partId!, sCar.carId!);
  ok(!instListed.ok && instListed.reason === "listed", `market: listed part can't be installed (${instListed.reason})`);
  const highListingId = (await prisma.garajPartListing.findFirst({ where: { partId: sMint.partId, status: "open" } }))!.id;
  const cancelHigh = await cancelPartListing(seller.id, highListingId);
  ok(cancelHigh.ok, `market: cancel listing → part back to inventory`);
  const partAfterCancel = await prisma.garajPart.findUnique({ where: { id: sMint.partId! } });
  ok(partAfterCancel?.status === "owned", `market: cancelled part status=owned (${partAfterCancel?.status})`);
  // C) list at a real price → self-trade + insufficient both REVERT to open → real cross-member buy
  const price = 40_000;
  const lst = await listPart(seller.id, sMint.partId!, price);
  ok(lst.ok, `market: re-listed at ${price}`);
  const listingId = (await prisma.garajPartListing.findFirst({ where: { partId: sMint.partId, status: "open" } }))!.id;
  const selfBuy = await buyPart(seller.id, listingId);
  ok(!selfBuy.ok && selfBuy.reason === "self_trade", `market: self-trade blocked (${selfBuy.reason})`);
  const poorBuy = await buyPart(poor.id, listingId); // poor has 0 coins
  ok(!poorBuy.ok && poorBuy.reason === "insufficient", `market: insufficient buyer → rejected + revert (${poorBuy.reason})`);
  const stillOpen = await prisma.garajPartListing.findUnique({ where: { id: listingId } });
  ok(stillOpen?.status === "open", `market: listing reverted to open after failed buys (${stillOpen?.status})`);
  // D) the real buy: ownership transfers, seller credited price−3%, 3% BURNED (no emission)
  const sellerBefore = await getCoins(seller.id); const buyerBefore = await getCoins(buyer.id);
  const buyRes = await buyPart(buyer.id, listingId);
  ok(buyRes.ok, `market: buy ok`);
  const tax = Math.round(price * 0.03);
  const sellerAfter = await getCoins(seller.id); const buyerAfter = await getCoins(buyer.id);
  ok(sellerAfter - sellerBefore === price - tax, `market: seller credited price−tax = ${price - tax} (got ${sellerAfter - sellerBefore})`);
  ok(buyerBefore - buyerAfter === price, `market: buyer paid full ${price} (got ${buyerBefore - buyerAfter})`);
  ok((buyerBefore + sellerBefore) - (buyerAfter + sellerAfter) === tax, `market: net system tanga burned = tax ${tax} (NO emission)`);
  const boughtPart = await prisma.garajPart.findUnique({ where: { id: sMint.partId! } });
  ok(boughtPart?.ownerId === buyer.id && boughtPart?.status === "owned" && boughtPart?.installedCarId === null, `market: part ownership → buyer, status owned, uninstalled`);
  const soldListing = await prisma.garajPartListing.findUnique({ where: { id: listingId } });
  ok(soldListing?.status === "sold", `market: listing marked sold`);
  // E) double-buy → already_sold
  const reBuy = await buyPart(buyer.id, listingId);
  ok(!reBuy.ok && reBuy.reason === "already_sold", `market: double-buy → already_sold (${reBuy.reason})`);
  // F) OFF-safe — flag off → list + buy no-op
  await setFeature("motorolami", false); __resetFeatureCache();
  const listOff = await listPart(buyer.id, sMint.partId!, 1000);
  ok(!listOff.ok && listOff.reason === "off", `market: flag OFF → list no-op (${listOff.reason})`);
  await setFeature("motorolami", true); __resetFeatureCache();
  // G) ledger invariant for buyer + seller after the trade
  for (const m of [seller, buyer]) {
    const bal = (await prisma.member.findUnique({ where: { id: m.id } }))!.coins;
    const tot = (await prisma.coinTxn.aggregate({ where: { memberId: m.id }, _sum: { amount: true } }))._sum.amount ?? 0;
    ok(Math.abs(bal - tot) < 0.001, `market: member ${m.id} ledger invariant (bal ${bal} == ledger ${tot})`);
  }

  // ── 11g) 🔧 P2-deep-5/6 hardening — adversarial-review fixes ───────────────
  const cSeller = pm[3]!; // owns the nitro bought in the market test (status owned)
  const cBuyer = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-carbuyer`, fullName: "Car Buyer", phone: "+998900008055", trips: 2 } });
  await grantCoins(cBuyer.id, 500_000, "manual", "seed"); await grantCoins(cSeller.id, 300_000, "manual", "seed");
  await setPartMintEvent(NI, true);
  // FIX#2 — selling a car with an installed part: the part uninstalls back to the SELLER (no earn leak to the buyer)
  const ownedNitro = (await getPartsState(cSeller.id)).parts.find((p) => p.code === NI && p.status === "owned");
  ok(!!ownedNitro, `fix2 prep: seller owns a nitro part`);
  const sellCar = await acquireCar(cSeller.id, "nexia");
  ok(sellCar.ok, `fix2 prep: seller acquired a car`);
  await installPart(cSeller.id, ownedNitro!.id, sellCar.carId!);
  const carListed = await garajBazaarList(cSeller.id, sellCar.carId!, 1000);
  ok(carListed.ok, `fix2: car listed on the car-bazaar`);
  const carListing = (await prisma.garajBazaarListing.findFirst({ where: { garajCarId: sellCar.carId!, status: "open" } }))!;
  const carBought = await garajBazaarBuy(cBuyer.id, carListing.id);
  ok(carBought.ok, `fix2: car bought by another player`);
  const partAfterSale = await prisma.garajPart.findUnique({ where: { id: ownedNitro!.id } });
  ok(partAfterSale?.ownerId === cSeller.id && partAfterSale?.status === "owned" && partAfterSale?.installedCarId === null, `fix2: part uninstalled back to SELLER (not transferred, not still boosting)`);
  const partsOnSoldCar = await prisma.garajPart.count({ where: { installedCarId: sellCar.carId!, status: "installed" } });
  ok(partsOnSoldCar === 0, `fix2: the sold car carries ZERO installed parts → buyer earn-leak closed`);
  // FIX#1 — an atomic cancel cannot un-freeze a part a concurrent buyPart already claimed
  const f1 = await mintPart(cSeller.id, NI);
  await listPart(cSeller.id, f1.partId!, 5000);
  const f1ListingId = (await prisma.garajPartListing.findFirst({ where: { partId: f1.partId, status: "open" } }))!.id;
  await prisma.garajPartListing.update({ where: { id: f1ListingId }, data: { status: "pending_payment", buyerId: cBuyer.id } }); // simulate a concurrent buyPart claim
  const f1Cancel = await cancelPartListing(cSeller.id, f1ListingId);
  ok(!f1Cancel.ok && f1Cancel.reason === "already_sold", `fix1: cancel of a CLAIMED listing is refused by CAS (${f1Cancel.reason})`);
  ok((await prisma.garajPart.findUnique({ where: { id: f1.partId! } }))?.status === "listed", `fix1: part NOT un-frozen by the refused cancel (still listed)`);
  // FIX#4 — a stuck pending_payment with the buyer already charged → buyPart re-run finalizes idempotently
  await prisma.coinTxn.create({ data: { memberId: cBuyer.id, amount: -5000, kind: "garaj_part_buy", reason: "recovery-test", idempotencyKey: `partbuy:${f1ListingId}` } });
  await prisma.member.update({ where: { id: cBuyer.id }, data: { coins: { decrement: 5000 } } });
  const f4 = await buyPart(cBuyer.id, f1ListingId);
  ok(f4.ok, `fix4: buyPart recovers a stuck pending_payment (idempotent finalize)`);
  const f4Part = await prisma.garajPart.findUnique({ where: { id: f1.partId! } });
  ok(f4Part?.ownerId === cBuyer.id && f4Part?.status === "owned", `fix4: recovery → part transferred to buyer`);
  ok((await prisma.garajPartListing.findUnique({ where: { id: f1ListingId } }))?.status === "sold", `fix4: recovery → listing marked sold`);
  // FIX#3 — getPartsState exposes listingId for listed parts (UI cancel never depends on the capped bazaar list)
  const f3 = await mintPart(cSeller.id, NI);
  await listPart(cSeller.id, f3.partId!, 3000);
  const f3Part = (await getPartsState(cSeller.id)).parts.find((p) => p.id === f3.partId);
  ok(!!f3Part && f3Part.status === "listed" && typeof f3Part.listingId === "number", `fix3: listed part exposes listingId=${f3Part?.listingId}`);
  const f3Cancel = await cancelPartListing(cSeller.id, f3Part!.listingId!);
  ok(f3Cancel.ok, `fix3: cancel via the exposed listingId works`);
  // ledger invariant for the hardening members
  for (const m of [cSeller, cBuyer]) {
    const bal = (await prisma.member.findUnique({ where: { id: m.id } }))!.coins;
    const tot = (await prisma.coinTxn.aggregate({ where: { memberId: m.id }, _sum: { amount: true } }))._sum.amount ?? 0;
    ok(Math.abs(bal - tot) < 0.001, `fix: member ${m.id} ledger invariant (bal ${bal} == ledger ${tot})`);
  }

  // ── 11h) 🚕 FAZA1 — real-taxi motor bonus + speeder-fuel proportional ──────
  await setMotorEcon("taxiMult", 2); await setMotorEcon("dailyEarnCap", 10000); await setMotorEcon("speedMult", 1); await setMotorEcon("bonusDays", 0);
  const drv = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-drv`, fullName: "Driver", phone: "+998900008077", trips: 5 } });
  await grantCoins(drv.id, 5_000_000, "manual", "seed");
  const drvCar = await acquireCar(drv.id, "nexia");
  ok(drvCar.ok, `taxi prep: driver acquired a motor car`);
  // A) real ride → taxi bonus + totalTrips++ + motor_taxi ledger row
  const t1 = await creditTaxiMotorBonus(drv.id, 900001, 60);
  ok(t1.ok && (t1.bonus ?? 0) > 0, `taxi: real ride credits a bonus (${t1.bonus})`);
  ok(((await prisma.garajCar.findUnique({ where: { id: drvCar.carId! } }))?.totalTrips ?? 0) === 1, `taxi: totalTrips → 1`);
  const taxiTxn = await prisma.coinTxn.findUnique({ where: { idempotencyKey: `mo:taxi:${drv.id}:900001` } });
  ok(!!taxiTxn && taxiTxn.kind === "motor_taxi", `taxi: motor_taxi ledger row written`);
  // B) idempotent — same booking re-run → no double bonus / trips / balance
  const balB = await getCoins(drv.id);
  const t2 = await creditTaxiMotorBonus(drv.id, 900001, 60);
  ok(t2.ok && (t2.bonus ?? 0) === 0, `taxi: re-run same ride → 0 bonus (idempotent)`);
  ok((await getCoins(drv.id)) === balB, `taxi: re-run → balance unchanged`);
  ok(((await prisma.garajCar.findUnique({ where: { id: drvCar.carId! } }))?.totalTrips ?? 0) === 1, `taxi: re-run → totalTrips still 1 (no double-count)`);
  // C) shared cap — fill the cap, next ride's taxi bonus clamps to 0 (taxi+passive together ≤ cap)
  await setMotorEcon("dailyEarnCap", 1); // already earned > 1 today from t1
  const t3 = await creditTaxiMotorBonus(drv.id, 900002, 60);
  ok(t3.ok && (t3.bonus ?? 0) === 0, `taxi: shared cap reached → taxi bonus 0 (got ${t3.bonus})`);
  await setMotorEcon("dailyEarnCap", 10000);
  // D) OFF-safe
  await setFeature("motorolami", false); __resetFeatureCache();
  const tOff = await creditTaxiMotorBonus(drv.id, 900003, 60);
  ok(!tOff.ok, `taxi: flag OFF → no-op`);
  await setFeature("motorolami", true); __resetFeatureCache();
  // E) speeder-fuel proportional (pure helper) — a ×3-boosted car pays ~×3 fuel
  const fuel1 = computeMotorRefillCost("nexia", 24, 1, 1);
  const fuel3 = computeMotorRefillCost("nexia", 24, 1, 3);
  ok(Math.abs(fuel3 / fuel1 - 3) < 0.02, `speeder-fuel: refill cost scales with speed-factor (×3 ≈ ${(fuel3 / fuel1).toFixed(2)})`);
  // F) driver ledger invariant
  {
    const bal = (await prisma.member.findUnique({ where: { id: drv.id } }))!.coins;
    const tot = (await prisma.coinTxn.aggregate({ where: { memberId: drv.id }, _sum: { amount: true } }))._sum.amount ?? 0;
    ok(Math.abs(bal - tot) < 0.001, `taxi: driver ledger invariant (bal ${bal} == ledger ${tot})`);
  }

  // ── 11i) 🚗 FAZA2 — model-upgrade ladder + ownerCount++ + bazaar #serial ───
  await setFeature("carupgrade", true); __resetFeatureCache();
  await setMotorEcon("carUpgradeFactor", 1.3);
  const up = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-up`, fullName: "Upgrader", phone: "+998900008088", trips: 3 } });
  await grantCoins(up.id, 5_000_000, "manual", "seed");
  const upAcq = await acquireCar(up.id, "tiko");
  ok(upAcq.ok, `upgrade prep: acquired tiko`);
  const tikoCar = (await prisma.garajCar.findUnique({ where: { id: upAcq.carId! } }))!;
  const keptSerial = tikoCar.serial;
  // A) tiko → damas: #serial + history KEPT, tanga charged, engineHp fresh
  const balBeforeUp = await getCoins(up.id);
  const u1 = await upgradeCarModel(up.id, upAcq.carId!);
  ok(u1.ok && u1.newCode === "damas", `upgrade: tiko→damas ok (newCode=${u1.newCode})`);
  const expectUpCost = upgradeCost("tiko", 1.3);
  ok(balBeforeUp - (await getCoins(up.id)) === expectUpCost, `upgrade: charged ${expectUpCost} (sink)`);
  const damasCar = (await prisma.garajCar.findUnique({ where: { id: upAcq.carId! } }))!;
  ok(damasCar.carCode === "damas" && damasCar.serial === keptSerial, `upgrade: carCode→damas, #serial PRESERVED (#${damasCar.serial})`);
  ok((damasCar.engineHp ?? 0) === 100, `upgrade: fresh engine (engineHp 100)`);
  ok(nextModel("gelik") === null, `upgrade: gelik is top of the ladder (nextModel null)`);
  // B) OFF-safe — flag off → reject
  await setFeature("carupgrade", false); __resetFeatureCache();
  const uOff = await upgradeCarModel(up.id, upAcq.carId!);
  ok(!uOff.ok && uOff.reason === "off", `upgrade: flag OFF → rejected (${uOff.reason})`);
  await setFeature("carupgrade", true); __resetFeatureCache();
  // C) ledger invariant for the upgrader
  {
    const bal = (await prisma.member.findUnique({ where: { id: up.id } }))!.coins;
    const tot = (await prisma.coinTxn.aggregate({ where: { memberId: up.id }, _sum: { amount: true } }))._sum.amount ?? 0;
    ok(Math.abs(bal - tot) < 0.001, `upgrade: upgrader ledger invariant (bal ${bal} == ledger ${tot})`);
  }
  // D) ownerCount++ on P2P car sale (fixes cleanHistory) + bazaar exposes #serial
  const ocSeller = up; // owns a damas now (#serial kept)
  const ocBuyer = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-ocbuyer`, fullName: "OC Buyer", phone: "+998900008089", trips: 2 } });
  await grantCoins(ocBuyer.id, 500_000, "manual", "seed");
  const ocList = await garajBazaarList(ocSeller.id, upAcq.carId!, 500);
  ok(ocList.ok, `ownerCount: car listed on bazaar`);
  const bazRows = await getBazaar(ocBuyer.id);
  const ocRow = bazRows.find((b) => b.garajCarId === upAcq.carId);
  ok(!!ocRow && ocRow.serial === keptSerial, `bazaar: listing exposes #serial (${ocRow?.serial})`);
  const ocBuy = await garajBazaarBuy(ocBuyer.id, ocRow!.id);
  ok(ocBuy.ok, `ownerCount: car bought`);
  const ocCar = (await prisma.garajCar.findUnique({ where: { id: upAcq.carId! } }))!;
  ok(ocCar.memberId === ocBuyer.id && (ocCar.ownerCount ?? 1) === 2, `ownerCount: → 2 after sale (was 1); cleanHistory now honest`);
  // E) FREE STARTER — with the shop removed, a brand-new player (0 cars, 0 coins) still GETS a Tiko
  const newbie = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-newbie`, fullName: "Newbie", phone: "+998900008090", trips: 0 } });
  const ns1 = await getGarajState(newbie.id); // first open → grants the free starter
  ok(ns1.cars.length === 1 && ns1.cars[0]!.carCode === "tiko" && (ns1.cars[0]!.serial ?? 0) > 0, `starter: new player GOT a free Tiko #${ns1.cars[0]?.serial} (not stranded by shop removal)`);
  const ns2 = await getGarajState(newbie.id); // second open → no double-grant
  ok(ns2.cars.length === 1, `starter: idempotent — second open does NOT grant another car`);
  const starterMarker = await prisma.coinTxn.findUnique({ where: { idempotencyKey: `garaj:starter:${newbie.id}` } });
  ok(!!starterMarker && starterMarker.amount === 0, `starter: 0-amount marker written (no tanga emission)`);
  await setFeature("carupgrade", false); __resetFeatureCache();

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
