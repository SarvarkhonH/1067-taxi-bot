// ═══════════════════════════════════════════════════════════════════════════
// BirJoy Admin v2 — KOMPONENT KITI
//
// Eski panelning asosiy muammosi: 53 ko'rinishga 4 ta komponent, 459 inline
// stil. Bu fayl shuni tuzatadi — har ko'rinish SHU primitivlardan quriladi,
// stillar `design/feat/kit.css`da, inline stil YO'Q.
//
// Yagona istisno (reja bo'yicha): haqiqatan dinamik qiymat CSS o'zgaruvchisi
// orqali beriladi (`cssVar()` yordamchisi) — masalan modal kengligi.
// ═══════════════════════════════════════════════════════════════════════════
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

/** Dinamik CSS o'zgaruvchisi — TS `style` obyektida `--x` ni to'g'ridan-to'g'ri
 *  qabul qilmaydi, shuning uchun bitta joyda cast qilinadi (butun kod bo'ylab
 *  `as any` sochilmasin). */
export function cssVar(vars: Record<string, string | number>): CSSProperties {
  return vars as CSSProperties;
}

const cx = (...parts: (string | false | null | undefined)[]): string => parts.filter(Boolean).join(" ");

// ─────────────────────────────── PANEL ───────────────────────────────────────
export function Panel({
  title,
  actions,
  children,
  flush,
  className,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  /** `true` — ichki padding yo'q (jadval to'g'ridan-to'g'ri chegaraga tegadi). */
  flush?: boolean;
  className?: string;
}) {
  return (
    <section className={cx("a2-panel", className)}>
      {(title || actions) && (
        <header className="a2-panel-head">
          {typeof title === "string" ? <h2 className="a2-panel-title">{title}</h2> : title}
          <div className="a2-spacer" />
          {actions}
        </header>
      )}
      {children != null && <div className={flush ? "a2-panel-body-flush" : "a2-panel-body"}>{children}</div>}
    </section>
  );
}

// ─────────────────────────────── BUTTON ──────────────────────────────────────
type BtnVariant = "default" | "primary" | "ghost" | "danger";

export function Button({
  children,
  onClick,
  variant = "default",
  size,
  icon,
  block,
  loading,
  disabled,
  title,
  type = "button",
}: {
  children?: ReactNode;
  onClick?: () => void;
  variant?: BtnVariant;
  size?: "sm";
  /** `true` — faqat ikonka (kvadrat, matnsiz). */
  icon?: boolean;
  block?: boolean;
  loading?: boolean;
  disabled?: boolean;
  title?: string;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled || loading}
      className={cx(
        "a2-btn",
        variant !== "default" && `a2-btn-${variant}`,
        size === "sm" && "a2-btn-sm",
        icon && "a2-btn-icon",
        block && "a2-btn-block",
      )}
    >
      {loading ? <span className="a2-spin" /> : children}
    </button>
  );
}

// ─────────────────────────────── BADGE / DOT ─────────────────────────────────
export type Tone = "neutral" | "ok" | "warn" | "bad" | "info" | "brand" | "coin";

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return <span className={cx("a2-badge", tone !== "neutral" && `a2-badge-${tone}`)}>{children}</span>;
}

export function Dot({ tone = "neutral", live }: { tone?: "neutral" | "ok" | "warn" | "bad"; live?: boolean }) {
  return <span className={cx("a2-dot", tone !== "neutral" && `a2-dot-${tone}`, live && "a2-dot-live")} />;
}

// ─────────────────────────────── FIELDS ──────────────────────────────────────
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label?: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <label className="a2-field">
      {label && <span className="a2-label">{label}</span>}
      {children}
      {error ? <span className="a2-err-text">{error}</span> : hint ? <span className="a2-hint">{hint}</span> : null}
    </label>
  );
}

