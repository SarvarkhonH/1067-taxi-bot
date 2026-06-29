import "../env";
import { prisma } from "../db";
import { getMotorEcon } from "../services/garajService";

(async () => {
  const now = Date.now();
  const econ = await getMotorEcon();
  console.log("dailyEarnCap:", econ.dailyEarnCap, "fuelTankHours:", econ.fuelTankHours, "speedMult:", econ.speedMult, "fuelMult:", econ.fuelMult);
  const cars = await prisma.garajCar.findMany({ where: { soldAt: null, serial: { not: null } }, select: { id: true, memberId: true, carCode: true, serial: true, engineHp: true, fueledUntilAt: true, lastAccrualAt: true, source: true }, take: 30, orderBy: { id: "desc" } });
  console.log("total active motor cars:", cars.length);
  let dry = 0, dead = 0, earning = 0, neverFueled = 0;
  for (const c of cars) {
    const fu = c.fueledUntilAt?.getTime() ?? 0;
    const last = c.lastAccrualAt?.getTime() ?? now;
    const isDead = (c.engineHp ?? 0) <= 0;
    const isDry = fu <= last || fu <= now;
    if (!c.fueledUntilAt) neverFueled++;
    if (isDead) dead++; else if (isDry) dry++; else earning++;
    console.log(`#${c.serial} ${c.carCode} m${c.memberId} src=${c.source} hp=${c.engineHp} fuelLeftH=${((fu - now) / 3600000).toFixed(1)} ${isDead ? "DEAD" : isDry ? "DRY(0earn)" : "EARNING"}`);
  }
  console.log(`\nSUMMARY: EARNING=${earning} · DRY(need fuel)=${dry} · DEAD=${dead} · neverFueled=${neverFueled}`);
  await prisma.$disconnect();
})();
