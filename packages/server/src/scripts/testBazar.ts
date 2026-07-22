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
  const { adminListProducts, adminCreateProduct, adminListPurchases, adminListReviews, productBelongsToShop, buyProduct, adminToggleProduct, listActiveProducts, deliverPurchase, rejectPurchase } = await import("../services/shopService");
  const { setFeature, __resetFeatureCache } = await import("../services/featureFlags");

  const cleanup = async (): Promise<void> => {
    const members = await prisma.member.findMany({ where: { kasId: { startsWith: TAG } } });
    const ids = members.map((m) => m.id);
    await prisma.shopPurchase.deleteMany({ where: { memberId: { in: ids } } });
    await prisma.coinTxn.deleteMany({ where: { memberId: { in: ids } } });
    await prisma.productFavorite.deleteMany({ where: { memberId: { in: ids } } });
    const prods = await prisma.product.findMany({ where: { category: TAG }, select: { id: true } });
    await prisma.productPhoto.deleteMany({ where: { productId: { in: prods.map((p) => p.id) } } });
    await prisma.productReview.deleteMany({ where: { productId: { in: prods.map((p) => p.id) } } });
    await prisma.product.deleteMany({ where: { category: TAG } });
    await prisma.marketShop.deleteMany({ where: { name: { startsWith: TAG } } });
    await prisma.member.deleteMany({ where: { id: { in: ids } } });
    await prisma.appState.deleteMany({ where: { key: { in: ["feature:shop", "feature:shopcashback", "feature:revtanga"] } } });
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

  // ── 🧡 V2b: sevimlilar ────────────────────────────────────────────────────────────────────────
  const { toggleProductFavorite, listFavoriteProducts } = await import("../services/shopService");
  const favProd = await adminCreateProduct({ name: "Fav mahsulot", priceTanga: 5000, stock: 5, category: TAG }, shopC.id);
  await adminToggleProduct(favProd.id!, true);

  // 17) toggle on → favCount 0→1, idempotent (ikkinchi "on" qayta oshirmaydi)
  const t1 = await toggleProductFavorite(m2.id, favProd.id!, true);
  ok(t1.ok === true && t1.on === true && t1.favCount === 1, "17: fav ON → favCount 1");
  const t2 = await toggleProductFavorite(m2.id, favProd.id!, true);
  ok(t2.favCount === 1, "17: duplicate ON → favCount STAYS 1 (idempotent)");
  const listed = await listActiveProducts(true, m2.id);
  ok(listed.find((p) => p.id === favProd.id)?.isFav === true, "17: listActiveProducts marks isFav for this member");
  ok(listed.find((p) => p.id === favProd.id)?.favCount === 1, "17: favCount flows to the view");

  // 18) boshqa a'zo uchun isFav=false (shaxsiy, global emas)
  const listedOther = await listActiveProducts(true, buyer.id);
  ok(listedOther.find((p) => p.id === favProd.id)?.isFav === false, "18: OTHER member sees isFav=false (per-member)");
  ok(listedOther.find((p) => p.id === favProd.id)?.favCount === 1, "18: favCount is still the shared/public count");

  // 19) listFavoriteProducts — faqat shu a'zoning ro'yxati
  const myFavs = await listFavoriteProducts(m2.id, true);
  ok(myFavs.length === 1 && myFavs[0]!.id === favProd.id, "19: listFavoriteProducts returns exactly this product");
  const otherFavs = await listFavoriteProducts(buyer.id, true);
  ok(otherFavs.length === 0, "19: OTHER member's favorites list is empty");

  // 20) toggle off → favCount 1→0, floor at 0 (double-off doesn't go negative)
  const t3 = await toggleProductFavorite(m2.id, favProd.id!, false);
  ok(t3.on === false && t3.favCount === 0, "20: fav OFF → favCount 0");
  const t4 = await toggleProductFavorite(m2.id, favProd.id!, false);
  ok(t4.favCount === 0, "20: duplicate OFF → favCount floors at 0 (no negative)");
  ok((await listFavoriteProducts(m2.id, true)).length === 0, "20: favorites list empty after unfav");

  // 20b) R4-gap regression: PARALLEL double-ON → favCount increments EXACTLY once (P2002-guarded).
  // NOTE: har chaqiruvning O'Z qaytargan favCount'i emas — bu faqat ko'rsatkich (pul-yo'li EMAS),
  // g'olib create'dan keyin increment tugashi bilan mag'lub o'z o'qishini boshlashi mumkin (real
  // race, kutilgan) — shuning uchun FINAL holatni Promise.all TUGAGACH alohida o'qiymiz.
  await Promise.all([toggleProductFavorite(m2.id, favProd.id!, true), toggleProductFavorite(m2.id, favProd.id!, true)]);
  const favRowCount = await prisma.productFavorite.count({ where: { memberId: m2.id, productId: favProd.id! } });
  const favCountFinal = (await prisma.product.findUnique({ where: { id: favProd.id! }, select: { favCount: true } }))!.favCount;
  ok(favRowCount === 1, "20b: parallel ON×2 → exactly ONE ProductFavorite row (unique constraint held)");
  ok(favCountFinal === 1, `20b: parallel ON×2 → final favCount EXACTLY 1 (no double-increment), got ${favCountFinal}`);
  await toggleProductFavorite(m2.id, favProd.id!, false); // cleanup for symmetry

  // ── 🪙 V3.1: xarid-cashback (shopcashback flag) ──────────────────────────────────────────────
  const { setBonusEcon } = await import("../services/bonusConfig");
  const { retryPendingMoney } = await import("../services/coinService");
  await setBonusEcon("shopCashbackPct", 2);
  await setBonusEcon("shopCashbackPerOrder", 2000);
  await setBonusEcon("shopCashbackDaily", 5000);
  const m3 = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-M3`, fullName: "Bazar M3", phone: "+998901112255", coins: 200_000 } });
  const pCb = await adminCreateProduct({ name: "Cashback mahsulot", priceTanga: 10_000, stock: 20, category: TAG }, shopC.id);
  await adminToggleProduct(pCb.id!, true);

  // 21) flag DARK → deliver'da grant YO'Q
  const buyCb1 = await buyProduct(m3.id, pCb.id!, "Koson, Test 9", true);
  ok(buyCb1.ok === true, "21: setup buy ok");
  const balBefore21 = (await prisma.member.findUnique({ where: { id: m3.id } }))!.coins;
  await deliverPurchase(buyCb1.orderId!);
  ok((await prisma.member.findUnique({ where: { id: m3.id } }))!.coins === balBefore21, "21: flag DARK → NO cashback on deliver");
  await setFeature("shopcashback", true);
  __resetFeatureCache();

  // 22) flag ON: 10_000 narx × 2% = 200 tanga cashback aniq
  const buyCb2 = await buyProduct(m3.id, pCb.id!, "Koson, Test 9", true);
  ok(buyCb2.ok === true, "22: setup buy ok");
  const balBefore22 = (await prisma.member.findUnique({ where: { id: m3.id } }))!.coins;
  await deliverPurchase(buyCb2.orderId!);
  ok((await prisma.member.findUnique({ where: { id: m3.id } }))!.coins === balBefore22 + 200, "22: cashback = 2% of 10000 = 200 tanga");
  ok((await prisma.coinTxn.count({ where: { idempotencyKey: `shopcb:sp${buyCb2.orderId}` } })) === 1, "22: shopcb:sp<id> CoinTxn exists");
  ok((await prisma.coinTxn.findUnique({ where: { idempotencyKey: `shopcb:sp${buyCb2.orderId}` } }))!.bookingId === null, "22: bookingId=null — ride ≤350 clamp CANNOT see this grant");

  // 23) reject/cancel → HECH QACHON cashback (delivered'ga yetmagan)
  const buyCb3 = await buyProduct(m3.id, pCb.id!, "Koson, Test 9", true);
  const balBefore23 = (await prisma.member.findUnique({ where: { id: m3.id } }))!.coins;
  await rejectPurchase(buyCb3.orderId!);
  ok((await prisma.member.findUnique({ where: { id: m3.id } }))!.coins === balBefore23 + 10_000, "23: reject refunds the purchase price only");
  ok((await prisma.coinTxn.count({ where: { memberId: m3.id, kind: "shop_cashback" } })) === 1, "23: rejected order → cashback count STILL 1 (no new grant from reject)");

  // 24) perOrder cap: 200_000 narx × 2% = 4000, lekin perOrder=2000 → 2000 kesiladi
  await prisma.member.update({ where: { id: m3.id }, data: { coins: 1_000_000 } }); // yetarlicha (4 × 200k xarid keladi)
  const pCbBig = await adminCreateProduct({ name: "Big cashback", priceTanga: 200_000, stock: 5, category: TAG }, shopC.id);
  await adminToggleProduct(pCbBig.id!, true);
  const buyCb4 = await buyProduct(m3.id, pCbBig.id!, "Koson, Test 9", true);
  const balBefore24 = (await prisma.member.findUnique({ where: { id: m3.id } }))!.coins;
  await deliverPurchase(buyCb4.orderId!);
  ok((await prisma.member.findUnique({ where: { id: m3.id } }))!.coins === balBefore24 + 2000, "24: perOrder cap kesadi (4000 → 2000)");

  // 25) dailyMax: shu kunda jami cashback 200(22-test)+2000(24-test)=2200 berilgan; dailyMax=5000 →
  // qolgan 2800; yana bitta 200_000'lik xarid (raw 4000, perOrder 2000) → min(2000, 2800)=2000
  const buyCb5 = await buyProduct(m3.id, pCbBig.id!, "Koson, Test 9", true);
  const balBefore25 = (await prisma.member.findUnique({ where: { id: m3.id } }))!.coins;
  await deliverPurchase(buyCb5.orderId!);
  ok((await prisma.member.findUnique({ where: { id: m3.id } }))!.coins === balBefore25 + 2000, "25: daily-remaining hali yetadi (2200+2000=4200≤5000)");
  // navbatdagi xarid: qolgan 800 → min(2000,800)=800
  const buyCb6 = await buyProduct(m3.id, pCbBig.id!, "Koson, Test 9", true);
  const balBefore26 = (await prisma.member.findUnique({ where: { id: m3.id } }))!.coins;
  await deliverPurchase(buyCb6.orderId!);
  ok((await prisma.member.findUnique({ where: { id: m3.id } }))!.coins === balBefore26 + 800, "26: daily-cap kesadi aniq qolganga (800)");
  // endi kunlik limit TO'LIQ tugagan (5000/5000) → keyingi xarid 0 cashback
  const buyCb7 = await buyProduct(m3.id, pCbBig.id!, "Koson, Test 9", true);
  const balBefore27 = (await prisma.member.findUnique({ where: { id: m3.id } }))!.coins;
  await deliverPurchase(buyCb7.orderId!);
  ok((await prisma.member.findUnique({ where: { id: m3.id } }))!.coins === balBefore27, "27: dailyMax to'liq tugagach → 0 qo'shimcha cashback");

  // 27b) R4-gap regression: PARALLEL deliveries near the daily-cap boundary — withMemberLock
  // (grantShopCashback ichida) daily-sum o'qish+grantni serializatsiya qiladi, shuning uchun
  // ikkala buyurtma birga jamlanganda dailyMax'dan OSHMAYDI (eski kodda ikkalasi ham eski
  // "remaining"ni o'qib, jamda dailyMax'ni buzishi mumkin edi).
  await prisma.coinTxn.deleteMany({ where: { memberId: m3.id, kind: "shop_cashback" } }); // yangi kun
  await prisma.coinTxn.create({ data: { memberId: m3.id, amount: 4000, kind: "shop_cashback", reason: "27b precondition", idempotencyKey: "shopcb:precondition27b" } });
  await prisma.member.update({ where: { id: m3.id }, data: { coins: 1_000_000 } });
  // V0.4 dublikat-guard (ayni member+product 60s ichida) ikkinchi xaridni bloklaydi — shuning
  // uchun ikkinchi buyurtma ALOHIDA mahsulotga (bir xil narx, bir xil cashback-matematika)
  const pCbBig2 = await adminCreateProduct({ name: "Big cashback #2", priceTanga: 200_000, stock: 5, category: TAG }, shopC.id);
  await adminToggleProduct(pCbBig2.id!, true);
  const buyCbP1 = await buyProduct(m3.id, pCbBig.id!, "Koson, Test 9", true); // 200_000 → raw 4000, perOrder-cap 2000
  const buyCbP2 = await buyProduct(m3.id, pCbBig2.id!, "Koson, Test 9", true);
  const balBefore27b = (await prisma.member.findUnique({ where: { id: m3.id } }))!.coins;
  await Promise.all([deliverPurchase(buyCbP1.orderId!), deliverPurchase(buyCbP2.orderId!)]);
  const gained27b = (await prisma.member.findUnique({ where: { id: m3.id } }))!.coins - balBefore27b;
  ok(gained27b === 1000, `27b: parallel deliveries near dailyMax → combined cashback EXACTLY 1000 (headroom), got ${gained27b}`);
  const sumToday27b = (await prisma.coinTxn.aggregate({ where: { memberId: m3.id, kind: "shop_cashback", createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } }, _sum: { amount: true } }))._sum.amount ?? 0;
  ok(sumToday27b === 5000, `27b: today's total shop_cashback sum === dailyMax exactly (5000), got ${sumToday27b}`);

  // 28) durability: pending:shopcb markeri qo'lda qoldirilsa, retryPendingMoney tick uni to'ldiradi
  const buyCb8 = await buyProduct(m3.id, pCb.id!, "Koson, Test 9", true);
  await deliverPurchase(buyCb8.orderId!); // bu safar dailyMax tugagani uchun amount=0, marker yaratilmagan — yangi kun simulyatsiyasi kerak
  await prisma.coinTxn.deleteMany({ where: { memberId: m3.id, kind: "shop_cashback" } }); // kunlik-hisobni "tozalab" yangi kun simulyatsiya qilamiz
  const { pendingCreate } = await import("../services/appStateUtil");
  await pendingCreate("shopcb", `durabilitytest${buyCb8.orderId}`, { memberId: m3.id, amount: 123 });
  await prisma.appState.updateMany({ where: { key: `pending:shopcb:durabilitytest${buyCb8.orderId}` }, data: { updatedAt: new Date(Date.now() - 11 * 60_000) } }); // 10-daq PENDING_MIN_AGE'dan eski
  const balBefore28 = (await prisma.member.findUnique({ where: { id: m3.id } }))!.coins;
  await retryPendingMoney();
  ok((await prisma.member.findUnique({ where: { id: m3.id } }))!.coins === balBefore28 + 123, "28: retryPendingMoney fills a stranded shopcb marker");
  ok((await prisma.appState.findUnique({ where: { key: `pending:shopcb:durabilitytest${buyCb8.orderId}` } })) === null, "28: marker resolved (deleted) after successful retry");

  // ── 🗣 V3.2: sharh-uchun-tanga (revtanga flag) ───────────────────────────────────────────────
  const { submitReview, listReviews } = await import("../services/shopService");
  await setBonusEcon("reviewTangaBase", 300);
  await setBonusEcon("reviewTangaPhotoBonus", 200);
  await setBonusEcon("reviewTangaDailyMax", 3);
  const LONG_TEXT = "Juda ajoyib mahsulot, tavsiya qilaman! Sifat zo'r va yetkazish tez bo'ldi."; // ≥30 belgi

  // 29) delivered-BO'LMAGAN xaridor sharh yozsa → flag ON bo'lsa ham 0 tanga (bought-check)
  await setFeature("revtanga", true);
  __resetFeatureCache();
  const balBefore29 = (await prisma.member.findUnique({ where: { id: buyer.id } }))!.coins;
  const rev29 = await submitReview(buyer.id, pCb.id!, "up", LONG_TEXT, undefined, true, 5);
  ok(rev29.ok === true && !rev29.tangaGranted, "29: non-buyer review → 0 tanga (delivered-check)");
  ok((await prisma.member.findUnique({ where: { id: buyer.id } }))!.coins === balBefore29, "29: non-buyer balance untouched");

  // 30) delivered-xaridor + ≥30 belgi + flag ON → grant aniq (300, foto yo'q)
  const buyRev1 = await buyProduct(m3.id, pCb.id!, "Koson, Test 9", true);
  await deliverPurchase(buyRev1.orderId!);
  await prisma.coinTxn.deleteMany({ where: { memberId: m3.id, kind: "shop_cashback" } }); // avvalgi bloklardan qolgan cashback'ni tozalab, shu blokni izolyatsiya qilamiz
  const balBefore30 = (await prisma.member.findUnique({ where: { id: m3.id } }))!.coins;
  const rev30 = await submitReview(m3.id, pCb.id!, "up", LONG_TEXT, undefined, true, 5);
  ok(rev30.ok === true && rev30.tangaGranted === 300, "30: delivered-buyer + ≥30 chars → 300 tanga");
  ok((await prisma.member.findUnique({ where: { id: m3.id } }))!.coins === balBefore30 + 300, "30: balance credited exactly 300");
  ok((await prisma.coinTxn.count({ where: { idempotencyKey: `revtanga:${m3.id}:${pCb.id}` } })) === 1, "30: revtanga:<m>:<p> CoinTxn exists");
  const rr30 = await listReviews(pCb.id!, m3.id, true);
  ok(rr30.reviews.find((r) => r.mine)?.rating === 5, "30: rating=5 persisted and returned");
  ok(rr30.avgRating === 5, "30: avgRating reflects the single 5-star review");

  // 31) EDIT (re-submit) → BIR UMR — ikkinchi marta TO'LANMAYDI (kalit allaqachon bor)
  const balBefore31 = (await prisma.member.findUnique({ where: { id: m3.id } }))!.coins;
  const rev31 = await submitReview(m3.id, pCb.id!, "up", LONG_TEXT + " Yana!", undefined, true, 4);
  ok(rev31.ok === true && !rev31.tangaGranted, "31: EDIT (re-submit) → 0 tanga (kalit bir umr)");
  ok((await prisma.member.findUnique({ where: { id: m3.id } }))!.coins === balBefore31, "31: balance unchanged on edit");
  ok((await prisma.coinTxn.count({ where: { idempotencyKey: `revtanga:${m3.id}:${pCb.id}` } })) === 1, "31: still exactly ONE revtanga CoinTxn (no duplicate)");

  // 32) DELETE + qayta-yuborish (resubmit) → hali ham TO'LANMAYDI (kalit CoinTxn'da qoladi, review-qator o'chsa ham)
  await prisma.productReview.deleteMany({ where: { productId: pCb.id!, memberId: m3.id } });
  const balBefore32 = (await prisma.member.findUnique({ where: { id: m3.id } }))!.coins;
  const rev32 = await submitReview(m3.id, pCb.id!, "up", LONG_TEXT, undefined, true, 5);
  ok(rev32.ok === true && !rev32.tangaGranted, "32: delete+resubmit → STILL 0 tanga (CoinTxn-key survives row deletion)");
  ok((await prisma.member.findUnique({ where: { id: m3.id } }))!.coins === balBefore32, "32: balance unchanged after delete+resubmit");

  // 32b) MarketOrder (savat) orqali delivered-xarid — grantReviewTanga ikkinchi yo'lni (mo) ham tekshiradi
  const { advanceMarketOrder: advMo } = await import("../services/marketOrderService");
  const pMoRev = await adminCreateProduct({ name: "MO-review mahsulot", priceTanga: 6000, stock: 5, category: TAG }, shopC.id);
  await adminToggleProduct(pMoRev.id!, true);
  const moRev = await createMarketOrder(m3.id, shopC.id, [{ productId: pMoRev.id!, qty: 1 }], "Koson, Test 9", "tanga", undefined, true);
  ok(moRev.ok === true, "32b: MarketOrder setup checkout ok");
  await advMo(moRev.orderId!); // accepted
  await advMo(moRev.orderId!); // delivering
  await advMo(moRev.orderId!); // delivered
  const rev32b = await submitReview(m3.id, pMoRev.id!, "up", LONG_TEXT, undefined, true, 5);
  ok(rev32b.ok === true && rev32b.tangaGranted === 300, "32b: MarketOrder-delivered buyer ALSO qualifies (itemsJson-based bought-check)");

  // 33) qisqa matn (<30 belgi) → grant YO'Q, lekin sharh o'zi saqlanadi
  const buyRev2 = await buyProduct(m3.id, pCb.id!, "Koson, Test 9", true);
  await deliverPurchase(buyRev2.orderId!);
  const pShort = await adminCreateProduct({ name: "Short-text mahsulot", priceTanga: 5000, stock: 5, category: TAG }, shopC.id);
  await adminToggleProduct(pShort.id!, true);
  const buyRev3 = await buyProduct(m3.id, pShort.id!, "Koson, Test 9", true);
  await deliverPurchase(buyRev3.orderId!);
  const rev33 = await submitReview(m3.id, pShort.id!, "up", "zo'r", undefined, true);
  ok(rev33.ok === true && !rev33.tangaGranted, "33: short text (<30 chars) → 0 tanga, review still saved");
  ok((await listReviews(pShort.id!, m3.id, true)).reviews.some((r) => r.mine && r.text === "zo'r"), "33: short-text review persisted");

  // 34) rating validatsiya: 0 va 6 rad, undefined (thumb-only) ruxsat
  const rBad0 = await submitReview(m3.id, pShort.id!, "up", "matn", undefined, true, 0);
  ok(rBad0.ok === false && rBad0.reason === "bad_rating", "34: rating=0 rejected");
  const rBad6 = await submitReview(m3.id, pShort.id!, "up", "matn", undefined, true, 6);
  ok(rBad6.ok === false && rBad6.reason === "bad_rating", "34: rating=6 rejected");
  const rNone = await submitReview(m3.id, pShort.id!, "up", "matn yangilash", undefined, true);
  ok(rNone.ok === true, "34: rating omitted (thumb-only) still accepted — backward compat");

  // 35) daily cap: reviewTangaDailyMax=3 — testlar 30/32b'dan qolgan 2 ta shop_review grantni
  // tozalab, "yangi kun" simulyatsiya qilamiz (aks holda ular ham kunlik-hisobga kirib ketadi)
  await prisma.coinTxn.deleteMany({ where: { memberId: m3.id, kind: "shop_review" } });
  await prisma.member.update({ where: { id: m3.id }, data: { coins: 1_000_000 } });
  const pDaily = [1, 2, 3, 4].map(() => null);
  let dailyGrants = 0;
  for (let i = 0; i < pDaily.length; i++) {
    const prod = await adminCreateProduct({ name: `Daily-cap ${i}`, priceTanga: 50_000, stock: 5, category: TAG }, shopC.id);
    await adminToggleProduct(prod.id!, true);
    const b = await buyProduct(m3.id, prod.id!, "Koson, Test 9", true);
    await deliverPurchase(b.orderId!);
    const rv = await submitReview(m3.id, prod.id!, "up", LONG_TEXT, undefined, true, 5);
    if (rv.tangaGranted) dailyGrants++;
  }
  ok(dailyGrants === 3, `35: dailyMax=3 → exactly 3 of 4 reviews granted tanga (got ${dailyGrants})`);

  // 36) flag DARK → hech qanday sharh-tanga (yangi mahsulot bilan, mavjud kalitlar bilan aralashmasin)
  await setFeature("revtanga", false);
  __resetFeatureCache();
  const pDark = await adminCreateProduct({ name: "Revtanga dark mahsulot", priceTanga: 20_000, stock: 5, category: TAG }, shopC.id);
  await adminToggleProduct(pDark.id!, true);
  const buyDark = await buyProduct(m3.id, pDark.id!, "Koson, Test 9", true);
  await deliverPurchase(buyDark.orderId!);
  const revDark = await submitReview(m3.id, pDark.id!, "up", LONG_TEXT, undefined, true, 5);
  ok(revDark.ok === true && !revDark.tangaGranted, "36: revtanga flag DARK → 0 tanga even for a valid delivered+long review");

  await prisma.productReview.deleteMany({ where: { memberId: { in: [m3.id, buyer.id] } } });
  await prisma.coinTxn.deleteMany({ where: { memberId: m3.id } });
  await prisma.member.delete({ where: { id: m3.id } }).catch(() => undefined);

  await cleanupMkt();
  await cleanup();
  console.log(process.exitCode ? "\n❌ FAILED" : "\n✅ ALL GREEN");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
