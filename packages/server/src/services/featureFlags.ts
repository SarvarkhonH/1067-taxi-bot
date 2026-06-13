// 🔌 Kill-switch flags: every risky mechanic can be turned OFF without a
// deploy via AppState "feature:<name>" = "off". Default is ON. 30s cache so
// the sweep doesn't hammer the DB.
import { prisma } from "../db";

export const FEATURES = ["wheel", "garage", "items", "transfers", "push", "gap", "plus", "recruit", "booking3"] as const;
export type FeatureName = (typeof FEATURES)[number];

let cache: { at: number; map: Record<string, boolean> } = { at: 0, map: {} };

export async function featureOn(name: FeatureName): Promise<boolean> {
  if (Date.now() - cache.at > 30_000) {
    const rows = await prisma.appState.findMany({ where: { key: { startsWith: "feature:" } } }).catch(() => []);
    const map: Record<string, boolean> = {};
    for (const r of rows) map[r.key.slice(8)] = r.value !== "off";
    cache = { at: Date.now(), map };
  }
  return cache.map[name] !== false;
}

export async function setFeature(name: FeatureName, on: boolean): Promise<void> {
  await prisma.appState.upsert({
    where: { key: `feature:${name}` },
    update: { value: on ? "on" : "off" },
    create: { key: `feature:${name}`, value: on ? "on" : "off" },
  });
  cache = { at: 0, map: {} };
}

export async function listFeatures(): Promise<{ name: string; on: boolean }[]> {
  const rows = await prisma.appState.findMany({ where: { key: { startsWith: "feature:" } } }).catch(() => []);
  const map = new Map(rows.map((r) => [r.key.slice(8), r.value !== "off"]));
  return FEATURES.map((f) => ({ name: f, on: map.get(f) !== false }));
}

/** 🏆 Mashina FONDI: 100 so'm per completed ride, prefunded, separate from
 *  the withdraw budget. Incremented per finished ride from the sweep. */
export async function fundAddRide(bookingId: number): Promise<void> {
  try {
    await prisma.appState.create({ data: { key: `fundride:${bookingId}`, value: "1" } });
  } catch {
    return; // already counted for this ride
  }
  const row = await prisma.appState.findUnique({ where: { key: "mashina_fund" } });
  if (!row) {
    await prisma.appState.create({ data: { key: "mashina_fund", value: "100" } }).catch(() => null);
  } else {
    const cur = parseInt(row.value, 10) || 0;
    await prisma.appState.update({ where: { key: "mashina_fund" }, data: { value: String(cur + 100) } }).catch(() => null);
  }
}

export async function fundTotal(): Promise<number> {
  const row = await prisma.appState.findUnique({ where: { key: "mashina_fund" } });
  return row ? parseInt(row.value, 10) || 0 : 0;
}
