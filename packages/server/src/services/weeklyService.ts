import {
  JACKPOT_FLOOR,
  LEAGUE_TIERS,
  SCORE_VALUES,
  SURPRISE_PRIZES,
  WEEKLY_PRIZES,
  formatNumber,
  leagueTierIndex,
  type ScoreKind,
  type WeeklyBoardResponse,
  type WeeklyEntry,
} from "@t1067/shared";
import { prisma } from "../db";
import { grantCoins } from "./coinService";
import { dayKey, weekKey } from "./missionService";

/** Push callback — decoupled from grammY so services and tests stay bot-free. */
export type Notify = (telegramId: string, html: string) => Promise<void>;

// ─── score ────────────────────────────────────────────────────────────────────
export async function addScore(memberId: number, kind: ScoreKind): Promise<void> {
  const points = SCORE_VALUES[kind];
  const key = weekKey(new Date());
  await prisma.weeklyScore.upsert({
    where: { memberId_weekKey: { memberId, weekKey: key } },
    create: { memberId, weekKey: key, score: points },
    update: { score: { increment: points } },
  });
}

// Days until next Monday 00:00 Tashkent (when the week closes and pays).
function daysLeft(now = new Date()): number {
  const t = new Date(now.getTime() + 5 * 3600 * 1000);
  const dow = (t.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  return 7 - dow;
}

export async function getWeeklyBoard(myMemberId: number | null, limit = 20): Promise<WeeklyBoardResponse> {
  const key = weekKey(new Date());
  const rows = await prisma.weeklyScore.findMany({
    where: { weekKey: key },
    orderBy: { score: "desc" },
    take: limit,
    include: { member: true },
  });
  const entries: WeeklyEntry[] = rows.map((r, i) => ({
    rank: i + 1,
    memberId: r.memberId,
    fullName: r.member.fullName,
    score: r.score,
    isMe: r.memberId === myMemberId,
    tier: r.member.leagueTier,
  }));

  let me = entries.find((e) => e.isMe) ?? null;
  if (!me && myMemberId) {
    const mine = await prisma.weeklyScore.findUnique({
      where: { memberId_weekKey: { memberId: myMemberId, weekKey: key } },
      include: { member: true },
    });
    if (mine) {
      const higher = await prisma.weeklyScore.count({ where: { weekKey: key, score: { gt: mine.score } } });
      me = { rank: higher + 1, memberId: myMemberId, fullName: mine.member.fullName, score: mine.score, isMe: true, tier: mine.member.leagueTier };
    }
  }

  return { weekKey: key, daysLeft: daysLeft(), prizes: WEEKLY_PRIZES, entries, me };
}

// ─── monday payout ────────────────────────────────────────────────────────────
/**
 * Pay last week's top-3 (real cashback) exactly once. Safe to call on every
 * periodic tick: a paid-marker in AppState short-circuits, grants are idempotent.
 * weekKeyOverride exists for tests (pay a synthetic past week, not the real one).
 */
export async function payWeeklyPrizes(notify: Notify, weekKeyOverride?: string): Promise<number> {
  const prevKey = weekKeyOverride ?? weekKey(new Date(Date.now() - 7 * 24 * 3600 * 1000));
  const marker = `weekly_paid_${prevKey}`;
  if (await prisma.appState.findUnique({ where: { key: marker } })) return 0;

  const top = await prisma.weeklyScore.findMany({
    where: { weekKey: prevKey, score: { gt: 0 } },
    orderBy: { score: "desc" },
    take: WEEKLY_PRIZES.length,
    include: { member: { include: { telegramUser: true } } },
  });

  let paid = 0;
  for (let i = 0; i < top.length; i++) {
    const prize = WEEKLY_PRIZES[i]!;
    const row = top[i]!;
    const g = await grantCoins(
      row.memberId,
      prize.amount,
      "weekly",
      `Haftalik reyting ${prize.medal} (${prevKey})`,
      `weekly:${prevKey}:${row.memberId}`,
    );
    if (g.ok) paid++;
    const chatId = row.member.telegramUser?.id;
    if (chatId) {
      await notify(
        chatId,
        `🏆 <b>Haftalik liga yakunlandi!</b>\n\n` +
          `${prize.medal} Siz <b>${prize.rank}-o'rin</b>ni oldingiz (${row.score} ball)\n` +
          `🪙 Sovg'a: <b>+${formatNumber(prize.amount)} coin</b> hamyoningizga tushdi!\n` +
          `💸 Coin'ni ilovada so'mga aylantirishingiz mumkin.\n\n` +
          `Yangi hafta boshlandi — yana kurashing! 🔥`,
      ).catch(() => undefined);
    }
  }

  await prisma.appState.upsert({ where: { key: marker }, create: { key: marker, value: String(paid) }, update: { value: String(paid) } });
  if (paid) console.log(`[weekly] ${prevKey}: paid ${paid} prizes`);

  await applyTierMovement(prevKey, notify).catch((e) => console.error("[league] tier move failed:", e));
  return paid;
}

/**
 * Duolingo-style promotion/relegation for the closed week: top 30% of actives
 * move up a tier, members who did nothing all week drop one (never below Bronza).
 */
async function applyTierMovement(prevKey: string, notify: Notify): Promise<void> {
  const actives = await prisma.weeklyScore.findMany({
    where: { weekKey: prevKey, score: { gt: 0 } },
    orderBy: { score: "desc" },
    include: { member: { include: { telegramUser: true } } },
  });
  const promoteCount = Math.ceil(actives.length * 0.3);
  const activeIds = new Set(actives.map((a) => a.memberId));

  for (let i = 0; i < actives.length; i++) {
    const m = actives[i]!.member;
    if (i < promoteCount) {
      const idx = leagueTierIndex(m.leagueTier);
      if (idx < LEAGUE_TIERS.length - 1) {
        const next = LEAGUE_TIERS[idx + 1]!;
        await prisma.member.update({ where: { id: m.id }, data: { leagueTier: next.name } });
        if (m.telegramUser) {
          await notify(
            m.telegramUser.id,
            `${next.emoji} <b>Tabriklaymiz — yangi liga!</b>\n\nSiz <b>${next.name}</b> ligasiga ko'tarildingiz! Yangi hafta — yangi kurash 🔥`,
          ).catch(() => undefined);
        }
      }
    }
  }

  // inactives drop one tier (loss aversion — come back or fall)
  const sleepers = await prisma.member.findMany({
    where: { leagueTier: { not: LEAGUE_TIERS[0]!.name }, telegramUser: { isNot: null } },
  });
  for (const m of sleepers) {
    if (activeIds.has(m.id)) continue;
    const idx = leagueTierIndex(m.leagueTier);
    const prev = LEAGUE_TIERS[Math.max(0, idx - 1)]!;
    await prisma.member.update({ where: { id: m.id }, data: { leagueTier: prev.name } });
  }
}

// ─── surprise drops (variable-interval gift) ──────────────────────────────────
function pickSurprise(): number {
  const total = SURPRISE_PRIZES.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  for (const p of SURPRISE_PRIZES) {
    r -= p.weight;
    if (r <= 0) return p.amount;
  }
  return SURPRISE_PRIZES[0]!.amount;
}

/**
 * Random unearned gift to linked users. Called every periodic tick; per-tick
 * probability is tuned so a user averages ~1 drop/week. Hard-capped at one per
 * day per member (idempotency key) and 3 per tick (budget).
 */
export async function maybeSurpriseDrop(notify: Notify, probability = 0.0015): Promise<number> {
  const linked = await prisma.member.findMany({
    where: { telegramUser: { isNot: null } },
    include: { telegramUser: true },
  });
  let dropped = 0;
  const today = dayKey(new Date());
  for (const m of linked) {
    if (dropped >= 3) break;
    if (Math.random() >= probability) continue;
    const amount = pickSurprise();
    const g = await grantCoins(m.id, amount, "surprise", "Kutilmagan sovg'a", `surprise:${m.id}:${today}`);
    if (!g.ok) continue; // already dropped today
    dropped++;
    await notify(
      m.telegramUser!.id,
      `🎁 <b>Kutilmagan sovg'a!</b>\n\n` +
        `🪙 <b>+${formatNumber(amount)} coin</b> — shunchaki siz biz bilan bo'lganingiz uchun 😊\n\n` +
        `Hamyoningiz: /me`,
    ).catch(() => undefined);
  }
  return dropped;
}

// ─── jackpot pool (escalating, global) ────────────────────────────────────────
const JACKPOT_KEY = "jackpot_pool";

export async function getJackpot(): Promise<number> {
  const row = await prisma.appState.findUnique({ where: { key: JACKPOT_KEY } });
  const pool = row ? Number(row.value) || 0 : 0;
  return Math.max(JACKPOT_FLOOR, pool);
}

/** Add to the pool (every spin) and return the new displayed jackpot. */
export async function growJackpot(by: number): Promise<number> {
  const row = await prisma.appState.upsert({
    where: { key: JACKPOT_KEY },
    create: { key: JACKPOT_KEY, value: String(JACKPOT_FLOOR + by) },
    update: { value: String((await getRawPool()) + by) },
  });
  return Math.max(JACKPOT_FLOOR, Number(row.value) || 0);
}

async function getRawPool(): Promise<number> {
  const row = await prisma.appState.findUnique({ where: { key: JACKPOT_KEY } });
  return row ? Number(row.value) || 0 : 0;
}

/** Jackpot won: return the payout and reset the pool to the floor. */
export async function claimJackpot(): Promise<number> {
  const payout = await getJackpot();
  await prisma.appState.upsert({
    where: { key: JACKPOT_KEY },
    create: { key: JACKPOT_KEY, value: String(JACKPOT_FLOOR) },
    update: { value: String(JACKPOT_FLOOR) },
  });
  return payout;
}
