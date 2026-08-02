// 🎮 KOSON O'YINI — ball hisobi, chipta xaridi, reyting, jamoam (feature "oyin", DARK until owner
// QABUL). KOSON_OYIN_PLAN.md v9.2 + KOSON_ADMIN_DOD.md B2. Ball — alohida hisob-kitob birligi,
// Coin/CoinTxn'ga MUTLAQO TEGMAYDI (aralashtirilsa ≤350 clamp semantikasi buzilishi mumkin).
//
// Ball MANBASI: mavjud jadvallardan (RideReward, Referral, TelegramUser) JONLI hisoblanadi — yangi
// "grant" yozuvi yo'q, shuning uchun bookingNotifier.ts ga tegilmaydi (faqat push-hook qo'shiladi,
// pastda ko'ring). Faqat kunlik-kirish/ulashish va chipta-xarid/sotilgan-son AppState'da yoziladi
// (`oyin:*` prefiks). Yangi Prisma model YO'Q, yangi poller YO'Q (ARCHITECTURE.md invariantlari).
import {
  OYIN_PRIZES,
  SEASON_END_ISO,
  SPRINT_MAX_WINS_PER_ROLLING_4W,
  type OyinActivityAction,
  type OyinActivityFilter,
  type OyinActivityResponse,
  type OyinActivityRow,
  type OyinBallBreakdown,
  type OyinBoardResponse,
  type OyinBuyResult,
  type OyinDrawExport,
  type OyinFriendRow,
  type OyinJamoamResponse,
  type OyinPrizeKey,
  type OyinSeasonCloseResult,
  type OyinSprintResult,
  type OyinStateResponse,
  type OyinVitrinaResponse,
} from "@t1067/shared";
import { prisma } from "../db";
import { getBonusEcon } from "./bonusConfig";
import { featureOn } from "./featureFlags";
import { weekKey } from "./missionService";
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
  sprintBonus: 0, earned: 0, spent: 0, ball: 0,
};

interface MemberBallRow {
  memberId: number;
  telegramId: string;
  name: string;
  breakdown: OyinBallBreakdown;
}

interface AppStateRow { key: string; value: string }

interface TicketRecord { prizeKey: OyinPrizeKey; no: number; priceAtPurchase: number; ts: string }

