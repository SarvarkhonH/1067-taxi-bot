import { Bot, Context, InlineKeyboard, Keyboard } from "grammy";
import { formatNumber, haversineKm } from "@t1067/shared";
import { env } from "../env";

// Local helper — mirrors bot.ts webAppUrl(). Used to append inline web_app buttons to bot replies
// so users have a reliable one-tap entry into the Mini App (inline web_app = same auth as the menu
// button, never the reply-keyboard web_app flakiness). Trailing slash before the query is mandatory.
const canWebApp = env.TELEGRAM_WEBAPP_URL.startsWith("https://");
function webAppUrl(go?: string): string {
  let u = env.TELEGRAM_WEBAPP_URL;
  const noPath = !/^https?:\/\/[^/?#]+\/[^?]/.test(u);
  if (noPath) {
    const qi = u.indexOf("?");
    if (qi === -1) u = u.replace(/\/?$/, "/");
    else u = u.slice(0, qi).replace(/\/?$/, "/") + u.slice(qi);
  }
  return u + (u.includes("?") ? "&" : "?") + (go ? "go=" + go : "");
}
import { getDataSource, type ActiveBooking, type SavedAddress } from "../kas";
import { getMe, getMemberId } from "../services/memberService";
import { getFareConfig } from "../services/clientInfoService";
import { callOneTapFor, cancelBookingFor, claimDispatchSlot, getActiveBookingFor, getQuickPickup, releaseDispatchSlot, rememberPickup } from "../services/bookingService";

interface BookingSession {
  awaitingText: boolean;
  clientName: string;
  phone: string;
  addresses: SavedAddress[];
  pickup?: SavedAddress;
}

// In-memory per-user wizard state (transient by design). The 1-tap pickup
// memory lives on Member (DB) — it must survive restarts/deploys.
const sessions = new Map<string, BookingSession>();
// "pay a driver by car number" flow: telegramId → awaiting the car number. Exported so
// /start can cancel it (the bot's start handler clears all pending wizards).
export const payDriver = new Map<string, boolean>();

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function trunc(s: string, n = 38): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// Gate for the "just type an address — no need to press the button first" path: a bare free-text
// message only gets treated as an address query if it plausibly IS one. Keeps greetings, reactions,
// commands, and phone numbers from hitting kas / triggering a booking. (Menu-button labels never
// reach here — their bot.hears run earlier; see registration order in bot.ts.)
const GREETINGS = new Set(["salom", "assalom", "assalomu alaykum", "rahmat", "ok", "ha", "yo'q", "yoq", "yaxshi", "hi", "hello", "привет", "спасибо", "да", "нет"]);
function looksLikeAddress(text: string): boolean {
  const t = text.trim();
  if (t.length < 2 || t.length > 60) return false; // app's search box also fires at 2 chars
  if (t.startsWith("/")) return false; // command
  if (/^\+?\d[\d\s\-()]{6,}$/.test(t)) return false; // phone-shaped → handled by its own handler
  if (GREETINGS.has(t.toLowerCase())) return false;
  return /[a-zA-Zа-яёА-ЯЁ\d]/.test(t); // must contain a letter or digit
}

// Strip the obvious taxi-intent words so a typed SENTENCE resolves to its address part:
// "Amir Temur 12 ga taxi kerak" → "Amir Temur 12 ga". Conservative (only unambiguous intent
// words) — leftover particles like "ga"/"da" are harmless to kas's fuzzy address search.
function addressQuery(text: string): string {
  const q = text
    .replace(/[.,!?]+/g, " ")
    .replace(/\b(taxi|taksi|kerak|chaqir\w*|buyurtma|iltimos|pliz|please)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return q.length >= 3 ? q : text.trim();
}

// Normalize for catalog substring matching (case + apostrophe variants + spacing).
function normAddr(s: string): string {
  return s.toLowerCase().replace(/[''`]/g, "'").replace(/\s+/g, " ").trim();
}
// Aggressive normalize for FUZZY matching: strip everything but letters/digits so
// "post-gai" == "postgai" and spacing/punctuation never blocks a match.
function fuzzyNorm(s: string): string {
  return s.toLowerCase().replace(/[''`]/g, "").replace(/[^\p{L}\p{N}]+/gu, "");
}
// Levenshtein edit distance (bounded; small strings — kas catalog is ~111 names). "shabda"↔
// "shabada" = 1, "postgayi"↔"postgai" = 1 → a typo/letter-swap still finds the real place.
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
    }
    prev = cur;
  }
  return prev[b.length]!;
}
// Split a raw string into fuzzy-normalized words (≥2 chars). Keeps word boundaries (unlike
// fuzzyNorm which strips them) so "shabda tarafga" compares word-vs-word against "Shabada".
export function fuzzyWords(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[''`]/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .map((w) => fuzzyNorm(w))
    .filter((w) => w.length >= 2);
}
// Best fuzzy closeness of query words against a place name (0 = exact/substring; higher = farther).
export function fuzzyDistance(queryWords: string[], name: string): number {
  const nameNorm = fuzzyNorm(name);
  const nameWords = fuzzyWords(name);
  if (!nameNorm || !queryWords.length) return 99;
  let best = 99;
  for (const qw of queryWords) {
    if (qw.length < 3) continue; // 1-2 char tokens ("ga", "da") aren't places
    if (nameNorm.includes(qw)) return 0; // query word is inside the place name
    best = Math.min(best, editDistance(qw, nameNorm));
    for (const nw of nameWords) {
      if (Math.abs(qw.length - nw.length) > 3) continue;
      best = Math.min(best, editDistance(qw, nw));
    }
  }
  return best;
}

// Resolve a typed address to bookable options. The bot used to call kas `byName` only — a curated,
// narrow list that MISSES many real places ("shabada"). The official rider app also reverse-snaps to
// the FULL company catalog (getAllAddresses → ~111 named places, cached 6h). Merge both: byName first
// (kas's own ranking), then catalog substring matches (name⊆query OR query⊆name, so "shabada" and
// "shabada ga" both hit "Shabada"), deduped by id, top 6 — so anything the catalog knows is now
// typeable in the bot, matching/exceeding the app.
async function resolveAddresses(query: string): Promise<SavedAddress[]> {
  const ds = getDataSource();
  const [byName, catalog] = await Promise.all([
    ds.searchAddresses(query).catch(() => [] as SavedAddress[]),
    ds.getAllAddresses().catch(() => [] as SavedAddress[]),
  ]);
  const q = normAddr(query);
  const sub =
    q.length >= 2
      ? catalog.filter((a) => {
          const n = normAddr(a.name);
          return n.length >= 2 && (n.includes(q) || (n.length >= 3 && q.includes(n)));
        })
      : [];
  const out: SavedAddress[] = [];
  const seen = new Set<number>();
  for (const a of [...byName, ...sub]) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    out.push(a);
    if (out.length >= 6) break;
  }
  // FUZZY pass — typo/letter-swap tolerant, so "shabda"→Shabada, "post-gai"→postgayi never
  // dead-end. Only runs to fill remaining slots (exact/substring matches always rank first).
  if (out.length < 6) {
    const qWords = fuzzyWords(query);
    const scored: { a: SavedAddress; d: number }[] = [];
    for (const a of catalog) {
      if (seen.has(a.id)) continue;
      const d = fuzzyDistance(qWords, a.name);
      const thr = Math.max(1, Math.min(3, Math.floor(fuzzyNorm(query).length * 0.34))); // ~1 per 3 chars
      if (d <= thr) scored.push({ a, d });
    }
    scored.sort((x, y) => x.d - y.d);
    for (const { a } of scored) {
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      out.push(a);
      if (out.length >= 6) break;
    }
  }
  return out;
}

/** Start the pick-an-address booking flow from a free-text query (shared by the direct
 *  typed-address path below and the AI agent's taksi_chaqir action). Returns true when it
 *  handled the message (options shown / active-ride notice) — false when the query resolved
 *  to nothing or the rider isn't linked, so the caller can fall through to its own reply. */
export async function tryAddressBooking(ctx: Context, query: string): Promise<boolean> {
  const id = String(ctx.from!.id);
  const me = await getMe(id);
  if (!me?.member.phone) return false;
  const results = await resolveAddresses(addressQuery(query));
  if (!results.length) return false;
  const info = await getDataSource().checkClient(me.member.phone).catch(() => null);
  if (info?.activeBooking) {
    await ctx.reply(`ℹ️ Sizda faol buyurtma bor:\n📍 ${esc(info.activeBooking.addressName)}\n\n«📍 Buyurtmam» — holatini ko'ring.`, { parse_mode: "HTML" });
    return true;
  }
  sessions.set(id, { awaitingText: false, clientName: info?.clientName ?? me.member.fullName, phone: me.member.phone, addresses: results });
  await ctx.reply("📍 Manzilni tanlang:", { reply_markup: addressKb(results) });
  return true;
}

