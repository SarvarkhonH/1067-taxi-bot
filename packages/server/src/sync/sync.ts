import { earnedBadges, type MemberStats, type MemberType } from "@t1067/shared";
import { prisma } from "../db";
import { getDataSource } from "../kas";

export interface NewAchievement {
  memberId: number;
  code: string;
}

export interface SyncSummary {
  ok: boolean;
  runId: number;
  source: string;
  membersSeen: number;
  newAchievements: NewAchievement[];
}

/** Pull the latest data from kas1067 (or mock), upsert members, award badges. */
export async function runSync(): Promise<SyncSummary> {
  const source = getDataSource();
  const run = await prisma.syncRun.create({ data: { source: source.name, status: "running" } });

  try {
    const members = await source.fetchMembers();
    const now = new Date();

    for (const m of members) {
      const common = {
        fullName: m.fullName,
        phone: m.phone ?? null,
        carNumber: m.carNumber ?? null,
        points: m.points,
        trips: m.trips,
        rating: m.rating,
        active: true,
        lastSyncAt: now,
      };
      await prisma.member.upsert({
        where: { type_kasId: { type: m.type, kasId: m.kasId } },
        create: { type: m.type, kasId: m.kasId, ...common },
        update: common,
      });
    }

    const newAchievements = await evaluateAchievements();

    await prisma.syncRun.update({
      where: { id: run.id },
      data: { status: "ok", finishedAt: new Date(), membersSeen: members.length },
    });

    return { ok: true, runId: run.id, source: source.name, membersSeen: members.length, newAchievements };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await prisma.syncRun.update({
      where: { id: run.id },
      data: { status: "error", finishedAt: new Date(), message },
    });
    throw e;
  }
}

export interface CashbackDelta {
  memberId: number;
  telegramId: string;
  type: MemberType;
  delta: number;
  total: number;
}

/**
 * Light refresh of ONLY the linked (active) members — one phone lookup each.
 * This is what runs periodically in live mode: no bulk scan, scales with bot users.
 * Returns the cashback increases so the bot can push "+X so'm" notifications.
 */
export async function refreshLinkedMembers(): Promise<{ checked: number; deltas: CashbackDelta[] }> {
  const source = getDataSource();
  const linked = await prisma.member.findMany({
    where: { telegramUser: { isNot: null }, phone: { not: null } },
    include: { telegramUser: true },
  });

  const deltas: CashbackDelta[] = [];
  for (const m of linked) {
    try {
      const matches = await source.fetchByPhone(m.phone!);
      const fresh = matches.find((f) => f.type === m.type && f.kasId === m.kasId) ?? matches.find((f) => f.type === m.type);
      if (!fresh) continue;
      if (fresh.points !== m.points || fresh.trips !== m.trips || fresh.rating !== m.rating) {
        await prisma.member.update({
          where: { id: m.id },
          data: { points: fresh.points, trips: fresh.trips, rating: fresh.rating, fullName: fresh.fullName, lastSyncAt: new Date() },
        });
        if (fresh.points > m.points && m.telegramUser) {
          deltas.push({
            memberId: m.id,
            telegramId: m.telegramUser.id,
            type: m.type as MemberType,
            delta: fresh.points - m.points,
            total: fresh.points,
          });
        }
      }
    } catch (e) {
      console.error("[refresh] failed for member", m.id, e instanceof Error ? e.message : e);
    }
  }

  await evaluateAchievements();
  return { checked: linked.length, deltas };
}

/** Award any badges a member now qualifies for. Returns the freshly-earned ones. */
export async function evaluateAchievements(): Promise<NewAchievement[]> {
  const members = await prisma.member.findMany({ include: { achievements: true } });

  // rank within each type by points
  const groups: Record<string, typeof members> = {};
  for (const m of members) (groups[m.type] ??= []).push(m);
  const rankById = new Map<number, number>();
  for (const list of Object.values(groups)) {
    [...list].sort((a, b) => b.points - a.points).forEach((m, i) => rankById.set(m.id, i + 1));
  }

  const created: NewAchievement[] = [];
  for (const m of members) {
    const stats: MemberStats = {
      points: m.points,
      trips: m.trips,
      rating: m.rating,
      rank: rankById.get(m.id) ?? null,
    };
    const have = new Set(m.achievements.map((a) => a.code));
    for (const badge of earnedBadges(m.type as MemberType, stats)) {
      if (have.has(badge.code)) continue;
      await prisma.memberAchievement.create({ data: { memberId: m.id, code: badge.code } });
      created.push({ memberId: m.id, code: badge.code });
    }
  }
  return created;
}
