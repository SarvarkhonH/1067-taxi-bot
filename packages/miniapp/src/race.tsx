import { useEffect, useRef, useState } from "react";
import {
  RACE_LANES,
  RACE_STAKES,
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
  const [err, setErr] = useState<string>("");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // mutable game state (refs so the rAF loop sees latest without re-binding)
  const laneRef = useRef(1);
  const tickRef = useRef(0);
  const inputsRef = useRef<number[]>([]);
  const startedAtRef = useRef(0);
  const finishedRef = useRef(false);

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

  const setLane = (lane: number) => {
    if (phase !== "racing" || finishedRef.current) return;
    const l = Math.max(0, Math.min(RACE_LANES - 1, lane));
    if (l === laneRef.current) return;
    laneRef.current = l;
    inputsRef.current.push(tickRef.current, l);
    haptic();
  };

  const finish = async () => {
    if (finishedRef.current || !start) return;
    finishedRef.current = true;
    const inputs = inputsRef.current;
    const { score } = scoreRun(start.seed!, inputs);
    const durationMs = Math.max(RACE_TICKS * RACE_TICK_MS, Date.now() - startedAtRef.current);
    try {
      const r = await api.raceFinish({ sessionId: start.sessionId!, token: start.token!, inputs, durationMs, score, checksum: raceChecksum(inputs) });
      if (r.ok) {
        if (r.won) confetti();
        setResult({ won: r.won, reward: r.reward, serverScore: r.serverScore, ghostScore: r.ghostScore });
      } else {
        setErr(r.reason ?? "xatolik");
      }
      setPhase("result");
    } catch {
      setErr("Natijani yuborib bo'lmadi");
      setPhase("result");
    }
  };

  // ── game loop ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "racing" || !start) return;
    const seed = start.seed!;
    const course = buildCourse(seed);
    const ghostInputs = start.ghost?.inputs ?? null;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const W = (canvas.width = canvas.clientWidth * 2);
    const H = (canvas.height = canvas.clientHeight * 2);
    const laneW = W / RACE_LANES;
    const playerY = H - 130;
    const rowGap = 110;
    const carW = laneW * 0.52;
    const carH = carW * 1.7;
    startedAtRef.current = Date.now();
    let acc = 0;
    let last = performance.now();
    let raf = 0;
    let flash = 0;

    const laneX = (l: number) => laneW * l + laneW / 2;
    const drawCar = (x: number, y: number, color: string, alpha = 1, emoji = "🚕") => {
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
      // lane dividers (scrolling dashes for speed feel)
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
      // obstacles in a window ahead of the player
      for (let k = 0; k <= 6; k++) {
        const ob = course[tick + k];
        if (ob === undefined || ob < 0) continue;
        const y = playerY - k * rowGap;
        ctx.font = `${carH * 0.9}px serif`;
        ctx.fillText("🚧", laneX(ob), y);
      }
      // ghost (semi-transparent) at the player line
      if (ghostInputs) drawCar(laneX(laneAtTick(ghostInputs, tick)), playerY - 4, "#888", 0.4, "🚖");
      // player
      drawCar(laneX(laneRef.current), playerY, "#ffd166", flash > 0 ? 0.4 : 1, "🚕");
      if (flash > 0) flash--;
      // HUD
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = "bold 30px sans-serif";
      ctx.textAlign = "left";
      const pct = Math.round((tick / RACE_TICKS) * 100);
      ctx.fillText(`${pct}%`, 16, 40);
    };

    const step = () => {
      const t = tickRef.current;
      if (course[t] === laneRef.current) flash = 4; // collision flash
      tickRef.current = t + 1;
    };

    const frame = (now: number) => {
      acc += now - last;
      last = now;
      while (acc >= RACE_TICK_MS && tickRef.current < RACE_TICKS) {
        step();
        acc -= RACE_TICK_MS;
      }
      render();
      if (tickRef.current >= RACE_TICKS) {
        void finish();
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, start]);

  // swipe + keyboard
  useEffect(() => {
    let sx = 0;
    const ts = (e: TouchEvent) => (sx = e.touches[0]!.clientX);
    const te = (e: TouchEvent) => {
      const dx = e.changedTouches[0]!.clientX - sx;
      if (Math.abs(dx) > 24) setLane(laneRef.current + (dx > 0 ? 1 : -1));
    };
    window.addEventListener("touchstart", ts);
    window.addEventListener("touchend", te);
    return () => {
      window.removeEventListener("touchstart", ts);
      window.removeEventListener("touchend", te);
    };
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

  return (
    <div className="race-overlay">
      {phase === "racing" && (
        <>
          <div className="race-top">
            <div className="race-vs">
              🚕 Siz <span className="muted">vs</span> 🚖 {start?.ghost?.name ?? "Sharpa yo'q"}
            </div>
            <div className="race-stake muted">Garov: 🪙 {formatNumber(stake)}</div>
          </div>
          <canvas ref={canvasRef} className="race-canvas" />
          <div className="race-controls">
            <button onClick={() => setLane(laneRef.current - 1)}>◀</button>
            <button onClick={() => setLane(laneRef.current + 1)}>▶</button>
          </div>
        </>
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
