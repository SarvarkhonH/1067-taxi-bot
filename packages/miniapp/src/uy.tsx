// 🏠 "Uy" — the taxi-first home tab (default). Light + leaflet-free; the LivingHome map
// version is the flag-gated upgrade. Greeting + balance + taxi CTA + Bugun + quick tiles.
// NewUyView (feature "newhome", UY_REDESIGN Bosqich 1) = the premium super-app home below.
import { useEffect, useState } from "react";
import type { ClassifiedCard, HomeBanner, HomeFeedItem, MeResponse, OyinPrizeView, OyinStateResponse, SavedAddressView, ServiceListingCard } from "@t1067/shared";
import { INSP_TIER_EMOJI, INSP_TIER_LABEL } from "@t1067/shared";
import { api, apiUrl } from "./api";
import { haptic } from "./telegram";
import { HomeGames } from "./homeGames";

// 🎮 Koson O'yini — uy-ekran HERO kartasi (feature "oyin", ega redizayni 2026-08-02: "katta va
// chiroyli preview kerak"). "Bugungi tavsiya" banneri o'rnini oladi (uy renderida f.oyin bilan
// mask qilinadi). Katta sovrin-rasmlari real vitrina'dan (admin qo'ygan foto, emoji-fallback);
// "Sovrinlarni ko'rish" o'yin ekranini to'g'ridan-to'g'ri vitrina tabida ochadi (localStorage flag).
function KosonOyinCard({ onNav }: { onNav: (t: string) => void }) {
  const [state, setState] = useState<OyinStateResponse | null>(null);
  const [prizes, setPrizes] = useState<OyinPrizeView[] | null>(null);
  useEffect(() => {
    let alive = true;
    api.oyinState().then((s) => { if (alive) setState(s); }).catch(() => undefined);
    api.oyinVitrina().then((v) => { if (alive) setPrizes(v.prizes); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);

  const goOyin = () => { haptic(); onNav("oyin"); };
  const goVitrina = () => {
    haptic();
    try { localStorage.setItem("oyk_start_tab", "vitrina"); } catch { /* xotira yopiq — home tabda ochiladi */ }
    onNav("oyin");
  };

  // Skeleton balandligi real kartaga TENG (~267px) — aks holda yuklanganda sahifa sakraydi.
  if (!state) return <div className="nh-koson"><div className="nh-skel" style={{ height: 267, borderRadius: 22 }} /></div>;
  // Mavsum sozlanmagan — karta umuman chizilmaydi (yolg'on sanoq ko'rsatgandan ko'ra yo'q bo'lgani yaxshi).
  if (!state.season.configured || state.season.phase === "ended") return null;

  // ⚠️ `Date.parse(null) → NaN` → `Math.max(0, NaN) → NaN` → ekranda "NaN kun qoldi". Qo'riqlanadi.
  const upcoming = state.season.phase === "upcoming";
  const targetIso = upcoming ? state.season.startIso : state.season.endIso;
  const targetMs = targetIso ? Date.parse(targetIso) : NaN;
  const left = Number.isFinite(targetMs) ? Math.max(0, targetMs - Date.now()) : 0;
  const days = Math.floor(left / 86400_000);
  const hours = Math.floor((left % 86400_000) / 3600_000);
  const cdText = days > 0 ? `${days} kun` : `${hours} soat`;
  // Eng qimmat 3 sovrin — "katta yutuq" hissi (arzonlari o'yin ichida baribir ko'rinadi).
  const top = (prizes ?? []).slice().sort((a, b) => b.price - a.price).slice(0, 3);

  return (
    <div className="nh-koson">
      <div className="nh-koson-glow" aria-hidden="true" />
      <button className="nh-koson-main" onClick={goOyin}>
        <div className="nh-koson-top">
          <span className="nh-koson-badge">{upcoming ? "🚀 TEZ ORADA" : "🔥 MAVSUM OCHIQ"}</span>
          <span className="nh-koson-cd">{upcoming ? `⏳ Startgacha ${cdText}` : `⏳ Tirajgacha ${cdText}`}</span>
        </div>
        <div className="nh-koson-title">
          {upcoming ? "Sovrinlar mavsumi boshlanmoqda 🎁" : "Sovrinlar mavsumi ochiq 🎁"}
        </div>
        <div className="nh-koson-sub">Safar qiling, ball yig'ing — chipta oling. Mavsum oxirida jonli tirajda g'oliblar tasodifiy tanlanadi</div>
        {top.length > 0 && (
          <div className="nh-koson-prizes">
            {top.map((p) => (
              <div key={p.key} className="nh-koson-prize">
                <div className="nh-koson-prize-im">
                  {p.photoUrl
                    ? <img src={p.photoUrl} alt="" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).replaceWith(document.createTextNode(p.icon)); }} />
                    : <span className="nh-koson-prize-em">{p.icon}</span>}
                </div>
                <span className="nh-koson-prize-nm">{p.name}</span>
              </div>
            ))}
          </div>
        )}
      </button>
      <div className="nh-koson-foot">
        <span className="nh-koson-ball">🪙 Sizda <b>{state.ball}</b> ball{state.rank ? ` · 🏅 ${state.rank}-o'rin` : ""}</span>
        <span className="nh-koson-actions">
          <button className="nh-koson-btn primary" onClick={goOyin}>▶ Boshlash</button>
          <button className="nh-koson-btn ghost" onClick={goVitrina}>🎁 Sovrinlar</button>
        </span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 🏠 NewUyView — premium super-app home (feature "newhome", UY_REDESIGN).
// Rendered instead of UyView when me.flags.newhome. Classic UyView stays the fallback.
// Data: ONE /api/home/feed aggregate (Bosqich 2) — server computes banner + image-forward feed from
// local DB (shop + restoran views), so the client makes a single call. Themes via data-theme.
// ═══════════════════════════════════════════════════════════════════════════
const num = (n: number) => n.toLocaleString("ru-RU");
function timeAgo(iso: string): string {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (!Number.isFinite(s) || s < 0) return "";
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} daq oldin`;
  if (s < 86400) return `${Math.round(s / 3600)} soat oldin`;
  return `${Math.round(s / 86400)} kun oldin`;
}

// 2026-07-23 owner: hozircha Do'kon + Restoran + Taxi'ga fokus — Xizmatlar/E'lonlar kirish yo'llari
// (rail, hub, home content-bloklari) vaqtincha qulflangan, "Tez orada" bilan. Qayta ochish uchun
// shu bitta bayroqni false qiling — boshqa hech narsa o'zgarmaydi (kod/ma'lumot saqlanib qoladi).
const FOCUS_MODE = true;
const COMING_SOON_MSG = "🔒 Tez orada! Hozircha Do'kon, Restoran va Taxi'ga fokuslanyapmiz.";

export function NewUyView({ me, onBook, onNav, onBanner }: { me: MeResponse; onBook: () => void; onNav: (t: string) => void; onBanner?: (msg: string) => void }) {
  const [feed, setFeed] = useState<HomeFeedItem[] | null>(null);
  const [banner, setBanner] = useState<HomeBanner | null>(null);
  const [hub, setHub] = useState(false);
  const [ustas, setUstas] = useState<ServiceListingCard[] | null>(null);
  const [elons, setElons] = useState<ClassifiedCard[] | null>(null);
  const f = me.flags ?? {};

  useEffect(() => {
    let alive = true;
    api.homeFeed()
      .then((r) => { if (alive) { setFeed(r.items); setBanner(r.banner); } })
      .catch(() => { if (alive) setFeed([]); });
    return () => { alive = false; };
  }, []);

  // 🔧 Xizmatlar (yaqin ustalar) + 📋 E'lonlar content-bloklari — home'da REAL kontent bilan,
  // faqat rail-ikonka emas (UY_REDESIGN_DOD §3.1 7b/7c). Faqat mos flag ON va FOCUS_MODE off bo'lsa so'raladi.
  useEffect(() => {
    let alive = true;
    if (!FOCUS_MODE && f.xizmatlar) api.svcList({ limit: 5, sort: "new" }).then((r) => { if (alive) setUstas(r.listings); }).catch(() => { if (alive) setUstas([]); });
    if (!FOCUS_MODE && f.elonlar) api.elonAds({ limit: 5 }).then((r) => { if (alive) setElons(r.ads); }).catch(() => { if (alive) setElons([]); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rail = [
    // 🎮 O'yin rail'da ham bor: hero'dan pastga o'tib ketgan odam uchun IKKINCHI yo'l (avval
    // o'yinga faqat hero orqali kirilardi, hub'da ham yo'q edi).
    { on: !!f.oyin, ic: "nh-i-g", em: "🎮", lb: "O'yin", nav: "oyin", locked: false },
    { on: !!f.shop, ic: "nh-i-b", em: "🏪", lb: "Do'kon", nav: "dokon", locked: false },
    { on: !!f.restoran, ic: "nh-i-o", em: "🍽", lb: "Restoran", nav: "restoran", locked: false },
    // 🎀 Ravella — hamkor-brend (ega qarori 2026-07-27): rail'da KICHIK tugma, ikonkasi emoji emas,
    // brend logotipi. Do'kon/Restoran'dan keyin turadi — u alohida xizmat turi, ular ichida emas.
    { on: !!f.ravella, ic: "nh-i-r", em: "🎀", img: "/ravella/logo-mark.png", lb: "Ravella", nav: "ravella", locked: false },
    { on: !!f.intercity, ic: "nh-i-t", em: "🚐", lb: "Yo'l", nav: "yol", locked: false },
    { on: !!f.xizmatlar, ic: "nh-i-v", em: "🔧", lb: "Xizmat", nav: "xizmat", locked: FOCUS_MODE },
    { on: !!f.elonlar, ic: "nh-i-p", em: "📋", lb: "E'lon", nav: "elonlar", locked: FOCUS_MODE },
    { on: true, ic: "nh-i-g", em: "🎁", lb: "Bonus", nav: "play", locked: false },
  ].filter((r) => r.on);

  const go = (t: string) => { haptic(); onNav(t); };
  const tapRail = (r: (typeof rail)[number]) => (r.locked ? onBanner?.(COMING_SOON_MSG) : go(r.nav));
  const badgeLabel = (b?: string) => (b === "top" ? "🔥 TOP" : b === "new" ? "Yangi" : b === "disc" ? "Chegirma" : "");

  return (
    <div className="nh-view">
      {/* Minimalizm (ega qarori 2026-07-26): bosh sahifadan brend-satri, tanga-tugmasi va
          qidiruv olib tashlandi. Brend global topbar'da ham yo'q — balans faqat quyidagi
          hamyon kartasida (bitta joyda), qidiruvga do'kon/restoran tablari orqali boriladi. */}
      <div className="nh-wallet">
        <div className="wrow">
          <div>
            <div className="k">🪙 Tanga balansi</div>
            <div className="b">{num(me.coins)}</div>
            <div className="cb">🚕 {num(me.stats.points)} so'm cashback</div>
          </div>
          <button className="yc" onClick={() => go("wallet")}>Yechish →</button>
        </div>
      </div>

      {/* Taxi-kartasi (ega tuzatishi 2026-07-26): pastki bardagi FAB olib tashlangach bu YAGONA
          chaqirish nuqtasi — minimalizm bosqichida xato o'chirilgan edi, qaytarildi. */}
      <button className="nh-taxi" onClick={() => { haptic(); onBook(); }}>
        <span className="i">🚖</span>
        <span><b>Taxi chaqirish</b><small>Bir tap bilan — yaqin mashina</small></span>
        <span className="go">→</span>
      </button>

      {f.oyin && <KosonOyinCard onNav={onNav} />}

      {(rail.length > 0) && (
        <div className="nh-rail">
          {rail.map((r) => (
            <button key={r.nav} className={`nh-svc${r.locked ? " locked" : ""}`} onClick={() => tapRail(r)}>
              <span className={`ic ${r.ic}`}>
                {"img" in r && r.img
                  ? <img className="nh-brand-ic" src={r.img} alt="" onError={(e) => ((e.target as HTMLImageElement).replaceWith(document.createTextNode(r.em)))} />
                  : r.em}
                {r.locked && <span className="soon-bd" aria-hidden="true">🔒</span>}
              </span>
              <span className="lb">{r.lb}</span>
            </button>
          ))}
          <button className="nh-svc" onClick={() => { haptic(); setHub(true); }}>
            <span className="ic nh-i-all">⋯</span><span className="lb">Barchasi</span>
          </button>
        </div>
      )}

      {/* "Bugungi tavsiya" banneri o'yin yoniq bo'lganda chiqmaydi (ega qarori 2026-08-02) —
          o'rnini yuqoridagi Koson hero-kartasi oladi; o'yin o'chirilsa banner avvalgidek qaytadi. */}
      {banner && !f.oyin && (
        <>
          <div className="nh-sh"><div className="t">🔥 Bugungi tavsiya</div></div>
          <button className="nh-promo" onClick={() => go(banner.target)}>
            <img src={apiUrl(banner.imageUrl)} alt="" loading="lazy" decoding="async" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
            <div className="pc"><span className="tag">{banner.badge ?? "Tavsiya"}</span><h3>{banner.title}</h3>{banner.subtitle && <p>{banner.subtitle}</p>}</div>
          </button>
        </>
      )}

      {feed === null ? (
        <>
          <div className="nh-sh"><div className="t">Sizga tavsiya</div></div>
          <div className="nh-bento">
            <div className="nh-bc tall"><div className="im nh-skel" style={{ minHeight: 168 }} /><div className="nh-bb"><div className="nh-skel" style={{ height: 14, marginBottom: 6 }} /><div className="nh-skel" style={{ height: 11, width: "60%" }} /></div></div>
            {[0, 1].map((i) => <div key={i} className="nh-bc"><div className="im nh-skel" /><div className="nh-bb"><div className="nh-skel" style={{ height: 14, marginBottom: 6 }} /><div className="nh-skel" style={{ height: 11, width: "50%" }} /></div></div>)}
          </div>
        </>
      ) : feed.length > 0 ? (
        <>
          <div className="nh-sh"><div className="t">Sizga tavsiya<small>🍽 Eng yaxshilari</small></div><button className="all" onClick={() => setHub(true)}>Barchasi</button></div>
          <div className="nh-bento">
            {feed.map((it, i) => (
              <button key={it.kind + it.id} className={`nh-bc${i === 0 ? " tall" : ""}`} onClick={() => go(it.target)}>
                <div className="im">
                  {it.photoUrl ? <img src={apiUrl(it.photoUrl)} alt="" loading="lazy" decoding="async" onError={(e) => ((e.target as HTMLImageElement).style.opacity = "0")} /> : <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40 }}>{it.kind === "product" ? "🛍" : "🍽"}</span>}
                  {it.badge && <span className={`nh-tg${it.badge === "top" ? " hot" : it.badge === "disc" ? " dc" : ""}`}>{badgeLabel(it.badge)}</span>}
                </div>
                <div className="nh-bb">
                  <div className="nm">{it.name}</div>
                  <div className="mt">{it.sub}{it.rating ? <> · <b>{it.rating.toFixed(1)}★</b></> : null}</div>
                  <div className="pr">
                    <span className="price">{it.priceLabel ? <>{it.oldPriceLabel ? <s style={{ color: "var(--nh-dim2)", fontWeight: 500, marginRight: 5 }}>{it.oldPriceLabel}</s> : null}{it.priceLabel}</> : "Buyurtma"}</span>
                    <span className="add">{it.kind === "product" ? "+" : "→"}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      ) : null}

      {!FOCUS_MODE && f.xizmatlar && ustas !== null && ustas.length > 0 && (
        <>
          <div className="nh-sh"><div className="t">🔧 Xizmatlar<small>Yaqin atrofdagi ustalar</small></div><button className="all" onClick={() => go("xizmat")}>Barchasi</button></div>
          <div className="nh-urow">
            {ustas.map((u) => (
              <button key={u.id} className="nh-ust" onClick={() => go("xizmat")}>
                <div className="nh-ust-im">
                  {u.hasPhoto ? (
                    <img src={apiUrl(`/api/services/photo/${u.id}?s=1`)} alt="" loading="lazy" decoding="async" onError={(e) => ((e.target as HTMLImageElement).style.opacity = "0")} />
                  ) : (
                    <span className="nh-ust-em">{u.categoryEmoji || "🔧"}</span>
                  )}
                  {u.inspTier && <span className="nh-ust-insp" title={`BirJoy tekshiruvi: ${INSP_TIER_LABEL[u.inspTier]}`}>{INSP_TIER_EMOJI[u.inspTier]}</span>}
                </div>
                <div className="nh-ust-b">
                  <div className="un">{u.name}</div>
                  <div className="um">{u.categoryName}</div>
                  {u.reviewCount > 0 ? <div className="ur">⭐ {u.avgRating.toFixed(1)} ({u.reviewCount})</div> : <div className="ur new">🆕 Yangi</div>}
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {!FOCUS_MODE && f.elonlar && elons !== null && elons.length > 0 && (
        <>
          <div className="nh-sh"><div className="t">📋 E'lonlar<small>Mahalladagi so'nggilari</small></div><button className="all" onClick={() => go("elonlar")}>Barchasi</button></div>
          <div className="nh-elist">
            {elons.map((a) => (
              <button key={a.id} className="nh-erow" onClick={() => go("elonlar")}>
                <div className="nh-eic">📋</div>
                <div className="nh-et"><div className="a">{a.title}</div><div className="b">{a.subtype} · {timeAgo(a.createdAt)}</div></div>
                <div className="nh-ep">{a.priceSom ? `${num(a.priceSom)} so'm` : "Kelishiladi"}</div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* O'yin yoniqda bu karta chiqmaydi: yuqoridagi o'yin-hero'si allaqachon do'st chaqiradi va
          kuchliroq sabab bilan ("do'sting yursa senga ball tushadi"). Ikkita bir xil CTA —
          ikkalasi ham zaiflashadi. O'yin o'chsa karta avvalgidek qaytadi. */}
      {!f.oyin && (
        <button className="nh-invite" onClick={() => go("invite")}>
          <span className="ii">👥</span>
          <span><b>Do'stni chaqir — pul ishla</b><small>Har do'st uchun bonus · birinchi safar bepul</small></span>
          <span className="ar">→</span>
        </button>
      )}

      {hub && <ServicesHub me={me} onNav={onNav} onClose={() => setHub(false)} onBanner={onBanner} />}
    </div>
  );
}

