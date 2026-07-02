// 🪙 "Tanga terish" — tap-anywhere-to-collect, shown ONLY while the rider waits for a driver.
// Purpose: turn the (driver-scarce) wait from dead, anxious time into something playful AND —
// when feature "waitcomp" is ON — into REAL tanga: compensation for OUR failure to match a driver
// fast, scaled by how long the search actually took. The score shown here is a fun, ENGAGEMENT gate
// only (must have played, not just left the app open); the real payout is computed SERVER-SIDE at
// ride-finish from server-timed wait duration (bookingNotifier + cashbackService.awardWaitComp), so
// nothing here is trusted for money — an inflated client score can never exceed the honest ceiling.
// The `waitComp` prop (from getBookingInfo, null when the flag is OFF) drives an honest LIVE preview
// of that same ceiling so riders can watch the potential payout grow while they wait.
//
// Mechanic: every tap on the field is a GUARANTEED hit (no catching/missing) — a coin pops from the
// tap point with a light bounce; keep tapping for more. Chosen over a falling-object catch game so a
// rider glancing at their phone one-handed never "fails" — every tap pays off, matching the design
// rule that every tap needs <100ms visual feedback.
import { useEffect, useRef, useState } from "react";
import { haptic } from "./telegram";
import { api } from "./api";
import { formatNumber } from "@t1067/shared";

interface Pop {
  id: number;
  x: number; // px within the field, at tap point
  y: number;
  golden: boolean;
  dx: number; // arc drift, px
  dy: number;
}

interface WaitGameProps {
  waitComp: { graceSec: number; fullSec: number; ceiling: number } | null; // null = flag OFF, no preview
}

const BEST_KEY = "waitgame_best";
const TAP_COOLDOWN_MS = 90; // guards against a single press registering twice, not a real rate limit
const prefersReduced = (): boolean => {
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  } catch {
    return false;
  }
};

export function WaitGame({ waitComp }: WaitGameProps): JSX.Element {
  const reduced = useRef(prefersReduced());
  // best-effort "search start" = when this game mounted (i.e. the searching sheet appeared). Slightly
  // undercounts a wait that was already in progress before a page reload — safe direction (never
  // shows a bigger number than the server will actually honor).
  const mountedAt = useRef(Date.now());
  const [pops, setPops] = useState<Pop[]>([]);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => {
    try {
      return Number(localStorage.getItem(BEST_KEY)) || 0;
    } catch {
      return 0;
    }
  });
  const idRef = useRef(0);
  const lastTapAt = useRef(0);
  const [, forceTick] = useState(0); // re-render periodically so the live preview visibly grows

  useEffect(() => {
    if (!waitComp) return; // flag OFF — nothing to preview, no need to keep re-rendering
    const iv = window.setInterval(() => forceTick((n) => n + 1), 1000);
    return () => window.clearInterval(iv);
  }, [waitComp]);

  useEffect(() => {
    if (score > best) {
      setBest(score);
      try {
        localStorage.setItem(BEST_KEY, String(score));
      } catch {
        /* private mode — best is session-only */
      }
    }
  }, [score, best]);

  // report the running score to the server (throttled well under the 20/min rate limit) so
  // awardWaitComp has an engagement signal at ride-finish. Fire-and-forget: money never depends
  // on this succeeding — the worst case is a missed report, which the next tick or finish-time
  // read makes up for (the server keeps the HIGHEST score it has seen for this ride).
  const scoreRef = useRef(0);
  scoreRef.current = score;
  useEffect(() => {
    if (!waitComp) return; // flag OFF — no point reporting, nothing will be paid
    const iv = window.setInterval(() => {
      if (scoreRef.current > 0) void api.bookingWaitScore(scoreRef.current).catch(() => undefined);
    }, 6000);
    return () => window.clearInterval(iv);
  }, [waitComp]);

  const tap = (e: React.PointerEvent<HTMLDivElement>) => {
    const now = Date.now();
    if (now - lastTapAt.current < TAP_COOLDOWN_MS) return; // ignore a double-fire on one press
    lastTapAt.current = now;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const golden = Math.random() < 0.12; // ~1 in 8 taps is a bonus pop
    haptic();
    setScore((s) => s + (golden ? 5 : 1));
    const id = ++idRef.current;
    const dx = reduced.current ? 0 : Math.random() * 70 - 35;
    const dy = reduced.current ? 0 : -40 - Math.random() * 30;
    setPops((p) => [...p, { id, x, y, golden, dx, dy }]);
    window.setTimeout(() => setPops((p) => p.filter((k) => k.id !== id)), 720);
  };

  // honest live preview of the compensation ceiling — mirrors awardWaitComp's grace→ramp formula
  // exactly (cashbackService.ts) so the number shown here never overstates what the server will
  // actually pay. Only shown once the player has engaged (score>0), matching the server's gate.
  let previewSom = 0;
  if (waitComp && score > 0) {
    const { graceSec, fullSec, ceiling } = waitComp;
    const elapsedSec = Math.floor((Date.now() - mountedAt.current) / 1000);
    const span = Math.max(1, fullSec - graceSec);
    const effective = Math.max(0, Math.min(elapsedSec, fullSec) - graceSec);
    previewSom = Math.floor(ceiling * (effective / span));
  }

  return (
    <div className="b3wg">
      <div className="b3wg-hud">
        <span className="b3wg-score">🪙 {score}</span>
        <span className="b3wg-title">Ekranga bosing — tanga tering!</span>
        <span className="b3wg-best">🏆 {best}</span>
      </div>
      {waitComp && (
        <div className="b3wg-comp">{previewSom > 0 ? `Hozircha: +${formatNumber(previewSom)} tanga (safar tugasa)` : "Bosing — kutish uchun tanga ishlaysiz"}</div>
      )}
      <div className="b3wg-field" onPointerDown={tap}>
        <div className={`b3wg-pile${pops.length ? " b3wg-hit" : ""}`}>{score > 0 ? score : "bosing"}</div>
        {pops.length === 0 && <div className="b3wg-hint">barmog'ingiz bilan bosib turing</div>}
        {pops.map((p) => (
          <div
            key={p.id}
            className={`b3wg-pop${p.golden ? " b3wg-gold" : ""}`}
            style={{ left: p.x, top: p.y, ["--dx" as string]: `${p.dx}px`, ["--dy" as string]: `${p.dy}px` }}
            aria-hidden="true"
          >
            {p.golden ? "+5" : "+1"}
          </div>
        ))}
      </div>
    </div>
  );
}
