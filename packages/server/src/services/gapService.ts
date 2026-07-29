// 👬 Gap — Uzbek "gashtak" circle in the bot: 3-6 friends, auto-sized weekly
// team goal (~1.5 rides/member), everyone +500 on success, rotating pot +2000,
// creator +1000 once when the gap fills to 5. Join needs ≥1 finished ride.
import type { Bot } from "grammy";
import { prisma } from "../db";
import { grantCoins } from "./coinService";
import { weekKey } from "./missionService";

export const GAP_MAX = 6;
export const GAP_REWARD_EACH = 500;
export const GAP_POT = 2000;
export const GAP_CREATOR_BONUS = 1000;

function genCode(): string {
  return Array.from({ length: 6 }, () => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 31)]).join("");
}

export async function createGap(memberId: number, name: string): Promise<{ ok: boolean; reason?: string; code?: string }> {
  const m = await prisma.member.findUnique({ where: { id: memberId } });
  if (!m || m.trips < 1) return { ok: false, reason: "need_ride" };
  if (await prisma.gapMember.findUnique({ where: { memberId } })) return { ok: false, reason: "already_in_gap" };
  const clean = name.trim().slice(0, 24) || "Bizning gap";
  const gap = await prisma.gap.create({ data: { name: clean, code: genCode(), creatorId: memberId } });
  await prisma.gapMember.create({ data: { gapId: gap.id, memberId } });
  return { ok: true, code: gap.code };
}

export async function joinGap(memberId: number, code: string): Promise<{ ok: boolean; reason?: string; name?: string }> {
  const m = await prisma.member.findUnique({ where: { id: memberId } });
  if (!m || m.trips < 1) return { ok: false, reason: "need_ride" };
  if (await prisma.gapMember.findUnique({ where: { memberId } })) return { ok: false, reason: "already_in_gap" };
  const gap = await prisma.gap.findUnique({ where: { code: code.toUpperCase() }, include: { members: true } });
  if (!gap) return { ok: false, reason: "not_found" };
  if (gap.members.length >= GAP_MAX) return { ok: false, reason: "full" };
  await prisma.gapMember.create({ data: { gapId: gap.id, memberId } });
  // creator viral bonus once when the circle reaches 5 (Pinduoduo initiator pattern)
  if (gap.members.length + 1 === 5) {
    await grantCoins(gap.creatorId, GAP_CREATOR_BONUS, "gap", `👬 "${gap.name}" gapi to'ldi!`, `gapfull:${gap.id}`);
  }
  return { ok: true, name: gap.name };
}

export async function getGapView(memberId: number): Promise<{
  inGap: boolean;
  name?: string;
  code?: string;
  goal?: number;
  progress?: number;
  members?: { name: string; rides: number; isCreator: boolean }[];
} | null> {
  const gm = await prisma.gapMember.findUnique({ where: { memberId }, include: { gap: { include: { members: true } } } });
  if (!gm) return { inGap: false };
  const gap = gm.gap;
  const week = weekStart();
  const ids = gap.members.map((x) => x.memberId);
  const rides = await prisma.rideReward.groupBy({ by: ["memberId"], where: { memberId: { in: ids }, createdAt: { gte: week } }, _count: true });
  const byId = new Map(rides.map((r) => [r.memberId, r._count]));
  const ms = await prisma.member.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } });
  const goal = Math.ceil(ids.length * 1.5);
  const progress = rides.reduce((a, r) => a + r._count, 0);
  return {
    inGap: true,
    name: gap.name,
    code: gap.code,
    goal,
    progress,
    members: ms.map((m) => ({ name: m.fullName.split(" ")[0] ?? m.fullName, rides: byId.get(m.id) ?? 0, isCreator: m.id === gap.creatorId })),
  };
}

function weekStart(): Date {
  const now = new Date();
  const tash = new Date(now.getTime() + 5 * 3600_000);
  const day = (tash.getUTCDay() + 6) % 7; // Mon=0
  const start = new Date(Date.UTC(tash.getUTCFullYear(), tash.getUTCMonth(), tash.getUTCDate() - day));
  return new Date(start.getTime() - 5 * 3600_000);
}

/** Monday settle for LAST week: goal met → +500 each, pot +2000 to rotating member. */
export async function settleGapsWeekly(bot: Bot): Promise<void> {
  const wk = weekKey(new Date(Date.now() - 3 * 86_400_000)); // last week's key
  const marker = `gap_settle:${wk}`;
  if (await prisma.appState.findUnique({ where: { key: marker } })) return;
  await prisma.appState.create({ data: { key: marker, value: "running" } }).catch(() => null);

  const lastMon = weekStart();
  const prevMon = new Date(lastMon.getTime() - 7 * 86_400_000);
  const gaps = await prisma.gap.findMany({ include: { members: true } });
  for (const gap of gaps) {
    const ids = gap.members.map((x) => x.memberId);
    if (ids.length < 3) continue; // a gap starts counting from 3 friends
    const rides = await prisma.rideReward.count({ where: { memberId: { in: ids }, createdAt: { gte: prevMon, lt: lastMon } } });
    const goal = Math.ceil(ids.length * 1.5);
    if (rides < goal) continue;
    const ordered = [...gap.members].sort((a, b) => a.id - b.id);
    const potWinner = ordered[gap.potIndex % ordered.length]!;
    for (const gm of gap.members) {
      await grantCoins(gm.memberId, GAP_REWARD_EACH, "gap", `👬 "${gap.name}": haftalik maqsad bajarildi!`, `gap:${gap.id}:${wk}:${gm.memberId}`);
    }
    await grantCoins(potWinner.memberId, GAP_POT, "gap", `👬 "${gap.name}" POTI sizda! 🎉`, `gappot:${gap.id}:${wk}`);
    await prisma.gap.update({ where: { id: gap.id }, data: { potIndex: gap.potIndex + 1 } });
    // tell everyone
    const tus = await prisma.member.findMany({ where: { id: { in: ids } }, include: { telegramUser: true } });
    for (const m of tus) {
      if (!m.telegramUser) continue;
      const isPot = m.id === potWinner.memberId;
      const { pushMessage } = await import("./pushSend"); // BLK-1 (tanga berilgan — force)
      await pushMessage(bot, m.telegramUser.id, "gap_weekly", `👬 <b>"${gap.name}"</b> haftalik maqsadni bajardi (${rides}/${goal} safar)!\n💰 +${GAP_REWARD_EACH} tanga${isPot ? ` va 🏆 GAP POTI: +${GAP_POT} tanga SIZGA!` : ""}`, { memberId: m.id, force: true });
    }
  }
  await prisma.appState.update({ where: { key: marker }, data: { value: "done" } }).catch(() => null);
}
