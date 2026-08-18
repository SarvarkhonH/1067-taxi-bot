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
// Org month calendar (JAMOA_PLAN §5.3): explicit per-date overrides on top of the
// weekly workDays mask — "2026-03-21" → "bayram", a working Sunday → "ish", an
// extra rest day → "dam". Owner edits this month-by-month in the admin panel.
export type StaffDayKind = "ish" | "dam" | "bayram";
export type StaffCalendar = Record<string, StaffDayKind>; // key "YYYY-MM-DD"

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
  calendar?: StaffCalendar; // per-date overrides (dam/bayram/ish) on top of workDays
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

/** "YYYY-MM-DD" for a calendar date (zero-padded, matches StaffCalendar keys). */
export function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * What kind of day is this for the org/employee? Calendar override wins;
 * otherwise the weekly workDays mask decides ish vs dam.
 */
export function dayKindFor(year: number, month: number, day: number, workDays: string, calendar?: StaffCalendar): StaffDayKind {
  const override = calendar?.[dateKey(year, month, day)];
  if (override === "ish" || override === "dam" || override === "bayram") return override;
  return workDays.includes(String(isoWeekday(year, month, day))) ? "ish" : "dam";
}

/** How many workdays (per workDays mask "12345") the given month has. */
export function countWorkDaysInMonth(year: number, month: number, workDays: string, calendar?: StaffCalendar): number {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate(); // day count of month
  let n = 0;
  for (let day = 1; day <= last; day++) {
    if (dayKindFor(year, month, day, workDays, calendar) === "ish") n++;
  }
  return n;
}

/**
 * Divisor days for the "haqiqiy" monthly-salary split: ish days, plus bayram
 * days when they are paid — so a full month always sums to EXACTLY the salary
 * (paid holiday replaces the workday it displaced; unpaid holiday shrinks the
 * divisor instead of silently shrinking every remaining day's rate).
 */
