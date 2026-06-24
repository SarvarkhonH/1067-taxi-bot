import {
  MISSIONS,
  missionByCode,
  type MissionClaimResponse,
  type MissionDef,
  type MissionsResponse,
  type MissionView,
} from "@t1067/shared";
import { prisma } from "../db";
import { grantCoins } from "./coinService";
import { getBonusEcon } from "./bonusConfig";

// mission code → owner-tunable bonus-econ knob (falls back to the catalog reward when unset).
const MISSION_KNOB: Record<string, string> = {
  daily_checkin: "mDailyCheckin", daily_spin: "mDailySpin", daily_ride: "mDailyRide", daily_garage: "mDailyGarage",
  weekly_rides: "mWeeklyRides", weekly_invite: "mWeeklyInvite",
  drv_daily_5: "mDrvDaily5", drv_weekly_25: "mDrvWeekly25", drv_weekly_40: "mDrvWeekly40",
};
function mreward(def: MissionDef, econ: Record<string, number>): number {
  const k = MISSION_KNOB[def.code];
  return k && typeof econ[k] === "number" ? econ[k]! : def.reward;
}

// ─── period keys (tashkent, UTC+5) ────────────────────────────────────────────
function tashkent(d: Date): Date {
  return new Date(d.getTime() + 5 * 3600 * 1000);
}

export function dayKey(d: Date): string {
  return tashkent(d).toISOString().slice(0, 10); // YYYY-MM-DD
}

// ISO-8601 week key, e.g. "2026-W24" (week starts Monday).
export function weekKey(d: Date): string {
  const t = tashkent(d);
  const date = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // shift to the Thursday of this week
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function periodKey(def: MissionDef, now = new Date()): string {
  return def.period === "weekly" ? weekKey(now) : dayKey(now);
}

// ─── progress ─────────────────────────────────────────────────────────────────
/** Bump a mission's counter for the current period (idempotent-safe, capped at target). */
// rideKey (optional): makes the increment IDEMPOTENT per ride — the marker
// create + the upsert run in ONE transaction. A duplicate ride → P2002 on the
// marker → tx rolls back → no double-count. A transient → the tx aborts and the
// caller's resilient() retries the WHOLE tx cleanly. (T4: finish-sweep quests.)
export async function incrementMission(memberId: number, code: string, by = 1, rideKey?: string): Promise<void> {
  const def = missionByCode(code);
  if (!def) return;
  const key = periodKey(def);
  let next = -1;

  if (rideKey) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.appState.create({ data: { key: rideKey, value: "1" } }); // P2002 = this ride already counted
        const existing = await tx.missionProgress.findUnique({ where: { memberId_code_periodKey: { memberId, code, periodKey: key } } });
        if (existing?.claimedAt) {
          next = existing.progress;
          return;
        }
        next = Math.min(def.target, (existing?.progress ?? 0) + by);
        await tx.missionProgress.upsert({
          where: { memberId_code_periodKey: { memberId, code, periodKey: key } },
          create: { memberId, code, periodKey: key, progress: next },
          update: { progress: next },
        });
      });
    } catch (e) {
      if ((e as { code?: string })?.code === "P2002") return; // already counted this ride — idempotent
      throw e; // transient → caller's resilient() retries the atomic tx
    }
  } else {
    const existing = await prisma.missionProgress.findUnique({
      where: { memberId_code_periodKey: { memberId, code, periodKey: key } },
    });
    if (existing?.claimedAt) return; // already collected this period
    next = Math.min(def.target, (existing?.progress ?? 0) + by);
    await prisma.missionProgress.upsert({
      where: { memberId_code_periodKey: { memberId, code, periodKey: key } },
      create: { memberId, code, periodKey: key, progress: next },
      update: { progress: next },
    });
  }
  if (next < 0) return; // claimed-skip path

  // 🔗 daily KOMBO: the moment ALL CORE dailies hit their target, tomorrow's ride
  // roll doubles (Member.comboBoostDay) — the hook that brings them back. Bonus
  // quests (core:false, e.g. garage) are excluded so they neither gate nor trigger it.
  if (def.period === "daily" && def.core !== false && next >= def.target && def.audience !== "driver") {
    try {
      const dailies = MISSIONS.filter((d) => d.period === "daily" && d.audience !== "driver" && d.core !== false);
      const today = dayKey(new Date());
      const rows = await prisma.missionProgress.findMany({
        where: { memberId, periodKey: today, code: { in: dailies.map((d) => d.code) } },
      });
      const allDone = dailies.every((d) => (rows.find((r) => r.code === d.code)?.progress ?? 0) >= d.target);
      if (allDone) {
        const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
        await prisma.member.update({ where: { id: memberId }, data: { comboBoostDay: dayKey(tomorrow) } });
      }
    } catch {
      /* combo is best-effort */
    }
  }
}

