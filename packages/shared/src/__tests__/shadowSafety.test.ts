import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

// --- Why this file exists ----------------------------------------------------
//
// Shadow mode asks two systems the same question and writes down where they
// disagree. Asking a READ twice is free. Asking a WRITE twice creates two real
// orders, cancels a ride nobody cancelled, or moves a balance a second time.
//
// The only thing standing between those two outcomes is one list of method
// names in shadow.ts. A name added to the wrong side of it does not fail, does
// not warn, and does not show up until a passenger has two cars on the way.
//
// So the list is checked against the interface it claims to describe, and every
// write method in KasDataSource is named here explicitly. Adding a write to the
// interface without adding it below fails this test — which is the point: the
// person adding it has to say, in writing, that it is a write.

const KAS = path.join(__dirname, "..", "..", "..", "server", "src", "kas");

const read = (f: string) => fs.readFileSync(path.join(KAS, f), "utf8");

/** Every method KasDataSource declares. */
function interfaceMethods(): string[] {
  const block = read("types.ts").match(/export interface KasDataSource \{([\s\S]*?)\n\}/);
  if (!block) throw new Error("KasDataSource not found");
  return [...(block[1] ?? "").matchAll(/^\s{2}([a-zA-Z]+)\(/gm)].map((m) => m[1] ?? "").filter(Boolean);
}

/** The list shadow.ts is willing to call twice. */
function shadowedMethods(): string[] {
  const block = read("shadow.ts").match(/const READ_METHODS = new Set\(\[([\s\S]*?)\]\)/);
  if (!block) throw new Error("READ_METHODS not found");
  return [...(block[1] ?? "").matchAll(/"([a-zA-Z]+)"/g)].map((m) => m[1] ?? "").filter(Boolean);
}

/**
 * Methods that CHANGE something, named one by one on purpose.
 *
 * This is the list a human has to edit, deliberately, when the interface grows.
 */
const WRITES = [
  "createBooking",      // makes a real order
  "cancelBooking",      // cancels a real one
  "setClientBonus",     // moves a balance
  "addClientBonus",     // moves a balance
  "setClientName",      // rewrites a record
  "addDriverPayment",   // moves money
];

describe("shadow mode never doubles a write", () => {
  it("shadows nothing that changes something", () => {
    const shadowed = shadowedMethods();
    const doubled = WRITES.filter((w) => shadowed.includes(w));
    expect(
      doubled.length === 0 ? "" :
      `these would be called TWICE in shadow mode: ${doubled.join(", ")} — ` +
      "two real orders, or money moved twice",
    ).toBe("");
  });

  it("knows about every method the interface has", () => {
    // A method in neither list is silently primary-only, which is safe — but it
    // also means nobody decided. Force the decision.
    const methods = interfaceMethods();
    const shadowed = shadowedMethods();
    const unclassified = methods.filter((m) => !shadowed.includes(m) && !WRITES.includes(m));
    expect(
      unclassified.length === 0 ? "" :
      `neither shadowed nor declared a write: ${unclassified.join(", ")} — ` +
      "say which it is in shadow.ts READ_METHODS or in this test's WRITES",
    ).toBe("");
  });

  it("does not shadow a method that no longer exists", () => {
    const methods = interfaceMethods();
    const stale = shadowedMethods().filter((m) => !methods.includes(m));
    expect(stale.length === 0 ? "" : `shadowed but gone from the interface: ${stale.join(", ")}`).toBe("");
  });
});

describe("shadow mode cannot change an answer", () => {
  it("returns the primary's value, never the shadow's", () => {
    // The proxy must hand back what it got from the primary. If this ever reads
    // `return shadowValue` or merges the two, shadow mode has quietly become an
    // untested cutover.
    const src = read("shadow.ts");
    expect(src).toContain("return live;");
    expect(src).not.toMatch(/return\s+shadowValue/);
  });

  it("is off unless somebody turns it on", () => {
    const src = read("index.ts");
    expect(src).toContain("KAS_SHADOW_ENABLED");
  });

  it("gives the shadow call its own timeout", () => {
    // A slow second source must not become a slow bot.
    expect(read("shadow.ts")).toContain("withTimeout");
  });
});

describe("a shadow run that never ran must not look like a clean one", () => {
  it("says something the first time a method is compared, agreement included", () => {
    // Agreement is silent by design — but so is a method nobody calls, a URL
    // that 404s, and a sample rate that never comes round. If the only line
    // ever printed is a disagreement, those four are indistinguishable, and
    // "the two sources agree" is the one conclusion this exercise must earn
    // rather than assume. So the first comparison is logged BEFORE the
    // agreement early-exit.
    const src = read("shadow.ts");
    const firstLog = src.indexOf("[shadow] FIRST");
    const okReturn = src.indexOf("if (diff.ok) return;");
    expect(firstLog).toBeGreaterThan(-1);
    expect(okReturn).toBeGreaterThan(-1);
    expect(firstLog).toBeLessThan(okReturn);
  });

  it("does not read an empty summary as a good week", () => {
    expect(read("shadow.ts")).toContain("NOTHING COMPARED YET");
  });
});

describe("sampling cannot silently skip a whole method", () => {
  it("always compares the first call, whatever the rate", () => {
    // tariff / bonus rules / company / car models are read ONCE, while the
    // config cache warms at boot. At a sample rate of 3 their turn never comes,
    // so a whole week would compare everything except the reads that carry the
    // fares.
    expect(read("shadow.ts")).toContain("n === 1 || n % sampleEvery === 0");
  });
});

describe("an outage in the primary is not a finding about the shadow", () => {
  it("awaits the two separately rather than together", () => {
    // Promise.all rejects on whichever side failed, so a kas1067 outage would
    // be recorded as "birjoy FAILED in shadow" — blaming the source under
    // evaluation for an outage it had no part in, in exactly the hour somebody
    // is reading the log to find out what broke.
    const src = read("shadow.ts");
    expect(src).not.toContain("Promise.all([");
    expect(src).toContain("recordError");
  });
});
