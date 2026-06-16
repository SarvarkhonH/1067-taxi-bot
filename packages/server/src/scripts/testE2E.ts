// T8 shield — E2E suite runner. Runs the money/logic-critical suites in sequence,
// aggregates pass/fail (CONTINUES on failure so every break is visible in one run),
// exits non-zero if any suite fails. This is the gate a release runs end-to-end.
// Run: dotenv -e ../../.env -- tsx src/scripts/testE2E.ts
import { execSync } from "node:child_process";

// Curated shield-critical suites. simEconomy is pure (no DB); the rest hit live
// Neon and self-clean their TAG'd rows. The whole gate runs with KAS_MODE=mock +
// BOOKING_LIVE=false so it proves the LOGIC deterministically — synthetic test
// members are NOT real kas clients, so a live kas would reject their withdraw/
// booking calls (kas_failed) and make the gate flap on kas reachability rather
// than on real regressions. Live-kas health is watched separately (selfCheck +
// admin health pill).
const SUITES = [
  "simEconomy.ts", // pure economy invariant (≤350/ride) — no DB
  "testMoneyShield.ts", // money races · idempotency · clamp · ledger invariants
  "testRaceFixes.ts", // concurrent grant / kill-switch / jackpot pool
  "testWithdrawRace.ts", // withdraw daily-cap race
  "testPhantomRide.ts", // phantom/cancel finish · rateRide ownership · finish-card idempotency
  "testAdminModules.ts", // T7 read-only aggregates (pulse + finance)
  "testAuthGate.ts", // admin auth (owner vs operator)
];

interface Res {
  suite: string;
  ok: boolean;
  ms: number;
  tail: string;
}
const results: Res[] = [];

for (const suite of SUITES) {
  const t0 = Date.now();
  let ok = true;
  let tail = "";
  try {
    const out = execSync(`pnpm exec tsx src/scripts/${suite}`, {
      cwd: process.cwd(),
      env: { ...process.env, KAS_MODE: "mock", BOOKING_LIVE: "false" },
      encoding: "utf8",
      timeout: 240_000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    tail = out.trim().split("\n").slice(-1).join(" ");
  } catch (e) {
    ok = false;
    const err = e as { stdout?: string; stderr?: string; message?: string };
    tail = ((err.stdout ?? "") + (err.stderr ?? "")).trim().split("\n").slice(-2).join(" | ") || err.message || "failed";
  }
  const ms = Date.now() - t0;
  results.push({ suite, ok, ms, tail });
  console.log(`${ok ? "✅" : "❌"} ${suite.padEnd(22)} ${(ms / 1000).toFixed(1)}s — ${tail}`);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n🛡 E2E SHIELD: ${results.length - failed.length}/${results.length} suite o'tdi`);
if (failed.length) console.log(`   yiqilganlar: ${failed.map((r) => r.suite).join(", ")}`);
process.exit(failed.length === 0 ? 0 : 1);
