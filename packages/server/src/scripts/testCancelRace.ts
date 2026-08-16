// 🔒 B2 (OYIN_KARTA_PLAN.md §14) — karta bekor qilish poyga-holati E2E tekshiruvi.
// TEST_DATABASE_URL'da yuguradi (_testDb.ts, testElonlar.ts naqshi) — app DB'ga HECH QACHON.
// Qayta yugurtirish: cd packages/server && npx dotenv -e ../../.env -- npx tsx src/scripts/testCancelRace.ts
import "./_testDb";

const TAG = "CXTEST";
const MEMBER = -900100;
const PRIZE_KEY = "uzum-tecno-spark-go-3-0"; // seed katalogidagi haqiqiy kalit, limit=15

function ok(cond: boolean, label: string): void {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) process.exitCode = 1;
}

async function main(): Promise<void> {
  const { prisma } = await import("../db");
  const svc = await import("../services/oyinService");
  const { setSeason } = await import("../services/oyinSeason");

  const ticketsKey = `oyin:tickets:${MEMBER}`;
  const soldKey = `oyin_sold:${PRIZE_KEY}`;

  const cleanup = async (): Promise<void> => {
    await prisma.appState.deleteMany({ where: { key: ticketsKey } });
    await prisma.appState.deleteMany({ where: { key: soldKey } });
  };
  await cleanup();

  // Mavsum: faol, tugashiga ko'p qolgan (final-lock ichida emas)
  const now = new Date();
  const start = new Date(now.getTime() - 24 * 3600_000);
  const end = new Date(now.getTime() + 30 * 24 * 3600_000);
  await setSeason({ startIso: start.toISOString(), endIso: end.toISOString(), label: TAG });

  // ── Test 1: bitta biletni IKKI MARTA BIR VAQTDA bekor qilish → faqat BIR marta o'rin bo'shashi kerak
  await prisma.appState.create({ data: { key: soldKey, value: "6" } });
  await prisma.appState.create({
    data: {
      key: ticketsKey,
      value: JSON.stringify([{ prizeKey: PRIZE_KEY, no: 1, gno: 555555001, priceAtPurchase: 69300, ts: new Date().toISOString() }]),
    },
  });

  const [r1, r2] = await Promise.all([
    svc.cancelOwnTicket(MEMBER, 555555001),
    svc.cancelOwnTicket(MEMBER, 555555001),
  ]);
  // Aynan BITTASI muvaffaqiyatli bo'lishi kerak (ikkinchisi "not_ticket" — chunki birinchisi
  // qulf ichida allaqachon ro'yxatdan o'chirib ulgurgan).
  const successCount = [r1, r2].filter((r) => r.ok).length;
  ok(successCount === 1, "1. Bir vaqtda ikki marta bekor qilish — faqat BITTASI muvaffaqiyatli");
  const soldAfter = await prisma.appState.findUnique({ where: { key: soldKey } });
  ok(Number(soldAfter?.value) === 5, `1b. sold 6→5 (faqat BIR marta bo'shadi) — hozir: ${soldAfter?.value}`);
  const ticketsAfter = await prisma.appState.findUnique({ where: { key: ticketsKey } });
  ok(JSON.parse(ticketsAfter?.value ?? "[]").length === 0, "1c. bilet ro'yxatdan chiqarilgan (bir marta, ikki marta emas)");

  await cleanup();

  // ── Test 2: adminCancelTicket ham xuddi shunday qulflanganini tekshirish
  await prisma.appState.create({ data: { key: soldKey, value: "6" } });
  await prisma.appState.create({
    data: {
      key: ticketsKey,
      value: JSON.stringify([{ prizeKey: PRIZE_KEY, no: 2, gno: 555555002, priceAtPurchase: 69300, ts: new Date().toISOString() }]),
    },
  });
  const [a1, a2] = await Promise.all([
    svc.adminCancelTicket(MEMBER, 555555002),
    svc.adminCancelTicket(MEMBER, 555555002),
  ]);
  ok([a1, a2].filter((r) => r.ok).length === 1, "2. adminCancelTicket — bir vaqtda ikki marta, faqat BITTASI muvaffaqiyatli");
  const soldAfter2 = await prisma.appState.findUnique({ where: { key: soldKey } });
  ok(Number(soldAfter2?.value) === 5, `2b. sold 6→5 (adminCancelTicket ham qulflangan) — hozir: ${soldAfter2?.value}`);

  await cleanup();

  // ── Test 3: cancelOwnTicket va adminCancelTicket BIR-BIRIGA QARSHI bir vaqtda (turli yo'l, bir a'zo)
  await prisma.appState.create({ data: { key: soldKey, value: "6" } });
  await prisma.appState.create({
    data: {
      key: ticketsKey,
      value: JSON.stringify([{ prizeKey: PRIZE_KEY, no: 3, gno: 555555003, priceAtPurchase: 69300, ts: new Date().toISOString() }]),
    },
  });
  const [c1, c2] = await Promise.all([
    svc.cancelOwnTicket(MEMBER, 555555003),
    svc.adminCancelTicket(MEMBER, 555555003),
  ]);
  ok([c1, c2].filter((r) => r.ok).length === 1, "3. cancelOwnTicket + adminCancelTicket bir vaqtda (bitta a'zo) — faqat BITTASI");
  const soldAfter3 = await prisma.appState.findUnique({ where: { key: soldKey } });
  ok(Number(soldAfter3?.value) === 5, `3b. sold 6→5 (ikki YO'L bir xil qulfni bo'lishadi) — hozir: ${soldAfter3?.value}`);

  await cleanup();

  // ── Test 4: adminCancelPrizeTickets — bir nechta a'zo, bittasi bilan cancelOwnTicket poygasi
  const MEMBER2 = -900101;
  const ticketsKey2 = `oyin:tickets:${MEMBER2}`;
  await prisma.appState.create({ data: { key: soldKey, value: "6" } });
  await prisma.appState.create({
    data: { key: ticketsKey, value: JSON.stringify([{ prizeKey: PRIZE_KEY, no: 4, gno: 555555004, priceAtPurchase: 69300, ts: new Date().toISOString() }]) },
  });
  await prisma.appState.create({
    data: { key: ticketsKey2, value: JSON.stringify([{ prizeKey: PRIZE_KEY, no: 5, gno: 555555005, priceAtPurchase: 69300, ts: new Date().toISOString() }]) },
  });
  const [bulkResult, ownResult] = await Promise.all([
    svc.adminCancelPrizeTickets(PRIZE_KEY),
    svc.cancelOwnTicket(MEMBER, 555555004), // xuddi shu bilet ustida bulk bilan poyga
  ]);
  // Ikkalasi ham "muvaffaqiyatli" deb qaytishi mumkin (bulk = "shu qatorni ko'rdim", own = "shu
  // qatorni ko'rdim") — lekin MUHIM narsa: sold hisoblagich TO'G'RI, ikki marta bo'shatilmagan.
  const finalSold = await prisma.appState.findUnique({ where: { key: soldKey } });
  // 2 ta chipta (MEMBER+MEMBER2) bor edi, ikkalasi ham bekor bo'ladi — sold 6dan 4ga tushishi kerak
  // (MEMBER'niki ikki yo'ldan BIR MARTA, MEMBER2'niki bulk orqali BIR MARTA — jami 2 marta, ortiqcha emas).
  ok(Number(finalSold?.value) === 4, `4. adminCancelPrizeTickets + cancelOwnTicket poygasi — sold 6→4 (ortiqcha bo'shatish YO'Q), hozir: ${finalSold?.value}`);
  ok(bulkResult.ok, "4b. adminCancelPrizeTickets muvaffaqiyatli qaytdi");

  await cleanup();
  await prisma.appState.deleteMany({ where: { key: ticketsKey2 } });
  await prisma.appState.deleteMany({ where: { key: "oyin:seasoncfg" } });
  const remaining = await prisma.appState.count({ where: { key: { in: [ticketsKey, ticketsKey2, soldKey] } } });
  ok(remaining === 0, "5. tozalashdan keyin test qatorlari qolmadi");

  console.log(process.exitCode ? "\n❌ BA'ZI TEKSHIRUVLAR YIQILDI" : "\n✅ HAMMA TEKSHIRUV O'TDI — B2 tuzatildi");
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => process.exit(process.exitCode ?? 0));
