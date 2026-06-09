import { useEffect, useState } from "react";
import type { LeaderboardResponse, MeResponse } from "@t1067/shared";
import { api, getInitData } from "./api";
import { haptic, tg } from "./telegram";
import { BadgesView, LeaderboardView, MissionsView, ProfileView, ReferralView, Spinner } from "./components";

type Tab = "profile" | "missions" | "leaderboard" | "invite" | "badges";

export function App() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [linked, setLinked] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("profile");
  const [board, setBoard] = useState<LeaderboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

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
        <div className="brand-sub">{me.type === "driver" ? "Haydovchi" : "Mijoz"}</div>
      </header>

      <main className="content">
        {banner && <div className="reward-banner">{banner}</div>}
        {tab === "profile" && <ProfileView me={me} reload={reload} />}
        {tab === "missions" && <MissionsView onReward={flash} />}
        {tab === "leaderboard" && (board ? <LeaderboardView board={board} /> : <Spinner />)}
        {tab === "invite" && <ReferralView />}
        {tab === "badges" && <BadgesView me={me} />}
      </main>

      <nav className="tabbar">
        <button className={tab === "profile" ? "tab active" : "tab"} onClick={() => go("profile")}>
          <span>👤</span>Profil
        </button>
        <button className={tab === "missions" ? "tab active" : "tab"} onClick={() => go("missions")}>
          <span>🎯</span>Vazifa
        </button>
        <button className={tab === "leaderboard" ? "tab active" : "tab"} onClick={() => go("leaderboard")}>
          <span>🏆</span>Reyting
        </button>
        <button className={tab === "invite" ? "tab active" : "tab"} onClick={() => go("invite")}>
          <span>👥</span>Do'st
        </button>
        <button className={tab === "badges" ? "tab active" : "tab"} onClick={() => go("badges")}>
          <span>🎖</span>Nishon
        </button>
      </nav>
    </div>
  );
}

function ErrorScreen({ error }: { error: string }) {
  const notAuthed = error.includes("unauthorized");
  const initData = getInitData();
  const hasInitData = !!initData;
  const btn = {
    marginTop: 16,
    padding: "10px 22px",
    background: "var(--accent)",
    color: "#1a1300",
    border: 0,
    borderRadius: 10,
    fontWeight: 700,
    fontSize: 14,
  } as const;
  return (
    <div className="screen center">
      <div className="nl-card">
        <div className="nl-emoji">{notAuthed ? "🤖" : "😴"}</div>
        <h2>{notAuthed ? "Telegram orqali oching" : "Server uyg'onmoqda"}</h2>
        <p className="muted">
          {notAuthed
            ? "Mini App'ni botdagi pastki ⊞ menyu yoki «🚀 Ilova» tugmasi orqali oching — havolani brauzerda emas."
            : "Server biroz uxlab qoldi. Bir necha soniya kuting va qayta urinib ko'ring."}
        </p>
        <button onClick={() => location.reload()} style={btn}>🔄 Qayta urinish</button>
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
