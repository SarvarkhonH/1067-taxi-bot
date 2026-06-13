// T2 TEZLIK — server-tomon o'lchovi (Render-mustaqil). WAN-latency wall-time'ni
// shovqinga ko'madi, shuning uchun ESKI va YANGI query SHAKLINI ketma-ket, bir xil
// bazaga uramiz — RTT delta'da bekor bo'ladi. Rows + median + EXPLAIN bilan isbot.
// Run: dotenv -e ../../.env -- tsx src/scripts/testPerf.ts
import "../env";
import { prisma } from "../db";

async function median(fn: () => Promise<unknown>, runs = 9): Promise<number> {
  await fn().catch(() => undefined); // warm-up
  const t: number[] = [];
  for (let i = 0; i < runs; i++) {
    const s = performance.now();
    await fn().catch(() => undefined);
    t.push(performance.now() - s);
  }
  t.sort((a, b) => a - b);
  return Math.round(t[Math.floor(t.length / 2)]!);
}

async function main(): Promise<void> {
  const memberN = await prisma.member.count();
  const sample = await prisma.member.findFirst({ where: { type: "client" } });
  const pts = sample?.points ?? 0;
  console.log(`\n=== T2 PERF (jonli PG) · Member=${memberN} satr ===\n`);

  // ── AUDIT 2.1/2.3: rank hisoblash ──────────────────────────────────────
  // ESKI: butun jadvalni yuklab, JS'da saralash
  const oldRank = await median(async () => {
    const all = await prisma.member.findMany({ where: { type: "client" }, select: { id: true, points: true } });
    [...all].sort((a, b) => b.points - a.points).findIndex((x) => x.id === sample?.id);
    return all.length;
  });
  // YANGI: bitta indeksli COUNT
  const newRank = await median(() => prisma.member.count({ where: { type: "client", points: { gt: pts } } }));
  const allRows = await prisma.member.count({ where: { type: "client" } });
  console.log(`rank — ESKI (findMany ${allRows} satr + JS sort): ${oldRank} ms`);
  console.log(`rank — YANGI (count-ahead, 1 int):               ${newRank} ms`);
  console.log(`→ ${oldRank > 0 ? Math.round((1 - newRank / oldRank) * 100) : 0}% tezroq · ${allRows} satr → 1 int transfer\n`);

  // ── indeks isboti: EXPLAIN count-ahead ─────────────────────────────────
  const plan = await prisma.$queryRawUnsafe<{ "QUERY PLAN": string }[]>(
    `EXPLAIN SELECT count(*) FROM "Member" WHERE "type"='client' AND "points" > ${pts}`,
  );
  const usesIndex = plan.some((r) => /Index/i.test(r["QUERY PLAN"]));
  console.log(`count-ahead EXPLAIN: ${usesIndex ? "✅ Index ishlatilyapti" : "⚠️ Seq Scan"} (Member_type_points_idx)`);
  plan.slice(0, 3).forEach((r) => console.log("   " + r["QUERY PLAN"]));

  // ── AUDIT 2.5: phone endsWith lookup (indeks Member_phone_idx) ─────────
  const phonePlan = await prisma.$queryRawUnsafe<{ "QUERY PLAN": string }[]>(
    `EXPLAIN SELECT id FROM "Member" WHERE "phone" LIKE '%123456789'`,
  );
  console.log(`\nphone-lookup EXPLAIN: ${phonePlan.map((r) => r["QUERY PLAN"].trim()).join(" | ").slice(0, 90)}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
