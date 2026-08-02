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
import { SEASON_END_ISO, type OyinBoardResponse, type OyinJamoamResponse, type OyinPrizeView, type OyinStateResponse, type OyinVitrinaResponse } from "@t1067/shared";
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
function seasonPhase(): "active" | "final48" | "ended" {
  const end = Date.parse(SEASON_END_ISO);
  const left = end - Date.now();
  if (left <= 0) return "ended";
  if (left <= FINAL_WARN_MS) return "final48";
  return "active";
}
function countdown(): { d: number; h: number; m: number; totalMs: number } {
  const left = Math.max(0, Date.parse(SEASON_END_ISO) - Date.now());
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
  const [tab, setTab] = useState<OyinTab>("home");
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [buyKey, setBuyKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [celebrate, setCelebrate] = useState<{ prize: OyinPrizeView; ticketNo: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
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
  useEffect(() => {
    if (tab === "jamoam" && !jamoam) api.oyinJamoam().then(setJamoam).catch(() => setJamoam({ friends: [], totalBall: 0 }));
  }, [tab, jamoam]);

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

  const inviteFriend = useCallback(async (nudge?: string) => {
    haptic();
    try {
      const r = await api.referral();
      shareLink(r.link, nudge ?? "🎮 Koson O'yiniga qo'shil! Safar qil, ball yig', oy oxiri jonli tirajda real sovrin yut. Mening havolam bilan kirsang — ikkalamizga ham ball! 🚀");
    } catch {
      showToast("Havolani ochib bo'lmadi — birozdan keyin urinib ko'ring");
    }
  }, [showToast]);

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
        showToast(r.reason === "sold_out" ? "😔 Bu sovrin uchun o'rinlar tugadi" : r.reason === "off" ? "O'yin hali yopiq" : "⚡ Ball yetarli emas");
      }
    } catch {
      setSheet(null);
      showToast("Xatolik — qayta urinib ko'ring");
    } finally {
      setBusy(false);
      setBuyKey(null);
    }
  }, [buyKey, busy, vitrina, loadHome, showToast]);

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
          <div className="oyk-skel-block oyk-skel-hero" />
          <div className="oyk-skel-block oyk-skel-daily" />
          <div className="oyk-skel-block oyk-skel-rail" />
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

  const phase = seasonPhase();
  // ── 3) MAVSUM YAKUNI ──
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
  const cd = countdown();
  const buyPrize = vitrina.prizes.find((p) => p.key === buyKey) ?? null;
  const activeFriend = jamoam?.friends.find((f) => f.status === "active_today" && f.gainToday > 0) ?? null;

  return (
    <div className="oyk">
      <div className="oyk-scroll">
        <div className="oyk-head">
          <div className="oyk-title">🎮 Koson O'yini</div>
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
                <div className="oyk-hero-new-title">🎮 Koson O'yiniga qo'shildingiz!</div>
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

            {activeFriend && (
              <div className="oyk-magnet">
                <div className="oyk-magnet-emoji">🔥</div>
                <div className="oyk-magnet-body">
                  <div className="oyk-magnet-title">{activeFriend.name} bugun safar qildi!</div>
                  <div className="oyk-magnet-sub">Senga bugun <b>+{activeFriend.gainToday} ball</b> olib keldi — unga rahmat de 🤝</div>
                </div>
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
                  <div className="oyk-vcard-top">
                    <div className="oyk-vcard-icon">{p.photoUrl ? <img src={p.photoUrl} alt="" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).replaceWith(document.createTextNode(p.icon)); }} /> : p.icon}</div>
                    <div className="oyk-vcard-title">
                      <div className="oyk-vcard-name">{p.name}</div>
                      <div className="oyk-vcard-sub">{p.valueLabel} · {p.limit} dona</div>
                    </div>
                    <div className="oyk-vcard-price">
                      <div className="oyk-vcard-price-num">{p.price}</div>
                      <div className="oyk-vcard-price-unit">ball</div>
                    </div>
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
                {state.rank ? <>Men Koson O'yinida <b>{state.rank}-o'rindaman</b>. Sen nechanchisan? 😉</> : <>Men Koson O'yiniga qo'shildim — sen ham qo'shil! 🎮</>}
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
