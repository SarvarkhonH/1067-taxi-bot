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
import { formatNumber, GARAGE_RIDE_CAP_MIN, type ActiveBookingView, type BookingDriverView, type BookingInfoResponse, type GarageResponse, type MeResponse, type SavedAddressView, type WheelSpinResponse } from "@t1067/shared";
import { api } from "./api";
import { haptic, tg } from "./telegram";
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

type Screen = "map" | "confirm" | "searching";

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
      {spin && !spin.noRide ? (
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
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SavedAddressView[]>([]);
  const [searching, setSearching] = useState(false);
  const [freeDrivers, setFreeDrivers] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [active, setActive] = useState<ActiveBookingView | null>(info.active ?? null); // B: live status

  const mapRef = useRef<HTMLDivElement | null>(null);
  const map = useRef<L.Map | null>(null);
  const pinMarkers = useRef<L.Marker[]>([]);
  const pickMarker = useRef<L.Marker | null>(null);
  const driverMarker = useRef<L.Marker | null>(null);
  const [mapOk] = useState(mapAllowed); // false only when ?nomap=1 → show placeholder
  const [mapFailed, setMapFailed] = useState(false); // no tiles loaded (network blocked)

  // ── E1: Leaflet raster map (no WebGL — renders on every Telegram WebView) ──
  useEffect(() => {
    if (!mapRef.current || map.current || !mapOk) return; // ?nomap=1 → skip, show placeholder
    let failTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      const m = L.map(mapRef.current, { zoomControl: false, attributionControl: false }).setView(
        [info.center.lat, info.center.lng],
        14,
      );
      L.tileLayer(TILE_URL, { subdomains: TILE_SUBDOMAINS, maxZoom: 20, crossOrigin: true }).addTo(m);
      map.current = m;
      // if NO tile loads within 8s (network blocked / offline) → placeholder, never a blank map
      failTimer = setTimeout(() => setMapFailed(true), 8000);
      let firstTile = false;
      m.on("tileload", () => {
        if (firstTile) return;
        firstTile = true;
        if (failTimer) clearTimeout(failTimer);
        setMapFailed(false);
      });
      setTimeout(() => map.current?.invalidateSize(), 200); // size correctly after layout settles
    } catch {
      setMapFailed(true);
    }
    return () => {
      if (failTimer) clearTimeout(failTimer);
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── E1 live pins (free cars), 45s refresh ──
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const r = await api.bookingNearby().catch(() => null);
      if (!alive || !r || !map.current) return;
      setFreeDrivers(r.freeDrivers);
      for (const mk of pinMarkers.current) mk.remove();
      pinMarkers.current = r.pins
        .slice(0, 20)
        .map((d) => L.marker([d.lat, d.lng], { icon: divIcon("b3-pin" + (d.busy ? " busy" : ""), d.busy ? "🚖" : "🟢") }).addTo(map.current!));
    };
    load();
    const t = setInterval(load, 45_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // place pickup marker + recenter (remove+recreate replays the pin-drop animation)
  useEffect(() => {
    if (!map.current || !pickup?.lat || !pickup?.lng) return;
    if (pickMarker.current) pickMarker.current.remove();
    pickMarker.current = L.marker([pickup.lat, pickup.lng], { icon: divIcon("b3-pickpin pin-drop", "📍") }).addTo(map.current);
    map.current.setView([pickup.lat, pickup.lng], 15, { animate: true });
  }, [pickup]);

  // ── C: live assigned-driver car marker — glides toward you + rotates by bearing ──
  useEffect(() => {
    const d = active?.driver;
    if (!map.current || typeof d?.lat !== "number" || typeof d?.lng !== "number") {
      if (driverMarker.current) { driverMarker.current.remove(); driverMarker.current = null; }
      return;
    }
    if (!driverMarker.current) {
      // className → CSS transition on .b3-carpin glides the marker position between polls
      const icon = L.divIcon({ className: "b3-carpin", html: '<span class="b3-carpin-i">🚖</span>', iconSize: [30, 30], iconAnchor: [15, 15] });
      driverMarker.current = L.marker([d.lat, d.lng], { icon, zIndexOffset: 1000 }).addTo(map.current);
    } else {
      driverMarker.current.setLatLng([d.lat, d.lng]);
    }
    const inner = driverMarker.current.getElement()?.querySelector(".b3-carpin-i") as HTMLElement | null;
    if (inner && typeof d.bearing === "number") inner.style.transform = `rotate(${d.bearing}deg)`;
  }, [active?.driver?.lat, active?.driver?.lng, active?.driver?.bearing]);

  // ── E4 honest queue while searching ─────────────────────────────────────
  useEffect(() => {
    if (screen !== "searching") return;
    const tick = async () => {
      const [a, near] = await Promise.all([api.bookingActive().catch(() => null), api.bookingNearby().catch(() => null)]);
      if (near) setFreeDrivers(near.freeDrivers);
      setActive(a); // B: real status — searching → accepted (only when a driver actually takes it) → arrived
    };
    tick();
    const t = setInterval(tick, 12_000); // C: faster poll → smooth live car tracking + meter
    return () => clearInterval(t);
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

  const call = async () => {
    if (!pickup || busy) return;
    setBusy(true);
    haptic();
    try {
      const r = await api.bookingCreate({ pickupId: pickup.id, pickupName: pickup.name });
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
    await api.bookingCancel().catch(() => undefined);
    setScreen("map");
    setMsg(null);
    setBusy(false);
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
          <div className="b3-map-fallback-ico">🗺</div>
          <div>Xarita bu qurilmada ko'rinmadi</div>
          <div className="dim fs12">Buyurtma to'liq ishlaydi — pastdan davom eting 👇</div>
        </div>
      )}

      {msg && <div className="b3-msg" onClick={() => setMsg(null)}>{msg}</div>}

      {/* ── E1/E2: pickup selection sheet ── */}
      {screen === "map" && (
        <div className="b3-sheet">
          <div className="b3-grip" />
          <div className="b3-sheet-title">🚕 Taxi qayerga kelsin?</div>
          <input className="bk-input" placeholder="🔍 Manzil qidiring (xato yozsangiz ham topadi)" value={q} onChange={(e) => search(e.target.value)} />
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
              <div className="b3-search-title">
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
                <div className="b3-fare-row mt8"><span>🧮 Hisoblagich (jonli)</span><b>{formatNumber(active.driver.meterPayment)} so'm</b></div>
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
    </div>
  );
}
