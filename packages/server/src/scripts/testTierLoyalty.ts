// 🏅 Tier-loyalty INTEGRATION test — runs against the ISOLATED TEST DB (TEST_DATABASE_URL),
// never the app DB (the live bot's sweep would race synthetic members). TAG'd throwaway rows,
// full cleanup. Proves the LIVE mechanic on real Postgres: ball award (≥50%/100% + idempotent),
// soft decay (rate + floor + anti-yo-yo), flag-OFF no-op, driver exclusion.
import "./_testDb"; // MUST be first — repoints DATABASE_URL at TEST_DATABASE_URL or refuses to run
import { getDailyClientMissions } from "@t1067/shared";
import { prisma } from "../db";
import { __resetFeatureCache, setFeature } from "../services/featureFlags";
import { dayKey } from "../services/missionService";
import { runTierLoyaltyDaily } from "../services/tierLoyaltyService";

const TAG = `TLTEST_${Date.now()}`;
let warns = 0;
const mockBot = { api: { sendMessage: async () => { warns++; } } } as unknown as Parameters<typeof runTierLoyaltyDaily>[0];

let pass = 0, fail = 0;
const ok = (c: boolean, msg: string) => { if (c) { pass++; console.log("  ✅ " + msg); } else { fail++; console.log("  ❌ " + msg); } };
const dk = (offset: number) => dayKey(new Date(Date.now() + offset * 86400000));

async function mkMember(type: string, ball: number, lastActive: string | null, decayApplied: string | null) {
  return prisma.member.create({
    data: { type, kasId: `${TAG}_${type}_${Math.random().toString(36).slice(2, 8)}`, fullName: TAG, phone: `998${Math.floor(Math.random() * 1e9)}`.slice(0, 12), ballPoints: ball, lastActiveDay: lastActive, decayAppliedDay: decayApplied },
  });
}
async function asSweep(id: number) {
  const m = await prisma.member.findUniqueOrThrow({ where: { id } });
  return { id: m.id, type: m.type, ballPoints: m.ballPoints, lastActiveDay: m.lastActiveDay, decayAppliedDay: m.decayAppliedDay, telegramUser: { id: "999000" } };
}
async function claimDailies(memberId: number, day: string, n: number) {
  const codes = getDailyClientMissions(day).map((d) => d.code).slice(0, n);
  for (const code of codes) {
    await prisma.missionProgress.create({ data: { memberId, code, periodKey: day, progress: 99, claimedAt: new Date() } });
  }
  return getDailyClientMissions(day).length; // total dailies that day
}

