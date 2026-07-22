// 🤖 AI-1/AI-2/AI-3 — RULES-FIRST natural-language understanding (Uzbek).
// ~80% of messages resolve here with zero LLM calls; askLlm is only the
// fallback for unmatched support questions (and is disabled without keys).
import { getDataSource } from "../../kas";
import { askLlm, llmAvailable } from "./llmRouter";

export interface BookIntent {
  type: "book";
  when: "now" | "later";
  timeText?: string; // "ertaga 7:00" — informational, v1 dispatches now-only
  addressQuery?: string;
}
export interface FaqIntent {
  type: "faq";
  answer: string;
}
export interface NoIntent {
  type: "none";
}
export type Intent = BookIntent | FaqIntent | NoIntent;

const BOOK_WORDS = /\b(taksi|taxi|такси|chaqir|чақир|olib\s*ket|mashina\s+kerak|boraman|ketaman|jo'nat)\b/i;
const LATER_WORDS = /\b(ertaga|эртага|keyin|soat\s*\d{1,2}|\d{1,2}\s*(da|:00|:30)|ertalab|kechqurun)\b/i;

// "bozorga", "uyga taksi" — grab the word before -ga/-gacha as a place guess
const PLACE_RE = /(\p{L}{3,})(?:ga|га|gacha)\b/iu;

const FAQ: { re: RegExp; a: string }[] = [
  { re: /narx|нарх|qancha\s+tur|tarif/i, a: "🚕 Narx taksometr bo'yicha: minimal to'lov + km. Aniq summa safar oxirida chiqadi — Mini App'da safardan oldin taxminiy narxni ko'rasiz." },
  { re: /cashback|kesh|кешбек|bonus\s+qancha/i, a: "💰 Har bot orqali chaqirilgan safardan cashback tushadi (ruletka 1x-10x!). Mini App → Hamyon'da ko'rinadi." },
  { re: /tanga|coin|pul\s+yech|so'mga|yechib\s+ol/i, a: "🪙 1 tanga = 1 so'm. Hamyon → «So'mga yechish» — kamida 1 ta real safar qilgan bo'lishingiz kerak." },
  { re: /g'ildirak|gildirak|ruletka|spin/i, a: "🎡 Omad g'ildiragi SAFAR PAYTIDA aylanadi — har safar 1 spin, har spin yutadi!" },
  { re: /plus|obuna/i, a: "💎 BirJoy Plus: 9 990 tanga/oy — cashback ×1.5. Birinchi oy BEPUL. Mini App → Bonus." },
  { re: /gap\b|davra/i, a: "👬 Gap: 3-6 do'st birga safar maqsadini bajarsa hammaga +500, bir kishiga POT +2000. Mini App → Do'st." },
  { re: /haydovchi\s+bo'l|ishga\s+kir|driver/i, a: "🚖 Haydovchi bo'lishni xohlaysizmi? 1067 dispetcheriga qo'ng'iroq qiling: 1067." },
  { re: /bekor|cancel|отмен/i, a: "✖️ Faol buyurtmani «📍 Buyurtmam» tugmasi orqali bekor qilishingiz mumkin." },
  // NOTE: bare "qayer" was too greedy — "uyimga taksi kerak QAYERdagiligni bilasanmi" wrongly hit
  // this. Require car/taxi/driver context (or "qayerga yetdi/keldi") so a booking isn't hijacked.
  { re: /mashina\w*\s*qayer|taksi\w*\s*qayer|haydovchi\s*qayer|мошина\s+қаер|qayer(da|ga)?\s+(yetdi|keldi|qoldi|bo'ldi)|qachon\s+kel/i, a: "📍 «Buyurtmam» tugmasini bosing — jonli kartada mashina qayerdaligini ko'rasiz." },
  { re: /referal|do'st\s+taklif|taklif\s+qil/i, a: "👥 Do'st taklif qiling: u ilk safarini qilsa SIZGA 1500, UNGA 5000 tanga (birinchi safar BEPUL)! Mini App → Do'st." },
  { re: /operator|dispetcher|yordam|help|aloqa/i, a: "☎️ Taksi bo'yicha: 1067 dispetcheriga qo'ng'iroq qiling (24/7). Boshqa savollar — shu yerda yozing, yordam beraman." },
];

/** Layer 1: pure rules. Never calls the LLM. */
export function parseIntent(text: string): Intent {
  const t = text.trim();
  if (t.length < 2 || t.startsWith("/")) return { type: "none" };
  for (const f of FAQ) if (f.re.test(t)) return { type: "faq", answer: f.a };
  if (BOOK_WORDS.test(t)) {
    const later = LATER_WORDS.test(t);
    const place = PLACE_RE.exec(t);
    return {
      type: "book",
      when: later ? "later" : "now",
      timeText: later ? (LATER_WORDS.exec(t)?.[0] ?? undefined) : undefined,
      addressQuery: place?.[1],
    };
  }
  return { type: "none" };
}

/** Layer 2: unresolved support question → LLM (if keys exist), else null. */
export async function aiSupport(memberId: number, text: string): Promise<string | null> {
  if (!llmAvailable()) return null;
  const system =
    "Sen BirJoy — Koson (O'zbekiston) shahrining yordamchisisan (Koson AI). Qisqa, samimiy o'zbekcha javob ber (2-3 jumla). " +
    "Pul o'tkazmalari yoki tanga operatsiyalarini O'ZING bajara olmaysan — foydalanuvchini bot tugmalariga yo'naltir. " +
    "«1067» faqat taksi dispetcherining raqami — uni faqat taksi haqidagi savolda tilga ol, brend sifatida emas (brend BirJoy).";
  return askLlm(memberId, text, system);
}

/** AI-1 helper: resolve the place guess against kas addresses (1 light call). */
export async function resolveAddress(query: string): Promise<{ id: number; name: string }[]> {
  try {
    const res = await getDataSource().searchAddresses(query);
    return res.slice(0, 3).map((a) => ({ id: a.id, name: a.name }));
  } catch {
    return [];
  }
}
