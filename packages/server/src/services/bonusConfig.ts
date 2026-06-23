// 🎁 Owner-tunable acquisition bonuses (dashboard knobs) — same storage shape as Motor Olami /
// transfer economy: one AppState row "bonus:econ" holding a JSON blob, clamped on read AND write so
// a bad value can never land. Defaults fall back to the shipped code constants (BONUS_ECON_KNOBS).
// Consumers read getBonusEcon() at the point of use (low-frequency money paths) — no cache needed.
import { prisma } from "../db";
import { bonusEconDefaults, clampBonusEcon } from "@t1067/shared";

export async function getBonusEcon(): Promise<Record<string, number>> {
  const defaults = bonusEconDefaults();
  const row = await prisma.appState.findUnique({ where: { key: "bonus:econ" } }).catch(() => null);
  if (!row) return defaults;
  let saved: Record<string, unknown> = {};
  try {
    saved = JSON.parse(row.value) as Record<string, unknown>;
  } catch {
    saved = {};
  }
  const out: Record<string, number> = {};
  for (const k of Object.keys(defaults)) out[k] = clampBonusEcon(k, typeof saved[k] === "number" ? (saved[k] as number) : defaults[k]!);
  return out;
}

/** Admin: set one knob (clamped + persisted), returns the full config. */
export async function setBonusEcon(key: string, value: number): Promise<Record<string, number>> {
  const cur = await getBonusEcon();
  if (key in cur) cur[key] = clampBonusEcon(key, value);
  await prisma.appState.upsert({
    where: { key: "bonus:econ" },
    create: { key: "bonus:econ", value: JSON.stringify(cur) },
    update: { value: JSON.stringify(cur) },
  });
  return cur;
}
