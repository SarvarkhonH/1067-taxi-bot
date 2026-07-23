// READ-ONLY diagnostic: where did a member's tanga come from?
// Usage: tsx diagMyCoins.ts [telegramIdOrPhone]
import "../env";
import { prisma } from "../db";

const who = process.argv[2] ?? "6506297119"; // owner tg id default

async function main() {
  // resolve member: by TelegramUser id, else by phone suffix
  let memberId: number | null = null;
  const tu = await prisma.telegramUser.findUnique({ where: { id: who }, select: { memberId: true } });
  if (tu?.memberId) memberId = tu.memberId;
  if (!memberId) {
    const m = await prisma.member.findFirst({ where: { phone: { endsWith: who.replace(/^\+/, "") } }, select: { id: true } });
    if (m) memberId = m.id;
  }
  if (!memberId) {
    console.log(`❌ member topilmadi: ${who}`);
    return;
  }

  const m = await prisma.member.findUnique({
    where: { id: memberId },
    select: { id: true, type: true, fullName: true, displayName: true, phone: true, coins: true, points: true, trips: true, riskFlag: true, createdAt: true },
  });
  console.log("── MEMBER ─────────────────────────────");
  console.log(m);

  // total coin txns and window
  const [count, first, last] = await Promise.all([
    prisma.coinTxn.count({ where: { memberId } }),
    prisma.coinTxn.findFirst({ where: { memberId }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    prisma.coinTxn.findFirst({ where: { memberId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);
  console.log(`\n── LEDGER: ${count} ta yozuv, ${first?.createdAt?.toISOString()} → ${last?.createdAt?.toISOString()}`);

  // breakdown by kind (positive grants only) — WHERE the money came from
  const rows = await prisma.coinTxn.groupBy({
    by: ["kind"],
    where: { memberId },
    _sum: { amount: true },
    _count: { _all: true },
  });
  const sorted = rows
    .map((r) => ({ kind: r.kind, sum: Math.round(r._sum.amount ?? 0), n: r._count._all }))
    .sort((a, b) => b.sum - a.sum);
  console.log("\n── KIND BO'YICHA (musbat=kirim, manfiy=chiqim) ──");
  for (const r of sorted) console.log(`  ${r.kind.padEnd(18)} ${String(r.sum).padStart(12)}   (${r.n} ta)`);

  const totalIn = sorted.filter((r) => r.sum > 0).reduce((s, r) => s + r.sum, 0);
  const totalOut = sorted.filter((r) => r.sum < 0).reduce((s, r) => s + r.sum, 0);
  console.log(`  ${"—".repeat(18)} `);
  console.log(`  ${"JAMI KIRIM".padEnd(18)} ${String(totalIn).padStart(12)}`);
  console.log(`  ${"JAMI CHIQIM".padEnd(18)} ${String(totalOut).padStart(12)}`);

  // top 15 single grants (biggest lumps)
  const big = await prisma.coinTxn.findMany({
    where: { memberId, amount: { gt: 0 } },
    orderBy: { amount: "desc" },
    take: 15,
    select: { amount: true, kind: true, reason: true, createdAt: true },
  });
  console.log("\n── ENG KATTA 15 KIRIM ──");
  for (const t of big) console.log(`  +${String(Math.round(t.amount)).padStart(7)}  ${t.kind.padEnd(16)} ${t.createdAt.toISOString().slice(0, 16)}  ${t.reason.slice(0, 50)}`);

  // last 25 txns (recent activity)
  const recent = await prisma.coinTxn.findMany({
    where: { memberId },
    orderBy: { createdAt: "desc" },
    take: 25,
    select: { amount: true, kind: true, reason: true, createdAt: true },
  });
  console.log("\n── OXIRGI 25 HARAKAT ──");
  for (const t of recent) console.log(`  ${t.createdAt.toISOString().slice(0, 16)}  ${(t.amount > 0 ? "+" : "") + Math.round(t.amount)}`.padEnd(28) + `${t.kind.padEnd(16)} ${t.reason.slice(0, 46)}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
