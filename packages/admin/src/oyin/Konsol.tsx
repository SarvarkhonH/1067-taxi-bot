// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🎮 O'YIN KONSOLI — QOBIQ (vital panel · modul tablari · ⌘K · toast)
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Ega talabi (2026-08-10): «o'yin tabi juda noqulay, tushunish qiyin — butunlay yangi va
// zamonaviy qil, ma'lumot boshqarish va yuklashni osonlashtir, kengroq kirib boradigan nazorat».
//
// Qobiq uch qismdan:
//   1. VITAL PANEL — 6 hayotiy raqam, yopishqoq, 20 soniyada o'zi yangilanadi. BITTA so'rov
//      (`/api/admin/oyin/vitals`) — eski panel bu raqamlar uchun 7 ta alohida so'rov yuborardi.
//   2. MODUL TABLARI — GORIZONTAL. Ataylab vertikal reyk EMAS: eski panelda chap menyu
//      allaqachon bor, ikkinchisi «bitta ekran — bitta menyu» qoidasini buzardi.
//   3. ⌘K — buyruq palitrasi: menyuni qidirmasdan ish bajariladi.
//
// Butun konsol `<div className="oyinx">` ichida — tokenlar shu doirada, `:root` TEGILMAYDI.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { OyinVitals } from "@t1067/shared";
import { adminApi } from "../api";
import { num, short } from "../lib/fmt";
import { Gashtak } from "./Gashtak";
import { Hikoyalar } from "./Hikoyalar";
import { Kartalar } from "./Kartalar";
import { Komentariyalar } from "./Komentariyalar";
import { Mukofotlar } from "./Mukofotlar";
import { Nazorat } from "./Nazorat";
import { Odamlar } from "./Odamlar";
import { Reja } from "./Reja";
import { Sozlama } from "./Sozlama";
import { ToastHost, useLoad } from "./ui";
import "./oyin.css";

export type OyinView = "nazorat" | "odamlar" | "mukofot" | "kartalar" | "hikoya" | "gashtak" | "komentariya" | "reja" | "sozlama";

interface ModDef { id: OyinView; ico: string; label: string }
const MODULES: ModDef[] = [
  { id: "nazorat", ico: "◎", label: "Nazorat" },
  { id: "odamlar", ico: "◍", label: "Odamlar" },
  { id: "mukofot", ico: "🎁", label: "Mukofotlar" },
  { id: "kartalar", ico: "💳", label: "Kartalar & Tiraj" },
  { id: "hikoya", ico: "📸", label: "Hikoyalar" },
  { id: "gashtak", ico: "👑", label: "Gashtak" },
  { id: "komentariya", ico: "💬", label: "Komentariyalar" },
  { id: "reja", ico: "🔮", label: "Reja" },
  { id: "sozlama", ico: "⚙", label: "Sozlama & Audit" },
];

/** Modul yonidagi son. `null` = raqam hali yuklanmagan → rozetka CHIZILMAYDI
 *  (0 ko'rsatish yolg'on bo'lardi: «hech narsa yo'q» deb o'qiladi). */
function modCount(id: OyinView, v: OyinVitals | null): { n: number; hot: boolean } | null {
  if (!v) return null;
  if (id === "hikoya") return v.storiesPending > 0 ? { n: v.storiesPending, hot: true } : null;
  if (id === "odamlar") return v.riskCount > 0 ? { n: v.riskCount, hot: true } : null;
  if (id === "komentariya") return v.commentsPending > 0 ? { n: v.commentsPending, hot: true } : null;
  if (id === "kartalar") return { n: v.cardsIssued, hot: false };
  return null;
}

