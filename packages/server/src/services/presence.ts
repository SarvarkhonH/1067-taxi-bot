// 🟢 Presence — the ONLY writer of TelegramUser.lastSeenAt.
// Wired as a global bot.use() middleware so every genuine inbound interaction (message, button
// tap, inline query…) stamps a TRUE "last seen" time. Deliberately decoupled from updatedAt,
// which is polluted by background writes (block-marker, kas sync, referral/link events) and so
// makes the admin "online" column lie. Throttled in-memory to one DB write per user per window —
// a chatty user costs at most one UPDATE per THROTTLE_MS, and it never blocks the handler.
import { prisma } from "../db";

const THROTTLE_MS = 60_000; // at most one lastSeenAt write per user per minute
const lastWrite = new Map<string, number>();

/** Online = seen within this window. Shared with the admin view so the dot and the API agree. */
export const ONLINE_WINDOW_MS = 5 * 60_000;

/** Fire-and-forget: stamp lastSeenAt for a real interaction. Never throws into the handler. */
export function markSeen(telegramId: string): void {
  const now = Date.now();
  const prev = lastWrite.get(telegramId) ?? 0;
  if (now - prev < THROTTLE_MS) return;
  lastWrite.set(telegramId, now);
  // updateMany (not upsert): the row is created by touchTelegramUser on /start; here we only bump
  // an existing row. A brand-new user's very first update no-ops (0 rows) — harmless, the next
  // interaction lands once the row exists. No create race, no error surface.
  prisma.telegramUser
    .updateMany({ where: { id: telegramId }, data: { lastSeenAt: new Date(now) } })
    .catch(() => undefined);
}

/** Keep the throttle map from growing without bound on a long-lived process. */
function sweepThrottle(): void {
  const cutoff = Date.now() - THROTTLE_MS;
  for (const [id, t] of lastWrite) if (t < cutoff) lastWrite.delete(id);
}
setInterval(sweepThrottle, 5 * 60_000).unref?.();
