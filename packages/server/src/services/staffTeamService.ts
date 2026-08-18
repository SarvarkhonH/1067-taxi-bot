// 👔 JAMOA J7–J10 — jamoa MADANIYATI qatlami: 📢 xabarlar · 📖 qoidalar ·
// 🏆 mukofotlar · 📈 jamoaviy maqsad-bonusi. Davomat/oylik yadrosi (staffService,
// staffAdminService) tegilmaydi — bu fayl faqat uning ustiga quriladi.
//
// Pul qoidalari (o'zgarmas): har so'm StaffLedger orqali, idempotent kalit bilan,
// tanga tizimiga (CoinTxn) UMUMAN aloqasi yo'q, va maqsad-mukofoti HECH QACHON
// avtomatik berilmaydi — tizim "bajarildi" deydi, EGA tugma bosadi.
import {
  type StaffBadge,
  type StaffBadgeInput,
  type StaffRewardDef,
  computeStaffBadges,
  goalProgress,
  hhmmToMin,
  minutesSinceTashkentMidnight,
  nextGoalTarget,
  parseRewardCatalog,
  punctualStreak,
  resolveStaffPolicy,
  rewardKeyOf,
  tashkentDayMinutes,
} from "@t1067/shared";
import { prisma } from "../db";
import { staffAdminKpi } from "./staffAdminService";
import { employeeFor } from "./staffService";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function fmt(n: number): string {
  return n.toLocaleString("ru-RU").replace(/,/g, " ");
}
const MAX_TEXT = 2000;

// ─────────────────────────────────────────────────────────────────────────────
// 📢 J7 — XABARLAR (ega → xodim(lar), o'qildi belgisi bilan)
// ─────────────────────────────────────────────────────────────────────────────

export interface StaffNoticeRow {
  id: number;
  text: string;
  employeeId: number | null; // null = butun jamoaga
  toName: string; // "Butun jamoa" | xodim ismi
  createdAt: string;
  createdBy: string;
  readCount: number;
  targetCount: number;
  readers: string[];
  unread: string[];
}

/** Yozilgan xabar + botga yuboriladigan matnlar. Yuborishni ROUTE qiladi (bot u yerda). */
export async function staffNoticeSend(input: {
  orgId: number;
  employeeId?: number | null;
  text: string;
  actor: string;
}): Promise<{ ok: boolean; error?: string; noticeId?: number; deliveries?: { telegramId: string; text: string }[] }> {
  const text = String(input.text ?? "").trim();
  if (!text) return { ok: false, error: "Xabar bo'sh" };
  if (text.length > MAX_TEXT) return { ok: false, error: `Xabar juda uzun (${text.length}/${MAX_TEXT})` };
  const org = await prisma.organization.findUnique({ where: { id: input.orgId } });
  if (!org) return { ok: false, error: "Korxona topilmadi" };

  // Arxivdagi xodim xabar olmaydi — u endi jamoada emas.
  const targets = await prisma.employee.findMany({
    where: {
      orgId: org.id,
      active: true,
      archivedAt: null,
      ...(input.employeeId ? { id: input.employeeId } : {}),
    },
  });
  if (targets.length === 0) return { ok: false, error: "Qabul qiluvchi xodim yo'q" };

  const notice = await prisma.staffNotice.create({
    data: {
      orgId: org.id,
      employeeId: input.employeeId ?? null,
      kind: "xabar",
      text,
      createdBy: input.actor,
    },
  });
  const body = `📢 <b>Xabar</b>\n\n${esc(text)}\n\n<i>${esc(org.name)}</i>`;
  return {
    ok: true,
    noticeId: notice.id,
    deliveries: targets.map((t) => ({ telegramId: t.telegramId, text: body })),
  };
}

/** Panel ro'yxati: har xabar + kim o'qigani (oxirgi 50 ta). */
export async function staffNoticeList(orgId: number): Promise<StaffNoticeRow[]> {
  const [notices, employees] = await Promise.all([
    prisma.staffNotice.findMany({
      where: { orgId, kind: "xabar" },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { reads: true, employee: { select: { name: true } } },
    }),
    prisma.employee.findMany({ where: { orgId, active: true, archivedAt: null }, select: { id: true, name: true } }),
  ]);
  const nameOf = new Map(employees.map((e) => [e.id, e.name]));
  return notices.map((n) => {
    // Nishon = xabar yuborilgan payt jamoada bo'lganlar (hozirgi faol ro'yxat bo'yicha).
    const targets = n.employeeId ? employees.filter((e) => e.id === n.employeeId) : employees;
    const readIds = new Set(n.reads.map((r) => r.employeeId));
    return {
      id: n.id,
      text: n.text,
      employeeId: n.employeeId,
      toName: n.employeeId ? (n.employee?.name ?? nameOf.get(n.employeeId) ?? "xodim") : "Butun jamoa",
      createdAt: n.createdAt.toISOString(),
      createdBy: n.createdBy,
      readCount: targets.filter((t) => readIds.has(t.id)).length,
      targetCount: targets.length,
      readers: targets.filter((t) => readIds.has(t.id)).map((t) => t.name),
      unread: targets.filter((t) => !readIds.has(t.id)).map((t) => t.name),
    };
  });
}

