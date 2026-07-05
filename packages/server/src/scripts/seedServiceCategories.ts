// 🔎 XIZMATLAR: seed the 10 default categories (idempotent — creates only missing ones).
// Usage: npx tsx src/scripts/seedServiceCategories.ts
import "../env"; // loads repo-root .env → DATABASE_URL (app DB)
import { seedDefaultCategories } from "../services/serviceDirectory";
import { prisma } from "../db";

const created = await seedDefaultCategories();
const total = await prisma.serviceCategory.count();
console.log(`✅ Kategoriyalar: ${created} ta yangi yaratildi, jami ${total} ta.`);
await prisma.$disconnect();
