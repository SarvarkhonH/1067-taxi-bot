// Inspect the high-bonus end of the client list to see if client bonuses are used.
import "../env";
import { env } from "../env";
import { KasLiveSource } from "../kas/client";

const c = new KasLiveSource({ baseUrl: env.KAS_BASE_URL, username: env.KAS_USERNAME, password: env.KAS_PASSWORD });
const size = 100;

// sort=bonus is ascending, so the last pages hold the biggest bonuses
let nonZero = 0;
let max = 0;
const samples: { id: unknown; bonus: number; trips: unknown }[] = [];
for (const page of [102, 101, 100]) {
  const data = await c.getJson(`api/clients/byFilter?searchText=&sort=bonus&page=${page}&size=${size}`);
  const list = (data.clientDtoList as Record<string, unknown>[]) ?? [];
  for (const x of list) {
    const b = Number(x.bonus) || 0;
    if (b > 0) {
      nonZero++;
      max = Math.max(max, b);
      if (samples.length < 10) samples.push({ id: x.id, bonus: b, trips: x.bookingCount });
    }
  }
}
console.log(`Clients with bonus>0 in last 3 pages (~300 highest): ${nonZero}, max bonus = ${max}`);
console.log("Samples:", JSON.stringify(samples, null, 2));
process.exit(0);
