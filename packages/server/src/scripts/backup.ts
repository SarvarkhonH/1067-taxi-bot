// Portable logical backup: dumps every table to a timestamped JSON snapshot
// (no pg_dump dependency). Restorable via restore.ts. Run: tsx backup.ts
import "../env";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "../db";
import { repoRoot } from "../env";

async function main(): Promise<void> {
  const snapshot: Record<string, unknown[]> = {};
  // every model in the schema
  const tables = {
    member: () => prisma.member.findMany(),
    telegramUser: () => prisma.telegramUser.findMany(),
    coinTxn: () => prisma.coinTxn.findMany(),
    withdrawal: () => prisma.withdrawal.findMany(),
    rewardGrant: () => prisma.rewardGrant.findMany(),
    streak: () => prisma.streak.findMany(),
    wheelSpin: () => prisma.wheelSpin.findMany(),
    missionProgress: () => prisma.missionProgress.findMany(),
    boxOpen: () => prisma.boxOpen.findMany(),
    weeklyScore: () => prisma.weeklyScore.findMany(),
    referral: () => prisma.referral.findMany(),
    memberAchievement: () => prisma.memberAchievement.findMany(),
    appState: () => prisma.appState.findMany(),
    syncRun: () => prisma.syncRun.findMany(),
  };

  let total = 0;
  for (const [name, fn] of Object.entries(tables)) {
    const rows = await fn();
    snapshot[name] = rows;
    total += rows.length;
    console.log(`  ${name}: ${rows.length}`);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = resolve(repoRoot, "backups");
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, `snapshot-${stamp}.json`);
  writeFileSync(file, JSON.stringify({ at: stamp, total, tables: snapshot }, null, 0));
  console.log(`\n✅ ${total} rows → ${file}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
