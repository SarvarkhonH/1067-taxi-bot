// Clear all mirrored data (members, links, achievements, sync runs) — keeps schema.
import "../env";
import { prisma } from "../db";

await prisma.memberAchievement.deleteMany();
await prisma.telegramUser.deleteMany();
await prisma.member.deleteMany();
await prisma.syncRun.deleteMany();

console.log("Cleared: members, telegram users, achievements, sync runs.");
await prisma.$disconnect();
