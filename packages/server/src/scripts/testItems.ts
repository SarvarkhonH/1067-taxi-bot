// 💎 Kolleksiya tests: capped mint, sold-out refund, resale 10% burn, badges
// not sellable, parts→full car, district→sayyoh, recruit revshare schedule.
// Run: dotenv -e ../../.env -- tsx src/scripts/testItems.ts
import "../env";
import { prisma } from "../db";
import { grantCoins } from "../services/coinService";
import { CAR_PARTS, buyListedItem, dropCarPart, dropDistrictBadge, getCollection, listItem, mintItem, seedItemTypes } from "../services/itemService";
import { attachDriverRecruit, payRecruitRevshare } from "../services/recruitService";

const TAG = "items-test";
let failed = 0;
function ok(cond: boolean, label: string): void {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) failed++;
}

async function cleanup(): Promise<void> {
  const ms = await prisma.member.findMany({ where: { kasId: { startsWith: TAG } }, select: { id: true } });
  const ids = ms.map((m) => m.id);
  const items = await prisma.item.findMany({ where: { ownerId: { in: ids } } });
  await prisma.itemListing.deleteMany({ where: { OR: [{ sellerId: { in: ids } }, { itemId: { in: items.map((i) => i.id) } }] } });
  await prisma.item.deleteMany({ where: { ownerId: { in: ids } } });
  await prisma.driverRecruit.deleteMany({ where: { OR: [{ driverId: { in: ids } }, { riderMemberId: { in: ids } }] } });
  await prisma.rideReward.deleteMany({ where: { memberId: { in: ids } } });
  await prisma.appState.deleteMany({ where: { key: { startsWith: "partdrop:" } } });
  await prisma.telegramUser.deleteMany({ where: { id: { startsWith: `${TAG}-tg` } } });
  await prisma.member.deleteMany({ where: { id: { in: ids } } });
  // reset test-cap type
  await prisma.itemType.deleteMany({ where: { code: "items_test_cap2" } });
}

