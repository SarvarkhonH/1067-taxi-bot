// "Yana shu yo'l" (NEXT_LEVEL_PLAN 1.1) — recent-pickup chip list tests.
// Run: dotenv -e ../../.env -- tsx src/scripts/testRecentPickups.ts
import "../env";
import { prisma } from "../db";
import { getRecentPickups, rememberPickup } from "../services/bookingService";

const TAG = "recentpk-test";
let failed = 0;
function ok(cond: boolean, label: string): void {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) failed++;
}

async function main(): Promise<void> {
  await prisma.member.deleteMany({ where: { kasId: { startsWith: TAG } } });
  const m = await prisma.member.create({
    data: { type: "client", kasId: `${TAG}-1`, fullName: "RecentPk Test", phone: "+998900000888" },
  });

  // empty at first
  let r = await getRecentPickups(m.id);
  ok(r.length === 0, `no rides yet → empty list (${r.length})`);

  // 3 distinct pickups → all 3 kept, most-recent-first
  await rememberPickup(m.id, { id: 1, name: "Uy", lat: 39.0, lng: 65.5 });
  await rememberPickup(m.id, { id: 2, name: "Ish", lat: 39.1, lng: 65.6 });
  await rememberPickup(m.id, { id: 3, name: "Bozor", lat: 39.2, lng: 65.7 });
  r = await getRecentPickups(m.id);
  ok(r.length === 3, `3 distinct pickups → 3 kept (${r.length})`);
  ok(r[0]?.name === "Bozor" && r[1]?.name === "Ish" && r[2]?.name === "Uy", `most-recent-first order (${r.map((a) => a.name).join(",")})`);

  // 4th distinct pickup → cap at 3, oldest ("Uy") evicted
  await rememberPickup(m.id, { id: 4, name: "Stadion", lat: 39.3, lng: 65.8 });
  r = await getRecentPickups(m.id);
  ok(r.length === 3, `capped at 3 (${r.length})`);
  ok(r.map((a) => a.name).join(",") === "Stadion,Bozor,Ish", `oldest evicted, order correct (${r.map((a) => a.name).join(",")})`);
  ok(!r.some((a) => a.name === "Uy"), `evicted entry ("Uy") really gone`);

  // repeat an existing pickup (by id) → moves to front, no duplicate, still 3 total
  await rememberPickup(m.id, { id: 2, name: "Ish", lat: 39.1, lng: 65.6 });
  r = await getRecentPickups(m.id);
  ok(r.length === 3, `re-dispatch to known id → still capped at 3 (${r.length})`);
  ok(r[0]?.name === "Ish", `re-dispatched pickup moved to front (${r[0]?.name})`);
  ok(r.filter((a) => a.id === 2).length === 1, `no duplicate entry for id=2`);

  // raw map pin (id=0) dedup by NAME, not id (every pin shares id 0)
  await prisma.member.update({ where: { id: m.id }, data: { recentPickupsJson: null } });
  await rememberPickup(m.id, { id: 0, name: "Xaritada belgilangan nuqta A", lat: 39.4, lng: 65.9 });
  await rememberPickup(m.id, { id: 0, name: "Xaritada belgilangan nuqta A", lat: 39.4, lng: 65.9 }); // same name, id=0 → dedup
  await rememberPickup(m.id, { id: 0, name: "Xaritada belgilangan nuqta B", lat: 39.5, lng: 66.0 });
  r = await getRecentPickups(m.id);
  ok(r.length === 2, `id=0 pins dedup by name, not id (${r.length})`);

  await prisma.member.deleteMany({ where: { kasId: { startsWith: TAG } } });
  console.log(failed ? `\n❌ ${failed} FAIL` : "\n✅ ALL PASS");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
