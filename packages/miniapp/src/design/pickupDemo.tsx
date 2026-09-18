// 🚕 Olib ketish joyi varag'ining vizual-QA sahifasi — FAQAT `#pickupdemo` hash bilan (App.tsx).
// OyinDemo/RstDemo naqshi: Telegram initData-autentifikatsiyasiz HAQIQIY Booking3View daraxtini
// ko'rish uchun `window.fetch` shu sahifa ichida `/api/booking/*` yo'llari uchun ushlanadi.
// Ega telefonda A va B tartibini yonma-yon solishtirish uchun ham shu manzil: birjoy.online/#pickupdemo
// (flag `pickup2` jonlida OFF — real mijozga hech narsa o'zgarmagan).
import { useMemo, useState } from "react";
import { Booking3View } from "../booking3";
import type { BookingInfoResponse, MeResponse, SavedAddressView } from "@t1067/shared";
import { fuzzyFilter } from "@t1067/shared";
import { STORY_SEEN_KEY } from "../taxiStory";
import { getInitData } from "../api";
import { markTaxiTap } from "../fastOpen";

// Real Koson place names (kas1067 katalogining vakil namunasi — jonli katalogda ~150 ta).
const NAMES = [
  "5-MAKTAB", "1-MAKTAB", "ESKI BOZOR", "MARKAZIY BOZOR", "BOZOR KO'CHASI", "RAVOT MAHALLA",
  "YANGIOBOD MAHALLA", "DO'STLIK MAHALLA", "YOSHLAR BOG'I", "MADANIYAT BOG'I", "HOKIMLIK",
  "MARKAZIY POCHTA", "OBRON BALNITSA", "TUMAN POLIKLINIKASI", "AVTOSTANSIYA", "TEMIR YO'L BEKATI",
  "JOME MASJIDI", "CHOYXONA MARKAZ", "SANOAT KOLEJI", "STADION", "SAVDO MARKAZI", "GUZAR KO'CHASI",
];
const PLACES: SavedAddressView[] = NAMES.map((name, i) => ({
  id: i + 1,
  name,
  lat: 39.0458 + (i % 7) * 0.004 - 0.012,
  lng: 65.5800 + (i % 5) * 0.005 - 0.01,
}));
const at = (i: number): SavedAddressView => PLACES[i] as SavedAddressView;

const INFO: BookingInfoResponse = {
  clientName: "Sarvarxon",
  // Demo uchun soxta shahar chegarasi (jonlida bu kas `api/cityBorders` dan keladi).
  // Demo mock bo'lgani uchun bu yerda taxminiy ko'pburchak — jonli qiymat bilan chalkashmasin.
  serviceArea: [
    { lat: 39.0620, lng: 65.5560 }, { lat: 39.0640, lng: 65.6010 },
    { lat: 39.0380, lng: 65.6150 }, { lat: 39.0180, lng: 65.5930 },
    { lat: 39.0210, lng: 65.5580 }, { lat: 39.0420, lng: 65.5450 },
  ],
  center: { lat: 39.0458, lng: 65.58 },
  savedAddresses: [at(2), at(5), at(8)],
  cars: [],
  addons: [],
  cashbackPerRide: 40,
  bonusBalance: 0,
  bookingLive: false,
  active: null,
  quickPickup: at(5),
  tariff: { minimalPayment: 5000, minimalDistanceKm: 3, perKmCity: 2200, perMinute: 400 },
  booking3: true,
  waitComp: null,
  dispatcherPhone: "1067", // kas mock ham aynan shuni beradi (kas/mock.ts:258)
};

