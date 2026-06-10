// Economic governance: ties REAL-MONEY-OUT (withdrawals) to REAL taxi revenue
// so the reward economy can never outrun the business. The daily global
// withdraw budget = BASE + completedRides × PER_RIDE. If ride volume drops, the
// budget shrinks → withdrawals throttle. Coins can still be minted internally
// (games), but they can only be cashed out within this revenue-backed pool.
import { env } from "../env";
import { prisma } from "../db";
import { getDataSource } from "../kas";

// Tunable via env. Defaults sized to ~200 rides/day (kas mainReports baseline).
const BASE_BUDGET = Number(process.env.WITHDRAW_BASE_BUDGET) || 20_000; // floor at low volume
const PER_RIDE_BUDGET = Number(process.env.WITHDRAW_PER_RIDE) || 300; // so'm of withdrawal each completed ride backs

function tashkentDay(d = new Date()): string {
  return new Date(d.getTime() + 5 * 3600 * 1000).toISOString().slice(0, 10);
}
const usedKey = (day: string) => `wbudget_used:${day}`;

export interface WithdrawBudget {
  total: number;
  used: number;
  remaining: number;
  rides: number; // the revenue signal driving it
}

/** Today's revenue-backed withdrawal budget (global, all users). */
export async function getWithdrawBudget(): Promise<WithdrawBudget> {
  let rides = 0;
  try {
    rides = (await getDataSource().getMainReport()).completedYesterday;
  } catch {
    /* kas unreachable → fall back to floor only (fail-safe: smaller budget) */
  }
  const total = BASE_BUDGET + rides * PER_RIDE_BUDGET;
  const row = await prisma.appState.findUnique({ where: { key: usedKey(tashkentDay()) } });
  const used = row ? Number(row.value) || 0 : 0;
  return { total, used, remaining: Math.max(0, total - used), rides };
}

/** Atomically reserve `amount` from today's budget. Returns false if it doesn't fit. */
export async function consumeWithdrawBudget(amount: number): Promise<boolean> {
  const day = tashkentDay();
  const { total } = await getWithdrawBudget();
  // atomic add, then verify we stayed within budget; roll back if we overshot
  const key = usedKey(day);
  await prisma.$executeRaw`
    INSERT INTO "AppState" ("key","value","updatedAt")
    VALUES (${key}, ${String(amount)}, NOW())
    ON CONFLICT ("key") DO UPDATE
      SET "value" = CAST((CAST("AppState"."value" AS DOUBLE PRECISION) + ${amount}) AS TEXT), "updatedAt" = NOW()`;
  const row = await prisma.appState.findUnique({ where: { key } });
  const used = row ? Number(row.value) || 0 : 0;
  if (used > total) {
    // roll back — over budget
    await prisma.$executeRaw`
      UPDATE "AppState" SET "value" = CAST((CAST("value" AS DOUBLE PRECISION) - ${amount}) AS TEXT) WHERE "key" = ${key}`;
    return false;
  }
  return true;
}

export async function releaseWithdrawBudget(amount: number): Promise<void> {
  const key = usedKey(tashkentDay());
  await prisma.$executeRaw`
    UPDATE "AppState" SET "value" = CAST(GREATEST(0, CAST("value" AS DOUBLE PRECISION) - ${amount}) AS TEXT) WHERE "key" = ${key}`.catch(
    () => undefined,
  );
}

// ─── admin alerting (every withdraw + anomalies) ───────────────────────────────
let notifier: ((telegramId: string, html: string) => Promise<void>) | null = null;
export function registerAdminNotifier(fn: (telegramId: string, html: string) => Promise<void>): void {
  notifier = fn;
}

export async function alertAdmins(html: string): Promise<void> {
  if (!notifier) return;
  for (const id of env.adminIds) {
    await notifier(id, `🔔 ${html}`).catch(() => undefined);
  }
}