export function Input({
  value,
  onChange,
  placeholder,
  type = "text",
  numeric,
  invalid,
  disabled,
  onEnter,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "number" | "datetime-local" | "date" | "password";
  /** Raqamlar ustun bo'ylab tekis turishi uchun (tabular-nums). */
  numeric?: boolean;
  invalid?: boolean;
  disabled?: boolean;
  onEnter?: () => void;
  autoFocus?: boolean;
}) {
  return (
    <input
      className={cx("a2-input", numeric && "a2-input-num", invalid && "a2-input-err")}
      type={type}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onEnter ? (e) => e.key === "Enter" && !e.shiftKey && onEnter() : undefined}
    />
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Qidirish…",
  onEnter,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  onEnter?: () => void;
  autoFocus?: boolean;
}) {
  return (
    <div className="a2-input-wrap">
      <span className="a2-input-ico" aria-hidden>
        🔍
      </span>
      <Input value={value} onChange={onChange} placeholder={placeholder} onEnter={onEnter} autoFocus={autoFocus} />
    </div>
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  disabled,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  disabled?: boolean;
}) {
  return (
    <select className="a2-select" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Textarea({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <textarea
      className="a2-textarea"
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

// ─────────────────────────── SEGMENTED / TABS ────────────────────────────────
// `string | number` — sana-oralig'i kabi raqamli tanlovlar ham shu bitta
// komponentdan foydalanadi (RangePicker: 7/14/30/60).
export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="a2-seg" role="group">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="a2-seg-btn"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; badge?: number }[];
}) {
  return (
    <div className="a2-tabs" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          className="a2-tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
          {o.badge != null && o.badge > 0 && <> <Badge tone="brand">{o.badge}</Badge></>}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────── STAT CARD ───────────────────────────────────
export function StatCard({
  label,
  value,
  delta,
  deltaSub,
  spark,
  tone,
}: {
  label: string;
  value: ReactNode;
  /** Foizli o'zgarish. `null` — solishtirish ma'lumoti yo'q ("—" ko'rsatiladi). */
  delta?: { pct: number | null; dir: "up" | "down" | "flat" };
  /** Solishtirish izohi — masalan "o'tgan hafta shu kuni". */
  deltaSub?: string;
  /** Sparkline sloti — grafik primitivi 2-qadamda ulanadi (StatCard o'zgarmaydi). */
  spark?: ReactNode;
  tone?: Tone;
}) {
  return (
    <article className="a2-stat">
      <div className="a2-stat-top">
        <span className="a2-stat-label">{label}</span>
        {tone && tone !== "neutral" && <Dot tone={tone === "bad" ? "bad" : tone === "warn" ? "warn" : "ok"} />}
      </div>
      <div className="a2-stat-val">{value}</div>
      <div className="a2-stat-bottom">
        <div className="a2-col">
          {delta && (
            <span className={cx("a2-delta", delta.dir === "up" && "a2-delta-up", delta.dir === "down" && "a2-delta-down")}>
              {delta.pct == null ? "—" : `${delta.dir === "up" ? "▲" : delta.dir === "down" ? "▼" : "•"} ${Math.abs(delta.pct).toFixed(1)}%`}
            </span>
          )}
          {deltaSub && <span className="a2-delta-sub">{deltaSub}</span>}
        </div>
        {spark && <div className="a2-stat-spark">{spark}</div>}
      </div>
    </article>
  );
}

// ─────────────────────── SKELETON / EMPTY / ERROR ────────────────────────────
export function Skeleton({ h = 14, w }: { h?: number; w?: string | number }) {
  // O'lcham CSS o'zgaruvchisi orqali (to'g'ridan-to'g'ri `height`/`width` EMAS) —
  // shunda "inline stilda faqat `--*` o'zgaruvchilar bo'ladi" qoidasi grep bilan
  // tekshirilishi mumkin bo'lib qoladi.
  return <div className="a2-sk" style={cssVar({ "--h": `${h}px`, "--w": typeof w === "number" ? `${w}px` : (w ?? "100%") })} />;
}

/** Bir necha qatorli skeleton — jadval/ro'yxat yuklanayotganda. */
export function SkeletonRows({ rows = 5, h = 34 }: { rows?: number; h?: number }) {
  return (
    <div className="a2-col">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} h={h} />
      ))}
    </div>
  );
}

