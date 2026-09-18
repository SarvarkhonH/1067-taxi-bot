// 🚕 B qism P0-4/P0-5 — the passenger ride socket against a real WebSocket, no database.
//
//   KAS_MODE=mock pnpm --filter @t1067/server exec tsx src/scripts/testRideSocket.ts
//
// Everything the socket asks the rest of the bot (initData check, member, current ride, the core's
// stream) is replaced by fakes, so this runs anywhere and touches nothing live. What it proves:
// who gets in, who is refused with which code, and that a nudge or a car's position reaches ONLY
// the passenger whose phone AND current ride it is — and stops the moment that ride is over.
import http from "node:http";
import net from "node:net";
import type { AddressInfo } from "node:net";
import WebSocket from "ws";
import { toBridgeId, type CoreLoc, type CoreNudge } from "@t1067/shared";
import { attachRideSocket, recheckRideClients, rideSocketClients } from "../api/rideSocket";

let failures = 0;
const ok = (cond: boolean, label: string) => {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) failures++;
};

const phoneOf = (memberId: number) => `+9989000000${String(memberId).padStart(2, "0")}`;
const tailOf = (memberId: number) => phoneOf(memberId).replace(/\D/g, "").slice(-9);
const rides = new Map<number, number | null>([[1, toBridgeId(5001)], [2, toBridgeId(5002)]]);

let nudgeFn: ((n: CoreNudge) => void) | null = null;
let locFn: ((l: CoreLoc) => void) | null = null;
let healthFn: ((h: boolean) => void) | null = null;
let coreUp = true;
const denied = new Set<string>(["999"]); // the flag is off for these Telegram ids
const SLOW = 7; // members 700–799 take 3.5 s to look up (a slow database)
const SLOW_RIDE = 8; // members 800–899: their current ride takes 1.5 s to read

