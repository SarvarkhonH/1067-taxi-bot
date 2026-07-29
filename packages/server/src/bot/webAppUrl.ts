// 🔗 Single source of truth for the Mini App URL — every bot file that builds a `web_app` button
// MUST import from here, never redefine its own copy. `booking.ts` used to keep a LOCAL duplicate
// of webAppUrl() (to dodge a circular import with bot.ts, which imports FROM booking.ts) — that
// duplicate silently drifted out of sync when bot.ts's copy gained the `?v=` cache-busting param
// (§75 fix, 2026-07-29), so every booking-wizard button kept serving a version-less URL long after
// the rest of the bot was fixed. Moving the real implementation here (imported by both) makes that
// class of drift structurally impossible — there is only one webAppUrl() to update.
import { env } from "../env";

export const canWebApp = env.TELEGRAM_WEBAPP_URL.startsWith("https://");

// Telegram caches the Mini App aggressively BY URL — a URL with no version param stays cached
// forever, so a deploy never reaches anyone already holding that URL (menu button, an old bot
// message's inline button, …). We version every URL (?v=<token>) so each release is a "new" app to
// Telegram. The token auto-tracks the live frontend (index.html's hashed bundle name, probed at
// boot) — no manual bump needed on a frontend deploy.
const WEBAPP_BUILD = "v16"; // static fallback if the live-hash probe fails
let webAppVer = WEBAPP_BUILD;

export function getWebAppVer(): string {
  return webAppVer;
}

export async function refreshWebAppVer(): Promise<void> {
  try {
    const res = await fetch(env.TELEGRAM_WEBAPP_URL);
    // Vite content hashes are base64url → can contain "-" and "_" (e.g. index-BilONG-Z.js). The old
    // [A-Za-z0-9_]+ class missed the hyphen → probe failed → menu button fell back to the stale
    // "v16", so every user opened a cached old build. Include "-" so it always parses.
    const m = (await res.text()).match(/index-([A-Za-z0-9_-]+)\.js/);
    if (m) webAppVer = m[1]!;
  } catch (e) {
    console.error("[bot] webapp version probe failed → fallback", WEBAPP_BUILD, e instanceof Error ? e.message : e);
  }
}

export function webAppUrl(go?: string): string {
  // Always emit a URL with an explicit `/` path before the query — some Telegram clients (older
  // Android, Web Z) parse `https://host?…` differently from `https://host/?…` and can drop the
  // hash they need to append (#tgWebAppData=…) → initData missing → "Telegram orqali oching".
  let u = env.TELEGRAM_WEBAPP_URL;
  const noPath = !/^https?:\/\/[^/?#]+\/[^?]/.test(u);
  if (noPath) {
    const qi = u.indexOf("?");
    if (qi === -1) u = u.replace(/\/?$/, "/");
    else u = u.slice(0, qi).replace(/\/?$/, "/") + u.slice(qi);
  }
  return u + (u.includes("?") ? "&" : "?") + "v=" + webAppVer + (go ? "&go=" + go : "");
}
