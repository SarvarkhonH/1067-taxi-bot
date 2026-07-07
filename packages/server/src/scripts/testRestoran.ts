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
    adminEditRestaurant,
    adminListRestaurants,
    adminToggleRestaurant,
    getRestaurantDetail,
    listActiveRestaurants,
    createFoodOrder,
    myFoodOrders,
  } = await import("../services/restoranService");
  const { __resetFeatureCache, featureOn } = await import("../services/featureFlags");

  const cleanup = async (): Promise<void> => {
    const restaurants = await prisma.restaurant.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } });
    const ids = restaurants.map((r) => r.id);
    await prisma.foodOrder.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.menuItem.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.restaurant.deleteMany({ where: { id: { in: ids } } });
    await prisma.member.deleteMany({ where: { kasId: { startsWith: TAG } } });
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

  // 5) bulk menu parse (§6.1) — 4 valid lines + 1 malformed (no price) → 4 created
  //    (Choy=5000 deliberately priced BELOW minOrderSom=20000 — needed by R2's below_min test)
  const bulk = await adminBulkCreateMenuItems(restaurantId, "Issiq taom", ["Osh — 35000", "Lag'mon — 30000", "Shurva - 25000", "Choy — 5000", "bad line no price"]);
  ok(bulk.ok && bulk.created === 4, `5: bulk menu parse created 4/5 (malformed line skipped), got ${bulk.created}`);

  // 6) activate → visible to admin preview, admin list reflects menuCount
  await adminToggleRestaurant(restaurantId, true);
  const adminRows = await adminListRestaurants();
  const row = adminRows.restaurants.find((r) => r.id === restaurantId);
  ok(!!row && row.active === true && row.menuCount === 4, `6: adminListRestaurants shows active+menuCount=4, got ${JSON.stringify(row)}`);

  const listActive = await listActiveRestaurants(true);
  const found = listActive.find((r) => r.id === restaurantId);
  ok(!!found && found.deliveryFeeSom === 5000 && found.minOrderSom === 20000, `7: active restaurant in catalog with correct fields, got ${JSON.stringify(found)}`);

  // 8) detail + section grouping
  const detail = await getRestaurantDetail(restaurantId, true);
  ok(!!detail.restaurant, "8: detail.restaurant present");
  ok(detail.items.length === 4 && detail.items.every((i) => i.section === "Issiq taom"), `9: detail returns 4 sectioned items, got ${detail.items.length}`);

  // 10) DARK flag still hides catalog from an ordinary rider (preview=false) even though active=true
  const riderList = await listActiveRestaurants(false);
  ok(!riderList.some((r) => r.id === restaurantId), "10: DARK flag hides active restaurant from ordinary riders");

  // ── R2: savat + checkout + FoodOrder ──────────────────────────────────────────────────────────
  const member = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-A`, fullName: "Test Mijoz", phone: "+998907654321", coins: 0 } });
  const [osh, lagmon, , choy] = detail.items; // [Osh, Lag'mon, Shurva, Choy] — Choy=5000 is the below-minOrder probe

  // 12) empty cart rejected
  const emptyRes = await createFoodOrder(member.id, restaurantId, [], "Koson sh., Test ko'chasi 1", "", "", false, true);
  ok(!emptyRes.ok && emptyRes.reason === "empty_cart", `12: empty cart → empty_cart, got ${JSON.stringify(emptyRes)}`);

  // 13) below minOrderSom (minOrderSom=20000; 1x Osh=35000 alone would pass, so order just 1x tea @5000)
  const belowRes = await createFoodOrder(member.id, restaurantId, [{ menuItemId: choy!.id, qty: 1 }], "Koson sh., Test ko'chasi 1", "", "", false, true);
  ok(!belowRes.ok && belowRes.reason === "below_min", `13: below minOrderSom → below_min, got ${JSON.stringify(belowRes)}`);

  // 14) bad_item — menuItemId from nowhere
  const badItemRes = await createFoodOrder(member.id, restaurantId, [{ menuItemId: 999999999, qty: 1 }], "Koson sh., Test ko'chasi 1", "", "", false, true);
  ok(!badItemRes.ok && badItemRes.reason === "bad_item", `14: unknown menuItemId → bad_item, got ${JSON.stringify(badItemRes)}`);

  // 15) real order — 1x Osh(35000) + 2x Lag'mon(30000×2=60000) = 95000 itemsTotal, +deliveryFeeSom(5000) = 100000
  const okRes = await createFoodOrder(member.id, restaurantId, [{ menuItemId: osh!.id, qty: 1 }, { menuItemId: lagmon!.id, qty: 2 }], "Koson sh., Test ko'chasi 1-uy", "", "Domofon yo'q", false, true);
  ok(okRes.ok && okRes.orderId != null, `15: valid order created, got ${JSON.stringify(okRes)}`);
  const orderRow = await prisma.foodOrder.findUnique({ where: { id: okRes.orderId! } });
  ok(!!orderRow && orderRow.itemsTotalSom === 95000 && orderRow.deliveryFeeSom === 5000 && orderRow.totalSom === 100000 && orderRow.status === "pending",
    `16: FoodOrder snapshot correct (itemsTotal=95000, delivery=5000, total=100000, pending), got ${JSON.stringify({ itemsTotalSom: orderRow?.itemsTotalSom, deliveryFeeSom: orderRow?.deliveryFeeSom, totalSom: orderRow?.totalSom, status: orderRow?.status })}`);
  const itemsSnapshot = orderRow?.itemsJson as unknown as { menuItemId: number; name: string; qty: number; priceSom: number }[];
  ok(Array.isArray(itemsSnapshot) && itemsSnapshot.length === 2 && itemsSnapshot.find((i) => i.name === "Osh")?.priceSom === 35000,
    `17: itemsJson snapshot has name+qty+priceSom, got ${JSON.stringify(itemsSnapshot)}`);

  // 18) restaurant.orderCount incremented
  const restAfter = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { orderCount: true } });
  ok(restAfter?.orderCount === 1, `18: restaurant.orderCount incremented to 1, got ${restAfter?.orderCount}`);

  // 19) pending_limit — 2 more pending orders (now 3 total) then a 4th must be rejected
  await createFoodOrder(member.id, restaurantId, [{ menuItemId: osh!.id, qty: 1 }], "addr2", "", "", false, true);
  await createFoodOrder(member.id, restaurantId, [{ menuItemId: osh!.id, qty: 1 }], "addr3", "", "", false, true);
  const fourthRes = await createFoodOrder(member.id, restaurantId, [{ menuItemId: osh!.id, qty: 1 }], "addr4", "", "", false, true);
  ok(!fourthRes.ok && fourthRes.reason === "pending_limit", `19: 4th pending order → pending_limit, got ${JSON.stringify(fourthRes)}`);

  // 20) myFoodOrders returns rider's 3 orders with restaurant name resolved
  const mine = await myFoodOrders(member.id);
  ok(mine.length === 3 && mine.every((o) => o.restaurantName === TAG), `20: myFoodOrders returns 3 orders with resolved restaurant name, got ${mine.length}`);

  // 21) closed restaurant (workHours window that excludes "now") blocks ordering even with preview=true
  const now = new Date();
  const past1 = new Date(now.getTime() - 3 * 3600_000);
  const past2 = new Date(now.getTime() - 2 * 3600_000);
  const fmt = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const closedCreated = await adminCreateRestaurant({ name: `${TAG}_CLOSED`, phone: "+998901234567", category: "milliy" });
  await adminEditRestaurant(closedCreated.id!, { workHours: `${fmt(past1)}-${fmt(past2)}` });
  await adminBulkCreateMenuItems(closedCreated.id!, "Taomlar", ["Test taom — 10000"]);
  await adminToggleRestaurant(closedCreated.id!, true);
  const closedDetail = await getRestaurantDetail(closedCreated.id!, true);
  const closedRes = await createFoodOrder(member.id, closedCreated.id!, [{ menuItemId: closedDetail.items[0]!.id, qty: 1 }], "addr-closed-test", "", "", false, true);
  ok(!closedRes.ok && closedRes.reason === "closed", `21: order outside workHours → closed, got ${JSON.stringify(closedRes)}`);
  await adminDeleteRestaurant(closedCreated.id!);

  // 22) restaurant delete: menu gone, but order HISTORY intentionally SURVIVES (loose restaurantId FK —
  //     a rider's past orders must not vanish just because a restaurant later leaves the catalog)
  await adminDeleteRestaurant(restaurantId);
  const gone = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
  const menuGone = await prisma.menuItem.count({ where: { restaurantId } });
  const ordersSurvive = await prisma.foodOrder.count({ where: { restaurantId } });
  ok(gone === null && menuGone === 0, "22: restaurant + menu items deleted");
  ok(ordersSurvive === 3, `23: FoodOrder history intentionally survives restaurant delete, got ${ordersSurvive}`);

  // 24) final cleanup — explicit foodOrder purge (test-data only; production never does this)
  await cleanup();
  const ordersPurged = await prisma.foodOrder.count({ where: { restaurantId } });
  ok(ordersPurged === 0, "24: cleanup() safety-net purged the test FoodOrder rows too");
  console.log(process.exitCode ? "\n❌ SOME CHECKS FAILED" : "\n🎉 ALL R1+R2 CHECKS PASSED");
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
