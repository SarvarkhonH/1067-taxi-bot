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
/** 💰 BALL SHKALASI — 1 ball = shuncha so'm SOF daromad (ega raqami: buyurtmadan 2000 so'm).
 *  Butun iqtisod shu bitta sondan chiqadi: safar bali ham, sovrin narxi ham. */
export const OYIN_SOM_PER_BALL = 10;

/** 🎯 BirJoy'ning sovrin xarajati — o'sha sovrin uchun kassaga kelgan daromadning necha foizi.
 *  15% — sog'lom marketing byudjeti. Bu YAGONA dial: qolgan hamma raqam undan chiqadi. */
export const OYIN_TARGET_COST_PCT = 15;

/** 🎟 Yangi sovrin uchun taklif etiladigan boshlang'ich chipta-o'rin soni. */
export const OYIN_DEFAULT_SLOTS = 20;

/** ⚠️ Bitta o'yinchi bir mavsumda yig'a oladigan REAL eng katta ball (kuchli profil:
 *  kuniga 1 safar + 20 faol do'st). Chipta narxi bundan oshsa sovrin O'LIK ZAXIRA bo'ladi. */
export const OYIN_MAX_REALISTIC_BALL = 25_000;

export interface OyinPrizePlan {
  ballPrice: number; // chipta ball-narxi
  bringsSom: number; // chipta egasi kassaga olib kelgan sof daromad
  costPct: number; // BirJoy xarajati — kelgan daromadning %
  minSlots: number; // shu qiymat uchun eng kam chipta-o'rin (aks holda hech kim ola olmaydi)
  reachable: boolean; // real o'yinchi bir mavsumda yeta oladimi
}

/** 📐 SOVRIN REJASI — ega qiymat va chipta sonini kiritadi, qolgani AVTOMATIK.
 *
 *  Formula: `P = V / (α × N × K)` — bunda V qiymat (so'm), α xarajat ulushi, N chipta-o'rin,
 *  K = so'm/ball. Ya'ni: N ta chipta × P ball × K so'm = kelgan daromad; undan α ulushi sovrin.
 *
 *  ⚠️ ENG MUHIM: **chipta soni = sizning xarajat foizingiz**. Kam chipta → qimmat chipta →
 *  hech kim ola olmaydi. 1 mln so'mlik TV 4 chipta bilan 166 700 ball bo'ladi (833 safar!),
 *  33 chipta bilan esa 20 000 ball (10 faol do'stli odamning bir oylik ishi). */
export function oyinPrizePlan(valueSom: number, slots: number, targetPct = OYIN_TARGET_COST_PCT): OyinPrizePlan {
  const v = Number(valueSom);
  const n = Math.max(1, Math.round(Number(slots) || 0));
  const a = Math.max(1, Math.min(100, targetPct)) / 100;
  if (!Number.isFinite(v) || v <= 0) return { ballPrice: 0, bringsSom: 0, costPct: 0, minSlots: 1, reachable: true };
  // Narx 100 ballgacha yaxlitlanadi — ekranda o'qish oson bo'lsin.
  const ballPrice = Math.max(100, Math.round(v / (a * n * OYIN_SOM_PER_BALL) / 100) * 100);
  const bringsSom = ballPrice * OYIN_SOM_PER_BALL;
  const costPct = (v / (n * ballPrice * OYIN_SOM_PER_BALL)) * 100;
  // Narx real chegaradan oshmasligi uchun kerak bo'lgan eng kam chipta soni.
  const minSlots = Math.max(1, Math.ceil(v / (a * OYIN_MAX_REALISTIC_BALL * OYIN_SOM_PER_BALL)));
  return { ballPrice, bringsSom, costPct, minSlots, reachable: ballPrice <= OYIN_MAX_REALISTIC_BALL };
}

/** Eski chaqiruvchilar uchun: standart o'rin soni bilan narx. */
export function oyinBallPrice(valueSom: number): number {
  return oyinPrizePlan(valueSom, OYIN_DEFAULT_SLOTS).ballPrice;
}

