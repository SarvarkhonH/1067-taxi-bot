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

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
  // Past-midnight arrival for YESTERDAY's night shift (to'y 16:00–00:30, employee
  // taps Keldim at 00:10): the check-in belongs to yesterday's overridden row, not
  // to a fresh today-session under the default 09:00–18:00 policy (→ 0 so'm ghost).
  if (!existing) {
    const yDate = tashkentDayMinutes(new Date(now.getTime() - 86_400_000)).date;
    const prev = await prisma.workSession.findUnique({ where: { employeeId_date: { employeeId: emp.id, date: yDate } } });
    if (prev && !prev.checkIn && !prev.checkOut) {
      const ppol = policyFor(emp, prev);
      const pstart = hhmmToMin(ppol.shiftStart);
      const pend = hhmmToMin(ppol.shiftEnd);
      if (pend <= pstart && minutesSinceTashkentMidnight(now, yDate) < pend + 1440 + 60) {
        await prisma.workSession.update({ where: { id: prev.id }, data: { dayStatus: "ishladi", checkIn: now } });
        return { ok: true, text: `✅ Keldingiz: <b>${hhmm(t.minutes)}</b> · Kechagi ${ppol.shiftStart}–${ppol.shiftEnd} smenaga yozildi.` };
      }
    }
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
    ? "\n\nOxirgi to'lovlar:\n" + lastPayouts.map((l) => `− ${fmt(l.amount)} so'm ${l.note ? `(${esc(l.note)})` : ""} · ${tashkentDayMinutes(l.createdAt).date}`).join("\n")
    : "";
  return {
    ok: true,
    text:
      `📊 <b>${esc(emp.name)}</b> — ${monthPrefix}\n` +
      `Ishlagan: <b>${worked.length} kun</b> · ${Math.floor(monthMin / 60)} soat ${monthMin % 60} daq\n` +
      `Shu oy hisoblangan: <b>${fmt(monthEarn)} so'm</b>\n` +
      `💰 Umumiy qoldiq: <b>${fmt(balance)} so'm</b>` +
      payoutLines,
  };
}

// ---------------------------------------------------------------------------
// 💸 Xodim O'ZI "pul oldim" deb yozadi (ega qarori 2026-07-31). Minus balans
// MUMKIN — real hayotda ega baribir beradi, daftar haqiqatni yozsin. Har yozuv
// egaga DARHOL boradi (❌ Bekor tugmasi bilan) — nazorat yo'qolmaydi.
// ---------------------------------------------------------------------------

async function ledgerBalance(employeeId: number, openingBalance: number): Promise<number> {
  const ledger = await prisma.staffLedger.groupBy({ by: ["kind"], where: { employeeId }, _sum: { amount: true } });
  let bal = openingBalance;
  for (const g of ledger) {
    const s = g._sum.amount ?? 0;
    if ((PLUS_KINDS as readonly string[]).includes(g.kind)) bal += s;
    if ((MINUS_KINDS as readonly string[]).includes(g.kind)) bal -= s; // "bekor" kind hech qaysida emas → 0
  }
  return bal;
}

function selfPayoutOwnerCard(emp: { name: string; org: { ownerTelegramId: string } }, a: number, note: string, bal: number, ledgerId: number) {
  return {
    chatId: emp.org.ownerTelegramId,
    ledgerId,
    text:
      `💸 <b>${esc(emp.name)}</b> "pul oldim" deb yozdi: <b>${fmt(a)} so'm</b>` +
      `${note ? ` (${esc(note.slice(0, 80))})` : ""}\n💰 Qoldig'i: <b>${fmt(bal)} so'm</b>${bal < 0 ? " ⚠️minus" : ""}`,
  };
}

export async function staffSelfPayout(
  telegramId: string,
  amount: number,
  note: string,
  msgKey: string // "<chatId>:<messageId>" — message_id faqat chat ichida unikal (tekshiruv topgan)
): Promise<{ ok: boolean; text: string; owner?: { chatId: string; text: string; ledgerId: number } }> {
  const emp = await employeeFor(telegramId);
  if (!emp) return { ok: false, text: "Siz xodim sifatida ro'yxatda emassiz." };
  const a = Math.round(amount);
  if (!Number.isFinite(a) || a <= 0 || a > 100_000_000) return { ok: false, text: "Summa noto'g'ri. Masalan: <code>500000</code> yoki <code>500000 avans</code>" };
  const key = `staffself:${emp.id}:${msgKey}`; // bir xabar — bir yozuv (retry ikkilamaydi)
  const existing = await prisma.staffLedger.findUnique({ where: { idempotencyKey: key } });
  if (existing) {
    if (existing.kind !== "payout") return { ok: true, text: "Bu yozuv bekor qilingan edi." }; // soft-bekor tombstone
    // Qayta-yetkazish: ega kartasi ham QAYTA yuborilsin — birinchi urinishda yetmagan bo'lishi mumkin.
    const bal0 = await ledgerBalance(emp.id, emp.openingBalance);
    return { ok: true, text: "Bu xabar allaqachon yozilgan.", owner: selfPayoutOwnerCard(emp, existing.amount, existing.note ?? "", bal0, existing.id) };
  }
  let row;
  try {
    row = await prisma.staffLedger.create({
      data: { employeeId: emp.id, kind: "payout", amount: a, note: note ? note.slice(0, 80) : "o'zi yozdi", idempotencyKey: key, createdBy: telegramId },
    });
  } catch {
    return { ok: true, text: "Bu xabar allaqachon yozilgan." }; // P2002 poyga — birinchi yozuv g'olib
  }
  const bal = await ledgerBalance(emp.id, emp.openingBalance);
  const minusNote = bal < 0 ? `\n⚠️ Qoldiq minusda — oldindan olingan pul keyingi hisoblardan yopiladi.` : "";
  return {
    ok: true,
    text: `💸 Yozildi: <b>−${fmt(a)} so'm</b>${note ? ` (${esc(note.slice(0, 80))})` : ""}\n💰 Qoldiq: <b>${fmt(bal)} so'm</b>${minusNote}`,
    owner: selfPayoutOwnerCard(emp, a, note, bal, row.id),
  };
}

