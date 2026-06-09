// Tests the streak + grant flow with a throwaway DRIVER member (grants are status-only,
// so NO real money is written to kas1067). Cleans up after itself.
import "../env";
import { prisma } from "../db";
import { dailyCheckIn } from "../services/rewardService";

const member = await prisma.member.upsert({
  where: { type_kasId: { type: "driver", kasId: "__test_streak__" } },
  create: { type: "driver", kasId: "__test_streak__", fullName: "Test Streak", phone: "+998000000000", points: 0 },
  update: {},
});
const id = member.id;
console.log("test member:", id);

console.log("check-in #1:", JSON.stringify(await dailyCheckIn(id)));

// simulate already at day 6, last check-in yesterday → next reaches day 7 (reward)
await prisma.streak.update({
  where: { memberId: id },
  data: { current: 6, lastCheckIn: new Date(Date.now() - 24 * 3600 * 1000) },
});
console.log("check-in -> day 7:", JSON.stringify(await dailyCheckIn(id)));

// idempotency: same day again should be 'alreadyChecked'
console.log("check-in same day:", JSON.stringify(await dailyCheckIn(id)));

const grants = await prisma.rewardGrant.findMany({ where: { memberId: id } });
console.log("grants:", grants.map((g) => `${g.amount} so'm "${g.reason}" appliedToKas=${g.appliedToKas}`));

// cleanup (cascades streak + grants)
await prisma.member.delete({ where: { id } });
console.log("cleaned up.");
await prisma.$disconnect();
