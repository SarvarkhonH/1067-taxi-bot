// 🚕 B qism P0-4/P0-5: the ride socket (/api/ride-ws). While a ride is on, the server says the moment
// something changed ("nudge" → fetch /api/booking/active now) and, with `ridemap`, where the driver's
// car is ("pos"). A socket that never opens, or closes, costs speed only: the caller keeps polling
// (every 3 s without it, every 20 s under it — shared/rideStream.ridePollMs).
// In the background (app minimised, phone locked) the socket is closed and nothing retries; it opens
// again the moment the app is back in front.
import { useEffect, useRef, useState } from "react";
import { getInitData, rideSocketUrl } from "./api";

export interface RidePos {
  lat: number;
  lng: number;
  bearing: number;
  at: string;
}

/**
 * Codes the server closes with when this socket is not for us — polling stays, no retry storm:
 * 4401 not signed, 4403 flag off, 4404 not linked, 4409 the same account opened a newer one.
 * (1013 "try again later" is not final: a slow server is retried with backoff.)
 */
const FINAL_CLOSE = new Set([4401, 4403, 4404, 4409]);

/** True while the socket is authenticated AND the server says the core's stream is live. Never throws. */
export function useRideStream(enabled: boolean, onNudge: () => void, onPos?: (p: RidePos) => void): boolean {
  const [open, setOpen] = useState(false);
  const nudgeRef = useRef(onNudge);
  nudgeRef.current = onNudge;
  const posRef = useRef(onPos);
  posRef.current = onPos;

  useEffect(() => {
    if (!enabled || typeof WebSocket === "undefined") {
      setOpen(false);
      return;
    }
    let ws: WebSocket | null = null;
    let closed = false;
    let final = false; // the server said this socket is not for us — stay on polling
    let retry: number | undefined;
    let attempt = 0;

    const connect = () => {
      if (closed || final || ws || document.hidden) return;
      const initData = getInitData();
      if (!initData) return; // outside Telegram: nothing to authenticate with, polling it is
      let sock: WebSocket;
      try {
        sock = new WebSocket(rideSocketUrl());
      } catch {
        return;
      }
      ws = sock;
      sock.onopen = () => sock.send(JSON.stringify({ t: "auth", initData }));
      sock.onmessage = (ev) => {
        let m: { t?: string; lat?: unknown; lng?: unknown; bearing?: unknown; at?: unknown };
        try { m = JSON.parse(String(ev.data)); } catch { return; }
        if (m.t === "ready") { attempt = 0; setOpen(true); }
        else if (m.t === "down") { attempt = 0; setOpen(false); } // signed in, but the core's stream is not live
        else if (m.t === "nudge") nudgeRef.current();
        else if (m.t === "pos" && typeof m.lat === "number" && typeof m.lng === "number" && Number.isFinite(m.lat) && Number.isFinite(m.lng)) {
          posRef.current?.({ lat: m.lat, lng: m.lng, bearing: Number(m.bearing) || 0, at: String(m.at ?? "") });
        }
      };
      sock.onclose = (ev) => {
        if (ws === sock) ws = null;
        setOpen(false);
        if (FINAL_CLOSE.has(ev.code)) final = true;
        if (closed || final || document.hidden) return; // hidden: onVisible reconnects
        attempt++;
        retry = window.setTimeout(connect, Math.min(30_000, 1_000 * 2 ** attempt));
      };
      sock.onerror = () => { /* onclose follows */ };
    };

    const onVisible = () => {
      if (document.hidden) {
        if (retry) { clearTimeout(retry); retry = undefined; }
        ws?.close();
        return;
      }
      attempt = 0;
      connect();
    };

    connect();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      closed = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (retry) clearTimeout(retry);
      ws?.close();
      setOpen(false);
    };
  }, [enabled]);

  return open;
}