/** Ega ❌ Bekor bosdi: FAQAT xodim o'zi yozgan payout SOFT-bekor qilinadi (kind →
 *  "bekor" — idempotency-kalit tombstone bo'lib qoladi, Telegram qayta-yetkazsa
 *  yozuv qayta tirilmaydi; audit ham saqlanadi). O'chirish YO'Q. */
export async function staffSelfPayoutCancel(ledgerId: number, actorTgId: string): Promise<{ ok: boolean; text: string; employee?: { chatId: string; text: string } }> {
  const row = await prisma.staffLedger.findUnique({ where: { id: ledgerId }, include: { employee: { include: { org: true } } } });
  if (!row) return { ok: false, text: "Yozuv topilmadi" };
  if (row.employee.org.ownerTelegramId !== actorTgId) return { ok: false, text: "Faqat korxona egasi bekor qiladi" };
  if (row.createdBy !== row.employee.telegramId) return { ok: false, text: "Bu yozuv xodim o'zi yozgani emas — panel orqali tuzating" };
  // updateMany + kind-filtri = poyga-xavfsiz (ikki marta bosishda ikkinchisi count=0 oladi)
  const r = await prisma.staffLedger.updateMany({
    where: { id: ledgerId, kind: "payout" },
    data: { kind: "bekor", note: `${row.note ? row.note + " · " : ""}❌ ega bekor qildi` },
  });
  if (r.count === 0) return { ok: true, text: "Allaqachon bekor qilingan." };
  return {
    ok: true,
    text: `❌ Bekor qilindi: ${esc(row.employee.name)} — ${fmt(row.amount)} so'm`,
    employee: { chatId: row.employee.telegramId, text: `❌ Egangiz "${fmt(row.amount)} so'm oldim" yozuvingizni bekor qildi. Savol bo'lsa bog'laning.` },
  };
}

// ---------------------------------------------------------------------------
// 🌙 J4 — kechki xulosa + tasdiqlash (15-daq tick'dan; YANGI poller YO'Q)
// ---------------------------------------------------------------------------

const SUMMARY_AFTER_MIN = 21 * 60; // 21:00 Toshkent — kun yakuni xulosasi shu vaqtdan keyin

/** One org's day in one message: kim keldi-ketdi, qancha hisoblandi, kim kelmadi. */
async function buildDailySummary(
  org: { id: number; name: string },
  employees: { id: number; name: string }[],
  date: string
): Promise<{ text: string; unconfirmed: number }> {
  const sessions = await prisma.workSession.findMany({ where: { date, employeeId: { in: employees.map((e) => e.id) } } });
  const byEmp = new Map(sessions.map((s) => [s.employeeId, s]));
  const lines: string[] = [];
  let total = 0;
  let unconfirmed = 0;
  for (const e of employees) {
    const s = byEmp.get(e.id);
    if (!s || (!s.checkIn && s.dayStatus === "ishladi")) {
      if (s && !s.confirmedAt) unconfirmed++; // sharpa-yozuv ham tasdiq kutadi (hisob 0)
      lines.push(`⚪ ${esc(e.name)} — kelmadi · 0`);
      continue;
    }
    if (!s.confirmedAt) unconfirmed++;
    total += s.amountEarned;
    if (s.dayStatus !== "ishladi") {
      lines.push(`▫️ ${esc(e.name)} — ${s.dayStatus} · ${fmt(s.amountEarned)}`);
      continue;
    }
    const io = `${s.checkIn ? hhmm(minutesSinceTashkentMidnight(s.checkIn, date)) : "—"}–${s.checkOut ? hhmm(minutesSinceTashkentMidnight(s.checkOut, date)) : "hali ishda"}`;
    lines.push(`${s.checkOut ? "🟢" : "🔵"} ${esc(e.name)} — ${io} · <b>${fmt(s.amountEarned)}</b>${s.autoClosed ? " ⚠️avto" : ""}${s.editedBy ? " ✏️" : ""}`);
  }
  const text =
    `📋 <b>${esc(org.name)} — ${date}</b>\n\n` +
    lines.join("\n") +
    `\n\nJami hisoblandi: <b>${fmt(total)} so'm</b>` +
    (unconfirmed ? `\n✅ Tasdiqlash — ${unconfirmed} ta kun yozuvi` : "\nHammasi tasdiqlangan ✓") +
    `\n<i>To'g'irlash: Admin panel → 👔 Jamoa</i>`;
  return { text, unconfirmed };
}

