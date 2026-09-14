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

describe("a sick primary must still teach us something", () => {
  it("asks the shadow anyway when kas cannot answer, and counts it", () => {
    // A comparison needs BOTH sources. On a day when kas1067 times out, a run
    // that only records comparisons learns nothing at all — while the one fact
    // the cutover turns on is being demonstrated live: kas could not answer,
    // and the taxi core could.
    // Checked at the CALL SITE, not by the presence of the name anywhere in the
    // file: the recorder method and its log line would still be there with the
    // call deleted, and a test that passes with the behaviour removed is worse
    // than no test.
    const src = read("shadow.ts");
    const start = src.indexOf("liveValue = await Promise.resolve(live);");
    expect(start).toBeGreaterThan(-1);
    const primaryFailedBlock = src.slice(start, src.indexOf("return;", start));
    expect(primaryFailedBlock).toContain("recordPrimaryDown");
  });

  it("still reports kas outages when nothing was comparable", () => {
    // The empty-summary branch is exactly the branch a bad kas day lands in.
    const src = read("shadow.ts");
    const emptyBranch = src.indexOf("NOTHING COMPARED YET");
    expect(emptyBranch).toBeGreaterThan(-1);
    expect(src.slice(emptyBranch, emptyBranch + 400)).toContain("down");
  });
})

describe("the cutover rehearsal writes nothing", () => {
  it("opens no write path at all", () => {
    // The script runs against the LIVE member table while the bot is serving.
    // "It only reads" is a claim, and a claim is not a guard — one prisma
    // update in a later edit would rewrite real people's identities during what
    // everybody still calls a dry run.
    const src = fs.readFileSync(
      path.join(__dirname, "..", "..", "..", "server", "src", "scripts", "dryRunCutover.ts"),
      "utf8",
    );
    const writes = ["prisma.member.update", "prisma.member.create", "prisma.member.upsert",
      "prisma.member.delete", ".updateMany", ".createMany", ".deleteMany", "$executeRaw"];
    const found = writes.filter((w) => src.includes(w));
    expect(found.length === 0 ? "" : `dry run can WRITE: ${found.join(", ")}`).toBe("");
  });

  it("uses the real matcher rather than a copy of it", () => {
    // A rehearsal against a re-implementation rehearses the re-implementation.
    const src = fs.readFileSync(
      path.join(__dirname, "..", "..", "..", "server", "src", "scripts", "dryRunCutover.ts"),
      "utf8",
    );
    expect(src).toContain("chooseMemberRow");
    expect(src).toContain("fetchMembers");
  });
});

describe("the address catalog is not lost to an empty answer", () => {
  const client = () =>
    fs.readFileSync(path.join(__dirname, "..", "..", "..", "server", "src", "kas", "client.ts"), "utf8");

  function getAllAddressesBody(): string {
    const src = client();
    const from = src.indexOf("async getAllAddresses(");
    expect(from).toBeGreaterThan(-1);
    const rest = src.slice(from + 1);
    const next = rest.search(/\n {2}(?:private )?(?:async )?\w+\(/);
    return rest.slice(0, next < 0 ? 2500 : next);
  }

  it("uses the shared rule rather than its own", () => {
    // The pure function is tested; this is what makes the tested thing the
    // thing that runs. Without it the rule can be reverted here and every test
    // stays green — which is exactly what happened when this was checked.
    expect(getAllAddressesBody()).toContain("chooseCatalog(");
  });

  it("only caches an answer that has something in it", () => {
    expect(getAllAddressesBody()).toContain("if (rows.length)");
  });

  it("says so when the source answers with nothing", () => {
    // Shadow mode found this one; the log is what makes the NEXT one findable
    // without it. A silent empty catalog looks exactly like a town with no
    // addresses in it.
    const body = getAllAddressesBody();
    expect(body).toContain("console.warn");
    expect(body.toLowerCase()).toContain("0 addresses");
  });
});

describe("the address catalog survives a restart", () => {
  const service = () =>
    fs.readFileSync(
      path.join(__dirname, "..", "..", "..", "server", "src", "services", "addressCatalog.ts"),
      "utf8",
    );

  it("keeps the last good copy where a restart cannot reach it", () => {
    // The real cause, found by chasing the shadow finding: kas rate-limits our
    // login (429), so after a deploy the client cannot fetch and its in-memory
    // cache is cold. The bot restarts on every deploy. A hundred and eleven
    // street names must not depend on a login.
    const src = service();
    expect(src).toContain("prisma.appState");
    expect(src).toContain("upsert");
  });

  it("prefers the live list, and only falls back when it is empty", () => {
    // Inside the function body, not the whole file: loadSaved is DEFINED above
    // it, and an earlier version of this test read that definition as the call
    // and failed for the wrong reason.
    const src = service();
    const from = src.indexOf("export async function getAddressCatalog");
    expect(from).toBeGreaterThan(-1);
    const body = src.slice(from);
    const live = body.indexOf("live.length > 0");
    const saved = body.indexOf("await loadSaved()");
    expect(live).toBeGreaterThan(-1);
    expect(saved).toBeGreaterThan(live);
  });

  it("is what the bot actually asks", () => {
    // The durable copy is worth nothing if the booking flow still goes straight
    // to kas — which is what it did until 2026-09-14.
    const booking = fs.readFileSync(
      path.join(__dirname, "..", "..", "..", "server", "src", "bot", "booking.ts"),
      "utf8",
    );
    expect(booking).toContain("getAddressCatalog()");
    expect(booking).not.toContain("ds.getAllAddresses()");
  });

  it("says when it is serving a saved copy", () => {
    // Working-but-not-refreshing is a state somebody has to be able to see.
    expect(service()).toContain("console.warn");
  });
});
