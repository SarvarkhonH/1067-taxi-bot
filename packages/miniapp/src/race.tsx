import { useEffect, useRef, useState } from "react";
import {
  RACE_LANES,
  RACE_TICKS,
  RACE_TICK_MS,
  buildCourse,
  formatNumber,
  laneAtTick,
  raceChecksum,
  scoreRun,
  type RaceStartResponse,
} from "@t1067/shared";
import { api } from "./api";
import { haptic } from "./telegram";
import { confetti } from "./util";

/** A finished local run, ready for server validation. */
export interface RunPayload {
  inputs: number[];
  durationMs: number;
  score: number;
  checksum: string;
}

/**
 * The deterministic lane-dodge taxi game (canvas + swipe/tap controls).
 * Reused by ghost races AND duels — only the start/finish wiring differs.
 */
export function RaceCanvasGame({
  seed,
  ghostInputs,
  topLeft,
  topRight,
  onDone,
}: {
  seed: number;
  ghostInputs: number[] | null;
  topLeft: string;
  topRight: string;
  onDone: (run: RunPayload) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const laneRef = useRef(1);
  const tickRef = useRef(0);
  const inputsRef = useRef<number[]>([]);
  const playMsRef = useRef(0); // active play time only (excludes backgrounded/stalled gaps)
  const finishedRef = useRef(false);

  const setLane = (lane: number) => {
    if (finishedRef.current) return;
    const l = Math.max(0, Math.min(RACE_LANES - 1, lane));
    if (l === laneRef.current) return;
    laneRef.current = l;
    inputsRef.current.push(tickRef.current, l);
    haptic();
  };

  useEffect(() => {
    const course = buildCourse(seed);
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const W = (canvas.width = canvas.clientWidth * 2);
    const H = (canvas.height = canvas.clientHeight * 2);
    const laneW = W / RACE_LANES;
    const playerY = H - 130;
    const rowGap = 110;
    const carH = laneW * 0.52 * 1.7;
    playMsRef.current = 0;
    let acc = 0;
    let last = performance.now();
    // A backgrounded tab pauses rAF; on return `now - last` is huge. Clamp it so the
    // course never fast-forwards (which would crash the player into every obstacle).
    const MAX_FRAME_MS = RACE_TICK_MS * 5;
    let raf = 0;
    let flash = 0;

    const laneX = (l: number) => laneW * l + laneW / 2;
    const drawCar = (x: number, y: number, alpha: number, emoji: string) => {
      ctx.globalAlpha = alpha;
      ctx.font = `${carH}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(emoji, x, y);
      ctx.globalAlpha = 1;
    };

    const render = () => {
      const tick = tickRef.current;
      ctx.fillStyle = "#0a0e18";
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 3;
      const scroll = (tick * 18) % 60;
      for (let i = 1; i < RACE_LANES; i++) {
        const x = laneW * i;
        for (let y = -60 + scroll; y < H; y += 60) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x, y + 30);
          ctx.stroke();
        }
      }
      for (let k = 0; k <= 6; k++) {
        const ob = course[tick + k];
        if (ob === undefined || ob < 0) continue;
        ctx.font = `${carH * 0.9}px serif`;
        ctx.fillText("🚧", laneX(ob), playerY - k * rowGap);
      }
      if (ghostInputs) drawCar(laneX(laneAtTick(ghostInputs, tick)), playerY - 4, 0.4, "🚖");
      drawCar(laneX(laneRef.current), playerY, flash > 0 ? 0.4 : 1, "🚕");
      if (flash > 0) flash--;
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = "bold 30px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`${Math.round((tick / RACE_TICKS) * 100)}%`, 16, 40);
    };

    const frame = (now: number) => {
      const dt = Math.min(now - last, MAX_FRAME_MS); // ignore time spent backgrounded/stalled
      last = now;
      acc += dt;
      playMsRef.current += dt; // anti-cheat duration is real play time, not wall-clock
      while (acc >= RACE_TICK_MS && tickRef.current < RACE_TICKS) {
        if (course[tickRef.current] === laneRef.current) flash = 4;
        tickRef.current++;
        acc -= RACE_TICK_MS;
      }
      render();
      if (tickRef.current >= RACE_TICKS) {
        if (!finishedRef.current) {
          finishedRef.current = true;
          const inputs = inputsRef.current;
          const { score } = scoreRun(seed, inputs);
          onDone({
            inputs,
            durationMs: Math.round(playMsRef.current),
            score,
            checksum: raceChecksum(inputs),
          });
        }
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    let sx = 0;
    const ts = (e: TouchEvent) => (sx = e.touches[0]!.clientX);
    const te = (e: TouchEvent) => {
      const dx = e.changedTouches[0]!.clientX - sx;
      if (Math.abs(dx) > 24) setLane(laneRef.current + (dx > 0 ? 1 : -1));
    };
    // Returning from background: drop the stale gap so no catch-up tick runs.
    const onVis = () => {
      if (!document.hidden) last = performance.now();
    };
    window.addEventListener("touchstart", ts);
    window.addEventListener("touchend", te);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("touchstart", ts);
      window.removeEventListener("touchend", te);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  return (
    <>
      <div className="race-top">
        <div className="race-vs">{topLeft}</div>
        <div className="race-stake muted">{topRight}</div>
      </div>
      <canvas ref={canvasRef} className="race-canvas" />
      <div className="race-controls">
        <button onClick={() => setLane(laneRef.current - 1)}>◀</button>
        <button onClick={() => setLane(laneRef.current + 1)}>▶</button>
      </div>
    </>
  );
}

// ─── staked ghost race (vs another client's recorded run) ─────────────────────
type Phase = "loading" | "racing" | "result" | "error";

interface Result {
  won: boolean;
  reward: number;
  serverScore: number;
  ghostScore: number;
}

export function RaceGame({ stake, onExit }: { stake: number; onExit: (msg?: string) => void }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [start, setStart] = useState<RaceStartResponse | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    api
      .raceStart(stake)
      .then((r) => {
        if (!alive) return;
        if (!r.ok) {
          setErr(r.reason === "insufficient" ? "Coin yetarli emas" : "Boshlab bo'lmadi");
          setPhase("error");
          return;
        }
        setStart(r);
        setPhase("racing");
      })
      .catch(() => {
        setErr("Aloqa xatosi");
        setPhase("error");
      });
    return () => {
      alive = false;
    };
  }, [stake]);

  const onDone = async (run: RunPayload) => {
    if (!start) return;
    try {
      const r = await api.raceFinish({ sessionId: start.sessionId!, token: start.token!, ...run });
      if (r.ok) {
        if (r.won) confetti();
        setResult({ won: r.won, reward: r.reward, serverScore: r.serverScore, ghostScore: r.ghostScore });
      } else {
        setErr(r.reason ?? "xatolik");
      }
    } catch {
      setErr("Natijani yuborib bo'lmadi");
    }
    setPhase("result");
  };

  if (phase === "loading") return <div className="race-overlay"><div className="spinner" /></div>;
  if (phase === "error")
    return (
      <div className="race-overlay">
        <div className="race-msg">{err}</div>
        <button className="btn-ghost race-close" onClick={() => onExit()}>Ortga</button>
      </div>
    );

  return (
    <div className="race-overlay">
      {phase === "racing" && start && (
        <RaceCanvasGame
          seed={start.seed!}
          ghostInputs={start.ghost?.inputs ?? null}
          topLeft={`🚕 Siz vs 🚖 ${start.ghost?.name ?? "Sharpa yo'q"}`}
          topRight={`Garov: 🪙 ${formatNumber(stake)}`}
          onDone={onDone}
        />
      )}
      {phase === "result" && result && (
        <div className="race-result">
          <div className="race-result-emoji">{result.won ? "🏆" : "🏁"}</div>
          <div className="race-result-title">{result.won ? "G'ALABA!" : "Yutqazdingiz"}</div>
          <div className="race-scores">
            <div><b>{formatNumber(result.serverScore)}</b><span className="muted">Siz</span></div>
            <div className="race-vs-mid">vs</div>
            <div><b>{formatNumber(result.ghostScore)}</b><span className="muted">Raqib</span></div>
          </div>
          {result.won ? (
            <div className="race-reward">🪙 +{formatNumber(result.reward)} coin</div>
          ) : (
            <div className="muted">Keyingi safar tezroq bo'ling!</div>
          )}
          <button className="btn-primary" onClick={() => onExit(result.won ? `🏆 +${formatNumber(result.reward)} coin!` : undefined)}>
            Davom etish
          </button>
        </div>
      )}
      {phase === "result" && !result && (
        <div className="race-result">
          <div className="race-msg">{err}</div>
          <button className="btn-ghost race-close" onClick={() => onExit()}>Ortga</button>
        </div>
      )}
    </div>
  );
}
