// 🚕 B qism P0-2 (D2.6): how fast the taxi screen really is, on passengers' own phones.
//
// The Mini App measures a handful of moments (ms from the tap on "Taksi") and sends them once with
// navigator.sendBeacon; the server writes one `[ux]` log line. Nothing is stored and nothing
// identifies the passenger. Only these names, only whole milliseconds under a minute, get through.

export const UX_MARK_NAMES = ["sheet", "name", "boot"] as const;
export type UxMarkName = (typeof UX_MARK_NAMES)[number];

export interface UxMarks {
  /** Tap → the pickup sheet is on screen. */
  sheet?: number;
  /** Tap → the place name under the pin is shown. */
  name?: number;
  /** The /api/booking/boot round trip. */
  boot?: number;
  /** Whether the sheet came from the phone's cache. */
  cache?: boolean;
}

/** One log line from whatever the phone sent, or null when nothing in it is usable. */
export function uxMarksLine(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const parts: string[] = [];
  for (const k of UX_MARK_NAMES) {
    const v = r[k];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 60_000) parts.push(`${k}=${Math.round(v)}`);
  }
  if (!parts.length) return null;
  if (typeof r.cache === "boolean") parts.push(`cache=${r.cache ? "hit" : "miss"}`);
  return parts.join(" ");
}
