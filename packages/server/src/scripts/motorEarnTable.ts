import "../env";
import { MAKE_BASE, motorSpeed, computeMotorEarnNoFuel } from "@t1067/shared";
import { getMotorEcon } from "../services/garajService";

(async () => {
  const econ = await getMotorEcon();
  const speedMult = econ.speedMult ?? 1;
  const bonusSpeedMult = econ.bonusSpeedMult ?? 2;
  console.log(`mo:econ → speedMult=${speedMult}  bonusDays=${econ.bonusDays}  bonusSpeedMult=${bonusSpeedMult}  fuelTankHours=${econ.fuelTankHours}\n`);
  console.log("car       base    speed/hr   NET/24h(normal)   NET/24h(bonus week)");
  for (const [code, base] of Object.entries(MAKE_BASE)) {
    const sp = Math.round(motorSpeed(code) * speedMult);
    const spB = Math.round(motorSpeed(code) * speedMult * bonusSpeedMult);
    const net = computeMotorEarnNoFuel(sp, 24, 0).net;
    const netB = computeMotorEarnNoFuel(spB, 24, 0).net;
    console.log(`${code.padEnd(9)} ${String(base).padStart(6)}  ${String(sp).padStart(7)}   ${String(net).padStart(13)}   ${String(netB).padStart(15)}`);
  }
  console.log("\n(NET = gross − 10% wear; fuel is a separate upfront refill sink. Bonus week = first 7 days/player.)");
  await import("../db").then(({ prisma }) => prisma.$disconnect());
})();
