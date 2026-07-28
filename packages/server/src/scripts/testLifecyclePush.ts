// 🔔 V4 hayot-sikli push'lari — XAVFSIZ tekshiruv. HECH KIMGA XABAR YUBORILMAYDI.
//
// `planLifecyclePushes` faqat HISOBLAYDI (yubormaydi, marker qo'ymaydi), shuning uchun buni
// jonli bazada bemalol yugurtirsa bo'ladi: kim nima olishini oldindan ko'rsatadi.
// Yugurtirish: npx dotenv -e ../../.env -- npx tsx src/scripts/testLifecyclePush.ts
import { prisma } from "../db";
import { planLifecyclePushes, LIFECYCLE_MAX_PER_TICK } from "../services/marketLifecycleService";
import { featureOn } from "../services/featureFlags";

async function main(): Promise<void> {
  const flag = await featureOn("mktlife");
  console.log(`— testLifecyclePush (HECH NARSA YUBORILMAYDI) —`);
  console.log(`bayroq mktlife: ${flag ? "ON" : "OFF"} · tick chegarasi: ${LIFECYCLE_MAX_PER_TICK}`);

  // K2: sokin soat — 03:00 (Toshkent) da hech narsa bo'lmasligi kerak
  const night = new Date(Date.UTC(2026, 6, 28, 22, 0, 0)); // 03:00 Toshkent
  const nightPlan = await planLifecyclePushes(night);
  console.log(`K2 sokin soat (03:00): quiet=${nightPlan.quiet} · reja=${nightPlan.pushes.length} (0 kutiladi)`);

  // Hozirgi (yoki kunduzgi) reja
  const noon = new Date(Date.UTC(2026, 6, 28, 9, 0, 0)); // 14:00 Toshkent
  // ignoreFlag: bayroq hali OFF — lekin mantiq jonli ma'lumotda TO'G'RI ishlayotganini ko'rish
  // shart (ega bayroqni yoqishdan OLDIN nima ketishini bilishi kerak). Yubormaydi, marker qo'ymaydi.
  const plan = await planLifecyclePushes(noon, { ignoreFlag: true });
  console.log(`\nKunduzgi reja: enabled=${plan.enabled} · quiet=${plan.quiet} · ${plan.pushes.length} ta push`);
  for (const p of plan.pushes) {
    const prod = await prisma.product.findUnique({ where: { id: p.productId }, select: { name: true, priceTanga: true, active: true, stock: true } });
    console.log(`  a'zo#${p.memberId} ← [${p.kind}] «${prod?.name.slice(0, 44)}» ${prod?.priceTanga} · faol=${prod?.active} zaxira=${prod?.stock}`);
    console.log(`      sabab: ${p.why}`);
  }

  // K6: reja ichida faol-emas yoki zaxirasi yo'q mahsulot BO'LMASLIGI kerak
  let bad = 0;
  for (const p of plan.pushes) {
    const prod = await prisma.product.findUnique({ where: { id: p.productId }, select: { active: true, stock: true } });
    if (!prod?.active || prod.stock <= 0) bad++;
  }
  console.log(`\nK6 faol/zaxirali emas mahsulot rejada: ${bad} (0 kutiladi)`);

  // K3: bir a'zoga rejada bittadan ko'p push yo'qligi
  const perMember = new Map<number, number>();
  for (const p of plan.pushes) perMember.set(p.memberId, (perMember.get(p.memberId) ?? 0) + 1);
  const dup = [...perMember.values()].filter((n) => n > 1).length;
  console.log(`K3 bir a'zoga 1 tadan ko'p: ${dup} (0 kutiladi)`);
  console.log(`K5 tick chegarasi: ${plan.pushes.length} ≤ ${LIFECYCLE_MAX_PER_TICK} → ${plan.pushes.length <= LIFECYCLE_MAX_PER_TICK ? "OK" : "BUZILDI"}`);

  // Manba-ma'lumot: nechta signal bor umuman
  const [demands, favs] = await Promise.all([
    prisma.marketDemand.count({ where: { memberId: { not: null }, createdAt: { gte: new Date(Date.now() - 30 * 86400_000) } } }),
    prisma.productFavorite.count(),
  ]);
  console.log(`\nManba: 30 kunlik «topilmadi» qidiruvlari (a'zo bilan) = ${demands} · ❤️ sevimlilar = ${favs}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