export async function staffNoticeDelete(id: number): Promise<{ ok: boolean; error?: string }> {
  const n = await prisma.staffNotice.findUnique({ where: { id } });
  if (!n || n.kind !== "xabar") return { ok: false, error: "Xabar topilmadi" };
  await prisma.staffNotice.delete({ where: { id } }); // reads cascade
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// 📖 J8 — QOIDALAR (tirik hujjat + "tanishdim" versiyasi)
// ─────────────────────────────────────────────────────────────────────────────

export interface StaffRulesView {
  version: number;
  rules: { id: number; text: string; sortOrder: number }[];
  ack: { employeeId: number; name: string; acked: boolean; ackVersion: number }[];
}

export async function staffRulesList(orgId: number): Promise<StaffRulesView | null> {
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) return null;
  const [rules, employees] = await Promise.all([
    prisma.staffNotice.findMany({ where: { orgId, kind: "qoida", active: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
    prisma.employee.findMany({ where: { orgId, active: true, archivedAt: null }, orderBy: { name: "asc" } }),
  ]);
  return {
    version: org.rulesVersion,
    rules: rules.map((r) => ({ id: r.id, text: r.text, sortOrder: r.sortOrder })),
    ack: employees.map((e) => ({
      employeeId: e.id,
      name: e.name,
      // Qoida yo'q bo'lsa tanishish talab qilinmaydi (versiya 0) — "0/5 tanishdi" yolg'on ko'rinmasin.
      acked: org.rulesVersion === 0 || e.rulesAckVersion >= org.rulesVersion,
      ackVersion: e.rulesAckVersion,
    })),
  };
}

/** Qoida qo'shish/tahrirlash. HAR o'zgarish versiyani oshiradi → hamma qaytadan tanishadi. */
export async function staffRuleSave(input: { orgId: number; id?: number; text: string; actor: string }): Promise<{ ok: boolean; error?: string; id?: number }> {
  const text = String(input.text ?? "").trim();
  if (!text) return { ok: false, error: "Qoida bo'sh" };
  if (text.length > 500) return { ok: false, error: "Qoida juda uzun (500 belgigacha)" };
  const org = await prisma.organization.findUnique({ where: { id: input.orgId } });
  if (!org) return { ok: false, error: "Korxona topilmadi" };
  let id = input.id;
  if (id) {
    const cur = await prisma.staffNotice.findUnique({ where: { id } });
    if (!cur || cur.kind !== "qoida" || cur.orgId !== org.id) return { ok: false, error: "Qoida topilmadi" };
    if (cur.text === text) return { ok: true, id }; // o'zgarish yo'q → versiya oshmaydi (bekorga qayta tanishtirmaymiz)
    await prisma.staffNotice.update({ where: { id }, data: { text } });
  } else {
    const last = await prisma.staffNotice.findFirst({ where: { orgId: org.id, kind: "qoida" }, orderBy: { sortOrder: "desc" } });
    const created = await prisma.staffNotice.create({
      data: { orgId: org.id, kind: "qoida", text, sortOrder: (last?.sortOrder ?? 0) + 1, createdBy: input.actor },
    });
    id = created.id;
  }
  await prisma.organization.update({ where: { id: org.id }, data: { rulesVersion: { increment: 1 } } });
  return { ok: true, id };
}

export async function staffRuleRemove(id: number): Promise<{ ok: boolean; error?: string }> {
  const r = await prisma.staffNotice.findUnique({ where: { id } });
  if (!r || r.kind !== "qoida") return { ok: false, error: "Qoida topilmadi" };
  await prisma.staffNotice.update({ where: { id }, data: { active: false } }); // tarix uchun qoladi
  await prisma.organization.update({ where: { id: r.orgId }, data: { rulesVersion: { increment: 1 } } });
  return { ok: true };
}

/** Tartibni almashtirish (yuqoriga/pastga). Matn o'zgarmagani uchun versiya oshmaydi. */
export async function staffRuleMove(id: number, dir: "up" | "down"): Promise<{ ok: boolean; error?: string }> {
  const cur = await prisma.staffNotice.findUnique({ where: { id } });
  if (!cur || cur.kind !== "qoida" || !cur.active) return { ok: false, error: "Qoida topilmadi" };
  const neighbour = await prisma.staffNotice.findFirst({
    where: {
      orgId: cur.orgId,
      kind: "qoida",
      active: true,
      ...(dir === "up" ? { sortOrder: { lt: cur.sortOrder } } : { sortOrder: { gt: cur.sortOrder } }),
    },
    orderBy: { sortOrder: dir === "up" ? "desc" : "asc" },
  });
  if (!neighbour) return { ok: true }; // chekkada — jim
  await prisma.$transaction([
    prisma.staffNotice.update({ where: { id: cur.id }, data: { sortOrder: neighbour.sortOrder } }),
    prisma.staffNotice.update({ where: { id: neighbour.id }, data: { sortOrder: cur.sortOrder } }),
  ]);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// 🏆 J9 — MUKOFOTLAR (pulli katalog + hisoblanadigan nishonlar)
// ─────────────────────────────────────────────────────────────────────────────

export async function staffRewardCatalog(orgId: number): Promise<StaffRewardDef[]> {
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  return parseRewardCatalog(org?.rewards ?? null);
}

export async function staffRewardSave(input: { orgId: number; key?: string; name: string; amount: number; note?: string }): Promise<{ ok: boolean; error?: string }> {
  const name = String(input.name ?? "").trim();
  const amount = Math.round(Number(input.amount));
  if (!name) return { ok: false, error: "Mukofot nomi bo'sh" };
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) return { ok: false, error: "Summa noto'g'ri" };
  const org = await prisma.organization.findUnique({ where: { id: input.orgId } });
  if (!org) return { ok: false, error: "Korxona topilmadi" };
  const cat = parseRewardCatalog(org.rewards);
  if (cat.length >= 20 && !input.key) return { ok: false, error: "Katalog to'ldi (20 ta)" };
  const key = input.key?.trim() || rewardKeyOf(name);
  const row: StaffRewardDef = { key, name: name.slice(0, 60), amount, ...(input.note?.trim() ? { note: input.note.trim().slice(0, 200) } : {}) };
  const idx = cat.findIndex((r) => r.key === key);
  if (idx >= 0) cat[idx] = row;
  else cat.push(row);
  await prisma.organization.update({ where: { id: org.id }, data: { rewards: cat as never } });
  return { ok: true };
}

export async function staffRewardRemove(orgId: number, key: string): Promise<{ ok: boolean; error?: string }> {
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) return { ok: false, error: "Korxona topilmadi" };
  const cat = parseRewardCatalog(org.rewards).filter((r) => r.key !== key);
  await prisma.organization.update({ where: { id: org.id }, data: { rewards: cat as never } });
  return { ok: true };
}

/** Katalogdan bir bosishda mukofot berish → mavjud bonus yo'li (yangi pul kanali YO'Q). */
export async function staffRewardGive(input: {
  employeeId: number;
  key: string;
  actor: string;
  idemKey: string;
}): Promise<{ ok: boolean; error?: string; notifyTelegramId?: string; notifyText?: string; amount?: number }> {
  const emp = await prisma.employee.findUnique({ where: { id: input.employeeId }, include: { org: true } });
  if (!emp) return { ok: false, error: "Xodim topilmadi" };
  const def = parseRewardCatalog(emp.org.rewards).find((r) => r.key === input.key);
  if (!def) return { ok: false, error: "Mukofot katalogda yo'q" };
  const { staffAdminPay } = await import("./staffAdminService");
  const r = await staffAdminPay({
    employeeId: emp.id,
    kind: "bonus",
    amount: def.amount,
    note: `🏆 ${def.name}`,
    idemKey: `reward.${def.key}.${input.idemKey}`.slice(0, 80),
    actor: input.actor,
  });
  if (!r.ok) return r;
  return {
    ...r,
    amount: def.amount,
    notifyText: `🏆 <b>Mukofot: ${esc(def.name)}</b>\n<b>${fmt(def.amount)} so'm</b> hisobingizga yozildi.${def.note ? `\n<i>${esc(def.note)}</i>` : ""}`,
  };
}

/** 🏅 Oy nishonlari (hech qayerda saqlanmaydi — KPI'dan qayta hisoblanadi, drift yo'q). */
export async function staffBadges(orgId: number, month: string): Promise<Map<number, StaffBadge[]>> {
  const kpi = await staffAdminKpi(orgId, month);
  if (kpi.length === 0) return new Map();
  const org = await prisma.organization.findUnique({ where: { id: orgId }, include: { employees: { where: { active: true, archivedAt: null } } } });
  if (!org) return new Map();
  const rows: StaffBadgeInput[] = [];
  for (const k of kpi) {
    const emp = org.employees.find((e) => e.id === k.id);
    rows.push({
      id: k.id,
      workedDays: k.workedDays,
      lateDays: k.lateDays,
      absentDays: k.absentDays,
      punctualityPct: k.punctualityPct,
      minutes: k.minutes,
      streak: emp ? await punctualStreakOf(org, emp) : 0,
    });
  }
  return computeStaffBadges(rows);
}

/** Ketma-ket vaqtida kelish (oxirgi 60 kun) — har sessiya o'z smenasi bo'yicha baholanadi. */
async function punctualStreakOf(
  org: NonNullable<Awaited<ReturnType<typeof prisma.organization.findUnique>>>,
  emp: { id: number } & Record<string, unknown>
): Promise<number> {
  // OXIRGI 60 kun: desc+take → keyin qayta asc (asc+take eng ESKI 60 kunni olib,
  // streakni bir yil oldingi kunlardan hisoblab qo'yardi).
  const recent = await prisma.workSession.findMany({
    where: { employeeId: emp.id },
    orderBy: { date: "desc" },
    take: 60,
  });
  const sessions = [...recent].reverse();
  const days = sessions.map((s) => {
    const worked = s.dayStatus === "ishladi" && !!s.checkIn && s.minutesWorked > 0;
    if (!worked || !s.checkIn) return { worked: false, onTime: false };
    const pol = resolveStaffPolicy({ ...org, calendar: org.calendar ?? undefined } as never, emp as never, s);
    const arrival = minutesSinceTashkentMidnight(s.checkIn, s.date);
    return { worked: true, onTime: arrival <= hhmmToMin(pol.shiftStart) + pol.graceMin };
  });
  return punctualStreak(days);
}

// ─────────────────────────────────────────────────────────────────────────────
// 📈 J10 — JAMOAVIY MAQSAD-BONUSI
// O'lchov: OY O'RTACHA kunlik yakunlangan buyurtma (DailyStat.completedRides —
// kas1067'ning JAMI buyurtmasi, ilova ulushi emas). BUGUN sanoqqa KIRMAYDI:
// tugamagan kun o'rtachani ertalabdan pastga tortib, panelni yolg'on ko'rsatardi.
// ─────────────────────────────────────────────────────────────────────────────

export interface StaffGoalView {
  goal: { id: number; month: string; target: number; bonusAmount: number; status: string; achievedAt: string | null } | null;
  progress: ReturnType<typeof goalProgress> | null;
  todayCount: number; // bugungi jonli son (alohida ko'rsatiladi, o'rtachaga qo'shilmaydi)
  nextTarget: number; // keyingi pog'ona taklifi
  history: { id: number; month: string; target: number; bonusAmount: number; status: string; paidAt: string | null }[];
}

function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y ?? 2026, m ?? 1, 0)).getUTCDate();
}

