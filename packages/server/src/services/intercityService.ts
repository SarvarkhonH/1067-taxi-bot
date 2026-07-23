// 🚐 Intercity (nationwide shared-taxi) — core logic. ALL fares are real som and
// live ONLY in the Intercity* tables; they NEVER touch CoinTxn / tanga / the
// 350-per-ride clamp. Tanga is used ONLY as a capped discount (spendCoinsIdempotent).
// Every entry point is gated by featureOn("intercity") — no-op when the flag is OFF.
import { prisma } from "../db";
import { featureOn } from "./featureFlags";
import { spendCoinsIdempotent, grantCoins, getCoins } from "./coinService";

export const TANGA_DISCOUNT_CAP = 5000; // max tanga a rider can shave off one booking
export const DISCOUNT_FARE_FRACTION = 0.05; // ≤5% of fare
export const MIN_FARE_AFTER_DISCOUNT = 1000; // som — never let a fare go below this
export const DRIVER_DEBT_CAP_SOM = 50000; // pending commission ceiling → blocks new trips

const BOOKABLE = ["OPEN", "BOARDING"];

/** Bekor qilingan booking holatlari — bular "band" HISOBLANMAYDI, ya'ni mijoz o'sha reysga
 *  QAYTA yozila oladi (idempotency kaliti urinish-raqami bilan yangilanadi, pastga qarang). */
const CANCELLED_BOOKING_STATUSES = [
  "RIDER_CANCELLED",
  "RIDER_CANCELLED_LATE",
  "CANCELLED_BY_DRIVER",
  "CANCELLED_NO_PAYMENT",
];

// Jonli xato-sinfi (restoran 2026-07-08 bilan bir xil): `Number(req.body?.tripId)` noto'g'ri yoki
// yo'q bo'lsa NaN beradi va `prisma.X.findUnique({where:{id: NaN}})` UNHANDLED tashlaydi.
// Har mijoz-beradigan id shu bilan tekshiriladi → toza xato-javob, crash EMAS.
function validId(id: number): boolean {
  return Number.isInteger(id) && id > 0;
}

export type PaymentMethod = "CASH" | "PREPAY";

// ── small helpers ────────────────────────────────────────────────────────────

/** normalize a city pair so A↔B is always one route row (lower id first). */
function normPair(a: number, b: number): { originCityId: number; destCityId: number } {
  return a <= b ? { originCityId: a, destCityId: b } : { originCityId: b, destCityId: a };
}

/** AppState one-shot marker — true the FIRST time, false on every replay (idempotent). */
async function once(key: string): Promise<boolean> {
  try {
    await prisma.appState.create({ data: { key, value: "1" } });
    return true;
  } catch {
    return false;
  }
}

async function tgOf(memberId: number): Promise<string | null> {
  const t = await prisma.telegramUser.findFirst({ where: { memberId }, select: { id: true } });
  return t?.id ?? null;
}

