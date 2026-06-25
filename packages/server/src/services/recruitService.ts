// 🚖 Driver-recruiter: in-car QR (t.me/bot?start=drv_<driverMemberId>).
// All payouts fire ONLY on completed rides (scan/signup = 0). M-Pesa split
// commission + capped time-limited revshare (100/ride months 1-6 → 25/ride
// veteran, weekly-active driver only, 30k/month cap, 15 recruits/month).
import { prisma } from "../db";
import { grantCoins } from "./coinService";
import { REFEREE_REWARD } from "./referralService";
import { getBonusEcon } from "./bonusConfig";

const RECRUIT_MONTHLY_CAP = 15; // new recruits per driver per month
const REVSHARE_FRESH = 100; // coins/ride, first 6 months
const REVSHARE_VETERAN = 25; // after 6 months, forever (activity-gated)
const REVSHARE_MONTH_CAP = 30000; // per driver per month
const SIX_MONTHS = 183 * 24 * 3600 * 1000;
const RECRUIT_WELCOME = REFEREE_REWARD; // the recruited CUSTOMER's first-ride welcome bonus — same single source as referee/welcome
// 🚖 driver→driver recruit: a driver brings a NEW DRIVER. The recruiter earns the milestone once the
// recruited driver proves real+active by completing DRIVER_RECRUIT_RIDES rides AS A DRIVER.
const DRIVER_RECRUIT_MILESTONE = 5000; // tanga to the recruiter
const DRIVER_RECRUIT_RIDES = 10; // recruited driver's completed rides that unlock it
const DRIVER_RECRUIT_MONTHLY_CAP = 10; // paid driver-recruits per recruiter per month (anti-abuse)

function norm9(p: string): string {
  return p.replace(/\D/g, "").slice(-9);
}

/**
 * Capture a drv_ deep-link for a FRESH user (no payout yet). Returns whether it
 * actually attached + the driver's telegram id, so the caller can give the driver
 * the immediate "someone joined via your QR" feedback (the signal that was missing).
 */
export async function attachDriverRecruit(
  riderTelegramId: string,
  driverMemberId: number,
): Promise<{ attached: boolean; driverTelegramId?: string; startReward?: number }> {
  const tu = await prisma.telegramUser.findUnique({ where: { id: riderTelegramId } });
  if (tu?.memberId || tu?.referredByCode) return { attached: false }; // only brand-new users
  const driver = await prisma.member.findUnique({ where: { id: driverMemberId }, select: { type: true } });
  if (driver?.type !== "driver") return { attached: false };
  await prisma.telegramUser.upsert({
    where: { id: riderTelegramId },
    create: { id: riderTelegramId, referredByCode: `drv_${driverMemberId}` },
    update: { referredByCode: `drv_${driverMemberId}` },
  });
  const drvTu = await prisma.telegramUser.findFirst({ where: { memberId: driverMemberId }, select: { id: true } });
  // 🚖 STAGED (drvstaged): the driver earns the moment their passenger presses START. Idempotent per
  // rider Telegram id (drv_start:<id>) — re-scans no-op (referredByCode is now set → attach returns
  // early above). Legacy mode (flag OFF) pays nothing here (driver paid on the rider's rides instead).
  let startReward = 0;
  try {
    const { featureOn } = await import("./featureFlags");
    if (await featureOn("drvstaged")) {
      const amt = (await getBonusEcon()).drvStart ?? 0;
      if (amt > 0) {
        const g = await grantCoins(driverMemberId, amt, "recruit", "🚖 QR: yangi mijoz qo'shildi", `drv_start:${riderTelegramId}`);
        if (g.ok) startReward = amt;
      }
    }
  } catch {
    /* start-bonus is best-effort; never block the attach (the recruit is already recorded) */
  }
  return { attached: true, driverTelegramId: drvTu?.id, startReward };
}

/**
 * 🚖 STAGED driver-QR: when a QR-recruited rider LINKS their phone, the driver earns drvShare (once).
 * Idempotent (drv_share:<riderTg>), self/family phone-deduped, gated by drvstaged. Returns the driver's
 * telegram id + the amount so the caller can notify the driver. No-op for non-drv_ codes / legacy mode.
 */
