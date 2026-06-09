import "../env";
import { prisma } from "../db";
import { canSpinWheel, spinWheel } from "../services/rewardService";

const m = await prisma.member.upsert({
  where: { type_kasId: { type: "driver", kasId: "__test_wheel__" } },
  create: { type: "driver", kasId: "__test_wheel__", fullName: "TW", phone: "+998000000001", points: 0 },
  update: {},
});
console.log("canSpin before:", await canSpinWheel(m.id));
console.log("spin 1:", JSON.stringify(await spinWheel(m.id)));
console.log("spin 2 same day (must be alreadySpun):", JSON.stringify(await spinWheel(m.id)));
console.log("canSpin after:", await canSpinWheel(m.id));
await prisma.member.delete({ where: { id: m.id } });
console.log("cleaned up.");
await prisma.$disconnect();