function toView(def: MissionDef, progress: number, claimed: boolean, econ: Record<string, number>): MissionView {
  return {
    code: def.code,
    title: def.title,
    emoji: def.emoji,
    period: def.period,
    target: def.target,
    reward: mreward(def, econ),
    progress: Math.min(def.target, progress),
    claimable: progress >= def.target && !claimed,
    claimed,
  };
}

export async function getMissions(memberId: number): Promise<MissionsResponse> {
  const [rows, member, econ] = await Promise.all([
    prisma.missionProgress.findMany({ where: { memberId } }),
    prisma.member.findUnique({ where: { id: memberId }, select: { type: true } }),
    getBonusEcon(),
  ]);
  const audience = member?.type === "driver" ? "driver" : "client";
  const view = (def: MissionDef): MissionView => {
    const key = periodKey(def);
    const row = rows.find((r) => r.code === def.code && r.periodKey === key);
    return toView(def, row?.progress ?? 0, !!row?.claimedAt, econ);
  };
  return {
    daily: MISSIONS.filter((m) => m.period === "daily" && (m.audience ?? "client") === audience).map(view),
    weekly: MISSIONS.filter((m) => m.period === "weekly" && (m.audience ?? "client") === audience).map(view),
  };
}

/** Collect a completed mission's reward (real cashback, idempotent per period). */
export async function claimMission(memberId: number, code: string): Promise<MissionClaimResponse> {
  const def = missionByCode(code);
  if (!def) return { ok: false, reason: "not_found", reward: 0, applied: false };
  const econ = await getBonusEcon();
  const reward = mreward(def, econ); // owner-tunable knob, falls back to the catalog reward
  const key = periodKey(def);
  const row = await prisma.missionProgress.findUnique({
    where: { memberId_code_periodKey: { memberId, code, periodKey: key } },
  });
  if (!row || row.progress < def.target) return { ok: false, reason: "not_complete", reward, applied: false };
  if (row.claimedAt) return { ok: false, reason: "claimed", reward, applied: false };

  // Pay FIRST via the idempotent key (that key — not claimedAt — is the real
  // anti-double-claim guard), THEN stamp claimedAt. Reversed from before so a
  // crash/transient between the two can't leave the mission "claimed" but UNPAID:
  // a retry re-runs the idempotent grant and completes it (duplicate → no double pay).
  const g = await grantCoins(memberId, reward, "mission", `Vazifa: ${def.title}`, `mission:${code}:${memberId}:${key}`);
  if (g.skipped === "duplicate") {
    // a concurrent claim already paid — ensure it's stamped, report as claimed
    await prisma.missionProgress.update({ where: { id: row.id }, data: { claimedAt: row.claimedAt ?? new Date() } }).catch(() => undefined);
    return { ok: false, reason: "claimed", reward, applied: false };
  }
  await prisma.missionProgress.update({ where: { id: row.id }, data: { claimedAt: new Date() } });
  // dynamic import: weeklyService depends on this module's week/day keys
  await import("./weeklyService")
    .then((w) => w.addScore(memberId, "mission"))
    .catch(() => undefined);
  return { ok: true, reward, applied: g.ok };
}
