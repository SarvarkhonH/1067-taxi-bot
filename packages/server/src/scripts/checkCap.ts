// Read-only: check daily AI-cap usage (global + owner's member) to diagnose silent cap-outs.
import "../env";
import { prisma } from "../db";

async function main() {
  const tu = await prisma.telegramUser.findUnique({ where: { id: "6506297119" } });
  console.log("memberId:", tu?.memberId);
  const day = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
  console.log("day:", day);
  const global = await prisma.appState.findUnique({ where: { key: `ai_used:${day}` } });
  console.log("global ai_used:", global?.value ?? "0", "/ 1200");
  if (tu?.memberId) {
    const mem = await prisma.appState.findUnique({ where: { key: `ai_member:${tu.memberId}:${day}` } });
    console.log("member cap:", mem?.value ?? "0", "/ 30");
  }
  await prisma.$disconnect();
}
void main();
