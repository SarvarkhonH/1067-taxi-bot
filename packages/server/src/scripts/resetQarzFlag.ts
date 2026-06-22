// One-shot: force the `qarz` feature row OFF (delete → DEFAULT_OFF = dark). Used after tests that
// flipped it on against the LIVE DB, so Bosqich 3 stays dark until owner pilot.
import "../env";
import { prisma } from "../db";

async function main(): Promise<void> {
  const before = await prisma.appState.findUnique({ where: { key: "feature:qarz" } });
  console.log("BEFORE feature:qarz =", before?.value ?? "(no row)");
  await prisma.appState.deleteMany({ where: { key: "feature:qarz" } });
  const after = await prisma.appState.findUnique({ where: { key: "feature:qarz" } });
  console.log("AFTER  feature:qarz =", after?.value ?? "(no row → DEFAULT_OFF = dark ✓)");
  await prisma.$disconnect();
}
main();
