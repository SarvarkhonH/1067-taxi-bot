// 🎮 KOSON O'YINI — tiplar + sovrin-katalog (KOSON_OYIN_PLAN.md v9.2, KOSON_ADMIN_DOD.md).
// Ball — alohida hisob-kitob birligi (Coin/CoinTxn'ga MUTLAQO TEGMAYDI).
//
// 🔄 2026-08-02 (ega talabi — "sovg'alarni ham yasash kerak, nimaga fixed qilingan"): sovrin-
// katalog ENDI to'liq admin-boshqariladigan — statik 5-elementli ro'yxat + alohida narx/limit-
// knob emas. Butun katalog BITTA AppState qatorida (`oyin:catalog`, oyinService.ts) — admin
// panelda yangi sovrin QO'SHISH, mavjudini narxi/soni/nomi/rasmi bilan TAHRIRLASH, faollikni
// O'CHIRISH/YOQISH mumkin. Narx/limit ENDI BONUS_ECON_KNOBS'da EMAS (o'sha 10 knob olib
// tashlandi) — har sovrinning o'z qatorida to'g'ridan-to'g'ri saqlanadi. Yangi Prisma model YO'Q.

export type OyinPrizeKey = string; // ochiq kalit — admin istagan sovrin qo'sha oladi

export interface OyinCatalogPrize {
  key: string;
  icon: string; // emoji — rasm sozlanmaganda/yuklanmasa fallback
  name: string;
  valueLabel: string; // taxminiy real narx — faqat ko'rsatish uchun, hisobga kirmaydi
  price: number; // chipta ball-narxi
  limit: number; // chipta-o'rin soni (N-limit)
  photoUrl: string | null;
  active: boolean; // false = vitrinada/xariddan yashiringan, lekin tarixiy yozuvlar (tiraj/
                    // faoliyat-jadval) uchun katalogda QOLADI — hech qachon chin o'chirilmaydi
                    // (sotilgan chiptasi bo'lsa kalit "yetim" bo'lib qolmasin).
}

// Birinchi ishga tushirishda (`oyin:catalog` AppState hali yo'q) shu default bilan urug'lanadi —
// v9.2 rejadagi bazaviy 5 sovrin, o'sha paytdagi narx/limit qiymatlari bilan. Shundan keyin
// TO'LIQ admin qo'lida — bu massiv faqat BIR MARTALIK boshlang'ich holat, keyin o'qilmaydi.
export const OYIN_SEED_CATALOG: OyinCatalogPrize[] = [
  { key: "voucher", icon: "🏷️", name: "30k voucher", valueLabel: "30 000 so'm", price: 600, limit: 15, photoUrl: null, active: true },
  { key: "serviz", icon: "🍵", name: "Choy serviz", valueLabel: "~120 000 so'm", price: 1000, limit: 5, photoUrl: null, active: true },
  { key: "dazmol", icon: "👕", name: "Dazmol", valueLabel: "~180 000 so'm", price: 1500, limit: 4, photoUrl: null, active: true },
  { key: "blender", icon: "🥤", name: "Blender", valueLabel: "~350 000 so'm", price: 2200, limit: 3, photoUrl: null, active: true },
  { key: "fryer", icon: "🍟", name: "Air Fryer", valueLabel: "~800 000 so'm", price: 3200, limit: 1, photoUrl: null, active: true },
];

// Admin: sovrin qo'shish/tahrirlash so'rovi. `key` bo'lsa — o'sha yozuv YANGILANADI; bo'sh/
// topilmasa — YANGI sovrin yaratiladi (server tomonda kalit generatsiya qilinadi).
export interface OyinPrizeUpsertInput {
  key?: string;
  icon: string;
  name: string;
  valueLabel: string;
  price: number;
  limit: number;
  photoUrl: string | null;
}
export interface OyinAdminPrizeRow extends OyinCatalogPrize {
  sold: number; // nazorat uchun — nechta chipta allaqachon sotilgan (o'chirish xavfsizligini ko'rsatadi)
}
export interface OyinDeleteResult {
  ok: boolean;
  reason?: "has_sales"; // sold>0 — chin o'chirish rad etiladi, o'rniga active:false tavsiya qilinadi
}

