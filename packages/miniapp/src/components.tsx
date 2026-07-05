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
import { api, type RideHistoryRow, type RideHistoryResponse } from "./api";
import { copyText, haptic, shareLink, inviteText, inviteLandingUrl } from "./telegram";

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
          ? `🎉 +${formatNumber(r.rewardAmount)} tanga! 🔥 ${r.current} kun streak`
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
          <span ref={(el) => el?.style.setProperty("width", `${pct}%`)} />
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

// P1 (QA fleet): every async view needs an error+retry state — the old `.catch(()=>undefined)`
// left data null forever → a permanent Spinner on any network blip (Render cold start, offline).
export function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="d-empty">
      <div className="d-empty-ico">📡</div>
      <p>Yuklanmadi — internetni tekshirib qayta urinib ko'ring</p>
      <button className="d-btn ghost" onClick={onRetry}>🔄 Qayta urinish</button>
    </div>
  );
}

export function MissionsView({ onReward }: { onReward: (msg: string) => void }) {
  const [data, setData] = useState<MissionsResponse | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  const load = () => {
    setErr(false);
    api.missions().then(setData).catch(() => setErr(true));
  };
  useEffect(() => {
    load();
  }, []);

  const claim = async (code: string) => {
    setBusy(code);
    haptic();
    try {
      const r = await api.claimMission(code);
      if (r.ok) onReward(`🎉 +${formatNumber(r.reward)} tanga!`);
      await load();
    } catch {
      /* ignore */
    } finally {
      setBusy(null);
    }
  };

  if (err && !data) return <LoadError onRetry={load} />;
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
  const [err, setErr] = useState(false);
  const load = () => {
    setErr(false);
    api.weekly().then(setW).catch(() => setErr(true));
  };
  useEffect(() => {
    load();
  }, []);
  if (err && !w) return <LoadError onRetry={load} />;
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
        ⚡️ Ball: kunlik +10 · g'ildirak +10 · vazifa +15 · quti +20 · safar +30 · taklif +50 — dushanbada tanga to'lov · {w.daysLeft} kun qoldi
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
              <div className="row-bar brand-bar"><span ref={(el) => el?.style.setProperty("width", `${(e.score / max) * 100}%`)} /></div>
            </div>
            <div className="row-val">🪙 {e.score.toLocaleString("ru-RU")}</div>
          </div>
        ))}
      </div>
      {w.me && w.me.rank > w.entries.length && (
        <div className="row glass me sticky">
          <div className="row-rank">#{w.me.rank}</div>
          <div className="row-main"><div className="row-name">{w.me.fullName} <span className="you">Siz</span></div></div>
          <div className="row-val">🪙 {w.me.score.toLocaleString("ru-RU")}</div>
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
                <span className="row-tier" style={{ ["--lvl" as string]: e.level.color }}>{e.level.emoji} {e.level.name}</span>
                {e.fullName}
                {e.isMe && <span className="you">Siz</span>}
              </div>
              <div className="row-bar brand-bar"><span ref={(el) => el?.style.setProperty("width", `${(e.trips / max) * 100}%`)} /></div>
            </div>
            <div className="row-val">{formatNumber(e.trips)}</div>
          </div>
        ))}
      </div>
      {board.me && board.me.rank > board.entries.length && (
        <div className="row glass me sticky">
          <div className="row-rank">{rankMedal(board.me.rank)}</div>
          <div className="row-main"><div className="row-name">{board.me.fullName} <span className="you">Siz</span></div></div>
          <div className="row-val">{formatNumber(board.me.trips)}</div>
        </div>
      )}
    </>
  );
}

