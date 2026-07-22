// 🚐 Koson AI provider #5 — reys (shaharlararo). catalogFactory: only fetch. Route/city/date-
// based, so fetch matches the query terms against origin/dest CITY names and returns OPEN, future
// trips with free seats. Search-only (booking stays in the intercity flow). Gated by intercity.
import { prisma } from "../../../db";
import { makeCatalogProvider } from "./catalogFactory";
import type { AiCard } from "./types";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function whenLabel(d: Date): string {
  const w = new Date(d.getTime() + 5 * 3600_000);
  const days = ["Yak", "Dush", "Sesh", "Chor", "Pay", "Juma", "Shan"];
  return `${days[w.getUTCDay()]} ${String(w.getUTCDate()).padStart(2, "0")}.${String(w.getUTCMonth() + 1).padStart(2, "0")} ${String(w.getUTCHours()).padStart(2, "0")}:${String(w.getUTCMinutes()).padStart(2, "0")}`;
}

export const reysProvider = makeCatalogProvider({
  key: "reys",
  title: "shaharlararo reyslar (o'rindiq band qilish — Qarshi, Shahrisabz va h.k.)",
  flags: ["intercity"],
  async fetch(terms: string[], limit: number): Promise<AiCard[]> {
    // match query terms against city names → their ids → OPEN future trips to/from them
    const cityOR = terms.map((t) => ({ name: { contains: t, mode: "insensitive" as const } }));
    const cities = await prisma.intercityCity.findMany({ where: { OR: cityOR }, select: { id: true } });
    const ids = cities.map((c) => c.id);
    const rows = await prisma.intercityTrip.findMany({
      where: {
        status: "OPEN",
        scheduledAt: { gt: new Date() },
        ...(ids.length ? { OR: [{ destCityId: { in: ids } }, { originCityId: { in: ids } }] } : {}),
      },
      include: { originCity: { select: { name: true } }, destCity: { select: { name: true } } },
      orderBy: { scheduledAt: "asc" },
      take: limit,
    });
    return rows.map((r) => ({
      id: String(r.id),
      title: `${esc(r.originCity.name)} → ${esc(r.destCity.name)}`,
      subtitle: `🕐 ${whenLabel(r.scheduledAt)} · 💺 ${Math.max(0, r.carCapacity - r.bookedSeats)} joy · 💰 ${r.fareSom.toLocaleString("ru-RU")} so'm`,
    }));
  },
});
