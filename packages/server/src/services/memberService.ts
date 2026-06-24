import {
  badgesForType,
  computeXp,
  levelForXp,
  metricLabel,
  type AdminBotUsersResponse,
  type AdminMemberRow,
  type AdminStats,
  type LeaderboardEntry,
  type LeaderboardResponse,
  type MeResponse,
  type MemberType,
} from "@t1067/shared";
import type { Member, MemberAchievement } from "@prisma/client";
import { prisma } from "../db";
import { env } from "../env";
import { getDataSource } from "../kas";
import { canSpinWheel, getStreak } from "./rewardService";
import { getJackpot } from "./weeklyService";

export function isAdmin(telegramId: string): boolean {
  return env.adminIds.includes(telegramId);
}

export async function getMemberId(telegramId: string): Promise<number | null> {
  const tu = await prisma.telegramUser.findUnique({ where: { id: telegramId } });
  return tu?.memberId ?? null;
}

function levelOf(m: Pick<Member, "points" | "trips">) {
  return levelForXp(computeXp({ points: m.points, trips: m.trips })).level;
}

// A nameless kas client is stored as "Mijoz <id>" (driver "Haydovchi"). For anything the
// USER sees, fall back to their real Telegram name/username so nobody is shown a placeholder.
// A real kas name always wins; an explicit edited name (when present) is handled by callers.
const PLACEHOLDER_NAME = /^(Mijoz|Haydovchi)( \d+)?$/;
export function resolveDisplayName(
  kasName: string | null,
  tg?: { firstName?: string | null; lastName?: string | null; username?: string | null } | null,
): string {
  if (kasName && !PLACEHOLDER_NAME.test(kasName)) return kasName;
  const tgName = [tg?.firstName, tg?.lastName].filter(Boolean).join(" ") || (tg?.username ? `@${tg.username}` : "");
  return tgName || kasName || "Mijoz";
}

// ─── member self view ─────────────────────────────────────────────────────────
export async function getMe(telegramId: string): Promise<MeResponse | null> {
  const tu = await prisma.telegramUser.findUnique({
    where: { id: telegramId },
    include: { member: { include: { achievements: true } } },
  });
  if (!tu?.member) return null;
  return buildMe(tu.member, tu.member.achievements, tu);
}

export async function getMeByMemberId(memberId: number): Promise<MeResponse | null> {
  const member = await prisma.member.findUnique({ where: { id: memberId }, include: { achievements: true } });
  if (!member) return null;
  const tu = await prisma.telegramUser.findFirst({ where: { memberId } });
  return buildMe(member, member.achievements, tu);
}

/** Set the user's OWN display name (bot/Mini App edit). Written to `displayName`, which the kas sync
 *  never touches — so it survives (unlike editing fullName, which reverts on the next sync). Returns
 *  the cleaned name, or null if it's invalid. Pass "" to clear (revert to the kas/Telegram name). */
export async function setDisplayName(memberId: number, raw: string): Promise<string | null> {
  const name = raw.trim().replace(/\s+/g, " ").slice(0, 40);
  if (name && name.length < 2) return null; // too short (but "" is allowed = clear)
  const m = await prisma.member.update({ where: { id: memberId }, data: { displayName: name || null }, select: { type: true, phone: true } });
  // Also push the name to kas1067 for CLIENTS (best-effort) so the official record + the dispatcher
  // view match what the user chose. Drivers have no kas name-update endpoint → local-only. Never
  // blocks/fails the edit: the local displayName already took effect. Only on a real (non-empty)
  // name and only in live mode.
  if (name && m.type === "client" && m.phone) {
    try {
      const { getDataSource } = await import("../kas");
      const ds = getDataSource();
      if (ds.name === "live") {
        const r = await ds.setClientName(m.phone, name);
        if (!r.ok) console.error(`[name] kas setClientName failed for member ${memberId} (status ${r.status ?? "?"})`);
      }
    } catch (e) {
      console.error(`[name] kas push errored for member ${memberId}:`, e instanceof Error ? e.message : e);
    }
  }
  return name;
}

