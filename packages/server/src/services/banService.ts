// 🚫 HARD ban — TOTAL product lockout (Telegram bot + Mini App API), a level ABOVE riskFlag
// (which only freezes the cash door). A banned member cannot open the bot, book, play, earn,
// spend or transfer at all.
//
// Both entry gates (bot global middleware + API requireUser) run on EVERY request, so the check
// must be O(1) with no DB hit: we keep an in-memory Set of banned Telegram ids, loaded once at
// boot and mutated on each toggle (same shape as the feature-flag / presence caches). The DB
// (Member.banned) stays the durable source of truth — a restart re-derives the set from it.
import { prisma } from "../db";

const bannedTgIds = new Set<string>();
let loaded = false;

/** Boot: derive the in-memory ban set from the DB. Idempotent — safe to call again to refresh. */
export async function loadBans(): Promise<number> {
  const banned = await prisma.member.findMany({
    where: { banned: true },
    select: { telegramUser: { select: { id: true } } },
  });
  bannedTgIds.clear();
  for (const m of banned) if (m.telegramUser?.id) bannedTgIds.add(m.telegramUser.id);
  loaded = true;
  return bannedTgIds.size;
}

/** O(1) gate check by Telegram id. Returns false until loadBans() has run (fail-open at cold start —
 *  the boot sequence loads the set before the server accepts traffic, so this window doesn't apply
 *  in production; it only keeps unit tests that skip boot from throwing). */
export function isTgBanned(telegramId: string | null | undefined): boolean {
  if (!loaded || !telegramId) return false;
  return bannedTgIds.has(telegramId);
}

/** Durable check straight from the DB — used off the hot path (e.g. the link-evasion guard), where a
 *  correct answer matters more than avoiding one query. */
export async function isMemberBanned(memberId: number): Promise<boolean> {
  const m = await prisma.member.findUnique({ where: { id: memberId }, select: { banned: true } });
  return !!m?.banned;
}

async function tgIdsForMember(memberId: number): Promise<string[]> {
  const rows = await prisma.telegramUser.findMany({ where: { memberId }, select: { id: true } });
  return rows.map((r) => r.id);
}

/** Ban a member: durable flag + refresh the in-memory set + alert admins (blood rule: every
 *  access-control toggle pages the owner). `by` is a label for the audit line (panel/operator). */
export async function banMember(memberId: number, reason: string, by = "panel"): Promise<{ ok: boolean; message: string }> {
  const m = await prisma.member.findUnique({ where: { id: memberId }, select: { id: true, fullName: true, phone: true, banned: true } });
  if (!m) return { ok: false, message: `❌ #${memberId} topilmadi` };
  await prisma.member.update({ where: { id: memberId }, data: { banned: true, bannedAt: new Date(), bannedReason: reason || "admin ban" } });
  for (const id of await tgIdsForMember(memberId)) bannedTgIds.add(id);
  try {
    const { alertAdmins } = await import("./economyService");
    await alertAdmins(`🚫 <b>TO'LIQ BAN</b>: ${m.fullName ?? `#${memberId}`}${m.phone ? ` (${m.phone})` : ""} — botdan butunlay chiqarildi.\nSabab: ${reason || "admin ban"} · ${by}`);
  } catch {
    /* alert is best-effort */
  }
  return { ok: true, message: `🚫 #${memberId} to'liq bloklandi (butun botdan)` };
}

/** Lift a hard ban: durable flag + drop from the in-memory set + alert. Leaves riskFlag untouched. */
export async function unbanMember(memberId: number, by = "panel"): Promise<{ ok: boolean; message: string }> {
  const m = await prisma.member.findUnique({ where: { id: memberId }, select: { id: true, fullName: true, banned: true } });
  if (!m) return { ok: false, message: `❌ #${memberId} topilmadi` };
  await prisma.member.update({ where: { id: memberId }, data: { banned: false, bannedAt: null, bannedReason: null } });
  for (const id of await tgIdsForMember(memberId)) bannedTgIds.delete(id);
  try {
    const { alertAdmins } = await import("./economyService");
    await alertAdmins(`✅ <b>Ban olib tashlandi</b>: ${m.fullName ?? `#${memberId}`} — botga qaytdi. · ${by}`);
  } catch {
    /* best-effort */
  }
  return { ok: true, message: `✅ #${memberId} to'liq ban olib tashlandi` };
}

/** Called after a (would-be) link so a banned member re-linking a NEW Telegram account can't slip a
 *  fresh id past the set. Adds the id if the member is banned; no-op otherwise. */
export function markTgBannedIfMemberBanned(telegramId: string, memberBanned: boolean): void {
  if (memberBanned) bannedTgIds.add(telegramId);
}

/** test-only introspection */
export function _bannedSetSize(): number {
  return bannedTgIds.size;
}
