// 🛒 Koson AI provider #3 — bazar (do'kon mahsulotlari). Built on catalogFactory: only fetch.
// Search-only for now (buy happens in the Mini App / existing buy flow); the card shows the
// product + tanga price so the AI can recommend what's available. Gated by the shop module.
import { prisma } from "../../../db";
import { makeCatalogProvider } from "./catalogFactory";
import type { AiCard } from "./types";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export const bazarProvider = makeCatalogProvider({
  key: "bazar",
  title: "bozor/do'kon mahsulotlari (tanga bilan sotib olinadi)",
  flags: ["shop"],
  async fetch(terms: string[], limit: number): Promise<AiCard[]> {
    const OR = terms.flatMap((t) => [
      { name: { contains: t, mode: "insensitive" as const } },
      { description: { contains: t, mode: "insensitive" as const } },
      { category: { contains: t, mode: "insensitive" as const } },
    ]);
    const rows = await prisma.product.findMany({
      where: { active: true, stock: { gt: 0 }, OR },
      orderBy: [{ featured: "desc" }, { favCount: "desc" }, { sortOrder: "asc" }],
      take: limit,
    });
    return rows.map((r) => ({
      id: String(r.id),
      title: esc(r.name),
      subtitle: `🪙 ${r.priceTanga.toLocaleString("ru-RU")} tanga${r.oldPriceTanga ? ` (edi ${r.oldPriceTanga.toLocaleString("ru-RU")})` : ""} · 📦 ${r.stock} dona · «🛍 Do'kon» (Mini App)`,
    }));
  },
});
