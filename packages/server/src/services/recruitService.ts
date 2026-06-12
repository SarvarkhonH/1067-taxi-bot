// 🚖 Driver-recruiter: in-car QR (t.me/bot?start=drv_<driverMemberId>).
// All payouts fire ONLY on completed rides (scan/signup = 0). M-Pesa split
// commission + capped time-limited revshare (100/ride months 1-6 → 25/ride
// veteran, weekly-active driver only, 30k/month cap, 15 recruits/month).
import { prisma } from "../db";
import { grantCoins } from "./coinService";

const RECRUIT_MONTHLY_CAP = 15; // new recruits per driver per month
const REVSHARE_FRESH = 100; // coins/ride, first 6 months
const REVSHARE_VETERAN = 25; // after 6 months, forever (activity-gated)
const REVSHARE_MONTH_CAP = 30000; // per driver per month
const SIX_MONTHS = 183 * 24 * 3600 * 1000;

function norm9(p: string): string {
  return p.replace(/\D/g, "").slice(-9);
}

/** Capture a drv_ deep-link for a FRESH user (no payout yet). */
export async function attachDriverRecruit(riderTelegramId: string, driverMemberId: number): Promise<void> {
  const tu = await prisma.telegramUser.findUnique({ where: { id: riderTelegramId } });
  if (tu?.memberId || tu?.referredByCode) return; // only brand-new users
  const driver = await prisma.member.findUnique({ where: { id: driverMemberId }, select: { type: true } });
  if (driver?.type !== "driver") return;
  await prisma.telegramUser.upsert({
    where: { id: riderTelegramId },
    create: { id: riderTelegramId, referredByCode: `drv_${driverMemberId}` },
    update: { referredByCode: `drv_${driverMemberId}` },
  });
}

/**
 * On a recruited rider's completed rides: ride #1 creates the recruit row and
 * pays the driver 500; ride #3 pays +1000 (split commission); every ride pays
 * the revshare (rate by recruit age, weekly-active gate, monthly cap).
 */
export async function payRecruitRevshare(riderMemberId: number, bookingId: number): Promise<void> {
  const { featureOn } = await import("./featureFlags");
  if (!(await featureOn("recruit"))) return;
  const tu = await prisma.telegramUser.findFirst({ where: { memberId: riderMemberId } });
  const code = tu?.referredByCode ?? "";
  if (!code.startsWith("drv_")) return;
  const driverId = Number(code.slice(4));
  if (!Number.isFinite(driverId)) return;
  const driver = await prisma.member.findUnique({ where: { id: driverId }, select: { id: true, type: true, phone: true } });
  if (!driver || driver.type !== "driver") return;
  // self/family dedup by phone last-9
  const rider = await prisma.member.findUnique({ where: { id: riderMemberId }, select: { phone: true } });
  if (rider?.phone && driver.phone && norm9(rider.phone) === norm9(driver.phone)) return;

  let recruit = await prisma.driverRecruit.findUnique({ where: { riderMemberId } });
  const rideCount = await prisma.rideReward.count({ where: { memberId: riderMemberId } });

  if (!recruit) {
    // monthly recruit cap (15 new riders / driver / month)
    const monthAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const newThisMonth = await prisma.driverRecruit.count({ where: { driverId, createdAt: { gte: monthAgo } } });
    if (newThisMonth >= RECRUIT_MONTHLY_CAP) return;
    recruit = await prisma.driverRecruit.create({ data: { driverId, riderMemberId } });
    await grantCoins(driverId, 500, "recruit", "🚖 QR: yangi mijozingiz birinchi safarini qildi", `recruit1:${recruit.id}`);
  }
  if (rideCount >= 3) {
    await grantCoins(driverId, 1000, "recruit", "🚖 QR: mijozingiz 3-safarini qildi", `recruit3:${recruit.id}`);
  }

  // activity gate: driver completed ≥1 ride this week (tier job keeps tiers;
  // cheapest live signal = any driver_bonus/quest progress this week)
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const active = await prisma.coinTxn.findFirst({ where: { memberId: driverId, kind: "driver_bonus", createdAt: { gte: weekAgo } } });
  if (!active) return;

  const rate = Date.now() - recruit.createdAt.getTime() < SIX_MONTHS ? REVSHARE_FRESH : REVSHARE_VETERAN;
  const monthAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const monthSum = await prisma.coinTxn.aggregate({
    where: { memberId: driverId, kind: "revshare", createdAt: { gte: monthAgo } },
    _sum: { amount: true },
  });
  if ((monthSum._sum.amount ?? 0) + rate > REVSHARE_MONTH_CAP) return;
  await grantCoins(driverId, rate, "revshare", "🚖 QR-mijozingiz safari", `rev:${recruit.id}:${bookingId}`);
}

/** Admin: per-driver recruit leaderboard. */
export async function recruitStats(): Promise<{ driverId: number; fullName: string; recruits: number; earned: number }[]> {
  const rows = await prisma.driverRecruit.groupBy({ by: ["driverId"], _count: { id: true } });
  const out: { driverId: number; fullName: string; recruits: number; earned: number }[] = [];
  for (const r of rows) {
    const m = await prisma.member.findUnique({ where: { id: r.driverId }, select: { fullName: true } });
    const earned = await prisma.coinTxn.aggregate({
      where: { memberId: r.driverId, kind: { in: ["recruit", "revshare"] } },
      _sum: { amount: true },
    });
    out.push({ driverId: r.driverId, fullName: m?.fullName ?? "?", recruits: r._count.id, earned: Math.round(earned._sum.amount ?? 0) });
  }
  return out.sort((a, b) => b.recruits - a.recruits).slice(0, 50);
}
