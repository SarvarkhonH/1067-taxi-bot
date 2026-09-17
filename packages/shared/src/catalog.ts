// ─── An empty answer is not an answer ─────────────────────────────────────────
//
// Found on 2026-09-14: the old dispatch answered its address list with ZERO
// places, fourteen times out of fourteen, while our own taxi core answered with
// 112. Nothing threw, so the bot handed every customer typing an address an
// empty catalog — and the catalog is half of how a typed address is resolved.
//
// The cache holding a good copy was sitting right there, unused, because the
// code only consulted it when the request THREW. An answer of zero from a
// source that has always had about a hundred and eleven places is not news
// about the town. The rule outlived that dispatch: any source can answer empty.

/**
 * Which catalog to serve: the one just fetched, or the one we already had.
 *
 * Empty loses to non-empty, always. This is deliberately not "newest wins" —
 * the whole failure is that the newest was empty and won.
 */
export function chooseCatalog<T>(fresh: T[], cached: T[] | undefined): { rows: T[]; servedStale: boolean } {
  if (fresh.length > 0) return { rows: fresh, servedStale: false };
  const stale = cached ?? [];
  return { rows: stale, servedStale: stale.length > 0 };
}
