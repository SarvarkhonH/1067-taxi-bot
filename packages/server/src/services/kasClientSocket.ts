// ⚡ kas CLIENT Netty socket (W2 №1 "instant status") — the official rider app's real-time channel.
// PROVEN LIVE via scripts/probeClientSocket.ts (2026-07-03): TCP 46.8.176.53:1114, line-delimited
// UTF-8 frames wrapped "#<…>", handshake `auth` → `auth_success` → `start`, then the server PUSHES a
// booking-status frame the instant it changes. Statuses: new/take/called/in_place/no_booking + logout.
//
// Our use is a TRIGGER only: on a booking-status CHANGE for a member with a live ride we kick a
// SCOPED sweep (pushBookingUpdates with memberScope) so the bot card updates in ~1-2s instead of the
// 5-90s poll. The socket NEVER grants money / renders — the sweep stays the single idempotent
// authority; if the socket dies, the normal sweep is the automatic fallback.
//
// TIMING: the socket is armed at BOOKING CREATION (armInstant, from createBookingFor) so it's live
// BEFORE the driver accepts — arming lazily from the sweep was too late (the sweep only runs every
// 5-90s, so the initial "found" still came slow). The sweep re-arms as a fallback.
//
// Two hard-won details (both cost a slow-test round): (1) kas closes the socket after the first
// frame unless we stream a `location` keepalive every 3s (like the app) — so we do; (2) kas echoes
// the CURRENT status on every keepalive, so we only trigger on status != lastStatus (no 3s storm).
import net from "node:net";
import type { Bot } from "grammy";
import { env } from "../env";

const HOST = process.env.KAS_CLIENT_SOCKET_HOST || "46.8.176.53";
const PORT = Number(process.env.KAS_CLIENT_SOCKET_PORT) || 1114;
const RECONNECT_MS = 5_000;
const KEEPALIVE_MS = 3_000;

const BOOKING_STATUSES = new Set(["new_booking", "take_booking", "called_booking", "in_place_booking", "no_booking", "logout"]);

function kasPhone(phone: string): string {
  const last9 = phone.replace(/\D/g, "").slice(-9);
  return last9.length === 9 ? `+998${last9}` : phone;
}

interface Conn {
  phone: string;
  secretKey: string;
  sock: net.Socket | null;
  stopped: boolean;
  buf: string;
  lastStatus: string;
  authed: boolean;
  keepAlive: ReturnType<typeof setInterval> | null;
}

class KasClientSocket {
  private conns = new Map<number, Conn>();
  private stopped = false;
  private bot: Bot | null = null;

  /** Boot: the socket triggers a scoped sweep on status change, which needs the bot. */
  setBot(bot: Bot): void {
    this.bot = bot;
  }

  /** Open (or keep) a socket for a member with a live ride. Idempotent: an existing live socket for
   *  the same secretKey is a no-op; a changed key reconnects. */
  register(memberId: number, phone: string, secretKey: string): void {
    if (env.KAS_MODE !== "live" || this.stopped || !phone || !secretKey) return;
    const existing = this.conns.get(memberId);
    if (existing && existing.secretKey === secretKey && existing.sock) return; // already live
    if (existing) this.close(memberId); // stale/changed key → drop and reopen
    const c: Conn = { phone, secretKey, sock: null, stopped: false, buf: "", lastStatus: "", authed: false, keepAlive: null };
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

  private trigger(memberId: number, status: string): void {
    console.log(`[clientsocket] m${memberId} ⚡ ${status} → scoped sweep`);
    const bot = this.bot;
    if (!bot) return;
    void import("./bookingNotifier")
      .then(({ pushBookingUpdates }) => pushBookingUpdates(bot, undefined, { memberScope: { id: memberId } }))
      .catch((e) => console.error("[clientsocket] scoped sweep failed:", e instanceof Error ? e.message : e));
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

  /** Parse newline-delimited "#<…>" frames; fire the scoped-sweep trigger on a booking-status CHANGE. */
  feed(memberId: number, chunk: string): void {
    const c = this.conns.get(memberId);
    if (!c) return;
    c.buf += chunk;
    let nl: number;
    while ((nl = c.buf.indexOf("\n")) >= 0) {
      const raw = c.buf.slice(0, nl).replace(/\r/g, "");
      c.buf = c.buf.slice(nl + 1);
      if (!raw) continue;
      const status = raw.replace(/^#?</, "").replace(/>$/, "").split("|")[0] ?? "";
      if (status === "auth_success") {
        c.authed = true;
        console.log(`[clientsocket] m${memberId} authed ✅ (socket live)`);
        this.send(c, "start");
        if (c.keepAlive) clearInterval(c.keepAlive);
        c.keepAlive = setInterval(() => {
          if (c.sock && !c.sock.destroyed) this.send(c, "location"); // keepalive — else kas closes the socket
        }, KEEPALIVE_MS);
        continue;
      }
      if (BOOKING_STATUSES.has(status)) {
        if (status === c.lastStatus) continue; // keepalive echo of the SAME state — ignore (no storm)
        c.lastStatus = status;
        this.trigger(memberId, status);
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

/** Flag-gated arm helper — read the member's kas secretKey operator-side and open the socket. Called
 *  at booking creation (so it's live before the accept) AND from the sweep (fallback). Fire-and-forget:
 *  never blocks the caller; a missing secretKey (client never used the kas app) just skips instant mode. */
export async function armInstant(memberId: number, phone: string | null | undefined): Promise<void> {
  if (!phone || env.KAS_MODE !== "live") return;
  try {
    const { featureOn } = await import("./featureFlags");
    if (!(await featureOn("instantstatus"))) return;
    if (kasClientSocket.isUp(memberId)) return;
    const { getDataSource } = await import("../kas");
    const ds = getDataSource() as unknown as { readClientAuth(p: string): Promise<{ secretKey: string | null }> };
    const auth = await ds.readClientAuth(phone).catch(() => ({ secretKey: null }));
    if (auth.secretKey) kasClientSocket.register(memberId, phone, auth.secretKey);
  } catch (e) {
    console.error("[clientsocket] armInstant failed:", e instanceof Error ? e.message : e);
  }
}
