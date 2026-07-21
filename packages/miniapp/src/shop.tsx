// 🛍 TANGA DO'KONI (feature "shop") — REAL marketplace layout on the existing design system:
// search → featured hero-carousel → per-category horizontal rows (Uzum pattern) → rich detail
// (gallery + discount + delivery promise + similar items) → two-step buy → my orders.
// NO lootboxes; the insufficient-tanga state converts into a RIDE (the real business loop).
import { useEffect, useMemo, useRef, useState } from "react";
import {
  SHOP_LOW_STOCK,
  SHOP_REVIEW_MAX_PHOTOS,
  SHOP_REVIEW_MAX_TEXT,
  formatNumber,
  type MeResponse,
  type MarketHomeResponse,
  type MarketOrderView,
  type ShopProductView,
  type ShopPurchaseView,
  type ShopReviewsResponse,
  type ReferralResponse,
} from "@t1067/shared";
import { api, apiUrl } from "./api";
import { haptic, hapticSuccess, inviteText, inviteLandingUrl, shareLink } from "./telegram";
import { confetti, compressImage } from "./util";
import { Button, EmptyState, ProgressBar, Sheet, Skeleton } from "./design/components";
import { BjCategoryCarousel, BjShopCard, BjSection, BjStickyCartBar } from "./design/birjoy"; // 🏪 V1.4+V2 BirJoy-kit
import { Icon } from "./icons";

const LAST_ADDR_KEY = "shop_last_addr";
const CART_KEY = "bj_cart_v1"; // 🧺 V2: savat localStorage'da (tab-almashinuv/reopen'dan omon qoladi)

// ── stale-while-revalidate product cache (module-level) ──────────────────────────────────────────
// Re-entering the tab renders INSTANTLY from the last payload (no skeleton flash, no network wait);
// the fresh list still loads in the background. App.tsx also warms this + the chunk on idle.
let PROD_CACHE: ShopProductView[] | null = null;

