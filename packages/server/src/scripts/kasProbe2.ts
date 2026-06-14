// READ-ONLY: is the assigned driver's live position reachable via REST (for E5 tracking)?
import "../env";
import { env } from "../env";
import { KasLiveSource } from "../kas/client";

const kas = new KasLiveSource({ baseUrl: env.KAS_BASE_URL, username: env.KAS_USERNAME, password: env.KAS_PASSWORD });

async function main(): Promise<void> {
  await kas.login();

  // pull the current live queue to get a real, actively-working car number
  let cars: string[] = [];
  try {
    const bk = JSON.parse((await kas.getText("api/bookings")).body) as Record<string, unknown>[];
    cars = [...new Set(bk.map((b) => String(b.carNumber ?? "")).filter(Boolean))];
  } catch { /* ignore */ }
  console.log("active cars in queue:", JSON.stringify(cars));

  console.log("\n=== byCarNumber live position (does REST expose assigned-driver GPS?) ===");
  for (const car of cars.slice(0, 4)) {
    try {
      const d = await kas.getJson(`api/drivers/byCarNumber/${encodeURIComponent(car)}`);
      console.log(`${car} | lat=${d.latitude} lng=${d.longitude} bearing=${d.bearing} speed=${d.speed} taxiDist=${d.taximeterDistance} taxiPay=${d.taximeterPayment}`);
    } catch (e) {
      console.log(`${car} ERR ${(e instanceof Error ? e.message : "").slice(0, 60)}`);
    }
  }

  console.log("\n=== api/onlineDriverMapProperties ===");
  try {
    const r = await kas.getText("api/onlineDriverMapProperties");
    console.log(r.status, r.body.slice(0, 240).replace(/\s+/g, " "));
  } catch { console.log("ERR"); }

  console.log("\n=== map data source: REST vs WebSocket (main.js) ===");
  try {
    const m = await kas.getText("js/main/main.js", "*/*");
    console.log("main.js bytes:", m.body.length, "| ws/stomp/sockjs present:", /stomp|sockjs|new WebSocket|wss?:\/\//i.test(m.body));
    // find what the driverMap controller polls
    const i = m.body.search(/driverMap/i);
    if (i >= 0) console.log("driverMap region:", m.body.slice(i, i + 300).replace(/\s+/g, " "));
  } catch { console.log("main.js ERR"); }
}

main().then(() => process.exit(0)).catch((e) => { console.error("FATAL", e instanceof Error ? e.message : e); process.exit(1); });
