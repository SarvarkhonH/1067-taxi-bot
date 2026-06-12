import { useEffect, useState } from "react";
import {
  formatNumber,
  leagueTierEmoji,
  rankMedal,
  type LeaderboardResponse,
  type MeResponse,
  type MissionView,
  type MissionsResponse,
  type ReferralResponse,
  type WeeklyBoardResponse,
} from "@t1067/shared";
import { api } from "./api";
import { copyText, haptic, shareLink } from "./telegram";

export function Spinner() {
  return (
    <div className="screen center">
      <div className="spinner" />
    </div>
  );
}

export function StatTile({ icon, label, value, accent }: { icon: string; label: string; value: string; accent?: string }) {
  return (
    <div className="tile glass">
      <div className="tile-icon">{icon}</div>
      <div className="tile-value" style={accent ? { color: accent } : undefined}>{value}</div>
      <div className="tile-label">{label}</div>
    </div>
  );
}

export function StreakCard({ me, onReward }: { me: MeResponse; onReward: (msg: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(me.streak.checkedToday);
  const checkIn = async () => {
    setBusy(true);
    haptic();
    try {
      const r = await api.checkin();
      setChecked(true);
      onReward(
        r.rewardAmount > 0
          ? `🎉 +${formatNumber(r.rewardAmount)} coin! 🔥 ${r.current} kun streak`
          : `🔥 ${r.current} kun streak! Davom eting`,
      );
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="streak-card glass">
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

// ─── missions / quests ────────────────────────────────────────
function MissionCard({ m, onClaim, busy }: { m: MissionView; onClaim: (code: string) => void; busy: boolean }) {
  const pct = Math.min(100, Math.round((m.progress / m.target) * 100));
  return (
    <div className={"mission glass" + (m.claimed ? " claimed" : m.claimable ? " ready" : "")}>
      <div className="mission-emoji">{m.emoji}</div>
      <div className="mission-body">
        <div className="mission-title">{m.title}</div>
        <div className="mission-bar">
          <span style={{ width: `${pct}%` }} />
        </div>
        <div className="mission-sub muted">
          {m.progress}/{m.target} · 🪙 {formatNumber(m.reward)}
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

export function MissionsView({ onReward }: { onReward: (msg: string) => void }) {
  const [data, setData] = useState<MissionsResponse | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => api.missions().then(setData).catch(() => undefined);
  useEffect(() => {
    load();
  }, []);

  const claim = async (code: string) => {
    setBusy(code);
    haptic();
    try {
      const r = await api.claimMission(code);
      if (r.ok) onReward(`🎉 +${formatNumber(r.reward)} coin!`);
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

// ─── leaderboard (weekly league + all-time) ───────────────────
function WeeklyBoard() {
  const [w, setW] = useState<WeeklyBoardResponse | null>(null);
  useEffect(() => {
    api.weekly().then(setW).catch(() => undefined);
  }, []);
  if (!w) return <Spinner />;
  const max = Math.max(1, ...w.entries.map((e) => e.score));
  return (
    <>
      <div className="weekly-prizes">
        {w.prizes.map((p) => (
          <div key={p.rank} className="weekly-prize glass">
            <div className="weekly-medal">{p.medal}</div>
            <div className="weekly-amount">{formatNumber(p.amount)}</div>
          </div>
        ))}
      </div>
      <div className="weekly-meta muted">
        ⚡️ Ball: kunlik +10 · g'ildirak +10 · vazifa +15 · quti +20 · safar +30 · taklif +50 — dushanbada coin to'lov · {w.daysLeft} kun qoldi
      </div>
      {w.entries.length === 0 && <div className="weekly-empty muted">Hafta endi boshlandi — birinchi bo'ling! 🚀</div>}
      <div className="board">
        {w.entries.map((e) => (
          <div key={e.memberId} className={"row glass" + (e.isMe ? " me me-row" : "") + (e.rank <= 3 ? " podium" : "")}>
            <div className="row-rank">{rankMedal(e.rank)}</div>
            <div className="row-main">
              <div className="row-name">
                <span className="row-emoji" title={e.tier}>{leagueTierEmoji(e.tier)}</span>
                {e.fullName}
                {e.isMe && <span className="you">Siz</span>}
              </div>
              <div className="row-bar brand-bar"><span style={{ width: `${(e.score / max) * 100}%` }} /></div>
            </div>
            <div className="row-val">{e.score}</div>
          </div>
        ))}
      </div>
      {w.me && w.me.rank > w.entries.length && (
        <div className="row glass me sticky">
          <div className="row-rank">#{w.me.rank}</div>
          <div className="row-main"><div className="row-name">{w.me.fullName} <span className="you">Siz</span></div></div>
          <div className="row-val">{w.me.score}</div>
        </div>
      )}
    </>
  );
}

function AllTimeBoard({ board, max }: { board: LeaderboardResponse; max: number }) {
  return (
    <>
      <div className="section-title">🏆 {board.type === "driver" ? "Haydovchilar" : "Mijozlar"} · {board.metricLabel}</div>
      <div className="board">
        {board.entries.map((e) => (
          <div key={e.memberId} className={"row glass" + (e.isMe ? " me me-row" : "") + (e.rank <= 3 ? " podium" : "")}>
            <div className="row-rank">{rankMedal(e.rank)}</div>
            <div className="row-main">
              <div className="row-name">
                <span className="row-emoji">{e.level.emoji}</span>
                {e.fullName}
                {e.isMe && <span className="you">Siz</span>}
              </div>
              <div className="row-bar brand-bar"><span style={{ width: `${(e.points / max) * 100}%` }} /></div>
            </div>
            <div className="row-val">{formatNumber(e.points)}</div>
          </div>
        ))}
      </div>
      {board.me && board.me.rank > board.entries.length && (
        <div className="row glass me sticky">
          <div className="row-rank">{rankMedal(board.me.rank)}</div>
          <div className="row-main"><div className="row-name">{board.me.fullName} <span className="you">Siz</span></div></div>
          <div className="row-val">{formatNumber(board.me.points)}</div>
        </div>
      )}
    </>
  );
}

export function LeaderboardView({ board }: { board: LeaderboardResponse }) {
  const [mode, setMode] = useState<"all" | "weekly">("weekly");
  const max = Math.max(1, ...board.entries.map((e) => e.points));
  return (
    <div className="view">
      <div className="seg glass">
        <button className={"seg-btn" + (mode === "weekly" ? " active" : "")} onClick={() => { haptic(); setMode("weekly"); }}>
          ⚡️ Haftalik 🎁
        </button>
        <button className={"seg-btn" + (mode === "all" ? " active" : "")} onClick={() => { haptic(); setMode("all"); }}>
          🏆 Umumiy
        </button>
      </div>
      {mode === "weekly" && <WeeklyBoard />}
      {mode === "all" && <AllTimeBoard board={board} max={max} />}
    </div>
  );
}

// ─── referral ─────────────────────────────────────────────────
// Gap — 3-6 friends, weekly team goal, rotating pot.
function GapSection() {
  const [g, setG] = useState<{ inGap: boolean; name?: string; code?: string; goal?: number; progress?: number; members?: { name: string; rides: number; isCreator: boolean }[] } | null>(null);
  const [mode, setMode] = useState<"none" | "create" | "join">("none");
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const load = () => api.gap().then(setG).catch(() => undefined);
  useEffect(() => {
    load();
  }, []);
  if (!g) return null;

  const act = async () => {
    if (busy || !val.trim()) return;
    setBusy(true);
    try {
      const r = mode === "create" ? await api.gapCreate(val.trim()) : await api.gapJoin(val.trim());
      if (r.ok) {
        setNote(mode === "create" ? `Gap tuzildi! Kod: ${(r as { code?: string }).code}` : "Gapga qo'shildingiz!");
        setMode("none");
        setVal("");
        await load();
      } else {
        const reasons: Record<string, string> = { need_ride: "Avval 1 safar qiling", already_in_gap: "Siz allaqachon gapdasiz", not_found: "Kod topilmadi", full: "Gap to'lgan (max 6)" };
        setNote(reasons[(r as { reason?: string }).reason ?? ""] ?? "Xatolik");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="glass pad">
      <div className="section-title">👬 Gap — do'stlar davrasi</div>
      {g.inGap ? (
        <>
          <p className="muted mk-sub">"{g.name}" · haftalik maqsad: <b>{g.progress}/{g.goal}</b> safar · bajarilsa hammaga +500, rotatsion POT +2000!</p>
          <div className="badge-strip col g4" data-stretch>
            {(g.members ?? []).map((m, i) => (
              <div key={i} className="between">
                <span>{m.isCreator ? "👑 " : ""}{m.name}</span>
                <b>{m.rides} safar</b>
              </div>
            ))}
          </div>
          <p className="muted game-hint">Do'st qo'shish kodi: <b>{g.code}</b></p>
        </>
      ) : mode === "none" ? (
        <>
          <p className="muted mk-sub">3-6 do'st bilan gap tuzing: haftada birga {"~"}8 safar = hammaga +500 tanga, bir kishiga POT +2000 (navbat bilan)!</p>
          <div className="row g8">
            <button className="btn-primary sm" onClick={() => setMode("create")}>+ Gap tuzish</button>
            <button className="btn-ghost sm" onClick={() => setMode("join")}>Kod bilan kirish</button>
          </div>
        </>
      ) : (
        <>
          <input className="bk-input" placeholder={mode === "create" ? "Gap nomi: Mahalla davrasi" : "Kod: ABC123"} value={val} onChange={(e) => setVal(mode === "join" ? e.target.value.toUpperCase() : e.target.value)} />
          <div className="row g8">
            <button className="btn-primary sm" disabled={busy} onClick={act}>{busy ? "…" : "OK"}</button>
            <button className="btn-ghost sm" onClick={() => setMode("none")}>Bekor</button>
          </div>
        </>
      )}
      {note && <div className="sheet-ok mt8">{note}</div>}
    </section>
  );
}

export function ReferralView() {
  const [data, setData] = useState<ReferralResponse | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.referral().then(setData).catch(() => undefined);
  }, []);

  if (!data) return <Spinner />;
  const share = () =>
    shareLink(data.link, "🚕 1067 Taxi — har safardan cashback, o'yinlar bilan coin yutib, so'mga aylantiring! Qo'shiling:");
  const copy = async () => {
    await copyText(data.link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="view">
      <div className="section-title">👥 Do'st taklif qiling</div>

      <GapSection />

      <section className="ref-hero glass">
        <div className="ref-big">🎁</div>
        <div className="ref-line">
          Har do'st uchun <b>ikkalangiz ham</b> tanga olasiz
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
        <StatTile icon="🪙" label="Ishlab topgan" value={`${formatNumber(data.earned)}`} accent="#22c55e" />
      </section>

      <div className="ref-code-label muted">Sizning kodingiz</div>
      <div className="ref-code glass">{data.code}</div>

      <button className="btn-primary" onClick={share}>
        📤 Do'stga yuborish
      </button>
      <button className="btn-ghost" onClick={copy}>
        {copied ? "✅ Nusxa olindi" : "🔗 Havoladan nusxa olish"}
      </button>
    </div>
  );
}
