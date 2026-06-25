import crypto from "node:crypto";
import type { ReferralResponse } from "@t1067/shared";
import { prisma } from "../db";
import { env } from "../env";
import { grantCoins } from "./coinService";
import { incrementMission } from "./missionService";
import { getBonusEcon } from "./bonusConfig";

// Double-sided reward (so'm). Tuned so a paid invite stays well under LTV.
export const REFERRER_REWARD = 1500; // inviter — paid when the friend completes a real ride
// The new rider's first-ride bonus — the SINGLE source for ALL first-ride flows (welcome, referee,
// recruit). 5000 = exactly one Koson base fare (boshlanish 5000 so'm) → the first ride is FREE.
export const REFEREE_REWARD = 5000; // the friend — ALSO paid on their first real ride

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I ambiguity
function genCode(len = 6): string {
  const b = crypto.randomBytes(len);
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHABET[b[i]! % ALPHABET.length];
  return s;
}

function inviteLink(code: string): string {
  return `https://t.me/${env.BOT_USERNAME}?start=ref_${code}`;
}

/** Get (or lazily create) this user's personal invite code. */
export async function getOrCreateCode(telegramId: string): Promise<string> {
  const tu = await prisma.telegramUser.findUnique({ where: { id: telegramId } });
  if (tu?.referralCode) return tu.referralCode;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = genCode();
    try {
      await prisma.telegramUser.upsert({
        where: { id: telegramId },
        create: { id: telegramId, referralCode: code },
        update: { referralCode: code },
      });
      return code;
    } catch {
      // unique collision — retry with a fresh code
    }
  }
  throw new Error("could not allocate referral code");
}

export async function getReferralInfo(telegramId: string): Promise<ReferralResponse> {
  const code = await getOrCreateCode(telegramId);
  const refs = await prisma.referral.findMany({ where: { referrerId: telegramId } });
  const econ = await getBonusEcon();
  const { featureOn } = await import("./featureFlags");
  const staged = await featureOn("refstaged");
  // Per-friend total the inviter can earn: staged = 3 stages summed; legacy = single on-ride reward.
  const perFriend = staged
    ? (econ.refStart ?? 0) + (econ.refShare ?? 0) + (econ.refRide ?? 0)
    : (econ.referrer ?? REFERRER_REWARD);
  // Earned: staged grants land immediately as CoinTxns (ref_start/ref_share/ref_ride keys) — sum the
  // REAL received tanga so the screen matches the wallet. Legacy stays row-based (promised-on-ride).
  let earned = refs.reduce((s, r) => s + r.rewardReferrer, 0);
  if (staged) {
    const tu = await prisma.telegramUser.findUnique({ where: { id: telegramId }, select: { memberId: true } });
    if (tu?.memberId) {
      const agg = await prisma.coinTxn.aggregate({
        where: {
          memberId: tu.memberId,
          OR: [
            { idempotencyKey: { startsWith: "ref_start:" } },
            { idempotencyKey: { startsWith: "ref_share:" } },
            { idempotencyKey: { startsWith: "ref_ride:" } },
          ],
        },
        _sum: { amount: true },
      });
      earned = agg._sum.amount ?? 0;
    }
  }
  return {
    code,
    link: inviteLink(code),
    invited: refs.length,
    earned,
    rewardReferrer: perFriend,
    rewardReferee: econ.firstRide ?? REFEREE_REWARD,
  };
}

/**
 * Capture a pending invite when a NEW user opens the bot via a ref link. Returns the
 * referrer's telegram id when it actually attaches, so the caller can tell the inviter
 * "you invited <them>" the moment their link is clicked. No-ops (attached:false) for
 * self-invites, unknown codes, or users who already joined/were credited.
 */
export async function attachPendingReferral(
  refereeTelegramId: string,
  code: string,
): Promise<{ attached: boolean; referrerTelegramId?: string; startReward?: number }> {
  const referee = await prisma.telegramUser.findUnique({ where: { id: refereeTelegramId } });
  if (referee?.memberId || referee?.referralCreditedAt || referee?.referredByCode) return { attached: false }; // only fresh users

  const referrer = await prisma.telegramUser.findUnique({ where: { referralCode: code } });
  if (!referrer || referrer.id === refereeTelegramId) return { attached: false };

  await prisma.telegramUser.update({ where: { id: refereeTelegramId }, data: { referredByCode: code } });

  // 👥 STAGED (refstaged flag): the inviter earns the moment their friend presses START. Idempotent
  // per referee Telegram id (ref_start:<id>) — re-clicks no-op because referredByCode is now set, so
  // attach returns early above. Paid only when the inviter is a linked member + the refStart knob > 0.
  // Legacy mode (flag OFF) pays nothing here — both sides still unlock on the friend's first ride.
  let startReward = 0;
  try {
    const { featureOn } = await import("./featureFlags");
    if (referrer.memberId && (await featureOn("refstaged"))) {
      const amt = (await getBonusEcon()).refStart ?? 0;
      if (amt > 0) {
        const g = await grantCoins(referrer.memberId, amt, "referral", "👥 Do'stingiz qo'shildi — taklif sovg'asi", `ref_start:${refereeTelegramId}`);
        if (g.ok) startReward = amt;
      }
    }
  } catch {
    /* start-bonus is best-effort; never block the attach (the referral is already recorded) */
  }
  return { attached: true, referrerTelegramId: referrer.id, startReward };
}

