// 🚕 B qism P0-8 — a typed place in the bot: one offer only when the core is sure. No DB, fake core.
//
//   KAS_MODE=mock pnpm --filter @t1067/server exec tsx src/scripts/testTypedFast.ts
//
// Proves: the bridge asks the core's /addresses/resolve and maps its answer; only a CONFIDENT answer
// becomes the single "call" offer — "banisaga" with no curated alias stays a list; an address the
// core returns without confidence is never offered alone; a core that fails means the list.
import { BirJoySource } from "../kas/birjoy";
import { staleConfirm, typedPick } from "../bot/booking";

let failures = 0;
const ok = (cond: boolean, label: string) => {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) failures++;
};

async function main() {
  const asked: string[] = [];
  const answers: Record<string, unknown> = {
    "5 maktab": { confident: true, address: { id: 7, name: "5-MAKTAB", lat: "39.04", lng: "65.58" }, suggestions: [] },
    banisaga: { confident: false, address: null, suggestions: [{ id: 3, name: "BANISA" }, { id: 4, name: "BANISA OLDI" }] },
    obron: { confident: false, address: { id: 9, name: "OBRON" }, suggestions: [] },
  };
  const fetchFn = (async (url: URL | string) => {
    const u = new URL(String(url));
    asked.push(`${u.pathname}?q=${u.searchParams.get("q")}`);
    const body = answers[u.searchParams.get("q") ?? ""];
    if (!body) return new Response("boom", { status: 500 });
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
  const core = new BirJoySource({ baseUrl: "http://core.test/api/v1", serviceToken: "t".repeat(40), fetchFn } as never);

  const sure = await core.resolveAddress("5 maktab");
  ok(asked[0] === "/api/v1/addresses/resolve?q=5 maktab", "the bridge asks the core's /addresses/resolve");
  ok(sure.confident && sure.address?.id === 7 && sure.address.lat === 39.04, "a confident answer is mapped (coordinates as numbers)");
  ok(typedPick(sure)?.name === "5-MAKTAB", "confident → ONE place offered with a call button");

  const list = await core.resolveAddress("banisaga");
  ok(typedPick(list) === null && list.suggestions.length === 2, "\"banisaga\" with no curated alias → the list, never a single guess");

  const unsure = await core.resolveAddress("obron");
  ok(!unsure.confident && unsure.address === null && typedPick(unsure) === null, "an address without confidence is never offered alone");

  const down = await core.resolveAddress("xyz").catch(() => null);
  ok(typedPick(down) === null, "the core failing → the list");
  ok(typedPick(undefined) === null, "no resolver at all (the mock) → the list");

  // ── an older "Chaqirish" never confirms a newer place ──
  const bozor = { id: 11, name: "ESKI BOZOR" };
  const maktab = { id: 7, name: "5-MAKTAB" };
  ok(!staleConfirm("7", maktab), "Chaqirish under the current offer → goes");
  ok(staleConfirm("11", maktab), "Chaqirish under an older offer (ESKI BOZOR) after typing 5-MAKTAB → refused");
  ok(staleConfirm("7", undefined), "…and after the session is gone → refused");
  ok(!staleConfirm(undefined, bozor), "the confirm screen's own button (no id) → yesterday's behaviour");

  console.log(failures ? `\n❌ ${failures} failed` : "\n🛡 typed place: every rule held");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