/** Get (or lazily create) the booking wizard session for a LINKED rider who started a booking by
 *  sending a location or typing an address directly — i.e. without first pressing «🚕 Taxi
 *  chaqirish». Returns null (and replies) if the rider isn't linked or already has an active ride. */
async function ensureSession(ctx: Context): Promise<BookingSession | null> {
  const id = String(ctx.from!.id);
  const existing = sessions.get(id);
  if (existing) return existing;
  const me = await getMe(id);
  if (!me?.member.phone) {
    await ctx.reply("Avval telefon raqamingizni ulang — /start.");
    return null;
  }
  const info = await getDataSource().checkClient(me.member.phone).catch(() => null);
  if (info?.activeBooking) {
    await ctx.reply(`ℹ️ Sizda faol buyurtma bor:\n📍 ${esc(info.activeBooking.addressName)}\n\n«📍 Buyurtmam» — holatini ko'ring.`, { parse_mode: "HTML" });
    return null;
  }
  const s: BookingSession = { awaitingText: false, clientName: info?.clientName ?? me.member.fullName, phone: me.member.phone, addresses: info?.addresses ?? [] };
  sessions.set(id, s);
  return s;
}

/** Hand a freshly-placed in-bot order's message to the live sweep: it then EDITS this same
 *  card in place through every status (driver, ETA, moving pin, finish + fare/bonus) — one
 *  message, auto-updating, no manual "Holat". lastBookingId stays null so the sweep adopts it
 *  on first sighting (and sets the real kas id then). */
async function markBotOrderCard(memberId: number | null, msgId: number | undefined): Promise<void> {
  if (!memberId || !msgId) return;
  const { prisma } = await import("../db");
  await prisma.member
    .update({ where: { id: memberId }, data: { rideCardMsgId: msgId, lastBookingStatus: "searching", lastBookingId: null } })
    .catch(() => undefined);
}

// Uber pattern #1: GPS pickup. Reply keyboard with a native location request.
function pickupKeyboard(): Keyboard {
  return new Keyboard().requestLocation("📍 Joylashuvni yuborish").row().text("✍️ Manzil yozish").text("❌ Bekor").resized().oneTime();
}

