// T8 shield — nightly self-check tests. Proves the RED-detection logic FIRES on
// each money invariant (synthetic inputs) + the live gather returns a sane report.
// Run: dotenv -e ../../.env -- tsx src/scripts/testSelfCheck.ts
import "../env";
import { classifySelfCheck, runSelfCheck, type SelfCheckInputs } from "../services/selfCheck";

let failed = 0;
function ok(cond: boolean, label: string): void {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) failed++;
}

const HEALTHY: SelfCheckInputs = {
  driftCount: 0,
  driftTotal: 0,
  negative: 0,
  withdrawRemaining: 50000,
  emissionToday: 5000,
  emissionCapDay: 200000,
  redAlerts: [],
  anomalyCount: 0,
  pending: 0,
};

async function main(): Promise<void> {
  console.log("── classifySelfCheck (synthetic — proves RED detection) ──");
  ok(classifySelfCheck(HEALTHY).red === false, "healthy → red=false, no issues");
  ok(classifySelfCheck(HEALTHY).issues.length === 0, "healthy → 0 issues");

  const drift = classifySelfCheck({ ...HEALTHY, driftCount: 3, driftTotal: 900 });
  ok(drift.red && drift.issues.some((i) => i.includes("drift")), "ledger drift → RED");

  ok(classifySelfCheck({ ...HEALTHY, negative: 2 }).red, "negative balance → RED");
  ok(classifySelfCheck({ ...HEALTHY, withdrawRemaining: -1 }).red, "over withdraw budget → RED");
  ok(classifySelfCheck({ ...HEALTHY, emissionToday: 200000, emissionCapDay: 200000 }).red, "emission at cap → RED");

  const alerted = classifySelfCheck({ ...HEALTHY, redAlerts: ["6 ta buyurtma haydovchisiz"] });
  ok(alerted.red && alerted.issues.some((i) => i.includes("haydovchisiz")), "red ops alert → RED issue");

  const noted = classifySelfCheck({ ...HEALTHY, anomalyCount: 1, pending: 2 });
  ok(noted.red === false && noted.notes.length === 2, "anomaly + pending → NOTES, not RED");

  console.log("\n── runSelfCheck (live gather — shape + consistency) ──");
  const r = await runSelfCheck();
  console.log(r.digest);
  ok(typeof r.digest === "string" && r.digest.length > 0, "live: digest non-empty");
  ok(r.red === (r.issues.length > 0), "live: red === (issues>0)");
  ok([r.driftCount, r.negativeBalances, r.coinLiability, r.emissionToday, r.withdrawRemaining, r.stuckPending].every(Number.isFinite), "live: all metrics finite");
  ok(r.emissionCapDay > 0, "live: emission cap > 0");

  console.log(failed === 0 ? "\n🛡 SELF-CHECK: hamma tekshiruv o'tdi" : `\n❌ ${failed} ta tekshiruv yiqildi`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
