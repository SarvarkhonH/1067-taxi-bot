// One-time arcade drain: refund every live game escrow before the arcade
// tables are dropped. Idempotent (arcade_drain:<game>:<id> keys) — safe to
// re-run; a second pass grants nothing. Run: dotenv -e ../../.env -- tsx src/scripts/drainArcade.ts
import "../env";
import { prisma } from "../db";
import { grantCoins } from "../services/coinService";

async function main(): Promise<void> {
  let refunds = 0;
  let coins = 0;

  // 🏎 races started but never finished — stake is held in escrow
  const races = await prisma.raceSession.findMany({ where: { status: "created" } });
  for (const r of races) {
    const g = await grantCoins(r.memberId, r.stake, "race", "Poyga yopildi — tikilgan coin qaytarildi", `arcade_drain:race:${r.id}`);
    await prisma.raceSession.update({ where: { id: r.id }, data: { status: "refunded" } });
    if (g.ok) {
      refunds++;
      coins += r.stake;
    }
  }

  // ⚔️ duels not yet settled — challenger always staked; opponent too once accepted
  const duels = await prisma.duel.findMany({ where: { status: { in: ["created", "open", "accepted"] } } });
  for (const d of duels) {
    const gc = await grantCoins(d.challengerId, d.stake, "duel", "Duel yopildi — tikilgan coin qaytarildi", `arcade_drain:duel_ch:${d.id}`);
    if (gc.ok) {
      refunds++;
      coins += d.stake;
    }
    if (d.opponentId && d.status === "accepted") {
      const go = await grantCoins(d.opponentId, d.stake, "duel", "Duel yopildi — tikilgan coin qaytarildi", `arcade_drain:duel_op:${d.id}`);
      if (go.ok) {
        refunds++;
        coins += d.stake;
      }
    }
    await prisma.duel.update({ where: { id: d.id }, data: { status: "refunded" } });
  }

  // 🎰 crash rounds still live — stake held, no cashout happened
  const crashes = await prisma.crashRound.findMany({ where: { status: "live" } });
  for (const c of crashes) {
    const g = await grantCoins(c.memberId, c.stake, "crash", "Tezlik yopildi — tikilgan coin qaytarildi", `arcade_drain:crash:${c.id}`);
    await prisma.crashRound.update({ where: { id: c.id }, data: { status: "settled" } });
    if (g.ok) {
      refunds++;
      coins += c.stake;
    }
  }

  // park/quiz hold no escrow — nothing to refund there
  console.log(`drained: races=${races.length} duels=${duels.length} crashes=${crashes.length}`);
  console.log(`refunds granted: ${refunds} (${coins} coins)`);

  // gate: the money invariant must hold before we drop any table
  const { getIntegrity } = await import("../services/reconciliation");
  const integ = await getIntegrity();
  console.log(`integrity: checked=${integ.checked} drift=${integ.driftCount} anomalies=${integ.anomalies.length}`);
  if (integ.driftCount > 0) {
    console.error("❌ DRIFT DETECTED — do NOT drop tables. Investigate first.");
    process.exit(1);
  }
  console.log("✅ drift 0 — safe to purge schema");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
