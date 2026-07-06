// Ops: issue a "shopseller" operator-token — narrow admin access (Do'kon CRUD only, requireShopWrite).
//   npx tsx src/scripts/grantShopSeller.ts
// Prints the ready-to-share admin URL. Revoke anytime from admin panel BOSHQARUV → optokens list.
import "../env";

async function main(): Promise<void> {
  const { prisma } = await import("../db");
  const token = Array.from({ length: 24 }, () => "abcdefghjkmnpqrstuvwxyz23456789"[Math.floor(Math.random() * 31)]).join("");
  await prisma.appState.create({ data: { key: `oprtoken:${token}`, value: "shopseller" } });
  console.log("🛍 Do'kon-sotuvchi token yaratildi.");
  console.log(`Link: https://admin-seven-ebon-95.vercel.app/?key=${token}`);
  console.log("Bekor qilish: admin panel → BOSHQARUV → operator-tokenlar ro'yxati → 🗑");
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
