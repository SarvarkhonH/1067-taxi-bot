import { describe, it, expect } from "vitest";
import { remapPickupId, remapRecentPickups, COORDS_ONLY_PICKUP_ID, type CorePlace } from "../pickupRemap";

// kas 5301 = "Shabada" is the core's place 12; kas 5302 = "Eski bozor" is the core's 3.
const map = new Map<number, CorePlace>([
  [5301, { id: 12, name: "Shabada", lat: 39.03, lng: 65.59 }],
  [5302, { id: 3, name: "Eski bozor", lat: 39.04, lng: 65.58 }],
]);

describe("a remembered pickup keeps meaning the same place", () => {
  it("moves a known kas id to the core's id for that place", () => {
    expect(remapPickupId(5301, false, map)).toBe(12);
    expect(remapPickupId(5302, true, map)).toBe(3);
  });

  it("never passes a kas id through, even one that is also a valid core id", () => {
    // kas id 12 is not the core's place 12. Unknown to the map → it cannot stay 12.
    expect(remapPickupId(12, false, map)).toBeNull();
    expect(remapPickupId(12, true, map)).toBe(COORDS_ONLY_PICKUP_ID);
  });

  it("keeps nothing and coordinates-only as they are", () => {
    expect(remapPickupId(0, true, map)).toBe(0);
    expect(remapPickupId(null, true, map)).toBeNull();
    expect(remapPickupId(undefined, false, map)).toBeNull();
    expect(remapPickupId(-1, true, map)).toBe(-1); // a negated saved-place id
    expect(remapPickupId(-7, false, map)).toBe(-7);
  });

  it("forgets a place it cannot locate rather than offering it as a one-tap pickup", () => {
    expect(remapPickupId(9999, false, map)).toBeNull();
  });

  it("keeps an unknown place that still has coordinates, travelling by them", () => {
    expect(remapPickupId(9999, true, map)).toBe(COORDS_ONLY_PICKUP_ID);
  });
});

describe("the recent-places chips", () => {
  it("remaps each chip and drops the ones that can no longer be located", () => {
    const out = remapRecentPickups(
      [
        { id: 5301, name: "Shabada" },
        { id: 9999, name: "Yo'qolgan joy" },
        { id: 8888, name: "Xaritadagi nuqta", lat: 39.01, lng: 65.6 },
        { id: 0, name: "Pin", lat: 39.02, lng: 65.61 },
      ],
      map,
    );
    expect(out).toEqual([
      { id: 12, name: "Shabada" },
      { id: COORDS_ONLY_PICKUP_ID, name: "Xaritadagi nuqta", lat: 39.01, lng: 65.6 },
      { id: 0, name: "Pin", lat: 39.02, lng: 65.61 },
    ]);
  });
});