export interface ReferralCredit {
  referrerTelegramId: string;
  referrerMemberId: number | null;
  refereeReward: number; // friend's reward promised ON FIRST RIDE (legacy 5000; staged 0 → got 5000 on join)
  referrerReward: number; // inviter's reward promised ON FIRST RIDE (legacy 1500; staged refRide 1000)
  staged: boolean;
  shareReward: number; // inviter reward granted RIGHT NOW at number-link (staged only; 0 in legacy)
}

/**
 * Pay out a referral once the invitee links a real phone. Idempotent: a given
 * invitee is only ever credited once (guarded by referralCreditedAt + ledger).
 */
export async function completeReferral(
  refereeTelegramId: string,
  refereeMemberId: number,
): Promise<ReferralCredit | null> {
  const referee = await prisma.telegramUser.findUnique({ where: { id: refereeTelegramId } });
  if (!referee || referee.referralCreditedAt || !referee.referredByCode) return null;

  const referrer = await prisma.telegramUser.findUnique({ where: { referralCode: referee.referredByCode } });
  if (!referrer || referrer.id === refereeTelegramId) {
    await prisma.telegramUser.update({ where: { id: refereeTelegramId }, data: { referredByCode: null } });
    return null;
  }

  // P0 (QA fleet): insert the Referral row FIRST (refereeId @unique = idempotency guard),
  // THEN stamp referralCreditedAt below. The OLD order stamped first → a crash before
  // referral.create left the guard set with NO row, so the sweep never paid either side.
  //
  // Two payout shapes, chosen by the refstaged flag:
  //  • LEGACY (flag OFF): nobody is paid at link time — BOTH sides unlock on the referee's first
  //    completed ride (row.rewardReferrer + row.rewardReferee, paid by the booking sweep).
  //  • STAGED (flag ON): the inviter gets refShare RIGHT NOW (this fn) + refRide on the friend's
  //    first ride (row.rewardReferrer); the friend already got 5000 on JOIN (grantJoinWelcome) when
  //    welcomebonus is ON, so row.rewardReferee = 0 — UNLESS welcomebonus is OFF, in which case the
  //    friend's 5000 falls back to the first ride (so the friend is NEVER left with nothing).
  // ANTI-SYBIL (both modes): phone de-dup — the same phone can't earn the same referrer twice across
  // burner Telegram accounts.
  const { featureOn } = await import("./featureFlags");
  const staged = await featureOn("refstaged");
  const welcomeOn = await featureOn("welcomebonus");
  const econ = await getBonusEcon();

  let dup = false;
  if (referrer.memberId) {
    const norm9 = (p: string) => p.replace(/\D/g, "").slice(-9);
    const refereeMember = await prisma.member.findUnique({ where: { id: refereeMemberId }, select: { phone: true } });
    if (refereeMember?.phone) {
      const prior = await prisma.referral.findMany({
        where: { referrerId: referrer.id, refereeMemberId: { not: null } },
        select: { refereeMemberId: true },
      });
      const priorMembers = await prisma.member.findMany({
        where: { id: { in: prior.map((p) => p.refereeMemberId!) } },
        select: { phone: true },
      });
      dup = priorMembers.some((p) => p.phone && norm9(p.phone) === norm9(refereeMember.phone!));
    }
    await incrementMission(referrer.memberId, "weekly_invite");
    await import("./weeklyService")
      .then((w) => w.addScore(referrer.memberId!, "referral"))
      .catch(() => undefined);
  }

  // Resolve the on-ride promises (stored on the row) + the immediate share grant (staged only).
  let referrerReward = 0; // inviter's ON-RIDE amount (row.rewardReferrer)
  let refereeReward = 0; // friend's ON-RIDE amount (row.rewardReferee)
  let shareReward = 0; // inviter's reward granted NOW at link (staged)
  if (staged) {
    referrerReward = dup ? 0 : (econ.refRide ?? 0);
    refereeReward = welcomeOn ? 0 : (econ.firstRide ?? REFEREE_REWARD); // join-welcome covers it iff ON
    if (referrer.memberId && !dup) {
      const amt = econ.refShare ?? 0;
      if (amt > 0) {
        const g = await grantCoins(referrer.memberId, amt, "referral", "👥 Do'stingiz raqamini uladi — taklif sovg'asi", `ref_share:${refereeTelegramId}`);
        if (g.ok) shareReward = amt;
      }
    }
  } else {
    referrerReward = dup ? 0 : (econ.referrer ?? REFERRER_REWARD);
    refereeReward = econ.firstRide ?? REFEREE_REWARD;
  }

  try {
    await prisma.referral.create({
      data: {
        referrerId: referrer.id,
        refereeId: refereeTelegramId,
        refereeMemberId,
        rewardReferrer: referrerReward, // promised; granted on the referee's first ride (sweep)
        rewardReferee: refereeReward, // 0 in staged when join-welcome already paid the friend
      },
    });
  } catch (e) {
    // refereeId @unique → a concurrent link already created the row; skip (no double-row, no loss).
    if ((e as { code?: string } | null)?.code === "P2002") return null;
    throw e;
  }
  // durable row now exists → safe to stamp the fast-path guard (crash before this is recoverable:
  // retry re-hits the @unique insert → P2002 → null, and the row already lets the sweep pay).
  await prisma.telegramUser.update({ where: { id: refereeTelegramId }, data: { referralCreditedAt: new Date() } });

  return {
    referrerTelegramId: referrer.id,
    referrerMemberId: referrer.memberId,
    refereeReward,
    referrerReward,
    staged,
    shareReward,
  };
}
