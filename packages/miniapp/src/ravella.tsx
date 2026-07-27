// 🎀 RAVELLA (feature "ravella", RAVELLA_PLAN.md) — bayram/saxna bezaklari KONSTRUKTORI.
// Oqim: katalog → bezak → qo'shimchalarni `+`/`−` (har qo'shimchaning O'Z rasmi bor: qo'shilganda
// katta rasm SHUNGA o'tadi) → «Hammasi tayyor» → «🎁 BirJoy chegirmasi −10%» → buyurtma →
// «tez orada telefon qilishadi». PUL: to'lov naqd/kelishuv — bu ekran hech qanday tanga
// SARFLAMAYDI; 1% cashback ish bajarilgach serverda beriladi (bu yerda faqat VA'DA ko'rsatiladi).
// Barcha summalar server javobidan olinadi — client hisobi faqat JONLI ko'rsatkich uchun.
import { useEffect, useMemo, useRef, useState } from "react";
import type { MeResponse, RavellaAddonView, RavellaCatalogResponse, RavellaContacts, RavellaItemCard, RavellaOrderView, RavellaStoryView } from "@t1067/shared";
import { formatNumber } from "@t1067/shared";
import { api, apiUrl } from "./api";
import { haptic, hapticSuccess, shareLink } from "./telegram";
import { Button, EmptyState, Lightbox, Sheet, Skeleton } from "./design/components";
import "./design/ravella.css";

const LAST_ADDR_KEY = "ravella_last_addr";

// Ega qarori (2026-07-27): katalogda narx KO'RSATILMAYDI — bezak o'lchamiga qarab hisoblanadi va
// operator aytadi. Narx 0 bo'lsa "0 so'm" yozish mijozni chalg'itadi, shuning uchun matn beriladi.
const NO_PRICE = "Narxi kelishiladi";
const priceLabel = (som: number): string => (som > 0 ? `${formatNumber(som)} so'm` : NO_PRICE);

const STATUS_LABEL: Record<RavellaOrderView["status"], { t: string; c: string }> = {
  pending: { t: "⏳ Kutilmoqda", c: "pending" },
  accepted: { t: "✅ Qabul qilindi", c: "delivered" },
  called: { t: "☎️ Bog'lanishmoqda", c: "delivered" },
  done: { t: "🎉 Bajarildi", c: "delivered" },
  rejected: { t: "❌ Rad etildi", c: "rejected" },
  cancelled_by_user: { t: "✖ Bekor qilindi", c: "rejected" },
};

function Hero({ storyCount = 0, unseen = false, onStory }: { storyCount?: number; unseen?: boolean; onStory?: () => void }) {
  // Halqa faqat hikoya BOR bo'lganda — bo'sh halqani bosib hech nima ochilmasligi eng yomon holat
  const ring = storyCount > 0;
  return (
    <div className="rv-hero">
      {/* Brend belgisi squircle ichida (iOS ilova-ikonkasi nisbati). So'zsiz variant — nom pastda
          matn bilan yoziladi, takrorlanmasin. Rasm yuklanmasa nom baribir joyida qoladi. */}
      <div
        className={"rv-hero-badge" + (ring ? (unseen ? " ring" : " ring seen") : "")}
        onClick={ring ? () => { haptic(); onStory?.(); } : undefined}
        role={ring ? "button" : undefined}
        aria-label={ring ? `Hikoyalar (${storyCount})` : undefined}
      >
        <img src="/ravella/logo-mark.png" alt="" onError={(e) => { const b = (e.target as HTMLImageElement).parentElement; if (b) b.style.display = "none"; }} />
      </div>
      <h1 className="rv-hero-title">Ravella</h1>
      <div className="rv-hero-sub">Orzudagi bezaklar — Ravella bilan</div>
    </div>
  );
}


