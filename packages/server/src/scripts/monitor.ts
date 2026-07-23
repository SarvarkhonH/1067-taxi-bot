// Read-only live monitoring: last-24h AI/support convos grouped per user, newest first.
import "../env";
import { prisma } from "../db";

async function main() {
  const hrs = Number(process.argv[2] || 24);
  const since = new Date(Date.now() - hrs * 3600_000);
  const rows = await prisma.supportMsg.findMany({
    where: { createdAt: { gte: since }, shopId: null },
    orderBy: { createdAt: "asc" },
    take: 800,
  });
  const byUser = new Map<string, typeof rows>();
  for (const r of rows) {
    const arr = byUser.get(r.telegramId) ?? [];
    arr.push(r);
    byUser.set(r.telegramId, arr);
  }
  // link-lookup for names
  const ids = [...byUser.keys()];
  const tus = await prisma.telegramUser.findMany({ where: { id: { in: ids } } });
  const nameOf = new Map(tus.map((t) => [t.id, [(t as any).firstName, (t as any).username].filter(Boolean).join(" @")]));
  // order users by their latest msg
  const ordered = [...byUser.entries()].sort((a, b) => (b[1].at(-1)?.createdAt.getTime() ?? 0) - (a[1].at(-1)?.createdAt.getTime() ?? 0));
  console.log(`=== LIVE MONITOR — last ${hrs}h · ${ordered.length} users · ${rows.length} msgs ===\n`);
  for (const [tg, arr] of ordered) {
    console.log(`──── tg=${tg} ${nameOf.get(tg) ? "(" + nameOf.get(tg) + ")" : "(unlinked)"} · ${arr.length} msgs ────`);
    for (const x of arr) {
      console.log(`  [${x.createdAt.toISOString().slice(5, 16)}] ${x.direction === "in" ? "👤" : "🤖"} ${x.text.replace(/\n/g, " ").slice(0, 240)}`);
    }
    console.log("");
  }
  await prisma.$disconnect();
}
void main();