async function buildMe(
  member: Member,
  achievements: MemberAchievement[],
  tg?: { firstName?: string | null; lastName?: string | null; username?: string | null } | null,
): Promise<MeResponse> {
  const type = member.type as MemberType;
  const xp = computeXp({ points: member.points, trips: member.trips });
  const lp = levelForXp(xp);

  // T2 (AUDIT 2.1 + 2.10): rank/total via indeksli COUNT (butun jadval emas),
  // streak/wheel/jackpot bilan birga PARALLEL — 5 ketma-ket so'rov → 1 to'lqin.
  const [ahead, totalMembers, streak, wheelAvailable, jackpot] = await Promise.all([
    prisma.member.count({ where: { type, points: { gt: member.points } } }),
    prisma.member.count({ where: { type } }),
    getStreak(member.id),
    canSpinWheel(member.id),
    getJackpot(),
  ]);
  const rank = ahead + 1;

  const earnedMap = new Map(achievements.map((a) => [a.code, a.earnedAt]));
  const badges = badgesForType(type).map((b) => ({
    code: b.code,
    name: b.name,
    emoji: b.emoji,
    description: b.description,
    earned: earnedMap.has(b.code),
    earnedAt: earnedMap.get(b.code)?.toISOString() ?? null,
  }));

  return {
    linked: true,
    type,
    metricLabel: metricLabel(type),
    member: { id: member.id, fullName: member.displayName || resolveDisplayName(member.fullName, tg), phone: member.phone, carNumber: member.carNumber },
    stats: { points: member.points, trips: member.trips, rating: member.rating },
    level: { index: lp.level.index, name: lp.level.name, emoji: lp.level.emoji, color: lp.level.color },
    nextLevel: lp.next
      ? { index: lp.next.index, name: lp.next.name, emoji: lp.next.emoji, minXp: lp.next.minXp }
      : null,
    xp: lp.xp,
    xpIntoLevel: lp.xpIntoLevel,
    xpForNext: lp.xpForNext,
    progress: lp.progress,
    rank,
    totalMembers,
    badges,
    streak,
    wheelAvailable,
    jackpot,
    coins: member.coins,
    leagueTier: member.leagueTier,
  };
}

// ─── leaderboard (scoped to a member type) ─────────────────────────────────────
function toEntry(m: Member, rank: number, myMemberId: number | null): LeaderboardEntry {
  const level = levelOf(m);
  return {
    rank,
    memberId: m.id,
    fullName: m.fullName,
    carNumber: m.carNumber,
    points: m.points,
    trips: m.trips,
    level: { name: level.name, emoji: level.emoji, color: level.color },
    isMe: myMemberId === m.id,
  };
}

export async function getLeaderboard(
  type: MemberType,
  telegramId?: string,
  limit = 50,
): Promise<LeaderboardResponse> {
  const members = await prisma.member.findMany({ where: { type }, orderBy: { points: "desc" }, take: limit });

  let myMemberId: number | null = null;
  if (telegramId) {
    const tu = await prisma.telegramUser.findUnique({ where: { id: telegramId }, include: { member: true } });
    if (tu?.member?.type === type) myMemberId = tu.member.id;
  }

  const entries = members.map((m, i) => toEntry(m, i + 1, myMemberId));
  let me = entries.find((e) => e.isMe) ?? null;

  if (!me && myMemberId) {
    const mine = await prisma.member.findUnique({ where: { id: myMemberId } });
    if (mine) {
      const higher = await prisma.member.count({ where: { type, points: { gt: mine.points } } });
      me = toEntry(mine, higher + 1, myMemberId);
    }
  }

  return { type, metricLabel: metricLabel(type), entries, me };
}

// ─── account linking (member shares phone in the bot) ──────────────────────────
function normPhone(s: string): string {
  return s.replace(/\D/g, "").slice(-9);
}

