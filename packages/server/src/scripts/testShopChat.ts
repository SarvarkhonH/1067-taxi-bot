// 💬 C1 BirJoy mijoz↔do'kon chat tests — TEST_DATABASE_URL'da (_testDb refuses app DB).
import "./_testDb";
process.env.KAS_MODE = "mock";

const TAG = "CHATTEST";

function ok(cond: boolean, label: string): void {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) process.exitCode = 1;
}

async function main(): Promise<void> {
  const { prisma } = await import("../db");
  const { sendBuyerMessage, getBuyerThread, handleSellerReply, noteActiveThread, listShopChatConversations, getShopChatMessages, sendSellerReplyFromPanel } = await import("../services/shopChatService");
  const { getChatConversations, getChatMessages } = await import("../services/adminOps");
  const { setFeature, __resetFeatureCache } = await import("../services/featureFlags");

  const cleanup = async (): Promise<void> => {
    const shops = await prisma.marketShop.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } });
    const shopIds = shops.map((s) => s.id);
    await prisma.supportMsg.deleteMany({ where: { OR: [{ shopId: { in: shopIds } }, { telegramId: { startsWith: TAG } }] } });
    await prisma.marketShop.deleteMany({ where: { name: { startsWith: TAG } } });
    const members = await prisma.member.findMany({ where: { kasId: { startsWith: TAG } } });
    await prisma.telegramUser.deleteMany({ where: { memberId: { in: members.map((m) => m.id) } } });
    await prisma.member.deleteMany({ where: { id: { in: members.map((m) => m.id) } } });
    await prisma.appState.deleteMany({ where: { key: "feature:shopchat" } });
  };
  await cleanup();
  await setFeature("shopchat", true);
  __resetFeatureCache();

  const SELLER_TG = `${TAG}-seller-tg`;
  const BUYER_TG = `${TAG}-buyer-tg`;
  const shop = await prisma.marketShop.create({ data: { name: `${TAG}-A`, phone: "+998900000001", active: true, ownerChatId: SELLER_TG } });
  const inactiveShop = await prisma.marketShop.create({ data: { name: `${TAG}-B`, phone: "+998900000002", active: false, ownerChatId: SELLER_TG } });
  const buyer = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-M1`, fullName: "Chat Buyer", phone: "+998901112233" } });
  await prisma.telegramUser.create({ data: { id: BUYER_TG, memberId: buyer.id } });

  // 1) flag DARK → rejected
  await setFeature("shopchat", false);
  __resetFeatureCache();
  const rDark = await sendBuyerMessage(buyer.id, shop.id, "salom");
  ok(rDark.ok === false, "1: shopchat flag DARK → send rejected");
  const previewDark = await sendBuyerMessage(buyer.id, shop.id, "salom", true);
  ok(previewDark.ok === true, "1: preview=true (admin) bypasses DARK flag");
  await prisma.supportMsg.deleteMany({ where: { shopId: shop.id } }); // preview-send tozalash
  await setFeature("shopchat", true);
  __resetFeatureCache();

  // 2) happy path — buyer sends, SupportMsg row created correctly
  const r1 = await sendBuyerMessage(buyer.id, shop.id, "Bu hali bormi?");
  ok(r1.ok === true, "2: sendBuyerMessage ok");
  const row1 = await prisma.supportMsg.findFirst({ where: { shopId: shop.id, telegramId: BUYER_TG, direction: "in" } });
  ok(row1?.text === "Bu hali bormi?", "2: SupportMsg row created with correct shopId/telegramId/direction/text");

  // 3) empty text → bad_text, nothing created
  const rEmpty = await sendBuyerMessage(buyer.id, shop.id, "   ");
  ok(rEmpty.ok === false && rEmpty.reason === "bad_text", "3: empty text → bad_text");

  // 4) inactive shop → shop_inactive
  const rInactive = await sendBuyerMessage(buyer.id, inactiveShop.id, "salom");
  ok(rInactive.ok === false && rInactive.reason === "shop_inactive", "4: inactive shop → shop_inactive");

  // 5) spam-guard: 60s ichida ≤5, 6-chisi too_fast. r1 (test 2) = 1-chi xabar; +3 (bu yerda) = 4;
  // r5 = 5-chi (hali ruxsat, recent=4<5); r6 = 6-chi (endi recent=5>=5 → bloklanadi).
  for (let i = 0; i < 3; i++) await sendBuyerMessage(buyer.id, shop.id, `msg ${i}`);
  const r5 = await sendBuyerMessage(buyer.id, shop.id, "5-chi xabar");
  ok(r5.ok === true, "5: 5th message within 60s still ok");
  const r6 = await sendBuyerMessage(buyer.id, shop.id, "6-chi xabar");
  ok(r6.ok === false && r6.reason === "too_fast", "5: 6th message within 60s → too_fast");

  // 6) getBuyerThread returns this buyer's messages for this shop, scoped
  const thread1 = await getBuyerThread(buyer.id, shop.id);
  ok(thread1!.messages.filter((m) => m.direction === "in").length === 5, `6: getBuyerThread returns all 5 successful inbound (6th was blocked), got ${thread1!.messages.filter((m) => m.direction === "in").length}`);
  const threadOtherShop = await getBuyerThread(buyer.id, inactiveShop.id);
  ok(threadOtherShop!.messages.length === 0, "6: getBuyerThread on a shop with no messages → empty, no cross-shop leak");

  // 7) handleSellerReply via relayMsgId match
  await prisma.supportMsg.updateMany({ where: { id: row1!.id }, data: { relayMsgId: 999111 } });
  const match1 = await handleSellerReply(SELLER_TG, 999111, "Ha, bor!");
  ok(match1?.shopId === shop.id && match1?.buyerTg === BUYER_TG, "7: handleSellerReply resolves via relayMsgId match");
  const outRow = await prisma.supportMsg.findFirst({ where: { shopId: shop.id, telegramId: BUYER_TG, direction: "out", text: "Ha, bor!" } });
  ok(!!outRow, "7: seller reply created an 'out' SupportMsg row");

  // 8) handleSellerReply via fallback (no reply_to, cache-based)
  noteActiveThread(SELLER_TG, shop.id, BUYER_TG);
  const match2 = await handleSellerReply(SELLER_TG, undefined, "Fallback javob");
  ok(match2?.shopId === shop.id && match2?.buyerTg === BUYER_TG, "8: handleSellerReply resolves via last-active-thread fallback");

  // 9) no match at all → null (falls through to next() in the real bot handler)
  const match3 = await handleSellerReply(`${TAG}-unrelated-tg`, undefined, "random text");
  ok(match3 === null, "9: unrelated tgId with no reply_to and no cache entry → null (no match)");

  // 10) CONTAMINATION regression: a generic AI/support message (shopId=null) for the SAME
  // buyer tg must NOT appear in shop-scoped queries, and shop-chat messages must NOT appear
  // in the generic owner AI/support inbox (adminOps.getChatConversations/getChatMessages).
  await prisma.supportMsg.create({ data: { telegramId: BUYER_TG, direction: "in", text: "Bu AI-ga savol, do'konga aloqasi yo'q" } });
  const genericConvos = await getChatConversations();
  const genericMine = genericConvos.find((c) => c.telegramId === BUYER_TG);
  ok(!!genericMine && genericMine.lastMsg === "Bu AI-ga savol, do'konga aloqasi yo'q", "10: generic AI-inbox shows the shopId=null message as latest (not a shop-chat message)");
  const genericMsgs = await getChatMessages(BUYER_TG);
  ok(genericMsgs.every((m) => m.text !== "Bu hali bormi?"), "10: generic AI-inbox does NOT leak shop-chat messages");
  const shopMsgs = await getShopChatMessages(shop.id, BUYER_TG);
  ok(shopMsgs.every((m) => m.text !== "Bu AI-ga savol, do'konga aloqasi yo'q"), "10: shop-chat inbox does NOT leak the generic AI message");

  // 11) admin-panel seller-inbox round-trip
  const convos = await listShopChatConversations(shop.id);
  ok(convos.some((c) => c.telegramId === BUYER_TG), "11: listShopChatConversations includes the buyer");
  const panelReply = await sendSellerReplyFromPanel(shop.id, BUYER_TG, "Admin-paneldan javob");
  ok(panelReply.ok === true, "11: sendSellerReplyFromPanel ok");
  const shopMsgs2 = await getShopChatMessages(shop.id, BUYER_TG);
  ok(shopMsgs2.some((m) => m.text === "Admin-paneldan javob" && m.direction === "out"), "11: panel reply persisted as an 'out' message");

  // 12) R4-gap fix: cross-tenant impersonation via relayMsgId COLLISION must NOT succeed. Telegram
  // message_id is only unique PER-CHAT — a different seller replying with a numerically-colliding
  // reply_to_message must NOT be routed to a shop they don't own.
  const victimShop = await prisma.marketShop.create({ data: { name: `${TAG}-C`, phone: "+998900000003", active: true, ownerChatId: `${TAG}-victim-seller-tg` } });
  const victimBuyerTg = `${TAG}-victim-buyer-tg`;
  const victimBuyer = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-M2`, fullName: "Victim Buyer", phone: "+998901112255" } });
  await prisma.telegramUser.create({ data: { id: victimBuyerTg, memberId: victimBuyer.id } });
  await prisma.supportMsg.create({ data: { shopId: victimShop.id, telegramId: victimBuyerTg, direction: "in", text: "Victim's message", relayMsgId: 555222 } });
  const ATTACKER_TG = `${TAG}-attacker-seller-tg`; // does NOT own victimShop
  const impersonation = await handleSellerReply(ATTACKER_TG, 555222, "Impersonated reply");
  ok(impersonation === null, "12: attacker replying with a colliding relayMsgId for a shop they don't own → null (not routed)");
  const noOutRow = await prisma.supportMsg.findFirst({ where: { shopId: victimShop.id, telegramId: victimBuyerTg, direction: "out" } });
  ok(!noOutRow, "12: no impersonated 'out' message was created for the victim's buyer");
  // positive control: the REAL owner of victimShop replying with the SAME relayMsgId still works
  const legit = await handleSellerReply(`${TAG}-victim-seller-tg`, 555222, "Real owner's reply");
  ok(legit?.shopId === victimShop.id && legit?.buyerTg === victimBuyerTg, "12: the shop's real owner replying to the same relayMsgId still resolves correctly");

  await cleanup();
  console.log(process.exitCode ? "\n❌ FAILED" : "\n✅ ALL GREEN");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
