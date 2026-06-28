// 🌍 Motor Olami serial backfill — assigns a global #serial to active cars that were bought
// BEFORE motorolami existed (garajx-only era). Without this, those cars have serial=null → the
// MotorScene UI is hidden → motor looks "missing" even though motorEnabled=true.
//
// Mirrors acquireCar's motor block EXACTLY:
//   serial (atomic) · bornAt=now · lastAccrualAt=now (NO retroactive earnings) · free tank
//   · hiddenDefect (deterministic) · variant (deterministic jackpot roll)
// engineHp is PRESERVED (a worn car stays worn) — only set to 100 if somehow null.
//
// Usage (from packages/server):
//   dotenv -e ../../.env -- tsx src/scripts/backfillSerials.ts <memberId>   # one member (owner preview)
//   dotenv -e ../../.env -- tsx src/scripts/backfillSerials.ts --all        # every serial-less car (GO-LIVE)
//   dotenv -e ../../.env -- tsx src/scripts/backfillSerials.ts <memberId> --dry   # preview, no writes
import "../env";
import { prisma } from "../db";
import { hiddenDefectFor, variantFor } from "@t1067/shared";
import { getMotorEcon } from "../services/garajService";

async function nextSerial(): Promise<number> {
  const rows = await prisma.$queryRaw<{ value: string }[]>`
    INSERT INTO "AppState" ("key","value","updatedAt") VALUES ('mo:serial:next','1001', now())
    ON CONFLICT ("key") DO UPDATE SET value = (CAST("AppState"."value" AS INTEGER) + 1)::text, "updatedAt" = now()
    RETURNING "value"`;
  return parseInt(rows[0]!.value, 10);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const all = args.includes("--all");
  const memberIdArg = args.find((a) => /^\d+$/.test(a));
  if (!all && !memberIdArg) {
    console.error("Usage: backfillSerials <memberId> | --all  [--dry]");
    process.exit(2);
  }

  const where = all
    ? { soldAt: null, serial: null }
    : { soldAt: null, serial: null, memberId: Number(memberIdArg) };
  const cars = await prisma.garajCar.findMany({ where });
  console.log(`${dry ? "[DRY] " : ""}Found ${cars.length} serial-less active car(s)${all ? " (ALL members)" : ` for member ${memberIdArg}`}.\n`);
  if (cars.length === 0) { await prisma.$disconnect(); return; }

  const econ = await getMotorEcon();
  const tankHours = Math.max(1, Math.min(72, econ.fuelTankHours ?? 24));
  const defectPct = Math.max(0, Math.min(10, econ.hiddenDefectPct ?? 3)) / 100;
  const variantOverride: Record<string, number> = {
    qora_nexia: Math.max(2, Math.floor(econ.variantQoraNexiaOneIn ?? 100)),
    afsonaviy_tiko: Math.max(2, Math.floor(econ.variantAfsonaviyTikoOneIn ?? 2000)),
  };

  let done = 0;
  for (const c of cars) {
    const serial = dry ? 0 : await nextSerial();
    const defect = hiddenDefectFor(serial, defectPct);
    const variant = variantFor(c.carCode, serial, variantOverride);
    const now = new Date();
    const freeTankUntil = new Date(Date.now() + tankHours * 3_600_000);
    if (!dry) {
      await prisma.garajCar.update({
        where: { id: c.id },
        data: {
          serial,
          bornAt: c.bornAt ?? now,
          lastAccrualAt: now, // NO retroactive earnings — clock starts now
          engineHp: c.engineHp ?? 100, // preserve existing wear; default only if null
          ownerCount: c.ownerCount ?? 1,
          totalTrips: c.totalTrips ?? 0,
          fueledUntilAt: freeTankUntil, // free welcome tank (same as a fresh acquire)
          hiddenDefect: defect ? JSON.stringify(defect) : null,
          variant,
        },
      });
    }
    console.log(`  member=${c.memberId} ${c.carCode.padEnd(8)} → serial ${dry ? "(would assign)" : "#" + serial}${variant ? " 🎁" + variant : ""}${defect ? " 🕵defect" : ""}`);
    done++;
  }
  console.log(`\n${dry ? "[DRY] would backfill" : "✅ backfilled"} ${done} car(s).`);
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect().catch(() => {}); process.exit(1); });
