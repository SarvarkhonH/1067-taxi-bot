import type { KasDataSource } from "./types";
import { compareShadow, ProblemLog, type ShadowDiff } from "@t1067/shared";

// ─── Shadow mode ──────────────────────────────────────────────────────────────
//
// Run kas1067 and the taxi core side by side, ask both the same question, and
// write down where they disagree — before a cutover, not after. The boot guard
// on KAS_MODE=birjoy names this as the thing it is waiting for.
//
// Three rules, and the first two are the whole safety story:
//
//  1. The CALLER ALWAYS GETS THE PRIMARY'S ANSWER. The shadow's reply is never
//     returned, never merged, never used to "fill in" a gap. A shadow that can
//     change an answer is not a shadow, it is an untested cutover.
//
//  2. WRITES ARE NEVER SHADOWED. Only the methods listed below are compared;
//     everything else — creating a booking, cancelling one, moving a balance,
//     renaming a customer — goes to the primary alone. Doubling a write would
//     create two real orders, or move money twice.
//
//     A method nobody has listed is treated as a write. That is deliberate: the
//     day somebody adds one to the interface, the safe default is silence.
//
//  3. The shadow call cannot slow or break the caller. It is not awaited, it
//     has its own timeout, and it swallows everything.
//
// Sampled, because the point is to learn the shape of the disagreement, not to
// double the load on a system we have not cut over to yet.

/** Read-only methods. Anything not here is a write and is never shadowed. */
const READ_METHODS = new Set([
  "fetchMembers",
  "fetchByPhone",
  "checkClient",
  "searchAddresses",
  "getAllAddresses",
  "getBookingAddons",
  "getActiveBooking",
  "listActiveBookings",
  "getRideHistory",
  "getRidesByCar",
  "getDriverPins",
  "getDriverByCar",
  "getReportsPage",
  "listDriverRoster",
  "getDriverAccount",
  "getTariff",
  "getCompanyInfo",
  "getServiceArea",
  "getMainReport",
  "getCarModels",
  "getBonusRules",
]);

export interface ShadowStats {
  startedAt: string;
  /** Per method: how many comparisons ran, and how many found a real difference. */
  methods: Record<string, { compared: number; differed: number; lastProblem?: string }>;
  /** Shadow calls that threw or timed out — a source that cannot answer is itself a finding. */
  errors: Record<string, number>;
  /** Times kas1067 could not answer, and how often the taxi core could have. */
  primaryDown: Record<string, { failed: number; shadowServed: number }>;
}

const SHADOW_TIMEOUT_MS = 8_000;

export class ShadowRecorder {
  readonly stats: ShadowStats = { startedAt: new Date().toISOString(), methods: {}, errors: {}, primaryDown: {} };

  /** Each distinct disagreement is printed once; the rest are counted. */
  private readonly printed = new ProblemLog();

  record(diff: ShadowDiff): void {
    const m = (this.stats.methods[diff.method] ??= { compared: 0, differed: 0 });
    const first = m.compared === 0;
    m.compared++;

    // The first comparison of a method says so EITHER WAY, once, forever.
    //
    // Without this, agreement is silent and so is a shadow that never ran — a
    // method nobody calls, a URL that 404s, a sample rate that never comes
    // round. Those look identical to "the two sources agree", which is the one
    // conclusion this whole exercise exists to earn rather than assume.
    if (first) {
      console.warn(
        `[shadow] FIRST ${diff.method}: ${diff.ok ? "agreed" : "DIFFERS"} ` +
        `(${diff.checked} fields checked${diff.expected.length ? `, ${diff.expected.length} expected difference(s)` : ""})`,
      );
    }
    if (diff.ok) return;

    m.differed++;
    m.lastProblem = diff.problems[0];

    // One line the FIRST time a disagreement appears, tagged so a week of them
    // can be pulled out in one grep. Expected differences are not logged at all
    // — a log that prints the known ones is a log nobody reads — and a repeat of
    // something already printed is not logged either: while a rider waits, the
    // same true finding would print every few seconds and bury the rest.
    const fresh = this.printed.fresh(diff.method, diff.problems.slice(0, 3));
    if (fresh.length > 0) console.warn(`[shadow] NEW ${diff.method}: ${fresh.join(" | ")}`);
  }

  /**
   * kas1067 could not answer at all.
   *
   * This is not a difference of opinion, so it is not a comparison — but it is
   * half of the question the cutover turns on, and on a bad kas day it is the
   * only half producing any signal. Counted per method, with whether the taxi
   * core could have served the same call, and announced once so a sick kas does
   * not fill the log with the same sentence.
   */
  recordPrimaryDown(method: string, shadowServed: boolean): void {
    const p = (this.stats.primaryDown[method] ??= { failed: 0, shadowServed: 0 });
    const first = p.failed === 0;
    p.failed++;
    if (shadowServed) p.shadowServed++;
    if (first) {
      console.warn(
        `[shadow] PRIMARY-DOWN ${method}: kas1067 could not answer; the taxi core ` +
        `${shadowServed ? "could" : "could NOT either"}. Counting from here.`,
      );
    }
  }

  recordError(method: string, e: unknown): void {
    this.stats.errors[method] = (this.stats.errors[method] ?? 0) + 1;
    console.warn(`[shadow] ${method} FAILED in shadow: ${e instanceof Error ? e.message : String(e)}`);
  }

  /** How many genuinely different disagreements have been seen, not how many times. */
  get distinctProblems(): number {
    return this.printed.distinct;
  }

