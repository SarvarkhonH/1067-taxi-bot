// 🤖 V2 AI concierge — rules-first (no LLM needed): turns a free-text ride request
// like "ertaga 8:00 ishxonaga" into a concrete scheduled-ride time. The LLM layer
// (llmRouter) only ever helps with unmatched SUPPORT questions; booking stays
// deterministic so it never mis-dispatches. Tashkent = UTC+5 (no DST).
const TK_OFFSET_MS = 5 * 3600 * 1000;

/** Parse an Uzbek time expression → an absolute Date, or null if none found. */
export function parseRideTime(text: string): Date | null {
  const t = text.toLowerCase();
  let hour: number | null = null;
  let minute = 0;

  const hm = t.match(/(\d{1,2})[:.](\d{2})/);
  if (hm) {
    hour = Number(hm[1]);
    minute = Number(hm[2]);
  }
  if (hour === null) {
    const soat = t.match(/soat\s*(\d{1,2})|(\d{1,2})\s*(?:da|ta|larda)\b/);
    if (soat) hour = Number(soat[1] ?? soat[2]);
  }
  if (hour === null) {
    if (/ertalab|tong/.test(t)) hour = 8;
    else if (/tush|kunduz/.test(t)) hour = 13;
    else if (/kech|oqshom|kechqurun/.test(t)) hour = 19;
  }
  if (hour === null || hour < 0 || hour > 23 || minute > 59) return null;

  const tomorrow = /ertaga|erta\b/.test(t);
  const nowTk = new Date(Date.now() + TK_OFFSET_MS);
  let y = nowTk.getUTCFullYear();
  let mo = nowTk.getUTCMonth();
  let d = nowTk.getUTCDate();
  if (tomorrow) {
    const nx = new Date(Date.UTC(y, mo, d + 1));
    y = nx.getUTCFullYear();
    mo = nx.getUTCMonth();
    d = nx.getUTCDate();
  }
  // Tashkent wall-clock → UTC instant
  return new Date(Date.UTC(y, mo, d, hour, minute) - TK_OFFSET_MS);
}

/** Human label for a ride time in Tashkent: "bugun 19:00" / "ertaga 08:00". */
export function fmtRideTime(d: Date): string {
  const tk = new Date(d.getTime() + TK_OFFSET_MS);
  const nowTk = new Date(Date.now() + TK_OFFSET_MS);
  const dayOf = (x: Date): string => x.toISOString().slice(0, 10);
  const tomorrowKey = dayOf(new Date(nowTk.getTime() + 86_400_000));
  const hh = String(tk.getUTCHours()).padStart(2, "0");
  const mm = String(tk.getUTCMinutes()).padStart(2, "0");
  const label = dayOf(tk) === dayOf(nowTk) ? "bugun" : dayOf(tk) === tomorrowKey ? "ertaga" : dayOf(tk).slice(5).replace("-", ".");
  return `${label} ${hh}:${mm}`;
}
