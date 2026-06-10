// TEZLIK — a crash game (Aviator skin): your taxi accelerates, the multiplier
// climbs, you tap CASH OUT before the engine "stalls". Provably fair (server
// publishes sha256(seed) up front, reveals seed on settle) and fully
// server-authoritative: the multiplier is derived from elapsed server time, so
// the client can't forge it.

export const CRASH_STAKES = [200, 500, 2000] as const;
export const CRASH_MAX_MULT = 20.0; // payout cap → bounds liability
export const CRASH_GROWTH_K = 0.18; // multiplier = e^(k * seconds); ~2x at 3.85s
export const CRASH_EDGE = 0.05; // 5% house edge baked into the crash distribution
export const CRASH_JACKPOT_FEED_PCT = 0.05; // 5% of each stake → shared jackpot pool
export const CRASH_ROUND_MAX_MS = 30_000; // a round can't run longer than this

/** Multiplier at a given elapsed time (deterministic curve, shared by UI + server). */
export function crashMultiplierAt(elapsedMs: number): number {
  const m = Math.exp(CRASH_GROWTH_K * (elapsedMs / 1000));
  return Math.min(CRASH_MAX_MULT, Math.floor(m * 100) / 100);
}

/** Crash point from a seed: heavy-tailed, house edge, small instant-bust chance. */
export function deriveCrashPoint(seed: number): number {
  const u = (seed >>> 0) / 4294967296; // [0,1)
  if (u < CRASH_EDGE) return 1.0; // instant stall
  const raw = (1 - CRASH_EDGE) / (1 - u);
  return Math.min(CRASH_MAX_MULT, Math.max(1.0, Math.floor(raw * 100) / 100));
}

export interface CrashStartResponse {
  ok: boolean;
  reason?: "bad_stake" | "insufficient";
  roundId?: string;
  serverHash?: string; // sha256(seed) — commit, verify after reveal
  stake: number;
  coins: number;
  jackpot: number;
}

export interface CrashCashoutResponse {
  ok: boolean;
  reason?: string;
  multiplier: number; // where the player cashed (server-computed)
  crashPoint: number; // where it would have stalled (revealed)
  seed?: number; // revealed for provably-fair check
  won: boolean;
  payout: number;
  coins: number;
  jackpot: number;
  golden: boolean; // hit the jackpot drop
}
