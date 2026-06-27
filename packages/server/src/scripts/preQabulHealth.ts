// PRE-1 owner-QABUL health check: confirms motorolami preview state + flag posture + per-feature
// owner readiness so the owner knows exactly what they're walking into before pressing buttons.
import "../env";
import { prisma } from "../db";
import { featureOn } from "../services/featureFlags";

const OWNER_TG = "6506297119";

(async () => {
  console.log("─── PRE-1 owner QABUL health ───\n");

  // 1. Owner identity
  const tu = await prisma.telegramUser.findUnique({ where: { id: OWNER_TG }, select: { memberId: true } });
  if (!tu?.memberId) {
    console.log("❌ Owner telegramId", OWNER_TG, "is NOT linked. Run /start in the bot first.");
    process.exit(1);
  }
  const m = await prisma.member.findUnique({ where: { id: tu.memberId }, select: { id: true, fullName: true, type: true, carNumber: true, phone: true, coins: true, trips: true } });
  console.log(`✅ Owner linked: memberId=${m?.id}  ${m?.fullName}  type=${m?.type}  car=${m?.carNumber ?? "—"}  trips=${m?.trips}`);
  console.log(`   Coins: 🪙 ${(m?.coins ?? 0).toLocaleString("ru-RU")}\n`);

  // 2. Flag posture (DARK vs LIVE)
  const flags = ["garajx", "motorolami", "qarz", "booking3", "welcomebonus", "drvrecruit", "recruit"];
  console.log("─── Feature flags ───");
  for (const f of flags) {
    const on = await featureOn(f);
    const row = await prisma.appState.findUnique({ where: { key: `feature:${f}` } });
    const explicit = row?.value;
    console.log(`  ${on ? "🟢 ON " : "⚫ OFF"}  ${f.padEnd(14)} ${explicit ? `(explicit "${explicit}")` : "(default)"}`);
  }
  console.log("\n  💡 motorolami=OFF + owner-preview means ONLY you see Motor/CarCheck/Speeder etc.");

  // 3. Owner garage state
  const cars = await prisma.garajCar.findMany({ where: { memberId: m!.id, soldAt: null } });
  console.log(`\n─── Owner garage (${cars.length} active car${cars.length === 1 ? "" : "s"}) ───`);
  for (const c of cars) {
    const bits = [
      `serial=${c.serial ?? "—"}`,
      `hp=${c.engineHp}%`,
      `merge★${c.mergeCount}`,
      c.variant ? `variant=${c.variant}` : null,
      c.speederUntilAt && c.speederUntilAt > new Date() ? `speeder until ${c.speederUntilAt.toISOString().slice(0, 10)}` : null,
      c.fueledUntilAt ? `fuel until ${c.fueledUntilAt.toISOString().slice(0, 16)}` : null,
      c.hiddenDefect ? `🕵 hidden defect` : null,
    ].filter(Boolean).join("  ");
    console.log(`  ${c.carCode.padEnd(8)} ${bits}`);
  }
  if (cars.length === 0) console.log("  (empty — buy one in Bozor to start the QABUL flow)");

  // 4. Owner pilot whitelist for qarz
  const qarzPilots = await prisma.appState.findMany({ where: { key: { startsWith: "qarz:pilot:" } } });
  console.log(`\n─── qarz pilot whitelist (${qarzPilots.length}) ───`);
  for (const p of qarzPilots) console.log(`  ${p.value === "on" ? "✅" : "—"}  memberId=${p.key.slice("qarz:pilot:".length)}`);
  if (qarzPilots.length === 0) console.log("  (empty — qarz works for ALL drivers via global flag if ON)");

  // 5. Recent CoinTxn snapshot (last 5)
  const recentTxn = await prisma.coinTxn.findMany({ where: { memberId: m!.id }, orderBy: { createdAt: "desc" }, take: 5 });
  console.log(`\n─── Last ${recentTxn.length} coin txns (owner) ───`);
  for (const t of recentTxn) {
    const sign = t.amount > 0 ? "+" : "";
    console.log(`  ${t.createdAt.toISOString().slice(0, 16)}  ${sign}${t.amount.toString().padStart(7)}  ${t.kind.padEnd(20)} ${t.reason.slice(0, 50)}`);
  }

  console.log("\n─── Ready for QABUL. Open the Mini App on your phone. ───");
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