// "Barchasi xizmatlar" bottom-sheet hub — every vertical in one grid (flag-gated).
function ServicesHub({ me, onNav, onClose, onBanner }: { me: MeResponse; onNav: (t: string) => void; onClose: () => void; onBanner?: (msg: string) => void }) {
  const f = me.flags ?? {};
  const items = [
    { on: true, ic: "nh-i-o", em: "🚖", n: "Taxi", s: "Chaqirish", nav: "uy", locked: false },
    { on: !!f.oyin, ic: "nh-i-g", em: "🎮", n: "O'yin mavsumi", s: "Ball · sovrinlar", nav: "oyin", locked: false },
    { on: !!f.shop, ic: "nh-i-b", em: "🏪", n: "Do'kon", s: "Mahsulot xarid", nav: "dokon", locked: false },
    { on: !!f.restoran, ic: "nh-i-o", em: "🍽", n: "Restoran", s: "Taom yetkazish", nav: "restoran", locked: false },
    { on: !!f.xizmatlar, ic: "nh-i-v", em: "🔧", n: "Xizmatlar", s: FOCUS_MODE ? "🔒 Tez orada" : "Usta · master", nav: "xizmat", locked: FOCUS_MODE },
    { on: !!f.elonlar, ic: "nh-i-p", em: "📋", n: "E'lonlar", s: FOCUS_MODE ? "🔒 Tez orada" : "Mahalla taxtasi", nav: "elonlar", locked: FOCUS_MODE },
    { on: !!f.ravella, ic: "nh-i-r", em: "🎀", n: "Ravella", s: "Bayram bezaklari", nav: "ravella", locked: false },
    { on: !!f.intercity, ic: "nh-i-t", em: "🚐", n: "Yo'l", s: "Shaharlararo", nav: "yol", locked: false },
    { on: true, ic: "nh-i-g", em: "🎁", n: "Bonus", s: "O'yin · vazifa", nav: "play", locked: false },
    { on: true, ic: "nh-i-g", em: "🏆", n: "Reyting", s: "Liga · do'stlar", nav: "reyting", locked: false },
    { on: true, ic: "nh-i-t", em: "👛", n: "Hamyon", s: "Tanga · cashback", nav: "wallet", locked: false },
  ].filter((i) => i.on);
  const tap = (i: (typeof items)[number]) => {
    if (i.locked) { haptic(); onBanner?.(COMING_SOON_MSG); return; }
    haptic(); onClose(); onNav(i.nav);
  };
  return (
    <div className="nh-hub-scrim" onClick={onClose}>
      <div className="nh-hub" onClick={(e) => e.stopPropagation()}>
        <div className="nh-hub-grip" />
        <div className="nh-hub-h">Barchasi xizmatlar</div>
        <div className="nh-hub-grid">
          {items.map((i) => (
            <button key={i.n} className={`nh-hc${i.locked ? " locked" : ""}`} onClick={() => tap(i)}>
              <span className={`hi ${i.ic}`}>{i.em}{i.locked && <span className="soon-bd" aria-hidden="true">🔒</span>}</span>
              <div className="hn">{i.n}</div><div className="hs">{i.s}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
