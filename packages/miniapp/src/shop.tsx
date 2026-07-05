// 🛍 TANGA DO'KONI (feature "shop") — owner-listed real goods bought with tanga. Uzum-feel on the
// existing design system: 2-col card grid + category chips + a two-step Sheet (detail → confirm) +
// my-orders list. NO lootboxes. The insufficient-tanga state converts into a RIDE (the real loop).
import { useEffect, useMemo, useState } from "react";
import { SHOP_LOW_STOCK, formatNumber, type MeResponse, type ShopProductView, type ShopPurchaseView } from "@t1067/shared";
import { api, apiUrl } from "./api";
import { haptic, hapticSuccess } from "./telegram";
import { confetti } from "./util";
import { Button, Chip, EmptyState, ProgressBar, Sheet, Skeleton } from "./design/components";

const AVG_EARN_PER_RIDE = 250; // rough tanga/ride (roll+wheel avg) — "N safar yetadi" hint only

// Hamster-style colored frames — deterministic per category (real palette, NOT rarity/lootbox)
const ACCENTS = ["#ffb300", "#f0426b", "#8b5cf6", "#22c55e", "#38bdf8"];
function accentOf(category: string): string {
  let h = 5381;
  for (let i = 0; i < category.length; i++) h = (h * 33) ^ category.charCodeAt(i);
  return ACCENTS[(h >>> 0) % ACCENTS.length]!;
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

export function ShopView({ me, onBanner, reload, onBook }: { me: MeResponse; onBanner: (msg: string) => void; reload: () => void; onBook: () => void }) {
  const [products, setProducts] = useState<ShopProductView[] | null>(null);
  const [err, setErr] = useState(false);
  const [cat, setCat] = useState("Hammasi");
  const [sel, setSel] = useState<ShopProductView | null>(null);
  const [step, setStep] = useState<"detail" | "confirm">("detail");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [buyErr, setBuyErr] = useState<string | null>(null);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [orders, setOrders] = useState<ShopPurchaseView[] | null>(null);
  const [success, setSuccess] = useState<{ orderId: number; name: string } | null>(null);

  const load = () => {
    setErr(false);
    api.shopProducts().then((r) => setProducts(r.products)).catch(() => setErr(true));
  };
  useEffect(load, []);

  const cats = useMemo(() => {
    const set = new Set((products ?? []).map((p) => p.category));
    return ["Hammasi", ...set];
  }, [products]);
  const shown = (products ?? []).filter((p) => cat === "Hammasi" || p.category === cat);

  const openProduct = (p: ShopProductView) => {
    haptic();
    setSel(p);
    setStep("detail");
    setBuyErr(null);
  };

  const submit = async () => {
    if (!sel) return;
    setBusy(true);
    setBuyErr(null);
    try {
      const r = await api.shopBuy(sel.id, address);
      if (r.ok) {
        hapticSuccess();
        confetti(18); // restrained — a purchase, not a jackpot
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
        load(); // stock may have changed under us
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
          <div className="section-title">🛍 Do'kon</div>
          <div className="muted fs12">Tangangizga real mahsulotlar — bir kunda yetkazamiz</div>
        </div>
        <button className="shop-orders-btn" onClick={openOrders}>📦 Buyurtmalarim</button>
      </div>

      {cats.length > 2 && (
        <div className="b3-chips shop-cats">
          {cats.map((c) => (
            <Chip key={c} on={c === cat} onClick={() => setCat(c)}>{c}</Chip>
          ))}
        </div>
      )}

      {err ? (
        <EmptyState icon="📡" text="Yuklanmadi — internetni tekshirib qayta urinib ko'ring" action="🔄 Qayta urinish" onAction={load} />
      ) : products === null ? (
        <div className="shop-grid">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="shop-card glass">
              <Skeleton h={130} />
              <div className="shop-card-body">
                <Skeleton h={13} w="70%" />
                <Skeleton h={18} w="45%" className="mt6" />
              </div>
            </div>
          ))}
        </div>
      ) : shown.length === 0 ? (
        <EmptyState icon="🛍" text={cat === "Hammasi" ? "Hozircha do'konda mahsulot yo'q — tez orada!" : "Bu bo'limda hali mahsulot yo'q"} />
      ) : (
        <div className="shop-grid">
          {shown.map((p) => (
            <button key={p.id} className="shop-card glass" style={{ ["--acc" as string]: accentOf(p.category) }} onClick={() => openProduct(p)}>
              <div className="shop-card-cat">{p.category}</div>
              <div className="shop-card-photo-wrap">
                {p.hasPhoto ? <img className="shop-card-photo" src={apiUrl(`/api/shop/photo/${p.id}`)} loading="lazy" alt="" /> : <div className="shop-card-photo shop-card-noimg">🛍</div>}
                {p.isNew && <span className="shop-badge-new">YANGI</span>}
                {p.stock <= SHOP_LOW_STOCK && <span className="shop-badge-stock low">⚡ {p.stock} dona</span>}
              </div>
              <div className="shop-card-body">
                <div className="shop-card-name">{p.name}</div>
                <div className="shop-price-chip">🪙 {formatNumber(p.priceTanga)}</div>
                <div className="shop-buy-bar">Sotib olish</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ── product sheet: detail → confirm (two-step = fat-finger shield) ── */}
      <Sheet open={!!sel} onClose={() => setSel(null)}>
        {sel && step === "detail" && (
          <>
            {sel.hasPhoto ? <img className="shop-detail-photo" src={apiUrl(`/api/shop/photo/${sel.id}`)} alt="" /> : <div className="shop-detail-photo shop-card-noimg">🛍</div>}
            <h3 className="shop-detail-name">{sel.name}</h3>
            {sel.description && <p className="muted fs13">{sel.description}</p>}
            <div className="shop-confirm-total">🪙 {formatNumber(sel.priceTanga)} <span className="muted fs13">tanga</span></div>
            {sel.stock <= SHOP_LOW_STOCK && <div className="shop-low-line">⚡ Kam qoldi: {sel.stock} dona</div>}
            {deficit > 0 ? (
              <div className="shop-insufficient-bar">
                <div className="fs13">🪙 Sizda: <b>{formatNumber(me.coins)}</b> / kerak: <b>{formatNumber(sel.priceTanga)}</b></div>
                <ProgressBar value={me.coins} max={sel.priceTanga} />
                <div className="muted fs12 mt6">Yana {formatNumber(deficit)} tanga kerak — bu taxminan {ridesNeeded} ta safar.</div>
                <Button variant="brand" onClick={() => { setSel(null); onBook(); }}>🚕 Hozir safar chaqirish</Button>
                <Button variant="ghost" onClick={() => setSel(null)}>Boshqa mahsulot ko'rish</Button>
              </div>
            ) : (
              <Button variant="brand" onClick={() => { haptic(); setStep("confirm"); }}>Sotib olish</Button>
            )}
          </>
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

      {/* ── success overlay (trustworthy, restrained) ── */}
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
      {/* onBanner reserved for future (wishlist etc.) */}
      {void onBanner}
    </div>
  );
}
