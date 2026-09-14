import { describe, it, expect } from "vitest";
import { chooseMemberRow, normPhone, isBridgeKasId, mayOverwritePoints, type MemberRow } from "../memberMatch";

// --- Why this file exists ----------------------------------------------------
//
// Every coin, tier, mission, referral and streak in this system hangs off a
// Member row. Put an incoming person on the wrong one and nothing errors —
// somebody's balance simply moves, or is left behind on a row they can no
// longer see.
//
// One day makes this dangerous: the cutover. Every customer is stored today
// under their kas1067 id. The moment the taxi core starts answering instead,
// the same human arrives with a "bj_" id, and the naive answer is to create a
// second row. Their tanga stays on the first one, invisible, until somebody
// tries to spend it and rings the office.
//
// So the tests below are written from the failing side: each one is a way of
// losing a balance.

const client = (id: number, kasId: string, phone: string | null): MemberRow =>
  ({ id, type: "client", kasId, phone });
const driver = (id: number, kasId: string, phone: string | null): MemberRow =>
  ({ id, type: "driver", kasId, phone });

describe("a member we already track", () => {
  it("is updated, never duplicated", () => {
    const rows = [client(1, "4812", "+998901234567")];
    expect(chooseMemberRow({ type: "client", kasId: "4812", phone: "998901234567" }, rows))
      .toEqual({ action: "update", id: 1, why: "same-id" });
  });

  it("is matched by type as well as id, because the two id spaces overlap", () => {
    // kas numbers clients and drivers separately: "12" is a different person in
    // each. Matching on the id alone would merge two strangers.
    const rows = [client(1, "12", "+998901111111")];
    expect(chooseMemberRow({ type: "driver", kasId: "12", phone: "+998902222222" }, rows))
      .toEqual({ action: "create", why: "new" });
  });
});

describe("cutover day — the taxi core starts answering instead of kas1067", () => {
  it("takes over the row the customer already has, so the balance travels", () => {
    // THE test. Without this the sync creates a second row and the tanga stays
    // behind on the kas one.
    const rows = [client(7, "4812", "+998901234567")];
    expect(chooseMemberRow({ type: "client", kasId: "bj_31", phone: "998901234567" }, rows))
      .toEqual({ action: "adopt", id: 7, why: "cutover" });
  });

  it("takes over a self-registered row too", () => {
    const rows = [client(9, "tg_55512", "901234567")];
    expect(chooseMemberRow({ type: "client", kasId: "bj_31", phone: "+998 90 123 45 67" }, rows))
      .toEqual({ action: "adopt", id: 9, why: "cutover" });
  });

  it("prefers the row of the same type when a phone has two", () => {
    // One person, a client row and a driver row. An incoming driver belongs on
    // the driver row; landing on the client one would move a driver's balance
    // into a passenger's wallet.
    const rows = [client(4, "111", "901234567"), driver(5, "222", "901234567")];
    expect(chooseMemberRow({ type: "driver", kasId: "bj_9", phone: "901234567" }, rows))
      .toEqual({ action: "adopt", id: 5, why: "cutover" });
  });

  it("upgrades a client row in place when the same person turns out to be our driver", () => {
    // The existing behaviour for kas, kept for the bridge: a self-registered
    // client who is really a driver keeps their id, their telegram link and
    // their coins.
    const rows = [client(4, "tg_777", "901234567")];
    expect(chooseMemberRow({ type: "driver", kasId: "bj_9", phone: "901234567" }, rows))
      .toEqual({ action: "adopt", id: 4, why: "cutover" });
  });

  it("does NOT merge two rows that both came from us", () => {
    // Two bridge ids sharing a phone is a duplicate in the taxi core, and
    // merging it here would hide a problem that belongs to be fixed there.
    const rows = [client(3, "bj_10", "901234567")];
    expect(chooseMemberRow({ type: "client", kasId: "bj_11", phone: "901234567" }, rows))
      .toEqual({ action: "create", why: "new" });
  });

  it("picks the same row every run when a phone somehow has several", () => {
    // Oldest first. A tie broken differently on two runs moves a balance back
    // and forth and looks like corruption.
    const rows = [client(30, "999", "901234567"), client(12, "888", "901234567")];
    const a = chooseMemberRow({ type: "client", kasId: "bj_1", phone: "901234567" }, rows);
    const b = chooseMemberRow({ type: "client", kasId: "bj_1", phone: "901234567" }, [...rows].reverse());
    expect(a).toEqual(b);
    expect(a).toEqual({ action: "adopt", id: 12, why: "cutover" });
  });
});

describe("kas1067 meets somebody the bot already knew", () => {
  it("adopts the self-registered row — today's behaviour, unchanged", () => {
    const rows = [client(2, "tg_98765", "901234567")];
    expect(chooseMemberRow({ type: "client", kasId: "4812", phone: "901234567" }, rows))
      .toEqual({ action: "adopt", id: 2, why: "self-registered" });
  });

  it("does NOT take over a real kas row belonging to another id", () => {
    // Two kas records sharing a phone are kas's business. Silently merging them
    // here would be this system deciding two strangers are one person.
    const rows = [client(2, "4812", "901234567")];
    expect(chooseMemberRow({ type: "client", kasId: "9999", phone: "901234567" }, rows))
      .toEqual({ action: "create", why: "new" });
  });
});

describe("a phone we cannot match on", () => {
  it("creates rather than guessing", () => {
    // No phone, or a fragment of one. Adopting on a partial number is how two
    // people become one account.
    expect(chooseMemberRow({ type: "client", kasId: "bj_1", phone: null }, [client(1, "x", "901234567")]))
      .toEqual({ action: "create", why: "new" });
    expect(chooseMemberRow({ type: "client", kasId: "bj_1", phone: "1234" }, [client(1, "x", "901234567")]))
      .toEqual({ action: "create", why: "new" });
  });
});

describe("phone normalisation", () => {
  it("is the last nine digits, however the number was written", () => {
    // The three spellings of one Uzbek number that every source produces.
    expect(normPhone("+998901234567")).toBe("901234567");
    expect(normPhone("998901234567")).toBe("901234567");
    expect(normPhone("90 123 45 67")).toBe("901234567");
    expect(normPhone(null)).toBe("");
  });
});

describe("id namespaces", () => {
  it("tells ours from kas's", () => {
    expect(isBridgeKasId("bj_42")).toBe(true);
    expect(isBridgeKasId("4812")).toBe(false);
    expect(isBridgeKasId("tg_55")).toBe(false);
  });
});

describe("what a source is allowed to overwrite", () => {
  it("lets the taxi core set a DRIVER's balance, because it holds it", () => {
    expect(mayOverwritePoints({ type: "driver", kasId: "bj_9", phone: "901234567" })).toBe(true);
  });

  it("stops it setting a CUSTOMER's, because it does not hold that", () => {
    // A customer's money is tanga, in this system's own ledger. Letting the
    // taxi core write `points` would drop every customer's level to zero on
    // cutover day while looking like a successful sync.
    expect(mayOverwritePoints({ type: "client", kasId: "bj_9", phone: "901234567" })).toBe(false);
  });

  it("leaves kas1067 and self-registration alone", () => {
    expect(mayOverwritePoints({ type: "client", kasId: "4812", phone: "901234567" })).toBe(true);
    expect(mayOverwritePoints({ type: "client", kasId: "tg_5", phone: "901234567" })).toBe(true);
  });
});
