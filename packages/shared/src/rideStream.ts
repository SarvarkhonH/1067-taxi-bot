// 🚕 B qism P0-4: the core's event stream reaching the bot and the Mini App.
//
// The core (1067-taxi) nudges the bot the moment an order changes (`svc:order`) and, for an order a
// driver holds, sends that car's position (`svc:loc`). The bot wakes its ONE ride sweep on a nudge
// — no second sweep, no new poller — and relays the nudge and the position to the one passenger
// whose ride it is, over the Mini App's ride socket. Pure rules here; wiring in packages/server.

import { fromBridgeId } from "./bridgeIds";

/** What the core sends on every order change. A hint: the bot re-reads the order itself. */
export interface CoreNudge {
  id: number;
  status: string;
  phoneTail9: string | null;
  emittedAt: string;
}

/** A driver's position for an order that driver holds. */
export interface CoreLoc {
  orderId: number;
  phoneTail9: string | null;
  lat: number;
  lng: number;
  bearing: number;
  at: string;
}

/**
 * The ride sweep's next delay. With the stream healthy the sweep is only a safety net — the stream
 * wakes it the moment something changes — so it can run far less often; without the stream it keeps
 * yesterday's cadence exactly.
 */
export function bookingTickDelay(o: { awaitingDriver: number; active: number; streamHealthy: boolean }): number {
  if (o.streamHealthy) return o.awaitingDriver > 0 ? 20_000 : o.active > 0 ? 30_000 : 90_000;
  return o.awaitingDriver > 0 ? 5_000 : o.active > 0 ? 15_000 : 90_000;
}

/**
 * One wake for a burst of nudges. `accepted` then `en route` a second later is ONE sweep, not two;
 * a wake that lands while a sweep is running asks for exactly one more sweep right after it (that
 * sweep may have read the order just before it changed), never a second sweep alongside it.
 */
export function wakeCoalescer(o: {
  windowMs: number;
  busy: () => boolean;
  stopped: () => boolean;
  run: () => void;
  /** Ask the running sweep to go again as soon as it ends. */
  rerun: () => void;
}): () => void {
  let pending: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (o.stopped() || pending) return;
    pending = setTimeout(() => {
      pending = null;
      if (o.stopped()) return;
      if (o.busy()) o.rerun();
      else o.run();
    }, o.windowMs);
  };
}

export interface SweepResult {
  active: number;
  awaitingDriver: number;
}

/**
 * The ride sweep's scheduler: ONE chain of ticks however many wakes land, and never two ticks at
 * once. Each tick schedules the next when it ends; a wake cancels the pending tick and runs now; a
 * wake during a tick runs one more tick `windowMs` after it. A tick that throws is reported and the
 * chain goes on — a sweep that stops is a bot that stops telling passengers anything.
 */
export function sweepLoop(o: {
  body: () => Promise<SweepResult>;
  delay: (r: SweepResult) => number;
  windowMs: number;
  onError?: (e: unknown) => void;
}): { start: (firstMs: number) => void; wake: () => void; stop: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let again = false;
  let stopped = false;

  const schedule = (ms: number): void => {
    if (timer) clearTimeout(timer);
    timer = stopped ? null : setTimeout(() => { timer = null; void tick(); }, ms);
  };
  const tick = async (): Promise<void> => {
    if (stopped) return;
    if (running) { again = true; return; }
    running = true;
    let r: SweepResult = { active: 0, awaitingDriver: 0 };
    try {
      r = await o.body();
    } catch (e) {
      o.onError?.(e);
    }
    running = false;
    const next = again ? o.windowMs : o.delay(r);
    again = false;
    schedule(next);
  };
  const wake = wakeCoalescer({
    windowMs: o.windowMs,
    busy: () => running,
    stopped: () => stopped,
    rerun: () => { again = true; },
    run: () => {
      if (timer) clearTimeout(timer);
      timer = null;
      void tick();
    },
  });
  return {
    start: (firstMs) => { if (!stopped && !timer && !running) schedule(firstMs); },
    wake,
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}

/** The Mini App's poll of /api/booking/active while a ride is on: 3 s alone, 20 s as a net under the socket. */
export function ridePollMs(socketOpen: boolean): number {
  return socketOpen ? 20_000 : 3_000;
}

/** The last nine digits of a phone, or null — how the core and the bot both match a passenger. */
export function tail9(phone: unknown): string | null {
  const d = String(phone ?? "").replace(/\D/g, "");
  return d.length >= 9 ? d.slice(-9) : null;
}

/**
 * Whether a position may go to this passenger: their phone, AND the order the bot knows as their
 * current ride. Both, because nine digits are a whole Uzbek number but not a whole world one, and
 * because a car's position is only this passenger's business for this ride.
 */
export function locBelongsTo(loc: CoreLoc, client: { tail9: string | null; bookingId: number | null }): boolean {
  if (!client.tail9 || loc.phoneTail9 !== client.tail9) return false;
  if (client.bookingId == null) return false;
  return fromBridgeId(client.bookingId) === loc.orderId;
}

/** A nudge is this passenger's when it names their phone. */
export function nudgeBelongsTo(n: CoreNudge, client: { tail9: string | null }): boolean {
  return !!client.tail9 && n.phoneTail9 === client.tail9;
}

/** The Mini App's first frame on the ride socket, or null when it is not one. */
export function parseAuthFrame(raw: unknown): { initData: string } | null {
  let v: unknown = raw;
  if (typeof raw === "string") {
    if (raw.length > 8_192) return null;
    try { v = JSON.parse(raw); } catch { return null; }
  }
  const f = v as { t?: unknown; initData?: unknown } | null;
  if (!f || f.t !== "auth" || typeof f.initData !== "string" || !f.initData) return null;
  return { initData: f.initData };
}

/** Rolling latency sample (ms) — how late a nudge reaches the bot. p95 over the last `size`. */
export class LagStats {
  private readonly values: number[] = [];
  private seen = 0;
  constructor(private readonly size = 200) {}

  add(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) return;
    this.seen++;
    this.values.push(ms);
    if (this.values.length > this.size) this.values.shift();
  }

  /** Samples in the window (at most `size`). */
  get count(): number {
    return this.values.length;
  }

  /** Samples ever added — for "log every 100th"; `count` stops growing once the window is full. */
  get total(): number {
    return this.seen;
  }

  p95(): number | null {
    if (!this.values.length) return null;
    const s = [...this.values].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)]!;
  }
}
