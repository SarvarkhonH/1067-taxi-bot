// 🤝 Trade escrow/barter/moderation + 🤖 AI intent rules + ⭐ rating tests.
// Run: dotenv -e ../../.env -- tsx src/scripts/testTradeAI.ts
import "../env";
import { prisma } from "../db";
import { grantCoins } from "../services/coinService";
import { mintItem, seedItemTypes } from "../services/itemService";
import { acceptOffer, cancelOffer, makeOffer, myTrades, sendTradeMessage, BARTER_FEE } from "../services/tradeService";
import { parseIntent } from "../services/ai/intent";
import { sanitize, llmAvailable } from "../services/ai/llmRouter";
import { rateRide } from "../services/bookingPlus";

const TAG = "trade-test";
let failed = 0;
function ok(cond: boolean, label: string): void {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) failed++;
}

async function cleanup(): Promise<void> {
  const ms = await prisma.member.findMany({ where: { kasId: { startsWith: TAG } }, select: { id: true } });
  const ids = ms.map((m) => m.id);
  const offers = await prisma.tradeOffer.findMany({ where: { OR: [{ fromId: { in: ids } }, { toId: { in: ids } }] } });
  await prisma.tradeMessage.deleteMany({ where: { offerId: { in: offers.map((o) => o.id) } } });
  await prisma.tradeOffer.deleteMany({ where: { id: { in: offers.map((o) => o.id) } } });
  await prisma.itemListing.deleteMany({ where: { sellerId: { in: ids } } });
  await prisma.item.deleteMany({ where: { ownerId: { in: ids } } });
  await prisma.rideRating.deleteMany({ where: { memberId: { in: ids } } });
  await prisma.appState.deleteMany({ where: { OR: ids.flatMap((id) => [{ key: `tradestrikes:${id}` }, { key: `tradeban:${id}` }]) } });
  await prisma.itemType.deleteMany({ where: { code: { in: ["trade_test_a", "trade_test_b"] } } });
  await prisma.member.deleteMany({ where: { id: { in: ids } } });
}

