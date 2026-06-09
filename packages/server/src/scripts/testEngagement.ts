// Exercises the Missions + Referral engine end-to-end against the dev DB.
// Uses throwaway PHONE-LESS members so grantCashback records ledger rows but
// never writes real money to kas1067. Cleans up after itself.
import "../env";
import { prisma } from "../db";
import { claimMission, getMissions, incrementMission } from "../services/missionService";
import { attachPendingReferral, completeReferral, getReferralInfo } from "../services/referralService";

const TAG = "ENGTEST";

function ok(cond: boolean, label: string): void {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) process.exitCode = 1;
}

async function cleanup(): Promise<void> {
  const members = await prisma.member.findMany({ where: { kasId: { startsWith: TAG } } });
  const ids = members.map((m) => m.id);
  await prisma.referral.deleteMany({ where: { OR: [{ referrerId: { startsWith: TAG } }, { refereeId: { startsWith: TAG } }] } });
  await prisma.telegramUser.deleteMany({ where: { id: { startsWith: TAG } } });
  await prisma.member.deleteMany({ where: { id: { in: ids } } });
}

async function main(): Promise<void> {
  await cleanup();

  // referrer (already linked) + referee (joining)
  const memberA = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-A`, fullName: "Test Referrer", phone: null } });
  const memberB = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-B`, fullName: "Test Referee", phone: null } });
  const tgA = `${TAG}_A`;
  const tgB = `${TAG}_B`;
  await prisma.telegramUser.create({ data: { id: tgA, memberId: memberA.id, linkedAt: new Date() } });
  await prisma.telegramUser.create({ data: { id: tgB } }); // new, not yet linked

  // ── missions ──────────────────────────────────────────────────────────────
  let m = await getMissions(memberA.id);
  ok(m.daily.length === 3 && m.weekly.length === 2, `missions catalog (3 daily, 2 weekly)`);
  ok(m.daily.every((x) => x.progress === 0 && !x.claimable), `fresh missions are empty`);

  await incrementMission(memberA.id, "daily_checkin");
  m = await getMissions(memberA.id);
  const checkin = m.daily.find((x) => x.code === "daily_checkin")!;
  ok(checkin.progress === 1 && checkin.claimable, `daily_checkin → 1/1, claimable`);

  const claim1 = await claimMission(memberA.id, "daily_checkin");
  ok(claim1.ok && claim1.reward === 200, `claim daily_checkin → +200`);
  const claim2 = await claimMission(memberA.id, "daily_checkin");
  ok(!claim2.ok && claim2.reason === "claimed", `re-claim blocked (idempotent)`);

  const notReady = await claimMission(memberA.id, "weekly_rides");
  ok(!notReady.ok && notReady.reason === "not_complete", `claim incomplete mission blocked`);

  // ── referral ─────────────────────────────────────────────────────────────
  const infoA = await getReferralInfo(tgA);
  ok(/^[A-Z0-9]{6}$/.test(infoA.code), `referrer code generated: ${infoA.code}`);
  ok(infoA.link.includes(`start=ref_${infoA.code}`), `invite link well-formed`);
  ok(infoA.invited === 0, `referrer starts with 0 invites`);

  // self-invite must be ignored
  await attachPendingReferral(tgA, infoA.code);
  const selfTu = await prisma.telegramUser.findUnique({ where: { id: tgA } });
  ok(!selfTu?.referredByCode, `self-invite ignored`);

  // referee opens the link, then links a phone
  await attachPendingReferral(tgB, infoA.code);
  const pending = await prisma.telegramUser.findUnique({ where: { id: tgB } });
  ok(pending?.referredByCode === infoA.code, `pending referral captured on referee`);

  await prisma.telegramUser.update({ where: { id: tgB }, data: { memberId: memberB.id, linkedAt: new Date() } });
  const credit = await completeReferral(tgB, memberB.id);
  ok(!!credit && credit.referrerReward === 3000 && credit.refereeReward === 2000, `referral paid both sides (3000 / 2000)`);

  const dup = await completeReferral(tgB, memberB.id);
  ok(dup === null, `referral completion is one-time (no double pay)`);

  const infoA2 = await getReferralInfo(tgA);
  ok(infoA2.invited === 1 && infoA2.earned === 3000, `referrer stats: 1 invite, 3000 earned`);

  const invite = (await getMissions(memberA.id)).weekly.find((x) => x.code === "weekly_invite")!;
  ok(invite.progress === 1 && invite.claimable, `weekly_invite mission auto-bumped by referral`);

  const grants = await prisma.rewardGrant.findMany({ where: { memberId: { in: [memberA.id, memberB.id] } }, orderBy: { id: "asc" } });
  console.log(`\n   ledger: ${grants.map((g) => `${g.kind}+${g.amount}`).join(", ")}`);

  await cleanup();
  console.log(process.exitCode ? "\n❌ FAILURES ABOVE" : "\n🎉 all engagement checks passed");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await cleanup().catch(() => undefined);
  process.exit(1);
});