/** atomic seat RELEASE (compensation when a booking create fails after the claim). */
async function releaseSeats(tripId: number, seats: number): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "IntercityTrip"
    SET "bookedSeats" = GREATEST("bookedSeats" - ${seats}, 0), "updatedAt" = now()
    WHERE id = ${tripId}`;
}

// ── cities & routes ──────────────────────────────────────────────────────────

export async function listCities(q?: string): Promise<{ id: number; name: string; nameRu: string | null; regionCode: string }[]> {
  if (!(await featureOn("intercity"))) return [];
  const where = q && q.trim()
    ? { active: true, OR: [{ name: { contains: q.trim(), mode: "insensitive" as const } }, { nameRu: { contains: q.trim(), mode: "insensitive" as const } }] }
    : { active: true };
  return prisma.intercityCity.findMany({ where, orderBy: { name: "asc" }, take: 60, select: { id: true, name: true, nameRu: true, regionCode: true } });
}

/** find the normalized route for a city pair, creating it (with zero defaults) if missing. */
export async function getOrCreateRoute(cityIdA: number, cityIdB: number): Promise<{ id: number; defaultFareSom: number; commissionSom: number; durationMin: number } | null> {
  if (cityIdA === cityIdB) return null;
  const pair = normPair(cityIdA, cityIdB);
  const existing = await prisma.intercityRoute.findUnique({ where: { originCityId_destCityId: pair } });
  if (existing) return existing;
  try {
    return await prisma.intercityRoute.create({ data: pair });
  } catch {
    // concurrent create raced us → re-read
    return prisma.intercityRoute.findUnique({ where: { originCityId_destCityId: pair } });
  }
}

// ── driver enrollment ────────────────────────────────────────────────────────

/** A5 (audit P1): the Mini App hides driver UI from riders, but the ENDPOINT was open to any
 *  linked member — a rider could enroll/publish phantom trips that real passengers then book
 *  and get stranded by. Server-side role gate, mirroring the /api/driver/* routes. */
async function requireDriverType(memberId: number): Promise<boolean> {
  const m = await prisma.member.findUnique({ where: { id: memberId }, select: { type: true } });
  return m?.type === "driver";
}

export async function enrollDriver(driverId: number, cityIdA: number, cityIdB: number, carCapacity: number): Promise<{ ok: boolean; routeId?: number; error?: string }> {
  if (!(await featureOn("intercity"))) return { ok: false, error: "feature_off" };
  if (!(await requireDriverType(driverId))) return { ok: false, error: "not_driver" };
  const route = await getOrCreateRoute(cityIdA, cityIdB);
  if (!route) return { ok: false, error: "same_city" };
  const cap = Math.min(Math.max(Math.floor(carCapacity) || 4, 1), 8);
  await prisma.intercityDriverEnrollment.upsert({
    where: { driverId_routeId: { driverId, routeId: route.id } },
    update: { carCapacity: cap, active: true },
    create: { driverId, routeId: route.id, carCapacity: cap },
  });
  return { ok: true, routeId: route.id };
}

export async function getDriverEnrollments(driverId: number): Promise<unknown[]> {
  if (!(await featureOn("intercity"))) return [];
  return prisma.intercityDriverEnrollment.findMany({
    where: { driverId, active: true },
    include: { route: { include: { originCity: true, destCity: true } } },
    orderBy: { createdAt: "desc" },
  });
}

/** pending commission a driver owes — blocks new trips once over the cap. */
export async function driverPendingCommission(driverId: number): Promise<number> {
  const r = await prisma.intercityCommissionDebt.aggregate({ where: { driverId, status: "PENDING" }, _sum: { commissionSom: true } });
  return r._sum.commissionSom ?? 0;
}

// ── trip publish / lifecycle ─────────────────────────────────────────────────

export interface PublishTripInput {
  originCityId: number; // directional (this trip's actual start)
  destCityId: number;
  scheduledAt: Date;
  carCapacity?: number;
  fareSom?: number; // override route default
  note?: string;
}

export async function publishTrip(driverId: number, input: PublishTripInput): Promise<{ ok: boolean; tripId?: number; error?: string }> {
  if (!(await featureOn("intercity"))) return { ok: false, error: "feature_off" };
  if (!(await requireDriverType(driverId))) return { ok: false, error: "not_driver" }; // A5: riders can't publish phantom trips
  if (input.originCityId === input.destCityId) return { ok: false, error: "same_city" };
  if (!(input.scheduledAt instanceof Date) || isNaN(input.scheduledAt.getTime())) return { ok: false, error: "bad_time" };

  const debt = await driverPendingCommission(driverId);
  if (debt > DRIVER_DEBT_CAP_SOM) return { ok: false, error: "debt_cap" };

  const route = await getOrCreateRoute(input.originCityId, input.destCityId);
  if (!route) return { ok: false, error: "no_route" };

  const cap = Math.min(Math.max(Math.floor(input.carCapacity ?? 4) || 4, 1), 8);
  const fareSom = Math.max(Math.floor(input.fareSom ?? route.defaultFareSom) || 0, 0);
  const trip = await prisma.intercityTrip.create({
    data: {
      driverId,
      routeId: route.id,
      originCityId: input.originCityId,
      destCityId: input.destCityId,
      scheduledAt: input.scheduledAt,
      carCapacity: cap,
      fareSom,
      commissionSom: route.commissionSom,
      note: input.note?.slice(0, 200) ?? null,
      status: "OPEN",
    },
  });
  return { ok: true, tripId: trip.id };
}

/** OPEN trips matching a direction + day, with seats still free. */
export async function searchTrips(originCityId: number, destCityId: number, day: Date): Promise<unknown[]> {
  if (!(await featureOn("intercity"))) return [];
  const start = new Date(day); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  const trips = await prisma.intercityTrip.findMany({
    where: {
      originCityId,
      destCityId,
      status: { in: BOOKABLE },
      scheduledAt: { gte: start, lt: end },
    },
    include: { driver: { select: { fullName: true, displayName: true, carNumber: true, rating: true, phone: true } }, originCity: true, destCity: true },
    orderBy: { scheduledAt: "asc" },
    take: 50,
  });
  return trips.filter((t) => t.bookedSeats < t.carCapacity);
}

// ── booking ──────────────────────────────────────────────────────────────────

export interface BookInput {
  tripId: number;
  seatCount?: number;
  paymentMethod?: PaymentMethod;
  tangaDiscount?: number;
  boardingCityId?: number;
  alightingCityId?: number;
}

export async function bookSeat(riderId: number, input: BookInput): Promise<{ ok: boolean; bookingId?: number; duplicate?: boolean; error?: string }> {
  if (!(await featureOn("intercity"))) return { ok: false, error: "feature_off" };
  if (!validId(input.tripId)) return { ok: false, error: "trip_not_found" };
  const seatCount = Math.min(Math.max(Math.floor(input.seatCount ?? 1) || 1, 1), 8);

  // Idempotentlik + QAYTA band qilish. Ilgari kalit `ibooking:<rider>:<trip>` edi va bekor
  // qilingan qatorning kaliti bazada QOLAR edi — mijoz bekor qilgandan keyin o'sha reysga qayta
  // yozilolmasdi, ustiga "✅ Band qilindi" javobini olardi (o'rinsiz yo'lga chiqardi). Endi:
  // ochiq (bekor qilinmagan) booking bo'lsa → haqiqiy duplikat; faqat bekor qilinganlar bo'lsa →
  // urinish-raqamli YANGI kalit. Chegirma kaliti ham (`idiscount:${idem}`) shu bilan yangilanadi,
  // ya'ni qayta band qilishda chegirma tekin berilmaydi — har urinish o'z tangasini to'laydi.
  const prior = await prisma.intercityBooking.findMany({
    where: { riderId, tripId: input.tripId },
    select: { id: true, status: true },
  });
  const live = prior.find((b) => !CANCELLED_BOOKING_STATUSES.includes(b.status));
  if (live) return { ok: true, bookingId: live.id, duplicate: true };
  const idem = prior.length === 0
    ? `ibooking:${riderId}:${input.tripId}`
    : `ibooking:${riderId}:${input.tripId}:${prior.length + 1}`;

  const trip = await prisma.intercityTrip.findUnique({ where: { id: input.tripId } });
  if (!trip) return { ok: false, error: "trip_not_found" };
  if (!BOOKABLE.includes(trip.status)) return { ok: false, error: "trip_closed" };
  if (trip.driverId === riderId) return { ok: false, error: "own_trip" };
  if (trip.bookedSeats + seatCount > trip.carCapacity) return { ok: false, error: "no_seats" };

  const fareBase = trip.fareSom * seatCount;
  const method: PaymentMethod = input.paymentMethod === "PREPAY" ? "PREPAY" : "CASH";

  // tanga discount — capped, and never drives the fare below the floor
  let discount = Math.max(Math.floor(input.tangaDiscount ?? 0) || 0, 0);
  if (discount > 0) {
    discount = Math.min(discount, TANGA_DISCOUNT_CAP, Math.floor(fareBase * DISCOUNT_FARE_FRACTION), Math.max(fareBase - MIN_FARE_AFTER_DISCOUNT, 0));
    if (discount > 0) {
      const bal = await getCoins(riderId);
      if (bal < discount) return { ok: false, error: "insufficient_tanga" };
    }
  }
  const agreedFareSom = Math.max(fareBase - discount, 0);

  // 1) atomic seat claim (Postgres row-lock evaluates the ceiling — no overbooking)
  const claimed = await prisma.$executeRaw`
    UPDATE "IntercityTrip"
    SET "bookedSeats" = "bookedSeats" + ${seatCount}, "updatedAt" = now()
    WHERE id = ${input.tripId}
      AND status IN ('OPEN','BOARDING')
      AND "bookedSeats" + ${seatCount} <= "carCapacity"`;
  if (claimed === 0) return { ok: false, error: "no_seats" };

  // 2) create the booking row; on any failure, release the seats we just claimed
  try {
    const booking = await prisma.intercityBooking.create({
      data: {
        tripId: input.tripId,
        riderId,
        seatsBooked: seatCount,
        paymentMethod: method,
        status: method === "PREPAY" ? "PREPAY_PENDING" : "CONFIRMED",
        agreedFareSom,
        tangaDiscount: discount,
        commissionSom: trip.commissionSom * seatCount,
        boardingCityId: input.boardingCityId ?? null,
        alightingCityId: input.alightingCityId ?? null,
        idempotencyKey: idem,
        confirmedAt: method === "CASH" ? new Date() : null,
      },
    });
    // 3) spend the tanga discount (idempotent). Pre-checked above, so this is near-certain.
    if (discount > 0) {
      const sp = await spendCoinsIdempotent(riderId, discount, "intercity_discount", `Intercity chegirma #${booking.id}`, `idiscount:${idem}`);
      if (!sp.ok && sp.skipped !== "duplicate") {
        await prisma.intercityBooking.delete({ where: { id: booking.id } });
        await releaseSeats(input.tripId, seatCount);
        return { ok: false, error: "insufficient_tanga" };
      }
    }
    return { ok: true, bookingId: booking.id };
  } catch (e) {
    await releaseSeats(input.tripId, seatCount);
    if ((e as { code?: string } | null)?.code === "P2002") {
      const ex = await prisma.intercityBooking.findUnique({ where: { idempotencyKey: idem } });
      if (ex) return { ok: true, bookingId: ex.id, duplicate: true };
      return { ok: false, error: "already_booked" };
    }
    throw e;
  }
}

