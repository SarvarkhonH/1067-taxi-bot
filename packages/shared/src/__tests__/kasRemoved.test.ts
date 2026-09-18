import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

// --- Why this file exists ----------------------------------------------------
//
// On 2026-09-17 the owner removed kas1067 — the rented dispatch this whole
// project was built on — with no way back, and moved the bot onto our own taxi
// core. Two kinds of regression would be silent:
//
//   1. something quietly talking to kas1067 again (an old script restored, a
//      socket re-imported), so a dead server gets a connection per request;
//   2. something quietly depending on "live" mode again. Before the switch, the
//      whole background tick — backups, money recovery, weekly prizes — and the
//      ride sweep only ran when KAS_MODE was "live". Flipping the mode would
//      have stopped all of them without a single error.
//
// And the bridge itself carries three money-shaped rules that read as style in
// a review: a timeout on every call, "no answer" kept apart from "refused", and
// a missing position never reported as 0. These tests read the source so those
// rules fail CI instead of failing a passenger.

const ROOT = path.join(__dirname, "..", "..", "..");
const PACKAGES = ["server", "shared", "miniapp", "admin"].map((p) => path.join(ROOT, p, "src"));
const THIS_FILE = path.resolve(__filename);

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "dist") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

// Local-only, gitignored owner tool for renewing the old kas1067 rental; never in a CI checkout.
const IGNORED = new Set(["renewSystemRental.ts"]);
const files = PACKAGES.flatMap((d) => walk(d)).filter((f) => path.resolve(f) !== THIS_FILE && !IGNORED.has(path.basename(f)));
const read = (f: string) => fs.readFileSync(f, "utf8");
const rel = (f: string) => path.relative(ROOT, f).replace(/\\/g, "/");

describe("nothing talks to kas1067", () => {
  it("scans a real code base, not an empty directory", () => {
    expect(files.length).toBeGreaterThan(200);
  });

  it("has no kas1067 address, client, socket or shadow left in any package", () => {
    const banned = [/46\.8\.176\.53/, /\bKasLiveSource\b/, /\bkasMapSocket\b/, /\bkasClientSocket\b/, /kas\/client["']/, /kas\/shadow["']/, /\bKAS_PASSWORD\b/, /\bKAS_BONUS_SECRET_KEY\b/];
    const hits: string[] = [];
    for (const f of files) {
      const src = read(f);
      for (const re of banned) if (re.test(src)) hits.push(`${rel(f)}: ${re}`);
    }
    expect(hits).toEqual([]);
  });

  it("no longer offers the methods that wrote a passenger's kas cashback", () => {
    const types = read(path.join(ROOT, "server", "src", "kas", "types.ts"));
    const iface = types.match(/export interface KasDataSource \{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(iface).not.toMatch(/\bsetClientBonus\(/);
    expect(iface).not.toMatch(/\baddClientBonus\(/);
  });
});

describe("nothing waits for 'live' mode", () => {
  it("has no branch on KAS_MODE === \"live\" (or a data source named live) anywhere", () => {
    const hits = files
      .filter((f) => /KAS_MODE\s*[!=]==?\s*["']live["']|\.name\s*[!=]==?\s*["']live["']/.test(read(f)))
      .map(rel);
    expect(hits).toEqual([]);
  });

  it("starts the ride sweep unconditionally", () => {
    const index = read(path.join(ROOT, "server", "src", "index.ts"));
    // One scheduler (shared sweepLoop: one chain, never two ticks at once), started at statement level.
    expect(index).toMatch(/\n\s*const bookingSweep = sweepLoop\(\{/);
    expect(index).toMatch(/\n\s*bookingSweep\.start\(15_000\);/);
  });
});

describe("the bridge keeps its money rules", () => {
  const bridge = read(path.join(ROOT, "server", "src", "kas", "birjoy.ts"));

  it("puts a timeout on every call to the core", () => {
    expect(bridge).toContain("AbortSignal.timeout(");
  });

  it("never reports an unknown position as zero", () => {
    expect(bridge).not.toMatch(/\blat:\s*0\b/);
    expect(bridge).not.toMatch(/\blng:\s*0\b/);
  });

  it("translates every order status it hands out", () => {
    // every `status: ...` in a mapper must go through bookingStatus(); a raw String(r.status) is the
    // silent no-payout failure.
    const raw = bridge.split("\n").filter((l) => /^\s+status:\s/.test(l) && !l.includes("bookingStatus("));
    expect(raw).toEqual([]);
  });

  it("keeps 'no answer' apart from 'refused' on the driver payment", () => {
    const from = bridge.indexOf("async addDriverPayment(");
    const body = bridge.slice(from, bridge.indexOf("\n  }\n", from));
    expect(body).toContain("coreOutcomeUnknown(e)");
    expect(body).toContain("unknown: true");
    expect(body).toContain("requestId");
  });
});

describe("callers honour 'no answer'", () => {
  it("never refunds a withdraw or debt payment the core did not answer", () => {
    for (const f of ["services/coinService.ts", "services/driverDebtService.ts", "services/adminOps.ts"]) {
      const src = read(path.join(ROOT, "server", "src", f));
      expect(src, f).toMatch(/res\.unknown/);
    }
  });

  it("holds a member's dispatches when an order got no answer, on every dispatch path", () => {
    const svc = read(path.join(ROOT, "server", "src", "services", "bookingService.ts"));
    const bot = read(path.join(ROOT, "server", "src", "bot", "booking.ts"));
    // Mini App + 1-tap in the service, the wizard in the bot
    expect(svc.match(/if \(res\.unknown\) \{ await holdAfterUnknownDispatch\(memberId\);/g)?.length).toBe(2);
    expect(bot).toContain("await holdAfterUnknownDispatch(memberId);");
  });

  it("guards every dispatch path with the same check, where an unreadable core is not 'no ride'", () => {
    const svc = read(path.join(ROOT, "server", "src", "services", "bookingService.ts"));
    const bot = read(path.join(ROOT, "server", "src", "bot", "booking.ts"));
    expect(svc.match(/await dispatchGuard\(memberId\)/g)?.length).toBe(2);
    expect(bot).toContain("await dispatchGuard(memberId)");
    expect(svc).toContain("getActiveBookingFor(memberId, { strict: true })");
  });
});
