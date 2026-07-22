// Read-only ops check: today's support messages (in/out) — AI answer quality review.
import "../env";
import { prisma } from "../db";

async function main() {
  const since = new Date(Date.now() - 12 * 3600_000);
  const msgs = await prisma.supportMsg.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "asc" },
    take: 40,
  });
  for (const m of msgs) {
    console.log(`[${m.createdAt.toISOString().slice(11, 16)}] ${m.direction === "in" ? "👤" : "🤖"} tg=${m.telegramId}: ${m.text.slice(0, 200)}`);
  }
  await prisma.$disconnect();
}

void main();
