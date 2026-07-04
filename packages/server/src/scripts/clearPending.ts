// A3 admin tool: resolve a stuck kas-write "sent" marker AFTER manually checking what kas did.
// These markers mean a real-money kas write's outcome is UNKNOWN (crash/timeout mid-write) — the
// member's cash door is blocked until one of these runs:
//   tsx src/scripts/clearPending.ts list
//   tsx src/scripts/clearPending.ts resolve <full-key>   # kas DID apply → release the block, done
//   tsx src/scripts/clearPending.ts refund  <full-key>   # kas did NOT apply → refund coins + release
import "../env";
import { prisma } from "../db";

async function main(): Promise<void> {
  const [action, key] = process.argv.slice(2);
  if (action === "list" || !action) {
    const rows = await prisma.appState.findMany({
      where: { OR: [{ key: { startsWith: "pending:wdsent:" } }, { key: { startsWith: "pending:admmove:" } }] },
    });
    if (!rows.length) console.log("✅ NOANIQ kas-yozuv markerlari yo'q.");
    for (const r of rows) console.log(`${r.key}  ${r.value}  (updated ${r.updatedAt.toISOString()})`);
    await prisma.$disconnect();
    return;
  }
  if (!key || !/^pending:(wdsent|admmove):/.test(key)) {
    console.error("Usage: clearPending.ts list | resolve <key> | refund <key>  (key = pending:wdsent:* | pending:admmove:*)");
    process.exit(1);
  }
  const row = await prisma.appState.findUnique({ where: { key } });
  if (!row) {
    console.error(`Topilmadi: ${key}`);
    process.exit(1);
  }
  const payload = JSON.parse(row.value) as { memberId: number; amount: number };

  if (action === "refund") {
    const { grantCoins } = await import("../services/coinService");
    const kind = key.includes(":wdsent:") ? "withdraw_refund" : "admin_coin";
    const g = await grantCoins(payload.memberId, payload.amount, kind, "Kas yozuvi yetib bormagan — tanga qaytarildi (qo'lda)", `${key}:refund`);
    console.log(g.ok || g.skipped === "duplicate" ? `✅ ${payload.amount} tanga qaytarildi (m${payload.memberId})` : `❌ refund xato: ${JSON.stringify(g)}`);
    if (key.includes(":wdsent:")) {
      const { releaseWithdrawBudget } = await import("../services/economyService");
      await releaseWithdrawBudget(payload.amount).catch(() => undefined);
      await prisma.withdrawal.create({ data: { memberId: payload.memberId, amount: payload.amount, kasApplied: false, kasMessage: "manual-refund (clearPending)" } }).catch(() => null);
    }
  } else if (action !== "resolve") {
    console.error(`Noma'lum amal: ${action}`);
    process.exit(1);
  } else if (key.includes(":wdsent:")) {
    // kas DID apply → the withdrawal really happened; record it so reconciliation sees it
    await prisma.withdrawal.create({ data: { memberId: payload.memberId, amount: payload.amount, kasApplied: true, kasMessage: "manual-resolve (clearPending)" } }).catch(() => null);
  }
  await prisma.appState.delete({ where: { key } });
  console.log(`✅ ${key} yechildi (${action}).`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
