// T7 Admin 3.0 — the two "deep-knowing" widgets the owner asked for, built only
// from real data already in the system (kas reports + CoinTxn + Withdrawal + Corp):
//   M1 getOpsPulse()  — today vs same-weekday-last-week + live alerts.
//   M2 getFinance()   — coin liability, real cashout, withdraw budget/queue, GMV, B2B.
// READ-ONLY: neither grants, spends, nor mutates anything (no money path).
import type { AdminFinance, OpsAlert, OpsPulse, OpsPulseMetric, WithdrawQueueRow } from "@t1067/shared";
import { prisma } from "../db";
import { getDataSource } from "../kas";
import { recentReports } from "./analyticsService";
import { getEconomy } from "./adminOps";

const DONE = new Set(["delivered", "completed", "finished"]); // kas terminal vocab (probe 2026-06-12)
const isCancel = (s: string) => s.startsWith("cancel"); // cancel_by_operator | cancel_by_server
const UZ_WEEKDAYS = ["Yakshanba", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba"];
const EMISSION_SOFT_CAP_DAY = 200_000; // soft daily client-emission ceiling — drives the amber/red alert
const WEEK_MS = 7 * 24 * 3600 * 1000;
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

// ─── M1: operations pulse ────────────────────────────────────────────────────
export async function getOpsPulse(): Promise<OpsPulse> {
  const now = Date.now();
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const m0 = midnight.getTime();
  const elapsed = now - m0; // ms since local midnight
  const prevStart = m0 - WEEK_MS; // same weekday last week, midnight
  const prevEnd = prevStart + elapsed; // same elapsed hours → fair like-for-like compare
  // NOTE: the "prev" (last-week) numbers are only as deep as recentReports() reaches.
  // Under kas rate-limiting that window can be shallow (today-heavy) → prev≈0; the
  // widget then shows today's absolute numbers honestly and the delta degrades to "▲ N".

  let rows: Awaited<ReturnType<typeof recentReports>> = [];
  let reportsStale = false;
  try {
    rows = await recentReports();
  } catch {
    reportsStale = true;
  }

  let doneToday = 0;
  let donePrev = 0;
  let cancelToday = 0;
  let cancelPrev = 0;
  for (const r of rows) {
    const t = Date.parse(r.at);
    if (!Number.isFinite(t)) continue;
    const done = DONE.has(r.status);
    const cancel = isCancel(r.status);
    if (t >= m0 && t <= now) {
      if (done) doneToday++;
      else if (cancel) cancelToday++;
    } else if (t >= prevStart && t <= prevEnd) {
      if (done) donePrev++;
      else if (cancel) cancelPrev++;
    }
  }

  const [botToday, botPrev, emAgg, active] = await Promise.all([
    prisma.rideReward.count({ where: { createdAt: { gte: midnight } } }),
    prisma.rideReward.count({ where: { createdAt: { gte: new Date(prevStart), lte: new Date(prevEnd) } } }),
    prisma.coinTxn.aggregate({ where: { amount: { gt: 0 }, createdAt: { gte: midnight } }, _sum: { amount: true } }),
    getDataSource().listActiveBookings().catch(() => []),
  ]);
  const emissionToday = Math.round(emAgg._sum.amount ?? 0);
  const activeNow = active.length;
  const unassigned = active.filter((b) => !b.carNumber).length;

  const cancelPctToday = pct(cancelToday, doneToday + cancelToday);
  const cancelPctPrev = pct(cancelPrev, donePrev + cancelPrev);

  const metrics: OpsPulseMetric[] = [
    { label: "Safarlar", today: doneToday, prev: donePrev, unit: "count", goodWhen: "up" },
    { label: "Bot ulushi", today: pct(botToday, doneToday), prev: pct(botPrev, donePrev), unit: "pct", goodWhen: "up" },
    { label: "Bekor", today: cancelPctToday, prev: cancelPctPrev, unit: "pct", goodWhen: "down" },
  ];

  const alerts: OpsAlert[] = [];
  if (unassigned >= 6) alerts.push({ level: "red", text: `${unassigned} ta buyurtma haydovchisiz — tezda biriktiring` });
  else if (unassigned >= 3) alerts.push({ level: "amber", text: `${unassigned} ta buyurtma hali haydovchisiz` });
  if (emissionToday >= EMISSION_SOFT_CAP_DAY)
    alerts.push({ level: "red", text: `Bugungi tanga emissiyasi tavanda (${emissionToday.toLocaleString("ru-RU")} ≥ ${EMISSION_SOFT_CAP_DAY.toLocaleString("ru-RU")})` });
  else if (emissionToday >= 0.8 * EMISSION_SOFT_CAP_DAY)
    alerts.push({ level: "amber", text: `Tanga emissiyasi tavanga yaqin (${pct(emissionToday, EMISSION_SOFT_CAP_DAY)}%)` });
  if (cancelPctToday >= 30 && doneToday + cancelToday >= 10) alerts.push({ level: "amber", text: `Bekor qilish yuqori: ${cancelPctToday}%` });
  if (reportsStale) alerts.push({ level: "amber", text: "kas hisobotlari yuklanmadi — puls qisman" });

  return {
    weekday: UZ_WEEKDAYS[new Date().getDay()]!,
    metrics,
    activeNow,
    unassigned,
    emissionToday,
    emissionCapDay: EMISSION_SOFT_CAP_DAY,
    alerts,
    reportsStale,
  };
}

// ─── M2: finance center (real money only — no speculative P&L) ───────────────
export async function getFinance(): Promise<AdminFinance> {
  const econ = await getEconomy();
  const now = Date.now();
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const m0 = midnight.getTime();

  let rows: Awaited<ReturnType<typeof recentReports>> = [];
  try {
    rows = await recentReports();
  } catch {
    /* GMV stays 0 if kas reports unavailable */
  }
  let gmvToday = 0;
  let gmvWeek = 0;
  for (const r of rows) {
    if (!DONE.has(r.status)) continue;
    const t = Date.parse(r.at);
    if (!Number.isFinite(t)) continue;
    if (t >= now - WEEK_MS) gmvWeek += r.payment || 0;
    if (t >= m0) gmvToday += r.payment || 0;
  }

  const [failed, corps] = await Promise.all([
    prisma.withdrawal.findMany({
      where: { kasApplied: false },
      orderBy: { createdAt: "desc" },
      take: 25,
      include: { member: { select: { fullName: true } } },
    }),
    prisma.corpAccount.findMany({ include: { _count: { select: { employees: true } } } }),
  ]);

  const withdrawQueue: WithdrawQueueRow[] = failed.map((w) => ({
    member: w.member.fullName,
    amount: w.amount,
    ageMin: Math.round((now - w.createdAt.getTime()) / 60000),
    failed: true, // kasApplied=false → the cashout never reached kas
    message: w.kasMessage,
  }));

  const corpBalances = corps.map((c) => ({ name: c.name, balance: c.balance, employees: c._count.employees }));
  const corpTotal = corpBalances.reduce((s, c) => s + c.balance, 0);

  const dayBudget = econ.withdrawBudget.total;
  const daysToCoverLiability = dayBudget > 0 ? Math.round(econ.coinsOutstanding / dayBudget) : null;

  return {
    coinLiability: econ.coinsOutstanding,
    liabilityByKind: econ.byKind.filter((k) => k.total > 0).slice(0, 8),
    withdrawnToday: econ.withdrawnToday,
    withdrawnTotal: econ.withdrawnTotal,
    withdrawBudget: econ.withdrawBudget,
    gmvToday: Math.round(gmvToday),
    gmvWeek: Math.round(gmvWeek),
    daysToCoverLiability,
    withdrawQueue,
    corpBalances,
    corpTotal,
  };
}
