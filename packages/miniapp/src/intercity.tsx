// 🚐 Yo'l — nationwide intercity seat booking (rider side). Pick from/to city + day →
// see open trips → book a seat (cash on board). Active bookings shown below.
// Gated by feature `intercity` (the tab only renders when me.flags.intercity is on).
import { useEffect, useState } from "react";
import { api, type IntercityCity, type IntercityTripRow, type IntercityBookingRow } from "./api";
import { haptic } from "./telegram";

const TK = 5 * 3_600_000; // Tashkent = UTC+5

function tkDateStr(offsetDays: number): string {
  const d = new Date(Date.now() + TK);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}
function fmtTime(iso: string): string {
  const tk = new Date(new Date(iso).getTime() + TK);
  return `${String(tk.getUTCHours()).padStart(2, "0")}:${String(tk.getUTCMinutes()).padStart(2, "0")}`;
}
function driverName(d: { displayName: string | null; fullName: string | null }): string {
  return d.displayName || d.fullName || "Haydovchi";
}
function bookErr(code?: string): string {
  switch (code) {
    case "no_seats": return "O'rin qolmadi 😔";
    case "trip_closed": return "Reys yopilgan";
    case "own_trip": return "Bu sizning reysingiz";
    case "feature_off": return "Hozircha mavjud emas";
    case "insufficient_tanga": return "Tanga yetarli emas";
    default: return "Band qilib bo'lmadi";
  }
}
const STATUS_UZ: Record<string, string> = {
  CONFIRMED: "Tasdiqlangan", PREPAY_PENDING: "To'lov kutilmoqda", COMPLETED: "Yakunlangan",
  CANCELLED_BY_DRIVER: "Haydovchi bekor qildi", RIDER_CANCELLED: "Bekor qilingan", RIDER_CANCELLED_LATE: "Bekor qilingan",
};

