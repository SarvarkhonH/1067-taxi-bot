// 🚐 Yo'l — nationwide intercity. Riders search + book seats; drivers publish + manage
// trips (depart/arrive/cancel) and view the passenger manifest. Branches on me.type.
// Gated by feature `intercity` (the tab only renders when me.flags.intercity is on).
import { useEffect, useState } from "react";
import { api, type IntercityCity, type IntercityTripRow, type IntercityBookingRow, type IntercityDriverTrip, type IntercityManifest } from "./api";
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
function fmtDateTime(iso: string): string {
  const tk = new Date(new Date(iso).getTime() + TK);
  return `${tk.getUTCDate()}.${String(tk.getUTCMonth() + 1).padStart(2, "0")} ${fmtTime(iso)}`;
}
function buildTashkent(tomorrow: boolean, hh: number, mm: number): Date | null {
  if (hh > 23 || mm > 59) return null;
  const nowTk = new Date(Date.now() + TK);
  return new Date(Date.UTC(nowTk.getUTCFullYear(), nowTk.getUTCMonth(), nowTk.getUTCDate() + (tomorrow ? 1 : 0), hh, mm, 0) - TK);
}
function parseWhen(text: string): Date | null {
  const t = text.toLowerCase();
  const tomorrow = t.includes("ertaga");
  const m = t.match(/(\d{1,2})[:.\s](\d{2})/);
  if (m) return buildTashkent(tomorrow, parseInt(m[1] ?? "", 10), parseInt(m[2] ?? "", 10));
  const h = t.match(/\b(\d{1,2})\b/);
  return h ? buildTashkent(tomorrow, parseInt(h[1] ?? "", 10), 0) : null;
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
    case "debt_cap": return "Qarzingiz limitdan oshgan — avval to'lang";
    case "same_city": return "Bir xil shahar tanlandi";
    case "bad_time": return "Vaqt noto'g'ri";
    default: return "Amal bajarilmadi";
  }
}
const STATUS_UZ: Record<string, string> = {
  OPEN: "Ochiq", BOARDING: "Kutilmoqda", DEPARTED: "Yo'lda", COMPLETED: "Yakunlangan",
  CONFIRMED: "Tasdiqlangan", PREPAY_PENDING: "To'lov kutilmoqda",
  CANCELLED: "Bekor qilingan", CANCELLED_BY_DRIVER: "Haydovchi bekor qildi", RIDER_CANCELLED: "Bekor qilingan", RIDER_CANCELLED_LATE: "Bekor qilingan", EXPIRED: "Muddati o'tdi",
};

// ── shared city picker panel ───────────────────────────────────────────────────
function CityPickPanel({ title, onPick, onCancel }: { title: string; onPick: (c: IntercityCity) => void; onCancel: () => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<IntercityCity[]>([]);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    let on = true; setSearching(true);
    const t = setTimeout(() => {
      api.icCities(q).then((r) => { if (on) setResults(r); }).catch(() => { if (on) setResults([]); }).finally(() => { if (on) setSearching(false); });
    }, 220);
    return () => { on = false; clearTimeout(t); };
  }, [q]);
  return (
    <div className="view">
      <section>
        <div className="between">
          <div className="section-title">{title}</div>
          <button className="d-link" onClick={() => { haptic(); onCancel(); }}>Bekor</button>
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
              <button key={c.id} className="b3-result" onClick={() => { haptic(); onPick(c); }}>
                {c.name}{c.nameRu ? <span className="dim"> · {c.nameRu}</span> : null}
              </button>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

// ── rider: search + book ───────────────────────────────────────────────────────
function RiderIntercityView() {
  const [fromCity, setFromCity] = useState<IntercityCity | null>(null);
  const [toCity, setToCity] = useState<IntercityCity | null>(null);
  const [day, setDay] = useState(0);
  const [picking, setPicking] = useState<null | "from" | "to">(null);
  const [trips, setTrips] = useState<IntercityTripRow[] | null>(null);
  const [loadingTrips, setLoadingTrips] = useState(false);
  const [booking, setBooking] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [mybk, setMybk] = useState<IntercityBookingRow[] | null>(null);

  const loadActive = () => api.icMyActive().then(setMybk).catch(() => setMybk([]));
  useEffect(() => { loadActive(); }, []);

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
      if (r.ok) { setMsg(r.duplicate ? "Allaqachon band qilgansiz" : "✅ O'rin band qilindi! To'lov — mashinada, naqd."); loadActive(); search(); }
      else setMsg(bookErr(r.error));
    } catch { setMsg("Xatolik — qayta urinib ko'ring"); }
    finally { setBooking(null); }
  };
  const cancel = async (bookingId: number) => {
    haptic(); setMsg(null);
    try { const r = await api.icCancel(bookingId); setMsg(r.ok ? "Bekor qilindi" : "Bekor qilib bo'lmadi"); loadActive(); }
    catch { setMsg("Xatolik"); }
  };

  if (picking !== null) {
    return <CityPickPanel title={picking === "from" ? "Qayerdan" : "Qayerga"} onCancel={() => setPicking(null)}
      onPick={(c) => { if (picking === "from") setFromCity(c); else setToCity(c); setPicking(null); setTrips(null); }} />;
  }

  return (
    <div className="view">
      <section>
        <div className="section-title">🚐 Yo'l — shaharlararo</div>
        <div className="dim fs13 mt4">Viloyatlararo safar — o'rindiq band qiling, to'lov mashinada.</div>
      </section>

      <section className="d-card">
        <div className="col g8">
          <button className="ic-pick" onClick={() => { haptic(); setPicking("from"); }}>
            <span className="ic-pick-ico">📍</span>
            <span className={"ic-pick-val" + (fromCity ? "" : " empty")}>{fromCity ? fromCity.name : "Qayerdan?"}</span>
          </button>
          <button className="ic-pick" onClick={() => { haptic(); setPicking("to"); }}>
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
      {loadingTrips && <section className="d-card"><div className="d-skel" /><div className="d-skel mt8" /></section>}

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
                <button className="d-btn sm" disabled={booking === t.id} onClick={() => book(t.id)}>{booking === t.id ? "…" : "Band qilish"}</button>
              </div>
            </section>
          ))
        )
      )}

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

