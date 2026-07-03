// 🛡 Read-only live trip view (family safety). Opened via a public link (?track=<token>) — no login,
// no Telegram needed. Shows the car moving + live fare + ETA until the trip ends. Data comes from the
// public /api/track/<token> endpoint (active-only, no PII).
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { formatNumber } from "@t1067/shared";
import { api, type PublicTrip } from "./api";

const TILE_URL = "https://mt{s}.google.com/vt/lyrs=m&hl=uz&x={x}&y={y}&z={z}";
const TILE_SUBDOMAINS = ["0", "1", "2", "3"];
const CAR = `<svg width="34" height="34" viewBox="0 0 32 32" style="display:block"><rect x="9.5" y="3" width="13" height="26" rx="6" fill="#FFB300"/><path d="M11 7 Q16 4.3 21 7 L20 12 H12 Z" fill="#0b1f3a" opacity=".78"/><rect x="11.5" y="20" width="9" height="6" rx="2" fill="#0b1f3a" opacity=".5"/></svg>`;

export function TrackView({ token }: { token: string }) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const map = useRef<L.Map | null>(null);
  const carMk = useRef<L.Marker | null>(null);
  const pickMk = useRef<L.Marker | null>(null);
  const centered = useRef(false);
  const [trip, setTrip] = useState<PublicTrip | null>(null);
  // Viral CTA (server-gated via trip.ctaLink): appears only after a delay so the safety moment
  // ("is my kid ok?") is never interrupted; dismiss sticks for the session. Never covers the map.
  const [ctaReady, setCtaReady] = useState(false);
  const [ctaGone, setCtaGone] = useState(() => sessionStorage.getItem("tv_cta_off") === "1");

  useEffect(() => {
    const t = window.setTimeout(() => setCtaReady(true), 7000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!mapRef.current || map.current) return;
    const m = L.map(mapRef.current, { zoomControl: false, attributionControl: false }).setView([39.045, 65.56], 14);
    L.tileLayer(TILE_URL, { subdomains: TILE_SUBDOMAINS, maxZoom: 20 }).addTo(m);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const load = () => api.trackTrip(token).then((t) => { if (alive) setTrip(t); }).catch(() => undefined);
    load();
    const id = window.setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [token]);

  useEffect(() => {
    if (!map.current || !trip) return;
    if (trip.pickup) {
      if (!pickMk.current) pickMk.current = L.marker([trip.pickup.lat, trip.pickup.lng], { icon: L.divIcon({ className: "tv-pin", html: "📍", iconSize: [22, 22], iconAnchor: [11, 22] }) }).addTo(map.current);
      else pickMk.current.setLatLng([trip.pickup.lat, trip.pickup.lng]);
    }
    const d = trip.driver;
    if (d && d.lat != null && d.lng != null) {
      if (!carMk.current) carMk.current = L.marker([d.lat, d.lng], { icon: L.divIcon({ className: "tv-car", html: CAR, iconSize: [34, 34], iconAnchor: [17, 17] }) }).addTo(map.current);
      else carMk.current.setLatLng([d.lat, d.lng]);
      const svg = carMk.current.getElement()?.querySelector("svg") as SVGElement | null;
      if (svg && typeof d.bearing === "number") svg.style.transform = `rotate(${d.bearing}deg)`;
      if (!centered.current) {
        map.current.setView([d.lat, d.lng], 15, { animate: true });
        centered.current = true;
      }
    }
  }, [trip]);

  const ended = !!trip && !trip.active;
  return (
    <div className="tv-wrap">
      <div className="tv-top">🛡 1067 — safarni kuzatish</div>
      <div ref={mapRef} className="tv-map" />
      <div className="tv-panel">
        {!trip ? (
          <div className="tv-dim">⏳ Yuklanmoqda…</div>
        ) : ended ? (
          <>
            <div className="tv-ended">🏁 Safar yakunlandi — kuzatuv tugadi. Yaxshi yetib oldi! 🙌</div>
            {/* peak viral moment: the viewer is relieved the trip ended safely → the most receptive
                instant to invite. No 7s delay here (the safety concern is already resolved). */}
            {trip.ctaLink && !ctaGone && (
              <div className="tv-cta">
                <button className="tv-cta-x" aria-label="Yopish" onClick={() => { setCtaGone(true); sessionStorage.setItem("tv_cta_off", "1"); }}>✕</button>
                <div className="tv-cta-t">1067 bilan har safar jonli kuzatiladi — haydovchi tasdiqlangan, narx oldindan.</div>
                <a className="tv-cta-btn" href={trip.ctaLink}>🎁 Sizga ham 1067 — birinchi safar bepul</a>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="tv-status">
              {trip.status === "started" ? "🚗 Safarda" : trip.status === "arrived" ? "✅ Haydovchi yetib keldi" : "🟢 Haydovchi yo'lda"}
              {trip.etaMin ? ` · ~${trip.etaMin} daq` : ""}
            </div>
            {trip.driver && (
              <div className="tv-drv">🚘 {trip.driver.name} · {trip.driver.carModel} · <b>{trip.driver.carNumber}</b>{trip.driver.rating ? ` ⭐${trip.driver.rating.toFixed(1)}` : ""}</div>
            )}
            {trip.addressName && <div className="tv-addr">📍 {trip.addressName}</div>}
            {trip.fare ? <div className="tv-fare">🧮 <b>{formatNumber(trip.fare)} so'm</b> · hisoblanyapti</div> : null}
            {trip.won && <div className="tv-win">🎁 Bu safarda 1067dan sovg'a oldi</div>}
            <div className="tv-foot">🛡 Oila xavfsizligi · safar tugaguncha jonli yangilanadi</div>
            {trip.ctaLink && ctaReady && !ctaGone && (
              <div className="tv-cta">
                <button
                  className="tv-cta-x"
                  aria-label="Yopish"
                  onClick={() => {
                    setCtaGone(true);
                    sessionStorage.setItem("tv_cta_off", "1");
                  }}
                >
                  ✕
                </button>
                <div className="tv-cta-t">Bu safar 1067 orqali kuzatilyapti — haydovchi tasdiqlangan, marshrut jonli.</div>
                <a className="tv-cta-btn" href={trip.ctaLink}>
                  🎁 Sizga ham 1067 — birinchi safar bepul
                </a>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
