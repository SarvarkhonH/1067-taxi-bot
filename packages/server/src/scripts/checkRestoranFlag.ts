// Read-only: restoran flag + catalog counts.
import "../env";
import { prisma } from "../db";

async function main(): Promise<void> {
  const f = await prisma.appState.findUnique({ where: { key: "feature:restoran" } });
  console.log("feature:restoran =", f?.value ?? "(satr yo'q → DEFAULT_OFF)");
  console.log("restoranlar:", await prisma.restaurant.count(), "| menyu:", await prisma.menuItem.count());
  await prisma.$disconnect();
}
void main();
