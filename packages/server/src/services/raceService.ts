import crypto from "node:crypto";
import {
  RACE_BURN_PCT,
  RACE_MAX_MS,
  RACE_MIN_MS,
  RACE_SCORE_TOLERANCE,
  RACE_SESSION_TTL,
  RACE_STAKES,
  raceChecksum,
  scoreRun,
  type RaceBoardResponse,
  type RaceFinishBody,
  type RaceFinishResponse,
  type RaceStartResponse,
} from "@t1067/shared";
import { prisma } from "../db";
import { getCoins, grantCoins, spendCoins } from "./coinService";

const u32 = () => crypto.randomBytes(4).readUInt32BE(0) & 0x7fffffff; // 31-bit → fits Postgres Int4

/** Stake coins and get a course + a real opponent's ghost run to race against. */
export async function startRace(memberId: number, stake: number): Promise<RaceStartResponse> {
  const coins = await getCoins(memberId);
  const jackpot = await (await import("./weeklyService")).getJackpot();
  if (!(RACE_STAKES as readonly number[]).includes(stake)) {
    return { ok: false, reason: "bad_stake", stake, coins, jackpot };
  }
  const escrow = await spendCoins(memberId, stake, "race", `Poyga garovi (${stake})`);
  if (!escrow.ok) return { ok: false, reason: "insufficient", stake, coins: escrow.balance, jackpot };

  // pick a ghost: a real OTHER client's run at this stake, random from the top window
  const pool = await prisma.raceResult.findMany({
    where: { stake, memberId: { not: memberId } },
    orderBy: { score: "desc" },
    take: 40,
    include: { member: { select: { fullName: true } } },
  });
  const g = pool.length ? pool[Math.floor(Math.random() * pool.length)]! : null;
  const ghost = g ? { name: g.member.fullName, score: g.score, inputs: JSON.parse(g.inputs) as number[] } : null;

  const seed = u32();
  const token = crypto.randomUUID();
  const session = await prisma.raceSession.create({
    data: { memberId, stake, seed, token, ghostId: g?.id ?? null, status: "created" },
  });

  return { ok: true, sessionId: session.id, seed, token, stake, ghost, coins: escrow.balance, jackpot };
}

/** Validate + re-score the run server-side, settle the stake. Idempotent. */
export async function finishRace(memberId: number, b: RaceFinishBody): Promise<RaceFinishResponse> {
  const { getJackpot, growJackpot, addScore } = await import("./weeklyService");
  const fail = async (reason: string): Promise<RaceFinishResponse> => ({
    ok: false,
    reason,
    serverScore: 0,
    ghostScore: 0,
    won: false,
    reward: 0,
    burned: 0,
    coins: await getCoins(memberId),
    jackpot: await getJackpot(),
  });

  const s = await prisma.raceSession.findUnique({ where: { id: b.sessionId } });
  if (!s || s.memberId !== memberId) return fail("not_found");
  if (s.token !== b.token) return fail("bad_token");
  if (s.status !== "created") return fail("already_finished");
  if (Date.now() - s.createdAt.getTime() > RACE_SESSION_TTL) return fail("timeout");
  if (b.durationMs < RACE_MIN_MS || b.durationMs > RACE_MAX_MS) return fail("bad_duration");
  if (!Array.isArray(b.inputs) || b.inputs.length > 4000 || raceChecksum(b.inputs) !== b.checksum) return fail("checksum");

  // server-authoritative score — client value is advisory only
  const sr = scoreRun(s.seed, b.inputs);
  if (Math.abs(sr.score - b.score) / Math.max(1, sr.score) > RACE_SCORE_TOLERANCE) return fail("implausible");

  // burn the session exactly once (wins the double-submit race)
  const claimed = await prisma.raceSession.updateMany({
    where: { id: s.id, status: "created" },
    data: { status: "finished", finishedAt: new Date() },
  });
  if (claimed.count === 0) return fail("already_finished");

  const ghost = s.ghostId ? await prisma.raceResult.findUnique({ where: { id: s.ghostId } }) : null;
  const won = !ghost || sr.score > ghost.score; // beat the ghost (or no ghost yet = free win)
  const burned = Math.floor(s.stake * RACE_BURN_PCT);
  let reward = 0;
  if (won) {
    reward = s.stake * 2 - burned; // own stake back + opponent-equivalent − house burn
    await grantCoins(memberId, reward, "race", "Poyga g'alabasi", `race_win:${s.token}`);
  }

  await prisma.raceResult.create({
    data: {
      sessionId: s.id,
      memberId,
      stake: s.stake,
      score: sr.score,
      hits: sr.hits,
      durationMs: b.durationMs,
      inputs: JSON.stringify(b.inputs),
      won,
    },
  });

  const jackpot = await growJackpot(burned > 0 ? burned : Math.floor(s.stake * 0.05));
  if (won) await addScore(memberId, "race").catch(() => undefined);
  await import("./missionService")
    .then(async (m) => {
      await m.incrementMission(memberId, "daily_race");
      await m.incrementMission(memberId, "weekly_races");
    })
    .catch(() => undefined);

  return {
    ok: true,
    serverScore: sr.score,
    ghostScore: ghost?.score ?? 0,
    won,
    reward,
    burned,
    coins: await getCoins(memberId),
    jackpot,
  };
}

export async function getRaceBoard(memberId: number, stake: number): Promise<RaceBoardResponse> {
  const valid = (RACE_STAKES as readonly number[]).includes(stake) ? stake : RACE_STAKES[1];
  const rows = await prisma.raceResult.findMany({
    where: { stake: valid },
    orderBy: { score: "desc" },
    take: 20,
    include: { member: { select: { id: true, fullName: true } } },
  });
  // best score per member (dedupe)
  const seen = new Set<number>();
  const entries: RaceBoardResponse["entries"] = [];
  for (const r of rows) {
    if (seen.has(r.memberId)) continue;
    seen.add(r.memberId);
    entries.push({ rank: entries.length + 1, name: r.member.fullName, score: r.score, isMe: r.memberId === memberId });
  }
  const mine = await prisma.raceResult.aggregate({ where: { stake: valid, memberId }, _max: { score: true }, _count: true });
  return {
    stake: valid,
    stakes: [...RACE_STAKES],
    entries,
    myBest: mine._max.score ?? null,
    plays: mine._count,
  };
}

/** Periodic: refund stakes for sessions never finished within the TTL. */
export async function refundStaleRaces(): Promise<number> {
  const cutoff = new Date(Date.now() - RACE_SESSION_TTL);
  const stale = await prisma.raceSession.findMany({ where: { status: "created", createdAt: { lt: cutoff } }, take: 50 });
  let refunded = 0;
  for (const s of stale) {
    const flipped = await prisma.raceSession.updateMany({ where: { id: s.id, status: "created" }, data: { status: "refunded" } });
    if (flipped.count === 0) continue;
    await grantCoins(s.memberId, s.stake, "race", "Poyga bekor — garov qaytdi", `race_refund:${s.id}`);
    refunded++;
  }
  return refunded;
}
