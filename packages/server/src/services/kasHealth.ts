// ⚠️ kas EARLY-WARNING monitor — in-memory, no DB, no new poller, zero extra kas load.
//
// kas1067's byFilter/login endpoints rate-limit hard (~1 req/s). When they spike to 429 it cascades:
// login breaks → bookings fail → riders see "no driver". The nightly self-check is money-only and
// fires once a day — far too late. This passively watches the kas HTTP chokepoint (getText) on every
// real call and fires ONE owner alert the MOMENT the live failure rate crosses a threshold, then a
// recovery note when it clears. The owner hears about trouble in ~seconds, before it hurts riders.

export type KasFailKind = "429" | "login" | "timeout" | "other";

const WINDOW_MS = 120_000; // rolling 2-minute view
const REALERT_MS = 10 * 60_000; // never re-fire the SAME warning within 10 min (anti-spam)
const MIN_SAMPLE = 8; // need a meaningful number of calls before alarming (avoid tiny-sample noise)
const FAIL_RATIO = 0.5; // ≥50% of recent calls failing = degraded
const RECOVER_MIN = 4; // a clean window of ≥4 calls after a bad spell = recovered

interface Ev {
  t: number;
  ok: boolean;
  kind?: KasFailKind;
}
const events: Ev[] = [];
let degraded = false;
let lastAlertAt = 0;

function prune(now: number): void {
  while (events.length && now - events[0]!.t > WINDOW_MS) events.shift();
}

/** Called from the kas getText chokepoint on every read (success or failure). Cheap, in-memory. */
export function recordKas(ok: boolean, kind?: KasFailKind): void {
  const now = Date.now();
  events.push({ t: now, ok, kind });
  prune(now);
}

/** Classify a thrown kas error (or a status-derived failure) into a fail kind, for the breakdown. */
export function classifyKasError(err: unknown): KasFailKind {
  const m = err instanceof Error ? err.message : String(err);
  if (/429|too many/i.test(m)) return "429";
  if (/login failed/i.test(m)) return "login";
  if (/timed out after/i.test(m)) return "timeout";
  return "other";
}

export interface KasHealthSnapshot {
  total: number;
  fails: number;
  c429: number;
  login: number;
  timeout: number;
  degraded: boolean;
}
export function kasHealthSnapshot(): KasHealthSnapshot {
  prune(Date.now());
  const fails = events.filter((e) => !e.ok);
  return {
    total: events.length,
    fails: fails.length,
    c429: fails.filter((e) => e.kind === "429").length,
    login: fails.filter((e) => e.kind === "login").length,
    timeout: fails.filter((e) => e.kind === "timeout").length,
    degraded,
  };
}

/**
 * Evaluate the rolling window and fire an EARLY warning — or a recovery note — to the owner.
 * Reads in-memory counters only; safe to call on the frequent booking tick (no new poller).
 */
export async function maybeAlertKasHealth(alert: (html: string) => Promise<void>): Promise<void> {
  const now = Date.now();
  const s = kasHealthSnapshot();
  const bad = s.total >= MIN_SAMPLE && s.fails / s.total >= FAIL_RATIO;

  if (bad && !degraded && now - lastAlertAt > REALERT_MS) {
    degraded = true;
    lastAlertAt = now;
    const parts = [
      s.c429 ? `${s.c429}× «Too Many Requests» (429)` : "",
      s.login ? `${s.login}× login yiqildi` : "",
      s.timeout ? `${s.timeout}× javob kechikdi` : "",
    ]
      .filter(Boolean)
      .join(", ");
    await alert(
      `⚠️ <b>Erta ogohlantirish — kas javob bermayapti</b>\n\n` +
        `So'nggi 2 daqiqada kas so'rovlarining <b>${s.fails}/${s.total}</b> tasi yiqildi${parts ? `\n(${parts})` : ""}.\n\n` +
        `Bu booking va login'ga ta'sir qilishi mumkin. Avtomatik kuzatyapman — tiklanishi bilan xabar beraman.`,
    );
  } else if (degraded && s.total >= RECOVER_MIN && s.fails === 0) {
    degraded = false;
    await alert(`✅ <b>kas tiklandi</b> — so'nggi so'rovlar muvaffaqiyatli o'tdi. Booking normal holatga qaytdi.`);
  }
}
