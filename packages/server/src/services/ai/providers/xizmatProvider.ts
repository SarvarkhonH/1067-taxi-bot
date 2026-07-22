// 🔎 Koson AI provider #2 — xizmatlar/ustalar (services directory: santexnik, basseyn,
// servis, ...). Call-to-book: no order/execute — the card carries the phone number
// (Telegram auto-links +998… so the user taps to call). Ranking mirrors the directory:
// 1067-tekshiruvi ≥ verified ≥ rating. This is the fix for "basen kerak" → Chilla basseyn.
import { prisma } from "../../../db";
import type { AiCard, AiProvider } from "./types";

const INSP_PASS_MIN = 60; // public badge threshold (same as serviceDirectory)

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function inspTotal(r: { inspClean: number | null; inspProf: number | null; inspPrice: number | null; inspTrust: number | null; inspQuality: number | null }): number | null {
  const v = [r.inspClean, r.inspProf, r.inspPrice, r.inspTrust, r.inspQuality];
  return v.every((x) => x != null) ? (v as number[]).reduce((a, b) => a + b, 0) : null;
}

// Colloquial/misspelled → catalog forms. Kept small and high-frequency; each maps to the
// word the directory actually stores. The raw query + its words are always included too.
const SYN: Record<string, string> = {
  basen: "basseyn",
  bassein: "basseyn",
  hovuz: "hovuz",
  santehnik: "santexnik",
  parikmaxer: "sartarosh",
  massaj: "massaj",
  stamatolog: "stomatolog",
  tish: "tish",
};
function expandTerms(q: string): string[] {
  const words = q
    .toLowerCase()
    .split(/[^\p{L}\d]+/u)
    .filter((w) => w.length >= 3 && !["kerak", "uchun", "menga", "qayerda", "bormi", "topib", "top"].includes(w));
  const set = new Set<string>();
  if (q.length >= 3) set.add(q);
  for (const w of words) {
    set.add(w);
    if (SYN[w]) set.add(SYN[w]);
  }
  return [...set].slice(0, 6);
}

export const xizmatProvider: AiProvider = {
  key: "xizmat",
  title: "xizmatlar va ustalar (santexnik, basseyn, avtoservis, go'zallik, qurilish va h.k.)",
  flags: ["xizmatlar"],

  async search(query: string): Promise<AiCard[]> {
    const q = query.trim().slice(0, 60);
    if (q.length < 2) return [];
    // expand into candidate terms: colloquial/misspelled forms + per-word, so «basen»
    // finds «basseyn» and a two-word query still matches on either word
    const terms = expandTerms(q);
    const OR = terms.flatMap((t) => [
      { name: { contains: t, mode: "insensitive" as const } },
      { tags: { contains: t, mode: "insensitive" as const } },
      { desc: { contains: t, mode: "insensitive" as const } },
      { category: { is: { name: { contains: t, mode: "insensitive" as const } } } },
    ]);
    const rows = await prisma.serviceListing.findMany({
      where: { status: "active", OR },
      include: { category: { select: { name: true, emoji: true } } },
      orderBy: [{ isVip: "desc" }, { rankScore: "desc" }, { reviewCount: "desc" }, { name: "asc" }],
      take: 6,
    });
    return rows.map((r) => {
      const insp = inspTotal(r);
      const bits = [`${r.category.emoji} ${r.category.name}`];
      if (r.avgRating > 0) bits.push(`⭐ ${r.avgRating.toFixed(1)} (${r.reviewCount})`);
      if (insp != null && insp >= INSP_PASS_MIN) bits.push(`🏅 ${insp}`);
      if (r.verified) bits.push("✅");
      bits.push(`📞 ${r.phone}`); // Telegram auto-links → tap to call
      return { id: String(r.id), title: esc(r.name), subtitle: bits.join(" · ") } satisfies AiCard;
    });
  },
};
