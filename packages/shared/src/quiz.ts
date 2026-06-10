// 🧠 Kunlik viktorina — the same 5 questions for everyone each tashkent day
// (picked deterministically from the bank), +100 coin per correct, 5/5 = +500.
import { mulberry32 } from "./race";

export const QUIZ_PER_DAY = 5;
export const QUIZ_REWARD = 100; // per correct answer
export const QUIZ_PERFECT_BONUS = 500; // all 5 correct

export interface QuizQuestion {
  q: string;
  options: [string, string, string, string];
  correct: number; // index — NEVER sent to the client
}

export const QUIZ_BANK: QuizQuestion[] = [
  { q: "O'zbekiston poytaxti qaysi shahar?", options: ["Samarqand", "Toshkent", "Buxoro", "Andijon"], correct: 1 },
  { q: "Qashqadaryo viloyatining markazi?", options: ["Qarshi", "Koson", "Shahrisabz", "G'uzor"], correct: 0 },
  { q: "Amir Temur qaysi shaharda tug'ilgan?", options: ["Samarqand", "Toshkent", "Shahrisabz", "Xiva"], correct: 2 },
  { q: "O'zbekiston bayrog'ida nechta yulduz bor?", options: ["10", "12", "14", "16"], correct: 1 },
  { q: "Dunyodagi eng katta okean?", options: ["Atlantika", "Hind", "Tinch", "Shimoliy muz"], correct: 2 },
  { q: "Bir soatda necha daqiqa bor?", options: ["60", "100", "90", "120"], correct: 0 },
  { q: "Futbolda jamoada nechta o'yinchi maydonda bo'ladi?", options: ["9", "10", "11", "12"], correct: 2 },
  { q: "O'zbekiston mustaqillik kuni qachon?", options: ["9-may", "1-sentyabr", "8-dekabr", "21-mart"], correct: 1 },
  { q: "Navro'z bayrami qachon nishonlanadi?", options: ["1-yanvar", "8-mart", "21-mart", "1-may"], correct: 2 },
  { q: "Eng tez quruqlik hayvoni?", options: ["Sher", "Gepard", "Ot", "Antilopa"], correct: 1 },
  { q: "Quyosh tizimidagi eng katta sayyora?", options: ["Yer", "Mars", "Yupiter", "Saturn"], correct: 2 },
  { q: "Suv necha gradusda qaynaydi?", options: ["90°C", "100°C", "110°C", "80°C"], correct: 1 },
  { q: "Alisher Navoiy qaysi asrda yashagan?", options: ["XIII", "XIV", "XV", "XVII"], correct: 2 },
  { q: "O'zbekiston pul birligi?", options: ["Tenge", "So'm", "Rubl", "Somoni"], correct: 1 },
  { q: "Yer Quyosh atrofini qancha vaqtda aylanadi?", options: ["1 oy", "1 yil", "1 kun", "10 yil"], correct: 1 },
  { q: "Eng baland tog' cho'qqisi?", options: ["Everest", "K2", "Elbrus", "Mont Blan"], correct: 0 },
  { q: "Kompyuterning 'miyasi' nima deyiladi?", options: ["Monitor", "Protsessor", "Klaviatura", "Printer"], correct: 1 },
  { q: "O'zbekistonda nechta viloyat bor?", options: ["10", "11", "12", "14"], correct: 2 },
  { q: "Ipak yo'li qaysi shaharlardan o'tgan?", options: ["Samarqand va Buxoro", "Moskva va Kiyev", "Tehron va Bag'dod", "Pekin va Tokio"], correct: 0 },
  { q: "Inson tanasida nechta suyak bor (kattalarda)?", options: ["106", "206", "306", "150"], correct: 1 },
  { q: "Qaysi rang svetoforda 'to'xta' degani?", options: ["Yashil", "Sariq", "Qizil", "Ko'k"], correct: 2 },
  { q: "Avtomobil qaysi tomonda yuradi O'zbekistonda?", options: ["Chap", "O'ng", "O'rtada", "Farqi yo'q"], correct: 1 },
  { q: "Bir sutkada necha soat bor?", options: ["12", "24", "36", "48"], correct: 1 },
  { q: "O'zbekiston futbol terma jamoasi qaysi konfederatsiyada?", options: ["UEFA", "AFC", "CAF", "CONMEBOL"], correct: 1 },
  { q: "Aralash choy nima bilan ichiladi Koson'da?", options: ["Shakar", "Tuz", "Asal", "Limon"], correct: 0 },
  { q: "Eng katta davlat (maydoni bo'yicha)?", options: ["Xitoy", "AQSH", "Rossiya", "Kanada"], correct: 2 },
  { q: "Telefon raqami 1067 — bu nima?", options: ["Pochta", "Taxi xizmati", "Shifoxona", "Bank"], correct: 1 },
  { q: "Benzinning narxi qayerda belgilanadi?", options: ["Zapravkada", "Bozorda", "Davlat tomonidan", "Haydovchi tomonidan"], correct: 2 },
  { q: "Qaysi oyda Ramazon hayiti bo'ladi?", options: ["Har doim yanvarda", "Hijriy taqvimga qarab", "Har doim iyulda", "Dekabrda"], correct: 1 },
  { q: "Internetda 'WWW' nimani anglatadi?", options: ["World Wide Web", "World War Web", "Wide World Win", "Web World Wide"], correct: 0 },
];

/** Deterministic daily selection — same 5 questions for everyone. */
export function dailyQuizIndexes(dayKey: string): number[] {
  let h = 0;
  for (const c of dayKey) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0;
  const rng = mulberry32(h >>> 0);
  const idxs = new Set<number>();
  while (idxs.size < QUIZ_PER_DAY) idxs.add(Math.floor(rng() * QUIZ_BANK.length));
  return [...idxs];
}

export interface QuizQuestionView {
  qIdx: number;
  q: string;
  options: string[];
  answered: boolean;
  myAnswer: number | null;
  correct: boolean | null;
}

export interface QuizResponse {
  dayKey: string;
  reward: number;
  perfectBonus: number;
  questions: QuizQuestionView[];
  correctCount: number;
  done: boolean;
}

export interface QuizAnswerResponse {
  ok: boolean;
  reason?: "answered" | "bad_question" | "done";
  correct: boolean;
  correctIdx: number;
  reward: number; // coins paid for this answer
  perfectBonus: number; // paid if this completed 5/5
  coins: number;
}
