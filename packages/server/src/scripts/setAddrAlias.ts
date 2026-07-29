// Ops: teach the bot's address search a local slang / mispronunciation → real kas1067 catalog
// name mapping. See services/addressAlias.ts for why these are NEVER auto-guessed — only confirmed
// (a rider's own follow-up search, or a dispatcher call). The canonical name only needs to match a
// real catalog entry loosely (case/spacing-insensitive) — check the exact spelling first with
// listAddrAlias.ts or dumpMahallaCatalog.ts if unsure.
// Add:    tsx src/scripts/setAddrAlias.ts banisa "OBRON BALNITSA"
// Remove: tsx src/scripts/setAddrAlias.ts banisa --remove
import "../env";
import { getDataSource } from "../kas";
import { setAddressAlias, removeAddressAlias, listAddressAliases } from "../services/addressAlias";

async function main(): Promise<void> {
  const alias = process.argv[2];
  const rest = process.argv[3];
  if (!alias) {
    console.error("usage: setAddrAlias.ts <alias> <canonical-catalog-name>   OR   <alias> --remove");
    process.exit(1);
  }
  if (rest === "--remove") {
    await removeAddressAlias(alias);
    console.log(`removed alias "${alias}"`);
    process.exit(0);
  }
  if (!rest) {
    console.error("usage: setAddrAlias.ts <alias> <canonical-catalog-name>   OR   <alias> --remove");
    process.exit(1);
  }
  const catalog = await getDataSource().getAllAddresses().catch(() => []);
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const match = catalog.find((a) => norm(a.name) === norm(rest));
  if (!match) {
    console.error(`⚠️  "${rest}" hech qanday kas katalogi nomiga ANIQ mos kelmadi (${catalog.length} nom tekshirildi).`);
    console.error(`    Yaqin nomlar: ${catalog.map((a) => a.name).filter((n) => norm(n).includes(norm(rest).split(" ")[0] ?? "")).slice(0, 8).join(", ") || "(yo'q)"}`);
    console.error(`    Aniq yozuvni ko'rish uchun: tsx src/scripts/dumpMahallaCatalog.ts`);
    process.exit(1);
  }
  await setAddressAlias(alias, match.name);
  const all = await listAddressAliases();
  console.log(`✅ alias "${alias}" → "${match.name}" saqlandi. Jami aliaslar: ${all.length}`);
  process.exit(0);
}
main().catch((e) => { console.error("FATAL", e instanceof Error ? e.message : e); process.exit(1); });