/** Tugagan kunlarning kunlik buyurtma sonlari (bugun kirmaydi). */
async function completedDailyCounts(month: string, now: Date): Promise<number[]> {
  const today = tashkentDayMinutes(now).date;
  const rows = await prisma.dailyStat.findMany({ where: { day: { startsWith: month } }, orderBy: { day: "asc" } });
  return rows.filter((r) => r.day < today).map((r) => r.completedRides);
}

export async function staffGoalState(orgId: number, now = new Date()): Promise<StaffGoalView> {
  const [goal, history] = await Promise.all([
    prisma.staffGoal.findFirst({ where: { orgId, status: { in: ["aktiv", "bajarildi"] } }, orderBy: { id: "desc" } }),
    prisma.staffGoal.findMany({ where: { orgId }, orderBy: { id: "desc" }, take: 12 }),
  ]);
  const today = tashkentDayMinutes(now).date;
  const todayRow = await prisma.dailyStat.findUnique({ where: { day: today } });
  let progress: ReturnType<typeof goalProgress> | null = null;
  if (goal) {
    const counts = await completedDailyCounts(goal.month, now);
    progress = goalProgress(counts, goal.target, daysInMonth(goal.month));
  }
  return {
    goal: goal
      ? {
          id: goal.id,
          month: goal.month,
          target: goal.target,
          bonusAmount: goal.bonusAmount,
          status: goal.status,
          achievedAt: goal.achievedAt?.toISOString() ?? null,
        }
      : null,
    progress,
    todayCount: todayRow?.completedRides ?? 0,
    nextTarget: goal ? nextGoalTarget(goal.target) : 0,
    history: history.map((h) => ({
      id: h.id,
      month: h.month,
      target: h.target,
      bonusAmount: h.bonusAmount,
      status: h.status,
      paidAt: h.paidAt?.toISOString() ?? null,
    })),
  };
}

