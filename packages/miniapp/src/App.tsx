import { useEffect, useState } from "react";
import type { LeaderboardResponse, MeResponse } from "@t1067/shared";
import { api } from "./api";
import { haptic } from "./telegram";
import { BadgesView, LeaderboardView, ProfileView, Spinner } from "./components";

type Tab = "profile" | "leaderboard" | "badges";

export function App() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [linked, setLinked] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("profile");
  const [board, setBoard] = useState<LeaderboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  if (error) return <div className="screen center muted">⚠️ {error}</div>;
  if (linked === null) return <Spinner />;
  if (linked === false) return <NotLinked />;
  if (!me) return <Spinner />;

  const go = (t: Tab) => {
    haptic();
    setTab(t);
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-badge">🚕</span>
          <span className="brand-name">1067 <b>TAXI</b></span>
        </div>
        <div className="brand-sub">{me.type === "driver" ? "Haydovchi" : "Mijoz"}</div>
      </header>

      <main className="content">
        {tab === "profile" && <ProfileView me={me} />}
        {tab === "leaderboard" && (board ? <LeaderboardView board={board} /> : <Spinner />)}
        {tab === "badges" && <BadgesView me={me} />}
      </main>

      <nav className="tabbar">
        <button className={tab === "profile" ? "tab active" : "tab"} onClick={() => go("profile")}>
          <span>👤</span>Profil
        </button>
        <button className={tab === "leaderboard" ? "tab active" : "tab"} onClick={() => go("leaderboard")}>
          <span>🏆</span>Reyting
        </button>
        <button className={tab === "badges" ? "tab active" : "tab"} onClick={() => go("badges")}>
          <span>🎖</span>Nishonlar
        </button>
      </nav>
    </div>
  );
}

function NotLinked() {
  return (
    <div className="screen center">
      <div className="nl-card">
        <div className="nl-emoji">🔗</div>
        <h2>Akkaunt bog'lanmagan</h2>
        <p className="muted">
          Ma'lumotlaringizni ko'rish uchun Telegram botga kiring va telefon raqamingizni ulashing.
        </p>
      </div>
    </div>
  );
}
