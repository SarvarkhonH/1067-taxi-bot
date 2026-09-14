import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

// --- Why this file exists ----------------------------------------------------
//
// It began as a check that the boot refusal named the right stubs: the message
// listed them in prose, and a hand-written list goes stale the first time
// somebody implements one — a refusal naming methods that now work teaches
// people to ignore the refusal. It caught its own drift four times in a day.
//
// On 2026-09-14 the list emptied: 27 of 27 implemented. So the check changes
// shape, and the thing it now protects is more important than the old one.
//
// Code-complete is NOT safe-to-switch. Nothing has compared the two sources
// side by side, the cutover member-matching has never touched real data, and no
// rollback has been rehearsed. The guard that stands between a config change on
// a Tuesday and every customer getting a duplicate account is a single `throw`,
// and these tests are what keep it there.

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

/** Every method the interface requires. */
function interfaceMethods(): string[] {
  const src = read("types.ts");
  const block = src.match(/export interface KasDataSource \{([\s\S]*?)\n\}/);
  if (!block) throw new Error("KasDataSource not found");
  return [...(block[1] ?? "").matchAll(/^\s{2}([a-zA-Z]+)\(/gm)]
    .map((m) => m[1] ?? "")
    .filter(Boolean)
    .sort();
}

describe("the bridge is finished", () => {
  it("has no method left rejecting with 'not implemented'", () => {
    const stubs = actualStubs();
    expect(
      stubs.length === 0 ? "" : `still stubbed: ${stubs.join(", ")}`,
    ).toBe("");
  });

  it("implements every method the interface asks for", () => {
    // The scanner's own blind spot, closed: counting stubs says nothing about a
    // method that was never written at all.
    const src = read("birjoy.ts");
    const missing = interfaceMethods().filter(
      (m) => !new RegExp(`\\b(?:async\\s+)?${m}\\s*\\(`).test(src),
    );
    expect(
      missing.length === 0 ? "" : `declared on KasDataSource but absent from BirJoySource: ${missing.join(", ")}`,
    ).toBe("");
  });
});

describe("finished is not the same as safe", () => {
  it("still refuses to boot into birjoy mode without a deliberate override", () => {
    // The one line between "the code is done" and every customer getting a
    // second account with their tanga left on the first.
    const src = read("index.ts");
    expect(src).toContain("KAS_MODE=birjoy refused");
    expect(src).toContain("KAS_BIRJOY_FORCE");
  });

  it("says what is unverified, not just that something is", () => {
    // A refusal that only says "no" gets overridden. One that names the shadow
    // run, the untested cutover matching and the un-rehearsed rollback tells
    // the person holding the flag what they are deciding.
    const src = read("index.ts");
    for (const claim of ["shadow", "cutover", "rollback"]) {
      expect(src.toLowerCase()).toContain(claim);
    }
  });

  it("does not claim the bridge is unfinished any more", () => {
    // The old message named stubs. Leaving it would be the same lie in reverse:
    // a warning about a problem that no longer exists, next to one that does.
    const src = read("index.ts");
    expect(src).not.toContain("unimplemented methods");
  });
});
