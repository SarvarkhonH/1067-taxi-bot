import { LEVELS, formatNumber, rankMedal, type LeaderboardResponse, type MeResponse } from "@t1067/shared";

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

export function ProfileView({ me }: { me: MeResponse }) {
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

      <section className="tiles">
        {tiles.map((t) => (
          <StatTile key={t.label} icon={t.icon} label={t.label} value={t.value} accent={t.accent} />
        ))}
      </section>

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
