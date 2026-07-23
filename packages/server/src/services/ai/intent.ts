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
  // NOTE: bare "yordam"/"help" was too greedy — "NIMA YORDAM BERA OLASAN" / "menga yordam kerak"
  // (asking what the AI can do) wrongly got deflected to "call the operator" instead of the AI
  // explaining itself. Require an explicit operator/dispatcher ask, not generic "help".
  { re: /operator|dispetcher|dispecher|qo'ng'iroq\s+qil.{0,15}(operator|dispetcher|1067)/i, a: "☎️ Taksi bo'yicha: 1067 dispetcheriga qo'ng'iroq qiling (24/7). Boshqa savollar — shu yerda yozing, yordam beraman." },
];

// 🔀 Pivot detection: while the bot is WAITING for a specific input (a name, an address, a
// knowledge fact), the user may change their mind and send a DIFFERENT clear request. This
// spots an unambiguous ACTION intent (not a mere topic word — a fact ABOUT a plumber must NOT
// pivot) so the wait can be cancelled and the message routed normally instead of mis-captured.
export function looksLikePivot(text: string): boolean {
  const t = text.toLowerCase().replace(/[''`]/g, "'").trim();
  if (t.startsWith("/")) return true; // a command always cancels a capture
  if (/\b(menga\s+taksi|taksi\s+(kerak|chaqir|yubor|top)|taxi\s+(kerak|chaqir)|mashina\s+(kerak|yubor)|taksi\s+chaqir)\b/.test(t)) return true;
  if (/\beslat(ib)?\b|\besimdan\s+chiqmasin\b/.test(t)) return true; // reminder request
  if (/\bbuyurtma\s+qil|ovqat\s+buyurtma|\bsotib\s+ol(moqchiman)?\b/.test(t)) return true;
  if (/\bqancha\s+ishlat|\bhisobotim\b|\bbalansim\b|\bnaxt\b/.test(t)) return true;
  return false;
}

// 💬 Rules-first small-talk — greetings/thanks/how-are-you get an INSTANT warm, varied reply with
// NO LLM call, so they ALWAYS work (even when the LLM is rate-limited or down — the #1 cause of a
// linked user's "Salom" getting no response). Returns null when it's not small-talk.
function pick(a: string[]): string {
  return a[Math.floor(Math.random() * a.length)]!;
}
export function smallTalk(text: string): string | null {
  const t = text.trim().toLowerCase().replace(/[''`!.,?]+/g, " ").replace(/\s+/g, " ").trim();
  if (t.length > 40) return null; // long messages are real requests, not small-talk
  if (/^(assalomu?\s*alaykum|assalom|salom|salomlar|alo|ale|hi+|hello|namas)/.test(t))
    return pick([
      "Assalomu alaykum! 😊 Men Koson AI. Taksi, ovqat, usta, xarid — nima kerak bo'lsa, shunchaki yozing yoki gapiring.",
      "Va alaykum assalom! 👋 Bugun sizga qanday yordam beray — taksimi, biror joydan buyurtmami?",
      "Salom-salom! 🌿 Xush kelibsiz. Koson bo'yicha nima kerak — ayting, darrov qilaman.",
    ]);
  if (/^(rahmat|raxmat|tashakkur|rahmatlar|katta rahmat)/.test(t))
    return pick(["Arzimaydi, sizga yordam berish menga rohat 😊", "Doim tayyorman! Yana biror narsa kerak bo'lsa — ayting 🙌", "Sog' bo'ling! 🌸 Yana chaqiring."]);
  if (/^(qalay|qale|yaxshimisiz|yaxshimsan|ishlar qalay|yaxshimi)/.test(t))
    return pick(["Rahmat, men zo'r! 😄 O'zingiz qalaysiz? Sizga qanday yordam beray?", "Yaxshi, ishlayapman! 💪 Sizga nima kerak — taksi, ovqat yoki boshqa narsa?"]);
  if (/^(ha|yo'q|yoq|ok|okay|xo'p|xop|mayli|bo'ldi|zo'r|super)$/.test(t)) return null; // let context handle these
  return null;
}

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