/** booking timing windows for rider cancel (hours before scheduled departure). */
function cancelOutcome(hoursToDepart: number, status: string): "full" | "partial" | "none" {
  if (status === "DEPARTED" || status === "COMPLETED") return "none";
  if (hoursToDepart >= 24) return "full";
  if (hoursToDepart >= 2) return "partial";
  return "none";
}

/** Rider cancels their own booking. T1 is cash-only: no real-money refund, but the
 *  seat is released and any tanga discount is restored per the timing window. */
export async function cancelBookingByRider(riderId: number, bookingId: number): Promise<{ ok: boolean; outcome?: string; error?: string }> {
  if (!(await featureOn("intercity"))) return { ok: false, error: "feature_off" };
  if (!validId(bookingId)) return { ok: false, error: "not_found" };
  const b = await prisma.intercityBooking.findUnique({ where: { id: bookingId }, include: { trip: true } });
  if (!b || b.riderId !== riderId) return { ok: false, error: "not_found" };
  if (!["CONFIRMED", "PREPAY_PENDING"].includes(b.status)) return { ok: false, error: "not_cancellable" };

  const hours = (b.trip.scheduledAt.getTime() - Date.now()) / 3_600_000;
  const outcome = cancelOutcome(hours, b.trip.status);
  const newStatus = outcome === "none" ? "RIDER_CANCELLED_LATE" : "RIDER_CANCELLED";

  await prisma.intercityBooking.update({ where: { id: bookingId }, data: { status: newStatus, cancelledAt: new Date() } });
  await releaseSeats(b.tripId, b.seatsBooked);

  // restore tanga discount (full window → all; partial → half; late → none)
  if (b.tangaDiscount > 0 && outcome !== "none") {
    const restore = outcome === "full" ? b.tangaDiscount : Math.floor(b.tangaDiscount / 2);
    if (restore > 0) await grantCoins(riderId, restore, "intercity_discount_restore", `Bekor #${bookingId}`, `idiscountrestore:${bookingId}`);
  }
  return { ok: true, outcome };
}