export function IntercityView() {
  const [fromCity, setFromCity] = useState<IntercityCity | null>(null);
  const [toCity, setToCity] = useState<IntercityCity | null>(null);
  const [day, setDay] = useState(0); // 0 = bugun, 1 = ertaga
  const [picking, setPicking] = useState<null | "from" | "to">(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<IntercityCity[]>([]);
  const [searching, setSearching] = useState(false);
  const [trips, setTrips] = useState<IntercityTripRow[] | null>(null);
  const [loadingTrips, setLoadingTrips] = useState(false);
  const [booking, setBooking] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [mybk, setMybk] = useState<IntercityBookingRow[] | null>(null);

  const loadActive = () => api.icMyActive().then(setMybk).catch(() => setMybk([]));
  useEffect(() => { loadActive(); }, []);

  // debounced city search while a picker is open
  useEffect(() => {
    if (picking === null) return;
    let on = true;
    setSearching(true);
    const t = setTimeout(() => {
      api.icCities(q).then((r) => { if (on) setResults(r); }).catch(() => { if (on) setResults([]); }).finally(() => { if (on) setSearching(false); });
    }, 220);
    return () => { on = false; clearTimeout(t); };
  }, [q, picking]);

  const openPick = (w: "from" | "to") => { haptic(); setPicking(w); setQ(""); setResults([]); };
  const pick = (c: IntercityCity) => { haptic(); if (picking === "from") setFromCity(c); else setToCity(c); setPicking(null); setTrips(null); };

  const search = async () => {
    if (!fromCity || !toCity) return;
    haptic(); setLoadingTrips(true); setTrips(null); setMsg(null);
    try { setTrips(await api.icTrips(fromCity.id, toCity.id, tkDateStr(day))); }
    catch { setTrips([]); }
    finally { setLoadingTrips(false); }
  };

  const book = async (tripId: number) => {
    haptic(); setBooking(tripId); setMsg(null);
    try {
      const r = await api.icBook(tripId, 1, "CASH");
      if (r.ok) {
        setMsg(r.duplicate ? "Allaqachon band qilgansiz" : "✅ O'rin band qilindi! To'lov — mashinada, naqd.");
        loadActive();
        if (fromCity && toCity) search();
      } else setMsg(bookErr(r.error));
    } catch { setMsg("Xatolik — qayta urinib ko'ring"); }
    finally { setBooking(null); }
  };

  const cancel = async (bookingId: number) => {
    haptic(); setMsg(null);
    try { const r = await api.icCancel(bookingId); setMsg(r.ok ? "Bekor qilindi" : "Bekor qilib bo'lmadi"); loadActive(); }
    catch { setMsg("Xatolik"); }
  };

  // ── city picker panel ───────────────────────────────────────────────────────
  if (picking !== null) {
    return (
      <div className="view">
        <section>
          <div className="between">
            <div className="section-title">{picking === "from" ? "Qayerdan" : "Qayerga"}</div>
            <button className="d-link" onClick={() => { haptic(); setPicking(null); }}>Bekor</button>
          </div>
        </section>
        <section>
          <input className="ic-input" autoFocus value={q} placeholder="Shahar nomini yozing…" onChange={(e) => setQ(e.target.value)} />
          <div className="ic-results">
            {searching && results.length === 0 ? (
              <><div className="d-skel mt8" /><div className="d-skel mt8" /><div className="d-skel mt8" /></>
            ) : results.length === 0 ? (
              <div className="d-empty"><div className="d-empty-ico">🔍</div>Shahar topilmadi</div>
            ) : (
              results.map((c) => (
                <button key={c.id} className="b3-result" onClick={() => pick(c)}>
                  {c.name}{c.nameRu ? <span className="dim"> · {c.nameRu}</span> : null}
                </button>
              ))
            )}
          </div>
        </section>
      </div>
    );
  }

  // ── main: search form + results + my bookings ───────────────────────────────
  return (
    <div className="view">
      <section>
        <div className="section-title">🚐 Yo'l — shaharlararo</div>
        <div className="dim fs13 mt4">Viloyatlararo safar — o'rindiq band qiling, to'lov mashinada.</div>
      </section>

      <section className="d-card">
        <div className="col g8">
          <button className="ic-pick" onClick={() => openPick("from")}>
            <span className="ic-pick-ico">📍</span>
            <span className={"ic-pick-val" + (fromCity ? "" : " empty")}>{fromCity ? fromCity.name : "Qayerdan?"}</span>
          </button>
          <button className="ic-pick" onClick={() => openPick("to")}>
            <span className="ic-pick-ico">🎯</span>
            <span className={"ic-pick-val" + (toCity ? "" : " empty")}>{toCity ? toCity.name : "Qayerga?"}</span>
          </button>
        </div>
        <div className="row g8 mt10">
          <button className={"d-chip" + (day === 0 ? " on" : "")} onClick={() => { haptic(); setDay(0); setTrips(null); }}>Bugun</button>
          <button className={"d-chip" + (day === 1 ? " on" : "")} onClick={() => { haptic(); setDay(1); setTrips(null); }}>Ertaga</button>
        </div>
        <button className="d-btn mt12" disabled={!fromCity || !toCity || loadingTrips} onClick={search}>
          {loadingTrips ? "Qidirilmoqda…" : "🔎 Reys qidirish"}
        </button>
      </section>

      {msg && <section><div className="ic-msg">{msg}</div></section>}

      {loadingTrips && (
        <section className="d-card"><div className="d-skel" /><div className="d-skel mt8" /></section>
      )}

      {trips !== null && !loadingTrips && (
        trips.length === 0 ? (
          <section><div className="d-empty"><div className="d-empty-ico">🚐</div>Bu yo'nalishda ochiq reys yo'q.<br />Keyinroq urinib ko'ring.</div></section>
        ) : (
          trips.map((t) => (
            <section className="d-card ic-trip" key={t.id}>
              <div className="ic-trip-top">
                <span className="ic-trip-route">{t.originCity.name} → {t.destCity.name}</span>
                <span className="ic-trip-time">🕐 {fmtTime(t.scheduledAt)}</span>
              </div>
              <div className="ic-trip-meta">
                <span className="ic-seat">💺 {t.carCapacity - t.bookedSeats} o'rin</span>
                <span>👤 {driverName(t.driver)}</span>
                {t.driver.carNumber ? <span>🚗 {t.driver.carNumber}</span> : null}
              </div>
              <div className="between mt4">
                <span className="ic-fare">{t.fareSom.toLocaleString("ru-RU")} <small>so'm · naqd</small></span>
                <button className="d-btn sm" disabled={booking === t.id} onClick={() => book(t.id)}>
                  {booking === t.id ? "…" : "Band qilish"}
                </button>
              </div>
            </section>
          ))
        )
      )}

      {/* Mening reyslarim (faol bronlar) */}
      {mybk && mybk.length > 0 && (
        <>
          <section><div className="section-title">Mening reyslarim</div></section>
          {mybk.map((b) => (
            <section className="d-card ic-bk" key={b.id}>
              <div className="ic-bk-meta">
                <div className="ic-bk-route">{b.trip.originCity.name} → {b.trip.destCity.name}</div>
                <div className="ic-bk-status">🕐 {fmtTime(b.trip.scheduledAt)} · {b.agreedFareSom.toLocaleString("ru-RU")} so'm · {STATUS_UZ[b.status] ?? b.status}</div>
              </div>
              {(b.status === "CONFIRMED" || b.status === "PREPAY_PENDING") && b.trip.status !== "DEPARTED" && (
                <button className="d-btn ghost sm" onClick={() => cancel(b.id)}>Bekor</button>
              )}
            </section>
          ))}
        </>
      )}
    </div>
  );
}
