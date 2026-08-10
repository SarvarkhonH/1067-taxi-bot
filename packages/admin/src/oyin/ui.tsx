// 🧱 O'YIN KONSOLI — ASOSIY ELEMENTLAR
//
// Nega o'z elementlari (v2 `design/kit.tsx` ni import qilish o'rniga): kit `a2-*` sinflari va
// `tokens.css`/`base.css` ga tayanadi, ikkalasi ham `:root`/`html`/`body` ga yozadi va eski
// panelning qolgan 33 tabini qayta bo'yardi (`oyin.css` boshidagi izohga qarang). Bu yerdagi
// elementlar FAQAT `.oy-*` sinflaridan foydalanadi — guard-test to'qnashuv yo'qligini isbotlaydi.
//
// ⛔ INLINE STIL YO'Q. Yagona istisno — HAQIQATAN dinamik geometriya (diagramma kengligi),
// u ham `style={{ width: … }}` emas, CSS o'zgaruvchisi orqali emas: bu yerda kenglik faqat
// foizda va boshqa yo'l yo'q, shuning uchun `style` ATAYLAB va faqat shu maqsadda ishlatiladi.
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type CSSProperties, type ReactNode,
} from "react";

/* ── PANEL ─────────────────────────────────────────────────────────────────────────────────── */
export function Card({ title, sub, head, children, flush }: {
  title?: ReactNode; sub?: ReactNode; head?: ReactNode; children?: ReactNode; flush?: boolean;
}) {
  return (
    <section className="oy-card">
      {(title || sub || head) && (
        <div className="oy-card-h">
          {title && <span className="oy-card-t">{title}</span>}
          {sub && <span className="oy-card-sub">{sub}</span>}
          {head}
        </div>
      )}
      {children != null && <div className={flush ? "oy-card-b oy-flush" : "oy-card-b"}>{children}</div>}
    </section>
  );
}

export function Btn({ children, onClick, variant, sm, disabled, title, type = "button" }: {
  children: ReactNode; onClick?: () => void;
  variant?: "pri" | "dgr" | "ghost"; sm?: boolean; disabled?: boolean; title?: string;
  type?: "button" | "submit";
}) {
  const cls = ["oy-btn", variant ? `oy-btn-${variant}` : "", sm ? "oy-btn-sm" : ""].filter(Boolean).join(" ");
  return <button type={type} className={cls} onClick={onClick} disabled={disabled} title={title}>{children}</button>;
}

export function Chip({ children, on, onClick, risk }: { children: ReactNode; on: boolean; onClick: () => void; risk?: boolean }) {
  return (
    <button type="button" className={risk ? "oy-chip oy-chip-risk" : "oy-chip"} aria-pressed={on} onClick={onClick}>
      {children}
    </button>
  );
}

export type Tone = "ok" | "warn" | "bad" | "info" | "coin" | "mute";
export function Badge({ children, tone = "mute" }: { children: ReactNode; tone?: Tone }) {
  return <span className={`oy-bdg oy-bdg-${tone}`}>{children}</span>;
}

export function Stat({ k, v, s, tone, sm }: { k: string; v: ReactNode; s?: ReactNode; tone?: "ok" | "warn" | "bad" | "coin"; sm?: boolean }) {
  const cls = ["oy-stat", tone ? `oy-stat-${tone}` : "", sm ? "oy-stat-sm" : ""].filter(Boolean).join(" ");
  return (
    <div className={cls}>
      <span className="oy-stat-k">{k}</span>
      <span className="oy-stat-v">{v}</span>
      {s != null && <span className="oy-stat-s">{s}</span>}
    </div>
  );
}

export function Note({ children, tone }: { children: ReactNode; tone?: "ok" | "warn" | "bad" | "brand" }) {
  return <div className={tone ? `oy-note oy-note-${tone}` : "oy-note"}>{children}</div>;
}

export function Skeleton({ rows = 4, h = 34 }: { rows?: number; h?: number }) {
  return (
    <div className="oy-col">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="oy-sk" style={{ height: h }} />
      ))}
    </div>
  );
}

/* ── JADVAL ────────────────────────────────────────────────────────────────────────────────── */
export interface Col<T> {
  key: string;
  label: ReactNode;
  /** Saralash kaliti — berilmasa ustun saralanmaydi. */
  sort?: (r: T) => number | string;
  align?: "r";
  render: (r: T) => ReactNode;
}

