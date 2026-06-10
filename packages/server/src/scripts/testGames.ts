// Exercises the racing + crash + park economics against the dev Postgres.
// Throwaway phone-less members → coin ledger only, no kas writes. Cleans up.
import "../env";
import { CRASH_MAX_MULT, RACE_STAKES, buildCourse, deriveCrashPoint, raceChecksum, scoreRun } from "@t1067/shared";
import { prisma } from "../db";
import { getCoins, grantCoins } from "../services/coinService";
import { finishRace, getRaceBoard, startRace } from "../services/raceService";
import { cashoutCrash, startCrash } from "../services/crashService";
import { buyOrUpgradeCar, collectPark, getPark } from "../services/parkService";

const TAG = "GAMETEST";
let fails = 0;
function ok(c: boolean, label: string): void {
  console.log(`${c ? "✅" : "❌"} ${label}`);
  if (!c) fails++;
}

async function cleanup(): Promise<void> {
  const ms = await prisma.member.findMany({ where: { kasId: { startsWith: TAG } }, select: { id: true } });
  const ids = ms.map((m) => m.id);
  if (ids.length) {
    await prisma.raceResult.deleteMany({ where: { memberId: { in: ids } } });
    await prisma.raceSession.deleteMany({ where: { memberId: { in: ids } } });
    await prisma.crashRound.deleteMany({ where: { memberId: { in: ids } } });
    await prisma.parkCar.deleteMany({ where: { memberId: { in: ids } } });
    await prisma.parkState.deleteMany({ where: { memberId: { in: ids } } });
    await prisma.member.deleteMany({ where: { id: { in: ids } } });
  }
}

function makeRun(seed: number, changes: [number, number][]): { inputs: number[]; score: number; checksum: string } {
  const inputs = changes.flat();
  const { score } = scoreRun(seed, inputs);
  return { inputs, score, checksum: raceChecksum(inputs) };
}

