import { Suspense, lazy, useEffect, useState } from "react";

const DesignDemo = lazy(() => import("./design/demo")); // #demo dagina yuklanadi
import type { LeaderboardResponse, MeResponse } from "@t1067/shared";
import { api, getInitData } from "./api";
import { haptic, tg } from "./telegram";
import { LeaderboardView, LoadError, MahallaSection, MissionsView, ReferralView, Spinner } from "./components";
import { WalletView } from "./wallet"; // bosh tab — eager (birinchi paint)
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
import { Icon } from "./icons";
import { useCountUp } from "./util";

type Tab = "home" | "market" | "rewards" | "missions" | "league" | "friends" | "driver";

const BASE_TABS: { id: Tab; icon: string; label: string }[] = [
  { id: "home", icon: "wallet", label: "Hamyon" },
  { id: "market", icon: "market", label: "Bozor" },
  { id: "rewards", icon: "games", label: "Bonus" },
  { id: "missions", icon: "missions", label: "Vazifa" },
  { id: "league", icon: "league", label: "Liga" },
  { id: "friends", icon: "friends", label: "Do'st" },
];
// drivers trade the social tabs for their earnings hub
const DRIVER_TABS: { id: Tab; icon: string; label: string }[] = [
  { id: "home", icon: "wallet", label: "Hamyon" },
  { id: "driver", icon: "car", label: "Daromad" },
  { id: "market", icon: "market", label: "Bozor" },
  { id: "rewards", icon: "games", label: "Bonus" },
  { id: "missions", icon: "missions", label: "Vazifa" },
  { id: "league", icon: "league", label: "Liga" },
];

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
const TAB_IDS: Tab[] = ["home", "market", "rewards", "missions", "league", "friends", "driver"];

export function App() {
  if (window.location.hash === "#demo") {
    return (
      <Suspense fallback={<div className="boot"><div className="boot-logo">🎨</div></div>}>
        <DesignDemo />
      </Suspense>
    );
  }

  const [me, setMe] = useState<MeResponse | null>(null);
  const [linked, setLinked] = useState<boolean | null>(null);
  // Deep-link: a bot-menu button opens the Mini App with ?go=<tab|book> → land straight
  // on that screen (booking flow / the matching tab), not always the home tab.
  const [tab, setTab] = useState<Tab>(() => {
    const g = readGo();
    return TAB_IDS.includes(g as Tab) ? (g as Tab) : "home";
  });
  const [board, setBoard] = useState<LeaderboardResponse | null>(null);
  const [boardErr, setBoardErr] = useState(false);
  const [livinghome, setLivinghome] = useState(false);
  const [tolqin, setTolqin] = useState(false);
  const [playTolqin, setPlayTolqin] = useState(false);
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
    api.bookingInfo().then((r) => { if (!("error" in r)) { setLivinghome(!!r.livinghome); setTolqin(!!r.tolqin); } }).catch(() => undefined);
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

  const go = (t: Tab) => {
    if (t === tab) return;
    haptic();
    setTab(t);
  };

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
          <span className="build-ver">v14 🏠</span>
        </div>
        <div className="coin-pill">
          <span className={"coin-dot" + (coinBounce ? " d-coin-bounce" : "")}>🪙</span>
          {Math.round(coins).toLocaleString("ru-RU")}
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
            {tab === "home" &&
              (livinghome ? (
                <LivingHome me={me} onBanner={flash} reload={reload} onBook={() => { haptic(); setBooking(true); }} onNav={(t) => go(t as Tab)} />
              ) : (
                <WalletView me={me} onBanner={flash} reload={reload} onBook={() => { haptic(); setBooking(true); }} onNav={go} />
              ))}
            {tab === "market" && <MarketView coins={me.coins} onBanner={flash} />}
            {tab === "driver" && <DriverView me={me} />}
            {tab === "rewards" && <RewardsView me={me} onReward={flash} />}
            {tab === "missions" && <MissionsView onReward={flash} />}
            {tab === "league" &&
              (board ? (
                <>
                  <LeaderboardView board={board} />
                  <MahallaSection />
                </>
              ) : boardErr ? (
                <LoadError onRetry={loadBoard} />
              ) : (
                <Spinner />
              ))}
            {tab === "friends" && <ReferralView />}
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
    </div>
  );
}

function BootSplash() {
  return (
    <div className="boot">
      <div className="aurora" />
      <div className="boot-logo">🚕</div>
      <div className="boot-name">1067 <b>TAXI</b></div>
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
          <span className="wake-taxi">🚕</span>
          <h2>1067 uyg'onmoqda…</h2>
          <p className="muted">Server bir necha soniyada tayyor bo'ladi — avtomatik qayta ulanamiz.</p>
          <div className="wake-bar"><span /></div>
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
