// 👔 JAMOA J3 — owner/admin operations for the "Jamoa" panel: roster, employee
// month view, hand-edits (audited), payouts (idempotent), org policy + month
// calendar. Money MATH stays in @t1067/shared/staff; employee-side flow stays in
// staffService.ts. REAL so'm (StaffLedger) — the tanga economy is never touched.
import {
  type StaffCalendar,
  type StaffDayKind,
  dayKindFor,
  dateKey,
  hhmmToMin,
  isoWeekday,
  minutesSinceTashkentMidnight,
  resolveStaffPolicy,
  TASHKENT_UTC_OFFSET_MIN,
  tashkentDayMinutes,
} from "@t1067/shared";
import { prisma } from "../db";
import { recomputeSession } from "./staffService";

const PLUS_KINDS = ["earn", "bonus"] as const;
const MINUS_KINDS = ["payout", "adjust"] as const;

function fmt(n: number): string {
  return n.toLocaleString("ru-RU").replace(/,/g, " ");
}

function hhmmOf(at: Date | null, sessionDate: string): string | null {
  if (!at) return null;
  const m = minutesSinceTashkentMidnight(at, sessionDate);
  const mm = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(mm / 60)).padStart(2, "0")}:${String(mm % 60).padStart(2, "0")}`;
}

/** Tashkent "HH:MM" on a session date → absolute Date (minutes may exceed 24h via +1440). */
function tkInstant(date: string, minutes: number): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1) - TASHKENT_UTC_OFFSET_MIN * 60_000 + minutes * 60_000);
}

async function balanceOf(employeeId: number, openingBalance: number): Promise<{ plus: number; minus: number; balance: number }> {
  const grouped = await prisma.staffLedger.groupBy({ by: ["kind"], where: { employeeId }, _sum: { amount: true } });
  let plus = 0;
  let minus = 0;
  for (const g of grouped) {
    const a = g._sum.amount ?? 0;
    if ((PLUS_KINDS as readonly string[]).includes(g.kind)) plus += a;
    if ((MINUS_KINDS as readonly string[]).includes(g.kind)) minus += a;
  }
  return { plus, minus, balance: openingBalance + plus - minus };
}

/** Roster: every org with employees, today's live status, month accrual, full balance. */
export async function staffAdminOverview(now = new Date()) {
  const t = tashkentDayMinutes(now);
  const monthPrefix = t.date.slice(0, 7);
  const orgs = await prisma.organization.findMany({ include: { employees: { orderBy: { name: "asc" } } }, orderBy: { id: "asc" } });
  const out = [];
  for (const org of orgs) {
    const employees = [];
    for (const e of org.employees) {
      const [today, monthAgg, bal] = await Promise.all([
        prisma.workSession.findUnique({ where: { employeeId_date: { employeeId: e.id, date: t.date } } }),
        prisma.workSession.aggregate({ where: { employeeId: e.id, date: { startsWith: monthPrefix } }, _sum: { amountEarned: true, minutesWorked: true } }),
        balanceOf(e.id, e.openingBalance),
      ]);
      employees.push({
        id: e.id,
        telegramId: e.telegramId,
        name: e.name,
        role: e.role,
        active: e.active,
        payType: e.payType,
        monthlySalary: e.monthlySalary,
        dailyRate: e.dailyRate,
        hourlyRate: e.hourlyRate,
        todayIn: hhmmOf(today?.checkIn ?? null, t.date),
        todayOut: hhmmOf(today?.checkOut ?? null, t.date),
        todayStatus: today?.checkIn ? (today.checkOut ? "ketgan" : "ishda") : (today?.dayStatus && today.dayStatus !== "ishladi" ? today.dayStatus : "kelmagan"),
        monthEarned: monthAgg._sum.amountEarned ?? 0,
        monthMinutes: monthAgg._sum.minutesWorked ?? 0,
        balance: bal.balance,
      });
    }
    out.push({ id: org.id, name: org.name, active: org.active, employees });
  }
  return { today: t.date, orgs: out };
}

/** One employee, one month ("2026-07"): resolved-policy day grid + ledger + totals. */
export async function staffAdminEmployee(employeeId: number, month: string, now = new Date()) {
  const emp = await prisma.employee.findUnique({ where: { id: employeeId }, include: { org: true } });
  if (!emp) return null;
  const m = /^(\d{4})-(\d{2})$/.exec(month) ? month : tashkentDayMinutes(now).date.slice(0, 7);
  const [yy, mm] = m.split("-").map(Number) as [number, number];
  const pol = resolveStaffPolicy({ ...emp.org, calendar: emp.org.calendar ?? undefined }, emp);
  const sessions = await prisma.workSession.findMany({ where: { employeeId, date: { startsWith: m } } });
  const byDate = new Map(sessions.map((s) => [s.date, s]));
  const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  const days = [];
  for (let d = 1; d <= last; d++) {
    const date = dateKey(yy, mm, d);
    const s = byDate.get(date);
    days.push({
      date,
      weekday: isoWeekday(yy, mm, d),
      kind: dayKindFor(yy, mm, d, pol.workDays, pol.calendar),
      sessionId: s?.id ?? null,
      dayStatus: s?.dayStatus ?? null,
      checkIn: s ? hhmmOf(s.checkIn, date) : null,
      checkOut: s ? hhmmOf(s.checkOut, date) : null,
      minutesWorked: s?.minutesWorked ?? 0,
      overtimeMin: s?.overtimeMin ?? 0,
      amountEarned: s?.amountEarned ?? 0,
      autoClosed: s?.autoClosed ?? false,
      confirmed: !!s?.confirmedAt,
      editedBy: s?.editedBy ?? null,
      shiftStartOvr: s?.shiftStartOvr ?? null,
      shiftEndOvr: s?.shiftEndOvr ?? null,
    });
  }
  const ledger = await prisma.staffLedger.findMany({ where: { employeeId }, orderBy: { createdAt: "desc" }, take: 100 });
  const bal = await balanceOf(employeeId, emp.openingBalance);
  const monthEarned = sessions.reduce((a, s) => a + s.amountEarned, 0);
  return {
    employee: {
      id: emp.id, orgId: emp.orgId, telegramId: emp.telegramId, name: emp.name, role: emp.role, active: emp.active,
      payType: emp.payType, monthlySalary: emp.monthlySalary, dailyRate: emp.dailyRate, hourlyRate: emp.hourlyRate,
      shiftStart: emp.shiftStart, shiftEnd: emp.shiftEnd, workDays: emp.workDays, graceMin: emp.graceMin,
      lunchMin: emp.lunchMin, openingBalance: emp.openingBalance, vacationDaysYr: emp.vacationDaysYr,
    },
    policy: { shiftStart: pol.shiftStart, shiftEnd: pol.shiftEnd, workDays: pol.workDays },
    month: m,
    days,
    ledger: ledger.map((l) => ({ id: l.id, kind: l.kind, amount: l.amount, note: l.note, date: tashkentDayMinutes(l.createdAt).date, createdBy: l.createdBy })),
    totals: { monthEarned, plus: bal.plus, minus: bal.minus, balance: bal.balance, openingBalance: emp.openingBalance },
  };
}

export interface StaffEmployeeSaveInput {
  id?: number;
  orgId?: number;
  telegramId?: string;
  name?: string;
  role?: string;
  active?: boolean;
  payType?: string;
  monthlySalary?: number;
  dailyRate?: number;
  hourlyRate?: number;
  shiftStart?: string | null;
  shiftEnd?: string | null;
  workDays?: string | null;
  graceMin?: number | null;
  lunchMin?: number | null;
  openingBalance?: number;
  vacationDaysYr?: number;
}

/** Create/update an employee. Validation is intentionally strict — payroll data. */
export async function staffAdminEmployeeSave(input: StaffEmployeeSaveInput): Promise<{ ok: boolean; id?: number; error?: string }> {
  const clean: Record<string, unknown> = {};
  if (input.telegramId !== undefined) {
    if (!/^\d{5,15}$/.test(input.telegramId)) return { ok: false, error: "telegramId raqam bo'lishi kerak" };
    clean.telegramId = input.telegramId;
  }
  if (input.name !== undefined) {
    const n = input.name.trim();
    if (!n) return { ok: false, error: "Ism bo'sh" };
    clean.name = n;
  }
  for (const k of ["role"] as const) if (input[k] !== undefined) clean[k] = String(input[k]).trim();
  if (input.payType !== undefined) {
    if (!["oylik", "kunlik", "soatlik"].includes(input.payType)) return { ok: false, error: "payType noto'g'ri" };
    clean.payType = input.payType;
  }
  for (const k of ["monthlySalary", "dailyRate", "hourlyRate", "openingBalance", "vacationDaysYr"] as const) {
    if (input[k] !== undefined) {
      const v = Number(input[k]);
      if (!Number.isFinite(v) || Math.abs(v) > 1_000_000_000) return { ok: false, error: `${k} noto'g'ri` };
      if (v < 0 && k !== "openingBalance") return { ok: false, error: `${k} manfiy bo'lmaydi` }; // opening qarz manfiy bo'lishi mumkin
      clean[k] = Math.round(v);
    }
  }
  for (const k of ["shiftStart", "shiftEnd"] as const) {
    if (input[k] !== undefined) {
      const v = input[k];
      if (v != null && v !== "") hhmmToMin(v); // throws on garbage → caught below
      clean[k] = v || null;
    }
  }
  if (input.workDays !== undefined) {
    const v = input.workDays;
    if (v != null && v !== "" && !/^[1-7]{1,7}$/.test(v)) return { ok: false, error: "workDays 1-7 raqamlari" };
    clean.workDays = v || null;
  }
  for (const k of ["graceMin", "lunchMin"] as const) {
    if (input[k] !== undefined) {
      const v = input[k];
      if (v != null && (!Number.isFinite(Number(v)) || Number(v) < 0 || Number(v) > 480)) return { ok: false, error: `${k} 0-480` };
      clean[k] = v == null ? null : Math.round(Number(v));
    }
  }
  if (input.active !== undefined) clean.active = !!input.active;
  try {
    if (input.id) {
      const e = await prisma.employee.update({ where: { id: input.id }, data: clean });
      return { ok: true, id: e.id };
    }
    if (!clean.telegramId || !clean.name) return { ok: false, error: "telegramId va ism majburiy" };
    let orgId = input.orgId;
    if (!orgId) {
      const org = await prisma.organization.findFirst({ orderBy: { id: "asc" } });
      orgId = org?.id;
    }
    if (!orgId) return { ok: false, error: "Avval korxona yarating" };
    const e = await prisma.employee.create({ data: { ...(clean as object), orgId } as never });
    return { ok: true, id: e.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Unique")) return { ok: false, error: "Bu telegramId allaqachon boshqa xodimda" };
    return { ok: false, error: "Saqlanmadi: " + msg.slice(0, 120) };
  }
}