  /** kas1067's outages, and whether we could have covered them. Empty when there were none. */
  primaryDownLine(): string {
    const entries = Object.entries(this.stats.primaryDown);
    if (entries.length === 0) return "";
    const total = entries.reduce((n, [, p]) => n + p.failed, 0);
    const served = entries.reduce((n, [, p]) => n + p.shadowServed, 0);
    return (
      ` | kas1067 could not answer ${total}× (taxi core could have served ${served}): ` +
      entries.map(([m, p]) => `${m} ${p.shadowServed}/${p.failed}`).join(", ")
    );
  }

  /** What a week of running looks like, in one object. */
  summary(): { method: string; compared: number; differed: number; rate: string; lastProblem?: string }[] {
    return Object.entries(this.stats.methods)
      .map(([method, m]) => ({
        method,
        compared: m.compared,
        differed: m.differed,
        rate: m.compared ? `${((m.differed / m.compared) * 100).toFixed(1)}%` : "—",
        lastProblem: m.lastProblem,
      }))
      .sort((a, b) => b.differed - a.differed);
  }
}

export const shadowRecorder = new ShadowRecorder();

/**
 * Print the running total every half hour.
 *
 * The comparison lives in one process's memory, and the run is meant to last a
 * week. Without this, the only way to read it is to still be attached to the
 * process that produced it — so the summary goes to the log, tagged, and a
 * week of it can be pulled out with one grep.
 */
export function startShadowSummaryLog(everyMs = 30 * 60 * 1000): void {
  const t = setInterval(() => {
    const rows = shadowRecorder.summary();
    const down = shadowRecorder.primaryDownLine();
    if (rows.length === 0) {
      // Nothing compared is a finding, not a reason to stay quiet: it means the
      // bot never asked either source anything shadowable, and a week of that
      // would otherwise read as a clean run.
      console.warn(
        `[shadow] SUMMARY since ${shadowRecorder.stats.startedAt}: NOTHING COMPARED YET — ` +
        "no shadowable read completed on BOTH sources. Either the bot is idle, kas1067 is not " +
        `answering, or shadow mode is not on the path it uses.${down}`,
      );
      return;
    }
    const total = rows.reduce((n, r) => n + r.compared, 0);
    const bad = rows.reduce((n, r) => n + r.differed, 0);
    console.warn(
      `[shadow] SUMMARY since ${shadowRecorder.stats.startedAt}: ${total} compared, ${bad} differed, ` +
      `${shadowRecorder.distinctProblems} distinct — ` +
      rows.map((r) => `${r.method} ${r.differed}/${r.compared}`).join(", ") + down,
    );
  }, everyMs);
  t.unref?.();
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`shadow timeout after ${ms}ms`)), ms)),
  ]);
}

/**
 * Wrap a primary source so that reads are also asked of a shadow one.
 *
 * A Proxy rather than 27 hand-written methods, for one reason worth stating: a
 * method added to KasDataSource later is forwarded to the primary and NOT
 * shadowed, because it will not be in READ_METHODS. The safe default arrives by
 * itself instead of depending on somebody remembering.
 */
export function withShadow(
  primary: KasDataSource,
  shadow: KasDataSource,
  opts: { sampleEvery?: number; recorder?: ShadowRecorder } = {},
): KasDataSource {
  const sampleEvery = Math.max(1, opts.sampleEvery ?? 1);
  const recorder = opts.recorder ?? shadowRecorder;
  const seen: Record<string, number> = {};

  return new Proxy(primary, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function" || typeof prop !== "string") return value;
      if (!READ_METHODS.has(prop)) return value.bind(target);

      return (...args: unknown[]) => {
        const live = (value as (...a: unknown[]) => unknown).apply(target, args);

        // Sample AFTER the primary call is under way, so sampling can never
        // delay the answer the caller is waiting for.
        //
        // The FIRST call of each method is always compared, whatever the sample
        // rate. Otherwise the config reads — tariff, bonus rules, company, car
        // models — would never be compared at all: they are read once while the
        // cache warms at boot, so with a rate of 3 their turn never comes. Those
        // are the reads that carry the fares, and a sampling rule that silently
        // excludes them is worse than no sampling.
        const n = (seen[prop] = (seen[prop] ?? 0) + 1);
        if (n === 1 || n % sampleEvery === 0) {
          void (async () => {
            const shadowFn = (shadow as unknown as Record<string, unknown>)[prop];
            if (typeof shadowFn !== "function") return;

            // The two are awaited SEPARATELY, not with Promise.all, so that the
            // two failures stay distinguishable. If kas1067 is down, the primary
            // rejects — that is the caller's problem, already surfaced by the
            // caller, and recording it here would blame the shadow for an
            // outage it had no part in. During a real incident that is the
            // difference between reading the log and being misled by it.
            let liveValue: unknown;
            try {
              liveValue = await Promise.resolve(live);
            } catch {
              // The shadow is still asked, so the record says "could the other
              // one have served this?" instead of shrugging. Reads only — this
              // path cannot reach a write.
              try {
                await withTimeout(
                  Promise.resolve((shadowFn as (...a: unknown[]) => unknown).apply(shadow, args)),
                  SHADOW_TIMEOUT_MS,
                );
                recorder.recordPrimaryDown(prop, true);
              } catch {
                recorder.recordPrimaryDown(prop, false);
              }
              return;
            }

            // A shadow that cannot answer IS a finding — it is the source we
            // are deciding whether to trust.
            try {
              const shadowValue = await withTimeout(
                Promise.resolve((shadowFn as (...a: unknown[]) => unknown).apply(shadow, args)),
                SHADOW_TIMEOUT_MS,
              );
              recorder.record(compareShadow(prop, liveValue, shadowValue));
            } catch (e) {
              recorder.recordError(prop, e);
            }
          })();
        }

        return live;
      };
    },
  }) as KasDataSource;
}
