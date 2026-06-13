// T4 (AUDIT money-shield): the miniapp confirm-flow CALL (createBookingFor) must never
// fire a phantom double-dispatch — phantom orders waste real drivers (our moat). The fix
// mirrors the hardened 1-tap path (callOneTapFor): active-booking guard + lastBookingAt throttle.
//
// With KAS_MODE=mock, getActiveBooking ALWAYS reports an active ride, so this deterministically
// proves the active-booking guard refuses to dispatch. It also asserts the create path mints
// ZERO coins (grants only ever happen on the finish sweep, idempotently). The lastBookingAt
// throttle mirrors the testOneTap-covered callOneTapFor path.
//
// Run: KAS_MODE=mock BOOKING_LIVE=false dotenv -e ../../.env -- tsx src/scripts/testBookingGuard.ts
import "../env";
import { prisma } from "../db";
import { createBookingFor } from "../services/bookingService";

const TAG = "bookguard-test";
let failed = 0;
const ok = (c: boolean, l: string): void => {
  console.log(`${c ? "✅" : "❌"} ${l}`);
  if (!c) failed++;
};

async function cleanup(): Promise<void> {
  await prisma.member.deleteMany({ where: { kasId: { startsWith: TAG } } });
}

async function main(): Promise<void> {
  await cleanup();
  const m = await prisma.member.create({
    data: { type: "client", kasId: `${TAG}-1`, fullName: "Guard Test", phone: "+998900099001", trips: 5 },
  });
  try {
    // mock getActiveBooking always reports an active ride → the guard must refuse to dispatch
    const r1 = await createBookingFor(m.id, { pickupId: 101, pickupName: "🏠 Uy" });
    ok(r1.ok === false && /faol buyurtma/i.test(r1.message ?? ""), `active-guard: dispatch refused while a ride is active (got ${JSON.stringify(r1)})`);

    // a second identical tap is likewise refused — never two dispatches
    const r2 = await createBookingFor(m.id, { pickupId: 101, pickupName: "🏠 Uy" });
    ok(r2.ok === false, `repeat tap also refused — no phantom double-dispatch (ok=${r2.ok})`);

    // money-shield: the create path mints ZERO coins (grants only on the finish sweep)
    const coins = (await prisma.member.findUnique({ where: { id: m.id } }))!.coins;
    ok(coins === 0, `create path mints zero coins (coins=${coins})`);
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
  console.log(failed ? `\n❌ ${failed} FAIL` : "\n✅ BOOKING-GUARD: hamma tekshiruv o'tdi");
  process.exit(failed ? 1 : 0);
}

main();
