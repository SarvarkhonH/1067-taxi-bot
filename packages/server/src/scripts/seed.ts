import { prisma } from "../db";
import { runSync } from "../sync/sync";
import { getLeaderboard } from "../services/memberService";

const s = await runSync();
console.log(`Seeded via ${s.source}: ${s.membersSeen} members, ${s.newAchievements.length} achievements\n`);

for (const type of ["driver", "client"] as const) {
  const lb = await getLeaderboard(type);
  console.log(`${type} leaderboard (${lb.metricLabel}):`);
  for (const e of lb.entries.slice(0, 5)) {
    console.log(`  #${e.rank} ${e.level.emoji} ${e.fullName} — ${e.points}`);
  }
  console.log("");
}

await prisma.$disconnect();
