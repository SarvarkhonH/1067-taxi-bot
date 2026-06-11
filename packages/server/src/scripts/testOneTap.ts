// 1-tap booking cascade tests. ALWAYS run with overrides so no real taxi is
// ever dispatched: BOOKING_LIVE=false KAS_MODE=mock dotenv -e ../../.env -- tsx src/scripts/testOneTap.ts
import "../env";
import { env } from "../env";
import { prisma } from "../db";
import { callOneTapFor, getQuickPickup, rememberPickup } from "../services/bookingService";

const TAG = "onetap-test";
let failed = 0;
function ok(cond: boolean, label: string): void {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) failed++;
}

async function clearThrottle(memberId: number): Promise<void> {
  await prisma.member.update({ where: { id: memberId }, data: { lastBookingAt: null } });
}

async function main(): Promise<void> {
  if (env.bookingLive) {
    console.error("ABORT: BOOKING_LIVE must be false for this test (real dispatch risk)");
    process.exit(1);
  }
  await prisma.member.deleteMany({ where: { kasId: { startsWith: TAG } } });

  // fresh member with rides but no pickup memory → must ask
  const m = await prisma.member.create({
    data: { type: "client", kasId: `${TAG}-1`, fullName: "OneTap Test", phone: "+998900000777", trips: 3 },
  });
  let r = await callOneTapFor(m.id, {});
  ok(r.state === "need_pickup", `no memory → need_pickup (${r.state})`);

  // remember a pickup → it becomes both last and sticky default
  await rememberPickup(m.id, { id: 501, name: "Uy (test)", lat: 39.04, lng: 65.59 });
  const q1 = await getQuickPickup(m.id);
  ok(q1?.id === 501 && q1.name === "Uy (test)", `quick pickup remembered (${q1?.name})`);

  // T3: no GPS → last pickup dispatch (test mode — no real call)
  await clearThrottle(m.id);
  r = await callOneTapFor(m.id, {});
  ok(r.state === "test" && r.pickupName === "Uy (test)", `T3 last-pickup dispatch (${r.state} → ${r.pickupName})`);

  // double-tap guard: second call inside 60s is throttled
  r = await callOneTapFor(m.id, {});
  ok(r.state === "throttled", `double-tap throttled (${r.state})`);

  // T1: GPS within 120m of last pickup → same spot
  await clearThrottle(m.id);
  r = await callOneTapFor(m.id, { lat: 39.0405, lng: 65.5905 });
  ok(r.state === "test" && r.pickupName === "Uy (test)", `T1 GPS-near-last dispatch (${r.pickupName})`);

  // newer booking from another spot: last updates, default stays sticky
  await clearThrottle(m.id);
  await rememberPickup(m.id, { id: 502, name: "Ish (test)", lat: 39.2, lng: 65.8 });
  const mm = await prisma.member.findUnique({ where: { id: m.id } });
  ok(mm?.defaultPickupId === 501 && mm?.lastPickupId === 502, `default sticky (501), last updated (502)`);

  // label and dispatch must agree: both prefer the LAST pickup
  const q2 = await getQuickPickup(m.id);
  await clearThrottle(m.id);
  r = await callOneTapFor(m.id, {});
  ok(q2?.name === "Ish (test)" && r.pickupName === "Ish (test)", `label == dispatch target (${q2?.name} / ${r.pickupName})`);

  // explicit override wins over everything
  await clearThrottle(m.id);
  r = await callOneTapFor(m.id, { addressId: 502 });
  ok(r.state === "test" && r.pickupName === "Ish (test)", `explicit addressId override (${r.pickupName})`);

  // member without phone → failed, not crash
  const m2 = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-2`, fullName: "No Phone" } });
  r = await callOneTapFor(m2.id, {});
  ok(r.state === "failed", `phone-less member → failed (${r.state})`);

  await prisma.member.deleteMany({ where: { kasId: { startsWith: TAG } } });
  await prisma.$disconnect();
  console.log(failed === 0 ? "\n🎉 all one-tap checks passed" : `\n❌ ${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
