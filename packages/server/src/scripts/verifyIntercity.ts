// T1 DoD verification — runs against whatever DATABASE_URL is set (use the TEST DB).
// Creates TAG'd throwaway rows, proves each acceptance line, then cleans up fully.
// Run: DATABASE_URL=$TEST_DATABASE_URL DIRECT_URL=$TEST_DATABASE_URL tsx src/scripts/verifyIntercity.ts
import "../env";
import { prisma } from "../db";
import * as svc from "../services/intercityService";
import { setFeature } from "../services/featureFlags";
import { getCoins } from "../services/coinService";

const TAG = "ICTEST";
let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) { console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`); passed++; }
  else { console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); failed++; }
}

async function cleanup(): Promise<void> {
  const cities = await prisma.intercityCity.findMany({ where: { regionCode: TAG }, select: { id: true } });
  const cityIds = cities.map((c) => c.id);
  if (cityIds.length) {
    const trips = await prisma.intercityTrip.findMany({ where: { OR: [{ originCityId: { in: cityIds } }, { destCityId: { in: cityIds } }] }, select: { id: true } });
    const markers = trips.flatMap((t) => [`icbrd:${t.id}`, `icdep:${t.id}`]);
    if (markers.length) await prisma.appState.deleteMany({ where: { key: { in: markers } } });
  }
  await prisma.member.deleteMany({ where: { kasId: { startsWith: TAG } } }); // cascades trips/bookings/debts/coinTxns
  if (cityIds.length) await prisma.intercityRoute.deleteMany({ where: { OR: [{ originCityId: { in: cityIds } }, { destCityId: { in: cityIds } }] } });
  await prisma.intercityCity.deleteMany({ where: { regionCode: TAG } });
}

async function main(): Promise<void> {
  await cleanup();
  const flagBefore = (await prisma.appState.findUnique({ where: { key: "feature:intercity" } }))?.value ?? null;

  // ── fixtures ──────────────────────────────────────────────────────────────
  const cityA = await prisma.intercityCity.create({ data: { name: `${TAG}_A`, regionCode: TAG } });
  const cityB = await prisma.intercityCity.create({ data: { name: `${TAG}_B`, regionCode: TAG } });
  const drv = await prisma.member.create({ data: { type: "driver", kasId: `${TAG}_drv`, fullName: `${TAG} Driver`, coins: 0 } });
  const r1 = await prisma.member.create({ data: { type: "client", kasId: `${TAG}_r1`, fullName: `${TAG} R1`, coins: 100000 } });
  const r2 = await prisma.member.create({ data: { type: "client", kasId: `${TAG}_r2`, fullName: `${TAG} R2`, coins: 0 } });

  // ── CHECK A: flag OFF → every entry no-ops ──────────────────────────────────
  console.log("\n[A] Flag OFF → no-op");
  await setFeature("intercity", false);
  const offCities = await svc.listCities();
  const offBook = await svc.bookSeat(r1.id, { tripId: 1 });
  const offPub = await svc.publishTrip(drv.id, { originCityId: cityA.id, destCityId: cityB.id, scheduledAt: new Date(Date.now() + 3.6e6) });
  check("listCities empty when OFF", offCities.length === 0);
  check("bookSeat feature_off when OFF", offBook.error === "feature_off");
  check("publishTrip feature_off when OFF", offPub.error === "feature_off");

  await setFeature("intercity", true);
  const route = await svc.getOrCreateRoute(cityA.id, cityB.id);
  if (!route) throw new Error("route create failed");
  await prisma.intercityRoute.update({ where: { id: route.id }, data: { defaultFareSom: 120000, commissionSom: 5000, durationMin: 60 } });

  // ── CHECK B: publish + atomic concurrency (single seat, 2 racers → exactly 1) ─
  console.log("\n[B] Publish + atomic concurrency");
  const pub = await svc.publishTrip(drv.id, { originCityId: cityA.id, destCityId: cityB.id, scheduledAt: new Date(Date.now() + 3.6e6), carCapacity: 1, fareSom: 120000 });
  check("publishTrip ok", pub.ok, `tripId=${pub.tripId}`);
  const tripId = pub.tripId!;
  const [b1, b2] = await Promise.all([
    svc.bookSeat(r1.id, { tripId, paymentMethod: "CASH" }),
    svc.bookSeat(r2.id, { tripId, paymentMethod: "CASH" }),
  ]);
  const winners = [b1, b2].filter((x) => x.ok && !x.duplicate).length;
  const losers = [b1, b2].filter((x) => x.error === "no_seats").length;
  check("exactly 1 booking wins the last seat", winners === 1, `winners=${winners} losers=${losers}`);
  const tA = await prisma.intercityTrip.findUnique({ where: { id: tripId } });
  check("bookedSeats == 1 (no overbooking)", tA!.bookedSeats === 1, `bookedSeats=${tA!.bookedSeats}`);
  const bookedRider = b1.ok && !b1.duplicate ? r1.id : r2.id;

  // ── CHECK C: cash booking creates ZERO CoinTxn / moves zero tanga ────────────
  console.log("\n[C] Ledger isolation (cash)");
  const txCash = await prisma.coinTxn.count({ where: { memberId: bookedRider } });
  const coinsRider = await getCoins(bookedRider);
  const riderStartCoins = bookedRider === r1.id ? 100000 : 0;
  check("cash booking → 0 CoinTxn for rider", txCash === 0, `coinTxns=${txCash}`);
  check("rider tanga balance unchanged", coinsRider === riderStartCoins, `coins=${coinsRider}`);

  // ── CHECK D: double-tap idempotent ──────────────────────────────────────────
  console.log("\n[D] Idempotent double-tap");
  const dup = await svc.bookSeat(bookedRider, { tripId, paymentMethod: "CASH" });
  const tDup = await prisma.intercityTrip.findUnique({ where: { id: tripId } });
  check("double-tap returns duplicate", dup.ok === true && dup.duplicate === true);
  check("seats unchanged after double-tap", tDup!.bookedSeats === 1, `bookedSeats=${tDup!.bookedSeats}`);

  // ── CHECK E: tanga discount path (capped, isolated) ─────────────────────────
  console.log("\n[E] Tanga discount (capped)");
  const pub2 = await svc.publishTrip(drv.id, { originCityId: cityA.id, destCityId: cityB.id, scheduledAt: new Date(Date.now() + 3.6e6), carCapacity: 4, fareSom: 120000 });
  const balBefore = await getCoins(r1.id);
  const bd = await svc.bookSeat(r1.id, { tripId: pub2.tripId!, paymentMethod: "CASH", tangaDiscount: 9999 });
  const balAfter = await getCoins(r1.id);
  check("discount booking ok", bd.ok);
  check("discount capped at 5000", balBefore - balAfter === 5000, `spent=${balBefore - balAfter}`);
  const dtx = await prisma.coinTxn.findFirst({ where: { memberId: r1.id, kind: "intercity_discount" } });
  check("discount logged as intercity_discount (-5000)", !!dtx && dtx.amount === -5000, `amount=${dtx?.amount}`);
  const bRow = await prisma.intercityBooking.findFirst({ where: { riderId: r1.id, tripId: pub2.tripId! } });
  check("agreedFareSom = 115000 (120000-5000)", bRow!.agreedFareSom === 115000, `fare=${bRow!.agreedFareSom}`);

  // ── CHECK F: NO intercity fare ever lands in CoinTxn ─────────────────────────
  console.log("\n[F] Fare never enters tanga ledger");
  const fareLeak = await prisma.coinTxn.count({ where: { kind: { in: ["intercity_fare", "intercity_booking"] } } });
  check("0 fare CoinTxn rows (intercity_fare/booking)", fareLeak === 0, `leak=${fareLeak}`);

  // ── CHECK G: sweep auto-expire ───────────────────────────────────────────────
  console.log("\n[G] Sweep auto-expire");
  const expPub = await svc.publishTrip(drv.id, { originCityId: cityA.id, destCityId: cityB.id, scheduledAt: new Date(Date.now() - 3 * 3.6e6), carCapacity: 4, fareSom: 120000 });
  await svc.sweepIntercityTrips(async () => undefined);
  const expTrip = await prisma.intercityTrip.findUnique({ where: { id: expPub.tripId! } });
  check("OPEN+0 bookings+past → EXPIRED", expTrip!.status === "EXPIRED", `status=${expTrip!.status}`);

  // ── CHECK H: commission recognition idempotent ──────────────────────────────
  console.log("\n[H] Commission recognition (idempotent)");
  await svc.departTrip(drv.id, tripId);
  await svc.arriveTrip(drv.id, tripId);
  const debts1 = await prisma.intercityCommissionDebt.count({ where: { tripId } });
  await svc.arriveTrip(drv.id, tripId); // bad_state, must not double-create
  const debts2 = await prisma.intercityCommissionDebt.count({ where: { tripId } });
  const debt = await prisma.intercityCommissionDebt.findFirst({ where: { tripId } });
  check("exactly 1 commission debt row", debts1 === 1 && debts2 === 1, `${debts1}/${debts2}`);
  check("commission == 5000 (1 confirmed seat × 5000)", debt?.commissionSom === 5000, `som=${debt?.commissionSom}`);

  // ── cleanup ─────────────────────────────────────────────────────────────────
  await cleanup();
  if (flagBefore === null) await prisma.appState.deleteMany({ where: { key: "feature:intercity" } });
  else await setFeature("intercity", flagBefore !== "off");

  console.log(`\n${"═".repeat(48)}\nRESULT: ${passed} passed, ${failed} failed\n${"═".repeat(48)}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error("FATAL", e instanceof Error ? e.stack : e); await cleanup().catch(() => undefined); process.exit(1); });
