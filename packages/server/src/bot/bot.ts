import { Bot, Context, InlineKeyboard, InputFile, Keyboard } from "grammy";
import { formatNumber } from "@t1067/shared";
import { env } from "../env";
import { prisma } from "../db";
import {
  getAdminStats,
  getLeaderboard,
  getMe,
  getMemberId,
  isAdmin,
  linkByPhone,
  touchTelegramUser,
} from "../services/memberService";
import { dailyCheckIn, spinWheel } from "../services/rewardService";
import { claimMission, getMissions } from "../services/missionService";
import { getBoxStatus, openBox } from "../services/boxService";
import { attachPendingReferral, completeReferral, getReferralInfo, REFERRER_REWARD, REFEREE_REWARD } from "../services/referralService";
import { featureOn } from "../services/featureFlags";
import { getBonusEcon } from "../services/bonusConfig";
import { getWeeklyBoard } from "../services/weeklyService";
import { getEconomy, getHealth, getLiveBookings } from "../services/adminOps";
import { getIntegrity } from "../services/reconciliation";
import type { CashbackDelta } from "../sync/sync";
import { payDriver, registerBooking } from "./booking";
import { registerDriverDebt } from "./driverDebt";
import { registerDriverReports } from "./driverReports";
import { registerCashout } from "./cashout";
import { registerMarket, isInMarketWizard } from "./market";
import { registerIntercity } from "./intercity";
import { registerBroadcast } from "./broadcast";
import type { DriverPanelExtras } from "../services/driverReportService";
import {
  renderBadgeUnlocked,
  renderAccount,
  renderBadges,
  renderCheckIn,
  renderDriverPanel,
  renderDriverRank,
  renderEarnPush,
  renderLeaderboard,
  renderLinkPrompt,
  renderMissions,
  renderNotFound,
  renderProfile,
  renderReferral,
  renderFare,
  renderHelp,
  renderLinked,
  renderReferralWin,
  renderTaken,
  renderWeeklyBlock,
  renderWelcome,
  renderWheel,
} from "./render";
import { getFareConfig } from "../services/clientInfoService";
import { markSeen } from "../services/presence";
import { isTgBanned } from "../services/banService";

const canWebApp = env.TELEGRAM_WEBAPP_URL.startsWith("https://");

// The friend-facing invite message (the text Telegram prepends before the link in the
// share dialog). Single source so every client share point — bot link, bot QR, driver→client
// — reads identically. Hook first (first ride FREE), then value, then CTA. `bonus` = the
// referee's reward (firstRide tanga); it pays out AFTER their first ride, so we say "BEPUL",
// never "hozir oling". UI currency stays "tanga" (project rule), the free-ride hook carries
// the real-money feel for someone who's never heard of tanga.
// Short + warm (owner: less spammy). The rich IMAGE card is carried by the landing URL's OG tags.
const clientInviteText = (bonus: number): string =>
  `🚕 BirJoy — senga ${formatNumber(bonus)} so'm bonus. Bir tap bilan taxi. Qo'shil 👇`;

// Wrap the bot ref-link in the OG landing page (/j/?r=<code>) so Telegram renders a rich poster
// card (KEEP IN SYNC with miniapp/src/telegram.ts inviteLandingUrl). The page forwards ?r → the
// bot's ?start=ref_<code>, so referral capture is unchanged.
const INVITE_LANDING = "https://1067taxi-miniapp.vercel.app/j/";
function inviteLandingUrl(botLink: string): string {
  const m = botLink.match(/(?:start|startapp)=ref_?([a-zA-Z0-9_-]+)/);
  // &v bumps the URL when the OG card content changes → Telegram fetches a FRESH preview
  // instead of showing a stale cached card (v2 = gift-emoji removed). KEEP IN SYNC with miniapp.
  return m && m[1] ? `${INVITE_LANDING}?r=${encodeURIComponent(m[1])}&v=2` : botLink;
}

