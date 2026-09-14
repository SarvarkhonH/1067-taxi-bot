// ─── Comparing two answers to the same question ───────────────────────────────
//
// Shadow mode runs kas1067 and the taxi core side by side and asks both the same
// thing. The point is to find out where they disagree BEFORE a cutover, not
// after.
//
// The trap is obvious once you try it: a naive deep-equal reports every single
// call as a mismatch, because a great many fields differ ON PURPOSE. Ids are
// namespaced across the bridge. A customer's balance is deliberately not in the
// taxi core. A driver's address is not in that schema at all. A report where
// everything is red is a report nobody reads, and the one real difference hides
// inside it.
//
// So every field is one of three things, and which one is a decision somebody
// made, written down here:
//
//   must-match   a difference means a bug, or a cutover that moves money
//   by-design    a difference is expected, and the reason is recorded
//   ignored      noise (timestamps, ordering) that says nothing either way
//
// A field nobody has classified counts as must-match. That is deliberate: an
// unclassified field is one nobody has thought about, and the failure mode of
// this whole exercise is a difference that nobody looked at.

export interface ShadowDiff {
  method: string;
  /** True when every must-match field agreed. */
  ok: boolean;
  /** Human-readable, one per disagreement that matters. */
  problems: string[];
  /** How many must-match fields were actually compared. */
  checked: number;
  /** Differences that were expected, with the reason — so the report can say so. */
  expected: string[];
}

/**
 * Fields that differ by design, per method, with the reason.
 *
 * Every entry here is a claim: "this difference is fine, and here is why". If a
 * reason stops being true, the entry should come out and the shadow run should
 * start failing on it.
 */
export const BY_DESIGN: Record<string, Record<string, string>> = {
  "*": {
    // Ids are namespaced across the bridge so B's order ids cannot collide with
    // historical kas booking ids inside coin idempotency keys.
    id: "id is namespaced across the bridge",
    kasId: "the taxi core mints bj_ ids; kas mints numeric ones",
  },
  getActiveBooking: {
    clientBonus: "a customer's balance is tanga, in the bot's ledger, not in the taxi core",
    priceTier: "vehicle classes are not mapped to kas tier names yet",
  },
  listActiveBookings: {
    clientBonus: "a customer's balance is tanga, in the bot's ledger, not in the taxi core",
    additionalPaymentClient: "one summed column in the taxi core, three in kas",
    additionalPaymentCompany: "one summed column in the taxi core, three in kas",
  },
  getRideHistory: {
    cashback: "tanga is awarded in the bot, not recorded against a ride in the taxi core",
    carNumber: "history is not joined to the driver in the taxi core yet",
    carModel: "history is not joined to the driver in the taxi core yet",
  },
  getRidesByCar: {
    cashback: "tanga is awarded in the bot, not recorded against a ride in the taxi core",
  },
  getReportsPage: {
    cashback: "tanga is awarded in the bot, not recorded against a ride in the taxi core",
  },
  listDriverRoster: {
    address: "not held in the taxi core",
    licenseTerm: "lives in driver_documents, not on the driver row",
    cancels: "not counted per driver in the taxi core yet",
    lastRideAt: "the taxi core answers last-online, which is the nearest honest equivalent",
  },
  getDriverAccount: {
    cancelCount: "not counted per driver in the taxi core yet",
  },
  getTariff: {
    firstKilometerPaymentInRegion: "the village coefficient is a zone multiplier, not a second price list",
    secondKilometerPaymentInRegion: "the village coefficient is a zone multiplier, not a second price list",
    distancePaymentInRegion: "the village coefficient is a zone multiplier, not a second price list",
    minimalDistance: "the taxi core has no minimum-distance rule",
  },
  fetchMembers: {
    points: "a customer's balance is tanga, in the bot's ledger; only a driver's is the taxi core's to state",
    rating: "clients carry no rating in the taxi core",
  },
  fetchByPhone: {
    points: "a customer's balance is tanga, in the bot's ledger; only a driver's is the taxi core's to state",
    rating: "clients carry no rating in the taxi core",
  },
  getMainReport: {
    onlineDrivers: "a live count, read at different instants by the two sources",
  },
};

/** Fields that say nothing either way, whoever answered. */
export const IGNORED = new Set(["at", "createdDate", "updatedAt", "timestamp"]);

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Compare one pair of values for one field. Numbers are compared as numbers. */
function same(a: unknown, b: unknown): boolean {
  if (typeof a === "number" || typeof b === "number") {
    const x = Number(a);
    const y = Number(b);
    if (Number.isFinite(x) && Number.isFinite(y)) return x === y;
  }
  if (a == null && b == null) return true;
  return String(a ?? "") === String(b ?? "");
}

/**
 * Compare what the two sources answered.
 *
 * Arrays are compared by LENGTH and then element by element up to a cap: the
 * first few disagreements tell you what is wrong, and a report carrying two
 * thousand of them tells you nothing you did not learn from the first three.
 */
