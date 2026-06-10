import { useEffect, useRef, useState } from "react";

/** Animates a number toward `target` (slot-machine count-up for balances). */
export function useCountUp(target: number, ms = 700): number {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

/** Lightweight DOM confetti burst — no canvas, no deps. */
export function confetti(count = 26): void {
  const host = document.createElement("div");
  host.className = "confetti-host";
  const pieces = ["🪙", "✨", "🎉", "💛", "💎"];
  for (let i = 0; i < count; i++) {
    const s = document.createElement("span");
    s.className = "confetti-piece";
    s.textContent = pieces[i % pieces.length]!;
    s.style.left = `${8 + Math.random() * 84}%`;
    s.style.animationDelay = `${Math.random() * 0.25}s`;
    s.style.animationDuration = `${0.9 + Math.random() * 0.8}s`;
    s.style.fontSize = `${14 + Math.random() * 14}px`;
    host.appendChild(s);
  }
  document.body.appendChild(host);
  setTimeout(() => host.remove(), 2200);
}
