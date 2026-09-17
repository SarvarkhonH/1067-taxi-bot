import { describe, it, expect } from "vitest";
import {
  CORE_ORDER_STATUSES,
  coreStatusToBooking,
  coreUzPhone,
  coreKmToMeters,
  coreCoord,
  CoreHttpError,
  coreOutcomeUnknown,
  coreRiderMessage,
  coreDriverIdFromKasId,
} from "../taxiCore";
import { bookingStatusLabel, bookingStepIndex, bookingCancellable } from "../booking";

describe("every core status means something to the bot", () => {
  it("covers all twelve values of the core enum", () => {
    expect(CORE_ORDER_STATUSES).toHaveLength(12);
    for (const s of CORE_ORDER_STATUSES) {
      expect(coreStatusToBooking(s).unknown, s).toBe(false);
    }
  });

  it("gives every mapped status a real label, never the raw-word fallback", () => {
    for (const s of CORE_ORDER_STATUSES) {
      const { status } = coreStatusToBooking(s);
      expect(bookingStatusLabel(status), `${s} → ${status}`).not.toMatch(/^ℹ️/);
    }
  });

  it("marks the ride as started only once the meter runs", () => {
    // The whole reward decision hangs on this: rideStartedAt is set on "started".
    expect(coreStatusToBooking("in_progress").status).toBe("started");
    for (const s of CORE_ORDER_STATUSES.filter((x) => x !== "in_progress")) {
      expect(coreStatusToBooking(s).status, s).not.toBe("started");
    }
  });

  it("walks the passenger timeline in order", () => {
    const step = (s: string) => bookingStepIndex(coreStatusToBooking(s).status);
    expect(step("pending")).toBe(0);
    expect(step("dispatching")).toBe(0);
    expect(step("accepted")).toBe(1);
    expect(step("driver_en_route")).toBe(1);
    expect(step("driver_arrived")).toBe(2);
    expect(step("in_progress")).toBe(3);
  });

  it("lets the passenger cancel until the car has arrived, and not after", () => {
    const can = (s: string) => bookingCancellable(coreStatusToBooking(s).status);
    expect(can("pending")).toBe(true);
    expect(can("dispatching")).toBe(true);
    expect(can("no_drivers")).toBe(true);
    expect(can("accepted")).toBe(true);
    expect(can("driver_en_route")).toBe(true);
    expect(can("driver_arrived")).toBe(false);
    expect(can("in_progress")).toBe(false);
  });

  it("keeps an operator rescue in 'searching', so nobody orders twice", () => {
    expect(coreStatusToBooking("no_drivers").status).toBe("searching");
  });

  it("maps each way a ride ends to a cancel, and completion to delivered", () => {
    expect(coreStatusToBooking("completed").status).toBe("delivered");
    expect(coreStatusToBooking("cancelled_client").status).toBe("cancel_by_client");
    expect(coreStatusToBooking("cancelled_driver").status).toBe("cancel_by_driver");
    expect(coreStatusToBooking("cancelled_dispatcher").status).toBe("cancel_by_operator");
    expect(coreStatusToBooking("expired").status).toBe("cancel_by_server");
  });

  it("reports a word it has never seen instead of guessing", () => {
    expect(coreStatusToBooking("teleported")).toEqual({ status: "teleported", unknown: true });
    expect(coreStatusToBooking("").unknown).toBe(true);
  });
});

describe("one person, one phone format", () => {
  it("brings every stored shape to +998 and nine digits", () => {
    expect(coreUzPhone("998907773566")).toBe("+998907773566");
    expect(coreUzPhone("+998907773566")).toBe("+998907773566");
    expect(coreUzPhone("907773566")).toBe("+998907773566");
    expect(coreUzPhone("+998 (90) 777-35-66")).toBe("+998907773566");
  });

  it("refuses something that is not a phone", () => {
    expect(coreUzPhone("12345")).toBeNull();
    expect(coreUzPhone("")).toBeNull();
    expect(coreUzPhone(null)).toBeNull();
  });
});

describe("a write with no answer is not a write that failed", () => {
  it("knows a refusal happened and a timeout might not have", () => {
    expect(coreOutcomeUnknown(new CoreHttpError("POST", "/drivers/payment", 400, "bad"))).toBe(false);
    expect(coreOutcomeUnknown(new CoreHttpError("POST", "/drivers/payment", 404, ""))).toBe(false);
    expect(coreOutcomeUnknown(new CoreHttpError("POST", "/drivers/payment", 502, ""))).toBe(true);
    expect(coreOutcomeUnknown(new Error("The operation was aborted due to timeout"))).toBe(true);
    expect(coreOutcomeUnknown(new TypeError("fetch failed"))).toBe(true);
  });

  it("knows a refused connection sent nothing, and a reset might have", () => {
    const refused = Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } });
    const reset = Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } });
    expect(coreOutcomeUnknown(refused)).toBe(false);
    expect(coreOutcomeUnknown(reset)).toBe(true);
    // what Node 20 actually throws for a timeout and a dropped socket
    const timeout = Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError", code: 23 });
    const socket = Object.assign(new TypeError("fetch failed"), { cause: { code: "UND_ERR_SOCKET" } });
    expect(coreOutcomeUnknown(timeout)).toBe(true);
    expect(coreOutcomeUnknown(socket)).toBe(true);
  });

  it("gives the passenger plain text, never markup", () => {
    for (const e of [new CoreHttpError("POST", "/orders", 400, ""), new Error("x")]) {
      expect(coreRiderMessage(e)).not.toMatch(/<[a-z/]/i);
    }
  });

  it("never shows a passenger the core's English", () => {
    for (const e of [
      new CoreHttpError("POST", "/orders", 400, "Address not found in catalog"),
      new CoreHttpError("POST", "/orders", 500, "boom"),
      new Error("fetch failed"),
    ]) {
      const msg = coreRiderMessage(e);
      expect(msg).not.toMatch(/catalog|boom|fetch|HTTP/i);
      expect(msg).toContain("1067");
    }
    expect(coreRiderMessage(new CoreHttpError("POST", "/orders", 409, ""))).toMatch(/faol buyurtma/);
  });
});

describe("which driver the core should pay", () => {
  it("reads the core's id from a matched member only", () => {
    expect(coreDriverIdFromKasId("bj_123")).toBe(123);
    expect(coreDriverIdFromKasId("4812")).toBeUndefined(); // kas-era number names nobody in the core
    expect(coreDriverIdFromKasId("tg_55512")).toBeUndefined();
    expect(coreDriverIdFromKasId("bj_")).toBeUndefined();
    expect(coreDriverIdFromKasId("bj_0")).toBeUndefined();
    expect(coreDriverIdFromKasId(null)).toBeUndefined();
  });
});

describe("units and positions", () => {
  it("turns kilometres into metres and keeps a missing distance missing", () => {
    expect(coreKmToMeters(2.99)).toBe(2990);
    expect(coreKmToMeters("1.470")).toBe(1470);
    expect(coreKmToMeters(0)).toBe(0);
    expect(coreKmToMeters(null)).toBeUndefined();
    expect(coreKmToMeters(undefined)).toBeUndefined();
    expect(coreKmToMeters("abc")).toBeUndefined();
  });

  it("never reports an unknown position as zero", () => {
    expect(coreCoord(0)).toBeUndefined();
    expect(coreCoord("0")).toBeUndefined();
    expect(coreCoord(null)).toBeUndefined();
    expect(coreCoord("39.0321")).toBe(39.0321);
    expect(coreCoord(65.597)).toBe(65.597);
  });
});
