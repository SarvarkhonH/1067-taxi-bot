// T4-B: real kas status passthrough. getActiveBookingFor must expose notifiedCount
// (carNumberList length → honest "N haydovchiga yuborildi"), the driver ONLY when a
// driver actually took it (no premature "accepted"), and a mapped status label.
// KAS_MODE=mock → getActiveBooking returns a fixed taken booking (driver + notifiedCount:3).
// Run: KAS_MODE=mock BOOKING_LIVE=false dotenv -e ../../.env -- tsx src/scripts/testBookingStatus.ts
import "../env";
import { prisma } from "../db";
import { getActiveBookingFor } from "../services/bookingService";
import { bookingStatusLabel } from "@t1067/shared";

const TAG = "bookstatus-test";
let failed = 0;
const ok = (c: boolean, l: string): void => { console.log(`${c ? "✅" : "❌"} ${l}`); if (!c) failed++; };
async function cleanup(): Promise<void> { await prisma.member.deleteMany({ where: { kasId: { startsWith: TAG } } }); }

async function main(): Promise<void> {
  await cleanup();
  const m = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-1`, fullName: "Status Test", phone: "+998900088001", trips: 5 } });
  try {
    const a = await getActiveBookingFor(m.id);
    ok(!!a, `active booking returned`);
    ok(a?.notifiedCount === 3, `notifiedCount passes through (carNumberList → ${a?.notifiedCount}) — honest "N haydovchiga yuborildi"`);
    ok(!!a?.driver, `driver present → "accepted" shown ONLY when a driver actually took it`);
    ok(a?.driver?.carNumber === "01A777AA", `assigned carNumber: ${a?.driver?.carNumber}`);
    ok((a?.statusLabel?.length ?? 0) > 0, `status→label mapped: "${a?.statusLabel}"`);
    // status→label mapping spans the real lifecycle
    ok(bookingStatusLabel("new").includes("qidirilyapti"), `new → searching`);
    ok(bookingStatusLabel("take").length > 0 && bookingStatusLabel("called").length > 0, `take/called labelled`);
    ok(bookingStatusLabel("arrived").includes("yetib keldi"), `arrived → at-place`);
    ok(bookingStatusLabel("delivered").includes("yakunlandi"), `delivered → finished`);
  } finally { await cleanup(); await prisma.$disconnect(); }
  console.log(failed ? `\n❌ ${failed} FAIL` : "\n✅ BOOKING-STATUS: hamma tekshiruv o'tdi");
  process.exit(failed ? 1 : 0);
}
main();
