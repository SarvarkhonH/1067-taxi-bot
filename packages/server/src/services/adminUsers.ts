// 👑 Admin user management — the "control" panel: search a person, see ALL their accounts
// (client + driver, like the Elbek case), re-link/unlink the Telegram↔member link, and view
// withdrawals. Coin grant/deduct reuses adminGrant (±1M + daily cap); codes reuse
// generateLinkCode. Every mutation here is owner-gated at the route layer.
import { prisma } from "../db";

export interface AdminUserRow {
  id: number;
  type: string;
  kasId: string;
  fullName: string;
  phone: string | null;
  coins: number;
  points: number;
  trips: number;
  tier: string;
  telegram: { id: string; username: string | null; name: string | null; linkedAt: string | null } | null;
}

/** Search members by phone (last-9) or name → every matching account + its Telegram link. */
export async function adminSearchUsers(q: string): Promise<AdminUserRow[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const digits = term.replace(/\D/g, "");
  const where =
    digits.length >= 4
      ? { phone: { contains: digits.slice(-9) } }
      : { fullName: { contains: term, mode: "insensitive" as const } };
  const members = await prisma.member.findMany({
    where,
    take: 40,
    orderBy: [{ type: "asc" }, { points: "desc" }],
    include: { telegramUser: { select: { id: true, username: true, firstName: true, lastName: true, linkedAt: true } } },
  });
  return members.map((m) => ({
    id: m.id,
    type: m.type,
    kasId: m.kasId,
    fullName: m.fullName,
    phone: m.phone,
    coins: m.coins,
    points: m.points,
    trips: m.trips,
    tier: m.leagueTier,
    telegram: m.telegramUser
      ? {
          id: m.telegramUser.id,
          username: m.telegramUser.username,
          name: [m.telegramUser.firstName, m.telegramUser.lastName].filter(Boolean).join(" ") || null,
          linkedAt: m.telegramUser.linkedAt?.toISOString() ?? null,
        }
      : null,
  }));
}

/** Re-link a Telegram account to a chosen member (the Elbek fix). Refuses to steal a member
 *  that's already linked to a DIFFERENT Telegram. */
export async function adminRelink(telegramId: string, memberId: number): Promise<{ ok: boolean; reason?: string }> {
  if (!telegramId || !Number.isFinite(memberId)) return { ok: false, reason: "bad_input" };
  const tu = await prisma.telegramUser.findUnique({ where: { id: telegramId } });
  if (!tu) return { ok: false, reason: "tg_not_found" };
  const member = await prisma.member.findUnique({ where: { id: memberId }, select: { id: true } });
  if (!member) return { ok: false, reason: "member_not_found" };
  const existing = await prisma.telegramUser.findFirst({ where: { memberId } });
  if (existing && existing.id !== telegramId) return { ok: false, reason: "member_taken" };
  await prisma.telegramUser.update({ where: { id: telegramId }, data: { memberId, linkedAt: new Date() } });
  return { ok: true };
}

/** Unlink a Telegram account (so the person can re-link fresh). */
export async function adminUnlink(telegramId: string): Promise<{ ok: boolean; reason?: string }> {
  if (!telegramId) return { ok: false, reason: "bad_input" };
  const tu = await prisma.telegramUser.findUnique({ where: { id: telegramId } });
  if (!tu) return { ok: false, reason: "tg_not_found" };
  await prisma.telegramUser.update({ where: { id: telegramId }, data: { memberId: null, linkedAt: null } });
  return { ok: true };
}

export interface AdminWithdrawalRow {
  id: number;
  amount: number;
  kasApplied: boolean;
  kasMessage: string | null;
  at: string;
  member: { name: string; phone: string | null; type: string } | null;
}

/** Recent withdrawals (cash-outs) — oversight: who cashed out, how much, did kas apply it. */
export async function adminWithdrawals(limit = 50): Promise<AdminWithdrawalRow[]> {
  const rows = await prisma.withdrawal.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(200, Math.max(1, Math.floor(limit) || 50)),
    include: { member: { select: { fullName: true, phone: true, type: true } } },
  });
  return rows.map((w) => ({
    id: w.id,
    amount: w.amount,
    kasApplied: w.kasApplied,
    kasMessage: w.kasMessage,
    at: w.createdAt.toISOString(),
    member: w.member ? { name: w.member.fullName, phone: w.member.phone, type: w.member.type } : null,
  }));
}
