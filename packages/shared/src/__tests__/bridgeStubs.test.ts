import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

// --- Why this file exists ----------------------------------------------------
//
// `KAS_MODE=birjoy` refuses to boot and names, in prose, the methods that are
// still stubs: "BirJoySource still has 19 unimplemented methods (addClientBonus,
// addDriverPayment, cancelBooking, …)". That sentence is the only thing standing
// between somebody flipping the mode and the booking sweep, the coin ledger and
// debt repayment all failing at 2am on a real customer's ride.
//
// It is also a hand-written list, which means it is a list that goes stale the
// first time somebody implements a method — and a refusal message naming
// methods that now work teaches the next person to ignore it. That is the same
// defect this project keeps finding in its own documents; here it would be
// wired into the one guard that protects a live cutover.
//
// So: the message is checked against the code it describes.

const SERVER = path.join(__dirname, "..", "..", "..", "server", "src", "kas");

function read(file: string): string {
  return fs.readFileSync(path.join(SERVER, file), "utf8");
}

/** Methods that still reject — read from the implementation itself. */
function actualStubs(): string[] {
  const src = read("birjoy.ts");
  return [...src.matchAll(/this\.notImpl\("([A-Za-z]+)"\)/g)]
    .map((m) => m[1] ?? "")
    .filter(Boolean)
    .sort();
}

/** Methods the boot refusal claims are stubs — read from the message. */
function claimedStubs(): string[] {
  const src = read("index.ts");
  const block = src.match(/still has \d+ unimplemented methods[\s\S]*?\(([^)]*)\)/);
  if (!block) throw new Error("the KAS_MODE=birjoy refusal message was not found");
  return (block[1] ?? "")
    .split(",")
    .map((s) => s.replace(/["+\s]/g, ""))
    .filter(Boolean)
    .sort();
}

/** The count the message states. */
function claimedCount(): number {
  const src = read("index.ts");
  const m = src.match(/still has (\d+) unimplemented methods/);
  if (!m) throw new Error("the refusal message does not state a count");
  return Number(m[1]);
}

describe("the KAS_MODE=birjoy refusal describes the bridge as it is", () => {
  it("finds both sides (guards against a broken scanner)", () => {
    // If either collapses to nothing the comparison below passes for the wrong
    // reason and stops protecting the cutover.
    expect(actualStubs().length).toBeGreaterThan(0);
    expect(claimedStubs().length).toBeGreaterThan(0);
  });

  it("names exactly the methods that are still stubs", () => {
    const actual = actualStubs();
    const claimed = claimedStubs();

    const nowWorking = claimed.filter((m) => !actual.includes(m));
    const missedByMessage = actual.filter((m) => !claimed.includes(m));

    expect(
      nowWorking.length === 0 && missedByMessage.length === 0
        ? ""
        : [
            nowWorking.length
              ? `the refusal still lists these, but they are implemented: ${nowWorking.join(", ")}`
              : "",
            missedByMessage.length
              ? `these are stubs and the refusal does not mention them: ${missedByMessage.join(", ")}`
              : "",
          ]
            .filter(Boolean)
            .join("\n"),
    ).toBe("");
  });

  it("states the number it is actually listing", () => {
    // The count is the part a person reads and repeats in a status report.
    expect(claimedCount()).toBe(claimedStubs().length);
  });

  it("still refuses to boot while any method is a stub", () => {
    // The day this list empties, the guard should come out — deliberately, with
    // somebody deciding to. Until then it must be impossible to boot past it by
    // accident.
    const src = read("index.ts");
    expect(src).toContain("KAS_MODE=birjoy refused");
    expect(actualStubs().length).toBeGreaterThan(0);
  });
});
