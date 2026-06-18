// T1 DIZAYN TIZIMI — komponent kutubxonasi. Stil manbai: design/tokens.css.
// Hech qanday API-mutatsiya yo'q — bular sof ko'rinish qatlam.
import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from "react";
import { haptic } from "../telegram";
import { useCountUp } from "../util";

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

/** Pastdan chiqadigan sheet — grip'dan sudrab yopiladi (touch follow). */
export function Sheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ y0: number; dy: number } | null>(null);
  if (!open) return null;
  const onTouchStart = (e: React.TouchEvent) => {
    drag.current = { y0: e.touches[0]!.clientY, dy: 0 };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!drag.current || !ref.current) return;
    drag.current.dy = Math.max(0, e.touches[0]!.clientY - drag.current.y0);
    ref.current.style.transform = `translateY(${drag.current.dy}px)`;
  };
  const onTouchEnd = () => {
    if (!drag.current || !ref.current) return;
    if (drag.current.dy > 80) onClose();
    else ref.current.style.transform = "";
    drag.current = null;
  };
  return (
    <div className="d-sheet-back" onClick={onClose}>
      <div ref={ref} className="d-sheet" onClick={(e) => e.stopPropagation()} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
        <div className="d-grip" />
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
  errorText = "Yuklanmadi — internetni tekshirib qayta urinib ko'ring",
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