export async function staffGoalSave(input: {
  orgId: number;
  month?: string;
  target: number;
  bonusAmount: number;
  actor: string;
}): Promise<{ ok: boolean; error?: string; id?: number }> {
  const target = Math.round(Number(input.target));
  const bonusAmount = Math.round(Number(input.bonusAmount));
  if (!Number.isFinite(target) || target <= 0 || target > 100_000) return { ok: false, error: "Maqsad noto'g'ri" };
  if (!Number.isFinite(bonusAmount) || bonusAmount <= 0 || bonusAmount > 1_000_000_000) return { ok: false, error: "Mukofot summasi noto'g'ri" };
  const month = /^\d{4}-\d{2}$/.test(String(input.month ?? "")) ? String(input.month) : tashkentDayMinutes(new Date()).date.slice(0, 7);
  const org = await prisma.organization.findUnique({ where: { id: input.orgId } });
  if (!org) return { ok: false, error: "Korxona topilmadi" };
  // Bir vaqtda bitta aktiv maqsad: yangisi qo'yilsa eskisi (to'lanmagani) bekor bo'ladi.
  const open = await prisma.staffGoal.findFirst({ where: { orgId: org.id, status: { in: ["aktiv", "bajarildi"] } } });
  if (open && open.month === month && open.target === target) {
    await prisma.staffGoal.update({ where: { id: open.id }, data: { bonusAmount } });
    return { ok: true, id: open.id };
  }
  if (open) await prisma.staffGoal.update({ where: { id: open.id }, data: { status: "bekor" } });
  const existing = await prisma.staffGoal.findUnique({ where: { orgId_month_target: { orgId: org.id, month, target } } });
  if (existing) {
    if (existing.status === "berildi") return { ok: false, error: "Bu oy uchun shu maqsad allaqachon berilgan" };
    const g = await prisma.staffGoal.update({ where: { id: existing.id }, data: { bonusAmount, status: "aktiv", achievedAt: null } });
    return { ok: true, id: g.id };
  }
  const g = await prisma.staffGoal.create({
    data: { orgId: org.id, month, target, bonusAmount, createdBy: input.actor },
  });
  return { ok: true, id: g.id };
}

