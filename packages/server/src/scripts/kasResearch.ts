// READ-ONLY kas1067 deep research: find (1) the live driver-position endpoint behind
// #/driverMap, (2) the real booking-status lifecycle behind #/bookingList, (3) the per-km tariff.
// No writes (no createBooking/cancel/bonus). Run: dotenv -e ../../.env -- tsx src/scripts/kasResearch.ts
import "../env";
import { env } from "../env";
import { KasLiveSource } from "../kas/client";

const kas = new KasLiveSource({ baseUrl: env.KAS_BASE_URL, username: env.KAS_USERNAME, password: env.KAS_PASSWORD });

async function main(): Promise<void> {
  console.log("=== LOGIN ===");
  await kas.login();
  console.log("ok\n");

  console.log("=== DISCOVER: endpoints matching driver/map/online/location/coord/booking ===");
  const { endpoints, assets } = await kas.discover();
  const rel = endpoints.filter((e) => /driver|map|online|location|coord|booking|active|track/i.test(e));
  console.log(rel.join("\n") || "(none matched)");

  console.log("\n=== ASSET grep: driverMap / online / location / latitude call-sites ===");
  for (const a of assets) {
    const hits = [...a.body.matchAll(/.{0,46}(driverMap|driversOnMap|onlineDriver|driverLocation|\/map['"`/]|getDrivers?Online|liveDriver).{0,60}/gi)].map((m) => m[0].replace(/\s+/g, " "));
    if (hits.length) {
      console.log("-- " + a.url);
      console.log([...new Set(hits)].slice(0, 8).join("\n"));
    }
  }

  console.log("\n=== ASSET grep: booking status constants/labels ===");
  for (const a of assets) {
    const hits = [...a.body.matchAll(/.{0,20}(in_place|take_back|cancel_by_\w+|delivered|accepted|on_the_way|arrived|waiting|notif\w*|searching|assigned|NEW|TAKE)\b.{0,30}/g)].map((m) => m[0].replace(/\s+/g, " "));
    if (hits.length) {
      console.log("-- " + a.url);
      console.log([...new Set(hits)].slice(0, 12).join("\n"));
    }
  }

  console.log("\n=== drivers/byFilter: how many carry nonzero coords + which fields exist ===");
  const drv = await kas.getJson("api/drivers/byFilter?searchText=&sort=id&page=0&size=200&date=01.01.2015");
  const list = (drv.driverDtoList as Record<string, unknown>[]) ?? [];
  const withC = list.filter((d) => Number(d.latitude) !== 0 && Number(d.longitude) !== 0);
  console.log(`drivers returned: ${list.length} · with nonzero lat/lng: ${withC.length} · onlineDriversCount field: ${drv.onlineDriversCount ?? drv.activeDriversCount ?? "?"}`);
  if (list[0]) console.log("driver dto keys:", Object.keys(list[0]).join(", "));
  if (withC[0]) console.log("sample WITH coords:", JSON.stringify({ id: withC[0].id, lat: withC[0].latitude, lng: withC[0].longitude, bearing: withC[0].bearing, busy: withC[0].taximeterPayment, online: withC[0].online, status: withC[0].status }));

  console.log("\n=== candidate live-position endpoints (read-only probe) ===");
  const cands = [
    "api/drivers/onMap", "api/drivers/online", "api/drivers/map", "api/drivers/locations",
    "api/driverLocations", "api/map/drivers", "api/onlineDrivers", "api/drivers/active",
    "api/drivers/coordinates", "api/driversOnMap", "api/drivers/forMap", "api/map", "api/drivers/positions",
  ];
  for (const c of cands) {
    try {
      const r = await kas.getText(c);
      const body = r.body.slice(0, 90).replace(/\s+/g, " ");
      const looksJson = r.body.trim().startsWith("[") || r.body.trim().startsWith("{");
      console.log(`${c} -> ${r.status}${looksJson ? " JSON" : ""}: ${body}`);
    } catch {
      console.log(`${c} -> ERR`);
    }
  }

  console.log("\n=== api/bookings (LIVE queue) — statuses + dto shape ===");
  try {
    const bk = JSON.parse((await kas.getText("api/bookings")).body);
    if (Array.isArray(bk)) {
      const statuses = [...new Set(bk.map((b: Record<string, unknown>) => b.status))];
      console.log(`live bookings: ${bk.length} · distinct statuses: ${JSON.stringify(statuses)}`);
      if (bk[0]) console.log("booking dto keys:", Object.keys(bk[0]).join(", "));
      if (bk[0]) console.log("sample:", JSON.stringify(bk[0]).slice(0, 500));
    } else {
      console.log("api/bookings not an array:", JSON.stringify(bk).slice(0, 120));
    }
  } catch (e) {
    console.log("api/bookings err:", e instanceof Error ? e.message : e);
  }

  console.log("\n=== bookingReports recent statuses (lifecycle history) ===");
  try {
    const d = await kas.getJson("api/bookingReports?searchText=&sort=id&page=0&size=40");
    const list2 = (d.bookingReportDtoList as Record<string, unknown>[]) ?? [];
    console.log("report statuses:", JSON.stringify([...new Set(list2.map((b) => b.status))]));
  } catch (e) {
    console.log("reports err:", e instanceof Error ? e.message : e);
  }

  console.log("\n=== TARIFF (real per-km rate for honest pricing) ===");
  const t = await kas.getTariff();
  console.log(JSON.stringify(t, null, 0));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
