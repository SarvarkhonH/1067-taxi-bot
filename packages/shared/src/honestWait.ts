// 🚕 B qism P0-6 (flag `honesteta`): the wait a passenger is shown.
//
// With the flag: Koson's own measured range from now ("3–7"), or NOTHING — the straight-line guess
// ("~2", distance ÷ 24 km/h) is exactly what this replaces, so it is never a fallback. Without the
// flag: yesterday's "~N". Minutes only; a distance is never shown (owner decision Q3).

export function waitLabel(
  a: { etaMin: number | null; waitMin?: { lo: number; hi: number } | null } | null | undefined,
  honest: boolean,
): string | null {
  if (!a) return null;
  if (honest) return a.waitMin ? `${a.waitMin.lo}–${a.waitMin.hi}` : null;
  return a.etaMin ? `~${a.etaMin}` : null;
}