// Katalog SHU FORMULA bilan qayta hisoblangan (ega qarori 2026-08-03). Har qatorda chipta
// egasi kassaga qancha pul olib kelgani ham yozilgan — bu tekshirib turish uchun.
export const OYIN_SEED_CATALOG: OyinCatalogPrize[] = [
  // qiymat ÷ 30 = ball · chipta egasi olib kelgan sof daromad = ball × 10 so'm
  // narx = qiymat ÷ (15% × o'rin × 10 so'm) · o'rin soni qimmat sovrinda KO'PROQ bo'lishi shart
  { key: "voucher", icon: "🏷️", name: "30 000 so'mlik voucher", valueLabel: "30 000 so'm", price: 1000, limit: 20, photoUrl: null, active: true },
  { key: "serviz", icon: "🍵", name: "Choy serviz", valueLabel: "120 000 so'm", price: 4000, limit: 20, photoUrl: null, active: true },
  { key: "dazmol", icon: "👕", name: "Dazmol", valueLabel: "180 000 so'm", price: 6000, limit: 20, photoUrl: null, active: true },
  { key: "blender", icon: "🥤", name: "Blender", valueLabel: "350 000 so'm", price: 11700, limit: 20, photoUrl: null, active: true },
  { key: "pech", icon: "🔥", name: "Mikroto'lqinli pech", valueLabel: "500 000 so'm", price: 16700, limit: 20, photoUrl: null, active: true },
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
  // ⚠️ 2026-08-03 QO'SHILDI. `quest`/`home` ball BERARDI va `earned` ichiga qo'shilardi, lekin
  // o'z maydoni YO'Q edi — ya'ni `earned` yuqoridagi maydonlar YIG'INDISIGA TENG EMASDI. Bu jim
  // tuzoq: "ball qanday yig'ildi" ekranini yozgan odam komponentlarni qo'shib jamini chiqarardi
  // va raqam serverning `earned`idan kam bo'lib qolardi (mijoz uchun — yo'qolgan ball).
  quest: number; // 🎯 kunlik topshiriqlar (oyinDailyQuestBall × bajarilgan kunlar)
  home: number; // 🏠 ilovani ekranga o'rnatish (mavsumda bir marta)
  story: number; // 📸 tasdiqlangan hikoya-isbotlar (admin ko'rgan, HIKOYA_POSTER_PLAN.md)
  streak: number; // 🔥 3 kunlik zanjir bonuslari
  sprintBonus: number; // haftalik sprint top-3 (§sprintCheck)
  // 🛠 Admin qo'lda tuzatgan ball (musbat = qo'shildi, manfiy = olindi). Sabab MAJBURIY va
  // audit-logga tushadi. `earned` ichida — ya'ni yuqoridagi maydonlar yig'indisi baribir
  // `earned` ga teng qoladi (o'sha invariantni buzmaslik uchun alohida maydon).
  adjust: number;
  earned: number; // yig'indi (yuqoridagi HAMMASI — yangi manba qo'shilsa maydoni ham qo'shiladi)
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

// ── 🎯 KUNLIK TOPSHIRIQ (ega talabi 2026-08-03: "har kuni random") ───────────────────────────
// Har mijozga har kuni BITTA topshiriq beriladi. Tanlov DETERMINISTIK: (memberId + kun) dan
// hisoblanadi — sahifa yangilanganda o'zgarmaydi, ertaga o'zi almashadi, va o'tgan kun uchun
// ham qayta hisoblab topish mumkin (hech narsa saqlanmaydi).
//
// ⚠️ To'plamga faqat SERVER TEKSHIRA OLADIGAN topshiriqlar kiradi. Ega taklif qilgan
// "Telegram guruhga tashla" ATAYLAB YO'Q — uni tekshirib bo'lmaydi, ya'ni ball ishonchga
// berilardi va soxta bajarish uchun ochiq eshik bo'lardi.
export type OyinQuestKey = "ride2" | "ride_share" | "friend_ride" | "invite" | "story";

export interface OyinQuestDef {
  key: OyinQuestKey;
  icon: string;
  title: string;
  hint: string;
}

// ⛔ 2026-08-03: `story` to'plamdan OLIB TASHLANDI (kalit tipda QOLDI — eski javoblar/`switch`lar
// buzilmasin). Sabab — yuqoridagi QOIDANING O'ZI: hikoyani SERVER tekshira olmaydi, uni ODAM
// (admin) tekshiradi, ya'ni "bajarildi" belgisi ishonchga qo'yilardi. Ikkita aniq zarar bor edi:
//  1. `done` sharti `storyState.approved > 0` edi — u MAVSUM bo'yicha sanaladi. Mavsumda BIR
//     MARTA hikoya tasdiqlatgan mijoz shundan keyin `story` tushgan HAR kuni hech narsa
//     qilmasdan "bajarildi" oladi (+100 ball/kun, cheksiz bepul oqim).
//  2. Kun bo'yicha kesilganda ham teshik qolardi: "yuborildi" = bajarildi bo'lgani uchun har
//     kuni yangi (noyob) t.me havolasini tashlab, admin rad etsa ham kunlik 100 ball olinardi.
// Hikoya HARAKATI mukofotsiz qolmaydi: o'z yo'li bilan `oyinStoryProofBall` (mavsumda 3 tagacha)
// ADMIN TASDIG'IDAN KEYIN to'lanadi — ya'ni ball haqiqiy, tekshirilgan ish uchun beriladi.
export const OYIN_QUEST_POOL: OyinQuestDef[] = [
  { key: "ride2", icon: "🚕", title: "Bugun 2 ta safar qiling", hint: "Ikkinchi safar topshiriqni yopadi" },
  { key: "ride_share", icon: "📤", title: "1 safar qiling va havolangizni ulashing", hint: "Ikkalasi ham bugun bajarilsin" },
  { key: "friend_ride", icon: "🤝", title: "Do'stingiz bugun safar qilsin", hint: "Ularga ayting — sizga ham ball tushadi" },
  { key: "invite", icon: "👥", title: "Yangi do'st chaqiring", hint: "U raqamini ulasa topshiriq yopiladi" },
];

/** Kun + a'zo bo'yicha DETERMINISTIK tanlov. Sof funksiya — server ham, mijoz ham bir xil
 *  javob oladi va o'tgan kunlar uchun ham qayta hisoblanadi. */
export function oyinQuestOf(memberId: number, dayKey: string): OyinQuestDef {
  let h = 2166136261;
  const src = `${memberId}:${dayKey}`;
  for (let i = 0; i < src.length; i++) { h ^= src.charCodeAt(i); h = Math.imul(h, 16777619); }
  const idx = Math.abs(h) % OYIN_QUEST_POOL.length;
  return OYIN_QUEST_POOL[idx] as OyinQuestDef;
}

/** Mijoz ko'radigan bugungi topshiriq holati. */
export interface OyinQuestState {
  key: OyinQuestKey;
  icon: string;
  title: string;
  hint: string;
  ball: number;
  done: boolean;
}

/** 🏠 Doimiy topshiriq — ilovani telefon ekraniga o'rnatish (ega talabi: "umuman ketmaydigan").
 *  Telegram `addToHomeScreen` + `homeScreenAdded` hodisasi bilan tasdiqlanadi — taxmin yo'q. */
export interface OyinHomeTask {
  ball: number;
  done: boolean;
  // ⛔ `supported` OLIB TASHLANDI (2026-08-03). Server qotirilgan `true` qaytarardi — ya'ni API
  // BILMAYDIGAN narsasini da'vo qilardi (klient Bot API versiyasi FAQAT klientda ma'lum).
  // Hozir zarari yo'q edi, chunki miniapp baribir o'zining `checkHomeScreenStatus()` javobini
  // ishlatadi (miniapp/src/oyin.tsx:269 `setHomeSupported(st !== "unsupported")`), lekin qolsa
  // ertaga kimdir shu yolg'on maydonga ishonib topshiriqni ko'rsatib qo'yardi.
}

/** 🔒 FINAL-48: mavsum tugashiga shuncha qolganda chipta olish YOPILADI.
 *  Bu son SERVER va MIJOZ uchun BITTA joyda turadi — aks holda ekran "muzlagan" deb yozadi,
 *  server esa sotaveradi (aynan shu bug topilgan: bir mijoz ishonib ballini sarflamaydi,
 *  ikkinchisi o'sha tugmani bosib chiptani oladi). Qulf sababi: tiraj oldidan ro'yxat qotishi
 *  kerak — oxirgi soniyada olingan chipta eksportga tushmay qolishi mumkin. */
export const OYIN_FINAL_LOCK_MS = 48 * 3600_000;

/** 📸 Bitta a'zo bitta mavsumda nechta hikoya-isboti uchun ball ola oladi.
 *  IKKI joyda qo'llanadi: yuborishda (`oyinStory.submitStory`) VA ball hisobida
 *  (`computeBallMap`) — ikkinchisi ikkinchi qavat himoya: admin xato bilan limitdan
 *  ortiq tasdiqlasa yoki mavsum oynasi kengaytirilsa ball cheklovsiz o'smasin. */
export const OYIN_STORY_SEASON_LIMIT = 3;

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
  // 🔒 Tiraj muzlatilganmi va qachon. Muzlatilgan ro'yxat — jonli efirda o'qish uchun yagona
  // ishonchli holat: undan keyin hech kim (EGA HAM) chipta qo'sha olmaydi.
  frozenAt: string | null;
  // Eksportdan CHIQARILGANLAR — yashirilmaydi, ochiq sanaladi (nechta test chipta, nechta
  // chetlatilgan a'zo chiptasi). "Ro'yxat qisqartirilgan" ayblovi raqam bilan javob topadi.
  excludedTest: number;
  excludedBanned: number;
}

