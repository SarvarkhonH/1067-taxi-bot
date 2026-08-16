// 🔴 B1 (OYIN_KARTA_PLAN.md §14) — sinov-a'zo navbatchi bo'lganda real ball KREDITLANMASLIGI
// va ega BIR MARTA ogohlantirilishi tekshiruvi. TEST_DATABASE_URL'da (birjoy_test) — app DB'ga
// HECH QACHON. Qayta yugurtirish:
//   cd packages/server && npx dotenv -e ../../.env -- npx tsx src/scripts/testGashtakTestNavbatchi.ts
import "./_testDb";

const JAMOA_ID = "B1TESTJAMOA";
const RIDER = -900200; // safar qiluvchi — ishorasi ahamiyatsiz (navbatchi EMAS)
// ⚠️ MUSBAT bo'lishi SHART: bu odam 4-testda "haqiqiy navbatchi" rolini o'ynaydi, kod esa
// MANFIY ID'ni har doim "sinov/virtual" deb o'qiydi (Member.id hech qachon manfiy bo'lmaydi) —
// manfiy qilib qo'yilsa test o'zining tekshirayotgan qo'rig'iga o'zi tutilib qolardi.
const RIDER2 = 900201;
const TEST_NAVBATCHI = -900202; // sinov (virtual) a'zo — navbatchi shu oyga

function ok(cond: boolean, label: string): void {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) process.exitCode = 1;
}

function tashkentMonthKey(d: Date): string {
  return new Date(d.getTime() + 5 * 3600_000).toISOString().slice(0, 7);
}

async function main(): Promise<void> {
  const { prisma } = await import("../db");
  const svc = await import("../services/oyinService");
  const { setFeature, __resetFeatureCache } = await import("../services/featureFlags");

  const jamoaKey = `oyin:jamoa:${JAMOA_ID}`;
  const memKey = (id: number) => `oyin:jamoamem:${id}`;
  const alertKey = `oyin:testturn_alert:${JAMOA_ID}:${tashkentMonthKey(new Date())}`;

  const cleanup = async (): Promise<void> => {
    await prisma.appState.deleteMany({ where: { key: { in: [jamoaKey, memKey(RIDER), memKey(RIDER2), alertKey] } } });
    await prisma.gashtakReward.deleteMany({ where: { jamoaId: JAMOA_ID } });
  };
  await cleanup();
  await setFeature("oyin", true);
  __resetFeatureCache();

  const monthKey = tashkentMonthKey(new Date());
  const jamoa = {
    id: JAMOA_ID, name: "B1 test", createdAt: new Date().toISOString(),
    members: [RIDER, RIDER2, TEST_NAVBATCHI],
    turns: { [monthKey]: TEST_NAVBATCHI }, // ⚠️ shu oy — SINOV a'zo navbatchi
    leaderId: RIDER, joinedAt: {}, disbandedAt: null,
    testNames: { [TEST_NAVBATCHI]: "🧪 Test navbatchi" }, turnOverrides: {},
  };
  await prisma.appState.create({ data: { key: jamoaKey, value: JSON.stringify(jamoa) } });
  await prisma.appState.create({ data: { key: memKey(RIDER), value: JAMOA_ID } });
  await prisma.appState.create({ data: { key: memKey(RIDER2), value: JAMOA_ID } });

  // ── Test 1: real safar, navbatchi SINOV a'zo → GashtakReward YOZILMAYDI
  await svc.creditGashtakLedger(RIDER, 111001);
  const rewardsAfter1 = await prisma.gashtakReward.count({ where: { jamoaId: JAMOA_ID } });
  ok(rewardsAfter1 === 0, "1. Sinov-navbatchiga ball KREDITLANMADI (GashtakReward yozilmadi)");

  // ── Test 2: ogohlantirish markeri BIR MARTA yozilgan (spam emas)
  const alertRow = await prisma.appState.findUnique({ where: { key: alertKey } });
  ok(!!alertRow, "2. Ogohlantirish markeri yozildi (guruh+oy uchun)");

  // ── Test 3: IKKINCHI safar (bir xil oy) — yana YOZILMAYDI, lekin marker TAKRORLANMAYDI (jim)
  await svc.creditGashtakLedger(RIDER2, 111002);
  const rewardsAfter2 = await prisma.gashtakReward.count({ where: { jamoaId: JAMOA_ID } });
  ok(rewardsAfter2 === 0, "3. Ikkinchi safar ham kreditlanmadi (izchil)");

  // ── Test 4: navbat HAQIQIY a'zoga o'tsa (boshliq tuzatgach) — ball to'g'ri kreditlanadi
  jamoa.turns[monthKey] = RIDER2;
  await prisma.appState.update({ where: { key: jamoaKey }, data: { value: JSON.stringify(jamoa) } });
  await svc.creditGashtakLedger(RIDER, 111003);
  const reward = await prisma.gashtakReward.findFirst({ where: { jamoaId: JAMOA_ID, rideRewardId: 111003 } });
  ok(reward?.memberId === RIDER2 && (reward?.amount ?? 0) > 0, "4. Navbat haqiqiy a'zoga o'tkazilgach, ball TO'G'RI kreditlanadi");

  await cleanup();
  const remaining = await prisma.appState.count({ where: { key: { in: [jamoaKey, memKey(RIDER), memKey(RIDER2), alertKey] } } });
  const remainingRewards = await prisma.gashtakReward.count({ where: { jamoaId: JAMOA_ID } });
  ok(remaining === 0 && remainingRewards === 0, "5. Tozalashdan keyin test qatorlari qolmadi");

  console.log(process.exitCode ? "\n❌ BA'ZI TEKSHIRUVLAR YIQILDI" : "\n✅ HAMMA TEKSHIRUV O'TDI — B1 tuzatildi");
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => process.exit(process.exitCode ?? 0));
