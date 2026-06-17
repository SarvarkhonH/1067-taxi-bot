// 🎮 V4 — "Yashil to'lqin": a skill lane-dodge endless-runner. Drive the taxi, dodge
// traffic, chase distance. Skill (not luck), tanga-only, server-capped. Behind feature:tolqin.
import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { haptic } from "./telegram";

type Phase = "ready" | "playing" | "over";
const LANES = 3;
const W = 300;
const H = 480;

export function TolqinGame({ onClose, onReward }: { onClose: () => void; onReward: (m: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("ready");
  const [score, setScore] = useState(0);
  const [token, setToken] = useState("");
  const [result, setResult] = useState<{ granted: number; dailyCap: number; roomLeft: number } | null>(null);
  const st = useRef({ lane: 1, obstacles: [] as { lane: number; y: number }[], speed: 3, dist: 0, raf: 0, spawn: 0, alive: false });

  useEffect(() => {
    api.tolqinStart().then((r) => { if (!r.off) setToken(r.token); }).catch(() => undefined);
    return () => { cancelAnimationFrame(st.current.raf); st.current.alive = false; };
  }, []);

  function gameOver() {
    const s = st.current;
    s.alive = false;
    cancelAnimationFrame(s.raf);
    haptic();
    const finalScore = Math.floor(s.dist / 10);
    setScore(finalScore);
    setPhase("over");
    if (token) {
      api
        .tolqinFinish(token, finalScore)
        .then((r) => {
          if (r.ok) {
            setResult({ granted: r.granted, dailyCap: r.dailyCap, roomLeft: r.roomLeft });
            if (r.granted > 0) onReward(`+${r.granted} tanga! 🎮`);
          }
          api.tolqinStart().then((rr) => { if (!rr.off) setToken(rr.token); }).catch(() => undefined); // next-run token
        })
        .catch(() => undefined);
    }
  }

  function loop() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const laneW = W / LANES;
    const s = st.current;
    const taxiY = H - 56;
    const frame = (): void => {
      if (!s.alive) return;
      s.dist += s.speed;
      s.speed = Math.min(9, 3 + s.dist / 1400);
      s.spawn -= s.speed;
      if (s.spawn <= 0) {
        s.obstacles.push({ lane: Math.floor(Math.random() * LANES), y: -40 });
        s.spawn = 130 + Math.random() * 80;
      }
      for (const o of s.obstacles) {
        o.y += s.speed;
        if (o.lane === s.lane && o.y > taxiY - 28 && o.y < taxiY + 28) {
          gameOver();
          return;
        }
      }
      s.obstacles = s.obstacles.filter((o) => o.y < H + 40);
      setScore(Math.floor(s.dist / 10));
      ctx.fillStyle = "#0f1622";
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(255,255,255,.07)";
      ctx.setLineDash([14, 14]);
      for (let i = 1; i < LANES; i++) {
        ctx.beginPath();
        ctx.moveTo(i * laneW, 0);
        ctx.lineTo(i * laneW, H);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.font = "30px serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const o of s.obstacles) ctx.fillText("🚗", o.lane * laneW + laneW / 2, o.y);
      ctx.fillText("🚕", s.lane * laneW + laneW / 2, taxiY);
      s.raf = requestAnimationFrame(frame);
    };
    s.raf = requestAnimationFrame(frame);
  }

  function start() {
    if (!token) {
      onReward("Boshlab bo'lmadi — qayta urinib ko'ring");
      return;
    }
    haptic();
    const s = st.current;
    s.lane = 1;
    s.obstacles = [];
    s.speed = 3;
    s.dist = 0;
    s.spawn = 0;
    s.alive = true;
    setScore(0);
    setResult(null);
    setPhase("playing");
    loop();
  }

  function move(dir: -1 | 1) {
    const s = st.current;
    if (!s.alive) return;
    s.lane = Math.max(0, Math.min(LANES - 1, s.lane + dir));
    haptic();
  }

  return (
    <div className="tolqin-overlay">
      <div className="tolqin-head">
        <button className="tolqin-x" onClick={() => { st.current.alive = false; cancelAnimationFrame(st.current.raf); onClose(); }}>✕</button>
        <div className="tolqin-score">🟢 {score}</div>
      </div>
      <div
        className="tolqin-stage"
        onPointerDown={(e) => {
          if (phase !== "playing") return;
          move(e.clientX < window.innerWidth / 2 ? -1 : 1);
        }}
      >
        <canvas ref={canvasRef} width={W} height={H} className="tolqin-canvas" />
        {phase !== "playing" && (
          <div className="tolqin-modal">
            {phase === "ready" ? (
              <>
                <div className="tolqin-title">🟢 Yashil to'lqin</div>
                <p className="muted">Taksini boshqar, mashinalardan qoch! Ekranning chap/o'ng tomonini bos. Mahorat — omad emas. Tanga yut (kunlik chegara bilan).</p>
                <button className="tolqin-play" onClick={start} disabled={!token}>{token ? "▶️ Boshlash" : "Yuklanmoqda…"}</button>
              </>
            ) : (
              <>
                <div className="tolqin-title">Tugadi! 🟢 {score}</div>
                {result && (
                  <p className="muted">
                    {result.granted > 0 ? `+${result.granted} tanga 🪙` : "Bugungi tanga chegarasi to'ldi"} · qoldi {result.roomLeft}/{result.dailyCap}
                  </p>
                )}
                <button className="tolqin-play" onClick={start} disabled={!token}>🔁 Qayta o'ynash</button>
              </>
            )}
          </div>
        )}
      </div>
      <div className="tolqin-controls">
        <button onClick={() => move(-1)}>◀️</button>
        <button onClick={() => move(1)}>▶️</button>
      </div>
    </div>
  );
}
