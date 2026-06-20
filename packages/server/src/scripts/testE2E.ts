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
  "testReviseFixes.ts", // openBox crash-safe · claimMission no-double · dispatch atomic
  "testFeatureFlags.ts", // booking3 default-OFF safety (no row → off, not silent-live)
  "testRollup.ts", // DailyStat rollup + week-over-week reads (snapshot/restores its rows)
  "testAuthGate.ts", // admin auth (owner vs operator) + operator-token revoke
  "testCorpGuard.ts", // corp balance guard: NaN/0/over-debit rejected, never negative
  "testMarket.ts", // market buy/redeem + per-user-cap race (concurrent buys → 1 voucher)
  "testTolqin.ts", // V4 game: tanga-only daily cap holds, one-time token, idempotent
  "testGaraj.ts", // 🏆 GARAJ v2: kill-switch · idempotent acquire/diagnose/repair · flip outside clamp · B4 daily cap · ledger
  "testRecruitFeedback.ts", // 🚖 QR recruit: fresh scan attaches (+driver notify), existing user ignored, pending count
  "testSelfRegister.ts", // 🆕 self-register (non-kas phone) + adopt-in-place reconciliation (no dup, tangas kept, withdraw gated)
  "testVerifyCode.ts", // 🔑 4-digit link code: single-use, rate-limit lock (no brute-force), TTL expiry
  "testAdminUsers.ts", // 👑 admin user mgmt: search all accounts · re-link (taken-guard) · unlink
  "testPayDriver.ts", // 🚖 Mini App pay-driver-by-car: plate lookup (normalized) + tip transfer + self-guard
  "testDriverWallet.ts", // 🚗 driver wallet: driver withdraws tanga→kas balance, topup stays client-only (no swap)
  "testDriverMissions.ts", // 🎯 driver missions: live ride-count progress · idempotent daily claim · reward cap · client sees none
  "testAdminGrantCoins.ts", // 🪙 admin grant TANGA by exact account id (driver vs same-phone client) · deduct clamps to 0
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
