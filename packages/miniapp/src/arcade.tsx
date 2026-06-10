import { useEffect, useState } from "react";
import {
  BOX_PREMIUM_COST,
  CRASH_STAKES,
  RACE_STAKES,
  WHEEL_PRIZES,
  WHEEL_RESPIN_COST,
  formatNumber,
  type BoxStatusResponse,
  type MeResponse,
} from "@t1067/shared";
import { api } from "./api";
import { haptic } from "./telegram";
import { confetti } from "./util";
import { RaceGame } from "./race";
import { CrashGame } from "./crash";
import { ParkView } from "./park";
import { DuelView } from "./duel";
import { QuizView } from "./quiz";

function SpinWheelGame({ me, onReward }: { me: MeResponse; onReward: (msg: string) => void }) {
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [freeUsed, setFreeUsed] = useState(!me.wheelAvailable);
  const [jackpot, setJackpot] = useState(me.jackpot);
  const N = WHEEL_PRIZES.length;
  const seg = 360 / N;

  const spin = async (respin: boolean) => {
    if (spinning) return;
    setSpinning(true);
    haptic();
    try {
      const res = await api.spinWheel(respin);
      if (res.insufficient) {
        onReward(`🪙 Yetarli coin yo'q (kerak: ${formatNumber(res.respinCost)})`);
        setSpinning(false);
        return;
      }
      if (res.alreadySpun && !respin) {
        setFreeUsed(true);
        setSpinning(false);
        return;
      }
      const idx = Math.max(0, WHEEL_PRIZES.findIndex((p) => p.label === res.prize.label));
      setRotation((prev) => prev - (prev % 360) + 360 * 6 + (360 - (idx * seg + seg / 2)));
      setTimeout(() => {
        setSpinning(false);
        setFreeUsed(true);
        setJackpot(res.jackpot);
        if (res.prize.amount > 0) confetti();
        onReward(
          res.prize.amount > 0
            ? `${res.prize.emoji} +${formatNumber(res.prize.amount)} coin!`
            : `${res.prize.emoji} ${res.prize.label} — yana urinib ko'ring!`,
        );
      }, 4200);
    } catch {
      setSpinning(false);
    }
  };

  return (
    <section className="glass pad game-card">
      <div className="game-head">
        <div className="section-title">🎡 Omad g'ildiragi</div>
        <div className="jackpot-badge">🎰 <b>{formatNumber(jackpot)}</b></div>
      </div>
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
                <path d={`M100 100 L${x0.toFixed(2)} ${y0.toFixed(2)} A96 96 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`} fill={p.color} stroke="#070910" strokeWidth="1" />
                <text x={lx} y={ly} fontSize="17" textAnchor="middle" dominantBaseline="middle" transform={`rotate(${(i + 0.5) * seg} ${lx.toFixed(2)} ${ly.toFixed(2)})`}>
                  {p.emoji}
                </text>
              </g>
            );
          })}
          <circle cx="100" cy="100" r="15" fill="#10182b" stroke="var(--gold)" strokeWidth="2" />
        </svg>
      </div>
      {!freeUsed ? (
        <button className="btn-primary" onClick={() => spin(false)} disabled={spinning}>
          {spinning ? "Aylanmoqda…" : "🎡 BEPUL aylantirish"}
        </button>
      ) : (
        <button className="btn-violet" onClick={() => spin(true)} disabled={spinning}>
          {spinning ? "Aylanmoqda…" : `🪙 ${formatNumber(WHEEL_RESPIN_COST)} — yana aylantirish`}
        </button>
      )}
      <div className="muted game-hint">Har spin JACKPOT'ni oshiradi — JACKPOT tushsa butun jamg'arma sizniki!</div>
    </section>
  );
}

function BoxGame({ onReward }: { onReward: (msg: string) => void }) {
  const [box, setBox] = useState<BoxStatusResponse | null>(null);
  const [busy, setBusy] = useState<"free" | "premium" | null>(null);

  const load = () => api.box().then(setBox).catch(() => undefined);
  useEffect(() => {
    load();
  }, []);

  const open = async (premium: boolean) => {
    if (busy) return;
    setBusy(premium ? "premium" : "free");
    haptic();
    try {
      const r = await api.openBox(premium);
      if (r.ok && r.prize) {
        confetti();
        onReward(`🎁 ${r.prize.emoji} +${formatNumber(r.prize.amount)} coin!`);
      } else if (r.reason === "insufficient") {
        onReward(`🪙 Yetarli coin yo'q (kerak: ${formatNumber(box?.premiumCost ?? BOX_PREMIUM_COST)})`);
      } else if (r.reason === "locked") {
        onReward("🎯 Avval kunlik vazifalarni tugating!");
      }
      await load();
    } catch {
      /* ignore */
    } finally {
      setBusy(null);
    }
  };

  if (!box) return null;
  const pct = Math.round((box.dailiesDone / Math.max(1, box.dailiesTotal)) * 100);

  return (
    <section className="glass pad game-card">
      <div className="section-title">🎁 Sirli qutilar</div>
      <div className="box-duo">
        <div className={"box-tile" + (box.eligible && !box.opened ? " ready" : "")}>
          <div className="box-tile-emoji">{box.opened ? "🎊" : "🎁"}</div>
          <div className="box-tile-name">Bepul quti</div>
          {box.opened && box.prize ? (
            <div className="muted box-tile-sub">Bugun: {box.prize.emoji} {box.prize.label}</div>
          ) : box.eligible ? (
            <button className="btn-primary sm" disabled={busy !== null} onClick={() => open(false)}>
              {busy === "free" ? "…" : "Ochish"}
            </button>
          ) : (
            <>
              <div className="box-bar"><span style={{ width: `${pct}%` }} /></div>
              <div className="muted box-tile-sub">Vazifalar {box.dailiesDone}/{box.dailiesTotal}</div>
            </>
          )}
        </div>
        <div className="box-tile premium">
          <div className="box-tile-emoji">💎</div>
          <div className="box-tile-name">Premium quti</div>
          <div className="muted box-tile-sub">10 000 coin'gacha</div>
          <button className="btn-violet sm" disabled={busy !== null} onClick={() => open(true)}>
            {busy === "premium" ? "…" : `🪙 ${formatNumber(box.premiumCost)}`}
          </button>
        </div>
      </div>
    </section>
  );
}

