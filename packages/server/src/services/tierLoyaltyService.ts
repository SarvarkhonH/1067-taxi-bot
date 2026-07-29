// 🏅 Tier loyalty loop (feature "tierloyalty", DARK until owner QABUL).
//
// Three honest, flag-gated mechanics — ALL run on the EXISTING booking sweep (no new poller),
// idempotent per UTC+5 day, and a pure no-op when the flag is OFF or the member is a driver:
//   1) markRideActive   — a real ride finish stamps lastActiveDay (decay grace reset). Real-time.
//   2) awardDailyBall    — ≥50% of yesterday's client dailies claimed → +ballHalf (100% → +ballFull).
//   3) applyDecay        — after a grace window of inactivity, ballPoints decays a little each day.
//
// ballPoints is GAME-only XP (decayable); it NEVER touches Member.points (kas cashback so'm) or
// Member.coins. The ≤350 per-ride emission clamp lives entirely in coinService and is untouched here.
import { LEVELS, computeXp, getDailyClientMissions, levelForXp, tierMultFor, type TierBenefitsResponse } from "@t1067/shared";
import type { Bot } from "grammy";
import { prisma } from "../db";
import { getBonusEcon } from "./bonusConfig";
import { featureOn } from "./featureFlags";
import { dayKey } from "./missionService";

/** Build the ladder benefits from LIVE knobs — single source of truth so displayed copy can
 *  never drift from the real per-ride multiplier. Used by GET /api/tier-benefits + the Mini App. */
export async function getTierBenefits(): Promise<TierBenefitsResponse> {
  const econ = await getBonusEcon();
  const tiers = LEVELS.map((l) => {
    const mult = tierMultFor(l.index, econ);
    const multPct = Math.round((mult - 1) * 100);
    return {
      levelIndex: l.index,
      levelName: l.name,
      emoji: l.emoji,
      color: l.color,
      minXp: l.minXp,
      multPct,
      benefitLabel: multPct > 0 ? `+${multPct}% har safar tanga` : "Bazaviy",
    };
  });
  return {
    rules: {
      ballHalf: Math.round(econ.ballHalf ?? 100),
      ballFull: Math.round(econ.ballFull ?? 250),
      decayGraceDays: Math.round(econ.decayGraceDays ?? 7),
      decayPct: Math.round(econ.decayPct ?? 5),
    },
    tiers,
  };
}

/** Idle-days + decay-warning flags for /api/me. Cheap; reads only the passed member fields. */
export async function decayStatus(lastActiveDay: string | null): Promise<{ idleDays: number; decayWarning: boolean }> {
  if (!lastActiveDay) return { idleDays: 0, decayWarning: false };
  const econ = await getBonusEcon();
  const grace = Math.round(econ.decayGraceDays ?? 7);
  const idleDays = Math.max(0, dayDiff(tashkentDayKey(), lastActiveDay));
  return { idleDays, decayWarning: idleDays >= grace };
}

function tashkentDayKey(offsetDays = 0): string {
  return dayKey(new Date(Date.now() + offsetDays * 86400000));
}
/** Whole-day difference a − b for two "YYYY-MM-DD" strings (UTC-parsed; calendar days). */
function dayDiff(a: string, b: string): number {
  const pa = Date.parse(a + "T00:00:00Z");
  const pb = Date.parse(b + "T00:00:00Z");
  if (isNaN(pa) || isNaN(pb)) return 0;
  return Math.round((pa - pb) / 86400000);
}

/** Real-time activity stamp on a confirmed ride finish — resets the decay grace clock.
 *  Flag-gated + forward-only; OFF or driver → no write. Call from the sweep finish block. */
export async function markRideActive(memberId: number, type: string): Promise<void> {
  if (type !== "client") return;
  if (!(await featureOn("tierloyalty"))) return;
  const today = tashkentDayKey();
  await prisma.member.updateMany({
    where: { id: memberId, OR: [{ lastActiveDay: null }, { lastActiveDay: { lt: today } }] },
    data: { lastActiveDay: today },
  }).catch(() => undefined);
}