// 🚕 Safar holatlari — bu ekranlarni boshqacha yo'l bilan faqat HAQIQIY safar paytida ko'rish
// mumkin edi. Demo ularni buyurtmasiz ko'rsatadi (mock kas javobi), ya'ni ega haydovchi kartasini,
// jonli hisoblagichni va yakun ekranini istalgan vaqtda tekshira oladi.
// ⚠️ Holatlar ro'yxati JONLI OQIM bilan bir xil bo'lishi kerak, aks holda demo bor bug'ni yashiradi:
// «qidiruv» (haydovchisiz faol buyurtma) va «yetib keldi» ilgari YO'Q edi — ya'ni ega dispetcher
// tugmasini ham, kelgan mashina kartochkasini ham demo'da umuman ko'ra olmasdi.
type Ride = "none" | "searching" | "accepted" | "arrived" | "started";
const DRIVER = {
  fullName: "ZAFARBEK", carModel: "Cobalt", carNumber: "70Z878ZZ", rating: 4.9,
  phone: "+998901234567", lat: 39.0472, lng: 65.5836, bearing: 120,
};
// 🧭 ridemap: the demo car drives a square (N → E → S → W → N), one fix every 2 s, so the glide and
// the short-way turn at 270° → 0° can be watched. /api/booking/active answers the same place, as live.
const CAR = { lat: DRIVER.lat, lng: DRIVER.lng, bearing: 0 };
const LEG = [0, 90, 180, 270];
let carStep = 0;
function driveCar(): void {
  const heading = LEG[Math.floor(carStep / 5) % 4]!;
  carStep++;
  const rad = (heading * Math.PI) / 180;
  CAR.lat += 0.0003 * Math.cos(rad);
  CAR.lng += 0.0004 * Math.sin(rad);
  CAR.bearing = heading;
}
const ACTIVE = (r: Ride) => {
  if (r === "none") return null;
  // Qidiruv holati — buyurtma bor, haydovchi HALI YO'Q (kas hali hech kimga bermagan).
  if (r === "searching") return { id: 90001, status: "new", notifiedCount: 3, etaMin: null, rideStartedAt: null, driver: null };
  return {
    id: 90001,
    status: r === "started" ? "started" : r === "arrived" ? "arrived" : "accepted",
    notifiedCount: 3,
    etaMin: r === "started" || r === "arrived" ? null : 2,
    rideStartedAt: r === "started" ? new Date(Date.now() - 6 * 60_000).toISOString() : null,
    driver: { ...DRIVER, ...CAR, meterPayment: r === "started" ? 5021 : 0, meterDistance: r === "started" ? 3.4 : 0.4 },
  };
};
let RIDE: Ride = "none"; // patchFetch shundan o'qiydi (modul darajasida, remount'da saqlanadi)
const RIDE_LABEL: Record<Ride, string> = {
  none: "🚕 Safar: yo'q", searching: "🔍 Qidirilyapti", accepted: "🚕 Haydovchi yo'lda",
  arrived: "📍 Yetib keldi", started: "🚕 Safarda",
};
const RIDE_NEXT: Record<Ride, Ride> = {
  none: "searching", searching: "accepted", accepted: "arrived", arrived: "started", started: "none",
};

type Mode = "a" | "b" | "off";
const ME = (mode: Mode, lt: boolean, live: boolean, stream: boolean, ridemap: boolean, fastopen: boolean): MeResponse =>
  ({
    linked: true,
    type: "client",
    coins: 4820,
    streak: { current: 3 },
    flags: { booking3: true, autoloc: true, pickup2: mode !== "off", pickup2b: mode === "b", pickup2lt: lt, taxistory: true, livecars: live, corestream: stream, ridemap, fastopen, tapreorder: true },
  }) as unknown as MeResponse;
const LABEL: Record<Mode, string> = { a: "A — javob birinchi", b: "B — ro'yxat birinchi", off: "Eski ko'rinish (flag OFF)" };
const NEXT: Record<Mode, Mode> = { a: "b", b: "off", off: "a" };

