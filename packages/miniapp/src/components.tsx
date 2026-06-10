import { useEffect, useState } from "react";
import {
  LEVELS,
  WHEEL_PRIZES,
  formatNumber,
  rankMedal,
  type BoxStatusResponse,
  type LeaderboardResponse,
  type MeResponse,
  type MissionView,
  type MissionsResponse,
  type ReferralResponse,
} from "@t1067/shared";
import { api } from "./api";
import { copyText, shareLink } from "./telegram";

export function Spinner() {
  return (
    <div className="screen center">
      <div className="spinner" />
    </div>
  );
}

function Ring({ progress, color, emoji }: { progress: number; color: string; emoji: string }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(1, progress)));
  return (
    <div className="ring">
      <svg width="130" height="130" viewBox="0 0 130 130">
        <circle cx="65" cy="65" r={r} className="ring-track" />
        <circle cx="65" cy="65" r={r} className="ring-fill" stroke={color} strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 65 65)" />
      </svg>
      <div className="ring-emoji" style={{ filter: `drop-shadow(0 0 12px ${color}88)` }}>{emoji}</div>
    </div>
  );
}

function StatTile({ icon, label, value, accent }: { icon: string; label: string; value: string; accent?: string }) {
  return (
    <div className="tile">
      <div className="tile-icon">{icon}</div>
      <div className="tile-value" style={accent ? { color: accent } : undefined}>{value}</div>
      <div className="tile-label">{label}</div>
    </div>
  );
}