export function Table<T>({ rows, cols, rowKey, onRow, selected, empty }: {
  rows: T[]; cols: Col<T>[]; rowKey: (r: T) => string | number;
  onRow?: (r: T) => void; selected?: (r: T) => boolean; empty?: ReactNode;
}) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = cols.find((c) => c.key === sort.key);
    if (!col?.sort) return rows;
    const get = col.sort;
    return [...rows].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      const c = typeof x === "string" || typeof y === "string" ? String(x).localeCompare(String(y)) : (x as number) - (y as number);
      return c * sort.dir;
    });
  }, [rows, cols, sort]);

  if (rows.length === 0 && empty) return <div className="oy-card-b oy-dim">{empty}</div>;

  return (
    <div className="oy-tw">
      <table>
        <thead>
          <tr>
            {cols.map((c) => (
              <th
                key={c.key}
                className={[c.sort ? "oy-s" : "", c.align === "r" ? "oy-r" : ""].filter(Boolean).join(" ")}
                {...(sort?.key === c.key ? { "data-on": "1" } : {})}
                onClick={c.sort ? () => setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 1 ? -1 : 1 } : { key: c.key, dir: -1 })) : undefined}
              >
                {c.label}
                {c.sort && <span className="oy-ar">{sort?.key === c.key ? (sort.dir === -1 ? "↓" : "↑") : "↕"}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr
              key={rowKey(r)}
              className={[onRow ? "oy-clickable" : "", selected?.(r) ? "oy-sel" : ""].filter(Boolean).join(" ")}
              onClick={onRow ? () => onRow(r) : undefined}
            >
              {cols.map((c) => <td key={c.key} className={c.align === "r" ? "oy-r" : undefined}>{c.render(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Foizli diagramma — kenglik YAGONA dinamik qiymat, shuning uchun `style` shu yerda. */
export function Mini({ pct, tone }: { pct: number; tone: "ok" | "warn" | "bad" }) {
  const w: CSSProperties = { width: `${Math.max(0, Math.min(100, pct))}%` };
  return <span className="oy-mini"><i className={`oy-mini-${tone}`} style={{ ...w, background: `var(--${tone})` }} /></span>;
}

/* ── DRAWER / MODAL ────────────────────────────────────────────────────────────────────────── */
export function Drawer({ open, onClose, head, foot, children }: {
  open: boolean; onClose: () => void; head: ReactNode; foot?: ReactNode; children: ReactNode;
}) {
  useEscape(open, onClose);
  if (!open) return null;
  return (
    <>
      <button type="button" className="oy-scrim" aria-label="Yopish" onClick={onClose} />
      <aside className="oy-drw" role="dialog" aria-modal="true">
        <div className="oy-drw-h">{head}</div>
        <div className="oy-drw-b">{children}</div>
        {foot && <div className="oy-drw-f">{foot}</div>}
      </aside>
    </>
  );
}

export function Modal({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  useEscape(open, onClose);
  if (!open) return null;
  return (
    <div className="oy-mdl" role="dialog" aria-modal="true">
      <button type="button" className="oy-scrim" aria-label="Yopish" onClick={onClose} />
      <div className="oy-mdl-c">{children}</div>
    </div>
  );
}

function useEscape(active: boolean, fn: () => void): void {
  useEffect(() => {
    if (!active) return;
    const h = (e: KeyboardEvent): void => { if (e.key === "Escape") fn(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [active, fn]);
}

/* ── TOAST ─────────────────────────────────────────────────────────────────────────────────── */
type ToastTone = "ok" | "bad" | "warn";
const ToastCtx = createContext<(t: string, tone?: ToastTone) => void>(() => undefined);
export const useToast = (): ((t: string, tone?: ToastTone) => void) => useContext(ToastCtx);

export function ToastHost({ children }: { children: ReactNode }) {
  const [list, setList] = useState<{ id: number; text: string; tone: ToastTone }[]>([]);
  const nextId = useRef(1);
  const push = useCallback((text: string, tone: ToastTone = "ok") => {
    const id = nextId.current++;
    setList((l) => [...l, { id, text, tone }]);
    setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      {list.length > 0 && (
        <div className="oy-toasts">
          {list.map((t) => <div key={t.id} className={t.tone === "ok" ? "oy-toast" : `oy-toast oy-toast-${t.tone}`}>{t.text}</div>)}
        </div>
      )}
    </ToastCtx.Provider>
  );
}

/* ── FAYL TASHLASH ZONASI ──────────────────────────────────────────────────────────────────── */
export function Drop({ title, hint, accept, multiple, onFiles }: {
  title: string; hint: ReactNode; accept?: string; multiple?: boolean; onFiles: (files: File[]) => void;
}) {
  const [hot, setHot] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        className={hot ? "oy-drop oy-drop-hot" : "oy-drop"}
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setHot(true); }}
        onDragLeave={() => setHot(false)}
        onDrop={(e) => {
          e.preventDefault();
          setHot(false);
          onFiles([...e.dataTransfer.files]);
        }}
      >
        <b>{title}</b>
        {hint}
      </button>
      <input
        ref={input} type="file" accept={accept} multiple={multiple} hidden
        onChange={(e) => { onFiles([...(e.target.files ?? [])]); e.target.value = ""; }}
      />
    </>
  );
}

/* ── MA'LUMOT YUKLASH ──────────────────────────────────────────────────────────────────────── */
export interface Loaded<T> { data: T | null; err: string | null; loading: boolean; reload: () => void }

/** ⚠️ Xato JIM YUTILMAYDI. Eski panelda ko'p joyda `.catch(() => setRows([]))` bor edi va
 *  server yiqilganda ekran «bo'sh ro'yxat» ko'rsatardi — ya'ni YOLG'ON tinchlik. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []): Loaded<T> {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr(null);
    fnRef.current()
      .then((r) => { if (alive) { setData(r); setLoading(false); } })
      .catch((e: unknown) => { if (alive) { setErr(e instanceof Error ? e.message : String(e)); setLoading(false); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);
  return { data, err, loading, reload: () => setTick((t) => t + 1) };
}

export function ErrBox({ err, onRetry }: { err: string; onRetry: () => void }) {
  return (
    <Note tone="bad">
      <b>Yuklanmadi:</b> {err}
      <div className="oy-row"><Btn sm onClick={onRetry}>↻ Qayta urinish</Btn></div>
    </Note>
  );
}
