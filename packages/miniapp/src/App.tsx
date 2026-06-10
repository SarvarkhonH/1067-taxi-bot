import { useEffect, useState } from "react";
import type { LeaderboardResponse, MeResponse } from "@t1067/shared";
import { api, getInitData } from "./api";
import { haptic, tg } from "./telegram";
import { LeaderboardView, MissionsView, ReferralView, Spinner } from "./components";
import { WalletView } from "./wallet";
import { ArcadeView } from "./arcade";
import { BookingView } from "./booking";

type Tab = "home" | "games" | "missions" | "league" | "friends";

const TABS: { id: Tab; emoji: string; label: string }[] = [
  { id: "home", emoji: "🏠", label: "Hamyon" },
  { id: "games", emoji: "🎮", label: "O'yinlar" },
  { id: "missions", emoji: "🎯", label: "Vazifa" },
  { id: "league", emoji: "🏆", label: "Liga" },
  { id: "friends", emoji: "👥", label: "Do'st" },
];

export function App() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [linked, setLinked] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [board, setBoard] = useState<LeaderboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);

  useEffect(() => {
    api
      .me()
      .then((r) => {
        if ("linked" in r && r.linked === false) {
          setLinked(false);
        } else {
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
  if (linked === null) return <Spinner />;
  if (linked === false) return <NotLinked />;
  if (!me) return <Spinner />;
  if (booking) return <BookingView onClose={() => setBooking(false)} />;

  const go = (t: Tab) => {
    haptic();
    setTab(t);
  };

  const flash = (msg: string) => {
    setBanner(msg);
    reload();
    setTimeout(() => setBanner(null), 4000);
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-badge">🚕</span>
          <span className="brand-name">1067 <b>TAXI</b></span>
        </div>
        <div className="coin-pill">🪙 {Math.round(me.coins).toLocaleString("ru-RU")}</div>
      </header>

      <main className="content">
        {banner && <div className="reward-banner">{banner}</div>}
        {tab === "home" && <WalletView me={me} onBanner={flash} reload={reload} onBook={() => { haptic(); setBooking(true); }} />}
        {tab === "games" && <ArcadeView me={me} onReward={flash} />}
        {tab === "missions" && <MissionsView onReward={flash} />}
        {tab === "league" && (board ? <LeaderboardView board={board} /> : <Spinner />)}
        {tab === "friends" && <ReferralView />}
      </main>

      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "tab active" : "tab"} onClick={() => go(t.id)}>
            <span>{t.emoji}</span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function ErrorScreen({ error }: { error: string }) {
  const notAuthed = error.includes("unauthorized");
  const initData = getInitData();
  const hasInitData = !!initData;
  return (
    <div className="screen center">
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
            Telegram: {tg ? "✓" : "✗"} · initData: {hasInitData ? `✓ (${initData.length})` : "✗ yo'q"}
          </p>
        )}
      </div>
    </div>
  );
}

function NotLinked() {
  return (
    <div className="screen center">
      <div className="nl-card glass pad">
        <div className="nl-emoji">🔗</div>
        <h2>Akkaunt bog'lanmagan</h2>
        <p className="muted">
          Ma'lumotlaringizni ko'rish uchun Telegram botga kiring va telefon raqamingizni ulashing.
        </p>
      </div>
    </div>
  );
}