// ── driver: publish + manage trips ──────────────────────────────────────────────
function DriverIntercityView() {
  const [trips, setTrips] = useState<IntercityDriverTrip[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [picking, setPicking] = useState<null | "from" | "to">(null);
  const [fromCity, setFromCity] = useState<IntercityCity | null>(null);
  const [toCity, setToCity] = useState<IntercityCity | null>(null);
  const [time, setTime] = useState("");
  const [seats, setSeats] = useState("4");
  const [fare, setFare] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [manifestFor, setManifestFor] = useState<number | null>(null);
  const [manifest, setManifest] = useState<IntercityManifest | null>(null);
  const [acting, setActing] = useState<number | null>(null);

  const load = () => api.icDriverTrips().then(setTrips).catch(() => setTrips([]));
  useEffect(() => { load(); }, []);

  const publish = async () => {
    setMsg(null);
    if (!fromCity || !toCity) { setMsg("Shaharlarni tanlang"); return; }
    const when = parseWhen(time);
    if (!when) { setMsg("Vaqtni kiriting (masalan 14:00 yoki «ertaga 08:00»)"); return; }
    const n = parseInt(seats.replace(/\D/g, ""), 10);
    if (!n || n < 1 || n > 8) { setMsg("O'rin soni 1–8"); return; }
    const f = fare.replace(/\D/g, "");
    haptic(); setBusy(true);
    try {
      const r = await api.icPublish({ originCityId: fromCity.id, destCityId: toCity.id, scheduledAt: when.toISOString(), carCapacity: n, fareSom: f ? Number(f) : undefined });
      if (r.ok) {
        setMsg("✅ Reys e'lon qilindi!");
        setCreating(false); setFromCity(null); setToCity(null); setTime(""); setSeats("4"); setFare("");
        load();
      } else setMsg(bookErr(r.error));
    } catch { setMsg("Xatolik — qayta urinib ko'ring"); }
    finally { setBusy(false); }
  };

  const act = async (tripId: number, kind: "depart" | "arrive" | "cancel") => {
    haptic(); setActing(tripId); setMsg(null);
    try {
      const r = kind === "depart" ? await api.icDepart(tripId) : kind === "arrive" ? await api.icArrive(tripId) : await api.icTripCancel(tripId);
      setMsg(r.ok ? (kind === "depart" ? "🚀 Yo'lga chiqdingiz" : kind === "arrive" ? "✅ Yetib keldingiz" : "❌ Bekor qilindi") : "Amal bajarilmadi");
      load();
      if (manifestFor === tripId) setManifestFor(null);
    } catch { setMsg("Xatolik"); }
    finally { setActing(null); }
  };

  const openManifest = async (tripId: number) => {
    haptic();
    if (manifestFor === tripId) { setManifestFor(null); return; }
    setManifestFor(tripId); setManifest(null);
    try { setManifest(await api.icManifest(tripId)); } catch { setManifest(null); }
  };

  if (picking !== null) {
    return <CityPickPanel title={picking === "from" ? "Qayerdan" : "Qayerga"} onCancel={() => setPicking(null)}
      onPick={(c) => { if (picking === "from") setFromCity(c); else setToCity(c); setPicking(null); }} />;
  }

  return (
    <div className="view">
      <section>
        <div className="section-title">🚐 Yo'l — haydovchi</div>
        <div className="dim fs13 mt4">Reys e'lon qiling — yo'lovchilar o'rindiq band qiladi.</div>
      </section>

      {!creating ? (
        <section><button className="d-btn" onClick={() => { haptic(); setCreating(true); setMsg(null); }}>➕ Yangi reys e'lon qilish</button></section>
      ) : (
        <section className="d-card">
          <div className="col g8">
            <button className="ic-pick" onClick={() => { haptic(); setPicking("from"); }}>
              <span className="ic-pick-ico">📍</span>
              <span className={"ic-pick-val" + (fromCity ? "" : " empty")}>{fromCity ? fromCity.name : "Qayerdan?"}</span>
            </button>
            <button className="ic-pick" onClick={() => { haptic(); setPicking("to"); }}>
              <span className="ic-pick-ico">🎯</span>
              <span className={"ic-pick-val" + (toCity ? "" : " empty")}>{toCity ? toCity.name : "Qayerga?"}</span>
            </button>
            <input className="ic-input" value={time} placeholder="Qachon? masalan 14:00 yoki «ertaga 08:00»" onChange={(e) => setTime(e.target.value)} />
            <input className="ic-input" value={seats} inputMode="numeric" placeholder="Necha o'rin (1–8)" onChange={(e) => setSeats(e.target.value)} />
            <input className="ic-input" value={fare} inputMode="numeric" placeholder="Narx (so'm) — bo'sh qoldirsangiz tavsiya narx" onChange={(e) => setFare(e.target.value)} />
          </div>
          <div className="row g8 mt10">
            <button className="d-btn ghost" onClick={() => { haptic(); setCreating(false); }}>Bekor</button>
            <button className="d-btn" disabled={busy} onClick={publish}>{busy ? "…" : "E'lon qilish"}</button>
          </div>
        </section>
      )}

      {msg && <section><div className="ic-msg">{msg}</div></section>}

      <section><div className="section-title">Mening reyslarim</div></section>
      {!trips ? (
        <section className="d-card"><div className="d-skel" /><div className="d-skel mt8" /></section>
      ) : trips.length === 0 ? (
        <section><div className="d-empty"><div className="d-empty-ico">🚐</div>Faol reys yo'q. ➕ Yangi reys e'lon qiling.</div></section>
      ) : (
        trips.map((t) => (
          <section className="d-card ic-trip" key={t.id}>
            <div className="ic-trip-top">
              <span className="ic-trip-route">{t.originCity.name} → {t.destCity.name}</span>
              <span className="ic-trip-time">🕐 {fmtDateTime(t.scheduledAt)}</span>
            </div>
            <div className="ic-trip-meta">
              <span className="ic-seat">💺 {t.bookedSeats}/{t.carCapacity}</span>
              <span>{STATUS_UZ[t.status] ?? t.status}</span>
            </div>
            <div className="row g8 mt4 wrap">
              {(t.status === "OPEN" || t.status === "BOARDING") && <button className="d-btn sm" disabled={acting === t.id} onClick={() => act(t.id, "depart")}>🚀 Jo'nadim</button>}
              {t.status === "DEPARTED" && <button className="d-btn sm" disabled={acting === t.id} onClick={() => act(t.id, "arrive")}>✅ Yetdim</button>}
              {(t.status === "OPEN" || t.status === "BOARDING") && <button className="d-btn ghost sm" disabled={acting === t.id} onClick={() => act(t.id, "cancel")}>❌ Bekor</button>}
              <button className="d-btn ghost sm" onClick={() => openManifest(t.id)}>👥 Yo'lovchilar ({t._count.bookings})</button>
            </div>
            {manifestFor === t.id && (
              <div className="mt8">
                {!manifest ? <div className="d-skel" /> : manifest.bookings.length === 0 ? (
                  <div className="dim fs13 tac">Hali yo'lovchi yo'q</div>
                ) : (
                  manifest.bookings.map((b) => (
                    <div className="row-line" key={b.id}>
                      <div className="between">
                        <span><b>{b.rider.displayName || b.rider.fullName || "Yo'lovchi"}</b> · 💺{b.seatsBooked}</span>
                        <span className="dim fs12">{b.paymentMethod === "PREPAY" ? "Oldindan" : "Naqd"}</span>
                      </div>
                      <div className="dim fs12 mt4">
                        {b.boardingCity ? `${b.boardingCity.name} → ` : ""}{b.alightingCity ? b.alightingCity.name : ""}
                        {b.rider.phone ? <a className="d-link" href={`tel:${b.rider.phone}`}> · 📞 {b.rider.phone}</a> : null}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </section>
        ))
      )}
    </div>
  );
}

export function IntercityView({ me }: { me: { type: string } }) {
  return me.type === "driver" ? <DriverIntercityView /> : <RiderIntercityView />;
}
