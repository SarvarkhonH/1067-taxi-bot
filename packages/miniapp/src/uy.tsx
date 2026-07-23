// 🏠 "Uy" — the taxi-first home tab (default). Light + leaflet-free; the LivingHome map
// version is the flag-gated upgrade. Greeting + balance + taxi CTA + Bugun + quick tiles.
// NewUyView (feature "newhome", UY_REDESIGN Bosqich 1) = the premium super-app home below.
import { useEffect, useState } from "react";
import type { HomeBanner, HomeFeedItem, MeResponse, SavedAddressView } from "@t1067/shared";
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

export function NewUyView({ me, onBook, onNav }: { me: MeResponse; onBook: () => void; onNav: (t: string) => void; onBanner?: (msg: string) => void }) {
  const [feed, setFeed] = useState<HomeFeedItem[] | null>(null);
  const [banner, setBanner] = useState<HomeBanner | null>(null);
  const [hub, setHub] = useState(false);
  const f = me.flags ?? {};

  useEffect(() => {
    let alive = true;
    api.homeFeed()
      .then((r) => { if (alive) { setFeed(r.items); setBanner(r.banner); } })
      .catch(() => { if (alive) setFeed([]); });
    return () => { alive = false; };
  }, []);

  const rail = [
    { on: !!f.shop, ic: "nh-i-b", em: "🏪", lb: "Do'kon", nav: "dokon" },
    { on: !!f.restoran, ic: "nh-i-o", em: "🍽", lb: "Restoran", nav: "restoran" },
    { on: !!f.intercity, ic: "nh-i-t", em: "🚐", lb: "Yo'l", nav: "yol" },
    { on: !!f.xizmatlar, ic: "nh-i-v", em: "🔧", lb: "Xizmat", nav: "xizmat" },
    { on: !!f.elonlar, ic: "nh-i-p", em: "📋", lb: "E'lon", nav: "elonlar" },
    { on: true, ic: "nh-i-g", em: "🎁", lb: "Bonus", nav: "play" },
  ].filter((r) => r.on);

  const go = (t: string) => { haptic(); onNav(t); };
  const badgeLabel = (b?: string) => (b === "top" ? "🔥 TOP" : b === "new" ? "Yangi" : b === "disc" ? "Chegirma" : "");

  return (
    <div className="nh-view">
      <div className="nh-topbar">
        <div className="nh-brand">Bir<b>Joy</b></div>
        <button className="nh-coin" onClick={() => go("wallet")} aria-label="Hamyon">🪙 {num(me.coins)}</button>
      </div>

      <button className="nh-search" onClick={() => (f.shop ? go("dokon") : setHub(true))}>
        <span>🔍</span><span className="ph">Taom, mahsulot yoki xizmat qidiring…</span>
      </button>

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

      <button className="nh-taxi" onClick={() => { haptic(); onBook(); }}>
        <span className="i">🚖</span>
        <span><b>Taxi chaqirish</b><small>Bir tap bilan — yaqin mashina</small></span>
        <span className="go">→</span>
      </button>

      {(rail.length > 0) && (
        <div className="nh-rail">
          {rail.map((r) => (
            <button key={r.nav} className="nh-svc" onClick={() => go(r.nav)}>
              <span className={`ic ${r.ic}`}>{r.em}</span><span className="lb">{r.lb}</span>
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
                  {it.photoUrl ? <img src={apiUrl(it.photoUrl)} alt="" loading="lazy" decoding="async" onError={(e) => ((e.target as HTMLImageElement).style.opacity = "0")} /> : <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40 }}>{it.kind === "restaurant" ? "🍽" : "🛍"}</span>}
                  {it.badge && <span className={`nh-tg${it.badge === "top" ? " hot" : it.badge === "disc" ? " dc" : ""}`}>{badgeLabel(it.badge)}</span>}
                </div>
                <div className="nh-bb">
                  <div className="nm">{it.name}</div>
                  <div className="mt">{it.sub}{it.rating ? <> · <b>{it.rating.toFixed(1)}★</b></> : null}</div>
                  <div className="pr">
                    <span className="price">{it.priceLabel ? <>{it.oldPriceLabel ? <s style={{ color: "var(--nh-dim2)", fontWeight: 500, marginRight: 5 }}>{it.oldPriceLabel}</s> : null}{it.priceLabel} 🪙</> : "Buyurtma"}</span>
                    <span className="add">{it.kind === "product" ? "+" : "→"}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      ) : null}

      <button className="nh-invite" onClick={() => go("invite")}>
        <span className="ii">👥</span>
        <span><b>Do'stni chaqir — pul ishla</b><small>Har do'st uchun bonus · birinchi safar bepul</small></span>
        <span className="ar">→</span>
      </button>

      {hub && <ServicesHub me={me} onNav={onNav} onClose={() => setHub(false)} />}
    </div>
  );
}

// "Barchasi xizmatlar" bottom-sheet hub — every vertical in one grid (flag-gated).
function ServicesHub({ me, onNav, onClose }: { me: MeResponse; onNav: (t: string) => void; onClose: () => void }) {
  const f = me.flags ?? {};
  const items = [
    { on: true, ic: "nh-i-o", em: "🚖", n: "Taxi", s: "Chaqirish", nav: "uy" },
    { on: !!f.shop, ic: "nh-i-b", em: "🏪", n: "Do'kon", s: "Mahsulot xarid", nav: "dokon" },
    { on: !!f.restoran, ic: "nh-i-o", em: "🍽", n: "Restoran", s: "Taom yetkazish", nav: "restoran" },
    { on: !!f.xizmatlar, ic: "nh-i-v", em: "🔧", n: "Xizmatlar", s: "Usta · master", nav: "xizmat" },
    { on: !!f.elonlar, ic: "nh-i-p", em: "📋", n: "E'lonlar", s: "Mahalla taxtasi", nav: "elonlar" },
    { on: !!f.intercity, ic: "nh-i-t", em: "🚐", n: "Yo'l", s: "Shaharlararo", nav: "yol" },
    { on: true, ic: "nh-i-g", em: "🎁", n: "Bonus", s: "O'yin · vazifa", nav: "play" },
    { on: true, ic: "nh-i-g", em: "🏆", n: "Reyting", s: "Liga · do'stlar", nav: "reyting" },
    { on: true, ic: "nh-i-t", em: "👛", n: "Hamyon", s: "Tanga · cashback", nav: "wallet" },
  ].filter((i) => i.on);
  const go = (t: string) => { haptic(); onClose(); onNav(t); };
  return (
    <div className="nh-hub-scrim" onClick={onClose}>
      <div className="nh-hub" onClick={(e) => e.stopPropagation()}>
        <div className="nh-hub-grip" />
        <div className="nh-hub-h">Barchasi xizmatlar</div>
        <div className="nh-hub-grid">
          {items.map((i) => (
            <button key={i.n} className="nh-hc" onClick={() => go(i.nav)}>
              <span className={`hi ${i.ic}`}>{i.em}</span>
              <div className="hn">{i.n}</div><div className="hs">{i.s}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
