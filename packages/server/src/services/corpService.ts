// 🏢 1067 Biznes v1 — PREPAID corp accounts (Maxim/TaxiMaster pattern):
// phone-whitelisted employees; rides are logged against the corp via the
// RideReward sweep; balance top-up/adjust is admin-manual (cash in office),
// monthly report comes from this module. Postpay deliberately does NOT exist.
import { prisma } from "../db";

export async function createCorp(name: string, monthlyCapPerEmployee = 30): Promise<{ id: number }> {
  const c = await prisma.corpAccount.create({ data: { name: name.trim().slice(0, 60), monthlyCapPerEmployee } });
  return { id: c.id };
}

export async function addCorpEmployee(corpId: number, phone: string, name?: string): Promise<{ ok: boolean; reason?: string }> {
  const norm = phone.replace(/\D/g, "").slice(-9);
  if (norm.length !== 9) return { ok: false, reason: "bad_phone" };
  const exists = await prisma.corpEmployee.findUnique({ where: { phone: norm } });
  if (exists) return { ok: false, reason: "already" };
  await prisma.corpEmployee.create({ data: { corpId, phone: norm, name: name?.trim().slice(0, 40) } });
  return { ok: true };
}

export async function adjustCorpBalance(corpId: number, delta: number): Promise<{ ok: boolean; balance?: number; reason?: string }> {
  // Guard the money mutation: a typo'd / non-numeric delta (NaN/Infinity) must never
  // touch the balance, and a prepaid corp balance can never be driven below 0.
  if (!Number.isFinite(delta)) return { ok: false, reason: "bad_amount" };
  delta = Math.trunc(delta);
  if (delta === 0) return { ok: false, reason: "bad_amount" };
  if (delta < 0) {
    // atomic guarded debit — the WHERE makes "balance stays ≥ 0" race-safe
    const dec = await prisma.corpAccount.updateMany({ where: { id: corpId, balance: { gte: -delta } }, data: { balance: { increment: delta } } });
    if (dec.count === 0) return { ok: false, reason: "insufficient" };
  } else {
    const inc = await prisma.corpAccount.updateMany({ where: { id: corpId }, data: { balance: { increment: delta } } });
    if (inc.count === 0) return { ok: false, reason: "not_found" };
  }
  const c = await prisma.corpAccount.findUnique({ where: { id: corpId }, select: { balance: true } });
  return c ? { ok: true, balance: c.balance } : { ok: false, reason: "not_found" };
}

/** Monthly report: rides per employee (matched by member phone last-9) this month. */
export async function corpReport(corpId: number): Promise<{
  corp: { id: number; name: string; balance: number; monthlyCapPerEmployee: number };
  rows: { phone: string; name: string | null; rides: number; overCap: boolean }[];
  totalRides: number;
} | null> {
  const corp = await prisma.corpAccount.findUnique({ where: { id: corpId }, include: { employees: true } });
  if (!corp) return null;
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 5 * 3600_000);
  // T2 (AUDIT 2.7): N+1 (xodim boshiga 2 so'rov) → 2 to'plamli so'rov.
  const phones = corp.employees.map((e) => e.phone);
  const members =
    phones.length > 0
      ? await prisma.member.findMany({ where: { OR: phones.map((p) => ({ phone: { endsWith: p } })) }, select: { id: true, phone: true } })
      : [];
  // member.id → o'sha xodimning oxirgi-9 telefoni (endsWith mosligi)
  const memberByPhone = new Map<string, number>();
  for (const m of members) {
    const last9 = (m.phone ?? "").replace(/\D/g, "").slice(-9);
    if (last9) memberByPhone.set(last9, m.id);
  }
  const ids = [...memberByPhone.values()];
  const rideGroups =
    ids.length > 0
      ? await prisma.rideReward.groupBy({ by: ["memberId"], where: { memberId: { in: ids }, createdAt: { gte: monthStart } }, _count: true })
      : [];
  const ridesByMember = new Map(rideGroups.map((g) => [g.memberId, g._count]));
  const rows: { phone: string; name: string | null; rides: number; overCap: boolean }[] = [];
  let totalRides = 0;
  for (const e of corp.employees) {
    const mid = memberByPhone.get(e.phone);
    const rides = mid ? (ridesByMember.get(mid) ?? 0) : 0;
    totalRides += rides;
    rows.push({ phone: e.phone, name: e.name, rides, overCap: rides > corp.monthlyCapPerEmployee });
  }
  return {
    corp: { id: corp.id, name: corp.name, balance: corp.balance, monthlyCapPerEmployee: corp.monthlyCapPerEmployee },
    rows,
    totalRides,
  };
}

export async function listCorps(): Promise<{ id: number; name: string; balance: number; employees: number }[]> {
  const cs = await prisma.corpAccount.findMany({ include: { _count: { select: { employees: true } } }, orderBy: { id: "asc" } });
  return cs.map((c) => ({ id: c.id, name: c.name, balance: c.balance, employees: c._count.employees }));
}