/** Count of a member's CLAIMED client daily missions on a given day (0..4). */
async function claimedDailyCount(memberId: number, dk: string): Promise<{ claimed: number; total: number }> {
  const codes = getDailyClientMissions(dk).map((d) => d.code);
  if (codes.length === 0) return { claimed: 0, total: 0 };
  const claimed = await prisma.missionProgress.count({
    where: { memberId, periodKey: dk, code: { in: codes }, claimedAt: { not: null } },
  }).catch(() => 0);
  return { claimed, total: codes.length };
}

type SweepMember = {
  id: number;
  type: string;
  ballPoints: number;
  lastActiveDay: string | null;
  decayAppliedDay: string | null;
  telegramUser?: { id: string } | null;
};

// 0.3 sweep-diet: this pass used to run per member per 5-90s SWEEP tick — the dailyball INSERT
// (guaranteed P2002 after the first pass) + 2 claimedDailyCount reads for EVERY client EVERY tick
// was the sweep's single biggest DB cost (~4 queries × N members). It is a DAILY mechanic, so:
// (1) an in-memory day-guard makes repeat same-day calls free (single-instance app — a restart just
// costs one extra pass per member, all DB ops are idempotent anyway), and (2) the call moved off
// the fast sweep onto the 15-min tick (runTierLoyaltyDailyAll below).
let guardDay = "";
const dailyPassDone = new Map<number, string>();
function passDone(memberId: number, today: string): boolean {
  if (guardDay !== today) {
    dailyPassDone.clear(); // day rollover — start fresh
    guardDay = today;
  }
  return dailyPassDone.get(memberId) === today;
}

/** Run the per-member daily tier-loyalty pass (award + decay + warning).
 *  Idempotent per UTC+5 day, OFF-safe, client-only. Never throws to the caller. */
export async function runTierLoyaltyDaily(bot: Bot, m: SweepMember): Promise<void> {
  if (m.type !== "client") return;
  if (passDone(m.id, tashkentDayKey())) return; // in-memory fast path — no DB touched
  if (!(await featureOn("tierloyalty"))) return;
  try {
    const econ = await getBonusEcon();
    const today = tashkentDayKey();
    const yesterday = tashkentDayKey(-1);

    // ── 1) Daily ball award for YESTERDAY (once per member per day, idempotent via AppState) ──
    let lastActive = m.lastActiveDay;
    const claimedTodayP = claimedDailyCount(m.id, today);
    const awardKey = `dailyball:${m.id}:${yesterday}`;
    let didAward = false;
    try {
      await prisma.appState.create({ data: { key: awardKey, value: "1" } }); // throws if already done
      didAward = true;
    } catch {
      /* already processed yesterday for this member */
    }
    const [yc, tc] = await Promise.all([claimedDailyCount(m.id, yesterday), claimedTodayP]);
    // activity backfill from mission claims (rides are stamped live by markRideActive)
    if (tc.claimed >= 1 && (!lastActive || lastActive < today)) lastActive = today;
    else if (yc.claimed >= 1 && (!lastActive || lastActive < yesterday)) lastActive = yesterday;

    if (didAward && yc.total > 0) {
      const ratio = yc.claimed / yc.total;
      const award = yc.claimed >= yc.total ? (econ.ballFull ?? 250) : ratio >= 0.5 ? (econ.ballHalf ?? 100) : 0;
      if (award > 0) {
        await prisma.member.update({ where: { id: m.id }, data: { ballPoints: { increment: award } } }).catch(() => undefined);
        m.ballPoints += award;
      }
    }
    // persist any activity backfill before decay reads it
    if (lastActive && lastActive !== m.lastActiveDay) {
      await prisma.member.updateMany({ where: { id: m.id, OR: [{ lastActiveDay: null }, { lastActiveDay: { lt: lastActive } }] }, data: { lastActiveDay: lastActive } }).catch(() => undefined);
      m.lastActiveDay = lastActive;
    }

    // ── 2) Decay (once per UTC+5 day, anti-yo-yo via decayAppliedDay) ──
    if (m.decayAppliedDay === today) {
      dailyPassDone.set(m.id, today); // fully processed today → all later calls are in-memory no-ops
      return;
    }
    if (!m.lastActiveDay) {
      // first sighting under the flag → treat as active today, no decay (fair fresh start)
      await prisma.member.update({ where: { id: m.id }, data: { lastActiveDay: today } }).catch(() => undefined);
      dailyPassDone.set(m.id, today);
      return;
    }
    const grace = Math.round(econ.decayGraceDays ?? 7);
    const pct = econ.decayPct ?? 5;
    const floor = Math.round(econ.decayFloor ?? 0);
    const idle = dayDiff(today, m.lastActiveDay);

    // warning on the last grace day and again 3 days into decay (≤1 push/day via NotifyLog)
    if ((idle === grace || idle === grace + 3) && m.telegramUser?.id) await sendDecayWarning(bot, m, idle, grace, today);

    if (idle > grace && pct > 0 && m.ballPoints > floor) {
      const next = Math.max(floor, Math.floor(m.ballPoints * (1 - pct / 100)));
      await prisma.member.update({ where: { id: m.id }, data: { ballPoints: next, decayAppliedDay: today } }).catch(() => undefined);
    } else {
      // stamp the day even when nothing decayed, so we don't re-evaluate every 90s tick
      await prisma.member.update({ where: { id: m.id }, data: { decayAppliedDay: today } }).catch(() => undefined);
    }
    dailyPassDone.set(m.id, today);
  } catch (e) {
    console.error(`[tierloyalty] m${m.id} daily pass failed:`, e instanceof Error ? e.message.split("\n")[0] : e);
  }
}

