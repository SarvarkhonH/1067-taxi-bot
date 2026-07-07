// 🍽 RESTORAN (feature "restoran", RESTORAN_PLAN.md) — R1 katalog + R2 savat/checkout. V1 =
// CONCIERGE: narx REAL SO'M (D1), buyurtma operator orqali telefon bilan tayyorlanadi (R3'da admin
// panel ustidan boshqariladi — bu ekran faqat mijoz-tomon: ko'rish → savat → buyurtma).
import { useEffect, useMemo, useState } from "react";
import type { FoodOrderView, MeResponse, MenuItemView, RestaurantView } from "@t1067/shared";
import { formatNumber } from "@t1067/shared";
import { api, apiUrl } from "./api";
import { haptic, hapticSuccess } from "./telegram";
import { Button, EmptyState, Sheet, Skeleton } from "./design/components";

const LAST_ADDR_KEY = "restoran_last_addr";

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

function RestaurantCard({ r, onOpen }: { r: RestaurantView; onOpen: (r: RestaurantView) => void }) {
  return (
    <button className="rst-card glass" onClick={() => { haptic(); onOpen(r); }}>
      <div className="rst-card-photo-wrap">
        {r.hasPhoto ? (
          <img className="rst-card-photo" src={apiUrl(`/api/restoran/photo/${r.id}`)} loading="lazy" decoding="async" alt="" />
        ) : (
          <div className="rst-card-photo rst-card-noimg">🍽</div>
        )}
      </div>
      <div className="rst-card-body">
        <div className="rst-card-name">{r.name}</div>
        <div className="rst-card-meta">
          <OpenBadge wh={r.workHours} />
          {r.avgRating > 0 && <span className="rst-rating">★ {r.avgRating.toFixed(1)}</span>}
        </div>
        <div className="rst-card-fee">
          {r.deliveryFeeSom > 0 ? `Yetkazish ${formatNumber(r.deliveryFeeSom)} so'm` : "Bepul yetkazish"}
          {r.minOrderSom > 0 && ` · min ${formatNumber(r.minOrderSom)}`}
        </div>
      </div>
    </button>
  );
}

function CatalogSkeleton() {
  return (
    <div className="rst-grid">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="rst-card glass">
          <Skeleton h={110} />
          <div style={{ padding: "10px 12px" }}>
            <Skeleton h={14} w="70%" />
            <div style={{ height: 6 }} />
            <Skeleton h={11} w="45%" />
          </div>
        </div>
      ))}
    </div>
  );
}

const STATUS_LABEL: Record<FoodOrderView["status"], { t: string; c: string }> = {
  pending: { t: "⏳ Kutilmoqda", c: "pending" },
  accepted: { t: "✅ Qabul qilindi", c: "delivered" },
  preparing: { t: "🍳 Tayyorlanmoqda", c: "delivered" },
  delivering: { t: "🛵 Yo'lda", c: "delivered" },
  delivered: { t: "✅ Yetkazildi", c: "delivered" },
  rejected: { t: "❌ Rad etildi", c: "rejected" },
  cancelled_by_user: { t: "✖ Bekor qilindi", c: "rejected" },
};

function MyOrdersView({ onBack }: { onBack: () => void }) {
  const [orders, setOrders] = useState<FoodOrderView[] | null>(null);
  useEffect(() => {
    api.restoranOrders().then((r) => setOrders(r.orders)).catch(() => setOrders([]));
  }, []);
  return (
    <div className="view">
      <button className="rst-back" onClick={onBack}>‹ Orqaga</button>
      {orders === null ? (
        <><Skeleton h={70} /><div style={{ height: 8 }} /><Skeleton h={70} /></>
      ) : orders.length === 0 ? (
        <EmptyState icon="📦" text="Hali buyurtma yo'q" />
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
            </div>
          );
        })
      )}
    </div>
  );
}

