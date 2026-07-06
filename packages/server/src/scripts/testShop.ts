// 🛍 TANGA SHOP money-core tests. Runs ONLY on TEST_DATABASE_URL (_testDb refuses the app DB) —
// the suite flips the GLOBAL feature:shop flag and creates Product/ShopPurchase/CoinTxn rows.
import "./_testDb";
process.env.KAS_MODE = "mock";

const TAG = "SHOPTEST";

function ok(cond: boolean, label: string): void {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) process.exitCode = 1;
}

async function main(): Promise<void> {
  const { prisma } = await import("../db");
  const { buyProduct, deliverPurchase, rejectPurchase, listActiveProducts, adminCreateProduct, adminEditProduct, adminToggleProduct, adminListProducts, myPurchases } = await import("../services/shopService");
  const { setFeature, __resetFeatureCache, featureOn } = await import("../services/featureFlags");
  const { getCoins } = await import("../services/coinService");

  const cleanup = async (): Promise<void> => {
    const members = await prisma.member.findMany({ where: { kasId: { startsWith: TAG } } });
    const ids = members.map((m) => m.id);
    await prisma.shopPurchase.deleteMany({ where: { memberId: { in: ids } } });
    await prisma.coinTxn.deleteMany({ where: { memberId: { in: ids } } });
    const prods = await prisma.product.findMany({ where: { category: TAG }, select: { id: true } });
    await prisma.productPhoto.deleteMany({ where: { productId: { in: prods.map((p) => p.id) } } });
    await prisma.productReview.deleteMany({ where: { OR: [{ productId: { in: prods.map((p) => p.id) } }, { memberId: { in: ids } }] } });
    await prisma.product.deleteMany({ where: { category: TAG } });
    await prisma.member.deleteMany({ where: { id: { in: ids } } });
    await prisma.appState.deleteMany({ where: { key: "feature:shop" } });
  };
  await cleanup();

  const ADDR = "Koson sh., Test ko'chasi 1-uy";
  const mk = (s: string, coins: number) => prisma.member.create({ data: { type: "client", kasId: `${TAG}-${s}`, fullName: `Shop ${s}`, phone: "+99890000009" + s.charCodeAt(0), coins } });
  const [a, b, c] = await Promise.all([mk("A", 50_000), mk("B", 50_000), mk("C", 50_000)]); // roomy — step 5's winner is nondeterministic, later steps must never run dry

  // 1) flag default OFF → buy blocked + rider list empty
  __resetFeatureCache();
  ok((await featureOn("shop")) === false, "1: shop is DEFAULT_OFF");
  const offBuy = await buyProduct(a.id, 1, ADDR);
  ok(offBuy.ok === false && offBuy.reason === "off", "1: buy blocked while flag is dark");
  await setFeature("shop", true);
  __resetFeatureCache();

  // 2) admin CRUD roundtrip; created inactive
  const created = await adminCreateProduct({ name: "Test choynak", priceTanga: 3000, stock: 5, category: TAG });
  ok(created.ok === true && !!created.id, "2: adminCreateProduct ok");
  const pid = created.id!;
  const list1 = await adminListProducts();
  const row1 = list1.products.find((p) => p.id === pid);
  ok(row1?.active === false, "2: product is created INACTIVE (owner flips on)");
  await adminEditProduct(pid, { priceTanga: 3500, stock: 5 });
  ok((await prisma.product.findUnique({ where: { id: pid } }))!.priceTanga === 3500, "2: edit price landed (3500)");

  // 3) rider list excludes inactive; includes after toggle
  ok((await listActiveProducts()).every((p) => p.id !== pid), "3: inactive product hidden from riders");
  await adminToggleProduct(pid, true);
  ok((await listActiveProducts()).some((p) => p.id === pid), "3: active product visible to riders");

  // 4) happy buy: order pending, coins held, stock down, CoinTxn keyed
  const buy1 = await buyProduct(a.id, pid, ADDR);
  ok(buy1.ok === true && !!buy1.orderId, "4: happy buy ok");
  ok((await getCoins(a.id)) === 46_500, "4: coins held (50000→46500)");
  ok((await prisma.product.findUnique({ where: { id: pid } }))!.stock === 4, "4: stock decremented (5→4)");
  const txn = await prisma.coinTxn.findUnique({ where: { idempotencyKey: `shop:${buy1.orderId}` } });
  ok(!!txn && txn.amount === -3500, "4: CoinTxn shop:<orderId> exists (−3500)");
  ok(!!buy1.notice && buy1.notice.address === ADDR, "4: owner notice carries the address");

  // 5) no oversell: stock=1, 3 CONCURRENT buyers → exactly one wins
  await adminEditProduct(pid, { stock: 1 });
  const [r1, r2, r3] = await Promise.all([buyProduct(a.id, pid, ADDR), buyProduct(b.id, pid, ADDR), buyProduct(c.id, pid, ADDR)]);
  const wins = [r1, r2, r3].filter((r) => r.ok);
  ok(wins.length === 1, `5: concurrent last-unit → exactly ONE ok (got ${wins.length})`);
  ok((await prisma.product.findUnique({ where: { id: pid } }))!.stock === 0, "5: stock === 0 (no oversell)");
  ok([r1, r2, r3].filter((r) => !r.ok && r.reason === "sold_out").length === 2, "5: losers get sold_out");

  // 6) same-member double-tap: stock=1, two concurrent buys by ONE member → exactly one debit
  await adminEditProduct(pid, { stock: 1 });
  const coinsBefore = await getCoins(b.id);
  const [d1, d2] = await Promise.all([buyProduct(b.id, pid, ADDR), buyProduct(b.id, pid, ADDR)]);
  ok([d1, d2].filter((r) => r.ok).length === 1, "6: double-tap → one success");
  ok((await getCoins(b.id)) === coinsBefore - 3500, "6: coins debited exactly once");

  // 7) insufficient balance: clean fail, nothing changes
  const poor = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-P`, fullName: "Shop P", phone: null, coins: 100 } });
  await adminEditProduct(pid, { stock: 3 });
  const pb = await buyProduct(poor.id, pid, ADDR);
  ok(pb.ok === false && pb.reason === "insufficient", "7: insufficient → clean typed fail");
  ok((await prisma.product.findUnique({ where: { id: pid } }))!.stock === 3, "7: stock untouched");
  ok((await prisma.shopPurchase.count({ where: { memberId: poor.id } })) === 0, "7: no order row");
  ok((await getCoins(poor.id)) === 100, "7: coins untouched");

  // 8) reject → refund exactly once + restock
  const buyR = await buyProduct(c.id, pid, ADDR);
  ok(buyR.ok === true, "8: setup buy ok");
  const balAfterBuy = await getCoins(c.id);
  const rej1 = await rejectPurchase(buyR.orderId!, "test sabab");
  ok(rej1.ok === true, "8: reject ok");
  ok((await getCoins(c.id)) === balAfterBuy + 3500, "8: refund landed (+3500)");
  ok((await prisma.product.findUnique({ where: { id: pid } }))!.stock === 3, "8: restocked");
  const rej2 = await rejectPurchase(buyR.orderId!);
  ok(rej2.ok === false, "8: second reject no-ops (status guard)");
  ok((await getCoins(c.id)) === balAfterBuy + 3500, "8: refund NOT doubled");
  const ord = await prisma.shopPurchase.findUnique({ where: { id: buyR.orderId! } });
  ok(ord?.status === "rejected" && ord.note === "test sabab", "8: status rejected + note saved");

  // 9) deliver terminal + ✅→❌ race: NO refund after delivered
  const buyD = await buyProduct(a.id, pid, ADDR);
  ok(buyD.ok === true, "9: setup buy ok");
  const balAfterBuyD = await getCoins(a.id);
  const del = await deliverPurchase(buyD.orderId!);
  ok(del.ok === true, "9: deliver ok");
  ok((await getCoins(a.id)) === balAfterBuyD, "9: deliver moves NO coins (already held)");
  const rejAfterDel = await rejectPurchase(buyD.orderId!);
  ok(rejAfterDel.ok === false && rejAfterDel.reason === "delivered", "9: reject-after-deliver refused");
  ok((await getCoins(a.id)) === balAfterBuyD, "9: no refund after delivery (money stays spent)");

  // 10) rider order list shows statuses
  const orders = await myPurchases(a.id);
  ok(orders.some((o) => o.status === "delivered") && orders.some((o) => o.status === "pending" || o.status === "delivered"), "10: myPurchases returns rows with statuses");

  // 11) pending cap: max 3 open orders per rider
  await adminEditProduct(pid, { stock: 10 });
  const rich = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-R`, fullName: "Shop R", phone: null, coins: 100_000 } });
  const caps = [];
  for (let i = 0; i < 4; i++) caps.push(await buyProduct(rich.id, pid, ADDR));
  ok(caps.filter((r) => r.ok).length === 3 && caps[3]!.reason === "pending_limit", "11: 4th open order blocked (pending_limit)");

  // 12) flag off again → list empty, buy blocked
  await setFeature("shop", false);
  __resetFeatureCache();
  ok((await listActiveProducts()).length === 0, "12: flag off → rider list empty");
  ok((await buyProduct(a.id, pid, ADDR)).reason === "off", "12: flag off → buy blocked");

  // 13) owner-preview: flag DARK + preview=true → owner browses AND buys (the QABUL flow —
  // the original bug: preview only unlocked the TAB, so the owner saw an empty locked shop)
  const pv = await listActiveProducts(true);
  ok(pv.some((p) => p.id === pid), "13: owner-preview sees the catalog while flag is DARK");
  const pvBuy = await buyProduct(a.id, pid, ADDR, true);
  ok(pvBuy.ok === true, "13: owner-preview can BUY while flag is DARK");

  // 14) gallery: photoCount + Nth-photo resolution order + clear (rows created directly — the
  // Telegram upload leg is env-dependent and would DM the owner from a test)
  const { resolveProductPhoto, clearProductPhotos } = await import("../services/shopService");
  await prisma.productPhoto.createMany({
    data: [
      { productId: pid, url: "data:image/jpeg;base64,QQ==", sortOrder: 0 },
      { productId: pid, url: "data:image/jpeg;base64,Qg==", sortOrder: 1 },
      { productId: pid, url: "data:image/jpeg;base64,Qw==", sortOrder: 2 },
    ],
  });
  const withPhotos = (await listActiveProducts(true)).find((p) => p.id === pid);
  ok(withPhotos?.photoCount === 3 && withPhotos.hasPhoto === true, `14: photoCount=3 flows to the view (got ${withPhotos?.photoCount})`);
  ok((await resolveProductPhoto(pid, 1)) === "data:image/jpeg;base64,Qg==", "14: Nth photo resolves in sortOrder");
  ok((await resolveProductPhoto(pid, 9)) === null, "14: out-of-range gallery index → null (no legacy fallback beyond cover)");
  await clearProductPhotos(pid);
  ok((await prisma.productPhoto.count({ where: { productId: pid } })) === 0, "14: clearProductPhotos wipes the gallery");

  // 15) marketplace fields: discount (oldPrice) + featured flow to the rider view; 0 clears discount
  await adminEditProduct(pid, { oldPriceTanga: 5000, featured: true });
  const mk15 = (await listActiveProducts(true)).find((p) => p.id === pid);
  ok(mk15?.oldPriceTanga === 5000 && mk15.featured === true, `15: oldPrice+featured flow to the view (${mk15?.oldPriceTanga}/${mk15?.featured})`);
  await adminEditProduct(pid, { oldPriceTanga: 0 });
  ok((await listActiveProducts(true)).find((p) => p.id === pid)?.oldPriceTanga === null, "15: oldPrice=0 clears the discount (null)");

  // 16) 🗣 reviews: upsert (one per member), 👍/👎 tallies, photosJson resolve, verified badge, moderation
  const { listReviews, submitReview, deleteMyReview, resolveReviewPhoto, adminListReviews, adminDeleteReview } = await import("../services/shopService");
  const rev1 = await submitReview(a.id, pid, "up", "Zo'r mahsulot!", undefined, true);
  ok(rev1.ok === true, "16: review submit ok (preview while DARK)");
  const rev2 = await submitReview(a.id, pid, "down", "Fikrim o'zgardi", undefined, true);
  ok(rev2.ok === true, "16: re-submit ok");
  const rlist1 = await listReviews(pid, a.id, true);
  ok(rlist1.likes === 0 && rlist1.dislikes === 1 && rlist1.reviews.length === 1, `16: upsert EDITS not duplicates (likes=${rlist1.likes} dislikes=${rlist1.dislikes} n=${rlist1.reviews.length})`);
  ok(rlist1.myThumb === "down" && rlist1.reviews[0]!.mine === true, "16: myThumb + mine flow back");
  await submitReview(b.id, pid, "up", undefined, undefined, true);
  const rlist2 = await listReviews(pid, a.id, true);
  ok(rlist2.likes === 1 && rlist2.dislikes === 1, "16: second member adds an independent 👍");
  // verified badge: member A has a DELIVERED purchase of pid (step 8/9 delivered one)
  ok(rlist2.reviews.find((r) => r.mine)?.verified === true, "16: delivered buyer gets the ✅ verified badge");
  // tallies flow to the product card view
  const cardV = (await listActiveProducts(true)).find((p) => p.id === pid);
  ok(cardV?.likes === 1 && cardV.dislikes === 1, `16: 👍/👎 tallies on the rider card (${cardV?.likes}/${cardV?.dislikes})`);
  // photosJson roundtrip (direct row — the Telegram leg is env-dependent, same as step 14)
  await prisma.productReview.update({
    where: { productId_memberId: { productId: pid, memberId: a.id } },
    data: { photosJson: JSON.stringify([{ u: "data:image/jpeg;base64,QQ==" }, { u: "data:image/jpeg;base64,Qg==" }]) },
  });
  const rlist3 = await listReviews(pid, a.id, true);
  const myRevId = rlist3.reviews.find((r) => r.mine)!.id;
  ok(rlist3.reviews.find((r) => r.mine)?.photoCount === 2, "16: photoCount=2 from photosJson");
  ok((await resolveReviewPhoto(myRevId, 1)) === "data:image/jpeg;base64,Qg==", "16: Nth review photo resolves");
  ok((await resolveReviewPhoto(myRevId, 4)) === null, "16: out-of-range review photo → null");
  // text clamp + bad thumb rejected
  ok((await submitReview(c.id, pid, "sideways", undefined, undefined, true)).reason === "bad_thumb", "16: bad thumb rejected");
  await submitReview(c.id, pid, "up", "x".repeat(500), undefined, true);
  const longTxt = (await listReviews(pid, c.id, true)).reviews.find((r) => r.mine)?.text ?? "";
  ok(longTxt.length <= 280, `16: text clamped to 280 (got ${longTxt.length})`);
  // delete own + admin moderation
  await deleteMyReview(c.id, pid);
  ok((await listReviews(pid, c.id, true)).reviews.every((r) => !r.mine), "16: own review deleted");
  const admList = await adminListReviews();
  ok(admList.some((r) => r.id === myRevId), "16: admin list carries the review");
  await adminDeleteReview(myRevId);
  ok((await listReviews(pid, a.id, true)).reviews.every((r) => r.id !== myRevId), "16: admin delete removes it");
  // flag gating: DARK + no preview → empty + blocked
  const gated = await listReviews(pid, a.id, false);
  ok(gated.reviews.length === 0, "16: flag DARK → reviews hidden for riders");
  ok((await submitReview(b.id, pid, "up", undefined, undefined, false)).reason === "off", "16: flag DARK → submit blocked for riders");

  await cleanup();
  console.log(process.exitCode ? "\n❌ FAILED" : "\n✅ ALL GREEN");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
