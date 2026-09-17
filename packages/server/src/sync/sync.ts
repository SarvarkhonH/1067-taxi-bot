import { earnedBadges, type MemberStats, type MemberType } from "@t1067/shared";
import { prisma } from "../db";
import { getDataSource } from "../kas";
import { upsertKasMember } from "../services/memberService";

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

/** Pull every member from the taxi source (bulk), upsert them, award badges. Used by mock/dev and by the cutover adopt run — never on a timer in production. */
export async function runSync(): Promise<SyncSummary> {
  const source = getDataSource();
  const run = await prisma.syncRun.create({ data: { source: source.name, status: "running" } });

  try {
    const members = await source.fetchMembers();

    // adopt-aware upsert → a self-registered (tg_) member is reconciled in place, never duplicated
    for (const m of members) {
      await upsertKasMember(m);
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
