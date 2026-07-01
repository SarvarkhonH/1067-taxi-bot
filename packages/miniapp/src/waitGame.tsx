// 🪙 "Tanga tutish" — a tiny catch-the-coin game shown ONLY while the rider waits for a driver.
// Purpose: turn the (driver-scarce) wait from dead, anxious time into something playful. Pure fun —
// score + personal best in localStorage, NO tanga emission, so there's no economy/flag risk here
// (a gated on-completion reward can layer on later). It mounts inside the searching sheet and the
// parent unmounts it the instant a driver is found, so it never competes with the "Topildi" moment.
//
// Design rules honored: motion is transform/opacity only; prefers-reduced-motion switches the fall
// for a gentle fade so the coins are tapped in place; every catch fires a light haptic.
import { useEffect, useRef, useState } from "react";
import { haptic } from "./telegram";

interface Coin {
  id: number;
  x: number; // left %, 4..92
  golden: boolean;
  dur: number; // fall duration ms
}

const BEST_KEY = "waitgame_best";
const prefersReduced = (): boolean => {
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  } catch {
    return false;
  }
};

export function WaitGame(): JSX.Element {
  const reduced = useRef(prefersReduced());
  const [coins, setCoins] = useState<Coin[]>([]);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => {
    try {
      return Number(localStorage.getItem(BEST_KEY)) || 0;
    } catch {
      return 0;
    }
  });
  const idRef = useRef(0);

  // spawn loop — a new coin every ~0.62s (0.95s under reduced-motion). Each coin self-removes when it
  // has fallen past the field (a "miss"); catching it removes it early with a score bump.
  useEffect(() => {
    const spawn = () => {
      const id = ++idRef.current;
      const golden = Math.random() < 0.14; // ~1 in 7 is a bonus coin
      const x = 4 + Math.random() * 88;
      const dur = reduced.current ? 4200 : 2400 + Math.random() * 1500;
      setCoins((c) => (c.length > 14 ? c : [...c, { id, x, golden, dur }])); // cap on-screen count
      window.setTimeout(() => setCoins((c) => c.filter((k) => k.id !== id)), dur + 150);
    };
    spawn();
    const iv = window.setInterval(spawn, reduced.current ? 950 : 620);
    return () => window.clearInterval(iv);
  }, []);

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

  const collect = (coin: Coin) => {
    haptic();
    setScore((s) => s + (coin.golden ? 5 : 1));
    setCoins((c) => c.filter((k) => k.id !== coin.id));
  };

  return (
    <div className={`b3wg${reduced.current ? " b3wg-calm" : ""}`}>
      <div className="b3wg-hud">
        <span className="b3wg-score">🪙 {score}</span>
        <span className="b3wg-title">Kutarkansiz — tanga yig'ing!</span>
        <span className="b3wg-best">🏆 {best}</span>
      </div>
      <div className="b3wg-field">
        {coins.map((c) => (
          <button
            key={c.id}
            className={`b3wg-coin${c.golden ? " b3wg-gold" : ""}`}
            style={{ left: `${c.x}%`, animationDuration: `${c.dur}ms` }}
            onClick={() => collect(c)}
            aria-label="tanga"
          >
            {c.golden ? "🌟" : "🪙"}
          </button>
        ))}
      </div>
    </div>
  );
}
