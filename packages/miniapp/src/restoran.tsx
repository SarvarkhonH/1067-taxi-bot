// 🍽 RESTORAN (feature "restoran", RESTORAN_PLAN.md) — R1 katalog + R2 savat/checkout + R3/R4
// operator/admin (server-side) + qulayliklar (bekor qilish, qayta buyurtma, qidiruv/filtr, sharh,
// mijozga push). V1 = CONCIERGE: narx REAL SO'M (D1), buyurtma operator orqali telefon bilan
// tayyorlanadi (admin panel orqali boshqariladi) — bu ekran faqat mijoz-tomon.
import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";
import type { FoodOrderView, MeResponse, MenuItemView, RestaurantView } from "@t1067/shared";
import { formatNumber } from "@t1067/shared";
import { api, apiUrl } from "./api";
import { haptic, hapticSuccess, tg } from "./telegram";
import { Button, EmptyState, Sheet, Skeleton } from "./design/components";
import { RstIcon } from "./design/feat/rstIcons";
import { useBackButton } from "./useBackButton";
import { useIsActive } from "./useIsActive";
import "./design/feat/rst.css"; // bu tab ochilgandagina yuklanadi (kritik yo'lda emas)

const LAST_ADDR_KEY = "restoran_last_addr";

/** Rejimlar. Ega qarori (2026-07-29): V1'da FAQAT shu ikkisi ishlaydi. Dizayndagi «Stol bron» va
 *  «Stolda QR» — yangi mahsulot (sana/odam soni/stol raqami/QR + operator oqimi + restoran bilan
 *  kelishuv), shuning uchun ataylab QURILMADI. Segment ularni keyin sig'diradigan qilib yozilgan:
 *  bu massivga element qo'shilsa, bo'laklar avtomatik teng bo'linadi. */
const MODES = [
  { key: "delivery", label: "Yetkazish" },
  { key: "pickup", label: "Olib ketish" },
] as const;

/** Kategoriya kaliti → ko'rsatiladigan nom. Bazada `category` — qisqa kalit (schema default'lari:
 *  milliy|fastfood|shirinlik|ichimlik|boshqa), dizaynda esa chiroyli yorliqlar. Kalit ro'yxatda
 *  bo'lmasa xom qiymat ko'rsatiladi — ya'ni admin yangi kategoriya qo'shsa ham hech narsa
 *  yo'qolmaydi, faqat tarjimasiz chiqadi. */
const CAT_LABEL: Record<string, string> = {
  milliy: "Milliy",
  fastfood: "Fastfood",
  shirinlik: "Shirinlik",
  ichimlik: "Ichimlik",
  boshqa: "Boshqa",
};

// Xizmatlar'dagi bilan bir xil "09:00-22:00" formatini o'qish — mustaqil nusxa (services.tsx'ga
// bog'lanish restoran chunk'ini keraksiz og'irlashtirmasin).
function openNow(wh?: string | null): boolean | null {
  if (!wh) return null;
  const m = /^(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})$/.exec(wh.trim());
  if (!m) return null;
  const cur = new Date().getHours() * 60 + new Date().getMinutes();
  const a = Number(m[1]) * 60 + Number(m[2]);
  const b = Number(m[3]) * 60 + Number(m[4]);
  return a <= b ? cur >= a && cur < b : cur >= a || cur < b;
}

/** Ochiq/Yopiq pill. Ilgari `svc-open` klassi ishlatilardi — u XIZMATLAR chunk'idagi `svc.css` da
 *  yashaydi va restoran sahifasida umuman yuklanmaydi, ya'ni badge uslubsiz xom matn bo'lib
 *  chiqardi (B2 QA skrinshotida shunday ko'rindi). Endi o'z klassi bor. Ish vaqti ALOHIDA
 *  ko'rsatiladi, shuning uchun bu yerda takrorlanmaydi. */
function OpenBadge({ wh }: { wh?: string | null }) {
  const o = openNow(wh);
  if (o === null) return null;
  return <span className={"rst-open" + (o ? " open" : "")}>{o ? "Ochiq" : "Yopiq"}</span>;
}

/** Yetkazish/min-buyurtma qatori. Faqat NOLDAN katta raqamlar qo'shiladi, ya'ni sozlanmagan
 *  restoran hech narsa va'da qilmaydi. `extra` — kartada yo'q, lekin restoran sahifasida
 *  doim bo'ladigan tayyorlanish vaqti. Hech biri bo'lmasa bo'sh satr qaytadi (chaqiruvchi
 *  qatorni umuman chizmaydi). */
function feeLine(r: { deliveryFeeSom: number; minOrderSom: number }, opts?: { long?: boolean; extra?: string }): string {
  return [
    r.deliveryFeeSom > 0 ? `Yetkazish ${formatNumber(r.deliveryFeeSom)} so'm` : null,
    r.minOrderSom > 0 ? `min${opts?.long ? " buyurtma" : ""} ${formatNumber(r.minOrderSom)}${opts?.long ? " so'm" : ""}` : null,
    opts?.extra ?? null,
  ].filter(Boolean).join(" · ");
}

// 🎨 Fotosiz restoran uchun fon. Ega qarori (2026-07-29): «kuchli fallback + parallel foto
// yig'ish» — ya'ni fotosi yo'q restoran ham chiroyli ko'rinishi kerak, chunki jonli bazada
// ko'pchilikda foto yo'q va dizayn 126px rasmga qurilgan. Gradientlar DIZAYNERNING o'ziniki
// (`Restoran.dc.html` → `IMGS`), shuning uchun palitra begona emas. Tanlov `id` bo'yicha —
// ya'ni bitta restoran har ochilganda BIR XIL fonni oladi (tasodifiy emas, tanilib qoladi).
const PHOTO_FALLBACKS = [
  "linear-gradient(150deg,#8a6a3f,#c9a063 55%,#6b4f2c)",
  "linear-gradient(150deg,#a2632e,#e0a55c 55%,#7a4a1f)",
  "linear-gradient(150deg,#7b3f34,#c96b4a 55%,#5c2d24)",
  "linear-gradient(150deg,#5c4030,#9c6b45 55%,#3d2a1f)",
  "linear-gradient(150deg,#8f5a72,#d9a3b6 55%,#6b4055)",
  "linear-gradient(150deg,#3f5c56,#7ba39a 55%,#2b3f3b)",
];
// `!` — modul bo'yicha qoldiq har doim massiv chegarasida, lekin `noUncheckedIndexedAccess`
// buni bilmaydi va `string | undefined` qaytaradi.
const fallbackBg = (id: number): string => PHOTO_FALLBACKS[Math.abs(id) % PHOTO_FALLBACKS.length]!;

/** Foto ustidagi badge qatori: Ochiq/Yopiq + taxminiy vaqt (README §1). */
function PhotoBadges({ r }: { r: RestaurantView }) {
  const o = openNow(r.workHours);
  return (
    <div className="rst-card-badges">
      {o !== null && <span className={"rst-pb rst-pb-state" + (o ? " open" : "")}>{o ? "Ochiq" : "Yopiq"}</span>}
      {r.prepMinutes > 0 && <span className="rst-pb rst-pb-eta">~{r.prepMinutes} daq</span>}
    </div>
  );
}