export async function staffGoalCancel(goalId: number): Promise<{ ok: boolean; error?: string }> {
  const g = await prisma.staffGoal.findUnique({ where: { id: goalId } });
  if (!g) return { ok: false, error: "Maqsad topilmadi" };
  if (g.status === "berildi") return { ok: false, error: "Berilgan mukofotni bekor qilib bo'lmaydi" };
  await prisma.staffGoal.update({ where: { id: goalId }, data: { status: "bekor" } });
  return { ok: true };
}

/** 💸 Maqsad mukofotini berish — FAQAT ega bosgan tugmadan. Ishlagan kuniga qarab
 *  bo'linadi, har ulush alohida idempotent StaffLedger bonus qatori. */
export async function staffGoalPay(
  goalId: number,
  actor: string,
  opts?: { mustBeOwnerTg?: string }
): Promise<{ ok: boolean; error?: string; text?: string; deliveries?: { telegramId: string; text: string }[] }> {
  const goal = await prisma.staffGoal.findUnique({ where: { id: goalId }, include: { org: true } });
  if (!goal) return { ok: false, error: "Maqsad topilmadi" };
  // Bot tugmasi ochiq kanal — pul beruvchi AYNAN o'sha korxona egasi bo'lishi shart
  // (panel yo'li allaqachon requireOwner ortida).
  if (opts?.mustBeOwnerTg && goal.org.ownerTelegramId !== opts.mustBeOwnerTg) return { ok: false, error: "Faqat korxona egasi bera oladi" };
  if (goal.status === "berildi") return { ok: false, error: "Bu mukofot allaqachon berilgan" };
  if (goal.status === "bekor") return { ok: false, error: "Maqsad bekor qilingan" };

  const counts = await completedDailyCounts(goal.month, new Date());
  const prog = goalProgress(counts, goal.target, daysInMonth(goal.month));
  if (!prog.achieved) return { ok: false, error: `Maqsad hali bajarilmagan (o'rtacha ${prog.avg}/${goal.target})` };

  const employees = await prisma.employee.findMany({ where: { orgId: goal.orgId, active: true, archivedAt: null } });
  const shares: { employeeId: number; workedDays: number }[] = [];
  for (const e of employees) {
    const worked = await prisma.workSession.count({
      where: { employeeId: e.id, date: { startsWith: goal.month }, dayStatus: "ishladi", minutesWorked: { gt: 0 } },
    });
    shares.push({ employeeId: e.id, workedDays: worked });
  }
  const { splitGoalBonus } = await import("@t1067/shared");
  const parts = splitGoalBonus(goal.bonusAmount, shares);
  if (parts.length === 0) return { ok: false, error: "Bu oyda ishlagan xodim yo'q — bo'linmadi" };

  const { staffAdminPay } = await import("./staffAdminService");
  const deliveries: { telegramId: string; text: string }[] = [];
  const lines: string[] = [];
  for (const p of parts) {
    const emp = employees.find((e) => e.id === p.employeeId);
    if (!emp) continue;
    const r = await staffAdminPay({
      employeeId: emp.id,
      kind: "bonus",
      amount: p.amount,
      note: `📈 Maqsad ${goal.target} ta/kun — jamoa mukofoti (${goal.month})`,
      idemKey: `goalbonus.${goal.id}.emp${emp.id}`,
      actor,
    });
    if (!r.ok) {
      // Bitta ulush yozilmasa — jim yutilmaydi: ega qaysi xodim ochiq qolganini biladi.
      lines.push(`⚠️ ${emp.name}: ${r.error ?? "yozilmadi"}`);
      continue;
    }
    lines.push(`${emp.name} — ${fmt(p.amount)} so'm`);
    deliveries.push({
      telegramId: emp.telegramId,
      text:
        `🎯 <b>JAMOA MAQSADI BAJARILDI!</b>\n` +
        `Kunlik o'rtacha <b>${prog.avg}</b> ta buyurtma (maqsad ${goal.target}).\n\n` +
        `📈 Sizning ulushingiz: <b>${fmt(p.amount)} so'm</b> — hisobingizga yozildi.\n` +
        `<i>Rahmat! Keyingi maqsad: ${nextGoalTarget(goal.target)} ta/kun.</i>`,
    });
  }
  await prisma.staffGoal.update({ where: { id: goal.id }, data: { status: "berildi", paidAt: new Date(), paidBy: actor } });
  return {
    ok: true,
    text: `✅ Maqsad mukofoti berildi (${fmt(goal.bonusAmount)} so'm):\n${lines.join("\n")}\n\n👉 Keyingi maqsad: <b>${nextGoalTarget(goal.target)} ta/kun</b> — panelda belgilang.`,
    deliveries,
  };
}

