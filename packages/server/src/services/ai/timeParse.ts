// ⏰ Deterministic Uzbek time-phrase parser for AI reminders. The LLM passes the
// customer's time words VERBATIM ("ertaga 7 da") — resolving them to an absolute
// timestamp happens HERE, never in the model (LLMs are unreliable at date math and
// a silently-wrong reminder time is worse than asking). All math is Tashkent time
// (UTC+5 fixed — Uzbekistan has no DST). Returns null (or ambiguous choices) when
// unsure — the bot then asks with buttons instead of guessing.

const TZ_MS = 5 * 3600_000;

export interface ParsedTime {
  runAt: Date; // absolute UTC instant
  label: string; // human-readable Tashkent rendering for the confirm card
}
export interface AmbiguousTime {
  ambiguous: true;
  options: ParsedTime[]; // e.g. 07:00 vs 19:00 — bot renders as buttons
}
export type TimeParseResult = ParsedTime | AmbiguousTime | null;

const WEEKDAYS: [RegExp, number][] = [
  [/\bdushanba\b/i, 1],
  [/\bseshanba\b/i, 2],
  [/\bchorshanba\b/i, 3],
  [/\bpayshanba\b/i, 4],
  [/\bjuma\b/i, 5],
  [/\bshanba\b/i, 6],
  [/\byakshanba\b/i, 0],
];
const DAY_NAMES = ["yakshanba", "dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba"];

function label(wall: Date): string {
  const dd = String(wall.getUTCDate()).padStart(2, "0");
  const mm = String(wall.getUTCMonth() + 1).padStart(2, "0");
  const hh = String(wall.getUTCHours()).padStart(2, "0");
  const mi = String(wall.getUTCMinutes()).padStart(2, "0");
  return `${dd}.${mm} (${DAY_NAMES[wall.getUTCDay()]}) ${hh}:${mi}`;
}
const mk = (wall: Date): ParsedTime => ({ runAt: new Date(wall.getTime() - TZ_MS), label: label(wall) });

/** Parse "ertaga 7 da", "indin 6:30", "juma 9 da", "2 soatdan keyin", "kechqurun"…
 *  minAheadMs guards "in the past"; callers use the reminderService floor (5 min). */
export function parseTimeText(text: string, nowUtc = new Date()): TimeParseResult {
  const t = text.toLowerCase().replace(/[''`]/g, "'").replace(/\s+/g, " ").trim();
  const now = new Date(nowUtc.getTime() + TZ_MS); // Tashkent wall clock in a UTC Date

  // ── relative: "N daqiqa(dan keyin)" / "N soatdan keyin" / "yarim soatdan keyin"
  if (/yarim soat/.test(t)) return mk(new Date(now.getTime() + 30 * 60_000));
  const rel = /(\d{1,3})\s*(daqiqa|minut|soat)/i.exec(t);
  if (rel && /keyin|o'tib|dan\b/.test(t.slice(rel.index))) {
    const n = Number(rel[1]);
    const ms = rel[2]!.startsWith("soat") ? n * 3600_000 : n * 60_000;
    if (ms >= 60_000 && ms <= 30 * 86400_000) return mk(new Date(now.getTime() + ms)); // ≥1 daqiqa
    return null;
  }

  // ── pieces: day / weekday / clock / day-part
  const dayOffset = /\bindin(ga)?\b|\bertadan keyin\b/.test(t) ? 2 : /\bertaga\b/.test(t) ? 1 : /\bbugun\b/.test(t) ? 0 : null;
  let weekday: number | null = null;
  for (const [re, wd] of WEEKDAYS) if (re.test(t)) weekday = wd;

  let hour: number | null = null;
  let minute = 0;
  const hm = /(\d{1,2})[:.](\d{2})\b/.exec(t);
  if (hm) {
    hour = Number(hm[1]);
    minute = Number(hm[2]);
  } else {
    const h = /\bsoat\s+(\d{1,2})\b/.exec(t) ?? /\b(\d{1,2})\s*(?:da|ga|de|dagi)\b/.exec(t);
    if (h) hour = Number(h[1]);
  }
  if (hour !== null && (hour > 23 || minute > 59)) return null;

  const morning = /\bertalab\b|\bazonda\b|\berta bilan\b/.test(t);
  const afternoon = /\btushdan keyin\b|\bpeshin(da)?\b/.test(t);
  const evening = /\bkechqurun\b|\bkechasi\b|\boqshom\b|\bkechki\b/.test(t);

  if (hour === null) {
    if (morning) hour = 7;
    else if (afternoon) hour = 14;
    else if (evening) hour = 19;
    else if (dayOffset === null && weekday === null) return null; // nothing time-like at all
  } else if (hour < 12 && (evening || afternoon)) {
    hour += 12; // "kechqurun 7 da" → 19:00
  }

  // ── resolve the day (weekday wins over bare offset; today counts if still ahead)
  const dayAt = (offset: number, h: number, m: number): Date => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset, h, m));
    return d;
  };
  let offset: number;
  if (weekday !== null) {
    offset = (weekday - now.getUTCDay() + 7) % 7;
    if (offset === 0 && dayAt(0, hour ?? 9, minute).getTime() <= now.getTime()) offset = 7;
  } else {
    offset = dayOffset ?? 0;
  }

  // ── AM/PM ambiguity: bare 1..8 with no day-part word ("ertaga 7 da" — 07:00mi, 19:00mi?).
  // An explicit-minutes form ("7:30") reads as the literal clock — no second-guessing.
  if (hour !== null && hour >= 1 && hour <= 8 && !hm && !morning && !afternoon && !evening) {
    const am = dayAt(offset, hour, minute);
    const pm = dayAt(offset, hour + 12, minute);
    const amOk = am.getTime() > now.getTime();
    const pmOk = pm.getTime() > now.getTime();
    if (amOk && pmOk) return { ambiguous: true, options: [mk(am), mk(pm)] };
    if (pmOk) return mk(pm); // "bugun 7 da" at 15:00 → obviously 19:00
    return null;
  }

  const wall = dayAt(offset, hour ?? 9, minute); // no clock at all ("ertaga") → 09:00 default
  if (wall.getTime() <= now.getTime() + 60_000) return null; // ≥1 daqiqa (reminderService floori bilan bir xil)
  return mk(wall);
}
