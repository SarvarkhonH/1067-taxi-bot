// 🏠 "Uy" — the taxi-first home tab (default). Light + leaflet-free; the LivingHome map
// version is the flag-gated upgrade. Greeting + balance + taxi CTA + Bugun + quick tiles.
// NewUyView (feature "newhome", UY_REDESIGN Bosqich 1) = the premium super-app home below.
// 🫧 2026-08-10 — LIQUID GLASS redizayni (ega maketi `birjoy-glass.html`): ko'rinish butunlay
// yangilandi (`gl-*` klasslari, tokens.css), MANTIQ esa TEGILMADI — o'sha so'rovlar, o'sha
// holatlar (loading/error/empty), o'sha `onNav/onBook/onBanner` chaqiruvlari, o'sha xato-matni.
import { useEffect, useState } from "react";
import type { ClassifiedCard, HomeBanner, HomeFeedItem, MeResponse, OyinPrizeView, OyinStateResponse, SavedAddressView, ServiceListingCard } from "@t1067/shared";
import { INSP_TIER_EMOJI, INSP_TIER_LABEL, OYIN_FINAL_LOCK_MS, oyinHintOf } from "@t1067/shared";
import { api, apiUrl } from "./api";
import { haptic } from "./telegram";
import { HomeGames } from "./homeGames";

/** ⏳ Mavsum sanog'i — uy kartasi VA mehmon-teaser uchun YAGONA manba (ikkalasi ham shu
 *  funksiyani chaqiradi, aks holda matn va faza qoidalari vaqt o'tib bir-biridan uzoqlashadi).
 *
 *  Ikki qoida shu yerda qulflangan:
 *  • `Date.parse(null) → NaN` → ekranda "NaN kun" (DIZAYN_QOIDALARI #5). Sana yo'q bo'lsa
 *    RAQAM umuman chizilmaydi — faza so'z bilan aytiladi.
 *  • "0 SOAT QOLDI" TAQIQ (#5: nol raqam ekranga chiqmaydi). Bir soatdan kam qolganda daqiqa,
 *    daqiqa ham qolmasa "BUGUN BOSHLANADI/YAKUNLANADI".
 *  Qaytadigan `leftMs` chaqiruvchiga FINAL-48 ni hisoblash uchun kerak; sana yo'q bo'lsa
 *  `Infinity` — ya'ni sanasiz mavsum hech qachon "oxirgi 48 soat" deb qaralmaydi. */
export function seasonCountdown(iso: string | null, upcoming: boolean): { has: boolean; text: string; leftMs: number } {
  const ms = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(ms)) return { has: false, text: upcoming ? "TEZ ORADA" : "DAVOM ETMOQDA", leftMs: Infinity };
  const left = Math.max(0, ms - Date.now());
  const d = Math.floor(left / 86400_000);
  const h = Math.floor((left % 86400_000) / 3600_000);
  const m = Math.floor((left % 3600_000) / 60_000);
  const text = d > 0 ? `${d} KUN QOLDI`
    : h > 0 ? `${h} SOAT QOLDI`
      : m > 0 ? `${m} DAQIQA QOLDI`
        : upcoming ? "BUGUN BOSHLANADI" : "BUGUN YAKUNLANADI";
  return { has: true, text, leftMs: left };
}

// ═══════════════════════════════════════════════════════════════════════════
// ✒️ Chiziqli ikonkalar — emoji O'RNIGA (maketdagi til). Emoji har qurilmada boshqacha
// chiziladi va rangini o'zi tanlaydi; SVG esa `currentColor` ni oladi, ya'ni tokenlar
// boshqaradi. Ikonkalar SHU YERDA (uy'ga xos), umumiy `icons.tsx` tab-bar uchun qoladi.
// ═══════════════════════════════════════════════════════════════════════════
function GlIcon({ n, size = 20 }: { n: string; size?: number }) {
  const p = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (n) {
    case "gift":
      return (
        <svg {...p}>
          <rect x="3" y="8" width="18" height="13" rx="2" />
          <path d="M12 8v13M3 12h18" />
          <path d="M12 8s-1.5-4-4-4a2.5 2.5 0 0 0 0 5M12 8s1.5-4 4-4a2.5 2.5 0 0 1 0 5" />
        </svg>
      );
    case "car":
      return (
        <svg {...p}>
          <path d="M5 17h14M6 17l-1-6 2-4h10l2 4-1 6M8 11h8" />
          <circle cx="7.5" cy="17.5" r="1.5" />
          <circle cx="16.5" cy="17.5" r="1.5" />
        </svg>
      );
    case "bag":
      return (
        <svg {...p}>
          <path d="M4 7h16l-1.2 11.2a2 2 0 0 1-2 1.8H7.2a2 2 0 0 1-2-1.8L4 7z" />
          <path d="M9 7V5a3 3 0 0 1 6 0v2" />
        </svg>
      );
    case "food":
      return (
        <svg {...p}>
          <path d="M4 4v7a3 3 0 0 0 3 3v6M7 4v6M10 4v6M17 4c-1.5 2-2 4-2 6a2 2 0 0 0 2 2h2V4h-2zM18 12v8" />
        </svg>
      );
    case "board":
      return (
        <svg {...p}>
          <rect x="3" y="5" width="18" height="15" rx="2" />
          <path d="M7 10h10M7 14h6M8 3v3M16 3v3" />
        </svg>
      );
    case "route":
      return (
        <svg {...p}>
          <path d="M5 19h5a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6" />
          <circle cx="5" cy="19" r="1.7" />
          <circle cx="18" cy="7" r="2" />
        </svg>
      );
    case "tools":
      return (
        <svg {...p}>
          <path d="M15.5 3.5a5 5 0 0 0-6 6.6l-6 6a1.5 1.5 0 0 0 2.1 2.1l6-6a5 5 0 0 0 6.6-6l-3 3-2.7-2.7 3-3z" />
        </svg>
      );
    case "spark":
      return (
        <svg {...p}>
          <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
          <path d="M18.5 15l.6 1.9 1.9.6-1.9.6-.6 1.9-.6-1.9-1.9-.6 1.9-.6z" />
        </svg>
      );
    case "dots":
      return (
        <svg {...p}>
          <circle cx="5" cy="12" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="19" cy="12" r="1.5" />
        </svg>
      );
    case "chev":
      return (
        <svg {...p}>
          <path d="M9 5l7 7-7 7" />
        </svg>
      );
    case "arrow":
      return (
        <svg {...p}>
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      );
    case "cal":
      return (
        <svg {...p}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
      );
    case "lock":
      return (
        <svg {...p}>
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
      );
    case "users":
      return (
        <svg {...p}>
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 6.5a3 3 0 0 1 0 5M17 19a5.5 5.5 0 0 0-2.5-4.5" />
        </svg>
      );
    case "signal":
      return (
        <svg {...p}>
          <path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5.5 5.5 0 0 1 7 0" />
          <circle cx="12" cy="19.5" r="1.1" />
        </svg>
      );
    default:
      return null;
  }
}

