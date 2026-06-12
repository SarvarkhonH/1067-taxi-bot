// T1 — Omad g'ildiragi: 3+ to'liq aylanish, cubic-bezier(0.17,0.67,0.12,0.99),
// aylanayotganda sekinlashuvchi "tik-tik" haptic. Sof ko'rinish komponenti.
import { useEffect, useRef, useState } from "react";
import { haptic } from "../telegram";

export interface WheelPrize {
  label: string;
  emoji: string;
  color: string;
}

export const SPIN_MS = 2800;

export function RouletteWheel({
  prizes,
  targetIndex,
  spinId,
  onDone,
}: {
  prizes: WheelPrize[];
  /** null = tinch; soni — yutuq segmenti. spinId har spinda o'ssin. */
  targetIndex: number | null;
  spinId: number;
  onDone?: () => void;
}) {
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const N = prizes.length;
  const seg = 360 / N;
  const ticker = useRef<number | null>(null);

  useEffect(() => {
    if (targetIndex === null || spinId === 0) return;
    setSpinning(true);
    // 4 to'liq aylanish + segment markazi tepadagi ko'rsatkichga
    setRotation((prev) => prev - (prev % 360) + 360 * 4 + (360 - (targetIndex * seg + seg / 2)));
    // sekinlashuvchi tik-tik (taxminan bezier profiliga mos)
    let elapsed = 0;
    const tick = (delay: number) => {
      ticker.current = window.setTimeout(() => {
        haptic();
        elapsed += delay;
        if (elapsed < SPIN_MS - 320) tick(Math.min(340, delay * 1.28));
      }, delay);
    };
    tick(70);
    const done = window.setTimeout(() => {
      setSpinning(false);
      onDone?.();
    }, SPIN_MS + 80);
    return () => {
      if (ticker.current) clearTimeout(ticker.current);
      clearTimeout(done);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinId]);

  return (
    <div className="wheel-wrap">
      <div className="wheel-pointer">▼</div>
      <svg
        viewBox="0 0 200 200"
        className="wheel"
        style={{ transform: `rotate(${rotation}deg)`, transition: spinning ? `transform ${SPIN_MS}ms var(--ease-spin)` : "none" }}
      >
        {prizes.map((p, i) => {
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
              <path d={`M100 100 L${x0.toFixed(2)} ${y0.toFixed(2)} A96 96 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`} fill={p.color} stroke="var(--bg)" strokeWidth="1" />
              <text x={lx} y={ly} fontSize="17" textAnchor="middle" dominantBaseline="middle" transform={`rotate(${(i + 0.5) * seg} ${lx.toFixed(2)} ${ly.toFixed(2)})`}>
                {p.emoji}
              </text>
            </g>
          );
        })}
        <circle cx="100" cy="100" r="15" fill="var(--surface)" stroke="var(--brand)" strokeWidth="2" />
      </svg>
    </div>
  );
}
