// T1 DIZAYN TIZIMI — komponent kutubxonasi. Stil manbai: design/tokens.css.
// Hech qanday API-mutatsiya yo'q — bular sof ko'rinish qatlam.
import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from "react";
import { haptic } from "../telegram";
import { useCountUp } from "../util";
import { loadErrorText } from "../util";

export function Button({
  children,
  variant = "brand",
  sm,
  pulseWhenEnabled,
  disabled,
  onClick,
  className = "",
}: {
  children: ReactNode;
  variant?: "brand" | "ghost" | "danger";
  sm?: boolean;
  pulseWhenEnabled?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const wasDisabled = useRef(disabled);
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    if (pulseWhenEnabled && wasDisabled.current && !disabled) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 750);
      return () => clearTimeout(t);
    }
    wasDisabled.current = disabled;
  }, [disabled, pulseWhenEnabled]);
  return (
    <button
      className={`d-btn ${variant !== "brand" ? variant : ""} ${sm ? "sm" : ""} ${pulse ? "pulse-enable" : ""} ${className}`.trim()}
      disabled={disabled}
      onClick={() => {
        haptic();
        onClick?.();
      }}
    >
      {children}
    </button>
  );
}

export function Card({ children, className = "", sheen }: { children: ReactNode; className?: string; sheen?: boolean }) {
  return <section className={`d-card ${sheen ? "d-sheen" : ""} ${className}`.trim()}>{children}</section>;
}

export function Chip({ children, on, onClick, className = "", disabled }: { children: ReactNode; on?: boolean; onClick?: () => void; className?: string; disabled?: boolean }) {
  return (
    <button className={`d-chip ${on ? "on" : ""} ${className}`.trim()} disabled={disabled} onClick={() => { haptic(); onClick?.(); }}>
      {children}
    </button>
  );
}

/** Pastdan chiqadigan sheet — 4 usulda yopiladi: sticky bar'ni tortish (chuqur scroll'da ham),
 *  kontentni tepasida turib pastga tortish, ✕ tugma, fon-bosish. */