/** Kunlik tick uchun: o'rtacha maqsadga yetgan bo'lsa BIR MARTA belgilaydi va
 *  egaga "mukofot berilsinmi?" kartasini qaytaradi (pul avtomatik berilmaydi). */
export async function staffGoalCheck(now = new Date()): Promise<{ ownerTelegramId: string; text: string; goalId: number }[]> {
  const goals = await prisma.staffGoal.findMany({ where: { status: "aktiv" }, include: { org: true } });
  const out: { ownerTelegramId: string; text: string; goalId: number }[] = [];
  for (const g of goals) {
    if (!g.org.active) continue;
    const counts = await completedDailyCounts(g.month, now);
    const prog = goalProgress(counts, g.target, daysInMonth(g.month));
    if (!prog.achieved) continue;
    // Status YUBORILGANDAN KEYIN belgilanadi (staffGoalMarkAchieved) — Telegram
    // yiqilsa "bajarildi" bo'lib qolib, ega kartani hech qachon ko'rmay qolmasin.
    out.push({
      ownerTelegramId: g.org.ownerTelegramId,
      goalId: g.id,
      text:
        `🎯 <b>MAQSAD BAJARILDI</b>\n` +
        `${g.month}: kunlik o'rtacha <b>${prog.avg}</b> ta buyurtma (maqsad ${g.target}, ${prog.days} kun bo'yicha).\n\n` +
        `Mukofot fondi: <b>${fmt(g.bonusAmount)} so'm</b> — ishlagan kuniga qarab bo'linadi.\n` +
        `Berilsinmi?`,
    });
  }
  return out;
}

