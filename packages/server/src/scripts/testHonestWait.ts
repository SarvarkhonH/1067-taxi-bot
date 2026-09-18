// 🚕 B qism P0-6 — the core's honest wait, as the bridge hands it on. No DB, fake core.
//
//   KAS_MODE=mock pnpm --filter @t1067/server exec tsx src/scripts/testHonestWait.ts
//
// Proves: a sane range (two whole minutes, lo < hi, under two hours) reaches the ride as waitMin;
// anything else — missing, zero, reversed, fractional, absurd, text — is "no number", never a guess.
import { BirJoySource } from "../kas/birjoy";

let failures = 0;
const ok = (cond: boolean, label: string) => {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) failures++;
};

async function main() {
  let nextWait: unknown = null;
  const fetchFn = (async () =>
    new Response(JSON.stringify({ id: 812, status: "dispatching", pickupAddress: "ESKI BOZOR", pickupLat: "39.04", pickupLng: "65.58", createdAt: "2026-09-18T09:00:00Z", driver: null, wait: nextWait }), { status: 200 })) as typeof fetch;
  const core = new BirJoySource({ baseUrl: "http://core.test/api/v1", serviceToken: "t".repeat(40), fetchFn } as never);
  let n = 0;
  const ride = async (wait: unknown) => {
    nextWait = wait;
    n++; // a different phone each time: the bridge keeps a phone's answer for 3 s
    return core.getActiveBooking(`+9989012345${String(n).padStart(2, "0")}`);
  };

  ok(JSON.stringify((await ride({ lo: 3, hi: 7 }))?.waitMin) === '{"lo":3,"hi":7}', "a sane range reaches the ride as waitMin");
  ok((await ride(null))?.waitMin === null, "no range → no number");
  for (const [bad, why] of [
    [{ lo: 0, hi: 5 }, "zero"],
    [{ lo: 7, hi: 3 }, "reversed"],
    [{ lo: 5, hi: 5 }, "not a range"],
    [{ lo: 2.5, hi: 6 }, "fractional"],
    [{ lo: 3, hi: 500 }, "absurd"],
    [{ lo: "a", hi: "b" }, "text"],
    ["3-7", "a string"],
  ] as const) {
    ok((await ride(bad))?.waitMin === null, `${why} → no number`);
  }
  const r = await ride({ lo: 3, hi: 7, km: 1.2 });
  ok(!!r && !JSON.stringify(r).includes("km"), "whatever else the core sends, no distance is handed on");

  console.log(failures ? `\n❌ ${failures} failed` : "\n🛡 honest wait: every rule held");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
