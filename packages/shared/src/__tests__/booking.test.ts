// Booking pure-helper suite (NEXT_LEVEL_PLAN Phase-0 0.6) — status labels,
// cancellability, step index, haversine. No DB / network / kas — pure functions.
import { describe, expect, it } from "vitest";
import { BOOKING_STEPS, bookingCancellable, bookingStatusLabel, bookingStepIndex, haversineKm } from "../booking";

describe("bookingStatusLabel", () => {
  it('"new" (and the other pre-dispatch statuses) read as searching', () => {
    expect(["new", "searching", "in_place"].map(bookingStatusLabel)).toEqual([
      "🔍 Haydovchi qidirilyapti",
      "🔍 Haydovchi qidirilyapti",
      "🔍 Haydovchi qidirilyapti",
    ]);
  });
  it("all three terminal statuses share the finished label (delivered = kas terminal)", () => {
    expect(["delivered", "finished", "completed"].map(bookingStatusLabel)).toEqual([
      "🏁 Safar yakunlandi",
      "🏁 Safar yakunlandi",
      "🏁 Safar yakunlandi",
    ]);
  });
  it("unknown status falls back to an info label, never crashes", () => {
    expect(bookingStatusLabel("weird_status")).toBe("ℹ️ weird_status");
  });
});

describe("bookingCancellable", () => {
  it("cancellable while searching / driver en route", () => {
    const yes = ["in_place", "searching", "new", "called", "accepted", "on_the_way"];
    expect(yes.map(bookingCancellable)).toEqual(yes.map(() => true));
  });
  it("NOT cancellable once arrived / riding / finished", () => {
    const no = ["arrived", "started", "finished", "delivered"];
    expect(no.map(bookingCancellable)).toEqual(no.map(() => false));
  });
  it('"take" is NOT cancellable as implemented — FLAGGED discrepancy, see comment', () => {
    // ⚠️ SPEC-VS-CODE DISCREPANCY (reported, not fixed — this suite must not
    // change booking.ts): the Phase-0 0.6 ticket expected `"take" -> yes`, and
    // the function's own docstring says "Cancellable only before the driver has
    // arrived" — kas "take" means the driver ACCEPTED but has NOT arrived, so
    // by that rule it should be cancellable. The implementation, however, omits
    // "take" from the list (booking.ts bookingCancellable). This test pins the
    // CURRENT behavior; if the owner rules "take" should cancel, fix booking.ts
    // and flip this expectation in the same commit.
    expect(bookingCancellable("take")).toBe(false);
  });
});

describe("bookingStepIndex", () => {
  it("maps statuses onto the 4-step timeline (unknown -> 0)", () => {
    expect(["new", "searching", "take", "called", "accepted", "on_the_way", "arrived", "started", "???"].map(bookingStepIndex)).toEqual([
      0, 0, 0, 1, 1, 1, 2, 3, 0,
    ]);
  });
  it("every index fits the BOOKING_STEPS rail (4 steps)", () => {
    expect(BOOKING_STEPS.length).toBe(4);
    const all = ["new", "called", "arrived", "started", "delivered", "garbage"].map(bookingStepIndex);
    expect(all.every((i) => i >= 0 && i < BOOKING_STEPS.length)).toBe(true);
  });
});

describe("haversineKm", () => {
  it("zero distance for identical points", () => {
    const p = { lat: 41.2995, lng: 69.2401 }; // Tashkent
    expect(haversineKm(p, p)).toBe(0);
  });
  it("1 degree of latitude ≈ 111.19 km (exact great-circle, ±2%)", () => {
    const d = haversineKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
    expect(Math.abs(d - 111.19) / 111.19).toBeLessThan(0.02);
  });
  it("Tashkent -> Samarkand ≈ 266 km air distance (±2%)", () => {
    const d = haversineKm({ lat: 41.2995, lng: 69.2401 }, { lat: 39.6542, lng: 66.9597 });
    expect(Math.abs(d - 266) / 266).toBeLessThan(0.02);
  });
  it("is symmetric: d(a,b) === d(b,a)", () => {
    const a = { lat: 41.2995, lng: 69.2401 };
    const b = { lat: 40.1, lng: 67.8 };
    expect(haversineKm(a, b)).toBe(haversineKm(b, a));
  });
});