export function Empty({
  icon = "🗂",
  title,
  sub,
  action,
}: {
  icon?: ReactNode;
  title: string;
  sub?: string;
  action?: ReactNode;
}) {
  return (
    <div className="a2-empty">
      <span className="a2-empty-ico" aria-hidden>
        {icon}
      </span>
      <span className="a2-empty-title">{title}</span>
      {sub && <span className="a2-empty-sub">{sub}</span>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <Empty
      icon="⚠️"
      title="Ma'lumot yuklanmadi"
      sub={message || "Tarmoq yoki server xatosi. Qaytadan urinib ko'ring."}
      action={onRetry ? <Button size="sm" onClick={onRetry}>Qayta urinish</Button> : undefined}
    />
  );
}

/** Async holatning UCHALASI ham bir joyda: yuklanish → xato → bo'sh → kontent.
 *  Har ko'rinishda `if (!data) return …` takrorlanmasin (CLAUDE.md: har async
 *  holatda skeleton MAJBURIY — bu shuni majburlaydigan primitiv). */
export function Async<T>({
  data,
  error,
  onRetry,
  skeleton,
  empty,
  children,
}: {
  data: T | null | undefined;
  error?: string | null;
  onRetry?: () => void;
  skeleton?: ReactNode;
  empty?: { title: string; sub?: string; icon?: ReactNode };
  children: (d: T) => ReactNode;
}) {
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (data == null) return <>{skeleton ?? <SkeletonRows />}</>;
  if (Array.isArray(data) && data.length === 0 && empty) {
    return <Empty icon={empty.icon} title={empty.title} sub={empty.sub} />;
  }
  return <>{children(data)}</>;
}

// ─────────────────────────────── MODAL ───────────────────────────────────────
/** Esc bilan yopish + fon bosilganda yopish — har modal/drawer uchun bir xil. */
function useDismiss(onClose: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
}

export function Modal({
  open,
  onClose,
  title,
  width,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  width?: number;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useDismiss(onClose);
  if (!open) return null;
  return (
    <div className="a2-modal-wrap" role="dialog" aria-modal>
      <div className="a2-scrim" onClick={onClose} />
      <div className="a2-modal" style={width ? cssVar({ "--mw": `${width}px` }) : undefined}>
        {title && (
          <header className="a2-panel-head">
            {typeof title === "string" ? <h2 className="a2-panel-title">{title}</h2> : title}
            <div className="a2-spacer" />
            <Button variant="ghost" size="sm" icon onClick={onClose} title="Yopish (Esc)">
              ✕
            </Button>
          </header>
        )}
        <div className="a2-modal-body">{children}</div>
        {footer && <footer className="a2-panel-foot">{footer}</footer>}
      </div>
    </div>
  );
}

/** Buzg'unchi amal uchun tasdiqlash — ban/o'chirish/bekor qilish. Eski panelda
 *  bunday amallar `confirm()` yoki to'g'ridan-to'g'ri bosish bilan ketardi. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel = "Tasdiqlash",
  danger,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width={400}
      footer={
        <div className="a2-row">
          <div className="a2-spacer" />
          <Button size="sm" onClick={onClose}>
            Bekor
          </Button>
          <Button size="sm" variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      {body}
    </Modal>
  );
}

// ─────────────────────────────── DRAWER ──────────────────────────────────────
export function Drawer({
  open,
  onClose,
  head,
  width,
  children,
}: {
  open: boolean;
  onClose: () => void;
  head?: ReactNode;
  width?: number;
  children: ReactNode;
}) {
  useDismiss(onClose);
  if (!open) return null;
  return (
    <div className="a2-drawer-wrap" role="dialog" aria-modal>
      <div className="a2-scrim" onClick={onClose} />
      <aside className="a2-drawer" style={width ? cssVar({ "--dw": `${width}px` }) : undefined}>
        {head && <header className="a2-drawer-head">{head}</header>}
        <div className="a2-drawer-body">{children}</div>
      </aside>
    </div>
  );
}

// ─────────────────────────────── TOAST ───────────────────────────────────────
type ToastTone = "ok" | "bad" | "warn" | "neutral";
interface ToastItem {
  id: number;
  text: string;
  tone: ToastTone;
}

const ToastCtx = createContext<(text: string, tone?: ToastTone) => void>(() => undefined);

/** Amal natijasini ko'rsatish. Eski panelda har ko'rinish o'z `action-msg`
 *  div'ini boshqarardi — natija ba'zan ko'rinmay qolardi. */
export function useToast(): (text: string, tone?: ToastTone) => void {
  return useContext(ToastCtx);
}

export function ToastHost({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const push = useCallback((text: string, tone: ToastTone = "neutral") => {
    const id = ++seq.current;
    setItems((p) => [...p, { id, text, tone }]);
    window.setTimeout(() => setItems((p) => p.filter((t) => t.id !== id)), 4200);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      {items.length > 0 && (
        <div className="a2-toasts" role="status" aria-live="polite">
          {items.map((t) => (
            <div key={t.id} className={cx("a2-toast", t.tone !== "neutral" && `a2-toast-${t.tone}`)}>
              {t.text}
            </div>
          ))}
        </div>
      )}
    </ToastCtx.Provider>
  );
}

// ─────────────────────────────── MISC ────────────────────────────────────────
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="a2-kbd">{children}</kbd>;
}

export function Spinner({ large }: { large?: boolean }) {
  return <span className={cx("a2-spin", large && "a2-spin-lg")} />;
}

/** Nusxalash — telefon/ID/token kabi qiymatlar uchun (operator ish oqimida
 *  raqamni qo'lda ko'chirish eng ko'p uchraydigan mayda ish). */
export function CopyButton({ value, title = "Nusxalash" }: { value: string; title?: string }) {
  const [done, setDone] = useState(false);
  const toast = useToast();
  return (
    <Button
      variant="ghost"
      size="sm"
      icon
      title={title}
      onClick={() => {
        void navigator.clipboard
          .writeText(value)
          .then(() => {
            setDone(true);
            window.setTimeout(() => setDone(false), 1200);
          })
          .catch(() => toast("Nusxalanmadi", "bad"));
      }}
    >
      {done ? "✓" : "⧉"}
    </Button>
  );
}

/** Kalit-qiymat qatorlari — obyekt-detali panellarida eng ko'p uchraydigan shakl. */
export function KV({ rows }: { rows: { k: string; v: ReactNode }[] }) {
  return (
    <dl className="a2-kv">
      {rows.map((r, i) => (
        <div className="a2-kv-row" key={i}>
          <dt className="a2-kv-k">{r.k}</dt>
          <dd className="a2-kv-v">{r.v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Sana oralig'i tanlash — hisobot/grafik filtrlari uchun tayyor presetlar.
 *  Kalendar emas: admin ish oqimida 95% holat "oxirgi N kun". */
export function RangePicker({
  value,
  onChange,
}: {
  value: 7 | 14 | 30 | 60;
  onChange: (v: 7 | 14 | 30 | 60) => void;
}) {
  const opts = useMemo(
    () => [
      { value: 7 as const, label: "7 kun" },
      { value: 14 as const, label: "14 kun" },
      { value: 30 as const, label: "30 kun" },
      { value: 60 as const, label: "60 kun" },
    ],
    [],
  );
  return <Segmented value={value} onChange={onChange} options={opts} />;
}
