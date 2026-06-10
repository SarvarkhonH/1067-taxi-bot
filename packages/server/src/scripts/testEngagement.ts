// Exercises the Missions + Referral engine end-to-end against the dev DB.
// Uses throwaway PHONE-LESS members so grantCashback records ledger rows but
// never writes real money to kas1067. Cleans up after itself.
import "../env";
import { BOX_PRIZES, JACKPOT_FLOOR } from "@t1067/shared";
import { prisma } from "../db";
import { claimMission, getMissions, incrementMission } from "../services/missionService";
import { getBoxStatus, openBox } from "../services/boxService";
import { attachPendingReferral, completeReferral, getReferralInfo } from "../services/referralService";
import { getJackpot, getWeeklyBoard, growJackpot, payWeeklyPrizes } from "../services/weeklyService";
import { spinWheel } from "../services/rewardService";

const FAKEWEEK = "2020-W01"; // synthetic closed week for payout tests — never collides with real data

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
  await prisma.appState.deleteMany({ where: { key: `weekly_paid_${FAKEWEEK}` } });
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

  // ── mystery box ──────────────────────────────────────────────────────────
  let box = await getBoxStatus(memberA.id);
  ok(!box.eligible && box.dailiesDone === 1 && box.dailiesTotal === 3, `box locked at 1/3 dailies`);
  const locked = await openBox(memberA.id);
  ok(!locked.ok && locked.reason === "locked", `open locked box blocked`);

  await incrementMission(memberA.id, "daily_spin");
  await incrementMission(memberA.id, "daily_ride");
  box = await getBoxStatus(memberA.id);
  ok(box.eligible && !box.opened, `box unlocks after all 3 dailies`);

  const opened = await openBox(memberA.id);
  ok(opened.ok && !!opened.prize && BOX_PRIZES.some((p) => p.label === opened.prize!.label), `box opened → prize: ${opened.prize?.label}`);
  const again = await openBox(memberA.id);
  ok(!again.ok && again.reason === "opened", `re-open blocked (once per day)`);
  box = await getBoxStatus(memberA.id);
  ok(box.opened && box.prize?.label === opened.prize?.label, `box status shows today's prize`);

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

  // ── weekly league ────────────────────────────────────────────────────────
  const myBoard = await getWeeklyBoard(memberA.id);
  // memberA accrued: mission claim +15, box +20, referral +50 = 85 this week
  ok(myBoard.me?.score === 85 && myBoard.me.rank >= 1, `weekly score accrued (85, rank #${myBoard.me?.rank})`);
  ok(myBoard.prizes.length === 3 && myBoard.prizes[0]!.amount === 10000, `weekly prizes catalog (10000/5000/3000)`);

  // payout on a synthetic closed week — never touches the real previous week
  await prisma.weeklyScore.createMany({
    data: [
      { memberId: memberA.id, weekKey: FAKEWEEK, score: 100 },
      { memberId: memberB.id, weekKey: FAKEWEEK, score: 60 },
    ],
  });
  const pushes: string[] = [];
  const collect = async (id: string, _html: string) => {
    pushes.push(id);
  };
  const paid1 = await payWeeklyPrizes(collect, FAKEWEEK);
  ok(paid1 === 2, `weekly payout paid top-2 (only 2 entrants)`);
  const wg = await prisma.rewardGrant.findMany({ where: { kind: "weekly", memberId: { in: [memberA.id, memberB.id] } } });
  ok(wg.some((g) => g.amount === 10000) && wg.some((g) => g.amount === 5000), `prizes 10000 + 5000 granted`);
  ok(pushes.length === 2, `both winners push-notified`);
  const paid2 = await payWeeklyPrizes(collect, FAKEWEEK);
  ok(paid2 === 0, `payout idempotent (paid-marker)`);

  // ── jackpot pool ─────────────────────────────────────────────────────────
  const rawBefore = (await prisma.appState.findUnique({ where: { key: "jackpot_pool" } }))?.value ?? null;
  const j0 = await getJackpot();
  ok(j0 >= JACKPOT_FLOOR, `jackpot >= floor (${j0})`);
  const j1 = await growJackpot(50);
  ok(j1 >= j0, `jackpot grows (${j0} -> ${j1})`);
  const spin = await spinWheel(memberB.id);
  ok(!spin.alreadySpun && spin.jackpot >= JACKPOT_FLOOR, `spin returns live jackpot (${spin.jackpot}), prize: ${spin.prize.label}`);
  const spin2 = await spinWheel(memberB.id);
  ok(spin2.alreadySpun, `second spin same day blocked`);
  // restore the real pool exactly as it was (tests must not move prod state)
  if (rawBefore === null) {
    await prisma.appState.deleteMany({ where: { key: "jackpot_pool" } });
  } else {
    await prisma.appState.update({ where: { key: "jackpot_pool" }, data: { value: rawBefore } });
  }

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