/** Karta EGAGA yetgach chaqiriladi — shundan keyin maqsad "bajarildi" bo'ladi. */
export async function staffGoalMarkAchieved(goalId: number, now = new Date()): Promise<void> {
  await prisma.staffGoal.updateMany({ where: { id: goalId, status: "aktiv" }, data: { status: "bajarildi", achievedAt: now } });
}

/** Kechki xulosaga qo'shiladigan bir qatorlik maqsad-holati (bo'lmasa bo'sh satr). */
export async function staffGoalSummaryLine(orgId: number, now = new Date()): Promise<string> {
  const st = await staffGoalState(orgId, now);
  if (!st.goal || !st.progress) return "";
  const p = st.progress;
  if (st.goal.status === "bajarildi") return `\n🎯 Maqsad BAJARILDI (o'rtacha ${p.avg}/${p.target}) — mukofot kutilmoqda.`;
  const tail = p.outOfReach
    ? ` · bu oyda yetib bo'lmaydi (${p.needPerDay} ta/kun kerak edi)`
    : p.needPerDay > 0
      ? ` · qolgan kunlarga ${p.needPerDay} ta/kun kerak`
      : "";
  return `\n📈 Maqsad: o'rtacha <b>${p.avg}</b>/${p.target} ta/kun (${p.pct}%)${tail}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 🤖 XODIM TOMONI (bot) — o'qish, tanishish, o'z mukofotlari
// ─────────────────────────────────────────────────────────────────────────────

export interface StaffBotResult {
  ok: boolean;
  text: string;
  unreadIds?: number[]; // "✅ O'qidim" tugmalari uchun
  needAck?: boolean;
}

/** 📢 Xodimning xabarlari (oxirgi 10 ta) + o'qilmaganlar ro'yxati. */
export async function staffMyNotices(telegramId: string): Promise<StaffBotResult> {
  const emp = await employeeFor(telegramId);
  if (!emp) return { ok: false, text: "Bu bo'lim faqat xodimlar uchun." };
  const notices = await prisma.staffNotice.findMany({
    where: { orgId: emp.orgId, kind: "xabar", OR: [{ employeeId: null }, { employeeId: emp.id }] },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { reads: { where: { employeeId: emp.id } } },
  });
  if (notices.length === 0) return { ok: true, text: "📢 <b>Xabarlar</b>\n\nHozircha xabar yo'q." };
  const unreadIds: number[] = [];
  const lines = notices.map((n) => {
    const read = n.reads.length > 0;
    // Xodim ishga kirishidan OLDINGI xabarlar "o'qilmagan" deb sanalmaydi (yangi
    // kelgan odam eski e'lonlar to'plami bilan qarshi olinmasin) — lekin ko'rinadi.
    const isNew = !read && n.createdAt >= emp.createdAt;
    if (isNew) unreadIds.push(n.id);
    const d = tashkentDayMinutes(n.createdAt).date;
    return `${isNew ? "🆕 " : ""}<b>${d}</b>${n.employeeId ? " · shaxsiy" : ""}\n${esc(n.text)}`;
  });
  return {
    ok: true,
    text: `📢 <b>Xabarlar</b>\n\n${lines.join("\n\n")}`,
    unreadIds,
  };
}

export async function staffNoticeMarkRead(telegramId: string, noticeId: number): Promise<{ ok: boolean; text: string }> {
  const emp = await employeeFor(telegramId);
  if (!emp) return { ok: false, text: "Bu bo'lim faqat xodimlar uchun." };
  const n = await prisma.staffNotice.findUnique({ where: { id: noticeId } });
  if (!n || n.orgId !== emp.orgId || (n.employeeId && n.employeeId !== emp.id)) return { ok: false, text: "Xabar topilmadi." };
  await prisma.staffNoticeRead
    .create({ data: { noticeId, employeeId: emp.id } })
    .catch(() => undefined); // ikki marta bosilsa — unique, jim
  return { ok: true, text: "✅ Belgilandi — ega sizning o'qiganingizni ko'radi." };
}

/** O'qilmagan xabarlar soni (menyu tugmasidagi raqam). */
export async function staffUnreadCount(employeeId: number, orgId: number, since: Date): Promise<number> {
  const notices = await prisma.staffNotice.findMany({
    where: { orgId, kind: "xabar", createdAt: { gte: since }, OR: [{ employeeId: null }, { employeeId } ] },
    select: { id: true },
  });
  if (notices.length === 0) return 0;
  const read = await prisma.staffNoticeRead.count({ where: { employeeId, noticeId: { in: notices.map((n) => n.id) } } });
  return Math.max(0, notices.length - read);
}

/** 📖 Qoidalar matni + tanishish kerakmi. */
export async function staffMyRules(telegramId: string): Promise<StaffBotResult> {
  const emp = await employeeFor(telegramId);
  if (!emp) return { ok: false, text: "Bu bo'lim faqat xodimlar uchun." };
  const rules = await prisma.staffNotice.findMany({
    where: { orgId: emp.orgId, kind: "qoida", active: true },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
  if (rules.length === 0) return { ok: true, text: "📖 <b>Qoidalar</b>\n\nHozircha qoida kiritilmagan." };
  const body = rules.map((r, i) => `${i + 1}. ${esc(r.text)}`).join("\n");
  const needAck = emp.rulesAckVersion < emp.org.rulesVersion;
  return {
    ok: true,
    text: `📖 <b>${esc(emp.org.name)} — qoidalar</b>\n\n${body}${needAck ? "\n\n<i>Qoidalar yangilandi — tanishganingizni tasdiqlang.</i>" : "\n\n<i>✅ Siz bu qoidalar bilan tanishgansiz.</i>"}`,
    needAck,
  };
}

export async function staffRulesAck(telegramId: string): Promise<{ ok: boolean; text: string }> {
  const emp = await employeeFor(telegramId);
  if (!emp) return { ok: false, text: "Bu bo'lim faqat xodimlar uchun." };
  await prisma.employee.update({ where: { id: emp.id }, data: { rulesAckVersion: emp.org.rulesVersion } });
  return { ok: true, text: "✅ Rahmat! Qoidalar bilan tanishganingiz yozildi." };
}

/** 🏆 "Mening mukofotlarim": nishonlar + olingan pulli mukofotlar + jamoa maqsadi. */
export async function staffMyRewards(telegramId: string, now = new Date()): Promise<StaffBotResult> {
  const emp = await employeeFor(telegramId);
  if (!emp) return { ok: false, text: "Bu bo'lim faqat xodimlar uchun." };
  const month = tashkentDayMinutes(now).date.slice(0, 7);
  const [badges, received, catalog, goal] = await Promise.all([
    staffBadges(emp.orgId, month),
    prisma.staffLedger.findMany({
      where: {
        employeeId: emp.id,
        kind: "bonus",
        OR: [{ note: { startsWith: "🏆 " } }, { note: { startsWith: "📈 Maqsad" } }], // katalog + jamoa maqsadi
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    staffRewardCatalog(emp.orgId),
    staffGoalState(emp.orgId, now),
  ]);
  const mine = badges.get(emp.id) ?? [];
  const parts: string[] = [`🏆 <b>Mening mukofotlarim</b>`];
  parts.push(`\n<b>Bu oy nishonlarim</b>\n${mine.length ? mine.map((b) => b.label).join("\n") : "— hali yo'q, oy davom etyapti"}`);
  if (received.length) {
    parts.push(
      `\n<b>Olgan mukofotlarim</b>\n` +
        received.map((r) => `${tashkentDayMinutes(r.createdAt).date} · ${esc(r.note ?? "")} — ${fmt(r.amount)} so'm`).join("\n")
    );
  }
  if (catalog.length) {
    parts.push(`\n<b>Qanday mukofotlar bor</b>\n` + catalog.map((c) => `• ${esc(c.name)} — ${fmt(c.amount)} so'm${c.note ? ` (${esc(c.note)})` : ""}`).join("\n"));
  }
  if (goal.goal && goal.progress) {
    const p = goal.progress;
    parts.push(
      `\n📈 <b>Jamoa maqsadi</b>\n` +
        `Kunlik o'rtacha: <b>${p.avg}</b> / ${p.target} ta (${p.pct}%)\n` +
        `Bugun hozircha: ${goal.todayCount} ta\n` +
        `Fond: <b>${fmt(goal.goal.bonusAmount)} so'm</b> — ishlagan kuningizga qarab bo'linadi.` +
        (p.achieved
          ? `\n🎯 BAJARILDI — mukofot kutilmoqda!`
          : p.outOfReach
            ? `\nBu oyda yetib bo'lmaydi — keyingi oyda urinamiz.`
            : p.needPerDay > 0
              ? `\nQolgan kunlarga ${p.needPerDay} ta/kun kerak.`
              : "")
    );
  }
  return { ok: true, text: parts.join("\n") };
}