/** Driver cancels a whole trip. Returns the affected riders' telegram ids so the
 *  caller (bot) can notify them. Restores tanga discounts. (Prepaid real-money
 *  refunds are created in T2.) */
export async function driverCancelTrip(driverId: number, tripId: number): Promise<{ ok: boolean; riderTgs?: string[]; error?: string }> {
  if (!(await featureOn("intercity"))) return { ok: false, error: "feature_off" };
  if (!validId(tripId)) return { ok: false, error: "not_found" };
  const trip = await prisma.intercityTrip.findUnique({ where: { id: tripId }, include: { bookings: true } });
  if (!trip || trip.driverId !== driverId) return { ok: false, error: "not_found" };
  if (!["OPEN", "BOARDING"].includes(trip.status)) return { ok: false, error: "not_cancellable" };

  // Tartib MUHIM. Ilgari reys "CANCELLED" qilinardi, keyin har yo'lovchi BITTALAB tsiklda
  // yangilanardi — tsikl o'rtasida bitta xato (grantCoins/tgOf) chiqsa qolgan yo'lovchilar
  // "CONFIRMED" bo'lib qolardi: reys bekor, ular esa xabarsiz va pulsiz, ro'yxatdan ham
  // yo'qolgan (getRiderActiveBookings faqat OPEN/BOARDING/DEPARTED reyslarni ko'rsatadi).
  // Endi: (1) hamma booking BITTA updateMany bilan atomik yopiladi, (2) keyin reys yopiladi,
  // (3) tanga qaytarish/tg-qidirish alohida — bittasi yiqilsa qolganlari davom etadi
  // (grantCoins `idiscountrestore:<id>` kaliti bilan idempotent, qayta urinish xavfsiz).
  const affected = trip.bookings.filter((b) => ["CONFIRMED", "PREPAY_PENDING"].includes(b.status));
  await prisma.intercityBooking.updateMany({
    where: { id: { in: affected.map((b) => b.id) } },
    data: { status: "CANCELLED_BY_DRIVER", cancelledAt: new Date() },
  });
  await prisma.intercityTrip.update({ where: { id: tripId }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: "driver_cancel" } });

  const riderTgs: string[] = [];
  for (const b of affected) {
    try {
      if (b.tangaDiscount > 0) await grantCoins(b.riderId, b.tangaDiscount, "intercity_discount_restore", `Haydovchi bekor #${b.id}`, `idiscountrestore:${b.id}`);
      const tg = await tgOf(b.riderId);
      if (tg) riderTgs.push(tg);
    } catch (e) {
      console.error(`[intercity] driverCancelTrip: booking #${b.id} kompensatsiyasi yiqildi`, e);
    }
  }
  return { ok: true, riderTgs };
}