/** 💸 Payout / bonus / jarima. Idempotent via caller-supplied key (double-click-safe).
 *  Returns the employee-notification text; the ROUTE sends it (bot-bound). */
export async function staffAdminPay(input: {
  employeeId: number;
  kind: "payout" | "bonus" | "adjust";
  amount: number;
  note?: string;
  idemKey: string;
  actor: string;
}): Promise<{ ok: boolean; error?: string; notifyTelegramId?: string; notifyText?: string }> {
  const amount = Math.round(Number(input.amount));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) return { ok: false, error: "Summa noto'g'ri" };
  if (!["payout", "bonus", "adjust"].includes(input.kind)) return { ok: false, error: "Tur noto'g'ri" };
  const note = (input.note ?? "").trim();
  if ((input.kind === "bonus" || input.kind === "adjust") && !note) return { ok: false, error: "Bonus/jarima uchun sabab MAJBURIY" };
  if (!/^[\w:.-]{8,80}$/.test(input.idemKey)) return { ok: false, error: "idemKey noto'g'ri" };
  const emp = await prisma.employee.findUnique({ where: { id: input.employeeId } });
  if (!emp) return { ok: false, error: "Xodim topilmadi" };
  const key = `staffpay:${emp.id}:${input.idemKey}`;
  const existing = await prisma.staffLedger.findUnique({ where: { idempotencyKey: key } });
  if (existing) return { ok: true }; // double-click — already written, don't re-notify
  await prisma.staffLedger.create({
    data: { employeeId: emp.id, kind: input.kind, amount, note: note || null, idempotencyKey: key, createdBy: input.actor },
  });
  const bal = await balanceOf(emp.id, emp.openingBalance);
  const label = input.kind === "payout" ? "💸 Sizga pul berildi" : input.kind === "bonus" ? "🎁 Sizga bonus yozildi" : "⚠️ Hisobingizdan ushlab qolindi";
  return {
    ok: true,
    notifyTelegramId: emp.telegramId,
    notifyText: `${label}: <b>${fmt(amount)} so'm</b>${note ? ` (${note.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")})` : ""}\n💰 Qoldiq: <b>${fmt(bal.balance)} so'm</b>`,
  };
}

/** Hand-edit one employee-day (times "HH:MM" Tashkent, status, overtime, shift override).
 *  Audited via editedBy; pay is recomputed through the same idempotent path. */
export async function staffAdminSessionSet(input: {
  employeeId: number;
  date: string;
  dayStatus?: string;
  checkIn?: string | null; // "HH:MM" | null=clear | undefined=untouched
  checkOut?: string | null;
  overtimeMin?: number;
  shiftStartOvr?: string | null;
  shiftEndOvr?: string | null;
  confirm?: boolean;
  actor: string;
}): Promise<{ ok: boolean; error?: string; amountEarned?: number }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, error: "Sana noto'g'ri" };
  const emp = await prisma.employee.findUnique({ where: { id: input.employeeId }, include: { org: true } });
  if (!emp) return { ok: false, error: "Xodim topilmadi" };
  const existing = await prisma.workSession.findUnique({ where: { employeeId_date: { employeeId: emp.id, date: input.date } } });
  const data: Record<string, unknown> = { editedBy: input.actor };
  if (input.dayStatus !== undefined) {
    if (!["ishladi", "kelmadi", "javobli", "kasallik", "tatil", "bayram"].includes(input.dayStatus)) return { ok: false, error: "Holat noto'g'ri" };
    data.dayStatus = input.dayStatus;
  }
  let inMin: number | null | undefined;
  let outMin: number | null | undefined;
  try {
    if (input.checkIn !== undefined) inMin = input.checkIn == null || input.checkIn === "" ? null : hhmmToMin(input.checkIn);
    if (input.checkOut !== undefined) outMin = input.checkOut == null || input.checkOut === "" ? null : hhmmToMin(input.checkOut);
    for (const [field, val] of [["shiftStartOvr", input.shiftStartOvr], ["shiftEndOvr", input.shiftEndOvr]] as const) {
      if (val !== undefined) {
        if (val != null && val !== "") hhmmToMin(val);
        data[field] = val || null;
      }
    }
  } catch {
    return { ok: false, error: "Vaqt HH:MM formatida" };
  }
  // B2 (tekshiruv topgan): ODDIY (yarim tunga o'tmaydigan) smenada "Ketdi < Keldi" —
  // deyarli har doim xato terilgan vaqt. computeDayPay buni ertasi kunga o'tish deb
  // tushunadi va avto-OT rejimida bitta xato ~2.5 kunlik pul yozadi. Aniq RAD etamiz.
  {
    const ovrStart = (data.shiftStartOvr as string | null | undefined) ?? existing?.shiftStartOvr;
    const ovrEnd = (data.shiftEndOvr as string | null | undefined) ?? existing?.shiftEndOvr;
    const pol = resolveStaffPolicy({ ...emp.org, calendar: emp.org.calendar ?? undefined }, emp, { shiftStartOvr: ovrStart, shiftEndOvr: ovrEnd });
    const nightShift = hhmmToMin(pol.shiftEnd) <= hhmmToMin(pol.shiftStart);
    const effIn = inMin !== undefined ? inMin : existing?.checkIn ? minutesSinceTashkentMidnight(existing.checkIn, input.date) : null;
    const effOut = outMin !== undefined ? outMin : existing?.checkOut ? minutesSinceTashkentMidnight(existing.checkOut, input.date) : null;
    if (!nightShift && effIn != null && effOut != null && effOut < effIn) {
      return { ok: false, error: "Ketish kelishdan oldin bo'lolmaydi (smena yarim tunga o'tmaydi)" };
    }
  }
  if (inMin !== undefined) data.checkIn = inMin == null ? null : tkInstant(input.date, inMin);
  if (outMin !== undefined) data.checkOut = outMin == null ? null : tkInstant(input.date, outMin);
  if (input.overtimeMin !== undefined) {
    const v = Math.round(Number(input.overtimeMin));
    if (!Number.isFinite(v) || v < 0 || v > 720) return { ok: false, error: "Overtime 0-720 daqiqa" };
    data.overtimeMin = v;
  }
  if (input.confirm) data.confirmedAt = new Date();
  const s = await prisma.workSession.upsert({
    where: { employeeId_date: { employeeId: emp.id, date: input.date } },
    create: { employeeId: emp.id, date: input.date, dayStatus: (data.dayStatus as string) ?? "ishladi", ...data } as never,
    update: data as never,
  });
  const pay = await recomputeSession(s.id);
  return { ok: true, amountEarned: pay?.amountEarned ?? 0 };
}

