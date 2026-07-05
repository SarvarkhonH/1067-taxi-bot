// 🛍 TANGA DO'KONI (feature "shop") — REAL marketplace layout on the existing design system:
// search → featured hero-carousel → per-category horizontal rows (Uzum pattern) → rich detail
// (gallery + discount + delivery promise + similar items) → two-step buy → my orders.
// NO lootboxes; the insufficient-tanga state converts into a RIDE (the real business loop).
import { useEffect, useMemo, useState } from "react";
import { SHOP_LOW_STOCK, formatNumber, type MeResponse, type ShopProductView, type ShopPurchaseView } from "@t1067/shared";
import { api, apiUrl } from "./api";
import { haptic, hapticSuccess } from "./telegram";
import { confetti } from "./util";
import { Button, EmptyState, ProgressBar, Sheet, Skeleton } from "./design/components";

const AVG_EARN_PER_RIDE = 250; // rough tanga/ride — "N safar yetadi" hint only
const LAST_ADDR_KEY = "shop_last_addr";

// Hamster-style colored frames — deterministic per category (real palette, NOT rarity/lootbox)
const ACCENTS = ["#ffb300", "#f0426b", "#8b5cf6", "#22c55e", "#38bdf8"];
function accentOf(category: string): string {
  let h = 5381;
  for (let i = 0; i < category.length; i++) h = (h * 33) ^ category.charCodeAt(i);
  return ACCENTS[(h >>> 0) % ACCENTS.length]!;
}
function discountPct(p: ShopProductView): number {
  return p.oldPriceTanga && p.oldPriceTanga > p.priceTanga ? Math.round((1 - p.priceTanga / p.oldPriceTanga) * 100) : 0;
}

function StatusPill({ s }: { s: ShopPurchaseView["status"] }) {
  const map: Record<ShopPurchaseView["status"], { t: string; c: string }> = {
    pending: { t: "⏳ Kutilmoqda", c: "pending" },
    delivered: { t: "✅ Yetkazildi", c: "delivered" },
    rejected: { t: "❌ Rad etildi", c: "rejected" },
    cancelled: { t: "✖ Bekor", c: "rejected" },
  };
  const m = map[s];
  return <span className={`order-status-pill ${m.c}`}>{m.t}</span>;
}

function Badges({ p }: { p: ShopProductView }) {
  const d = discountPct(p);
  return (
    <>
      {d > 0 && <span className="shop-badge-disc">−{d}%</span>}
      {p.isNew && d === 0 && <span className="shop-badge-new">YANGI</span>}
      {p.topSeller && <span className="shop-badge-top">🔥 TOP</span>}
      {p.stock <= SHOP_LOW_STOCK && <span className="shop-badge-stock low">⚡ {p.stock} dona</span>}
    </>
  );
}

function PriceBlock({ p, big }: { p: ShopProductView; big?: boolean }) {
  const d = discountPct(p);
  return (
    <div className={big ? "shop-price-big" : "shop-price-line"}>
      <span className={big ? "shop-confirm-total" : "shop-price-chip"}>🪙 {formatNumber(p.priceTanga)}</span>
      {d > 0 && <span className="shop-price-old">{formatNumber(p.oldPriceTanga!)}</span>}
    </div>
  );
}

// compact card used in horizontal rows + search grid
function ProductCard({ p, onOpen, wide }: { p: ShopProductView; onOpen: (p: ShopProductView) => void; wide?: boolean }) {
  return (
    <button className={"shop-card glass" + (wide ? "" : " shop-card-h")} style={{ ["--acc" as string]: accentOf(p.category) }} onClick={() => onOpen(p)}>
      <div className="shop-card-photo-wrap">
        {p.hasPhoto ? <img className="shop-card-photo" src={apiUrl(`/api/shop/photo/${p.id}`)} loading="lazy" alt="" /> : <div className="shop-card-photo shop-card-noimg">🛍</div>}
        <Badges p={p} />
      </div>
      <div className="shop-card-body">
        <div className="shop-card-name">{p.name}</div>
        <PriceBlock p={p} />
        <div className="shop-buy-bar">Sotib olish</div>
      </div>
    </button>
  );
}