let patched = false;
function patchFetch(): void {
  if (patched) return;
  patched = true;
  const real = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    if (url.includes("/api/booking/info") || url.includes("/api/booking/boot")) {
      // ⚡ fastopen: a slow network (600 ms) makes the phone's cached sheet visible in the demo.
      await new Promise((r) => setTimeout(r, 600));
      return json({ ...INFO, active: ACTIVE(RIDE) });
    }
    if (url.includes("/api/booking/places")) return json(PLACES);
    // livecars: three real-looking free cars around the asked point, drifting a little each call
    // (so the glide is visible). MUST be matched before "/api/booking/nearby" — that is its prefix.
    if (url.includes("/api/booking/nearby-free")) {
      const q = new URL(url, location.origin).searchParams;
      const lat = Number(q.get("lat")) || INFO.center.lat;
      const lng = Number(q.get("lng")) || INFO.center.lng;
      const d = (Date.now() / 10_000) % 1 * 0.0015;
      return json({
        freeCount: 3,
        cars: [
          { id: "demoA", lat: lat + 0.004 + d, lng: lng + 0.003, bearing: 0 },
          { id: "demoB", lat: lat - 0.003, lng: lng + 0.005 - d, bearing: 270 },
          { id: "demoC", lat: lat + 0.002, lng: lng - 0.006 + d, bearing: 90 },
        ],
      });
    }
    if (url.includes("/api/booking/nearby")) return json({ pins: [], freeDrivers: 4 });
    if (url.includes("/api/booking/active")) {
      ACTIVE_CALLS.push(Date.now()); // 🔌 so'rov tezligini tekshirish uchun: window.__demoActiveCalls
      return json(ACTIVE(RIDE));
    }
    // ⚠️ Bu yo'l `{ family, scheduled }` OBYEKTI qaytaradi — ilgari bo'sh massiv edi va
    // «Oila uchun» ekrani ochilganda `d.family` undefined bo'lib butun ekran qulardi.
    if (url.includes("/api/booking/scheduled")) return json({ family: [{ id: 1, name: "Dilnoza", phone: "+998901112233" }], scheduled: [] });
    if (url.includes("/api/booking/nearest")) {
      NEAREST_CALLS.push(Date.now()); // ⚡ fastopen names the pin on the phone: this should stay quiet
      await new Promise((r) => setTimeout(r, 400));
      return json(at(0));
    }
    if (url.includes("/api/booking/search")) {
      let q = "";
      try { q = String(JSON.parse(String(init?.body ?? "{}")).q ?? ""); } catch { /* demo only */ }
      return json(fuzzyFilter(q, PLACES).slice(0, 6));
    }
    if (url.includes("/api/booking/create")) return json({ ok: false, reason: "demo" });
    // 🔁 tapreorder: one tap — the demo "dispatches" (a new search starts; nothing real is called)
    if (url.includes("/api/booking/now")) {
      NOW_CALLS.push(Date.now());
      await new Promise((r) => setTimeout(r, 300));
      RIDE = "searching";
      return json({ state: "dispatched", pickupName: "demo" });
    }
    return real(input as RequestInfo, init);
  };
}

