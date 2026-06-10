import { useEffect, useRef, useState } from "react";
import {
  BOOKING_STEPS,
  bookingStepIndex,
  formatNumber,
  type ActiveBookingView,
  type BookingInfoResponse,
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

function DriverCard({ active }: { active: ActiveBookingView }) {
  const d = active.driver;
  return (
    <div className="glass pad bk-driver">
      <div className="bk-status">{active.statusLabel}</div>
      <Timeline status={active.status} />
      {d ? (
        <div className="bk-driver-row">
          <div className="bk-driver-emoji">🚗</div>
          <div className="bk-driver-info">
            <div className="bk-driver-name">{d.fullName} · {d.carModel}</div>
            <div className="muted">{d.carNumber} {d.rating > 0 && `· ⭐ ${d.rating.toFixed(1)}`}</div>
          </div>
          {d.phone && (
            <a className="bk-call" href={`tel:${d.phone}`}>📞</a>
          )}
        </div>
      ) : (
        <div className="muted bk-searching">⏳ Haydovchi qidirilyapti…</div>
      )}
      {active.cashback > 0 && <div className="bk-cashback">💰 Bu safardan: +{formatNumber(active.cashback)} so'm cashback</div>}
    </div>
  );
}

export function BookingView({ onClose }: { onClose: () => void }) {
  const [info, setInfo] = useState<BookingInfoResponse | null>(null);
  const [active, setActive] = useState<ActiveBookingView | null>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SavedAddressView[]>([]);
  const [picked, setPicked] = useState<SavedAddressView | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapObj = useRef<any>(null);
  const driverMarker = useRef<any>(null);

  // load info + init map
  useEffect(() => {
    let alive = true;
    api.bookingInfo().then((r) => {
      if (!alive || "error" in r) return;
      setInfo(r);
      setActive(r.active);
      ensureLeaflet().then((L: any) => {
        if (!alive || !mapRef.current || mapObj.current) return;
        const map = L.map(mapRef.current, { zoomControl: false, attributionControl: false }).setView([r.center.lat, r.center.lng], 13);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
        if (r.serviceArea.length >= 3) {
          L.polygon(r.serviceArea.map((p) => [p.lat, p.lng]), { color: "#ffce4f", weight: 2, fillOpacity: 0.06 }).addTo(map);
        }
        L.circleMarker([r.center.lat, r.center.lng], { radius: 7, color: "#22d3ee", fillOpacity: 1 }).addTo(map);
        mapObj.current = map;
        setTimeout(() => map.invalidateSize(), 200);
      });
    });
    return () => {
      alive = false;
    };
  }, []);

  // poll active booking → move driver marker
  useEffect(() => {
    if (!active) return;
    const tick = async () => {
      const a = await api.bookingActive().catch(() => null);
      setActive(a);
      const L = (window as any).L;
      if (a?.driver && mapObj.current && L) {
        const ll = [a.driver.lat, a.driver.lng];
        if (!driverMarker.current) {
          driverMarker.current = L.marker(ll, {
            icon: L.divIcon({ className: "", html: "<div style='font-size:26px'>🚕</div>", iconSize: [26, 26] }),
          }).addTo(mapObj.current);
        } else {
          driverMarker.current.setLatLng(ll);
        }
        mapObj.current.panTo(ll);
      }
    };
    const t = setInterval(tick, 8000);
    return () => clearInterval(t);
  }, [active?.id]);

  const search = async (text: string) => {
    setQ(text);
    if (text.trim().length < 2) {
      setResults([]);
      return;
    }
    const r = await api.bookingSearch(text).catch(() => []);
    setResults(r);
  };

  const book = async () => {
    if (!picked || busy) return;
    setBusy(true);
    haptic();
    try {
      const r = await api.bookingCreate(picked.id, picked.name);
      if (r.ok) {
        setMsg(r.live ? "✅ Buyurtma qabul qilindi! Haydovchi qidirilyapti…" : "🧪 TEST rejimi — buyurtma ko'rsatildi (haqiqiy chaqirilmadi).");
        setPicked(null);
        setQ("");
        setResults([]);
        const a = await api.bookingActive().catch(() => null);
        if (a) setActive(a);
      } else {
        setMsg(`⚠️ ${r.message ?? "Yuborilmadi"}`);
      }
    } finally {
      setBusy(false);
    }
  };

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
          <DriverCard active={active} />
        ) : !info ? (
          <div className="muted bk-loading">Yuklanmoqda…</div>
        ) : (
          <>
            {info.cashbackPerRide > 0 && <div className="bk-earn">💰 Bu safardan +{formatNumber(info.cashbackPerRide)} so'm cashback</div>}
            {picked ? (
              <div className="glass pad bk-confirm">
                <div className="bk-confirm-addr">📍 {picked.name}</div>
                <div className="bk-confirm-row">
                  <button className="btn-ghost" onClick={() => setPicked(null)}>O'zgartirish</button>
                  <button className="btn-primary" disabled={busy} onClick={book}>{busy ? "…" : "🚕 Chaqirish"}</button>
                </div>
              </div>
            ) : (
              <>
                <input className="bk-input" placeholder="📍 Manzilni yozing…" value={q} onChange={(e) => search(e.target.value)} />
                {(results.length ? results : info.savedAddresses).map((a) => (
                  <button key={a.id} className="glass bk-addr" onClick={() => { haptic(); setPicked(a); }}>
                    <span className="bk-addr-pin">{results.length ? "📍" : "⭐"}</span>
                    {a.name}
                  </button>
                ))}
                {!results.length && !info.savedAddresses.length && <div className="muted bk-loading">Manzilni yozib qidiring</div>}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
