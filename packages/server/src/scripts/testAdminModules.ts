// T7 Admin 3.0 — prove the two new read-only aggregates return sane, real data.
// READ-ONLY: getOpsPulse / getFinance never mutate — no cleanup/snapshot needed.
// Run: dotenv -e ../../.env -- tsx src/scripts/testAdminModules.ts
import "../env";
import { getOpsPulse, getFinance } from "../services/adminModules";

let failed = 0;
function ok(cond: boolean, label: string): void {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) failed++;
}

async function main(): Promise<void> {
  console.log("── M1 getOpsPulse() ──");
  const p = await getOpsPulse();
  console.log(JSON.stringify({ weekday: p.weekday, metrics: p.metrics, activeNow: p.activeNow, unassigned: p.unassigned, emissionToday: p.emissionToday, alerts: p.alerts.length, reportsStale: p.reportsStale }, null, 2));
  ok(typeof p.weekday === "string" && p.weekday.length > 0, "pulse: weekday set");
  ok(p.metrics.length === 3, "pulse: 3 metrics (Safarlar/Bot ulushi/Bekor)");
  ok(p.metrics.every((m) => Number.isFinite(m.today) && Number.isFinite(m.prev) && (m.unit === "count" || m.unit === "pct") && (m.goodWhen === "up" || m.goodWhen === "down")), "pulse: every metric well-formed");
  ok(p.metrics.some((m) => m.label === "Safarlar") && p.metrics.some((m) => m.label === "Bot ulushi") && p.metrics.some((m) => m.label === "Bekor"), "pulse: expected metric labels");
  ok(p.activeNow >= 0 && p.unassigned >= 0 && p.unassigned <= p.activeNow, "pulse: unassigned in [0, activeNow]");
  const botShare = p.metrics.find((m) => m.label === "Bot ulushi")!;
  ok(botShare.today >= 0 && botShare.today <= 100, "pulse: bot-share % in [0,100]");
  const cancel = p.metrics.find((m) => m.label === "Bekor")!;
  ok(cancel.today >= 0 && cancel.today <= 100, "pulse: cancel % in [0,100]");
  ok(p.emissionToday >= 0 && p.emissionCapDay > 0, "pulse: emissionToday>=0, cap>0");
  ok(Array.isArray(p.alerts) && p.alerts.every((a) => (a.level === "red" || a.level === "amber") && a.text.length > 0), "pulse: alerts well-formed");

  console.log("\n── M2 getFinance() ──");
  const f = await getFinance();
  console.log(JSON.stringify({ coinLiability: f.coinLiability, byKind: f.liabilityByKind.length, withdrawnToday: f.withdrawnToday, withdrawnTotal: f.withdrawnTotal, budgetRemaining: f.withdrawBudget.remaining, gmvToday: f.gmvToday, gmvWeek: f.gmvWeek, daysToCover: f.daysToCoverLiability, queue: f.withdrawQueue.length, corps: f.corpBalances.length, corpTotal: f.corpTotal }, null, 2));
  ok(Number.isFinite(f.coinLiability) && f.coinLiability >= 0, "finance: coinLiability >= 0");
  ok(f.liabilityByKind.every((k) => k.total > 0), "finance: liabilityByKind are emitters (total>0)");
  ok(f.withdrawnToday >= 0 && f.withdrawnTotal >= 0 && f.withdrawnToday <= f.withdrawnTotal + 1, "finance: 0 <= withdrawnToday <= withdrawnTotal");
  ok(f.withdrawBudget.total >= 0 && f.withdrawBudget.remaining <= f.withdrawBudget.total, "finance: budget remaining <= total");
  ok(f.gmvToday >= 0 && f.gmvWeek >= 0 && f.gmvToday <= f.gmvWeek + 1, "finance: 0 <= gmvToday <= gmvWeek");
  ok(f.daysToCoverLiability === null || f.daysToCoverLiability >= 0, "finance: daysToCover null or >=0");
  ok(Array.isArray(f.withdrawQueue) && f.withdrawQueue.every((w) => w.failed === true && Number.isFinite(w.amount)), "finance: withdrawQueue are failed cashouts");
  ok(Math.abs(f.corpTotal - f.corpBalances.reduce((s, c) => s + c.balance, 0)) < 0.5, "finance: corpTotal == Σ balances");

  console.log(failed === 0 ? "\n🖥 T7 ADMIN MODULES: hamma tekshiruv o'tdi" : `\n❌ ${failed} ta tekshiruv yiqildi`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
