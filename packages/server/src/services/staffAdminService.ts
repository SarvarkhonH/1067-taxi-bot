// 👔 JAMOA J3 — owner/admin operations for the "Jamoa" panel: roster, employee
// month view, hand-edits (audited), payouts (idempotent), org policy + month
// calendar. Money MATH stays in @t1067/shared/staff; employee-side flow stays in
// staffService.ts. REAL so'm (StaffLedger) — the tanga economy is never touched.
import {
  type StaffCalendar,
  type StaffDayKind,
  dailyRateFor,
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

/** E2: sidebar-badge uchun — barcha korxonalarda yopiq-lekin-tasdiqsiz kunlar soni
 *  (ochiq smenalar sanalmaydi — hali tasdiqqa loyiq emas). */
export async function staffAdminPendingCount(): Promise<number> {
  return prisma.workSession.count({
    where: {
      confirmedAt: null,
      NOT: { dayStatus: "ishladi", checkIn: { not: null }, checkOut: null },
    },
  });
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
        orgId: e.orgId,
        telegramId: e.telegramId,
        name: e.name,
        role: e.role,
        active: e.active,
        archivedAt: e.archivedAt ? e.archivedAt.toISOString() : null,
        archiveNote: e.archiveNote,
        payType: e.payType,
        monthlySalary: e.monthlySalary,
        dailyRate: e.dailyRate,
        hourlyRate: e.hourlyRate,
        todayIn: hhmmOf(today?.checkIn ?? null, t.date),
        todayOut: hhmmOf(today?.checkOut ?? null, t.date),
        todayStatus: today?.checkIn ? (today.checkOut ? "ketgan" : "ishda") : (today?.dayStatus && today.dayStatus !== "ishladi" ? today.dayStatus : "kelmagan"),
        todayEarned: today?.amountEarned ?? 0, // E1: "bugungi jami" counter uchun — qo'shimcha so'rovsiz
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
      dailyRate: dailyRateFor(pol, yy, mm), // "yo'qotilgan pul" ni hisoblash uchun (o'rniga ishlash)
      coverTo: null as { employeeId: number; name: string; amount: number } | null,
    });
  }
  // 🔁 O'RNIGA ISHLASH: shu xodim kelmagan/kech kelgan kunlari uchun boshqasiga
  // o'tkazilgan pullar (kalit `staffcover:<kelmaganId>:<sana>`) — kun jadvalida
  // "→ Bekzodga o'tdi" bo'lib ko'rinadi.
  const coverRows = await prisma.staffLedger.findMany({
    where: { idempotencyKey: { startsWith: `staffcover:${employeeId}:` }, kind: "bonus" }, // "bekor" tombstonelar belgi ko'rsatmaydi
    include: { employee: { select: { id: true, name: true } } },
  });
  const coverByDate = new Map(coverRows.map((c) => [c.idempotencyKey.split(":")[2] ?? "", c]));
  for (const d of days) {
    const c = coverByDate.get(d.date);
    (d as Record<string, unknown>).coverTo = c ? { employeeId: c.employee.id, name: c.employee.name, amount: c.amount } : null;
  }
  const ledger = await prisma.staffLedger.findMany({ where: { employeeId }, orderBy: { createdAt: "desc" }, take: 100 });
  const bal = await balanceOf(employeeId, emp.openingBalance);
  const monthEarned = sessions.reduce((a, s) => a + s.amountEarned, 0);
  return {
    employee: {
      id: emp.id, orgId: emp.orgId, telegramId: emp.telegramId, name: emp.name, role: emp.role, active: emp.active,
      archivedAt: emp.archivedAt ? emp.archivedAt.toISOString() : null, archiveNote: emp.archiveNote,
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
  if (input.active !== undefined) {
    clean.active = !!input.active;
    if (input.active) {
      clean.archivedAt = null; // "faol" = arxivdan chiqarish (ikki joyda ikki xil haqiqat bo'lmasin)
      clean.archiveNote = null;
    }
  }
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
}): Promise<{ ok: boolean; error?: string; amountEarned?: number; coverNote?: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, error: "Sana noto'g'ri" };
  const emp = await prisma.employee.findUnique({ where: { id: input.employeeId }, include: { org: true } });
  if (!emp) return { ok: false, error: "Xodim topilmadi" };
  const existing = await prisma.workSession.findUnique({ where: { employeeId_date: { employeeId: emp.id, date: input.date } } });
  const data: Record<string, unknown> = { editedBy: input.actor, editedAt: new Date() };
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
  // Kun tuzatilgach o'rniga-ishlash o'tkazmasi ham moslanadi (B3: aks holda A to'liq
  // pul oladi, B esa o'tkazmani saqlab qoladi — bir kun ikki marta to'lanardi).
  const rec = await staffAdminCoverReconcile(emp.id, input.date).catch(() => ({ changed: false as const }));
  return { ok: true, amountEarned: pay?.amountEarned ?? 0, coverNote: rec.changed ? rec.note : undefined };
}

