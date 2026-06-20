// 🎰 BARABAN — post-ride spin wheel. When a ride FINISHES the rider gets a token
// valid for 5 minutes + an immediate bot notification (fired from the bookingNotifier
// finish sweep — NO new poller). They spin once in the bot and win REAL tanga.
//
// MONEY: the win is granted via grantCoins (NOT grantRideCoins) so it lives OUTSIDE
// the 350/ride clamp. The clamp in grantRideCoins sums CoinTxns whose idempotencyKey
// ENDS with `:<memberId>:<bookingId>`; our win key is `baraban:win:g<m>b<b>` — the
// `g`/`b` letters break that `:id:id` tail, so this faucet can never be swept into the
// ride-clamp aggregate. (Verified by testRideWheel: the key must NOT end `:<m>:<b>`.)
//
// IDEMPOTENT: exactly one spin/win per ride token. The token (AppState
// `barabantoken:<memberId>`) carries {bookingId, expiresAt, used}; a used/expired token
// is rejected. The CoinTxn unique idempotencyKey is the hard money guard — even if two
// spins raced the same token, only one grant can land.
import { prisma } from "../db";
import { grantCoins } from "./coinService";

const TOKEN_TTL_MS = 5 * 60_000; // 5 minutes
const tokenKey = (memberId: number): string => `barabantoken:${memberId}`;

export interface WheelToken {
  bookingId: number;
  expiresAt: number; // epoch ms
  used: boolean;
}

// EXACT owner-approved prize table (sums to 1.0). cumProb is the running upper bound
// for a [0,1) Math.random() roll. The leftover ~0.28% (table without the roll-in below
// sums to 0.9972) is folded into the 100 bucket so the cumulative reaches exactly 1.0.
// EV = 100*.3828 + 200*.27 + 300*.17 + 500*.09 + 1000*.04 + 5000*.007 + 100000*.0002
//    = 38.28 + 54 + 51 + 45 + 40 + 35 + 20 = 283.28 tanga per spin.
export interface BarabanPrize {
  amount: number;
  prob: number;
}
export const BARABAN_PRIZES: readonly BarabanPrize[] = [
  { amount: 0, prob: 0.04 },
  { amount: 100, prob: 0.38 + 0.0028 }, // 0.38 + the 0.28% roll-in → 0.3828
  { amount: 200, prob: 0.27 },
  { amount: 300, prob: 0.17 },
  { amount: 500, prob: 0.09 },
  { amount: 1000, prob: 0.04 },
  { amount: 5000, prob: 0.007 },
  { amount: 100000, prob: 0.0002 }, // jackpot
] as const;

/** Cumulative-probability roll. Server code → Math.random is allowed here (it is only
 *  forbidden inside Workflow scripts). Returns the won tanga amount (0 = no win). */
export function rollBarabanPrize(rnd: number = Math.random()): number {
  let cum = 0;
  for (const p of BARABAN_PRIZES) {
    cum += p.prob;
    if (rnd < cum) return p.amount;
  }
  // floating-point guard: if rnd rounded just past the last bound, fall into the 100 bucket
  return 100;
}

async function readToken(memberId: number): Promise<WheelToken | null> {
  const row = await prisma.appState.findUnique({ where: { key: tokenKey(memberId) } });
  if (!row) return null;
  try {
    const t = JSON.parse(row.value) as WheelToken;
    if (typeof t.bookingId !== "number" || typeof t.expiresAt !== "number") return null;
    return t;
  } catch {
    return null;
  }
}

async function writeToken(memberId: number, t: WheelToken): Promise<void> {
  const value = JSON.stringify(t);
  await prisma.appState.upsert({
    where: { key: tokenKey(memberId) },
    update: { value },
    create: { key: tokenKey(memberId), value },
  });
}

/** Grant a fresh 5-minute spin token for a just-finished ride. One token per ride:
 *  finishing a new ride REPLACES any previous token (the upsert overwrites). Idempotent
 *  per (member,booking): re-running for the SAME ride (sweep re-entry) keeps the existing
 *  unused token instead of resetting the clock or un-using a spent one. */
export async function grantWheelToken(memberId: number, bookingId: number): Promise<WheelToken> {
  const existing = await readToken(memberId);
  if (existing && existing.bookingId === bookingId) {
    // same ride re-processed by the sweep — don't reset the timer or revive a used token
    return existing;
  }
  const t: WheelToken = { bookingId, expiresAt: Date.now() + TOKEN_TTL_MS, used: false };
  await writeToken(memberId, t);
  return t;
}

export interface WheelStatus {
  valid: boolean; // a fresh, unused, unexpired token exists
  expiresAt?: number;
  bookingId?: number;
}

/** Is there a spinnable token right now? */
export async function getWheelStatus(memberId: number): Promise<WheelStatus> {
  const t = await readToken(memberId);
  if (!t || t.used || t.expiresAt <= Date.now()) return { valid: false };
  return { valid: true, expiresAt: t.expiresAt, bookingId: t.bookingId };
}

export interface SpinResult {
  ok: boolean;
  prize?: number; // tanga won (0 = spun but no win)
  reason?: "no_token" | "expired" | "used";
}

/** Spin the post-ride wheel. Validates the token, rolls the prize, grants REAL tanga
 *  via grantCoins (OUTSIDE the 350/ride clamp), and marks the token used either way.
 *  Idempotent: the CoinTxn unique key `baraban:win:g<m>b<b>` blocks any second grant on
 *  the same ride even under a race; a used/expired token is rejected up front. */
export async function spinRideWheel(memberId: number): Promise<SpinResult> {
  const t = await readToken(memberId);
  if (!t) return { ok: false, reason: "no_token" };
  if (t.used) return { ok: false, reason: "used" };
  if (t.expiresAt <= Date.now()) return { ok: false, reason: "expired" };

  const prize = rollBarabanPrize();
  // Mark used FIRST so a crash after the grant can't leave the token spinnable again.
  // The CoinTxn unique key is the real money guard (one grant per ride), so even if this
  // write and the grant interleave, the win can land at most once.
  await writeToken(memberId, { ...t, used: true });

  if (prize > 0) {
    // clamp-safe key: the `g`/`b` letters mean it can NEVER end `:<memberId>:<bookingId>`,
    // so grantRideCoins' aggregate (which sums keys ending that way) never counts it.
    const key = `baraban:win:g${memberId}b${t.bookingId}`;
    await grantCoins(memberId, prize, "baraban", "🎰 Baraban yutug'i", key);
  }
  return { ok: true, prize };
}