function RestaurantDetail({ id, me, onBack, onBanner }: { id: number; me: MeResponse; onBack: () => void; onBanner?: (msg: string) => void }) {
  const [data, setData] = useState<{ restaurant: RestaurantView | null; items: MenuItemView[] } | null>(null);
  const [cart, setCart] = useState<Record<number, number>>({});
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [isPickup, setIsPickup] = useState(false);
  const [address, setAddress] = useState(() => { try { return localStorage.getItem(LAST_ADDR_KEY) ?? ""; } catch { return ""; } });
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ orderId: number; totalSom: number } | null>(null);

  useEffect(() => {
    setData(null);
    setCart({});
    api.restoranDetail(id).then(setData).catch(() => setData({ restaurant: null, items: [] }));
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
        <button className="rst-back" onClick={onBack}>‹ Orqaga</button>
        <Skeleton h={140} />
        <div style={{ height: 12 }} />
        <Skeleton h={60} />
      </div>
    );
  }
  if (!data.restaurant) {
    return (
      <div className="view">
        <button className="rst-back" onClick={onBack}>‹ Orqaga</button>
        <EmptyState icon="🍽" text="Restoran topilmadi" />
      </div>
    );
  }
  if (done) {
    return (
      <div className="view">
        <EmptyState icon="✅" text={`Buyurtma qabul qilindi! #${done.orderId} · ${formatNumber(done.totalSom)} so'm. Tez orada operator siz bilan bog'lanadi.`} action="Orqaga" onAction={onBack} />
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
      <button className="rst-back" onClick={onBack}>‹ Orqaga</button>
      <div className="rst-hero">
        {r.hasPhoto ? (
          <img className="rst-hero-photo" src={apiUrl(`/api/restoran/photo/${r.id}`)} alt="" />
        ) : (
          <div className="rst-hero-photo rst-card-noimg">🍽</div>
        )}
        <div className="rst-hero-info">
          <div className="rst-hero-name">{r.name}</div>
          <div className="rst-card-meta">
            <OpenBadge wh={r.workHours} />
            {r.avgRating > 0 && <span className="rst-rating">★ {r.avgRating.toFixed(1)} ({r.reviewCount})</span>}
          </div>
          {r.address && <div className="muted fs12">{r.address}</div>}
          <div className="rst-card-fee">
            {r.deliveryFeeSom > 0 ? `Yetkazish ${formatNumber(r.deliveryFeeSom)} so'm` : "Bepul yetkazish"}
            {r.minOrderSom > 0 && ` · min buyurtma ${formatNumber(r.minOrderSom)} so'm`}
            {` · ~${r.prepMinutes} daq`}
          </div>
        </div>
      </div>
      {data.items.length === 0 ? (
        <EmptyState icon="📋" text="Menyu hali kiritilmagan" />
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
                    <div className="rst-item-photo rst-card-noimg">🍲</div>
                  )}
                  <div className="rst-item-body">
                    <div className="rst-item-name">{it.name}</div>
                    {it.desc && <div className="rst-item-desc">{it.desc}</div>}
                    <div className="rst-item-price">{formatNumber(it.priceSom)} so'm{!it.available && " · tugagan"}</div>
                  </div>
                  {it.available && !closed && (
                    qty === 0 ? (
                      <button className="rst-item-add" onClick={() => setQty(it.id, 1)}>+</button>
                    ) : (
                      <div className="rst-item-stepper">
                        <button onClick={() => setQty(it.id, -1)}>−</button>
                        <span>{qty}</span>
                        <button onClick={() => setQty(it.id, 1)}>+</button>
                      </div>
                    )
                  )}
                </div>
              );
            })}
          </div>
        ))
      )}
      {cartCount > 0 && (
        <button className="rst-cart-bar" onClick={() => { haptic(); setCheckoutOpen(true); }}>
          <span className="rst-cart-badge">{cartCount}</span>
          <span>Savat</span>
          <b>{formatNumber(itemsTotalSom)} so'm →</b>
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
            <button className={!isPickup ? "on" : ""} onClick={() => { haptic(); setIsPickup(false); }}>🛵 Yetkazish</button>
            <button className={isPickup ? "on" : ""} onClick={() => { haptic(); setIsPickup(true); }}>🚶 Olib ketish</button>
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

export function RestoranView({ me, onBanner }: { me: MeResponse; onBanner?: (msg: string) => void }) {
  const [list, setList] = useState<RestaurantView[] | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [ordersOpen, setOrdersOpen] = useState(false);

  useEffect(() => {
    api.restoranList().then((r) => setList(r.restaurants)).catch(() => setList([]));
  }, []);

  if (ordersOpen) return <MyOrdersView onBack={() => setOrdersOpen(false)} />;
  if (openId != null) return <RestaurantDetail id={openId} me={me} onBack={() => setOpenId(null)} onBanner={onBanner} />;

  return (
    <div className="view">
      <button className="rst-myorders-btn" onClick={() => { haptic(); setOrdersOpen(true); }}>📦 Mening buyurtmalarim</button>
      {list === null ? (
        <CatalogSkeleton />
      ) : list.length === 0 ? (
        <EmptyState icon="🍽" text="Hozircha restoran yo'q — tez orada qo'shiladi" />
      ) : (
        <div className="rst-grid">
          {list.map((r) => (
            <RestaurantCard key={r.id} r={r} onOpen={(x) => setOpenId(x.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
