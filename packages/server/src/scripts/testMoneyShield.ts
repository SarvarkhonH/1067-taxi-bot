// T0.5 PUL-QALQON testlari — har AUDIT bandi uchun race/duplicate stsenariy:
// pul hech qachon yo'qolmasligi va hech qachon ikki marta to'lanmasligi.
// Run: dotenv -e ../../.env -- tsx src/scripts/testMoneyShield.ts
import "../env";
import { prisma } from "../db";
import { grantCoins } from "../services/coinService";
import { atomicIncrement, pendingCreate, pendingScan, pendingResolve } from "../services/appStateUtil";
import { retryPendingMoney } from "../services/coinService";
import { mintItem, buyListedItem, listItem, seedItemTypes } from "../services/itemService";
import { fundAddRide, fundTotal } from "../services/featureFlags";
import { incrementMission } from "../services/missionService";

const TAG = "shield-test";
let failed = 0;
function ok(cond: boolean, label: string): void {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) failed++;
}
const bal = async (id: number) => (await prisma.member.findUnique({ where: { id } }))!.coins;
const ledger = async (id: number) => (await prisma.coinTxn.aggregate({ where: { memberId: id }, _sum: { amount: true } }))._sum.amount ?? 0;

async function cleanup(): Promise<void> {
  const ms = await prisma.member.findMany({ where: { kasId: { startsWith: TAG } }, select: { id: true } });
  const ids = ms.map((m) => m.id);
  // TradeOffer/TradeMessage 2026-07-29 da sxemadan olib tashlandi (TOZALASH_DOD.md Blok B) —
  // runtime kodda hech qachon ishlatilmagan, jonli bazada 0 qator edi. Bu tozalash ham keraksiz.
  await prisma.itemListing.deleteMany({ where: { sellerId: { in: ids } } });
  await prisma.item.deleteMany({ where: { ownerId: { in: ids } } });
  await prisma.rideReward.deleteMany({ where: { memberId: { in: ids } } });
  await prisma.referral.deleteMany({ where: { OR: [{ refereeMemberId: { in: ids } }, { referrerId: { startsWith: TAG } }, { refereeId: { startsWith: TAG } }] } });
  await prisma.withdrawal.deleteMany({ where: { memberId: { in: ids } } });
  await prisma.appState.deleteMany({ where: { key: { startsWith: "pending:" } } });
  await prisma.appState.deleteMany({ where: { key: { in: ["shield_atomic", "fundride:888901", "fundride:950002"] } } });
  await prisma.appState.deleteMany({ where: { key: { endsWith: ":950004" } } }); // qinc test marker
  await prisma.itemType.deleteMany({ where: { code: "shield_test_t" } });
  await prisma.telegramUser.deleteMany({ where: { id: { startsWith: `${TAG}-tg` } } });
  await prisma.member.deleteMany({ where: { id: { in: ids } } });
}