export async function completeDriverRecruitShare(
  riderTelegramId: string,
  riderMemberId: number,
): Promise<{ driverTelegramId?: string; shareReward: number } | null> {
  const { featureOn } = await import("./featureFlags");
  if (!(await featureOn("drvstaged"))) return null;
  const tu = await prisma.telegramUser.findUnique({ where: { id: riderTelegramId }, select: { referredByCode: true } });
  const code = tu?.referredByCode ?? "";
  if (!code.startsWith("drv_") || code.startsWith("drvdrv_")) return null; // client-recruit only (not driver→driver)
  const driverId = Number(code.slice(4));
  if (!Number.isFinite(driverId)) return null;
  const driver = await prisma.member.findUnique({ where: { id: driverId }, select: { type: true, phone: true } });
  if (!driver || driver.type !== "driver") return null;
  const rider = await prisma.member.findUnique({ where: { id: riderMemberId }, select: { phone: true } });
  if (rider?.phone && driver.phone && norm9(rider.phone) === norm9(driver.phone)) return null; // self/family
  const amt = (await getBonusEcon()).drvShare ?? 0;
  let shareReward = 0;
  if (amt > 0) {
    const g = await grantCoins(driverId, amt, "recruit", "🚖 QR: mijozingiz raqamini uladi", `drv_share:${riderTelegramId}`);
    if (g.ok) shareReward = amt;
  }
  const drvTu = await prisma.telegramUser.findFirst({ where: { memberId: driverId }, select: { id: true } });
  return { driverTelegramId: drvTu?.id, shareReward };
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
  if (!code.startsWith("drv_") || code.startsWith("drvdrv_")) return; // drvdrv_ = driver→driver link, NOT a client recruit
  const econ = await getBonusEcon();
  const staged = await featureOn("drvstaged");
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
    // P0 (QA fleet): riderMemberId is @unique — two concurrent first-rides could both pass
    // the findUnique(null) above and double-create (→ double 500 grant on distinct ids).
    // Catch P2002 and re-read so exactly one recruit row exists; recruit1 grant is then
    // idempotent by recruit.id even if both racers reach it.
    try {
      recruit = await prisma.driverRecruit.create({ data: { driverId, riderMemberId } });
    } catch (e) {
      if ((e as { code?: string } | null)?.code !== "P2002") throw e;
      recruit = await prisma.driverRecruit.findUnique({ where: { riderMemberId } });
      if (!recruit) throw e;
    }
    // LEGACY pays the driver 500 + the client's 5000 welcome HERE on ride #1. STAGED (drvstaged) pays the
    // driver earlier (drv_start/drv_share) → skip the driver 500 here. The client's 5000 is paid on JOIN in
    // staged mode (grantJoinWelcome) — but ONLY when welcomebonus is ON; if it's OFF, fall back to paying it
    // here so the recruited client is NEVER left with nothing (mirrors the ref_ staged fallback).
    if (!staged) {
      await grantCoins(driverId, econ.recruitFirst ?? 500, "recruit", "🚖 QR: yangi mijozingiz birinchi safarini qildi", `recruit1:${recruit.id}`);
    }
    const clientPaidOnJoin = staged && (await featureOn("welcomebonus"));
    if (!clientPaidOnJoin) {
      // 🎁 the recruited CUSTOMER's first-ride welcome (OUTSIDE the per-ride clamp), idempotent per recruit.
      await grantCoins(riderMemberId, econ.firstRide ?? RECRUIT_WELCOME, "referral", "🎁 QR orqali qo'shildingiz — birinchi safar sovg'asi!", `recruit_welcome:${recruit.id}`);
    }
  }
  if (!staged && rideCount >= 3) {
    // legacy ride#3 bonus; STAGED replaces it with the driver's upfront drvStart + drvShare.
    await grantCoins(driverId, econ.recruit3 ?? 1000, "recruit", "🚖 QR: mijozingiz 3-safarini qildi", `recruit3:${recruit.id}`);
  }

  // activity gate: driver completed ≥1 ride this week (tier job keeps tiers;
  // cheapest live signal = any driver_bonus/quest progress this week)
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const active = await prisma.coinTxn.findFirst({ where: { memberId: driverId, kind: "driver_bonus", createdAt: { gte: weekAgo } } });
  if (!active) return;

  // fresh-rate window: STAGED uses the revshareMonths knob (default 1mo); legacy keeps the 6-month window.
  const freshWindowMs = staged ? (econ.revshareMonths ?? 1) * 30 * 24 * 3600 * 1000 : SIX_MONTHS;
  const rate = Date.now() - recruit.createdAt.getTime() < freshWindowMs ? (econ.revshareFresh ?? REVSHARE_FRESH) : (econ.revshareVeteran ?? REVSHARE_VETERAN);
  const monthAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const monthSum = await prisma.coinTxn.aggregate({
    where: { memberId: driverId, kind: "revshare", createdAt: { gte: monthAgo } },
    _sum: { amount: true },
  });
  if ((monthSum._sum.amount ?? 0) + rate > (econ.revshareMonthCap ?? REVSHARE_MONTH_CAP)) return;
  await grantCoins(driverId, rate, "revshare", "🚖 QR-mijozingiz safari", `rev:${recruit.id}:${bookingId}`);
}

