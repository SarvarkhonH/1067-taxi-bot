// QA P0-money: a CANCELLED ride must NOT pay ride-finish rewards. The kas active list
// drops a booking on both completion and cancellation, so the finish-sweep guards on a
// positive completion signal (rideStartedAt set + status not a cancel). This proves a
// cancelled/phantom ride fires NO RideReward, while a real completed ride still does.
// Run: dotenv -e ../../.env -- tsx src/scripts/testPhantomRide.ts
import "./_testDb"; // isolated test DB
import "../env";
import type { Bot } from "grammy";
import { prisma } from "../db";
import type { ActiveBookingLite, BookingDriver, KasDataSource, KasMainReport } from "../kas";
import { pushBookingUpdates } from "../services/bookingNotifier";

const TAG = "phantom-test";
let failed = 0;
const ok = (c: boolean, l: string): void => { console.log(`${c ? "✅" : "❌"} ${l}`); if (!c) failed++; };

let msgId = 1000;
const sentTexts: string[] = [];
const finishCards = (): number => sentTexts.filter((t) => t.includes("yakunlandi — rahmat")).length;
const fakeBot = {
  api: {
    sendMessage: async (_c: string, text: string) => { sentTexts.push(text); return { message_id: ++msgId }; },
    editMessageText: async () => true,
    sendLocation: async () => ({ message_id: ++msgId }),
    editMessageLiveLocation: async () => true,
    stopMessageLiveLocation: async () => true,
  },
} as unknown as Bot;

const ds: KasDataSource = {
  listActiveBookings: async (): Promise<ActiveBookingLite[]> => [], // NO active bookings → finish branch for all
  getMainReport: async (): Promise<KasMainReport> => ({ completedYesterday: 160, bookingsYesterday: 200, onlineDrivers: 12, activeDrivers: 100, serviceCost: 0 }),
  getDriverByCar: async (): Promise<BookingDriver | null> => null,
} as unknown as KasDataSource;

async function cleanup(): Promise<void> {
  const ms = await prisma.member.findMany({ where: { kasId: { startsWith: TAG } }, select: { id: true } });
  const ids = ms.map((m) => m.id);
  await prisma.rideReward.deleteMany({ where: { memberId: { in: ids } } });
  await prisma.missionProgress.deleteMany({ where: { memberId: { in: ids } } });
  await prisma.coinTxn.deleteMany({ where: { memberId: { in: ids } } });
  await prisma.telegramUser.deleteMany({ where: { id: { startsWith: `${TAG}-tg` } } });
  await prisma.member.deleteMany({ where: { id: { in: ids } } });
  // per-ride markers (finishcard / qinc / qscore / fundride) keyed by the test booking ids
  await prisma.appState.deleteMany({
    where: { OR: [{ key: { startsWith: "finishcard:88000" } }, { key: { endsWith: ":880001" } }, { key: { endsWith: ":880002" } }, { key: { endsWith: ":880003" } }, { key: { in: ["fundride:880001", "fundride:880002", "fundride:880003"] } }] },
  });
}

async function main(): Promise<void> {
  await cleanup();
  try {
    // CANCELLED ride: vanished from kas, last status was a cancel, never started.
    const cx = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-cancel`, fullName: "Cancelled", phone: "+998900055001", trips: 3, lastBookingId: 880001, lastBookingStatus: "cancel_by_operator", lastBookingCar: "70CAN01", rideStartedAt: null } });
    await prisma.telegramUser.create({ data: { id: `${TAG}-tg-c`, memberId: cx.id, linkedAt: new Date() } });
    // PHANTOM ride: vanished, status "new", never started (cancelled before pickup).
    const px = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-phantom`, fullName: "Phantom", phone: "+998900055002", trips: 3, lastBookingId: 880002, lastBookingStatus: "new", lastBookingCar: "", rideStartedAt: null } });
    await prisma.telegramUser.create({ data: { id: `${TAG}-tg-p`, memberId: px.id, linkedAt: new Date() } });
    // COMPLETED ride: reached "started" (rideStartedAt set), then vanished → real completion.
    const dn = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-done`, fullName: "Done", phone: "+998900055003", trips: 3, lastBookingId: 880003, lastBookingStatus: "started", lastBookingCar: "70DON01", rideStartedAt: new Date(Date.now() - 6 * 60 * 1000) } });
    await prisma.telegramUser.create({ data: { id: `${TAG}-tg-d`, memberId: dn.id, linkedAt: new Date() } });

    await pushBookingUpdates(fakeBot, ds);

    const rr = async (id: number): Promise<number> => prisma.rideReward.count({ where: { memberId: id } });
    const cleared = async (id: number): Promise<boolean> => ((await prisma.member.findUnique({ where: { id } }))?.lastBookingId ?? null) === null;

    ok((await rr(cx.id)) === 0, `CANCELLED (cancel_by_operator) → NO RideReward (got ${await rr(cx.id)})`);
    ok((await rr(px.id)) === 0, `PHANTOM (never started) → NO RideReward (got ${await rr(px.id)})`);
    ok((await rr(dn.id)) === 1, `COMPLETED (started) → cashback RideReward DID fire (got ${await rr(dn.id)})`);
    ok(await cleared(cx.id), `CANCELLED → ride state cleared (no stuck booking)`);
    ok(await cleared(px.id), `PHANTOM → ride state cleared`);
    ok(await cleared(dn.id), `COMPLETED → ride state cleared`);

    // finish-card multi-send: re-entering the finish branch (transient = card sent but state
    // not cleared) must NOT re-send the card (per-ride marker), rewards stay idempotent.
    const cardsAfter1 = finishCards();
    ok(cardsAfter1 === 1, `COMPLETED → exactly 1 finish card sent (got ${cardsAfter1})`);
    await prisma.member.update({ where: { id: dn.id }, data: { lastBookingId: 880003, lastBookingStatus: "started", lastBookingCar: "70DON01", rideStartedAt: new Date(Date.now() - 6 * 60 * 1000) } });
    await pushBookingUpdates(fakeBot, ds);
    ok(finishCards() === 1, `finish-card: transient re-entry → card NOT re-sent (still 1)`);
    ok((await rr(dn.id)) === 1, `finish-card re-entry → rewards stay idempotent (1 RideReward, no double)`);
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
  console.log(failed ? `\n❌ ${failed} FAIL` : "\n✅ PHANTOM-RIDE: cancelled/phantom rides pay nothing; real completed ride still rewards");
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error("FATAL", e instanceof Error ? e.message : e); process.exit(1); });
