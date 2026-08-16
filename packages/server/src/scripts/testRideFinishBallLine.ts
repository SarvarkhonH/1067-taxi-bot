// 🎮 F4 (OYIN_KARTA_PLAN.md §15) — safar-yakun o'yin-progress qatori tekshiruvi.
// TEST_DATABASE_URL'da (birjoy_test) — app DB'ga HECH QACHON. Qayta yugurtirish:
//   cd packages/server && npx dotenv -e ../../.env -- npx tsx src/scripts/testRideFinishBallLine.ts
import "./_testDb";

const GOAL_PRIZE_KEY = "uzum-tecno-spark-go-3-0"; // seed katalogidagi haqiqiy kalit, narxi 69300
const KAS_TAG_A = "F4TEST_WITHGOAL";
const KAS_TAG_B = "F4TEST_NOGOAL";
const TG_ID_A = "9009009002";
const TG_ID_B = "9009009003";

function ok(cond: boolean, label: string): void {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) process.exitCode = 1;
}

async function main(): Promise<void> {
  const { prisma } = await import("../db");
  const svc = await import("../services/oyinService");
  const { setFeature, __resetFeatureCache } = await import("../services/featureFlags");
  const { setSeason } = await import("../services/oyinSeason");
  // computeBallMap() 60s+mavsum-keshlanadi (adminAdjustBall kabi xizmat funksiyalari yozgach
  // o'zi invalidatsiya qiladi) — bu skript AppState'ga TO'G'RIDAN-TO'G'RI yozgani uchun har
  // yozuvdan keyin QO'LDA invalidatsiya qilinishi shart, aks holda eski keshdan o'qiladi.
  const invalidate = svc.invalidateBallCacheExternal;

  const cleanupMembers = async (): Promise<void> => {
    await prisma.telegramUser.deleteMany({ where: { id: { in: [TG_ID_A, TG_ID_B] } } });
    await prisma.member.deleteMany({ where: { kasId: { in: [KAS_TAG_A, KAS_TAG_B] } } });
  };
  const stateKeysFor = (memberId: number) => [`oyin:adj:${memberId}`, `oyin:goal:${memberId}`];

  await cleanupMembers();

  // ⚠️ getBall() → computeBallMap() FAQAT `TelegramUser` jadvalini aylanadi (AppState emas) —
  // manfiy/DB-siz sinov-ID'lar unda HECH QACHON ko'rinmaydi (R1'dan xuddi shu saboq). Shu sabab
  // HAQIQIY (lekin izolyatsiyalangan test-bazadagi) Member+TelegramUser qatorlari kerak.
  const memberWithGoal = await prisma.member.create({ data: { type: "client", kasId: KAS_TAG_A, fullName: "F4 Sinov (maqsadli)" } });
  await prisma.telegramUser.create({ data: { id: TG_ID_A, memberId: memberWithGoal.id, firstName: "F4A" } });
  const memberNoGoal = await prisma.member.create({ data: { type: "client", kasId: KAS_TAG_B, fullName: "F4 Sinov (maqsadsiz)" } });
  await prisma.telegramUser.create({ data: { id: TG_ID_B, memberId: memberNoGoal.id, firstName: "F4B" } });

  const allKeys = [...stateKeysFor(memberWithGoal.id), ...stateKeysFor(memberNoGoal.id)];
  const cleanupState = async (): Promise<void> => {
    await prisma.appState.deleteMany({ where: { key: { in: allKeys } } });
  };
  await cleanupState();

  // ── Test 1: flag OFF → bo'sh qator (oldingi yugurishdan qolgan holatga qaramay ATAYLAB o'chiriladi)
  await setFeature("oyin", false);
  __resetFeatureCache();
  const offLine = await svc.rideFinishBallLine(memberWithGoal.id);
  ok(offLine === "", `1. flag OFF: bo'sh qator qaytadi (oldi: "${offLine.trim()}")`);

  await setFeature("oyin", true);
  __resetFeatureCache();

  // ── Test 2: mavsum FAOL EMAS (ATAYLAB kelajakka o'rnatiladi) → bo'sh qator
  const now = new Date();
  await setSeason({ startIso: new Date(now.getTime() + 10 * 24 * 3600_000).toISOString(), endIso: new Date(now.getTime() + 40 * 24 * 3600_000).toISOString(), label: "F4TEST" });
  const noSeasonLine = await svc.rideFinishBallLine(memberWithGoal.id);
  ok(noSeasonLine === "", `2. mavsum faol emas: bo'sh qator qaytadi (oldi: "${noSeasonLine.trim()}")`);

  await setSeason({ startIso: new Date(now.getTime() - 24 * 3600_000).toISOString(), endIso: new Date(now.getTime() + 30 * 24 * 3600_000).toISOString(), label: "F4TEST" });

  // ── Test 3: o'z maqsadi bor, ball YETARSIZ (500 < 69300)
  await prisma.appState.create({ data: { key: `oyin:goal:${memberWithGoal.id}`, value: GOAL_PRIZE_KEY } });
  await prisma.appState.create({ data: { key: `oyin:adj:${memberWithGoal.id}`, value: JSON.stringify({ total: 500, log: [{ ball: 500, reason: "test", at: now.toISOString() }] }) } });
  invalidate();
  const shortLine = await svc.rideFinishBallLine(memberWithGoal.id);
  ok(shortLine.includes("500 ball") && shortLine.includes("TECNO"), `3. Yetarsiz ball: joriy balans+sovrin nomi ko'rinadi — "${shortLine.trim()}"`);
  ok(shortLine.includes("yana") && shortLine.includes("kerak"), "3b. 'yana ... kerak' matni bor");

  // ── Test 4: o'z maqsadi bor, ball YETARLI (69300 >= 69300)
  await prisma.appState.update({ where: { key: `oyin:adj:${memberWithGoal.id}` }, data: { value: JSON.stringify({ total: 69300, log: [{ ball: 69300, reason: "test", at: now.toISOString() }] }) } });
  invalidate();
  const enoughLine = await svc.rideFinishBallLine(memberWithGoal.id);
  ok(enoughLine.includes("yetarli") && enoughLine.includes("kartaga aylantiring"), `4. Yetarli ball: "yetarli, kartaga aylantiring" — "${enoughLine.trim()}"`);

  // ── Test 5: maqsad TANLANMAGAN — standart (eng arzon ochiq sovrin) mantiqqa tushadi
  await prisma.appState.create({ data: { key: `oyin:adj:${memberNoGoal.id}`, value: JSON.stringify({ total: 10, log: [{ ball: 10, reason: "test", at: now.toISOString() }] }) } });
  invalidate();
  const fallbackLine = await svc.rideFinishBallLine(memberNoGoal.id);
  ok(fallbackLine.includes("10 ball") && fallbackLine.length > 0, `5. Maqsadsiz a'zo — standart sovringa tushadi (bo'sh emas) — "${fallbackLine.trim()}"`);

  await cleanupState();
  await cleanupMembers();
  const remaining = await prisma.appState.count({ where: { key: { in: allKeys } } });
  const remainingMembers = await prisma.member.count({ where: { kasId: { in: [KAS_TAG_A, KAS_TAG_B] } } });
  ok(remaining === 0 && remainingMembers === 0, "6. Tozalashdan keyin test qatorlari qolmadi");

  console.log(process.exitCode ? "\n❌ BA'ZI TEKSHIRUVLAR YIQILDI" : "\n✅ HAMMA TEKSHIRUV O'TDI — F4 ishlaydi");
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => process.exit(process.exitCode ?? 0));
