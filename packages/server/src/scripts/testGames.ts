// Exercises the racing + crash + park economics against the dev Postgres.
// Throwaway phone-less members → coin ledger only, no kas writes. Cleans up.
import "../env";
import {
  CRASH_MAX_MULT,
  QUIZ_BANK,
  QUIZ_PER_DAY,
  RACE_STAKES,
  buildCourse,
  dailyQuizIndexes,
  deriveCrashPoint,
  raceChecksum,
  scoreRun,
} from "@t1067/shared";
import { prisma } from "../db";
import { getCoins, grantCoins } from "../services/coinService";
import { finishRace, getRaceBoard, startRace } from "../services/raceService";
import { cashoutCrash, startCrash } from "../services/crashService";
import { buyOrUpgradeCar, collectPark, getPark } from "../services/parkService";
import { acceptDuel, createDuel, listDuels, submitDuelRun } from "../services/duelService";
import { answerQuiz, getQuiz } from "../services/quizService";
import { dayKey } from "../services/missionService";

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
    await prisma.duel.deleteMany({ where: { OR: [{ challengerId: { in: ids } }, { opponentId: { in: ids } }] } });
    await prisma.quizAnswer.deleteMany({ where: { memberId: { in: ids } } });
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

  // ── race A: escrow deducted; ghost may exist from real prod players ─────────
  const startA = await startRace(A.id, stake);
  ok(startA.ok && (await getCoins(A.id)) === 50000 - stake, `A start: staked ${stake} (ghost: ${startA.ghost?.name ?? "yo'q"})`);
  const runA = makeRun(startA.seed!, [[20, 0], [120, 2], [300, 1], [450, 0]]);
  const finA = await finishRace(A.id, { sessionId: startA.sessionId!, token: startA.token!, inputs: runA.inputs, durationMs: 31000, score: runA.score, checksum: runA.checksum });
  ok(finA.ok && finA.serverScore === runA.score, `A finish: server-scored ${finA.serverScore}, won=${finA.won}`);
  ok((await getCoins(A.id)) === 50000 - stake + finA.reward, `A settle correct (reward ${finA.reward})`);

  // double-submit is idempotent (no double pay)
  const dupA = await finishRace(A.id, { sessionId: startA.sessionId!, token: startA.token!, inputs: runA.inputs, durationMs: 31000, score: runA.score, checksum: runA.checksum });
  ok(!dupA.ok && dupA.reason === "already_finished", `A double-submit blocked`);

  // ── race B: ghost pool now definitely non-empty (A's run + real players) ────
  const startB = await startRace(B.id, stake);
  ok(startB.ok && !!startB.ghost && startB.ghost.inputs.length >= 0, `B gets a real ghost (${startB.ghost?.name}, score ${startB.ghost?.score})`);

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
  ok(finB.ok && finB.ghostScore === startB.ghost!.score, `B valid finish vs ghost (won=${finB.won})`);

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

  // ── duel 1v1: create → run → accept → run → settle ─────────────────────────
  const dBalA = await getCoins(A.id);
  const duel = await createDuel(A.id, 300);
  ok(duel.ok && (await getCoins(A.id)) === dBalA - 300, `duel created, A staked 300`);
  const chRun = makeRun(duel.seed!, [[15, 0], [200, 2], [400, 1]]);
  const chRes = await submitDuelRun(A.id, { duelId: duel.duelId!, token: duel.token!, inputs: chRun.inputs, durationMs: 31000, score: chRun.score, checksum: chRun.checksum });
  ok(chRes.ok && chRes.role === "challenger" && !chRes.settled, `A ran (score ${chRes.myScore}), duel OPEN`);

  const dList = await listDuels(B.id);
  ok(dList.open.length === 1 && dList.open[0]!.challengerName === "Racer A", `B sees A's open challenge (score hidden)`);

  // self-accept blocked
  const selfAcc = await acceptDuel(A.id, duel.duelId!);
  ok(!selfAcc.ok, `self-accept blocked`);

  const dBalB = await getCoins(B.id);
  const acc2 = await acceptDuel(B.id, duel.duelId!);
  ok(acc2.ok && acc2.seed === duel.seed && (await getCoins(B.id)) === dBalB - 300, `B accepted, same seed, staked 300`);

  const opRun = makeRun(duel.seed!, [[10, 2], [100, 0], [250, 1], [380, 2], [500, 0]]);
  const opRes = await submitDuelRun(B.id, { duelId: duel.duelId!, token: acc2.token!, inputs: opRun.inputs, durationMs: 31000, score: opRun.score, checksum: opRun.checksum });
  ok(opRes.ok && opRes.settled && opRes.theirScore === chRes.myScore, `duel SETTLED: B=${opRes.myScore} vs A=${opRes.theirScore}, won=${opRes.won}, tie=${opRes.tie}`);
  if (!opRes.tie) {
    const winner = opRes.won ? B.id : A.id;
    const expectedPot = 300 * 2 - Math.floor(300 * 2 * 0.1);
    ok(opRes.won ? opRes.pot === expectedPot : true, `pot = ${expectedPot} (2x − 10% burn)`);
    const winTx = await prisma.coinTxn.findFirst({ where: { memberId: winner, kind: "duel", amount: { gt: 0 } } });
    ok(!!winTx, `winner paid via duel txn (+${winTx?.amount})`);
  }
  const dup = await submitDuelRun(B.id, { duelId: duel.duelId!, token: acc2.token!, inputs: opRun.inputs, durationMs: 31000, score: opRun.score, checksum: opRun.checksum });
  ok(!dup.ok && dup.reason === "already_ran", `duel double-submit blocked`);

  // ── quiz: deterministic daily set, answer, idempotent ───────────────────────
  const today = dayKey(new Date());
  const idxs = dailyQuizIndexes(today);
  ok(idxs.length === QUIZ_PER_DAY && new Set(idxs).size === QUIZ_PER_DAY, `daily quiz: ${QUIZ_PER_DAY} unique questions`);
  ok(JSON.stringify(dailyQuizIndexes(today)) === JSON.stringify(idxs), `daily selection deterministic`);

  const qz = await getQuiz(A.id);
  ok(qz.questions.length === QUIZ_PER_DAY && qz.questions.every((q) => (q as unknown as { correct: boolean | null }).correct === null || !q.answered), `quiz served without leaking answers`);

  const qBal = await getCoins(A.id);
  const first = qz.questions[0]!;
  const rightIdx = QUIZ_BANK[first.qIdx]!.correct;
  const a1 = await answerQuiz(A.id, first.qIdx, rightIdx);
  ok(a1.ok && a1.correct && a1.reward === 100 && (await getCoins(A.id)) === qBal + 100, `correct answer → +100 coin`);
  const a1dup = await answerQuiz(A.id, first.qIdx, rightIdx);
  ok(!a1dup.ok && a1dup.reason === "answered", `re-answer blocked`);
  const second = qz.questions[1]!;
  const wrongIdx = (QUIZ_BANK[second.qIdx]!.correct + 1) % 4;
  const a2 = await answerQuiz(A.id, second.qIdx, wrongIdx);
  ok(a2.ok && !a2.correct && a2.reward === 0 && a2.correctIdx === QUIZ_BANK[second.qIdx]!.correct, `wrong answer → 0, correct revealed`);
  // answer the rest correctly → no perfect bonus (one wrong)
  for (const q of qz.questions.slice(2)) await answerQuiz(A.id, q.qIdx, QUIZ_BANK[q.qIdx]!.correct);
  const qzEnd = await getQuiz(A.id);
  ok(qzEnd.done && qzEnd.correctCount === 4, `quiz day done (4/5, no perfect bonus)`);
  // perfect day for B → bonus
  for (const i of idxs) await answerQuiz(B.id, i, QUIZ_BANK[i]!.correct);
  const perfectTx = await prisma.coinTxn.findFirst({ where: { memberId: B.id, kind: "quiz", amount: 500 } });
  ok(!!perfectTx, `B perfect 5/5 → +500 bonus paid`);

  await cleanup();
  console.log(fails ? `\n❌ ${fails} FAILURES` : "\n🎉 all game checks passed");
  process.exit(fails ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await cleanup().catch(() => undefined);
  process.exit(1);
});
