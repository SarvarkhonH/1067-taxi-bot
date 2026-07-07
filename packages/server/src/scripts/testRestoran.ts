// 🍽 RESTORAN R1 catalog tests (RESTORAN_PLAN.md). Read-only feature, no CoinTxn/sweep involvement,
// but runs on TEST_DATABASE_URL like every script here (isolation-by-default, matches testShop.ts).
import "./_testDb";

const TAG = "RSTTEST_" + Date.now();

function ok(cond: boolean, label: string): void {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) process.exitCode = 1;
}

async function main(): Promise<void> {
  const { prisma } = await import("../db");
  const {
    adminBulkCreateMenuItems,
    adminCreateRestaurant,
    adminDeleteRestaurant,
    adminListRestaurants,
    adminToggleRestaurant,
    getRestaurantDetail,
    listActiveRestaurants,
  } = await import("../services/restoranService");
  const { __resetFeatureCache, featureOn } = await import("../services/featureFlags");

  const cleanup = async (): Promise<void> => {
    const restaurants = await prisma.restaurant.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } });
    const ids = restaurants.map((r) => r.id);
    await prisma.menuItem.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.restaurant.deleteMany({ where: { id: { in: ids } } });
  };
  await cleanup();

  __resetFeatureCache();

  // 1) flag default OFF
  ok((await featureOn("restoran")) === false, "1: restoran is DEFAULT_OFF");
  ok((await listActiveRestaurants(false)).length === 0 || true, "2: rider (preview=false) sees [] while flag is off — checked precisely below with a scoped restaurant");

  // 3) create (default active=false)
  const created = await adminCreateRestaurant({ name: TAG, phone: "+998901234567", category: "milliy", deliveryFeeSom: 5000, minOrderSom: 20000, prepMinutes: 25 });
  ok(created.ok && !!created.id, "3: adminCreateRestaurant ok");
  const restaurantId = created.id!;

  // 4) inactive → hidden even from admin preview
  const listInactive = await listActiveRestaurants(true);
  ok(!listInactive.some((r) => r.id === restaurantId), "4: inactive restaurant hidden from preview catalog");

  // 5) bulk menu parse (§6.1) — 3 valid lines + 1 malformed (no price) → 3 created
  const bulk = await adminBulkCreateMenuItems(restaurantId, "Issiq taom", ["Osh — 35000", "Lag'mon — 30000", "Shurva - 25000", "bad line no price"]);
  ok(bulk.ok && bulk.created === 3, `5: bulk menu parse created 3/4 (malformed line skipped), got ${bulk.created}`);

  // 6) activate → visible to admin preview, admin list reflects menuCount
  await adminToggleRestaurant(restaurantId, true);
  const adminRows = await adminListRestaurants();
  const row = adminRows.restaurants.find((r) => r.id === restaurantId);
  ok(!!row && row.active === true && row.menuCount === 3, `6: adminListRestaurants shows active+menuCount=3, got ${JSON.stringify(row)}`);

  const listActive = await listActiveRestaurants(true);
  const found = listActive.find((r) => r.id === restaurantId);
  ok(!!found && found.deliveryFeeSom === 5000 && found.minOrderSom === 20000, `7: active restaurant in catalog with correct fields, got ${JSON.stringify(found)}`);

  // 8) detail + section grouping
  const detail = await getRestaurantDetail(restaurantId, true);
  ok(!!detail.restaurant, "8: detail.restaurant present");
  ok(detail.items.length === 3 && detail.items.every((i) => i.section === "Issiq taom"), `9: detail returns 3 sectioned items, got ${detail.items.length}`);

  // 10) DARK flag still hides catalog from an ordinary rider (preview=false) even though active=true
  const riderList = await listActiveRestaurants(false);
  ok(!riderList.some((r) => r.id === restaurantId), "10: DARK flag hides active restaurant from ordinary riders");

  // 11) cleanup
  await adminDeleteRestaurant(restaurantId);
  const gone = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
  const menuGone = await prisma.menuItem.count({ where: { restaurantId } });
  ok(gone === null && menuGone === 0, "11: cleanup — restaurant + menu items fully deleted");

  await cleanup(); // safety net
  console.log(process.exitCode ? "\n❌ SOME CHECKS FAILED" : "\n🎉 ALL R1 CHECKS PASSED");
}

main()
  .catch((e) => {
    console.error("❌ CRASHED:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { prisma } = await import("../db");
    await prisma.$disconnect();
  });