// ☎️ Aloqa ikonkalari. Ega/hamkor BOTDAN sozlaydi (/ravella → «Aloqa va tarmoqlar»);
// sozlanmagan kanal umuman chizilmaydi — bosilganda hech qayerga bormaydigan ikonka
// eng yomon variant. Belgilar inline SVG: tashqi so'rov ham, kutubxona ham yo'q.
const CONTACT_ICON: Record<string, JSX.Element> = {
  phone: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 1.9.6 2.8a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.5 2.8.6a2 2 0 0 1 1.7 2z" />,
  telegram: <><path d="M21.5 3.5 2.9 10.8c-.8.3-.8 1.4 0 1.7l4.6 1.5 1.8 5.4c.2.7 1.1.9 1.6.3l2.5-2.7 4.7 3.5c.6.4 1.4.1 1.6-.6l3-14.6c.2-.8-.6-1.5-1.2-1.3z" /><path d="M7.5 14 19 6.5 10 15.4" /></>,
  instagram: <><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none" /></>,
  youtube: <><rect x="2" y="5" width="20" height="14" rx="4" /><path d="M10 9.2v5.6l5-2.8z" fill="currentColor" stroke="none" /></>,
  tiktok: <><path d="M15 3v9.5a4 4 0 1 1-3.2-3.9" /><path d="M15 6.2A5 5 0 0 0 19.5 9" /></>,
  facebook: <path d="M14.5 8.5H17V5.6h-2.6c-2 0-3.4 1.4-3.4 3.5v1.6H9v3h2v7h3v-7h2.3l.5-3H14v-1.3c0-.6.2-.9.5-.9z" />,
  website: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" /></>,
};
const CONTACT_ORDER = ["phone", "telegram", "instagram", "youtube", "tiktok", "facebook", "website"] as const;

/** Ega botga «@ravella» ham, to'liq havola ham yozishi mumkin — ikkalasi ham ishlashi kerak. */
function contactHref(kind: string, raw: string): string {
  const t = raw.trim();
  if (kind === "phone") return `tel:${t.replace(/[^\d+]/g, "")}`;
  if (/^https?:\/\//i.test(t)) return t;
  const u = t.replace(/^@/, "");
  if (kind === "telegram") return `https://t.me/${u}`;
  if (kind === "instagram") return `https://instagram.com/${u}`;
  if (kind === "youtube") return `https://youtube.com/${u.startsWith("@") ? u : `@${u}`}`;
  if (kind === "tiktok") return `https://tiktok.com/@${u}`;
  if (kind === "facebook") return `https://facebook.com/${u}`;
  return `https://${u}`;
}

function ContactRow({ contacts }: { contacts?: RavellaContacts }) {
  const list = CONTACT_ORDER.filter((k) => (contacts as Record<string, string | undefined> | undefined)?.[k]);
  if (!list.length) return null;
  return (
    <>
      <div className="rv-contacts">
        {list.map((k) => (
          <a
            key={k}
            className={`rv-ci ${k}`}
            href={contactHref(k, (contacts as Record<string, string>)[k]!)}
            target={k === "phone" ? undefined : "_blank"}
            rel="noopener"
            aria-label={k}
            onClick={() => haptic()}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              {CONTACT_ICON[k]}
            </svg>
          </a>
        ))}
      </div>
    </>
  );
}


/** ‹ Orqaga — shisha kapsula. Matnli havola emas: barmoq uchun 44px maydon, kontent ustida
 *  "suzadi" va boshqa shisha sirtlar bilan bir tilda gapiradi. Belgi — chiziqli chevron. */
function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button className="rv-back" onClick={() => { haptic(); onBack(); }} aria-label="Orqaga">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 5 8 12l7 7" />
      </svg>
      <span>Orqaga</span>
    </button>
  );
}


