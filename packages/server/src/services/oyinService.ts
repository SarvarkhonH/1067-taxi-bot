// 🎮 KOSON O'YINI — ball hisobi, chipta xaridi, reyting, jamoam (feature "oyin", DARK until owner
// QABUL). KOSON_OYIN_PLAN.md v9.2 + KOSON_ADMIN_DOD.md B2. Ball — alohida hisob-kitob birligi,
// Coin/CoinTxn'ga MUTLAQO TEGMAYDI (aralashtirilsa ≤350 clamp semantikasi buzilishi mumkin).
//
// Ball MANBASI: mavjud jadvallardan (RideReward, Referral, TelegramUser) JONLI hisoblanadi — yangi
// "grant" yozuvi yo'q, shuning uchun bookingNotifier.ts ga tegilmaydi (faqat push-hook qo'shiladi,
// pastda ko'ring). Faqat kunlik-kirish/ulashish va chipta-xarid/sotilgan-son AppState'da yoziladi
// (`oyin:*` prefiks). Yangi Prisma model YO'Q, yangi poller YO'Q (ARCHITECTURE.md invariantlari).
import {
  OYIN_FINAL_LOCK_MS,
  OYIN_SEED_CATALOG,
  OYIN_STORY_SEASON_LIMIT,
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
  type OyinBallAdjustEntry,
  type OyinBallAdjustInput,
  type OyinFreezeState,
} from "@t1067/shared";
import { prisma } from "../db";
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
  quest: 0, home: 0, story: 0, streak: 0, sprintBonus: 0, adjust: 0, earned: 0, spent: 0, ball: 0,
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
interface TicketRecord { prizeKey: OyinPrizeKey; no: number; gno?: number; priceAtPurchase: number; ts: string; test?: boolean }

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
        // `ts` buzuq bo'lsa `ticketInSeason` uni MAVSUM ICHIDA deb sanaydi (o'sha izohga qarang).
        ts: typeof t.ts === "string" ? t.ts : "",
        // ⚠️ FAQAT qat'iy `true` test hisoblanadi. `"false"`/`0`/`"1"` kabi qiymatlar test
        // BO'LMAYDI — aks holda buzuq qator chiptani jimgina tirajdan chiqarib tashlardi.
        ...(t.test === true ? { test: true as const } : {}),
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

/** Chipta mavsum ichida sotib olinganmi. ⚠️ Buzuq `ts` → HISOBGA OLINADI (chetlashtirilsa bepul
 *  ball bo'lardi — ya'ni ekspluatatsiya yo'nalishi). Faqat arxivlash uni butunlay olib tashlaydi. */