export function Konsol() {
  const [view, setView] = useState<OyinView>("nazorat");
  const [palOpen, setPalOpen] = useState(false);

  // 📟 Vital panel — 20s da o'zi yangilanadi. Server ham 20s keshlaydi, ya'ni bu poll
  // haqiqiy yukni oshirmaydi (kesh ichida javob beradi).
  const vitals = useLoad(() => adminApi.oyinVitals(), []);
  const reloadVitals = vitals.reload;
  useEffect(() => {
    const t = setInterval(() => reloadVitals(), 20_000);
    return () => clearInterval(t);
  }, [reloadVitals]);

  const go = useCallback((v: OyinView) => { setView(v); window.scrollTo({ top: 0 }); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const inField = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement | null)?.tagName ?? "");
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setPalOpen(true); }
      else if (e.key === "/" && !inField) { e.preventDefault(); setPalOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <ToastHost>
      <div className="oyinx">
        <VitalBar v={vitals.data} err={vitals.err} onRefresh={() => vitals.reload()} onPalette={() => setPalOpen(true)} />

        <nav className="oy-mods">
          {MODULES.map((m) => {
            const c = modCount(m.id, vitals.data);
            return (
              <button key={m.id} type="button" className="oy-mod" aria-current={view === m.id} onClick={() => go(m.id)}>
                <span>{m.ico}</span>{m.label}
                {c && <span className={c.hot ? "oy-mod-n oy-mod-n-hot" : "oy-mod-n"}>{num(c.n)}</span>}
              </button>
            );
          })}
        </nav>

        {view === "nazorat" && <Nazorat vitals={vitals.data} onGo={go} />}
        {view === "odamlar" && <Odamlar />}
        {view === "mukofot" && <Mukofotlar onChanged={() => vitals.reload()} />}
        {view === "kartalar" && <Kartalar onChanged={() => vitals.reload()} />}
        {view === "hikoya" && <Hikoyalar onChanged={() => vitals.reload()} />}
        {view === "gashtak" && <Gashtak />}
        {view === "komentariya" && <Komentariyalar onChanged={() => vitals.reload()} />}
        {view === "reja" && <Reja />}
        {view === "sozlama" && <Sozlama onChanged={() => vitals.reload()} onGo={go} />}

        <Palette open={palOpen} onClose={() => setPalOpen(false)} onGo={go} />
      </div>
    </ToastHost>
  );
}

/* ── 📟 VITAL PANEL ────────────────────────────────────────────────────────────────────────── */
const PHASE_LABEL: Record<OyinVitals["seasonPhase"], string> = {
  unset: "sozlanmagan", upcoming: "boshlanmagan", active: "ochiq", ended: "yakunlandi",
};

function VitalBar({ v, err, onRefresh, onPalette }: {
  v: OyinVitals | null; err: string | null; onRefresh: () => void; onPalette: () => void;
}) {
  if (err) {
    return (
      <div className="oy-vitals">
        <div className="oy-vital oy-vital-bad">
          <span className="oy-vital-k">Vital panel</span>
          <span className="oy-vital-v">yuklanmadi <small>{err}</small></span>
        </div>
        <div className="oy-vital oy-vital-end">
          <button type="button" className="oy-btn oy-btn-sm" onClick={onRefresh}>↻ Qayta</button>
        </div>
      </div>
    );
  }
  if (!v) {
    // Skeleton — REAL layoutning nusxasi (6 ta bir xil katak), uch xil to'rtburchak emas.
    return (
      <div className="oy-vitals">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="oy-vital">
            <span className="oy-vital-k"><span className="oy-sk oy-sk-k" /></span>
            <span className="oy-vital-v"><span className="oy-sk oy-sk-v" /></span>
          </div>
        ))}
      </div>
    );
  }

  const seasonTone = v.seasonPhase === "active" ? (v.finalLock ? "warn" : "ok") : v.seasonPhase === "unset" ? "bad" : "warn";
  const items: { k: string; v: string; s: string; tone?: string }[] = [
    {
      k: "Mavsum",
      v: v.seasonPhase === "active" && v.daysLeft != null ? `${v.daysLeft} kun` : PHASE_LABEL[v.seasonPhase],
      s: v.finalLock ? "FINAL-48 · xarid yopiq" : (v.seasonLabel ?? "nomsiz"),
      tone: seasonTone,
    },
    { k: "Xalqdagi ball", v: short(v.circulatingBall), s: "sarflanmagan", tone: "coin" },
    { k: "Sig'im", v: `${v.capacityRatio.toFixed(1)}×`, s: v.capacityHealthy ? "yetarli" : "kerak 3.0×", tone: v.capacityHealthy ? "ok" : "warn" },
    { k: "Byudjet", v: short(v.catalogSom), s: `${short(v.budgetSom)} dan`, tone: v.overBudget ? "bad" : "ok" },
    { k: "Kartalar", v: num(v.cardsIssued), s: v.prizesFilled > 0 ? `${v.prizesFilled} mukofot to'ldi` : "to'lgani yo'q", tone: v.prizesFilled > 0 ? "warn" : undefined },
    { k: "Shubhali", v: num(v.riskCount), s: "tekshiruv kutmoqda", tone: v.riskCount > 0 ? "bad" : "ok" },
  ];

  return (
    <div className="oy-vitals">
      {items.map((it) => (
        <div key={it.k} className={it.tone ? `oy-vital oy-vital-${it.tone}` : "oy-vital"}>
          <span className="oy-vital-k">{it.k}</span>
          <span className="oy-vital-v">{it.v} <small>{it.s}</small></span>
        </div>
      ))}
      <div className="oy-vital oy-vital-end">
        {v.frozen && <span className="oy-bdg oy-bdg-warn">🔒 muzlatilgan</span>}
        <span className="oy-pulse" title="jonli — 20 soniyada yangilanadi" />
        <button type="button" className="oy-btn oy-btn-sm oy-btn-ghost" onClick={onRefresh}>↻</button>
        <button type="button" className="oy-btn oy-btn-sm" onClick={onPalette}>⌘K</button>
      </div>
    </div>
  );
}

