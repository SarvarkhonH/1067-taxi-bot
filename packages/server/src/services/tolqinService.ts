// 🎮 V4 — "Yashil to'lqin" skill game (taxi lane-dodge endless-runner). Pays TANGA only,
// never cash. The payout safety valve = a HARD DAILY CAP scaled by the player's real rides
// this week (rewards real customers, not grinders). Even a cheater reporting max score is
// bounded by the cap. One-time token = anti-replay; grant is idempotent by that token.
import { randomBytes } from "node:crypto";
import { prisma } from "../db";
import { getCoins, grantCoins } from "./coinService";

const SCORE_PER_TANGA = 120; // skill→tanga rate (fun first, tanga is a small bonus)
const PER_RUN_MAX = 12; // most tanga a single run can pay
const BASE_DAILY_CAP = 15; // tanga/day floor from the game
const PER_RIDE_BONUS = 3; // +cap per real ride this week
const MAX_RIDE_BONUS = 25; // ride-bonus ceiling → max daily cap 40
const TOKEN_TTL_MS = 15 * 60_000;

function tashkentDayStart(): Date {
  const tk = new Date(Date.now() + 5 * 3600_000);
  return new Date(Date.UTC(tk.getUTCFullYear(), tk.getUTCMonth(), tk.getUTCDate()) - 5 * 3600_000);
}

export async function startTolqinRun(memberId: number): Promise<{ token: string }> {
  const token = randomBytes(12).toString("hex");
  await prisma.appState.create({ data: { key: `tolqintok:${token}`, value: String(memberId) } });
  return { token };
}

export interface TolqinResult {
  ok: boolean;
  reason?: string;
  granted: number;
  dailyCap: number;
  todayEarned: number;
  roomLeft: number;
  coins: number;
}

export async function finishTolqinRun(memberId: number, token: string, score: number): Promise<TolqinResult> {
  score = Math.max(0, Math.floor(Number(score) || 0));
  const fail = async (reason: string): Promise<TolqinResult> => ({
    ok: false,
    reason,
    granted: 0,
    dailyCap: 0,
    todayEarned: 0,
    roomLeft: 0,
    coins: await getCoins(memberId),
  });

  const row = await prisma.appState.findUnique({ where: { key: `tolqintok:${token}` } });
  if (!row || row.value !== String(memberId)) return fail("bad_token");
  if (Date.now() - row.updatedAt.getTime() > TOKEN_TTL_MS) {
    await prisma.appState.deleteMany({ where: { key: `tolqintok:${token}` } });
    return fail("expired");
  }

  // ride-scaled daily cap — real customers earn more room; idle grinders hit the floor.
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600_000);
  const rides = await prisma.rideReward.count({ where: { memberId, createdAt: { gte: weekAgo } } });
  const dailyCap = BASE_DAILY_CAP + Math.min(rides * PER_RIDE_BONUS, MAX_RIDE_BONUS);

  const today = await prisma.coinTxn.aggregate({
    where: { memberId, kind: "tolqin", createdAt: { gte: tashkentDayStart() } },
    _sum: { amount: true },
  });
  const todayEarned = today._sum.amount ?? 0;
  const room = Math.max(0, dailyCap - todayEarned);

  const raw = Math.min(PER_RUN_MAX, Math.floor(score / SCORE_PER_TANGA));
  const granted = Math.min(raw, room);

  // consume the one-time token (anti-replay) BEFORE the grant; grant is also idempotent by token.
  await prisma.appState.deleteMany({ where: { key: `tolqintok:${token}` } });
  if (granted > 0) {
    await grantCoins(memberId, granted, "tolqin", "🎮 Yashil to'lqin", `tolqin:${token}`);
  }
  return {
    ok: true,
    granted,
    dailyCap,
    todayEarned: todayEarned + granted,
    roomLeft: room - granted,
    coins: await getCoins(memberId),
  };
}
