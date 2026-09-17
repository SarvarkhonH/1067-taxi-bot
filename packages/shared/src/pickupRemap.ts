/**
 * Stored pickup ids, carried across the switch from kas1067 to our own taxi core.
 *
 * Members remember where they last booked from (lastPickupId, defaultPickupId,
 * up to three recent places) and scheduled rides hold a place id. Every one of
 * those ids was issued by kas1067. The core numbers the same places from 1, and
 * keeps kas's number as `externalId` — so the same id means a different place
 * on each side. Sent unchanged, a remembered "Shabada" would dispatch a car to
 * whichever place the core happens to number the same.
 *
 * The rule, in order:
 *   0 / null      nothing remembered — unchanged
 *   negative      already travels by coordinates only — unchanged
 *   known kas id  → the core's id for that place
 *   unknown id    → COORDS_ONLY_PICKUP_ID when coordinates were remembered (the order goes by
 *                   the coordinates), otherwise null (forget it: a place we
 *                   cannot locate must not be offered as a one-tap pickup)
 *
 * Applying this twice would read the core's new ids as kas ids, so the cutover
 * script records that it ran and refuses a second pass.
 */

export interface CorePlace {
  /** The core's own id. */
  id: number;
  name: string;
  lat?: number;
  lng?: number;
}

/** kas1067 place id → the core's place. */
export type KasPlaceMap = ReadonlyMap<number, CorePlace>;

// Far outside the range of negated saved-place ids (-1, -2, …), so the two can never be confused.
export const COORDS_ONLY_PICKUP_ID = -999_999_999;

export function remapPickupId(oldId: number | null | undefined, hasCoords: boolean, map: KasPlaceMap): number | null {
  if (oldId === null || oldId === undefined || oldId === 0) return oldId ?? null;
  if (oldId < 0) return oldId;
  const hit = map.get(oldId);
  if (hit) return hit.id;
  return hasCoords ? COORDS_ONLY_PICKUP_ID : null;
}

export interface RecentPickup {
  id: number;
  name: string;
  lat?: number | null;
  lng?: number | null;
}

/** The "Yana shu yo'l" list: each entry remapped; an entry that can no longer be located is dropped. */
export function remapRecentPickups(list: RecentPickup[], map: KasPlaceMap): RecentPickup[] {
  const out: RecentPickup[] = [];
  for (const p of list) {
    const hasCoords = p.lat != null && p.lng != null;
    const id = remapPickupId(p.id, hasCoords, map);
    if (id === null) continue;
    out.push({ ...p, id });
  }
  return out;
}