function parseTickets(raw: string | undefined): TicketRecord[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? (arr as TicketRecord[]) : [];
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

// ── ball-xaritasi: BUTUN o'yinchilar populyatsiyasi uchun BIR marta hisoblanadi (loop-ichida-
// loop emas — har komponent bo'yicha bittadan batch-so'rov), 60s kesh bilan. getBall/getBoard/
// getOyinState hammasi shu keshdan o'qiydi — bonusConfig.ts kesh naqshi bilan bir xil. ──────────
let ballMapCache: { at: number; val: Map<number, MemberBallRow> } | null = null;

function invalidateBallCache(): void {
  ballMapCache = null;
}

async function computeBallMap(): Promise<Map<number, MemberBallRow>> {
  if (ballMapCache && Date.now() - ballMapCache.at < 60_000) return ballMapCache.val;
  const econ = await getBonusEcon();

  const [rideCounts, referrals, telegramUsers, ticketRows, loginRows, shareRows, sprintWinRows] = await Promise.all([
    prisma.rideReward.groupBy({ by: ["memberId"], _count: { _all: true } }),
    prisma.referral.findMany({ select: { referrerId: true, refereeMemberId: true, referrerPaidAt: true } }),
    prisma.telegramUser.findMany({
      where: { memberId: { not: null } },
      select: { id: true, memberId: true, phone: true, firstName: true, lastName: true, username: true },
    }),
    prisma.appState.findMany({ where: { key: { startsWith: "oyin:tickets:" } } }) as Promise<AppStateRow[]>,
    prisma.appState.findMany({ where: { key: { startsWith: "oyin:login:" } } }) as Promise<AppStateRow[]>,
    prisma.appState.findMany({ where: { key: { startsWith: "oyin:share:" } } }) as Promise<AppStateRow[]>,
    prisma.appState.findMany({ where: { key: { startsWith: "oyin:sprintwin:" } } }) as Promise<AppStateRow[]>,
  ]);

  const rideCountByMember = new Map<number, number>();
  for (const r of rideCounts) rideCountByMember.set(r.memberId, r._count._all);

  const referBonusByTelegramId = new Map<string, { join: number; milestone: number; rides: number }>();
  for (const r of referrals) {
    const cur = referBonusByTelegramId.get(r.referrerId) ?? { join: 0, milestone: 0, rides: 0 };
    cur.join += 1;
    if (r.referrerPaidAt) cur.milestone += 1;
    if (r.refereeMemberId) cur.rides += rideCountByMember.get(r.refereeMemberId) ?? 0;
    referBonusByTelegramId.set(r.referrerId, cur);
  }

  const spentByMember = new Map<number, number>();
  for (const row of ticketRows) {
    const memberId = Number(row.key.slice("oyin:tickets:".length));
    if (!Number.isFinite(memberId)) continue;
    spentByMember.set(memberId, parseTickets(row.value).reduce((s, t) => s + (t.priceAtPurchase || 0), 0));
  }
  const loginDaysByMember = new Map<number, number>();
  for (const row of loginRows) {
    const memberId = Number(row.key.slice("oyin:login:".length));
    if (Number.isFinite(memberId)) loginDaysByMember.set(memberId, parseDayList(row.value).length);
  }
  const shareDaysByMember = new Map<number, number>();
  for (const row of shareRows) {
    const memberId = Number(row.key.slice("oyin:share:".length));
    if (Number.isFinite(memberId)) shareDaysByMember.set(memberId, parseDayList(row.value).length);
  }
  const sprintWinsByMember = new Map<number, number>();
  for (const row of sprintWinRows) {
    const memberId = Number(row.key.slice("oyin:sprintwin:".length));
    if (Number.isFinite(memberId)) sprintWinsByMember.set(memberId, parseWeekList(row.value).length);
  }

  const map = new Map<number, MemberBallRow>();
  for (const tu of telegramUsers) {
    if (!tu.memberId) continue;
    const memberId = tu.memberId;
    const rides = rideCountByMember.get(memberId) ?? 0;
    const ridesBall = rides > 0 ? (econ.oyinFirstRideBall ?? 0) + (econ.oyinRideBall ?? 0) * (rides - 1) : 0;
    const phoneBall = tu.phone ? (econ.oyinPhoneBall ?? 0) : 0;
    const refer = referBonusByTelegramId.get(tu.id) ?? { join: 0, milestone: 0, rides: 0 };
    const referJoinBall = refer.join * (econ.oyinReferJoinBall ?? 0);
    const referFirstBall = refer.milestone * (econ.oyinReferFirstRideBall ?? 0);
    const referRideBall = refer.rides * (econ.oyinReferRideBall ?? 0);
    const loginBall = (loginDaysByMember.get(memberId) ?? 0) * (econ.oyinDailyLoginBall ?? 0);
    const shareBall = (shareDaysByMember.get(memberId) ?? 0) * (econ.oyinShareBall ?? 0);
    const sprintBall = (sprintWinsByMember.get(memberId) ?? 0) * (econ.oyinSprintBonusBall ?? 0);
    const earned = ridesBall + phoneBall + referJoinBall + referFirstBall + referRideBall + loginBall + shareBall + sprintBall;
    const spent = spentByMember.get(memberId) ?? 0;
    map.set(memberId, {
      memberId,
      telegramId: tu.id,
      name: shortName(tu),
      breakdown: {
        rides: ridesBall, phone: phoneBall, referJoin: referJoinBall, referFirstRide: referFirstBall,
        referRides: referRideBall, login: loginBall, share: shareBall, sprintBonus: sprintBall,
        earned, spent, ball: Math.max(0, earned - spent),
      },
    });
  }
  ballMapCache = { at: Date.now(), val: map };
  return map;
}

/** Bitta a'zoning joriy balli. Ega/xodim ham hisoblanadi (ko'rinadi) — chetlashtirish faqat
 *  chipta/reyting-sovrin darajasida (§ route/UI qatlamida), bu yerda emas. */
export async function getBall(memberId: number): Promise<number> {
  const map = await computeBallMap();
  return map.get(memberId)?.breakdown.ball ?? 0;
}

export async function getOyinState(memberId: number): Promise<OyinStateResponse> {
  const [map, sponsor, econ] = await Promise.all([computeBallMap(), getSponsor(), getBonusEcon()]);
  const mine = map.get(memberId);
  const ranked = [...map.values()].filter((r) => r.breakdown.ball > 0).sort((a, b) => b.breakdown.ball - a.breakdown.ball);
  const rank = mine && mine.breakdown.ball > 0 ? ranked.findIndex((r) => r.memberId === memberId) + 1 : null;
  return {
    ball: mine?.breakdown.ball ?? 0,
    breakdown: mine?.breakdown ?? EMPTY_BREAKDOWN,
    rank,
    sponsor: { name: sponsor.name, photoUrl: sponsor.photoUrl },
    hints: { referComboBall: (econ.oyinReferJoinBall ?? 0) + (econ.oyinReferFirstRideBall ?? 0), rideBall: econ.oyinRideBall ?? 0 },
  };
}

export async function getBoard(memberId: number, limit = 50): Promise<OyinBoardResponse> {
  const map = await computeBallMap();
  const ranked = [...map.values()].filter((r) => r.breakdown.ball > 0).sort((a, b) => b.breakdown.ball - a.breakdown.ball);
  const myIdx = ranked.findIndex((r) => r.memberId === memberId);
  return {
    rows: ranked.slice(0, limit).map((r, i) => ({ pos: i + 1, name: r.name, ball: r.breakdown.ball, me: r.memberId === memberId })),
    myPos: myIdx >= 0 ? myIdx + 1 : null,
  };
}

export async function getVitrina(memberId: number): Promise<OyinVitrinaResponse> {
  const [econ, soldRows, ticketsRow, sponsor] = await Promise.all([
    getBonusEcon(),
    Promise.all(OYIN_PRIZES.map((p) => prisma.appState.findUnique({ where: { key: `oyin_sold:${p.key}` } }))),
    prisma.appState.findUnique({ where: { key: `oyin:tickets:${memberId}` } }),
    getSponsor(),
  ]);
  const mine = parseTickets(ticketsRow?.value);
  const mineByPrize = new Map<string, number>();
  for (const t of mine) mineByPrize.set(t.prizeKey, (mineByPrize.get(t.prizeKey) ?? 0) + 1);

  const prizes = OYIN_PRIZES.map((p, i) => {
    const price = econ[p.priceKnob] ?? 0;
    const limit = econ[p.limitKnob] ?? 0;
    const sold = Number(soldRows[i]?.value ?? 0) || 0;
    const myCount = mineByPrize.get(p.key) ?? 0;
    return {
      key: p.key, icon: p.icon, name: p.name, valueLabel: p.valueLabel,
      price, limit, sold, remaining: Math.max(0, limit - sold), soldOut: sold >= limit,
      mine: myCount, chancePct: myCount > 0 && sold > 0 ? Math.round((myCount / sold) * 10000) / 100 : null,
    };
  });
  return { prizes, sponsor: { name: sponsor.name, photoUrl: sponsor.photoUrl } };
}

// ── chipta xaridi: reserve→tekshir→rollback atomik hisoblagich (economyService.ts
// consumeWithdrawBudget/releaseWithdrawBudget AYNAN shu naqshi, per-prize N-limitga moslangan —
// parallel ikkita a'zo oxirgi o'rinni bir vaqtda olishga urinsa ham HECH QACHON limitdan oshmaydi). ─
async function reserveSoldSlot(prizeKey: OyinPrizeKey, limit: number): Promise<number | null> {
  const key = `oyin_sold:${prizeKey}`;
  await prisma.$executeRaw`
    INSERT INTO "AppState" ("key","value","updatedAt")
    VALUES (${key}, '1', NOW())
    ON CONFLICT ("key") DO UPDATE
      SET "value" = CAST((CAST("AppState"."value" AS INTEGER) + 1) AS TEXT), "updatedAt" = NOW()`;
  const row = await prisma.appState.findUnique({ where: { key } });
  const sold = row ? Number(row.value) || 0 : 0;
  if (sold > limit) {
    await prisma.$executeRaw`
      UPDATE "AppState" SET "value" = CAST((CAST("value" AS INTEGER) - 1) AS TEXT) WHERE "key" = ${key}`;
    return null; // limit to'lgan — bu urinish chipta OLMADI
  }
  return sold; // shu xariddagi ketma-ket chipta raqami (1-based)
}

export async function buyTicket(memberId: number, prizeKeyRaw: string): Promise<OyinBuyResult> {
  if (!(await featureOn("oyin"))) return { ok: false, reason: "off" };
  const prize = OYIN_PRIZES.find((p) => p.key === prizeKeyRaw);
  if (!prize) return { ok: false, reason: "unknown_prize" };

  // withMemberLock: bitta a'zoning ketma-ket xaridlarini serializatsiya qiladi — ball-tekshiruv va
  // yechish orasida race bo'lmasin (ikkinchi urinish BIRINCHISI YOZIB BO'LGANDAN keyin ballni o'qiydi).
  // Cross-member xavfsizlik esa yuqoridagi reserveSoldSlot'ning atomik SQL'idan keladi.
  return withMemberLock(memberId, async () => {
    const econ = await getBonusEcon();
    const price = econ[prize.priceKnob] ?? 0;
    const limit = econ[prize.limitKnob] ?? 0;
    const ball = await getBall(memberId);
    if (ball < price) return { ok: false, reason: "insufficient" as const, ballLeft: ball };

    const ticketNo = await reserveSoldSlot(prize.key, limit);
    if (ticketNo === null) return { ok: false, reason: "sold_out" as const, ballLeft: ball };

    const key = `oyin:tickets:${memberId}`;
    const row = await prisma.appState.findUnique({ where: { key } });
    const tickets = parseTickets(row?.value);
    tickets.push({ prizeKey: prize.key, no: ticketNo, priceAtPurchase: price, ts: new Date().toISOString() });
    await prisma.appState.upsert({
      where: { key },
      create: { key, value: JSON.stringify(tickets) },
      update: { value: JSON.stringify(tickets) },
    });
    invalidateBallCache();
    return { ok: true, ticketNo, prizeKey: prize.key, ballLeft: ball - price };
  });
}

// ── kunlik kirish / ulashish: bitta AppState qatorida kun-ro'yxati (bit-mask o'rniga sodda massiv —
// mavsum ≤31 kun, hajmi arzon). markLogin `GET /api/oyin/state` chaqirilganda chaqiriladi ("miniapp
// ochish" = kirish, ega spetsifikatsiyasi §1) — alohida POST endpoint shart emas. ──────────────────
async function markDay(prefix: "oyin:login:" | "oyin:share:", memberId: number): Promise<boolean> {
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
export async function markLogin(memberId: number): Promise<void> {
  if (!(await featureOn("oyin"))) return;
  await markDay("oyin:login:", memberId).catch(() => undefined);
}
export async function markShare(memberId: number): Promise<{ ok: boolean }> {
  if (!(await featureOn("oyin"))) return { ok: false };
  return { ok: await markDay("oyin:share:", memberId) };
}

// ── Jamoam: chaqiruvchining O'Z do'stlari — kichik va shaxsiy doira, katta populyatsiya-keshidan
// FOYDALANMAYDI (kunlik/faollik holati kerak, kesh buni saqlamaydi). ────────────────────────────
export async function getJamoam(memberId: number): Promise<OyinJamoamResponse> {
  const [econ, myTu] = await Promise.all([getBonusEcon(), prisma.telegramUser.findUnique({ where: { memberId } })]);
  if (!myTu) return { friends: [], totalBall: 0 };

  const referrals = await prisma.referral.findMany({
    where: { referrerId: myTu.id },
    select: { refereeMemberId: true, referrerPaidAt: true },
    orderBy: { createdAt: "desc" },
  });
  const refereeIds = referrals.map((r) => r.refereeMemberId).filter((id): id is number => id != null);
  if (refereeIds.length === 0) return { friends: [], totalBall: 0 };

  const [refereeTus, recentRides] = await Promise.all([
    prisma.telegramUser.findMany({ where: { memberId: { in: refereeIds } }, select: { id: true, memberId: true, firstName: true, lastName: true, username: true } }),
    prisma.rideReward.findMany({
      where: { memberId: { in: refereeIds }, createdAt: { gte: new Date(Date.now() - 14 * 86400_000) } },
      select: { memberId: true, createdAt: true },
    }),
  ]);
  const tuByMemberId = new Map(refereeTus.map((t) => [t.memberId as number, t]));
  const today = tashkentDayKey(new Date());
  const ridesByMember = new Map<number, Date[]>();
  for (const r of recentRides) {
    const arr = ridesByMember.get(r.memberId) ?? [];
    arr.push(r.createdAt);
    ridesByMember.set(r.memberId, arr);
  }

  let totalBall = 0;
  const friends: OyinFriendRow[] = referrals
    .filter((r) => r.refereeMemberId != null)
    .map((r) => {
      const memberId = r.refereeMemberId as number;
      const tu = tuByMemberId.get(memberId);
      const rides = ridesByMember.get(memberId) ?? [];
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
      return { name: tu ? shortName(tu) : "Mijoz", status, daysSilent, gainToday };
    });
  // referRides ulushi ham jami-hisobotga qo'shiladi (barcha 14-kunlik oynadan tashqari safarlar
  // ham HISOBGA kiradi — computeBallMap'dagi haqiqiy jami bilan ziddiyat bo'lmasin, shu yerda
  // faqat ko'rinadigan oynadan hisoblanmaydi, to'liq summa uchun getBall breakdown ishlatiladi).
  const mine = (await computeBallMap()).get(memberId);
  totalBall = mine ? mine.breakdown.referJoin + mine.breakdown.referFirstRide + mine.breakdown.referRides : totalBall;
  return { friends, totalBall };
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
  const wk = weekKey(new Date());
  const trackedRow = await prisma.appState.findUnique({ where: { key: "oyin:sprintweek" } });
  const tracked = trackedRow?.value ?? null;
  if (tracked === wk) return null; // hali shu hafta ichidamiz — baholash keyingi hafta boshida

  const map = await computeBallMap();
  let result: OyinSprintResult | null = null;

  if (tracked) {
    const doneKey = `oyin:sprintdone:${tracked}`;
    const already = await prisma.appState.findUnique({ where: { key: doneKey } });
    if (!already) {
      const snapRow = await prisma.appState.findUnique({ where: { key: `oyin:weeksnap:${tracked}` } });
      if (snapRow) {
        const snap = JSON.parse(snapRow.value) as Record<string, number>;
        const deltas = [...map.entries()]
          .map(([memberId, row]) => ({ memberId, name: row.name, delta: row.breakdown.ball - (snap[String(memberId)] ?? 0) }))
          .filter((d) => d.delta > 0)
          .sort((a, b) => b.delta - a.delta);
        const winners: typeof deltas = [];
        for (const d of deltas) {
          if (winners.length >= 3) break;
          const winsRow = await prisma.appState.findUnique({ where: { key: `oyin:sprintwin:${d.memberId}` } });
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
  const snap: Record<string, number> = {};
  for (const [id, row] of map) snap[String(id)] = row.breakdown.ball;
  const snapKey = `oyin:weeksnap:${wk}`;
  await prisma.appState.upsert({ where: { key: snapKey }, create: { key: snapKey, value: JSON.stringify(snap) }, update: { value: JSON.stringify(snap) } });
  await prisma.appState.upsert({ where: { key: "oyin:sprintweek" }, create: { key: "oyin:sprintweek", value: wk }, update: { value: wk } });

  return result;
}

/** Tiraj uchun raqamlangan chipta-ro'yxati — READ-ONLY (hech narsa yozmaydi), shuning uchun
 *  tabiiy idempotent: necha marta chaqirilsa ham bir xil natija (chiptalar o'zgarmaguncha). */
export async function drawExport(): Promise<OyinDrawExport> {
  const [ticketRows, telegramUsers] = await Promise.all([
    prisma.appState.findMany({ where: { key: { startsWith: "oyin:tickets:" } } }) as Promise<AppStateRow[]>,
    prisma.telegramUser.findMany({ where: { memberId: { not: null } }, select: { memberId: true, firstName: true, lastName: true, username: true } }),
  ]);
  const nameByMember = new Map<number, string>();
  for (const tu of telegramUsers) if (tu.memberId) nameByMember.set(tu.memberId, shortName(tu));

  const tickets = ticketRows.flatMap((row) => {
    const memberId = Number(row.key.slice("oyin:tickets:".length));
    if (!Number.isFinite(memberId)) return [];
    return parseTickets(row.value).map((t) => ({
      prizeKey: t.prizeKey, ticketNo: t.no, memberId, name: nameByMember.get(memberId) ?? "Mijoz",
    }));
  });
  tickets.sort((a, b) => a.prizeKey.localeCompare(b.prizeKey) || a.ticketNo - b.ticketNo);
  return { generatedAt: new Date().toISOString(), tickets };
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
  // `oyin:seasonclosed` markeridan FARQLI, bu tekshiruv har chaqiruvda qayta baholanadi.
  if (Date.now() < Date.parse(SEASON_END_ISO)) return { convertedCount: 0, totalTanga: 0 };
  const doneKey = "oyin:seasonclosed";
  if (await prisma.appState.findUnique({ where: { key: doneKey } })) return { convertedCount: 0, totalTanga: 0 };

  const [map, rideCounts] = await Promise.all([computeBallMap(), prisma.rideReward.groupBy({ by: ["memberId"], _count: { _all: true } })]);
  const hasRide = new Set(rideCounts.map((r) => r.memberId));
  const { grantCoins } = await import("./coinService");

  let convertedCount = 0;
  let totalTanga = 0;
  for (const [memberId, row] of map) {
    if (row.breakdown.ball <= 0 || !hasRide.has(memberId)) continue;
    const tanga = Math.min(500, Math.floor(row.breakdown.ball * 0.5));
    if (tanga <= 0) continue;
    const g = await grantCoins(memberId, tanga, "oyin_convert", "🎮 Koson O'yini — mavsum yakuni, qoldiq ball tangaga aylandi", `oyin_convert:${memberId}`);
    if (g.ok) { convertedCount++; totalTanga += tanga; }
  }
  await prisma.appState.create({ data: { key: doneKey, value: JSON.stringify({ at: new Date().toISOString(), convertedCount, totalTanga }) } }).catch(() => undefined);
  invalidateBallCache();
  return { convertedCount, totalTanga };
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
  const econ = await getBonusEcon();
  const fromMs = filters.from ? Date.parse(filters.from) : -Infinity;
  const toMs = filters.to ? Date.parse(filters.to) : Infinity;

  const [telegramUsers, rideRows, referrals, ticketRows, loginRows, shareRows, sprintWinRows] = await Promise.all([
    prisma.telegramUser.findMany({
      where: { memberId: { not: null } },
      select: { id: true, memberId: true, firstName: true, lastName: true, username: true, phone: true, linkedAt: true },
    }),
    prisma.rideReward.findMany({ select: { memberId: true, bookingId: true, createdAt: true } }),
    prisma.referral.findMany({ select: { referrerId: true, refereeMemberId: true, referrerPaidAt: true, createdAt: true } }),
    prisma.appState.findMany({ where: { key: { startsWith: "oyin:tickets:" } } }) as Promise<AppStateRow[]>,
    prisma.appState.findMany({ where: { key: { startsWith: "oyin:login:" } } }) as Promise<AppStateRow[]>,
    prisma.appState.findMany({ where: { key: { startsWith: "oyin:share:" } } }) as Promise<AppStateRow[]>,
    prisma.appState.findMany({ where: { key: { startsWith: "oyin:sprintwin:" } } }) as Promise<AppStateRow[]>,
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

  for (const [memberId, rides] of ridesByMember) {
    [...rides].sort((a, b) => a.at.getTime() - b.at.getTime()).forEach((r, i) => {
      push(r.at.toISOString(), memberId, i === 0 ? "first_ride" : "ride", i === 0 ? (econ.oyinFirstRideBall ?? 0) : (econ.oyinRideBall ?? 0), null, `#${r.bookingId}`);
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
  const explodeDays = (rowsIn: AppStateRow[], prefix: string, action: OyinActivityAction, ballKnob: number) => {
    for (const row of rowsIn) {
      const memberId = Number(row.key.slice(prefix.length));
      if (!Number.isFinite(memberId)) continue;
      for (const day of parseDayList(row.value)) push(`${day}T00:00:00.000Z`, memberId, action, ballKnob, null, null);
    }
  };
  explodeDays(loginRows, "oyin:login:", "login", econ.oyinDailyLoginBall ?? 0);
  explodeDays(shareRows, "oyin:share:", "share", econ.oyinShareBall ?? 0);
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
