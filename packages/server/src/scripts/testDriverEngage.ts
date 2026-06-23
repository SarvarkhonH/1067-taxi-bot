// Driver engagement push logic. The trigger decision is a PURE function (pickDriverNudge) so we can
// test every window/condition deterministically without faking the clock. Plus a flag-gate check.
//
// Run: KAS_MODE=mock pnpm tsx src/scripts/testDriverEngage.ts
import "../env";
import { prisma } from "../db";
import { pickDriverNudge, driverEngageTick } from "../services/driverEngageService";
import { setFeature, __resetFeatureCache } from "../services/featureFlags";

let failed = 0;
const ok = (c: boolean, l: string): void => { console.log(`${c ? "✅" : "❌"} ${l}`); if (!c) failed++; };

const base = { hour: 9, online: false, totalActive: 0, unassigned: 0, ridesToday: 0, fareToday: 0 };

async function main(): Promise<void> {
  // ── ① morning work-call (08–11) ──────────────────────────────────────────────
  ok(pickDriverNudge({ ...base, hour: 9, totalActive: 5 })?.kind === "drv_workcall", `09:00 offline + 5 orders → work-call`);
  ok(pickDriverNudge({ ...base, hour: 9, totalActive: 5, online: true }) === null, `09:00 ONLINE → no push (already working)`);
  ok(pickDriverNudge({ ...base, hour: 9, totalActive: 0 }) === null, `09:00 but 0 orders → no push (don't cry wolf)`);
  ok(pickDriverNudge({ ...base, hour: 7, totalActive: 5 }) === null, `07:00 → too early (quiet handled upstream; window excludes it)`);
  ok(pickDriverNudge({ ...base, hour: 9, totalActive: 5, unassigned: 2 })?.html.includes("2 tasi haydovchisiz") === true, `work-call mentions unassigned count`);

  // ── ② daytime demand spike (11–20) ──────────────────────────────────────────
  ok(pickDriverNudge({ ...base, hour: 14, unassigned: 4, totalActive: 6 })?.kind === "drv_demand", `14:00 offline + 4 unassigned → demand spike`);
  ok(pickDriverNudge({ ...base, hour: 14, unassigned: 2, totalActive: 6 }) === null, `14:00 only 2 unassigned (< spike 3) → no push`);
  ok(pickDriverNudge({ ...base, hour: 14, unassigned: 4, online: true }) === null, `14:00 ONLINE → no demand push`);

  // ── ③ evening summary (20–21) ───────────────────────────────────────────────
  ok(pickDriverNudge({ ...base, hour: 20, ridesToday: 12, fareToday: 184000 })?.kind === "drv_eod", `20:00 worked 12 → EOD summary`);
  ok(pickDriverNudge({ ...base, hour: 20, ridesToday: 12, fareToday: 184000 })?.html.includes("12 safar") === true, `EOD shows ride count`);
  ok(pickDriverNudge({ ...base, hour: 20, ridesToday: 0, totalActive: 5 })?.html.includes("safaringiz yo'q") === true, `20:00 no rides but demand existed → missed-work nudge`);
  ok(pickDriverNudge({ ...base, hour: 20, ridesToday: 0, totalActive: 0 }) === null, `20:00 no rides AND no demand → say nothing`);

  // ── windows are exclusive ───────────────────────────────────────────────────
  ok(pickDriverNudge({ ...base, hour: 23, totalActive: 5, unassigned: 5, ridesToday: 5 }) === null, `23:00 → outside all windows → null`);

  // ── flag gate (integration) ─────────────────────────────────────────────────
  const before = await prisma.appState.findUnique({ where: { key: "feature:drvpush" } });
  try {
    await setFeature("drvpush", false);
    __resetFeatureCache();
    let sends = 0;
    const fakeBot = { api: { sendMessage: async () => { sends++; } } } as never;
    await driverEngageTick(fakeBot);
    ok(sends === 0, `flag OFF → driverEngageTick sends nothing (got ${sends})`);
  } finally {
    if (before) await prisma.appState.upsert({ where: { key: "feature:drvpush" }, create: { key: "feature:drvpush", value: before.value }, update: { value: before.value } });
    else await prisma.appState.deleteMany({ where: { key: "feature:drvpush" } });
    __resetFeatureCache();
  }

  await prisma.$disconnect();
  console.log(failed ? `\n❌ ${failed} FAIL` : "\n✅ DRIVER-ENGAGE: ishga-chiqing / demand / EOD triggerlari to'g'ri + flag-gated");
  process.exit(failed ? 1 : 0);
}
main();
