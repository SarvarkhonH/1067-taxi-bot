// READ-ONLY diagnostic: why did a specific phone hit "Sizda faol buyurtma bor" /
// "Hozirgina buyurtma yuborilgan", and what bot bookings landed today.
// Never writes, never messages users. Pass a phone (last digits); default 906391026.
//   KAS_MODE=live dotenv -e ../../.env -- tsx src/scripts/diagBookingPhone.ts 906391026
import "../env";
import { prisma } from "../db";
import { getDataSource } from "../kas";

const THROTTLE_S = 30; // ONE_TAP_THROTTLE_MS = 30_000 (bookingService.ts)

async function main(): Promise<void> {
  const arg = (process.argv[2] || "906391026").replace(/\D/g, "");
  const last9 = arg.slice(-9);
  console.log(`\n=== DIAG for phone …${last9} ===\n`);

  // 1) the member
  const m = await prisma.member.findFirst({
    where: { phone: { endsWith: last9 } },
    include: { telegramUser: true },
  });
  if (!m) { console.log("no member with that phone"); await prisma.$disconnect(); return; }
  const ago = m.lastBookingAt ? Math.round((Date.now() - new Date(m.lastBookingAt).getTime()) / 1000) : null;
  console.log(`member id=${m.id} name=${m.fullName} phone=${m.phone} tg=${m.telegramUser?.id ?? "—"}`);
  console.log(`lastBookingId=${m.lastBookingId ?? "—"} status=${m.lastBookingStatus ?? "—"} car=${m.lastBookingCar ?? "—"}`);
  console.log(`lastBookingAt=${m.lastBookingAt ?? "never"}` +
    (ago !== null ? ` (${ago}s ago — throttle ${THROTTLE_S}s → ${ago < THROTTLE_S ? "BLOCKED " + (THROTTLE_S - ago) + "s more" : "not throttled"})` : ""));

  // 2) does kas think this phone has an active booking? (the "Sizda faol buyurtma bor" trigger)
  if (m.phone) {
    const active = await getDataSource().getActiveBooking(m.phone).catch((e) => { console.log("getActiveBooking error:", String(e)); return null; });
    if (active) {
      const created = (active as { createdDate?: string }).createdDate;
      const oldH = created ? ((Date.now() - new Date(created).getTime()) / 3.6e6).toFixed(1) : "?";
      console.log(`\n⚠️ kas ACTIVE booking: id=${active.id} status=${active.status} createdDate=${created ?? "?"} (${oldH}h old)`);
      console.log(`   → THIS blocks new orders + makes the sweep push a ride card. If ${oldH}h old & no live ride, it is STALE.`);
    } else {
      console.log(`\nkas active booking: none → not currently blocked by the active-guard.`);
    }
  }

  // 3) does the phone appear in the global active-booking list (what the sweep iterates)?
  try {
    const all = await getDataSource().listActiveBookings();
    const mine = all.filter((b) => String((b as { phoneNumber?: string }).phoneNumber ?? "").replace(/\D/g, "").endsWith(last9));
    console.log(`\nkas listActiveBookings: ${all.length} total · ${mine.length} match this phone`);
    for (const b of mine) console.log(`   • id=${b.id} status=${b.status} car=${(b as { carNumber?: string }).carNumber ?? "—"}`);
  } catch (e) { console.log("listActiveBookings error:", String(e)); }

  // 4) today's bot/miniapp bookings across ALL members (approx = members whose lastBookingAt is today)
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const today = await prisma.member.findMany({
    where: { lastBookingAt: { gte: start } },
    select: { id: true, fullName: true, phone: true, lastBookingId: true, lastBookingStatus: true, lastBookingCar: true, lastBookingAt: true },
    orderBy: { lastBookingAt: "desc" },
  });
  const noCar = today.filter((t) => !t.lastBookingCar && t.lastBookingStatus && t.lastBookingStatus !== "finish").length;
  console.log(`\n=== Today's bot bookings (lastBookingAt ≥ ${start.toISOString()}): ${today.length} ===`);
  console.log(`   driverless-ish (no car, not finished): ${noCar}`);
  for (const t of today.slice(0, 25)) {
    const hhmm = new Date(t.lastBookingAt!).toISOString().slice(11, 16);
    console.log(`   ${hhmm} m${t.id} ${t.fullName?.slice(0, 18).padEnd(18)} b${t.lastBookingId ?? "—"} ${String(t.lastBookingStatus ?? "—").padEnd(9)} car=${t.lastBookingCar ?? "—"} …${String(t.phone ?? "").slice(-9)}`);
  }

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
