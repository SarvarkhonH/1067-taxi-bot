// 🏠 "Uy" — the taxi-first home tab (default). Light + leaflet-free; the LivingHome map
// version is the flag-gated upgrade. Greeting + balance + taxi CTA + Bugun + quick tiles.
// NewUyView (feature "newhome", UY_REDESIGN Bosqich 1) = the premium super-app home below.
import { useEffect, useState } from "react";
import type { ClassifiedCard, HomeBanner, HomeFeedItem, MeResponse, SavedAddressView, ServiceListingCard } from "@t1067/shared";
import { INSP_TIER_EMOJI, INSP_TIER_LABEL } from "@t1067/shared";
import { api, apiUrl } from "./api";
import { haptic } from "./telegram";
import { BugunStripView } from "./wallet";
import { HomeGames } from "./homeGames";

export function UyView({ me, onBook, onNav, onBanner }: { me: MeResponse; onBook: () => void; onNav: (t: string) => void; onBanner?: (msg: string) => void }) {
  const [ready, setReady] = useState<number | null>(null);
  const [recent, setRecent] = useState<SavedAddressView[]>([]);
  const [dispatching, setDispatching] = useState<number | null>(null);
  useEffect(() => {
    api
      .missions()
      .then((m) => setReady([...m.daily, ...m.weekly].filter((x) => x.claimable).length))
      .catch(() => undefined);
    api.recentPickups().then(setRecent).catch(() => undefined);
  }, []);

  const repeatRoute = async (a: SavedAddressView) => {
    if (dispatching != null) return;
    haptic();
    setDispatching(a.id);
    try {
      const r = await api.bookingCreate({ pickupId: a.id, pickupName: a.name, lat: a.lat, lng: a.lng });
      if (r.ok && r.live) {
        onBook(); // real dispatch — open the live tracking overlay (Booking3View picks up the active ride)
      } else {
        onBanner?.(r.message ?? (r.ok ? `TEST — ${a.name}` : "Xatolik yuz berdi"));
      }
    } catch {
      onBanner?.("Xatolik yuz berdi — qayta urinib ko'ring");
    } finally {
      setDispatching(null);
    }
  };

  return (
    <div className="view uy-view">
      <div className="uy-hero">
        <div className="uy-greet">Assalomu alaykum, {me.member.fullName.split(" ")[0] || "do'stim"} 👋</div>
        <button className="uy-bal" onClick={() => { haptic(); onNav("wallet"); }} aria-label="Hamyonni ochish">
          <span className="uy-coin">🪙 {me.coins.toLocaleString("ru-RU")}</span>
          <span className="uy-cash">🚕 {me.stats.points.toLocaleString("ru-RU")} so'm cashback</span>
        </button>
      </div>
      <button className="book-cta-hero" onClick={() => { haptic(); onBook(); }}>🚖 Taxi chaqirish</button>
      {recent.length > 0 && (
        <div className="uy-repeat">
          <div className="uy-repeat-label">🔁 Yana shu yo'l</div>
          <div className="uy-repeat-row">
            {recent.map((a) => (
              <button key={a.id + a.name} className="uy-chip" disabled={dispatching != null} onClick={() => repeatRoute(a)}>
                {dispatching === a.id ? "..." : a.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {/* 🎁 invite — top-of-home so a client never hunts for it (was buried under Reyting) */}
      <button className="uy-invite" onClick={() => { haptic(); onNav("invite"); }}>
        <span className="uy-invite-ic">👥</span>
        <span className="uy-invite-txt">
          <b>Do'stni chaqir — pul ishla</b>
          <small>Har do'st uchun bonus · do'stingizga birinchi safar bepul</small>
        </span>
        <span className="uy-invite-arr">→</span>
      </button>
      <BugunStripView me={me} ready={ready} onNav={() => onNav("play")} />
      <div className="uy-tiles">
        <button className="uy-tile" onClick={() => { haptic(); onNav("wallet"); }}>👛<span>Hamyon</span></button>
        <button className="uy-tile" onClick={() => { haptic(); onNav("play"); }}>🎮<span>O'yin</span></button>
        <button className="uy-tile" onClick={() => { haptic(); onNav("market"); }}>🏪<span>Bozor</span></button>
        <button className="uy-tile" onClick={() => { haptic(); onNav("reyting"); }}>🏆<span>Reyting</span></button>
        <button className="uy-tile" onClick={() => { haptic(); onNav("history"); }}>📜<span>Tarix</span></button>
      </div>
      <HomeGames me={me} onBanner={onBanner} />
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
    { on: !!f.shop, ic: "nh-i-b", em: "🏪", lb: "Do'kon", nav: "dokon", locked: false },
    { on: !!f.restoran, ic: "nh-i-o", em: "🍽", lb: "Restoran", nav: "restoran", locked: false },
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

      {/* Taxi-kartasi olib tashlandi (ega qarori 2026-07-26) — chaqirish pastki paneldagi
          markaziy 🚕 tugmasi orqali, u har ekranda ko'rinib turadi. Ikkinchi nusxa shart emas. */}

      {(rail.length > 0) && (
        <div className="nh-rail">
          {rail.map((r) => (
            <button key={r.nav} className={`nh-svc${r.locked ? " locked" : ""}`} onClick={() => tapRail(r)}>
              <span className={`ic ${r.ic}`}>{r.em}{r.locked && <span className="soon-bd" aria-hidden="true">🔒</span>}</span>
              <span className="lb">{r.lb}</span>
            </button>
          ))}
          <button className="nh-svc" onClick={() => { haptic(); setHub(true); }}>
            <span className="ic nh-i-all">⋯</span><span className="lb">Barchasi</span>
          </button>
        </div>
      )}

      {banner && (
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

      <button className="nh-invite" onClick={() => go("invite")}>
        <span className="ii">👥</span>
        <span><b>Do'stni chaqir — pul ishla</b><small>Har do'st uchun bonus · birinchi safar bepul</small></span>
        <span className="ar">→</span>
      </button>

      {hub && <ServicesHub me={me} onNav={onNav} onClose={() => setHub(false)} onBanner={onBanner} />}
    </div>
  );
}

// "Barchasi xizmatlar" bottom-sheet hub — every vertical in one grid (flag-gated).
function ServicesHub({ me, onNav, onClose, onBanner }: { me: MeResponse; onNav: (t: string) => void; onClose: () => void; onBanner?: (msg: string) => void }) {
  const f = me.flags ?? {};
  const items = [
    { on: true, ic: "nh-i-o", em: "🚖", n: "Taxi", s: "Chaqirish", nav: "uy", locked: false },
    { on: !!f.shop, ic: "nh-i-b", em: "🏪", n: "Do'kon", s: "Mahsulot xarid", nav: "dokon", locked: false },
    { on: !!f.restoran, ic: "nh-i-o", em: "🍽", n: "Restoran", s: "Taom yetkazish", nav: "restoran", locked: false },
    { on: !!f.xizmatlar, ic: "nh-i-v", em: "🔧", n: "Xizmatlar", s: FOCUS_MODE ? "🔒 Tez orada" : "Usta · master", nav: "xizmat", locked: FOCUS_MODE },
    { on: !!f.elonlar, ic: "nh-i-p", em: "📋", n: "E'lonlar", s: FOCUS_MODE ? "🔒 Tez orada" : "Mahalla taxtasi", nav: "elonlar", locked: FOCUS_MODE },
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
