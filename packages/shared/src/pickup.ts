// Pickup-picker helpers (pickup2). Pure — no DB, no network, no React — so the same matching the
// rider sees can be proven against the real kas catalog from a server-side script.
import type { SavedAddressView } from "./booking";

/**
 * What KIND of place this is, read off its own name. Drives both the emoji and the colour of the
 * icon badge — so the colour means something ("this is a school") instead of being decoration.
 */
export type PlaceKind = "school" | "bazaar" | "health" | "park" | "mahalla" | "gov" | "mosque" | "transit" | "food" | "other";

export function placeKind(name: string): PlaceKind {
  const n = name.toLowerCase();
  if (/maktab|litsey|kolej|universitet|bog'cha|bogcha/.test(n)) return "school";
  if (/bozor|do'kon|dokon|savdo|market/.test(n)) return "bazaar";
  if (/shifo|balnitsa|balnisa|poliklinika|dorixona|tibbiy/.test(n)) return "health";
  if (/bog'|bog |park|stadion|maydon/.test(n)) return "park";
  if (/mahalla|qishloq|ko'cha|kocha|guzar/.test(n)) return "mahalla";
  if (/hokim|bank|pochta|idora|sud|militsiya|bo'lim/.test(n)) return "gov";
  if (/masjid|jome/.test(n)) return "mosque";
  if (/bekat|vokzal|avtostansiya|yo'l|yol /.test(n)) return "transit";
  if (/kafe|restoran|choyxona|osh|bar /.test(n)) return "food";
  return "other";
}

const KIND_ICON: Record<PlaceKind, string> = {
  school: "🏫", bazaar: "🛒", health: "🏥", park: "🌳", mahalla: "🏘",
  gov: "🏛", mosque: "🕌", transit: "🚏", food: "🍽", other: "📍",
};

/** Emoji for a catalog place. Never a bare grey square (DIZAYN_QOIDALARI #10). */
export function placeIcon(name: string): string {
  return KIND_ICON[placeKind(name)];
}

/**
 * Fold the spelling differences riders actually type against the Latin kas catalog: apostrophe
 * marks (o'/g') vanish, the sh/ch digraphs collapse to one letter, and the pairs that sound alike
 * in Uzbek (q/k, x/h, v/w) merge. Deliberately NOT a phonetic or edit-distance guesser — see the
 * alias rule in server addressAlias.ts.
 */
export function foldName(s: string): string {
  return s
    .toLowerCase()
    .replace(/['''ʻʼ‘]/g, "")
    .replace(/sh/g, "s")
    .replace(/ch/g, "c")
    .replace(/[qk]/g, "k")
    .replace(/[xh]/g, "h")
    .replace(/[vw]/g, "v")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Vowels are where riders actually slip ("bazo" for "bozor", "markez" for "markaziy") — the
 * consonant skeleton almost always survives. Collapsing every vowel to one marker turns those
 * near-misses into exact matches. Used ONLY as the fallback pass below: on its own it would let
 * genuinely different places collide, so the strict pass always gets first refusal.
 */
function devowel(folded: string): string {
  return folded.replace(/[aeiou]/g, "@");
}

/**
 * Local catalog filter — the whole ~150-place list is already in memory client-side, so every
 * keystroke filters instantly instead of round-tripping through kas's narrower byName search.
 * Word-start matches rank above mid-word ones, so "bozor" leads with "Bozor ko'chasi".
 *
 * Two passes, in order — the second only runs when the first found NOTHING, so a correctly typed
 * query can never be polluted by loose matches:
 *   1. strict: folded substring (apostrophes, sh/ch, q/k, x/h, v/w already normalised)
 *   2. vowel-blind: same substring test on the consonant skeleton — this is what makes a
 *      mistyped "bazo" still find all three bozors (the bot's resolver is equally forgiving,
 *      server/bot/booking.ts:139-158; the Mini App was the stricter of the two until now).
 */
export function fuzzyFilter(q: string, list: SavedAddressView[]): SavedAddressView[] {
  const f = foldName(q);
  if (!f) return [];
  const pass = (needle: string, key: (s: string) => string): SavedAddressView[] => {
    const scored: { a: SavedAddressView; s: number }[] = [];
    for (const a of list) {
      const i = key(foldName(a.name)).indexOf(needle);
      if (i < 0) continue;
      scored.push({ a, s: i === 0 ? 0 : 1 });
    }
    scored.sort((x, y) => x.s - y.s || x.a.name.localeCompare(y.a.name));
    return scored.map((x) => x.a);
  };
  const strict = pass(f, (s) => s);
  if (strict.length > 0) return strict;
  const blind = pass(devowel(f), devowel);
  // ⛔ 3-BOSQICH (harf tushib qolgan yozuv, «bzor» → «bozor») ATAYLAB QO'SHILMADI.
  // Sinab ko'rildi: ketma-ketlik (subsequence) tekshiruvi «bzor» ni topadi, LEKIN o'sha
  // bilan «banisa» → «OBRON BALNITSA» ni ham topadi — ya'ni ALGORITM TAXMIN QILA BOSHLAYDI.
  // `addressAlias.ts:7` va shu fayldagi test aniq aytadi: taxmin qilingan moslik HAQIQIY
  // taksini NOTO'G'RI manzilga yuboradi. Qulaylik uchun bu xavfni olmaymiz.
  // To'g'ri yechim — botda allaqachon bor KURATSIYA QILINGAN alias jadvalini (bot/booking.ts:13)
  // Mini App'ga ham ulash: u taxmin qilmaydi, odam yozgan variantlarni bilib turadi.
  // Bu alohida, ongli tiket.
  return blind;
}
