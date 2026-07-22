// 📋 Koson AI provider #4 — e'lonlar (mahalla e'lon taxtasi, OLX-uslub). catalogFactory: only
// fetch. Search-only (call the seller — phone in the card, Telegram auto-links). Active + not
// expired ads only, top-boosted first. Gated by the elonlar module.
import { prisma } from "../../../db";
import { makeCatalogProvider } from "./catalogFactory";
import type { AiCard } from "./types";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export const elonProvider = makeCatalogProvider({
  key: "elon",
  title: "e'lonlar taxtasi (oldi-sotdi, ish, uy-joy, transport, yo'qoldi-topildi)",
  flags: ["elonlar"],
  async fetch(terms: string[], limit: number): Promise<AiCard[]> {
    const OR = terms.flatMap((t) => [
      { title: { contains: t, mode: "insensitive" as const } },
      { desc: { contains: t, mode: "insensitive" as const } },
      { category: { contains: t, mode: "insensitive" as const } },
    ]);
    const rows = await prisma.classifiedAd.findMany({
      where: { status: "active", expiresAt: { gt: new Date() }, OR },
      orderBy: [{ isTop: "desc" }, { createdAt: "desc" }],
      take: limit,
    });
    return rows.map((r) => ({
      id: String(r.id),
      title: esc(r.title),
      subtitle: `${r.priceSom != null ? `💰 ${r.priceSom.toLocaleString("ru-RU")} so'm` : "💬 Kelishiladi"} · 📞 ${r.phone}${r.isTop ? " · 📌 TOP" : ""}`,
    }));
  },
});
