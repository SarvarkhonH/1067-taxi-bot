/**
 * Pull FRESH kas1067 data for the taxi core (B).
 *
 * B was seeded from a snapshot taken 2026-04-10 (`scripts/kas1067/data/*.json`).
 * kas1067 keeps changing: new drivers sign up, plates and phones change, places
 * get added. Importing the stale file leaves B with a roster and a catalogue
 * that quietly drift from reality — and in this business a wrong plate or a
 * missing place is a lost order.
 *
 * This reuses A's authenticated KasLiveSource rather than re-implementing the
 * login/pagination dance, so it is the same code path the live bot trusts.
 *
 * Run on the VPS (A's env carries the credentials):
 *   cd /opt/app && pnpm --filter @t1067/server exec dotenv -e ../../.env -- \
 *     tsx src/scripts/exportKasForTaxi.ts /opt/1067-taxi/scripts/kas1067/data
 *
 * Writes: drivers.live.json, addresses.live.json (+ a short summary to stdout).
 * Read-only against kas1067 — it never writes back.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getDataSource } from "../kas";
import { env } from "../env";

async function main() {
  const outDir = process.argv[2] ?? "./kas-export";
  mkdirSync(outDir, { recursive: true });

  if (env.KAS_MODE !== "live") {
    throw new Error(
      `KAS_MODE is "${env.KAS_MODE}" — this script must read the real kas1067. ` +
      `Run it where KAS_MODE=live.`,
    );
  }

  const kas = getDataSource();
  console.log(`[export] source=${kas.name} base=${env.KAS_BASE_URL}`);

  // ── Drivers ────────────────────────────────────────────────────────────────
  console.log("[export] fetching driver roster …");
  const roster = await kas.listDriverRoster();
  console.log(`[export] drivers: ${roster.length}`);

  const active   = roster.filter(d => d.active).length;
  const withRide = roster.filter(d => (d.trips ?? 0) > 0).length;
  const recent   = roster.filter(d => {
    if (!d.lastRideAt) return false;
    const t = Date.parse(d.lastRideAt);
    return Number.isFinite(t) && Date.now() - t < 30 * 86_400_000;
  }).length;

  // Shape it like the 2026-04 snapshot so the existing importer reads it
  // unchanged — the importer is idempotent on externalId.
  const driversOut = roster.map(d => ({
    id:                  d.kasId,
    fullName:            d.fullName,
    phoneNumber:         d.phone,
    carNumber:           d.carNumber,
    carModel:            d.carModel,
    active:              d.active,
    takeBookingCount:    d.trips,
    cancelBookingCount:  d.cancels,
    bookingRating:       d.rating,
    lastTakeBookingDate: d.lastRideAt,
    licenseSerialNumber: d.licenseTerm,
    address:             d.address,
    balance:             d.balance,
    debt:                d.debt,
  }));
  writeFileSync(join(outDir, "drivers.live.json"), JSON.stringify(driversOut, null, 2), "utf8");

  // ── Addresses ──────────────────────────────────────────────────────────────
  console.log("[export] fetching address catalogue …");
  const addresses = await kas.getAllAddresses();
  console.log(`[export] addresses: ${addresses.length}`);

  const addressesOut = addresses.map(a => ({
    id:                a.id,
    name:              a.name,
    latitude:          a.lat ?? null,
    longitude:         a.lng ?? null,
    additionalPayment: a.surcharge ?? 0,
    audio:             "-",
    bookingCount:      0,
  }));
  writeFileSync(join(outDir, "addresses.live.json"), JSON.stringify(addressesOut, null, 2), "utf8");

  console.log("");
  console.log("──────── kas1067 (JONLI) ────────");
  console.log(`  haydovchilar:      ${roster.length}`);
  console.log(`    faol:            ${active}`);
  console.log(`    safar qilgan:    ${withRide}`);
  console.log(`    30 kunda haydagan: ${recent}`);
  console.log(`  manzillar:         ${addresses.length}`);
  console.log(`  → ${outDir}`);
}

main().catch((e) => {
  console.error("[export] FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
