// 🍽 RESTORAN (feature "restoran", RESTORAN_PLAN.md) — R1 katalog + R2 savat/checkout + R3/R4
// operator/admin (server-side) + qulayliklar (bekor qilish, qayta buyurtma, qidiruv/filtr, sharh,
// mijozga push). V1 = CONCIERGE: narx REAL SO'M (D1), buyurtma operator orqali telefon bilan
// tayyorlanadi (admin panel orqali boshqariladi) — bu ekran faqat mijoz-tomon.
import { useEffect, useMemo, useRef, useState } from "react";
import type { FoodOrderView, MeResponse, MenuItemView, RestaurantView } from "@t1067/shared";
import { formatNumber } from "@t1067/shared";
import { api, apiUrl } from "./api";
import { haptic, hapticSuccess } from "./telegram";
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

function OpenBadge({ wh }: { wh?: string | null }) {
  const o = openNow(wh);
  if (o === null) return null;
  return <span className={"svc-open" + (o ? "" : " closed")}>{o ? "Ochiq" : "Yopiq"}{wh ? ` · ${wh}` : ""}</span>;
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
const fallbackBg = (id: number) => PHOTO_FALLBACKS[id % PHOTO_FALLBACKS.length];

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
          <img className="rst-card-photo" src={apiUrl(`/api/restoran/photo/${r.id}`)} loading="lazy" decoding="async" alt="" />
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

function MyOrdersView({ onBack, onReorder }: { onBack: () => void; onReorder: (o: FoodOrderView) => void }) {
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
      <button className="rst-back" onClick={onBack}><RstIcon name="chevron-left" size={13} />Orqaga</button>
      {orders === null ? (
        <><Skeleton h={70} /><div style={{ height: 8 }} /><Skeleton h={70} /></>
      ) : orders.length === 0 ? (
        <EmptyState icon={<RstIcon name="orders" size={34} />} text="Hali buyurtma yo'q" />
      ) : (
        orders.map((o) => {
          const s = STATUS_LABEL[o.status];
          return (
            <div key={o.id} className="rst-order-card">
              <div className="rst-order-top">
                <b>{o.restaurantName}</b>
                <span className={`order-status-pill ${s.c}`}>{s.t}</span>
              </div>
              <div className="rst-order-items muted fs12">{o.itemsJson.map((i) => `${i.name} ×${i.qty}`).join(", ")}</div>
              <div className="rst-order-bottom">
                <span>{o.isPickup ? "Olib ketish" : o.address}</span>
                <b>{formatNumber(o.totalSom)} so'm</b>
              </div>
              {o.status === "rejected" && o.rejectReason && <div className="rst-order-reason">Sabab: {o.rejectReason}</div>}
              {o.status === "pending" && (
                <button className="rst-order-cancel" disabled={busyId === o.id} onClick={() => cancel(o)}>Bekor qilish</button>
              )}
              {TERMINAL_STATUSES.has(o.status) && (
                <button className="rst-order-reorder" onClick={() => { haptic(); onReorder(o); }}>Yana shu</button>
              )}
            </div>
          );
        })
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

function RestaurantDetail({ id, me, initialCart, initialPickup, onBack, onBanner }: { id: number; me: MeResponse; initialCart?: Record<number, number> | null; initialPickup?: boolean; onBack: () => void; onBanner?: (msg: string) => void }) {
  const [data, setData] = useState<{ restaurant: RestaurantView | null; items: MenuItemView[] } | null>(null);
  const [cart, setCart] = useState<Record<number, number>>({});
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  // Katalogdagi rejim shu yerga uzatiladi — mijoz «Olib ketish»ni tepada tanlagan bo'lsa,
  // checkout'da uni QAYTA tanlashi kerak emas (dizayn: rejim butun oqimni belgilaydi).
  const [isPickup, setIsPickup] = useState(!!initialPickup);
  // ‹ Buyurtma-tasdiq varag'i restoran-sahifasi USTIDA ochiladi → prioritet 2 (restoran = 1).
  useBackButton(checkoutOpen, () => setCheckoutOpen(false), 2);
  const [address, setAddress] = useState(() => { try { return localStorage.getItem(LAST_ADDR_KEY) ?? ""; } catch { return ""; } });
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ orderId: number; totalSom: number } | null>(null);

  useEffect(() => {
    setData(null);
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
    }).catch(() => setData({ restaurant: null, items: [] }));
  }, [id]);

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

  const submit = async () => {
    if (!data?.restaurant || busy) return;
    if (!isPickup && address.trim().length < 5) { onBanner?.("Manzilni to'liqroq yozing (kamida 5 belgi)"); return; }
    setBusy(true);
    try {
      const r = await api.restoranOrder({
        restaurantId: data.restaurant.id,
        items: cartLines.map((l) => ({ menuItemId: l.item.id, qty: l.qty })),
        address, contact: me.member.phone ?? "", note, isPickup,
      });
      if (r.ok && r.orderId) {
        hapticSuccess();
        try { if (!isPickup) localStorage.setItem(LAST_ADDR_KEY, address.trim()); } catch { /* private mode */ }
        setDone({ orderId: r.orderId, totalSom: r.totalSom ?? 0 });
        setCart({});
        setCheckoutOpen(false);
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
        <button className="rst-back" onClick={onBack}><RstIcon name="chevron-left" size={13} />Orqaga</button>
        <Skeleton h={140} />
        <div style={{ height: 12 }} />
        <Skeleton h={60} />
      </div>
    );
  }
  if (!data.restaurant) {
    return (
      <div className="view">
        <button className="rst-back" onClick={onBack}><RstIcon name="chevron-left" size={13} />Orqaga</button>
        <EmptyState icon={<RstIcon name="plate" size={34} />} text="Restoran topilmadi" />
      </div>
    );
  }
  if (done) {
    return (
      <div className="view">
        <EmptyState icon={<RstIcon name="check" size={34} />} text={`Buyurtma qabul qilindi! #${done.orderId} · ${formatNumber(done.totalSom)} so'm. Tez orada operator siz bilan bog'lanadi.`} action="Orqaga" onAction={onBack} />
      </div>
    );
  }
  const r = data.restaurant;
  const closed = openNow(r.workHours) === false;
  const sections = new Map<string, MenuItemView[]>();
  for (const it of data.items) {
    if (!sections.has(it.section)) sections.set(it.section, []);
    sections.get(it.section)!.push(it);
  }

  return (
    <div className="view rst-detail-view">
      <button className="rst-back" onClick={onBack}><RstIcon name="chevron-left" size={13} />Orqaga</button>
      <div className="rst-hero">
        {r.hasPhoto ? (
          <img className="rst-hero-photo" src={apiUrl(`/api/restoran/photo/${r.id}`)} alt="" />
        ) : (
          <div className="rst-hero-photo rst-card-noimg"><RstIcon name="plate" size={54} /></div>
        )}
        <div className="rst-hero-info">
          <div className="rst-hero-name">{r.name}</div>
          <div className="rst-card-meta">
            <OpenBadge wh={r.workHours} />
            {r.avgRating > 0 && <span className="rst-rating"><RstIcon name="star" size={13} />{r.avgRating.toFixed(1)} ({r.reviewCount})</span>}
          </div>
          {r.address && <div className="muted fs12">{r.address}</div>}
          {/* Bu yerda tayyorlanish vaqti DOIM bor, shuning uchun qator hech qachon bo'sh emas. */}
          <div className="rst-card-fee">{feeLine(r, { long: true, extra: `~${r.prepMinutes} daq` })}</div>
        </div>
      </div>
      {data.items.length === 0 ? (
        <EmptyState icon={<RstIcon name="orders" size={34} />} text="Menyu hali kiritilmagan" />
      ) : (
        [...sections.entries()].map(([section, items]) => (
          <div key={section} className="rst-section">
            <div className="rst-section-title">{section}</div>
            {items.map((it) => {
              const qty = cart[it.id] ?? 0;
              return (
                <div key={it.id} className={"rst-item" + (it.available ? "" : " unavailable")}>
                  {it.hasPhoto ? (
                    <img className="rst-item-photo" src={apiUrl(`/api/restoran/menuphoto/${it.id}`)} loading="lazy" decoding="async" alt="" />
                  ) : (
                    <div className="rst-item-photo rst-card-noimg"><RstIcon name="plate" size={30} /></div>
                  )}
                  <div className="rst-item-body">
                    <div className="rst-item-name">{it.name}</div>
                    {it.desc && <div className="rst-item-desc">{it.desc}</div>}
                    <div className="rst-item-price">{formatNumber(it.priceSom)} so'm{!it.available && " · tugagan"}</div>
                  </div>
                  {it.available && !closed && (
                    qty === 0 ? (
                      <button className="rst-item-add" onClick={() => setQty(it.id, 1)} aria-label="Savatga qo'shish"><RstIcon name="plus" size={14} /></button>
                    ) : (
                      <div className="rst-item-stepper">
                        <button onClick={() => setQty(it.id, -1)} aria-label="Kamaytirish"><RstIcon name="minus" size={14} /></button>
                        <span>{qty}</span>
                        <button onClick={() => setQty(it.id, 1)} aria-label="Ko'paytirish"><RstIcon name="plus" size={14} /></button>
                      </div>
                    )
                  )}
                </div>
              );
            })}
          </div>
        ))
      )}
      <ReviewSection restaurantId={r.id} onBanner={onBanner} />
      {cartCount > 0 && (
        <button className="rst-cart-bar" onClick={() => { haptic(); setCheckoutOpen(true); }}>
          <span className="rst-cart-badge">{cartCount}</span>
          <span>Savat</span>
          <b>{formatNumber(itemsTotalSom)} so'm</b>
        </button>
      )}
      <Sheet open={checkoutOpen} onClose={() => setCheckoutOpen(false)}>
        <h3>Buyurtmani rasmiylashtirish</h3>
        {cartLines.map((l) => (
          <div key={l.item.id} className="rst-confirm-line">
            <span>{l.item.name} ×{l.qty}</span>
            <span>{formatNumber(l.item.priceSom * l.qty)} so'm</span>
          </div>
        ))}
        {r.pickupEnabled && (
          <div className="rst-pickup-toggle">
            <button className={!isPickup ? "on" : ""} onClick={() => { haptic(); setIsPickup(false); }}>Yetkazish</button>
            <button className={isPickup ? "on" : ""} onClick={() => { haptic(); setIsPickup(true); }}>Olib ketish</button>
          </div>
        )}
        {!isPickup && (
          <input className="bk-input mt8" placeholder="Manzil: Koson sh., ko'cha, uy" value={address} onChange={(e) => setAddress(e.target.value)} />
        )}
        <input className="bk-input mt8" placeholder="Izoh (ixtiyoriy)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
        <div className="rst-confirm-total">
          <span>Taomlar</span><span>{formatNumber(itemsTotalSom)} so'm</span>
        </div>
        {!isPickup && r.deliveryFeeSom > 0 && (
          <div className="rst-confirm-total"><span>Yetkazish</span><span>{formatNumber(r.deliveryFeeSom)} so'm</span></div>
        )}
        <div className="rst-confirm-total rst-confirm-grand">
          <span>Jami (naqd)</span><span>{formatNumber(itemsTotalSom + (isPickup ? 0 : r.deliveryFeeSom))} so'm</span>
        </div>
        <Button variant="brand" disabled={busy || (!isPickup && address.trim().length < 5) || (r.minOrderSom > 0 && itemsTotalSom < r.minOrderSom)} onClick={submit}>
          {busy ? "Yuborilmoqda..." : r.minOrderSom > 0 && itemsTotalSom < r.minOrderSom ? `Yana ${formatNumber(r.minOrderSom - itemsTotalSom)} so'm qo'shing` : "Buyurtma berish (naqd)"}
        </Button>
      </Sheet>
    </div>
  );
}

export function RestoranView({ me, onBanner, openRestaurantId }: { me: MeResponse; onBanner?: (msg: string) => void; openRestaurantId?: number | null }) {
  const [list, setList] = useState<RestaurantView[] | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [ordersOpen, setOrdersOpen] = useState(false);
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

  useEffect(() => {
    api.restoranList().then((r) => setList(r.restaurants)).catch(() => setList([]));
  }, []);

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

  if (ordersOpen) {
    return (
      <MyOrdersView
        onBack={() => setOrdersOpen(false)}
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
