import { Suspense, lazy, useEffect, useState } from "react";

const DesignDemo = lazy(() => import("./design/demo")); // #demo dagina yuklanadi
import type { LeaderboardResponse, MeResponse } from "@t1067/shared";
import { api, getInitData } from "./api";
import { haptic, tg } from "./telegram";
import { LeaderboardView, LoadError, MahallaSection, MissionsView, ReferralView, Spinner } from "./components";
import { AccountCard, WalletView } from "./wallet"; // bosh tab — eager (birinchi paint)
import { UyView } from "./uy"; // Uy tabi — yengil (leaflet-siz), eager
// T2 (AUDIT 2.9): boshqa tablar lazy — har biri alohida chunk, asosiy bundle kichrayadi
const RewardsView = lazy(() => import("./rewards").then((m) => ({ default: m.RewardsView })));
const MarketView = lazy(() => import("./market").then((m) => ({ default: m.MarketView })));
const DriverView = lazy(() => import("./driver").then((m) => ({ default: m.DriverView })));
// T4: Booking 3.0 (MapLibre) — internally falls back to classic Leaflet if feature:booking3 OFF
const Booking3View = lazy(() => import("./booking3").then((m) => ({ default: m.Booking3View })));
// V1: living AI home — lazy (loads Leaflet); shown on the home tab when feature:livinghome ON
const LivingHome = lazy(() => import("./home").then((m) => ({ default: m.LivingHome })));
// V4: Yashil to'lqin skill game — lazy; launched from a FAB when feature:tolqin ON
const TolqinGame = lazy(() => import("./tolqin").then((m) => ({ default: m.TolqinGame })));
// 🏆 GARAJ v2: the new full-screen restoration game — lazy; opens when feature "garajx" ON
const GarajShell = lazy(() => import("./garaj").then((m) => ({ default: m.GarajShell })));
const GarajDemo = lazy(() => import("./garaj").then((m) => ({ default: m.GarajDemo })));
const GarajMarketView = lazy(() => import("./garaj").then((m) => ({ default: m.GarajMarketView })));
const GarajCollectionSheet = lazy(() => import("./garaj").then((m) => ({ default: m.GarajCollectionSheet })));
import { Icon } from "./icons";
import { useCountUp } from "./util";

type Tab = "uy" | "wallet" | "play" | "market" | "reyting" | "driver" | "profile";

