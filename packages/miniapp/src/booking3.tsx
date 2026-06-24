// 🗺 BOOKING 3.0 (E1-E4) — Leaflet (raster <img> tiles, NO WebGL) dark, map-first.
// WHY Leaflet, not MapLibre: MapLibre needs WebGL, which many Telegram WebViews (and budget
// Android) do NOT support → the map rendered nothing for real customers. Leaflet draws plain
// <img> tiles (like the old flow that always worked), so the map shows on every device.
// Leaflet is BUNDLED (npm), not loaded from unpkg — no foreign-CDN dependency (the Carto lesson).
// feature:booking3 gated; when off, falls back to the classic Leaflet BookingView (zero regression).
// kas is PICKUP-ONLY (taximeter, no destination routing) — so we honestly select the PICKUP and
// show a history-based fare "≈" (not a promise). Gold is ONLY on the CALL button.
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { formatNumber, GARAGE_RIDE_CAP_MIN, haversineKm, type ActiveBookingView, type BookingDriverView, type BookingInfoResponse, type GarageResponse, type MeResponse, type SavedAddressView, type WheelSpinResponse } from "@t1067/shared";
import { api } from "./api";
import { haptic, hapticSuccess, tg } from "./telegram";
import { confetti } from "./util";
import { Button, Sheet, Skeleton } from "./design/components";

const BookingViewOld = lazy(() => import("./booking").then((m) => ({ default: m.BookingView })));

// Google raster tiles ({s}=subdomain) — proven reachable on UZ networks (kas1067 runs on Google);
// Carto's vector CDN was UZ-blocked. Plain raster <img> tiles, NO WebGL. hl=uz → Uzbek labels.
const TILE_URL = "https://mt{s}.google.com/vt/lyrs=m&hl=uz&x={x}&y={y}&z={z}";
const TILE_SUBDOMAINS = ["0", "1", "2", "3"];

// Leaflet divIcon with NO default white box (className:"" drops .leaflet-div-icon styling);
// our own class styles the marker. Markers live in .leaflet-marker-pane → never dark-filtered.
function divIcon(cls: string, html: string): L.DivIcon {
  return L.divIcon({ className: "", html: `<div class="${cls}">${html}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] });
}

// The friendly "hailing" traveller (same character as the map center-pin) — reused for the pickup
// marker so every map pin is the little person, never a bare 📍. Waves + shadow pulse come from the
// shared .b3-hail-* CSS; the container .b3-pickperson adds a gentle bob.
const PERSON_SVG = `<svg viewBox="0 0 44 60" width="38" height="52" style="display:block">
  <ellipse class="b3-hail-shadow" cx="22" cy="56" rx="10" ry="2.6"/>
  <g class="b3-hail-fig">
    <path class="b3-hail-leg" d="M19 40 L17 52"/>
    <path class="b3-hail-leg" d="M25 40 L27 52"/>
    <rect class="b3-hail-torso" x="14" y="22" width="16" height="20" rx="7"/>
    <g class="b3-case"><rect x="2" y="42" width="9" height="10" rx="2" fill="#52607a"/><rect x="5.4" y="39.6" width="2.6" height="3" rx="1" fill="#52607a"/></g>
    <path class="b3-hail-arm0" d="M14 29 L9 42"/>
    <circle class="b3-hail-head" cx="22" cy="13" r="7.5"/>
    <path class="b3-hail-arm" d="M29 25 L36 11"/>
    <circle class="b3-hail-hand" cx="36" cy="11" r="2.6"/>
  </g>
</svg>`;
function personIcon(): L.DivIcon {
  // inner wrapper carries the bob — Leaflet owns transform on the icon ROOT for positioning
  return L.divIcon({ className: "", html: `<div class="b3-pickperson">${PERSON_SVG}</div>`, iconSize: [38, 52], iconAnchor: [19, 49] });
}

// Smooth count-up for fare figures — premium "meter climbing" feel (eased, animates on each change).
function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    const from = prev.current;
    const to = value;
    prev.current = to;
    if (from === to) return;
    const start = performance.now();
    const dur = 700;
    let raf = 0;
    const step = (now: number): void => {
      const p = Math.min(1, (now - start) / dur);
      setShown(Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{formatNumber(shown)}</>;
}

// 💥 a declined car "blows up" when the dispatch moves on — leans into the rider's read of the pings
// as shots at the car. Self-removing, purely cosmetic (the real next-driver cascade is unchanged).
function boom(map: L.Map, latlng: L.LatLng): void {
  const icon = L.divIcon({ className: "", html: `<div class="b3-boom"><span class="b3-boom-core">💥</span><i></i><i></i><i></i><i></i><i></i></div>`, iconSize: [0, 0], iconAnchor: [0, 0] });
  const m = L.marker(latlng, { icon, interactive: false, zIndexOffset: 600 }).addTo(map);
  window.setTimeout(() => m.remove(), 700);
}

// Clean top-down car marker (nose points up = heading 0; the wrapper is rotated by bearing so it
// looks like it's driving) — replaces the ugly 🚖/🟢 emoji. Two dark windows + a body tint read as
// a car at a glance even at small size, like Uber/Yandex map cars.
function carSvg(color: string, size: number): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" style="display:block">
    <rect x="9.5" y="3" width="13" height="26" rx="6" fill="${color}"/>
    <path d="M11 7 Q16 4.3 21 7 L20 12 H12 Z" fill="#0b1f3a" opacity=".78"/>
    <rect x="12" y="19.3" width="8" height="5.6" rx="2.3" fill="#0b1f3a" opacity=".62"/>
    <circle cx="16" cy="15.4" r="1.15" fill="#fff" opacity=".5"/>
  </svg>`;
}
function carIcon(color: string, bearing: number, size = 30): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div class="b3-carmark" style="transform:rotate(${bearing}deg)">${carSvg(color, size)}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// M5: OSRM road route (driver → pickup). Public demo server; it can be slow/blocked on some
// UZ networks (same lesson as OSM tiles), so the caller falls back to a straight dashed line —
// there is ALWAYS a visual link from the car to the pickup. coords come back [lng,lat] → swap.
async function osrmRoute(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  signal: AbortSignal,
): Promise<L.LatLngTuple[] | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    const r = await fetch(url, { signal });
    if (!r.ok) return null;
    const j = (await r.json()) as { routes?: { geometry?: { coordinates?: [number, number][] } }[] };
    const coords = j.routes?.[0]?.geometry?.coordinates;
    if (!coords?.length) return null;
    return coords.map(([lng, lat]) => [lat, lng] as L.LatLngTuple);
  } catch {
    return null; // aborted / network blocked / bad JSON → straight-line fallback
  }
}