async function main() {
  await setFeature("tierloyalty", true); __resetFeatureCache();
  const today = dk(0), yest = dk(-1);

  // ── TC-2: ≥50% (2/4) claimed yesterday → +ballHalf (100), idempotent ──
  {
    const m = await mkMember("client", 0, today, null); // active today → decay won't fire
    const total = await claimDailies(m.id, yest, 2);
    await runTierLoyaltyDaily(mockBot, await asSweep(m.id));
    let r = await prisma.member.findUniqueOrThrow({ where: { id: m.id } });
    ok(total === 4 && r.ballPoints === 100, `TC-2 ≥50% (2/${total}) → +100 ball (got ${r.ballPoints})`);
    await runTierLoyaltyDaily(mockBot, await asSweep(m.id)); // re-run same day
    r = await prisma.member.findUniqueOrThrow({ where: { id: m.id } });
    ok(r.ballPoints === 100, `TC-2 idempotent re-run → still 100 (got ${r.ballPoints})`);
  }

  // ── TC-3: 100% (4/4) claimed → +ballFull (250) ──
  {
    const m = await mkMember("client", 0, today, null);
    await claimDailies(m.id, yest, 4);
    await runTierLoyaltyDaily(mockBot, await asSweep(m.id));
    const r = await prisma.member.findUniqueOrThrow({ where: { id: m.id } });
    ok(r.ballPoints === 250, `TC-3 100% (4/4) → +250 ball (got ${r.ballPoints})`);
  }

  // ── TC-X: <50% (1/4) → no award ──
  {
    const m = await mkMember("client", 0, today, null);
    await claimDailies(m.id, yest, 1);
    await runTierLoyaltyDaily(mockBot, await asSweep(m.id));
    const r = await prisma.member.findUniqueOrThrow({ where: { id: m.id } });
    ok(r.ballPoints === 0, `TC-X 1/4 (<50%) → no award (got ${r.ballPoints})`);
  }

  // ── TC-4: decay after grace (8 idle days, 5000 ball) → floor(5000*0.95)=4750, once/day ──
  {
    const m = await mkMember("client", 5000, dk(-8), null);
    await runTierLoyaltyDaily(mockBot, await asSweep(m.id));
    let r = await prisma.member.findUniqueOrThrow({ where: { id: m.id } });
    ok(r.ballPoints === 4750 && r.decayAppliedDay === today, `TC-4 decay 5000→${r.ballPoints} (want 4750), stamped=${r.decayAppliedDay === today}`);
    await runTierLoyaltyDaily(mockBot, await asSweep(m.id)); // anti-yo-yo: same day no second decay
    r = await prisma.member.findUniqueOrThrow({ where: { id: m.id } });
    ok(r.ballPoints === 4750, `TC-7 anti-yo-yo: re-run same day → still 4750 (got ${r.ballPoints})`);
  }

  // ── TC-5: within grace (6 idle days) → NO decay ──
  {
    const m = await mkMember("client", 5000, dk(-6), null);
    await runTierLoyaltyDaily(mockBot, await asSweep(m.id));
    const r = await prisma.member.findUniqueOrThrow({ where: { id: m.id } });
    ok(r.ballPoints === 5000, `TC-5 grace (6d) → no decay (got ${r.ballPoints})`);
  }

  // ── TC-6: floor clamp — 1 ball decays to 0 (floor(1*.95)=0, max(0,…)), never negative ──
  {
    const m = await mkMember("client", 1, dk(-9), null);
    await runTierLoyaltyDaily(mockBot, await asSweep(m.id));
    let r = await prisma.member.findUniqueOrThrow({ where: { id: m.id } });
    ok(r.ballPoints === 0, `TC-6 floor: 1 ball, 9d idle → ${r.ballPoints} (want 0, never <0)`);
    // and a member already at 0 stays 0 (decay guard skips, no negative)
    const m2 = await mkMember("client", 0, dk(-15), null);
    await runTierLoyaltyDaily(mockBot, await asSweep(m2.id));
    r = await prisma.member.findUniqueOrThrow({ where: { id: m2.id } });
    ok(r.ballPoints === 0, `TC-6b 0 ball stays 0 (got ${r.ballPoints})`);
  }

  // ── TC-8: flag OFF → pure no-op ──
  {
    await setFeature("tierloyalty", false); __resetFeatureCache();
    const m = await mkMember("client", 3000, dk(-20), null);
    await claimDailies(m.id, yest, 4);
    await runTierLoyaltyDaily(mockBot, await asSweep(m.id));
    const r = await prisma.member.findUniqueOrThrow({ where: { id: m.id } });
    ok(r.ballPoints === 3000 && r.decayAppliedDay === null, `TC-8 flag OFF → no-op (ball ${r.ballPoints}, decay ${r.decayAppliedDay})`);
    await setFeature("tierloyalty", true); __resetFeatureCache();
  }

  // ── TC-WARN: idle == grace (7d) → bot warning fires once, no decay yet (grace boundary) ──
  {
    const before = warns;
    const m = await mkMember("client", 2000, dk(-7), null);
    await runTierLoyaltyDaily(mockBot, await asSweep(m.id));
    const r = await prisma.member.findUniqueOrThrow({ where: { id: m.id } });
    const nl = await prisma.notifyLog.count({ where: { memberId: m.id, kind: "decay_warn", dayKey: today } });
    ok(warns === before + 1 && r.ballPoints === 2000 && nl === 1, `TC-WARN idle=7 → 1 warning, no decay yet (warns+${warns - before}, ball ${r.ballPoints}, log ${nl})`);
  }

  // ── TC-20: driver excluded (flag ON) ──
  {
    const m = await mkMember("driver", 9999, dk(-30), null);
    await runTierLoyaltyDaily(mockBot, await asSweep(m.id));
    const r = await prisma.member.findUniqueOrThrow({ where: { id: m.id } });
    ok(r.ballPoints === 9999 && r.decayAppliedDay === null, `TC-20 driver excluded → unchanged (ball ${r.ballPoints})`);
  }

  console.log(`\n🏅 INTEGRATION: ${pass} passed, ${fail} failed, ${warns} decay-warnings fired`);
}

async function cleanup() {
  const ids = (await prisma.member.findMany({ where: { fullName: TAG }, select: { id: true } })).map((m) => m.id);
  await prisma.missionProgress.deleteMany({ where: { memberId: { in: ids } } });
  await prisma.notifyLog.deleteMany({ where: { memberId: { in: ids } } });
  await prisma.appState.deleteMany({ where: { key: { startsWith: "dailyball:" }, AND: ids.map(() => ({})) } }).catch(() => undefined);
  for (const id of ids) await prisma.appState.deleteMany({ where: { key: { startsWith: `dailyball:${id}:` } } }).catch(() => undefined);
  await prisma.member.deleteMany({ where: { fullName: TAG } });
}

main()
  .then(cleanup)
  .then(async () => { await prisma.$disconnect(); process.exit(fail === 0 ? 0 : 1); })
  .catch(async (e) => { console.error("FAIL", e instanceof Error ? e.message : e); await cleanup().catch(() => undefined); await prisma.$disconnect(); process.exit(1); });