export interface OyinBallBreakdown {
  rides: number; // birinchi safar bonusi + har keyingi safar (o'zining)
  phone: number; // telefon tasdiqlash (bir martalik)
  referJoin: number; // do'stlar telefon ulaganda (bir martalik, har do'st uchun)
  referFirstRide: number; // do'stlar birinchi safarini qilganda (bir martalik, har do'st uchun)
  referRides: number; // do'stlarning HAR safaridan doimiy oqim (cheksiz)
  login: number; // kunlik kirish
  share: number; // sovrinni ulashish
  story: number; // 📸 tasdiqlangan hikoya-isbotlar (admin ko'rgan, HIKOYA_POSTER_PLAN.md)
  streak: number; // 🔥 3 kunlik zanjir bonuslari
  sprintBonus: number; // haftalik sprint top-3 (§sprintCheck)
  earned: number; // yig'indi (yuqoridagi hammasi)
  spent: number; // chiptalarga sarflangan
  ball: number; // earned − spent (manfiy bo'lmaydi)
}

// ── 📅 MAVSUM (2026-08-02, ega talabi: "har mavsum vaxtlarini ham qo'yish kerak") ────────────────
// Sanalar ENDI konstanta EMAS — admin panelda kiritiladi, `oyin:seasoncfg` AppState qatorida
// saqlanadi (oyinSeason.ts). Eski SEASON_START_ISO/SEASON_END_ISO ATAYLAB o'chirildi va fallback
// sifatida ham qoldirilmadi: qolsa, kelajakda kimdir `?? SEASON_END_ISO` yozib qo'yadi va sana
// yana kodga qotib qoladi.
//
// Ball FAQAT mavsum ichidagi harakatlar uchun beriladi (avval butun umr tarixi sanalardi — 100 ta
// eski safari bor mijoz o'yin boshlanmasdan minglab ballga ega bo'lardi).

export type OyinSeasonPhase = "unset" | "upcoming" | "active" | "ended";

export interface OyinSeasonView {
  configured: boolean; // false = "mavsum sozlanmagan" — o'yin butunlay yopiq
  seasonNo: number; // 1, 2, 3… — FAQAT "toza boshlash" tugmasi oshiradi
  seasonId: string; // `s${seasonNo}` — arxiv prefiksi VA pul-idempotentlik langari
  label: string | null; // ixtiyoriy nom: "Avgust mavsumi"
  startIso: string | null;
  endIso: string | null;
  startMs: number | null;
  endMs: number | null;
  startDayKey: string | null; // Toshkent "YYYY-MM-DD" — kun-ro'yxatlari bilan SATR sifatida solishtiriladi
  endDayKey: string | null;
  startWeekKey: string | null; // "2026-W33" — sprint hafta-kalitlari bilan solishtiriladi
  endWeekKey: string | null;
  phase: OyinSeasonPhase;
}

export interface OyinSeasonInput {
  startIso: string;
  endIso: string;
  label?: string | null;
}

/** Mijozga beriladigan qisqartma (OyinStateResponse ichida) — miniapp sanani API'dan oladi. */
export interface OyinSeasonClientView {
  configured: boolean;
  phase: OyinSeasonPhase;
  label: string | null;
  startIso: string | null;
  endIso: string | null;
}

/** Admin: mavsumni tozalab boshlash natijasi. */
export interface OyinSeasonResetResult {
  ok: boolean;
  error?: string;
  seasonId?: string;
  archivedRows?: number;
}

// Anti-abuz: bitta a'zo 4 haftalik oynada sprint-top-3'ni necha marta yutishi mumkin (whale bitta
// odam hamma haftani yeb qo'ymasin — KOSON_OYIN_PLAN.md v9.x §sprint).
export const SPRINT_MAX_WINS_PER_ROLLING_4W = 2;

export interface OyinSprintWinner {
  memberId: number;
  name: string;
  delta: number; // shu hafta ichida yig'ilgan ball
}
export interface OyinSprintResult {
  weekKey: string;
  winners: OyinSprintWinner[];
}

export interface OyinDrawTicketRow {
  prizeKey: OyinPrizeKey;
  ticketNo: number;
  memberId: number;
  name: string;
}
export interface OyinDrawExport {
  generatedAt: string;
  tickets: OyinDrawTicketRow[];
}

export interface OyinSeasonCloseResult {
  convertedCount: number;
  totalTanga: number;
}