// D: the map must NEVER be blank. Leaflet needs no WebGL, but ?nomap=1 still forces the
// placeholder for testing; if no tile loads (network blocked / offline) we show a clear
// placeholder instead — the booking flow stays fully usable.
function mapAllowed(): boolean {
  try {
    return new URLSearchParams(location.search).get("nomap") !== "1";
  } catch {
    return true;
  }
}

type Screen = "map" | "pinpick" | "confirm" | "searching" | "finished";
// mirror of server RATING_TAGS (bookingPlus) — kept in sync manually (shared has no DTO for it)
const RIDE_TAGS = ["Toza mashina", "Xushmuomala", "Tez yetib keldi", "Sekin haydadi", "Mashina eski"];

// ── E5: ride status timeline (Qabul → Yo'lda → Yetib keldi → Safarda) ──
function rideStep(status: string): number {
  if (status === "started") return 3;
  if (status === "arrived" || status === "in_place") return 2;
  if (status === "called" || status === "on_the_way") return 1;
  return 0; // take/accepted
}
const TL_STEPS = [
  { ico: "✅", label: "Qabul" },
  { ico: "🚗", label: "Yo'lda" },
  { ico: "📍", label: "Yetib keldi" },
  { ico: "🏁", label: "Safarda" },
];
function RideTimeline({ status }: { status: string }) {
  const idx = rideStep(status);
  return (
    <div className="b3-timeline">
      {TL_STEPS.map((s, i) => (
        <div key={i} className={"b3-tl-step" + (i < idx ? " done" : i === idx ? " active" : "")}>
          <div className="b3-tl-dot">{s.ico}</div>
          <span>{s.label}</span>
        </div>
      ))}
    </div>
  );
}
// E5: share trip to a contact (safety) — Telegram share sheet, falls back to a new tab
function shareTrip(d: BookingDriverView): void {
  haptic();
  const text = `Men 1067 taksidaman 🚕\nMashina: ${d.carModel} ${d.carNumber}`;
  const url = `https://t.me/share/url?url=${encodeURIComponent("https://t.me/koson1067bot")}&text=${encodeURIComponent(text)}`;
  const w = tg as { openTelegramLink?: (u: string) => void } | undefined;
  if (w?.openTelegramLink) w.openTelegramLink(url);
  else window.open(url, "_blank");
}

// ── E6: in-trip (status=started) — live garage counter + one in-ride roulette ──
// DISPLAY-ONLY. The garage earning is GRANTED by the bot sweep at ride end (idempotent
// garage:<m>:<b>); this counter only mirrors it for motivation. The roulette calls the
// existing /api/wheel which is in-ride-gated AND idempotent per booking (1 spin/ride) —
// the server is the single source of the grant; the Mini App just shows the prize.
function InTripExtras({ rideStartedAt }: { rideStartedAt: string | null }) {
  const [garage, setGarage] = useState<GarageResponse | null>(null);
  const [now, setNow] = useState<number>(() => 0); // ticks recompute the counter (0 = "use Date.now at render")
  const [spin, setSpin] = useState<WheelSpinResponse | null>(null);
  const [spinning, setSpinning] = useState(false);
  const startMs = useRef<number>(rideStartedAt ? Date.parse(rideStartedAt) : Date.now());

  useEffect(() => {
    api.garage().then(setGarage).catch(() => undefined);
    const t = setInterval(() => setNow((n) => n + 1), 5000); // re-render every 5s → counter ticks
    return () => clearInterval(t);
  }, []);

  const equipped = garage?.cars.find((c) => c.equipped) ?? null;
  const elapsedMin = Math.max(0, (Date.now() - startMs.current) / 60_000);
  const cappedMin = Math.min(elapsedMin, GARAGE_RIDE_CAP_MIN);
  const earned = equipped ? Math.floor(cappedMin * equipped.ratePerMin) : 0;
  void now; // dependency: forces recompute each tick

  const doSpin = async (): Promise<void> => {
    if (spinning || spin) return;
    setSpinning(true);
    haptic();
    const r = await api.spinWheel().catch(() => null);
    if (r) setSpin(r);
    setSpinning(false);
  };

  return (
    <div className="b3-intrip">
      {equipped ? (
        <div className="b3-garage">
          <span className="b3-garage-car">{equipped.emoji}</span>
          <div className="b3-garage-meta">
            <div className="fs12 dim">{equipped.name} siz bilan ishlayapti</div>
            <div className="b3-garage-earn">+{formatNumber(earned)} 🪙{elapsedMin >= GARAGE_RIDE_CAP_MIN ? <span className="fs11 dim"> · maks</span> : null}</div>
          </div>
        </div>
      ) : null}
      {spin && !spin.noRide && spin.prize ? (
        <div className="b3-spin-done">
          {spin.alreadySpun ? "🎡 Bu safar omadingiz: " : "🎉 "}
          <b>{spin.prize.emoji} {spin.alreadySpun ? spin.prize.label : `+${formatNumber(spin.prize.amount)} 🪙`}</b>
        </div>
      ) : (
        <button className="b3-spin-btn" disabled={spinning} onClick={doSpin}>
          {spinning ? "🎡 Aylanyapti…" : "🎡 Omadni sina — safar sovg'asi"}
        </button>
      )}
    </div>
  );
}

