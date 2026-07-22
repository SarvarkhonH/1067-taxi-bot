// Golden tests for the deterministic Uzbek time parser (pure function — no DB, no LLM).
// Fixed "now": 2026-07-22 10:00 Tashkent (Wednesday/chorshanba) = 05:00 UTC.
// Run: tsx src/scripts/testTimeParse.ts
import { parseTimeText, type ParsedTime, type TimeParseResult } from "../services/ai/timeParse";

const NOW = new Date("2026-07-22T05:00:00Z"); // 10:00 Toshkent, chorshanba

let pass = 0;
let fail = 0;

function expectAt(input: string, wantTk: string): void {
  const r = parseTimeText(input, NOW);
  const got = r && !("ambiguous" in r) ? new Date(r.runAt.getTime() + 5 * 3600_000).toISOString().slice(0, 16) : JSON.stringify(r);
  const ok = got === wantTk;
  ok ? pass++ : fail++;
  console.log(`${ok ? "✅" : "❌"} "${input}" → ${got}${ok ? "" : ` (kutilgan: ${wantTk})`}`);
}
function expectAmbiguous(input: string, wantHours: number[]): void {
  const r = parseTimeText(input, NOW) as TimeParseResult;
  const hours = r && "ambiguous" in r ? r.options.map((o: ParsedTime) => new Date(o.runAt.getTime() + 5 * 3600_000).getUTCHours()) : null;
  const ok = JSON.stringify(hours) === JSON.stringify(wantHours);
  ok ? pass++ : fail++;
  console.log(`${ok ? "✅" : "❌"} "${input}" → ambiguous ${JSON.stringify(hours)}${ok ? "" : ` (kutilgan: ${JSON.stringify(wantHours)})`}`);
}
function expectNull(input: string): void {
  const r = parseTimeText(input, NOW);
  const ok = r === null;
  ok ? pass++ : fail++;
  console.log(`${ok ? "✅" : "❌"} "${input}" → ${ok ? "null" : JSON.stringify(r)}${ok ? "" : " (kutilgan: null)"}`);
}

// relative
expectAt("30 daqiqadan keyin", "2026-07-22T10:30");
expectAt("2 soatdan keyin", "2026-07-22T12:00");
expectAt("yarim soatdan keyin", "2026-07-22T10:30");
expectNull("2 daqiqadan keyin"); // < 5 min floor

// explicit clock — unambiguous
expectAt("ertaga 7:30 da", "2026-07-23T07:30");
expectAt("indin 6:30", "2026-07-24T06:30");
expectAt("bugun 18:00 da", "2026-07-22T18:00");
expectAt("ertaga soat 14 da", "2026-07-23T14:00");
expectAt("ertaga 11 da", "2026-07-23T11:00"); // 9..11 — 23:00 o'qishi g'ayritabiiy emas, lekin 11 kunduz deb olamiz

// day-part words resolve AM/PM
expectAt("ertaga ertalab 7 da", "2026-07-23T07:00");
expectAt("ertaga kechqurun 7 da", "2026-07-23T19:00");
expectAt("kechqurun", "2026-07-22T19:00");
expectAt("ertaga ertalab", "2026-07-23T07:00");
expectAt("tushdan keyin", "2026-07-22T14:00");

// ambiguity: bare small hour, both readings still ahead
expectAmbiguous("ertaga 7 da", [7, 19]);
expectAmbiguous("payshanba 8 da", [8, 20]);
// bare small hour TODAY where AM already passed → PM auto-resolved
expectAt("bugun 7 da", "2026-07-22T19:00");
expectAt("5 da", "2026-07-22T17:00");

// weekday resolution (now = chorshanba 10:00)
expectAt("payshanba 9:00 da", "2026-07-23T09:00"); // tomorrow
expectAt("juma 18:00", "2026-07-24T18:00");
expectAt("chorshanba 9:00 da", "2026-07-29T09:00"); // today's 9:00 passed → NEXT chorshanba
expectAt("chorshanba 15:00 da", "2026-07-22T15:00"); // today, still ahead

// day only → 09:00 default
expectAt("ertaga", "2026-07-23T09:00");
expectAt("indin", "2026-07-24T09:00");

// garbage / past
expectNull("salom");
expectNull("bugun 9:00 da"); // 9:00 passed, explicit minutes → no silent PM guess
expectNull("25:70 da");

console.log(`\n${pass}/${pass + fail} o'tdi`);
process.exit(fail === 0 ? 0 : 1);