function RestaurantCard({ r, onOpen }: { r: RestaurantView; onOpen: (r: RestaurantView) => void }) {
  return (
    <button className="rst-card" onClick={() => { haptic(); onOpen(r); }}>
      <div className="rst-card-photo-wrap">
        {r.hasPhoto ? (
          <img className="rst-card-photo" src={apiUrl(`/api/restoran/photo/${r.id}`)} onError={photoFallback(r.id)} loading="lazy" decoding="async" alt="" />
        ) : (
          <div className="rst-card-photo rst-card-noimg" style={{ backgroundImage: fallbackBg(r.id) }}>
            <RstIcon name="plate" size={34} />
          </div>
        )}
        <PhotoBadges r={r} />
      </div>
      <div className="rst-card-body">
        <div className="rst-card-top">
          <div className="rst-card-name">{r.name}</div>
          {r.avgRating > 0 && (
            <span className="rst-rating">
              <RstIcon name="star" size={12} />{r.avgRating.toFixed(1)}
              {r.reviewCount > 0 && <i className="rst-rating-n">({r.reviewCount})</i>}
            </span>
          )}
        </div>
        <div className="rst-card-cat">{CAT_LABEL[r.category] ?? r.category}</div>
        <div className="rst-card-badges-row">
          {/* 💸 «Bepul yetkazish» ATAYLAB chiqmaydi. Dizayn `fee === 0` da shuni yozishni so'raydi,
              lekin jonli bazada faol restoranlarning HAMMASIDA fee=0 — u yerda 0 «bepul» degani
              emas, «hali sozlanmagan» degani. Ilova bajarilishi kafolatlanmagan va'dani bermaydi.
              Admin panelda haqiqiy narx qo'yilgach badge o'zi paydo bo'ladi. */}
          {r.deliveryFeeSom > 0 && <span className="rst-badge">Yetkazish {formatNumber(r.deliveryFeeSom)} so'm</span>}
          {r.minOrderSom > 0 && <span className="rst-badge">Min {formatNumber(r.minOrderSom)} so'm</span>}
          <span className="rst-badge cash">Naqd</span>
        </div>
      </div>
    </button>
  );
}

function CatalogSkeleton() {
  return (
    <div className="rst-list">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rst-card">
          <Skeleton h={126} className="rst-skel-photo" />
          <div className="rst-card-body">
            <Skeleton h={16} w="62%" />
            <Skeleton h={12} w="38%" />
            <Skeleton h={22} w="80%" />
          </div>
        </div>
      ))}
    </div>
  );
}

// Emoji'siz — dizaynda holat rang bilan ajratiladi (ko'k = jarayonda, yashil = tugadi, qizil = bekor),
// `c` esa .order-status-pill klassini beradi. Matnlar content.json → `timelines` bilan bir xil.
const STATUS_LABEL: Record<FoodOrderView["status"], { t: string; c: string }> = {
  pending: { t: "Kutilmoqda", c: "pending" },
  accepted: { t: "Qabul qilindi", c: "pending" },
  preparing: { t: "Tayyorlanmoqda", c: "pending" },
  delivering: { t: "Yo'lda", c: "pending" },
  delivered: { t: "Yetkazildi", c: "delivered" },
  rejected: { t: "Rad etildi", c: "rejected" },
  cancelled_by_user: { t: "Bekor qilindi", c: "rejected" },
};
const TERMINAL_STATUSES = new Set<FoodOrderView["status"]>(["delivered", "rejected", "cancelled_by_user"]);

/** 📡 Tarmoq xatosi — dizaynda umuman chizilmagan holat, lekin sekin/uzilgan internetda mijoz
 *  AYNAN shuni ko'radi. Ilgari xato «bo'sh» bilan aralashtirilardi: `catch` ro'yxatni `[]` qilib
 *  qo'yardi va ekranda «Hozircha restoran yo'q — tez orada qo'shiladi» chiqardi. Bu YOLG'ON —
 *  restoranlar bor, internet yo'q edi. Endi sabab to'g'ri aytiladi va qayta urinish tugmasi bor. */
function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rst-card-plain rst-empty">
      <div className="rst-empty-t">Yuklanmadi</div>
      <div className="rst-empty-s">Internet aloqasini tekshiring va qayta urinib ko'ring.</div>
      <button className="rst-retry" onClick={() => { haptic(); onRetry(); }}>Qayta urinish</button>
    </div>
  );
}

/** Fotosi bor deb belgilangan, lekin YUKLANMAGAN rasm (fayl o'chgan, CDN uzilgan) — sinuq rasm
 *  belgisi o'rniga o'sha gradient-zaxira ko'rsatiladi. `hasPhoto: false` holati allaqachon
 *  qoplangan edi; bu — «bor, lekin kelmadi» holati. */
function photoFallback(id: number) {
  return (e: SyntheticEvent<HTMLImageElement>) => {
    const el = e.currentTarget;
    if (el.dataset.fallback) return; // bir marta
    el.dataset.fallback = "1";
    el.removeAttribute("src");
    el.style.backgroundImage = fallbackBg(id);
    el.style.backgroundSize = "cover";
    el.style.backgroundPosition = "center";
  };
}

/** «Bugun · Yetkazish» meta-qatori (dizayn §7). Sana faqat kunlar farqidan hisoblanadi —
 *  soatlar ayirmasidan emas: kecha 23:50 va bugun 00:10 orasida 20 daqiqa bor, lekin bu
 *  «kecha» bo'lishi kerak. */
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const midnight = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((midnight(new Date()) - midnight(d)) / 86_400_000);
  if (diff === 0) return "Bugun";
  if (diff === 1) return "Kecha";
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

/** ⭐️ Baholash varag'i — `delivered` buyurtmadan keyin holat ekranidagi «Bahoni qoldirish».
 *  Ilgari bu tugma restoran sahifasini ochardi va mijoz baho blokini o'zi qidirishi kerak edi
 *  (u sahifaning o'rtasida). Endi baho aynan shu yerda, ikki bosishda qoladi. */
function RateSheet({ restaurantId, restaurantName, onClose, onDone }: { restaurantId: number; restaurantName: string; onClose: () => void; onDone: (msg: string) => void }) {
  const [stars, setStars] = useState(0);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (stars < 1 || busy) return;
    setBusy(true);
    const r = await api.restoranReviewSubmit(restaurantId, stars, text).catch(() => ({ ok: false as const }));
    setBusy(false);
    if (r.ok) { hapticSuccess(); onDone("Rahmat! Bahoyingiz qabul qilindi"); onClose(); }
    else onDone("Baho yuborilmadi — qayta urinib ko'ring");
  };
  return (
    <Sheet open onClose={onClose}>
      <h3>{restaurantName}</h3>
      <div className="rst-rate-q">Buyurtma qanday bo'ldi?</div>
      <div className="rst-stars-input big">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} className={n <= stars ? "on" : ""} onClick={() => { haptic(); setStars(n); }} aria-label={`${n} yulduz`}>
            <RstIcon name="star" size={34} />
          </button>
        ))}
      </div>
      {stars > 0 && (
        <input className="bk-input mt8" placeholder="Sharh (ixtiyoriy)" value={text} onChange={(e) => setText(e.target.value)} maxLength={280} />
      )}
      <Button variant="brand" disabled={stars < 1 || busy} onClick={submit}>{busy ? "Yuborilmoqda…" : "Yuborish"}</Button>
    </Sheet>
  );
}

