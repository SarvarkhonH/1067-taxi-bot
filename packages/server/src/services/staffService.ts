// 👔 JAMOA J2 (JAMOA_PLAN.md) — staff attendance service. ALL money math lives in
// @t1067/shared/staff (pure, 90-test-covered); this file only moves DB rows and
// enforces idempotency. REAL so'm (StaffLedger) — the tanga economy (CoinTxn,
// grantRideCoins, ≤350 clamp) is a different universe and is never touched here.
import {
  TASHKENT_UTC_OFFSET_MIN,
  type StaffDayPay,
  computeDayPay,
  dayKindFor,
  hhmmToMin,
  minutesSinceTashkentMidnight,
  resolveStaffPolicy,
  tashkentDayMinutes,
} from "@t1067/shared";
import { prisma } from "../db";
import { featureOn } from "./featureFlags";

// Ledger sign map: balance = openingBalance + Σ(earn,bonus) − Σ(payout,adjust).
// "adjust" is the minus-korreksiya/jarima kind (note is mandatory); upward fixes use "bonus".
const PLUS_KINDS = ["earn", "bonus"] as const;
const MINUS_KINDS = ["payout", "adjust"] as const;

export type StaffActionResult =
  | { ok: true; text: string }
  | { ok: false; text: string };

/** Active employee (+org) for a Telegram account, or null (menu stays hidden). */
export async function employeeFor(telegramId: string) {
  if (!(await featureOn("jamoa"))) return null;
  const emp = await prisma.employee.findUnique({ where: { telegramId }, include: { org: true } });
  if (!emp || !emp.active || !emp.org.active) return null;
  return emp;
}

type EmployeeWithOrg = NonNullable<Awaited<ReturnType<typeof employeeFor>>>;

function policyFor(emp: EmployeeWithOrg, day?: { shiftStartOvr?: string | null; shiftEndOvr?: string | null }) {
  return resolveStaffPolicy(
    { ...emp.org, calendar: emp.org.calendar ?? undefined },
    emp,
    day
  );
}

function fmt(n: number): string {
  return n.toLocaleString("ru-RU").replace(/,/g, " ");
}

function ymd(date: string): [number, number, number] {
  const p = date.split("-").map(Number);
  return [p[0] ?? 0, p[1] ?? 1, p[2] ?? 1];
}

