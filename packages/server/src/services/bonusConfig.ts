// 🎁 Owner-tunable acquisition bonuses (dashboard knobs) — same storage shape as Motor Olami /
// transfer economy: one AppState row "bonus:econ" holding a JSON blob, clamped on read AND write so
// a bad value can never land. Defaults fall back to the shipped code constants (BONUS_ECON_KNOBS).
// Consumers read getBonusEcon() at the point of use (low-frequency money paths) — no cache needed.
import { prisma } from "../db";
import { bonusEconDefaults, clampBonusEcon } from "@t1067/shared";

// 30s cache: knobs are now read on per-ride money paths (cashback roll, tier rebate, missions),
// so re-reading AppState every grant would add needless DB load. setBonusEcon invalidates.
let cache: { at: number; val: Record<string, number> } | null = null;

export async function getBonusEcon(): Promise<Record<string, number>> {
  if (cache && Date.now() - cache.at < 30_000) return cache.val;
  const defaults = bonusEconDefaults();
  const row = await prisma.appState.findUnique({ where: { key: "bonus:econ" } }).catch(() => null);
  const saved: Record<string, unknown> = (() => {
    if (!row) return {};
    try { return JSON.parse(row.value) as Record<string, unknown>; } catch { return {}; }
  })();
  const out: Record<string, number> = {};
  for (const k of Object.keys(defaults)) out[k] = clampBonusEcon(k, typeof saved[k] === "number" ? (saved[k] as number) : defaults[k]!);
  cache = { at: Date.now(), val: out };
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
  cache = null; // invalidate so the new value takes effect immediately
  return cur;
}