async function main(): Promise<void> {
  await cleanup();
  await seedItemTypes();
  const a = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-A`, fullName: "Trade A", phone: "+998900008001", trips: 5 } });
  const b = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-B`, fullName: "Trade B", phone: "+998900008002", trips: 5 } });
  const fresh = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-F`, fullName: "Trade F", phone: "+998900008003", trips: 1 } });
  await grantCoins(a.id, 20000, "manual", "seed");
  await grantCoins(b.id, 20000, "manual", "seed");
  await prisma.itemType.createMany({
    data: [
      { code: "trade_test_a", name: "TT A", emoji: "🅰️", kind: "plate", mintCap: 5, mintPrice: 1000 },
      { code: "trade_test_b", name: "TT B", emoji: "🅱️", kind: "plate", mintCap: 5, mintPrice: 1000 },
    ],
  });
  const ia = await mintItem(a.id, "trade_test_a"); // A owns 🅰️
  const ib = await mintItem(b.id, "trade_test_b"); // B owns 🅱️
  const aT = await prisma.itemType.findUnique({ where: { code: "trade_test_a" } });
  const bT = await prisma.itemType.findUnique({ where: { code: "trade_test_b" } });
  const itemA = (await prisma.item.findFirst({ where: { ownerId: a.id, itemTypeId: aT!.id } }))!;
  const itemB = (await prisma.item.findFirst({ where: { ownerId: b.id, itemTypeId: bT!.id } }))!;
  ok(ia.ok && ib.ok, "fixture items minted");

  // coin offer escrows immediately; cancel refunds
  const bBefore = (await prisma.member.findUnique({ where: { id: b.id } }))!.coins;
  const o1 = await makeOffer(b.id, itemA.id, 2000);
  const bMid = (await prisma.member.findUnique({ where: { id: b.id } }))!.coins;
  ok(o1.ok && bBefore - bMid === 2000, `coin offer escrowed 2000 at create`);
  const c1 = await cancelOffer(b.id, o1.offerId!);
  const bAfter = (await prisma.member.findUnique({ where: { id: b.id } }))!.coins;
  ok(c1.ok && bAfter === bBefore, `cancel refunds escrow fully`);
  const c2 = await cancelOffer(b.id, o1.offerId!);
  ok(!c2.ok, `double-cancel blocked (idempotent refund)`);

  // accept pays 90%, ownership flips
  const o2 = await makeOffer(b.id, itemA.id, 2000);
  const aBefore = (await prisma.member.findUnique({ where: { id: a.id } }))!.coins;
  const acc = await acceptOffer(a.id, o2.offerId!);
  const aAfter = (await prisma.member.findUnique({ where: { id: a.id } }))!.coins;
  ok(acc.ok && aAfter - aBefore === 1800, `accept paid seller 1800 (10% burn)`);
  ok((await prisma.item.findUnique({ where: { id: itemA.id } }))!.ownerId === b.id, `item flipped to offerer`);

  // barter: B's 🅰️(now) for A's? — swap items between owners w/ 50 fee each
  const o3 = await makeOffer(a.id, itemA.id, 0, itemB.id); // A wants 🅰️ back, offers... wait A owns nothing of B's
  ok(!o3.ok && o3.reason === "barter_not_yours", `barter requires owning the offered item`);
  // proper barter: A offers... A owns itemB? no. Give A a new item:
  await mintItem(a.id, "trade_test_b");
  const itemB2 = (await prisma.item.findFirst({ where: { ownerId: a.id, itemTypeId: bT!.id } }))!;
  const o4 = await makeOffer(a.id, itemA.id, 0, itemB2.id); // A offers 🅱️#2 for 🅰️ (owned by B)
  ok(o4.ok, `barter offer created (no escrow needed)`);
  const aFee = (await prisma.member.findUnique({ where: { id: a.id } }))!.coins;
  const bFee = (await prisma.member.findUnique({ where: { id: b.id } }))!.coins;
  const acc2 = await acceptOffer(b.id, o4.offerId!);
  const aFee2 = (await prisma.member.findUnique({ where: { id: a.id } }))!.coins;
  const bFee2 = (await prisma.member.findUnique({ where: { id: b.id } }))!.coins;
  ok(acc2.ok && aFee - aFee2 === BARTER_FEE && bFee - bFee2 === BARTER_FEE, `barter: 50-tanga fee burned from EACH side`);
  ok((await prisma.item.findUnique({ where: { id: itemA.id } }))!.ownerId === a.id && (await prisma.item.findUnique({ where: { id: itemB2.id } }))!.ownerId === b.id, `barter swapped both items`);

  // gates: <3 trips, own item, empty offer
  ok(!(await makeOffer(fresh.id, itemA.id, 1000)).ok, `<3 trips blocked`);
  ok((await makeOffer(a.id, itemA.id, 1000)).reason === "own_item", `own-item offer blocked`);
  ok((await makeOffer(b.id, itemA.id, 0)).reason === "empty_offer", `empty offer blocked`);

  // chat moderation: phone → blocked + strike; 3 strikes → ban
  const o5 = await makeOffer(b.id, itemA.id, 500);
  const m1 = await sendTradeMessage(b.id, o5.offerId!, "Salom, 99 123 45 67 ga qo'ng'iroq qiling");
  ok(!m1.ok && m1.reason === "moderated", `phone number in chat blocked (strike 1)`);
  await sendTradeMessage(b.id, o5.offerId!, "naqd pulga beraman");
  const m3 = await sendTradeMessage(b.id, o5.offerId!, "payme orqali tashlayman");
  ok(!m3.ok, `cash-deal words blocked (strike 3 → ban)`);
  const m4 = await sendTradeMessage(b.id, o5.offerId!, "oddiy xabar");
  ok(!m4.ok && m4.reason === "banned", `3 strikes = 30-day trade ban`);
  const mOk = await sendTradeMessage(a.id, o5.offerId!, "Narxni 700 qilsak?");
  ok(mOk.ok, `clean message passes moderation`);
  const view = await myTrades(a.id);
  ok(view.incoming.length === 1 && view.incoming[0]!.chat.length === 1, `trade view + chat visible`);
  await cancelOffer(b.id, o5.offerId!).catch(() => null);
  await cancelOffer(a.id, o5.offerId!);

  // 🤖 AI intent rules
  ok(parseIntent("ertaga 7 da bozorga taksi kerak").type === "book", `book intent detected`);
  const bi = parseIntent("ertaga bozorga taksi chaqir");
  ok(bi.type === "book" && (bi as { when: string }).when === "later", `"ertaga" → later`);
  ok(parseIntent("narx qancha turadi").type === "faq", `FAQ: narx`);
  ok(parseIntent("cashback qanday ishlaydi").type === "faq", `FAQ: cashback`);
  ok(parseIntent("assalomu alaykum").type === "none", `greeting → none (no hijack)`);
  ok(sanitize("tel 998901234567 ga yoz") === "tel [raqam] ga yoz", `sanitize strips long digits`);
  ok(typeof llmAvailable() === "boolean", `llm router loads (enabled=${llmAvailable()})`);

  // ⭐ rating: idempotent, own-ride only
  await prisma.member.update({ where: { id: a.id }, data: { lastBookingId: 999301, lastBookingCar: "70TEST1" } });
  const r1 = await rateRide(a.id, 999301, 5, ["Toza mashina", "FAKE_TAG"]);
  ok(r1.ok, `rating saved`);
  const saved = await prisma.rideRating.findFirst({ where: { memberId: a.id, bookingId: 999301 } });
  ok(saved?.tags === "Toza mashina", `unknown tags filtered`);
  ok(!(await rateRide(a.id, 999301, 4, [])).ok, `double-rate blocked`);
  ok((await rateRide(a.id, 111, 5, [])).reason === "not_your_ride", `foreign booking blocked`);

  // ledger invariants
  for (const id of [a.id, b.id]) {
    const bal = (await prisma.member.findUnique({ where: { id } }))!.coins;
    const sum = await prisma.coinTxn.aggregate({ where: { memberId: id }, _sum: { amount: true } });
    ok(Math.abs(bal - (sum._sum.amount ?? 0)) < 0.001, `ledger invariant (member ${id})`);
  }

  await cleanup();
  await prisma.$disconnect();
  console.log(failed === 0 ? "\n🎉 all trade/AI/rating checks passed" : `\n❌ ${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
