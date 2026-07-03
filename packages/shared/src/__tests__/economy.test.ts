// Money-math unit suite (NEXT_LEVEL_PLAN Phase-0 0.6) — PURE functions only.
// No DB, no network, no Prisma, no server imports. Runs in CI on every push so a
// clamp/knob regression fails the build BEFORE it can reach the live economy.
import { describe, expect, it } from "vitest";
import {
  BONUS_ECON_KNOBS,
  bonusEconDefaults,
  clampBonusEcon,
  clampTransferEcon,
  transferEconDefaults,
  tierMultFor,
  tierMultKnobKey,
  inflateOnline,
  ONLINE_DISPLAY_MULT,
  RIDE_EMISSION_CAP,
  TRANSFER_MIN,
  TRANSFER_MAX_PER_TX,
  TRANSFER_DAILY_SENT,
  TRANSFER_DAILY_RECEIVED,
  FARE_MAX_PER_TX,
  WITHDRAW_MIN,
  WITHDRAW_DAILY_CAP,
} from "../economy";

describe("RIDE_EMISSION_CAP — the BUZILMAS ≤350/ride rule", () => {
  it("is exactly 350", () => {
    // ============================ LOUD GUARD ==================================
    // 350 is BUSINESS RULE #1 (CLAUDE.md "BUZILMAS BIZNES QOIDALARI"): total
    // client coin emission per ride is clamped to 350 tanga in grantRideCoins.
    // If you are here because CI went red: changing this cap is an OWNER
    // decision, not a refactor. Update economy.ts AND this test in the same
    // commit, with the owner's sign-off recorded in PROGRESS.md.
    // ==========================================================================
    expect(RIDE_EMISSION_CAP).toBe(350);
  });
});

describe("clampBonusEcon — knob clamp + step rounding + NaN fallback", () => {
  it.each([
    // [key, input, expected, why]
    ["firstRide", 6000, 6000, "in-range value passes through"],
    ["firstRide", -100, 0, "below min clamps to min (0)"],
    ["firstRide", 999_999, 20_000, "above max clamps to max (20000)"],
    ["firstRide", NaN, 5000, "NaN falls back to the default"],
    ["drvRides", 5.7, 6, "integer-step knob (step>=1) rounds to whole"],
    ["tierMultBronza", 1.234, 1.234, "fractional-step knob (0.01) keeps decimals"],
    ["tierMultBronza", 5, 2, "multiplier hard-capped at 2x"],
    ["noSuchKnob", 42, 42, "unknown key passes the value through untouched"],
  ] as const)("clampBonusEcon(%s, %s) -> %s (%s)", (key, input, expected, _why) => {
    expect(clampBonusEcon(key, input)).toBe(expected);
  });
});

describe("bonusEconDefaults — completeness & self-consistency", () => {
  it("has one entry per knob, keys unique", () => {
    const keys = BONUS_ECON_KNOBS.map((k) => k.key);
    expect(new Set(keys).size).toBe(keys.length); // duplicate key would silently shadow a knob
    expect(Object.keys(bonusEconDefaults()).length).toBe(BONUS_ECON_KNOBS.length);
  });
  it("every default survives its own clamp unchanged (def within [min,max], step-consistent)", () => {
    const violations = BONUS_ECON_KNOBS.filter((k) => clampBonusEcon(k.key, k.def) !== k.def).map((k) => k.key);
    expect(violations).toEqual([]);
  });
  it("firstRide default is 5000 (= free base fare; single source for welcome/referee/recruit)", () => {
    expect(bonusEconDefaults().firstRide).toBe(5000);
  });
});

