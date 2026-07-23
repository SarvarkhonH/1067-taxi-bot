// READ-ONLY: how many menu items (across all restaurants) have a photo uploaded?
import "../env";
import { prisma } from "../db";

async function main(): Promise<void> {
  const total = await prisma.menuItem.count();
  const withFileId = await prisma.menuItem.count({ where: { photoFileId: { not: null } } });
  const withUrl = await prisma.menuItem.count({ where: { photoUrl: { not: null } } });
  const available = await prisma.menuItem.count({ where: { available: true } });
  console.log(`total=${total} withPhotoFileId=${withFileId} withPhotoUrl=${withUrl} available=${available}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
