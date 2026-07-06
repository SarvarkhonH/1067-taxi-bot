import { Suspense, lazy, useEffect, useState } from "react";

const DesignDemo = lazy(() => import("./design/demo")); // #demo dagina yuklanadi
import type { LeaderboardResponse, MeResponse } from "@t1067/shared";
import { api, getInitData, waitForInitData } from "./api";
import { haptic, tg } from "./telegram";
import { LeaderboardView, LoadError, MissionsView, ReferralView, RideHistoryView, Spinner } from "./components";
import { AccountCard, TierLadder, TierLadderCompact, WalletView } from "./wallet"; // bosh tab — eager (birinchi paint)
import { UyView } from "./uy"; // Uy tabi — yengil (leaflet-siz), eager
// T2 (AUDIT 2.9): boshqa tablar lazy — har biri alohida chunk, asosiy bundle kichrayadi
const RewardsView = lazy(() => import("./rewards").then((m) => ({ default: m.RewardsView })));
const DriverView = lazy(() => import("./driver").then((m) => ({ default: m.DriverView })));
// T4: Booking 3.0 (MapLibre) — internally falls back to classic Leaflet if feature:booking3 OFF
const Booking3View = lazy(() => import("./booking3").then((m) => ({ default: m.Booking3View })));
// V1: living AI home — lazy (loads Leaflet); shown on the home tab when feature:livinghome ON
const LivingHome = lazy(() => import("./home").then((m) => ({ default: m.LivingHome })));
// 🚐 Yo'l — nationwide intercity seat booking (gated by feature `intercity`)
const IntercityView = lazy(() => import("./intercity").then((m) => ({ default: m.IntercityView })));
// 🛍 Do'kon — tanga shop (gated by feature `shop`; owner-preview while DARK)
const ShopView = lazy(() => import("./shop").then((m) => ({ default: m.ShopView })));
// 🔎 Xizmatlar — Koson services directory (gated by feature `xizmatlar`; owner-preview while DARK)
const XizmatlarView = lazy(() => import("./services").then((m) => ({ default: m.XizmatlarView })));
// 📋 E'lonlar — mahalla e'lon taxtasi (gated by feature `elonlar`; owner-preview while DARK)
const ElonlarView = lazy(() => import("./elonlar").then((m) => ({ default: m.ElonlarView })));
import { Icon } from "./icons";
import { useCountUp } from "./util";

type Tab = "uy" | "wallet" | "play" | "reyting" | "yol" | "dokon" | "xizmat" | "elonlar" | "driver" | "profile";

// ── `me` stale-while-revalidate cache (instant repeat opens, hides cold-start) ──
// Keyed by the Telegram user id so a shared device never shows one user another's cached data.
function meCacheKey(): string {
  const uid = (tg as unknown as { initDataUnsafe?: { user?: { id?: number } } })?.initDataUnsafe?.user?.id ?? "dev";
  return `me_v2_${uid}`;
}
function readMeCache(): MeResponse | null {
  try {
    const s = localStorage.getItem(meCacheKey());
    if (!s) return null;
    const m = JSON.parse(s) as Partial<MeResponse>;
    // shape guard: an OLD/partial cache (different MeResponse shape from a previous deploy) must NOT
    // hydrate — child views would crash on a missing field → white screen. If it doesn't carry the
    // essentials, ignore it and fall back to the normal fetch (BootSplash).
    if (!m || typeof m !== "object" || !m.member || !m.stats || !m.level || typeof m.coins !== "number" || !m.type || !m.metricLabel) {
      return null;
    }
    return m as MeResponse;
  } catch {
    return null;
  }
}
function writeMeCache(m: MeResponse): void {
  try {
    localStorage.setItem(meCacheKey(), JSON.stringify(m));
  } catch {
    /* private mode / quota — fine, just no cache */
  }
}
function clearMeCache(): void {
  try {
    localStorage.removeItem(meCacheKey());
  } catch {
    /* ignore */
  }
}

