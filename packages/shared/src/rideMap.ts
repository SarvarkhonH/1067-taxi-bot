// 🚕 B qism P0-5 (flag `ridemap`): the driver's car, moving on the passenger's map and in the chat.
//
// Positions reach the passenger as they happen (the core's `svc:loc`, relayed by the bot). These are
// the rules for turning a stream of fixes into movement that looks like a car and not a jumping dot.
// Pure, so they are the same in the Mini App and the bot, and testable without either.

/**
 * How long the marker takes to glide to a new fix: the time since the previous one, so it arrives
 * just as the next fix does. Clamped to 0.8–5 s — faster reads as a jump, slower as a lagging car
 * (a gap longer than 5 s is a lost fix, not a slow car). The first fix is placed, not glided.
 */
export function glideMs(prevAt: number | null, now: number): number {
  if (prevAt == null || !Number.isFinite(prevAt)) return 0;
  return Math.min(5_000, Math.max(800, now - prevAt));
}

/**
 * The angle to hand CSS `rotate()` so the car turns the SHORT way. `prev` is the last value handed
 * out (it may be outside 0–360 — that is the point); `target` is a compass bearing. 350° → 10° turns
 * 20° clockwise to 370°, not 340° back.
 */
export function unwrapBearing(prev: number | null, target: number): number {
  const t = ((target % 360) + 360) % 360;
  if (prev == null || !Number.isFinite(prev)) return t;
  const from = ((prev % 360) + 360) % 360;
  let delta = t - from;
  if (delta > 180) delta -= 360;
  if (delta <= -180) delta += 360;
  return prev + delta;
}

/** Telegram's live-location heading is 1–360 (0 is not allowed); unknown → leave it out. */
export function telegramHeading(bearing: unknown): number | undefined {
  const b = typeof bearing === "number" && Number.isFinite(bearing) ? Math.round(((bearing % 360) + 360) % 360) : NaN;
  if (Number.isNaN(b)) return undefined;
  return b === 0 ? 360 : b;
}

/**
 * At most one action per key every `minMs` — the chat's live location is edited no more often than
 * every 4 s per ride (Telegram rate-limits edits; a passenger cannot see finer anyway). Forgets keys
 * idle for ten minutes, so a day of rides does not grow it.
 */
export class MinSpacing {
  private readonly last = new Map<string | number, number>();
  constructor(private readonly minMs: number, private readonly forgetMs = 10 * 60_000) {}

  /** True (and remembered) when the key may act now. */
  take(key: string | number, now: number): boolean {
    const prev = this.last.get(key);
    if (prev != null && now - prev < this.minMs) return false;
    this.last.set(key, now);
    if (this.last.size > 256) {
      for (const [k, at] of this.last) if (now - at > this.forgetMs) this.last.delete(k);
    }
    return true;
  }

  get size(): number {
    return this.last.size;
  }
}
