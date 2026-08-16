// 🎮 KOSON O'YINI — ball hisobi, chipta xaridi, reyting, jamoam (feature "oyin", DARK until owner
// QABUL). KOSON_OYIN_PLAN.md v9.2 + KOSON_ADMIN_DOD.md B2. Ball — alohida hisob-kitob birligi,
// Coin/CoinTxn'ga MUTLAQO TEGMAYDI (aralashtirilsa ≤350 clamp semantikasi buzilishi mumkin).
//
// Ball MANBASI: mavjud jadvallardan (RideReward, Referral, TelegramUser) JONLI hisoblanadi — yangi
// "grant" yozuvi yo'q, shuning uchun bookingNotifier.ts ga tegilmaydi (faqat push-hook qo'shiladi,
// pastda ko'ring). Faqat kunlik-kirish/ulashish va chipta-xarid/sotilgan-son AppState'da yoziladi
// (`oyin:*` prefiks). Yangi Prisma model YO'Q, yangi poller YO'Q (ARCHITECTURE.md invariantlari).
import type { Bot } from "grammy";
import {
  OYIN_CAPACITY_RATIO,
  OYIN_FINAL_LOCK_MS,
  OYIN_CANCEL_WINDOW_MS,
  oyinRiskScore,
  oyinSumInWindow,
  OYIN_JAMOA_MAX,
  OYIN_JAMOA_MIN,
  OYIN_MAX_OPEN_PRIZES,
  OYIN_MIN_SELL_PCT_DEFAULT,
  OYIN_SEED_CATALOG,
  OYIN_TIERS,
  OYIN_SOM_PER_BALL,
  OYIN_SOM_PER_RIDE,
  OYIN_STORY_SEASON_LIMIT,
  OYIN_TARGET_COST_PCT,
  oyinQuestOf,
  SPRINT_MAX_WINS_PER_ROLLING_4W,
  type OyinActivityAction,
  type OyinActivityFilter,
  type OyinActivityResponse,
  type OyinActivityRow,
  type OyinAdminPrizeRow,
  type OyinBallBreakdown,
  type OyinBoardResponse,
  type OyinBuyResult,
  type OyinCancelTicketResult,
  type OyinCatalogPrize,
  type OyinDeleteResult,
  type OyinDrawExport,
  type OyinFriendRow,
  type OyinJamoamResponse,
  type OyinMyTicketsResponse,
  type OyinPrizeKey,
  type OyinPrizeUpsertInput,
  type OyinSeasonCloseResult,
  type OyinSeasonInput,
  type OyinQuestState,
  type OyinSeasonResetResult,
  type OyinSeasonView,
  type OyinSprintResult,
  type OyinStateResponse,
  type OyinTeaserResponse,
  type OyinThanksResult,
  type OyinVitrinaResponse,
  type OyinAdminActionResult,
  type OyinAdminMemberDetail,
  type OyinAdminMemberHit,
  type OyinBudgetView,
  type OyinCapacityView,
  OYIN_BULK_MAX,
  OYIN_SEASON_PLAN_DEFAULT,
  OYIN_SNAPSHOT_MAX,
  type OyinBulkPrizeInput,
  type OyinBulkResult,
  type OyinCardDetail,
  type OyinCatalogSnapshot,
  type OyinPrizeCard,
  type OyinPrizeCardsResponse,
  type OyinAvatarOptInResult,
  type OyinCardVerifyResponse,
  type OyinSeasonPlan,
  type OyinSetCardNoteResult,
  type OyinLeaderRow,
  type OyinVitals,
  type OyinDrawCard,
  type OyinJamoaResult,
  type OyinJamoaView,
  type OyinGashtakSearchHit,
  type OyinJamoaMessageResult,
  type OyinAdminGashtakRow,
  type OyinAdminGashtakDetail,
  type OyinDrawList,
  type OyinDrawRecordResult,
  type OyinPrizeStage,
  type OyinPrizeVelocity,
  type OyinWinner,
  type OyinTier,
  type OyinBallAdjustEntry,
  type OyinBallAdjustInput,
  type OyinFreezeState,
} from "@t1067/shared";
import crypto from "node:crypto";
import { prisma } from "../db";
import { env } from "../env";
import { appBtn } from "../bot/webAppUrl";
import { resolveTelegramFileUrl } from "./driverPhotoService";
import { encodeCardCode, decodeCardCode } from "./cardCode";
import { getBonusEcon } from "./bonusConfig";
import { featureOn } from "./featureFlags";
import { weekKey } from "./missionService";
import { isAdmin } from "./memberService";
import { getSeason, invalidateSeasonCache, setSeason, validateSeasonInput } from "./oyinSeason";
import { getSponsor } from "./sponsorService";

// ── flat-lock — coinService.withMemberLock naqshi (in-memory, bir-jarayonli app; ARCHITECTURE.md
// §5 ogohlantirishi shu yerga ham tegishli — 2-instansiya bo'lsa bu qulf race'ni tutmaydi). ───────
const memberLocks = new Map<number, Promise<unknown>>();
function withMemberLock<T>(memberId: number, fn: () => Promise<T>): Promise<T> {
  const prev = memberLocks.get(memberId) ?? Promise.resolve();
  const run = prev.catch(() => undefined).then(fn);
  memberLocks.set(memberId, run.catch(() => undefined));
  return run;
}

const EMPTY_BREAKDOWN: OyinBallBreakdown = {
  rides: 0, phone: 0, referJoin: 0, referFirstRide: 0, referRides: 0, login: 0, share: 0,
  quest: 0, home: 0, story: 0, streak: 0, sprintBonus: 0, adjust: 0, jamoa: 0, earned: 0, spent: 0, ball: 0,
};

interface MemberBallRow {
  memberId: number;
  telegramId: string;
  name: string;
  seasonRides: number; // mavsum ichidagi safarlar — seasonClose yaroqliligi shundan (ichki, API'da yo'q)
  breakdown: OyinBallBreakdown;
}

interface AppStateRow { key: string; value: string }

// `no` — sovrin ICHIDAGI ketma-ket raqam (N-limit hisobi shunga bog'liq, o'zgarmaydi).
// `gno` — GLOBAL noyob raqam, mijozga ko'rsatiladi (chipta = ko'rinadigan buyum).
// Eski chiptalarda `gno` yo'q — o'sha holda `no` ko'rsatiladi (moslik).
// `test` — ega/admin sinov chiptasi: butun oqim AYNAN mijoznikidek yuriladi, lekin `drawExport`
// uni chiqarib tashlaydi va u mijozlarning sovrin-o'rinlarini YEMAYDI (alohida hisoblagich).
// `result` — 2026-08-06 (ega talabi): g'olib bayonnomaga yozilgach, o'sha sovrindagi BOSHQA
// barcha ishtirokchi kartalar ham "yutuqsiz" deb shu yerga YOZILADI (`adminRecordWinner`).
// Faqat admin+Telegram kanal ko'radi — mijoz ilovasida (`OyinMyTicket`) HECH NARSA
// o'zgarmaydi (ega qarori, ataylab qurilmagan).
// `notifiedLoss` — 2026-08-12: yutmagan kartaga push yuborilgani belgisi. Faqat "lost" uchun
// (g'olibning o'zi alohida `OyinWinner.notifiedAt` bilan kuzatiladi — u yerda telefon/hash
// kabi qo'shimcha bayonnoma ma'lumoti bor, shuning uchun ikkalasi bitta maydonga sig'maydi).
interface TicketRecord {
  prizeKey: OyinPrizeKey; no: number; gno?: number; priceAtPurchase: number; ts: string; test?: boolean;
  result?: "won" | "lost"; notifiedLoss?: boolean;
  // 🗒 2026-08-14 (karta="xotira", K2/K3): egasining ixtiyoriy qaydi. Standart — maxfiy
  // (`notePublic` yo'q/`false`). Uzunlik CHEKLANADI yozishda (`setCardNote`), o'qishda ham
  // qayta cheklanadi (buzuq/eski qator himoyasi — parseTickets qoidasi: hech narsa tashlanmaydi).
  note?: string;
  notePublic?: boolean;
}
const CARD_NOTE_MAX = 140;

// ⚠️ VALIDATSIYA, sof `as` o'girish EMAS. Avval JSON massiv to'g'ridan-to'g'ri `TicketRecord[]`
// deb e'lon qilinardi — tiplar YOLG'ON edi va bitta buzuq qator butun iqtisodni chalkashtirardi:
//  · `priceAtPurchase` SATR bo'lsa (`"100"`) `reduce` uni ULARDI: spent = "0100" → `earned − spent`
//    = NaN → ball NaN → ekranda "NaN ball", chipta tekshiruvi `ball < price` = false → BEPUL chipta.
//  · `no`/`gno` son bo'lmasa mijozning chipta raqami "undefined" ko'rinardi.
// Qoida: qator TASHLANMAYDI (tashlash = sarflangan ball qaytishi, ya'ni ekspluatatsiya yo'nalishi),
// faqat maydonlar xavfsiz qiymatga KELTIRILADI. Buzuq narx baland ovozda log qilinadi.
function parseTickets(raw: string | undefined): TicketRecord[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    const out: TicketRecord[] = [];
    for (const item of arr) {
      if (!item || typeof item !== "object") continue; // son/satr/null — chiptaga tegishli emas
      const t = item as Record<string, unknown>;
      const priceRaw = Number(t.priceAtPurchase);
      if (!Number.isFinite(priceRaw)) {
        console.warn(`[oyin] chiptada buzuq narx: ${String(t.priceAtPurchase)} — 0 deb olindi`);
      }
      const no = Number(t.no);
      const gno = Number(t.gno);
      out.push({
        prizeKey: typeof t.prizeKey === "string" ? t.prizeKey : "",
        no: Number.isFinite(no) ? no : 0,
        ...(Number.isFinite(gno) && gno > 0 ? { gno } : {}),
        priceAtPurchase: Number.isFinite(priceRaw) ? Math.max(0, Math.round(priceRaw)) : 0,
        // `ts` buzuq bo'lsa karta baribir HISOBGA OLINADI (S8 dan keyin davr filtri yo'q; `ts`
        // faqat "oxirgi harakat" hisobida ishlatiladi va u yerda `Date.parse` NaN'ni tashlaydi).
        ts: typeof t.ts === "string" ? t.ts : "",
        // ⚠️ FAQAT qat'iy `true` test hisoblanadi. `"false"`/`0`/`"1"` kabi qiymatlar test
        // BO'LMAYDI — aks holda buzuq qator chiptani jimgina tirajdan chiqarib tashlardi.
        ...(t.test === true ? { test: true as const } : {}),
        // Faqat aniq "won"/"lost" qabul qilinadi — boshqa (buzuq) qiymat "belgilanmagan" deb
        // o'qiladi, mijozga hech qanday soxta natija ko'rsatilmasin.
        ...(t.result === "won" || t.result === "lost" ? { result: t.result } : {}),
        ...(t.notifiedLoss === true ? { notifiedLoss: true as const } : {}),
        ...(typeof t.note === "string" && t.note.trim() ? { note: t.note.trim().slice(0, CARD_NOTE_MAX) } : {}),
        ...(t.notePublic === true ? { notePublic: true as const } : {}),
      });
    }
    return out;
  } catch {
    return [];
  }
}
function parseDayList(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as { days?: unknown };
    return Array.isArray(v.days) ? (v.days as string[]) : [];
  } catch {
    return [];
  }
}
function parseWeekList(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as { weeks?: unknown };
    return Array.isArray(v.weeks) ? (v.weeks as string[]) : [];
  } catch {
    return [];
  }
}
// "2026-W31" → taqqoslash uchun taxminiy chiziqli indeks (moliyaviy aniqlik EMAS — faqat
// "4 haftalik oyna" anti-abuz cheklovi uchun, ISO-hafta 53 chegara holatlari e'tiborsiz qoldirilgan).
// Haftalik surat: MUTLAQ **earned** (YIG'ILGAN) qiymatlar + qaysi mavsumniki. Eski format `null`
// qaytaradi — u joriy mavsum surati sifatida QABUL QILINMAYDI (shkalasi boshqa bo'lishi mumkin).
//
// 🚩 2026-08-03 TUZATILDI — sprint NOTO'G'RI ODAMGA to'lardi. Surat `breakdown.ball` (= QOLDIQ,
// yig'ilgan − sarflangan) saqlardi va delta ham shundan hisoblanardi. Ya'ni hafta ichida chipta
// olgan odamning deltasi MANFIY chiqib `.filter(d => d.delta > 0)` uni chiqarib tashlardi, +300
// ball bonusi esa ball yig'ib HECH NARSA QILMAGANLARGA ketardi — sprint aynan to'g'ri xatti-
// harakatni JAZOLARDI. (Ega shu xatoni reytingda topgan va reyting olib tashlangan; sprintda esa
// QOLGAN edi.) `earned` mavsum ichida faqat O'SADI, sarflash unga TEGMAYDI — hafta-ichi faollikni
// halol o'lchaydigan yagona son shu.
interface WeekSnap { seasonId: string; earned: Record<string, number> }
function parseWeekSnap(raw: string | undefined): WeekSnap | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { seasonId?: unknown; earned?: unknown; ball?: unknown };
    if (typeof v.seasonId !== "string") return null;
    if (!v.earned || typeof v.earned !== "object") {
      // Eski (`ball` = qoldiq) formatdagi surat. BALAND OVOZDA o'tkazib yuboriladi: qoldiqni
      // yig'ilgan bilan solishtirish hammada soxta MUSBAT delta beradi (chipta olganlar bepul
      // g'olib bo'lardi). Pastda o'sha haftaning o'zi `earned` bilan qayta bazalanadi.
      if (v.ball && typeof v.ball === "object") {
        console.warn("[oyin] sprint surati eski `ball` (qoldiq) formatida — o'tkazib yuborildi, `earned` bilan qayta bazalanadi");
      }
      return null;
    }
    return { seasonId: v.seasonId, earned: v.earned as Record<string, number> };
  } catch {
    return null;
  }
}
function weekIndex(wk: string): number {
  const m = /^(\d{4})-W(\d{2})$/.exec(wk);
  if (!m) return 0;
  return Number(m[1]) * 52 + Number(m[2]);
}
function isWithinLast4Weeks(w: string, ref: string): boolean {
  const diff = weekIndex(ref) - weekIndex(w);
  return diff >= 0 && diff < 4;
}
function shortName(tu: { firstName: string | null; lastName: string | null; username: string | null }): string {
  const first = tu.firstName?.trim();
  if (first) return tu.lastName?.trim() ? `${first} ${tu.lastName.trim()[0]}.` : first;
  if (tu.username?.trim()) return `@${tu.username.trim()}`;
  return "Mijoz";
}
// UTC+5 (Toshkent) kun-kaliti — mavjud missionService.dayKey bilan bir xil mantiq, alohida
// import qilinmadi (u boshqa modulning ichki yordamchisi, doiraviy bog'liqlikdan qochish uchun).
function tashkentDayKey(d: Date): string {
  return new Date(d.getTime() + 5 * 3600_000).toISOString().slice(0, 10);
}

/** ⛔ `ticketInSeason` OLIB TASHLANDI (S8, 2026-08-04 — ega qarori «karta abadiy»).
 *
 *  Nega: to'lish-qulfi (mukofot faqat hamma karta sotilganda o'ynaladi) kartalar oylar davomida
 *  yashashini TALAB QILADI — 97 kartali mukofot bir davrda to'lmasligi mumkin. Karta davr
 *  oynasiga kesilsa, davr almashganda odam ham kartasini, ham ballini yo'qotardi va mukofot
 *  hech qachon o'ynalmasdi. Ya'ni S2/S3 ning butun mantig'i ishlamasdi.
 *
 *  ⚠️ 2026-08-11 DAN KEYINGI HOLAT (ega qarori: «har mavsum ball nol bo'ladi, saqlashning
 *  yagona yo'li — karta olib qo'yish»): ball MAVSUM oynasida yashaydi. `earned` ham, `spent`
 *  ham AYNAN bir xil oynadan filtrlanadi, shuning uchun yuqorida tasvirlangan «hammada 0»
 *  holati YUZAGA KELMAYDI — eski mavsum kartasining narxi ham, uni to'lagan ball ham birga
 *  hisobdan chiqadi. Karta O'ZI esa qoladi va to'lmagan mukofot keyingi mavsumda to'lishda
 *  davom etadi (`oyin:tickets:`/`oyin_sold:` arxivlanmaydi).
 *
 *  ⛔ `BALL_INACTIVITY_MS` (6 oylik harakatsizlik so'nishi) OLIB TASHLANDI — ball mavsum bilan
 *  yonadigan bo'lgach u hech qachon ishlamaydi, lekin `touch()` chaqirilmagan manba paydo
 *  bo'lsa haqiqiy ballni nolga tushirib yuborishi mumkin edi. */
/** So'rov chegarasi: mavsum sanasi yo'q bo'lsa (nazariy holat) ishlatiladigan zaxira oyna —
 *  `RideReward` to'liq skanini oldini oladi. */
const BALL_DATA_WINDOW_MS = 730 * 86400_000;

// ── ball-xaritasi: BUTUN o'yinchilar populyatsiyasi uchun BIR marta hisoblanadi (loop-ichida-
// loop emas — har komponent bo'yicha bittadan batch-so'rov), 60s kesh bilan. getBall/getBoard/
// getOyinState hammasi shu keshdan o'qiydi — bonusConfig.ts kesh naqshi bilan bir xil.
//
// 📅 2026-08-02: ball ENDI faqat MAVSUM ICHIDAGI harakatlar uchun. Kesh `seasonId` bilan
// tamg'alanadi — aks holda "toza boshlash" tugmasidan keyin 60 soniya davomida chiptalar ESKI
// mavsum balliga sotilardi. ──────────────────────────────────────────────────────────────────
let ballMapCache: { at: number; seasonId: string; val: Map<number, MemberBallRow> } | null = null;
// ⚠️ GENERATSIYA HISOBLAGICHI — bepul-chipta bug'ining yagona qo'rig'i.
// Avval `invalidateBallCache()` faqat keshni null qilardi, lekin ALLAQACHON YURAYOTGAN
// `computeBallMap()` (8 ta og'ir so'rov, sekundlar) tugagach ESKI suratni keshga YOZIB
// qo'yardi. Ketma-ketlik: (1) `/state` recompute boshlaydi, spent=0 suratini oladi →
// (2) mijoz chipta oladi, spent=100, kesh tozalanadi → (3) 1-qadamdagi recompute tugab
// eskirgan `ball=100` ni keshga yozadi → (4) ikkinchi chipta BEPUL ketadi. `withMemberLock`
// yordam bermaydi: kesh lock TASHQARISIDAN iflos qilinadi.
// Endi har bekor qilish generatsiyani oshiradi; eskirgan hisob natijasi TASHLAB YUBORILADI.
let ballMapGen = 0;

function invalidateBallCache(): void {
  ballMapCache = null;
  ballMapGen++;
}

/** Tashqi chaqiruvchilar uchun (admin route'lari) — hikoya tasdiqlangach ball darhol ko'rinsin. */
export function invalidateBallCacheExternal(): void {
  invalidateBallCache();
}

async function computeBallMap(): Promise<Map<number, MemberBallRow>> {
  const season = await getSeason();
  if (ballMapCache && ballMapCache.seasonId === season.seasonId && Date.now() - ballMapCache.at < 60_000) {
    return ballMapCache.val;
  }
  // Mavsum sozlanmagan — o'yin inert. Bitta ham so'rov yubormaymiz.
  if (!season.configured) {
    ballMapCache = { at: Date.now(), seasonId: season.seasonId, val: new Map() };
    return ballMapCache.val;
  }

  // Hisob BOSHLANGANDAGI generatsiya — tugaganda o'zgargan bo'lsa natija eskirgan.
  const gen = ballMapGen;
  const econ = await getBonusEcon();
  // ⚠️ ESKIRGAN IZOH (S8, 2026-08-04) — pastdagi kod bilan ENDI ZID, 2026-08-11 ega
  // qarori bilan almashtirildi: quyida yozilgan «ball davr chegarasida KUYMAYDI, faqat 6 oy
  // harakatsizlikda so'nadi» modeli OLIB TASHLANGAN. Amaldagi qoida pastroqda, 2026-08-11
  // izohida yozilgan: ball MAVSUM oynasida hisoblanadi (`fromMs = season.startMs`,
  // `toMs = min(now, season.endMs)`), 6 oylik so'nish kodda YO'Q.
  const nowMs = Date.now();
  // 🔄 2026-08-11 — EGA QARORI: «har mavsum ball nol bo'ladi, uni saqlashning yagona yo'li
  // karta olib qo'yish». Ya'ni ball MAVSUM ICHIDA yashaydi va mavsum tugashi bilan yonadi.
  //
  // Nega bu S8 dagi «hammada 0» bug'ini QAYTARMAYDI: o'shanda `earned` mavsumga kesilgan,
  // `spent` esa kesilmagan edi → karta olgan odamda `max(0, earned − spent)` = 0 chiqardi.
  // Bu yerda IKKALASI ham AYNAN shu `fromMs`/`toMs` oynasidan filtrlanadi (pastda `spent`
  // hisobiga qarang) — ya'ni eski mavsum kartasining narxi yangi balansdan CHIQARILADI.
  // Bu to'g'ri: u karta eski mavsum balli bilan to'langan.
  //
  // ⚠️ Karta O'ZI hech qayerga ketmaydi: `myTickets`/`drawExport` uni ko'rsatishda davom
  // etadi va `oyin_sold:` hisoblagichi arxivlanmaydi — ya'ni to'lmagan mukofot keyingi
  // mavsumda to'lishda DAVOM etadi (ega qoidasi: «to'lmagan sovg'a kartalari keyingi
  // mavsumga o'ynaladi, faqat o'ynalib yutuq chiqmagani yo'qoladi»).
  const fromMs = season.startMs ?? nowMs - BALL_DATA_WINDOW_MS;
  // Mavsum tugagach ball o'smaydi: tugash sanasidan keyingi harakat hisobga kirmaydi.
  const toMs = season.endMs != null ? Math.min(nowMs, season.endMs) : nowMs;
  const from = new Date(fromMs);
  const to = new Date(toMs);
  const fromDay = tashkentDayKey(from);
  const toDay = tashkentDayKey(to);
  const fromWeek = weekKey(from);
  const toWeek = weekKey(to);

  const [rideCounts, rideDayRows, referrals, telegramUsers, ticketRows, loginRows, shareRows, questRows, homeRows, sprintWinRows, storyRows, adjRows, gashtakLedgerRows, phoneBallRows] = await Promise.all([
    // 1) YAGONA DB-darajasidagi sana filtri — katta jadval va indeksi bor (@@index([createdAt])).
    prisma.rideReward.groupBy({ by: ["memberId"], _count: { _all: true }, where: { createdAt: { gte: from, lte: to } } }),
    // 1b) ⚠️ Zanjir uchun SAFAR KUNLARI. Avval zanjir `oyin:login:` (ILOVA OCHISH) bo'yicha edi —
    //     safarsiz odam faqat ilovani ochib turib mavsumda 500 ball yig'ardi va tanqis chipta-
    //     o'rnini egallardi. Endi zanjir DAROMADGA bog'langan: har 3 ketma-ket SAFAR kuni = 1 bonus.
    prisma.rideReward.findMany({ where: { createdAt: { gte: from, lte: to } }, select: { memberId: true, createdAt: true } }),
    // 2) FILTRLANMAYDI: bitta qator UCHTA komponentni uchta HAR XIL soat bilan boqadi
    //    (createdAt → referJoin, referrerPaidAt → referFirstRide, referee safarlari → referRides).
    prisma.referral.findMany({ select: { referrerId: true, refereeMemberId: true, referrerPaidAt: true, createdAt: true } }),
    // 3) ⚠️ FILTRLANMAYDI — bu POPULYATSIYA manbai: pastdagi tsikl ball-xaritasining HAR qatorini
    //    shu ro'yxatdan yaratadi. `linkedAt` filtri qo'yilsa, mavsumgacha raqam ulagan hamma mijoz
    //    o'yindan butunlay yo'qoladi (bilet ololmaydi, reytingda yo'q). Filtr faqat BALLGA.
    prisma.telegramUser.findMany({
      where: { memberId: { not: null } },
      select: { id: true, memberId: true, phone: true, linkedAt: true, firstName: true, lastName: true, username: true },
    }),
    prisma.appState.findMany({ where: { key: { startsWith: "oyin:tickets:" } } }) as Promise<AppStateRow[]>,
    prisma.appState.findMany({ where: { key: { startsWith: "oyin:login:" } } }) as Promise<AppStateRow[]>,
    prisma.appState.findMany({ where: { key: { startsWith: "oyin:share:" } } }) as Promise<AppStateRow[]>,
    // 🎯 Kunlik topshiriq bajarilgan kunlar (kun-ro'yxati, `oyin:login:` bilan bir xil naqsh)
    prisma.appState.findMany({ where: { key: { startsWith: "oyin:quest:" } } }) as Promise<AppStateRow[]>,
    // 🏠 Ilova ekranga o'rnatilgan kun — mavsumda BIR MARTA to'lanadi
    prisma.appState.findMany({ where: { key: { startsWith: "oyin:home:" } } }) as Promise<AppStateRow[]>,
    prisma.appState.findMany({ where: { key: { startsWith: "oyin:sprintwin:" } } }) as Promise<AppStateRow[]>,
    // 📸 hikoya-isbotlar (HIKOYA_POSTER_PLAN.md) — faqat TASDIQLANGANLARI va mavsum ichidagilari
    prisma.appState.findMany({ where: { key: { startsWith: "oyin:story:" } } }) as Promise<AppStateRow[]>,
    // 🛠 Admin qo'lda tuzatgan ball. Mavsumga KESILMAYDI (qator mavsum bilan arxivlanadi, ya'ni
    //    yangi mavsumda o'zi bo'shaydi) — sanani ikkinchi marta filtrlash ikki qavat qoida bo'lardi.
    prisma.appState.findMany({ where: { key: { startsWith: ADJ_PREFIX } } }) as Promise<AppStateRow[]>,
    // 🤝 Gashtak-ledger — o'zgarmas yozuvlar, oynadagi yig'indi memberId bo'yicha. Xuddi
    //    RideReward kabi: har yozuv REAL safar tasdiqlanganda bir marta yozilgan, keyin
    //    o'zgarmaydi (guruh tarkibi keyinroq o'zgarsa ham).
    prisma.gashtakReward.groupBy({ by: ["memberId"], _sum: { amount: true }, where: { createdAt: { gte: from, lte: to } } }),
    // 📱 Telefon tasdiqlangan — BIR MARTALIK belgi (`markPhoneVerified`). Avval `linkedAt`
    //    oynasi asosida edi: admin unlink→relink qilsa (yoki foydalanuvchi raqamni qayta ulasa)
    //    `linkedAt` yangilanardi va ball CHEKSIZ qayta yig'ilardi. Endi umrbod bitta marta.
    prisma.appState.findMany({ where: { key: { startsWith: "oyin:phoneball:" } } }) as Promise<AppStateRow[]>,
  ]);

  // Nomi ATAYLAB "season…" — endi ikki vazifa bajaradi (o'z safari + referee safari), kelajakda
  // biri uchun umrbod variant qaytarib qo'yilmasin.
  const seasonRideCountByMember = new Map<number, number>();
  for (const r of rideCounts) seasonRideCountByMember.set(r.memberId, r._count._all);

  const referBonusByTelegramId = new Map<string, { join: number; milestone: number; rides: number }>();
  for (const r of referrals) {
    const cur = referBonusByTelegramId.get(r.referrerId) ?? { join: 0, milestone: 0, rides: 0 };
    const joinMs = r.createdAt.getTime();
    if (joinMs >= fromMs && joinMs <= toMs) cur.join += 1;
    const paidMs = r.referrerPaidAt ? r.referrerPaidAt.getTime() : null;
    if (paidMs !== null && paidMs >= fromMs && paidMs <= toMs) cur.milestone += 1;
    // ⚠️ `joinIn` sharti bilan O'RALMAYDI: do'stning MAVSUM ICHIDAGI safari — bu mavsum harakati,
    // taklif qachon yaratilganidan qat'i nazar. O'ralsa, mavsumgacha qo'shilgan hamma juftlik
    // uchun oqim jimgina o'ladi (do'stlar yuraveradi, taklifchi hech narsa olmaydi).
    if (r.refereeMemberId) cur.rides += seasonRideCountByMember.get(r.refereeMemberId) ?? 0;
    referBonusByTelegramId.set(r.referrerId, cur);
  }

  // ⛔ `lastActivityByMember`/`touch()` OLIB TASHLANDI (2026-08-11). Ular FAQAT harakatsizlik
  // qoidasini boqardi; qoida ball mavsum-doirali bo'lgach o'chirildi, ya'ni xarita hech kim
  // o'qimaydigan bo'lib qoldi. Har `computeBallMap` da 5 ta tsikl bo'yicha behuda ishlardi va
  // «bu nima uchun kerak?» degan savolni tug'dirardi.
  // 🔴 O8 (2026-08-11 audit, olib tashlandi 2026-08-13): `touchDays` avval "harakatsizlik"
  // qoidasi uchun oxirgi faollik sanasini yig'ardi (S8-7 shu ta'rifni to'g'irlagan edi —
  // kirish/hikoya/vazifa/ulashish ham "harakat" hisoblansin). 2026-08-11 da harakatsizlik
  // qoidasining O'ZI olib tashlandi (ball endi mavsum-doirali), lekin bu funksiya va 4 ta
  // chaqiruvi qolib ketgan edi — `last` hisoblanardi-yu HECH QAYERGA yozilmasdi, faqat har
  // `computeBallMap`da behuda tsikl yugurardi.
  // Telefon ulash — bir martalik, lekin HARAKAT: raqam ulab miniapp ochmagan odam jazolanmasin.

  // ⚠️ `spent` endi DAVRGA KESILMAYDI (S8): karta abadiy bo'lgani uchun uning narxi ham abadiy
  // hisobda qoladi. Ikkalasi bir xil umr ko'radi — aks holda balans asossiz siljiydi.
  const spentByMember = new Map<number, number>();
  for (const row of ticketRows) {
    const memberId = Number(row.key.slice("oyin:tickets:".length));
    if (!Number.isFinite(memberId)) continue;
    const tickets = parseTickets(row.value);
    // 🔴 S8-1 (nazoratchi 2026-08-04): `spent` FILTRSIZ edi, `earned` esa 24 oylik oynada —
    // ya'ni izohning O'ZI xato deb ta'riflagan holat, faqat mavsum o'rniga 24 oyga surilgan.
    // 25 oy oldin karta olgan sodiq mijoz: earned=415 spent=3000 → ball 0, YASHIRIN QARZ 2585.
    // Endi ikkalasi BIR XIL oynada. Oynadan tashqaridagi karta `drawExport`/`myTickets` da
    // KO'RINAVERADI (karta abadiy) — faqat BALL hisobidan chiqadi.
    let sum = 0;
    for (const t of tickets) {
      const ms = Date.parse(t.ts);
      // `ts` buzuq bo'lsa HISOBGA OLINADI: tashlash = sarflangan ball qaytishi = ekspluatatsiya.
      if (!Number.isFinite(ms) || ms >= fromMs) sum += t.priceAtPurchase || 0;
    }
    spentByMember.set(memberId, sum);
  }
  // Kun-kalitlari SATR sifatida solishtiriladi — ular `tashkentDayKey` chiqargan qiymatlar, mavsum
  // chegarasi ham shundan. `new Date(d)` bilan solishtirish UTC/+05:00 farqidan 5 soatga adashadi.
  const countDays = (raw: string | undefined): number =>
    parseDayList(raw).filter((d) => d >= fromDay && d <= toDay).length;
  const loginDaysByMember = new Map<number, number>();
  for (const row of loginRows) {
    const memberId = Number(row.key.slice("oyin:login:".length));
    if (Number.isFinite(memberId)) loginDaysByMember.set(memberId, countDays(row.value));
  }
  // 🎯 Topshiriq bajarilgan kunlar va 🏠 ekranga o'rnatish — ikkalasi ham mavsumga kesiladi.
  const questDaysByMember = new Map<number, number>();
  for (const row of questRows) {
    const memberId = Number(row.key.slice("oyin:quest:".length));
    if (Number.isFinite(memberId)) questDaysByMember.set(memberId, countDays(row.value));
  }
  const homeByMember = new Map<number, number>();
  for (const row of homeRows) {
    const memberId = Number(row.key.slice("oyin:home:".length));
    // Mavsumda BIR MARTA: mavsum ichida kun bormi — 1 yoki 0.
    if (Number.isFinite(memberId)) homeByMember.set(memberId, countDays(row.value) > 0 ? 1 : 0);
  }
  const shareDaysByMember = new Map<number, number>();
  for (const row of shareRows) {
    const memberId = Number(row.key.slice("oyin:share:".length));
    if (Number.isFinite(memberId)) shareDaysByMember.set(memberId, countDays(row.value));
  }
  // 🤝 GAP-JAMOA — endi o'zgarmas ledgerdan (`GashtakReward`, `creditGashtakLedger` real safar
  // tasdiqlanganda yozadi) oddiy YIG'INDI. Qayta hisoblash YO'Q — guruh tarkibi keyinroq
  // o'zgarsa ham, allaqachon yozilgan yozuvlar TEGILMAYDI (eski "computeBallMap har safar
  // qayta hisoblaydi" bugi shu bilan yopildi — RideReward/CoinTxn bilan bir xil falsafa).
  const jamoaByMember = new Map<number, number>();
  for (const row of gashtakLedgerRows) {
    jamoaByMember.set(row.memberId, row._sum.amount ?? 0);
  }

  // 📱 Telefon-ball — umrbod bitta marta belgi, `linkedAt` oynasidan MUSTAQIL (ega qarori
  // 2026-08-10: `linkedAt` admin unlink→relink'da qayta yozilishi cheksiz ball eshigi edi).
  const phoneBallGranted = new Set<number>();
  for (const row of phoneBallRows) {
    // 🔄 2026-08-11: belgi endi SANA saqlaydi (`markPhoneVerified`). Eski qatorlarda "1"
    // turadi — ular O'TMISHDA sodir bo'lgan deb qaraladi va joriy mavsumda ball BERMAYDI.
    // Aks holda telefon bonusi har mavsum qayta berilib, cheksiz ball eshigi bo'lardi.
    const memberId = Number(row.key.slice("oyin:phoneball:".length));
    if (!Number.isFinite(memberId)) continue;
    // Eski "1" qiymati → `Date.parse` NaN → mavsumga kirmaydi → ball bermaydi (to'g'ri:
    // u bonus o'tmishda, boshqa mavsumda berilgan).
    const at = Date.parse(row.value);
    if (Number.isFinite(at) && at >= fromMs && at <= toMs) phoneBallGranted.add(memberId);
  }

  // 🛠 Admin tuzatishi — musbat ham, manfiy ham bo'lishi mumkin.
  const adjustByMember = new Map<number, number>();
  for (const row of adjRows) {
    const memberId = Number(row.key.slice(ADJ_PREFIX.length));
    if (!Number.isFinite(memberId)) continue;
    // 🔄 2026-08-11: `total` EMAS, MAVSUM ICHIDAGI yozuvlar yig'indisi. Avval `total` olinardi
    // va u sanasiz edi — ya'ni bir marta qo'shilgan ball HAR MAVSUM qaytaverardi (yangi
    // «ball nol bo'ladi» qoidasida bu cheksiz ball eshigi bo'lardi).
    // ⚠️ Jurnal oxirgi 50 yozuv bilan cheklangan (`adminAdjustBall`): bitta a'zoga bir
    // mavsumda 50 dan ko'p tuzatish qilinsa eng eskilari hisobga kirmaydi. Real emas, lekin
    // yozib qo'yildi — jim yaxlitlash bo'lmasin.
    adjustByMember.set(memberId, oyinSumInWindow(parseAdjust(row.value).log, fromMs, toMs));
  }
  // Tasdiqlangan + mavsum oynasidagi hikoya-isbotlar
  const storyByMember = new Map<number, number>();
  for (const row of storyRows) {
    const memberId = Number(row.key.slice("oyin:story:".length));
    if (!Number.isFinite(memberId)) continue;
    let n = 0;
    try {
      const parsed = JSON.parse(row.value) as { items?: { at?: string; status?: string }[] };
      for (const it of parsed.items ?? []) {
        if (it.status !== "approved") continue;
        const t = Date.parse(String(it.at));
        if (Number.isFinite(t) && t >= fromMs && t <= toMs) n++;
      }
    } catch { /* buzuq JSON — 0 deb sanaymiz */ }
    storyByMember.set(memberId, n);
  }
  // 🔥 3 kunlik zanjir bonusi. Mening xatoyim edi: UI "+50" ko'rsatardi, ball esa HECH QACHON
  // qo'shilmasdi (DIZAYN_QOIDALARI #5 ga zid — va'da qilingan narsa berilishi shart).
  // Qoida: mavsum ichidagi kunlar ketma-ketligida har TO'LIQ 3 kun = 1 bonus (bir-birini
  // qoplamaydi, ya'ni 7 kunlik zanjir = 2 bonus).
  const STREAK_TARGET = 3;
  // Safar kunlari a'zo bo'yicha (Toshkent kuni) — zanjir manbai.
  const rideDaysByMember = new Map<number, Set<string>>();
  for (const r of rideDayRows) {
    const set = rideDaysByMember.get(r.memberId) ?? new Set<string>();
    set.add(tashkentDayKey(r.createdAt));
    rideDaysByMember.set(r.memberId, set);
  }
  const streakByMember = new Map<number, number>();
  for (const [memberId, daySet] of rideDaysByMember) {
    const days = [...daySet].filter((d) => d >= fromDay && d <= toDay).sort();
    let bonuses = 0;
    let run = 0;
    let prevMs: number | null = null;
    for (const d of days) {
      const ms = Date.parse(`${d}T00:00:00+05:00`);
      run = prevMs !== null && ms - prevMs === 86400_000 ? run + 1 : 1;
      prevMs = ms;
      if (run === STREAK_TARGET) { bonuses++; run = 0; prevMs = ms; }
    }
    if (bonuses) streakByMember.set(memberId, bonuses);
  }
  const sprintWinsByMember = new Map<number, number>();
  for (const row of sprintWinRows) {
    const memberId = Number(row.key.slice("oyin:sprintwin:".length));
    if (!Number.isFinite(memberId)) continue;
    sprintWinsByMember.set(memberId, parseWeekList(row.value).filter((w) => w >= fromWeek && w <= toWeek).length);
  }

  const map = new Map<number, MemberBallRow>();
  for (const tu of telegramUsers) {
    if (!tu.memberId) continue;
    const memberId = tu.memberId;
    const rides = seasonRideCountByMember.get(memberId) ?? 0;
    // Birinchi-safar bonusi = MAVSUMNING birinchi safari (har mavsum yangi start — ega qarori).
    const ridesBall = rides > 0 ? (econ.oyinFirstRideBall ?? 0) + (econ.oyinRideBall ?? 0) * (rides - 1) : 0;
    // 📱 Umrbod bitta marta — `markPhoneVerified` yozgan belgidan, `linkedAt` oynasidan EMAS
    // (raqamni qayta ulash/admin unlink-relink endi ballni qayta bermaydi).
    const phoneBall = phoneBallGranted.has(memberId) ? (econ.oyinPhoneBall ?? 0) : 0;
    const refer = referBonusByTelegramId.get(tu.id) ?? { join: 0, milestone: 0, rides: 0 };
    const referJoinBall = refer.join * (econ.oyinReferJoinBall ?? 0);
    const referFirstBall = refer.milestone * (econ.oyinReferFirstRideBall ?? 0);
    const referRideBall = refer.rides * (econ.oyinReferRideBall ?? 0);
    const loginBall = (loginDaysByMember.get(memberId) ?? 0) * (econ.oyinDailyLoginBall ?? 0);
    const shareBall = (shareDaysByMember.get(memberId) ?? 0) * (econ.oyinShareBall ?? 0);
    const questBall = (questDaysByMember.get(memberId) ?? 0) * (econ.oyinDailyQuestBall ?? 0);
    const homeBall = (homeByMember.get(memberId) ?? 0) * (econ.oyinHomeScreenBall ?? 0);
    const sprintBall = (sprintWinsByMember.get(memberId) ?? 0) * (econ.oyinSprintBonusBall ?? 0);
    // Limit SUBMIT'da tekshiriladi, lekin admin xato bilan 5 tasini tasdiqlasa yoki mavsum
  // oynasi kengaytirilsa eski arizalar ichkariga kirardi — ball CHEKLOVSIZ o'sardi.
  // Ikkinchi qavat: hisobda ham kesiladi.
  const storyBall = Math.min(storyByMember.get(memberId) ?? 0, OYIN_STORY_SEASON_LIMIT) * (econ.oyinStoryProofBall ?? 0);
    const streakBall = (streakByMember.get(memberId) ?? 0) * (econ.oyinStreakBall ?? 0);
    const adjustBall = adjustByMember.get(memberId) ?? 0;
    const jamoaBall = jamoaByMember.get(memberId) ?? 0;
    const earnedRaw = ridesBall + phoneBall + referJoinBall + referFirstBall + referRideBall + loginBall + shareBall + storyBall + streakBall + sprintBall + questBall + homeBall + adjustBall + jamoaBall;
    const spentRaw = spentByMember.get(memberId) ?? 0;
    // ⛔ HARAKATSIZLIK QOIDASI (S8) OLIB TASHLANDI — 2026-08-11, ega qarori bilan keraksiz.
    //
    // U ball 6 oy harakatsizlikda so'nishini ta'minlardi. Endi ball MAVSUM bilan yonadi,
    // ya'ni 6 oy harakatsiz odamda joriy mavsum balli allaqachon 0 — qoida hech qachon
    // ishlamaydi. Uni QOLDIRISH esa xavfli edi: agar biror ball manbai `touch()` chaqirmasa,
    // `lastAct` eskirib qolib, HAQIQIY mavsum-ichi balni nolga tushirib yuborardi.
    // O'lik-lekin-xavfli kod saqlanmaydi.
    const earned = earnedRaw;
    const spent = spentRaw;
    map.set(memberId, {
      memberId,
      telegramId: tu.id,
      name: shortName(tu),
      seasonRides: rides,
      breakdown: {
        rides: ridesBall, phone: phoneBall, referJoin: referJoinBall, referFirstRide: referFirstBall,
        referRides: referRideBall, login: loginBall, share: shareBall,
        // `quest`/`home` avval faqat `earned` ichiga qo'shilardi va alohida ko'rinmasdi.
        quest: questBall, home: homeBall, story: storyBall,
        streak: streakBall, sprintBonus: sprintBall, adjust: adjustBall, jamoa: jamoaBall,
        earned, spent, ball: Math.max(0, earned - spent),
      },
    });
  }
  // Hisob davomida kesh bekor qilingan bo'lsa (chipta olindi / hikoya tasdiqlandi / mavsum
  // almashdi) — bu surat ESKIRGAN, keshga YOZILMAYDI. Natija chaqiruvchiga qaytariladi
  // (u shu lahzada to'g'ri edi), lekin keyingi so'rov yangidan hisoblaydi.
  if (gen === ballMapGen) ballMapCache = { at: Date.now(), seasonId: season.seasonId, val: map };
  return map;
}

// ── 🛠 ADMIN NAZORATI (ega talabi 2026-08-03: "oddiy kuzatuv emas") ──────────────────────────────
// Uchta yangi AppState kaliti. Yangi Prisma modeli YO'Q — `oyin:catalog`/`oyin:seasoncfg` bilan
// bir xil naqsh, migratsiya talab qilmaydi.
//   `oyin:adj:<memberId>`  — qo'lda ball tuzatish: {total, log:[{ball,reason,at}]}
//   `oyin:ban:<memberId>`  — o'yindan chetlatish: {reason, at}
//   `oyin:freeze`          — tirajni muzlatish (singleton): {at, ticketCount}
// ⚠️ Uchalasi ham `ARCHIVED_PREFIXES`/`ARCHIVED_SINGLETONS` ga QO'SHILGAN — aks holda "toza
// boshlash" ularni ortda qoldirardi va yangi mavsum eski jazolar bilan ochilardi.
const ADJ_PREFIX = "oyin:adj:";
const BAN_PREFIX = "oyin:ban:";
const FREEZE_KEY = "oyin:freeze";

interface AdjustRecord { total: number; log: OyinBallAdjustEntry[] }
function parseAdjust(raw: string | undefined): AdjustRecord {
  if (!raw) return { total: 0, log: [] };
  try {
    const v = JSON.parse(raw) as { total?: unknown; log?: unknown };
    const total = Number(v.total);
    const log = Array.isArray(v.log)
      ? (v.log as unknown[]).flatMap((e) => {
          if (!e || typeof e !== "object") return [];
          const r = e as Record<string, unknown>;
          const ball = Number(r.ball);
          if (!Number.isFinite(ball)) return [];
          return [{ ball: Math.round(ball), reason: typeof r.reason === "string" ? r.reason : "", at: typeof r.at === "string" ? r.at : "" }];
        })
      : [];
    // `total` buzuq bo'lsa jurnaldan QAYTA hisoblanadi — ball hech qachon NaN bo'lmasin.
    return { total: Number.isFinite(total) ? Math.round(total) : log.reduce((s, e) => s + e.ball, 0), log };
  } catch {
    return { total: 0, log: [] };
  }
}

/** 🔒 Tiraj muzlatilganmi. Muzlatilgach chipta xaridi HAMMA uchun yopiladi — ega ham, test ham. */
export async function getFreeze(): Promise<OyinFreezeState> {
  const row = await prisma.appState.findUnique({ where: { key: FREEZE_KEY } });
  if (!row) return { frozen: false, at: null, ticketCount: 0 };
  try {
    const v = JSON.parse(row.value) as { at?: string; ticketCount?: number };
    return { frozen: true, at: typeof v.at === "string" ? v.at : null, ticketCount: Number(v.ticketCount) || 0 };
  } catch {
    // 🟡 (nazoratchi 2026-08-04 №14): avval `{ frozen: true, at: null }` qaytardi — o'zaro ZID.
    // `buyTicket` `frozen` ni ko'rib HAMMA xaridni to'sardi, `adminRecordWinner` esa
    // `frozenAt: null` ni ko'rib `not_frozen` berardi va admin tugmasi ham o'chiq bo'lardi:
    // na sotib olish, na tortish mumkin — tizim o'z-o'zini qulflab qo'yardi.
    // Endi: buzuq qator = muzlatish YO'Q. Ega qayta muzlatadi (ro'yxat baribir qayta olinadi).
    console.error("[oyin] muzlatish qatori BUZUQ — muzlatish yo'q deb hisoblandi, ega qayta muzlatsin");
    return { frozen: false, at: null, ticketCount: 0 };
  }
}

/** 🚫 A'zo o'yindan chetlatilganmi. Ball YIG'ILISHI to'xtatilmaydi (tarix va tekshiruv izi
 *  buzilmasin) — chetlatish chiptaga AYLANTIRISH va TIRAJDA qatnashish darajasida ishlaydi. */
export async function isBanned(memberId: number): Promise<boolean> {
  return !!(await prisma.appState.findUnique({ where: { key: `${BAN_PREFIX}${memberId}` } }));
}

/** Bitta a'zoning joriy balli. Ega/xodim ham hisoblanadi (ko'rinadi) — chetlashtirish faqat
 *  chipta/reyting-sovrin darajasida (§ route/UI qatlamida), bu yerda emas. */
export async function getBall(memberId: number): Promise<number> {
  const map = await computeBallMap();
  return map.get(memberId)?.breakdown.ball ?? 0;
}

/** 🔥 Haftalik zanjir: kun-ro'yxatidan BUGUNDAN orqaga ketma-ket kunlar soni. Yangi saqlash YO'Q. */
function streakFrom(days: string[], todayKey: string): number {
  const set = new Set(days);
  let streak = 0;
  const cursor = new Date(Date.parse(`${todayKey}T00:00:00+05:00`));
  // Bugun hali kirmagan bo'lsa zanjir kechagidan sanaladi (kun tugamagan — uzilgan deb hisoblamaymiz).
  if (!set.has(todayKey)) cursor.setTime(cursor.getTime() - 86400_000);
  for (;;) {
    const key = tashkentDayKey(cursor);
    if (!set.has(key)) break;
    streak++;
    cursor.setTime(cursor.getTime() - 86400_000);
  }
  return streak;
}

export async function getOyinState(memberId: number): Promise<OyinStateResponse> {
  // Toshkent-kunining boshlanishi (UTC vaqtida) — "bugun" chegarasi hamma joyda bir xil bo'lsin.
  const todayKey = tashkentDayKey(new Date());
  const dayStart = new Date(Date.parse(`${todayKey}T00:00:00+05:00`));

  const [season, map, sponsor, econ, ridesToday, loginRow, shareRow, lastReferToday] = await Promise.all([
    getSeason(),
    computeBallMap(),
    getSponsor(),
    getBonusEcon(),
    prisma.rideReward.count({ where: { memberId, createdAt: { gte: dayStart } } }),
    prisma.appState.findUnique({ where: { key: `oyin:login:${memberId}` } }),
    prisma.appState.findUnique({ where: { key: `oyin:share:${memberId}` } }),
    prisma.referral.findFirst({ where: { createdAt: { gte: dayStart } }, orderBy: { createdAt: "desc" }, select: { referrerId: true } }),
  ]);
  const active = season.phase === "active";
  const mine = map.get(memberId);
  const ranked = [...map.values()].filter((r) => r.breakdown.ball > 0);

  // ── 2-TO'LQIN — bir-biriga BOG'LIQ BO'LMAGAN hamma so'rov bitta `Promise.all` da.
  // Avval bular KETMA-KET yurardi: taklif-sanog'i → do'stlar ro'yxati → do'stlar safari →
  // chipta qatori → katalog → sotilganlar → maqsad → hikoya → uy-belgisi. Ya'ni ekranning
  // ochilishi ~9 ta ket-ket DB borish-kelishiga cho'zilardi (mobil tarmoqda sezilarli).
  // Haqiqiy bog'liqlik faqat ikkita: (a) do'st id'lari → ularning bugungi safari,
  // (b) chipta soni + eng qimmat sovrin nomi → hikoya matnidagi o'rin-egallari.
  const [referJoinedCount, myRefs, ticketsRow, catalog, soldMapAll, goalRow, homeRow, myRideRows] = await Promise.all([
    active && mine
      ? prisma.referral.count({ where: { referrerId: mine.telegramId, createdAt: { gte: dayStart } } })
      : Promise.resolve(0),
    active && mine
      ? prisma.referral.findMany({ where: { referrerId: mine.telegramId }, select: { refereeMemberId: true } })
      : Promise.resolve([] as { refereeMemberId: number | null }[]),
    prisma.appState.findUnique({ where: { key: `oyin:tickets:${memberId}` } }),
    getCatalog(),
    getSoldMap(),
    prisma.appState.findUnique({ where: { key: `${GOAL_PREFIX}${memberId}` } }),
    prisma.appState.findUnique({ where: { key: `oyin:home:${memberId}` } }),
    // 🔥 Zanjir uchun O'Z safar kunlarim (mavsum oynasida) — pastdagi izohga qarang.
    active
      ? prisma.rideReward.findMany({
          where: { memberId, createdAt: { gte: new Date(season.startMs as number), lte: new Date(season.endMs as number) } },
          select: { createdAt: true },
        })
      : Promise.resolve([] as { createdAt: Date }[]),
  ]);

  // 🎯 Bugungi maqsad — hammasi mavjud manbalardan, yangi yozuv YO'Q (ball baribir jonli hisoblanadi).
  // Mavsum faol bo'lmasa nollanadi: ball muzlagan ekranda "bugun 3 safar ✓" ko'rsatish nomuvofiq.
  const referJoined = referJoinedCount > 0;
  const refereeIds = myRefs.map((r) => r.refereeMemberId).filter((x): x is number => typeof x === "number");
  const loginDays = parseDayList(loginRow?.value);
  const today = {
    login: active && loginDays.includes(todayKey),
    rides: active ? ridesToday : 0,
    shared: active && parseDayList(shareRow?.value).includes(todayKey),
    referJoined,
  };

  // 🔥 Haftalik vazifa — 3 kunlik zanjir (prototipdagi blok).
  // 🚩 2026-08-03 TUZATILDI: bu yerda zanjir `oyin:login:` (ILOVA OCHISH) kunlaridan sanalardi,
  // ball esa (`computeBallMap` → `rideDaysByMember`) SAFAR kunlaridan. Natijada bir marta ham
  // taksiga chiqmagan, faqat ilovani ochib turgan mijozga ekran "🔥 3/3 bajarildi · +50" deb
  // yozardi va ball HECH QACHON tushmasdi — DIZAYN_QOIDALARI #5 ning aynan buzilishi ("yozuv
  // harakat va'da qilsa, harakat bajarilishi shart"). Endi ikkalasi BITTA manbadan: mavsum
  // ichidagi SAFAR kunlari.
  const streakTarget = 3;
  const rideDayKeys = myRideRows
    .map((r) => tashkentDayKey(r.createdAt))
    .filter((d) => d >= (season.startDayKey as string) && d <= (season.endDayKey as string));
  const streak = active ? streakFrom(rideDayKeys, todayKey) : 0;
  const week = {
    streak: Math.min(streak, streakTarget),
    target: streakTarget,
    bonusBall: econ.oyinStreakBall ?? 0,
    done: streak >= streakTarget,
  };

  const myTickets = parseTickets(ticketsRow?.value);
  const ticketCount = season.configured
    ? myTickets.length
    : 0;
  // 🔴 (nazoratchi 2026-08-04 №4): `queued` filtri YO'Q edi. Ega 100 ta mukofot yuklashi bilan
  // uy kartasi «⭐ 105 TA REAL SOVG'A» deb yozardi, vitrinada esa 5 tasi turardi; progress
  // `12 / 2 400` bo'lib qolardi — ijtimoiy isbot o'rniga "hech kim olmayapti" signali.
  // Mijozga KO'RINADIGAN har son faqat SOTUVDAGI mukofotlardan hisoblanadi.
  const activeCatalog = catalog.filter((p) => p.active && p.queued !== true);
  // 📊 UY KARTASI uchun UMUMIY hisob — mijozning shaxsiy balli emas, butun mavsum bo'yicha.
  const capacityTotal = activeCatalog.reduce((n, p) => n + Math.max(0, p.limit), 0);
  const soldTotal = activeCatalog.reduce((n, p) => n + Math.min(p.limit, soldMapAll.get(p.key) ?? 0), 0);
  // Maqsad: sovrin keyin o'chirilgan/yashirilgan bo'lsa null (hero avtomatik eng arzonga tushadi).
  const goalPrizeKey = goalRow && activeCatalog.some((p) => p.key === goalRow.value) ? goalRow.value : null;

  // ── 3-TO'LQIN — 2-to'lqin natijasiga bog'liq, lekin o'zaro bog'liq EMAS.
  // 📸 Hikoya-poster holati — 20 ta TAYYOR statik rasm-yo'l (`storyPosterPaths()`), matn/shablon
  // yo'q (2026-08-05 soddalashtirish).
  const { storyStateOf } = await import("./oyinStory");
  const [referRideToday, storyState] = await Promise.all([
    // 🤝 Do'stlarim BUGUN safar qildimi (kunlik topshiriq uchun) — faqat o'z doirasi bo'yicha.
    active && refereeIds.length
      ? prisma.rideReward.count({ where: { memberId: { in: refereeIds }, createdAt: { gte: dayStart } } })
      : Promise.resolve(0),
    storyStateOf(memberId, econ.oyinStoryProofBall ?? 0),
  ]);

  // ── 🎯 BUGUNGI TOPSHIRIQ ────────────────────────────────────────────────────────────────
  // Tanlov DETERMINISTIK (memberId + kun) — sahifa yangilanganda o'zgarmaydi. Bajarilishi
  // JONLI tekshiriladi (grant yozuvi yo'q, boshqa manbalar bilan bir xil), bajarilgan bo'lsa
  // kun-markeri qo'yiladi va ball `computeBallMap` da hisoblanadi.
  let quest: OyinQuestState | null = null;
  // Marker SHU so'rovda yozilgan bo'lsa, qancha ball qo'shilgani (pastda balansga qo'shiladi).
  let questJustEarned = 0;
  if (active) {
    const def = oyinQuestOf(memberId, todayKey);
    const done = ((): boolean => {
      switch (def.key) {
        case "ride2": return ridesToday >= 2;
        case "ride_share": return ridesToday >= 1 && today.shared;
        case "friend_ride": return referRideToday > 0;
        case "invite": return referJoined;
        // ⛔ `story` ENDI TO'PLAMDA YO'Q (shared/oyin.ts `OYIN_QUEST_POOL` izohiga qarang):
        // bajarilishini SERVER tekshira olmaydi. Avvalgi shart `storyState.approved > 0` edi va
        // u MAVSUM bo'yicha sanalardi — bir marta tasdiqlatgan mijoz keyin `story` tushgan HAR
        // kuni hech narsa qilmasdan +100 ball olardi. Kalit tipda qolgani uchun `switch`
        // to'liqligicha turadi; qaytadan qo'shilsa AVVAL kunlik, soxtalikka chidamli tekshiruv
        // yozilishi shart — "yuborildi" ni "bajarildi" deb qabul qilish yaramaydi.
        case "story": return false;
        default: return false;
      }
    })();
    // ⚠️ `markDay` javobi MUHIM: `true` = marker AYNAN HOZIR yozildi (bugun birinchi marta).
    if (done && (await markDay("oyin:quest:", memberId).catch(() => false))) {
      questJustEarned = econ.oyinDailyQuestBall ?? 0;
    }
    quest = { key: def.key, icon: def.icon, title: def.title, hint: def.hint, ball: econ.oyinDailyQuestBall ?? 0, done };
  }

  // 🚩 2026-08-03 TUZATILDI — "bajarildi ✓ +100" yozilardi, BALANS esa o'zgarmasdi.
  // Sabab: `computeBallMap()` javobning ENG BOSHIDA olinadi, `markDay` esa shu yerda — ya'ni
  // xarita marker YOZILISHIDAN OLDINGI holatni ko'rsatadi va mijoz o'z balli 60 soniyadan keyin
  // "sakraganini" ko'rardi (DIZAYN_QOIDALARI #5: va'da qilingan narsa DARHOL berilishi kerak).
  // Qayta hisoblash 11 ta og'ir so'rov — o'rniga ANIQ ma'lum delta lokal qo'shiladi. Bu YOLG'ON
  // emas: marker bazaga yozildi, kesh `markDay` ichida bekor qilindi, keyingi so'rov bazadan
  // XUDDI SHU raqamni hisoblaydi.
  const baseBreakdown = mine?.breakdown ?? EMPTY_BREAKDOWN;
  const breakdown: OyinBallBreakdown = questJustEarned
    ? {
        ...baseBreakdown,
        quest: baseBreakdown.quest + questJustEarned,
        earned: baseBreakdown.earned + questJustEarned,
        ball: Math.max(0, baseBreakdown.earned + questJustEarned - baseBreakdown.spent),
      }
    : baseBreakdown;
  // O'rin ham SHU (yangilangan) balldan hisoblanadi — aks holda javobda yangi ball bilan eski
  // o'rin birga ketardi. Saralash o'rniga "mendan yuqori nechta" sanoqi: teng ballilar bir xil
  // o'rinni bo'lishadi va ortiqcha `sort` yo'q.
  const rank = breakdown.ball > 0
    ? ranked.filter((r) => r.memberId !== memberId && r.breakdown.ball > breakdown.ball).length + 1
    : null;

  // 🏠 Doimiy topshiriq — ilova ekranga o'rnatilganmi (mavsum ichida belgilangan bo'lsa).
  const homeDone = season.configured
    ? parseDayList(homeRow?.value).some((d) => d >= (season.startDayKey as string) && d <= (season.endDayKey as string))
    : false;

  // 🔴 JONLI lenta — bugungi eng so'nggi do'st-taklif (populyatsiya bo'ylab, ijtimoiy isbot).
  // Ism ballMap keshidan olinadi (qo'shimcha so'rov yo'q); taklifchi a'zo bo'lmasa ko'rsatilmaydi.
  let live: { name: string; ball: number } | null = null;
  if (active && lastReferToday) {
    const referrer = [...map.values()].find((r) => r.telegramId === lastReferToday.referrerId);
    if (referrer) live = { name: referrer.name, ball: econ.oyinReferJoinBall ?? 0 };
  }

  // 🏆 OXIRGI REAL G'OLIB — uy-kartasidagi ijtimoiy-isbot qatori. Bayonnoma yozilmagan bo'lsa
  // `null` qaytadi va klient qatorni UMUMAN chizmaydi (soxta g'olib taqiq). Bugungi kunda jonli
  // bazada birorta `oyin:winner:*` qatori yo'q — ya'ni qator birinchi REAL tirajdan keyin o'zi
  // yonadi, alohida deploy kerak emas.
  // Narx: `getWinners()` — `appState` PK prefiksi bo'yicha diapazon-skani, N juda kichik (mavsumda
  // bir necha sovrin). Mahalla so'rovlari FAQAT g'olib bor bo'lganda ketadi, ya'ni hozir 0 ta
  // qo'shimcha so'rov.
  let lastWinner: OyinStateResponse["lastWinner"] = null;
  const winners = await getWinners(); // yangidan eskiga saralangan
  const topWinner = winners[0];
  if (topWinner) {
    // `no` — g'olibning UMUMIY tartibi ("4-chi g'olib"). Ro'yxat kamayish tartibida, shuning uchun
    // eng yangisining tartibi = jami soni.
    let mahalla: string | null = null;
    const wm = await prisma.member.findUnique({ where: { id: topWinner.memberId }, select: { mahallaId: true } });
    if (wm?.mahallaId) {
      const mh = await prisma.mahalla.findUnique({ where: { id: wm.mahallaId }, select: { name: true } });
      mahalla = mh?.name ?? null;
    }
    lastWinner = {
      name: topWinner.name,
      mahalla,
      prizeName: topWinner.prizeName,
      drawnAt: topWinner.drawnAt,
      no: winners.length,
    };
  }

  return {
    ball: breakdown.ball,
    breakdown,
    rank,
    sponsor: { name: sponsor.name, photoUrl: sponsor.photoUrl },
    hints: {
      referComboBall: (econ.oyinReferJoinBall ?? 0) + (econ.oyinReferFirstRideBall ?? 0),
      rideBall: econ.oyinRideBall ?? 0,
      firstRideBall: econ.oyinFirstRideBall ?? 0,
      phoneBall: econ.oyinPhoneBall ?? 0,
      loginBall: econ.oyinDailyLoginBall ?? 0,
      shareBall: econ.oyinShareBall ?? 0,
      referJoinBall: econ.oyinReferJoinBall ?? 0,
      referFirstRideBall: econ.oyinReferFirstRideBall ?? 0,
      referRideBall: econ.oyinReferRideBall ?? 0,
      streakBall: econ.oyinStreakBall ?? 0,
      storyBall: econ.oyinStoryProofBall ?? 0,
      maxPerPrize: Math.max(1, Math.round(econ.oyinMaxTicketsPerPrize ?? 3)),
    },
    today,
    live,
    lastWinner,
    week,
    story: storyState,
    ticketCount,
    quest,
    // `supported` maydoni OLIB TASHLANDI — server klient Bot API versiyasini BILMAYDI, qotirilgan
    // `true` esa API'ning yolg'oni edi (shared/oyin.ts `OyinHomeTask` izohiga qarang).
    homeTask: { ball: econ.oyinHomeScreenBall ?? 0, done: homeDone },
    soldTotal,
    capacityTotal,
    prizeCount: activeCatalog.length,
    seasonRides: mine?.seasonRides ?? 0,
    goalPrizeKey,
    season: {
      configured: season.configured,
      phase: season.phase,
      label: season.label,
      startIso: season.startIso,
      endIso: season.endIso,
    },
  };
}

// ⛔ `getBoard` OLIB TASHLANDI (ega qarori 2026-08-03). U ball QOLDIG'I bo'yicha saralardi:
// chipta olgan odamning o'rni TUSHARDI, ball yig'ib hech narsa olmagan odam 1-o'rinda turardi —
// reyting to'g'ri xatti-harakatni JAZOLARDI. O'rniga qo'ng'iroq: ball qayerdan kelgani.


/** 🛡 Tirajda o'ynalishi uchun kerak bo'lgan chipta soni. `limit` 0 bo'lsa 0 (bo'linish yo'q).
 *  Foiz 0 bo'lsa qo'riq O'CHIQ — `minSell` 0, hamma sovrin har doim o'ynaladi (eski xatti-atvor). */
function minSellOf(limit: number, pct: number): number {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  if (p <= 0 || limit <= 0) return 0;
  return Math.min(limit, Math.ceil((limit * p) / 100));
}

export async function getVitrina(memberId: number): Promise<OyinVitrinaResponse> {
  const [season, catalog, soldMap, ticketsRow, sponsor, econV, winnerKeys] = await Promise.all([
    getSeason(),
    getCatalog(),
    getSoldMap(),
    prisma.appState.findUnique({ where: { key: `oyin:tickets:${memberId}` } }),
    getSponsor(),
    getBonusEcon(),
    // 🔴 (ega talabi 2026-08-12): Arxiv avval `soldOut` (sold>=limit) bilan aralashtirilardi —
    // to'lgan-lekin-hali-O'YNALMAGAN sovrin arxivga tushib, mijozdan "eng qizig'i" yashirilardi.
    // «Arxiv» — FAQAT allaqachon O'YNALGAN (g'olib yozilgan) sovrinlar uchun. Bitta so'rov —
    // har sovrinni alohida tekshirish N+1 bo'lardi.
    prisma.appState.findMany({ where: { key: { startsWith: WINNER_PREFIX } }, select: { key: true } }),
  ]);
  const drawnKeys = new Set(winnerKeys.map((r) => r.key.slice(WINNER_PREFIX.length)));
  const minPct = econV.oyinMinSellPct ?? OYIN_MIN_SELL_PCT_DEFAULT;
  // `mine` FAQAT joriy mavsum chiptalaridan — aks holda toza-boshlashdan keyin `sold: 0` bo'lgan
  // sovrinda "Sizniki: 3" ko'rinardi (ochiq-oydin yolg'on).
  const mine = season.configured
    ? parseTickets(ticketsRow?.value)
    : [];
  const mineByPrize = new Map<string, number>();
  for (const t of mine) mineByPrize.set(t.prizeKey, (mineByPrize.get(t.prizeKey) ?? 0) + 1);

  const prizes = catalog
    // 📋 NAVBATDAGI mukofot mijozga KO'RINMAYDI. Ega 100+ mukofot yuklashi mumkin — hammasi
    // birdan ko'rinsa ball tarqalib hech biri to'lmaydi (to'lish-qulfi bilan bu o'lim).
    .filter((p) => p.active && p.queued !== true)
    .map((p) => {
      const sold = soldMap.get(p.key) ?? 0;
      const myCount = mineByPrize.get(p.key) ?? 0;
      return {
        key: p.key, icon: p.icon, name: p.name, valueLabel: p.valueLabel,
        price: p.price, limit: p.limit, sold, remaining: Math.max(0, p.limit - sold), soldOut: sold >= p.limit,
        // ⚠️ Imkoniyat LIMIT bo'yicha hisoblanadi, "hozirgacha sotilgan" bo'yicha EMAS.
        // Sotilgan bo'yicha hisoblansa birinchi xaridor "≈100%" ni ko'rardi va o'sha son keyin
        // o'zi hech narsa qilmasdan 100% → 12% ga tushardi — ishonch buzadigan raqam.
        // Limit bo'yicha: raqam faqat O'SADI (yana chipta olsang) — va'da haqiqatga aylanadi.
        mine: myCount, chancePct: myCount > 0 && p.limit > 0 ? Math.round((myCount / p.limit) * 10000) / 100 : null,
        photoUrl: p.photoUrl,
        // 🛡 Shart OLDINDAN ko'rsatiladi. Mijoz ball sarflaganidan KEYIN "yetarli sotilmadi"
        // deb eshitmasligi kerak — bu ishonchni bir marta va butunlay buzadi.
        minSell: minSellOf(p.limit, minPct),
        willDraw: sold >= minSellOf(p.limit, minPct),
        // 🔴 `soldOut` ≠ `drawn` — sold>=limit "o'rinlar tugadi" degani, tiraj (g'olib yozilishi)
        // esa BUTUNLAY BOSHQA hodisa (odatda mavsum oxirida). Arxiv shu maydonga qaraydi.
        drawn: drawnKeys.has(p.key),
      };
    });
  return { prizes, sponsor: { name: sponsor.name, photoUrl: sponsor.photoUrl } };
}

// ── Sovrin-katalog (admin, to'liq CRUD — 2026-08-02) — Homiy bilan bir xil naqsh: BITTA AppState
// qatorida (`oyin:catalog`) JSON massiv, yangi Prisma model YO'Q. Birinchi o'qishda bo'sh bo'lsa
// OYIN_SEED_CATALOG bilan urug'lanadi va shu holda saqlanadi (shundan keyin faqat admin o'zgartiradi,
// seed massiv qayta o'qilmaydi). `oyin_sold:<key>` hisoblagichlari kalit nomiga bog'liq — shuning
// uchun chin o'chirish faqat sold=0 bo'lganda ruxsat etiladi (aks holda "yetim" hisoblagich qoladi).
const CATALOG_KEY = "oyin:catalog";

// ⚠️ VALIDATSIYA (2026-08-03). `adminUpsertPrize` YOZUVDA narxni qo'riqlaydi ("`1e999` → Infinity
// → JSON `null` → `ball < price` = false → chiptalar BEPUL"), lekin O'QISHDA hech qanday tekshiruv
// yo'q edi: qator qo'lda tahrirlangan/eski formatda bo'lsa o'sha bepul-chipta yo'li ochiq qolardi.
// Ikkinchi qavat: narx yaroqsiz bo'lsa sovrin `active:false` ga tushadi — vitrinada ko'rinmaydi va
// `buyTicket` (u faqat `active` sovrinni topadi) uni umuman sotmaydi.
function parseCatalog(raw: string | undefined): OyinCatalogPrize[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    const out: OyinCatalogPrize[] = [];
    for (const item of arr) {
      if (!item || typeof item !== "object") continue;
      const p = item as Record<string, unknown>;
      const key = typeof p.key === "string" ? p.key.trim() : "";
      if (!key) continue; // kalitsiz qatorni `oyin_sold:` hisoblagichiga bog'lab bo'lmaydi
      const price = Number(p.price);
      const limit = Number(p.limit);
      const priceOk = Number.isFinite(price) && price >= 1;
      const limitOk = Number.isFinite(limit) && limit >= 1;
      if (!priceOk || !limitOk) {
        console.warn(`[oyin] katalogda buzuq sovrin (${key}): narx=${String(p.price)} limit=${String(p.limit)} — yashirildi`);
      }
      out.push({
        key,
        icon: typeof p.icon === "string" && p.icon ? p.icon : "🎁",
        name: typeof p.name === "string" && p.name ? p.name : key,
        valueLabel: typeof p.valueLabel === "string" ? p.valueLabel : "",
        price: priceOk ? Math.round(price) : 1,
        limit: limitOk ? Math.round(limit) : 0,
        photoUrl: typeof p.photoUrl === "string" && p.photoUrl ? p.photoUrl : null,
        active: p.active === true && priceOk && limitOk,
        // 🔴 BUG (S5 agenti topdi, 2026-08-04): bu qator YO'Q edi va butun NAVBAT o'lik edi.
        // `parseCatalog` har o'qishda yangi obyekt yasaydi — `queued` nusxalanmagani uchun
        // (a) `stageOf` hech qachon "queued" qaytarmasdi, (b) `adminUpsertPrize` yangi mukofotni
        // `queued:true` bilan yozardi-yu, KEYINGI har saqlash butun katalogni `queued`siz qayta
        // yozib navbat holatini YO'Q QILARDI. Ya'ni S2 ning asosiy funksiyasi ishlamasdi.
        // ⚠️ Faqat qat'iy `true` — buzuq qiymat mukofotni jimgina yashirib qo'ymasin.
        ...(p.queued === true ? { queued: true as const } : {}),
      });
    }
    return out;
  } catch {
    return [];
  }
}

// `export` — K8 (`oyinCommentService.ts`) sovrin nomini komentariya-admin qatorida ko'rsatish
// uchun qayta ishlatadi.
export async function getCatalog(): Promise<OyinCatalogPrize[]> {
  const row = await prisma.appState.findUnique({ where: { key: CATALOG_KEY } });
  if (!row) {
    // NUSXA qaytariladi: `adminUpsertPrize` `Object.assign(existing, …)` / `catalog.push()`
    // qiladi — havola qaytarilsa EKSPORT QILINGAN konstanta xotirada buzilardi va keyingi
    // har seed-fallback buzuq holatni tarqatardi.
    await saveCatalog(OYIN_SEED_CATALOG).catch(() => undefined);
    return OYIN_SEED_CATALOG.map((p) => ({ ...p }));
  }
  // ⚠️ Bo'sh massiv — EGANING ONGLI QARORI ("hamma seed sovrinni o'chirdim, o'zimnikini
  // qo'yaman"), xato emas. Avval bu yerda `parsed.length ? parsed : OYIN_SEED_CATALOG`
  // turardi va o'chirilgan 5 ta seed sovrin QAYTIB kelardi: mijoz mavjud bo'lmagan
  // "Air Fryer" ga chipta olardi, keyingi upsert esa fantomlarni bazaga YOZIB qo'yardi.
  return parseCatalog(row.value);
}

async function saveCatalog(catalog: OyinCatalogPrize[]): Promise<void> {
  const value = JSON.stringify(catalog);
  await prisma.appState.upsert({ where: { key: CATALOG_KEY }, create: { key: CATALOG_KEY, value }, update: { value } });
}

/** 🔒 KATALOGNI ATOMIK O'ZGARTIRISH (nazoratchi 2026-08-04, №8).
 *
 *  Avval to'rtta funksiya (`autoOpenPrizes` · `adminUpsertPrize` · `adminSetPrizeActive` ·
 *  `adminDeletePrize`) bitta `oyin:catalog` qatorini QULFSIZ o'qib-o'zgartirib-yozardi.
 *  `buyTicket` esa har xaridda `void autoOpenPrizes()` ni KUTMASDAN uchiradi — ya'ni
 *  to'qnashuv oynasi kun bo'yi ochiq edi. Natija: ega narxni tahrirlayotgan lahzada xarid
 *  bo'lsa TAHRIR JIMGINA YO'QOLADI (yoki teskarisi — endigina ochilgan mukofot navbatga
 *  qaytadi). Hech qanday xato belgisi yo'q — eng yomon turdagi bug.
 *
 *  CAS: `WHERE value = <o'qilgan qiymat>`. Orada kimdir yozgan bo'lsa `n === 0` bo'ladi va
 *  biz QAYTA O'QIB qayta uriniladi — ya'ni o'zgarish yo'qolmaydi, ustma-ust tushadi.
 *  `mutate` `null` qaytarsa — o'zgarish shart emas. */
async function mutateCatalog(
  mutate: (cur: OyinCatalogPrize[]) => OyinCatalogPrize[] | null,
  /** ↩ Nusxa yorlig'i (2026-08-10). Berilsa — YOZUVDAN OLDINGI holat nusxaga olinadi va ega
   *  uni bitta bosishda qaytara oladi. Berilmasa nusxa olinmaydi: `autoOpenPrizes` kabi
   *  AVTOMATIK o'zgarishlar tarixni to'ldirib, eganing o'z tahrirlarini siqib chiqarmasin. */
  snapshotLabel?: string,
): Promise<boolean> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const row = await prisma.appState.findUnique({ where: { key: CATALOG_KEY } });
    if (!row) {
      const next = mutate(OYIN_SEED_CATALOG.map((p) => ({ ...p })));
      if (!next) return false;
      try {
        await prisma.appState.create({ data: { key: CATALOG_KEY, value: JSON.stringify(next) } });
        return true;
      } catch { continue; } // parallel `create` bizdan oldin ulgurdi — qayta o'qiymiz
    }
    const next = mutate(parseCatalog(row.value));
    if (!next) return false;
    const value = JSON.stringify(next);
    const n = await prisma.$executeRaw`UPDATE "AppState" SET "value" = ${value} WHERE "key" = ${CATALOG_KEY} AND "value" = ${row.value}`;
    if (n === 1) {
      // Nusxa YOZUV MUVAFFAQIYATLI bo'lgandan KEYIN olinadi — CAS urinishi behuda ketgan
      // bo'lsa tarixga soxta qator tushmasin.
      if (snapshotLabel) void pushCatalogSnapshot(row.value, snapshotLabel);
      return true;
    }
  }
  console.error("[oyin] mutateCatalog: 5 urinishda ham yozilmadi — katalog band");
  return false;
}

async function getSoldMap(): Promise<Map<string, number>> {
  const rows = await prisma.appState.findMany({ where: { key: { startsWith: "oyin_sold:" } } });
  const map = new Map<string, number>();
  for (const row of rows) map.set(row.key.slice("oyin_sold:".length), Number(row.value) || 0);
  return map;
}

function slugify(name: string): string {
  const base = name.trim().toLowerCase().replace(/[^a-z0-9а-яё'ʻʼ]+/gi, "-").replace(/^-+|-+$/g, "");
  return base.slice(0, 40) || "sovrin";
}
function uniqueCatalogKey(name: string, existing: OyinCatalogPrize[]): string {
  const base = slugify(name);
  if (!existing.some((p) => p.key === base)) return base;
  let i = 2;
  while (existing.some((p) => p.key === `${base}-${i}`)) i++;
  return `${base}-${i}`;
}

/** Admin: butun katalog, har biriga sotilgan-son qo'shilgan (o'chirish xavfsizligini ko'rsatish uchun). */
/** 📋 Mukofotning navbat holati. `queued` maydoni YO'Q bo'lsa — ochiq (eski katalog moslik). */
/** 💰 Narx -> eng YAQIN daraja. Teng-solishtiruv EMAS: jonli katalog narxlari erkin
 *  (ega qo'lda kiritadi), shuning uchun `price === OYIN_TIERS[t]` hech qachon mos kelmaydi. */
export function tierOfPrice(price: number): OyinTier {
  const entries = Object.entries(OYIN_TIERS) as [OyinTier, number][];
  let bestT: OyinTier = "orta";
  let bestD = Infinity;
  for (const [t, b] of entries) {
    const d = Math.abs(b - price);
    if (d < bestD) { bestD = d; bestT = t; }
  }
  return bestT;
}

function stageOf(p: OyinCatalogPrize, sold: number): OyinPrizeStage {
  if (sold >= p.limit) return "filled";
  return p.queued === true ? "queued" : "open";
}

export async function adminListCatalog(): Promise<OyinAdminPrizeRow[]> {
  const [catalog, soldMap, econC] = await Promise.all([getCatalog(), getSoldMap(), getBonusEcon()]);
  const minPct = econC.oyinMinSellPct ?? OYIN_MIN_SELL_PCT_DEFAULT;
  return catalog.map((p) => {
    const sold = soldMap.get(p.key) ?? 0;
    const minSell = minSellOf(p.limit, minPct);
    return { ...p, sold, minSell, willDraw: sold >= minSell, stage: stageOf(p, sold) };
  });
}

/** 🧮 Sof hisob — DB'siz sinaladi (simGuards). Qolgan o'rin + so'nggi 7 kunlik sotuvdan
 *  "necha kunda to'ladi" chiqaradi. `null` = ma'lumot yetarli emas (so'nggi 7 kunda sotuv
 *  yo'q) — 0ga bo'lib cheksiz/yolg'on raqam chiqarmaslik uchun ATAYLAB `null`, `Infinity` emas. */
export function projectedDaysToFill(remaining: number, soldLast7d: number): number | null {
  if (remaining <= 0) return 0;
  const perDay = soldLast7d / 7;
  return perDay > 0 ? Math.ceil(remaining / perDay) : null;
}

/** 📊 2026-08-07 (ega so'rovi): "qaysi sovg'aga yaqin, qanday tez to'lyapti" — admin
 *  "Bir qarashda" paneli uchun. `adminListCatalog`dan ATAYLAB ALOHIDA: bu butun
 *  `oyin:tickets:*` jadvalini skanerlaydi (og'ir), `adminListCatalog` esa har sovrin
 *  CRUD amalidan keyin ham chaqiriladi — birlashtirsak har tahrirda keraksiz to'liq skan
 *  qo'shilardi. Sinov chiptalar (`test: true`) tezlikka KIRMAYDI — haqiqiy talabni
 *  bo'yaydi. Proyeksiya faqat sof "so'nggi 7 kunlik o'rtacha" — trend/tezlashish
 *  hisobga olinmaydi (v1, ega ko'rib "yetarli" desa shu holda qoladi). */
export async function getPrizeVelocity(): Promise<OyinPrizeVelocity[]> {
  const [catalog, soldMap, ticketRows] = await Promise.all([
    getCatalog(),
    getSoldMap(),
    prisma.appState.findMany({ where: { key: { startsWith: "oyin:tickets:" } } }) as Promise<AppStateRow[]>,
  ]);
  const DAY_MS = 24 * 60 * 60 * 1000;
  const cutoff7 = Date.now() - 7 * DAY_MS;
  const soldLast7d = new Map<string, number>();
  for (const row of ticketRows) {
    for (const t of parseTickets(row.value)) {
      if (t.test) continue;
      const at = Date.parse(t.ts);
      if (!Number.isFinite(at) || at < cutoff7) continue;
      soldLast7d.set(t.prizeKey, (soldLast7d.get(t.prizeKey) ?? 0) + 1);
    }
  }
  return catalog.map((p) => {
    const sold = soldMap.get(p.key) ?? 0;
    const last7d = soldLast7d.get(p.key) ?? 0;
    const remaining = Math.max(0, p.limit - sold);
    return { key: p.key, soldLast7d: last7d, projectedDays: projectedDaysToFill(remaining, last7d) };
  });
}

/** 🛡 SIG'IM O'LCHOVI — o'yinni o'ldiradigan yagona holatni ushlaydi: odamda ball bor, sotib
 *  oladigan narsa yo'q. Panel buni BITTA qator qilib ko'rsatadi. */
export async function getCapacity(): Promise<OyinCapacityView> {
  const [catalog, soldMap, map] = await Promise.all([getCatalog(), getSoldMap(), computeBallMap()]);
  let circulatingBall = 0;
  for (const row of map.values()) circulatingBall += row.breakdown.ball;

  let openBall = 0;
  let openCount = 0;
  let queuedCount = 0;
  let filledCount = 0;
  const openTiers = new Set<OyinTier>();
  // 🟡 (nazoratchi 2026-08-04 №6): avval `p.price === OYIN_TIERS[t]` BITMA-BIT solishtirilardi.
  // Jonli katalogda birorta narx tier qiymatiga TENG EMAS (1000·4000·6000·11700·16700 vs
  // 600·1200·2400·3600), ya'ni har mukofot "darajasiz" edi. Uch oqibat: panelda o'chmaydigan
  // sariq ogohlantirish · «Navbatdan ochish» tugmasi hech narsa qilmasdi (`opened: []`) ·
  // `getCapacity` tez-chiqishi ishlamay HAR xaridda butun `computeBallMap()` qayta hisoblanardi.
  // Endi narx eng YAQIN darajaga bog'lanadi — daraja o'lchov, teng-solishtiruv emas.
  for (const p of catalog) {
    if (!p.active) continue;
    const sold = soldMap.get(p.key) ?? 0;
    const st = stageOf(p, sold);
    if (st === "filled") { filledCount++; continue; }
    if (st === "queued") { queuedCount++; continue; }
    openCount++;
    // ⚠️ QOLGAN o'rinlar, limit EMAS: sotilgan karta endi sig'im emas, u allaqachon yeyilgan.
    openBall += Math.max(0, p.limit - sold) * p.price;
    openTiers.add(tierOfPrice(p.price));
  }
  const missingTiers = (Object.keys(OYIN_TIERS) as OyinTier[]).filter((t) => !openTiers.has(t));
  // Xalqda ball bo'lmasa nisbat cheksiz — `healthy: true`, lekin NaN/Infinity ekranga chiqmasin.
  const ratio = circulatingBall > 0 ? openBall / circulatingBall : (openBall > 0 ? OYIN_CAPACITY_RATIO : 0);
  return {
    openBall, circulatingBall,
    ratio: Number.isFinite(ratio) ? Math.round(ratio * 100) / 100 : 0,
    healthy: circulatingBall === 0 || ratio >= OYIN_CAPACITY_RATIO,
    openCount, queuedCount, filledCount, missingTiers,
  };
}

/** 📋 NAVBATDAN OCHISH — sig'im chegaradan tushganda yoki daraja bo'sh qolganda.
 *
 *  Ikki mezon bo'yicha ochadi:
 *   1. Bo'sh qolgan DARAJA — eng arzon navbatdagi mukofot (800 balli odam qamalib qolmasin)
 *   2. Sig'im < 1,5× — yetguncha, `OYIN_MAX_OPEN_PRIZES` gacha
 *
 *  ⚠️ Yangi poller YO'Q (ARCHITECTURE.md invarianti): bu funksiya xariddan keyin va admin
 *  paneli ochilganda chaqiriladi. Ochish IDEMPOTENT — ochilgan mukofot qayta ochilmaydi. */
export async function autoOpenPrizes(): Promise<{ opened: string[]; reason: string }> {
  const cap = await getCapacity();
  if (cap.healthy && cap.missingTiers.length === 0) return { opened: [], reason: "sig'im yetarli" };
  if (cap.openCount >= OYIN_MAX_OPEN_PRIZES) {
    return { opened: [], reason: `ochiq mukofotlar shipi (${OYIN_MAX_OPEN_PRIZES}) — pul oqimi qo'rig'i` };
  }

  const [catalog, soldMap] = await Promise.all([getCatalog(), getSoldMap()]);
  const queued = catalog
    .filter((p) => p.active && p.queued === true && (soldMap.get(p.key) ?? 0) < p.limit)
    .sort((a, b) => a.price - b.price); // arzondan boshlanadi — bo'sh darajalarni tezroq yopadi
  if (queued.length === 0) return { opened: [], reason: "navbat BO'SH — yangi mukofot yuklang" };

  const opened: string[] = [];
  let openBall = cap.openBall;
  let openCount = cap.openCount;
  const need = cap.circulatingBall * OYIN_CAPACITY_RATIO;
  const missing = new Set(cap.missingTiers);

  for (const p of queued) {
    if (openCount >= OYIN_MAX_OPEN_PRIZES) break;
    const tier = tierOfPrice(p.price);
    const fillsGap = missing.has(tier);
    // 🟡 (nazoratchi №7): avval `fillsGap` sig'im shartini BUTUNLAY aylanib o'tardi — xalqda
    // 10 ball, ochiq sig'im 60 000 ball (4 000× ortiqcha) bo'lsa ham yana 3 ta mukofot
    // ochilardi. `oyinMinSellPct = 100` bilan birga bu ballni ko'proq mukofotga tarqatib
    // HECH BIRI to'lmasligiga olib kelardi — navbat mexanizmi aynan shu o'limni to'sish uchun
    // qurilgan edi. Endi daraja teshigi HAM sig'im shipiga bo'ysunadi, faqat shipi kengroq.
    const gapCeiling = need * 2;
    if (openBall >= (fillsGap ? gapCeiling : need)) break;
    p.queued = false;
    opened.push(p.key);
    openBall += Math.max(0, p.limit - (soldMap.get(p.key) ?? 0)) * p.price;
    openCount++;
    if (tier != null) missing.delete(tier);
  }
  if (opened.length === 0) return { opened: [], reason: "mos mukofot topilmadi" };
  // №8: qaror yuqorida (o'qish nusxasida) qabul qilindi, YOZUV esa kalit bo'yicha CAS ichida —
  // shunda parallel admin tahriri yo'qolmaydi. Ichkarida QAYTA tekshiriladi: orada mukofot
  // o'chirilgan yoki allaqachon ochilgan bo'lishi mumkin.
  const wanted = new Set(opened);
  const applied: string[] = [];
  await mutateCatalog((cur) => {
    applied.length = 0;
    for (const p of cur) if (wanted.has(p.key) && p.queued === true) { p.queued = false; applied.push(p.key); }
    return applied.length > 0 ? cur : null;
  });
  if (applied.length === 0) return { opened: [], reason: "orada boshqa so'rov ochib bo'lgan" };
  return { opened: applied, reason: `sig'im ${cap.ratio}× → ochildi` };
}

/** 💰 Mavsum byudjeti — REAL safar sonidan. Bu funksiya panelning eng muhim raqamini beradi:
 *  katalog qancha turishi MUMKIN. Avval panel teskari ishlardi (sovrin qo'yilgach foiz aytilardi)
 *  va jonli katalog 1003% bo'lib qolgan edi. */
export async function adminBudget(): Promise<OyinBudgetView> {
  const [season, catalog, econB] = await Promise.all([getSeason(), getCatalog(), getBonusEcon()]);
  const since = new Date(Date.now() - 30 * 86400_000);
  // ⚠️ Taxmin EMAS: o'tgan 30 kunning haqiqiy safarlari. `RideReward` — clamp'dan o'tgan real
  // safar yozuvi, ya'ni "buyurtma bo'ldi" emas, "safar tugadi va mukofot berildi".
  const rides30d = await prisma.rideReward.count({ where: { createdAt: { gte: since } } });
  const seasonDays = season.configured && season.startMs != null && season.endMs != null
    ? Math.max(1, Math.round((season.endMs - season.startMs) / 86400_000))
    : 30;
  const projectedRides = Math.round(rides30d * (seasonDays / 30));
  // ⚠️ TUZATILDI (nazoratchi agent 2026-08-04). Avval bu son BALL SHKALASIDAN chiqarilardi:
  //   `(oyinRideBall + oyinReferRideBall) × OYIN_SOM_PER_BALL`
  // Bu eski langarda tasodifan to'g'ri chiqardi (150+50) × 10 = 2 000. Yangi jadval bilan esa
  // (35+10) × 20 = 900 so'm — ya'ni byudjet kartasi daromadni 2,2× KAM ko'rsatardi va sig'adigan
  // katalogda ham "byudjetdan oshdi" deb qizil yonardi.
  // Endi bevosita: komissiya — MAHSULOT fakti, ball shkalasi esa mustaqil dial. Ikkalasi
  // bog'lanmasligi kerak, aks holda knob o'zgarganda daromad "o'zgarib ketadi".
  const somPerRide = OYIN_SOM_PER_RIDE;
  const revenueSom = projectedRides * somPerRide;
  const budgetSom = Math.round((revenueSom * OYIN_TARGET_COST_PCT) / 100);
  // 🟡 (nazoratchi №10): navbatdagi mukofot hali PUL EMAS — sotuvga qo'yilmagan. Filtrsiz
  // ega 100 ta yuklashi bilan «🔴 Katalog byudjetdan OSHIB KETDI» yonardi, o'sha ekranning
  // o'zida esa "navbat bepul" deb yozilgan edi — bir savolga ikki xil javob.
  const catalogSom = catalog
    .filter((p) => p.active && p.queued !== true)
    .reduce((s, p) => s + (parseSumLabel(p.valueLabel) ?? 0), 0);
  return {
    rides30d, seasonDays, projectedRides, somPerRide, revenueSom, budgetSom,
    catalogSom, overBudget: catalogSom > budgetSom, targetPct: OYIN_TARGET_COST_PCT,
  };
}

/** `valueLabel` — ega qo'lda yozadigan matn ("900 000 so'm", "1 mln", "189000"). Raqamni
 *  ajratib olamiz; topilmasa `null` (byudjet hisobida 0 deb olinadi va panel buni AYTADI). */
function parseSumLabel(label: string): number | null {
  const digits = (label || "").replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// 🎯 Maqsad-sovrin (YAKUNIY DIZAYN §1): mijoz qaysi sovrin uchun ball yig'ayotganini O'ZI
// tanlaydi. Avval tizim eng arzonini avtomatik olardi — mavhum "340 ball" o'rniga
// "Choy servizgacha 660 qoldi" degan aniq maqsad ancha kuchli.
const GOAL_PREFIX = "oyin:goal:";

export async function setGoalPrize(memberId: number, prizeKey: string): Promise<{ ok: boolean }> {
  const catalog = await getCatalog();
  // Faol bo'lmagan/mavjud bo'lmagan sovrin maqsad bo'la olmaydi (hero bo'sh qolmasin).
  // Navbatdagi mukofot maqsad qilib QO'YILMAYDI — hero ko'rinmaydigan sovringa ishora qilardi.
  if (!catalog.some((p) => p.key === prizeKey && p.active && p.queued !== true)) return { ok: false };
  const key = `${GOAL_PREFIX}${memberId}`;
  await prisma.appState.upsert({ where: { key }, create: { key, value: prizeKey }, update: { value: prizeKey } });
  return { ok: true };
}

/** 🎟 Mijozning mavsum chiptalari — sovrin nomi/rasmi bilan birga. Chipta raqami avval faqat
 *  bayram-oynasida bir marta ko'rinardi va qayta ko'rishning YO'LI yo'q edi. */
export async function myTickets(memberId: number): Promise<OyinMyTicketsResponse> {
  const [season, catalog, row, soldMap, econ] = await Promise.all([
    getSeason(),
    getCatalog(),
    prisma.appState.findUnique({ where: { key: `oyin:tickets:${memberId}` } }),
    getSoldMap(),
    getBonusEcon(),
  ]);
  if (!season.configured) return { tickets: [], drawIso: null };
  const byKey = new Map(catalog.map((p) => [p.key, p]));
  const minPct = econ.oyinMinSellPct ?? OYIN_MIN_SELL_PCT_DEFAULT;
  const tickets = (await Promise.all(parseTickets(row?.value)
    .map(async (t) => {
      const p = byKey.get(t.prizeKey);
      // 🛡 Sovrin katalogdan o'chirilgan bo'lsa (`p` yo'q) — qoidasi bilinmaydi, xavfsiz
      // taraf: `willDraw: true` (bekor qilib bo'lmaydi, admin qo'lida qoladi).
      const sold = soldMap.get(t.prizeKey) ?? 0;
      const minSell = p ? minSellOf(p.limit, minPct) : 0;
      const willDraw = !p || minSell <= 0 || sold >= minSell;
      const gno = t.gno ?? t.no; // eski chiptalarda global raqam yo'q — sovrin-ichi raqami ko'rsatiladi
      return {
        prizeKey: t.prizeKey,
        // Sovrin katalogdan o'chirilgan bo'lsa ham chipta YO'QOLMAYDI — kalitni ko'rsatamiz.
        prizeName: p?.name ?? t.prizeKey,
        prizeIcon: p?.icon ?? "🎟",
        photoUrl: p?.photoUrl ?? null,
        gno,
        code: await encodeCardCode(gno), // 🔐 K1 — ko'rinadigan raqam
        no: t.no,
        at: t.ts,
        price: t.priceAtPurchase,
        // 🧪 Ekranda OCHIQ belgilanadi. Yashirilsa ega o'z sinov chiptasini haqiqiy deb o'ylab
        // tirajni kutib qolardi — va "nega yutmadim" savoli javobsiz bo'lardi.
        ...(t.test ? { test: true } : {}),
        // 🏆 Natija endi mijozga UZATILADI (2026-08-12). Ma'lumot bazada allaqachon bor edi
        // (`adminRecordWinner` yozadi) — faqat javobga qo'shilmagan edi.
        ...(t.result ? { result: t.result } : {}),
        willDraw,
      };
    })))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return { tickets, drawIso: season.endIso };
}

/** 🎟 Mijoz O'ZI chegaraga yetmagan (hozircha tirajda o'ynalmaydigan) kartasini bekor qiladi —
 *  ball qaytadi. Ega qarori (2026-08-06): mijoz ball "abadiy band" qolib ketmasligi uchun o'zi
 *  chiqib, boshqa sovringa sarflay olishi kerak — avval bu FAQAT admin qo'lida edi.
 *  ⚠️ ATAYLAB faqat "hozircha yetmagan" holatda: g'olib bo'lish ehtimoli bor (tirajga tushadigan)
 *  kartani bekor qilishga ruxsat YO'Q — buning hojati yo'q va chalkash bo'lardi. Yadro
 *  `adminCancelTicket` bilan BIR XIL (`releaseSoldSlot`), faqat ikkita qo'shimcha qo'riq bor. */
export async function cancelOwnTicket(memberId: number, gno: number): Promise<OyinCancelTicketResult> {
  const season = await getSeason();
  if (season.phase !== "active") return { ok: false, reason: "season_off" };
  if (season.endMs != null && season.endMs - Date.now() <= OYIN_FINAL_LOCK_MS) return { ok: false, reason: "final_lock" };

  // 🔒 B2 (2026-08-16 audit): `buyTicket` bilan BIR XIL a'zo-qulfi. Avval bu yerda qulf YO'Q edi —
  // ikkita bekor qilish (masalan ikki marta bosish/qayta urinish) BIR XIL kartani PARALEL o'qib-
  // yozardi va `releaseSoldSlot` IKKI MARTA chaqirilardi (bitta bekor qilish ikkita o'rinni
  // bo'shatardi — izolyatsiyalangan test-bazada qayta hosil qilingan, isbotlangan xato).
  return withMemberLock(memberId, async () => {
    const key = `oyin:tickets:${memberId}`;
    const row = await prisma.appState.findUnique({ where: { key } });
    if (!row) return { ok: false, reason: "not_found" };
    const tickets = parseTickets(row.value);
    const idx = tickets.findIndex((t) => (t.gno ?? t.no) === gno);
    if (idx < 0) return { ok: false, reason: "not_ticket" };
    const target = tickets[idx];
    if (!target) return { ok: false, reason: "not_ticket" };
    // 🔴 O11 (2026-08-12, jonli tekshiruvda topilgan): O'TGAN mavsumda olingan karta ATAYLAB
    // rad etiladi. Sabab: `spent` joriy mavsum oynasidan filtrlanadi (yuqoridagi izoh) — o'tgan
    // mavsum kartasining narxi hozirgi balansda UMUMAN hisobga olinmaydi. Uni bekor qilish shu
    // sababdan mijozga bir tiyin ham ball qaytarmaydi (qaytaradigan narsa yo'q), lekin
    // `releaseSoldSlot` baribir sovg'aning umumiy sotuv sanog'ini kamaytiradi — ya'ni to'lib
    // kelayotgan (keyingi mavsumga o'tgan) sovg'a ORQAGA tepadi, mijoz esa kartasini bekorga
    // yo'qotadi. Karta faqat O'Z mavsumida bekor qilinadi.
    if (target.ts && Date.parse(target.ts) < (season.startMs ?? -Infinity)) {
      return { ok: false, reason: "past_season" };
    }
    // 🔒 BEKOR QILISH OYNASI (2026-08-12, ega talabi — "karta bekor qilib bo'lopti" — jonlida
    // buzilgan holat topildi). Avval bu yerda hech qanday vaqt cheklovi YO'Q edi: `sold<minSell`
    // bo'lgan ekan, karta OYLAR OLDIN olingan bo'lsa ham bekor bo'lardi. Reja (§2) buni "faqat
    // barmoq xatosi uchun qisqa oyna, keyin abadiy" deb belgilagan — busiz mijoz yangi (jozibali)
    // sovg'a ochilganda eskisidan ko'chib o'tishi mumkin edi, eski sovg'a esa hech qachon to'lmasdi.
    if (target.ts && Date.now() - Date.parse(target.ts) > OYIN_CANCEL_WINDOW_MS) {
      return { ok: false, reason: "too_late" };
    }

    const [catalog, soldMap, econ] = await Promise.all([getCatalog(), getSoldMap(), getBonusEcon()]);
    const prize = catalog.find((p) => p.key === target.prizeKey);
    const minPct = econ.oyinMinSellPct ?? OYIN_MIN_SELL_PCT_DEFAULT;
    const minSell = prize ? minSellOf(prize.limit, minPct) : 0;
    const sold = soldMap.get(target.prizeKey) ?? 0;
    if (!prize || minSell <= 0 || sold >= minSell) return { ok: false, reason: "will_draw" };

    tickets.splice(idx, 1);
    await prisma.appState.update({ where: { key }, data: { value: JSON.stringify(tickets) } });
    await releaseSoldSlot(target.prizeKey, target.test === true).catch(() => undefined);
    invalidateBallCache();
    return { ok: true, ball: await getBall(memberId) };
  });
}

/** 👀 Mehmon-teaser: sovrinlar + mavsum holati. A'zo ma'lumoti YO'Q, shuning uchun auth kerak emas. */
export async function teaserData(): Promise<OyinTeaserResponse> {
  const [season, catalog, sponsor] = await Promise.all([getSeason(), getCatalog(), getSponsor()]);
  return {
    season: { configured: season.configured, phase: season.phase, label: season.label, startIso: season.startIso, endIso: season.endIso },
    sponsor: { name: sponsor.name, photoUrl: sponsor.photoUrl },
    // Mehmon ekrani: navbatdagi CHIQARILADI, aks holda eng qimmat, sotib bo'lmaydigan
    // mukofot birinchi turardi (tartib narx bo'yicha kamayuvchi).
    prizes: catalog.filter((p) => p.active && p.queued !== true).sort((a, b) => b.price - a.price)
      .map((p) => ({ key: p.key, icon: p.icon, name: p.name, valueLabel: p.valueLabel, price: p.price, limit: p.limit, photoUrl: p.photoUrl })),
  };
}

/** 🤝 Taklif-kartochkasi uchun (bot/oyin.ts) — eng qimmat FAOL sovrin + jami o'rin soni.
 *  Mavsum yopiq bo'lsa `null` (kartochka umuman yuborilmaydi — yolg'on va'da bermaymiz). */
export async function joinCardData(): Promise<{ prizeName: string; photoUrl: string | null; icon: string; slots: number; seasonLabel: string | null } | null> {
  const season = await getSeason();
  if (season.phase !== "active" && season.phase !== "upcoming") return null;
  const catalog = (await getCatalog()).filter((p) => p.active && p.queued !== true);
  if (!catalog.length) return null;
  const top = [...catalog].sort((a, b) => b.price - a.price)[0] as OyinCatalogPrize;
  return {
    prizeName: top.name,
    photoUrl: top.photoUrl,
    icon: top.icon,
    slots: catalog.reduce((s, p) => s + p.limit, 0),
    seasonLabel: season.label,
  };
}

/** Admin: sovrin qo'shish (key bo'sh/topilmasa) yoki tahrirlash (key mavjud bo'lsa). */
export async function adminUpsertPrize(input: OyinPrizeUpsertInput): Promise<OyinAdminPrizeRow[]> {
  const soldMap = await getSoldMap();
  const name = (input.name || "").trim().slice(0, 60) || "Sovrin";
  const icon = (input.icon || "🎁").trim().slice(0, 8) || "🎁";
  const valueLabel = (input.valueLabel || "").trim().slice(0, 60);
  // `Number.isFinite` MAJBURIY: `1e999` → Infinity → JSON.stringify → `null` → keyin
  // `ball < prize.price` solishtiruvi `false` bo'lib chiptalar BEPUL tarqalardi.
  const priceRaw = Number(input.price);
  const price = Math.max(1, Math.round(Number.isFinite(priceRaw) ? priceRaw : 0));
  const limitRaw = Math.max(1, Math.round(Number(input.limit) || 0));
  const photoUrl = input.photoUrl?.trim().slice(0, 500) || null;

  // 📋 Navbat bayrog'i. Tahrirlashda BERILMASA eski holat saqlanadi (ochiq mukofot tasodifan
  // navbatga qaytib qolmasin — mijoz uni ko'rib turgan bo'lishi mumkin).
  const queued = typeof input.queued === "boolean" ? input.queued : undefined;
  // 🛡 `limit < sold` SERVERDA to'siladi. Admin panelda tasdiq oynasi bor, LEKIN u faqat klientda —
  // to'g'ridan-to'g'ri API so'rovi (yoki eski panel tab'i) uni aylanib o'tadi. Limit sotilganidan
  // past qo'yilsa allaqachon chipta olganlarning yutish ehtimoli JIM o'zgaradi (ular buni hech
  // qachon bilmaydi) va `reserveSoldSlot` keyingi har xaridni rad etadi — ya'ni sovrin "tugagan"
  // ko'rinadi. Shuning uchun limit sotilganidan PAST tushirilmaydi: sotilganiga qisiladi.
  // №8: butun o'zgartirish CAS ichida — ega tahrirlayotgan lahzada `autoOpenPrizes` (xariddan)
  // yozsa, tahrir yo'qolmaydi: qayta o'qib ustma-ust tushadi.
  await mutateCatalog((catalog) => {
    const existing = input.key ? catalog.find((p) => p.key === input.key) : undefined;
    const sold = existing ? (soldMap.get(existing.key) ?? 0) : 0;
    const limit = Math.max(limitRaw, sold);
    if (limit !== limitRaw) {
      console.warn(`[oyin] adminUpsertPrize: "${existing?.key}" limiti ${limitRaw} → ${limit} ga ko'tarildi (allaqachon ${sold} ta sotilgan; chipta egalarining ehtimoli jim o'zgarmasin)`);
    }
    if (existing) {
      Object.assign(existing, { name, icon, valueLabel, price, limit, photoUrl, ...(queued !== undefined ? { queued } : {}) });
    } else {
      // Yangi mukofot DEFAULT bo'yicha NAVBATGA tushadi. Sabab: ega 100 ta yuklaganda hammasi
      // birdan ochilib ketmasin — ball tarqalib hech biri to'lmaydi (to'lish-qulfi bilan bu o'lim).
      catalog.push({ key: uniqueCatalogKey(name, catalog), icon, name, valueLabel, price, limit, photoUrl, active: true, queued: queued ?? true });
    }
    return catalog;
  });
  return adminListCatalog();
}

/** Admin: vitrinadan yashirish/qaytarish — chin o'chirishning xavfsiz muqobili. */
export async function adminSetPrizeActive(key: string, active: boolean): Promise<OyinAdminPrizeRow[]> {
  await mutateCatalog((cur) => {
    const existing = cur.find((p) => p.key === key);
    if (!existing || existing.active === active) return null;
    existing.active = active;
    return cur;
  });
  return adminListCatalog();
}

/** Admin: chin o'chirish — FAQAT sotilgan chiptasi yo'q sovrinlar uchun (aks holda active:false tavsiya). */
export async function adminDeletePrize(key: string): Promise<OyinDeleteResult> {
  const soldMap = await getSoldMap();
  if ((soldMap.get(key) ?? 0) > 0) return { ok: false, reason: "has_sales" };
  await mutateCatalog((cur) => {
    const next = cur.filter((p) => p.key !== key);
    return next.length !== cur.length ? next : null;
  });
  return { ok: true };
}

// ── chipta xaridi: reserve→tekshir→rollback atomik hisoblagich (economyService.ts
// consumeWithdrawBudget/releaseWithdrawBudget AYNAN shu naqshi, per-prize N-limitga moslangan —
// parallel ikkita a'zo oxirgi o'rinni bir vaqtda olishga urinsa ham HECH QACHON limitdan oshmaydi). ─
async function reserveSoldSlot(prizeKey: OyinPrizeKey, limit: number): Promise<number | null> {
  const key = `oyin_sold:${prizeKey}`;
  // ⚠️ `RETURNING` MAJBURIY. Avval inkrement va o'qish IKKI ALOHIDA so'rov edi:
  //   T1 INSERT(+1) → 6 · T2 INSERT(+1) → 7 · T1 SELECT → 7 · T2 SELECT → 7
  // ya'ni ikki xaridorga BIR XIL chipta raqami tushardi va bitta raqam yo'qolardi.
  // `RETURNING` bilan har chaqiruv O'ZI yozgan qiymatni oladi — kolliziya imkonsiz.
  const rows = await prisma.$queryRaw<{ value: string }[]>`
    INSERT INTO "AppState" ("key","value","updatedAt")
    VALUES (${key}, '1', NOW())
    ON CONFLICT ("key") DO UPDATE
      SET "value" = CAST((CAST("AppState"."value" AS INTEGER) + 1) AS TEXT), "updatedAt" = NOW()
    RETURNING "value"`;
  const sold = Number(rows[0]?.value) || 0;
  if (sold > limit) {
    await prisma.$executeRaw`
      UPDATE "AppState" SET "value" = CAST((CAST("value" AS INTEGER) - 1) AS TEXT) WHERE "key" = ${key}`;
    return null; // limit to'lgan — bu urinish chipta OLMADI
  }
  return sold; // shu xariddagi ketma-ket chipta raqami (1-based)
}

/** Band qilingan o'rinni QAYTARISH — chipta yozuvi yiqilganda (`economyService`
 *  `releaseWithdrawBudget` bilan bir xil naqsh). Aks holda o'rin abadiy kuyadi. */
async function releaseSoldSlot(prizeKey: OyinPrizeKey, test = false): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "AppState" SET "value" = CAST(GREATEST(CAST("value" AS INTEGER) - 1, 0) AS TEXT)
    WHERE "key" = ${`${test ? "oyin_sold_test:" : "oyin_sold:"}${prizeKey}`}`;
}

// 🧪 `reserveTestSlot` / `nextTestTicketNo` OLIB TASHLANDI (2026-08-04) — test-rejimi bekor
// qilingani uchun ular yangi karta YARATMAYDI. Lekin `test` maydonini O'QISH saqlanadi
// (`parseTickets`, `drawExport`, `releaseSoldSlot`): jonli bazada eski sinov kartalari BOR va
// ular tirajdan tashqarida qolishi SHART. Yangi xaridlar — oddiy karta.

/** `preview=true` (ega/admin) — bayroq DARK bo'lsa ham xarid ishlaydi, shunda ega QABUL'dan oldin
 *  BUTUN oqimni sinab ko'radi. shopService.buyProduct / classifiedService.buyTopBoost / ravella
 *  bilan AYNAN bir xil naqsh; avtorizatsiya route qatlamida qoladi, servis faqat boolean oladi.
 *  ⚠️ preview BAYROQNI aylanib o'tadi, MAVSUMNI emas — mavsum mahsulot qoidasi, ega uchun ham. */
/** 🎟 Global chipta raqami — butun tizim bo'ylab noyob. Inkrement va o'qish BITTA so'rovda
 *  (`RETURNING`) — aks holda parallel ikki xaridor bir xil raqamni o'qiydi va mijozga "noyob"
 *  deb ko'rsatilgan son ikki egali bo'lib qoladi (tiraj kunida bitta raqamga ikki da'vogar).
 *  Boshlang'ich 729474 — birinchi chipta 729475 bo'ladi (dizayndagi namuna raqam). */
async function nextGlobalTicketNo(): Promise<number> {
  const key = "oyin:ticketno";
  const rows = await prisma.$queryRaw<{ value: string }[]>`
    INSERT INTO "AppState" ("key","value","updatedAt")
    VALUES (${key}, '729475', NOW())
    ON CONFLICT ("key") DO UPDATE
      SET "value" = CAST((CAST("AppState"."value" AS INTEGER) + 1) AS TEXT), "updatedAt" = NOW()
    RETURNING "value"`;
  return Number(rows[0]?.value) || 0;
}

export async function buyTicket(memberId: number, prizeKeyRaw: string, preview = false): Promise<OyinBuyResult> {
  if (!preview && !(await featureOn("oyin"))) return { ok: false, reason: "off" };
  const season = await getSeason();
  if (season.phase !== "active") return { ok: false, reason: "season_off" };
  // 🔒 FINAL-48 — ekran "Muzlagan" deb yozadi, demak SERVER ham to'sishi shart. Avval bu faqat
  // mijoz tomonidagi bo'yoq edi: tugma "muzlagan" ko'rinardi, bosilsa xarid o'tib ketardi.
  // Ega-preview ham AYLANIB O'TMAYDI — bu mahsulot qoidasi, bayroq emas (chipta ro'yxati tirajga
  // qotishi kerak; ega o'zi ham oxirgi soniyada eksportdan tashqarida chipta yaratmasin).
  if (season.endMs != null && season.endMs - Date.now() <= OYIN_FINAL_LOCK_MS) return { ok: false, reason: "final_lock" };
  // 🔒 TIRAJ MUZLATILGAN (admin tugmasi). FINAL-48 dan FARQI: bu ega qo'li bilan, istalgan
  // paytda qo'yiladi va TEST xaridini ham to'sadi. Muzlatilgan ro'yxat — jonli efirda o'qish
  // uchun yagona ishonchli holat ("keyin qo'shib qo'ydi" ayblovi imkonsiz bo'ladi).
  if ((await getFreeze()).frozen) return { ok: false, reason: "frozen" };
  const catalog = await getCatalog();
  // 📋 `queued !== true` — navbatdagi mukofotga karta SOTILMAYDI. Vitrina uni ko'rsatmaydi,
  // lekin to'g'ridan-to'g'ri API so'rovi kalitni bilishi mumkin (eski ekran, kesh, qo'lda).
  const prize = catalog.find((p) => p.key === prizeKeyRaw && p.active && p.queued !== true);
  // 🔴 (nazoratchi 2026-08-04 №3): o'ynalgan mukofotga karta sotilishini to'sish.
  // `oyinMinSellPct = 100` da `reserveSoldSlot` o'zi to'sadi, LEKIN knob 0…100 sozlanadi.
  // pct=50 da: 10/20 sotilganda ega muzlatadi -> g'olibni yozadi -> muzlatishni OCHADI
  // (boshqa mukofotlar sotilishi uchun) -> mijoz 11-kartani ALLAQACHON o'ynalgan mukofotga
  // sotib olib ballini kuydirardi. Endi xarid yo'lining o'zi biladi.
  if (prize && (await prisma.appState.findUnique({ where: { key: `${WINNER_PREFIX}${prize.key}` }, select: { key: true } }))) {
    return { ok: false, reason: "drawn" };
  }
  if (!prize) return { ok: false, reason: "unknown_prize" };

  // withMemberLock: bitta a'zoning ketma-ket xaridlarini serializatsiya qiladi — ball-tekshiruv va
  // yechish orasida race bo'lmasin (ikkinchi urinish BIRINCHISI YOZIB BO'LGANDAN keyin ballni o'qiydi).
  // Cross-member xavfsizlik esa yuqoridagi reserveSoldSlot'ning atomik SQL'idan keladi.
  return withMemberLock(memberId, async () => {
    // 🚫 A'ZO O'YINDAN CHETLATILGAN (admin qarori — soxta akkaunt/ferma). Ball yig'ilishi
    // to'xtatilmaydi (tarix buzilmasin), lekin chiptaga AYLANTIRA olmaydi va mavjud chiptalari
    // `drawExport` dan chiqariladi.
    if (await isBanned(memberId)) return { ok: false, reason: "banned" as const, ballLeft: await getBall(memberId) };

    // 🧪 TEST-REJIMI OLIB TASHLANDI (ega qarori 2026-08-04: "test emas, to'liq jarayoni ko'rishim
    // kerak"). Avval ega xaridi alohida hisoblagichga (`oyin_sold_test:`) yozilardi va jonli
    // sinovda AYNAN SHU chalkashlik chiqdi: ega kartani oldi, vitrinada esa «Olingan: 0» turdi
    // (`getVitrina` haqiqiy `oyin_sold:` dan o'qiydi). Ya'ni "to'liq jarayonni ko'rish" imkonsiz
    // edi — sinov mijoz ko'radigan raqamlarga TEGMASDI.
    //
    // Endi ega oddiy mijozdek o'ynaydi.
    //
    // ⚠️ OCHIQ QARZ (nazoratchi agent 2026-08-04 topdi). Bu yerda avval uchta "qo'riq" sanalgan
    // edi, ulardan IKKITASI mavjud emas — ya'ni izoh kod bajarmaydigan narsani va'da qilardi:
    //   ❌ "qoidalar sahifasida xodimlar ishtirok etmaydi deb yoziladi" — bunday matn butun
    //      repoda YO'Q (miniapp «📋 Qoidalar» bloki 5 qatordan iborat, xodim haqida so'z yo'q).
    //      → S4 bosqichida qoidalar sahifasi bilan birga yoziladi.
    //   ❌ "bitta tugma bilan tozalaydi" — `adminCancelPrizeTickets` API'da BOR, admin panelda
    //      TUGMASI YO'Q; qolaversa u sovrinning HAMMA mijoz kartasini o'chiradi, eganikini emas.
    //      → S5 (panel) da "mening kartalarimni tozalash" tugmasi qilinadi.
    //   ✅ "muzlatilgan ro'yxat ommaga ochiq" — `drawExport` bor va ishlaydi.
    // Ya'ni HOZIR yagona haqiqiy qo'riq — ochiq ro'yxat. Ega bayroqni yoqishdan OLDIN o'z
    // kartalarini qo'lda (`adminCancelTicket`, bitta-bitta) tozalashi SHART.

    // 🚧 SAFAR DARVOZASI — o'yindagi eng katta struktur teshik shu yerda edi.
    // Pul yo'lida (`seasonClose`) "≥1 real safar" sharti BOR edi, SOVRIN yo'lida YO'Q.
    // Natijada 20 ta SIM kartali ring bitta ham taksiga chiqmasdan ~18 400 ball yig'ib
    // (login+ulashish+zanjir+o'zaro taklif) sovrin katalogining ~62% ini olardi.
    // Endi ikkala yo'lda ham bir xil shart: chipta — SAFAR qilganlar uchun.
    const row0 = (await computeBallMap()).get(memberId);
    if (!row0 || row0.seasonRides <= 0) return { ok: false, reason: "no_ride" as const, ballLeft: row0?.breakdown.ball ?? 0 };

    const ball = await getBall(memberId);
    if (ball < prize.price) return { ok: false, reason: "insufficient" as const, ballLeft: ball };

    // ⚖️ Adolat qo'rig'i: bitta odam bitta sovrinning hamma chiptasini olib qo'ymasin.
    // Do'st-safari 40 ballga chiqqach, ko'p do'stli odam butun tirajni sotib olishi mumkin edi.
    const econ = await getBonusEcon();
    // ⚠️ Knob YOLG'IZ yetarli emas: knob 3, blender limiti ham 3 → bitta odam butun sovrinni
    // sotib olib 100% g'olib bo'lardi (bu tiraj emas, XARID). Endi qo'riq limitning yarmidan
    // oshmaydi — har sovrinda kamida ikki xil da'vogar qoladi.
    const maxOwn = Math.max(1, Math.min(
      Math.round(econ.oyinMaxTicketsPerPrize ?? 3),
      Math.ceil(prize.limit / 2),
    ));
    // (Mavsum yuqorida BIR MARTA o'qilgan — ichkarida yana `getSeason()` chaqirilardi va tashqi
    // `season` ni SOYALARDI: bir xil qiymat, ortiqcha so'rov, o'quvchi uchun chalg'itadigan ikkilik.)
    const ownRow = await prisma.appState.findUnique({ where: { key: `oyin:tickets:${memberId}` } });
    const ownCount = parseTickets(ownRow?.value)
      .filter((t) => t.prizeKey === prize.key)
      .length;
    if (ownCount >= maxOwn) return { ok: false, reason: "own_limit" as const, ballLeft: ball };

    const ticketNo = await reserveSoldSlot(prize.key, prize.limit);
    if (ticketNo === null) return { ok: false, reason: "sold_out" as const, ballLeft: ball };

    // ⚠️ `reserveSoldSlot` o'rinni ALLAQACHON band qildi. Quyidagi 3 DB operatsiyasidan
    // biri yiqilsa (DB blipi) o'rin abadiy "sotilgan" bo'lib qolardi: chipta yo'q, mijozdan
    // ball ham yechilmagan, sovrin esa limitgacha yetmasdan "tugadi" ko'rinardi.
    // `economyService.releaseWithdrawBudget` naqshi — izoh uni va'da qilardi, kod bajarmasdi.
    try {
      const key = `oyin:tickets:${memberId}`;
      const row = await prisma.appState.findUnique({ where: { key } });
      const tickets = parseTickets(row?.value);
      const gno = await nextGlobalTicketNo();
      tickets.push({ prizeKey: prize.key, no: ticketNo, gno, priceAtPurchase: prize.price, ts: new Date().toISOString() });
      await prisma.appState.upsert({
        where: { key },
        create: { key, value: JSON.stringify(tickets) },
        update: { value: JSON.stringify(tickets) },
      });
      invalidateBallCache();
      // 📋 Xariddan keyin sig'im tekshiriladi — yangi poller YO'Q (ARCHITECTURE.md invarianti).
      // Xarid sig'imni kamaytiradi, ya'ni chegaradan tushishning eng ehtimolli lahzasi shu.
      // Yiqilsa xarid BEKOR QILINMAYDI: mijoz kartasini oldi, navbat esa keyingi safar ochiladi.
      void autoOpenPrizes().catch((e2) => console.warn("[oyin] autoOpen yiqildi:", e2));
      // 🔐 K1 — bayram-oynasi ko'rsatadigan kod Kartalarim/karta-sahifasidagi BILAN BIR XIL
      // manba (yuqoridagi izoh: bitta chipta ikki xil raqam bilan chiqmasin).
      return { ok: true, ticketNo, gno, code: await encodeCardCode(gno), prizeKey: prize.key, ballLeft: ball - prize.price };
    } catch (e) {
      await releaseSoldSlot(prize.key).catch(() => undefined);
      throw e;
    }
  });
}

// ── kunlik kirish / ulashish: bitta AppState qatorida kun-ro'yxati (bit-mask o'rniga sodda massiv —
// mavsum ≤31 kun, hajmi arzon). markLogin `GET /api/oyin/state` chaqirilganda chaqiriladi ("miniapp
// ochish" = kirish, ega spetsifikatsiyasi §1) — alohida POST endpoint shart emas. ──────────────────
async function markDay(prefix: "oyin:login:" | "oyin:share:" | "oyin:quest:" | "oyin:home:", memberId: number): Promise<boolean> {
  // Mavsum faol emas — belgi yozilmaydi. Eski kunlar O'CHIRILMAYDI: tarix getActivity uchun kerak,
  // uni faqat arxivlash tugmasi qirqadi (tarixni bitta joy o'zgartirsin).
  if ((await getSeason()).phase !== "active") return false;
  const key = `${prefix}${memberId}`;
  const today = tashkentDayKey(new Date());
  const row = await prisma.appState.findUnique({ where: { key } });
  const days = parseDayList(row?.value);
  if (days.includes(today)) return false; // bugun allaqachon belgilangan
  days.push(today);
  await prisma.appState.upsert({
    where: { key },
    create: { key, value: JSON.stringify({ days }) },
    update: { value: JSON.stringify({ days }) },
  });
  invalidateBallCache();
  return true;
}
/** 📱 Telefon tasdiqlangan — UMRBOD BIR MARTA belgi (`oyin:phoneball:<memberId>`). Marker
 *  qo'yilgach hech qachon o'chirilmaydi/qaytadan berilmaydi — admin unlink→relink yoki
 *  raqamni qayta ulash `linkedAt`ni yangilasa ham ball ikkinchi marta berilmaydi (ega qarori
 *  2026-08-10: avval `linkedAt` oynasiga bog'liq edi va bu CHEKSIZ ball eshigi edi). */
async function markPhoneVerified(memberId: number): Promise<void> {
  const key = `oyin:phoneball:${memberId}`;
  // ⚠️ Qiymat — ISO SANA (avval "1" edi). Ball mavsum-doirali bo'lgani uchun bonus qaysi
  // mavsumda berilganini bilish SHART; sanasiz belgi har mavsum qayta to'lanardi.
  const already = await prisma.appState.findUnique({ where: { key } });
  if (already) return;
  const tu = await prisma.telegramUser.findUnique({ where: { memberId }, select: { phone: true } });
  if (!tu?.phone) return;
  await prisma.appState.create({ data: { key, value: new Date().toISOString() } }).catch(() => undefined); // P2002 poyga — beparvo
  invalidateBallCache();
}
export async function markLogin(memberId: number, preview = false): Promise<void> {
  if (!preview && !(await featureOn("oyin"))) return;
  await markDay("oyin:login:", memberId).catch(() => undefined);
  await markPhoneVerified(memberId).catch(() => undefined);
}
/** 🏠 Ilova telefon ekraniga o'rnatildi. Telegram'ning `homeScreenAdded` HODISASI yoki
 *  `checkHomeScreenStatus() === "added"` javobidan keyin chaqiriladi — mijoz shunchaki
 *  tugmani bosgani YETARLI EMAS.
 *  ⚠️ UMRBOD BIR MARTA (ega qarori 2026-08-10): avval `added:false` kelsa belgi OLIB
 *  TASHLANARDI (o'rnatib-o'chirib-qayta-o'rnatib ballni qayta yig'ish imkoni bor edi). Endi
 *  marker qo'yilgach hech qachon o'chmaydi/qaytadan so'ralmaydi — bitta marta, umrbod. */
export async function markHomeScreen(memberId: number, added: boolean, preview = false): Promise<{ ok: boolean }> {
  if (!preview && !(await featureOn("oyin"))) return { ok: false };
  if (!added) return { ok: true };
  const ok = await markDay("oyin:home:", memberId);
  return { ok };
}

export async function markShare(memberId: number, preview = false): Promise<{ ok: boolean }> {
  if (!preview && !(await featureOn("oyin"))) return { ok: false };
  return { ok: await markDay("oyin:share:", memberId) };
}

// ── Jamoam: chaqiruvchining O'Z do'stlari — kichik va shaxsiy doira, katta populyatsiya-keshidan
// FOYDALANMAYDI (kunlik/faollik holati kerak, kesh buni saqlamaydi). ────────────────────────────
export async function getJamoam(memberId: number): Promise<OyinJamoamResponse> {
  const [season, econ, myTu] = await Promise.all([
    getSeason(),
    getBonusEcon(),
    prisma.telegramUser.findUnique({ where: { memberId } }),
  ]);
  if (!myTu) return { friends: [], totalBall: 0, oneTimeBall: 0, rideBall: 0 };

  const referrals = await prisma.referral.findMany({
    where: { referrerId: myTu.id },
    select: { refereeMemberId: true, referrerPaidAt: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  const refereeIds = referrals.map((r) => r.refereeMemberId).filter((id): id is number => id != null);
  if (refereeIds.length === 0) return { friends: [], totalBall: 0, oneTimeBall: 0, rideBall: 0 };

  // Safarlar oynasi = BUTUN mavsum (avval qat'iy 14 kun edi) — "shu mavsumda yurganmi" savoliga
  // javob berish uchun kerak, chunki quyidagi ro'yxat shunga qarab filtrlanadi.
  const ridesSince = season.configured
    ? new Date(season.startMs as number)
    : new Date(Date.now() - 14 * 86400_000);

  const [refereeTus, recentRides, thanksRow] = await Promise.all([
    prisma.telegramUser.findMany({ where: { memberId: { in: refereeIds } }, select: { id: true, memberId: true, firstName: true, lastName: true, username: true } }),
    prisma.rideReward.findMany({
      where: { memberId: { in: refereeIds }, createdAt: { gte: ridesSince } },
      select: { memberId: true, createdAt: true },
    }),
    prisma.appState.findUnique({ where: { key: `oyin:thanks:${memberId}` } }),
  ]);
  const tuByMemberId = new Map(refereeTus.map((t) => [t.memberId as number, t]));
  const today = tashkentDayKey(new Date());
  const thankedToday = new Set(parseThanks(thanksRow?.value, today));
  const ridesByMember = new Map<number, Date[]>();
  for (const r of recentRides) {
    const arr = ridesByMember.get(r.memberId) ?? [];
    arr.push(r.createdAt);
    ridesByMember.set(r.memberId, arr);
  }

  // 👥 Ro'yxat MAVSUM jamoasi (ega 2026-08-02: "nega eski referallarim ham chiqib kelmoqda").
  // Do'st ko'rinadi, agar u SHU MAVSUMDA biror hissa qo'shgan bo'lsa: mavsumda qo'shilgan, yoki
  // birinchi safar-mukofoti mavsumda to'langan, yoki mavsumda safar qilgan. Ballga hissa qo'shgan
  // hech kim yashirilmaydi (aks holda ball qayerdan kelgani ko'rinmay qolardi); mavsumda umuman
  // faol bo'lmagan eski takliflar esa ro'yxatni to'ldirmaydi.
  const inSeason = (d: Date | null): boolean =>
    !!d && season.configured && d.getTime() >= (season.startMs as number) && d.getTime() <= (season.endMs as number);

  let totalBall = 0;
  const friends: OyinFriendRow[] = referrals
    .filter((r) => r.refereeMemberId != null)
    .filter((r) => {
      if (!season.configured) return true;
      if (inSeason(r.createdAt) || inSeason(r.referrerPaidAt)) return true;
      return (ridesByMember.get(r.refereeMemberId as number) ?? []).length > 0;
    })
    .map((r) => {
      const friendId = r.refereeMemberId as number;
      const tu = tuByMemberId.get(friendId);
      const rides = ridesByMember.get(friendId) ?? [];
      const todayCount = rides.filter((d) => tashkentDayKey(d) === today).length;
      const gainToday = todayCount * (econ.oyinReferRideBall ?? 0);
      const oneTimeFromFriend = (econ.oyinReferJoinBall ?? 0) + (r.referrerPaidAt ? (econ.oyinReferFirstRideBall ?? 0) : 0);
      // Shu do'stdan mavsum davomida (yuqoridagi `ridesSince` oynasi) kelgan JAMI ball — bir
      // martalik ulanish/birinchi-safar + shu oynadagi har safar. `computeBallMap` bo'yicha
      // per-do'st taqsimot yo'q, shuning uchun aggregat `totalBall` bilan bir xil (14 kun/mavsum)
      // oynadan hisoblanadi — izchillik uchun ataylab shunday.
      const totalBallFromMe = oneTimeFromFriend + rides.length * (econ.oyinReferRideBall ?? 0);
      totalBall += oneTimeFromFriend;
      const lastRide = rides.length ? new Date(Math.max(...rides.map((d) => d.getTime()))) : null;
      let status: OyinFriendRow["status"];
      let daysSilent = 0;
      if (todayCount > 0) status = "active_today";
      else if (!lastRide && !r.referrerPaidAt) status = "never_rode";
      else {
        status = "silent";
        daysSilent = lastRide ? Math.floor((Date.now() - lastRide.getTime()) / 86400_000) : 999;
      }
      return {
        memberId: friendId, name: tu ? shortName(tu) : "Mijoz", username: tu?.username ?? null,
        status, daysSilent, gainToday, totalBallFromMe,
        ridesToday: todayCount, thankedToday: thankedToday.has(friendId),
      };
    });
  // To'liq summa computeBallMap'dan (mavsum-doirali) — bu yerdagi tsikl faqat 14 kunlik oynani
  // ko'radi. Fallback 0: eski shkaladagi sonni qoldirish — noto'g'ri raqam jo'natishning yo'li.
  const mine = (await computeBallMap()).get(memberId);
  // IKKITA SUMMA ALOHIDA (§7): bir martalik bonus TUGAYDI, do'st safaridan keladigan oqim esa
  // TUGAMAYDI. Bitta yig'indi bu farqni yashiradi va "do'st chaqirish" bir martalik ish bo'lib
  // ko'rinadi — aslida o'yinning butun iqtisodi shu ikkinchi ustunga tayanadi.
  const oneTimeBall = mine ? mine.breakdown.referJoin + mine.breakdown.referFirstRide : 0;
  const rideBall = mine ? mine.breakdown.referRides : 0;
  totalBall = oneTimeBall + rideBall;
  return { friends, totalBall, oneTimeBall, rideBall };
}

// ── 🤝 "Rahmat ayt" — do'stning Telegram'iga botdan xabar (ega talabi 2026-08-02). Ball BERILMAYDI
// (rahmat uchun ball = emissiya vektori) — bu sof ijtimoiy signal. Kunlik marker AppState'da:
// `oyin:thanks:<memberId>` = {"day":"YYYY-MM-DD","ids":[…]} — kun almashsa o'zi tozalanadi. ────────
function parseThanks(raw: string | undefined, today: string): number[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as { day?: string; ids?: unknown };
    if (v.day !== today || !Array.isArray(v.ids)) return [];
    return (v.ids as unknown[]).filter((x): x is number => typeof x === "number");
  } catch {
    return [];
  }
}

export async function thankFriend(memberId: number, friendMemberId: number, preview = false): Promise<OyinThanksResult> {
  if (!preview && !(await featureOn("oyin"))) return { ok: false, reason: "off" };
  const myTu = await prisma.telegramUser.findUnique({ where: { memberId }, select: { id: true, firstName: true, lastName: true, username: true } });
  if (!myTu) return { ok: false, reason: "not_friend" };

  // 🔒 Avtorizatsiya: FAQAT o'z do'stingga. Juftlik Referral'da bo'lishi shart — aks holda istalgan
  // odam istalgan memberId'ga xabar yubora olardi.
  const pair = await prisma.referral.findFirst({
    where: { referrerId: myTu.id, refereeMemberId: friendMemberId },
    select: { id: true },
  });
  if (!pair) return { ok: false, reason: "not_friend" };

  const today = tashkentDayKey(new Date());
  const key = `oyin:thanks:${memberId}`;
  const row = await prisma.appState.findUnique({ where: { key } });
  const ids = parseThanks(row?.value, today);
  if (ids.includes(friendMemberId)) return { ok: false, reason: "already" };

  const friendTu = await prisma.telegramUser.findUnique({ where: { memberId: friendMemberId }, select: { id: true } });
  if (!friendTu) return { ok: false, reason: "no_chat" };

  const { getBotInstance } = await import("../botInstance");
  const bot = getBotInstance();
  if (!bot) return { ok: false, reason: "unreachable" };
  // ⚠️ `notifyUserInitiated`, `notifyOnce` EMAS. Avvalgi kod kunlik push-limitiga (DAILY_PUSH_CAP=2)
  // bo'ysunardi va eng ko'p uchraydigan rad javobi "limit to'ldi" edi — do'st bugun ikkita safar
  // bildirishnomasi olgan bo'lsa yetardi. Ekran esa buni "botni BLOKLAGAN" deb tarjima qilardi:
  // mijoz tugmani bosadi, xabar ketmaydi va u do'stidan bekorga xafa bo'ladi.
  // Blok va "bildirishnoma o'chiq" SAQLANADI; `kind` ichida yuboruvchi id'si — bitta odam bitta
  // do'stiga kuniga bir marta, ya'ni spam yo'li ochilmaydi.
  const { notifyUserInitiated } = await import("./notifyService");
  // ⚠️ MATN 2026-08-03 da TUZATILDI (ega ko'rib topdi). Ikki xato bor edi:
  //  1. «Siz ham o'yinga qo'shiling» — bu xabar FAQAT taklif juftligi bor va SAFAR QILGAN
  //     odamga boradi (yuqoridagi `pair` tekshiruvi), ya'ni u ALLAQACHON o'yin ichida.
  //     Unga begonaday murojaat qilinardi.
  //  2. Tugma YO'Q edi. Matn harakat va'da qilardi ("qo'shiling"), bosadigan joy yo'q —
  //     DIZAYN_QOIDALARI #14 buzilishi. Rejada tugma yozilgan, qurilmagan.
  // Raqam KNOBDAN olinadi: qotirilsa ega knobni o'zgartirganda xabar yolg'on aytardi.
  const econ = await getBonusEcon();
  const perRide = econ.oyinReferRideBall ?? 0;
  const { appBtn } = await import("../bot/webAppUrl");
  const sent = await notifyUserInitiated(
    bot, friendTu.id, friendMemberId, `oyin_thanks:${memberId}`,
    `🤝 <b>${shortName(myTu)}</b> sizga rahmat aytdi!\n\n`
      + (perRide > 0
        ? `Bugungi safaringiz unga <b>${perRide} ball</b> olib keldi. Sizda ham ball yig'ilyapti — sovrinlarni ko'ring 🎁`
        : `Safaringiz unga ball olib keldi. Sizda ham ball yig'ilyapti — sovrinlarni ko'ring 🎁`),
    // `appBtn` O'ZI `{reply_markup:…}` qaytaradi — qayta o'rash tugmani yo'q qilardi.
    // Klient WebApp'ni qo'llab-quvvatlamasa `undefined` qaytadi va xabar tugmasiz ketadi.
    appBtn("🎮 O'yinni ochish", "oyin"),
  );
  if (!sent.ok) {
    // Har sabab O'ZI aytiladi — mijozga yolg'on tashxis qo'yilmaydi.
    if (sent.reason === "blocked") return { ok: false, reason: "blocked" };
    if (sent.reason === "notify_off") return { ok: false, reason: "notify_off" };
    if (sent.reason === "duplicate") return { ok: false, reason: "already" };
    return { ok: false, reason: "unreachable" };
  }

  ids.push(friendMemberId);
  const value = JSON.stringify({ day: today, ids });
  await prisma.appState.upsert({ where: { key }, create: { key, value }, update: { value } });
  return { ok: true };
}

/** bookingNotifier.ts dan chaqiriladi — do'stning safari taklifchiga qancha ball olib kelganini
 *  push qilish uchun (ball o'zi GRANT qilinmaydi, jonli hisoblanadi — bu FAQAT bildirishnoma). */
export async function referrerOf(refereeMemberId: number): Promise<{ telegramId: string; memberId: number } | null> {
  const ref = await prisma.referral.findFirst({ where: { refereeMemberId }, select: { referrerId: true } });
  if (!ref) return null;
  const tu = await prisma.telegramUser.findUnique({ where: { id: ref.referrerId }, select: { memberId: true } });
  if (!tu?.memberId) return null;
  return { telegramId: ref.referrerId, memberId: tu.memberId };
}

// ── Haftalik sprint (Du–Ya) — index.ts 15-daq tickdan chaqiriladi. Idempotent: `oyin:sprintweek`
// kuzatilayotgan hafta-ko'rsatkichi bilan bittadan-ortiq bajarilmaydi (bir haftada necha marta
// chaqirilsa ham, faqat hafta ALMASHGANDA bir marta baholaydi). Snapshot-farq usuli: har hafta
// boshida populyatsiyaning umumiy ball-holati suratga olinadi; keyingi hafta boshida O'SHA surat
// bilan solishtirilib "shu hafta ichida kim eng ko'p ball yig'di" — bu haqiqiy hafta-ichi faollik,
// umumiy ball emas (whale doim yuqorida turmasin). ──────────────────────────────────────────────
export async function sprintCheck(): Promise<OyinSprintResult | null> {
  if (!(await featureOn("oyin"))) return null;
  const season = await getSeason();
  if (!season.configured) return null;
  const wk = weekKey(new Date());
  const trackedRow = await prisma.appState.findUnique({ where: { key: "oyin:sprintweek" } });
  const tracked = trackedRow?.value ?? null;
  if (tracked === wk) return null; // hali shu hafta ichidamiz — baholash keyingi hafta boshida

  const map = await computeBallMap();
  let result: OyinSprintResult | null = null;

  if (tracked) {
    const doneKey = `oyin:sprintdone:${tracked}`;
    const already = await prisma.appState.findUnique({ where: { key: doneKey } });
    // Mavsumdan TASHQARIDAGI hafta uchun g'olib e'lon qilinmaydi (tugagan mavsumga sprint yozib,
    // anti-abuz tarixini bulg'amaymiz) — lekin pastda baza baribir yangilanadi.
    const inSeason = tracked >= (season.startWeekKey as string) && tracked <= (season.endWeekKey as string);
    if (!already && inSeason) {
      const snapRow = await prisma.appState.findUnique({ where: { key: `oyin:weeksnap:${tracked}` } });
      const snap = parseWeekSnap(snapRow?.value);
      // ⚠️ Snapshot MUTLAQ ball qiymatlarini saqlaydi. Shkalasi o'zgargan (umrbod→mavsum) yoki
      // boshqa mavsumga tegishli surat bilan solishtirish hammada MANFIY delta beradi va
      // `.filter(delta > 0)` ni bo'shatadi — hafta JIMGINA g'olibsiz o'tardi. Endi baland ovozda
      // o'tkazib yuboriladi va pastda qayta bazalanadi.
      if (!snap) {
        console.warn(`[oyin] sprint ${tracked}: surat yo'q — o'tkazib yuborildi`);
      } else if (snap.seasonId !== season.seasonId) {
        console.warn(`[oyin] sprint ${tracked}: surat boshqa mavsumniki (${snap.seasonId} ≠ ${season.seasonId}) — o'tkazib yuborildi, qayta bazalanadi`);
      } else {
        // ⚠️ `earned` (YIG'ILGAN), `ball` (qoldiq) EMAS — yuqoridagi `WeekSnap` izohiga qarang.
        const deltas = [...map.entries()]
          .map(([memberId, row]) => ({ memberId, name: row.name, delta: row.breakdown.earned - (snap.earned[String(memberId)] ?? 0) }))
          .filter((d) => d.delta > 0)
          .sort((a, b) => b.delta - a.delta);
        const winners: typeof deltas = [];
        for (const d of deltas) {
          if (winners.length >= 3) break;
          const winsRow = await prisma.appState.findUnique({ where: { key: `oyin:sprintwin:${d.memberId}` } });
          // Anti-abuz oynasi ATAYLAB filtrlanmaydi — 4 haftalik cheklov mavsum chegarasidan
          // qat'i nazar ishlaydi (faqat toza-boshlash uni tozalaydi: yangi mavsum = yangi tanlov).
          const weeks = parseWeekList(winsRow?.value);
          const recentWins = weeks.filter((w) => isWithinLast4Weeks(w, tracked)).length;
          if (recentWins >= SPRINT_MAX_WINS_PER_ROLLING_4W) continue; // limit — keyingi nomzodga o'tiladi
          winners.push(d);
        }
        for (const w of winners) {
          const key = `oyin:sprintwin:${w.memberId}`;
          const row = await prisma.appState.findUnique({ where: { key } });
          const weeks = [...parseWeekList(row?.value), tracked];
          await prisma.appState.upsert({ where: { key }, create: { key, value: JSON.stringify({ weeks }) }, update: { value: JSON.stringify({ weeks }) } });
        }
        await prisma.appState.create({ data: { key: doneKey, value: "1" } }).catch(() => undefined);
        if (winners.length) invalidateBallCache();
        result = { weekKey: tracked, winners };
      }
    }
  }

  // Yangi (joriy) hafta uchun surat + ko'rsatkichni oldinga suramiz.
  // 🚩 Tuzatilgan eski bug: g'olib yozilgach kesh bekor qilingan edi, lekin surat ESKI `map` dan
  // yozilardi — g'olibning yangi bazasi sprint-bonusiga KAM chiqib, keyingi haftaga bepul fora
  // bilan kirardi. Endi g'olib bo'lsa xarita qayta o'qiladi. (Tartib O'ZGARMAYDI: surat
  // g'oliblardan KEYIN yoziladi — aks holda bonus keyingi hafta faolligi deb ikki marta sanalardi.)
  const snapMap = result?.winners.length ? await computeBallMap() : map;
  // Suratda YIG'ILGAN (`earned`) saqlanadi — chipta xaridi (sarf) sprint deltasiga TEGMASIN.
  const earned: Record<string, number> = {};
  for (const [id, row] of snapMap) earned[String(id)] = row.breakdown.earned;
  const snapKey = `oyin:weeksnap:${wk}`;
  const snapValue = JSON.stringify({ seasonId: season.seasonId, at: new Date().toISOString(), earned });
  await prisma.appState.upsert({ where: { key: snapKey }, create: { key: snapKey, value: snapValue }, update: { value: snapValue } });
  await prisma.appState.upsert({ where: { key: "oyin:sprintweek" }, create: { key: "oyin:sprintweek", value: wk }, update: { value: wk } });

  return result;
}

/** Tiraj uchun raqamlangan chipta-ro'yxati — READ-ONLY (hech narsa yozmaydi), shuning uchun
 *  tabiiy idempotent: necha marta chaqirilsa ham bir xil natija (chiptalar o'zgarmaguncha). */
/** 🟡 №12 (nazoratchi 2026-08-04): "xodim" IKKI XIL ta'rifda edi — `isAdmin()` faqat
 *  `.env` dagi `ADMIN_TELEGRAM_IDS` ni o'qiydi, bazada esa alohida `TelegramUser.isAdmin`
 *  ustuni bor va u boshqa joylarda ishlatiladi. Bazada xodim deb belgilangan, lekin `.env`
 *  ro'yxatida yo'q odam TIRAJDA QATNASHARDI. Tiraj uchun ta'rif BITTA bo'lishi shart va
 *  KENGROG'I olinadi: ikkalasidan biri ham yetarli. */
function isStaffUser(tu: { id: string; isAdmin?: boolean | null }): boolean {
  return isAdmin(tu.id) || tu.isAdmin === true;
}

export async function drawExport(): Promise<OyinDrawExport> {
  const [season, ticketRows, telegramUsers, banRows, freeze, catalogD, soldMapD, econD] = await Promise.all([
    getSeason(),
    prisma.appState.findMany({ where: { key: { startsWith: "oyin:tickets:" } } }) as Promise<AppStateRow[]>,
    // 🔴 (nazoratchi 2026-08-04 №2): `id` OLINMAGANI uchun `isAdmin()` tekshirib bo'lmasdi va
    // eksport XODIMNI chiqarmasdi — `getDrawList` esa chiqarardi. Natijada kanalga e'lon
    // qilingan hash eksport raqamlaridan qayta hisoblanganda BOSHQA chiqardi va "ro'yxatni
    // keyin o'zgartirgansiz" ayblovi javobsiz qolardi. Ikkala yo'l endi BIR XIL saraydi.
    prisma.telegramUser.findMany({ where: { memberId: { not: null } }, select: { id: true, isAdmin: true, memberId: true, firstName: true, lastName: true, username: true } }),
    prisma.appState.findMany({ where: { key: { startsWith: BAN_PREFIX } }, select: { key: true } }),
    getFreeze(),
    getCatalog(),
    getSoldMap(),
    getBonusEcon(),
  ]);
  const empty = { generatedAt: new Date().toISOString(), tickets: [], frozenAt: freeze.at, excludedTest: 0, excludedBanned: 0, excludedStaff: 0, skippedPrizes: [] };
  if (!season.configured) return empty;

  // 🛡 TIRAJ QO'RIG'I: chegaraga yetmagan sovrin O'YNALMAYDI. Bu eksportda hal qilinadi, chunki
  // eksport — tirajning YAGONA haqiqat manbai (jonli efirda shu ro'yxat o'qiladi).
  const minPctD = econD.oyinMinSellPct ?? OYIN_MIN_SELL_PCT_DEFAULT;
  const skippedPrizes: { prizeKey: string; name: string; sold: number; minSell: number }[] = [];
  const skippedKeys = new Set<string>();
  for (const p of catalogD) {
    // 🟡 (nazoratchi №9): navbatdagi va yashirilgan mukofot SOTUVGA QO'YILMAGAN — uni
    // "chegaraga yetmadi" deb ayblash noto'g'ri. Ommaviy hujjatda «100 ta mukofot chegaraga
    // yetmadi» degan ro'yxat chiqardi.
    if (!p.active || p.queued === true) continue;
    const sold = soldMapD.get(p.key) ?? 0;
    const minSell = minSellOf(p.limit, minPctD);
    if (minSell > 0 && sold < minSell) {
      skippedKeys.add(p.key);
      skippedPrizes.push({ prizeKey: p.key, name: p.name, sold, minSell });
    }
  }
  const nameByMember = new Map<number, string>();
  const staffMembersD = new Set<number>();
  for (const tu of telegramUsers) if (tu.memberId) {
    nameByMember.set(tu.memberId, shortName(tu));
    if (isStaffUser(tu)) staffMembersD.add(tu.memberId); // 🔴 №2 + 🟡 №12: BITTA ta'rif
  }
  const banned = new Set<number>();
  for (const r of banRows) {
    const id = Number(r.key.slice(BAN_PREFIX.length));
    if (Number.isFinite(id)) banned.add(id);
  }

  // 💰 Mavsum filtri MAJBURIY: bo'lmasa o'tgan mavsum egalari jonli tirajda qatnashadi, va
  // `oyin_sold` 1 dan qayta boshlagani uchun ro'yxatda IKKI xil odamda bir xil raqam chiqadi.
  let excludedTest = 0;
  let excludedBanned = 0;
  let excludedStaff = 0;
  const tickets = ticketRows.flatMap((row) => {
    const memberId = Number(row.key.slice("oyin:tickets:".length));
    if (!Number.isFinite(memberId)) return [];
    const inSeason = parseTickets(row.value);
    // 🚫 Chetlatilgan a'zoning HAMMA chiptasi tirajdan chiqadi — chetlatishning butun ma'nosi shu.
    if (banned.has(memberId)) { excludedBanned += inSeason.length; return []; }
    // 🔴 №2: xodim `getDrawList` da chiqarilardi, eksportda QOLARDI — ikki xil ro'yxat, ikki
    // xil hash. Tiraj hujjati va e'lon qilingan hash bitta haqiqatdan chiqishi SHART.
    if (staffMembersD.has(memberId)) { excludedStaff += inSeason.length; return []; }
    return inSeason.flatMap((t) => {
      // 🧪 Ega/admin sinov chiptasi TIRAJGA KIRMAYDI. Bu qator "ega o'z tirajida yutdi"
      // sarlavhasining oldini oladigan YAGONA joy — o'chirilsa sinov chiptalari jonli
      // efirdagi ro'yxatga tushib ketadi.
      if (t.test) { excludedTest += 1; return []; }
      // 🛡 Chegaraga yetmagan sovrin chiptalari eksportga TUSHMAYDI. `skippedPrizes` da nomi
      // bilan sanaladi, ya'ni jimgina yo'qolmaydi.
      if (skippedKeys.has(t.prizeKey)) return [];
      return [{
        // ⚠️ `t.no` — sovrin-ichi tartib raqami; mijoz esa ekranida GLOBAL `gno` ni ko'radi.
        // Eksportda `no` qolsa jonli efirda o'qiladigan raqam mijoz qo'lidagi raqam BO'LMAYDI.
        prizeKey: t.prizeKey, ticketNo: t.gno ?? t.no, memberId, name: nameByMember.get(memberId) ?? "Mijoz",
        // Buzuq/bo'sh `ts` da SOXTA sana chiqarmaymiz — `null` qaytadi va panel "—" ko'rsatadi.
        at: t.ts && Number.isFinite(Date.parse(t.ts)) ? t.ts : null,
      }];
    });
  });
  tickets.sort((a, b) => a.prizeKey.localeCompare(b.prizeKey) || a.ticketNo - b.ticketNo);
  return { generatedAt: new Date().toISOString(), tickets, frozenAt: freeze.at, excludedTest, excludedBanned, excludedStaff, skippedPrizes };
}

/** 🛡 Sovrinning HAMMA chiptasini bekor qilish — ball egalariga qaytadi (jonli hisob:
 *  chipta o'chgach `spent` kamayadi). Ega chegaraga yetmagan sovrinni olib tashlamoqchi
 *  bo'lganda ishlatiladi: mijoz ballini boshqa sovringa sarflay oladi.
 *  ⚠️ ATAYLAB avtomatik EMAS. Avtomatik qaytarish mavsum tugashida ma'nosiz bo'lardi (ball
 *  baribir kuyadi) — ega buni FINAL-48 dan OLDIN, mijozga vaqt qolganda bosishi kerak. */
export async function adminCancelPrizeTickets(prizeKey: string): Promise<{ ok: boolean; cancelled: number; members: number }> {
  const rows = await prisma.appState.findMany({ where: { key: { startsWith: "oyin:tickets:" } } }) as AppStateRow[];
  let cancelled = 0;
  let members = 0;
  for (const row of rows) {
    const memberId = Number(row.key.slice("oyin:tickets:".length));
    if (!Number.isFinite(memberId)) continue;
    // 🔒 B2 — shu a'zoning `cancelOwnTicket`/`adminCancelTicket` bilan bir vaqtda ishlab
    // ketishining oldini oladi (ikkalasi ham xuddi shu qatorni o'qib-yozadi).
    const gone = await withMemberLock(memberId, async () => {
      // Qulf ICHIDA qayta o'qiladi — tashqaridagi `row.value` navbatda kutayotganda eskirgan
      // bo'lishi mumkin edi (masalan mijoz shu oraliqda o'zi boshqa karta bekor qilgan bo'lsa).
      const fresh = await prisma.appState.findUnique({ where: { key: row.key } });
      if (!fresh) return 0;
      const tickets = parseTickets(fresh.value);
      const keep = tickets.filter((t) => t.prizeKey !== prizeKey);
      if (keep.length === tickets.length) return 0;
      await prisma.appState.update({ where: { key: row.key }, data: { value: JSON.stringify(keep) } });
      for (const t of tickets) {
        if (t.prizeKey === prizeKey) await releaseSoldSlot(prizeKey, t.test === true).catch(() => undefined);
      }
      return tickets.length - keep.length;
    });
    if (gone > 0) {
      cancelled += gone;
      members += 1;
    }
  }
  invalidateBallCache();
  return { ok: true, cancelled, members };
}

// ── 🤝 GAP-JAMOA ─────────────────────────────────────────────────────────────────────────────
// Saqlash: `oyin:jamoa:<id>` (guruh) + `oyin:jamoamem:<memberId>` (teskari indeks — a'zoning
// jamoasini BITTA so'rovda topish uchun; aks holda har o'qishda hamma guruh skanlanardi).
const JAMOA_PREFIX = "oyin:jamoa:";
const JAMOA_MEM_PREFIX = "oyin:jamoamem:";

/** 🔴 S7-2b (nazoratchi 2026-08-04) — `turns` MAYDONI QO'SHILDI.
 *
 *  Avval navbat `members[oy_indeksi % N]` bilan HAR CHAQIRUVDA qayta hisoblanardi. `N` esa
 *  a'zo qo'shilganda o'zgaradi — ya'ni O'TGAN oylarning navbatchisi ham o'zgarardi. Karta esa
 *  abadiy (S8). Ikkalasi birga ekspluatatsiya berardi: A 3 600 ball olib kartaga sarflaydi →
 *  yangi a'zo qo'shiladi → o'sha oy B ga o'tadi → B ham o'sha 3 600 ni oladi → cheksiz.
 *
 *  Endi navbat A'ZO QO'SHILGANDA BIR MARTA yoziladi va HECH QACHON o'zgarmaydi.
 *  Qoida: **har a'zoga umri davomida BITTA navbat.** 10 kishilik guruh = 10 oy = 10 xil odam.
 *  Bu ega tasvirlagan gashtak modelining aynan o'zi ("10 kishi navbat bilan bir kishiga yordam
 *  beradi") va shu bilan birga umrbod shift ham beradi: jamoadan bir odam ko'pi bilan
 *  `oyinJamoaMaxBall` (3 600) ball oladi, ko'pi emas — qo'shimcha hisoblagich shart emas. */
export interface JamoaRecord {
  id: string; name: string; createdAt: string; members: number[];
  /** `{ "2026-08": 1234 }` — oy → navbatchi. YOZILGACH O'ZGARMAYDI. */
  turns: Record<string, number>;
  /** 🤝 Gashtak-boshliq rejasi (2026-08-05). Tuzuvchi bilan default, kick/disband bilan
   *  o'zgarmaydi (V1'da boshliqlik topshirish YO'Q — faqat tarqatish). */
  leaderId: number;
  /** memberId -> ISO qo'shilgan sana. Eski a'zolarda yo'q — ekranda "—" ko'rsatiladi. */
  joinedAt: Record<number, string>;
  /** ⚠️ TOPILMA 1 (2026-08-05 ekspluatatsiya tahlili): guruh bo'shasa qator HECH QACHON
   *  o'chirilmaydi, faqat shu maydon yoziladi. Sabab: ball ledger emas, HAR safar `turns`
   *  xaritasidan qayta hisoblanadi (`computeBallMap`) — qator o'chsa BARCHA o'tgan oylarning
   *  ball tarixi RETROAKTIV yo'qolardi (S8-2 "yashirin qarz" bilan bir xil oila, teskari
   *  yo'nalishda). `null` = faol guruh. */
  disbandedAt: string | null;
  /** 🧪 Virtual (sinov) a'zolar — manfiy `memberId`. `Member.id` faqat MUSBAT son beradi
   *  (`@default(autoincrement())`), shuning uchun manfiy raqam haqiqiy a'zo bilan HECH QACHON
   *  to'qnashmaydi. Bu a'zolar HECH QANDAY boshqa jadvalga (Member/TelegramUser/RideReward)
   *  yozilmaydi — faqat shu ro'yxatda ism sifatida yashaydi. `oyin:testrides:*` kaliti ularning
   *  "safari"ni beradi (2026-08-05, ega jonli sinov talabi). */
  testNames: Record<number, string>;
  /** 🎯 Boshliq/admin ONGLI ravishda "bu oy KIM UCHUN ball yig'amiz" deb E'LON QILGAN matn —
   *  oy -> HAMMA A'ZOGA ko'rinadigan xabar (audit-izoh EMAS, ijtimoiy e'lon). `getJamoaView`
   *  asosiy banner shundan o'qiydi (2026-08-05, ega talabi: "hammaga bilinishi kerak"). */
  turnOverrides: Record<string, string>;
}

/** memberId -> ISO sana xaritasini xavfsiz o'qish (`joinedAt` uchun — `turns`ning `parseTurns`
 *  qardoshi, lekin kalit-son emas kalit-son:qiymat-satr). */
function parseJoinedAt(raw: unknown): Record<number, string> {
  const out: Record<number, string> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const id = Number(k);
    if (Number.isFinite(id) && typeof v === "string" && Number.isFinite(Date.parse(v))) out[id] = v;
  }
  return out;
}

/** `testNames` — kalit = memberId (MANFIY ham bo'ladi, `joinedAt` qardoshi, lekin qiymat sana
 *  emas erkin ism). */
function parseTestNames(raw: unknown): Record<number, string> {
  const out: Record<number, string> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const id = Number(k);
    if (Number.isFinite(id) && typeof v === "string" && v.length > 0) out[id] = v.slice(0, 60);
  }
  return out;
}

/** `turnOverrides` — kalit = oy (`YYYY-MM`), qiymat = HAMMAGA ko'rinadigan e'lon matni. */
function parseStringMap(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (/^\d{4}-\d{2}$/.test(k) && typeof v === "string" && v.length > 0) out[k] = v.slice(0, 300);
  }
  return out;
}

export function parseJamoa(raw: string | undefined): JamoaRecord | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<JamoaRecord>;
    if (!v.id || !Array.isArray(v.members)) return null;
    const members = v.members.filter((m): m is number => typeof m === "number" && Number.isFinite(m));
    return {
      id: String(v.id),
      name: typeof v.name === "string" && v.name ? v.name : "Jamoa",
      // 🔴 S7-6 (nazoratchi 2026-08-04): avval faqat SATRligi tekshirilardi. `createdAt:"salom"`
      // → `monthKeyOf(new Date("salom"))` → `.toISOString()` RangeError THROW qiladi va u
      // `computeBallMap` ichida ushlanmaydi → getBall/getOyinState/buyTicket/adminMemberDetail
      // HAMMASI yiqiladi. Bitta buzuq AppState qatori butun o'yinni o'chirardi.
      createdAt: typeof v.createdAt === "string" && Number.isFinite(Date.parse(v.createdAt))
        ? v.createdAt : new Date().toISOString(),
      members,
      // Eski yozuvda `turns` YO'Q → bo'sh xarita, ya'ni navbat ham, ball ham yo'q. Bu XAVFSIZ
      // sukut: hisoblab tashlashdan ko'ra bermaslik afzal (hisoblash aynan bugni keltirgan).
      turns: parseTurns((v as { turns?: unknown }).turns),
      // Eski yozuvda `leaderId` yo'q/aralash — birinchi a'zo (tuzuvchi taxmin qilinadi).
      // Noma'lumlik JAZO emas (S7-6/S8-6 uslubi): 0 EMAS, mavjud a'zolardan biri.
      leaderId: typeof v.leaderId === "number" && members.includes(v.leaderId) ? v.leaderId : (members[0] ?? 0),
      joinedAt: parseJoinedAt((v as { joinedAt?: unknown }).joinedAt),
      disbandedAt: typeof v.disbandedAt === "string" && Number.isFinite(Date.parse(v.disbandedAt)) ? v.disbandedAt : null,
      testNames: parseTestNames((v as { testNames?: unknown }).testNames),
      turnOverrides: parseStringMap((v as { turnOverrides?: unknown }).turnOverrides),
    };
  } catch {
    return null;
  }
}

/** Oy kaliti (Toshkent) — `2026-08`. Navbat SHU birlikda aylanadi. */
function monthKeyOf(d: Date): string {
  return tashkentDayKey(d).slice(0, 7);
}

/** 🤝 GASHTAK-LEDGER YOZUVI — safar HAQIQIY tasdiqlanganda (RideReward yaratilgan zahoti)
 *  DARHOL chaqiriladi (`cashbackService.rollRideCashback`dan). `GashtakReward` bir marta
 *  yozilgach O'ZGARMAYDI — guruh tarkibi keyin o'zgarsa ham, bu yozuv o'sha kunlik haqiqatni
 *  abadiy saqlaydi (eski "computeBallMap har safar qayta hisoblaydi" bugining tuzatilishi).
 *
 *  Best-effort: bu YORDAMCHI bonus, asosiy pul-yo'liga (RideReward/CoinTxn) TA'SIR QILMAYDI —
 *  xato bo'lsa jim log qilinadi, safar-cashback jarayoni to'xtamaydi. */
export async function creditGashtakLedger(riderId: number, rideRewardId: number): Promise<void> {
  try {
    if (!(await featureOn("oyin"))) return;
    const econ = await getBonusEcon();
    const perRide = econ.oyinJamoaBallPerRide ?? 0;
    if (perRide <= 0) return;
    const j = await jamoaOf(riderId);
    if (!j || j.members.length < OYIN_JAMOA_MIN) return;
    const monthKey = monthKeyOf(new Date());
    const navbatchi = navbatchiOf(j, monthKey);
    if (navbatchi == null) return;
    // 🔴 B1 (2026-08-16 audit): navbatchi SINOV (virtual, manfiy ID) a'zo bo'lishi mumkin —
    // bu ATAYLAB ruxsat etilgan (`applySetTurn`/`assignTurn`, `simGuards.ts:157` tomonidan
    // tekshirilgan, ONGLI qaror — "ikkinchi yo'l yo'q"). Lekin BU YERDA — HAQIQIY safar balli
    // yozilayotgan joyda — sinov a'zoga yozish ballni ABADIY undirib bo'lmaydigan hisobga
    // yashiradi (Member/TelegramUser yo'q, hech kim bu GashtakReward'ni hech qachon ko'rmaydi).
    // Shuning uchun bu holatda ball KREDITLANMAYDI (yo'qolmaydi — shunchaki bu ride uchun hech
    // kimga yozilmaydi), o'rniga ega guruh+oy uchun BIR MARTA ogohlantiriladi (marker bilan —
    // keyingi har safar uchun jim qaytadi, spam bo'lmasin) — boshliq navbatni haqiqiy a'zoga
    // o'tkazishi mumkin, keyingi safardan to'g'ri kishiga tushadi.
    if (navbatchi < 0) {
      const alertKey = `oyin:testturn_alert:${j.id}:${monthKey}`;
      try {
        await prisma.appState.create({ data: { key: alertKey, value: "1" } });
        const { alertAdmins } = await import("./economyService");
        await alertAdmins(
          `⚠️ <b>Gashtak «${j.name}» ${monthKey} oyi uchun navbatchi SINOV a'zo</b>\n` +
          `Real safar balli hozircha hech kimga tushmayapti (yo'qolmayapti — shunchaki kutmoqda). ` +
          `Boshliqqa aytib, «⚙️ Boshqarish → 🎯 Ball»dan navbatni haqiqiy a'zoga o'tkazing.`,
        ).catch(() => undefined);
      } catch {
        // marker allaqachon bor — bu oy uchun ogohlantirish ALLAQACHON ketgan, jim qaytiladi
      }
      return;
    }
    const maxBall = econ.oyinJamoaMaxBall ?? 3600;
    const sofar = await prisma.gashtakReward.aggregate({
      where: { memberId: navbatchi, jamoaId: j.id, monthKey },
      _sum: { amount: true },
    });
    const already = sofar._sum.amount ?? 0;
    if (already >= maxBall) return;
    const amount = Math.min(perRide, maxBall - already);
    await prisma.gashtakReward.create({
      data: { memberId: navbatchi, jamoaId: j.id, rideRewardId, monthKey, amount },
    });
  } catch (e) {
    // `rideRewardId` unique — qayta so'rov (@@unique buzilishi) jim o'tkaziladi; boshqa xato log
    // qilinadi, lekin bu funksiya HECH QACHON chaqiruvchiga (safar-cashback) tashlamaydi.
    console.error("[oyin] creditGashtakLedger:", e);
  }
}

/** 🔄 NAVBAT — kim shu oyning navbatchisi.
 *
 *  Deterministik: jamoa tuzilganidan beri o'tgan oylar soni `members` ro'yxati bo'ylab aylanadi.
 *  Alohida saqlash YO'Q va bu ATAYLAB: (a) navbatni qo'lda tanlash imkoni bo'lsa, jamoa boshlig'i
 *  o'zini har oy tanlab qo'ya olardi; (b) saqlanadigan holat — yana bitta buzilishi mumkin
 *  bo'lgan manba. Formula esa har kim tekshira oladi: «tuzilgandan beri N-oy → N mod jamoa soni».
 *  ⚠️ A'zo qo'shilsa/chiqsa tartib siljiydi — bu qabul qilingan narx, muqobil (qotirilgan navbat
 *  jadvali) chiqib ketgan a'zoga navbat berib qo'yardi. */
/** `turns` xaritasini xavfsiz o'qish — kalit `YYYY-MM`, qiymat butun son bo'lishi shart. */
function parseTurns(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (/^\d{4}-\d{2}$/.test(k) && typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

/** 🔴 S7-2b: SOF QIDIRUV — hisob YO'Q. Shuning uchun o'tgan oy hech qachon qayta taqsimlanmaydi.
 *  Navbatchi guruhdan chiqib ketgan bo'lsa navbat BEKOR (ball yo'q) — chiqib-qayta kirish bilan
 *  qayta ball olishning oldi olinadi. */
export function navbatchiOf(j: JamoaRecord, monthKey: string): number | null {
  // ⚠️ A'ZOLIK ATAYLAB TEKSHIRILMAYDI. Ikki sabab:
  //  1. `assignTurn` har odamga UMRI DAVOMIDA bitta navbat beradi (pastga qarang), ya'ni
  //     a'zolikni tekshirish qo'shimcha himoya BERMAYDI — jami ball baribir chegaralangan.
  //  2. Tekshirilsa, guruhdan chiqqan odamning O'TGAN oydagi balli YO'QOLARDI. U o'sha ballni
  //     allaqachon kartaga sarflagan bo'lishi mumkin → `ball = max(0, earned − spent)` bilan
  //     KO'RINMAYDIGAN QARZ paydo bo'lardi. Bu — S8-2 dagi aynan o'sha xato shakli.
  return j.turns[monthKey] ?? null;
}

/** Yangi a'zoga navbat oyini biriktiradi: band bo'lmagan ENG YAQIN oy (guruh tuzilganidan
 *  boshlab). Biriktirilgan oy hech qachon bo'shatilmaydi — a'zo chiqsa ham (aks holda
 *  chiq-kir aylanishi bilan navbat qayta sotilardi). */
export function assignTurn(j: JamoaRecord, memberId: number): string {
  // 🔴 Sinov (`simGuards` D-bo'limi) topdi: chiq→QAYTA KIR ikkinchi navbat berardi va odam
  // ikki oylik ball olardi. Navbat — UMRBOD BITTA. Qayta kirgan odam o'sha eski oyini
  // qaytaradi (u allaqachon o'tgan), yangisini EMAS.
  const had = Object.entries(j.turns).find(([, m]) => m === memberId);
  if (had) return had[0];
  const start = monthKeyOf(new Date(j.createdAt));
  for (let i = 0; i < OYIN_JAMOA_MAX * 4; i++) {
    const mk = addMonths(start, i);
    if (j.turns[mk] === undefined) { j.turns[mk] = memberId; return mk; }
  }
  return start;
}

/** `YYYY-MM` + n oy. `monthsBetween` ning teskarisi — ikkalasi bir xil ta'rifda bo'lishi shart. */
export function addMonths(monthKey: string, n: number): string {
  const y = Number(monthKey.slice(0, 4));
  const m = Number(monthKey.slice(5, 7));
  if (!Number.isFinite(y) || !Number.isFinite(m)) return monthKey;
  const total = y * 12 + (m - 1) + n;
  return `${String(Math.floor(total / 12)).padStart(4, "0")}-${String((total % 12) + 1).padStart(2, "0")}`;
}
function monthsBetween(a: string, b: string): number {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  if (!ay || !am || !by || !bm) return 0;
  return (by - ay) * 12 + (bm - am);
}

/** 🤝 A'zoning jamoasi (yoki `null`). */
/** 🔒 CAS (compare-and-set) — `value` o'zgarmagan bo'lsagina yozadi, aks holda qayta o'qib
 *  qayta uriniladi. Prisma'da o'qib-o'zgartirib-yozish ATOMIK EMAS: ikki parallel so'rov
 *  bir-birining natijasini jimgina yo'q qiladi (nazoratchi 2026-08-04, S7-3 va №8).
 *  Interaktiv tranzaksiya o'rniga shu tanlandi — u ulanishni butun ish davomida ushlab
 *  turadi va ichkarida boshqa so'rov bo'lsa pool qulflanib qolishi mumkin.
 *  `mutate` `null` qaytarsa — o'zgarish shart emas, `null` qaytariladi. */
async function casJamoa(key: string, mutate: (cur: JamoaRecord) => JamoaRecord | null): Promise<JamoaRecord | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const row = await prisma.appState.findUnique({ where: { key } });
    const cur = parseJamoa(row?.value);
    if (!row || !cur) return null;
    const next = mutate(cur);
    if (!next) return null;
    const value = JSON.stringify(next);
    const n = await prisma.$executeRaw`UPDATE "AppState" SET "value" = ${value} WHERE "key" = ${key} AND "value" = ${row.value}`;
    if (n === 1) return next;
    // n === 0 → orada boshqa so'rov yozgan. Qayta o'qiymiz.
  }
  console.error(`[oyin] casJamoa: 5 urinishda ham yozilmadi (${key})`);
  return null;
}

async function jamoaOf(memberId: number): Promise<JamoaRecord | null> {
  const link = await prisma.appState.findUnique({ where: { key: `${JAMOA_MEM_PREFIX}${memberId}` } });
  if (!link?.value) return null;
  const row = await prisma.appState.findUnique({ where: { key: `${JAMOA_PREFIX}${link.value}` } });
  const j = parseJamoa(row?.value);
  // ⚠️ Yetim havola: guruh o'chirilgan/tarqatilgan, indeks qolgan. Jimgina `null` — a'zo
  // yangisini tuza oladi. `disbandedAt` tekshiruvi qo'shimcha xavfsizlik qatlami (2026-08-05
  // rejasi) — pointer xato qolib ketgan taqdirda ham mijoz o'lik guruhga "osilib" qolmaydi.
  if (!j || j.disbandedAt != null || !j.members.includes(memberId)) return null;
  return j;
}

const COOLDOWN_PREFIX = "oyin:gashtakcooldown:";

/** 🛡 TOPILMA 2 (2026-08-05 ekspluatatsiya tahlili): navbat BIR guruh ICHIDA takror-turmaydi
 *  (S7-2b), lekin guruhlararo cheklov yo'q edi — chiq → boshqa faol guruhga qo'shil → yangi
 *  navbat oyi ol, takrorlana beradi (guruh ball hajmi butun guruhning safariga bog'liq,
 *  navbatchining o'zi safar qilishi shart emas). `create`/`join`/`add` UCHALASI shu BITTA
 *  funksiyani chaqiradi — nusxa emas. */
async function checkGashtakCooldown(memberId: number): Promise<{ ok: true } | { ok: false; daysLeft: number }> {
  const row = await prisma.appState.findUnique({ where: { key: `${COOLDOWN_PREFIX}${memberId}` } });
  if (!row?.value) return { ok: true };
  const at = Date.parse(row.value);
  if (!Number.isFinite(at)) return { ok: true }; // buzuq qator — jazo emas
  const econ = await getBonusEcon();
  const days = econ.oyinGashtakRejoinCooldownDays ?? 30;
  const elapsedDays = (Date.now() - at) / 86_400_000;
  if (elapsedDays >= days) return { ok: true };
  return { ok: false, daysLeft: Math.max(1, Math.ceil(days - elapsedDays)) };
}

async function stampGashtakCooldown(memberId: number): Promise<void> {
  const key = `${COOLDOWN_PREFIX}${memberId}`;
  const value = new Date().toISOString();
  await prisma.appState.upsert({ where: { key }, create: { key, value }, update: { value } });
}

function inviteLinkOf(code: string): string {
  return `https://t.me/koson1067bot?start=gsk_${code}`;
}

/** `preview=true` (ega/admin) — bayroq DARK bo'lsa ham ishlaydi, xuddi `buyTicket`/`markLogin`
 *  kabi (2-QISM naqshi). Bu yo'q edi: bayroq qorong'ida ega jamoa tuza/qo'shila OLMASDI —
 *  "gap bo'limi ishlamadi" shikoyatining sababi. */
export async function createJamoa(memberId: number, nameRaw: string, preview = false): Promise<OyinJamoaResult> {
  if (!preview && !(await featureOn("oyin"))) return { ok: false, reason: "off" };
  const name = (nameRaw || "").trim().slice(0, 40);
  if (name.length < 2) return { ok: false, reason: "bad_name" };
  if (await jamoaOf(memberId)) return { ok: false, reason: "already_in" };
  const cd = await checkGashtakCooldown(memberId);
  if (!cd.ok) return { ok: false, reason: "cooldown", cooldownDaysLeft: cd.daysLeft };
  // Kod — qo'shilish uchun ulashiladigan qisqa satr. 6 belgi, chalkashadigan harflar YO'Q
  // (0/O, 1/I) — odam uni og'zaki aytadi va yozib oladi.
  const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    id = Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("");
    const clash = await prisma.appState.findUnique({ where: { key: `${JAMOA_PREFIX}${id}` } });
    if (!clash) break;
    id = "";
  }
  if (!id) return { ok: false, reason: "not_found" };
  // 🔴 S7-3 (nazoratchi 2026-08-04): avval na qulf, na tranzaksiya bor edi va a'zolik yozuvi
  // `upsert` bilan yozilardi. Ikki parallel so'rov IKKI guruh yaratardi (a'zo ikkalasida —
  // ikki barobar ball), guruh yozuvi yiqilsa esa a'zo "yetim" indeksda qolardi.
  // Tartib TESKARIGA aylantirildi: avval A'ZOLIK indeksi `create` bilan (kalit — memberId,
  // ya'ni baza o'zi ikkinchisini rad etadi), keyin guruh. Guruh yozilmasa indeks qaytariladi.
  const memKey = `${JAMOA_MEM_PREFIX}${memberId}`;
  try {
    await prisma.appState.create({ data: { key: memKey, value: id } });
  } catch {
    return { ok: false, reason: "already_in" }; // parallel so'rov bizdan oldin ulgurdi
  }
  const now = new Date().toISOString();
  const rec: JamoaRecord = {
    id, name, createdAt: now, members: [memberId], turns: {},
    leaderId: memberId, joinedAt: { [memberId]: now }, disbandedAt: null,
    testNames: {}, turnOverrides: {},
  };
  assignTurn(rec, memberId); // tuzuvchining navbati — guruh tuzilgan OY
  try {
    await prisma.appState.create({ data: { key: `${JAMOA_PREFIX}${id}`, value: JSON.stringify(rec) } });
  } catch (e) {
    await prisma.appState.deleteMany({ where: { key: memKey } }); // yetim indeks QOLMAYDI
    console.error("[oyin] jamoa yaratilmadi, a'zolik qaytarildi:", e);
    return { ok: false, reason: "not_found" };
  }
  invalidateBallCache();
  return { ok: true };
}

export async function joinJamoa(memberId: number, codeRaw: string, preview = false): Promise<OyinJamoaResult> {
  if (!preview && !(await featureOn("oyin"))) return { ok: false, reason: "off" };
  if (await jamoaOf(memberId)) return { ok: false, reason: "already_in" };
  const cd = await checkGashtakCooldown(memberId);
  if (!cd.ok) return { ok: false, reason: "cooldown", cooldownDaysLeft: cd.daysLeft };
  const code = (codeRaw || "").trim().toUpperCase().slice(0, 6);
  const key = `${JAMOA_PREFIX}${code}`;
  const row = await prisma.appState.findUnique({ where: { key } });
  const j = parseJamoa(row?.value);
  if (!j) return { ok: false, reason: "not_found" };
  // 🛡 TOPILMA 1: tarqatilgan guruh eski havola bilan "tiriltirilmaydi".
  if (j.disbandedAt != null) return { ok: false, reason: "disbanded" };
  if (j.members.includes(memberId)) return { ok: false, reason: "already_in" };
  if (j.members.length >= OYIN_JAMOA_MAX) return { ok: false, reason: "full" };
  // 🔴 S7-3: avval `upsert` + filtrsiz `update` edi — ikki parallel qo'shilish bir-birini
  // ustidan yozib, `OYIN_JAMOA_MAX` ni chetlab o'tardi va a'zo ro'yxatda IKKI marta chiqardi.
  // Endi: (1) a'zolik indeksi `create` bilan — baza ikkinchisini rad etadi;
  //       (2) guruh yozuvi CAS bilan — orada o'zgargan bo'lsa qayta o'qib qayta uriniladi.
  const memKey = `${JAMOA_MEM_PREFIX}${memberId}`;
  try {
    await prisma.appState.create({ data: { key: memKey, value: code } });
  } catch {
    return { ok: false, reason: "already_in" };
  }
  const joined = await casJamoa(key, (cur) => {
    if (cur.disbandedAt != null) return null;                  // orada tarqatilgan
    if (cur.members.includes(memberId)) return null;          // boshqa so'rov qo'shib bo'lgan
    if (cur.members.length >= OYIN_JAMOA_MAX) return null;     // orada to'lib qolgan
    cur.members.push(memberId);
    cur.joinedAt[memberId] = new Date().toISOString();
    assignTurn(cur, memberId);                                 // navbat SHU YERDA qotadi
    return cur;
  });
  if (!joined) {
    await prisma.appState.deleteMany({ where: { key: memKey } }); // yetim indeks QOLMAYDI
    return { ok: false, reason: "full" };
  }
  invalidateBallCache();
  return { ok: true };
}

/** 🔴 TOPILMA 1 (2026-08-05 ekspluatatsiya tahlili — jonli kodda ALLAQACHON bor edi, S7-3
 *  sessiyasidan): oxirgi a'zo chiqqanda qator ILGARI O'CHIRILARDI (`deleteMany`). Ball hech
 *  qachon ledger emas — HAR safar `turns` xaritasidan qayta hisoblanadi. Qator o'chsa BARCHA
 *  o'tgan oylarning ball tarixi RETROAKTIV yo'qolardi (S8-2 "yashirin qarz" bilan bir xil oila,
 *  teskari yo'nalishda: qarz emas, YO'QOLGAN mulk). Endi SOFT-DELETE: `disbandedAt` yoziladi,
 *  `turns`/`joinedAt` ABADIY qoladi — tickets/winners bilan bir xil falsafa.
 *  `members.length < OYIN_JAMOA_MIN` qo'rig'i (S7-1) kelajak oylarni baribir to'xtatadi,
 *  o'tganlar esa buzilmaydi.
 *
 *  SOF FUNKSIYA — `leaveJamoa`/`kickFromJamoa`/`adminKickFromJamoa` UCHALASI ham shundan
 *  (S8-8 saboqi: bir xil mantiqni uch joyda nusxalash — ertami-kechmi biri unutilib qoladi).
 *  `simGuards` HAQIQIY shu funksiyaga qarshi sinaydi, nusxaga emas. */
export function applyRemoveMember(j: JamoaRecord, targetId: number): JamoaRecord {
  const next: JamoaRecord = { ...j, members: j.members.filter((m) => m !== targetId) };
  if (next.members.length === 0) next.disbandedAt = new Date().toISOString();
  return next;
}

export async function leaveJamoa(memberId: number): Promise<OyinJamoaResult> {
  const j = await jamoaOf(memberId);
  if (!j) return { ok: false, reason: "not_in" };
  const key = `${JAMOA_PREFIX}${j.id}`;
  // 🔴 S7-3: CAS — orada boshqa a'zo qo'shilgan bo'lsa uni o'chirib yubormaymiz.
  // ⚠️ `turns` TEGILMAYDI: chiqqan odamning navbat oyi BAND bo'lib qoladi. Bo'shatilsa
  // chiq→kir aylanishi bilan o'sha oy qayta sotilardi. `navbatchiOf` a'zo emasligini
  // ko'rib ball bermaydi — oy shunchaki bo'sh o'tadi.
  const left = await casJamoa(key, (cur) => applyRemoveMember(cur, memberId));
  await prisma.appState.deleteMany({ where: { key: `${JAMOA_MEM_PREFIX}${memberId}` } });
  // 🛡 TOPILMA 2: chiqqan odam darhol boshqa guruhga o'tib yangi navbat "termasin".
  if (left) await stampGashtakCooldown(memberId);
  invalidateBallCache();
  return { ok: true };
}

/** 🤝 BITTA guruh uchun a'zo-statistikasi — `getJamoaView` (o'zini ko'rish) VA
 *  `adminGashtakDetail` (admin) IKKALASI ham shu funksiyani chaqiradi (S8-8 saboqi: ikki xil
 *  joyda bir xil raqamni ikki xil hisoblash — o'sha bugning o'zi shu edi).
 *
 *  ✅ TUZATILDI (2026-08-07): `ballEarnedTotal`ning REAL qismi endi `GashtakReward` ledgeridan
 *  o'qiladi — `computeBallMap` bilan AYNAN BIR XIL manba, qayta hisoblash YO'Q. Eski bug (guruh
 *  tarkibi o'zgarsa o'tgan oylarning balli SILJIYDI) shu bilan yopildi: ledger yozuvi bir marta
 *  yozilgach O'ZGARMAYDI. Faqat TEST (virtual, manfiy ID) a'zolarning hissasi hamon taxminiy —
 *  ular haqiqiy safar qilmagani uchun ledgerga umuman yozilmaydi, shuning uchun ularning ta'siri
 *  alohida, real-ledger sig'imidan ORTIQ QOLGAN joyda taxmin qilinadi (pastga qarang). */
async function jamoaMemberStats(j: JamoaRecord): Promise<Map<number, {
  ridesThisMonth: number; ridesLifetime: number; ballEarnedTotal: number; ballEarnedThisMonth: number;
}>> {
  const nowMonth = monthKeyOf(new Date());
  const monthStart = new Date(`${nowMonth}-01T00:00:00+05:00`);
  // Hozirgi a'zolar + hech bo'lmasa bir marta navbat olgan HAMMA (tarixiy, chiqib ketgan bo'lsa
  // ham) — admin/leader tarixni ko'rishi uchun.
  const allIds = new Set<number>(j.members);
  for (const m of Object.values(j.turns)) allIds.add(m);
  const ids = [...allIds];
  const out = new Map<number, { ridesThisMonth: number; ridesLifetime: number; ballEarnedTotal: number; ballEarnedThisMonth: number }>();
  for (const id of ids) out.set(id, { ridesThisMonth: 0, ridesLifetime: 0, ballEarnedTotal: 0, ballEarnedThisMonth: 0 });
  if (ids.length === 0) return out;
  // 🧪 VIRTUAL (manfiy ID) a'zolar `RideReward`ga YOZILMAGAN — ular uchun `oyin:testrides:*`
  // dan o'qiladi, xuddi shu `ridesByMemberMonth` xaritasiga (ikki manba, bitta iste'mol —
  // pastdagi ball-sikli farqni bilmaydi, mavjud musbat-ID yo'liga TEGMAYDI).
  const positiveIds = ids.filter((id) => id > 0);
  const negativeIds = ids.filter((id) => id < 0);
  const [rides, testRideRows] = await Promise.all([
    positiveIds.length > 0
      ? prisma.rideReward.findMany({
          where: { memberId: { in: positiveIds }, createdAt: { gte: new Date(j.createdAt) } },
          select: { memberId: true, createdAt: true },
        })
      : Promise.resolve([] as { memberId: number; createdAt: Date }[]),
    negativeIds.length > 0
      ? prisma.appState.findMany({ where: { key: { startsWith: `${TEST_RIDES_PREFIX}${j.id}:` } }, select: { key: true, value: true } })
      : Promise.resolve([] as { key: string; value: string }[]),
  ]);
  for (const r of rides) {
    const stat = out.get(r.memberId);
    if (stat) {
      stat.ridesLifetime++;
      if (r.createdAt >= monthStart) stat.ridesThisMonth++;
    }
  }
  // `oyin:testrides:<code>:<negId>:<monthKey>` — kalitni qattiq ajratib olish (`negId` o'zi
  // manfiy belgi tashiydi, `split(":")` bilan ajratish xavfsiz: prefiks o'zida `:` yo'q).
  for (const row of testRideRows) {
    const rest = row.key.slice(`${TEST_RIDES_PREFIX}${j.id}:`.length);
    const sep = rest.lastIndexOf(":");
    if (sep < 0) continue;
    const negId = Number(rest.slice(0, sep));
    const mk = rest.slice(sep + 1);
    const n = Math.max(0, Math.round(Number(row.value)));
    if (!Number.isFinite(negId) || !Number.isFinite(n)) continue;
    const stat = out.get(negId);
    if (stat) {
      stat.ridesLifetime += n;
      if (mk === nowMonth) stat.ridesThisMonth += n;
    }
  }

  // 🤝 REAL qism — o'zgarmas ledgerdan (`GashtakReward`, `creditGashtakLedger` real safar
  // tasdiqlanganda yozadi). Qayta hisoblash YO'Q — bu `computeBallMap` bilan BIR XIL manba,
  // shuning uchun ekranda ko'rsatilgan raqam HAQIQIY balansga har doim mos keladi.
  const ledgerRows = await prisma.gashtakReward.groupBy({
    by: ["memberId", "monthKey"],
    _sum: { amount: true },
    where: { jamoaId: j.id },
  });
  const realByMonth = new Map<string, number>(); // monthKey -> ledgerda shu oy uchun yozilgan jami (cap-hisobi uchun)
  for (const row of ledgerRows) {
    const stat = out.get(row.memberId);
    const amt = row._sum.amount ?? 0;
    if (stat) {
      stat.ballEarnedTotal += amt;
      if (row.monthKey === nowMonth) stat.ballEarnedThisMonth += amt;
    }
    realByMonth.set(row.monthKey, (realByMonth.get(row.monthKey) ?? 0) + amt);
  }
  // 🔴 5-CHI TESHIK (2026-08-07, jonli sinov skripti topdi): ATAYLAB OLIB TASHLANDI. Bu blok
  // test-a'zolarning ball-hissasini HAR CHAQIRUVDA `navbatchiOf(j, mk)`dan QAYTA HISOBLARDI —
  // xuddi computeBallMap/getActivity/navbatchiBall'da tuzatilgan bug bilan BIR XIL shakl, faqat
  // sinov-yo'lida. Dalil: jonli guruhda 3 ta eski sinov-a'zo (jami 358 "safar") bor edi — ular
  // HECH QACHON `GashtakReward` ledgeriga yozilmagan, lekin shu blok tufayli ularning 358×6=2148
  // balli joriy oy navbatchisiga (haqiqiy a'zo!) "tegishli" bo'lib ko'rsatilardi — va navbat
  // qayta belgilansa (`applySetTurn`), bu 2148 boshqa odamga DARHOL "ko'chib" ketardi. Ya'ni
  // ega ko'rgan "ball Elboyevga o'tib ketdi" muammosi aynan shu yerdan edi, REAL ledger emas.
  // Yechim: TEST a'zolar endi ridesLifetime/ridesThisMonth (informatsion, "safar sinovi") beradi,
  // lekin ballEarnedTotal/ballEarnedThisMonth ga HECH QACHON qo'shilmaydi — faqat REAL, ledgerda
  // yozilgan ball hisoblanadi. Sinov endi "navbat/tuzilma" ni ko'rsatadi, ball-proyeksiyani emas.
  return out;
}

/** 🤝 Ekran uchun to'liq ko'rinish — a'zolar, navbatchi, shu oydagi safarlar va to'plangan ball. */
export async function getJamoaView(memberId: number): Promise<OyinJamoaView> {
  const base = { minSize: OYIN_JAMOA_MIN, maxSize: OYIN_JAMOA_MAX };
  const j = await jamoaOf(memberId);
  if (!j) return { jamoa: null, ...base };
  const econ = await getBonusEcon();
  const monthKey = monthKeyOf(new Date());
  const [tus, stats] = await Promise.all([
    prisma.telegramUser.findMany({ where: { memberId: { in: j.members } }, select: { memberId: true, firstName: true, lastName: true, username: true } }),
    jamoaMemberStats(j),
  ]);
  const nameBy = new Map<number, string>();
  for (const tu of tus) if (tu.memberId) nameBy.set(tu.memberId, shortName(tu));

  const navbatchi = navbatchiOf(j, monthKey);
  // 🟡 S7-10 (nazoratchi 2026-08-04): `hadTurn` `i < turnIdx` bilan hisoblanardi — a'zolik
  // o'zgarishi bilan XATO bo'lardi va o'z navbatini kutayotgan odamga "navbating o'tib
  // bo'lgan" deb ko'rsatardi. Endi yozib qo'yilgan `turns` dan o'qiladi.
  const turnOf = new Map<number, string>();
  for (const [mk, m] of Object.entries(j.turns)) if (!turnOf.has(m)) turnOf.set(m, mk);
  const ballPerRide = econ.oyinJamoaBallPerRide ?? 6;
  const maxBall = econ.oyinJamoaMaxBall ?? 3600;
  const ridesThisMonth = j.members.reduce((n, m) => n + (stats.get(m)?.ridesThisMonth ?? 0), 0);
  return {
    jamoa: {
      id: j.id, name: j.name, code: j.id, inviteLink: inviteLinkOf(j.id), createdAt: j.createdAt, monthKey,
      members: j.members.map((m) => {
        const mk = turnOf.get(m) ?? null;
        const s = stats.get(m);
        return {
          memberId: m,
          // 🧪 Manfiy ID (virtual/sinov a'zo) — `TelegramUser` yo'q, ism `testNames`dan.
          name: nameBy.get(m) ?? j.testNames[m] ?? `#${m}`,
          ridesThisMonth: s?.ridesThisMonth ?? 0,
          isNavbatchi: m === navbatchi,
          hadTurn: mk != null && mk < monthKey, // navbat oyi o'tib bo'lgan (satr-solishtiruv: YYYY-MM)
          turnMonth: mk,                        // "sizning navbatingiz: 2026-11" deb ko'rsatish uchun
          isLeader: m === j.leaderId,
          joinedAt: j.joinedAt[m] ?? null,
          ridesLifetime: s?.ridesLifetime ?? 0,
          ballEarnedTotal: s?.ballEarnedTotal ?? 0,
          isTest: m < 0,
        };
      }),
      ridesThisMonth,
      ballPerRide,
      // ✅ TUZATILDI (2026-08-07): endi ledgerdan (navbatchining shu oydagi haqiqiy yig'indisi) —
      // avval `ridesThisMonth × ballPerRide` deb QAYTA HISOBLANARDI, ya'ni a'zo shu oy ICHIDA
      // chiqib ketsa, uning ALLAQACHON ledgerga yozilgan hissasi bu ko'rsatkichdan yo'qolib
      // qolardi (haqiqiy balansdan kam ko'rsatardi).
      navbatchiBall: navbatchi != null ? Math.min(maxBall, stats.get(navbatchi)?.ballEarnedThisMonth ?? 0) : 0,
      maxBall,
      isMine: navbatchi === memberId,
      isLeader: j.leaderId === memberId,
      // 🎯 HAMMA a'zoga ko'rinadigan e'lon (2026-08-05, ega talabi). Joriy oy uchun
      // `turnOverrides` bo'lsa o'sha ko'rsatiladi, bo'lmasa `null` (miniapp avtomatik
      // navbat matnini chizadi).
      turnNote: j.turnOverrides[monthKey] ?? null,
    },
    ...base,
  };
}

// ── 👑 GASHTAK BOSHLIG'I (2026-08-05, ega talabi) — havola, qo'shish/chiqarish, xabar ────────

/** Xabar matni HTML sifatida yuboriladi (`parse_mode: "HTML"`) — mijoz kiritgan erkin matn
 *  (topshiriq/guruh nomi) qochirilmasa Telegram xabarni buzib yuboradi yoki rad etadi. */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Boshliq tashabbusi bilan a'zoga push. `notifyOnce` EMAS — `notifyUserInitiated` (T4/"Rahmat
 *  ayt" bilan bir xil falsafa): kunlik push-cap'ni aylanib o'tadi, blok/"o'chiq" hurmat qiladi.
 *  Uch chaqiruvchi (kick/add/message) shu BITTA yordamchidan — boilerplate nusxa emas. */
async function pushGashtakMember(targetMemberId: number, kind: string, html: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const tu = await prisma.telegramUser.findUnique({ where: { memberId: targetMemberId }, select: { id: true } });
  if (!tu) return { ok: false, reason: "no_chat" };
  const { getBotInstance } = await import("../botInstance");
  const bot = getBotInstance();
  if (!bot) return { ok: false, reason: "unreachable" };
  const { notifyUserInitiated } = await import("./notifyService");
  const { appBtn } = await import("../bot/webAppUrl");
  const sent = await notifyUserInitiated(bot, tu.id, targetMemberId, kind, html, appBtn("🎮 O'yinni ochish", "oyin"));
  return sent.ok ? { ok: true } : { ok: false, reason: sent.reason };
}

/** 🔒 Faqat boshliq. O'zini chiqara olmaydi (`self_target` — tark etmoqchi bo'lsa "guruhni
 *  tarqatish" bor). `turns` TEGILMAYDI (S7-2b falsafasi: chiqarish o'tgan navbatni tortib
 *  olmaydi, aks holda yashirin qarz). Kicklanganga cooldown belgisi (TOPILMA 2). */
export async function kickFromJamoa(leaderId: number, targetMemberId: number): Promise<OyinJamoaResult> {
  if (targetMemberId === leaderId) return { ok: false, reason: "self_target" };
  const j = await jamoaOf(leaderId);
  if (!j) return { ok: false, reason: "not_in" };
  if (j.leaderId !== leaderId) return { ok: false, reason: "leader_only" };
  const key = `${JAMOA_PREFIX}${j.id}`;
  const kicked = await casJamoa(key, (cur) => cur.members.includes(targetMemberId) ? applyRemoveMember(cur, targetMemberId) : null);
  if (!kicked) return { ok: false, reason: "not_found" };
  await prisma.appState.deleteMany({ where: { key: `${JAMOA_MEM_PREFIX}${targetMemberId}` } });
  await stampGashtakCooldown(targetMemberId);
  invalidateBallCache();
  await pushGashtakMember(targetMemberId, `gashtak_kick:${j.id}`,
    `👔 Siz <b>«${esc(j.name)}»</b> gashtakidan chiqarildingiz.`).catch(() => undefined);
  return { ok: true };
}

/** 🔒 Faqat boshliq, telefon bilan qidirilgan odamni to'g'ridan-to'g'ri qo'shadi. */
export async function addMemberToJamoa(leaderId: number, targetMemberId: number): Promise<OyinJamoaResult> {
  if (targetMemberId === leaderId) return { ok: false, reason: "self_target" };
  const j = await jamoaOf(leaderId);
  if (!j) return { ok: false, reason: "not_in" };
  if (j.leaderId !== leaderId) return { ok: false, reason: "leader_only" };
  if (j.members.length >= OYIN_JAMOA_MAX) return { ok: false, reason: "full" };
  if (await jamoaOf(targetMemberId)) return { ok: false, reason: "already_in_group" };
  const cd = await checkGashtakCooldown(targetMemberId);
  if (!cd.ok) return { ok: false, reason: "cooldown", cooldownDaysLeft: cd.daysLeft };
  const memKey = `${JAMOA_MEM_PREFIX}${targetMemberId}`;
  try {
    await prisma.appState.create({ data: { key: memKey, value: j.id } });
  } catch {
    return { ok: false, reason: "already_in_group" }; // parallel so'rov bizdan oldin ulgurdi
  }
  const key = `${JAMOA_PREFIX}${j.id}`;
  const added = await casJamoa(key, (cur) => {
    // TOCTOU: yuqoridagi tekshiruvlar CAS'DAN OLDIN — orada o'zgargan bo'lishi mumkin, shuning
    // uchun HAMMASI shu yerda QAYTA tekshiriladi (searchJoinable natijasiga ishonilmaydi).
    if (cur.disbandedAt != null) return null;
    if (cur.members.includes(targetMemberId)) return null;
    if (cur.members.length >= OYIN_JAMOA_MAX) return null;
    cur.members.push(targetMemberId);
    cur.joinedAt[targetMemberId] = new Date().toISOString();
    assignTurn(cur, targetMemberId);
    return cur;
  });
  if (!added) {
    await prisma.appState.deleteMany({ where: { key: memKey } }); // yetim indeks QOLMAYDI
    return { ok: false, reason: "full" };
  }
  invalidateBallCache();
  await pushGashtakMember(targetMemberId, `gashtak_add:${j.id}`,
    `🤝 Siz <b>«${esc(j.name)}»</b> gashtakiga qo'shildingiz — navbat bilan ball olasiz.`).catch(() => undefined);
  return { ok: true };
}

/** 🔒 Maxfiylik uchun ATAYLAB `adminFindMembers`dan (substring, ism ham) FARQLI: faqat TO'LIQ
 *  raqam mosligi, FAQAT telefon — begona odamni "topib ko'zdan kechirish" imkoni yo'q.
 *  Telefon RAQAMI qaytarilmaydi, faqat ism+memberId (+ band bo'lsa belgi, guruh nomi EMAS). */
export async function searchJoinable(leaderId: number, phoneRaw: string): Promise<OyinGashtakSearchHit[]> {
  const digits = (phoneRaw || "").replace(/\D/g, "");
  if (digits.length < 7) return []; // qisqa qidiruv = tasodifiy topish urinishi, rad etiladi
  const tus = await prisma.telegramUser.findMany({
    where: { memberId: { not: null }, phone: { not: null } },
    select: { memberId: true, phone: true, firstName: true, lastName: true, username: true },
  });
  const hits: OyinGashtakSearchHit[] = [];
  for (const tu of tus) {
    if (!tu.memberId || tu.memberId === leaderId) continue;
    const phoneDigits = (tu.phone ?? "").replace(/\D/g, "");
    if (phoneDigits !== digits) continue; // TO'LIQ moslik — substring EMAS
    const already = (await jamoaOf(tu.memberId)) != null;
    hits.push({ memberId: tu.memberId, name: shortName(tu), alreadyInGroup: already });
    break; // telefon noyob — bittadan ortiq topilmaydi
  }
  return hits;
}

/** 🔒 Faqat boshliq. Eski havola darhol ishlamay qoladi — `id` (= saqlash kaliti) o'zi
 *  almashtiriladi, alohida `inviteCode` maydoni EMAS (soddaroq). Guruh ≤10 kishi — HAR
 *  a'zoning ko'rsatkichi bitta tranzaksiyada yangi kodga o'tkaziladi. Kamdan-kam, pul yo'liga
 *  tegmaydigan amal — kichik poyga oynasi (rotatsiya paytida parallel qo'shilish) qabul
 *  qilinadi, `casJamoa` darajasidagi qulf shart emas. */
export async function regenerateJamoaCode(leaderId: number): Promise<OyinJamoaResult & { newCode?: string }> {
  const j = await jamoaOf(leaderId);
  if (!j) return { ok: false, reason: "not_in" };
  if (j.leaderId !== leaderId) return { ok: false, reason: "leader_only" };
  const code = j.id;
  const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let newCode = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    newCode = Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("");
    if (!(await prisma.appState.findUnique({ where: { key: `${JAMOA_PREFIX}${newCode}` } }))) break;
    newCode = "";
  }
  if (!newCode) return { ok: false, reason: "not_found" };
  const next: JamoaRecord = { ...j, id: newCode };
  await prisma.$transaction([
    prisma.appState.create({ data: { key: `${JAMOA_PREFIX}${newCode}`, value: JSON.stringify(next) } }),
    prisma.appState.deleteMany({ where: { key: `${JAMOA_PREFIX}${code}` } }),
    ...j.members.map((m) => prisma.appState.upsert({
      where: { key: `${JAMOA_MEM_PREFIX}${m}` },
      create: { key: `${JAMOA_MEM_PREFIX}${m}`, value: newCode },
      update: { value: newCode },
    })),
  ]);
  return { ok: true, newCode };
}

/** 📨 Boshliqning topshirig'i/xabari — erkin matn (2026-08-05 aniqlashtirishda tanlangan:
 *  vazifa-kuzatuv EMAS). `targetMemberId` berilsa shaxsiy, berilmasa o'zidan boshqa BARCHA
 *  a'zoga. Yetkazish `pushGashtakMember` orqali — kunlik-dublikat chegarasi bir boshliq bitta
 *  a'zoga kuniga bir marta (spam yo'li ochilmaydi, "Rahmat" bilan bir xil falsafa). */
export async function sendJamoaMessage(leaderId: number, textRaw: string, targetMemberId?: number): Promise<OyinJamoaMessageResult> {
  const text = (textRaw || "").trim().slice(0, 300);
  if (!text) return { ok: false, sent: 0, failed: 0, reasons: {} };
  const j = await jamoaOf(leaderId);
  if (!j) return { ok: false, sent: 0, failed: 0, reasons: {} };
  if (j.leaderId !== leaderId) return { ok: false, sent: 0, failed: 0, reasons: {} };
  const tus = await prisma.telegramUser.findMany({ where: { memberId: leaderId }, select: { firstName: true, lastName: true, username: true } });
  const leaderName = tus[0] ? shortName(tus[0]) : "Boshliq";
  const targets = targetMemberId != null
    ? (j.members.includes(targetMemberId) ? [targetMemberId] : [])
    : j.members.filter((m) => m !== leaderId);
  let sent = 0, failed = 0;
  const reasons: Record<number, string> = {};
  for (const target of targets) {
    const r = await pushGashtakMember(target, `gashtak_msg:${leaderId}:${target}`,
      `👔 <b>${leaderName}</b> («${esc(j.name)}») sizga yozdi:\n\n${esc(text)}`);
    if (r.ok) sent++; else { failed++; reasons[target] = r.reason; }
  }
  return { ok: sent > 0, sent, failed, reasons };
}

/** Ikkala chaqiruvchi (boshliq va admin) bitta haqiqatdan — TOPILMA 1: qator HECH QACHON
 *  o'chirilmaydi, faqat `members:[]` + `disbandedAt` yoziladi (o'tgan ball buzilmasin).
 *  Guruhda hali qolgan HAR a'zoning ko'rsatkichi tozalanadi VA cooldown belgisi qo'yiladi
 *  (TOPILMA 2 — "tarqat → hammaga darhol yangi guruh" teshigini yopadi). */
async function disbandJamoaInternal(code: string): Promise<OyinJamoaResult> {
  const key = `${JAMOA_PREFIX}${code}`;
  const before = parseJamoa((await prisma.appState.findUnique({ where: { key } }))?.value);
  if (!before) return { ok: false, reason: "not_found" };
  const disbanded = await casJamoa(key, (cur) => {
    cur.members = [];
    cur.disbandedAt = new Date().toISOString();
    return cur;
  });
  if (!disbanded) return { ok: false, reason: "not_found" };
  await Promise.all(before.members.map(async (m) => {
    await prisma.appState.deleteMany({ where: { key: `${JAMOA_MEM_PREFIX}${m}` } });
    await stampGashtakCooldown(m);
  }));
  invalidateBallCache();
  return { ok: true };
}

/** 🔒 Faqat boshliq — o'zini ham, hammani ham chiqaradi (kick o'z-o'ziga ishlamaydi, shuning
 *  uchun tark etishning yagona yo'li shu). */
export async function disbandJamoaByLeader(leaderId: number): Promise<OyinJamoaResult> {
  const j = await jamoaOf(leaderId);
  if (!j) return { ok: false, reason: "not_in" };
  if (j.leaderId !== leaderId) return { ok: false, reason: "leader_only" };
  return disbandJamoaInternal(j.id);
}

/** Admin versiyasi — `leaderId` tekshiruvisiz (moderatsiya). */
export async function adminDisbandJamoa(code: string): Promise<OyinJamoaResult> {
  return disbandJamoaInternal(code);
}

/** Admin versiyasi — `leaderId` tekshiruvisiz (moderatsiya). `turns` TEGILMAYDI (kick bilan
 *  bir xil falsafa). */
export async function adminKickFromJamoa(code: string, targetMemberId: number): Promise<OyinJamoaResult> {
  const key = `${JAMOA_PREFIX}${code}`;
  const kicked = await casJamoa(key, (cur) => cur.members.includes(targetMemberId) ? applyRemoveMember(cur, targetMemberId) : null);
  if (!kicked) return { ok: false, reason: "not_found" };
  await prisma.appState.deleteMany({ where: { key: `${JAMOA_MEM_PREFIX}${targetMemberId}` } });
  await stampGashtakCooldown(targetMemberId);
  invalidateBallCache();
  return { ok: true };
}

/** 🛠 Admin: barcha gashtak guruhlari — kod, nom, boshliq, a'zo soni, umumiy ball. */
export async function adminListGashtak(): Promise<OyinAdminGashtakRow[]> {
  const rows = await prisma.appState.findMany({ where: { key: { startsWith: JAMOA_PREFIX } } }) as AppStateRow[];
  const groups = rows.map((r) => parseJamoa(r.value)).filter((j): j is JamoaRecord => j != null);
  const allIds = [...new Set(groups.flatMap((j) => [j.leaderId, ...j.members]))];
  const tus = allIds.length > 0
    ? await prisma.telegramUser.findMany({ where: { memberId: { in: allIds } }, select: { memberId: true, firstName: true, lastName: true, username: true } })
    : [];
  const nameBy = new Map<number, string>();
  for (const tu of tus) if (tu.memberId) nameBy.set(tu.memberId, shortName(tu));
  const out: OyinAdminGashtakRow[] = [];
  for (const j of groups) {
    const stats = await jamoaMemberStats(j);
    let total = 0;
    for (const s of stats.values()) total += s.ballEarnedTotal;
    out.push({
      code: j.id, name: j.name, leaderId: j.leaderId, leaderName: nameBy.get(j.leaderId) ?? `#${j.leaderId}`,
      memberCount: j.members.length, createdAt: j.createdAt, disbandedAt: j.disbandedAt, ballEarnedTotal: total,
    });
  }
  out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return out;
}

/** 🛠 Admin: bitta guruh to'liq — faol + tarixiy (chiqib ketgan/chiqarilgan, lekin navbat
 *  olgan) a'zolar. `jamoaMemberStats` bilan BIR XIL manba (S8-8 saboqi). */
export async function adminGashtakDetail(code: string): Promise<OyinAdminGashtakDetail | null> {
  const row = await prisma.appState.findUnique({ where: { key: `${JAMOA_PREFIX}${code}` } });
  const j = parseJamoa(row?.value);
  if (!j) return null;
  const stats = await jamoaMemberStats(j);
  const allIds = [...stats.keys()];
  const tus = allIds.length > 0
    ? await prisma.telegramUser.findMany({ where: { memberId: { in: allIds } }, select: { memberId: true, phone: true, firstName: true, lastName: true, username: true } })
    : [];
  const byId = new Map(tus.filter((tu) => tu.memberId != null).map((tu) => [tu.memberId as number, tu]));
  const turnOf = new Map<number, string>();
  for (const [mk, m] of Object.entries(j.turns)) if (!turnOf.has(m)) turnOf.set(m, mk);
  const members = allIds.map((id) => {
    const tu = byId.get(id);
    const s = stats.get(id);
    return {
      memberId: id, name: tu ? shortName(tu) : (j.testNames[id] ?? `#${id}`), phone: tu?.phone ?? null,
      isLeader: id === j.leaderId, joinedAt: j.joinedAt[id] ?? null, turnMonth: turnOf.get(id) ?? null,
      ridesLifetime: s?.ridesLifetime ?? 0, ballEarnedTotal: s?.ballEarnedTotal ?? 0,
      inGroup: j.members.includes(id), isTest: id < 0,
    };
  });
  members.sort((a, b) => (b.isLeader ? 1 : 0) - (a.isLeader ? 1 : 0) || (a.turnMonth ?? "").localeCompare(b.turnMonth ?? ""));
  const turnOverrides = Object.entries(j.turnOverrides).map(([monthKey, note]) => ({ monthKey, note })).sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  return { code: j.id, name: j.name, leaderId: j.leaderId, createdAt: j.createdAt, disbandedAt: j.disbandedAt, members, turnOverrides };
}

// ── 🧪 SINOV A'ZOLARI (2026-08-05, ega talabi: "3-4 fake kishi qo'shib jonli testlash") ──────
//
// ⚠️ ARXITEKTURA QARORI: `RideReward`/`Member`/`TelegramUser`ga UMUMAN TEGILMAYDI. `RideReward`
// 23 ta boshqa faylda o'qiladi (cashbackService, corpService, campaignService, rollupService,
// analyticsService...) — sun'iy qator qo'shish real dashboard/hisobot/korp-balansni buzardi.
// `Member.kasId` esa "kas1067'dan sinxronlanadi" — fake qiymat tungi sinxronizatsiyani
// buzishi mumkin edi. Yechim: MANFIY memberId — `Member.id` `@default(autoincrement())`
// faqat MUSBAT son beradi, ya'ni manfiy raqam HAQIQIY a'zo bilan hech qachon to'qnashmaydi.
// Virtual a'zo hech qanday jadvalga yozilmaydi — faqat `JamoaRecord.testNames` da ism sifatida
// va `oyin:testrides:*` da "safar soni" sifatida yashaydi. Navbat/ball/kick — HAMMASI HAQIQIY
// kod (`assignTurn`/`navbatchiOf`/`applyRemoveMember`/`casJamoa`) — faqat "kimning safari"
// manbai farq qiladi (`jamoaMemberStats` ichida, pastda).
const TEST_RIDES_PREFIX = "oyin:testrides:";

function testRidesKey(code: string, negativeId: number, monthKey: string): string {
  return `${TEST_RIDES_PREFIX}${code}:${negativeId}:${monthKey}`;
}

/** 🔒 Admin-only. Yangi VIRTUAL (sinov) a'zo qo'shadi — haqiqiy Telegram akkaunt shart emas. */
export async function adminAddTestMember(code: string, nameRaw: string, initialMonthlyRides: number): Promise<OyinJamoaResult> {
  const name = (nameRaw || "").trim().slice(0, 40) || "Sinov a'zo";
  const key = `${JAMOA_PREFIX}${code}`;
  let negId = 0;
  const added = await casJamoa(key, (cur) => {
    if (cur.members.length >= OYIN_JAMOA_MAX) return null;
    // Manfiy ID — guruh 6-xonali kod generatsiyasi bilan bir xil "urinib ko'r, to'qnashsa
    // qayta" naqshi (bu safar DB emas, xotiradagi `cur.members`ga qarshi tekshiriladi).
    for (let attempt = 0; attempt < 5; attempt++) {
      const cand = -(1_000_000 + Math.floor(Math.random() * 8_999_999));
      if (!cur.members.includes(cand)) { negId = cand; break; }
    }
    if (!negId) return null;
    cur.members.push(negId);
    // ⚠️ Emoji BU YERDA yozilmaydi — `isTest: memberId < 0` ekranlarda YAGONA manba (miniapp
    // ham, admin panel ham `{m.isTest && "🧪 "}` bilan chizadi). Avval shu yerda ham
    // qo'shilardi va ikki marta "🧪 🧪" chiqardi (2026-08-05, jonli demo QA'da topildi).
    cur.testNames[negId] = name;
    assignTurn(cur, negId); // HAQIQIY funksiya — virtual a'zo ham navbat oladi
    return cur;
  });
  if (!added || !negId) return { ok: false, reason: "full" };
  if (initialMonthlyRides > 0) {
    const monthKey = monthKeyOf(new Date());
    await prisma.appState.create({ data: { key: testRidesKey(code, negId, monthKey), value: String(Math.max(0, Math.round(initialMonthlyRides))) } }).catch(() => undefined);
  }
  invalidateBallCache();
  return { ok: true };
}

/** 🔒 Admin-only. Mavjud sinov a'zoning "bu oy N safar qildi" sonini o'rnatadi — ega jonli
 *  ko'radi: raqamni o'zgartirib, navbatchi/ball formulasi darhol qanday javob berishini kuzatadi. */
export async function adminSetTestRides(code: string, negativeId: number, monthKeyRaw: string, rides: number): Promise<OyinJamoaResult> {
  if (negativeId >= 0) return { ok: false, reason: "not_group_member" };
  const monthKey = /^\d{4}-\d{2}$/.test(monthKeyRaw) ? monthKeyRaw : monthKeyOf(new Date());
  const row = await prisma.appState.findUnique({ where: { key: `${JAMOA_PREFIX}${code}` } });
  const j = parseJamoa(row?.value);
  if (!j || !(negativeId in j.testNames)) return { ok: false, reason: "not_found" };
  const value = String(Math.max(0, Math.round(rides)));
  const key = testRidesKey(code, negativeId, monthKey);
  await prisma.appState.upsert({ where: { key }, create: { key, value }, update: { value } });
  invalidateBallCache();
  return { ok: true };
}

/** 🔒 Admin-only. Guruhdagi HAMMA sinov a'zoni bir yo'la olib tashlaydi — har biriga HAQIQIY
 *  `applyRemoveMember` (kick bilan bir xil, `turns` tegilmaydi) + `oyin:testrides:*` tozalanadi.
 *  Boshqa hech qanday jadvalga tegilmagani uchun bu 100% to'liq va xavfsiz. */
export async function adminClearTestMembers(code: string): Promise<{ ok: boolean; removed: number }> {
  const key = `${JAMOA_PREFIX}${code}`;
  const before = parseJamoa((await prisma.appState.findUnique({ where: { key } }))?.value);
  if (!before) return { ok: false, removed: 0 };
  const testIds = before.members.filter((m) => m < 0);
  if (testIds.length === 0) return { ok: true, removed: 0 };
  let cur2 = before;
  for (const id of testIds) {
    const next = await casJamoa(key, (cur) => cur.members.includes(id) ? applyRemoveMember(cur, id) : null);
    if (next) cur2 = next;
  }
  const rows = await prisma.appState.findMany({ where: { key: { startsWith: `${TEST_RIDES_PREFIX}${code}:` } }, select: { key: true } });
  if (rows.length > 0) await prisma.appState.deleteMany({ where: { key: { in: rows.map((r) => r.key) } } });
  void cur2;
  invalidateBallCache();
  return { ok: true, removed: testIds.length };
}

// ── 🎯 KIMGA BALL YIG'AMIZ (2026-08-05, ega talabi) ──────────────────────────────────────────
// "Ega doim hal qilishi kerak" — TUZATILDI: bu ADMIN emas, GURUHNI YARATGAN ODAM (boshliq)
// hal qiladi, miniappning o'zida, VA bu tanlov HAMMA A'ZOGA OCHIQ ko'rinishi shart. Avtomatik
// navbat (`assignTurn`/`navbatchiOf`) DEFAULT bo'lib qolaveradi — S7-2b/S7-3 adolat-invarianti
// buzilmaydi. Boshliq ustiga ONGLI ravishda "bu oy KIM UCHUN yig'amiz" deb E'LON QILA OLADI —
// bu backend tuzatish emas, ijtimoiy koordinatsiya (gashtak — birga yig'ib bitta odamga
// yordam berish g'oyasi). Admin xuddi shu funksiyani moderatsiya sifatida ishlatadi
// (kick/disband'dagi ikki-yo'l-bitta-haqiqat naqshi — lekin BIRLAMCHI foydalanuvchi BOSHLIQ).

/** ICHKI — `setGashtakTurnByLeader` VA `adminSetGashtakTurn` ikkalasi ham shundan. */
/** SOF FUNKSIYA — `setGashtakTurnInternal` ichida (`casJamoa` orqali) chaqiriladi.
 *  `simGuards` HAQIQIY shu funksiyaga qarshi sinaydi (S8-8/applyRemoveMember naqshi):
 *  DB kerak emas, faqat `JamoaRecord` kirish-chiqishi.
 *  ⚠️ Ataylab: bir-navbat-umrbod avtomatik qo'riqini (`assignTurn`) AYLANIB O'TADI — bu
 *  ONGLI, OCHIQ qaror (inson qarori + hammaga ko'rinadigan matn qo'riq o'rnini bosadi). */
export function applySetTurn(j: JamoaRecord, monthKey: string, memberId: number | null, noteRaw: string): JamoaRecord | null {
  if (memberId != null && !j.members.includes(memberId)) return null; // typo/tasodifiy xato himoyasi
  const next: JamoaRecord = { ...j, turns: { ...j.turns }, turnOverrides: { ...j.turnOverrides } };
  if (memberId == null) { delete next.turns[monthKey]; delete next.turnOverrides[monthKey]; return next; }
  next.turns[monthKey] = memberId;
  const name = next.testNames[memberId] ?? `#${memberId}`;
  next.turnOverrides[monthKey] = (noteRaw || "").trim().slice(0, 300) || `Bu oy ball ${name} uchun yig'ilmoqda`;
  return next;
}

async function setGashtakTurnInternal(code: string, monthKeyRaw: string, memberId: number | null, noteRaw: string): Promise<OyinJamoaResult> {
  if (!/^\d{4}-\d{2}$/.test(monthKeyRaw)) return { ok: false, reason: "not_found" };
  const key = `${JAMOA_PREFIX}${code}`;
  const result = await casJamoa(key, (cur) => applySetTurn(cur, monthKeyRaw, memberId, noteRaw));
  if (!result) return { ok: false, reason: "not_group_member" };
  invalidateBallCache();
  return { ok: true };
}

/** 🎯 BIRLAMCHI YO'L — miniappda, faqat guruh boshlig'i. */
export async function setGashtakTurnByLeader(leaderId: number, memberId: number | null, note: string): Promise<OyinJamoaResult> {
  const j = await jamoaOf(leaderId);
  if (!j) return { ok: false, reason: "not_in" };
  if (j.leaderId !== leaderId) return { ok: false, reason: "leader_only" };
  return setGashtakTurnInternal(j.id, monthKeyOf(new Date()), memberId, note);
}

/** Admin moderatsiya versiyasi — masalan boshliq noto'g'ri bosgan yoki nizo chiqqan holatlar
 *  uchun, istalgan oyni tuzatish imkoni bilan. */
export async function adminSetGashtakTurn(code: string, monthKey: string, memberId: number | null, note: string): Promise<OyinJamoaResult> {
  return setGashtakTurnInternal(code, monthKey, memberId, note);
}

// ── 🎬 MUKOFOT KUNI ──────────────────────────────────────────────────────────────────────────
const WINNER_PREFIX = "oyin:winner:";

/** SHA-256(tartiblangan raqamlar, vergul bilan). Kanalga SHU e'lon qilinadi.
 *  ⚠️ Tartiblash MAJBURIY: aks holda bir xil ro'yxat har chaqiruvda boshqa hash berardi
 *  (kartalar a'zolar bo'yicha yig'iladi, tartibi DB o'qish tartibiga bog'liq) va ega
 *  e'lon qilgan hash tekshirishda MOS KELMASDI. */
function hashCards(gnos: number[]): string {
  const line = [...gnos].sort((a, b) => a - b).join(",");
  return crypto.createHash("sha256").update(line).digest("hex");
}

/** 🎬 Bitta mukofotning MUZLATILGAN karta ro'yxati — jonli efirda o'qiladigan yagona haqiqat.
 *  Xodim va chetlatilgan a'zolar kartalari CHIQARILADI (qoidalar §9) va soni ochiq sanaladi. */
export async function getDrawList(prizeKey: string): Promise<OyinDrawList | null> {
  const [season, catalog, soldMap, econ, freeze, ticketRows, tus, banRows] = await Promise.all([
    getSeason(),
    getCatalog(),
    getSoldMap(),
    getBonusEcon(),
    getFreeze(),
    prisma.appState.findMany({ where: { key: { startsWith: "oyin:tickets:" } } }) as Promise<AppStateRow[]>,
    prisma.telegramUser.findMany({ where: { memberId: { not: null } }, select: { id: true, isAdmin: true, memberId: true, firstName: true, lastName: true, username: true } }),
    prisma.appState.findMany({ where: { key: { startsWith: BAN_PREFIX } }, select: { key: true } }),
  ]);
  const prize = catalog.find((p) => p.key === prizeKey);
  if (!prize || !season.configured) return null;

  const nameByMember = new Map<number, string>();
  const staffMembers = new Set<number>();
  for (const tu of tus) {
    if (!tu.memberId) continue;
    nameByMember.set(tu.memberId, shortName(tu));
    if (isStaffUser(tu)) staffMembers.add(tu.memberId); // 🟡 №12: `.env` YOKI bazadagi belgi
  }
  const banned = new Set<number>();
  for (const r of banRows) {
    const id = Number(r.key.slice(BAN_PREFIX.length));
    if (Number.isFinite(id)) banned.add(id);
  }

  const cards: OyinDrawCard[] = [];
  let excluded = 0;
  for (const row of ticketRows) {
    const memberId = Number(row.key.slice("oyin:tickets:".length));
    if (!Number.isFinite(memberId)) continue;
    for (const t of parseTickets(row.value)) {
      if (t.prizeKey !== prizeKey) continue;
      // 🧪 eski sinov kartasi · 🚫 chetlatilgan · 👔 xodim — hammasi ro'yxatdan tashqarida
      if (t.test || banned.has(memberId) || staffMembers.has(memberId)) { excluded++; continue; }
      cards.push({ gno: t.gno ?? t.no, memberId, name: nameByMember.get(memberId) ?? `#${memberId}` });
    }
  }
  cards.sort((a, b) => a.gno - b.gno);
  const sold = soldMap.get(prizeKey) ?? 0;
  const minSell = minSellOf(prize.limit, econ.oyinMinSellPct ?? OYIN_MIN_SELL_PCT_DEFAULT);
  return {
    prizeKey, prizeName: prize.name, sold, limit: prize.limit, minSell,
    // 🟡 (nazoratchi 2026-08-04 №11): avval `sold >= minSell` edi. `sold` xodim/chetlatilgan/
    // sinov kartalarini HAM sanaydi, `cards` esa ularni CHIQARIB tashlagan. Mukofot 20/20 bilan
    // "tayyor" bo'lardi, qutiga esa 12 ta karta tushardi — e'lon qilingan imkoniyat (1/20) va
    // haqiqiy tortish (1/12) bir-biriga mos kelmasdi. Endi CHEGARA HAM haqiqiy hovuzga qo'yiladi.
    ready: sold >= minSell && cards.length >= minSell && cards.length > 0,
    frozenAt: freeze.at,
    hash: hashCards(cards.map((c) => c.gno)),
    cards, excluded,
  };
}

/** 🎬 BAYONNOMA — bloger tortgan raqamni yozadi.
 *
 *  ⚠️ Dastur g'olibni TANLAMAYDI, faqat TEKSHIRADI. Uch shart: mukofot tayyor · ro'yxat
 *  MUZLATILGAN (aks holda yozuvdan keyin ham karta qo'shilishi mumkin) · raqam ro'yxatda BOR.
 *  Yozuv QAYTARIB BO'LMAYDI — `already` qaytadi, ustidan yozilmaydi. */
export async function adminRecordWinner(prizeKey: string, gno: number, note: string): Promise<OyinDrawRecordResult> {
  const key = `${WINNER_PREFIX}${prizeKey}`;
  const existing = await prisma.appState.findUnique({ where: { key } });
  if (existing) return { ok: false, reason: "already" };

  const list = await getDrawList(prizeKey);
  if (!list) return { ok: false, reason: "unknown_prize" };
  if (!list.ready) return { ok: false, reason: "not_ready" };
  // 🔒 Muzlatilmagan ro'yxat bilan bayonnoma yozish — o'z-o'zini yolg'onga chiqarish: hash
  // e'lon qilingandan keyin yangi karta sotilsa, e'lon qilingan hash mos kelmay qoladi.
  if (!list.frozenAt) return { ok: false, reason: "not_frozen" };

  const hit = list.cards.find((c) => c.gno === Math.round(Number(gno)));
  if (!hit) return { ok: false, reason: "not_in_list" };

  const [tu, catalog] = await Promise.all([
    prisma.telegramUser.findFirst({ where: { memberId: hit.memberId }, select: { phone: true } }),
    getCatalog(),
  ]);
  const winner: OyinWinner = {
    prizeKey, prizeName: list.prizeName,
    prizeValueLabel: catalog.find((p) => p.key === prizeKey)?.valueLabel ?? "",
    gno: hit.gno, memberId: hit.memberId, name: hit.name, phone: tu?.phone ?? null,
    drawnAt: new Date().toISOString(), listHash: list.hash, poolSize: list.cards.length,
    note: (note || "").trim().slice(0, 300) || null,
    handedAt: null, photoUrl: null, notifiedAt: null,
  };
  // `create` (upsert EMAS): ikkita parallel yozuv bo'lsa ikkinchisi unique-xato bilan yiqiladi
  // va bayonnoma ustidan yozilmaydi.
  try {
    await prisma.appState.create({ data: { key, value: JSON.stringify(winner) } });
  } catch (e) {
    // 🟡 (nazoratchi 2026-08-04 №13): avval KO'R `catch` edi — DB uzilishi, timeout, validatsiya
    // xatosi HAMMASI "already" bo'lardi va ega JONLI EFIRDA «bayonnoma allaqachon yozilgan»
    // xabarini ko'rardi, aslida hech narsa yozilmagan bo'lsa ham. Endi faqat unique-to'qnashuv
    // (P2002) "already"; qolgani ochiq xato — jurnalga ham tushadi.
    const code = (e as { code?: string } | null)?.code;
    if (code === "P2002") return { ok: false, reason: "already" };
    console.error("[oyin] bayonnoma yozilmadi:", e);
    return { ok: false, reason: "write_failed" };
  }

  // 🎟 2026-08-06 (ega talabi): endi shu SOVRINDAGI qolgan barcha ishtirokchi kartalar
  // "yutuqsiz" deb DBga yoziladi (avval bu faqat admin panelda, DBga tegmasdan, har safar
  // `drawExport()`+`getWinners()` solishtirilib QAYTA HISOBLANARDI). BEST-EFFORT: yuqoridagi
  // bayonnoma (audit uchun eng muhimi) ALLAQACHON muvaffaqiyatli yozilgan — bu yerda xato
  // chiqsa jarayon TO'XTAMAYDI va mijozga "write_failed" qaytarilmaydi, faqat jurnalga
  // tushadi. Ega tanlagan ko'lam: faqat admin+Telegram kanal ko'radi, mijoz ilovasida
  // (`OyinMyTicket`/"KUCHDA"-"TUGADI" belgisi) HECH NARSA o'zgarmaydi.
  const gnosByMember = new Map<number, number[]>();
  for (const c of list.cards) {
    const arr = gnosByMember.get(c.memberId) ?? [];
    arr.push(c.gno);
    gnosByMember.set(c.memberId, arr);
  }
  await Promise.all(
    [...gnosByMember.entries()].map(async ([memberId, gnos]) => {
      const tKey = `oyin:tickets:${memberId}`;
      try {
        const row = await prisma.appState.findUnique({ where: { key: tKey } });
        const tickets = parseTickets(row?.value);
        let changed = false;
        for (const t of tickets) {
          if (t.prizeKey !== prizeKey) continue;
          const g = t.gno ?? t.no;
          if (!gnos.includes(g)) continue;
          const nextResult: "won" | "lost" = g === hit.gno ? "won" : "lost";
          if (t.result !== nextResult) { t.result = nextResult; changed = true; }
        }
        if (changed) await prisma.appState.update({ where: { key: tKey }, data: { value: JSON.stringify(tickets) } });
      } catch (e) {
        console.error(`[oyin] g'olib-belgilash: a'zo ${memberId} kartalari yangilanmadi:`, e);
      }
    }),
  );

  return { ok: true, winner };
}

/** 🎬 Topshirilganini belgilash — bayonnomani yakunlaydi (sana + foto). */
export async function adminMarkHandover(prizeKey: string, photoUrl: string | null): Promise<{ ok: boolean }> {
  const key = `${WINNER_PREFIX}${prizeKey}`;
  const row = await prisma.appState.findUnique({ where: { key } });
  if (!row) return { ok: false };
  try {
    const w = JSON.parse(row.value) as OyinWinner;
    w.handedAt = new Date().toISOString();
    w.photoUrl = (photoUrl || "").trim().slice(0, 500) || null;
    await prisma.appState.update({ where: { key }, data: { value: JSON.stringify(w) } });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/** 🎬 G'oliblar tarixi — tekshiruv uchun ochiq. Eng yangisi birinchi. */
export async function getWinners(): Promise<OyinWinner[]> {
  const rows = await prisma.appState.findMany({ where: { key: { startsWith: WINNER_PREFIX } } });
  const out: OyinWinner[] = [];
  for (const r of rows) {
    try { out.push(JSON.parse(r.value) as OyinWinner); } catch { /* buzuq qator — jimgina o'tkazamiz */ }
  }
  return out.sort((a, b) => Date.parse(b.drawnAt) - Date.parse(a.drawnAt));
}

// ── Mavsum yopilishi: ≥1 real safar qilganlarga qoldiq ball × 50% = tanga (max 500/odam).
// IKKI QAVAT idempotentlik: (1) tashqi `oyin:seasonclosed` marker — butun funksiya boshqa yugur-
// maydi (2) HAR grantCoins o'zining idempotencyKey'i bilan ham himoyalangan — agar (1) yozilishdan
// OLDIN jarayon qulasa, keyingi urinishda allaqachon to'langanlar `skipped:"duplicate"` bilan
// o'tkazib yuboriladi (referral-payout blokidagi "grant FIRST, marker LAST" tartibi bilan bir xil). ─
export async function seasonClose(): Promise<OyinSeasonCloseResult> {
  if (!(await featureOn("oyin"))) return { convertedCount: 0, totalTanga: 0 };
  // ⚠️ QAT'IY sana-darvoza: bu funksiya REAL tanga beradi (grantCoins) — dark-test paytida yoki
  // mavsum hali tugamasdan tasodifan chaqirilsa HAMMANING ballini erta "kuydirib" qo'yishi mumkin.
  // Marker'dan FARQLI, bu tekshiruv har chaqiruvda qayta baholanadi. Sana endi admin-config'dan
  // keladi — shu sababli `setSeason` o'tmishdagi tugash sanasini YOZUVDA rad etadi (oyinSeason.ts).
  const season = await getSeason();
  if (!season.configured || Date.now() < (season.endMs as number)) return { convertedCount: 0, totalTanga: 0 };

  // Marker mavsum bilan tamg'alanadi. Eski tamg'asiz kalit — 1-mavsumning markeri (moslik).
  const doneKey = `oyin:seasonclosed:${season.seasonId}`;
  const doneKeys = season.seasonNo === 1 ? [doneKey, "oyin:seasonclosed"] : [doneKey];
  if ((await prisma.appState.findMany({ where: { key: { in: doneKeys } }, select: { key: true } })).length) {
    return { convertedCount: 0, totalTanga: 0 };
  }

  // Yaroqlilik ("≥1 real safar") MAVSUM ichidagi safarga qaraydi — `seasonRides` xaritada bor,
  // shuning uchun ikkinchi so'rov kerak emas (va hisob bilan yaroqlilik hech qachon ziddiyatga
  // tushmaydi — ikkalasi ham bitta oynadan).
  // ⚠️ EGA QARORI 2026-08-03: mavsum oxirida sarflanmagan ball BUTUNLAY KUYADI.
  // Sabab: ball endi DAROMAD kvitansiyasi (1 ball = 10 so'm sof daromad), 50% konvertatsiya
  // yangi shkalada mantiqsiz bo'lardi (13 800 ball → 6 900 tanga). Bu bir vaqtning o'zida
  // o'yindan YAGONA pul-chiqish yo'lini olib tashlaydi: endi `oyin` moduli hech qachon
  // `grantCoins` chaqirmaydi, ya'ni cheklovsiz emissiya xavfi butunlay yo'q.
  // Mijozga bu mavsum DAVOMIDA ochiq aytiladi ("mavsum oxirigacha ballingizni sarflang").
  const map = await computeBallMap();

  let convertedCount = 0;
  const totalTanga = 0;
  // Hisobot uchun: nechta a'zoning balli kuydi (pul TO'LANMAYDI — faqat statistika).
  for (const [, row] of map) {
    if (row.breakdown.ball > 0) convertedCount++;
  }
  await prisma.appState.create({ data: { key: doneKey, value: JSON.stringify({ at: new Date().toISOString(), convertedCount, totalTanga }) } }).catch(() => undefined);
  invalidateBallCache();
  return { convertedCount, totalTanga };
}

// ═══ 🔔 MAVSUM YAKUNI — XABARNOMA ZANJIRI (2026-08-12, ega talabi) ═══════════════════════════════
//
// Audit topilmasi edi: «mijozga birorta ogohlantirish ketmaydi — g'olibga ham xabar bormaydi,
// odam yutganini hech qayerdan bilmaydi». Bu bo'lim shu bo'shliqni yopadi. YANGI POLLER YO'Q —
// hammasi index.ts dagi MAVJUD 15-daqiqalik tikka qo'shiladi (ARCHITECTURE.md invarianti).
//
// ⚠️ Nega DAYKEY-DEDUP (mavjud `notifyOnce`) YETARLI EMAS: `NotifyLog` (mavjud) faqat
// (memberId, kind, dayKey) bo'yicha noyob — ya'ni bitta `kind` FAQAT bitta kunda bir marta.
// Minglab a'zoga 15-daqiqalik ≤300 tezlikda yetkazish bir necha KUNGA cho'zilishi mumkin —
// shuning uchun har bosqich o'z DURABLE (kun-mustaqil) markeriga ega: `oyin:<bosqich>:<seasonId>:
// <memberId>`. `notifyOnce` baribir ISHLATILADI — u kunlik cap/jim-soat/blok/opt-out
// qo'riqlarini beradi; marker esa FAQAT muvaffaqiyatli yuborilgandan keyin qo'yiladi, ya'ni
// cap/jim-soat sababli o'tkazib yuborilgan a'zo KEYINGI tikda avtomatik qayta sinaladi.
const SEASON_PUSH_BATCH = 300; // 15-daq/300 ≈ 0,33 xabar/soniya — Telegram 30/s limitidan 90× past.

/** Ochiq (sotilmagan o'rni bor) sovg'alar orasida eng arzoni — ogohlantirish matnida
 *  "yana N ball kerak" hisoboti shundan chiqadi. */
async function cheapestOpenPrize(): Promise<{ key: string; name: string; price: number } | null> {
  const [catalog, soldMap] = await Promise.all([getCatalog(), getSoldMap()]);
  const open = catalog
    .filter((p) => p.active && p.queued !== true && (soldMap.get(p.key) ?? 0) < p.limit)
    .sort((a, b) => a.price - b.price);
  const c = open[0];
  return c ? { key: c.key, name: c.name, price: c.price } : null;
}

/** Berilgan nomzodlar ro'yxatidan HALI push OLMAGANLARNI ajratadi (durable marker bo'yicha),
 *  batch bilan cheklaydi va Telegram chat-id'larini bitta so'rovda oladi. Har bosqich (T-7/
 *  T-3/T-49soat/yakun) shu bitta yordamchidan foydalanadi — mantiq TO'RT marta yozilmasin. */
async function pushCandidates(
  markerPrefix: string, seasonId: string, memberIds: number[],
): Promise<{ memberId: number; chatId: string }[]> {
  if (memberIds.length === 0) return [];
  const keyOf = (id: number) => `${markerPrefix}:${seasonId}:${id}`;
  const already = await prisma.appState.findMany({ where: { key: { in: memberIds.map(keyOf) } }, select: { key: true } });
  const sentSet = new Set(already.map((r) => r.key));
  const pendingIds = memberIds.filter((id) => !sentSet.has(keyOf(id))).slice(0, SEASON_PUSH_BATCH);
  if (pendingIds.length === 0) return [];
  const tus = await prisma.telegramUser.findMany({ where: { memberId: { in: pendingIds } }, select: { id: true, memberId: true } });
  const chatByMember = new Map(tus.map((t) => [t.memberId as number, t.id]));
  const out: { memberId: number; chatId: string }[] = [];
  for (const id of pendingIds) {
    const chatId = chatByMember.get(id);
    if (chatId) out.push({ memberId: id, chatId });
  }
  return out;
}
async function markPushed(markerPrefix: string, seasonId: string, memberId: number): Promise<void> {
  await prisma.appState.create({ data: { key: `${markerPrefix}:${seasonId}:${memberId}`, value: new Date().toISOString() } }).catch(() => undefined);
}

/** ⏳ T-7 kun / T-3 kun / T-49 soat ogohlantirishlari. Mavsum FAOL ekanida (tugamasdan oldin)
 *  chaqiriladi — `seasonClose` (yuqorida) esa AKSINCHA, faqat tugagandan KEYIN ishlaydi.
 *  Har bosqich mustaqil: biri o'tkazib yuborilsa (masalan server bir necha soat o'chgan bo'lsa)
 *  qolganlari baribir o'z vaqtida yuguradi — ular bir-biriga bog'liq emas. */
export async function seasonWarningTick(bot: Bot): Promise<{ sent7: number; sent3: number; sent49h: number }> {
  const empty = { sent7: 0, sent3: 0, sent49h: 0 };
  if (!(await featureOn("oyin"))) return empty;
  const season = await getSeason();
  if (!season.configured || season.phase !== "active" || season.endMs == null) return empty;
  const msLeft = season.endMs - Date.now();
  if (msLeft <= 0) return empty;

  const { notifyOnce } = await import("./notifyService");
  const map = await computeBallMap();
  const cheapest = await cheapestOpenPrize();

  let sent7 = 0, sent3 = 0, sent49h = 0;

  // T-7 KUN — balli bor HAMMAGA (hali karta olishga yetmasa ham — "yana safar qiling" chaqirig'i).
  if (msLeft <= 7 * 86_400_000) {
    const ids = [...map.entries()].filter(([, r]) => r.breakdown.ball > 0).map(([id]) => id);
    for (const { memberId, chatId } of await pushCandidates("oyin:warn7", season.seasonId, ids)) {
      const ball = map.get(memberId)?.breakdown.ball ?? 0;
      const need = cheapest ? Math.max(0, cheapest.price - ball) : 0;
      const html = `🎁 <b>Mavsumga 7 kun qoldi</b>\n\nSizda <b>${ball} ball</b> — mavsum tugashi bilan yonadi. Saqlashning yagona yo'li: kartaga aylantirish.` +
        (cheapest && need > 0 ? `\n\n<b>${cheapest.name}</b> uchun yana <b>${need} ball</b> kerak.` : "");
      if (await notifyOnce(bot, chatId, memberId, `oyin_warn7:${season.seasonId}`, html).catch(() => false)) {
        await markPushed("oyin:warn7", season.seasonId, memberId);
        sent7++;
      }
    }
  }

  // T-3 KUN — faqat KAMIDA bitta kartaga yetadiganlarga (karta olish hali OCHIQ).
  if (msLeft <= 3 * 86_400_000 && cheapest) {
    const ids = [...map.entries()].filter(([, r]) => r.breakdown.ball >= cheapest.price).map(([id]) => id);
    for (const { memberId, chatId } of await pushCandidates("oyin:warn3", season.seasonId, ids)) {
      const ball = map.get(memberId)?.breakdown.ball ?? 0;
      const n = Math.floor(ball / cheapest.price);
      const html = `⏳ <b>Karta olish 24 soatdan keyin yopiladi</b>\n\nSizda <b>${ball} ball</b> — ayni damda <b>${n} ta karta</b>ga yetadi. Yopilgach ball yonadi va qaytmaydi.`;
      if (await notifyOnce(bot, chatId, memberId, `oyin_warn3:${season.seasonId}`, html).catch(() => false)) {
        await markPushed("oyin:warn3", season.seasonId, memberId);
        sent3++;
      }
    }
  }

  // T-49 SOAT — FINAL-48 dan roppa-rosa 1 soat oldin: oxirgi haqiqiy chaqiriq (48 dan keyin
  // karta olish serverda ham yopiladi, `OYIN_FINAL_LOCK_MS`). T-24/T-1 da ATAYLAB push YO'Q —
  // o'sha lahzada mijoz allaqachon hech narsa qila olmaydi, ogohlantirish sof tashvish bo'lardi.
  if (msLeft <= 49 * 3_600_000 && cheapest) {
    const ids = [...map.entries()].filter(([, r]) => r.breakdown.ball >= cheapest.price).map(([id]) => id);
    for (const { memberId, chatId } of await pushCandidates("oyin:warn49h", season.seasonId, ids)) {
      const ball = map.get(memberId)?.breakdown.ball ?? 0;
      const html = `🔒 <b>Oxirgi soat</b>\n\nBir soatdan keyin karta olish yopiladi. <b>${ball} ball</b> — hozir sarflasangiz kartaga aylanadi, sarflamasangiz yonadi.`;
      if (await notifyOnce(bot, chatId, memberId, `oyin_warn49h:${season.seasonId}`, html).catch(() => false)) {
        await markPushed("oyin:warn49h", season.seasonId, memberId);
        sent49h++;
      }
    }
  }

  return { sent7, sent3, sent49h };
}

/** 🏁 Mavsum tugagandan KEYIN: ball>0 bo'lganlarga «yondi» xabari. `seasonClose()` allaqachon
 *  yugurgan bo'lishi SHART (`doneKey` bilan tekshiriladi) — aks holda hali frozen bo'lmagan
 *  balansni "yondi" deb e'lon qilib qo'yamiz. Balli 0 bo'lganga bu push YUBORILMAYDI — bo'sh
 *  va'da/tahdid emas, faqat haqiqiy yo'qotishi borlarga. */
export async function seasonCloseNotify(bot: Bot): Promise<{ sent: number }> {
  if (!(await featureOn("oyin"))) return { sent: 0 };
  const season = await getSeason();
  if (!season.configured || season.phase !== "ended") return { sent: 0 };
  const closed = await prisma.appState.findUnique({ where: { key: `oyin:seasonclosed:${season.seasonId}` } });
  if (!closed) return { sent: 0 };

  const { notifyOnce } = await import("./notifyService");
  const map = await computeBallMap();
  const ids = [...map.entries()].filter(([, r]) => r.breakdown.ball > 0).map(([id]) => id);
  let sent = 0;
  for (const { memberId, chatId } of await pushCandidates("oyin:seasonend", season.seasonId, ids)) {
    const ball = map.get(memberId)?.breakdown.ball ?? 0;
    const html = `🏁 <b>Mavsum yakunlandi</b>\n\nBu mavsumdagi <b>${ball} ball</b> mavsum bilan yopildi. Kartaga aylantirgan ballingiz esa saqlanadi — ular mukofot kunida omad kutadi.\n\nYangi mavsum boshlanganda hisob yana noldan yuguradi.`;
    if (await notifyOnce(bot, chatId, memberId, `oyin_end:${season.seasonId}`, html).catch(() => false)) {
      await markPushed("oyin:seasonend", season.seasonId, memberId);
      sent++;
    }
  }
  return { sent };
}

/** 🏆 G'olib va yutmaganlarga tiraj natijasi. `adminRecordWinner` bayonnomani yozgan zahoti
 *  yubora olmaydi — u HTTP marshrutidan chaqiriladi va u yerda `bot` instansi yo'q (loyihada
 *  bot faqat `index.ts` tikida bor, xuddi `alertAdmins`ning `registerAdminNotifier` naqshi
 *  kabi). Shuning uchun keyingi tikda: `oyin:winner:*` dan `notifiedAt` yo'qlarini, `oyin:tickets:*`
 *  dan `result:"lost" && !notifiedLoss` bo'lganlarni tarab chiqadi. */
export async function seasonDrawNotify(bot: Bot): Promise<{ winners: number; losers: number }> {
  if (!(await featureOn("oyin"))) return { winners: 0, losers: 0 };
  const { notifyOnce } = await import("./notifyService");
  let winners = 0;

  // ── G'oliblar ────────────────────────────────────────────────────────────────────────────
  const winnerRows = await prisma.appState.findMany({ where: { key: { startsWith: WINNER_PREFIX } } });
  for (const row of winnerRows) {
    let w: OyinWinner;
    try { w = JSON.parse(row.value) as OyinWinner; } catch { continue; }
    if (w.notifiedAt) continue;
    const tu = await prisma.telegramUser.findFirst({ where: { memberId: w.memberId }, select: { id: true } });
    if (!tu) continue; // ulanmagan qolgan — keyingi safar qayta tekshiriladi
    const html = `🏆 <b>SIZ YUTDINGIZ!</b>\n\n«${w.prizeName}» — karta №${w.gno}.\n${w.poolSize} ta karta ichidan sizniki chiqdi.\n\n📞 Ega tez orada siz bilan bog'lanadi. «Kartalarim»da holatni kuzatib boring.`;
    const ok = await notifyOnce(bot, tu.id, w.memberId, `oyin_win:${w.prizeKey}`, html).catch(() => false);
    if (ok) {
      // ⚠️ `create`/CAS emas — bu yakka o'qish-yozish, poyga xavfi yo'q (bitta g'olib, bitta tik).
      w.notifiedAt = new Date().toISOString();
      await prisma.appState.update({ where: { key: row.key }, data: { value: JSON.stringify(w) } }).catch(() => undefined);
      winners++;
    }
  }

  // ── Yutmaganlar ──────────────────────────────────────────────────────────────────────────
  // ⚠️ Bu yerda `allTicketRows()` KESHI ishlatilmaydi — u 30s TTL bilan o'qish uchun, bu yerda
  // esa yozish (marker) qilinadi va TO'LIQ, keshsiz haqiqat kerak.
  const ticketRows = await prisma.appState.findMany({ where: { key: { startsWith: "oyin:tickets:" } } });
  let losers = 0, checked = 0;
  for (const row of ticketRows) {
    if (checked >= SEASON_PUSH_BATCH) break; // bir tikda cheklangan — qolgani keyingi tikda
    const memberId = Number(row.key.slice("oyin:tickets:".length));
    if (!Number.isFinite(memberId)) continue;
    const tickets = parseTickets(row.value);
    const fresh = tickets.filter((t) => t.result === "lost" && !t.notifiedLoss);
    if (fresh.length === 0) continue;
    checked++;
    const tu = await prisma.telegramUser.findFirst({ where: { memberId }, select: { id: true } });
    if (!tu) continue;
    const names = [...new Set(fresh.map((t) => t.prizeKey))].length;
    const html = fresh.length === 1
      ? `🎬 <b>Tiraj bo'ldi</b>\n\nKartangiz o'ynadi — bu safar chiqmadi. ${fresh.length} ta karta orasidan boshqa raqam chiqdi.\n\n🎁 Yangi sovg'alarni ko'ring — sarflagan ballingiz bekorga ketmaydi, boshqa kartaga aylanadi.`
      : `🎬 <b>Tiraj bo'ldi</b>\n\n${fresh.length} ta kartangiz (${names} ta sovg'ada) o'ynadi — bu safar chiqmadi.\n\n🎁 Yangi sovg'alarni ko'ring — sarflagan ballingiz bekorga ketmaydi, boshqa kartaga aylanadi.`;
    const ok = await notifyOnce(bot, tu.id, memberId, `oyin_lost:${row.key}:${fresh.map((t) => t.gno ?? t.no).join(",")}`, html).catch(() => false);
    if (ok) {
      for (const t of tickets) if (t.result === "lost") t.notifiedLoss = true;
      await prisma.appState.update({ where: { key: row.key }, data: { value: JSON.stringify(tickets) } }).catch(() => undefined);
      losers++;
    }
  }

  return { winners, losers };
}

// 🗓 K7 (OYIN_KARTA_PLAN.md §12.1) — "Xotira" eslatmasi: birinchi (test bo'lmagan) kartasini
// olganidan CARD_MEMORY_DAYS kun o'tgan a'zoga BIR MARTA (abadiy) eslatadi. Mavsumdan MUSTAQIL —
// karta tirajdan keyin ham qoladi (K5), demak xotira ham mavsum yopilishi/almashishiga bog'liq
// emas; shuning uchun pushCandidates/markPushed'ga haqiqiy seasonId o'rniga doimiy "v1" beriladi
// (marker kaliti season almashsa ham qayta tiklanmaydi). Navbat + tezlik nazorati YANGI YOZILMAYDI —
// xuddi T-7/T-3/T-49soat ogohlantirishlari ishlatgan pushCandidates/SEASON_PUSH_BATCH (≤300/tik)
// qayta ishlatiladi (plan §7: "Push tezlik nazorati YO'Q" — bu yerda allaqachon bor edi).
const CARD_MEMORY_DAYS = 182; // ~6 oy — ega aniq son bermagan, bitta doimiyni o'zgartirish yetarli
const CARD_MEMORY_MARKER = "oyin:cardmem";
export async function cardMemoryTick(bot: Bot): Promise<{ sent: number }> {
  if (!(await featureOn("oyin"))) return { sent: 0 };
  const { notifyOnce } = await import("./notifyService");
  const rows = await prisma.appState.findMany({ where: { key: { startsWith: "oyin:tickets:" } } });
  const cutoff = Date.now() - CARD_MEMORY_DAYS * 86_400_000;
  const firstPurchase = new Map<number, number>(); // memberId → eng birinchi HAQIQIY (test emas) chipta vaqti (ms)
  for (const row of rows) {
    const memberId = Number(row.key.slice("oyin:tickets:".length));
    if (!Number.isFinite(memberId)) continue;
    for (const t of parseTickets(row.value)) {
      if (t.test) continue; // sinov chiptalari mijozga hech qachon ko'rsatilmaydi/hisoblanmaydi
      const ts = Date.parse(t.ts);
      if (!Number.isFinite(ts)) continue;
      const prev = firstPurchase.get(memberId);
      if (prev == null || ts < prev) firstPurchase.set(memberId, ts);
    }
  }
  const ids = [...firstPurchase.entries()].filter(([, ts]) => ts <= cutoff).map(([id]) => id);
  let sent = 0;
  for (const { memberId, chatId } of await pushCandidates(CARD_MEMORY_MARKER, "v1", ids)) {
    const ts = firstPurchase.get(memberId)!;
    const months = Math.max(1, Math.round((Date.now() - ts) / (30.44 * 86_400_000)));
    const html = `🗓 <b>Xotira</b>\n\n${months} oy oldin birinchi kartangizni olgan edingiz! Kartalaringiz hali ham «Kartalarim»da — bir qarab keting. 🎴`;
    const ok = await notifyOnce(bot, chatId, memberId, "oyin_cardmem", html, appBtn("🎴 Kartalarim", "oyin")).catch(() => false);
    if (ok) {
      await markPushed(CARD_MEMORY_MARKER, "v1", memberId);
      sent++;
    }
  }
  return { sent };
}

// ── 🧹 Admin: "Yangi mavsumni toza boshlash" (ega qarori 2026-08-02 — avtomatik EMAS, qo'lda).
// Tartib MUHIM: validatsiya → arxiv → oxirida config. Jarayon o'rtada uzilsa, config hali ESKI
// mavsumda qoladi va o'yin izchil holatda ishlayveradi (yarim tozalangan yangi mavsum EMAS).
// ⚠️ 2026-08-03: ro'yxat MAVSUM-DOIRALI HAR BIR kalitni qamrashi SHART. Buzilgan holat: keyin
// qo'shilgan `oyin:quest:` · `oyin:home:` · `oyin:story:` · `oyin:goal:` bu yerda YO'Q edi — ya'ni
// "toza boshlash" tugmasi ularni ortda qoldirardi (tugma nomi yolg'on bo'lardi). Har biri nega:
//  · `oyin:quest:` / `oyin:home:` — kun-ro'yxatlari, xuddi login/share kabi. Ball baribir mavsum
//    oynasiga kesiladi, lekin qator qolsa u mavsumdan-mavsumga cheksiz o'sardi va `scope:"all"`
//    faoliyat-jadvalida eski mavsum qatorlari jonli ko'rinardi.
//  · `oyin:home:` — ⚠️ 2026-08-03 da bu izoh YOLG'ON bo'lib qoldi va tuzatildi. Avval bu yerda
//    "belgi o'zi tiklanadi, 500 ball qaytadan tushadi" deb yozilgandi, chunki miniapp har
//    ochilganda `checkHomeScreenStatus()==="added"` bo'lsa serverga qayta bildirardi. AYNAN
//    O'SHA avto-bildirish jonli sinovda bugni keltirdi: ega hech narsa qilmasdan 300 ball oldi
//    ("men ekranga qo'shmagankuman nega ball bergan"). Signal tekshirib bo'lmaydigan — Android
//    yorliq qo'shilganini ilovaga aytmaydi. Avto-bildirish OLIB TASHLANDI; ball endi FAQAT
//    `homeScreenAdded` hodisasidan keladi. Demak yangi mavsumda belgi O'ZI TIKLANMAYDI — va bu
//    to'g'ri: ikonka allaqachon ekranda bo'lsa topshiriq ham KO'RSATILMAYDI (miniapp `missed`
//    holatidagina chizadi), ya'ni bajarib bo'lmaydigan vazifa osilib qolmaydi.
//  · `oyin:story:` — hikoya tarixi mavsum bilan tugaydi (yangi mavsum = yangi 3 ta limit). Arxiv
//    qatorlari saqlanib qoladi (`oyin:arch:sN:…`), ya'ni tekshiruv uchun yo'qolmaydi.
//  · `oyin:goal:` — maqsad-sovrin eski katalogga ishora qiladi; yangi mavsumda mijoz o'zi tanlaydi
//    (tanlanmaguncha hero eng arzoniga tushadi).
// ⚠️ 2026-08-03 (ikkinchi to'lqin): admin-nazorat kalitlari ham SHU YERDA bo'lishi shart.
//  · `oyin:adj:` — qo'lda tuzatilgan ball. Qolsa, yangi mavsum eski tuzatish bilan ochilardi
//    (masalan test uchun qo'shilgan 50 000 ball yangi mavsumga o'tib ketardi).
//  · `oyin:ban:` — chetlatish MAVSUM jazosi. Umrbod jazo kerak bo'lsa, u ONGLI ravishda qayta
//    qo'yiladi; jimgina abadiylashib qolishi noto'g'ri.
//  · `oyin_sold_test:` / `oyin:ticketno:test` — sinov hisoblagichlari, mijoz hisoblagichlari
//    bilan bir xil taqdirni ko'radi.
// ⛔ S8 (2026-08-04): `oyin:tickets:` va `oyin_sold:` bu ro'yxatdan OLIB TASHLANDI.
// Sabab: «karta abadiy» qarori. Kartalar arxivlansa 97 kartali mukofot davr almashganda
// nolga tushardi — sotilgan kartalar yo'qolar, mukofot esa HECH QACHON to'lmasdi, ya'ni
// to'lish-qulfi (S2/S3 ning butun mantig'i) ishlamasdi. Endi «yangi davr» — faqat YORLIQ
// va sana; ma'lumot RESET QILINMAYDI.
// 🔴 S8-2 (nazoratchi 2026-08-04) — RO'YXAT QAYTA YOZILDI. Avval bu yerda ball BERADIGAN
// hamma manba (login · share · sprintwin · quest · home · story · adj · jamoa) turardi, kartalar
// (`oyin:tickets:`) esa S8 qaroridan keyin JOYIDA qolardi. Nomutanosiblik:
//   `earned` nolga tushardi, `spent` esa QOLARDI  →  `ball = max(0, earned − spent)`
// Probe: earned=350 spent=4700 → mijozda 4 350 ball YASHIRIN QARZ. U yangi safar qiladi,
// ball ko'rinmaydi ("nega ballim tushmayapti?"), qarz to'langunga qadar butun mehnati bekor.
// Tugma nomi ("toza boshlash") aynan teskarisini qilardi.
//
// Yangi qoida (2026-08-11): **ball tarixi hech qachon arxivlanmaydi.** Ball MAVSUM oynasidan
// hisoblanadi — mavsum almashishi bilan eski faoliyat o'zi hisobdan chiqadi, ya'ni qo'lda
// tozalash SHART EMAS va xavfli (arxivlash kartani va sotilgan-hisoblagichni ham buzardi).
// Bu tugmaning qolgan ishi: haftalik sprint holatini va davr hisoblagichini qayta boshlash.
export const ARCHIVED_PREFIXES = [
  // ✅ Arxivlanadi — ball BERMAYDI, faqat holat/marker:
  "oyin:weeksnap:",    // sprint bazasi — yangi davrda qayta bazalanishi SHART
  "oyin:sprintdone:",  // "bu hafta hisoblandi" markeri
  "oyin:thanks:",      // "bugun rahmat aytdim" kun-belgisi
  "oyin:goal:",        // mijozning maqsad-sovrini (UI tanlovi)
  "oyin_sold_test:",   // o'lik test-hisoblagichlari
  "oyin:gashtakcooldown:", // 2026-08-05: qayta-qo'shilish sovutish belgisi — ball manbai EMAS
  // ⛔ ATAYLAB YO'Q (har biri nega):
  //  · oyin:tickets: / oyin_sold: — karta ABADIY (ega qarori: "kartalar admin panelda abadiy
  //    bo'lishi kerak egallari bilan"). Sotilgan-hisoblagich ham qolishi shart, aks holda
  //    global karta raqami takrorlanadi.
  //  · oyin:winner: — bayonnoma karta bilan BIR XIL taqdirni ko'radi (🔴 №1), aks holda
  //    bir mukofot ikki marta o'ynaladi.
  //  · oyin:login: · oyin:share: · oyin:quest: · oyin:home: · oyin:story: · oyin:sprintwin:
  //    · oyin:adj: · oyin:jamoa: · oyin:jamoamem: — hammasi `earned` manbai. Yuqoridagi
  //    yashirin-qarz sababi.
  //  · oyin:testrides: — 2026-08-05: sinov a'zolarining "safar soni", `jamoaMemberStats`
  //    uchun `RideReward` bilan BIR XIL rolda (ball manbai). Arxivlansa sinov guruhining
  //    o'tgan ball tarixi ko'rinmas bo'lardi — `oyin:jamoa:` bilan bir xil sabab.
  //  · oyin:ban: — chetlatish JAZO. Davr almashgani bilan bekor bo'lmaydi.
];
// `oyin:freeze` MAJBURIY: qolsa yangi mavsum MUZLATILGAN holda ochilardi va hech kim chipta
// ola olmasdi — tugma nomi ("Yangi mavsumni toza boshlash") ochiq yolg'on bo'lardi.
const ARCHIVED_SINGLETONS = ["oyin:sprintweek", "oyin:seasonclosed", FREEZE_KEY, "oyin:ticketno:test"];

// ── 🛠 To'rtta admin kuchi (ega tanlovi 2026-08-03). Hammasi audit-logga tushadi: har biri
// pulga tegadigan yoki adolatga tegadigan harakat, izsiz bo'lishi mumkin emas. ────────────────

/** 🛠 Ball qo'shish/olib tashlash. `reason` MAJBURIY — sababsiz ball harakati keyin tekshirib
 *  bo'lmaydigan iz qoldiradi. Yozuv KUMULYATIV: har tuzatish jurnalga qo'shiladi, `total` esa
 *  `computeBallMap` ichida `earned` ga qo'shiladi (ya'ni ball JONLI hisobda qoladi — bu yerda
 *  hech qanday "balans" saqlanmaydi, aks holda ikkita haqiqat manbai paydo bo'lardi). */
// 🔴 O7 (2026-08-11 audit, tuzatildi 2026-08-13): avval bu yerda qulf YO'Q edi — ikki admin
// (yoki bitta admin ikki marta tez-tez) BIR XIL a'zoga bir vaqtda tuzatish kiritsa, ikkinchi
// yozuv birinchisining USTIDAN yozardi (findUnique → hisoblash → upsert orasida poyga).
// `withMemberLock` — xuddi shu faylda `buyTicket` uchun ishlatilgan naqsh, bu yerda ham
// bir xil xavfsizlikni beradi. Jurnal ham endi CHEKSIZ — avval oxirgi 50 taси saqlanardi,
// 51-tuzatishdan keyin ENG ESKI yozuv JIMGINA yo'qolardi (audit izi buzilardi). Admin
// tuzatishi kamdan-kam, qo'lda bosiladigan amal — ming yozuv ham bir necha yuz KB dan
// oshmaydi, shuning uchun chegara olib tashlash xavfsiz.
export async function adminAdjustBall(input: OyinBallAdjustInput): Promise<OyinAdminActionResult> {
  const ball = Math.round(Number(input.ball));
  const reason = (input.reason || "").trim().slice(0, 200);
  if (!Number.isFinite(ball) || ball === 0 || !reason) return { ok: false, reason: "bad_input" };
  const memberId = Number(input.memberId);
  if (!Number.isFinite(memberId)) return { ok: false, reason: "bad_input" };
  return withMemberLock(memberId, async () => {
    const key = `${ADJ_PREFIX}${memberId}`;
    const row = await prisma.appState.findUnique({ where: { key } });
    const cur = parseAdjust(row?.value);
    const log = [...cur.log, { ball, reason, at: new Date().toISOString() }];
    const value = JSON.stringify({ total: cur.total + ball, log });
    await prisma.appState.upsert({ where: { key }, create: { key, value }, update: { value } });
    invalidateBallCache();
    return { ok: true, ball: await getBall(memberId) };
  });
}

/** 🎟 Chiptani bekor qilish. O'rin QAYTARILADI (test bo'lsa test-hisoblagichga), ball esa o'zi
 *  qaytadi — `spent` chiptalardan JONLI hisoblanadi, ya'ni alohida "qaytarish" operatsiyasi
 *  YO'Q va ikki marta qaytarish imkonsiz. */
export async function adminCancelTicket(memberId: number, gno: number): Promise<OyinAdminActionResult> {
  // 🔒 B2 — `cancelOwnTicket` bilan bir xil a'zo-qulfi (izoh o'sha yerda).
  return withMemberLock(memberId, async () => {
    const key = `oyin:tickets:${memberId}`;
    const row = await prisma.appState.findUnique({ where: { key } });
    if (!row) return { ok: false, reason: "not_found" };
    const tickets = parseTickets(row.value);
    const idx = tickets.findIndex((t) => (t.gno ?? t.no) === gno);
    if (idx < 0) return { ok: false, reason: "not_ticket" };
    const [gone] = tickets.splice(idx, 1);
    if (!gone) return { ok: false, reason: "not_ticket" };
    await prisma.appState.update({ where: { key }, data: { value: JSON.stringify(tickets) } });
    await releaseSoldSlot(gone.prizeKey, gone.test === true).catch(() => undefined);
    invalidateBallCache();
    return { ok: true, ball: await getBall(memberId) };
  });
}

/** 🚫 O'yindan chetlatish / qaytarish. Ball yig'ilishiga TEGMAYDI (tarix buzilmasin) — chetlatish
 *  chipta olish va `drawExport` darajasida ishlaydi. */
export async function adminSetBan(memberId: number, banned: boolean, reason: string): Promise<OyinAdminActionResult> {
  if (!Number.isFinite(Number(memberId))) return { ok: false, reason: "bad_input" };
  const key = `${BAN_PREFIX}${memberId}`;
  if (!banned) {
    await prisma.appState.deleteMany({ where: { key } });
    return { ok: true };
  }
  const r = (reason || "").trim().slice(0, 200);
  if (!r) return { ok: false, reason: "bad_input" };
  const value = JSON.stringify({ reason: r, at: new Date().toISOString() });
  await prisma.appState.upsert({ where: { key }, create: { key, value }, update: { value } });
  return { ok: true };
}

/** 🔒 Tirajni muzlatish/ochish. Muzlatilgan lahzadagi chipta soni YOZIB QO'YILADI — jonli efirda
 *  "ro'yxatda N ta chipta bor edi" degan da'vo tekshiriladigan bo'lsin. */
export async function adminSetFreeze(frozen: boolean): Promise<OyinFreezeState> {
  if (!frozen) {
    await prisma.appState.deleteMany({ where: { key: FREEZE_KEY } });
    return { frozen: false, at: null, ticketCount: 0 };
  }
  const exp = await drawExport();
  const state = { frozen: true, at: new Date().toISOString(), ticketCount: exp.tickets.length };
  const value = JSON.stringify({ at: state.at, ticketCount: state.ticketCount });
  await prisma.appState.upsert({ where: { key: FREEZE_KEY }, create: { key: FREEZE_KEY, value }, update: { value } });
  return state;
}

/** 🔎 A'zo qidiruvi: raqamli `memberId`, telefon (bo'lak ham bo'ladi) yoki ism/username.
 *  ⚠️ Nega kerak: `adminMemberDetail` faqat `memberId` oladi, ega esa o'z memberId'sini bilmaydi —
 *  jonli sinovda kartochka shu sababdan ishlamadi. Telefon/ism bo'yicha qidiruv shu to'siqni
 *  olib tashlaydi. Natija 10 ta bilan cheklangan (admin paneli, cheksiz ro'yxat kerak emas). */
export async function adminFindMembers(q: string): Promise<OyinAdminMemberHit[]> {
  const s = (q || "").trim();
  if (!s) return [];
  const map = await computeBallMap();
  const asId = Number(s);
  // Aniq ID topilsa — boshqa hech narsa qidirilmaydi (eng aniq javob birinchi).
  if (Number.isFinite(asId) && asId > 0) {
    const row = map.get(asId);
    if (row) {
      const tu = await prisma.telegramUser.findFirst({ where: { memberId: asId }, select: { phone: true } });
      return [{ memberId: asId, name: row.name, phone: tu?.phone ?? null, ball: row.breakdown.ball }];
    }
  }
  // ⚠️ Telefon raqamlari bazada har xil formatda ("+998…", "998…", probel bilan) — faqat
  // RAQAMLAR bo'yicha solishtiramiz, aks holda ega o'z raqamini yozib hech nima topmasdi.
  const digits = s.replace(/\D/g, "");
  const needle = s.toLowerCase();
  const tus = await prisma.telegramUser.findMany({
    where: { memberId: { not: null } },
    select: { memberId: true, phone: true, firstName: true, lastName: true, username: true },
  });
  const hits: OyinAdminMemberHit[] = [];
  for (const tu of tus) {
    if (!tu.memberId) continue;
    const row = map.get(tu.memberId);
    if (!row) continue;
    const phoneDigits = (tu.phone ?? "").replace(/\D/g, "");
    const nameHit = shortName(tu).toLowerCase().includes(needle) || (tu.username ?? "").toLowerCase().includes(needle);
    const phoneHit = digits.length >= 4 && phoneDigits.includes(digits);
    if (nameHit || phoneHit) hits.push({ memberId: tu.memberId, name: row.name, phone: tu.phone ?? null, ball: row.breakdown.ball });
    if (hits.length >= 10) break;
  }
  return hits;
}

/** 🔍 Bitta a'zoning TO'LIQ holati — 12 manba alohida, chiptalari, jazolari, tuzatish jurnali.
 *  Ega "ball qayerdan keldi" savoliga bitta ekrandan javob topsin. */
export async function adminMemberDetail(memberId: number): Promise<OyinAdminMemberDetail | null> {
  const [map, tickets, banRow, adjRow] = await Promise.all([
    computeBallMap(),
    myTickets(memberId),
    prisma.appState.findUnique({ where: { key: `${BAN_PREFIX}${memberId}` } }),
    prisma.appState.findUnique({ where: { key: `${ADJ_PREFIX}${memberId}` } }),
  ]);
  const row = map.get(memberId);
  if (!row) return null;
  let banReason: string | null = null;
  if (banRow) {
    try { banReason = (JSON.parse(banRow.value) as { reason?: string }).reason ?? null; } catch { banReason = null; }
  }
  return {
    memberId,
    name: row.name,
    telegramId: row.telegramId,
    ball: row.breakdown.ball,
    earned: row.breakdown.earned,
    spent: row.breakdown.spent,
    seasonRides: row.seasonRides,
    breakdown: row.breakdown,
    banned: !!banRow,
    banReason,
    tickets: tickets.tickets,
    adjustLog: parseAdjust(adjRow?.value).log.slice().reverse(),
  };
}

export async function adminStartNewSeason(input: OyinSeasonInput): Promise<OyinSeasonResetResult> {
  const v = validateSeasonInput(input);
  if (!v.ok) return { ok: false, error: v.error }; // ⚠️ yomon sana bilan HECH NARSA arxivlanmaydi
  const cur = await getSeason();
  // ⚠️ Arxiv prefiksi OLDINGA qo'yiladi. `oyin:tickets:s1:…` shaklida bo'lsa, tirik skan
  // (`startsWith("oyin:tickets:")`) arxivni ham tortib, sarflangan ballni ikki marta sanardi.
  const prefix = `oyin:arch:${cur.seasonId}:`;
  let archivedRows = 0;

  for (const p of ARCHIVED_PREFIXES) {
    const rows = (await prisma.appState.findMany({ where: { key: { startsWith: p } } })) as AppStateRow[];
    if (!rows.length) continue;
    await prisma.$transaction([
      prisma.appState.createMany({
        data: rows.map((r) => ({ key: `${prefix}${r.key}`, value: r.value })),
        skipDuplicates: true, // tugma ikki marta bosilsa — xavfsiz takror
      }),
      prisma.appState.deleteMany({ where: { key: { startsWith: p } } }),
    ]);
    archivedRows += rows.length;
  }
  for (const k of ARCHIVED_SINGLETONS) {
    const row = await prisma.appState.findUnique({ where: { key: k } });
    if (!row) continue;
    await prisma.$transaction([
      prisma.appState.createMany({ data: [{ key: `${prefix}${k}`, value: row.value }], skipDuplicates: true }),
      prisma.appState.deleteMany({ where: { key: k } }),
    ]);
    archivedRows += 1;
  }

  const next = await setSeason({ ...input, seasonNo: cur.seasonNo + 1 });
  invalidateBallCache();
  invalidateSeasonCache();
  return { ok: true, seasonId: next.seasonId, archivedRows };
}

// ⛔ `alertIfTicketsOrphaned` OLIB TASHLANDI (S8, 2026-08-04).
// U «sana siljisa kartalar oynadan tashqarida qoladi» degan holatni ogohlantirar edi. Endi
// bunday holat MAVJUD EMAS: karta abadiy, davr oynasiga bog'lanmagan (`ticketInSeason` o'chdi).
// Ogohlantirishni saqlab qolish — mavjud bo'lmagan xavf haqida qichqirish bo'lardi.

/** Admin: sanani tuzatish (mavsum raqami o'zgarmaydi, arxiv qilinmaydi). */
export async function adminSetSeason(input: OyinSeasonInput): Promise<OyinSeasonView> {
  const s = await setSeason(input);
  invalidateBallCache();
  // Ogohlantirish JAVOBNI kutdirmaydi va yiqilsa sana yozuvini bekor QILMAYDI (u allaqachon
  // muvaffaqiyatli). Xato bo'lsa faqat logga tushadi.
  return s;
}

// ── Admin faoliyat-jadvali (B3, KOSON_ADMIN_DOD.md) — ball JONLI hisoblangani uchun tayyor
// "voqealar jurnali" yo'q (bugun bunday admin-ekran umuman yo'q edi — tekshirilgan, CLAUDE.md
// §isbot talabi). Har manba (RideReward/Referral/AppState-markerlar) individual, sanalangan
// qatorlarga "yoyiladi" — computeBallMap AYNI shu manbalarni yig'indi qilib hisoblaydi, bu yerda
// esa har birining O'ZI ko'rsatiladi. Pul yozuvi yo'q — to'liq READ-ONLY. ──────────────────────
function weekKeyToISO(wk: string): string {
  const m = /^(\d{4})-W(\d{2})$/.exec(wk);
  if (!m) return new Date(0).toISOString();
  const year = Number(m[1]);
  const week = Number(m[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Dow = jan4.getUTCDay() || 7; // Monday=1..Sunday=7
  const monday = new Date(jan4.getTime() + (week - 1) * 7 * 86400_000 - (jan4Dow - 1) * 86400_000);
  return monday.toISOString();
}

export async function getActivity(filters: OyinActivityFilter): Promise<OyinActivityResponse> {
  const [econ, season] = await Promise.all([getBonusEcon(), getSeason()]);
  // 🟡 S8-8 (nazoratchi 2026-08-04) va uning DAVOMI (2026-08-11):
  //
  // Qoida: bu jadval `computeBallMap` bilan AYNAN BIR XIL oynadan o'qishi SHART. Aks holda
  // jurnalda ball-beruvchi voqea ko'rinadi-yu, balansda u yo'q bo'ladi — ega buni darhol
  // sezadi («ball berilyapti, lekin yozilmagan»).
  //
  // 2026-08-04 da oyna 24 oyga surilgan edi, chunki `computeBallMap` ham o'sha oynada edi.
  // 2026-08-11 da ega qarori bilan ball MAVSUM bilan yonadigan bo'ldi va `computeBallMap`
  // mavsum oynasiga qaytdi — bu funksiya esa 24 oyda QOLIB KETDI. Natijada ikkalasi yana
  // ajraldi. Endi oyna AYNAN o'sha manbadan: `season.startMs`/`season.endMs`.
  const nowActMs = Date.now();
  const ballScoped = filters.scope !== "all";
  // Mavsum sozlanmagan bo'lsa `computeBallMap` bo'sh xarita qaytaradi — jurnal ham bo'sh
  // bo'lishi kerak, aks holda "ball bor" degan taassurot berardi.
  const seasonFrom = season.startMs ?? nowActMs - BALL_DATA_WINDOW_MS;
  const seasonTo = season.endMs != null ? Math.min(nowActMs, season.endMs) : nowActMs;
  const fromMs = filters.from ? Date.parse(filters.from) : ballScoped ? seasonFrom : -Infinity;
  const toMs = filters.to ? Date.parse(filters.to) : ballScoped ? seasonTo : Infinity;
  // ⚠️ login/share qatorlari UTC yarim tuni bilan yoziladi (pastda), ball esa TOSHKENT kunini
  // sanaydi — 5 soatlik farq chegarada jadvalni reytingdan ajratib yuborardi. Shu sababli
  // ular kun-SATRI bo'yicha alohida filtrlanadi — `computeBallMap` dagi `countDays` kabi.
  const dayFrom = Number.isFinite(fromMs) ? tashkentDayKey(new Date(fromMs)) : null;
  const dayTo = Number.isFinite(toMs) ? tashkentDayKey(new Date(toMs)) : null;
  // DB filtri uchun chegaralar. `-Infinity`/`Infinity` ni `Date` ga berib bo'lmaydi —
  // `scope:"all"` da amalda cheksiz oyna (1970 → +10 yil) ishlatiladi.
  const winFrom = new Date(Number.isFinite(fromMs) ? fromMs : 0);
  const winTo = new Date(Number.isFinite(toMs) ? toMs : Date.now() + 10 * 365 * 86400_000);

  // 🤝 Bitta a'zo bo'yicha filtrlanganda uning DO'STLARI safarlari HAM kerak: `refer_ride`
  // qatorlari aynan o'sha safarlardan chiqadi. Avval safar-so'rovi faqat `memberId` bilan
  // kesilardi — natijada bitta odamni tanlagan admin uning ENG KATTA ball manbasini (do'stlar
  // oqimi) jadvalda UMUMAN ko'rmasdi va jadval jami reyting ballidan kam chiqardi.
  let rideMemberIds: number[] | null = null;
  let onlyReferrerId: string | null = null;
  if (filters.memberId) {
    const tu = await prisma.telegramUser.findUnique({ where: { memberId: filters.memberId }, select: { id: true } });
    onlyReferrerId = tu?.id ?? null;
    const refs = onlyReferrerId
      ? await prisma.referral.findMany({ where: { referrerId: onlyReferrerId }, select: { refereeMemberId: true } })
      : [];
    rideMemberIds = [filters.memberId, ...refs.map((r) => r.refereeMemberId).filter((x): x is number => typeof x === "number")];
  }

  // 📉 MIJOZ-YO'LI (`/api/oyin/bell` → `getActivity({ memberId })`) skani TORAYTIRILDI.
  // Avval har chaqiruvda BUTUN populyatsiya o'qilardi: hamma `telegramUser` qatori + yettita
  // `oyin:*` prefiksining HAMMA qatori — ya'ni bitta mijoz qo'ng'iroqni ochganda server
  // O(a'zolar_soni) ish qilardi va bu bot/taksi sweep bilan BITTA jarayonda. A'zoga tegishli
  // kalitlar aniq ma'lum (`<prefiks><memberId>`), demak prefiks-skan o'rniga PK bo'yicha
  // nuqta-o'qish: O(1). Admin-yo'li (memberId berilmagan) o'zgarishsiz — u butun jadvalni
  // ko'rishi SHART.
  const stateRows = (prefix: string): Promise<AppStateRow[]> =>
    (filters.memberId
      ? prisma.appState.findMany({ where: { key: `${prefix}${filters.memberId}` } })
      : prisma.appState.findMany({ where: { key: { startsWith: prefix } } })) as Promise<AppStateRow[]>;

  const [telegramUsers, rideRows, referrals, ticketRows, loginRows, shareRows, questRows, homeRows, sprintWinRows, storyRows, adjActRows] = await Promise.all([
    prisma.telegramUser.findMany({
      // Ism-xaritasi uchun: mijoz-yo'lida FAQAT o'zi + do'stlari kerak (`helpedName` shulardan
      // chiqadi), butun populyatsiya emas.
      where: rideMemberIds ? { memberId: { in: rideMemberIds } } : { memberId: { not: null } },
      select: { id: true, memberId: true, firstName: true, lastName: true, username: true, phone: true, linkedAt: true },
    }),
    // ⚠️ `where` MAJBURIY. Avval ikkala jadval ham TO'LIQ o'qilardi (filtrlar keyin xotirada
    // qo'llanardi), ya'ni admin 50 qatorlik 1-sahifani so'raganda ham server butun `RideReward`
    // va `Referral` tarixini yuklardi — bot va taksi sweep'i bilan BITTA jarayonda. Pik soatda
    // bu tabni ochish event-loop'ni bloklardi.
    prisma.rideReward.findMany({
      where: { createdAt: { gte: winFrom, lte: winTo }, ...(rideMemberIds ? { memberId: { in: rideMemberIds } } : {}) },
      select: { memberId: true, bookingId: true, createdAt: true },
    }),
    prisma.referral.findMany({
      // ⚠️ Sana oynasi bo'yicha FILTRLANMAYDI (`computeBallMap` ham filtrlamaydi): mavsumdan
      // OLDIN yaratilgan juftlik ham mavsum ICHIDA `refer_ride` ball beradi. Oyna qo'yilganda
      // o'sha qatorlar jadvaldan yo'qolardi-yu, ball hisobida QOLARDI. Vaqt bo'yicha kesish
      // pastdagi umumiy `filtered` bosqichida — har QATORNING o'z sanasi bo'yicha.
      // Bitta a'zo so'ralganda esa faqat o'sha odamning juftliklari o'qiladi (jadval qatori
      // baribir taklifchiga yoziladi) — bu og'irlikni qaytadan chegaralaydi.
      where: filters.memberId ? { referrerId: onlyReferrerId ?? "__none__" } : {},
      select: { referrerId: true, refereeMemberId: true, referrerPaidAt: true, createdAt: true },
    }),
    stateRows("oyin:tickets:"),
    stateRows("oyin:login:"),
    stateRows("oyin:share:"),
    // 🎯 kunlik topshiriq va 🏠 ekranga o'rnatish — ikkalasi ham BALL BERADI, demak jadvalda ham
    // ko'rinishi shart (2026-08-03 gacha yo'q edi: 500 ball qayerdan kelgani hech qayerda yo'q).
    stateRows("oyin:quest:"),
    stateRows("oyin:home:"),
    stateRows("oyin:sprintwin:"),
    stateRows("oyin:story:"),
    // 🛠 Admin qo'lda tuzatgan ball — BALL BERADI, demak jadvalda ham, mijozning qo'ng'irog'ida
    // ham ko'rinishi SHART. Yashirin tuzatish = "ball qayerdan keldi" savoli javobsiz qolishi.
    stateRows(ADJ_PREFIX),
  ]);

  const nameByMember = new Map<number, string>();
  const memberByTelegramId = new Map<string, number>();
  for (const tu of telegramUsers) {
    if (!tu.memberId) continue;
    nameByMember.set(tu.memberId, shortName(tu));
    memberByTelegramId.set(tu.id, tu.memberId);
  }
  const nameOf = (id: number): string => nameByMember.get(id) ?? `#${id}`;

  const ridesByMember = new Map<number, { bookingId: number; at: Date }[]>();
  for (const r of rideRows) {
    const arr = ridesByMember.get(r.memberId) ?? [];
    arr.push({ bookingId: r.bookingId, at: r.createdAt });
    ridesByMember.set(r.memberId, arr);
  }

  const rows: OyinActivityRow[] = [];
  const push = (at: string, memberId: number, action: OyinActivityAction, ball: number, helpedMemberId: number | null, note: string | null) => {
    rows.push({ at, memberId, name: nameOf(memberId), action, ball, helpedMemberId, helpedName: helpedMemberId ? nameOf(helpedMemberId) : null, note });
  };

  // ⚠️ "birinchi safar" MAVSUM ichidagi birinchisi — ball aynan shunday hisoblanadi
  // (computeBallMap). Avval butun tarix bo'yicha aniqlanardi va jadval reytingdan farq qilardi.
  for (const [memberId, rides] of ridesByMember) {
    const sorted = [...rides].sort((a, b) => a.at.getTime() - b.at.getTime());
    const firstInSeasonIdx = ballScoped ? sorted.findIndex((r) => r.at.getTime() >= fromMs) : 0;
    sorted.forEach((r, i) => {
      const isFirst = i === firstInSeasonIdx;
      push(r.at.toISOString(), memberId, isFirst ? "first_ride" : "ride", isFirst ? (econ.oyinFirstRideBall ?? 0) : (econ.oyinRideBall ?? 0), null, `#${r.bookingId}`);
    });
  }
  for (const tu of telegramUsers) {
    if (tu.memberId && tu.phone && tu.linkedAt) push(tu.linkedAt.toISOString(), tu.memberId, "phone", econ.oyinPhoneBall ?? 0, null, null);
  }
  for (const r of referrals) {
    const referrerMemberId = memberByTelegramId.get(r.referrerId);
    if (!referrerMemberId) continue;
    const helpedId = r.refereeMemberId ?? null;
    push(r.createdAt.toISOString(), referrerMemberId, "refer_join", econ.oyinReferJoinBall ?? 0, helpedId, null);
    if (r.referrerPaidAt) push(r.referrerPaidAt.toISOString(), referrerMemberId, "refer_first_ride", econ.oyinReferFirstRideBall ?? 0, helpedId, null);
    if (helpedId) {
      for (const rr of ridesByMember.get(helpedId) ?? []) {
        push(rr.at.toISOString(), referrerMemberId, "refer_ride", econ.oyinReferRideBall ?? 0, helpedId, `#${rr.bookingId}`);
      }
    }
  }
  // Kun-markerlari TOSHKENT kuni bo'yicha yoziladi, mavsum chegarasi esa aniq SOAT. Chegara
  // kunida `${day}T00:00Z` mavsum boshlanishidan bir necha soat oldin tushib qolishi mumkin va
  // pastdagi umumiy ms-filtri o'sha qatorni TASHLAB yuborardi — ball hisobida esa u BOR (u kun-
  // SATRI bo'yicha sanaydi). Shu sababli FAQAT chegara kuni (±24 soat) oynaning qirrasiga
  // qisiladi; oynadan uzoq kun oldingidek tashqarida qoladi (aks holda `scope:"all"` + qo'lda
  // sana filtrida eski kunlar ichkariga sudralib kirardi).
  const dayAt = (day: string): string => {
    const ms = Date.parse(`${day}T00:00:00.000Z`);
    if (!Number.isFinite(ms)) return `${day}T00:00:00.000Z`;
    if (Number.isFinite(fromMs) && ms < fromMs && fromMs - ms < 86400_000) return new Date(fromMs).toISOString();
    if (Number.isFinite(toMs) && ms > toMs && ms - toMs < 86400_000) return new Date(toMs).toISOString();
    return new Date(ms).toISOString();
  };
  const inDayWindow = (day: string): boolean => !dayFrom || (day >= dayFrom && day <= (dayTo as string));
  const explodeDays = (rowsIn: AppStateRow[], prefix: string, action: OyinActivityAction, ballKnob: number) => {
    for (const row of rowsIn) {
      const memberId = Number(row.key.slice(prefix.length));
      if (!Number.isFinite(memberId)) continue;
      for (const day of parseDayList(row.value)) {
        // Kun-satri bo'yicha mavsum filtri (pastdagi umumiy ms-filtri UTC/Toshkent farqi tufayli
        // chegara kunini noto'g'ri kesardi — ball hisobidan farq qilardi).
        if (!inDayWindow(day)) continue;
        push(dayAt(day), memberId, action, ballKnob, null, null);
      }
    }
  };
  explodeDays(loginRows, "oyin:login:", "login", econ.oyinDailyLoginBall ?? 0);
  explodeDays(shareRows, "oyin:share:", "share", econ.oyinShareBall ?? 0);
  explodeDays(questRows, "oyin:quest:", "quest", econ.oyinDailyQuestBall ?? 0);
  // 🛠 Admin tuzatishlari — HAR BIRI alohida qator, o'z sanasi va SABABI bilan. `explodeDays`
  // ishlatilmaydi: bular kun-ro'yxati emas, aniq vaqt tamg'ali yozuvlar.
  for (const row of adjActRows) {
    const memberId = Number(row.key.slice(ADJ_PREFIX.length));
    if (!Number.isFinite(memberId)) continue;
    for (const e of parseAdjust(row.value).log) {
      const at = Date.parse(e.at);
      if (!Number.isFinite(at)) continue;
      push(new Date(at).toISOString(), memberId, "adjust", e.ball, null, e.reason || null);
    }
  }
  // 🏠 Ekranga o'rnatish — MAVSUMDA BIR MARTA to'lanadi (`computeBallMap`: kun bormi → 1 yoki 0),
  // lekin kun-ro'yxatida bir nechta kun bo'lishi mumkin (miniapp ilova har ochilganda "added"
  // holatini qayta bildiradi → markDay yangi kunni qo'shadi). `explodeDays` ishlatilsa jadval
  // 500 ballni HAR KUN uchun ko'rsatib reytingdan farq qilardi. Shuning uchun faqat oynadagi
  // ENG BIRINCHI kun uchun bitta qator.
  for (const row of homeRows) {
    const memberId = Number(row.key.slice("oyin:home:".length));
    if (!Number.isFinite(memberId)) continue;
    const first = parseDayList(row.value).filter(inDayWindow).sort()[0];
    if (first) push(dayAt(first), memberId, "home", econ.oyinHomeScreenBall ?? 0, null, null);
  }
  // 🔥 SAFAR ZANJIRI — ball beradi (`oyinStreakBall`), demak jadvalda ham ko'rinishi shart.
  // Manba `computeBallMap` bilan AYNAN bir xil: mavsum ichidagi safar-kunlari, har TO'LIQ
  // 3 ketma-ket kun = 1 bonus (bir-birini qoplamaydi). Qator sanasi — zanjirni YOPGAN kun.
  // GAP-JAMOA - har guruh, har oy: navbatchiga bitta qator. Ball beradi, demak jadvalda
  // ham ko'rinishi SHART (qoida: har ball manbai qo'ng'iroqda va admin jadvalida bo'ladi).
  {
    // ✅ TUZATILDI (2026-08-07): endi o'zgarmas ledgerdan (`GashtakReward`) — qayta hisoblash
    // YO'Q. Eski bug: navbat qayta belgilansa (`applySetTurn`), feed'dagi O'TGAN oylarning
    // jamoa-qatori ham YANGI navbatchiga "ko'chib" ketardi (`computeBallMap` allaqachon shu
    // ledgerga o'tkazilgan, lekin bu — mustaqil, alohida qayta-hisoblovchi joy edi, o'sha
    // safar unutilib qolgan).
    const gRows = await prisma.gashtakReward.groupBy({
      by: ["memberId", "jamoaId", "monthKey"],
      _sum: { amount: true },
      _count: { _all: true },
      where: { createdAt: { gte: winFrom, lte: winTo }, ...(rideMemberIds ? { memberId: { in: rideMemberIds } } : {}) },
    });
    if (gRows.length > 0) {
      const jamoaIds = [...new Set(gRows.map((r) => r.jamoaId))];
      const jamoaNameRows = await prisma.appState.findMany({ where: { key: { in: jamoaIds.map((id) => `${JAMOA_PREFIX}${id}`) } } });
      const nameByJamoaId = new Map<string, string>();
      for (const row of jamoaNameRows) {
        const j = parseJamoa(row.value);
        if (j) nameByJamoaId.set(j.id, j.name);
      }
      for (const r of gRows) {
        const amount = r._sum.amount ?? 0;
        if (amount <= 0) continue;
        const groupName = nameByJamoaId.get(r.jamoaId) ?? "Gashtak";
        push(dayAt(`${r.monthKey}-01`), r.memberId, "jamoa", amount, null, `${groupName} - ${r._count._all} safar`);
      }
    }
  }

  const STREAK_TARGET_ROWS = 3;
  for (const [memberId, rides] of ridesByMember) {
    const days = [...new Set(rides.map((r) => tashkentDayKey(r.at)))].filter(inDayWindow).sort();
    let run = 0;
    let prevMs: number | null = null;
    for (const d of days) {
      const ms = Date.parse(`${d}T00:00:00+05:00`);
      run = prevMs !== null && ms - prevMs === 86400_000 ? run + 1 : 1;
      prevMs = ms;
      if (run === STREAK_TARGET_ROWS) {
        push(dayAt(d), memberId, "streak", econ.oyinStreakBall ?? 0, null, `${STREAK_TARGET_ROWS} kun ketma-ket`);
        run = 0;
        prevMs = ms;
      }
    }
  }
  for (const row of sprintWinRows) {
    const memberId = Number(row.key.slice("oyin:sprintwin:".length));
    if (!Number.isFinite(memberId)) continue;
    for (const wk of parseWeekList(row.value)) push(weekKeyToISO(wk), memberId, "sprint_bonus", econ.oyinSprintBonusBall ?? 0, null, wk);
  }
  for (const row of ticketRows) {
    const memberId = Number(row.key.slice("oyin:tickets:".length));
    if (!Number.isFinite(memberId)) continue;
    for (const t of parseTickets(row.value)) push(t.ts, memberId, "ticket_buy", -t.priceAtPurchase, null, `${t.prizeKey} #${t.no}`);
  }
  // 📸 tasdiqlangan hikoya-isbotlar — ball beradi, demak jadvalda ham ko'rinishi SHART
  // (aks holda "jadval reyting bilan kelishadi" da'vosi buziladi).
  // ⚠️ Ball mavsumda eng ko'pi `OYIN_STORY_SEASON_LIMIT` marta beriladi (`computeBallMap` dagi
  // ikkinchi qavat himoya: admin xato bilan ortiqcha tasdiqlasa yoki mavsum oynasi kengaytirilsa).
  // Jadval buni HISOBGA OLMASDI — ortiqcha qatorlar to'liq ball bilan chiqib reytingdan farq
  // qilardi. Endi ortiqchasi KO'RINADI (admin xatosi yashirilmaydi), lekin ball 0 va sababi yozilgan.
  // Cheklov faqat mavsum-doirasida (`scope:"all"` da har mavsumning o'z limiti bor — u yerda xom tarix).
  for (const row of storyRows) {
    const memberId = Number(row.key.slice("oyin:story:".length));
    if (!Number.isFinite(memberId)) continue;
    try {
      const parsed = JSON.parse(row.value) as { items?: { at?: string; status?: string }[] };
      const approved = (parsed.items ?? [])
        .filter((it) => it.status === "approved")
        .sort((a, b) => Date.parse(String(a.at)) - Date.parse(String(b.at)));
      let paid = 0;
      for (const it of approved) {
        const t = Date.parse(String(it.at));
        const inWin = Number.isFinite(t) && t >= fromMs && t <= toMs;
        const over = ballScoped && inWin && paid >= OYIN_STORY_SEASON_LIMIT;
        if (inWin && !over) paid++;
        push(
          String(it.at), memberId, "story",
          over ? 0 : (econ.oyinStoryProofBall ?? 0), null,
          over ? `limitdan tashqari (mavsumda max ${OYIN_STORY_SEASON_LIMIT})` : null,
        );
      }
    } catch { /* buzuq JSON — o'tkazamiz */ }
  }

  const filtered = rows.filter((r) => {
    const t = Date.parse(r.at);
    if (Number.isFinite(t) && (t < fromMs || t > toMs)) return false;
    if (filters.memberId && r.memberId !== filters.memberId) return false;
    if (filters.action && r.action !== filters.action) return false;
    return true;
  });
  filtered.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  const pageSize = Math.min(200, Math.max(1, filters.pageSize ?? 50));
  const page = Math.max(1, filters.page ?? 1);
  const start = (page - 1) * pageSize;
  return { rows: filtered.slice(start, start + pageSize), total: filtered.length, page, pageSize };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 🏆 REYTING · ⚠️ XAVF · 📟 VITAL — o'yin konsoli (2026-08-10)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Ega talabi: «kengroq kirib boradigan nazorat». Eski panel o'zi tan olardi:
// «serverda ball bo'yicha saralangan ro'yxat qaytaradigan route yo'q» (App.tsx:6020).
// Aslida hisob ALLAQACHON bor edi — `computeBallMap()` HAMMA a'zoni bir marta hisoblaydi.
// Yetishmagani — uni massivga aylantirib qaytaradigan funksiya.

/** 🏆 To'liq reyting. Saralash/filtr/sahifalash MIJOZ tomonida (ro'yxat ~500-2000 qator —
 *  serverga har saralashda qaytish sekinroq bo'lardi). */
export async function adminLeaderboard(): Promise<OyinLeaderRow[]> {
  const [map, ticketRows, banRows, tus, lastRides, referrals] = await Promise.all([
    computeBallMap(),
    prisma.appState.findMany({ where: { key: { startsWith: "oyin:tickets:" } } }) as Promise<AppStateRow[]>,
    prisma.appState.findMany({ where: { key: { startsWith: BAN_PREFIX } }, select: { key: true } }),
    prisma.telegramUser.findMany({ where: { memberId: { not: null } }, select: { memberId: true, phone: true, id: true } }),
    // Oxirgi REAL safar — ilova ochish emas. «Faol» so'zi pul keltirgan harakatni bildiradi.
    prisma.rideReward.groupBy({ by: ["memberId"], _max: { createdAt: true } }),
    // Referal portlashi uchun: kim, qachon. `referrerId` — TELEGRAM id (memberId emas!),
    // shuning uchun pastda `tgIdToMember` orqali o'giriladi.
    prisma.referral.findMany({ select: { referrerId: true, createdAt: true } }),
  ]);

  const phoneByMember = new Map<number, string | null>();
  const tgIdToMember = new Map<string, number>();
  for (const tu of tus) {
    if (tu.memberId == null) continue;
    phoneByMember.set(tu.memberId, tu.phone ?? null);
    tgIdToMember.set(String(tu.id), tu.memberId);
  }

  // Kartalar: jami soni + BITTA mukofotga eng ko'pi (xavf signali).
  const cardsByMember = new Map<number, { total: number; maxOnOnePrize: number }>();
  for (const row of ticketRows) {
    const memberId = Number(row.key.slice("oyin:tickets:".length));
    if (!Number.isFinite(memberId)) continue;
    const tickets = parseTickets(row.value);
    const perPrize = new Map<string, number>();
    for (const t of tickets) perPrize.set(t.prizeKey, (perPrize.get(t.prizeKey) ?? 0) + 1);
    let maxOnOnePrize = 0;
    for (const n of perPrize.values()) if (n > maxOnOnePrize) maxOnOnePrize = n;
    cardsByMember.set(memberId, { total: tickets.length, maxOnOnePrize });
  }

  // Bir kunda ulangan do'stlarning eng ko'p soni (referrer bo'yicha).
  const referPerDay = new Map<number, Map<string, number>>();
  for (const r of referrals) {
    const memberId = tgIdToMember.get(String(r.referrerId));
    if (memberId == null) continue;
    const day = tashkentDayKey(r.createdAt);
    let byDay = referPerDay.get(memberId);
    if (!byDay) { byDay = new Map(); referPerDay.set(memberId, byDay); }
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }
  const maxReferPerDay = new Map<number, number>();
  for (const [memberId, byDay] of referPerDay) {
    let mx = 0;
    for (const n of byDay.values()) if (n > mx) mx = n;
    maxReferPerDay.set(memberId, mx);
  }

  const lastRideByMember = new Map<number, string | null>();
  for (const r of lastRides) lastRideByMember.set(r.memberId, r._max.createdAt?.toISOString() ?? null);

  const banned = new Set<number>();
  for (const b of banRows) {
    const memberId = Number(b.key.slice(BAN_PREFIX.length));
    if (Number.isFinite(memberId)) banned.add(memberId);
  }

  const out: OyinLeaderRow[] = [];
  for (const [memberId, row] of map) {
    const cards = cardsByMember.get(memberId) ?? { total: 0, maxOnOnePrize: 0 };
    out.push({
      memberId,
      name: row.name,
      phone: phoneByMember.get(memberId) ?? null,
      ball: row.breakdown.ball,
      earned: row.breakdown.earned,
      spent: row.breakdown.spent,
      seasonRides: row.seasonRides,
      cards: cards.total,
      adjust: row.breakdown.adjust,
      lastRideAt: lastRideByMember.get(memberId) ?? null,
      banned: banned.has(memberId),
      risk: oyinRiskScore({
        earned: row.breakdown.earned,
        seasonRides: row.seasonRides,
        adjust: row.breakdown.adjust,
        maxCardsOnOnePrize: cards.maxOnOnePrize,
        maxReferralsInADay: maxReferPerDay.get(memberId) ?? 0,
      }),
    });
  }
  // Standart tartib — ball bo'yicha. Panel boshqacha saralashi mumkin, lekin BIRINCHI
  // ko'rinish har doim "eng ko'p ball to'plagan" bo'ladi (ega shuni so'ragan).
  out.sort((a, b) => b.ball - a.ball);
  return out;
}

/** 📟 Vital panel — konsol tepasidagi doimiy qator. BITTA so'rov, 20s kesh.
 *  Avval panel bu raqamlar uchun 7 ta alohida so'rov yuborardi. */
let vitalsCache: { at: number; val: OyinVitals } | null = null;

export async function adminVitals(): Promise<OyinVitals> {
  if (vitalsCache && Date.now() - vitalsCache.at < 20_000) return vitalsCache.val;

  const [season, cap, budget, freeze, catalog, soldMap, leaders, stories, commentsPending] = await Promise.all([
    getSeason(),
    getCapacity(),
    adminBudget(),
    getFreeze(),
    getCatalog(),
    getSoldMap(),
    adminLeaderboard(),
    // Hikoya navbati — `oyinStory` moduli o'zi biladi; xato bo'lsa 0 EMAS, `null` bo'lardi,
    // lekin vital panelda `null` ustuni yo'q, shuning uchun xato log'ga chiqadi va 0 qo'yiladi.
    import("./oyinStory").then((m) => m.adminListStories("pending")).then((r) => r.length).catch((e) => {
      console.error("[oyin] vitals: hikoya navbati o'qilmadi:", e);
      return 0;
    }),
    // 💬 K8 — dinamik import: `oyinCommentService.ts` bu faylning `ownerNames`/`getCatalog`sini
    // import qiladi, aylanma bog'liqlik (circular import) yasamaslik uchun bu yerda STATIK EMAS.
    import("./oyinCommentService").then((m) => m.pendingCommentCount()).catch((e) => {
      console.error("[oyin] vitals: komentariya navbati o'qilmadi:", e);
      return 0;
    }),
  ]);

  const nowMs = Date.now();
  const msLeft = season.endMs != null ? season.endMs - nowMs : null;
  let cardsIssued = 0;
  let prizesFilled = 0;
  for (const p of catalog) {
    if (!p.active) continue;
    const sold = soldMap.get(p.key) ?? 0;
    cardsIssued += sold;
    if (p.limit > 0 && sold >= p.limit) prizesFilled += 1;
  }

  const val: OyinVitals = {
    seasonPhase: season.phase,
    seasonLabel: season.label ?? null,
    daysLeft: msLeft != null ? Math.max(0, Math.ceil(msLeft / 86400_000)) : null,
    finalLock: season.phase === "active" && msLeft != null && msLeft <= OYIN_FINAL_LOCK_MS,
    circulatingBall: cap.circulatingBall,
    capacityRatio: cap.ratio,
    capacityHealthy: cap.healthy,
    budgetSom: budget.budgetSom,
    catalogSom: budget.catalogSom,
    overBudget: budget.overBudget,
    cardsIssued,
    prizesFilled,
    storiesPending: stories,
    riskCount: leaders.filter((l) => l.risk.score > 0).length,
    commentsPending,
    frozen: freeze.frozen,
    at: new Date().toISOString(),
  };
  vitalsCache = { at: Date.now(), val };
  return val;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// ↩ KATALOG TARIXI · 📥 OMMAVIY IMPORT · 📤 RASM · 📅 KELASI MAVSUM (2026-08-10)
// ══════════════════════════════════════════════════════════════════════════════════════════════

const SNAP_KEY = "oyin:catalog:snaps";
interface SnapRow { id: string; at: string; label: string; count: number; json: string }

function parseSnaps(value: string | undefined): SnapRow[] {
  if (!value) return [];
  try {
    const arr = JSON.parse(value) as unknown;
    return Array.isArray(arr) ? (arr as SnapRow[]) : [];
  } catch { return []; }
}

/** Yozuvdan OLDINGI katalog holatini tarixga qo'yadi. Chaqiruvchini HECH QACHON yiqitmaydi —
 *  nusxa olinmagani uchun ega narxni o'zgartira olmay qolishi mantiqsiz bo'lardi. */
async function pushCatalogSnapshot(prevJson: string, label: string): Promise<void> {
  try {
    const count = parseCatalog(prevJson).length;
    // `id` — vaqt + tasodifiy: ro'yxat siljiganda ham qaytarish kaliti o'zgarmaydi.
    const snap: SnapRow = {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      at: new Date().toISOString(), label, count, json: prevJson,
    };
    for (let attempt = 0; attempt < 3; attempt++) {
      const cur = await prisma.appState.findUnique({ where: { key: SNAP_KEY } });
      const next = [snap, ...parseSnaps(cur?.value)].slice(0, OYIN_SNAPSHOT_MAX);
      const value = JSON.stringify(next);
      if (!cur) { await prisma.appState.create({ data: { key: SNAP_KEY, value } }); return; }
      const n = await prisma.$executeRaw`UPDATE "AppState" SET "value" = ${value} WHERE "key" = ${SNAP_KEY} AND "value" = ${cur.value}`;
      if (n === 1) return;
    }
  } catch (e) {
    console.error("[oyin] katalog nusxasi olinmadi:", e);
  }
}

export async function adminListSnapshots(): Promise<OyinCatalogSnapshot[]> {
  const cur = await prisma.appState.findUnique({ where: { key: SNAP_KEY } });
  return parseSnaps(cur?.value).map((s) => ({ id: s.id, at: s.at, label: s.label, count: s.count }));
}

/** ↩ Katalogni nusxadagi holatga qaytaradi. ⚠️ SOTILGAN kartalarga TEGMAYDI — ular alohida
 *  hisoblagichda (`oyin_sold:`). Ya'ni qaytarish narx/o'rin/nom/rasmni tiklaydi, mijozning
 *  qo'lidagi kartani YO'Q QILMAYDI. Aks holda «qaytarish» tugmasi pul o'chiruvchiga aylanardi. */
export async function adminRestoreSnapshot(id: string): Promise<{ ok: boolean; reason?: string; prizes?: OyinAdminPrizeRow[] }> {
  const cur = await prisma.appState.findUnique({ where: { key: SNAP_KEY } });
  const snap = parseSnaps(cur?.value).find((s) => s.id === id);
  if (!snap) return { ok: false, reason: "not_found" };
  const restored = parseCatalog(snap.json);
  if (restored.length === 0) return { ok: false, reason: "empty" };
  const soldMap = await getSoldMap();
  // 🛡 Limit sotilganidan past tushib qolmasin (`adminUpsertPrize` bilan BIR XIL qoida): eski
  // nusxada o'rin 20 bo'lib, o'shandan beri 34 ta sotilgan bo'lsa — 34 da qoladi.
  for (const p of restored) {
    const sold = soldMap.get(p.key) ?? 0;
    if (p.limit < sold) p.limit = sold;
  }
  const ok = await mutateCatalog(() => restored, `qaytarish: ${snap.label}`);
  if (!ok) return { ok: false, reason: "busy" };
  return { ok: true, prizes: await adminListCatalog() };
}

/** 📥 OMMAVIY IMPORT — N ta mukofot BITTA atomik yozuvda.
 *  Eski yo'l: har mukofot uchun alohida POST → 100 ta so'rov, har biri butun katalogni qayta
 *  yozadi va oraliqda xarid bo'lsa CAS urinishlari ko'payadi. Endi bitta yozuv, yarim holat yo'q. */
export async function adminBulkUpsertPrizes(inputs: OyinBulkPrizeInput[]): Promise<OyinBulkResult> {
  const rejected: { name: string; reason: string }[] = [];
  const clean: OyinBulkPrizeInput[] = [];
  for (const raw of inputs.slice(0, OYIN_BULK_MAX)) {
    const name = (raw?.name ?? "").trim().slice(0, 60);
    const price = Math.round(Number(raw?.price));
    const limit = Math.round(Number(raw?.limit));
    if (!name) { rejected.push({ name: "(nomsiz)", reason: "nom bo'sh" }); continue; }
    if (!Number.isFinite(price) || price < 1) { rejected.push({ name, reason: "karta bahosi noto'g'ri" }); continue; }
    if (!Number.isFinite(limit) || limit < 1) { rejected.push({ name, reason: "o'rinlar soni noto'g'ri" }); continue; }
    clean.push({ ...raw, name, price, limit });
  }
  if (inputs.length > OYIN_BULK_MAX) {
    rejected.push({ name: `(+${inputs.length - OYIN_BULK_MAX} qator)`, reason: `bir marta ${OYIN_BULK_MAX} tadan ko'p yuborib bo'lmaydi` });
  }
  if (clean.length === 0) return { ok: false, added: 0, updated: 0, rejected, prizes: await adminListCatalog() };

  const soldMap = await getSoldMap();
  let added = 0;
  let updated = 0;
  const ok = await mutateCatalog((catalog) => {
    added = 0; updated = 0; // CAS qayta urinsa hisoblagich ikki marta o'smasin
    for (const inp of clean) {
      const icon = (inp.icon || "🎁").trim().slice(0, 8) || "🎁";
      const valueLabel = (inp.valueLabel || "").trim().slice(0, 60);
      const photoUrl = inp.photoUrl?.trim().slice(0, 500) || null;
      const existing = inp.key ? catalog.find((p) => p.key === inp.key) : undefined;
      if (existing) {
        const sold = soldMap.get(existing.key) ?? 0;
        Object.assign(existing, {
          name: inp.name, icon, valueLabel, price: inp.price,
          limit: Math.max(inp.limit, sold), photoUrl,
          ...(typeof inp.queued === "boolean" ? { queued: inp.queued } : {}),
        });
        updated += 1;
      } else {
        catalog.push({
          key: uniqueCatalogKey(inp.name, catalog), icon, name: inp.name, valueLabel,
          price: inp.price, limit: inp.limit, photoUrl, active: true,
          // ⚠️ Import HAR DOIM navbatga. 100 ta mukofot birdan vitrinaga chiqsa ball tarqalib
          // ketadi va HECH BIRI to'lmaydi — to'lish-qulfi bilan bu mavsumni o'ldiradi.
          queued: inp.queued ?? true,
        });
        added += 1;
      }
    }
    return catalog;
  }, `import: ${clean.length} ta mukofot`);

  if (!ok) {
    return {
      ok: false, added: 0, updated: 0,
      rejected: [...rejected, { name: "(hammasi)", reason: "katalog band — qayta urinib ko'ring" }],
      prizes: await adminListCatalog(),
    };
  }
  return { ok: true, added, updated, rejected, prizes: await adminListCatalog() };
}

/** 📤 Mukofot rasmini FAYLDAN yuklash. Rasm Telegram'da saqlanadi va `photoFileId` yoziladi —
 *  ya'ni rasm BIZNIKI bo'ladi. Eski yo'l (tashqi havola) ishlashda davom etadi: server
 *  `photoFileId` bo'lmasa `photoUrl` ni oladi.
 *  Telegram javob bermasa — do'kon naqshidagi zaxira (`shopService.ts:1199`): `data:` URL. */
export async function adminSetPrizePhoto(key: string, buf: Buffer, mime = "image/jpeg"): Promise<{ ok: boolean; reason?: string }> {
  const prize = (await getCatalog()).find((p) => p.key === key);
  if (!prize) return { ok: false, reason: "not_found" };
  const { env } = await import("../env");
  const adminId = env.adminIds.find((id) => id.trim() !== "");
  let fileId: string | null = null;
  if (env.BOT_TOKEN && adminId) {
    try {
      const form = new FormData();
      form.append("chat_id", adminId);
      form.append("photo", new Blob([buf], { type: mime }), "photo.jpg");
      form.append("caption", `🎁 Mukofot rasmi · ${prize.name}`);
      form.append("disable_notification", "true");
      const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendPhoto`, { method: "POST", body: form });
      const data = (await res.json()) as { ok: boolean; result?: { photo?: { file_id: string }[] } };
      const sizes = data.ok ? (data.result?.photo ?? []) : [];
      fileId = sizes.length ? sizes[sizes.length - 1]!.file_id : null;
    } catch (e) {
      console.error("[oyin] rasm Telegram'ga yuklanmadi:", e);
    }
  }
  // Zaxira: bazaga `data:` URL. Katta rasm katalog JSON'ini shishiradi (u HAR o'qishda
  // to'liq parse qilinadi), shuning uchun chegara bor va rad etish EKRANDA ko'rinadi.
  const dataUrl = fileId ? null : `data:${mime};base64,${buf.toString("base64")}`;
  if (!fileId && dataUrl && dataUrl.length > 700_000) return { ok: false, reason: "telegram_off_and_too_big" };

  const ok = await mutateCatalog((cur) => {
    const p = cur.find((x) => x.key === key);
    if (!p) return null;
    p.photoFileId = fileId;
    if (!fileId) p.photoUrl = dataUrl;
    return cur;
  }, `rasm: ${prize.name}`);
  return ok ? { ok: true } : { ok: false, reason: "busy" };
}

/** Rasm manbasini hal qiladi: Telegram `fileId` USTUN, keyin tashqi/`data:` havola. */
export async function resolvePrizePhoto(key: string): Promise<{ fileId: string | null; url: string | null }> {
  const prize = (await getCatalog()).find((p) => p.key === key);
  if (!prize) return { fileId: null, url: null };
  return { fileId: prize.photoFileId ?? null, url: prize.photoUrl ?? null };
}

// ── 📅 KELASI MAVSUM QORALAMASI ───────────────────────────────────────────────────────────────
// ⚠️ JONLI mavsumga TEGMAYDI — alohida AppState kaliti. Qoralamani ishga tushirish
// (`adminStartNewSeason`) ALOHIDA ONGLI qadam bo'lib qoladi.
const SEASON_PLAN_KEY = "oyin:seasonplan";

export async function adminGetSeasonPlan(): Promise<OyinSeasonPlan> {
  const row = await prisma.appState.findUnique({ where: { key: SEASON_PLAN_KEY } });
  if (!row) return { ...OYIN_SEASON_PLAN_DEFAULT };
  try {
    const parsed = JSON.parse(row.value) as Partial<OyinSeasonPlan>;
    return { ...OYIN_SEASON_PLAN_DEFAULT, ...parsed, split: { ...OYIN_SEASON_PLAN_DEFAULT.split, ...(parsed.split ?? {}) } };
  } catch {
    return { ...OYIN_SEASON_PLAN_DEFAULT };
  }
}

export async function adminSetSeasonPlan(input: Partial<OyinSeasonPlan>): Promise<OyinSeasonPlan> {
  const cur = await adminGetSeasonPlan();
  const pct = (v: unknown, fallback: number): number => Math.max(0, Math.min(100, Math.round(Number(v ?? fallback)) || 0));
  const next: OyinSeasonPlan = {
    startIso: input.startIso ?? cur.startIso,
    endIso: input.endIso ?? cur.endIso,
    label: input.label ?? cur.label,
    budgetSom: Math.max(0, Math.round(Number(input.budgetSom ?? cur.budgetSom)) || 0),
    split: {
      kichik: pct(input.split?.kichik, cur.split.kichik),
      orta: pct(input.split?.orta, cur.split.orta),
      katta: pct(input.split?.katta, cur.split.katta),
    },
    note: String(input.note ?? cur.note).slice(0, 500),
    updatedAt: new Date().toISOString(),
  };
  const value = JSON.stringify(next);
  await prisma.appState.upsert({ where: { key: SEASON_PLAN_KEY }, create: { key: SEASON_PLAN_KEY, value }, update: { value } });
  return next;
}

// ── 🎟 KARTA SAHIFASI (2026-08-12, ega talabi) ─────────────────────────────────────────────────
// Ega: «har bir kartaga kirib bo'lishi · birovni kartasiga kirib ko'rish imkoniyati kerak».
//
// ⚠️ ALOHIDA INDEKS QURILMADI — ataylab. Kartalar a'zolar chiptalaridan HOSIL QILINADI.
// Sabab: indeks (`oyin:card:<prize>:<no>`) xarid yo'liga ikkinchi yozuv qo'shadi va u yiqilsa
// indeks bilan haqiqat AJRALIB ketadi (jim drift — bu kodbazada allaqachon bir necha marta
// zarar keltirgan naqsh). Hosil qilish esa qurilishi bo'yicha DOIM to'g'ri.
// Narxi: `oyin:tickets:` prefiksi bo'yicha skan — bugun 854 a'zo, ya'ni arzon. Chegara:
// ~50 000 kartadan yoki p95 > 300 ms dan keyin alohida jadval kerak bo'ladi (OYIN_KARTA_PLAN §1).
const PRIZE_CARDS_TTL_MS = 30_000;
let prizeCardsCache: { at: number; rows: { prizeKey: string; no: number; gno: number | null; memberId: number; ts: string; result?: "won" | "lost"; note?: string; notePublic?: boolean }[] } | null = null;

async function allTicketRows(): Promise<NonNullable<typeof prizeCardsCache>["rows"]> {
  if (prizeCardsCache && Date.now() - prizeCardsCache.at < PRIZE_CARDS_TTL_MS) return prizeCardsCache.rows;
  const rows = await prisma.appState.findMany({ where: { key: { startsWith: "oyin:tickets:" } } });
  const out: NonNullable<typeof prizeCardsCache>["rows"] = [];
  for (const r of rows) {
    const memberId = Number(r.key.slice("oyin:tickets:".length));
    if (!Number.isFinite(memberId)) continue;
    for (const t of parseTickets(r.value)) {
      // 🧪 Sinov kartasi panjarada KO'RSATILADI (yashirish «ega o'z tirajida qatnashdi»
      // ayblovini keltiradi), lekin egasi sifatida ochiq «sinov» deb yoziladi.
      out.push({
        prizeKey: t.prizeKey, no: t.no, gno: t.gno ?? null, memberId, ts: t.ts,
        ...(t.result ? { result: t.result } : {}),
        ...(t.note ? { note: t.note } : {}),
        ...(t.notePublic ? { notePublic: true as const } : {}),
      });
    }
  }
  prizeCardsCache = { at: Date.now(), rows: out };
  return out;
}

/** Egalarning KO'RSATILADIGAN ismi. Ega qarori 2026-08-12: «oddiy telegram ismlari turishi
 *  yaxshi». Telefon, familiya va `memberId` HECH QACHON chiqmaydi.
 *  `export` — K8 (`oyinCommentService.ts`) komentariya muallifi ismi uchun ham shu funksiyani
 *  qayta ishlatadi, ikkinchi nusxa yozilmaydi. */
export async function ownerNames(memberIds: number[]): Promise<Map<number, string>> {
  const ids = [...new Set(memberIds)];
  if (ids.length === 0) return new Map();
  const rows = await prisma.telegramUser.findMany({
    where: { memberId: { in: ids } },
    select: { memberId: true, firstName: true, username: true },
  });
  const map = new Map<number, string>();
  for (const r of rows) {
    if (r.memberId == null) continue;
    const n = (r.firstName ?? "").trim() || (r.username ? `@${r.username}` : "") || "Mijoz";
    map.set(r.memberId, n.slice(0, 24));
  }
  return map;
}

/** 🎟 Bitta sovg'aning BARCHA kartalari — bo'shi ham, bandi ham. Panjara shundan chiziladi. */
export async function getPrizeCards(prizeKey: string, viewerMemberId: number | null): Promise<OyinPrizeCardsResponse | null> {
  const [catalog, soldMap, econ, rows] = await Promise.all([getCatalog(), getSoldMap(), getBonusEcon(), allTicketRows()]);
  const prize = catalog.find((p) => p.key === prizeKey);
  if (!prize) return null;
  const mine = rows.filter((r) => r.prizeKey === prizeKey);
  const names = await ownerNames(mine.map((r) => r.memberId));
  const byNo = new Map(mine.map((r) => [r.no, r]));
  const sold = soldMap.get(prizeKey) ?? 0;
  const minSell = minSellOf(prize.limit, econ.oyinMinSellPct ?? OYIN_MIN_SELL_PCT_DEFAULT);
  const cards: OyinPrizeCard[] = [];
  for (let no = 1; no <= prize.limit; no++) {
    const r = byNo.get(no);
    cards.push(r
      ? { no, gno: r.gno, ownerName: names.get(r.memberId) ?? "Mijoz", mine: viewerMemberId != null && r.memberId === viewerMemberId, at: r.ts }
      : { no, gno: null, ownerName: null, mine: false, at: null });
  }
  return {
    prizeKey, prizeName: prize.name, prizeIcon: prize.icon, photoUrl: prize.photoUrl,
    price: prize.price, limit: prize.limit, sold, minSell,
    willDraw: minSell <= 0 || sold >= minSell,
    cards,
  };
}

/** 🔎 Bitta karta sahifasi — O'ZGA odamning kartasi ham shu bilan ochiladi (ega talabi).
 *  Shuning uchun bu yerda faqat ochiq ma'lumot: raqam, sovg'a, ism, sana, holat. */
export async function getCardDetail(gno: number, viewerMemberId: number | null): Promise<OyinCardDetail | null> {
  if (!Number.isFinite(gno)) return null;
  const [catalog, season, rows] = await Promise.all([getCatalog(), getSeason(), allTicketRows()]);
  // Eski kartalarda `gno` yo'q — o'shalar uchun `no` bo'yicha ham qidiriladi (myTickets
  // aynan shunday moslikni qiladi: `gno: t.gno ?? t.no`).
  const r = rows.find((x) => x.gno === gno) ?? rows.find((x) => x.gno === null && x.no === gno);
  if (!r) return null;
  const prize = catalog.find((p) => p.key === r.prizeKey);
  const names = await ownerNames([r.memberId]);
  const mine = viewerMemberId != null && r.memberId === viewerMemberId;
  // 🔒 Maxfiylik QARORI shu yerda, klientda EMAS — egasi bo'lmagan tomoshabinga qaydning o'zi
  // umuman uzatilmaydi (notePublic bo'lmasa), klient "yashirish" bilan shug'ullanmaydi.
  const noteVisible = mine || r.notePublic === true;
  const avatar = await getAvatarState(r.memberId);
  const photoVisible = mine || avatar.optIn;
  const resolvedGno = r.gno ?? r.no;
  return {
    gno: resolvedGno,
    code: await encodeCardCode(resolvedGno), // 🔐 K1
    no: r.no,
    prizeKey: r.prizeKey,
    prizeName: prize?.name ?? r.prizeKey,
    prizeIcon: prize?.icon ?? "🎟",
    photoUrl: prize?.photoUrl ?? null,
    ownerName: names.get(r.memberId) ?? "Mijoz",
    mine,
    at: r.ts,
    result: r.result ?? null,
    drawIso: season.endIso,
    note: noteVisible && r.note ? r.note : null,
    notePublic: r.notePublic === true,
    ownerPhotoUrl: photoVisible && avatar.fileId ? await resolveTelegramFileUrl(avatar.fileId) : null,
    avatarOptIn: avatar.optIn,
  };
}

/** 🌐 Ochiq tekshiruv sahifasi (K1, `birjoy.online/?karta=<kod>`) — PAROLSIZ, HAR KIM ko'radi.
 *  Shuning uchun `getCardDetail`dan MUSTAQIL: telefon/familiya/qayd (note) hech qachon, faqat
 *  plan §1 sanagan maydonlar (karta·sovg'a·egasi·holat). Kod noto'g'ri/Luhn mos kelmasa yoki
 *  karta topilmasa — `null` (klient "topilmadi" deb ko'rsatadi, farqlanmaydi — soxtalashtirish
 *  urinishiga qaysi sabab ekanini aytmaymiz). */
export async function getPublicCardVerify(codeRaw: string): Promise<OyinCardVerifyResponse | null> {
  const gno = await decodeCardCode(codeRaw);
  if (gno == null) return null;
  const [catalog, season, rows] = await Promise.all([getCatalog(), getSeason(), allTicketRows()]);
  const r = rows.find((x) => x.gno === gno) ?? rows.find((x) => x.gno === null && x.no === gno);
  if (!r) return null;
  const prize = catalog.find((p) => p.key === r.prizeKey);
  const names = await ownerNames([r.memberId]);
  const avatar = await getAvatarState(r.memberId);
  return {
    code: await encodeCardCode(gno),
    prizeName: prize?.name ?? r.prizeKey,
    prizeIcon: prize?.icon ?? "🎟",
    prizePhotoUrl: prize?.photoUrl ?? null,
    ownerName: names.get(r.memberId) ?? "Mijoz",
    ownerPhotoUrl: avatar.optIn && avatar.fileId ? await resolveTelegramFileUrl(avatar.fileId) : null,
    at: r.ts,
    result: r.result ?? null,
    drawIso: season.endIso,
  };
}

/** 🗒 K2/K3 — egasi o'z kartasiga qisqa qayd yozadi/o'chiradi, maxfiylikni tanlaydi.
 *  Faqat EGASI — boshqa a'zoning kartasiga yozib bo'lmaydi (`memberId` mos kelishi shart). */
export async function setCardNote(memberId: number, gno: number, noteRaw: string, isPublic: boolean): Promise<OyinSetCardNoteResult> {
  const note = (noteRaw || "").trim();
  if (note.length > CARD_NOTE_MAX) return { ok: false, reason: "too_long" };
  const key = `oyin:tickets:${memberId}`;
  const row = await prisma.appState.findUnique({ where: { key } });
  const tickets = parseTickets(row?.value);
  const t = tickets.find((x) => (x.gno ?? x.no) === gno);
  if (!t) return { ok: false, reason: "not_found" };
  if (note) { t.note = note; t.notePublic = isPublic; } else { delete t.note; delete t.notePublic; }
  await prisma.appState.update({ where: { key }, data: { value: JSON.stringify(tickets) } });
  prizeCardsCache = null; // darhol ko'rinsin — 30s TTL kutilmaydi
  return { ok: true };
}

/** 👤 K4 — o'z Telegram avatarini o'yin kartasida ko'rsatish. ATAYLAB `Member.photoFileId`ga
 *  TEGILMAYDI — o'sha maydon haydovchi-portret moderatsiya oqimiga tegishli (driverPhotoService),
 *  bu yerdan yozilsa moderatsiyadan o'tgan rasmni jimgina bosib yozib qo'yardi. O'z alohida
 *  AppState kaliti: `oyin:avatar:<memberId>` = `{ optIn, fileId }`. */
async function getAvatarState(memberId: number): Promise<{ optIn: boolean; fileId: string | null }> {
  const row = await prisma.appState.findUnique({ where: { key: `oyin:avatar:${memberId}` } });
  if (!row?.value) return { optIn: false, fileId: null };
  try {
    const v = JSON.parse(row.value) as { optIn?: unknown; fileId?: unknown };
    return { optIn: v.optIn === true, fileId: typeof v.fileId === "string" && v.fileId ? v.fileId : null };
  } catch {
    return { optIn: false, fileId: null };
  }
}

export async function setAvatarOptIn(memberId: number, optIn: boolean): Promise<OyinAvatarOptInResult> {
  const key = `oyin:avatar:${memberId}`;
  const cur = await getAvatarState(memberId);
  let fileId = cur.fileId;
  // Yoqilganda — yangi Telegram profil-rasmini olib ko'ramiz (har safar yangilanadi, eski
  // rasm chirimasin). O'chirilganda fileId SAQLANADI — qayta yoqilsa qayta so'rov shart emas.
  if (optIn) fileId = (await fetchTelegramAvatarFileId(memberId)) ?? fileId;
  await prisma.appState.upsert({
    where: { key }, create: { key, value: JSON.stringify({ optIn, fileId }) },
    update: { value: JSON.stringify({ optIn, fileId }) },
  });
  prizeCardsCache = null; // egasining boshqa kartalarida ham darhol ko'rinsin
  return { ok: true, optIn, photoFound: optIn ? fileId != null : true };
}

/** Telegram'dan ochiq profil-rasmni tortib oladi (bor bo'lsa). `driverPhotoService.
 *  syncDriverPhotoFromTelegram` bilan BIR XIL API chaqiruvi — lekin BU YERDA hech qanday
 *  Prisma yozuvga TEGILMAYDI, faqat `file_id` qaytaradi (Member jadvali — haydovchi
 *  moderatsiyasiga tegishli, bu yerdan aralashilmaydi). */
async function fetchTelegramAvatarFileId(memberId: number): Promise<string | null> {
  if (!env.BOT_TOKEN) return null;
  const tu = await prisma.telegramUser.findFirst({ where: { memberId }, select: { id: true } });
  if (!tu) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/getUserProfilePhotos?user_id=${tu.id}&limit=1`);
    const data = (await res.json()) as { ok: boolean; result?: { photos?: { file_id: string }[][] } };
    if (!data.ok || !data.result?.photos?.length) return null;
    const sizes = data.result.photos[0];
    if (!sizes?.length) return null;
    return sizes[sizes.length - 1]!.file_id; // eng katta variant
  } catch {
    return null;
  }
}
