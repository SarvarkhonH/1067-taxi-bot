// READ-ONLY single-session sweep of high-value kas1067 endpoints for CLIENT
// features. Logs in ONCE, probes sequentially with delays (avoids 429), prints
// response shapes. No writes. Usage: tsx kasSweep.ts
import "../env";
import { env } from "../env";
import { KasLiveSource } from "../kas/client";

const client = new KasLiveSource({ baseUrl: env.KAS_BASE_URL, username: env.KAS_USERNAME, password: env.KAS_PASSWORD });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const PATHS = [
  "api/clientTariffs",
  "api/clientAdditionalTariffs",
  "api/clientAppProperties",
  "api/bonusProperties",
  "api/ratingProperties",
  "api/carModels",
  "api/companyInformation",
  "api/bookingProperties",
  "api/bookingAdditionalRequirements",
  "api/bookings/additionalParameters",
  "api/cityBorders",
  "api/onlineDriverMapProperties",
  "api/bookingReports/byFilter?searchText=&page=0&size=3&sort=id",
];

function summarize(body: string): string {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return `NON-JSON (${body.length}b): ${body.slice(0, 90).replace(/\s+/g, " ")}`;
  }
  if (Array.isArray(data)) {
    const k = data[0] && typeof data[0] === "object" ? Object.keys(data[0] as object).join(",") : "";
    return `array[${data.length}]${k ? ` keys: ${k}` : ""}`;
  }
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    const listKey = Object.keys(o).find((k) => Array.isArray(o[k]));
    let s = `object keys: ${Object.keys(o).join(",")}`;
    if (listKey) {
      const arr = o[listKey] as unknown[];
      const ik = arr[0] && typeof arr[0] === "object" ? Object.keys(arr[0] as object).join(",") : "";
      s += `\n      ${listKey}[${arr.length}]${ik ? ` item keys: ${ik}` : ""}`;
    }
    return s;
  }
  return `value: ${JSON.stringify(data)}`;
}

console.log("=== kas1067 CLIENT-feature endpoint sweep ===\n");
for (const p of PATHS) {
  try {
    const res = await client.getText(p);
    console.log(`[${res.status}] ${p}\n      ${summarize(res.body)}\n`);
  } catch (e) {
    console.log(`[ERR] ${p} — ${e instanceof Error ? e.message : e}\n`);
  }
  await sleep(900);
}

// Read-only: just confirm the test client's current bonus is readable.
const phone = "+998973165311";
const bonus = (await client.fetchByPhone(phone)).find((m) => m.type === "client")?.points ?? null;
console.log(`=== read-only bonus check ===\nclient ${phone} bonus now: ${bonus}`);
process.exit(0);