export function Booking3View({ me, onClose }: { me: MeResponse; onClose: () => void }) {
  const [info, setInfo] = useState<BookingInfoResponse | null>(null);
  const [errored, setErrored] = useState(false);
  const [flagOff, setFlagOff] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .bookingInfo()
      .then((r) => {
        if (!alive) return;
        if ("error" in r) {
          setErrored(true);
          return;
        }
        // preview override: ?b3=1 (browser) or Telegram startapp=b3 lets the owner see the
        // new flow on a real phone while everyone else stays on classic (global flag OFF).
        const forceB3 =
          new URLSearchParams(location.search).get("b3") === "1" ||
          (tg as { initDataUnsafe?: { start_param?: string } } | undefined)?.initDataUnsafe?.start_param === "b3";
        if (r.booking3 === false && !forceB3) setFlagOff(true); // kill-switch → classic flow
        setInfo(r);
      })
      .catch(() => alive && setErrored(true));
    return () => {
      alive = false;
    };
  }, []);

  // feature flag OFF → classic Leaflet flow (no regression)
  if (flagOff) {
    return (
      <Suspense fallback={<MapSkeleton />}>
        <BookingViewOld onClose={onClose} />
      </Suspense>
    );
  }
  if (errored) {
    return (
      <div className="bk-screen">
        <div className="bk-bar"><button className="btn-ghost bk-back" onClick={onClose}>←</button><div className="bk-title">🚖 Taxi</div></div>
        <div className="d-empty"><div className="d-empty-ico">📡</div><p>Yuklanmadi — internetni tekshirib qayta urinib ko'ring</p><Button variant="ghost" onClick={() => location.reload()}>🔄 Qayta urinish</Button></div>
      </div>
    );
  }
  if (!info) return <MapSkeleton />;
  return <Booking3Inner me={me} info={info} onClose={onClose} />;
}

function MapSkeleton() {
  return (
    <div className="b3-screen">
      <div className="b3-map" style={{ background: "var(--surface)" }}>
        <div className="b3-radar-dim" />
      </div>
      <div className="b3-sheet">
        <Skeleton h={18} w="55%" />
        <div className="mt8"><Skeleton h={44} /></div>
        <div className="mt8 row g8"><Skeleton h={36} w="33%" /><Skeleton h={36} w="33%" /></div>
      </div>
    </div>
  );
}

