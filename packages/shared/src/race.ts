// 1067 POYGA — deterministic lane-dodge taxi race.
//
// One source of truth, run in BOTH the browser (live play) and the server
// (authoritative re-scoring for anti-cheat). Same seed → identical obstacle
// course → a recorded run ("ghost") replays exactly, so players race real
// other clients' best runs without any realtime server.

export const RACE_STAKES = [300, 1000, 5000] as const;
export const RACE_BURN_PCT = 0.1; // house edge on a win → feeds the jackpot pool
export const RACE_MIN_MS = 6_000; // a finish faster than this is impossible → cheat
export const RACE_MAX_MS = 120_000; // hard ceiling (tab left open)
export const RACE_SESSION_TTL = 10 * 60_000; // escrow auto-refund deadline
export const RACE_SCORE_TOLERANCE = 0.04; // client/server score must agree within 4%

export const RACE_LANES = 3;
export const RACE_TICKS = 620; // course length in fixed steps
export const RACE_TICK_MS = 50; // 20 fps fixed timestep (≈31s course)
export const RACE_CRASH_PENALTY = 60; // score lost per obstacle hit
export const RACE_BASE_SPEED = 10;
export const RACE_SPEED_RAMP = 0.03; // speed gained per tick survived

// ─── deterministic PRNG (mulberry32) ──────────────────────────────────────────
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Obstacle lane for each tick (or -1 = no obstacle). Never blocks the whole
 * road; density ramps up so later ticks are harder. Pure function of the seed.
 */
export function buildCourse(seed: number): number[] {
  const rng = mulberry32(seed);
  const course: number[] = [];
  for (let t = 0; t < RACE_TICKS; t++) {
    const density = 0.18 + (t / RACE_TICKS) * 0.4; // 18% → 58%
    course.push(rng() < density ? Math.floor(rng() * RACE_LANES) : -1);
  }
  return course;
}

// Inputs are a flat list of lane-change events: [tick, lane, tick, lane, …].
export function laneAtTick(inputs: number[], tick: number): number {
  let lane = 1; // start centre
  for (let i = 0; i + 1 < inputs.length; i += 2) {
    if (inputs[i]! <= tick) lane = inputs[i + 1]!;
    else break;
  }
  return lane;
}

export interface RaceScore {
  score: number;
  hits: number;
  ticks: number;
}

/**
 * Authoritative scoring. Walk the course, apply the player's lane timeline,
 * accumulate survival distance, subtract crash penalties. The server trusts
 * THIS over any client-reported score.
 */
export function scoreRun(seed: number, inputs: number[]): RaceScore {
  const course = buildCourse(seed);
  let score = 0;
  let hits = 0;
  let speed = RACE_BASE_SPEED;
  for (let t = 0; t < RACE_TICKS; t++) {
    const lane = laneAtTick(inputs, t);
    if (course[t] === lane) {
      hits++;
      score -= RACE_CRASH_PENALTY;
      speed = RACE_BASE_SPEED; // a crash kills your momentum
    } else {
      speed += RACE_SPEED_RAMP;
      score += speed;
    }
  }
  return { score: Math.max(0, Math.round(score)), hits, ticks: RACE_TICKS };
}

/** FNV-1a hash of the input list — cheap tamper check (recomputed server-side). */
export function raceChecksum(inputs: number[]): string {
  let h = 0x811c9dc5;
  for (const n of inputs) {
    h ^= n & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (n >>> 8) & 0xff;
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

// ─── DTOs ─────────────────────────────────────────────────────────────────────
export interface RaceStartResponse {
  ok: boolean;
  reason?: "bad_stake" | "insufficient";
  sessionId?: string;
  seed?: number;
  token?: string;
  stake: number;
  ghost?: { name: string; score: number; inputs: number[] } | null;
  coins: number;
  jackpot: number;
}

export interface RaceFinishBody {
  sessionId: string;
  token: string;
  inputs: number[];
  durationMs: number;
  score: number; // advisory; server recomputes
  checksum: string;
}

export interface RaceFinishResponse {
  ok: boolean;
  reason?: string;
  serverScore: number;
  ghostScore: number;
  won: boolean;
  reward: number; // coins paid (0 on loss)
  burned: number;
  coins: number; // new balance
  jackpot: number;
}

export interface RaceBoardEntry {
  rank: number;
  name: string;
  score: number;
  isMe: boolean;
}

export interface RaceBoardResponse {
  stake: number;
  stakes: number[];
  entries: RaceBoardEntry[];
  myBest: number | null;
  plays: number;
}