async function main(): Promise<void> {
  await cleanup();
  await seedItemTypes();
  const a = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-A`, fullName: "Item A", phone: "+998900006001", trips: 5 } });
  const b = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-B`, fullName: "Item B", phone: "+998900006002", trips: 5 } });
  const drv = await prisma.member.create({ data: { type: "driver", kasId: `${TAG}-D`, fullName: "Item Drv", phone: "+998900006003", carNumber: "70ITEM1", trips: 50 } });
  await grantCoins(a.id, 30000, "manual", "seed");
  await grantCoins(b.id, 30000, "manual", "seed");

  // capped mint: a 2-cap test type sells out at 2, third refunds
  await prisma.itemType.create({ data: { code: "items_test_cap2", name: "Test Cap2", emoji: "🧪", kind: "plate", mintCap: 2, mintPrice: 1000 } });
  const m1 = await mintItem(a.id, "items_test_cap2");
  const m2 = await mintItem(b.id, "items_test_cap2");
  ok(m1.ok && m1.serial === 1 && m2.ok && m2.serial === 2, `serial mints #1, #2`);
  const balBefore = (await prisma.member.findUnique({ where: { id: a.id } }))!.coins;
  const m3 = await mintItem(a.id, "items_test_cap2");
  const balAfter = (await prisma.member.findUnique({ where: { id: a.id } }))!.coins;
  ok(!m3.ok && m3.reason === "sold_out" && balAfter === balBefore, `sold out at cap, coins refunded`);

  // badge one-per-member + not sellable
  const f1 = await mintItem(a.id, "founder", { free: true });
  const f2 = await mintItem(a.id, "founder", { free: true });
  ok(f1.ok && !f2.ok && f2.reason === "already", `badge one-per-member`);
  const fType = await prisma.itemType.findUnique({ where: { code: "founder" } });
  const fRow = await prisma.item.findFirst({ where: { ownerId: a.id, itemTypeId: fType!.id } });
  const ls = await listItem(a.id, fRow!.id, 1000);
  ok(!ls.ok && ls.reason === "not_sellable", `badges not sellable`);

  // resale: A lists cap2 #1 at 1500 → B buys → A +1350 (10% burn), owner flips
  const capType = await prisma.itemType.findUnique({ where: { code: "items_test_cap2" } });
  const aItem = await prisma.item.findFirst({ where: { ownerId: a.id, itemTypeId: capType!.id } });
  const l = await listItem(a.id, aItem!.id, 1500);
  ok(l.ok, `listed at 1500 (range 500..3000 ok)`);
  const lp = await listItem(a.id, aItem!.id, 100);
  ok(!lp.ok, `re-list blocked`);
  const listing = await prisma.itemListing.findFirst({ where: { itemId: aItem!.id } });
  const aBefore = (await prisma.member.findUnique({ where: { id: a.id } }))!.coins;
  const buy = await buyListedItem(b.id, listing!.id);
  const aAfter = (await prisma.member.findUnique({ where: { id: a.id } }))!.coins;
  ok(buy.ok && aAfter - aBefore === 1350, `resale paid seller 1350 (10% burn)`);
  const flipped = await prisma.item.findUnique({ where: { id: aItem!.id } });
  ok(flipped?.ownerId === b.id, `ownership flipped to buyer`);

  // parts: drop until full car (force by minting all 20 then drop once)
  for (const part of CAR_PARTS) {
    await mintItem(drv.id, `part_${part.replace(/[^a-z]/gi, "")}`, { free: true });
  }
  const drop = await dropCarPart(drv.id, 777101);
  ok(!!drop, `part dropped for ride`);
  const fullType = await prisma.itemType.findUnique({ where: { code: "car_full" } });
  const full = await prisma.item.findFirst({ where: { ownerId: drv.id, itemTypeId: fullType!.id } });
  ok(!!full, `20 parts → full car minted`);
  const dropDup = await dropCarPart(drv.id, 777101);
  ok(dropDup === null, `part drop idempotent per ride`);

  // district quest → 10 districts = sayyoh + 5000
  const coinsBefore = (await prisma.member.findUnique({ where: { id: a.id } }))!.coins;
  for (let i = 1; i <= 10; i++) await dropDistrictBadge(a.id, 90000 + i, `Tuman ${i}`);
  const coinsAfterD = (await prisma.member.findUnique({ where: { id: a.id } }))!.coins;
  ok(coinsAfterD - coinsBefore === 5000, `10 districts → sayyoh +5000 (once)`);
  await dropDistrictBadge(a.id, 90001, "Tuman 1");
  ok((await prisma.member.findUnique({ where: { id: a.id } }))!.coins === coinsAfterD, `repeat district no-op`);

  // recruit: rider via drv_ QR → ride1 +500, ride3 +1000, revshare 100 (active driver)
  await prisma.telegramUser.create({ data: { id: `${TAG}-tg-R`, referredByCode: `drv_${drv.id}` } });
  const rider = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-R`, fullName: "Recruited", phone: "+998900006004", trips: 1 } });
  await prisma.telegramUser.update({ where: { id: `${TAG}-tg-R` }, data: { memberId: rider.id } });
  await attachDriverRecruit(`${TAG}-tg-R`, drv.id); // no-op (already linked) — capture path tested via referredByCode above
  // make driver "weekly active" (driver_bonus txn this week)
  await grantCoins(drv.id, 50, "driver_bonus", "test activity");
  await prisma.rideReward.create({ data: { memberId: rider.id, bookingId: 777201, tier: "standard", amount: 100 } });
  const dBefore = (await prisma.member.findUnique({ where: { id: drv.id } }))!.coins;
  await payRecruitRevshare(rider.id, 777201);
  const dAfter = (await prisma.member.findUnique({ where: { id: drv.id } }))!.coins;
  ok(dAfter - dBefore === 600, `ride1: +500 recruit + +100 revshare = 600 (got ${dAfter - dBefore})`);
  await prisma.rideReward.createMany({
    data: [
      { memberId: rider.id, bookingId: 777202, tier: "standard", amount: 100 },
      { memberId: rider.id, bookingId: 777203, tier: "standard", amount: 100 },
    ],
  });
  await payRecruitRevshare(rider.id, 777203);
  const dAfter3 = (await prisma.member.findUnique({ where: { id: drv.id } }))!.coins;
  ok(dAfter3 - dAfter === 1100, `ride3: +1000 milestone + +100 revshare (got ${dAfter3 - dAfter})`);
  await payRecruitRevshare(rider.id, 777203);
  ok((await prisma.member.findUnique({ where: { id: drv.id } }))!.coins === dAfter3, `revshare idempotent per ride`);

  // collection view sane
  const col = await getCollection(a.id);
  ok(col.partsProgress.total === 20 && col.mine.length > 0, `collection view ok (${col.mine.length} items)`);

  // ledger invariants
  for (const id of [a.id, b.id, drv.id]) {
    const bal = (await prisma.member.findUnique({ where: { id } }))!.coins;
    const sum = await prisma.coinTxn.aggregate({ where: { memberId: id }, _sum: { amount: true } });
    ok(Math.abs(bal - (sum._sum.amount ?? 0)) < 0.001, `ledger invariant (member ${id})`);
  }

  await cleanup();
  await prisma.$disconnect();
  console.log(failed === 0 ? "\n🎉 all item/recruit checks passed" : `\n❌ ${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
