import crypto from "node:crypto";
import {
  DUEL_OPEN_TTL,
  DUEL_RUN_TTL,
  DUEL_STAKES,
  RACE_BURN_PCT,
  RACE_MAX_MS,
  RACE_MIN_MS,
  RACE_SCORE_TOLERANCE,
  formatNumber,
  raceChecksum,
  scoreRun,
  type DuelCreateResponse,
  type DuelListResponse,
  type DuelRunBody,
  type DuelRunResponse,
} from "@t1067/shared";
import { prisma } from "../db";
import { getCoins, grantCoins, spendCoins } from "./coinService";
import type { Notify } from "./weeklyService";

const u31 = () => crypto.randomBytes(4).readUInt32BE(0) & 0x7fffffff;

/** Challenger stakes coins and gets a course; their run opens the duel. */
export async function createDuel(memberId: number, stake: number): Promise<DuelCreateResponse> {
  if (!(DUEL_STAKES as readonly number[]).includes(stake)) {
    return { ok: false, reason: "bad_stake", stake, coins: await getCoins(memberId) };
  }
  const escrow = await spendCoins(memberId, stake, "duel", `Duel garovi (${stake})`);
  if (!escrow.ok) return { ok: false, reason: "insufficient", stake, coins: escrow.balance };

  const duel = await prisma.duel.create({
    data: { stake, seed: u31(), challengerId: memberId, chToken: crypto.randomUUID(), status: "created" },
  });
  return { ok: true, duelId: duel.id, seed: duel.seed, token: duel.chToken, stake, coins: escrow.balance };
}

/** Opponent stakes coins on an open duel and gets the SAME course. */
export async function acceptDuel(memberId: number, duelId: string): Promise<DuelCreateResponse> {
  const d = await prisma.duel.findUnique({ where: { id: duelId } });
  const coins = await getCoins(memberId);
  if (!d || d.status !== "open" || d.challengerId === memberId) return { ok: false, reason: "bad_stake", stake: d?.stake ?? 0, coins };

  const escrow = await spendCoins(memberId, d.stake, "duel", `Duel qabul (${d.stake})`);
  if (!escrow.ok) return { ok: false, reason: "insufficient", stake: d.stake, coins: escrow.balance };

  const opToken = crypto.randomUUID();
  const claimed = await prisma.duel.updateMany({
    where: { id: duelId, status: "open" },
    data: { status: "accepted", opponentId: memberId, opToken, acceptedAt: new Date() },
  });
  if (claimed.count === 0) {
    // someone else accepted first — refund
    await grantCoins(memberId, d.stake, "duel", "Duel band — garov qaytdi", `duel_race_refund:${duelId}:${memberId}`);
    return { ok: false, reason: "bad_stake", stake: d.stake, coins: await getCoins(memberId) };
  }
  return { ok: true, duelId, seed: d.seed, token: opToken, stake: d.stake, coins: escrow.balance };
}

/** Validate a run (challenger or opponent) and settle when both have raced. */
export async function submitDuelRun(memberId: number, b: DuelRunBody): Promise<DuelRunResponse> {
  const base = async (reason: string, role: "challenger" | "opponent" = "challenger"): Promise<DuelRunResponse> => ({
    ok: false,
    reason,
    role,
    myScore: 0,
    theirScore: null,
    settled: false,
    won: false,
    tie: false,
    pot: 0,
    coins: await getCoins(memberId),
  });

  const d = await prisma.duel.findUnique({ where: { id: b.duelId } });
  if (!d) return base("not_found");
  const isChallenger = d.chToken === b.token && d.challengerId === memberId;
  const isOpponent = d.opToken === b.token && d.opponentId === memberId;
  if (!isChallenger && !isOpponent) return base("bad_token");
  const role = isChallenger ? "challenger" : "opponent";

  if (isChallenger && d.status !== "created") return base("already_ran", role);
  if (isOpponent && d.status !== "accepted") return base("already_ran", role);
  if (b.durationMs < RACE_MIN_MS || b.durationMs > RACE_MAX_MS) return base("bad_duration", role);
  if (!Array.isArray(b.inputs) || b.inputs.length > 4000 || raceChecksum(b.inputs) !== b.checksum) return base("checksum", role);
  const sr = scoreRun(d.seed, b.inputs);
  if (Math.abs(sr.score - b.score) / Math.max(1, sr.score) > RACE_SCORE_TOLERANCE) return base("implausible", role);

  const bumpRaceMissions = () =>
    import("./missionService")
      .then(async (m) => {
        await m.incrementMission(memberId, "daily_race");
        await m.incrementMission(memberId, "weekly_races");
      })
      .catch(() => undefined);

  if (isChallenger) {
    const claimed = await prisma.duel.updateMany({
      where: { id: d.id, status: "created" },
      data: { status: "open", chScore: sr.score, openedAt: new Date() },
    });
    if (claimed.count === 0) return base("already_ran", role);
    await bumpRaceMissions();
    return { ok: true, role, myScore: sr.score, theirScore: null, settled: false, won: false, tie: false, pot: 0, coins: await getCoins(memberId) };
  }

  // opponent run → settle
  const claimed = await prisma.duel.updateMany({
    where: { id: d.id, status: "accepted" },
    data: { status: "settled", opScore: sr.score, settledAt: new Date(), chNotified: false },
  });
  if (claimed.count === 0) return base("already_ran", role);
  await bumpRaceMissions();

  const chScore = d.chScore ?? 0;
  const tie = sr.score === chScore;
  const winnerId = tie ? null : sr.score > chScore ? memberId : d.challengerId;
  let pot = 0;
  if (tie) {
    // both stakes back
    await grantCoins(memberId, d.stake, "duel", "Duel durang — garov qaytdi", `duel_tie_op:${d.id}`);
    await grantCoins(d.challengerId, d.stake, "duel", "Duel durang — garov qaytdi", `duel_tie_ch:${d.id}`);
  } else {
    const burned = Math.floor(d.stake * 2 * RACE_BURN_PCT);
    pot = d.stake * 2 - burned;
    await grantCoins(winnerId!, pot, "duel", "Duel g'alabasi", `duel_win:${d.id}`);
    const w = await import("./weeklyService");
    await w.growJackpot(burned).catch(() => undefined);
    await w.addScore(winnerId!, "race").catch(() => undefined);
  }
  await prisma.duel.update({ where: { id: d.id }, data: { winnerId, pot } });

  return {
    ok: true,
    role,
    myScore: sr.score,
    theirScore: chScore,
    settled: true,
    won: winnerId === memberId,
    tie,
    pot,
    coins: await getCoins(memberId),
  };
}

