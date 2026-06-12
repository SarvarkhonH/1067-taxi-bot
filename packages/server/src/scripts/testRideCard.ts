// Live ride-card sweep simulation: 6 status ticks must produce ONE card
// (edited in place), ONE moving pin, and ONE final summary — not 11 messages.
// Uses a scripted datasource + fake bot; real members' active rides are echoed
// back unchanged so the sweep never touches them.
// Run: dotenv -e ../../.env -- tsx src/scripts/testRideCard.ts
import "../env";
import type { Bot } from "grammy";
import { prisma } from "../db";
import type { ActiveBookingLite, BookingDriver, KasDataSource, KasMainReport } from "../kas";
import { pushBookingUpdates } from "../services/bookingNotifier";

const TAG = "ridecard-test";
let failed = 0;
function ok(cond: boolean, label: string): void {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) failed++;
}

// ── fake bot: counts every call, returns increasing message ids ──
let msgId = 1000;
const calls = { send: 0, edit: 0, loc: 0, editLoc: 0, stopLoc: 0, texts: [] as string[] };
const fakeBot = {
  api: {
    sendMessage: async (_c: string, text: string) => {
      calls.send++;
      calls.texts.push(text);
      return { message_id: ++msgId };
    },
    editMessageText: async () => {
      calls.edit++;
      return true;
    },
    sendLocation: async () => {
      calls.loc++;
      return { message_id: ++msgId };
    },
    editMessageLiveLocation: async () => {
      calls.editLoc++;
      return true;
    },
    stopMessageLiveLocation: async () => {
      calls.stopLoc++;
      return true;
    },
  },
} as unknown as Bot;

const PHONE = "+998900004001";
const CAR = "70TEST01";
const BOOKING_ID = 777001;

function makeDs(current: ActiveBookingLite | null, echo: ActiveBookingLite[]): KasDataSource {
  return {
    listActiveBookings: async () => (current ? [...echo, current] : [...echo]),
    getMainReport: async (): Promise<KasMainReport> => ({ completedYesterday: 160, bookingsYesterday: 200, onlineDrivers: 12, activeDrivers: 100, serviceCost: 0 }),
    getDriverByCar: async (car: string): Promise<BookingDriver | null> =>
      car === CAR ? { fullName: "Test Driver", phone: "+998900004002", carModel: "Cobalt", carNumber: CAR, rating: 4.9, lat: 39.05, lng: 65.57 } : null,
  } as unknown as KasDataSource;
}

function lite(status: string, carNumber = ""): ActiveBookingLite {
  return { id: BOOKING_ID, phoneNorm: PHONE.replace(/\D/g, "").slice(-9), status, carNumber, addressName: "Test manzil", clientBonus: 500, lat: 39.04, lng: 65.56 };
}

async function cleanup(): Promise<void> {
  await prisma.appState.deleteMany({ where: { key: { in: [`fundride:${BOOKING_ID}`] } } });
  const ms = await prisma.member.findMany({ where: { kasId: { startsWith: TAG } }, select: { id: true } });
  const ids = ms.map((m) => m.id);
  await prisma.rideGuess.deleteMany({ where: { memberId: { in: ids } } });
  await prisma.missionProgress.deleteMany({ where: { memberId: { in: ids } } });
  await prisma.notifyLog.deleteMany({ where: { memberId: { in: ids } } });
  await prisma.rideReward.deleteMany({ where: { memberId: { in: ids } } });
  await prisma.telegramUser.deleteMany({ where: { id: { startsWith: `${TAG}-tg` } } });
  await prisma.member.deleteMany({ where: { id: { in: ids } } });
}

