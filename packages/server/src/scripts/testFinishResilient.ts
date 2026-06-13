// T3 ISOLATSIYA-ISBOTI: finish-sweep'ning resilient() helperini bevosita sinash.
// Maqsad: transient'da RETRY qiladi, doimiy xatoda LOG+undefined (yutish YO'Q),
// transient-bo'lmagan xatoda darhol log (retry yo'q). Bu DB'siz, sof birlik-test.
// Run: tsx src/scripts/testFinishResilient.ts
import { isTransient, resilient } from "../services/bookingNotifier";

let failed = 0;
function ok(c: boolean, label: string): void {
  console.log(`${c ? "✅" : "❌"} ${label}`);
  if (!c) failed++;
}

async function main(): Promise<void> {
  // 1) isTransient ajratadi: P1001/connection = transient, mantiqiy xato = emas
  ok(isTransient("PrismaClientInitializationError ... P1001 can't reach database"), "P1001 = transient");
  ok(isTransient("Error: ECONNRESET"), "ECONNRESET = transient");
  ok(!isTransient("TypeError: x is undefined"), "mantiqiy xato = transient EMAS");
  ok(!isTransient("assert failed: expected 1 got 2"), "assert-fail = transient EMAS");

  // 2) transient×2 keyin muvaffaqiyat → resilient RETRY qiladi va qiymat qaytaradi
  let calls = 0;
  const r1 = await resilient("test-transient-then-ok", async () => {
    calls++;
    if (calls < 3) throw new Error("P1001 can't reach database");
    return 42;
  });
  ok(r1 === 42 && calls === 3, `transient×2 → 3-urinishda muvaffaqiyat (qiymat ${r1}, urinish ${calls})`);

  // 3) DOIMIY transient → 3 urinishdan keyin undefined (yutilmaydi — log chiqadi)
  let calls2 = 0;
  console.log("  ↓ kutilgan: [finish] ... failed log (yutilmagani isboti):");
  const r2 = await resilient("test-always-transient", async () => {
    calls2++;
    throw new Error("P1017 connection terminated");
  });
  ok(r2 === undefined && calls2 === 3, `doimiy transient → 3 urinish + undefined (urinish ${calls2}) — JIM EMAS, log chiqdi`);

  // 4) transient-BO'LMAGAN xato → darhol undefined (retry YO'Q, 1 urinish)
  let calls3 = 0;
  console.log("  ↓ kutilgan: [finish] ... failed log (mantiqiy xato, retry yo'q):");
  const r3 = await resilient("test-logic-error", async () => {
    calls3++;
    throw new Error("TypeError: cannot read property");
  });
  ok(r3 === undefined && calls3 === 1, `mantiqiy xato → 1 urinish, retry YO'Q (urinish ${calls3})`);

  console.log(failed === 0 ? "\n🛡 resilient() isbotlandi: transient-retry + log (yutish yo'q) + mantiqiy-xato darhol" : `\n❌ ${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
