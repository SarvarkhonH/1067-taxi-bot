// 🎯 Haydovchi topshiriqlari — driver-only daily missions tied to REAL ride performance.
// Definitions live in AppState (key "drvmissions") so the owner edits them from the bot with NO
// schema migration. Progress is computed LIVE from kas (delivered rides today, via getRidesByCar —
// one page covers a day). Reward is tanga, granted idempotently ONCE per driver per day (mission
// emission is outside the ride clamp, like the garage daily). Separate from client missions.
import { prisma } from "../db";
import { grantCoins } from "./coinService";
import { getDataSource } from "../kas";

export type DrvMission = { id: string; emoji: string; title: string; target: number; reward: number; period: "daily"; active: boolean };

const KEY = "drvmissions";
const MAX_REWARD = 10_000; // admin can't mint more than this per mission claim
const DEFAULTS: DrvMission[] = [
  { id: "d5", emoji: "🎯", title: "Bugun 5 safar", target: 5, reward: 300, period: "daily", active: true },
  { id: "d12", emoji: "🔥", title: "Bugun 12 safar", target: 12, reward: 800, period: "daily", active: true },
  { id: "d20", emoji: "💪", title: "Bugun 20 safar", target: 20, reward: 1500, period: "daily", active: true },
];

// Koson is UTC+5 — count a ride against the LOCAL day so late-night rides land correctly.
function kosonDay(at: string | Date): string {
  const d = new Date(at);
  d.setUTCHours(d.getUTCHours() + 5);
  return d.toISOString().slice(0, 10);
}
function todayKoson(): string {
  return kosonDay(new Date());
}

export async function loadMissions(): Promise<DrvMission[]> {
  const row = await prisma.appState.findUnique({ where: { key: KEY } });
  if (!row?.value) return DEFAULTS;
  try {
    const parsed = JSON.parse(row.value) as DrvMission[];
    return Array.isArray(parsed) && parsed.length ? parsed : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}
async function saveMissions(ms: DrvMission[]): Promise<void> {
  await prisma.appState.upsert({ where: { key: KEY }, create: { key: KEY, value: JSON.stringify(ms) }, update: { value: JSON.stringify(ms) } });
}

export interface DriverMissionView extends DrvMission {
  progress: number;
  claimable: boolean;
  claimed: boolean;
}

/** A driver's active missions with LIVE progress (today's delivered rides) + claim state. */
export async function getDriverMissions(driverId: number): Promise<{ missions: DriverMissionView[]; ridesToday: number }> {
  const member = await prisma.member.findUnique({ where: { id: driverId }, select: { type: true, carNumber: true } });
  if (member?.type !== "driver" || !member.carNumber) return { missions: [], ridesToday: 0 };

  const rides = await getDataSource().getRidesByCar(member.carNumber, 60);
  const today = todayKoson();
  const ridesToday = rides.filter((r) => r.status === "delivered" && kosonDay(r.at) === today).length;

  const active = (await loadMissions()).filter((m) => m.active);
  const claimedKeys = await prisma.coinTxn.findMany({
    where: { memberId: driverId, idempotencyKey: { in: active.map((m) => `drvmission:${m.id}:${driverId}:${today}`) } },
    select: { idempotencyKey: true },
  });
  const claimedSet = new Set(claimedKeys.map((c) => c.idempotencyKey));

  const missions = active.map((m) => {
    const claimed = claimedSet.has(`drvmission:${m.id}:${driverId}:${today}`);
    return { ...m, progress: ridesToday, claimable: ridesToday >= m.target && !claimed, claimed };
  });
  return { missions, ridesToday };
}

/** Claim a mission's reward — guarded by ride count + a per-day idempotency key (no double-grant). */
export async function claimDriverMission(driverId: number, missionId: string): Promise<{ ok: boolean; reason?: string; reward?: number }> {
  const { missions } = await getDriverMissions(driverId);
  const m = missions.find((x) => x.id === missionId);
  if (!m) return { ok: false, reason: "not_found" };
  if (m.claimed) return { ok: false, reason: "claimed" };
  if (!m.claimable) return { ok: false, reason: "not_ready" };
  const key = `drvmission:${m.id}:${driverId}:${todayKoson()}`;
  const g = await grantCoins(driverId, Math.min(m.reward, MAX_REWARD), "mission", `Haydovchi topshirig'i: ${m.title}`, key);
  return g.ok ? { ok: true, reward: Math.min(m.reward, MAX_REWARD) } : { ok: false, reason: "failed" };
}

// ── admin (from the bot) ──────────────────────────────────────────────────
export async function adminListMissions(): Promise<DrvMission[]> {
  return loadMissions();
}
export async function adminAddMission(title: string, target: number, reward: number): Promise<{ ok: boolean; reason?: string; id?: string }> {
  if (!title || target <= 0) return { ok: false, reason: "bad_input" };
  if (reward <= 0 || reward > MAX_REWARD) return { ok: false, reason: "bad_reward" };
  const ms = await loadMissions();
  const id = `c${Date.now().toString(36)}`;
  ms.push({ id, emoji: "🎯", title: title.slice(0, 40), target: Math.floor(target), reward: Math.floor(reward), period: "daily", active: true });
  await saveMissions(ms);
  return { ok: true, id };
}
export async function adminToggleMission(id: string, active: boolean): Promise<{ ok: boolean; reason?: string }> {
  const ms = await loadMissions();
  const m = ms.find((x) => x.id === id);
  if (!m) return { ok: false, reason: "not_found" };
  m.active = active;
  await saveMissions(ms);
  return { ok: true };
}
