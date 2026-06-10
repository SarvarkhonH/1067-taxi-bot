import { useEffect, useState } from "react";
import { formatNumber, type QuizResponse } from "@t1067/shared";
import { api } from "./api";
import { haptic } from "./telegram";
import { confetti } from "./util";

export function QuizView({ onReward }: { onReward: (msg: string) => void }) {
  const [quiz, setQuiz] = useState<QuizResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState<Record<number, number>>({}); // qIdx -> correctIdx

  const load = () => api.quiz().then(setQuiz).catch(() => undefined);
  useEffect(() => {
    load();
  }, []);

  const answer = async (qIdx: number, answerIdx: number) => {
    if (busy) return;
    setBusy(true);
    haptic();
    try {
      const r = await api.quizAnswer(qIdx, answerIdx);
      if (r.ok) {
        setReveal((p) => ({ ...p, [qIdx]: r.correctIdx }));
        if (r.correct) onReward(`🧠 To'g'ri! +${formatNumber(r.reward)} coin`);
        if (r.perfectBonus > 0) {
          confetti();
          onReward(`🎉 5/5 MUKAMMAL! +${formatNumber(r.perfectBonus)} coin bonus!`);
        }
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (!quiz) return <div className="muted weekly-empty">Yuklanmoqda…</div>;

  return (
    <div className="view">
      <section className="glass pad quiz-head">
        <div className="stake-emoji">🧠</div>
        <div>
          <div className="stake-name">Kunlik viktorina</div>
          <div className="muted stake-desc">
            Har to'g'ri javob +{formatNumber(quiz.reward)} · 5/5 = +{formatNumber(quiz.perfectBonus)} bonus
          </div>
        </div>
        <div className="quiz-score">{quiz.correctCount}/5</div>
      </section>

      {quiz.questions.map((q, n) => (
        <div key={q.qIdx} className={"glass pad quiz-q" + (q.answered ? " done" : "")}>
          <div className="quiz-q-text">
            {n + 1}. {q.q}
          </div>
          <div className="quiz-opts">
            {q.options.map((opt, i) => {
              const revealedCorrect = q.answered ? (reveal[q.qIdx] ?? (q.correct && q.myAnswer === i ? i : -1)) : -1;
              const cls =
                "quiz-opt" +
                (q.answered
                  ? i === revealedCorrect
                    ? " right"
                    : q.myAnswer === i
                      ? " wrong"
                      : " dim"
                  : "");
              return (
                <button key={i} className={cls} disabled={q.answered || busy} onClick={() => answer(q.qIdx, i)}>
                  {opt}
                  {q.answered && q.myAnswer === i && (q.correct ? " ✅" : " ❌")}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {quiz.done && <div className="muted weekly-empty">Bugungi viktorina tugadi — ertaga yangi savollar! 🌙</div>}
    </div>
  );
}
