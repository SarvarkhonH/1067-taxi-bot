// Portable logical backup: dumps every table to a timestamped JSON snapshot
// (no pg_dump dependency). Restorable via restore.ts. Run: tsx backup.ts
//
// HARDENING-P0.1 — this script is the disaster-recovery path for the Render free-tier Postgres
// expiry (deadline 2026-07-10). The table list MUST stay in sync with prisma/schema.prisma:
// every `model Foo {...}` declared there must have a `foo: () => prisma.foo.findMany()` entry
// below. A missing entry silently loses that table's data. The CI smoke-test below counts the
// schema's models vs this list and fails if they diverge.
import "../env";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "../db";
import { repoRoot } from "../env";

async function main(): Promise<void> {
  const snapshot: Record<string, unknown[]> = {};
  // Every model in packages/server/prisma/schema.prisma — alphabetical for review.
  // To add a model: declare it in schema.prisma + add one line here. CI guard below.
  const tables = {
    adContact: () => prisma.adContact.findMany(),
    adPhoto: () => prisma.adPhoto.findMany(),
    adReaction: () => prisma.adReaction.findMany(),
    adView: () => prisma.adView.findMany(),
    appState: () => prisma.appState.findMany(),
    boxOpen: () => prisma.boxOpen.findMany(),
    broadcast: () => prisma.broadcast.findMany(),
    broadcastRecipient: () => prisma.broadcastRecipient.findMany(),
    cashoutRequest: () => prisma.cashoutRequest.findMany(),
    categoryDef: () => prisma.categoryDef.findMany(),
    classifiedAd: () => prisma.classifiedAd.findMany(),
    coinTxn: () => prisma.coinTxn.findMany(),
    corpAccount: () => prisma.corpAccount.findMany(),
    corpEmployee: () => prisma.corpEmployee.findMany(),
    dailyStat: () => prisma.dailyStat.findMany(),
    driverCall: () => prisma.driverCall.findMany(),
    driverDebtPayment: () => prisma.driverDebtPayment.findMany(),
    driverRecruit: () => prisma.driverRecruit.findMany(),
    driverSession: () => prisma.driverSession.findMany(),
    familyMember: () => prisma.familyMember.findMany(),
    foodOrder: () => prisma.foodOrder.findMany(),
    gap: () => prisma.gap.findMany(),
    gapMember: () => prisma.gapMember.findMany(),
    garajAuction: () => prisma.garajAuction.findMany(),
    garajAuctionBid: () => prisma.garajAuctionBid.findMany(),
    garajBazaarListing: () => prisma.garajBazaarListing.findMany(),
    garajCar: () => prisma.garajCar.findMany(),
    garajCraftJob: () => prisma.garajCraftJob.findMany(),
    garajExhibitionEntry: () => prisma.garajExhibitionEntry.findMany(),
    garajExhibitionVote: () => prisma.garajExhibitionVote.findMany(),
    garajFlip: () => prisma.garajFlip.findMany(),
    garajHallOfFame: () => prisma.garajHallOfFame.findMany(),
    garajPart: () => prisma.garajPart.findMany(),
    garajPartListing: () => prisma.garajPartListing.findMany(),
    garajRideDrop: () => prisma.garajRideDrop.findMany(),
    garajStreak: () => prisma.garajStreak.findMany(),
    intercityBooking: () => prisma.intercityBooking.findMany(),
    intercityCity: () => prisma.intercityCity.findMany(),
    intercityCommissionDebt: () => prisma.intercityCommissionDebt.findMany(),
    intercityDriverEnrollment: () => prisma.intercityDriverEnrollment.findMany(),
    intercityDriverPenalty: () => prisma.intercityDriverPenalty.findMany(),
    intercityRefund: () => prisma.intercityRefund.findMany(),
    intercityRoute: () => prisma.intercityRoute.findMany(),
    intercityRouteStop: () => prisma.intercityRouteStop.findMany(),
    intercityTrip: () => prisma.intercityTrip.findMany(),
    intercityWaitEntry: () => prisma.intercityWaitEntry.findMany(),
    item: () => prisma.item.findMany(),
    itemListing: () => prisma.itemListing.findMany(),
    itemType: () => prisma.itemType.findMany(),
    kozachaTxn: () => prisma.kozachaTxn.findMany(),
    listing: () => prisma.listing.findMany(),
    mahallaGroup: () => prisma.mahallaGroup.findMany(),
    mahallaGroupMember: () => prisma.mahallaGroupMember.findMany(),
    mahallaWeeklyResult: () => prisma.mahallaWeeklyResult.findMany(),
    marketDemand: () => prisma.marketDemand.findMany(),
    marketShop: () => prisma.marketShop.findMany(),
    member: () => prisma.member.findMany(),
    memberAchievement: () => prisma.memberAchievement.findMany(),
    memberCar: () => prisma.memberCar.findMany(),
    memberGarajMeta: () => prisma.memberGarajMeta.findMany(),
    memberMechanicSkill: () => prisma.memberMechanicSkill.findMany(),
    menuItem: () => prisma.menuItem.findMany(),
    missionProgress: () => prisma.missionProgress.findMany(),
    notifyLog: () => prisma.notifyLog.findMany(),
    ofisLedger: () => prisma.ofisLedger.findMany(),
    peakHour: () => prisma.peakHour.findMany(),
    platformLedger: () => prisma.platformLedger.findMany(),
    product: () => prisma.product.findMany(),
    productPhoto: () => prisma.productPhoto.findMany(),
    productReview: () => prisma.productReview.findMany(),
    referral: () => prisma.referral.findMany(),
    restaurant: () => prisma.restaurant.findMany(),
    restaurantReview: () => prisma.restaurantReview.findMany(),
    rewardGrant: () => prisma.rewardGrant.findMany(),
    rideGuess: () => prisma.rideGuess.findMany(),
    rideRating: () => prisma.rideRating.findMany(),
    rideReward: () => prisma.rideReward.findMany(),
    scheduledRide: () => prisma.scheduledRide.findMany(),
    serviceCategory: () => prisma.serviceCategory.findMany(),
    serviceFavorite: () => prisma.serviceFavorite.findMany(),
    serviceListing: () => prisma.serviceListing.findMany(),
    servicePhoto: () => prisma.servicePhoto.findMany(),
    servicePriceItem: () => prisma.servicePriceItem.findMany(),
    serviceRequest: () => prisma.serviceRequest.findMany(),
    serviceReview: () => prisma.serviceReview.findMany(),
    shop: () => prisma.shop.findMany(),
    shopOrder: () => prisma.shopOrder.findMany(),
    shopPurchase: () => prisma.shopPurchase.findMany(),
    streak: () => prisma.streak.findMany(),
    supportMsg: () => prisma.supportMsg.findMany(),
    syncRun: () => prisma.syncRun.findMany(),
    telegramUser: () => prisma.telegramUser.findMany(),
    tradeMessage: () => prisma.tradeMessage.findMany(),
    tradeOffer: () => prisma.tradeOffer.findMany(),
    transfer: () => prisma.transfer.findMany(),
    waitCompReward: () => prisma.waitCompReward.findMany(),
    weeklyScore: () => prisma.weeklyScore.findMany(),
    wheelSpin: () => prisma.wheelSpin.findMany(),
    withdrawal: () => prisma.withdrawal.findMany(),
  };

  // ── HARDENING-P0.1 schema-vs-backup-list parity check ────────────────────
  // Counts `model Foo {` declarations in schema.prisma and compares to the keys above.
  // A divergence means a new table was added without updating this script → silent data loss.
  // Throws BEFORE any dump so the operator immediately knows the backup would be incomplete.
  const schemaPath = resolve(repoRoot, "packages/server/prisma/schema.prisma");
  const schemaSrc = readFileSync(schemaPath, "utf8");
  const schemaModels = new Set(
    [...schemaSrc.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]!.charAt(0).toLowerCase() + m[1]!.slice(1)),
  );
  const listedTables = new Set(Object.keys(tables));
  const missing = [...schemaModels].filter((m) => !listedTables.has(m));
  const extra = [...listedTables].filter((m) => !schemaModels.has(m));
  if (missing.length || extra.length) {
    console.error("❌ backup.ts is out of sync with schema.prisma:");
    if (missing.length) console.error("   missing from backup (data would be LOST):", missing);
    if (extra.length) console.error("   not in schema (typo or removed model):", extra);
    console.error(`\n   Update the tables map in this file to include all ${schemaModels.size} models, then re-run.`);
    process.exit(2);
  }

  let total = 0;
  for (const [name, fn] of Object.entries(tables)) {
    const rows = await fn();
    snapshot[name] = rows;
    total += rows.length;
    console.log(`  ${name}: ${rows.length}`);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = resolve(repoRoot, "backups");
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, `snapshot-${stamp}.json`);
  // BigInt columns (tgId/ownerTgId in xizmatlar-reviews) serialize as strings — a restore must
  // coerce them back per-column from schema.prisma; plain JSON.stringify throws on BigInt.
  const json = JSON.stringify(
    { at: stamp, total, schemaModelCount: schemaModels.size, tables: snapshot },
    (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v),
    0,
  );
  writeFileSync(file, json);
  console.log(`\n✅ ${total} rows across ${Object.keys(tables).length}/${schemaModels.size} tables → ${file}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
