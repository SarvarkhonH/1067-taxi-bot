// 🏠 V1.5 (Mahalla bozori) tests. Pure read/write on Mahalla/MarketShop/Member — NO booking/sweep
// interaction, but runs on TEST_DATABASE_URL anyway (repo convention: never mutate anything
// bazar-visible on the live app DB, even briefly). TAG'li throwaway rows + full cleanup.
import "./_testDb";

const TAG = "MAHTEST";

function ok(cond: boolean, label: string): void {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) process.exitCode = 1;
}

async function main(): Promise<void> {
  const { prisma } = await import("../db");
  const mahallaSvc = await import("../services/mahallaService");
  const shopSvc = await import("../services/shopService");

  const cleanup = async (): Promise<void> => {
    const shops = await prisma.marketShop.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } });
    const shopIds = shops.map((s) => s.id);
    await prisma.product.deleteMany({ where: { shopId: { in: shopIds } } });
    await prisma.marketShop.deleteMany({ where: { id: { in: shopIds } } });
    await prisma.member.deleteMany({ where: { kasId: { startsWith: TAG } } });
    await prisma.mahalla.deleteMany({ where: { name: { startsWith: TAG } } });
  };
  await cleanup();
  mahallaSvc.__resetMahallaCache();

  // ── fixtures: 3 synthetic mahalla, distinct far-apart coords (Koson-ish lat/lng scale) ──
  const mA = await prisma.mahalla.create({ data: { name: `${TAG} A`, lat: 39.030, lng: 65.560, sortOrder: 1 } });
  const mB = await prisma.mahalla.create({ data: { name: `${TAG} B`, lat: 39.060, lng: 65.610, sortOrder: 2 } });
  const mC = await prisma.mahalla.create({ data: { name: `${TAG} C`, lat: 39.090, lng: 65.500, sortOrder: 3 } });
  mahallaSvc.__resetMahallaCache();

  // 1) listMahallas — active ro'yxatda barchasi bor
  const list = await mahallaSvc.listMahallas();
  const listedNames = new Set(list.map((m) => m.name));
  ok(listedNames.has(mA.name) && listedNames.has(mB.name) && listedNames.has(mC.name), "1: listMahallas uchtasini ham qaytaradi");

  // 2) nearestMahalla — aniq koordinata bo'yicha eng yaqinini topadi
  const nearA = await mahallaSvc.nearestMahalla(39.030, 65.560);
  ok(nearA?.id === mA.id, `2: (39.030,65.560) → ${mA.name} (oldi: ${nearA?.name})`);
  const nearB = await mahallaSvc.nearestMahalla(39.061, 65.611);
  ok(nearB?.id === mB.id, `2: (39.061,65.611) → ${mB.name} (oldi: ${nearB?.name})`);
  const nearC = await mahallaSvc.nearestMahalla(39.089, 65.501);
  ok(nearC?.id === mC.id, `2: (39.089,65.501) → ${mC.name} (oldi: ${nearC?.name})`);

  // 3) setMemberMahalla — home tanlansa travel tozalanadi, travel tanlansa home saqlanib qoladi
  const member = await prisma.member.create({ data: { type: "client", kasId: `${TAG}_1`, fullName: "Test Mahalla Member", points: 0 } });
  const rHome = await mahallaSvc.setMemberMahalla(member.id, mA.id, "home");
  ok(rHome.ok, "3: setMemberMahalla home ok");
  let mRow = await prisma.member.findUnique({ where: { id: member.id } });
  ok(mRow?.mahallaId === mA.id && mRow?.travelMahallaId === null, "3: home tanlangach mahallaId=A, travelMahallaId=null");
  const rTravel = await mahallaSvc.setMemberMahalla(member.id, mB.id, "travel");
  ok(rTravel.ok, "3: setMemberMahalla travel ok");
  mRow = await prisma.member.findUnique({ where: { id: member.id } });
  ok(mRow?.mahallaId === mA.id && mRow?.travelMahallaId === mB.id && mRow?.travelMahallaSetAt !== null, "3: safar-rejimida uy(A) saqlanib, travel=B qo'shiladi");
  const rBackHome = await mahallaSvc.setMemberMahalla(member.id, mC.id, "home");
  ok(rBackHome.ok, "3: yangi uy tanlansa");
  mRow = await prisma.member.findUnique({ where: { id: member.id } });
  ok(mRow?.mahallaId === mC.id && mRow?.travelMahallaId === null, "3: yangi uy(C) tanlansa eski travel(B) tozalanadi");
  const rBad = await mahallaSvc.setMemberMahalla(member.id, 999999, "home");
  ok(rBad.ok === false, "3: mavjud bo'lmagan mahallaId rad etiladi");

  // 4) MarketShop scoping — mahalla-tur va bozor-tur do'konlar getMarketHome javobida to'g'ri belgilanadi
  const mahallaShop = await prisma.marketShop.create({
    data: { name: `${TAG} Mahalla Do'kon`, phone: "+998900000001", category: "oziq-ovqat", ownerChatId: `${TAG}_owner1`, active: true, shopKind: "mahalla", mahallaId: mA.id },
  });
  const cityShop = await prisma.marketShop.create({
    data: { name: `${TAG} Shahar Do'kon`, phone: "+998900000002", category: "umumiy", ownerChatId: `${TAG}_owner2`, active: true, shopKind: "bozor" },
  });
  const home = await shopSvc.getMarketHome(true);
  const hMahalla = home.shops.find((s) => s.id === mahallaShop.id);
  const hCity = home.shops.find((s) => s.id === cityShop.id);
  ok(hMahalla?.shopKind === "mahalla" && hMahalla?.mahallaId === mA.id, "4: mahalla-tur do'kon shopKind+mahallaId to'g'ri qaytadi");
  ok(hCity?.shopKind === "bozor" && hCity?.mahallaId === null, "4: bozor-tur do'kon shopKind='bozor', mahallaId=null");
  const bucketA = home.shops.filter((s) => s.shopKind === "mahalla" && s.mahallaId === mA.id);
  const bucketOther = home.shops.filter((s) => s.shopKind === "mahalla" && s.mahallaId === mB.id);
  ok(bucketA.some((s) => s.id === mahallaShop.id), "4: A-mahalla filtri mahalla-do'konni topadi");
  ok(!bucketOther.some((s) => s.id === mahallaShop.id), "4: B-mahalla filtri A-do'konni topmaydi (scoping ishlayapti)");

  // 5) getShopProfile — mahallaId bo'lsa Mahalla.name ustun keladi, aks holda eski neighborhood
  const shopWithMahalla = await prisma.marketShop.create({
    data: { name: `${TAG} Profil A`, phone: "+998900000003", ownerChatId: `${TAG}_owner3`, active: true, shopKind: "mahalla", mahallaId: mB.id, neighborhood: "Eski matn" },
  });
  const shopLegacyOnly = await prisma.marketShop.create({
    data: { name: `${TAG} Profil B`, phone: "+998900000004", ownerChatId: `${TAG}_owner4`, active: true, neighborhood: "Faqat eski matn" },
  });
  const profA = await shopSvc.getShopProfile(shopWithMahalla.id, true);
  ok(profA?.neighborhood === mB.name, `5: mahallaId bor do'kon → Mahalla.name (${mB.name}) ko'rsatadi, eski matn EMAS (oldi: ${profA?.neighborhood})`);
  const profB = await shopSvc.getShopProfile(shopLegacyOnly.id, true);
  ok(profB?.neighborhood === "Faqat eski matn", "5: mahallaId yo'q do'kon → eski neighborhood matniga fallback");

  await cleanup();
  console.log(process.exitCode === 1 ? "\n❌ MAHALLA SUITE FAILED" : "\n🎉 MAHALLA SUITE PASSED");
}

main().then(() => process.exit(process.exitCode ?? 0)).catch((e) => { console.error(e); process.exit(1); });