function StreakCard({ me, onReward }: { me: MeResponse; onReward: (msg: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(me.streak.checkedToday);
  const checkIn = async () => {
    setBusy(true);
    try {
      const r = await api.checkin();
      setChecked(true);
      onReward(
        r.rewardAmount > 0
          ? `🎉 +${formatNumber(r.rewardAmount)} so'm! 🔥 ${r.current} kun streak`
          : `🔥 ${r.current} kun streak! Davom eting`,
      );
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="streak-card">
      <div className="streak-flame">🔥</div>
      <div className="streak-info">
        <div className="streak-days">{me.streak.current} kun</div>
        <div className="streak-label muted">Kunlik streak</div>
      </div>
      <button className="streak-btn" onClick={checkIn} disabled={busy || checked}>
        {checked ? "✅ Olingan" : busy ? "…" : "Belgilash"}
      </button>
    </div>
  );
}

function SpinWheel({ available, onReward }: { available: boolean; onReward: (msg: string) => void }) {
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [done, setDone] = useState(!available);
  const N = WHEEL_PRIZES.length;
  const seg = 360 / N;

  const spin = async () => {
    if (spinning || done) return;
    setSpinning(true);
    try {
      const res = await api.spinWheel();
      const idx = Math.max(0, WHEEL_PRIZES.findIndex((p) => p.label === res.prize.label));
      const target = 360 * 6 - (idx * seg + seg / 2);
      setRotation(target);
      setTimeout(() => {
        setSpinning(false);
        setDone(true);
        onReward(
          res.prize.amount > 0
            ? `${res.prize.emoji} +${formatNumber(res.prize.amount)} so'm!`
            : `${res.prize.emoji} ${res.prize.label} — ertaga yana!`,
        );
      }, 4200);
    } catch {
      setSpinning(false);
    }
  };

  return (
    <section className="wheel-section">
      <div className="section-title">🎡 Omad g'ildiragi</div>
      <div className="wheel-wrap">
        <div className="wheel-pointer">▼</div>
        <svg
          viewBox="0 0 200 200"
          className="wheel"
          style={{ transform: `rotate(${rotation}deg)`, transition: spinning ? "transform 4s cubic-bezier(.18,.7,.16,1)" : "none" }}
        >
          {WHEEL_PRIZES.map((p, i) => {
            const a0 = ((i * seg - 90) * Math.PI) / 180;
            const a1 = (((i + 1) * seg - 90) * Math.PI) / 180;
            const x0 = 100 + 96 * Math.cos(a0);
            const y0 = 100 + 96 * Math.sin(a0);
            const x1 = 100 + 96 * Math.cos(a1);
            const y1 = 100 + 96 * Math.sin(a1);
            const mid = (((i + 0.5) * seg - 90) * Math.PI) / 180;
            const lx = 100 + 62 * Math.cos(mid);
            const ly = 100 + 62 * Math.sin(mid);
            return (
              <g key={i}>
                <path d={`M100 100 L${x0.toFixed(2)} ${y0.toFixed(2)} A96 96 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`} fill={p.color} stroke="#0b0f1a" strokeWidth="1" />
                <text x={lx} y={ly} fontSize="17" textAnchor="middle" dominantBaseline="middle" transform={`rotate(${(i + 0.5) * seg} ${lx.toFixed(2)} ${ly.toFixed(2)})`}>
                  {p.emoji}
                </text>
              </g>
            );
          })}
          <circle cx="100" cy="100" r="15" fill="#161d30" stroke="var(--accent)" strokeWidth="2" />
        </svg>
      </div>
      <button className="spin-btn" onClick={spin} disabled={spinning || done}>
        {done ? "Ertaga yana 🌙" : spinning ? "Aylanmoqda…" : "🎡 Aylantirish"}
      </button>
    </section>
  );
}

export function ProfileView({ me, reload }: { me: MeResponse; reload: () => void }) {
  const [banner, setBanner] = useState<string | null>(null);
  const onReward = (msg: string) => {
    setBanner(msg);
    reload();
    setTimeout(() => setBanner(null), 6000);
  };

  const pct = Math.round(me.progress * 100);
  const toNext =
    me.nextLevel && me.xpForNext !== null
      ? `${me.nextLevel.emoji} ${me.nextLevel.name}gacha ${formatNumber(me.nextLevel.minXp - me.xp)} ball`
      : "Eng yuqori daraja 👑";

  const tiles = [
    { icon: "💰", label: me.metricLabel, value: formatNumber(me.stats.points), accent: me.level.color },
    { icon: "🚕", label: "Safarlar", value: formatNumber(me.stats.trips) },
    { icon: "🏅", label: "O'rin", value: me.rank ? `${rankMedal(me.rank)}` : "—" },
  ];
  if (me.type === "driver") tiles.push({ icon: "⭐", label: "Reyting", value: me.stats.rating.toFixed(2) });

  return (
    <div className="view">
      {banner && <div className="reward-banner">{banner}</div>}

      <section className="hero" style={{ ["--accent" as string]: me.level.color }}>
        <Ring progress={me.progress} color={me.level.color} emoji={me.level.emoji} />
        <div className="hero-name">{me.member.fullName}</div>
        {me.type === "driver" && me.member.carNumber && <div className="hero-call">🚗 {me.member.carNumber}</div>}
        <div className="hero-level" style={{ color: me.level.color }}>{me.level.name}</div>
        <div className="hero-progress">
          <div className="hero-bar"><span style={{ width: `${pct}%`, background: me.level.color }} /></div>
          <div className="hero-tonext muted">{toNext}</div>
        </div>
        <div className="rank-chips">
          {me.rank && <span className="chip">O'rin {rankMedal(me.rank)}</span>}
          <span className="chip">/ {formatNumber(me.totalMembers)} {me.type === "driver" ? "haydovchi" : "mijoz"}</span>
        </div>
      </section>

      <StreakCard me={me} onReward={onReward} />

      <section className="tiles">
        {tiles.map((t) => (
          <StatTile key={t.label} icon={t.icon} label={t.label} value={t.value} accent={t.accent} />
        ))}
      </section>

      <SpinWheel available={me.wheelAvailable} onReward={onReward} />

      <LevelLadder currentIndex={me.level.index} />
    </div>
  );
}

function LevelLadder({ currentIndex }: { currentIndex: number }) {
  return (
    <section className="ladder">
      <div className="section-title">Darajalar</div>
      <div className="ladder-track">
        {LEVELS.map((l) => (
          <div
            key={l.index}
            className={"ladder-step" + (l.index === currentIndex ? " current" : l.index < currentIndex ? " done" : "")}
            title={l.name}
          >
            <span className="ladder-emoji" style={l.index <= currentIndex ? { filter: `drop-shadow(0 0 8px ${l.color})` } : undefined}>{l.emoji}</span>
            <span className="ladder-name">{l.name}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function LeaderboardView({ board }: { board: LeaderboardResponse }) {
  const max = Math.max(1, ...board.entries.map((e) => e.points));
  return (
    <div className="view">
      <div className="section-title">🏆 {board.type === "driver" ? "Haydovchilar" : "Mijozlar"} · {board.metricLabel}</div>
      <div className="board">
        {board.entries.map((e) => (
          <div key={e.memberId} className={"row" + (e.isMe ? " me" : "") + (e.rank <= 3 ? " podium" : "")}>
            <div className="row-rank">{rankMedal(e.rank)}</div>
            <div className="row-main">
              <div className="row-name">
                <span className="row-emoji">{e.level.emoji}</span>
                {e.fullName}
                {e.isMe && <span className="you">Siz</span>}
              </div>
              <div className="row-bar"><span style={{ width: `${(e.points / max) * 100}%`, background: e.level.color }} /></div>
            </div>
            <div className="row-val">{formatNumber(e.points)}</div>
          </div>
        ))}
      </div>
      {board.me && board.me.rank > board.entries.length && (
        <div className="row me sticky">
          <div className="row-rank">{rankMedal(board.me.rank)}</div>
          <div className="row-main"><div className="row-name">{board.me.fullName} <span className="you">Siz</span></div></div>
          <div className="row-val">{formatNumber(board.me.points)}</div>
        </div>
      )}
    </div>
  );
}

// ─── missions / quests ────────────────────────────────────────
function MissionCard({ m, onClaim, busy }: { m: MissionView; onClaim: (code: string) => void; busy: boolean }) {
  const pct = Math.min(100, Math.round((m.progress / m.target) * 100));
  return (
    <div className={"mission" + (m.claimed ? " claimed" : m.claimable ? " ready" : "")}>
      <div className="mission-emoji">{m.emoji}</div>
      <div className="mission-body">
        <div className="mission-title">{m.title}</div>
        <div className="mission-bar">
          <span style={{ width: `${pct}%` }} />
        </div>
        <div className="mission-sub muted">
          {m.progress}/{m.target} · 💰 {formatNumber(m.reward)} so'm
        </div>
      </div>
      {m.claimed ? (
        <div className="mission-done">✅</div>
      ) : m.claimable ? (
        <button className="mission-claim" disabled={busy} onClick={() => onClaim(m.code)}>
          {busy ? "…" : "Olish"}
        </button>
      ) : (
        <div className="mission-pct muted">{pct}%</div>
      )}
    </div>
  );
}

function BoxCard({ box, onOpened, refresh }: { box: BoxStatusResponse; onOpened: (msg: string) => void; refresh: () => void }) {
  const [opening, setOpening] = useState(false);
  const [shake, setShake] = useState(false);

  const open = async () => {
    if (opening || box.opened || !box.eligible) return;
    setOpening(true);
    setShake(true);
    try {
      const r = await api.openBox();
      // let the shake play before the reveal
      setTimeout(() => {
        setShake(false);
        if (r.ok && r.prize) onOpened(`🎁 ${r.prize.emoji} +${formatNumber(r.prize.amount)} so'm!`);
        refresh();
        setOpening(false);
      }, 900);
    } catch {
      setShake(false);
      setOpening(false);
    }
  };

  const pct = Math.round((box.dailiesDone / Math.max(1, box.dailiesTotal)) * 100);
  return (
    <div className={"box-card" + (box.eligible && !box.opened ? " ready" : "") + (box.opened ? " opened" : "")}>
      <div className={"box-emoji" + (shake ? " shaking" : "")}>{box.opened ? "🎊" : "🎁"}</div>
      <div className="box-body">
        <div className="box-title">Sirli quti</div>
        {box.opened && box.prize ? (
          <div className="box-sub muted">
            Bugun: {box.prize.emoji} <b>{box.prize.label}</b> — ertaga yana!
          </div>
        ) : box.eligible ? (
          <div className="box-sub">Tayyor! Ichida <b>10 000 so'mgacha</b> 👇</div>
        ) : (
          <>
            <div className="box-bar">
              <span style={{ width: `${pct}%` }} />
            </div>
            <div className="box-sub muted">
              Kunlik vazifalar: {box.dailiesDone}/{box.dailiesTotal} — hammasini tugating
            </div>
          </>
        )}
      </div>
      {!box.opened && box.eligible && (
        <button className="box-open" disabled={opening} onClick={open}>
          {opening ? "…" : "Ochish"}
        </button>
      )}
    </div>
  );
}

export function MissionsView({ onReward }: { onReward: (msg: string) => void }) {
  const [data, setData] = useState<MissionsResponse | null>(null);
  const [box, setBox] = useState<BoxStatusResponse | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () =>
    Promise.all([
      api.missions().then(setData).catch(() => undefined),
      api.box().then(setBox).catch(() => undefined),
    ]);
  useEffect(() => {
    load();
  }, []);

  const claim = async (code: string) => {
    setBusy(code);
    try {
      const r = await api.claimMission(code);
      if (r.ok) onReward(`🎉 +${formatNumber(r.reward)} so'm!`);
      await load();
    } catch {
      /* ignore */
    } finally {
      setBusy(null);
    }
  };

  if (!data) return <Spinner />;
  const readyCount = [...data.daily, ...data.weekly].filter((m) => m.claimable).length;

  return (
    <div className="view">
      <div className="section-title">
        🎯 Vazifalar {readyCount > 0 && <span className="ready-pill">{readyCount} ta tayyor 🎁</span>}
      </div>
      {box && <BoxCard box={box} onOpened={onReward} refresh={load} />}
      <div className="mission-group muted">📅 Kunlik</div>
      {data.daily.map((m) => (
        <MissionCard key={m.code} m={m} onClaim={claim} busy={busy === m.code} />
      ))}
      <div className="mission-group muted">🗓 Haftalik</div>
      {data.weekly.map((m) => (
        <MissionCard key={m.code} m={m} onClaim={claim} busy={busy === m.code} />
      ))}
    </div>
  );
}

// ─── referral ─────────────────────────────────────────────────
export function ReferralView() {
  const [data, setData] = useState<ReferralResponse | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.referral().then(setData).catch(() => undefined);
  }, []);

  if (!data) return <Spinner />;
  const share = () =>
    shareLink(data.link, "🚕 1067 Taxi — har safardan cashback, kunlik sovg'alar va omad g'ildiragi! Qo'shiling:");
  const copy = async () => {
    await copyText(data.link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="view">
      <div className="section-title">👥 Do'st taklif qiling</div>

      <section className="ref-hero">
        <div className="ref-big">🎁</div>
        <div className="ref-line">
          Har do'st uchun <b>ikkalangiz ham</b> pul olasiz
        </div>
        <div className="ref-rewards">
          <div className="ref-reward">
            <div className="ref-reward-val">+{formatNumber(data.rewardReferrer)}</div>
            <div className="muted">Siz</div>
          </div>
          <div className="ref-plus">＋</div>
          <div className="ref-reward">
            <div className="ref-reward-val">+{formatNumber(data.rewardReferee)}</div>
            <div className="muted">Do'stingiz</div>
          </div>
        </div>
      </section>

      <section className="tiles">
        <StatTile icon="✅" label="Taklif qilingan" value={formatNumber(data.invited)} />
        <StatTile icon="💰" label="Ishlab topgan" value={`${formatNumber(data.earned)}`} accent="#22c55e" />
      </section>

      <div className="ref-code-label muted">Sizning kodingiz</div>
      <div className="ref-code">{data.code}</div>

      <button className="ref-share" onClick={share}>
        📤 Do'stga yuborish
      </button>
      <button className="ref-copy" onClick={copy}>
        {copied ? "✅ Nusxa olindi" : "🔗 Havoladan nusxa olish"}
      </button>
    </div>
  );
}

export function BadgesView({ me }: { me: MeResponse }) {
  const earned = me.badges.filter((b) => b.earned).length;
  return (
    <div className="view">
      <div className="section-title">Nishonlar <span className="muted">{earned}/{me.badges.length}</span></div>
      <div className="badge-grid">
        {me.badges.map((b) => (
          <div key={b.code} className={"badge" + (b.earned ? " earned" : " locked")}>
            <div className="badge-emoji">{b.earned ? b.emoji : "🔒"}</div>
            <div className="badge-name">{b.name}</div>
            <div className="badge-desc muted">{b.description}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