const ORG_NUM_FIELDS = ["fixedDivisor", "graceMin", "roundMin", "lunchMin", "lunchThresholdMin", "sickPct", "vacationPct"] as const;

/** Org policy edit (J3 settings card). Field-by-field validation; unknown keys rejected. */
export async function staffAdminOrgSave(orgId: number, patch: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (k === "name") {
      if (!String(v).trim()) return { ok: false, error: "Nom bo'sh" };
      data.name = String(v).trim();
    } else if (k === "active" || k === "lunchPaid" || k === "holidayPaid") data[k] = !!v;
    else if ((ORG_NUM_FIELDS as readonly string[]).includes(k)) {
      const n = Math.round(Number(v));
      if (!Number.isFinite(n) || n < 0 || n > 100_000) return { ok: false, error: `${k} noto'g'ri` };
      // fixedDivisor=0 → shared Math.max(1,…) bo'luvchini 1 ga qisqartirib HAR KUNGA
      // to'liq oylik yozadi (tekshiruv topgan falokat) — 1 dan kichik rad etiladi.
      if (k === "fixedDivisor" && n < 1) return { ok: false, error: "fixedDivisor kamida 1" };
      data[k] = n;
    } else if (k === "overtimeMult") {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 1 || n > 5) return { ok: false, error: "overtimeMult 1-5" };
      data[k] = n;
    } else if (k === "divisorMode") {
      if (v !== "haqiqiy" && v !== "qatiy") return { ok: false, error: "divisorMode noto'g'ri" };
      data[k] = v;
    } else if (k === "overtimeMode") {
      if (v !== "off" && v !== "qolda" && v !== "avto") return { ok: false, error: "overtimeMode noto'g'ri" };
      data[k] = v;
    } else if (k === "workDays") {
      if (!/^[1-7]{1,7}$/.test(String(v))) return { ok: false, error: "workDays 1-7" };
      data[k] = String(v);
    } else if (k === "shiftStart" || k === "shiftEnd") {
      try { hhmmToMin(String(v)); } catch { return { ok: false, error: "Smena HH:MM" }; }
      data[k] = String(v);
    } else if (k === "ownerTelegramId") {
      if (!/^\d{5,15}$/.test(String(v))) return { ok: false, error: "ownerTelegramId raqam" };
      data[k] = String(v);
    } else return { ok: false, error: `Noma'lum maydon: ${k}` };
  }
  await prisma.organization.update({ where: { id: orgId }, data });
  return { ok: true };
}

