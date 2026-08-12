// 📖 O'YIN O'RGATUVCHI STORY — taxiStory.tsx BILAN AYNAN BIR XIL naqsh (ega talabi 2026-08-12:
// «kirishda story ko'rinishida tushuntirish juda oddiy taxi bo'limida ishlatganimizdan yasa»).
//
// Bu component `taxiStory.tsx` dan mexanik jihatdan NUSXA: progress-chiziqlar, ushlab-turib
// to'xtatish, bosish zonalari, klaviatura, `prefers-reduced-motion`, `story.css` (bir xil fayl,
// ikkinchi marta yuklanmaydi — brauzer allaqachon keshlagan). Farqi FAQAT kontent: 5 karta,
// o'yin haqida.
//
// ⚠️ Beshta mavzu ANIQ so'ralgan gamification-tahlildan chiqdi (bu sessiyada 18 ta agent
// tekshirgan reja): «uch savolga javob» (ball nima / karta nima / qachongacha) + tiraj +
// boshlash chaqirig'i. HAR RAQAM `state.hints`/`cheapest`dan — qotirilmagan (DIZAYN_QOIDALARI #9).
//
// TAQIQLANGAN SO'ZLAR (ega qarori, bu sessiyada tasdiqlangan): «kuyadi», «yonadi», «yo'qoladi»,
// «jarima» — bular jazo ohangida eshitiladi. O'rniga: «noldan boshlanadi», «tanlov sizda».
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { OyinStateResponse } from "@t1067/shared";
import { haptic } from "./telegram";
import "./design/feat/story.css"; // taxiStory bilan BIR XIL fayl — ikkinchi marta yuklanmaydi

const STORY_MS = 9500;
const STORY_MS_REDUCED = 13000;

interface Props {
  hints: OyinStateResponse["hints"];
  cheapestName: string | null;
  cheapestPrice: number | null;
  onClose: () => void;
}

type CardId = "ball" | "karta" | "tiraj" | "mavsum" | "boshla";
const CARD_IDS: CardId[] = ["ball", "karta", "tiraj", "mavsum", "boshla"];

const TAGS: Record<CardId, string> = {
  ball: "1 — ball",
  karta: "2 — karta",
  tiraj: "3 — mukofot kuni",
  mavsum: "4 — eng muhimi",
  boshla: "5 — boshlash",
};
const TITLES: Record<CardId, string> = {
  ball: "Har safar ball olib keladi",
  karta: "Ball sovg'a kartasiga aylanadi",
  tiraj: "Sovg'a jonli efirda topshiriladi",
  mavsum: "Ball mavsum ichida yashaydi",
  boshla: "Bugun boshlang — birinchi ball",
};

export function OyinStory({ hints, cheapestName, cheapestPrice, onClose }: Props) {
  const reduced = useMemo(
    () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  const n = CARD_IDS.length;
  const [i, setI] = useState(0);
  const timer = useRef<number | undefined>(undefined);
  const [run, setRun] = useState(0);

  const go = useCallback((delta: 1 | -1) => {
    haptic();
    setI((v) => { const next = v + delta; return next < 0 || next >= n ? v : next; });
    setRun((r) => r + 1);
  }, [n]);

  const [held, setHeld] = useState(false);
  const pressAt = useRef(0);

  useEffect(() => {
    window.clearTimeout(timer.current);
    if (i >= n - 1 || held) return;
    timer.current = window.setTimeout(() => setI((v) => (v < n - 1 ? v + 1 : v)), reduced ? STORY_MS_REDUCED : STORY_MS);
    return () => window.clearTimeout(timer.current);
  }, [i, n, reduced, held]);

  useEffect(() => setRun((r) => r + 1), [i]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, go]);

  const id = CARD_IDS[i];
  if (!id) return null;

  return (
    <div className="st" role="dialog" aria-modal="true" aria-label="O'yin qanday ishlaydi">
      <div className="st-bars">
        {CARD_IDS.map((c, k) => (
          <span key={c} className={`st-bar${k < i ? " done" : k === i ? " now" : ""}`}>
            <i style={k === i ? { animationDuration: `${(reduced ? STORY_MS_REDUCED : STORY_MS) / 1000}s`, animationPlayState: held ? "paused" : "running" } : undefined} />
          </span>
        ))}
      </div>

      <button className="st-skip" onClick={onClose}>{i >= n - 1 ? "Yopish" : "O'tkazib yuborish"}</button>

      {(["prev", "next"] as const).map((side) => (
        <button
          key={side} className={`st-zone ${side}`}
          aria-label={side === "prev" ? "Orqaga" : "Keyingisi"}
          onPointerDown={() => { pressAt.current = Date.now(); setHeld(true); }}
          onPointerUp={() => setHeld(false)}
          onPointerCancel={() => { pressAt.current = 0; setHeld(false); }}
          onPointerLeave={() => { pressAt.current = 0; setHeld(false); }}
          onClick={() => {
            const heldMs = pressAt.current ? Date.now() - pressAt.current : 0;
            pressAt.current = 0;
            if (heldMs > 250) return;
            go(side === "prev" ? -1 : 1);
          }}
        />
      ))}

      <div className="st-card on" key={`${id}-${run}`}>
        <div className="st-stage">{stage(id, hints, cheapestName, cheapestPrice)}</div>
        <div className="st-copy">
          <span className="st-tag">{TAGS[id]}</span>
          <h2 className="st-h">{TITLES[id]}</h2>
          <p className="st-p">{body(id, hints, cheapestName, cheapestPrice)}</p>
          {i >= n - 1 && <button className="st-cta" onClick={onClose}>Taksi chaqirish</button>}
        </div>
      </div>
    </div>
  );
}

