// Read-only: dump live feature-flag state relevant to the Koson AI plan.
import "../env";
import { prisma } from "../db";

async function main() {
  const rows = await prisma.appState.findMany({ where: { key: { startsWith: "feature:" } }, orderBy: { key: "asc" } });
  const AI_FLAGS = ["aibrain", "airemind", "aihisob", "aidost", "aicity", "aibilim", "aineeds"];
  const map = new Map(rows.map((r) => [r.key.slice(8), r.value]));
  console.log("=== AI-related flags (live DB) ===");
  for (const f of AI_FLAGS) console.log(`  ${f}: ${map.get(f) ?? "(no row = OFF, default-off)"}`);
  console.log("\n=== OTHER content flags relevant to Koson AI providers ===");
  for (const f of ["restoran", "xizmatlar", "bazar", "elonlar", "intercity", "shop"]) console.log(`  ${f}: ${map.get(f) ?? "(no row)"}`);
  console.log(`\n=== total feature: rows in DB: ${rows.length} ===`);
  await prisma.$disconnect();
}
void main();