export function LeaderboardView({ board }: { board: LeaderboardResponse }) {
  const [mode, setMode] = useState<"all" | "weekly">("all");
  const max = Math.max(1, ...board.entries.map((e) => e.trips));
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
  const [err, setErr] = useState(false);
  const load = () => {
    setErr(false);
    api.gap().then(setG).catch(() => setErr(true));
  };
  useEffect(() => {
    load();
  }, []);
  if (err && !g) return <LoadError onRetry={load} />;
  if (!g) return <Spinner />;

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

export function ReferralView({ onClose }: { onClose?: () => void } = {}) {
  const [data, setData] = useState<ReferralResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState(false);

  const load = () => {
    setErr(false);
    api.referral().then(setData).catch(() => setErr(true));
  };
  useEffect(() => {
    load();
  }, []);

  if (err && !data) return <LoadError onRetry={load} />;
  if (!data) return <Spinner />;
  const share = () => shareLink(inviteLandingUrl(data.link), inviteText(data.rewardReferee));
  const copy = async () => {
    await copyText(data.link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="view">
      {onClose && (
        <div className="inv-overlay-head">
          <button className="inv-back" onClick={() => { haptic(); onClose(); }}>← Orqaga</button>
        </div>
      )}
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

// ─── 📜 Safarlar tarixi — per-ride: manzil, sana+soat, km, daqiqa, narx, cashback + jami ──────────
const DONE_STATUS = new Set(["delivered", "completed", "finished", "done"]);
const CANCEL_STATUS = new Set(["cancel_by_operator", "cancel_by_server", "cancelled", "canceled"]);

function rideMinutes(t?: number): number | null {
  if (!t || t <= 0) return null;
  // kas taximeter unit varies (seconds vs minutes). A city ride is < ~180 min; anything bigger is
  // almost certainly seconds → ÷60. Robust for both: 15min→15, 900s→15.
  return t >= 180 ? Math.round(t / 60) : Math.round(t);
}

function fmtWhen(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function RideDetailModal({ r, onClose }: { r: RideHistoryRow; onClose: () => void }) {
  const km = r.distance ? (r.distance / 1000).toFixed(1) : null;
  const mins = rideMinutes(r.time);
  const cancelled = CANCEL_STATUS.has(r.status);
  const statusTxt = DONE_STATUS.has(r.status) ? "🏁 Yakunlandi" : cancelled ? "✖ Bekor qilingan" : "🚕 " + r.status;
  return (
    <div className="rh-modal" onClick={onClose} role="dialog" aria-label="Safar tafsiloti">
      <div className="rh-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="rh-modal-head">
          <span>{statusTxt}</span>
          <button className="rh-modal-x" onClick={onClose}>✕</button>
        </div>
        <div className="rh-modal-addr">📍 {r.addressName || "Manzil"}</div>
        <div className="rh-modal-when">{fmtWhen(r.at)}</div>
        <div className="rh-modal-grid">
          <div className="rh-mg-cell"><div className="rh-mg-val">{km ?? "—"}</div><div className="rh-mg-lab">km</div></div>
          <div className="rh-mg-cell"><div className="rh-mg-val">{mins ?? "—"}</div><div className="rh-mg-lab">daqiqa</div></div>
          <div className="rh-mg-cell"><div className="rh-mg-val">{formatNumber(r.payment || 0)}</div><div className="rh-mg-lab">so'm</div></div>
        </div>
        {(r.carModel || r.carNumber) && (
          <div className="rh-modal-row">🚘 <b>{r.carModel || "—"}</b>{r.carNumber ? <span className="rh-modal-plate">{r.carNumber}</span> : null}</div>
        )}
        {!cancelled && r.cashback > 0 && (
          <div className="rh-modal-row rh-modal-cb">💰 Cashback: <b>+{formatNumber(r.cashback)} so'm</b></div>
        )}
        <button className="rh-modal-close" onClick={onClose}>Yopish</button>
      </div>
    </div>
  );
}

export function RideHistoryView({ onClose }: { onClose?: () => void } = {}) {
  const [data, setData] = useState<RideHistoryResponse | null>(null);
  const [err, setErr] = useState(false);
  const [detail, setDetail] = useState<RideHistoryRow | null>(null);
  const load = () => { setErr(false); setData(null); api.bookingHistory().then(setData).catch(() => setErr(true)); };
  useEffect(load, []);

  const t = data?.totals;
  const rows = data?.rides ?? [];

  return (
    <div className="view">
      {onClose && (
        <div className="inv-overlay-head">
          <button className="inv-back" onClick={() => { haptic(); onClose(); }}>← Orqaga</button>
        </div>
      )}
      <div className="section-title">📜 Safarlar tarixi</div>

      {/* 🎉 Tejash banneri */}
      {t && t.savingsPct > 0 && (
        <section className="rh-hero">
          <div className="rh-hero-pct">{t.savingsPct}%</div>
          <div className="rh-hero-txt">Siz <b>1067</b>'dan foydalanib<br /><b>{t.savingsPct}% tejadingiz</b> 🎉</div>
        </section>
      )}

      {/* Umrbod jami */}
      <section className="rh-summary glass">
        <div className="rh-sum-cell"><div className="rh-sum-val">{t ? t.count : "—"}</div><div className="rh-sum-lab">safar</div></div>
        <div className="rh-sum-cell"><div className="rh-sum-val">{t ? formatNumber(Math.round(t.spent)) : "—"}</div><div className="rh-sum-lab">jami so'm</div></div>
        <div className="rh-sum-cell"><div className="rh-sum-val rh-cb">+{t ? formatNumber(Math.round(t.cashback)) : "—"}</div><div className="rh-sum-lab">cashback</div></div>
      </section>

      {err ? (
        <LoadError onRetry={load} />
      ) : !data ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <p className="muted" style={{ textAlign: "center", padding: "32px 16px" }}>
          🚕 Hali safar yo'q.<br />Birinchi safaringizdan keyin shu yerda ko'rinadi.
        </p>
      ) : (
        <div className="rh-list">
          {rows.map((r) => {
            const km = r.distance ? (r.distance / 1000).toFixed(1) : null;
            const mins = rideMinutes(r.time);
            const icon = DONE_STATUS.has(r.status) ? "🏁" : CANCEL_STATUS.has(r.status) ? "✖" : "🚕";
            const cancelled = CANCEL_STATUS.has(r.status);
            return (
              <div key={r.id} className={"rh-card glass rh-tap" + (cancelled ? " rh-cancelled" : "")} role="button" tabIndex={0} onClick={() => { haptic(); setDetail(r); }}>
                <div className="rh-card-top">
                  <span className="rh-ico">{icon}</span>
                  <span className="rh-addr">{r.addressName || "Manzil"}</span>
                  <span className="rh-when">{fmtWhen(r.at)}</span>
                </div>
                <div className="rh-card-meta">
                  {km && <span className="rh-chip">📍 {km} km</span>}
                  {mins != null && <span className="rh-chip">⏱ {mins} daq</span>}
                  {r.carModel && <span className="rh-chip">🚘 {r.carModel}</span>}
                </div>
                <div className="rh-card-money">
                  <span className="rh-fare">{cancelled ? "Bekor qilingan" : `${formatNumber(r.payment || 0)} so'm`}</span>
                  {!cancelled && r.cashback > 0 && <span className="rh-cb-pill">💰 +{formatNumber(r.cashback)}</span>}
                  <span className="rh-chev">›</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {detail && <RideDetailModal r={detail} onClose={() => { haptic(); setDetail(null); }} />}
    </div>
  );
}