function addressKb(addresses: SavedAddress[], lastForUser?: SavedAddress): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (lastForUser) kb.text(`🔁 Yana: ${trunc(lastForUser.name, 28)}`, `bk:last`).row();
  addresses.slice(0, 6).forEach((a, i) => kb.text(`⭐ ${trunc(a.name)}`, `bk:addr:${i}`).row());
  return kb;
}
function confirmKb(): InlineKeyboard {
  return new InlineKeyboard().text("✅ Chaqirish", "bk:confirm").text("❌ Bekor", "bk:cancel");
}

// Uber pattern #3: transparent fare before confirm (kas = taximeter → show the rate card + cashback).
async function confirmText(s: BookingSession): Promise<string> {
  let fare = "";
  try {
    const cfg = await getFareConfig();
    fare =
      `\n🧮 <b>Narx</b> (taximetr):\n` +
      `  • Eng kam: <b>${formatNumber(cfg.minimalPayment)} so'm</b>\n` +
      `  • Har km: <b>${formatNumber(cfg.perKmCity)} so'm</b>\n` +
      `  • 💰 Bu safardan: <b>+${formatNumber(cfg.cashback.perAppRide)} so'm cashback</b>\n`;
  } catch {
    /* fare optional */
  }
  return `🚕 <b>Tasdiqlang</b>\n\n📍 Qayerdan: <b>${esc(s.pickup!.name)}</b>\n📞 ${esc(s.phone)}\n${fare}\nTaxi chaqiraymi?`;
}

// ─── tracking (Uber pattern #2: live driver + ETA + cancel) ───────────────────
function statusLabel(s: string): string {
  const map: Record<string, string> = {
    in_place: "🔍 Haydovchi qidirilyapti…",
    searching: "🔍 Haydovchi qidirilyapti…",
    new: "🔍 Haydovchi qidirilyapti…",
    called: "🚖 Haydovchi yo'lda",
    accepted: "🚖 Haydovchi yo'lda",
    on_the_way: "🚖 Haydovchi yo'lda",
    arrived: "✅ Haydovchi yetib keldi!",
    started: "🚗 Safar boshlandi",
    completed: "🏁 Safar yakunlandi",
    finished: "🏁 Safar yakunlandi",
  };
  return map[s] ?? `ℹ️ Holat: ${esc(s)}`;
}

function etaMin(b: ActiveBooking): number | null {
  if (b.driver?.lat && b.driver?.lng && b.lat && b.lng) {
    return Math.max(1, Math.ceil((haversineKm({ lat: b.driver.lat, lng: b.driver.lng }, { lat: b.lat, lng: b.lng }) / 24) * 60));
  }
  return null;
}

function renderTracking(b: ActiveBooking): string {
  const arrived = ["arrived", "completed", "finished"].includes(b.status);
  const label = b.driver && !arrived ? "🚖 Haydovchi yo'lda" : statusLabel(b.status);
  const eta = etaMin(b);
  const lines = [`${label}${eta && b.driver && !arrived ? ` · ~${eta} daq` : ""}`, "", `📍 Manzil: <b>${esc(b.addressName)}</b>`];
  if (b.driver) {
    lines.push("", `🚗 <b>${esc(b.driver.fullName)}</b>`, `${esc(b.driver.carModel)} · <b>${esc(b.driver.carNumber)}</b>`, `📞 ${esc(b.driver.phone)}`);
    if (b.driver.rating) lines.push(`⭐ ${b.driver.rating.toFixed(1)}`);
  } else {
    lines.push("", "⏳ Haydovchi qidirilyapti — biroz kuting…");
  }
  if (b.clientBonus) lines.push("", `💰 Bu safardan cashback: <b>+${formatNumber(b.clientBonus)} so'm</b>`);
  return lines.join("\n");
}

function trackingKb(b: ActiveBooking): InlineKeyboard {
  const kb = new InlineKeyboard().text("🔄 Yangilash", "bk:status");
  if (b.driver?.lat && b.driver?.lng) kb.text("🗺 Joylashuv", "bk:loc");
  const cancellable = ["in_place", "searching", "new", "called", "accepted", "on_the_way"].includes(b.status);
  if (cancellable) kb.row().text("✖ Buyurtmani bekor qilish", "bk:cancelride");
  if (canWebApp) kb.row().webApp("🚀 Jonli xarita — Mini App", webAppUrl("book"));
  return kb;
}

async function showTracking(ctx: Context): Promise<void> {
  const me = await getMe(String(ctx.from!.id));
  if (!me?.member.phone) {
    await ctx.reply("Avval telefon raqamingizni ulang — /start.");
    return;
  }
  const b = await getDataSource().getActiveBooking(me.member.phone).catch(() => null);
  if (!b) {
    const kb = canWebApp ? new InlineKeyboard().webApp("🗺 Xaritada chaqirish — Mini App", webAppUrl("book")) : undefined;
    await ctx.reply("Sizda hozircha faol buyurtma yo'q.\n«🚕 Taxi chaqirish» tugmasini bosing.", { reply_markup: kb });
    return;
  }
  await ctx.reply(renderTracking(b), { parse_mode: "HTML", reply_markup: trackingKb(b) });
}

