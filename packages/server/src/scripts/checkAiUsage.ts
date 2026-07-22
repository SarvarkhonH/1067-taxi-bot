// Read-only ops check: did the AI fallback fire today? Prints ai_* counters.
import { prisma } from "../db";

async function main() {
  const rows = await prisma.appState.findMany({
    where: { key: { startsWith: "ai_" } },
    orderBy: { key: "desc" },
    take: 15,
  });
  if (!rows.length) {
    console.log("ai_* kalitlari yo'q — LLM hali birinchi marta chaqirilmagan.");
  } else {
    for (const r of rows) console.log(`${r.key} = ${r.value}`);
  }
  await prisma.$disconnect();
}

void main();