function Booking3Inner({ me, info, onClose }: { me: MeResponse; info: BookingInfoResponse; onClose: () => void }) {
  const [screen, setScreen] = useState<Screen>(info.active ? "searching" : "map");
  const [pickup, setPickup] = useState<SavedAddressView | null>(info.quickPickup ?? null);
  const [pinAddr, setPinAddr] = useState<SavedAddressView | null>(null); // M7: nearest saved addr (proximity hint)
  const [pinPt, setPinPt] = useState<{ lat: number; lng: number } | null>(null); // M7: the dragged map center
  const [pinBusy, setPinBusy] = useState(false);
  const [walking, setWalking] = useState(false); // center-pin character walks while the map is dragged
  const [justFound, setJustFound] = useState(false); // "✅ Topildi!" celebration on driver-accept
  const wasDriver = useRef(false);
  const wasArrived = useRef(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SavedAddressView[]>([]);
  const [searching, setSearching] = useState(false);
  const [freeDrivers, setFreeDrivers] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [active, setActive] = useState<ActiveBookingView | null>(info.active ?? null); // B: live status
  const activeRef = useRef<ActiveBookingView | null>(info.active ?? null); // E7: detect active→null finish
  const [finishedBid, setFinishedBid] = useState<number | null>(null); // E7: the just-finished ride
  const [stars, setStars] = useState(0);
  const [rateTags, setRateTags] = useState<string[]>([]);
  const [rated, setRated] = useState(false);

  const mapRef = useRef<HTMLDivElement | null>(null);
  const map = useRef<L.Map | null>(null);
  const pinMarkers = useRef<L.Marker[]>([]);
  const fleetRef = useRef<{ lat: number; lng: number; busy: boolean }[]>([]); // raw nearby cars for the search beam
  const pickMarker = useRef<L.Marker | null>(null);
  const searchPulse = useRef<L.Marker | null>(null);
  const beamLine = useRef<L.Polyline | null>(null);
  const targetMarker = useRef<L.Marker | null>(null); // the car currently being OFFERED the order
  const pingMarker = useRef<L.Marker | null>(null); // streaming "request" packets pickup → offered car
  const driverMarker = useRef<L.Marker | null>(null);
  const routeLine = useRef<L.Polyline | null>(null);
  // 🚗 liveliness: decoy "ghost" cars + moving ghost rides so a small real fleet never looks empty
  // (owner: "kamdek tuyulmasin", "hamma mashinadan yurgandek"). PURELY VISUAL — real bookings still
  // dispatch only to real drivers; only the perceived density + the "bo'sh mashina" count are inflated.
  const ghostMarkers = useRef<L.Marker[]>([]);
  const ghostRef = useRef<{ lat: number; lng: number; bearing: number; busy: boolean; vlat: number; vlng: number }[]>([]);
  const GHOST_FREE = 7; // idle decoy cars scattered around the view
  const GHOST_RIDES = 4; // moving decoy cars (rides in progress)
  const [mapOk] = useState(mapAllowed); // false only when ?nomap=1 → show placeholder
  const [mapFailed, setMapFailed] = useState(false); // no tiles loaded (network blocked)

  // ── E1: Leaflet raster map (no WebGL — renders on every Telegram WebView) ──
  useEffect(() => {
    if (!mapRef.current || map.current || !mapOk) return; // ?nomap=1 → skip, show placeholder
    // Telegram's tg.expand() + safe-area settle resize the WebView AFTER the map inits → Leaflet
    // keeps the stale (small) size and the map goes grey/blank "within seconds". Re-run
    // invalidateSize across the expand animation AND on every viewport/resize event.
    const fix = () => map.current?.invalidateSize();
    let fixTimers: ReturnType<typeof setTimeout>[] = [];
    let poll: ReturnType<typeof setInterval> | undefined;
    const tgEv = tg as unknown as { onEvent?: (e: string, cb: () => void) => void; offEvent?: (e: string, cb: () => void) => void };
    try {
      const m = L.map(mapRef.current, { zoomControl: false, attributionControl: false }).setView(
        [info.center.lat, info.center.lng],
        14,
      );
      // NO crossOrigin: in the Telegram WebView a crossorigin <img> tile often never fires the
      // `load` event (so tileload below never clears the fallback) even though Google sends CORS.
      // Tile DISPLAY needs no CORS (only canvas pixel-reads do; the dark CSS filter doesn't), so
      // dropping it lets tiles paint + tileload fire. THIS was the "Xarita ko'rinmadi" blank.
      L.tileLayer(TILE_URL, { subdomains: TILE_SUBDOMAINS, maxZoom: 20 }).addTo(m);
      map.current = m;
      // Robust, RECOVERABLE load detection. The Telegram WebView often never fires the tile `load`
      // event (Leaflet's leaflet-tile-loaded class depends on it too), so we check the image DATA
      // (complete && naturalWidth>0) on a 1s poll. The poll keeps running for 30s so a slow tile can
      // RECOVER the map even after the hint briefly showed; once settled we stop + never re-show it.
      let settled = false;
      let elapsed = 0;
      const markOk = () => {
        if (settled || !mapRef.current) return;
        let painted = false;
        mapRef.current.querySelectorAll<HTMLImageElement>("img.leaflet-tile").forEach((im) => {
          if (im.complete && im.naturalWidth > 0) painted = true;
        });
        if (painted) { settled = true; setMapFailed(false); if (poll) clearInterval(poll); }
      };
      poll = setInterval(() => {
        elapsed += 1000;
        markOk();
        if (settled) return;
        if (elapsed >= 12000) setMapFailed(true);          // hint after weak-4G headroom (NOT permanent)
        if (elapsed >= 30000 && poll) clearInterval(poll); // stop polling; hint stays, booking still works
      }, 1000);
      m.on("tileload", markOk); // extra signal on top of the DOM poll
      fixTimers = [120, 350, 700, 1400].map((d) => setTimeout(fix, d)); // catch the expand animation
      window.addEventListener("resize", fix);
      tgEv?.onEvent?.("viewportChanged", fix); // Telegram WebView height settled → re-fit tiles
    } catch {
      setMapFailed(true);
    }
    return () => {
      if (poll) clearInterval(poll);
      fixTimers.forEach(clearTimeout);
      window.removeEventListener("resize", fix);
      tgEv?.offEvent?.("viewportChanged", fix);
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── E1 live pins (free cars), 15s refresh — pins come from the in-memory WS fleet now (cheap, no
  // kas REST call per request), so we can poll often enough that cars visibly move like the app. ──
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const r = await api.bookingNearby().catch(() => null);
      if (!alive || !r || !map.current) return;
      // owner: show ~2× online cars, never below the ghost floor so the map never reads "empty"
      setFreeDrivers(Math.max(r.freeDrivers * 2, GHOST_FREE + GHOST_RIDES));
      fleetRef.current = r.pins; // raw coords for the search beam
      for (const mk of pinMarkers.current) mk.remove();
      pinMarkers.current = r.pins
        .slice(0, 40)
        .map((d) => L.marker([d.lat, d.lng], { icon: carIcon(d.busy ? "#9ca3af" : "#22c55e", d.bearing || 0, 26) }).addTo(map.current!));
    };
    load();
    const t = setInterval(load, 15_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 🚗 ghost fleet: once the map is up, scatter decoy cars around the view and keep a few "rides"
  // gliding so the city never looks empty (owner). Own marker ref → the 15s real-pin refresh never
  // wipes them; zIndexOffset −50 keeps them BEHIND real pins + the assigned driver. VISUAL ONLY.
  useEffect(() => {
    if (!mapOk) return;
    const rnd = (r: number) => (Math.random() - 0.5) * 2 * r;
    const tick = () => {
      if (!map.current) return; // wait until the map exists
      if (!ghostRef.current.length) {
        const c = map.current.getCenter();
        const seed = (busy: boolean) => ({ lat: c.lat + rnd(0.013), lng: c.lng + rnd(0.018), bearing: Math.floor(Math.random() * 360), busy, vlat: busy ? rnd(0.00016) : 0, vlng: busy ? rnd(0.0002) : 0 });
        ghostRef.current = [...Array.from({ length: GHOST_FREE }, () => seed(false)), ...Array.from({ length: GHOST_RIDES }, () => seed(true))];
        ghostMarkers.current = ghostRef.current.map((g) => L.marker([g.lat, g.lng], { icon: carIcon(g.busy ? "#9ca3af" : "#22c55e", g.bearing, 24), interactive: false, zIndexOffset: -50 }).addTo(map.current!));
        return;
      }
      ghostRef.current.forEach((g, i) => {
        if (!g.busy) return; // free cars idle; only the "rides" glide
        g.lat += g.vlat;
        g.lng += g.vlng;
        if (Math.random() < 0.18) {
          g.vlat += (Math.random() - 0.5) * 0.00009;
          g.vlng += (Math.random() - 0.5) * 0.00009;
          g.bearing = ((Math.atan2(g.vlng, g.vlat) * 180) / Math.PI + 360) % 360;
        }
        ghostMarkers.current[i]?.setLatLng([g.lat, g.lng]);
        ghostMarkers.current[i]?.setIcon(carIcon("#9ca3af", g.bearing, 24));
      });
    };
    const gt = window.setInterval(tick, 2000);
    return () => clearInterval(gt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapOk]);

  // place pickup marker + recenter (remove+recreate replays the pin-drop animation)
  useEffect(() => {
    if (!map.current || !pickup?.lat || !pickup?.lng) return;
    if (pickMarker.current) pickMarker.current.remove();
    pickMarker.current = L.marker([pickup.lat, pickup.lng], { icon: personIcon() }).addTo(map.current);
    map.current.setView([pickup.lat, pickup.lng], 15, { animate: true });
  }, [pickup]);

  // ── Yandex-style search radar: expanding pulse rings on the MAP at the pickup while a driver is
  // being found (kas offers each driver ~15s then cascades to the next). Stops the moment a driver
  // takes it (then the gliding car + route take over). Pure CSS rings, centered on the pickup. ──
  useEffect(() => {
    const searching = screen === "searching" && !active?.driver;
    if (!map.current || !searching || typeof pickup?.lat !== "number" || typeof pickup?.lng !== "number") {
      if (searchPulse.current) { searchPulse.current.remove(); searchPulse.current = null; }
      return;
    }
    if (!searchPulse.current) {
      const icon = L.divIcon({ className: "", html: '<div class="b3-spulse"><span></span><span></span><span></span></div>', iconSize: [0, 0], iconAnchor: [0, 0] });
      searchPulse.current = L.marker([pickup.lat, pickup.lng], { icon, interactive: false, zIndexOffset: -100 }).addTo(map.current);
    } else {
      searchPulse.current.setLatLng([pickup.lat, pickup.lng]);
    }
  }, [screen, active?.driver, pickup?.lat, pickup?.lng]);

  // ── Yandex-style "asking this driver" beam: a gold pulse reaches from the pickup OUT to a nearby
  // car, cycling through the closest few every ~2.6s (mirrors kas offering each driver in turn). The
  // line is recreated each switch so the reach animation replays toward the new car. Stops on accept. ──
  useEffect(() => {
    const searching = screen === "searching" && !active?.driver;
    if (!map.current || !searching || typeof pickup?.lat !== "number" || typeof pickup?.lng !== "number") {
      if (beamLine.current) { beamLine.current.remove(); beamLine.current = null; }
      if (targetMarker.current) { targetMarker.current.remove(); targetMarker.current = null; }
      if (pingMarker.current) { pingMarker.current.remove(); pingMarker.current = null; }
      return;
    }
    const from: [number, number] = [pickup.lat, pickup.lng];
    let i = 0;
    const reach = () => {
      if (!map.current) return;
      const cars = fleetRef.current
        .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng))
        .sort((a, b) => haversineKm({ lat: from[0], lng: from[1] }, a) - haversineKm({ lat: from[0], lng: from[1] }, b))
        .slice(0, 4);
      const t = cars[i % cars.length];
      i++;
      if (!t) return;
      if (beamLine.current) beamLine.current.remove();
      beamLine.current = L.polyline([from, [t.lat, t.lng]], { className: "b3-beam", interactive: false }).addTo(map.current);
      // 📨 a stream of glowing request-packets flies pickup → the offered car (screen-space travel)
      const fromPt = map.current.latLngToContainerPoint(L.latLng(from[0], from[1]));
      const toPt = map.current.latLngToContainerPoint(L.latLng(t.lat, t.lng));
      const ping = L.divIcon({ className: "", html: `<span class="b3-ping" style="--dx:${(toPt.x - fromPt.x).toFixed(0)}px;--dy:${(toPt.y - fromPt.y).toFixed(0)}px"></span>`, iconSize: [0, 0], iconAnchor: [0, 0] });
      if (pingMarker.current) pingMarker.current.remove();
      pingMarker.current = L.marker([from[0], from[1]], { icon: ping, interactive: false, zIndexOffset: 400 }).addTo(map.current);
      // the offered car: glowing + bouncing + a "📨 so'ralmoqda" bubble — unmistakably THIS car
      const ticon = L.divIcon({ className: "", html: `<div class="b3-target"><span class="b3-target-bubble">📨</span><i class="b3-target-ring"></i><i class="b3-target-ring b3-target-ring2"></i>${carSvg("#FFB300", 28)}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] });
      if (targetMarker.current) { boom(map.current, targetMarker.current.getLatLng()); targetMarker.current.remove(); } // prev car "declined" → 💥
      targetMarker.current = L.marker([t.lat, t.lng], { icon: ticon, interactive: false, zIndexOffset: 500 }).addTo(map.current);
    };
    reach();
    const timer = setInterval(reach, 2600);
    return () => { clearInterval(timer); if (beamLine.current) { beamLine.current.remove(); beamLine.current = null; } if (targetMarker.current) { targetMarker.current.remove(); targetMarker.current = null; } if (pingMarker.current) { pingMarker.current.remove(); pingMarker.current = null; } };
  }, [screen, active?.driver, pickup?.lat, pickup?.lng]);

  // ── C: live assigned-driver car marker — glides toward you + rotates by bearing ──
  useEffect(() => {
    const d = active?.driver;
    if (!map.current || typeof d?.lat !== "number" || typeof d?.lng !== "number") {
      if (driverMarker.current) { driverMarker.current.remove(); driverMarker.current = null; }
      return;
    }
    if (!driverMarker.current) {
      // className → CSS transition on .b3-carpin glides the marker position between polls
      const icon = L.divIcon({ className: "b3-carpin", html: `<span class="b3-carpin-i">${carSvg("#FFB300", 36)}</span>`, iconSize: [36, 36], iconAnchor: [18, 18] });
      driverMarker.current = L.marker([d.lat, d.lng], { icon, zIndexOffset: 1000 }).addTo(map.current);
    } else {
      driverMarker.current.setLatLng([d.lat, d.lng]);
    }
    const inner = driverMarker.current.getElement()?.querySelector(".b3-carpin-i") as HTMLElement | null;
    if (inner && typeof d.bearing === "number") inner.style.transform = `rotate(${d.bearing}deg)`;
  }, [active?.driver?.lat, active?.driver?.lng, active?.driver?.bearing]);

  // ── M5: road route driver → pickup, only while the driver is en route (not yet started).
  // Real OSRM road line when the server answers; straight dashed fallback otherwise. Re-runs on
  // each driver-position poll so the line tracks the car; fits bounds once so both ends are seen.
  useEffect(() => {
    const d = active?.driver;
    const enRoute = !!active && active.status !== "started"; // kas is pickup-only → no in-trip route
    if (
      !map.current || !enRoute ||
      typeof d?.lat !== "number" || typeof d?.lng !== "number" ||
      typeof pickup?.lat !== "number" || typeof pickup?.lng !== "number"
    ) {
      if (routeLine.current) { routeLine.current.remove(); routeLine.current = null; }
      return;
    }
    const from = { lat: d.lat, lng: d.lng };
    const to = { lat: pickup.lat, lng: pickup.lng };
    const firstDraw = !routeLine.current;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    let alive = true;

    const draw = (pts: L.LatLngTuple[], road: boolean) => {
      if (!alive || !map.current) return;
      if (routeLine.current) {
        routeLine.current.setLatLngs(pts);
        routeLine.current.setStyle({ dashArray: road ? undefined : "6 8" });
      } else {
        routeLine.current = L.polyline(pts, { color: "#1a73e8", weight: 5, opacity: 0.85, dashArray: road ? undefined : "6 8" }).addTo(map.current);
        // ✨ "route draws in" — animate stroke-dashoffset once on creation (solid road line only), then
        // clear the dash so later position-poll updates track the moving car normally.
        if (road) {
          const el = routeLine.current.getElement() as SVGPathElement | null;
          if (el) {
            requestAnimationFrame(() => {
              const len = el.getTotalLength();
              el.style.transition = "none";
              el.style.strokeDasharray = String(len);
              el.style.strokeDashoffset = String(len);
              el.getBoundingClientRect(); // force reflow so the transition runs
              el.style.transition = "stroke-dashoffset .85s ease-out";
              el.style.strokeDashoffset = "0";
              window.setTimeout(() => { el.style.strokeDasharray = "none"; el.style.transition = "none"; }, 900);
            });
          }
        }
      }
      if (firstDraw) map.current.fitBounds(L.latLngBounds(pts).pad(0.25), { animate: true });
    };

    osrmRoute(from, to, ctrl.signal).then((road) => {
      if (road) draw(road, true);
      else draw([[from.lat, from.lng], [to.lat, to.lng]], false); // straight-line fallback
    });

    return () => { alive = false; clearTimeout(timer); ctrl.abort(); };
  }, [active?.driver?.lat, active?.driver?.lng, active?.status, pickup?.lat, pickup?.lng]);

  // ── M7 center-pin: drag the map → snap to the nearest catalog address (the official app's
  // getAddressByLocation). Read-only lookup, debounced on moveend; confirming reuses the
  // existing addressId booking path (dispatch flow untouched). ──
  useEffect(() => {
    if (screen !== "pinpick" || !map.current) return;
    const m = map.current;
    let alive = true;
    let deb: ReturnType<typeof setTimeout> | undefined;
    const snap = () => {
      const c = m.getCenter();
      setPinPt({ lat: c.lat, lng: c.lng });
      setPinBusy(true);
      api.bookingNearestAddr(c.lat, c.lng)
        .then((a) => { if (alive) { setPinAddr(a); setPinBusy(false); } })
        .catch(() => { if (alive) setPinBusy(false); });
    };
    const onMove = () => { setWalking(false); if (deb) clearTimeout(deb); deb = setTimeout(snap, 450); };
    const onStart = () => setWalking(true); // dragging → the traveler walks
    m.on("movestart", onStart);
    m.on("moveend", onMove);
    if (m.getZoom() < 16) m.setZoom(16); // tighter zoom for precise picking (fires moveend → snap)
    else snap();
    return () => { alive = false; setWalking(false); if (deb) clearTimeout(deb); m.off("movestart", onStart); m.off("moveend", onMove); };
  }, [screen]);

  // ── E4 honest queue while searching ─────────────────────────────────────
  // M6: adaptive cadence (self-scheduling, not a fixed interval). Once a driver is ASSIGNED we
  // poll every 5s (vs 12s) so the car marker glides + the meter ticks near the official app's
  // ~3-5s Netty cadence; while still searching we stay at 12s and also pull nearby free-car count.
  // Assigned rides skip bookingNearby (free-car pins are noise mid-ride) → faster poll, same load.
  useEffect(() => {
    if (screen !== "searching") return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const assigned = !!activeRef.current?.driver; // previous tick's state — decides what to fetch
      const [a, near] = await Promise.all([
        api.bookingActive().catch(() => null),
        assigned ? Promise.resolve(null) : api.bookingNearby().catch(() => null),
      ]);
      if (!alive) return;
      if (near) setFreeDrivers(near.freeDrivers);
      // E7: ride finished — had an active ride last poll, now gone → peak-end finish screen.
      // DISPLAY only: rewards were granted by the bot sweep; the Mini App never grants.
      if (!a && activeRef.current) {
        setFinishedBid(activeRef.current.id);
        setScreen("finished");
        confetti();
        haptic();
      }
      activeRef.current = a;
      setActive(a); // B: real status — searching → accepted (only when a driver actually takes it) → arrived
      if (alive) timer = setTimeout(tick, a?.driver ? 5_000 : 12_000); // faster once a driver is assigned
    };
    tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [screen]);

  const search = async (text: string) => {
    setQ(text);
    if (text.trim().length < 2) return setResults([]);
    setSearching(true);
    const r = await api.bookingSearch(text).catch(() => []);
    setResults(r);
    setSearching(false);
  };

  const choose = (a: SavedAddressView) => {
    haptic();
    setPickup(a);
    setResults([]);
    setQ("");
    setScreen("confirm");
  };

  // 📍 "turgan joyim" — recenter the map on the device GPS; the center-pin then snaps to the
  // nearest catalog place (the existing M7 reverse-lookup), so the rider doesn't have to pan.
  const locateMe = () => {
    if (!navigator.geolocation || !map.current) {
      setMsg("📍 Joylashuv mavjud emas — manzilni qo'lda belgilang");
      return;
    }
    haptic();
    setMsg("📍 Joylashuv aniqlanmoqda…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        map.current?.setView([pos.coords.latitude, pos.coords.longitude], 16, { animate: true });
        setMsg(null);
      },
      () => setMsg("📍 Joylashuvni aniqlab bo'lmadi — ruxsat bering yoki qo'lda belgilang"),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 },
    );
  };

  // A: celebrate the moment a driver ACCEPTS (haptic + "✅ Topildi!" pop). B: haptic on ARRIVAL.
  // Rising-edge via refs → fires once per transition, never on every status poll.
  useEffect(() => {
    const hasDriver = !!active?.driver;
    if (hasDriver && !wasDriver.current) { hapticSuccess(); setJustFound(true); }
    wasDriver.current = hasDriver;
    const arrived = active?.status === "arrived";
    if (arrived && !wasArrived.current) hapticSuccess();
    wasArrived.current = arrived;
  }, [active?.driver, active?.status]);
  useEffect(() => {
    if (!justFound) return;
    const t = window.setTimeout(() => setJustFound(false), 3500);
    return () => clearTimeout(t);
  }, [justFound]);

  const call = async () => {
    if (!pickup || busy) return;
    setBusy(true);
    haptic();
    try {
      const r = await api.bookingCreate({
        pickupId: pickup.id,
        pickupName: pickup.name,
        ...(pickup.id === 0 && typeof pickup.lat === "number" && typeof pickup.lng === "number" ? { lat: pickup.lat, lng: pickup.lng } : {}),
      });
      if (r.ok) {
        confetti();
        setScreen("searching");
        setMsg(r.live ? "🔍 Haydovchi qidirilyapti…" : "🧪 TEST rejimi — haqiqiy taxi chaqirilmadi");
      } else {
        setMsg(`⚠️ ${r.message ?? "Yuborilmadi"}`);
      }
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setBusy(true);
    haptic();
    // P1 (QA fleet): don't silently swallow a failed cancel and drop the user to the map while
    // the ride is still live — surface it and keep them on the active-ride screen to retry.
    const r = await api.bookingCancel().catch(() => null);
    setBusy(false);
    if (!r || r.ok === false) {
      setMsg("⚠️ Bekor qilinmadi — qayta urinib ko'ring");
      return;
    }
    setScreen("map");
    setMsg(null);
  };

  // E7: rate the finished ride (feedback only — NOT a coin grant). Server gates double-rating.
  const rate = async () => {
    if (!finishedBid || !stars) return;
    haptic();
    const r = await api.bookingRate(finishedBid, stars, rateTags).catch(() => null);
    if (r?.ok) setRated(true);
    else setMsg("⚠️ Baho yuborilmadi — qayta urinib ko'ring");
  };
  const rebook = () => {
    setScreen("map");
    setActive(null);
    activeRef.current = null;
    setFinishedBid(null);
    setStars(0);
    setRateTags([]);
    setRated(false);
  };

  // M7: label the dragged pin with the nearest REAL catalog place (~111 places cover the city, so
  // there's almost always one close). On it (≤150m) → the bare name ("Shabada"); a bit off → "… yaqini".
  // The server re-resolves this name authoritatively at booking, so the driver always gets a real place.
  const pinNear =
    pinPt && pinAddr && typeof pinAddr.lat === "number" && typeof pinAddr.lng === "number"
      ? haversineKm(pinPt, { lat: pinAddr.lat, lng: pinAddr.lng }) <= 0.15
        ? pinAddr.name
        : `${pinAddr.name} yaqini`
      : null;
  const confirmPin = () => {
    if (!pinPt || pinBusy) return;
    haptic();
    setPickup({ id: 0, name: pinNear ?? "Xaritada belgilangan nuqta", lat: pinPt.lat, lng: pinPt.lng });
    setScreen("confirm");
  };

  const recents = info.savedAddresses.slice(0, 3);

  return (
    <div className="b3-screen">
      {/* top status bar — tanga · streak · jackpot ticker */}
      <div className="b3-top">
        <button className="b3-x" onClick={onClose}>←</button>
        <div className="b3-stats">
          <span>🪙 {formatNumber(me.coins)}</span>
          {me.streak?.current ? <span>🔥 {me.streak.current}</span> : null}
          <span className="b3-jack">🎰 {formatNumber(me.jackpot)}</span>
        </div>
      </div>

      <div ref={mapRef} className="b3-map" />
      {(!mapOk || mapFailed) && (
        <div className="b3-map-fallback">
          <div className="b3-empty-person" dangerouslySetInnerHTML={{ __html: PERSON_SVG }} />
          <div>Xarita bu qurilmada ko'rinmadi</div>
          <div className="dim fs12">Buyurtma to'liq ishlaydi — pastdan davom eting 👇</div>
        </div>
      )}

      {screen === "pinpick" && (
        <>
          <div className={`b3-centerpin${walking ? " b3-walking" : ""}`} aria-hidden="true">
            <svg viewBox="0 0 44 60" width="44" height="60">
              <ellipse className="b3-hail-shadow" cx="22" cy="56" rx="10" ry="2.6" />
              <g className="b3-hail-fig">
                <path className="b3-hail-leg b3-leg-l" d="M21 40 L18 52" />
                <path className="b3-hail-leg b3-leg-r" d="M23 40 L26 52" />
                <rect className="b3-hail-torso" x="14" y="22" width="16" height="20" rx="7" />
                <g className="b3-case">
                  <rect x="2" y="42" width="9" height="10" rx="2" fill="#52607a" />
                  <rect x="5.4" y="39.6" width="2.6" height="3" rx="1" fill="#52607a" />
                </g>
                <path className="b3-hail-arm0" d="M14 29 L9 42" />
                <circle className="b3-hail-head" cx="22" cy="13" r="7.5" />
                <path className="b3-hail-arm" d="M29 25 L36 11" />
                <circle className="b3-hail-hand" cx="36" cy="11" r="2.6" />
              </g>
            </svg>
          </div>
          <button className="b3-myloc" onClick={locateMe} aria-label="Turgan joyim" title="Turgan joyim">🎯</button>
        </>
      )}

      {msg && <div className="b3-msg" onClick={() => setMsg(null)}>{msg}</div>}

      {/* A: driver-found celebration — a quick "Topildi!" pop (haptic fired in the effect) */}
      {justFound && (
        <div className="b3-found" aria-live="polite">
          <div className="b3-found-card">
            <div className="b3-found-emoji">✅</div>
            <div className="b3-found-title">Topildi!</div>
            {active?.driver && (
              <div className="b3-found-sub">{active.driver.fullName || "Haydovchi"} · {active.driver.carModel} kelyapti 🚖</div>
            )}
          </div>
        </div>
      )}

      {/* ── E1/E2: pickup selection sheet ── */}
      {screen === "map" && (
        <div className="b3-sheet">
          <div className="b3-grip" />
          <div className="b3-sheet-title">🚕 Taxi qayerga kelsin?</div>
          <input className="bk-input" placeholder="🔍 Manzil qidiring (xato yozsangiz ham topadi)" value={q} onChange={(e) => search(e.target.value)} />
          <button className="b3-mappick" onClick={() => { haptic(); setScreen("pinpick"); }}>🗺 Xaritadan belgilash</button>
          {searching && <div className="dim fs13 mt6">⏳ Qidirilmoqda…</div>}
          {results.length > 0 ? (
            <div className="b3-results">
              {results.slice(0, 6).map((a) => (
                <button key={a.id} className="b3-result" onClick={() => choose(a)}>📍 {a.name}</button>
              ))}
            </div>
          ) : (
            <>
              <div className="b3-chips">
                {info.quickPickup && (
                  <button className="d-chip" onClick={() => choose(info.quickPickup!)}>🏠 {info.quickPickup.name}</button>
                )}
                {recents.map((a) => (
                  <button key={a.id} className="d-chip" onClick={() => choose(a)}>📍 {a.name}</button>
                ))}
              </div>
              {info.quickPickup && (
                <Button variant="ghost" className="mt8" onClick={() => choose(info.quickPickup!)}>🚕 1 bosishda: {info.quickPickup.name}</Button>
              )}
            </>
          )}
        </div>
      )}

      {/* ── M7: center-pin map pick (drag → nearest catalog address) ── */}
      {screen === "pinpick" && (
        <div className="b3-pinbar">
          <div className="b3-grip" />
          <div className="b3-pin-label">
            {pinBusy ? "⏳ Manzil aniqlanmoqda…" : pinNear ? <>📍 <b>{pinNear}</b></> : "📍 Xaritada belgilangan nuqta"}
          </div>
          <Button disabled={!pinPt || pinBusy} onClick={confirmPin}>✅ Shu yerdan chaqirish</Button>
          <Button variant="ghost" onClick={() => setScreen("map")}>← Orqaga</Button>
        </div>
      )}

      {/* ── E3: confirm ── */}
      {screen === "confirm" && pickup && (
        <div className="b3-sheet">
          <div className="b3-grip" />
          <div className="b3-picked">📍 <b>{pickup.name}</b><button className="b3-change" onClick={() => setScreen("map")}>o'zgartirish</button></div>
          <div className="b3-fare">
            {info.tariff ? (
              <>
                <div className="b3-fare-row"><span>🚕 Boshlanish</span><b>{formatNumber(info.tariff.minimalPayment)} so'm</b></div>
                <div className="b3-fare-row"><span>📏 Har km</span><b>{formatNumber(info.tariff.perKmCity)} so'm</b></div>
                <div className="dim fs12 mt4">+ {formatNumber(info.tariff.perMinute)} so'm/daq kutish · narx taksometr bo'yicha (masofaga qarab)</div>
              </>
            ) : (
              <div className="dim fs13">Narx taksometr bo'yicha — safar oxirida aniqlanadi</div>
            )}
            <div className="dim fs12 mt4">🚖 {freeDrivers} bo'sh mashina yaqinda · manzilni haydovchiga aytasiz</div>
          </div>
          <div className="dim fs12 b3-honest">💵 To'lov haydovchiga (naqd/karta). 🪙 Tanga = ilova bonuslari, Hamyon'da so'mga yechiladi.</div>
          <Button disabled={busy} onClick={call}>{busy ? "Chaqirilmoqda…" : "🚕 TAXI CHAQIRISH"}</Button>
          <Button variant="ghost" onClick={() => setScreen("map")}>Bekor</Button>
        </div>
      )}

      {/* ── E4: real-status (searching → accepted → arrived) ── */}
      {screen === "searching" && (
        <div className="b3-sheet">
          <div className="b3-grip" />
          {active?.driver ? (
            // accepted — a driver actually took the order (carNumber present)
            <>
              <div className={`b3-search-title${active.status === "arrived" ? " b3-arrived" : ""}`}>
                {active.status === "arrived" ? "🚕 Haydovchi yetib keldi — chiqing!" : "✅ Haydovchi qabul qildi"}
              </div>
              <RideTimeline status={active.status} />
              <div className="b3-driver">
                <div className="b3-driver-av">🧑‍✈️</div>
                <div className="b3-driver-meta">
                  <div className="b3-driver-name">
                    {active.driver.fullName || "Haydovchi"}
                    {active.driver.rating ? <span className="b3-driver-rate"> ⭐{active.driver.rating.toFixed(1)}</span> : null}
                  </div>
                  <div className="dim fs13">🚘 {active.driver.carModel} · <b>{active.driver.carNumber}</b></div>
                </div>
                {active.etaMin ? <div className="b3-eta"><b>{active.etaMin}</b><span>daq</span></div> : null}
              </div>
              {active.driver.meterPayment ? (
                <div className="b3-fare-row mt8"><span>🧮 Hisoblagich (jonli)</span><b><CountUp value={active.driver.meterPayment} /> so'm</b></div>
              ) : null}
              {active.status === "started" ? <InTripExtras rideStartedAt={active.rideStartedAt ?? null} /> : null}
              <div className="b3-acts">
                {active.driver.phone ? <a className="b3-act b3-act-call" href={`tel:${active.driver.phone}`}>📞 Qo'ng'iroq</a> : null}
                <button className="b3-act" onClick={() => active.driver && shareTrip(active.driver)}>🛡 Ulashish</button>
              </div>
            </>
          ) : (
            // searching — no driver yet; show the honest notified count, never "accepted"
            <>
              <div className="b3-radar"><span /><span /><span />🚕</div>
              <div className="b3-search-title">🔍 Haydovchi qidirilyapti…</div>
              <div className="dim tac fs13">
                {active?.notifiedCount
                  ? `📨 ${active.notifiedCount} haydovchiga yuborildi · javob kutilmoqda`
                  : freeDrivers > 0
                    ? `🚖 ${freeDrivers} bo'sh mashina yaqinda`
                    : "haydovchi javobini kutmoqda…"}
              </div>
            </>
          )}
          <Button variant="danger" disabled={busy} onClick={cancel}>✖ Bekor qilish</Button>
        </div>
      )}

      {/* ── E7: peak-end finish card (DISPLAY-ONLY; rewards were granted by the bot sweep) ── */}
      {screen === "finished" && (
        <div className="b3-sheet b3-finish">
          <div className="b3-grip" />
          <div className="b3-finish-emoji">🏁</div>
          <div className="b3-sheet-title tac">Safaringiz yakunlandi — rahmat!</div>
          {me.streak?.current ? <div className="b3-finish-streak">🔥 {me.streak.current} kun streak — davom eting!</div> : null}
          <div className="dim tac fs13 mt6">🎁 Tanga mukofotingiz Hamyon va botda hisoblandi.</div>
          {rated ? (
            <div className="b3-finish-thanks">🙏 Bahoyingiz uchun rahmat!</div>
          ) : (
            <>
              <div className="b3-stars">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} className={"b3-star" + (n <= stars ? " on" : "")} onClick={() => { haptic(); setStars(n); }}>★</button>
                ))}
              </div>
              {stars > 0 && (
                <>
                  <div className="b3-tags">
                    {RIDE_TAGS.map((t) => (
                      <button key={t} className={"d-chip" + (rateTags.includes(t) ? " on" : "")} onClick={() => setRateTags((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]))}>
                        {t}
                      </button>
                    ))}
                  </div>
                  <Button onClick={rate}>⭐ Baholash</Button>
                </>
              )}
            </>
          )}
          <Button variant="ghost" onClick={rebook}>🔁 Yana 1067</Button>
        </div>
      )}
    </div>
  );
}