async function startBooking(ctx: Context, opts: { forceFull?: boolean } = {}): Promise<void> {
  const id = String(ctx.from!.id);
  const me = await getMe(id);
  if (!me?.member.phone) {
    await ctx.reply("Avval telefon raqamingizni ulang — /start.");
    return;
  }
  const phone = me.member.phone;

  const info = await getDataSource().checkClient(phone).catch(() => null);
  if (info?.activeBooking) {
    await ctx.reply(`ℹ️ Sizda faol buyurtma bor:\n📍 ${esc(info.activeBooking.addressName)}\n\n«📍 Buyurtmam» — holatini ko'ring.`, { parse_mode: "HTML" });
    return;
  }

  const addresses = info?.addresses ?? [];
  sessions.set(id, { awaitingText: false, clientName: info?.clientName ?? me.member.fullName, phone, addresses });

  // 1-tap: returning rider gets one big CTA — pickup resolved behind the button
  const quick = opts.forceFull ? null : await getQuickPickup(me.member.id).catch(() => null);
  if (quick) {
    const kb = new InlineKeyboard()
      .text(`🚕 Chaqirish — ${trunc(quick.name, 26)}`, "bk:now")
      .row()
      .text("📍 Boshqa manzil", "bk:other");
    if (canWebApp) kb.row().webApp("🗺 Xaritada tanlash — Mini App", webAppUrl("book"));
    await ctx.reply(`🚕 <b>1067 tayyor!</b>\n\n📍 <b>${esc(quick.name)}</b> dan olib ketamizmi?`, { parse_mode: "HTML", reply_markup: kb });
    return;
  }

  // first-timer: GPS-first, then saved quick-picks
  await ctx.reply("🚕 <b>Qayerdan olib ketamiz?</b>\n\n📍 Joylashuvingizni yuboring — eng tez yo'l. Yoki manzilni tanlang/yozing 👇", {
    parse_mode: "HTML",
    reply_markup: pickupKeyboard(),
  });
  if (canWebApp) {
    await ctx.reply("Yoki xaritadan tanlang 👇", {
      reply_markup: new InlineKeyboard().webApp("🗺 Xaritali buyurtma — Mini App", webAppUrl("book")),
    });
  }
  if (addresses.length) {
    await ctx.reply("⭐ Tez tanlash:", { reply_markup: addressKb(addresses) });
  }
}

/** Nearest saved address to a GPS point (within ~1.2km), so kas gets a real addressId. */
function nearestAddress(addresses: SavedAddress[], lat: number, lng: number): SavedAddress | null {
  let best: SavedAddress | null = null;
  let bestKm = 1.2;
  for (const a of addresses) {
    if (a.lat == null || a.lng == null) continue;
    const km = haversineKm({ lat, lng }, { lat: a.lat, lng: a.lng });
    if (km < bestKm) {
      bestKm = km;
      best = a;
    }
  }
  return best;
}

async function showConfirm(ctx: Context, s: BookingSession): Promise<void> {
  await ctx.reply(await confirmText(s), { parse_mode: "HTML", reply_markup: confirmKb() });
}