function ticketInSeason(t: TicketRecord, fromMs: number, toMs: number): boolean {
  const ms = Date.parse(t.ts);
  if (!Number.isFinite(ms)) {
    console.warn(`[oyin] chiptada buzuq ts: ${String(t.ts)} — mavsum ichida deb hisoblandi`);
    return true;
  }
  return ms >= fromMs && ms <= toMs;
}

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
  const fromMs = season.startMs as number;
  const toMs = season.endMs as number;
  const from = new Date(fromMs);
  const to = new Date(toMs);
  const fromDay = season.startDayKey as string;
  const toDay = season.endDayKey as string;
  const fromWeek = season.startWeekKey as string;
  const toWeek = season.endWeekKey as string;

  const [rideCounts, rideDayRows, referrals, telegramUsers, ticketRows, loginRows, shareRows, questRows, homeRows, sprintWinRows, storyRows, adjRows] = await Promise.all([
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

  // ⚠️ `spent` HAM mavsumga qisqartiriladi. Aks holda (`earned` mavsumli, `spent` umrbod) o'tgan
  // mavsumda ko'p chipta olgan odam yangi mavsumda `max(0, oz − ko'p)` = 0 da qotib qolardi —
  // xatosiz, belgisiz, haftalab.
  const spentByMember = new Map<number, number>();
  for (const row of ticketRows) {
    const memberId = Number(row.key.slice("oyin:tickets:".length));
    if (!Number.isFinite(memberId)) continue;
    const sum = parseTickets(row.value)
      .filter((t) => ticketInSeason(t, fromMs, toMs))
      .reduce((s, t) => s + (t.priceAtPurchase || 0), 0);
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
  // 🛠 Admin tuzatishi — musbat ham, manfiy ham bo'lishi mumkin.
  const adjustByMember = new Map<number, number>();
  for (const row of adjRows) {
    const memberId = Number(row.key.slice(ADJ_PREFIX.length));
    if (Number.isFinite(memberId)) adjustByMember.set(memberId, parseAdjust(row.value).total);
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
    // `linkedAt` NULL = ustun to'ldirilishidan oldin ulangan, ya'ni ta'rifan mavsumgacha → bonus yo'q.
    const linkedMs = tu.linkedAt ? tu.linkedAt.getTime() : null;
    const phoneBall = tu.phone && linkedMs !== null && linkedMs >= fromMs && linkedMs <= toMs ? (econ.oyinPhoneBall ?? 0) : 0;
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
    const earned = ridesBall + phoneBall + referJoinBall + referFirstBall + referRideBall + loginBall + shareBall + storyBall + streakBall + sprintBall + questBall + homeBall + adjustBall;
    const spent = spentByMember.get(memberId) ?? 0;
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
        streak: streakBall, sprintBonus: sprintBall, adjust: adjustBall,
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
    return { frozen: true, at: null, ticketCount: 0 };
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
    ? myTickets.filter((t) => ticketInSeason(t, season.startMs as number, season.endMs as number)).length
    : 0;
  const activeCatalog = catalog.filter((p) => p.active);
  // 📊 UY KARTASI uchun UMUMIY hisob — mijozning shaxsiy balli emas, butun mavsum bo'yicha.
  const capacityTotal = activeCatalog.reduce((n, p) => n + Math.max(0, p.limit), 0);
  const soldTotal = activeCatalog.reduce((n, p) => n + Math.min(p.limit, soldMapAll.get(p.key) ?? 0), 0);
  const topPrizeName = [...activeCatalog].sort((a, b) => b.price - a.price)[0]?.name ?? "sovrin";
  // Maqsad: sovrin keyin o'chirilgan/yashirilgan bo'lsa null (hero avtomatik eng arzonga tushadi).
  const goalPrizeKey = goalRow && activeCatalog.some((p) => p.key === goalRow.value) ? goalRow.value : null;

  // ── 3-TO'LQIN — 2-to'lqin natijasiga bog'liq, lekin o'zaro bog'liq EMAS.
  // 📸 Hikoya-poster holati. Matnlardagi {ism}/{chipta}/{sovrin} SERVERDA almashtiriladi —
  // miniapp shablon bilan ovora bo'lmaydi va admin matnni istagancha o'zgartiraveradi.
  const { storyStateOf } = await import("./oyinStory");
  const [referRideToday, storyState] = await Promise.all([
    // 🤝 Do'stlarim BUGUN safar qildimi (kunlik topshiriq uchun) — faqat o'z doirasi bo'yicha.
    active && refereeIds.length
      ? prisma.rideReward.count({ where: { memberId: { in: refereeIds }, createdAt: { gte: dayStart } } })
      : Promise.resolve(0),
    storyStateOf(memberId, econ.oyinStoryProofBall ?? 0, {
      ism: mine?.name ?? "Do'st",
      chipta: ticketCount,
      sovrin: topPrizeName,
    }),
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


export async function getVitrina(memberId: number): Promise<OyinVitrinaResponse> {
  const [season, catalog, soldMap, ticketsRow, sponsor] = await Promise.all([
    getSeason(),
    getCatalog(),
    getSoldMap(),
    prisma.appState.findUnique({ where: { key: `oyin:tickets:${memberId}` } }),
    getSponsor(),
  ]);
  // `mine` FAQAT joriy mavsum chiptalaridan — aks holda toza-boshlashdan keyin `sold: 0` bo'lgan
  // sovrinda "Sizniki: 3" ko'rinardi (ochiq-oydin yolg'on).
  const mine = season.configured
    ? parseTickets(ticketsRow?.value).filter((t) => ticketInSeason(t, season.startMs as number, season.endMs as number))
    : [];
  const mineByPrize = new Map<string, number>();
  for (const t of mine) mineByPrize.set(t.prizeKey, (mineByPrize.get(t.prizeKey) ?? 0) + 1);

  const prizes = catalog
    .filter((p) => p.active)
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
      });
    }
    return out;
  } catch {
    return [];
  }
}

async function getCatalog(): Promise<OyinCatalogPrize[]> {
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
export async function adminListCatalog(): Promise<OyinAdminPrizeRow[]> {
  const [catalog, soldMap] = await Promise.all([getCatalog(), getSoldMap()]);
  return catalog.map((p) => ({ ...p, sold: soldMap.get(p.key) ?? 0 }));
}

// 🎯 Maqsad-sovrin (YAKUNIY DIZAYN §1): mijoz qaysi sovrin uchun ball yig'ayotganini O'ZI
// tanlaydi. Avval tizim eng arzonini avtomatik olardi — mavhum "340 ball" o'rniga
// "Choy servizgacha 660 qoldi" degan aniq maqsad ancha kuchli.
const GOAL_PREFIX = "oyin:goal:";

export async function setGoalPrize(memberId: number, prizeKey: string): Promise<{ ok: boolean }> {
  const catalog = await getCatalog();
  // Faol bo'lmagan/mavjud bo'lmagan sovrin maqsad bo'la olmaydi (hero bo'sh qolmasin).
  if (!catalog.some((p) => p.key === prizeKey && p.active)) return { ok: false };
  const key = `${GOAL_PREFIX}${memberId}`;
  await prisma.appState.upsert({ where: { key }, create: { key, value: prizeKey }, update: { value: prizeKey } });
  return { ok: true };
}

/** 🎟 Mijozning mavsum chiptalari — sovrin nomi/rasmi bilan birga. Chipta raqami avval faqat
 *  bayram-oynasida bir marta ko'rinardi va qayta ko'rishning YO'LI yo'q edi. */
export async function myTickets(memberId: number): Promise<OyinMyTicketsResponse> {
  const [season, catalog, row] = await Promise.all([
    getSeason(),
    getCatalog(),
    prisma.appState.findUnique({ where: { key: `oyin:tickets:${memberId}` } }),
  ]);
  if (!season.configured) return { tickets: [], drawIso: null };
  const byKey = new Map(catalog.map((p) => [p.key, p]));
  const tickets = parseTickets(row?.value)
    .filter((t) => ticketInSeason(t, season.startMs as number, season.endMs as number))
    .map((t) => {
      const p = byKey.get(t.prizeKey);
      return {
        prizeKey: t.prizeKey,
        // Sovrin katalogdan o'chirilgan bo'lsa ham chipta YO'QOLMAYDI — kalitni ko'rsatamiz.
        prizeName: p?.name ?? t.prizeKey,
        prizeIcon: p?.icon ?? "🎟",
        photoUrl: p?.photoUrl ?? null,
        gno: t.gno ?? t.no, // eski chiptalarda global raqam yo'q — sovrin-ichi raqami ko'rsatiladi
        no: t.no,
        at: t.ts,
        price: t.priceAtPurchase,
        // 🧪 Ekranda OCHIQ belgilanadi. Yashirilsa ega o'z sinov chiptasini haqiqiy deb o'ylab
        // tirajni kutib qolardi — va "nega yutmadim" savoli javobsiz bo'lardi.
        ...(t.test ? { test: true } : {}),
      };
    })
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return { tickets, drawIso: season.endIso };
}

/** 👀 Mehmon-teaser: sovrinlar + mavsum holati. A'zo ma'lumoti YO'Q, shuning uchun auth kerak emas. */
export async function teaserData(): Promise<OyinTeaserResponse> {
  const [season, catalog, sponsor] = await Promise.all([getSeason(), getCatalog(), getSponsor()]);
  return {
    season: { configured: season.configured, phase: season.phase, label: season.label, startIso: season.startIso, endIso: season.endIso },
    sponsor: { name: sponsor.name, photoUrl: sponsor.photoUrl },
    prizes: catalog.filter((p) => p.active).sort((a, b) => b.price - a.price)
      .map((p) => ({ key: p.key, icon: p.icon, name: p.name, valueLabel: p.valueLabel, price: p.price, limit: p.limit, photoUrl: p.photoUrl })),
  };
}

/** 🤝 Taklif-kartochkasi uchun (bot/oyin.ts) — eng qimmat FAOL sovrin + jami o'rin soni.
 *  Mavsum yopiq bo'lsa `null` (kartochka umuman yuborilmaydi — yolg'on va'da bermaymiz). */
export async function joinCardData(): Promise<{ prizeName: string; photoUrl: string | null; icon: string; slots: number; seasonLabel: string | null } | null> {
  const season = await getSeason();
  if (season.phase !== "active" && season.phase !== "upcoming") return null;
  const catalog = (await getCatalog()).filter((p) => p.active);
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
  const [catalog, soldMap] = await Promise.all([getCatalog(), getSoldMap()]);
  const name = (input.name || "").trim().slice(0, 60) || "Sovrin";
  const icon = (input.icon || "🎁").trim().slice(0, 8) || "🎁";
  const valueLabel = (input.valueLabel || "").trim().slice(0, 60);
  // `Number.isFinite` MAJBURIY: `1e999` → Infinity → JSON.stringify → `null` → keyin
  // `ball < prize.price` solishtiruvi `false` bo'lib chiptalar BEPUL tarqalardi.
  const priceRaw = Number(input.price);
  const price = Math.max(1, Math.round(Number.isFinite(priceRaw) ? priceRaw : 0));
  const limitRaw = Math.max(1, Math.round(Number(input.limit) || 0));
  const photoUrl = input.photoUrl?.trim().slice(0, 500) || null;

  const existing = input.key ? catalog.find((p) => p.key === input.key) : undefined;
  // 🛡 `limit < sold` SERVERDA to'siladi. Admin panelda tasdiq oynasi bor, LEKIN u faqat klientda —
  // to'g'ridan-to'g'ri API so'rovi (yoki eski panel tab'i) uni aylanib o'tadi. Limit sotilganidan
  // past qo'yilsa allaqachon chipta olganlarning yutish ehtimoli JIM o'zgaradi (ular buni hech
  // qachon bilmaydi) va `reserveSoldSlot` keyingi har xaridni rad etadi — ya'ni sovrin "tugagan"
  // ko'rinadi. Shuning uchun limit sotilganidan PAST tushirilmaydi: sotilganiga qisiladi.
  const sold = existing ? (soldMap.get(existing.key) ?? 0) : 0;
  const limit = Math.max(limitRaw, sold);
  if (limit !== limitRaw) {
    console.warn(`[oyin] adminUpsertPrize: "${existing?.key}" limiti ${limitRaw} → ${limit} ga ko'tarildi (allaqachon ${sold} ta sotilgan; chipta egalarining ehtimoli jim o'zgarmasin)`);
  }
  if (existing) {
    Object.assign(existing, { name, icon, valueLabel, price, limit, photoUrl });
  } else {
    catalog.push({ key: uniqueCatalogKey(name, catalog), icon, name, valueLabel, price, limit, photoUrl, active: true });
  }
  await saveCatalog(catalog);
  return adminListCatalog();
}

/** Admin: vitrinadan yashirish/qaytarish — chin o'chirishning xavfsiz muqobili. */
export async function adminSetPrizeActive(key: string, active: boolean): Promise<OyinAdminPrizeRow[]> {
  const catalog = await getCatalog();
  const existing = catalog.find((p) => p.key === key);
  if (existing) {
    existing.active = active;
    await saveCatalog(catalog);
  }
  return adminListCatalog();
}

/** Admin: chin o'chirish — FAQAT sotilgan chiptasi yo'q sovrinlar uchun (aks holda active:false tavsiya). */
export async function adminDeletePrize(key: string): Promise<OyinDeleteResult> {
  const [catalog, soldMap] = await Promise.all([getCatalog(), getSoldMap()]);
  if ((soldMap.get(key) ?? 0) > 0) return { ok: false, reason: "has_sales" };
  const next = catalog.filter((p) => p.key !== key);
  if (next.length !== catalog.length) await saveCatalog(next);
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

/** 🧪 TEST o'rni — EGA/ADMIN uchun ALOHIDA hisoblagich (`oyin_sold_test:`). Nega alohida:
 *  ega sinov qilganda mijozlarning tanqis sovrin-o'rinlari YEYILMASLIGI shart. Aks holda
 *  "20 ta chipta bor" deb e'lon qilingan sovrindan 3 tasi eganing sinoviga ketardi va bu
 *  hech qayerda ko'rinmasdi. Limit ham alohida: sinov mijoz limitidan mustaqil. */
async function reserveTestSlot(prizeKey: OyinPrizeKey): Promise<number> {
  const rows = await prisma.$queryRaw<{ value: string }[]>`
    INSERT INTO "AppState" ("key","value","updatedAt")
    VALUES (${`oyin_sold_test:${prizeKey}`}, '1', NOW())
    ON CONFLICT ("key") DO UPDATE
      SET "value" = CAST((CAST("AppState"."value" AS INTEGER) + 1) AS TEXT), "updatedAt" = NOW()
    RETURNING "value"`;
  return Number(rows[0]?.value) || 1;
}

/** 🧪 TEST global raqami — 900000 dan boshlanadi, ya'ni mijoz raqamlari (729475+) bilan
 *  hech qachon TO'QNASHMAYDI va jonli efirda ko'rilganda darhol ajralib turadi. */
async function nextTestTicketNo(): Promise<number> {
  const rows = await prisma.$queryRaw<{ value: string }[]>`
    INSERT INTO "AppState" ("key","value","updatedAt")
    VALUES ('oyin:ticketno:test', '900001', NOW())
    ON CONFLICT ("key") DO UPDATE
      SET "value" = CAST((CAST("AppState"."value" AS INTEGER) + 1) AS TEXT), "updatedAt" = NOW()
    RETURNING "value"`;
  return Number(rows[0]?.value) || 900001;
}

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
  const prize = catalog.find((p) => p.key === prizeKeyRaw && p.active);
  if (!prize) return { ok: false, reason: "unknown_prize" };

  // withMemberLock: bitta a'zoning ketma-ket xaridlarini serializatsiya qiladi — ball-tekshiruv va
  // yechish orasida race bo'lmasin (ikkinchi urinish BIRINCHISI YOZIB BO'LGANDAN keyin ballni o'qiydi).
  // Cross-member xavfsizlik esa yuqoridagi reserveSoldSlot'ning atomik SQL'idan keladi.
  return withMemberLock(memberId, async () => {
    // 🚫 A'ZO O'YINDAN CHETLATILGAN (admin qarori — soxta akkaunt/ferma). Ball yig'ilishi
    // to'xtatilmaydi (tarix buzilmasin), lekin chiptaga AYLANTIRA olmaydi va mavjud chiptalari
    // `drawExport` dan chiqariladi.
    if (await isBanned(memberId)) return { ok: false, reason: "banned" as const, ballLeft: await getBall(memberId) };

    // 🧪 EGA/XODIM — TIRAJDAN TASHQARIDA, LEKIN TO'SILMAYDI (ega qarori 2026-08-03).
    // Avval bu yerda qattiq `reason: "staff"` to'sig'i turardi va ega BUTUN oqimni (ball →
    // chipta → raqam → bayram oynasi → «Chiptalarim») HECH QACHON sinab ko'ra olmasdi —
    // ya'ni mijozga chiqadigan eng muhim yo'l tekshirilmagan holda jo'natilardi.
    // Endi xarid o'tadi, lekin chipta `test:true` bo'ladi:
    //   · `drawExport` uni CHIQARIB TASHLAYDI → "ega o'z tirajida yutdi" imkonsiz;
    //   · alohida hisoblagich (`oyin_sold_test:`) → mijozlarning o'rinlari YEYILMAYDI;
    //   · raqam 900001+ seriyasidan → mijoz raqamlari bilan to'qnashmaydi;
    //   · ekranda ochiq "🧪 TEST" deb turadi → yashirin emas.
    // Ball ROSTAN yechiladi — sinov haqiqiy bo'lishi uchun (admin paneldan qayta qo'shiladi).
    const myTu = await prisma.telegramUser.findFirst({ where: { memberId }, select: { id: true } });
    const isTest = !!(myTu && isAdmin(myTu.id));

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
      .filter((t) => t.prizeKey === prize.key && ticketInSeason(t, season.startMs as number, season.endMs as number))
      .length;
    if (ownCount >= maxOwn) return { ok: false, reason: "own_limit" as const, ballLeft: ball };

    // 🧪 Test xaridi ALOHIDA hisoblagichdan o'rin oladi — mijozlarning `oyin_sold:` soni
    // o'zgarmaydi, ya'ni vitrinada "qoldi N" raqami eganing sinovidan kamaymaydi.
    const ticketNo = isTest ? await reserveTestSlot(prize.key) : await reserveSoldSlot(prize.key, prize.limit);
    if (ticketNo === null) return { ok: false, reason: "sold_out" as const, ballLeft: ball };

    // ⚠️ `reserveSoldSlot` o'rinni ALLAQACHON band qildi. Quyidagi 3 DB operatsiyasidan
    // biri yiqilsa (DB blipi) o'rin abadiy "sotilgan" bo'lib qolardi: chipta yo'q, mijozdan
    // ball ham yechilmagan, sovrin esa limitgacha yetmasdan "tugadi" ko'rinardi.
    // `economyService.releaseWithdrawBudget` naqshi — izoh uni va'da qilardi, kod bajarmasdi.
    try {
      const key = `oyin:tickets:${memberId}`;
      const row = await prisma.appState.findUnique({ where: { key } });
      const tickets = parseTickets(row?.value);
      const gno = isTest ? await nextTestTicketNo() : await nextGlobalTicketNo();
      tickets.push({
        prizeKey: prize.key, no: ticketNo, gno, priceAtPurchase: prize.price,
        ts: new Date().toISOString(), ...(isTest ? { test: true as const } : {}),
      });
      await prisma.appState.upsert({
        where: { key },
        create: { key, value: JSON.stringify(tickets) },
        update: { value: JSON.stringify(tickets) },
      });
      invalidateBallCache();
      return { ok: true, ticketNo, gno, prizeKey: prize.key, ballLeft: ball - prize.price, ...(isTest ? { test: true } : {}) };
    } catch (e) {
      await releaseSoldSlot(prize.key, isTest).catch(() => undefined);
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
export async function markLogin(memberId: number, preview = false): Promise<void> {
  if (!preview && !(await featureOn("oyin"))) return;
  await markDay("oyin:login:", memberId).catch(() => undefined);
}
/** 🏠 Ilova telefon ekraniga o'rnatildi. Telegram'ning `homeScreenAdded` HODISASI yoki
 *  `checkHomeScreenStatus() === "added"` javobidan keyin chaqiriladi — mijoz shunchaki
 *  tugmani bosgani YETARLI EMAS.
 *  ⚠️ Halol eslatma: tasdiq MIJOZ tomonida bo'ladi, ya'ni texnik odam route'ni to'g'ridan
 *  chaqira oladi. Shuning uchun mukofot MAVSUMDA BIR MARTA (real xarajat ~750 so'm) va
 *  `added:false` kelsa belgi OLIB TASHLANADI (o'chirib tashlagan odam ballni saqlab qolmaydi). */
export async function markHomeScreen(memberId: number, added: boolean, preview = false): Promise<{ ok: boolean }> {
  if (!preview && !(await featureOn("oyin"))) return { ok: false };
  const key = `oyin:home:${memberId}`;
  if (!added) {
    await prisma.appState.deleteMany({ where: { key } });
    invalidateBallCache();
    return { ok: true };
  }
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
      totalBall += (econ.oyinReferJoinBall ?? 0) + (r.referrerPaidAt ? (econ.oyinReferFirstRideBall ?? 0) : 0);
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
        memberId: friendId, name: tu ? shortName(tu) : "Mijoz", status, daysSilent, gainToday,
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
  const sent = await notifyUserInitiated(
    bot, friendTu.id, friendMemberId, `oyin_thanks:${memberId}`,
    `🤝 <b>${shortName(myTu)}</b> sizga rahmat aytdi!\n\nSizning safaringiz unga ball olib keldi. Siz ham o'yinga qo'shiling — sovrinlar kutmoqda 🎁`,
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
export async function drawExport(): Promise<OyinDrawExport> {
  const [season, ticketRows, telegramUsers, banRows, freeze] = await Promise.all([
    getSeason(),
    prisma.appState.findMany({ where: { key: { startsWith: "oyin:tickets:" } } }) as Promise<AppStateRow[]>,
    prisma.telegramUser.findMany({ where: { memberId: { not: null } }, select: { memberId: true, firstName: true, lastName: true, username: true } }),
    prisma.appState.findMany({ where: { key: { startsWith: BAN_PREFIX } }, select: { key: true } }),
    getFreeze(),
  ]);
  const empty = { generatedAt: new Date().toISOString(), tickets: [], frozenAt: freeze.at, excludedTest: 0, excludedBanned: 0 };
  if (!season.configured) return empty;
  const nameByMember = new Map<number, string>();
  for (const tu of telegramUsers) if (tu.memberId) nameByMember.set(tu.memberId, shortName(tu));
  const banned = new Set<number>();
  for (const r of banRows) {
    const id = Number(r.key.slice(BAN_PREFIX.length));
    if (Number.isFinite(id)) banned.add(id);
  }

  // 💰 Mavsum filtri MAJBURIY: bo'lmasa o'tgan mavsum egalari jonli tirajda qatnashadi, va
  // `oyin_sold` 1 dan qayta boshlagani uchun ro'yxatda IKKI xil odamda bir xil raqam chiqadi.
  let excludedTest = 0;
  let excludedBanned = 0;
  const tickets = ticketRows.flatMap((row) => {
    const memberId = Number(row.key.slice("oyin:tickets:".length));
    if (!Number.isFinite(memberId)) return [];
    const inSeason = parseTickets(row.value).filter((t) => ticketInSeason(t, season.startMs as number, season.endMs as number));
    // 🚫 Chetlatilgan a'zoning HAMMA chiptasi tirajdan chiqadi — chetlatishning butun ma'nosi shu.
    if (banned.has(memberId)) { excludedBanned += inSeason.length; return []; }
    return inSeason.flatMap((t) => {
      // 🧪 Ega/admin sinov chiptasi TIRAJGA KIRMAYDI. Bu qator "ega o'z tirajida yutdi"
      // sarlavhasining oldini oladigan YAGONA joy — o'chirilsa sinov chiptalari jonli
      // efirdagi ro'yxatga tushib ketadi.
      if (t.test) { excludedTest += 1; return []; }
      return [{
        // ⚠️ `t.no` — sovrin-ichi tartib raqami; mijoz esa ekranida GLOBAL `gno` ni ko'radi.
        // Eksportda `no` qolsa jonli efirda o'qiladigan raqam mijoz qo'lidagi raqam BO'LMAYDI.
        prizeKey: t.prizeKey, ticketNo: t.gno ?? t.no, memberId, name: nameByMember.get(memberId) ?? "Mijoz",
      }];
    });
  });
  tickets.sort((a, b) => a.prizeKey.localeCompare(b.prizeKey) || a.ticketNo - b.ticketNo);
  return { generatedAt: new Date().toISOString(), tickets, frozenAt: freeze.at, excludedTest, excludedBanned };
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
const ARCHIVED_PREFIXES = [
  "oyin:tickets:", "oyin:login:", "oyin:share:", "oyin:sprintwin:",
  "oyin_sold:", "oyin:weeksnap:", "oyin:sprintdone:", "oyin:thanks:",
  "oyin:quest:", "oyin:home:", "oyin:story:", "oyin:goal:",
  "oyin:adj:", "oyin:ban:", "oyin_sold_test:",
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
export async function adminAdjustBall(input: OyinBallAdjustInput): Promise<OyinAdminActionResult> {
  const ball = Math.round(Number(input.ball));
  const reason = (input.reason || "").trim().slice(0, 200);
  if (!Number.isFinite(ball) || ball === 0 || !reason) return { ok: false, reason: "bad_input" };
  const memberId = Number(input.memberId);
  if (!Number.isFinite(memberId)) return { ok: false, reason: "bad_input" };
  const key = `${ADJ_PREFIX}${memberId}`;
  const row = await prisma.appState.findUnique({ where: { key } });
  const cur = parseAdjust(row?.value);
  // Jurnal cheksiz o'smasin — oxirgi 50 tasi saqlanadi (`total` HAMMASINI hisobga oladi).
  const log = [...cur.log, { ball, reason, at: new Date().toISOString() }].slice(-50);
  const value = JSON.stringify({ total: cur.total + ball, log });
  await prisma.appState.upsert({ where: { key }, create: { key, value }, update: { value } });
  invalidateBallCache();
  return { ok: true, ball: await getBall(memberId) };
}

/** 🎟 Chiptani bekor qilish. O'rin QAYTARILADI (test bo'lsa test-hisoblagichga), ball esa o'zi
 *  qaytadi — `spent` chiptalardan JONLI hisoblanadi, ya'ni alohida "qaytarish" operatsiyasi
 *  YO'Q va ikki marta qaytarish imkonsiz. */
export async function adminCancelTicket(memberId: number, gno: number): Promise<OyinAdminActionResult> {
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

/** ⚠️ Sana TUZATISH (arxivsiz) mijoz uchun boshi berk ko'cha yasashi mumkin, chunki ikki hisob
 *  BOSHQA-BOSHQA qoidaga bo'ysunadi:
 *   · mijozning chiptasi MAVSUM OYNASI bo'yicha filtrlanadi (`ticketInSeason`) — oyna siljisa
 *     "Sizniki: 0" bo'lib qoladi;
 *   · `oyin_sold:<key>` esa oddiy HISOBLAGICH, mavsumni bilmaydi — u joyida turadi.
 *  Natija: sovrin "TUGADI" ko'rinadi, mijozda esa chipta yo'q — na sotib oladi, na tirajda
 *  qatnashadi. Hisoblagichni JIMGINA nolga tushirish HAM yaramaydi (haqiqiy chiptalar yetim
 *  qoladi), shuning uchun to'g'ri javob — EGANI OGOHLANTIRISH: bu holatda "Toza boshlash"
 *  tugmasi kerak (u chiptani ham, hisoblagichni ham birga arxivlaydi).
 *  Sxemaga TEGILMAYDI, hech narsa avtomatik o'chirilmaydi — faqat alert (seasonClose naqshi). */
async function alertIfTicketsOrphaned(next: OyinSeasonView): Promise<void> {
  if (!next.configured) return;
  const rows = (await prisma.appState.findMany({ where: { key: { startsWith: "oyin:tickets:" } } })) as AppStateRow[];
  let outside = 0;
  let inside = 0;
  for (const row of rows) {
    for (const t of parseTickets(row.value)) {
      if (ticketInSeason(t, next.startMs as number, next.endMs as number)) inside++;
      else outside++;
    }
  }
  if (!outside) return;
  const soldTotal = [...(await getSoldMap()).values()].reduce((a, b) => a + b, 0);
  const { alertAdmins } = await import("./economyService");
  await alertAdmins(
    `⚠️ <b>Mavsum sanasi o'zgartirildi — ${outside} ta chipta yangi oynadan TASHQARIDA qoldi</b>\n\n` +
    `Oyna ichida: ${inside} ta · tashqarida: ${outside} ta · <code>oyin_sold</code> hisoblagichi: ${soldTotal}\n\n` +
    `Mijozlar shu holatni ko'radi: sovrinlarda «TUGADI» yozuvi turadi (hisoblagich eski xaridlarni ` +
    `sanayapti), o'z chiptalari esa 0 ko'rinadi. Chipta ham, hisoblagich ham birga tozalanishi uchun ` +
    `«🧹 Yangi mavsumni toza boshlash» tugmasidan foydalaning — sana tuzatish uni ALMASHTIRMAYDI.`,
  ).catch(() => undefined);
}

/** Admin: sanani tuzatish (mavsum raqami o'zgarmaydi, arxiv qilinmaydi). */
export async function adminSetSeason(input: OyinSeasonInput): Promise<OyinSeasonView> {
  const s = await setSeason(input);
  invalidateBallCache();
  // Ogohlantirish JAVOBNI kutdirmaydi va yiqilsa sana yozuvini bekor QILMAYDI (u allaqachon
  // muvaffaqiyatli). Xato bo'lsa faqat logga tushadi.
  void alertIfTicketsOrphaned(s).catch((e) => console.error("[oyin] orphan-ticket alert failed:", e));
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
  // Default `season` — jadval reyting bilan KELISHISHI shart (admin "raqamlar to'g'ri kelmayapti"
  // deb aylanmasin). `all` — mavsumgacha bo'lgan tarixni ko'rishning yagona yo'li.
  const seasonScoped = filters.scope !== "all" && season.configured;
  const fromMs = filters.from ? Date.parse(filters.from) : seasonScoped ? (season.startMs as number) : -Infinity;
  const toMs = filters.to ? Date.parse(filters.to) : seasonScoped ? (season.endMs as number) : Infinity;
  // ⚠️ login/share qatorlari UTC yarim tuni bilan yoziladi (pastda), ball esa TOSHKENT kunini
  // sanaydi — 5 soatlik farq mavsum chegarasida jadvalni reytingdan ajratib yuborardi. Shu sababli
  // ular kun-SATRI bo'yicha alohida filtrlanadi.
  const dayFrom = seasonScoped ? (season.startDayKey as string) : null;
  const dayTo = seasonScoped ? (season.endDayKey as string) : null;
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
    const firstInSeasonIdx = seasonScoped ? sorted.findIndex((r) => r.at.getTime() >= fromMs) : 0;
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
        const over = seasonScoped && inWin && paid >= OYIN_STORY_SEASON_LIMIT;
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
