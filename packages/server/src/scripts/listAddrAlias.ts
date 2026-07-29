// Ops: read-only — dump every currently-active address alias (owner review before/after adding
// more with setAddrAlias.ts). Run: tsx src/scripts/listAddrAlias.ts
import "../env";
import { listAddressAliases } from "../services/addressAlias";

async function main(): Promise<void> {
  const rows = await listAddressAliases();
  if (!rows.length) {
    console.log("(hech qanday alias yo'q)");
    process.exit(0);
  }
  for (const r of rows) console.log(`${r.alias.padEnd(20)} → ${r.canonicalName}`);
  console.log(`\njami: ${rows.length}`);
  process.exit(0);
}
main().catch((e) => { console.error("FATAL", e instanceof Error ? e.message : e); process.exit(1); });
