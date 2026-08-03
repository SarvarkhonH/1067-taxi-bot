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
import { OYIN_FINAL_LOCK_MS, type OyinActivityResponse, type OyinJamoamResponse, type OyinMyTicketsResponse, type OyinPrizeView, type OyinSeasonClientView, type OyinStateResponse, type OyinVitrinaResponse } from "@t1067/shared";
import { api, apiUrl } from "./api";
import { addToHomeScreen, copyText, haptic, homeScreenStatus, inviteLandingUrl, onHomeScreenAdded, shareLink } from "./telegram";
import "./design/feat/oyk.css"; // bu ekran ochilgandagina yuklanadi (kritik yo'lda emas)

// ⚠️ Raqamlar KNOBDAN. Avval "+30 ball" qotirilgan edi — ega knobni o'zgartirsa ilovaning
// BIRINCHI ekrani yolg'on aytardi (DIZAYN_QOIDALARI #9).
function obSlides(h: OyinStateResponse["hints"]): { icon: string; text: string }[] {
  return [
    { icon: "🚕", text: `Safar qil — har safarga +${h.rideBall} ball` },
    { icon: "🤝", text: `Do'st chaqir — u raqam ulasa +${h.referJoinBall}, birinchi safarini qilsa +${h.referFirstRideBall}` },
    { icon: "🎟", text: "Ball yig'ilgach chiptaga almashtirasan — chipta tirajda qatnashish huquqi" },
    { icon: "🎁", text: "Oy oxiri — jonli tiraj. Real sovrinlar!" },
  ];
}
const OB_SEEN_KEY = "oyk_onboard_seen";
const START_TAB_KEY = "oyk_start_tab"; // uy-hero'dagi "Sovrinlarni ko'rish" shu orqali vitrina'ga ochadi
// Qulf oynasi SERVER bilan BITTA manbadan. Avval mustaqil `48 * 3600_000` turardi: ega
// oynani o'zgartirsa ekran va server ayri ketardi (ekran "yopiq" der, server sotardi).
const FINAL_WARN_MS = OYIN_FINAL_LOCK_MS;

