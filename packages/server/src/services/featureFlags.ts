// 🔌 Kill-switch flags: every risky mechanic can be turned OFF without a deploy
// via AppState "feature:<name>" = "off". Default is ON — EXCEPT DEFAULT_OFF flags,
// which stay OFF until an explicit "on" row exists (a not-yet-owner-accepted feature
// must NOT go live just because its kill-switch row is missing). 30s cache.
import { prisma } from "../db";

export const FEATURES = [
  "wheel", "garage", "items", "transfers", "push", "gap", "plus", "recruit", "booking3",
  // v3 tracks — each ships dark behind its flag until owner QABUL:
  "livinghome", // V1 living AI home screen
  "aibrain", // V2 AI concierge (proactive + conversational)
  "mahalla", // V5 mahalla-scoped leaderboard
  "tolqin", // V4 Yashil to'lqin skill game
  // GARAJ v2 — deep car-restoration game (replaces old idle garage), ships dark:
  "garajx", // master flag for the new full-screen GARAJ game
  "kozacha", // 🪙 Garaj ride→tanga faucet (real-ride only; ONE currency now)
  "baraban", // 🎰 post-ride spin wheel (5-min token on ride finish → one spin, real tanga; ships dark)
  "motorolami", // 🌍 MOTOR OLAMI v3 — unique #serial cars that earn (speed→tanga), ships dark
  "komissiya", // 💸 platform commission on transfers/tips/fares (configurable %); OFF until owner QABUL
  "promo", // 🎁 admin-configurable promo campaigns ("tasks with promises") + completion pushes; OFF until owner QABUL
  "qarz", // 💸 Bosqich 3: driver pays kas company debt with tanga (real kas write); OFF until owner pilot
  "welcomebonus", // 🎁 universal first-ride bonus (REFEREE_REWARD=5000 tanga) for riders who did NOT arrive via referral/recruit — every new bot user gets exactly one; OFF until owner pilot
  "refstaged", // 👥 STAGED referral payout: inviter earns in 3 steps (friend START → +refStart, friend links number → +refShare, friend 1st ride → +refRide); friend gets 5000 on JOIN like everyone. OFF = legacy (all on first ride). DARK until owner QABUL
  "drvstaged", // 🚖 STAGED driver-QR payout: driver earns drvStart (client START) + drvShare (client links number) + revshareFresh/ride for revshareMonths; recruited client gets 5000 on JOIN. OFF = legacy (500 ride1 + 1000 ride3 + 6mo revshare, client 5000 on 1st ride). DARK until owner QABUL
  "drvrecruit", // 🚖 driver→driver recruit: a driver brings a new DRIVER; when that driver completes 10 rides the recruiter earns 5000; OFF until owner pilot
  "drvpush", // 🔔 driver engagement pushes (ishga chiqing / demand-spike / EOD work summary); read-only, OFF until owner QABUL
] as const;
export type FeatureName = (typeof FEATURES)[number];

// Off until explicitly enabled (go-live flip = setFeature(name, true) after owner QABUL).
// booking3 = the new map/trip flow; owner still gets a preview via server.ts owner-branch,
// but real users stay on the (fixed) classic flow until it's accepted. A missing row → OFF.
const DEFAULT_OFF = new Set<FeatureName>(["booking3", "livinghome", "aibrain", "mahalla", "tolqin", "garajx", "kozacha", "baraban", "motorolami", "komissiya", "qarz", "welcomebonus", "refstaged", "drvstaged", "drvrecruit", "drvpush", "promo"]);

let cache: { at: number; map: Record<string, boolean> } = { at: 0, map: {} };

export async function featureOn(name: FeatureName): Promise<boolean> {
  if (Date.now() - cache.at > 30_000) {
    const rows = await prisma.appState.findMany({ where: { key: { startsWith: "feature:" } } }).catch(() => []);
    const map: Record<string, boolean> = {};
    for (const r of rows) map[r.key.slice(8)] = r.value !== "off";
    cache = { at: Date.now(), map };
  }
  if (DEFAULT_OFF.has(name)) return cache.map[name] === true; // OFF unless an explicit "on" row
  return cache.map[name] !== false;
}

/** TEST-ONLY: force the next featureOn() to re-read the DB (bypass the 30s cache). */
export function __resetFeatureCache(): void {
  cache = { at: 0, map: {} };
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
  return FEATURES.map((f) => ({ name: f, on: DEFAULT_OFF.has(f) ? map.get(f) === true : map.get(f) !== false }));
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
