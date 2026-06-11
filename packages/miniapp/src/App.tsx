import { useEffect, useState } from "react";
import type { LeaderboardResponse, MeResponse } from "@t1067/shared";
import { api, getInitData } from "./api";
import { haptic, tg } from "./telegram";
import { LeaderboardView, MissionsView, ReferralView, Spinner } from "./components";
import { WalletView } from "./wallet";
import { RewardsView } from "./rewards";
import { MarketView } from "./market";
import { BookingView } from "./booking";
import { Icon } from "./icons";
import { useCountUp } from "./util";

type Tab = "home" | "market" | "rewards" | "missions" | "league" | "friends";

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: "home", icon: "wallet", label: "Hamyon" },
  { id: "market", icon: "market", label: "Bozor" },
  { id: "rewards", icon: "games", label: "Bonus" },
  { id: "missions", icon: "missions", label: "Vazifa" },
  { id: "league", icon: "league", label: "Liga" },
  { id: "friends", icon: "friends", label: "Do'st" },
];
const TAB_PCT = 100 / TABS.length;

export function App() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [linked, setLinked] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [board, setBoard] = useState<LeaderboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ id: number; msg: string } | null>(null);
  const [booking, setBooking] = useState(false);
  const coins = useCountUp(me?.coins ?? 0);

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
    api.leaderboard().then(setBoard).catch(() => undefined);
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
  if (booking) return <BookingView onClose={() => setBooking(false)} />;

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

  const activeIndex = TABS.findIndex((t) => t.id === tab);

  return (
    <div className="app">
      <div className="aurora" />
      <header className="topbar">
        <div className="brand">
          <span className="brand-badge">🚕</span>
          <span className="brand-name">1067<b>TAXI</b></span>
        </div>
        <div className="coin-pill">
          <span className="coin-dot">🪙</span>
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
          {tab === "home" && <WalletView me={me} onBanner={flash} reload={reload} onBook={() => { haptic(); setBooking(true); }} />}
          {tab === "market" && <MarketView coins={me.coins} onBanner={flash} />}
          {tab === "rewards" && <RewardsView me={me} onReward={flash} />}
          {tab === "missions" && <MissionsView onReward={flash} />}
          {tab === "league" && (board ? <LeaderboardView board={board} /> : <Spinner />)}
          {tab === "friends" && <ReferralView />}
        </div>
      </main>

      <nav className="tabbar">
        <span className="tab-ind" style={{ left: `calc(${activeIndex} * ${TAB_PCT}% + ${TAB_PCT / 2}%)` }} />
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "tab active" : "tab"} onClick={() => go(t.id)}>
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
      <div className="boot-logo">🚕</div>
      <div className="boot-name">1067 <b>TAXI</b></div>
      <div className="boot-bar"><span /></div>
    </div>
  );
}

function ErrorScreen({ error }: { error: string }) {
  const notAuthed = error.includes("unauthorized");
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
          <p className="muted" style={{ fontSize: 11, marginTop: 12, opacity: 0.55 }}>
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
