// 🏪 BirJoy komponent-kit (D1, flag `bazar`) — BAZAR_PLAN §2. Barcha ranglar/o'lchamlar FAQAT
// tokens.css'dagi --bj-* dan (inline-stil TAQIQ, dinamik qiymatlargina istisno). Animatsiya faqat
// transform/opacity; global reduced-motion kill-switch avtomatik qamrab oladi.
import type { ReactNode } from "react";

/* ── 🎠 kategoriya-karusel (Uzum-referens: pill + 44px ikonka-rasm) ───────────────────────────── */
export interface BjCategory {
  slug: string;
  name: string;
  emoji: string;
  iconUrl?: string | null; // admin yuklagan rasm (file_id pipeline orqali API-URL); yo'q → emoji
}

export function BjCategoryCarousel({ cats, active, onPick }: { cats: BjCategory[]; active?: string | null; onPick: (slug: string | null) => void }) {
  if (!cats.length) return null;
  return (
    <div className="bj-cats-wrap">
      <div className="bj-cats" role="tablist" aria-label="Kategoriyalar">
        {cats.map((c) => (
          <button key={c.slug} role="tab" aria-selected={active === c.slug} className={`bj-cat${active === c.slug ? " on" : ""}`} onClick={() => onPick(active === c.slug ? null : c.slug)}>
            <span className="bj-cat-ic">{c.iconUrl ? <img src={c.iconUrl} alt="" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).replaceWith(document.createTextNode(c.emoji)); }} /> : c.emoji}</span>
            {c.name}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── 🚚 yetkazish-va'da chip — har kartada, BirJoy imzosi ─────────────────────────────────────── */
export function BjPromiseChip({ text }: { text?: string | null }) {
  if (!text) return null;
  const today = /bugun/i.test(text);
  return <span className={`bj-promise${today ? " today" : ""}`}>🚚 {text}</span>;
}

/* ── 🪙 tanga-qaytim lenta (V3 cashback flag'iga ham xizmat qiladi) ───────────────────────────── */
export function BjTangaRibbon({ amount }: { amount: number }) {
  if (amount <= 0) return null;
  return <span className="bj-tanga-ribbon">🪙 ≈ {amount.toLocaleString("uz-UZ")} tanga qaytadi</span>;
}

/* ── 🛍 mahsulot-karta (2-ustun grid uchun) ───────────────────────────────────────────────────── */
export interface BjProductCardProps {
  name: string;
  priceTanga: number;
  oldPriceTanga?: number | null;
  photoUrl?: string | null;
  promise?: string | null; // do'konning deliveryText'i
  shopName?: string | null;
  fav?: boolean;
  onFav?: () => void;
  onOpen: () => void;
}

export function BjProductCard({ name, priceTanga, oldPriceTanga, photoUrl, promise, shopName, fav, onFav, onOpen }: BjProductCardProps) {
  const disc = oldPriceTanga && oldPriceTanga > priceTanga ? Math.round((1 - priceTanga / oldPriceTanga) * 100) : 0;
  return (
    <div className="bj-pcard" onClick={onOpen} role="button" tabIndex={0}>
      <div className="bj-pcard-imgwrap">
        {photoUrl ? (
          <img className="bj-pcard-img" src={photoUrl} alt={name} loading="lazy" decoding="async" onError={(e) => { const el = e.target as HTMLImageElement; el.outerHTML = '<div class="bj-pcard-imgph">🛍</div>'; }} />
        ) : (
          <div className="bj-pcard-imgph">🛍</div>
        )}
        {onFav && (
          <button className="bj-fav" aria-label={fav ? "Sevimlidan olish" : "Sevimliga qo'shish"} onClick={(e) => { e.stopPropagation(); onFav(); }}>
            {fav ? "❤️" : "🤍"}
          </button>
        )}
      </div>
      <div className="bj-pcard-body">
        <div className="bj-pcard-name">{name}</div>
        <div>
          <span className="bj-price">{priceTanga.toLocaleString("uz-UZ")}</span>
          {disc > 0 && <span className="bj-price-old">{oldPriceTanga!.toLocaleString("uz-UZ")}</span>}
          {disc > 0 && <span className="bj-sale-badge"> −{disc}%</span>}
        </div>
        <BjPromiseChip text={promise} />
        {shopName && <span className="bj-shopchip">🏬 {shopName}</span>}
      </div>
    </div>
  );
}

/* ── 🏬 do'kon-karta (gorizontal rail) ────────────────────────────────────────────────────────── */
export interface BjShopCardProps {
  name: string;
  open: boolean; // workHours'dan hisoblangan Ochiq/Yopiq
  promise?: string | null;
  rating?: number;
  photoUrl?: string | null;
  onOpen: () => void;
}

export function BjShopCard({ name, open, promise, rating, photoUrl, onOpen }: BjShopCardProps) {
  return (
    <button className="bj-shopcard" onClick={onOpen}>
      <div className={`bj-shopava${open ? "" : " closed"}`}>{photoUrl ? <img src={photoUrl} alt="" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).outerHTML = '<div class="bj-shopava-ph">🏬</div>'; }} /> : <div className="bj-shopava-ph">🏬</div>}</div>
      <div className="bj-shopname">{name}</div>
      <div className="bj-shopmeta">
        <span className={`bj-open-dot${open ? "" : " closed"}`} />
        {open ? "Ochiq" : "Yopiq"}
        {rating && rating > 0 ? ` · ⭐ ${rating.toFixed(1)}` : ""}
      </div>
      {promise && <div className="bj-shopmeta">🚚 {promise}</div>}
    </button>
  );
}

