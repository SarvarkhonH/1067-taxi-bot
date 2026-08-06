// JAMOA J1 — staff payroll math suite. PURE functions only (no DB, no server).
// Every rule in JAMOA_PLAN §1.3/§5 gets an assertion here; CI runs this on every
// push, so a payroll regression fails the build before it can touch real wages.
import { describe, expect, it } from "vitest";
import {
  STAFF_POLICY_DEFAULTS,
  type StaffDayPolicy,
  computeDayPay,
  countPayableDaysInMonth,
  countWorkDaysInMonth,
  dailyRateFor,
  dateKey,
  dayKindFor,
  hhmmToMin,
  hourlyRateFor,
  isoWeekday,
  minutesSinceTashkentMidnight,
  resolveStaffPolicy,
  shiftLengthMin,
  shiftPayableMin,
  tashkentDayMinutes,
} from "../staff";

// Baseline: operator, 3 000 000 so'm/oy, 09:00–18:00, Mon–Sat, defaults everywhere.
const BASE: StaffDayPolicy = {
  ...STAFF_POLICY_DEFAULTS,
  payType: "oylik",
  monthlySalary: 3_000_000,
  dailyRate: 0,
  hourlyRate: 0,
};
// July 2026: 27 Mon–Sat workdays → daily 111 111; 9h shift − 1h lunch = 8h payable
// → hourly 13 888.875. Full day base pay = min(daily, round(480/60×hourly)) = 111 111.
const JUL = { year: 2026, month: 7 } as const;
const D = (over: Partial<StaffDayPolicy> = {}): StaffDayPolicy => ({ ...BASE, ...over });

describe("hhmmToMin / isoWeekday / month math", () => {
  it("parses HH:MM", () => {
    expect(hhmmToMin("09:00")).toBe(540);
    expect(hhmmToMin("00:30")).toBe(30);
    expect(hhmmToMin("18:05")).toBe(1085);
  });
  it("rejects malformed times loudly", () => {
    expect(() => hhmmToMin("9am")).toThrow();
    expect(() => hhmmToMin("25:00")).toThrow();
    expect(() => hhmmToMin("12:99")).toThrow();
  });
  it("isoWeekday: 2026-07-31 is Friday (5), 2026-08-02 is Sunday (7)", () => {
    expect(isoWeekday(2026, 7, 31)).toBe(5);
    expect(isoWeekday(2026, 8, 2)).toBe(7);
  });
  it("counts Mon–Sat workdays: Jul-2026 = 27, Feb-2026 = 24", () => {
    expect(countWorkDaysInMonth(2026, 7, "123456")).toBe(27);
    expect(countWorkDaysInMonth(2026, 2, "123456")).toBe(24);
  });
  it("counts Mon–Fri workdays: Jul-2026 = 23", () => {
    expect(countWorkDaysInMonth(2026, 7, "12345")).toBe(23);
  });
});

describe("oy taqvimi — per-date dam/bayram/ish overrides (owner: 'ish kunlari har oy yaratiladi')", () => {
  // July 2026 Mon–Sat baseline = 27 workdays.
  it("dateKey pads correctly", () => expect(dateKey(2026, 7, 5)).toBe("2026-07-05"));
  it("weekly mask decides when no override", () => {
    expect(dayKindFor(2026, 7, 31, "123456")).toBe("ish"); // Friday
    expect(dayKindFor(2026, 8, 2, "123456")).toBe("dam"); // Sunday
  });
  it("override wins over the mask: working Sunday, extra rest Tuesday, bayram Monday", () => {
    const cal = { "2026-07-05": "ish", "2026-07-07": "dam", "2026-07-20": "bayram" } as const;
    expect(dayKindFor(2026, 7, 5, "123456", cal)).toBe("ish"); // Sunday → ish
    expect(dayKindFor(2026, 7, 7, "123456", cal)).toBe("dam"); // Tuesday → dam
    expect(dayKindFor(2026, 7, 20, "123456", cal)).toBe("bayram");
  });
  it("workday count follows the calendar: +working Sunday −rest day −bayram", () => {
    const cal = { "2026-07-05": "ish", "2026-07-07": "dam", "2026-07-20": "bayram" } as const;
    expect(countWorkDaysInMonth(2026, 7, "123456", cal)).toBe(26); // 27 +1 −1 −1
  });
  it("PAID bayram keeps the divisor (month still sums to exactly the salary)", () => {
    const cal = { "2026-07-20": "bayram" } as const;
    const p = D({ calendar: cal }); // holidayPaid=true default
    expect(countPayableDaysInMonth(p, 2026, 7)).toBe(27); // 26 ish + 1 paid bayram
    expect(dailyRateFor(p, 2026, 7)).toBe(111_111);
    // 26 worked days + 1 bayram day = 27 × 111 111 ≈ salary
  });
  it("UNPAID bayram shrinks the divisor instead of every day's rate", () => {
    const cal = { "2026-07-20": "bayram" } as const;
    const p = D({ calendar: cal, holidayPaid: false });
    expect(countPayableDaysInMonth(p, 2026, 7)).toBe(26);
    expect(dailyRateFor(p, 2026, 7)).toBe(Math.round(3_000_000 / 26));
  });
  it("hafta naqshlari: har kun ish / faqat shanba dam / shanba-yakshanba dam", () => {
    expect(countWorkDaysInMonth(2026, 7, "1234567")).toBe(31); // har kun
    expect(countWorkDaysInMonth(2026, 7, "123457")).toBe(27); // faqat shanba dam
    expect(countWorkDaysInMonth(2026, 7, "12345")).toBe(23); // sh-yak dam
  });
});

