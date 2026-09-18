// 🚕 B qism P0-5 (flag `ridemap`): the chat's live location follows the car from the core's stream.
//
// The ride sweep keeps ONE live-location message per ride and edits it each tick (every 5–15 s,
// 20–30 s under a healthy stream). With `ridemap` the core's `svc:loc` edits that same message too,
// at most once every 4 s per ride, so the car moves in the chat about as it moves on the road.
//
// It only ever EDITS the message the sweep sent — never sends one (one pin per ride stays the sweep's
// rule) — and only for the member whose current ride this order is AND whose phone it names, the same
// rule as the Mini App's socket. A finished ride has no current ride, so it gets nothing.
//
// Flag off: the owner's own rides only (`previewTail`, a cached set — no database read for anyone
// else's car), so ridemap is accepted on a real phone before any customer gets it.

import { MinSpacing, telegramHeading, toBridgeId, type CoreLoc } from "@t1067/shared";

export interface LivePinDeps {
  /** `ridemap` on: every passenger. */
  enabled: () => Promise<boolean>;
  /** Flag off: is this the owner's phone (preview)? Absent = nobody. */
  previewTail?: (tail9: string) => Promise<boolean>;
  /** The live-location message of this member's current ride, when `bookingId` IS that ride. */
  pinFor: (bookingId: number, tail9: string) => Promise<{ chatId: string; messageId: number } | null>;
  edit: (chatId: string, messageId: number, lat: number, lng: number, heading?: number) => Promise<unknown>;
  onLoc: (fn: (l: CoreLoc) => void) => unknown;
  now?: () => number;
}

export const LIVE_PIN_MIN_MS = 4_000;

export function startLivePin(deps: LivePinDeps): void {
  const spacing = new MinSpacing(LIVE_PIN_MIN_MS);
  const now = deps.now ?? Date.now;
  let failures = 0;
  let loggedAt = 0;

  deps.onLoc(async (l: CoreLoc) => {
    if (!l || !Number.isFinite(l.lat) || !Number.isFinite(l.lng) || !l.phoneTail9) return;
    if (!Number.isInteger(l.orderId) || l.orderId <= 0) return; // toBridgeId would throw on it
    // Claimed before any await, so two fixes a moment apart can never both edit.
    if (!spacing.take(l.orderId, now())) return;
    const everyone = await deps.enabled().catch(() => false);
    if (!everyone && !(await deps.previewTail?.(l.phoneTail9).catch(() => false))) return;
    const pin = await deps.pinFor(toBridgeId(l.orderId), l.phoneTail9).catch(() => null);
    if (!pin) return;
    try {
      await deps.edit(pin.chatId, pin.messageId, l.lat, l.lng, telegramHeading(l.bearing));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/not modified/i.test(msg)) return; // the car has not moved: the pin is already right
      failures++;
      if (now() - loggedAt > 60_000) {
        loggedAt = now();
        console.warn(`[livepin] edit failed (${failures} so far): ${msg}`);
      }
    }
  });
}