/**
 * 🔁 O'RNIGA ISHLASH (ega qoidasi #1, birinchi kundan beri): kelmagan/kech kelgan
 * xodimdan KESILGAN pul o'rniga ishlaganga YOZILADI. Kesish allaqachon avtomatik
 * (computeDayPay kelmaganga 0, kechikkanga faqat kelgan vaqtidan) — bu funksiya
 * o'sha yo'qotilgan summani ikkinchi xodimga o'tkazadi. Biznes uchun xarajat
 * NEYTRAL: bir kunlik pul ikki marta chiqmaydi.
 *
 * Idempotent kalit `staffcover:<kelmaganId>:<sana>` — bir kelmagan-kun uchun BITTA
 * o'tkazma. Boshqa xodim tanlansa yoki summa o'zgarsa — o'sha qator ko'chadi
 * (ikkinchi to'lov yaralmaydi). coverEmployeeId=null → o'tkazma bekor qilinadi.
 */
export async function staffAdminCoverSet(input: {
  date: string;
  absentEmployeeId: number;
  coverEmployeeId: number | null;
  amount?: number;
  actor: string;
}): Promise<{ ok: boolean; error?: string; amount?: number; notifyTelegramId?: string; notifyText?: string; revokeTelegramId?: string; revokeText?: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, error: "Sana noto'g'ri" };
  if (!Number.isFinite(input.absentEmployeeId)) return { ok: false, error: "Xodim tanlanmagan" };
  const absent = await prisma.employee.findUnique({ where: { id: input.absentEmployeeId }, include: { org: true } });
  if (!absent) return { ok: false, error: "Kelmagan xodim topilmadi" };
  const key = `staffcover:${absent.id}:${input.date}`;
  const existing = await prisma.staffLedger.findUnique({ where: { idempotencyKey: key }, include: { employee: true } });

  // Bekor qilish: o'chirish emas — "bekor" tombstone (audit qoladi, qayta-yozuv tirilmaydi)
  // + AVVALGI oluvchiga xabar (aks holda balansi jimgina kamayardi — tekshiruv B4).
  if (input.coverEmployeeId == null) {
    if (existing && existing.kind !== "bekor") {
      await prisma.staffLedger.updateMany({ where: { idempotencyKey: key, kind: "bonus" }, data: { kind: "bekor", note: `${existing.note ?? ""} · ❌ bekor (${input.actor})` } });
      const b = await balanceOf(existing.employeeId, existing.employee.openingBalance);
      return { ok: true, amount: 0, notifyTelegramId: existing.employee.telegramId, notifyText: `❌ «${esc(existing.note ?? "o'rniga ishlash")}» o'tkazmasi bekor qilindi (−${fmt(existing.amount)} so'm)\n💰 Qoldiq: <b>${fmt(b.balance)} so'm</b>` };
    }
    return { ok: true, amount: 0 };
  }
  if (!Number.isFinite(input.coverEmployeeId)) return { ok: false, error: "O'rniga ishlagan tanlanmagan" };
  if (input.coverEmployeeId === absent.id) return { ok: false, error: "O'ziga o'zi o'rniga ishlay olmaydi" };
  const cover = await prisma.employee.findUnique({ where: { id: input.coverEmployeeId } });
  if (!cover) return { ok: false, error: "O'rniga ishlagan xodim topilmadi" };
  if (cover.orgId !== absent.orgId) return { ok: false, error: "Boshqa korxona xodimi" };
  if (!cover.active) return { ok: false, error: "O'chirilgan xodimga o'tkazib bo'lmaydi" };

  // Kelajakdagi kun / ish kuni bo'lmagan kun uchun o'tkazma YO'Q — u yerda hech kim
  // hech narsa yo'qotmagan (tekshiruv B1: dam kunida ham to'liq kunlik taklif qilinardi).
  const [yy, mm] = ymdOf(input.date);
  const dd = Number(input.date.slice(8));
  const session = await prisma.workSession.findUnique({ where: { employeeId_date: { employeeId: absent.id, date: input.date } } });
  const pol = resolveStaffPolicy({ ...absent.org, calendar: absent.org.calendar ?? undefined }, absent, session ?? undefined);
  const kind = dayKindFor(yy, mm, dd, pol.workDays, pol.calendar);
  const paidDay = kind === "ish" || (kind === "bayram" && pol.holidayPaid);
  if (!paidDay) return { ok: false, error: `Bu kun ish kuni emas (${kind}) — yo'qotilgan pul yo'q` };
  if (input.date > tashkentDayMinutes(new Date()).date) return { ok: false, error: "Kelajakdagi kun uchun o'tkazib bo'lmaydi" };

  // TOM = o'sha kuni kelmagan xodim YO'QOTGAN pul (kunlik − ishlagani). Qo'lda kiritilgan
  // summa ham shundan OSHA OLMAYDI — aks holda bir kunlik pul ikki marta chiqardi (B2).
  const lost = Math.max(0, dailyRateFor(pol, yy, mm) - (session?.amountEarned ?? 0));
  if (lost <= 0) return { ok: false, error: "Yo'qotilgan pul yo'q — o'sha kuni to'liq ishlagan" };
  let amount = input.amount == null ? lost : Math.round(Number(input.amount));
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Summa noto'g'ri" };
  if (amount > lost) return { ok: false, error: `Yo'qotilgani ${fmt(lost)} so'm — undan ko'p o'tkazib bo'lmaydi` };

  const note = `🔁 ${absent.name} o'rniga (${input.date})`;
  // upsert = poyga-xavfsiz (ikki marta bosish/ikki ega — ikkinchisi ustiga yozadi, dublikat yo'q)
  await prisma.staffLedger.upsert({
    where: { idempotencyKey: key },
    create: { employeeId: cover.id, kind: "bonus", amount, note, idempotencyKey: key, createdBy: input.actor },
    update: { employeeId: cover.id, kind: "bonus", amount, note, createdBy: input.actor },
  });
  const bal = await balanceOf(cover.id, cover.openingBalance);
  const prev = existing && existing.kind === "bonus" && existing.employeeId !== cover.id ? existing : null;
  return {
    ok: true,
    amount,
    notifyTelegramId: cover.telegramId,
    notifyText: `🔁 <b>${esc(absent.name)}</b> o'rniga ishlaganingiz uchun: <b>+${fmt(amount)} so'm</b> (${input.date})\n💰 Qoldiq: <b>${fmt(bal.balance)} so'm</b>`,
    revokeTelegramId: prev?.employee.telegramId,
    revokeText: prev ? `↩️ «${esc(prev.note ?? "o'rniga ishlash")}» o'tkazmasi boshqa xodimga o'tkazildi (−${fmt(prev.amount)} so'm)` : undefined,
  };
}

