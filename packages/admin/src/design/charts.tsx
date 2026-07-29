// ═══════════════════════════════════════════════════════════════════════════
// BirJoy Admin v2 — GRAFIK PRIMITIVLARI (kutubxonasiz, qo'lda SVG/CSS)
//
// Nima uchun kutubxona YO'Q: kerak bo'lgan shakllar sodda (trend, ustun,
// sparkline, voronka, issiqlik-xarita, ulush), har biri ~40-80 qator; recharts
// esa ≈100KB+ gz qo'shardi va tokenlar bilan tema-nazoratini qiyinlashtirardi.
//
// Barcha spetsifikatsiya `dataviz` skill'dan olingan (ko'z bilan tanlanMAGAN):
//   · chiziq 2px round · marker r≥4 + 2px sirt-halqa · maydon 10% · ustun ≤24px,
//     4px yumaloq ma'lumot-uchi · to'r 1px solid, past-ovoz · 2px sirt bo'shlig'i
//   · ≥2 qator → legenda MAJBURIY · yorliq TANLAB (har nuqtada raqam YO'Q)
//   · matn HECH QACHON ma'lumot rangini kiymaydi
//   · hover qatlami — sukut bo'yicha (krestcha + tooltip)
//   · palitra `--c1..--c6` TEKSHIRILGAN tartibda, aylanmaydi
// ═══════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cssVar } from "./kit";
import { num } from "../lib/fmt";

export const SERIES = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)", "var(--c6)"] as const;
/** Qator rangi — HAR DOIM indeks bo'yicha, aylanmaydi. 7-qator bo'lsa
 *  «Boshqa»ga yig'iladi (skill qoidasi), shuning uchun 6 dan oshsa oxirgi rang
 *  qaytariladi va bu ATAYLAB — chaqiruvchi kod facet qilishi kerak. */
export const seriesColor = (i: number): string => SERIES[Math.min(i, SERIES.length - 1)]!;

/** Konteyner kengligini REAL pikselda o'lchash. viewBox cho'zilishi ishlatilmaydi:
 *  u `stroke-width`ni ham cho'zadi va 2px chiziq buziladi.
 *
 *  MUHIM: dastlabki o'lchov SINXRON (`useLayoutEffect` ichida `clientWidth`) —
 *  faqat `ResizeObserver`ga tayanish xato edi: RO'ning birinchi chaqiruvi render
 *  lifecycle'iga bog'liq va kadr chizilmaydigan muhitda (masalan ko'rinmayotgan
 *  panel/oyna) UMUMAN kelmaydi — grafik abadiy bo'sh qolardi. Bu aynan shu yerda
 *  o'lchov bilan aniqlandi: RO 400ms da 0 marta ishga tushdi, `clientWidth` esa
 *  1072px edi. RO endi faqat KEYINGI o'zgarishlar uchun. */
function useSize<T extends HTMLElement>(): [React.RefObject<T>, { w: number; h: number }] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = (): void => {
      const w = Math.round(el.clientWidth);
      const h = Math.round(el.clientHeight);
      setSize((p) => (p.w === w && p.h === h ? p : { w, h }));
    };
    measure(); // sinxron — RO kelmasa ham grafik chiziladi
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(measure);
      ro.observe(el);
    }
    window.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  return [ref, size];
}

// ─────────────────────────────── SPARKLINE ───────────────────────────────────
/** StatCard ichidagi mayda trend — o'q, to'r, yorliq YO'Q (skill: stat-tile
 *  kontrakti — 12 nuqtali sparkline, past-ovoz rangda, oxirgi nuqta aksentda). */