describe("rates — oylik → kunlik → soatlik derivation", () => {
  it("haqiqiy divisor: 3 000 000 / 27 workdays = 111 111", () => {
    expect(dailyRateFor(D(), JUL.year, JUL.month)).toBe(111_111);
  });
  it("qatiy divisor: 3 000 000 / 26 = 115 385 in EVERY month", () => {
    const p = D({ divisorMode: "qatiy" });
    expect(dailyRateFor(p, 2026, 7)).toBe(115_385);
    expect(dailyRateFor(p, 2026, 2)).toBe(115_385);
  });
  it("shift 9h − unpaid 60min lunch = 480 payable minutes", () => {
    expect(shiftLengthMin(BASE)).toBe(540);
    expect(shiftPayableMin(BASE)).toBe(480);
  });
  it("hourly × full payable shift lands exactly on the daily rate", () => {
    const hourly = hourlyRateFor(D(), JUL.year, JUL.month);
    expect(Math.round((hourly * shiftPayableMin(BASE)) / 60)).toBe(111_111);
  });
  it("paid lunch → payable = full shift length", () => {
    expect(shiftPayableMin(D({ lunchPaid: true }))).toBe(540);
  });
});

describe("computeDayPay — ishladi (the owner's core rules)", () => {
  it("full on-time day earns exactly the daily rate", () => {
    const r = computeDayPay(D(), { ...JUL, dayStatus: "ishladi", checkInMin: hhmmToMin("09:00"), checkOutMin: hhmmToMin("18:00") });
    expect(r.minutesWorked).toBe(480);
    expect(r.amountEarned).toBe(111_111);
  });
  it("grace: 09:09 arrival counts from 09:00 (full pay)", () => {
    const r = computeDayPay(D(), { ...JUL, dayStatus: "ishladi", checkInMin: hhmmToMin("09:09"), checkOutMin: hhmmToMin("18:00") });
    expect(r.amountEarned).toBe(111_111);
  });
  it("beyond grace: 09:40 arrival → paid only from 09:40 (kechikdi = kam oladi)", () => {
    const r = computeDayPay(D(), { ...JUL, dayStatus: "ishladi", checkInMin: hhmmToMin("09:40"), checkOutMin: hhmmToMin("18:00") });
    expect(r.minutesWorked).toBe(440); // 500 − 60 lunch, already at 5-min grain
    expect(r.amountEarned).toBe(Math.round((440 / 60) * ((111_111 * 60) / 480)));
    expect(r.amountEarned).toBeLessThan(111_111);
  });
  it("early arrival + late leave do NOT exceed the daily rate (no silent overtime)", () => {
    const r = computeDayPay(D(), { ...JUL, dayStatus: "ishladi", checkInMin: hhmmToMin("07:30"), checkOutMin: hhmmToMin("21:00") });
    expect(r.minutesWorked).toBe(480);
    expect(r.amountEarned).toBe(111_111);
  });
  it("half day: leave at 13:00 → 4h, no lunch deduction (< 6h threshold)", () => {
    const r = computeDayPay(D(), { ...JUL, dayStatus: "ishladi", checkInMin: hhmmToMin("09:00"), checkOutMin: hhmmToMin("13:00") });
    expect(r.minutesWorked).toBe(240);
    expect(r.amountEarned).toBe(Math.round((240 / 60) * ((111_111 * 60) / 480)));
  });
  it("rounding: 17:58 checkout rounds to the 5-min grain", () => {
    const r = computeDayPay(D(), { ...JUL, dayStatus: "ishladi", checkInMin: hhmmToMin("09:00"), checkOutMin: hhmmToMin("17:58") });
    expect(r.minutesWorked % 5).toBe(0);
    expect(r.minutesWorked).toBe(480); // 478 → rounds up to 480
  });
  it("checkout before checkin (past midnight) rolls forward, not negative", () => {
    const p = D({ shiftStart: "16:00", shiftEnd: "00:30", lunchThresholdMin: 9999 });
    const r = computeDayPay(p, { ...JUL, dayStatus: "ishladi", checkInMin: hhmmToMin("16:00"), checkOutMin: hhmmToMin("00:30") });
    expect(r.minutesWorked).toBe(510); // full to'y shift, no lunch
    expect(r.amountEarned).toBeGreaterThan(0);
  });
  it("arrived after shift end → 0 (clipped)", () => {
    const r = computeDayPay(D(), { ...JUL, dayStatus: "ishladi", checkInMin: hhmmToMin("19:00"), checkOutMin: hhmmToMin("20:00") });
    expect(r.amountEarned).toBe(0);
  });
  it("missing check-in/out on an ishladi row → 0 (defensive)", () => {
    expect(computeDayPay(D(), { ...JUL, dayStatus: "ishladi" }).amountEarned).toBe(0);
  });
});