/**
 * EGA uchun: bugungi (yoki berilgan kundagi) xulosani TALAB BO'YICHA olish.
 * Kechki 21:00 kartasini kutmasdan `/jamoa` bilan chaqiriladi — ega test qilayotganda
 * yoki kun o'rtasida holatni ko'rmoqchi bo'lganda (2026-08-01: "tasdiqlash kelmadi" —
 * aslida karta 21:00 dan keyin ketadi, ega buni bilmasligi kerak emas).
 */
export async function staffOwnerSummary(
  telegramId: string,
  now = new Date()
): Promise<{ ok: boolean; text: string; orgId?: number; date?: string; unconfirmed?: number }> {
  if (!(await featureOn("jamoa"))) return { ok: false, text: "Jamoa moduli o'chirilgan." };
  const org = await prisma.organization.findFirst({
    where: { ownerTelegramId: telegramId, active: true },
    include: { employees: { where: { active: true }, orderBy: { name: "asc" } } },
  });
  if (!org) return { ok: false, text: "" }; // ega emas — jim
  if (!org.employees.length) return { ok: true, text: `👔 <b>${esc(org.name)}</b>\n\nHali xodim qo'shilmagan. Admin panel → 👔 Jamoa → «➕ Xodim qo'shish».` };
  const t = tashkentDayMinutes(now);
  const { text, unconfirmed } = await buildDailySummary(org, org.employees, t.date);
  return { ok: true, text, orgId: org.id, date: t.date, unconfirmed };
}

/** Owner taps "✅ Tasdiqlash" on the evening card. Only that org's owner may confirm. */
export async function staffConfirmDay(orgId: number, date: string, actorTgId: string): Promise<{ ok: boolean; text: string }> {
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) return { ok: false, text: "Korxona topilmadi" };
  if (org.ownerTelegramId !== actorTgId) return { ok: false, text: "Faqat korxona egasi tasdiqlaydi" };
  // OCHIQ smena (keldi, hali ketmagan) tasdiqlanMAYDI — summasi keyin o'zgaradi va
  // "tasdiqlangan" so'zi yolg'onga aylanadi (tekshiruv BUG 1). U ertaga avto-yopilib
  // keyingi kartada tasdiq oladi.
  const r = await prisma.workSession.updateMany({
    where: {
      date,
      confirmedAt: null,
      employee: { orgId },
      NOT: { dayStatus: "ishladi", checkIn: { not: null }, checkOut: null },
    },
    data: { confirmedAt: new Date() },
  });
  const open = await prisma.workSession.count({ where: { date, employee: { orgId }, dayStatus: "ishladi", checkIn: { not: null }, checkOut: null } });
  const openNote = open ? ` (${open} ta hali ishda — yopilgach tasdiqlanadi)` : "";
  return { ok: true, text: r.count ? `✅ ${date} tasdiqlandi (${r.count} ta yozuv)${openNote}` : `✅ ${date} — hammasi allaqachon tasdiqlangan${openNote}` };
}

/** 15-min tick entry (index.ts): auto-close forgotten sessions, then after 21:00
 *  Tashkent send each org-owner ONE summary card (AppState marker = once per day,
 *  set only after a successful send — failed evening send retries next tick). */
export async function staffDailyTick(bot: import("grammy").Bot, now = new Date()): Promise<void> {
  if (!(await featureOn("jamoa"))) return;
  await staffAutoCloseOverdue(now).catch((e) => console.error("[staff] autoclose failed:", e));
  const t = tashkentDayMinutes(now);
  if (t.minutes < SUMMARY_AFTER_MIN) return;
  const orgs = await prisma.organization.findMany({ where: { active: true }, include: { employees: { where: { active: true }, orderBy: { name: "asc" } } } });
  for (const org of orgs) {
    if (!org.employees.length) continue;
    const marker = `staffsummary:${org.id}:${t.date}`;
    if (await prisma.appState.findUnique({ where: { key: marker } })) continue;
    const { text, unconfirmed } = await buildDailySummary(org, org.employees, t.date);
    const { InlineKeyboard } = await import("grammy");
    const kb = unconfirmed ? new InlineKeyboard().text("✅ Tasdiqlash", `ishc:${org.id}:${t.date}`) : undefined;
    try {
      await bot.api.sendMessage(org.ownerTelegramId, text, { parse_mode: "HTML", reply_markup: kb });
    } catch (e) {
      console.error(`[staff] summary send failed org=${org.id}:`, e);
      continue; // marker YO'Q — keyingi tick qayta uradi (kechqurun ~12 urinish max)
    }
    await prisma.appState.upsert({ where: { key: marker }, create: { key: marker, value: "1" }, update: { value: "1" } });
  }
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
    if (!s.employee.active || !s.employee.org.active) continue;
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