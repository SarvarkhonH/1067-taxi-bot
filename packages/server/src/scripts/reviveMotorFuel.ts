// 🚗 FAZA7 — one-time FREE fuel top-up for all live motor cars (fixes "cars stopped earning" after the
// 24h tank ran dry). Owner chose: keep manual fuel but a longer tank (72h). This revives DRY cars with a
// fresh tank (clock reset → no back-pay for the dry gap) and EXTENDS earning cars (keeps pending earn).
// Free (no tanga charge). Run: npx dotenv -e ../../.env -- tsx src/scripts/reviveMotorFuel.ts [--dry]
import "../env";
import { prisma } from "../db";
import { getMotorEcon } from "../services/garajService";

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry");
  const now = Date.now();
  const econ = await getMotorEcon();
  const tankMs = Math.max(1, Math.min(168, Math.floor(econ.fuelTankHours ?? 72))) * 3_600_000;
  const cars = await prisma.garajCar.findMany({ where: { soldAt: null, serial: { not: null }, engineHp: { gt: 0 } }, select: { id: true, fueledUntilAt: true } });
  let revivedDry = 0, extended = 0;
  for (const c of cars) {
    const fu = c.fueledUntilAt?.getTime() ?? 0;
    const isDry = fu <= now;
    const newFu = new Date(Math.max(fu, now + tankMs));
    if (isDry) revivedDry++; else extended++;
    if (!dryRun) {
      await prisma.garajCar.update({ where: { id: c.id }, data: isDry ? { fueledUntilAt: newFu, lastAccrualAt: new Date(now) } : { fueledUntilAt: newFu } });
    }
  }
  console.log(`${dryRun ? "[DRY RUN] would revive" : "✅ revived"}: ${revivedDry} dry cars (fresh ${Math.round(tankMs / 3_600_000)}h tank) + ${extended} earning cars extended (${cars.length} total). FREE.`);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect().catch(() => undefined); process.exit(1); });
