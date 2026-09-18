// 🚕 B qism P0-2 (fastopen): "this passenger may be on a ride right now".
//
// The taxi screen paints from the phone's last answer only when no ride can be live — otherwise a
// passenger who reopens the app during their ride (the most common reopen) would see the order sheet
// until the network answered. Set the moment an order goes through (api.ts) or a ride is on screen;
// cleared only by a fresh server answer that says there is no ride (fastOpen.writeBootCache).
// A ride ordered outside the Mini App (the bot, a phone call) cannot be seen here — then the fresh
// answer remounts the screen onto the ride within a second, and the server refuses a second car.
// Its own tiny module so api.ts can set it without importing the fast-open code.

import { tg } from "./telegram";

const RIDE_MARK_TTL_MS = 6 * 3600_000; // a ride and its finish screen are long over by then

function key(): string {
  return `b3:ride:v1:${tg?.initDataUnsafe?.user?.id ?? "anon"}`;
}

export function noteRideLive(): void {
  try { localStorage.setItem(key(), String(Date.now())); } catch { /* no storage: the cache is not used */ }
}

export function clearRideLive(): void {
  try { localStorage.removeItem(key()); } catch { /* ignore */ }
}

/** True when a ride may be live (or storage cannot tell — then play safe). */
export function rideMayBeLive(): boolean {
  try {
    const at = Number(localStorage.getItem(key()) ?? 0);
    return at > 0 && Date.now() - at < RIDE_MARK_TTL_MS;
  } catch {
    return true;
  }
}