// Telegram caches the Mini App aggressively BY URL — the owner kept seeing stale builds
// (worst: the persistent Menu Button, whose URL had NO version → permanently cached → the
// old UZ-blocked map → blank). We version the URL (?v=<token>) so Telegram treats each
// release as a brand-new app → guaranteed fresh load. The token AUTO-tracks the live
// frontend: we probe index.html's hashed bundle name at startup, so no manual bump is
// needed on a frontend deploy (the stale "v14" that caused this never auto-updated).
const WEBAPP_BUILD = "v16"; // static fallback if the live-hash probe fails
let webAppVer = WEBAPP_BUILD;
async function refreshWebAppVer(): Promise<void> {
  try {
    const res = await fetch(env.TELEGRAM_WEBAPP_URL);
    // Vite content hashes are base64url → can contain "-" and "_" (e.g. index-BilONG-Z.js).
    // The old [A-Za-z0-9_]+ class missed the hyphen → probe failed → menu button fell back to
    // the stale "v16", so every user opened a cached old build. Include "-" so it always parses.
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
  // If no path yet (e.g. "https://example.com" or "https://example.com?x=1"), ensure a "/" before the query.
  const noPath = !/^https?:\/\/[^/?#]+\/[^?]/.test(u);
  if (noPath) {
    const qi = u.indexOf("?");
    if (qi === -1) u = u.replace(/\/?$/, "/");
    else u = u.slice(0, qi).replace(/\/?$/, "/") + u.slice(qi);
  }
  return u + (u.includes("?") ? "&" : "?") + "v=" + webAppVer + (go ? "&go=" + go : "");
}

// Minimal 2-button menu (2026-07-23 cleanup — the reply keyboard had grown to 8+ rows across
// sessions; owner asked to strip it down to the two things people tap constantly: invite-a-friend
// and call-a-taxi). Everything else (Hamyon/Bonuslar/Reyting/Hisobim/Haydovchiga to'lash/Haydovchi
// paneli/Xizmatlar) still works exactly as before — just reachable via the Telegram "/" commands
// menu (setupBotCommands below) or the /menu inline panel, not as a permanent on-screen button.
// Old cached reply-keyboards on users' phones still fire the old labels — every bot.hears(...) for
// those labels is left in place on purpose (see the "old cached keyboard" comments below), so
// nothing breaks for someone who hasn't reopened the keyboard since before this change.
async function mainMenu(_isDriver = false, _tgId?: string): Promise<Keyboard> {
  const kb = new Keyboard();
  // Row 0 — TOP CTA: invite a friend (refstaged total 500+500+1000 = 2000 tanga).
  kb.text("👥 Do'st chaqirish — +2000 tanga sovg'a");
  kb.row();
  // Row 1 — the one booking entry point. Same label as the historical primary button, so this is
  // a no-op for anyone whose keyboard was already showing it.
  kb.text("🚕 Taxi chaqirish");
  kb.row();
  // Row 2 — discoverability: surface the AI assistant so people know it exists (was invisible).
  kb.text("🤖 Koson AI");
  // is_persistent → the menu stays pinned open (app-like nav); placeholder → modern input hint
  return kb.resized().persistent().placeholder("Menyudan tanlang yoki shunchaki yozing — men tushunaman…");
}

function contactKeyboard(): Keyboard {
  return new Keyboard().requestContact("📱 Raqamni ulashish").resized().oneTime();
}

// Unlinked prompt — ALWAYS offers BOTH paths: the verified «Raqamni ulashish» (reply keyboard)
// AND the «Boshqa raqam» (1067 code) inline button. Previously the inline button only appeared
// on /start, so users reaching the prompt from a menu had no way to link a different number.
async function promptLink(ctx: Context): Promise<void> {
  await ctx.reply(renderLinkPrompt(), { parse_mode: "HTML", reply_markup: contactKeyboard() });
}

function profileOf(src: { username?: string; first_name?: string; last_name?: string; language_code?: string }) {
  return { username: src.username, firstName: src.first_name, lastName: src.last_name, languageCode: src.language_code };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// 🧠 /bilim — "AI'ga ma'lumot ber" one-shot capture: tgId → awaiting the next text as a fact.
const bilimAwaiting = new Set<string>();

// "uyimga taxi" / "hozirgi joyimga" — NOT a place to search: it means the rider's saved 1-tap
// pickup. Route these to the 1-tap button instead of a dead-end address search.
function isHomeRef(q: string): boolean {
  const t = q.toLowerCase().replace(/[''`]/g, "'").trim();
  return /\b(uyim|uyimga|uyga|uyimizga|uyimni|uyum|uyumga|manzilim|joyimga|joyim|hozirgi\s*joy\w*|shu\s*yer\w*|men\s*turgan|turadigan\s*joy)\b/.test(t) || t === "uy" || t === "uyi";
}

// 🔑 in-flight "link a different number via 1067 code" sessions. No phone yet → awaiting the
// number; phone set → awaiting the 4-digit code. Transient (in-memory) by design.
const codeLink = new Map<string, { phone?: string }>();
// 🚫 hard-ban notice throttle: last time we told a banned tgId they're blocked (so a flood of
// messages yields at most one reply per window, not one per message).
const banNoticeAt = new Map<string, number>();
const BAN_NOTICE_THROTTLE_MS = 6 * 3600_000; // 6h
// telegramIds currently typing a new display name (✏️ from the account screen). Transient by design.
const editName = new Set<string>();
// telegramIds awaiting a preferred name right after first link (auto-ask on join).
const pendingNameAfterLink = new Set<string>();
// telegramIds who tapped "🔎 Xizmatlar" and are now expected to type a search query next.
// Transient by design (same pattern as codeLink/editName) — avoids hijacking the global
// free-text/AI-intent catcher for every message, only the ONE reply right after the tap.
const svcSearchWait = new Set<string>();
// telegramIds who tapped "🏪 Bu meniki" on a listing and are now expected to share their contact
// next → tgId maps to the LISTING ID they're claiming. Transient (same pattern as codeLink).
const claimWait = new Map<string, number>();

// A real name starts with a letter (Latin or Cyrillic). Menu buttons all start with an
// emoji, and phone numbers with a digit/+ — so anything NOT starting with a letter is a
// command the user tapped, NOT their name. This stops "🚕 Taxi chaqirish" / "💰 Hamyon"
// etc. from being saved as the display name during the auto-ask-name flow.
function looksLikeName(text: string): boolean {
  return /^[\p{L}]/u.test(text.trim());
}

// Best-effort friendly name from a Telegram user + phone, in priority order:
//   1. first (+ last) name  2. @username  3. "Mijoz ••1234" (phone last 4)
// Returns null if nothing usable (caller keeps the existing default).
function deriveDisplayName(from: { first_name?: string; last_name?: string; username?: string }, phone: string): string | null {
  const full = [from.first_name, from.last_name].filter(Boolean).join(" ").trim();
  if (full.length >= 2) return full.slice(0, 40);
  if (from.username && from.username.length >= 2) return from.username.slice(0, 40);
  const digits = phone.replace(/\D/g, "");
  if (digits.length >= 4) return `Mijoz ••${digits.slice(-4)}`;
  return null;
}

// Auto-set a derived display name ONLY when the member has none yet — never clobber a name
// the user (or a prior link) already chose. Clients only.
async function autoSetDisplayName(memberId: number, from: { first_name?: string; last_name?: string; username?: string }, phone: string): Promise<void> {
  const m = await prisma.member.findUnique({ where: { id: memberId }, select: { displayName: true } }).catch(() => null);
  if (!m || (m.displayName && m.displayName.trim().length > 0)) return;
  const derived = deriveDisplayName(from, phone);
  if (!derived) return;
  const { setDisplayName } = await import("../services/memberService");
  await setDisplayName(memberId, derived).catch(() => undefined);
}

export function createBot(): Bot {
  const bot = new Bot(env.BOT_TOKEN);

  bot.catch((err) => console.error("[bot] error:", err.error));

  // 🚫 HARD-BAN gate — runs FIRST, before presence and every handler. A banned Telegram id gets a
  // single terse notice (throttled so a message-flood can't spam them / us) and the update is
  // dropped: next() is NOT called, so no command, callback or wizard step ever executes for them.
  bot.use(async (ctx, next) => {
    const fid = ctx.from?.id ? String(ctx.from.id) : null;
    if (fid && isTgBanned(fid)) {
      const now = Date.now();
      const last = banNoticeAt.get(fid) ?? 0;
      if (now - last > BAN_NOTICE_THROTTLE_MS) {
        banNoticeAt.set(fid, now);
        if (banNoticeAt.size > 10_000) banNoticeAt.clear(); // bound memory
        await ctx.reply("🚫 Hisobingiz bloklangan. Bot xizmatlaridan foydalanolmaysiz.\nSavol bo'lsa: 1067").catch(() => undefined);
      }
      return; // update dropped — no handler runs
    }
    await next();
  });

  // 🟢 presence: stamp a TRUE last-seen on every genuine inbound update (throttled, fire-and-forget).
  // Runs before all handlers; the honest source for the admin "online" column.
  bot.use(async (ctx, next) => {
    if (ctx.from?.id) markSeen(String(ctx.from.id));
    await next();
  });

  bot.command("start", async (ctx) => {
    const id = String(ctx.from!.id);
    codeLink.delete(id); // /start cancels any pending "link a different number" flow
    payDriver.delete(id); // …and the "pay a driver by car number" flow
    editName.delete(id); // …and a pending "edit my name" flow
    bilimAwaiting.delete(id); // …and a pending /bilim capture
    pendingNameAfterLink.delete(id);
    await touchTelegramUser(id, profileOf(ctx.from!));
    // referral deep link: t.me/<bot>?start=ref_<code> ("reft_" = same code arriving via a shared
    // TrackView live-trip page — identical attach/payout path, tagged for the viral-loop metrics)
    const payload = (typeof ctx.match === "string" ? ctx.match : "").trim();
    const joinerName = esc(ctx.from!.first_name ?? "Yangi mijoz"); // the person who clicked/scanned the invite
    const viaTrack = payload.startsWith("reft_");
    if (payload.startsWith("ref_") || viaTrack) {
      // tell the inviter the moment their link is clicked — "you invited <name>" (the proof they asked for)
      const r = await attachPendingReferral(id, payload.slice(viaTrack ? 5 : 4)).catch(() => ({ attached: false }) as { attached: boolean; referrerTelegramId?: string; startReward?: number });
      if (r.attached && viaTrack) {
        // K-factor numerator: joins that came through a live-track page (count = trackjoin:* rows)
        await prisma.appState
          .upsert({ where: { key: `trackjoin:${id}` }, create: { key: `trackjoin:${id}`, value: new Date().toISOString() }, update: {} })
          .catch(() => undefined);
      }
      if (r.attached && r.referrerTelegramId) {
        const start = r.startReward ?? 0;
        const msg =
          start > 0
            ? `🎉 <b>${joinerName} havolangiz orqali qo'shildi!</b>\n\n👥 Sizga darhol <b>+${formatNumber(start)} tanga</b> tushdi. Do'stingiz raqamini ulasa — yana sovg'a, birinchi safarini qilsa — yana! 🚕`
            : `🎉 <b>Siz ${joinerName}ni taklif qildingiz!</b>\n\n<b>${joinerName}</b> havolangiz orqali botga kirdi. U telefon ulab birinchi safarini qilsa — sizga <b>${formatNumber(REFERRER_REWARD)} tanga</b> tushadi.`;
        await bot.api.sendMessage(r.referrerTelegramId, msg, { parse_mode: "HTML" }).catch(() => undefined);
      }
    }
    if (payload.startsWith("drvdrv_")) {
      // 🚖 driver→driver: a NEW driver candidate arrived via another driver's recruit link. Checked
      // BEFORE drv_ because "drvdrv_" also startsWith "drv_". Payout is deferred to the 10th ride.
      const { attachDriverDriverRecruit } = await import("../services/recruitService");
      const dr = await attachDriverDriverRecruit(id, Number(payload.slice(7))).catch(() => ({ attached: false }) as { attached: boolean; recruiterTelegramId?: string });
      if (dr.attached && dr.recruiterTelegramId) {
        await bot.api
          .sendMessage(
            dr.recruiterTelegramId,
            `🚖 <b>Havolangiz orqali yangi haydovchi nomzodi keldi!</b>\n\n<b>${joinerName}</b> qo'shildi. U haydovchi bo'lib ulanib <b>10 ta safar</b> qilsa — sizga <b>5000 tanga</b>. 🎉`,
            { parse_mode: "HTML" },
          )
          .catch(() => undefined);
      }
    } else if (payload.startsWith("drv_")) {
      const { attachDriverRecruit } = await import("../services/recruitService");
      const r = await attachDriverRecruit(id, Number(payload.slice(4))).catch(() => ({ attached: false }) as { attached: boolean; driverTelegramId?: string; startReward?: number });
      // immediate driver feedback — "you invited <name>" the moment their QR is scanned
      if (r.attached && r.driverTelegramId) {
        const start = r.startReward ?? 0;
        const msg =
          start > 0
            ? `🎉 <b>${joinerName} QR kodingiz orqali qo'shildi!</b>\n\n🚖 Sizga darhol <b>+${formatNumber(start)} tanga</b> tushdi. U raqamini ulasa — yana sovg'a, har safaridan — ulush! 💰`
            : `🎉 <b>Siz ${joinerName}ni taklif qildingiz!</b>\n\n<b>${joinerName}</b> QR kodingiz orqali qo'shildi. U birinchi safarini qilganda siz <b>500 tanga</b> olasiz, keyin har safaridan ulush. 🚖\n<i>Panelda «⏳ Kutilmoqda» da ko'rinadi.</i>`;
        await bot.api.sendMessage(r.driverTelegramId, msg, { parse_mode: "HTML" }).catch(() => undefined);
      }
    }
    // 🔎 shared listing deep-link (t.me/<bot>?start=svc_<id>) — the person came for one specific
    // business's phone: send that card FIRST, then fall through to the normal onboarding/profile
    // (a brand-new user still needs the menu keyboard + link flow).
    if (payload.startsWith("svc_")) {
      const { sendListingCard } = await import("./xizmatlar");
      await sendListingCard(bot, id, Number(payload.slice(4))).catch(() => undefined);
    }
    // 🏪 XIZMATLAR P4: "Bu meniki" claim (Mini App → bot deep-link) — asks for the SAME
    // Telegram-verified contact-share the whole app already trusts for identity; the
    // message:contact handler below (registered BEFORE the account-link one) checks the match.
    if (payload.startsWith("claim_")) {
      const listingId = Number(payload.slice(6));
      const l = await prisma.serviceListing.findUnique({ where: { id: listingId }, select: { status: true, ownerTgId: true, name: true } }).catch(() => null);
      if (!l || l.status !== "active") {
        await ctx.reply("😔 Bu xizmat topilmadi yoki endi faol emas.");
      } else if (l.ownerTgId != null) {
        await ctx.reply("Bu xizmat allaqachon boshqa foydalanuvchi tomonidan da'vo qilingan.");
      } else {
        claimWait.set(id, listingId);
        await ctx.reply(
          `🏪 <b>«${esc(l.name)}» — bu meniki?</b>\n\nTasdiqlash uchun ro'yxatdagi telefon raqamini ulashing — faqat mos kelsa xizmat sizga biriktiriladi.`,
          { parse_mode: "HTML", reply_markup: contactKeyboard() },
        );
      }
      return;
    }
    // 🛍 shared PRODUCT deep-link (t.me/<bot>?start=shop_<id>) — richer than svc_: sends the cover
    // photo + a button that opens the Mini App straight on that product. Bare "shop" = whole tab.
    if (payload.startsWith("shop_")) {
      const { sendProductCard } = await import("./shop");
      await sendProductCard(bot, id, Number(payload.slice(5))).catch(() => undefined);
    } else if (payload === "shop") {
      const { sendShopCard } = await import("./shop");
      await sendShopCard(bot, id).catch(() => undefined);
    }
    const me = await getMe(id);
    if (me) {
      await ctx.reply(renderProfile(me), { parse_mode: "HTML", reply_markup: await mainMenu(me.type === "driver", String(ctx.from?.id ?? "")) });
    } else {
      // Birinchi kirish — BITTA chiroyli ekran: katta «📱 Raqamni ulashish» tugmasi (asosiy,
      // soda). «Boshqa raqam» yo'li endi welcome ichidagi /boshqaraqam ipi (avvalgi 3 ta stacked
      // xabar o'rniga). Ega tilagi: «birinchi marta kirganda chiroyli + juda soda».
      // Hook FAQAT welcomebonus flag yonganda ko'rinadi — to'lanmaydigan va'da bermaymiz.
      const wb = (await featureOn("welcomebonus")) ? ((await getBonusEcon()).firstRide ?? REFEREE_REWARD) : 0;
      await ctx.reply(renderWelcome(ctx.from!.first_name ?? "do'st", wb), { parse_mode: "HTML", reply_markup: contactKeyboard() });
    }
    // 📌 always-visible entry: a one-tap «Ochish» web-app card, PINNED to the top of the chat the
    // FIRST time only (silent). The ☰ Menu button is always there too; this pin makes the app the
    // first thing a user sees and keeps it at the top. Re-/start never re-pins (apppinned:<id>).
    if (canWebApp) {
      const firstPin = await prisma.appState.create({ data: { key: `apppinned:${id}`, value: "1" } }).then(() => true).catch(() => false);
      if (firstPin) {
        const card = await ctx
          .reply("🚖 <b>BirJoy — bir bosishda taxi!</b>\nChiqishdan OLDIN narxni bilasiz + har safardan tanga qaytadi.\nManzilni tanlang, jonli xaritada haydovchini kuzating 👇", {
            parse_mode: "HTML",
            reply_markup: new InlineKeyboard().webApp("🚕 Ilovani ochish", webAppUrl()),
          })
          .catch(() => null);
        if (card) await ctx.api.pinChatMessage(ctx.chat!.id, card.message_id, { disable_notification: true }).catch(() => undefined);
      }
    }
  });

  const handleLink = async (ctx: Context, phone: string) => {
    const id = String(ctx.from!.id);
    await ctx.reply("🔎 Tekshiryapman…");
    const res = await linkByPhone(id, phone, profileOf(ctx.from!));
    if (res.status === "linked") {
      const me = await getMe(id);
      const role = res.type === "driver" ? "Haydovchi" : "Mijoz";
      await ctx.reply(renderLinked(res.fullName ?? "Mijoz", role), { parse_mode: "HTML", reply_markup: await mainMenu(res.type === "driver", String(ctx.from?.id ?? "")) });
      // Auto-derive a friendly display name (no fragile "type your name" prompt that captured
      // menu-button taps): Telegram first+last name → @username → phone's last 4 digits.
      // Only for clients, and only if they don't already have a user-set name. Silent — they can
      // change it anytime via Hisobim → ✏️ Ismni o'zgartirish.
      if (res.type === "client" && res.memberId) await autoSetDisplayName(res.memberId, ctx.from!, phone);
      if (res.welcomeBonus) {
        await ctx.reply(`🎁 <b>Xush kelibsiz! Sovg'a: +${formatNumber(res.welcomeBonus)} tanga</b> hisobingizga tushdi 🚕\nIlovada ishlating yoki safar qiling.`, { parse_mode: "HTML" }).catch(() => undefined);
      }
      // pay out a pending referral (this user joined via someone's invite)
      if (res.memberId) {
        const credit = await completeReferral(id, res.memberId).catch(() => null);
        if (credit) {
          // friend: only promise an on-ride bonus when there IS one (legacy, or staged w/o join-welcome).
          // In STAGED with the join-welcome ON, the friend already saw their +5000 message above.
          if (credit.refereeReward > 0) {
            await ctx
              .reply(
                `✅ Do'st taklifi qabul qilindi!\nBirinchi safaringizdan keyin <b>+${formatNumber(credit.refereeReward)} tanga</b> olasiz 🚕`,
                { parse_mode: "HTML" },
              )
              .catch(() => undefined);
          }
          // inviter: STAGED → "raqam ulandi, +refShare now, +refRide on ride"; LEGACY → the win card.
          if (credit.staged && credit.shareReward > 0) {
            const rideMore =
              credit.referrerReward > 0 ? ` Birinchi safarini qilsa — yana <b>+${formatNumber(credit.referrerReward)} tanga</b>! 🚕` : "";
            await ctx.api
              .sendMessage(
                credit.referrerTelegramId,
                `📱 <b>Do'stingiz raqamini uladi!</b>\n\n👥 Sizga <b>+${formatNumber(credit.shareReward)} tanga</b> tushdi.${rideMore}`,
                { parse_mode: "HTML" },
              )
              .catch(() => undefined);
          } else if (!credit.staged && credit.referrerReward > 0) {
            await ctx.api
              .sendMessage(credit.referrerTelegramId, renderReferralWin(credit.referrerReward), { parse_mode: "HTML" })
              .catch(() => undefined);
          }
        }
        // 🚖 driver-QR staged: if this client arrived via a driver's QR, pay the driver the share-stage reward.
        const { completeDriverRecruitShare } = await import("../services/recruitService");
        const drv = await completeDriverRecruitShare(id, res.memberId).catch(() => null);
        if (drv?.driverTelegramId && drv.shareReward > 0) {
          await ctx.api
            .sendMessage(
              drv.driverTelegramId,
              `📱 <b>QR-mijozingiz raqamini uladi!</b>\n\n🚖 Sizga <b>+${formatNumber(drv.shareReward)} tanga</b> tushdi. Endi har safaridan ulush olasiz! 💰`,
              { parse_mode: "HTML" },
            )
            .catch(() => undefined);
        }
      }
      if (me) await ctx.reply(renderProfile(me), { parse_mode: "HTML", reply_markup: await mainMenu(me.type === "driver", String(ctx.from?.id ?? "")) });
      // Ulangan zahoti ilovani BIR MARTA ko'zga tashlash — "odamlar web app borligini bilmaydi".
      if (canWebApp) {
        await ctx
          .reply("🎮 <b>BirJoy ilovasi ham bor!</b>\nJonli xarita · taxi · hamyon — hammasi bitta joyda 👇", {
            parse_mode: "HTML",
            reply_markup: new InlineKeyboard().webApp("🚕 Ilovani ochish", webAppUrl()),
          })
          .catch(() => undefined);
      }
    } else if (res.status === "banned") {
      await ctx.reply("🚫 Bu raqam bloklangan. Bot xizmatlaridan foydalanolmaysiz.\nSavol bo'lsa: 1067");
    } else if (res.status === "taken") {
      await ctx.reply(renderTaken(), { parse_mode: "HTML" });
    } else {
      await ctx.reply(renderNotFound(), { parse_mode: "HTML" });
    }
  };

  // 🏪 XIZMATLAR P4 claim — checked FIRST (registered before the account-link contact handler
  // below) so a listing-claim in progress doesn't get swallowed by the generic link flow.
  // Falls through via next() for every ordinary contact-share (the overwhelming majority).
  bot.on("message:contact", async (ctx, next) => {
    const id = String(ctx.from!.id);
    const listingId = claimWait.get(id);
    if (listingId === undefined) return next();
    claimWait.delete(id);
    const contact = ctx.message.contact;
    if (contact.user_id !== ctx.from!.id) {
      await ctx.reply(
        "⚠️ Faqat <b>o'z</b> raqamingizni ulashing — pastdagi «📱 Raqamni ulashish» tugmasi orqali.",
        { parse_mode: "HTML" },
      );
      return;
    }
    const { claimListing } = await import("../services/serviceDirectory");
    const r = await claimListing(listingId, id, contact.phone_number);
    const kb = await mainMenu(false, id);
    if (r.ok) {
      await ctx.reply(
        `✅ <b>Tabriklaymiz!</b> «${esc(r.name ?? "")}» endi sizga biriktirildi.\n\n«🚀 Ilova» → Xizmatlar → «Mening xizmatlarim»da ko'rasiz.`,
        { parse_mode: "HTML", reply_markup: kb },
      );
    } else {
      const msg =
        r.reason === "phone_mismatch"
          ? "❌ Bu raqam ro'yxatdagi telefon bilan mos kelmadi — faqat ro'yxatdagi raqam egasi da'vo qilishi mumkin."
          : r.reason === "already_claimed"
            ? "❌ Bu xizmat allaqachon boshqa foydalanuvchi tomonidan da'vo qilingan."
            : "❌ Xizmat topilmadi.";
      await ctx.reply(msg, { parse_mode: "HTML", reply_markup: kb });
    }
  });

  bot.on("message:contact", async (ctx) => {
    const contact = ctx.message.contact;
    // SECURITY: accept ONLY the user's OWN Telegram-verified number. The «Raqamni ulashish»
    // button always sets contact.user_id = the sharer; a MANUALLY-added contact (someone else's
    // number) has no/other user_id → reject. This is the identity proof — you can only register
    // the number Telegram confirmed is yours, so nobody can claim another person's account.
    if (contact.user_id !== ctx.from!.id) {
      await ctx.reply(
        "⚠️ Faqat <b>o'z</b> raqamingizni — pastdagi «📱 Raqamni ulashish» tugmasi orqali ulashing.\n<i>Qo'lda kiritilgan begona raqam qabul qilinmaydi.</i>",
        { parse_mode: "HTML", reply_markup: contactKeyboard() },
      );
      return;
    }
    await touchTelegramUser(String(ctx.from!.id), profileOf(ctx.from!));
    await handleLink(ctx, contact.phone_number);
  });

  // ── 🔑 link a DIFFERENT number via a 1067-issued 4-digit code (Telegram ≠ 1067 number) ──
  const startCodeLink = async (ctx: Context): Promise<void> => {
    codeLink.set(String(ctx.from!.id), {});
    await ctx.reply(
      "📱 <b>Boshqa raqam ulash</b>\n\nTaksida ro'yxatdan o'tgan raqamingizni yozing (masalan <code>+998901234567</code>):\n<i>Bekor qilish — /start</i>",
      { parse_mode: "HTML" },
    );
  };
  bot.command("boshqaraqam", (ctx) => startCodeLink(ctx));
  bot.callbackQuery("clink:start", async (ctx) => {
    await ctx.answerCallbackQuery();
    await startCodeLink(ctx);
  });

  // 📷 Photo upload — two paths:
  //  (A) ADMIN sends a photo with caption `/photo 70A111AA` → directly approved + set live.
  //  (B) A linked DRIVER sends a plain photo → parked as PENDING (anti-abuse: random/inappropriate
  //      photos never reach riders) + admins get the photo with ✅/❌ buttons. Drivers cannot delete
  //      the approved photo — only admins replace/clear it.
  // Telegram hosts the bytes; we persist only the ~30-char file_id → server disk + bandwidth = 0.
  bot.on(":photo", async (ctx) => {
    const id = String(ctx.from!.id);
    const photos = ctx.message?.photo ?? [];
    if (!photos.length) return;
    const biggest = photos[photos.length - 1]!; // largest size variant

    // (A) admin direct-set via «/photo <car>» caption
    if (isAdmin(id)) {
      const m = /^\/photo(?:\s+|@\S+\s+)([A-Za-z0-9]+)/i.exec((ctx.message?.caption ?? "").trim());
      if (!m) return; // admin sent an unrelated photo
      const carNum = m[1]!.toUpperCase();
      const driver = await prisma.member.findFirst({
        where: { type: "driver", carNumber: { equals: carNum, mode: "insensitive" } },
        select: { id: true, fullName: true, carNumber: true },
      });
      if (!driver) { await ctx.reply(`❌ <b>${esc(carNum)}</b> raqamli haydovchi topilmadi.`, { parse_mode: "HTML" }); return; }
      await prisma.member.update({ where: { id: driver.id }, data: { photoFileId: biggest.file_id, photoUrl: null, photoPendingFileId: null } });
      await ctx.reply(`✅ <b>Rasm saqlandi</b>\n\n${esc(driver.fullName)} · <code>${esc(driver.carNumber ?? "")}</code>\n<i>Endi xaritali buyurtmada mijozlarga ko'rsatiladi.</i>`, { parse_mode: "HTML" });
      return;
    }

    // (B) driver self-submit → pending + notify admins. Light lookup (no kas hit).
    const tu = await prisma.telegramUser.findUnique({ where: { id }, select: { member: { select: { id: true, type: true, fullName: true, carNumber: true } } } });
    const dm = tu?.member;
    if (dm?.type !== "driver") return; // not a driver → ignore (regular client photos)
    const { submitPendingDriverPhoto } = await import("../services/driverPhotoService");
    await submitPendingDriverPhoto(dm.id, biggest.file_id);
    await ctx.reply("📷 <b>Rasmingiz qabul qilindi!</b>\n\n<i>Administrator tasdiqlagach mijozlarga ko'rsatiladi. Tez orada.</i>", { parse_mode: "HTML" });
    const kb = new InlineKeyboard().text("✅ Tasdiqlash", `dphoto:ok:${dm.id}`).text("❌ Rad etish", `dphoto:no:${dm.id}`);
    const cap = `📷 <b>Haydovchi rasm yubordi</b>\n${esc(dm.fullName)} · <code>${esc(dm.carNumber ?? "")}</code>`;
    for (const adminId of env.adminIds) {
      await bot.api.sendPhoto(adminId, biggest.file_id, { caption: cap, parse_mode: "HTML", reply_markup: kb }).catch(() => undefined);
    }
  });
  // ✅/❌ admin moderation of a pending driver photo
  bot.callbackQuery(/^dphoto:(ok|no):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    if (!isAdmin(String(ctx.from!.id))) return;
    const action = ctx.match![1];
    const memberId = Number(ctx.match![2]);
    const { approveDriverPhoto, rejectDriverPhoto } = await import("../services/driverPhotoService");
    if (action === "ok") {
      const r = await approveDriverPhoto(memberId);
      if (!r) { await ctx.editMessageCaption({ caption: "⚠️ Pending rasm yo'q (allaqachon ko'rib chiqilgan)." }).catch(() => undefined); return; }
      await ctx.editMessageCaption({ caption: `✅ <b>TASDIQLANDI</b> — ${esc(r.fullName)}`, parse_mode: "HTML" }).catch(() => undefined);
      if (r.telegramId) await bot.api.sendMessage(r.telegramId, "✅ <b>Rasmingiz tasdiqlandi!</b>\nEndi mijozlar safar paytida sizni ko'radi. Rahmat! 🚖", { parse_mode: "HTML" }).catch(() => undefined);
    } else {
      const r = await rejectDriverPhoto(memberId);
      await ctx.editMessageCaption({ caption: `❌ <b>RAD ETILDI</b> — ${esc(r?.fullName ?? "")}`, parse_mode: "HTML" }).catch(() => undefined);
      if (r?.telegramId) await bot.api.sendMessage(r.telegramId, "❌ <b>Rasmingiz qabul qilinmadi.</b>\nIltimos, yuzingiz aniq ko'rinadigan oddiy rasm yuboring (selfie). Qayta yuboring 🙏", { parse_mode: "HTML" }).catch(() => undefined);
    }
  });
  // 📨 Broadcast «upload your photo» to every linked driver who has no approved photo yet.
  bot.command("rasmsorov", async (ctx) => {
    if (!isAdmin(String(ctx.from!.id))) return;
    const { driversNeedingPhoto } = await import("../services/driverPhotoService");
    const targets = await driversNeedingPhoto();
    await ctx.reply(`📨 ${targets.length} ta rasmsiz haydovchiga so'rov yuborilmoqda…`);
    let sent = 0;
    for (const t of targets) {
      const ok = await bot.api
        .sendMessage(
          t.telegramId,
          "📸 <b>Rasmingizni yuklang!</b>\n\nHurmatli haydovchi, mijozlar safar paytida sizning rasmingizni ko'radi — bu ishonchni oshiradi va <b>ko'proq buyurtma</b> keltiradi.\n\nShu yerga <b>rasmingizni (selfie) yuboring</b> — administrator tasdiqlagach faollashadi. 🚖",
          { parse_mode: "HTML" },
        )
        .then(() => true)
        .catch(() => false);
      if (ok) sent++;
      await new Promise((r) => setTimeout(r, 60)); // gentle rate-limit
    }
    await ctx.reply(`✅ ${sent}/${targets.length} ta haydovchiga yuborildi.`);
  });
  // 📷 Clear a saved driver photo (rolls back to initials avatar).
  bot.command("photo_clear", async (ctx) => {
    const id = String(ctx.from!.id);
    if (!isAdmin(id)) return;
    const carNum = (typeof ctx.match === "string" ? ctx.match : "").trim().toUpperCase();
    if (!carNum) { await ctx.reply("Foydalanish: <code>/photo_clear 70A111AA</code>", { parse_mode: "HTML" }); return; }
    const driver = await prisma.member.findFirst({
      where: { type: "driver", carNumber: { equals: carNum, mode: "insensitive" } },
      select: { id: true, fullName: true },
    });
    if (!driver) { await ctx.reply(`❌ ${esc(carNum)} topilmadi.`); return; }
    await prisma.member.update({ where: { id: driver.id }, data: { photoFileId: null, photoUrl: null } });
    await ctx.reply(`✅ Rasm o'chirildi: ${esc(driver.fullName)} · ${esc(carNum)}`);
  });

  // admin issues the code (after verifying the caller by phone): /kod +998901234567
  bot.command("kod", async (ctx) => {
    const id = String(ctx.from!.id);
    if (!isAdmin(id)) return; // admin-only (silent for others)
    const phone = (typeof ctx.match === "string" ? ctx.match : "").trim();
    if (!/^\+?\d[\d\s\-()]{8,}$/.test(phone)) {
      await ctx.reply("Foydalanish: <code>/kod +998901234567</code>", { parse_mode: "HTML" });
      return;
    }
    const { generateLinkCode } = await import("../services/verifyCodeService");
    const code = await generateLinkCode(phone);
    await ctx.reply(
      `🔑 <b>${esc(phone)}</b> uchun kod: <b>${code}</b>\n\nMijozga ayting — u botda /boshqaraqam orqali kiritadi. 1 soat amal qiladi.`,
      { parse_mode: "HTML" },
    );
  });

  // code-link text steps — BEFORE the phone-regex below so the number step isn't swallowed by
  // the admin-only typed-number guard. Falls through (next) when not in the code-link flow.
  bot.on("message:text", async (ctx, next) => {
    const id = String(ctx.from!.id);
    const sess = codeLink.get(id);
    if (!sess) return next();
    const text = ctx.message.text.trim();
    if (text.startsWith("/")) {
      codeLink.delete(id);
      return next();
    }
    if (!sess.phone) {
      if (!/^\+?\d[\d\s\-()]{8,}$/.test(text)) {
        await ctx.reply("❌ Raqam noto'g'ri. Masalan: <code>+998901234567</code>", { parse_mode: "HTML" });
        return;
      }
      sess.phone = text;
      await ctx.reply("✅ Raqam qabul qilindi.\n\n📞 Endi <b>1067'ga qo'ng'iroq qiling</b>, <b>4-xonali kod</b> oling va shu yerga yozing:", { parse_mode: "HTML" });
      return;
    }
    if (!/^\d{4}$/.test(text)) {
      await ctx.reply("❌ Kod 4 xonali bo'lishi kerak. Qayta yozing (yoki /start bilan bekor):");
      return;
    }
    const { checkLinkCode } = await import("../services/verifyCodeService");
    const r = await checkLinkCode(sess.phone, text);
    if (!r.ok) {
      const msg: Record<string, string> = {
        no_code: "Bu raqamga kod berilmagan. 1067'ga qo'ng'iroq qiling.",
        expired: "Kod muddati tugadi. 1067'dan yangi kod oling.",
        wrong: "Kod xato. Qayta urinib ko'ring.",
        locked: "Juda ko'p urinish. 1067'dan yangi kod oling.",
      };
      await ctx.reply(`❌ ${msg[r.reason ?? "wrong"]}`);
      if (r.reason !== "wrong") codeLink.delete(id);
      return;
    }
    // verified by 1067 → link the number to this Telegram account
    codeLink.delete(id);
    await touchTelegramUser(id, profileOf(ctx.from!));
    const res = await linkByPhone(id, sess.phone, profileOf(ctx.from!));
    if (res.status === "linked") {
      await ctx.reply(`✅ <b>Raqam tasdiqlandi va ulandi!</b> Xush kelibsiz, ${esc(res.fullName ?? "Mijoz")} 🎉`, { parse_mode: "HTML", reply_markup: await mainMenu(res.type === "driver", String(ctx.from?.id ?? "")) });
      if (res.type === "client" && res.memberId) await autoSetDisplayName(res.memberId, ctx.from!, sess.phone);
      if (res.welcomeBonus) {
        await ctx.reply(`🎁 <b>Sovg'a: +${formatNumber(res.welcomeBonus)} tanga</b> hisobingizga tushdi 🚕`, { parse_mode: "HTML" }).catch(() => undefined);
      }
      const me = await getMe(id);
      if (me) await ctx.reply(renderProfile(me), { parse_mode: "HTML", reply_markup: await mainMenu(me.type === "driver", String(ctx.from?.id ?? "")) });
      // Ulangan zahoti ilovani BIR MARTA ko'zga tashlash — "odamlar web app borligini bilmaydi".
      if (canWebApp) {
        await ctx
          .reply("🎮 <b>BirJoy ilovasi ham bor!</b>\nJonli xarita · taxi · hamyon — hammasi bitta joyda 👇", {
            parse_mode: "HTML",
            reply_markup: new InlineKeyboard().webApp("🚕 Ilovani ochish", webAppUrl()),
          })
          .catch(() => undefined);
      }
    } else if (res.status === "banned") {
      await ctx.reply("🚫 Bu raqam bloklangan. Bot xizmatlaridan foydalanolmaysiz.\nSavol bo'lsa: 1067");
    } else if (res.status === "taken") {
      await ctx.reply("⚠️ Bu raqam allaqachon boshqa akkauntga ulangan. 1067 support bilan bog'laning.");
    } else {
      await ctx.reply("⚠️ Ulashda xatolik. Qayta urinib ko'ring.");
    }
  });

  // SECURITY: typing a number proves NOTHING — anyone (INCLUDING an admin) could type someone
  // else's number and walk into their account. There is NO typed-number auto-link anymore —
  // not even for admins. Two safe paths only: (1) OWN number → the verified «Raqamni ulashish»
  // button (Telegram confirms it's yours); (2) a DIFFERENT number (1067 ≠ Telegram) → «📱 Boshqa
  // raqam» + a 4-digit code that an admin generates in the panel (👑 Boshqaruv → «🔑 Kod
  // yaratish»). Admins manage other people's accounts from the panel (search → relink), never
  // by typing a number here. This closes the "anyone can enter anyone's account" hole.
  bot.hears(/^\+?\d[\d\s\-()]{8,}$/, async (ctx, next) => {
    // BirJoy bug-fix (2026-07-22, ega telefonda topdi): /sotuvchi wizard'ning 2/6-qadami
    // (telefon-raqam so'rash) shu global handler tomonidan ushlab qolinardi — chunki bu handler
    // registerMarket'dan OLDINROQ ro'yxatdan o'tgan va next() chaqirmasdi. Faol wizard-sessiyasi
    // bo'lsa o'tkazib yuboramiz (market.ts o'zi bu matnni to'g'ri qabul qiladi).
    if (isInMarketWizard(String(ctx.from?.id ?? ""))) { await next(); return; }
    await ctx.reply(
      "🔒 Raqamni <b>qo'lda yozib bo'lmaydi</b> — bu xavfsiz emas.\n\n" +
        "• <b>O'z</b> raqamingiz → pastdagi «📱 Raqamni ulashish» tugmasi (Telegram tasdiqlaydi)\n" +
        "• <b>Boshqa</b> raqam (taksi raqamingiz Telegramnikidan farq qilsa) → pastdagi «📱 Boshqa raqam» tugmasi 👇",
      { parse_mode: "HTML", reply_markup: contactKeyboard() },
    );
    // The «📱 Boshqa raqam» button referenced above was only ever sent on /start — a user who
    // typed a number saw the instruction with NO button to tap. Re-offer it right here (one
    // message can't carry both a reply + inline keyboard, so it's a second message, like /start).
    await ctx.reply("Taksi raqamingiz Telegram raqamingizdan <b>boshqa</b> bo'lsa 👇", {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().text("📱 Boshqa raqam (1067 kodi bilan)", "clink:start"),
    });
  });

  const showProfile = async (ctx: Context) => {
    const me = await getMe(String(ctx.from!.id));
    if (!me) {
      await promptLink(ctx);
      return;
    }
    const kb = new InlineKeyboard().text("⚙️ Hisobim / Sozlamalar", "acct:open");
    if (canWebApp) kb.row().webApp("🚀 Hamyon — Mini App", webAppUrl("wallet"));
    await ctx.reply(renderProfile(me), { parse_mode: "HTML", reply_markup: kb });
  };
  // 🚀 Mini App opener. The reply-keyboard «🚀 Ilova» IS a web_app button, but Telegram caches
  // keyboards hard — an OLD cached keyboard sends this label as plain TEXT, so nothing opened
  // ("kirib bo'lmaydi"). Catch the label and open the app via an INLINE web_app button (the
  // reliable path — same mechanism as the working pinned /start card and ☰ menu button).
  bot.hears(/^🚀\s*Ilova/i, async (ctx) => {
    if (!canWebApp) {
      await ctx.reply("Ilova hozircha mavjud emas — /start bilan yangilang.");
      return;
    }
    await ctx.reply("🚖 <b>Ilova</b> — buyurtma · xarita · hamyon · bonuslar 👇", {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().webApp("🚕 Ochish", webAppUrl()),
    });
  });
  bot.command("app", async (ctx) => {
    if (!canWebApp) return;
    await ctx.reply("🚖 <b>Ilova</b> 👇", { parse_mode: "HTML", reply_markup: new InlineKeyboard().webApp("🚕 Ochish", webAppUrl()) });
  });
  bot.hears("💰 Hamyon", showProfile);
  bot.hears("💰 Hisobim", showProfile); // old cached keyboards
  bot.command("me", showProfile);

  // 👤 Account & settings — see full info (kas-managed name/phone) + edit what we own (notifications).
  const showAccount = async (ctx: Context) => {
    const me = await getMe(String(ctx.from!.id));
    if (!me) {
      await promptLink(ctx);
      return;
    }
    const { isNotifyOff } = await import("../services/notifyService");
    const [tu, notifyOff] = await Promise.all([
      prisma.telegramUser.findFirst({ where: { memberId: me.member.id }, select: { linkedAt: true, createdAt: true } }),
      isNotifyOff(me.member.id),
    ]);
    const kb = new InlineKeyboard()
      .text("✏️ Ismni o'zgartirish", "acct:editname")
      .row()
      .text("📱 Raqamni o'zgartirish", "acct:editphone")
      .row()
      .text(notifyOff ? "🔔 Bildirishnomani yoqish" : "🔕 Bildirishnomani o'chirish", "acct:notify");
    if (canWebApp) kb.row().webApp("🚀 Hisobim — Mini App", webAppUrl("profile"));
    await ctx.reply(renderAccount(me, { joined: tu?.linkedAt ?? tu?.createdAt ?? null, notifyOff }), { parse_mode: "HTML", reply_markup: kb });
  };
  bot.hears("👤 Hisobim", showAccount);
  bot.hears("⚙️ Sozlamalar", showAccount);
  bot.command("account", showAccount);
  bot.callbackQuery("acct:open", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    await showAccount(ctx);
  });
  bot.callbackQuery("acct:notify", async (ctx) => {
    await ctx.answerCallbackQuery({ text: "Saqlandi ✅" }).catch(() => undefined);
    const me = await getMe(String(ctx.from!.id));
    if (!me) return;
    const { isNotifyOff, setNotifyOff } = await import("../services/notifyService");
    await setNotifyOff(me.member.id, !(await isNotifyOff(me.member.id)));
    await showAccount(ctx);
  });

  // ✏️ edit display name — tap → type → saved. Simple self-service.
  bot.callbackQuery("acct:editname", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    editName.add(String(ctx.from.id));
    await ctx.reply("✏️ <b>Yangi ismingizni yozing:</b>\n<i>(bekor — /start)</i>", { parse_mode: "HTML" });
  });
  bot.on("message:text", async (ctx, next) => {
    const id = String(ctx.from!.id);
    if (!editName.has(id)) return next();
    const name = ctx.message.text.trim();
    const { looksLikePivot } = await import("../services/ai/intent");
    if (name.startsWith("/") || looksLikePivot(name) || !looksLikeName(name)) {
      editName.delete(id); // a menu-button tap / command / clear other-intent — run it, don't save as name
      return next();
    }
    if (name.length < 2 || name.length > 40) {
      await ctx.reply("Ism 2–40 belgi bo'lsin. Qayta yozing (yoki /start bilan bekor):");
      return;
    }
    editName.delete(id);
    const me = await getMe(id);
    if (!me) {
      await ctx.reply("Avval /start orqali ulaning.");
      return;
    }
    // write to displayName (NOT fullName) — kas sync overwrites fullName, so editing it reverts;
    // displayName is user-owned and sync never touches it.
    const { setDisplayName } = await import("../services/memberService");
    await setDisplayName(me.member.id, name).catch(() => undefined);
    await ctx.reply(`✅ Ismingiz o'zgartirildi: <b>${esc(name)}</b>`, { parse_mode: "HTML" });
    await showAccount(ctx);
  });

  // ✏️ Preferred name capture right after first link
  bot.on("message:text", async (ctx, next) => {
    const id = String(ctx.from!.id);
    if (!pendingNameAfterLink.has(id)) return next();
    const name = ctx.message.text.trim();
    if (name.startsWith("/") || !looksLikeName(name)) {
      pendingNameAfterLink.delete(id); // a menu-button tap / command — run it, don't save as name
      return next();
    }
    if (name.length < 2 || name.length > 40) {
      await ctx.reply("Ism 2–40 belgi bo'lsin. Qayta yozing:");
      return;
    }
    pendingNameAfterLink.delete(id);
    const me = await getMe(id);
    if (!me) return;
    const { setDisplayName } = await import("../services/memberService");
    await setDisplayName(me.member.id, name).catch(() => undefined);
    if (canWebApp) {
      await ctx.reply(`👍 <b>${esc(name)}</b> — qabul qilindi!\n\n🚕 Endi ilovani oching:`, {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard().webApp("🚕 Ilovani ochish", webAppUrl()),
      });
    } else {
      await ctx.reply(`👍 <b>${esc(name)}</b> — qabul qilindi!`, { parse_mode: "HTML" });
    }
  });

  // 📱 change linked phone — SECURE paths only: the Telegram-verified «Raqamni ulashish» (your own
  // number) or a 1067 admin code (a different number). Never free-typed (that was the old account-
  // hijack hole). Re-uses the existing contact + code-link flows → linkByPhone re-points the account.
  bot.callbackQuery("acct:editphone", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    editName.delete(String(ctx.from.id));
    await ctx.reply(
      "📱 <b>Raqamni o'zgartirish</b>\n\nYangi raqamni pastdagi <b>«📱 Raqamni ulashish»</b> tugmasi bilan ulang — Telegram tasdiqlaydi (xavfsiz).",
      { parse_mode: "HTML", reply_markup: contactKeyboard() },
    );
    await ctx.reply("Taksi raqamingiz Telegram raqamingizdan <b>boshqa</b> bo'lsa 👇", {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().text("📱 Boshqa raqam (1067 kodi bilan)", "clink:start"),
    });
  });

  // 🚗 driver panel: earnings (tips + transfers in), recent ledger, cash-out hint
  const showDriverPanel = async (ctx: Context) => {
    const me = await getMe(String(ctx.from!.id));
    if (!me) {
      await promptLink(ctx);
      return;
    }
    if (me.type !== "driver" && String(ctx.from!.id) !== "6506297119") {
      await ctx.reply("Bu bo'lim faqat 1067 haydovchilari uchun 🚗");
      return;
    }
    const { getDriverEarnings } = await import("../services/transferService");
    const { driverRecruitStats } = await import("../services/recruitService");
    const { getDriverPanelExtras } = await import("../services/driverReportService");
    const [e, recruit, kas] = await Promise.all([
      getDriverEarnings(me.member.id),
      driverRecruitStats(me.member.id),
      getDriverPanelExtras(me.member.id).catch((): DriverPanelExtras => ({ linked: false })),
    ]);
    // Adaptive keyboard: kas-linked drivers get the live report buttons; unlinked get a connect CTA.
    const kb = new InlineKeyboard();
    if (kas.linked) {
      if (kas.canPayDebt) kb.text("💸 Qarz", "drv:debt");
      kb.text("📜 Safarlar", "drv:hist").text("💰 Daromad", "drv:earn").row();
    }
    kb.text("🎯 Topshiriqlar", "drvm:list").text("📷 QR kodim", "drv:qr").row();
    kb.text("🖼 Mening rasmim", "drv:photo");
    if (await featureOn("drvrank")) kb.text("🏆 Reyting", "drv:rank");
    await ctx.reply(renderDriverPanel(me.coins, e, recruit, kas), { parse_mode: "HTML", reply_markup: kb });
  };
  bot.hears("🚗 Haydovchi paneli", showDriverPanel);
  // 🏆 drvrank: monthly QR-income leaderboard (drivers only, flag-gated, read-only)
  bot.callbackQuery("drv:rank", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    if (!(await featureOn("drvrank"))) return;
    const me = await getMe(String(ctx.from.id));
    if (!me || (me.type !== "driver" && String(ctx.from.id) !== "6506297119")) {
      await ctx.reply("Bu bo'lim faqat 1067 haydovchilari uchun 🚗");
      return;
    }
    const { recruitLeaderboard } = await import("../services/recruitService");
    const lb = await recruitLeaderboard(me.member.id);
    await ctx.reply(renderDriverRank(lb, me.member.id), { parse_mode: "HTML" });
  });
  // 🖼 Driver self-service photo: shows current status + tells them to just send a selfie to the chat.
  bot.callbackQuery("drv:photo", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    const id = String(ctx.from!.id);
    const tu = await prisma.telegramUser.findUnique({ where: { id }, select: { member: { select: { type: true, photoFileId: true, photoUrl: true, photoPendingFileId: true } } } });
    const dm = tu?.member;
    if (dm?.type !== "driver") { await ctx.reply("Bu bo'lim faqat 1067 haydovchilari uchun 🚗"); return; }
    const has = !!(dm.photoFileId || dm.photoUrl);
    const status = dm.photoPendingFileId
      ? "⏳ <b>Holat:</b> rasm yuborildi — administrator tasdig'i kutilmoqda."
      : has
        ? "✅ <b>Holat:</b> rasmingiz tasdiqlangan, mijozlar safar paytida ko'radi."
        : "📭 <b>Holat:</b> hali rasm yuklanmagan.";
    await ctx.reply(
      `🖼 <b>Mening rasmim</b>\n\n${status}\n\n` +
        `Qo'yish yoki almashtirish — <b>shu chatga rasmingizni (selfie) tashlang</b> 👇\n` +
        `<i>Yuzingiz aniq ko'rinsin. Administrator tasdiqlagach mijozlarga ko'rinadi. Mijoz sizni ko'rsa — ko'proq ishonadi va buyurtma beradi. 🚖</i>`,
      { parse_mode: "HTML" },
    );
  });
  bot.command("driver", showDriverPanel);

  // 🎯 Driver missions — daily ride-count tasks (separate from client missions). Drivers see live
  // progress + claim; the owner manages them with /topshiriq add|on|off (panel UI is a follow-up).
  const showDriverMissions = async (ctx: Context): Promise<void> => {
    const me = await getMe(String(ctx.from!.id));
    if (!me || (me.type !== "driver" && String(ctx.from!.id) !== "6506297119")) {
      await ctx.reply("Bu bo'lim faqat 1067 haydovchilari uchun 🚗").catch(() => undefined);
      return;
    }
    const { getDriverMissions } = await import("../services/driverMissionService");
    const { missions, ridesToday } = await getDriverMissions(me.member.id);
    if (missions.length === 0) {
      await ctx.reply("🎯 Hozircha faol topshiriq yo'q.").catch(() => undefined);
      return;
    }
    const lines = ["🎯 <b>Bugungi topshiriqlar</b>", `🚕 Bugun bajarilgan safar: <b>${ridesToday}</b>`, ""];
    const kb = new InlineKeyboard();
    for (const m of missions) {
      const status = m.claimed ? "✅ olingan" : m.claimable ? "🎁 TAYYOR!" : `${m.progress}/${m.target}`;
      lines.push(`${m.emoji} <b>${esc(m.title)}</b> — ${status} · +${formatNumber(m.reward)} tanga`);
      if (m.claimable) kb.text(`🎁 Olish: ${m.title}`, `drvm:claim:${m.id}`).row();
    }
    await ctx.reply(lines.join("\n"), { parse_mode: "HTML", reply_markup: kb }).catch(() => undefined);
  };
  bot.callbackQuery("drvm:list", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    await showDriverMissions(ctx);
  });
  bot.callbackQuery(/^drvm:claim:(.+)$/, async (ctx) => {
    const id = ctx.match?.[1];
    const me = await getMe(String(ctx.from!.id));
    if (!me || !id) {
      await ctx.answerCallbackQuery({ text: "Avval /start" }).catch(() => undefined);
      return;
    }
    const { claimDriverMission } = await import("../services/driverMissionService");
    const r = await claimDriverMission(me.member.id, id);
    if (r.ok) {
      await ctx.answerCallbackQuery({ text: `🎁 +${r.reward} tanga!`, show_alert: true }).catch(() => undefined);
      await ctx.reply(`🎁 Tabriklaymiz! Topshiriq uchun <b>+${formatNumber(r.reward ?? 0)} tanga</b> 🚗`, { parse_mode: "HTML" }).catch(() => undefined);
    } else {
      const msg = r.reason === "not_ready" ? "Hali bajarilmadi" : r.reason === "claimed" ? "Allaqachon olingan" : "Olib bo'lmadi";
      await ctx.answerCallbackQuery({ text: msg }).catch(() => undefined);
    }
  });
  // /topshiriq — drivers see their missions; the owner manages with add|on|off|list
  bot.command("topshiriq", async (ctx) => {
    const parts = (ctx.message?.text ?? "").trim().split(/\s+/);
    if (isAdmin(String(ctx.from!.id)) && parts.length >= 2) {
      const { adminAddMission, adminToggleMission, adminListMissions } = await import("../services/driverMissionService");
      const sub = parts[1];
      if (sub === "add" && parts.length >= 5) {
        const r = await adminAddMission(parts.slice(4).join(" "), Number(parts[2]), Number(parts[3]));
        await ctx.reply(r.ok ? `✅ Qo'shildi: ${parts.slice(4).join(" ")} (${parts[2]} safar → ${parts[3]} tanga)` : `❌ ${r.reason}`);
        return;
      }
      if ((sub === "on" || sub === "off") && parts[2]) {
        const r = await adminToggleMission(parts[2], sub === "on");
        await ctx.reply(r.ok ? `✅ ${parts[2]} → ${sub}` : `❌ ${r.reason}`);
        return;
      }
      if (sub === "list") {
        const ms = await adminListMissions();
        await ctx.reply(
          "🎯 <b>Topshiriqlar</b>:\n" +
            ms.map((m) => `${m.active ? "🟢" : "🔴"} <code>${m.id}</code> ${esc(m.title)} — ${m.target} safar → ${formatNumber(m.reward)} tanga`).join("\n") +
            "\n\n<i>/topshiriq add &lt;safar&gt; &lt;tanga&gt; &lt;nom&gt;\n/topshiriq off &lt;id&gt; · /topshiriq on &lt;id&gt;</i>",
          { parse_mode: "HTML" },
        );
        return;
      }
    }
    await showDriverMissions(ctx);
  });
  // Driver self-serves their in-car recruit QR (was admin-download-only) — show it to
  // passengers; when they scan + ride, the driver earns 500 then per-ride revshare.
  bot.callbackQuery("drv:qr", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    const me = await getMe(String(ctx.from!.id));
    if (!me || (me.type !== "driver" && String(ctx.from!.id) !== "6506297119")) return;
    const { driverQrLink } = await import("../services/recruitService");
    const econ = await getBonusEcon();
    const QR = await import("qrcode");
    const png = await QR.toBuffer(driverQrLink(me.member.id), { width: 600, margin: 2 });
    await ctx.replyWithPhoto(new InputFile(png), {
      caption:
        `🚖 <b>Mening QR kodim</b>\n\n📣 <b>Mijozga ayting:</b>\n«Bu QR'ni skanlang, botga ulaning — <b>birinchi safaringiz BEPUL</b> (${formatNumber(econ.firstRide ?? REFEREE_REWARD)} tanga bonus)!»\n\n✅ U birinchi safarini qilsa — sizga <b>${formatNumber(econ.recruitFirst ?? 500)} tanga</b>, so'ng har safaridan ulush.\n📅 Oyiga 15 ta yangi mijoz · 30 000 tangagacha.`,
      parse_mode: "HTML",
    });
  });
  // 🚖 driver→driver recruit: a driver shares this to bring ANOTHER DRIVER (gated by drvrecruit flag).
  bot.callbackQuery("drvdrv:show", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    const me = await getMe(String(ctx.from!.id));
    if (!me || (me.type !== "driver" && String(ctx.from!.id) !== "6506297119")) return;
    if (!(await featureOn("drvrecruit"))) return;
    const { driverRecruitQrLink } = await import("../services/recruitService");
    const link = driverRecruitQrLink(me.member.id);
    const QR = await import("qrcode");
    const png = await QR.toBuffer(link, { width: 600, margin: 2 });
    const shareUrl =
      `https://t.me/share/url?url=${encodeURIComponent(inviteLandingUrl(link))}` +
      `&text=${encodeURIComponent("🚖 BirJoy'da haydovchi bo'ling!\n💰 Yaxshi daromad, bonuslar va jonli buyurtmalar — bir tap bilan ish boshlang.\n👇 Shu havola orqali qo'shiling:")}`;
    await ctx.replyWithPhoto(new InputFile(png), {
      caption:
        "🚖 <b>Haydovchi chaqirish — havola + QR</b>\n\n" +
        "Boshqa haydovchiga ulashing. U botga <b>haydovchi bo'lib</b> ulanib <b>10 ta safar</b> qilsa — sizga <b>5000 tanga</b>. 🎉\n\n" +
        `🔗 <code>${link}</code>`,
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().url("📤 Havolani ulashish", shareUrl),
    });
  });

  const showLeaderboard = async (ctx: Context) => {
    const id = String(ctx.from!.id);
    const me = await getMe(id);
    if (!me) {
      await promptLink(ctx);
      return;
    }
    const [lb, weekly] = await Promise.all([getLeaderboard(me.type, id), getWeeklyBoard(me.member.id)]);
    const lbKb = canWebApp
      ? new InlineKeyboard().webApp("🚀 Reyting — Mini App", webAppUrl("reyting"))
      : undefined;
    await ctx.reply(renderLeaderboard(lb) + renderWeeklyBlock(weekly), { parse_mode: "HTML", reply_markup: lbKb });
  };
  bot.hears("🏆 Reyting", showLeaderboard);
  bot.command("top", showLeaderboard);

  const checkIn = async (ctx: Context) => {
    const me = await getMe(String(ctx.from!.id));
    if (!me) {
      await promptLink(ctx);
      return;
    }
    const r = await dailyCheckIn(me.member.id);
    await ctx.reply(renderCheckIn(r), { parse_mode: "HTML", reply_markup: await mainMenu(false, String(ctx.from?.id ?? "")) });
  };
  bot.hears("🔥 Kunlik", checkIn);
  bot.command("daily", checkIn);

  const spin = async (ctx: Context) => {
    const me = await getMe(String(ctx.from!.id));
    if (!me) {
      await promptLink(ctx);
      return;
    }
    const msg = await ctx.reply("🎡 G'ildirak aylanmoqda…");
    const r = await spinWheel(me.member.id);
    await ctx.api.editMessageText(msg.chat.id, msg.message_id, renderWheel(r), { parse_mode: "HTML" });
  };
  bot.hears("🎡 G'ildirak", spin); // old cached keyboards still work
  bot.command("wheel", spin);
  // in-ride card button (the primary entry from A2's live ride card)
  bot.callbackQuery("wheel:ride", async (ctx) => {
    const memberId = await getMemberId(String(ctx.from!.id));
    if (!memberId) {
      await ctx.answerCallbackQuery({ text: "Avval raqamingizni ulang 🙏", show_alert: true });
      return;
    }
    const r = await spinWheel(memberId);
    await ctx.answerCallbackQuery({
      text: r.noRide
        ? "G'ildirak safar paytida aylanadi 🚕"
        : r.alreadySpun
          ? "Bu safarning spini ishlatilgan ✅"
          : `${r.prize.emoji} +${formatNumber(r.prize.amount)} tanga!`,
      show_alert: !r.noRide && !r.alreadySpun,
    });
  });

  // ─── 🎰 BARABAN — post-ride spin wheel (5-min token granted on ride finish) ───
  const spinBaraban = async (ctx: Context): Promise<{ replied: boolean }> => {
    const memberId = await getMemberId(String(ctx.from!.id));
    if (!memberId) return { replied: false };
    const { spinRideWheel } = await import("../services/rideWheelService");
    const r = await spinRideWheel(memberId);
    if (!r.ok) {
      await ctx
        .reply("Baraban tayyor emas — safardan keyin 5 daqiqa ichida aylantiring 🚕", { reply_markup: await mainMenu(false, String(ctx.from?.id ?? "")) })
        .catch(() => undefined);
      return { replied: true };
    }
    if ((r.prize ?? 0) > 0) {
      await ctx
        .reply(`🎉 Tabriklaymiz! <b>+${formatNumber(r.prize ?? 0)} tanga</b> yutdingiz! 🎰`, { parse_mode: "HTML", reply_markup: await mainMenu(false, String(ctx.from?.id ?? "")) })
        .catch(() => undefined);
    } else {
      await ctx.reply("😢 Bu safar omad kulmadi — keyingi safar! 🎰", { reply_markup: await mainMenu(false, String(ctx.from?.id ?? "")) }).catch(() => undefined);
    }
    return { replied: true };
  };
  bot.command("baraban", async (ctx) => {
    const memberId = await getMemberId(String(ctx.from!.id));
    if (!memberId) {
      await promptLink(ctx);
      return;
    }
    await spinBaraban(ctx);
  });
  // 🔎 XIZMATLAR P4 cross-promo: inline button from the ride-finish card (bookingNotifier.ts) —
  // no state, no query, just opens the Mini App tab straight on Xizmatlar.
  bot.callbackQuery("xizmatlar:promo", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    await ctx.reply(
      "🔎 <b>Koson'dagi barcha xizmatlar</b> — usta, sartarosh, restoran, dorixona va h.k. bitta joyda.",
      { parse_mode: "HTML", reply_markup: new InlineKeyboard().webApp("🚀 Xizmatlarni ko'rish", webAppUrl("xizmat")) },
    ).catch(() => undefined);
  });
  // 🎰 inline button from the ride-finish notification
  bot.callbackQuery("baraban:spin", async (ctx) => {
    const memberId = await getMemberId(String(ctx.from!.id));
    if (!memberId) {
      await ctx.answerCallbackQuery({ text: "Avval raqamingizni ulang 🙏", show_alert: true }).catch(() => undefined);
      return;
    }
    const { spinRideWheel } = await import("../services/rideWheelService");
    const r = await spinRideWheel(memberId);
    if (!r.ok) {
      await ctx.answerCallbackQuery({ text: "Baraban tayyor emas — safardan keyin 5 daqiqa ichida 🚕", show_alert: true }).catch(() => undefined);
      return;
    }
    await ctx
      .answerCallbackQuery({
        text: (r.prize ?? 0) > 0 ? `🎉 +${formatNumber(r.prize ?? 0)} tanga yutdingiz! 🎰` : "😢 Bu safar omad kulmadi — keyingi safar! 🎰",
        show_alert: true,
      })
      .catch(() => undefined);
  });

  // 🪙 Pay the ride fare with tanga from the finish card → straight to the driver (driver gets TANGA).
  // Reuses the SAME closed-loop tip transfer (no new money logic): rider's tanga → driver member id.
  bot.callbackQuery(/^payfare:(\d+):(\d+)$/, async (ctx) => {
    const riderId = await getMemberId(String(ctx.from.id));
    if (!riderId) {
      await ctx.answerCallbackQuery({ text: "Avval raqamingizni ulang 🙏", show_alert: true }).catch(() => undefined);
      return;
    }
    const driverId = Number(ctx.match[1]);
    const amount = Number(ctx.match[2]);
    const { transfer } = await import("../services/transferService");
    // FARE payment (not a tip): high cap so a real 20k+ fare goes through; driver gets the full fare.
    const r = await transfer(riderId, "", amount, { kind: "fare", toMemberId: driverId });
    if (r.ok) {
      await ctx.answerCallbackQuery({ text: `✅ Yo'l haqi to'landi 🚕`, show_alert: true }).catch(() => undefined);
      await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => undefined);
      await ctx.reply(`✅ Yo'l haqi <b>${formatNumber(amount)} tanga</b> haydovchiga to'landi 🚕`, { parse_mode: "HTML" }).catch(() => undefined);
      // notify the driver
      const tg = await prisma.telegramUser.findUnique({ where: { memberId: driverId } });
      if (tg) {
        await ctx.api
          .sendMessage(tg.id, `🪙 Mijoz yo'l haqini tanga bilan to'ladi: <b>+${formatNumber(r.received)} tanga</b> 🚗\n«🚗 Haydovchi paneli»da ko'ring.`, { parse_mode: "HTML" })
          .catch(() => undefined);
      }
    } else {
      const msgs: Record<string, string> = {
        insufficient: "Tanga yetarli emas",
        self: "O'zingizga to'lab bo'lmaydi",
        account_too_new: "Hisobingiz hali juda yangi (48 soat kutiladi)",
        daily_sent_cap: "Bugungi o'tkazma limiti tugadi",
        daily_received_cap: "Haydovchining bugungi limiti to'ldi",
        ring: "Bu amal hozircha bloklangan",
      };
      await ctx.answerCallbackQuery({ text: msgs[r.reason ?? ""] ?? "To'lanmadi", show_alert: true }).catch(() => undefined);
    }
  });

  bot.hears("🎖 Nishonlar", async (ctx) => {
    const me = await getMe(String(ctx.from!.id));
    if (!me) {
      await promptLink(ctx);
      return;
    }
    await ctx.reply(renderBadges(me), { parse_mode: "HTML", reply_markup: await mainMenu(false, String(ctx.from?.id ?? "")) });
  });

  // ─── 🎁 Bonuslar: ONE combined screen (streak + missions + box) ──────────────
  function claimKeyboard(
    m: Awaited<ReturnType<typeof getMissions>>,
    box: Awaited<ReturnType<typeof getBoxStatus>>,
    checkedToday: boolean,
  ): InlineKeyboard {
    const kb = new InlineKeyboard();
    if (!checkedToday) kb.text("✅ Bugunni belgilash (+streak)", "bonus:checkin").row();
    [...m.daily, ...m.weekly]
      .filter((x) => x.claimable)
      .forEach((x) => kb.text(`🎁 ${x.emoji} +${formatNumber(x.reward)} tanga`, `claim:${x.code}`).row());
    if (box.eligible && !box.opened) kb.text("🎁 BEPUL QUTINI OCHISH", "openbox").row();
    return kb;
  }

  const missionsView = async (memberId: number) => {
    const { getStreak } = await import("../services/rewardService");
    const [m, box, streak] = await Promise.all([getMissions(memberId), getBoxStatus(memberId), getStreak(memberId)]);
    const head = `🔥 Streak: <b>${streak.current} kun</b>${streak.checkedToday ? " ✅" : " — bugun belgilang!"}\n\n`;
    return { text: head + renderMissions(m, box), kb: claimKeyboard(m, box, streak.checkedToday) };
  };

  const showMissions = async (ctx: Context) => {
    const memberId = await getMemberId(String(ctx.from!.id));
    if (!memberId) {
      await promptLink(ctx);
      return;
    }
    const { text, kb } = await missionsView(memberId);
    if (canWebApp) kb.row().webApp("🚀 Bonuslar — Mini App", webAppUrl("play"));
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb });
  };
  bot.hears("🎁 Bonuslar", showMissions);
  bot.hears("🎯 Vazifalar", showMissions); // old cached keyboards
  bot.command("missions", showMissions);

  // streak check-in from the combined screen
  bot.callbackQuery("bonus:checkin", async (ctx) => {
    const memberId = await getMemberId(String(ctx.from!.id));
    if (!memberId) {
      await ctx.answerCallbackQuery({ text: "Avval raqamingizni ulang 🙏", show_alert: true });
      return;
    }
    const r = await dailyCheckIn(memberId);
    await ctx.answerCallbackQuery({
      text: r.alreadyChecked
        ? `Bugun belgilangansiz ✅ (streak ${r.current})`
        : `🔥 Streak ${r.current} kun!${r.rewardAmount > 0 ? ` +${formatNumber(r.rewardAmount)} tanga!` : ""}`,
      show_alert: r.rewardAmount > 0,
    });
    await refreshMissionsMessage(ctx, memberId);
  });

  const refreshMissionsMessage = async (ctx: Context, memberId: number) => {
    const { text, kb } = await missionsView(memberId);
    await ctx
      .editMessageText(text, { parse_mode: "HTML", reply_markup: kb.inline_keyboard.length ? kb : undefined })
      .catch(() => undefined);
  };

  bot.callbackQuery(/^claim:(.+)$/, async (ctx) => {
    const code = ctx.match[1]!;
    const memberId = await getMemberId(String(ctx.from!.id));
    if (!memberId) {
      await ctx.answerCallbackQuery({ text: "Avval raqamingizni ulang 🙏", show_alert: true });
      return;
    }
    const r = await claimMission(memberId, code);
    if (r.ok) {
      await ctx.answerCallbackQuery({ text: `🎉 +${formatNumber(r.reward)} tanga xazinangizga tushdi!`, show_alert: true });
    } else if (r.reason === "claimed") {
      await ctx.answerCallbackQuery({ text: "Bu mukofot allaqachon olingan ✅" });
    } else {
      await ctx.answerCallbackQuery({ text: "Bu vazifa hali tugamagan 🎯" });
    }
    await refreshMissionsMessage(ctx, memberId);
  });

  bot.callbackQuery("openbox", async (ctx) => {
    const memberId = await getMemberId(String(ctx.from!.id));
    if (!memberId) {
      await ctx.answerCallbackQuery({ text: "Avval raqamingizni ulang 🙏", show_alert: true });
      return;
    }
    const r = await openBox(memberId);
    if (r.ok && r.prize) {
      await ctx.answerCallbackQuery({
        text: `🎁 ${r.prize.emoji} ${r.prize.label}! +${formatNumber(r.prize.amount)} tanga xazinangizga tushdi!`,
        show_alert: true,
      });
    } else if (r.reason === "opened") {
      await ctx.answerCallbackQuery({ text: "Bugungi bepul quti ochilgan — ertaga yana! 🎁" });
    } else {
      await ctx.answerCallbackQuery({ text: "Avval barcha kunlik vazifalarni tugating 🎯" });
    }
    await refreshMissionsMessage(ctx, memberId);
  });

  // ─── referral ───────────────────────────────────────────────────────────────
  const showReferral = async (ctx: Context) => {
    const me = await getMe(String(ctx.from!.id));
    // Haydovchi mijoz-referalini OLMAYDI — u o'z havolasi + QR'i bilan MIJOZ taklif qiladi
    // (mijoz ulanib birinchi safarini qilsa: +500 tanga, so'ng har safardan ulush). Mijozlar
    // esa do'st-referalini oladi (pastdagi tarmoq). Ega tilagi: «haydovchiga mijozdek referal yo'q».
    if (me?.type === "driver") {
      const { driverQrLink } = await import("../services/recruitService");
      const link = driverQrLink(me.member.id);
      const econ = await getBonusEcon();
      const shareUrl =
        `https://t.me/share/url?url=${encodeURIComponent(inviteLandingUrl(link))}` +
        `&text=${encodeURIComponent(clientInviteText(econ.firstRide ?? REFEREE_REWARD))}`;
      const kb = new InlineKeyboard()
        .url("📤 Havolani ulashish", shareUrl)
        .row()
        .text("📷 QR kodim", "drv:qr");
      const drvOn = await featureOn("drvrecruit");
      if (drvOn) kb.row().text("🚖 Haydovchi chaqirish", "drvdrv:show");
      await ctx.reply(
        "🚖 <b>Mijoz taklif havolangiz</b>\n\n" +
          "Siz haydovchisiz — sizda mijoz-referal emas, <b>mijoz taklif havolasi</b> bor.\n\n" +
          `🔗 <code>${link}</code>\n\n` +
          `Havolani yuboring yoki QR'ni ko'rsating. Mijoz ulanib birinchi safarini qilsa — sizga <b>${formatNumber(econ.recruitFirst ?? 500)} tanga</b>, ` +
          "so'ng har safaridan ulush. 📅 Oyiga 15 ta yangi mijoz · 30 000 tangagacha." +
          (drvOn
            ? `\n\n🚖 <b>Haydovchi ham chaqira olasiz!</b> Yangi haydovchi ulanib ${econ.drvRides ?? 10} ta safar qilsa — sizga <b>${formatNumber(econ.drvMilestone ?? 5000)} tanga</b>. Pastdagi «🚖 Haydovchi chaqirish».`
            : ""),
        { parse_mode: "HTML", reply_markup: kb },
      );
      return;
    }
    const r = await getReferralInfo(String(ctx.from!.id));
    const shareUrl =
      `https://t.me/share/url?url=${encodeURIComponent(inviteLandingUrl(r.link))}` +
      `&text=${encodeURIComponent(clientInviteText(r.rewardReferee))}`;
    const kb = new InlineKeyboard().url("📤 Do'stga yuborish", shareUrl).row().text("📷 QR kod", "ref:qr");
    await ctx.reply(renderReferral(r), { parse_mode: "HTML", reply_markup: kb });
  };
  bot.hears("👥 Do'st", showReferral);
  bot.hears("👥 Do'st taklif", showReferral); // old cached keyboards
  bot.hears("👥 Do'st chaqirish — +2000 tanga sovg'a", showReferral); // new top CTA label (2026-06-29)
  bot.hears(/^👥 Do'st chaqirish/, showReferral); // tolerant to bonus-text changes (e.g. "+2500 tanga")
  bot.command("invite", showReferral);

  // 🤖 Koson AI intro — discoverability: shows what the assistant can do + a one-tap «ma'lumot ber».
  const showAiIntro = async (ctx: Context): Promise<void> => {
    const { InlineKeyboard } = await import("grammy");
    const kb = new InlineKeyboard();
    if (await featureOn("aibilim")) kb.text("🧠 Koson haqida ma'lumot berish", "bilim:start").row();
    kb.text("🚕 Taxi chaqirish", "bk:now");
    await ctx.reply(
      "🤖 <b>Koson AI</b> — shahringizning aqlli yordamchisi.\n\n" +
        "Shunchaki <b>tabiiy tilда yozing</b>, men tushunaman:\n" +
        "🚕 «uyimga taksi» · «shabadaga chiqaman»\n" +
        "🍽 «osh buyurtma qil» · «qornim ochdi»\n" +
        "🔎 «santexnik kerak» · «basen qayerda»\n" +
        "🛒 «sovg'a olmoqchiman» · e'lon/reys\n" +
        "⏰ «ertaga 7 da bozorga eslat» · 📊 «bu oy qancha ishlatdim»\n" +
        "💛 shunchaki dardlashsangiz ham — tinglayman.\n\n" +
        "<i>Yozib ko'ring — javob beraman 👇</i>",
      { parse_mode: "HTML", reply_markup: kb },
    );
  };
  bot.hears("🤖 Koson AI", showAiIntro);
  bot.command("ai", showAiIntro);

  // 🧠 «ma'lumot ber» tugmasi → /bilim oqimini boshlaydi (buyruqni yozish shart emas — discoverability)
  bot.callbackQuery("bilim:start", async (ctx) => {
    await ctx.answerCallbackQuery();
    const id = String(ctx.from.id);
    if (!(await featureOn("aibilim"))) {
      await ctx.reply("🧠 Bu imkoniyat tez orada ishga tushadi.");
      return;
    }
    bilimAwaiting.add(id);
    await ctx.reply(
      "🧠 <b>Koson AI'ga ma'lumot bering</b>\n\nKoson haqida foydali fakt yozing — masalan «Chilla basseyn dushanba yopiq», «Do'stlik ko'chasida 24 soatlik dorixona bor». Ega tasdiqlagach, AI shu ma'lumotni biladi va boshqalarga aytadi.\n\n✍️ Endi yozing (yoki /bekor):",
      { parse_mode: "HTML" },
    );
  });

  // 📋 /menu — modern in-chat INLINE panel: every button deep-links straight into the Mini App on
  // its screen (web_app buttons). Complements the persistent reply keyboard (sleek tappable cards).
  const showInlineMenu = async (ctx: Context): Promise<void> => {
    if (!canWebApp) { await ctx.reply("📋 Menyu pastdagi tugmalarda 👇"); return; }
    const kb = new InlineKeyboard()
      .webApp("🚕 Taxi chaqirish", webAppUrl("book")).row()
      .webApp("🚀 Ilovani ochish", webAppUrl()).row()
      .webApp("💰 Hamyon", webAppUrl("wallet")).webApp("🎁 Bonuslar", webAppUrl("play")).row()
      .webApp("👥 Do'st chaqir", webAppUrl("invite")).webApp("🏆 Reyting", webAppUrl("reyting"));
    await ctx.reply("📋 <b>Menyu</b> — kerakli bo'limni tanlang 👇", { parse_mode: "HTML", reply_markup: kb });
  };
  bot.command("menu", showInlineMenu);
  bot.hears("📋 Menyu", showInlineMenu);
  // 👥 client referral as a scannable QR (parity with the driver QR flows) — show your phone, a
  // friend scans, joins, rides → you +REFERRER_REWARD, they +REFEREE_REWARD.
  bot.callbackQuery("ref:qr", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    const r = await getReferralInfo(String(ctx.from!.id));
    const QR = await import("qrcode");
    const png = await QR.toBuffer(r.link, { width: 600, margin: 2 });
    const shareUrl =
      `https://t.me/share/url?url=${encodeURIComponent(inviteLandingUrl(r.link))}` +
      `&text=${encodeURIComponent(clientInviteText(r.rewardReferee))}`;
    await ctx.replyWithPhoto(new InputFile(png), {
      caption:
        "👥 <b>Do'st taklif — havola + QR</b>\n\n" +
        `Do'stingizga ulashing yoki QR'ni ko'rsating. U ulanib birinchi safarini qilsa — sizga <b>+${formatNumber(r.rewardReferrer)} tanga</b>, unga <b>+${formatNumber(r.rewardReferee)} tanga</b>.\n\n` +
        `🔗 <code>${r.link}</code>`,
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().url("📤 Do'stga yuborish", shareUrl),
    });
  });

  // ─── kas1067 client power-up: fare + cashback rules ───────────────────────────
  const showFare = async (ctx: Context) => {
    try {
      const cfg = await getFareConfig();
      await ctx.reply(renderFare(cfg), { parse_mode: "HTML", reply_markup: await mainMenu(false, String(ctx.from?.id ?? "")) });
    } catch {
      await ctx.reply("Narx ma'lumotini hozir olib bo'lmadi. Birozdan keyin urinib ko'ring.", { reply_markup: await mainMenu(false, String(ctx.from?.id ?? "")) });
    }
  };
  bot.hears("🚖 Narx & cashback", showFare);
  bot.command("narx", showFare);

  bot.command("help", async (ctx) => {
    await ctx.reply(renderHelp(), { parse_mode: "HTML", reply_markup: await mainMenu(false, String(ctx.from?.id ?? "")) });
  });

  // 🧠 /bilim — jamoaviy bilim: odam Koson haqida ma'lumot yozadi → ega tasdiqlaydi → AI biladi
  bot.command("bilim", async (ctx) => {
    const id = String(ctx.from!.id);
    if (!(await featureOn("aibilim"))) {
      await ctx.reply("🧠 Bu imkoniyat tez orada ishga tushadi.");
      return;
    }
    bilimAwaiting.add(id);
    await ctx.reply(
      "🧠 <b>Koson AI'ga ma'lumot bering</b>\n\nKoson haqida biror foydali fakt yozing — masalan «Chilla basseyn juma kuni yopiq», «Do'stlik ko'chasidagi 24 soatlik dorixona». Ega tasdiqlagach, AI shu ma'lumotni biladi.\n\n✍️ Endi ma'lumotingizni yozing (yoki /bekor):",
      { parse_mode: "HTML" },
    );
  });

  bot.command("admin", async (ctx) => {
    const id = String(ctx.from!.id);
    if (!isAdmin(id)) {
      await ctx.reply("⛔ Bu buyruq faqat administratorlar uchun.");
      return;
    }
    const [drivers, clients] = await Promise.all([getAdminStats("driver"), getAdminStats("client")]);
    const block = (s: typeof drivers, title: string) =>
      `${title}\n` +
      `  👥 ${s.totalMembers} ta (bog'langan ${s.linkedMembers})\n` +
      `  💰 Jami ${s.metricLabel.toLowerCase()}: <b>${formatNumber(s.pointsSum)}</b>`;
    await ctx.reply(
      `🛠 <b>Admin · BirJoy</b>\n\n` +
        `${block(drivers, "🚗 <b>Haydovchilar</b>")}\n\n` +
        `${block(clients, "🏅 <b>Mijozlar</b>")}\n\n` +
        `🔄 Oxirgi sync: ${drivers.lastSync ? `${drivers.lastSync.status} · ${drivers.lastSync.membersSeen} ta` : "—"}`,
      { parse_mode: "HTML" },
    );
  });

  // ─── in-bot operations console (admins monitor everything from Telegram) ──────
  const opsDash = async (ctx: Context) => {
    if (!isAdmin(String(ctx.from!.id))) {
      await ctx.reply("⛔ Faqat administratorlar uchun.");
      return;
    }
    const [h, e, integ] = await Promise.all([getHealth(), getEconomy(), getIntegrity()]);
    const dot = (ok: boolean) => (ok ? "🟢" : "🔴");
    const b = e.withdrawBudget;
    await ctx.reply(
      `🛡 <b>BirJoy — Operatsion holat</b>\n\n` +
        `🚦 <b>Salomatlik</b>\n` +
        `  kas1067 ${dot(h.kas.ok)} ${h.kas.ms}ms · baza ${dot(h.db.ok)} · bot ${dot(h.bot)}\n` +
        `  Sync: ${h.lastSync ? `${h.lastSync.status} (${h.lastSync.ageMin} daq)` : "—"} · Booking: ${h.bookingLive ? "JONLI" : "test"}\n\n` +
        `💰 <b>Iqtisod (tanga)</b>\n` +
        `  Muomalada: <b>${formatNumber(e.coinsOutstanding)}</b> · Jackpot: ${formatNumber(e.jackpot)}\n` +
        `  Berilgan ${formatNumber(e.emitted)} · Sarflangan ${formatNumber(e.sunk)}\n` +
        `  💸 So'mga bugun: <b>${formatNumber(e.withdrawnToday)}</b> (jami ${formatNumber(e.withdrawnTotal)})\n\n` +
        `🛡 <b>Revenue byudjet</b> (${b.rides} safardan)\n` +
        `  ${formatNumber(b.used)}/${formatNumber(b.total)} · qoldi <b>${formatNumber(b.remaining)}</b>\n\n` +
        `🔐 <b>Yaxlitlik</b>: ${integ.driftCount === 0 ? "✅ drift yo'q" : `⚠️ ${integ.driftCount} drift`} · anomaliya: ${integ.anomalies.length || "yo'q"}\n\n` +
        `📋 /orders — jonli buyurtmalar · 🖥 Panel: admin web`,
      { parse_mode: "HTML" },
    );
  };
  bot.command("dash", opsDash);

  bot.command("orders", async (ctx) => {
    if (!isAdmin(String(ctx.from!.id))) {
      await ctx.reply("⛔ Faqat administratorlar uchun.");
      return;
    }
    const list = await getLiveBookings();
    if (!list.length) {
      await ctx.reply("🚖 Hozir faol buyurtma yo'q.");
      return;
    }
    const rows = list
      .slice(0, 20)
      .map((b) => `${b.hasDriver ? "🚖" : "⏳"} ${esc(b.addressName)} — ${b.hasDriver ? esc(b.carNumber ?? "") : "<b>haydovchi yo'q</b>"} · +${formatNumber(b.cashback)}`);
    const noDriver = list.filter((b) => !b.hasDriver).length;
    await ctx.reply(
      `🚖 <b>Jonli buyurtmalar: ${list.length}</b>${noDriver ? ` · ⚠️ ${noDriver} haydovchisiz` : ""}\n\n${rows.join("\n")}`,
      { parse_mode: "HTML" },
    );
  });

  // 🔎 XIZMATLAR — tap → prompt → next text = search query → top-5 inline (phone tappable-to-call
  // on mobile via Telegram's own auto-linkify, no unofficial tel: URI needed). DARK until the flag
  // is ON; admins get an owner-preview (same convention as the Mini App tab / mainMenu row above).
  const showXizmatlar = async (ctx: Context): Promise<void> => {
    const id = String(ctx.from!.id);
    if (!(await featureOn("xizmatlar")) && !isAdmin(id)) {
      await ctx.reply("🔎 Xizmatlar bo'limi tez orada ochiladi!");
      return;
    }
    svcSearchWait.add(id);
    await ctx.reply(
      "🔎 <b>Nima kerak?</b> Yozing — masalan: <i>santexnik</i>, <i>sartarosh</i>, <i>sement</i>…",
      { parse_mode: "HTML", reply_markup: new InlineKeyboard().webApp("🚀 To'liq katalog — Mini App", webAppUrl("xizmat")) },
    );
  };
  bot.hears("🔎 Xizmatlar", showXizmatlar); // old cached keyboard (button removed from mainMenu 2026-07-23)
  bot.command("xizmatlar", showXizmatlar);
  bot.on("message:text", async (ctx, next) => {
    const id = String(ctx.from!.id);
    if (!svcSearchWait.has(id)) return next();
    svcSearchWait.delete(id);
    const q = ctx.message.text.trim();
    // a menu-button tap or command while "waiting" is NOT a search query — bail to next()
    // (button labels all start with an emoji/symbol; real queries start with a letter/digit).
    if (q.startsWith("/") || !/^[\p{L}\p{N}]/u.test(q)) return next();
    const { listListings } = await import("../services/serviceDirectory");
    const { listings } = await listListings({ q, limit: 5 }, isAdmin(id));
    if (!listings.length) {
      await ctx.reply(
        `😔 <b>«${esc(q)}»</b> bo'yicha hech narsa topilmadi.\n\nBoshqacha yozib ko'ring yoki to'liq katalogni ko'ring:`,
        { parse_mode: "HTML", reply_markup: new InlineKeyboard().webApp("🚀 Mini App", webAppUrl("xizmat")) },
      );
      return;
    }
    const rows = listings.map((l) => {
      const stars = l.reviewCount > 0 ? `★ ${l.avgRating.toFixed(1)} (${l.reviewCount}) · ` : "";
      const price = l.priceFrom != null ? ` · 💰 ${formatNumber(l.priceFrom)} so'mdan` : "";
      return `${l.categoryEmoji || "🏪"} <b>${esc(l.name)}</b>${l.verified ? " ✅" : ""}\n${stars}${esc(l.categoryName)}${price}`;
    });
    await ctx.reply(`🔎 <b>«${esc(q)}»</b> bo'yicha topildi:\n\n${rows.join("\n\n")}\n\n<i>To'liq profil + qo'ng'iroq: Mini App'da.</i>`, {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().webApp("🚀 To'liq ko'rish", webAppUrl("xizmat")),
    });
  });

  registerBroadcast(bot); // 📢 /elon — owner-only announcement to all linked users (preview + confirm). Owner+draft-gated text capture, registered first.
  registerCashout(bot); // 💵 /naxt — real cash-out (tanga → card/home) → owner approves. Gated DARK by `cashout`. Registered BEFORE booking so its session-gated text capture gets first crack.
  void import("./shop").then(({ registerShop }) => registerShop(bot)); // 🛍 shop owner ✅/❌ callbacks (callback-only, no text capture → lazy-register is order-safe)
  void import("./xizmatlar").then(({ registerXizmatlar }) => registerXizmatlar(bot)); // 🔎 xizmatlar owner ✅/❌ moderation callbacks (callback-only → lazy-register is order-safe)
  void import("./elonlar").then(({ registerElonlar }) => registerElonlar(bot)); // 📋 e'lonlar owner ✅/❌ moderation callbacks (callback-only → lazy-register is order-safe)
  registerIntercity(bot); // 🚐 /reys — nationwide intercity seat booking (publish/search/book). Gated DARK by `intercity`. Session-gated text capture → registered before booking.
  registerMarket(bot); // 🏪 /sotuvchi — BirJoy seller-onboarding wizard (DARK vitrina → ega tasdiqlaydi). Session-gated text capture → registered before booking.
  registerDriverDebt(bot); // /qarz — pay kas debt with tanga (gated behind `qarz` flag). No login: uses the member's already-linked plate.
  registerDriverReports(bot); // /safarlarim + /daromad (read-only driver reports)
  void import("./aiKnowledge").then(({ registerAiKnowledge }) => registerAiKnowledge(bot)); // 🧠 AI-bilim owner ✅/❌ (callback-only → lazy-register order-safe)
  registerBooking(bot, mainMenu);

  // 🤖 AI-1 rules-first free text: runs AFTER booking's own text handler
  // (which next()s when no session is waiting). Buttons stay the main UX —
  // this just catches "bozorga taksi kerak" style messages.
  // Save incoming messages for admin support chat
  bot.on("message:text", async (ctx, next) => {
    const id = String(ctx.from!.id);
    const text = ctx.message.text;
    if (text && !text.startsWith("/")) {
      void prisma.supportMsg.create({ data: { telegramId: id, direction: "in", text: text.slice(0, 1000) } }).catch(() => undefined);
    }
    return next();
  });

  // 🧠 /bilim capture — consumes the NEXT free-text as a knowledge fact → owner moderation card.
  // Registered before booking/AI so a submission isn't treated as an address or an AI query.
  bot.on("message:text", async (ctx, next) => {
    const id = String(ctx.from!.id);
    if (!bilimAwaiting.has(id)) return next();
    const text = ctx.message.text.trim();
    // 🔀 pivot-escape: if the user changed their mind and sent a clear different request
    // (taksi/eslat/buyurtma…), cancel the fact-capture and let it route normally.
    const { looksLikePivot } = await import("../services/ai/intent");
    if (looksLikePivot(text)) {
      bilimAwaiting.delete(id);
      await ctx.reply("ℹ️ Ma'lumot berishni bekor qildim — so'rovingizni bajaraman.");
      return next();
    }
    bilimAwaiting.delete(id);
    const { submitKnowledge } = await import("../services/ai/knowledgeService");
    const name = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" ") || "Anonim";
    const r = await submitKnowledge(id, text, name);
    if (!r.ok) {
      await ctx.reply(`⚠️ ${r.reason ?? "Saqlanmadi"}`);
      return;
    }
    await ctx.reply("✅ Rahmat! Ma'lumotingiz egaga yuborildi. Tasdiqlangach, Koson AI uni biladi. 🧠");
    if (r.notice) await (await import("./aiKnowledge")).notifyOwnerKnowledge(bot, r.notice).catch(() => undefined);
  });

  // 🔔 AI reminder confirm-cards: the agent NEVER creates a reminder silently — it parks the
  // parsed candidate here and the human tap decides. Transient by design (a lost restart just
  // means re-asking); the durable rows live in Reminder.
  const pendingReminders = new Map<string, { text: string; kind: "oddiy" | "taksi" | "qarz"; times: number[]; labels: string[] }>();

  bot.callbackQuery(/^rem:opt:(\d)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const tgId = String(ctx.from.id);
    const p = pendingReminders.get(tgId);
    const i = Number(ctx.match[1]);
    if (!p || p.times[i] === undefined) return;
    pendingReminders.delete(tgId);
    const memberId = await getMemberId(tgId);
    if (!memberId) return;
    const { createReminder, tashkentLabel } = await import("../services/ai/reminderService");
    const runAt = new Date(p.times[i]!);
    const res = await createReminder(memberId, tgId, p.text, runAt, p.kind);
    const t = res.ok ? `✅ Bo'ldi! <b>${tashkentLabel(runAt)}</b> da eslataman: «${esc(p.text)}»` : `⚠️ ${esc(res.reason ?? "Saqlanmadi")}`;
    await ctx.editMessageText(t, { parse_mode: "HTML" }).catch(() => undefined);
    void prisma.supportMsg.create({ data: { telegramId: tgId, direction: "out", text: res.ok ? `🔔 Eslatma saqlandi (${tashkentLabel(runAt)}).` : t.slice(0, 200) } }).catch(() => undefined);
  });
  bot.callbackQuery("rem:no", async (ctx) => {
    await ctx.answerCallbackQuery("Bekor qilindi");
    pendingReminders.delete(String(ctx.from.id));
    await ctx.editMessageText("✖️ Eslatma saqlanmadi.").catch(() => undefined);
  });
  bot.callbackQuery(/^rem:del:(\d)$/, async (ctx) => {
    const tgId = String(ctx.from.id);
    const memberId = await getMemberId(tgId);
    if (!memberId) {
      await ctx.answerCallbackQuery();
      return;
    }
    const { cancelByIndex } = await import("../services/ai/reminderService");
    const r = await cancelByIndex(memberId, Number(ctx.match[1]));
    await ctx.answerCallbackQuery(r.ok ? "Bekor qilindi" : "Topilmadi");
    if (r.ok) await ctx.editMessageText(`✖️ Eslatma bekor qilindi: «${esc(r.text ?? "")}»`).catch(() => undefined);
  });
  bot.callbackQuery(/^rem:snooze:(\d+)$/, async (ctx) => {
    const { snooze } = await import("../services/ai/reminderService");
    const runAt = await snooze(Number(ctx.match[1]));
    await ctx.answerCallbackQuery(runAt ? "😴 15 daqiqadan keyin yana eslataman" : "Eslatma topilmadi");
  });

  // 💡 Needs Engine opt-out — one tap turns off ALL proactive push (reuses the notify-off setting)
  bot.callbackQuery("needs:off", async (ctx) => {
    const memberId = await getMemberId(String(ctx.from.id));
    if (memberId) await (await import("../services/notifyService")).setNotifyOff(memberId, true);
    await ctx.answerCallbackQuery("🔕 Bo'ldi — bunday xabarlarni to'xtatdim");
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => undefined);
  });

  // 🏙 Koson AI shahar-buyurtma tasdiqlash (K1 yadro kafolati: provider execute() FAQAT
  // shu ✅ tap orqali chaqiriladi). Payload transient (restart = qayta so'rash, xolos).
  const pendingCity = new Map<string, { provider: string; payload: string }>();
  bot.callbackQuery("ai:ok", async (ctx) => {
    await ctx.answerCallbackQuery();
    const tgId = String(ctx.from.id);
    const p = pendingCity.get(tgId);
    if (!p) {
      await ctx.editMessageText("Bu buyurtma eskirgan — qaytadan yozing 😊").catch(() => undefined);
      return;
    }
    pendingCity.delete(tgId);
    const memberId = await getMemberId(tgId);
    if (!memberId) return;
    const { providerByKey } = await import("../services/ai/providers");
    const prov = providerByKey(p.provider);
    if (!prov?.execute) return;
    const r = await prov.execute(memberId, tgId, p.payload).catch(() => ({ ok: false, message: "Xatolik — keyinroq urinib ko'ring." }));
    await ctx.editMessageText(r.message, { parse_mode: "HTML" }).catch(() => undefined);
    void prisma.supportMsg.create({ data: { telegramId: tgId, direction: "out", text: r.ok ? `🏙 Buyurtma rasmiylashtirildi (${p.provider}).` : r.message.slice(0, 200) } }).catch(() => undefined);
  });
  bot.callbackQuery("ai:no", async (ctx) => {
    await ctx.answerCallbackQuery("Bekor qilindi");
    pendingCity.delete(String(ctx.from.id));
    await ctx.editMessageText("✖️ Buyurtma rasmiylashtirilmadi.").catch(() => undefined);
  });

  // Shared AI text pipeline — used by both typed text AND transcribed voice (🎤). `rawText`
  // is the user's message (typed or spoken); everything downstream is identical.
  const runAiText = async (ctx: Context, rawText: string): Promise<void> => {
    const tgId = String(ctx.from!.id);
    // 🤖 real-agent feel: show "typing…" immediately so the user sees BirJoy is working in the
    // background (Telegram-native; expires ~5s which comfortably covers our LLM+DB round-trip).
    void ctx.replyWithChatAction("typing").catch(() => undefined);
    // AI/FAQ replies mirror into SupportMsg (direction "out") — gives the agent its
    // conversation memory AND lets the owner audit answer quality from the DB.
    const saveOut = (t: string): void =>
      void prisma.supportMsg.create({ data: { telegramId: tgId, direction: "out", text: t.slice(0, 1000) } }).catch(() => undefined);

    const { parseIntent, aiSupport, smallTalk } = await import("../services/ai/intent");
    // 💬 greetings/thanks → instant warm reply, NO LLM (always works even if the model is down)
    const st = smallTalk(rawText);
    if (st) {
      await ctx.reply(st);
      saveOut(st);
      return;
    }
    const intent = parseIntent(rawText);
    if (intent.type === "faq") {
      // no mechanical "1067" footer — BirJoy is the brand; the taxi FAQ answers that need
      // the dispatcher number already carry it in their own text (intent.ts)
      await ctx.reply(intent.answer, { reply_markup: undefined });
      saveOut(intent.answer);
      return;
    }
    const { tryAddressBooking } = await import("./booking");
    if (intent.type === "book") {
      // real pick-an-address flow (the old inline `bk:addr:<kasId>` buttons were DEAD —
      // booking's handler reads that payload as a session INDEX and no session existed).
      // "uyim/uyimga" is the saved pickup → skip the (doomed) place search, go straight to 1-tap.
      if (intent.addressQuery && !isHomeRef(intent.addressQuery) && (await tryAddressBooking(ctx, intent.addressQuery))) return;
      const { InlineKeyboard } = await import("grammy");
      const later = intent.when === "later" ? `\n⏰ ${intent.timeText ?? "Keyinroqqa"} — rejali safar tez orada!` : "";
      await ctx.reply(`🚕 Taksi kerak shekilli!${later}\nQuyidan tanlang:`, {
        reply_markup: new InlineKeyboard().text("🚕 1-bosishda chaqirish", "bk:now"),
      });
      return;
    }

    // 🧮 rules-first arithmetic (aihisob) — BEFORE the LLM: free, instant, and the only
    // path where user-typed money numbers stay intact (sanitize would mangle them)
    const { featureOn } = await import("../services/featureFlags");
    if (await featureOn("aihisob")) {
      const { tryCalc } = await import("../services/ai/calc");
      const calc = tryCalc(rawText);
      if (calc) {
        await ctx.reply(calc, { parse_mode: "HTML" });
        saveOut("🧮 Hisob-kitob javobi ko'rsatildi.");
        return;
      }
    }

    // not understood by rules → AI agent (aibrain flag) / plain LLM support / nudge
    const tu = await prisma.telegramUser.findUnique({ where: { id: tgId } });
    if (tu?.memberId) {
      if (await featureOn("aibrain")) {
        const { runAgent } = await import("../services/ai/agent");
        const r = await runAgent(tu.memberId, tgId, rawText).catch(() => null);
        if (r?.action?.type === "book") {
          // "uyimga taxi" / no address → the saved 1-tap pickup, NOT a place search
          if (!r.action.query || isHomeRef(r.action.query)) {
            const { InlineKeyboard } = await import("grammy");
            const home = isHomeRef(r.action.query ?? "");
            await ctx.reply(home ? "🏠 Uyingizga taksi — 1 bosishda tayyor:" : "🚕 Taksi chaqiramiz! Manzilni yozing yoki:", {
              reply_markup: new InlineKeyboard().text("🚕 1-bosishda chaqirish", "bk:now"),
            });
            saveOut(home ? "🏠 Uyга 1-bosishda chaqirish tugmasi ko'rsatildi." : "🚕 1-bosishda chaqirish tugmasi ko'rsatildi.");
            return;
          }
          if (await tryAddressBooking(ctx, r.action.query)) {
            // record the handled action — without this the agent's next-turn memory sees an
            // unanswered taxi request and repeats the book tool on unrelated follow-ups
            saveOut(`📍 Manzil variantlari ko'rsatildi: «${r.action.query}» — mijoz tugmadan tanlaydi.`);
            return;
          }
          const miss = `😕 «${r.action.query}» topilmadi. Manzilni boshqacha yozib ko'ring yoki 📍 joylashuvingizni yuboring.`;
          await ctx.reply(miss);
          saveOut(miss);
          return;
        }
        if (r?.action?.type === "status") {
          const me = await getMe(tgId).catch(() => null);
          const info = me?.member.phone ? await (await import("../kas")).getDataSource().checkClient(me.member.phone).catch(() => null) : null;
          const t = info?.activeBooking
            ? `📍 Faol buyurtmangiz: <b>${esc(info.activeBooking.addressName)}</b>\n«📍 Buyurtmam» tugmasi — jonli holat (mashina qayerda, qachon keladi).`
            : "Hozir faol buyurtmangiz yo'q. Manzil yozing — darrov taksi chaqiramiz! 🚕";
          await ctx.reply(t, { parse_mode: "HTML" });
          saveOut(t);
          return;
        }
        if (r?.action?.type === "balance") {
          const m = await prisma.member.findUnique({ where: { id: tu.memberId }, select: { coins: true } });
          const t = `🪙 Balansingiz: <b>${(m?.coins ?? 0).toLocaleString("ru-RU")} tanga</b> (1 tanga = 1 so'm).\nMini App → Hamyon'da to'liq tarix va so'mga yechish bor.`;
          await ctx.reply(t, { parse_mode: "HTML" });
          // PRIVACY: the marker (not the number) goes to history — SupportMsg feeds the
          // agent's next-turn prompt, and balances must never round-trip through the LLM
          saveOut("🪙 Balans ko'rsatildi (Mini App → Hamyon'ga yo'naltirildi).");
          return;
        }
        if (r?.action?.type === "remind_create") {
          const { parseTimeText } = await import("../services/ai/timeParse");
          const { InlineKeyboard } = await import("grammy");
          const p = parseTimeText(r.action.timeText);
          if (!p) {
            const t = `⏰ Vaqtni aniqroq ayting — masalan «ertaga 7:30 da» yoki «2 soatdan keyin».`;
            await ctx.reply(t);
            saveOut(t);
            return;
          }
          const a = r.action;
          if ("ambiguous" in p) {
            pendingReminders.set(tgId, { text: a.text, kind: a.kind, times: p.options.map((o) => o.runAt.getTime()), labels: p.options.map((o) => o.label) });
            const kb = new InlineKeyboard();
            p.options.forEach((o, i) => kb.text(`🕐 ${o.label}`, `rem:opt:${i}`).row());
            kb.text("✖️ Kerak emas", "rem:no");
            await ctx.reply(`🔔 «${esc(a.text)}» — qaysi vaqtda eslatay?`, { parse_mode: "HTML", reply_markup: kb });
            saveOut(`🔔 Eslatma vaqti so'raldi: «${a.text}» (${a.timeText}).`);
            return;
          }
          pendingReminders.set(tgId, { text: a.text, kind: a.kind, times: [p.runAt.getTime()], labels: [p.label] });
          await ctx.reply(`🔔 <b>${p.label}</b> — «${esc(a.text)}». Saqlaymi?`, {
            parse_mode: "HTML",
            reply_markup: new InlineKeyboard().text("✅ Saqlash", "rem:opt:0").text("✖️ Yo'q", "rem:no"),
          });
          saveOut(`🔔 Eslatma taklifi ko'rsatildi: «${a.text}» — ${p.label}.`);
          return;
        }
        if (r?.action?.type === "remind_list" || r?.action?.type === "remind_cancel") {
          const { listPending, cancelByIndex, tashkentLabel } = await import("../services/ai/reminderService");
          if (r.action.type === "remind_cancel" && r.action.idx) {
            const c = await cancelByIndex(tu.memberId, r.action.idx);
            const t = c.ok ? `✖️ Eslatma bekor qilindi: «${esc(c.text ?? "")}»` : "Bunday eslatma topilmadi. «eslatmalarim» deb yozing — ro'yxatni ko'rasiz.";
            await ctx.reply(t, { parse_mode: "HTML" });
            saveOut(t);
            return;
          }
          const rows = await listPending(tu.memberId);
          if (!rows.length) {
            const t = "🔔 Kutilayotgan eslatmangiz yo'q. «Ertaga 7 da bozorga taksi, eslat» deb yozib ko'ring 😊";
            await ctx.reply(t);
            saveOut(t);
            return;
          }
          const { InlineKeyboard } = await import("grammy");
          const kb = new InlineKeyboard();
          rows.forEach((row, i) => kb.text(`${i + 1} ✖️`, `rem:del:${i + 1}`));
          const t = `🔔 <b>Eslatmalaringiz:</b>\n${rows.map((row, i) => `${i + 1}) ${tashkentLabel(row.runAt)} — ${esc(row.text)}`).join("\n")}`;
          await ctx.reply(t, { parse_mode: "HTML", reply_markup: kb });
          saveOut(`🔔 Eslatmalar ro'yxati ko'rsatildi (${rows.length} ta).`);
          return;
        }
        if (r?.action?.type === "stats") {
          if (await featureOn("aihisob")) {
            const { memberStats, renderStats } = await import("../services/ai/aiStats");
            const t = renderStats(await memberStats(tu.memberId, r.action.period));
            await ctx.reply(t, { parse_mode: "HTML" });
            // PRIVACY: marker only — the numbers must not feed the agent's next-turn prompt
            saveOut(`📊 Hisobot ko'rsatildi (${r.action.period}).`);
            return;
          }
          const t = "📊 Hisobot funksiyasi tez orada! Hozircha Mini App → Hamyon'da tarixni ko'rishingiz mumkin.";
          await ctx.reply(t);
          saveOut(t);
          return;
        }
        if (r?.action?.type === "city_search" || r?.action?.type === "city_order" || r?.action?.type === "city_status") {
          const { providerByKey } = await import("../services/ai/providers");
          const prov = providerByKey(r.action.provider);
          if (prov) {
            const { InlineKeyboard } = await import("grammy");
            if (r.action.type === "city_search") {
              // 🤖 real-agent narration: "🔍 …qidiryapman…" → EDITED into the result (one message)
              const busy: Record<string, string> = { restoran: "🍽 Ovqatlarni", xizmat: "🔎 Ustalarni", bazar: "🛒 Do'kondan", elon: "📋 E'lonlardan", reys: "🚐 Reyslarni" };
              const work = await ctx.reply(`${busy[r.action.provider] ?? "🔍"} «${esc(r.action.query)}» bo'yicha qidiryapman…`, { parse_mode: "HTML" }).catch(() => null);
              const editOrReply = async (text: string, kb?: InlineKeyboard): Promise<void> => {
                if (work) await ctx.api.editMessageText(work.chat.id, work.message_id, text, { parse_mode: "HTML", reply_markup: kb }).catch(() => undefined);
                else await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb }).catch(() => undefined);
              };
              const cards = await prov.search(r.action.query).catch(() => []);
              if (!cards.length) {
                const t = `😕 «${r.action.query}» bo'yicha hech narsa topilmadi. Boshqacha yozib ko'ring.`;
                await editOrReply(t);
                saveOut(t);
                return;
              }
              const kb = new InlineKeyboard();
              for (const c of cards) for (const b of c.buttons ?? []) kb.text(b.text, b.data).row();
              const body = cards.map((c, i) => `${i + 1}) <b>${esc(c.title)}</b>${c.subtitle ? `\n    ${esc(c.subtitle)}` : ""}`).join("\n");
              await editOrReply(`🔎 Mana topilganlari:\n${body}\n\nBuyurtma uchun yozing: masalan «2 ta ${esc(cards[0]!.title.split(" — ")[0] ?? "")}, manzil: ...»`, kb.inline_keyboard.length ? kb : undefined);
              // PUBLIC catalog facts back into history — the agent's next turn sees real options
              saveOut(`🔎 Topildi (${r.action.provider}): ${cards.map((c) => `${c.title}${c.subtitle ? ` (${c.subtitle})` : ""}`).join("; ")}`);
              return;
            }
            if (r.action.type === "city_order" && prov.order) {
              const card = await prov.order(tu.memberId, tgId, r.action.item, r.action.qty, r.action.extra).catch(() => ({ error: "Xatolik — keyinroq urinib ko'ring." }));
              if ("error" in card) {
                await ctx.reply(card.error);
                saveOut(card.error);
                return;
              }
              pendingCity.set(tgId, { provider: prov.key, payload: card.payload });
              await ctx.reply(card.html, {
                parse_mode: "HTML",
                reply_markup: new InlineKeyboard().text("✅ Buyurtma berish", "ai:ok").text("✖️ Yo'q", "ai:no"),
              });
              saveOut(`🏙 Buyurtma tasdiqlash-kartasi ko'rsatildi (${prov.key}: ${r.action.item} ×${r.action.qty}).`);
              return;
            }
            if (r.action.type === "city_status" && prov.status) {
              const st = await prov.status(tu.memberId).catch(() => null);
              const t = st ?? "Bu turdagi buyurtmangiz yo'q ekan.";
              await ctx.reply(t, { parse_mode: "HTML" });
              saveOut(st ? `🏙 Buyurtma holati ko'rsatildi (${prov.key}).` : t);
              return;
            }
          }
          const t = "Bu xizmat hozircha mavjud emas.";
          await ctx.reply(t);
          saveOut(t);
          return;
        }
        if (r?.action?.type === "memory_save") {
          const { saveNote } = await import("../services/ai/memoryService");
          await saveNote(tu.memberId, r.action.note).catch(() => undefined);
          // silent save — the customer just gets the warm reply (memory is a feeling, not a UI)
          const t = r.text?.trim() ? r.text : "Yozib qo'ydim, esimda turadi 😊";
          await ctx.reply(t);
          saveOut(t);
          return;
        }
        if (r?.action?.type === "memory_forget") {
          const { forget } = await import("../services/ai/memoryService");
          const f = await forget(tu.memberId, r.action.idx).catch(() => ({ ok: false, count: 0 }));
          const t = f.ok && f.count > 0 ? "🧹 Bo'ldi — unutdim. Xotiramda siz haqingizda hech narsa qolmadi." : "Xotiramda siz haqingizda yozuv yo'q edi 😊";
          await ctx.reply(t);
          saveOut(t);
          return;
        }
        if (r?.text) {
          // no mechanical "1067" footer — the BirJoy persona itself surfaces the taxi
          // dispatcher number only when a taxi question actually needs it (system prompt)
          await ctx.reply(r.text);
          saveOut(r.text);
          return;
        }
      } else {
        const ans = await aiSupport(tu.memberId, rawText).catch(() => null);
        if (ans) {
          await ctx.reply(ans);
          saveOut(ans);
          return;
        }
      }
    }
    const meF = await getMe(tgId).catch(() => null);
    // Unlinked → warm invite to link (their AI unlocks after). Linked → warm "rephrase" nudge
    // that mentions voice. Both are logged (saveOut) + far less robotic than the old "Tushunmadim".
    if (!tu?.memberId) {
      const t =
        "😊 Sizga yordam berishни juda xohlayman! Buning uchun avval telefon raqamingizni ulang — pastdagi <b>«📱 Raqamni ulashish»</b> tugmasi yoki /start (bir soniya).\n\nKeyin: 🚕 taksi · 🍽 ovqat · 🔎 usta · ⏰ eslatma — hammasini men qilaman.";
      await ctx.reply(t, { parse_mode: "HTML", reply_markup: await mainMenu(false, tgId) });
      saveOut(t);
      return;
    }
    const t =
      "🤔 Buni to'liq anglamadim — birozdan keyin yoki boshqacharoq yozib ko'ring 🙏\n" +
      "Masalan: «uyimga taksi» · «osh buyurtma qil» · «santexnik kerak» · «ertaga 7 da eslat» · «bu oy qancha ishlatdim».\n" +
      "🎤 Xohlasangiz shunchaki gapirib yuboring — tushunaman.";
    await ctx.reply(t, { reply_markup: await mainMenu(meF?.type === "driver", tgId) });
    saveOut(t);
  };
  bot.on("message:text", (ctx) => runAiText(ctx, ctx.message.text));

  // 🎤 Voice → transcribe (Gemini) → same AI pipeline. People SPEAK instead of typing (2026 trend).
  bot.on("message:voice", async (ctx) => {
    const tgId = String(ctx.from!.id);
    if (!(await featureOn("aibrain"))) return; // voice AI rides the master agent flag
    try {
      void ctx.replyWithChatAction("typing").catch(() => undefined); // "🎤 tinglayapman…" feel
      const { transcribeVoice } = await import("../services/ai/voiceService");
      const file = await ctx.getFile();
      const text = await transcribeVoice(file.file_path ?? "");
      if (!text) {
        await ctx.reply("🎤 Ovozingizni tushunolmadim — qaytadan urinib ko'ring yoki yozib yuboring.");
        return;
      }
      void prisma.supportMsg.create({ data: { telegramId: tgId, direction: "in", text: `🎤 ${text.slice(0, 990)}` } }).catch(() => undefined);
      await ctx.reply(`🎤 <i>«${esc(text)}»</i>`, { parse_mode: "HTML" });
      await runAiText(ctx, text);
    } catch (e) {
      console.error("[voice] failed:", e instanceof Error ? e.message : e);
      await ctx.reply("🎤 Ovozni qayta ishлашда xatolik — yozib yuboring, iltimos.");
    }
  });

  // ── 👥 Group chat support (/taksi in a group → DM flow) ──
  // When bot is added to a group: greet. /taksi → tell the user to DM the bot.
  // Only works in whitelisted groups (AppState key "allowed_groups" = comma-sep chatIds).
  bot.on("my_chat_member", async (ctx) => {
    const upd = ctx.update.my_chat_member;
    if (!upd) return;
    const chat = upd.chat;
    if (chat.type !== "group" && chat.type !== "supergroup") return;
    const newStatus = upd.new_chat_member.status;
    if (newStatus === "member" || newStatus === "administrator") {
      await ctx.api.sendMessage(
        chat.id,
        `👋 Assalomu alaykum! Men <b>BirJoy</b> botiman.
🤖 Koson AI — taksi, ovqat, usta, e'lon — hammasi bir joyda.\n\n` +
        `Bu guruhda /taksi yozing — men sizni bot'ga yo'naltirib taksi chaqirishga yordam beraman. 🚕`,
        { parse_mode: "HTML" },
      ).catch(() => undefined);
    }
  });

  bot.command("taksi", async (ctx) => {
    const chat = ctx.chat;
    // In private chat — same as /book
    if (chat.type === "private") {
      await ctx.reply("🚕 Taxi chaqirish uchun quyidagi tugmani bosing:", { parse_mode: "HTML", reply_markup: await mainMenu(false, String(ctx.from?.id ?? "")) });
      return;
    }
    // In group — check whitelist
    const allowed = await prisma.appState.findUnique({ where: { key: "allowed_groups" } });
    const ids = (allowed?.value ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!ids.includes(String(chat.id)) && !isAdmin(String(ctx.from?.id))) {
      // silently ignore non-whitelisted groups to avoid spam
      return;
    }
    const from = ctx.from;
    if (!from) return;
    const mention = from.username ? `@${from.username}` : from.first_name;
    await ctx.reply(
      `${mention}, taxi chaqirish uchun bot'ga o'ting 👇`,
      {
        reply_markup: {
          inline_keyboard: [[{
            text: "🚕 Taxi chaqirish",
            url: `https://t.me/${ctx.me.username}?start=book`,
          }]],
        },
      },
    );
  });

  return bot;
}

