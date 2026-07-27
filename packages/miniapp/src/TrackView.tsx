// 🛡 Read-only live trip view (family safety). Opened via a public link (?track=<token>) — no login,
// no Telegram needed. Shows the car moving + live fare + ETA until the trip ends. Data comes from the
// public /api/track/<token> endpoint (active-only, no PII).
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { formatNumber, haversineKm } from "@t1067/shared";
import { api, type PublicTrip } from "./api";
import { useIsActive } from "./useIsActive";

const TILE_URL = "https://mt{s}.google.com/vt/lyrs=m&hl=uz&x={x}&y={y}&z={z}";
const TILE_SUBDOMAINS = ["0", "1", "2", "3"];
const CAR = `<svg width="34" height="34" viewBox="0 0 32 32" style="display:block"><rect x="9.5" y="3" width="13" height="26" rx="6" fill="#FFB300"/><path d="M11 7 Q16 4.3 21 7 L20 12 H12 Z" fill="#0b1f3a" opacity=".78"/><rect x="11.5" y="20" width="9" height="6" rx="2" fill="#0b1f3a" opacity=".5"/></svg>`;

export function TrackView({ token }: { token: string }) {
  const appActive = useIsActive(); // ⏸ fonda so'rov halqasi to'xtaydi
  const mapRef = useRef<HTMLDivElement | null>(null);
  const map = useRef<L.Map | null>(null);
  const carMk = useRef<L.Marker | null>(null);
  const pickMk = useRef<L.Marker | null>(null);
  const centered = useRef(false);
  // 🟡 breadcrumb trail — the path the car has taken, drawn as a polyline so the viewer sees WHERE
  // and WHICH WAY it moved. 🚗 speed computed from consecutive positions; peak kept as a trip stat.
  const trailLine = useRef<L.Polyline | null>(null);
  const trailPts = useRef<[number, number][]>([]);
  const lastPos = useRef<{ lat: number; lng: number; t: number } | null>(null);
  const maxSpeed = useRef(0);
  const [speedKmh, setSpeedKmh] = useState(0);
  const [panelMin, setPanelMin] = useState(false); // collapse the panel → bigger map (route + car)
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
    if (!appActive) { return () => { alive = false; }; } // ⏸ sahifa ko'rinmasa 5s halqa to'xtaydi
    load();
    const id = window.setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [token, appActive]);

  useEffect(() => {
    if (!map.current || !trip) return;
    if (trip.pickup) {
      if (!pickMk.current) pickMk.current = L.marker([trip.pickup.lat, trip.pickup.lng], { icon: L.divIcon({ className: "tv-pin", html: "📍", iconSize: [22, 22], iconAnchor: [11, 22] }) }).addTo(map.current);
      else pickMk.current.setLatLng([trip.pickup.lat, trip.pickup.lng]);
    }
    const d = trip.driver;
    if (d && d.lat != null && d.lng != null) {
      // 🟡 trail: append the point only when it moved enough (>~12 m) so GPS jitter doesn't clutter it
      const pts = trailPts.current;
      const last = pts[pts.length - 1];
      if (!last || haversineKm({ lat: last[0], lng: last[1] }, { lat: d.lat, lng: d.lng }) > 0.012) {
        pts.push([d.lat, d.lng]);
        if (pts.length > 400) pts.shift(); // bound memory on a long trip
        if (!trailLine.current) trailLine.current = L.polyline(pts, { color: "#f0b429", weight: 4, opacity: 0.85, lineJoin: "round" }).addTo(map.current);
        else trailLine.current.setLatLngs(pts);
      }
      // 🚗 speed from consecutive positions; ignore implausible jumps (stale/teleport GPS)
      const now = Date.now();
      if (lastPos.current) {
        const dt = (now - lastPos.current.t) / 1000;
        const dkm = haversineKm({ lat: lastPos.current.lat, lng: lastPos.current.lng }, { lat: d.lat, lng: d.lng });
        if (dt > 1 && dt < 90) {
          const kmh = Math.round(dkm / (dt / 3600));
          if (kmh >= 0 && kmh < 160) {
            setSpeedKmh(kmh);
            if (kmh > maxSpeed.current) maxSpeed.current = kmh;
          }
        }
      }
      lastPos.current = { lat: d.lat, lng: d.lng, t: now };

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
  const dismissCta = () => { setCtaGone(true); try { sessionStorage.setItem("tv_cta_off", "1"); } catch { /* private mode */ } };
  // ONE beautiful invite card, reused mid-trip (after a delay) + on the end screen. Not "first ride
  // free" — the owner's copy: "join too, get 5000 tanga bonus".
  const cta = trip?.ctaLink && !ctaGone ? (
    <div className="tv-cta">
      <button className="tv-cta-x" aria-label="Yopish" onClick={dismissCta}>✕</button>
      <div className="tv-cta-emoji">🎁</div>
      <div className="tv-cta-t">Siz ham 1067'ga ulaning</div>
      <div className="tv-cta-sub">Haydovchi tasdiqlangan · narx oldindan · har safar jonli kuzatuv</div>
      <a className="tv-cta-btn" href={trip.ctaLink}>5000 tanga bonus oling 🚕</a>
    </div>
  ) : null;
  return (
    <div className="tv-wrap">
      <div className="tv-top">
        <span className="tv-brand">🚕 1067</span>
        <span className="tv-live"><i className="tv-live-dot" /> Jonli kuzatuv</span>
      </div>
      <div ref={mapRef} className="tv-map" />
      <div className={`tv-panel${panelMin && !!trip && trip.active ? " tv-panel-min" : ""}`}>
        {/* grip = collapse toggle (active trip only) → bigger map to watch the route + car */}
        {trip && trip.active && (
          <div className="tv-grip" role="button" aria-label={panelMin ? "Panelni ochish" : "Panelni yig'ish"} onClick={() => setPanelMin((v) => !v)} />
        )}
        {!trip ? (
          <div className="tv-dim">⏳ Yuklanmoqda…</div>
        ) : ended ? (
          <>
            <div className="tv-endcard">
              <div className="tv-end-emoji">🏁</div>
              <div className="tv-end-title">Safar yakunlandi</div>
              <div className="tv-end-sub">Manzilga yetib oldi 🙌{maxSpeed.current > 0 ? ` · eng yuqori ${maxSpeed.current} km/soat` : ""}</div>
            </div>
            {/* peak viral moment: relief that the trip ended safely → most receptive to invite. */}
            {cta}
          </>
        ) : panelMin ? (
          // collapsed — one slim line so the map (route + car) fills the screen
          <div className="tv-mini" onClick={() => setPanelMin(false)}>
            <div className="tv-mini-hint">▲ Batafsil</div>
            <div className="tv-mini-row">
              <span>{trip.status === "started" ? "🚗 Safarda" : trip.status === "arrived" ? "✅ Yetib keldi" : "🟢 Yo'lda"}</span>
              {trip.status === "started" && speedKmh > 0 ? <b>{speedKmh} km/soat</b> : trip.etaMin ? <b>~{trip.etaMin} daq</b> : null}
            </div>
          </div>
        ) : (
          <>
            <div className={`tv-status${trip.status === "arrived" ? " tv-s-arrived" : trip.status === "started" ? " tv-s-trip" : ""}`}>
              <span className="tv-status-dot" />
              <span>{trip.status === "started" ? "🚗 Safarda" : trip.status === "arrived" ? "✅ Haydovchi yetib keldi" : "🟢 Haydovchi yo'lda"}</span>
              {trip.etaMin ? <b className="tv-eta">~{trip.etaMin} daq</b> : null}
            </div>
            {trip.driver && (
              <div className="tv-driver">
                <div className="tv-driver-av">🧑‍✈️</div>
                <div className="tv-driver-meta">
                  <div className="tv-driver-name">{trip.driver.name}{trip.driver.rating ? <span className="tv-driver-rate"> ⭐{trip.driver.rating.toFixed(1)}</span> : null}</div>
                  <div className="tv-driver-car">🚘 {trip.driver.carModel}</div>
                </div>
                <div className="tv-plate">{trip.driver.carNumber}</div>
              </div>
            )}
            {trip.addressName && <div className="tv-addr">📍 {trip.addressName}</div>}
            {trip.fare ? <div className="tv-fare"><span>🧮 Hisoblagich</span><b>{formatNumber(trip.fare)} so'm</b></div> : null}
            {trip.status === "started" && speedKmh > 0 ? <div className="tv-fare"><span>🚗 Tezlik</span><b className="tv-speed">{speedKmh} km/soat</b></div> : null}
            {trip.won && <div className="tv-win">🎁 Bu safarda 1067dan sovg'a oldi</div>}
            <div className="tv-foot">🛡 Oila xavfsizligi · safar tugaguncha jonli yangilanadi</div>
            {ctaReady && cta}
          </>
        )}
      </div>
    </div>
  );
}