describe("computeDayPay — day statuses", () => {
  const day = (dayStatus: Parameters<typeof computeDayPay>[1]["dayStatus"]) => computeDayPay(D(), { ...JUL, dayStatus });
  it("kelmadi → 0 (kemagan kuniga pul yozilmaydi)", () => expect(day("kelmadi").amountEarned).toBe(0));
  it("javobli → 0", () => expect(day("javobli").amountEarned).toBe(0));
  it("kasallik: default 0%, configurable 50% → half daily", () => {
    expect(day("kasallik").amountEarned).toBe(0);
    expect(computeDayPay(D({ sickPct: 50 }), { ...JUL, dayStatus: "kasallik" }).amountEarned).toBe(Math.round(111_111 / 2));
  });
  it("tatil: default 100% of daily", () => expect(day("tatil").amountEarned).toBe(111_111));
  it("bayram: paid by default, 0 when holidayPaid=false", () => {
    expect(day("bayram").amountEarned).toBe(111_111);
    expect(computeDayPay(D({ holidayPaid: false }), { ...JUL, dayStatus: "bayram" }).amountEarned).toBe(0);
  });
});

describe("computeDayPay — payType kunlik / soatlik", () => {
  it("kunlik: full day = the fixed daily rate, in any month", () => {
    const p = D({ payType: "kunlik", dailyRate: 200_000, monthlySalary: 0 });
    const r = computeDayPay(p, { year: 2026, month: 2, dayStatus: "ishladi", checkInMin: hhmmToMin("09:00"), checkOutMin: hhmmToMin("18:00") });
    expect(r.amountEarned).toBe(200_000);
  });
  it("kunlik late arrival is pro-rated too (owner rule applies to everyone)", () => {
    const p = D({ payType: "kunlik", dailyRate: 200_000, monthlySalary: 0 });
    const r = computeDayPay(p, { ...JUL, dayStatus: "ishladi", checkInMin: hhmmToMin("13:00"), checkOutMin: hhmmToMin("18:00") });
    expect(r.amountEarned).toBe(Math.round((300 / 60) * ((200_000 * 60) / 480)));
  });
  it("soatlik: strict hours × rate", () => {
    const p = D({ payType: "soatlik", hourlyRate: 15_000, monthlySalary: 0 });
    const r = computeDayPay(p, { ...JUL, dayStatus: "ishladi", checkInMin: hhmmToMin("09:00"), checkOutMin: hhmmToMin("14:00") });
    expect(r.minutesWorked).toBe(300);
    expect(r.amountEarned).toBe(75_000);
  });
});

