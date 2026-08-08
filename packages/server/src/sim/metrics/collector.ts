// 📊 Metrika-yig'uvchi: har tik JSONL-qator (metrics/events), Postgres `now()` tamg'alarini
// sim-kunga tuzatish (timestamp-fixup + sentinel-kafolat), run-yakuni DB'dan RunSummary va
// determinizm-DoD uchun metrics.jsonl sha256. DB faqat funksiya ICHIDA dinamik import qilinadi.
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DAY_MS } from "../clock";
import type { RunSummary, SimEvent, TickMetrics, WorldState } from "../types";

// ── 1. Fayl-yozuvchi ──────────────────────────────────────────────────────────
export class MetricsCollector {
  readonly runDir: string;
  private readonly metricsPath: string;
  private readonly eventsPath: string;

  constructor(
    readonly runName: string,
    readonly seed: string,
    outDir: string,
  ) {
    this.runDir = join(outDir, runName);
    mkdirSync(this.runDir, { recursive: true });
    this.metricsPath = join(this.runDir, "metrics.jsonl");
    this.eventsPath = join(this.runDir, "events.jsonl");
    // Qayta yugurishda eski qatorlar aralashmasin (hash-determinizm) — toza fayldan boshlanadi.
    writeFileSync(this.metricsPath, "");
    writeFileSync(this.eventsPath, "");
  }

  writeTick(m: TickMetrics): void {
    appendFileSync(this.metricsPath, JSON.stringify(m) + "\n");
  }

  writeEvent(e: SimEvent): void {
    appendFileSync(this.eventsPath, JSON.stringify(e) + "\n");
  }

  /** Run-yakuni bitta o'qiladigan faylga (ko'p-seed taqqoslash summary.json'lardan yig'iladi). */
  writeSummary(s: RunSummary): void {
    writeFileSync(join(this.runDir, "summary.json"), JSON.stringify(s, null, 2) + "\n");
  }
}

// ── 2. Timestamp-fixup ────────────────────────────────────────────────────────
// Prisma @default(now()) POSTGRES tomonida to'ladi (clock-shim yetmaydi) — olam O'TMISHDA
// yashagani uchun real-hozirdan keyingi har tamg'a = sentinel, uni sim-kunga ko'chiramiz.
const FIXUP_COLUMNS: ReadonlyArray<{ table: string; column: string }> = [
  { table: "RideReward", column: "createdAt" },
  { table: "Referral", column: "createdAt" },
  { table: "CoinTxn", column: "createdAt" },
  { table: "GashtakReward", column: "createdAt" },
  { table: "Member", column: "createdAt" },
  { table: "TelegramUser", column: "createdAt" },
  { table: "TelegramUser", column: "linkedAt" },
];

export async function timestampFixup(sentinelIso: string, simDayIso: string): Promise<void> {
  const { prisma } = await import("../../db");
  const sentinel = new Date(sentinelIso);
  const simDay = new Date(simDayIso);
  for (const { table, column } of FIXUP_COLUMNS) {
    await prisma.$executeRawUnsafe(
      `UPDATE "${table}" SET "${column}" = $1 WHERE "${column}" > $2`,
      simDay,
      sentinel,
    );
  }
  await assertNoSentinel(sentinelIso);
}

/** Fixup-kafolat: birorta jadvalda sentineldan keyingi tamg'a qolmagan bo'lishi SHART. */
export async function assertNoSentinel(sentinelIso: string): Promise<void> {
  const { prisma } = await import("../../db");
  const sentinel = new Date(sentinelIso);
  for (const { table, column } of FIXUP_COLUMNS) {
    const rows = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
      `SELECT COUNT(*)::int AS n FROM "${table}" WHERE "${column}" > $1`,
      sentinel,
    );
    const n = rows[0]?.n ?? 0;
    if (n > 0) {
      throw new Error(
        `[fixup] "${table}"."${column}" da ${n} ta tuzatilmagan sentinel-tamg'a qoldi (> ${sentinelIso})`,
      );
    }
  }
}