export function countPayableDaysInMonth(policy: Pick<StaffDayPolicy, "workDays" | "calendar" | "holidayPaid">, year: number, month: number): number {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let n = 0;
  for (let day = 1; day <= last; day++) {
    const kind = dayKindFor(year, month, day, policy.workDays, policy.calendar);
    if (kind === "ish" || (kind === "bayram" && policy.holidayPaid)) n++;
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
      : Math.max(1, countPayableDaysInMonth(policy, year, month));
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
    // Ega bitta sonni qo'lda kiritadi — erta+kech birgalikda tasdiqlangan qo'shimcha daqiqa.
    overtimeMin = Math.max(0, Math.floor(day.approvedOvertimeMin ?? 0));
  } else if (policy.overtimeMode === "avto") {
    // Simmetrik qoida (ega 2026-08-06: "hamma xodimni har daqiqasi uchun qo'shimcha
    // to'lanishi kerak"): smenadan TASHQARIDAGI har daqiqa — erta kelgan (shiftStart'dan
    // oldin) VA kech ketgan (shiftEnd'dan keyin) — bir xil overtime formulasi bilan
    // to'lanadi. Kam ishlash (kech kelish/erta ketish) bunga aloqasiz — u `worked`/`base`
    // orqali proporsional KAMAYTIRISH bilan alohida hisoblanadi (yuqorida, o'zgarmagan).
    // Sanoat-cheklov (tekshiruv topgan): xodim tasodifan (yoki suiste'mol qilib) juda
    // erta "Keldim" bossa, cheklovsiz overtime "farming" xavfi bor edi — hech qanday
    // fizik-borlik tekshiruvi yo'q. Har tomon (erta/kech) alohida bitta smenaga oqilona
    // chegara bilan cheklanadi — "qolda" rejimdagi qo'lda-kiritish 0-720 chegarasi bilan
    // bir xil ruhda (staffAdminSessionSet).
    const EARLY_LATE_CAP_MIN = 240; // 4 soat — bir tomonga oqilona maksimal overtime
    const lateMin = Math.min(EARLY_LATE_CAP_MIN, Math.max(0, checkOut - Math.max(shiftEnd, checkIn)));
    const earlyMin = Math.min(EARLY_LATE_CAP_MIN, Math.max(0, Math.min(shiftStart, checkOut) - checkIn));
    overtimeMin = roundTo(lateMin + earlyMin, policy.roundMin);
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

// ---------------------------------------------------------------------------
// Policy resolution + Tashkent clock (pure — the server feeds DB rows in).
// ---------------------------------------------------------------------------

/** Org-level defaults as stored on the Organization row (shape matches Prisma). */
export interface StaffOrgPolicyRow {
  divisorMode: string;
  fixedDivisor: number;
  graceMin: number;
  roundMin: number;
  lunchMin: number;
  lunchPaid: boolean;
  lunchThresholdMin: number;
  overtimeMode: string;
  overtimeMult: number;
  sickPct: number;
  vacationPct: number;
  holidayPaid: boolean;
  workDays: string;
  shiftStart: string;
  shiftEnd: string;
  calendar?: unknown; // Prisma Json — validated here
}

/** Employee-level overrides (null = inherit org). Shape matches Prisma Employee. */
export interface StaffEmployeeRow {
  payType: string;
  monthlySalary: number;
  dailyRate: number;
  hourlyRate: number;
  shiftStart?: string | null;
  shiftEnd?: string | null;
  workDays?: string | null;
  graceMin?: number | null;
  lunchMin?: number | null;
}

/**
 * JAMOA_PLAN §5 hierarchy in one place: org default ← employee override ← day
 * override. Output feeds computeDayPay directly. Unknown enum strings fall back
 * to safe defaults (a typo'd DB row must not crash payroll — it degrades loudly
 * in the owner summary instead).
 */
export function resolveStaffPolicy(
  org: StaffOrgPolicyRow,
  emp: StaffEmployeeRow,
  day?: { shiftStartOvr?: string | null; shiftEndOvr?: string | null }
): StaffDayPolicy {
  const payType: StaffPayType = emp.payType === "kunlik" || emp.payType === "soatlik" ? emp.payType : "oylik";
  const cal = org.calendar && typeof org.calendar === "object" && !Array.isArray(org.calendar) ? (org.calendar as StaffCalendar) : undefined;
  return {
    payType,
    monthlySalary: emp.monthlySalary,
    dailyRate: emp.dailyRate,
    hourlyRate: emp.hourlyRate,
    divisorMode: org.divisorMode === "qatiy" ? "qatiy" : "haqiqiy",
    fixedDivisor: org.fixedDivisor,
    workDays: emp.workDays ?? org.workDays,
    shiftStart: day?.shiftStartOvr ?? emp.shiftStart ?? org.shiftStart,
    shiftEnd: day?.shiftEndOvr ?? emp.shiftEnd ?? org.shiftEnd,
    graceMin: emp.graceMin ?? org.graceMin,
    roundMin: org.roundMin,
    lunchMin: emp.lunchMin ?? org.lunchMin,
    lunchPaid: org.lunchPaid,
    lunchThresholdMin: org.lunchThresholdMin,
    overtimeMode: org.overtimeMode === "qolda" || org.overtimeMode === "avto" ? org.overtimeMode : "off",
    overtimeMult: org.overtimeMult,
    sickPct: org.sickPct,
    vacationPct: org.vacationPct,
    holidayPaid: org.holidayPaid,
    calendar: cal,
  };
}

/** Tashkent is UTC+5 with no DST — a fixed offset is deliberate (no tz-db drift). */
export const TASHKENT_UTC_OFFSET_MIN = 300;

/** The Tashkent calendar day + minutes-from-midnight for an absolute instant. */
export function tashkentDayMinutes(at: Date): { date: string; minutes: number } {
  const shifted = new Date(at.getTime() + TASHKENT_UTC_OFFSET_MIN * 60_000);
  return {
    date: dateKey(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate()),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

/**
 * Minutes since the Tashkent midnight of a SESSION's date ("YYYY-MM-DD") — may
 * exceed 1440 when a past-midnight shift checks out on the next calendar day.
 */
export function minutesSinceTashkentMidnight(at: Date, sessionDate: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(sessionDate);
  if (!m) throw new Error(`staff: bad session date "${sessionDate}"`);
  const midnightUtcMs = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - TASHKENT_UTC_OFFSET_MIN * 60_000;
  return Math.floor((at.getTime() - midnightUtcMs) / 60_000);
}

// ─────────────────────────────────────────────────────────────────────────────
// 📢 Xabarlar · 📖 Qoidalar · 🏆 Mukofotlar · 📈 Maqsad-bonusi (J7–J10)
// Same discipline as computeDayPay: every rule that decides MONEY or a visible
// verdict is a pure function here, unit-tested — the services only fetch rows.
// ─────────────────────────────────────────────────────────────────────────────

/** One StaffNotice row is either an announcement or a rule line of the handbook. */
export type StaffNoticeKind = "xabar" | "qoida";

/** 🏆 Owner-defined money-reward catalog (Organization.rewards Json). */
export interface StaffRewardDef {
  key: string; // stable slug — the ledger idempotency key is built from it
  name: string; // "Kechikmagan oy"
  amount: number; // so'm
  note?: string; // "oy davomida bironta kechikish bo'lmasa"
}

/** Json → catalog, defensively (a hand-edited row must not crash the panel). */
export function parseRewardCatalog(raw: unknown): StaffRewardDef[] {
  if (!Array.isArray(raw)) return [];
  const out: StaffRewardDef[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const name = String(o.name ?? "").trim();
    const amount = Math.round(Number(o.amount ?? 0));
    if (!name || !Number.isFinite(amount) || amount <= 0) continue;
    const key = String(o.key ?? "").trim() || rewardKeyOf(name);
    out.push({ key, name: name.slice(0, 60), amount, ...(o.note ? { note: String(o.note).slice(0, 200) } : {}) });
  }
  return out;
}

/** Slug for a reward name — ASCII-safe, so it can live inside an idempotency key. */
export function rewardKeyOf(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/['`’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return slug || "mukofot";
}

/** 🏅 Computed (never stored) badge — recomputed from KPI, so it can never drift. */
export interface StaffBadge {
  code: "oyxodimi" | "intizom" | "tolik" | "streak";
  label: string;
}

export interface StaffBadgeInput {
  id: number;
  workedDays: number;
  lateDays: number;
  absentDays: number;
  punctualityPct: number;
  minutes: number;
  streak?: number; // consecutive on-time days ending today (service computes)
}

const BADGE_MIN_DAYS = 5; // below this a "perfect month" means nothing yet
const BADGE_STREAK_MIN = 5;

/**
 * Month badges for the whole org at once (the winner badge needs the field).
 * Returns employeeId → badges. Pure: same rows in, same badges out.
 */
export function computeStaffBadges(rows: StaffBadgeInput[]): Map<number, StaffBadge[]> {
  const out = new Map<number, StaffBadge[]>();
  for (const r of rows) out.set(r.id, []);

  // 🥇 Oyning xodimi — punctuality, then days worked, then minutes. Needs a real
  // contest (≥2 people who actually worked) and a spotless discipline record.
  const contenders = rows.filter((r) => r.workedDays > 0);
  if (contenders.length >= 2) {
    const ranked = [...contenders].sort(
      (a, b) => b.punctualityPct - a.punctualityPct || b.workedDays - a.workedDays || b.minutes - a.minutes || a.id - b.id
    );
    const top = ranked[0];
    if (top && top.workedDays >= BADGE_MIN_DAYS && top.absentDays === 0) {
      out.get(top.id)?.push({ code: "oyxodimi", label: "🥇 Oyning xodimi" });
    }
  }

  for (const r of rows) {
    const badges = out.get(r.id);
    if (!badges) continue;
    if (r.workedDays >= BADGE_MIN_DAYS && r.lateDays === 0) badges.push({ code: "intizom", label: "💯 100% intizom" });
    if (r.workedDays >= BADGE_MIN_DAYS && r.absentDays === 0) badges.push({ code: "tolik", label: "📅 Kelmagan kuni yo'q" });
    const streak = r.streak ?? 0;
    if (streak >= BADGE_STREAK_MIN) badges.push({ code: "streak", label: `🔥 ${streak} kun ketma-ket vaqtida` });
  }
  return out;
}

/** Trailing run of on-time days (oldest→newest input, counted from the end). */
export function punctualStreak(daysOldestFirst: { worked: boolean; onTime: boolean }[]): number {
  let n = 0;
  for (let i = daysOldestFirst.length - 1; i >= 0; i--) {
    const d = daysOldestFirst[i];
    if (!d || !d.worked) continue; // dam/ta'til days don't break a streak
    if (!d.onTime) break;
    n++;
  }
  return n;
}

/**
 * 📈 Maqsad-bonusi (owner decision 2026-08-18): the goal is measured on the
 * MONTH AVERAGE of daily completed orders — one lucky day must not unlock a
 * million-so'm bonus. `dailyCounts` are the COMPLETED days only; the caller
 * excludes today (a day in progress would drag the average down all morning).
 */
export interface StaffGoalProgress {
  days: number; // completed days counted
  total: number; // orders in those days
  avg: number; // average per day (1 decimal)
  target: number;
  pct: number; // 0..100 (clamped for the progress bar)
  achieved: boolean;
  needPerDay: number; // per-day pace needed over the REMAINING days to still hit it (0 = done)
  outOfReach: boolean; // remaining days would each have to beat the target by 50%+ — say that
  // plainly instead of printing a pace nobody can hit (the panel/bot then suggest next month)
}

export function goalProgress(dailyCounts: number[], target: number, monthDays = 0): StaffGoalProgress {
  const days = dailyCounts.length;
  const total = dailyCounts.reduce((a, n) => a + (Number.isFinite(n) ? n : 0), 0);
  const tgt = Math.max(1, Math.round(target));
  const avg = days > 0 ? Math.round((total / days) * 10) / 10 : 0;
  const achieved = days > 0 && avg >= tgt;
  const left = Math.max(0, monthDays - days);
  // What the remaining days must average so the WHOLE month lands on target.
  const need = achieved || left <= 0 ? 0 : Math.ceil((tgt * (days + left) - total) / left);
  return {
    days,
    total,
    avg,
    target: tgt,
    pct: Math.max(0, Math.min(100, Math.round((avg / tgt) * 100))),
    achieved,
    needPerDay: Math.max(0, need),
    outOfReach: need > tgt * 1.5,
  };
}

/** Suggested next rung of the ladder (500 → 600), rounded to the step. */
export function nextGoalTarget(target: number, step = 100): number {
  const s = Math.max(1, Math.round(step));
  return Math.round(target / s) * s + s;
}

/**
 * Split the goal pot by DAYS WORKED (owner decision 2026-08-18): 26 days = full
 * share, 13 days = half. Largest-remainder rounding, so the parts sum to EXACTLY
 * the pot — payroll must never invent or lose a so'm. Nobody worked → nobody paid.
 */
export function splitGoalBonus(total: number, shares: { employeeId: number; workedDays: number }[]): { employeeId: number; amount: number }[] {
  const pot = Math.round(total);
  const eligible = shares.filter((s) => s.workedDays > 0);
  const W = eligible.reduce((a, s) => a + s.workedDays, 0);
  if (pot <= 0 || W <= 0 || eligible.length === 0) return [];
  const exact = eligible.map((s) => ({ employeeId: s.employeeId, raw: (pot * s.workedDays) / W }));
  const out = exact.map((e) => ({ employeeId: e.employeeId, amount: Math.floor(e.raw), rem: e.raw - Math.floor(e.raw) }));
  let leftover = pot - out.reduce((a, o) => a + o.amount, 0);
  const byRem = [...out].sort((a, b) => b.rem - a.rem || a.employeeId - b.employeeId);
  for (let i = 0; leftover > 0 && i < byRem.length; i++, leftover--) {
    const row = byRem[i];
    if (row) row.amount++;
  }
  return out.map((o) => ({ employeeId: o.employeeId, amount: o.amount }));
}
