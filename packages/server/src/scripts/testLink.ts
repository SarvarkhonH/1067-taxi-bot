// Test the on-demand link path end-to-end: phone -> kas1067 live lookup -> link -> profile.
// Usage: tsx src/scripts/testLink.ts [phone] [telegramId]
import "../env";
import { getMe, linkByPhone } from "../services/memberService";
import { prisma } from "../db";

const phone = process.argv[2] ?? "+998978072233"; // Kamolov Farux (a real driver)
const tgId = process.argv[3] ?? "999000999";

console.log(`Linking ${tgId} via phone ${phone} …`);
const res = await linkByPhone(tgId, phone, { firstName: "Test" });
console.log("link result:", res);

const me = await getMe(tgId);
if (me) {
  console.log(
    `me: [${me.type}] ${me.member.fullName} — ${me.stats.points} so'm, ${me.stats.trips} safar, daraja ${me.level.name}, o'rin ${me.rank}/${me.totalMembers}`,
  );
} else {
  console.log("me: not linked");
}

await prisma.$disconnect();
