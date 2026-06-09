// Dev helper: link a Telegram id to the top member of a type, and make it admin.
// Usage: tsx src/scripts/devLink.ts [telegramId=12345] [type=driver]
import "../env";
import type { MemberType } from "@t1067/shared";
import { prisma } from "../db";

const id = process.argv[2] ?? "12345";
const type = (process.argv[3] as MemberType) ?? "driver";

const member = await prisma.member.findFirst({ where: { type }, orderBy: { points: "desc" } });
if (!member) {
  console.error(`No ${type} members found. Run \`pnpm db:seed\` first.`);
  process.exit(1);
}

await prisma.telegramUser.upsert({
  where: { id },
  create: { id, memberId: member.id, linkedAt: new Date(), firstName: "Demo", isAdmin: true },
  update: { memberId: member.id, linkedAt: new Date(), isAdmin: true },
});

console.log(`Linked telegram ${id} -> [${type}] ${member.fullName} (#${member.id}) [admin]`);
await prisma.$disconnect();
