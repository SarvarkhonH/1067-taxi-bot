// 🔎 XIZMATLAR directory tests. Runs ONLY on TEST_DATABASE_URL (_testDb refuses the app DB) —
// the suite flips the GLOBAL feature:xizmatlar flag and creates ServiceCategory/Listing/Review rows.
// NO money assertions needed: the directory has zero coin paths by design.
import "./_testDb";
process.env.KAS_MODE = "mock";

const TAG = "SVCTEST";

function ok(cond: boolean, label: string): void {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) process.exitCode = 1;
}

async function main(): Promise<void> {
  const { prisma } = await import("../db");
  const svc = await import("../services/serviceDirectory");
  const { setFeature, __resetFeatureCache, featureOn } = await import("../services/featureFlags");

  const cleanup = async (): Promise<void> => {
    const cats = await prisma.serviceCategory.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } });
    const catIds = cats.map((c) => c.id);
    const listings = await prisma.serviceListing.findMany({ where: { categoryId: { in: catIds } }, select: { id: true } });
    const lids = listings.map((l) => l.id);
    await prisma.serviceReview.deleteMany({ where: { listingId: { in: lids } } });
    await prisma.servicePhoto.deleteMany({ where: { listingId: { in: lids } } });
    await prisma.servicePriceItem.deleteMany({ where: { listingId: { in: lids } } });
    await prisma.serviceFavorite.deleteMany({ where: { listingId: { in: lids } } });
    await prisma.serviceListing.deleteMany({ where: { id: { in: lids } } });
    await prisma.serviceCategory.deleteMany({ where: { id: { in: catIds } } });
    await prisma.appState.deleteMany({ where: { key: "feature:xizmatlar" } });
    await prisma.appState.deleteMany({ where: { key: { startsWith: "svcrep:" } } });
    await prisma.appState.deleteMany({ where: { key: { startsWith: "svcphone:" } } });
    await prisma.serviceRequest.deleteMany({ where: { query: { startsWith: TAG } } });
  };
  await cleanup();

  // 1) flag default OFF → everything dark for riders (owner-preview bypasses at route layer only)
  __resetFeatureCache();
  ok((await featureOn("xizmatlar")) === false, "1: xizmatlar is DEFAULT_OFF");
  ok((await svc.listCategories()).length === 0, "1: categories empty while dark");
  const offSubmit = await svc.submitListing("111", "Test", { categoryId: 1, name: "Dark shop", phone: "+998901112233" });
  ok(offSubmit.ok === false && offSubmit.reason === "off", "1: submit blocked while dark");
  ok((await svc.listCategories(true)).length >= 0, "1: preview=true bypasses the flag (owner QABUL path)");
  await setFeature("xizmatlar", true);
  __resetFeatureCache();

  // 2) phone normalization
  ok(svc.normalizeUzPhone("+998 90 123 45 67") === "+998901234567", "2: spaced phone normalized");
  ok(svc.normalizeUzPhone("901234567") === "+998901234567", "2: bare 9-digit normalized");
  ok(svc.normalizeUzPhone("12345") === null, "2: short phone rejected");
  ok(svc.normalizeUzPhone("+7 900 000 00 00") === null, "2: non-UZ phone rejected");

  // 3) category + admin-seeded listing → straight active + searchable
  const cat = await prisma.serviceCategory.create({ data: { name: `${TAG} Qurilish`, emoji: "🧱", sortOrder: 99 } });
  const mk = (name: string, phone: string, extra: Record<string, unknown> = {}) =>
    svc.adminCreateListing({ categoryId: cat.id, name, phone, tags: "sement, gisht", ...extra });
  const l1 = await mk(`${TAG} Sement Bozori`, "+998901000001");
  ok(l1.ok && !!l1.id, "3: adminCreateListing ok (straight active)");
  const badPhone = await mk(`${TAG} Bad`, "12");
  ok(badPhone.ok === false && badPhone.error === "bad_phone", "3: bad phone rejected");
  const cats2 = await svc.listCategories();
  ok(cats2.some((c) => c.id === cat.id && c.count === 1), "3: category shows live count=1");
  const byName = await svc.listListings({ q: "sement bozori" });
  ok(byName.listings.some((l) => l.id === l1.id), "3: search by name hits");
  const byTag = await svc.listListings({ q: "gisht" });
  ok(byTag.listings.some((l) => l.id === l1.id), "3: search by tag hits");
  const byPhone = await svc.listListings({ q: "+998901000001" });
  ok(byPhone.listings.some((l) => l.id === l1.id), "3: search by phone hits");

  // 4) self-submit flow: pending → invisible → approve → visible; reject path; duplicate; daily cap
  const sub1 = await svc.submitListing("777", "Ali", { categoryId: cat.id, name: `${TAG} Usta Karim`, phone: "+998902000002", desc: "Santexnik" });
  ok(sub1.ok && !!sub1.id && !!sub1.notice, "4: submit ok + owner notice");
  ok(!(await svc.listListings({ q: "usta karim" })).listings.length, "4: pending is INVISIBLE to riders");
  const dup = await svc.submitListing("888", "Vali", { categoryId: cat.id, name: `${TAG} Boshqa`, phone: "902000002" });
  ok(dup.ok === false && dup.reason === "duplicate", "4: duplicate phone rejected (pending counts)");
  const appr = await svc.approveListing(sub1.id!);
  ok(appr.ok && appr.ownerTgId === "777", "4: approve ok, ownerTgId returned for notify");
  ok((await svc.listListings({ q: "usta karim" })).listings.length === 1, "4: approved is visible");
  ok((await svc.approveListing(sub1.id!)).ok === false, "4: double-approve is a no-op");
  const sub2 = await svc.submitListing("777", "Ali", { categoryId: cat.id, name: `${TAG} Ikkinchi`, phone: "+998903000003" });
  ok(sub2.ok, "4: same user 2nd submit ok (cap is 2/day)");
  const sub3 = await svc.submitListing("777", "Ali", { categoryId: cat.id, name: `${TAG} Uchinchi`, phone: "+998904000004" });
  ok(sub3.ok === false && sub3.reason === "daily_limit", "4: 3rd same-day submit blocked");
  const rej = await svc.rejectListing(sub2.id!);
  ok(rej.ok, "4: reject ok");
  ok(!(await svc.listListings({ q: "ikkinchi" })).listings.length, "4: rejected stays invisible");

  // 5) reviews: 3 users → aggregates; upsert (1 user = 1 review); privacy of hidden
  const rid = l1.id!;
  ok((await svc.upsertReview("1001", "Dilshod A.", rid, 5, "Zo'r")).ok, "5: review u1 ok");
  ok((await svc.upsertReview("1002", "Aziz B.", rid, 4, "")).ok, "5: review u2 ok");
  const r3 = await svc.upsertReview("1003", "Karim C.", rid, 3, "O'rtacha");
  ok(r3.ok && r3.reviewCount === 3 && Math.abs((r3.avgRating ?? 0) - 4) < 0.01, "5: 5+4+3 → avg 4.0, count 3");
  const re = await svc.upsertReview("1003", "Karim C.", rid, 5, "Fikrim o'zgardi");
  ok(re.ok && re.reviewCount === 3 && Math.abs((re.avgRating ?? 0) - 4.7) < 0.05, "5: re-rate UPSERTS (count stays 3, avg → 4.67)");
  const badStars = await svc.upsertReview("1004", "X", rid, 9, "");
  ok(badStars.ok === false && badStars.reason === "bad_stars", "5: stars out of range rejected");
  const revs = await svc.listReviews(rid, "1001");
  ok(revs.length === 3 && revs.some((r) => r.mine), "5: listReviews returns 3, marks mine");

  // 6) bayes rank: 2 fresh 5★ must NOT outrank an established 4.8 (20 reviews)
  const est = await mk(`${TAG} Eski Ustaxona`, "+998905000005");
  const fresh = await mk(`${TAG} Yangi Raqib`, "+998906000006");
  for (let i = 0; i < 20; i++) await svc.upsertReview(String(2000 + i), `E${i}`, est.id!, i < 16 ? 5 : 4, ""); // avg 4.8
  await svc.upsertReview("3001", "F1", fresh.id!, 5, "");
  await svc.upsertReview("3002", "F2", fresh.id!, 5, "");
  const ranked = await svc.listListings({ categoryId: cat.id, limit: 50 });
  const posEst = ranked.listings.findIndex((l) => l.id === est.id);
  const posFresh = ranked.listings.findIndex((l) => l.id === fresh.id);
  ok(posEst >= 0 && posFresh >= 0 && posEst < posFresh, "6: bayes — 20×4.8 outranks 2×5.0");
  await svc.adminEditListing(fresh.id!, { isVip: true });
  const ranked2 = await svc.listListings({ categoryId: cat.id, limit: 50 });
  ok(ranked2.listings.findIndex((l) => l.id === fresh.id) === 0, "6: VIP jumps to slot #1 (sotuv joyi)");

  // 7) report → 3 distinct users auto-hide + aggregates recomputed; same-user re-report ignored
  const target = await prisma.serviceReview.findFirst({ where: { listingId: rid, authorName: "Aziz B." } });
  ok(!!target, "7: target review found");
  await svc.reportReview(target!.id, "9001");
  await svc.reportReview(target!.id, "9001"); // duplicate — must not count
  await svc.reportReview(target!.id, "9002");
  ok((await prisma.serviceReview.findUnique({ where: { id: target!.id } }))!.status === "visible", "7: 2 unique reports → still visible");
  const hid = await svc.reportReview(target!.id, "9003");
  ok(hid.hidden === true, "7: 3rd unique report → auto-hidden");
  const after = await prisma.serviceListing.findUnique({ where: { id: rid } });
  ok(after!.reviewCount === 2, "7: aggregates recomputed after hide (3→2 visible)");
  const q = await svc.adminReviewQueue();
  ok(q.some((r) => r.id === target!.id), "7: hidden review lands in the admin queue");
  await svc.adminModerateReview(target!.id, "restore");
  ok((await prisma.serviceListing.findUnique({ where: { id: rid } }))!.reviewCount === 3, "7: restore re-counts (2→3)");

  // 8) counters
  const before = (await prisma.serviceListing.findUnique({ where: { id: rid } }))!;
  await svc.trackCall(rid);
  await svc.trackCall(rid);
  const det = await svc.getListing(rid, null);
  ok(!!det && det.phone === "+998901000001", "8: detail exposes phone");
  // view increment is fire-and-forget by design — poll up to 3s (test DB is cross-region Singapore)
  let afterC = (await prisma.serviceListing.findUnique({ where: { id: rid } }))!;
  for (let i = 0; i < 10 && afterC.viewCount !== before.viewCount + 1; i++) {
    await new Promise((r) => setTimeout(r, 300));
    afterC = (await prisma.serviceListing.findUnique({ where: { id: rid } }))!;
  }
  ok(afterC.callCount === before.callCount + 2, "8: callCount +2");
  ok(afterC.viewCount === before.viewCount + 1, "8: viewCount +1 (detail open)");

  // 10) sort=new — "Yangi qo'shilganlar" strip returns latest id first
  const newest = await mk(`${TAG} Eng Oxirgi`, "+998907000007");
  const freshList = await svc.listListings({ categoryId: cat.id, sort: "new", limit: 5 });
  ok(freshList.listings[0]?.id === newest.id, "10: sort=new — eng oxirgi qo'shilgan birinchi");

  // 11) demand capture: 3/day cap per user, short query rejected
  const d1 = await svc.submitRequest("5001", "Ali", `${TAG} traktor ijara`, "tungi ishlasin");
  ok(d1.ok && !!d1.notice && d1.notice.query.includes("traktor"), "11: so'rov yozildi + owner notice");
  ok((await svc.submitRequest("5001", "Ali", "x", "")).reason === "bad_query", "11: 1-harfli so'rov rad");
  await svc.submitRequest("5001", "Ali", `${TAG} q2`, "");
  await svc.submitRequest("5001", "Ali", `${TAG} q3`, "");
  const d4 = await svc.submitRequest("5001", "Ali", `${TAG} q4`, "");
  ok(d4.ok === false && d4.reason === "daily_limit", "11: 4-chi kunlik so'rov blok");
  ok((await svc.adminListRequests("new")).some((r) => r.query === `${TAG} traktor ijara`), "11: admin ro'yxatida ko'rinadi");
  await svc.adminSetRequestStatus(d1.notice!.requestId, "done");
  ok(!(await svc.adminListRequests("new")).some((r) => r.id === d1.notice!.requestId), "11: done → new ro'yxatidan chiqdi");

  // 12) phone-report: 1 user = 1 flag; 2 unikal → flagged; telefon tahriri → reset
  const pr1 = await svc.reportPhoneIssue(rid, "6001");
  ok(pr1.ok && !pr1.flagged, "12: 1-flag — hali flagged emas");
  await svc.reportPhoneIssue(rid, "6001"); // duplicate — sanalmaydi
  ok((await prisma.serviceListing.findUnique({ where: { id: rid } }))!.phoneReports === 1, "12: duplicate flag sanalmadi");
  const pr2 = await svc.reportPhoneIssue(rid, "6002");
  ok(pr2.flagged === true, "12: 2-unikal flag → admin navbati (flagged)");
  await svc.adminEditListing(rid, { phone: "+998901000011" });
  ok((await prisma.serviceListing.findUnique({ where: { id: rid } }))!.phoneReports === 0, "12: telefon tuzatildi → hisoblagich 0");

  // 13) 💰 preyskurant: set → kartada priceFrom (min), qidiruv narx-satr bo'yicha, replace-all
  const priced = await mk(`${TAG} Salon Guzal`, "+998908000008");
  await svc.adminSetPrices(priced.id!, [
    { label: "Soch olish", priceSom: 25000 },
    { label: "Soqol", priceSom: 15000 },
    { label: "bo'sh", priceSom: 0 }, // yaroqsiz — tushib qolishi kerak
  ]);
  const pricedCard = (await svc.listListings({ categoryId: cat.id, limit: 50 })).listings.find((l) => l.id === priced.id);
  ok(pricedCard?.priceFrom === 15000, "13: kartada priceFrom = min (15000)");
  const pricedDetail = await svc.getListing(priced.id!, null);
  ok(pricedDetail?.prices.length === 2 && pricedDetail.prices[0]!.label === "Soch olish", "13: detail'da 2 narx, tartib saqlangan");
  ok((await svc.listListings({ q: "soqol" })).listings.some((l) => l.id === priced.id), "13: narx-satr bo'yicha qidiruv topadi");
  await svc.adminSetPrices(priced.id!, [{ label: "Yangi xizmat", priceSom: 50000 }]);
  ok((await svc.getListing(priced.id!, null))?.prices.length === 1, "13: replace-all (2→1)");

  // 14) 🔖 saqlash + 🗺 geo
  await svc.toggleFavorite("7001", priced.id!, true);
  await svc.toggleFavorite("7001", priced.id!, true); // idempotent upsert
  ok((await svc.listFavorites("7001")).some((l) => l.id === priced.id), "14: fav ro'yxatda");
  ok((await svc.getListing(priced.id!, "7001"))?.isFav === true, "14: detail isFav=true");
  await svc.toggleFavorite("7001", priced.id!, false);
  ok((await svc.listFavorites("7001")).length === 0, "14: fav o'chirildi");
  await svc.adminEditListing(priced.id!, { geoLat: 39.0374, geoLng: 65.585 });
  const g = await svc.getListing(priced.id!, null);
  ok(Math.abs((g?.geoLat ?? 0) - 39.0374) < 1e-6, "14: geo saqlandi (Borish tugmasi manbai)");
  await svc.adminEditListing(priced.id!, { geoLat: 999, geoLng: 65 }); // yaroqsiz → null
  ok((await svc.getListing(priced.id!, null))?.geoLat == null, "14: yaroqsiz koordinata null'ga tushdi");

  // 15) 🔗 ijtimoiy tarmoq — round-trip
  await svc.adminEditListing(priced.id!, { instagram: "https://instagram.com/salon_guzal", telegramUrl: "https://t.me/salonguzal", website: "https://guzal.uz" });
  const soc = await svc.getListing(priced.id!, null);
  ok(soc?.instagram === "https://instagram.com/salon_guzal" && soc?.telegramUrl === "https://t.me/salonguzal" && soc?.website === "https://guzal.uz", "15: ijtimoiy tarmoq saqlandi");
  ok(soc?.facebook == null, "15: berilmagan maydon null qoladi");
  await svc.adminEditListing(priced.id!, { instagram: "" });
  ok((await svc.getListing(priced.id!, null))?.instagram == null, "15: bo'sh satr → null (tozalash)");

  // 16) 🏅 «1067 tekshiruvi» — 100-ballik 5-mezon, mijoz bahosidan MUSTAQIL rasmiy audit
  const before15 = await svc.getListing(priced.id!, null);
  ok(before15?.inspBreakdown == null, "16: default holatda tekshirilmagan");
  // qisman to'ldirish — hali "tekshirilgan" hisoblanmaydi (inspAt yo'q)
  const partial = await svc.adminEditListing(priced.id!, { inspClean: 18, inspProf: 17 });
  ok(partial.ok, "16: qisman ball saqlandi");
  ok((await svc.getListing(priced.id!, null))?.inspBreakdown == null, "16: qisman to'ldirilganda hali tekshirilgan hisoblanmaydi");
  // qolganini to'ldirish — endi to'liq, inspAt qo'yiladi, tier=gold (90/100)
  const setInsp = await svc.adminEditListing(priced.id!, { inspPrice: 19, inspTrust: 18, inspQuality: 18, inspNote: "Toza, professional, narxlar mos" });
  ok(setInsp.ok, "16: to'liq 5-mezon audit saqlandi");
  const insp = await svc.getListing(priced.id!, null);
  ok(insp?.inspBreakdown?.clean === 18 && insp?.inspNote === "Toza, professional, narxlar mos" && !!insp?.inspAt, "16: detail'da breakdown+note+sana bor");
  ok(insp!.inspTotal === 90 && insp!.inspTier === "gold", "16: 18+17+19+18+18=90 → gold tier");
  ok(insp!.avgRating === 0 && insp!.reviewCount === 0, "16: mijoz avgRating/reviewCount BUTUNLAY tegilmagan (mustaqil signal)");
  const badLow = await svc.adminEditListing(priced.id!, { inspClean: -1 });
  ok(badLow.ok === false && badLow.error === "bad_inspClean", "16: manfiy ball rad etiladi");
  const badHigh = await svc.adminEditListing(priced.id!, { inspClean: 21 });
  ok(badHigh.ok === false && badHigh.error === "bad_inspClean", "16: 20dan yuqori ball rad etiladi");
  ok((await svc.getListing(priced.id!, null))?.inspBreakdown?.clean === 18, "16: rad etilgan urinishdan keyin ham eski qiymat saqlanadi");
  // pastroq ball — bronze chegarasi (60-74) va 60dan past = belgi umuman chiqmasligi
  await svc.adminEditListing(priced.id!, { inspClean: 10, inspProf: 10, inspPrice: 10, inspTrust: 10, inspQuality: 10 });
  const low = await svc.getListing(priced.id!, null);
  ok(low!.inspTotal === 50 && low!.inspTier == null, "16: 50/100 — 60dan past, tier=null (belgi chiqmaydi)");
  await svc.adminEditListing(priced.id!, { inspClean: null, inspProf: null, inspPrice: null, inspTrust: null, inspQuality: null });
  const cleared = await svc.getListing(priced.id!, null);
  ok(cleared?.inspBreakdown == null && cleared?.inspAt == null, "16: hammasi null → tekshiruv butunlay bekor qilindi (sana ham tozalandi)");
  // karta darajasida ham ko'rinishi kerak (badge uchun)
  await svc.adminEditListing(priced.id!, { inspClean: 16, inspProf: 16, inspPrice: 16, inspTrust: 16, inspQuality: 16 });
  const cardWithInsp = (await svc.listListings({ categoryId: cat.id, limit: 50 })).listings.find((l) => l.id === priced.id);
  ok(cardWithInsp?.inspTotal === 80 && cardWithInsp?.inspTier === "silver", "16: kartada ham inspTotal/tier ko'rinadi (badge manbai)");

  // 17) 🏪 claim flow — Telegram contact-share'ning identity-isboti bilan
  const claimable = await mk(`${TAG} Claimable Ustaxona`, "+998909000009");
  const detailBefore = await svc.getListing(claimable.id!, null);
  ok(detailBefore?.claimable === true && detailBefore?.isMine === false, "17: default — claimable=true, isMine=false");
  const wrongPhone = await svc.claimListing(claimable.id!, "8001", "+998900000000");
  ok(wrongPhone.ok === false && wrongPhone.reason === "phone_mismatch", "17: mos kelmagan telefon rad etiladi");
  ok((await svc.getListing(claimable.id!, "8001"))?.claimable === true, "17: muvaffaqiyatsiz urinishdan keyin ham claimable qoladi");
  const rightPhone = await svc.claimListing(claimable.id!, "8001", "+998909000009");
  ok(rightPhone.ok === true, "17: mos telefon bilan claim muvaffaqiyatli");
  const afterClaim = await svc.getListing(claimable.id!, "8001");
  ok(afterClaim?.claimable === false && afterClaim?.isMine === true, "17: claim'dan keyin claimable=false, isMine=true (da'vogar uchun)");
  ok((await svc.getListing(claimable.id!, "9999"))?.isMine === false, "17: boshqa foydalanuvchi uchun isMine=false");
  const doubleClaim = await svc.claimListing(claimable.id!, "9999", "+998909000009");
  ok(doubleClaim.ok === false && doubleClaim.reason === "already_claimed", "17: ikkinchi marta claim qilib bo'lmaydi");

  // 18) 🔍 mashhur qidiruv teglari — mavjud tags'lardan hisoblanadi
  const tagCat = await prisma.serviceCategory.create({ data: { name: `${TAG} TagCat`, emoji: "🏷", sortOrder: 98 } });
  await mk(`${TAG} Tag Biz 1`, "+998910000001", { categoryId: tagCat.id, tags: "santexnik, kran" });
  await mk(`${TAG} Tag Biz 2`, "+998910000002", { categoryId: tagCat.id, tags: "santexnik, isitish" });
  await mk(`${TAG} Tag Biz 3`, "+998910000003", { categoryId: tagCat.id, tags: "santexnik" });
  const tags = await svc.popularSearchTags(true, 5);
  ok(tags.includes("santexnik"), "18: eng ko'p takrorlangan teg ro'yxatda");
  const tagsAgain = await svc.popularSearchTags(true, 5);
  ok(JSON.stringify(tags) === JSON.stringify(tagsAgain), "18: 60s kesh — qayta chaqirilganda bir xil natija");

  // 9) seed idempotency
  const c1 = await svc.seedDefaultCategories();
  const c2 = await svc.seedDefaultCategories();
  ok(c2 === 0, `9: seedDefaultCategories idempotent (first=${c1}, second=0)`);
  await prisma.serviceCategory.deleteMany({ where: { name: { in: svc.DEFAULT_CATEGORIES.map((c) => c.name) } } });

  await cleanup();
  console.log(process.exitCode === 1 ? "\n❌ XIZMATLAR SUITE FAILED" : "\n🎉 XIZMATLAR SUITE PASSED");
  // getListing()'s fire-and-forget viewCount increment can still be in-flight after the last call
  // (several sections call it back-to-back) — give it a moment to settle before tearing down the
  // connection, so a stray write-after-disconnect never crashes the script (test-only hygiene;
  // production never disconnects, so this has no real-world equivalent).
  await new Promise((r) => setTimeout(r, 500));
  await prisma.$disconnect();
}

void main();
