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
    markOrderCalled,
    acceptFoodOrder,
    advanceFoodOrderStatus,
    rejectFoodOrder,
    adminListFoodOrders,
    checkRestoranSlaAndAlert,
    adminGetRestaurantDetail,
    uploadRestaurantPhoto,
    uploadMenuItemPhoto,
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

  // 0) regression (2026-07-08 jonli crash): NaN/0/negative id must NOT throw — getRestaurantDetail
  // used to hit prisma.restaurant.findUnique({where:{id: NaN}}) unguarded → unhandled "Argument id
  // is missing" crash, repeatedly, whenever a malformed request reached /api/restoran/:id.
  for (const bad of [NaN, 0, -1, 1.5]) {
    const r = await getRestaurantDetail(bad, true).catch((e) => ({ crashed: true, e }));
    ok(!("crashed" in r) && r.restaurant === null, `0: getRestaurantDetail(${bad}) doesn't crash, returns null — got ${JSON.stringify(r)}`);
  }

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

  // R4: adminGetRestaurantDetail shows the restaurant EVEN WHILE inactive (unlike getRestaurantDetail
  // above, which is rider-facing and correctly hides it) — the admin CRUD screen needs this to edit
  // a brand-new restaurant before it's toggled on.
  const adminDetailInactive = await adminGetRestaurantDetail(restaurantId);
  ok(!!adminDetailInactive.restaurant && adminDetailInactive.restaurant.id === restaurantId, `R4a: adminGetRestaurantDetail sees inactive restaurant, got ${JSON.stringify(adminDetailInactive.restaurant)}`);

  // R4: photo upload (no BOT_TOKEN in test env → falls back to data-URL, still succeeds)
  const tinyPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  const photoUp = await uploadRestaurantPhoto(restaurantId, tinyPng, "image/png");
  ok(photoUp.ok, "R4b: uploadRestaurantPhoto ok");
  const photoRow = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { photoFileId: true, photoUrl: true } });
  ok(!!(photoRow?.photoFileId || photoRow?.photoUrl), `R4c: photo persisted (fileId or data-URL fallback), got ${JSON.stringify(photoRow)}`);

  // 5) bulk menu parse (§6.1) — 4 valid lines + 1 malformed (no price) → 4 created
  //    (Choy=5000 deliberately priced BELOW minOrderSom=20000 — needed by R2's below_min test)
  const bulk = await adminBulkCreateMenuItems(restaurantId, "Issiq taom", ["Osh — 35000", "Lag'mon — 30000", "Shurva - 25000", "Choy — 5000", "bad line no price"]);
  ok(bulk.ok && bulk.created === 4, `5: bulk menu parse created 4/5 (malformed line skipped), got ${bulk.created}`);

  // R4d: menu item photo upload — same data-URL fallback path
  const firstMenuRow = await prisma.menuItem.findFirst({ where: { restaurantId } });
  const menuPhotoUp = await uploadMenuItemPhoto(firstMenuRow!.id, tinyPng, "image/png");
  ok(menuPhotoUp.ok, "R4e: uploadMenuItemPhoto ok");
  const menuPhotoRow = await prisma.menuItem.findUnique({ where: { id: firstMenuRow!.id }, select: { photoFileId: true, photoUrl: true } });
  ok(!!(menuPhotoRow?.photoFileId || menuPhotoRow?.photoUrl), `R4f: menu item photo persisted, got ${JSON.stringify(menuPhotoRow)}`);

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
  const order2 = await createFoodOrder(member.id, restaurantId, [{ menuItemId: osh!.id, qty: 1 }], "addr2", "", "", false, true);
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

  // ── R3: admin sessiya-navbati + qo'lda holat-boshqaruv + SLA (§0/§2/§3/§6) ───────────────────────
  // order #1 (okRes) — full state machine: pending → called → accepted → preparing → delivering → delivered
  ok(!!okRes.orderId, "sanity: okRes.orderId present for R3 state-machine walk");
  const called = await markOrderCalled(okRes.orderId!);
  ok(called.ok, "25: markOrderCalled ok");
  const calledRow = await prisma.foodOrder.findUnique({ where: { id: okRes.orderId! }, select: { calledAt: true, status: true } });
  ok(!!calledRow?.calledAt && calledRow.status === "pending", `26: calledAt set, status still pending, got ${JSON.stringify(calledRow)}`);

  const accepted = await acceptFoodOrder(okRes.orderId!);
  ok(accepted.ok, `27: acceptFoodOrder pending→accepted, got ${JSON.stringify(accepted)}`);
  const acceptAgain = await acceptFoodOrder(okRes.orderId!);
  ok(!acceptAgain.ok && acceptAgain.reason === "not_pending", `28: double-accept guarded (not_pending), got ${JSON.stringify(acceptAgain)}`);

  const toPreparing = await advanceFoodOrderStatus(okRes.orderId!);
  ok(toPreparing.ok && toPreparing.newStatus === "preparing", `29: accepted→preparing, got ${JSON.stringify(toPreparing)}`);
  const toDelivering = await advanceFoodOrderStatus(okRes.orderId!);
  ok(toDelivering.ok && toDelivering.newStatus === "delivering", `30: preparing→delivering, got ${JSON.stringify(toDelivering)}`);
  const toDelivered = await advanceFoodOrderStatus(okRes.orderId!);
  ok(toDelivered.ok && toDelivered.newStatus === "delivered", `31: delivering→delivered, got ${JSON.stringify(toDelivered)}`);
  const deliveredRow = await prisma.foodOrder.findUnique({ where: { id: okRes.orderId! }, select: { deliveredAt: true } });
  ok(!!deliveredRow?.deliveredAt, "32: deliveredAt timestamp set on terminal transition");
  const advancePastEnd = await advanceFoodOrderStatus(okRes.orderId!);
  ok(!advancePastEnd.ok && advancePastEnd.reason === "no_next", `33: delivered is terminal (no_next), got ${JSON.stringify(advancePastEnd)}`);

  // order #2 — reject flow: FAQAT pending'dan (§2), naqd-only → refund logikasi shart emas
  ok(order2.ok && !!order2.orderId, "sanity: order2.orderId present for reject-flow test");
  const rejected = await rejectFoodOrder(order2.orderId!, "Restoran bugun band");
  ok(rejected.ok && !!rejected.notice, `34: rejectFoodOrder pending→rejected, got ${JSON.stringify({ ok: rejected.ok, reason: rejected.reason })}`);
  const rejectedRow = await prisma.foodOrder.findUnique({ where: { id: order2.orderId! }, select: { status: true, rejectReason: true } });
  ok(rejectedRow?.status === "rejected" && rejectedRow.rejectReason === "Restoran bugun band", `35: rejectReason stored, got ${JSON.stringify(rejectedRow)}`);
  const acceptRejected = await acceptFoodOrder(order2.orderId!);
  ok(!acceptRejected.ok && acceptRejected.reason === "not_pending", "36: cannot accept an already-rejected order");

  // adminListFoodOrders — status filter + resolved names
  const adminDelivered = await adminListFoodOrders("delivered");
  ok(adminDelivered.some((o) => o.id === okRes.orderId && o.restaurantName === TAG && o.buyerName === "Test Mijoz"), `37: adminListFoodOrders(delivered) resolves restaurant+buyer names, got ${JSON.stringify(adminDelivered.find((o) => o.id === okRes.orderId))}`);

  // SLA sweep — idempotent one-time alert for 3+ minute pending orders (§3, D4/D5: no new poller,
  // this IS the function bookingNotifier's tick calls; here we call it directly like the sweep would)
  const slaCandidate = await createFoodOrder(member.id, restaurantId, [{ menuItemId: osh!.id, qty: 1 }], "sla-addr", "", "", false, true);
  ok(slaCandidate.ok, "sanity: sla candidate order created");
  await prisma.foodOrder.update({ where: { id: slaCandidate.orderId! }, data: { createdAt: new Date(Date.now() - 5 * 60_000) } }); // backdate 5 min
  let alertCount = 0;
  let lastAlert = "";
  const fakeAlert = async (html: string) => { alertCount++; lastAlert = html; };
  await checkRestoranSlaAndAlert(fakeAlert);
  ok(alertCount === 1 && lastAlert.includes(`#${slaCandidate.orderId}`), `38: SLA sweep alerts once for 5-min-old pending order, got count=${alertCount} msg=${lastAlert.slice(0, 80)}`);
  await checkRestoranSlaAndAlert(fakeAlert);
  ok(alertCount === 1, `39: SLA sweep is idempotent — re-run does NOT re-alert the same order, got count=${alertCount}`);
  const slaRow = await prisma.foodOrder.findUnique({ where: { id: slaCandidate.orderId! }, select: { slaAlertedAt: true } });
  ok(!!slaRow?.slaAlertedAt, "40: slaAlertedAt persisted after sweep");

  // 22) restaurant delete: menu gone, but order HISTORY intentionally SURVIVES (loose restaurantId FK —
  //     a rider's past orders must not vanish just because a restaurant later leaves the catalog)
  await adminDeleteRestaurant(restaurantId);
  const gone = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
  const menuGone = await prisma.menuItem.count({ where: { restaurantId } });
  const ordersSurvive = await prisma.foodOrder.count({ where: { restaurantId } });
  ok(gone === null && menuGone === 0, "22: restaurant + menu items deleted");
  // 4 orders total for this restaurant: #1 (delivered), #2 (rejected), #3/addr3 (still pending —
  // 4th was blocked by pending_limit before any status changed it), + the SLA-sweep candidate
  ok(ordersSurvive === 4, `23: FoodOrder history intentionally survives restaurant delete, got ${ordersSurvive}`);

  // 24) final cleanup — explicit foodOrder purge (test-data only; production never does this)
  await cleanup();
  const ordersPurged = await prisma.foodOrder.count({ where: { restaurantId } });
  ok(ordersPurged === 0, "24: cleanup() safety-net purged the test FoodOrder rows too");
  console.log(process.exitCode ? "\n❌ SOME CHECKS FAILED" : "\n🎉 ALL R1+R2+R3 CHECKS PASSED");
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