export async function departTrip(driverId: number, tripId: number): Promise<{ ok: boolean; riderTgs?: string[]; error?: string }> {
  if (!(await featureOn("intercity"))) return { ok: false, error: "feature_off" };
  if (!validId(tripId)) return { ok: false, error: "not_found" };
  const trip = await prisma.intercityTrip.findUnique({ where: { id: tripId }, include: { bookings: true } });
  if (!trip || trip.driverId !== driverId) return { ok: false, error: "not_found" };
  if (!["OPEN", "BOARDING"].includes(trip.status)) return { ok: false, error: "bad_state" };
  await prisma.intercityTrip.update({ where: { id: tripId }, data: { status: "DEPARTED", departedAt: new Date() } });
  const riderTgs = (await Promise.all(trip.bookings.filter((b) => b.status === "CONFIRMED").map((b) => tgOf(b.riderId)))).filter((x): x is string => !!x);
  return { ok: true, riderTgs };
}

/** Recognize commission for a completed trip — ONE debt row per trip (idempotent
 *  via @@unique tripId). Sums per-booking commission of confirmed bookings. */
async function recognizeCommission(tripId: number, driverId: number): Promise<void> {
  const agg = await prisma.intercityBooking.aggregate({
    where: { tripId, status: { in: ["CONFIRMED", "COMPLETED"] } },
    _sum: { commissionSom: true },
  });
  const total = agg._sum.commissionSom ?? 0;
  if (total <= 0) return; // pilot runs commission-free → nothing to record
  try {
    await prisma.intercityCommissionDebt.create({ data: { tripId, driverId, commissionSom: total } });
  } catch {
    /* already recorded (unique tripId) — idempotent no-op */
  }
}