/** Congratulate members on badges earned during the last sync. */
export async function notifyNewAchievements(bot: Bot): Promise<void> {
  const pending = await prisma.memberAchievement.findMany({
    where: { notified: false, member: { telegramUser: { isNot: null } } },
    include: { member: { include: { telegramUser: true } } },
  });

  for (const a of pending) {
    const chatId = a.member.telegramUser?.id;
    const text = renderBadgeUnlocked(a.code);
    if (chatId && text) {
      try {
        await bot.api.sendMessage(chatId, text, { parse_mode: "HTML" });
      } catch (e) {
        console.error("[bot] failed to notify", chatId, e);
      }
    }
    await prisma.memberAchievement.update({ where: { id: a.id }, data: { notified: true } });
  }
}

/** Push "+X so'm" messages for cashback that grew during the last refresh. */
export async function notifyCashback(bot: Bot, deltas: CashbackDelta[]): Promise<void> {
  for (const d of deltas) {
    try {
      await bot.api.sendMessage(d.telegramId, renderEarnPush(d.delta, d.total, d.type), { parse_mode: "HTML" });
    } catch (e) {
      console.error("[bot] cashback notify failed", d.telegramId, e);
    }
  }
}

export async function setupBotCommands(bot: Bot): Promise<void> {
  // ALL of this is best-effort boot cosmetics (command menu + menu button). A transient Telegram
  // network blip during a deploy must NEVER become an unhandledRejection that alerts/crashes.
  try {
  // 2026-07-23: reply-keyboard was trimmed to 2 buttons (Do'st chaqirish + Taxi chaqirish — see
  // mainMenu() above). Everything that used to live as a permanent on-screen button now lives
  // here, in Telegram's native "/" commands list, so nothing lost reachability. Owner/admin-only
  // commands (/kod, /admin, /dash, /orders, /elon, /bekor, /photo_clear, /rasmsorov) stay OUT of
  // this public list on purpose — they still work when typed, just aren't advertised.
  await bot.api.setMyCommands([
    { command: "start", description: "Botni boshlash / profil" },
    { command: "ai", description: "🤖 Koson AI — aqlli yordamchi" },
    { command: "bilim", description: "🧠 Koson haqida ma'lumot berish" },
    { command: "menu", description: "📋 Menyu (barcha bo'limlar)" },
    { command: "book", description: "🚕 Taxi chaqirish" },
    { command: "status", description: "📍 Buyurtmam holati" },
    { command: "tarix", description: "🧾 Safarlar tarixi" },
    { command: "me", description: "💰 Hamyon / profil" },
    { command: "account", description: "👤 Hisobim & sozlamalar" },
    { command: "invite", description: "👥 Do'st taklif qilish" },
    { command: "missions", description: "🎁 Bonuslar (vazifalar)" },
    { command: "daily", description: "🔥 Kunlik bonus" },
    { command: "wheel", description: "🎡 Omad g'ildiragi" },
    { command: "baraban", description: "🎰 Safar barabani (yutuq)" },
    { command: "top", description: "🏆 Reyting" },
    { command: "xizmatlar", description: "🔎 Xizmatlar (usta, sartarosh va h.k.)" },
    { command: "rahmat", description: "🙏 Haydovchiga choychaqa" },
    { command: "haydovchi", description: "🚖 Mashina raqami bo'yicha haydovchiga to'lash" },
    { command: "naxt", description: "💵 Tangani naqd pulga aylantirish" },
    { command: "narx", description: "🚖 Narx va cashback" },
    // driver-facing — visible to everyone (Telegram has no per-user command list here), but
    // harmless to a non-driver: each handler just says "siz haydovchi emassiz" or similar.
    { command: "driver", description: "🚗 Haydovchi paneli" },
    { command: "safarlarim", description: "📜 Haydovchi: bugungi safarlar" },
    { command: "daromad", description: "💰 Haydovchi: bugungi daromad" },
    { command: "daraja", description: "🏅 Haydovchi: daraja / reyting" },
    { command: "topshiriq", description: "🎯 Haydovchi topshiriqlari" },
    { command: "qarz", description: "💸 Kas qarzini tanga bilan to'lash" },
    { command: "reys", description: "🚐 Shaharlararo reys" },
    // marketplace (BirJoy) — seller-facing.
    { command: "sotuvchi", description: "🏪 Do'kon ochish (sotuvchi bo'lish)" },
    { command: "dokonim", description: "🏪 Mening do'konim (panel havolasi)" },
    { command: "hikoya", description: "📹 Do'kon-hikoya joylash (sotuvchi)" },
    { command: "help", description: "ℹ️ Yordam" },
  ]);

  // Point the persistent Menu Button at the VERSIONED app URL. The old menu button had no
  // ?v= → Telegram cached it forever → users opened the stale (UZ-blocked-map) build. This
  // syncs to EVERY user automatically (no /start needed); re-runs each boot with the live hash.
  await refreshWebAppVer();
  if (canWebApp) {
    try {
      // The bot Menu Button (chat-input chip) is the MOST reliable Mini App entry point — Telegram
      // ALWAYS injects initData for this tap (unlike reply-keyboard web_app buttons, which Web Z /
      // Desktop sometimes start with a few-hundred-ms initData delay). Owner preference: land on the
      // HOME screen (living map + one-tap CTA + shortcuts), NOT straight into the booking map.
      await bot.api.setChatMenuButton({ menu_button: { type: "web_app", text: "🚕 BirJoy", web_app: { url: webAppUrl() } } });
    } catch (e) {
      console.error("[bot] setChatMenuButton failed", e instanceof Error ? e.message : e);
    }
  }
  } catch (e) {
    console.error("[bot] setupBotCommands failed (transient TG API — non-fatal):", e instanceof Error ? e.message : e);
  }
}
