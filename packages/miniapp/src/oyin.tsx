// 🎮 KOSON O'YINI ekrani (feature "oyin", DEFAULT_OFF — QORONG'I qurilish, KOSON_OYIN_PLAN.md v9.2,
// KOSON_ADMIN_DOD.md B4). Real API'ga ulangan — mock-data YO'Q. Dizayn-manba: Claude Design
// "BirJoy home screen states" → "Koson Game World.dc.html" (ega tanlagan yakuniy prototip).
//
// ⚠️ B4'da ATAYLAB OLIB TASHLANGAN prototip-elementlari (soxta ma'lumot ko'rsatmaslik uchun):
// "Bugungi maqsad" halqasi (3 vazifa) va "Haftalik vazifa" chizig'i — B1-B5 DoD doirasida haqiqiy
// backend'i qurilmagan (bular alohida, hali boshlanmagan ish); soxta kontakt-ro'yxati — Telegram
// Mini App'lar tanishlar ro'yxatiga kira olmaydi, shuning uchun "Do'st chaqir" endi mavjud
// `shareLink`/`shareStory` (telegram.ts) orqali Telegramning HAQIQIY ulashish oynasini ochadi;
// soxta QR-kvadrat — real QR-generatsiya (referralQrService) B1-B5 doirasida qurilmagan, shuning
// uchun olib tashlandi (ishlamaydigan grafika ko'rsatish — yolg'on).
import { useCallback, useEffect, useRef, useState } from "react";
import type { OyinBoardResponse, OyinJamoamResponse, OyinPrizeView, OyinSeasonClientView, OyinStateResponse, OyinVitrinaResponse } from "@t1067/shared";
import { api } from "./api";
import { copyText, haptic, shareLink } from "./telegram";
import "./design/feat/oyk.css"; // bu ekran ochilgandagina yuklanadi (kritik yo'lda emas)

const OB_SLIDES = [
  { icon: "🚕", text: "Safar qil — har safarga +30 ball" },
  { icon: "🤝", text: "Do'st chaqir — u yursa senga ham ball tushadi" },
  { icon: "🎟", text: "400+ ball = chipta. Chipta — ishtirok, g'alaba emas" },
  { icon: "🎁", text: "Oy oxiri — jonli tiraj. Real sovrinlar!" },
];
const OB_SEEN_KEY = "oyk_onboard_seen";
const START_TAB_KEY = "oyk_start_tab"; // uy-hero'dagi "Sovrinlarni ko'rish" shu orqali vitrina'ga ochadi
const FINAL_WARN_MS = 48 * 3600_000;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function fastPath(remaining: number, referCombo: number, rideBall: number): string {
  if (remaining <= 0) return "Ball yetdi — chiptani ol!";
  if (referCombo <= 0 && rideBall <= 0) return `${remaining} ball qoldi`;
  const dd = referCombo > 0 ? Math.floor(remaining / referCombo) : 0;
  const left = remaining - dd * referCombo;
  const sf = rideBall > 0 ? Math.ceil(left / rideBall) : 0;
  const parts: string[] = [];
  if (dd > 0) parts.push(`${dd} do'st`);
  if (sf > 0) parts.push(`${sf} safar`);
  return parts.length ? `Eng tez yo'l: ${parts.join(" + ")}` : `${remaining} ball qoldi`;
}
// Ekran fazasi = server fazasi + "final48" (oxirgi 48 soat — chipta olish yopiladi).
type ScreenPhase = "unset" | "upcoming" | "active" | "final48" | "ended";
function screenPhase(season: OyinSeasonClientView): ScreenPhase {
  if (!season.configured) return "unset";
  if (season.phase !== "active") return season.phase; // upcoming | ended
  const end = season.endIso ? Date.parse(season.endIso) : NaN;
  if (Number.isFinite(end) && end - Date.now() <= FINAL_WARN_MS) return "final48";
  return "active";
}
/** ⚠️ `Date.parse(null) → NaN`, `Math.max(0, NaN) → NaN` — qo'riqsiz qoldirilsa ekranda
 *  "NaN kun qoldi" chiqadi. Sana yo'q bo'lsa nol qaytariladi va chaqiruvchi umuman chizmaydi. */
function countdownTo(iso: string | null): { d: number; h: number; m: number; totalMs: number } {
  const target = iso ? Date.parse(iso) : NaN;
  const left = Number.isFinite(target) ? Math.max(0, target - Date.now()) : 0;
  const d = Math.floor(left / 86400_000);
  const h = Math.floor((left % 86400_000) / 3600_000);
  const m = Math.floor((left % 3600_000) / 60_000);
  return { d, h, m, totalMs: left };
}

