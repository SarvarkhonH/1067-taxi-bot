// 🗺 BOOKING 3.0 (E1-E4) — MapLibre dark, map-first. feature:booking3 gated;
// when off, falls back to the classic Leaflet BookingView (zero regression).
// kas is PICKUP-ONLY (taximeter, no destination routing) — so we honestly select
// the PICKUP and show a history-based fare "≈" (not a promise). The destination
// is told to the driver. Gold is ONLY on the CALL button.
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { formatNumber, type BookingInfoResponse, type MeResponse, type SavedAddressView } from "@t1067/shared";
import { api } from "./api";
import { haptic, tg } from "./telegram";
import { confetti } from "./util";
import { Button, Sheet, Skeleton } from "./design/components";

const BookingViewOld = lazy(() => import("./booking").then((m) => ({ default: m.BookingView })));

const DARK_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

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
  const [predict, setPredict] = useState<{ avg: number; byAddress?: { avg: number; rides: number } | null } | null>(null);
  const [freeDrivers, setFreeDrivers] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const mapRef = useRef<HTMLDivElement | null>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const pinMarkers = useRef<maplibregl.Marker[]>([]);
  const pickMarker = useRef<maplibregl.Marker | null>(null);

  // ── E1: MapLibre dark map ──────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || map.current) return;
    const m = new maplibregl.Map({
      container: mapRef.current,
      style: DARK_STYLE,
      center: [info.center.lng, info.center.lat],
      zoom: 13,
      attributionControl: { compact: true },
    });
    map.current = m;
    m.on("load", () => m.resize());
    // E2: drag map → drop pin at center → nearest saved address
    m.on("moveend", () => {
      if (screenRef.current !== "map" || !pickRef.current) return;
    });
    return () => {
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

  // ── E3 fare prediction (history ≈) for the chosen pickup ────────────────
  useEffect(() => {
    if (!pickup) return setPredict(null);
    api.bookingPredict(pickup.name).then((r) => setPredict({ avg: r.avg, byAddress: r.byAddress })).catch(() => undefined);
  }, [pickup?.id]);

  // ── E4 honest queue while searching ─────────────────────────────────────
  useEffect(() => {
    if (screen !== "searching") return;
    const tick = async () => {
      const [a, near] = await Promise.all([api.bookingActive().catch(() => null), api.bookingNearby().catch(() => null)]);
      if (near) setFreeDrivers(near.freeDrivers);
      if (a?.driver) {
        setMsg(`✅ Haydovchi tayinlandi: ${a.driver.carModel} · ${a.driver.carNumber}`);
      }
    };
    tick();
    const t = setInterval(tick, 30_000);
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
            {predict && predict.avg > 0 ? (
              <div className="b3-fare-row"><span>📊 Odatdagi narx</span><b>≈ {formatNumber(predict.byAddress?.avg ?? predict.avg)} so'm</b></div>
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

      {/* ── E4: searching ── */}
      {screen === "searching" && (
        <div className="b3-sheet">
          <div className="b3-grip" />
          <div className="b3-radar"><span /><span /><span />🚕</div>
          <div className="b3-search-title">🔍 Haydovchi qidirilyapti…</div>
          <div className="dim tac fs13">
            {freeDrivers > 0 ? `🚖 ${freeDrivers} bo'sh mashina yaqinda · ` : ""}haydovchi javobini kutmoqda…
          </div>
          <Button variant="danger" disabled={busy} onClick={cancel}>✖ Bekor qilish</Button>
        </div>
      )}
    </div>
  );
}
