// Verify the M7 reverse-snap against the LIVE kas catalog: a point on a known address resolves to
// that name (~0 km), a point a few hundred metres off gets the "… yaqini" label.
// Run: npx tsx src/scripts/testNearest.ts
import { nearestCatalogAddress, pinLabel } from "../services/bookingService";
import { getDataSource } from "../kas";

async function main() {
  const cat = await getDataSource().getAllAddresses();
  console.log(`catalog size: ${cat.length}`);
  const sample = cat.find((a) => a.lat && a.lng);
  if (!sample) { console.log("no geo addresses — abort"); return; }

  // 1) exactly on a known address
  const onIt = await nearestCatalogAddress(sample.lat!, sample.lng!);
  console.log(`\nON "${sample.name}" (${sample.lat},${sample.lng})`);
  console.log(`  → nearest: ${onIt?.addr.name} | ${(onIt!.km * 1000).toFixed(0)} m`);
  console.log(`  → label:   ${await pinLabel(sample.lat!, sample.lng!)}`);

  // 2) ~300 m north of it
  const offLat = sample.lat! + 0.0027;
  const off = await nearestCatalogAddress(offLat, sample.lng!);
  console.log(`\n~300m off "${sample.name}"`);
  console.log(`  → nearest: ${off?.addr.name} | ${(off!.km * 1000).toFixed(0)} m`);
  console.log(`  → label:   ${await pinLabel(offLat, sample.lng!)}`);

  // 3) Koson centre
  console.log(`\nKoson centre (39.0458, 65.58)`);
  console.log(`  → label:   ${await pinLabel(39.0458, 65.58)}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