// ⚠️ `toLocaleDateString("uz-UZ", …)` ba'zi klientlarda "M08 14" qaytaradi (lokal ma'lumot yo'q).
// Sana mijozga ko'rinadigan joyda — taxmin qilib bo'lmaydi, shuning uchun o'zimiz yozamiz.
const UZ_OYLAR = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
export function uzDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return `${d.getDate()}-${UZ_OYLAR[d.getMonth()] ?? ""}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
// ⚠️ `referCombo` = do'st ulandi + birinchi safari (masalan 40+120=160). Ekranning boshqa
// joyida do'st "+40" deb ko'rsatilardi va ikkalasi bir-biriga zid chiqardi — endi "Ball qanday
// yig'iladi" varag'ida uchala do'st-bali ham alohida yozilgan, ya'ni ziddiyat yo'q.
function fastPath(remaining: number, referCombo: number, rideBall: number): string {
  if (remaining <= 0) return "Ball yetdi — chiptani oling!";
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

/** Ball jadvali — YAKUNIY DIZAYN §4: varaqda YASHIRILMAYDI, ekranning o'zida turadi.
 *  "Nima qilsam ball ko'payadi?" — o'yindagi eng muhim savol; javob bir bosish ortida
 *  turgani sari odam uni umuman ko'rmasdi. Raqamlar knoblardan keladi, qotirilmagan. */
type BallRow = { ic: string; label: string; ball: number; note: string };
function ballRows(h: OyinStateResponse["hints"]): BallRow[] {
  return ([
    ["📸", "Hikoya joylash", h.storyBall, "admin tasdig'idan keyin"],
    ["🎉", "Do'stingiz BIRINCHI safarini qildi", h.referFirstRideBall, "har do'st uchun bir marta"],
    ["🥇", "Birinchi safaring", h.firstRideBall, "mavsumda bir marta"],
    ["🔥", "3 kun ketma-ket safar", h.streakBall, "har 3 kun ketma-ket yursangiz"],
    ["🤝", "Do'stingizning har safari", h.referRideBall, "cheksiz — u yurgani sari"],
    ["👥", "Do'stingiz raqamini uladi", h.referJoinBall, "har do'st uchun bir marta"],
    ["🚕", "O'z safaringiz", h.rideBall, "cheksiz"],
    ["📱", "Telefon tasdiqlash", h.phoneBall, "bir marta"],
    ["📤", "Ulashish", h.shareBall, "kuniga bir marta"],
    ["🗓", "Kunlik kirish", h.loginBall, "kuniga bir marta"],
  ] as const)
    .filter(([, , ball]) => ball > 0)
    .sort((a, b) => b[2] - a[2])
    .map(([ic, label, ball, note]) => ({ ic, label, ball, note }));
}

/** Xarid xatolari — HAR BIRI o'z matni bilan. Avval nomlanmagan sabablar (`unknown_prize`,
 *  `final_lock`) "Ball yetarli emas" ga tushardi: balansi to'la mijozga balansi haqida yolg'on
 *  aytilardi va u nima qilishni bilmay qolardi. */
function buyReasonText(reason: string | undefined): string {
  switch (reason) {
    case "sold_out": return "😔 Bu sovrin uchun o'rinlar tugadi";
    case "off": return "O'yin hali yopiq";
    case "season_off": return "📅 Mavsum hozir faol emas — chipta olish yopiq";
    case "final_lock": return "🔒 Chipta olish yopildi — ro'yxat tirajga tayyor. Chiptalaringiz «Chiptalarim» bo'limida";
    case "own_limit": return "⚖️ Bu sovrindan limitga yetdingiz — boshqasini tanlang";
    case "unknown_prize": return "🚫 Bu sovrin ro'yxatdan olib tashlandi — boshqasini tanlang";
    case "staff": return "🚫 Xodim va ega tirajda qatnashmaydi — bu adolat qoidasi";
    case "no_ride": return "🚕 Chipta uchun kamida bitta real safar kerak — avval taksi chaqiring";
    case "insufficient": return "⚡ Ball yetarli emas";
    default: return "Xatolik — qayta urinib ko'ring";
  }
}

/** Qo'ng'iroq ro'yxati uchun yorliqlar — admin jadvalidagi bilan bir xil harakatlar. */
const ACTION_EMOJI: Record<string, string> = {
  ride: "🚕", first_ride: "🥇", phone: "📱", refer_join: "👥", refer_first_ride: "🎉",
  refer_ride: "🤝", daily_login: "🗓", share: "📤", sprint_bonus: "🏁", ticket_buy: "🎟",
  story: "📸", streak: "🔥",
};
/** Do'st ishtirok etgan voqealar — ism EGA bo'lgan shakl ("Amir safar qildi"). */
const FRIEND_LABEL: Record<string, string> = {
  refer_ride: "safar qildi",
  refer_first_ride: "birinchi safarini qildi",
  refer_join: "raqamini uladi",
};
const ACTION_LABEL: Record<string, string> = {
  ride: "Safar qildingiz", first_ride: "Mavsumdagi birinchi safaringiz", phone: "Telefon tasdiqlandi",
  refer_join: "Do'stingiz raqamini uladi", refer_first_ride: "Do'stingiz birinchi safarini qildi",
  refer_ride: "Do'stingiz safar qildi", daily_login: "Ilovaga kirdingiz", share: "Ulashdingiz",
  sprint_bonus: "Haftalik bonus", ticket_buy: "Chipta oldingiz", story: "Hikoyangiz tasdiqlandi",
  streak: "Ketma-ket safar bonusi",
};

type OyinTab = "home" | "vitrina" | "tickets" | "jamoam";
type SheetKind = "buy" | "info" | "how" | "ball" | "bell" | null;
type LoadState = "loading" | "ready" | "error";

export function OyinView({ onTaxi }: { onTaxi?: () => void } = {}) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [state, setState] = useState<OyinStateResponse | null>(null);
  const [vitrina, setVitrina] = useState<OyinVitrinaResponse | null>(null);
  const [jamoam, setJamoam] = useState<OyinJamoamResponse | null>(null);
  // 🔔 Qo'ng'iroq — ball qayerdan kelgani. Reyting OLIB TASHLANDI (ega qarori).
  const [bell, setBell] = useState<OyinActivityResponse | null>(null);
  // 🏠 Doimiy topshiriq — Telegram klienti qo'llab-quvvatlaydimi. `unsupported` bo'lsa
  // topshiriq umuman ko'rsatilmaydi (bajarib bo'lmaydigan vazifa ko'rsatish — bo'sh va'da).
  const [homeSupported, setHomeSupported] = useState<boolean | null>(null);
  const [bellSeen, setBellSeen] = useState<string>(() => { try { return localStorage.getItem("oyk_bell_seen") ?? ""; } catch { return ""; } });
  // Qizil nuqta — oxirgi ko'rilgandan keyin necha voqea qo'shilgani. Ro'yxat ochilmagan
  // bo'lsa (bell === null) nuqta ko'rsatilmaydi: soxta "yangi bor" signali bermaymiz.
  // ⚠️ Avval `bell` FAQAT varaq ochilganda yuklanardi, ya'ni qizil son HECH QACHON
  // ochilmasdan ko'rinmasdi — "yangi xabar bor" signali ishlamasdi. Endi ro'yxat
  // ochilishda yuklanadi (pastdagi `useEffect`), son esa darhol ko'rinadi.
  const bellNew = bell ? bell.rows.filter((r) => r.at > bellSeen).length : 0;
  const [tickets, setTickets] = useState<OyinMyTicketsResponse | null>(null);
  const [tab, setTab] = useState<OyinTab>(() => {
    try {
      const t = localStorage.getItem(START_TAB_KEY);
      if (t) localStorage.removeItem(START_TAB_KEY);
      return t === "vitrina" ? "vitrina" : "home";
    } catch { return "home"; }
  });
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [buyKey, setBuyKey] = useState<string | null>(null);
  const [buyQty, setBuyQty] = useState(1); // 🎟 miqdor (max 3) — YAKUNIY DIZAYN §7 tafsilot ekrani
  const [busy, setBusy] = useState(false); // faqat CHIPTA XARIDI
  // Poster/hikoya alohida flag: avval bitta `busy` uchala operatsiyani band qilardi —
  // sekin tarmoqda chipta olayotgan mijoz Jamoam tabida "⏳ Tayyorlanmoqda…" ni ko'rardi.
  const [posterBusy, setPosterBusy] = useState(false);
  // `ticketNo` — GLOBAL raqam (`gno`). Avval bu yerga sovrin-ichi tartib raqami tushardi va
  // bayramda "№0002", Chiptalarim'da esa "№ 729476" chiqardi — bitta chipta, ikki xil raqam.
  const [celebrate, setCelebrate] = useState<{ prize: OyinPrizeView; ticketNo: number; count: number } | null>(null);
  // Rasm-havolasi buzilgan sovrinlar — React-xavfsiz fallback (DOM'dan `remove()` qilish
  // React boshqaradigan tugunni tashqaridan o'chiradi va keyingi render'da qulashi mumkin;
  // bundan tashqari o'chirilgan blok ichida sovrin NOMI va NARXI ham qolib ketardi).
  const [badPhoto, setBadPhoto] = useState<Set<string>>(new Set());
  const markBadPhoto = useCallback((key: string) => setBadPhoto((s) => (s.has(key) ? s : new Set(s).add(key))), []);
  const [toast, setToast] = useState<string | null>(null);
  const [thanked, setThanked] = useState<Set<number>>(new Set());
  const [posterText, setPosterText] = useState("");
  const [posterName, setPosterName] = useState("");
  const [storyUrl, setStoryUrl] = useState("");
  const [onboard, setOnboard] = useState<number | null>(() => {
    try { return localStorage.getItem(OB_SEEN_KEY) ? null : 0; } catch { return 0; }
  });
  const [, forceTick] = useState(0); // countdown daqiqada bir yangilansin
  const toastT = useRef<ReturnType<typeof setTimeout>>();

  // `soft=true` — QAYTA yuklash (xariddan/maqsaddan keyin). Xato bo'lsa ekran o'chirilmaydi:
  // avval chipta olgan mijoz tarmoq uzilganda bayram-oynasini ham, tab-qatorini ham, chipta
  // raqamini ham yo'qotardi va "yuklab bo'lmadi" ekraniga tushardi — ball to'langan, isbot yo'q.
  const loadHome = useCallback((soft = false) => {
    // Buzuq rasm belgisi tozalanadi: (a) bir marta tarmoq uzilib rasm kelmasa sovrin butun
    // sessiya davomida emoji bo'lib qolardi; (b) admin URL'ni TUZATSA ham yangi rasm
    // ko'rsatilmasdi — belgi URL emas, KALIT bo'yicha eslab qolinardi.
    setBadPhoto(new Set());
    // Jamoam va reyting ham yangilanadi: avval `jamoam` faqat mount'da (butun sessiyada bir
    // marta), `board` esa `if (!board)` bilan bir marta yuklanib QOTIB qolardi — do'st yangi
    // safar qilsa ham, mijoz ballini sarflasa ham eski raqamlar turaverardi.
    setBell(null);
    Promise.all([api.oyinState(), api.oyinVitrina()])
      .then(([s, v]) => { setState(s); setVitrina(v); setLoadState("ready"); })
      .catch(() => { if (!soft) setLoadState("error"); });
  }, []);
  useEffect(() => { loadHome(); }, [loadHome]);
  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);
  // Jamoam BOSH yuklanishdayoq keladi (tab ochilishini kutmaydi) — bosh ekrandagi "rahmat-karta"
  // (oyk-magnet) shu ma'lumotga qaraydi; aks holda u Jamoam tabiga kirmaguncha hech ko'rinmasdi.
  useEffect(() => {
    if (tab === "tickets" && !tickets) api.oyinTickets().then(setTickets).catch(() => setTickets({ tickets: [], drawIso: null }));
  }, [tab, tickets]);
  const loadJamoam = useCallback(() => {
    api.oyinJamoam()
      .then((j) => { setJamoam(j); setThanked(new Set(j.friends.filter((f) => f.thankedToday).map((f) => f.memberId))); })
      .catch(() => setJamoam({ friends: [], totalBall: 0, oneTimeBall: 0, rideBall: 0 }));
  }, []);
  useEffect(() => { loadJamoam(); }, [loadJamoam]);
  // Qo'ng'iroq ro'yxati ochilishda yuklanadi — qizil son varaqni ochmasdan ko'rinsin.
  useEffect(() => { api.oyinBell().then(setBell).catch(() => undefined); }, []);


  // Jamoam tabiga har kirganda yangilanadi — "do'stingiz bugun yurdi" kartasi eskirmasin.
  useEffect(() => { if (tab === "jamoam") loadJamoam(); }, [tab, loadJamoam]);

  const showToast = useCallback((text: string, ms = 2600) => {
    setToast(text);
    clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToast(null), ms);
  }, []);
  useEffect(() => () => clearTimeout(toastT.current), []);

  // 🏠 Ekranga o'rnatish: holatni tekshiramiz va Telegram HODISASIGA obuna bo'lamiz —
  // mijoz tugmani bosgani yetarli emas, faqat haqiqiy qo'shilish tasdiqlanadi.
  useEffect(() => {
    let alive = true;
    void homeScreenStatus().then((st) => {
      if (!alive) return;
      setHomeSupported(st !== "unsupported");
      // Allaqachon qo'shilgan bo'lsa (yoki oldingi mavsumdan qolgan) — serverga bildiramiz.
      if (st === "added") api.oyinHomeScreen(true).then(() => loadHome(true)).catch(() => undefined);
      // O'chirib tashlagan bo'lsa belgi olib tashlanadi (ball saqlanib qolmasin).
      if (st === "missed") api.oyinHomeScreen(false).catch(() => undefined);
    });
    const off = onHomeScreenAdded(() => {
      api.oyinHomeScreen(true).then(() => { showToast("🏠 Ilova ekranga qo'shildi — ball tushdi!"); loadHome(true); }).catch(() => undefined);
    });
    return () => { alive = false; off(); };
  }, [loadHome, showToast]);

  // Chipta endi O'Z TABIGA ega (YAKUNIY DIZAYN §1) — varaq ochilmaydi, tabga o'tiladi.
  // Bitta narsa ikki joyda ochilsa (varaq + tab) qaysi biri "haqiqiy" ekani noaniq bo'ladi.
  const openTickets = useCallback(() => {
    haptic();
    setTab("tickets");
  }, []);

  // 🔔 Qo'ng'iroq — ball qayerdan kelgani. Ochilganda "ko'rildi" belgisi yangilanadi.
  const openBell = useCallback(() => {
    haptic();
    setSheet("bell");
    api.oyinBell().then((r) => {
      setBell(r);
      const newest = r.rows[0]?.at ?? "";
      if (newest) { setBellSeen(newest); try { localStorage.setItem("oyk_bell_seen", newest); } catch { /* xotira yopiq */ } }
    }).catch(() => setBell({ rows: [], total: 0, page: 1, pageSize: 30 }));
  }, []);

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
      // `inviteLandingUrl` — landing sahifa OG-kartasi bilan (rasm + sarlavha). Xom bot
      // havolasi ulashilsa Telegram quruq, rasmsiz preview chizadi.
      shareLink(inviteLandingUrl(r.link), text);
    } catch {
      showToast("Havolani ochib bo'lmadi — birozdan keyin urinib ko'ring");
    }
  }, [showToast, vitrina]);

  const tapPrize = useCallback((p: OyinPrizeView) => {
    haptic();
    if (p.soldOut) { showToast("😔 Bu sovrin uchun o'rinlar tugadi — boshqasini tanlang"); return; }
    // 🔒 Final-48: tugma "Muzlagan" deb yozgan bo'lsa, bosilganda ham MUZLAGAN bo'lishi kerak.
    // Avval bu tekshiruv yo'q edi: yozuv "yopiq" derdi, varaq ochilib xarid o'tib ketardi.
    // Server ham shu qoidani mustaqil qo'llaydi (`final_lock`) — ekran yagona qo'riq emas.
    // `locked` bu yerda QAYTA hisoblanadi (hook'lar erta-return'dan oldin turadi, `phase` esa
    // keyin) — bitta manba: `screenPhase`. Server ham mustaqil to'sadi (`final_lock`).
    const ph = state ? screenPhase(state.season) : "unset";
    if (ph === "final48" || ph === "ended") { showToast("🔒 Chipta olish yopildi — ro'yxat tirajga tayyor. Chiptalaringiz «Chiptalarim» bo'limida"); return; }
    // Limit ekranda yozilgan, lekin tugma baribir varaq ochardi va server rad etardi —
    // "bo'lmaydi / bo'ladi / bo'lmaydi" uch qadamli chalkashlik. Endi darhol aytiladi.
    const maxP = state?.hints.maxPerPrize ?? 3;
    if (p.mine >= maxP) { showToast(`⚖️ Bu sovrindan limitga yetdingiz (${maxP} ta) — boshqasini tanlang`); return; }
    if ((state?.ball ?? 0) < p.price) { showToast(`⚡ Yana ${p.price - (state?.ball ?? 0)} ball kerak — do'st chaqiring!`); return; }
    setBuyQty(1);
    setBuyKey(p.key);
    setSheet("buy");
  }, [state, showToast]);

  const confirmBuy = useCallback(async () => {
    if (!buyKey || busy) return;
    setBusy(true);
    const prize = vitrina?.prizes.find((p) => p.key === buyKey) ?? null;
    // Miqdor (max 3) — server bitta chipta beradi, shuning uchun ketma-ket chaqiramiz.
    // Har chaqiruv o'zi atomik va idempotent; oraliqda tugab qolsa nechtasi olingani AYTILADI
    // (jim "muvaffaqiyat" ko'rsatib qolgan pulni yeb qo'yish — eng yomon xatolardan).
    let got = 0;
    let lastGno: number | null = null;
    let stopReason: string | undefined;
    // ⚠️ Miqdor SHU YERDA ham qisqartiriladi. Varaq `qty` ni (limit/qoldiq/ball bo'yicha
    // qisqartirilgan) ko'rsatadi, lekin xom `buyQty` bilan tsikl qilinsa ular ayri ketadi:
    // mijoz "2" ni ko'rib, tizim 3 marta urinadi va oxirgisi xato bilan qaytadi.
    const want = prize && state
      ? Math.max(1, Math.min(buyQty, state.hints.maxPerPrize - prize.mine, prize.remaining, Math.floor(state.ball / prize.price)))
      : 1;
    try {
      for (let i = 0; i < want; i++) {
        const r = await api.oyinBuyTicket(buyKey);
        if (r.ok && r.gno != null) { got++; lastGno = r.gno; continue; }
        stopReason = r.reason;
        break;
      }
      setSheet(null);
      if (got > 0 && lastGno != null && prize) {
        haptic();
        setCelebrate({ prize, ticketNo: lastGno, count: got });
        // ⚠️ Chiptalar keshini BEKOR qilamiz — aks holda mijoz Chiptalarim tabiga o'tib
        // "Hali chiptangiz yo'q" ni o'qiydi (kesh bir marta yuklanib qotib qolardi).
        setTickets(null);
        loadHome();
        if (stopReason) showToast(`${got} ta olindi. Qolganini olib bo'lmadi: ${buyReasonText(stopReason)}`, 3600);
      } else {
        showToast(buyReasonText(stopReason));
      }
    } catch {
      // ⚠️ Tsikl o'rtasida tarmoq uzilsa `got` ALLAQACHON olingan chiptalar sonini bildiradi.
      // Avval bu qiymat tashlanardi: bayram yo'q, balans eski, Chiptalarim keshi eski —
      // mijoz "hech narsa bo'lmadi" deb qayta bosardi va YANA chipta sotib olardi.
      setSheet(null);
      if (got > 0) { setTickets(null); loadHome(true); showToast(`${got} ta chipta olindi. Aloqa uzildi — qolganini keyin oling.`, 3600); }
      else showToast("Bajarilmadi — internetni tekshirib qayta urinib ko'ring");
    } finally {
      setBusy(false);
      setBuyKey(null);
    }
  }, [buyKey, buyQty, busy, vitrina, state, loadHome, showToast]);

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
      showToast("Rahmat yuborilmadi — birozdan keyin urinib ko'ring");
    }
  }, [showToast]);

  // 📸 Poster: rasm ham, QR ham O'Z domenimizdan olinadi — aks holda canvas "iflos" bo'lib
  // `toBlob` ishlamaydi va poster saqlanmaydi.
  const makePoster = useCallback(async () => {
    if (posterBusy) return;
    setPosterBusy(true);
    try {
      const [{ renderPoster, downloadBlob }, ref] = await Promise.all([
        import("./design/poster"),
        api.referral().catch(() => null),
      ]);
      const top = [...(vitrina?.prizes ?? [])].sort((a, b) => b.price - a.price)[0];
      const code = ref?.link.match(/start=ref_([A-Za-z0-9_-]+)/)?.[1] ?? null;
      const endIso = state?.season.endIso ?? null;
      const drawDate = uzDate(endIso);
      const blob = await renderPoster({
        headline: posterText.trim() || state?.story.texts[0] || "Men ham qatnashyapman",
        name: posterName,
        prizeName: top?.name ?? "Sovrin",
        prizePhotoUrl: top?.photoUrl ? apiUrl(`/api/oyin/prizephoto?key=${encodeURIComponent(top.key)}`) : null,
        prizeIcon: top?.icon ?? "🎁",
        qrUrl: code ? apiUrl(`/api/oyin/qr?code=${encodeURIComponent(code)}`) : null,
        drawDate,
      });
      if (!blob) { showToast("Posterni yasab bo'lmadi"); return; }
      downloadBlob(blob, "birjoy-poster.png");
      showToast("⬇️ Poster yuklandi — endi hikoyangizga qo'ying!", 3400);
    } catch {
      showToast("Posterni yasab bo'lmadi — qayta urinib ko'ring");
    } finally {
      setPosterBusy(false);
    }
  }, [posterBusy, vitrina, state, posterText, posterName, showToast]);

  const submitStory = useCallback(async () => {
    if (posterBusy) return;
    setPosterBusy(true);
    try {
      const r = await api.oyinStory(storyUrl.trim());
      if (r.ok) {
        setStoryUrl("");
        showToast("✅ Yuborildi — 24 soat ichida tekshiramiz", 3400);
        loadHome();
        return;
      }
      showToast(
        r.reason === "bad_url" ? "Havola noto'g'ri — Instagram yoki Telegram havolasini yuboring"
          : r.reason === "pending" ? "Oldingi arizangiz hali tekshiruvda"
          : r.reason === "limit" ? "Bu mavsumda limitga yetdingiz"
          : r.reason === "duplicate" ? "Bu havola allaqachon yuborilgan"
          : r.reason === "season_off" ? "Mavsum hozir faol emas"
          : "Yuborib bo'lmadi",
        3400,
      );
    } catch {
      showToast("Havolani yuborib bo'lmadi — internetni tekshiring");
    } finally {
      setPosterBusy(false);
    }
  }, [posterBusy, storyUrl, showToast, loadHome]);

  // ⚠️ Avval bu tugma HECH NARSA ulashmasdan ball berardi (bepul ball, ulashuv nol).
  // Endi avval Telegram ulashish oynasi ochiladi, ball undan KEYIN beriladi.
  const doShareBonus = useCallback(async () => {
    haptic();
    try {
      const r = await api.referral();
      const topPrize = [...(vitrina?.prizes ?? [])].sort((a, b) => b.price - a.price)[0];
      shareLink(
        inviteLandingUrl(r.link),
        topPrize
          ? `🎁 BirJoy O'yinlar Mavsumi — bosh sovrin: ${topPrize.name}!

Taksida yur, ball yig', chipta ol. Mavsum oxiri jonli tirajda o'ynaladi. Mening havolam bilan kirsang — ikkalamizga ham ball 🤝`
          : "🎁 BirJoy O'yinlar Mavsumi — taksida yur, ball yig', jonli tirajda sovrin yut 🤝",
      );
      const b = await api.oyinShare();
      showToast(b.ok ? "📤 Rahmat! Ball qo'shildi" : "Bugungi ulashish bonusini allaqachon oldingiz — ertaga yana bo'ladi");
    } catch {
      showToast("Ulashish bonusini olib bo'lmadi — qayta urinib ko'ring");
    }
  }, [showToast, vitrina]);

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
    const soon = [...vitrina.prizes].sort((a, b) => b.price - a.price).slice(0, 6);
    return (
      <div className="oyk">
        <div className="oyk-scroll">
          <div className="oyk-soon-top">
            <div className="oyk-ended-icon">{phase === "unset" ? "🎮" : "🚀"}</div>
            <div className="oyk-ended-title">{phase === "unset" ? "Mavsum tez orada" : "Mavsum boshlanmoqda"}</div>
            {/* Sanoq kun/soat/daqiqa bilan (YAKUNIY DIZAYN §7). Faqat "4 kun" — jonsiz;
                soat va daqiqa ko'rinsa boshlanish YAQIN ekani his qilinadi. */}
            {phase === "upcoming" && (
              <div className="oyk-cdown">
                <div className="oyk-cdown-c"><b>{start.d}</b><small>kun</small></div>
                <div className="oyk-cdown-c"><b>{pad(start.h)}</b><small>soat</small></div>
                <div className="oyk-cdown-c"><b>{pad(start.m)}</b><small>daqiqa</small></div>
              </div>
            )}
            {/* ⚠️ Avval bu yerda "safar qiling, do'st chaqiring" deb yozilardi — YOLG'ON edi:
                ball faqat MAVSUM ICHIDAGI harakatlardan yig'iladi, boshlanishdan oldingi
                safar hech narsa bermaydi. Endi matn haqiqatni aytadi. */}
            <div className="oyk-ended-note">
              {phase === "upcoming" && state.season.startIso
                ? <><b>{uzDate(state.season.startIso)}</b> kuni start. Ball o'shandan boshlab yig'iladi —
                  shu kuni birinchi safaringiz darhol <b>+{state.hints.firstRideBall} ball</b> olib keladi. 🎁</>
                : <>Sovrinlar tayyor, sana hali belgilanmagan. Belgilangach shu yerda sanoq boshlanadi. 🎁</>}
            </div>
          </div>

          {/* Sovrinlar HOZIROQ ko'rinadi (§7) — odam nima uchun kutayotganini bilishi kerak.
              Chipta olish yopiq: tugma yo'q, faqat ko'rgazma. */}
          {soon.length > 0 && (
            <div>
              <div className="oyk-rail-head">
                <div className="oyk-rail-title">🎁 Mavsum sovrinlari</div>
                <div className="oyk-rail-sub">{vitrina.prizes.reduce((s, p) => s + p.limit, 0)} ta chipta</div>
              </div>
              <div className="oyk-rail">
                {soon.map((p) => (
                  <div key={p.key} className="oyk-pcard">
                    <div className="oyk-pcard-icon">
                      {p.photoUrl && !badPhoto.has(p.key)
                        ? <img src={p.photoUrl} alt="" loading="lazy" onError={() => markBadPhoto(p.key)} />
                        : p.icon}
                    </div>
                    <div className="oyk-pcard-name">{p.name}</div>
                    <div className="oyk-pcard-meta">{p.price} ball · {p.limit} dona</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button type="button" className="oyk-cta" onClick={() => void inviteFriend()}>
            <span className="oyk-cta-label">👥 Do'stni chaqirib qo'y — start birga bo'lsin</span>
            <span className="oyk-cta-shine" />
          </button>
        </div>
      </div>
    );
  }

  // ⚠️ MAVSUM YAKUNI uchun avval bu yerda ERTA RETURN turardi va butun ekran bitta kartaga
  // almashardi: tab-qatori, Chiptalarim va "?" shundan KEYIN chizilardi, ya'ni chizilmasdi.
  // Natijada 600 ball to'lab chipta olgan odam AYNAN TIRAJ KUNI chiptasini ocha olmasdi —
  // §2 ning butun g'oyasi ("chipta qoladi va yig'iladi") eng kerakli kunida yo'qolardi.
  // Endi qobiq saqlanadi: yakun xulosasi — O'yin tabining kontenti, boshqa tablar tirik.
  const ended = phase === "ended";
  // 🔒 Chipta olish yopiq: final-48 yoki mavsum tugagan. Server ham shu qoidani mustaqil
  // qo'llaydi (`final_lock` / `season_off`) — ekran yolg'iz qo'riq emas.
  const locked = phase === "final48" || ended;

  const isNew = !ended && state.ball === 0 && state.ticketCount === 0;
  // 🎯 Maqsad-sovrin: mijoz tanlagani, tanlamagan bo'lsa eng arzoni. Hero SHUNGA qarab
  // chiziladi — "660 ball qoldi · Choy serviz" mavhum "340 ball" dan ancha kuchli.
  // ⚠️ Sotilib ketgan sovrin maqsad bo'lib qolsa hero abadiy "Ball yetdi — chiptani oling!"
  // deb turardi va bosilganda "o'rinlar tugadi" chiqardi; maqsadni almashtirish yo'li esa
  // o'sha kartada yashiringan edi (sold-out kartada tugma chizilmaydi). Endi tugagan sovrin
  // maqsad sifatida OLINMAYDI — hero avtomatik olinadigan eng arzoniga tushadi.
  const goalPrize = vitrina.prizes.find((p) => p.key === state.goalPrizeKey && !p.soldOut);
  const cheapest =
    goalPrize ??
    [...vitrina.prizes].filter((p) => !p.soldOut).sort((a, b) => a.price - b.price)[0] ??
    [...vitrina.prizes].sort((a, b) => a.price - b.price)[0] ??
    null;
  const nearMiss = cheapest ? state.ball >= cheapest.price : false;

  // 🚦 O'lchangan tanqislik (YAKUNIY DIZAYN §6): tanqislik HAQIQAT bo'lgandagina ko'rsatiladi.
  // ≥50% — rangsiz · 20–50% — kahrabo · <20% — qizil. Sabab: lotereya + qizil bosim mahalliy
  // bozorda "aldov ilova" tuyg'usini beradi; kam ishlatilgan qizilga esa ishonishadi.
  const leftRatio = (p: OyinPrizeView) => (p.soldOut || p.limit <= 0 ? 1 : p.remaining / p.limit);
  // ⚠️ Bir ekranda ENG KO'PI BITTA qizil — eng tanqisi qizil, qolganlari kahraboga tushadi.
  // Aks holda uchala kartada ham qizil chiqib, hech biri o'qilmay qoladi (maket v2 xatosi).
  const hotKey = [...vitrina.prizes]
    .filter((p) => !p.soldOut && p.limit > 0 && leftRatio(p) < 0.2)
    .sort((a, b) => leftRatio(a) - leftRatio(b))[0]?.key ?? null;
  const scarcity = (p: OyinPrizeView): "none" | "warn" | "hot" => {
    if (p.soldOut || p.limit <= 0) return "none";
    const left = leftRatio(p);
    if (left < 0.2) return p.key === hotKey ? "hot" : "warn";
    return left < 0.5 ? "warn" : "none";
  };

  // 📅 Ega maketidagi "31-AVGUST, 20:00" — mavsum tugash sanasi (sovg'alar shu kuni
  // topshiriladi). Boshlanmagan mavsumda esa BOSHLANISH sanasi ko'rsatiladi.
  // (`upcoming`/`unset` bu yergacha yetmaydi — ular yuqorida erta return bilan ushlangan.)
  const drawDateText = (() => {
    const iso = state.season.endIso;
    if (!iso) return "";
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return "";
    return `${uzDate(iso).toUpperCase()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  })();

  // Tiraj VAQTI — mavsum tugash sanasining soati (chiptada "31-avgust, 20:00" bo'lib chiqadi).
  const drawTime = (() => {
    const iso = state.season.endIso;
    if (!iso) return "";
    const d = new Date(iso);
    return Number.isFinite(d.getTime()) ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : "";
  })();

  const setGoal = async (p: OyinPrizeView) => {
    haptic();
    try {
      await api.oyinGoal(p.key);
      showToast(`🎯 Maqsad: ${p.name}`);
      loadHome();
    } catch { showToast("Maqsadni saqlab bo'lmadi"); }
  };
  const cd = countdownTo(state.season.endIso);
  const buyPrize = vitrina.prizes.find((p) => p.key === buyKey) ?? null;
  const activeFriend = jamoam?.friends.find((f) => f.status === "active_today" && f.gainToday > 0) ?? null;

  return (
    <div className="oyk">
      <div className="oyk-scroll">
        {/* Sarlavha — ega maketi 2026-08-03: avatar + brend + qo'ng'iroq.
            ⚠️ REYTING BUTUNLAY OLIB TASHLANDI (ega qarori): u ball QOLDIG'I bo'yicha
            saralanardi, ya'ni chipta olgan odamning o'rni TUSHARDI — to'g'ri xatti-harakat
            jazolanardi. Hech bir ekranda o'rin haqida gap qolmadi. */}
        <div className="oyk-top">
          <div className="oyk-top-me">
            <div className="oyk-top-av">
              <span>{(state.sponsor.name[0] ?? "B").toUpperCase()}</span>
              {state.ticketCount > 0 && <i className="oyk-top-av-b">{state.ticketCount}</i>}
            </div>
            <div className="oyk-top-nm">
              <b>BirJoy</b>
              <small>{state.season.label ? `${state.season.label} o'yini` : "Sovg'alar o'yini"}</small>
            </div>
          </div>
          <button type="button" className="oyk-bell" onClick={openBell} aria-label="Xabarlar">
            🔔
            {bellNew > 0 && <i className="oyk-bell-dot">{bellNew > 9 ? "9+" : bellNew}</i>}
          </button>
        </div>

        {phase === "final48" && (
          <div className="oyk-final-banner">🔒 <b>Oxirgi 48 soat.</b> Chipta olish yopildi — ro'yxat tirajga tayyor. Chiptalaringiz "Chiptalarim" bo'limida turibdi.</div>
        )}

        {tab === "home" && (
          <>
            {ended ? (
              /* 🏁 MAVSUM YAKUNI — endi ERTA RETURN emas, O'yin tabining kontenti.
                 Tab-qatori, Chiptalarim va "?" tirik qoladi (tiraj kuni chipta kerak bo'ladi). */
              (() => {
                // Ega qarori 2026-08-03: mavsum oxirida ball TANGAGA AYLANMAYDI, kuyadi.
                // Ekran shuni ochiq aytadi — mavsum davomida ham aytilgan (ball jadvali ostida),
                // shuning uchun bu yerda "to'satdan" bo'lmaydi.
                return (
                  <div className="oyk-hero is-new">
                    <div className="oyk-hero-glow" />
                    <div className="oyk-hero-label">🏁 MAVSUM YAKUNLANDI</div>
                    <div className="oyk-hero-new-title">
                      {state.ticketCount > 0 ? "Chiptalaringiz tirajda" : "Bu mavsum tugadi"}
                    </div>
                    <div className="oyk-ended-card">
                      <div className="oyk-ended-row"><span>Chiptalaringiz</span><b>{state.ticketCount} ta</b></div>
                      <div className="oyk-ended-row"><span>Sarflanmagan ball</span><b>{state.ball}</b></div>
                    </div>
                    <div className="oyk-hero-new-sub">
                      {state.ticketCount > 0
                        ? <>Sarflanmagan ball mavsum bilan birga yonadi. Chiptalaringiz esa tirajda — omad!</>
                        : <>Sarflanmagan ball mavsum bilan birga yonadi. Keyingi mavsumda ballni chiptaga aylantirishni unutmang.</>}
                    </div>
                  </div>
                );
              })()
            ) : (
              /* ── EGA MAKETI 2026-08-03: ikkita karta ──────────────────────────────────
                 1) Binafsha — TIRAJ SANASI (sovg'alar shu kuni topshiriladi, sana yonadi)
                 2) Sarg'ish — BALANS va chiptagacha qolgan yo'l
                 Maqsad-hero, sovrin raili, JONLI lenta va haftalik zanjir OLIB TASHLANDI —
                 ega: "o'yin uy tabida sovrinlar ham, haftalik vazifa ham, jonli ham kerak emas". */
              <>
                <div className="oyk-draw">
                  <span className="oyk-draw-glow" aria-hidden="true" />
                  <div className="oyk-draw-h">OY OXIRIDA JONLI TIRAJ!</div>
                  <div className="oyk-draw-k">Sovg'alar topshiriladi</div>
                  <div className="oyk-draw-d">{drawDateText}</div>
                  <button type="button" className="oyk-draw-btn" onClick={() => { haptic(); setSheet("how"); }}>
                    Qanday ishlaydi? <span aria-hidden="true">›</span>
                  </button>
                  <span className="oyk-draw-spark" aria-hidden="true" />
                  <span className="oyk-draw-gift" aria-hidden="true">🎁</span>
                </div>

                {/* 🪙 BALANS — ega maketi 2026-08-03 (2-rasm): to'q rangli karta, sovrin
                    FOTOSI o'ngda, katta "N ball qoldi", gradient progress va foiz.
                    Avval sarg'ish fon + 🪙 emoji edi — ega: "rang emas, mana bunaqa
                    chiroyli bo'lishi kerak edi". */}
                <div className="oyk-goalc">
                  {cheapest ? (
                    <>
                      <div className="oyk-goalc-top">
                        <div className="oyk-goalc-side">
                          <div className="oyk-goalc-tag"><span aria-hidden="true">🎟</span>{cheapest.name}</div>
                          <div className="oyk-goalc-num">
                            <b>{Math.max(0, cheapest.price - state.ball)}</b> <span>ball qoldi</span>
                          </div>
                        </div>
                        <div className="oyk-goalc-img">
                          {cheapest.photoUrl && !badPhoto.has(cheapest.key)
                            ? <img src={cheapest.photoUrl} alt="" loading="lazy" onError={() => markBadPhoto(cheapest.key)} />
                            : <span>{cheapest.icon}</span>}
                        </div>
                      </div>
                      <div className="oyk-goalc-bar">
                        <span style={{ width: `${Math.min(100, (state.ball / cheapest.price) * 100).toFixed(1)}%` }} />
                      </div>
                      <div className="oyk-goalc-meta">
                        <span><b>{state.ball}</b> / {cheapest.price} = 1 ta chipta</span>
                        <span>{Math.min(100, Math.round((state.ball / cheapest.price) * 100))}%</span>
                      </div>
                      <div className="oyk-goalc-foot">{cheapest.price} ball = 1 ta chipta</div>
                    </>
                  ) : (
                    <div className="oyk-goalc-num"><b>{state.ball}</b> <span>ball</span></div>
                  )}
                  <button type="button" className="oyk-bal-btn" onClick={() => { haptic(); setSheet("ball"); }}>
                    Ball qanday yig'iladi? <span aria-hidden="true">›</span>
                  </button>
                </div>

                {/* Ikkita asosiy harakat. "Safar qilish" XARITAGA kirgizadi (ega talabi). */}
                <div className="oyk-acts">
                  <button type="button" className="oyk-act is-ride" onClick={() => { haptic(); if (onTaxi) onTaxi(); else showToast("Taksi chaqirish — Uy ekranidan 🚕"); }}>
                    <span className="oyk-act-ic">🚕</span>
                    <b>Safar qilish</b>
                    <small>+{state.hints.rideBall} ball</small>
                  </button>
                  <button type="button" className="oyk-act is-invite" onClick={() => void inviteFriend()}>
                    <span className="oyk-act-ic">👥</span>
                    <b>Do'st chaqirish</b>
                    <small>+{state.hints.referFirstRideBall} ball</small>
                  </button>
                </div>
              </>
            )}

            {/* Mavsum tugagach kunlik vazifalar ham, "ball yig'" chaqiriqlari ham MA'NOSIZ —
                ular ball va'da qiladi, ball esa endi hech narsaga aylanmaydi. */}
            {!ended && (() => {
              // 🎯 Bugungi maqsad — prototipdagi halqa, endi REAL ma'lumot bilan (state.today).
              // ⚠️ Uchinchi qator avval "Do'st chaqirish +40" derdi va bosilganda `inviteFriend()`
              // ni chaqirardi — u esa faqat Telegram ulashish oynasini ochadi va HECH QANDAY ball
              // bermaydi (+40 do'st RAQAM ULAGANDA, ya'ni ertaga yoki hech qachon keladi).
              // Ustiga `done` sharti `shared || referJoined` edi: +10 ulashish balini olgan odamga
              // ekran "✓ +40" deb ko'rsatardi. Endi qator o'zi beradigan narsani aytadi:
              // ulashish = +10, bosilganda `doShareBonus` HAQIQATAN yozadi va galochka qo'yiladi.
              const tasks = [
                { done: state.today.login, label: "Ilovaga kirish", gain: state.hints.loginBall, tap: null },
                { done: state.today.rides > 0, label: "1 safar qilish", gain: state.hints.rideBall, tap: null },
                { done: state.today.shared, label: "Ulashish", gain: state.hints.shareBall, tap: () => void doShareBonus() },
              ] as const;
              const doneCount = tasks.filter((t) => t.done).length;
              const R = 26;
              const C = 2 * Math.PI * R;
              return (
                <div className="oyk-daily">
                  <div className="oyk-daily-ring">
                    <svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">
                      {/* Iz rangi TOKENDAN. Avval `rgba(255,255,255,.09)` — qorong'i qurilishdan
                          qolgan oq iz, oq karta ustida umuman ko'rinmasdi (halqa "osilib" turardi). */}
                      <circle cx="32" cy="32" r={R} fill="none" stroke="var(--oyk-fill)" strokeWidth="6" />
                      <circle
                        cx="32" cy="32" r={R} fill="none" stroke="var(--oyk-violet)" strokeWidth="6" strokeLinecap="round"
                        strokeDasharray={C} strokeDashoffset={C * (1 - doneCount / tasks.length)}
                        transform="rotate(-90 32 32)" style={{ transition: "stroke-dashoffset .6s ease" }}
                      />
                    </svg>
                    <div className="oyk-daily-ring-num">{doneCount}/{tasks.length}</div>
                  </div>
                  <div className="oyk-daily-body">
                    {/* Ega talabi: sarlavha "vazifa" emas, YORDAM tilida. */}
                    <div className="oyk-daily-title">Tezroq ball olish uchun <small>{doneCount}/{tasks.length} bajarildi</small></div>
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

            {/* 🎯 BUGUNGI TOPSHIRIQ — har kuni RANDOM (ega talabi 2026-08-03). Tanlov
                deterministik (a'zo + kun), sahifa yangilanganda o'zgarmaydi. To'plamda faqat
                SERVER TEKSHIRA OLADIGAN topshiriqlar bor. */}
            {!ended && state.quest && state.quest.ball > 0 && (
              <div className={`oyk-quest${state.quest.done ? " is-done" : ""}`}>
                <span className="oyk-quest-em">{state.quest.icon}</span>
                <span className="oyk-quest-tx">
                  <b>{state.quest.title}</b>
                  <small>{state.quest.done ? "Bajarildi — ball tushdi ✓" : state.quest.hint}</small>
                </span>
                <span className="oyk-quest-b">{state.quest.done ? `✓ +${state.quest.ball}` : `+${state.quest.ball}`}</span>
              </div>
            )}

            {/* 🏠 DOIMIY topshiriq — ilovani telefon ekraniga o'rnatish. Klient qo'llab-
                quvvatlamasa UMUMAN ko'rsatilmaydi: bajarib bo'lmaydigan vazifa = bo'sh va'da. */}
            {!ended && homeSupported === true && state.homeTask.ball > 0 && (
              <button
                type="button"
                className={`oyk-quest is-home${state.homeTask.done ? " is-done" : ""}`}
                disabled={state.homeTask.done}
                onClick={() => { haptic(); addToHomeScreen(); }}
              >
                <span className="oyk-quest-em">🏠</span>
                <span className="oyk-quest-tx">
                  <b>Ilovani telefon ekraniga o'rnating</b>
                  <small>{state.homeTask.done ? "O'rnatilgan — ball tushdi ✓" : "Bir bosishda — keyin ilova tezroq ochiladi"}</small>
                </span>
                <span className="oyk-quest-b">{state.homeTask.done ? `✓ +${state.homeTask.ball}` : `+${state.homeTask.ball}`}</span>
              </button>
            )}

            {/* 💡 Eng tez yo'l — ega talabi 2026-08-03: "do'stinga ayt, SEN ORQALI taksi
                chaqirsin". Avval quruq "N do'st + M safar" hisobi turardi; endi aniq harakat. */}
            {!ended && cheapest && !nearMiss && (
              <button type="button" className="oyk-fast" onClick={() => void inviteFriend()}>
                <span className="oyk-fast-ic">💡</span>
                <span>Eng tez yo'l: <b>do'stingga ayt — sening havolang orqali taksi chaqirsin</b></span>
              </button>
            )}


            {/* 🎟 Chipta raqami avval bayram-oynasida BIR MARTA ko'rinib abadiy yo'qolardi —
                odam 600 ball to'lab qo'lida hech narsa qolmasdi. Endi doimiy ro'yxat bor. */}
            {state.ticketCount > 0 && (
              <button type="button" className="oyk-howto" onClick={openTickets}>
                <span>🎟 Mening chiptalarim <b>({state.ticketCount})</b></span>
                <span className="oyk-howto-go">→</span>
              </button>
            )}

            {/* ⛔ Haftalik zanjir bloki va JONLI lenta OLIB TASHLANDI (ega qarori 2026-08-03):
                "havtalik vazifa ham [kerak emas]", "Jonli ham kerak emas". Zanjir mexanikasi
                serverda ishlayveradi va ball jadvalida ko'rinadi — faqat bu blok yo'q. */}

            {!ended && activeFriend && (
              <div className="oyk-magnet">
                <div className="oyk-magnet-emoji">🔥</div>
                <div className="oyk-magnet-body">
                  <div className="oyk-magnet-title">{activeFriend.name} bugun {activeFriend.ridesToday > 1 ? `${activeFriend.ridesToday}-safarini` : "safarini"} qildi!</div>
                  <div className="oyk-magnet-sub">Sizga bugun <b>+{activeFriend.gainToday} ball</b> olib keldi</div>
                </div>
                <button
                  type="button"
                  className={`oyk-thanks${thanked.has(activeFriend.memberId) ? " is-done" : ""}`}
                  disabled={thanked.has(activeFriend.memberId)}
                  onClick={() => void sayThanks(activeFriend.memberId)}
                >{thanked.has(activeFriend.memberId) ? "✓ Aytildi" : "🤝 Rahmat ayt"}</button>
              </div>
            )}

            {/* ⛔ Sovrin raili uy tabidan OLIB TASHLANDI (ega qarori 2026-08-03:
                "uy sahifasida sovrinlar kerak emas"). Sovrinlar o'z tabida —
                bitta narsa ikki joyda turmasin. */}
            {/* ⭐ Eng muhim savol — "nima qilsam ball ko'payadi?". Avval javob varaq ortida edi va
                deyarli hech kim ochmasdi: eng katta mukofot (hikoya, do'st birinchi safari) ekranda
                umuman ko'rinmasdi. YAKUNIY DIZAYN §4 — jadval EKRANDA, ostida doimiy ogohlantirish. */}
            {/* Tugagan mavsumda ball jadvali va "do'st chaqiring" chaqirig'i ball va'da
                qiladi, ball esa endi hech narsaga aylanmaydi — ikkalasi ham yashiriladi. */}
            {/* ⛔ Ball jadvali va pastdagi CTA uy tabidan OLINDI (ega qarori 2026-08-03):
                jadval endi "Ball qanday yig'iladi? ›" tugmasi ortida. Uy tabi qisqa va
                aniq bo'lib qoldi: tiraj sanasi → balans → ikkita harakat → bugungi vazifalar. */}
          </>
        )}

        {tab === "vitrina" && (
          <>
            <div className="oyk-v-head">
              <div className="oyk-v-title">🎁 Sovrinlar</div>
              <div className="oyk-rail-sub">{vitrina.prizes.reduce((s, p) => s + p.limit, 0)} ta chipta</div>
            </div>
            {/* 📅 Tiraj banneri — sana VA vaqt (YAKUNIY DIZAYN §7, tab 2 birinchi elementi).
                Avval mijoz "qachon o'ynaladi?" degan savolga javobsiz chipta olardi.
                🪙 Balans ham shu yerda: avval "qancha ballim bor?" uchun boshqa tabga qaytish kerak edi. */}
            <div className="oyk-vtop">
              <div className="oyk-vtop-draw">
                <span className="oyk-vtop-ic">📅</span>
                <span>{state.season.endIso
                  ? <>Tiraj: <b>{uzDate(state.season.endIso)}{drawTime ? `, ${drawTime}` : ""}</b> — jonli efirda</>
                  : <>Tiraj sanasi tez orada e'lon qilinadi</>}</span>
              </div>
              <div className="oyk-vtop-ball"><span>Sizning ballingiz</span><b>{state.ball}</b></div>
            </div>
            <div className="oyk-sponsor-strip">
              <div className="oyk-sponsor-logo">{vitrina.sponsor.name[0] ?? "B"}</div>
              <div className="oyk-sponsor-strip-text">Sovrinlar homiysi — <b>{vitrina.sponsor.name}</b></div>
            </div>
            {vitrina.prizes.length === 0 && (
              <div className="oyk-j-report">Sovrinlar hozircha qo'yilmagan — tez orada paydo bo'ladi. Ball yig'ib turing, u yo'qolmaydi 🎁</div>
            )}
            {vitrina.prizes.map((p) => {
              const affordable = !locked && state.ball >= p.price;
              const showPhoto = !!p.photoUrl && !badPhoto.has(p.key);
              return (
                <div key={p.key} className={`oyk-vcard${p.soldOut ? " is-soldout" : ""}`}>
                  {/* ⚠️ Avval `onError` da `parentElement.remove()` turardi — u nafaqat rasmni,
                      balki uning ICHIDAGI sovrin NOMI va NARXINI ham o'chirardi (karta nomsiz
                      to'rtburchakka aylanardi) va React boshqaradigan tugunni tashqaridan
                      olib tashlardi. Endi holat React'da: rasm o'rniga rangli emoji-afisha. */}
                  {showPhoto ? (
                    <div className="oyk-vcard-photo">
                      <img src={p.photoUrl ?? ""} alt="" loading="lazy" onError={() => markBadPhoto(p.key)} />
                      <div className="oyk-vcard-photo-fade" />
                      <div className="oyk-vcard-photo-name">{p.name}</div>
                      <div className="oyk-vcard-photo-price">{p.price} <small>ball</small></div>
                    </div>
                  ) : (
                    <div className="oyk-vcard-photo is-emoji">
                      <span className="oyk-vcard-photo-emoji">{p.icon}</span>
                      <div className="oyk-vcard-photo-fade" />
                      <div className="oyk-vcard-photo-name">{p.name}</div>
                      <div className="oyk-vcard-photo-price">{p.price} <small>ball</small></div>
                    </div>
                  )}
                  <div className="oyk-vcard-top">
                    <div className="oyk-vcard-title">
                      <div className="oyk-vcard-sub">{p.valueLabel} · {p.limit} dona</div>
                    </div>
                  </div>
                  <div className="oyk-vbar">
                    <div className="oyk-vbar-fill" style={{ width: `${Math.min(100, Math.round((state.ball / p.price) * 100))}%` }} />
                  </div>
                  {/* Olingan/qolgan JUFTLIGI (YAKUNIY DIZAYN §7): faqat "qolgan" ijtimoiy isbot
                      bermaydi — "olingan" boshqalar ham olayotganini ko'rsatadi. */}
                  <div className="oyk-vcard-stats">
                    <span>Olingan: <b>{p.sold}</b> · Qolgan: <b>{p.remaining}</b></span>
                    <span>Sizda: <b>{p.mine} ta</b></span>
                  </div>
                  {/* 🚦 Tanqislik faqat HAQIQAT bo'lganda ko'rsatiladi (§6): <20% qizil,
                      20-50% kahrabo, undan yuqorisi — rangsiz. */}
                  {scarcity(p) !== "none" && (
                    <div className={`oyk-scarce is-${scarcity(p)}`}>
                      {scarcity(p) === "hot" ? `🔥 ${p.remaining} ta qoldi — tugayapti` : `${p.remaining} ta qoldi`}
                    </div>
                  )}
                  {/* ⚠️ Tugagan sovringa "eng tez yo'l" ko'rsatish — bo'sh va'da: yo'l bor,
                      lekin oxirida olib bo'lmaydi. Tugaganda faqat qatnashgan bo'lsa gap qoladi. */}
                  {(!p.soldOut || p.mine > 0) && (
                    <div className="oyk-vcard-path">
                      💡 {p.mine > 0
                        ? (p.chancePct != null && p.chancePct >= 100
                          // limit=1 bo'lgan sovrinda "≈100% — yana olsang oshadi" bema'ni edi:
                          // oshadigan joyi yo'q va bu tiraj emas, sotib olish bo'lib qoladi.
                          ? "Bu sovrinning yagona chiptasi sizda"
                          : `Sizda ${p.mine} ta chipta bor — imkoniyat ${p.chancePct ?? 0}%`)
                        : fastPath(p.price - state.ball, state.hints.referComboBall, state.hints.rideBall)}
                    </div>
                  )}
                  {/* Limit xariddan OLDIN aytiladi — avval mijoz unga faqat tugmani bosgandan
                      keyin duch kelardi ("limitga yetdingiz", raqamsiz). */}
                  {p.mine > 0 && p.mine >= state.hints.maxPerPrize && (
                    <div className="oyk-vcard-path">⚖️ Bu sovrindan limitga yetdingiz ({state.hints.maxPerPrize} ta)</div>
                  )}
                  {/* 🎯 Maqsad qilish — hero shu sovringa qarab chiziladi */}
                  {!p.soldOut && (
                    state.goalPrizeKey === p.key
                      ? <div className="oyk-goal-on">🎯 Bu sizning maqsadingiz</div>
                      : <button type="button" className="oyk-goal-btn" onClick={() => void setGoal(p)}>🎯 Maqsad qilish</button>
                  )}
                  <button
                    type="button"
                    className={`oyk-vbtn${affordable && !p.soldOut ? " is-on" : ""}${p.soldOut ? " is-soldout" : locked ? " is-frozen" : ""}`}
                    onClick={() => tapPrize(p)}
                  >
                    {p.soldOut ? "❌ O'rinlar tugadi" : locked ? "🔒 Chipta olish yopildi" : p.mine > 0 ? `🎟 Yana ol — ${p.price} ball` : affordable ? `🎟 Chipta ol — ${p.price} ball` : `${p.price - state.ball} ball qoldi`}
                  </button>
                </div>
              );
            })}
            {/* ⚠️ Bu qator endi HAQIQAT: final-48 serverda ham qulflangan (OYIN_FINAL_LOCK_MS).
                Avval faqat mijoz tomonidagi bo'yoq edi — tugma "muzlagan" derdi, xarid o'tardi. */}
            <div className="oyk-sched">
              <span className="oyk-sched-emoji">📅</span>
              <div className="oyk-sched-text">
                <b>Oxirgi 48 soat:</b> chipta olish yopiladi — ro'yxat tirajga qotadi<br />
                <b>Mavsum oxirida:</b> JONLI TIRAJ — Telegram efirida 🔴
              </div>
            </div>
          </>
        )}

        {/* 🎟 CHIPTALARIM — endi tab. Chipta "ko'rinadigan buyum" (YAKUNIY DIZAYN §2):
            global noyob raqam, sovrin, tiraj sanasi va holati. */}
        {tab === "tickets" && (
          <>
            <div className="oyk-v-head">
              <div className="oyk-v-title">🎟 Chiptalarim</div>
              {tickets && <div className="oyk-rail-sub">{tickets.tickets.length} ta</div>}
            </div>
            {!tickets ? (
              /* Skeleton REAL chipta shaklida (DIZAYN_QOIDALARI #11) — avval bitta 104px
                 to'rtburchak turardi va yuklanganda ~120px chiptalarga sakrardi. */
              <>{[0, 1].map((i) => <div key={i} className="oyk-skel-block oyk-skel-tkt" />)}</>
            ) : tickets.tickets.length === 0 ? (
              <>
                <div className="oyk-j-report">
                  {ended
                    ? "Bu mavsumda chipta olmagansiz. Keyingi mavsum sanasi e'lon qilinganda shu yerda ko'rinadi."
                    : <>Hali chiptangiz yo'q.{cheapest ? ` ${cheapest.price} ball yig'ing — birinchi chiptangizni oling!` : ""}</>}
                </div>
                {!ended && (
                  <button type="button" className="oyk-cta" onClick={() => { haptic(); setTab("vitrina"); }}>
                    <span className="oyk-cta-label">🎁 Sovrinlarni ko'rish</span>
                    <span className="oyk-cta-shine" />
                  </button>
                )}
              </>
            ) : (
              <>
                {tickets.tickets.map((t) => (
                  <div key={`${t.prizeKey}-${t.gno}`} className="oyk-tkt">
                    <div className="oyk-tkt-stub">
                      <div className="oyk-tkt-brand">BIRJOY SOVRIN CHIPTASI</div>
                      <div className="oyk-tkt-no">№ {t.gno}</div>
                      <div className="oyk-tkt-side">{t.gno}</div>
                    </div>
                    <div className="oyk-tkt-body">
                      {/* Sovrin RASMI chiptada — ma'lumot serverdan kelardi va tashlab
                          yuborilardi. "Jismoniy narsa = real rasm" (DIZAYN_QOIDALARI #10):
                          yig'iladigan buyum kulrang matn qatori bo'lib qolmasin. */}
                      <div className="oyk-tkt-pic">
                        {t.photoUrl && !badPhoto.has(`t${t.gno}`)
                          ? <img src={t.photoUrl} alt="" loading="lazy" onError={() => markBadPhoto(`t${t.gno}`)} />
                          : <span>{t.prizeIcon}</span>}
                      </div>
                      <div className="oyk-tkt-info">
                        <div className="oyk-tkt-prize">{t.prizeName}</div>
                        <div className="oyk-tkt-when">Tiraj: {uzDate(tickets.drawIso)}{drawTime ? `, ${drawTime}` : ""}</div>
                      </div>
                      {/* Holat QOTIRILGAN "AKTIV" emas — tirajdan keyin chipta aktiv EMAS. */}
                      <span className={`oyk-tkt-badge${ended ? " is-done" : ""}`}>{ended ? "TIRAJDA" : "KUCHDA"}</span>
                    </div>
                  </div>
                ))}
                <div className="oyk-note-violet">
                  {ended
                    ? <>Jami <b>{tickets.tickets.length} ta</b> chipta tirajda qatnashdi. G'oliblar Telegram kanalimizda e'lon qilinadi.</>
                    : <>Jami <b>{tickets.tickets.length} ta</b> chipta. Qancha chipta ko'p bo'lsa, yutish ehtimoli shuncha yuqori.</>}
                </div>
              </>
            )}
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
                  <div key={f.memberId} className="oyk-friend">
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
            {/* IKKITA SUMMA ALOHIDA (YAKUNIY DIZAYN §7). Bitta yig'indi o'yinning asosiy
                g'oyasini yashiradi: bir martalik bonus TUGAYDI, do'st safaridan keladigan oqim
                esa TUGAMAYDI. Mijoz shu farqni raqamda ko'rmasa "do'st chaqirish" bir martalik
                ish bo'lib tuyuladi — aslida butun iqtisod ikkinchi ustunga tayanadi. */}
            {jamoam && jamoam.friends.length > 0 && (
              <div className="oyk-jsum">
                <div className="oyk-jsum-row">
                  <span className="oyk-jsum-lb">🎁 Bir martalik mukofot<small>ulanish + birinchi safar</small></span>
                  <b>+{jamoam.oneTimeBall}</b>
                </div>
                <div className="oyk-jsum-row is-flow">
                  <span className="oyk-jsum-lb">🔁 Do'stlar safaridan<small>cheksiz — ular yurgani sari o'sadi</small></span>
                  <b>+{jamoam.rideBall}</b>
                </div>
                <div className="oyk-jsum-row is-total">
                  <span className="oyk-jsum-lb">{jamoam.friends.length} do'stdan jami</span>
                  <b>+{jamoam.totalBall} ball</b>
                </div>
              </div>
            )}
            <div className="oyk-j-hint">💡 Taksi <b>KO'P chaqiradigan</b> tanishingizni chaqiring — u sizga eng ko'p ball olib keladi</div>
            <div className="oyk-qr">
              <div className="oyk-qr-text">
{state.ticketCount > 0
                  ? <>Men BirJoy sovg'alar o'yinida <b>{state.ticketCount} ta chipta</b> to'pladim. Sen ham qo'shil! 🎁</>
                  : <>Men BirJoy sovg'alar o'yinidaman — sen ham qo'shil! 🎁</>}
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

            {/* 📸 Hikoya-poster — HIKOYA_POSTER_PLAN.md. Ball admin tasdig'idan keyin tushadi. */}
            {state.story.ballEach > 0 && (
              <div className="oyk-poster">
                <div className="oyk-poster-head">
                  <span className="oyk-poster-title">📸 Hikoya qo'y — <b>+{state.story.ballEach} ball</b></span>
                  <span className="oyk-poster-count">{state.story.approved}/{state.story.limit}</span>
                </div>
                {state.story.approved >= state.story.limit ? (
                  <div className="oyk-poster-note">✅ Bu mavsumda limitga yetdingiz — rahmat!</div>
                ) : state.story.pending ? (
                  <div className="oyk-poster-note">⏳ Tekshiruvda — 24 soat ichida javob beramiz</div>
                ) : (
                  <>
                    <div className="oyk-poster-note">
                      Posterni yuklab oling, hikoyangizga qo'ying va havolasini shu yerga tashlang. Tekshirgach ball tushadi.
                    </div>
                    {state.story.lastRejectReason && (
                      <div className="oyk-poster-reject">⛔ Oxirgi urinish rad etildi: {state.story.lastRejectReason}</div>
                    )}
                    {state.story.texts.length > 0 && (
                      <div className="oyk-poster-texts">
                        {state.story.texts.map((t) => (
                          <button
                            key={t} type="button"
                            className={`oyk-poster-chip${posterText === t ? " is-on" : ""}`}
                            onClick={() => { haptic(); setPosterText(t); }}
                          >{t}</button>
                        ))}
                      </div>
                    )}
                    <input
                      className="oyk-poster-input" type="text" maxLength={40}
                      value={posterText} onChange={(e) => setPosterText(e.target.value)}
                      placeholder="Yoki o'z matningizni yozing"
                    />
                    <input
                      className="oyk-poster-input" type="text" maxLength={24}
                      value={posterName} onChange={(e) => setPosterName(e.target.value)}
                      placeholder="Ismingiz (ixtiyoriy)"
                    />
                    <button type="button" className="oyk-poster-btn" disabled={posterBusy} onClick={() => void makePoster()}>
                      {posterBusy ? "⏳ Tayyorlanmoqda…" : "⬇️ Posterni yuklab olish"}
                    </button>
                    <input
                      className="oyk-poster-input" type="url"
                      value={storyUrl} onChange={(e) => setStoryUrl(e.target.value)}
                      placeholder="Hikoya havolasini joylashtiring"
                    />
                    <button type="button" className="oyk-poster-btn ghost" disabled={!storyUrl.trim() || posterBusy} onClick={() => void submitStory()}>
                      Havolani yuborish →
                    </button>
                  </>
                )}
              </div>
            )}
          </>
        )}

        <div className="oyk-sponsor">
          <div className="oyk-sponsor-logo">{vitrina.sponsor.name[0] ?? "B"}</div>
          <div className="oyk-sponsor-text">Mavsum homiysi — <b>{vitrina.sponsor.name}</b></div>
        </div>
        <div className="oyk-legal">Chipta — ishtirok, g'alaba emas. Tiraj mavsum oxirida jonli efirda.</div>
      </div>

      <div className="oyk-tabs">
        {/* 🎟 "Chiptalarim" varaqdan TABGA chiqdi — chipta endi o'yinning asosiy obyekti
            (YAKUNIY DIZAYN §2), varaqda yashirib bo'lmaydi. */}
        {([["home", "🎮", "O'yin"], ["vitrina", "🎁", "Sovrinlar"], ["tickets", "🎟", "Chiptalarim"], ["jamoam", "👥", "Jamoam"]] as const).map(([key, icon, label]) => (
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

            {/* 🔔 QO'NG'IROQ — ball qayerdan kelgani. Reyting shu yerda edi va u ball
                QOLDIG'I bo'yicha saralanardi: chipta olgan odamning o'rni tushardi, ya'ni
                to'g'ri xatti-harakat jazolanardi (ega qarori — butunlay olib tashlandi). */}
            {/* 🎮 "Qanday ishlaydi?" — ega maketi 3-rasm: 5 qadam. Raqamlar KNOBDAN va
                katalogdan keladi, qotirilmagan (ega narxni o'zgartirsa matn ham o'zgaradi). */}
            {sheet === "how" && (
              <>
                <div className="oyk-sheet-title">Qanday ishlaydi?</div>
                <div className="oyk-how-lead">Juda oson! 5 qadamda sovg'a yutasiz 🎁</div>
                <div className="oyk-how">
                  {([
                    ["🚕", "Safar qiling", `Taksi chaqiring va safar qiling. Har safardan +${state.hints.rideBall} ball olasiz.`],
                    ["🪙", "Ball yig'ing", `Vazifalarni bajaring, do'stlaringizni taklif qiling. Do'stingiz birinchi safarini qilsa +${state.hints.referFirstRideBall} ball.`],
                    ["🎟", "Ballni chiptaga almashtiring", cheapest ? `${cheapest.price} ball = 1 ta chipta. Nechta chipta ko'p bo'lsa, yutish ehtimoli shuncha yuqori.` : "Ballni chiptaga almashtirasiz. Nechta chipta ko'p bo'lsa, yutish ehtimoli shuncha yuqori."],
                    ["📺", "Jonli tirajda qatnashing", `${drawDateText ? `${drawDateText} — ` : "Mavsum oxirida "}Telegramda jonli efirda barcha chiptalar orasidan g'oliblar tanlanadi.`],
                    ["🎁", "Sovg'ani yutib oling", "G'olib bo'lsangiz, sovg'angizni bepul olib ketasiz!"],
                  ] as const).map(([em, title, body], i) => (
                    <div key={title} className="oyk-how-step">
                      <span className="oyk-how-em">{em}</span>
                      <span className="oyk-how-body">
                        <b><i>{i + 1}</i> {title}</b>
                        <small>{body}</small>
                      </span>
                    </div>
                  ))}
                </div>
                <button type="button" className="oyk-how-ok" onClick={() => { haptic(); setSheet(null); }}>
                  Tushunarli, boshlaymiz! 🚀
                </button>
              </>
            )}

            {/* 💡 "Ball qanday yig'iladi?" — jadval SHU YERGA ko'chirildi (ega qarori). */}
            {sheet === "ball" && (
              <>
                <div className="oyk-sheet-title">💡 Ball qanday yig'iladi</div>
                <div className="oyk-ball">
              <div className="oyk-ball-list">
                {ballRows(state.hints).map((r) => (
                  <div key={r.label} className="oyk-ball-row">
                    <span className="oyk-ball-ic">{r.ic}</span>
                    <span className="oyk-ball-lb">{r.label}<small>{r.note}</small></span>
                    <span className="oyk-ball-num">+{r.ball}</span>
                  </div>
                ))}
              </div>
              {/* Yordam zanjiri ANIQ raqam bilan. `fastPath` bir martalik yo'lni aytadi
                  (do'st ulash bonusi), bu qator esa DOIMIY oqimni — ikkisi zid emas. */}
              {cheapest && state.hints.referRideBall > 0 && (
                <div className="oyk-ball-chain">
                  🤝 Do'stingiz har yurganda sizga <b>+{state.hints.referRideBall} ball</b> —{" "}
                  {Math.ceil(cheapest.price / state.hints.referRideBall)} ta do'st safari = 1 chipta ({cheapest.name}).
                </div>
              )}
              {/* Doimiy qator (YAKUNIY DIZAYN §4). Ball hech qachon pulga aylanmaydi —
                  buni bir marta onboarding'da aytib qo'yish yetarli emas, doim ko'rinib tursin. */}
              {/* Endi bu qator TO'LIQ haqiqat: mavsum oxirida konvertatsiya YO'Q (ega qarori
                  2026-08-03) — ball hech qanday shaklda pulga aylanmaydi. Va kuyishi mavsum
                  DAVOMIDA aytiladi, oxirida to'satdan emas. */}
              <div className="oyk-ball-warn">
                Ball pul emas — faqat chipta olish uchun.<br />
                Mavsum oxirigacha sarflanmagan ball yonadi.
              </div>
            </div>
              </>
            )}

            {sheet === "bell" && (
              <>
                <div className="oyk-sheet-title">🔔 Ballingiz qayerdan keldi</div>
                {!bell ? (
                  <>{[0, 1, 2].map((i) => <div key={i} className="oyk-skel-block oyk-skel-bell" />)}</>
                ) : bell.rows.length === 0 ? (
                  <div className="oyk-note-violet">Hali voqea yo'q. Birinchi safaringizdan keyin shu yerda ko'rinadi 🚕</div>
                ) : (
                  <div className="oyk-bell-list">
                    {bell.rows.map((r, i) => (
                      <div key={`${r.at}-${i}`} className="oyk-bell-row">
                        <span className="oyk-bell-ic">{ACTION_EMOJI[r.action] ?? "•"}</span>
                        <span className="oyk-bell-tx">
                          {/* Do'st ishtirok etgan voqealarda ISM EGA bo'ladi: "Amir safar qildi",
                              "Do'stingiz safar qildi · Amir" emas — ega shunday xohladi. */}
                          {r.helpedName
                            ? <><b>{r.helpedName}</b> {FRIEND_LABEL[r.action] ?? ACTION_LABEL[r.action] ?? r.action}</>
                            : (ACTION_LABEL[r.action] ?? r.action)}
                          <small>{uzDate(r.at)}</small>
                        </span>
                        <span className={`oyk-bell-b${r.ball < 0 ? " is-minus" : ""}`}>{r.ball > 0 ? `+${r.ball}` : r.ball}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* ❓ Ma'lumot to'plami (YAKUNIY DIZAYN §1) — TAB emas, lekin doim qo'l ostida.
                Avval bularning hammasi onboarding'da bir marta chiqib abadiy yo'qolardi;
                "chipta nima?" savoli esa xarid PAYTIDA, bir hafta o'tib tug'iladi. */}
            {sheet === "info" && (
              <>
                <div className="oyk-sheet-title">❓ Savol-javob</div>
                <div className="oyk-info">
                  <div className="oyk-info-b">
                    <div className="oyk-info-t">🎮 Qanday ishlaydi</div>
                    <div className="oyk-info-x">
                      Safar qilasiz, do'st chaqirasiz, hikoya joylaysiz — <b>ball</b> yig'iladi.
                      Ballga <b>chipta</b> olasiz. Mavsum oxirida chiptalar orasidan g'olib chiqadi.
                      Hech qanday to'lov yo'q — faqat ilovadan foydalanasiz.
                    </div>
                  </div>
                  <div className="oyk-info-b">
                    <div className="oyk-info-t">🎟 Chipta nima</div>
                    <div className="oyk-info-x">
                      Chipta — <b>tirajda qatnashish huquqi</b>, g'alaba kafolati emas.
                      Har chiptaning o'z raqami bor va u <b>Chiptalarim</b> tabida doim turadi.
                      Bir sovringa nechta chiptangiz bo'lsa, imkoningiz shuncha yuqori.
                    </div>
                  </div>
                  <div className="oyk-info-b">
                    <div className="oyk-info-t">📺 Jonli tiraj nima</div>
                    <div className="oyk-info-x">
                      {tickets?.drawIso || state.season.endIso
                        ? <>Mavsum tugagach — <b>{uzDate(tickets?.drawIso ?? state.season.endIso)}{drawTime ? `, ${drawTime}` : ""}</b> — </>
                        : <>Mavsum tugagach </>}
                      Telegram kanalimizda jonli efir bo'ladi. G'olib chiptalar tasodifiy tanlanadi,
                      hamma ko'rib turadi. Yutsangiz — botdan darhol xabar keladi.
                    </div>
                  </div>
                  <div className="oyk-info-b">
                    <div className="oyk-info-t">📋 Qoidalar</div>
                    <div className="oyk-info-x">
                      • Ball <b>pul emas</b> — yechib bo'lmaydi, faqat chiptaga almashadi.<br />
                      • Ball faqat <b>mavsum ichida</b> qilingan harakatlardan yig'iladi.<br />
                      • Chipta uchun to'langan ball <b>qaytarilmaydi</b>.<br />
                      • Bitta sovringa bir odam cheklangan sondan ko'p chipta ola olmaydi.<br />
                      • Soxta hikoya yoki qalbaki taklif — ball bekor qilinadi.
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* 🎟 SOVRIN TAFSILOTI (YAKUNIY DIZAYN §7): katta rasm · o'lchangan tanqislik ·
                "Sizning ballingiz" · MIQDOR (max N) · "Xariddan keyin qoladi" · katta tugma ·
                IKKI QATORLI huquqiy izoh. Alohida ekran o'rniga shu varaq — bir bosish kam,
                mazmun bir xil (ega tasdiqlagan §7 tarkibi to'liq shu yerda). */}
            {sheet === "buy" && buyPrize && (() => {
              const maxQty = Math.max(1, Math.min(state.hints.maxPerPrize - buyPrize.mine, buyPrize.remaining, Math.floor(state.ball / buyPrize.price)));
              const qty = Math.min(buyQty, maxQty);
              const total = buyPrize.price * qty;
              const sc = scarcity(buyPrize);
              return (
              <>
                <div className="oyk-sheet-title">🎟 Chiptani olasizmi?</div>
                {/* KATTA rasm — avval 52px miniatyura edi; sovrin xarid daqiqasida ko'rinsin. */}
                <div className="oyk-buy-hero">
                  {buyPrize.photoUrl && !badPhoto.has(buyPrize.key)
                    ? <img src={buyPrize.photoUrl} alt="" onError={() => markBadPhoto(buyPrize.key)} />
                    : <span className="oyk-buy-hero-emoji">{buyPrize.icon}</span>}
                  <div className="oyk-buy-hero-fade" />
                  <div className="oyk-buy-hero-name">{buyPrize.name}</div>
                  {buyPrize.valueLabel && <div className="oyk-buy-hero-val">{buyPrize.valueLabel}</div>}
                </div>
                {sc !== "none" && (
                  <div className={`oyk-scarce is-${sc}`}>
                    {sc === "hot" ? `🔥 ${buyPrize.remaining} ta qoldi — tugayapti` : `${buyPrize.remaining} ta qoldi`}
                  </div>
                )}
                {/* MIQDOR — avval 3 ta chipta uchun butun oqim (karta→varaq→tasdiq→bayram) uch
                    marta takrorlanardi. Limit ham shu yerda RAQAM bilan aytiladi. */}
                {maxQty > 1 && (
                  <div className="oyk-qty">
                    <span className="oyk-qty-lb">Nechta?</span>
                    <div className="oyk-qty-btns">
                      {Array.from({ length: Math.min(maxQty, state.hints.maxPerPrize) }, (_, i) => i + 1).map((n) => (
                        <button key={n} type="button" className={`oyk-qty-b${qty === n ? " is-on" : ""}`} onClick={() => { haptic(); setBuyQty(n); }}>{n}</button>
                      ))}
                    </div>
                    <span className="oyk-qty-max">max {state.hints.maxPerPrize}</span>
                  </div>
                )}
                {/* "Xariddan keyin qoladi" — xaridning ASOSIY savoli. Avval odam ballini
                    yechgandan keyingina qancha qolganini bilardi; endi bosishdan OLDIN ko'radi. */}
                <div className="oyk-buy-after">
                  <div className="oyk-buy-after-r"><span>Sizning ballingiz</span><b>{state.ball}</b></div>
                  <div className="oyk-buy-after-r"><span>{qty > 1 ? `${qty} chipta narxi` : "Chipta narxi"}</span><b className="is-minus">−{total}</b></div>
                  <div className="oyk-buy-after-r is-total"><span>Xariddan keyin qoladi</span><b>{Math.max(0, state.ball - total)}</b></div>
                </div>
                {/* IKKI QATORLI huquqiy izoh — ikkinchi fakt (ball pul emas) avval faqat bosh
                    tabda turardi, ya'ni pul-yechish savoli aynan xarid daqiqasida javobsiz edi. */}
                <div className="oyk-buy-note">
                  Chipta — tirajda ishtirok huquqi, g'alaba kafolati emas.<br />
                  Ball pul emas: to'langan ball qaytarilmaydi va naqdga yechilmaydi.
                </div>
                <div className="oyk-buy-actions">
                  <button type="button" className="oyk-buy-confirm" disabled={busy} onClick={() => void confirmBuy()}>{busy ? "…" : `Tasdiqlash — ${total} ball`}</button>
                  <button type="button" className="oyk-buy-cancel" onClick={() => { setSheet(null); setBuyKey(null); }}>Bekor</button>
                </div>
              </>
              );
            })()}
          </div>
        </div>
      )}

      {celebrate && (
        <div className="oyk-celebrate">
          <div className="oyk-ticket">
            <div className="oyk-ticket-emoji">
              {celebrate.prize.photoUrl && !badPhoto.has(celebrate.prize.key)
                ? <img src={celebrate.prize.photoUrl} alt="" onError={() => markBadPhoto(celebrate.prize.key)} />
                : celebrate.prize.icon}
            </div>
            {/* ⚠️ Bu raqam GLOBAL (`gno`) — Chiptalarim tabida ko'rinadigan raqamning AYNAN
                O'ZI. Avval bu yerda sovrin-ichi tartib raqami turardi ("№0002"), ro'yxatda esa
                global raqam ("№ 729476") — mijoz skrinshot qilgan raqam uniki emas edi. */}
            <div className="oyk-ticket-no">CHIPTA № {celebrate.ticketNo}</div>
            <div className="oyk-ticket-name">{celebrate.prize.name}</div>
            <div className="oyk-ticket-sub">
              {celebrate.count > 1 ? `${celebrate.count} ta chipta oldingiz — ` : ""}tirajda qatnashasiz — mavsum oxirida jonli efir!
            </div>
          </div>
          <div className="oyk-celebrate-wish">Omad tilaymiz!</div>
          <button type="button" className="oyk-celebrate-btn" onClick={() => setCelebrate(null)}>Zo'r! 🎉</button>
        </div>
      )}

      {onboard !== null && (() => {
        const slides = obSlides(state.hints);
        const cur = slides[onboard];
        if (!cur) return null;
        return (
        <div className="oyk-onboard">
          <div className="oyk-ob-icon">{cur.icon}</div>
          <div className="oyk-ob-step">{onboard + 1} / {slides.length} QADAM</div>
          <div className="oyk-ob-text">{cur.text}</div>
          <div className="oyk-ob-dots">
            {slides.map((sl, i) => <div key={sl.icon} className={`oyk-ob-dot${i === onboard ? " is-active" : ""}`} />)}
          </div>
          <button
            type="button" className="oyk-ob-next"
            onClick={() => (onboard >= slides.length - 1 ? finishOnboard() : setOnboard(onboard + 1))}
          >{onboard === slides.length - 1 ? "Boshladik! 🚀" : "Keyingisi"}</button>
          <button type="button" className="oyk-ob-skip" onClick={finishOnboard}>O'tkazib yuborish</button>
        </div>
        );
      })()}
    </div>
  );
}
