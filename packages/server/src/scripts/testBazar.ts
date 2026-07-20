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

  await cleanup();
  console.log(process.exitCode ? "\n❌ FAILED" : "\n✅ ALL GREEN");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