export async function listDuels(memberId: number): Promise<DuelListResponse> {
  const [open, mine] = await Promise.all([
    prisma.duel.findMany({
      where: { status: "open", challengerId: { not: memberId } },
      orderBy: { createdAt: "desc" },
      take: 15,
      include: { challenger: { select: { fullName: true } } },
    }),
    prisma.duel.findMany({
      where: { OR: [{ challengerId: memberId }, { opponentId: memberId }] },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { challenger: { select: { fullName: true } }, opponent: { select: { fullName: true } } },
    }),
  ]);
  return {
    stakes: [...DUEL_STAKES],
    open: open.map((d) => ({
      duelId: d.id,
      stake: d.stake,
      challengerName: d.challenger.fullName,
      ageMin: Math.round((Date.now() - d.createdAt.getTime()) / 60000),
    })),
    mine: mine.map((d) => {
      const isCh = d.challengerId === memberId;
      return {
        duelId: d.id,
        stake: d.stake,
        status: d.status,
        role: isCh ? ("challenger" as const) : ("opponent" as const),
        myScore: isCh ? d.chScore : d.opScore,
        theirScore: d.status === "settled" ? (isCh ? d.opScore : d.chScore) : null,
        opponentName: isCh ? (d.opponent?.fullName ?? null) : d.challenger.fullName,
        won: d.status === "settled" ? (d.winnerId === null ? null : d.winnerId === memberId) : null,
        pot: d.pot,
      };
    }),
  };
}

/** Periodic sweeps: expire stale states + push results to challengers. */
export async function sweepDuels(notify: Notify): Promise<void> {
  const now = Date.now();
  // challenger never ran → refund
  for (const d of await prisma.duel.findMany({ where: { status: "created", createdAt: { lt: new Date(now - DUEL_RUN_TTL) } }, take: 30 })) {
    const f = await prisma.duel.updateMany({ where: { id: d.id, status: "created" }, data: { status: "refunded" } });
    if (f.count) await grantCoins(d.challengerId, d.stake, "duel", "Duel bekor — garov qaytdi", `duel_refund_ch:${d.id}`);
  }
  // opponent accepted but never ran → refund opponent, reopen the duel
  for (const d of await prisma.duel.findMany({ where: { status: "accepted", acceptedAt: { lt: new Date(now - DUEL_RUN_TTL) } }, take: 30 })) {
    const f = await prisma.duel.updateMany({
      where: { id: d.id, status: "accepted" },
      data: { status: "open", opponentId: null, opToken: null, acceptedAt: null },
    });
    if (f.count && d.opponentId) await grantCoins(d.opponentId, d.stake, "duel", "Duel muddati o'tdi — garov qaytdi", `duel_refund_op:${d.id}:${d.opponentId}`);
  }
  // nobody accepted within 24h → refund challenger
  for (const d of await prisma.duel.findMany({ where: { status: "open", openedAt: { lt: new Date(now - DUEL_OPEN_TTL) } }, take: 30 })) {
    const f = await prisma.duel.updateMany({ where: { id: d.id, status: "open" }, data: { status: "refunded" } });
    if (f.count) await grantCoins(d.challengerId, d.stake, "duel", "Duel'ga raqib chiqmadi — garov qaytdi", `duel_refund_open:${d.id}`);
  }
  // notify challengers about settled duels
  const settled = await prisma.duel.findMany({
    where: { status: "settled", chNotified: false },
    take: 20,
    include: { challenger: { include: { telegramUser: true } }, opponent: { select: { fullName: true } } },
  });
  for (const d of settled) {
    await prisma.duel.update({ where: { id: d.id }, data: { chNotified: true } });
    const chatId = d.challenger.telegramUser?.id;
    if (!chatId) continue;
    const won = d.winnerId === d.challengerId;
    const tie = d.winnerId === null;
    const text = tie
      ? `⚔️ Duel durang! ${d.opponent?.fullName ?? "Raqib"} bilan teng — garovingiz qaytdi.`
      : won
        ? `⚔️ <b>Duel g'alabasi!</b> 🏆\n${d.opponent?.fullName ?? "Raqib"} sizning balingizdan o'tolmadi.\n🪙 <b>+${formatNumber(d.pot)} coin</b> hamyoningizga tushdi!`
        : `⚔️ Duel yutqazildi 😔\n${d.opponent?.fullName ?? "Raqib"} balingizdan o'tdi (${d.opScore} vs ${d.chScore}).\nRevansh oling — yangi chaqiriq tashlang!`;
    await notify(chatId, text).catch(() => undefined);
  }
}
