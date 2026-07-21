// 🏪 BirJoy V1 marketplace tests — TEST_DATABASE_URL'da (_testDb refuses app DB).
// V1.2 seller-scope: har seller faqat O'Z do'koni satrlarini ko'radi/o'zgartiradi.
import "./_testDb";
process.env.KAS_MODE = "mock";

const TAG = "BAZARTEST";

function ok(cond: boolean, label: string): void {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) process.exitCode = 1;
}

async function main(): Promise<void> {
  const { prisma } = await import("../db");
  const { adminListProducts, adminCreateProduct, adminListPurchases, adminListReviews, productBelongsToShop, buyProduct, adminToggleProduct } = await import("../services/shopService");
  const { setFeature, __resetFeatureCache } = await import("../services/featureFlags");

  const cleanup = async (): Promise<void> => {
    const members = await prisma.member.findMany({ where: { kasId: { startsWith: TAG } } });
    const ids = members.map((m) => m.id);
    await prisma.shopPurchase.deleteMany({ where: { memberId: { in: ids } } });
    await prisma.coinTxn.deleteMany({ where: { memberId: { in: ids } } });
    const prods = await prisma.product.findMany({ where: { category: TAG }, select: { id: true } });
    await prisma.productPhoto.deleteMany({ where: { productId: { in: prods.map((p) => p.id) } } });
    await prisma.productReview.deleteMany({ where: { productId: { in: prods.map((p) => p.id) } } });
    await prisma.product.deleteMany({ where: { category: TAG } });
    await prisma.marketShop.deleteMany({ where: { name: { startsWith: TAG } } });
    await prisma.member.deleteMany({ where: { id: { in: ids } } });
    await prisma.appState.deleteMany({ where: { key: "feature:shop" } });
  };
  await cleanup();
  await setFeature("shop", true);
  __resetFeatureCache();

  // setup: 2 do'kon, har birida 1 mahsulot; 1 xaridor
  const shopA = await prisma.marketShop.create({ data: { name: `${TAG}-A`, phone: "+998900000001", active: true } });
  const shopB = await prisma.marketShop.create({ data: { name: `${TAG}-B`, phone: "+998900000002", active: true } });
  const pA = await adminCreateProduct({ name: "A-mahsulot", priceTanga: 1000, stock: 5, category: TAG }, shopA.id);
  const pB = await adminCreateProduct({ name: "B-mahsulot", priceTanga: 2000, stock: 5, category: TAG }, shopB.id);
  ok(pA.ok && pB.ok, "1: scoped create ok (forceShopId)");
  await adminToggleProduct(pA.id!, true);
  await adminToggleProduct(pB.id!, true);

  // 1) create forceShopId haqiqatan yozildi
  const rowA = await prisma.product.findUnique({ where: { id: pA.id! } });
  const rowB = await prisma.product.findUnique({ where: { id: pB.id! } });
  ok(rowA?.shopId === shopA.id && rowB?.shopId === shopB.id, "1: products stamped with their shopId");

  // 2) adminListProducts scope: A faqat o'zini ko'radi; owner (scope'siz) ikkalasini
  const listA = await adminListProducts(shopA.id);
  ok(listA.products.some((p) => p.id === pA.id) && listA.products.every((p) => p.id !== pB.id), "2: seller-A list = only A's products");
  const listAll = await adminListProducts();
  ok(listAll.products.some((p) => p.id === pA.id) && listAll.products.some((p) => p.id === pB.id), "2: owner list = all products");

  // 3) productBelongsToShop choke-point
  ok((await productBelongsToShop(pA.id!, shopA.id)) === true, "3: A's product belongs to A");
  ok((await productBelongsToShop(pA.id!, shopB.id)) === false, "3: A's product NOT B's (edit/photo 403 path)");
  ok((await productBelongsToShop(999999, shopA.id)) === false, "3: unknown product → false");

  // 4) orders scope: B-mahsulotga buyurtma → A ko'rmaydi, B ko'radi, owner ko'radi
  const buyer = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-M`, fullName: "Bazar M", phone: "+998901112233", coins: 10_000 } });
  const buy = await buyProduct(buyer.id, pB.id!, "Koson sh., Bozor ko'chasi 5", true);
  ok(buy.ok === true, "4: setup buy on B's product ok");
  const ordersA = await adminListPurchases(undefined, shopA.id);
  const ordersB = await adminListPurchases(undefined, shopB.id);
  const ordersOwner = await adminListPurchases();
  ok(ordersA.every((o) => o.id !== buy.orderId), "4: seller-A does NOT see B's order (PII scope)");
  ok(ordersB.some((o) => o.id === buy.orderId), "4: seller-B sees own order");
  ok(ordersOwner.some((o) => o.id === buy.orderId), "4: owner sees all orders");

  // 5) reviews scope
  await prisma.productReview.create({ data: { productId: pB.id!, memberId: buyer.id, thumb: "up", text: "zo'r" } });
  const revA = await adminListReviews(shopA.id);
  const revB = await adminListReviews(shopB.id);
  ok(revA.every((r) => r.productId !== pB.id), "5: seller-A does NOT see B's reviews");
  ok(revB.some((r) => r.productId === pB.id), "5: seller-B sees own reviews");

  // 6) pendingOrders badge scope'da
  ok(listA.pendingOrders === 0, "6: A's pending badge = 0 (order is B's)");
  const listB2 = await adminListProducts(shopB.id);
  ok(listB2.pendingOrders === 1, "6: B's pending badge = 1");

  // 7) V1.5 SLA-sweep: 15+ daq javobsiz pending → BIR marta alert (idempotent slaAlertedAt)
  const { checkShopSlaAndAlert } = await import("../services/shopService");
  await prisma.shopPurchase.update({ where: { id: buy.orderId! }, data: { createdAt: new Date(Date.now() - 20 * 60_000) } });
  const alerts: string[] = [];
  const captureAlert = async (html: string): Promise<void> => { alerts.push(html); };
  await checkShopSlaAndAlert(captureAlert);
  ok(alerts.length === 1 && alerts[0]!.includes(`#${buy.orderId}`), "7: SLA alert fired once with order id");
  await checkShopSlaAndAlert(captureAlert);
  ok(alerts.length === 1, "7: second sweep = NO duplicate alert (slaAlertedAt marker)");
  ok((await prisma.shopPurchase.findUnique({ where: { id: buy.orderId! } }))!.slaAlertedAt !== null, "7: slaAlertedAt stamped");

  // ── 🧺 V2.1 MarketOrder pul-yadrosi ──────────────────────────────────────────────────────────
  const { createMarketOrder, advanceMarketOrder, rejectMarketOrder, cancelMarketOrder, myMarketOrders } = await import("../services/marketOrderService");
  const { setFeature: setF, __resetFeatureCache: resetF } = await import("../services/featureFlags");
  const cleanupMkt = async (): Promise<void> => {
    const members = await prisma.member.findMany({ where: { kasId: { startsWith: TAG } }, select: { id: true } });
    await prisma.marketOrder.deleteMany({ where: { memberId: { in: members.map((m) => m.id) } } });
    await prisma.appState.deleteMany({ where: { key: "feature:bazarcart" } });
  };
  await cleanupMkt();

  // setup: do'kon C (minOrder 5000, deliveryFee 2000) + 2 mahsulot
  const shopC = await prisma.marketShop.create({ data: { name: `${TAG}-C`, phone: "+998900000003", active: true, minOrderTanga: 5000, deliveryFeeSom: 2000 } });
  const pC1 = await adminCreateProduct({ name: "C1", priceTanga: 3000, stock: 10, category: TAG }, shopC.id);
  const pC2 = await adminCreateProduct({ name: "C2", priceTanga: 4000, stock: 2, category: TAG }, shopC.id);
  await adminToggleProduct(pC1.id!, true);
  await adminToggleProduct(pC2.id!, true);
  const CART = [{ productId: pC1.id!, qty: 2 }, { productId: pC2.id!, qty: 1 }]; // 2*3000+4000 = 10000 (+2000 = 12000)
  const m2 = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-M2`, fullName: "Bazar M2", phone: "+998901112244", coins: 50_000 } });

  // 8) flag DARK → off; preview o'tadi
  resetF();
  ok((await createMarketOrder(m2.id, shopC.id, CART, "Koson, Test 7", "tanga")).reason === "off", "8: bazarcart DARK → off");
  await setF("bazarcart", true);
  resetF();

  // 9) happy checkout (tanga): snapshot, hold, stock, ledger
  const balBefore9 = (await prisma.member.findUnique({ where: { id: m2.id } }))!.coins;
  const co = await createMarketOrder(m2.id, shopC.id, CART, "Koson, Test 7", "tanga");
  ok(co.ok === true && !!co.orderId, "9: cart checkout ok");
  ok((await prisma.member.findUnique({ where: { id: m2.id } }))!.coins === balBefore9 - 12_000, "9: total (items+delivery) held once");
  ok((await prisma.coinTxn.count({ where: { idempotencyKey: `mkt:${co.orderId}` } })) === 1, "9: CoinTxn mkt:<id> exists");
  ok((await prisma.product.findUnique({ where: { id: pC1.id! } }))!.stock === 8, "9: line-1 stock 10→8");
  ok((await prisma.product.findUnique({ where: { id: pC2.id! } }))!.stock === 1, "9: line-2 stock 2→1");
  const mo = await prisma.marketOrder.findUnique({ where: { id: co.orderId! } });
  ok(mo!.itemsTotal === 10_000 && mo!.total === 12_000 && mo!.shopName === `${TAG}-C`, "9: snapshot totals+shopName");

  // 10) dublikat 60s → duplicate; min-order → min_order
  ok((await createMarketOrder(m2.id, shopC.id, CART, "Koson, Test 7", "tanga")).reason === "duplicate", "10: same cart within 60s → duplicate");
  ok((await createMarketOrder(m2.id, shopC.id, [{ productId: pC1.id!, qty: 1 }], "Koson, Test 7", "tanga")).reason === "min_order", "10: below minOrder rejected");

  // 11) hammasi-yoki-hech-nima: 2-satr stock yetmasa 1-satr ham qaytadi
  const big = [{ productId: pC1.id!, qty: 1 }, { productId: pC2.id!, qty: 5 }]; // pC2 stock=1 < 5
  const s1Before = (await prisma.product.findUnique({ where: { id: pC1.id! } }))!.stock;
  const failCo = await createMarketOrder(m2.id, shopC.id, big, "Koson, Test 7", "tanga");
  ok(failCo.ok === false && failCo.reason === "sold_out" && failCo.soldOutProductId === pC2.id, "11: partial-stock → sold_out with product id");
  ok((await prisma.product.findUnique({ where: { id: pC1.id! } }))!.stock === s1Before, "11: line-1 stock ROLLED BACK (all-or-nothing)");
  ok((await prisma.coinTxn.count({ where: { memberId: m2.id, kind: "shop" } })) === 1, "11: no extra hold on failed checkout");

  // 12) status-mashina: pending→accepted→delivering→delivered; delivered'dan reject o'tmaydi
  ok((await advanceMarketOrder(co.orderId!)).newStatus === "accepted", "12: pending→accepted");
  ok((await advanceMarketOrder(co.orderId!)).newStatus === "delivering", "12: accepted→delivering");
  ok((await advanceMarketOrder(co.orderId!)).newStatus === "delivered", "12: delivering→delivered");
  ok((await rejectMarketOrder(co.orderId!)).ok === false, "12: reject-after-delivered refused");
  ok((await prisma.coinTxn.count({ where: { idempotencyKey: `mktrefund:${co.orderId}` } })) === 0, "12: delivered → zero refund rows");

  // 13) parallel reject×2 (accepted holatdan) → 1 g'olib, 1 refund, restock-hammasi bir marta
  const co2 = await createMarketOrder(m2.id, shopC.id, [{ productId: pC1.id!, qty: 2 }], "Koson, Test 7", "tanga");
  ok(co2.ok === true, "13: setup checkout ok");
  await advanceMarketOrder(co2.orderId!); // accepted
  const balBefore13 = (await prisma.member.findUnique({ where: { id: m2.id } }))!.coins;
  const st13 = (await prisma.product.findUnique({ where: { id: pC1.id! } }))!.stock;
  const [rA, rB] = await Promise.all([rejectMarketOrder(co2.orderId!, "sabab"), rejectMarketOrder(co2.orderId!, "sabab")]);
  ok([rA.ok, rB.ok].filter(Boolean).length === 1, "13: parallel reject×2 → ONE winner");
  ok((await prisma.coinTxn.count({ where: { idempotencyKey: `mktrefund:${co2.orderId}` } })) === 1, "13: exactly ONE mktrefund row");
  ok((await prisma.member.findUnique({ where: { id: m2.id } }))!.coins === balBefore13 + 8_000, "13: full total refunded once (6000 items + 2000 delivery)");
  ok((await prisma.product.findUnique({ where: { id: pC1.id! } }))!.stock === st13 + 2, "13: restocked exactly once (qty=2)");

  // 14) refund-in'ektsiya: kalit band → tx rollback → order AVVALGI holatda qoladi, retry ishlaydi
  const co3 = await createMarketOrder(m2.id, shopC.id, [{ productId: pC2.id!, qty: 1 }, { productId: pC1.id!, qty: 1 }], "Koson, Test 7", "tanga");
  ok(co3.ok === true, "14: durability-setup ok");
  await prisma.coinTxn.create({ data: { memberId: m2.id, amount: 0, kind: "test_blocker", reason: "V2 injection", idempotencyKey: `mktrefund:${co3.orderId}` } });
  const rejFail2 = await rejectMarketOrder(co3.orderId!);
  ok(rejFail2.ok === false && rejFail2.reason === "retry", "14: refund failure → retry (not silent)");
  ok((await prisma.marketOrder.findUnique({ where: { id: co3.orderId! } }))!.status === "pending", "14: order REMAINS pending (rollback)");
  await prisma.coinTxn.delete({ where: { idempotencyKey: `mktrefund:${co3.orderId}` } });
  ok((await rejectMarketOrder(co3.orderId!)).ok === true, "14: retry succeeds after unblock");

  // 15) CASH: hold yo'q, refund yo'q, restock bor; rider-cancel faqat pending + faqat o'ziniki
  const balBefore15 = (await prisma.member.findUnique({ where: { id: m2.id } }))!.coins;
  const cashCo = await createMarketOrder(m2.id, shopC.id, [{ productId: pC1.id!, qty: 2 }], "Koson, Test 7", "cash");
  ok(cashCo.ok === true, "15: cash checkout ok");
  ok((await prisma.member.findUnique({ where: { id: m2.id } }))!.coins === balBefore15, "15: cash → coins UNTOUCHED");
  ok((await prisma.coinTxn.count({ where: { idempotencyKey: `mkt:${cashCo.orderId}` } })) === 0, "15: cash → no hold txn");
  ok((await cancelMarketOrder(cashCo.orderId!, buyer.id)).ok === false, "15: FOREIGN member cannot cancel (ownership guard)");
  const st15 = (await prisma.product.findUnique({ where: { id: pC1.id! } }))!.stock;
  ok((await cancelMarketOrder(cashCo.orderId!, m2.id)).ok === true, "15: own pending cancel ok");
  ok((await prisma.product.findUnique({ where: { id: pC1.id! } }))!.stock === st15 + 2, "15: cancel restocks");
  ok((await prisma.coinTxn.count({ where: { idempotencyKey: `mktrefund:${cashCo.orderId}` } })) === 0, "15: cash cancel → NO refund row (no mint)");
  ok((await prisma.member.findUnique({ where: { id: m2.id } }))!.coins === balBefore15, "15: cash cancel → coins still untouched");

  // 16) myMarketOrders + SLA MarketOrder-qamrovi
  const myMkt = await myMarketOrders(m2.id);
  ok(myMkt.length >= 4 && myMkt[0]!.items.length >= 1, "16: myMarketOrders returns snapshots");
  const co4 = await createMarketOrder(m2.id, shopC.id, [{ productId: pC1.id!, qty: 2 }], "Koson, Test 7", "cash");
  await prisma.marketOrder.update({ where: { id: co4.orderId! }, data: { createdAt: new Date(Date.now() - 20 * 60_000) } });
  const alerts2: string[] = [];
  await checkShopSlaAndAlert(async (h) => { alerts2.push(h); });
  ok(alerts2.length === 1 && alerts2[0]!.includes(`🧺 #${co4.orderId}`), "16: SLA sweep covers MarketOrder");
  await checkShopSlaAndAlert(async (h) => { alerts2.push(h); });
  ok(alerts2.length === 1, "16: MarketOrder SLA idempotent");

  await cleanupMkt();
  await cleanup();
  console.log(process.exitCode ? "\n❌ FAILED" : "\n✅ ALL GREEN");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