/* ── 🏠 V1.5 (Mahalla bozori): to'liq-kenglikdagi "qo'shni" karta — generic BjShopCard'dan ataylab
   farqli (kattaroq, hikoya-parcha + haqiqiy ijtimoiy-signal bilan — "shunchaki yana bir online
   do'kon" emas, balki mahalla-do'koni ekanini his qildirish uchun). ── */
export interface BjMahallaShopCardProps {
  name: string;
  open: boolean;
  promise?: string | null;
  rating?: number;
  photoUrl?: string | null;
  story?: string | null;
  weeklyOrders?: number;
  onOpen: () => void;
}

export function BjMahallaShopCard({ name, open, promise, rating, photoUrl, story, weeklyOrders, onOpen }: BjMahallaShopCardProps) {
  return (
    <button className="bj-mshop" onClick={onOpen}>
      <div className="bj-mshop-img">
        {photoUrl ? <img src={photoUrl} alt="" loading="lazy" decoding="async" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} /> : "🏠"}
      </div>
      <div className="bj-mshop-body">
        <div className="bj-mshop-top">
          <span className="bj-mshop-tag">🏠 Qo'shningiz</span>
          <span className={`bj-open-dot${open ? "" : " closed"}`} />
          <span className="bj-mshop-status">{open ? "Ochiq" : "Yopiq"}</span>
        </div>
        <div className="bj-mshop-name">{name}{rating && rating > 0 ? ` · ⭐ ${rating.toFixed(1)}` : ""}</div>
        {story && <div className="bj-mshop-story">{story}</div>}
        <div className="bj-mshop-foot">
          {promise && <span className="bj-mshop-promise">🚚 {promise}</span>}
          {!!weeklyOrders && weeklyOrders > 0 && <span className="bj-mshop-social">👥 {weeklyOrders} mahalladosh bu hafta xarid qildi</span>}
        </div>
      </div>
    </button>
  );
}

/* ── 🧺 yopishqoq savat-bar ───────────────────────────────────────────────────────────────────── */
export function BjStickyCartBar({ count, totalTanga, onOpen }: { count: number; totalTanga: number; onOpen: () => void }) {
  return (
    <button className={`bj-cartbar${count > 0 ? "" : " hidden"}`} onClick={onOpen} aria-hidden={count === 0}>
      <span>🧺 {count} ta mahsulot</span>
      <span>{totalTanga.toLocaleString("uz-UZ")} → Savat</span>
    </button>
  );
}

/* ── seksiya-sarlavha ─────────────────────────────────────────────────────────────────────────── */
export function BjSection({ title, onAll, children }: { title: string; onAll?: () => void; children: ReactNode }) {
  return (
    <section>
      <div className="bj-sect">
        <h3>{title}</h3>
        {onAll && <button className="bj-sect-all" onClick={onAll}>Hammasi →</button>}
      </div>
      {children}
    </section>
  );
}

/* ── bo'sh-holat (kod-SVG, rasm-fayl emas — GarajCarArt naqshi) ───────────────────────────────── */
export function BjEmptyState({ text, action, onAction }: { text: string; action?: string; onAction?: () => void }) {
  return (
    <div className="bj-empty">
      <svg width="72" height="56" viewBox="0 0 72 56" fill="none" aria-hidden="true">
        <rect x="8" y="18" width="56" height="34" rx="7" fill="#d9efe6" />
        <path d="M8 25c0-3.9 3.1-7 7-7h42c3.9 0 7 3.1 7 7v3H8v-3z" fill="#0d9668" opacity="0.75" />
        <path d="M26 18v-4a10 10 0 0 1 20 0v4" stroke="#0d9668" strokeWidth="3.5" strokeLinecap="round" fill="none" />
        <circle cx="27" cy="40" r="3.2" fill="#0d9668" />
        <circle cx="45" cy="40" r="3.2" fill="#0d9668" />
        <path d="M31 40h10" stroke="#0d9668" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
      <div>{text}</div>
      {action && onAction && (
        <button className="bj-sect-all" onClick={onAction}>{action}</button>
      )}
    </div>
  );
}
