import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { LagStats, bookingTickDelay, locBelongsTo, nudgeBelongsTo, parseAuthFrame, ridePollMs, sweepLoop, tail9, wakeCoalescer, type CoreLoc } from "../rideStream";
import { toBridgeId } from "../bridgeIds";

// P0-4: the core's stream reaching the bot and the passenger. The rules that decide who hears what
// live here, because a position sent to the wrong passenger is a stranger watching someone's car.

describe("the sweep's cadence", () => {
  it("keeps yesterday's cadence exactly while the stream is not healthy", () => {
    expect(bookingTickDelay({ awaitingDriver: 1, active: 1, streamHealthy: false })).toBe(5_000);
    expect(bookingTickDelay({ awaitingDriver: 0, active: 2, streamHealthy: false })).toBe(15_000);
    expect(bookingTickDelay({ awaitingDriver: 0, active: 0, streamHealthy: false })).toBe(90_000);
  });

  it("becomes a safety net when the stream wakes it", () => {
    expect(bookingTickDelay({ awaitingDriver: 1, active: 1, streamHealthy: true })).toBe(20_000);
    expect(bookingTickDelay({ awaitingDriver: 0, active: 2, streamHealthy: true })).toBe(30_000);
    expect(bookingTickDelay({ awaitingDriver: 0, active: 0, streamHealthy: true })).toBe(90_000);
  });

  it("the Mini App polls every 3 s alone and every 20 s under the socket", () => {
    expect(ridePollMs(false)).toBe(3_000);
    expect(ridePollMs(true)).toBe(20_000);
  });
});

describe("waking the one sweep", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const harness = () => {
    const st = { busy: false, stopped: false, runs: 0, reruns: 0 };
    const wake = wakeCoalescer({
      windowMs: 300,
      busy: () => st.busy,
      stopped: () => st.stopped,
      run: () => { st.runs++; },
      rerun: () => { st.reruns++; },
    });
    return { st, wake };
  };

  it("a burst of nudges is one sweep", () => {
    const { st, wake } = harness();
    for (let i = 0; i < 5; i++) { wake(); vi.advanceTimersByTime(50); }
    vi.advanceTimersByTime(300);
    expect(st.runs).toBe(1);
    wake();
    vi.advanceTimersByTime(300);
    expect(st.runs).toBe(2); // the next burst is its own sweep
  });

  it("a nudge during a sweep asks for one more after it, never a second one alongside", () => {
    const { st, wake } = harness();
    st.busy = true;
    wake();
    vi.advanceTimersByTime(300);
    expect(st.runs).toBe(0);
    expect(st.reruns).toBe(1);
  });

  it("does nothing once the bot is stopping", () => {
    const { st, wake } = harness();
    st.stopped = true;
    wake();
    vi.advanceTimersByTime(1_000);
    expect(st.runs + st.reruns).toBe(0);
    st.stopped = false;
    wake();
    st.stopped = true; // stopped inside the window
    vi.advanceTimersByTime(300);
    expect(st.runs + st.reruns).toBe(0);
  });
});

