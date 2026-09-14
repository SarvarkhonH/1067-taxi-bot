import { describe, it, expect } from "vitest";
import { compareShadow, BY_DESIGN } from "../shadowCompare";

// --- Why this file exists ----------------------------------------------------
//
// Shadow mode exists to find out where kas1067 and the taxi core disagree
// BEFORE a cutover. It is worth exactly as much as its comparator.
//
// The failure that makes the whole exercise pointless is not a missed
// difference — it is reporting everything. A great many fields differ on
// purpose (ids are namespaced, a customer's balance is deliberately not in the
// taxi core, a driver's address is not in that schema at all). A naive
// deep-equal paints every call red, nobody reads the report, and the one real
// difference sits inside it unnoticed.
//
// So these tests are mostly about what the comparator must STAY QUIET about,
// and the one thing it must never stay quiet about: a field nobody classified.

describe("differences that mean something", () => {
  it("reports a fare that does not match", () => {
    const d = compareShadow("getRideHistory", [{ id: 1, payment: 12000 }], [{ id: 9001, payment: 15000 }]);
    expect(d.ok).toBe(false);
    expect(d.problems.join(" ")).toContain("payment");
  });

  it("reports one source answering nothing when the other answered", () => {
    // "No active booking" against "here is their ride" is the difference that
    // strands a passenger.
    const d = compareShadow("getActiveBooking", { id: 1, status: "accepted" }, null);
    expect(d.ok).toBe(false);
  });

  it("reports a different number of rows", () => {
    const d = compareShadow("listActiveBookings", [{ id: 1 }, { id: 2 }], [{ id: 1 }]);
    expect(d.problems.join(" ")).toContain("length");
  });

  it("treats a field nobody classified as must-match", () => {
    // The whole exercise fails on a difference nobody looked at, so an
    // unclassified field is loud by default.
    const d = compareShadow("getRideHistory", [{ id: 1, somethingNew: "a" }], [{ id: 9001, somethingNew: "b" }]);
    expect(d.ok).toBe(false);
    expect(d.problems.join(" ")).toContain("somethingNew");
  });
});

describe("differences that are the design", () => {
  it("says nothing about a namespaced id", () => {
    const d = compareShadow("getRideHistory", [{ id: 1, payment: 12000 }], [{ id: 900001, payment: 12000 }]);
    expect(d.ok).toBe(true);
    expect(d.expected.join(" ")).toContain("namespaced");
  });

  it("says nothing about a customer's balance being absent", () => {
    // It is tanga, in the bot's ledger. The taxi core has no opinion and must
    // not be asked to have one.
    const d = compareShadow(
      "listActiveBookings",
      [{ id: 1, clientBonus: 45000, status: "accepted" }],
      [{ id: 9001, clientBonus: 0, status: "accepted" }],
    );
    expect(d.ok).toBe(true);
  });

  it("says nothing about the region tariff mirroring the city one", () => {
    const d = compareShadow(
      "getTariff",
      { minimalPayment: 8000, distancePaymentInCity: 2000, distancePaymentInRegion: 2600 },
      { minimalPayment: 8000, distancePaymentInCity: 2000, distancePaymentInRegion: 2000 },
    );
    expect(d.ok).toBe(true);
  });

  it("still catches a real difference sitting next to an expected one", () => {
    // The case the whole design is for: noise suppressed, signal kept.
    const d = compareShadow(
      "getTariff",
      { minimalPayment: 8000, distancePaymentInRegion: 2600 },
      { minimalPayment: 9500, distancePaymentInRegion: 2000 },
    );
    expect(d.ok).toBe(false);
    expect(d.problems.join(" ")).toContain("minimalPayment");
    expect(d.expected.length).toBeGreaterThan(0);
  });

  it("records the reason, so the report can explain itself", () => {
    const d = compareShadow("listDriverRoster", [{ kasId: "4", address: "Koson" }], [{ kasId: "bj_4", address: null }]);
    expect(d.expected.join(" ")).toContain("not held in the taxi core");
  });
});

describe("noise", () => {
  it("ignores timestamps", () => {
    const d = compareShadow(
      "getRideHistory",
      [{ id: 1, payment: 1, at: "2026-09-14T10:00:00Z" }],
      [{ id: 9001, payment: 1, at: "2026-09-14T10:00:03Z" }],
    );
    expect(d.ok).toBe(true);
  });

  it("compares a number written as a string as the same number", () => {
    // The two sources disagree about decimals-as-strings constantly, and it
    // means nothing.
    const d = compareShadow("getDriverAccount", { balance: 12000 }, { balance: "12000" });
    expect(d.ok).toBe(true);
  });

  it("does not walk a thousand rows to say the same thing", () => {
    const many = (n: number, pay: number) =>
      Array.from({ length: n }, (_, i) => ({ id: i, payment: pay }));
    const d = compareShadow("getReportsPage", many(500, 1000), many(500, 2000), { maxItems: 3 });
    expect(d.problems.length).toBeLessThanOrEqual(3);
  });
});

describe("the by-design list is a list of claims", () => {
  it("carries a reason for every entry", () => {
    // An entry with no reason is somebody silencing a difference rather than
    // explaining it.
    for (const [method, fields] of Object.entries(BY_DESIGN)) {
      for (const [field, reason] of Object.entries(fields)) {
        expect(`${method}.${field}: ${reason}`.length).toBeGreaterThan(`${method}.${field}: `.length + 15);
      }
    }
  });
});
