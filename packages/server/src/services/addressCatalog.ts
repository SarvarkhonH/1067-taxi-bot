import type { SavedAddress } from "../kas/types";
import { chooseCatalog } from "@t1067/shared";
import { getDataSource } from "../kas";
import { prisma } from "../db";

// ─── The address catalog, kept across restarts ────────────────────────────────
//
// About 111 named places in Koson. They do not change hourly, and a customer
// typing an address depends on them: the bot resolves what they typed against
// kas's narrow by-name list AND this catalog, because — in the words of the
// code that added it — the narrow list "MISSES many real places".
//
// Shadow mode caught the catalog arriving EMPTY on 2026-09-14, and chasing it
// found the real cause: kas1067 rate-limits our login (429), so after a restart
// the client cannot fetch and its in-memory cache is cold. The bot restarts on
// every deploy. So for some window after each one, every customer typing an
// address was searching half a catalogue — silently, because an empty list is
// not an error.
//
// The fix is not to retry harder. It is to stop a list of a hundred and eleven
// street names from depending on a login at all: the last good copy is written
// to the database, and read back when the live one comes up empty.

const KEY = "kas:addressCatalog";

/** Per-process copy, so a busy minute of typing is not a hundred DB reads. */
let memo: SavedAddress[] = [];

async function persist(rows: SavedAddress[]): Promise<void> {
  await prisma.appState
    .upsert({
      where: { key: KEY },
      create: { key: KEY, value: JSON.stringify(rows) },
      update: { value: JSON.stringify(rows) },
    })
    .catch(() => undefined); // a catalogue that cannot be saved is still usable now
}

async function loadSaved(): Promise<SavedAddress[]> {
  const row = await prisma.appState.findUnique({ where: { key: KEY } }).catch(() => null);
  if (!row?.value) return [];
  try {
    const parsed: unknown = JSON.parse(row.value);
    return Array.isArray(parsed) ? (parsed as SavedAddress[]) : [];
  } catch {
    return [];
  }
}

/**
 * The catalog, by whatever route can still produce one.
 *
 * Live first — it is the only one that can contain a place added today. Empty
 * loses to non-empty at every step (see chooseCatalog), because the whole
 * failure this exists for is an empty answer winning.
 */
export async function getAddressCatalog(): Promise<SavedAddress[]> {
  const live = await getDataSource()
    .getAllAddresses()
    .catch(() => [] as SavedAddress[]);

  if (live.length > 0) {
    // Only write when it actually changed — this is asked on every keystroke
    // that completes an address, and a hundred and eleven names do not need
    // rewriting all day.
    if (live.length !== memo.length) void persist(live);
    memo = live;
    return live;
  }

  const fromMemo = chooseCatalog(live, memo);
  if (fromMemo.rows.length > 0) return fromMemo.rows;

  const saved = await loadSaved();
  if (saved.length > 0) {
    memo = saved;
    console.warn(
      `[addresses] kas gave 0 places — serving ${saved.length} from the last saved copy. ` +
      "Typed address search is working, but the catalogue is not being refreshed.",
    );
  }
  return saved;
}
