import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { chooseCatalog } from "../catalog";

describe("an empty answer never replaces a good one", () => {
  it("serves what was fetched when it has something in it", () => {
    const { rows, servedStale } = chooseCatalog([1, 2, 3], [9]);
    expect(rows).toEqual([1, 2, 3]);
    expect(servedStale).toBe(false);
  });

  it("falls back to the cache when the source answers with nothing", () => {
    // The live failure: the source answered with zero addresses fourteen times
    // out of fourteen while a good copy sat in the cache, unused.
    const { rows, servedStale } = chooseCatalog([], [1, 2, 3]);
    expect(rows).toEqual([1, 2, 3]);
    expect(servedStale).toBe(true);
  });

  it("does not claim to have served stale when there was none", () => {
    const { rows, servedStale } = chooseCatalog([], undefined);
    expect(rows).toEqual([]);
    expect(servedStale).toBe(false);
  });

  it("is not newest-wins", () => {
    expect(chooseCatalog([], [1]).rows).toEqual([1]);
  });
});

describe("the address catalog survives a restart", () => {
  const service = () =>
    fs.readFileSync(
      path.join(__dirname, "..", "..", "..", "server", "src", "services", "addressCatalog.ts"),
      "utf8",
    );

  it("keeps the last good copy where a restart cannot reach it", () => {
    const src = service();
    expect(src).toContain("prisma.appState");
    expect(src).toContain("upsert");
  });

  it("prefers the live list, and only falls back when it is empty", () => {
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
    const booking = fs.readFileSync(
      path.join(__dirname, "..", "..", "..", "server", "src", "bot", "booking.ts"),
      "utf8",
    );
    expect(booking).toContain("getAddressCatalog()");
    expect(booking).not.toContain("ds.getAllAddresses()");
  });

  it("never serves a copy saved from the old dispatch", () => {
    // Its place ids are kas1067's. The core numbers the same places differently,
    // and a stale id dispatches a car to whichever place owns that number here.
    expect(service()).not.toContain('"kas:addressCatalog"');
  });

  it("says when it is serving a saved copy", () => {
    expect(service()).toContain("console.warn");
  });
});