/** 🔁 Kechki kartadagi taklif-tugmadan: FAQAT o'sha korxona egasi bosa oladi.
 *  Ichkarida staffAdminCoverSet — hamma clamp/idempotent qoidalar bir joyda. */
export async function staffCoverApplyByOwner(
  absentEmployeeId: number,
  coverEmployeeId: number,
  date: string,
  actorTgId: string
): Promise<{ ok: boolean; text: string; notifyTelegramId?: string; notifyText?: string }> {
  if (!Number.isFinite(absentEmployeeId) || !Number.isFinite(coverEmployeeId)) return { ok: false, text: "Xodim tanlanmagan" };
  const absent = await prisma.employee.findUnique({ where: { id: absentEmployeeId }, include: { org: true } });
  if (!absent) return { ok: false, text: "Xodim topilmadi" };
  if (absent.org.ownerTelegramId !== actorTgId) return { ok: false, text: "Faqat korxona egasi o'tkazadi" };
  const r = await staffAdminCoverSet({ date, absentEmployeeId, coverEmployeeId, actor: actorTgId });
  if (!r.ok) return { ok: false, text: `❌ ${r.error ?? "O'tkazilmadi"}` };
  return {
    ok: true,
    text: `✅ ${fmt(r.amount ?? 0)} so'm o'tkazildi — ${esc(absent.name)} o'rniga ishlaganga yozildi va unga xabar bordi.`,
    notifyTelegramId: r.notifyTelegramId,
    notifyText: r.notifyText,
  };
}

