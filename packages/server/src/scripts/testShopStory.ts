// 📹 S1 BirJoy do'kon-hikoya tests — TEST_DATABASE_URL'da (_testDb refuses app DB).
import "./_testDb";
process.env.KAS_MODE = "mock";

const TAG = "STORYTEST";

function ok(cond: boolean, label: string): void {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) process.exitCode = 1;
}

async function main(): Promise<void> {
  const { prisma } = await import("../db");
  const { createShopStory, listStoryTray, getShopStories, markStoryViewed } = await import("../services/shopService");
  const { setFeature, __resetFeatureCache } = await import("../services/featureFlags");

  const cleanup = async (): Promise<void> => {
    const shops = await prisma.marketShop.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } });
    const shopIds = shops.map((s) => s.id);
    const stories = await prisma.shopStory.findMany({ where: { shopId: { in: shopIds } }, select: { id: true } });
    const members = await prisma.member.findMany({ where: { kasId: { startsWith: TAG } } });
    const memberIds = members.map((m) => m.id);
    // memberId'ga qarab HAM tozalaydi (shopId'ga qarab EMAS) — test 13 ATAYLAB yaratadigan orphan
    // qatorni (storyId hech qanday haqiqiy hikoyaga tegishli emas) ham qamrab oladi.
    await prisma.shopStoryView.deleteMany({ where: { OR: [{ storyId: { in: stories.map((s) => s.id) } }, { memberId: { in: memberIds } }] } });
    await prisma.shopStory.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.marketShop.deleteMany({ where: { name: { startsWith: TAG } } });
    await prisma.member.deleteMany({ where: { id: { in: memberIds } } });
    await prisma.appState.deleteMany({ where: { key: "feature:shopstory" } });
  };
  await cleanup();
  await setFeature("shopstory", true);
  __resetFeatureCache();

  const shop = await prisma.marketShop.create({ data: { name: `${TAG}-A`, phone: "+998900000001", active: true } });
  const viewer = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-M1`, fullName: "Story Viewer", phone: "+998901112233" } });
  const otherViewer = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-M2`, fullName: "Other Viewer", phone: "+998901112244" } });

  // 1) create — video-only, expiresAt ≈ +24h
  const r1 = await createShopStory(shop.id, { videoFileId: "vid_1", caption: "Bugungi hikoya" });
  ok(r1.ok && !!r1.id, "1: createShopStory ok");
  const row1 = await prisma.shopStory.findUnique({ where: { id: r1.id! } });
  const hoursUntilExpiry = row1 ? (row1.expiresAt.getTime() - Date.now()) / 3600_000 : 0;
  ok(hoursUntilExpiry > 23.9 && hoursUntilExpiry <= 24, "1: expiresAt ≈ +24h");
  ok(row1?.caption === "Bugungi hikoya", "1: caption persisted");

  // 2) no video/photo → rejected
  const rBad = await createShopStory(shop.id, {});
  ok(rBad.ok === false, "2: neither video nor photo → ok:false");

  // 3) flag DARK → empty results for a non-preview caller
  await setFeature("shopstory", false);
  __resetFeatureCache();
  const trayDark = await listStoryTray(viewer.id, false);
  ok(trayDark.length === 0, "3: shopstory flag DARK → empty tray");
  const storiesDark = await getShopStories(shop.id, viewer.id, false);
  ok(storiesDark.length === 0, "3: shopstory flag DARK → empty shop-stories");
  const trayPreview = await listStoryTray(viewer.id, true);
  ok(trayPreview.some((s) => s.shopId === shop.id), "3: preview=true (admin) bypasses DARK flag");
  await setFeature("shopstory", true);
  __resetFeatureCache();

  // 4) tray shows the shop, unseen ring by default
  const tray1 = await listStoryTray(viewer.id);
  const trayEntry = tray1.find((s) => s.shopId === shop.id);
  ok(!!trayEntry && trayEntry.seen === false, "4: tray entry unseen before any view");

  // 5) getShopStories includes the story, seen=false for this viewer
  const stories1 = await getShopStories(shop.id, viewer.id);
  ok(stories1.length === 1 && stories1[0]!.id === r1.id && stories1[0]!.seen === false, "5: getShopStories returns the story, unseen");

  // 6) markStoryViewed → seen flips for THIS member, tray ring flips to seen
  await markStoryViewed(r1.id!, viewer.id);
  const stories2 = await getShopStories(shop.id, viewer.id);
  ok(stories2[0]!.seen === true, "6: after markStoryViewed → seen=true for this viewer");
  const tray2 = await listStoryTray(viewer.id);
  ok(tray2.find((s) => s.shopId === shop.id)!.seen === true, "6: tray ring flips to seen");

  // 7) per-member: a DIFFERENT viewer still sees it as unseen (seen-state is not global)
  const storiesOther = await getShopStories(shop.id, otherViewer.id);
  ok(storiesOther[0]!.seen === false, "7: a different member still sees it as unseen (per-member state)");

  // 8) viewCount increments exactly once even if markStoryViewed is called twice (idempotent)
  await markStoryViewed(r1.id!, viewer.id);
  const row2 = await prisma.shopStory.findUnique({ where: { id: r1.id! } });
  ok(row2?.viewCount === 1, `8: viewCount increments exactly once on repeat view, got ${row2?.viewCount}`);

  // 9) a second, distinct viewer's FIRST view does increment (not blocked by #8)
  await markStoryViewed(r1.id!, otherViewer.id);
  const row3 = await prisma.shopStory.findUnique({ where: { id: r1.id! } });
  ok(row3?.viewCount === 2, `9: a second distinct viewer's view DOES increment, got ${row3?.viewCount}`);

  // 10) expired story is excluded from both tray and shop-stories (read-time filter, no poller)
  const expired = await prisma.shopStory.create({ data: { shopId: shop.id, videoFileId: "vid_old", expiresAt: new Date(Date.now() - 1000) } });
  const stories3 = await getShopStories(shop.id, viewer.id);
  ok(stories3.every((s) => s.id !== expired.id), "10: expired story excluded from getShopStories");
  const tray3 = await listStoryTray(viewer.id);
  ok(tray3.some((s) => s.shopId === shop.id), "10: shop still in tray (has the ONE non-expired story)");

  // 11) a shop with ONLY an expired story disappears from the tray entirely
  const shop2 = await prisma.marketShop.create({ data: { name: `${TAG}-B`, phone: "+998900000002", active: true } });
  await prisma.shopStory.create({ data: { shopId: shop2.id, videoFileId: "vid_old2", expiresAt: new Date(Date.now() - 1000) } });
  const tray4 = await listStoryTray(viewer.id);
  ok(tray4.every((s) => s.shopId !== shop2.id), "11: shop with only expired stories is absent from tray");

  // 12) inactive shop's stories never surface (even if non-expired)
  const shop3 = await prisma.marketShop.create({ data: { name: `${TAG}-C`, phone: "+998900000003", active: false } });
  await createShopStory(shop3.id, { videoFileId: "vid_inactive" });
  const tray5 = await listStoryTray(viewer.id);
  ok(tray5.every((s) => s.shopId !== shop3.id), "12: inactive shop absent from tray");
  const stories4 = await getShopStories(shop3.id, viewer.id);
  ok(stories4.length === 0, "12: getShopStories on an inactive shop → empty");

  // 13) R4-gap fix: markStoryViewed on a NON-EXISTENT storyId must THROW (not silently {ok:true}
  // + an orphan ShopStoryView row) — the create succeeds (no FK constraint on storyId), but the
  // follow-up `shopStory.update` P2025's; that must propagate, not be swallowed by a bare catch.
  let threw = false;
  try {
    await markStoryViewed(999_999_999, viewer.id);
  } catch {
    threw = true;
  }
  ok(threw, "13: markStoryViewed on a non-existent storyId throws (does not silently succeed)");

  await cleanup();
  console.log(process.exitCode ? "\n❌ FAILED" : "\n✅ ALL GREEN");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
