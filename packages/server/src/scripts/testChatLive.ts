// 🚕 B qism P0-7 — the live ride card in the chat, with a fake Telegram and no DB.
//
//   KAS_MODE=mock pnpm --filter @t1067/server exec tsx src/scripts/testChatLive.ts
//
// Proves: with `chatlive` off nothing new happens; the card is pinned once, silently, while a driver
// holds the ride; a newer card replaces the old pin instead of stranding it; closing the ride unpins
// exactly what is pinned (even if the flag was switched off meanwhile); "~1 minute" goes once per
// order, only while the car is on its way and close, and never on a database error; "arrived" goes
// once per order — and on a database error it goes rather than being lost.
import { PREARRIVE_TEXT, arrivedPingOnce, chatLiveClose, chatLiveTick, type ChatLiveDeps, type RideTick } from "../services/chatLive";

let failures = 0;
const ok = (cond: boolean, label: string) => {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) failures++;
};

async function main() {
  const store = new Map<string, string>();
  let dbDown = false;
  const log: string[] = [];
  const deps: ChatLiveDeps = {
    claim: async (k, ifUnsure) => { if (dbDown) return ifUnsure; if (store.has(k)) return false; store.set(k, "1"); return true; },
    peek: async (k) => { if (dbDown) throw new Error("db down"); return store.get(k) ?? null; },
    put: async (k, v) => { if (dbDown) throw new Error("db down"); store.set(k, v); },
    drop: async (k) => { if (dbDown) throw new Error("db down"); store.delete(k); },
    pin: async (chat, msg) => { log.push(`pin ${chat}/${msg}`); },
    unpin: async (chat, msg) => { log.push(`unpin ${chat}/${msg}`); },
    send: async (chat, html) => { log.push(`send ${chat} ${html === PREARRIVE_TEXT ? "prearrive" : html}`); },
  };
  const count = (s: string) => log.filter((l) => l === s || l.startsWith(`${s} `)).length;
  const pickup = { lat: 39.0458, lng: 65.58 };
  const far = { lat: 39.0600, lng: 65.58 };   // ~1.6 km: ~4 min at 24 km/h
  const near = { lat: 39.0480, lng: 65.58 };  // ~250 m: well under a minute
  const tick = (o: Partial<RideTick>): RideTick => ({ enabled: true, chatId: "tg1", memberId: 7, bookingId: 900000501, cardId: 77, status: "accepted", car: far, pickup, cityKmh: 24, ...o });

  // ── flag off: nothing new ──
  await chatLiveTick(tick({ enabled: false, car: near }), deps);
  ok(log.length === 0 && store.size === 0, "chatlive off → no pin, no message");
  ok((await arrivedPingOnce(false, 1, deps)) && (await arrivedPingOnce(false, 1, deps)), "chatlive off → the arrived ping keeps yesterday's rule (the caller's gate)");

  // ── no driver yet ──
  await chatLiveTick(tick({ status: "searching", car: null }), deps);
  ok(log.length === 0, "no driver yet → no pin");

  // ── a driver takes it: pinned once ──
  await chatLiveTick(tick({}), deps);
  await chatLiveTick(tick({ status: "on_the_way" }), deps);
  await chatLiveTick(tick({ status: "arrived" }), deps);
  ok(count("pin tg1/77") === 1 && store.get("cardpin:m7") === "77", "a driver takes the ride → the card is pinned, once, and remembered");
  ok(count("send tg1 prearrive") === 0, "still far → no \"~1 minute\"");

  // ── the database cannot say what is pinned: no pin storm ──
  dbDown = true;
  await chatLiveTick(tick({ cardId: 78 }), deps);
  dbDown = false;
  ok(count("pin tg1/78") === 0, "database down → no pin this tick (not one per tick)");

  // ── a newer card (re-order in the bot, or a card whose id was not saved) replaces the pin ──
  await chatLiveTick(tick({ bookingId: 900000502, cardId: 78 }), deps);
  ok(count("pin tg1/78") === 1 && count("unpin tg1/77") === 1 && store.get("cardpin:m7") === "78", "a newer card is pinned and the old pin taken down — nothing stranded");

  // ── the car is a minute away: said once ──
  await chatLiveTick(tick({ bookingId: 900000502, cardId: 78, status: "on_the_way", car: near }), deps);
  await chatLiveTick(tick({ bookingId: 900000502, cardId: 78, status: "on_the_way", car: near }), deps);
  ok(count("send tg1 prearrive") === 1, "car within a minute → \"~1 minute\" once, not every tick");
  dbDown = true;
  await chatLiveTick(tick({ bookingId: 900000503, cardId: 78, status: "on_the_way", car: near }), deps);
  dbDown = false;
  ok(count("send tg1 prearrive") === 1, "database down → \"~1 minute\" is not sent (it would repeat every tick)");

  // ── arrived / in the car: never "~1 minute" ──
  await chatLiveTick(tick({ bookingId: 900000504, cardId: 78, status: "arrived", car: near }), deps);
  await chatLiveTick(tick({ bookingId: 900000504, cardId: 78, status: "started", car: near }), deps);
  ok(!store.has("prearrive:900000504"), "arrived or started → no \"~1 minute\" (it would be late)");

  // ── arrived: once per order; unsure → sent ──
  ok((await arrivedPingOnce(true, 900000502, deps)) && !(await arrivedPingOnce(true, 900000502, deps)), "\"arrived\" goes once per order with chatlive");
  dbDown = true;
  ok(await arrivedPingOnce(true, 900000505, deps), "database down → \"arrived\" is sent rather than lost");
  dbDown = false;

  // ── closed: exactly what is pinned comes down, once, flag or no flag ──
  await chatLiveClose({ chatId: "tg1", memberId: 7 }, deps);
  await chatLiveClose({ chatId: "tg1", memberId: 7 }, deps);
  ok(count("unpin tg1/78") === 1 && !store.has("cardpin:m7"), "the ride is closed → the pinned card comes down once (closing again → nothing)");
  await chatLiveClose({ chatId: "tg2", memberId: 8 }, deps);
  ok(!log.some((l) => l.startsWith("unpin tg2")), "a member with nothing pinned → nothing unpinned");
  dbDown = true;
  await chatLiveClose({ chatId: "tg3", memberId: 11, cardId: 31 }, deps);
  dbDown = false;
  ok(count("unpin tg3/31") === 1, "the database cannot say what is pinned at close → this ride's card comes down anyway");

  // ── Telegram refusing a pin does not stop the ride ──
  const failing: ChatLiveDeps = { ...deps, pin: async () => { throw new Error("Bad Request: not enough rights"); } };
  let threw = false;
  try { await chatLiveTick(tick({ memberId: 9, cardId: 90 }), failing); } catch { threw = true; }
  ok(!threw, "a refused pin is swallowed — the sweep carries on");

  console.log(failures ? `\n❌ ${failures} failed` : "\n🛡 chat live card: every rule held");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