describe("computeDayPay — overtime policy", () => {
  const late = { ...JUL, dayStatus: "ishladi" as const, checkInMin: hhmmToMin("09:00"), checkOutMin: hhmmToMin("20:00") };
  it("off (default): extra hours ignored", () => {
    expect(computeDayPay(D(), late).amountEarned).toBe(111_111);
  });
  it("qolda: only owner-approved minutes are paid, ×1.5", () => {
    const r = computeDayPay(D({ overtimeMode: "qolda" }), { ...late, approvedOvertimeMin: 60 });
    const hourly = (111_111 * 60) / 480;
    expect(r.overtimeMin).toBe(60);
    expect(r.amountEarned).toBe(111_111 + Math.round(hourly * 1.5));
  });
  it("qolda without approval pays nothing extra", () => {
    expect(computeDayPay(D({ overtimeMode: "qolda" }), late).amountEarned).toBe(111_111);
  });
  it("avto: arriving AFTER shift end earns overtime only from arrival (verifier bug)", () => {
    const r = computeDayPay(D({ overtimeMode: "avto" }), { ...JUL, dayStatus: "ishladi", checkInMin: hhmmToMin("20:00"), checkOutMin: hhmmToMin("22:00") });
    expect(r.minutesWorked).toBe(0); // shift itself untouched
    expect(r.overtimeMin).toBe(120); // NOT 240 — the empty 18:00–20:00 is not paid
  });
  it("avto: minutes past shift end ×1.5 automatically", () => {
    const r = computeDayPay(D({ overtimeMode: "avto" }), late);
    expect(r.overtimeMin).toBe(120);
    const hourly = (111_111 * 60) / 480;
    expect(r.amountEarned).toBe(111_111 + Math.round(2 * hourly * 1.5));
  });

  // Simmetrik erta-kelish overtime (ega qarori 2026-08-06: "hamma xodimni har
  // daqiqasi uchun qo'shimcha to'lanishi kerak" — Elbek voqeasi). Off rejimda
  // yuqoridagi "no silent overtime" test o'zgarmagan (§136) — bu FAQAT avto rejimda.
  it("avto: EARLY arrival (before shiftStart) also pays overtime, symmetric to late", () => {
    const r = computeDayPay(D({ overtimeMode: "avto" }), { ...JUL, dayStatus: "ishladi", checkInMin: hhmmToMin("07:30"), checkOutMin: hhmmToMin("18:00") });
    expect(r.minutesWorked).toBe(480); // asosiy kun o'zgarmagan — kafolatlangan
    expect(r.overtimeMin).toBe(90); // 07:30-09:00 = 90 daq erta
    const hourly = (111_111 * 60) / 480;
    expect(r.amountEarned).toBe(111_111 + Math.round((90 / 60) * hourly * 1.5));
  });
  it("avto: early arrival + late leave — BOTH sides pay overtime (contrast with off-mode §136)", () => {
    const r = computeDayPay(D({ overtimeMode: "avto" }), { ...JUL, dayStatus: "ishladi", checkInMin: hhmmToMin("07:30"), checkOutMin: hhmmToMin("21:00") });
    expect(r.minutesWorked).toBe(480);
    expect(r.overtimeMin).toBe(270); // 90 erta + 180 kech
    const hourly = (111_111 * 60) / 480;
    expect(r.amountEarned).toBe(111_111 + Math.round((270 / 60) * hourly * 1.5));
    expect(r.amountEarned).toBeGreaterThan(111_111); // off-mode'dagi §136 testidan farqli — endi OSHADI
  });
  it("avto: arriving right at shiftStart earns zero early-overtime (not off-by-one)", () => {
    const r = computeDayPay(D({ overtimeMode: "avto" }), { ...JUL, dayStatus: "ishladi", checkInMin: hhmmToMin("09:00"), checkOutMin: hhmmToMin("18:00") });
    expect(r.overtimeMin).toBe(0);
    expect(r.amountEarned).toBe(111_111);
  });
  it("avto: absurdly-early check-in is capped at 4h — no unbounded 'overtime farming' (tekshiruv topgan)", () => {
    const r = computeDayPay(D({ overtimeMode: "avto" }), { ...JUL, dayStatus: "ishladi", checkInMin: hhmmToMin("03:00"), checkOutMin: hhmmToMin("18:00") });
    expect(r.overtimeMin).toBe(240); // 6 soat erta bo'lsa ham, 4 soatdan oshmaydi
  });
  it("avto: a zero-work session (checked out before shift even started) still caps early-OT sanely", () => {
    const r = computeDayPay(D({ overtimeMode: "avto" }), { ...JUL, dayStatus: "ishladi", checkInMin: hhmmToMin("07:00"), checkOutMin: hhmmToMin("07:05") });
    expect(r.minutesWorked).toBe(0); // hech qanday asosiy ish yo'q
    expect(r.overtimeMin).toBe(5); // faqat haqiqatda "u yerda bo'lgan" 5 daq
  });
});