/**
 * A ning kuni QO'LDA tuzatilgandan keyin o'tkazmani qayta moslash: A endi to'liq
 * ishlagan bo'lsa o'tkazma bekor qilinadi, kamroq yo'qotgan bo'lsa qisqartiriladi.
 * Busiz bir kunlik pul IKKI MARTA chiqardi (tekshiruv B3).
 */
export async function staffAdminCoverReconcile(absentEmployeeId: number, date: string): Promise<{ changed: boolean; note?: string }> {
  const key = `staffcover:${absentEmployeeId}:${date}`;
  const row = await prisma.staffLedger.findUnique({ where: { idempotencyKey: key } });
  if (!row || row.kind !== "bonus") return { changed: false };
  const absent = await prisma.employee.findUnique({ where: { id: absentEmployeeId }, include: { org: true } });
  if (!absent) return { changed: false };
  const [yy, mm] = ymdOf(date);
  const session = await prisma.workSession.findUnique({ where: { employeeId_date: { employeeId: absentEmployeeId, date } } });
  const pol = resolveStaffPolicy({ ...absent.org, calendar: absent.org.calendar ?? undefined }, absent, session ?? undefined);
  const lost = Math.max(0, dailyRateFor(pol, yy, mm) - (session?.amountEarned ?? 0));
  if (lost >= row.amount) return { changed: false };
  if (lost <= 0) {
    await prisma.staffLedger.updateMany({ where: { idempotencyKey: key, kind: "bonus" }, data: { kind: "bekor", note: `${row.note ?? ""} · ❌ avto-bekor (kun tuzatildi)` } });
    return { changed: true, note: `🔁 o'tkazma bekor qilindi (${fmt(row.amount)} so'm) — kun tuzatilgach yo'qotilgan pul qolmadi` };
  }
  await prisma.staffLedger.update({ where: { idempotencyKey: key }, data: { amount: lost, note: `${row.note ?? ""} · ✏️ ${fmt(row.amount)}→${fmt(lost)}` } });
  return { changed: true, note: `🔁 o'tkazma ${fmt(row.amount)} → ${fmt(lost)} so'mga qisqartirildi (kun tuzatildi)` };
}

function ymdOf(date: string): [number, number] {
  const p = date.split("-").map(Number);
  return [p[0] ?? 0, p[1] ?? 1];
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
      // F3 shablonlar: shiftTemplates BU YERDA emas — staffAdminTemplateAdd/Remove orqali
      // (bitta atomik yo'l, ikki admin bir vaqtda ochsa bir-birini bosib yozmasin, tekshiruv topgan).
    } else return { ok: false, error: `Noma'lum maydon: ${k}` };
  }
  await prisma.organization.update({ where: { id: orgId }, data });
  return { ok: true };
}

/** F3 shablon qo'shish/o'chirish — SERVER TOMONIDA joriy holatni o'qib yozadi
 *  (tekshiruv topgan: klient butun massivni yuborsa, ikki admin bir vaqtda
 *  ochsa, biri ikkinchisining o'zgarishini jimgina ustidan bosib yozib
 *  yuborardi). To'liq atomik emas (Postgres-darajali qulf yo'q), lekin
 *  klient-round-trip oynasini yopadi — sozlamalar sahifasi past-raqobatli
 *  ish uchun yetarli. Nomlar takrorlanmaydi (case-insensitive). */
