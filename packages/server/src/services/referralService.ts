import crypto from "node:crypto";
import type { ReferralResponse } from "@t1067/shared";
import { prisma } from "../db";
import { env } from "../env";
import { grantCoins } from "./coinService";
import { incrementMission } from "./missionService";

// Double-sided reward (so'm). Tuned so a paid invite stays well under LTV.
export const REFERRER_REWARD = 1500; // inviter — paid when the friend completes a real ride
export const REFEREE_REWARD = 2000; // the friend — ALSO paid on their first real ride

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
  return {
    code,
    link: inviteLink(code),
    invited: refs.length,
    earned: refs.reduce((s, r) => s + r.rewardReferrer, 0),
    rewardReferrer: REFERRER_REWARD,
    rewardReferee: REFEREE_REWARD,
  };
}

/**
 * Capture a pending invite when a NEW user opens the bot via a ref link.
 * No-ops for self-invites, unknown codes, or users who already joined/were credited.
 */
export async function attachPendingReferral(refereeTelegramId: string, code: string): Promise<void> {
  const referee = await prisma.telegramUser.findUnique({ where: { id: refereeTelegramId } });
  if (referee?.memberId || referee?.referralCreditedAt || referee?.referredByCode) return; // only fresh users

  const referrer = await prisma.telegramUser.findUnique({ where: { referralCode: code } });
  if (!referrer || referrer.id === refereeTelegramId) return;

  await prisma.telegramUser.update({ where: { id: refereeTelegramId }, data: { referredByCode: code } });
}

export interface ReferralCredit {
  referrerTelegramId: string;
  referrerMemberId: number | null;
  refereeReward: number;
  referrerReward: number;
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
  // NOTE: nobody is paid at link time — BOTH sides unlock on the referee's
  // first completed ride (paid by the booking sweep). Referral is an
  // acquisition cost only when a real revenue event happened.

  // ANTI-SYBIL: the inviter's reward is DEFERRED until the invited friend
  // completes a real ride (paid by the booking sweep, marked referrerPaidAt).
  // Phone de-dup: the same phone can't earn the same referrer twice across
  // burner Telegram accounts.
  let referrerReward = 0;
  if (referrer.memberId) {
    const norm9 = (p: string) => p.replace(/\D/g, "").slice(-9);
    const refereeMember = await prisma.member.findUnique({ where: { id: refereeMemberId }, select: { phone: true } });
    let dup = false;
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
    if (!dup) referrerReward = REFERRER_REWARD;
    await incrementMission(referrer.memberId, "weekly_invite");
    await import("./weeklyService")
      .then((w) => w.addScore(referrer.memberId!, "referral"))
      .catch(() => undefined);
  }

  try {
    await prisma.referral.create({
      data: {
        referrerId: referrer.id,
        refereeId: refereeTelegramId,
        refereeMemberId,
        rewardReferrer: referrerReward, // promised; granted on the referee's first ride
        rewardReferee: REFEREE_REWARD,
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
    refereeReward: REFEREE_REWARD,
    referrerReward,
  };
}