export function Sheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  // Native non-passive listener shart: React'ning sintetik touchmove'i passive (preventDefault
  // ishlamaydi) — preventDefault'siz tortish-gesture Telegram webview'ga o'tib BUTUN appni
  // yopadi/minimallaydi (ega: "tushurish juda qiyin" shikoyatining ildizi).
  useEffect(() => {
    const el = ref.current;
    if (!open || !el) return;
    let y0 = 0, dy = 0, engaged = false, eligible = false, closing = false;
    const start = (e: TouchEvent) => {
      y0 = e.touches[0]!.clientY;
      dy = 0;
      engaged = false;
      // sticky bar'dan tortish HAR DOIM yopadi; kontentdan — faqat ro'yxat tepasida turganda
      eligible = (e.target instanceof Element && !!e.target.closest(".d-sheet-bar")) || el.scrollTop <= 0;
    };
    const move = (e: TouchEvent) => {
      if (closing) return;
      const d = e.touches[0]!.clientY - y0;
      if (!engaged) {
        if (!eligible || el.scrollTop > 0 || d < 10) return;
        engaged = true;
        el.style.transition = "none";
      }
      dy = Math.max(0, d - 10);
      if (e.cancelable) e.preventDefault();
      el.style.transform = `translateY(${dy}px)`;
    };
    const end = () => {
      if (!engaged) return;
      engaged = false;
      el.style.transition = "transform 240ms cubic-bezier(.22, 1, .36, 1)";
      if (dy > 96) {
        closing = true;
        el.style.transform = "translateY(110%)"; // sirg'alib tushadi, keyin unmount
        setTimeout(onClose, 200);
      } else {
        el.style.transform = ""; // yumshoq qaytish
      }
      dy = 0;
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="d-sheet-back" onClick={onClose}>
      <div ref={ref} className="d-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="d-sheet-bar">
          <div className="d-grip" />
          <button className="d-sheet-x" onClick={onClose} aria-label="Yopish">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ProgressBar({ value, max = 100, className = "" }: { value: number; max?: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div className={`d-progress ${pct >= 100 ? "full" : ""} ${className}`.trim()}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Balans — countup + raqam almashganda "aylanish" (WOW-2). */
export function CoinCounter({ value, className = "", style }: { value: number; className?: string; style?: CSSProperties }) {
  const v = useCountUp(value);
  const [rolling, setRolling] = useState(false);
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current !== value) {
      setRolling(true);
      const t = setTimeout(() => setRolling(false), 380);
      prev.current = value;
      return () => clearTimeout(t);
    }
  }, [value]);
  return (
    <span className={`d-coin ${rolling ? "rolling" : ""} ${className}`.trim()} style={style}>
      {Math.round(v).toLocaleString("ru-RU")}
    </span>
  );
}

/** Streak olovi — `lit` berilganda "yonadi" (WOW-9). */
export function StreakFlame({ days, lit }: { days: number; lit?: boolean }) {
  return (
    <span className={`d-flame ${lit ? "lit" : ""}`.trim()}>🔥{days > 0 ? ` ${days}` : ""}</span>
  );
}

export function Skeleton({ h = 14, w, className = "" }: { h?: number; w?: string; className?: string }) {
  return <div className={`d-skel ${className}`.trim()} style={{ height: h, width: w }} />;
}

export function EmptyState({ icon = "🗂", text, action, onAction }: { icon?: string; text: string; action?: string; onAction?: () => void }) {
  return (
    <div className="d-empty">
      <div className="d-empty-ico">{icon}</div>
      <p>{text}</p>
      {action && onAction && (
        <Button variant="ghost" sm onClick={onAction}>
          {action}
        </Button>
      )}
    </div>
  );
}

/** To'liq-ekran rasm ko'ruvchi (shop bo'limidan ko'chirilgan, endi umumiy): gorizontal scroll-snap
 *  barcha rasmlar bo'ylab, ‹ Orqaga tugma HAR DOIM ustida, fonni bosish ham yopadi. */
export function Lightbox({ count, start, photoUrl, onClose }: { count: number; start: number; photoUrl: (i: number) => string; onClose: () => void }) {
  const stripRef = useRef<HTMLDivElement | null>(null);
  const [idx, setIdx] = useState(start);
  useEffect(() => {
    stripRef.current?.scrollTo({ left: start * stripRef.current.clientWidth, behavior: "auto" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="shop-lightbox" onClick={onClose}>
      <button className="shop-lightbox-back" onClick={(e) => { e.stopPropagation(); haptic(); onClose(); }}>‹ Orqaga</button>
      <div
        ref={stripRef}
        className="shop-lightbox-strip"
        onClick={(e) => e.stopPropagation()}
        onScroll={(e) => { const el = e.currentTarget; setIdx(Math.round(el.scrollLeft / el.clientWidth)); }}
      >
        {Array.from({ length: count }, (_, i) => (
          <img key={i} className="shop-lightbox-img" src={photoUrl(i)} alt="" loading={Math.abs(i - start) <= 1 ? "eager" : "lazy"} />
        ))}
      </div>
      {count > 1 && (
        <div className="shop-lightbox-dots">
          {Array.from({ length: count }, (_, i) => <span key={i} className={"shop-gallery-dot" + (i === idx ? " on" : "")} />)}
        </div>
      )}
    </div>
  );
}

export function TierBadge({ tier }: { tier: string }) {
  const key = tier.toLowerCase();
  const cls = ["bronza", "kumush", "oltin", "olmos"].includes(key) ? key : "bronza";
  return <span className={`d-tier ${cls}`}>{tier}</span>;
}

/** AUDIT 4.5 — yagona yuklash/xato holati: skeleton → xato bo'lsa matn+retry. */
export function LoadSection({
  state,
  onRetry,
  children,
  skeletonLines = 3,
  errorText = loadErrorText(),
}: {
  state: "loading" | "error" | "ready";
  onRetry: () => void;
  children: ReactNode;
  skeletonLines?: number;
  errorText?: string;
}) {
  if (state === "loading") {
    return (
      <div className="col g8">
        {Array.from({ length: skeletonLines }, (_, i) => (
          <Skeleton key={i} w={`${88 - i * 12}%`} />
        ))}
      </div>
    );
  }
  if (state === "error") return <EmptyState icon="📡" text={errorText} action="🔄 Qayta urinish" onAction={onRetry} />;
  return <>{children}</>;
}