export async function staffAdminTemplateAdd(orgId: number, name: string, start: string, end: string): Promise<{ ok: boolean; error?: string }> {
  const clean = name.trim().slice(0, 40);
  if (!clean) return { ok: false, error: "Shablon nomi bo'sh" };
  try {
    hhmmToMin(start);
    hhmmToMin(end);
  } catch {
    return { ok: false, error: "Vaqt HH:MM formatida" };
  }
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) return { ok: false, error: "Korxona topilmadi" };
  const current = (Array.isArray(org.shiftTemplates) ? org.shiftTemplates : []) as { name: string; start: string; end: string }[];
  if (current.length >= 20) return { ok: false, error: "Ko'pi bilan 20 ta shablon" };
  if (current.some((t) => t.name.toLowerCase() === clean.toLowerCase())) return { ok: false, error: `"${clean}" nomli shablon allaqachon bor` };
  await prisma.organization.update({ where: { id: orgId }, data: { shiftTemplates: [...current, { name: clean, start, end }] } });
  return { ok: true };
}

export async function staffAdminTemplateRemove(orgId: number, name: string): Promise<{ ok: boolean; error?: string }> {
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) return { ok: false, error: "Korxona topilmadi" };
  const current = (Array.isArray(org.shiftTemplates) ? org.shiftTemplates : []) as { name: string; start: string; end: string }[];
  await prisma.organization.update({ where: { id: orgId }, data: { shiftTemplates: current.filter((t) => t.name !== name) } });
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
  return orgs.map((o) => ({
    ...o,
    calendar: (o.calendar as StaffCalendar | null) ?? {},
    shiftTemplates: (Array.isArray(o.shiftTemplates) ? o.shiftTemplates : []) as { name: string; start: string; end: string }[],
  }));
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
export async function staffAdminCalendarSet(orgId: number, date: string, kind: StaffDayKind | null): Promise<{ ok: boolean; error?: string; recomputed?: number; skippedConfirmed?: number }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Sana noto'g'ri" };
  if (kind != null && !["ish", "dam", "bayram"].includes(kind)) return { ok: false, error: "Tur noto'g'ri" };
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) return { ok: false, error: "Korxona topilmadi" };
  const cal = (org.calendar && typeof org.calendar === "object" && !Array.isArray(org.calendar) ? (org.calendar as StaffCalendar) : {}) as StaffCalendar;
  if (kind == null) delete cal[date];
  else cal[date] = kind;
  await prisma.organization.update({ where: { id: orgId }, data: { calendar: cal } });
  // Rates depend on the divisor → recompute every session of that month for this org's staff.
  // TASDIQLANGAN kunlar bundan MUSTASNO (tekshiruv topgan): aks holda boshqa bir kunga
  // taqvim o'zgartirilsa, allaqachon ega tasdiqlagan (masalan avto-overtime formulasi
  // yangilangandan keyingi) kunlar jimgina qayta yozilib, kutilmagan pul o'zgarishi
  // yaratardi — hech qanday iz/xabar qoldirmasdan. Tasdiqlangan kunni o'zgartirish uchun
  // ega ONGLI ravishda kun-tuzatishdan foydalanishi kerak (u yerda editedBy yoziladi).
  const month = date.slice(0, 7);
  const sessions = await prisma.workSession.findMany({ where: { date: { startsWith: month }, employee: { orgId }, confirmedAt: null }, select: { id: true } });
  const skipped = await prisma.workSession.count({ where: { date: { startsWith: month }, employee: { orgId }, confirmedAt: { not: null } } });
  for (const s of sessions) await recomputeSession(s.id);
  return { ok: true, recomputed: sessions.length, skippedConfirmed: skipped };
}

