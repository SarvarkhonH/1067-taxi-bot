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

export function isAdmin(telegramId: string): boolean {
  return env.adminIds.includes(telegramId);
}

function levelOf(m: Pick<Member, "points" | "trips">) {
  return levelForXp(computeXp({ points: m.points, trips: m.trips })).level;
}

// ─── member self view ─────────────────────────────────────────────────────────
export async function getMe(telegramId: string): Promise<MeResponse | null> {
  const tu = await prisma.telegramUser.findUnique({
    where: { id: telegramId },
    include: { member: { include: { achievements: true } } },
  });
  if (!tu?.member) return null;
  return buildMe(tu.member, tu.member.achievements);
}

export async function getMeByMemberId(memberId: number): Promise<MeResponse | null> {
  const member = await prisma.member.findUnique({ where: { id: memberId }, include: { achievements: true } });
  if (!member) return null;
  return buildMe(member, member.achievements);
}

async function buildMe(member: Member, achievements: MemberAchievement[]): Promise<MeResponse> {
  const type = member.type as MemberType;
  const xp = computeXp({ points: member.points, trips: member.trips });
  const lp = levelForXp(xp);

  const sameType = await prisma.member.findMany({ where: { type }, select: { id: true, points: true } });
  const sorted = [...sameType].sort((a, b) => b.points - a.points);
  const rank = sorted.findIndex((x) => x.id === member.id) + 1 || null;

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
    member: { id: member.id, fullName: member.fullName, phone: member.phone, carNumber: member.carNumber },
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
    totalMembers: sameType.length,
    badges,
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
}

export async function linkByPhone(
  telegramId: string,
  rawPhone: string,
  profile: { username?: string; firstName?: string; lastName?: string; languageCode?: string },
): Promise<LinkResult> {
  const norm = normPhone(rawPhone);

  // On-demand: pull this phone's record(s) from kas1067 (light) and upsert them.
  let found: { id: number; type: MemberType; fullName: string }[] = [];
  try {
    for (const km of await getDataSource().fetchByPhone(rawPhone)) {
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
      const m = await prisma.member.upsert({
        where: { type_kasId: { type: km.type, kasId: km.kasId } },
        create: { type: km.type, kasId: km.kasId, ...data },
        update: data,
      });
      found.push({ id: m.id, type: m.type as MemberType, fullName: m.fullName });
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
    await prisma.telegramUser.upsert({ where: { id: telegramId }, create: { id: telegramId, ...base }, update: base });
    return { status: "not_found" };
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
  return { status: "linked", memberId: match.id, type: match.type as MemberType, fullName: match.fullName };
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

  const users = tus.map((t) => ({
    telegramId: t.id,
    name: [t.firstName, t.lastName].filter(Boolean).join(" ") || (t.username ? `@${t.username}` : "—"),
    username: t.username,
    phone: t.phone,
    linked: !!t.memberId,
    memberType: (t.member?.type as MemberType) ?? null,
    memberName: t.member?.fullName ?? null,
    isAdmin: t.isAdmin,
    linkedAt: t.linkedAt?.toISOString() ?? null,
    lastActive: t.updatedAt.toISOString(),
  }));

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
