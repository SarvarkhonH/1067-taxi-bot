// Fuzzy address matching test — against the LIVE kas catalog (read-only). Proves typo/letter-swap
// tolerance: the screenshot failures ("postgayi", "shabda") now resolve. Run:
//   dotenv -e ../../.env -- tsx src/scripts/testAddr.ts
import "../env";
import { getDataSource } from "../kas";
import { fuzzyDistance, fuzzyWords } from "../bot/booking";

let pass = 0;
let fail = 0;

async function main(): Promise<void> {
  const cat = await getDataSource().getAllAddresses().catch(() => [] as { id: number; name: string }[]);
  if (!cat.length) {
    console.error("katalog bo'sh — kas ulanmadi, test o'tkazib yuborildi");
    process.exit(0);
  }
  const thr = (q: string): number => Math.max(1, Math.min(3, Math.floor(q.replace(/[^\p{L}\p{N}]/gu, "").length * 0.34)));
  function topMatch(q: string): string | null {
    const qw = fuzzyWords(q);
    const scored = cat.map((a) => ({ n: a.name, d: fuzzyDistance(qw, a.name) })).filter((x) => x.d <= thr(q)).sort((a, b) => a.d - b.d);
    return scored[0]?.n ?? null;
  }
  // [query, expected substring in the top match]
  const cases: [string, string][] = [
    ["shabda", "SHABADA"],
    ["shabada tarafga", "SHABADA"],
    ["postgayi", "POST-GAI"],
    ["post-gai", "POST-GAI"],
    ["obran", "OBRON"],
  ];
  for (const [q, want] of cases) {
    const got = topMatch(q);
    const ok = !!got && got.toUpperCase().includes(want);
    ok ? pass++ : fail++;
    console.log(`${ok ? "✅" : "❌"} «${q}» → ${got ?? "—"}${ok ? "" : ` (kutilgan: …${want}…)`}`);
  }
  console.log(`\n${pass}/${pass + fail} o'tdi`);
  process.exit(fail === 0 ? 0 : 1);
}

void main();