export function prefetchShopProducts(): void {
  api.shopProducts().then((r) => { PROD_CACHE = r.products; }).catch(() => undefined);
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

// 🧺 V2: MarketOrder status-pill (accepted/delivering yangi holatlar)
function MktStatusPill({ s }: { s: MarketOrderView["status"] }) {
  const map: Record<MarketOrderView["status"], { t: string; c: string }> = {
    pending: { t: "⏳ Kutilmoqda", c: "pending" },
    accepted: { t: "✅ Qabul qilindi", c: "pending" },
    delivering: { t: "🚚 Yo'lda", c: "pending" },
    delivered: { t: "📦 Yetkazildi", c: "delivered" },
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
    <button className={"shop-card glass" + (wide ? "" : " shop-card-h")} onClick={() => onOpen(p)}>
      <div className="shop-card-photo-wrap">
        {p.hasPhoto ? <img className="shop-card-photo" src={apiUrl(`/api/shop/photo/${p.id}?s=1`)} loading="lazy" decoding="async" alt="" /> : <div className="shop-card-photo shop-card-noimg">🛍</div>}
        <Badges p={p} />
      </div>
      <div className="shop-card-body">
        <div className="shop-card-name">{p.name}</div>
        {p.likes > 0 && <div className="shop-card-likes">👍 {p.likes}{p.dislikes > 0 ? ` · 👎 ${p.dislikes}` : ""}</div>}
        <PriceBlock p={p} />
        <div className="shop-buy-bar">Sotib olish</div>
      </div>
    </button>
  );
}

const BOT_LINK = "https://t.me/koson1067bot"; // share deep-link target (same source as services.tsx)

export function ShopView({ me, onBanner, reload, onBook, openProductId }: { me: MeResponse; onBanner: (msg: string) => void; reload: () => void; onBook: () => void; openProductId?: number | null }) {
  const [products, setProducts] = useState<ShopProductView[] | null>(PROD_CACHE);
  const [err, setErr] = useState(false);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null); // null = "Hammasi"
  const [sel, setSel] = useState<ShopProductView | null>(null);
  const [step, setStep] = useState<"detail" | "confirm" | "reviews">("detail");
  const [address, setAddress] = useState(() => { try { return localStorage.getItem(LAST_ADDR_KEY) ?? ""; } catch { return ""; } });
  const [busy, setBusy] = useState(false);
  const [buyErr, setBuyErr] = useState<string | null>(null);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [orders, setOrders] = useState<ShopPurchaseView[] | null>(null);
  const [ordersErr, setOrdersErr] = useState(false); // V0.3: tarmoq-xato ≠ «xarid yo'q»
  const [success, setSuccess] = useState<{ orderId: number; name: string; pay: "tanga" | "cash" } | null>(null);
  const [payMode, setPayMode] = useState<"tanga" | "cash">("tanga"); // 💵 naqd — yetkazganda to'lanadi
  const [galleryIdx, setGalleryIdx] = useState(0);
  const [lightbox, setLightbox] = useState<number | null>(null); // 🔍 rasmga bosilganda TO'LIQ EKRAN — index yoki null
  const deepOpened = useRef(false); // ulashilgan-mahsulot ?p=<id> faqat BIR marta avto-ochiladi
  const [refInfo, setRefInfo] = useState<ReferralResponse | null>(null);
  useEffect(() => { api.referral().then(setRefInfo).catch(() => undefined); }, []);
  // 🗣 sharhlar
  const [reviews, setReviews] = useState<ShopReviewsResponse | null>(null);
  const [revThumb, setRevThumb] = useState<"up" | "down" | null>(null);
  const [revText, setRevText] = useState("");
  const [revPhotos, setRevPhotos] = useState<string[]>([]);
  const [revBusy, setRevBusy] = useState(false);
  const [revErr, setRevErr] = useState<string | null>(null);
  const [revLoadErr, setRevLoadErr] = useState(false); // V0.3: sharh-yuklash xatosi ≠ «sharh yo'q»
  const revFileRef = useRef<HTMLInputElement>(null);

  const loadReviews = (productId: number) => {
    setReviews(null);
    setRevLoadErr(false);
    api.shopReviews(productId).then((r) => {
      setReviews(r);
      const mine = r.reviews.find((v) => v.mine);
      setRevThumb(r.myThumb ?? null);
      setRevText(mine?.text ?? "");
      setRevPhotos([]);
    }).catch(() => { setReviews(null); setRevLoadErr(true); });
  };

  const addRevPhotos = async (files: FileList | null) => {
    if (!files) return;
    const room = SHOP_REVIEW_MAX_PHOTOS - revPhotos.length;
    const picked = [...files].slice(0, room);
    const out: string[] = [];
    for (const f of picked) {
      const d = await compressImage(f);
      if (d) out.push(d);
    }
    if (out.length) setRevPhotos((p) => [...p, ...out].slice(0, SHOP_REVIEW_MAX_PHOTOS));
  };

  const submitReview = async () => {
    if (!sel || !revThumb) return;
    setRevBusy(true);
    setRevErr(null);
    try {
      const r = await api.shopReviewSubmit({
        productId: sel.id,
        thumb: revThumb,
        text: revText.trim() || undefined,
        photos: revPhotos.length ? revPhotos : undefined,
      });
      if (r.ok) {
        hapticSuccess();
        loadReviews(sel.id);
        load(); // 👍 tallies on cards
      } else {
        setRevErr(r.reason === "too_many_photos" ? "Ko'pi bilan 3 ta rasm" : "Xatolik — qayta urinib ko'ring");
      }
    } catch {
      setRevErr("Tarmoq xatosi — qayta urinib ko'ring");
    } finally {
      setRevBusy(false);
    }
  };

  // 🏪 V1.4 (BirJoy): bazar-qatlam — flag OFF'da market so'ralmaydi ham, UI ham eski holicha AYNAN
  const bazar = !!me.flags?.bazar;
  const [market, setMarket] = useState<MarketHomeResponse | null>(null);
  const [shopFilter, setShopFilter] = useState<{ id: number; name: string } | null>(null); // 🏬 do'kon-sahifa (lite)
  // 🧺 V2 (flag bazarcart): savat — 1 savat = 1 do'kon (restoran naqshi). Client-state faqat UI;
  // narx/stock/total HAMMASI serverda qayta-hisoblanadi (checkout snapshot) — bu yerdagi raqamlar ko'rsatma.
  const bazarcart = !!me.flags?.bazarcart;
  // 🧺 savat localStorage'da saqlanadi — ShopView tab almashganda unmount bo'ladi (App.tsx
  // `{tab==="dokon" && <ShopView/>}`), shuning uchun sof React-state savatni yo'qotardi. Endi
  // savat ilova qayta-ochilishi/tab-almashinuvidan omon qoladi (1 savat = 1 do'kon).
  const [cart, setCart] = useState<Record<number, number>>(() => { try { return JSON.parse(localStorage.getItem(CART_KEY) ?? "{}").items ?? {}; } catch { return {}; } });
  const [cartShopId, setCartShopId] = useState<number | null>(() => { try { return JSON.parse(localStorage.getItem(CART_KEY) ?? "{}").shopId ?? null; } catch { return null; } });
  const [cartOpen, setCartOpen] = useState(false);
  // savatni har o'zgarishda saqla; bo'sh bo'lsa — tozala (do'kon ham unutiladi)
  useEffect(() => {
    try {
      if (Object.keys(cart).length === 0) localStorage.removeItem(CART_KEY);
      else localStorage.setItem(CART_KEY, JSON.stringify({ shopId: cartShopId, items: cart }));
    } catch { /* private mode */ }
  }, [cart, cartShopId]);
  const [coBusy, setCoBusy] = useState(false);
  const [coErr, setCoErr] = useState<string | null>(null);
  const [coPay, setCoPay] = useState<"tanga" | "cash">("tanga");
  const [coSuccess, setCoSuccess] = useState<number | null>(null); // orderId
  const cartCount = useMemo(() => Object.values(cart).reduce((s, q) => s + q, 0), [cart]);
  const cartLines = useMemo(() => {
    const byId = new Map((products ?? []).map((p) => [p.id, p]));
    return Object.entries(cart).map(([id, qty]) => ({ p: byId.get(Number(id)), qty })).filter((l): l is { p: ShopProductView; qty: number } => !!l.p && l.qty > 0);
  }, [cart, products]);
  const cartItemsTotal = useMemo(() => cartLines.reduce((s, l) => s + l.qty * l.p.priceTanga, 0), [cartLines]);
  const cartShop = useMemo(() => market?.shops.find((s) => s.id === cartShopId) ?? null, [market, cartShopId]);
  const cartDelivery = cartShop?.deliveryFeeSom ?? 0;

  const addToCart = (p: ShopProductView, delta = 1) => {
    const pShop = p.shopId ?? 1;
    if (cartShopId !== null && cartShopId !== pShop && cartCount > 0) {
      // boshqa do'kon — savat bitta do'konga (sotuvchi o'zi yetkazadi)
      if (!window.confirm("Savatda boshqa do'kon mahsuloti bor. Savat tozalanib, yangi do'kondan boshlansinmi?")) return;
      setCart({ [p.id]: Math.max(1, delta) });
      setCartShopId(pShop);
      haptic();
      return;
    }
    setCartShopId(pShop);
    setCart((c) => {
      const next = Math.min(20, Math.max(0, (c[p.id] ?? 0) + delta));
      const copy = { ...c };
      if (next === 0) delete copy[p.id];
      else copy[p.id] = next;
      return copy;
    });
    haptic();
  };

  const checkout = async (address: string, note: string) => {
    if (!cartShopId || cartLines.length === 0) return;
    setCoBusy(true);
    setCoErr(null);
    try {
      const r = await api.shopCheckout(cartShopId, cartLines.map((l) => ({ productId: l.p.id, qty: l.qty })), address, coPay, note || undefined);
      if (r.ok) {
        hapticSuccess();
        confetti(18);
        try { localStorage.setItem(LAST_ADDR_KEY, address.trim()); } catch { /* private mode */ }
        setCoSuccess(r.orderId!);
        setCart({});
        setCartShopId(null);
        reload();
        load();
      } else {
        const msgs: Record<string, string> = {
          off: "Savat-xarid hozircha yopiq",
          bad_address: "Manzilni to'liqroq yozing (kamida 5 belgi)",
          empty_cart: "Savat bo'sh",
          unavailable: "Savatdagi mahsulotlardan biri endi mavjud emas",
          shop_closed: "Bu do'kon hozir buyurtma qabul qilmayapti",
          min_order: r.minOrder ? `Minimal buyurtma: ${formatNumber(r.minOrder)} so'm` : "Minimal buyurtmaga yetmadi",
          insufficient: "Tanga yetarli emas — naqd usulini tanlang",
          pending_limit: "Sizda 3 ta ochiq buyurtma bor — avval ular yetkazilsin",
          duplicate: "Bu savat allaqachon yuborilgan — «Buyurtmalarim»da ko'ring",
          sold_out: "Savatdagi mahsulotlardan biri hozirgina tugadi 😔",
        };
        setCoErr(msgs[r.reason ?? ""] ?? "Xatolik — qayta urinib ko'ring");
        load();
      }
    } catch {
      setCoErr("Tarmoq xatosi — qayta urinib ko'ring");
    } finally {
      setCoBusy(false);
    }
  };
  // server-qidiruv (bazar'dagina): debounce → /api/shop/market?q= — tavsif bo'yicha ham topadi,
  // NOL natija server'da MarketDemand'ga tushadi («qidirildi-topilmadi» ro'yxati egaga)
  const [srv, setSrv] = useState<{ q: string; products: ShopProductView[] } | null>(null);
  useEffect(() => {
    if (!bazar) return;
    const t = q.trim();
    if (t.length < 2) { setSrv(null); return; }
    const id = setTimeout(() => {
      api.shopMarket(t).then((r) => setSrv({ q: t, products: r.products })).catch(() => undefined);
    }, 450);
    return () => clearTimeout(id);
  }, [q, bazar]);

  const load = () => {
    setErr(false);
    api.shopProducts().then((r) => { PROD_CACHE = r.products; setProducts(r.products); }).catch(() => { if (!PROD_CACHE) setErr(true); });
  };
  useEffect(load, []);
  // market-payload ALOHIDA effektda va bazar'ga bog'langan: flag me-refetch bilan KEYIN kelsa ham
  // rail'lar yuklanadi (load()'ning [] effekti stale-bazar'ni qotirib qo'ygan bug'i — preview'da topildi)
  useEffect(() => {
    if (!bazar) return;
    api.shopMarket().then(setMarket).catch(() => undefined); // best-effort — katalog baribir ochiladi
  }, [bazar]);

  const featured = useMemo(() => (products ?? []).filter((p) => p.featured).slice(0, 6), [products]);
  // kategoriya chiplar — nechta va qaysi tartibda birinchi ko'rinishda paydo bo'lgan bo'lsa shu
  const categories = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of products ?? []) m.set(p.category, (m.get(p.category) ?? 0) + 1);
    return [...m.entries()];
  }, [products]);
  // Amazon/Uzum standarti: bitta VERTIKAL 2-ustunli katalog-grid (gorizontal scroll faqat kichik
  // "tavsiya" qatorlarida) — 100+ mahsulotli kategoriya endi cheksiz eniga tasmaga aylanmaydi.
  const catalog = useMemo(() => {
    let list = products ?? [];
    if (shopFilter) list = list.filter((p) => p.shopId === shopFilter.id); // 🏬 do'kon-sahifa rejimi
    return cat ? list.filter((p) => p.category === cat) : list;
  }, [products, cat, shopFilter]);
  const searched = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return null;
    // bazar: server-natija ustuvor (tavsif-qidiruv + demand-capture); kelguncha client-filtr
    if (bazar && srv && srv.q.toLowerCase() === t) return srv.products;
    return (products ?? []).filter((p) => p.name.toLowerCase().includes(t) || p.category.toLowerCase().includes(t));
  }, [products, q, bazar, srv]);
  const similar = useMemo(() => (sel ? (products ?? []).filter((p) => p.category === sel.category && p.id !== sel.id).slice(0, 6) : []), [products, sel]);

  const openProduct = (p: ShopProductView) => {
    haptic();
    setSel(p);
    setStep("detail");
    setBuyErr(null);
    setGalleryIdx(0);
  };

  // 🛍 do'stdan ulashilgan mahsulot (?p=<id>, botning "🛍 Ochish" tugmasi) — ro'yxat kelgach BIR
  // marta avto-ochiladi (haptic'siz — bosish emas, sahifa ochilishi).
  useEffect(() => {
    if (!openProductId || deepOpened.current || !products) return;
    const p = products.find((x) => x.id === openProductId);
    if (p) { deepOpened.current = true; setSel(p); setStep("detail"); setGalleryIdx(0); }
  }, [openProductId, products]);

  const shareShop = () => {
    haptic();
    shareLink(`${BOT_LINK}?start=shop`, "🛍 1067 Do'kon — tanga yoki naqd pulga real mahsulotlar, 1 kunda yetkazamiz!");
  };
  const shareProduct = (p: ShopProductView) => {
    haptic();
    const d = discountPct(p);
    const text = `🛍 ${p.name} — 🪙 ${formatNumber(p.priceTanga)}${d > 0 ? ` (−${d}%)` : ""}`;
    shareLink(`${BOT_LINK}?start=shop_${p.id}`, text);
  };

  const submit = async () => {
    if (!sel) return;
    setBusy(true);
    setBuyErr(null);
    try {
      const r = await api.shopBuy(sel.id, address, payMode);
      if (r.ok) {
        hapticSuccess();
        confetti(18);
        try { localStorage.setItem(LAST_ADDR_KEY, address.trim()); } catch { /* private mode */ }
        setSuccess({ orderId: r.orderId!, name: sel.name, pay: payMode });
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
          duplicate: "Bu buyurtma allaqachon yuborilgan — «Buyurtmalarim»da ko'ring",
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

  const [mktOrders, setMktOrders] = useState<MarketOrderView[] | null>(null); // 🧺 V2
  const loadOrders = () => {
    setOrdersErr(false);
    setOrders(null);
    // V0.3 (BirJoy audit): catch→[] tarmoq-xatoni «xarid yo'q» qilib ko'rsatardi (loyiha aynan shu
    // bug-sinfdan kuygan) — endi xato-holat + retry.
    api.shopOrders().then((r) => setOrders(r.orders)).catch(() => { setOrders(null); setOrdersErr(true); });
    if (bazarcart) api.shopMarketOrders().then((r) => setMktOrders(r.orders)).catch(() => setMktOrders(null)); // best-effort — legacy ro'yxat baribir ochiladi
  };
  const cancelMkt = async (id: number) => {
    if (!window.confirm("Buyurtma bekor qilinsinmi? (Tanga bo'lsa — darhol qaytadi)")) return;
    const r = await api.shopMarketOrderCancel(id).catch(() => ({ ok: false }));
    if (r.ok) { hapticSuccess(); reload(); }
    loadOrders();
  };
  const openOrders = () => {
    haptic();
    setOrdersOpen(true);
    loadOrders();
  };

  const deficit = sel ? Math.max(0, sel.priceTanga - me.coins) : 0;
  // how many friends to invite to cover the shortfall (spread > rides right now)
  const friendsNeeded = deficit > 0 && refInfo?.rewardReferrer ? Math.max(1, Math.ceil(deficit / refInfo.rewardReferrer)) : null;

  return (
    <div className="shop-wrap">
      <div className="shop-head">
        <div>
          <div className="shop-title">{bazar ? "🏪 BirJoy bozori" : "🛍 Do'kon"}</div>
          <div className="muted fs12">{bazar ? "Kosonda bor — BirJoy'da bor" : "Tangangizga real mahsulotlar · 1 kunda yetkazamiz"}</div>
        </div>
        <div className="shop-head-actions">
          <button className="shop-share-btn" onClick={shareShop} aria-label="Do'konni ulashish"><Icon name="share" size={18} /></button>
          <button className="shop-orders-btn" onClick={openOrders}>📦 Buyurtmalarim</button>
        </div>
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
                <button key={p.id} className="shop-hero" onClick={() => openProduct(p)}>
                  {p.hasPhoto ? <img className="shop-hero-img" src={apiUrl(`/api/shop/photo/${p.id}?s=1`)} loading="lazy" decoding="async" alt="" /> : <div className="shop-hero-img shop-card-noimg">🛍</div>}
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

          {/* ── 🏬 do'kon-sahifa (lite): tanlangan do'kon nomi + orqaga ── */}
          {bazar && shopFilter && (
            <div className="bj-sect">
              <h3>🏬 {shopFilter.name}</h3>
              <button className="bj-sect-all" onClick={() => { haptic(); setShopFilter(null); }}>← Bozorga qaytish</button>
            </div>
          )}
          {/* ── 🏪 V1.4 BirJoy: kategoriya-KARUSEL (Uzum-referens) + do'kon-rail — flag ON'dagina ── */}
          {bazar && !shopFilter && market && market.cats.length > 0 && (
            <BjCategoryCarousel
              cats={market.cats.map((c) => ({ slug: c.name, name: c.name, emoji: c.emoji, iconUrl: c.hasIcon ? apiUrl(`/api/shop/cat-icon/${c.id}`) : null }))}
              active={cat}
              onPick={(slug) => { haptic(); setCat(slug); }}
            />
          )}
          {bazar && !shopFilter && market && market.shops.length > 1 && (
            <BjSection title="🏬 Do'konlar">
              <div className="bj-shops">
                {market.shops.map((s) => (
                  <BjShopCard key={s.id} name={s.name} open={s.open} promise={s.deliveryText} rating={s.rating} photoUrl={s.hasPhoto ? apiUrl(`/api/shop/shop-photo/${s.id}`) : null} onOpen={() => { haptic(); setShopFilter({ id: s.id, name: s.name }); setCat(null); }} />
                ))}
              </div>
            </BjSection>
          )}

          {/* ── kategoriya chiplar (bitta qator, kichik tugmalar — Amazon "departments" pattern) ── */}
          {!bazar && categories.length > 1 && (
            <div className="shop-cat-chips">
              <button className={"shop-cat-chip" + (cat === null ? " on" : "")} onClick={() => { haptic(); setCat(null); }}>
                Hammasi <span className="shop-cat-chip-n">{products?.length ?? 0}</span>
              </button>
              {categories.map(([c, n]) => (
                <button key={c} className={"shop-cat-chip" + (cat === c ? " on" : "")} onClick={() => { haptic(); setCat(c); }}>
                  {c} <span className="shop-cat-chip-n">{n}</span>
                </button>
              ))}
            </div>
          )}

          {/* ── katalog: VERTIKAL 2-ustunli grid (Amazon/Uzum standarti) — gorizontal scroll yo'q ── */}
          <div className="shop-section-head">
            <span className="shop-section-title">{cat ?? "Hammasi"}</span>
            <span className="muted fs12">{catalog.length} ta</span>
          </div>
          <div className="shop-grid">
            {catalog.map((p) => <ProductCard key={p.id} p={p} onOpen={openProduct} wide />)}
          </div>
        </>
      )}

      {/* ── sotuvchi bo'lish CTA — do'kon egalarini jalb qilish ── */}
      {!sel && !ordersOpen && (
        <div className="shop-seller-cta">
          <div className="shop-seller-ico">🏪</div>
          <div className="shop-seller-body">
            <div className="shop-seller-title">Biz bilan sotishni xohlaysizmi?</div>
            <div className="shop-seller-sub"><b>Minglab kosonlik mijozlar</b> bazasiga ega do'kon — <b>kafolatlangan savdo</b>. Mahsulotingizni qo'shamiz.</div>
          </div>
          <a className="shop-seller-call" href="tel:1067" onClick={() => haptic()}>📞 1067</a>
        </div>
      )}

      {/* ── product detail: gallery + discount + delivery + similar ── */}
      <Sheet open={!!sel} onClose={() => setSel(null)}>
        {sel && step === "detail" && (
          <div className="shop-detail">
            {sel.photoCount > 1 ? (
              <div className="shop-gallery">
                <div className="shop-gallery-strip" onScroll={(e) => { const el = e.currentTarget; setGalleryIdx(Math.round(el.scrollLeft / el.clientWidth)); }}>
                  {Array.from({ length: Math.min(5, sel.photoCount) }, (_, i) => (
                    <img key={i} className="shop-gallery-img" src={apiUrl(`/api/shop/photo/${sel.id}/${i}`)} alt="" loading={i === 0 ? "eager" : "lazy"} onClick={() => { haptic(); setLightbox(i); }} />
                  ))}
                </div>
                <div className="shop-gallery-dots">
                  {Array.from({ length: Math.min(5, sel.photoCount) }, (_, i) => (
                    <span key={i} className={"shop-gallery-dot" + (i === galleryIdx ? " on" : "")} />
                  ))}
                </div>
              </div>
            ) : sel.hasPhoto ? (
              <img className="shop-detail-photo" src={apiUrl(`/api/shop/photo/${sel.id}`)} alt="" onClick={() => { haptic(); setLightbox(0); }} />
            ) : (
              <div className="shop-detail-photo shop-card-noimg">🛍</div>
            )}
            <div className="shop-detail-headline">
              <h3 className="shop-detail-name">{sel.name}</h3>
              <button className="shop-share-btn sm" onClick={() => shareProduct(sel)} aria-label="Ulashish"><Icon name="share" size={15} /></button>
            </div>
            {sel.description && <p className="muted fs13">{sel.description}</p>}
            <PriceBlock p={sel} big />
            {sel.stock <= SHOP_LOW_STOCK && <div className="shop-low-line">⚡ Kam qoldi: {sel.stock} dona</div>}
            <div className="shop-deliver-line">🚚 Bugun buyurtma qilsangiz — <b>1 kun ichida yetkazamiz</b> · do'kon egasi qo'ng'iroq qiladi</div>
            <button className="shop-reviews-entry" onClick={() => { haptic(); loadReviews(sel.id); setStep("reviews"); }}>
              <span>🗣 Sharhlar</span>
              <span className="shop-reviews-agg">
                {sel.likes + sel.dislikes > 0 ? <>👍 {sel.likes}{sel.dislikes > 0 && <> · 👎 {sel.dislikes}</>}</> : "Birinchi bo'lib yozing"}
              </span>
              <span className="shop-reviews-chev">›</span>
            </button>
            {deficit > 0 ? (
              <>
                {/* 🧺 V2: tanga yetmasa ham savatga qo'shsa bo'ladi — savat NAQD bilan yakunlanadi */}
                {bazarcart && (
                  (cart[sel.id] ?? 0) > 0 ? (
                    <div className="shop-qty-row">
                      <Button variant="ghost" onClick={() => addToCart(sel, -1)} aria-label="Kamaytirish">−</Button>
                      <span className="shop-qty-n">🧺 {cart[sel.id]}</span>
                      <Button variant="ghost" onClick={() => addToCart(sel, 1)} aria-label="Ko'paytirish">+</Button>
                      <Button variant="brand" onClick={() => { setSel(null); setCartOpen(true); }}>Savatni ochish</Button>
                    </div>
                  ) : (
                    <Button variant="brand" onClick={() => addToCart(sel, 1)}>🧺 Savatga qo'shish (naqd)</Button>
                  )
                )}
                {/* tanga yetmasa ham NAQD yo'li doim ochiq — hamkor-do'kon savdosi yo'qolmaydi */}
                <Button variant={bazarcart ? "ghost" : "brand"} onClick={() => { haptic(); setPayMode("cash"); setStep("confirm"); }}>
                  💵 Bittasini naqdga — {formatNumber(sel.priceTanga)} so'm
                </Button>
                <div className="shop-insufficient-bar">
                  <div className="fs13">🪙 Tanga bilan: sizda <b>{formatNumber(me.coins)}</b> / kerak: <b>{formatNumber(sel.priceTanga)}</b></div>
                  <ProgressBar value={me.coins} max={sel.priceTanga} />
                  <div className="muted fs12 mt6">Yana <b>{formatNumber(deficit)} tanga</b> kerak.</div>
                  {friendsNeeded && (
                    <div className="fs13 mt6" style={{ lineHeight: 1.5 }}>
                      👥 <b>{friendsNeeded} do'stingizga</b> ulashsangiz — yetadi!<br />
                      <span className="muted fs12">Har do'st qo'shilib safar qilsa sizga <b>{formatNumber(refInfo!.rewardReferrer)} tanga</b> tushadi.</span>
                    </div>
                  )}
                  <Button variant="ghost" onClick={() => {
                    haptic();
                    if (refInfo) shareLink(inviteLandingUrl(refInfo.link), inviteText(refInfo.rewardReferee));
                  }}>👥 Do'stlarga ulashib tanga yig'ish</Button>
                </div>
              </>
            ) : (
              <>
                {/* 🧺 V2: savatga qo'shish — bazarcart ON'dagina; 1-dona tezkor-oqim ham qoladi */}
                {bazarcart && (
                  (cart[sel.id] ?? 0) > 0 ? (
                    <div className="shop-qty-row">
                      <Button variant="ghost" onClick={() => addToCart(sel, -1)} aria-label="Kamaytirish">−</Button>
                      <span className="shop-qty-n">🧺 {cart[sel.id]}</span>
                      <Button variant="ghost" onClick={() => addToCart(sel, 1)} aria-label="Ko'paytirish">+</Button>
                      <Button variant="brand" onClick={() => { setSel(null); setCartOpen(true); }}>Savatni ochish</Button>
                    </div>
                  ) : (
                    <Button variant="brand" onClick={() => addToCart(sel, 1)}>🧺 Savatga qo'shish — {formatNumber(sel.priceTanga)}</Button>
                  )
                )}
                <Button variant={bazarcart ? "ghost" : "brand"} onClick={() => { haptic(); setPayMode("tanga"); setStep("confirm"); }}>🪙 {bazarcart ? "Bittasini darhol olish" : `Tanga bilan olish — ${formatNumber(sel.priceTanga)}`}</Button>
                <Button variant="ghost" onClick={() => { haptic(); setPayMode("cash"); setStep("confirm"); }}>💵 Naqdga buyurtma — {formatNumber(sel.priceTanga)} so'm</Button>
              </>
            )}
            {similar.length > 0 && (
              <div className="shop-section mt10">
                <div className="shop-section-head"><span className="shop-section-title">O'xshash mahsulotlar</span></div>
                <div className="shop-row-strip">
                  {similar.map((p) => (
                    <button key={p.id} className="shop-mini" onClick={() => openProduct(p)}>
                      {p.hasPhoto ? <img className="shop-mini-img" src={apiUrl(`/api/shop/photo/${p.id}?s=1`)} loading="lazy" decoding="async" alt="" /> : <div className="shop-mini-img shop-card-noimg">🛍</div>}
                      <div className="shop-mini-name">{p.name}</div>
                      <div className="shop-mini-price">🪙 {formatNumber(p.priceTanga)}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {sel && step === "reviews" && (
          <div className="shop-reviews">
            <button className="pay-back" onClick={() => setStep("detail")}>Orqaga</button>
            <h3>🗣 {sel.name} — sharhlar</h3>
            {revLoadErr ? (
              <EmptyState icon="📡" text="Sharhlar yuklanmadi — qayta urinib ko'ring" action="🔄 Qayta urinish" onAction={() => loadReviews(sel.id)} />
            ) : reviews === null ? (
              <><Skeleton h={46} className="mt8" /><Skeleton h={46} className="mt8" /></>
            ) : (
              <>
                <div className="shop-rev-agg">
                  <span className="shop-rev-agg-up">👍 {reviews.likes}</span>
                  <span className="shop-rev-agg-down">👎 {reviews.dislikes}</span>
                  <span className="muted fs12">{reviews.reviews.length} sharh</span>
                </div>

                {/* write / edit my review */}
                <div className="shop-rev-form">
                  <div className="shop-rev-thumbs">
                    <button className={"shop-rev-thumb" + (revThumb === "up" ? " on up" : "")} onClick={() => { haptic(); setRevThumb("up"); }}>👍 Yoqdi</button>
                    <button className={"shop-rev-thumb" + (revThumb === "down" ? " on down" : "")} onClick={() => { haptic(); setRevThumb("down"); }}>👎 Yoqmadi</button>
                  </div>
                  <textarea
                    className="bk-input shop-rev-text"
                    placeholder="Fikringiz (ixtiyoriy)…"
                    maxLength={SHOP_REVIEW_MAX_TEXT}
                    value={revText}
                    onChange={(e) => setRevText(e.target.value)}
                    rows={2}
                  />
                  <div className="shop-rev-photo-row">
                    {revPhotos.map((d, i) => (
                      <span key={i} className="shop-rev-photo-prev">
                        <img src={d} alt="" />
                        <button onClick={() => setRevPhotos((p) => p.filter((_, j) => j !== i))}>✕</button>
                      </span>
                    ))}
                    {revPhotos.length < SHOP_REVIEW_MAX_PHOTOS && (
                      <button className="shop-rev-photo-add" onClick={() => revFileRef.current?.click()}>📷<small>+{SHOP_REVIEW_MAX_PHOTOS - revPhotos.length}</small></button>
                    )}
                    <input ref={revFileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { void addRevPhotos(e.target.files); e.target.value = ""; }} />
                  </div>
                  {revErr && <div className="sheet-err">{revErr}</div>}
                  <Button variant="brand" disabled={!revThumb || revBusy} onClick={submitReview}>
                    {revBusy ? "Yuborilmoqda…" : reviews.reviews.some((r) => r.mine) ? "Sharhni yangilash" : "Sharh qoldirish"}
                  </Button>
                  {reviews.reviews.some((r) => r.mine) && (
                    <button className="shop-rev-del" onClick={() => { haptic(); api.shopReviewDelete(sel.id).then(() => { setRevThumb(null); setRevText(""); setRevPhotos([]); loadReviews(sel.id); load(); }).catch(() => undefined); }}>
                      Sharhimni o'chirish
                    </button>
                  )}
                </div>

                {/* list */}
                {reviews.reviews.length === 0 ? (
                  <EmptyState icon="🗣" text="Hali sharh yo'q — birinchi bo'lib yozing!" />
                ) : (
                  reviews.reviews.map((r) => (
                    <div key={r.id} className="shop-rev-row">
                      <div className="shop-rev-head">
                        <b>{r.thumb === "up" ? "👍" : "👎"} {r.name}</b>
                        {r.verified && <span className="shop-rev-verified">✅ Xarid qilgan</span>}
                        {r.mine && <span className="shop-rev-mine">siz</span>}
                        <span className="muted fs11">{new Date(r.createdAt).toLocaleDateString("uz-UZ")}</span>
                      </div>
                      {r.text && <div className="fs13">{r.text}</div>}
                      {r.photoCount > 0 && (
                        <div className="shop-rev-photo-row">
                          {Array.from({ length: r.photoCount }, (_, i) => (
                            <img key={i} className="shop-rev-photo" src={apiUrl(`/api/shop/review-photo/${r.id}/${i}?s=1`)} loading="lazy" decoding="async" alt="" />
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </>
            )}
          </div>
        )}
        {sel && step === "confirm" && (
          <>
            <button className="pay-back" onClick={() => setStep("detail")}>Orqaga</button>
            <h3>📦 Yetkazish manzili</h3>
            <p className="muted fs13">Do'kon egasi {me.member.phone ?? "raqamingiz"} orqali siz bilan bog'lanadi.</p>
            <input className="bk-input" placeholder="Masalan: Koson sh., Guliston ko'chasi 12-uy" value={address} onChange={(e) => setAddress(e.target.value)} />
            <div className="shop-confirm-total mt10">
              Jami: {payMode === "cash" ? `💵 ${formatNumber(sel.priceTanga)} so'm` : `🪙 ${formatNumber(sel.priceTanga)}`}
            </div>
            {payMode === "cash" && <div className="shop-deliver-line">💵 Naqd — <b>yetkazganda to'laysiz</b>, hozir hech narsa olinmaydi</div>}
            {buyErr && <div className="sheet-err">{buyErr}</div>}
            <Button variant="brand" disabled={busy || address.trim().length < 5} onClick={submit}>
              {busy ? "Yuborilmoqda…" : payMode === "cash" ? `Tasdiqlash — 💵 ${formatNumber(sel.priceTanga)} so'm` : `Tasdiqlash — 🪙 ${formatNumber(sel.priceTanga)}`}
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
            <div className="shop-success-promise">
              {success.pay === "cash" ? "🚚 Tez orada yetkazamiz — 💵 yetkazganda to'laysiz" : "🚚 Tez orada yetkazamiz — do'kon egasi siz bilan bog'lanadi"}
            </div>
            <Button variant="brand" onClick={() => { setSuccess(null); openOrders(); }}>📦 Buyurtmalarim</Button>
          </div>
        </div>
      )}

      {/* ── my orders ── */}
      <Sheet open={ordersOpen} onClose={() => setOrdersOpen(false)}>
        <h3>📦 Buyurtmalarim</h3>
        {/* 🧺 V2: savat-buyurtmalar (timeline + pending'da bekor) — legacy ro'yxat tepasida */}
        {bazarcart && (mktOrders ?? []).map((o) => (
          <div key={`m${o.id}`} className="glass pad shop-order-row">
            <div className="shop-order-top">
              <b>🧺 {o.shopName} · {o.items.length} mahsulot</b>
              <MktStatusPill s={o.status} />
            </div>
            <div className="muted fs12">{o.items.map((i) => `${i.name.slice(0, 22)}×${i.qty}`).join(" · ")}</div>
            <div className="muted fs12">#{o.id} · {o.payKind === "cash" ? `💵 ${formatNumber(o.total)} so'm (naqd)` : `🪙 ${formatNumber(o.total)}`} · {new Date(o.createdAt).toLocaleDateString("uz-UZ")}</div>
            {(o.status === "pending" || o.status === "accepted" || o.status === "delivering") && (
              <div className="shop-mkt-timeline" aria-label="Buyurtma holati">
                {(["pending", "accepted", "delivering", "delivered"] as const).map((st, i) => {
                  const idx = ["pending", "accepted", "delivering", "delivered"].indexOf(o.status);
                  return <span key={st} className={`shop-mkt-dot${i <= idx ? " on" : ""}${i === idx ? " now" : ""}`} />;
                })}
              </div>
            )}
            {o.status === "rejected" && (
              <div className="order-refund-banner">{o.rejectReason ? `Sabab: ${o.rejectReason.replace(/^#\w+\s?/, "")}. ` : ""}{o.payKind === "cash" ? "Hech qanday pul olinmagan." : <>✅ <b>{formatNumber(o.total)} tanga qaytarildi</b></>}</div>
            )}
            {o.status === "pending" && (
              <Button variant="ghost" onClick={() => cancelMkt(o.id)}>✖ Bekor qilish</Button>
            )}
          </div>
        ))}
        {ordersErr ? (
          <EmptyState icon="📡" text="Yuklanmadi — internetni tekshirib qayta urinib ko'ring" action="🔄 Qayta urinish" onAction={loadOrders} />
        ) : orders === null ? (
          <><Skeleton h={54} className="mt8" /><Skeleton h={54} className="mt8" /></>
        ) : orders.length === 0 && (mktOrders ?? []).length > 0 ? null : orders.length === 0 ? (
          <EmptyState icon="🛍" text="Hali xarid yo'q — birinchi mahsulotingizni tanlang!" />
        ) : (
          orders.map((o) => (
            <div key={o.id} className="glass pad shop-order-row">
              <div className="shop-order-top">
                <b>{o.productName}</b>
                <StatusPill s={o.status} />
              </div>
              <div className="muted fs12">
                #{o.id} · {o.payKind === "cash" ? `💵 ${formatNumber(o.priceTanga)} so'm (naqd)` : `🪙 ${formatNumber(o.priceTanga)}`} · {new Date(o.createdAt).toLocaleDateString("uz-UZ")}
              </div>
              {o.status === "rejected" && (
                <div className="order-refund-banner">
                  {o.note ? `Sabab: ${o.note}. ` : ""}{o.payKind === "cash" ? "Hech qanday pul olinmagan." : <>✅ <b>{formatNumber(o.priceTanga)} tanga hisobingizga qaytarildi</b></>}
                </div>
              )}
            </div>
          ))
        )}
      </Sheet>
      {/* ── 🧺 V2: yopishqoq savat-bar + savat-sheet (flag bazarcart) ── */}
      {bazarcart && !sel && !ordersOpen && !cartOpen && (
        <BjStickyCartBar count={cartCount} totalTanga={cartItemsTotal} onOpen={() => { haptic(); setCartOpen(true); }} />
      )}
      {bazarcart && (
        <Sheet open={cartOpen} onClose={() => { setCartOpen(false); setCoSuccess(null); setCoErr(null); }}>
          {coSuccess !== null ? (
            <div className="shop-success">
              <div className="shop-success-emoji">🎉</div>
              <h3>Buyurtma #{coSuccess} qabul qilindi!</h3>
              <p className="muted fs13">{cartShop?.name ?? "Do'kon"} tez orada tasdiqlaydi — har bosqichda sizga xabar keladi. Holatni «📦 Buyurtmalarim»da kuzating.</p>
              <Button variant="brand" onClick={() => { setCartOpen(false); setCoSuccess(null); }}>Yopish</Button>
            </div>
          ) : cartLines.length === 0 ? (
            <>
              <h3>🧺 Savat</h3>
              <EmptyState icon="🧺" text="Savat bo'sh — bozor sizni kutyapti!" action="Bozorga qaytish" onAction={() => setCartOpen(false)} />
            </>
          ) : (
            <CartCheckout
              lines={cartLines}
              shopName={cartShop?.name ?? "BirJoy o'z do'koni"}
              itemsTotal={cartItemsTotal}
              deliveryFee={cartDelivery}
              minOrder={cartShop?.minOrderTanga ?? 0}
              coins={me.coins}
              pay={coPay}
              setPay={setCoPay}
              busy={coBusy}
              err={coErr}
              onQty={(p, d) => addToCart(p, d)}
              onSubmit={checkout}
            />
          )}
        </Sheet>
      )}
      {/* ── 🔍 to'liq-ekran rasm ko'ruvchi: rasmga bosilganda ochiladi, ‹ Orqaga bilan yopiladi ── */}
      {sel && lightbox !== null && (
        <ProductLightbox
          productId={sel.id}
          count={Math.max(1, sel.photoCount)}
          start={lightbox}
          onClose={() => setLightbox(null)}
        />
      )}
      {void onBanner}
    </div>
  );
}

/** To'liq-ekran rasm ko'ruvchi (Instagram/Uzum uslubi): gorizontal scroll-snap barcha rasmlar
 *  bo'ylab, ‹ Orqaga tugma HAR DOIM ustida, fonni bosish ham yopadi. */
function ProductLightbox({ productId, count, start, onClose }: { productId: number; count: number; start: number; onClose: () => void }) {
  const stripRef = useRef<HTMLDivElement | null>(null);
  const [idx, setIdx] = useState(start);
  useEffect(() => {
    stripRef.current?.scrollTo({ left: start * stripRef.current.clientWidth, behavior: "auto" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="shop-lightbox" onClick={onClose}>
      <button className="shop-lightbox-back" onClick={(e) => { e.stopPropagation(); haptic(); onClose(); }}>‹ Orqaga</button>
      <div
        ref={stripRef}
        className="shop-lightbox-strip"
        onClick={(e) => e.stopPropagation()}
        onScroll={(e) => { const el = e.currentTarget; setIdx(Math.round(el.scrollLeft / el.clientWidth)); }}
      >
        {Array.from({ length: count }, (_, i) => (
          <img key={i} className="shop-lightbox-img" src={apiUrl(`/api/shop/photo/${productId}/${i}`)} alt="" loading={Math.abs(i - start) <= 1 ? "eager" : "lazy"} />
        ))}
      </div>
      {count > 1 && (
        <div className="shop-lightbox-dots">
          {Array.from({ length: count }, (_, i) => <span key={i} className={"shop-gallery-dot" + (i === idx ? " on" : "")} />)}
        </div>
      )}
    </div>
  );
}

/** 🧺 V2 savat-checkout paneli: satrlar (qty-stepper) → hisob-karta → manzil/to'lov → yuborish.
 *  Narxlar KO'RSATMA — yakuniy hisob serverda snapshot bilan qayta-hisoblanadi. */
function CartCheckout({ lines, shopName, itemsTotal, deliveryFee, minOrder, coins, pay, setPay, busy, err, onQty, onSubmit }: {
  lines: { p: ShopProductView; qty: number }[];
  shopName: string;
  itemsTotal: number;
  deliveryFee: number;
  minOrder: number;
  coins: number;
  pay: "tanga" | "cash";
  setPay: (p: "tanga" | "cash") => void;
  busy: boolean;
  err: string | null;
  onQty: (p: ShopProductView, delta: number) => void;
  onSubmit: (address: string, note: string) => void;
}) {
  const [address, setAddress] = useState(() => { try { return localStorage.getItem(LAST_ADDR_KEY) ?? ""; } catch { return ""; } });
  const [note, setNote] = useState("");
  const total = itemsTotal + deliveryFee;
  const short = Math.max(0, minOrder - itemsTotal);
  const insufficient = pay === "tanga" && coins < total;
  return (
    <div className="shop-cartco">
      <h3>🧺 Savat — {shopName}</h3>
      {lines.map((l) => (
        <div key={l.p.id} className="shop-cart-row">
          <span className="shop-cart-name">{l.p.name}</span>
          <div className="shop-qty-row">
            <button className="shop-qty-btn" onClick={() => onQty(l.p, -1)} aria-label="Kamaytirish">−</button>
            <span className="shop-qty-n">{l.qty}</span>
            <button className="shop-qty-btn" onClick={() => onQty(l.p, 1)} aria-label="Ko'paytirish">+</button>
          </div>
          <b className="shop-cart-sum">{formatNumber(l.qty * l.p.priceTanga)}</b>
        </div>
      ))}
      <div className="shop-cart-totals glass pad">
        <div className="shop-cart-trow"><span>Mahsulotlar</span><b>{formatNumber(itemsTotal)}</b></div>
        {deliveryFee > 0 && <div className="shop-cart-trow"><span>🚚 Yetkazish</span><b>{formatNumber(deliveryFee)}</b></div>}
        <div className="shop-cart-trow shop-cart-grand"><span>Jami</span><b>{formatNumber(total)} {pay === "cash" ? "so'm" : "tanga"}</b></div>
      </div>
      {short > 0 && <div className="order-refund-banner">Minimal buyurtma {formatNumber(minOrder)} — yana {formatNumber(short)} qo'shing</div>}
      <div className="shop-pay-toggle">
        <Button variant={pay === "tanga" ? "brand" : "ghost"} onClick={() => { haptic(); setPay("tanga"); }}>🪙 Tanga</Button>
        <Button variant={pay === "cash" ? "brand" : "ghost"} onClick={() => { haptic(); setPay("cash"); }}>💵 Naqd</Button>
      </div>
      {insufficient && <div className="order-refund-banner">Tanga yetmaydi ({formatNumber(coins)} bor) — 💵 Naqd usulini tanlang</div>}
      <input className="shop-search" placeholder="📍 Yetkazish manzili (kamida 5 belgi)" value={address} onChange={(e) => setAddress(e.target.value)} />
      <input className="shop-search mt6" placeholder="✍️ Izoh (ixtiyoriy)" value={note} onChange={(e) => setNote(e.target.value)} />
      <p className="muted fs12 mt6">📦 Eshik oldida tekshirib oling — yoqmasa olmang{pay === "cash" ? ", pul to'lamaysiz" : ""}.</p>
      {err && <div className="order-refund-banner">{err}</div>}
      <Button variant="brand" disabled={busy || short > 0 || insufficient || address.trim().length < 5} onClick={() => onSubmit(address, note)}>
        {busy ? "Yuborilmoqda…" : `Buyurtma berish — ${formatNumber(total)}`}
      </Button>
    </div>
  );
}
