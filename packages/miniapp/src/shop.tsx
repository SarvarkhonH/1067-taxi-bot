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
  type ShopChatMessageView,
  type ShopProductView,
  type ShopProfileView,
  type ShopStoryPost,
  type ShopStoryTrayItem,
  type ShopPurchaseView,
  type ShopReviewsResponse,
  type ReferralResponse,
  type MahallaView,
} from "@t1067/shared";
import { api, apiUrl } from "./api";
import { loadErrorText } from "./util";
import { haptic, hapticSuccess, inviteText, inviteLandingUrl, shareLink, tgGetLocation, tgHasLocationManager } from "./telegram";
import { confetti, compressImage } from "./util";
import { useBackButton } from "./useBackButton";
import { Button, EmptyState, ProgressBar, Sheet, Skeleton } from "./design/components";
import { BjCategoryCarousel, BjShopCard, BjMahallaShopCard, BjSection, BjStickyCartBar } from "./design/birjoy"; // 🏪 V1.4+V2 BirJoy-kit
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

/** Mockup'dagi "N kun oldin" qatori — API `createdAt`ni ISO qaytaradi, nisbiy vaqt yo'q. */
function daysAgo(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d <= 0) return "Bugun";
  if (d === 1) return "Kecha";
  if (d < 7) return `${d} kun oldin`;
  const w = Math.floor(d / 7);
  return w === 1 ? "1 hafta oldin" : `${w} hafta oldin`;
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

// 🏷 KATALOG (ega, 2026-07-27): mahsulot-pasporti jadvali — supermarket darajasidagi "Xususiyatlar".
// Faqat TO'LDIRILGAN satrlar chiziladi: bo'sh maydon "—" bo'lib turmaydi (bo'sh jadval mahsulotni
// arzon ko'rsatadi). Barkod/SKU/yetkazib beruvchi bu yerda YO'Q — ular server javobiga ham
// qo'shilmaydi (ega qarori: ichki ma'lumot).
function ProductSpecs({ p }: { p: ShopProductView }) {
  const rows: [string, string][] = [];
  if (p.brand) rows.push(["Brend", p.brand]);
  if (p.unit) rows.push(["Hajmi / og'irligi", p.unit]);
  if (p.manufacturer) rows.push(["Ishlab chiqaruvchi", p.manufacturer]);
  if (p.expiryDate) {
    // ISO (YYYY-MM-DD) → kun.oy.yil. Muddat o'tgan bo'lsa mijozga ROSTINI aytamiz — bunday
    // mahsulot javondan olinishi kerak, yashirish ishonchni yo'q qiladi.
    const [y, m, d] = p.expiryDate.split("-");
    const left = Math.ceil((new Date(`${p.expiryDate}T00:00:00Z`).getTime() - Date.now()) / 86400_000);
    rows.push(["Yaroqlilik muddati", `${d}.${m}.${y}${left < 0 ? " ⛔ o'tgan" : left <= 7 ? ` · ${left} kun qoldi` : ""}`]);
  }
  if (!rows.length) return null;
  return (
    <div className="shop-spec">
      <div className="shop-spec-title">Xususiyatlari</div>
      {rows.map(([k, v]) => (
        <div className="shop-spec-row" key={k}>
          <span className="shop-spec-k">{k}</span>
          <span className="shop-spec-v">{v}</span>
        </div>
      ))}
    </div>
  );
}

function PriceBlock({ p, big }: { p: ShopProductView; big?: boolean }) {
  const d = discountPct(p);
  const [why, setWhy] = useState(false);
  return (
    <div className={big ? "shop-price-big" : "shop-price-line"}>
      {/* Ega qarori: do'kon-narxlar HAQIQIY pul (1 tanga=1 so'm) — shu sabab shu yerda "so'm"
          ko'rsatiladi, "tanga" so'zi FAQAT haqiqiy tanga-hamyon (wallet) bilan bog'liq joylarda
          qoladi (masalan "Tanga bilan olish" to'lov-usuli, yetarli-emas-hamyon balansi). */}
      <span className={big ? "shop-confirm-total" : "shop-price-chip"}>{formatNumber(p.priceTanga)} so&apos;m</span>
      {d > 0 && <span className="shop-price-old">{formatNumber(p.oldPriceTanga!)} so&apos;m</span>}
      {/* §10.2: "Nima uchun bu narx?" — narx-tarkibi shaffofligi, faqat detail-sahifada (big) */}
      {big && (
        <button className="shop-price-why" onClick={() => setWhy((v) => !v)} aria-label="Nima uchun bu narx?">
          ⓘ Nima uchun bu narx?
        </button>
      )}
      {big && why && (
        <div className="shop-price-why-box">
          {d > 0 ? (
            <p>Asl narx <b>{formatNumber(p.oldPriceTanga!)} so&apos;m</b> edi — hozir <b>−{d}%</b> chegirma bilan <b>{formatNumber(p.priceTanga)} so&apos;m</b>.</p>
          ) : (
            <p>Bu — sotuvchi belgilagan mahsulot narxi, chegirmasiz.</p>
          )}
          <p className="muted">🚚 Yetkazish narxga kiritilmagan — sotuvchi qo&apos;ng&apos;iroq qilib manzil/yetkazishni kelishadi.</p>
        </div>
      )}
    </div>
  );
}

// compact card used in horizontal rows + search grid
function ProductCard({ p, onOpen, wide, onFav }: { p: ShopProductView; onOpen: (p: ShopProductView) => void; wide?: boolean; onFav?: (p: ShopProductView) => void }) {
  return (
    <button className={"shop-card glass" + (wide ? "" : " shop-card-h")} onClick={() => onOpen(p)}>
      <div className="shop-card-photo-wrap">
        {p.hasPhoto ? <img className="shop-card-photo" src={apiUrl(`/api/shop/photo/${p.id}?s=1`)} loading="lazy" decoding="async" alt="" /> : <div className="shop-card-photo shop-card-noimg">🛍</div>}
        <Badges p={p} />
        {/* 🧡 V2b: sevimlilar — optimistic toggle, xatoda rollback (services.tsx naqshi).
            <span role="button"> — <button> ichida <button> INVALID HTML edi (DOM-nesting
            ogohlantirishi shopv2 QA'sida topildi); tashqi karta o'zi asosiy interaktiv element. */}
        {onFav && (
          <span
            className={"bj-fav" + (p.isFav ? " on" : "")}
            role="button"
            tabIndex={0}
            aria-label={p.isFav ? "Sevimlidan olish" : "Sevimliga qo'shish"}
            onClick={(e) => { e.stopPropagation(); onFav(p); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onFav(p); } }}
          >
            <Icon name="heart" size={16} filled={p.isFav} />
          </span>
        )}
      </div>
      <div className="shop-card-body">
        <div className="shop-card-name">{p.name}</div>
        {/* 🏷 Katalog: "Coca-Cola · 1.5 L" — supermarket kartasida nomdan keyingi eng muhim ikki
            ma'lumot. To'ldirilmagan bo'lsa qator umuman chizilmaydi (bo'sh joy qolmaydi). */}
        {(p.brand || p.unit) && <div className="shop-card-spec">{[p.brand, p.unit].filter(Boolean).join(" · ")}</div>}
        {p.likes > 0 && <div className="shop-card-likes">👍 {p.likes}{p.dislikes > 0 ? ` · 👎 ${p.dislikes}` : ""}</div>}
        <PriceBlock p={p} />
        {/* AUDIT: "Sotib olish" deb yozilgan-u, bosilganda faqat mahsulot OCHILADI — hech narsa
            sotib olinmaydi. Xarid tugmalari detail-ekranda. Yolg'on va'da o'rniga rost fe'l. */}
        <div className="shop-buy-bar">Ko&apos;rish</div>
      </div>
    </button>
  );
}