async function main(): Promise<void> {
  await cleanup();
  await seedItemTypes();
  const fundBefore = (await prisma.appState.findUnique({ where: { key: "mashina_fund" } }))?.value ?? null; // global — restore at end

  const a = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-A`, fullName: "Shield A", phone: "+998900011001", trips: 5 } });
  const b = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-B`, fullName: "Shield B", phone: "+998900011002", trips: 5 } });
  await grantCoins(a.id, 30000, "manual", "seed");
  await grantCoins(b.id, 30000, "manual", "seed");

  // ── P0 (QA fleet): grantCoins CONCURRENT-DUPLICATE → EXACTLY ONE credit ──────
  // The old code checked-then-incremented non-atomically: N concurrent callers with the
  // same idempotencyKey all passed the guard and all incremented (double-grant, no audit).
  // The fix wraps unique-keyed insert + increment in one tx → only one wins, rest roll back.
  const race = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-RACE`, fullName: "Race", phone: "+998900011009", trips: 1 } });
  const rkey = `racekey:${race.id}:777`;
  const raceResults = await Promise.all(Array.from({ length: 8 }, () => grantCoins(race.id, 250, "race", "concurrent dup", rkey)));
  const raceBal = await bal(race.id);
  const raceRows = await prisma.coinTxn.count({ where: { idempotencyKey: rkey } });
  const raceOk = raceResults.filter((x) => x.ok).length;
  ok(raceBal === 250, `P0 grantCoins: 8 concurrent same-key → balance EXACTLY +250 once (got ${raceBal})`);
  ok(raceRows === 1, `P0 grantCoins: exactly 1 CoinTxn audit row for the key (got ${raceRows})`);
  ok(raceOk === 1, `P0 grantCoins: exactly 1 call returned ok, 7 skipped as duplicate (got ${raceOk} ok)`);

  // ── 3.2 REFERRAL konvergensiya: paidAt yiqilsa ham double-pay YO'Q ──────
  await prisma.telegramUser.createMany({ data: [{ id: `${TAG}-tg-ref` }, { id: `${TAG}-tg-ree` }] });
  const ref = await prisma.referral.create({
    data: { referrerId: `${TAG}-tg-ref`, refereeId: `${TAG}-tg-ree`, refereeMemberId: b.id, rewardReferrer: 1500, rewardReferee: 2000 },
  });
  // 1-sweep (qo'lda simulyatsiya): grantlar o'tdi, paidAt update "yiqildi"
  const g1 = await grantCoins(b.id, 2000, "referral", "test referee", `ref_referee_ride:${ref.id}`);
  ok(g1.ok, `3.2 referee grant #1 o'tdi`);
  // 2-sweep: xuddi shu kalitlar — duplicate, paidAt endi yoziladi
  const g2 = await grantCoins(b.id, 2000, "referral", "test referee", `ref_referee_ride:${ref.id}`);
  await prisma.referral.update({ where: { id: ref.id }, data: { referrerPaidAt: new Date() } });
  const refRow = await prisma.referral.findUnique({ where: { id: ref.id } });
  const refPaid = await prisma.coinTxn.count({ where: { memberId: b.id, idempotencyKey: `ref_referee_ride:${ref.id}` } });
  ok(!g2.ok && g2.skipped === "duplicate" && refPaid === 1 && !!refRow?.referrerPaidAt, `3.2 ikkinchi sweep: to'lov 1x, paidAt oxir-oqibat yozildi`);

  // ── 3.3/3.8 PENDING-RETRY: marker → tick → balans tiklandi, 1x ──────────
  const owedBefore = await bal(a.id);
  await pendingCreate("wd", "shield-1", { memberId: a.id, amount: 700 });
  // markerni 11 daqiqa eskirt (tick faqat eski markerlarni oladi)
  await prisma.appState.update({ where: { key: "pending:wd:shield-1" }, data: { updatedAt: new Date(Date.now() - 11 * 60_000) } });
  const r1 = await retryPendingMoney();
  const r2 = await retryPendingMoney(); // marker resolve bo'lgan — ikkinchi tick hech narsa qilmaydi
  const owedAfter = await bal(a.id);
  ok(r1.wd === 1 && owedAfter - owedBefore === 700, `3.3 tick refund qaytardi (+700, 1-urinishda)`);
  ok(r2.wd === 0 && (await prisma.appState.findUnique({ where: { key: "pending:wd:shield-1" } })) === null, `3.3 marker resolve — takror to'lov YO'Q`);

  // stuck yo'li: 5 urinishdan keyin to'xtaydi
  await pendingCreate("wd", "shield-stuck", { memberId: 999999999, amount: 100 }); // mavjud bo'lmagan a'zo — grant doim yiqiladi
  for (let i = 0; i < 6; i++) {
    await prisma.appState.update({ where: { key: "pending:wd:shield-stuck" }, data: { updatedAt: new Date(Date.now() - 11 * 60_000) } }).catch(() => null);
    await retryPendingMoney();
  }
  const stuckRow = await prisma.appState.findUnique({ where: { key: "pending:wd:shield-stuck" } });
  ok(!!stuckRow && JSON.parse(stuckRow.value).stuck === true, `3.3 5 urinishdan keyin STUCK (cheksiz aylanmaydi)`);
  await prisma.appState.deleteMany({ where: { key: "pending:wd:shield-stuck" } });

  // (3.4/3.6 TRADE bo'limi olib tashlandi 2026-07-03 — tradeService o'chirildi, prod'da 0 marta
  //  ishlatilgan edi. 3.7 fixture'i uchun item egaligi to'g'ridan-to'g'ri ko'chiriladi.)
  await prisma.itemType.create({ data: { code: "shield_test_t", name: "Sh T", emoji: "🛡", kind: "plate", mintCap: 9, mintPrice: 500 } });
  await mintItem(a.id, "shield_test_t");
  const tT = await prisma.itemType.findUnique({ where: { code: "shield_test_t" } });
  const itA = (await prisma.item.findFirst({ where: { ownerId: a.id, itemTypeId: tT!.id } }))!;
  await mintItem(b.id, "shield_test_t");
  const poor = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-P`, fullName: "Poor", phone: "+998900011003", trips: 5 } });
  await grantCoins(poor.id, 600, "manual", "seed"); // mint 500 dan keyin 100 qoladi
  await mintItem(poor.id, "shield_test_t");
  await prisma.member.update({ where: { id: poor.id }, data: { coins: 20 } }); // insufficient-buyer fixture
  await prisma.coinTxn.create({ data: { memberId: poor.id, amount: -80, kind: "manual", reason: "test adjust" } });
  await prisma.item.update({ where: { id: itA.id }, data: { ownerId: b.id } });

  // ── 3.7 buyListedItem: parallel xarid 1x; insufficient'da hech narsa ────
  const itemBack = await prisma.item.findUnique({ where: { id: itA.id } }); // fixture: b da
  ok(itemBack!.ownerId === b.id, `3.7 fixture: item b ga o'tgan`);
  const li = await listItem(b.id, itA.id, 1200); // koridor: 250..1500 (mint 500)
  ok(li.ok === true, `3.7 listing yaratildi (koridor ichida)`);
  const listing = (await prisma.itemListing.findFirst({ where: { itemId: itA.id } }))!;
  const bB4 = await bal(b.id);
  const [p1, p2] = await Promise.all([buyListedItem(a.id, listing.id), buyListedItem(a.id, listing.id)]);
  const buyOk = [p1, p2].filter((r) => r.ok).length;
  ok(buyOk === 1 && (await bal(b.id)) - bB4 === 1080, `3.7 parallel buy: 1x sotuv, sotuvchiga 1080 (10% burn)`);
  ok((await prisma.appState.count({ where: { key: { startsWith: "pending:sellerpay:item-" } } })) === 0, `3.7 sellerpay marker resolve`);
  // insufficient: kambag'al xaridor — hech narsa o'zgarmaydi
  await listItem(a.id, itA.id, 1200);
  const l2 = (await prisma.itemListing.findFirst({ where: { itemId: itA.id } }))!;
  const poorB4 = await bal(poor.id);
  const pb = await buyListedItem(poor.id, l2.id);
  ok(!pb.ok && pb.reason === "insufficient" && (await bal(poor.id)) === poorB4 && (await prisma.itemListing.count({ where: { id: l2.id } })) === 1, `3.7 insufficient: listing joyida, pul ketmadi`);

  // ── 3.11 atomicIncrement: 10 parallel → aniq +10 ────────────────────────
  await Promise.all(Array.from({ length: 10 }, () => atomicIncrement("shield_atomic", 1)));
  const atomicVal = (await prisma.appState.findUnique({ where: { key: "shield_atomic" } }))!.value;
  ok(Number(atomicVal) === 10, `3.11 atomicIncrement 10 parallel = ${atomicVal}`);

  // ── 1.1 grantCashback yo'q ──────────────────────────────────────────────
  const reward = await import("../services/rewardService");
  ok(!("grantCashback" in reward), `1.1 legacy grantCashback o'chirilgan`);

  // ── T4-OLDIN: resilient()-o'ralgan grant'lar IDEMPOTENT (2x → 1x) ─────────
  // resilient() transient'da retry qiladi — agar grant idempotent bo'lmasa,
  // retry double-to'laydi (T0.5 3.1 bug). Har o'ralgan grant 2x chaqirilib,
  // 1x to'langani tasdiqlanadi.
  await prisma.appState.deleteMany({ where: { key: "fundride:950002" } }); // faqat marker (global fond TEGILMAYDI)
  const fB = await fundTotal();
  await fundAddRide(950002);
  await fundAddRide(950002); // RETRY — bir xil booking
  ok((await fundTotal()) - fB === 100, `fundAddRide 2x → +100 1x (got ${(await fundTotal()) - fB})`);

  const dvB = await bal(b.id);
  for (let i = 0; i < 2; i++) await grantCoins(b.id, 100, "driver_bonus", "tier", `driver_bonus:777:950003`); // RETRY
  ok((await bal(b.id)) - dvB === 100, `driver_bonus 2x → 1x (+100, got ${(await bal(b.id)) - dvB})`);

  // incrementMission rideKey: 2x bir xil ride → progress +1 (retry double-sanamaydi)
  await prisma.appState.deleteMany({ where: { key: "qinc:0:daily_ride:950004" } });
  await prisma.missionProgress.deleteMany({ where: { memberId: b.id, code: "daily_ride" } });
  for (let i = 0; i < 2; i++) await incrementMission(b.id, "daily_ride", 1, `qinc:${b.id}:daily_ride:950004`); // RETRY
  const mp = await prisma.missionProgress.findFirst({ where: { memberId: b.id, code: "daily_ride" } });
  ok(mp?.progress === 1, `incrementMission rideKey 2x → progress 1 (double bo'lsa 2; got ${mp?.progress})`);

  // ── yakuniy ledger invariantlar ─────────────────────────────────────────
  for (const id of [a.id, b.id, poor.id]) {
    ok(Math.abs((await bal(id)) - (await ledger(id))) < 0.001, `ledger invariant (member ${id})`);
  }

  // jonli mashina-fond global holatini tiklash
  if (fundBefore === null) await prisma.appState.deleteMany({ where: { key: "mashina_fund" } });
  else await prisma.appState.upsert({ where: { key: "mashina_fund" }, update: { value: fundBefore }, create: { key: "mashina_fund", value: fundBefore } });
  await cleanup();
  await prisma.$disconnect();
  console.log(failed === 0 ? "\n🛡 PUL-QALQON: hamma tekshiruv o'tdi" : `\n❌ ${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