export async function staffAdminOrgCreate(name: string, ownerTelegramId: string): Promise<{ ok: boolean; id?: number; error?: string }> {
  if (!name.trim()) return { ok: false, error: "Nom bo'sh" };
  if (!/^\d{5,15}$/.test(ownerTelegramId)) return { ok: false, error: "ownerTelegramId raqam" };
  const org = await prisma.organization.create({ data: { name: name.trim(), ownerTelegramId } });
  return { ok: true, id: org.id };
}

/** Org list + this month's calendar (settings card). */
export async function staffAdminOrgs() {
  const orgs = await prisma.organization.findMany({ orderBy: { id: "asc" } });
  return orgs.map((o) => ({ ...o, calendar: (o.calendar as StaffCalendar | null) ?? {} }));
}

// ---------------------------------------------------------------------------
// 📄 J5 — oy-oxiri hisobot + eski oyliklarni ommaviy kiritish
// ---------------------------------------------------------------------------

/** Month-end payroll sheet: one row per employee — days/hours, earned, bonus,
 *  jarima, paid out (all Tashkent-month scoped) + the ALL-TIME running balance. */
export async function staffAdminMonthReport(orgId: number, month: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(month) ? month : tashkentDayMinutes(new Date()).date.slice(0, 7);
  const org = await prisma.organization.findUnique({ where: { id: orgId }, include: { employees: { orderBy: { name: "asc" } } } });
  if (!org) return null;
  // Toshkent oyining [boshi, keyingi oy boshi) UTC oralig'i — ledger createdAt filtri uchun.
  const [yy, mm] = m.split("-").map(Number) as [number, number];
  const from = tkInstant(`${m}-01`, 0);
  const nextM = mm === 12 ? `${yy + 1}-01` : `${yy}-${String(mm + 1).padStart(2, "0")}`;
  const to = tkInstant(`${nextM}-01`, 0);
  const rows = [];
  for (const e of org.employees) {
    const [sessions, ledgerM, bal] = await Promise.all([
      prisma.workSession.findMany({ where: { employeeId: e.id, date: { startsWith: m } } }),
      prisma.staffLedger.groupBy({ by: ["kind"], where: { employeeId: e.id, createdAt: { gte: from, lt: to } }, _sum: { amount: true } }),
      balanceOf(e.id, e.openingBalance),
    ]);
    const sum = (kind: string) => ledgerM.find((g) => g.kind === kind)?._sum.amount ?? 0;
    const worked = sessions.filter((s) => s.dayStatus === "ishladi" && s.minutesWorked > 0);
    rows.push({
      id: e.id,
      name: e.name,
      role: e.role,
      active: e.active,
      daysWorked: worked.length,
      minutes: worked.reduce((a, s) => a + s.minutesWorked, 0),
      overtimeMin: sessions.reduce((a, s) => a + s.overtimeMin, 0),
      absent: sessions.filter((s) => s.dayStatus === "kelmadi").length,
      statusDays: sessions.filter((s) => !["ishladi", "kelmadi"].includes(s.dayStatus)).length, // javobli/kasallik/tatil/bayram
      earned: sessions.reduce((a, s) => a + s.amountEarned, 0),
      bonus: sum("bonus"),
      jarima: sum("adjust"),
      paidOut: sum("payout"),
      unconfirmed: sessions.filter((s) => !s.confirmedAt).length,
      openingBalance: e.openingBalance,
      balance: bal.balance, // umumiy joriy qoldiq (oy emas — "qancha puli bor" savoliga javob)
    });
  }
  return { org: { id: org.id, name: org.name }, month: m, rows };
}

