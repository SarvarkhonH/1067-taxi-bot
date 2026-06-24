// Why is the owner blocked from booking? Show lastBookingAt (the 60s throttle) + any active kas
// booking (the "Sizda faol buyurtma bor" guard). Optionally clear the throttle: pass "clear".
//   read:  KAS_MODE=live dotenv -e ../../.env -- tsx src/scripts/checkOwnerBooking.ts
//   clear: KAS_MODE=live dotenv -e ../../.env -- tsx src/scripts/checkOwnerBooking.ts clear
import "../env";
import { prisma } from "../db";
import { getDataSource } from "../kas";

const OWNER_TG = "6506297119";

async function main(): Promise<void> {
  const tu = await prisma.telegramUser.findUnique({ where: { id: OWNER_TG }, include: { member: true } });
  const m = tu?.member;
  if (!m) { console.log("owner has no linked member"); process.exit(0); }
  const ago = m.lastBookingAt ? Math.round((Date.now() - new Date(m.lastBookingAt).getTime()) / 1000) : null;
  console.log(`member ${m.id} (${m.fullName}) phone=${m.phone}`);
  console.log(`lastBookingAt: ${m.lastBookingAt ?? "never"}${ago !== null ? ` (${ago}s ago — throttle is 60s, so ${ago < 60 ? "BLOCKED for " + (60 - ago) + "s more" : "NOT throttled"})` : ""}`);

  if (m.phone) {
    const active = await getDataSource().getActiveBooking(m.phone).catch(() => null);
    console.log(`active kas booking: ${active ? `YES — id=${active.id} status=${active.status} (this triggers "Sizda faol buyurtma bor")` : "none"}`);
  }

  if (process.argv[2] === "clear") {
    await prisma.member.update({ where: { id: m.id }, data: { lastBookingAt: null } });
    console.log("\n✅ lastBookingAt cleared — you can book immediately now (active-booking guard, if any, still applies).");
  }
  await prisma.$disconnect();
}
main();
