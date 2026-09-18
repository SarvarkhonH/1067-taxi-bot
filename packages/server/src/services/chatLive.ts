// 🚕 B qism P0-7 (flag `chatlive`): the ride card in the chat, alive.
//
// The ride sweep keeps ONE card per ride and edits it in place (bookingNotifier). With `chatlive`:
//   · the card is pinned — silently — while a driver holds the ride, so it stays at the top of the
//     chat, and unpinned when the ride is closed
//   · "the car is ~1 minute away" is sent once per order, so the passenger is at the door on time
//   · "the driver has arrived" is sent once per order, however many times the sweep sees it
//
// The pin is remembered PER MEMBER as the message id that is pinned (`cardpin:m<id>` = message id):
// a new card (a fresh ride, a re-order in the bot, a card whose id was not saved) replaces the old
// pin instead of stranding it, and closing a ride unpins exactly what is pinned. The two messages are
// once-per-order markers (`prearrive:<id>`, `arrivedping:<id>`). Unsure (database error): "arrived"
// is sent — a rare repeat beats a missed one; "~1 minute" is not — a repeat every tick would be spam.
//
// Decisions only; the sweep does the talking to Telegram and the database through `deps`, so this is
// tested with a fake Telegram and no database (scripts/testChatLive.ts).

import { LagStats, haversineKm } from "@t1067/shared";

export interface ChatLiveDeps {
  /** Create the marker; true only for the call that created it. Database error → `ifUnsure`. */
  claim: (key: string, ifUnsure: boolean) => Promise<boolean>;
  /** The marker's value, or null when there is none. Throws when the database cannot say. */
  peek: (key: string) => Promise<string | null>;
  put: (key: string, value: string) => Promise<void>;
  drop: (key: string) => Promise<void>;
  pin: (chatId: string, messageId: number) => Promise<unknown>;
  unpin: (chatId: string, messageId: number) => Promise<unknown>;
  send: (chatId: string, html: string) => Promise<unknown>;
}

/** A driver holds the ride (the bot's status words, shared/taxiCore). */
const DRIVER_HOLDS = new Set(["accepted", "on_the_way", "arrived", "started"]);
/** The driver is on the way to the passenger. */
const EN_ROUTE = new Set(["accepted", "on_the_way"]);

export const PREARRIVE_TEXT = "🚖 <b>Mashinangiz ~1 daqiqada yetib keladi</b> — chiqishga tayyorlaning";

const pinKey = (memberId: number) => `cardpin:m${memberId}`;

/** Minutes for the car to reach the pickup at town speed — the same estimate the card shows. */
export function etaMinutes(car: { lat: number; lng: number }, pickup: { lat: number; lng: number }, cityKmh: number): number {
  return (haversineKm(car, pickup) / cityKmh) * 60;
}

export interface RideTick {
  enabled: boolean;
  chatId: string;
  memberId: number;
  bookingId: number;
  cardId: number | null;
  status: string;
  car: { lat?: number; lng?: number } | null;
  pickup: { lat?: number; lng?: number } | null;
  cityKmh: number;
}

/** Called by the sweep for every live ride it has a card for. */
export async function chatLiveTick(r: RideTick, deps: ChatLiveDeps): Promise<void> {
  if (!r.enabled || !r.cardId) return;
  if (DRIVER_HOLDS.has(r.status)) {
    const key = pinKey(r.memberId);
    const pinned = await deps.peek(key).catch(() => undefined); // undefined = cannot tell: try next tick
    if (pinned !== undefined && pinned !== String(r.cardId)) {
      await deps.pin(r.chatId, r.cardId).catch(() => undefined);
      await deps.put(key, String(r.cardId)).catch(() => undefined);
      if (pinned) await deps.unpin(r.chatId, Number(pinned)).catch(() => undefined); // the previous card
    }
  }
  const car = r.car;
  const pickup = r.pickup;
  if (
    EN_ROUTE.has(r.status) &&
    typeof car?.lat === "number" && typeof car.lng === "number" &&
    typeof pickup?.lat === "number" && typeof pickup.lng === "number" &&
    etaMinutes({ lat: car.lat, lng: car.lng }, { lat: pickup.lat, lng: pickup.lng }, r.cityKmh) <= 1 &&
    (await deps.claim(`prearrive:${r.bookingId}`, false))
  ) {
    await deps.send(r.chatId, PREARRIVE_TEXT).catch(() => undefined);
  }
}

/**
 * "The driver has arrived" — may it be sent? Without `chatlive`: yesterday's rule (the caller's own
 * status-change gate). With it: once per order, whichever path of the sweep saw the arrival.
 */
export async function arrivedPingOnce(enabled: boolean, bookingId: number, deps: Pick<ChatLiveDeps, "claim">): Promise<boolean> {
  if (!enabled) return true;
  return deps.claim(`arrivedping:${bookingId}`, true);
}

/**
 * A ride is being closed: take down whatever card of this member is pinned — whatever the flag says
 * now (a flag switched off mid-ride must not leave a card pinned for ever). Nothing pinned → nothing.
 */
export async function chatLiveClose(
  r: { chatId: string; memberId: number; cardId?: number | null },
  deps: Pick<ChatLiveDeps, "peek" | "drop" | "unpin">,
): Promise<void> {
  const key = pinKey(r.memberId);
  const pinned = await deps.peek(key).catch(() => undefined);
  if (pinned === undefined) {
    // The database cannot say what is pinned, and the ride is being cleared now: take this ride's
    // card down anyway (unpinning a card that is not pinned is harmless; a stranded pin is not).
    if (r.cardId) await deps.unpin(r.chatId, r.cardId).catch(() => undefined);
    return;
  }
  if (!pinned) return;
  await deps.unpin(r.chatId, Number(pinned)).catch(() => undefined);
  await deps.drop(key).catch(() => undefined);
}

// ── D7.1: how late the card moves after the core changed the order ──
const cardLag = new LagStats(200);

/** `emittedAt` = when the core sent the nudge for this order (coreStream), or null without one. */
export function noteCardLag(emittedAt: number | null, now = Date.now()): void {
  if (emittedAt == null || !Number.isFinite(emittedAt)) return;
  cardLag.add(now - emittedAt);
  if (cardLag.total % 20 === 0) console.log(`[card] lag p95=${cardLag.p95()}ms over the last ${cardLag.count}`);
}