/** ∞ BirJoy belgisi — ko'k→yashil gradient. Ranglar `<stop>` larga CSS orqali beriladi
 *  (`.gl-logo .s1…s4`), shuning uchun bu faylda birorta ham hex kod yo'q. */
function BirJoyMark() {
  return (
    <svg className="gl-logo" viewBox="0 0 120 72" aria-hidden="true">
      <defs>
        <linearGradient id="gl-mark" x1="0" y1="0" x2="1" y2="0">
          <stop className="s1" offset="0%" />
          <stop className="s2" offset="38%" />
          <stop className="s3" offset="62%" />
          <stop className="s4" offset="100%" />
        </linearGradient>
      </defs>
      <path
        d="M30 36C30 16 54 16 60 36C66 56 90 56 90 36C90 16 66 16 60 36C54 56 30 56 30 36Z"
        fill="none"
        stroke="url(#gl-mark)"
        strokeWidth="13"
        strokeLinecap="round"
      />
    </svg>
  );
}

// 🎮 Koson O'yini — uy-ekran SOVG'A paneli: sahifadagi YAGONA to'q yuza (ierarxiya shu bilan
// aytiladi). Ikki holat, IKKALASI HAM bir xil balandlikda (`--gl-gift-min` + `.gl-ghead`
// min-height): (a) ball YO'Q → "BEPUL SOVG'ALAR" taklifi; (b) ball BOR → "Keyingi sovg'a"
// progressi. Ma'lumot manbalari o'zgarmadi: `oyinState` + `oyinVitrina`.
function KosonOyinCard({ onNav }: { onNav: (t: string) => void }) {
  const [state, setState] = useState<OyinStateResponse | null>(null);
  const [prizes, setPrizes] = useState<OyinPrizeView[] | null>(null);
  const [dead, setDead] = useState(false); // holat so'rovi YIQILDI (tarmoq/server)
  const [bad, setBad] = useState<Set<string>>(new Set());
  useEffect(() => {
    let alive = true;
    api.oyinState().then((s) => { if (alive) setState(s); }).catch(() => { if (alive) setDead(true); });
    // ⚠️ Vitrina XATOSI ham "javob keldi" deb belgilanadi (bo'sh ro'yxat bilan): aks holda
    // `prizes` abadiy `null` qolib, quyidagi o'rin-egal plitkalar hech qachon almashmasdi.
    api.oyinVitrina().then((v) => { if (alive) setPrizes(v.prizes); }).catch(() => { if (alive) setPrizes([]); });
    return () => { alive = false; };
  }, []);

  const goOyin = () => { haptic(); onNav("oyin"); };

  // ⛔ So'rov yiqildi — karta CHIZILMAYDI. Avval `catch(() => undefined)` edi: `state` abadiy
  // `null` qolib, 554px'lik shimmer-skeleton ekranda MANGU turardi (internet uzilganda uy
  // sahifasining yarmi "yuklanyapti" holatida qotib qolardi). O'yinga ikkinchi yo'l — rail.
  if (dead) return null;
  // Skeleton balandligi real panelga TENG — ikkalasi ham `--gl-gift-min` tokenini o'qiydi,
  // shuning uchun ular jimgina bir-biridan uzoqlashib qololmaydi (avval qo'lda 554px edi).
  if (!state) return <div className="nh-skel gl-sk-gift" />;
  if (!state.season.configured || state.season.phase === "ended") return null;
  // Sovrin yo'q bo'lsa panel CHIZILMAYDI: "BEPUL SOVG'ALAR" deb chaqirib, ichida hech narsa
  // bo'lmasligi — yolg'on va'da. Ayni paytda bu balandlik o'zgarishini ham yo'q qiladi.
  if (state.prizeCount <= 0) return null;

  const upcoming = state.season.phase === "upcoming";
  const cd = seasonCountdown(upcoming ? state.season.startIso : state.season.endIso, upcoming);
  // 🔒 FINAL-48 — mavsum tugashiga `OYIN_FINAL_LOCK_MS` dan kam qolganda CHIPTA OLISH YOPILADI.
  // Qoida `oyin.tsx:screenPhase` bilan AYNAN bir xil va server ham mustaqil to'sadi
  // (`final_lock`). Avval uy kartasi bu fazani bilmasdi va oxirgi 48 soatda ham
  // "BEPUL CHIPTA OLISH" deb chaqirardi — bosgan mijoz vitrinada muzlagan tugmalarni
  // ko'rardi (DIZAYN_QOIDALARI #8: bajarilmaydigan va'da).
  const final48 = !upcoming && cd.leftMs <= OYIN_FINAL_LOCK_MS;
  // 💡 Kunlik maslahat — Toshkent kuni bo'yicha, hammaga bir xil.
  const dailyHint = oyinHintOf(new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10));

  // Sovrin plitkalari — eng qimmatidan 4 tasi. Rasmi bor bo'lsa REAL rasm (DIZAYN_QOIDALARI
  // #10), yo'q/buzuq bo'lsa GRADIENT blok + sovrin NOMI (emoji EMAS: emoji jismoniy narsani
  // ko'rsatmaydi). Sovrin qatordan TUSHIRILMAYDI: aks holda panel balandligi o'zgarib
  // skeleton bilan mos kelmay qoladi va sahifa sakraydi (#11).
  const shots = (prizes ?? []).slice().sort((a, b) => b.price - a.price).slice(0, 4);
  // ⚠️ IKKI SO'ROV, IKKI VAQT: `oyinState` va `oyinVitrina` alohida keladi. Holat birinchi
  // kelganda sovrin qatori BO'SH bo'lardi (80px past karta) va vitrina kelgach sahifa
  // SAKRARDI. Endi vitrina kutilayotganda o'rin-egal plitkalar turadi — soni `prizeCount`
  // dan olinadi (soxta emas: sovrin borligini server allaqachon aytgan), balandlik esa
  // birinchi chizishdan oxirgisigacha BIR XIL.
  const shotCount = prizes === null ? Math.min(4, state.prizeCount) : shots.length;

  // Progress — UMUMIY (ijtimoiy isbot). Nol-bo'linish qo'riqlangan.
  const cap = Math.max(0, state.capacityTotal);
  const sold = Math.max(0, Math.min(state.soldTotal, cap));
  const pct = cap > 0 ? Math.min(100, (sold / cap) * 100) : 0;

  // 🎯 QAYTGAN ODAM holati: balli bor VA maqsad-sovrin aniq. Maqsad — mijoz TANLAGANI
  // (`goalPrizeKey`), tanlamagan bo'lsa eng arzoni. Sovrin ro'yxati hali kelmagan bo'lsa
  // (`prizes === null`) holat (a) da qoladi va vitrina kelgach almashadi — balandlik bir xil
  // bo'lgani uchun bu almashuvda sahifa sakramaydi.
  const catalog = prizes ?? [];
  const cheapest = catalog.length > 0 ? (catalog.slice().sort((a, b) => a.price - b.price)[0] ?? null) : null;
  const goal = (state.goalPrizeKey ? catalog.find((p) => p.key === state.goalPrizeKey) ?? null : null) ?? cheapest;
  const need = goal ? Math.max(0, goal.price - state.ball) : 0;
  const goalPct = goal && goal.price > 0 ? Math.min(100, Math.max(0, (state.ball / goal.price) * 100)) : 0;
  const rideBall = state.hints.rideBall;
  // "N safar qoldi" — FAQAT safar bali musbat bo'lsa hisoblanadi (knob 0 ga tushsa bo'lish
  // Infinity berardi). Aks holda halol qolgan-ball aytiladi; qarz yo'q bo'lsa — tayyorlik.
  const ridesLeft = need > 0 && Number.isFinite(rideBall) && rideBall > 0 ? Math.ceil(need / rideBall) : 0;
  const goalMeta = ridesLeft > 0 ? `${ridesLeft} safar qoldi` : need > 0 ? `${num(need)} ball qoldi` : "Chipta olishga tayyor";
  const returning = state.ball > 0 && goal !== null;

  return (
    <div className="gl-gift">
      <span className="gl-gift-spec" aria-hidden="true" />
      <span className="gl-gift-glow" aria-hidden="true" />
      <div className="gl-gift-in">
        <button className="gl-gift-tap" onClick={goOyin} aria-label="Sodiqlik dasturini ochish">
          <span className="gl-pill">{returning ? "SIZNING SOVG'ANGIZ" : "SOVG'ALAR O'YINI"}</span>

          <span className="gl-ghead">
            {returning && goal ? (
              <span className="gl-prog">
                <span className="gl-prog-row">
                  <span className="gl-prog-im">
                    {goal.photoUrl && !bad.has(goal.key)
                      ? <img src={goal.photoUrl} alt="" loading="lazy" onError={() => setBad((b) => new Set(b).add(goal.key))} />
                      : <span className="gl-shot-ph" />}
                  </span>
                  <span className="gl-prog-t">
                    <span className="gl-prog-k">Keyingi sovg'a</span>
                    <span className="gl-prog-v">{goal.name}</span>
                  </span>
                </span>
                <span className="gl-bar"><i style={{ width: `${goalPct}%` }} /></span>
                <span className="gl-bar-m">
                  <span>{num(state.ball)} / {num(goal.price)} ball</span>
                  <b>{goalMeta}</b>
                </span>
              </span>
            ) : (
              <>
                <span className="gl-gh">BEPUL<b>SOVG'ALAR</b></span>
                <span className="gl-gsub">
                  {final48
                    ? <>Karta olish yopildi — <b>mukofot yaqin!</b></>
                    : <>Bepul karta olib, <b>sovg'alar</b> egasi bo'ling!</>}
                </span>
              </>
            )}
          </span>

          {shotCount > 0 && (
            <span className="gl-shots">
              {prizes === null
                ? Array.from({ length: shotCount }, (_, i) => (
                  <span key={`ph${i}`} className="gl-shot"><span className="gl-shot-ph" /></span>
                ))
                : shots.map((p) => (
                  <span key={p.key} className="gl-shot">
                    {p.photoUrl && !bad.has(p.key)
                      ? <img src={p.photoUrl} alt="" loading="lazy" onError={() => setBad((b) => new Set(b).add(p.key))} />
                      : <span className="gl-shot-ph">{p.name}</span>}
                  </span>
                ))}
            </span>
          )}

          <span className="gl-cd">
            <span className="gl-cd-ic"><GlIcon n={final48 ? "lock" : "cal"} size={22} /></span>
            <span className="gl-cd-tx">
              <small>{final48 ? "MUKOFOT KUNIGA" : upcoming ? "DASTUR BOSHLANISHIGA" : "SOVG'ALAR TOPSHIRILISHIGA"}</small>
              <b>{cd.text}</b>
            </span>
            {state.prizeCount > 0 && (
              <span className="gl-gbadge">{num(state.prizeCount)} ta real sovg'a</span>
            )}
          </span>
        </button>

        {/* 4 qadam — "bepul" so'zi qanday ishlashini DARHOL tushuntiradi (aks holda
            "bepul chipta" va'dasi o'yin ekranidagi ball talabiga zid ko'rinadi). */}
        <div className="gl-steps">
          {(["Safar qil", "Ball yig'", "Karta ol", "Sovg'a ol"] as const).map((tx, i) => (
            <div key={tx} className="gl-step">
              <span className="gl-step-n">{i + 1}</span>
              <span className="gl-step-tx">{tx}</span>
            </div>
          ))}
        </div>

        {/* CTA UCH holatli: mavsum boshlanmagan / oxirgi 48 soat (chipta yopiq) / ochiq.
            Avval ikki holat edi va final-48 "BEPUL CHIPTA OLISH" ga tushib qolardi. */}
        <button className="gl-cta" onClick={goOyin}>
          <GlIcon n={final48 || upcoming ? "gift" : "arrow"} size={19} />
          <span>{final48 || upcoming ? "SOVG'ALARNI KO'RISH" : "BEPUL KARTA OLISH"}</span>
        </button>

        {/* UMUMIY raqamlar (ijtimoiy isbot), mijozning shaxsiy balli EMAS. */}
        <div className="gl-stats">
          <div className="gl-stat-k">
            KARTALAR <b>{num(sold)}</b> / {num(cap)}
            <span className="gl-pct">{pct.toFixed(1)}%</span>
          </div>
          <div className="gl-sbar"><span style={{ width: `${pct}%` }} /></div>
          <div className="gl-stat-s">Har karta — 1 imkoniyat. Ko'proq karta, ko'proq imkoniyat!</div>
        </div>

        {/* 💡 KUNLIK MASLAHAT — uy ekrani birinchi ko'riladigan joy, shuning uchun maslahat
            SHU YERDA ham turadi (ega talabi 2026-08-04). Kun bo'yicha, hammaga bir xil.
            ⛔ Qizil/miltillash YO'Q — maslahat shoshilinch emas. */}
        <div className="gl-hint">
          <span aria-hidden="true">{dailyHint.icon}</span>
          <span>{dailyHint.text}</span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 🏠 NewUyView — premium super-app home (feature "newhome", UY_REDESIGN).
// Rendered instead of UyView when me.flags.newhome. Classic UyView stays the fallback.
// Data: ONE /api/home/feed aggregate (Bosqich 2) — server computes banner + image-forward feed from
// local DB (shop + restoran views), so the client makes a single call. Themes via data-theme.
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ NaN/undefined QO'RIQCHISI (DIZAYN_QOIDALARI #5). `num` uy sahifasidagi HAR raqamni
// chizadi (balans, cashback, chipta soni, narx). Server bitta maydonni `null` qaytarsa —
// `null.toLocaleString` XATO tashlab butun uy ekranini oq qilardi, `NaN` esa ekranda
// "NaN" bo'lib chiqardi. Endi ikkalasi ham "0" ga tushadi.
const num = (n: number) => (Number.isFinite(n) ? n : 0).toLocaleString("ru-RU");
function timeAgo(iso: string): string {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (!Number.isFinite(s) || s < 0) return "";
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} daq oldin`;
  if (s < 86400) return `${Math.round(s / 3600)} soat oldin`;
  return `${Math.round(s / 86400)} kun oldin`;
}

// 2026-07-23 owner: hozircha Do'kon + Restoran + Taxi'ga fokus — Xizmatlar/E'lonlar kirish yo'llari
// (rail, hub, home content-bloklari) vaqtincha qulflangan, "Tez orada" bilan. Qayta ochish uchun
// shu bitta bayroqni false qiling — boshqa hech narsa o'zgarmaydi (kod/ma'lumot saqlanib qoladi).
const FOCUS_MODE = true;
const COMING_SOON_MSG = "🔒 Tez orada! Hozircha Do'kon, Restoran va Taxi'ga fokuslanyapmiz.";

export function NewUyView({ me, onBook, onNav, onBanner }: { me: MeResponse; onBook: () => void; onNav: (t: string) => void; onBanner?: (msg: string) => void }) {
  const [feed, setFeed] = useState<HomeFeedItem[] | null>(null);
  const [banner, setBanner] = useState<HomeBanner | null>(null);
  // 🚨 "Bo'sh" va "yuklanmadi" — IKKI XIL HOLAT. Avval ikkalasi ham `[]` edi va tarmoq
  // uzilganda ekran JIM qolardi: na xato, na qayta-urinish tugmasi.
  const [feedErr, setFeedErr] = useState(false);
  const [hub, setHub] = useState(false);
  // 🖼 Yuklanmagan brend-logotiplari (Ravella) — REACT HOLATIDA. Avval `onError` ichida
  // `img.replaceWith(textNode)` chaqirilardi: bu React boshqaradigan DOM tugunini tashqaridan
  // olib tashlash, ya'ni keyingi render'da React yo'q tugunni yangilamoqchi bo'lib yiqilishi
  // mumkin. Uy/o'yin ekranlarida bu naqsh allaqachon tashlangan edi — rail orqada qolgan edi.
  const [badIc, setBadIc] = useState<Set<string>>(new Set());
  const [ustas, setUstas] = useState<ServiceListingCard[] | null>(null);
  const [elons, setElons] = useState<ClassifiedCard[] | null>(null);
  const f = me.flags ?? {};

  const loadFeed = () => {
    setFeedErr(false);
    setFeed(null);
    api.homeFeed()
      .then((r) => { setFeed(r.items); setBanner(r.banner); })
      .catch(() => { setFeed([]); setFeedErr(true); });
  };

  useEffect(() => {
    let alive = true;
    api.homeFeed()
      .then((r) => { if (alive) { setFeed(r.items); setBanner(r.banner); } })
      .catch(() => { if (alive) { setFeed([]); setFeedErr(true); } });
    return () => { alive = false; };
  }, []);

  // 🔧 Xizmatlar (yaqin ustalar) + 📋 E'lonlar content-bloklari — home'da REAL kontent bilan,
  // faqat rail-ikonka emas (UY_REDESIGN_DOD §3.1 7b/7c). Faqat mos flag ON va FOCUS_MODE off bo'lsa so'raladi.
  useEffect(() => {
    let alive = true;
    if (!FOCUS_MODE && f.xizmatlar) api.svcList({ limit: 5, sort: "new" }).then((r) => { if (alive) setUstas(r.listings); }).catch(() => { if (alive) setUstas([]); });
    if (!FOCUS_MODE && f.elonlar) api.elonAds({ limit: 5 }).then((r) => { if (alive) setElons(r.ads); }).catch(() => { if (alive) setElons([]); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rail = [
    // 🎮 O'yin panjarada ham bor — IKKINCHI yo'l (DIZAYN_QOIDALARI #4: har bo'limga kamida ikki
    // kirish). Bu ayniqsa MUHIM: sovg'a paneli tarmoq xatosida umuman chizilmaydi, o'shanda
    // o'yinga yagona yo'l shu katak bo'lib qoladi.
    { on: !!f.oyin, ico: "gift", lb: "Sovg'a", nav: "oyin", locked: false },
    { on: !!f.shop, ico: "bag", lb: "Do'kon", nav: "dokon", locked: false },
    { on: !!f.restoran, ico: "food", lb: "Restoran", nav: "restoran", locked: false },
    // 🎀 Ravella — hamkor-brend (ega qarori 2026-07-27): panjarada KICHIK tugma, ikonkasi
    // brend logotipi. Do'kon/Restoran'dan keyin turadi — u alohida xizmat turi, ular ichida emas.
    { on: !!f.ravella, ico: "spark", img: "/ravella/logo-mark.png", lb: "Ravella", nav: "ravella", locked: false },
    { on: !!f.intercity, ico: "route", lb: "Yo'l", nav: "yol", locked: false },
    { on: !!f.xizmatlar, ico: "tools", lb: "Xizmat", nav: "xizmat", locked: FOCUS_MODE },
    { on: !!f.elonlar, ico: "board", lb: "E'lon", nav: "elonlar", locked: FOCUS_MODE },
    { on: true, ico: "spark", lb: "Bonus", nav: "play", locked: false },
  ].filter((r) => r.on);

  const go = (t: string) => { haptic(); onNav(t); };
  const tapRail = (r: (typeof rail)[number]) => (r.locked ? onBanner?.(COMING_SOON_MSG) : go(r.nav));
  const badgeLabel = (b?: string) => (b === "top" ? "🔥 TOP" : b === "new" ? "Yangi" : b === "disc" ? "Chegirma" : "");
  // Ism — birinchi so'z (to'liq ism uch bo'lakli bo'lishi mumkin, salomlashuvga uzun).
  const firstName = (me.member.fullName || "").trim().split(/\s+/)[0] ?? "";

  return (
    <div className="gl-view">
      {/* 🌈 Rang MUHITDA yashaydi, panelda emas. `fixed` — skrollda ketmaydi. */}
      <div className="gl-amb" aria-hidden="true">
        <span className="gl-orb o1" />
        <span className="gl-orb o2" />
        <span className="gl-orb o3" />
        <span className="gl-orb o4" />
      </div>

      <header className="gl-top">
        <div className="gl-brand">
          <BirJoyMark />
          <span className="gl-bname">Bir<i>Joy</i></span>
        </div>
        {/* Balans chiplari — ikkalasi ham hamyonga olib boradi (ikkinchi yo'l).
            Cashback — ALOHIDA pul turi, shuning uchun alohida chip. Nol bo'lsa chip UMUMAN
            chizilmaydi: "0 so'm cashback" yangi mijozga hech nima aytmaydi (#7). */}
        <div className="gl-chips">
          <button className="gl-chip" onClick={() => go("wallet")} aria-label={`Tanga balansi: ${num(me.coins)}`}>
            <span className="ci" aria-hidden="true" />{num(me.coins)}
          </button>
          {me.stats.points > 0 && (
            <button className="gl-chip is-cb" onClick={() => go("wallet")} aria-label={`Cashback: ${num(me.stats.points)} so'm`}>
              <span className="ci" aria-hidden="true" />{num(me.stats.points)}
            </button>
          )}
        </div>
      </header>

      <div className="gl-hi">
        <div className="gl-hi-t">
          <div className="gl-hi-a">{firstName ? `Salom, ${firstName}` : "Salom!"}</div>
          <div className="gl-hi-b">Bir shahar. Ko'plab xizmatlar.</div>
        </div>
        {/* ⚠️ Yangi mijozda yechadigan hech narsa YO'Q — unga "Yechish" deb va'da qilish
            yolg'on tugma (#14/#8): bosadi, hamyonda 0 turadi. Shu holatda tugma o'z nomi
            bilan "Hamyon" bo'ladi — bir xil ekran, halol yozuv. */}
        <button className="gl-wal" onClick={() => go("wallet")}>
          {me.coins > 0 || me.stats.points > 0 ? "Yechish →" : "Hamyon →"}
        </button>
      </div>

      {/* 🎁 SOVG'A — sahifadagi yagona to'q panel, taksidan OLDIN (ega maketi 2026-08-10).
          ⚠️ TARIX: 2026-08-03 da poster taksidan KEYIN qo'yilgan edi, chunki u 800px'ga yaqin
          bo'lib xizmat panjarasini ekrandan itarib yuborardi. Yangi panel ~620px (`--gl-gift-min`:
          statistika bir qatorga siqildi, qadamlar bitta satr, hero matni ixcham) — ya'ni taksi
          va panjara pastda qoladi, lekin bitta qisqa skroll ichida. Bu ATAYLAB qilingan almashuv:
          maket sovg'ani birinchi qo'yadi. Real qurilmada ega tasdiqlashi kerak. */}
      {f.oyin && <KosonOyinCard onNav={onNav} />}

      {/* Taxi — ASOSIY BIZNES va pastki bardagi FAB olib tashlangach YAGONA chaqirish nuqtasi.
          ⚠️ Yashil nuqta "jonli" degan signal — mashina SONI yoki masofa YOZILMAYDI: bizda
          jonli haydovchi-sanog'i yo'q, uni to'qish yolg'on bo'lardi. */}
      <button className="gl-taxi" onClick={() => { haptic(); onBook(); }}>
        <span className="gl-taxi-ic"><GlIcon n="car" size={22} /></span>
        <span className="gl-taxi-t">
          <span className="gl-taxi-a">Taxi chaqirish</span>
          <span className="gl-taxi-b"><span className="gl-dot" aria-hidden="true" />Bir tap bilan — yaqin mashina</span>
        </span>
        <span className="gl-taxi-go" aria-hidden="true"><GlIcon n="chev" size={18} /></span>
      </button>

      {rail.length > 0 && (
        <>
          <div className="gl-sh"><div className="t">Kosonda</div></div>
          <div className="gl-tiles">
            {rail.map((r) => (
              <button
                key={r.nav}
                className={`gl-tile${r.nav === "oyin" ? " gf" : ""}${r.locked ? " locked" : ""}`}
                onClick={() => tapRail(r)}
              >
                <span className="gl-tile-ic">
                  {"img" in r && r.img && !badIc.has(r.nav)
                    ? <img className="gl-tile-img" src={r.img} alt="" onError={() => setBadIc((s) => new Set(s).add(r.nav))} />
                    : <GlIcon n={r.ico} />}
                  {r.locked && <span className="gl-soon" aria-hidden="true"><GlIcon n="lock" size={11} /></span>}
                </span>
                <span className="gl-tile-lb">{r.lb}</span>
              </button>
            ))}
            <button className="gl-tile" onClick={() => { haptic(); setHub(true); }}>
              <span className="gl-tile-ic"><GlIcon n="dots" /></span>
              <span className="gl-tile-lb">Barchasi</span>
            </button>
          </div>
        </>
      )}

      {/* "Bugungi tavsiya" banneri o'yin yoniq bo'lganda chiqmaydi (ega qarori 2026-08-02) —
          o'rnini yuqoridagi sovg'a paneli oladi; o'yin o'chirilsa banner avvalgidek qaytadi. */}
      {banner && !f.oyin && (
        <>
          <div className="gl-sh"><div className="t">🔥 Bugungi tavsiya</div></div>
          <button className="gl-promo" onClick={() => go(banner.target)}>
            <img src={apiUrl(banner.imageUrl)} alt="" loading="lazy" decoding="async" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
            <div className="gl-promo-c"><span className="tag">{banner.badge ?? "Tavsiya"}</span><h3>{banner.title}</h3>{banner.subtitle && <p>{banner.subtitle}</p>}</div>
          </button>
        </>
      )}

      {feed === null ? (
        <>
          <div className="gl-sh"><div className="t">Sizga tavsiya</div></div>
          <div className="gl-bento">
            <div className="gl-bc tall"><div className="im nh-skel gl-sk-im" /><div className="gl-bb"><div className="nh-skel gl-sk-l1" /><div className="nh-skel gl-sk-l2" /></div></div>
            {[0, 1].map((i) => <div key={i} className="gl-bc"><div className="im nh-skel" /><div className="gl-bb"><div className="nh-skel gl-sk-l1" /><div className="nh-skel gl-sk-l3" /></div></div>)}
          </div>
        </>
      ) : feed.length > 0 ? (
        <>
          <div className="gl-sh"><div className="t">Sizga tavsiya<small>🍽 Eng yaxshilari</small></div><button className="all" onClick={() => setHub(true)}>Barchasi</button></div>
          <div className="gl-bento">
            {feed.map((it, i) => (
              <button key={it.kind + it.id} className={`gl-bc${i === 0 ? " tall" : ""}`} onClick={() => go(it.target)}>
                <div className="im">
                  {/* Rasm yo'q → GRADIENT blok (emoji EMAS: emoji taom/mahsulotni ko'rsatmaydi). */}
                  {it.photoUrl ? <img src={apiUrl(it.photoUrl)} alt="" loading="lazy" decoding="async" onError={(e) => ((e.target as HTMLImageElement).style.opacity = "0")} /> : <span className="gl-ph" />}
                  {it.badge && <span className={`gl-tg${it.badge === "top" ? " hot" : it.badge === "disc" ? " dc" : ""}`}>{badgeLabel(it.badge)}</span>}
                </div>
                <div className="gl-bb">
                  <div className="nm">{it.name}</div>
                  <div className="mt">{it.sub}{it.rating ? <> · <b>{it.rating.toFixed(1)}★</b></> : null}</div>
                  <div className="pr">
                    <span className="price">{it.priceLabel ? <>{it.oldPriceLabel ? <s>{it.oldPriceLabel}</s> : null}{it.priceLabel}</> : "Buyurtma"}</span>
                    <span className="add">{it.kind === "product" ? "+" : "→"}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      ) : feedErr ? (
        // Tarmoq/server yiqildi — "tavsiya yo'q" EMAS, "yuklanmadi". Farqi muhim: birinchisida
        // odam kutadi, ikkinchisida qayta uradi. Tugma bor, chunki yozuv harakat va'da qiladi (#14).
        <div className="gl-err">
          <span className="ei" aria-hidden="true"><GlIcon n="signal" size={22} /></span>
          <span className="et">Tavsiyalar yuklanmadi — internet aloqasini tekshiring.</span>
          <button className="eb" onClick={() => { haptic(); loadFeed(); }}>Qayta</button>
        </div>
      ) : null}

      {!FOCUS_MODE && f.xizmatlar && ustas !== null && ustas.length > 0 && (
        <>
          <div className="gl-sh"><div className="t">🔧 Xizmatlar<small>Yaqin atrofdagi ustalar</small></div><button className="all" onClick={() => go("xizmat")}>Barchasi</button></div>
          <div className="gl-urow">
            {ustas.map((u) => (
              <button key={u.id} className="gl-ust" onClick={() => go("xizmat")}>
                <div className="gl-ust-im">
                  {u.hasPhoto ? (
                    <img src={apiUrl(`/api/services/photo/${u.id}?s=1`)} alt="" loading="lazy" decoding="async" onError={(e) => ((e.target as HTMLImageElement).style.opacity = "0")} />
                  ) : (
                    <span className="gl-ust-em">{u.categoryEmoji || "🔧"}</span>
                  )}
                  {u.inspTier && <span className="gl-ust-insp" title={`BirJoy tekshiruvi: ${INSP_TIER_LABEL[u.inspTier]}`}>{INSP_TIER_EMOJI[u.inspTier]}</span>}
                </div>
                <div className="gl-ust-b">
                  <div className="un">{u.name}</div>
                  <div className="um">{u.categoryName}</div>
                  {u.reviewCount > 0 ? <div className="ur">⭐ {u.avgRating.toFixed(1)} ({u.reviewCount})</div> : <div className="ur new">🆕 Yangi</div>}
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {!FOCUS_MODE && f.elonlar && elons !== null && elons.length > 0 && (
        <>
          <div className="gl-sh"><div className="t">📋 E'lonlar<small>Mahalladagi so'nggilari</small></div><button className="all" onClick={() => go("elonlar")}>Barchasi</button></div>
          <div className="gl-elist">
            {elons.map((a) => (
              <button key={a.id} className="gl-erow" onClick={() => go("elonlar")}>
                <div className="gl-eic"><GlIcon n="board" /></div>
                <div className="gl-et"><div className="a">{a.title}</div><div className="b">{a.subtype} · {timeAgo(a.createdAt)}</div></div>
                <div className="gl-ep">{a.priceSom ? `${num(a.priceSom)} so'm` : "Kelishiladi"}</div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* O'yin yoniqda bu karta chiqmaydi: yuqoridagi sovg'a paneli allaqachon do'st chaqiradi va
          kuchliroq sabab bilan ("do'sting yursa senga ball tushadi"). Ikkita bir xil CTA —
          ikkalasi ham zaiflashadi. O'yin o'chsa karta avvalgidek qaytadi. */}
      {!f.oyin && (
        <button className="gl-invite" onClick={() => go("invite")}>
          <span className="ii"><GlIcon n="users" size={22} /></span>
          <span className="gl-invite-t"><b>Do'stni chaqir — pul ishla</b><small>Har do'st uchun bonus · birinchi safar bepul</small></span>
          <span className="ar" aria-hidden="true"><GlIcon n="arrow" /></span>
        </button>
      )}

      {hub && <ServicesHub me={me} onNav={onNav} onClose={() => setHub(false)} onBanner={onBanner} />}
    </div>
  );
}

// "Barchasi xizmatlar" bottom-sheet hub — every vertical in one grid (flag-gated).
function ServicesHub({ me, onNav, onClose, onBanner }: { me: MeResponse; onNav: (t: string) => void; onClose: () => void; onBanner?: (msg: string) => void }) {
  const f = me.flags ?? {};
  const items = [
    { on: true, ic: "nh-i-o", em: "🚖", n: "Taxi", s: "Chaqirish", nav: "uy", locked: false },
    { on: !!f.oyin, ic: "nh-i-g", em: "🎮", n: "Sodiqlik dasturi", s: "Ball · mukofotlar", nav: "oyin", locked: false },
    { on: !!f.shop, ic: "nh-i-b", em: "🏪", n: "Do'kon", s: "Mahsulot xarid", nav: "dokon", locked: false },
    { on: !!f.restoran, ic: "nh-i-o", em: "🍽", n: "Restoran", s: "Taom yetkazish", nav: "restoran", locked: false },
    { on: !!f.xizmatlar, ic: "nh-i-v", em: "🔧", n: "Xizmatlar", s: FOCUS_MODE ? "🔒 Tez orada" : "Usta · master", nav: "xizmat", locked: FOCUS_MODE },
    { on: !!f.elonlar, ic: "nh-i-p", em: "📋", n: "E'lonlar", s: FOCUS_MODE ? "🔒 Tez orada" : "Mahalla taxtasi", nav: "elonlar", locked: FOCUS_MODE },
    { on: !!f.ravella, ic: "nh-i-r", em: "🎀", n: "Ravella", s: "Bayram bezaklari", nav: "ravella", locked: false },
    { on: !!f.intercity, ic: "nh-i-t", em: "🚐", n: "Yo'l", s: "Shaharlararo", nav: "yol", locked: false },
    { on: true, ic: "nh-i-g", em: "🎁", n: "Bonus", s: "O'yin · vazifa", nav: "play", locked: false },
    { on: true, ic: "nh-i-g", em: "🏆", n: "Reyting", s: "Liga · do'stlar", nav: "reyting", locked: false },
    { on: true, ic: "nh-i-t", em: "👛", n: "Hamyon", s: "Tanga · cashback", nav: "wallet", locked: false },
  ].filter((i) => i.on);
  const tap = (i: (typeof items)[number]) => {
    if (i.locked) { haptic(); onBanner?.(COMING_SOON_MSG); return; }
    haptic(); onClose(); onNav(i.nav);
  };
  return (
    <div className="nh-hub-scrim" onClick={onClose}>
      <div className="nh-hub" onClick={(e) => e.stopPropagation()}>
        <div className="nh-hub-grip" />
        <div className="nh-hub-h">Barchasi xizmatlar</div>
        <div className="nh-hub-grid">
          {items.map((i) => (
            <button key={i.n} className={`nh-hc${i.locked ? " locked" : ""}`} onClick={() => tap(i)}>
              <span className={`hi ${i.ic}`}>{i.em}{i.locked && <span className="soon-bd" aria-hidden="true">🔒</span>}</span>
              <div className="hn">{i.n}</div><div className="hs">{i.s}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
