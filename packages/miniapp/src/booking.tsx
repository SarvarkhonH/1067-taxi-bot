import { useEffect, useRef, useState } from "react";
import {
  BOOKING_STEPS,
  bookingStepIndex,
  formatNumber,
  haversineKm,
  type ActiveBookingView,
  type BookingInfoResponse,
  type FareQuote,
  type SavedAddressView,
} from "@t1067/shared";
import { api } from "./api";
import { ensureLeaflet } from "./leaflet";
import { haptic } from "./telegram";

/* eslint-disable @typescript-eslint/no-explicit-any */

function Timeline({ status }: { status: string }) {
  const step = bookingStepIndex(status);
  return (
    <div className="bk-timeline">
      {BOOKING_STEPS.map((s, i) => (
        <div key={s} className={"bk-step" + (i <= step ? " on" : "")}>
          <div className="bk-dot" />
          <span>{s}</span>
        </div>
      ))}
    </div>
  );
}

function TrackingCard({ active, onCancel, busy }: { active: ActiveBookingView; onCancel: () => void; busy: boolean }) {
  const d = active.driver;
  return (
    <div className="glass pad bk-driver">
      <div className="bk-status">
        {active.statusLabel}
        {active.etaMin != null && d && <span className="bk-eta"> · ~{active.etaMin} daq</span>}
      </div>
      <Timeline status={active.status} />
      {d ? (
        <div className="bk-driver-row">
          <div className="bk-driver-emoji">🚗</div>
          <div className="bk-driver-info">
            <div className="bk-driver-name">{d.fullName} · {d.carModel}</div>
            <div className="muted">{d.carNumber} {d.rating > 0 && `· ⭐ ${d.rating.toFixed(1)}`}</div>
          </div>
          {d.phone && <a className="bk-call" href={`tel:${d.phone}`}>📞</a>}
        </div>
      ) : (
        <div className="muted bk-searching">⏳ Haydovchi qidirilyapti…</div>
      )}
      {active.cashback > 0 && <div className="bk-cashback">💰 Bu safardan: +{formatNumber(active.cashback)} so'm cashback</div>}
      {active.canCancel && (
        <button className="bk-cancel" disabled={busy} onClick={onCancel}>{busy ? "…" : "✖ Bekor qilish"}</button>
      )}
    </div>
  );
}

export function BookingView({ onClose }: { onClose: () => void }) {
  const [info, setInfo] = useState<BookingInfoResponse | null>(null);
  const [active, setActive] = useState<ActiveBookingView | null>(null);
  const [pickup, setPickup] = useState<SavedAddressView | null>(null);
  const [dest, setDest] = useState<{ lat: number; lng: number } | null>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SavedAddressView[]>([]);
  const [addons, setAddons] = useState<number[]>([]);
  const [car, setCar] = useState<number | null>(null);
  const [quote, setQuote] = useState<FareQuote | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const mapRef = useRef<HTMLDivElement | null>(null);
  const map = useRef<any>(null);
  const pickMarker = useRef<any>(null);
  const destMarker = useRef<any>(null);
  const driverMarker = useRef<any>(null);

  useEffect(() => {
    let alive = true;
    api.bookingInfo().then((r) => {
      if (!alive || "error" in r) return;
      setInfo(r);
      setActive(r.active);
      ensureLeaflet().then((L: any) => {
        if (!alive || !mapRef.current || map.current) return;
        const m = L.map(mapRef.current, { zoomControl: false, attributionControl: false }).setView([r.center.lat, r.center.lng], 13);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(m);
        if (r.serviceArea.length >= 3) L.polygon(r.serviceArea.map((p) => [p.lat, p.lng]), { color: "#ffce4f", weight: 2, fillOpacity: 0.05 }).addTo(m);
        // tap map = drop destination pin (for fare estimate)
        m.on("click", (e: any) => {
          if (mapStateRef.current.active) return;
          const ll = { lat: e.latlng.lat, lng: e.latlng.lng };
          setDest(ll);
          if (!destMarker.current) destMarker.current = L.marker([ll.lat, ll.lng], { icon: pin(L, "#22d3ee", "📍") }).addTo(m);
          else destMarker.current.setLatLng([ll.lat, ll.lng]);
        });
        map.current = m;
        setTimeout(() => m.invalidateSize(), 200);
      });
    });
    return () => {
      alive = false;
    };
  }, []);

  // keep a ref of whether a booking is active (so the click handler can read it)
  const mapStateRef = useRef({ active: false });
  useEffect(() => {
    mapStateRef.current.active = !!active;
  }, [active]);

  const pin = (L: any, color: string, emoji: string) =>
    L.divIcon({ className: "", html: `<div style="font-size:26px;filter:drop-shadow(0 1px 2px ${color})">${emoji}</div>`, iconSize: [26, 26] });

  // place pickup marker + recenter
  useEffect(() => {
    const L = (window as any).L;
    if (!map.current || !L || !pickup?.lat || !pickup?.lng) return;
    const ll = [pickup.lat, pickup.lng];
    if (!pickMarker.current) pickMarker.current = L.marker(ll, { icon: pin(L, "#ffce4f", "🟡") }).addTo(map.current);
    else pickMarker.current.setLatLng(ll);
    map.current.panTo(ll);
  }, [pickup]);

  // fare estimate when pickup + dest set
  useEffect(() => {
    if (pickup?.lat && pickup?.lng && dest) {
      api.bookingEstimate({ lat: pickup.lat, lng: pickup.lng }, dest, addonSum() + (pickup.surcharge ?? 0)).then(setQuote).catch(() => undefined);
    } else {
      setQuote(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickup, dest, addons]);

  // poll active booking → move driver marker
  useEffect(() => {
    if (!active) return;
    const tick = async () => {
      const a = await api.bookingActive().catch(() => null);
      setActive(a);
      const L = (window as any).L;
      if (a?.driver && map.current && L) {
        const ll = [a.driver.lat, a.driver.lng];
        if (!driverMarker.current) driverMarker.current = L.marker(ll, { icon: pin(L, "#ffce4f", "🚕") }).addTo(map.current);
        else driverMarker.current.setLatLng(ll);
        map.current.panTo(ll);
      }
    };
    const t = setInterval(tick, 3000);
    return () => clearInterval(t);
  }, [active?.id]);

  const addonSum = () => (info ? info.addons.filter((a) => addons.includes(a.id)).reduce((s, a) => s + a.price, 0) : 0);
  const toggleAddon = (id: number) => setAddons((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const search = async (text: string) => {
    setQ(text);
    if (text.trim().length < 2) return setResults([]);
    setResults(await api.bookingSearch(text).catch(() => []));
  };

  const book = async () => {
    if (!pickup || busy) return;
    setBusy(true);
    haptic();
    try {
      const r = await api.bookingCreate({ pickupId: pickup.id, pickupName: pickup.name, addonIds: addons, carCategory: car ?? undefined });
      if (r.ok) {
        setMsg(r.live ? "✅ Buyurtma qabul qilindi! Haydovchi qidirilyapti…" : "🧪 Buyurtma ko'rsatildi (test rejimi).");
        setPickup(null); setDest(null); setQ(""); setResults([]); setAddons([]);
        const a = await api.bookingActive().catch(() => null);
        if (a) setActive(a);
      } else setMsg(`⚠️ ${r.message ?? "Yuborilmadi"}`);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setBusy(true);
    haptic();
    try {
      const r = await api.bookingCancel();
      if (r.ok) {
        setMsg("✖ Buyurtma bekor qilindi");
        setActive(null);
        if (driverMarker.current && map.current) { map.current.removeLayer(driverMarker.current); driverMarker.current = null; }
      } else setMsg(r.reason === "too_late" ? "Haydovchi keldi — bekor qilib bo'lmaydi" : "Bekor qilinmadi");
    } finally {
      setBusy(false);
    }
  };

  const list = results.length ? results : info?.savedAddresses ?? [];

  return (
    <div className="bk-screen">
      <div className="bk-bar">
        <button className="btn-ghost bk-back" onClick={onClose}>←</button>
        <div className="bk-title">🚖 Taxi chaqirish</div>
      </div>
      <div ref={mapRef} className="bk-map" />

      <div className="bk-sheet">
        {msg && <div className="bk-msg" onClick={() => setMsg(null)}>{msg}</div>}
        {active ? (
          <TrackingCard active={active} onCancel={cancel} busy={busy} />
        ) : !info ? (
          <div className="muted bk-loading">Yuklanmoqda…</div>
        ) : pickup ? (
          <>
            <div className="bk-picked">🟡 <b>{pickup.name}</b><button className="bk-change" onClick={() => setPickup(null)}>o'zgartirish</button></div>
            {quote ? (
              <div className="bk-fare">
                <div className="bk-fare-row"><span>📏 ~{quote.km} km</span><b>≈ {formatNumber(quote.total)} so'm</b></div>
                <div className="muted bk-fare-sub">Bazaviy {formatNumber(quote.base)} + masofa{quote.surcharge ? ` + ${formatNumber(quote.surcharge)} qo'shimcha` : ""}</div>
              </div>
            ) : (
              <div className="muted bk-fare-hint">📍 Borar manzilni xaritada belgilang — narxni ko'rasiz (ixtiyoriy)</div>
            )}
            {info.cars.length > 0 && (
              <div className="bk-cars">
                {info.cars.slice(0, 8).map((c) => (
                  <button key={c.id} className={"bk-car" + (car === c.id ? " on" : "")} onClick={() => setCar(car === c.id ? null : c.id)}>🚘 {c.name}</button>
                ))}
              </div>
            )}
            {info.addons.length > 0 && (
              <div className="bk-addons">
                {info.addons.map((a) => (
                  <button key={a.id} className={"bk-addon" + (addons.includes(a.id) ? " on" : "")} onClick={() => toggleAddon(a.id)}>
                    {addons.includes(a.id) ? "✅" : "➕"} {a.name} <span className="muted">+{formatNumber(a.price)}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="bk-earn">💰 +{formatNumber(info.cashbackPerRide)} so'm cashback</div>
            <button className="btn-primary" disabled={busy} onClick={book}>{busy ? "…" : "🚕 Chaqirish"}</button>
          </>
        ) : (
          <>
            <div className="muted bk-fare-hint">Qayerdan olib ketamiz?</div>
            <button
              className="btn-primary bk-gps"
              onClick={() => {
                haptic();
                navigator.geolocation?.getCurrentPosition(
                  (pos) => {
                    const me = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                    const withCoords = (info?.savedAddresses ?? []).filter((a) => a.lat != null && a.lng != null);
                    let best: SavedAddressView | null = null;
                    let bestKm = 1.5;
                    for (const a of withCoords) {
                      const km = haversineKm(me, { lat: a.lat!, lng: a.lng! });
                      if (km < bestKm) { bestKm = km; best = a; }
                    }
                    if (best) setPickup(best);
                    else setMsg("📍 Yaqin saqlangan manzil topilmadi — yozib qidiring");
                  },
                  () => setMsg("📍 Joylashuvga ruxsat berilmadi"),
                );
              }}
            >
              📍 Mening joylashuvim
            </button>
            <input className="bk-input" placeholder="📍 yoki manzilni yozing…" value={q} onChange={(e) => search(e.target.value)} />
            {list.map((a) => (
              <button key={`${a.id}-${a.name}`} className="glass bk-addr" onClick={() => { haptic(); setPickup(a); }}>
                <span className="bk-addr-pin">{results.length ? "📍" : "⭐"}</span>{a.name}
                {a.surcharge ? <span className="muted bk-addr-sur">+{formatNumber(a.surcharge)}</span> : null}
              </button>
            ))}
            {!list.length && <div className="muted bk-loading">Manzilni yozib qidiring</div>}
          </>
        )}
      </div>
    </div>
  );
}
