// ─── Which row does an incoming member belong to? ─────────────────────────────
//
// This is the most dangerous decision in the bridge, and it does not fail
// loudly when it is wrong. Every coin, tier, mission, referral and streak in
// this system hangs off a Member row; put an incoming person on the wrong one
// and you have moved somebody's balance, and nothing errors.
//
// Members arrive from three places, each with its own id shape:
//
//   kas1067        a numeric id, e.g. "4812"
//   self-register  "tg_<telegramId>" or "tg_call:<phone>" — a person the bot
//                  met before kas1067 did
//   the taxi core  "bj_<id>" — us, once we dispatch our own rides
//
// The rule that matters is the third one, and it only bites on ONE day: the
// cutover. Every existing customer is stored today under their kas id. The
// moment the taxi core starts answering instead, the same human arrives with a
// "bj_" id — and without this, the sync creates a SECOND row for them and their
// tanga balance stays behind on the first, invisible, forever. Nobody would
// notice until somebody tries to spend it.
//
// Kept as a pure function, away from Prisma, so the rule is covered by the CI
// shield rather than by whoever is awake at cutover.

export type MemberKind = "client" | "driver";

export interface MemberRow {
  id: number;
  type: string;
  kasId: string;
  phone: string | null;
}

export interface IncomingMember {
  type: MemberKind;
  kasId: string;
  phone?: string | null;
}

export type MemberMatch =
  /** This exact record is already tracked — update it in place. */
  | { action: "update"; id: number; why: "same-id" }
  /** A different id, same human — take over that row so the balance travels. */
  | { action: "adopt"; id: number; why: "self-registered" | "cutover" | "rollback" }
  /** Nobody here is this person. */
  | { action: "create"; why: "new" };

/** Last nine digits: the only part of a phone every source agrees on. */
export function normPhone(s: string | null | undefined): string {
  return String(s ?? "").replace(/\D/g, "").slice(-9);
}

/** An id minted by the taxi core rather than by kas1067. */
export function isBridgeKasId(kasId: string): boolean {
  return kasId.startsWith("bj_");
}

/** An id the bot invented for somebody kas1067 had never heard of. */
export function isSelfRegisteredKasId(kasId: string): boolean {
  return kasId.startsWith("tg_");
}

/** An id minted by kas1067 itself — neither ours nor the bot's. */
export function isKasMintedId(kasId: string): boolean {
  return !isBridgeKasId(kasId) && !isSelfRegisteredKasId(kasId);
}

/**
 * Decide where an incoming member lands.
 *
 * Order matters, and each step exists because of a specific way of being wrong:
 *
 *  1. the same (type, kasId) → update. Anything else would duplicate the record
 *     we are already tracking.
 *  2. a bridge id + a matching phone → adopt whatever row that phone already
 *     has, including a real kas row. This is the cutover, and it is the only
 *     step that keeps a balance attached to its owner.
 *  3. a real kas id + a matching row kas did not mint → adopt it. Two cases:
 *     a person the bot met first (tg_), and — the way back — a row the cutover
 *     renamed (bj_), which rolling back to kas1067 would otherwise duplicate.
 *  4. otherwise create.
 *
 * Never adopts across two rows that both came from the same source: two bridge
 * ids sharing a phone are two records in B, and merging them here would hide a
 * duplicate that belongs to be fixed there.
 */
export function chooseMemberRow(incoming: IncomingMember, rows: MemberRow[]): MemberMatch {
  const exact = rows.find((r) => r.type === incoming.type && r.kasId === incoming.kasId);
  if (exact) return { action: "update", id: exact.id, why: "same-id" };

  const want = normPhone(incoming.phone);
  if (want.length !== 9) return { action: "create", why: "new" };

  const samePhone = rows
    .filter((r) => normPhone(r.phone) === want && r.kasId !== incoming.kasId)
    // Oldest first, so two runs never disagree about which row wins.
    .sort((a, b) => a.id - b.id);

  if (isBridgeKasId(incoming.kasId)) {
    // Cutover. Prefer the same type; otherwise take over a row of the other
    // type — a self-registered "client" who turns out to be our driver is the
    // same person, and splitting them loses whichever half holds the coins.
    const target =
      samePhone.find((r) => r.type === incoming.type && !isBridgeKasId(r.kasId)) ??
      samePhone.find((r) => !isBridgeKasId(r.kasId));
    if (target) return { action: "adopt", id: target.id, why: "cutover" };
    return { action: "create", why: "new" };
  }

  // A real kas id landing on a row that kas did not mint. Two of those exist and
  // the second is the way back:
  //
  //   tg_   a person the bot met before kas had heard of them.
  //   bj_   a row the CUTOVER renamed. Rolling back — KAS_MODE=live, the only
  //         way out — sends that same human under their original numeric id,
  //         which now matches nothing. Creating a second row leaves their whole
  //         tanga balance on the orphan, invisible, until somebody tries to
  //         spend it: the exact failure step 2 exists to prevent, arrived at
  //         from the other direction.
  //
  // So this is the mirror of step 2 — same type first, then any — and between
  // them the rule is symmetric: adopt a row whose id came from somewhere else,
  // never one that came from the same place.
  const target =
    samePhone.find((r) => r.type === incoming.type && !isKasMintedId(r.kasId)) ??
    samePhone.find((r) => !isKasMintedId(r.kasId));
  if (target) {
    return {
      action: "adopt",
      id: target.id,
      why: isBridgeKasId(target.kasId) ? "rollback" : "self-registered",
    };
  }

  return { action: "create", why: "new" };
}

/**
 * May this source overwrite the member's `points`?
 *
 * `points` mirrors a kas1067 figure: a client's cashback in so'm, a driver's
 * account balance. It also feeds XP, level and the leaderboards.
 *
 * The taxi core holds a driver's balance, so for a driver the answer is yes.
 * It does NOT hold a customer's money — that is tanga, in this system's own
 * ledger — so a bridge-sourced client carries no opinion about it, and writing
 * one would drop every customer's level to zero on cutover day while looking
 * like a successful sync.
 *
 * A source that does not know a number must not overwrite it with a guess.
 */
export function mayOverwritePoints(incoming: IncomingMember): boolean {
  return !(isBridgeKasId(incoming.kasId) && incoming.type === "client");
}


/**
 * How many rides has this person taken, and how are they rated?
 *
 * `points` is already protected — a source that does not hold a number must not
 * overwrite it with a guess — but `trips` and `rating` were written by whoever
 * answered last, and on cutover day that is a system with sixteen orders in it.
 * kas1067 has years. The bridge answers `trips: 0` for a customer with 1382
 * rides, and the sync writes it: their whole visible history, their level and
 * every badge hanging off it, gone, while the log says the sync succeeded.
 *
 * A lifetime ride count only ever goes up, which makes the safe answer easy —
 * take the larger. A rating of zero is not a rating, it is "no opinion", so it
 * never replaces one somebody earned.
 *
 * Scoped to bridge ids on purpose: kas is authoritative today and a correction
 * from it, downward or not, is a real correction. This is about the one day the
 * two systems swap places.
 */
export function mergeBridgeCounters(
  incoming: { kasId: string; trips: number; rating: number },
  existing: { trips: number; rating: number } | null,
): { trips: number; rating: number } {
  if (!isBridgeKasId(incoming.kasId) || !existing) {
    return { trips: incoming.trips, rating: incoming.rating };
  }
  return {
    trips: Math.max(incoming.trips, existing.trips),
    rating: incoming.rating > 0 ? incoming.rating : existing.rating,
  };
}
