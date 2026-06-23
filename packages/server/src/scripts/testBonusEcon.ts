// Round-trip check for the owner-tunable bonus config: defaults → set → clamp → restore.
// Safe: only touches the AppState "bonus:econ" row (no kas, no sweep). Run:
//   pnpm --filter @t1067/server exec tsx src/scripts/testBonusEcon.ts
import "../env";
import { prisma } from "../db";
import { getBonusEcon, setBonusEcon } from "../services/bonusConfig";
import { bonusEconDefaults } from "@t1067/shared";

let pass = 0,
  fail = 0;
function ok(cond: boolean, msg: string): void {
  if (cond) {
    pass++;
    console.log("✅", msg);
  } else {
    fail++;
    console.log("❌", msg);
  }
}

async function main(): Promise<void> {
  const hadRow = (await prisma.appState.findUnique({ where: { key: "bonus:econ" } })) !== null;
  const def = bonusEconDefaults();
  const d = await getBonusEcon();
  ok(d.firstRide === def.firstRide && d.referrer === def.referrer && d.drvMilestone === def.drvMilestone, `defaults: firstRide=${d.firstRide} referrer=${d.referrer} drvMilestone=${d.drvMilestone}`);

  let v = await setBonusEcon("firstRide", 7000);
  ok(v.firstRide === 7000, `set firstRide=7000 → ${v.firstRide}`);

  v = await setBonusEcon("firstRide", 999999); // over max 20000 → clamp
  ok(v.firstRide === 20000, `set 999999 clamps to max 20000 → ${v.firstRide}`);

  v = await setBonusEcon("drvRides", 9.7); // integer knob → round
  ok(v.drvRides === 10, `drvRides 9.7 rounds to 10 → ${v.drvRides}`);

  v = await setBonusEcon("nope", 1); // unknown key → no-op, full config returned
  ok(!("nope" in v) && typeof v.firstRide === "number", `unknown key ignored, config intact`);

  // restore to a clean slate: if there was no row before, delete it; else reset firstRide/drvRides
  if (!hadRow) {
    await prisma.appState.delete({ where: { key: "bonus:econ" } }).catch(() => undefined);
    const back = await getBonusEcon();
    ok(back.firstRide === def.firstRide, `row removed → back to defaults (firstRide=${back.firstRide})`);
  } else {
    await setBonusEcon("firstRide", def.firstRide!);
    await setBonusEcon("drvRides", def.drvRides!);
  }

  console.log(`\n${fail === 0 ? "ALL GREEN" : "FAILED"} — ${pass} pass, ${fail} fail`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}
main();
