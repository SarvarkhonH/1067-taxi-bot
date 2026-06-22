// Pure money-math proof for the transfer/fare commission (no DB). Run:
//   pnpm --filter ./packages/server exec tsx src/scripts/testTransferFee.ts
import { computeTransferFee } from "@t1067/shared";

let pass = 0, fail = 0;
function eq(label: string, got: unknown, want: unknown): void {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}  got=${JSON.stringify(got)}${ok ? "" : ` want=${JSON.stringify(want)}`}`);
  ok ? pass++ : fail++;
}

// DARK (komissiya off): NO fee — recipient gets the full amount, sender pays exactly amount
eq("dark 1000 → no fee", computeTransferFee(1000, 1, false), { burn: 0, commission: 0, received: 1000, charged: 1000 });
// LIVE 1% friend 1000: +10 on the SENDER, recipient gets the FULL 1000, platform earns 10
eq("live 1% 1000 → +1% sender", computeTransferFee(1000, 1, true), { burn: 0, commission: 10, received: 1000, charged: 1010 });
// THE fare example: 20 000 @1% → driver gets the full 20 000, rider charged 20 200, platform 200
eq("fare 20000 @1%", computeTransferFee(20000, 1, true), { burn: 0, commission: 200, received: 20000, charged: 20200 });
// commission floors (never over-charges): 999 @1% = 9.99 → 9
eq("floor 999 @1%", computeTransferFee(999, 1, true), { burn: 0, commission: 9, received: 999, charged: 1008 });
// rate 0 → no fee
eq("live 0%", computeTransferFee(5000, 0, true), { burn: 0, commission: 0, received: 5000, charged: 5000 });

// invariant: charged == received + commission, recipient always gets the full amount, sender never underpays
const cases: [number, number, boolean][] = [[1234, 1, true], [5000, 2.5, true], [7777, 0, false], [20000, 1, true], [333, 1, false], [200000, 3, true]];
for (const [amt, pct, on] of cases) {
  const f = computeTransferFee(amt, pct, on);
  eq(`invariant ${amt}/${pct}%/${on}`, f.charged === f.received + f.commission && f.received === amt && f.charged >= amt, true);
}

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
