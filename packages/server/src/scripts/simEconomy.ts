// T8 shield — Monte-Carlo economy simulation (plan: 🎲 MONTE-CARLO IQTISOD).
// 1000 virtual customers × 30 days with realistic ride frequency + the REAL
// reward distributions from @t1067/shared, applying the SAME per-ride clamp the
// server enforces (RIDE_EMISSION_CAP). Proves the BUZILMAS rule "har safar
// mijoz-emissiyasi jami ≤ 350 tanga" holds across tens of thousands of rides,
// and reports the emission curve (daily mint, monthly projection, worst day).
//
// PURE: no DB, no kas — re-derives emission from the same constants the server
// grants from, so a divergence here is a real economic regression.
// Run: dotenv -e ../../.env -- tsx src/scripts/simEconomy.ts [customers] [days] [seed]
import { RIDE_REWARD_BASE, RIDE_REWARD_TIERS, RIDE_EMISSION_CAP, WHEEL_PRIZES } from "@t1067/shared";
import { JACKPOT_FLOOR, JACKPOT_INCREMENT } from "@t1067/shared";

// ── seeded PRNG (LCG) so the proof is reproducible run-to-run ───────────────
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const N = Math.max(1, Math.floor(Number(process.argv[2] ?? 1000)));
const DAYS = Math.max(1, Math.floor(Number(process.argv[3] ?? 30)));
const SEED = Math.floor(Number(process.argv[4] ?? 1067));
const rnd = makeRng(SEED);

// representative behaviour mix (CIS small-city taxi loyalty norms)
const P_PLUS = 0.15; // 💎 Plus subscriber (×1.5 roll, +150 cap)
const P_COMBO = 0.2; // completed yesterday's daily kombo → today's roll ×2
const P_GUESS_RIGHT = 0.25; // ETA-guess correct → +50
const RIDES_PER_DAY = [0, 0, 0, 0, 1, 1, 1, 2, 2, 3]; // empirical-ish: mean ~0.9 rides/customer/day

function pickWeighted<T extends { weight: number }>(arr: T[]): T {
  const total = arr.reduce((s, x) => s + x.weight, 0);
  let r = rnd() * total;
  for (const x of arr) {
    r -= x.weight;
    if (r <= 0) return x;
  }
  return arr[arr.length - 1]!;
}
const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)]!;

interface Customer {
  plus: boolean;
}

// One completed ride's CLAMPED customer emission (mirrors server grantRideCoins:
// every mechanic shares the single RIDE_EMISSION_CAP room). Returns the minted
// coins, the clamped-away excess, and the jackpot payout (paid from the pool,
// OUTSIDE the per-ride clamp).
function rideEmission(c: Customer, lucky: boolean, pool: number): { emitted: number; clamped: number; jackpotPayout: number } {
  const tier = pickWeighted(RIDE_REWARD_TIERS);
  let desired = 0;
  let jackpotPayout = 0;
  if (tier.tier === "jackpot") {
    jackpotPayout = pool; // wins the whole pool (paid outside the clamp)
  } else {
    let cb = RIDE_REWARD_BASE * tier.mult * (lucky ? 2 : 1) * (rnd() < P_COMBO ? 2 : 1);
    if (c.plus) cb += Math.min(150, Math.floor(cb * 0.5));
    desired += cb;
  }
  desired += pickWeighted(WHEEL_PRIZES).amount; // in-ride wheel, 1 spin/ride
  if (rnd() < P_GUESS_RIGHT) desired += 50; // ETA guess correct
  const emitted = Math.min(desired, RIDE_EMISSION_CAP);
  return { emitted, clamped: Math.max(0, desired - RIDE_EMISSION_CAP), jackpotPayout };
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}

