// 🏘 V5 — Mahalla (neighborhood) league. The Gap circle IS the mahalla unit; this
// ranks gaps against each other by their members' combined weekly score. Built on the
// existing Gap/GapMember + WeeklyScore data — no schema change, no new poller.
import { prisma } from "../db";
import { weekKey } from "./missionService";

export interface MahallaBoard {
  week: string;
  gaps: { gapId: number; name: string; members: number; score: number; rank: number }[];
  me: { gapId: number; name: string; rank: number; score: number } | null;
}

export async function getMahallaBoard(memberId: number): Promise<MahallaBoard> {
  const week = weekKey(new Date());
  const [gapMembers, scores] = await Promise.all([
    prisma.gapMember.findMany({ include: { gap: { select: { id: true, name: true } } } }),
    prisma.weeklyScore.findMany({ where: { weekKey: week }, select: { memberId: true, score: true } }),
  ]);
  const scoreOf = new Map(scores.map((s) => [s.memberId, s.score]));
  const agg = new Map<number, { name: string; members: number; score: number }>();
  let myGapId: number | null = null;
  for (const gm of gapMembers) {
    if (gm.memberId === memberId) myGapId = gm.gapId;
    const cur = agg.get(gm.gapId) ?? { name: gm.gap.name, members: 0, score: 0 };
    cur.members += 1;
    cur.score += scoreOf.get(gm.memberId) ?? 0;
    agg.set(gm.gapId, cur);
  }
  const ranked = [...agg.entries()]
    .map(([gapId, v]) => ({ gapId, name: v.name, members: v.members, score: v.score }))
    .sort((a, b) => b.score - a.score || b.members - a.members)
    .map((g, i) => ({ ...g, rank: i + 1 }));
  const mine = myGapId !== null ? ranked.find((g) => g.gapId === myGapId) ?? null : null;
  return {
    week,
    gaps: ranked.slice(0, 30),
    me: mine ? { gapId: mine.gapId, name: mine.name, rank: mine.rank, score: mine.score } : null,
  };
}
