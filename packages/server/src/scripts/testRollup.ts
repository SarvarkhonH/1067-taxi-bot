// T8 — DailyStat rollup tests. Proves: (A) rollupRecentDays() writes today+yesterday
// and is monotonic (max-merge); (B) the read helpers + getOpsPulse "prev" +
// getNorthStar week/prevWeek source from DailyStat; (C) the prevAvailable flag is
// true with data and false without. Snapshot/restores the prev-week day rows so it
// never pollutes live DailyStat. Run: dotenv -e ../../.env -- tsx src/scripts/testRollup.ts
import "../env";
import { prisma } from "../db";
import { addDays, getDailyStat, rollupRecentDays, sumDailyRange, tashkentDay } from "../services/rollupService";
import { getOpsPulse } from "../services/adminModules";
import { getNorthStar } from "../services/analyticsService";

let failed = 0;
function ok(cond: boolean, label: string): void {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) failed++;
}

const today = tashkentDay();
// prev-week window getOpsPulse(today-7) + getNorthStar prevWeek (today-13..today-7) read;
// the rollup only ever writes today+yesterday, so seeding these is conflict-free.
const SEED = { completedRides: 10, cancelledRides: 2, botRides: 3, gmv: 50000 };
const testDays = Array.from({ length: 7 }, (_, i) => addDays(today, -(i + 7))); // today-7 .. today-13

async function main(): Promise<void> {
  // Snapshot EVERY day this test touches (today + yesterday for the write test,
  // plus the prev-week window for the read test) so it never pollutes live
  // DailyStat — critical if it ever runs under mock kas (would write mock data).
  const touched = [today, addDays(today, -1), ...testDays];
  const snapshot = new Map<string, Awaited<ReturnType<typeof getDailyStat>>>();
  for (const d of touched) snapshot.set(d, await getDailyStat(d));

  try {
    // ── A) rollup WRITE + monotonic max-merge (uses the live kas today window) ──
    console.log("── A) rollupRecentDays() write + max-merge ──");
    await rollupRecentDays();
    const t1 = await getDailyStat(today);
    ok(t1 !== null, "today DailyStat row written");
    ok((await getDailyStat(addDays(today, -1))) !== null, "yesterday DailyStat row written");
    await rollupRecentDays(); // second pass
    const t2 = await getDailyStat(today);
    ok(!!t1 && !!t2 && t2.completedRides >= t1.completedRides && t2.gmv >= t1.gmv, "max-merge monotonic (today never decreases)");

    // ── B) week-over-week reads from DailyStat (seeded) ──
    console.log("\n── B) week-over-week reads from DailyStat ──");
    for (const d of testDays) {
      await prisma.dailyStat.upsert({ where: { day: d }, create: { day: d, ...SEED }, update: { ...SEED } });
    }
    const seven = await getDailyStat(addDays(today, -7));
    ok(seven?.completedRides === 10, "getDailyStat(today-7) returns seeded row");

    const range = await sumDailyRange(addDays(today, -13), addDays(today, -7));
    ok(range.completedRides === 70 && range.days === 7, `sumDailyRange = 7×seed (got ${range.completedRides}/${range.days}d)`);

    const pulse = await getOpsPulse();
    const safar = pulse.metrics.find((m) => m.label === "Safarlar")!;
    const bot = pulse.metrics.find((m) => m.label === "Bot ulushi")!;
    const bekor = pulse.metrics.find((m) => m.label === "Bekor")!;
    ok(safar.prevAvailable === true, "pulse: prevAvailable=true when today-7 row exists");
    ok(safar.prev === 10, `pulse Safarlar.prev = seeded completedRides (got ${safar.prev})`);
    ok(bot.prev === 30, `pulse Bot ulushi.prev = pct(3,10)=30 (got ${bot.prev})`);
    ok(bekor.prev === 17, `pulse Bekor.prev = pct(2,12)=17 (got ${bekor.prev})`);

    const ns = await getNorthStar();
    ok(ns.prevWeekCompleted === 70, `northstar prevWeekCompleted = 70 (got ${ns.prevWeekCompleted})`);

    // ── C) prevAvailable=false when the day has no row ──
    console.log("\n── C) prevAvailable=false when the day has no row ──");
    await prisma.dailyStat.deleteMany({ where: { day: addDays(today, -7) } });
    const pulse2 = await getOpsPulse();
    ok(pulse2.metrics[0]!.prevAvailable === false, "pulse: prevAvailable=false when today-7 row absent");
  } finally {
    // restore exact prior state (delete if there was none) — never leave test data
    for (const d of touched) {
      const orig = snapshot.get(d) ?? null;
      if (orig) await prisma.dailyStat.upsert({ where: { day: d }, create: { day: d, ...orig }, update: { ...orig } });
      else await prisma.dailyStat.deleteMany({ where: { day: d } });
    }
    console.log("(restored all touched DailyStat rows)");
  }

  console.log(failed === 0 ? "\n🛡 ROLLUP: hamma tekshiruv o'tdi" : `\n❌ ${failed} ta tekshiruv yiqildi`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
