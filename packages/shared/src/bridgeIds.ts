/**
 * Id namespacing for the A ↔ B (BirJoySource) bridge.
 *
 * B's `orders.id` is a fresh `serial` starting at 1. kas1067 booking ids run
 * into the millions after years of history. A keys MONEY on those ids —
 * `CoinTxn.idempotencyKey` and `RideReward`'s unique constraint both embed a
 * bookingId — so B's order 4 and a historical kas booking 4 are indistinguishable.
 *
 * That is not a cosmetic clash. Either a coin grant is silently skipped as
 * "already paid for this ride", or an old ride's reward is re-applied to a new
 * one. Both are wrong in a way nobody notices until the numbers are audited.
 *
 * So ids crossing the bridge are namespaced: B ids are shifted above every real
 * kas id on the way out, and shifted back on the way in. The offset sits far
 * above any observed kas id and far below Number.MAX_SAFE_INTEGER.
 *
 * Lives in `shared` rather than next to BirJoySource because `packages/server`
 * has no test runner — and this is money logic, so it must be covered by the CI
 * shield that runs `@t1067/shared`.
 */

/** Ids at or above this came from B, not from kas1067. */
export const BRIDGE_ID_OFFSET = 900_000_000;

/** B order id → the id A, the coin ledger and RideReward see. */
export function toBridgeId(bId: number): number {
  if (!Number.isFinite(bId) || bId < 0) {
    throw new RangeError(`toBridgeId: expected a non-negative id, got ${bId}`);
  }
  if (bId >= BRIDGE_ID_OFFSET) {
    // Already namespaced — shifting twice would silently create a third id
    // space and defeat the whole point.
    return bId;
  }
  return bId + BRIDGE_ID_OFFSET;
}

/** An id seen by A → B's real order id. Leaves genuine kas ids untouched. */
export function fromBridgeId(outerId: number): number {
  if (!Number.isFinite(outerId) || outerId < 0) {
    throw new RangeError(`fromBridgeId: expected a non-negative id, got ${outerId}`);
  }
  return outerId >= BRIDGE_ID_OFFSET ? outerId - BRIDGE_ID_OFFSET : outerId;
}

/** True when this id refers to a ride that lives in B. */
export function isBridgeId(id: number): boolean {
  return Number.isFinite(id) && id >= BRIDGE_ID_OFFSET;
}
