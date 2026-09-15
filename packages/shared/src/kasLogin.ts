// ─── kas1067 login guard ─────────────────────────────────────────────────────
// 2026-09-14, 09:57. kas1067 answered one login with 429. The client read "not a redirect" as
// "login failed", and retried five times with backoff — and one retry is TWO requests, because a
// login pass is GET /login (for the CSRF form) then POST /login. So a single customer lookup could
// throw ten requests at a rate limiter that was already saying stop. Lookups arrive every ~22s, so
// the limiter never drained: ~1060 failed logins over eighteen hours, the day's rides down from a
// 12-22 baseline to 6.
//
// The second half of the damage was the words. While throttled, kas redirects to /login?error —
// the same redirect it uses for a wrong password — and the thrown message said
// "Check KAS_USERNAME / KAS_PASSWORD". So the whole next day went into changing a password that
// was never wrong. What actually proved it: a login POST with a username that does not exist
// (`zzz_nobody_9137`) came back with the identical 429 + {"error":"Too many login attempts."},
// from two different IPs, while our server was firewalled off from kas entirely. A limiter that
// answers an unknown username the same way it answers ours has not looked at the password at all.
//
// The rule this file encodes: a rate limiter is a request to STOP — you never retry it, and after
// ANY failed login you wait before asking again. Kept pure so the CI shield can hold it; the
// client needs a socket, these decisions do not.

export type KasLoginOutcome = "ok" | "throttled" | "rejected" | "stale-session" | "unreachable";

/** kas says "Too many login attempts. Try later." in the body of the page it redirects to. */
const THROTTLE_BODY = /too many login attempts/i;

/**
 * What did kas1067 just tell us? The redirect ALONE cannot answer this: `/login?error` is both
 * "wrong password" and "you are throttled". Only the body separates them — which is why the
 * body is read here and not just the status line.
 */
export function classifyKasLogin(res: { status: number; location?: string; body?: string }): KasLoginOutcome {
  if (res.status === 429) return "throttled";
  if (res.body && THROTTLE_BODY.test(res.body)) return "throttled";

  const loc = res.location ?? "";
  if (res.status >= 300 && res.status < 400) {
    return /\/login/.test(loc) || /error/i.test(loc) ? "rejected" : "ok";
  }
  // 200 on the POST means the login form came back instead of a session — a stale JSESSIONID.
  // (On the GET the same 200 is simply the form, which is why callers only act on "throttled".)
  if (res.status === 200) return "stale-session";
  return "unreachable";
}

/** First failure is cheap, a persistent one settles at one attempt per five minutes. */
export const KAS_LOGIN_COOLDOWN_STEPS_MS = [30_000, 120_000, 300_000] as const;
/** A 429 skips the ladder: the server named its own problem, so give it the full quiet window. */
export const KAS_LOGIN_THROTTLE_COOLDOWN_MS = 300_000;

export function kasLoginCooldownMs(outcome: KasLoginOutcome, consecutiveFailures: number): number {
  if (outcome === "ok") return 0;
  if (outcome === "throttled") return KAS_LOGIN_THROTTLE_COOLDOWN_MS;
  const steps = KAS_LOGIN_COOLDOWN_STEPS_MS;
  const i = Math.min(Math.max(consecutiveFailures, 1), steps.length) - 1;
  return steps[i]!;
}

/**
 * The ONLY failure worth a second pass is a stale session: kas hands back the login form when our
 * cookie is old, and a cleared jar fixes it on the spot. Throttled is the limiter saying stop;
 * rejected is a password no retry can change; unreachable is a dead socket. Retrying any of those
 * is precisely what turned one 429 into an eighteen-hour outage.
 */
export function kasLoginShouldRetry(outcome: KasLoginOutcome, attempt: number): boolean {
  return outcome === "stale-session" && attempt === 0;
}

/** Say what actually happened. The old message accused the password for all five failure modes. */
export function kasLoginMessage(outcome: KasLoginOutcome, detail = ""): string {
  const d = detail ? ` (${detail})` : "";
  switch (outcome) {
    case "ok":
      return "kas1067 login ok.";
    case "throttled":
      return `kas1067 is rate-limiting logins${d} — "Too many login attempts". This is kas1067's own limiter, NOT a wrong password: it answers an unknown username the same way. Only kas1067 can clear it.`;
    case "rejected":
      return `kas1067 rejected the credentials${d}. Check KAS_USERNAME / KAS_PASSWORD.`;
    case "stale-session":
      return `kas1067 returned the login form instead of a session${d} — stale cookie.`;
    case "unreachable":
      return `kas1067 did not answer the login${d}.`;
  }
}
