// Money integrity safety net. INVARIANT: a member's `coins` must always equal
// the sum of their CoinTxn ledger (both are written together by grantCoins/
// spendCoins). Any drift = a money bug — detect it, alert, and let an admin
// heal the balance to the authoritative ledger. Also flags farming anomalies.
import type { AdminIntegrity, AdminActionResult } from "@t1067/shared";
import { prisma } from "../db";
import { alertAdmins } from "./economyService";

const ANOMALY_24H_GAIN = Number(process.env.ANOMALY_24H_GAIN) || 80_000; // suspicious daily coin gain

/** Compare every member's coins balance to its ledger sum. */
export async function getIntegrity(): Promise<AdminIntegrity> {
  // ledger sum per member
  const sums = await prisma.coinTxn.groupBy({ by: ["memberId"], _sum: { amount: true } });
  const ledger = new Map(sums.map((s) => [s.memberId, s._sum.amount ?? 0]));

  // members with a non-zero balance OR any ledger entry
  const members = await prisma.member.findMany({
    where: { OR: [{ coins: { not: 0 } }, { id: { in: [...ledger.keys()] } }] },
    select: { id: true, fullName: true, coins: true },
  });

  const drifts: AdminIntegrity["drifts"] = [];
  let driftTotal = 0;
  for (const m of members) {
    const expected = ledger.get(m.id) ?? 0;
    const diff = Math.round((m.coins - expected) * 100) / 100;
    if (diff !== 0) {
      drifts.push({ memberId: m.id, member: m.fullName, balance: m.coins, ledger: expected, drift: diff });
      driftTotal += Math.abs(diff);
    }
  }
  drifts.sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift));

  // farming anomalies: biggest 24h coin gainers
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const gains = await prisma.coinTxn.groupBy({
    by: ["memberId"],
    where: { amount: { gt: 0 }, createdAt: { gte: since } },
    _sum: { amount: true },
    orderBy: { _sum: { amount: "desc" } },
    take: 10,
  });
  const gainMembers = new Map(
    (await prisma.member.findMany({ where: { id: { in: gains.map((g) => g.memberId) } }, select: { id: true, fullName: true } })).map((m) => [m.id, m.fullName]),
  );
  const anomalies = gains
    .map((g) => ({ memberId: g.memberId, member: gainMembers.get(g.memberId) ?? "?", gain24h: g._sum.amount ?? 0 }))
    .filter((a) => a.gain24h >= ANOMALY_24H_GAIN);

  return {
    checked: members.length,
    driftCount: drifts.length,
    driftTotal,
    drifts: drifts.slice(0, 50),
    anomalyThreshold: ANOMALY_24H_GAIN,
    anomalies,
  };
}

/** Admin: set a member's coin balance to its authoritative ledger sum. */
export async function healMember(memberId: number): Promise<AdminActionResult> {
  const agg = await prisma.coinTxn.aggregate({ where: { memberId }, _sum: { amount: true } });
  const ledger = Math.max(0, Math.floor(agg._sum.amount ?? 0));
  const before = (await prisma.member.findUnique({ where: { id: memberId }, select: { coins: true } }))?.coins ?? 0;
  if (before === ledger) return { ok: true, message: `Allaqachon to'g'ri (${ledger})` };
  await prisma.member.update({ where: { id: memberId }, data: { coins: ledger } });
  return { ok: true, message: `✅ Balans tuzatildi: ${before} → ${ledger} (ledger)` };
}

/** Periodic: alert admins if any drift or anomaly appears (called from the loop). */
export async function reconciliationWatch(): Promise<void> {
  const r = await getIntegrity();
  if (r.driftCount > 0) {
    await alertAdmins(`⚠️ <b>Pul drift!</b> ${r.driftCount} hisobda nomuvofiqlik (jami ${r.driftTotal.toLocaleString("ru-RU")} coin). Admin → Jurnal/Integrity.`);
  }
  for (const a of r.anomalies) {
    await alertAdmins(`🚨 Anomaliya: <b>${a.member}</b> 24s ichida +${a.gain24h.toLocaleString("ru-RU")} coin yutdi (chegara ${r.anomalyThreshold.toLocaleString("ru-RU")}).`);
  }
}