// ── 🛠 ADMIN NAZORATI (ega talabi 2026-08-03: "oddiy kuzatuv emas") ────────────────────────────
/** Bitta a'zoning TO'LIQ o'yin holati — 12 ta ball manbai alohida, chiptalari, jazolari. */
export interface OyinAdminMemberDetail {
  memberId: number;
  name: string;
  telegramId: string | null;
  ball: number; // joriy balans (earned − spent)
  earned: number;
  spent: number;
  seasonRides: number;
  breakdown: OyinBallBreakdown;
  banned: boolean;
  banReason: string | null;
  tickets: OyinMyTicket[];
  adjustLog: OyinBallAdjustEntry[];
}
export interface OyinBallAdjustEntry {
  ball: number; // musbat = qo'shildi, manfiy = olindi
  reason: string;
  at: string; // ISO
}
/** ⚠️ `reason` MAJBURIY va bo'sh bo'lmaydi — sababsiz ball harakati keyin tekshirib bo'lmaydigan
 *  pul izi qoldiradi (audit-log ham shuni yozadi). */
export interface OyinBallAdjustInput {
  memberId: number;
  ball: number;
  reason: string;
}
export interface OyinAdminActionResult {
  ok: boolean;
  reason?: "not_found" | "bad_input" | "frozen" | "not_ticket";
  ball?: number; // yangi balans (ball tuzatishdan keyin)
}
/** 🔒 Tiraj muzlatish holati. Muzlatilgach chipta xaridi HAMMA uchun yopiladi (ega ham). */
export interface OyinFreezeState {
  frozen: boolean;
  at: string | null;
  ticketCount: number; // muzlatilgan lahzada tirajdagi chipta soni
}