/* ── ⌘K BUYRUQ PALITRASI ───────────────────────────────────────────────────────────────────── */
interface Cmd { label: string; hint: string; run: () => void }

function Palette({ open, onClose, onGo }: { open: boolean; onClose: () => void; onGo: (v: OyinView) => void }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);

  const cmds: Cmd[] = useMemo(() => [
    { label: "◎ Nazorat — bugun nima qilish kerak", hint: "", run: () => onGo("nazorat") },
    { label: "◍ Odamlar — ball reytingi", hint: "", run: () => onGo("odamlar") },
    { label: "⚠ Shubhali odamlarni ko'rsat", hint: "xavf", run: () => onGo("odamlar") },
    { label: "🎁 Mukofot katalogi", hint: "", run: () => onGo("mukofot") },
    { label: "📥 Excel'dan mukofot yuklash", hint: "import", run: () => onGo("mukofot") },
    { label: "📈 Mukofot tezligi — qaysi biri ulgurmaydi", hint: "", run: () => onGo("mukofot") },
    { label: "💰 Byudjet va sovrin rejasi", hint: "", run: () => onGo("mukofot") },
    { label: "💳 Kartalar reyestri", hint: "", run: () => onGo("kartalar") },
    { label: "🎬 Mukofot kuni — tiraj", hint: "", run: () => onGo("kartalar") },
    { label: "📸 Hikoyalarni tekshirish", hint: "moderatsiya", run: () => onGo("hikoya") },
    { label: "👑 Gashtak guruhlari", hint: "", run: () => onGo("gashtak") },
    { label: "💬 Komentariya shikoyatlari", hint: "moderatsiya", run: () => onGo("komentariya") },
    { label: "🔮 Reja — nima bo'ladi?", hint: "proyeksiya", run: () => onGo("reja") },
    { label: "📜 Faoliyat jurnali", hint: "mijoz balli", run: () => onGo("odamlar") },
    { label: "🧾 Audit jurnali", hint: "admin amallari", run: () => onGo("sozlama") },
    { label: "📅 Mavsum sanalari", hint: "", run: () => onGo("sozlama") },
    { label: "🧪 Men — o'zim sinab ko'raman", hint: "", run: () => onGo("sozlama") },
  ], [onGo]);

  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? cmds.filter((c) => c.label.toLowerCase().includes(s) || c.hint.includes(s)) : cmds;
  }, [q, cmds]);

  useEffect(() => { if (open) { setQ(""); setSel(0); } }, [open]);
  useEffect(() => { setSel(0); }, [q]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent): void => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setSel((i) => Math.min(hits.length - 1, i + 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setSel((i) => Math.max(0, i - 1)); }
      else if (e.key === "Enter") {
        e.preventDefault();
        const c = hits[sel];
        if (c) { c.run(); onClose(); }
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, hits, sel, onClose]);

  if (!open) return null;
  return (
    <div className="oy-pal">
      <button type="button" className="oy-scrim" aria-label="Yopish" onClick={onClose} />
      <div className="oy-pal-c">
        {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
        <input
          className="oy-pal-i" autoFocus value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Buyruq yozing…  «shubhali», «import», «tiraj», «audit»"
        />
        <div className="oy-pal-l">
          {hits.length === 0 && <div className="oy-pal-r oy-dim3">«{q}» bo'yicha buyruq topilmadi</div>}
          {hits.map((c, i) => (
            <button
              key={c.label} type="button"
              className={i === sel ? "oy-pal-r oy-pal-r-on" : "oy-pal-r"}
              onMouseEnter={() => setSel(i)}
              onClick={() => { c.run(); onClose(); }}
            >
              {c.label}
              {c.hint && <span className="oy-pal-g">{c.hint}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
