// 🚕 B qism P0-4 — the bot's side of the core stream against a real socket.io server.
//
//   pnpm --filter @t1067/server exec tsx src/scripts/testCoreStream.ts
//
// Local only: the fake core uses the `socket.io` server from the 1067-taxi checkout next to this repo
// (the bot itself only depends on the client). It speaks exactly the core's protocol —
// service:join with an acknowledgement, svc:refused, svc:order, svc:loc — and checks that the bot:
// joins with the token and catches up once; wakes its sweep only for a LINKED passenger (and who that
// is can change — preview → everyone — without a reconnect); hands nudges and positions to listeners;
// reports health once per change; backs off after a refusal instead of hammering; closes when the
// flag goes off; and joins at once when the owner flips the flag (recheck).
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";

const TOKEN = "t".repeat(40);
let failures = 0;
const ok = (cond: boolean, label: string) => {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) failures++;
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // Run from packages/server (pnpm --filter … exec), so the taxi checkout is two levels up.
  const taxiApi = path.resolve(process.cwd(), "../../1067-taxi/apps/api");
  const req = createRequire(path.join(taxiApi, "package.json"));
  const { Server } = req("socket.io");

  const httpServer = http.createServer();
  const io = new Server(httpServer);
  let joins = 0;
  let refuse: "" | "disabled" | "auth" = "";
  const nsp = io.of("/ws");
  nsp.on("connection", (socket: any) => {
    socket.on("service:join", (data: { token?: string }, ack: (v: unknown) => void) => {
      joins++;
      if (refuse || data?.token !== TOKEN) {
        const reason = refuse || "auth";
        socket.emit("svc:refused", { reason });
        ack({ ok: false, reason });
        setImmediate(() => socket.disconnect(true));
        return;
      }
      socket.join("svc:bridge");
      ack({ ok: true, orders: [{ id: 1, status: "dispatching", phoneTail9: "901234567", emittedAt: new Date().toISOString() }] });
    });
  });
  await new Promise<void>((r) => httpServer.listen(0, "127.0.0.1", () => r()));
  const port = (httpServer.address() as AddressInfo).port;

  process.env.KAS_MODE = "birjoy";
  process.env.KAS_SERVICE_TOKEN = TOKEN;
  process.env.KAS_BIRJOY_URL = `http://127.0.0.1:${port}/api/v1`;
  const cs = await import("../services/coreStream");

  let wakes = 0;
  cs.setCoreStreamWake(() => { wakes++; });
  const nudges: unknown[] = [];
  const locs: unknown[] = [];
  cs.onCoreNudge((n) => nudges.push(n));
  cs.onCoreLoc((l) => locs.push(l));
  const health: boolean[] = [];
  cs.onCoreHealth((h) => health.push(h));
  const linked = async (tail: string) => tail === "901234567";

  // ── joins and catches up ──
  await cs.ensureCoreStream({ enabled: true, linked });
  await wait(600);
  ok(cs.coreStreamHealthy(), "joins the core with the service token");
  ok(joins === 1 && wakes === 1, "one join, one catch-up sweep");

  // ── a nudge for a linked passenger wakes the sweep; for anyone else it does not ──
  nsp.to("svc:bridge").emit("svc:order", { id: 7, status: "accepted", phoneTail9: "901234567", emittedAt: new Date().toISOString() });
  nsp.to("svc:bridge").emit("svc:order", { id: 8, status: "accepted", phoneTail9: "907777777", emittedAt: new Date().toISOString() });
  await wait(300);
  ok(wakes === 2, "a linked passenger's nudge wakes the sweep, a phone caller's does not");
  ok(nudges.length === 2, "both nudges reach the listeners (the ride socket filters by passenger)");

  // ── preview → everyone: who wakes the sweep changes without a reconnect ──
  await cs.ensureCoreStream({ enabled: true, linked: async () => true });
  nsp.to("svc:bridge").emit("svc:order", { id: 9, status: "accepted", phoneTail9: "907777777", emittedAt: new Date().toISOString() });
  await wait(300);
  ok(wakes === 3 && joins === 1, "switching who counts as linked takes effect at once, on the same connection");
  await cs.ensureCoreStream({ enabled: true, linked });

  nsp.to("svc:bridge").emit("svc:loc", { orderId: 7, phoneTail9: "901234567", lat: 39.03, lng: 65.58, bearing: 90, at: new Date().toISOString() });
  await wait(200);
  ok(locs.length === 1, "a car's position reaches the listeners");

  // ── the flag goes off: the stream closes ──
  await cs.ensureCoreStream({ enabled: false, linked });
  await wait(200);
  ok(!cs.coreStreamHealthy(), "flag off → the stream closes");
  ok(health.join(",") === "true,false", `health is told once per change (${health.join(",")})`);

  // ── the core refuses: say so once, back off, do not hammer ──
  refuse = "disabled";
  const joinsBefore = joins;
  await cs.ensureCoreStream({ enabled: true, linked });
  await wait(600);
  ok(!cs.coreStreamHealthy() && joins === joinsBefore + 1, "a refusal is heard and the stream is not healthy");
  for (let i = 0; i < 5; i++) { await cs.ensureCoreStream({ enabled: true, linked }); await wait(100); }
  ok(joins === joinsBefore + 1, "after a refusal it waits (30 min when switched off) instead of retrying every tick");
  ok(health.join(",") === "true,false", "a refused join never reports healthy");

  // ── the owner flips the flag in the admin panel: the wait is dropped and it joins now ──
  refuse = "";
  let rechecked = 0;
  cs.setCoreStreamRecheck(() => { rechecked++; });
  cs.recheckCoreStream();
  await cs.ensureCoreStream({ enabled: true, linked });
  await wait(600);
  ok(rechecked === 1 && cs.coreStreamHealthy() && joins === joinsBefore + 2, "recheck drops the wait and joins at once");
  ok(health.join(",") === "true,false,true", "…and says it is healthy again");

  io.close();
  httpServer.close();
  console.log(failures ? `\n❌ ${failures} failed` : "\n🛡 core stream (bot side): every rule held");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
