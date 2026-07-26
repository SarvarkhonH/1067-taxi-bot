import { useEffect, useRef, useState } from "react";

/** Compress a picked photo to ≤maxSide JPEG data-URL — uploads stay small on village internet.
 *  Shared by any feature that lets a rider attach their own photos (shop reviews, e'lon post). */
export async function compressImage(file: File, maxSide = 900, quality = 0.78): Promise<string | null> {
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((ok, no) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = no;
      i.src = url;
    });
    const k = Math.min(1, maxSide / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * k);
    canvas.height = Math.round(img.height * k);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return null;
  }
}

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

/** Honest load-failure copy. The old text blamed the user's internet for EVERY failure — including
 *  the Telegram-initData auth race (fixed in api.ts, 2026-07-26), where the connection was fine and
 *  the advice was simply wrong. Only claim a network problem when the browser actually reports one. */
export function loadErrorText(): string {
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  return offline ? "Internet aloqasi yo'q — ulanib qayta urining" : "Yuklanmadi — qayta urinib ko'ring";
}