export function registerBooking(bot: Bot, mainMenu: (isDriver?: boolean, tgId?: string) => Promise<Keyboard>): void {
  bot.hears("🚕 Taxi chaqirish", (ctx) => startBooking(ctx)); // old cached keyboard label
  bot.hears("📍 Lokatsiyali chaqirish", (ctx) => startBooking(ctx)); // new label (2026-06-29)
  bot.command("book", (ctx) => startBooking(ctx));
  bot.hears("📍 Buyurtmam", (ctx) => showTracking(ctx));
  bot.command("status", (ctx) => showTracking(ctx));
  bot.command("qayta", (ctx) => startBooking(ctx)); // returning rider lands on the 1-tap card

  // 📜 ride history (kas bookingReports)
  bot.command("tarix", async (ctx) => {
    const me = await getMe(String(ctx.from!.id));
    if (!me?.member.phone) {
      await ctx.reply("Avval telefon raqamingizni ulang — /start.");
      return;
    }
    const { getRideHistoryFull } = await import("../services/bookingService");
    const { rides, totals } = await getRideHistoryFull(me.member.id, me.member.phone);
    if (!rides.length) {
      await ctx.reply("📜 Safar tarixi topilmadi.");
      return;
    }
    const header =
      `📜 <b>Safarlar tarixi</b>\n` +
      `🚕 <b>${totals.count}</b> safar · 🧾 <b>${formatNumber(Math.round(totals.spent))}</b> so'm` +
      `${totals.cashback ? ` · 💰 +${formatNumber(Math.round(totals.cashback))}` : ""}\n` +
      `🎉 Siz 1067'dan foydalanib <b>${totals.savingsPct}% tejadingiz</b>\n` +
      `━━━━━━━━━━━━\n\n`;
    const lines = rides.slice(0, 10).map((r) => {
      const d = r.at ? new Date(r.at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
      const done = ["delivered", "completed", "finished"].includes(r.status) ? "🏁" : ["cancel_by_operator", "cancel_by_server"].includes(r.status) ? "✖" : "🚖";
      const km = r.distance ? `📍${(r.distance / 1000).toFixed(1)}km` : "";
      const mins = r.time ? `⏱${r.time >= 180 ? Math.round(r.time / 60) : Math.round(r.time)}daq` : "";
      const meta = [km, mins, r.carModel ? `🚘${esc(r.carModel)}` : ""].filter(Boolean).join(" · ");
      const money = ["delivered", "completed", "finished"].includes(r.status) ? `🧾 <b>${formatNumber(r.payment || 0)}</b> so'm${r.cashback ? ` · 💰+${formatNumber(r.cashback)}` : ""}` : "Bekor qilingan";
      return `${done} <b>${esc(r.addressName)}</b>\n<i>${d}</i>${meta ? `\n${meta}` : ""}\n${money}`;
    });
    await ctx.reply(header + lines.join("\n\n"), { parse_mode: "HTML" });
  });

  // the 1-tap dispatch — pickup resolved server-side, real taxi sent
  bot.callbackQuery("bk:now", async (ctx) => {
    const memberId = await getMemberId(String(ctx.from.id));
    if (!memberId) {
      await ctx.answerCallbackQuery();
      return;
    }
    await ctx.answerCallbackQuery();
    await ctx.editMessageText("⏳ Buyurtma yuborilyapti…").catch(() => undefined);
    const r = await callOneTapFor(memberId, {});
    if (r.state === "dispatched" || r.state === "test") {
      const note = r.state === "test" ? "\n\n<i>(Hozir test rejimi)</i>" : "\n\n🔍 Haydovchi qidirilyapti — holat shu yerda <b>jonli</b> yangilanadi 👇";
      await ctx.editMessageText(`✅ <b>Buyurtma qabul qilindi!</b>\n📍 ${esc(r.pickupName ?? "")}${note}`, { parse_mode: "HTML" });
      if (r.state === "dispatched") await markBotOrderCard(memberId, ctx.callbackQuery.message?.message_id);
    } else if (r.state === "active") {
      await ctx.editMessageText(`ℹ️ Sizda allaqachon faol buyurtma bor:\n📍 ${esc(r.booking?.addressName ?? "")}`, {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard().text("🔄 Holat", "bk:status"),
      });
    } else if (r.state === "throttled") {
      await ctx.editMessageText(`⏳ ${esc(r.message ?? "Bir daqiqa kuting")}`).catch(() => undefined);
    } else if (r.state === "need_pickup") {
      await ctx.editMessageText("📍 Manzil topilmadi — quyidan tanlang:").catch(() => undefined);
      await startBooking(ctx);
    } else if (r.state === "confirm_required") {
      await ctx.editMessageText(`⚠️ ${esc(r.message ?? "Manzilni tasdiqlab chaqiring")}`).catch(() => undefined);
      await startBooking(ctx, { forceFull: true });
    } else {
      await ctx.editMessageText(`⚠️ Yuborilmadi: ${esc(r.message ?? "xatolik")}`, { parse_mode: "HTML" }).catch(() => undefined);
    }
  });

  // "boshqa manzil" — drop into the full picker (GPS / saved / typed)
  bot.callbackQuery("bk:other", async (ctx) => {
    await ctx.answerCallbackQuery();
    const id = String(ctx.from.id);
    const s = sessions.get(id);
    await ctx.editMessageText("📍 Boshqa manzil tanlang:").catch(() => undefined);
    await ctx.reply("📍 Joylashuvingizni yuboring — eng tez yo'l. Yoki manzilni tanlang/yozing 👇", { reply_markup: pickupKeyboard() });
    if (s?.addresses.length) await ctx.reply("⭐ Tez tanlash:", { reply_markup: addressKb(s.addresses) });
  });

  bot.hears("✍️ Manzil yozish", async (ctx) => {
    const s = sessions.get(String(ctx.from!.id));
    if (!s) return;
    s.awaitingText = true;
    await ctx.reply("✍️ Manzilni yozing (masalan: <b>Bunyodkor 12</b>):", { parse_mode: "HTML" });
  });
  bot.hears("❌ Bekor", async (ctx) => {
    sessions.delete(String(ctx.from!.id));
    // restore the MAIN menu — otherwise the pickup reply-keyboard (Joylashuv/Manzil/Bekor)
    // stays stuck and the user can't get back to the menu (the "loop").
    const me = await getMe(String(ctx.from!.id));
    await ctx.reply("❌ Bekor qilindi.", { reply_markup: await mainMenu(me?.type === "driver", String(ctx.from?.id ?? "")) });
  });

  // Uber pattern #1: GPS pickup. Works even WITHOUT first pressing «🚕 Taxi chaqirish» — a linked
  // rider can just share a location and the bot books from there. Nearest saved address (≤1.2 km)
  // → its real addressId; otherwise the EXACT GPS (addressId 0 + lat/lng) so the driver gets the pin.
  bot.on("message:location", async (ctx) => {
    const s = await ensureSession(ctx);
    if (!s) return;
    const { latitude, longitude } = ctx.message.location;
    const near = nearestAddress(s.addresses, latitude, longitude);
    if (near) {
      // Keep addressId 0 + the EXACT shared coords so the driver routes to the PRECISE pin. We borrow
      // the nearby place's NAME only (display) — NOT its id. (Sending the saved address's id made kas
      // navigate to that address, ~1 km off; «<place> yaqinida» + raw coords = friendly name + exact pin.)
      s.pickup = { id: 0, name: near.name, lat: latitude, lng: longitude, surcharge: near.surcharge };
      await ctx.reply(`📍 Sizga eng yaqin: <b>${esc(near.name)}</b>`, { parse_mode: "HTML" });
    } else {
      s.pickup = { id: 0, name: "📍 Yuborilgan joylashuv", lat: latitude, lng: longitude };
    }
    await showConfirm(ctx, s);
  });

  bot.callbackQuery("bk:status", async (ctx) => {
    await ctx.answerCallbackQuery("Yangilandi");
    const me = await getMe(String(ctx.from.id));
    if (!me?.member.phone) return;
    const b = await getDataSource().getActiveBooking(me.member.phone).catch(() => null);
    if (!b) {
      await ctx.editMessageText("Sizda faol buyurtma yo'q.");
      return;
    }
    await ctx.editMessageText(renderTracking(b), { parse_mode: "HTML", reply_markup: trackingKb(b) });
  });

  bot.callbackQuery("bk:loc", async (ctx) => {
    const me = await getMe(String(ctx.from.id));
    const b = me?.member.phone ? await getDataSource().getActiveBooking(me.member.phone).catch(() => null) : null;
    if (b?.driver?.lat && b.driver?.lng) {
      await ctx.answerCallbackQuery();
      await ctx.replyWithLocation(b.driver.lat, b.driver.lng);
    } else {
      await ctx.answerCallbackQuery("Joylashuv hozir mavjud emas");
    }
  });

  // 📞 en-route call: surface the driver's number as tap-to-call text
  // (tel: inline buttons are rejected by Telegram; plain numbers auto-linkify on mobile).
  bot.callbackQuery("bk:call", async (ctx) => {
    const me = await getMe(String(ctx.from.id));
    const b = me?.member.phone ? await getDataSource().getActiveBooking(me.member.phone).catch(() => null) : null;
    if (b?.driver?.phone) {
      await ctx.answerCallbackQuery();
      await ctx.reply(`📞 Haydovchi: ${b.driver.phone}\n<i>Raqamga bosib qo'ng'iroq qiling</i>`, { parse_mode: "HTML" });
    } else {
      await ctx.answerCallbackQuery({ text: "Haydovchi raqami hozir mavjud emas", show_alert: true });
    }
  });

  // 🛡 live family-tracking share (trackcta): mint the ACTIVE-ONLY public token and hand the rider
  // a ready-to-forward message. The page itself carries the viral CTA (birinchi safar bepul) —
  // this button is the loop's entry point. Token is unguessable + 6h TTL + active-only (trackService).
  bot.callbackQuery("bk:track", async (ctx) => {
    const me = await getMe(String(ctx.from.id));
    const b = me?.member.phone ? await getDataSource().getActiveBooking(me.member.phone).catch(() => null) : null;
    if (!me || !b) {
      await ctx.answerCallbackQuery({ text: "Faol safar topilmadi", show_alert: true });
      return;
    }
    const { createTrackToken } = await import("../services/trackService");
    const token = await createTrackToken(me.member.id).catch(() => null);
    if (!token) {
      await ctx.answerCallbackQuery({ text: "Havola hozir tayyorlanmadi — qayta urinib ko'ring", show_alert: true });
      return;
    }
    const url = `${env.TELEGRAM_WEBAPP_URL.replace(/\/+$/, "")}/?track=${token}`;
    const car = b.driver?.carNumber;
    const share = `🛡 Men BirJoy taksida ketyapman${car ? ` — mashina ${car}` : ""}. Jonli kuzating: ${url}`;
    await ctx.answerCallbackQuery();
    await ctx.reply(
      `🛡 <b>Jonli kuzatuv havolasi tayyor</b>\n\n${url}\n\n<i>Oilangizga yuboring — safar tugaguncha mashinani jonli xaritada ko'rib turishadi.</i>`,
      {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard().url(
          "📤 Oilaga yuborish",
          `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(share)}`,
        ),
      },
    );
  });

  // ⏱ ETA-guess from the live ride card (one guess per ride, +50 if right)
  bot.callbackQuery("noop", (ctx) => ctx.answerCallbackQuery());
  bot.callbackQuery(/^guess:(lt6|6-9|10-14|15p)$/, async (ctx) => {
    const memberId = await getMemberId(String(ctx.from.id));
    if (!memberId) {
      await ctx.answerCallbackQuery();
      return;
    }
    const band = ctx.match[1] === "lt6" ? "<6" : ctx.match[1] === "15p" ? "15+" : ctx.match[1]!;
    const { getActiveBookingFor } = await import("../services/bookingService");
    const active = await getActiveBookingFor(memberId).catch(() => null);
    if (!active || active.status !== "started") {
      await ctx.answerCallbackQuery({ text: "Taxmin faqat safar paytida 🚕" });
      return;
    }
    const { prisma } = await import("../db");
    try {
      await prisma.rideGuess.create({ data: { memberId, bookingId: active.id, guessBand: band } });
      await ctx.answerCallbackQuery({ text: `⏱ Taxminingiz: ${band} daqiqa — yetib borganda bilamiz!` });
    } catch {
      await ctx.answerCallbackQuery({ text: "Bu safarga taxmin qilingansiz ✅" });
    }
  });

  // 🚖 pay/tip ANY driver by car number: type the plate → driver's name shows → send tangas
  // (lands in the driver's tanga balance; they top up / cash out from there).
  const startPayDriver = async (ctx: Context): Promise<void> => {
    const me = await getMe(String(ctx.from!.id));
    if (!me?.member.phone) {
      await ctx.reply("Avval /start orqali raqamingizni ulang.");
      return;
    }
    payDriver.set(String(ctx.from!.id), true);
    const kb = canWebApp ? new InlineKeyboard().webApp("🚀 Mini App'da to'lash", webAppUrl("tip")) : undefined;
    await ctx.reply("🚖 <b>Haydovchiga to'lash</b>\n\nMashina raqamini yozing (masalan <code>01A123BC</code>):\n<i>Bekor — /start</i>", { parse_mode: "HTML", reply_markup: kb });
  };
  bot.command("haydovchi", (ctx) => startPayDriver(ctx));
  bot.hears("🙏 Haydovchiga to'lash", (ctx) => startPayDriver(ctx)); // main-menu one-tap alias (registered before message:text)
  bot.callbackQuery("paydrv:start", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    await startPayDriver(ctx);
  });
  // car-number entry — registered BEFORE the address-search text handler below; falls through
  // (next) when the user isn't in the pay-driver flow.
  bot.on("message:text", async (ctx, next) => {
    const id = String(ctx.from!.id);
    if (!payDriver.get(id)) return next();
    const text = ctx.message.text.trim();
    if (text.startsWith("/")) {
      payDriver.delete(id);
      return next();
    }
    const carNum = text.toUpperCase().replace(/\s+/g, "");
    const { prisma } = await import("../db");
    const me = await getMe(id);
    const driver = await prisma.member.findFirst({ where: { type: "driver", carNumber: carNum }, select: { id: true, fullName: true, carNumber: true } });
    if (!driver || driver.id === me?.member.id) {
      await ctx.reply("❌ Bu raqamli haydovchi topilmadi. Qayta yozing (yoki /start bilan bekor):");
      return;
    }
    payDriver.delete(id);
    await ctx.reply(`🚖 Haydovchi: <b>${esc(driver.fullName)}</b> · <code>${esc(driver.carNumber ?? "")}</code>\n\nQancha tanga yuborasiz?`, {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard()
        .text("🙏 500", `tip:${driver.id}:500`)
        .text("🙏 1 000", `tip:${driver.id}:1000`)
        .text("🙏 2 000", `tip:${driver.id}:2000`),
    });
  });

  // 🙏 tip the LAST ride's driver anytime — not just on the finish card (which scrolls away).
  // Finds the driver via the preserved lastBookingCar; reuses the tip:<driver>:<amount> flow.
  bot.command("rahmat", async (ctx) => {
    const me = await getMe(String(ctx.from!.id));
    if (!me?.member.phone) {
      await ctx.reply("Avval telefon raqamingizni ulang — /start.");
      return;
    }
    const { prisma } = await import("../db");
    const mem = await prisma.member.findUnique({ where: { id: me.member.id }, select: { lastBookingCar: true } });
    const driver = mem?.lastBookingCar
      ? await prisma.member.findFirst({ where: { type: "driver", carNumber: mem.lastBookingCar }, select: { id: true, fullName: true } })
      : null;
    if (!driver || driver.id === me.member.id) {
      await ctx.reply("🙏 Oxirgi safaringiz haydovchisi topilmadi.\nSafar qilganingizdan keyin haydovchiga choychaqa (tanga) yubora olasiz 🚕");
      return;
    }
    await ctx.reply(
      `🙏 <b>${esc(driver.fullName)}</b>ga choychaqa yuboring — sizning tangalaringizdan ko'chadi, haydovchi so'mga yecha oladi:`,
      {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard().text("🙏 500", `tip:${driver.id}:500`).text("🙏 1 000", `tip:${driver.id}:1000`).text("🙏 2 000", `tip:${driver.id}:2000`),
      },
    );
  });

  // 🙏 tip the driver after a ride — rider's own coins move, closed-loop
  bot.callbackQuery(/^tip:(\d+):(\d+)$/, async (ctx) => {
    const riderId = await getMemberId(String(ctx.from.id));
    if (!riderId) {
      await ctx.answerCallbackQuery();
      return;
    }
    const driverId = Number(ctx.match[1]);
    const amount = Number(ctx.match[2]);
    const { transfer } = await import("../services/transferService");
    const r = await transfer(riderId, "", amount, { kind: "tip", toMemberId: driverId });
    if (r.ok) {
      await ctx.answerCallbackQuery({ text: `🙏 ${formatNumber(amount)} tanga yuborildi!` });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => undefined);
      await ctx.reply(`🙏 Rahmat! <b>${esc(r.toName ?? "Haydovchi")}</b>ga <b>${formatNumber(amount)} tanga</b> yuborildi 🚗`, { parse_mode: "HTML" }).catch(() => undefined);
      // tell the driver
      const { prisma } = await import("../db");
      const tg = await prisma.telegramUser.findUnique({ where: { memberId: driverId } });
      if (tg) {
        await ctx.api
          .sendMessage(tg.id, `🙏 Mijoz sizga <b>+${formatNumber(r.received)} tanga</b> rahmat yubordi! 🚗\n«🚗 Haydovchi paneli»da ko'ring.`, { parse_mode: "HTML" })
          .catch(() => undefined);
      }
    } else {
      const msgs: Record<string, string> = {
        insufficient: "Tanga yetarli emas",
        account_too_new: "Hisobingiz hali juda yangi (48 soat kutiladi)",
        daily_sent_cap: "Bugungi o'tkazma limiti tugadi",
        daily_received_cap: "Haydovchining bugungi limiti to'ldi",
        ring: "Bu amal hozircha bloklangan",
      };
      await ctx.answerCallbackQuery({ text: msgs[r.reason ?? ""] ?? "Yuborilmadi", show_alert: true });
    }
  });

  bot.callbackQuery("bk:cancelride", async (ctx) => {
    const memberId = await getMemberId(String(ctx.from.id));
    if (!memberId) {
      await ctx.answerCallbackQuery();
      return;
    }
    const r = await cancelBookingFor(memberId);
    await ctx.answerCallbackQuery({ text: r.ok ? "Bekor qilindi" : r.reason === "too_late" ? "Haydovchi keldi — bo'lmaydi" : "Bekor qilinmadi", show_alert: true });
    if (r.ok) await ctx.editMessageText("✖ Buyurtma bekor qilindi.").catch(() => undefined);
  });

  bot.callbackQuery("bk:last", async (ctx) => {
    await ctx.answerCallbackQuery();
    const id = String(ctx.from.id);
    const s = sessions.get(id);
    const memberId = await getMemberId(id);
    const last = memberId ? await getQuickPickup(memberId).catch(() => null) : null;
    if (!s || !last) return;
    s.pickup = { id: last.id, name: last.name, lat: last.lat, lng: last.lng };
    await showConfirm(ctx, s);
  });

  bot.callbackQuery(/^bk:addr:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const s = sessions.get(String(ctx.from.id));
    const addr = s?.addresses[Number(ctx.match[1])];
    if (!s || !addr) return;
    s.pickup = addr;
    await showConfirm(ctx, s);
  });

  bot.callbackQuery("bk:cancel", async (ctx) => {
    sessions.delete(String(ctx.from.id));
    await ctx.answerCallbackQuery("Bekor qilindi");
    await ctx.editMessageText("❌ Buyurtma bekor qilindi.").catch(() => undefined);
    // bring the main menu back (the pickup reply-keyboard would otherwise stay stuck)
    const me = await getMe(String(ctx.from.id));
    await ctx.reply("🏠 Asosiy menyu 👇", { reply_markup: await mainMenu(me?.type === "driver", String(ctx.from?.id ?? "")) }).catch(() => undefined);
  });

  bot.callbackQuery("bk:confirm", async (ctx) => {
    await ctx.answerCallbackQuery();
    const id = String(ctx.from.id);
    const s = sessions.get(id);
    if (!s?.pickup) return;
    // persist the 1-tap memory (survives restarts; next time = one button)
    const memberId = await getMemberId(id);
    if (memberId) await rememberPickup(memberId, s.pickup, "bot").catch(() => undefined);
    // Send the exact lat/lng WHENEVER we have them — even with a snapped addressId — so kas dispatches
    // to the precise pin, not the snapped address. (Was gated on id===0, which dropped the coords the
    // moment the pin was near a saved address → the driver went to the address, ~1 km off.)
    const hasGps = s.pickup.lat != null && s.pickup.lng != null;
    const req = {
      clientName: s.clientName,
      addressName: s.pickup.name,
      addressId: s.pickup.id,
      phoneNumber: s.phone,
      additionalPayment: 0,
      ...(hasGps ? { addressLatitude: s.pickup.lat, addressLongitude: s.pickup.lng } : {}),
    };
    sessions.delete(id);

    if (!env.bookingLive) {
      await ctx.editMessageText(`✅ <b>Buyurtma ko'rsatildi</b>\n📍 ${esc(req.addressName)}\n\n<i>(Hozir test rejimi)</i>`, { parse_mode: "HTML" });
      return;
    }
    // A1 (audit P0): this confirm used to call kas DIRECTLY — no active-ride guard, no atomic
    // slot — so a fast double-tap (both callbacks in flight before sessions.delete) dispatched
    // TWO real taxis, and a stale session could dispatch alongside an already-active ride.
    // Same shields as the Mini App / 1-tap path now; the dispatch payload itself is unchanged.
    if (!memberId) {
      await ctx.editMessageText("⚠️ Avval raqamingizni ulang — /start dan «📱 Raqamni ulashish».");
      return;
    }
    await ctx.editMessageText("⏳ Buyurtma yuborilyapti…");
    const already = await getActiveBookingFor(memberId).catch(() => null);
    if (already) {
      await ctx.editMessageText(`ℹ️ Sizda faol buyurtma bor:\n📍 ${esc(already.addressName ?? "")}\n\n«📍 Buyurtmam» — holatini ko'ring.`, { parse_mode: "HTML" });
      return;
    }
    const slot = await claimDispatchSlot(memberId);
    if (!slot.ok) {
      await ctx.editMessageText("⏳ Hozirgina buyurtma yuborilgan — bir daqiqa kuting.");
      return;
    }
    const res = await getDataSource()
      .createBooking(req)
      .catch((e) => ({ ok: false as const, message: e instanceof Error ? e.message : String(e) }));
    if (!res.ok) await releaseDispatchSlot(memberId, slot.prev);
    if (res.ok) {
      await ctx.editMessageText(`✅ <b>Buyurtma qabul qilindi!</b>\n📍 ${esc(req.addressName)}\n\n🔍 Haydovchi qidirilyapti — holat shu yerda <b>jonli</b> yangilanadi 👇`, {
        parse_mode: "HTML",
      });
      // hand this card to the live sweep: it EDITS this same message through every status
      // (driver, ETA, moving pin, finish + fare/bonus). No separate card, no manual refresh.
      await markBotOrderCard(memberId, ctx.callbackQuery.message?.message_id);
      // parity with createBookingFor: arm the instant-status socket at CREATION (take lands ~1-2s)
      void import("../services/kasClientSocket").then(({ armInstant }) => armInstant(memberId, req.phoneNumber)).catch(() => undefined);
    } else {
      await ctx.editMessageText(`⚠️ Yuborilmadi: ${esc(res.message ?? "xatolik")}`, { parse_mode: "HTML" });
    }
  });

  // free-text address. (a) mid-wizard «✍️ Manzil yozish» → search & pick (existing). (b) NO wizard:
  // a linked rider just TYPED an address with no «🚕 Taxi chaqirish» first → search & pick. Heavily
  // gated (looksLikeAddress + must resolve in kas) so greetings/non-addresses fall through untouched.
  bot.on("message:text", async (ctx, next) => {
    const id = String(ctx.from!.id);
    const s = sessions.get(id);
    const text = ctx.message.text.trim();
    if (s?.awaitingText) {
      const results = await resolveAddresses(text);
      if (!results.length) {
        await ctx.reply("Topilmadi. Boshqacha yozib ko'ring:");
        return;
      }
      s.addresses = results;
      s.awaitingText = false;
      await ctx.reply("📍 Manzilni tanlang:", { reply_markup: addressKb(results) });
      return;
    }
    if (s) return next(); // mid-wizard but not awaiting text → leave for other handlers
    if (!looksLikeAddress(text)) return next();
    if (!(await tryAddressBooking(ctx, text))) return next(); // unlinked / no kas match → don't hijack the message
  });
}
