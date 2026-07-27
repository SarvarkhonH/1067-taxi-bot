// Minimal typings + bootstrap for the Telegram WebApp runtime.
import { formatNumber } from "@t1067/shared";

// Bot API 8.0+ native geolocation. In the Telegram in-app WebView navigator.geolocation is
// unreliable (the OS permission prompt often never surfaces), so LocationManager is the correct
// path — it drives Telegram's OWN permission flow and can deep-link to settings when denied.
interface TgLocationData {
  latitude: number;
  longitude: number;
  altitude?: number | null;
  course?: number | null;
  speed?: number | null;
  horizontal_accuracy?: number | null;
}
interface TgLocationManager {
  isInited: boolean;
  isLocationAvailable: boolean;
  isAccessRequested: boolean;
  isAccessGranted: boolean;
  init: (cb?: () => void) => void;
  getLocation: (cb: (loc: TgLocationData | null) => void) => void;
  openSettings?: () => void;
}

/** Bot API 8.0+ inset, in CSS pixels. `safeArea` = device (status bar / notch / gesture bar),
 *  `contentSafeArea` = Telegram's OWN overlay chrome (the ✕ / ⌄ / ⋮ strip in fullscreen). */
interface TgInset {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Telegram'ning native «‹ Orqaga» tugmasi (Bot API 6.1+). Android'da APPARAT «orqaga» tugmasi ham
 *  SHU tugmaga yo'naltiriladi — u ko'rinmasa, apparat tugmasi Mini App'ni butunlay YOPADI. */
interface TgBackButton {
  isVisible: boolean;
  show: () => void;
  hide: () => void;
  onClick: (cb: () => void) => void;
  offClick: (cb: () => void) => void;
}

/** `requestContact()` javobi. `response` — imzolangan query-string (`contact=<json>&auth_date=…`),
 *  `hash` — uning HMAC imzosi. IKKALASI ham serverga o'zgarishsiz uzatiladi: raqamning haqiqiyligini
 *  FAQAT server, bot tokeni bilan tekshira oladi (mijozga ishonch YO'Q). */
type TgContactResponse =
  | { status: "sent"; response: string; hash?: string; responseUnsafe?: { auth_date: string; contact: { user_id: number; phone_number: string; first_name?: string; last_name?: string } } }
  | { status: "cancelled" };

interface TelegramWebApp {
  initData: string;
  version?: string;
  colorScheme: "light" | "dark";
  themeParams: Record<string, string>;
  ready: () => void;
  expand: () => void;
  isVersionAtLeast?: (v: string) => boolean;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  openTelegramLink?: (url: string) => void;
  disableVerticalSwipes?: () => void; // Bot API 7.7+ — stop the swipe-to-close gesture from hijacking in-app scroll
  isVerticalSwipesEnabled?: boolean;
  // Bot API 8.0+ fullscreen. In fullscreen Telegram draws its own ✕/⌄/⋮ chrome ON TOP of our
  // WebView — `contentSafeAreaInset` is the only way to know how much room it takes.
  isFullscreen?: boolean;
  requestFullscreen?: () => void;
  exitFullscreen?: () => void;
  safeAreaInset?: TgInset;
  contentSafeAreaInset?: TgInset;
  onEvent?: (event: string, cb: () => void) => void;
  offEvent?: (event: string, cb: () => void) => void;
  // Bot API 6.9+ — Telegram tasdiqlagan raqamni ILOVA ICHIDA so'rash (botga sakramasdan).
  requestContact?: (cb: (ok: boolean, resp?: TgContactResponse) => void) => void;
  BackButton?: TgBackButton;
  LocationManager?: TgLocationManager;
  HapticFeedback?: { impactOccurred: (s: string) => void; selectionChanged: () => void; notificationOccurred?: (t: string) => void };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export const tg = window.Telegram?.WebApp;

// ── xavfsiz-zona (fullscreen) ─────────────────────────────────────────────────
// To'liq ekran rejimida Telegram WebView'ni butun ekranga cho'zadi va O'Z boshqaruvlarini
// (✕ Close / ⌄ / ⋮) kontent USTIGA chizadi. CSS'ning `env(safe-area-inset-top)` faqat qurilma
// notch'ini biladi, Telegram panelini BILMAYDI (Android'da odatda 0px) — shuning uchun sarlavhalar
// panel ostida qolib ketgan edi. Bu yerda ikkala insetni o'qib CSS o'zgaruvchilariga yozamiz;
// tokens.css ularni `--safe-top` / `--safe-bottom` ga jamlaydi. Telegram inset bermasa
// (eski klient) o'zgaruvchilarga TEGMAYMIZ — CSS'dagi env() fallback kuchda qoladi.
const px = (n: number | undefined): string => `${Math.max(0, Math.round(n ?? 0))}px`;

function syncInsets(): void {
  if (!tg) return;
  const root = document.documentElement;
  const sa = tg.safeAreaInset;
  if (sa) {
    root.style.setProperty("--tg-sa-top", px(sa.top));
    root.style.setProperty("--tg-sa-bottom", px(sa.bottom));
    root.style.setProperty("--tg-sa-left", px(sa.left));
    root.style.setProperty("--tg-sa-right", px(sa.right));
  }
  const ca = tg.contentSafeAreaInset;
  if (ca) {
    root.style.setProperty("--tg-ca-top", px(ca.top));
    root.style.setProperty("--tg-ca-bottom", px(ca.bottom));
  }
  root.classList.toggle("is-fullscreen", !!tg.isFullscreen);
}

/** True when Telegram is currently drawing us edge-to-edge. */
export function isFullscreen(): boolean {
  return !!tg?.isFullscreen;
}

// ── ‹ ORQAGA tugmasi (Bot API 6.1+) ──────────────────────────────────────────
// Muammo: biz bu tugmani hech qachon ko'rsatmaganmiz, shuning uchun Android'da apparat «orqaga»
// tugmasi ichki ekrandan chiqarish o'rniga Mini App'ni BUTUNLAY YOPARDI (taksi xaritasidan,
// mahsulot ichidan, tarixdan — hammasidan). Telegram bitta global tugma beradi, bizda esa ekranlar
// ichma-ich ochiladi — shuning uchun STEK: eng ustki ro'yxatdan o'tgan ishlov beruvchi g'olib,
// stek bo'shaganda tugma YASHIRILADI (shunda Telegram'ning o'z «yopish» xatti-harakati qaytadi).
interface BackEntry {
  handler: () => void;
  priority: number;
}
const backStack: BackEntry[] = [];
let backBound: (() => void) | null = null;

function syncBackButton(): void {
  const bb = tg?.BackButton;
  if (!bb) return; // eski klient — hech narsa o'zgarmaydi (bugungi xatti-harakat aynan)
  if (backBound) {
    bb.offClick(backBound);
    backBound = null;
  }
  // Eng yuqori PRIORITET g'olib, teng bo'lsa — oxirgi qo'yilgani. Faqat LIFO yetarli emas edi:
  // React bola-effektlarni ota-effektlardan OLDIN yurgizadi, ya'ni deep-link bilan ichki ekran
  // darhol ochilganda (?go=dokon:35) qobiqning "tabdan Uy'ga" ishlov beruvchisi ustiga chiqib
  // qolardi va orqaga bosish mahsulotni emas, butun tabni yopardi.
  let top: BackEntry | undefined;
  for (const e of backStack) if (!top || e.priority >= top.priority) top = e;
  if (top) {
    const h = top.handler;
    backBound = () => { haptic(); h(); };
    bb.onClick(backBound);
    bb.show();
  } else {
    bb.hide();
  }
}

/** Orqaga-ishlov beruvchini stekka qo'yadi. Qaytgan funksiyani chaqirish uni olib tashlaydi
 *  (React'da `useEffect` cleanup'i) — shuning uchun ekran yopilganda tugma o'z-o'zidan tartibga
 *  keladi, hech qanday qo'lda `hide()` kerak emas.
 *  `priority`: qobiq darajasi = 0, ichki (ustma-ust ochilgan) ekranlar = 1+. */
export function pushBack(handler: () => void, priority = 0): () => void {
  const entry: BackEntry = { handler, priority };
  backStack.push(entry);
  syncBackButton();
  let released = false;
  return () => {
    if (released) return; // ikki marta chaqirilsa begona ishlov beruvchini o'chirib yubormasin
    released = true;
    const i = backStack.indexOf(entry);
    if (i >= 0) backStack.splice(i, 1);
    syncBackButton();
  };
}

// ── 📱 raqamni ilova ichida so'rash (Bot API 6.9+) ────────────────────────────
export type ContactAsk =
  | { status: "sent"; response: string; hash?: string }
  | { status: "cancelled" }
  | { status: "unsupported" }; // eski klient → chaqiruvchi botga yo'naltiradi

/** Telegram'ning o'z raqam-so'rov oynasini ochadi. HECH QACHON rad etmaydi; javob serverga
 *  o'zgarishsiz uzatilishi va O'SHA YERDA tekshirilishi shart. Klient eski bo'lsa yoki javob
 *  15s ichida kelmasa — "unsupported"/"cancelled" (ilova botga qaytish yo'lini ko'rsatadi). */
export function askContact(): Promise<ContactAsk> {
  return new Promise((resolve) => {
    if (!tg?.requestContact || !tg.isVersionAtLeast?.("6.9")) {
      resolve({ status: "unsupported" });
      return;
    }
    let settled = false;
    const done = (r: ContactAsk) => { if (!settled) { settled = true; resolve(r); } };
    try {
      tg.requestContact((ok, resp) => {
        if (!ok || !resp || resp.status !== "sent" || !resp.response) { done({ status: "cancelled" }); return; }
        done({ status: "sent", response: resp.response, hash: resp.hash });
      });
    } catch {
      done({ status: "unsupported" });
      return;
    }
    // Xavfsizlik to'ri: ba'zi klientlar oynani yopganda callback'ni umuman chaqirmaydi —
    // spinner abadiy aylanib qolmasin.
    setTimeout(() => done({ status: "cancelled" }), 60000);
  });
}

export function initTelegram(): void {
  if (!tg) return;
  tg.ready();
  tg.expand();
  // Stop Telegram's vertical swipe-to-close/minimize from hijacking in-app scrolling — without this,
  // scrolling a long sheet (ORZU, Detallar, bozor) drags the whole Mini App closed ("pasga-tepaga ochib yopib").
  tg.disableVerticalSwipes?.();
  tg.setHeaderColor?.("#0b0f1a");
  tg.setBackgroundColor?.("#0b0f1a");
  syncInsets();
  // Telegram fills the insets slightly AFTER ready() on some clients (same lag as initData) —
  // re-read on every relevant event, plus two cheap catch-up ticks so the first paint is never stale.
  for (const ev of ["safeAreaChanged", "contentSafeAreaChanged", "fullscreenChanged", "viewportChanged"]) {
    tg.onEvent?.(ev, syncInsets);
  }
  setTimeout(syncInsets, 300);
  setTimeout(syncInsets, 1200);
}

export function haptic(): void {
  tg?.HapticFeedback?.selectionChanged();
}

// ── native geolocation (Telegram Bot API 8.0+) ────────────────────────────────
export type LocResult =
  | { lat: number; lng: number; accuracy: number }
  | { error: "denied" | "unavailable" | "none" }; // "none" = LocationManager not supported → caller falls back to navigator.geolocation

/** True when the Telegram native LocationManager is usable (8.0+ client). */
export function tgHasLocationManager(): boolean {
  return !!(tg?.LocationManager && tg.isVersionAtLeast?.("8.0"));
}

/** One-shot native location via Telegram. Resolves with coords, or an error kind so the caller can
 *  show the right message / offer settings. Never rejects. */
export function tgGetLocation(): Promise<LocResult> {
  return new Promise((resolve) => {
    const lm = tg?.LocationManager;
    if (!lm || !tg?.isVersionAtLeast?.("8.0")) { resolve({ error: "none" }); return; }
    let settled = false;
    const done = (r: LocResult) => { if (!settled) { settled = true; resolve(r); } };
    const run = () => {
      if (!lm.isLocationAvailable) { done({ error: "unavailable" }); return; }
      lm.getLocation((loc) => {
        if (loc) done({ lat: loc.latitude, lng: loc.longitude, accuracy: loc.horizontal_accuracy ?? 30 });
        else done({ error: lm.isAccessRequested && !lm.isAccessGranted ? "denied" : "unavailable" });
      });
    };
    if (lm.isInited) run();
    else lm.init(run);
    setTimeout(() => done({ error: "unavailable" }), 15000); // safety: never hang the spinner
  });
}

/** Deep-link to Telegram's location settings so a denied user can re-grant. */
export function tgOpenLocationSettings(): void {
  tg?.LocationManager?.openSettings?.();
}

/** Stronger "you won" feedback — native success notification, falls back to a heavy tap. */
export function hapticSuccess(): void {
  const h = tg?.HapticFeedback;
  if (h?.notificationOccurred) h.notificationOccurred("success");
  else h?.impactOccurred("heavy");
}

// Single lazily-created AudioContext (browsers cap the count). Created on first
// use, which is always right after a user tap, so autoplay policy lets it run.
let _audioCtx: AudioContext | null = null;
function audioCtx(): AudioContext | null {
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    if (!_audioCtx) _audioCtx = new Ctor();
    if (_audioCtx.state === "suspended") void _audioCtx.resume();
    return _audioCtx;
  } catch {
    return null;
  }
}

/**
 * Short celebratory fanfare for a tier-unlock — a rising major arpeggio, fully
 * synthesized (no .ogg asset / CDN dependency, so it ships anywhere). Degrades to
 * silence if Web Audio is blocked or unavailable. ~0.7s, deliberately gentle.
 */
export function playTierFanfare(): void {
  const ctx = audioCtx();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = 0.16; // keep it soft — a chime, not a blast
    master.connect(ctx.destination);
    // C5 · E5 · G5 · C6 — a clean major triad resolving up an octave
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const t = now + i * 0.11;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "triangle"; // soft, bell-like
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(1, t + 0.02); // quick attack
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32); // gentle decay
      osc.connect(g);
      g.connect(master);
      osc.start(t);
      osc.stop(t + 0.34);
    });
  } catch {
    /* audio blocked — ceremony stays visual-only */
  }
}

