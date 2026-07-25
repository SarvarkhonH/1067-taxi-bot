// 📞 «qidirildi-topilmadi» (MarketDemand) yozuv-sifati testi. Bu ma'lumot SOTUV ro'yxatiga
// aylanadi (salesLeads.ts), shuning uchun shovqinsiz bo'lishi shart: Mini App har bosishda
// qidiradi → "sabzavot" bitta so'rov 8 ta yozuv qoldirmasin.
// TEST_DATABASE_URL'da ishlaydi (_testDb app DB'ni rad etadi). TAG'li member + to'liq cleanup.
import "./_testDb";
process.env.KAS_MODE = "mock";

const TAG = "DEMANDTEST";

function ok(cond: boolean, label: string): void {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) process.exitCode = 1;
}

async function main(): Promise<void> {
  const { prisma } = await import("../db");
  const { getMarketHome } = await import("../services/shopService");

  const cleanup = async (): Promise<void> => {
    const ms = await prisma.member.findMany({ where: { kasId: { startsWith: TAG } }, select: { id: true } });
    await prisma.marketDemand.deleteMany({ where: { OR: [{ memberId: { in: ms.map((m) => m.id) } }, { query: { startsWith: "zzq" } }] } });
    await prisma.member.deleteMany({ where: { kasId: { startsWith: TAG } } });
  };
  await cleanup();

  const member = await prisma.member.create({ data: { type: "client", kasId: `${TAG}_1`, fullName: "Demand Test", points: 0 } });
  const rows = () => prisma.marketDemand.findMany({ where: { memberId: member.id }, orderBy: { id: "asc" } });
  // preview=true — global `bazar` flagiga TEGMAYMIZ (jim toggle taqiq), ichki gate chetlab o'tiladi.
  const search = (q: string) => getMarketHome(true, q, member.id);
  const searchAnon = (q: string) => getMarketHome(true, q); // memberId ATAYLAB uzatilmaydi

  // 1) 3 belgidan qisqa — umuman yozilmaydi (bitta harf bosilishi shovqin, so'rov emas)
  await search("zz");
  ok((await rows()).length === 0, "1: 2 belgili so'rov yozilmaydi");

  // 2) 3 belgi — bitta yozuv paydo bo'ladi
  await search("zzq");
  let r = await rows();
  ok(r.length === 1 && r[0]!.query === "zzq", `2: 3 belgi → 1 yozuv (oldi: ${r.length})`);

  // 3) yozib borish zanjiri — YANGI satr yaratmaydi, mavjudi eng to'liq shaklga yangilanadi
  await search("zzqa");
  await search("zzqab");
  await search("zzqabc");
  r = await rows();
  ok(r.length === 1, `3: yozuv-zanjiri BITTA satr bo'lib qoladi (oldi: ${r.length})`);
  ok(r[0]!.query === "zzqabc", `3: satr eng to'liq shaklni saqlaydi (oldi: «${r[0]!.query}»)`);

  // 4) orqaga o'chirish — satr qisqarmaydi (eng to'liq shakl saqlanadi)
  await search("zzqa");
  r = await rows();
  ok(r.length === 1 && r[0]!.query === "zzqabc", `4: orqaga o'chirilsa ham eng to'liq shakl qoladi (oldi: «${r[0]!.query}»)`);

  // 5) butunlay boshqa so'rov — YANGI satr (zanjir emas)
  await search("zzqxyz");
  r = await rows();
  ok(r.length === 2, `5: boshqa so'rov yangi satr ochadi (oldi: ${r.length})`);

  // 6) anonim (memberId yo'q) — zanjir yig'ilmaydi, lekin aynan takror ham yozilmaydi
  await prisma.marketDemand.deleteMany({ where: { memberId: null, query: { startsWith: "zzq" } } });
  await searchAnon("zzqanon");
  await searchAnon("zzqanon");
  const anon = await prisma.marketDemand.count({ where: { memberId: null, query: "zzqanon" } });
  ok(anon === 1, `6: anonim aynan-takror so'rov 1 marta yoziladi (oldi: ${anon})`);

  await cleanup();
  console.log(process.exitCode === 1 ? "\n❌ DEMAND-LOG SUITE FAILED" : "\n🎉 DEMAND-LOG SUITE PASSED");
}

main().then(() => process.exit(process.exitCode ?? 0)).catch((e) => { console.error(e); process.exit(1); });