describe("resolveStaffPolicy — org ← employee ← day hierarchy", () => {
  const ORG = {
    divisorMode: "haqiqiy", fixedDivisor: 26, graceMin: 10, roundMin: 5,
    lunchMin: 60, lunchPaid: false, lunchThresholdMin: 360, overtimeMode: "off",
    overtimeMult: 1.5, sickPct: 0, vacationPct: 100, holidayPaid: true,
    workDays: "123456", shiftStart: "09:00", shiftEnd: "18:00",
    calendar: { "2026-07-20": "bayram" },
  };
  const EMP = { payType: "oylik", monthlySalary: 3_000_000, dailyRate: 0, hourlyRate: 0 };
  it("employee nulls inherit org values", () => {
    const p = resolveStaffPolicy(ORG, { ...EMP, shiftStart: null, graceMin: null });
    expect(p.shiftStart).toBe("09:00");
    expect(p.graceMin).toBe(10);
    expect(p.calendar).toEqual({ "2026-07-20": "bayram" });
  });
  it("employee override beats org, day override beats employee", () => {
    const p = resolveStaffPolicy(ORG, { ...EMP, shiftStart: "10:00", workDays: "1234567" }, { shiftStartOvr: "16:00", shiftEndOvr: "23:00" });
    expect(p.shiftStart).toBe("16:00");
    expect(p.shiftEnd).toBe("23:00");
    expect(p.workDays).toBe("1234567");
  });
  it("typo'd enums degrade to safe defaults, junk calendar dropped", () => {
    const p = resolveStaffPolicy({ ...ORG, divisorMode: "xxx", overtimeMode: "yes", calendar: [1] }, { ...EMP, payType: "weird" });
    expect(p.divisorMode).toBe("haqiqiy");
    expect(p.overtimeMode).toBe("off");
    expect(p.payType).toBe("oylik");
    expect(p.calendar).toBeUndefined();
  });
});

describe("Tashkent clock (UTC+5, no DST)", () => {
  it("UTC 2026-07-31 04:04 → Tashkent 09:04 same day", () => {
    const t = tashkentDayMinutes(new Date(Date.UTC(2026, 6, 31, 4, 4)));
    expect(t).toEqual({ date: "2026-07-31", minutes: 544 });
  });
  it("UTC 20:30 → next Tashkent day 01:30 (evening rollover)", () => {
    const t = tashkentDayMinutes(new Date(Date.UTC(2026, 6, 31, 20, 30)));
    expect(t).toEqual({ date: "2026-08-01", minutes: 90 });
  });
  it("minutesSinceTashkentMidnight exceeds 1440 for a next-day checkout", () => {
    // session date 2026-07-31; checkout at Tashkent 2026-08-01 00:30 (UTC 07-31 19:30)
    expect(minutesSinceTashkentMidnight(new Date(Date.UTC(2026, 6, 31, 19, 30)), "2026-07-31")).toBe(1470);
  });
  it("round-trips with computeDayPay for a to'y shift crossing midnight", () => {
    const p = D({ shiftStart: "16:00", shiftEnd: "00:30", lunchThresholdMin: 9999 });
    const checkIn = minutesSinceTashkentMidnight(new Date(Date.UTC(2026, 6, 31, 11, 0)), "2026-07-31"); // 16:00 Tashkent
    const checkOut = minutesSinceTashkentMidnight(new Date(Date.UTC(2026, 6, 31, 19, 30)), "2026-07-31"); // 00:30 next day
    const r = computeDayPay(p, { ...JUL, dayStatus: "ishladi", checkInMin: checkIn, checkOutMin: checkOut });
    expect(r.minutesWorked).toBe(510);
  });
});

describe("idempotence & integer discipline", () => {
  it("same inputs → identical output (safe to recompute on edit)", () => {
    const day = { ...JUL, dayStatus: "ishladi" as const, checkInMin: 551, checkOutMin: 1074 };
    expect(computeDayPay(D(), day)).toEqual(computeDayPay(D(), day));
  });
  it("amounts are always integer so'm", () => {
    for (const out of [hhmmToMin("09:07"), hhmmToMin("17:43"), hhmmToMin("18:00")]) {
      const r = computeDayPay(D(), { ...JUL, dayStatus: "ishladi", checkInMin: hhmmToMin("09:13"), checkOutMin: out });
      expect(Number.isInteger(r.amountEarned)).toBe(true);
      expect(r.amountEarned).toBeGreaterThanOrEqual(0);
    }
  });
});
