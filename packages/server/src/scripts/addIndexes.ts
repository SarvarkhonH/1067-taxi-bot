// T2 (AUDIT 2.4-2.6,2.11 + count-ahead) — indekslarni JONLI PG'da CONCURRENTLY
// yaratadi (yozuvni bloklamaydi, shart-2). Nomlar Prisma konvensiyasiga mos —
// keyingi `db push` ularni mavjud deb biladi, qayta yaratmaydi.
// Run: dotenv -e ../../.env -- tsx src/scripts/addIndexes.ts
import "../env";
import { prisma } from "../db";

const INDEXES = [
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Member_type_carNumber_idx" ON "Member" ("type", "carNumber")`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Member_phone_idx" ON "Member" ("phone")`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Member_type_points_idx" ON "Member" ("type", "points")`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS "CoinTxn_memberId_createdAt_idx" ON "CoinTxn" ("memberId", "createdAt")`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS "RideReward_createdAt_idx" ON "RideReward" ("createdAt")`,
];

async function main(): Promise<void> {
  for (const sql of INDEXES) {
    const name = sql.match(/"([^"]+_idx)"/)![1];
    const t = Date.now();
    try {
      // CONCURRENTLY tranzaksiya ichida ishlamaydi — executeRawUnsafe bitta statement yuboradi
      await prisma.$executeRawUnsafe(sql);
      console.log(`✅ ${name} (${Date.now() - t}ms)`);
    } catch (e) {
      console.log(`⚠️ ${name}: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    }
  }
  // tekshirish: indekslar bazada bormi
  const rows = await prisma.$queryRawUnsafe<{ indexname: string }[]>(
    `SELECT indexname FROM pg_indexes WHERE indexname IN ('Member_type_carNumber_idx','Member_phone_idx','Member_type_points_idx','CoinTxn_memberId_createdAt_idx','RideReward_createdAt_idx') ORDER BY indexname`,
  );
  console.log("\nBazada mavjud:", rows.map((r) => r.indexname).join(", ") || "(yo'q)");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