// 🛠 P-Polish-Repair-1 — short synthesized sounds for the repair-bay flow.
// All reuse the singleton audioCtx (no extra AudioContext allocation). Tap-driven
// (user-initiated → autoplay policy passes). Silent if Web Audio blocked.

/** Repair success: ascending short chirp (~140ms). Used on every successful repairZone. */
export function playRepairChirp(): void {
  const ctx = audioCtx();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.18, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(660, now);
    osc.frequency.exponentialRampToValueAtTime(990, now + 0.12);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.16);
  } catch {
    /* silent */
  }
}

/** Tier-up ring (zone crosses 80 GOOD or 96 MINT): bright two-tone bell (~280ms). */
export function playTierUpRing(): void {
  const ctx = audioCtx();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = 0.15;
    master.connect(ctx.destination);
    [880, 1320].forEach((freq, i) => {
      const t = now + i * 0.08;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(1, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.connect(g);
      g.connect(master);
      osc.start(t);
      osc.stop(t + 0.2);
    });
  } catch {
    /* silent */
  }
}

/** Repair failed (low quality / DEFECT): brief sawtooth thunk (~180ms). */
export function playRepairFail(): void {
  const ctx = audioCtx();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.15, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.16);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  } catch {
    /* silent */
  }
}

/**
 * The friend-facing invite message. Leads with the emotional hook (first ride FREE)
 * then the value, then the CTA. `bonus` is the referee's reward (= firstRide tanga);
 * it lands after their first ride, so we say "BEPUL", never "hozir oling". Keep this
 * the single source for every client share point so the copy stays in sync.
 */