function StakeGame({
  emoji,
  name,
  desc,
  stakes,
  accent,
  onPick,
}: {
  emoji: string;
  name: string;
  desc: string;
  stakes: readonly number[];
  accent: string;
  onPick: (stake: number) => void;
}) {
  return (
    <section className="glass pad stake-game" style={{ ["--g" as string]: accent }}>
      <div className="stake-head">
        <div className="stake-emoji">{emoji}</div>
        <div>
          <div className="stake-name">{name}</div>
          <div className="muted stake-desc">{desc}</div>
        </div>
      </div>
      <div className="stake-chips">
        {stakes.map((s) => (
          <button key={s} className="stake-chip" onClick={() => { haptic(); onPick(s); }}>
            🪙 {formatNumber(s)}
          </button>
        ))}
      </div>
    </section>
  );
}

type Active = { game: "race" | "crash"; stake: number } | { game: "park" | "duel" | "quiz" } | null;

export function ArcadeView({ me, onReward }: { me: MeResponse; onReward: (msg: string) => void }) {
  const [active, setActive] = useState<Active>(null);

  if (active?.game === "race") return <RaceGame stake={active.stake} onExit={(m) => { if (m) onReward(m); setActive(null); }} />;
  if (active?.game === "crash") return <CrashGame stake={active.stake} onExit={(m) => { if (m) onReward(m); setActive(null); }} />;
  if (active?.game === "park" || active?.game === "duel" || active?.game === "quiz")
    return (
      <div>
        <button className="park-back btn-ghost" onClick={() => setActive(null)}>← Orqaga</button>
        {active.game === "park" && <ParkView onReward={onReward} />}
        {active.game === "duel" && <DuelView onReward={onReward} />}
        {active.game === "quiz" && <QuizView onReward={onReward} />}
      </div>
    );

  return (
    <div className="view">
      <div className="section-title">🎮 Real o'yinlar — coin tiking, yuting</div>
      <StakeGame
        emoji="🏎"
        name="1067 Poyga"
        desc="Boshqa mijozlar bilan poyga — yutsangiz 2x coin"
        stakes={RACE_STAKES}
        accent="#22d3ee"
        onPick={(stake) => setActive({ game: "race", stake })}
      />
      <StakeGame
        emoji="🎰"
        name="Tezlik"
        desc="Koeffitsiyent oshadi — to'xtamasdan oldin yeching"
        stakes={CRASH_STAKES}
        accent="#ef4444"
        onPick={(stake) => setActive({ game: "crash", stake })}
      />
      <section className="glass pad park-entry" onClick={() => setActive({ game: "duel" })}>
        <div className="stake-emoji">⚔️</div>
        <div className="park-entry-body">
          <div className="stake-name">Duel 1v1</div>
          <div className="muted stake-desc">Boshqa mijozga chaqiriq — bir xil trassa, g'olib 2x oladi</div>
        </div>
        <div className="park-entry-go">›</div>
      </section>

      <section className="glass pad park-entry" onClick={() => setActive({ game: "park" })}>
        <div className="stake-emoji">🏙</div>
        <div className="park-entry-body">
          <div className="stake-name">Taksopark</div>
          <div className="muted stake-desc">Taksilar sotib oling — siz uxlasangiz ham coin ishlaydi</div>
        </div>
        <div className="park-entry-go">›</div>
      </section>

      <section className="glass pad park-entry" onClick={() => setActive({ game: "quiz" })}>
        <div className="stake-emoji">🧠</div>
        <div className="park-entry-body">
          <div className="stake-name">Kunlik viktorina</div>
          <div className="muted stake-desc">5 savol — har to'g'risi 100, 5/5 = +500 coin</div>
        </div>
        <div className="park-entry-go">›</div>
      </section>

      <div className="section-title">🎁 Bepul o'yinlar</div>
      <SpinWheelGame me={me} onReward={onReward} />
      <BoxGame onReward={onReward} />
    </div>
  );
}