/** Driver's OWN recruit panel: counts, QR earnings, and remaining monthly room. */
export async function driverRecruitStats(driverId: number): Promise<{
  recruits: number;
  recruitsThisMonth: number;
  pendingRecruits: number;
  earnedTotal: number;
  earnedThisMonth: number;
  revshareCapLeft: number;
  newRecruitCapLeft: number;
}> {
  const monthAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const [recruits, recruitsThisMonth, scanned, earnedTotal, earnedMonth, revMonth] = await Promise.all([
    prisma.driverRecruit.count({ where: { driverId } }),
    prisma.driverRecruit.count({ where: { driverId, createdAt: { gte: monthAgo } } }),
    prisma.telegramUser.count({ where: { referredByCode: `drv_${driverId}` } }),
    prisma.coinTxn.aggregate({ where: { memberId: driverId, kind: { in: ["recruit", "revshare"] } }, _sum: { amount: true } }),
    prisma.coinTxn.aggregate({ where: { memberId: driverId, kind: { in: ["recruit", "revshare"] }, createdAt: { gte: monthAgo } }, _sum: { amount: true } }),
    prisma.coinTxn.aggregate({ where: { memberId: driverId, kind: "revshare", createdAt: { gte: monthAgo } }, _sum: { amount: true } }),
  ]);
  return {
    recruits,
    recruitsThisMonth,
    // scanned the QR but no completed first ride yet (not yet a materialized recruit)
    pendingRecruits: Math.max(0, scanned - recruits),
    earnedTotal: Math.round(earnedTotal._sum.amount ?? 0),
    earnedThisMonth: Math.round(earnedMonth._sum.amount ?? 0),
    revshareCapLeft: Math.max(0, REVSHARE_MONTH_CAP - (revMonth._sum.amount ?? 0)),
    newRecruitCapLeft: Math.max(0, RECRUIT_MONTHLY_CAP - recruitsThisMonth),
  };
}

/** The driver's personal in-car QR deep-link (passenger scans → driver earns). */
export function driverQrLink(driverMemberId: number): string {
  const user = process.env.BOT_USERNAME || "koson1067bot";
  return `https://t.me/${user}?start=drv_${driverMemberId}`;
}

/** 🚖 A driver's "recruit another DRIVER" deep-link (a NEW driver joins via this → recruiter earns
 *  5000 once that driver completes 10 rides). Distinct prefix `drvdrv_` from the client QR `drv_`. */
export function driverRecruitQrLink(driverMemberId: number): string {
  const user = process.env.BOT_USERNAME || "koson1067bot";
  return `https://t.me/${user}?start=drvdrv_${driverMemberId}`;
}

/** Capture a drvdrv_ deep-link for a FRESH user (brand-new only). Returns the recruiter's telegram id
 *  so the caller can give the "a driver candidate joined via your link" feedback. Payout happens later,
 *  only after the recruited person becomes a driver and completes 10 rides. */
