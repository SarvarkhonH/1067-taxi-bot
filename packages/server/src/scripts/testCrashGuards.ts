// 🛡 CRASH-GUARD + REBOOK tiketi ISBOTI — restoran (B), intercity id-guard (C), intercity
// bekor→qayta-band (D). TEST_DATABASE_URL'da yuradi (_testDb app DB'ni RAD ETADI).
// Yugurtirish: npx tsx src/scripts/testCrashGuards.ts
//
// Isbotlanadigan da'volar:
//   0) NAZORAT — prisma HAQIQATAN NaN id'da tashlaydi (guard yuk ko'taruvchi, bezak emas).
//   B) restoran: NaN/0/manfiy id → toza xato-javob, throw YO'Q (2026-07-08 crash'ining
//      review/order yo'llarida qolgan qismi).
//   C) intercity: har mijoz-beradigan id → toza xato-javob, throw YO'Q.
//   D) intercity: bekor qilingandan keyin AYNAN o'sha reysga qayta yozilish ISHLAYDI va
//      haqiqiy o'rin oladi; bekor qilinmagan booking hamon duplikat deb qaytadi;
//      qayta band qilishda chegirma TEKIN berilmaydi (yangi CoinTxn); haydovchi bekor qilganda
//      HAMMA booking atomik yopiladi.
import "./_testDb";

const TAG = "CGTEST_" + Date.now();

let fails = 0;
function ok(cond: boolean, label: string): void {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) fails++;
}

/** guard ishlashining o'lchovi: chaqiruv TASHLAMASLIGI kerak. */
async function noThrow<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    const r = await fn();
    ok(true, `${label} → throw YO'Q, javob: ${JSON.stringify(r)?.slice(0, 90)}`);
    return r;
  } catch (e) {
    ok(false, `${label} → TASHLADI: ${(e as Error).message.split("\n")[0]}`);
    return undefined;
  }
}

const BAD_IDS = [NaN, 0, -5, 1.5];