// ---------------------------------------------------------------------------
// 📜 G2 — audit-jurnal: qo'lda tuzatilgan kunlar + bonus/jarima/to'lov + ta'til/
// almashish qarorlari, BITTA vaqt-tartibli lentaga birlashtiriladi.
// ---------------------------------------------------------------------------

export interface AuditEntry {
  at: string; // ISO
  actor: string; // telegramId
  action: string;
  detail: string;
}

export async function staffAdminAuditLog(orgId: number, limit = 100): Promise<AuditEntry[]> {
  const empIds = (await prisma.employee.findMany({ where: { orgId }, select: { id: true, name: true } }));
  const nameOf = new Map(empIds.map((e) => [e.id, e.name]));
  const ids = empIds.map((e) => e.id);
  // Har manba O'ZINING haqiqiy vaqt-ustuniga qarab tartiblanadi (tekshiruv topgan: id/createdAt
  // bo'yicha tartiblab keyin decidedAt/editedAt bo'yicha ko'rsatish — yaqinda HAL QILINGAN/
  // TAHRIRLANGAN, lekin AVVAL YARATILGAN yozuvni cap'dan tashqarida qoldirib yuborardi).
  const [editedSessions, ledgerRows, leaveDecisions, swapDecisions] = await Promise.all([
    prisma.workSession.findMany({ where: { employeeId: { in: ids }, editedBy: { not: null } }, orderBy: [{ editedAt: "desc" }, { id: "desc" }], take: limit }),
    prisma.staffLedger.findMany({ where: { employeeId: { in: ids }, kind: { in: ["bonus", "adjust", "payout"] }, createdBy: { not: "system" } }, orderBy: { createdAt: "desc" }, take: limit }),
    prisma.leaveRequest.findMany({ where: { employeeId: { in: ids }, status: { not: "pending" }, decidedAt: { not: null } }, orderBy: { decidedAt: "desc" }, take: limit }),
    prisma.shiftSwapRequest.findMany({ where: { OR: [{ requesterId: { in: ids } }, { partnerId: { in: ids } }], status: { in: ["approved", "rejected"] }, decidedAt: { not: null } }, orderBy: { decidedAt: "desc" }, take: limit }),
  ]);
  const entries: AuditEntry[] = [];
  for (const s of editedSessions) {
    // editedAt eski (migratsiyadan oldingi) qatorlarda bo'sh bo'lishi mumkin — createdAt zaxira.
    entries.push({ at: (s.editedAt ?? s.createdAt).toISOString(), actor: s.editedBy ?? "?", action: "kun-tuzatish", detail: `${nameOf.get(s.employeeId) ?? "?"} — ${s.date}` });
  }
  for (const l of ledgerRows) {
    const label = l.kind === "bonus" ? "bonus" : l.kind === "adjust" ? "jarima" : "to'lov";
    entries.push({ at: l.createdAt.toISOString(), actor: l.createdBy, action: label, detail: `${nameOf.get(l.employeeId) ?? "?"} — ${l.amount.toLocaleString()} so'm${l.note ? ` (${l.note})` : ""}` });
  }
  for (const r of leaveDecisions) {
    entries.push({ at: (r.decidedAt ?? r.createdAt).toISOString(), actor: r.decidedBy ?? "?", action: r.status === "approved" ? "ta'til-tasdiq" : "ta'til-rad", detail: `${nameOf.get(r.employeeId) ?? "?"} — ${r.fromDate}${r.fromDate !== r.toDate ? `..${r.toDate}` : ""}` });
  }
  for (const s of swapDecisions) {
    entries.push({ at: (s.decidedAt ?? s.createdAt).toISOString(), actor: s.decidedBy ?? "?", action: s.status === "approved" ? "almashish-tasdiq" : "almashish-rad", detail: `${nameOf.get(s.requesterId) ?? "?"} ↔ ${nameOf.get(s.partnerId) ?? "?"} — ${s.date}` });
  }
  entries.sort((a, b) => b.at.localeCompare(a.at));
  return entries.slice(0, limit);
}

// ---------------------------------------------------------------------------
// 🏅 G3 — xodim reyting/KPI: bir oy uchun davomat intizomi.
// ---------------------------------------------------------------------------