export function inviteText(bonus: number): string {
  const n = formatNumber(bonus); // KEEP IN SYNC with the bot's clientInviteText (server/src/bot/bot.ts)
  // Short + warm (owner: less "spammy"). The rich image card is carried by the landing URL's OG tags.
  return `🚕 BirJoy — senga ${n} so'm bonus. Bir tap bilan taxi. Qo'shil 👇`;
}

// Wrap the bot ref-link in our OG landing page (/j/?r=<code>) so Telegram renders a rich IMAGE
// card (poster + text) instead of the plain bot preview — the "less spammy" ask. The page reads
// ?r and forwards to t.me/koson1067bot?start=ref_<code>, so referral capture is unchanged.
const INVITE_LANDING = "https://app.birjoy.online/j/";
export function inviteLandingUrl(botLink: string): string {
  const m = botLink.match(/(?:start|startapp)=ref_?([a-zA-Z0-9_-]+)/);
  // &v bumps the URL when the OG card content changes → Telegram fetches a FRESH preview
  // instead of showing a stale cached card (v2 = gift-emoji removed).
  return m && m[1] ? `${INVITE_LANDING}?r=${encodeURIComponent(m[1])}&v=2` : botLink;
}

/** Open Telegram's native "share to a chat" dialog with an invite link. */
export function shareLink(url: string, text: string): void {
  const share = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  if (tg?.openTelegramLink) tg.openTelegramLink(share);
  else window.open(share, "_blank");
}

export async function copyText(s: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(s);
  } catch {
    /* clipboard blocked — no-op */
  }
}
