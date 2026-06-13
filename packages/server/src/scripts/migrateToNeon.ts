// DB ko'chirish: Render Postgres (manba = DATABASE_URL) → Neon (NEON_URL).
// pg_dump yo'q — Prisma orqali jadval-ma'lumotini FK-xavfsiz tartibda kopyalaymiz,
// keyin autoincrement sequence'larni tiklaymiz. Schema avval `db push` bilan Neon'da.
// Run: NEON_URL="postgres://...neon.tech/...?sslmode=require" dotenv -e ../../.env -- tsx src/scripts/migrateToNeon.ts
import "../env";
import { PrismaClient } from "@prisma/client";

const NEON = process.env.NEON_URL;
if (!NEON) {
  console.error("NEON_URL env kerak (Neon connection string).");
  process.exit(1);
}

const source = new PrismaClient(); // DATABASE_URL = Render
const target = new PrismaClient({ datasources: { db: { url: NEON } } });

// FK-xavfsiz tartib: ota jadvallar avval, bolalar keyin.
const ORDER: { model: string; table: string; serial: boolean }[] = [
  { model: "appState", table: "AppState", serial: false },
  { model: "syncRun", table: "SyncRun", serial: true },
  { model: "itemType", table: "ItemType", serial: true },
  { model: "shop", table: "Shop", serial: true },
  { model: "corpAccount", table: "CorpAccount", serial: true },
  { model: "gap", table: "Gap", serial: true },
  { model: "member", table: "Member", serial: true },
  { model: "telegramUser", table: "TelegramUser", serial: false },
  { model: "memberAchievement", table: "MemberAchievement", serial: true },
  { model: "streak", table: "Streak", serial: true },
  { model: "missionProgress", table: "MissionProgress", serial: true },
  { model: "memberCar", table: "MemberCar", serial: true },
  { model: "rideGuess", table: "RideGuess", serial: true },
  { model: "rideReward", table: "RideReward", serial: true },
  { model: "wheelSpin", table: "WheelSpin", serial: true },
  { model: "coinTxn", table: "CoinTxn", serial: true },
  { model: "withdrawal", table: "Withdrawal", serial: true },
  { model: "weeklyScore", table: "WeeklyScore", serial: true },
  { model: "boxOpen", table: "BoxOpen", serial: true },
  { model: "rewardGrant", table: "RewardGrant", serial: true },
  { model: "notifyLog", table: "NotifyLog", serial: true },
  { model: "rideRating", table: "RideRating", serial: true },
  { model: "scheduledRide", table: "ScheduledRide", serial: true },
  { model: "familyMember", table: "FamilyMember", serial: true },
  { model: "transfer", table: "Transfer", serial: true },
  { model: "referral", table: "Referral", serial: true },
  { model: "driverRecruit", table: "DriverRecruit", serial: true },
  { model: "item", table: "Item", serial: true },
  { model: "itemListing", table: "ItemListing", serial: true },
  { model: "listing", table: "Listing", serial: true },
  { model: "shopOrder", table: "ShopOrder", serial: true },
  { model: "gapMember", table: "GapMember", serial: true },
  { model: "corpEmployee", table: "CorpEmployee", serial: true },
  { model: "tradeOffer", table: "TradeOffer", serial: true },
  { model: "tradeMessage", table: "TradeMessage", serial: true },
];

async function main(): Promise<void> {
  console.log("=== Render → Neon ko'chirish ===\n");
  // ulanish sinovi
  const srcN = await source.member.count();
  const tgtBefore = await target.member.count().catch((e) => {
    console.error("Neon'ga ulanib bo'lmadi yoki schema yo'q — avval `prisma db push` (NEON):", e instanceof Error ? e.message : e);
    process.exit(1);
  });
  console.log(`Manba (Render) Member: ${srcN} · Maqsad (Neon) Member: ${tgtBefore}\n`);

  let totalRows = 0;
  for (const { model, table } of ORDER) {
    // @ts-expect-error dynamic delegate access
    const rows: unknown[] = await source[model].findMany();
    if (rows.length === 0) {
      console.log(`· ${table}: 0`);
      continue;
    }
    // @ts-expect-error dynamic delegate access
    const res = await target[model].createMany({ data: rows, skipDuplicates: true });
    totalRows += res.count;
    console.log(`✅ ${table}: ${res.count}/${rows.length}`);
  }

  // sequence'larni tiklash (explicit id'lar bilan kiritildi — sequence ortda qoladi)
  console.log("\n— sequence tiklash —");
  for (const { table, serial } of ORDER) {
    if (!serial) continue;
    try {
      await target.$executeRawUnsafe(
        `SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), GREATEST((SELECT COALESCE(MAX(id), 0) FROM "${table}"), 1))`,
      );
    } catch (e) {
      console.log(`⚠️ ${table} seq: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
    }
  }

  const tgtAfter = await target.member.count();
  console.log(`\n🎉 Ko'chirildi: ${totalRows} satr. Neon Member: ${tgtAfter}`);
  await source.$disconnect();
  await target.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