export async function arriveTrip(driverId: number, tripId: number): Promise<{ ok: boolean; riderTgs?: string[]; error?: string }> {
  if (!(await featureOn("intercity"))) return { ok: false, error: "feature_off" };
  if (!validId(tripId)) return { ok: false, error: "not_found" };
  const trip = await prisma.intercityTrip.findUnique({ where: { id: tripId }, include: { bookings: true } });
  if (!trip || trip.driverId !== driverId) return { ok: false, error: "not_found" };
  if (trip.status !== "DEPARTED") return { ok: false, error: "bad_state" };
  await prisma.intercityTrip.update({ where: { id: tripId }, data: { status: "COMPLETED", completedAt: new Date() } });
  await prisma.intercityBooking.updateMany({ where: { tripId, status: "CONFIRMED" }, data: { status: "COMPLETED" } });
  await recognizeCommission(tripId, driverId);
  const riderTgs = (await Promise.all(trip.bookings.filter((b) => b.status === "CONFIRMED").map((b) => tgOf(b.riderId)))).filter((x): x is string => !!x);
  return { ok: true, riderTgs };
}

// ── rider / driver reads ─────────────────────────────────────────────────────

export async function getRiderBookings(riderId: number): Promise<unknown[]> {
  if (!(await featureOn("intercity"))) return [];
  return prisma.intercityBooking.findMany({
    where: { riderId },
    include: { trip: { include: { originCity: true, destCity: true, driver: { select: { fullName: true, displayName: true, carNumber: true, phone: true } } } } },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
}

export async function getRiderActiveBookings(riderId: number): Promise<unknown[]> {
  if (!(await featureOn("intercity"))) return [];
  return prisma.intercityBooking.findMany({
    where: { riderId, status: { in: ["CONFIRMED", "PREPAY_PENDING"] }, trip: { status: { in: ["OPEN", "BOARDING", "DEPARTED"] } } },
    include: { trip: { include: { originCity: true, destCity: true, driver: { select: { fullName: true, displayName: true, carNumber: true, phone: true } } } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getDriverTrips(driverId: number): Promise<unknown[]> {
  if (!(await featureOn("intercity"))) return [];
  return prisma.intercityTrip.findMany({
    where: { driverId, status: { in: ["OPEN", "BOARDING", "DEPARTED"] } },
    include: { originCity: true, destCity: true, _count: { select: { bookings: true } } },
    orderBy: { scheduledAt: "asc" },
  });
}

export async function getTripManifest(driverId: number, tripId: number): Promise<unknown> {
  if (!(await featureOn("intercity"))) return null;
  if (!validId(tripId)) return null;
  const trip = await prisma.intercityTrip.findUnique({
    where: { id: tripId },
    include: { originCity: true, destCity: true, bookings: { where: { status: { in: ["CONFIRMED", "COMPLETED", "PREPAY_PENDING"] } }, include: { rider: { select: { fullName: true, displayName: true, phone: true } }, boardingCity: true, alightingCity: true } } },
  });
  if (!trip || trip.driverId !== driverId) return null;
  return trip;
}

// ── admin ────────────────────────────────────────────────────────────────────

export async function adminListTrips(filter?: { status?: string }): Promise<unknown[]> {
  return prisma.intercityTrip.findMany({
    where: filter?.status ? { status: filter.status } : {},
    include: { originCity: true, destCity: true, driver: { select: { fullName: true, carNumber: true } }, _count: { select: { bookings: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function adminListDebts(): Promise<{ rows: unknown[]; totalPending: number }> {
  const [rows, agg] = await Promise.all([
    prisma.intercityCommissionDebt.findMany({ where: { status: "PENDING" }, include: { driver: { select: { fullName: true, carNumber: true } }, trip: { select: { id: true } } }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.intercityCommissionDebt.aggregate({ where: { status: "PENDING" }, _sum: { commissionSom: true } }),
  ]);
  return { rows, totalPending: agg._sum.commissionSom ?? 0 };
}

export async function adminForceCancelTrip(tripId: number): Promise<{ ok: boolean; riderTgs?: string[] }> {
  const trip = await prisma.intercityTrip.findUnique({ where: { id: tripId } });
  if (!trip) return { ok: false };
  return driverCancelTrip(trip.driverId, tripId);
}

// ── sweep (called from bookingNotifier — NO new poller) ──────────────────────

/** Drive time-based trip transitions + fire the matching rider notifications.
 *  Idempotent via AppState markers. Bounded to 100 rows/category/tick. */
export async function sweepIntercityTrips(notify: (chatId: string, html: string) => Promise<void>): Promise<void> {
  if (!(await featureOn("intercity"))) return;
  const now = new Date();

  // 1) OPEN → BOARDING at T-30min (notify booked riders once)
  const toBoard = await prisma.intercityTrip.findMany({
    where: { status: "OPEN", scheduledAt: { lte: new Date(now.getTime() + 30 * 60_000), gt: new Date(now.getTime() - 30 * 60_000) }, bookedSeats: { gt: 0 } },
    include: { originCity: true, destCity: true, bookings: { where: { status: "CONFIRMED" } } },
    take: 100,
  });
  for (const t of toBoard) {
    await prisma.intercityTrip.update({ where: { id: t.id }, data: { status: "BOARDING" } });
    if (!(await once(`icbrd:${t.id}`))) continue;
    for (const b of t.bookings) {
      const tg = await tgOf(b.riderId);
      if (tg) await notify(tg, `🚐 <b>Haydovchi kutmoqda!</b>\n${t.originCity.name} → ${t.destCity.name}\nTez orada jo'naymiz.`).catch(() => undefined);
    }
  }

  // 2) BOARDING → DEPARTED auto at T+15min
  const toDepart = await prisma.intercityTrip.findMany({
    where: { status: "BOARDING", scheduledAt: { lte: new Date(now.getTime() - 15 * 60_000) } },
    include: { originCity: true, destCity: true, bookings: { where: { status: "CONFIRMED" } } },
    take: 100,
  });
  for (const t of toDepart) {
    await prisma.intercityTrip.update({ where: { id: t.id }, data: { status: "DEPARTED", departedAt: now } });
    if (!(await once(`icdep:${t.id}`))) continue;
    for (const b of t.bookings) {
      const tg = await tgOf(b.riderId);
      if (tg) await notify(tg, `🚗 <b>Yo'lga chiqdingiz!</b>\n${t.originCity.name} → ${t.destCity.name}\nOmon yo'l! 🤲`).catch(() => undefined);
    }
  }

  // 3) OPEN → EXPIRED (no bookings, 2h past departure) — silent
  await prisma.intercityTrip.updateMany({
    where: { status: "OPEN", bookedSeats: 0, scheduledAt: { lt: new Date(now.getTime() - 2 * 3_600_000) } },
    data: { status: "EXPIRED" },
  });

  // 4) DEPARTED → COMPLETED auto (T + duration + 2h) → recognize commission
  const toComplete = await prisma.intercityTrip.findMany({
    where: { status: "DEPARTED", departedAt: { not: null } },
    include: { route: { select: { durationMin: true } } },
    take: 100,
  });
  for (const t of toComplete) {
    const doneAt = (t.departedAt as Date).getTime() + (t.route.durationMin + 120) * 60_000;
    if (now.getTime() < doneAt) continue;
    await prisma.intercityTrip.update({ where: { id: t.id }, data: { status: "COMPLETED", completedAt: now } });
    await prisma.intercityBooking.updateMany({ where: { tripId: t.id, status: "CONFIRMED" }, data: { status: "COMPLETED" } });
    await recognizeCommission(t.id, t.driverId);
  }
}
