// 🏠 "Uy" — the taxi-first home tab (default). Light + leaflet-free; the LivingHome map
// version is the flag-gated upgrade. Greeting + balance + taxi CTA + Bugun + quick tiles.
// NewUyView (feature "newhome", UY_REDESIGN Bosqich 1) = the premium super-app home below.
import { useEffect, useState } from "react";
import type { ClassifiedCard, HomeBanner, HomeFeedItem, MeResponse, OyinPrizeView, OyinStateResponse, SavedAddressView, ServiceListingCard } from "@t1067/shared";
import { INSP_TIER_EMOJI, INSP_TIER_LABEL, OYIN_FINAL_LOCK_MS } from "@t1067/shared";
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

// 🎮 Koson O'yini — uy-ekran HERO kartasi (feature "oyin", ega redizayni 2026-08-02: "katta va
// chiroyli preview kerak"). "Bugungi tavsiya" banneri o'rnini oladi (uy renderida f.oyin bilan
// mask qilinadi). Katta sovrin-rasmlari real vitrina'dan (admin qo'ygan foto, emoji-fallback);
// "Sovrinlarni ko'rish" o'yin ekranini to'g'ridan-to'g'ri vitrina tabida ochadi (localStorage flag).
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
  // Skeleton balandligi real kartaga TENG — aks holda yuklanganda sahifa sakraydi.
  if (!state) return <div className="nh-oyin"><div className="nh-skel" style={{ height: 554, borderRadius: 22 }} /></div>;
  if (!state.season.configured || state.season.phase === "ended") return null;
  // Sovrin yo'q bo'lsa karta CHIZILMAYDI: "BEPUL SOVG'ALAR" deb chaqirib, ichida hech narsa
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

  // Sovrin plitkalari — eng qimmatidan 4 tasi. Rasmi bor bo'lsa REAL rasm (DIZAYN_QOIDALARI
  // #10), yo'q/buzuq bo'lsa RANGLI plitka + emoji. Sovrin qatordan TUSHIRILMAYDI: aks holda
  // karta balandligi o'zgarib skeleton bilan mos kelmay qoladi va sahifa sakraydi (#11).
  const shots = (prizes ?? []).slice().sort((a, b) => b.price - a.price).slice(0, 4);
  // ⚠️ IKKI SO'ROV, IKKI VAQT: `oyinState` va `oyinVitrina` alohida keladi. Holat birinchi
  // kelganda sovrin qatori BO'SH bo'lardi (80px past karta) va vitrina kelgach sahifa
  // SAKRARDI. Endi vitrina kutilayotganda o'rin-egal plitkalar turadi — soni `prizeCount`
  // dan olinadi (soxta emas: sovrin borligini server allaqachon aytgan), balandlik esa
  // birinchi chizishdan oxirgisigacha BIR XIL.
  const shotCount = prizes === null ? Math.min(4, state.prizeCount) : shots.length;

  // Progress — UMUMIY (shaxsiy ball EMAS). Nol-bo'linish qo'riqlangan.
  const cap = Math.max(0, state.capacityTotal);
  const sold = Math.max(0, Math.min(state.soldTotal, cap));
  const pct = cap > 0 ? Math.min(100, (sold / cap) * 100) : 0;

  return (
    <div className="nh-oyin">
      <button className="nh-oyin-hero" onClick={goOyin} aria-label="Sovg'alar mavsumini ochish">
        <span className="nh-oyin-conf" aria-hidden="true" />
        <span className="nh-oyin-gift" aria-hidden="true">🎁</span>
        <span className="nh-oyin-h1">BEPUL</span>
        <span className="nh-oyin-h2">SOVG'ALAR</span>
        {/* ⚠️ Matnlar QASDAN qisqa: eng tor telefonda ham bitta satrga sig'ishi kerak —
            ikkinchi satrga o'tsa karta balandligi 554px'dan oshib skeleton bilan mos kelmay
            qoladi va sahifa sakraydi (#11). O'LCHANDI: 320/360/375/390/412/428 kengliklarda
            VA oltita fazada (active · upcoming · final48 · daqiqa · sanasiz · o'rin-egal
            plitkalar) — 36 ta kombinatsiyaning HAMMASIDA 553.88px. */}
        <span className="nh-oyin-lead">
          {final48
            ? <>Chipta olish yopildi — <b>tiraj yaqin!</b></>
            : <>Bepul chipta olib, <b>sovg'alar</b> egasi bo'ling!</>}
        </span>

        <span className="nh-oyin-cd">
          <span className="nh-oyin-cd-ic" aria-hidden="true">{final48 ? "🔒" : "📅"}</span>
          <span className="nh-oyin-cd-tx">
            <small>{final48 ? "TIRAJGA" : upcoming ? "MAVSUM BOSHLANISHIGA" : "SOVG'ALAR TOPSHIRILISHIGA"}</small>
            <b>{cd.text}</b>
          </span>
        </span>

        {shotCount > 0 && (
          <span className="nh-oyin-shots">
            {prizes === null
              ? Array.from({ length: shotCount }, (_, i) => (
                <span key={`ph${i}`} className="nh-oyin-shot"><span className="nh-oyin-shot-em">🎁</span></span>
              ))
              : shots.map((p) => (
                <span key={p.key} className="nh-oyin-shot">
                  {p.photoUrl && !bad.has(p.key)
                    ? <img src={p.photoUrl} alt="" loading="lazy" onError={() => setBad((b) => new Set(b).add(p.key))} />
                    : <span className="nh-oyin-shot-em">{p.icon}</span>}
                </span>
              ))}
          </span>
        )}

        {state.prizeCount > 0 && (
          <span className="nh-oyin-badge">⭐ {state.prizeCount} TA REAL SOVG'A</span>
        )}
      </button>

      {/* Oq panel — UMUMIY raqamlar (ijtimoiy isbot), mijozning shaxsiy balli EMAS. */}
      <div className="nh-oyin-stats">
        <div className="nh-oyin-stat">
          <div className="nh-oyin-stat-k">🎟 CHIPTALAR SONI</div>
          <div className="nh-oyin-stat-v"><b>{num(sold)}</b> <span>/ {num(cap)}</span></div>
          <div className="nh-oyin-stat-s">tarqatildi</div>
          <div className="nh-oyin-bar"><span style={{ width: `${pct}%` }} /></div>
          <div className="nh-oyin-pct">{pct.toFixed(1)}%</div>
        </div>
        <div className="nh-oyin-stat is-side">
          <div className="nh-oyin-stat-k">🎟 Har chipta</div>
          <div className="nh-oyin-stat-v2">1 imkoniyat!</div>
          <div className="nh-oyin-stat-s">Ko'proq chipta — ko'proq imkoniyat!</div>
        </div>
      </div>

      {/* CTA UCH holatli: mavsum boshlanmagan / oxirgi 48 soat (chipta yopiq) / ochiq.
          Avval ikki holat edi va final-48 "BEPUL CHIPTA OLISH" ga tushib qolardi. */}
      <button className="nh-oyin-cta" onClick={goOyin}>
        <span className="nh-oyin-cta-ic" aria-hidden="true">{final48 || upcoming ? "🎁" : "🎟"}</span>
        <span>{final48 || upcoming ? "SOVG'ALARNI KO'RISH" : "BEPUL CHIPTA OLISH"}</span>
        <span className="nh-oyin-cta-go" aria-hidden="true">›</span>
      </button>

      {/* 4 qadam — "bepul" so'zi qanday ishlashini DARHOL tushuntiradi (aks holda
          "bepul chipta" va'dasi o'yin ekranidagi ball talabiga zid ko'rinadi). */}
      <div className="nh-oyin-steps">
        {([["🚕", "Safar qil"], ["⭐", "Ball yig'"], ["🎟", "Chipta ol"], ["🎁", "Sovg'a yut"]] as const).map(([em, tx], i) => (
          <div key={tx} className="nh-oyin-step">
            <span className="nh-oyin-step-em">{em}</span>
            <span className="nh-oyin-step-tx">{i + 1}. {tx}</span>
          </div>
        ))}
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
    // 🎮 O'yin rail'da ham bor — IKKINCHI yo'l (DIZAYN_QOIDALARI #4: har bo'limga kamida ikki
    // kirish). Bu ayniqsa MUHIM: poster kartasi tarmoq xatosida umuman chizilmaydi, o'shanda
    // o'yinga yagona yo'l shu ikonka bo'lib qoladi.
    { on: !!f.oyin, ic: "nh-i-g", em: "🎮", lb: "O'yin", nav: "oyin", locked: false },
    { on: !!f.shop, ic: "nh-i-b", em: "🏪", lb: "Do'kon", nav: "dokon", locked: false },
    { on: !!f.restoran, ic: "nh-i-o", em: "🍽", lb: "Restoran", nav: "restoran", locked: false },
    // 🎀 Ravella — hamkor-brend (ega qarori 2026-07-27): rail'da KICHIK tugma, ikonkasi emoji emas,
    // brend logotipi. Do'kon/Restoran'dan keyin turadi — u alohida xizmat turi, ular ichida emas.
    { on: !!f.ravella, ic: "nh-i-r", em: "🎀", img: "/ravella/logo-mark.png", lb: "Ravella", nav: "ravella", locked: false },
    { on: !!f.intercity, ic: "nh-i-t", em: "🚐", lb: "Yo'l", nav: "yol", locked: false },
    { on: !!f.xizmatlar, ic: "nh-i-v", em: "🔧", lb: "Xizmat", nav: "xizmat", locked: FOCUS_MODE },
    { on: !!f.elonlar, ic: "nh-i-p", em: "📋", lb: "E'lon", nav: "elonlar", locked: FOCUS_MODE },
    { on: true, ic: "nh-i-g", em: "🎁", lb: "Bonus", nav: "play", locked: false },
  ].filter((r) => r.on);

  const go = (t: string) => { haptic(); onNav(t); };
  const tapRail = (r: (typeof rail)[number]) => (r.locked ? onBanner?.(COMING_SOON_MSG) : go(r.nav));
  const badgeLabel = (b?: string) => (b === "top" ? "🔥 TOP" : b === "new" ? "Yangi" : b === "disc" ? "Chegirma" : "");

  return (
    <div className="nh-view">
      {/* Minimalizm (ega qarori 2026-07-26): bosh sahifadan brend-satri, tanga-tugmasi va
          qidiruv olib tashlandi. Brend global topbar'da ham yo'q — balans faqat quyidagi
          hamyon kartasida (bitta joyda), qidiruvga do'kon/restoran tablari orqali boriladi. */}
      <div className="nh-wallet">
        <div className="wrow">
          <div>
            <div className="k">🪙 Tanga balansi</div>
            <div className="b">{num(me.coins)}</div>
            {/* Cashback — ALOHIDA pul turi, shuning uchun alohida "pill". Nol bo'lsa satr
                UMUMAN chizilmaydi: "0 so'm cashback" yangi mijozga hech nima aytmaydi,
                faqat kartani to'ldiradi (DIZAYN_QOIDALARI #7). */}
            {me.stats.points > 0 && <div className="cb">🚕 {num(me.stats.points)} so'm cashback</div>}
          </div>
          {/* ⚠️ Yangi mijozda yechadigan hech narsa YO'Q — unga "Yechish" deb va'da qilish
              yolg'on tugma (#14/#8): bosadi, hamyonda 0 turadi. Shu holatda tugma o'z nomi
              bilan "Hamyon" bo'ladi — bir xil ekran, halol yozuv. */}
          <button className="yc" onClick={() => go("wallet")}>
            {me.coins > 0 || me.stats.points > 0 ? "Yechish →" : "Hamyon →"}
          </button>
        </div>
      </div>

      {/* Taxi-kartasi (ega tuzatishi 2026-07-26): pastki bardagi FAB olib tashlangach bu YAGONA
          chaqirish nuqtasi — minimalizm bosqichida xato o'chirilgan edi, qaytarildi. */}
      <button className="nh-taxi" onClick={() => { haptic(); onBook(); }}>
        <span className="i">🚖</span>
        <span><b>Taxi chaqirish</b><small>Bir tap bilan — yaqin mashina</small></span>
        <span className="go">→</span>
      </button>

      {/* ⚠️ TARTIB (o'lchab tuzatildi 2026-08-03): rail AVVAL o'yin kartasidan KEYIN turardi.
          390×844 (iPhone 14) da o'lchandi — rail'ning yuqori chekkasi y=761, suzuvchi pastki
          menyu esa y=760 dan boshlanadi: ya'ni 9 ta xizmat ikonkasidan ekranga 0 PIKSEL
          tushardi. 554px'lik o'yin posteri ularni butunlay itarib yuborgan edi. Endi rail
          taksidan keyin, poster undan keyin: poster hamon ekranning ~85%ini egallaydi va
          "BEPUL CHIPTA OLISH" tugmasi ham menyudan yuqorida qoladi. */}
      {(rail.length > 0) && (
        <div className="nh-rail">
          {rail.map((r) => (
            <button key={r.nav} className={`nh-svc${r.locked ? " locked" : ""}`} onClick={() => tapRail(r)}>
              <span className={`ic ${r.ic}`}>
                {"img" in r && r.img && !badIc.has(r.nav)
                  ? <img className="nh-brand-ic" src={r.img} alt="" onError={() => setBadIc((s) => new Set(s).add(r.nav))} />
                  : r.em}
                {r.locked && <span className="soon-bd" aria-hidden="true">🔒</span>}
              </span>
              <span className="lb">{r.lb}</span>
            </button>
          ))}
          <button className="nh-svc" onClick={() => { haptic(); setHub(true); }}>
            <span className="ic nh-i-all">⋯</span><span className="lb">Barchasi</span>
          </button>
        </div>
      )}

      {f.oyin && <KosonOyinCard onNav={onNav} />}

      {/* "Bugungi tavsiya" banneri o'yin yoniq bo'lganda chiqmaydi (ega qarori 2026-08-02) —
          o'rnini yuqoridagi Koson hero-kartasi oladi; o'yin o'chirilsa banner avvalgidek qaytadi. */}
      {banner && !f.oyin && (
        <>
          <div className="nh-sh"><div className="t">🔥 Bugungi tavsiya</div></div>
          <button className="nh-promo" onClick={() => go(banner.target)}>
            <img src={apiUrl(banner.imageUrl)} alt="" loading="lazy" decoding="async" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
            <div className="pc"><span className="tag">{banner.badge ?? "Tavsiya"}</span><h3>{banner.title}</h3>{banner.subtitle && <p>{banner.subtitle}</p>}</div>
          </button>
        </>
      )}

      {feed === null ? (
        <>
          <div className="nh-sh"><div className="t">Sizga tavsiya</div></div>
          <div className="nh-bento">
            <div className="nh-bc tall"><div className="im nh-skel" style={{ minHeight: 168 }} /><div className="nh-bb"><div className="nh-skel" style={{ height: 14, marginBottom: 6 }} /><div className="nh-skel" style={{ height: 11, width: "60%" }} /></div></div>
            {[0, 1].map((i) => <div key={i} className="nh-bc"><div className="im nh-skel" /><div className="nh-bb"><div className="nh-skel" style={{ height: 14, marginBottom: 6 }} /><div className="nh-skel" style={{ height: 11, width: "50%" }} /></div></div>)}
          </div>
        </>
      ) : feed.length > 0 ? (
        <>
          <div className="nh-sh"><div className="t">Sizga tavsiya<small>🍽 Eng yaxshilari</small></div><button className="all" onClick={() => setHub(true)}>Barchasi</button></div>
          <div className="nh-bento">
            {feed.map((it, i) => (
              <button key={it.kind + it.id} className={`nh-bc${i === 0 ? " tall" : ""}`} onClick={() => go(it.target)}>
                <div className="im">
                  {it.photoUrl ? <img src={apiUrl(it.photoUrl)} alt="" loading="lazy" decoding="async" onError={(e) => ((e.target as HTMLImageElement).style.opacity = "0")} /> : <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40 }}>{it.kind === "product" ? "🛍" : "🍽"}</span>}
                  {it.badge && <span className={`nh-tg${it.badge === "top" ? " hot" : it.badge === "disc" ? " dc" : ""}`}>{badgeLabel(it.badge)}</span>}
                </div>
                <div className="nh-bb">
                  <div className="nm">{it.name}</div>
                  <div className="mt">{it.sub}{it.rating ? <> · <b>{it.rating.toFixed(1)}★</b></> : null}</div>
                  <div className="pr">
                    <span className="price">{it.priceLabel ? <>{it.oldPriceLabel ? <s style={{ color: "var(--nh-dim2)", fontWeight: 500, marginRight: 5 }}>{it.oldPriceLabel}</s> : null}{it.priceLabel}</> : "Buyurtma"}</span>
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
        <div className="nh-err">
          <span className="ei" aria-hidden="true">📡</span>
          <span className="et">Tavsiyalar yuklanmadi — internet aloqasini tekshiring.</span>
          <button className="eb" onClick={() => { haptic(); loadFeed(); }}>Qayta</button>
        </div>
      ) : null}

      {!FOCUS_MODE && f.xizmatlar && ustas !== null && ustas.length > 0 && (
        <>
          <div className="nh-sh"><div className="t">🔧 Xizmatlar<small>Yaqin atrofdagi ustalar</small></div><button className="all" onClick={() => go("xizmat")}>Barchasi</button></div>
          <div className="nh-urow">
            {ustas.map((u) => (
              <button key={u.id} className="nh-ust" onClick={() => go("xizmat")}>
                <div className="nh-ust-im">
                  {u.hasPhoto ? (
                    <img src={apiUrl(`/api/services/photo/${u.id}?s=1`)} alt="" loading="lazy" decoding="async" onError={(e) => ((e.target as HTMLImageElement).style.opacity = "0")} />
                  ) : (
                    <span className="nh-ust-em">{u.categoryEmoji || "🔧"}</span>
                  )}
                  {u.inspTier && <span className="nh-ust-insp" title={`BirJoy tekshiruvi: ${INSP_TIER_LABEL[u.inspTier]}`}>{INSP_TIER_EMOJI[u.inspTier]}</span>}
                </div>
                <div className="nh-ust-b">
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
          <div className="nh-sh"><div className="t">📋 E'lonlar<small>Mahalladagi so'nggilari</small></div><button className="all" onClick={() => go("elonlar")}>Barchasi</button></div>
          <div className="nh-elist">
            {elons.map((a) => (
              <button key={a.id} className="nh-erow" onClick={() => go("elonlar")}>
                <div className="nh-eic">📋</div>
                <div className="nh-et"><div className="a">{a.title}</div><div className="b">{a.subtype} · {timeAgo(a.createdAt)}</div></div>
                <div className="nh-ep">{a.priceSom ? `${num(a.priceSom)} so'm` : "Kelishiladi"}</div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* O'yin yoniqda bu karta chiqmaydi: yuqoridagi o'yin-hero'si allaqachon do'st chaqiradi va
          kuchliroq sabab bilan ("do'sting yursa senga ball tushadi"). Ikkita bir xil CTA —
          ikkalasi ham zaiflashadi. O'yin o'chsa karta avvalgidek qaytadi. */}
      {!f.oyin && (
        <button className="nh-invite" onClick={() => go("invite")}>
          <span className="ii">👥</span>
          <span><b>Do'stni chaqir — pul ishla</b><small>Har do'st uchun bonus · birinchi safar bepul</small></span>
          <span className="ar">→</span>
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
    { on: !!f.oyin, ic: "nh-i-g", em: "🎮", n: "O'yin mavsumi", s: "Ball · sovrinlar", nav: "oyin", locked: false },
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
