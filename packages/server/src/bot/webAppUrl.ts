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

/** Push/xabar uchun «ilovani ochish» tugmasi. Matn «falon joyga boring» deb yozib, tugma
 *  bermasligi — mijoz uchun bajarib bo'lmaydigan ko'rsatma (ega, 2026-08-01: «barbir mini app
 *  siz keldi»). Oddiy obyekt qaytaradi, ya'ni InlineKeyboard import qilish shart emas. */
export function appBtn(label: string, go: string, extra?: Record<string, string>): { reply_markup: { inline_keyboard: { text: string; web_app: { url: string } }[][] } } | undefined {
  if (!canWebApp) return undefined;
  return { reply_markup: { inline_keyboard: [[{ text: label, web_app: { url: webAppUrl(go, extra) } }]] } };
}

export function webAppUrl(go?: string, extra?: Record<string, string>): string {
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
  let out = u + (u.includes("?") ? "&" : "?") + "v=" + webAppVer + (go ? "&go=" + go : "");
  // 🤝 Gashtak chuqur havolasi (`gsk_` — bot.ts) uchun: `?go=oyin&gsk=<code>`. `extra` ATAYLAB
  // qo'shimcha — mavjud HAMMA chaqiruv (`go` bilan bittasi) o'zgarishsiz qoladi.
  if (extra) for (const [k, v] of Object.entries(extra)) out += `&${k}=${encodeURIComponent(v)}`;
  return out;
}

// 🩹 STALE MENU BUTTON (2026-07-31, haydovchi 6497 «Zafar» hodisasi): `setChatMenuButton` GLOBAL
// chaqiriladi (boot'da), Telegram mijozlari esa uni O'Z KESHIDA saqlaydi va sekin yangilaydi.
// 2026-07-25 Vercel→VPS ko'chishidan OLDIN keshlagan mijozda tugma hali ham O'CHIRILGAN Vercel
// hostiga ishora qiladi → bosganda o'lik domenga boradi, serverimizga BIRORTA ham so'rov yetib
// kelmaydi, ekran qorayib qoladi. Diagnostika: 24 soatda 0 so'rov, boshqa haydovchilarda 0 xato,
// `getChatMenuButton?chat_id=…` → "type":"default". Xavf ostidagi guruh: migratsiyadan oldin
// ulangan 572 kishi (131 haydovchi).
//
// Yechim: foydalanuvchi bot bilan gaplashganda uning chatiga PER-CHAT tugma o'rnatamiz — per-chat
// qiymat mijozga majburan yetkaziladi, global keshni chetlab o'tadi. Bir jarayon umri davomida
// har foydalanuvchiga BIR MARTA (in-memory), ya'ni Telegram API'ga qo'shimcha yuk deyarli yo'q.
// Fire-and-forget: xato bo'lsa jim — bu hech qachon xabar ishlovini to'smaydi.
const menuFixed = new Set<string>();

export function ensureChatMenuButton(api: { setChatMenuButton: (args: Record<string, unknown>) => Promise<unknown> }, telegramId: string): void {
  if (!canWebApp || menuFixed.has(telegramId)) return;
  menuFixed.add(telegramId);
  void api
    .setChatMenuButton({
      chat_id: Number(telegramId),
      menu_button: { type: "web_app", text: "🚕 BirJoy", web_app: { url: webAppUrl() } },
    })
    .catch(() => {
      menuFixed.delete(telegramId); // vaqtinchalik xato — keyingi aloqada qayta urinsin
    });
}
