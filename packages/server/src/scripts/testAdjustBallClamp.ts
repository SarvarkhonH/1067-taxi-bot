// 🛡 R1 (OYIN_KARTA_PLAN.md §14) — adminAdjustBall chegaralari + drawExport xavf-bayrog'i.
// TEST_DATABASE_URL'da (birjoy_test) — app DB'ga HECH QACHON. Qayta yugurtirish:
//   cd packages/server && npx dotenv -e ../../.env -- npx tsx src/scripts/testAdjustBallClamp.ts
import "./_testDb";

const MEMBER = -900300;
const PRIZE_KEY = "uzum-tecno-spark-go-3-0"; // seed katalogidagi haqiqiy kalit

function ok(cond: boolean, label: string): void {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) process.exitCode = 1;
}

async function main(): Promise<void> {
  const { prisma } = await import("../db");
  const svc = await import("../services/oyinService");
  const { setFeature, __resetFeatureCache } = await import("../services/featureFlags");
  const { getBonusEcon } = await import("../services/bonusConfig");
  const { setSeason } = await import("../services/oyinSeason");

  const adjKey = `oyin:adj:${MEMBER}`;
  const ticketsKey = `oyin:tickets:${MEMBER}`;
  const soldKey = `oyin_sold:${PRIZE_KEY}`;

  const cleanup = async (): Promise<void> => {
    await prisma.appState.deleteMany({ where: { key: { in: [adjKey, ticketsKey, soldKey] } } });
  };
  await cleanup();
  await setFeature("oyin", true);
  __resetFeatureCache();
  const now = new Date();
  await setSeason({ startIso: new Date(now.getTime() - 24 * 3600_000).toISOString(), endIso: new Date(now.getTime() + 30 * 24 * 3600_000).toISOString(), label: "R1TEST" });

  const econBefore = await getBonusEcon();
  const maxPerAction = econBefore.oyinAdjustMaxPerAction ?? 3000;
  const maxPerSeason = econBefore.oyinAdjustMaxPerSeason ?? 10000;
  ok(maxPerAction > 0 && maxPerSeason > 0, `0. Knoblar mavjud (maxPerAction=${maxPerAction}, maxPerSeason=${maxPerSeason})`);

  // ── Test 1: bitta-amal chegarasidan katta so'rov rad etiladi
  const tooBig = await svc.adminAdjustBall({ memberId: MEMBER, ball: maxPerAction + 1, reason: "test" });
  ok(tooBig.ok === false && tooBig.reason === "too_large", `1. ${maxPerAction + 1} ball rad etiladi (too_large)`);

  // ── Test 2: chegara ICHIDA — o'tadi
  const okAdj = await svc.adminAdjustBall({ memberId: MEMBER, ball: maxPerAction, reason: "test" });
  ok(okAdj.ok === true, `2. Aynan chegara (${maxPerAction}) o'tadi`);

  // ── Test 3: ketma-ket tuzatishlar mavsum-jamiga yetgach rad etiladi
  let seasonBlocked = false;
  let sumSoFar = maxPerAction; // test 2'dan
  for (let i = 0; i < 10; i++) {
    const step = Math.min(maxPerAction, maxPerSeason - sumSoFar + 1); // oxirgi qadam ataylab oshirib yuboradi
    if (step <= 0) break;
    const r = await svc.adminAdjustBall({ memberId: MEMBER, ball: step, reason: `test${i}` });
    if (!r.ok && r.reason === "season_cap") { seasonBlocked = true; break; }
    if (r.ok) sumSoFar += step;
  }
  ok(seasonBlocked, `3. Mavsum-jami chegarasiga yetgach rad etiladi (season_cap) — yig'indi: ${sumSoFar}/${maxPerSeason}`);

  // ── Test 4: drawExport riskyMembers — og'ir admin-tuzatilgan a'zo (adjustHeavy) ko'rinadi
  // ⚠️ computeBallMap() `TelegramUser` jadvalini AYLANADI (AppState emas) — sinov-memberId
  // (manfiy, DB qatorisiz) unda HECH QACHON ko'rinmaydi. Shu bitta tekshiruv uchun HAQIQIY
  // (lekin izolyatsiyalangan test-bazadagi) Member+TelegramUser qatori kerak.
  const KAS_TAG = "R1TEST_KASID";
  await prisma.telegramUser.deleteMany({ where: { id: "9009009001" } });
  await prisma.member.deleteMany({ where: { kasId: KAS_TAG } });
  const realMember = await prisma.member.create({ data: { type: "client", kasId: KAS_TAG, fullName: "R1 Sinov A'zo" } });
  await prisma.telegramUser.create({ data: { id: "9009009001", memberId: realMember.id, firstName: "R1Sinov" } });
  const adjKey2 = `oyin:adj:${realMember.id}`;
  const ticketsKey2 = `oyin:tickets:${realMember.id}`;
  // ⚠️ drawExport FAQAT "tayyor" (sold >= minSell) sovrinlarni chiqaradi — soldKey ATAYLAB
  // limitga (15) tenglashtiriladi, aks holda ticket "skippedPrizes"ga tushib riskyMembers'da
  // umuman ko'rinmaydi (bu chegara bilan aloqasi yo'q, faqat ticket eksportga tushishi uchun).
  await prisma.appState.create({ data: { key: soldKey, value: "15" } });
  await prisma.appState.create({
    data: { key: ticketsKey2, value: JSON.stringify([{ prizeKey: PRIZE_KEY, no: 1, gno: 555555100, priceAtPurchase: 100, ts: new Date().toISOString() }]) },
  });
  // Real a'zoga ham xuddi shu tarzda (chegara ichida) og'ir tuzatish — earned'ning katta qismi adjust'dan
  await svc.adminAdjustBall({ memberId: realMember.id, ball: maxPerAction, reason: "test-real" });
  const exportRes = await svc.drawExport();
  const flagged = exportRes.riskyMembers.find((r) => r.memberId === realMember.id);
  ok(!!flagged, `4. drawExport.riskyMembers'da real a'zo (#${realMember.id}) bor (${exportRes.riskyMembers.length} ta jami)`);
  ok(!!flagged && flagged.reasons.some((r) => r.includes("qo'lda qo'shilgan")), `4b. Sabab "adjustHeavy" turkumidan (${flagged?.reasons.join(" · ")})`);

  await cleanup();
  await prisma.appState.deleteMany({ where: { key: { in: [adjKey2, ticketsKey2] } } });
  await prisma.telegramUser.deleteMany({ where: { id: "9009009001" } });
  await prisma.member.deleteMany({ where: { kasId: KAS_TAG } });
  const remaining = await prisma.appState.count({ where: { key: { in: [adjKey, ticketsKey, soldKey, adjKey2, ticketsKey2] } } });
  const remainingMembers = await prisma.member.count({ where: { kasId: KAS_TAG } });
  ok(remaining === 0 && remainingMembers === 0, "5. Tozalashdan keyin test qatorlari qolmadi");

  console.log(process.exitCode ? "\n❌ BA'ZI TEKSHIRUVLAR YIQILDI" : "\n✅ HAMMA TEKSHIRUV O'TDI — R1 tuzatildi");
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => process.exit(process.exitCode ?? 0));