export function compareShadow(
  method: string,
  live: unknown,
  shadow: unknown,
  opts: { maxItems?: number } = {},
): ShadowDiff {
  const problems: string[] = [];
  const expected: string[] = [];
  let checked = 0;

  const byDesign = { ...(BY_DESIGN["*"] ?? {}), ...(BY_DESIGN[method] ?? {}) };

  const compareOne = (a: unknown, b: unknown, where: string) => {
    if (!isObject(a) || !isObject(b)) {
      checked++;
      if (!same(a, b)) problems.push(`${where}: live=${JSON.stringify(a)} shadow=${JSON.stringify(b)}`);
      return;
    }
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (IGNORED.has(key)) continue;
      if (byDesign[key]) {
        if (!same(a[key], b[key])) expected.push(`${where}${key}: ${byDesign[key]}`);
        continue;
      }
      if (isObject(a[key]) || isObject(b[key])) {
        compareOne(a[key], b[key], `${where}${key}.`);
        continue;
      }
      checked++;
      if (!same(a[key], b[key])) {
        problems.push(`${where}${key}: live=${JSON.stringify(a[key])} shadow=${JSON.stringify(b[key])}`);
      }
    }
  };

  if (Array.isArray(live) || Array.isArray(shadow)) {
    const l = Array.isArray(live) ? live : [];
    const s = Array.isArray(shadow) ? shadow : [];
    checked++;
    if (l.length !== s.length) problems.push(`length: live=${l.length} shadow=${s.length}`);
    const cap = Math.min(opts.maxItems ?? 5, l.length, s.length);
    for (let i = 0; i < cap; i++) compareOne(l[i], s[i], `[${i}].`);
  } else if (live == null || shadow == null) {
    checked++;
    if ((live == null) !== (shadow == null)) {
      problems.push(`one source answered null: live=${live == null ? "null" : "value"} shadow=${shadow == null ? "null" : "value"}`);
    }
  } else {
    compareOne(live, shadow, "");
  }

  return { method, ok: problems.length === 0, problems, checked, expected };
}

// ─── Saying a thing once ──────────────────────────────────────────────────────
//
// The comparator above decides WHETHER two answers disagree. This decides
// whether that disagreement is worth printing AGAIN.
//
// It matters more than it sounds. While a rider is waiting for a driver the bot
// polls active bookings every 5 seconds; kas has their ride, the taxi core does
// not, and that one true finding would print ~240 identical lines an hour. A
// week of it buries every other finding under a hundred thousand copies of the
// first one — which is the same failure as reporting nothing, arrived at from
// the other direction.
//
// So a problem is printed the first time its SHAPE appears and counted every
// time after. The running totals live in the half-hourly summary, where a count
// belongs.

/**
 * The shape of a problem: the same finding with different numbers in it.
 *
 * "length: live=2 shadow=0" and "length: live=7 shadow=0" are one finding, so
 * digits are stripped. Quoted values are kept — two drivers whose names differ
 * are genuinely two findings.
 */
export function problemShape(method: string, problem: string): string {
  return `${method}|${problem.replace(/\d+/g, "#")}`;
}

/** Past this many distinct shapes, detail stops and only counts continue. */
export const SHAPE_CAP = 300;

/**
 * Remembers which disagreements have already been printed.
 *
 * Pure and in @t1067/shared on purpose: packages/server has no test runner, and
 * "which lines does a week of shadow mode actually print" is the difference
 * between a readable report and an unreadable one.
 */
export class ProblemLog {
  private readonly seen = new Set<string>();
  private announcedCap = false;

  /** How many distinct disagreements have been seen. */
  get distinct(): number {
    return this.seen.size;
  }

  /**
   * The problems worth printing now — empty when every one of them has been
   * printed before. Returns the cap notice exactly once, when it is reached.
   */
  fresh(method: string, problems: string[]): string[] {
    const out: string[] = [];
    for (const p of problems) {
      if (this.seen.size >= SHAPE_CAP) {
        if (this.announcedCap) return out;
        this.announcedCap = true;
        out.push(
          `${SHAPE_CAP} distinct disagreements printed — further detail suppressed, ` +
          "counts continue in the summary",
        );
        return out;
      }
      const key = problemShape(method, p);
      if (this.seen.has(key)) continue;
      this.seen.add(key);
      out.push(p);
    }
    return out;
  }
}

// ─── An empty answer is not an answer ─────────────────────────────────────────
//
// Found by shadow mode on 2026-09-14, five hours in: kas1067 answered
// `api/addresses/` with ZERO places, fourteen times out of fourteen, while the
// taxi core answered with 112. Nothing threw, so the bot handed every customer
// typing an address an empty catalog — and the catalog is half of how a typed
// address is resolved. The code that added it says so in its own comment: the
// narrow list "MISSES many real places (shabada)".
//
// The cache holding a good copy was sitting right there, unused, because the
// code only consulted it when the request THREW. An answer of zero from a
// source that has always had about a hundred and eleven places is not news
// about the town.

/**
 * Which catalog to serve: the one just fetched, or the one we already had.
 *
 * Empty loses to non-empty, always. This is deliberately not "newest wins" —
 * the whole failure is that the newest was empty and won.
 */
export function chooseCatalog<T>(fresh: T[], cached: T[] | undefined): { rows: T[]; servedStale: boolean } {
  if (fresh.length > 0) return { rows: fresh, servedStale: false };
  const stale = cached ?? [];
  return { rows: stale, servedStale: stale.length > 0 };
}
