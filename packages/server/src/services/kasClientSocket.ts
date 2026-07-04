// ⚡ kas CLIENT Netty socket (W2 №1 "instant status") — the official rider app's real-time channel.
// PROVEN LIVE via scripts/probeClientSocket.ts (2026-07-03): TCP 46.8.176.53:1114, line-delimited
// UTF-8 frames wrapped "#<…>", handshake `auth` → `auth_success` → `start`, then the server PUSHES a
// booking-status frame the instant it changes (event-driven — no polling spam observed). Statuses:
// new_booking · take_booking · called_booking · in_place_booking · no_booking · logout.
//
// Our use is a TRIGGER only: on any status frame for a member with a live ride we fire onEvent(),
// which kicks a SCOPED sweep (pushBookingUpdates with memberScope) so the bot card updates in ~1-2s
// instead of waiting for the 5-90s poll. The socket NEVER grants money / renders — the sweep stays
// the single idempotent authority; if the socket dies, the normal sweep is the automatic fallback.
//
// Auth phone MUST be the checkClient format (+998XXXXXXXXX) — the raw 9-digit form is silently
// ignored by the netty server (proven in the probe). One connection per member (keyed by memberId).
import net from "node:net";
import { env } from "../env";

const HOST = process.env.KAS_CLIENT_SOCKET_HOST || "46.8.176.53";
const PORT = Number(process.env.KAS_CLIENT_SOCKET_PORT) || 1114;
const RECONNECT_MS = 5_000;
const EVENT_DEBOUNCE_MS = 1_200; // collapse a burst of frames into one scoped sweep

const BOOKING_STATUSES = new Set(["new_booking", "take_booking", "called_booking", "in_place_booking", "no_booking", "logout"]);

function kasPhone(phone: string): string {
  const last9 = phone.replace(/\D/g, "").slice(-9);
  return last9.length === 9 ? `+998${last9}` : phone;
}

const KEEPALIVE_MS = 3_000; // official app sends `location` every clientLocationTimer(=3000)ms; without
// it kas closes the "idle" socket after the first frame → we'd miss later status changes (proven:
// the socket re-armed every ~90s and only ever caught the on-connect state, so accepts came via the
// slow poll). Sending the keepalive keeps it live so take_booking/in_place arrive in real time.

interface Conn {
  phone: string;
  secretKey: string;
  onEvent: (status: string) => void;
  sock: net.Socket | null;
  stopped: boolean;
  buf: string;
  lastEventAt: number;
  lastStatus: string; // kas echoes the current booking status on EVERY keepalive — only a CHANGE fires the sweep
  authed: boolean;
  keepAlive: ReturnType<typeof setInterval> | null;
}

class KasClientSocket {
  private conns = new Map<number, Conn>();
  private stopped = false;

  /** Open (or keep) a socket for a member with a live ride. Idempotent: re-registering the same
   *  member with a live socket only refreshes the callback; a NEW secretKey reconnects. */
  register(memberId: number, phone: string, secretKey: string, onEvent: (status: string) => void): void {
    if (env.KAS_MODE !== "live" || this.stopped || !phone || !secretKey) return;
    const existing = this.conns.get(memberId);
    if (existing && existing.secretKey === secretKey && existing.sock) {
      existing.onEvent = onEvent; // same session — just refresh the trigger
      return;
    }
    if (existing) this.close(memberId); // stale/changed key → drop and reopen
    const c: Conn = { phone, secretKey, onEvent, sock: null, stopped: false, buf: "", lastEventAt: 0, lastStatus: "", authed: false, keepAlive: null };
    this.conns.set(memberId, c);
    console.log(`[clientsocket] arm m${memberId} → ${HOST}:${PORT}`);
    this.connect(memberId);
  }

  /** Ride ended / member no longer active → close their socket. */
  unregister(memberId: number): void {
    this.close(memberId);
    this.conns.delete(memberId);
  }

  isUp(memberId: number): boolean {
    return !!this.conns.get(memberId)?.authed;
  }

  private close(memberId: number): void {
    const c = this.conns.get(memberId);
    if (!c) return;
    c.stopped = true;
    if (c.keepAlive) { clearInterval(c.keepAlive); c.keepAlive = null; }
    try {
      c.sock?.destroy();
    } catch {
      /* ignore */
    }
    c.sock = null;
    c.authed = false;
  }

  private send(c: Conn, status: string): void {
    if (!c.sock || c.sock.destroyed) return;
    c.sock.write(`#<${status}|${kasPhone(c.phone)}|${c.secretKey}|0.0|0.0>\r\n`);
  }

  private connect(memberId: number): void {
    const c = this.conns.get(memberId);
    if (!c || c.stopped || this.stopped) return;
    let sock: net.Socket;
    try {
      sock = net.connect(PORT, HOST);
    } catch {
      setTimeout(() => this.connect(memberId), RECONNECT_MS);
      return;
    }
    c.sock = sock;
    c.authed = false;
    c.buf = "";
    sock.setEncoding("utf8");
    sock.setKeepAlive(true, 30_000);
    sock.on("connect", () => this.send(c, "auth"));
    sock.on("data", (chunk: string) => this.feed(memberId, String(chunk)));
    sock.on("error", () => {
      try {
        sock.destroy();
      } catch {
        /* ignore */
      }
    });
    sock.on("close", () => {
      c.sock = null;
      c.authed = false;
      if (c.keepAlive) { clearInterval(c.keepAlive); c.keepAlive = null; }
      if (!c.stopped && !this.stopped && this.conns.get(memberId) === c) setTimeout(() => this.connect(memberId), RECONNECT_MS);
    });
  }

  /** Parse newline-delimited "#<…>" frames; fire the scoped-sweep trigger on a booking-status change. */
  feed(memberId: number, chunk: string): void {
    const c = this.conns.get(memberId);
    if (!c) return;
    c.buf += chunk;
    let nl: number;
    while ((nl = c.buf.indexOf("\n")) >= 0) {
      const raw = c.buf.slice(0, nl).replace(/\r/g, "");
      c.buf = c.buf.slice(nl + 1);
      if (!raw) continue;
      const inner = raw.replace(/^#?</, "").replace(/>$/, "");
      const status = inner.split("|")[0] ?? "";
      if (status === "auth_success") {
        c.authed = true;
        console.log(`[clientsocket] m${memberId} authed ✅ (socket live)`);
        this.send(c, "start");
        // keepalive: the official app streams `location` every 3s; without it kas closes the socket
        // after the first frame (proven). Keeps the connection live so later status changes arrive.
        if (c.keepAlive) clearInterval(c.keepAlive);
        c.keepAlive = setInterval(() => {
          if (c.sock && !c.sock.destroyed) this.send(c, "location");
        }, KEEPALIVE_MS);
        continue;
      }
      if (BOOKING_STATUSES.has(status)) {
        if (status === c.lastStatus) continue; // keepalive echo of the SAME state — ignore (no storm)
        c.lastStatus = status;
        const now = Date.now();
        if (now - c.lastEventAt < EVENT_DEBOUNCE_MS) continue; // collapse a rapid burst of real changes
        c.lastEventAt = now;
        console.log(`[clientsocket] m${memberId} ⚡ ${status} → scoped sweep`);
        try {
          c.onEvent(status);
        } catch (e) {
          console.error("[clientsocket] onEvent failed:", e instanceof Error ? e.message : e);
        }
      }
    }
  }

  stop(): void {
    this.stopped = true;
    for (const id of this.conns.keys()) this.close(id);
    this.conns.clear();
  }
}

export const kasClientSocket = new KasClientSocket();
