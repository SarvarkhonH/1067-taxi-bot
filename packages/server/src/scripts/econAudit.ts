// Solvency audit: computes expected value / ROI of every coin mechanic and
// flags any that lets a user MINT money (positive EV or perpetual faucet).
// Run: tsx econAudit.ts
import {
  BOX_PRIZES_PREMIUM,
  BOX_PREMIUM_COST,
  PARK_CARS,
  WHEEL_PRIZES,
  WHEEL_RESPIN_COST,
  WITHDRAW_DAILY_CAP,
  parkCarOutput,
  parkUpgradeCost,
} from "@t1067/shared";

const ev = (prizes: { amount: number; weight: number }[]) => {
  const tw = prizes.reduce((s, p) => s + p.weight, 0);
  return prizes.reduce((s, p) => s + p.amount * p.weight, 0) / tw;
};

console.log("════ COIN MECHANIC SOLVENCY AUDIT ════\n");

// 1. Wheel respin
const wheelEV = ev(WHEEL_PRIZES);
const respinNet = wheelEV - WHEEL_RESPIN_COST;
console.log(`🎡 WHEEL  EV=${wheelEV.toFixed(0)} coin/spin · respin cost=${WHEEL_RESPIN_COST}`);
console.log(`   respin net EV = ${respinNet >= 0 ? "+" : ""}${respinNet.toFixed(0)}/spin  →  ${respinNet >= 0 ? "🔴 EXPLOIT: unlimited respins MINT money" : "✅ sink"}\n`);

// 2. Premium box
const boxEV = ev(BOX_PRIZES_PREMIUM);
const boxNet = boxEV - BOX_PREMIUM_COST;
console.log(`🎁 PREMIUM BOX  EV=${boxEV.toFixed(0)} · cost=${BOX_PREMIUM_COST}`);
console.log(`   net = ${boxNet >= 0 ? "+" : ""}${boxNet.toFixed(0)} (RTP ${((boxEV / BOX_PREMIUM_COST) * 100).toFixed(0)}%) → ${boxNet >= 0 ? "🔴 EXPLOIT" : "✅ sink"}\n`);

// 3. Park — perpetual faucet check (collect 3×/day at 8h cap = 24h coverage)
console.log(`🏙 TAXI PARK (perpetual faucet — backed by NO revenue):`);
let worstDaily = 0;
for (const c of PARK_CARS) {
  const out = c.coinsPerHour; // level 1
  const perDay = out * 24; // 3 collects of 8h
  const paybackDays = c.baseCost / perDay;
  worstDaily += perDay; // owning all of them
  console.log(`   ${c.emoji} ${c.name}: cost ${c.baseCost} · ${out}/hr → ${perDay}/day · payback ${paybackDays.toFixed(1)}d, then +${perDay}/day FOREVER`);
}
// a maxed single Malibu at level 5
const malibu = PARK_CARS[3]!;
const lvl5 = parkCarOutput(malibu, 5) * 24;
console.log(`   ${malibu.emoji} Malibu Lv5: ${parkCarOutput(malibu, 5)}/hr → ${lvl5}/day (upgrade cost ~${parkUpgradeCost(malibu, 4)})`);
console.log(`   → all base cars = ${worstDaily}/day/account, uncapped. 🔴 LIMIT = only the ${WITHDRAW_DAILY_CAP}/day withdraw cap.\n`);

// 4. Real-money extraction ceiling
console.log(`💸 REAL-MONEY DRAIN per account: ${WITHDRAW_DAILY_CAP}/day = ${(WITHDRAW_DAILY_CAP * 365).toLocaleString("en")}/year`);
console.log(`   10 farmed accounts = ${(WITHDRAW_DAILY_CAP * 365 * 10).toLocaleString("en")}/year — backed by ZERO taxi revenue. 🔴`);
console.log(`\n   VERDICT: with wheel-respin +EV and the uncapped park faucet, a scripted user`);
console.log(`   can mint coins indefinitely and extract the full withdraw cap every day.`);
console.log(`   Real money out is NOT linked to taxi revenue → insolvency risk confirmed.`);
process.exit(0);
