// Logs in to kas1067 and harvests candidate API endpoints from the SPA bundles.
// Run once real credentials are in .env:  pnpm kas:discover
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { env, repoRoot } from "../env";
import { KasLiveSource } from "../kas/client";

if (!env.KAS_USERNAME || !env.KAS_PASSWORD) {
  console.error("Set KAS_USERNAME and KAS_PASSWORD in .env first.");
  process.exit(1);
}

const client = new KasLiveSource({
  baseUrl: env.KAS_BASE_URL,
  username: env.KAS_USERNAME,
  password: env.KAS_PASSWORD,
});

console.log(`Logging in to ${env.KAS_BASE_URL} …`);
const { scripts, endpoints, assets } = await client.discover();

const outDir = resolve(repoRoot, "kas-discovery");
mkdirSync(outDir, { recursive: true });
for (const a of assets) {
  const name = a.url.replace(/[^a-zA-Z0-9.]+/g, "_").slice(-80) || "asset";
  writeFileSync(resolve(outDir, `${name}.txt`), a.body);
}
writeFileSync(resolve(outDir, "endpoints.json"), JSON.stringify({ scripts, endpoints }, null, 2));

console.log(`\n✅ Login OK. ${scripts.length} script bundle(s), ${endpoints.length} candidate endpoint(s):\n`);
for (const e of endpoints) console.log("  ", e);
console.log(`\nRaw bundles + endpoints.json saved to: ${outDir}`);
console.log("Pick the drivers/bonus endpoint, set KAS_DRIVERS_PATH in .env, then `pnpm db:seed`.");

process.exit(0);
