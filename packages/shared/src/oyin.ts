// 🎮 KOSON O'YINI — tiplar + sovrin-katalog (KOSON_OYIN_PLAN.md v9.2, KOSON_ADMIN_DOD.md).
// Ball — alohida hisob-kitob birligi (Coin/CoinTxn'ga MUTLAQO TEGMAYDI). Narx/limit qiymatlari
// `BONUS_ECON_KNOBS`dan (economy.ts) o'qiladi — bu yerda faqat qaysi knob-kalit qaysi sovringa
// tegishli ekanini bog'laydigan statik xarita, sonlarning o'zi emas (admin panel jonli boshqaradi).

export type OyinPrizeKey = "voucher" | "serviz" | "dazmol" | "blender" | "fryer";

export interface OyinPrizeDef {
  key: OyinPrizeKey;
  icon: string;
  name: string;
  valueLabel: string; // taxminiy real narx — faqat ko'rsatish uchun, hisobga kirmaydi
  priceKnob: string; // BONUS_ECON_KNOBS kaliti — chipta ball-narxi
  limitKnob: string; // BONUS_ECON_KNOBS kaliti — chipta-o'rin soni (N-limit)
}

// Tartib muhim: vitrina/tiraj shu ketma-ketlikda ko'rsatiladi (arzondan qimmatga).
export const OYIN_PRIZES: OyinPrizeDef[] = [
  { key: "voucher", icon: "🏷️", name: "30k voucher", valueLabel: "30 000 so'm", priceKnob: "oyinPriceVoucher", limitKnob: "oyinLimitVoucher" },
  { key: "serviz", icon: "🍵", name: "Choy serviz", valueLabel: "~120 000 so'm", priceKnob: "oyinPriceServiz", limitKnob: "oyinLimitServiz" },
  { key: "dazmol", icon: "👕", name: "Dazmol", valueLabel: "~180 000 so'm", priceKnob: "oyinPriceDazmol", limitKnob: "oyinLimitDazmol" },
  { key: "blender", icon: "🥤", name: "Blender", valueLabel: "~350 000 so'm", priceKnob: "oyinPriceBlender", limitKnob: "oyinLimitBlender" },
  { key: "fryer", icon: "🍟", name: "Air Fryer", valueLabel: "~800 000 so'm", priceKnob: "oyinPriceFryer", limitKnob: "oyinLimitFryer" },
];

export interface OyinBallBreakdown {
  rides: number; // birinchi safar bonusi + har keyingi safar (o'zining)
  phone: number; // telefon tasdiqlash (bir martalik)
  referJoin: number; // do'stlar telefon ulaganda (bir martalik, har do'st uchun)
  referFirstRide: number; // do'stlar birinchi safarini qilganda (bir martalik, har do'st uchun)
  referRides: number; // do'stlarning HAR safaridan doimiy oqim (cheksiz)
  login: number; // kunlik kirish
  share: number; // sovrinni ulashish
  sprintBonus: number; // haftalik sprint top-3 (§sprintCheck)
  earned: number; // yig'indi (yuqoridagi hammasi)
  spent: number; // chiptalarga sarflangan
  ball: number; // earned − spent (manfiy bo'lmaydi)
}

// Mavsum sanalari — ega hali TASDIQLAMAGAN (KOSON_ADMIN_DOD.md ochiq savoli, plan §"Boshlanish
// sanasi?"). Plan taymlaynidagi taklif sifatida qo'yilgan — tasdiqlangach FAQAT shu yerda
// o'zgartiriladi (butun oyinService shu ikki konstantaga qaraydi, boshqa joyda sana yozilmagan).
export const SEASON_START_ISO = "2026-08-15T00:00:00+05:00";
export const SEASON_END_ISO = "2026-09-14T23:59:59+05:00";

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
  "login", "share", "sprint_bonus", "ticket_buy",
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
  hints: { referComboBall: number; rideBall: number };
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
  name: string;
  status: OyinFriendStatus;
  daysSilent: number; // faqat status="silent" bo'lganda ma'noli
  gainToday: number; // bugun shu do'stdan taklifchiga kelgan ball
}
export interface OyinJamoamResponse {
  friends: OyinFriendRow[];
  totalBall: number; // shu do'stlar orqali jami kelgan ball (referJoin+referFirstRide+referRides)
}

export interface OyinBuyResult {
  ok: boolean;
  reason?: "insufficient" | "sold_out" | "unknown_prize" | "off";
  ticketNo?: number;
  prizeKey?: OyinPrizeKey;
  ballLeft?: number;
}
