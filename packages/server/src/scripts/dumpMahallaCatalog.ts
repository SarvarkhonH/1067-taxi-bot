// READ-ONLY. Pulls the kas1067 company address catalog (GET api/addresses/, ~111 named
// places with lat/lng — same list the official rider app snaps pins to) and dumps it as
// plain text for the owner to review/confirm which entries are real mahalla names before
// we seed the Mahalla table. No writes, no PII (these are company place names, not client data).
// Run: dotenv -e ../../.env -- tsx src/scripts/dumpMahallaCatalog.ts
import "../env";
import { env } from "../env";
import { KasLiveSource } from "../kas/client";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

async function main(): Promise<void> {
  const kas = new KasLiveSource({ baseUrl: env.KAS_BASE_URL, username: env.KAS_USERNAME, password: env.KAS_PASSWORD });
  await kas.login();
  const rows = await kas.getAllAddresses();
  const sorted = [...rows].sort((a, b) => a.name.localeCompare(b.name, "uz"));

  const lines = sorted.map((r) => `${r.id}\t${r.name}\t${r.lat ?? ""}\t${r.lng ?? ""}`);
  const out = ["id\tname\tlat\tlng", ...lines].join("\n");
  const file = resolve(process.cwd(), "../../mahalla_candidates.txt");
  writeFileSync(file, out, "utf8");
  console.error("WROTE", file, "rows:", sorted.length);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
