// ⚠️ Taxi-core EARLY-WARNING monitor — in-memory, no DB, no new poller, zero extra load on the core.
//
// Every call the bot makes to the dispatch core goes through one chokepoint (`kas/birjoy.ts`
// request). That chokepoint reports here, and the frequent booking tick asks whether the recent
// failure rate crossed a line. The owner hears about a sick core in seconds — before a passenger
// stares at a spinner — and hears again when it recovers.
//
// History: this file watched kas1067 until 2026-09-17. What it learned there still holds: a
// dispatch that silently degrades is worse than one that is loudly down, because nobody rings the
// dispatcher while the app still looks like it is working.

export type CoreFailKind = "429" | "timeout" | "network" | "5xx" | "auth";

const WINDOW_MS = 120_000; // rolling 2-minute view
const REALERT_MS = 10 * 60_000; // never re-fire the SAME warning within 10 min (anti-spam)
const MIN_SAMPLE = 8; // need a meaningful number of calls before alarming (avoid tiny-sample noise)
const FAIL_RATIO = 0.5; // ≥50% of recent calls failing = degraded
// recovered = the whole 2-minute window is clean again (any number of calls — quiet hours have few)
// At quiet hours the sweep makes one or two calls per 90 s, so the ratio rule above can never reach
// its sample size and a dead core would go unreported all night. Consecutive failures catch that.
const CONSECUTIVE_FAILS = 5;

interface Ev {
  t: number;
  ok: boolean;
  kind?: CoreFailKind;
}
const events: Ev[] = [];
let degraded = false;
let lastAlertAt = 0;
let consecutiveFails = 0;

function prune(now: number): void {
  while (events.length && now - events[0]!.t > WINDOW_MS) events.shift();
}

/**
 * Called from the core chokepoint on every call. A 4xx is the core answering on purpose (unknown
 * phone, bad address) and counts as healthy; an unanswered call, a 429, a 5xx or a refused token
 * (401/403) is a failure.
 */
export function recordCore(ok: boolean, kind?: CoreFailKind): void {
  const now = Date.now();
  events.push({ t: now, ok, kind });
  consecutiveFails = ok ? 0 : consecutiveFails + 1;
  prune(now);
}

export interface CoreHealthSnapshot {
  total: number;
  fails: number;
  c429: number;
  timeout: number;
  network: number;
  c5xx: number;
  auth: number;
  consecutiveFails: number;
  degraded: boolean;
}
export function coreHealthSnapshot(): CoreHealthSnapshot {
  prune(Date.now());
  const fails = events.filter((e) => !e.ok);
  return {
    total: events.length,
    fails: fails.length,
    c429: fails.filter((e) => e.kind === "429").length,
    timeout: fails.filter((e) => e.kind === "timeout").length,
    network: fails.filter((e) => e.kind === "network").length,
    c5xx: fails.filter((e) => e.kind === "5xx").length,
    auth: fails.filter((e) => e.kind === "auth").length,
    consecutiveFails,
    degraded,
  };
}

/**
 * Evaluate the rolling window and fire an EARLY warning — or a recovery note — to the owner.
 * Reads in-memory counters only; safe to call on the frequent booking tick (no new poller).
 */
export async function maybeAlertCoreHealth(alert: (html: string) => Promise<void>): Promise<void> {
  const now = Date.now();
  const s = coreHealthSnapshot();
  const bad = (s.total >= MIN_SAMPLE && s.fails / s.total >= FAIL_RATIO) || s.consecutiveFails >= CONSECUTIVE_FAILS;

  if (bad && !degraded && now - lastAlertAt > REALERT_MS) {
    degraded = true;
    lastAlertAt = now;
    const parts = [
      s.timeout ? `${s.timeout}× javob kechikdi` : "",
      s.network ? `${s.network}× ulanib bo'lmadi` : "",
      s.c5xx ? `${s.c5xx}× server xatosi` : "",
      s.c429 ? `${s.c429}× «Too Many Requests» (429)` : "",
      s.auth ? `${s.auth}× token rad etildi (401/403 — KAS_SERVICE_TOKEN yadroning SERVICE_TOKEN bilan mosmi?)` : "",
    ]
      .filter(Boolean)
      .join(", ");
    await alert(
      `⚠️ <b>Erta ogohlantirish — taksi tizimi javob bermayapti</b>\n\n` +
        `So'nggi 2 daqiqada taksi tizimiga so'rovlarning <b>${s.fails}/${s.total}</b> tasi yiqildi${parts ? `\n(${parts})` : ""}.\n\n` +
        `Ilovadan buyurtma berish ta'sirlanadi. Tekshiring: <code>systemctl status taxi1067-api</code>. ` +
        `Tiklanishi bilan xabar beraman.`,
    );
  } else if (degraded && s.consecutiveFails === 0 && s.total > 0 && s.fails === 0) {
    degraded = false;
    await alert(`✅ <b>Taksi tizimi tiklandi</b> — so'nggi so'rovlar muvaffaqiyatli o'tdi.`);
  }
}
