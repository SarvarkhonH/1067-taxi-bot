// 🎀 RAVELLA pul-testi (RAVELLA_PLAN §9 R4). Yagona pul-yo'li — `done`'da beriladigan 1% cashback —
// shu yerda qamrab olinadi: idempotentlik, buyurtma-cap, kunlik cap, safar ≤350 clamp'iga
// TEGMASLIK, va "narx serverda hisoblanadi" invarianti.
// `./_testDb` — ALOHIDA TEST_DATABASE_URL talab qiladi (app DB'da ishlashdan bosh tortadi).
import "./_testDb";

const TAG = "RVLTEST_" + Date.now();

function ok(cond: boolean, label: string): void {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) process.exitCode = 1;
}

async function main(): Promise<void> {
  const { prisma } = await import("../db");
  const svc = await import("../services/ravellaService");
  const { __resetFeatureCache, featureOn, setFeature } = await import("../services/featureFlags");
  const { setBonusEcon } = await import("../services/bonusConfig");

  const cleanup = async (): Promise<void> => {
    const cats = await prisma.ravellaCategory.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } });
    const catIds = cats.map((c) => c.id);
    const items = await prisma.ravellaItem.findMany({ where: { categoryId: { in: catIds } }, select: { id: true } });
    const itemIds = items.map((i) => i.id);
    const members = await prisma.member.findMany({ where: { kasId: { startsWith: TAG } }, select: { id: true } });
    const memberIds = members.map((m) => m.id);
    await prisma.ravellaOrder.deleteMany({ where: { OR: [{ itemId: { in: itemIds } }, { memberId: { in: memberIds } }] } });
    await prisma.ravellaAddon.deleteMany({ where: { OR: [{ itemId: { in: itemIds } }, { categoryId: { in: catIds } }] } });
    await prisma.ravellaItem.deleteMany({ where: { id: { in: itemIds } } });
    await prisma.ravellaCategory.deleteMany({ where: { id: { in: catIds } } });
    await prisma.coinTxn.deleteMany({ where: { memberId: { in: memberIds } } });
    await prisma.member.deleteMany({ where: { id: { in: memberIds } } });
    await prisma.appState.deleteMany({ where: { key: { startsWith: "pending:ravellacb:" } } });
  };
  await cleanup();
  __resetFeatureCache();

  // 0) NaN/0/manfiy id — jonli restoran crash saboqi (Prisma "Argument id is missing")
  for (const bad of [NaN, 0, -1, 1.5]) {
    const r = await svc.getRavellaItemDetail(bad, true).catch((e) => ({ crashed: true, e }));
    ok(!("crashed" in r) && r.item === null, `0: getRavellaItemDetail(${bad}) crash BERMAYDI, null qaytaradi`);
  }

  // 1) flag DEFAULT_OFF
  ok((await featureOn("ravella")) === false, "1: `ravella` DEFAULT_OFF");

  // knoblar: chegirma 10%, cashback 1%, buyurtma-cap 5000, kunlik cap 6000 (cap'lar sinalsin)
  await setBonusEcon("ravellaDiscountPct", 10);
  await setBonusEcon("ravellaCashbackPct", 1);
  await setBonusEcon("ravellaCashbackPerOrder", 5000);
  await setBonusEcon("ravellaCashbackDaily", 6000);

  // katalog
  const cat = await svc.adminCreateCategory({ name: `${TAG} Saxna`, emoji: "🎭" });
  ok(cat.ok && !!cat.id, "2: kategoriya yaratildi");
  const item = await svc.adminCreateItem({ categoryId: cat.id!, name: `${TAG} Onajon yozuvi`, basePriceSom: 100_000 });
  ok(item.ok && !!item.id, "3: bezak yaratildi");
  const itemId = item.id!;

  // yangi bezak DARK yaratiladi — ega yoqmaguncha katalogda yo'q
  const beforeToggle = await svc.getRavellaCatalog(true);
  ok(!beforeToggle.categories.some((c) => c.items.some((i) => i.id === itemId)), "4: yangi bezak active=false — katalogda ko'rinmaydi");
  await svc.adminEditItem(itemId, { active: true });

  const salut = await svc.adminCreateAddon({ itemId, name: "Salyut", priceSom: 150_000, maxQty: 3 });
  const shar = await svc.adminCreateAddon({ categoryId: cat.id!, name: "Sharlar", priceSom: 50_000, maxQty: 5 });
  ok(salut.ok && shar.ok, "5: qo'shimchalar (bezakka + kategoriyaga) yaratildi");

  const detail = await svc.getRavellaItemDetail(itemId, true);
  ok(detail.addons.length === 2, `6: konstruktor bezak-qo'shimchasini HAM, kategoriya-qo'shimchasini HAM ko'radi — ${detail.addons.length}`);

  const member = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-A`, fullName: "Test Mijoz", phone: "+998907654321", coins: 0 } });

  // 7) flag OFF → buyurtma qabul qilinmaydi (preview=false)
  const offRes = await svc.createRavellaOrder(member.id, { itemId, addons: [], contact: "+998907654321", address: "Koson sh., Test 1" });
  ok(!offRes.ok && offRes.reason === "off", `7: flag OFF → reason=off, keldi ${JSON.stringify(offRes)}`);

  await setFeature("ravella", true);
  __resetFeatureCache();

  // 8) validatsiya: telefon/manzil
  const badPhone = await svc.createRavellaOrder(member.id, { itemId, addons: [], contact: "123", address: "Koson sh., Test 1" });
  ok(!badPhone.ok && badPhone.reason === "bad_contact", "8a: qisqa telefon → bad_contact");
  const badAddr = await svc.createRavellaOrder(member.id, { itemId, addons: [], contact: "+998907654321", address: "yo" });
  ok(!badAddr.ok && badAddr.reason === "bad_address", "8b: qisqa manzil → bad_address");

  // 9) begona qo'shimcha (boshqa bezakniki) → bad_addon
  const otherItem = await svc.adminCreateItem({ categoryId: cat.id!, name: `${TAG} Boshqa`, basePriceSom: 10_000 });
  await svc.adminEditItem(otherItem.id!, { active: true });
  const alien = await svc.adminCreateAddon({ itemId: otherItem.id!, name: "Begona", priceSom: 1000 });
  const alienRes = await svc.createRavellaOrder(member.id, { itemId, addons: [{ addonId: alien.id!, qty: 1 }], contact: "+998907654321", address: "Koson sh., Test 1" });
  ok(!alienRes.ok && alienRes.reason === "bad_addon", `9: boshqa bezakning qo'shimchasi rad etiladi — ${JSON.stringify(alienRes)}`);

  // 10) NARX SERVERDA (§7.1): 100k + salyut×2 (300k) + shar×1 (50k) = 450k; chegirma 10% → 405k
  const order = await svc.createRavellaOrder(member.id, {
    itemId,
    addons: [{ addonId: salut.id!, qty: 2 }, { addonId: shar.id!, qty: 1 }],
    contact: "+998907654321", address: "Koson sh., Test ko'chasi 1", eventDate: "5-avgust", note: "", useDiscount: true,
  });
  ok(order.ok && order.totalSom === 405_000, `10: jami serverda 405 000 — keldi ${order.totalSom}`);
  const row = await prisma.ravellaOrder.findUnique({ where: { id: order.orderId! } });
  ok(row?.subtotalSom === 450_000 && row?.discountSom === 45_000 && row?.discountPct === 10, `10b: snapshot 450k/−45k/10% — ${JSON.stringify({ s: row?.subtotalSom, d: row?.discountSom })}`);

  // 10c) qo'shimcha qty maxQty bilan qirqiladi (client 99 yuborsa ham)
  const clipped = await svc.createRavellaOrder(member.id, {
    itemId, addons: [{ addonId: salut.id!, qty: 99 }], contact: "+998907654321", address: "Koson sh., Test 2",
  });
  const clippedRow = await prisma.ravellaOrder.findUnique({ where: { id: clipped.orderId! } });
  ok(clippedRow?.subtotalSom === 100_000 + 150_000 * 3, `10c: qty maxQty=3 gacha qirqildi — ${clippedRow?.subtotalSom}`);

  // 11) pending limiti (3 ochiq buyurtma)
  await svc.createRavellaOrder(member.id, { itemId, addons: [], contact: "+998907654321", address: "Koson sh., Test 3" });
  const overLimit = await svc.createRavellaOrder(member.id, { itemId, addons: [], contact: "+998907654321", address: "Koson sh., Test 4" });
  ok(!overLimit.ok && overLimit.reason === "pending_limit", `11: 4-buyurtma → pending_limit — ${JSON.stringify(overLimit)}`);

  // 12) PUL: `pending` holatida cashback YO'Q
  const orderId = order.orderId!;
  ok((await prisma.coinTxn.count({ where: { memberId: member.id } })) === 0, "12: buyurtma yaratilganda CoinTxn YO'Q (naqd to'lov)");

  // 13) holat-o'tishlari: pending → accepted → done
  const accepted = await svc.acceptRavellaOrder(orderId);
  ok(accepted.ok && accepted.newStatus === "accepted", "13a: qabul qilindi");
  const acceptedTwice = await svc.acceptRavellaOrder(orderId);
  ok(!acceptedTwice.ok, "13b: ikkinchi marta qabul o'tmaydi (status-guard)");
  const cancelAfterAccept = await svc.cancelRavellaOrder(member.id, orderId);
  ok(!cancelAfterAccept.ok, "13c: qabul qilingach mijoz bekor qila olmaydi");

  const doneRes = await svc.finishRavellaOrder(orderId);
  ok(doneRes.ok && doneRes.newStatus === "done", "13d: bajarildi");
  // 405 000 ning 1% = 4050, buyurtma-cap 5000 dan past → to'liq beriladi
  ok(doneRes.cashbackSom === 4050, `14: cashback 1% = 4050 — keldi ${doneRes.cashbackSom}`);

  const txns = await prisma.coinTxn.findMany({ where: { memberId: member.id, kind: "ravella_cashback" } });
  ok(txns.length === 1 && txns[0]!.amount === 4050, `15: AYNAN 1 ta CoinTxn, 4050 — ${JSON.stringify(txns.map((t) => t.amount))}`);
  // §7.4 — safar ≤350 clamp indeksiga tushmasin
  ok(txns[0]!.bookingId === null, `16: bookingId=null → safar ≤350 clamp'iga TEGMAYDI — ${txns[0]!.bookingId}`);
  ok(txns[0]!.idempotencyKey === `rvlcb:${orderId}`, `17: idempotent kalit rvlcb:${orderId}`);

  // 18) IDEMPOTENTLIK: qayta `done` + grant'ni to'g'ridan-to'g'ri chaqirish — yangi tanga CHIQMAYDI
  await svc.finishRavellaOrder(orderId);
  await svc.grantRavellaCashback(orderId);
  const after = await prisma.coinTxn.count({ where: { memberId: member.id, kind: "ravella_cashback" } });
  ok(after === 1, `18: takroriy done/grant → CoinTxn hali ham 1 ta — ${after}`);

  // 19) BUYURTMA-CAP: 5 mln so'mlik ish → 1% = 50 000, cap 5000 ga qisqaradi
  const bigMember = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-B`, fullName: "Katta Mijoz", phone: "+998901112233", coins: 0 } });
  const bigItem = await svc.adminCreateItem({ categoryId: cat.id!, name: `${TAG} Katta saxna`, basePriceSom: 5_000_000 });
  await svc.adminEditItem(bigItem.id!, { active: true });
  const bigOrder = await svc.createRavellaOrder(bigMember.id, { itemId: bigItem.id!, addons: [], contact: "+998901112233", address: "Koson sh., Katto 1" });
  await svc.acceptRavellaOrder(bigOrder.orderId!);
  const bigDone = await svc.finishRavellaOrder(bigOrder.orderId!);
  ok(bigDone.cashbackSom === 5000, `19: 5 mln → 1%=50 000, buyurtma-cap 5000 ga qisqardi — ${bigDone.cashbackSom}`);

  // 20) KUNLIK CAP: shu a'zoga yana bir katta ish → kunlik 6000 chegarasi, ya'ni faqat 1000 qoladi
  const bigOrder2 = await svc.createRavellaOrder(bigMember.id, { itemId: bigItem.id!, addons: [], contact: "+998901112233", address: "Koson sh., Katto 2" });
  await svc.acceptRavellaOrder(bigOrder2.orderId!);
  const bigDone2 = await svc.finishRavellaOrder(bigOrder2.orderId!);
  ok(bigDone2.cashbackSom === 1000, `20: kunlik cap 6000 → ikkinchi ishda faqat 1000 — ${bigDone2.cashbackSom}`);
  const daySum = await prisma.coinTxn.aggregate({ where: { memberId: bigMember.id, kind: "ravella_cashback" }, _sum: { amount: true } });
  ok((daySum._sum.amount ?? 0) === 6000, `20b: kunlik jami AYNAN 6000 — ${daySum._sum.amount}`);

  // 21) rad etish — pul harakati YO'Q (naqd)
  const rejMember = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-C`, fullName: "Rad Mijoz", phone: "+998903334455", coins: 0 } });
  const rejOrder = await svc.createRavellaOrder(rejMember.id, { itemId, addons: [], contact: "+998903334455", address: "Koson sh., Rad 1" });
  const rejected = await svc.rejectRavellaOrder(rejOrder.orderId!, "Sana band");
  ok(rejected.ok, "21a: rad etildi");
  ok((await prisma.coinTxn.count({ where: { memberId: rejMember.id } })) === 0, "21b: rad etilgan buyurtmada CoinTxn YO'Q");
  const rejDone = await svc.finishRavellaOrder(rejOrder.orderId!);
  ok(!rejDone.ok, "21c: rad etilgandan keyin `done` o'tmaydi → cashback fermasi yo'q");

  // 22) SLA — bir marta ogohlantiradi, ikkinchi yugurishda jim
  await prisma.ravellaOrder.updateMany({ where: { id: rejOrder.orderId! }, data: { status: "pending", createdAt: new Date(Date.now() - 60 * 60_000) } });
  let alerts = 0;
  const fakeAlert = async (): Promise<void> => { alerts += 1; };
  await svc.checkRavellaSlaAndAlert(fakeAlert);
  await svc.checkRavellaSlaAndAlert(fakeAlert);
  ok(alerts === 1, `22: SLA ogohlantirishi AYNAN 1 marta (slaAlertedAt) — ${alerts}`);

  // 23) flag OFF → katalog bo'sh (mijoz tomoni), preview esa ko'radi
  await setFeature("ravella", false);
  __resetFeatureCache();
  const riderCatalog = await svc.getRavellaCatalog(false);
  ok(riderCatalog.categories.length === 0, "23a: flag OFF → mijoz katalogi bo'sh");
  const ownerCatalog = await svc.getRavellaCatalog(true);
  ok(ownerCatalog.categories.length > 0, "23b: owner-preview flag OFF bo'lsa ham ko'radi");

  await cleanup();
  await prisma.appState.deleteMany({ where: { key: "feature:ravella" } });
  await prisma.$disconnect();
  console.log(process.exitCode ? "\n❌ TEST YIQILDI" : "\n✅ HAMMASI O'TDI");
}

main().catch((e) => { console.error(e); process.exit(1); });