// ── 📹 HIKOYA (RAVELLA_V2_PLAN §5) ──────────────────────────────────────────────────────────────
// Ega qoidasi: oxirgi 10 ta, muddat YO'Q. Ko'ruvchi do'kon-hikoyasidan ALOHIDA yozildi: u
// `shopName`/`featuredProduct` kabi do'kon tushunchalariga bog'langan va eski `bj-` uslubida —
// uni umumiylashtirish jonli do'kon-xizmatiga tegishni talab qilardi (RAVELLA_V2_PLAN'da
// aytilgan zaxira yo'l). Bu variant Liquid Glass tilida va ~70 qator.
function StoryViewer({ stories, start, onClose }: { stories: RavellaStoryView[]; start: number; onClose: () => void }) {
  const [idx, setIdx] = useState(start);
  // Video JIM boshlanadi — brauzer ovozli avto-ijroni bloklaydi va video umuman yurmay qoladi.
  // Ovoz bir bosishda yoqiladi (Instagram ham aynan shunday).
  const [sound, setSound] = useState(false);
  const vid = useRef<HTMLVideoElement | null>(null);
  const cur = stories[idx];

  // Ko'rildi — ochilgan zahoti belgilanadi (server idempotent, takror yozilmaydi)
  useEffect(() => {
    if (cur) api.ravellaStoryViewed(cur.id).catch(() => undefined);
  }, [cur?.id]);

  const go = (d: 1 | -1) => {
    haptic();
    const n = idx + d;
    if (n < 0) return;
    if (n >= stories.length) { onClose(); return; } // oxirgisidan keyin yopiladi
    setIdx(n);
  };

  // Rasm 5 soniya turadi; video o'zining tugashi bilan o'tadi (onEnded)
  useEffect(() => {
    if (!cur || cur.kind === "video") return;
    const t = setTimeout(() => go(1), 5000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur?.id]);

  if (!cur) return null;
  return (
    <div className="rv-story-viewer">
      <div className="rv-story-progress">
        {stories.map((s, i) => <span key={s.id} className={i < idx ? "done" : i === idx ? "active" : ""} />)}
      </div>
      <div className="rv-story-head">
        <img className="rv-story-avatar" src="/ravella/logo-mark.png" alt="" />
        <span className="rv-story-name">Ravella</span>
        <button className="rv-story-close" onClick={() => { haptic(); onClose(); }} aria-label="Yopish">✕</button>
      </div>
      {cur.kind === "video" ? (
        <video
          key={cur.id}
          ref={vid}
          className="rv-story-media"
          src={apiUrl(`/api/ravella/story-media/${cur.id}`)}
          autoPlay
          muted={!sound}
          playsInline
          onEnded={() => go(1)}
        />
      ) : (
        <img key={cur.id} className="rv-story-media" src={apiUrl(`/api/ravella/story-media/${cur.id}`)} alt="" />
      )}
      {cur.kind === "video" && (
        <button
          className="rv-story-sound"
          aria-label={sound ? "Ovozni o'chirish" : "Ovozni yoqish"}
          onClick={(e) => {
            e.stopPropagation();
            haptic();
            const next = !sound;
            setSound(next);
            if (vid.current) { vid.current.muted = !next; void vid.current.play().catch(() => undefined); }
          }}
        >
          {sound ? "🔊" : "🔇"}
        </button>
      )}
      {cur.caption && <div className="rv-story-caption">{cur.caption}</div>}
      {/* Chap/o'ng yarim — Instagram naqshi: bosib o'tiladi */}
      <button className="rv-story-tap left" aria-label="Oldingi" onClick={() => go(-1)} />
      <button className="rv-story-tap right" aria-label="Keyingi" onClick={() => go(1)} />
    </div>
  );
}


/** Instagram «highlights» — bu joylangan HIKOYALAR (ega tuzatishi 2026-07-28: hikoya qo'yilsa
 *  shu qatorda ko'rinishi kerak). Har doira = bitta hikoya; bosilganda ko'ruvchi AYNAN o'sha
 *  hikoyadan ochiladi. Video hikoya rasm sifatida chizilmaydi — o'rniga ▶ belgili doira. */
function Highlights({ stories, onOpen }: { stories: RavellaStoryView[] | null; onOpen: (i: number) => void }) {
  if (!stories || stories.length === 0) return null;
  return (
    <div className="rv-hl">
      {stories.map((st, i) => (
        <button key={st.id} className="rv-hl-item" onClick={() => { haptic(); onOpen(i); }}>
          <span className={"rv-hl-ring" + (st.seen ? " seen" : "")}>
            {st.kind === "video" ? (
              <span className="rv-hl-video">▶</span>
            ) : (
              <img src={apiUrl(`/api/ravella/story-media/${st.id}`)} alt="" loading="lazy" />
            )}
          </span>
          <span className="rv-hl-name">{st.caption?.slice(0, 12) || "Hikoya"}</span>
        </button>
      ))}
    </div>
  );
}

/** Doim ko'rinadigan ulashish tugmasi (ega: "topchidek tursin, sticky, hamma joyda").
 *  Mini app'da `switchInlineQuery` — chat tanlanadi va BOT tugmali kartochkani joylaydi.
 *  Oddiy havola ulashishda tugma qo'shib bo'lmaydi (Telegram cheklovi), shuning uchun shu yo'l;
 *  eski mijozlarda `switchInlineQuery` bo'lmasa — oddiy havola-ulashishga tushadi. */
function ShareFab() {
  return (
    <button
      className="rv-fab"
      aria-label="Ulashish"
      onClick={() => {
        haptic();
        const w = window as unknown as { Telegram?: { WebApp?: { switchInlineQuery?: (q: string, t?: string[]) => void } } };
        const sw = w.Telegram?.WebApp?.switchInlineQuery;
        if (sw) { try { sw("ravella", ["users", "groups", "channels"]); return; } catch { /* pastdagi zaxira */ } }
        shareLink("https://app.birjoy.online/ravella?v=2", "🎀 Ravella — to'y bezaklari, sharlar, yozuvlar");
      }}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v13M12 3 8 7M12 3l4 4" /><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
      </svg>
    </button>
  );
}

function CatalogSkeleton() {
  return (
    <div className="rv-grid">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="rv-card">
          <Skeleton h={130} />
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

/** V1: kartaning O'ZIDA surish. Eng nozik joyi — surish va bosish bir-biriga xalaqit beradi:
 *  barmoq sal siljisa brauzer baribir "bosildi" deydi va sahifa ochilib ketadi. Shuning uchun
 *  ochish `click`da emas, `pointerup`da va FAQAT 8px dan kam siljiganda. 8px — barmoqning
 *  beixtiyor tebranishi bilan haqiqiy surish orasidagi chegara. */
const TAP_SLOP = 8;

function ItemCard({ it, onOpen }: { it: RavellaItemCard; onOpen: (it: RavellaItemCard) => void }) {
  const [slide, setSlide] = useState(0);
  const down = useRef<{ x: number; y: number } | null>(null);
  const ids = it.photoIds ?? [];
  const srcs = ids.length
    ? ids.map((pid) => apiUrl(`/api/ravella/gallery/${pid}`))
    : it.hasPhoto ? [apiUrl(`/api/ravella/photo/${it.id}`)] : [];

  return (
    <div
      className="rv-card"
      role="button"
      tabIndex={0}
      onPointerDown={(e) => { down.current = { x: e.clientX, y: e.clientY }; }}
      onPointerUp={(e) => {
        const d = down.current;
        down.current = null;
        if (!d) return;
        if (Math.abs(e.clientX - d.x) < TAP_SLOP && Math.abs(e.clientY - d.y) < TAP_SLOP) { haptic(); onOpen(it); }
      }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { haptic(); onOpen(it); } }}
    >
      <div className="rv-card-photo-wrap">
        {srcs.length ? (
          <div
            className="rv-card-slides"
            onScroll={(e) => {
              const el = e.currentTarget;
              const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
              if (i !== slide) setSlide(i);
            }}
          >
            {srcs.map((src) => <img key={src} className="rv-card-photo" src={src} loading="lazy" decoding="async" alt="" />)}
          </div>
        ) : (
          <div className="rv-card-photo rv-noimg">🎀</div>
        )}
        {srcs.length > 1 && (
          <div className="rv-card-dots">
            {srcs.map((src, i) => <span key={src} className={i === slide ? "on" : ""} />)}
          </div>
        )}
      </div>
      <div className="rv-card-body">
        <div className="rv-card-name">{it.name}</div>
        <div className="rv-card-price">{it.basePriceSom > 0 ? <>{formatNumber(it.basePriceSom)} so'm<span>dan</span></> : <span>{NO_PRICE}</span>}</div>
      </div>
    </div>
  );
}

// ── konstruktor ──────────────────────────────────────────────────────────────────────────────────

function Constructor({ itemId, me, onBack, onBanner }: { itemId: number; me: MeResponse; onBack: () => void; onBanner?: (m: string) => void }) {
  const [data, setData] = useState<{ item: RavellaItemCard | null; photoIds?: number[]; addons: RavellaAddonView[]; discountPct: number; cashbackPct: number } | null>(null);
  // Qo'shimchalar (+/−) EKRANDAN OLIB TASHLANDI — ega qarori 2026-07-27: "keyingi etapda".
  // Ma'lumot o'chirilmadi, faqat ko'rsatilmaydi; qaytarish = shu blokni tiklash.
  const [qty] = useState<Record<number, number>>({});
  const [slide, setSlide] = useState(0); // karusel: hozirgi rasm
  const [zoom, setZoom] = useState<number | null>(null); // V2: to'liq ekran (bosilgan rasm raqami)
  const [checkout, setCheckout] = useState(false);
  const [useDiscount, setUseDiscount] = useState(false);
  const [contact, setContact] = useState(() => me.member?.phone ?? "");
  const [address, setAddress] = useState(() => { try { return localStorage.getItem(LAST_ADDR_KEY) ?? ""; } catch { return ""; } });
  const [eventDate, setEventDate] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ orderId: number; totalSom: number; cashbackSom: number } | null>(null);

  useEffect(() => {
    setData(null);
    setSlide(0);
    api.ravellaItem(itemId).then(setData).catch(() => setData({ item: null, addons: [], discountPct: 0, cashbackPct: 0 }));
  }, [itemId]);

  const addonOf = useMemo(() => new Map((data?.addons ?? []).map((a) => [a.id, a])), [data]);
  const lines = useMemo(
    () => Object.entries(qty).filter(([, q]) => q > 0).map(([id, q]) => ({ addon: addonOf.get(Number(id))!, qty: q })).filter((l) => l.addon),
    [qty, addonOf],
  );
  const subtotalSom = (data?.item?.basePriceSom ?? 0) + lines.reduce((s, l) => s + l.addon.priceSom * l.qty, 0);
  const discountSom = useDiscount ? Math.floor((subtotalSom * (data?.discountPct ?? 0)) / 100) : 0;
  const totalSom = subtotalSom - discountSom;
  const cashbackSom = Math.floor((totalSom * (data?.cashbackPct ?? 0)) / 100);

  const submit = async () => {
    if (!data?.item || busy) return;
    if (contact.replace(/\D/g, "").length < 7) { onBanner?.("Telefon raqamingizni to'liq yozing"); return; }
    if (address.trim().length < 5) { onBanner?.("Manzilni to'liqroq yozing (kamida 5 belgi)"); return; }
    setBusy(true);
    try {
      const r = await api.ravellaOrder({
        itemId: data.item.id,
        addons: lines.map((l) => ({ addonId: l.addon.id, qty: l.qty })),
        contact, address, eventDate, note, useDiscount,
      });
      if (r.ok && r.orderId) {
        hapticSuccess();
        try { localStorage.setItem(LAST_ADDR_KEY, address.trim()); } catch { /* private mode */ }
        setDone({ orderId: r.orderId, totalSom: r.totalSom ?? 0, cashbackSom: r.cashbackSom ?? 0 });
        setCheckout(false);
      } else {
        const msgs: Record<string, string> = {
          off: "Xizmat hozircha yopiq",
          unavailable: "Bu bezak hozircha mavjud emas",
          bad_item: "Katalog yangilandi — qaytadan tanlang",
          bad_addon: "Qo'shimcha yangilandi — qaytadan tanlang",
          bad_contact: "Telefon raqamingizni to'liq yozing",
          bad_address: "Manzilni to'liqroq yozing",
          pending_limit: "Sizda ochiq buyurtmalar bor — avval ular tugasin",
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
        <BackButton onBack={onBack} />
        <Skeleton h={220} /><div style={{ height: 12 }} /><Skeleton h={60} />
      </div>
    );
  }
  if (!data.item) {
    return (
      <div className="view">
        <BackButton onBack={onBack} />
        <EmptyState icon="🎀" text="Bezak topilmadi" />
      </div>
    );
  }
  if (done) {
    return (
      <div className="view rv-done">
        <div className="rv-done-icon">✅</div>
        <div className="rv-done-title">Buyurtmangiz qabul qilindi</div>
        <div className="rv-done-sub">#{done.orderId}{done.totalSom > 0 ? ` · ${formatNumber(done.totalSom)} so'm` : ""}</div>
        <div className="rv-done-call">☎️ Tez orada Ravella siz bilan bog'lanadi</div>
        {done.cashbackSom > 0 && (
          <div className="rv-done-cb">🪙 Ish bajarilgach <b>+{formatNumber(done.cashbackSom)} tanga</b> qaytadi</div>
        )}
        <Button variant="brand" onClick={onBack}>Katalogga qaytish</Button>
      </div>
    );
  }

  // Karusel manbai: galereya (bir nechta rasm). Bo'sh bo'lsa eski qopqoq rasmiga tushamiz —
  // shu tufayli hali galereyaga o'tmagan bezaklar ham rasmsiz ko'rinmaydi.
  const slides = (data.photoIds ?? []).length
    ? data.photoIds!.map((pid) => apiUrl(`/api/ravella/gallery/${pid}`))
    : data.item.hasPhoto ? [apiUrl(`/api/ravella/photo/${data.item.id}`)] : [];

  return (
    <div className="view rv-detail">
      <ShareFab />
      <BackButton onBack={onBack} />

      {/* Gorizontal karusel: CSS scroll-snap — kutubxona yo'q, barmoq bilan suriladi,
          klaviatura/skrinrider ham ishlaydi. Nuqtalar joriy rasmni ko'rsatadi. */}
      <div className="rv-stage">
        {slides.length ? (
          <div
            className="rv-slides"
            onScroll={(e) => {
              const el = e.currentTarget;
              const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
              if (i !== slide) setSlide(i);
            }}
          >
            {slides.map((src, i) => (
              <img
                key={src}
                className="rv-slide"
                src={src}
                alt=""
                loading="lazy"
                decoding="async"
                onClick={() => { haptic(); setZoom(i); }}
              />
            ))}
          </div>
        ) : (
          <div className="rv-stage-photo rv-noimg">🎀</div>
        )}
        {slides.length > 1 && (
          <div className="rv-dots">
            {slides.map((src, i) => <span key={src} className={i === slide ? "on" : ""} />)}
          </div>
        )}
      </div>

      {zoom !== null && (
        <Lightbox count={slides.length} start={zoom} photoUrl={(i) => slides[i]!} onClose={() => setZoom(null)} />
      )}

      <div className="rv-name">{data.item.name}</div>
      {data.item.desc && <div className="rv-desc">{data.item.desc}</div>}
      <div className="rv-base">{data.item.basePriceSom > 0 ? `Asosiy narx · ${formatNumber(data.item.basePriceSom)} so'm` : NO_PRICE}</div>

      <div className="rv-total-bar">
        <div className="rv-total-num">
          <small>{data.item.name}</small>
          <b>{subtotalSom > 0 ? `${formatNumber(subtotalSom)} so'm` : NO_PRICE}</b>
        </div>
        <button className="rv-ready" onClick={() => { haptic(); setCheckout(true); }}>Buyurtma berish</button>
      </div>

      <Sheet open={checkout} onClose={() => setCheckout(false)}>
        <h3>Buyurtmani rasmiylashtirish</h3>
        <div className="rv-confirm-line"><span>{data.item.name}</span><span>{priceLabel(data.item.basePriceSom)}</span></div>
        {lines.map((l) => (
          <div key={l.addon.id} className="rv-confirm-line">
            <span>{l.addon.name} ×{l.qty}</span><span>{l.addon.priceSom > 0 ? `${formatNumber(l.addon.priceSom * l.qty)} so'm` : ""}</span>
          </div>
        ))}

        {data.discountPct > 0 && (
          useDiscount ? (
            <div className="rv-disc-on">✅ BirJoy chegirmasi qo'llandi — <b>−{formatNumber(discountSom)} so'm</b></div>
          ) : (
            <button className="rv-disc-btn" onClick={() => { hapticSuccess(); setUseDiscount(true); }}>
              🎁 BirJoy chegirmasidan foydalanish — {data.discountPct}%
            </button>
          )
        )}

        <div className="rv-confirm-total">
          <span>Jami</span>
          <span>
            {subtotalSom > 0 ? (
              <>{useDiscount && <s>{formatNumber(subtotalSom)}</s>}<b> {formatNumber(totalSom)} so'm</b></>
            ) : (
              <b>{NO_PRICE}</b>
            )}
          </span>
        </div>
        {cashbackSom > 0 && <div className="rv-cb-hint">🪙 Ish bajarilgach <b>+{formatNumber(cashbackSom)} tanga</b> qaytadi</div>}

        <input className="bk-input mt8" placeholder="Telefon: +998 __ ___ __ __" value={contact} onChange={(e) => setContact(e.target.value)} maxLength={30} />
        <input className="bk-input mt8" placeholder="Manzil: Koson sh., ko'cha, uy" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200} />
        <input className="bk-input mt8" placeholder="Sana (masalan: 5-avgust)" value={eventDate} onChange={(e) => setEventDate(e.target.value)} maxLength={40} />
        <input className="bk-input mt8" placeholder="Izoh (ixtiyoriy)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
        <Button variant="brand" disabled={busy} onClick={submit}>
          {busy ? "Yuborilmoqda…" : "Buyurtma berish"}
        </Button>
        <div className="rv-pay-note">Narx bezak o'lchamiga qarab hisoblanadi — operator qo'ng'iroq qilib aytadi. Hech qanday tanga yechilmaydi.</div>
      </Sheet>
    </div>
  );
}

// ── mening buyurtmalarim ─────────────────────────────────────────────────────────────────────────

function MyOrders({ onBack }: { onBack: () => void }) {
  const [orders, setOrders] = useState<RavellaOrderView[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  useEffect(() => {
    const load = () => api.ravellaOrders().then((r) => setOrders(r.orders)).catch(() => undefined);
    load();
    const iv = setInterval(load, 8000); // hamkor botdan holatni o'zgartirsa mijoz shu yerda jonli ko'radi
    return () => clearInterval(iv);
  }, []);

  const cancel = async (o: RavellaOrderView) => {
    haptic();
    setBusyId(o.id);
    const r = await api.ravellaCancel(o.id).catch(() => ({ ok: false as const }));
    setBusyId(null);
    if (r.ok) { hapticSuccess(); api.ravellaOrders().then((x) => setOrders(x.orders)).catch(() => undefined); }
  };

  return (
    <div className="view">
      <BackButton onBack={onBack} />
      {orders === null ? (
        <><Skeleton h={70} /><div style={{ height: 8 }} /><Skeleton h={70} /></>
      ) : orders.length === 0 ? (
        <EmptyState icon="📦" text="Hali buyurtma yo'q" />
      ) : (
        orders.map((o) => {
          const s = STATUS_LABEL[o.status];
          return (
            <div key={o.id} className="rv-order-card">
              <div className="rv-order-top">
                <b>{o.itemName}</b>
                <span className={`order-status-pill ${s.c}`}>{s.t}</span>
              </div>
              {o.addons.length > 0 && <div className="muted fs12">{o.addons.map((a) => `${a.name} ×${a.qty}`).join(", ")}</div>}
              <div className="rv-order-bottom">
                <span>{o.eventDate || o.address}</span>
                <b>{formatNumber(o.totalSom)} so'm</b>
              </div>
              {o.discountSom > 0 && <div className="muted fs11">🎁 BirJoy chegirmasi: −{formatNumber(o.discountSom)} so'm</div>}
              {o.cashbackSom > 0 && <div className="rv-order-cb">🪙 +{formatNumber(o.cashbackSom)} tanga qaytdi</div>}
              {o.status === "rejected" && o.rejectReason && <div className="rv-order-reason">Sabab: {o.rejectReason}</div>}
              {o.status === "pending" && (
                <button className="rv-order-cancel" disabled={busyId === o.id} onClick={() => cancel(o)}>✖ Bekor qilish</button>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

// ── katalog (kirish nuqtasi) ─────────────────────────────────────────────────────────────────────

export function RavellaView({ me, onBanner }: { me: MeResponse; onBanner?: (msg: string) => void }) {
  const [cat, setCat] = useState<RavellaCatalogResponse | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [activeCat, setActiveCat] = useState<number | "all">("all");
  const [stories, setStories] = useState<RavellaStoryView[] | null>(null);
  const [storyOpen, setStoryOpen] = useState(false);
  const [storyStart, setStoryStart] = useState(0);
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    api.ravellaCatalog().then((c) => {
      setCat(c);
      // Hikoyalar ro'yxati highlights qatori uchun DARHOL kerak (halqa uchun `storyCount` yetardi,
      // lekin doiralarni chizish uchun rasm-id'lari kerak). Faqat hikoya bor bo'lsa so'raladi.
      if ((c.storyCount ?? 0) > 0) api.ravellaStories().then((r) => setStories(r.stories)).catch(() => undefined);
    }).catch(() => setCat({ categories: [], discountPct: 0, cashbackPct: 0 }));
  }, []);

  const openStories = () => {
    if (stories?.length) { setStoryStart(Math.max(0, stories.findIndex((x) => !x.seen))); setStoryOpen(true); return; }
    api.ravellaStories().then((r) => {
      setStories(r.stories);
      if (r.stories.length) { setStoryStart(0); setStoryOpen(true); }
    }).catch(() => undefined);
  };

  if (ordersOpen) return <MyOrders onBack={() => setOrdersOpen(false)} />;
  if (openId != null) return <Constructor itemId={openId} me={me} onBack={() => setOpenId(null)} onBanner={onBanner} />;

  const cats = cat?.categories ?? [];
  const shown = activeCat === "all" ? cats : cats.filter((c) => c.id === activeCat);

  return (
    <div className="view rv-view">
      {storyOpen && stories && stories.length > 0 && (
        <StoryViewer
          stories={stories}
          start={storyStart}
          onClose={() => setStoryOpen(false)}
        />
      )}
      <ShareFab />
      <Hero storyCount={cat?.storyCount ?? 0} unseen={!!cat?.storyUnseen} onStory={openStories} />
      {/* Aloqa hero OSTIDA — ega qarori: sahifa oxiridagi footer olib tashlandi, lekin
          qo'ng'iroq/tarmoq bir bosishda qo'l ostida qolishi kerak */}
      <ContactRow contacts={cat?.contacts} />
      <Highlights stories={stories} onOpen={(i) => { setStoryStart(i); setStoryOpen(true); }} />
      {cat && cat.discountPct > 0 && (
        <div className="rv-promo">
          🎁 BirJoy orqali <b>{cat.discountPct}% arzon</b>{cat.cashbackPct > 0 ? <> · <b>{cat.cashbackPct}% tanga</b> qaytadi</> : null}
        </div>
      )}
      <button className="rv-myorders" onClick={() => { haptic(); setOrdersOpen(true); }}>📦 Mening buyurtmalarim</button>

      {cat === null ? (
        <CatalogSkeleton />
      ) : cats.length === 0 ? (
        <EmptyState icon="🎀" text="Hozircha bezaklar qo'shilmagan — tez orada" />
      ) : (
        <>
          {cats.length > 1 && (
            <div className="rv-cat-row">
              <button className={"rv-chip" + (activeCat === "all" ? " on" : "")} onClick={() => { haptic(); setActiveCat("all"); }}>Barchasi</button>
              {cats.map((c) => (
                <button key={c.id} className={"rv-chip" + (activeCat === c.id ? " on" : "")} onClick={() => { haptic(); setActiveCat(c.id); }}>
                  {c.emoji} {c.name}
                </button>
              ))}
            </div>
          )}
          {shown.map((c) => (
            <div key={c.id} className="rv-cat-block">
              {/* Bo'lim bitta bo'lsa sarlavha ortiqcha shovqin — kartalarning o'zi yetarli */}
              {cats.length > 1 && <div className="rv-cat-title">{c.emoji} {c.name}</div>}
              <div className="rv-grid">
                {c.items.map((it) => <ItemCard key={it.id} it={it} onOpen={(x) => setOpenId(x.id)} />)}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
