// P0-2: the name under the map pin is now worked out on the phone too — it must be exactly the
// server's answer, including its one judgement call: a school the driver knows beats a hot-dog stand
// a few metres closer, but never a place noticeably farther away.
import { describe, expect, it } from "vitest";
import { nearestPlace } from "../pickup";
import type { SavedAddressView } from "../booking";

// ~0.0009° latitude ≈ 100 m in Koson.
const at = (id: number, name: string, dLat: number): SavedAddressView => ({ id, name, lat: 39.0458 + dLat, lng: 65.58 });

describe("nearestPlace", () => {
  it("names the closest place", () => {
    const r = nearestPlace(39.0458, 65.58, [at(1, "ESKI BOZOR", 0.009), at(2, "KOMIL QASSOB", 0.0009)]);
    expect(r?.addr.id).toBe(2);
    expect(r?.km).toBeCloseTo(0.1, 1);
  });

  it("prefers a landmark within +150 m of the closest", () => {
    // hot-dog stand at ~40 m, school at ~120 m → the school
    const r = nearestPlace(39.0458, 65.58, [at(1, "QAZILI XOTDOG", 0.00036), at(2, "5-MAKTAB", 0.00108)]);
    expect(r?.addr.name).toBe("5-MAKTAB");
  });

  it("never a landmark noticeably farther away", () => {
    // hot-dog stand at ~40 m, school at ~300 m → the stand
    const r = nearestPlace(39.0458, 65.58, [at(1, "QAZILI XOTDOG", 0.00036), at(2, "5-MAKTAB", 0.0027)]);
    expect(r?.addr.name).toBe("QAZILI XOTDOG");
  });

  it("skips places with no coordinates, and answers null when there is nothing to name", () => {
    expect(nearestPlace(39.0458, 65.58, [{ id: 1, name: "NO COORDS" }])).toBeNull();
    expect(nearestPlace(39.0458, 65.58, [])).toBeNull();
    expect(nearestPlace(Number.NaN, 65.58, [at(1, "ESKI BOZOR", 0)])).toBeNull();
  });
});
