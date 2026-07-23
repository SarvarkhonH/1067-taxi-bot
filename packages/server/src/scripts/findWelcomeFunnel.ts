// 🔎 Welcome-funnel detector (READ-ONLY) — finds the "onboard people, sweep their 5000 to myself"
// abuse retroactively. A funnel signature: member M receives P2P transfers from N distinct senders
// where each sender got a JOIN welcome (welcome_join:*) and sent to M AFTER receiving it. The
// transferService lock now BLOCKS this going forward; this script surfaces PAST damage so an admin
// can ban the mule + claw back. Nothing is mutated here — it only prints a report.
//
// Run: dotenv -e ../../.env -- tsx src/scripts/findWelcomeFunnel.ts [minSenders=3]
import "../env";
import { prisma } from "../db";

async function main(): Promise<void> {
  const minSenders = Math.max(2, parseInt(process.argv[2] ?? "3", 10) || 3);

  // 1) every JOIN welcome grant → { memberId: grantedAt }
  const welcomes = await prisma.coinTxn.findMany({
    where: { idempotencyKey: { startsWith: "welcome_join:" }, amount: { gt: 0 } },
    select: { memberId: true, amount: true, createdAt: true },
  });
  const welcomeAt = new Map<number, Date>();
  for (const w of welcomes) welcomeAt.set(w.memberId, w.createdAt);
  console.log(`ℹ️  ${welcomes.length} welcome grants on record.`);

  // 2) all value-out transfers (any kind — the lock covers transfer/tip/fare alike)
  const transfers = await prisma.transfer.findMany({
    select: { fromMemberId: true, toMemberId: true, amount: true, kind: true, createdAt: true },
  });

  // 3) keep only transfers whose SENDER funneled their OWN welcome out (sent AFTER the grant)
  type Hit = { from: number; amount: number; kind: string; at: Date };
  const byMule = new Map<number, Hit[]>();
  for (const t of transfers) {
    const grantedAt = welcomeAt.get(t.fromMemberId);
    if (!grantedAt) continue; // sender never got a welcome → not a funnel of welcome money
    if (t.createdAt < grantedAt) continue; // sent before the welcome existed → unrelated
    const arr = byMule.get(t.toMemberId) ?? [];
    arr.push({ from: t.fromMemberId, amount: t.amount, kind: t.kind, at: t.createdAt });
    byMule.set(t.toMemberId, arr);
  }

  // 4) rank mules by DISTINCT welcome-sourced senders
  const suspects = [...byMule.entries()]
    .map(([mule, hits]) => {
      const distinct = new Set(hits.map((h) => h.from));
      const total = hits.reduce((s, h) => s + h.amount, 0);
      return { mule, senders: distinct.size, total, hits };
    })
    .filter((s) => s.senders >= minSenders)
    .sort((a, b) => b.total - a.total);

  if (!suspects.length) {
    console.log(`\n✅ No mule received welcome-sourced transfers from ≥${minSenders} distinct people. Clean.`);
    await prisma.$disconnect();
    return;
  }

  console.log(`\n⚠️  ${suspects.length} suspected funnel target(s) (≥${minSenders} welcome-sourced senders):\n`);
  for (const s of suspects) {
    const m = await prisma.member.findUnique({
      where: { id: s.mule },
      select: { fullName: true, phone: true, type: true, trips: true, coins: true, banned: true, riskFlag: true },
    });
    console.log("─".repeat(72));
    console.log(`MULE  #${s.mule}  ${m?.fullName ?? "?"}  ${m?.phone ?? "?"}  [${m?.type}]  trips=${m?.trips}  coins=${m?.coins}`);
    console.log(`      welcome-sourced: ${s.senders} distinct senders, total ${s.total.toLocaleString()} tanga  ${m?.banned ? "🚫BANNED" : ""}${m?.riskFlag ? " ⚠️riskFlag" : ""}`);
    // per-victim breakdown (how much to claw back to each)
    const perVictim = new Map<number, number>();
    for (const h of s.hits) perVictim.set(h.from, (perVictim.get(h.from) ?? 0) + h.amount);
    for (const [from, amt] of [...perVictim.entries()].sort((a, b) => b[1] - a[1])) {
      const v = await prisma.member.findUnique({ where: { id: from }, select: { fullName: true, phone: true, trips: true } });
      console.log(`        ← #${from}  ${v?.fullName ?? "?"}  ${v?.phone ?? "?"}  (victim trips=${v?.trips})  sent ${amt.toLocaleString()}`);
    }
    console.log(`      ▶ to lock out: dotenv -e ../../.env -- tsx src/scripts/banFunnelMule.ts ${s.mule}   (review first — this script does NOT ban)`);
  }
  console.log("─".repeat(72));
  console.log(`\nNote: this is a HEURISTIC. Some senders may legitimately gift a friend AFTER their own first ride.`);
  console.log(`Cross-check victim trips (0 = never rode = classic funnel victim) before any ban/clawback.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
