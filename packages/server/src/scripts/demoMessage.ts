// Renders the bot's profile + leaderboard messages to the console (no BOT_TOKEN needed).
import { prisma } from "../db";
import { runSync } from "../sync/sync";
import { getLeaderboard, getMeByMemberId } from "../services/memberService";
import { renderLeaderboard, renderProfile } from "../bot/render";

if ((await prisma.member.count()) === 0) await runSync();
const strip = (s: string) => s.replace(/<[^>]+>/g, "");

for (const type of ["driver", "client"] as const) {
  const top = await prisma.member.findFirst({ where: { type }, orderBy: { points: "desc" } });
  if (top) {
    const me = await getMeByMemberId(top.id);
    if (me) {
      console.log(`\n══════════ ${type.toUpperCase()} PROFIL ══════════\n`);
      console.log(strip(renderProfile(me)));
    }
  }
  console.log(`\n══════════ ${type.toUpperCase()} REYTING ══════════\n`);
  console.log(strip(renderLeaderboard(await getLeaderboard(type))));
}

await prisma.$disconnect();