// 4 aniq tab: Uy (taxi-first) · Hamyon (pul) · O'yin (bonus+vazifa) · Reyting (liga+do'st).
// `intercity` ON bo'lsa Yo'l 5-tab sifatida qo'shiladi (pastda swapForYol).
// O'yin + Yo'l pastki bardan olindi — ularning o'rnini Do'kon + Xizmatlar egalladi. O'yin ekrani
// uy tugmasidan / deep-link'dan hali ham ochiladi (faqat tabbar'dan yo'q).
const BASE_TABS: { id: Tab; icon: string; label: string }[] = [
  { id: "uy", icon: "home", label: "Uy" },
  { id: "wallet", icon: "wallet", label: "Hamyon" },
  { id: "reyting", icon: "league", label: "Reyting" },
];
// drivers keep their earnings hub
const DRIVER_TABS: { id: Tab; icon: string; label: string }[] = [
  { id: "uy", icon: "home", label: "Uy" },
  { id: "wallet", icon: "wallet", label: "Hamyon" },
  { id: "driver", icon: "car", label: "Daromad" },
  { id: "reyting", icon: "league", label: "Reyting" },
];
// old deep-link / child-nav targets → new tabs (so cached bot menus + components still work)
const GO_MAP: Record<string, Tab> = {
  home: "uy", uy: "uy", wallet: "wallet", hamyon: "wallet",
  tip: "wallet", paydriver: "wallet", pay: "wallet", // 🙏 «Haydovchiga to'lash» → hamyon ekrani; wallet.tsx avto-ochadi pay-driver sheet'ni
  rewards: "play", missions: "play", play: "play", bonus: "play", vazifa: "play",
  market: "dokon", bozor: "dokon", dokon: "dokon", shop: "dokon", // 🛍 do'kon (flag off bo'lsa App tab-guard Uy'ga tushiradi)
  xizmat: "xizmat", xizmatlar: "xizmat", services: "xizmat", usta: "xizmat", // 🔎 xizmatlar katalogi
  league: "reyting", friends: "reyting", reyting: "reyting", liga: "reyting", dost: "reyting",
  yol: "yol", intercity: "yol", reys: "yol", // 🚐 shaharlararo
  elonlar: "elonlar", elon: "elonlar", elonlash: "elonlar", // 📋 mahalla e'lon taxtasi
  driver: "driver", profile: "profile",
};

// Deep-link target from the bot: ?go=<tab|book> (query) or start_param. The bot menu
// buttons open the Mini App straight on the matching screen.
function readGo(): string {
  try {
    const sp = (tg as { initDataUnsafe?: { start_param?: string } } | undefined)?.initDataUnsafe?.start_param;
    return new URLSearchParams(location.search).get("go") || sp || "";
  } catch {
    return "";
  }
}

