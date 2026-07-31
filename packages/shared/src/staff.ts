// 👔 JAMOA (JAMOA_PLAN.md) — staff attendance/payroll math. PURE functions only:
// no DB, no Date.now, no timezone reads — the server layer converts real clock
// times to Asia/Tashkent minutes-from-midnight BEFORE calling in, so every rule
// here is unit-testable and the money math is identical in bot/panel/tests.
// REAL so'm accounting — completely separate from the tanga economy (CoinTxn).

export type StaffPayType = "oylik" | "kunlik" | "soatlik";

export type StaffDayStatus =
  | "ishladi" // worked — pay from check-in/check-out
  | "kelmadi" // absent, no excuse → 0
  | "javobli" // excused absence (owner approved) → 0
  | "kasallik" // sick day → dailyRate × sickPct
  | "tatil" // paid vacation → dailyRate × vacationPct
  | "bayram"; // org holiday → dailyRate × (holidayPaid ? 100% : 0)

// Resolved policy for ONE employee on ONE day. The service layer merges
// org defaults ← employee overrides ← day override before calling computeDayPay,
// so this shape is always fully populated (no nulls to branch on here).
export interface StaffDayPolicy {
  payType: StaffPayType;
  monthlySalary: number; // so'm — used when payType === "oylik"
  dailyRate: number; // so'm — used when payType === "kunlik"
  hourlyRate: number; // so'm — used when payType === "soatlik"
  divisorMode: "haqiqiy" | "qatiy"; // oylik → kunlik: real workdays in month vs fixed
  fixedDivisor: number; // e.g. 26 (divisorMode === "qatiy")
  workDays: string; // "12345" — 1=Mon … 7=Sun (which weekdays are workdays)
  shiftStart: string; // "09:00" (day override already applied by caller)
  shiftEnd: string; // "18:00"; end ≤ start means past midnight ("16:00"–"00:30")
  graceMin: number; // arrive within grace → counted from shift start
  roundMin: number; // worked minutes rounded to nearest N (≥1)
  lunchMin: number; // unpaid break auto-deducted…
  lunchPaid: boolean; // …unless the break is paid
  lunchThresholdMin: number; // …and only when actually worked ≥ this (default 360 = 6h)
  overtimeMode: "off" | "qolda" | "avto";
  overtimeMult: number; // e.g. 1.5 — applies to overtime minutes
  sickPct: number; // 0..100 — kasallik pay as % of dailyRate
  vacationPct: number; // 0..100 — ta'til pay as % of dailyRate
  holidayPaid: boolean; // bayram: pay full dailyRate even if not worked
}

export interface StaffDayInput {
  year: number; // Tashkent-local calendar day the session belongs to
  month: number; // 1..12
  dayStatus: StaffDayStatus;
  checkInMin?: number; // minutes from local midnight (9:04 → 544)
  checkOutMin?: number; // may exceed 1440 for past-midnight checkouts
  approvedOvertimeMin?: number; // overtimeMode "qolda": owner-granted minutes
}

export interface StaffDayPay {
  minutesWorked: number; // payable minutes (grace/lunch/clip/rounding applied)
  overtimeMin: number; // payable overtime minutes (per overtimeMode)
  amountEarned: number; // so'm, integer — base + overtime
  dailyRate: number; // resolved rate (transparency for the owner summary)
  hourlyRate: number;
}

export const STAFF_POLICY_DEFAULTS = {
  divisorMode: "haqiqiy",
  fixedDivisor: 26,
  workDays: "123456", // Mon–Sat
  shiftStart: "09:00",
  shiftEnd: "18:00",
  graceMin: 10,
  roundMin: 5,
  lunchMin: 60,
  lunchPaid: false,
  lunchThresholdMin: 360,
  overtimeMode: "off",
  overtimeMult: 1.5,
  sickPct: 0,
  vacationPct: 100,
  holidayPaid: true,
} as const;

/** "09:05" → 545. Throws on malformed input (schema-level data bug, fail loud). */
export function hhmmToMin(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) throw new Error(`staff: bad HH:MM "${hhmm}"`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) throw new Error(`staff: bad HH:MM "${hhmm}"`);
  return h * 60 + min;
}

/** ISO weekday 1=Mon…7=Sun for a calendar date (pure, UTC-based → deterministic). */
export function isoWeekday(year: number, month: number, day: number): number {
  const d = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0=Sun
  return d === 0 ? 7 : d;
}

/** How many workdays (per workDays mask "12345") the given month has. */
export function countWorkDaysInMonth(year: number, month: number, workDays: string): number {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate(); // day count of month
  let n = 0;
  for (let day = 1; day <= last; day++) {
    if (workDays.includes(String(isoWeekday(year, month, day)))) n++;
  }
  return n;
}

/** Shift length in minutes; end ≤ start rolls past midnight ("16:00"–"00:30" → 510). */
export function shiftLengthMin(policy: Pick<StaffDayPolicy, "shiftStart" | "shiftEnd">): number {
  const start = hhmmToMin(policy.shiftStart);
  let end = hhmmToMin(policy.shiftEnd);
  if (end <= start) end += 1440;
  return end - start;
}

