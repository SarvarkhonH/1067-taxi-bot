// 🚦 qarz pilot — manage the per-member qarz whitelist WITHOUT flipping the global flag.
// Lets you enable qarz for a handful of real drivers, watch payment behavior, then either flip
// global OR roll back per-driver. Whitelist lives in AppState["qarz:pilot:{memberId}"]="on".
//
// Usage (from packages/server):
//   dotenv -e ../../.env -- tsx src/scripts/qarzPilot.ts list
//   dotenv -e ../../.env -- tsx src/scripts/qarzPilot.ts add 6506297119
//   dotenv -e ../../.env -- tsx src/scripts/qarzPilot.ts remove 6506297119
//   dotenv -e ../../.env -- tsx src/scripts/qarzPilot.ts payments [days=7]
//
// Lookup: argument can be a memberId (int), a telegram id (>1e9), or a phone (starts with +).
import "../env";
import { prisma } from "../db";
import { featureOn } from "../services/featureFlags";

type Action = "list" | "add" | "remove" | "payments";

async function resolveMemberId(arg: string): Promise<{ memberId: number; label: string } | null> {
  const n = Number(arg);
  if (!isNaN(n) && n > 0) {
    // Telegram ids are typically > 1e8; member ids are small ints. Try TelegramUser first if big.
    if (n > 1_000_000) {
      const tg = await prisma.telegramUser.findUnique({ where: { id: String(n) }, select: { memberId: true } });
      if (tg?.memberId) {
        const m = await prisma.member.findUnique({ where: { id: tg.memberId }, select: { fullName: true, carNumber: true, type: true } });
        return { memberId: tg.memberId, label: `${m?.fullName ?? "?"} (${m?.type}, ${m?.carNumber ?? "no plate"})` };
      }
    }
    const m = await prisma.member.findUnique({ where: { id: n }, select: { fullName: true, carNumber: true, type: true } });
    if (m) return { memberId: n, label: `${m.fullName ?? "?"} (${m.type}, ${m.carNumber ?? "no plate"})` };
  }
  // phone fallback
  if (arg.startsWith("+") || /^\d{9,}$/.test(arg)) {
    const m = await prisma.member.findFirst({ where: { phone: arg.startsWith("+") ? arg : `+${arg}` }, select: { id: true, fullName: true, carNumber: true, type: true } });
    if (m) return { memberId: m.id, label: `${m.fullName ?? "?"} (${m.type}, ${m.carNumber ?? "no plate"})` };
  }
  return null;
}

async function main(): Promise<void> {
  const [action, arg, arg2] = process.argv.slice(2) as [Action, string, string];
  if (!action || !["list", "add", "remove", "payments"].includes(action)) {
    console.error("Usage: qarzPilot list | add <id> | remove <id> | payments [days]");
    process.exit(2);
  }
  const globalOn = await featureOn("qarz");
  console.log(`Global feature:qarz = ${globalOn ? "ON (whitelist short-circuits to TRUE)" : "OFF (whitelist enforced)"}\n`);

  if (action === "list") {
    const rows = await prisma.appState.findMany({ where: { key: { startsWith: "qarz:pilot:" } } });
    if (rows.length === 0) {
      console.log("Pilot whitelist is EMPTY.");
    } else {
      console.log(`Whitelist (${rows.length} entries):`);
      for (const r of rows) {
        const memberId = Number(r.key.slice("qarz:pilot:".length));
        const m = await prisma.member.findUnique({ where: { id: memberId }, select: { fullName: true, carNumber: true, type: true, phone: true } });
        const status = r.value === "on" ? "✅ ON" : `(${r.value})`;
        console.log(`  ${status}  memberId=${memberId}  ${m?.fullName ?? "?"}  ${m?.type ?? "?"}  ${m?.carNumber ?? "—"}  ${m?.phone ?? "—"}`);
      }
    }
    await prisma.$disconnect();
    return;
  }

  if (action === "payments") {
    const days = Math.max(1, Math.min(90, parseInt(arg ?? "7", 10) || 7));
    const since = new Date(Date.now() - days * 86_400_000);
    const payments = await prisma.driverDebtPayment.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    if (payments.length === 0) {
      console.log(`No qarz payments in the last ${days} days.`);
    } else {
      console.log(`Last ${payments.length} qarz payment attempts (since ${since.toISOString().slice(0, 10)}):`);
      const totals: Record<string, number> = {};
      for (const p of payments) {
        totals[p.status] = (totals[p.status] ?? 0) + 1;
        const m = await prisma.member.findUnique({ where: { id: p.memberId }, select: { fullName: true } });
        console.log(`  ${p.createdAt.toISOString().slice(0, 16)}  ${p.status.padEnd(10)} ${String(p.amount).padStart(8)} so'm  ${p.carNumber}  ${m?.fullName ?? "?"}`);
      }
      console.log(`\nTotals by status:`, totals);
      const stuck = payments.filter((p) => p.status === "sent");
      if (stuck.length > 0) console.log(`\n⚠️  ${stuck.length} STUCK rows (status="sent") — admin reconciliation needed.`);
    }
    await prisma.$disconnect();
    return;
  }

  if (!arg) {
    console.error(`Usage: qarzPilot ${action} <memberId | telegramId | phone>`);
    process.exit(2);
  }
  const resolved = await resolveMemberId(arg);
  if (!resolved) {
    console.error(`Could not resolve "${arg}" to a member.`);
    process.exit(1);
  }
  const key = `qarz:pilot:${resolved.memberId}`;
  if (action === "add") {
    await prisma.appState.upsert({ where: { key }, create: { key, value: "on" }, update: { value: "on" } });
    console.log(`✅ Added to pilot: ${resolved.label}  (key=${key})`);
  } else if (action === "remove") {
    await prisma.appState.deleteMany({ where: { key } });
    console.log(`🗑 Removed from pilot: ${resolved.label}  (key=${key})`);
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