export function ShopView({ me, onBanner, reload, onBook }: { me: MeResponse; onBanner: (msg: string) => void; reload: () => void; onBook: () => void }) {
  const [products, setProducts] = useState<ShopProductView[] | null>(null);
  const [err, setErr] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<ShopProductView | null>(null);
  const [step, setStep] = useState<"detail" | "confirm">("detail");
  const [address, setAddress] = useState(() => { try { return localStorage.getItem(LAST_ADDR_KEY) ?? ""; } catch { return ""; } });
  const [busy, setBusy] = useState(false);
  const [buyErr, setBuyErr] = useState<string | null>(null);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [orders, setOrders] = useState<ShopPurchaseView[] | null>(null);
  const [success, setSuccess] = useState<{ orderId: number; name: string } | null>(null);
  const [galleryIdx, setGalleryIdx] = useState(0);

  const load = () => {
    setErr(false);
    api.shopProducts().then((r) => setProducts(r.products)).catch(() => setErr(true));
  };
  useEffect(load, []);

  const featured = useMemo(() => (products ?? []).filter((p) => p.featured).slice(0, 6), [products]);
  const byCategory = useMemo(() => {
    const m = new Map<string, ShopProductView[]>();
    for (const p of products ?? []) {
      if (!m.has(p.category)) m.set(p.category, []);
      m.get(p.category)!.push(p);
    }
    return [...m.entries()];
  }, [products]);
  const searched = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return null;
    return (products ?? []).filter((p) => p.name.toLowerCase().includes(t) || p.category.toLowerCase().includes(t));
  }, [products, q]);
  const similar = useMemo(() => (sel ? (products ?? []).filter((p) => p.category === sel.category && p.id !== sel.id).slice(0, 6) : []), [products, sel]);

  const openProduct = (p: ShopProductView) => {
    haptic();
    setSel(p);
    setStep("detail");
    setBuyErr(null);
    setGalleryIdx(0);
  };

  const submit = async () => {
    if (!sel) return;
    setBusy(true);
    setBuyErr(null);
    try {
      const r = await api.shopBuy(sel.id, address);
      if (r.ok) {
        hapticSuccess();
        confetti(18);
        try { localStorage.setItem(LAST_ADDR_KEY, address.trim()); } catch { /* private mode */ }
        setSuccess({ orderId: r.orderId!, name: sel.name });
        setSel(null);
        reload();
        load();
      } else {
        const msgs: Record<string, string> = {
          off: "Do'kon hozircha yopiq",
          unavailable: "Bu mahsulot hozir mavjud emas",
          sold_out: "Afsus — hozirgina tugadi 😔",
          insufficient: "Tanga yetarli emas",
          bad_address: "Manzilni to'liqroq yozing (kamida 5 belgi)",
          pending_limit: "Sizda 3 ta ochiq buyurtma bor — avval ular yetkazilsin",
        };
        setBuyErr(msgs[r.reason ?? ""] ?? "Xatolik — qayta urinib ko'ring");
        load();
      }
    } catch {
      setBuyErr("Tarmoq xatosi — qayta urinib ko'ring");
    } finally {
      setBusy(false);
    }
  };

  const openOrders = () => {
    haptic();
    setOrdersOpen(true);
    api.shopOrders().then((r) => setOrders(r.orders)).catch(() => setOrders([]));
  };

  const deficit = sel ? Math.max(0, sel.priceTanga - me.coins) : 0;
  const ridesNeeded = Math.max(1, Math.ceil(deficit / AVG_EARN_PER_RIDE));

  return (
    <div className="shop-wrap">
      <div className="shop-head">
        <div>
          <div className="shop-title">🛍 Do'kon</div>
          <div className="muted fs12">Tangangizga real mahsulotlar · 1 kunda yetkazamiz</div>
        </div>
        <button className="shop-orders-btn" onClick={openOrders}>📦 Buyurtmalarim</button>
      </div>

      <div className="shop-search-wrap">
        <input className="shop-search" placeholder="🔍 Mahsulot qidirish…" value={q} onChange={(e) => setQ(e.target.value)} />
        {q && <button className="shop-search-x" onClick={() => setQ("")}>✕</button>}
      </div>

      {err ? (
        <EmptyState icon="📡" text="Yuklanmadi — internetni tekshirib qayta urinib ko'ring" action="🔄 Qayta urinish" onAction={load} />
      ) : products === null ? (
        <>
          <Skeleton h={160} />
          <div className="shop-grid mt10">
            {[0, 1].map((i) => (
              <div key={i} className="shop-card glass"><Skeleton h={130} /><div className="shop-card-body"><Skeleton h={13} w="70%" /><Skeleton h={18} w="45%" className="mt6" /></div></div>
            ))}
          </div>
        </>
      ) : products.length === 0 ? (
        <EmptyState icon="🛍" text="Hozircha do'konda mahsulot yo'q — tez orada!" />
      ) : searched ? (
        searched.length === 0 ? (
          <EmptyState icon="🔍" text={`«${q}» topilmadi`} action="Tozalash" onAction={() => setQ("")} />
        ) : (
          <div className="shop-grid">{searched.map((p) => <ProductCard key={p.id} p={p} onOpen={openProduct} wide />)}</div>
        )
      ) : (
        <>
          {/* ── featured hero carousel ── */}
          {featured.length > 0 && (
            <div className="shop-hero-strip">
              {featured.map((p) => (
                <button key={p.id} className="shop-hero" style={{ ["--acc" as string]: accentOf(p.category) }} onClick={() => openProduct(p)}>
                  {p.hasPhoto ? <img className="shop-hero-img" src={apiUrl(`/api/shop/photo/${p.id}`)} loading="lazy" alt="" /> : <div className="shop-hero-img shop-card-noimg">🛍</div>}
                  <div className="shop-hero-grad" />
                  <div className="shop-hero-info">
                    <div className="shop-hero-name">{p.name}</div>
                    <PriceBlock p={p} />
                  </div>
                  <div className="shop-hero-badges"><Badges p={p} /></div>
                </button>
              ))}
            </div>
          )}

          {/* ── per-category horizontal rows (Uzum pattern) ── */}
          {byCategory.map(([cat, items]) => (
            <div key={cat} className="shop-section">
              <div className="shop-section-head">
                <span className="shop-section-title" style={{ ["--acc" as string]: accentOf(cat) }}>{cat}</span>
                <span className="muted fs12">{items.length} ta</span>
              </div>
              <div className="shop-row-strip">
                {items.map((p) => <ProductCard key={p.id} p={p} onOpen={openProduct} />)}
              </div>
            </div>
          ))}
        </>
      )}

      {/* ── product detail: gallery + discount + delivery + similar ── */}
      <Sheet open={!!sel} onClose={() => setSel(null)}>
        {sel && step === "detail" && (
          <div className="shop-detail">
            {sel.photoCount > 1 ? (
              <div className="shop-gallery">
                <div className="shop-gallery-strip" onScroll={(e) => { const el = e.currentTarget; setGalleryIdx(Math.round(el.scrollLeft / el.clientWidth)); }}>
                  {Array.from({ length: Math.min(5, sel.photoCount) }, (_, i) => (
                    <img key={i} className="shop-gallery-img" src={apiUrl(`/api/shop/photo/${sel.id}/${i}`)} alt="" loading={i === 0 ? "eager" : "lazy"} />
                  ))}
                </div>
                <div className="shop-gallery-dots">
                  {Array.from({ length: Math.min(5, sel.photoCount) }, (_, i) => (
                    <span key={i} className={"shop-gallery-dot" + (i === galleryIdx ? " on" : "")} />
                  ))}
                </div>
              </div>
            ) : sel.hasPhoto ? (
              <img className="shop-detail-photo" src={apiUrl(`/api/shop/photo/${sel.id}`)} alt="" />
            ) : (
              <div className="shop-detail-photo shop-card-noimg" style={{ ["--acc" as string]: accentOf(sel.category) }}>🛍</div>
            )}
            <h3 className="shop-detail-name">{sel.name}</h3>
            {sel.description && <p className="muted fs13">{sel.description}</p>}
            <PriceBlock p={sel} big />
            {sel.stock <= SHOP_LOW_STOCK && <div className="shop-low-line">⚡ Kam qoldi: {sel.stock} dona</div>}
            <div className="shop-deliver-line">🚚 Bugun buyurtma qilsangiz — <b>1 kun ichida yetkazamiz</b> · egamiz qo'ng'iroq qiladi</div>
            {deficit > 0 ? (
              <div className="shop-insufficient-bar">
                <div className="fs13">🪙 Sizda: <b>{formatNumber(me.coins)}</b> / kerak: <b>{formatNumber(sel.priceTanga)}</b></div>
                <ProgressBar value={me.coins} max={sel.priceTanga} />
                <div className="muted fs12 mt6">Yana {formatNumber(deficit)} tanga kerak — bu taxminan {ridesNeeded} ta safar.</div>
                <Button variant="brand" onClick={() => { setSel(null); onBook(); }}>🚕 Hozir safar chaqirish</Button>
                <Button variant="ghost" onClick={() => setSel(null)}>Boshqa mahsulot ko'rish</Button>
              </div>
            ) : (
              <Button variant="brand" onClick={() => { haptic(); setStep("confirm"); }}>Sotib olish — 🪙 {formatNumber(sel.priceTanga)}</Button>
            )}
            {similar.length > 0 && (
              <div className="shop-section mt10">
                <div className="shop-section-head"><span className="shop-section-title">O'xshash mahsulotlar</span></div>
                <div className="shop-row-strip">
                  {similar.map((p) => (
                    <button key={p.id} className="shop-mini" onClick={() => openProduct(p)}>
                      {p.hasPhoto ? <img className="shop-mini-img" src={apiUrl(`/api/shop/photo/${p.id}`)} loading="lazy" alt="" /> : <div className="shop-mini-img shop-card-noimg">🛍</div>}
                      <div className="shop-mini-name">{p.name}</div>
                      <div className="shop-mini-price">🪙 {formatNumber(p.priceTanga)}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {sel && step === "confirm" && (
          <>
            <button className="pay-back" onClick={() => setStep("detail")}>‹ Orqaga</button>
            <h3>📦 Yetkazish manzili</h3>
            <p className="muted fs13">Egamiz {me.member.phone ?? "raqamingiz"} orqali siz bilan bog'lanadi.</p>
            <input className="bk-input" placeholder="Masalan: Koson sh., Guliston ko'chasi 12-uy" value={address} onChange={(e) => setAddress(e.target.value)} />
            <div className="shop-confirm-total mt10">Jami: 🪙 {formatNumber(sel.priceTanga)}</div>
            {buyErr && <div className="sheet-err">{buyErr}</div>}
            <Button variant="brand" disabled={busy || address.trim().length < 5} onClick={submit}>
              {busy ? "Yuborilmoqda…" : `Tasdiqlash — 🪙 ${formatNumber(sel.priceTanga)}`}
            </Button>
          </>
        )}
      </Sheet>

      {/* ── success overlay ── */}
      {success && (
        <div className="winburst" onClick={() => { setSuccess(null); openOrders(); }}>
          <div className="wb-card">
            <div className="wb-emoji">📦</div>
            <div className="shop-success-title">Buyurtma #{success.orderId} qabul qilindi!</div>
            <div className="muted fs13 mt6">🛍 {success.name}</div>
            <div className="shop-success-promise">🚚 Tez orada yetkazamiz — egamiz siz bilan bog'lanadi</div>
            <Button variant="brand" onClick={() => { setSuccess(null); openOrders(); }}>📦 Buyurtmalarim</Button>
          </div>
        </div>
      )}

      {/* ── my orders ── */}
      <Sheet open={ordersOpen} onClose={() => setOrdersOpen(false)}>
        <h3>📦 Buyurtmalarim</h3>
        {orders === null ? (
          <><Skeleton h={54} className="mt8" /><Skeleton h={54} className="mt8" /></>
        ) : orders.length === 0 ? (
          <EmptyState icon="🛍" text="Hali xarid yo'q — birinchi mahsulotingizni tanlang!" />
        ) : (
          orders.map((o) => (
            <div key={o.id} className="glass pad shop-order-row">
              <div className="shop-order-top">
                <b>{o.productName}</b>
                <StatusPill s={o.status} />
              </div>
              <div className="muted fs12">#{o.id} · 🪙 {formatNumber(o.priceTanga)} · {new Date(o.createdAt).toLocaleDateString("uz-UZ")}</div>
              {o.status === "rejected" && (
                <div className="order-refund-banner">
                  {o.note ? `Sabab: ${o.note}. ` : ""}✅ <b>{formatNumber(o.priceTanga)} tanga hisobingizga qaytarildi</b>
                </div>
              )}
            </div>
          ))
        )}
      </Sheet>
      {void onBanner}
    </div>
  );
}
