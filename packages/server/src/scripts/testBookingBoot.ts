// 🚕 B qism P0-2 — the taxi screen's first answer on the server, with a fake core and no DB.
//
//   KAS_MODE=mock pnpm --filter @t1067/server exec tsx src/scripts/testBookingBoot.ts
//
// Proves: fastopen asks the core ONCE (bootstrap) where it asked twice; a core without the route
// (404) gets the two old calls and is not asked again for 10 minutes; any other failure falls back
// without that note; flag off = exactly the two old calls; the town's reference data is kept 60 s
// and a failed load is never kept.
import { __resetBootCaches, clientAndRide, memoRef } from "../services/bookingService";

let failures = 0;
const ok = (cond: boolean, label: string) => {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) failures++;
};

type Calls = { boot: number; client: number; active: number };
function fakeCore(boot: "ok" | "404" | "500" | "absent") {
  const calls: Calls = { boot: 0, client: 0, active: 0 };
  const client = { clientName: "Anvar", phoneNumber: "+998901112233", addresses: [], activeBooking: null };
  const ds = {
    checkClient: async () => { calls.client++; return client; },
    getActiveBooking: async () => { calls.active++; return null; },
    getBookingBootstrap: boot === "absent" ? undefined : async () => {
      calls.boot++;
      if (boot === "404") throw Object.assign(new Error("Cannot GET"), { status: 404 });
      if (boot === "500") throw Object.assign(new Error("boom"), { status: 500 });
      return { client, active: null };
    },
  };
  return { ds, calls };
}

async function main() {
  const t = 1_000_000;

  __resetBootCaches();
  let f = fakeCore("ok");
  let r = await clientAndRide("+998901112233", true, f.ds as never, t);
  ok(f.calls.boot === 1 && f.calls.client === 0 && f.calls.active === 0 && r.client?.clientName === "Anvar", "fastopen → one core request (bootstrap), not two");

  f = fakeCore("ok");
  await clientAndRide("+998901112233", false, f.ds as never, t);
  ok(f.calls.boot === 0 && f.calls.client === 1 && f.calls.active === 1, "flag off → exactly the two old calls");

  __resetBootCaches();
  f = fakeCore("404");
  r = await clientAndRide("+998901112233", true, f.ds as never, t);
  ok(f.calls.boot === 1 && f.calls.client === 1 && f.calls.active === 1 && r.client?.clientName === "Anvar", "a core without the route (404) → the two old calls, same answer");
  await clientAndRide("+998901112233", true, f.ds as never, t + 5 * 60_000);
  ok(f.calls.boot === 1, "…and it is not asked for the route again for 10 minutes");
  await clientAndRide("+998901112233", true, f.ds as never, t + 11 * 60_000);
  ok(f.calls.boot === 2, "…then it is asked again (the core may have been deployed)");

  __resetBootCaches();
  f = fakeCore("500");
  await clientAndRide("+998901112233", true, f.ds as never, t);
  await clientAndRide("+998901112233", true, f.ds as never, t + 1_000);
  ok(f.calls.boot === 2 && f.calls.client === 2, "any other failure → the two calls this time, bootstrap tried again next time");

  f = fakeCore("absent");
  await clientAndRide("+998901112233", true, f.ds as never, t);
  ok(f.calls.client === 1 && f.calls.active === 1, "a data source without bootstrap (the mock) → the two calls");

  // ── the town's reference data ──
  __resetBootCaches();
  let loads = 0;
  const load = async () => { loads++; return ["area"]; };
  await memoRef("area", load, t);
  await memoRef("area", load, t + 59_000);
  ok(loads === 1, "reference data is kept for 60 s");
  await memoRef("area", load, t + 61_000);
  ok(loads === 2, "…and read again after");
  let bad = 0;
  const failing = async () => { bad++; throw new Error("core down"); };
  await memoRef("company", failing, t).catch(() => undefined);
  await new Promise((res) => setImmediate(res));
  await memoRef("company", failing, t + 1_000).catch(() => undefined);
  ok(bad === 2, "a failed load is never kept — the next screen asks again");

  console.log(failures ? `\n❌ ${failures} failed` : "\n🛡 booking boot: every rule held");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