// shopv2: do'kon-profil ichidagi mahsulot-panjara — tasdiqlangan dizaynda "Instagram-uslub"
// kvadrat kafel (rasm/gradient fon, rasm bo'lmasa katta bosh-harf, pastda qorong'i-gradient
// ustida nom+narx). Faqat do'kon-profilda ishlatiladi — ProductCard qidiruv/o'xshash-mahsulot
// natijalarida (ko'proq ma'lumot kerak bo'lgan joylarda) o'zgarishsiz qoladi.
function StoreTile({ p, onOpen, onFav }: { p: ShopProductView; onOpen: (p: ShopProductView) => void; onFav?: (p: ShopProductView) => void }) {
  const d = discountPct(p);
  return (
    <button className="shop-tile" onClick={() => onOpen(p)}>
      {p.hasPhoto ? (
        <img className="shop-tile-img" src={apiUrl(`/api/shop/photo/${p.id}?s=1`)} loading="lazy" decoding="async" alt="" />
      ) : (
        <span className="shop-tile-initial" aria-hidden="true">{p.name.trim().charAt(0).toUpperCase()}</span>
      )}
      <div className="shop-tile-grad" />
      {d > 0 && <span className="shop-tile-disc">−{d}%</span>}
      {onFav && (
        <span
          className={"shop-tile-fav" + (p.isFav ? " on" : "")}
          role="button"
          tabIndex={0}
          aria-label={p.isFav ? "Sevimlidan olish" : "Sevimliga qo'shish"}
          onClick={(e) => { e.stopPropagation(); onFav(p); }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onFav(p); } }}
        >
          <Icon name="heart" size={13} filled={p.isFav} />
        </span>
      )}
      <div className="shop-tile-body">
        <div className="shop-tile-name">{p.name}</div>
        <div className="shop-tile-price">{formatNumber(p.priceTanga)} so&apos;m</div>
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
  const [revRating, setRevRating] = useState(0); // ⭐ V3.2: 1-5, 0 = tanlanmagan (additiv, thumb baribir shart)
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
      setRevRating(r.myRating ?? 0);
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
        rating: revRating > 0 ? revRating : undefined,
        text: revText.trim() || undefined,
        photos: revPhotos.length ? revPhotos : undefined,
      });
      if (r.ok) {
        hapticSuccess();
        if (r.tangaGranted) { confetti(14); onBanner(`🗣 Sharh uchun +${r.tangaGranted} tanga!`); }
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

  // 🧡 V2b: sevimlilar — optimistic toggle + rollback xatoda (services.tsx svcFav naqshi)
  const [favOnly, setFavOnly] = useState(false);
  const patchFav = (id: number, on: boolean, favCount: number) => {
    setProducts((list) => list?.map((p) => (p.id === id ? { ...p, isFav: on, favCount } : p)) ?? list);
    if (sel?.id === id) setSel((s) => (s ? { ...s, isFav: on, favCount } : s));
  };
  const toggleFav = async (p: ShopProductView) => {
    haptic();
    const next = !p.isFav;
    patchFav(p.id, next, (p.favCount ?? 0) + (next ? 1 : -1)); // optimistic
    try {
      const r = await api.shopFav(p.id, next);
      if (r.ok) patchFav(p.id, r.on, r.favCount);
      else patchFav(p.id, p.isFav ?? false, p.favCount ?? 0); // rollback
    } catch {
      patchFav(p.id, p.isFav ?? false, p.favCount ?? 0); // rollback — tarmoq xatosi
    }
  };

  // 🏪 V1.4 (BirJoy): bazar-qatlam — flag OFF'da market so'ralmaydi ham, UI ham eski holicha AYNAN
  const bazar = !!me.flags?.bazar;
  // 🌘 BirJoy Market v2: qorong'i-oynasimon qayta-dizayn (Claude Design'da tasdiqlangan) — faqat
  // vizual qatlam (className toggle + tokens.css'dagi .app.bjm override'lari), mantiq o'zgarmaydi.
  const shopv2 = !!me.flags?.shopv2;
  // 📹 S1: do'kon-hikoya — tray Bozor-boshda, alohida flag (bazar ON bo'lsa ham story hali DARK
  // bo'lishi mumkin, ega alohida QABUL qiladi).
  const shopstory = !!me.flags?.shopstory;
  const [storyTray, setStoryTray] = useState<ShopStoryTrayItem[] | null>(null);
  const [storyViewer, setStoryViewer] = useState<{ shopId: number; stories: ShopStoryPost[]; idx: number } | null>(null);
  useEffect(() => {
    if (!bazar || !shopstory) return;
    api.shopStories().then((r) => setStoryTray(r.shops)).catch(() => undefined);
  }, [bazar, shopstory]);
  const openStoryViewer = async (shopId: number) => {
    haptic();
    try {
      const r = await api.shopStoriesFor(shopId);
      if (!r.stories.length) return;
      setStoryViewer({ shopId, stories: r.stories, idx: 0 });
      const first = r.stories[0]!;
      if (!first.seen) api.shopStoryView(first.id).catch(() => undefined);
    } catch { /* jim — tray'dan qayta urinib ko'radi */ }
  };
  const advanceStory = (dir: 1 | -1) => {
    setStoryViewer((v) => {
      if (!v) return v;
      const nextIdx = v.idx + dir;
      if (nextIdx < 0) return v; // birinchi hikoyada orqaga — joyida qoladi
      if (nextIdx >= v.stories.length) {
        setStoryTray((tray) => tray?.map((t) => (t.shopId === v.shopId ? { ...t, seen: true } : t)) ?? tray);
        return null; // oxirgi hikoyadan keyin — yopiladi
      }
      const s = v.stories[nextIdx]!;
      if (!s.seen) api.shopStoryView(s.id).catch(() => undefined);
      return { ...v, idx: nextIdx };
    });
  };
  // 💬 C1: mijoz↔do'kon chat (bot-relay). Thread — do'kon-profil ekranidan ochiladi.
  const [chatShop, setChatShop] = useState<{ id: number; name: string } | null>(null);
  const [chatMsgs, setChatMsgs] = useState<ShopChatMessageView[] | null>(null);
  const [chatText, setChatText] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [chatErr, setChatErr] = useState(false);
  // §10.3 «chat-ichidan savatga»: suhbat davomida mijoz «bu bormi?» deb so'raydi, sotuvchi «ha»
  // deydi — va shu yerdayoq qo'sha olishi kerak, chatni yopib do'konni qayta topmasdan. Shu do'kon
  // mahsulotlari chat ochilganda yuklanadi (do'kon-ko'lamli `shopProducts(shopId)`).
  const [chatProducts, setChatProducts] = useState<ShopProductView[] | null>(null);
  const openChat = (shopId: number, shopName: string) => {
    haptic();
    setChatShop({ id: shopId, name: shopName });
    setChatMsgs(null);
    setChatErr(false);
    setChatProducts(null);
    api.shopChatThread(shopId).then((r) => setChatMsgs(r.messages)).catch(() => setChatErr(true));
    // xatoda jim qolamiz — mahsulot-tasmasi qo'shimcha qulaylik, suhbatning o'zi asosiy.
    api.shopProducts(shopId).then((r) => setChatProducts(r.products.filter((p) => p.stock > 0))).catch(() => setChatProducts([]));
  };
  // §10.3 «yordam-tugma buyurtma-kartada»: buyurtma bilan nimadir noto'g'ri bo'lsa mijoz kimga
  // yozishni bilmay qolardi (do'konni qaytadan topib, profilidan chat ochish kerak edi). Endi
  // kartaning o'zida — chat ochiladi va matn buyurtma-raqami bilan oldindan to'ldiriladi.
  // AVTOMATIK YUBORILMAYDI: mijoz o'z savolini yozib, o'zi yuboradi.
  const openOrderHelp = (o: MarketOrderView) => {
    openChat(o.shopId, o.shopName);
    setChatText(`#${o.id} buyurtmam bo'yicha savolim bor: `);
  };
  const sendChat = async (text: string) => {
    if (!chatShop || !text.trim() || chatSending) return;
    setChatSending(true);
    const r = await api.shopChatSend(chatShop.id, text.trim()).catch(() => ({ ok: false as const }));
    if (r.ok) {
      setChatText("");
      api.shopChatThread(chatShop.id).then((t) => setChatMsgs(t.messages)).catch(() => undefined);
    }
    setChatSending(false);
  };
  const [market, setMarket] = useState<MarketHomeResponse | null>(null);
  const [marketErr, setMarketErr] = useState(false); // AUDIT: bozor-yuklanish xatosi ko'rsatiladi
  // 🏠 V1.5 (Mahalla bozori): "uy" mahalla + safar-rejimi vaqtinchalik override — ikkalasi hech
  // qachon aralashtirilmaydi, joriy mahalla = travelMahallaId ?? mahallaId ?? null.
  const activeMahallaId = me.member.travelMahallaId ?? me.member.mahallaId ?? null;
  // ikki bo'lim — o'z mahallasi (shopKind="mahalla" + mos mahallaId) vs butun shahar (qolgani)
  // §10.2: "hozir ochiq" tezkor-filtr — ikkala ro'yxatga ham qo'llaniladi
  const [openOnly, setOpenOnly] = useState(false);
  // shopv2: tasdiqlangan dizaynda "Barchasi / Mahallamga yetkazadi / Butun shahar" kind-filtri
  // bor edi — mening avvalgi implementatsiyam ikkala bo'limni HAR DOIM ko'rsatardi (filtr yo'q
  // edi). Legacy (shopv2 OFF) o'zgarishsiz qoladi — "all" bilan xatti-harakat bir xil.
  const [shopKindFilter, setShopKindFilter] = useState<"all" | "mahalla" | "bozor">("all");
  const mahallaShops = useMemo(() => (market?.shops ?? []).filter((s) => s.shopKind === "mahalla" && s.mahallaId === activeMahallaId && (!openOnly || s.open)), [market, activeMahallaId, openOnly]);
  const cityShops = useMemo(() => (market?.shops ?? []).filter((s) => s.shopKind !== "mahalla" && (!openOnly || s.open)), [market, openOnly]);
  const showMahallaKind = !shopv2 || shopKindFilter !== "bozor";
  const showBozorKind = !shopv2 || shopKindFilter !== "mahalla";
  const [shopFilter, setShopFilter] = useState<{ id: number; name: string } | null>(null); // 🏬 do'kon-sahifa (lite)
  // shopv2 + bazar-bosh (store-discovery ekrani, hali shopFilter tanlanmagan): yondashilgan reja
  // "Bozor-bosh (qidiruv+kind-chip+ochiq-filtr+ikki bo'lim)" edi — eski hero-karusel+flat-katalog
  // (pre-BirJoy, yagona-do'kon davridan qolgan) shu ekranda O'RNATILMAGAN edi. Ega "hali chalaku"
  // deb topdi — sabab shu: ikki xil IA (do'kon-bo'yicha ko'rish VA flat-mahsulot-katalog) bir
  // sahifada ustma-ust chiqardi. shopv2'da bazar-bosh endi FAQAT do'kon-kashfiyoti.
  const homeFlatCatalog = !(bazar && shopv2 && !shopFilter);
  // Hero-karusel ("barcha do'konlar bo'ylab ajratilgan") hech qachon do'kon-birinchi oqimga mos
  // kelmaydi — na bazar-bosh'da (do'kon-kashfiyoti), na do'kon-profilda (o'sha DO'KONning o'zi
  // ko'rsatilishi kerak). homeFlatCatalog'dan farqli — shopFilter tanlangan bo'lsa ham yashirin.
  const showHeroStrip = !(bazar && shopv2);
  const [mahallaList, setMahallaList] = useState<MahallaView[] | null>(null);
  const [mahallaPickerOpen, setMahallaPickerOpen] = useState(false);
  const [mahallaQuery, setMahallaQuery] = useState("");
  const [mahallaLocating, setMahallaLocating] = useState(false);
  const [travelSuggest, setTravelSuggest] = useState<{ id: number; name: string } | null>(null);
  const [travelDismissed, setTravelDismissed] = useState(false);
  const activeMahalla = useMemo(() => mahallaList?.find((m) => m.id === activeMahallaId) ?? null, [mahallaList, activeMahallaId]);
  useEffect(() => {
    if (!bazar) return;
    api.mahallaList().then((r) => setMahallaList(r.mahallas)).catch(() => undefined);
  }, [bazar]);
  // GPS-eng-yaqin taxmin: birinchi marta bo'lsa jim "uy" sifatida saqlaydi (owner qarori — avtomatik
  // taxmin + qo'lda o'zgartirish), aks holda farq qilsa bir martalik safar-rejimi banner ko'rsatadi.
  useEffect(() => {
    if (!bazar || shopFilter || !tgHasLocationManager()) return;
    let stale = false;
    tgGetLocation().then((loc) => {
      if (stale || "error" in loc) return;
      api.mahallaNearest(loc.lat, loc.lng).then((r) => {
        if (stale || !r.mahalla) return;
        if (activeMahallaId === null) api.setMahalla(r.mahalla!.id, "home").then(reload).catch(() => undefined);
        else if (r.mahalla!.id !== activeMahallaId && !travelDismissed) setTravelSuggest({ id: r.mahalla!.id, name: r.mahalla!.name });
      }).catch(() => undefined);
    });
    return () => { stale = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bazar, shopFilter]);
  const pickMahalla = async (id: number) => {
    haptic();
    setMahallaPickerOpen(false);
    const r = await api.setMahalla(id, "home").catch(() => ({ ok: false }));
    if (r.ok) { onBanner("📍 Mahalla tanlandi"); reload(); }
  };
  const detectMahalla = async () => {
    setMahallaLocating(true);
    const loc = await tgGetLocation();
    setMahallaLocating(false);
    if ("error" in loc) { onBanner("📍 Joylashuvni aniqlab bo'lmadi"); return; }
    const r = await api.mahallaNearest(loc.lat, loc.lng).catch(() => ({ mahalla: null }));
    if (r.mahalla) await pickMahalla(r.mahalla.id);
    else onBanner("📍 Yaqin mahalla topilmadi");
  };
  const acceptTravel = async () => {
    if (!travelSuggest) return;
    haptic();
    await api.setMahalla(travelSuggest.id, "travel").catch(() => undefined);
    setTravelSuggest(null);
    reload();
  };
  const dismissTravel = () => { haptic(); setTravelDismissed(true); setTravelSuggest(null); };
  // 🏪 D2: do'kon-profil (hero/info-qator/e'lon/hikoya/reyting) — shopFilter tanlanganda yuklanadi.
  const [shopProfile, setShopProfile] = useState<ShopProfileView | null>(null);
  const [shopProfileReviews, setShopProfileReviews] = useState<ShopReviewsResponse | null>(null);
  const [profileErr, setProfileErr] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [shopReviewsOpen, setShopReviewsOpen] = useState(false);
  // §10.2: sodiqlik-progress-bar — ko'rsatkich-only (mukofotsiz)
  const [loyalty, setLoyalty] = useState<{ purchaseCount: number; milestone: number; remaining: number } | null>(null);
  // AUDIT: shu do'konning TO'LIQ vitrinasi (global ro'yxat 100 ta bilan cheklangan — do'kon 1 ning
  // 116 mahsulotidan ~83 tasi yetib borardi). Global `products` tegilmaydi.
  const [shopCatalog, setShopCatalog] = useState<ShopProductView[] | null>(null);
  useEffect(() => {
    setShopProfile(null);
    setShopProfileReviews(null);
    setProfileErr(false);
    setAboutOpen(false);
    setLoyalty(null);
    setShopCatalog(null);
    if (!shopFilter) return;
    let stale = false; // R4: guard against an out-of-order response (shop A's fetch resolving
    // AFTER the user already switched to shop B) overwriting B's state with A's stale data.
    api.shopProfile(shopFilter.id)
      .then((r) => { if (!stale) { setShopProfile(r.profile); setShopProfileReviews(r.reviews); } })
      .catch(() => { if (!stale) setProfileErr(true); });
    api.shopLoyalty(shopFilter.id).then((r) => { if (!stale) setLoyalty(r); }).catch(() => undefined);
    api.shopProducts(shopFilter.id).then((r) => { if (!stale) setShopCatalog(r.products); }).catch(() => undefined);
    return () => { stale = true; };
  }, [shopFilter]);
  // 🧺 V2 (flag bazarcart): savat — 1 savat = 1 do'kon (restoran naqshi). Client-state faqat UI;
  // narx/stock/total HAMMASI serverda qayta-hisoblanadi (checkout snapshot) — bu yerdagi raqamlar ko'rsatma.
  const bazarcart = !!me.flags?.bazarcart;
  // 🧺 savat localStorage'da saqlanadi — ShopView tab almashganda unmount bo'ladi (App.tsx
  // `{tab==="dokon" && <ShopView/>}`), shuning uchun sof React-state savatni yo'qotardi. Endi
  // savat ilova qayta-ochilishi/tab-almashinuvidan omon qoladi (1 savat = 1 do'kon).
  const [cart, setCart] = useState<Record<number, number>>(() => { try { return JSON.parse(localStorage.getItem(CART_KEY) ?? "{}").items ?? {}; } catch { return {}; } });
  const [cartShopId, setCartShopId] = useState<number | null>(() => { try { return JSON.parse(localStorage.getItem(CART_KEY) ?? "{}").shopId ?? null; } catch { return null; } });
  const [cartOpen, setCartOpen] = useState(false);

  // ‹ ORQAGA (Bot API 6.1). Do'konda ekranlar ichma-ich ochiladi (rasm → hikoya → savat →
  // buyurtmalar → mahsulot → do'kon-sahifasi), Telegram esa BITTA global tugma beradi. Ilgari
  // tugma umuman ko'rsatilmagani uchun Android'ning apparat «orqaga»si shu ekranlarning
  // HAMMASIDAN ilovani butunlay yopardi. `backTop` — ayni damdagi eng ustki qatlam: bir vaqtda
  // faqat BITTA ishlov beruvchi faol bo'ladi, ya'ni orqaga bosish har doim bitta qadam yechadi.
  // Prioritet 1 — qobiqning "tabdan Uy'ga" ishlov beruvchisidan (0) ustun.
  const backTop = lightbox !== null ? "lightbox"
    : storyViewer ? "story"
    : cartOpen ? "cart"
    : ordersOpen ? "orders"
    : sel ? "product"
    : shopFilter ? "shop"
    : null;
  useBackButton(backTop === "lightbox", () => setLightbox(null), 1);
  useBackButton(backTop === "story", () => setStoryViewer(null), 1);
  useBackButton(backTop === "cart", () => setCartOpen(false), 1);
  useBackButton(backTop === "orders", () => setOrdersOpen(false), 1);
  // Mahsulot ichida sharhlar/tasdiq qadamlari bor — avval o'sha qadam yechiladi, keyin mahsulot.
  useBackButton(backTop === "product", () => { if (step === "detail") setSel(null); else setStep("detail"); }, 1);
  useBackButton(backTop === "shop", () => { setShopFilter(null); setShopProfile(null); }, 1);

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
  // shopv2: yopishqoq savat-barning qisqa "bump" mikro-animatsiyasi — faqat SON KO'PAYGANDA
  // (kamayganda/ochilganda emas), CLAUDE.md'ning "har bosishda <100ms vizual javob" qoidasiga mos.
  const [cartBump, setCartBump] = useState(false);
  const prevCartCount = useRef(cartCount);
  useEffect(() => {
    if (cartCount > prevCartCount.current) {
      setCartBump(true);
      const t = setTimeout(() => setCartBump(false), 420);
      prevCartCount.current = cartCount;
      return () => clearTimeout(t);
    }
    prevCartCount.current = cartCount;
  }, [cartCount]);
  const cartLines = useMemo(() => {
    const byId = new Map((products ?? []).map((p) => [p.id, p]));
    return Object.entries(cart).map(([id, qty]) => ({ p: byId.get(Number(id)), qty })).filter((l): l is { p: ShopProductView; qty: number } => !!l.p && l.qty > 0);
  }, [cart, products]);
  const cartItemsTotal = useMemo(() => cartLines.reduce((s, l) => s + l.qty * l.p.priceTanga, 0), [cartLines]);
  const cartShop = useMemo(() => market?.shops.find((s) => s.id === cartShopId) ?? null, [market, cartShopId]);
  const cartDelivery = cartShop?.deliveryFeeSom ?? 0;

  // 🚪 Mehmon (raqam ulanmagan) — server baribir 401 qaytaradi; bu yerda uni tushunarli taklifga
  // aylantiramiz, xato ekrani o'rniga. Ko'rish ochiq, xarid uchun raqam kerak.
  const guest = me.member.id === 0;
  const askLink = () => {
    onBanner("📱 Buyurtma berish uchun raqamingizni ulang — pastdagi «Ulash» tugmasi");
    return true;
  };
  const addToCart = (p: ShopProductView, delta = 1) => {
    if (guest) { askLink(); return; }
    const pShop = p.shopId ?? 1;
    if (cartShopId !== null && cartShopId !== pShop && cartCount > 0) {
      // boshqa do'kon — savat bitta do'konga (sotuvchi o'zi yetkazadi). Tasdiqlangan v2 dizaynda:
      // window.confirm (bloklovchi) o'rniga avtomatik tozalash + tushuntiruvchi toast (onBanner) —
      // xarid-oqimini to'xtatib qo'ymaydi, faqat nima bo'lganini tushuntiradi.
      // AUDIT TOPDI: eski xabar NIMA yo'qolganini aytmasdi — mijoz to'ldirgan savati jimgina
      // o'chib ketardi. Endi do'kon nomi va nechta mahsulot yo'qolgani aniq aytiladi.
      if (shopv2) onBanner(`🧺 «${cartShop?.name ?? "oldingi do'kon"}» savatingizdagi ${cartCount} ta mahsulot o'chirildi — bir savatga faqat bitta do'kon mahsuloti sig'adi`);
      else if (!window.confirm("Savat bitta do'kon bilan cheklangan — yangi do'kon uchun tozalaymi?")) return;
      setCart({ [p.id]: Math.max(1, delta) });
      setCartShopId(pShop);
      haptic();
      return;
    }
    setCartShopId(pShop);
    setCart((c) => {
      // AUDIT: zaxiradan ortiq qo'shishga yo'l qo'ymaymiz — aks holda checkout'da server rad
      // etadi va mijoz sababini bilmay qoladi. Server baribir yakuniy hakam, bu faqat oldini olish.
      const next = Math.min(20, Math.max(0, p.stock), Math.max(0, (c[p.id] ?? 0) + delta));
      const copy = { ...c };
      if (next === 0) delete copy[p.id];
      else copy[p.id] = next;
      return copy;
    });
    haptic();
  };

  const checkout = async (address: string, note: string) => {
    if (guest) { askLink(); return; }
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
        // AUDIT TOPDI: server `soldOutProductId` qaytaradi, mijoz esa uni TASHLAB YUBORARDI.
        // Agar zaxira QISMAN yetmasa (savatda 3, omborda 1), mahsulot savatda o'z holicha
        // qolardi — har "Buyurtma berish" bosilganda AYNAN o'sha xato qaytaverardi, cheksiz.
        // Savat localStorage'da saqlanadi, ya'ni o'zi hech qachon tuzalmasdi.
        if (r.reason === "sold_out" && r.soldOutProductId) {
          const p = (products ?? []).find((x) => x.id === r.soldOutProductId);
          if (p) {
            if (p.stock > 0) {
              setCart((c) => ({ ...c, [p.id]: Math.min(c[p.id] ?? 1, p.stock) }));
              setCoErr(`«${p.name}» — faqat ${p.stock} dona qoldi, savatda shuncha qoldirdik`);
            } else {
              setCart((c) => { const copy = { ...c }; delete copy[p.id]; return copy; });
              setCoErr(`«${p.name}» tugadi — savatdan olib tashladik`);
            }
            load();
            return;
          }
        }
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
  // AUDIT TOPDI: xato JIM yutilardi (`catch(() => undefined)`) va bozor-boshning HAR bo'limi
  // `market`ga bog'langan — sekin/uzilgan tarmoqda mijoz sarlavha+qidiruvdan boshqa HECH NARSA
  // ko'rmasdi, na skelet, na xato, na "qayta urinish". Koson'da tarmoq tez-tez uziladi.
  const loadMarket = () => {
    setMarketErr(false);
    api.shopMarket().then(setMarket).catch(() => setMarketErr(true));
  };
  useEffect(() => {
    if (!bazar) return;
    loadMarket();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bazar]);

  const featured = useMemo(() => (products ?? []).filter((p) => p.featured).slice(0, 6), [products]);
  // kategoriya chiplar — nechta va qaysi tartibda birinchi ko'rinishda paydo bo'lgan bo'lsa shu
  const categories = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of products ?? []) m.set(p.category, (m.get(p.category) ?? 0) + 1);
    return [...m.entries()];
  }, [products]);
  // 🏪 D2: do'kon-profil ichidagi kategoriya-sub-filtr — faqat shu do'konning mahsulotlaridan
  const shopCategories = useMemo(() => {
    if (!shopFilter) return [];
    const m = new Map<string, number>();
    for (const p of products ?? []) if (p.shopId === shopFilter.id) m.set(p.category, (m.get(p.category) ?? 0) + 1);
    return [...m.entries()];
  }, [products, shopFilter]);
  // Amazon/Uzum standarti: bitta VERTIKAL 2-ustunli katalog-grid (gorizontal scroll faqat kichik
  // "tavsiya" qatorlarida) — 100+ mahsulotli kategoriya endi cheksiz eniga tasmaga aylanmaydi.
  const catalog = useMemo(() => {
    // AUDIT: do'kon ochilganda global 100-limit vitrinani kesardi — endi shu do'kon uchun
    // alohida to'liq ro'yxat yuklanadi (`shopCatalog`), kelmaguncha global ro'yxatdan filtrlanadi.
    let list = shopFilter && shopCatalog ? shopCatalog : (products ?? []);
    if (favOnly) list = list.filter((p) => p.isFav); // 🧡 V2b: sevimlilar-filtr
    if (shopFilter) list = list.filter((p) => p.shopId === shopFilter.id); // 🏬 do'kon-sahifa rejimi
    return cat ? list.filter((p) => p.category === cat) : list;
  }, [products, shopCatalog, cat, shopFilter, favOnly]);
  const searched = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return null;
    // bazar: server-natija ustuvor (tavsif-qidiruv + demand-capture); kelguncha client-filtr
    if (bazar && srv && srv.q.toLowerCase() === t) return srv.products;
    // 🏷 Katalog: brend ham (server-natija kelguncha ishlaydigan client-filtr — server tarafda
    // brend+tavsif+barkod bo'yicha to'liq qidiruv bor, getMarketHome).
    return (products ?? []).filter((p) => p.name.toLowerCase().includes(t) || p.category.toLowerCase().includes(t) || (p.brand ?? "").toLowerCase().includes(t));
  }, [products, q, bazar, srv]);
  // AUDIT: qidiruvda mos DO'KONLAR (nom bo'yicha) — placeholder buni allaqachon va'da qilgan edi
  const searchedShops = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t || !shopv2) return [];
    return (market?.shops ?? []).filter((s) => s.name.toLowerCase().includes(t)).slice(0, 6);
  }, [q, market, shopv2]);
  const similar = useMemo(() => (sel ? (products ?? []).filter((p) => p.category === sel.category && p.id !== sel.id).slice(0, 6) : []), [products, sel]);
  // shopv2: "O'xshash do'konlar" — do'kon-profil ekranining pastida, tasdiqlangan dizaynda bor
  // (avvalgi implementatsiyada butunlay yo'q edi). Real market.shops'dan, joriy do'kondan boshqa.
  const similarStores = useMemo(() => (shopFilter ? (market?.shops ?? []).filter((s) => s.id !== shopFilter.id).slice(0, 6) : []), [market, shopFilter]);
  // shopv2: hikoya-ko'ruvchidagi "yuqoriga surish" kartasi — shu do'konning eng ko'p sotilgan
  // mahsuloti (mavjud `topSeller` maydonidan, yangi backend-maydon shart emas).
  const storyFeaturedProduct = useMemo(() => (storyViewer ? (products ?? []).find((p) => p.shopId === storyViewer.shopId && p.topSeller) ?? null : null), [storyViewer, products]);

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
    const text = `🛍 ${p.name} — ${formatNumber(p.priceTanga)} so'm${d > 0 ? ` (−${d}%)` : ""}`;
    shareLink(`${BOT_LINK}?start=shop_${p.id}`, text);
  };

  const submit = async () => {
    if (guest) { askLink(); return; }
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
  // ⏱ §10.3 JONLI ETA. Sanoq faqat kerak bo'lganda ishlaydi: buyurtmalar varag'i ochiq VA hech
  // bo'lmasa bitta buyurtmada sotuvchining haqiqiy va'dasi bor. Aks holda taymer umuman
  // yaratilmaydi (fon-ishi yo'q — batareya bejiz sarflanmasin).
  const [nowTick, setNowTick] = useState(() => Date.now());
  const hasLiveEta = (mktOrders ?? []).some((o) => !!o.etaSetAt && (o.status === "accepted" || o.status === "delivering"));
  useEffect(() => {
    if (!ordersOpen || !hasLiveEta) return;
    setNowTick(Date.now()); // ochilgan zahoti to'g'ri qiymat (birinchi tick'ni kutmasdan)
    const t = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, [ordersOpen, hasLiveEta]);
  /** Sotuvchi va'da bermagan bo'lsa — null (hech narsa ko'rsatilmaydi, taxmin qilinmaydi). */
  const etaLine = (o: MarketOrderView): string | null => {
    if (!o.etaSetAt || !o.etaMinutes) return null;
    if (o.status !== "accepted" && o.status !== "delivering") return null;
    const left = Math.round((new Date(o.etaSetAt).getTime() + o.etaMinutes * 60_000 - nowTick) / 60_000);
    if (left > 1) return `⏱ ≈ ${left} daqiqada yetkaziladi`;
    if (left >= 0) return "⏱ Yaqin daqiqalarda yetkaziladi";
    return `⏱ Va'da qilingan vaqtdan ${Math.abs(left)} daqiqa o'tdi`;
  };
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
  // 🔁 §10.3 (D2/S1/C1'dan keyingi eng yuqori-ustuvor qadam — tadqiqot: o'xshash ilovalarda
  // buyurtmalarning ~70% qayta-buyurtma). Savatni shu buyurtma bilan to'ldiradi — narx/stock
  // JONLI qayta-tekshiriladi (snapshot ko'r-ko'rona nusxalanmaydi); endi mavjud-bo'lmagan
  // mahsulotlar o'tkazib yuboriladi, foydalanuvchi checkout'da hammasini ko'rib tasdiqlaydi
  // (haqiqiy "1-bosishda blind-charge" emas — buyProduct/checkout baribir serverda qayta-hisoblaydi).
  const reorderMkt = (o: MarketOrderView) => {
    haptic();
    if (cartShopId !== null && cartShopId !== o.shopId && cartCount > 0) {
      if (!window.confirm("Savatda boshqa do'kon mahsuloti bor. Savat tozalanib, shu buyurtma qayta tiklansinmi?")) return;
    }
    const nextCart: Record<number, number> = {};
    let skipped = 0;
    for (const it of o.items) {
      const p = (products ?? []).find((pp) => pp.id === it.productId);
      if (!p || p.stock <= 0) { skipped++; continue; }
      nextCart[it.productId] = Math.min(it.qty, p.stock);
    }
    if (Object.keys(nextCart).length === 0) { alert("Afsuski, bu buyurtmadagi mahsulotlar endi mavjud emas."); return; }
    setCart(nextCart);
    setCartShopId(o.shopId);
    setOrdersOpen(false);
    setCartOpen(true);
    if (skipped > 0) setTimeout(() => alert(`${skipped} ta mahsulot endi mavjud emas — o'tkazib yuborildi.`), 250);
  };

  const deficit = sel ? Math.max(0, sel.priceTanga - me.coins) : 0;
  // how many friends to invite to cover the shortfall (spread > rides right now)
  const friendsNeeded = deficit > 0 && refInfo?.rewardReferrer ? Math.max(1, Math.ceil(deficit / refInfo.rewardReferrer)) : null;

  return (
    // 🌘 shopv2: dark-glass tema `.app.bjm` orqali App.tsx shell-klassidan keladi (tokens.css) —
    // shop-wrap'ga qo'shimcha klass shart emas.
    <div className="shop-wrap">
      <div className="shop-head">
        {/* shopv2: eski 2-qatorli sarlavha ("Bir..." bo'lib qisqarardi) o'rniga tasdiqlangan
            dizayndagi kabi ixcham top-strip — orqaga-tugma (do'kon-profilda) + kontekstli nom
            (bosh-sahifada "BirJoy", profilda do'kon-nomi — endi FAQAT shu yerda, pastdagi
            bj-sect/hero-name bilan takrorlanmaydi). */}
        {!shopv2 && (
          <div>
            <div className="shop-title">{bazar ? "🏪 BirJoy bozori" : "🛍 Do'kon"}</div>
            <div className="muted fs12">{bazar ? "Kosonda bor — BirJoy'da bor" : "Tangangizga real mahsulotlar · 1 kunda yetkazamiz"}</div>
          </div>
        )}
        {shopv2 && (
          <div className="shop-head-v2-title">
            {shopFilter && (
              <button className="shop-head-back" onClick={() => { haptic(); setShopFilter(null); }} aria-label="Bozorga qaytish">
                <Icon name="back" size={17} />
              </button>
            )}
            <span className="shop-head-v2-title-text">{shopFilter ? (shopProfile?.name ?? shopFilter.name) : "BirJoy"}</span>
          </div>
        )}
        {/* shopv2: ega talabi — "dizayn bilan 100% bir xil, ortiqcha hech nima bo'lmasin".
            Mockup'ning top-strip'ida AYNAN ikkita amal bor: bildirishnoma-qo'ng'iroq va savat
            (sonli belgi bilan). Ulashish/sevimlilar/buyurtmalar tugmalari mockup'da YO'Q —
            olib tashlandi. Buyurtmalar Profil tabidan ochilaveradi (profile.tsx:64), savat esa
            endi shu yerdagi ikonkadan (avvalgi yopishqoq savat-bar ham mockup'da yo'q edi). */}
        <div className="shop-head-actions">
          {!shopv2 && homeFlatCatalog && (
            <button className={"shop-share-btn" + (favOnly ? " on" : "")} onClick={() => { haptic(); setFavOnly((v) => !v); }} aria-label={favOnly ? "Sevimlilar filtri o'chirish" : "Faqat sevimlilar"}>
              <Icon name="heart" size={17} filled={favOnly} />
            </button>
          )}
          {<button className="shop-share-btn" onClick={shareShop} aria-label="Do'konni ulashish"><Icon name="share" size={18} /></button>}
          {!shopv2 && <button className="shop-orders-btn" onClick={openOrders}>📦 Buyurtmalarim</button>}
          {shopv2 && (
            <>
              {/* AUDIT TOPDI: bu tugma buyurtmalarni ochadi, lekin QO'NG'IROQ ikonkasi bilan
                  turardi (mockup'da qo'ng'iroq bezak, bosilmaydi). `icons.tsx`da `bag` ikonkasi
                  ALLAQACHON aynan shu tugma uchun yozilgan ekan — ishlatilmay qolgan. */}
              <button className="shop-head-icon" onClick={openOrders} aria-label="Buyurtmalarim">
                <Icon name="bag" size={15} />
              </button>
              {bazarcart && (
                <button className={"shop-head-icon" + (cartBump ? " bump" : "")} onClick={() => { haptic(); setCartOpen(true); }} aria-label="Savat">
                  <Icon name="cart" size={15} />
                  {cartCount > 0 && <span className="shop-head-icon-badge">{cartCount}</span>}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* shopv2: mockup'dagi "📍 Koson" shahar-qatori. Mockup'da bu statik matn, lekin bizda
          mahalla-tanlash HAQIQIY funksiya — shuning uchun ko'rinishi mockup bilan AYNAN bir xil
          qoladi (o'sha o'lcham/rang/joylashuv), faqat bosilganda mahalla-tanlagich ochiladi.
          Shu bilan alohida "mahalla-chip" (mockup'da yo'q) butunlay olib tashlandi. */}
      {/* AUDIT: "Koson" — shahar nomi, sozlama emas edi; mahallasi yo'q mijoz nima bosishini
          bilmasdi. Endi nomlangan CTA + karet, ya'ni bosiladigan boshqaruvga o'xshaydi. */}
      {shopv2 && bazar && !shopFilter && (
        <button className="shop-city-label" onClick={() => { haptic(); setMahallaPickerOpen(true); }} aria-label="Mahallani o'zgartirish">
          <Icon name="pin" size={12} /> {activeMahalla?.name ?? "Mahallani tanlang"}
          <span className="shop-city-label-caret">▾</span>
        </button>
      )}
      {/* shopv2: qidiruv FAQAT bosh-sahifada — mockup'ning do'kon-sahifasida qidiruv-qutisi yo'q */}
      {(!shopv2 || !shopFilter) && (
        <div className={"shop-search-wrap" + (shopv2 ? " v2" : "")}>
          {shopv2 && <Icon name="search" size={15} />}
          <input className="shop-search" placeholder={shopv2 ? "Do'kon yoki mahsulot qidiring…" : "🔍 Mahsulot qidirish…"} value={q} onChange={(e) => setQ(e.target.value)} />
          {q && <button className="shop-search-x" onClick={() => setQ("")}>✕</button>}
        </div>
      )}

      {err ? (
        <EmptyState icon="📡" text={loadErrorText()} action="🔄 Qayta urinish" onAction={load} />
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
      ) : favOnly && catalog.length === 0 ? (
        <EmptyState icon="🤍" text="Sevimlilar bo'sh — ❤ bosib mahsulot qo'shing!" action="Hammasini ko'rish" onAction={() => setFavOnly(false)} />
      ) : searched ? (
        /* AUDIT TOPDI: qidiruv "Do'kon yoki mahsulot qidiring" deb va'da berardi, lekin FAQAT
           mahsulot qidirardi. Mijoz ekranda turgan do'kon nomini yozsa — butun sahifa
           «topilmadi»ga almashardi. Endi mos do'konlar ham ko'rsatiladi. */
        searched.length === 0 && searchedShops.length === 0 ? (
          <EmptyState icon="🔍" text={`«${q}» topilmadi`} action="Tozalash" onAction={() => setQ("")} />
        ) : (
          <>
            {searchedShops.length > 0 && (
              <div className="shop-city-grid-wrap">
                <div className="shop-section-title2">Do&apos;konlar</div>
                <div className="shop-city-grid">
                  {searchedShops.map((s) => (
                    <button key={s.id} className="shop-city-tile" onClick={() => { haptic(); setQ(""); setShopFilter({ id: s.id, name: s.name }); setCat(null); }}>
                      <div className="shop-city-tile-cover">
                        {s.hasPhoto ? <img src={apiUrl(`/api/shop/shop-photo/${s.id}`)} alt="" loading="lazy" /> : <span className="shop-city-tile-initial">{s.name.trim().charAt(0).toUpperCase()}</span>}
                      </div>
                      <div className="shop-city-tile-body">
                        <div className="shop-city-tile-name">{s.name}</div>
                        <div className="shop-city-tile-status">
                          <span className={"bj-open-dot" + (s.open ? "" : " closed")} />
                          {s.open ? "Ochiq" : "Yopiq"}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {searched.length > 0 && (
              <div className="shop-grid">{searched.map((p) => <ProductCard key={p.id} p={p} onOpen={openProduct} onFav={toggleFav} wide />)}</div>
            )}
          </>
        )
      ) : (
        <>
          {/* ── featured hero carousel — legacy yagona-do'kon oqimi, bazar+shopv2'da (bosh HAM
              profil HAM) yashirilgan, do'kon-birinchi oqimga mos kelmaydi ── */}
          {showHeroStrip && featured.length > 0 && (
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

          {/* ── 🏪 D2: do'kon-profil (storefront) — hero/info-qator/e'lon/hikoya/reyting ──
              R4: back-control now renders UNCONDITIONALLY (loading/error/loaded alike) — the old
              version only put "←" inside the loaded hero, so a stuck loading-skeleton or an
              error state (e.g. shop went inactive, or the `bazar` kill-switch flipped off
              mid-session) had NO way back to the bazar list. */}
          {/* shopv2: orqaga-tugma+nom endi doim ko'rinadigan top-strip'da (.shop-head-v2-title,
              R4'ning "har doim ko'rinadigan orqaga yo'li" talabi shu yerda ham saqlanadi — shopv2
              bo'lsa bu blok butunlay ortiqcha, nom ikki marta chiqmasligi uchun olib tashlanadi. */}
          {bazar && shopFilter && !shopv2 && (
            <div className="bj-sect">
              <h3>{shopProfile?.name ?? shopFilter.name}</h3>
              <button className="bj-sect-all" onClick={() => { haptic(); setShopFilter(null); }}>← Bozorga qaytish</button>
            </div>
          )}
          {bazar && shopFilter && profileErr && (
            <EmptyState icon="📡" text="Do'kon-profil yuklanmadi — qayta urinib ko'ring" action="🔄 Qayta urinish" onAction={() => { setProfileErr(false); api.shopProfile(shopFilter.id).then((r) => { setShopProfile(r.profile); setShopProfileReviews(r.reviews); }).catch(() => setProfileErr(true)); }} />
          )}
          {bazar && shopFilter && !profileErr && !shopProfile && (
            <div className="bj-profile-loading">
              <Skeleton h={148} />
              <Skeleton h={16} w="60%" />
              <Skeleton h={40} />
            </div>
          )}
          {/* ── shopv2: do'kon-profil AYNAN mockup tartibida: qopqoq → (ustiga chiqqan) avatar →
              nom+reyting → info-qator → hikoya-tray → e'lon → about → sodiqlik → sharh → CTA ── */}
          {bazar && shopFilter && shopProfile && shopv2 && (
            <>
              <div className="shop-sp-cover">
                {shopProfile.hasPhoto
                  ? <img src={apiUrl(`/api/shop/shop-photo/${shopProfile.id}`)} alt="" />
                  : <span className="shop-sp-cover-initial" aria-hidden="true">{shopProfile.name.trim().charAt(0).toUpperCase()}</span>}
              </div>
              <div className="shop-sp-body">
                <div className="shop-sp-avatar" aria-hidden="true">{shopProfile.name.trim().slice(0, 2).toUpperCase()}</div>
                <div className="shop-sp-head">
                  <div className="shop-sp-name">{shopProfile.name}</div>
                  {shopProfile.reviewCount > 0 && (
                    <div className="shop-sp-rating">★ {shopProfile.avgRating} · {shopProfile.reviewCount} baho</div>
                  )}
                </div>
                <div className="shop-sp-info">
                  {shopProfile.neighborhood && <span><Icon name="pin" size={12} /> {shopProfile.neighborhood}</span>}
                  <span><span className={"bj-open-dot" + (shopProfile.open ? "" : " closed")} />{shopProfile.open ? "Ochiq" : "Yopiq"}</span>
                  {/* haqiqiy signal (soxta "tez javob beradi" o'rniga) — getShopOrdersToday */}
                  {shopProfile.ordersToday > 0 && <span>· Bugun {shopProfile.ordersToday} marta buyurtma qabul qilgan</span>}
                </div>
                {shopProfile.deliveryText && (
                  <div className="shop-sp-hours"><Icon name="clock" size={12} /> {shopProfile.deliveryText}</div>
                )}
                {/* mockup'da hikoya-tray AYNAN shu yerda (bosh-sahifada emas) */}
                {shopstory && storyTray && storyTray.some((t) => t.shopId === shopProfile.id) && (
                  <div className="shop-sp-stories">
                    {storyTray.filter((t) => t.shopId === shopProfile.id).map((t) => (
                      <button key={t.shopId} className="bj-story-item" onClick={() => openStoryViewer(t.shopId)}>
                        <span className={"bj-story-ring" + (t.seen ? " seen" : "")}>
                          {t.hasPhoto
                            ? <img className="bj-story-avatar-img" src={apiUrl(`/api/shop/shop-photo/${t.shopId}`)} alt="" />
                            : <span className="bj-story-avatar">{t.shopName.trim().charAt(0).toUpperCase()}</span>}
                        </span>
                        <span className="bj-story-name">Hikoya</span>
                      </button>
                    ))}
                  </div>
                )}
                {shopProfile.announcement && <div className="shop-sp-announce">{shopProfile.announcement}</div>}
                {shopProfile.story && (
                  <div className="shop-sp-about">
                    <b>Biz haqimizda.</b>{" "}
                    {aboutOpen || shopProfile.story.length <= 140 ? shopProfile.story : `${shopProfile.story.slice(0, 140)}…`}
                    {shopProfile.story.length > 140 && (
                      <> <button className="shop-sp-about-more" onClick={() => setAboutOpen((v) => !v)}>{aboutOpen ? "Kamroq" : "Ko'proq"}</button></>
                    )}
                  </div>
                )}
                {/* AUDIT: server har doim `{purchaseCount:0, milestone:5}` qaytaradi, ya'ni
                    YANGI bozorda HAR BIR birinchi tashrifda bo'sh "Sodiqlik dasturi 0/5"
                    chizig'i chiqardi — yangi mijozga bosim, ma'nosiz. Ega qarori ham shu edi
                    (2026-07-23): ko'rsatkich-only, mukofot NOMLANMAYDI. */}
                {loyalty && loyalty.purchaseCount > 0 && (
                  <div className="shop-sp-loyalty">
                    <div className="shop-sp-loyalty-row">
                      <span>Sodiqlik dasturi</span><span>{loyalty.purchaseCount}/{loyalty.milestone} xarid</span>
                    </div>
                    <div className="shop-sp-loyalty-bar">
                      <div style={{ width: `${Math.round((loyalty.purchaseCount / Math.max(1, loyalty.milestone)) * 100)}%` }} />
                    </div>
                  </div>
                )}
                {/* mockup `toggleReviews`: sharhlar ALOHIDA oynada emas, shu yerda ICHKI ochiladi
                    (▼/▲ akkordeon) — ega "review missing" deb aynan shuni ko'rsatdi. */}
                {shopProfileReviews && (
                  <>
                    <button className="shop-sp-reviews" onClick={() => { haptic(); setShopReviewsOpen((v) => !v); }}>
                      {/* AUDIT: bu yerda `reviews.length` (30 ta cap) turardi, sarlavhada esa
                          faqat BAHOLANGAN sharhlar soni — bitta ekranda ikki xil raqam. Endi
                          jami (kesilmagan) son ko'rsatiladi, sarlavha esa «baho» deb ataladi. */}
                      <span className="shop-sp-reviews-l"><Icon name="chat" size={15} /> Sharhlar {shopProfileReviews.totalCount ?? shopProfileReviews.reviews.length} ta</span>
                      <span className="shop-sp-reviews-c">{shopReviewsOpen ? "▲" : "▼"}</span>
                    </button>
                    {shopReviewsOpen && (
                      <div className="shop-sp-revlist">
                        {shopProfileReviews.reviews.length === 0 ? (
                          <div className="shop-sp-rev"><div className="shop-sp-rev-text">Hali sharh yo&apos;q</div></div>
                        ) : shopProfileReviews.reviews.map((r) => (
                          <div key={r.id} className="shop-sp-rev">
                            <div className="shop-sp-rev-top">
                              <span>{r.name}</span>
                              <span>{r.rating ? "★".repeat(r.rating) : r.thumb === "up" ? "👍" : "👎"}</span>
                            </div>
                            {r.text && <div className="shop-sp-rev-text">{r.text}</div>}
                            <div className="shop-sp-rev-days">{daysAgo(r.createdAt)}</div>
                          </div>
                        ))}
                        {/* Jim kesish yo'q: ro'yxat cheklangan bo'lsa buni ochiq aytamiz. */}
                        {(shopProfileReviews.totalCount ?? 0) > shopProfileReviews.reviews.length && (
                          <div className="shop-sp-rev-more">Oxirgi {shopProfileReviews.reviews.length} tasi ko&apos;rsatilgan</div>
                        )}
                      </div>
                    )}
                  </>
                )}
                {!!me.flags?.shopchat && (
                  <button className="shop-sp-cta" onClick={() => openChat(shopProfile.id, shopProfile.name)}>
                    <Icon name="chat" size={16} /> <span>Do&apos;konga yozish</span>
                  </button>
                )}
                {/* mockup: CTA'dan keyin kategoriya-chiplar, keyin mahsulot-panjara */}
                {shopCategories.length > 1 && (
                  <div className="shop-sp-chips">
                    <button className={"shop-kind-chip" + (cat === null ? " on" : "")} onClick={() => { haptic(); setCat(null); }}>Hammasi</button>
                    {shopCategories.map(([c]) => (
                      <button key={c} className={"shop-kind-chip" + (cat === c ? " on" : "")} onClick={() => { haptic(); setCat(c); }}>{c}</button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
          {bazar && shopFilter && shopProfile && !shopv2 && (
            <>
              <div className="bj-profile-hero">
                {shopProfile.hasPhoto ? (
                  <img src={apiUrl(`/api/shop/shop-photo/${shopProfile.id}`)} alt="" />
                ) : (
                  // Ega skrinshotda topdi: rasm-yo'q holat butunlay bo'sh/singan ko'rinardi — plan
                  // blueprintida aytilgan "katta bosh-harf" fallback hech qachon qurilmagan edi.
                  <div className="bj-profile-hero-monogram" aria-hidden="true">{shopProfile.name.trim().charAt(0).toUpperCase()}</div>
                )}
                {/* Ega skrinshotda topdi: sharh 0 ta bo'lsa "★ –(0)" singan-ko'rinishli edi — sharh
                    bo'lmasa reyting-belgi umuman ko'rsatilmaydi (bo'lmagan narsani ko'rsatishdan yaxshi). */}
                {shopProfile.reviewCount > 0 && (
                  <div className="bj-profile-rating">⭐ {shopProfile.avgRating} ({shopProfile.reviewCount})</div>
                )}
                <div className="bj-profile-hero-name">{shopProfile.name}</div>
              </div>
              <div className="bj-profile-info">
                {shopProfile.neighborhood && <span>🏘 {shopProfile.neighborhood}</span>}
                <span className={shopProfile.open ? "on" : ""}>{shopProfile.open ? "🟢 Ochiq" : "🔴 Yopiq"}</span>
                {/* haqiqiy signal (soxta "tez javob beradi" o'rniga) — getShopOrdersToday */}
                {shopProfile.ordersToday > 0 && <span>📦 Bugun {shopProfile.ordersToday} marta buyurtma qabul qilgan</span>}
                {shopProfile.deliveryText && <span>🚚 {shopProfile.deliveryText}</span>}
              </div>
              {shopProfile.announcement && <div className="bj-profile-announce">📣 {shopProfile.announcement}</div>}
              {shopProfile.story && (
                <div className="bj-profile-about">
                  <b>Biz haqimizda. </b>
                  {aboutOpen || shopProfile.story.length <= 140 ? shopProfile.story : `${shopProfile.story.slice(0, 140)}…`}
                  {shopProfile.story.length > 140 && (
                    <> <button onClick={() => setAboutOpen((v) => !v)}>{aboutOpen ? "Kamroq" : "Ko'proq"}</button></>
                  )}
                </div>
              )}
              {shopProfileReviews && (
                <button className="shop-reviews-entry bj-profile-reviews-entry" onClick={() => { haptic(); setShopReviewsOpen(true); }}>
                  <span>🗣 Sharhlar</span>
                  <span className="shop-reviews-agg">{shopProfileReviews.reviews.length > 0 ? `${shopProfileReviews.reviews.length} ta` : "Hali yo'q"}</span>
                  <span className="shop-reviews-chev">›</span>
                </button>
              )}
              {/* §10.2: sodiqlik-progress-bar — faqat kamida 1 xarid qilgan mijozga ko'rsatiladi */}
              {loyalty && loyalty.purchaseCount > 0 && (
                <div className="bj-loyalty">
                  <div className="bj-loyalty-label">🧡 {shopProfile.name}dan {loyalty.purchaseCount} marta xarid qildingiz</div>
                  <ProgressBar value={loyalty.purchaseCount} max={loyalty.milestone} />
                  <div className="muted fs12">Yana {loyalty.remaining} tadan keyin {loyalty.milestone}-xaridingiz bo&apos;ladi</div>
                </div>
              )}
              {shopCategories.length > 1 && (
                <div className="shop-cat-chips">
                  <button className={"shop-cat-chip" + (cat === null ? " on" : "")} onClick={() => { haptic(); setCat(null); }}>
                    Hammasi <span className="shop-cat-chip-n">{catalog.length}</span>
                  </button>
                  {shopCategories.map(([c, n]) => (
                    <button key={c} className={"shop-cat-chip" + (cat === c ? " on" : "")} onClick={() => { haptic(); setCat(c); }}>
                      {c} <span className="shop-cat-chip-n">{n}</span>
                    </button>
                  ))}
                </div>
              )}
              {/* ── 💬 C1: do'konga yozish — flag ON'dagina (D2 profil-ekranida CTA joyi bo'sh qoldirilgan edi) ── */}
              {!!me.flags?.shopchat && (
                <button className="bj-profile-chat-cta" onClick={() => openChat(shopProfile.id, shopProfile.name)}>
                  <Icon name="chat" size={16} /> Do&apos;konga yozish
                </button>
              )}
            </>
          )}
          {/* ── 📹 S1: do'kon-hikoya tray — Do'kon BOSH sahifasida, qidiruvdan keyin, do'konlardan
              oldin (Instagram/Uzum joylashuvi). Avval `!shopv2` bilan yopilgan edi: v2 dizaynida
              hikoyalar faqat do'kon-profilida qolgan, ya'ni mijoz ularni topolmasdi — hikoya
              ko'rilishi uchun avval do'konni ochish kerak bo'lardi (1 ta hikoya, 1 ta ko'rish).
              Ega qarori 2026-07-27: ikkala joyda ham bo'lsin — bosh sahifada KASHF qilinadi,
              profilda esa o'sha do'konnikini ko'rish uchun qoladi. ── */}
          {bazar && shopstory && !shopFilter && storyTray && storyTray.length > 0 && (
            <div className="bj-story-tray">
              {storyTray.map((s) => (
                <button key={s.shopId} className="bj-story-item" onClick={() => openStoryViewer(s.shopId)}>
                  <span className={"bj-story-ring" + (s.seen ? " seen" : "")}>
                    {s.hasPhoto ? (
                      <img className="bj-story-avatar-img" src={apiUrl(`/api/shop/shop-photo/${s.shopId}`)} alt="" />
                    ) : (
                      <span className="bj-story-avatar">🏬</span>
                    )}
                  </span>
                  <span className="bj-story-name">{s.shopName}</span>
                </button>
              ))}
            </div>
          )}
          {/* ── 🏠 V1.5: mahalla-chip. shopv2'da YO'Q — mockup'da alohida chip yo'q, mahalla-tanlash
              yuqoridagi "📍 Koson" qatoriga ko'chirildi (aynan mockup ko'rinishi). ── */}
          {bazar && !shopv2 && !shopFilter && mahallaList && (
            <button className="bj-mahalla-chip" onClick={() => { haptic(); setMahallaPickerOpen(true); }}>
              <Icon name="pin" size={14} /> {activeMahalla?.name ?? "Mahallani tanlang"} <span className="bj-mahalla-chip-caret">▾</span>
            </button>
          )}
          {bazar && !shopFilter && travelSuggest && (
            <div className="bj-travel-banner">
              <span>Hozir <b>{travelSuggest.name}</b> mahalladasiz — shu yerdagi do&apos;konlarni ko&apos;rsataymi?</span>
              <div className="bj-travel-actions">
                <button className="bj-travel-yes" onClick={acceptTravel}>Ha</button>
                <button className="bj-travel-no" onClick={dismissTravel}>Yo&apos;q</button>
              </div>
            </div>
          )}
          {/* ── 🏪 V1.4 BirJoy: kategoriya-KARUSEL (Uzum-referens) — pastdagi flat-katalogni filtrlaydi,
              shopv2 bazar-bosh'da flat-katalog o'zi yashirin bo'lgani uchun bu ham yashirin ── */}
          {bazar && !shopFilter && market && market.cats.length > 0 && (
            <BjCategoryCarousel
              cats={market.cats.map((c) => ({ slug: c.name, name: c.name, emoji: c.emoji, iconUrl: c.hasIcon ? apiUrl(`/api/shop/cat-icon/${c.id}`) : null }))}
              active={cat}
              onPick={(slug) => { haptic(); setCat(slug); }}
            />
          )}
          {/* AUDIT: bozor yuklanayotganda skelet, xato bo'lsa — tushuntirish + qayta urinish.
              Avval bu holatlarda ekran butunlay bo'sh qolardi (`PROD_CACHE` iliq bo'lgani uchun
              pastdagi mahsulot-skeleti ham chiqmasdi). */}
          {bazar && !shopFilter && shopv2 && !market && !marketErr && (
            <div className="shop-market-skel">
              <Skeleton h={20} w="55%" />
              <div className="shop-market-skel-row"><Skeleton h={100} w="148px" /><Skeleton h={100} w="148px" /></div>
              <Skeleton h={20} w="45%" />
              <div className="shop-market-skel-grid"><Skeleton h={140} /><Skeleton h={140} /></div>
            </div>
          )}
          {bazar && !shopFilter && shopv2 && marketErr && (
            <EmptyState
              icon="📡"
              text={loadErrorText()}
              action="🔄 Qayta urinish"
              onAction={() => { haptic(); loadMarket(); }}
            />
          )}
          {/* shopv2: tasdiqlangan dizayndagi "Barchasi / Mahallamga yetkazadi / Butun shahar"
              kind-filtri — bitta gorizontal-scroll qatorda "Hozir ochiq" bilan birga (mockup'da
              ham aynan shu tartibda). Legacy (shopv2 OFF)'da eski yagona "Hozir ochiq" chip qoladi. */}
          {bazar && !shopFilter && shopv2 && market && (mahallaShops.length > 0 || cityShops.length > 0 || openOnly) && (
            <div className="shop-kind-row">
              {([["all", "Barchasi"], ["mahalla", "Mahallamga yetkazadi"], ["bozor", "Butun shahar"]] as const).map(([key, label]) => (
                <button key={key} className={"shop-kind-chip" + (shopKindFilter === key ? " on" : "")} onClick={() => { haptic(); setShopKindFilter(key); }}>
                  {label}
                </button>
              ))}
              <button className={"shop-kind-chip icon" + (openOnly ? " on" : "")} onClick={() => { haptic(); setOpenOnly((v) => !v); }}>
                <Icon name="bolt" size={11} /> Hozir ochiq
              </button>
            </div>
          )}
          {/* §10.2: "hozir ochiq" tezkor-filtr — do'kon-rail ustida, kategoriya-karuseldan keyin */}
          {bazar && !shopFilter && !shopv2 && market && (mahallaShops.length > 0 || cityShops.length > 0 || openOnly) && (
            <button className={"shop-open-filter-chip" + (openOnly ? " on" : "")} onClick={() => { haptic(); setOpenOnly((v) => !v); }}>
              🟢 Hozir ochiq
            </button>
          )}
          {/* shopv2: tasdiqlangan dizaynda mahalla-bo'lim = GORIZONTAL 148px kartalar (rasm-qopqoq
              +katta bosh-harf+"Mahallangiz" belgisi), sarlavha emoji-siz "Mahallamga yetkazadi".
              Mening avvalgi implementatsiyam legacy V1.5 VERTIKAL to'liq-kenglikdagi "qo'shni"
              kartani ishlatardi — bu mockup bilan eng katta joylashuv-farqi edi. */}
          {bazar && !shopFilter && shopv2 && showMahallaKind && market && activeMahallaId !== null && mahallaShops.length > 0 && (
            <div className="shop-mah-wrap">
              <div className="shop-section-title2">Mahallamga yetkazadi</div>
              <div className="shop-mah-row">
                {mahallaShops.map((s) => (
                  <button key={s.id} className="shop-mah-card" onClick={() => { haptic(); setShopFilter({ id: s.id, name: s.name }); setCat(null); }}>
                    <div className="shop-mah-cover">
                      {s.hasPhoto ? <img src={apiUrl(`/api/shop/shop-photo/${s.id}`)} alt="" loading="lazy" /> : <span className="shop-mah-initial">{s.name.trim().charAt(0).toUpperCase()}</span>}
                      <span className="shop-mah-badge">Mahallangiz</span>
                    </div>
                    <div className="shop-mah-name">{s.name}</div>
                    <div className="shop-mah-meta">
                      <span className={"bj-open-dot" + (s.open ? "" : " closed")} />
                      <span>{s.open ? "Ochiq" : "Yopiq"}</span>
                      {s.rating > 0 && <span className="shop-mah-rating">· ★{s.rating.toFixed(1)}</span>}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* 🏠 V1.5 (legacy, shopv2 OFF): kattaroq "qo'shni" karta + hikoya-parcha + haqiqiy
              ijtimoiy-signal (ega: "oddiy online do'kondan farq qilmayapti" fikriga javob) */}
          {bazar && !shopFilter && !shopv2 && showMahallaKind && market && activeMahallaId !== null && mahallaShops.length > 0 && (
            <BjSection title="🏠 Mahalla do'konlari">
              <div className="bj-mshops">
                {mahallaShops.map((s) => (
                  <BjMahallaShopCard key={s.id} name={s.name} open={s.open} promise={s.deliveryText} rating={s.rating} photoUrl={s.hasPhoto ? apiUrl(`/api/shop/shop-photo/${s.id}`) : null} story={s.story} weeklyOrders={s.weeklyOrders} onOpen={() => { haptic(); setShopFilter({ id: s.id, name: s.name }); setCat(null); }} />
                ))}
              </div>
            </BjSection>
          )}
          {/* shopv2: mockup'da bo'sh mahalla-bo'limi UMUMAN ko'rsatilmaydi (showMahallaSection =
              mahallaStores.length > 0). Ega skrinshotda ko'rsatdi: katta "birinchi bo'ling!" bloki
              butun ekranni egallab, haqiqiy do'konlarni pastga surib yuborardi. Endi u FAQAT
              foydalanuvchi ataylab "Mahallamga yetkazadi" filtrini tanlaganda chiqadi — aks holda
              ekran bo'sh qolardi (R4 topgan bug). "Barchasi"/"Butun shahar"da — yashirin. */}
          {bazar && !shopFilter && market && activeMahallaId !== null && mahallaShops.length === 0
            && (shopv2 ? shopKindFilter === "mahalla" : showMahallaKind) && (
            <div className="bj-mahalla-cta">
              <div className="bj-mahalla-cta-icon">🔔</div>
              <div className="bj-mahalla-cta-text">{activeMahalla?.name ?? "Bu mahalla"}da hali do&apos;kon yo&apos;q — birinchi bo&apos;ling!</div>
              <button
                className="bj-mahalla-cta-btn"
                onClick={() => {
                  haptic();
                  shareLink(BOT_LINK, `🏠 ${activeMahalla?.name ?? "Mahallangiz"}da BirJoy do'kon oching — mahallangizga tez yetkazing! Botga o'ting, /sotuvchi deb yozing.`);
                }}
              >
                📣 Sotuvchi taklif qiling
              </button>
            </div>
          )}
          {/* R4 topdi (live bug): "Mahallamga yetkazadi" filtri tanlangan, lekin foydalanuvchining
              uy-mahallasi HALI tanlanmagan bo'lsa (activeMahallaId===null — masalan Telegram
              joylashuv-ruxsati berilmagan/yo'q) — yuqoridagi ikkala blok ham `activeMahallaId !==
              null` bilan gated, demak HECH NARSA ko'rsatmasdi: bo'sh, tushuntirishsiz ekran. */}
          {bazar && !shopFilter && shopv2 && shopKindFilter === "mahalla" && activeMahallaId === null && (
            <div className="bj-mahalla-cta">
              <div className="bj-mahalla-cta-icon">📍</div>
              <div className="bj-mahalla-cta-text">Mahallangizni tanlang — shunda yaqin do&apos;konlarni ko&apos;rsatamiz.</div>
              <button className="bj-mahalla-cta-btn" onClick={() => { haptic(); setMahallaPickerOpen(true); }}>
                📍 Mahallani tanlash
              </button>
            </div>
          )}
          {/* shopv2: tasdiqlangan dizaynda "Butun shahar" 2-ustunli GRID (rasm-qopqoq+katta bosh-
              harf+reyting+holat-nuqta) — gorizontal-scroll AVATAR-karta (legacy BjShopCard) emas. */}
          {/* AUDIT TOPDI: `> 1` sharti — agar shaharda FAQAT BITTA do'kon qolsa (yoki "Hozir
              ochiq" filtri bittasini qoldirsa) bo'lim butunlay yo'qolib, ekran bo'sh qolardi.
              shopv2'da `> 0` (legacy `> 1`da qoladi — u yerda pastda flat-katalog ham bor). */}
          {bazar && !shopFilter && shopv2 && showBozorKind && market && cityShops.length > 0 && (
            <div className="shop-city-grid-wrap">
              <div className="shop-section-title2">Butun shahar bo'ylab</div>
              <div className="shop-city-grid">
                {cityShops.map((s) => (
                  <button key={s.id} className="shop-city-tile" onClick={() => { haptic(); setShopFilter({ id: s.id, name: s.name }); setCat(null); }}>
                    <div className="shop-city-tile-cover">
                      {s.hasPhoto ? <img src={apiUrl(`/api/shop/shop-photo/${s.id}`)} alt="" loading="lazy" /> : <span className="shop-city-tile-initial">{s.name.trim().charAt(0).toUpperCase()}</span>}
                    </div>
                    <div className="shop-city-tile-body">
                      <div className="shop-city-tile-name">{s.name}</div>
                      {s.rating > 0 && <div className="shop-city-tile-rating">★ {s.rating.toFixed(1)}</div>}
                      <div className="shop-city-tile-status">
                        <span className={"bj-open-dot" + (s.open ? "" : " closed")} />
                        {s.open ? "Ochiq" : "Yopiq"}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* AUDIT TOPDI: kechqurun "🟢 Hozir ochiq" filtri BARCHA do'konni chiqarib tashlaydi
              (hammasi yopiq) — ekran butunlay bo'sh qolardi, tushuntirishsiz. */}
          {bazar && !shopFilter && shopv2 && market && cityShops.length === 0 && mahallaShops.length === 0 && openOnly && (
            <EmptyState
              icon="🌙"
              text="Hozir hamma do'kon yopiq — ertalab qayta kiring"
              action="Hammasini ko'rsatish"
              onAction={() => { haptic(); setOpenOnly(false); }}
            />
          )}
          {/* 🏪 butun-shahar do'konlar — hozirgi (mahalla-oldi) ro'yxat, o'zgarishsiz (shopv2 OFF) */}
          {bazar && !shopFilter && !shopv2 && market && cityShops.length > 1 && (
            <BjSection title="🏪 Butun shahar">
              <div className="bj-shops">
                {cityShops.map((s) => (
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

          {/* ── katalog: VERTIKAL grid — shopv2'da tasdiqlangan dizayndagi 3-ustunli "Instagram-
              uslub" StoreTile (bu blok shopv2'da FAQAT do'kon-profil ichida ko'rinadi, chunki
              homeFlatCatalog shopv2-bosh'da yashirin — shuning uchun bu doim "shu do'konning
              mahsulotlari" konteksti). Legacy — eski 2-ustunli ProductCard grid, o'zgarishsiz.
              R4 topdi: `&& bazar` shart — `bazar` OFF bo'lib `shopv2` ON qolgan holatda (mustaqil
              kill-switch'lar) StoreTile FILTRLANMAGAN butun-katalogni "bitta do'kon" ko'rinishida
              ko'rsatib qo'yardi; bazar OFF'da har doim legacy ProductCard-grid ishlatiladi. ── */}
          {/* AUDIT TOPDI: jonli bazada 6 faol do'kondan 3 tasida MAHSULOT YO'Q, va hammasi
              bosiladi — mijoz do'konni ochsa, panjara joyida shunchaki bo'shliq qolardi
              (hech qanday matn yo'q → "ilova buzuq" degan taassurot). */}
          {homeFlatCatalog && shopv2 && bazar && (
            catalog.length === 0 ? (
              <EmptyState
                icon="📦"
                text={cat ? `«${cat}» bo'yicha mahsulot yo'q` : "Bu do'konda hozircha mahsulot yo'q"}
                action={cat ? "Hammasini ko'rish" : undefined}
                onAction={cat ? () => { haptic(); setCat(null); } : undefined}
              />
            ) : (
              <div className="shop-tile-grid">
                {catalog.map((p) => <StoreTile key={p.id} p={p} onOpen={openProduct} onFav={toggleFav} />)}
              </div>
            )
          )}
          {homeFlatCatalog && (!shopv2 || !bazar) && (
            <>
              <div className="shop-section-head">
                <span className="shop-section-title">{cat ?? "Hammasi"}</span>
                <span className="muted fs12">{catalog.length} ta</span>
              </div>
              <div className="shop-grid">
                {catalog.map((p) => <ProductCard key={p.id} p={p} onOpen={openProduct} onFav={toggleFav} wide />)}
              </div>
            </>
          )}

          {/* EGA QAROLI (AskUserQuestion: "Ikkalasi: do'kon-qatori + mahsulot-panjarasi"):
              bosh-sahifada do'konlardan KEYIN barcha do'konlarning mahsulotlari ham ko'rsatiladi.
              Mockup faqat do'konlarni chizgan edi — ega ikkala oqim ham ochiq bo'lishini tanladi
              ("nima olishni biladigan" mijoz do'kon tanlamasdan to'g'ridan-to'g'ri topa olsin). */}
          {/* Kategoriya tanlansa panjara SHU kategoriyaga qisqaradi - avval `products` (filtrsiz xom
              ro'yxat) ishlatilgani uchun karusel bosilsa ham hech narsa o'zgarmasdi. `catalog` esa
              cat/fav/do'kon filtrlarini hisobga oladi. */}
          {/* Bo'sh kategoriya: ro'yxat `catalog.length > 0` bilan gated bo'lgani uchun tanlov
              natijasi NOL bo'lsa ekran jimgina bo'shab qolardi - mijoz nima bo'lganini bilmaydi.
              Endi aniq aytiladi va bitta bosishda filtr tozalanadi. */}
          {shopv2 && bazar && !shopFilter && !searched && cat && catalog.length === 0 && (
            <div className="shop-home-products">
              <div className="shop-section-title2">{cat}</div>
              <EmptyState icon="📦" text={`«${cat}» bo'yicha hozircha mahsulot yo'q`} action="Barcha mahsulotlar" onAction={() => { haptic(); setCat(null); }} />
            </div>
          )}
          {shopv2 && bazar && !shopFilter && !searched && catalog.length > 0 && (
            <div className="shop-home-products">
              <div className="shop-section-title2">{cat ?? "Mahsulotlar"}</div>
              <div className="shop-tile-grid home">
                {catalog.slice(0, 24).map((p) => (
                  <StoreTile key={p.id} p={p} onOpen={openProduct} onFav={toggleFav} />
                ))}
              </div>
            </div>
          )}

          {/* shopv2: "O'xshash do'konlar" — do'kon-profil sahifasining oxiri, tasdiqlangan
              dizaynda bor edi, avvalgi implementatsiyada butunlay qurilmagan. */}
          {shopv2 && shopFilter && similarStores.length > 0 && (
            <div className="shop-similar-stores">
              <div className="shop-section-title2">O&apos;xshash do&apos;konlar</div>
              <div className="shop-similar-stores-row">
                {similarStores.map((s) => (
                  <button key={s.id} className="shop-similar-store" onClick={() => { haptic(); setShopFilter({ id: s.id, name: s.name }); setCat(null); }}>
                    <div className="shop-similar-store-av">
                      {s.hasPhoto ? <img src={apiUrl(`/api/shop/shop-photo/${s.id}`)} alt="" loading="lazy" /> : s.name.trim().charAt(0).toUpperCase()}
                    </div>
                    <span className="shop-similar-store-name">{s.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── sotuvchi bo'lish CTA — do'kon egalarini jalb qilish. shopv2'da YO'Q (mockup'da
          bunday blok yo'q; ega "ortiqcha hech nima bo'lmasin" dedi). ── */}
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
              {/* shopv2: mockup'da mahsulot-ekranida FAQAT yurak-tugma bor (ulashish yo'q) */}
              <button className="shop-share-btn sm" onClick={() => toggleFav(sel)} aria-label={sel.isFav ? "Sevimlidan olish" : "Sevimliga qo'shish"}>
                <Icon name="heart" size={15} filled={sel.isFav} />
              </button>
              {<button className="shop-share-btn sm" onClick={() => shareProduct(sel)} aria-label="Ulashish"><Icon name="share" size={15} /></button>}
            </div>
            {/* mockup: nom ostida "{birlik} · {do'kon nomi}" 12px xira qatori */}
            {shopv2 && sel.shopName && <div className="shop-detail-sub">{sel.shopName}</div>}
            {sel.description && <p className="muted fs13">{sel.description}</p>}
            <PriceBlock p={sel} big />
            {sel.stock <= SHOP_LOW_STOCK && <div className="shop-low-line">⚡ Kam qoldi: {sel.stock} dona</div>}
            {/* AUDIT TOPDI: bu yerda BirJoy O'Z NOMIDAN "1 kun ichida yetkazamiz" deb va'da
                berardi — har bir uchinchi-tomon mahsulotiga, kafolatsiz. Yetkazishni SOTUVCHI
                qiladi; har mahsulotda sotuvchining o'z va'dasi (`deliveryText`) bor. Endi
                sotuvchining o'z so'zi ko'rsatiladi, bo'lmasa — hech narsa va'da qilinmaydi. */}
            <div className="shop-deliver-line">
              {sel.deliveryText
                ? <>🚚 <b>{sel.deliveryText}</b> · do&apos;kon egasi qo&apos;ng&apos;iroq qiladi</>
                : <>🚚 Yetkazish vaqtini do&apos;kon egasi qo&apos;ng&apos;iroq qilib aytadi</>}
            </div>
            <ProductSpecs p={sel} />
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
                    <Button variant="brand" onClick={() => addToCart(sel, 1)}>🧺 Savatga qo'shish — {formatNumber(sel.priceTanga)} so'm</Button>
                  )
                )}
                <Button variant={bazarcart ? "ghost" : "brand"} onClick={() => { haptic(); setPayMode("tanga"); setStep("confirm"); }}>🪙 {bazarcart ? "Bittasini darhol olish" : `Tanga bilan olish — ${formatNumber(sel.priceTanga)} so'm`}</Button>
                <Button variant="ghost" onClick={() => { haptic(); setPayMode("cash"); setStep("confirm"); }}>💵 Naqdga buyurtma — {formatNumber(sel.priceTanga)} so'm</Button>
              </>
            )}
            {similar.length > 0 && (
              <div className="shop-section mt10">
                <div className="shop-section-head"><span className="shop-section-title">O'xshash mahsulotlar</span></div>
                {/* Ega: "o'xshash mahsulotlar bosa o'tib ketmayapti" — asl sabab: openProduct
                    `sel`ni almashtiradi, lekin Sheet O'ZI qayta ochilmaydi (bir xil DOM, faqat
                    kontent yangilanadi) — sheet scroll-pozitsiyasi ESKI joyida qoladi. "O'xshash
                    mahsulotlar" har doim pastda bo'lgani uchun (foydalanuvchi pastga skroll qilgan
                    holda bosadi) — yangi mahsulot YUKLANADI, lekin foydalanuvchi hamon pastda
                    turgani uchun HECH NARSA O'ZGARMAGANDEK ko'rinardi. Endi bosilganda sheet
                    avtomatik tepaga qaytadi. */}
                <div className="shop-row-strip">
                  {similar.map((p) => (
                    <button key={p.id} className="shop-mini" onClick={(e) => { openProduct(p); e.currentTarget.closest(".d-sheet")?.scrollTo({ top: 0, behavior: "instant" }); }}>
                      {p.hasPhoto ? <img className="shop-mini-img" src={apiUrl(`/api/shop/photo/${p.id}?s=1`)} loading="lazy" decoding="async" alt="" /> : <div className="shop-mini-img shop-card-noimg">🛍</div>}
                      <div className="shop-mini-name">{p.name}</div>
                      <div className="shop-mini-price">{formatNumber(p.priceTanga)} so'm</div>
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
                  {(reviews.avgRating ?? 0) > 0 && <span className="fs13">⭐ {reviews.avgRating!.toFixed(1)}</span>}
                  <span className="muted fs12">{reviews.reviews.length} sharh</span>
                </div>

                {/* write / edit my review */}
                <div className="shop-rev-form">
                  {/* AUDIT TOPDI: yulduzlar BIRINCHI turardi va "baho" bo'lib o'qilardi, lekin
                      yuborish FAQAT 👍/👎 ga bog'liq. Mijoz 5 yulduz qo'yib, izoh yozib, rasm
                      biriktirib — tugmani o'lik holda ko'rardi va SABABINI hech qayerdan bilmasdi
                      (revErr faqat submitReview ICHIDA o'rnatiladi, u esa umuman ishga tushmaydi).
                      Yechim: majburiy nazorat birinchi, ikkalasi ham nomlangan, va sabab yozilgan.
                      Yulduzdan thumb'ni AVTOMATIK chiqarmaymiz — u do'kon ustiga jimgina ommaviy
                      👎 qo'yib yuborishi mumkin edi. */}
                  <div className="shop-rev-qlabel">Mahsulot yoqdimi?</div>
                  <div className="shop-rev-thumbs">
                    <button className={"shop-rev-thumb" + (revThumb === "up" ? " on up" : "")} onClick={() => { haptic(); setRevThumb("up"); }}>👍 Yoqdi</button>
                    <button className={"shop-rev-thumb" + (revThumb === "down" ? " on down" : "")} onClick={() => { haptic(); setRevThumb("down"); }}>👎 Yoqmadi</button>
                  </div>
                  <div className="shop-rev-qlabel">Baho (ixtiyoriy)</div>
                  <div className="shop-rev-stars" role="radiogroup" aria-label="Baho">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} className={"shop-rev-star" + (n <= revRating ? " on" : "")} onClick={() => { haptic(); setRevRating(n === revRating ? 0 : n); }} aria-label={`${n} yulduz`}>★</button>
                    ))}
                  </div>
                  {me.flags?.revtanga && <div className="fs12 shop-rev-tanga-hint">🗣 Sharh (≥30 belgi) uchun tanga oling!</div>}
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
                  {!revThumb && <div className="fs12 muted shop-rev-why">Yuborish uchun avval 👍 «Yoqdi» yoki 👎 «Yoqmadi» ni tanlang</div>}
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
                        {!!r.rating && <span className="fs12">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>}
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
              Jami: {payMode === "cash" ? `💵 ${formatNumber(sel.priceTanga)} so'm` : `🪙 ${formatNumber(sel.priceTanga)} so'm`}
            </div>
            {payMode === "cash" && <div className="shop-deliver-line">💵 Naqd — <b>yetkazganda to'laysiz</b>, hozir hech narsa olinmaydi</div>}
            {buyErr && <div className="sheet-err">{buyErr}</div>}
            <Button variant="brand" disabled={busy || address.trim().length < 5} onClick={submit}>
              {busy ? "Yuborilmoqda…" : payMode === "cash" ? `Tasdiqlash — 💵 ${formatNumber(sel.priceTanga)} so'm` : `Tasdiqlash — 🪙 ${formatNumber(sel.priceTanga)} so'm`}
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

      {/* ── 📹 S1: do'kon-hikoya to'liq-ekran ko'ruvchi ── */}
      {storyViewer && (
        <StoryViewer
          stories={storyViewer.stories}
          idx={storyViewer.idx}
          onAdvance={advanceStory}
          onClose={() => { setStoryTray((tray) => tray?.map((t) => (t.shopId === storyViewer.shopId ? { ...t, seen: true } : t)) ?? tray); setStoryViewer(null); }}
          featuredProduct={shopv2 ? storyFeaturedProduct : null}
          onGoToProduct={() => { if (!storyFeaturedProduct) return; setStoryTray((tray) => tray?.map((t) => (t.shopId === storyViewer.shopId ? { ...t, seen: true } : t)) ?? tray); setStoryViewer(null); openProduct(storyFeaturedProduct); }}
        />
      )}
      {/* ── 🏪 D2: do'kon-darajali sharhlar (o'qish-uchun, submit-shakli yo'q — mahsulot-sharh alohida) ── */}
      <Sheet open={shopReviewsOpen} onClose={() => setShopReviewsOpen(false)}>
        <h3>🗣 {shopProfile?.name ?? "Do'kon"} — sharhlar</h3>
        {!shopProfileReviews || shopProfileReviews.reviews.length === 0 ? (
          <EmptyState icon="🗣" text="Hali sharh yo'q" />
        ) : (
          shopProfileReviews.reviews.map((r) => (
            <div key={r.id} className="shop-rev-row">
              <div className="shop-rev-head">
                <b>{r.thumb === "up" ? "👍" : "👎"} {r.name}</b>
                {!!r.rating && <span className="fs12">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>}
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
      </Sheet>

      {/* ── 💬 C1: mijoz↔do'kon chat (bot-relay) ── */}
      <Sheet open={!!chatShop} onClose={() => setChatShop(null)}>
        <h3>💬 {chatShop?.name ?? "Do'kon"}</h3>
        <div className="bj-chat-thread">
          {chatErr ? (
            <EmptyState icon="📡" text="Suhbat yuklanmadi — qayta urinib ko'ring" action="🔄 Qayta urinish" onAction={() => chatShop && openChat(chatShop.id, chatShop.name)} />
          ) : !chatMsgs ? (
            <Skeleton h={60} />
          ) : (
            <>
              <div className="bj-chat-privacy">Xabarlaringiz shu yerda saqlanadi — raqamingiz ko'rsatilmaydi.</div>
              {chatMsgs.map((m) => (
                <div key={m.id} className={"bj-chat-bubble" + (m.direction === "in" ? " mine" : "")}>{m.text}</div>
              ))}
              {chatMsgs.length === 0 && (
                <div className="bj-chat-quick">
                  {["Bu hali bormi?", "Yetkazish bormi?", "Narxi qancha?"].map((q) => (
                    <button key={q} className="bj-chat-chip" onClick={() => { haptic(); setChatText(q); }}>{q}</button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        {/* 🧺 §10.3: «chat-ichidan savatga» — sotuvchi «ha, bor» degan zahoti mijoz shu yerdayoq
            qo'shadi. Savat bitta-do'kon qoidasi o'zgarmaydi: addToCart o'sha yagona yo'l. */}
        {!!chatProducts?.length && (
          <div className="bj-chat-shelf" aria-label="Do'kon mahsulotlari">
            {chatProducts.slice(0, 12).map((p) => (
              <div key={p.id} className="bj-chat-item">
                {p.hasPhoto
                  ? <img className="bj-chat-item-img" src={apiUrl(`/api/shop/photo/${p.id}?s=1`)} loading="lazy" decoding="async" alt="" />
                  : <div className="bj-chat-item-img bj-chat-item-noimg">{p.name.slice(0, 1).toUpperCase()}</div>}
                <div className="bj-chat-item-name">{p.name}</div>
                <div className="bj-chat-item-price">{formatNumber(p.priceTanga)} so'm</div>
                <button
                  className="bj-chat-item-add"
                  aria-label={`${p.name} — savatga qo'shish`}
                  onClick={() => { addToCart(p); onBanner(`🧺 «${p.name}» savatga qo'shildi`); }}
                >
                  {cart[p.id] ? `${cart[p.id]} ta ✓` : "+ Savatga"}
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="bj-chat-input-row">
          <input className="bj-chat-input" value={chatText} onChange={(e) => setChatText(e.target.value)} placeholder="Yozing…" maxLength={500} />
          <Button variant="brand" disabled={!chatText.trim() || chatSending} onClick={() => sendChat(chatText)}>Yuborish</Button>
        </div>
      </Sheet>

      {/* ── 🏠 V1.5: mahalla-tanlov bottom-sheet ── */}
      <Sheet open={mahallaPickerOpen} onClose={() => setMahallaPickerOpen(false)}>
        <h3>📍 Mahallangizni tanlang</h3>
        <button className="bj-mahalla-gps" onClick={detectMahalla} disabled={mahallaLocating}>
          {mahallaLocating ? "Aniqlanmoqda…" : "📍 GPS bilan aniqlash"}
        </button>
        <div className="shop-search-wrap mt10">
          <input className="shop-search" placeholder="🔍 Mahalla qidirish…" value={mahallaQuery} onChange={(e) => setMahallaQuery(e.target.value)} />
          {mahallaQuery && <button className="shop-search-x" onClick={() => setMahallaQuery("")}>✕</button>}
        </div>
        <div className="bj-mahalla-list">
          {(mahallaList ?? [])
            .filter((m) => m.name.toLowerCase().includes(mahallaQuery.toLowerCase()))
            .map((m) => (
              <button key={m.id} className={"bj-mahalla-item" + (m.id === activeMahallaId ? " on" : "")} onClick={() => pickMahalla(m.id)}>
                {m.name}{m.id === activeMahallaId && " ✓"}
              </button>
            ))}
        </div>
      </Sheet>

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
            <div className="muted fs12">#{o.id} · {o.payKind === "cash" ? `💵 ${formatNumber(o.total)} so'm (naqd)` : `🪙 ${formatNumber(o.total)} so'm`} · {new Date(o.createdAt).toLocaleDateString("uz-UZ")}</div>
            {etaLine(o) && (
              <div className={"shop-mkt-eta" + (etaLine(o)!.startsWith("⏱ Va'da") ? " late" : "")} aria-live="polite">{etaLine(o)}</div>
            )}
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
            <div className="shop-order-actions">
              {o.status === "pending" && (
                <Button variant="ghost" onClick={() => cancelMkt(o.id)}>✖ Bekor qilish</Button>
              )}
              {bazarcart && (o.status === "delivered" || o.status === "rejected" || o.status === "cancelled") && (
                <Button variant="ghost" onClick={() => reorderMkt(o)}>🔁 Yana buyurtma qil</Button>
              )}
              {/* ❓ §10.3: yordam — bekor qilingan buyurtmadan tashqari hamma holatda (kutilmoqda,
                  yetkazilmoqda, yetkazilgan — hammasida savol tug'ilishi mumkin). */}
              {!!me.flags?.shopchat && o.status !== "cancelled" && (
                <Button variant="ghost" onClick={() => openOrderHelp(o)}>❓ Yordam</Button>
              )}
            </div>
          </div>
        ))}
        {ordersErr ? (
          <EmptyState icon="📡" text={loadErrorText()} action="🔄 Qayta urinish" onAction={loadOrders} />
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
                #{o.id} · {o.payKind === "cash" ? `💵 ${formatNumber(o.priceTanga)} so'm (naqd)` : `🪙 ${formatNumber(o.priceTanga)} so'm`} · {new Date(o.createdAt).toLocaleDateString("uz-UZ")}
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
      {/* shopv2'da yopishqoq savat-bar YO'Q — mockup'da savat top-strip ikonkasi+son-belgisi orqali. */}
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
          ) : /* AUDIT TOPDI: `cartLines` — savat-id'larini XOTIRADAGI `products` bilan bog'laydi.
                 Sovuq ishga tushishda (yoki sekin tarmoqda) `products` hali `null` — savat-belgisi
                 10 deb tursa ham sheet "Savat bo'sh" derdi. Bo'shlik uchun HAQIQAT — `cartCount`
                 (localStorage'dan), `cartLines` esa faqat chizish manbai. */
          cartCount > 0 && products === null && !err ? (
            <>
              <h3>🧺 Savat</h3>
              <Skeleton h={60} />
              <div className="muted fs13 mt10">Savat yuklanmoqda…</div>
            </>
          ) : cartCount > 0 && err ? (
            <>
              <h3>🧺 Savat</h3>
              <EmptyState icon="📡" text={loadErrorText()} action="🔄 Qayta urinish" onAction={load} />
            </>
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

/** 📹 S1: do'kon-hikoya to'liq-ekran ko'ruvchi (Instagram/Snapchat-uslub) — tepada progress-
 *  segmentlar, video tugagach/foto ~5s'dan keyin avto-keyingisiga, chap/o'ng bosish orqaga/oldinga,
 *  ✕ yopadi. `key={cur.id}` — hikoya almashganda video/img elementi TO'LIQ qayta-yaratiladi (eski
 *  video'ning `onEnded`si keyingi hikoyaga o'tib ketmasin — stale-closure xavfini yo'q qiladi). */
function StoryViewer({ stories, idx, onAdvance, onClose, featuredProduct, onGoToProduct }: { stories: ShopStoryPost[]; idx: number; onAdvance: (dir: 1 | -1) => void; onClose: () => void; featuredProduct?: ShopProductView | null; onGoToProduct?: () => void }) {
  const cur = stories[idx]!;
  // shopv2: "yuqoriga surish" bilan ochiladigan "ko'p sotiladigan mahsulot" kartasi (tasdiqlangan
  // dizaynda bor edi, avvalgi implementatsiyada butunlay yo'q edi). Haqiqiy swipe-gesture o'rniga
  // (Sheet'dagi kabi murakkab touch-tracking qo'shish xavfi/foyda nisbati past) — bosib ochiladigan
  // pastki-taklif, xuddi shu VIZUAL natija bilan (real `topSeller` mahsulotdan, yangi backend shart
  // emas). Har yangi hikoyada qayta yopiladi.
  const [revealed, setRevealed] = useState(false);
  useEffect(() => { setRevealed(false); }, [cur.id]);
  useEffect(() => {
    if (cur.videoFileId) return; // video — o'zining onEnded'i bor
    const t = setTimeout(() => onAdvance(1), 5000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur.id]);
  return (
    <div className="bj-story-viewer">
      <div className="bj-story-progress">
        {stories.map((s, i) => (
          <span key={s.id} className={"bj-story-seg" + (i < idx ? " done" : i === idx ? " active" : "")} />
        ))}
      </div>
      <div className="bj-story-head">
        <span className="bj-story-avatar sm">🏬</span>
        <span className="bj-story-headname">{cur.shopName}</span>
        <button className="bj-story-close" onClick={() => { haptic(); onClose(); }} aria-label="Yopish">✕</button>
      </div>
      {cur.videoFileId ? (
        <video key={cur.id} className="bj-story-media" src={apiUrl(`/api/shop/story-media/${cur.id}`)} autoPlay playsInline onEnded={() => onAdvance(1)} />
      ) : cur.photoFileId ? (
        <img key={cur.id} className="bj-story-media" src={apiUrl(`/api/shop/story-media/${cur.id}`)} alt="" />
      ) : null}
      {cur.caption && <div className="bj-story-caption">{cur.caption}</div>}
      <button className="bj-story-tap left" aria-label="Oldingi" onClick={() => { haptic(); onAdvance(-1); }} />
      <button className="bj-story-tap right" aria-label="Keyingi" onClick={() => { haptic(); onAdvance(1); }} />
      {featuredProduct && !revealed && (
        <button className="bj-story-hint" onClick={(e) => { e.stopPropagation(); haptic(); setRevealed(true); }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M5 15l7-7 7 7" /></svg>
          <span>Ko&apos;p sotiladigan mahsulot</span>
        </button>
      )}
      {featuredProduct && revealed && (
        <div className="bj-story-product" onClick={(e) => e.stopPropagation()}>
          {featuredProduct.hasPhoto ? (
            <img className="bj-story-product-img" src={apiUrl(`/api/shop/photo/${featuredProduct.id}?s=1`)} alt="" />
          ) : (
            <span className="bj-story-product-img bj-story-product-ph">{featuredProduct.name.trim().charAt(0).toUpperCase()}</span>
          )}
          <div className="bj-story-product-body">
            <div className="bj-story-product-tag">Ko&apos;p sotiladi</div>
            <div className="bj-story-product-name">{featuredProduct.name}</div>
            <div className="bj-story-product-price">{formatNumber(featuredProduct.priceTanga)} so&apos;m</div>
          </div>
          <button className="bj-story-product-cta" onClick={() => { haptic(); onGoToProduct?.(); }}>Xarid qilish</button>
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
          <b className="shop-cart-sum">{formatNumber(l.qty * l.p.priceTanga)} so&apos;m</b>
        </div>
      ))}
      <div className="shop-cart-totals glass pad">
        <div className="shop-cart-trow"><span>Mahsulotlar</span><b>{formatNumber(itemsTotal)} so&apos;m</b></div>
        {/* AUDIT TOPDI: `deliveryFee > 0` sharti — jonli bazadagi BARCHA do'konda `deliveryFeeSom=0`,
            demak yetkazish qatori HECH QACHON ko'rinmasdi va mijoz jami nimadan iboratligini
            bilmasdi. 0 = "bepul" EMAS, "hisobga olinmagan" (sotuvchi telefonda kelishadi). */}
        <div className="shop-cart-trow">
          <span>🚚 Yetkazish</span>
          <b>{deliveryFee > 0 ? formatNumber(deliveryFee) : "Sotuvchi bilan kelishiladi"}</b>
        </div>
        <div className="shop-cart-trow shop-cart-grand"><span>Jami</span><b>{formatNumber(total)} so'm</b></div>
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
        {busy ? "Yuborilmoqda…" : `Buyurtma berish — ${formatNumber(total)} so'm`}
      </Button>
    </div>
  );
}
