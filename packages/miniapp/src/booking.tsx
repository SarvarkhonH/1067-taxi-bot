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
import { Button, Sheet } from "./design/components";

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

// 📜 collapsed ride history under the address picker
function RideHistory() {
  const [rides, setRides] = useState<{ id: number; addressName: string; status: string; cashback: number; at: string }[] | null>(null);
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(10); // T2 (AUDIT 2.13): avval 10 ta, keyin "yana"
  useEffect(() => {
    api.bookingHistory().then(setRides).catch(() => setRides([]));
  }, []);
  if (!rides?.length) return null;
  return (
    <div className="mt6">
      <button className="btn-ghost" onClick={() => setOpen((v) => !v)}>
        {open ? "Yopish" : `📜 Oxirgi safarlar (${rides.length})`}
      </button>
      {open &&
        rides.slice(0, limit).map((r) => (
          <div key={r.id} className="mk-voucher">
            <span>{["delivered", "completed", "finished"].includes(r.status) ? "🏁" : "🚖"} {r.addressName}</span>
            <span className="muted">
              {r.at ? new Date(r.at).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }) : ""}
              {r.cashback ? ` · +${formatNumber(r.cashback)}` : ""}
            </span>
          </div>
        ))}
      {open && rides.length > limit && (
        <button className="btn-ghost" onClick={() => setLimit((n) => n + 10)}>
          Yana ({rides.length - limit})
        </button>
      )}
    </div>
  );
}