function MyOrdersView({ onBack, onReorder, onOpen }: { onBack: () => void; onReorder: (o: FoodOrderView) => void; onOpen: (o: FoodOrderView) => void }) {
  const appActive = useIsActive(); // ⏸ fonda so'rov halqasi to'xtaydi
  const [orders, setOrders] = useState<FoodOrderView[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  useEffect(() => {
    const load = () => api.restoranOrders().then((r) => setOrders(r.orders)).catch(() => undefined);
    if (!appActive) return; // ⏸ fonda so'rov yubormaymiz; qaytilganda effekt qayta ishga tushib darhol yangilaydi
    load();
    // R3 DoD: operator admin panelda holat o'zgartirsa mijoz shu ekranda jonli ko'rishi kerak —
    // faqat ochiq bo'lgan payt poll qilinadi (8s, booking3'ning adaptiv-poll ruhida, ortiqcha kuch sarflamaydi)
    const iv = setInterval(load, 8000);
    return () => clearInterval(iv);
  }, [appActive]);

  const cancel = async (o: FoodOrderView) => {
    haptic();
    setBusyId(o.id);
    const r = await api.restoranCancel(o.id).catch(() => ({ ok: false as const }));
    setBusyId(null);
    if (r.ok) { hapticSuccess(); api.restoranOrders().then((x) => setOrders(x.orders)).catch(() => undefined); }
  };

  return (
    <div className="view">
      <button className="rst-back" onClick={() => { haptic(); onBack(); }}><RstIcon name="chevron-left" size={13} />Orqaga</button>
      {orders === null ? (
        <><Skeleton h={96} /><div style={{ height: 12 }} /><Skeleton h={96} /></>
      ) : orders.length === 0 ? (
        // Bo'sh holat — dizayn §7: karta ichida sarlavha + ruhlantiruvchi izoh. Matn
        // content.json dan, lekin «25 daqiqada uyingizda bo'ladi» qismi OLINDI: bu bizning
        // ma'lumotimizda yo'q va bajarilishi kafolatlanmagan va'da.
        <div className="rst-card-plain rst-empty">
          <div className="rst-empty-t">Hali buyurtma yo'q</div>
          <div className="rst-empty-s">Restoran tanlab birinchi buyurtmangizni bering.</div>
        </div>
      ) : (
        orders.map((o) => {
          const s = STATUS_LABEL[o.status];
          return (
            // Karta bosilsa holat ekrani ochiladi (dizayn §7). Ichkaridagi tugmalar
            // (bekor qilish / yana shu) o'z hodisasini to'xtatadi.
            <div key={o.id} className="rst-order-card" onClick={() => { haptic(); onOpen(o); }}>
              <div className="rst-order-top">
                <b>{o.restaurantName}</b>
                {/* Dizaynda ro'yxatda faqat «Jarayonda / Yetkazildi» ikkita yorliq bor. Bizda
                    aniq holat allaqachon mavjud («Yo'lda», «Tayyorlanmoqda») — bir xil joyda
                    ko'proq ma'lumot, shuning uchun aniq matn qoldirildi; rang guruhlari
                    dizayndagidek (ko'k = jarayonda, yashil = tugadi, qizil = yopildi). */}
                <span className={`order-status-pill ${s.c}`}>{s.t}</span>
              </div>
              <div className="rst-order-meta">{dayLabel(o.createdAt)} · {o.isPickup ? "Olib ketish" : "Yetkazish"}</div>
              <div className="rst-order-items">{o.itemsJson.map((i) => `${i.qty}× ${i.name}`).join(", ")}</div>
              <div className="rst-order-bottom">
                <span>{o.isPickup ? "Olib ketish" : o.address}</span>
                <b>{formatNumber(o.totalSom)} so'm</b>
              </div>
              {o.status === "rejected" && o.rejectReason && <div className="rst-order-reason">Sabab: {o.rejectReason}</div>}
              {o.status === "pending" && (
                <button className="rst-order-cancel" disabled={busyId === o.id} onClick={(e) => { e.stopPropagation(); cancel(o); }}>Bekor qilish</button>
              )}
              {TERMINAL_STATUSES.has(o.status) && (
                <button className="rst-order-reorder" onClick={(e) => { e.stopPropagation(); haptic(); onReorder(o); }}>Yana shu</button>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

// ── 📍 B4 · BUYURTMA HOLATI (README §6) ───────────────────────────────────────────────────────
// Bu ekran mijoz tajribasining eng og'ir yuki: ovqat buyurtmasining hissiyoti — KUTISH daqiqalari.
// B3'gacha buyurtmadan keyin bitta «qabul qilindi» yozuvi chiqib, mijoz o'zi «Buyurtmalarim»ga
// bormasa boshqa hech narsa ko'rmasdi.
//
// Matnlar content.json → `timelines` dan. IKKI joyda ataylab O'ZGARTIRILDI: dizaynda
// «taxminan 20 daqiqa» va «10–15 daqiqa» qat'iy yozilgan — bu raqamlar bizning ma'lumotimizda
// YO'Q (FoodOrderView'da prepMinutes kelmaydi), ya'ni ular o'ylab topilgan va'da bo'lardi.
const TRACK_STEPS: Record<"delivery" | "pickup", [string, string][]> = {
  delivery: [
    ["Qabul qilindi", "Restoran buyurtmani tasdiqladi"],
    ["Tayyorlanmoqda", "Oshxonada tayyorlanmoqda"],
    ["Yo'lda", "Kuryer yo'lga chiqdi"],
    ["Yetkazildi", "Naqd to'lov qabul qilindi"],
  ],
  pickup: [
    ["Qabul qilindi", "Restoran buyurtmani oldi"],
    ["Tayyorlanmoqda", "Oshxonada tayyorlanmoqda"],
    ["Tayyor — kutmoqda", "Kelib olib ketishingiz mumkin"],
    ["Olib ketildi", "Rahmat! Bahoingizni qoldiring"],
  ],
};

/** Holat → timeline indeksi. `pending` — 0-qadam HALI bajarilmagan (operator restoran bilan
 *  bog'lanmoqda), shuning uchun alohida `done: false` bilan qaytadi. */
function trackPos(status: FoodOrderView["status"]): { i: number; done: boolean } {
  switch (status) {
    case "pending": return { i: 0, done: false };
    case "accepted": case "preparing": return { i: 1, done: false };
    case "delivering": return { i: 2, done: false };
    case "delivered": return { i: 3, done: true };
    default: return { i: 0, done: false };
  }
}

function OrderTrackView({ orderId, onBack, onBanner }: { orderId: number; onBack: () => void; onBanner?: (msg: string) => void }) {
  const appActive = useIsActive();
  const [order, setOrder] = useState<FoodOrderView | null>(null);
  const [missing, setMissing] = useState(false);
  const [rating, setRating] = useState(false);
  useBackButton(true, onBack, 2);

  useEffect(() => {
    const load = () => api.restoranOrders()
      .then((r) => {
        const found = r.orders.find((o) => o.id === orderId) ?? null;
        setOrder(found);
        if (!found) setMissing(true);
      })
      .catch(() => undefined);
    if (!appActive) return; // ⏸ fonda so'rov yubormaymiz (buyurtmalar ro'yxati bilan bir xil qoida)
    load();
    const iv = setInterval(load, 8000);
    return () => clearInterval(iv);
  }, [orderId, appActive]);

  if (!order) {
    return (
      <div className="view rst-detail-view">
        <button className="rst-back" onClick={() => { haptic(); onBack(); }}><RstIcon name="chevron-left" size={13} />Orqaga</button>
        {missing
          ? <EmptyState icon={<RstIcon name="orders" size={34} />} text="Buyurtma topilmadi" action="Orqaga" onAction={onBack} />
          : <><Skeleton h={132} /><div style={{ height: 12 }} /><Skeleton h={200} /></>}
      </div>
    );
  }

  const terminated = order.status === "rejected" || order.status === "cancelled_by_user";
  const steps = TRACK_STEPS[order.isPickup ? "pickup" : "delivery"];
  const { i, done } = trackPos(order.status);
  const headSub = order.isPickup ? `${order.restaurantName} · olib ketish` : `${order.address} · naqd to'lov`;

  return (
    <div className="view rst-detail-view">
      <button className="rst-back" onClick={() => { haptic(); onBack(); }}><RstIcon name="chevron-left" size={13} />Orqaga</button>

      <div className={"rst-track-hero" + (terminated ? " off" : "")}>
        <div className="rst-track-no">Buyurtma №{order.id}</div>
        <div className="rst-track-title">
          {terminated ? (order.status === "rejected" ? "Rad etildi" : "Bekor qilindi") : (order.status === "pending" ? "Kutilmoqda" : steps[i]![0])}
        </div>
        <div className="rst-track-sub">{terminated ? (order.rejectReason || "Buyurtma yopildi") : headSub}</div>
        {!terminated && (
          <div className="rst-track-bars">
            {[0, 1, 2, 3].map((n) => <span key={n} className={n < i || (n === i && done) ? "on" : ""} />)}
          </div>
        )}
      </div>

      {!terminated && (
        <div className="rst-card-plain">
          {steps.map(([title, sub], n) => {
            const complete = n < i || (n === i && done);
            const active = n === i && !done;
            return (
              <div key={title} className="rst-tl-row">
                <div className="rst-tl-rail">
                  <span className={"rst-tl-dot" + (complete || active ? " on" : "") + (active ? " live" : "")} />
                  {n < steps.length - 1 && <span className={"rst-tl-line" + (complete ? " on" : "")} />}
                </div>
                <div className="rst-tl-body">
                  {/* pending — 0-qadam HALI bajarilmagan. Sarlavha ham, izoh ham almashadi:
                      «Qabul qilindi» deb turib «operator bog'lanmoqda» deyish qarama-qarshi
                      signal berardi (B4 QA'da aynan shu ko'rindi). */}
                  <div className={"rst-tl-title" + (complete || active ? "" : " next")}>
                    {active && order.status === "pending" && n === 0 ? "Yuborildi" : title}
                  </div>
                  <div className="rst-tl-sub">
                    {active && order.status === "pending" && n === 0 ? "Operator restoran bilan bog'lanmoqda" : sub}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Aloqa — dizaynda restoranga qo'ng'iroq. Bizda V1 CONCIERGE: restoran bilan OPERATOR
          gaplashadi, mijozning restoran telefoni yo'q (FoodOrderView'da ham kelmaydi).
          Shuning uchun aloqa botga — ya'ni operatorga — olib boradi. */}
      <div className="rst-card-plain rst-contact">
        <div className="rst-contact-ic"><RstIcon name="phone" size={19} /></div>
        <div className="rst-contact-body">
          <div className="rst-contact-name">{order.restaurantName}</div>
          <div className="rst-contact-sub">Savol bo'lsa yozing</div>
        </div>
        <button className="rst-contact-btn" onClick={() => {
          haptic();
          const url = "https://t.me/koson1067bot";
          const t = tg as unknown as { openTelegramLink?: (u: string) => void } | undefined;
          if (t?.openTelegramLink) t.openTelegramLink(url); else window.open(url, "_blank");
        }}>Aloqa</button>
      </div>

      <div className="rst-card-plain">
        {order.itemsJson.map((it) => (
          <div key={it.menuItemId} className="rst-tot"><span>{it.qty}× {it.name}</span><span>{formatNumber(it.priceSom * it.qty)} so'm</span></div>
        ))}
        {/* Yetkazish qatori dizaynda yo'q edi — usiz taomlar summasi bilan «Jami» orasidagi farq
            tushuntirilmay qolardi (84 000 → 92 000). Mijoz naqd to'laydi, raqam aniq bo'lsin. */}
        {order.deliveryFeeSom > 0 && (
          <div className="rst-tot"><span>Yetkazish</span><span>{formatNumber(order.deliveryFeeSom)} so'm</span></div>
        )}
        <div className="rst-tot grand"><span>Jami (naqd)</span><span>{formatNumber(order.totalSom)} so'm</span></div>
      </div>

      {order.status === "delivered" && (
        <button className="rst-cta" onClick={() => { haptic(); setRating(true); }}>Bahoni qoldirish</button>
      )}
      {rating && (
        <RateSheet
          restaurantId={order.restaurantId} restaurantName={order.restaurantName}
          onClose={() => setRating(false)} onDone={(m) => onBanner?.(m)}
        />
      )}
    </div>
  );
}

function Stars({ v }: { v: number }) {
  const full = Math.round(v);
  return (
    <span className="svc-stars" aria-label={`${v} yulduz`}>
      {[1, 2, 3, 4, 5].map((i) => <span key={i} className={i <= full ? "on" : ""}><RstIcon name="star" size={12} /></span>)}
    </span>
  );
}

function ReviewSection({ restaurantId, onBanner }: { restaurantId: number; onBanner?: (msg: string) => void }) {
  const [data, setData] = useState<import("@t1067/shared").RestaurantReviewsResponse | null>(null);
  const [stars, setStars] = useState(0);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => api.restoranReviews(restaurantId).then((d) => {
    setData(d);
    setStars(d.myReview?.stars ?? 0);
    setText(d.myReview?.text ?? "");
  }).catch(() => undefined);
  useEffect(() => { load(); }, [restaurantId]);

  const submit = async () => {
    if (stars < 1) return;
    haptic();
    setBusy(true);
    const r = await api.restoranReviewSubmit(restaurantId, stars, text).catch(() => ({ ok: false as const }));
    setBusy(false);
    if (r.ok) { hapticSuccess(); load(); } else onBanner?.("Baho yuborilmadi — qayta urinib ko'ring");
  };

  if (!data) return null;
  return (
    <div className="rst-section">
      <div className="rst-section-title">Baholang</div>
      <div className="rst-stars-input">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} className={n <= stars ? "on" : ""} onClick={() => { haptic(); setStars(n); }} aria-label={`${n} yulduz`}>
            <RstIcon name="star" size={26} />
          </button>
        ))}
      </div>
      {stars > 0 && (
        <>
          <input className="bk-input mt8" placeholder="Sharh (ixtiyoriy)" value={text} onChange={(e) => setText(e.target.value)} maxLength={280} />
          <Button variant="brand" sm disabled={busy} onClick={submit}>{data.myReview ? "Yangilash" : "Yuborish"}</Button>
        </>
      )}
      {data.reviews.length > 0 && (
        <div style={{ marginTop: 10 }}>
          {data.reviews.map((rv) => (
            <div key={rv.id} className="rst-review-row">
              <Stars v={rv.stars} />
              {rv.text && <span className="muted fs12"> {rv.text}</span>}
              {rv.mine && <span className="muted fs11"> · siz</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** 🍲 Taom kartochkasi — dizayndagi eng katta YANGI element (README §3).
 *  `qty` — savatdagi joriy son (0 bo'lishi mumkin); `onApply` uni O'RNATADI. */
function DishSheet({ item, qty, onClose, onApply }: { item: MenuItemView; qty: number; onClose: () => void; onApply: (n: number) => void }) {
  const [n, setN] = useState(Math.max(1, qty));
  return (
    <Sheet open onClose={onClose}>
      <div className="rst-dish">
        {item.hasPhoto ? (
          <img className="rst-dish-photo" src={apiUrl(`/api/restoran/menuphoto/${item.id}`)} onError={photoFallback(item.id)} alt="" />
        ) : (
          <div className="rst-dish-photo rst-card-noimg" style={{ backgroundImage: fallbackBg(item.id) }}>
            <RstIcon name="plate" size={54} />
          </div>
        )}
        <div className="rst-dish-body">
          <div className="rst-dish-name">{item.name}</div>
          {/* Dizaynda bu yerda «1 kishilik · ~450 g · Achchiq emas» chiplari bor. Bizning
              MenuItem'da bunday maydonlar YO'Q (faqat `desc`), shuning uchun chiplar
              chizilmaydi — o'ylab topilgan porsiya/og'irlik yozish mijozni aldash bo'lardi.
              Ular kerak bo'lsa schema'ga alohida maydon qo'shiladi (V2 taklifi). */}
          {item.desc && <div className="rst-dish-desc">{item.desc}</div>}
          <div className="rst-dish-price">{formatNumber(item.priceSom)} so'm</div>
        </div>
        <div className="rst-dish-bar">
          <div className="rst-dish-step">
            <button onClick={() => { haptic(); setN((v) => Math.max(0, v - 1)); }} aria-label="Kamaytirish"><RstIcon name="minus" size={16} /></button>
            <span>{n}</span>
            <button onClick={() => { haptic(); setN((v) => Math.min(20, v + 1)); }} aria-label="Ko'paytirish"><RstIcon name="plus" size={16} /></button>
          </div>
          <button className={"rst-dish-cta" + (n === 0 ? " remove" : "")} onClick={() => onApply(n)}>
            {n === 0 ? "Savatdan olib tashlash" : `Savatga · ${formatNumber(item.priceSom * n)} so'm`}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

function RestaurantDetail({ id, me, initialCart, initialPickup, onBack, onBanner, onOrdered }: { id: number; me: MeResponse; initialCart?: Record<number, number> | null; initialPickup?: boolean; onBack: () => void; onBanner?: (msg: string) => void; onOrdered: (orderId: number) => void }) {
  const [data, setData] = useState<{ restaurant: RestaurantView | null; items: MenuItemView[] } | null>(null);
  // Tarmoq xatosi «restoran topilmadi» dan FARQ qiladi: birinchisida qayta urinish mumkin,
  // ikkinchisida restoran haqiqatan yo'q. Ilgari ikkalasi bir xil matn berardi.
  const [dataErr, setDataErr] = useState(false);
  const [reload, setReload] = useState(0);
  const [cart, setCart] = useState<Record<number, number>>({});
  // 🧭 Dizaynda savat va checkout — ALOHIDA EKRANLAR (rest → cart → checkout), varaq emas.
  // Ilgari ikkalasi bitta `Sheet` ichida siqilgan edi: savat qatorlarida stepper yo'q edi,
  // ya'ni sonni kamaytirish umuman imkonsiz edi.
  const [step, setStep] = useState<"menu" | "cart" | "checkout">("menu");
  // Katalogdagi rejim shu yerga uzatiladi — mijoz «Olib ketish»ni tepada tanlagan bo'lsa,
  // checkout'da uni QAYTA tanlashi kerak emas (dizayn: rejim butun oqimni belgilaydi).
  const [isPickup, setIsPickup] = useState(!!initialPickup);
  // ‹ Ierarxik orqaga: checkout → cart → menu (dizayn §Interactions). Prioritet 2 — katalogning
  // «restorandan chiqish» ishlov beruvchisidan (1) ustun, ya'ni avval ichki qadam qaytariladi.
  useBackButton(step !== "menu", () => setStep((s) => (s === "checkout" ? "cart" : "menu")), 2);
  const [address, setAddress] = useState(() => { try { return localStorage.getItem(LAST_ADDR_KEY) ?? ""; } catch { return ""; } });
  // Checkout maydonlari dizaynda O'QISH-uchun qatorlar (yorliq + qiymat) — tahrirlash oqimi
  // chizilmagan. Bosilganda bitta maydonli varaq ochiladi: eng kam qadam, ekran tuzilishi buzilmaydi.
  const [edit, setEdit] = useState<null | "address" | "contact" | "note">(null);
  const [contact, setContact] = useState(me.member.phone ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  // 🍲 Taom kartochkasi (dizayndagi eng katta YANGI element) + yopishqoq bo'lim chiplari.
  const [dish, setDish] = useState<MenuItemView | null>(null);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  useBackButton(dish !== null, () => setDish(null), 3);

  // Scroll-spy: chiplar tepasidagi «chiziq»dan O'TGAN oxirgi bo'lim aktiv bo'ladi.
  // IntersectionObserver bilan boshlangan edi va NOTO'G'RI ishladi: allaqachon yuqoriga surilib
  // ketgan uzun bo'lim hamon «kesishayotgan» bo'lib qolardi va `rect.top` bo'yicha eng kichigi
  // sifatida doim g'olib chiqardi (QA: uchinchi bo'limga o'tilsa ham birinchi chip yonib turardi).
  // To'g'ridan-to'g'ri o'lchash ancha aniq va o'qishga oson.
  useEffect(() => {
    const nodes = Object.values(sectionRefs.current).filter(Boolean) as HTMLDivElement[];
    if (nodes.length < 2) return;
    // Konteynerni TOPAMIZ, taxmin qilmaymiz. `.content` deb yozilgan edi va ishlamadi: u
    // `overflow: visible` — surilish oynaning o'ziga o'tadi, ya'ni `scroll` hodisasi u yerda
    // hech qachon otilmasdi. Boshqa ekranlarda esa haqiqiy scroll-div bo'lishi mumkin.
    const findScroller = (el: HTMLElement): HTMLElement | null => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const oy = getComputedStyle(p).overflowY;
        if ((oy === "auto" || oy === "scroll") && p.scrollHeight > p.clientHeight + 2) return p;
      }
      return null; // oyna suriladi
    };
    const scroller = findScroller(nodes[0]!);
    const target: HTMLElement | Window = scroller ?? window;
    let raf = 0;
    const pick = () => {
      raf = 0;
      const line = (scroller ? scroller.getBoundingClientRect().top : 0) + 96; // chiplar ostidagi chiziq
      let cur = nodes[0]!;
      for (const n of nodes) if (n.getBoundingClientRect().top <= line) cur = n;
      setActiveSection(cur.dataset.section ?? null);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(pick); };
    pick();
    target.addEventListener("scroll", onScroll, { passive: true });
    return () => { target.removeEventListener("scroll", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [data]);

  useEffect(() => {
    setData(null);
    setDataErr(false);
    api.restoranDetail(id).then((d) => {
      setData(d);
      if (initialCart) {
        const validIds = new Set(d.items.filter((it) => it.available).map((it) => it.id));
        const seeded = Object.fromEntries(Object.entries(initialCart).filter(([k]) => validIds.has(Number(k))));
        setCart(seeded);
        if (Object.keys(seeded).length < Object.keys(initialCart).length) onBanner?.("Ba'zi taomlar endi mavjud emas — savatga qo'shilmadi");
      } else {
        setCart({});
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }).catch(() => { setData({ restaurant: null, items: [] }); setDataErr(true); });
  }, [id, reload]);

  const itemOf = useMemo(() => new Map((data?.items ?? []).map((it) => [it.id, it])), [data]);
  const cartLines = useMemo(
    () => Object.entries(cart).filter(([, qty]) => qty > 0).map(([mid, qty]) => ({ item: itemOf.get(Number(mid))!, qty })).filter((l) => l.item),
    [cart, itemOf],
  );
  const itemsTotalSom = cartLines.reduce((s, l) => s + l.item.priceSom * l.qty, 0);
  const cartCount = cartLines.reduce((s, l) => s + l.qty, 0);

  const setQty = (menuItemId: number, delta: number) => {
    haptic();
    setCart((c) => {
      const next = Math.max(0, Math.min(20, (c[menuItemId] ?? 0) + delta));
      return { ...c, [menuItemId]: next };
    });
  };
  /** Aniq son o'rnatish (taom kartochkasidan). 0 = savatdan chiqarish. */
  const setQtyAbs = (menuItemId: number, n: number) => {
    hapticSuccess();
    setCart((c) => ({ ...c, [menuItemId]: Math.max(0, Math.min(20, n)) }));
  };

  const submit = async () => {
    if (!data?.restaurant || busy) return;
    if (!isPickup && address.trim().length < 5) { onBanner?.("Manzilni to'liqroq yozing (kamida 5 belgi)"); return; }
    setBusy(true);
    try {
      const r = await api.restoranOrder({
        restaurantId: data.restaurant.id,
        items: cartLines.map((l) => ({ menuItemId: l.item.id, qty: l.qty })),
        address, contact, note, isPickup,
      });
      if (r.ok && r.orderId) {
        hapticSuccess();
        try { if (!isPickup) localStorage.setItem(LAST_ADDR_KEY, address.trim()); } catch { /* private mode */ }
        setCart({});
        setStep("menu");
        onOrdered(r.orderId); // → holat ekrani
      } else {
        const msgs: Record<string, string> = {
          off: "Xizmat hozircha yopiq",
          unavailable: "Restoran hozircha mavjud emas",
          paused: "Restoran vaqtincha to'xtatilgan",
          closed: "Restoran hozir yopiq",
          empty_cart: "Savat bo'sh",
          bad_item: "Menyu yangilangan — qaytadan tanlang",
          below_min: `Minimal buyurtma ${data.restaurant.minOrderSom > 0 ? formatNumber(data.restaurant.minOrderSom) + " so'm" : ""}`,
          bad_address: "Manzilni to'liqroq yozing",
          pending_limit: "Sizda kutilayotgan buyurtmalar ko'p — birortasi tugashini kuting",
        };
        onBanner?.(msgs[r.reason ?? ""] ?? "Xatolik yuz berdi");
      }
    } catch {
      onBanner?.("Xatolik yuz berdi — qayta urinib ko'ring");
    } finally {
      setBusy(false);
    }
  };

  if (!data) {
    return (
      <div className="view">
        <button className="rst-back" onClick={() => { haptic(); onBack(); }}><RstIcon name="chevron-left" size={13} />Orqaga</button>
        <Skeleton h={140} />
        <div style={{ height: 12 }} />
        <Skeleton h={60} />
      </div>
    );
  }
  if (!data.restaurant) {
    return (
      <div className="view">
        <button className="rst-back" onClick={() => { haptic(); onBack(); }}><RstIcon name="chevron-left" size={13} />Orqaga</button>
        {dataErr
          ? <LoadError onRetry={() => setReload((n) => n + 1)} />
          : <EmptyState icon={<RstIcon name="plate" size={34} />} text="Restoran topilmadi" />}
      </div>
    );
  }
  // `done` endi ishlatilmaydi: buyurtma yuborilgach mijoz TO'G'RIDAN holat ekraniga o'tadi
  // (RestoranView `onOrdered` orqali). Ilgari bitta «qabul qilindi» yozuvi chiqib, mijoz
  // kutish davomida hech narsa ko'rmasdi — bu bo'limning eng katta bo'shlig'i edi.
  const r = data.restaurant;
  const closed = openNow(r.workHours) === false;
  const sections = new Map<string, MenuItemView[]>();
  for (const it of data.items) {
    if (!sections.has(it.section)) sections.set(it.section, []);
    sections.get(it.section)!.push(it);
  }

  // ── Savat/checkout uchun umumiy hisoblar ────────────────────────────────────────────────────
  const feeSom = isPickup ? 0 : r.deliveryFeeSom;
  const grandSom = itemsTotalSom + feeSom;
  const missingSom = Math.max(0, r.minOrderSom - itemsTotalSom);
  const minOk = missingSom === 0;

  /** Totallar kartasi — savatda ham, checkout'da ham AYNAN bir xil (dizayn talabi). */
  const Totals = (
    <div className="rst-card-plain">
      <div className="rst-tot"><span>Taomlar</span><span>{formatNumber(itemsTotalSom)} so'm</span></div>
      <div className="rst-tot">
        <span>{isPickup ? "Yetkazish yo'q" : "Yetkazish"}</span>
        <span>{isPickup ? "—" : r.deliveryFeeSom > 0 ? `${formatNumber(r.deliveryFeeSom)} so'm` : "—"}</span>
      </div>
      <div className="rst-tot grand"><span>Jami (naqd)</span><span>{formatNumber(grandSom)} so'm</span></div>
    </div>
  );

  /** Bitta maydonli tahrir-varag'i (manzil / telefon / izoh). */
  const editSheet = (() => {
    if (!edit) return null;
    const cfg = {
      address: { title: "Yetkazish manzili", value: address, set: setAddress, ph: "Ko'cha, uy, mo'ljal — masalan: Ohangaron 14, ko'k darvoza", max: 120, min: 5 },
      contact: { title: "Telefon", value: contact, set: setContact, ph: "+998 90 123 45 67", max: 20, min: 7 },
      note: { title: "Izoh", value: note, set: setNote, ph: "Masalan: achchiq solmang, 2 ta non qo'shing…", max: 200, min: 0 },
    }[edit];
    return (
      <Sheet open onClose={() => setEdit(null)}>
        <h3>{cfg.title}</h3>
        <input
          className="bk-input mt8" autoFocus value={cfg.value} maxLength={cfg.max}
          onChange={(e) => cfg.set(e.target.value)} placeholder={cfg.ph}
        />
        <Button variant="brand" disabled={cfg.value.trim().length < cfg.min} onClick={() => {
          if (edit === "address") { try { localStorage.setItem(LAST_ADDR_KEY, address.trim()); } catch { /* private mode */ } }
          hapticSuccess(); setEdit(null);
        }}>Saqlash</Button>
      </Sheet>
    );
  })();

  // ── 🛒 SAVAT EKRANI (README §4) ─────────────────────────────────────────────────────────────
  if (step === "cart") {
    return (
      <div className="view rst-detail-view">
        <button className="rst-back" onClick={() => { haptic(); setStep("menu"); }}><RstIcon name="chevron-left" size={13} />Orqaga</button>
        {cartLines.length === 0 ? (
          <EmptyState icon={<RstIcon name="orders" size={34} />} text="Savat bo'sh" action="Menyuga qaytish" onAction={() => setStep("menu")} />
        ) : (
          <>
            <div className="rst-card-plain">
              <div className="rst-lbl">Restoran</div>
              <div className="rst-cart-rest">{r.name}</div>
              <div className="rst-hr" />
              {cartLines.map((l) => (
                <div key={l.item.id} className="rst-cart-row">
                  {l.item.hasPhoto ? (
                    <img className="rst-cart-photo" src={apiUrl(`/api/restoran/menuphoto/${l.item.id}`)} onError={photoFallback(l.item.id)} loading="lazy" alt="" />
                  ) : (
                    <div className="rst-cart-photo rst-card-noimg" style={{ backgroundImage: fallbackBg(l.item.id) }}>
                      <RstIcon name="plate" size={18} />
                    </div>
                  )}
                  <div className="rst-cart-body">
                    <div className="rst-cart-name">{l.item.name}</div>
                    <div className="rst-cart-mul">{formatNumber(l.item.priceSom)} × {l.qty}</div>
                  </div>
                  {/* Nihoyat kamaytirish yo'li: dizaynda stepper AYNAN shu ekranda. */}
                  <div className="rst-item-stepper">
                    <button onClick={() => setQty(l.item.id, -1)} aria-label="Kamaytirish"><RstIcon name="minus" size={14} /></button>
                    <span>{l.qty}</span>
                    <button onClick={() => setQty(l.item.id, 1)} aria-label="Ko'paytirish"><RstIcon name="plus" size={14} /></button>
                  </div>
                </div>
              ))}
            </div>

            {Totals}

            {!minOk && (
              <div className="rst-warn">
                Bu restoranda minimal buyurtma {formatNumber(r.minOrderSom)} so'm.
                Yana {formatNumber(missingSom)} so'm qo'shsangiz yuborish mumkin.
              </div>
            )}

            <div className="rst-note">
              To'lov — yetkazib berilganda naqd pulda. Buyurtmani operator restoran bilan tasdiqlaydi.
            </div>

            <button
              className={"rst-cta" + (minOk ? "" : " off")}
              onClick={() => { haptic(); if (minOk) setStep("checkout"); else onBanner?.(`Yana ${formatNumber(missingSom)} so'm qo'shing`); }}
            >
              {minOk ? `Rasmiylashtirish · ${formatNumber(grandSom)} so'm` : "Minimal summa yetmadi"}
            </button>
          </>
        )}
        {editSheet}
      </div>
    );
  }

  // ── 🧾 CHECKOUT EKRANI (README §5) ──────────────────────────────────────────────────────────
  if (step === "checkout") {
    const fields: { label: string; value: string; edit?: "address" | "contact" }[] = isPickup
      ? [
          { label: "Olib ketish manzili", value: r.address ? `${r.name}, ${r.address}` : r.name },
          { label: "Tayyor bo'ladi", value: `Taxminan ${r.prepMinutes} daqiqada` },
          { label: "Telefon", value: contact || "Kiritilmagan", edit: "contact" },
        ]
      : [
          { label: "Yetkazish manzili", value: address.trim() || "Kiritilmagan", edit: "address" },
          { label: "Telefon", value: contact || "Kiritilmagan", edit: "contact" },
          { label: "Yetkazish vaqti", value: `Tezroq · ~${r.prepMinutes} daq` },
        ];
    // Dizaynda CTA doim yashil va faol. Realda u o'chib qolishi mumkin (manzil/telefon yo'q) —
    // va o'chiq tugma SABABINI aytmasa, mijoz nima qilishini bilmay ekranda qotib qoladi.
    // Shuning uchun o'chiq holatda tugma NIMA YETISHMAYOTGANINI yozadi va bosilganda to'g'ri
    // maydonni ochadi, ya'ni boshi berk ko'cha bo'lmaydi.
    const blocker: { text: string; open?: "address" | "contact" } | null =
      !minOk ? { text: "Minimal summa yetmadi" }
      : !isPickup && address.trim().length < 5 ? { text: "Manzilni kiriting", open: "address" }
      : contact.trim().length < 7 ? { text: "Telefonni kiriting", open: "contact" }
      : null;
    const ready = !busy && !blocker;
    return (
      <div className="view rst-detail-view">
        <button className="rst-back" onClick={() => { haptic(); setStep("cart"); }}><RstIcon name="chevron-left" size={13} />Orqaga</button>

        <div className="rst-card-plain">
          {fields.map((f) => (
            <button key={f.label} className={"rst-field" + (f.edit ? "" : " static")} onClick={() => { if (f.edit) { haptic(); setEdit(f.edit); } }}>
              <span className="rst-lbl">{f.label}</span>
              <span className="rst-field-val">{f.value}{f.edit && <RstIcon name="chevron-down" size={9} />}</span>
            </button>
          ))}
        </div>

        {/* 💳 Dizaynda bu yerda «Karta · Tez kunda» o'chiq kartasi ham bor edi — EGA QARORI
            (2026-07-29) bilan olib tashlandi: bermaydigan va'da bermaymiz («Bepul yetkazish»
            badge'i ham shu sababdan yo'q). To'lov integratsiyasi qo'shilganda qaytariladi. */}
        <div className="rst-lbl mt14">To'lov turi</div>
        <div className="rst-pay">
          <div className="rst-pay-card on">
            <b>Naqd</b>
            <span>Yetkazishda to'lanadi</span>
          </div>
        </div>

        <button className="rst-card-plain rst-note-card mt14" onClick={() => { haptic(); setEdit("note"); }}>
          <span className="rst-lbl">Izoh</span>
          <span className={"rst-field-val" + (note.trim() ? "" : " ph")}>
            {note.trim() || "Masalan: achchiq solmang, 2 ta non qo'shing…"}
            <RstIcon name="chevron-down" size={9} />
          </span>
        </button>

        {Totals}

        <button
          className={"rst-cta send" + (ready ? "" : " off")}
          onClick={() => { haptic(); if (ready) submit(); else if (blocker?.open) setEdit(blocker.open); else setStep("cart"); }}
        >
          {busy ? "Yuborilmoqda…" : blocker ? blocker.text : `Buyurtmani yuborish · ${formatNumber(grandSom)} so'm`}
        </button>
        {editSheet}
      </div>
    );
  }

  const sectionNames = [...sections.keys()];
  const heroMeta = [CAT_LABEL[r.category] ?? r.category, `~${r.prepMinutes} daq`, r.deliveryFeeSom > 0 ? `yetkazish ${formatNumber(r.deliveryFeeSom)} so'm` : null]
    .filter(Boolean).join(" · ");

  return (
    <div className="view rst-detail-view">
      <button className="rst-back" onClick={() => { haptic(); onBack(); }}><RstIcon name="chevron-left" size={13} />Orqaga</button>

      {/* ── Hero 168px: foto + pastdan qorayish, ustida nom va meta (README §2) ── */}
      <div className="rst-hero">
        {r.hasPhoto ? (
          <img className="rst-hero-photo" src={apiUrl(`/api/restoran/photo/${r.id}`)} onError={photoFallback(r.id)} alt="" />
        ) : (
          <div className="rst-hero-photo rst-card-noimg" style={{ backgroundImage: fallbackBg(r.id) }}>
            <RstIcon name="plate" size={46} />
          </div>
        )}
        <div className="rst-hero-info">
          <div className="rst-hero-name">{r.name}</div>
          <div className="rst-hero-meta">{heroMeta}</div>
        </div>
      </div>

      {/* ── Info qatori: reyting · ish vaqti · Ochiq/Yopiq ──
          JONLI MA'LUMOT SABOG'I (2026-07-29): 11 faol restorandan 9 tasida `workHours` YO'Q va
          ko'pchiligida reyting ham 0. U holda bu qator BO'SH chiziqli plashka bo'lib qolardi —
          dizaynda hech qachon bo'lmagan holat, chunki prototipdagi har restoranda ikkalasi ham
          bor edi. Endi ichida hech narsa bo'lmasa qator umuman chizilmaydi. Ajratkich ham faqat
          ikkala tomonida kontent bo'lsa qo'yiladi. */}
      {(r.avgRating > 0 || !!r.workHours) && (
        <div className="rst-info">
          {r.avgRating > 0 && (
            <span className="rst-rating"><RstIcon name="star" size={13} />{r.avgRating.toFixed(1)}
              {r.reviewCount > 0 && <i className="rst-rating-n">({r.reviewCount})</i>}
            </span>
          )}
          {r.avgRating > 0 && !!r.workHours && <i className="rst-info-div" />}
          {r.workHours && <span className="rst-info-hours">{r.workHours}</span>}
          <span className="rst-info-state"><OpenBadge wh={r.workHours} /></span>
        </div>
      )}
      {r.address && <div className="rst-info-addr">{r.address}</div>}

      {data.items.length === 0 ? (
        <EmptyState icon={<RstIcon name="orders" size={34} />} text="Menyu hali kiritilmagan" />
      ) : (
        <>
          {/* Bo'lim chiplari — yopishqoq. Bittagina bo'lim bo'lsa chizilmaydi: u holda chip
              hech qayerga olib bormaydi, faqat joy egallaydi. */}
          {sectionNames.length > 1 && (
            <div className="rst-sec-tabs">
              {sectionNames.map((s) => (
                <button
                  key={s} className={"rst-chip" + (activeSection === s ? " on" : "")}
                  onClick={() => { haptic(); sectionRefs.current[s]?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          {[...sections.entries()].map(([section, items]) => (
          <div key={section} className="rst-section" data-section={section} ref={(el) => { sectionRefs.current[section] = el; }}>
            <div className="rst-section-title">{section}</div>
            {items.map((it) => {
              const qty = cart[it.id] ?? 0;
              const buyable = it.available && !closed;
              return (
                <div
                  key={it.id} className={"rst-item" + (it.available ? "" : " unavailable")}
                  onClick={() => { if (buyable) { haptic(); setDish(it); } }}
                >
                  {it.hasPhoto ? (
                    <img className="rst-item-photo" src={apiUrl(`/api/restoran/menuphoto/${it.id}`)} onError={photoFallback(it.id)} loading="lazy" decoding="async" alt="" />
                  ) : (
                    <div className="rst-item-photo rst-card-noimg" style={{ backgroundImage: fallbackBg(it.id) }}>
                      <RstIcon name="plate" size={26} />
                    </div>
                  )}
                  <div className="rst-item-body">
                    <div className="rst-item-name">{it.name}</div>
                    {it.desc && <div className="rst-item-desc">{it.desc}</div>}
                    <div className="rst-item-price">{formatNumber(it.priceSom)} so'm{!it.available && " · tugagan"}</div>
                  </div>
                  {/* Dizayn: savatda bo'lmasa «+», bo'lsa yashil «N ta». Bosilganda modal
                      OCHILMAYDI (stopPropagation) — to'g'ridan savatga qo'shiladi. Kamaytirish
                      taom kartochkasi ichida (stepper) yoki savatda. */}
                  {buyable && (
                    <button
                      className={"rst-item-add" + (qty > 0 ? " in" : "")}
                      onClick={(e) => { e.stopPropagation(); setQty(it.id, 1); }}
                      aria-label={qty > 0 ? `Savatda ${qty} ta, yana qo'shish` : "Savatga qo'shish"}
                    >
                      {qty > 0 ? `${qty} ta` : <RstIcon name="plus" size={14} />}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        </>
      )}
      <ReviewSection restaurantId={r.id} onBanner={onBanner} />

      {/* ── 🍲 Taom kartochkasi (README §3) ────────────────────────────────────────────────────
          Prototipda stepper HAR DOIM 1 dan boshlanadi va CTA savatga QO'SHADI. Bu yerda stepper
          savatdagi JORIY sonni ko'rsatadi va CTA uni O'RNATADI — chunki dizaynda ro'yxatdagi
          tugma faqat qo'sha oladi, ya'ni «qo'shish» semantikasi bilan mijozda kamaytirish yo'li
          umuman qolmasdi (savat ekrani B3'da). Ko'rinish o'zgarmadi, xatti-harakat xavfsizroq. */}
      {dish && <DishSheet item={dish} qty={cart[dish.id] ?? 0} onClose={() => setDish(null)} onApply={(n) => { setQtyAbs(dish.id, n); setDish(null); onBanner?.(n > 0 ? `${dish.name} savatga qo'shildi` : `${dish.name} savatdan olib tashlandi`); }} />}

      {cartCount > 0 && (
        <button className="rst-cart-bar" onClick={() => { haptic(); setStep("cart"); }}>
          <span className="rst-cart-badge">{cartCount}</span>
          <span>Savat</span>
          <b>{formatNumber(itemsTotalSom)} so'm</b>
        </button>
      )}
    </div>
  );
}

export function RestoranView({ me, onBanner, openRestaurantId }: { me: MeResponse; onBanner?: (msg: string) => void; openRestaurantId?: number | null }) {
  const [list, setList] = useState<RestaurantView[] | null>(null);
  const [listErr, setListErr] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [trackId, setTrackId] = useState<number | null>(null); // 📍 buyurtma holati ekrani
  const [reorderCart, setReorderCart] = useState<Record<number, number> | null>(null);
  const [q, setQ] = useState("");
  const [catFilter, setCatFilter] = useState<string>("all");
  // 🚚 Rejim katalog darajasida yashaydi va restoran sahifasiga uzatiladi (dizayn: «tanlangan
  // rejim checkout va timeline'ni butunlay belgilaydi»). Ega qarori: V1'da 2 ta — «Stol bron» va
  // «Stolda QR» qurilmaydi, lekin segment ularni keyin sig'diradigan qilib yozilgan.
  const [mode, setMode] = useState<"delivery" | "pickup">("delivery");
  const [addr, setAddr] = useState(() => { try { return localStorage.getItem(LAST_ADDR_KEY) ?? ""; } catch { return ""; } });
  const [addrOpen, setAddrOpen] = useState(false);
  const deepOpened = useRef(false);

  // ‹ ORQAGA: restoran ichidan / buyurtmalarim ekranidan apparat «orqaga» ilgari butun ilovani
  // yopardi. Prioritet 1 — qobiqning "tabdan Uy'ga" ishlov beruvchisidan ustun.
  useBackButton(openId !== null, () => setOpenId(null), 1);
  useBackButton(openId === null && ordersOpen, () => setOrdersOpen(false), 1);
  // Manzil varag'i katalog USTIDA ochiladi → prioriteti kattaroq (katalog = 1).
  useBackButton(openId === null && !ordersOpen && addrOpen, () => setAddrOpen(false), 2);

  const loadList = () => {
    setListErr(false);
    setList(null);
    api.restoranList().then((r) => setList(r.restaurants)).catch(() => { setList([]); setListErr(true); });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadList(); }, []);

  // 🏠 UY feed'dan bosilgan restoran (?openRestaurantId) — ro'yxat kelgach BIR marta avto-ochiladi.
  useEffect(() => {
    if (!openRestaurantId || deepOpened.current || !list) return;
    const r = list.find((x) => x.id === openRestaurantId);
    if (r) { deepOpened.current = true; setOpenId(r.id); }
  }, [openRestaurantId, list]);

  const cats = useMemo(() => Array.from(new Set((list ?? []).map((r) => r.category))), [list]);
  const filtered = useMemo(() => (list ?? [])
    .filter((r) => catFilter === "all" || r.category === catFilter)
    // 🚶 «Olib ketish» rejimida faqat shuni qo'llab-quvvatlaydigan restoranlar — aks holda mijoz
    // ichkariga kirib, checkout'da «olib ketish yo'q» degan devorga urilardi.
    .filter((r) => mode !== "pickup" || r.pickupEnabled)
    .filter((r) => { const t = q.trim().toLowerCase(); return !t || r.name.toLowerCase().includes(t); })
    // 🟢 OCHIQLAR BIRINCHI. Dizaynda saralash aytilmagan, lekin aralash ro'yxatda mijoz yopiq
    // restoranga kirib boshi berk ko'chaga uriladi (ichkarida hech narsa qo'sha olmaydi).
    // Ilgari buni «Ochiq hozir» filtr-chipi hal qilardi — u dizaynda yo'q va endi keraksiz:
    // saralash o'sha foydani bosish talab qilmasdan beradi.
    .sort((a, b) => Number(openNow(b.workHours) === true) - Number(openNow(a.workHours) === true)),
    [list, catFilter, mode, q]);

  // 📍 Holat ekrani hamma narsadan ustun: buyurtma yuborilgach mijoz TO'G'RIDAN shu yerga tushadi,
  // «Buyurtmalarim»dagi karta bosilganda ham shu ochiladi.
  if (trackId != null) {
    return (
      <OrderTrackView orderId={trackId} onBack={() => setTrackId(null)} onBanner={onBanner} />
    );
  }
  if (ordersOpen) {
    return (
      <MyOrdersView
        onBack={() => setOrdersOpen(false)}
        onOpen={(o) => setTrackId(o.id)}
        onReorder={(o) => {
          const cart = Object.fromEntries(o.itemsJson.map((i) => [i.menuItemId, i.qty]));
          setReorderCart(cart);
          setOrdersOpen(false);
          setOpenId(o.restaurantId);
        }}
      />
    );
  }
  if (openId != null) {
    return (
      <RestaurantDetail
        id={openId}
        me={me}
        initialCart={reorderCart}
        initialPickup={mode === "pickup"}
        onBack={() => { setOpenId(null); setReorderCart(null); }}
        onBanner={onBanner}
        onOrdered={(orderId) => { setOpenId(null); setReorderCart(null); setTrackId(orderId); }}
      />
    );
  }

  return (
    <div className="view rst-catalog">
      {/* ── Tepa blok: manzil + rejim + qidiruv + kategoriyalar. Dizaynda bularning hammasi
          BITTA oq maydonda turadi va ekran foni faqat kartalardan boshlanadi. ── */}
      <div className="rst-top">
        <div className="rst-addr-row">
          <button className="rst-addr" onClick={() => { haptic(); setAddrOpen(true); }}>
            <span className="rst-addr-label">Koson · {mode === "pickup" ? "olib ketish" : "yetkazib berish"}</span>
            <span className="rst-addr-value">
              {mode === "pickup" ? "Restorandan olasiz" : addr.trim() || "Manzilni kiriting"}
              {mode !== "pickup" && <RstIcon name="chevron-down" size={10} />}
            </span>
          </button>
          <button className="rst-orders-btn" onClick={() => { haptic(); setOrdersOpen(true); }} aria-label="Mening buyurtmalarim">
            <RstIcon name="orders" size={17} />
          </button>
        </div>

        <div className="rst-modes">
          {MODES.map((m) => (
            <button key={m.key} className={"rst-mode" + (mode === m.key ? " on" : "")} onClick={() => { haptic(); setMode(m.key); }}>
              {m.label}
            </button>
          ))}
        </div>

        <div className="rst-search">
          <RstIcon name="search" size={15} />
          <input className="bk-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Osh, somsa, burger, tort…" />
        </div>

        {cats.length > 1 && (
          <div className="rst-cat-row">
            <button className={"rst-chip" + (catFilter === "all" ? " on" : "")} onClick={() => { haptic(); setCatFilter("all"); }}>Hammasi</button>
            {cats.map((c) => (
              <button key={c} className={"rst-chip" + (catFilter === c ? " on" : "")} onClick={() => { haptic(); setCatFilter(c); }}>
                {CAT_LABEL[c] ?? c}
              </button>
            ))}
          </div>
        )}
      </div>

      {list === null ? (
        <CatalogSkeleton />
      ) : listErr ? (
        <LoadError onRetry={loadList} />
      ) : list.length === 0 ? (
        <EmptyState icon={<RstIcon name="plate" size={34} />} text="Hozircha restoran yo'q — tez orada qo'shiladi" />
      ) : (
        <>
          <div className="rst-list-head">
            <span>Kosondagi joylar</span>
            <span className="rst-list-count">{filtered.length} ta</span>
          </div>
          {filtered.length === 0 ? (
            <EmptyState icon={<RstIcon name="search" size={32} />} text="Mos restoran topilmadi" />
          ) : (
            <div className="rst-list">
              {filtered.map((r) => (
                <RestaurantCard key={r.id} r={r} onOpen={(x) => setOpenId(x.id)} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Manzil — dizaynda bosiladigan sarlavha, lekin tahrirlash oqimi chizilmagan. Eng kam
          qadamli variant: bitta maydonli varaq. Qiymat checkout bilan BIR XIL kalitda saqlanadi
          (LAST_ADDR_KEY), ya'ni bu yerda kiritilgan manzil checkout'da avtomatik turadi. */}
      <Sheet open={addrOpen} onClose={() => setAddrOpen(false)}>
        <h3>Yetkazish manzili</h3>
        <input
          className="bk-input mt8" autoFocus value={addr} maxLength={120}
          onChange={(e) => setAddr(e.target.value)}
          placeholder="Ko'cha, uy, mo'ljal — masalan: Ohangaron 14, ko'k darvoza"
        />
        <Button
          variant="brand" disabled={addr.trim().length < 5}
          onClick={() => { hapticSuccess(); try { localStorage.setItem(LAST_ADDR_KEY, addr.trim()); } catch { /* private mode */ } setAddrOpen(false); }}
        >
          Saqlash
        </Button>
      </Sheet>
    </div>
  );
}
