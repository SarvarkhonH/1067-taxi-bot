// Exercises the Missions + Referral engine end-to-end against the dev DB.
// Uses throwaway PHONE-LESS members so grantCashback records ledger rows but
// never writes real money to kas1067. Cleans up after itself.
import "../env";
import { BOX_PRIZES, BOX_PRIZES_PREMIUM, BOX_PREMIUM_COST, JACKPOT_FLOOR, WHEEL_RESPIN_COST } from "@t1067/shared";
import { prisma } from "../db";
import { claimMission, getMissions, incrementMission } from "../services/missionService";
import { getBoxStatus, openBox } from "../services/boxService";
import { attachPendingReferral, completeReferral, getReferralInfo } from "../services/referralService";
import { getJackpot, getWeeklyBoard, growJackpot, payWeeklyPrizes } from "../services/weeklyService";
import { spinWheel } from "../services/rewardService";
import { getCoins, getWallet, grantCoins, withdraw } from "../services/coinService";

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
  ok(m.daily.length === 5 && m.weekly.length === 3, `missions catalog (5 daily, 3 weekly)`);
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

  // ── mystery box (unlocks when ALL daily missions are done) ─────────────────
  let box = await getBoxStatus(memberA.id);
  ok(!box.eligible && box.dailiesDone === 1, `box locked at 1/${box.dailiesTotal} dailies`);
  const locked = await openBox(memberA.id);
  ok(!locked.ok && locked.reason === "locked", `open locked box blocked`);

  for (const code of ["daily_spin", "daily_ride", "daily_race", "daily_quiz"]) await incrementMission(memberA.id, code);
  box = await getBoxStatus(memberA.id);
  ok(box.eligible && !box.opened, `box unlocks after all ${box.dailiesTotal} dailies`);

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
  const wg = await prisma.coinTxn.findMany({ where: { kind: "weekly", memberId: { in: [memberA.id, memberB.id] } } });
  ok(wg.some((g) => g.amount === 10000) && wg.some((g) => g.amount === 5000), `prizes 10000 + 5000 COIN granted`);
  ok(pushes.length >= 2, `winners push-notified (${pushes.length} incl. tier promotions)`);
  const paid2 = await payWeeklyPrizes(collect, FAKEWEEK);
  ok(paid2 === 0, `payout idempotent (paid-marker)`);

  // ── coin economy: balance, sinks, premium box, withdraw ──────────────────
  const txSum = (await prisma.coinTxn.findMany({ where: { memberId: memberA.id } })).reduce((s, t) => s + t.amount, 0);
  const balA = await getCoins(memberA.id);
  ok(Math.abs(balA - txSum) < 0.001 && balA > 0, `ledger consistent: coins(${balA}) == txn sum(${txSum})`);

  const balBefore = await getCoins(memberA.id);
  const prem = await openBox(memberA.id, { premium: true });
  ok(prem.ok && !!prem.prize && BOX_PRIZES_PREMIUM.some((p) => p.label === prem.prize!.label), `premium box opened → ${prem.prize?.label}`);
  const balAfter = await getCoins(memberA.id);
  ok(Math.abs(balAfter - (balBefore - BOX_PREMIUM_COST + (prem.prize?.amount ?? 0))) < 0.001, `premium box charged ${BOX_PREMIUM_COST}, paid prize`);

  // withdraw: phone-less member → not_client
  const wNoPhone = await withdraw(memberA.id, 6000);
  ok(!wNoPhone.ok && wNoPhone.reason === "not_client", `withdraw blocked for phone-less member`);

  // memberC: client with a fake phone — kas write fails → coins refunded
  const memberC = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-C`, fullName: "Test Withdrawer", phone: "+998000000001" } });
  await grantCoins(memberC.id, 8000, "manual", "test seed");
  const wMin = await withdraw(memberC.id, 1000);
  ok(!wMin.ok && wMin.reason === "below_min", `withdraw below min blocked`);
  const wIns = await withdraw(memberC.id, 9000);
  ok(!wIns.ok && wIns.reason === "insufficient", `withdraw over balance blocked`);
  const wKas = await withdraw(memberC.id, 7000);
  ok(!wKas.ok && wKas.reason === "kas_failed", `withdraw with unknown phone → kas_failed`);
  ok((await getCoins(memberC.id)) === 8000, `coins refunded after kas failure (8000 intact)`);
  const wRow = await prisma.withdrawal.findFirst({ where: { memberId: memberC.id } });
  ok(!!wRow && !wRow.kasApplied, `withdrawal attempt logged (kasApplied=false)`);
  const wallet = await getWallet(memberC.id);
  ok(wallet.coins === 8000 && wallet.withdrawMin === 5000 && wallet.txns.length >= 3, `wallet view: balance+txns ok`);

  // ── jackpot pool ─────────────────────────────────────────────────────────
  const rawBefore = (await prisma.appState.findUnique({ where: { key: "jackpot_pool" } }))?.value ?? null;
  const j0 = await getJackpot();
  ok(j0 >= JACKPOT_FLOOR, `jackpot >= floor (${j0})`);
  const j1 = await growJackpot(50);
  ok(j1 >= j0, `jackpot grows (${j0} -> ${j1})`);
  const spin = await spinWheel(memberB.id);
  ok(!spin.alreadySpun && spin.jackpot >= JACKPOT_FLOOR, `free spin ok, jackpot ${spin.jackpot}, prize: ${spin.prize.label}`);
  const spin2 = await spinWheel(memberB.id);
  ok(spin2.alreadySpun && spin2.respinCost === WHEEL_RESPIN_COST, `second free spin blocked, respin offered (${spin2.respinCost})`);
  const balB = await getCoins(memberB.id);
  const spin3 = await spinWheel(memberB.id, { respin: true });
  ok(!spin3.alreadySpun && spin3.paid && !spin3.insufficient, `PAID respin works (unlimited play)`);
  const balB2 = await getCoins(memberB.id);
  ok(Math.abs(balB2 - (balB - WHEEL_RESPIN_COST + spin3.prize.amount)) < 0.001, `respin charged ${WHEEL_RESPIN_COST}, prize credited`);
  // restore the real pool exactly as it was (tests must not move prod state)
  if (rawBefore === null) {
    await prisma.appState.deleteMany({ where: { key: "jackpot_pool" } });
  } else {
    await prisma.appState.update({ where: { key: "jackpot_pool" }, data: { value: rawBefore } });
  }

  const grants = await prisma.coinTxn.findMany({ where: { memberId: { in: [memberA.id, memberB.id] } }, orderBy: { id: "asc" } });
  console.log(`\n   coin ledger: ${grants.map((g) => `${g.kind}${g.amount > 0 ? "+" : ""}${g.amount}`).join(", ")}`);

  await cleanup();
  console.log(process.exitCode ? "\n❌ FAILURES ABOVE" : "\n🎉 all engagement checks passed");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await cleanup().catch(() => undefined);
  process.exit(1);
});
