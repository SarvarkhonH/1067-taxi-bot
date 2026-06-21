// Ops: tune a MOTOR OLAMI economy knob in the LIVE app DB (admin paneldagi kabi, terminaldan).
// Misol: tsx src/scripts/setEconomy.ts fuelMult 0.7   (yoqilg'i −30%, faollik portlaydi)
//        tsx src/scripts/setEconomy.ts speedMult 0.5  (daromad yarmiga — inflyatsiya tormozi)
// Ro'yxat: tsx src/scripts/setEconomy.ts            (joriy qiymatlar + chegaralar)
import "../env";
import { MOTOR_ECON_KNOBS } from "@t1067/shared";
import { getMotorEcon, setMotorEcon } from "../services/garajService";

async function main(): Promise<void> {
  const key = process.argv[2];
  const value = process.argv[3] !== undefined ? Number(process.argv[3]) : undefined;
  const cur = await getMotorEcon();
  if (!key) {
    console.log("MOTOR OLAMI iqtisod-dastaklari (joriy → chegara):");
    for (const k of MOTOR_ECON_KNOBS) console.log(`  ${k.key} = ${cur[k.key]}  [${k.min}..${k.max}, def ${k.def}] ${k.live ? "LIVE" : "(P2)"} — ${k.label}`);
    process.exit(0);
  }
  if (!MOTOR_ECON_KNOBS.some((k) => k.key === key) || value === undefined || isNaN(value)) {
    console.error(`usage: setEconomy <${MOTOR_ECON_KNOBS.map((k) => k.key).join("|")}> <number>`);
    process.exit(1);
  }
  const next = await setMotorEcon(key, value);
  console.log(`${key}: ${cur[key]} → ${next[key]} (clamp'langan). To'liq:`, next);
  process.exit(0);
}
main().catch((e) => { console.error("FATAL", e instanceof Error ? e.message : e); process.exit(1); });
