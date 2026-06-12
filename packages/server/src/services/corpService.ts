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

export async function adjustCorpBalance(corpId: number, delta: number): Promise<{ ok: boolean; balance?: number }> {
  const c = await prisma.corpAccount.update({ where: { id: corpId }, data: { balance: { increment: delta } } }).catch(() => null);
  return c ? { ok: true, balance: c.balance } : { ok: false };
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
  const rows: { phone: string; name: string | null; rides: number; overCap: boolean }[] = [];
  let totalRides = 0;
  for (const e of corp.employees) {
    const member = await prisma.member.findFirst({ where: { phone: { endsWith: e.phone } } });
    const rides = member ? await prisma.rideReward.count({ where: { memberId: member.id, createdAt: { gte: monthStart } } }) : 0;
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