type OyinTab = "home" | "vitrina" | "jamoam";
type SheetKind = "board" | "buy" | null;
type LoadState = "loading" | "ready" | "error";

export function OyinView() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [state, setState] = useState<OyinStateResponse | null>(null);
  const [vitrina, setVitrina] = useState<OyinVitrinaResponse | null>(null);
  const [jamoam, setJamoam] = useState<OyinJamoamResponse | null>(null);
  const [board, setBoard] = useState<OyinBoardResponse | null>(null);
  const [tab, setTab] = useState<OyinTab>(() => {
    try {
      const t = localStorage.getItem(START_TAB_KEY);
      if (t) localStorage.removeItem(START_TAB_KEY);
      return t === "vitrina" ? "vitrina" : "home";
    } catch { return "home"; }
  });
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [buyKey, setBuyKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [celebrate, setCelebrate] = useState<{ prize: OyinPrizeView; ticketNo: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [thanked, setThanked] = useState<Set<number>>(new Set());
  const [onboard, setOnboard] = useState<number | null>(() => {
    try { return localStorage.getItem(OB_SEEN_KEY) ? null : 0; } catch { return 0; }
  });
  const [, forceTick] = useState(0); // countdown daqiqada bir yangilansin
  const toastT = useRef<ReturnType<typeof setTimeout>>();

  const loadHome = useCallback(() => {
    Promise.all([api.oyinState(), api.oyinVitrina()])
      .then(([s, v]) => { setState(s); setVitrina(v); setLoadState("ready"); })
      .catch(() => setLoadState("error"));
  }, []);
  useEffect(() => { loadHome(); }, [loadHome]);
  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);
  // Jamoam BOSH yuklanishdayoq keladi (tab ochilishini kutmaydi) — bosh ekrandagi "rahmat-karta"
  // (oyk-magnet) shu ma'lumotga qaraydi; aks holda u Jamoam tabiga kirmaguncha hech ko'rinmasdi.
  useEffect(() => {
    api.oyinJamoam()
      .then((j) => { setJamoam(j); setThanked(new Set(j.friends.filter((f) => f.thankedToday).map((f) => f.memberId))); })
      .catch(() => setJamoam({ friends: [], totalBall: 0 }));
  }, []);

  const showToast = useCallback((text: string, ms = 2600) => {
    setToast(text);
    clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToast(null), ms);
  }, []);
  useEffect(() => () => clearTimeout(toastT.current), []);

  const openBoard = useCallback(() => {
    setSheet("board");
    if (!board) api.oyinBoard().then(setBoard).catch(() => setBoard({ rows: [], myPos: null }));
  }, [board]);

  // Ulashish matni ANIQ bo'lishi kerak (ega 2026-08-02: "chiroyli va aniq qilish kerak"):
  // bosh sovrin nomi + nima qilish kerakligi + nima uchun bepul. Umumiy "qo'shil" chaqirig'i
  // hech kimni qiziqtirmaydi. Havolani ochgan odam esa botdan rasm+tugmali kartochka oladi
  // (server: bot/oyin.ts sendOyinJoinCard) — chiroylik qabul qiluvchi tomonda.
  const inviteFriend = useCallback(async (nudge?: string) => {
    haptic();
    try {
      const r = await api.referral();
      const topPrize = [...(vitrina?.prizes ?? [])].sort((a, b) => b.price - a.price)[0];
      const text = nudge ?? (topPrize
        ? `🎁 BirJoy O'yinlar Mavsumi — bosh sovrin: ${topPrize.name}!\n\nHech narsa to'lamaysan: shunchaki taksida yur, ball yig', chipta ol. Mavsum oxiri jonli tirajda sovrinlar o'ynaladi.\n\nMening havolam bilan kirsang — ikkalamizga ham ball tushadi 🤝`
        : "🎁 BirJoy O'yinlar Mavsumi — taksida yur, ball yig', jonli tirajda sovrin yut. Mening havolam bilan kirsang, ikkalamizga ham ball tushadi 🤝");
      shareLink(r.link, text);
    } catch {
      showToast("Havolani ochib bo'lmadi — birozdan keyin urinib ko'ring");
    }
  }, [showToast, vitrina]);

  const tapPrize = useCallback((p: OyinPrizeView) => {
    haptic();
    if (p.soldOut) { showToast("😔 Bu sovrin uchun o'rinlar tugadi — boshqasini tanlang"); return; }
    if ((state?.ball ?? 0) < p.price) { showToast(`⚡ Yana ${p.price - (state?.ball ?? 0)} ball kerak — do'st chaqir!`); return; }
    setBuyKey(p.key);
    setSheet("buy");
  }, [state, showToast]);

  const confirmBuy = useCallback(async () => {
    if (!buyKey || busy) return;
    setBusy(true);
    try {
      const r = await api.oyinBuyTicket(buyKey);
      const prize = vitrina?.prizes.find((p) => p.key === buyKey) ?? null;
      setSheet(null);
      if (r.ok && r.ticketNo != null && prize) {
        haptic();
        setCelebrate({ prize, ticketNo: r.ticketNo });
        loadHome();
      } else {
        showToast(
          r.reason === "sold_out" ? "😔 Bu sovrin uchun o'rinlar tugadi"
            : r.reason === "off" ? "O'yin hali yopiq"
            : r.reason === "season_off" ? "📅 Mavsum hozir faol emas — chipta olish yopiq"
            : "⚡ Ball yetarli emas",
        );
      }
    } catch {
      setSheet(null);
      showToast("Xatolik — qayta urinib ko'ring");
    } finally {
      setBusy(false);
      setBuyKey(null);
    }
  }, [buyKey, busy, vitrina, loadHome, showToast]);

  // 🤝 Rahmat: tugma DARHOL "✓ Aytildi" ga o'tadi (<100ms javob qoidasi), server rad etsa qaytadi.
  const sayThanks = useCallback(async (friendMemberId: number) => {
    haptic();
    setThanked((s) => new Set(s).add(friendMemberId));
    try {
      const r = await api.oyinThanks(friendMemberId);
      if (r.ok) { showToast("🤝 Rahmatingiz yuborildi!"); return; }
      if (r.reason === "already") { showToast("Bugun allaqachon rahmat aytdingiz"); return; }
      setThanked((s) => { const n = new Set(s); n.delete(friendMemberId); return n; });
      showToast(r.reason === "unreachable" ? "Xabar yetib bormadi — do'stingiz botni bloklagan bo'lishi mumkin" : "Yuborib bo'lmadi");
    } catch {
      setThanked((s) => { const n = new Set(s); n.delete(friendMemberId); return n; });
      showToast("Xatolik — qayta urinib ko'ring");
    }
  }, [showToast]);

  const doShareBonus = useCallback(async () => {
    try {
      const r = await api.oyinShare();
      showToast(r.ok ? "📤 Rahmat! +ball qo'shildi" : "Bugun allaqachon ulashdingiz");
    } catch {
      showToast("Xatolik — qayta urinib ko'ring");
    }
  }, [showToast]);

  const finishOnboard = useCallback(() => {
    setOnboard(null);
    try { localStorage.setItem(OB_SEEN_KEY, "1"); } catch { /* xotira yopiq — muhim emas */ }
  }, []);

  // ── 1) SKELETON ──
  if (loadState === "loading") {
    return (
      <div className="oyk">
        <div className="oyk-skel">
          <div className="oyk-skel-block oyk-skel-head" />
          <div className="oyk-skel-block oyk-skel-hero" />
          <div className="oyk-skel-block oyk-skel-daily" />
          <div className="oyk-skel-rail-row">
            {[0, 1, 2].map((i) => <div key={i} className="oyk-skel-block oyk-skel-rail-card" />)}
          </div>
        </div>
      </div>
    );
  }
  // ── 2) XATO ──
  if (loadState === "error" || !state || !vitrina) {
    return (
      <div className="oyk">
        <div className="oyk-error">
          <div className="oyk-error-icon">🎮</div>
          <div className="oyk-error-text">O'yin ma'lumotlarini yuklab bo'lmadi. Internetni tekshirib qayta urinib ko'ring.</div>
          <button type="button" className="oyk-error-retry" onClick={() => { setLoadState("loading"); loadHome(); }}>🔄 Qayta urinish</button>
        </div>
      </div>
    );
  }

  const phase = screenPhase(state.season);
  const seasonName = state.season.label ? `BirJoy O'yinlar Mavsumi · ${state.season.label}` : "BirJoy O'yinlar Mavsumi";

  // ── 3a) MAVSUM SOZLANMAGAN / HALI BOSHLANMAGAN ──
  if (phase === "unset" || phase === "upcoming") {
    const start = countdownTo(state.season.startIso);
    return (
      <div className="oyk">
        <div className="oyk-ended">
          <div className="oyk-ended-icon">{phase === "unset" ? "🎮" : "🚀"}</div>
          <div className="oyk-ended-title">{phase === "unset" ? "Mavsum tez orada" : "Mavsum boshlanmoqda"}</div>
          {phase === "upcoming" && (
            <div className="oyk-ended-card">
              <div className="oyk-ended-row"><span>Boshlanishiga</span><b>{start.d > 0 ? `${start.d} kun` : `${pad(start.h)}:${pad(start.m)}`}</b></div>
            </div>
          )}
          <div className="oyk-ended-note">
            Safar qiling, do'st chaqiring — mavsum boshlanishi bilan har harakat <b>ball</b> olib keladi.
            Ball chiptaga aylanadi, chipta esa oy oxiridagi <b>jonli tirajga</b>. 🎁
          </div>
        </div>
      </div>
    );
  }

  // ── 3b) MAVSUM YAKUNI ──
  if (phase === "ended") {
    const estTanga = Math.min(500, Math.floor(state.ball * 0.5));
    return (
      <div className="oyk">
        <div className="oyk-ended">
          <div className="oyk-ended-icon">🏁</div>
          <div className="oyk-ended-title">Mavsum yakunlandi</div>
          <div className="oyk-ended-card">
            <div className="oyk-ended-row"><span>Yakuniy balling</span><b>{state.ball}</b></div>
            {state.rank && <div className="oyk-ended-row"><span>Reytingdagi o'rning</span><b>{state.rank}-o'rin</b></div>}
            {estTanga > 0 && <div className="oyk-ended-row"><span>Qoldiq → tanga</span><b>+{estTanga} tanga</b></div>}
          </div>
          <div className="oyk-ended-note">G'oliblar tez orada Telegram kanalida e'lon qilinadi. Keyingi mavsumni kuting! 🎮</div>
        </div>
      </div>
    );
  }

  const isNew = state.ball === 0 && state.rank === null;
  const cheapest = [...vitrina.prizes].sort((a, b) => a.price - b.price)[0] ?? null;
  const nearMiss = cheapest ? state.ball >= cheapest.price : false;
  const cd = countdownTo(state.season.endIso);
  const buyPrize = vitrina.prizes.find((p) => p.key === buyKey) ?? null;
  const activeFriend = jamoam?.friends.find((f) => f.status === "active_today" && f.gainToday > 0) ?? null;

  return (
    <div className="oyk">
      <div className="oyk-scroll">
        <div className="oyk-head">
          <div className="oyk-title">🎮 {seasonName}</div>
          <div className="oyk-chips">
            <div className={`oyk-chip-cd${phase === "final48" ? " is-final" : ""}`}>⏳ {cd.d} kun {pad(cd.h)}:{pad(cd.m)}</div>
            <button type="button" className="oyk-chip-rank" onClick={openBoard}>🏅 {state.rank ? `${state.rank}-o'rin` : "Reyting"}</button>
          </div>
        </div>

        {phase === "final48" && (
          <div className="oyk-final-banner">⏰ <b>Final-48 soat!</b> Chipta olish tez orada yopiladi — tikilmagan ball qoldirmang.</div>
        )}

        {tab === "home" && (
          <>
            {isNew ? (
              <div className="oyk-hero is-new">
                <div className="oyk-hero-glow" />
                <div className="oyk-hero-label">XUSH KELIBSIZ</div>
                <div className="oyk-hero-new-title">🎮 O'yinlar mavsumiga qo'shildingiz!</div>
                <div className="oyk-hero-new-sub">Birinchi safaringiz — <b>+{state.hints.rideBall > 0 ? "80" : ""} ball</b>. Do'st chaqirsangiz — ikkalangizga ham ball tushadi.</div>
              </div>
            ) : (
              <div className="oyk-hero">
                <div className="oyk-hero-glow" />
                <div className="oyk-hero-label">SENING XAZINANG</div>
                <div className="oyk-hero-row">
                  <div className="oyk-hero-num">{state.ball}</div>
                  <div className="oyk-hero-unit">ball 🪙</div>
                </div>
                {cheapest && (
                  <div className="oyk-hero-progress">
                    <div className="oyk-bar">
                      <div className="oyk-bar-fill" style={{ width: `${Math.min(100, (state.ball / cheapest.price) * 100).toFixed(1)}%` }} />
                    </div>
                    <div className="oyk-bar-meta">
                      <span className={`oyk-bar-left${nearMiss ? " is-ready" : ""}`}>
                        {nearMiss ? "🎟 Ball yetdi — chiptani ol!" : fastPath(cheapest.price - state.ball, state.hints.referComboBall, state.hints.rideBall)}
                      </span>
                      <span className="oyk-bar-right">{cheapest.price} = 🎟</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {(() => {
              // 🎯 Bugungi maqsad — prototipdagi halqa, endi REAL ma'lumot bilan (state.today).
              const inviteDone = state.today.shared || state.today.referJoined;
              const tasks = [
                { done: state.today.login, label: "Ilovaga kirish", gain: state.hints.loginBall, tap: null },
                { done: state.today.rides > 0, label: "1 safar qilish", gain: state.hints.rideBall, tap: null },
                { done: inviteDone, label: "Do'st chaqirish", gain: state.hints.referJoinBall, tap: () => void inviteFriend() },
              ] as const;
              const doneCount = tasks.filter((t) => t.done).length;
              const R = 26;
              const C = 2 * Math.PI * R;
              return (
                <div className="oyk-daily">
                  <div className="oyk-daily-ring">
                    <svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">
                      <circle cx="32" cy="32" r={R} fill="none" stroke="rgba(255,255,255,.09)" strokeWidth="6" />
                      <circle
                        cx="32" cy="32" r={R} fill="none" stroke="var(--oyk-violet)" strokeWidth="6" strokeLinecap="round"
                        strokeDasharray={C} strokeDashoffset={C * (1 - doneCount / tasks.length)}
                        transform="rotate(-90 32 32)" style={{ transition: "stroke-dashoffset .6s ease" }}
                      />
                    </svg>
                    <div className="oyk-daily-ring-num">{doneCount}/{tasks.length}</div>
                  </div>
                  <div className="oyk-daily-body">
                    <div className="oyk-daily-title">🎯 Bugungi maqsad</div>
                    {tasks.map((t) => (
                      <button
                        key={t.label} type="button" disabled={t.done || !t.tap}
                        className={`oyk-daily-row${t.done ? " is-done" : ""}${!t.done && t.tap ? " is-tappable" : ""}`}
                        onClick={t.tap ?? undefined}
                      >
                        <span className="oyk-daily-check">{t.done ? "✔" : ""}</span>
                        <span className="oyk-daily-label">{t.label}</span>
                        <span className="oyk-daily-gain">{t.done ? `✓ +${t.gain}` : `+${t.gain}`}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* 🔥 Haftalik vazifa — zanjir (prototipdagi blok). Ma'lumot: kunlik kirish ro'yxati. */}
            {state.week.bonusBall > 0 && (
              <div className={`oyk-streak${state.week.done ? " is-done" : ""}`}>
                <span className="oyk-streak-emoji">{state.week.done ? "✅" : "🔥"}</span>
                <span className="oyk-streak-text">
                  Haftalik vazifa: <b>{state.week.target} kunlik zanjir</b> — {state.week.streak}/{state.week.target}
                </span>
                <span className="oyk-streak-gain">+{state.week.bonusBall}</span>
              </div>
            )}

            {state.live && (
              <div className="oyk-live">
                <span className="oyk-live-dot" />
                <span className="oyk-live-tag">JONLI</span>
                <span className="oyk-live-text">🥇 {state.live.name} do'st chaqirdi — <b>+{state.live.ball} ball</b></span>
              </div>
            )}

            {activeFriend && (
              <div className="oyk-magnet">
                <div className="oyk-magnet-emoji">🔥</div>
                <div className="oyk-magnet-body">
                  <div className="oyk-magnet-title">{activeFriend.name} bugun {activeFriend.ridesToday > 1 ? `${activeFriend.ridesToday}-safarini` : "safarini"} qildi!</div>
                  <div className="oyk-magnet-sub">Senga bugun <b>+{activeFriend.gainToday} ball</b> olib keldi</div>
                </div>
                <button
                  type="button"
                  className={`oyk-thanks${thanked.has(activeFriend.memberId) ? " is-done" : ""}`}
                  disabled={thanked.has(activeFriend.memberId)}
                  onClick={() => void sayThanks(activeFriend.memberId)}
                >{thanked.has(activeFriend.memberId) ? "✓ Aytildi" : "🤝 Rahmat ayt"}</button>
              </div>
            )}

            <div>
              <div className="oyk-rail-head">
                <div className="oyk-rail-title">🎁 Sovrin vitrinasi</div>
                <div className="oyk-rail-sub">{vitrina.prizes.reduce((s, p) => s + p.limit, 0)} chipta-o'rin</div>
              </div>
              <div className="oyk-rail">
                {vitrina.prizes.map((p) => {
                  const affordable = phase !== "final48" ? state.ball >= p.price : false;
                  const hot = affordable && p.mine === 0 && !p.soldOut;
                  return (
                    <div key={p.key} className={`oyk-pcard${hot ? " is-hot" : ""}${p.soldOut ? " is-soldout" : ""}`}>
                      <div className="oyk-pcard-icon">{p.photoUrl ? <img src={p.photoUrl} alt="" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).replaceWith(document.createTextNode(p.icon)); }} /> : p.icon}</div>
                      <div className="oyk-pcard-name">{p.name}</div>
                      <div className="oyk-pcard-meta">
                        {p.soldOut ? "Tugadi" : p.mine > 0 ? `Sizniki: ${p.mine} · ${p.chancePct != null ? `≈${p.chancePct}%` : ""}` : `${p.price} ball · ${p.remaining} o'rin qoldi`}
                      </div>
                      <div className="oyk-pbar">
                        <div className="oyk-pbar-fill" style={{ width: `${Math.min(100, Math.round((state.ball / p.price) * 100))}%` }} />
                      </div>
                      <button
                        type="button"
                        className={`oyk-pbtn${affordable && !p.soldOut ? " is-on" : ""}${hot ? " is-hot" : ""}${p.soldOut ? " is-soldout" : phase === "final48" ? " is-frozen" : ""}`}
                        onClick={() => tapPrize(p)}
                      >
                        {p.soldOut ? "Tugadi" : phase === "final48" ? "Muzlagan" : p.mine > 0 ? "🎟 Yana ol" : affordable ? "🎟 Chipta ol!" : `${p.price - state.ball} qoldi`}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <button type="button" className="oyk-cta" onClick={() => void inviteFriend()}>
              <span className="oyk-cta-label">👥 Do'st chaqir — u yursa senga ham ball tushadi</span>
              <span className="oyk-cta-shine" />
            </button>
          </>
        )}

        {tab === "vitrina" && (
          <>
            <div className="oyk-v-head">
              <div className="oyk-v-title">🎁 Sovrin vitrinasi</div>
              <div className="oyk-rail-sub">{vitrina.prizes.reduce((s, p) => s + p.limit, 0)} chipta-o'rin</div>
            </div>
            <div className="oyk-sponsor-strip">
              <div className="oyk-sponsor-logo">{vitrina.sponsor.name[0] ?? "B"}</div>
              <div className="oyk-sponsor-strip-text">Sovrinlar homiysi — <b>{vitrina.sponsor.name}</b></div>
            </div>
            {vitrina.prizes.map((p) => {
              const affordable = phase !== "final48" ? state.ball >= p.price : false;
              return (
                <div key={p.key} className={`oyk-vcard${p.soldOut ? " is-soldout" : ""}`}>
                  {p.photoUrl && (
                    <div className="oyk-vcard-photo">
                      <img src={p.photoUrl} alt="" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).parentElement?.remove(); }} />
                      <div className="oyk-vcard-photo-fade" />
                      <div className="oyk-vcard-photo-name">{p.name}</div>
                      <div className="oyk-vcard-photo-price">{p.price} <small>ball</small></div>
                    </div>
                  )}
                  <div className="oyk-vcard-top">
                    {!p.photoUrl && <div className="oyk-vcard-icon">{p.icon}</div>}
                    <div className="oyk-vcard-title">
                      {!p.photoUrl && <div className="oyk-vcard-name">{p.name}</div>}
                      <div className="oyk-vcard-sub">{p.valueLabel} · {p.limit} dona</div>
                    </div>
                    {!p.photoUrl && (
                      <div className="oyk-vcard-price">
                        <div className="oyk-vcard-price-num">{p.price}</div>
                        <div className="oyk-vcard-price-unit">ball</div>
                      </div>
                    )}
                  </div>
                  <div className="oyk-vbar">
                    <div className="oyk-vbar-fill" style={{ width: `${Math.min(100, Math.round((state.ball / p.price) * 100))}%` }} />
                  </div>
                  <div className="oyk-vcard-stats">
                    <span>🎟 {p.sold} chipta sotilgan · {p.remaining} o'rin qoldi</span>
                    <span>Imkoning: <b>{p.mine > 0 && p.chancePct != null ? `≈${p.chancePct}%` : "Chipta olsang imkoning paydo bo'ladi"}</b></span>
                  </div>
                  <div className="oyk-vcard-path">💡 {p.mine > 0 ? "Yana chipta olib imkoniyatni oshir!" : fastPath(p.price - state.ball, state.hints.referComboBall, state.hints.rideBall)}</div>
                  <button
                    type="button"
                    className={`oyk-vbtn${affordable && !p.soldOut ? " is-on" : ""}${p.soldOut ? " is-soldout" : phase === "final48" ? " is-frozen" : ""}`}
                    onClick={() => tapPrize(p)}
                  >
                    {p.soldOut ? "❌ Bu oy yakunlandi" : phase === "final48" ? "Tikish muzlagan" : p.mine > 0 ? `🎟 Yana ol — ${p.price} ball` : affordable ? `🎟 Chipta ol — ${p.price} ball` : `${p.price - state.ball} ball qoldi`}
                  </button>
                </div>
              );
            })}
            <div className="oyk-sched">
              <span className="oyk-sched-emoji">📅</span>
              <div className="oyk-sched-text"><b>Final-48 soatda:</b> chipta olish yopiladi<br /><b>Mavsum oxirida:</b> JONLI TIRAJ — Telegram efirida 🔴</div>
            </div>
          </>
        )}

        {tab === "jamoam" && (
          <>
            <div className="oyk-j-title">👥 Jamoam <span className="oyk-j-count">({jamoam?.friends.length ?? "…"})</span></div>
            {!jamoam ? (
              <div className="oyk-skel-block oyk-skel-daily" />
            ) : jamoam.friends.length === 0 ? (
              <div className="oyk-j-report">Hali hech kimni taklif qilmagansiz. Do'st chaqirsangiz, shu yerda ular bilan bog'liq voqealarni ko'rasiz.</div>
            ) : (
              <div className="oyk-friends">
                {jamoam.friends.map((f) => (
                  <div key={f.name + f.status} className="oyk-friend">
                    <div className="oyk-avatar oyk-av-0">{f.name[0] ?? "?"}</div>
                    <div className="oyk-friend-body">
                      <div className="oyk-friend-name">{f.name}</div>
                      <div className={`oyk-friend-status${f.status === "active_today" ? " is-active" : ""}`}>
                        {f.status === "active_today" ? "✅ bugun yurdi — faol" : f.status === "never_rode" ? "hali safar qilmadi" : `💤 ${f.daysSilent} kun jim`}
                      </div>
                    </div>
                    {f.status === "silent" && f.daysSilent >= 5 && (
                      <button type="button" className="oyk-wake" onClick={() => void inviteFriend(`${f.name}, yur birga — menga ball, senga sovg'a 🎁`)}>⏰ Uyg'ot</button>
                    )}
                    {f.status === "active_today" && (
                      <button
                        type="button"
                        className={`oyk-thanks${thanked.has(f.memberId) ? " is-done" : ""}`}
                        disabled={thanked.has(f.memberId)}
                        onClick={() => void sayThanks(f.memberId)}
                      >{thanked.has(f.memberId) ? "✓" : "🤝 Rahmat"}</button>
                    )}
                    {f.status === "active_today" && f.gainToday > 0 && <div className="oyk-friend-gain">+{f.gainToday} bugun</div>}
                  </div>
                ))}
              </div>
            )}
            {jamoam && jamoam.friends.length > 0 && (
              <div className="oyk-j-report">
                {jamoam.friends.length} kishi taklif qilding — jami <b>+{jamoam.totalBall} ball</b> keldi. Do'stlaring yurgani sari bu son o'sadi 📈
              </div>
            )}
            <div className="oyk-j-hint">💡 Taksi <b>KO'P chaqiradigan</b> tanishingni chaqir — u senga eng ko'p ball olib keladi</div>
            <div className="oyk-qr">
              <div className="oyk-qr-text">
                {state.rank ? <>Men BirJoy O'yinlar Mavsumida <b>{state.rank}-o'rindaman</b>. Sen nechanchisan? 😉</> : <>Men BirJoy O'yinlar Mavsumidaman — sen ham qo'shil! 🎮</>}
              </div>
              <button type="button" className="oyk-qr-btn" onClick={() => void inviteFriend()}>👥 Do'stimga yubor</button>
              <button
                type="button" className="oyk-wake"
                onClick={async () => { const r = await api.referral().catch(() => null); if (r) { await copyText(r.link); showToast("🔗 Havola nusxalandi!"); } }}
              >🔗 Havolani nusxalash</button>
              <div className="oyk-qr-note">Sovrinni ulashsang — <b>ball qo'shiladi</b> (kuniga bir marta)</div>
            </div>
            <button type="button" className="oyk-cta" onClick={() => void doShareBonus()}>
              <span className="oyk-cta-label">📤 Sovrinni ulashish (bugungi bonus)</span>
              <span className="oyk-cta-shine" />
            </button>
          </>
        )}

        <div className="oyk-sponsor">
          <div className="oyk-sponsor-logo">{vitrina.sponsor.name[0] ?? "B"}</div>
          <div className="oyk-sponsor-text">Mavsum homiysi — <b>{vitrina.sponsor.name}</b></div>
        </div>
        <div className="oyk-legal">Chipta — ishtirok, g'alaba emas. Tiraj mavsum oxirida jonli efirda.</div>
      </div>

      <div className="oyk-tabs">
        {([["home", "🎮", "O'yin"], ["vitrina", "🎁", "Sovrinlar"], ["jamoam", "👥", "Jamoam"]] as const).map(([key, icon, label]) => (
          <button key={key} type="button" className={`oyk-tab${tab === key ? " is-active" : ""}`} onClick={() => { haptic(); setTab(key); }}>
            <span className="oyk-tab-icon">{icon}</span>
            <span className="oyk-tab-label">{label}</span>
          </button>
        ))}
      </div>

      {toast && <div className="oyk-toast">{toast}</div>}

      {sheet && (
        <div className="oyk-scrim" onClick={() => { setSheet(null); setBuyKey(null); }}>
          <div className="oyk-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="oyk-sheet-grip" />

            {sheet === "board" && (
              <>
                <div className="oyk-sheet-title">🏅 Oylik reyting</div>
                {!board ? (
                  <div className="oyk-skel-block oyk-skel-daily" />
                ) : board.rows.length === 0 ? (
                  <div className="oyk-note-violet">Hali hech kim ball to'plamadi — birinchi bo'ling! 🚀</div>
                ) : (
                  <div className="oyk-board">
                    {board.rows.map((b) => (
                      <div key={`${b.pos}-${b.name}`} className={`oyk-brow${b.me ? " is-me" : ""}${b.pos <= 3 ? " is-top" : ""}`}>
                        <div className="oyk-brow-pos">{b.pos}</div>
                        <div className="oyk-brow-name">{b.name}</div>
                        <div className="oyk-brow-pts">{b.ball}</div>
                      </div>
                    ))}
                    {board.myPos && board.myPos > board.rows.length && (
                      <div className="oyk-brow is-me"><div className="oyk-brow-pos">{board.myPos}</div><div className="oyk-brow-name">SEN</div><div className="oyk-brow-pts">{state.ball}</div></div>
                    )}
                  </div>
                )}
              </>
            )}

            {sheet === "buy" && buyPrize && (
              <>
                <div className="oyk-sheet-title">🎟 Chipta olasanmi?</div>
                <div className="oyk-buy-row">
                  <div className="oyk-buy-icon">{buyPrize.photoUrl ? <img src={buyPrize.photoUrl} alt="" onError={(e) => { (e.target as HTMLImageElement).replaceWith(document.createTextNode(buyPrize.icon)); }} /> : buyPrize.icon}</div>
                  <div className="oyk-buy-body">
                    <div className="oyk-buy-name">{buyPrize.name}</div>
                    <div className="oyk-buy-price">{buyPrize.price} ball yechiladi · qaytarilmaydi</div>
                  </div>
                </div>
                <div className="oyk-buy-note">Chipta — ishtirok, g'alaba emas</div>
                <div className="oyk-buy-actions">
                  <button type="button" className="oyk-buy-confirm" disabled={busy} onClick={() => void confirmBuy()}>{busy ? "…" : `Tasdiqlash — ${buyPrize.price} ball`}</button>
                  <button type="button" className="oyk-buy-cancel" onClick={() => { setSheet(null); setBuyKey(null); }}>Bekor</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {celebrate && (
        <div className="oyk-celebrate">
          <div className="oyk-ticket">
            <div className="oyk-ticket-emoji">{celebrate.prize.photoUrl ? <img src={celebrate.prize.photoUrl} alt="" onError={(e) => { (e.target as HTMLImageElement).replaceWith(document.createTextNode(celebrate.prize.icon)); }} /> : celebrate.prize.icon}</div>
            <div className="oyk-ticket-no">CHIPTA №{String(celebrate.ticketNo).padStart(4, "0")}</div>
            <div className="oyk-ticket-name">{celebrate.prize.name}</div>
            <div className="oyk-ticket-sub">Tirajda qatnashasan — mavsum oxiri jonli efir!</div>
          </div>
          <div className="oyk-celebrate-wish">Omading ochilsin! 🍀</div>
          <button type="button" className="oyk-celebrate-btn" onClick={() => setCelebrate(null)}>Zo'r! 🎉</button>
        </div>
      )}

      {onboard !== null && OB_SLIDES[onboard] && (
        <div className="oyk-onboard">
          <div className="oyk-ob-icon">{OB_SLIDES[onboard].icon}</div>
          <div className="oyk-ob-step">{onboard + 1} / {OB_SLIDES.length} QADAM</div>
          <div className="oyk-ob-text">{OB_SLIDES[onboard].text}</div>
          <div className="oyk-ob-dots">
            {OB_SLIDES.map((s, i) => <div key={s.icon} className={`oyk-ob-dot${i === onboard ? " is-active" : ""}`} />)}
          </div>
          <button
            type="button" className="oyk-ob-next"
            onClick={() => (onboard >= OB_SLIDES.length - 1 ? finishOnboard() : setOnboard(onboard + 1))}
          >{onboard === OB_SLIDES.length - 1 ? "Boshladik! 🚀" : "Keyingisi"}</button>
          <button type="button" className="oyk-ob-skip" onClick={finishOnboard}>O'tkazib yuborish</button>
        </div>
      )}
    </div>
  );
}