export interface StaffKpiRow {
  id: number;
  name: string;
  role: string;
  workedDays: number;
  lateDays: number;
  absentDays: number;
  minutes: number;
  earned: number;
  punctualityPct: number; // (workedDays-lateDays)/workedDays*100, ishlagan kun bo'lmasa 100
}

export async function staffAdminKpi(orgId: number, month: string): Promise<StaffKpiRow[]> {
  const m = /^(\d{4})-(\d{2})$/.exec(month) ? month : tashkentDayMinutes(new Date()).date.slice(0, 7);
  const org = await prisma.organization.findUnique({ where: { id: orgId }, include: { employees: { where: { active: true, archivedAt: null }, orderBy: { name: "asc" } } } });
  if (!org) return [];
  const rows: StaffKpiRow[] = [];
  for (const e of org.employees) {
    const sessions = await prisma.workSession.findMany({ where: { employeeId: e.id, date: { startsWith: m } } });
    let lateDays = 0;
    let workedDays = 0;
    let minutes = 0;
    let earned = 0;
    let absentDays = 0;
    for (const s of sessions) {
      earned += s.amountEarned;
      if (s.dayStatus === "kelmadi") absentDays++;
      if (s.dayStatus !== "ishladi" || !s.checkIn || s.minutesWorked <= 0) continue;
      workedDays++;
      minutes += s.minutesWorked;
      // Kun-o'ziga-xos smena (masalan tasdiqlangan almashish/to'y-kechasi) — HAR
      // SESSIYA uchun alohida resolveStaffPolicy (tekshiruv topgan: bitta umumiy
      // policy standart smenani ishlatib, o'z vaqtida kelganni "7 soat kech" deb
      // ko'rsatardi).
      const pol = resolveStaffPolicy({ ...org, calendar: org.calendar ?? undefined }, e, s);
      const shiftStart = hhmmToMin(pol.shiftStart);
      const arrivalMin = minutesSinceTashkentMidnight(s.checkIn, s.date);
      if (arrivalMin > shiftStart + pol.graceMin) lateDays++;
    }
    rows.push({
      id: e.id,
      name: e.name,
      role: e.role,
      workedDays,
      lateDays,
      absentDays,
      minutes,
      earned,
      punctualityPct: workedDays > 0 ? Math.round(((workedDays - lateDays) / workedDays) * 100) : 100,
    });
  }
  return rows;
}
// ─────────────────────────────────────────────────────────────────────────────
// 🗄 J6 — "eski ishchini o'chirish" (ega qarori 2026-08-18: arxiv + bo'sh qatorni
// butunlay). Arxiv = ro'yxatdan chiqadi, botda /ish yopiladi, kechki xulosaga
// tushmaydi — LEKIN oylik tarixi va pul yozuvlari qoladi (o'tgan oy hisoboti
// o'zgarmaydi, "qancha oldim?" bahsida isbot bor).
// ─────────────────────────────────────────────────────────────────────────────

/** Arxivga olishdan oldingi holat: qoldiq va ochiq smena — ega ko'r-ko'rona bosmasin. */
export async function staffAdminEmployeeArchivePreview(employeeId: number): Promise<{
  ok: boolean;
  error?: string;
  name?: string;
  balance?: number;
  openSession?: boolean;
  canDelete?: boolean; // 0 ish kuni + 0 pul yozuvi → butunlay o'chirsa bo'ladi
}> {
  const emp = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!emp) return { ok: false, error: "Xodim topilmadi" };
  const [bal, sessions, ledger, open] = await Promise.all([
    balanceOf(emp.id, emp.openingBalance),
    prisma.workSession.count({ where: { employeeId: emp.id } }),
    prisma.staffLedger.count({ where: { employeeId: emp.id } }),
    prisma.workSession.count({ where: { employeeId: emp.id, checkIn: { not: null }, checkOut: null } }),
  ]);
  return {
    ok: true,
    name: emp.name,
    balance: bal.balance,
    openSession: open > 0,
    canDelete: sessions === 0 && ledger === 0 && emp.openingBalance === 0,
  };
}

