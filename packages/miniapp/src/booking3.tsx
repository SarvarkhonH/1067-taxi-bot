// 🗺 BOOKING 3.0 (E1-E4) — MapLibre dark, map-first. feature:booking3 gated;
// when off, falls back to the classic Leaflet BookingView (zero regression).
// kas is PICKUP-ONLY (taximeter, no destination routing) — so we honestly select
// the PICKUP and show a history-based fare "≈" (not a promise). The destination
// is told to the driver. Gold is ONLY on the CALL button.
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { formatNumber, type ActiveBookingView, type BookingInfoResponse, type MeResponse, type SavedAddressView } from "@t1067/shared";
import { api } from "./api";
import { haptic, tg } from "./telegram";
import { confetti } from "./util";
import { Button, Sheet, Skeleton } from "./design/components";

const BookingViewOld = lazy(() => import("./booking").then((m) => ({ default: m.BookingView })));

const DARK_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

// D: the map must NEVER be a blank canvas. Detect WebGL up front (low-end devices / some
// Telegram WebViews lack it); ?nomap=1 forces the fallback for testing. If WebGL is missing
// OR the style fails to load, we show a clear placeholder — the booking flow stays fully usable.
function webglOk(): boolean {
  try {
    if (new URLSearchParams(location.search).get("nomap") === "1") return false;
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl")));
  } catch {
    return false;
  }
}

type Screen = "map" | "confirm" | "searching";

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
  const map = useRef<maplibregl.Map | null>(null);
  const pinMarkers = useRef<maplibregl.Marker[]>([]);
  const pickMarker = useRef<maplibregl.Marker | null>(null);
  const driverMarker = useRef<maplibregl.Marker | null>(null);
  const [mapOk] = useState(webglOk); // WebGL available? (computed once)
  const [mapFailed, setMapFailed] = useState(false); // style/CDN failed to load

  // ── E1: MapLibre dark map ──────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || map.current || !mapOk) return; // D: no WebGL → skip init, show placeholder
    const m = new maplibregl.Map({
      container: mapRef.current,
      style: DARK_STYLE,
      center: [info.center.lng, info.center.lat],
      zoom: 13,
      attributionControl: { compact: true },
    });
    map.current = m;
    // D: if the style/tiles never load (CDN blocked / offline), show the placeholder, not a blank
    const failTimer = setTimeout(() => setMapFailed(true), 8000);
    m.on("load", () => {
      clearTimeout(failTimer);
      setMapFailed(false);
      m.resize();
    });
    // E2: drag map → drop pin at center → nearest saved address
    m.on("moveend", () => {
      if (screenRef.current !== "map" || !pickRef.current) return;
    });
    return () => {
      clearTimeout(failTimer);
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const screenRef = useRef(screen);
  const pickRef = useRef(pickup);
  useEffect(() => {
    screenRef.current = screen;
    pickRef.current = pickup;
  }, [screen, pickup]);

  // ── E1 live pins (free cars), 45s, glide via marker setLngLat transition ──
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const r = await api.bookingNearby().catch(() => null);
      if (!alive || !r || !map.current) return;
      setFreeDrivers(r.freeDrivers);
      for (const mk of pinMarkers.current) mk.remove();
      pinMarkers.current = r.pins.slice(0, 20).map((d) => {
        const el = document.createElement("div");
        el.className = "b3-pin" + (d.busy ? " busy" : "");
        el.textContent = d.busy ? "🚖" : "🟢";
        return new maplibregl.Marker({ element: el }).setLngLat([d.lng, d.lat]).addTo(map.current!);
      });
    };
    load();
    const t = setInterval(load, 45_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  // place pickup marker + recenter
  useEffect(() => {
    if (!map.current || !pickup?.lat || !pickup?.lng) return;
    const el = document.createElement("div");
    el.className = "b3-pickpin pin-drop";
    el.textContent = "📍";
    if (pickMarker.current) pickMarker.current.remove();
    pickMarker.current = new maplibregl.Marker({ element: el }).setLngLat([pickup.lng, pickup.lat]).addTo(map.current);
    map.current.easeTo({ center: [pickup.lng, pickup.lat], zoom: 15, duration: 500 });
  }, [pickup]);

  // ── C: live assigned-driver car marker — moves toward you + rotates by bearing ──
  useEffect(() => {
    const d = active?.driver;
    if (!map.current || !d?.lat || !d?.lng) {
      if (driverMarker.current) { driverMarker.current.remove(); driverMarker.current = null; }
      return;
    }
    if (!driverMarker.current) {
      const el = document.createElement("div");
      el.className = "b3-carpin"; // CSS transition glides the position between polls
      el.innerHTML = '<span class="b3-carpin-i">🚖</span>';
      driverMarker.current = new maplibregl.Marker({ element: el }).setLngLat([d.lng, d.lat]).addTo(map.current);
    } else {
      driverMarker.current.setLngLat([d.lng, d.lat]);
    }
    const inner = driverMarker.current.getElement().querySelector(".b3-carpin-i") as HTMLElement | null;
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
              <div className="b3-picked">🚘 <b>{active.driver.carModel} · {active.driver.carNumber}</b>{active.driver.rating ? ` ⭐${active.driver.rating.toFixed(1)}` : ""}</div>
              <div className="dim tac fs13">
                {active.status === "arrived"
                  ? "Mashina sizni kutmoqda"
                  : active.status === "called"
                    ? "📞 Haydovchi qo'ng'iroq qilishi mumkin"
                    : "🚖 Haydovchi yo'lda"}
                {active.etaMin ? ` · ~${active.etaMin} daq` : ""}
              </div>
              {active.driver.meterPayment ? (
                <div className="b3-fare-row mt8"><span>🧮 Hisoblagich (jonli)</span><b>{formatNumber(active.driver.meterPayment)} so'm</b></div>
              ) : null}
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
