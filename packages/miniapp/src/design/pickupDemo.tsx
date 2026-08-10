// 🚕 Olib ketish joyi varag'ining vizual-QA sahifasi — FAQAT `#pickupdemo` hash bilan (App.tsx).
// OyinDemo/RstDemo naqshi: Telegram initData-autentifikatsiyasiz HAQIQIY Booking3View daraxtini
// ko'rish uchun `window.fetch` shu sahifa ichida `/api/booking/*` yo'llari uchun ushlanadi.
// Ega telefonda A va B tartibini yonma-yon solishtirish uchun ham shu manzil: birjoy.online/#pickupdemo
// (flag `pickup2` jonlida OFF — real mijozga hech narsa o'zgarmagan).
import { useState } from "react";
import { Booking3View } from "../booking3";
import type { BookingInfoResponse, MeResponse, SavedAddressView } from "@t1067/shared";
import { fuzzyFilter } from "@t1067/shared";
import { STORY_SEEN_KEY } from "../taxiStory";

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
  serviceArea: [],
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
    driver: { ...DRIVER, meterPayment: r === "started" ? 5021 : 0, meterDistance: r === "started" ? 3.4 : 0.4 },
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
const ME = (mode: Mode, lt: boolean): MeResponse =>
  ({
    linked: true,
    type: "client",
    coins: 4820,
    streak: { current: 3 },
    flags: { booking3: true, autoloc: true, pickup2: mode !== "off", pickup2b: mode === "b", pickup2lt: lt, taxistory: true },
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
    if (url.includes("/api/booking/info")) return json({ ...INFO, active: ACTIVE(RIDE) });
    if (url.includes("/api/booking/places")) return json(PLACES);
    if (url.includes("/api/booking/nearby")) return json({ pins: [], freeDrivers: 4 });
    if (url.includes("/api/booking/active")) return json(ACTIVE(RIDE));
    // ⚠️ Bu yo'l `{ family, scheduled }` OBYEKTI qaytaradi — ilgari bo'sh massiv edi va
    // «Oila uchun» ekrani ochilganda `d.family` undefined bo'lib butun ekran qulardi.
    if (url.includes("/api/booking/scheduled")) return json({ family: [{ id: 1, name: "Dilnoza", phone: "+998901112233" }], scheduled: [] });
    if (url.includes("/api/booking/nearest")) return json(at(0));
    if (url.includes("/api/booking/search")) {
      let q = "";
      try { q = String(JSON.parse(String(init?.body ?? "{}")).q ?? ""); } catch { /* demo only */ }
      return json(fuzzyFilter(q, PLACES).slice(0, 6));
    }
    if (url.includes("/api/booking/create")) return json({ ok: false, reason: "demo" });
    return real(input as RequestInfo, init);
  };
}

export function PickupDemoPage() {
  patchFetch();
  // 📖 Demo har ochilganda story QAYTA chiqsin (jonlida u umr bo'yi bir marta ko'rsatiladi).
  // Ega uni takror-takror ko'rib chiqishi kerak — shuning uchun "ko'rilgan" belgisi tozalanadi.
  useState(() => { try { localStorage.removeItem(STORY_SEEN_KEY); } catch { /* private mode */ } });
  const [mode, setMode] = useState<Mode>("a");
  const [lt, setLt] = useState(true); // ega maketi YORUG' — demo shundan boshlanadi
  const [ride, setRide] = useState<Ride>(RIDE);
  // 🔑 `gen` — safar SEANSI. Ilgari `key` ichida `ride` turardi va har bosishda ekran QAYTA
  // QURILARDI: shu sababli birorta O'TISH ko'rinmasdi — «topildi» quvonchi ham, kelgan mashina
  // kartochkasi ham, eng muhimi YAKUN ekrani ham (u `active` yo'qolishini KUZATIB topiladi).
  // Endi qayta qurish FAQAT yangi qidiruv boshlanganda bo'ladi; qolgan o'tishlarni jonli
  // oqimning O'Z so'rov halqasi ko'radi — ya'ni demo mahsulotdagidek ishlaydi.
  const [gen, setGen] = useState(0);
  const nextRide = (): void => {
    const n = RIDE_NEXT[ride];
    RIDE = n;
    if (n === "searching") setGen((g) => g + 1); // yangi seans → toza qayta qurish
    setRide(n);
  };
  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <Booking3View key={`${mode}-${lt}-${gen}`} me={ME(mode, lt)} onClose={() => undefined} />
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
    </div>
  );
}
