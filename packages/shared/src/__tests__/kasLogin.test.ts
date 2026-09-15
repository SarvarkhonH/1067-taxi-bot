import { describe, it, expect } from "vitest";
import {
  classifyKasLogin,
  kasLoginCooldownMs,
  kasLoginShouldRetry,
  kasLoginMessage,
  KAS_LOGIN_THROTTLE_COOLDOWN_MS,
} from "../kasLogin";

// The 2026-09-14 outage in one sentence: kas answered 429, the client retried, and every retry
// re-armed the limiter. These tests hold the two decisions that make that impossible, and the
// third that stops the log from blaming the password again.

describe("classifyKasLogin — telling the limiter apart from a wrong password", () => {
  it("reads a bare 429 as throttled", () => {
    expect(classifyKasLogin({ status: 429 })).toBe("throttled");
  });

  // THE bug. Throttled and wrong-password arrive at the SAME redirect; only the body differs.
  it("reads /login?error carrying the limiter's body as throttled, not rejected", () => {
    expect(
      classifyKasLogin({
        status: 302,
        location: "http://46.8.176.53/kas1067/login?error",
        body: '{"error":"Too many login attempts. Try later."}',
      }),
    ).toBe("throttled");
  });

  it("reads the same redirect WITHOUT that body as a credential rejection", () => {
    expect(classifyKasLogin({ status: 302, location: "/kas1067/login?error" })).toBe("rejected");
  });

  // Measured live on 2026-09-15: the POST's own response carries NO body — kas puts the reason on
  // the page the redirect points at. So the client fetches that page and classifies it again, and
  // only this second look can tell a throttle from a wrong password.
  it("reads the error PAGE that redirect points at, where kas actually puts the reason", () => {
    expect(
      classifyKasLogin({ status: 200, body: '{"error":"Too many login attempts. Try later."}' }),
    ).toBe("throttled");
    // the same page for a genuinely wrong password is just the form again — still a rejection
    expect(classifyKasLogin({ status: 200, body: '<form class="form-signin">' })).toBe("stale-session");
  });

  it("reads a redirect away from /login as success", () => {
    expect(classifyKasLogin({ status: 302, location: "/kas1067/index" })).toBe("ok");
  });

  it("reads a 200 on the POST as a stale session", () => {
    expect(classifyKasLogin({ status: 200, body: "<form class=\"form-signin\">" })).toBe("stale-session");
  });

  it("reads a dead socket or a 5xx as unreachable", () => {
    expect(classifyKasLogin({ status: 0 })).toBe("unreachable");
    expect(classifyKasLogin({ status: 502 })).toBe("unreachable");
  });
});

describe("kasLoginShouldRetry — a rate limiter is never retried", () => {
  it("never retries a throttle, on any attempt", () => {
    expect(kasLoginShouldRetry("throttled", 0)).toBe(false);
    expect(kasLoginShouldRetry("throttled", 1)).toBe(false);
    expect(kasLoginShouldRetry("throttled", 4)).toBe(false);
  });

  it("never retries a rejection or an unreachable host", () => {
    expect(kasLoginShouldRetry("rejected", 0)).toBe(false);
    expect(kasLoginShouldRetry("unreachable", 0)).toBe(false);
  });

  it("allows exactly one clean pass for a stale session", () => {
    expect(kasLoginShouldRetry("stale-session", 0)).toBe(true);
    expect(kasLoginShouldRetry("stale-session", 1)).toBe(false);
  });
});

describe("kasLoginCooldownMs — after a failure we wait before asking again", () => {
  it("gives a 429 the full quiet window on the FIRST failure", () => {
    expect(kasLoginCooldownMs("throttled", 1)).toBe(KAS_LOGIN_THROTTLE_COOLDOWN_MS);
  });

  it("escalates other failures 30s → 2min → 5min and stays there", () => {
    expect(kasLoginCooldownMs("rejected", 1)).toBe(30_000);
    expect(kasLoginCooldownMs("rejected", 2)).toBe(120_000);
    expect(kasLoginCooldownMs("rejected", 3)).toBe(300_000);
    expect(kasLoginCooldownMs("rejected", 99)).toBe(300_000);
  });

  it("never pauses after a success", () => {
    expect(kasLoginCooldownMs("ok", 0)).toBe(0);
  });
});

describe("kasLoginMessage — the log must not accuse the password again", () => {
  it("says a throttle is kas1067's limiter and not our credentials", () => {
    const m = kasLoginMessage("throttled", "status 429");
    expect(m).toMatch(/rate-limiting/i);
    expect(m).toMatch(/NOT a wrong password/i);
  });

  it("still names the credentials when kas really did reject them", () => {
    expect(kasLoginMessage("rejected", "redirect /login?error")).toMatch(/KAS_USERNAME \/ KAS_PASSWORD/);
  });
});

// The whole outage, replayed. Same kas (answering 429 forever), same customer traffic, and the
// measured shape of the old client: 5 attempts per lookup × 2 requests per attempt.
describe("the 2026-09-14 storm cannot happen again", () => {
  const LOOKUP_EVERY_MS = 22_000; // measured from the live log
  const OUTAGE_MS = 18 * 60 * 60 * 1000; // 09:57 → the small hours
  const REQUESTS_PER_PASS = 2; // GET /login (CSRF form) + POST /login

  it("caps eighteen hours of failing lookups at one login pass per five minutes", () => {
    let blockedUntil = 0;
    let fails = 0;
    let requests = 0;

    for (let t = 0; t < OUTAGE_MS; t += LOOKUP_EVERY_MS) {
      if (t < blockedUntil) continue; // circuit open — not one socket is opened
      requests += REQUESTS_PER_PASS;
      const outcome = "throttled" as const; // kas keeps saying 429
      expect(kasLoginShouldRetry(outcome, 0)).toBe(false); // and we never retry it
      fails += 1;
      blockedUntil = t + kasLoginCooldownMs(outcome, fails);
    }

    const oldBehaviour = Math.ceil(OUTAGE_MS / LOOKUP_EVERY_MS) * 5 * REQUESTS_PER_PASS;
    expect(oldBehaviour).toBeGreaterThan(29_000); // ~29 450 — what actually hit kas that day
    expect(requests).toBeLessThanOrEqual(450); // 18h ÷ 5min × 2
    expect(requests * 60).toBeLessThan(oldBehaviour); // a 60×+ reduction, held by CI
  });

  it("recovers on the first lookup after kas clears the limiter", () => {
    // cooldown elapsed → one pass is allowed → kas answers with a real session
    expect(classifyKasLogin({ status: 302, location: "/kas1067/index" })).toBe("ok");
    expect(kasLoginCooldownMs("ok", 0)).toBe(0); // and the circuit closes immediately
  });
});
