// 🗺 BOOKING 3.0 (E1-E4) — Leaflet (raster <img> tiles, NO WebGL) dark, map-first.
// WHY Leaflet, not MapLibre: MapLibre needs WebGL, which many Telegram WebViews (and budget
// Android) do NOT support → the map rendered nothing for real customers. Leaflet draws plain
// <img> tiles (like the old flow that always worked), so the map shows on every device.
// Leaflet is BUNDLED (npm), not loaded from unpkg — no foreign-CDN dependency (the Carto lesson).
// feature:booking3 gated; when off, falls back to the classic Leaflet BookingView (zero regression).
// kas is PICKUP-ONLY (taximeter, no destination routing) — so we honestly select the PICKUP and
// show a history-based fare "≈" (not a promise). Gold is ONLY on the CALL button.
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { foldName, formatNumber, fuzzyFilter, haversineKm, placeKind, type ActiveBookingView, type BookingDriverView, type BookingInfoResponse, type MeResponse, type SavedAddressView, type WheelSpinResponse } from "@t1067/shared";
import { api } from "./api";
import { loadErrorText } from "./util";
import { haptic, hapticSuccess, tg, tgGetLocation, tgHasLocationManager, tgOpenLocationSettings } from "./telegram";
// 🪙 passive compensation ticker (Jonli qidiruv) — the ONE ramp formula (mirrors the server's
// cashbackService.waitCompAmount) so the number shown never overstates what will actually be paid.
// No interaction: the wait ITSELF earns (the tap-game was removed — owner: "bachkana"); the amount
// banks at ride-finish, or becomes the next-ride voucher when the search fails.
function WaitTicker({ waitComp, startAt, mini }: { waitComp: BookingInfoResponse["waitComp"]; startAt: number | null; mini?: boolean }): JSX.Element | null {
  const [, tick] = useState(0);
  useEffect(() => {
    const iv = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(iv);
  }, []);
  if (!waitComp || !startAt) return null;
  const { graceSec, fullSec, ceiling } = waitComp;
  const el = Math.floor((Date.now() - startAt) / 1000);
  const eff = Math.max(0, Math.min(el, fullSec) - graceSec);
  const som = Math.floor(ceiling * (eff / Math.max(1, fullSec - graceSec)));
  if (mini) return <b className="b3-wchip-mini">🪙 +{formatNumber(som)}</b>;
  return (
    <div className="b3-wchip">
      🪙 <b>+{formatNumber(som)} tanga</b> kutish bonusi
      <span className="b3-wchip-sub">safar tugagach hisobingizga qo'shiladi</span>
    </div>
  );
}
import { confetti } from "./util";
import { Button, Sheet, Skeleton } from "./design/components";
import { useIsActive } from "./useIsActive";
import { TaxiStory, storySeen } from "./taxiStory";
import "./design/feat/b3.css"; // bu tab ochilgandagina yuklanadi (kritik yo'lda emas)

const BookingViewOld = lazy(() => import("./booking").then((m) => ({ default: m.BookingView })));

// Google raster tiles ({s}=subdomain) — proven reachable on UZ networks (kas1067 runs on Google);
// Carto's vector CDN was UZ-blocked. Plain raster <img> tiles, NO WebGL. hl=uz → Uzbek labels.
const TILE_URL = "https://mt{s}.google.com/vt/lyrs=m&hl=uz&x={x}&y={y}&z={z}";
const TILE_SUBDOMAINS = ["0", "1", "2", "3"];

