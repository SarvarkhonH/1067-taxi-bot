// QA REVISE — prove the resilience/atomicity hardenings on the 3 REAL items
// (garage ridesSinceService + barter multi-pledge were already-fixed false-positives):
//   - openBox: a crash after the BoxOpen row but before the grant no longer loses the
//     coins — a retry COMPLETES the idempotent grant exactly once; concurrent → 1 grant.
//   - claimMission: pay-first (idempotent key) → coins land before the "claimed" marker;
//     concurrent claims pay exactly once.
//   - claimDispatchSlot: atomic anti-double-dispatch (N concurrent taps → 1 winner).
// Prod DB, TAG'd members + full cleanup (NO global sweep). Run: tsx src/scripts/testReviseFixes.ts
import "../env";
import { prisma } from "../db";
import { openBox } from "../services/boxService";
import { claimMission, incrementMission } from "../services/missionService";
import { claimDispatchSlot } from "../services/bookingService";

const TAG = "revise-test";
let failed = 0;
const ok = (c: boolean, l: string): void => { console.log(`${c ? "✅" : "❌"} ${l}`); if (!c) failed++; };
const bal = async (id: number): Promise<number> => (await prisma.member.findUnique({ where: { id } }))!.coins;
const txnCount = (key: string): Promise<number> => prisma.coinTxn.count({ where: { idempotencyKey: key } });
const tashDay = (): string => new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10);

async function cleanup(): Promise<void> {
  const ms = await prisma.member.findMany({ where: { kasId: { startsWith: TAG } }, select: { id: true } });
  const ids = ms.map((m) => m.id);
  await prisma.coinTxn.deleteMany({ where: { memberId: { in: ids } } });
  await prisma.boxOpen.deleteMany({ where: { memberId: { in: ids } } });
  await prisma.missionProgress.deleteMany({ where: { memberId: { in: ids } } });
  await prisma.member.deleteMany({ where: { id: { in: ids } } });
}

async function main(): Promise<void> {
  await cleanup();
  try {
    const day = tashDay();

    // ── openBox: crash-recovery + idempotency ──
    const m1 = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-box`, fullName: "Box", phone: "+998900066001", coins: 0 } });
    // simulate a CRASH after the BoxOpen row was written but before the grant landed
    await prisma.boxOpen.create({ data: { memberId: m1.id, dayKey: day, prize: "100 so'm", amount: 100, premium: false } });
    ok((await txnCount(`box:${m1.id}:${day}`)) === 0, "openBox setup: box row exists, grant NOT yet done");
    const r1 = await openBox(m1.id);
    ok(r1.applied === true && (await bal(m1.id)) === 100, `openBox crash-retry COMPLETES the grant once (was lost-forever before; bal=${await bal(m1.id)})`);
    const r2 = await openBox(m1.id);
    ok(r2.applied === false && (await bal(m1.id)) === 100, "openBox re-open → no double grant (bal still 100)");
    ok((await txnCount(`box:${m1.id}:${day}`)) === 1, "openBox: exactly 1 box CoinTxn for the day");

    const m2 = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-boxc`, fullName: "BoxC", phone: "+998900066002", coins: 0 } });
    await prisma.boxOpen.create({ data: { memberId: m2.id, dayKey: day, prize: "200 so'm", amount: 200, premium: false } });
    await Promise.all(Array.from({ length: 6 }, () => openBox(m2.id).catch(() => null)));
    ok((await bal(m2.id)) === 200 && (await txnCount(`box:${m2.id}:${day}`)) === 1, `openBox 6× concurrent → exactly 1 grant (bal=${await bal(m2.id)})`);

    // ── claimMission: pay-first, no double under concurrency ──
    const m3 = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-mis`, fullName: "Mis", phone: "+998900066003", coins: 0 } });
    await incrementMission(m3.id, "daily_ride"); // 1/1 → claimable (reward 100)
    const cc1 = await claimMission(m3.id, "daily_ride");
    ok(cc1.ok === true && cc1.applied === true && (await bal(m3.id)) === 100, `claimMission pays once (bal=${await bal(m3.id)})`);
    const cc2 = await claimMission(m3.id, "daily_ride");
    ok(cc2.ok === false && cc2.reason === "claimed" && (await bal(m3.id)) === 100, "claimMission re-claim → claimed, no double");

    const m4 = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-misc`, fullName: "MisC", phone: "+998900066004", coins: 0 } });
    await incrementMission(m4.id, "daily_ride");
    const claims = await Promise.all(Array.from({ length: 6 }, () => claimMission(m4.id, "daily_ride").catch(() => ({ ok: false, applied: false }))));
    const paid = claims.filter((r) => r.ok && r.applied).length;
    ok(paid === 1 && (await bal(m4.id)) === 100, `claimMission 6× concurrent → exactly 1 paid (paid=${paid}, bal=${await bal(m4.id)})`);

    // ── claimDispatchSlot: atomic anti-double-dispatch ──
    const m5 = await prisma.member.create({ data: { type: "client", kasId: `${TAG}-disp`, fullName: "Disp", phone: "+998900066005", lastBookingAt: null } });
    const slots = await Promise.all(Array.from({ length: 8 }, () => claimDispatchSlot(m5.id)));
    const won = slots.filter((s) => s.ok).length;
    ok(won === 1, `claimDispatchSlot 8× concurrent → exactly 1 wins (won=${won})`);
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
  console.log(failed ? `\n❌ ${failed} FAIL` : "\n🛡 REVISE-FIXES: openBox crash-safe + claimMission no-double + dispatch atomic");
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error("FATAL", e instanceof Error ? e.message : e); process.exit(1); });