// 🔌 corestream: the ride socket (/api/ride-ws) without a server. Says "ready" after the auth frame
// and "nudge" whenever the demo's ride changes — so the poll's pace (20 s under the socket, 3 s
// without it), the instant ask on a nudge and the pause in the background can all be watched here.
const ACTIVE_CALLS: number[] = [];
const NEAREST_CALLS: number[] = [];
const NOW_CALLS: number[] = [];
(window as unknown as { __demoNowCalls: number[] }).__demoNowCalls = NOW_CALLS;
(window as unknown as { __demoNearestCalls: number[] }).__demoNearestCalls = NEAREST_CALLS;
// ⚡ fastopen timing marks go out with sendBeacon (not fetch) — kept here for the demo to show.
const BEACONS: unknown[] = [];
(window as unknown as { __demoBeacons: unknown[] }).__demoBeacons = BEACONS;
if (typeof navigator.sendBeacon === "function") {
  const realBeacon = navigator.sendBeacon.bind(navigator);
  navigator.sendBeacon = (url: string | URL, data?: BodyInit | null) => {
    if (String(url).includes("/api/ux/marks") && data instanceof Blob) {
      void data.text().then((t) => BEACONS.push(JSON.parse(t)));
      return true;
    }
    return realBeacon(url, data);
  };
}
(window as unknown as { __demoActiveCalls: number[] }).__demoActiveCalls = ACTIVE_CALLS;
const demoSockets = new Set<DemoRideSocket>();
// Console: window.__demoSockets.forEach(s => s.push({ t: "down" })) — the core's stream dropped.
(window as unknown as { __demoSockets: Set<DemoRideSocket> }).__demoSockets = demoSockets;
class DemoRideSocket {
  static readonly OPEN = 1;
  readonly OPEN = 1;
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    // A socket closed while still connecting never opens — as a real one.
    setTimeout(() => { if (this.readyState !== 0) return; this.readyState = 1; this.onopen?.(); }, 30);
  }
  send(data: string): void {
    if (this.readyState !== 1) return;
    try {
      if (JSON.parse(data).t === "auth") setTimeout(() => { if (this.readyState !== 1) return; demoSockets.add(this); this.push({ t: "ready" }); }, 80);
    } catch { /* demo only */ }
  }
  push(msg: unknown): void {
    if (this.readyState === 1) this.onmessage?.({ data: JSON.stringify(msg) });
  }
  close(): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    demoSockets.delete(this);
    setTimeout(() => this.onclose?.({ code: 1000 }), 10);
  }
}
let socketPatched = false;
function patchSocket(): void {
  if (socketPatched) return;
  socketPatched = true;
  const Real = window.WebSocket;
  window.WebSocket = function (url: string | URL, protocols?: string | string[]) {
    return String(url).includes("/api/ride-ws") ? new DemoRideSocket() : new Real(url, protocols);
  } as unknown as typeof WebSocket;
  // The core's svc:loc: while a driver holds the ride (not while he waits at the door), a fix every 2 s.
  setInterval(() => {
    if (RIDE !== "accepted" && RIDE !== "started") return;
    driveCar();
    for (const sock of demoSockets) sock.push({ t: "pos", id: 90001, lat: CAR.lat, lng: CAR.lng, bearing: CAR.bearing, at: new Date().toISOString() });
  }, 2_000);
}

