// 🎮 F4 (OYIN_KARTA_PLAN.md §15) — safar-yakun o'yin-progress qatori tekshiruvi.
// TEST_DATABASE_URL'da (birjoy_test) — app DB'ga HECH QACHON. Qayta yugurtirish:
//   cd packages/server && npx dotenv -e ../../.env -- npx tsx src/scripts/testRideFinishBallLine.ts
import "./_testDb";

const MEMBER_WITH_GOAL = -900400; // o'z maqsadini tanlagan (real prizeKey)
const MEMBER_NO_GOAL = -900401;   // maqsad tanlamagan — standart (eng arzon ochiq) mantiqqa tushadi
const GOAL_PRIZE_KEY = "uzum-tecno-spark-go-3-0"; // seed katalogidagi haqiqiy kalit, narxi 69300

function ok(cond: boolean, label: string): void {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) process.exitCode = 1;
}

async function main(): Promise<void> {
  const { prisma } = await import("../db");
  const svc = await import("../services/oyinService");
  const { setFeature, __resetFeatureCache } = await import("../services/featureFlags");
  const { setSeason } = await import("../services/oyinSeason");

  const adjKey = (id: number) => `oyin:adj:${id}`;
  const goalKey = (id: number) => `oyin:goal:${id}`;
  const allKeys = [adjKey(MEMBER_WITH_GOAL), adjKey(MEMBER_NO_GOAL), goalKey(MEMBER_WITH_GOAL), goalKey(MEMBER_NO_GOAL)];

  const cleanup = async (): Promise<void> => {
    await prisma.appState.deleteMany({ where: { key: { in: allKeys } } });
  };
  await cleanup();

  // ── Test 1: flag OFF → bo'sh qator
  const offLine = await svc.rideFinishBallLine(MEMBER_WITH_GOAL);
  ok(offLine === "", "1. flag OFF: bo'sh qator qaytadi");

  await setFeature("oyin", true);
  __resetFeatureCache();

  // ── Test 2: mavsum sozlanmagan (yoki faol emas) → bo'sh qator
  const noSeasonLine = await svc.rideFinishBallLine(MEMBER_WITH_GOAL);
  ok(noSeasonLine === "", "2. mavsum faol emas: bo'sh qator qaytadi");

  const now = new Date();
  await setSeason({ startIso: new Date(now.getTime() - 24 * 3600_000).toISOString(), endIso: new Date(now.getTime() + 30 * 24 * 3600_000).toISOString(), label: "F4TEST" });

  // ── Test 3: o'z maqsadi bor, ball YETARSIZ (500 < 69300)
  await prisma.appState.create({ data: { key: goalKey(MEMBER_WITH_GOAL), value: GOAL_PRIZE_KEY } });
  await prisma.appState.create({ data: { key: adjKey(MEMBER_WITH_GOAL), value: JSON.stringify({ total: 500, log: [{ ball: 500, reason: "test", at: now.toISOString() }] }) } });
  const shortLine = await svc.rideFinishBallLine(MEMBER_WITH_GOAL);
  ok(shortLine.includes("500 ball") && shortLine.includes("TECNO"), `3. Yetarsiz ball: joriy balans+sovrin nomi ko'rinadi — "${shortLine.trim()}"`);
  ok(shortLine.includes("yana") && shortLine.includes("kerak"), "3b. 'yana ... kerak' matni bor");

  // ── Test 4: o'z maqsadi bor, ball YETARLI (69300 >= 69300)
  await prisma.appState.update({ where: { key: adjKey(MEMBER_WITH_GOAL) }, data: { value: JSON.stringify({ total: 69300, log: [{ ball: 69300, reason: "test", at: now.toISOString() }] }) } });
  const enoughLine = await svc.rideFinishBallLine(MEMBER_WITH_GOAL);
  ok(enoughLine.includes("yetarli") && enoughLine.includes("kartaga aylantiring"), `4. Yetarli ball: "yetarli, kartaga aylantiring" — "${enoughLine.trim()}"`);

  // ── Test 5: maqsad TANLANMAGAN — standart (eng arzon ochiq sovrin) mantiqqa tushadi
  await prisma.appState.create({ data: { key: adjKey(MEMBER_NO_GOAL), value: JSON.stringify({ total: 10, log: [{ ball: 10, reason: "test", at: now.toISOString() }] }) } });
  const fallbackLine = await svc.rideFinishBallLine(MEMBER_NO_GOAL);
  ok(fallbackLine.includes("10 ball") && fallbackLine.length > 0, `5. Maqsadsiz a'zo — standart sovringa tushadi (bo'sh emas) — "${fallbackLine.trim()}"`);

  await cleanup();
  const remaining = await prisma.appState.count({ where: { key: { in: allKeys } } });
  ok(remaining === 0, "6. Tozalashdan keyin test qatorlari qolmadi");

  console.log(process.exitCode ? "\n❌ BA'ZI TEKSHIRUVLAR YIQILDI" : "\n✅ HAMMA TEKSHIRUV O'TDI — F4 ishlaydi");
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => process.exit(process.exitCode ?? 0));
