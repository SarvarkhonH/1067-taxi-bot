import crypto from "node:crypto";
import type { ReferralResponse } from "@t1067/shared";
import { prisma } from "../db";
import { env } from "../env";
import { grantCashback } from "./rewardService";
import { incrementMission } from "./missionService";

// Double-sided reward (so'm). Tuned so a paid invite stays well under LTV.
export const REFERRER_REWARD = 3000; // inviter
export const REFEREE_REWARD = 2000; // the friend who joins

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

  // mark first so a concurrent link can't double-pay
  await prisma.telegramUser.update({ where: { id: refereeTelegramId }, data: { referralCreditedAt: new Date() } });

  await grantCashback(refereeMemberId, REFEREE_REWARD, "Do'st taklifi (xush kelibsiz)", "referral", `ref_referee:${refereeTelegramId}`);

  let referrerReward = 0;
  if (referrer.memberId) {
    const g = await grantCashback(referrer.memberId, REFERRER_REWARD, "Do'st taklif qildingiz", "referral", `ref_referrer:${refereeTelegramId}`);
    if (g.ok) referrerReward = REFERRER_REWARD;
    await incrementMission(referrer.memberId, "weekly_invite");
  }

  await prisma.referral.create({
    data: {
      referrerId: referrer.id,
      refereeId: refereeTelegramId,
      refereeMemberId,
      rewardReferrer: referrerReward,
      rewardReferee: REFEREE_REWARD,
    },
  });

  return {
    referrerTelegramId: referrer.id,
    referrerMemberId: referrer.memberId,
    refereeReward: REFEREE_REWARD,
    referrerReward,
  };
}
