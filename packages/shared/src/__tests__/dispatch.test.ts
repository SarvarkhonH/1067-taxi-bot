// 🚕 O'z dispetcher — sof yordamchilar (DISPATCH_PLAN.md §5 DoD #2). DB / tarmoq YO'Q.
import { describe, expect, it } from "vitest";
import {
  DISPATCH_ACTIVE,
  DISPATCH_BOOKING_ID_BASE,
  DISPATCH_STATUSES,
  canTransition,
  dispatchBookingId,
  dispatchEtaMin,
  dispatchFarePresets,
  dispatchRideIdOf,
  dispatchRiderCancellable,
  dispatchToBookingStatus,
  isDispatchActive,
  isDispatchBookingId,
  parseFareInput,
  rankDriverCandidates,
  type DispatchStatus,
} from "../dispatch";
import { bookingCancellable, bookingStatusLabel } from "../booking";
import { BONUS_ECON_KNOBS, clampBonusEcon } from "../economy";

describe("id-fazo (kas id'lari bilan to'qnashmaydi)", () => {
  it("round-trips ride id ↔ booking id", () => {
    expect(dispatchBookingId(1)).toBe(DISPATCH_BOOKING_ID_BASE + 1);
    expect(dispatchRideIdOf(dispatchBookingId(4242))).toBe(4242);
  });
  it("kas ids (small) and garbage are NOT dispatch ids", () => {
    expect(isDispatchBookingId(47115)).toBe(false);
    expect(isDispatchBookingId(0)).toBe(false);
    expect(isDispatchBookingId(NaN)).toBe(false);
    expect(dispatchRideIdOf(133373)).toBeNull();
    expect(isDispatchBookingId(DISPATCH_BOOKING_ID_BASE)).toBe(false); // base itself = ride 0 → yo'q
  });
  it("stays inside Int32 for any realistic ride id", () => {
    expect(dispatchBookingId(50_000_000)).toBeLessThan(2 ** 31);
  });
});

describe("holat lug'ati — mijoz UI kas so'zlarini o'qiydi", () => {
  it("every dispatch status maps to a label bookingStatusLabel knows (no ℹ️ fallback)", () => {
    for (const s of DISPATCH_STATUSES) {
      expect(bookingStatusLabel(dispatchToBookingStatus(s)).startsWith("ℹ️")).toBe(false);
    }
  });
  it("searching reads as searching, terminal statuses read as finished/cancelled", () => {
    expect(bookingStatusLabel(dispatchToBookingStatus("searching"))).toBe("🔍 Haydovchi qidirilyapti");
    expect(bookingStatusLabel(dispatchToBookingStatus("finished"))).toBe("🏁 Safar yakunlandi");
    expect(bookingStatusLabel(dispatchToBookingStatus("expired"))).toBe("✖ Bekor qilindi");
  });
  it("rider cancellability agrees between the dispatch machine and the kas-style helper", () => {
    for (const s of DISPATCH_ACTIVE) {
      expect(dispatchRiderCancellable(s)).toBe(bookingCancellable(dispatchToBookingStatus(s)));
    }
  });
  it("isDispatchActive covers exactly the 4 live states", () => {
    expect(DISPATCH_STATUSES.filter(isDispatchActive)).toEqual(["searching", "accepted", "arrived", "started"]);
    expect(isDispatchActive("weird")).toBe(false);
  });
});

describe("holat-mashina", () => {
  const all = DISPATCH_STATUSES as readonly DispatchStatus[];
  it("driver: searching→accepted→arrived→started→finished, and nothing skips a step", () => {
    expect(canTransition("searching", "accepted", "driver")).toBe(true);
    expect(canTransition("accepted", "arrived", "driver")).toBe(true);
    expect(canTransition("arrived", "started", "driver")).toBe(true);
    expect(canTransition("started", "finished", "driver")).toBe(true);
    expect(canTransition("accepted", "started", "driver")).toBe(false);
    expect(canTransition("accepted", "finished", "driver")).toBe(false);
    expect(canTransition("searching", "finished", "driver")).toBe(false);
  });
  it("driver backing out BEFORE arrival re-opens the search; a no-show at the door closes the ride", () => {
    expect(canTransition("accepted", "searching", "driver")).toBe(true);
    expect(canTransition("arrived", "searching", "driver")).toBe(false);
    expect(canTransition("arrived", "cancelled", "driver")).toBe(true);
    expect(canTransition("started", "searching", "driver")).toBe(false);
    expect(canTransition("started", "cancelled", "driver")).toBe(false);
  });
  it("rider can cancel until the driver ARRIVES (kas rule), never after", () => {
    expect(canTransition("searching", "cancelled", "rider")).toBe(true);
    expect(canTransition("accepted", "cancelled", "rider")).toBe(true);
    expect(canTransition("arrived", "cancelled", "rider")).toBe(false);
    expect(canTransition("started", "cancelled", "rider")).toBe(false);
    expect(canTransition("finished", "cancelled", "rider")).toBe(false);
  });
  it("terminal states are frozen for every actor", () => {
    for (const from of ["finished", "cancelled", "expired"] as const) {
      for (const to of all) {
        for (const actor of ["driver", "rider", "system", "admin"] as const) {
          expect(canTransition(from, to, actor)).toBe(false);
        }
      }
    }
  });
  it("only the system can expire a search; admin can cancel any live ride", () => {
    expect(canTransition("searching", "expired", "system")).toBe(true);
    expect(canTransition("searching", "expired", "driver")).toBe(false);
    expect(canTransition("searching", "expired", "rider")).toBe(false);
    for (const s of DISPATCH_ACTIVE) expect(canTransition(s, "cancelled", "admin")).toBe(true);
  });
});