async function sendDecayWarning(bot: Bot, m: SweepMember, idle: number, grace: number, today: string): Promise<void> {
  // 📵 BLK-1: blokni marker yozishdan OLDIN tekshiramiz (notifyService.trySend naqshi)
  const { isBlocked, pushMessage } = await import("./pushSend");
  if (await isBlocked(m.telegramUser!.id)) return;
  try {
    await prisma.notifyLog.create({ data: { memberId: m.id, kind: "decay_warn", dayKey: today } });
  } catch {
    return; // already warned today
  }
  const lvl = levelForXp(computeXp({ points: 0, trips: 0, ballPoints: m.ballPoints })).level; // ball-only tier label for the nudge
  const chatId = m.telegramUser!.id;
  const html = idle <= grace
    ? `⚠️ <b>Darajangiz xavf ostida!</b>\n\nSiz so'nggi ${grace} kun 1067'da faol bo'lmadingiz.\nErtadan boshlab ballingiz yechila boshlaydi.\n\nBugun bitta vazifa bajaring yoki safar qiling — darajangizni saqlang! 🚕`
    : `📉 <b>Ball yechilmoqda!</b>\n\nSiz ${idle} kun faol bo'lmadingiz.\nHozirgi ball: <b>${m.ballPoints.toLocaleString("ru-RU")}</b> ${lvl.emoji}\nBir safar yoki bitta vazifa — yetarli! 🚕`;
  await pushMessage(bot, chatId, "decay_warn", html, { memberId: m.id, prechecked: true });
}

/** 0.3 sweep-diet: the daily pass over ALL clients, moved OFF the fast booking sweep onto the
 *  15-min periodic tick (a daily mechanic needs no 5s cadence). First tick of the day does the real
 *  DB work; every later tick is an in-memory no-op per member (passDone guard). Paged so a large
 *  member table never loads at once. */
export async function runTierLoyaltyDailyAll(bot: Bot): Promise<void> {
  if (!(await featureOn("tierloyalty"))) return;
  let cursor = 0;
  for (;;) {
    const page = await prisma.member.findMany({
      where: { id: { gt: cursor }, type: "client", telegramUser: { isNot: null } },
      select: { id: true, type: true, ballPoints: true, lastActiveDay: true, decayAppliedDay: true, telegramUser: { select: { id: true } } },
      orderBy: { id: "asc" },
      take: 500,
    });
    if (page.length === 0) return;
    cursor = page[page.length - 1]!.id;
    for (const m of page) await runTierLoyaltyDaily(bot, m);
  }
}