function hhmm(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** "✅ Keldim" — open today's session. Idempotent: a second tap just re-reports. */
export async function staffCheckIn(telegramId: string, now = new Date()): Promise<StaffActionResult> {
  const emp = await employeeFor(telegramId);
  if (!emp) return { ok: false, text: "Siz xodim sifatida ro'yxatda emassiz." };
  const t = tashkentDayMinutes(now);
  const existing = await prisma.workSession.findUnique({ where: { employeeId_date: { employeeId: emp.id, date: t.date } } });
  if (existing?.checkIn) {
    const at = minutesSinceTashkentMidnight(existing.checkIn, t.date);
    return { ok: true, text: `Bugun allaqachon ${hhmm(at)} da kelgansiz. Ketishda "🏁 Ketdim" bosing.` };
  }
  const pol = policyFor(emp, existing ?? undefined);
  const [y, m, d] = ymd(t.date);
  const kind = dayKindFor(y, m, d, pol.workDays, pol.calendar);
  await prisma.workSession.upsert({
    where: { employeeId_date: { employeeId: emp.id, date: t.date } },
    create: { employeeId: emp.id, date: t.date, dayStatus: "ishladi", checkIn: now },
    update: { dayStatus: "ishladi", checkIn: now },
  });
  const damNote = kind !== "ish" ? `\n⚠️ Bugun jadval bo'yicha ${kind === "bayram" ? "bayram" : "dam"} kuni — baribir yozildi, ega tasdiqlashda ko'radi.` : "";
  const late = t.minutes > hhmmToMin(pol.shiftStart) + pol.graceMin;
  return {
    ok: true,
    text:
      `✅ Keldingiz: <b>${hhmm(t.minutes)}</b> · Smena: ${pol.shiftStart}–${pol.shiftEnd}` +
      (late ? `\n⏰ Kechikish — hisob ${hhmm(t.minutes)} dan yuritiladi.` : `\nXayrli ish!`) +
      damNote,
  };
}

/** Recompute a session's pay from the resolved policy and mirror it into the ledger
 *  (upsert on `staffearn:<sessionId>` — recompute/edit NEVER double-writes). */
export async function recomputeSession(sessionId: number): Promise<StaffDayPay | null> {
  const s = await prisma.workSession.findUnique({ where: { id: sessionId }, include: { employee: { include: { org: true } } } });
  if (!s) return null;
  const pol = policyFor(s.employee as EmployeeWithOrg, s);
  const [y, m] = ymd(s.date);
  const VALID = ["ishladi", "kelmadi", "javobli", "kasallik", "tatil", "bayram"] as const;
  const dayStatus = (VALID as readonly string[]).includes(s.dayStatus) ? (s.dayStatus as (typeof VALID)[number]) : "ishladi";
  const pay = computeDayPay(pol, {
    year: y,
    month: m,
    dayStatus,
    checkInMin: s.checkIn ? minutesSinceTashkentMidnight(s.checkIn, s.date) : undefined,
    checkOutMin: s.checkOut ? minutesSinceTashkentMidnight(s.checkOut, s.date) : undefined,
    approvedOvertimeMin: s.overtimeMin,
  });
  await prisma.$transaction([
    prisma.workSession.update({
      where: { id: s.id },
      data: { minutesWorked: pay.minutesWorked, amountEarned: pay.amountEarned },
    }),
    prisma.staffLedger.upsert({
      where: { idempotencyKey: `staffearn:${s.id}` },
      create: {
        employeeId: s.employeeId,
        kind: "earn",
        amount: pay.amountEarned,
        note: `${s.date} ish haqi`,
        sessionId: s.id,
        idempotencyKey: `staffearn:${s.id}`,
        createdBy: "system",
      },
      update: { amount: pay.amountEarned },
    }),
  ]);
  return pay;
}

/** "🏁 Ketdim" — close today's session and accrue the day's pay. */
export async function staffCheckOut(telegramId: string, now = new Date()): Promise<StaffActionResult> {
  const emp = await employeeFor(telegramId);
  if (!emp) return { ok: false, text: "Siz xodim sifatida ro'yxatda emassiz." };
  const t = tashkentDayMinutes(now);
  // A past-midnight shift checks out after 00:00 — the open session is then dated
  // YESTERDAY. Look at today first, then yesterday-with-open-checkin.
  let s = await prisma.workSession.findUnique({ where: { employeeId_date: { employeeId: emp.id, date: t.date } } });
  if (!s || (!s.checkIn && !s.checkOut)) {
    const yesterday = tashkentDayMinutes(new Date(now.getTime() - 86_400_000)).date;
    const prev = await prisma.workSession.findUnique({ where: { employeeId_date: { employeeId: emp.id, date: yesterday } } });
    if (prev?.checkIn && !prev.checkOut) s = prev;
  }
  if (!s?.checkIn) return { ok: false, text: `Avval "✅ Keldim" bosing — bugun kelish vaqti yozilmagan.` };
  if (s.checkOut) {
    const at = minutesSinceTashkentMidnight(s.checkOut, s.date);
    return { ok: true, text: `Allaqachon ${hhmm(at)} da ketganingiz yozilgan. Hisob: <b>${fmt(s.amountEarned)} so'm</b>.` };
  }
  await prisma.workSession.update({ where: { id: s.id }, data: { checkOut: now, autoClosed: false } });
  const pay = await recomputeSession(s.id);
  if (!pay) return { ok: false, text: "Xatolik — qayta urinib ko'ring." };
  const h = Math.floor(pay.minutesWorked / 60);
  const min = pay.minutesWorked % 60;
  return {
    ok: true,
    text:
      `🏁 Ketdingiz. Bugun <b>${h} soat ${min} daqiqa</b> ishladingiz.\n` +
      `💵 Hisoblandi: <b>${fmt(pay.amountEarned)} so'm</b>` +
      (pay.overtimeMin > 0 ? ` (shu jumladan ${pay.overtimeMin} daq overtime)` : ""),
  };
}

/** "📊 Hisobim" — month-to-date + full balance, the anti-argument screen. */
export async function staffMyAccount(telegramId: string, now = new Date()): Promise<StaffActionResult> {
  const emp = await employeeFor(telegramId);
  if (!emp) return { ok: false, text: "Siz xodim sifatida ro'yxatda emassiz." };
  const t = tashkentDayMinutes(now);
  const monthPrefix = t.date.slice(0, 7); // "2026-07"
  const [sessions, ledger] = await Promise.all([
    prisma.workSession.findMany({ where: { employeeId: emp.id, date: { startsWith: monthPrefix } } }),
    prisma.staffLedger.findMany({ where: { employeeId: emp.id }, orderBy: { createdAt: "desc" } }),
  ]);
  const worked = sessions.filter((s) => s.dayStatus === "ishladi" && s.minutesWorked > 0);
  const monthMin = worked.reduce((a, s) => a + s.minutesWorked, 0);
  const monthEarn = sessions.reduce((a, s) => a + s.amountEarned, 0);
  const plus = ledger.filter((l) => (PLUS_KINDS as readonly string[]).includes(l.kind)).reduce((a, l) => a + l.amount, 0);
  const minus = ledger.filter((l) => (MINUS_KINDS as readonly string[]).includes(l.kind)).reduce((a, l) => a + l.amount, 0);
  const balance = emp.openingBalance + plus - minus;
  const lastPayouts = ledger.filter((l) => l.kind === "payout").slice(0, 3);
  const payoutLines = lastPayouts.length
    ? "\n\nOxirgi to'lovlar:\n" + lastPayouts.map((l) => `− ${fmt(l.amount)} so'm ${l.note ? `(${l.note})` : ""} · ${l.createdAt.toISOString().slice(0, 10)}`).join("\n")
    : "";
  return {
    ok: true,
    text:
      `📊 <b>${emp.name}</b> — ${monthPrefix}\n` +
      `Ishlagan: <b>${worked.length} kun</b> · ${Math.floor(monthMin / 60)} soat ${monthMin % 60} daq\n` +
      `Shu oy hisoblangan: <b>${fmt(monthEarn)} so'm</b>\n` +
      `💰 Umumiy qoldiq: <b>${fmt(balance)} so'm</b>` +
      payoutLines,
  };
}

/** Sweep hook (J4 wires this into the 15-min tick): auto-close forgotten sessions
 *  once the shift end is well past (checkOut = shift end, ⚠️ autoClosed flag). */
export async function staffAutoCloseOverdue(now = new Date()): Promise<number> {
  if (!(await featureOn("jamoa"))) return 0;
  const open = await prisma.workSession.findMany({
    where: { checkIn: { not: null }, checkOut: null },
    include: { employee: { include: { org: true } } },
  });
  let closed = 0;
  for (const s of open) {
    if (!s.employee.active) continue;
    const pol = policyFor(s.employee as EmployeeWithOrg, s);
    const start = hhmmToMin(pol.shiftStart);
    let end = hhmmToMin(pol.shiftEnd);
    if (end <= start) end += 1440;
    const nowMin = minutesSinceTashkentMidnight(now, s.date);
    if (nowMin <= end + 30) continue; // 30-min courtesy window after shift end
    const [y, m, d] = ymd(s.date);
    const checkOutAt = new Date(Date.UTC(y, m - 1, d) - TASHKENT_UTC_OFFSET_MIN * 60_000 + end * 60_000);
    await prisma.workSession.update({ where: { id: s.id }, data: { checkOut: checkOutAt, autoClosed: true } });
    await recomputeSession(s.id);
    closed++;
  }
  return closed;
}