export interface LinkResult {
  status: "linked" | "not_found" | "taken";
  memberId?: number;
  type?: MemberType;
  fullName?: string;
  welcomeBonus?: number; // tanga granted on first join (welcomebonus flag); caller shows the message
}

/**
 * 🎁 Universal JOIN welcome: the moment ANYONE (client OR driver) first links their phone, they
 * get ONE firstRide (5000) tanga — no ride/drive needed. Idempotent (welcome_join:<memberId>),
 * gated by "welcomebonus" (DARK). Referral/recruit joiners are SKIPPED here — they receive the
 * same 5000 through their invite flow (anti-abuse, on first ride), so nobody is double-paid.
 * Tanga stays withdraw-gated (no_ride), so a non-rider can't cash it — soft, low-risk incentive.
 */
async function grantJoinWelcome(memberId: number, telegramId: string): Promise<number> {
  try {
    const { featureOn } = await import("./featureFlags");
    if (!(await featureOn("welcomebonus"))) return 0;
    const tu = await prisma.telegramUser.findUnique({ where: { id: telegramId }, select: { referredByCode: true } });
    const code = tu?.referredByCode ?? "";
    if (code.startsWith("ref_") || code.startsWith("drv_")) return 0; // invited → paid via the invite flow
    const { getBonusEcon } = await import("./bonusConfig");
    const amt = (await getBonusEcon()).firstRide ?? 5000;
    if (amt <= 0) return 0;
    const { grantCoins } = await import("./coinService");
    const g = await grantCoins(memberId, amt, "referral", "🎁 Botga xush kelibsiz — sovg'a!", `welcome_join:${memberId}`);
    return g.ok ? amt : 0;
  } catch {
    return 0;
  }
}

/**
 * Upsert a kas1067 member, ADOPTING a self-registered (tg_) member with the same phone so a
 * person who joined the app BEFORE kas knew them is never duplicated once they appear in kas.
 * The member id is preserved (tangas + all app data intact) — only kasId is swapped
 * tg_<telegramId> → the real kas id. Used by every kas-upsert path (runSync + linkByPhone).
 */
export async function upsertKasMember(km: {
  type: MemberType;
  kasId: string;
  fullName: string;
  phone?: string | null;
  carNumber?: string | null;
  points: number;
  trips: number;
  rating: number;
}): Promise<{ id: number; type: MemberType; fullName: string }> {
  const data = {
    fullName: km.fullName,
    phone: km.phone ?? null,
    carNumber: km.carNumber ?? null,
    points: km.points,
    trips: km.trips,
    rating: km.rating,
    active: true,
    lastSyncAt: new Date(),
  };
  // 1) we already track this real kas record → update it
  const byKas = await prisma.member.findUnique({ where: { type_kasId: { type: km.type, kasId: km.kasId } } });
  if (byKas) {
    const m = await prisma.member.update({ where: { id: byKas.id }, data });
    return { id: m.id, type: m.type as MemberType, fullName: m.fullName };
  }
  // 2) ADOPT a self-registered member (synthetic tg_ kasId) with the same phone — ACROSS TYPES.
  //    A person who self-registered as a CLIENT (the default when they weren't in kas yet) and later
  //    turns out to be a kas DRIVER is UPGRADED IN PLACE: same member id, telegram link + tangas kept,
  //    type corrected. Without this they got a duplicate driver row and stayed a "client" in the bot,
  //    so their recruit/welcome bonuses landed on the orphan account they don't see.
  if (km.phone) {
    const want = normPhone(km.phone);
    const selfRegs = await prisma.member.findMany({ where: { kasId: { startsWith: "tg_" }, phone: { not: null } } });
    const tg = selfRegs.find((m) => m.phone && normPhone(m.phone) === want);
    if (tg) {
      try {
        const m = await prisma.member.update({ where: { id: tg.id }, data: { type: km.type, kasId: km.kasId, ...data } });
        return { id: m.id, type: m.type as MemberType, fullName: m.fullName };
      } catch {
        // a concurrent path (or an existing real row for this type+kasId) won — read it back
        const m = await prisma.member.findUnique({ where: { type_kasId: { type: km.type, kasId: km.kasId } } });
        if (m) return { id: m.id, type: m.type as MemberType, fullName: m.fullName };
      }
    }
  }
  // 3) brand-new kas member
  const m = await prisma.member.create({ data: { type: km.type, kasId: km.kasId, ...data } });
  return { id: m.id, type: m.type as MemberType, fullName: m.fullName };
}

