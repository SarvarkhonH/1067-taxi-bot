// Extend kas1067's own system-rental license end date by N days.
// Bases the extension on the CURRENT stored end date (so "add N days" is exact regardless of when
// you run it) — unless that date is already in the past, in which case it bases off today instead
// (so a lapsed rental never gets "extended" to another past date).
// Usage: npx tsx src/scripts/renewSystemRental.ts <days>
import "../env";
import { env } from "../env";
import { KasLiveSource } from "../kas/client";

const days = Number(process.argv[2]);
if (!Number.isFinite(days) || days <= 0) {
  console.log("usage: npx tsx src/scripts/renewSystemRental.ts <days>");
  process.exit(1);
}

const DAY_MS = 24 * 3600 * 1000;
const client = new KasLiveSource({ baseUrl: env.KAS_BASE_URL, username: env.KAS_USERNAME, password: env.KAS_PASSWORD });

const current = await client.getJson("api/companyInformation");
const currentEnd = new Date(String(current.systemRentalEndDate ?? ""));
const base = Number.isFinite(currentEnd.getTime()) && currentEnd.getTime() > Date.now() ? currentEnd.getTime() : Date.now();
const newDate = new Date(base + days * DAY_MS).toISOString().replace("Z", "+0000");

console.log(`current systemRentalEndDate: ${current.systemRentalEndDate}`);
console.log(`setting systemRentalEndDate -> ${newDate} (+${days} kun) …`);
const result = await client.setSystemRentalEndDate(newDate);
console.log("result:", JSON.stringify(result));

process.exit(result.ok ? 0 : 1);
