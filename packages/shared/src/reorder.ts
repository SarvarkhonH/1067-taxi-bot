// 🚕 B qism P0-8 (flag `tapreorder`): one tap calls the car to the usual place — no confirm screen
// (owner decision Q2). The confirm screen stays where a wrong car costs most:
//   · a passenger's first ride — nothing is known yet, the place may be a guess
//   · after 4 self-cancels in a day — phantom orders take a real driver off the road (the same
//     limit the server's one-tap path already enforces: CANCEL_FARM_LIMIT)
// Pure, so the Mini App, the bot and the server decide it the same way.

export const REORDER_CANCEL_LIMIT = 4;

export function reorderNeedsConfirm(o: { trips: number | null | undefined; cancelsToday: number | null | undefined }): boolean {
  const trips = Number(o.trips ?? 0);
  const cancels = Number(o.cancelsToday ?? 0);
  if (!Number.isFinite(trips) || trips < 1) return true;
  return Number.isFinite(cancels) && cancels >= REORDER_CANCEL_LIMIT;
}