export async function linkByPhone(
  telegramId: string,
  rawPhone: string,
  profile: { username?: string; firstName?: string; lastName?: string; languageCode?: string },
): Promise<LinkResult> {
  const norm = normPhone(rawPhone);

  // On-demand: pull this phone's record(s) from kas1067 (light) and upsert them (adopt-aware).
  let found: { id: number; type: MemberType; fullName: string }[] = [];
  try {
    for (const km of await getDataSource().fetchByPhone(rawPhone)) {
      found.push(await upsertKasMember(km));
    }
  } catch (e) {
    console.error("[link] kas1067 lookup failed:", e instanceof Error ? e.message : e);
  }
  // fallback: anything already stored locally with this phone
  if (!found.length) {
    const existing = await prisma.member.findMany({ where: { phone: { not: null } } });
    found = existing
      .filter((m) => m.phone && normPhone(m.phone) === norm)
      .map((m) => ({ id: m.id, type: m.type as MemberType, fullName: m.fullName }));
  }
  // a phone can be both a passenger and a driver — prefer the driver role
  const match = found.find((m) => m.type === "driver") ?? found[0];

  const base = {
    username: profile.username ?? null,
    firstName: profile.firstName ?? null,
    lastName: profile.lastName ?? null,
    languageCode: profile.languageCode ?? null,
    phone: rawPhone,
    isAdmin: isAdmin(telegramId),
  };

  if (!match) {
    // A1 SELF-REGISTER: this phone isn't in kas1067 yet. Instead of locking a brand-new
    // person out, create a local client member so they can use the app + order their FIRST
    // taxi. kasId is synthetic (tg_<telegramId>); once they appear in kas, upsertKasMember
    // ADOPTS this same member (no duplicate, tangas preserved). Money stays safe — withdraw
    // still needs real rides (no_ride gate) and writes to kas BY PHONE, so the synthetic
    // kasId changes nothing there.
    const selfKasId = `tg_${telegramId}`;
    const selfName = [profile.firstName, profile.lastName].filter(Boolean).join(" ") || (profile.username ? `@${profile.username}` : "Mijoz");
    const created =
      (await prisma.member
        .create({ data: { type: "client", kasId: selfKasId, fullName: selfName, phone: rawPhone, points: 0, trips: 0, rating: 0, active: true } })
        .catch(() => null)) ?? (await prisma.member.findUnique({ where: { type_kasId: { type: "client", kasId: selfKasId } } }));
    if (!created) {
      await prisma.telegramUser.upsert({ where: { id: telegramId }, create: { id: telegramId, ...base }, update: base });
      return { status: "not_found" };
    }
    await prisma.telegramUser.upsert({
      where: { id: telegramId },
      create: { id: telegramId, ...base, memberId: created.id, linkedAt: new Date() },
      update: { ...base, memberId: created.id, linkedAt: new Date() },
    });
    const welcomeBonus = await grantJoinWelcome(created.id, telegramId);
    return { status: "linked", memberId: created.id, type: "client", fullName: created.fullName, welcomeBonus };
  }

  const existing = await prisma.telegramUser.findUnique({ where: { memberId: match.id } });
  if (existing && existing.id !== telegramId) {
    await prisma.telegramUser.upsert({ where: { id: telegramId }, create: { id: telegramId, ...base }, update: base });
    return { status: "taken" };
  }

  await prisma.telegramUser.upsert({
    where: { id: telegramId },
    create: { id: telegramId, ...base, memberId: match.id, linkedAt: new Date() },
    update: { ...base, memberId: match.id, linkedAt: new Date() },
  });
  const welcomeBonus = await grantJoinWelcome(match.id, telegramId);
  return { status: "linked", memberId: match.id, type: match.type as MemberType, fullName: match.fullName, welcomeBonus };
}

