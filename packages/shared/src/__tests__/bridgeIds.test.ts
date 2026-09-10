import { describe, it, expect } from "vitest";
import { BRIDGE_ID_OFFSET, toBridgeId, fromBridgeId, isBridgeId } from "../bridgeIds";

describe("bridgeIds — B ids must never collide with kas ids", () => {
  it("lifts a small B id above every real kas id", () => {
    expect(toBridgeId(1)).toBe(BRIDGE_ID_OFFSET + 1);
    expect(toBridgeId(4)).toBe(BRIDGE_ID_OFFSET + 4);
  });

  it("round-trips", () => {
    for (const id of [1, 4, 99, 12345, 999_999]) {
      expect(fromBridgeId(toBridgeId(id))).toBe(id);
    }
  });

  it("leaves a genuine kas id alone", () => {
    // Real kas booking ids are in the millions — below the offset.
    expect(fromBridgeId(4)).toBe(4);
    expect(fromBridgeId(2_500_000)).toBe(2_500_000);
    expect(isBridgeId(2_500_000)).toBe(false);
  });

  it("is idempotent — shifting twice must not create a third id space", () => {
    const once = toBridgeId(7);
    expect(toBridgeId(once)).toBe(once);
  });

  it("tells the two id spaces apart", () => {
    expect(isBridgeId(toBridgeId(1))).toBe(true);
    expect(isBridgeId(1)).toBe(false);
  });

  it("keeps ids inside the safe-integer range", () => {
    expect(toBridgeId(999_999)).toBeLessThan(Number.MAX_SAFE_INTEGER);
  });

  it("rejects nonsense rather than silently corrupting a money key", () => {
    expect(() => toBridgeId(-1)).toThrow(RangeError);
    expect(() => toBridgeId(NaN)).toThrow(RangeError);
    expect(() => fromBridgeId(-1)).toThrow(RangeError);
  });
});

describe("bridgeIds — the collision this prevents", () => {
  it("a B order and a kas booking with the same raw number stay distinct", () => {
    const bOrderId   = 4;             // B: orders.id serial
    const kasBooking  = 4;            // kas: an old booking that happens to be 4

    // What the coin ledger would key on, before and after namespacing.
    const naiveKeyB   = `ride:${bOrderId}`;
    const naiveKeyKas = `ride:${kasBooking}`;
    expect(naiveKeyB).toBe(naiveKeyKas);        // ← the bug: same idempotency key

    const safeKeyB   = `ride:${toBridgeId(bOrderId)}`;
    const safeKeyKas = `ride:${kasBooking}`;
    expect(safeKeyB).not.toBe(safeKeyKas);      // ← distinct after namespacing
  });
});
