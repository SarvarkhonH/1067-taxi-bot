// 🚕 B qism P0-4/P0-5: the passenger's ride socket — /api/ride-ws.
//
// The Mini App polled /api/booking/active every 3 s. With the core's stream on (coreStream.ts) the
// bot knows about a change the moment it happens, so it tells the passenger at once:
//   {t:"ready"} / {t:"down"}          — the core's stream is live / is not (sent after auth and on
//                                       every change): only under "ready" may the Mini App slow its poll
//   {t:"nudge", status}               — something changed; fetch /api/booking/active now
//   {t:"pos", lat, lng, bearing, at}  — your driver's car, while that driver holds YOUR ride
// The Mini App keeps polling underneath (every 20 s under "ready", 3 s otherwise), so a dead socket
// or a dead stream costs speed, never correctness.
//
// Identity: the first frame is {t:"auth", initData} — the same signed Telegram initData every Mini App
// request carries, checked the same way (telegramAuth.validateInitData). Never in the URL: a URL
// lands in proxy logs. No valid frame within AUTH_WINDOW_MS → the socket closes with 4401.
//
// Who hears what is decided by shared/rideStream (phone AND the ride the bot knows as current), and
// the member's current ride is re-read on every nudge for them, so a finished ride stops its
// positions at once. Flag `corestream` (or the owner's preview); off → 4403.

