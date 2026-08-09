// pickup2 picker helpers — pure, no DB / network / kas. Proves the two claims the rider screen
// makes: "xato yozsangiz ham topadi" (fuzzy match) and "har joyning o'z belgisi bor" (icon).
import { describe, expect, it } from "vitest";
import { foldName, fuzzyFilter, placeIcon } from "../pickup";
import type { SavedAddressView } from "../booking";

const p = (id: number, name: string): SavedAddressView => ({ id, name });
const CATALOG: SavedAddressView[] = [
  p(1, "ESKI BOZOR"),
  p(2, "BOZOR KO'CHASI"),
  p(3, "MARKAZIY BOZOR"),
  p(4, "OBRON BALNITSA"),
  p(5, "5-MAKTAB"),
  p(6, "RAVOT MAHALLA"),
  p(7, "YOSHLAR BOG'I"),
  p(8, "HOKIMLIK"),
];

describe("foldName", () => {
  it("collapses the digraphs and apostrophes riders skip", () => {
    expect(foldName("YOSHLAR BOG'I")).toBe(foldName("yoslar bogi"));
    expect(foldName("KO'CHA")).toBe(foldName("kocha"));
  });
  it("merges the q/k, x/h and v/w pairs that sound alike in Uzbek", () => {
    expect(foldName("QOSON")).toBe(foldName("koson"));
    expect(foldName("XONA")).toBe(foldName("hona"));
  });
  it("drops punctuation, spaces and digits-adjacent noise so only letters compare", () => {
    expect(foldName("5-MAKTAB")).toBe("5maktab");
    expect(foldName("  Eski   Bozor! ")).toBe(foldName("eskibozor"));
  });
});

describe("fuzzyFilter", () => {
  it("does NOT invent a match for a slang spelling", () => {
    // addressAlias.ts:7 — a guessed alias sends a REAL taxi to the wrong address, so a rider typing
    // "banisa" must get "topilmadi" here rather than an algorithm's hunch at "OBRON BALNITSA".
    // (The curated alias table that DOES resolve it is wired into the bot only — bot/booking.ts:13 —
    // not into this screen's search. Widening it to the Mini App is a separate, deliberate ticket.)
    expect(fuzzyFilter("banisa", CATALOG)).toEqual([]);
  });
  it("is case-insensitive against the SHOUTED catalog names", () => {
    expect(fuzzyFilter("BaLnItSa", CATALOG).map((a) => a.name)).toEqual(["OBRON BALNITSA"]);
  });
  it("matches without apostrophes or correct digraphs", () => {
    expect(fuzzyFilter("bogi", CATALOG).map((a) => a.name)).toEqual(["YOSHLAR BOG'I"]);
    expect(fuzzyFilter("kocasi", CATALOG).map((a) => a.name)).toEqual(["BOZOR KO'CHASI"]);
  });
  it("ranks word-start matches above mid-word ones", () => {
    expect(fuzzyFilter("bozor", CATALOG).map((a) => a.name)).toEqual([
      "BOZOR KO'CHASI", // starts with it
      "ESKI BOZOR",
      "MARKAZIY BOZOR",
    ]);
  });
  it("a partial prefix already narrows the list", () => {
    expect(fuzzyFilter("mahal", CATALOG).map((a) => a.name)).toEqual(["RAVOT MAHALLA"]);
  });
  it("empty or whitespace query returns nothing (the sheet shows nearby places instead)", () => {
    expect(fuzzyFilter("", CATALOG)).toEqual([]);
    expect(fuzzyFilter("   ", CATALOG)).toEqual([]);
  });
  it("an unmatched query returns an empty list, never throws", () => {
    expect(fuzzyFilter("zzzz", CATALOG)).toEqual([]);
  });
});

describe("placeIcon", () => {
  it("gives each catalog kind its own mark, never a blank", () => {
    expect(placeIcon("5-MAKTAB")).toBe("🏫");
    expect(placeIcon("ESKI BOZOR")).toBe("🛒");
    expect(placeIcon("OBRON BALNITSA")).toBe("🏥");
    expect(placeIcon("YOSHLAR BOG'I")).toBe("🌳");
    expect(placeIcon("RAVOT MAHALLA")).toBe("🏘");
    expect(placeIcon("HOKIMLIK")).toBe("🏛");
  });
  it("falls back to a pin for anything unrecognised", () => {
    expect(placeIcon("QANDAYDIR JOY")).toBe("📍");
  });
});

// Reja DoD'ining aynan shu satri: «"bazo" yozilsa 3 ta bozor». Unli xatosi — mijoz eng ko'p
// qiladigan xato; undosh skeleti esa deyarli har doim to'g'ri qoladi.
describe("fuzzyFilter — unli xatosiga chidamlilik (zaxira bosqich)", () => {
  it("mistyped vowels still find every bozor", () => {
    const hits = fuzzyFilter("bazo", CATALOG).map((a) => a.name);
    expect(hits).toHaveLength(3);
    expect(hits).toContain("ESKI BOZOR");
    expect(hits).toContain("BOZOR KO'CHASI");
    expect(hits).toContain("MARKAZIY BOZOR");
  });
  it("more mistyped vowels: markez → markaziy, mektab → maktab", () => {
    expect(fuzzyFilter("markez", CATALOG).map((a) => a.name)).toContain("MARKAZIY BOZOR");
    expect(fuzzyFilter("mektab", CATALOG).map((a) => a.name)).toContain("5-MAKTAB");
  });
  it("a correctly typed query is NEVER polluted by the loose pass", () => {
    // "bozor" qat'iy bosqichda topiladi → zaxira bosqich umuman ishlamaydi
    expect(fuzzyFilter("bozor", CATALOG).map((a) => a.name)).toEqual([
      "BOZOR KO'CHASI", "ESKI BOZOR", "MARKAZIY BOZOR",
    ]);
    // "hokim" faqat bittasini beradi, unli-ko'r bosqich uni kengaytirmaydi
    expect(fuzzyFilter("hokim", CATALOG).map((a) => a.name)).toEqual(["HOKIMLIK"]);
  });
  it("undoshlari boshqa so'z baribir topilmaydi", () => {
    expect(fuzzyFilter("zzzz", CATALOG)).toEqual([]);
  });
});
