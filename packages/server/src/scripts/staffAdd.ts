// 👔 JAMOA J2 ops — add/update an employee from the VPS shell (J3 admin panel
// replaces this for daily use; this is the bootstrap + acceptance-test tool).
// VPS: cd /opt/app/packages/server && npx dotenv -e ../../.env -- npx tsx src/scripts/staffAdd.ts \
//        <telegramId> "<Ism Familiya>" <oylik_som> [rol] [orgNomi]
// Org yo'q bo'lsa yaratiladi (birinchi org = ishxonaning o'zi, ega = OWNER_TG).
import { prisma } from "../db";

const OWNER_TG = "6506297119"; // same single source as cashout.ts/shop.ts

async function main() {
  const [tgId, name, salary, role = "operator", orgName = "BirJoy ofis"] = process.argv.slice(2);
  if (!tgId || !name || !salary || !/^\d+$/.test(tgId) || !/^\d+$/.test(salary)) {
    console.log('Foydalanish: staffAdd.ts <telegramId> "<Ism>" <oylik_som> [rol] [orgNomi]');
    process.exit(1);
  }
  let org = await prisma.organization.findFirst({ where: { name: orgName } });
  if (!org) {
    org = await prisma.organization.create({ data: { name: orgName, ownerTelegramId: OWNER_TG } });
    console.log(`+ Organization #${org.id} "${org.name}" yaratildi (defaults: 09:00–18:00, Du–Sha, grace 10, tushlik 60)`);
  }
  const emp = await prisma.employee.upsert({
    where: { telegramId: tgId },
    create: { orgId: org.id, telegramId: tgId, name, role, monthlySalary: Number(salary) },
    update: { orgId: org.id, name, role, monthlySalary: Number(salary), active: true },
  });
  console.log(`✓ Employee #${emp.id} ${emp.name} (${emp.role}) — ${emp.monthlySalary.toLocaleString()} so'm/oy, org #${org.id}`);
  console.log(`Endi: flag yoqilmagan bo'lsa — npx tsx src/scripts/setFlag.ts jamoa on · xodim botda /ish yozadi`);
  await prisma.$disconnect();
}

void main();