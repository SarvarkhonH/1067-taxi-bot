import {
  QUIZ_BANK,
  QUIZ_PERFECT_BONUS,
  QUIZ_PER_DAY,
  QUIZ_REWARD,
  dailyQuizIndexes,
  type QuizAnswerResponse,
  type QuizResponse,
} from "@t1067/shared";
import { prisma } from "../db";
import { getCoins, grantCoins } from "./coinService";
import { dayKey } from "./missionService";

export async function getQuiz(memberId: number): Promise<QuizResponse> {
  const today = dayKey(new Date());
  const idxs = dailyQuizIndexes(today);
  const answers = await prisma.quizAnswer.findMany({ where: { memberId, dayKey: today } });
  const byIdx = new Map(answers.map((a) => [a.qIdx, a]));
  const questions = idxs.map((qIdx) => {
    const q = QUIZ_BANK[qIdx]!;
    const a = byIdx.get(qIdx);
    return {
      qIdx,
      q: q.q,
      options: [...q.options],
      answered: !!a,
      myAnswer: a?.answerIdx ?? null,
      correct: a ? a.correct : null,
    };
  });
  const correctCount = answers.filter((a) => a.correct).length;
  return {
    dayKey: today,
    reward: QUIZ_REWARD,
    perfectBonus: QUIZ_PERFECT_BONUS,
    questions,
    correctCount,
    done: answers.length >= QUIZ_PER_DAY,
  };
}

export async function answerQuiz(memberId: number, qIdx: number, answerIdx: number): Promise<QuizAnswerResponse> {
  const today = dayKey(new Date());
  const idxs = dailyQuizIndexes(today);
  const fail = async (reason: QuizAnswerResponse["reason"]): Promise<QuizAnswerResponse> => ({
    ok: false,
    reason,
    correct: false,
    correctIdx: -1,
    reward: 0,
    perfectBonus: 0,
    coins: await getCoins(memberId),
  });
  if (!idxs.includes(qIdx)) return fail("bad_question");
  const def = QUIZ_BANK[qIdx]!;
  const correct = def.correct === answerIdx;

  try {
    await prisma.quizAnswer.create({ data: { memberId, dayKey: today, qIdx, answerIdx, correct } });
  } catch {
    return fail("answered"); // unique [member,day,qIdx] — already answered
  }

  let reward = 0;
  if (correct) {
    const g = await grantCoins(memberId, QUIZ_REWARD, "quiz", "Viktorina: to'g'ri javob", `quiz:${memberId}:${today}:${qIdx}`);
    if (g.ok) reward = QUIZ_REWARD;
  }

  // perfect-day bonus when the 5th answer lands and all are correct
  const answers = await prisma.quizAnswer.findMany({ where: { memberId, dayKey: today } });
  let perfectBonus = 0;
  if (answers.length >= QUIZ_PER_DAY && answers.every((a) => a.correct)) {
    const g = await grantCoins(memberId, QUIZ_PERFECT_BONUS, "quiz", "Viktorina: 5/5 mukammal!", `quiz_perfect:${memberId}:${today}`);
    if (g.ok) perfectBonus = QUIZ_PERFECT_BONUS;
  }
  if (answers.length >= QUIZ_PER_DAY) {
    await import("./weeklyService")
      .then((w) => w.addScore(memberId, "mission"))
      .catch(() => undefined);
    await import("./missionService")
      .then((m) => m.incrementMission(memberId, "daily_quiz"))
      .catch(() => undefined);
  }

  return { ok: true, correct, correctIdx: def.correct, reward, perfectBonus, coins: await getCoins(memberId) };
}
