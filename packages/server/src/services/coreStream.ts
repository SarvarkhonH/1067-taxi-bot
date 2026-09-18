// 🚕 B qism P0-4: the taxi core's event stream, as the bot hears it.
//
// The core (1067-taxi) nudges the bot the moment an order changes — `svc:order` {id, status,
// phoneTail9} — and sends a held order's car position — `svc:loc`. Until now the bot learned both by
// polling every 5–15 s, so "Haydovchi topildi" reached a passenger up to fifteen seconds late.
//
// What this does with them, and deliberately nothing more:
//   · a nudge for a member `linked()` accepts wakes the ONE ride sweep (index.ts) — no second sweep,
//     no scoped variant, no new poller; the sweep re-reads the order through the bridge as it always
//     did, so a nudge that arrives out of order or names the wrong status changes nothing
//   · nudges and positions are handed to listeners (the Mini App's ride socket), which decide who
//     may hear them (shared/rideStream: phone AND current ride)
//   · every change of health is told to listeners, so a passenger's socket can say "down" and the
//     Mini App goes back to its 3 s poll the moment the stream stops being worth trusting
//
// Connected or not is decided on every ride tick (ensureCoreStream) — no timer of its own — and at
// once when the owner flips `corestream` in the admin panel (recheckCoreStream). Who counts as linked
// is index.ts's call (everyone with the flag on; only the owner's own rides in preview). When the core
// refuses, the bot says why once and waits: 30 min when the stream is switched off on the core or the
// token is wrong (nothing will change sooner), 5 min for anything else.

import { io, type Socket } from "socket.io-client";
import { LagStats, type CoreLoc, type CoreNudge } from "@t1067/shared";
import { env } from "../env";

type Listener<T> = (v: T) => void;

const nudgeListeners = new Set<Listener<CoreNudge>>();
const locListeners = new Set<Listener<CoreLoc>>();
const healthListeners = new Set<Listener<boolean>>();
const lag = new LagStats(200);

let socket: Socket | null = null;
let joined = false;
let retryAfter = 0;
let lastRefusal = "";
let onWake: (() => void) | null = null;
let onRecheck: (() => void) | null = null;
let linkedNow: (tail9: string) => Promise<boolean> = async () => false;
let lastHealth = false;
/** When the core last nudged each order — for the card's lag line (chatLive.noteCardLag). Bounded. */
const nudgeAt = new Map<number, number>();

/** The core's time for the latest nudge about this order, once (then forgotten), or null. */
export function takeNudgeTime(orderId: number): number | null {
  const at = nudgeAt.get(orderId);
  if (at == null) return null;
  nudgeAt.delete(orderId);
  return at;
}

/** Joined and connected: the sweep may slow down to a safety net. */
export function coreStreamHealthy(): boolean {
  return !!socket?.connected && joined;
}

/** Tell listeners when health flips — never twice in a row with the same value. */
function healthChanged(): void {
  const h = coreStreamHealthy();
  if (h === lastHealth) return;
  lastHealth = h;
  for (const fn of healthListeners) {
    try { fn(h); } catch { /* a listener must not stop the stream */ }
  }
}

export function onCoreHealth(fn: Listener<boolean>): () => void {
  healthListeners.add(fn);
  return () => healthListeners.delete(fn);
}

/** index.ts's "check the flag and connect or close now", for the admin panel's flag switch. */
export function setCoreStreamRecheck(fn: () => void): void {
  onRecheck = fn;
}

/** The owner just flipped `corestream`: act now, not on the next ride tick (up to 90 s away). */
export function recheckCoreStream(): void {
  retryAfter = 0;
  onRecheck?.();
}

export function onCoreNudge(fn: Listener<CoreNudge>): () => void {
  nudgeListeners.add(fn);
  return () => nudgeListeners.delete(fn);
}