async function main(): Promise<void> {
  await cleanup();
  const A = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-A`, fullName: "Racer A" } });
  const B = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-B`, fullName: "Racer B" } });
  await grantCoins(A.id, 50000, "manual", "seed");
  await grantCoins(B.id, 50000, "manual", "seed");
  const stake = RACE_STAKES[0];

  // ── race engine determinism ────────────────────────────────────────────────
  const s1 = scoreRun(12345, [10, 0, 50, 2, 200, 1]);
  const s2 = scoreRun(12345, [10, 0, 50, 2, 200, 1]);
  ok(s1.score === s2.score && buildCourse(12345).length === buildCourse(12345).length, `scoreRun deterministic (score ${s1.score})`);
  ok(scoreRun(1, []).score !== scoreRun(2, []).score, `different seeds → different courses`);

  // ── race A: first run, no ghost → free win, escrow deducted then paid ───────
  const startA = await startRace(A.id, stake);
  ok(startA.ok && startA.ghost === null && (await getCoins(A.id)) === 50000 - stake, `A start: staked ${stake}, no ghost yet`);
  const runA = makeRun(startA.seed!, [[20, 0], [120, 2], [300, 1], [450, 0]]);
  const finA = await finishRace(A.id, { sessionId: startA.sessionId!, token: startA.token!, inputs: runA.inputs, durationMs: 31000, score: runA.score, checksum: runA.checksum });
  ok(finA.ok && finA.won && finA.serverScore === runA.score, `A finish: server-scored ${finA.serverScore}, won (no ghost)`);
  ok((await getCoins(A.id)) === 50000 - stake + finA.reward, `A paid reward ${finA.reward}`);

  // double-submit is idempotent (no double pay)
  const dupA = await finishRace(A.id, { sessionId: startA.sessionId!, token: startA.token!, inputs: runA.inputs, durationMs: 31000, score: runA.score, checksum: runA.checksum });
  ok(!dupA.ok && dupA.reason === "already_finished", `A double-submit blocked`);

  // ── race B: now A's run is the ghost ────────────────────────────────────────
  const startB = await startRace(B.id, stake);
  ok(startB.ok && startB.ghost?.name === "Racer A" && startB.ghost.score === finA.serverScore, `B gets A as ghost (score ${startB.ghost?.score})`);

  // anti-cheat: bad checksum rejected
  const bad = await finishRace(B.id, { sessionId: startB.sessionId!, token: startB.token!, inputs: [10, 0], durationMs: 31000, score: 999999, checksum: "deadbeef" });
  ok(!bad.ok && bad.reason === "checksum", `B forged checksum rejected`);
  // anti-cheat: too-fast duration rejected (session still live after a rejected finish)
  const runB = makeRun(startB.seed!, [[10, 2], [200, 0]]);
  const fast = await finishRace(B.id, { sessionId: startB.sessionId!, token: startB.token!, inputs: runB.inputs, durationMs: 1000, score: runB.score, checksum: runB.checksum });
  ok(!fast.ok && fast.reason === "bad_duration", `B sub-min duration rejected`);
  // anti-cheat: implausible score (real inputs, lied score) rejected
  const lie = await finishRace(B.id, { sessionId: startB.sessionId!, token: startB.token!, inputs: runB.inputs, durationMs: 31000, score: runB.score + 100000, checksum: runB.checksum });
  ok(!lie.ok && lie.reason === "implausible", `B inflated score rejected`);
  // valid finish
  const finB = await finishRace(B.id, { sessionId: startB.sessionId!, token: startB.token!, inputs: runB.inputs, durationMs: 31000, score: runB.score, checksum: runB.checksum });
  ok(finB.ok && finB.ghostScore === finA.serverScore, `B valid finish vs ghost (won=${finB.won})`);

  const board = await getRaceBoard(A.id, stake);
  ok(board.entries.length >= 1 && board.stakes.length === RACE_STAKES.length, `race board populated (${board.entries.length} entries)`);

  // ── crash RTP + payout bounds over many seeds ───────────────────────────────
  let sum = 0;
  const N = 200000;
  for (let i = 0; i < N; i++) sum += deriveCrashPoint((i * 2654435761) >>> 0);
  const avg = sum / N;
  ok(avg > 1.0 && avg < CRASH_MAX_MULT, `crash avg crashPoint sane (${avg.toFixed(2)}x, cap ${CRASH_MAX_MULT})`);

  // crash live round: start escrow, immediate cashout ~1.0x (small win or loss)
  const cBal = await getCoins(B.id);
  const cs = await startCrash(B.id, 200);
  ok(cs.ok && !!cs.serverHash && (await getCoins(B.id)) === cBal - 200, `crash start: staked 200, hash committed`);
  const co = await cashoutCrash(B.id, cs.roundId!);
  ok(co.ok && co.seed !== undefined && co.crashPoint >= 1.0, `crash cashout settled (mult ${co.multiplier}, crash ${co.crashPoint}, won ${co.won})`);
  const co2 = await cashoutCrash(B.id, cs.roundId!);
  ok(!co2.ok && co2.reason === "already_settled", `crash double-cashout blocked`);

  // ── park: buy, accrue (backdate), collect, cap ──────────────────────────────
  const pBal = await getCoins(A.id);
  const buy = await buyOrUpgradeCar(A.id, "tico");
  ok(buy.ok && (await getCoins(A.id)) === pBal - 1500, `park: bought Tico for 1500`);
  // backdate collect clock 2h → accrue ~2h of output
  await prisma.parkState.update({ where: { memberId: A.id }, data: { lastCollectAt: new Date(Date.now() - 2 * 3600_000) } });
  const park = await getPark(A.id);
  ok(park.perHour > 0 && park.accrued > 0 && park.accrued <= park.perHour * 8, `park accrues (${park.accrued} coin, ${park.perHour}/h)`);
  const coll = await collectPark(A.id);
  ok(coll.ok && coll.collected === park.accrued, `park collected ${coll.collected}`);
  const coll2 = await collectPark(A.id);
  ok(!coll2.ok && coll2.collected === 0, `park double-collect yields ~0`);
  // cap: backdate 100h → accrued capped at 8h
  await prisma.parkState.update({ where: { memberId: A.id }, data: { lastCollectAt: new Date(Date.now() - 100 * 3600_000) } });
  const capped = await getPark(A.id);
  ok(capped.capped && capped.accrued === capped.perHour * 8, `park accrual capped at 8h (${capped.accrued})`);

  await cleanup();
  console.log(fails ? `\n❌ ${fails} FAILURES` : "\n🎉 all game checks passed");
  process.exit(fails ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await cleanup().catch(() => undefined);
  process.exit(1);
});