describe("the sweep's one chain", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** A sweep whose every tick takes `tickMs`; counts ticks and the most that ever ran at once. */
  const harness = (tickMs: number, delayMs = 20_000) => {
    const st = { ticks: 0, now: 0, most: 0, errors: 0, fail: false };
    const loop = sweepLoop({
      windowMs: 300,
      delay: () => delayMs,
      onError: () => { st.errors++; },
      body: async () => {
        st.ticks++;
        st.now++;
        st.most = Math.max(st.most, st.now);
        await new Promise((r) => setTimeout(r, tickMs));
        st.now--;
        if (st.fail) throw new Error("boom");
        return { active: 1, awaitingDriver: 0 };
      },
    });
    return { st, loop };
  };

  it("keeps its cadence when nothing wakes it", async () => {
    const { st, loop } = harness(100);
    loop.start(15_000);
    await vi.advanceTimersByTimeAsync(15_000 + 100 + 20_000 + 100 + 20_000 + 100);
    expect(st.ticks).toBe(3);
  });

  it("a wake runs the sweep now and replaces the pending tick, it does not add one", async () => {
    const { st, loop } = harness(100);
    loop.start(15_000);
    await vi.advanceTimersByTimeAsync(1_000);
    loop.wake();
    await vi.advanceTimersByTimeAsync(300 + 100);
    expect(st.ticks).toBe(1);
    expect(vi.getTimerCount()).toBe(1); // exactly one next tick waiting
    await vi.advanceTimersByTimeAsync(14_000);
    expect(st.ticks).toBe(1); // the original 15 s tick is gone
    await vi.advanceTimersByTimeAsync(6_000);
    expect(st.ticks).toBe(2);
  });

  it("wakes during a long tick: never two at once, one more tick after, still one chain", async () => {
    const { st, loop } = harness(5_000);
    loop.start(0);
    await vi.advanceTimersByTimeAsync(1_000); // mid-tick
    for (let i = 0; i < 4; i++) { loop.wake(); await vi.advanceTimersByTimeAsync(400); }
    await vi.advanceTimersByTimeAsync(5_000);
    expect(st.most).toBe(1);
    expect(st.ticks).toBe(2); // the running one, then exactly one catch-up
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(st.most).toBe(1);
    expect(vi.getTimerCount()).toBe(1);
  });

  it("a tick that throws is reported and the chain goes on", async () => {
    const { st, loop } = harness(10);
    st.fail = true;
    loop.start(0);
    await vi.advanceTimersByTimeAsync(10 + 20_000 + 10);
    expect(st.errors).toBe(2);
    expect(st.ticks).toBe(2);
  });

  it("stop ends it: no tick, no timer, wakes ignored", async () => {
    const { st, loop } = harness(10);
    loop.start(1_000);
    loop.stop();
    loop.wake();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(st.ticks).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("who hears what", () => {
  const loc = (o: Partial<CoreLoc> = {}): CoreLoc => ({ orderId: 1234, phoneTail9: "901234567", lat: 39.03, lng: 65.58, bearing: 90, at: "2026-09-18T08:00:00Z", ...o });

  it("a position goes only to the passenger whose phone AND current ride it is", () => {
    const me = { tail9: "901234567", bookingId: toBridgeId(1234) };
    expect(locBelongsTo(loc(), me)).toBe(true);
    expect(locBelongsTo(loc({ phoneTail9: "907777777" }), me)).toBe(false); // someone else
    expect(locBelongsTo(loc({ orderId: 1235 }), me)).toBe(false);           // my phone, not my ride
    expect(locBelongsTo(loc(), { tail9: "901234567", bookingId: null })).toBe(false); // no ride known
    expect(locBelongsTo(loc({ phoneTail9: null }), { tail9: null, bookingId: toBridgeId(1234) })).toBe(false);
  });

  it("a nudge goes to the passenger whose phone it names", () => {
    const n = { id: 1, status: "accepted", phoneTail9: "901234567", emittedAt: "" };
    expect(nudgeBelongsTo(n, { tail9: "901234567" })).toBe(true);
    expect(nudgeBelongsTo(n, { tail9: "907777777" })).toBe(false);
    expect(nudgeBelongsTo({ ...n, phoneTail9: null }, { tail9: null })).toBe(false);
  });

  it("matches phones by their last nine digits", () => {
    expect(tail9("+998 90 123-45-67")).toBe("901234567");
    expect(tail9("901234567")).toBe("901234567");
    expect(tail9("12345")).toBeNull();
  });
});

describe("the ride socket's first frame", () => {
  it("accepts only an auth frame with initData", () => {
    expect(parseAuthFrame(JSON.stringify({ t: "auth", initData: "query_id=1&hash=x" }))).toEqual({ initData: "query_id=1&hash=x" });
    for (const bad of ["", "{", JSON.stringify({ t: "auth" }), JSON.stringify({ t: "x", initData: "a" }), JSON.stringify({ t: "auth", initData: "" }), "x".repeat(9_000)]) {
      expect(parseAuthFrame(bad)).toBeNull();
    }
  });
});

describe("lag statistics", () => {
  it("reports the 95th percentile of the recent window and ignores nonsense", () => {
    const s = new LagStats(100);
    for (let i = 1; i <= 100; i++) s.add(i);
    s.add(-5);
    s.add(Number.NaN);
    expect(s.count).toBe(100);
    expect(s.p95()).toBe(95);
    for (let i = 0; i < 100; i++) s.add(1_000);
    expect(s.p95()).toBe(1_000);
    expect(s.count).toBe(100);  // the window is full…
    expect(s.total).toBe(200);  // …but every sample counts toward "log every 100th"
    expect(new LagStats().p95()).toBeNull();
  });
});