/** 🗄 Arxivga olish. Ochiq smena bo'lsa AVVAL yopiladi — aks holda avto-yopish
 *  faqat faol xodimlarni ko'rgani uchun o'sha kun abadiy tasdiqsiz osilib qolardi. */
export async function staffAdminEmployeeArchive(input: {
  employeeId: number;
  note?: string;
  actor: string;
}): Promise<{ ok: boolean; error?: string; closedAmount?: number }> {
  const emp = await prisma.employee.findUnique({ where: { id: input.employeeId } });
  if (!emp) return { ok: false, error: "Xodim topilmadi" };
  if (emp.archivedAt) return { ok: true }; // allaqachon arxivda — idempotent

  let closedAmount: number | undefined;
  const openSession = await prisma.workSession.findFirst({
    where: { employeeId: emp.id, checkIn: { not: null }, checkOut: null },
    orderBy: { date: "desc" },
  });
  if (openSession) {
    await prisma.workSession.update({
      where: { id: openSession.id },
      data: { checkOut: new Date(), autoClosed: true, editedBy: input.actor, editedAt: new Date() },
    });
    const pay = await recomputeSession(openSession.id);
    closedAmount = pay?.amountEarned ?? 0;
  }
  await prisma.employee.update({
    where: { id: emp.id },
    data: { active: false, archivedAt: new Date(), archiveNote: (input.note ?? "").trim().slice(0, 200) || null },
  });
  // Osilib qolgan so'rovlar yopiladi (ega navbatida "kutilmoqda" bo'lib turmasin).
  await prisma.leaveRequest.updateMany({
    where: { employeeId: emp.id, status: "pending" },
    data: { status: "rejected", decidedBy: input.actor, decidedAt: new Date() },
  });
  await prisma.shiftSwapRequest.updateMany({
    where: { OR: [{ requesterId: emp.id }, { partnerId: emp.id }], status: { in: ["pending_partner", "pending_owner"] } },
    data: { status: "rejected", decidedBy: input.actor, decidedAt: new Date() },
  });
  return { ok: true, ...(closedAmount !== undefined ? { closedAmount } : {}) };
}

/** ↩️ Arxivdan qaytarish (xato bosilsa yoki xodim ishga qaytsa). */
export async function staffAdminEmployeeUnarchive(employeeId: number): Promise<{ ok: boolean; error?: string }> {
  const emp = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!emp) return { ok: false, error: "Xodim topilmadi" };
  await prisma.employee.update({ where: { id: employeeId }, data: { active: true, archivedAt: null, archiveNote: null } });
  return { ok: true };
}

/** 🗑 Butunlay o'chirish — FAQAT xato kiritilgan qator uchun (0 ish kuni + 0 pul
 *  yozuvi + 0 boshlang'ich balans). Tarixi bori hech qachon o'chirilmaydi. */
export async function staffAdminEmployeeDelete(employeeId: number): Promise<{ ok: boolean; error?: string }> {
  const emp = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!emp) return { ok: false, error: "Xodim topilmadi" };
  const [sessions, ledger] = await Promise.all([
    prisma.workSession.count({ where: { employeeId } }),
    prisma.staffLedger.count({ where: { employeeId } }),
  ]);
  if (sessions > 0 || ledger > 0 || emp.openingBalance !== 0) {
    return { ok: false, error: `Tarixi bor (${sessions} ish kuni, ${ledger} pul yozuvi) — faqat arxivga olinadi` };
  }
  // FK bog'liqliklar: shaxsiy xabarlar, o'qildi-belgilari, ta'til/almashish so'rovlari.
  await prisma.$transaction([
    prisma.staffNoticeRead.deleteMany({ where: { employeeId } }),
    prisma.staffNotice.deleteMany({ where: { employeeId } }),
    prisma.leaveRequest.deleteMany({ where: { employeeId } }),
    prisma.shiftSwapRequest.deleteMany({ where: { OR: [{ requesterId: employeeId }, { partnerId: employeeId }] } }),
    prisma.employee.delete({ where: { id: employeeId } }),
  ]);
  return { ok: true };
}
