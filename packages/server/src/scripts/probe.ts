// Probe a kas1067 endpoint and print its JSON shape. Usage: pnpm kas:probe api/drivers
import "../env";
import { env } from "../env";
import { KasLiveSource } from "../kas/client";

const path = process.argv[2] ?? "api/drivers";

const client = new KasLiveSource({
  baseUrl: env.KAS_BASE_URL,
  username: env.KAS_USERNAME,
  password: env.KAS_PASSWORD,
});

const res = await client.getText(path);
console.log(`GET ${path} -> ${res.status}, ${res.body.length} bytes`);

let data: unknown;
try {
  data = JSON.parse(res.body);
} catch {
  console.log("Not JSON. First 400 chars:\n", res.body.slice(0, 400));
  process.exit(0);
}

const list = Array.isArray(data)
  ? data
  : (data as Record<string, unknown>)?.content ?? (data as Record<string, unknown>)?.data ?? null;

if (Array.isArray(list)) {
  console.log(`Array-like, ${list.length} items.`);
  if (list[0]) {
    console.log("\nKeys of [0]:\n", Object.keys(list[0] as object).join(", "));
    console.log("\nFirst item:\n", JSON.stringify(list[0], null, 2).slice(0, 1500));
  }
} else if (data && typeof data === "object") {
  console.log("\nTop-level keys:\n", Object.keys(data as object).join(", "));
  console.log("\nBody:\n", JSON.stringify(data, null, 2).slice(0, 1500));
} else {
  console.log("Value:", data);
}

process.exit(0);