export async function touchTelegramUser(
  telegramId: string,
  profile: { username?: string; firstName?: string; lastName?: string; languageCode?: string },
): Promise<void> {
  const base = {
    username: profile.username ?? null,
    firstName: profile.firstName ?? null,
    lastName: profile.lastName ?? null,
    languageCode: profile.languageCode ?? null,
    isAdmin: isAdmin(telegramId),
  };
  await prisma.telegramUser.upsert({ where: { id: telegramId }, create: { id: telegramId, ...base }, update: base });
}

// ─── admin (scoped to a member type) ───────────────────────────────────────────
export async function getAdminStats(type: MemberType): Promise<AdminStats> {
  const [totalMembers, activeMembers, linkedMembers, agg, lastSync, top] = await Promise.all([
    prisma.member.count({ where: { type } }),
    prisma.member.count({ where: { type, active: true } }),
    prisma.member.count({ where: { type, telegramUser: { isNot: null } } }),
    prisma.member.aggregate({ where: { type }, _sum: { points: true, trips: true } }),
    prisma.syncRun.findFirst({ orderBy: { startedAt: "desc" } }),
    prisma.member.findMany({ where: { type }, orderBy: { points: "desc" }, take: 5 }),
  ]);

  return {
    type,
    metricLabel: metricLabel(type),
    totalMembers,
    activeMembers,
    linkedMembers,
    pointsSum: agg._sum.points ?? 0,
    tripsSum: agg._sum.trips ?? 0,
    lastSync: lastSync
      ? {
          at: (lastSync.finishedAt ?? lastSync.startedAt).toISOString(),
          status: lastSync.status,
          source: lastSync.source,
          membersSeen: lastSync.membersSeen,
        }
      : null,
    topMembers: top.map((m, i) => toEntry(m, i + 1, null)),
  };
}

/** Who joined / uses the bot — the gamification audience, from our own data. */
export async function getBotUsers(): Promise<AdminBotUsersResponse> {
  const tus = await prisma.telegramUser.findMany({ include: { member: true }, orderBy: { updatedAt: "desc" } });
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);

  const users = tus.map((t) => {
    const tgName = [t.firstName, t.lastName].filter(Boolean).join(" ") || (t.username ? `@${t.username}` : "");
    return {
      telegramId: t.id,
      name: tgName || "—",
      username: t.username,
      phone: t.phone,
      linked: !!t.memberId,
      memberType: (t.member?.type as MemberType) ?? null,
      // show a real person, not the kas "Mijoz <id>" placeholder (same resolver as the user view)
      memberName: t.member ? resolveDisplayName(t.member.fullName, t) : null,
      isAdmin: t.isAdmin,
      linkedAt: t.linkedAt?.toISOString() ?? null,
      lastActive: t.updatedAt.toISOString(),
    };
  });

  return {
    total: tus.length,
    linked: tus.filter((t) => t.memberId).length,
    admins: tus.filter((t) => t.isAdmin).length,
    newToday: tus.filter((t) => t.createdAt >= startToday).length,
    users,
  };
}

export async function getAdminMembers(type: MemberType): Promise<AdminMemberRow[]> {
  const members = await prisma.member.findMany({
    where: { type },
    orderBy: { points: "desc" },
    include: { telegramUser: true },
  });
  return members.map((m) => {
    const level = levelOf(m);
    return {
      id: m.id,
      kasId: m.kasId,
      type: m.type as MemberType,
      fullName: m.fullName,
      phone: m.phone,
      carNumber: m.carNumber,
      points: m.points,
      trips: m.trips,
      rating: m.rating,
      level: { name: level.name, emoji: level.emoji },
      linked: !!m.telegramUser,
      active: m.active,
      lastSyncAt: m.lastSyncAt?.toISOString() ?? null,
    };
  });
}
