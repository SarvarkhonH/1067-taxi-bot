// 🔎 Koson AI provider #2 — xizmatlar/ustalar (services directory). Now built on the generic
// catalogFactory: only `fetch` (the module-specific query + card) is supplied here — term
// expansion, synonyms and limits live in the factory. Call-to-book: the card carries the phone
// (Telegram auto-links +998…). Ranking mirrors the directory: 1067-tekshiruvi ≥ verified ≥ rating.
import { prisma } from "../../../db";
import { makeCatalogProvider } from "./catalogFactory";
import type { AiCard } from "./types";

const INSP_PASS_MIN = 60; // public badge threshold (same as serviceDirectory)

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function inspTotal(r: { inspClean: number | null; inspProf: number | null; inspPrice: number | null; inspTrust: number | null; inspQuality: number | null }): number | null {
  const v = [r.inspClean, r.inspProf, r.inspPrice, r.inspTrust, r.inspQuality];
  return v.every((x) => x != null) ? (v as number[]).reduce((a, b) => a + b, 0) : null;
}

export const xizmatProvider = makeCatalogProvider({
  key: "xizmat",
  title: "xizmatlar va ustalar (santexnik, basseyn, avtoservis, go'zallik, qurilish va h.k.)",
  flags: ["xizmatlar"],
  synonyms: { basen: "basseyn", bassein: "basseyn", santehnik: "santexnik", parikmaxer: "sartarosh", stamatolog: "stomatolog" },
  async fetch(terms: string[], limit: number): Promise<AiCard[]> {
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
      take: limit,
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
});