/** 📥 Bulk import: "telegramId ; Ism ; oylik ; eskiBalans [; rol]" per line.
 *  Upsert by telegramId — safe to re-paste the same list (openingBalance updated,
 *  NOT summed). Returns per-line results so the owner sees exactly what happened. */
export async function staffAdminBulkImport(orgId: number, textRaw: string): Promise<{ ok: boolean; error?: string; results?: { line: string; ok: boolean; info: string }[] }> {
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) return { ok: false, error: "Korxona topilmadi" };
  const lines = textRaw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { ok: false, error: "Bo'sh ro'yxat" };
  if (lines.length > 200) return { ok: false, error: `${lines.length} qator — 200 tadan ko'p, bo'lib yuboring (jim qirqish yo'q)` };
  const results = [];
  for (const line of lines) {
    // Minglik vergullar ("3,000,000") avval yopishtiriladi — aks holda pastdagi split
    // raqam ICHIDA bo'linib, 3 so'mlik oylik jimgina yozilardi (tekshiruv Bug 1).
    const norm = line.replace(/(\d),(?=\d{3}(\D|$))/g, "$1");
    const p = norm.split(/[;\t]|,(?=\s*[-\d])/).map((s) => s.trim()); // vergul faqat raqam oldida ajratadi (ismda vergul bo'lsa buzilmasin)
    const [tgId, name, salaryRaw, openRaw, role] = [p[0] ?? "", p[1] ?? "", p[2] ?? "", p[3] ?? "0", p[4] ?? ""];
    const salary = Number(salaryRaw.replace(/[\s']/g, ""));
    const opening = Number((openRaw || "0").replace(/[\s']/g, ""));
    if (p.length > 5 || !/^\d{5,15}$/.test(tgId) || !name || !Number.isFinite(salary) || salary <= 0 || salary > 1_000_000_000 || !Number.isFinite(opening) || Math.abs(opening) > 1_000_000_000) {
      results.push({ line, ok: false, info: "format: telegramId ; Ism ; oylik ; eskiBalans [; rol]" });
      continue;
    }
    try {
      const e = await prisma.employee.upsert({
        where: { telegramId: tgId },
        create: { orgId, telegramId: tgId, name, role: role || "operator", monthlySalary: Math.round(salary), openingBalance: Math.round(opening) },
        // orgId ham yangilanadi — tanlangan korxona bilan natija bir xil bo'lsin (staffAdd Bug 7 saboqni takrorlamaymiz)
        update: { orgId, name, monthlySalary: Math.round(salary), openingBalance: Math.round(opening), active: true, ...(role ? { role } : {}) },
      });
      results.push({ line, ok: true, info: `#${e.id} ${name} — ${Math.round(salary).toLocaleString()} so'm/oy, boshlang'ich ${Math.round(opening).toLocaleString()}` });
    } catch (err) {
      results.push({ line, ok: false, info: "yozilmadi: " + (err instanceof Error ? err.message.slice(0, 80) : "xato") });
    }
  }
  return { ok: true, results };
}

/** Month-calendar day toggle: set "ish"|"dam"|"bayram" or null (back to weekly default). */
export async function staffAdminCalendarSet(orgId: number, date: string, kind: StaffDayKind | null): Promise<{ ok: boolean; error?: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Sana noto'g'ri" };
  if (kind != null && !["ish", "dam", "bayram"].includes(kind)) return { ok: false, error: "Tur noto'g'ri" };
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) return { ok: false, error: "Korxona topilmadi" };
  const cal = (org.calendar && typeof org.calendar === "object" && !Array.isArray(org.calendar) ? (org.calendar as StaffCalendar) : {}) as StaffCalendar;
  if (kind == null) delete cal[date];
  else cal[date] = kind;
  await prisma.organization.update({ where: { id: orgId }, data: { calendar: cal } });
  // Rates depend on the divisor → recompute every session of that month for this org's staff.
  const month = date.slice(0, 7);
  const sessions = await prisma.workSession.findMany({ where: { date: { startsWith: month }, employee: { orgId } }, select: { id: true } });
  for (const s of sessions) await recomputeSession(s.id);
  return { ok: true };
}