describe("wait-comp knobs (feature 'waitcomp') — defaults + clamps", () => {
  it("ships the owner-spec defaults: grace 30s, full 180s, ceiling 1500, voucher 72h", () => {
    expect(bonusEconDefaults()).toMatchObject({
      waitCompGraceSec: 30,
      waitCompFullSec: 180,
      waitCompCeiling: 1500,
      waitVoucherExpiryH: 72,
    });
  });
  it.each([
    ["waitCompFullSec", 10, 60, "full-time floor is 60s"],
    ["waitCompCeiling", 99_999, 3000, "ceiling hard max is 3000"],
    ["waitVoucherExpiryH", NaN, 72, "NaN expiry falls back to 72h"],
  ] as const)("clampBonusEcon(%s, %s) -> %s (%s)", (key, input, expected, _why) => {
    expect(clampBonusEcon(key, input)).toBe(expected);
  });
});

describe("clampTransferEcon + transfer/withdraw constants sanity", () => {
  it.each([
    ["commissionPct", -5, 0, "negative clamps to 0"],
    ["commissionPct", 50, 10, "commission hard-capped at 10%"],
    ["commissionPct", NaN, 1.0, "NaN falls back to default 1%"],
  ] as const)("clampTransferEcon(%s, %s) -> %s (%s)", (key, input, expected, _why) => {
    expect(clampTransferEcon(key, input)).toBe(expected);
  });
  it("transferEconDefaults has exactly the 1% commission knob", () => {
    expect(transferEconDefaults()).toEqual({ commissionPct: 1.0 });
  });
  it("limits ordered: 0 < MIN <= MAX_PER_TX <= DAILY_SENT; received/fare caps >= per-tx; withdraw min <= daily cap", () => {
    expect(TRANSFER_MIN).toBeGreaterThan(0);
    expect(TRANSFER_MIN).toBeLessThanOrEqual(TRANSFER_MAX_PER_TX);
    expect(TRANSFER_MAX_PER_TX).toBeLessThanOrEqual(TRANSFER_DAILY_SENT);
    expect(TRANSFER_DAILY_RECEIVED).toBeGreaterThanOrEqual(TRANSFER_MAX_PER_TX);
    expect(FARE_MAX_PER_TX).toBeGreaterThanOrEqual(TRANSFER_MAX_PER_TX);
    expect(WITHDRAW_MIN).toBeLessThanOrEqual(WITHDRAW_DAILY_CAP);
  });
});

describe("tierMultKnobKey / tierMultFor — level -> cashback multiplier", () => {
  it("maps level 1..6 to the six tier knobs in order", () => {
    expect([1, 2, 3, 4, 5, 6].map(tierMultKnobKey)).toEqual([
      "tierMultBronza",
      "tierMultKumush",
      "tierMultOltin",
      "tierMultPlatina",
      "tierMultOlmos",
      "tierMultAfsona",
    ]);
  });
  it("unknown levels (Yangi=0, out-of-range) have no knob", () => {
    expect([0, 7, -1, 99].map(tierMultKnobKey)).toEqual([null, null, null, null]);
  });
  it("multiplier from defaults: Yangi 1.0, Bronza 1.05, Afsona 1.3, unknown 1.0", () => {
    const econ = bonusEconDefaults();
    expect([0, 1, 6, 99].map((lvl) => tierMultFor(lvl, econ))).toEqual([1.0, 1.05, 1.3, 1.0]);
  });
  it("missing knob in the econ blob falls back to 1.0 (never NaN/undefined into money math)", () => {
    expect(tierMultFor(2, {})).toBe(1.0);
  });
});

describe("inflateOnline — display-only 2x driver-count inflation", () => {
  it("multiplier is exactly 2 (single source for the perceived-liveliness rule)", () => {
    expect(ONLINE_DISPLAY_MULT).toBe(2);
  });
  it.each([
    [0, 0, "zero stays zero — an empty city is never faked UP from nothing"],
    [7, 14, "doubles real count"],
    [2.6, 5, "rounds to nearest whole driver"],
    [NaN, 0, "NaN guard -> 0"],
  ] as const)("inflateOnline(%s) -> %s (%s)", (input, expected, _why) => {
    expect(inflateOnline(input)).toBe(expected);
  });
});