export function Sparkline({ values, height = 26 }: { values: number[]; height?: number }) {
  const [ref, { w }] = useSize<HTMLDivElement>();
  const pts = values.length > 24 ? values.slice(-24) : values;
  const path = useMemo(() => {
    if (w < 8 || pts.length < 2) return null;
    const pad = 3;
    const min = Math.min(...pts);
    const max = Math.max(...pts);
    const span = max - min || 1;
    const sx = (i: number) => pad + (i / (pts.length - 1)) * (w - pad * 2);
    const sy = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2);
    return {
      d: pts.map((v, i) => `${i ? "L" : "M"}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join(" "),
      lastX: sx(pts.length - 1),
      lastY: sy(pts[pts.length - 1]!),
    };
  }, [w, pts, height]);

  return (
    <div className="ch" ref={ref}>
      {path && (
        <svg className="ch-spark" width={w} height={height} aria-hidden>
          <path className="ch-spark-line" d={path.d} />
          <circle className="ch-spark-last" cx={path.lastX} cy={path.lastY} r={2.5} />
        </svg>
      )}
    </div>
  );
}

// ─────────────────────────────── LEGENDA ─────────────────────────────────────
export function Legend({
  items,
  hidden,
  onToggle,
}: {
  items: { label: string; color: string }[];
  hidden?: Set<number>;
  onToggle?: (i: number) => void;
}) {
  return (
    <div className="ch-legend">
      {items.map((it, i) => {
        const off = hidden?.has(i);
        const inner = (
          <>
            <span className="ch-lg-swatch" style={cssVar({ background: it.color })} />
            {it.label}
          </>
        );
        return onToggle ? (
          <button key={i} type="button" className={`ch-lg-item${off ? " ch-lg-item-off" : ""}`} onClick={() => onToggle(i)} aria-pressed={!off}>
            {inner}
          </button>
        ) : (
          <span key={i} className="ch-lg-item">
            {inner}
          </span>
        );
      })}
    </div>
  );
}

// ─────────────────────────────── TREND ───────────────────────────────────────
export interface TrendSeries {
  label: string;
  values: (number | null)[];
  /** `true` — maydon to'ldirish bilan (bitta qator uchun odatda shunday). */
  area?: boolean;
}

/** Y-o'q belgilarini "toza" raqamlarga yaxlitlash (0 / 1 000 / 2 000) — skill talabi. */
function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max === min) return [min || 0];
  const raw = (max - min) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

export function TrendChart({
  x,
  series,
  height = 190,
  format = num,
  /** Oxirgi nuqtaga qiymat yozish (TANLAB yorliqlash — har nuqtaga EMAS). */
  endLabels = true,
}: {
  /** X o'qi yorliqlari (qisqa: "24.07"). Uzunligi har qator `values` bilan bir xil. */
  x: string[];
  series: TrendSeries[];
  height?: number;
  format?: (n: number) => string;
  endLabels?: boolean;
}) {
  const [ref, { w }] = useSize<HTMLDivElement>();
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [hover, setHover] = useState<number | null>(null);

  const shown = series.filter((_, i) => !hidden.has(i));
  const padL = 44;
  const padR = endLabels ? 46 : 10;
  const padT = 10;
  const padB = 20;
  const iw = Math.max(0, w - padL - padR);
  const ih = Math.max(0, height - padT - padB);

  const all = shown.flatMap((s) => s.values.filter((v): v is number => v != null));
  const dMin = Math.min(0, ...all); // tayanch 0 dan (skill: bitta tayanch chizig'i)
  const dMax = Math.max(1, ...all);
  const ticks = useMemo(() => niceTicks(dMin, dMax), [dMin, dMax]);
  const yLo = ticks[0]!;
  const yHi = ticks[ticks.length - 1]!;
  const sx = useCallback((i: number) => padL + (x.length < 2 ? iw / 2 : (i / (x.length - 1)) * iw), [iw, x.length]);
  const sy = useCallback((v: number) => padT + ih - ((v - yLo) / (yHi - yLo || 1)) * ih, [ih, yLo, yHi]);

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = e.clientX - rect.left;
    const i = x.length < 2 ? 0 : Math.round((rel / (iw || 1)) * (x.length - 1));
    setHover(Math.max(0, Math.min(x.length - 1, i)));
  };

  // X belgilaridan faqat bir qismini ko'rsatish (to'planib qolmasin)
  const xStep = Math.max(1, Math.ceil(x.length / Math.max(2, Math.floor(iw / 58))));

  return (
    <div className="ch" ref={ref}>
      {w > 0 && (
        <>
          <svg width={w} height={height} role="img">
            {/* to'r + Y belgilari */}
            {ticks.map((t) => (
              <g key={t}>
                <line className="ch-grid" x1={padL} x2={padL + iw} y1={sy(t)} y2={sy(t)} />
                <text className="ch-tick ch-tick-y" x={padL - 7} y={sy(t)}>
                  {format(t)}
                </text>
              </g>
            ))}
            {/* X belgilari */}
            {x.map((lbl, i) =>
              i % xStep === 0 || i === x.length - 1 ? (
                <text key={i} className="ch-tick ch-tick-x" x={sx(i)} y={height - 5}>
                  {lbl}
                </text>
              ) : null,
            )}
            {/* krestcha */}
            {hover != null && <line className="ch-cross" x1={sx(hover)} x2={sx(hover)} y1={padT} y2={padT + ih} />}

            {/* qatorlar */}
            {series.map((s, si) => {
              if (hidden.has(si)) return null;
              const color = seriesColor(si);
              const pts = s.values.map((v, i) => (v == null ? null : { x: sx(i), y: sy(v) }));
              const solid = pts.filter((p): p is { x: number; y: number } => p != null);
              if (!solid.length) return null;
              const d = solid.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
              const last = solid[solid.length - 1]!;
              const lastVal = [...s.values].reverse().find((v): v is number => v != null);
              return (
                <g key={si}>
                  {s.area && (
                    <path
                      className="ch-area"
                      style={cssVar({ fill: color })}
                      d={`${d} L${last.x.toFixed(1)},${(padT + ih).toFixed(1)} L${solid[0]!.x.toFixed(1)},${(padT + ih).toFixed(1)} Z`}
                    />
                  )}
                  <path className="ch-line" style={cssVar({ stroke: color })} d={d} />
                  {/* faqat OXIRGI nuqtada marker (r≥4 + 2px sirt halqa) */}
                  <circle className="ch-dot" style={cssVar({ fill: color })} cx={last.x} cy={last.y} r={4} />
                  {/* hover nuqtasi */}
                  {hover != null && pts[hover] && (
                    <circle className="ch-dot" style={cssVar({ fill: color })} cx={pts[hover]!.x} cy={pts[hover]!.y} r={4} />
                  )}
                  {/* oxirgi qiymat yorlig'i — matn MATN tokenida (ma'lumot rangida EMAS) */}
                  {endLabels && lastVal != null && (
                    <text className="ch-tick" x={last.x + 8} y={last.y} dominantBaseline="middle">
                      {format(lastVal)}
                    </text>
                  )}
                </g>
              );
            })}

            {/* hover uchun sezgir maydon */}
            <rect
              className="ch-hit"
              x={padL}
              y={padT}
              width={iw}
              height={ih}
              onMouseMove={onMove}
              onMouseLeave={() => setHover(null)}
            />
          </svg>

          {hover != null && (
            <div
              className="ch-tip"
              style={cssVar({
                "--tx": `${Math.min(sx(hover) + 12, w - 150)}px`,
                "--ty": `${padT}px`,
                left: 0,
                top: 0,
              })}
            >
              <div className="ch-tip-t">{x[hover]}</div>
              {series.map((s, si) =>
                hidden.has(si) ? null : (
                  <div className="ch-tip-row" key={si}>
                    <span className="ch-lg-swatch" style={cssVar({ background: seriesColor(si) })} />
                    <span className="a2-dim">{s.label}</span>
                    <span className="a2-spacer" />
                    <span className="ch-tip-v">{s.values[hover] == null ? "—" : format(s.values[hover]!)}</span>
                  </div>
                ),
              )}
            </div>
          )}
        </>
      )}
      {/* ≥2 qator → legenda MAJBURIY; 1 qator → legenda YO'Q (sarlavha aytadi) */}
      {series.length > 1 && (
        <Legend
          items={series.map((s, i) => ({ label: s.label, color: seriesColor(i) }))}
          hidden={hidden}
          onToggle={(i) =>
            setHidden((p) => {
              const n = new Set(p);
              if (n.has(i)) n.delete(i);
              else if (n.size < series.length - 1) n.add(i); // oxirgi qatorni o'chirib bo'lmaydi
              return n;
            })
          }
        />
      )}
    </div>
  );
}

// ─────────────────────────────── USTUNLAR ────────────────────────────────────
/** Gorizontal ustunlar — qiymat uchida. Toifalar nomi uzun bo'lishi mumkin,
 *  shuning uchun gorizontal (vertikal ustunda yorliq aylanishi kerak bo'lardi). */
export function BarRows({
  rows,
  format = num,
  colorIndex,
}: {
  rows: { label: string; value: number; hint?: string }[];
  format?: (n: number) => string;
  /** Barcha ustunlar bitta rangda (magnituda solishtiruvi — identifikator emas). */
  colorIndex?: number;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const color = seriesColor(colorIndex ?? 0);
  return (
    <div className="ch-funnel">
      {rows.map((r) => (
        <div className="ch-fn-row" key={r.label}>
          <span className="ch-fn-label a2-truncate" title={r.label}>
            {r.label}
          </span>
          <div className="ch-fn-track">
            <div className="ch-fn-fill" style={cssVar({ "--w": `${(r.value / max) * 100}%`, background: color })} />
          </div>
          <span className="ch-fn-val">
            {format(r.value)}
            {r.hint && <span className="ch-fn-drop"> {r.hint}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────── VORONKA ─────────────────────────────────────
/** O'sish voronkasi: har bosqichda qancha qolgani + o'tish foizi.
 *  Kenglik BIRINCHI bosqichga nisbatan (voronka mantiqi). */
export function Funnel({ stages }: { stages: { label: string; value: number }[] }) {
  const top = Math.max(1, stages[0]?.value ?? 1);
  return (
    <div className="ch-funnel">
      {stages.map((s, i) => {
        const prev = i > 0 ? stages[i - 1]!.value : null;
        const conv = prev && prev > 0 ? (s.value / prev) * 100 : null;
        return (
          <div className="ch-fn-row" key={s.label}>
            <span className="ch-fn-label a2-truncate" title={s.label}>
              {s.label}
            </span>
            <div className="ch-fn-track">
              <div className="ch-fn-fill" style={cssVar({ "--w": `${(s.value / top) * 100}%`, background: seriesColor(0) })} />
            </div>
            <span className="ch-fn-val">
              {num(s.value)}
              {conv != null && <span className="ch-fn-drop"> {conv.toFixed(0)}%</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────── ULUSH ───────────────────────────────────────
/** Qism-butun — donut O'RNIGA yagona chiziq. Sabab: bir necha toifa uchun
 *  uzunlik burchakdan aniq o'qiladi; donut faqat "taxminan yarmi" darajasida
 *  ishlaydi. Legenda + qiymatlar MAJBURIY (rang yolg'iz identifikator emas). */
export function ShareBar({ parts, format = num }: { parts: { label: string; value: number }[]; format?: (n: number) => string }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <div className="a2-col">
      <div className="ch-share">
        {parts.map((p, i) => (
          <div
            key={p.label}
            className="ch-share-seg"
            style={cssVar({ "--w": `${(p.value / total) * 100}%`, background: seriesColor(i) })}
            title={`${p.label}: ${format(p.value)}`}
          />
        ))}
      </div>
      <div className="ch-legend">
        {parts.map((p, i) => (
          <span className="ch-lg-item" key={p.label}>
            <span className="ch-lg-swatch" style={cssVar({ background: seriesColor(i) })} />
            {p.label}
            <span className="ch-tip-v"> {format(p.value)}</span>
            <span className="ch-fn-drop">({((p.value / total) * 100).toFixed(0)}%)</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────── ISSIQLIK-XARITA (pik soatlar) ───────────────────────
const DAYS = ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"];

/** Magnituda = BITTA ohangning shaffofligi (light→dark, kamalak EMAS — skill qoidasi). */
export function Heatmap({ grid, label = "safar" }: { grid: number[][]; label?: string }) {
  const max = Math.max(1, ...grid.flat());
  return (
    <div className="a2-col">
      {grid.map((row, di) => (
        <div className="ch-heat" key={di}>
          <span className="ch-heat-lbl">{DAYS[di] ?? di}</span>
          {row.map((v, hi) => (
            <div
              key={hi}
              className="ch-heat-cell"
              style={cssVar({ "--o": String(0.06 + (v / max) * 0.94) })}
              title={`${DAYS[di]} ${String(hi).padStart(2, "0")}:00 — ${num(v)} ${label}`}
            />
          ))}
        </div>
      ))}
      <div className="ch-heat-hrs">
        <span />
        {Array.from({ length: 24 }, (_, h) => (
          <span className="ch-heat-hr" key={h}>
            {h % 3 === 0 ? h : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────── GRAFIK IDISHI (sarlavha + filtr) ────────────────────
/** Filtrlar BITTA qatorda, grafik USTIDA (skill: interaction.md). */
export function ChartHead({ children }: { children: ReactNode }) {
  return <div className="ch-head">{children}</div>;
}

/** Grafik + JADVAL-KO'RINISH almashtirgichi.
 *  MAJBURIY, e'tiborsiz qoldirilmaydi: yorug' temada bir necha qator rangining
 *  kontrasti 3:1 dan past (palitra tekshiruvi "relief required" dedi), skill
 *  esa bunda ko'rinadigan yorliq YOKI jadval-ko'rinish talab qiladi. */
export function ChartWithTable({
  chart,
  table,
}: {
  chart: ReactNode;
  table: ReactNode;
}) {
  const [asTable, setAsTable] = useState(false);
  useEffect(() => {
    // majburiy-ranglar rejimida (Windows «yuqori kontrast») darhol jadval
    const mq = window.matchMedia("(forced-colors: active)");
    if (mq.matches) setAsTable(true);
  }, []);
  return (
    <div className="a2-col-3">
      <div className="a2-row">
        <div className="a2-spacer" />
        <button type="button" className="a2-btn a2-btn-ghost a2-btn-sm" onClick={() => setAsTable((v) => !v)}>
          {asTable ? "📈 Grafik" : "▦ Jadval"}
        </button>
      </div>
      {asTable ? table : chart}
    </div>
  );
}
