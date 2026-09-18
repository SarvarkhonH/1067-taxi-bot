import { describe, it, expect } from "vitest";
import { MinSpacing, glideMs, telegramHeading, unwrapBearing } from "../rideMap";

// P0-5: a stream of fixes has to look like a car driving, not a dot jumping and spinning.

describe("gliding between fixes", () => {
  it("takes as long as the fixes are apart, so the car arrives as the next fix does", () => {
    expect(glideMs(10_000, 12_000)).toBe(2_000);
    expect(glideMs(10_000, 13_500)).toBe(3_500);
  });

  it("never faster than 0.8 s nor slower than 5 s", () => {
    expect(glideMs(10_000, 10_100)).toBe(800);
    expect(glideMs(10_000, 60_000)).toBe(5_000);
  });

  it("places the first fix instead of gliding from nowhere", () => {
    expect(glideMs(null, 10_000)).toBe(0);
    expect(glideMs(Number.NaN, 10_000)).toBe(0);
  });
});

describe("turning the short way", () => {
  it("350° → 10° turns 20° clockwise, not 340° back", () => {
    expect(unwrapBearing(350, 10)).toBe(370);
    expect(unwrapBearing(10, 350)).toBe(-10);
  });

  it("keeps turning smoothly from an angle already past 360", () => {
    expect(unwrapBearing(370, 20)).toBe(380);   // from 10° (as 370) to 20°
    expect(unwrapBearing(-10, 330)).toBe(-30);  // from 350° (as -10) to 330°
  });

  it("a U-turn picks one way and sticks to the 180° rule", () => {
    expect(unwrapBearing(0, 180)).toBe(180);
    expect(unwrapBearing(90, 270)).toBe(270);
  });

  it("the first bearing is taken as it is", () => {
    expect(unwrapBearing(null, 725)).toBe(5);
    expect(unwrapBearing(null, -90)).toBe(270);
  });
});

describe("Telegram's heading", () => {
  it("is 1–360: north is 360, never 0", () => {
    expect(telegramHeading(0)).toBe(360);
    expect(telegramHeading(360)).toBe(360);
    expect(telegramHeading(90.4)).toBe(90);
    expect(telegramHeading(-90)).toBe(270);
  });

  it("is left out when unknown", () => {
    expect(telegramHeading(undefined)).toBeUndefined();
    expect(telegramHeading(Number.NaN)).toBeUndefined();
    expect(telegramHeading("90")).toBeUndefined();
  });
});

describe("one chat edit per ride every 4 s", () => {
  it("lets the first through and holds the rest for 4 s, per ride", () => {
    const s = new MinSpacing(4_000);
    expect(s.take(7, 0)).toBe(true);
    expect(s.take(7, 2_000)).toBe(false);
    expect(s.take(8, 2_000)).toBe(true);   // another ride is not held by this one
    expect(s.take(7, 3_999)).toBe(false);
    expect(s.take(7, 4_000)).toBe(true);
    expect(s.take(7, 6_000)).toBe(false);  // measured from the last one let through
  });

  it("forgets idle rides so it does not grow all day", () => {
    const s = new MinSpacing(4_000, 60_000);
    for (let i = 0; i < 300; i++) s.take(i, 0);
    s.take("late", 120_000);
    expect(s.size).toBeLessThan(10);
  });
});
