import type { SavedAddress } from "../kas/types";
import { chooseCatalog } from "@t1067/shared";
import { getDataSource } from "../kas";
import { prisma } from "../db";

// ─── The address catalog, kept across restarts ────────────────────────────────
//
// About 111 named places in Koson. They do not change hourly, and a customer
// typing an address depends on them: the bot resolves what they typed against
// the taxi core's search AND this catalog.
//
// On 2026-09-14 the catalog arrived EMPTY from the old dispatch (kas1067) after
// a restart, and for a window after each deploy every customer typing an
// address searched half a catalogue — silently, because an empty list is not an
// error. So the last good copy is written to the database, and read back when
// the live one comes up empty.
//
// The key changed with the switch to our own taxi core (2026-09-17): the old
// copy carries kas1067's place ids, and the core numbers the same places
// differently — a stale id would send a car to whichever place owns that number.

const KEY = "taxi:addressCatalog";

/** Per-process copy, so a busy minute of typing is not a hundred reads. */
let memo: SavedAddress[] = [];
let memoAt = 0;
let memoSig = "";
// Places are added by an operator a few times a month. Five minutes is fresh enough and keeps a
// keystroke — and the Mini App's name-for-a-pin lookup — from asking the core every time.
const MEMO_TTL_MS = 5 * 60_000;
const signature = (rows: SavedAddress[]): string => rows.map((r) => `${r.id}:${r.name}`).join("|");

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
export async function getAddressCatalog(opts: { fresh?: boolean } = {}): Promise<SavedAddress[]> {
  if (!opts.fresh && memo.length > 0 && Date.now() - memoAt < MEMO_TTL_MS) return memo;
  const live = await getDataSource()
    .getAllAddresses()
    .catch(() => [] as SavedAddress[]);

  if (live.length > 0) {
    // Only write when it actually changed (ids or names, not just the count).
    const sig = signature(live);
    if (sig !== memoSig) void persist(live);
    memo = live;
    memoSig = sig;
    memoAt = Date.now();
    return live;
  }

  const fromMemo = chooseCatalog(live, memo);
  if (fromMemo.rows.length > 0) return fromMemo.rows;

  const saved = await loadSaved();
  if (saved.length > 0) {
    memo = saved;
    console.warn(
      `[addresses] the taxi core gave 0 places — serving ${saved.length} from the last saved copy. ` +
      "Typed address search is working, but the catalogue is not being refreshed.",
    );
  }
  return saved;
}
