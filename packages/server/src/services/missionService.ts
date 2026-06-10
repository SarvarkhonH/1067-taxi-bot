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
export async function incrementMission(memberId: number, code: string, by = 1): Promise<void> {
  const def = missionByCode(code);
  if (!def) return;
  const key = periodKey(def);
  const existing = await prisma.missionProgress.findUnique({
    where: { memberId_code_periodKey: { memberId, code, periodKey: key } },
  });
  if (existing?.claimedAt) return; // already collected this period
  const next = Math.min(def.target, (existing?.progress ?? 0) + by);
  await prisma.missionProgress.upsert({
    where: { memberId_code_periodKey: { memberId, code, periodKey: key } },
    create: { memberId, code, periodKey: key, progress: next },
    update: { progress: next },
  });
}

function toView(def: MissionDef, progress: number, claimed: boolean): MissionView {
  return {
    code: def.code,
    title: def.title,
    emoji: def.emoji,
    period: def.period,
    target: def.target,
    reward: def.reward,
    progress: Math.min(def.target, progress),
    claimable: progress >= def.target && !claimed,
    claimed,
  };
}

export async function getMissions(memberId: number): Promise<MissionsResponse> {
  const rows = await prisma.missionProgress.findMany({ where: { memberId } });
  const view = (def: MissionDef): MissionView => {
    const key = periodKey(def);
    const row = rows.find((r) => r.code === def.code && r.periodKey === key);
    return toView(def, row?.progress ?? 0, !!row?.claimedAt);
  };
  return {
    daily: MISSIONS.filter((m) => m.period === "daily").map(view),
    weekly: MISSIONS.filter((m) => m.period === "weekly").map(view),
  };
}

/** Collect a completed mission's reward (real cashback, idempotent per period). */
export async function claimMission(memberId: number, code: string): Promise<MissionClaimResponse> {
  const def = missionByCode(code);
  if (!def) return { ok: false, reason: "not_found", reward: 0, applied: false };
  const key = periodKey(def);
  const row = await prisma.missionProgress.findUnique({
    where: { memberId_code_periodKey: { memberId, code, periodKey: key } },
  });
  if (!row || row.progress < def.target) return { ok: false, reason: "not_complete", reward: def.reward, applied: false };
  if (row.claimedAt) return { ok: false, reason: "claimed", reward: def.reward, applied: false };

  // mark claimed first (guards against double-claim races), then pay
  await prisma.missionProgress.update({ where: { id: row.id }, data: { claimedAt: new Date() } });
  const g = await grantCoins(memberId, def.reward, "mission", `Vazifa: ${def.title}`, `mission:${code}:${memberId}:${key}`);
  // dynamic import: weeklyService depends on this module's week/day keys
  await import("./weeklyService")
    .then((w) => w.addScore(memberId, "mission"))
    .catch(() => undefined);
  return { ok: true, reward: def.reward, applied: g.ok };
}