// 🛍 shared-product deep-link: the bot's "🛍 Ochish" button opens the Mini App with ?go=dokon&p=<id>
// (constructed server-side, not via start_param) — read once so ShopView can auto-open that item.
function readDeepProduct(): number | null {
  try {
    const v = new URLSearchParams(location.search).get("p");
    const n = v ? Number(v) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function App() {
  if (window.location.hash === "#demo") {
    return (
      <Suspense fallback={<div className="boot"><div className="boot-logo">🎨</div></div>}>
        <DesignDemo />
      </Suspense>
    );
  }
  // Stale-while-revalidate: hydrate `me` from the last cached payload so a repeat open renders the
  // app INSTANTLY (no BootSplash, no cold-start wait) and the real data refreshes in the background.
  const cachedMe = readMeCache();
  const [me, setMe] = useState<MeResponse | null>(cachedMe);
  const [linked, setLinked] = useState<boolean | null>(cachedMe ? true : null);
  // Deep-link: a bot-menu button opens the Mini App with ?go=<tab|book> → land straight
  // on that screen (booking flow / the matching tab), not always the home tab.
  const [tab, setTab] = useState<Tab>(() => GO_MAP[readGo()] ?? "uy");
  const [board, setBoard] = useState<LeaderboardResponse | null>(null);
  const [boardErr, setBoardErr] = useState(false);
  const [livinghome, setLivinghome] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ id: number; msg: string } | null>(null);
  const [booking, setBooking] = useState(() => readGo() === "book");
  const [invite, setInvite] = useState(() => readGo() === "invite"); // 🎁 invite overlay (one-tap from home / ?go=invite)
  const [history, setHistory] = useState(() => readGo() === "history"); // 📜 ride-history overlay
  const [deepProduct] = useState(() => readDeepProduct()); // 🛍 auto-open a shared product once
  const coins = useCountUp(me?.coins ?? 0);
  // WOW-1: balans oshganda tanga ikonkasi sakraydi
  const [coinBounce, setCoinBounce] = useState(false);
  const [prevCoins, setPrevCoins] = useState<number | null>(null);
  useEffect(() => {
    if (me && prevCoins !== null && me.coins > prevCoins) {
      setCoinBounce(true);
      const t = setTimeout(() => setCoinBounce(false), 560);
      setPrevCoins(me.coins);
      return () => clearTimeout(t);
    }
    if (me) setPrevCoins(me.coins);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.coins]);

  const loadBoard = () => {
    setBoardErr(false);
    api.leaderboard().then(setBoard).catch(() => setBoardErr(true));
  };
  // track whether the leaderboard has been requested yet (defer until first Reyting visit)
  const [boardRequested, setBoardRequested] = useState(() => {
    const initial = GO_MAP[readGo()] ?? "uy";
    return initial === "reyting";
  });

  useEffect(() => {
    if (boardRequested) loadBoard(); // deep-linked to reyting
    // Some Telegram clients (Web Z, Desktop) populate initData a few hundred ms AFTER the WebView
    // opens — firing /api/me immediately would race into a 401 ("Telegram orqali oching"). Wait
    // for initData first (up to ~2.5s); if Telegram never fills it, proceed anyway and let the
    // server's normal auth response decide.
    waitForInitData()
      .then(() => api.me())
      .then((r) => {
        if ("linked" in r && r.linked === false) {
          clearMeCache();
          setLinked(false);
        } else {
          const me = r as MeResponse;
          setMe(me);
          writeMeCache(me);
          setLinked(true);
          // flags piggy-backed on /api/me — no separate bookingInfo call needed
          if (me.flags) {
            setLivinghome(!!me.flags.livinghome);
          }
        }
      })
      .catch((e) => {
        if (!cachedMe) setError(String(e));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ⚡ Do'kon issiq start: tab lazy chunk + mahsulot ro'yxati BO'SH VAQTDA oldindan yuklanadi —
  // birinchi bosishda spinner+network kutish yo'q, tab bir zumda ochiladi (ega: "sekin chiqib tushadi").
  const shopOn = !!me?.flags?.shop;
  useEffect(() => {
    if (!shopOn) return;
    const w = window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void };
    const idle = (cb: () => void) => (w.requestIdleCallback ? w.requestIdleCallback(cb, { timeout: 3000 }) : setTimeout(cb, 1500));
    idle(() => { import("./shop").then((m) => m.prefetchShopProducts()).catch(() => undefined); });
  }, [shopOn]);

  // ⚡ Xizmatlar issiq start (shop bilan bir xil): chunk + katalog datasi idle'da isitiladi —
  // birinchi bosishda skeleton YO'Q, tab bir zumda ochiladi.
  const xizmatlarOn = !!me?.flags?.xizmatlar;
  useEffect(() => {
    if (!xizmatlarOn) return;
    const w = window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void };
    const idle = (cb: () => void) => (w.requestIdleCallback ? w.requestIdleCallback(cb, { timeout: 3000 }) : setTimeout(cb, 1500));
    idle(() => { import("./services").then((m) => m.prefetchServiceData()).catch(() => undefined); });
  }, [xizmatlarOn]);

  // ⚡ E'lonlar issiq start (shop/xizmatlar bilan bir xil naqsh) — birinchi bosishda skeleton YO'Q.
  const elonlarOn = !!me?.flags?.elonlar;
  useEffect(() => {
    if (!elonlarOn) return;
    const w = window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void };
    const idle = (cb: () => void) => (w.requestIdleCallback ? w.requestIdleCallback(cb, { timeout: 3000 }) : setTimeout(cb, 1500));
    idle(() => { import("./elonlar").then((m) => m.prefetchElonlarAds()).catch(() => undefined); });
  }, [elonlarOn]);

  const reload = () => {
    api
      .me()
      .then((r) => {
        if (!("linked" in r && r.linked === false)) {
          setMe(r as MeResponse);
          writeMeCache(r as MeResponse);
        }
      })
      .catch(() => undefined);
  };

  if (error) return <ErrorScreen error={error} />;
  if (linked === null) return <BootSplash />;
  if (linked === false) return <NotLinked />;
  if (!me) return <BootSplash />;
  if (booking) return <Suspense fallback={<BootSplash />}><Booking3View me={me} onClose={() => setBooking(false)} /></Suspense>;
  if (invite) return <div className="app"><main className="content"><ReferralView onClose={() => setInvite(false)} /></main></div>;
  if (history) return <div className="app"><main className="content"><RideHistoryView onClose={() => setHistory(false)} /></main></div>;

  const go = (t: Tab) => {
    if (t === "dokon" && !me.flags?.shop) t = "uy"; // 🛍 deep-link guard: shop dark → land home
    if (t === "xizmat" && !me.flags?.xizmatlar) t = "uy"; // 🔎 deep-link guard: xizmatlar dark → land home
    if (t === "elonlar" && !me.flags?.elonlar) t = "reyting"; // 📋 deep-link guard: elonlar dark → land on Reyting (its old slot)
    if (t === tab) return;
    haptic();
    setTab(t);
    if (t === "reyting" && !boardRequested) {
      setBoardRequested(true);
      loadBoard();
    }
  };
  // child components nav by string label (incl. old names) → map to the 5 tabs
  const nav = (t: string) => {
    if (t === "invite") { haptic(); setInvite(true); return; } // 🎁 open invite overlay directly
    if (t === "history") { haptic(); setHistory(true); return; } // 📜 open ride-history overlay
    go(GO_MAP[t] ?? "uy");
  };

  const flash = (msg: string) => {
    haptic();
    setToast({ id: Date.now(), msg });
    reload();
    setTimeout(() => setToast((c) => (c && Date.now() - c.id >= 3500 ? null : c)), 3600);
  };

  // Pastki bar: Uy · Hamyon · (Daromad drayver) · Do'kon · Xizmatlar · Reyting.
  const hasShop = !!me.flags?.shop;
  const DOKON_TAB = { id: "dokon" as Tab, icon: "market", label: "Do'kon" };
  let TABS = me.type === "driver" ? DRIVER_TABS : BASE_TABS;
  // 🛍 Do'kon (feature "shop"): HAR ikkala tip uchun Reyting'dan OLDIN qo'shiladi (max 6 tab).
  if (hasShop) {
    const ri = TABS.findIndex((t) => t.id === "reyting");
    TABS = ri >= 0 ? [...TABS.slice(0, ri), DOKON_TAB, ...TABS.slice(ri)] : [...TABS, DOKON_TAB];
  }
  // 🔎 Xizmatlar (feature "xizmatlar"): Reyting'dan OLDIN — katalog kirish nuqtasi doim ko'z oldida.
  if (me.flags?.xizmatlar) {
    const XIZMAT_TAB = { id: "xizmat" as Tab, icon: "search", label: "Xizmatlar" };
    const ri = TABS.findIndex((t) => t.id === "reyting");
    TABS = ri >= 0 ? [...TABS.slice(0, ri), XIZMAT_TAB, ...TABS.slice(ri)] : [...TABS, XIZMAT_TAB];
  }
  // 📋 E'lonlar (feature "elonlar", E1): flag ON bo'lsa Reyting'ning tabbar o'rnini egallaydi —
  // Reyting ekrani o'zi o'chmaydi, faqat kirish nuqtasi uy tugmasiga ko'chadi (home.tsx/uy.tsx +
  // GO_MAP orqali hali ham ochiladi). Flag OFF bo'lsa tabbar ESKIcha (Reyting joyida) qoladi.
  if (me.flags?.elonlar) {
    const ELONLAR_TAB = { id: "elonlar" as Tab, icon: "board", label: "E'lonlar" };
    TABS = TABS.map((t) => (t.id === "reyting" ? ELONLAR_TAB : t));
  }
  const TAB_PCT = 100 / TABS.length;
  const activeIndex = TABS.findIndex((t) => t.id === tab);

  return (
    <div className={tab === "dokon" ? "app shop-light" : tab === "elonlar" ? "app elonlar-light" : "app"}>
      <div className="aurora" />
      <header className="topbar">
        <div className="brand">
          <span className="brand-badge">🚕</span>
          <span className="brand-name">1067<b>TAXI</b></span>
          <span className="build-ver">v15 ✨</span>
        </div>
        <div className="topbar-right">
          <div className="coin-pill">
            <span className={"coin-dot" + (coinBounce ? " d-coin-bounce" : "")}>🪙</span>
            {Math.round(coins).toLocaleString("ru-RU")}
          </div>
          <button
            className="profile-av"
            onClick={() => { haptic(); setTab("profile"); }}
            aria-label="Hisobim & sozlamalar"
            style={{ ["--lvl" as string]: me.level?.color || "var(--brand)" }}
          >
            <span className="profile-av-ring" />
            <span className="profile-av-core">
              {(me.member.fullName || "").trim().charAt(0).toUpperCase() || "🙂"}
            </span>
            {me.level?.emoji && <span className="profile-av-lvl">{me.level.emoji}</span>}
          </button>
        </div>
      </header>

      {toast && (
        <div className="toast" key={toast.id} onClick={() => setToast(null)}>
          {toast.msg}
        </div>
      )}

      <main className="content">
        <div className="page" key={tab}>
          <Suspense fallback={<Spinner />}>
            {tab === "uy" &&
              (livinghome ? (
                <LivingHome me={me} onBanner={flash} reload={reload} onBook={() => { haptic(); setBooking(true); }} onNav={nav} />
              ) : (
                <UyView me={me} onBook={() => { haptic(); setBooking(true); }} onNav={nav} />
              ))}
            {tab === "wallet" && <WalletView me={me} onBanner={flash} reload={reload} onBook={() => { haptic(); setBooking(true); }} onNav={nav} />}
            {tab === "play" && (
              <>
                <TierLadder me={me} />
                <RewardsView me={me} onReward={flash} />
                <MissionsView onReward={flash} />
              </>
            )}
            {tab === "reyting" &&
              (board ? (
                <>
                  <LeaderboardView board={board} />
                  <ReferralView />
                </>
              ) : boardErr ? (
                <LoadError onRetry={loadBoard} />
              ) : (
                <Spinner />
              ))}
            {tab === "yol" && <IntercityView me={me} />}
            {tab === "dokon" && <ShopView me={me} onBanner={flash} reload={reload} onBook={() => { haptic(); setBooking(true); }} openProductId={deepProduct} />}
            {tab === "xizmat" && <XizmatlarView me={me} onBanner={flash} />}
            {tab === "elonlar" && <ElonlarView me={me} onBanner={flash} reload={reload} />}
            {tab === "driver" && <DriverView me={me} />}
            {tab === "profile" && (
              <div className="view">
                <TierLadderCompact me={me} onOpen={() => go("play")} />
                <AccountCard />
                <button className="rh-open-btn" onClick={() => { haptic(); setHistory(true); }}>
                  <span className="rh-open-ico">📜</span>
                  <span className="rh-open-txt"><b>Safarlar tarixi</b><small>Har safar: km · daqiqa · narx · cashback</small></span>
                  <span className="rh-open-chev">›</span>
                </button>
              </div>
            )}
          </Suspense>
        </div>
      </main>

      <nav className="tabbar">
        <span className="tab-ind" ref={(el) => el?.style.setProperty("left", `calc(${activeIndex} * ${TAB_PCT}% + ${TAB_PCT / 2}%)`)} />
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? "tab active" : "tab"}
            onClick={() => go(t.id)}
          >
            <Icon name={t.icon} filled={tab === t.id} size={23} />
            <span className="tab-label">{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

function BootSplash() {
  return (
    <div className="boot">
      <div className="aurora" />
      <div className="boot-stage">
        <div className="boot-rings"><span /><span /><span /></div>
        <div className="boot-badge">🚕</div>
      </div>
      <div className="boot-name">1067 <b>TAXI</b></div>
      <div className="boot-tag">Chaqiring · Tejang · Bonus yig'ing</div>
      <div className="boot-bar"><span /></div>
    </div>
  );
}

function ErrorScreen({ error }: { error: string }) {
  const notAuthed = error.includes("unauthorized");
  // 4-shart: internet yo'qmi yoki server uyg'onyaptimi — ALOHIDA ekranlar
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  useEffect(() => {
    if (notAuthed) return;
    const t = setTimeout(() => location.reload(), 12_000); // server-uyg'onish: avto-retry
    return () => clearTimeout(t);
  }, [notAuthed]);
  if (!notAuthed && !online) {
    return (
      <div className="screen center">
        <div className="aurora" />
        <div className="nl-card glass pad tac">
          <div className="nl-emoji">📡</div>
          <h2>Internet aloqasi yo'q</h2>
          <p className="muted">Tarmoqqa ulanib, qayta urinib ko'ring.</p>
          <button className="d-btn mt8" onClick={() => location.reload()}>🔄 Qayta urinish</button>
        </div>
      </div>
    );
  }
  if (!notAuthed) {
    return (
      <div className="screen center">
        <div className="aurora" />
        <div className="nl-card glass pad tac">
          <div className="boot-stage" style={{ margin: "4px auto 18px" }}>
            <div className="boot-rings"><span /><span /><span /></div>
            <div className="boot-badge">🚕</div>
          </div>
          <h2>1067 uyg'onmoqda…</h2>
          <p className="muted">Server bir necha soniyada tayyor bo'ladi — avtomatik qayta ulanamiz.</p>
          <div className="boot-bar" style={{ margin: "18px auto 0" }}><span /></div>
          <button className="d-btn ghost mt12" onClick={() => location.reload()}>Hozir urinish</button>
        </div>
      </div>
    );
  }
  const initData = getInitData();
  return (
    <div className="screen center">
      <div className="aurora" />
      <div className="nl-card glass pad">
        <div className="nl-emoji">{notAuthed ? "🤖" : "😴"}</div>
        <h2>{notAuthed ? "Telegram orqali oching" : "Server uyg'onmoqda"}</h2>
        <p className="muted">
          {notAuthed
            ? "Mini App'ni botdagi pastki ⊞ menyu yoki «🚀 Ilova» tugmasi orqali oching — havolani brauzerda emas."
            : "Server biroz uxlab qoldi. Bir necha soniya kuting va qayta urinib ko'ring."}
        </p>
        <button className="btn-primary" onClick={() => location.reload()}>🔄 Qayta urinish</button>
        {notAuthed && (
          <p className="muted fs11 mt12 o55" style={{ textAlign: "left", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
            {`Telegram: ${tg ? "✓" : "✗"} · initData: ${initData ? `✓ (${initData.length})` : "✗ yo'q"}\n` +
              `tg.initData: ${tg?.initData ? `✓ (${tg.initData.length})` : "✗"}\n` +
              `URL hash: ${location.hash ? `✓ (${location.hash.length})` : "✗"}\n` +
              `sessionStorage tg:initData: ${(() => { try { return sessionStorage.getItem("tg:initData") ? "✓" : "✗"; } catch { return "blocked"; } })()}\n` +
              `URL: ${location.href.length > 80 ? location.href.slice(0, 80) + "…" : location.href}`}
          </p>
        )}
      </div>
    </div>
  );
}

function NotLinked() {
  return (
    <div className="screen center">
      <div className="aurora" />
      <div className="nl-card glass pad">
        <div className="nl-emoji">🔗</div>
        <h2>Akkaunt bog'lanmagan</h2>
        <p className="muted">Ma'lumotlaringizni ko'rish uchun Telegram botga kiring va telefon raqamingizni ulashing.</p>
      </div>
    </div>
  );
}