export async function attachDriverDriverRecruit(
  newTelegramId: string,
  recruiterDriverId: number,
): Promise<{ attached: boolean; recruiterTelegramId?: string }> {
  const tu = await prisma.telegramUser.findUnique({ where: { id: newTelegramId } });
  if (tu?.memberId || tu?.referredByCode) return { attached: false }; // only brand-new users
  const recruiter = await prisma.member.findUnique({ where: { id: recruiterDriverId }, select: { type: true } });
  if (recruiter?.type !== "driver") return { attached: false };
  await prisma.telegramUser.upsert({
    where: { id: newTelegramId },
    create: { id: newTelegramId, referredByCode: `drvdrv_${recruiterDriverId}` },
    update: { referredByCode: `drvdrv_${recruiterDriverId}` },
  });
  const rTu = await prisma.telegramUser.findFirst({ where: { memberId: recruiterDriverId }, select: { id: true } });
  return { attached: true, recruiterTelegramId: rTu?.id };
}

/**
 * On a recruited DRIVER's completed rides (called from the sweep with the driver who drove THIS ride):
 * count toward the 10-ride milestone and, on the 10th, pay the recruiter 5000 — once. Gated by the
 * "drvrecruit" flag. Idempotent: a per-booking AppState marker counts rides (so re-sweeps never
 * double-count and only POST-recruit rides count); the payout key `drvdrv_milestone:<newDriverId>`
 * blocks any double-pay. Self/family-recruit blocked by phone last-9. Monthly cap per recruiter.
 */
export async function payDriverRecruitMilestone(
  newDriverId: number,
  bookingId: number,
): Promise<{ paid: boolean; recruiterTelegramId?: string; amount?: number }> {
  const { featureOn } = await import("./featureFlags");
  if (!(await featureOn("drvrecruit"))) return { paid: false };
  const econ = await getBonusEcon();
  const rideTarget = econ.drvRides ?? DRIVER_RECRUIT_RIDES;
  const tu = await prisma.telegramUser.findFirst({ where: { memberId: newDriverId } });
  const code = tu?.referredByCode ?? "";
  if (!code.startsWith("drvdrv_")) return { paid: false };
  const recruiterId = Number(code.slice(7));
  if (!Number.isFinite(recruiterId) || recruiterId === newDriverId) return { paid: false };
  // already paid for this recruited driver?
  if (await prisma.coinTxn.findUnique({ where: { idempotencyKey: `drvdrv_milestone:${newDriverId}` } }).catch(() => null)) return { paid: false };
  const recruiter = await prisma.member.findUnique({ where: { id: recruiterId }, select: { id: true, type: true, phone: true } });
  if (!recruiter || recruiter.type !== "driver") return { paid: false };
  const nd = await prisma.member.findUnique({ where: { id: newDriverId }, select: { phone: true } });
  if (nd?.phone && recruiter.phone && norm9(nd.phone) === norm9(recruiter.phone)) return { paid: false }; // self/family
  // count this recruited driver's rides via a durable, idempotent per-booking marker
  await prisma.appState.create({ data: { key: `drvdrvride:${newDriverId}:${bookingId}`, value: "1" } }).catch(() => undefined);
  const rides = await prisma.appState.count({ where: { key: { startsWith: `drvdrvride:${newDriverId}:` } } });
  if (rides < rideTarget) return { paid: false };
  // monthly cap on PAID driver-recruits per recruiter
  const monthAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const paidThisMonth = await prisma.coinTxn.count({ where: { memberId: recruiterId, kind: "drvrecruit", createdAt: { gte: monthAgo } } });
  if (paidThisMonth >= DRIVER_RECRUIT_MONTHLY_CAP) return { paid: false };
  const milestone = econ.drvMilestone ?? DRIVER_RECRUIT_MILESTONE;
  if (milestone <= 0) return { paid: false };
  const g = await grantCoins(recruiterId, milestone, "drvrecruit", `🚖 Olib kelgan haydovchingiz ${rideTarget} ta safar qildi!`, `drvdrv_milestone:${newDriverId}`);
  if (!g.ok) return { paid: false };
  const rTu = await prisma.telegramUser.findFirst({ where: { memberId: recruiterId }, select: { id: true } });
  return { paid: true, recruiterTelegramId: rTu?.id, amount: milestone };
}

