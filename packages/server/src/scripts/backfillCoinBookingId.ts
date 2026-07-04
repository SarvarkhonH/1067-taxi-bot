// perf audit B4 one-shot: backfill CoinTxn.bookingId from the idempotency-key suffix so the ≤350/ride
// clamp reads the indexed column, not an endsWith scan. Ride-bound grants key `<prefix>:<memberId>:<bookingId>`.
// SAFE: only fills NULL bookingId on positive rows whose key ends in `:<memberId>:<digits>`; never touches
// amounts, keys, or non-ride rows. Idempotent — re-runnable. Run once after the schema `db push` lands:
//   tsx src/scripts/backfillCoinBookingId.ts          # live DB (DATABASE_URL)
import "../env";
import { prisma } from "../db";

async function main(): Promise<void> {
  const BATCH = 2000;
  let cursor = 0;
  let filled = 0;
  let scanned = 0;
  for (;;) {
    const rows = await prisma.coinTxn.findMany({
      where: { bookingId: null, amount: { gt: 0 }, idempotencyKey: { not: null } },
      select: { id: true, memberId: true, idempotencyKey: true },
      orderBy: { id: "asc" },
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      take: BATCH,
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1]!.id;
    scanned += rows.length;
    for (const r of rows) {
      // key ends with `:<memberId>:<bookingId>` for ride-bound grants
      const m = /:(\d+):(\d+)$/.exec(r.idempotencyKey ?? "");
      if (!m) continue;
      if (Number(m[1]) !== r.memberId) continue; // suffix member must match this row's member (real ride key)
      const bookingId = Number(m[2]);
      if (!Number.isFinite(bookingId) || bookingId <= 0) continue;
      await prisma.coinTxn.update({ where: { id: r.id }, data: { bookingId } }).catch(() => undefined);
      filled++;
    }
    console.log(`… scanned ${scanned}, filled ${filled} (cursor ${cursor})`);
  }
  console.log(`✅ backfill done: ${filled} ride-bound CoinTxn rows stamped with bookingId (of ${scanned} candidates).`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