export function PickupDemoPage() {
  patchFetch();
  patchSocket();
  // 📖 Demo har ochilganda story QAYTA chiqsin (jonlida u umr bo'yi bir marta ko'rsatiladi).
  // Ega uni takror-takror ko'rib chiqishi kerak — shuning uchun "ko'rilgan" belgisi tozalanadi.
  useState(() => { try { localStorage.removeItem(STORY_SEEN_KEY); } catch { /* private mode */ } });
  const [mode, setMode] = useState<Mode>("a");
  const [lt, setLt] = useState(true); // ega maketi YORUG' — demo shundan boshlanadi
  const [live, setLive] = useState(true); // 🚕 livecars: real bo'sh mashinalar (ON) yoki eski bezaklar (OFF)
  const [stream, setStream] = useState(true); // 🔌 corestream: holat soketdan (ON) yoki faqat so'rov (OFF)
  const [ridemap, setRidemap] = useState(true); // 🧭 ridemap: mashina fikslar oralig'ida siljiydi, qisqa yoy bilan buriladi
  const [fastopen, setFastopen] = useState(true); // ⚡ fastopen: varaq telefon keshidan, pin nomi telefonda
  // The ride socket authenticates with initData; outside Telegram there is none. A placeholder, set
  // before the first render (the socket connects in a child's effect, which runs before ours). Only
  // this tab's sessionStorage, only when empty: inside Telegram the real SDK value is read first.
  useState(() => {
    if (getInitData()) return;
    try { sessionStorage.setItem("tg:initData", "demo"); } catch { /* private mode */ }
    // …and gone again the moment this tab leaves the demo, so the real app never sends "demo".
    const drop = () => { try { if (sessionStorage.getItem("tg:initData") === "demo") sessionStorage.removeItem("tg:initData"); } catch { /* ignore */ } };
    window.addEventListener("pagehide", drop, { once: true });
    window.addEventListener("hashchange", () => { if (!location.hash.startsWith("#pickupdemo")) drop(); });
  });
  const [ride, setRide] = useState<Ride>(RIDE);
  // 🔑 `gen` — safar SEANSI. Ilgari `key` ichida `ride` turardi va har bosishda ekran QAYTA
  // QURILARDI: shu sababli birorta O'TISH ko'rinmasdi — «topildi» quvonchi ham, kelgan mashina
  // kartochkasi ham, eng muhimi YAKUN ekrani ham (u `active` yo'qolishini KUZATIB topiladi).
  // Endi qayta qurish FAQAT yangi qidiruv boshlanganda bo'ladi; qolgan o'tishlarni jonli
  // oqimning O'Z so'rov halqasi ko'radi — ya'ni demo mahsulotdagidek ishlaydi.
  const [gen, setGen] = useState(0);
  const viewKey = `${mode}-${lt}-${live}-${stream}-${ridemap}-${fastopen}-${gen}`;
  // ⚡ each (re)mount is a fresh "tap on Taksi" for the timing marks (App does this in the real app)
  useMemo(() => markTaxiTap(), [viewKey]);
  const nextRide = (): void => {
    const n = RIDE_NEXT[ride];
    RIDE = n;
    if (n === "searching") setGen((g) => g + 1); // yangi seans → toza qayta qurish
    setRide(n);
    for (const sock of demoSockets) sock.push({ t: "nudge", status: n }); // 🔌 the core said something changed
  };
  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <Booking3View key={viewKey} me={ME(mode, lt, live, stream, ridemap, fastopen)} onClose={() => undefined} />
      <button
        className="d-chip"
        style={{ position: "fixed", top: "calc(6px + var(--safe-top))", right: 10, zIndex: 99 }}
        onClick={() => setMode(NEXT[mode])}
      >
        {LABEL[mode]}
      </button>
      {/* ☀️/🌙 — ega ikkala ko'rinishni yonma-yon solishtiradi (u shunday so'ragan edi) */}
      <button
        className="d-chip"
        style={{ position: "fixed", top: "calc(48px + var(--safe-top))", right: 10, zIndex: 99 }}
        onClick={() => setLt(!lt)}
      >
        {lt ? "☀️ Yorug'" : "🌙 Qorong'i"}
      </button>
      {/* Safar holatlari: yo'q → haydovchi yo'lda → safarda → (yopilganda yakun ekrani) */}
      <button
        className="d-chip"
        style={{ position: "fixed", top: "calc(90px + var(--safe-top))", right: 10, zIndex: 99 }}
        onClick={nextRide}
      >
        {RIDE_LABEL[ride]}
      </button>
      <button
        className="d-chip"
        style={{ position: "fixed", top: "calc(132px + var(--safe-top))", right: 10, zIndex: 99 }}
        onClick={() => setLive(!live)}
      >
        {live ? "🚕 Real mashinalar" : "👻 Bezak mashinalar"}
      </button>
      <button
        className="d-chip"
        style={{ position: "fixed", top: "calc(174px + var(--safe-top))", right: 10, zIndex: 99 }}
        onClick={() => setStream(!stream)}
      >
        {stream ? "🔌 Oqim: jonli" : "🔌 Oqim: yo'q (so'rov)"}
      </button>
      <button
        className="d-chip"
        style={{ position: "fixed", top: "calc(216px + var(--safe-top))", right: 10, zIndex: 99 }}
        onClick={() => setRidemap(!ridemap)}
      >
        {ridemap ? "🧭 Xarita: silliq" : "🧭 Xarita: eski"}
      </button>
      <button
        className="d-chip"
        style={{ position: "fixed", top: "calc(258px + var(--safe-top))", right: 10, zIndex: 99 }}
        onClick={() => setFastopen(!fastopen)}
      >
        {fastopen ? "⚡ Ochilish: tez" : "⚡ Ochilish: eski"}
      </button>
    </div>
  );
}
