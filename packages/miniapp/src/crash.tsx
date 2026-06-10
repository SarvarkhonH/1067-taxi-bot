import { useEffect, useRef, useState } from "react";
import {
  CRASH_MAX_MULT,
  CRASH_ROUND_MAX_MS,
  crashMultiplierAt,
  formatNumber,
  type CrashCashoutResponse,
  type CrashStartResponse,
} from "@t1067/shared";
import { api } from "./api";
import { haptic } from "./telegram";
import { confetti } from "./util";

type Phase = "loading" | "flying" | "result" | "error";

export function CrashGame({ stake, onExit }: { stake: number; onExit: (msg?: string) => void }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [mult, setMult] = useState(1.0);
  const [res, setRes] = useState<CrashCashoutResponse | null>(null);
  const [err, setErr] = useState("");
  const roundRef = useRef<CrashStartResponse | null>(null);
  const startedAtRef = useRef(0);
  const cashedRef = useRef(false);

  useEffect(() => {
    let alive = true;
    api
      .crashStart(stake)
      .then((r) => {
        if (!alive) return;
        if (!r.ok) {
          setErr(r.reason === "insufficient" ? "Coin yetarli emas" : "Boshlab bo'lmadi");
          setPhase("error");
          return;
        }
        roundRef.current = r;
        startedAtRef.current = Date.now();
        setPhase("flying");
      })
      .catch(() => {
        setErr("Aloqa xatosi");
        setPhase("error");
      });
    return () => {
      alive = false;
    };
  }, [stake]);

  const cashout = async () => {
    if (cashedRef.current || !roundRef.current?.roundId) return;
    cashedRef.current = true;
    haptic();
    try {
      const r = await api.crashCashout(roundRef.current.roundId);
      if (r.won) confetti();
      setRes(r);
      setPhase("result");
    } catch {
      setErr("Yechib bo'lmadi");
      setPhase("result");
    }
  };

  // climbing loop
  useEffect(() => {
    if (phase !== "flying") return;
    let raf = 0;
    const tick = () => {
      const elapsed = Date.now() - startedAtRef.current;
      setMult(crashMultiplierAt(elapsed));
      if (elapsed >= CRASH_ROUND_MAX_MS || crashMultiplierAt(elapsed) >= CRASH_MAX_MULT) {
        void cashout(); // safety auto-cashout
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  if (phase === "loading") return <div className="race-overlay"><div className="spinner" /></div>;
  if (phase === "error")
    return (
      <div className="race-overlay">
        <div className="race-msg">{err}</div>
        <button className="btn-ghost race-close" onClick={() => onExit()}>Ortga</button>
      </div>
    );

  const danger = mult > 2.5;
  return (
    <div className="race-overlay crash-bg">
      {phase === "flying" && (
        <div className="crash-stage">
          <div className="crash-stake muted">Garov: 🪙 {formatNumber(stake)}</div>
          <div className={"crash-mult" + (danger ? " danger" : "")}>{mult.toFixed(2)}x</div>
          <div className="crash-taxi" style={{ transform: `translateY(${-Math.min(220, (mult - 1) * 60)}px) translateX(${Math.min(120, (mult - 1) * 30)}px)` }}>🚕💨</div>
          <div className="crash-potential">Hozir yechsangiz: 🪙 {formatNumber(Math.floor(stake * mult))}</div>
          <button className="btn-primary crash-cashout" onClick={cashout}>
            💰 YECHIB OLISH ({mult.toFixed(2)}x)
          </button>
          <div className="muted crash-hint">Tezroq yeching — dvigatel istalgan payt to'xtashi mumkin!</div>
        </div>
      )}
      {phase === "result" && res && (
        <div className="race-result">
          <div className="race-result-emoji">{res.won ? (res.golden ? "🎰" : "💰") : "💥"}</div>
          <div className="race-result-title">{res.won ? (res.golden ? "GOLDEN!" : `${res.multiplier.toFixed(2)}x!`) : "To'xtab qoldi!"}</div>
          {res.won ? (
            <div className="race-reward">🪙 +{formatNumber(res.payout)} coin</div>
          ) : (
            <div className="muted">💥 Dvigatel {res.crashPoint.toFixed(2)}x da to'xtadi — biroz erta yeching!</div>
          )}
          <button className="btn-primary" onClick={() => onExit(res.won ? `💰 +${formatNumber(res.payout)} coin!` : undefined)}>
            Davom etish
          </button>
        </div>
      )}
      {phase === "result" && !res && (
        <div className="race-result">
          <div className="race-msg">{err}</div>
          <button className="btn-ghost race-close" onClick={() => onExit()}>Ortga</button>
        </div>
      )}
    </div>
  );
}
