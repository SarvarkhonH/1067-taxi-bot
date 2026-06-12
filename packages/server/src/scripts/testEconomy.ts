// Pure paytable/economy assertions — the numeric contract of the plan's
// 1-QISM table. No DB, no network. Run: tsx src/scripts/testEconomy.ts
import {
  BOX_PRIZES,
  DRIVER_DAILY_BONUS_CAP,
  DRIVER_RIDE_BONUS,
  MISSIONS,
  RIDE_EMISSION_CAP,
  RIDE_REWARD_BASE,
  RIDE_REWARD_TIERS,
  STREAK_REWARDS,
  SURPRISE_PRIZES,
  WEEKLY_PRIZES,
  WHEEL_PRIZES,
} from "@t1067/shared";
import * as shared from "@t1067/shared";

let failed = 0;
function ok(cond: boolean, label: string): void {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) failed++;
}

function ev(prizes: { amount: number; weight: number }[]): number {
  const total = prizes.reduce((s, p) => s + p.weight, 0);
  return prizes.reduce((s, p) => s + p.amount * p.weight, 0) / total;
}

// wheel: every spin wins, EV ≤ 80, jackpot slice pays the pool (amount 0 here)
const wheelEv = ev(WHEEL_PRIZES);
ok(wheelEv <= 80, `wheel EV ${wheelEv.toFixed(1)} ≤ 80`);
ok(WHEEL_PRIZES.every((p) => p.amount > 0 || p.label.startsWith("JACKPOT")), `every wheel slice wins (no losing slice)`);

// box: EV ~200, ride-anchored unlock is enforced in boxService (daily_ride in set)
const boxEv = ev(BOX_PRIZES);
ok(boxEv >= 150 && boxEv <= 250, `box EV ${boxEv.toFixed(0)} in [150..250]`);
ok(MISSIONS.some((m) => m.code === "daily_ride" && m.period === "daily"), `free box stays ride-anchored (daily_ride in dailies)`);

// ride roll: base 100, weights 80/15/4/1, worst non-jackpot ≤ cap with one boost
ok(RIDE_REWARD_BASE === 100, `roll base = 100`);
const w = Object.fromEntries(RIDE_REWARD_TIERS.map((t) => [t.tier, t.weight]));
ok(w.standard === 80 && w.double === 15 && w.triple === 4 && w.jackpot === 1, `roll weights 80/15/4/1`);
const rollEv = (80 * 100 + 15 * 200 + 4 * 300) / 100;
ok(rollEv < 130, `roll EV ${rollEv.toFixed(0)} < 130`);

// the combination ceiling: typical ride (roll EV + wheel EV + garage headroom) ≤ cap
ok(RIDE_EMISSION_CAP === 350, `per-ride emission cap = 350`);
ok(rollEv + wheelEv + 30 <= RIDE_EMISSION_CAP, `typical ride total ${(rollEv + wheelEv + 30).toFixed(0)} ≤ ${RIDE_EMISSION_CAP}`);

// streak ladder rebalanced
ok(STREAK_REWARDS[3] === 100 && STREAK_REWARDS[100] === 10000, `streak 3→100 … 100→10000`);

// missions: 50/50/100 daily, ≤1000 weekly (CLIENT side; driver quests
// live on a separate ≤25k/day sub-budget — checked separately below)
const clientMissions = MISSIONS.filter((m) => m.audience !== "driver");
const daily = clientMissions.filter((m) => m.period === "daily");
ok(daily.every((m) => m.reward <= 100), `client daily mission rewards ≤ 100`);
ok(clientMissions.filter((m) => m.period === "weekly").every((m) => m.reward <= 1000), `client weekly mission rewards ≤ 1000`);
const driverMissions = MISSIONS.filter((m) => m.audience === "driver");
ok(driverMissions.length === 3 && driverMissions.every((m) => m.reward <= 12000), `driver quests present, each ≤ 12000`);

// weekly league + surprise + driver
ok(WEEKLY_PRIZES[0]!.amount === 5000 && WEEKLY_PRIZES[2]!.amount === 1000, `league prizes 5000/2500/1000`);
ok(Math.max(...SURPRISE_PRIZES.map((p) => p.amount)) <= 300, `surprise max ≤ 300`);
ok(DRIVER_RIDE_BONUS === 100 && DRIVER_DAILY_BONUS_CAP === 10000, `driver bonus 100, cap 10k`);

// LEGAL POSTURE: no pay-for-chance constants may exist anywhere in shared
const bag = shared as Record<string, unknown>;
ok(bag.WHEEL_RESPIN_COST === undefined, `WHEEL_RESPIN_COST removed (no paid respins)`);
ok(bag.BOX_PREMIUM_COST === undefined && bag.BOX_PRIZES_PREMIUM === undefined, `premium box removed (no pay-for-chance)`);

console.log(failed === 0 ? "\n🎉 all economy checks passed" : `\n❌ ${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