async function main(): Promise<void> {
  const { prisma } = await import("../db");
  const {
    listRestaurantReviews, deleteMyRestaurantReview, cancelFoodOrder,
    acceptFoodOrder, rejectFoodOrder, advanceFoodOrderStatus,
  } = await import("../services/restoranService");
  const {
    bookSeat, cancelBookingByRider, departTrip, arriveTrip, driverCancelTrip,
    getTripManifest, publishTrip,
  } = await import("../services/intercityService");
  const { __resetFeatureCache, setFeature } = await import("../services/featureFlags");

  const cleanup = async (): Promise<void> => {
    const members = await prisma.member.findMany({ where: { kasId: { startsWith: TAG } }, select: { id: true } });
    const mids = members.map((m) => m.id);
    const trips = await prisma.intercityTrip.findMany({ where: { driverId: { in: mids } }, select: { id: true } });
    await prisma.intercityBooking.deleteMany({ where: { OR: [{ riderId: { in: mids } }, { tripId: { in: trips.map((t) => t.id) } }] } });
    await prisma.intercityCommissionDebt.deleteMany({ where: { driverId: { in: mids } } });
    await prisma.intercityTrip.deleteMany({ where: { id: { in: trips.map((t) => t.id) } } });
    await prisma.intercityDriverEnrollment.deleteMany({ where: { driverId: { in: mids } } });
    await prisma.coinTxn.deleteMany({ where: { memberId: { in: mids } } });
    // Marshrutlar SHAHARLARDAN oldin o'chiriladi: `IntercityRoute.originCityId` shaharga
    // ishora qiladi, shuning uchun avval shaharni o'chirish FK'ni buzardi (P2003) — barcha
    // tekshiruvlar yashil o'tsa ham skript teardown'da qulab, "test yiqildi" deb ko'rinardi
    // va TAG'li satrlar bazada qolib ketardi.
    const cityIds = (await prisma.intercityCity.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } })).map((c) => c.id);
    if (cityIds.length) {
      await prisma.intercityRoute.deleteMany({ where: { OR: [{ originCityId: { in: cityIds } }, { destCityId: { in: cityIds } }] } });
    }
    await prisma.intercityCity.deleteMany({ where: { name: { startsWith: TAG } } });
    await prisma.member.deleteMany({ where: { id: { in: mids } } });
    await prisma.appState.deleteMany({ where: { key: { contains: TAG } } });
  };

  const flagBefore = await prisma.appState.findUnique({ where: { key: "feature:intercity" } });

  try {
    // ── 0) NAZORAT: prisma haqiqatan NaN'da tashlaydimi? ────────────────────────
    let threw = false;
    try { await prisma.restaurant.findUnique({ where: { id: NaN } }); } catch { threw = true; }
    ok(threw, "0: NAZORAT — prisma.findUnique({id: NaN}) HAQIQATAN tashlaydi (guard yuk ko'taruvchi)");

    // ── B) restoran guard'lari ─────────────────────────────────────────────────
    const m = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-R`, fullName: "CG Mijoz", phone: "+998900000001", coins: 0 } });
    for (const bad of BAD_IDS) {
      const r = await noThrow(`B: listRestaurantReviews(id=${bad})`, () => listRestaurantReviews(bad, m.id, true));
      ok(r?.reviewCount === 0 && r?.reviews.length === 0, `B: listRestaurantReviews(id=${bad}) bo'sh natija qaytardi`);
      const d = await noThrow(`B: deleteMyRestaurantReview(id=${bad})`, () => deleteMyRestaurantReview(m.id, bad));
      ok(d?.ok === false, `B: deleteMyRestaurantReview(id=${bad}) → ok:false`);
      const c = await noThrow(`B: cancelFoodOrder(id=${bad})`, () => cancelFoodOrder(m.id, bad));
      ok(c?.ok === false, `B: cancelFoodOrder(id=${bad}) → ok:false`);
      const a = await noThrow(`B: acceptFoodOrder(id=${bad})`, () => acceptFoodOrder(bad));
      ok(a?.ok === false && a?.reason === "not_found", `B: acceptFoodOrder(id=${bad}) → not_found`);
      const rj = await noThrow(`B: rejectFoodOrder(id=${bad})`, () => rejectFoodOrder(bad, "sabab"));
      ok(rj?.ok === false && rj?.reason === "not_found", `B: rejectFoodOrder(id=${bad}) → not_found`);
      const adv = await noThrow(`B: advanceFoodOrderStatus(id=${bad})`, () => advanceFoodOrderStatus(bad));
      ok(adv?.ok === false && adv?.reason === "not_found", `B: advanceFoodOrderStatus(id=${bad}) → not_found`);
    }

    // ── C) intercity guard'lari (flag ON bo'lishi kerak) ───────────────────────
    await setFeature("intercity", true);
    __resetFeatureCache();

    for (const bad of BAD_IDS) {
      const b = await noThrow(`C: bookSeat(tripId=${bad})`, () => bookSeat(m.id, { tripId: bad, seatCount: 1 }));
      ok(b?.ok === false && b?.error === "trip_not_found", `C: bookSeat(tripId=${bad}) → trip_not_found`);
      const cb = await noThrow(`C: cancelBookingByRider(${bad})`, () => cancelBookingByRider(m.id, bad));
      ok(cb?.ok === false && cb?.error === "not_found", `C: cancelBookingByRider(${bad}) → not_found`);
      const dp = await noThrow(`C: departTrip(${bad})`, () => departTrip(m.id, bad));
      ok(dp?.ok === false, `C: departTrip(${bad}) → ok:false`);
      const ar = await noThrow(`C: arriveTrip(${bad})`, () => arriveTrip(m.id, bad));
      ok(ar?.ok === false, `C: arriveTrip(${bad}) → ok:false`);
      const dc = await noThrow(`C: driverCancelTrip(${bad})`, () => driverCancelTrip(m.id, bad));
      ok(dc?.ok === false, `C: driverCancelTrip(${bad}) → ok:false`);
      const mf = await noThrow(`C: getTripManifest(${bad})`, () => getTripManifest(m.id, bad));
      ok(mf === null, `C: getTripManifest(${bad}) → null`);
    }

    // ── D) bekor → qayta band qilish ───────────────────────────────────────────
    const driver = await prisma.member.create({ data: { type: "driver", kasId: `${TAG}-D`, fullName: "CG Haydovchi", phone: "+998900000002", coins: 0 } });
    const rider = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-P`, fullName: "CG Yo'lovchi", phone: "+998900000003", coins: 100_000 } });
    const cityA = await prisma.intercityCity.create({ data: { name: `${TAG}_A`, regionCode: "XX" } });
    const cityB = await prisma.intercityCity.create({ data: { name: `${TAG}_B`, regionCode: "YY" } });

    const pub = await publishTrip(driver.id, {
      originCityId: cityA.id, destCityId: cityB.id,
      scheduledAt: new Date(Date.now() + 48 * 3600_000), // 48s → to'liq bekor-oynasi
      carCapacity: 4, fareSom: 100_000,
    });
    ok(pub.ok, `D-sanity: reys nashr qilindi (${JSON.stringify(pub)})`);
    const tripId = pub.tripId!;

    const seats = async (): Promise<number> =>
      (await prisma.intercityTrip.findUnique({ where: { id: tripId }, select: { bookedSeats: true } }))!.bookedSeats;

    // D1: birinchi band
    const b1 = await bookSeat(rider.id, { tripId, seatCount: 1, tangaDiscount: 4000 });
    ok(b1.ok && !b1.duplicate, `D1: birinchi band o'tdi (${JSON.stringify(b1)})`);
    ok((await seats()) === 1, `D1: o'rin haqiqatan band qilindi (bookedSeats=${await seats()})`);
    const spend1 = await prisma.coinTxn.count({ where: { memberId: rider.id, reason: "intercity_discount" } });
    ok(spend1 === 1, `D1: chegirma uchun 1 ta CoinTxn yozildi (${spend1})`);

    // D2: bekor qilinmagan holatda qayta bosish → HAQIQIY duplikat (o'rin ko'paymaydi)
    const b2 = await bookSeat(rider.id, { tripId, seatCount: 1 });
    ok(b2.ok && b2.duplicate === true && b2.bookingId === b1.bookingId, `D2: ochiq booking → duplikat, o'sha id (${JSON.stringify(b2)})`);
    ok((await seats()) === 1, `D2: duplikat o'rin QO'SHMADI (bookedSeats=${await seats()})`);

    // D3: bekor qilish → o'rin bo'shaydi
    const c1 = await cancelBookingByRider(rider.id, b1.bookingId!);
    ok(c1.ok, `D3: bekor qilindi (${JSON.stringify(c1)})`);
    ok((await seats()) === 0, `D3: o'rin bo'shadi (bookedSeats=${await seats()})`);

    // D4: ★ TUZATISH — o'sha reysga QAYTA yozilish (ilgari "duplicate:true" deb yolg'on aytardi)
    const b3 = await bookSeat(rider.id, { tripId, seatCount: 1, tangaDiscount: 4000 });
    ok(b3.ok && b3.duplicate !== true, `D4: bekordan keyin QAYTA band o'tdi, duplikat EMAS (${JSON.stringify(b3)})`);
    ok(b3.bookingId !== b1.bookingId, `D4: YANGI booking yaratildi (${b1.bookingId} → ${b3.bookingId})`);
    ok((await seats()) === 1, `D4: o'rin HAQIQATAN band qilindi (bookedSeats=${await seats()})`);
    const newRow = await prisma.intercityBooking.findUnique({ where: { id: b3.bookingId! }, select: { status: true, idempotencyKey: true } });
    ok(newRow?.status === "CONFIRMED", `D4: yangi booking CONFIRMED (${newRow?.status})`);
    ok(newRow?.idempotencyKey === `ibooking:${rider.id}:${tripId}:2`, `D4: urinish-raqamli kalit (${newRow?.idempotencyKey})`);

    // D5: chegirma TEKIN emas — qayta band qilishda YANGI spend yozilgan
    const spend2 = await prisma.coinTxn.count({ where: { memberId: rider.id, reason: "intercity_discount" } });
    ok(spend2 === 2, `D5: qayta bandda chegirma qayta to'landi, tekin emas (CoinTxn: ${spend1} → ${spend2})`);

    // D6: haydovchi bekor qilsa HAMMA booking atomik yopiladi
    const dcRes = await driverCancelTrip(driver.id, tripId);
    ok(dcRes.ok, `D6: driverCancelTrip o'tdi (${JSON.stringify({ ok: dcRes.ok, tgs: dcRes.riderTgs?.length })})`);
    const leftover = await prisma.intercityBooking.count({ where: { tripId, status: { in: ["CONFIRMED", "PREPAY_PENDING"] } } });
    ok(leftover === 0, `D6: ochiq qolgan booking YO'Q (${leftover})`);
    const closed = await prisma.intercityBooking.findUnique({ where: { id: b3.bookingId! }, select: { status: true } });
    ok(closed?.status === "CANCELLED_BY_DRIVER", `D6: booking CANCELLED_BY_DRIVER (${closed?.status})`);
  } finally {
    await cleanup();
    if (flagBefore) {
      await prisma.appState.upsert({ where: { key: "feature:intercity" }, create: { key: "feature:intercity", value: flagBefore.value }, update: { value: flagBefore.value } });
    } else {
      await prisma.appState.deleteMany({ where: { key: "feature:intercity" } });
    }
    __resetFeatureCache();
    await prisma.$disconnect();
  }

  console.log(fails === 0 ? "\n🟢 crash-guards: hammasi o'tdi" : `\n🔴 ${fails} ta yiqildi`);
  process.exit(fails === 0 ? 0 : 1);
}

void main();