async function main() {
  const server = http.createServer((_req, res) => res.end("ok"));
  attachRideSocket(server, async (id) => !denied.has(id), {
    verify: (initData) => (initData.startsWith("ok:") ? initData.slice(3) : null),
    memberOf: async (id) => {
      if (id === "404") return null;
      if (Math.floor(Number(id) / 100) === SLOW) await new Promise((r) => setTimeout(r, 3_500));
      return Number(id);
    },
    rideOf: async (memberId) => {
      if (Math.floor(memberId / 100) === SLOW_RIDE) await new Promise((r) => setTimeout(r, 1_500));
      return { bookingId: rides.get(memberId) ?? null, phone: phoneOf(memberId) };
    },
    onNudge: (fn) => { nudgeFn = fn; },
    onLoc: (fn) => { locFn = fn; },
    healthy: () => coreUp,
    onHealth: (fn) => { healthFn = fn; },
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/api/ride-ws`;

  /** Open a socket, optionally send an auth frame, collect everything it hears until closed or `ms`. */
  const session = (auth: string | null, ms: number) =>
    new Promise<{ code: number | null; frames: any[]; ws: WebSocket }>((resolve) => {
      const ws = new WebSocket(url);
      const frames: any[] = [];
      let code: number | null = null;
      ws.on("open", () => { if (auth !== null) ws.send(JSON.stringify({ t: "auth", initData: auth })); });
      ws.on("message", (d) => frames.push(JSON.parse(String(d))));
      ws.on("close", (c) => { code = c; });
      setTimeout(() => resolve({ code, frames, ws }), ms);
    });

  /** Like session, but its code and frames stay live after it resolves. */
  const live = (frames: string[]) => {
    const ws = new WebSocket(url);
    const st = { code: null as number | null, heard: [] as any[], ws };
    ws.on("open", () => { for (const fr of frames) ws.send(fr); });
    ws.on("message", (d) => st.heard.push(JSON.parse(String(d))));
    ws.on("close", (c) => { st.code = c; });
    return st;
  };
  const authFrame = (id: string) => JSON.stringify({ t: "auth", initData: `ok:${id}` });
  const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // ── who gets in ──
  ok((await session(null, 3_600)).code === 4401, "no auth frame within 3 s → closed 4401");
  ok((await session("forged", 500)).code === 4401, "a bad signature → closed 4401");
  ok((await session("ok:999", 500)).code === 4403, "stream off for this user → closed 4403");
  ok((await session("ok:404", 500)).code === 4404, "not linked → closed 4404");

  const a = await session("ok:1", 500);
  const b = await session("ok:2", 500);
  ok(a.frames.some((f) => f.t === "ready") && b.frames.some((f) => f.t === "ready"), "two linked passengers are in");

  const hear = (s: { frames: any[] }, t: string) => s.frames.filter((f) => f.t === t);
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // ── a nudge reaches only its passenger ──
  nudgeFn!({ id: 5001, status: "accepted", phoneTail9: tailOf(1), emittedAt: new Date().toISOString() });
  await wait(200);
  ok(hear(a, "nudge").length === 1 && hear(b, "nudge").length === 0, "a nudge for passenger 1 reaches passenger 1 only");

  // ── a car's position reaches only the passenger whose ride it is ──
  const loc = (orderId: number, member: number): CoreLoc => ({ orderId, phoneTail9: tailOf(member), lat: 39.03, lng: 65.58, bearing: 90, at: new Date().toISOString() });
  locFn!(loc(5001, 1));
  await wait(200);
  ok(hear(a, "pos").length === 1 && hear(b, "pos").length === 0, "passenger 1's car reaches passenger 1 only");
  const pos = hear(a, "pos")[0];
  ok(!!pos && Object.keys(pos).sort().join(",") === "at,bearing,lat,lng,t", "a position frame carries only t, lat, lng, bearing, at");

  locFn!(loc(7777, 1)); // passenger 1's phone, not passenger 1's ride
  await wait(200);
  ok(hear(a, "pos").length === 1, "a car on another order with the same phone is not sent");

  // ── the ride ends: positions stop at once ──
  rides.set(1, null);
  nudgeFn!({ id: 5001, status: "completed", phoneTail9: tailOf(1), emittedAt: new Date().toISOString() });
  await wait(200);
  locFn!(loc(5001, 1));
  await wait(200);
  ok(hear(a, "pos").length === 1, "after the ride ends no more positions reach the passenger");

  // ── the core's stream dies and comes back: the passenger is told, so the Mini App polls at 3 s ──
  coreUp = false;
  healthFn!(false);
  await wait(200);
  ok(hear(a, "down").length === 1 && hear(b, "down").length === 1, "the stream goes down → every passenger hears \"down\"");
  const late = await session("ok:2", 500);
  ok(late.frames[0]?.t === "down" && !late.frames.some((fr) => fr.t === "ready"), "signing in while the stream is down → \"down\", never \"ready\"");
  coreUp = true;
  healthFn!(true);
  await wait(200);
  ok(hear(late, "ready").length === 1 && hear(a, "ready").length === 2, "the stream is back → \"ready\" again");

  // ── not the ride socket: answered and closed, never left hanging ──
  const port = (server.address() as AddressInfo).port;
  const stray = await new Promise<string>((resolve) => {
    const sock = net.connect(port, "127.0.0.1", () => {
      sock.write("GET /something-else HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n");
    });
    let got = "";
    sock.on("data", (d) => { got += String(d); });
    sock.on("close", () => resolve(`closed:${got.split("\r\n")[0]}`));
    setTimeout(() => { sock.destroy(); resolve(`hanging:${got}`); }, 2_000);
  });
  ok(stray === "closed:HTTP/1.1 404 Not Found", `an upgrade to another path gets 404 and is closed (${stray})`);

  // ── two auth frames at once: one passenger, not two ──
  const base = rideSocketClients();
  const twice = live([authFrame("31"), authFrame("31")]);
  await pause(500);
  ok(twice.heard.filter((fr) => fr.t === "ready").length === 1 && rideSocketClients() === base + 1, "two auth frames → signed in once");
  twice.ws.close();
  await pause(200);
  ok(rideSocketClients() === base, "…and gone when it closes");

  // ── a slow database is not a bad passenger ──
  const slow = live([authFrame("701")]);
  await pause(4_200);
  ok(slow.heard.some((fr) => fr.t === "ready") && slow.code === null, "a 3.5 s member lookup still ends in \"ready\", not 4401");
  slow.ws.close();
  await pause(200);

  // ── closing while being checked leaves nothing behind ──
  const quitter = live([authFrame("702")]);
  await pause(500);
  quitter.ws.close();
  await pause(3_600);
  ok(rideSocketClients() === base, "a socket closed during its check is never added");
  const quitter2 = live([authFrame("801")]);
  await pause(500); // member found, ride still being read
  quitter2.ws.close();
  await pause(1_600);
  ok(rideSocketClients() === base, "…nor one closed while its ride was being read");

  // ── one account, a few devices: the fifth lets the oldest go ──
  const devices: ReturnType<typeof live>[] = [];
  for (let i = 0; i < 5; i++) { devices.push(live([authFrame("41")])); await pause(250); }
  await pause(300);
  ok(devices[0]!.code === 4409 && devices.slice(1).every((d) => d.code === null) && rideSocketClients() === base + 4, "a fifth socket for one account closes the oldest with 4409");
  for (const d of devices) d.ws.close();
  await pause(200);

  // ── the kill switch reaches passengers already connected ──
  const customer = live([authFrame("51")]);
  const owner = live([authFrame("52")]);
  await pause(500);
  denied.add("51"); // flag off; "52" is the owner's preview
  const dropped = await recheckRideClients();
  await pause(200);
  ok(dropped === 1 && customer.code === 4403 && owner.code === null, "flag off → a connected customer is let go with 4403, the owner stays");
  owner.ws.close();

  // …and one whose sign-in was still being checked when the switch flipped does not slip in after it
  const midway = live([authFrame("703")]); // 3.5 s member lookup
  await pause(500);
  denied.add("703");
  await recheckRideClients(); // finds nobody: 703 is not in yet
  await pause(3_400);
  ok(midway.code === 4403 && !midway.heard.some((fr) => fr.t === "ready"), "a sign-in in flight when the flag goes off ends in 4403, never \"ready\"");

  a.ws.close();
  b.ws.close();
  late.ws.close();
  server.close();
  console.log(failures ? `\n❌ ${failures} failed` : "\n🛡 ride socket: every rule held");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