// ── 3. Tik-metrikalar (sof — DB yo'q) ─────────────────────────────────────────
export function computeTickMetrics(world: WorldState, tickMs: number): TickMetrics {
  const { cfg, day, agents, todayCounters: c, owner } = world;
  const pop = { aware: 0, installed: 0, linked: 0, rode: 0, habitual: 0, churned: 0, active7: 0 };
  let ticketsTotal = 0;
  let winners = 0;
  let satSum = 0;
  let satN = 0;
  for (const a of agents) {
    if (a.stage !== "unaware") pop[a.stage]++;
    if (a.lastRideDay !== null && day - a.lastRideDay <= 6) pop.active7++;
    ticketsTotal += a.ticketsBought;
    if (a.wonEver) winners++;
    // Kayfiyat — mahsulotni real ishlatayotganlar bo'yicha (o'rnatgan va ketmaganlar).
    if (a.stage === "installed" || a.stage === "linked" || a.stage === "rode" || a.stage === "habitual") {
      satSum += a.satisfaction;
      satN++;
    }
  }
  const ridesAll = c.ridesBirjoy + c.rides1415 + c.rides1313;
  return {
    run: cfg.name,
    seed: cfg.seed,
    day,
    simDate: simDateIso(cfg.t0Iso, day),
    pop,
    rides: {
      birjoy: c.ridesBirjoy,
      d1415: c.rides1415,
      d1313: c.rides1313,
      sharePct: ridesAll > 0 ? round2((c.ridesBirjoy / ridesAll) * 100) : 0,
    },
    money: {
      revenue: owner.revenueTotal,
      prizeSpend: owner.prizeSpendTotal,
      bonusSpend: owner.bonusSpendTotal,
      ownerCash: owner.cash,
      outstandingTangaSom: owner.outstandingTangaSom,
      outstandingBallSom: owner.outstandingBallSom,
      solvency: owner.solvencyStatus,
    },
    // prizesFilled/jamoas — DB-hodisalar, WorldState hisoblamaydi; tik-satrda 0, haqiqat events.jsonl da.
    oyin: { opens: c.gameOpens, ticketsSold: c.ticketsSold, ticketsTotal, prizesFilled: 0, winners, jamoas: 0 },
    funnel: {
      newAware: c.newAware,
      newInstalled: c.newInstalled,
      newLinked: c.newLinked,
      firstRides: c.firstRides,
      referrals: c.referralsAttached,
    },
    mood: {
      avgSatisfaction: satN > 0 ? round2(satSum / satN) : 0,
      churnedToday: c.churnedToday,
      confusionEvents: c.confusionEvents,
    },
    fraud: { attempts: c.fraudAttempts, blocked: c.fraudBlocked },
    slo: { tickMs },
  };
}

// ── 4. Run-yakuni (DB — haqiqat manbai) ───────────────────────────────────────
const BASELINE_MONTHLY_RIDES = 642; // BASELINE.md N1 (iyul 2026)

