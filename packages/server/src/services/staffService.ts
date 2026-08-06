// 👔 JAMOA J2 (JAMOA_PLAN.md) — staff attendance service. ALL money math lives in
// @t1067/shared/staff (pure, 90-test-covered); this file only moves DB rows and
// enforces idempotency. REAL so'm (StaffLedger) — the tanga economy (CoinTxn,
// grantRideCoins, ≤350 clamp) is a different universe and is never touched here.
import {
  TASHKENT_UTC_OFFSET_MIN,
  type StaffDayPay,
  computeDayPay,
  dailyRateFor,
  dateKey,
  dayKindFor,
  hhmmToMin,
  hourlyRateFor,
  type StaffEmployeeRow,
  type StaffOrgPolicyRow,
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

const EARLY_NOTIFY_MIN = 15; // shu daqdan ko'proq erta kelsa egaga xabar (2-3 daq erta — spam emas)

/** Ega DARHOL xabar olsin (ega talabi 2026-08-05): kechikish/erta kelish/pul olish
 *  sodir bo'lganda kechqurungi jamlangan kartani kutmasdan. Xato bo'lsa loglanadi,
 *  lekin xodimning o'z javobiga hech qachon to'sqinlik qilmaydi. */
async function notifyOwner(ownerTelegramId: string, text: string): Promise<void> {
  try {
    const { getBotInstance } = await import("../botInstance");
    const bot = getBotInstance();
    if (!bot) return;
    await bot.api.sendMessage(ownerTelegramId, text, { parse_mode: "HTML" });
  } catch (e) {
    console.error("[staff] notifyOwner failed:", e);
  }
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
        const arrivalMin = minutesSinceTashkentMidnight(now, yDate); // allaqachon 1440+ (kechagi kundan)
        if (arrivalMin > pstart + ppol.graceMin && emp.org.ownerTelegramId !== telegramId) {
          await notifyOwner(emp.org.ownerTelegramId, `⏰ <b>${esc(emp.name)}</b> kechikib keldi: ${hhmm(t.minutes)} (kechagi smena ${ppol.shiftStart}–${ppol.shiftEnd})`);
        }
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
  const shiftStartMin = hhmmToMin(pol.shiftStart);
  const late = t.minutes > shiftStartMin + pol.graceMin;
  const early = t.minutes < shiftStartMin - EARLY_NOTIFY_MIN;
  // Ega talabi 2026-08-05: kechikish/erta kelish kechqurungi kartani kutmasdan DARHOL
  // xabar bo'lsin — kunlik xulosa (buildDailySummary) hali ham 21:00'da hammasini jamlab beradi.
  if (emp.org.ownerTelegramId !== telegramId) {
    if (late) {
      await notifyOwner(emp.org.ownerTelegramId, `⏰ <b>${esc(emp.name)}</b> kechikib keldi: ${hhmm(t.minutes)} (smena ${pol.shiftStart}, +${t.minutes - shiftStartMin - pol.graceMin} daq)`);
    } else if (early) {
      await notifyOwner(emp.org.ownerTelegramId, `🕗 <b>${esc(emp.name)}</b> erta keldi: ${hhmm(t.minutes)} (smena ${pol.shiftStart})`);
    }
  }
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
      // overtimeMin AVVAL yozilmagan edi (bug topildi 2026-08-06): pul to'g'ri hisoblanardi
      // (avto rejimda checkOut'dan har safar qayta olinadi), lekin ustun 0'da qolib,
      // panelda "overtime yo'q" ko'rinardi. "qolda" rejimda esa BU HAQIQIY pul-bug edi:
      // approvedOvertimeMin har recompute'da 0 o'qilib, ega tasdiqlagan daqiqalar o'chib
      // ketardi.
      data: { minutesWorked: pay.minutesWorked, amountEarned: pay.amountEarned, overtimeMin: pay.overtimeMin },
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

/**
 * B4 (ega talabi 2026-08-05): "🤒 Bugun kasalman" — xodim o'zi belgilaydi, TASDIQ
 * KUTMASDAN darhol yoziladi (ega darhol xabar oladi, panelda istalgan payt
 * bekor/tuzatishi mumkin — bu B1'dagi to'liq so'rov-tasdiq oqimidan farqli,
 * ataylab eng tez/eng oddiy variant). FAQAT hali "Keldim" bosilmagan kunda —
 * ishlab turgan kunni kasallikka aylantirish ish soatlarini o'chirib yuboradi,
 * bu ega qaroriga qoldiriladi (panel → kun tuzatish).
 */
export async function staffSelfReportSick(telegramId: string, now = new Date()): Promise<StaffActionResult> {
  const emp = await employeeFor(telegramId);
  if (!emp) return { ok: false, text: "Siz xodim sifatida ro'yxatda emassiz." };
  const t = tashkentDayMinutes(now);
  const existing = await prisma.workSession.findUnique({ where: { employeeId_date: { employeeId: emp.id, date: t.date } } });
  if (existing?.checkIn) return { ok: false, text: `Siz bugun allaqachon ${hhmm(minutesSinceTashkentMidnight(existing.checkIn, t.date))} da kelib, ish boshlagansiz. O'zgartirish kerak bo'lsa, ega bilan bog'laning.` };
  if (existing?.dayStatus === "kasallik") return { ok: true, text: "Bugun allaqachon kasallik deb belgilangan." };
  // Atomik yozuv: "Keldim" bilan bir vaqtda bosilsa (poyga), haqiqiy kelish vaqti
  // O'CHIB KETMASIN (tekshiruv topgan TOCTOU) — read-then-upsert o'rniga create-yoki-
  // faqat-checkIn-yo'q-bo'lsa-yangilash, DB darajasida atomik.
  let sessionId: number;
  try {
    sessionId = (await prisma.workSession.create({ data: { employeeId: emp.id, date: t.date, dayStatus: "kasallik" } })).id;
  } catch {
    const r = await prisma.workSession.updateMany({ where: { employeeId: emp.id, date: t.date, checkIn: null }, data: { dayStatus: "kasallik" } });
    if (r.count === 0) {
      const now2 = await prisma.workSession.findUnique({ where: { employeeId_date: { employeeId: emp.id, date: t.date } } });
      if (now2?.checkIn) return { ok: false, text: `Siz bugun allaqachon ${hhmm(minutesSinceTashkentMidnight(now2.checkIn, t.date))} da kelib, ish boshlagansiz. O'zgartirish kerak bo'lsa, ega bilan bog'laning.` };
      return { ok: true, text: "Bugun allaqachon kasallik deb belgilangan." };
    }
    const s2 = await prisma.workSession.findUniqueOrThrow({ where: { employeeId_date: { employeeId: emp.id, date: t.date } } });
    sessionId = s2.id;
  }
  const pay = await recomputeSession(sessionId);
  if (emp.org.ownerTelegramId !== telegramId) {
    await notifyOwner(emp.org.ownerTelegramId, `🤒 <b>${esc(emp.name)}</b> bugun o'zini kasal deb belgiladi.\nHisob: <b>${fmt(pay?.amountEarned ?? 0)} so'm</b> (kasallik %)\nKerak bo'lsa: Admin panel → 👔 Jamoa → kunni tuzating.`);
  }
  return { ok: true, text: `🤒 Bugun kasallik deb belgilandi. Tuzalib qoling! Egangizga xabar berildi.` };
}

// ---------------------------------------------------------------------------
// 🏖 B1 — Ta'til so'rash (P2, ega talabi 2026-08-05). To'liq so'rov→tasdiq oqimi:
// B4'dan farqi — kelajakdagi/ko'p kunlik, EGA TASDIQLASHI kerak (darhol amalga
// oshmaydi). Tasdiqlansa har kunga WorkSession.dayStatus="tatil" (recomputeSession
// orqali — bir xil pul-yadro), rad etilsa hech narsa yozilmaydi.
// ---------------------------------------------------------------------------

const MAX_LEAVE_DAYS = 30; // bitta so'rovda maksimal kun soni (aql bovar qilmas xato-kiritishdan himoya)

function parseIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  const [fy, fm, fd] = ymd(from);
  const [ty2, tm2, td2] = ymd(to);
  let cur = Date.UTC(fy, fm - 1, fd);
  const end = Date.UTC(ty2, tm2 - 1, td2);
  while (cur <= end) {
    const d = new Date(cur);
    out.push(dateKey(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()));
    cur += 86_400_000;
  }
  return out;
}

export async function staffRequestLeave(
  telegramId: string,
  fromDate: string,
  toDate: string,
  reason: string,
  now = new Date()
): Promise<{ ok: boolean; text: string }> {
  const emp = await employeeFor(telegramId);
  if (!emp) return { ok: false, text: "Siz xodim sifatida ro'yxatda emassiz." };
  if (!parseIsoDate(fromDate) || !parseIsoDate(toDate)) return { ok: false, text: "Sana formati: 2026-08-10 2026-08-12 sabab" };
  if (toDate < fromDate) return { ok: false, text: "Oxirgi sana boshlanish sanasidan oldin bo'lolmaydi." };
  const days = dateRange(fromDate, toDate);
  if (days.length > MAX_LEAVE_DAYS) return { ok: false, text: `Juda uzoq oraliq (${days.length} kun) — bir so'rovda ${MAX_LEAVE_DAYS} kungacha.` };
  const today = tashkentDayMinutes(now).date;
  // Ikkalasi ham BUGUNDAN kech bo'lishi shart — o'tmish yoki bugungi kun allaqachon
  // haqiqiy ishlangan bo'lishi mumkin (tekshiruv topgan: aks holda tasdiqlash real
  // hisoblangan pulni ta'til-puliga almashtirib yuborardi). O'tgan kun tuzatishi —
  // faqat ega panel orqali (bilib turib).
  if (fromDate < today) return { ok: false, text: "Bugundan oldingi sana uchun so'rov yubora olmaysiz — ega bilan bog'laning." };
  if (toDate < today) return { ok: false, text: "O'tgan sana uchun so'rov yubora olmaysiz — ega bilan bog'laning." };
  const req = await prisma.leaveRequest.create({
    data: { employeeId: emp.id, kind: "tatil", fromDate, toDate, reason: reason.trim().slice(0, 200) || null },
  });
  const kunSoz = days.length === 1 ? `${fromDate}` : `${fromDate} – ${toDate} (${days.length} kun)`;
  if (emp.org.ownerTelegramId === telegramId) {
    return { ok: true, text: `🏖 So'rov yozildi (siz ham ega bo'lgani uchun o'zingiz tasdiqlaysiz — panel/`+"`/tatillar`"+` orqali).` };
  }
  const { InlineKeyboard } = await import("grammy");
  const kb = new InlineKeyboard().text("✅ Ruxsat", `ishlv:${req.id}:y`).text("❌ Rad", `ishlv:${req.id}:n`);
  try {
    const { getBotInstance } = await import("../botInstance");
    const bot = getBotInstance();
    await bot?.api.sendMessage(
      emp.org.ownerTelegramId,
      `🏖 <b>${esc(emp.name)}</b> ta'til so'ramoqda: <b>${kunSoz}</b>${reason ? `\nSabab: ${esc(reason.slice(0, 200))}` : ""}`,
      { parse_mode: "HTML", reply_markup: kb }
    );
  } catch (e) {
    console.error("[staff] leave-request owner notify failed:", e);
  }
  return { ok: true, text: `🏖 So'rovingiz egaga yuborildi: <b>${kunSoz}</b>. Javobini shu yerda bilasiz.` };
}

/** Ega ✅/❌ bosdi. Tasdiqlansa — oraliqdagi HAR kunga dayStatus yoziladi va
 *  recomputeSession orqali hisoblanadi (kelmagan/allaqachon ishlangan kunlar ham
 *  qayta yoziladi — ega ongli tasdiqlagani uchun bu kutilgan xatti-harakat). */
export async function staffDecideLeave(requestId: number, approve: boolean, actorTgId: string): Promise<{ ok: boolean; text: string }> {
  const req = await prisma.leaveRequest.findUnique({ where: { id: requestId }, include: { employee: { include: { org: true } } } });
  if (!req) return { ok: false, text: "So'rov topilmadi." };
  if (req.employee.org.ownerTelegramId !== actorTgId) return { ok: false, text: "Faqat korxona egasi hal qiladi." };
  // Atomik: ikki marta bosish (yoki qayta-yetkazish) ikkinchi marta yozmasin
  // (tekshiruv topgan poyga — staffSelfPayoutCancel'dagi bir xil naqsh).
  const claim = await prisma.leaveRequest.updateMany({
    where: { id: req.id, status: "pending" },
    data: { status: approve ? "approved" : "rejected", decidedBy: actorTgId, decidedAt: new Date() },
  });
  if (claim.count === 0) {
    const now2 = await prisma.leaveRequest.findUnique({ where: { id: req.id }, select: { status: true } });
    return { ok: true, text: `Bu so'rov allaqachon "${now2?.status ?? "?"}" holatida.` };
  }
  const days = dateRange(req.fromDate, req.toDate);
  const skipped: string[] = [];
  if (approve) {
    for (const date of days) {
      const existing = await prisma.workSession.findUnique({ where: { employeeId_date: { employeeId: req.employeeId, date } } });
      // Allaqachon haqiqiy ishlab, KETGAN kunni ta'til-puliga almashtirib yubormaymiz
      // (tekshiruv topgan: real hisoblangan pul jimgina o'chib ketardi). Bunday kun
      // o'tkazib yuboriladi — ega ro'yxatda ko'radi, kerak bo'lsa panelda qo'lda hal qiladi.
      if (existing?.dayStatus === "ishladi" && existing.checkIn && existing.checkOut) {
        skipped.push(date);
        continue;
      }
      const s = await prisma.workSession.upsert({
        where: { employeeId_date: { employeeId: req.employeeId, date } },
        create: { employeeId: req.employeeId, date, dayStatus: req.kind },
        update: { dayStatus: req.kind },
      });
      await recomputeSession(s.id);
    }
  }
  const kunSoz = req.fromDate === req.toDate ? req.fromDate : `${req.fromDate} – ${req.toDate}`;
  const skipNote = skipped.length ? `\n⚠️ ${skipped.length} kun allaqachon ishlangani uchun o'zgartirilmadi: ${skipped.join(", ")}` : "";
  const empText = approve ? `✅ Ta'til so'rovingiz TASDIQLANDI: <b>${kunSoz}</b>${skipNote}` : `❌ Ta'til so'rovingiz RAD ETILDI: <b>${kunSoz}</b>`;
  if (req.employee.telegramId !== actorTgId) await notifyOwner(req.employee.telegramId, empText); // notifyOwner — xodimga ham ishlaydi, chatId parametr
  return { ok: true, text: (approve ? `✅ Tasdiqlandi: ${esc(req.employee.name)} — ${kunSoz}` : `❌ Rad etildi: ${esc(req.employee.name)} — ${kunSoz}`) + skipNote };
}

// ---------------------------------------------------------------------------
// 🔄 B2 — Smena almashish so'rovi (P2). Uch bosqich: hamkasb rozi → ega tasdiq.
// Tasdiqlansa: so'ragan kuni "javobli" (0 so'm, kelmadi emas), hamkasb o'sha kuni
// so'raganning smenasi bilan ishladi deb yoziladi (shiftStartOvr/EndOvr).
// ---------------------------------------------------------------------------

export async function staffRequestSwap(
  telegramId: string,
  partnerNameQuery: string,
  date: string,
  now = new Date()
): Promise<{ ok: boolean; text: string }> {
  const emp = await employeeFor(telegramId);
  if (!emp) return { ok: false, text: "Siz xodim sifatida ro'yxatda emassiz." };
  if (!parseIsoDate(date)) return { ok: false, text: "Format: <hamkasb ismi> 2026-08-10" };
  const today = tashkentDayMinutes(now).date;
  if (date < today) return { ok: false, text: "O'tgan kun uchun almashtirib bo'lmaydi." };
  const candidates = await prisma.employee.findMany({ where: { orgId: emp.orgId, active: true, id: { not: emp.id } } });
  const q = partnerNameQuery.trim().toLowerCase();
  // Aniq mos kelish (masalan "Ali") qisman moslardan ("Alisher" ham "Ali"ni o'z ichiga
  // oladi) USTUN turadi — tekshiruv topgan: aks holda aniq ism ham "noaniq" deb rad etilardi.
  const exact = candidates.find((c) => c.name.toLowerCase() === q);
  const matches = exact ? [exact] : candidates.filter((c) => c.name.toLowerCase().includes(q));
  if (matches.length === 0) {
    const names = candidates.map((c) => c.name).join(", ") || "(hozircha hamkasb yo'q)";
    return { ok: false, text: `«${partnerNameQuery}» topilmadi. Mavjud hamkasblar: ${names}` };
  }
  if (matches.length > 1) return { ok: false, text: `Bir nechta mos keldi: ${matches.map((c) => c.name).join(", ")} — to'liqroq yozing.` };
  const partner = matches[0];
  if (!partner) return { ok: false, text: "Xodim topilmadi." };
  const swap = await prisma.shiftSwapRequest.create({ data: { requesterId: emp.id, partnerId: partner.id, date } });
  const { InlineKeyboard } = await import("grammy");
  const kb = new InlineKeyboard().text("✅ Roziman", `ishsw:${swap.id}:y`).text("❌ Yo'q", `ishsw:${swap.id}:n`);
  try {
    const { getBotInstance } = await import("../botInstance");
    const bot = getBotInstance();
    await bot?.api.sendMessage(partner.telegramId, `🔄 <b>${esc(emp.name)}</b> sizdan <b>${date}</b> kuni smena almashishni so'ramoqda. Roziman desangiz, o'sha kuni ${esc(emp.name)} smenasida siz ishlaysiz.`, { parse_mode: "HTML", reply_markup: kb });
  } catch (e) {
    console.error("[staff] swap-request partner notify failed:", e);
  }
  return { ok: true, text: `🔄 So'rov <b>${esc(partner.name)}</b>ga yuborildi (${date}). Rozi bo'lsa, ega ham tasdiqlaydi.` };
}

/** Hamkasb ✅/❌ bosdi (bosqich 1). Rozi bo'lsa → egaga o'tadi; yo'q desa — tugadi. */
export async function staffDecideSwapPartner(swapId: number, accept: boolean, actorTgId: string): Promise<{ ok: boolean; text: string }> {
  const s = await prisma.shiftSwapRequest.findUnique({ where: { id: swapId }, include: { requester: { include: { org: true } }, partner: true } });
  if (!s) return { ok: false, text: "So'rov topilmadi." };
  if (s.partner.telegramId !== actorTgId) return { ok: false, text: "Bu so'rov sizga tegishli emas." };
  if (s.status !== "pending_partner") return { ok: true, text: `Bu so'rov allaqachon "${s.status}" holatida.` };
  if (!accept) {
    const claim = await prisma.shiftSwapRequest.updateMany({ where: { id: swapId, status: "pending_partner" }, data: { status: "rejected", decidedBy: actorTgId, decidedAt: new Date() } });
    if (claim.count === 0) return { ok: true, text: "Bu so'rov allaqachon hal qilingan." };
    await notifyOwner(s.requester.telegramId, `❌ <b>${esc(s.partner.name)}</b> ${s.date} kuni almashishga rozi bo'lmadi.`);
    return { ok: true, text: "Rad etdingiz — so'ragan xodimga xabar berildi." };
  }
  const claim = await prisma.shiftSwapRequest.updateMany({ where: { id: swapId, status: "pending_partner" }, data: { status: "pending_owner" } });
  if (claim.count === 0) return { ok: true, text: "Bu so'rov allaqachon hal qilingan." };
  const { InlineKeyboard } = await import("grammy");
  const kb = new InlineKeyboard().text("✅ Tasdiqlash", `ishsw:${swapId}:oy`).text("❌ Rad", `ishsw:${swapId}:on`);
  await notifyOwner(
    s.requester.org.ownerTelegramId,
    `🔄 <b>${esc(s.requester.name)}</b> va <b>${esc(s.partner.name)}</b> <b>${s.date}</b> kuni smena almashmoqchi (${esc(s.partner.name)} rozi). Tasdiqlaysizmi?`
  );
  // notifyOwner ichida keyboard yo'q — alohida yuboramiz (tugma kerak)
  try {
    const { getBotInstance } = await import("../botInstance");
    const bot = getBotInstance();
    await bot?.api.sendMessage(s.requester.org.ownerTelegramId, `👆 Tasdiqlash uchun:`, { reply_markup: kb });
  } catch (e) {
    console.error("[staff] swap owner-decide keyboard failed:", e);
  }
  return { ok: true, text: "Rozi bo'ldingiz — endi ega tasdiqlaydi." };
}

/** Ega ✅/❌ bosdi (bosqich 2, yakuniy). Tasdiqlansa ikkala kunga ham yoziladi. */
export async function staffDecideSwapOwner(swapId: number, approve: boolean, actorTgId: string): Promise<{ ok: boolean; text: string }> {
  const s = await prisma.shiftSwapRequest.findUnique({ where: { id: swapId }, include: { requester: { include: { org: true } }, partner: true } });
  if (!s) return { ok: false, text: "So'rov topilmadi." };
  if (s.requester.org.ownerTelegramId !== actorTgId) return { ok: false, text: "Faqat korxona egasi hal qiladi." };
  if (s.status !== "pending_owner") return { ok: true, text: `Bu so'rov allaqachon "${s.status}" holatida.` };
  if (approve) {
    // Double-booking himoyasi (tekshiruv topgan): agar ikkalasidan biri o'sha kuni
    // ALLAQACHON haqiqiy ishlab-ketgan bo'lsa (o'z oddiy smenasi yoki boshqa sabab),
    // avtomatik ustiga yozib yubormaymiz — bu pul-yo'qotish xavfi. Ega qo'lda hal qiladi.
    const [reqExisting, partExisting] = await Promise.all([
      prisma.workSession.findUnique({ where: { employeeId_date: { employeeId: s.requesterId, date: s.date } } }),
      prisma.workSession.findUnique({ where: { employeeId_date: { employeeId: s.partnerId, date: s.date } } }),
    ]);
    const conflict = [
      reqExisting?.dayStatus === "ishladi" && reqExisting.checkIn && reqExisting.checkOut ? s.requester.name : null,
      partExisting?.dayStatus === "ishladi" && partExisting.checkIn && partExisting.checkOut ? s.partner.name : null,
    ].filter((n): n is string => !!n);
    if (conflict.length) {
      return { ok: false, text: `⚠️ ${conflict.join(" va ")} ${s.date} kuni allaqachon ishlab-ketgan — avtomatik almashtirib bo'lmaydi. Panelda qo'lda hal qiling.` };
    }
  }
  const claim = await prisma.shiftSwapRequest.updateMany({
    where: { id: swapId, status: "pending_owner" },
    data: { status: approve ? "approved" : "rejected", decidedBy: actorTgId, decidedAt: new Date() },
  });
  if (claim.count === 0) return { ok: true, text: "Bu so'rov allaqachon hal qilingan." };
  if (approve) {
    // Talabgorning O'SHA KUNGA XOS smenasi (agar oldindan maxsus smena qo'yilgan bo'lsa —
    // masalan to'y kechasi 16:00-00:30) — tekshiruv topgan: bu uzatilmasa hamkasb
    // noto'g'ri (standart) smena bilan yoziladi.
    const reqDaySession = await prisma.workSession.findUnique({ where: { employeeId_date: { employeeId: s.requesterId, date: s.date } } });
    const reqPol = resolveStaffPolicy({ ...s.requester.org, calendar: s.requester.org.calendar ?? undefined }, s.requester, reqDaySession ?? undefined);
    const reqSession = await prisma.workSession.upsert({
      where: { employeeId_date: { employeeId: s.requesterId, date: s.date } },
      create: { employeeId: s.requesterId, date: s.date, dayStatus: "javobli" },
      update: { dayStatus: "javobli", checkIn: null, checkOut: null },
    });
    await recomputeSession(reqSession.id);
    const partnerSession = await prisma.workSession.upsert({
      where: { employeeId_date: { employeeId: s.partnerId, date: s.date } },
      create: { employeeId: s.partnerId, date: s.date, dayStatus: "ishladi", shiftStartOvr: reqPol.shiftStart, shiftEndOvr: reqPol.shiftEnd },
      update: { dayStatus: "ishladi", shiftStartOvr: reqPol.shiftStart, shiftEndOvr: reqPol.shiftEnd },
    });
    await recomputeSession(partnerSession.id);
  }
  const text = approve ? `✅ Almashish tasdiqlandi: <b>${s.date}</b>` : `❌ Almashish rad etildi: <b>${s.date}</b>`;
  await notifyOwner(s.requester.telegramId, text);
  await notifyOwner(s.partner.telegramId, text);
  return { ok: true, text: approve ? `✅ Tasdiqlandi: ${esc(s.requester.name)} ↔ ${esc(s.partner.name)}, ${s.date}` : `❌ Rad etildi.` };
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

/** Bugun (Toshkent) shu korxonada JAMI qancha pul olingan — har payout xabariga
 *  qo'shiladi (ega talabi 2026-08-05: "olingan pullarni doim ko'rib borishim kerak"
 *  — har alohida xabarda ham kunlik yig'indi ko'rinsin, panelga kirmasdan). */
async function orgTodayPayoutTotal(orgId: number, date: string): Promise<number> {
  const from = tkInstant(date, 0);
  const to = tkInstant(date, 1440);
  const rows = await prisma.staffLedger.aggregate({
    where: { kind: "payout", createdAt: { gte: from, lt: to }, employee: { orgId } },
    _sum: { amount: true },
  });
  return rows._sum.amount ?? 0;
}

function tkInstant(date: string, minutes: number): Date {
  const [y, m, d] = ymd(date);
  return new Date(Date.UTC(y, m - 1, d) - TASHKENT_UTC_OFFSET_MIN * 60_000 + minutes * 60_000);
}

function selfPayoutOwnerCard(emp: { name: string; orgId: number; org: { ownerTelegramId: string } }, a: number, note: string, bal: number, ledgerId: number, todayTotal: number) {
  return {
    chatId: emp.org.ownerTelegramId,
    ledgerId,
    text:
      `💸 <b>${esc(emp.name)}</b> "pul oldim" deb yozdi: <b>${fmt(a)} so'm</b>` +
      `${note ? ` (${esc(note.slice(0, 80))})` : ""}\n💰 Qoldig'i: <b>${fmt(bal)} so'm</b>${bal < 0 ? " ⚠️minus" : ""}` +
      `\n📊 Bugun jami olingan (hammasi): <b>${fmt(todayTotal)} so'm</b>`,
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
  const t0 = tashkentDayMinutes(new Date());
  if (existing) {
    if (existing.kind !== "payout") return { ok: true, text: "Bu yozuv bekor qilingan edi." }; // soft-bekor tombstone
    // Qayta-yetkazish: ega kartasi ham QAYTA yuborilsin — birinchi urinishda yetmagan bo'lishi mumkin.
    const bal0 = await ledgerBalance(emp.id, emp.openingBalance);
    const today0 = await orgTodayPayoutTotal(emp.orgId, t0.date);
    return { ok: true, text: "Bu xabar allaqachon yozilgan.", owner: selfPayoutOwnerCard(emp, existing.amount, existing.note ?? "", bal0, existing.id, today0) };
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
  const today = await orgTodayPayoutTotal(emp.orgId, t0.date);
  const minusNote = bal < 0 ? `\n⚠️ Qoldiq minusda — oldindan olingan pul keyingi hisoblardan yopiladi.` : "";
  return {
    ok: true,
    text: `💸 Yozildi: <b>−${fmt(a)} so'm</b>${note ? ` (${esc(note.slice(0, 80))})` : ""}\n💰 Qoldiq: <b>${fmt(bal)} so'm</b>${minusNote}`,
    owner: selfPayoutOwnerCard(emp, a, note, bal, row.id, today),
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
const TOMORROW_REMIND_MIN = 20 * 60; // 20:00 dan — ertangi smena eslatmasi (kechki kartadan OLDIN)
const TOMORROW_REMIND_WINDOW = 20; // 15-daq tick granulyarligi uchun oyna
const REMIND_IN_WINDOW = 90; // smena boshidan shuncha daqiqagacha "Keldim" eslatmasi aktual
const REMIND_OUT_WINDOW = 45; // smena oxiridan keyin "Ketdim" eslatmasi oynasi (OT-off rejim)

/**
 * ⏰ Eslatmalar (ega talabi 2026-08-01): "ish payti bo'ldi — Keldim bosing",
 * "ketish payti — Ketdim bosing", smenadan keyin ishlayotganga "qo'shimcha hisob
 * boshlandi, soatiga ~X" + har soatda jamlangan summa. Har eslatma AppState marker
 * bilan BIR MARTA (stfremin/stfremout/stfotping — 2 kunlik TTL). 15-daq tick
 * granulyarligi: eslatma smena chegarasidan ±15 daq ichida yetadi.
 */
export async function staffRemindersTick(bot: import("grammy").Bot, now = new Date()): Promise<void> {
  if (!(await featureOn("jamoa"))) return;
  const t = tashkentDayMinutes(now);
  const { InlineKeyboard } = await import("grammy");
  const kbInOut = () => new InlineKeyboard().text("✅ Keldim", "ish:in").text("🏁 Ketdim", "ish:out");
  const once = async (marker: string, chatId: string, text: string, kb?: InstanceType<typeof InlineKeyboard>) => {
    if (await prisma.appState.findUnique({ where: { key: marker } })) return;
    try {
      await bot.api.sendMessage(chatId, text, { parse_mode: "HTML", reply_markup: kb });
    } catch {
      return; // yuborilmadi (blok/tarmoq) — marker qo'yilmaydi, keyingi tick oynada bo'lsa qayta uradi
    }
    await prisma.appState.upsert({ where: { key: marker }, create: { key: marker, value: "1" }, update: { value: "1" } });
  };

  // 1) "✅ Keldim" eslatmasi — bugun ish kuni, hali kelmagan, smena boshlangan.
  const orgs = await prisma.organization.findMany({ where: { active: true }, include: { employees: { where: { active: true } } } });
  const [ty, tm, td] = ymd(t.date);
  for (const org of orgs) {
    for (const e of org.employees) {
      const session = await prisma.workSession.findUnique({ where: { employeeId_date: { employeeId: e.id, date: t.date } } });
      if (session?.checkIn || (session && session.dayStatus !== "ishladi")) continue; // kelgan yoki tatil/kasallik/... belgilangan
      const pol = resolveStaffPolicy({ ...org, calendar: org.calendar ?? undefined }, e, session ?? undefined);
      if (dayKindFor(ty, tm, td, pol.workDays, pol.calendar) !== "ish") continue; // dam/bayram — tinch
      const start = hhmmToMin(pol.shiftStart);
      if (t.minutes < start || t.minutes > start + REMIND_IN_WINDOW) continue;
      await once(
        `stfremin:${e.id}:${t.date}`,
        e.telegramId,
        `🕘 Ish payti boshlandi (${pol.shiftStart}). Kelganingizda "✅ Keldim" bosing — hisob kelgan vaqtingizdan yuritiladi.`,
        kbInOut()
      );
    }
  }

  // 2) "🏁 Ketdim" / qo'shimcha-ish eslatmalari — OCHIQ sessiyalar bo'yicha
  //    (sessiya sanasi bilan ishlaymiz — yarim tunga o'tgan smenalar ham to'g'ri).
  const open = await prisma.workSession.findMany({
    where: { checkIn: { not: null }, checkOut: null },
    include: { employee: { include: { org: true } } },
  });
  for (const s of open) {
    if (!s.employee.active || !s.employee.org.active) continue;
    const pol = resolveStaffPolicy({ ...s.employee.org, calendar: s.employee.org.calendar ?? undefined }, s.employee, s);
    const start = hhmmToMin(pol.shiftStart);
    let end = hhmmToMin(pol.shiftEnd);
    if (end <= start) end += 1440;
    const nowMin = minutesSinceTashkentMidnight(now, s.date);
    if (nowMin < end) continue; // smena hali tugamagan

    if (pol.overtimeMode === "off") {
      // Qo'shimcha hisob YO'Q — faqat "Ketdim bosing" (keyin +30 daqda avto-yopiladi)
      if (nowMin <= end + REMIND_OUT_WINDOW) {
        await once(
          `stfremout:${s.id}`,
          s.employee.telegramId,
          `🏁 Ish vaqti tugadi (${pol.shiftEnd}). Ketayotganingizda "🏁 Ketdim" bosing — kun hisobi yozilsin.`,
          kbInOut()
        );
      }
      continue;
    }

    // Overtime yoqilgan (qolda/avto): soat boshiga bitta xabar — 0-soat "boshlandi",
    // keyingilari jamlangan summa bilan ("bir soatligini chiqarib qo'shib boradi").
    const [sy, sm] = ymd(s.date);
    const hourly = Math.round(hourlyRateFor(pol, sy, sm) * pol.overtimeMult);
    const hourIdx = Math.floor((nowMin - end) / 60); // 0 = endi boshlandi, 1 = 1 soat o'tdi…
    if (hourIdx > 12) continue; // 12 soatdan keyin jim (unutilgan sessiya — avto-yopish bor)
    const accrued = Math.round(((nowMin - end) / 60) * hourly);
    const text =
      hourIdx === 0
        ? `🕕 Asosiy ish vaqti tugadi (${pol.shiftEnd}). Hali ishdamisiz? ⏱ <b>Qo'shimcha hisob boshlandi</b> — soatiga ~<b>${fmt(hourly)} so'm</b>` +
          (pol.overtimeMode === "qolda" ? ` (ega tasdig'i bilan to'lanadi)` : "") +
          `.\nIshni tugatganda "🏁 Ketdim" bosing.`
        : `⏱ Qo'shimcha ish davom etmoqda: <b>${hourIdx} soat</b> ≈ <b>+${fmt(accrued)} so'm</b>` +
          (pol.overtimeMode === "qolda" ? ` (ega tasdig'i bilan)` : "") +
          `.\nTugatganda "🏁 Ketdim" bosing.`;
    await once(`stfotping:${s.id}:${hourIdx}`, s.employee.telegramId, text, kbInOut());
  }
}

/** One org's day in one message: kim keldi-ketdi, qancha hisoblandi, kim kelmadi. */
export interface CoverSuggestion {
  absentId: number;
  absentName: string;
  coverId: number;
  coverName: string;
  lost: number; // shu kuni kesilgan pul (o'tkazma shu miqdorgacha)
}

type SummaryEmp = StaffEmployeeRow & { id: number; name: string };
type SummaryOrg = StaffOrgPolicyRow & { id: number; name: string; holidayPaid: boolean };

async function buildDailySummary(
  org: SummaryOrg,
  employees: SummaryEmp[],
  date: string
): Promise<{ text: string; unconfirmed: number; suggestions: CoverSuggestion[] }> {
  const sessions = await prisma.workSession.findMany({ where: { date, employeeId: { in: employees.map((e) => e.id) } } });
  const byEmp = new Map(sessions.map((s) => [s.employeeId, s]));
  const lines: string[] = [];
  let total = 0;
  let unconfirmed = 0;
  // 🔁 aqlli taklif uchun material: kim qancha yo'qotdi, kim smenadan ortiq ishladi
  const [yy, mm, dd] = ymd(date);
  const losers: { id: number; name: string; lost: number }[] = [];
  const cands: { id: number; name: string; extraMin: number }[] = [];
  const coveredKeys = new Set(
    (
      await prisma.staffLedger.findMany({
        where: { idempotencyKey: { in: employees.map((e) => `staffcover:${e.id}:${date}`) }, kind: "bonus" },
        select: { idempotencyKey: true },
      })
    ).map((r) => r.idempotencyKey)
  );
  for (const e of employees) {
    const s = byEmp.get(e.id);
    // 🔁 taklif-material (barcha tarmoqlardan OLDIN — kelmagan ham, ishlagan ham hisobga olinsin):
    {
      const pol = resolveStaffPolicy(org, e, s ?? undefined);
      const kind = dayKindFor(yy, mm, dd, pol.workDays, pol.calendar);
      const paidDay = kind === "ish" || (kind === "bayram" && pol.holidayPaid);
      const lost = paidDay ? Math.max(0, dailyRateFor(pol, yy, mm) - (s?.amountEarned ?? 0)) : 0;
      if (lost > 0 && !coveredKeys.has(`staffcover:${e.id}:${date}`)) losers.push({ id: e.id, name: e.name, lost });
      if (s?.dayStatus === "ishladi" && s.checkIn && s.checkOut && !s.autoClosed) {
        const start = hhmmToMin(pol.shiftStart);
        let end = hhmmToMin(pol.shiftEnd);
        if (end <= start) end += 1440;
        // smenadan ≥30 daq ortiq qolgan YOKI o'z dam kunida kelib ishlagan — nomzod
        const extra = paidDay ? minutesSinceTashkentMidnight(s.checkOut, date) - end : s.minutesWorked;
        if (extra >= 30) cands.push({ id: e.id, name: e.name, extraMin: extra });
      }
    }
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
  // 🔁 Aqlli taklif: yo'qotgan(lar)ni eng ko'p ortiq ishlagan bilan juftlash (maks 3).
  const suggestions: CoverSuggestion[] = [];
  if (cands.length) {
    cands.sort((a, b) => b.extraMin - a.extraMin);
    for (const l of losers.slice(0, 3)) {
      const c = cands.find((c0) => c0.id !== l.id);
      if (c) suggestions.push({ absentId: l.id, absentName: l.name, coverId: c.id, coverName: c.name, lost: l.lost });
    }
  }
  const text =
    `📋 <b>${esc(org.name)} — ${date}</b>\n\n` +
    lines.join("\n") +
    `\n\nJami hisoblandi: <b>${fmt(total)} so'm</b>` +
    (unconfirmed ? `\n✅ Tasdiqlash — ${unconfirmed} ta kun yozuvi` : "\nHammasi tasdiqlangan ✓") +
    (suggestions.length
      ? `\n\n🔁 <b>Taklif:</b> ` +
        suggestions.map((sg) => `${esc(sg.absentName)} yo'qotdi (−${fmt(sg.lost)}), ${esc(sg.coverName)} ortiq ishladi`).join("; ") +
        ` — bir bosishda o'tkazing 👇`
      : "") +
    `\n<i>To'g'irlash: Admin panel → 👔 Jamoa</i>`;
  return { text, unconfirmed, suggestions };
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
): Promise<{ ok: boolean; text: string; orgId?: number; date?: string; unconfirmed?: number; suggestions?: CoverSuggestion[]; olderPending?: number }> {
  if (!(await featureOn("jamoa"))) return { ok: false, text: "Jamoa moduli o'chirilgan." };
  const org = await prisma.organization.findFirst({
    where: { ownerTelegramId: telegramId, active: true },
    include: { employees: { where: { active: true }, orderBy: { name: "asc" } } },
  });
  if (!org) return { ok: false, text: "" }; // ega emas — jim
  if (!org.employees.length) return { ok: true, text: `👔 <b>${esc(org.name)}</b>\n\nHali xodim qo'shilmagan. Admin panel → 👔 Jamoa → «➕ Xodim qo'shish».` };
  const t = tashkentDayMinutes(now);
  const { text, unconfirmed, suggestions } = await buildDailySummary(org, org.employees, t.date);
  const older = await pendingOlderSessions(org.id, t.date);
  const fullText = older.count ? `${text}\n\n⏳ <b>Eski tasdiqsiz kunlar:</b> ${older.count} ta · jami ${fmt(older.total)} so'm` : text;
  return { ok: true, text: fullText, orgId: org.id, date: t.date, unconfirmed, suggestions, olderPending: older.count };
}

/** "✅ Barchasini tasdiqlash" — bugungidan TASHQARI qolgan barcha yopiq-tasdiqsiz
 *  kunlarni bir bosishda tasdiqlaydi (ochiq smenalarga tegmaydi). */
export async function staffConfirmAllPending(orgId: number, actorTgId: string): Promise<{ ok: boolean; text: string }> {
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) return { ok: false, text: "Korxona topilmadi" };
  if (org.ownerTelegramId !== actorTgId) return { ok: false, text: "Faqat korxona egasi tasdiqlaydi" };
  const r = await prisma.workSession.updateMany({
    where: {
      confirmedAt: null,
      employee: { orgId },
      NOT: { dayStatus: "ishladi", checkIn: { not: null }, checkOut: null },
    },
    data: { confirmedAt: new Date() },
  });
  return { ok: true, text: r.count ? `✅ ${r.count} ta eski kun tasdiqlandi` : "✅ Tasdiqlash uchun eski kun qolmagan" };
}

/**
 * ⏳ ESKI TASDIQSIZ KUNLAR (bug topildi 2026-08-02): kechki karta va /jamoa faqat
 * BUGUNGI sanani ko'rsatadi — agar bir kun yopilgan-lekin-tasdiqlanmagan bo'lib
 * qolsa (masalan yarim tundan keyin Ketdim bosilib, o'sha kunning kechki kartasi
 * allaqachon ketgan bo'lsa), u tugma orqali HECH QACHON qayta chiqmasdi — faqat
 * panelda ko'rinardi. Endi har chaqiruvda BUGUNGIDAN TASHQARI ham tekshiriladi.
 */
async function pendingOlderSessions(orgId: number, excludeDate: string): Promise<{ count: number; total: number }> {
  const rows = await prisma.workSession.findMany({
    where: {
      confirmedAt: null,
      date: { not: excludeDate },
      employee: { orgId },
      NOT: { dayStatus: "ishladi", checkIn: { not: null }, checkOut: null }, // ochiq smena — hali tasdiqqa loyiq emas
    },
    select: { amountEarned: true },
  });
  return { count: rows.length, total: rows.reduce((a, r) => a + r.amountEarned, 0) };
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

/**
 * A2 (ega talabi 2026-08-05): 20:00 Toshkentdan keyin, har faol xodimga — agar
 * ERTAGA taqvim bo'yicha ish kuni bo'lsa va ertangi sessiya hali yo'q bo'lsa —
 * bitta eslatma: "Ertaga smenangiz bor". Marker `stftmrw:<empId>:<ertangiSana>`
 * bir marta — 15-daq tick ichida har chaqiruvda qayta yubormaydi.
 */
async function staffTomorrowRemindersTick(bot: import("grammy").Bot, now: Date): Promise<void> {
  const t = tashkentDayMinutes(now);
  if (t.minutes < TOMORROW_REMIND_MIN || t.minutes > TOMORROW_REMIND_MIN + TOMORROW_REMIND_WINDOW) return;
  const tmrw = tashkentDayMinutes(new Date(now.getTime() + 86_400_000)).date;
  const [ty, tm, td] = ymd(tmrw);
  const orgs = await prisma.organization.findMany({ where: { active: true }, include: { employees: { where: { active: true } } } });
  for (const org of orgs) {
    for (const e of org.employees) {
      const marker = `stftmrw:${e.id}:${tmrw}`;
      if (await prisma.appState.findUnique({ where: { key: marker } })) continue;
      // Ertangi kun uchun sessiya OLDINDAN yaratilgan bo'lishi mumkin (ega kun-tuzatishda
      // maxsus smena/holat qo'ygan bo'lishi mumkin) — tekshiruv topdi: buni e'tiborsiz
      // qoldirish noto'g'ri smena vaqtini ko'rsatardi. Bor bo'lsa policyga uzatiladi VA
      // "ishladi"dan boshqa holat oldindan qo'yilgan bo'lsa (ta'til/javobli/...) — jim.
      const tmrwSession = await prisma.workSession.findUnique({ where: { employeeId_date: { employeeId: e.id, date: tmrw } } });
      if (tmrwSession && tmrwSession.dayStatus !== "ishladi") continue;
      const pol = resolveStaffPolicy({ ...org, calendar: org.calendar ?? undefined }, e, tmrwSession ?? undefined);
      const kind = dayKindFor(ty, tm, td, pol.workDays, pol.calendar);
      if (kind !== "ish" && !(kind === "bayram" && pol.holidayPaid)) continue; // dam kuni — jim
      try {
        await bot.api.sendMessage(e.telegramId, `🌙 Ertaga smenangiz bor: <b>${pol.shiftStart}–${pol.shiftEnd}</b>. Ko'rishguncha!`, { parse_mode: "HTML" });
      } catch {
        continue; // marker YO'Q — keyingi kunning oynasida qayta urinilmaydi (bir martalik eslatma), lekin ertaga uchun emas — zarar yo'q
      }
      await prisma.appState.upsert({ where: { key: marker }, create: { key: marker, value: "1" }, update: { value: "1" } });
    }
  }
}

/** 15-min tick entry (index.ts): auto-close forgotten sessions, then after 21:00
 *  Tashkent send each org-owner ONE summary card (AppState marker = once per day,
 *  set only after a successful send — failed evening send retries next tick). */
export async function staffDailyTick(bot: import("grammy").Bot, now = new Date()): Promise<void> {
  if (!(await featureOn("jamoa"))) return;
  // Eslatmalar bu yerda EMAS — ular index.ts'dagi 60-soniyalik yengil soatda
  // ("vaxtiga eslatsin", ega 2026-08-01): daqiqa aniqligi. Markerlar bir xil,
  // shuning uchun ikkala yo'l to'qnashsa ham dublikat bo'lmaydi.
  await staffAutoCloseOverdue(now).catch((e) => console.error("[staff] autoclose failed:", e));
  await staffTomorrowRemindersTick(bot, now).catch((e) => console.error("[staff] tomorrow-remind failed:", e));
  const t = tashkentDayMinutes(now);
  if (t.minutes < SUMMARY_AFTER_MIN) return;
  const orgs = await prisma.organization.findMany({ where: { active: true }, include: { employees: { where: { active: true }, orderBy: { name: "asc" } } } });
  for (const org of orgs) {
    if (!org.employees.length) continue;
    const marker = `staffsummary:${org.id}:${t.date}`;
    if (await prisma.appState.findUnique({ where: { key: marker } })) continue;
    const { text, unconfirmed, suggestions } = await buildDailySummary(org, org.employees, t.date);
    const older = await pendingOlderSessions(org.id, t.date);
    const fullText = older.count ? `${text}\n\n⏳ <b>Eski tasdiqsiz kunlar:</b> ${older.count} ta · jami ${fmt(older.total)} so'm` : text;
    const { InlineKeyboard } = await import("grammy");
    const kb = new InlineKeyboard();
    if (unconfirmed) kb.text("✅ Tasdiqlash", `ishc:${org.id}:${t.date}`);
    for (const sg of suggestions) kb.row().text(`🔁 ${sg.absentName} puli → ${sg.coverName} (${fmt(sg.lost)})`.slice(0, 60), `ishcv:${sg.absentId}:${sg.coverId}:${t.date}`);
    if (older.count) kb.row().text(`✅ Barchasini tasdiqlash (${older.count} eski kun)`, `ishcall:${org.id}`);
    try {
      await bot.api.sendMessage(org.ownerTelegramId, fullText, { parse_mode: "HTML", reply_markup: unconfirmed || suggestions.length || older.count ? kb : undefined });
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
    // OT-off: +30 daq muloyimlik. OT yoqilgan: +4 soat kutamiz — xodim ataylab
    // qo'shimcha ishlayotgan bo'lishi mumkin (soatlik ping'lar ketmoqda). Unutgan
    // bo'lsa ham checkOut = SMENA OXIRI (isbotlanmagan OT to'lanmaydi, ega ✏️ tuzatadi).
    const closeGrace = pol.overtimeMode === "off" ? 30 : 240;
    if (nowMin <= end + closeGrace) continue;
    const [y, m, d] = ymd(s.date);
    const checkOutAt = new Date(Date.UTC(y, m - 1, d) - TASHKENT_UTC_OFFSET_MIN * 60_000 + end * 60_000);
    await prisma.workSession.update({ where: { id: s.id }, data: { checkOut: checkOutAt, autoClosed: true } });
    const pay = await recomputeSession(s.id);
    // A3 (ega talabi 2026-08-05): ega kechqurunni kutmasdan DARHOL bilsin — ⚠️avto
    // belgisi ilgari faqat kechki kartada/panelda ko'rinardi.
    if (s.employee.org.ownerTelegramId !== s.employee.telegramId) {
      await notifyOwner(
        s.employee.org.ownerTelegramId,
        `⚠️ <b>${esc(s.employee.name)}</b> "Ketdim" bosishni unutdi — smena oxiriga (${pol.shiftEnd}) avto-yopildi.\n💵 Hisob: <b>${fmt(pay?.amountEarned ?? 0)} so'm</b>\nBoshqacha bo'lsa: Admin panel → 👔 Jamoa → kunni tuzating.`
      );
    }
    closed++;
  }
  return closed;
}