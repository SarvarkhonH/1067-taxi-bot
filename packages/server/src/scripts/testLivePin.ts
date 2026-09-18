// 🚕 B qism P0-5 — the chat's live location from the core's stream, with a fake Telegram and no DB.
//
//   KAS_MODE=mock pnpm --filter @t1067/server exec tsx src/scripts/testLivePin.ts
//
// Proves: nothing moves while `ridemap` is off; the passenger's own ride moves, with a heading; at
// most one edit per ride every 4 s (per ride, not globally); someone else's order or a ride that is
// not the member's current one is never touched; "not modified" is not an error.
import { toBridgeId, type CoreLoc } from "@t1067/shared";
import { startLivePin } from "../services/livePin";

let failures = 0;
const ok = (cond: boolean, label: string) => {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) failures++;
};
const flush = () => new Promise((r) => setImmediate(r));

async function main() {
  let clock = 1_000_000;
  let flag = false;
  let pinLookups = 0;
  let failNext = "";
  const edits: { chatId: string; messageId: number; lat: number; lng: number; heading?: number }[] = [];
  let emit: ((l: CoreLoc) => void) | null = null;
  // Member 1 rides order 5001 (phone …111111111); member 2 rides order 5002.
  const rides = new Map<number, { tail9: string; chatId: string; messageId: number }>([
    [toBridgeId(5001), { tail9: "901111111", chatId: "tg1", messageId: 11 }],
    [toBridgeId(5002), { tail9: "902222222", chatId: "tg2", messageId: 22 }],
  ]);

  startLivePin({
    enabled: async () => flag,
    previewTail: async (tail9) => tail9 === "909999999", // the owner's phone
    pinFor: async (bookingId, tail9) => {
      pinLookups++;
      const r = rides.get(bookingId);
      return r && r.tail9 === tail9 ? { chatId: r.chatId, messageId: r.messageId } : null;
    },
    edit: async (chatId, messageId, lat, lng, heading) => {
      if (failNext) { const m = failNext; failNext = ""; throw new Error(m); }
      edits.push({ chatId, messageId, lat, lng, heading });
    },
    onLoc: (fn) => { emit = fn; },
    now: () => clock,
  });
  const loc = (orderId: number, tail9: string, o: Partial<CoreLoc> = {}): CoreLoc =>
    ({ orderId, phoneTail9: tail9, lat: 39.03, lng: 65.58, bearing: 0, at: new Date(clock).toISOString(), ...o });
  const send = async (l: CoreLoc) => { emit!(l); await flush(); await flush(); };

  rides.set(toBridgeId(5009), { tail9: "909999999", chatId: "owner", messageId: 99 });
  await send(loc(5001, "901111111"));
  ok(edits.length === 0 && pinLookups === 0, "ridemap off → a customer's pin is not touched, not even looked up");
  await send(loc(5009, "909999999"));
  ok(edits.length === 1 && edits[0]!.chatId === "owner", "ridemap off → the owner's own ride moves (preview)");
  edits.length = 0;

  flag = true;
  clock += 10_000;
  await send(loc(5001, "901111111", { lat: 39.031 }));
  ok(edits.length === 1 && edits[0]!.chatId === "tg1" && edits[0]!.messageId === 11 && edits[0]!.lat === 39.031, "ridemap on → the passenger's own pin moves");
  ok(edits[0]?.heading === 360, "a car facing north is heading 360 (Telegram does not take 0)");

  clock += 2_000;
  await send(loc(5001, "901111111", { lat: 39.032 }));
  ok(edits.length === 1, "a second fix 2 s later waits");
  await send(loc(5002, "902222222"));
  ok(edits.length === 2 && edits[1]!.chatId === "tg2", "another ride is not held back by this one");
  clock += 2_000;
  await send(loc(5001, "901111111", { lat: 39.033, bearing: 90 }));
  ok(edits.length === 3 && edits[2]!.lat === 39.033 && edits[2]!.heading === 90, "4 s after the last edit it moves again");

  clock += 10_000;
  const before = edits.length;
  await send(loc(5001, "902222222")); // member 2's phone on member 1's order
  await send(loc(7777, "901111111")); // member 1's phone on an order that is not their ride
  ok(edits.length === before, "someone else's phone, or not the member's current ride → nothing");

  clock += 10_000;
  await send(loc(Number.NaN, "901111111"));
  await send(loc(-3, "901111111"));
  ok(edits.length === before, "a malformed order id is dropped, not thrown");

  rides.delete(toBridgeId(5002)); // member 2's ride is over
  clock += 10_000;
  await send(loc(5002, "902222222"));
  ok(edits.length === before, "a finished ride's car no longer moves the pin");

  clock += 10_000;
  failNext = "Bad Request: message is not modified";
  const warn = console.warn;
  let warned = 0;
  console.warn = () => { warned++; };
  await send(loc(5001, "901111111"));
  clock += 70_000; // past the one-a-minute window, so a logged "not modified" would show here
  failNext = "Bad Request: message can't be edited";
  await send(loc(5001, "901111111"));
  clock += 10_000;
  failNext = "Bad Request: message can't be edited";
  await send(loc(5001, "901111111"));
  console.warn = warn;
  ok(warned === 1, `"not modified" is silent; real failures are logged once a minute (${warned} line)`);

  console.log(failures ? `\n❌ ${failures} failed` : "\n🛡 live pin: every rule held");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