// ⏰ schedule + 👨‍👩‍👧 family block (shows when a pickup is chosen)
function ScheduleBlock({ pickup, onMsg }: { pickup: SavedAddressView; onMsg: (m: string) => void }) {
  const [data, setData] = useState<{ scheduled: { id: number; addressName: string; runAt: string }[]; family: { id: number; phone: string; name: string }[] } | null>(null);
  const [showTimes, setShowTimes] = useState(false);
  const [famSheet, setFamSheet] = useState(false);
  const [famPhone, setFamPhone] = useState("");
  const [famName, setFamName] = useState("");
  const load = () => api.bookingScheduled().then(setData).catch(() => undefined);
  useEffect(() => {
    load();
  }, []);

  const slots = (): { label: string; iso: string }[] => {
    const out: { label: string; iso: string }[] = [];
    const now = new Date();
    for (const h of [18, 20]) {
      const d = new Date(now); d.setHours(h, 0, 0, 0);
      if (d.getTime() > Date.now() + 20 * 60_000) out.push({ label: `Bugun ${h}:00`, iso: d.toISOString() });
    }
    for (const h of [7, 8, 12]) {
      const d = new Date(now); d.setDate(d.getDate() + 1); d.setHours(h, 0, 0, 0);
      out.push({ label: `Ertaga ${h}:00`, iso: d.toISOString() });
    }
    return out.slice(0, 5);
  };

  return (
    <div className="mt6">
      <div className="chip-row wrap">
        <button className="amt-chip" onClick={() => { haptic(); setShowTimes((v) => !v); }}>⏰ Keyinroqqa</button>
        {(data?.family ?? []).map((f) => (
          <button key={f.id} className="amt-chip" onClick={async () => {
            haptic();
            const r = await api.familyBook(f.id, pickup.id, pickup.name);
            onMsg(r.ok ? (r.message ?? `🚕 ${f.name}ga chaqirildi!`) : `⚠️ ${r.message ?? "Xatolik"}`);
          }}>👨‍👩‍👧 {f.name}ga</button>
        ))}
        {(data?.family ?? []).length < 3 && (
          <button className="amt-chip" onClick={() => setFamSheet(true)}>＋ Yaqin</button>
        )}
      </div>
      <Sheet open={famSheet} onClose={() => setFamSheet(false)}>
        <h3>👨‍👩‍👧 Yaqin qo'shish</h3>
        <p className="dim fs13">Taksi shu raqamga boradi — siz kuzatuv va cashback'ni o'zingizda saqlaysiz. Ko'pi bilan 3 ta.</p>
        <input className="bk-input" inputMode="tel" placeholder="Raqami: 90 123 45 67" value={famPhone} onChange={(e) => setFamPhone(e.target.value)} />
        <input className="bk-input mt6" placeholder="Ismi: Onam" value={famName} onChange={(e) => setFamName(e.target.value)} />
        <Button
          disabled={famPhone.replace(/\D/g, "").length < 9}
          onClick={async () => {
            const r = await api.familyAdd(famPhone, famName || "Yaqinim");
            onMsg(r.ok ? "✅ Yaqin qo'shildi" : r.reason === "self" ? "O'z raqamingiz" : r.reason === "max" ? "Ko'pi bilan 3 ta" : "Xatolik");
            setFamSheet(false);
            setFamPhone("");
            setFamName("");
            load();
          }}
        >
          Qo'shish
        </Button>
        <Button variant="ghost" onClick={() => setFamSheet(false)}>Bekor</Button>
      </Sheet>
      {showTimes && (
        <div className="chip-row wrap mt4">
          {slots().map((sl) => (
            <button key={sl.iso} className="amt-chip" onClick={async () => {
              haptic();
              const r = await api.bookingSchedule(pickup.id, pickup.name, sl.iso);
              onMsg(r.ok ? `⏰ Rejalandi: ${sl.label} — ${pickup.name}` : r.reason === "too_many" ? "Ko'pi bilan 3 ta reja" : "Xatolik");
              setShowTimes(false);
              load();
            }}>{sl.label}</button>
          ))}
        </div>
      )}
      {(data?.scheduled ?? []).map((r) => (
        <div key={r.id} className="muted fs12 between mt4">
          <span>⏰ {new Date(r.runAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} — {r.addressName}</span>
          <button className="bk-change" onClick={async () => { await api.bookingScheduleCancel(r.id); load(); }}>bekor</button>
        </div>
      ))}
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
  const [freeDrivers, setFreeDrivers] = useState(0);
  const [predict, setPredict] = useState<{ avg: number; byAddress?: { name: string; avg: number; rides: number } | null } | null>(null);
  const [rateFor, setRateFor] = useState<number | null>(null);
  const [stars, setStars] = useState(0);
  const [rateTags, setRateTags] = useState<string[]>([]);
  const nearbyMarkers = useRef<any[]>([]);
  const prevActiveId = useRef<number | null>(null);

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
    L.divIcon({ className: "", html: `<div class="pin-drop" style="font-size:26px;filter:drop-shadow(0 1px 2px ${color})">${emoji}</div>`, iconSize: [26, 26] });

  // place pickup marker + recenter
  useEffect(() => {
    const L = (window as any).L;
    if (!map.current || !L || !pickup?.lat || !pickup?.lng) return;
    const ll = [pickup.lat, pickup.lng];
    if (!pickMarker.current) pickMarker.current = L.marker(ll, { icon: pin(L, "#ffce4f", "🟡") }).addTo(map.current);
    else pickMarker.current.setLatLng(ll);
    map.current.panTo(ll);
  }, [pickup]);

  // E1: live free-car pins (45s refresh)
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const r = await api.bookingNearby().catch(() => null);
      if (!alive || !r) return;
      setFreeDrivers(r.freeDrivers);
      const L = (window as any).L;
      if (!map.current || !L) return;
      for (const mk of nearbyMarkers.current) mk.remove();
      nearbyMarkers.current = r.pins.slice(0, 20).map((d) =>
        L.marker([d.lat, d.lng], { icon: pin(L, d.busy ? "#666" : "#22c55e", d.busy ? "🚖" : "🟢") }).addTo(map.current),
      );
    };
    load();
    const t = setInterval(load, 45_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // E3: history-based fare prediction for the picked address
  useEffect(() => {
    if (!pickup) {
      setPredict(null);
      return;
    }
    api.bookingPredict(pickup.name).then((r) => setPredict({ avg: r.avg, byAddress: r.byAddress })).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickup?.id]);

  // E7: ride finished (active → null) → ask for stars
  useEffect(() => {
    if (active?.id) prevActiveId.current = active.id;
    else if (prevActiveId.current) {
      setRateFor(prevActiveId.current);
      prevActiveId.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);

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

  // 1-tap "1067 Now": silent best-effort GPS, server resolves the pickup
  const bookNow = async () => {
    if (busy) return;
    setBusy(true);
    haptic();
    const gps = await new Promise<{ lat?: number; lng?: number }>((resolve) => {
      let done = false;
      const finish = (v: { lat?: number; lng?: number }) => {
        if (!done) {
          done = true;
          resolve(v);
        }
      };
      if (!navigator.geolocation) return finish({});
      navigator.geolocation.getCurrentPosition(
        (p) => finish({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => finish({}),
        { timeout: 1500, maximumAge: 60000 },
      );
      setTimeout(() => finish({}), 1800);
    });
    try {
      const r = await api.bookingNow(gps);
      if (r.state === "dispatched" || r.state === "test") {
        setMsg(r.state === "test" ? "🧪 Buyurtma ko'rsatildi (test rejimi)." : `✅ Buyurtma qabul qilindi! 📍 ${r.pickupName ?? ""}`);
        const a = await api.bookingActive().catch(() => null);
        if (a) setActive(a);
      } else if (r.state === "active" && r.booking) {
        setActive(r.booking);
      } else if (r.state === "throttled") {
        setMsg(`⏳ ${r.message ?? "Bir daqiqa kuting"}`);
      } else if (r.state === "need_pickup") {
        setMsg("📍 Manzilni tanlang");
        if (r.suggestions?.length) setResults(r.suggestions);
      } else if (r.state === "confirm_required") {
        setMsg(`⚠️ ${r.message ?? "Manzilni tanlab tasdiqlang"}`);
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
        {rateFor && (
          <div className="sheet-back" onClick={() => setRateFor(null)}>
            <div className="sheet" onClick={(e) => e.stopPropagation()}>
              <div className="sheet-grip" />
              <h3>⭐ Safar qanday o'tdi?</h3>
              <div className="center g8 fs34 my10">
                {[1, 2, 3, 4, 5].map((n) => (
                  <span key={n} className={"pointer" + (n <= stars ? "" : " faded")} onClick={() => { haptic(); setStars(n); }}>⭐</span>
                ))}
              </div>
              <div className="chip-row wrap">
                {["Toza mashina", "Xushmuomala", "Tez yetib keldi", "Sekin haydadi", "Mashina eski"].map((tg) => (
                  <button key={tg} className={"amt-chip" + (rateTags.includes(tg) ? " active" : "")} onClick={() => setRateTags((pv) => (pv.includes(tg) ? pv.filter((x) => x !== tg) : [...pv, tg]))}>
                    {tg}
                  </button>
                ))}
              </div>
              <button className="btn-primary" disabled={!stars} onClick={async () => { await api.bookingRate(rateFor, stars, rateTags).catch(() => undefined); setRateFor(null); setStars(0); setRateTags([]); setMsg("🙏 Rahmat! Bahoyingiz haydovchi reytingiga qo'shildi."); }}>
                Yuborish
              </button>
              <button className="btn-ghost" onClick={() => setRateFor(null)}>O'tkazib yuborish</button>
            </div>
          </div>
        )}
        {active ? (
          <TrackingCard active={active} onCancel={cancel} busy={busy} />
        ) : !info ? (
          <div className="muted bk-loading">Yuklanmoqda…</div>
        ) : pickup ? (
          <>
            <div className="bk-picked">🟡 <b>{pickup.name}</b><button className="bk-change" onClick={() => setPickup(null)}>o'zgartirish</button></div>
            <ScheduleBlock pickup={pickup} onMsg={setMsg} />
            {quote ? (
              <div className="bk-fare">
                <div className="bk-fare-row"><span>📏 ~{quote.km} km</span><b>≈ {formatNumber(quote.total)} so'm</b></div>
                <div className="muted bk-fare-sub">Bazaviy {formatNumber(quote.base)} + masofa{quote.surcharge ? ` + ${formatNumber(quote.surcharge)} qo'shimcha` : ""}</div>
              </div>
            ) : (
              <div className="muted bk-fare-hint">📍 Borar manzilni xaritada belgilang — narxni ko'rasiz (ixtiyoriy)</div>
            )}
            {predict && (
              <div className="muted fs12 tac mt4">
                📊 {predict.byAddress ? `${predict.byAddress.name}: odatda ~${formatNumber(predict.byAddress.avg)} so'm` : `Kosonda o'rtacha safar ~${formatNumber(predict.avg)} so'm`}
                {freeDrivers > 0 ? ` · 🟢 bo'sh: ${freeDrivers}` : ""}
              </div>
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
            {info.quickPickup && (
              <button className="btn-primary bk-hero" disabled={busy} onClick={bookNow}>
                {busy ? "⏳ Yuborilyapti…" : `🚕 Hozir chaqirish — ${info.quickPickup.name}`}
              </button>
            )}
            <div className="muted bk-fare-hint">{info.quickPickup ? "yoki boshqa manzildan:" : "Qayerdan olib ketamiz?"}</div>
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
            <RideHistory />
          </>
        )}
      </div>
    </div>
  );
}
