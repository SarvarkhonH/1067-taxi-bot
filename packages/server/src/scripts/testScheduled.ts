// ⏰ scheduled rides + 👨‍👩‍👧 family tests (dry-run: BOOKING_LIVE must be false).
// Run: BOOKING_LIVE=false dotenv -e ../../.env -- tsx src/scripts/testScheduled.ts
import "../env";
import { env } from "../env";
import { prisma } from "../db";
import { addFamily, bookForFamily, cancelScheduled, createScheduled, dispatchScheduled, familyOf, listScheduled } from "../services/scheduledService";

if (env.bookingLive) {
  console.error("ABORT: BOOKING_LIVE=true — run with BOOKING_LIVE=false");
  process.exit(1);
}

const TAG = "sched-test";
let failed = 0;
function ok(cond: boolean, label: string): void {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) failed++;
}

async function cleanup(): Promise<void> {
  const ms = await prisma.member.findMany({ where: { kasId: { startsWith: TAG } }, select: { id: true } });
  const ids = ms.map((m) => m.id);
  await prisma.scheduledRide.deleteMany({ where: { memberId: { in: ids } } });
  await prisma.familyMember.deleteMany({ where: { memberId: { in: ids } } });
  await prisma.member.deleteMany({ where: { id: { in: ids } } });
}

async function main(): Promise<void> {
  await cleanup();
  const a = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-A`, fullName: "Sched A", phone: "+998900009001", trips: 3 } });

  // schedule gates
  ok((await createScheduled(a.id, 1, "BOZOR", new Date(Date.now() + 5 * 60_000).toISOString())).reason === "too_soon", `<15 min blocked`);
  ok((await createScheduled(a.id, 1, "BOZOR", "bularvaqtmas")).reason === "bad_time", `bad time blocked`);
  const s1 = await createScheduled(a.id, 1, "BOZOR", new Date(Date.now() + 30 * 60_000).toISOString());
  ok(s1.ok === true, `scheduled +30min created`);
  await createScheduled(a.id, 2, "RAVOT", new Date(Date.now() + 2 * 3600_000).toISOString());
  await createScheduled(a.id, 3, "ZARSAROY", new Date(Date.now() + 3 * 3600_000).toISOString());
  ok((await createScheduled(a.id, 4, "X", new Date(Date.now() + 4 * 3600_000).toISOString())).reason === "too_many", `max 3 pending`);
  ok((await listScheduled(a.id)).length === 3, `list shows 3`);

  // cancel
  const c = await cancelScheduled(a.id, s1.id!);
  ok(c.ok && (await listScheduled(a.id)).length === 2, `cancel works`);

  // dispatch: due ride (runAt within window) flips to dispatched, idempotent
  const due = await createScheduled(a.id, 5, "MARKAZ", new Date(Date.now() + 16 * 60_000).toISOString());
  // pull runAt into the dispatch window
  await prisma.scheduledRide.update({ where: { id: due.id! }, data: { runAt: new Date(Date.now() + 5 * 60_000) } });
  const fakeBot = { api: { sendMessage: async () => null } } as never;
  const n1 = await dispatchScheduled(fakeBot);
  const n2 = await dispatchScheduled(fakeBot);
  const row = await prisma.scheduledRide.findUnique({ where: { id: due.id! } });
  ok(n1 === 1 && n2 === 0 && row?.status === "dispatched", `dispatch claims once (dry-run), idempotent`);

  // family
  ok((await addFamily(a.id, "+998900009001", "Men")).reason === "self", `own phone blocked`);
  ok((await addFamily(a.id, "12", "X")).reason === "bad_phone", `bad phone blocked`);
  ok((await addFamily(a.id, "+998911112233", "Onam")).ok, `family added`);
  ok((await addFamily(a.id, "911112233", "Onam2")).reason === "already", `duplicate phone blocked`);
  await addFamily(a.id, "+998911112234", "Otam");
  await addFamily(a.id, "+998911112235", "Singlim");
  ok((await addFamily(a.id, "+998911112236", "X")).reason === "max", `max 3 family`);
  const fam = await familyOf(a.id);
  ok(fam.length === 3, `family list = 3`);

  // schedule FOR family: unknown phone rejected, listed phone ok
  ok((await createScheduled(a.id, 6, "BOZOR", new Date(Date.now() + 3600_000).toISOString(), "+998900000000")).reason === "not_family", `non-family target blocked`);
  const sf = await createScheduled(a.id, 6, "BOZOR", new Date(Date.now() + 3600_000).toISOString(), "+998911112233");
  ok(sf.ok === true, `scheduled for family member ok`);

  // immediate family booking (dry-run path)
  const fb = await bookForFamily(a.id, fam[0]!.id, 7, "MARKAZ");
  ok(fb.ok && fb.live === false, `family book dry-run ok`);
  ok(!(await bookForFamily(a.id, 999999, 7, "MARKAZ")).ok, `foreign family id rejected`);

  await cleanup();
  await prisma.$disconnect();
  console.log(failed === 0 ? "\n🎉 all scheduled/family checks passed" : `\n❌ ${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
