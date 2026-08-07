// 🤝 Gashtak ledger — bir martalik BACKFILL (2026-08-07).
//
// Sabab: `computeBallMap`/`jamoaMemberStats` endi `GashtakReward` o'zgarmas ledgeridan o'qiydi
// (eski "har safar qayta hisoblanadigan, guruh tarkibi o'zgarsa siljib ketadigan" bug tuzatildi —
// oyinService.ts). Lekin ledger BO'SH — mavjud guruhlarning o'tgan oylardagi navbatchi-balli hech
// qayerda yozilmagan edi. Bu skript ESKI (endi olib tashlangan) formula bilan BUGUNGI holatni bir
// marta hisoblab, natijani ledgerga "muzlatib" yozadi — shundan keyin hech kimning ko'rinadigan
// balansi to'satdan 0 ga tushib qolmaydi.
//
// XAVFSIZLIK: DRY RUN DEFAULT — faqat topilganlarni ekranga chiqaradi, hech narsa yozmaydi.
// Yozish uchun ATAYLAB --write bayrog'i kerak. Har guruh uchun: agar o'sha guruhda ALLAQACHON
// biror GashtakReward yozuvi bo'lsa (masalan skript ikkinchi marta ishga tushirilsa, yoki
// real-vaqtli yozish allaqachon ishga tushgan bo'lsa), o'sha guruh BUTUNLAY TASHLAB KETILADI —
// ikki marta yozib, ballni ikki barobar oshirib qo'yishning oldi olinadi.
//
// Faqat REAL (musbat ID) navbatchilarga yoziladi — sinov (manfiy ID) a'zolar ledgerga umuman
// yozilmaydi (haqiqiy safar emas, jamoaMemberStats ularni alohida, real-vaqtda taxmin qiladi).
//
// Ishga tushirish (VPS'da, sxema `db push` qilingandan KEYIN):
//   tsx src/scripts/backfillGashtakLedger.ts            # dry-run — faqat ko'rsatadi
//   tsx src/scripts/backfillGashtakLedger.ts --write     # haqiqatan yozadi
import "../env";
import { prisma } from "../db";
import { getBonusEcon } from "../services/bonusConfig";
import { navbatchiOf, parseJamoa, addMonths, type JamoaRecord } from "../services/oyinService";

const JAMOA_PREFIX = "oyin:jamoa:";
const OYIN_JAMOA_MIN = 3;

/** Tashkent kun-kaliti asosida oy-kalit — `oyinService.ts`dagi `monthKeyOf` bilan BIR XIL ta'rif
 *  (ataylab nusxa — import qilinsa doiraviy bog'liqlik bo'lardi, xuddi oyinSeason.ts naqshida). */
function monthKeyOf(d: Date): string {
  return new Date(d.getTime() + 5 * 3600_000).toISOString().slice(0, 7);
}
function monthsBetween(a: string, b: string): number {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  if (!ay || !am || !by || !bm) return 0;
  return (by - ay) * 12 + (bm - am);
}

interface PlannedRow { memberId: number; jamoaId: string; monthKey: string; amount: number }

async function main(): Promise<void> {
  const write = process.argv.includes("--write");
  const econ = await getBonusEcon();
  const ballPerRide = econ.oyinJamoaBallPerRide ?? 0;
  const maxBall = econ.oyinJamoaMaxBall ?? 3600;

  if (ballPerRide <= 0) {
    console.log("oyinJamoaBallPerRide = 0 — hisoblanadigan narsa yo'q, chiqildi.");
    await prisma.$disconnect();
    return;
  }

  const rows = await prisma.appState.findMany({ where: { key: { startsWith: JAMOA_PREFIX } } });
  const nowMonth = monthKeyOf(new Date());
  const planned: PlannedRow[] = [];
  let skippedAlreadyLedgered = 0;
  let skippedTooSmall = 0;

  for (const row of rows) {
    const j: JamoaRecord | null = parseJamoa(row.value);
    if (!j) continue;
    if (j.members.length < OYIN_JAMOA_MIN) { skippedTooSmall++; continue; }

    // Bu guruh uchun ledgerda ALLAQACHON yozuv bormi — bo'lsa, butunlay tashlab ketiladi
    // (qayta ishga tushirilganda ikki marta yozmaslik uchun).
    const already = await prisma.gashtakReward.count({ where: { jamoaId: j.id } });
    if (already > 0) { skippedAlreadyLedgered++; continue; }

    const positiveMembers = j.members.filter((m) => m > 0);
    if (positiveMembers.length === 0) continue;

    const startMonth = monthKeyOf(new Date(j.createdAt));
    const span = Math.max(0, monthsBetween(startMonth, nowMonth));

    const rides = await prisma.rideReward.findMany({
      where: { memberId: { in: positiveMembers }, createdAt: { gte: new Date(j.createdAt) } },
      select: { createdAt: true },
    });
    const ridesByMonth = new Map<string, number>();
    for (const r of rides) {
      const mk = monthKeyOf(r.createdAt);
      ridesByMonth.set(mk, (ridesByMonth.get(mk) ?? 0) + 1);
    }

    for (let i = 0; i <= span; i++) {
      const mk = addMonths(startMonth, i);
      const winner = navbatchiOf(j, mk);
      if (winner == null || winner <= 0) continue; // faqat REAL navbatchi
      const groupRides = ridesByMonth.get(mk) ?? 0;
      if (groupRides === 0) continue;
      const amount = Math.min(maxBall, groupRides * ballPerRide);
      if (amount <= 0) continue;
      planned.push({ memberId: winner, jamoaId: j.id, monthKey: mk, amount });
    }
  }

  const groupCount = new Set(planned.map((r) => r.jamoaId)).size;
  console.log(`Skanerlandi: ${rows.length} ta guruh yozuvi.`);
  console.log(`O'tkazib yuborildi: ${skippedTooSmall} ta (juda kichik), ${skippedAlreadyLedgered} ta (ledgerda allaqachon bor).`);
  console.log(`Topildi: ${planned.length} ta yangi ledger-yozuv (${groupCount} ta guruh bo'yicha).\n`);
  for (const r of planned.slice(0, 40)) {
    console.log(`  ${r.jamoaId} / ${r.monthKey}  ->  memberId=${r.memberId}  amount=${r.amount}`);
  }
  if (planned.length > 40) console.log(`  … va yana ${planned.length - 40} ta`);

  if (!write) {
    console.log("\n(DRY RUN — hech narsa yozilmadi. Ko'rib chiqib, tasdiqlansa: --write bilan qayta ishga tushiring.)");
    await prisma.$disconnect();
    return;
  }

  let created = 0;
  let syntheticId = -1; // real RideReward.id doim musbat — manfiy hech qachon to'qnashmaydi
  for (const r of planned) {
    const rid = syntheticId--;
    await prisma.gashtakReward.create({
      data: { memberId: r.memberId, jamoaId: r.jamoaId, monthKey: r.monthKey, amount: r.amount, rideRewardId: rid },
    }).then(() => { created++; })
      .catch((e) => console.error(`  ⚠️ yozilmadi (${r.jamoaId}/${r.monthKey}):`, e));
  }
  console.log(`\n✅ Backfill tugadi: ${created}/${planned.length} ta yozuv yozildi.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
