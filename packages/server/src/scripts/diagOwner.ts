import "../env";
import { prisma } from "../db";
import { getMotorEcon } from "../services/garajService";
import { nextModel, upgradeCost, motorSpeed, MAKE_BASE } from "@t1067/shared";

(async () => {
  const tgId = process.argv[2] ?? "6506297119"; // owner default
  const econ = await getMotorEcon();
  const now = Date.now();
  const tu = await prisma.telegramUser.findFirst({ where: { id: tgId }, select: { memberId: true } });
  const memberId = tu?.memberId;
  if (!memberId) { console.log("no member for tg", tgId); await prisma.$disconnect(); return; }
  const m = await prisma.member.findUnique({ where: { id: memberId }, select: { coins: true, fullName: true } });
  console.log(`MEMBER ${memberId} (${m?.fullName}) coins=${Math.round(m?.coins ?? 0)} · cap=${econ.dailyEarnCap} · tank=${econ.fuelTankHours}h · upgradeFactor=${econ.carUpgradeFactor}`);
  const dayStart = new Date(`${new Date(now + 5 * 3600_000).toISOString().slice(0, 10)}T00:00:00+05:00`);
  const earnedToday = (await prisma.coinTxn.aggregate({ where: { memberId, kind: { in: ["motor_earn", "motor_taxi"] }, createdAt: { gte: dayStart } }, _sum: { amount: true } }))._sum.amount ?? 0;
  console.log(`TODAY motor earned: ${earnedToday} / cap ${econ.dailyEarnCap} → capRoom=${Math.max(0, (econ.dailyEarnCap as number) - earnedToday)}`);
  const cars = await prisma.garajCar.findMany({ where: { memberId, soldAt: null, serial: { not: null } }, select: { id: true, carCode: true, serial: true, engineHp: true, fueledUntilAt: true } });
  console.log(`\n${cars.length} car(s):`);
  for (const c of cars) {
    const fu = c.fueledUntilAt?.getTime() ?? 0;
    const dry = fu <= now;
    const next = nextModel(c.carCode);
    const cost = next ? upgradeCost(c.carCode, (econ.carUpgradeFactor as number) ?? 1.3) : 0;
    const owns = next ? cars.some((x) => x.carCode === next && x.id !== c.id) : false;
    const canUp = next && (m?.coins ?? 0) >= cost && (c.engineHp ?? 0) > 0 && !owns;
    console.log(`  #${c.serial} ${c.carCode} hp=${c.engineHp} fuelH=${((fu - now) / 3600000).toFixed(1)} ${dry ? "DRY(0earn)" : "fueled"} | →${next ?? "MAX"} cost=${cost} ${next ? (canUp ? "CAN UPGRADE" : owns ? "BLOCKED(own " + next + ")" : (c.engineHp ?? 0) <= 0 ? "BLOCKED(dead)" : (m?.coins ?? 0) < cost ? "BLOCKED(need " + cost + ")" : "?") : ""}`);
  }
  await prisma.$disconnect();
})();