import type { Server as HttpServer, IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import { locBelongsTo, nudgeBelongsTo, parseAuthFrame, tail9, type CoreLoc, type CoreNudge } from "@t1067/shared";
import { env } from "../env";
import { prisma } from "../db";
import { validateInitData } from "./telegramAuth";
import { isTgBanned } from "../services/banService";
import { getMemberId } from "../services/memberService";
import { coreStreamHealthy, onCoreHealth, onCoreLoc, onCoreNudge } from "../services/coreStream";

export const RIDE_WS_PATH = "/api/ride-ws";
/** The first frame must arrive this fast — the Mini App sends it the moment the socket opens. */
const FIRST_FRAME_MS = 3_000;
/** Checking it (flag, member, ride: database reads) may take longer than that, but not for ever. */
const AUTH_DONE_MS = 10_000;
const PING_MS = 30_000;
const MAX_CLIENTS = 2_000;
/** One person, a few devices. Past this the oldest is let go, so one account cannot fill the server. */
const MAX_PER_MEMBER = 4;

interface RideClient {
  ws: WebSocket;
  telegramId: string;
  memberId: number;
  tail9: string | null;
  bookingId: number | null;
  alive: boolean;
}

const clients = new Set<RideClient>();
const refreshedAt = new WeakMap<RideClient, number>();
let pending = 0; // connected, not yet signed in — counted against MAX_CLIENTS too

/** Everything the socket needs from the rest of the bot — injectable so it can be tested without a DB. */
export interface RideSocketDeps {
  /** Flag (or the owner's preview) for this Telegram id. */
  allowed: (telegramId: string) => Promise<boolean>;
  /** Signed initData → Telegram id, or null. */
  verify: (initData: string) => string | null;
  memberOf: (telegramId: string) => Promise<number | null>;
  /** The member's current ride as the sweep recorded it, and their phone. */
  rideOf: (memberId: number) => Promise<{ bookingId: number | null; phone: string | null }>;
  onNudge: (fn: (n: CoreNudge) => void) => unknown;
  onLoc: (fn: (l: CoreLoc) => void) => unknown;
  /** Whether the core's stream is live right now, and a hook for when that changes. */
  healthy: () => boolean;
  onHealth: (fn: (healthy: boolean) => void) => unknown;
}

const defaultDeps = (allowed: RideSocketDeps["allowed"]): RideSocketDeps => ({
  allowed,
  verify: (initData) => {
    const check = env.BOT_TOKEN ? validateInitData(initData, env.BOT_TOKEN) : null;
    const id = check?.ok && check.user ? String(check.user.id) : null;
    return id && !isTgBanned(id) ? id : null;
  },
  memberOf: (tgId) => getMemberId(tgId).catch(() => null),
  rideOf: async (memberId) => {
    const m = await prisma.member.findUnique({ where: { id: memberId }, select: { lastBookingId: true, phone: true } }).catch(() => null);
    return { bookingId: m?.lastBookingId ?? null, phone: m?.phone ?? null };
  },
  onNudge: onCoreNudge,
  onLoc: onCoreLoc,
  healthy: coreStreamHealthy,
  onHealth: onCoreHealth,
});

let deps: RideSocketDeps;

async function refreshBooking(c: RideClient): Promise<void> {
  const r = await deps.rideOf(c.memberId).catch(() => ({ bookingId: null, phone: null }));
  c.bookingId = r.bookingId;
  c.tail9 = tail9(r.phone);
}

function send(c: RideClient, msg: unknown): void {
  if (c.ws.readyState === c.ws.OPEN) c.ws.send(JSON.stringify(msg));
}

/**
 * Attach the ride socket to the HTTP server. `allowed(telegramId)` answers the flag (or the owner's
 * preview) per connection.
 */
export function attachRideSocket(
  server: HttpServer,
  allowed: (telegramId: string) => Promise<boolean>,
  override: Partial<RideSocketDeps> = {},
): void {
  deps = { ...defaultDeps(allowed), ...override };
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });

  server.on("upgrade", (req: IncomingMessage, sock: Duplex, head: Buffer) => {
    const path = (req.url ?? "").split("?")[0];
    if (path !== RIDE_WS_PATH) {
      // Not ours. With no other upgrade listener Node no longer answers these by itself, and a
      // connection left alone hangs open for ever — a free way to hold the server's file handles.
      if (server.listenerCount("upgrade") === 1) sock.end("HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
      return;
    }
    if (clients.size + pending >= MAX_CLIENTS) { sock.destroy(); return; }
    wss.handleUpgrade(req, sock, head, (ws) => wss.emit("connection", ws));
  });

  wss.on("connection", (ws: WebSocket) => {
    // waiting → (first frame) checking → in; any of them → gone when the socket closes.
    let state: "waiting" | "checking" | "in" | "gone" = "waiting";
    let client: RideClient | null = null;
    let authDone: ReturnType<typeof setTimeout> | undefined;
    pending++;
    const firstFrame = setTimeout(() => { if (state === "waiting") ws.close(4401, "auth required"); }, FIRST_FRAME_MS);
    const stillChecking = () => state === "checking" && ws.readyState === ws.OPEN;
    const refuse = (code: number, why: string) => {
      clearTimeout(authDone);
      if (ws.readyState === ws.OPEN) ws.close(code, why);
    };

    ws.on("message", async (data) => {
      if (state !== "waiting") return; // one auth frame; after it the passenger has nothing to say to us
      state = "checking";
      clearTimeout(firstFrame);
      // A slow database is not a bad passenger: 1013 ("try again later") — the Mini App retries.
      authDone = setTimeout(() => { if (state === "checking") ws.close(1013, "try again"); }, AUTH_DONE_MS);
      const frame = parseAuthFrame(String(data));
      const tgId = frame ? deps.verify(frame.initData) : null;
      if (!tgId) return refuse(4401, "auth failed");
      const ok = await deps.allowed(tgId).catch(() => false);
      if (!stillChecking()) return;
      if (!ok) return refuse(4403, "stream off");
      const memberId = await deps.memberOf(tgId).catch(() => null);
      if (!stillChecking()) return;
      if (!memberId) return refuse(4404, "not linked");
      const c: RideClient = { ws, telegramId: tgId, memberId, tail9: null, bookingId: null, alive: true };
      await refreshBooking(c);
      // Ask the flag once more, right before joining: a check that began before the owner switched
      // it off must not slip in after the switch let everyone go. Nothing awaits between this answer
      // and clients.add below, so any later recheck sees this passenger.
      const stillAllowed = await deps.allowed(tgId).catch(() => false);
      if (!stillChecking()) return; // closed while we were looking
      if (!stillAllowed) return refuse(4403, "stream off");
      clearTimeout(authDone);
      state = "in";
      pending--;
      client = c;
      const mine = [...clients].filter((x) => x.memberId === memberId); // oldest first (insertion order)
      if (mine.length >= MAX_PER_MEMBER) {
        const oldest = mine[0]!;
        clients.delete(oldest);
        oldest.ws.close(4409, "replaced");
      }
      clients.add(c);
      send(c, { t: deps.healthy() ? "ready" : "down" });
    });
    ws.on("pong", () => { if (client) client.alive = true; });
    ws.on("close", () => {
      clearTimeout(firstFrame);
      clearTimeout(authDone);
      if (state === "waiting" || state === "checking") pending--;
      state = "gone";
      if (client) clients.delete(client);
    });
    ws.on("error", () => { /* close follows */ });
  });

  // One heartbeat for all sockets: a phone that vanished without closing is dropped, not leaked.
  const ping = setInterval(() => {
    for (const c of clients) {
      if (!c.alive) { c.ws.terminate(); clients.delete(c); continue; }
      c.alive = false;
      try { c.ws.ping(); } catch { /* terminate next round */ }
    }
  }, PING_MS);
  ping.unref?.();

  deps.onHealth((healthy: boolean) => {
    for (const c of clients) send(c, { t: healthy ? "ready" : "down" });
  });

  deps.onNudge(async (n: CoreNudge) => {
    for (const c of clients) {
      if (!nudgeBelongsTo(n, c)) continue;
      await refreshBooking(c); // the ride may have just started or ended
      send(c, { t: "nudge", status: n.status });
    }
  });

  deps.onLoc(async (l: CoreLoc) => {
    const now = Date.now();
    for (const c of clients) {
      // Their phone but not yet their ride: the sweep that records a new ride runs on the same nudge
      // and may land a moment later. Look again — at most every 5 s per passenger.
      if (!locBelongsTo(l, c) && c.tail9 && l.phoneTail9 === c.tail9 && now - (refreshedAt.get(c) ?? 0) > 5_000) {
        refreshedAt.set(c, now);
        await refreshBooking(c);
      }
      if (locBelongsTo(l, c)) send(c, { t: "pos", lat: l.lat, lng: l.lng, bearing: l.bearing, at: l.at });
    }
  });
}

/**
 * The flag may just have gone off: let go of everyone no longer allowed. Their Mini App treats 4403
 * as final and falls back to its 3 s poll at once — the kill switch reaches passengers already
 * connected, not only new ones. Returns how many were let go.
 */
export async function recheckRideClients(): Promise<number> {
  if (!deps) return 0;
  let dropped = 0;
  for (const c of [...clients]) {
    if (await deps.allowed(c.telegramId).catch(() => false)) continue;
    clients.delete(c);
    c.ws.close(4403, "stream off");
    dropped++;
  }
  if (dropped) console.log(`[ride-ws] flag off — let ${dropped} passenger socket(s) go; they poll every 3 s`);
  return dropped;
}

/** How many passengers are listening — for the health line. */
export function rideSocketClients(): number {
  return clients.size;
}