export function onCoreLoc(fn: Listener<CoreLoc>): () => void {
  locListeners.add(fn);
  return () => locListeners.delete(fn);
}

/** The ride sweep's wake-up, set once by index.ts. */
export function setCoreStreamWake(fn: () => void): void {
  onWake = fn;
}

/** p95 of how late nudges reach the bot (ms), for the log line and the DoD check. */
export function coreStreamLagP95(): number | null {
  return lag.p95();
}

function stop(reason: string): void {
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
  joined = false;
  console.log(`[core] stream closed (${reason})`);
  healthChanged();
}

/**
 * Connect or disconnect to match the flag. Called on every ride tick; cheap when nothing changes.
 * `linked(tail9)` answers whether a nudge concerns a member the sweep would process.
 */
export async function ensureCoreStream(opts: { enabled: boolean; linked: (tail9: string) => Promise<boolean> }): Promise<void> {
  linkedNow = opts.linked; // preview ↔ everyone switches without a reconnect
  if (!opts.enabled || env.KAS_MODE !== "birjoy" || !env.KAS_SERVICE_TOKEN) {
    stop("flag off");
    return;
  }
  if (socket || Date.now() < retryAfter) return;

  const origin = new URL(env.KAS_BIRJOY_URL).origin;
  const s = io(`${origin}/ws`, {
    transports: ["websocket"],
    reconnection: true,
    reconnectionDelay: 2_000,
    reconnectionDelayMax: 30_000,
    timeout: 8_000,
  });
  socket = s;

  s.on("connect", () => {
    s.emit("service:join", { token: env.KAS_SERVICE_TOKEN }, (ack: { ok?: boolean; reason?: string; orders?: unknown[] } | undefined) => {
      if (ack?.ok) {
        joined = true;
        lastRefusal = "";
        console.log(`[core] stream joined — ${ack.orders?.length ?? 0} live order(s); sweeping once to catch up`);
        healthChanged();
        onWake?.();
      } else {
        joined = false;
        const why = ack?.reason ?? "no answer";
        const waitMin = why === "disabled" || why === "auth" ? 30 : 5;
        if (why !== lastRefusal) console.warn(`[core] stream refused: ${why} — retrying in ${waitMin} min`);
        lastRefusal = why;
        retryAfter = Date.now() + waitMin * 60_000;
        stop(`refused: ${why}`);
      }
    });
  });

  s.on("disconnect", (reason) => {
    // One line per change of health (D4.7): the sweep goes back to 5 s / 15 s until the next join.
    if (joined) console.warn(`[core] stream lost (${reason}) — passengers are told "down"; reconnecting`);
    joined = false;
    healthChanged();
    // The core closed it (a refusal, or a restart): socket.io does not reconnect on its own after a
    // server-side close, so start clean on a later tick rather than sit half-open.
    if (reason === "io server disconnect") {
      retryAfter = Math.max(retryAfter, Date.now() + 15_000);
      stop("closed by the core");
    }
  });

  s.on("svc:order", async (n: CoreNudge) => {
    const at = Date.parse(n?.emittedAt ?? "");
    if (Number.isFinite(at)) {
      if (Number.isInteger(n?.id)) {
        if (nudgeAt.size >= 2_000) nudgeAt.clear(); // a restart's worth of orders; never grows past it
        nudgeAt.set(n.id, at);
      }
      lag.add(Date.now() - at);
      if (lag.total % 100 === 0) console.log(`[core] lag p95=${lag.p95()}ms over the last ${lag.count}`);
    }
    for (const fn of nudgeListeners) {
      try { fn(n); } catch { /* a listener must not stop the stream */ }
    }
    if (n?.phoneTail9 && (await linkedNow(n.phoneTail9).catch(() => false))) onWake?.();
  });

  s.on("svc:loc", (l: CoreLoc) => {
    for (const fn of locListeners) {
      try { fn(l); } catch { /* a listener must not stop the stream */ }
    }
  });
}