function body(id: CardId, h: OyinStateResponse["hints"], cheapestName: string | null, cheapestPrice: number | null) {
  switch (id) {
    case "ball":
      return <>Taksi chaqirasiz — hisobingizga <b>+{h.rideBall} ball</b> tushadi. Ball uchun alohida pul to'lamaysiz, safar narxi o'zgarmaydi. Do'stingiz sizning havolangiz bilan yursa — sizga ham ball.</>;
    case "karta":
      return <>Ball yetganda uni kartaga almashtirasiz. Karta — bitta sovg'a uchun o'ynaydigan joyingiz; o'z raqami bor va <b>«Kartalarim»</b>da turadi.</>;
    case "tiraj":
      return <>Mavsum oxirida Telegram jonli efirida barcha kartalar orasidan sovg'a egalari aniqlanadi. Nechta kartangiz ko'p bo'lsa, imkoniyat shuncha yuqori — lekin karta kafolat emas.</>;
    case "mavsum":
      return <>Mavsum tugagach ball hisobi <b>hammada barobar noldan</b> boshlanadi. Kartaga aylantirgan ballingiz esa saqlanadi va o'z kunini kutadi. Shuning uchun ballni yig'ib qo'ymang — kartaga aylantiring.</>;
    case "boshla":
      return cheapestName && cheapestPrice
        ? <>Ball yig'ishni hoziroq boshlang — taksi chaqiring yoki do'stingizni taklif qiling. <b>{cheapestName}</b> uchun {cheapestPrice} ball kerak, qolgani o'zi yuradi.</>
        : <>Ball yig'ishni hoziroq boshlang — taksi chaqiring yoki do'stingizni taklif qiling, qolgani o'zi yuradi.</>;
  }
}

function stage(id: CardId, h: OyinStateResponse["hints"], cheapestName: string | null, cheapestPrice: number | null) {
  switch (id) {
    case "ball": return <StageBall rideBall={h.rideBall} />;
    case "karta": return <StageKarta />;
    case "tiraj": return <StageTiraj />;
    case "mavsum": return <StageMavsum />;
    case "boshla": return <StageBoshla name={cheapestName} price={cheapestPrice} />;
  }
}

// ── Har karta o'z mini-vidjeti — .st-scene (story.css, 290px kvadrat) ichida. ──────────────────
function StageBall({ rideBall }: { rideBall: number }) {
  return (
    <div className="st-scene st-oy-scene">
      <div className="st-oy-ballnum">🪙</div>
      <div className="st-oy-chip st-oy-chip-a">+{rideBall}</div>
      <div className="st-oy-chip st-oy-chip-b">+{rideBall}</div>
      <div className="st-oy-chip st-oy-chip-c">+{rideBall}</div>
    </div>
  );
}
function StageKarta() {
  return (
    <div className="st-scene st-oy-scene">
      <div className="st-oy-card">
        <div className="st-oy-card-lbl">BIRJOY KARTA</div>
        <div className="st-oy-card-no">421 308 7561</div>
        <div className="st-oy-card-tag">🎁 Sizniki</div>
      </div>
    </div>
  );
}
function StageTiraj() {
  const cells = Array.from({ length: 12 }, (_, i) => i);
  return (
    <div className="st-scene st-oy-scene">
      <div className="st-oy-grid">
        {cells.map((c) => <span key={c} className={`st-oy-cell${c === 7 ? " is-win" : ""}`}>{c === 7 ? "★" : ""}</span>)}
      </div>
      <div className="st-oy-liveTag">🔴 JONLI EFIR</div>
    </div>
  );
}
function StageMavsum() {
  return (
    <div className="st-scene st-oy-scene">
      <div className="st-oy-track">
        <span className="st-oy-track-fill" />
        <span className="st-oy-track-dot" />
      </div>
      <div className="st-oy-track-lbl from">Mavsum boshi</div>
      <div className="st-oy-track-lbl to">Mavsum oxiri</div>
      <div className="st-oy-track-reset">🔄 Yangi mavsum — 0 balldan</div>
    </div>
  );
}
function StageBoshla({ name, price }: { name: string | null; price: number | null }) {
  return (
    <div className="st-scene st-oy-scene">
      <div className="st-oy-taxi">🚕</div>
      <div className="st-oy-arrow">→</div>
      <div className="st-oy-gift">🎁</div>
      {name && price && <div className="st-oy-goal">{name} · {price} ball</div>}
    </div>
  );
}