async function main(): Promise<void> {
  // tests roll REAL cashback against the live DB — protect the live jackpot pool
  const jackpotBefore = (await prisma.appState.findUnique({ where: { key: "jackpot_pool" } }))?.value ?? null;
  await cleanup();

  // echo real members' active rides back unchanged (zero interference)
  const realActives = await prisma.member.findMany({
    where: { lastBookingId: { not: null }, phone: { not: null } },
    select: { phone: true, lastBookingId: true, lastBookingStatus: true, lastBookingCar: true },
  });
  const echo: ActiveBookingLite[] = realActives.map((r) => ({
    id: r.lastBookingId!,
    phoneNorm: r.phone!.replace(/\D/g, "").slice(-9),
    status: r.lastBookingStatus ?? "called",
    carNumber: r.lastBookingCar ?? "",
    addressName: "echo",
    clientBonus: 0,
  }));
  console.log(`(echoing ${echo.length} real active rides untouched)`);

  const rider = await prisma.member.create({
    data: { type: "client", kasId: `${TAG}-R`, fullName: "Card Rider", phone: PHONE, trips: 3 },
  });
  await prisma.telegramUser.create({ data: { id: `${TAG}-tg-R`, memberId: rider.id, linkedAt: new Date() } });
  const driver = await prisma.member.create({
    data: { type: "driver", kasId: `${TAG}-D`, fullName: "Card Driver", phone: "+998900004002", carNumber: CAR, trips: 100, driverTier: "Oltin" },
  });

  // tick 1: searching → ONE card sent (with queue line), no pin yet
  await pushBookingUpdates(fakeBot, makeDs(lite("searching"), echo));
  ok(calls.send === 1, `tick1 searching: exactly 1 card sent (${calls.send})`);
  ok(calls.texts[0]!.includes("Navbatda"), `card shows honest queue position`);
  ok(calls.loc === 0, `no pin before a driver exists`);

  // tick 2: driver assigned → card EDITED (not re-sent), pin appears
  await pushBookingUpdates(fakeBot, makeDs(lite("called", CAR), echo));
  ok(calls.send === 1, `tick2 assigned: still 1 sent message (edit, not send)`);
  ok(calls.edit >= 1, `card edited in place (${calls.edit})`);
  ok(calls.loc === 1, `moving pin sent once`);

  // tick 3: started → meter starts, card offers wheel + guess
  await pushBookingUpdates(fakeBot, makeDs(lite("started", CAR), echo));
  const m1 = await prisma.member.findUnique({ where: { id: rider.id } });
  ok(!!m1?.rideStartedAt, `ride meter started on first 'started' sighting`);
  ok(calls.editLoc >= 1, `pin position edited (${calls.editLoc})`);

  // rider guesses 6-9; backdate the meter so the ride measures ~7 min
  await prisma.rideGuess.create({ data: { memberId: rider.id, bookingId: BOOKING_ID, guessBand: "6-9" } });
  await prisma.member.update({ where: { id: rider.id }, data: { rideStartedAt: new Date(Date.now() - 7 * 60_000) } });

  // tick 4: still started → no new sends
  await pushBookingUpdates(fakeBot, makeDs(lite("started", CAR), echo));
  ok(calls.send === 1, `tick4: still no extra messages`);

  // tick 5: ride gone → finish: card frozen, pin stopped, ONE summary
  await pushBookingUpdates(fakeBot, makeDs(null, echo));
  ok(calls.send === 2, `finish: exactly 1 summary message (total sends ${calls.send})`);
  ok(calls.stopLoc === 1, `live pin stopped`);
  const summary = calls.texts[1]!;
  ok(summary.includes("Safar cashback") || summary.includes("JACKPOT"), `summary contains the roll result`);
  ok(summary.includes("TOPDINGIZ"), `ETA-guess resolved as WIN (7 min in 6-9)`);

  // state + money assertions
  const m2 = await prisma.member.findUnique({ where: { id: rider.id } });
  ok(!m2?.lastBookingId && !m2?.rideCardMsgId && !m2?.liveLocMsgId && !m2?.rideStartedAt, `per-ride state fully cleared`);
  const reward = await prisma.rideReward.findUnique({ where: { memberId_bookingId: { memberId: rider.id, bookingId: BOOKING_ID } } });
  ok(!!reward, `RideReward rolled exactly once`);
  const guess = await prisma.rideGuess.findUnique({ where: { memberId_bookingId: { memberId: rider.id, bookingId: BOOKING_ID } } });
  ok(guess?.won === true, `guess marked won`);
  const dBonus = await prisma.coinTxn.findFirst({ where: { memberId: driver.id, kind: "driver_bonus" } });
  ok(dBonus?.amount === 100, `tier rebate granted (Oltin = 100)`);
  const quest = await prisma.missionProgress.findFirst({ where: { memberId: driver.id, code: "drv_daily_5" } });
  ok(quest?.progress === 1, `driver quest progress incremented (drv_daily_5 = 1)`);
  // ledger invariant for both
  for (const id of [rider.id, driver.id]) {
    const bal = (await prisma.member.findUnique({ where: { id } }))!.coins;
    const sum = await prisma.coinTxn.aggregate({ where: { memberId: id }, _sum: { amount: true } });
    ok(Math.abs(bal - (sum._sum.amount ?? 0)) < 0.001, `ledger invariant holds (member ${id})`);
  }
  // per-ride clamp: roll + guess together ≤ 350
  const rideSum = await prisma.coinTxn.aggregate({
    where: { memberId: rider.id, amount: { gt: 0 }, idempotencyKey: { endsWith: `:${rider.id}:${BOOKING_ID}` } },
    _sum: { amount: true },
  });
  ok((rideSum._sum.amount ?? 0) <= 350, `per-ride emission ${rideSum._sum.amount} ≤ 350 (clamp)`);

  // echoed real rides: untouched
  const stillActive = await prisma.member.count({ where: { lastBookingId: { not: null }, kasId: { not: { startsWith: TAG } } } });
  ok(stillActive === realActives.length, `real members' rides untouched (${stillActive})`);

  await cleanup();
  if (jackpotBefore === null) await prisma.appState.deleteMany({ where: { key: "jackpot_pool" } });
  else await prisma.appState.upsert({ where: { key: "jackpot_pool" }, update: { value: jackpotBefore }, create: { key: "jackpot_pool", value: jackpotBefore } });
  await prisma.$disconnect();
  console.log(failed === 0 ? "\n🎉 all ride-card checks passed" : `\n❌ ${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