describe("rankDriverCandidates", () => {
  const now = 1_700_000_000_000;
  const opts = { nowMs: now, freshMs: 20 * 60_000, radiusKm: 8 };
  const pickup = { lat: 39.04, lng: 65.57 };
  it("nearest fresh driver first, blind drivers after, far drivers excluded", () => {
    const out = rankDriverCandidates(
      [
        { driverId: 1, lat: 39.10, lng: 65.57, locAt: now - 60_000 }, // ~6.7 km
        { driverId: 2, lat: 39.045, lng: 65.575, locAt: now - 60_000 }, // ~0.7 km
        { driverId: 3, lat: null, lng: null, locAt: null }, // joylashuvsiz
        { driverId: 4, lat: 39.50, lng: 65.57, locAt: now - 60_000 }, // ~51 km → tashqarida
        { driverId: 5, lat: 39.041, lng: 65.571, locAt: now - 3 * 3_600_000 }, // eskirgan → blind
      ],
      pickup,
      opts,
    );
    expect(out.map((r) => r.driverId)).toEqual([2, 1, 3, 5]);
    expect(out[0]!.distanceKm).toBeLessThan(1);
    expect(out[2]!.distanceKm).toBeNull();
    expect(out.find((r) => r.driverId === 4)).toBeUndefined();
  });
  it("no pickup coords → located drivers keep order, blind ones still last", () => {
    const out = rankDriverCandidates(
      [
        { driverId: 9, lat: null, lng: null, locAt: null },
        { driverId: 7, lat: 39.1, lng: 65.5, locAt: now },
        { driverId: 8, lat: 39.2, lng: 65.5, locAt: now },
      ],
      null,
      opts,
    );
    expect(out.map((r) => r.driverId)).toEqual([7, 8, 9]);
  });
  it("empty in → empty out", () => {
    expect(rankDriverCandidates([], pickup, opts)).toEqual([]);
  });
});

describe("narx variantlari + kiritilgan narx", () => {
  it("presets are ≥ min fare, rounded to 1000, unique, ascending, ≤4", () => {
    const p = dispatchFarePresets(8300, 8000);
    expect(p).toEqual([8000, 10000, 12000, 17000]);
    expect(dispatchFarePresets(null, 8000)).toEqual([8000, 10000, 12000, 16000]);
    expect(dispatchFarePresets(2000, 8000)[0]).toBe(8000); // taxmin minimaldan past bo'lsa minimal
    for (const v of dispatchFarePresets(15250, 8000)) expect(v % 1000).toBe(0);
  });
  it("parseFareInput accepts digits / spaces / 'ming', rejects garbage and absurd values", () => {
    expect(parseFareInput("12 000")).toBe(12000);
    expect(parseFareInput("12000 so'm")).toBe(12000);
    expect(parseFareInput("12 ming")).toBe(12000);
    expect(parseFareInput("abc")).toBeNull();
    expect(parseFareInput("500")).toBeNull();
    expect(parseFareInput("99999999")).toBeNull();
  });
  it("eta: 24 km/h city speed, min 1 minute, null-safe", () => {
    expect(dispatchEtaMin(0.1)).toBe(1);
    expect(dispatchEtaMin(4)).toBe(10);
    expect(dispatchEtaMin(null)).toBeNull();
    expect(dispatchEtaMin(NaN)).toBeNull();
  });
});

describe("knoblar (admin panel avtomatik chizadi)", () => {
  const keys = ["dispatchOfferSec", "dispatchOfferBatch", "dispatchMaxWaves", "dispatchSearchMaxSec", "dispatchLocFreshMin", "dispatchRadiusKm", "dispatchKasFallback"];
  it("all 7 dispatch knobs exist in one group with sane defaults", () => {
    for (const k of keys) {
      const knob = BONUS_ECON_KNOBS.find((x) => x.key === k);
      expect(knob, k).toBeDefined();
      expect(knob!.group).toBe("O'z dispetcher");
      expect(knob!.def).toBeGreaterThanOrEqual(knob!.min);
      expect(knob!.def).toBeLessThanOrEqual(knob!.max);
    }
  });
  it("clamp keeps the fallback knob boolean-shaped and offer timing inside bounds", () => {
    expect(clampBonusEcon("dispatchKasFallback", 5)).toBe(1);
    expect(clampBonusEcon("dispatchKasFallback", -1)).toBe(0);
    expect(clampBonusEcon("dispatchOfferSec", 1)).toBe(10);
    expect(clampBonusEcon("dispatchOfferSec", 999)).toBe(90);
    expect(clampBonusEcon("dispatchOfferBatch", NaN)).toBe(4);
  });
});
