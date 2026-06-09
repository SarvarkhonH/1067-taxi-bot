// Display helpers shared across the bot and the web apps.

/** 12345.6 -> "12 346" (space-grouped, rounded). */
export function formatNumber(n: number): string {
  const neg = n < 0;
  const r = Math.round(Math.abs(n))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return (neg ? "-" : "") + r;
}

export const formatMoney = formatNumber;

/** Text progress bar, e.g. progressBar(0.4) -> "🟩🟩🟩🟩⬜⬜⬜⬜⬜⬜". */
export function progressBar(p: number, width = 10, filled = "🟩", empty = "⬜"): string {
  const c = Math.max(0, Math.min(1, Number.isFinite(p) ? p : 0));
  const f = Math.round(c * width);
  return filled.repeat(f) + empty.repeat(Math.max(0, width - f));
}

/** Medal for the first three places, otherwise "#N". */
export function rankMedal(rank: number): string {
  return rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`;
}