export async function computeRunSummary(world: WorldState): Promise<RunSummary> {
  const { prisma } = await import("../../db");
  const { cfg, day, agents, owner, todayCounters } = world;
  const t0Ms = Date.parse(cfg.t0Iso);

  const simMemberIds = agents.filter((a) => a.memberId !== null).map((a) => a.memberId as number);
  const simTgIds = agents.filter((a) => a.tgId !== null).map((a) => a.tgId as string);

  // SIM-a'zolarning barcha safarlari (fixup'dan keyin createdAt = sim-kun) — bir so'rov, JS-guruh.
  const rides = simMemberIds.length
    ? await prisma.rideReward.findMany({
        where: { memberId: { in: simMemberIds } },
        select: { memberId: true, createdAt: true },
      })
    : [];
  const daysByMember = new Map<number, number[]>();
  for (const r of rides) {
    const d = Math.floor((r.createdAt.getTime() - t0Ms) / DAY_MS);
    const arr = daysByMember.get(r.memberId);
    if (arr) arr.push(d);
    else daysByMember.set(r.memberId, [d]);
  }

  // Oxirgi 30 sim-kun
  const windowFrom = day - 29;
  let monthlyRides = 0;
  let monthlyRiders = 0;
  // D7/D30 — 1-safar kohortasi (to'liq 30-kunlik kuzatuv oynasi bor a'zolar)
  let cohort = 0;
  let d7 = 0;
  let d30 = 0;
  // 1→2 konversiya (umrbod)
  let riders = 0;
  let repeatRiders = 0;
  for (const memberDays of daysByMember.values()) {
    memberDays.sort((a, b) => a - b);
    riders++;
    if (memberDays.length >= 2) repeatRiders++;
    const inWindow = memberDays.filter((d) => d >= windowFrom && d <= day).length;
    monthlyRides += inWindow;
    if (inWindow > 0) monthlyRiders++;
    const first = memberDays[0]!;
    // D7-kohorta: to'liq 7-kunlik kuzatuv oynasi bor a'zolar (30-kunlik runda ham ishlaydi);
    // D30 faqat first<=day-30 bo'lganlarda (qisqa runda 0 — bu "ma'lumot yo'q", xato emas).
    if (first <= day - 7) {
      cohort++;
      if (memberDays.some((d) => d > first && d <= first + 7)) d7++;
    }
    if (first <= day - 30 && memberDays.some((d) => d > first && d <= first + 30)) d30++;
  }
  const cohort30 = [...daysByMember.values()].filter((ds) => Math.min(...ds) <= day - 30).length;

  // N9: ≥10 safar dumi · N8: 1-oy (kun 0-29) faollaridan 2-oyda (30-59) ham minganlar
  let riders10 = 0;
  let m1Riders = 0;
  let m1AndM2 = 0;
  for (const ds of daysByMember.values()) {
    if (ds.length >= 10) riders10++;
    const inM1 = ds.some((d) => d <= 29);
    if (inM1) {
      m1Riders++;
      if (ds.some((d) => d >= 30 && d <= 59)) m1AndM2++;
    }
  }

  // Link-rate — DB haqiqati: sim bot-userlaridan nechtasi raqam ulagan
  const tgTotal = simTgIds.length
    ? await prisma.telegramUser.count({ where: { id: { in: simTgIds } } })
    : 0;
  const tgLinked = simTgIds.length
    ? await prisma.telegramUser.count({ where: { id: { in: simTgIds }, linkedAt: { not: null } } })
    : 0;

  const ridesAllToday = todayCounters.ridesBirjoy + todayCounters.rides1415 + todayCounters.rides1313;
  return {
    run: cfg.name,
    seed: cfg.seed,
    days: cfg.days,
    finalLinked: tgLinked,
    finalRode: riders,
    monthlyRides,
    monthlyRiders,
    d7Retention: cohort > 0 ? round2((d7 / cohort) * 100) : 0,
    d30Retention: cohort30 > 0 ? round2((d30 / cohort30) * 100) : 0,
    firstToSecondPct: riders > 0 ? round2((repeatRiders / riders) * 100) : 0,
    linkRatePct: tgTotal > 0 ? round2((tgLinked / tgTotal) * 100) : 0,
    linkedToFirstPct: tgLinked > 0 ? round2((riders / tgLinked) * 100) : 0,
    sharePctEnd: ridesAllToday > 0 ? round2((todayCounters.ridesBirjoy / ridesAllToday) * 100) : 0,
    share10Pct: riders > 0 ? round2((riders10 / riders) * 100) : 0,
    ticketsTotal: agents.reduce((sum, a) => sum + a.ticketsBought, 0),
    m2mRetentionPct: day >= 59 && m1Riders > 0 ? round2((m1AndM2 / m1Riders) * 100) : 0,
    ownerCashEnd: owner.cash,
    solvencyEnd: owner.solvencyStatus,
    bankruptDay: owner.bankruptDay,
    growthX: round2(monthlyRides / BASELINE_MONTHLY_RIDES),
  };
}

// ── 5. Determinizm-hash ───────────────────────────────────────────────────────
/** metrics.jsonl sha256 (hex) — `slo` (real devor-soat!) chiqarib tashlanadi, aks holda
 *  bir xil seed ham har yugurishda boshqa hash berardi. `runDir` = sim-out/<run>. */
export function metricsHash(runDir: string): string {
  const raw = readFileSync(join(runDir, "metrics.jsonl"), "utf8");
  const canonical = raw
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => {
      const o = JSON.parse(l) as Record<string, unknown>;
      delete o.slo;
      return JSON.stringify(o);
    })
    .join("\n");
  return createHash("sha256").update(canonical).digest("hex");
}

// ── Yordamchilar ──────────────────────────────────────────────────────────────
function simDateIso(t0Iso: string, day: number): string {
  return new Date(Date.parse(t0Iso) + day * DAY_MS).toISOString().slice(0, 10);
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