export interface OyinSeasonCloseResult {
  convertedCount: number;
  totalTanga: number;
}

// ── Admin faoliyat-jadvali (B3) — ball JONLI hisoblanadi (B2), demak bu yerda tayyor "voqealar
// jurnali" YO'Q. Har qator quyidagi manbalardan REKONSTRUKSIYA qilinadi: RideReward (ride/
// first_ride va undan chiqadigan streak), Referral (refer_join/refer_first_ride/refer_ride),
// AppState kunlik-markerlar (login/share/quest/home), sprint-g'alaba (sprint_bonus), chipta-xarid
// (ticket_buy, ball manfiy = sarf).
//
// ⚠️ QOIDA: bu ro'yxat `computeBallMap` dagi ball-manbalari bilan BIR XIL bo'lishi SHART. Buzilgan
// holat (2026-08-03 da topildi): `quest` va `home` ball BERARDI (oyinDailyQuestBall /
// oyinHomeScreenBall), lekin bu ro'yxatda ham, `getActivity` chiqishida ham YO'Q edi — mijozning
// qo'ng'irog'ida ham, admin jadvalida ham ko'rinmasdi, ya'ni "jadval reyting bilan kelishadi"
// da'vosi yolg'on bo'lardi (500 ball qayerdan kelgani hech qayerda yozilmagan). `streak` ro'yxatda
// BOR edi-yu, `getActivity` uni chiqarmasdi — o'sha kasallikning ikkinchi ko'rinishi.
export const OYIN_ACTIVITY_ACTIONS = [
  "ride", "first_ride", "phone",
  "refer_join", "refer_first_ride", "refer_ride",
  "login", "share", "quest", "home", "story", "streak", "sprint_bonus", "ticket_buy",
  // 🛠 Admin qo'lda tuzatgan ball. Ball BERADI (yoki OLADI), demak shu ro'yxatda BO'LISHI SHART —
  // aks holda mijozning qo'ng'irog'ida "ball qayerdan keldi" savoli javobsiz qolardi.
  "adjust",
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
    // ⚖️ Bitta odam bitta sovrindan ola oladigan eng ko'p chipta (admin knobi). Mijoz buni
    // XARIDDAN OLDIN bilishi kerak — avval faqat urilib bo'lgandan keyin, raqamsiz aytilardi.
    maxPerPrize: number;
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
  // 🎟 Mavsumda olingan chipta soni.
  ticketCount: number;
  // 🎯 Bugungi topshiriq va 🏠 doimiy topshiriq (ega talabi 2026-08-03).
  quest: OyinQuestState | null; // null = mavsum faol emas
  homeTask: OyinHomeTask;
  // 📊 UY EKRANI uchun UMUMIY (shaxsiy EMAS) raqamlar. Ega qarori 2026-08-03: uy ekranida
  // mijozning o'z balli/o'rni KO'RSATILMAYDI — u yerda TAKLIF turadi. Bular esa ijtimoiy
  // isbot: "624 chipta tarqatildi" = boshqalar ham olyapti degan signal.
  soldTotal: number; // mavsumda jami tarqatilgan chipta
  capacityTotal: number; // katalogdagi jami chipta-o'rin
  prizeCount: number; // faol sovrinlar soni ("8 TA REAL SOVG'A")
  // 🚕 Mavsumdagi REAL safarlar SONI (ball emas!). Ikki joyda kerak: (a) mavsum yakunida
  // "ball tangaga aylanadimi?" — server sharti aynan shu SON (`seasonRides > 0`), ball emas;
  // (b) chipta olish darvozasi. Avval ekran `breakdown.rides` (=SAFAR BALI) ni o'qirdi va
  // safar bali 0 ga sozlangan bo'lsa 12 marta yurgan mijozga "safaringiz yo'q" derdi.
  seasonRides: number;
  // 🎯 Mijoz TANLAGAN maqsad-sovrin (YAKUNIY DIZAYN §1). null = tanlamagan → eng arzoni.
  // Hero shunga qarab chiziladi: "660 ball qoldi — Choy serviz". Mavhum "340 ball" o'rniga.
  goalPrizeKey: string | null;
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

/** 🎟 Mijozning MAVSUM chiptalari. Avval chipta raqami bayram-oynasida bir marta ko'rinib
 *  abadiy yo'qolardi — odam 600 ball to'lab qo'lida hech narsa qolmasdi. */
export interface OyinMyTicket {
  gno: number; // 🎟 GLOBAL noyob raqam (№ 729475) — chipta "ko'rinadigan buyum" bo'lgani uchun
  prizeKey: string;
  prizeName: string;
  prizeIcon: string;
  photoUrl: string | null;
  no: number; // sovrin ichidagi ketma-ket raqam
  at: string; // ISO — qachon olingan
  price: number; // o'sha paytdagi narx (keyin o'zgarsa ham tarix saqlanadi)
  // 🧪 TEST chipta (ega/admin sinovi). Ekranda ochiq belgilanadi va TIRAJGA KIRMAYDI.
  // Yashirilmaydi — yashirilgan test chipta "ega o'z tirajida qatnashdi" ayblovini keltiradi.
  test?: boolean;
}
export interface OyinMyTicketsResponse {
  tickets: OyinMyTicket[];
  drawIso: string | null; // mavsum tugash sanasi — "tiraj qachon" savoliga javob
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
  // ⚠️ 2026-08-03: avval hamma nosozlik BITTA `unreachable` ga qulardi va ekran "do'stingiz
  // botni bloklagan bo'lishi mumkin" deb yozardi. Amalda eng ko'p uchraydigan sabab BLOK EMAS,
  // balki kunlik push limiti edi (notifyService `DAILY_PUSH_CAP = 2` — safar bildirishnomalari
  // ham shu limitni yeydi). Mijozga yolg'on sabab aytilardi. Endi har biri alohida:
  //   `blocked`    — do'st botni rostan bloklagan
  //   `notify_off` — do'st bildirishnomalarni o'chirgan
  //   `no_chat`    — do'stning Telegram yozuvi yo'q (bot bilan hech qachon gaplashmagan)
  //   `unreachable`— boshqa nosozlik (bot yo'q, Telegram xatosi)
  reason?: "not_friend" | "already" | "blocked" | "notify_off" | "no_chat" | "unreachable" | "off";
}
export interface OyinJamoamResponse {
  friends: OyinFriendRow[];
  totalBall: number; // shu do'stlar orqali jami kelgan ball (oneTimeBall + rideBall)
  // ⚠️ IKKITA SUMMA ALOHIDA (YAKUNIY DIZAYN §7). Bitta yig'indi o'yinning ASOSIY g'oyasini
  // yashiradi: bir martalik bonus tugaydi, do'st safaridan keladigan OQIM esa tugamaydi.
  // Mijoz shu farqni raqamda ko'rmasa "do'st chaqirish" bir martalik ish bo'lib tuyuladi.
  oneTimeBall: number; // do'st ulandi + birinchi safari (referJoin + referFirstRide)
  rideBall: number; // do'stlarning har safaridan (referRides) — cheksiz oqim
}

export interface OyinBuyResult {
  ok: boolean;
  // `season_off` — mavsum sozlanmagan/boshlanmagan/tugagan. `off` dan FARQ qiladi (bayroq) va
  // `insufficient` deb aytish YOLG'ON bo'lardi — mijozga balansi haqida noto'g'ri xabar bermaymiz.
  // `final_lock` — mavsum tugashiga <48 soat qoldi, ro'yxat tirajga qotdi (OYIN_FINAL_LOCK_MS).
  // `no_ride` — mavsumda birorta ham real safar yo'q. Chipta SOVRIN yo'li ham, tanga PUL yo'li
  // ham bir xil shartga bo'ysunadi (avval faqat pul yo'li qo'riqlangan edi).
  // `banned` — a'zo o'yindan chetlatilgan (admin qarori). `frozen` — tiraj muzlatilgan: ro'yxat
  // qotdi, hech kim (EGA HAM) yangi chipta ola olmaydi.
  // ⚠️ `staff` ENDI QAYTARILMAYDI — ega/admin xaridi to'silish o'rniga TEST-CHIPTA bo'ladi
  // (`test:true`, `drawExport` dan chiqarilgan). Union'da moslik uchun qoldirildi.
  reason?: "insufficient" | "sold_out" | "unknown_prize" | "off" | "season_off" | "own_limit" | "final_lock" | "no_ride" | "staff" | "banned" | "frozen";
  // 🧪 Bu xarid TEST edi — ega/admin butun oqimni sinaydi, chipta esa tirajga KIRMAYDI va
  // mijozlarning sovrin-o'rinlarini YEMAYDI (alohida hisoblagich).
  test?: boolean;
  ticketNo?: number;
  // 🎟 Bayram-oynasi ko'rsatadigan raqam — MIJOZ KEYIN CHIPTALARIM'da ko'radigan raqamning
  // AYNAN O'ZI bo'lishi shart. Avval bayramda sovrin-ichi tartib raqami ("№0002"), ro'yxatda
  // esa global raqam ("№ 729476") chiqardi — bitta chipta ikki xil raqam bilan.
  gno?: number;
  prizeKey?: OyinPrizeKey;
  ballLeft?: number;
}
