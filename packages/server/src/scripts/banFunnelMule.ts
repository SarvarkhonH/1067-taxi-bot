// 🚫 Welcome-funnel clawback helper — freezes / bans a mule surfaced by findWelcomeFunnel.ts.
// SAFE BY DEFAULT: with no --confirm it only PRINTS the plan (dry-run). It never auto-reverses coins
// — reversal is a per-victim judgment call (some "victims" may be legit gifters), so this script
// prints the suggested clawback amounts and leaves the money move to a deliberate admin decision.
//
//   dry-run:  dotenv -e ../../.env -- tsx src/scripts/banFunnelMule.ts <muleId>
//   freeze:   dotenv -e ../../.env -- tsx src/scripts/banFunnelMule.ts <muleId> --confirm         (riskFlag: stops withdraw)
//   hard ban: dotenv -e ../../.env -- tsx src/scripts/banFunnelMule.ts <muleId> --confirm --ban    (total product lockout)
import "../env";
import { prisma } from "../db";
import { banMember } from "../services/banService";
import { alertAdmins } from "../services/economyService";

async function main(): Promise<void> {
  const muleId = parseInt(process.argv[2] ?? "", 10);
  const confirm = process.argv.includes("--confirm");
  const hardBan = process.argv.includes("--ban");
  if (!muleId) { console.error("usage: banFunnelMule.ts <muleId> [--confirm] [--ban]"); process.exit(1); }

  const m = await prisma.member.findUnique({
    where: { id: muleId },
    select: { fullName: true, phone: true, type: true, trips: true, coins: true, banned: true, riskFlag: true },
  });
  if (!m) { console.error(`member #${muleId} not found`); process.exit(1); }

  // funnel breakdown (welcome-sourced inflows), same rule as the detector
  const welcomes = await prisma.coinTxn.findMany({ where: { idempotencyKey: { startsWith: "welcome_join:" } }, select: { memberId: true, createdAt: true } });
  const welcomeAt = new Map(welcomes.map((w) => [w.memberId, w.createdAt]));
  const inflows = await prisma.transfer.findMany({ where: { toMemberId: muleId }, select: { fromMemberId: true, amount: true, createdAt: true } });
  const funnel = inflows.filter((t) => { const g = welcomeAt.get(t.fromMemberId); return g && t.createdAt >= g; });
  const total = funnel.reduce((s, t) => s + t.amount, 0);
  const senders = new Set(funnel.map((t) => t.fromMemberId));

  console.log(`MULE #${muleId}  ${m.fullName}  ${m.phone}  [${m.type}]  trips=${m.trips}  coins=${m.coins}`);
  console.log(`welcome-sourced inflow: ${senders.size} senders, ${total.toLocaleString()} tanga`);
  console.log(`current: ${m.banned ? "BANNED" : "not banned"}, ${m.riskFlag ? "riskFlag ON" : "riskFlag off"}`);

  if (!confirm) {
    console.log(`\n[DRY-RUN] would ${hardBan ? "HARD-BAN" : "riskFlag (freeze withdraw on)"} #${muleId}. Re-run with --confirm to apply.`);
    console.log(`[DRY-RUN] coins are NOT reversed automatically — review the victim list (findWelcomeFunnel.ts) and move money by hand if warranted.`);
    await prisma.$disconnect();
    return;
  }

  // riskFlag ALWAYS on confirm — freezes the cash door immediately (coins stay in-app, fully reversible)
  await prisma.member.update({ where: { id: muleId }, data: { riskFlag: true, riskNote: `welcome-funnel: ${senders.size} senders / ${total} tanga` } });
  console.log(`✅ riskFlag ON — withdraw door frozen for #${muleId}.`);

  if (hardBan) {
    const r = await banMember(muleId, `welcome-funnel abuse (${senders.size} senders, ${total} tanga)`, "funnel-script");
    console.log(`${r.ok ? "✅" : "❌"} hard ban: ${r.message}`);
  }
  await alertAdmins(`🚫 Welcome-funnel: #${muleId} ${m.fullName} ${hardBan ? "BANNED" : "riskFlag ON"} — ${senders.size} senders, ${total.toLocaleString()} tanga`).catch(() => undefined);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
