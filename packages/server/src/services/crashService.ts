import crypto from "node:crypto";
import {
  CRASH_JACKPOT_FEED_PCT,
  CRASH_ROUND_MAX_MS,
  CRASH_STAKES,
  crashMultiplierAt,
  deriveCrashPoint,
  type CrashCashoutResponse,
  type CrashStartResponse,
} from "@t1067/shared";
import { prisma } from "../db";
import { getCoins, grantCoins, spendCoins } from "./coinService";

const u32 = () => crypto.randomBytes(4).readUInt32BE(0) & 0x7fffffff; // 31-bit → fits Postgres Int4
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export async function startCrash(memberId: number, stake: number): Promise<CrashStartResponse> {
  const coins = await getCoins(memberId);
  const jackpot = await (await import("./weeklyService")).getJackpot();
  if (!(CRASH_STAKES as readonly number[]).includes(stake)) return { ok: false, reason: "bad_stake", stake, coins, jackpot };

  // one live round at a time — auto-settle any abandoned one as a loss first
  await settleAbandoned(memberId);

  const escrow = await spendCoins(memberId, stake, "crash", `Tezlik garovi (${stake})`);
  if (!escrow.ok) return { ok: false, reason: "insufficient", stake, coins: escrow.balance, jackpot };

  const seed = u32();
  const crashPoint = deriveCrashPoint(seed);
  const serverHash = sha(String(seed));
  const round = await prisma.crashRound.create({ data: { memberId, stake, seed, serverHash, crashPoint, status: "live" } });
  const newJackpot = await (await import("./weeklyService")).growJackpot(Math.floor(stake * CRASH_JACKPOT_FEED_PCT));
  return { ok: true, roundId: round.id, serverHash, stake, coins: escrow.balance, jackpot: newJackpot };
}

export async function cashoutCrash(memberId: number, roundId: string): Promise<CrashCashoutResponse> {
  const { getJackpot, claimJackpot } = await import("./weeklyService");
  const r = await prisma.crashRound.findUnique({ where: { id: roundId } });
  const fail = async (reason: string): Promise<CrashCashoutResponse> => ({
    ok: false,
    reason,
    multiplier: 0,
    crashPoint: r?.crashPoint ?? 0,
    won: false,
    payout: 0,
    coins: await getCoins(memberId),
    jackpot: await getJackpot(),
    golden: false,
  });
  if (!r || r.memberId !== memberId) return fail("not_found");
  if (r.status !== "live") return fail("already_settled");

  // server-authoritative multiplier from elapsed time
  const elapsed = Date.now() - r.createdAt.getTime();
  const mult = crashMultiplierAt(elapsed);
  const won = mult < r.crashPoint && elapsed < CRASH_ROUND_MAX_MS;

  // settle exactly once
  const claimed = await prisma.crashRound.updateMany({ where: { id: r.id, status: "live" }, data: { status: "settled", settledAt: new Date() } });
  if (claimed.count === 0) return fail("already_settled");

  let payout = 0;
  let golden = false;
  if (won) {
    payout = Math.floor(r.stake * mult);
    await grantCoins(memberId, payout, "crash", `Tezlik ${mult.toFixed(2)}x`, `crash_win:${r.id}`);
    // 1-in-50 jackpot drop on a winning cashout ≥2x — claim AFTER the base win,
    // and credit via its own idempotent grant so the pool is never silently lost.
    if (mult >= 2 && r.seed % 50 === 0) {
      const pool = await claimJackpot();
      const j = await grantCoins(memberId, pool, "crash", "JACKPOT 🎰", `crash_jackpot:${r.id}`);
      if (j.ok) {
        payout += pool;
        golden = true;
      }
    }
  }
  await prisma.crashRound.update({ where: { id: r.id }, data: { multiplier: won ? mult : null, payout, golden } });

  return {
    ok: true,
    multiplier: won ? mult : crashMultiplierAt(elapsed),
    crashPoint: r.crashPoint,
    seed: r.seed,
    won,
    payout,
    coins: await getCoins(memberId),
    jackpot: await getJackpot(),
    golden,
  };
}

/** Settle any round left live past the max duration as a loss (escrow already taken). */
async function settleAbandoned(memberId: number): Promise<void> {
  const cutoff = new Date(Date.now() - CRASH_ROUND_MAX_MS);
  await prisma.crashRound.updateMany({
    where: { memberId, status: "live", createdAt: { lt: cutoff } },
    data: { status: "settled", settledAt: new Date(), multiplier: null },
  });
}
