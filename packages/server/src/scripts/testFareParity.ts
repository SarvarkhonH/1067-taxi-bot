// Bosqich 1: Fare-parity DTO surfacing. The kas driver app's BookingDto carries three stacked
// surcharges (additionalPaymentAddress/Client/Company) that the rider-app surface used to drop.
// This test proves they reach ActiveBooking + RideHistoryItem (the two consumer-facing shapes)
// AND that the existing fields are unaffected (payment/cashback unchanged → no double-counting,
// no cashback math drift). KAS_MODE=mock so the mock source is exercised end-to-end.
//
// Run: KAS_MODE=mock dotenv -e ../../.env -- tsx src/scripts/testFareParity.ts
import "../env";
import { getDataSource } from "../kas";

let failed = 0;
const ok = (c: boolean, l: string): void => { console.log(`${c ? "✅" : "❌"} ${l}`); if (!c) failed++; };

async function main(): Promise<void> {
  const kas = getDataSource();
  ok(kas.name === "mock", `KAS_MODE=mock (got "${kas.name}")`);

  // ── ActiveBooking surface ───────────────────────────────────────────────────
  const active = await kas.getActiveBooking("+998900000001");
  ok(!!active, "active booking present");
  ok(active?.additionalPaymentAddress === 2000, `addressAdd: 2000 expected, got ${active?.additionalPaymentAddress}`);
  ok(active?.additionalPaymentClient === 0 || active?.additionalPaymentClient === undefined, `clientAdd: 0/undefined, got ${active?.additionalPaymentClient}`);
  ok(active?.additionalPaymentCompany === 500, `companyAdd: 500 expected, got ${active?.additionalPaymentCompany}`);
  ok(active?.clientBonus === 500, `existing clientBonus untouched: ${active?.clientBonus}`);

  // ── Driver-side ride history (getRidesByCar) surface ───────────────────────
  const driverRides = await kas.getRidesByCar("01A111AA");
  ok(driverRides.length === 2, `mock returns 2 driven rides (got ${driverRides.length})`);
  const top = driverRides[0];
  ok(top?.payment === 14000, `payment unchanged: 14000 (got ${top?.payment}) — no double-count`);
  ok(top?.additionalPaymentAddress === 2500, `Koson bozori addressAdd: 2500 (got ${top?.additionalPaymentAddress})`);
  ok(top?.additionalPaymentCompany === 700, `companyAdd: 700 (got ${top?.additionalPaymentCompany})`);
  ok(top?.additionalPaymentClient === undefined, `clientAdd absent (no surcharge in mock)`);

  // ── Driver-side take-home math (the whole point of surfacing companyAdd) ────
  const takeHome = (top?.payment ?? 0) - (top?.additionalPaymentCompany ?? 0);
  ok(takeHome === 13300, `take-home = payment − companyCommission: 14000-700=13300 (got ${takeHome})`);

  // ── Rider-side history (getRideHistory) surface ────────────────────────────
  const riderHistory = await kas.getRideHistory("+998971112201");
  ok(riderHistory.length >= 1, `rider history non-empty (got ${riderHistory.length})`);
  // mock getRideHistory entries don't have surcharge data; assert pass-through default is `undefined`
  ok(riderHistory[0]?.additionalPaymentAddress === undefined, `getRideHistory mock omits surcharges → undefined (no fake 0)`);

  // ── reportsPage (admin analytics surface) ──────────────────────────────────
  const reports = await kas.getReportsPage(0, 10);
  ok(reports.length === 3, `getReportsPage returns 3 mock rides (got ${reports.length})`);
  ok(reports.every((r) => typeof r.payment === "number"), `payment is number across reports`);

  console.log(failed ? `\n❌ ${failed} FAIL` : "\n✅ FARE-PARITY: 3 ta additionalPayment maydoni surface qilindi, mavjud math o'zgarmadi");
  process.exit(failed ? 1 : 0);
}
main();
