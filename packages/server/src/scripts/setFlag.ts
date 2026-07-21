// Ops: flip a kill-switch feature flag on/off in the LIVE app DB (takes effect within
// the 30s flag cache). Go-live: tsx src/scripts/setFlag.ts booking3 on
// Instant rollback: tsx src/scripts/setFlag.ts booking3 off
import "../env";
import { setFeature, featureOn, FEATURES, type FeatureName } from "../services/featureFlags";

const name = process.argv[2] as FeatureName;
const on = process.argv[3] === "on";

async function main(): Promise<void> {
  if (!FEATURES.includes(name) || (process.argv[3] !== "on" && process.argv[3] !== "off")) {
    console.error(`usage: setFlag <${FEATURES.join("|")}> <on|off>`);
    process.exit(1);
  }
  await setFeature(name, on);
  const now = await featureOn(name);
  // Flag-o'zgarish logi — jim toggle bo'lmasin (2026-07-17 welcomebonus saboqi).
  const { alertAdmins } = await import("../services/economyService");
  await alertAdmins(`⚙️ <b>Flag o'zgardi (setFlag.ts):</b> <code>${name}</code> → ${on ? "✅ ON" : "⛔ OFF"}`).catch(() => undefined);
  console.log(`feature:${name} set to ${on ? "ON" : "OFF"} → featureOn() now returns ${now}`);
  process.exit(now === on ? 0 : 1);
}
main().catch((e) => { console.error("FATAL", e instanceof Error ? e.message : e); process.exit(1); });