// Koson markazi — serverdagi zaxira qiymat bilan AYNI (bookingService.getBookingInfo:
// `company.lat || 39.04, company.lng || 65.57`). Yuklanish paytida xaritani DARHOL shu yerda
// chizamiz: aks holda `/api/booking/info` javobini (p90 ~4.4s — kas navbati 600ms x 6 so'rov)
// kutib, ekran kulrang quti bo'lib turardi.
const KOSON_CENTER: [number, number] = [39.04, 65.57];

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
function carSvg(color: string, size: number, passenger = false): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" style="display:block">
    <rect x="9.5" y="3" width="13" height="26" rx="6" fill="${color}"/>
    <path d="M11 7 Q16 4.3 21 7 L20 12 H12 Z" fill="#0b1f3a" opacity=".78"/>
    <rect x="12" y="19.3" width="8" height="5.6" rx="2.3" fill="#0b1f3a" opacity=".62"/>
    ${passenger
      ? `<rect x="13.3" y="22.2" width="5.4" height="3.6" rx="1.8" fill="#3b4a63"/><circle cx="16" cy="20.5" r="2.3" fill="#f0c9a0"/>`
      : `<circle cx="16" cy="15.4" r="1.15" fill="#fff" opacity=".5"/>`}
  </svg>`;
}
function carIcon(color: string, bearing: number, size = 30, passenger = false): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div class="b3-carmark" style="transform:rotate(${bearing}deg)">${carSvg(color, size, passenger)}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// 🚶 decoy "ghost" CLIENT — a small person waiting around the city so the map reads as busy/alive
// (the people-counterpart to the ghost cars). VISUAL ONLY, non-interactive, dimmed, gently bobbing.
const GHOST_SHIRTS = ["#ef9f27", "#5dcaa5", "#85b7eb", "#ed93b1", "#f0997b", "#b388ff", "#c0dd97"];
const GHOST_SKINS = ["#e8b58a", "#d9a066", "#f0c9a0"];
function ghostPersonSvg(shirt: string, skin: string, size: number, hail = false): string {
  // hail → right arm raised with a skin-coloured hand (someone flagging a taxi); else both arms at the sides
  return `<svg viewBox="0 0 24 34" width="${size}" height="${size * 1.4}" aria-hidden="true">
    <ellipse cx="12" cy="32" rx="6" ry="1.6" fill="rgba(0,0,0,.34)"/>
    <rect x="8.4" y="23" width="2.6" height="9" rx="1.3" fill="#28303f"/>
    <rect x="13" y="23" width="2.6" height="9" rx="1.3" fill="#28303f"/>
    <rect x="5" y="12.4" width="2.5" height="8.4" rx="1.25" fill="${shirt}"/>
    ${hail ? "" : `<rect x="16.5" y="12.4" width="2.5" height="8.4" rx="1.25" fill="${shirt}"/>`}
    <rect x="6.8" y="11.5" width="10.4" height="14" rx="4.6" fill="${shirt}"/>
    <circle cx="12" cy="6.6" r="4.4" fill="${skin}"/>
    ${hail ? `<g transform="rotate(30 16.6 13)"><rect x="15.35" y="2.4" width="2.5" height="11.2" rx="1.25" fill="${shirt}"/><circle cx="16.6" cy="2.4" r="1.85" fill="${skin}"/></g>` : ""}
  </svg>`;
}
function ghostPersonIcon(shirt: string, skin: string, size = 22, hail = false): L.DivIcon {
  return L.divIcon({ className: "", html: `<div class="b3-ghostperson">${ghostPersonSvg(shirt, skin, size, hail)}</div>`, iconSize: [size, size * 1.4], iconAnchor: [size / 2, size * 1.4 - 2] });
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

type SpeechRec = {
  lang: string;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  abort: () => void;
};

/** Browser speech-to-text, present on Android Telegram (Chromium WebView) and absent on iOS
 *  (WKWebView ships no SpeechRecognition). We probe for the constructor and only draw the mic when
 *  it exists — a mic button that silently does nothing is worse than no mic (DIZAYN_QOIDALARI #14). */
function speechCtor(): (new () => SpeechRec) | null {
  try {
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
  } catch {
    return null;
  }
}

type Screen = "map" | "pinpick" | "confirm" | "searching" | "finished" | "failed" | "schedule" | "family";

// Joy TURI → glif (24×24 viewBox). Rangni CSS beradi (`k-<kind>`/`t-<kind>`), shakl shu yerda.
const KIND_GLYPH: Record<ReturnType<typeof placeKind>, string> = {
  school: "M12 2L1 8l11 6 9-4.9V17h2V8L12 2zM5 12.4V17c0 1.7 3.1 3 7 3s7-1.3 7-3v-4.6l-7 3.8-7-3.8z",
  bazaar: "M6 6h15l-1.6 8.4a2 2 0 0 1-2 1.6H9.3a2 2 0 0 1-2-1.6L5.4 4H2V2h5l.8 4zM9.5 18.2a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6zm8 0a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6z",
  park: "M12.5 2l5 7h-3l4 6h-3.6l2.6 4H13v3h-2v-3H5.9l2.6-4H5.5l4-6h-3l5-7z",
  mahalla: "M12 3L2 11h3v9h5.5v-5.5h3V20H19v-9h3L12 3z",
  gov: "M12 2L2 8v2h20V8L12 2zM4 12v7H2v2h20v-2h-2v-7h-3v7h-3v-7h-2v7H7v-7H4z",
  mosque: "M12 2c1.6 1.7 2.6 3.2 2.6 4.6 0 1.2-.7 2.1-1.6 2.8h4a3 3 0 0 1 3 3V21H4v-8.6a3 3 0 0 1 3-3h4c-.9-.7-1.6-1.6-1.6-2.8C9.4 5.2 10.4 3.7 12 2z",
  transit: "M6 2h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2v2h-2v-2H8v2H6v-2a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm0 4v5h12V6H6zm2 8.5a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6zm8 0a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6z",
  health: "M10 2h4v6h6v4h-6v6h-4v-6H4V8h6V2z",
  food: "M8.1 2v7.2a2.4 2.4 0 0 1-1.5 2.2V22H4.4V11.4A2.4 2.4 0 0 1 2.9 9.2V2h1.6v6.4h1.2V2h1.6v6.4h1.2V2h1.6zM17 2c2.2 0 3.4 2.2 3.4 5.6 0 2.6-.8 4.4-2.2 5.1V22h-2.3V2H17z",
  other: "M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z",
};
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
// 🚕 approach bar with the car RIDING the fill edge — the wrapper spans the full bar, so
// translateX(pct%) moves the car by pct% of the BAR width (transform-only, design rule).
function RideProgress({ pct, full, className }: { pct: number; full: boolean; className?: string }) {
  return (
    <div className={`b3-ride-progress hascar${full ? " full" : ""}${className ? ` ${className}` : ""}`}>
      <i style={{ width: `${pct}%` }} />
      <span className="b3-ride-carwrap" style={{ transform: `translateX(${pct}%)` }} aria-hidden>
        <span className={`b3-ride-carbob${full ? "" : " driving"}`}>
          <span className="b3-ride-caremoji">{full ? "🏁" : "🚕"}</span>
        </span>
      </span>
    </div>
  );
}
// E5: share trip to a contact (safety) — Telegram share sheet, falls back to a new tab
async function shareTrip(d: BookingDriverView): Promise<void> {
  haptic();
  // 🛡 family safety: mint a public read-only link — recipient opens it in ANY browser (no login) and
  // watches the car + live fare until the trip ends. Falls back to the bot link if the mint fails.
  let link = "https://t.me/koson1067bot";
  try {
    const { token } = await api.createTrack();
    link = `${location.origin}/?track=${token}`;
  } catch {
    /* keep the fallback */
  }
  const text = `🚕 Men 1067 taxidaman — jonli kuzatib boring!\n🚘 ${d.carModel} · ${d.carNumber}\n🛡 Mashina xaritada qayerda + narx — hammasi real vaqtda 👇`;
  const url = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
  const w = tg as { openTelegramLink?: (u: string) => void } | undefined;
  if (w?.openTelegramLink) w.openTelegramLink(url);
  else window.open(url, "_blank");
}

// ── E6: in-trip (status=started) — one in-ride roulette ──
// DISPLAY-ONLY money-wise. The roulette calls the existing /api/wheel which is
// in-ride-gated AND idempotent per booking (1 spin/ride) — the server is the
// single source of the grant; the Mini App just shows the prize.
function InTripExtras({ rideStartedAt }: { rideStartedAt: string | null }) {
  const [spin, setSpin] = useState<WheelSpinResponse | null>(null);
  const [spinning, setSpinning] = useState(false);
  void rideStartedAt;

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
        <div className="d-empty"><div className="d-empty-ico">📡</div><p>{loadErrorText()}</p><Button variant="ghost" onClick={() => location.reload()}>🔄 Qayta urinish</Button></div>
      </div>
    );
  }
  if (!info) return <MapSkeleton />;
  return <Booking3Inner me={me} info={info} onClose={onClose} />;
}

function MapSkeleton() {
  // ⚡ Yuklanish paytida ham HAQIQIY xarita (ega, 2026-08-01: «xaritaga kirayotganda 4-5 soniya
  // yuklanmay turadi»). Ilgari bu yerda kulrang quti turardi va xarita FAQAT info kelgach
  // ulanardi — ya'ni sekinlik xaritadan emas, unga boshlashga ruxsat berilmaganidan edi.
  // Bu xarita INTERAKTIV EMAS (faqat ko'rinish) va info kelishi bilan Booking3Inner o'zinikini
  // ulaydi — plitkalar brauzer keshida bo'lgani uchun u bir zumda chiziladi.
  const skelMap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!skelMap.current) return;
    let m: L.Map | undefined;
    try {
      m = L.map(skelMap.current, {
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        touchZoom: false,
        keyboard: false,
      }).setView(KOSON_CENTER, 14);
      L.tileLayer(TILE_URL, { subdomains: TILE_SUBDOMAINS, maxZoom: 20 }).addTo(m);
    } catch {
      /* xarita chizilmasa — eski skeleton ko'rinishi qoladi, hech narsa buzilmaydi */
    }
    return () => { try { m?.remove(); } catch { /* ignore */ } };
  }, []);
  return (
    <div className="b3-screen">
      <div className="b3-map" ref={skelMap} style={{ background: "var(--surface)" }}>
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
  const appActive = useIsActive(); // ⏸ fonda so'rov halqasi to'xtaydi
  // Map-is-picker redesign: the entry IS the live map picker (pinpick), not a separate search sheet.
  // The search sheet ("map") is now a sub-screen reached via the top search pill.
  const [screen, setScreen] = useState<Screen>(info.active ? "searching" : "pinpick");
  const [pickup, setPickup] = useState<SavedAddressView | null>(info.quickPickup ?? null);
  const [pinAddr, setPinAddr] = useState<SavedAddressView | null>(null); // M7: nearest saved addr (proximity hint)
  const [pinPt, setPinPt] = useState<{ lat: number; lng: number } | null>(null); // M7: the dragged map center
  const [pinBusy, setPinBusy] = useState(false);
  // Two pin lookups can be in flight at once (autoloc recenters the map while the entry lookup is
  // still out). Without a sequence guard the SLOWER, older response wins and the sheet prints a
  // place the rider is not standing at — a name the driver is then told. Newest answer only.
  const snapSeq = useRef(0);
  const [mapReady, setMapReady] = useState(false); // map-is-picker: the pinpick drag effect waits for the Leaflet map to exist (pinpick is now the ENTRY, so it can mount before the map)
  const [walking, setWalking] = useState(false); // center-pin character walks while the map is dragged
  // 📖 O'rgatuvchi story (flag `taxistory`) — taksi ekrani BIRINCHI ochilganda avtomatik, bir marta.
  // Faol safar ustidan CHIQMAYDI: safar ketayotganda odamga darsning keragi yo'q, unga mashina kerak.
  const [story, setStory] = useState(false);
  const storyArmed = useRef(false);
  useEffect(() => {
    if (storyArmed.current || !me.flags?.taxistory || info.active || storySeen()) return;
    storyArmed.current = true;
    setStory(true);
  }, [me.flags?.taxistory, info.active]);

  // 🗺 one-time coach-mark: people didn't realise the center pin marks pickup + you drag→confirm.
  const [coach, setCoach] = useState(false);
  const dismissCoach = () => { setCoach(false); try { localStorage.setItem("b3coach1", "1"); } catch { /* private mode */ } };
  useEffect(() => {
    if (screen !== "pinpick") return;
    // Story ochiq — ikkita o'rgatuvchi qatlam ustma-ust turmaydi (qoida #1 ruhi). Effektlar
    // tartibi bo'yicha coach story'dan OLDIN yoqilgan bo'lishi mumkin, shuning uchun shunchaki
    // `return` yetarli emas — allaqachon yoqilganini SO'NDIRAMIZ.
    if (story) { setCoach(false); return; }
    try { if (localStorage.getItem("b3coach1")) return; } catch { return; }
    setCoach(true);
    const t = setTimeout(dismissCoach, 6000); // auto-dismiss so it never lingers
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, story]);
  useEffect(() => { if (walking && coach) dismissCoach(); // first drag = they got it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walking]);
  const [justFound, setJustFound] = useState(false); // "✅ Topildi!" celebration on driver-accept
  const wasDriver = useRef(false);
  const wasArrived = useRef(false);
  const boarded = useRef(false); // pickup person "gets in" the car when the trip starts (not frozen)
  const [speedKmh, setSpeedKmh] = useState(0); // rough live speed (kas gives none) — from position deltas
  const prevPos = useRef<{ lat: number; lng: number; t: number } | null>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SavedAddressView[]>([]);
  const [searching, setSearching] = useState(false);
  // ── pickup2: the rebuilt pickup sheet. OFF → every branch below falls back to today's UI. ──
  const pickup2 = !!me.flags?.pickup2;
  const layoutB = !!me.flags?.pickup2b; // B = list-first; A (default) = answer-first
  // ☀️ Yorug' varaq (ega maketidagi oq dunyo). Ega ikkala ko'rinishni real telefonda solishtiradi;
  // tanlangani qoladi, ikkinchisining klassi o'sha commit'da o'chiriladi (ikki yo'l qoldirilmaydi).
  const lite = me.flags?.pickup2lt ? " b3-p2-lt" : "";
  const [allPlaces, setAllPlaces] = useState<SavedAddressView[] | null>(null);
  const [showAll, setShowAll] = useState(false); // "Barchasi" — the alphabetical full catalog
  const [p2min, setP2min] = useState(false); // "Xaritadan ko'rsatish" → shrink the sheet, free the map
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRec | null>(null);
  const micOk = useRef(speechCtor() !== null).current;
  const [freeDrivers, setFreeDrivers] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [locating, setLocating] = useState(false); // GPS in-flight → spin the locate icon
  const [active, setActive] = useState<ActiveBookingView | null>(info.active ?? null); // B: live status
  const [plateZoom, setPlateZoom] = useState(false); // mashina raqamini bosib haydovchi kartochkasini KATTA ko'rish
  const [plateClosing, setPlateClosing] = useState(false); // exit animatsiyasi davom etayotganini ushlab turadi
  const autoShownForBooking = useRef<number | null>(null); // har bookingga bitta marta avtomatik ochish
  const closePlate = (): void => {
    haptic();
    setPlateClosing(true);
    setTimeout(() => { setPlateZoom(false); setPlateClosing(false); }, 260); // animatsiya yakuni
  };
  // 🎉 Haydovchi QABUL qildi (driver maydoni paydo bo'ldi) — popup AVTOMATIK ochiladi, success haptik,
  // 5 soniyadan keyin silliq pastga yopiladi. "Bosish kerakligini hamma bilmaydi" — to'g'ridan-to'g'ri
  // ko'rsatamiz. Har buyurtma uchun bitta marta (booking id ref bilan), takrorlanmaydi.
  useEffect(() => {
    const bid = active?.id;
    const car = active?.driver?.carNumber;
    if (!bid || !car) return;
    if (autoShownForBooking.current === bid) return;
    autoShownForBooking.current = bid;
    hapticSuccess();
    setPlateZoom(true);
    const t = setTimeout(() => {
      setPlateClosing(true);
      setTimeout(() => { setPlateZoom(false); setPlateClosing(false); }, 260);
    }, 5000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, active?.driver?.carNumber]);
  const activeRef = useRef<ActiveBookingView | null>(info.active ?? null); // E7: detect active→null finish
  const [finishedBid, setFinishedBid] = useState<number | null>(null); // E7: the just-finished ride
  // 🪙 Jonli qidiruv: when THIS search began (client-side, display only — the server times the real
  // payout via waitstart markers) + the frozen estimate shown on the "topilmadi" apology screen.
  const waitStartRef = useRef<number | null>(null);
  const [failedComp, setFailedComp] = useState(0);
  // searching sheet collapse: the full sheet hid the map ("xaritani yopib qo'yapti") — tap the grip
  // to shrink to a one-line mini bar so the rider watches the live map while waiting.
  const [searchMin, setSearchMin] = useState(false);
  const [rideMin, setRideMin] = useState(false); // collapse the ACCEPTED driver card → mini bar (map + big fare)
  // 🚖 "car approaching" fill: capture the LARGEST ETA seen since the driver was assigned, so the
  // bottom-bar progress can fill from ~0 → 100% as ETA shrinks toward arrival. Reset between rides.
  const etaMaxRef = useRef(0);
  useEffect(() => {
    // app re-opened mid-search (reload/deep-link): start the ticker NOW — undercounts vs the
    // server's waitstart marker, which is the safe direction (display never overstates the payout)
    if (active && !active.driver && !waitStartRef.current) waitStartRef.current = Date.now();
    if (!active?.driver) etaMaxRef.current = 0;
    else if (active.etaMin && active.status !== "arrived" && active.status !== "started") {
      etaMaxRef.current = Math.max(etaMaxRef.current, active.etaMin);
    }
  }, [active]);
  // 0 (just accepted) → 100 (arrived/in-trip). While en route, fill grows as ETA shrinks; clamped
  // 10..96 so the bar always shows motion but never falsely reads "arrived".
  const approachPct = !active?.driver
    ? 0
    : active.status === "arrived" || active.status === "started"
      ? 100
      : active.etaMin && etaMaxRef.current > 0
        ? Math.min(96, Math.max(10, Math.round((1 - active.etaMin / etaMaxRef.current) * 100)))
        : 10;
  const [stars, setStars] = useState(0);
  const [rateTags, setRateTags] = useState<string[]>([]);
  const [rated, setRated] = useState(false);

  // ── Schedule + Family state ──
  type FamilyMember = { id: number; phone: string; name: string };
  type ScheduledRide = { id: number; addressName: string; runAt: string; phone: string };
  const [famList, setFamList] = useState<FamilyMember[]>([]);
  const [schedList, setSchedList] = useState<ScheduledRide[]>([]);
  const [famLoaded, setFamLoaded] = useState(false);
  const [famPhone, setFamPhone] = useState("");
  const [famName, setFamName] = useState("");
  const [famAdding, setFamAdding] = useState(false);
  const [schedDay, setSchedDay] = useState<"today" | "tomorrow">("today");
  const [schedHour, setSchedHour] = useState(8);
  const [schedMin, setSchedMin] = useState(0);
  const [schedBusy, setSchedBusy] = useState(false);

  const loadFamily = async (): Promise<void> => {
    if (famLoaded) return;
    const d = await api.bookingScheduled().catch(() => null);
    if (d) { setFamList(d.family); setSchedList(d.scheduled); }
    setFamLoaded(true);
  };

  const addFamily = async (): Promise<void> => {
    if (!famPhone || famAdding) return;
    setFamAdding(true);
    const r = await api.familyAdd(famPhone, famName || "Yaqinim").catch(() => null);
    if (r?.ok) { setFamPhone(""); setFamName(""); void loadFamily().then(() => setFamLoaded(false)).then(loadFamily); }
    else setMsg(r?.reason === "already" ? "Bu raqam allaqachon qo'shilgan" : r?.reason === "max" ? "Maksimal 3 ta" : "Xatolik");
    setFamAdding(false);
  };

  const bookFamily = async (fam: FamilyMember): Promise<void> => {
    if (!pickup || busy) return;
    setBusy(true);
    const r = await api.familyBook(fam.id, pickup.id, pickup.name).catch(() => null);
    setBusy(false);
    setMsg(r?.message ?? (r?.ok ? `🚕 ${fam.name}ga taxi chaqirildi!` : "Xatolik yuz berdi"));
    if (r?.ok) setScreen("pinpick");
  };

  const saveSchedule = async (): Promise<void> => {
    if (!pickup || schedBusy) return;
    setSchedBusy(true);
    const base = new Date();
    if (schedDay === "tomorrow") base.setDate(base.getDate() + 1);
    base.setHours(schedHour, schedMin, 0, 0);
    const r = await api.bookingSchedule(pickup.id, pickup.name, base.toISOString()).catch(() => null);
    setSchedBusy(false);
    if (r?.ok) {
      setMsg(`⏰ Rejali safar saqlandi: ${schedDay === "today" ? "Bugun" : "Ertaga"} ${String(schedHour).padStart(2, "0")}:${String(schedMin).padStart(2, "0")}`);
      setScreen("pinpick");
    } else {
      setMsg(r?.reason === "too_soon" ? "Kamida 15 daqiqa oldin bo'lishi kerak" : r?.reason === "too_many" ? "Maksimal 3 ta rejali safar" : "Xatolik");
    }
  };

  const mapRef = useRef<HTMLDivElement | null>(null);
  const map = useRef<L.Map | null>(null);
  const pinMarkers = useRef<Map<string, { mk: L.Marker; busy: boolean }>>(new Map()); // keyed by opaque car id → glide
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
  const ghostPeople = useRef<L.Marker[]>([]); // 🚶 decoy clients waiting around the city (varied clothes/places, new each session)
  const GHOST_FREE = 7; // idle decoy cars scattered around the view
  const GHOST_RIDES = 4; // moving decoy cars (rides in progress)
  const GHOST_CLIENTS = 8; // idle decoy PEOPLE scattered around (people-counterpart to the cars; ~⅓ hailing)
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
      setMapReady(true); // signal the pinpick drag effect that the map now exists
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
      tgEv?.onEvent?.("fullscreenChanged", fix); // to'liq ekranga kirish/chiqish = boshqa o'lcham
    } catch {
      setMapFailed(true);
    }
    return () => {
      if (poll) clearInterval(poll);
      fixTimers.forEach(clearTimeout);
      window.removeEventListener("resize", fix);
      tgEv?.offEvent?.("viewportChanged", fix);
      tgEv?.offEvent?.("fullscreenChanged", fix);
      map.current?.remove();
      map.current = null;
      setMapReady(false);
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
      // server already inflates the count ~2× (inflateOnline) — keep the ghost floor so it never reads "empty"
      setFreeDrivers(Math.max(r.freeDrivers, GHOST_FREE + GHOST_RIDES));
      fleetRef.current = r.pins; // raw coords for the search beam
      // PERF + SMOOTHNESS: reconcile markers keyed by the car's OPAQUE id (from the WS fleet) instead
      // of tearing down + re-creating up to 40 Leaflet divIcons every tick. The old churn (40 removes
      // + 40 creates / 15s) janked low-end Telegram WebViews ("slow map"). Now a car keeps the SAME
      // marker across ticks, so setLatLng GLIDES it (the .b3-glide CSS transition) between polls like
      // the official app — instead of jumping. Bearing is updated on the inner element in place so it
      // survives without a full setIcon; colour (busy) only setIcons on an actual free↔busy flip.
      const pins = r.pins.slice(0, 40);
      const markers = pinMarkers.current;
      const seen = new Set<string>();
      for (const d of pins) {
        seen.add(d.id);
        const color = d.busy ? "#9ca3af" : "#22c55e";
        const entry = markers.get(d.id);
        if (entry) {
          entry.mk.setLatLng([d.lat, d.lng]); // glides
          const inner = entry.mk.getElement()?.querySelector(".b3-carmark") as HTMLElement | null;
          if (inner) inner.style.transform = `rotate(${d.bearing || 0}deg)`;
          if (entry.busy !== d.busy) {
            entry.mk.setIcon(carIcon(color, d.bearing || 0, 26)); // free↔busy → recolour (replaces element)
            const mk = entry.mk;
            requestAnimationFrame(() => mk.getElement()?.classList.add("b3-glide")); // re-arm glide on the new element
            entry.busy = d.busy;
          }
        } else {
          const mk = L.marker([d.lat, d.lng], { icon: carIcon(color, d.bearing || 0, 26) }).addTo(map.current!);
          // add the glide transition AFTER the first paint so the initial placement doesn't animate
          // from the map origin (a fresh marker with the transition already on would "fly in").
          requestAnimationFrame(() => mk.getElement()?.classList.add("b3-glide"));
          markers.set(d.id, { mk, busy: d.busy });
        }
      }
      for (const [id, entry] of markers) {
        if (!seen.has(id)) { entry.mk.remove(); markers.delete(id); } // car left the fleet → drop its marker
      }
    };
    if (!appActive) { return () => { alive = false; }; } // ⏸ fonda mashina-pinlari so'ralmaydi
    load();
    const t = setInterval(load, 15_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appActive]);

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
        // busy ghost cars = rides in progress → draw a visible passenger in the back seat ("mashinada yurgani")
        ghostMarkers.current = ghostRef.current.map((g) => L.marker([g.lat, g.lng], { icon: carIcon(g.busy ? "#9ca3af" : "#22c55e", g.bearing, 24, g.busy), interactive: false, zIndexOffset: -50 }).addTo(map.current!));
        // 🚶 ghost CLIENTS — a handful of people waiting, scattered, each a random shirt/skin/size (varied
        // clothes "har xil kiyimchalarda") + a stagger so they don't bob in unison. Static (people stand);
        // the CSS bob gives life. Seeded ONCE per session → new layout every time.
        ghostPeople.current = Array.from({ length: GHOST_CLIENTS }, (_, i) => {
          const shirt = GHOST_SHIRTS[Math.floor(Math.random() * GHOST_SHIRTS.length)]!;
          const skin = GHOST_SKINS[Math.floor(Math.random() * GHOST_SKINS.length)]!;
          const size = 19 + Math.floor(Math.random() * 7);
          const hail = i < 3 || Math.random() < 0.18; // guarantee ≥3 hailing, sprinkle a few more
          const mk = L.marker([c.lat + rnd(0.012), c.lng + rnd(0.016)], { icon: ghostPersonIcon(shirt, skin, size, hail), interactive: false, zIndexOffset: -40 }).addTo(map.current!);
          const el = mk.getElement()?.querySelector(".b3-ghostperson") as HTMLElement | null;
          if (el) el.style.animationDelay = `${(Math.random() * 2.4).toFixed(2)}s`;
          return mk;
        });
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
        ghostMarkers.current[i]?.setIcon(carIcon("#9ca3af", g.bearing, 24, true));
      });
    };
    const gt = window.setInterval(tick, 2000);
    return () => clearInterval(gt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapOk]);

  // place pickup marker + recenter (remove+recreate replays the pin-drop animation). During PICKING
  // (pinpick/map) the center-pin character IS the pickup indicator — showing a second person at the
  // pre-set quickPickup is the "two people" bug. So only render this marker once a pickup is CHOSEN
  // (confirm/searching).
  useEffect(() => {
    if (!map.current) return;
    const picking = screen === "pinpick" || screen === "map";
    if (picking || !pickup?.lat || !pickup?.lng) {
      if (pickMarker.current) { pickMarker.current.remove(); pickMarker.current = null; }
      return;
    }
    if (pickMarker.current) pickMarker.current.remove();
    pickMarker.current = L.marker([pickup.lat, pickup.lng], { icon: personIcon() }).addTo(map.current);
    map.current.setView([pickup.lat, pickup.lng], 15, { animate: true });
  }, [pickup, screen]);

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
      const icon = L.divIcon({ className: "b3-carpin", html: `<span class="b3-carpin-i">${carSvg("#FFB300", 36)}<i class="b3-carpax"></i></span>`, iconSize: [36, 36], iconAnchor: [18, 18] });
      driverMarker.current = L.marker([d.lat, d.lng], { icon, zIndexOffset: 1000 }).addTo(map.current);
    } else {
      driverMarker.current.setLatLng([d.lat, d.lng]);
    }
    const root = driverMarker.current.getElement();
    if (root) root.classList.toggle("b3-aboard", active?.status === "started"); // passenger visibly aboard in-trip
    const inner = root?.querySelector(".b3-carpin-i") as HTMLElement | null;
    if (inner && typeof d.bearing === "number") inner.style.transform = `rotate(${d.bearing}deg)`;
  }, [active?.driver?.lat, active?.driver?.lng, active?.driver?.bearing, active?.status]);

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
      const seq = ++snapSeq.current; // only the NEWEST lookup may label the pin (see below)
      setPinPt({ lat: c.lat, lng: c.lng });
      setPinBusy(true);
      api.bookingNearestAddr(c.lat, c.lng)
        .then((a) => { if (alive && seq === snapSeq.current) { setPinAddr(a); setPinBusy(false); } })
        .catch(() => { if (alive && seq === snapSeq.current) setPinBusy(false); });
    };
    const onMove = () => { setWalking(false); if (deb) clearTimeout(deb); deb = setTimeout(snap, 450); };
    const onStart = () => setWalking(true); // dragging → the traveler walks
    m.on("movestart", onStart);
    m.on("moveend", onMove);
    // pickup2 only: label wherever the map already sits, without waiting for a move. The usual path
    // (setZoom → moveend → snap) needs the container to have a real size; when it doesn't yet, no
    // moveend fires, and the new sheet then sat on a skeleton with a dead CTA — observed on entry
    // with location denied. Flag OFF keeps the exact old sequence, extra request and all.
    if (pickup2) snap();
    if (m.getZoom() < 16) m.setZoom(16); // tighter zoom for precise picking (fires moveend → snap)
    else if (!pickup2) snap();
    return () => { alive = false; setWalking(false); if (deb) clearTimeout(deb); m.off("movestart", onStart); m.off("moveend", onMove); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, mapReady]);

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
      if (near) setFreeDrivers(Math.max(near.freeDrivers, GHOST_FREE + GHOST_RIDES)); // server-inflated; keep ghost floor
      // E7: ride finished — had an active ride last poll, now gone. TWO endings:
      // driver existed → peak-end finish screen; NO driver ever accepted (search died on kas's
      // side) → honest apology screen ("failed") with the next-ride voucher estimate. DISPLAY only:
      // the voucher itself was recorded by the bot sweep; the Mini App never grants.
      if (!a && activeRef.current) {
        if (activeRef.current.driver) {
          setFinishedBid(activeRef.current.id);
          setScreen("finished");
          confetti();
          haptic();
        } else {
          if (info.waitComp && waitStartRef.current) {
            const { graceSec, fullSec, ceiling } = info.waitComp;
            const el = Math.floor((Date.now() - waitStartRef.current) / 1000);
            const eff = Math.max(0, Math.min(el, fullSec) - graceSec);
            setFailedComp(Math.floor(ceiling * (eff / Math.max(1, fullSec - graceSec))));
          } else setFailedComp(0);
          setScreen("failed");
          haptic();
        }
      }
      activeRef.current = a;
      setActive(a); // B: real status — searching → accepted (only when a driver actually takes it) → arrived
      // Mini App poll cadence: while SEARCHING poll every 3s so "haydovchi topildi" appears in ~3s
      // (was 12s — the bot card is socket-instant, but the app still polls, so it lagged). Once a
      // driver is assigned, 5s is enough (the moving car is on the map socket).
      if (alive) timer = setTimeout(tick, a?.driver ? 5_000 : 3_000);
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
    // pickup2: once the catalog is in memory the filter is local, so asking kas per keystroke would
    // buy nothing — the upstream results get discarded by `hits` anyway.
    if (pickup2 && allPlaces?.length) return;
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
    setShowAll(false);
    setScreen("confirm");
  };

  // pickup2: pull the whole catalog once, lazily — kas caches it for 6h upstream, so this costs no
  // extra dispatch-backend call and lets every later keystroke filter locally.
  useEffect(() => {
    if (!pickup2 || allPlaces !== null) return;
    if (screen !== "pinpick" && screen !== "map") return;
    let alive = true;
    void api.bookingPlaces().then((r) => { if (alive) setAllPlaces(r); }).catch(() => { if (alive) setAllPlaces([]); });
    return () => { alive = false; };
  }, [pickup2, allPlaces, screen]);

  // 🎤 one utterance → the search box. The browser does the recognition; we make no network call.
  const listenOnce = (): void => {
    const Ctor = speechCtor();
    if (!Ctor || listening) return;
    haptic();
    const rec = new Ctor();
    rec.lang = "uz-UZ"; // unsupported locales fall back to the device default rather than failing
    rec.interimResults = false;
    rec.onresult = (e) => {
      const said = e.results?.[0]?.[0]?.transcript ?? "";
      if (said) void search(said);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    try { rec.start(); } catch { setListening(false); }
  };
  useEffect(() => () => { try { recRef.current?.abort(); } catch { /* already stopped */ } }, []);

  // 📍 "turgan joyim" — recenter the map on the device GPS. The FIRST getCurrentPosition fix is
  // often a coarse network position (~50 m off) because the GPS chip hasn't locked yet — that was the
  // "50 metr uzoqroq" bug. So we WATCH for a few seconds and keep the most accurate reading (the fix
  // refines from ~50 m to ~5 m), stopping early once it's tight. Then we recenter on that best fix.
  // transient location banner: auto-clears itself after `ms` UNLESS something else already replaced
  // it (functional setState guard) — so a location hint never lingers as a stuck "alert", and it
  // never wipes a booking-status message that arrived in the meantime.
  const flashMsg = (text: string | null, ms = 4000) => {
    setMsg(text);
    if (text) window.setTimeout(() => setMsg((c) => (c === text ? null : c)), ms);
  };
  /** `auto` = xarita ochilganda O'ZI chaqirildi (foydalanuvchi bosmadi, feature:autoloc).
   *  Farqi ikkitagina: titratish yo'q, va rad etilganda sozlamalar DEEP-LINK'i ochilmaydi —
   *  so'ralmagan holda foydalanuvchini Telegram sozlamalariga otib yuborish qo'pol bo'lardi.
   *  Qolgan hammasi bir xil yo'l: LocationManager → brauzer GPS zaxira, aniqlik toraytirish. */
  /** Brauzer GPS: `capMs` davomida KUZATIB eng aniq o'qishni qaytaradi. Birinchi o'qish ko'pincha
   *  ~50 m'lik tarmoq-nuqtasi bo'ladi (chip hali qulflanmagan), keyin ~5 m gacha toraytiriladi —
   *  shuning uchun bittasini olib qo'yamiz emas, eng tigizini kutamiz. Hech narsa kelmasa null. */
  const browserBestFix = (capMs: number): Promise<GeolocationPosition | null> =>
    new Promise((resolve) => {
      if (!navigator.geolocation) { resolve(null); return; }
      let best: GeolocationPosition | null = null;
      let watchId = 0;
      let done = false;
      let timer: ReturnType<typeof setTimeout>;
      const finish = () => {
        if (done) return;
        done = true;
        navigator.geolocation.clearWatch(watchId);
        clearTimeout(timer);
        resolve(best);
      };
      timer = setTimeout(finish, capMs);
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          if (!best || pos.coords.accuracy < best.coords.accuracy) best = pos; // eng tigizini saqlaymiz
          if (pos.coords.accuracy <= 15) finish(); // yetarlicha aniq → erta to'xtaymiz
        },
        () => { if (!best) finish(); },
        { enableHighAccuracy: true, timeout: 14000, maximumAge: 0 },
      );
    });

  /** Telegram'ning bitta o'qishi shu chegaradan yomon bo'lsa — brauzer GPS bilan toraytiramiz. */
  const COARSE_M = 50;

  const locateMe = async (auto = false) => {
    if (!map.current) return;
    if (!auto) haptic();
    setLocating(true);
    flashMsg("📍 Joylashuv aniqlanmoqda…", 16000);

    // Aniqlikni RAQAM bilan aytamiz. Ilgari faqat «aniqlik past» derdi — mijoz ham, biz ham
    // xato 50 metrmi yoki 800 metrmi, bila olmasdik. Endi ekranning o'zi diagnostika beradi.
    const apply = (lat: number, lng: number, accuracy: number) => {
      map.current?.setView([lat, lng], 17, { animate: true });
      flashMsg(accuracy <= 35 ? null : `📍 Aniqlik ~${Math.round(accuracy)} m — pinni biroz suring`, 6000);
    };

    // Telegram Mini App: navigator.geolocation is unreliable in the in-app WebView (the OS permission
    // prompt often never appears → "allow" never lands). Prefer the NATIVE LocationManager (Bot API
    // 8.0+), which drives Telegram's own permission flow and can deep-link to settings when denied.
    // Fall back to the browser API for older clients / real browsers.
    if (tgHasLocationManager()) {
      const r = await tgGetLocation();
      if ("lat" in r) {
        apply(r.lat, r.lng, r.accuracy);
        // ⚠️ Telegram BIR MARTA o'qiydi va bu ko'pincha tarmoq/uyacha nuqtasi — yuzlab metr xato
        // bo'lishi mumkin («pin qimirladi, lekin noto'g'ri joy» shikoyati aynan shu edi). Brauzer
        // yo'lidagi toraytirish bu yerda YO'Q edi. Endi aniqlik past bo'lsa toraytiramiz va faqat
        // HAQIQATDAN yaxshiroq o'qish kelsa pinni ko'chiramiz — aks holda Telegram nuqtasi qoladi.
        if (r.accuracy > COARSE_M) {
          const b = await browserBestFix(6000);
          if (b && b.coords.accuracy < r.accuracy) apply(b.coords.latitude, b.coords.longitude, b.coords.accuracy);
        }
        setLocating(false);
        return;
      }
      setLocating(false);
      if (r.error === "denied") {
        flashMsg(auto ? "📍 Joylashuv yopiq — pinni qo'lda suring yoki 📍 ni bosing" : "📍 Joylashuvga ruxsat berilmagan — sozlamalardan yoqing", 6000);
        if (!auto) tgOpenLocationSettings(); // deep-link so the user can re-grant in one tap
      } else {
        flashMsg("📍 Joylashuvni aniqlab bo'lmadi — qo'lda belgilang", 6000);
      }
      return;
    }

    const b = await browserBestFix(7000);
    setLocating(false);
    if (b) apply(b.coords.latitude, b.coords.longitude, b.coords.accuracy);
    else flashMsg("📍 Joylashuvni aniqlab bo'lmadi — ruxsat bering yoki qo'lda belgilang", 6000);
  };

  // 📍 OCHILGANDA O'ZI ANIQLASH (feature:autoloc). Ilgari GPS FAQAT 📍 tugmasi bosilganda
  // o'qilardi, xarita esa har safar kompaniya markazida ochilardi — mijoz qayerda bo'lishidan
  // qat'i nazar pin bir xil joyda turardi («lokatsiya eski joyda qotib qolgan»). Endi pinpick
  // ekrani ochilishi bilan bir marta o'zi aniqlaydi.
  // Shartlar: faqat bir marta (ref) · faqat pinpick (aktiv safarda «searching» ekraniga tegmaymiz) ·
  // faqat xarita mavjud bo'lgach. Muvaffaqiyatsizlikda hech narsa buzilmaydi — locateMe xabar
  // ko'rsatadi va pin avvalgi joyida qoladi, ya'ni flag OFF holatidagi xatti-harakat.
  const autoLocated = useRef(false);
  useEffect(() => {
    if (!me.flags?.autoloc || autoLocated.current) return;
    if (!mapReady || screen !== "pinpick") return;
    autoLocated.current = true;
    void locateMe(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, screen, me.flags?.autoloc]);

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

  // When the trip STARTS, the waiting pickup person "boards" the car — slides into it + fades, then the
  // marker is removed (the car then drives off with them on its real position). No more frozen person.
  useEffect(() => {
    if (active?.status !== "started") { boarded.current = false; return; }
    if (boarded.current || !map.current) return;
    boarded.current = true;
    const pm = pickMarker.current;
    const el = pm?.getElement()?.querySelector(".b3-pickperson") as HTMLElement | null;
    if (pm && el) {
      let dx = 0;
      let dy = -8;
      const dm = driverMarker.current;
      if (dm) {
        const a = map.current.latLngToContainerPoint(pm.getLatLng());
        const b = map.current.latLngToContainerPoint(dm.getLatLng());
        dx = b.x - a.x;
        dy = b.y - a.y;
      }
      el.style.animation = "none";
      el.style.transition = "transform .75s ease-in, opacity .75s ease-in";
      el.style.transform = `translate(${dx}px, ${dy}px) scale(.2)`;
      el.style.opacity = "0";
      window.setTimeout(() => { pickMarker.current?.remove(); pickMarker.current = null; }, 800);
    }
  }, [active?.status]);

  // B: rough live speed in-trip — kas exposes none, so derive it from consecutive driver positions
  // (EMA-smoothed + capped; ~5–15s polls make it approximate, hence the "~").
  useEffect(() => {
    const d = active?.driver;
    if (active?.status !== "started" || typeof d?.lat !== "number" || typeof d?.lng !== "number") {
      prevPos.current = null;
      if (speedKmh !== 0) setSpeedKmh(0);
      return;
    }
    const now = Date.now();
    const p = prevPos.current;
    prevPos.current = { lat: d.lat, lng: d.lng, t: now };
    if (!p) return;
    const dtH = (now - p.t) / 3_600_000;
    if (dtH <= 0) return;
    const kmh = Math.min(120, haversineKm({ lat: p.lat, lng: p.lng }, { lat: d.lat, lng: d.lng }) / dtH);
    setSpeedKmh((prev) => Math.round(prev ? prev * 0.5 + kmh * 0.5 : kmh));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.driver?.lat, active?.driver?.lng, active?.status]);

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
        waitStartRef.current = Date.now(); // the compensation ticker starts with the search
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
    setScreen("pinpick");
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
    setScreen("pinpick");
    setActive(null);
    activeRef.current = null;
    setFinishedBid(null);
    setStars(0);
    setRateTags([]);
    setRated(false);
    waitStartRef.current = null;
    setFailedComp(0);
  };

  // M7: label the dragged pin with the nearest REAL catalog place (~111 places cover the city, so
  // there's almost always one close). On it (≤150m) → the bare name ("Shabada"); a bit off → "… yaqini".
  // The server re-resolves this name authoritatively at booking, so the driver always gets a real place.
  // pickup2 (ega, 2026-08-08): the "… yaqini" suffix is dropped — the driver is dispatched to the
  // catalog place either way, so the rider seeing a hedged name only made the answer look unsure.
  const pinNear =
    pinPt && pinAddr && typeof pinAddr.lat === "number" && typeof pinAddr.lng === "number"
      ? pickup2 || haversineKm(pinPt, { lat: pinAddr.lat, lng: pinAddr.lng }) <= 0.15
        ? pinAddr.name
        : `${pinAddr.name} yaqini`
      : null;
  const confirmPin = () => {
    if (!pinPt || pinBusy) return;
    haptic();
    setPickup({ id: 0, name: pinNear ?? "Xaritada belgilangan nuqta", lat: pinPt.lat, lng: pinPt.lng });
    setScreen("confirm");
  };

  // quickPickup is usually ALSO the top saved address, so listing both printed the same place twice
  // on one screen ("one of each thing"). Under pickup2 the quick one wins and recents drop it.
  const recents = pickup2
    ? info.savedAddresses.filter((a) => !info.quickPickup || foldName(a.name) !== foldName(info.quickPickup.name)).slice(0, 3)
    : info.savedAddresses.slice(0, 3);

  // pickup2: places nearest to where the pin actually sits — real GPS distance, not an invented
  // "popular" ranking we have no data for (DIZAYN_QOIDALARI #7). Names already offered as
  // quickPickup/recents are dropped so the same place never appears twice on one screen.
  const nearPlaces = useMemo(() => {
    if (!pickup2 || !allPlaces || !pinPt) return [] as SavedAddressView[];
    const shown = new Set([info.quickPickup?.name, ...recents.map((r) => r.name)].filter((n): n is string => !!n).map(foldName));
    return allPlaces
      .filter((a) => typeof a.lat === "number" && typeof a.lng === "number" && !shown.has(foldName(a.name)))
      .map((a) => ({ a, km: haversineKm(pinPt, { lat: a.lat as number, lng: a.lng as number }) }))
      .sort((x, y) => x.km - y.km)
      .slice(0, 6)
      .map((x) => x.a);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickup2, allPlaces, pinPt?.lat, pinPt?.lng, info.quickPickup?.name, info.savedAddresses]);

  const hits = useMemo(() => (allPlaces?.length ? fuzzyFilter(q, allPlaces) : results), [q, allPlaces, results]);
  const sortedAll = useMemo(() => (allPlaces ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)), [allPlaces]);
  const letters = useMemo(() => [...new Set(sortedAll.map((a) => a.name.charAt(0).toUpperCase()))], [sortedAll]);

  // Ega maketida har joyning o'z rangli belgisi bor edi, LEKIN rang tasodifiy tanlangandi —
  // «Eski bozor» ko'k, «Markaziy bozor» to'q sariq, ikkalasi ham bozor. Bu yerda rang joyning
  // TURIDAN kelib chiqadi (`placeKind`, shared), ya'ni bir marta o'rgangan odam keyingi safar
  // o'qimasdan taniydi. Emoji EMAS: oq glif + to'liq bo'yalgan doira maketdagi ko'rinish.
  const kindIcon = (name: string) => {
    const k = placeKind(name);
    return (
      <span className={`b3-p2-kico k-${k}`} aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d={KIND_GLYPH[k]} />
        </svg>
      </span>
    );
  };
  const placeRow = (a: SavedAddressView, tag?: string) => (
    <button key={`${a.id}-${a.name}`} className="b3-p2-row" onClick={() => choose(a)}>
      {kindIcon(a.name)}
      <span className="b3-p2-rname">{a.name}</span>
      {tag && <span className="b3-p2-tag">{tag}</span>}
    </button>
  );
  const placeTile = (a: SavedAddressView) => (
    <button key={`${a.id}-${a.name}`} className={`b3-p2-ktile t-${placeKind(a.name)}`} onClick={() => choose(a)}>
      {a.name}
    </button>
  );
  // Maketdagi qidiruv maydoni: 343×50, ichida lupa; mikrofon FAQAT qurilma qo'llab-quvvatlasa
  // chiziladi (iPhone'da SpeechRecognition yo'q → tugma umuman yo'q, jim tugma qoldirilmaydi).
  const searchField = (
    <div className="b3-p2-search">
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" opacity=".55" aria-hidden="true">
        <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.6-3.6" />
      </svg>
      <input placeholder="Joy nomini yozing" aria-label="Joy qidirish" autoFocus value={q} onChange={(e) => void search(e.target.value)} />
      {micOk && (
        <button className={`b3-p2-mic2${listening ? " on" : ""}`} onClick={listenOnce} aria-label="Aytib qidirish" title="Aytib qidirish">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 15a3.5 3.5 0 0 0 3.5-3.5v-6a3.5 3.5 0 1 0-7 0v6A3.5 3.5 0 0 0 12 15z" />
            <path d="M18.5 11.5a6.5 6.5 0 0 1-13 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M12 18v3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );

  return (
    <div className="b3-screen">
      {/* top status bar — tanga · streak */}
      <div className="b3-top">
        <button className="b3-x" onClick={onClose}>←</button>
        <div className="b3-stats">
          <span>🪙 {formatNumber(me.coins)}</span>
          {me.streak?.current ? <span>🔥 {me.streak.current}</span> : null}
        </div>
        {/* 📖 story'ni QAYTA ochish — flag OFF bo'lsa tugma umuman chizilmaydi (jim tugma yo'q, qoida #14) */}
        {me.flags?.taxistory && (
          <button className="b3-help" onClick={() => { haptic(); setStory(true); }} aria-label="Taksi qanday chaqiriladi" title="Qanday ishlaydi?">?</button>
        )}
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
          {/* top search pill — tap to TYPE an address (opens the search sheet). Hidden under pickup2:
              the sheet carries its own search field, and two search entries on one screen is the
              duplicated-chrome the minimalism pass removed everywhere else. */}
          {(!pickup2 || p2min) && (
            <button className={`b3-pin-search${walking ? " hide" : ""}`} onClick={() => { haptic(); setScreen("map"); }}>
              <span className="b3-pin-search-ico">🔍</span>
              <span>Qayerdan?</span>
            </button>
          )}
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
          <div className={`b3-pin-callout${walking ? " hide" : ""}`} aria-hidden="true">📍 Mashina shu yerga keladi</div>
          <button className={`b3-myloc${locating ? " locating" : ""}`} onClick={() => void locateMe()} aria-label="Joylashuvni yuborish" title="Joylashuvim">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="6.5" />
              <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
              <line x1="12" y1="1.8" x2="12" y2="4.6" />
              <line x1="12" y1="19.4" x2="12" y2="22.2" />
              <line x1="1.8" y1="12" x2="4.6" y2="12" />
              <line x1="19.4" y1="12" x2="22.2" y2="12" />
            </svg>
          </button>
          {!walking && <div className="b3-myloc-lb" aria-hidden="true">Joylashuvim</div>}
          {coach && (
            <div className="b3-coach" aria-hidden="true">
              <div className="b3-coach-arrow">👇</div>
              <div className="b3-coach-txt">Xaritani suring — kerakli joyni belgilang</div>
              <div className="b3-coach-sub">Keyin «✅ Shu yerdan» tugmasini bosing</div>
            </div>
          )}
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
      {screen === "map" && pickup2 && (
        <div className={`b3-sheet b3-p2-sheet${lite}`}>
          <div className="b3-grip" />
          <div className="b3-p2-head2">
            <button
              className="b3-p2-back2"
              aria-label="Orqaga"
              onClick={() => { haptic(); if (showAll) { setShowAll(false); return; } setQ(""); setResults([]); setScreen("pinpick"); }}
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
            </button>
            <div className="b3-p2-title2">{showAll ? "Barcha joylar" : layoutB ? "Kosondagi joylar" : "Joyni tanlang"}</div>
          </div>
          {searchField}
          {listening && <div className="dim fs13 mt6">🎤 Eshityapman — joy nomini ayting…</div>}
          {/* B tartibi: «Atrofdagi | Barchasi» tab'lari — A da bu ish pastdagi «Barcha joylar»
              ramkali qatori bilan bajariladi (bitta ekranda ikkala usul chizilmaydi). */}
          {layoutB && q.trim().length === 0 && (
            <div className="b3-p2-tabs" role="tablist">
              <button className="b3-p2-tab" role="tab" aria-selected={!showAll} onClick={() => { haptic(); setShowAll(false); }}>Atrofdagi</button>
              <button className="b3-p2-tab" role="tab" aria-selected={showAll} onClick={() => { haptic(); setShowAll(true); }}>Barchasi</button>
            </div>
          )}
          {/* TARTIB MUHIM: yozilgan so'rov HAR DOIM ustun. Ilgari `showAll` birinchi tekshirilardi —
              «Barchasi» ochiq bo'lsa yozilgan so'z e'tiborga olinmasdi va butun katalog qolaverardi. */}
          {q.trim().length > 0 ? (
            hits.length > 0 ? (
              layoutB
                ? <div className="b3-p2-grid">{hits.slice(0, 20).map(placeTile)}</div>
                : <div className="b3-p2-list">{hits.slice(0, 20).map((a) => placeRow(a))}</div>
            ) : (
              <div className="d-empty">
                <div className="d-empty-ico">🔍</div>
                <div>«{q}» topilmadi</div>
                <div className="dim fs12 mt4">Boshqacha yozib ko'ring yoki xaritadan tanlang</div>
              </div>
            )
          ) : showAll && layoutB ? (
            sortedAll.length > 0
              ? <div className="b3-p2-grid b3-p2-all">{sortedAll.map(placeTile)}</div>
              : <div className="b3-p2-grid">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} h={76} className="b3-p2-tileskel" />)}</div>
          ) : showAll ? (
            <>
              {letters.length > 1 && (
                <div className="b3-p2-idx">
                  {letters.map((L) => (
                    <button key={L} className="b3-p2-ic" onClick={() => { haptic(); document.getElementById(`b3L${L}`)?.scrollIntoView({ block: "start" }); }}>{L}</button>
                  ))}
                </div>
              )}
              <div className="b3-p2-list b3-p2-all">
                {sortedAll.length === 0
                  ? [0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} h={44} className="b3-p2-rowskel" />)
                  : sortedAll.map((a, i) => {
                      const L = a.name.charAt(0).toUpperCase();
                      const first = sortedAll[i - 1]?.name.charAt(0).toUpperCase() !== L;
                      return first ? <div key={`g${L}`} id={`b3L${L}`}>{placeRow(a)}</div> : placeRow(a);
                    })}
              </div>
            </>
          ) : (
            <>
              {/* Odatdagi/oxirgi joylar — B da ular ham KATTAK bo'lib chiziladi. Ilgari bu yerda
                  qatorlar turardi va pastda kattaklar — bitta ekranda ikki xil vizual til edi.
                  Tartibning o'zi ustuvorlikni aytadi: sizniki avval, atrofdagilar keyin. */}
              {(info.quickPickup || recents.length > 0) && (
                layoutB ? (
                  <div className="b3-p2-grid">
                    {info.quickPickup && placeTile(info.quickPickup)}
                    {recents.map(placeTile)}
                  </div>
                ) : (
                  <div className="b3-p2-list">
                    {info.quickPickup && placeRow(info.quickPickup, "odatdagi")}
                    {recents.map((a) => placeRow(a, "oxirgi"))}
                  </div>
                )
              )}
              {/* B da bu sarlavhani tab («Atrofdagi») aytib turibdi — ikki marta yozilmaydi. */}
              {!layoutB && <div className="b3-p2-seclabel">Atrofingizdagi joylar</div>}
              {/* A = ro'yxat qatorlari, B = rangli kattaklar. Bitta ekranda IKKALASI ham
                  chizilmaydi — bir xil ma'lumot ikki ko'rinishda = takror (minimalizm qarori). */}
              {nearPlaces.length > 0 ? (
                layoutB
                  ? <div className="b3-p2-grid">{nearPlaces.map(placeTile)}</div>
                  : <div className="b3-p2-list">{nearPlaces.map((a) => placeRow(a))}</div>
              ) : layoutB ? (
                <div className="b3-p2-grid">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} h={76} className="b3-p2-tileskel" />)}</div>
              ) : (
                <div className="b3-p2-list">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} h={64} className="b3-p2-rowskel" />)}</div>
              )}
            </>
          )}
          {/* A: «Barcha joylar · N» ramkali qator — bosilganda ekran alifbo ro'yxatiga aylanadi;
                 «‹» undan qaytaradi. B da bu ishni yuqoridagi «Barchasi» tab'i bajaradi. */}
          {!showAll && !layoutB && (
            <button className="b3-p2-allrow" onClick={() => { haptic(); setShowAll(true); }}>
              <span className="pin">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" /></svg>
              </span>
              <span className="lb">Barcha joylar{sortedAll.length ? ` · ${sortedAll.length}` : ""}</span>
              <span className="ch"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg></span>
            </button>
          )}
          {/* Xarita — ZAXIRA yo'l. Maketdagi ikki qatorli blok: savol + harakat. Nomidan
              topolmagan odam uchun oxirgi chiqish yo'li, targ'ib qilinmaydi. */}
          <button className="b3-p2-maprow" onClick={() => { haptic(); setQ(""); setResults([]); setShowAll(false); setP2min(true); setScreen("pinpick"); }}>
            <span className="ico">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 3L3 5.5v15L9 18l6 3 6-2.5v-15L15 6 9 3z" /><path d="M9 3v15M15 6v15" /></svg>
            </span>
            <span className="txt">
              <span className="q">Joy topilmadimi?</span>
              <span className="a">Xaritadan tanlash</span>
            </span>
            <span className="ch"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg></span>
          </button>
        </div>
      )}

      {screen === "map" && !pickup2 && (
        <div className="b3-sheet">
          <div className="b3-grip" />
          <div className="b3-sheet-head">
            <button className="b3-sheet-back" onClick={() => { haptic(); setScreen("pinpick"); }}>Xaritaga</button>
            <div className="b3-sheet-title">🔍 Manzilni yozing</div>
          </div>
          <input className="bk-input" placeholder="Manzil qidiring (xato yozsangiz ham topadi)" autoFocus value={q} onChange={(e) => search(e.target.value)} />
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

      {/* ── Map-is-picker: compact bar — slides DOWN while dragging (map open, character walks),
             returns when you stop. Detected place + quick chips + the single confirm CTA. ── */}
      {screen === "pinpick" && (!pickup2 || p2min) && (
        <div className={`b3-pinbar${walking ? " dragging" : ""}`}>
          <div className="b3-grip" onClick={pickup2 ? () => { haptic(); setP2min(false); } : undefined} />
          <div className="b3-pin-label">
            {pinBusy ? "⏳ Manzil aniqlanmoqda…" : pinNear ? <>📍 <b>{pinNear}</b></> : "📍 Xaritani suring — joyni belgilang"}
          </div>
          {!pickup2 && (info.quickPickup || recents.length > 0) && (
            <div className="b3-chips b3-pin-chips">
              {info.quickPickup && <button className="d-chip" onClick={() => choose(info.quickPickup!)}>🏠 {info.quickPickup.name}</button>}
              {recents.slice(0, 2).map((a) => (
                <button key={a.id} className="d-chip" onClick={() => choose(a)}>🕐 {a.name}</button>
              ))}
            </div>
          )}
          <Button className={pinPt && !pinBusy ? "b3-confirm-pulse" : undefined} disabled={!pinPt || pinBusy} onClick={confirmPin}>✅ Shu yerdan</Button>
        </div>
      )}

      {/* ── pickup2: the rebuilt pickup sheet. A = answer first, B = list first. Same data and same
             actions in both — only the order changes, so the owner can compare them on a real phone. ── */}
      {screen === "pinpick" && pickup2 && !p2min && (
        <div className={`b3-p2bar${walking ? " dragging" : ""}${lite}`}>
          <div className="b3-grip" />
          {layoutB ? (
            <button className="b3-p2-answer-row" disabled={!pinPt || pinBusy} onClick={confirmPin}>
              <span className="b3-p2-ico">📍</span>
              <span className="b3-p2-rname"><b>{pinBusy || !pinNear ? "Aniqlanmoqda…" : pinNear}</b></span>
              <span className="b3-p2-tag">shu yerdan chaqirish</span>
            </button>
          ) : (
            <>
              {/* Javob kartasi — ega maketining bosh ekrani: yashil «siz shu yerdasiz», katta toza
                  nom (masofasiz — haydovchi ham aynan shu nomni ko'radi), shahar, tasdiq belgisi. */}
              <div className="b3-p2-ans">
                <div className="b3-p2-eyebrow">
                  <svg width="13" height="16" viewBox="0 0 12 15" fill="currentColor" aria-hidden="true">
                    <path d="M6 0C2.7 0 0 2.7 0 6c0 4.5 6 9 6 9s6-4.5 6-9c0-3.3-2.7-6-6-6zm0 8.2A2.2 2.2 0 1 1 6 3.8a2.2 2.2 0 0 1 0 4.4z" />
                  </svg>
                  Siz shu yerdasiz
                </div>
                {pinBusy || !pinNear
                  ? <Skeleton h={33} w="70%" className="b3-p2-nameskel" />
                  : <div className="b3-p2-place">{pinNear}</div>}
                <div className="b3-p2-city">Koson</div>
                <div className="b3-p2-ok">
                  <span className="b3-p2-tick">
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 4l2.6 2.6L9 1.2" /></svg>
                  </span>
                  {pinBusy || !pinNear ? "Joylashuv aniqlanmoqda…" : "Joylashuv aniqlandi"}
                </div>
              </div>
              <button className="b3-p2-cta" disabled={!pinPt || pinBusy} onClick={confirmPin}>
                Shu yerdan taxi chaqirish
              </button>
              {/* Uchta ZAXIRA yo'l — targ'ib qilinmaydi, lekin har biri to'liq ishlaydi.
                  98% odam yuqoridagi yashil tugma bilan tugatadi (taxi-pickup-reality). */}
              <div className="b3-p2-hint">Boshqa joydan chaqirmoqchimisiz?</div>
              <div className="b3-p2-alts">
                <button className="b3-p2-alt" onClick={() => { haptic(); setScreen("map"); }}>
                  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="var(--p2-blue)" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.6-3.6" /></svg>
                  <span className="lb">Joy qidirish</span>
                </button>
                <button className="b3-p2-alt" onClick={() => { haptic(); setP2min(true); }}>
                  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="var(--p2-purple)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 3L3 5.5v15L9 18l6 3 6-2.5v-15L15 6 9 3z" /><path d="M9 3v15M15 6v15" /></svg>
                  <span className="lb">Xaritadan</span>
                </button>
                <button className="b3-p2-alt" onClick={() => { haptic(); setScreen("map"); }}>
                  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="var(--p2-orange)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3z" /><path d="M14.5 6.5l3 3" /></svg>
                  <span className="lb">Izoh yozish</span>
                </button>
              </div>
            </>
          )}
          {layoutB && (
            <button className="b3-p2-field" onClick={() => { haptic(); setScreen("map"); }}>
              <span>🔍</span><span>Nom yozing</span>
            </button>
          )}
          {layoutB ? (
            nearPlaces.length > 0 ? (
              <>
                <div className="b3-p2-hd">Atrofingizdagi joylar</div>
                <div className="b3-p2-grid">{nearPlaces.slice(0, 4).map(placeTile)}</div>
              </>
            ) : (
              <div className="b3-p2-grid">{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={76} className="b3-p2-tileskel" />)}</div>
            )
          ) : (
            (info.quickPickup || recents.length > 0) && (
              <div className="b3-p2-list">
                {info.quickPickup && placeRow(info.quickPickup, "odatdagi")}
                {recents.slice(0, 2).map((a) => placeRow(a, "oxirgi"))}
              </div>
            )
          )}
          {/* A tartibida bu yo'l yuqoridagi «Xaritadan» kattakchasida bor — ikkinchi marta
              takrorlanmaydi (bitta narsadan bitta dona, minimalizm qarori 2026-07-26). */}
          {layoutB && (
            <button className="b3-p2-ghost" onClick={() => { haptic(); setP2min(true); }}>Xaritadan ko'rsatish</button>
          )}
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
          <div className="b3-extra-row">
            <button className="b3-extra-btn" onClick={() => { haptic(); setScreen("schedule"); }}>⏰ Keyinroqqa</button>
            <button className="b3-extra-btn" onClick={() => { haptic(); void loadFamily(); setScreen("family"); }}>👨‍👩‍👧 Oila uchun</button>
          </div>
          <Button variant="ghost" onClick={() => setScreen("map")}>Bekor</Button>
        </div>
      )}

      {/* ── E4: real-status (searching → accepted → arrived) ── */}
      {screen === "searching" && (
        <div className={`b3-sheet${!active?.driver ? " b3-search-sheet" : ""}${(!active?.driver && searchMin) || (active?.driver && rideMin) ? " b3-minisheet" : ""}`}>
          {/* grip = collapse toggle. While searching → searchMin; after a driver accepts → rideMin
              (map stays visible, fare shows big). */}
          <div
            className="b3-grip b3-grip-tap"
            role="button"
            aria-label={(active?.driver ? rideMin : searchMin) ? "Panelni ochish" : "Panelni yig'ish"}
            onClick={() => { haptic(); if (active?.driver) setRideMin((v) => !v); else setSearchMin((v) => !v); }}
          />
          {!active?.driver && searchMin ? (
            // mini bar: map stays visible; status + live bonus + cancel in ONE line
            <div className="b3-mini-row" onClick={() => { haptic(); setSearchMin(false); }}>
              <span className="b3-mini-status">🔍 Qidirilmoqda…</span>
              <WaitTicker waitComp={info.waitComp} startAt={waitStartRef.current} mini />
              <button className="b3-mini-x" disabled={busy} onClick={(e) => { e.stopPropagation(); void cancel(); }} aria-label="Bekor qilish">✖</button>
            </div>
          ) : active?.driver && rideMin ? (
            // collapsed accepted card — map stays visible; status + big fare + call, and a fill bar
            // that grows as the car approaches (tap anywhere to expand back).
            <div className="b3-ride-mini" onClick={() => { haptic(); setRideMin(false); }}>
              <div className="b3-mini-expand">▲ Batafsil</div>
              <div className="b3-ride-mini-row">
                <div className="b3-ride-mini-main">
                  <div className="b3-ride-mini-status">
                    {active.status === "arrived" ? "🚕 Yetib keldi — chiqing!" : active.status === "started" ? "🚗 Safarda" : `🚖 Mashina yaqinlashmoqda${active.etaMin ? ` · ~${active.etaMin} daq` : ""}`}
                  </div>
                  <div className="b3-ride-mini-fare"><CountUp value={active.driver.meterPayment || info.tariff?.minimalPayment || 0} /> <span>so'm</span></div>
                </div>
                {active.driver.phone ? <a className="b3-ride-mini-call" href={`tel:${active.driver.phone}`} onClick={(e) => e.stopPropagation()} aria-label="Qo'ng'iroq">📞</a> : null}
              </div>
              {active.status !== "started" && (
                <RideProgress pct={approachPct} full={active.status === "arrived"} />
              )}
            </div>
          ) : active?.driver ? (
            // accepted — a driver actually took the order (carNumber present)
            <>
              {/* one obvious tap to lower the panel and watch the car on the map */}
              <button className="b3-collapse-btn" onClick={() => { haptic(); setRideMin(true); }}>▾ Kichraytirish · xaritani ko'rish</button>
              <div className={`b3-search-title${active.status === "arrived" ? " b3-arrived" : ""}`}>
                {active.status === "arrived" ? "🚕 Haydovchi yetib keldi — chiqing!" : "✅ Haydovchi qabul qildi"}
              </div>
              {active.status !== "started" && (
                <RideProgress pct={approachPct} full={active.status === "arrived"} className="mt8" />
              )}
              <RideTimeline status={active.status} />
              <div className="b3-driver b3-driver-tap" role="button" tabIndex={0} onClick={() => { haptic(); setPlateZoom(true); }} title="Bosib to'liq ko'rish">
                <div className="b3-driver-av">🧑‍✈️</div>
                <div className="b3-driver-meta">
                  <div className="b3-driver-name">
                    {active.driver.fullName || "Haydovchi"}
                    {active.driver.rating ? <span className="b3-driver-rate"> ⭐{active.driver.rating.toFixed(1)}</span> : null}
                  </div>
                  <div className="dim fs13">🚘 {active.driver.carModel} · <span className="b3-driver-plate">{active.driver.carNumber}</span></div>
                </div>
                {active.etaMin ? <div className="b3-eta"><b>{active.etaMin}</b><span>daq</span></div> : null}
              </div>
              {active.driver.meterPayment ? (
                <div className="b3-fare-row b3-fare-big mt8"><span>🧮 Hisoblagich (jonli)</span><b><CountUp value={active.driver.meterPayment} /> so'm</b></div>
              ) : null}
              {active.status === "started" && speedKmh > 0 ? (
                <div className="b3-fare-row"><span>🚗 Tezlik</span><b>~{speedKmh} km/soat</b></div>
              ) : null}
              {active.status === "started" ? <InTripExtras rideStartedAt={active.rideStartedAt ?? null} /> : null}
              <div className="b3-acts">
                {active.driver.phone ? <a className="b3-act b3-act-call" href={`tel:${active.driver.phone}`}>📞 Qo'ng'iroq</a> : null}
                <button className="b3-act" onClick={() => { if (active.driver) void shareTrip(active.driver); }}>🛡 Ulashish</button>
              </div>
            </>
          ) : (
            // 🔍 Jonli qidiruv — the OLD compact look (radar + one honest line; owner preferred it)
            // + a slim gold bonus chip. The driver-card branch replaces all of this on accept.
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
              <WaitTicker waitComp={info.waitComp} startAt={waitStartRef.current} />
            </>
          )}
          {!(searchMin && !active?.driver) && !(rideMin && active?.driver) && (
            <Button variant="danger" disabled={busy} onClick={cancel}>✖ Bekor qilish</Button>
          )}
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

      {/* ── 😔 "topilmadi" — the search died with NO driver ever accepting. Honest apology +
          the next-ride voucher (recorded server-side; the number here is the same-ramp estimate).
          The retention moment: the rider's money is WAITING for them — reason to come back. ── */}
      {screen === "failed" && (
        <div className="b3-sheet b3-finish">
          <div className="b3-grip" />
          <div className="b3-finish-emoji">😔</div>
          <div className="b3-sheet-title tac">Uzr — mashina topib bera olmadik</div>
          <div className="dim tac fs13 mt6">Hozir bo'sh haydovchi chiqmadi. Bu bizning aybimiz.</div>
          {failedComp > 0 && (
            <div className="b3-voucher">🎁 <b>+{formatNumber(failedComp)} tanga</b> keyingi safaringizda sizni kutadi</div>
          )}
          <Button onClick={rebook}>🔁 Qayta urinib ko'rish</Button>
        </div>
      )}

      {/* ── ⏰ Schedule sheet ── */}
      {screen === "schedule" && pickup && (
        <div className="b3-sheet b3-sched-sheet">
          <div className="b3-grip" />
          <div className="b3-sheet-head">
            <button className="b3-sheet-back" onClick={() => { haptic(); setScreen("confirm"); }}>Orqaga</button>
            <div className="b3-sheet-title">⏰ Rejali safar</div>
          </div>
          <div className="b3-sched-addr">📍 <b>{pickup.name}</b></div>
          <div className="b3-sched-row">
            <button className={"b3-sched-day" + (schedDay === "today" ? " on" : "")} onClick={() => setSchedDay("today")}>Bugun</button>
            <button className={"b3-sched-day" + (schedDay === "tomorrow" ? " on" : "")} onClick={() => setSchedDay("tomorrow")}>Ertaga</button>
          </div>
          <div className="b3-sched-label">Soat</div>
          <div className="b3-sched-hours">
            {[6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22].map((h) => (
              <button key={h} className={"b3-sched-h" + (schedHour === h ? " on" : "")} onClick={() => setSchedHour(h)}>{String(h).padStart(2,"0")}</button>
            ))}
          </div>
          <div className="b3-sched-label">Daqiqa</div>
          <div className="b3-sched-row">
            {[0,15,30,45].map((m) => (
              <button key={m} className={"b3-sched-day" + (schedMin === m ? " on" : "")} onClick={() => setSchedMin(m)}>{String(m).padStart(2,"0")}</button>
            ))}
          </div>
          <div className="b3-sched-preview dim fs13">
            {schedDay === "today" ? "Bugun" : "Ertaga"} soat <b>{String(schedHour).padStart(2,"0")}:{String(schedMin).padStart(2,"0")}</b> da taxi chaqiriladi
          </div>
          {schedList.length > 0 && (
            <div className="b3-sched-list">
              <div className="dim fs12 mb4">Saqlangan rejalar:</div>
              {schedList.map((s) => {
                const d = new Date(s.runAt);
                return (
                  <div key={s.id} className="b3-sched-item">
                    <span>📍 {s.addressName}</span>
                    <span className="dim fs12">{d.toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" })}</span>
                    <button className="b3-sched-del" onClick={async () => {
                      await api.bookingScheduleCancel(s.id).catch(() => null);
                      setSchedList((p) => p.filter((x) => x.id !== s.id));
                    }}>✖</button>
                  </div>
                );
              })}
            </div>
          )}
          <Button disabled={schedBusy} onClick={saveSchedule}>{schedBusy ? "Saqlanmoqda…" : "✅ Saqlash"}</Button>
        </div>
      )}

      {/* ── 👨‍👩‍👧 Family sheet ── */}
      {screen === "family" && (
        <div className="b3-sheet b3-fam-sheet">
          <div className="b3-grip" />
          <div className="b3-sheet-head">
            <button className="b3-sheet-back" onClick={() => { haptic(); setScreen("confirm"); }}>Orqaga</button>
            <div className="b3-sheet-title">👨‍👩‍👧 Oila uchun</div>
          </div>
          {pickup && <div className="b3-sched-addr">📍 <b>{pickup.name}</b></div>}
          {!famLoaded ? (
            <div className="dim fs13 tac mt12">Yuklanmoqda…</div>
          ) : famList.length === 0 ? (
            <div className="d-empty"><div className="d-empty-ico">👥</div><p>Hali oila a'zolari yo'q</p></div>
          ) : (
            <div className="b3-fam-list">
              {famList.map((f) => (
                <div key={f.id} className="b3-fam-item">
                  <div className="b3-fam-info">
                    <div className="b3-fam-name">{f.name}</div>
                    <div className="dim fs12">{f.phone}</div>
                  </div>
                  <Button disabled={busy || !pickup} onClick={() => bookFamily(f)}>🚕 Chaqir</Button>
                </div>
              ))}
            </div>
          )}
          <div className="b3-fam-add">
            <div className="dim fs13 mb6">+ Yangi a'zo qo'shish (maks. 3 ta)</div>
            <input className="bk-input mb6" placeholder="Telefon: 901234567" value={famPhone} onChange={(e) => setFamPhone(e.target.value.replace(/\D/g, "").slice(0, 9))} inputMode="numeric" />
            <input className="bk-input mb6" placeholder="Ismi (Onam, Xotinim…)" value={famName} onChange={(e) => setFamName(e.target.value)} />
            <Button disabled={famPhone.length < 9 || famAdding} onClick={addFamily}>{famAdding ? "Qo'shilmoqda…" : "➕ Qo'shish"}</Button>
          </div>
        </div>
      )}
      {/* 🔍 Haydovchi kartochkasi — plitkani bosib boy malumotli pop-up. Tashqariga bosish → silliq pastga qaytadi. */}
      {plateZoom && active?.driver?.carNumber && (() => {
        const d = active.driver!;
        const r = d.rating ?? 0;
        const full = Math.floor(r);
        const half = r - full >= 0.5;
        const stars = "★".repeat(full) + (half ? "⯨" : "") + "☆".repeat(Math.max(0, 5 - full - (half ? 1 : 0)));
        // sintetik fikr tag — reyting asosida (haqiqiy oxirgi-fikr backend endpoint qo'shilsa, shu yerga keladi)
        const verdict = r >= 4.8 ? { ico: "🏆", t: "Eng yaxshi haydovchilardan" }
          : r >= 4.5 ? { ico: "✅", t: "Yuqori reyting · mijozlar tavsiya qiladi" }
          : r >= 4.0 ? { ico: "👍", t: "Yaxshi reyting" }
          : r > 0    ? { ico: "🆕", t: "Faollikni ko'paytirmoqda" }
          : { ico: "🆕", t: "Yangi haydovchi" };
        // Initialli avatar fallback — agar Telegram rasm yo'q bo'lsa. Birinchi 1-2 harf, brand fonda.
        const initials = (d.fullName || "?")
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((w) => w[0]!.toUpperCase())
          .join("");
        // server bizning prod URL'imiz bo'ladi; nisbiy yo'l (/api/driver-photo/:id) ham ishlaydi
        const photoSrc = d.photoUrl
          ? (d.photoUrl.startsWith("http") ? d.photoUrl : (import.meta.env.VITE_API_URL as string || "") + d.photoUrl)
          : null;
        return (
          <div className={`b3-plate-zoom${plateClosing ? " closing" : ""}`} onClick={closePlate} role="dialog" aria-label="Haydovchi ma'lumotlari">
            <div className="b3-driver-card" onClick={(e) => e.stopPropagation()}>
              <div className="b3-dc-avatar">
                {photoSrc ? (
                  <img src={photoSrc} alt={d.fullName || "Haydovchi"} className="b3-dc-avatar-img" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                ) : initials ? (
                  <span className="b3-dc-avatar-initials">{initials}</span>
                ) : (
                  "🧑‍✈️"
                )}
              </div>
              <div className="b3-dc-name">{d.fullName || "Haydovchi"}</div>
              <div className="b3-dc-rating">
                <span className="b3-dc-stars">{stars}</span>
                {r > 0 && <span className="b3-dc-rating-num">{r.toFixed(1)}</span>}
              </div>
              <div className="b3-dc-car">🚘 {d.carModel || "—"}</div>
              <div className="b3-dc-plate-wrap">
                <div className="b3-dc-plate-pin" />
                <div className="b3-dc-plate-pin r" />
                <div className="b3-dc-plate-num">{d.carNumber}</div>
              </div>
              <div className="b3-dc-verdict">
                <span className="b3-dc-verdict-ico">{verdict.ico}</span>
                <span>{verdict.t}</span>
              </div>
              {active.etaMin != null && active.etaMin > 0 && (
                <div className="b3-dc-eta">⏱ Yetib keladi: <b>~{active.etaMin} daq</b></div>
              )}
              <div className="b3-dc-actions">
                {d.phone && (
                  <a className="b3-dc-call" href={`tel:${d.phone}`}>📞 Qo'ng'iroq</a>
                )}
                <button className="b3-dc-close" onClick={closePlate}>Yopish</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 📖 O'rgatuvchi story — eng ustki qatlam. Yopilganda coach-mark ham "ko'rilgan" deb belgilanadi:
          story pin/joy tanlashni allaqachon tushuntirdi, ketma-ket ikkita dars berilmaydi. */}
      {story && (
        <TaxiStory
          info={info}
          onClose={() => {
            setStory(false);
            setCoach(false);
            try { localStorage.setItem("b3coach1", "1"); } catch { /* private mode */ }
          }}
        />
      )}
    </div>
  );
}
