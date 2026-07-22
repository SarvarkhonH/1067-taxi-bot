// Golden tests for the rules-first arithmetic evaluator (pure function).
// Run: tsx src/scripts/testCalc.ts
import { tryCalc } from "../services/ai/calc";

let pass = 0;
let fail = 0;
function expectVal(input: string, want: string): void {
  const r = tryCalc(input);
  const got = r ? /=\s*<b>([^<]+)<\/b>/.exec(r)?.[1]?.replace(/[  ]/g, " ") : null;
  const ok = got === want;
  ok ? pass++ : fail++;
  console.log(`${ok ? "✅" : "❌"} "${input}" → ${got}${ok ? "" : ` (kutilgan: ${want})`}`);
}
function expectNull(input: string): void {
  const r = tryCalc(input);
  const ok = r === null;
  ok ? pass++ : fail++;
  console.log(`${ok ? "✅" : "❌"} "${input}" → ${ok ? "null" : r}${ok ? "" : " (kutilgan: null)"}`);
}

expectVal("45000 ni 3 ga bo'l", "15 000");
expectNull("45000 ni uchovimizga bo'lsak qancha"); // so'z-son ("uch") v1'da yo'q — LLM'ga tushadi, xato javob bermaydi
expectNull("qancha bo'ladi");
expectVal("12500 + 3400", "15 900");
expectVal("200000 ning 15 foizi", "30 000");
expectVal("45 ming ni 3 ga bo'l", "15 000");
expectVal("1.5 mln + 200000", "1 700 000");
expectVal("(100 + 50) * 2", "300");
expectVal("100000 ga 25000 ni qo'sh", "125 000");
expectVal("90000 dan 15000 ni ayir", "75 000");
expectVal("1 200 000 / 4", "300 000");
expectNull("salom qalaysan");
expectNull("obronga taksi");
expectNull("100 / 0");
expectNull("77007700"); // yolg'iz raqam — amal yo'q
expectVal("15000 x 3", "45 000");

console.log(`\n${pass}/${pass + fail} o'tdi`);
process.exit(fail === 0 ? 0 : 1);
