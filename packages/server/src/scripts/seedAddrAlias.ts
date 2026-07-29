// Ops: seed the address aliases that are ALREADY CONFIRMED (not guessed — see
// services/addressAlias.ts). Safe to re-run (idempotent upsert). Add a new row here only after
// confirming it the same way: a rider's own follow-up search resolving to that catalog entry, or a
// dispatcher/owner call. Run: tsx src/scripts/seedAddrAlias.ts
import "../env";
import { getDataSource } from "../kas";
import { setAddressAlias } from "../services/addressAlias";

// alias (as typed by a rider, bare form — suffixes like "-ga" are tried automatically at lookup
// time) → exact kas catalog name.
const CONFIRMED: { alias: string; canonicalName: string }[] = [
  // 2026-07-29: member 7067 typed "Banisaga" twice (both "topilmadi"), then "Obron banisaga" —
  // which resolved and she picked OBRON BALNITSA. Same rider, same session, unambiguous.
  { alias: "banisa", canonicalName: "OBRON BALNITSA" },
];

async function main(): Promise<void> {
  const catalog = await getDataSource().getAllAddresses().catch(() => []);
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  let ok = 0;
  for (const { alias, canonicalName } of CONFIRMED) {
    const match = catalog.find((a) => norm(a.name) === norm(canonicalName));
    if (!match) {
      console.error(`⚠️  skip "${alias}" → "${canonicalName}": kas katalogida bunday nom yo'q (catalog o'zgargan bo'lishi mumkin)`);
      continue;
    }
    await setAddressAlias(alias, match.name);
    console.log(`✅ ${alias} → ${match.name}`);
    ok++;
  }
  console.log(`\n${ok}/${CONFIRMED.length} alias saqlandi.`);
  process.exit(ok === CONFIRMED.length ? 0 : 1);
}
main().catch((e) => { console.error("FATAL", e instanceof Error ? e.message : e); process.exit(1); });
