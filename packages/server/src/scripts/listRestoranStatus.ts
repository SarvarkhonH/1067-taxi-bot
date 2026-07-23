// Read-only: list Restaurant rows + menu item counts + photo status (no writes).
import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, "../../../..", ".env") });

async function main(): Promise<void> {
  const { prisma } = await import("../db");
  const restaurants = await prisma.restaurant.findMany({
    orderBy: { id: "asc" },
    include: { _count: { select: { menuItems: true } } },
  });
  for (const r of restaurants) {
    console.log(
      `#${r.id} | ${r.name} | active=${r.active} | phone=${r.phone} | menu=${r._count.menuItems} | photoFileId=${r.photoFileId ?? "-"} | photoUrl=${r.photoUrl ?? "-"}`
    );
  }
  console.log(`\nJami: ${restaurants.length} restoran`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("CRASHED:", e);
  process.exit(1);
});