/** Admin: per-driver QR funnel — scanned (QR opened) → joined (linked phone) → rode (≥1 ride) + money.
 *  Scan-based (not driverRecruit-row based) so STAGED drivers who earned on scan/share BEFORE any ride
 *  still show up. drvdrv_ (driver→driver) is excluded — this is the client-QR funnel only. */
export async function recruitStats(): Promise<{ driverId: number; fullName: string; scanned: number; joined: number; rode: number; earned: number }[]> {
  const scans = await prisma.telegramUser.findMany({
    where: { referredByCode: { startsWith: "drv_" } },
    select: { referredByCode: true, memberId: true },
  });
  const byDriver = new Map<number, { scanned: number; joined: number }>();
  for (const s of scans) {
    const code = s.referredByCode ?? "";
    if (code.startsWith("drvdrv_")) continue; // driver→driver recruit, not a client QR
    const id = Number(code.slice(4));
    if (!Number.isFinite(id)) continue;
    const cur = byDriver.get(id) ?? { scanned: 0, joined: 0 };
    cur.scanned++;
    if (s.memberId) cur.joined++;
    byDriver.set(id, cur);
  }
  const out: { driverId: number; fullName: string; scanned: number; joined: number; rode: number; earned: number }[] = [];
  for (const [driverId, c] of byDriver) {
    const [m, rode, earned] = await Promise.all([
      prisma.member.findUnique({ where: { id: driverId }, select: { fullName: true } }),
      prisma.driverRecruit.count({ where: { driverId } }),
      prisma.coinTxn.aggregate({ where: { memberId: driverId, kind: { in: ["recruit", "revshare"] } }, _sum: { amount: true } }),
    ]);
    out.push({ driverId, fullName: m?.fullName ?? "?", scanned: c.scanned, joined: c.joined, rode, earned: Math.round(earned._sum.amount ?? 0) });
  }
  return out.sort((a, b) => b.earned - a.earned).slice(0, 100);
}

/** Admin drill-down: a single driver's recruited clients (who scanned/joined/rode) + money breakdown
 *  by stage (drv_start / drv_share / revshare / legacy recruit). Lets the owner monitor & control. */
export async function recruitDetail(driverId: number): Promise<{
  driverId: number;
  fullName: string;
  clients: { name: string; phone: string; status: "scanned" | "joined" | "rode"; rides: number }[];
  earned: { start: number; share: number; revshare: number; legacy: number; total: number };
}> {
  const driver = await prisma.member.findUnique({ where: { id: driverId }, select: { fullName: true } });
  const scans = await prisma.telegramUser.findMany({ where: { referredByCode: `drv_${driverId}` }, select: { memberId: true } });
  const clients: { name: string; phone: string; status: "scanned" | "joined" | "rode"; rides: number }[] = [];
  for (const s of scans) {
    if (!s.memberId) {
      clients.push({ name: "—", phone: "—", status: "scanned", rides: 0 });
      continue;
    }
    const [m, rides] = await Promise.all([
      prisma.member.findUnique({ where: { id: s.memberId }, select: { fullName: true, phone: true } }),
      prisma.rideReward.count({ where: { memberId: s.memberId } }),
    ]);
    clients.push({ name: m?.fullName ?? "—", phone: m?.phone ?? "—", status: rides > 0 ? "rode" : "joined", rides });
  }
  const txns = await prisma.coinTxn.findMany({
    where: { memberId: driverId, kind: { in: ["recruit", "revshare"] } },
    select: { amount: true, idempotencyKey: true },
  });
  let start = 0, share = 0, revshare = 0, legacy = 0;
  for (const t of txns) {
    const k = t.idempotencyKey ?? "";
    if (k.startsWith("drv_start:")) start += t.amount;
    else if (k.startsWith("drv_share:")) share += t.amount;
    else if (k.startsWith("rev:")) revshare += t.amount;
    else legacy += t.amount; // recruit1 / recruit3
  }
  return {
    driverId,
    fullName: driver?.fullName ?? "?",
    clients: clients.sort((a, b) => b.rides - a.rides),
    earned: { start, share, revshare, legacy, total: start + share + revshare + legacy },
  };
}