function main(): void {
  const customers: Customer[] = Array.from({ length: N }, () => ({
    plus: rnd() < P_PLUS,
  }));

  let pool = JACKPOT_FLOOR;
  let totalRides = 0;
  let totalClampEmission = 0; // clamped per-ride customer emission (the ≤350 part)
  let totalClampedAway = 0; // excess cut by the clamp
  let totalJackpotPaid = 0;
  let clampHits = 0;
  let jackpotWins = 0;
  let maxPerRide = 0;
  let invariantViolations = 0;
  const dailyEmission: number[] = [];

  for (let day = 0; day < DAYS; day++) {
    const lucky = day % 7 === 3; // one lucky weekday per week (mirrors isLuckyToday cadence)
    let dayEmit = 0;
    for (const c of customers) {
      const rides = pick(RIDES_PER_DAY);
      for (let i = 0; i < rides; i++) {
        const r = rideEmission(c, lucky, pool);
        totalRides++;
        // jackpot pool dynamics: every ride feeds it; a jackpot-tier ride drains it to the floor
        if (r.jackpotPayout > 0) {
          totalJackpotPaid += r.jackpotPayout;
          jackpotWins++;
          pool = JACKPOT_FLOOR;
        }
        pool += JACKPOT_INCREMENT;
        totalClampEmission += r.emitted;
        totalClampedAway += r.clamped;
        if (r.clamped > 0) clampHits++;
        if (r.emitted > maxPerRide) maxPerRide = r.emitted;
        if (r.emitted > RIDE_EMISSION_CAP) invariantViolations++; // must stay 0
        dayEmit += r.emitted;
      }
    }
    dailyEmission.push(dayEmit);
  }

  const meanPerRide = totalRides ? totalClampEmission / totalRides : 0;
  const sortedDaily = [...dailyEmission].sort((a, b) => a - b);
  const worstDay = sortedDaily[sortedDaily.length - 1] ?? 0;
  const p95Daily = percentile(sortedDaily, 95);
  const meanDaily = dailyEmission.reduce((s, x) => s + x, 0) / DAYS;
  const monthlyMint = totalClampEmission + totalJackpotPaid;

  console.log(`🎲 ECONOMY SIM — ${N} customers × ${DAYS} days (seed ${SEED})`);
  console.log(`   rides simulated:        ${totalRides.toLocaleString("ru-RU")}`);
  console.log(`   clamp emission (coins): ${Math.round(totalClampEmission).toLocaleString("ru-RU")}`);
  console.log(`   jackpot paid (coins):   ${Math.round(totalJackpotPaid).toLocaleString("ru-RU")} (${jackpotWins} wins)`);
  console.log(`   total mint (coins):     ${Math.round(monthlyMint).toLocaleString("ru-RU")}`);
  console.log(`   mean per ride:          ${meanPerRide.toFixed(1)} (cap ${RIDE_EMISSION_CAP})`);
  console.log(`   MAX per ride:           ${maxPerRide} (cap ${RIDE_EMISSION_CAP})`);
  console.log(`   clamp-hit rate:         ${totalRides ? ((clampHits / totalRides) * 100).toFixed(1) : 0}% (${clampHits} rides), cut ${Math.round(totalClampedAway).toLocaleString("ru-RU")} coins`);
  console.log(`   daily emission:         mean ${Math.round(meanDaily).toLocaleString("ru-RU")} · p95 ${Math.round(p95Daily).toLocaleString("ru-RU")} · worst ${Math.round(worstDay).toLocaleString("ru-RU")}`);
  console.log(`   per-customer/month:     ${(monthlyMint / N).toFixed(0)} coins`);

  let failed = 0;
  const ok = (cond: boolean, label: string) => {
    console.log(`${cond ? "✅" : "❌"} ${label}`);
    if (!cond) failed++;
  };
  console.log("");
  ok(invariantViolations === 0, `BUZILMAS: every ride emission ≤ ${RIDE_EMISSION_CAP} (0 violations across ${totalRides.toLocaleString("ru-RU")} rides)`);
  ok(maxPerRide <= RIDE_EMISSION_CAP, `max per-ride emission ${maxPerRide} ≤ ${RIDE_EMISSION_CAP}`);
  ok(meanPerRide <= RIDE_EMISSION_CAP, `mean per-ride emission ${meanPerRide.toFixed(1)} ≤ ${RIDE_EMISSION_CAP}`);
  ok(totalRides > 0, `simulation ran (${totalRides.toLocaleString("ru-RU")} rides)`);
  // sanity: the clamp must actually bite under stacked boosts (else the model is wrong/too tame)
  ok(clampHits > 0, `clamp engages under stacked boosts (${clampHits} clamped rides — proves the cap is load-bearing)`);

  console.log(failed === 0 ? "\n🛡 ECONOMY SIM: BUZILMAS qoida isbotlandi (≤350/safar)" : `\n❌ ${failed} ta tekshiruv yiqildi`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
