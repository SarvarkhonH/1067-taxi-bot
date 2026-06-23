// 📡 kas map WebSocket — REAL-TIME driver positions (ws://serverIp:mapSocketPort/websocket).
// The kas1067 SPA's live map uses this. Each frame is pipe-delimited:
//     "carNumber|status|latitude|longitude|bearing"   e.g. "70U560YA|busy|39.05|65.59|206.85"
// We keep the latest position per car and, for REGISTERED active bookings, fire an INSTANT
// "arrived" callback the moment the assigned car reaches the pickup — replacing the 15s sweep
// delay (the real-time, "bot instead of SMS" win). This is PUSH, not a poller. No auth needed
// (proven: a plain WS connect streams data). Auto-reconnects on drop. KAS_MODE=live only.
import WebSocket from "ws";
import { env } from "../env";
import { haversineKm } from "@t1067/shared";

// from GET /kas1067/api/onlineDriverMapProperties → { serverIp: "46.8.176.53", mapSocketPort: 1115 }.
// Overridable via env in case kas moves the socket; falls back to the proven default.
const SOCKET_URL = process.env.KAS_MAP_SOCKET || "ws://46.8.176.53:1115/websocket";
const ARRIVE_KM = 0.09; // ~90 m geofence around the pickup = "driver has arrived"
const POS_TTL_MS = 60_000; // a position older than this is stale (car stopped broadcasting)
const RECONNECT_MS = 5_000;

const norm = (c: string): string => c.replace(/\s/g, "").toUpperCase();

export interface CarPos {
  lat: number;
  lng: number;
  status: string; // "empty" | "busy" | …
  bearing: number;
  at: number; // Date.now() of the last frame
}
interface Reg {
  bookingId: number;
  pickup: { lat: number; lng: number };
  onArrive: () => void;
  arrived: boolean;
}

class KasMapSocket {
  private ws: WebSocket | null = null;
  private cars = new Map<string, CarPos>();
  private regs = new Map<string, Reg>();
  private stopped = false;
  private connected = false;

  start(): void {
    if (env.KAS_MODE !== "live" || this.ws || this.stopped) return;
    this.connect();
  }

  private connect(): void {
    if (this.stopped) return;
    let ws: WebSocket;
    try {
      ws = new WebSocket(SOCKET_URL);
    } catch {
      setTimeout(() => this.connect(), RECONNECT_MS);
      return;
    }
    this.ws = ws;
    ws.on("open", () => {
      this.connected = true;
      console.log("[mapsocket] connected:", SOCKET_URL);
    });
    ws.on("message", (d) => this.feed(String(d)));
    ws.on("error", () => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    });
    ws.on("close", () => {
      this.connected = false;
      this.ws = null;
      if (!this.stopped) setTimeout(() => this.connect(), RECONNECT_MS);
    });
  }

  /** Parse one WS frame, update the car's position, and fire instant arrival if a registered
   *  booking's car reached its pickup. Public so it can be unit-tested with synthetic frames. */
  feed(raw: string): void {
    const p = raw.split("|");
    if (p.length < 4) return;
    const car = norm(p[0] ?? "");
    const lat = Number(p[2]);
    const lng = Number(p[3]);
    if (!car || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    this.cars.set(car, { lat, lng, status: p[1] ?? "", bearing: Number(p[4]) || 0, at: Date.now() });
    const reg = this.regs.get(car);
    if (reg && !reg.arrived && haversineKm({ lat, lng }, reg.pickup) <= ARRIVE_KM) {
      reg.arrived = true;
      try {
        reg.onArrive();
      } catch (e) {
        console.error("[mapsocket] onArrive failed:", e instanceof Error ? e.message : e);
      }
    }
  }

  /** Track an active booking's car → onArrive() fires ONCE, the instant it reaches the pickup.
   *  Re-registering the SAME booking each sweep tick is a no-op; a NEW booking on the same car
   *  re-arms it (resets arrived) — so no separate unregister is needed and the registry stays
   *  bounded by the fleet size. */
  register(carNumber: string, bookingId: number, pickup: { lat: number; lng: number }, onArrive: () => void): void {
    const car = norm(carNumber);
    if (!car) return;
    const existing = this.regs.get(car);
    if (existing && existing.bookingId === bookingId) return; // already tracking THIS ride
    this.regs.set(car, { bookingId, pickup, onArrive, arrived: false });
  }

  unregister(carNumber: string): void {
    this.regs.delete(norm(carNumber));
  }

  /** Latest live position of a car (null if unknown or stale). */
  position(carNumber: string): CarPos | null {
    const pos = this.cars.get(norm(carNumber));
    return pos && Date.now() - pos.at < POS_TTL_MS ? pos : null;
  }

  /** All cars currently broadcasting (fresh within POS_TTL_MS) → live map pins, exactly what the
   *  official rider app shows. The REST drivers/byFilter snapshot carries lat/lng=0, so THIS socket
   *  cache is the only real source of the live fleet. busy = metered/occupied (status "busy"). */
  livePins(): { lat: number; lng: number; bearing: number; busy: boolean }[] {
    const now = Date.now();
    const out: { lat: number; lng: number; bearing: number; busy: boolean }[] = [];
    for (const pos of this.cars.values()) {
      if (now - pos.at > POS_TTL_MS) continue;
      out.push({ lat: pos.lat, lng: pos.lng, bearing: pos.bearing, busy: pos.status.toLowerCase() === "busy" });
    }
    return out;
  }

  isUp(): boolean {
    return this.connected;
  }

  stop(): void {
    this.stopped = true;
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
  }
}

export const kasMapSocket = new KasMapSocket();