// ── Admin faoliyat-jadvali (B3) — ball JONLI hisoblanadi (B2), demak bu yerda tayyor "voqealar
// jurnali" YO'Q. Har qator quyidagi manbalardan REKONSTRUKSIYA qilinadi: RideReward (ride/
// first_ride), Referral (refer_join/refer_first_ride/refer_ride), AppState kunlik-markerlar
// (login/share), sprint-g'alaba (sprint_bonus), chipta-xarid (ticket_buy, ball manfiy = sarf). ──
export const OYIN_ACTIVITY_ACTIONS = [
  "ride", "first_ride", "phone",
  "refer_join", "refer_first_ride", "refer_ride",
  "login", "share", "story", "streak", "sprint_bonus", "ticket_buy",
] as const;
export type OyinActivityAction = (typeof OYIN_ACTIVITY_ACTIONS)[number];

export interface OyinActivityRow {
  at: string; // ISO
  memberId: number;
  name: string;
  action: OyinActivityAction;
  ball: number; // musbat = keldi, manfiy = sarflandi (ticket_buy)
  helpedMemberId: number | null; // "yordam-zanjiri" juftligi — refer_* harakatlarda to'ldiriladi
  helpedName: string | null;
  note: string | null;
}
export interface OyinActivityFilter {
  memberId?: number;
  action?: OyinActivityAction;
  from?: string; // ISO
  to?: string; // ISO
  page?: number;
  pageSize?: number;
  // "season" (default) = faqat joriy mavsum — jadval reyting bilan KELISHADI. "all" = butun tarix
  // (mavsumgacha bo'lgan davrni ko'rishning yagona yo'li, faqat tekshiruv uchun).
  scope?: "season" | "all";
}
export interface OyinActivityResponse {
  rows: OyinActivityRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface OyinSponsorView {
  name: string;
  photoUrl: string | null;
}

export interface OyinStateResponse {
  ball: number;
  breakdown: OyinBallBreakdown;
  rank: number | null; // null = hali reytingda emas (ball=0)
  sponsor: OyinSponsorView;
  // "Eng tez yo'l" tavsiyasi uchun — mijoz bu sonlarni HARDCODE qilmasin (admin-knob o'zgarsa
  // matn eskirib qolmasin), server joriy knob-qiymatlarini shu yerda beradi.
  // "Ball qanday yig'iladi" varag'i uchun TO'LIQ jadval — mijoz eng foydali harakatni bilishi
  // shart. Avval faqat 4 tasi kelardi va ekranda eng katta mukofot (do'st birinchi safari)
  // umuman ko'rinmasdi.
  hints: {
    referComboBall: number; // referJoin + referFirstRide (fastPath hisobi shu bilan)
    rideBall: number;
    firstRideBall: number;
    phoneBall: number;
    loginBall: number;
    shareBall: number;
    referJoinBall: number;
    referFirstRideBall: number;
    referRideBall: number;
    streakBall: number;
    storyBall: number;
  };
  // 🎯 "Bugungi maqsad" halqasi — REAL holat (soxta emas): login = oyin:login kun-ro'yxati (state
  // so'rovining o'zi markLogin qiladi, shuning uchun ochilgan zahoti ✓ — bu ataylab: "kirish" vazifasi
  // shu), rides = bugungi RideReward soni, shared/referJoined = ulashish-marker / bugun qo'shilgan do'st.
  today: { login: boolean; rides: number; shared: boolean; referJoined: boolean };
  // 🔴 JONLI lenta: bugungi eng so'nggi do'st-taklif voqeasi (butun populyatsiya bo'ylab) — ijtimoiy
  // isbot. null = bugun hali hech kim do'st qo'shmadi.
  live: { name: string; ball: number } | null;
  // 🔥 Haftalik vazifa (prototipdagi "3 kunlik zanjir" bloki). Yangi saqlash YO'Q — zanjir mavjud
  // `oyin:login:<memberId>` kun-ro'yxatidan ketma-ket kunlarni sanash bilan chiqadi.
  week: { streak: number; target: number; bonusBall: number; done: boolean };
  // 📅 Mavsum holati — miniapp sanani API'dan oladi (shared konstanta endi yo'q).
  season: OyinSeasonClientView;
  // 📸 Hikoya-poster holati (HIKOYA_POSTER_PLAN.md).
  story: OyinStoryState;
}

// ── 📸 HIKOYA-POSTER ─────────────────────────────────────────────────────────────────────────
export type OyinStoryStatus = "pending" | "approved" | "rejected";

export interface OyinStoryItem {
  id: string;
  url: string;
  at: string; // ISO — mavsum filtri shu bo'yicha
  status: OyinStoryStatus;
  reviewedAt: string | null;
  reason: string | null; // rad etilganda sabab (mijozga aynan shu matn boradi)
}

/** Mijoz ko'radigan holat: nechta tasdiqlangan, qancha qoldi, kutilayotgani bormi. */
export interface OyinStoryState {
  approved: number; // shu mavsumda tasdiqlangan
  limit: number; // mavsumdagi eng ko'p soni
  pending: boolean; // hozir tekshiruvda turgani bormi
  ballEach: number; // bittasi uchun ball (oyinStoryProofBall knobi)
  lastRejectReason: string | null; // oxirgi rad sababi — mijoz nimani tuzatishini bilsin
  texts: string[]; // admin sozlagan poster matnlari (o'rin-egallar ALMASHTIRILGAN holda)
}

export interface OyinStorySubmitResult {
  ok: boolean;
  reason?: "off" | "season_off" | "limit" | "pending" | "bad_url" | "duplicate";
}

/** Admin moderatsiya jadvali qatori. */
export interface OyinStoryAdminRow extends OyinStoryItem {
  memberId: number;
  name: string;
  approvedInSeason: number; // shu mijoz mavsumda nechtasini tasdiqlatgan
  hoursWaiting: number; // 24 dan oshgani panelda QIZIL
}

/** Admin sozlaydigan poster matni. `{ism}` / `{chipta}` / `{sovrin}` o'rin-egallari. */
export interface OyinPosterText {
  id: string;
  text: string;
  active: boolean;
}

export interface OyinPrizeView {
  key: OyinPrizeKey;
  icon: string;
  name: string;
  valueLabel: string;
  price: number;
  limit: number;
  sold: number;
  remaining: number;
  soldOut: boolean;
  mine: number; // shu foydalanuvchining shu sovringa nechta chiptasi bor
  chancePct: number | null; // null = hali chiptasi yo'q; aks holda mine/sold %
  photoUrl: string | null; // admin qo'ygan real rasm — null bo'lsa `icon` emoji fallback ishlatiladi
}

/** 👀 Mehmon (raqami ulanmagan) ko'radigan teaser — a'zo ma'lumoti YO'Q, hammasi ochiq axborot.
 *  Taklif havolasi orqali kelgan odam sovrinlarni ko'rishi uchun (aks holda u Do'kon ro'yxatiga
 *  tushib qolardi va o'yin haqida hech narsa ko'rmasdi). */
export interface OyinTeaserResponse {
  season: OyinSeasonClientView;
  sponsor: OyinSponsorView;
  prizes: { key: string; icon: string; name: string; valueLabel: string; price: number; limit: number; photoUrl: string | null }[];
}

export interface OyinVitrinaResponse {
  prizes: OyinPrizeView[];
  sponsor: OyinSponsorView;
}

export interface OyinBoardRow {
  pos: number;
  name: string;
  ball: number;
  me: boolean;
}
export interface OyinBoardResponse {
  rows: OyinBoardRow[];
  myPos: number | null;
}

export type OyinFriendStatus = "active_today" | "silent" | "never_rode";
export interface OyinFriendRow {
  memberId: number; // "Rahmat ayt" tugmasi shu id bo'yicha yuboradi (server juftlikni tekshiradi)
  name: string;
  status: OyinFriendStatus;
  daysSilent: number; // faqat status="silent" bo'lganda ma'noli
  gainToday: number; // bugun shu do'stdan taklifchiga kelgan ball
  ridesToday: number; // bugungi safarlar soni — "3-safarini qildi!" matni uchun
  thankedToday: boolean; // bugun rahmat aytilganmi (tugma "✓ Aytildi" holatida chiqadi)
}
/** "🤝 Rahmat ayt" natijasi — do'stning Telegram'iga botdan xabar boradi. */
export interface OyinThanksResult {
  ok: boolean;
  reason?: "not_friend" | "already" | "unreachable" | "off";
}
export interface OyinJamoamResponse {
  friends: OyinFriendRow[];
  totalBall: number; // shu do'stlar orqali jami kelgan ball (referJoin+referFirstRide+referRides)
}

export interface OyinBuyResult {
  ok: boolean;
  // `season_off` — mavsum sozlanmagan/boshlanmagan/tugagan. `off` dan FARQ qiladi (bayroq) va
  // `insufficient` deb aytish YOLG'ON bo'lardi — mijozga balansi haqida noto'g'ri xabar bermaymiz.
  reason?: "insufficient" | "sold_out" | "unknown_prize" | "off" | "season_off" | "own_limit";
  ticketNo?: number;
  prizeKey?: OyinPrizeKey;
  ballLeft?: number;
}