/** Payable minutes of a FULL shift (lunch deducted when unpaid + shift long enough). */
export function shiftPayableMin(policy: StaffDayPolicy): number {
  const len = shiftLengthMin(policy);
  const lunch = !policy.lunchPaid && len >= policy.lunchThresholdMin ? Math.min(policy.lunchMin, len) : 0;
  return Math.max(1, len - lunch); // never 0 — divisor for the hourly rate
}

/**
 * Resolved daily rate in so'm for the given month.
 * oylik  → monthlySalary ÷ (real workdays | fixedDivisor)
 * kunlik → dailyRate as-is
 * soatlik→ hourlyRate × payable shift hours (so caps/status-days still work)
 */
export function dailyRateFor(policy: StaffDayPolicy, year: number, month: number): number {
  if (policy.payType === "kunlik") return policy.dailyRate;
  if (policy.payType === "soatlik") return Math.round((policy.hourlyRate * shiftPayableMin(policy)) / 60);
  const divisor =
    policy.divisorMode === "qatiy"
      ? Math.max(1, policy.fixedDivisor)
      : Math.max(1, countWorkDaysInMonth(year, month, policy.workDays));
  return Math.round(policy.monthlySalary / divisor);
}

/** Hourly rate derived so that a full attended shift earns exactly the daily rate. */
export function hourlyRateFor(policy: StaffDayPolicy, year: number, month: number): number {
  if (policy.payType === "soatlik") return policy.hourlyRate;
  return (dailyRateFor(policy, year, month) * 60) / shiftPayableMin(policy);
}

function roundTo(minutes: number, step: number): number {
  const s = Math.max(1, step);
  return Math.round(minutes / s) * s;
}

/**
 * THE money function — one day, one employee → payable so'm.
 * Rules (JAMOA_PLAN §1.3/§5): late → paid from arrival (grace forgiven), absent → 0,
 * clipped to the shift window, capped at the daily rate, unpaid lunch auto-deducted,
 * overtime only per policy. Idempotent by construction: same inputs, same output.
 */
export function computeDayPay(policy: StaffDayPolicy, day: StaffDayInput): StaffDayPay {
  const daily = dailyRateFor(policy, day.year, day.month);
  const hourly = hourlyRateFor(policy, day.year, day.month);
  const zero: StaffDayPay = {
    minutesWorked: 0,
    overtimeMin: 0,
    amountEarned: 0,
    dailyRate: daily,
    hourlyRate: Math.round(hourly),
  };

  switch (day.dayStatus) {
    case "kelmadi":
    case "javobli":
      return zero;
    case "kasallik":
      return { ...zero, amountEarned: Math.round((daily * clampPct(policy.sickPct)) / 100) };
    case "tatil":
      return { ...zero, amountEarned: Math.round((daily * clampPct(policy.vacationPct)) / 100) };
    case "bayram":
      return { ...zero, amountEarned: policy.holidayPaid ? daily : 0 };
  }

  // dayStatus === "ishladi"
  if (day.checkInMin == null || day.checkOutMin == null) return zero;

  const shiftStart = hhmmToMin(policy.shiftStart);
  let shiftEnd = hhmmToMin(policy.shiftEnd);
  if (shiftEnd <= shiftStart) shiftEnd += 1440; // past-midnight shift

  let checkIn = day.checkInMin;
  let checkOut = day.checkOutMin;
  if (checkOut < checkIn) checkOut += 1440; // checked out past midnight

  // Grace: arriving within graceMin counts as on-time. Later → from actual arrival.
  const effStart = Math.max(shiftStart, checkIn <= shiftStart + policy.graceMin ? shiftStart : checkIn);
  const effEnd = Math.min(shiftEnd, checkOut);

  let worked = Math.max(0, effEnd - effStart);
  if (!policy.lunchPaid && worked >= policy.lunchThresholdMin) worked = Math.max(0, worked - policy.lunchMin);
  worked = roundTo(worked, policy.roundMin);

  const payable = shiftPayableMin(policy);
  worked = Math.min(worked, payable); // cap: a day never exceeds the daily rate
  const base = Math.min(daily, Math.round((worked / 60) * hourly));

  let overtimeMin = 0;
  if (policy.overtimeMode === "qolda") {
    overtimeMin = Math.max(0, Math.floor(day.approvedOvertimeMin ?? 0));
  } else if (policy.overtimeMode === "avto") {
    overtimeMin = roundTo(Math.max(0, checkOut - shiftEnd), policy.roundMin);
  }
  const overtimePay = Math.round((overtimeMin / 60) * hourly * policy.overtimeMult);

  return {
    minutesWorked: worked,
    overtimeMin,
    amountEarned: base + overtimePay,
    dailyRate: daily,
    hourlyRate: Math.round(hourly),
  };
}

function clampPct(p: number): number {
  return Math.min(100, Math.max(0, Number.isFinite(p) ? p : 0));
}
