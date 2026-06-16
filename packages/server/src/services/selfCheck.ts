// T8 shield — nightly self-check. Once a day (after 21:00 Tashkent) the existing
// sync tick runs a comprehensive money/health digest and pushes it to admins:
// ledger integrity, negative balances, emission-vs-cap, withdraw budget, stuck
// money-markers. RED issues → loud alert; otherwise a quiet "hammasi joyida"
// heartbeat so the owner knows the watchdog is alive. No new poller — extends
// the sync interval (BUZILMAS qoida: yangi poller yo'q).
import type { Bot } from "grammy";
import { prisma } from "../db";

function dayKey(): string {
  return new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10);
}
function tashkentHour(): number {
  return new Date(Date.now() + 5 * 3600 * 1000).getUTCHours();
}

export interface SelfCheckReport {
  day: string;
  red: boolean;
  issues: string[]; // RED problems (empty = healthy)
  notes: string[]; // informational, not auto-red
  driftCount: number;
  driftTotal: number;
  negativeBalances: number;
  coinLiability: number;
  emissionToday: number;
  emissionCapDay: number;
  withdrawRemaining: number;
  stuckPending: number;
  digest: string; // admin-ready text
}

// Pure classifier — turns the gathered numbers into RED issues + notes. Extracted
// so the RED-detection logic can be unit-tested with synthetic inputs (testSelfCheck).
export interface SelfCheckInputs {
  driftCount: number;
  driftTotal: number;
  negative: number;
  withdrawRemaining: number;
  emissionToday: number;
  emissionCapDay: number;
  redAlerts: string[]; // red-level ops alerts (unassigned, emission-at-cap, …)
  anomalyCount: number;
  pending: number;
}
export function classifySelfCheck(x: SelfCheckInputs): { issues: string[]; notes: string[]; red: boolean } {
  const issues: string[] = [];
  const notes: string[] = [];
  if (x.driftCount > 0) issues.push(`Ledger drift: ${x.driftCount} a'zo (${x.driftTotal.toLocaleString("ru-RU")} tanga) — balans ≠ ledger`);
  if (x.negative > 0) issues.push(`Manfiy balans: ${x.negative} a'zo`);
  if (x.withdrawRemaining < 0) issues.push(`Withdraw byudjet oshib ketdi: ${x.withdrawRemaining.toLocaleString("ru-RU")}`);
  if (x.emissionToday >= x.emissionCapDay) issues.push(`Emissiya tavanda: ${x.emissionToday.toLocaleString("ru-RU")} ≥ ${x.emissionCapDay.toLocaleString("ru-RU")}`);
  for (const a of x.redAlerts) issues.push(a);
  if (x.anomalyCount > 0) notes.push(`${x.anomalyCount} ta katta 24s o'sish — tekshiring`);
  if (x.pending > 0) notes.push(`${x.pending} ta osilgan pul-marker (sweep qayta uradi)`);
  return { issues, notes, red: issues.length > 0 };
}

/** Gathers every money invariant from live data and classifies RED vs healthy. */
export async function runSelfCheck(): Promise<SelfCheckReport> {
  const { getIntegrity } = await import("./reconciliation");
  const { getEconomy } = await import("./adminOps");
  const { getOpsPulse } = await import("./adminModules");
  const [integ, econ, pulse, negative, pending] = await Promise.all([
    getIntegrity(),
    getEconomy(),
    getOpsPulse(),
    prisma.member.count({ where: { coins: { lt: 0 } } }),
    prisma.appState.count({ where: { key: { startsWith: "pending:" } } }),
  ]);

  const { issues, notes, red } = classifySelfCheck({
    driftCount: integ.driftCount,
    driftTotal: integ.driftTotal,
    negative,
    withdrawRemaining: econ.withdrawBudget.remaining,
    emissionToday: pulse.emissionToday,
    emissionCapDay: pulse.emissionCapDay,
    redAlerts: pulse.alerts.filter((x) => x.level === "red").map((a) => a.text),
    anomalyCount: integ.anomalies.length,
    pending,
  });
  const head = red ? `🔴 TUNGI TEKSHIRUV — ${issues.length} muammo` : "🛡 Tungi tekshiruv: hammasi joyida";
  const digest = [
    head,
    `📅 ${dayKey()}`,
    `🪙 majburiyat ${econ.coinsOutstanding.toLocaleString("ru-RU")} · bugun emissiya ${pulse.emissionToday.toLocaleString("ru-RU")}/${pulse.emissionCapDay.toLocaleString("ru-RU")}`,
    `💸 withdraw qoldi ${econ.withdrawBudget.remaining.toLocaleString("ru-RU")} · ledger drift ${integ.driftCount}`,
    ...issues.map((i) => `🔴 ${i}`),
    ...notes.map((n) => `• ${n}`),
  ].join("\n");

  return {
    day: dayKey(),
    red,
    issues,
    notes,
    driftCount: integ.driftCount,
    driftTotal: integ.driftTotal,
    negativeBalances: negative,
    coinLiability: econ.coinsOutstanding,
    emissionToday: pulse.emissionToday,
    emissionCapDay: pulse.emissionCapDay,
    withdrawRemaining: econ.withdrawBudget.remaining,
    stuckPending: pending,
    digest,
  };
}

/** Tick hook: run at most once per Tashkent day, after 21:00. Marker claimed
 *  FIRST so a crash mid-send can't spam admins on the next tick. */
export async function maybeNightlySelfCheck(bot: Bot): Promise<SelfCheckReport | null> {
  if (tashkentHour() < 21) return null; // nightly window
  const key = `selfcheck:${dayKey()}`;
  if (await prisma.appState.findUnique({ where: { key } })) return null;
  await prisma.appState.upsert({ where: { key }, create: { key, value: "1" }, update: { value: "1" } });

  const report = await runSelfCheck();
  const { alertAdmins } = await import("./economyService");
  await alertAdmins(report.digest).catch(() => undefined);
  void bot; // alertAdmins owns the send; bot kept for signature parity with the other tick jobs
  return report;
}