// 5 aniq tab: Uy (taxi-first) · Hamyon (pul) · O'yin (bonus+vazifa) · Bozor · Reyting (liga+do'st)
const BASE_TABS: { id: Tab; icon: string; label: string }[] = [
  { id: "uy", icon: "home", label: "Uy" },
  { id: "wallet", icon: "wallet", label: "Hamyon" },
  { id: "play", icon: "games", label: "O'yin" },
  { id: "market", icon: "market", label: "Bozor" },
  { id: "reyting", icon: "league", label: "Reyting" },
];
// drivers swap Bozor for their earnings hub
const DRIVER_TABS: { id: Tab; icon: string; label: string }[] = [
  { id: "uy", icon: "home", label: "Uy" },
  { id: "wallet", icon: "wallet", label: "Hamyon" },
  { id: "driver", icon: "car", label: "Daromad" },
  { id: "play", icon: "games", label: "O'yin" },
  { id: "reyting", icon: "league", label: "Reyting" },
];
// old deep-link / child-nav targets → new tabs (so cached bot menus + components still work)
const GO_MAP: Record<string, Tab> = {
  home: "uy", uy: "uy", wallet: "wallet", hamyon: "wallet",
  rewards: "play", missions: "play", play: "play", bonus: "play", vazifa: "play",
  market: "market", bozor: "market",
  league: "reyting", friends: "reyting", reyting: "reyting", liga: "reyting", dost: "reyting",
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

export function App() {
  if (window.location.hash === "#demo") {
    return (
      <Suspense fallback={<div className="boot"><div className="boot-logo">🎨</div></div>}>
        <DesignDemo />
      </Suspense>
    );
  }
  if (window.location.hash === "#garajdemo") {
    return (
      <Suspense fallback={<div className="boot"><div className="boot-logo">🏆</div></div>}>
        <GarajDemo />
      </Suspense>
    );
  }

  const [me, setMe] = useState<MeResponse | null>(null);
  const [linked, setLinked] = useState<boolean | null>(null);
  // Deep-link: a bot-menu button opens the Mini App with ?go=<tab|book> → land straight
  // on that screen (booking flow / the matching tab), not always the home tab.
  const [tab, setTab] = useState<Tab>(() => GO_MAP[readGo()] ?? "uy");
  const [board, setBoard] = useState<LeaderboardResponse | null>(null);
  const [boardErr, setBoardErr] = useState(false);
  const [livinghome, setLivinghome] = useState(false);
  const [tolqin, setTolqin] = useState(false);
  const [playTolqin, setPlayTolqin] = useState(false);
  const [garajx, setGarajx] = useState(false); // 🏆 GARAJ v2 feature flag
  const [garaj, setGaraj] = useState(false); // GARAJ shell open
  const [collectionTarget, setCollectionTarget] = useState<{ id: number; name: string } | null>(null); // Reyting → player garage
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ id: number; msg: string } | null>(null);
  const [booking, setBooking] = useState(() => readGo() === "book");
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
    api.leaderboard().then(setBoard).catch(() => setBoardErr(true)); // P1: no permanent spinner on Liga
  };
  useEffect(() => {
    api
      .me()
      .then((r) => {
        if ("linked" in r && r.linked === false) setLinked(false);
        else {
          setMe(r as MeResponse);
          setLinked(true);
        }
      })
      .catch((e) => setError(String(e)));
    loadBoard();
    // V1: learn whether the living home is enabled (same flag channel as booking3)
    api.bookingInfo().then((r) => { if (!("error" in r)) { setLivinghome(!!r.livinghome); setTolqin(!!r.tolqin); setGarajx(!!r.garajx); } }).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reload = () => {
    api
      .me()
      .then((r) => {
        if (!("linked" in r && r.linked === false)) setMe(r as MeResponse);
      })
      .catch(() => undefined);
  };

  if (error) return <ErrorScreen error={error} />;
  if (linked === null) return <BootSplash />;
  if (linked === false) return <NotLinked />;
  if (!me) return <BootSplash />;
  if (booking) return <Suspense fallback={<BootSplash />}><Booking3View me={me} onClose={() => setBooking(false)} /></Suspense>;
  if (garaj) return <Suspense fallback={<BootSplash />}><GarajShell onClose={() => { setGaraj(false); reload(); }} /></Suspense>;

  const go = (t: Tab) => {
    if (t === tab) return;
    haptic();
    setTab(t);
  };
  // child components nav by string label (incl. old names) → map to the 5 tabs
  const nav = (t: string) => go(GO_MAP[t] ?? "uy");

  const flash = (msg: string) => {
    haptic();
    setToast({ id: Date.now(), msg });
    reload();
    setTimeout(() => setToast((c) => (c && Date.now() - c.id >= 3500 ? null : c)), 3600);
  };

  const TABS = me.type === "driver" ? DRIVER_TABS : BASE_TABS;
  const TAB_PCT = 100 / TABS.length;
  const activeIndex = TABS.findIndex((t) => t.id === tab);

  return (
    <div className="app">
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
          <button className="profile-btn" onClick={() => { haptic(); setTab("profile"); }} aria-label="Hisobim & sozlamalar">
            <Icon name="user" size={20} />
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
                {garajx && (
                  <div className="d-card pointer row between" onClick={() => { haptic(); setGaraj(true); }}>
                    <div className="row g10">
                      <span className="fs34">🏆</span>
                      <div className="col">
                        <b>GARAJ</b>
                        <span className="fs12 dim">Ol · ta'mirla · foyda bilan sot</span>
                      </div>
                    </div>
                    <span className="fs22">▶</span>
                  </div>
                )}
                <RewardsView me={me} onReward={flash} hideGarage={garajx} />
                <MissionsView onReward={flash} />
              </>
            )}
            {tab === "market" &&
              (garajx ? (
                <Suspense fallback={<div className="view"><Spinner /></div>}>
                  <GarajMarketView coins={me.coins} onBanner={flash} />
                </Suspense>
              ) : (
                <MarketView coins={me.coins} onBanner={flash} />
              ))}
            {tab === "reyting" &&
              (board ? (
                <>
                  <LeaderboardView board={board} onRow={garajx ? (id, name) => { setCollectionTarget({ id, name }); } : undefined} />
                  <MahallaSection />
                  <ReferralView />
                </>
              ) : boardErr ? (
                <LoadError onRetry={loadBoard} />
              ) : (
                <Spinner />
              ))}
            {tab === "driver" && <DriverView me={me} />}
            {tab === "profile" && <div className="view"><AccountCard /></div>}
          </Suspense>
        </div>
      </main>

      <nav className="tabbar">
        <span className="tab-ind" ref={(el) => el?.style.setProperty("left", `calc(${activeIndex} * ${TAB_PCT}% + ${TAB_PCT / 2}%)`)} />
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "tab active" : "tab"} onClick={() => go(t.id)}>
            <Icon name={t.icon} filled={tab === t.id} size={23} />
            <span className="tab-label">{t.label}</span>
          </button>
        ))}
      </nav>
      {tolqin && !playTolqin && (
        <button className="tolqin-fab" onClick={() => { haptic(); setPlayTolqin(true); }} aria-label="Yashil to'lqin o'yini">🎮</button>
      )}
      {playTolqin && (
        <Suspense fallback={<BootSplash />}>
          <TolqinGame onClose={() => setPlayTolqin(false)} onReward={flash} />
        </Suspense>
      )}
      {collectionTarget && (
        <Suspense fallback={null}>
          <GarajCollectionSheet memberId={collectionTarget.id} name={collectionTarget.name} onClose={() => setCollectionTarget(null)} />
        </Suspense>
      )}
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
          <p className="muted fs11 mt12 o55">
            Telegram: {tg ? "✓" : "✗"} · initData: {initData ? `✓ (${initData.length})` : "✗ yo'q"}
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
