import crypto from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { installAsyncGuard } from "./asyncGuard";
import compression from "compression";
import type { MemberType } from "@t1067/shared";
import { env } from "../env";
import {
  getAdminMembers,
  getAdminStats,
  getBotUsers,
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
import { getReferralInfo } from "../services/referralService";
import { getWeeklyBoard } from "../services/weeklyService";
import { getWallet, topUpFromBonus, withdraw } from "../services/coinService";
import {
  createCashout,
  cashoutBalance,
  hasPendingCashout,
  CASHOUT_CARD_MIN,
  CASHOUT_HOME_MIN,
  type CashoutMethod,
  type CashoutOwnerNotice,
} from "../services/cashoutService";
import { findDriverByCar, getDriverEarnings, lookupDriverForPay, lookupRecipient, transfer } from "../services/transferService";
import { prisma } from "../db";
import { getFareConfig } from "../services/clientInfoService";
import { callOneTapFor, cancelBookingFor, createBookingFor, estimateFare, getActiveBookingFor, getBookingInfo, getRecentPickups, nearestAddressFor, searchBookingAddress } from "../services/bookingService";
import type { BookingCreateBody, BookingNowBody, GeoPt } from "@t1067/shared";
import { validateContactResponse, validateInitData } from "./telegramAuth";
import { isTgBanned } from "../services/banService";
import { featureOn } from "../services/featureFlags";

export interface ApiOptions {
  afterSync?: () => Promise<void>;
  sendMessage?: (telegramId: string, html: string) => Promise<void>;
  /** Forward a Mini-App cash-out request to the owner's Telegram (bot-bound; set in index.ts). */
  notifyCashoutOwner?: (notice: CashoutOwnerNotice) => Promise<void>;
  /** 🛍 Forward a shop purchase to the owner's Telegram [✅ Yetkazildi]/[❌ Rad] (bot-bound). */
  notifyShopOwner?: (notice: import("../services/shopService").ShopOwnerNotice) => Promise<void>;
  notifyMarketOrder?: (notice: import("./../bot/market").MarketOrderNotice) => Promise<void>; // 🧺 V2
  /** 🔎 Forward a self-submitted service listing to the owner's Telegram [✅/❌] (bot-bound). */
  notifyServiceOwner?: (notice: import("../services/serviceDirectory").ServiceOwnerNotice) => Promise<void>;
  /** 🔎 Forward an unmet-demand request ("topilmadi → so'rov") to the owner's Telegram (info-only). */
  notifyServiceDemand?: (notice: import("../services/serviceDirectory").ServiceDemandNotice) => Promise<void>;
  /** 📋 Forward a new pending e'lon to the owner's Telegram [✅ Chiqarish]/[❌ Rad] (bot-bound). */
  notifyElonlarOwner?: (notice: import("../services/classifiedService").ClassifiedOwnerNotice) => Promise<void>;
  /** 🍽 New restoran order → owner info card (no buttons — operator acts from admin panel, R3). */
  notifyRestoranOwner?: (notice: import("../services/restoranService").FoodOrderOwnerNotice) => Promise<void>;
  /** 🍽 Order status advanced (accepted/preparing/delivering/delivered) → rider push (qulaylik #1). */
  notifyRiderOrderStatus?: (notice: { memberId: number; restaurantName: string; newStatus: string }) => Promise<void>;
  /** 🍽 Order rejected → rider push with the reason. */
  notifyRiderOrderRejected?: (notice: { memberId: number; restaurantName: string; reason: string }) => Promise<void>;
  /** 🎀 New Ravella order → PARTNER card with [✅ Qabul][☎️ Bog'landim][✔ Bajarildi][❌ Rad] (+owner CC). */
  notifyRavellaPartner?: (notice: import("../services/ravellaService").RavellaOwnerNotice) => Promise<void>;
  /** 🎀 Ravella order status changed → customer push (cashback berilgan bo'lsa summasi bilan). */
  notifyRavellaCustomer?: (notice: { memberId: number; itemName: string; newStatus: string; cashbackSom?: number; reason?: string }) => Promise<void>;
}

/** 🔐 Telegram fayl-baytlarini SERVER orqali uzatish.
 *
 *  XAVFSIZLIK (2026-07-28, jonli topildi): bu funksiyagacha har rasm-endpoint
 *  `res.redirect(302, <telegram file URL>)` qilardi, o'sha URL esa `…/file/bot<BOT_TOKEN>/…`
 *  ko'rinishida — ya'ni **BOT_TOKEN har rasm so'rovida brauzerga qaytardi**. Do'kon rasmlari
 *  ochiq (mehmonga ham) bo'lgani uchun tokenni istalgan odam bitta `curl -I` bilan olardi va
 *  bot ustidan to'liq nazoratga ega bo'lardi (barcha foydalanuvchiga xabar, webhook o'g'irlash).
 *  Endi baytlar biz orqali oqadi va token serverdan chiqmaydi.
 *
 *  Oqim (`pipe`) ishlatiladi — butun faylni xotiraga yig'ish YO'Q (hikoya-videolari MB'lab
 *  bo'lishi mumkin). Upstream yiqilsa 404: mijoz uchun "rasm yo'q" — token oshkor bo'lgandan
 *  ko'ra ming marta yaxshi. */
/** ⚡ RASM KESHI (ega, 2026-07-28 — «do'kon bo'limi qotmoqda»).
 *
 *  O'LCHOV (jonli, curl): kartochka rasmi ~30 KB / to'liq rasm 450-545 KB, HAR BIRI uchun server
 *  avval Telegram'ga `getFile` so'rovi yuborardi, keyin faylni Telegram'dan ko'chirib olib mijozga
 *  quyardi — ya'ni bitta ekran (24 kafel) = 24 ta Telegram aylanmasi + 24 ta yuklab olish.
 *  Bir foydalanuvchi ko'rgan rasmni ikkinchisi so'raganda hammasi BOSHIDAN takrorlanardi.
 *
 *  Endi baytlar xotirada saqlanadi (LRU, byudjet bilan): birinchi so'rov Telegram'dan, qolgani
 *  xotiradan. Token baribir serverdan chiqmaydi (§63 xavfsizlik qoidasi buzilmaydi).
 *  Katta fayllar (>2 MB — hikoya-videolari) keshlanmaydi va eski oqim yo'lidan ketadi. */
const IMG_CACHE_BUDGET = 96 * 1024 * 1024; // ~96 MB — VPS'da 6.5 GB bo'sh RAM bor
const IMG_CACHE_MAX_ITEM = 2 * 1024 * 1024;
interface ImgEntry { buf: Buffer; type: string; etag: string }
const imgCache = new Map<string, ImgEntry>(); // Map tartibi = LRU (eskisi boshida)
let imgCacheBytes = 0;
function imgCacheGet(key: string): ImgEntry | undefined {
  const hit = imgCache.get(key);
  if (!hit) return undefined;
  imgCache.delete(key); // "yaqinda ishlatilgan" — oxiriga ko'chadi
  imgCache.set(key, hit);
  return hit;
}
function imgCachePut(key: string, e: ImgEntry): void {
  if (e.buf.length > IMG_CACHE_MAX_ITEM) return;
  const prev = imgCache.get(key);
  if (prev) imgCacheBytes -= prev.buf.length; // qayta yozishda eski hajm hisobdan chiqadi
  imgCache.set(key, e);
  imgCacheBytes += e.buf.length;
  while (imgCacheBytes > IMG_CACHE_BUDGET) {
    const oldest = imgCache.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    imgCacheBytes -= imgCache.get(oldest)?.buf.length ?? 0;
    imgCache.delete(oldest);
  }
}
function imgEtag(buf: Buffer): string {
  return `W/"${crypto.createHash("sha1").update(buf).digest("base64url").slice(0, 22)}"`;
}
/** Baytlarni ETag bilan yuboradi. `max-age` ATAYLAB 1 soatligicha qoldirildi (eskirish xavfi
 *  oshmasin — sotuvchi rasmni almashtirsa 1 soatda ko'rinadi). Tezlik ETag'dan keladi: soat
 *  o'tgach brauzer 500 KB ni QAYTA YUKLAMAYDI, ~200 baytlik 304 oladi. `stale-while-revalidate`
 *  esa eski nusxani darhol ko'rsatib, yangisini fonda tekshiradi — ekran kutib turmaydi. */
function sendImage(req: Request, res: Response, buf: Buffer, type: string, maxAgeSec = 3600): void {
  const etag = imgEtag(buf);
  res.set("Content-Type", type).set("ETag", etag)
    .set("Cache-Control", `private, max-age=${maxAgeSec}, stale-while-revalidate=86400`);
  if (req.headers["if-none-match"] === etag) { res.status(304).end(); return; }
  res.send(buf);
}
async function pipeTelegramFile(res: Response, url: string, maxAgeSec = 3600, req?: Request): Promise<void> {
  // Kesh kaliti — URL'ning TOKENSIZ qismi (token xotirada ham, logda ham qolmasin)
  const key = url.replace(/\/file\/bot[^/]+\//, "/file/");
  const cached = req ? imgCacheGet(key) : undefined;
  if (cached && req) { sendImage(req, res, cached.buf, cached.type, maxAgeSec); return; }
  try {
    const upstream = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!upstream.ok || !upstream.body) { res.status(404).end(); return; }
    const type = upstream.headers.get("content-type") ?? "application/octet-stream";
    const len = Number(upstream.headers.get("content-length") ?? 0);
    // Kichik fayl (rasm) → xotiraga yig'ib keshlaymiz. Katta fayl (video) → eski oqim yo'li.
    if (req && len > 0 && len <= IMG_CACHE_MAX_ITEM) {
      const buf = Buffer.from(await upstream.arrayBuffer());
      imgCachePut(key, { buf, type, etag: imgEtag(buf) });
      sendImage(req, res, buf, type, maxAgeSec);
      return;
    }
    res.set("Content-Type", type);
    if (len) res.set("Content-Length", String(len));
    res.set("Cache-Control", `private, max-age=${maxAgeSec}`);
    const { Readable } = await import("node:stream");
    const node = Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]);
    node.on("error", () => { if (!res.headersSent) res.status(404).end(); else res.end(); });
    node.pipe(res);
  } catch {
    if (!res.headersSent) res.status(404).end(); else res.end();
  }
}

function memberType(req: Request, fallback: MemberType): MemberType {
  const t = req.query.type;
  return t === "client" || t === "driver" ? t : fallback;
}

function resolveTelegramId(req: Request): string | null {
  // P0-sec (QA fleet): initData ONLY from the header — NOT the query string (a signed initData
  // in the URL leaks into server logs + Referer headers and can be replayed).
  const initData = (req.header("X-Telegram-Init-Data") as string) || "";
  const dbg = req.header("X-Debug-Telegram-Id");
  if (initData && env.BOT_TOKEN) {
    const res = validateInitData(initData, env.BOT_TOKEN);
    if (env.allowDebugAuth) {
      const u = res.user?.id ? `***${String(res.user.id).slice(-3)}` : "-";
      console.log(`[auth] ${req.path} ok=${res.ok} reason=${res.reason ?? "-"} user=${u}`);
    }
    return res.ok && res.user ? String(res.user.id) : null;
  }
  // P0-sec: trust the debug header ONLY on an EXPLICIT opt-in (ALLOW_DEBUG_AUTH=true), never
  // merely because a bot token is absent — otherwise a prod misconfig (empty BOT_TOKEN) would
  // let anyone impersonate any user via X-Debug-Telegram-Id.
  if (env.allowDebugAuth && dbg) return dbg;
  return null;
}

function requireUser(req: Request, res: Response, next: NextFunction): void {
  const id = resolveTelegramId(req);
  if (!id) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  // 🚫 hard-ban gate: a banned Telegram id is locked out of EVERY Mini App endpoint (O(1) in-memory
  // set, no DB hit). Mirrors the bot-side gate — total product lockout, distinct from riskFlag.
  if (isTgBanned(id)) {
    res.status(403).json({ error: "banned" });
    return;
  }
  res.locals.telegramId = id;
  next();
}

// 🚪 GUEST read-only. Same identity resolution as requireUser, but a MISSING identity is not an
// error — the handler just serves public data. Only ever mounted on read-only catalogue GETs
// (do'kon, restoran, xizmatlar, mahalla); everything that touches money, orders or personal data
// keeps requireUser. Why: of 1060 people who pressed /start, 289 never linked and 286 never even
// tapped the button (DB, 2026-07-26) — they were asked to hand over a phone number before being
// shown anything. Now they can look first. A banned id is still locked out.
function allowGuest(req: Request, res: Response, next: NextFunction): void {
  const id = resolveTelegramId(req);
  if (id && isTgBanned(id)) {
    res.status(403).json({ error: "banned" });
    return;
  }
  res.locals.telegramId = id; // may be null → guest
  next();
}

// P0.8: lightweight in-memory rate limiter (no dep). Keyed on the resolved
// telegram id (set by requireUser/requireAdmin, which run first).
const rlBuckets = new Map<string, { n: number; resetAt: number }>();
function rateLimit(maxPerMin: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (rlBuckets.size > 50_000) rlBuckets.clear(); // bound memory
    // Guests have no telegram id — bucket them per IP instead, otherwise every unlinked visitor in
    // the country would share one "anon" bucket and rate-limit each other out of the catalogue.
    const who = (res.locals.telegramId as string) || `ip:${req.ip ?? "?"}`;
    const key = `${who}:${maxPerMin}`;
    const now = Date.now();
    let b = rlBuckets.get(key);
    if (!b || now > b.resetAt) {
      b = { n: 0, resetAt: now + 60_000 };
      rlBuckets.set(key, b);
    }
    b.n++;
    if (b.n > maxPerMin) {
      res.status(429).json({ error: "too_many_requests", retryAfter: Math.ceil((b.resetAt - now) / 1000) });
      return;
    }
    next();
  };
}

// like withMember (defined later for booking) but available early for items
function withMember2(handler: (memberId: number, req: Request, res: Response) => Promise<unknown>) {
  return async (req: Request, res: Response) => {
    const memberId = await getMemberId(res.locals.telegramId as string);
    if (!memberId) {
      res.status(404).json({ error: "not linked" });
      return;
    }
    res.json(await handler(memberId, req, res));
  };
}

// constant-time token compare (V-NEXT #4): a plain === leaks match-length via response timing,
// letting an attacker recover the admin token byte-by-byte. Length check first is fine — length
// itself is not secret enough to matter, and timingSafeEqual REQUIRES equal-length buffers.
function tokenEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// 🛍 shopseller is scoped at the CHOKE POINT, not just hidden in the UI: a leaked/misused token
// must not read economy/members/finance even via direct API calls. Only /api/admin/shop/* +
// whoami/health (used by the panel shell itself) pass.
function pathAllowedForShopSeller(path: string): boolean {
  return path.startsWith("/api/admin/shop/") || path === "/api/admin/whoami" || path === "/api/admin/health";
}

// 🎧 Super Operator (chatops): same choke-point discipline as shopseller — a leaked operator
// token must not reach financial/moderation/config endpoints. Scoped to the chat-escalation +
// call-center + ops-dashboard surface only (/api/admin/chat/*, /api/admin/opr/*) + the shell
// bootstrap routes. Money-adjacent actions inside /api/admin/opr/* (coins/ban/cancel) are the
// SAME functions the owner's full dashboard already calls — scoping here is about which ROUTES
// an operator token can reach at all, not a second permission system.
function pathAllowedForChatOps(path: string): boolean {
  return path.startsWith("/api/admin/chat/") || path.startsWith("/api/admin/opr/") || path === "/api/admin/whoami" || path === "/api/admin/health";
}

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  // desktop dashboard (no Telegram): a strong shared token grants admin access
  const token = req.header("X-Admin-Token");
  if (env.ADMIN_PANEL_TOKEN && token && tokenEquals(token, env.ADMIN_PANEL_TOKEN)) {
    res.locals.telegramId = "panel";
    res.locals.adminRole = "owner";
    next();
    return;
  }
  // roles-lite (M6): owner-issued operator tokens live in AppState — read-mostly access
  if (token) {
    void prisma.appState
      .findUnique({ where: { key: `oprtoken:${token}` } })
      .then((row) => {
        if (!row) { res.status(403).json({ error: "forbidden" }); return; }
        // V1.2 (BirJoy): token qiymati "shopseller" (legacy = do'kon #1) YOKI "shopseller:<shopId>"
        // — multi-vendor'da har seller FAQAT o'z do'konining satrlariga scoped.
        const raw = row.value || "operator";
        const sellerMatch = /^shopseller(?::(\d+))?$/.exec(raw);
        // 🎧 Super Operator: token value "chatops:<Name>" — a named human, not just "operator".
        // res.locals.operatorName drives BOTH the audit-log actorRole and the admin-UI shell
        // switch (a chatops role gets the minimal 4-tab console, never the owner's full dashboard).
        const chatopsMatch = /^chatops:(.+)$/.exec(raw);
        const role = sellerMatch ? "shopseller" : chatopsMatch ? "chatops" : raw;
        if (role === "shopseller" && !pathAllowedForShopSeller(req.path)) {
          res.status(403).json({ error: "shop_only" });
          return;
        }
        if (role === "chatops" && !pathAllowedForChatOps(req.path)) {
          res.status(403).json({ error: "chatops_only" });
          return;
        }
        res.locals.telegramId = "panel-operator";
        res.locals.adminRole = role;
        if (sellerMatch) res.locals.sellerShopId = Number(sellerMatch[1] ?? 1); // legacy bare token = «BirJoy o'z do'koni»
        if (chatopsMatch) res.locals.operatorName = chatopsMatch[1];
        next();
      })
      .catch(() => res.status(403).json({ error: "forbidden" }));
    return;
  }
  const id = resolveTelegramId(req);
  if (!id || !isAdmin(id)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  res.locals.telegramId = id;
  res.locals.adminRole = "owner";
  res.locals.operatorName = "Sarvarxon"; // owner's own actions in the operator console are still attributable
  next();
}

// money/config endpoints stay owner-only; operators get read + announce
function requireOwner(_req: Request, res: Response, next: NextFunction): void {
  if (res.locals.adminRole !== "owner") {
    res.status(403).json({ error: "owner_only" });
    return;
  }
  next();
}

// 🛍 shop-seller role (roles-lite, M6 pattern): a narrow token-based role that can list/create/edit/
// toggle/upload photos for Products — everything EXCEPT delete-product and review-moderation, which
// stay owner-only. Lets a real hamkor-do'kon seller (e.g. @Shekh_of) fix prices/stock without full
// admin powers. Owner token still passes (adminRole "owner").
function requireShopWrite(_req: Request, res: Response, next: NextFunction): void {
  const role = res.locals.adminRole as string;
  if (role !== "owner" && role !== "shopseller") {
    res.status(403).json({ error: "owner_only" });
    return;
  }
  next();
}

export function createApiServer(opts: ApiOptions = {}) {
  const app = express();
  installAsyncGuard(app);
  app.use(cors());
  app.use(compression()); // T2: gzip har javobga — WAN'da payload kichrayadi (telefon uchun)
  // 6mb: photo-upload routes (driver portrait, shop product) send base64 JSON — the GLOBAL parser
  // runs FIRST, so its default 100kb limit was 413-ing every real photo before the per-route
  // express.json({limit:"6mb"}) could apply (the per-route parser no-ops once req.body exists).
  app.use(express.json({ limit: "6mb" }));
  app.set("etag", "strong"); // T2: shartli so'rovlar uchun ETag (304)

  app.get("/health", (_req, res) => {
    res.json({ ok: true, mode: env.KAS_MODE, bot: env.hasBot });
  });

  app.get("/api/me", allowGuest, async (_req, res) => {
    const [me, booking3, intercity, tierloyalty, shopOn, xizmatlarOn, elonlarOn, restoranOn,  bazarcartOn, revtangaOn, shopstoryOn, shopchatOn,  ravellaOn, linkinappOn, homescreenOn, storyshareOn, autolocOn] = await Promise.all([
      getMe(res.locals.telegramId as string),
      featureOn("booking3"),
      featureOn("intercity"),
      featureOn("tierloyalty"),
      featureOn("shop"),
      featureOn("xizmatlar"),
      featureOn("elonlar"),
      featureOn("restoran"),
      featureOn("bazarcart"),
      featureOn("revtanga"),
      featureOn("shopstory"),
      featureOn("shopchat"),
      featureOn("ravella"),
      featureOn("linkinapp"),
      featureOn("homescreen"),
      featureOn("storyshare"),
      featureOn("autoloc"),
    ]);
    // 🚪 Mehmon (yoki ulanmagan) — 401 EMAS. Bayroqlar baribir yuboriladi: mijoz ilovaga kiradi,
    // katalogni ko'radi, raqam faqat harakat paytida so'raladi. `guest` = Telegram identifikatori
    // umuman yo'q; `linked:false` + guest:false = Telegram bor, lekin raqam ulanmagan.
    if (!me) {
      const guest = !res.locals.telegramId;
      res.json({
        linked: false,
        guest,
        flags: { shop: shopOn, xizmatlar: xizmatlarOn, restoran: restoranOn,  bazarcart: bazarcartOn,   ravella: ravellaOn, linkinapp: linkinappOn || isAdmin(String(res.locals.telegramId ?? "")) },
      });
      return;
    }
    // 🏅 owner-preview: admins see the tier-loyalty UI even while the global flag is DARK, so the
    // owner can QABUL the screens before go-live. (The real cashback multiplier stays globally gated.)
    const tierPreview = tierloyalty || isAdmin(res.locals.telegramId as string);
    // 🛍 shop owner-preview mirrors it — owner QABULs the shop tab while the flag is DARK
    const shopPreview = shopOn || isAdmin(res.locals.telegramId as string);
    // 🔎 xizmatlar owner-preview mirrors it — owner QABULs the directory while DARK
    const xizmatlarPreview = xizmatlarOn || isAdmin(res.locals.telegramId as string);
    // 📋 elonlar owner-preview mirrors it — owner QABULs the E1 tab-swap before it goes live
    const elonlarPreview = elonlarOn || isAdmin(res.locals.telegramId as string);
    // 🍽 restoran owner-preview mirrors it — owner QABULs the catalog (R1) before it goes live
    const restoranPreview = restoranOn || isAdmin(res.locals.telegramId as string);
    // 🧺 bazarcart owner-preview — savat-checkout QABUL while DARK
    const bazarcartPreview = bazarcartOn || isAdmin(res.locals.telegramId as string);
    // 🗣 revtanga owner-preview — sharh-uchun-tanga hint QABUL'gacha faqat ega ekranida
    const revtangaPreview = revtangaOn || isAdmin(res.locals.telegramId as string);
    // 📹 shopstory owner-preview — do'kon-hikoya QABUL'gacha faqat ega ekranida
    const shopstoryPreview = shopstoryOn || isAdmin(res.locals.telegramId as string);
    // 💬 shopchat owner-preview — mijoz↔do'kon chat QABUL'gacha faqat ega ekranida
    const shopchatPreview = shopchatOn || isAdmin(res.locals.telegramId as string);
    // 🏪 shopv2 owner-preview — BirJoy Market qorong'i-qayta-dizayni QABUL'gacha faqat ega ekranida
    // 🎀 ravella owner-preview — bezak konstruktori QABUL'gacha faqat ega ekranida ko'rinadi
    const ravellaPreview = ravellaOn || isAdmin(res.locals.telegramId as string);
    res.json({ ...me, flags: { booking3, intercity, tierloyalty: tierPreview, shop: shopPreview, xizmatlar: xizmatlarPreview, elonlar: elonlarPreview, restoran: restoranPreview,  bazarcart: bazarcartPreview, revtanga: revtangaPreview, shopstory: shopstoryPreview, shopchat: shopchatPreview,   ravella: ravellaPreview, linkinapp: linkinappOn || isAdmin(res.locals.telegramId as string), homescreen: homescreenOn || isAdmin(res.locals.telegramId as string), storyshare: storyshareOn || isAdmin(res.locals.telegramId as string), autoloc: autolocOn } });
  });

  /**
   * 📱 RAQAMNI ILOVA ICHIDA ULASH — Mini App'ning `WebApp.requestContact()` javobi.
   *
   * Nega: ilgari ulanmagan mijoz "Raqamni ulash" bosganda ilovadan CHIQIB botga otilardi. DB
   * o'lchovi (2026-07-26): /start bosgan 1060 odamdan 289 tasi ulanmagan, shundan 286 tasi
   * tugmani umuman bosmagan. Endi ulash ilova ichida, bitta tasdiqda tugaydi.
   *
   * XAVFSIZLIK — ikki mustaqil isbot, ikkalasi ham SHART:
   *   1. `hash` imzosi (bot tokeni bilan) → raqamni TELEGRAM tasdiqlagan, mijoz o'ylab topmagan.
   *   2. `contact.user_id === initData'dagi id` → bu raqam AYNAN shu autentifikatsiya qilingan
   *      foydalanuvchiniki. Bu bot yo'lidagi `contact.user_id !== ctx.from.id` qoidasining ayni
   *      ekvivalenti — usiz begona hisobga ulanib olish mumkin bo'lardi.
   * Ulash va hamma mukofot qadami `completeLink` da — bot bilan BITTA yo'l, nusxa yo'q.
   */
  app.post("/api/link/contact", requireUser, rateLimit(6), async (req, res) => {
    const tgId = res.locals.telegramId as string;
    const body = (req.body ?? {}) as { response?: string; hash?: string };
    const v = validateContactResponse(String(body.response ?? ""), body.hash ? String(body.hash) : null, env.BOT_TOKEN);
    if (!v.ok || !v.contact) {
      res.status(400).json({ ok: false, status: "bad_contact", reason: v.reason });
      return;
    }
    if (String(v.contact.user_id) !== tgId) {
      console.warn(`[link] contact user_id mismatch: signed=${v.contact.user_id} auth=${tgId}`);
      res.status(403).json({ ok: false, status: "not_own_contact" });
      return;
    }
    const profile = { firstName: v.contact.first_name, lastName: v.contact.last_name };
    await touchTelegramUser(tgId, profile).catch(() => undefined);
    const { completeLink } = await import("../services/linkService");
    const r = await completeLink(tgId, v.contact.phone_number, profile);
    if (r.status === "linked" && opts.sendMessage) {
      // Uchinchi shaxs mukofotlari (taklif qilgan do'st / QR-haydovchi) — bot yo'lidagi bilan bir xil.
      for (const n of r.notices) await opts.sendMessage(n.telegramId, n.html).catch(() => undefined);
      // Foydalanuvchining o'ziga tasdiq: ilova darhol ko'rsatadi, chatda ham yozuv qolsin (sovg'a
      // qatorlari bilan). Bot yo'lidagi poster-karta bu yerda takrorlanmaydi — matn yetarli.
      const { renderLinked } = await import("../bot/render");
      const html = renderLinked(r.fullName ?? "Mijoz") + (r.extras.length ? `\n\n${r.extras.join("\n")}` : "");
      await opts.sendMessage(tgId, html).catch(() => undefined);
    }
    res.json({ ok: r.status === "linked", status: r.status, extras: r.extras });
  });

  // 🏅 Tier ladder benefits — labels derived from LIVE knobs (single source of truth). 60s client cache.
  app.get("/api/tier-benefits", requireUser, async (_req, res) => {
    const { getTierBenefits } = await import("../services/tierLoyaltyService");
    res.set("Cache-Control", "private, max-age=60");
    res.json(await getTierBenefits());
  });

  app.post("/api/checkin", requireUser, async (_req, res) => {
    const memberId = await getMemberId(res.locals.telegramId as string);
    if (!memberId) {
      res.status(404).json({ error: "not linked" });
      return;
    }
    res.json(await dailyCheckIn(memberId));
  });

  app.post("/api/wheel", requireUser, async (req, res) => {
    const memberId = await getMemberId(res.locals.telegramId as string);
    if (!memberId) {
      res.status(404).json({ error: "not linked" });
      return;
    }
    // P1 (QA fleet): spinWheel now gates feature:wheel internally and ALWAYS returns a valid
    // WheelSpinResponse (noRide when off). The old endpoint disabled-branch returned an
    // off-contract {luckyDay, ok, reason} shape → the typed client read .prize and crashed.
    res.json(await spinWheel(memberId));
  });
  app.post("/api/wheel/free", requireUser, rateLimit(20), async (req, res) => {
    const memberId = await getMemberId(res.locals.telegramId as string);
    if (!memberId) {
      res.status(404).json({ error: "not linked" });
      return;
    }
    const { freeSpin } = await import("../services/rewardService");
    res.json(await freeSpin(memberId));
  });

  app.get("/api/wallet", requireUser, async (_req, res) => {
    const memberId = await getMemberId(res.locals.telegramId as string);
    if (!memberId) {
      res.status(404).json({ error: "not linked" });
      return;
    }
    res.json(await getWallet(memberId));
  });

  app.post("/api/wallet/withdraw", requireUser, rateLimit(5), async (req, res) => {
    const memberId = await getMemberId(res.locals.telegramId as string);
    if (!memberId) {
      res.status(404).json({ error: "not linked" });
      return;
    }
    const amount = Math.floor(Number((req.body as { amount?: number })?.amount ?? 0));
    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: "amount required" });
      return;
    }
    res.json(await withdraw(memberId, amount));
  });

  // 💵 Real cash-out (tanga → plastik karta / naxt uyga). Records a request + pings the owner's
  // Telegram with [✅ To'landi]/[❌ Rad]; tangas are spent ONLY on owner approval (cashoutService).
  // The card number is validated + masked HERE and NEVER persisted — the full number rides only the
  // transient owner message. Withdraws the whole eligible balance (parity with the bot /naxt flow).
  app.post("/api/wallet/cashout", requireUser, rateLimit(5), async (req, res) => {
    if (!(await featureOn("cashout"))) {
      res.status(403).json({ ok: false, reason: "off" });
      return;
    }
    const me = await getMe(res.locals.telegramId as string);
    if (!me) {
      res.status(404).json({ ok: false, reason: "not_linked" });
      return;
    }
    const b = (req.body ?? {}) as { method?: string; cardNumber?: string; cardHolder?: string; address?: string };
    const method: CashoutMethod = b.method === "home" ? "home" : "card";
    const bal = await cashoutBalance(me.member.id);
    const min = method === "home" ? CASHOUT_HOME_MIN : CASHOUT_CARD_MIN;
    if (bal < min) {
      res.json({ ok: false, reason: "below_min", min });
      return;
    }
    if (await hasPendingCashout(me.member.id)) {
      res.json({ ok: false, reason: "pending_exists" });
      return;
    }

    let mask: string;
    let cardFull: string | undefined;
    let cardHolder: string | undefined;
    let address: string | undefined;
    if (method === "card") {
      const digits = String(b.cardNumber ?? "").replace(/\D/g, "");
      if (digits.length < 16) {
        res.json({ ok: false, reason: "bad_card" });
        return;
      }
      const holder = String(b.cardHolder ?? "").trim().slice(0, 60);
      if (holder.length < 3) {
        res.json({ ok: false, reason: "no_holder" });
        return;
      }
      mask = `•••• ${digits.slice(-4)} · ${holder}`;
      cardFull = digits;
      cardHolder = holder;
    } else {
      address = String(b.address ?? "").trim().slice(0, 120);
      if (address.length < 5) {
        res.json({ ok: false, reason: "bad_address" });
        return;
      }
      mask = address;
    }

    const phone = me.member.phone ?? "—";
    const created = await createCashout(me.member.id, bal, method, mask, phone);
    if (!created.ok) {
      res.json({ ok: false, reason: created.reason }); // atomic re-check lost the race → same shape as the pre-check above
      return;
    }
    const id = created.id;
    const notice: CashoutOwnerNotice = { id, name: me.member.fullName ?? "Mijoz", amount: bal, method, contact: phone, trips: me.stats.trips, cardFull, cardHolder, address };
    if (opts.notifyCashoutOwner) await opts.notifyCashoutOwner(notice).catch(() => undefined);
    res.json({ ok: true, id, amount: bal, method });
  });

  // ── 🛍 TANGA SHOP (feature "shop", DARK until QABUL) ──────────────────────────────────────────
  app.get("/api/shop/products", allowGuest, rateLimit(30), async (req, res) => {
    const { listActiveProducts } = await import("../services/shopService");
    res.set("Cache-Control", "private, max-age=30");
    // owner-preview: admins browse the REAL catalog while the flag is DARK (QABUL flow); riders get []
    // 🧡 V2b: memberId softly resolved (null-safe) — isFav faqat linked a'zolarga hisoblanadi
    const memberId = (await getMemberId(res.locals.telegramId as string)) ?? undefined;
    // AUDIT: `?shopId=` — do'kon ochilganda O'SHA do'konning to'liq vitrinasi (global 100-limit
    // katta do'konni kesib qo'yardi). Yo'q bo'lsa — avvalgidek global ro'yxat.
    const shopId = Number(req.query.shopId) || undefined;
    res.json({ products: await listActiveProducts(isAdmin(res.locals.telegramId as string), memberId, shopId) });
  });
  // 🔗 BITTA MAHSULOT (ega, 2026-07-28 — «100 limitni to'g'irla» zanjirining oxirgi bo'g'ini):
  // deep-link (`?go=dokon&p=<id>`) mahsulotni MIJOZ XOTIRASIDAGI ro'yxatdan qidirardi; ro'yxat
  // esa kesilgan edi, ya'ni ulashilgan havola ochilganda hech narsa ochilmasdi (jimgina).
  // Endi ro'yxatda topilmasa shu yo'ldan aniq so'raladi.
  app.get("/api/shop/product/:id", allowGuest, rateLimit(60), async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) { res.status(404).json({ error: "not_found" }); return; }
    const { listActiveProducts } = await import("../services/shopService");
    const memberId = (await getMemberId(res.locals.telegramId as string)) ?? undefined;
    const [p] = await listActiveProducts(isAdmin(res.locals.telegramId as string), memberId, undefined, undefined, [id]);
    if (!p) { res.status(404).json({ error: "not_found" }); return; }
    res.set("Cache-Control", "private, max-age=30").json({ product: p });
  });
  // 🧡 V2b: sevimlilar toggle + ro'yxat
  app.post("/api/shop/fav", requireUser, rateLimit(30), withMember2(async (memberId, req, res) => {
    const { toggleProductFavorite } = await import("../services/shopService");
    void res;
    return await toggleProductFavorite(memberId, Number(req.body?.productId), !!req.body?.on);
  }));
  app.get("/api/shop/favs", requireUser, rateLimit(20), withMember2(async (memberId, _req, res) => {
    const { listFavoriteProducts } = await import("../services/shopService");
    return { products: await listFavoriteProducts(memberId, isAdmin(res.locals.telegramId as string)) };
  }));
  app.post("/api/shop/buy", requireUser, rateLimit(10), withMember2(async (id, req, res) => {
    const { buyProduct } = await import("../services/shopService");
    const pay = req.body?.pay === "cash" ? ("cash" as const) : ("tanga" as const);
    const r = await buyProduct(id, Number(req.body?.productId), String(req.body?.address ?? ""), isAdmin(res.locals.telegramId as string), pay);
    if (r.ok && r.notice && opts.notifyShopOwner) await opts.notifyShopOwner(r.notice).catch(() => undefined);
    const { notice: _n, ...pub } = r; // owner-notice (phone/address) never leaves the server response path
    return pub;
  }));
  app.get("/api/shop/orders", requireUser, rateLimit(30), withMember2(async (id) => {
    const { myPurchases } = await import("../services/shopService");
    return { orders: await myPurchases(id) };
  }));
  // public product photo proxy (img tag) — driver-photo clone: resolve file_id → 302 to Telegram CDN.
  // /:n serves the Nth gallery photo (0 = cover) for the swipeable detail view.
  const shopPhotoHits = new Map<string, { n: number; at: number }>();
  const serveShopPhoto = async (req: Request, res: Response): Promise<void> => {
    const ipKey = String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "?").split(",")[0]!.trim();
    if (shopPhotoHits.size > 10_000) shopPhotoHits.clear();
    const now = Date.now();
    const h = shopPhotoHits.get(ipKey);
    if (h && now - h.at < 60_000 && h.n >= 120) { res.status(429).end(); return; }
    shopPhotoHits.set(ipKey, h && now - h.at < 60_000 ? { n: h.n + 1, at: h.at } : { n: 1, at: now });
    const { resolveProductPhoto } = await import("../services/shopService");
    const idx = Math.max(0, Math.min(10, Number(req.params.n ?? 0) || 0));
    // ?s=1 → ~320px Telegram tier for card/row lists (perf: ~15KB vs ~200KB per image)
    const url = await resolveProductPhoto(Number(req.params.productId), idx, req.query.s === "1");
    if (!url) { res.status(404).end(); return; }
    if (url.startsWith("data:")) {
      const m = /^data:([^;]+);base64,(.*)$/.exec(url);
      if (!m) { res.status(404).end(); return; }
      sendImage(req, res, Buffer.from(m[2]!, "base64"), m[1]!);
      return;
    }
    await pipeTelegramFile(res, url, 3600, req);
  };
  app.get("/api/shop/photo/:productId", serveShopPhoto);
  app.get("/api/shop/photo/:productId/:n", serveShopPhoto);

  // 🏪 V1.4 (BirJoy): Bozor-bosh payload — do'kon-rail + kategoriya-karusel + server-qidiruv
  // (?q= nol-natijasi MarketDemand'ga yoziladi). bazar DARK + admin emas → bo'sh (UI eski holicha).
  app.get("/api/shop/market", allowGuest, rateLimit(30), async (req, res) => {
    const { getMarketHome } = await import("../services/shopService");
    res.set("Cache-Control", "private, max-age=30");
    // memberId endi IXTIYORIY (avval withMember2 mehmonga 404 qaytarardi) — mehmon bozorni ko'radi,
    // faqat shaxsiy bezaklar (sevimli, sodiqlik) bo'sh keladi.
    const memberId = (await getMemberId(res.locals.telegramId as string)) ?? undefined;
    res.json(await getMarketHome(isAdmin((res.locals.telegramId as string) ?? ""), req.query?.q ? String(req.query.q) : undefined, memberId, req.query?.cat ? String(req.query.cat).slice(0, 40) : undefined));
  });
  // 🏠 V1.5 (Mahalla bozori): mahalla ro'yxati (picker uchun) + GPS-eng-yaqin taxmin + tanlov saqlash.
  app.get("/api/mahalla", allowGuest, rateLimit(30), async (_req, res) => {
    const { listMahallas } = await import("../services/mahallaService");
    res.set("Cache-Control", "private, max-age=300");
    res.json({ mahallas: await listMahallas() });
  });
  app.post("/api/mahalla/nearest", requireUser, rateLimit(30), async (req, res) => {
    const { nearestMahalla } = await import("../services/mahallaService");
    const lat = Number(req.body?.lat);
    const lng = Number(req.body?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) { res.status(400).json({ error: "bad_coords" }); return; }
    res.json({ mahalla: await nearestMahalla(lat, lng) });
  });
  app.post("/api/member/mahalla", requireUser, rateLimit(20), withMember2(async (memberId, req) => {
    const { setMemberMahalla } = await import("../services/mahallaService");
    const mahallaId = Number(req.body?.mahallaId);
    const mode = req.body?.mode === "travel" ? "travel" as const : "home" as const;
    if (!Number.isFinite(mahallaId)) return { ok: false };
    return await setMemberMahalla(memberId, mahallaId, mode);
  }));

  // kategoriya-ikonka + do'kon-logo proxy (shop-photo naqshi, o'sha rate-limit xaritasi)
  const serveMarketImage = (kind: "cat" | "shop") => async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) { res.status(404).end(); return; }
    const row = kind === "cat"
      ? await prisma.categoryDef.findUnique({ where: { id }, select: { iconFileId: true, iconUrl: true } })
      : await prisma.marketShop.findUnique({ where: { id }, select: { photoFileId: true, photoUrl: true } });
    const fileId = kind === "cat" ? (row as { iconFileId: string | null } | null)?.iconFileId : (row as { photoFileId: string | null } | null)?.photoFileId;
    const rawUrl = kind === "cat" ? (row as { iconUrl: string | null } | null)?.iconUrl : (row as { photoUrl: string | null } | null)?.photoUrl;
    let url = rawUrl ?? null;
    if (!url && fileId) {
      const { resolveTelegramFileUrl } = await import("../services/driverPhotoService");
      url = await resolveTelegramFileUrl(fileId);
    }
    if (!url) { res.status(404).end(); return; }
    if (url.startsWith("data:")) {
      const m = /^data:([^;]+);base64,(.*)$/.exec(url);
      if (!m) { res.status(404).end(); return; }
      sendImage(req, res, Buffer.from(m[2]!, "base64"), m[1]!);
      return;
    }
    await pipeTelegramFile(res, url, 3600, req);
  };
  app.get("/api/shop/cat-icon/:id", serveMarketImage("cat"));
  app.get("/api/shop/shop-photo/:id", serveMarketImage("shop"));

  // 🏪 D2: do'kon-profil ekrani — info-qator/e'lon/hikoya + do'kon-darajali sharhlar bir chaqiruvda.
  app.get("/api/shop/profile/:id", requireUser, rateLimit(30), withMember2(async (_memberId, req, res) => {
    const shopId = Number(req.params.id);
    // R4 (D2): a 200-with-{error} body was silently swallowed by the client's generic request()
    // helper (only rejects on non-2xx) — froze the miniapp on an infinite skeleton (e.g. right
    // after the `bazar` kill-switch flips off mid-session). withMember2 always sends the returned
    // value via res.json(...) itself — so set the status (no .json/.end here) and just return the
    // body, exactly like withMember2's own "not linked" 404 branch does.
    if (!Number.isFinite(shopId)) { res.status(404); return { error: "not_found" }; }
    const { getShopProfile, listShopReviews } = await import("../services/shopService");
    const preview = isAdmin(res.locals.telegramId as string);
    const profile = await getShopProfile(shopId, preview);
    if (!profile) { res.status(404); return { error: "not_found" }; }
    const reviews = await listShopReviews(shopId);
    return { profile, reviews };
  }));

  // §10.2: sodiqlik-progress-bar — ko'rsatkich-ONLY (mukofotsiz, ega qarori 2026-07-23)
  app.get("/api/shop/loyalty/:id", requireUser, rateLimit(30), withMember2(async (memberId, req, res) => {
    const shopId = Number(req.params.id);
    if (!Number.isFinite(shopId)) { res.status(404); return { error: "not_found" }; }
    const { getShopLoyaltyProgress } = await import("../services/shopService");
    return await getShopLoyaltyProgress(memberId, shopId);
  }));

  // 📹 S1: do'kon-hikoya (story) — tray (Bozor-bosh) + bitta do'konning to'liq-ekran ko'ruvchisi.
  // 🚪 Hikoyalar mehmonga ham ochiq — bu KASHF sirtqisi, uni raqam so'rab yopish mantiqsiz.
  // `withMember2` mehmonda 404 berardi; memberId endi yumshoq (ko'rilgan-belgisi mehmonda bo'sh).
  // Ko'rish-hisobi (POST .../view) requireUser'da qoladi — u a'zoga yoziladi.
  app.get("/api/shop/stories", allowGuest, rateLimit(30), async (_req, res) => {
    const { listStoryTray } = await import("../services/shopService");
    const memberId = (await getMemberId(res.locals.telegramId as string)) ?? undefined;
    res.json({ shops: await listStoryTray(memberId, isAdmin((res.locals.telegramId as string) ?? "")) });
  });
  app.get("/api/shop/stories/:shopId", allowGuest, rateLimit(30), async (req, res) => {
    const shopId = Number(req.params.shopId);
    if (!Number.isFinite(shopId)) { res.status(404).json({ error: "not_found" }); return; }
    const { getShopStories } = await import("../services/shopService");
    const memberId = (await getMemberId(res.locals.telegramId as string)) ?? undefined;
    res.json({ stories: await getShopStories(shopId, memberId, isAdmin((res.locals.telegramId as string) ?? "")) });
  });
  app.post("/api/shop/stories/:id/view", requireUser, rateLimit(60), withMember2(async (memberId, req) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return { ok: false };
    const { markStoryViewed } = await import("../services/shopService");
    return markStoryViewed(id, memberId);
  }));
  // Telegram video/photo file_id → real CDN URL (serveMarketImage naqshiga o'xshash, lekin
  // do'kon-hikoya `videoFileId`/`photoFileId`dan birini tanlaydi, muddati tugagan bo'lsa 404).
  app.get("/api/shop/story-media/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) { res.status(404).end(); return; }
    const story = await prisma.shopStory.findUnique({ where: { id }, select: { videoFileId: true, photoFileId: true, expiresAt: true } });
    if (!story || story.expiresAt < new Date()) { res.status(404).end(); return; }
    const fileId = story.videoFileId ?? story.photoFileId;
    if (!fileId) { res.status(404).end(); return; }
    const { resolveTelegramFileUrl } = await import("../services/driverPhotoService");
    const url = await resolveTelegramFileUrl(fileId);
    if (!url) { res.status(404).end(); return; }
    await pipeTelegramFile(res, url, 3600, req);
  });

  // 💬 C1: mijoz↔do'kon chat (bot-relay — yangi chat-server yo'q, mavjud SupportMsg kengaytirilgan).
  app.post("/api/shop/chat/send", requireUser, rateLimit(10), withMember2(async (memberId, req, res) => {
    const { sendBuyerMessage } = await import("../services/shopChatService");
    const shopId = Number((req.body as { shopId?: unknown })?.shopId);
    const text = String((req.body as { text?: unknown })?.text ?? "");
    if (!Number.isFinite(shopId)) return { ok: false, reason: "not_found" };
    return sendBuyerMessage(memberId, shopId, text, isAdmin(res.locals.telegramId as string));
  }));
  app.get("/api/shop/chat/:shopId", requireUser, rateLimit(30), withMember2(async (memberId, req, res) => {
    const shopId = Number(req.params.shopId);
    if (!Number.isFinite(shopId)) { res.status(404); return { error: "not_found" }; }
    const { getBuyerThread } = await import("../services/shopChatService");
    const thread = await getBuyerThread(memberId, shopId, isAdmin(res.locals.telegramId as string));
    if (!thread) { res.status(404); return { error: "not_found" }; }
    return thread;
  }));

  // 🧺 V2 (flag `bazarcart`): savat-checkout + rider market-buyurtmalari + bekor
  app.post("/api/shop/checkout", requireUser, rateLimit(10), withMember2(async (id, req, res) => {
    const { createMarketOrder } = await import("../services/marketOrderService");
    const b = req.body ?? {};
    const r = await createMarketOrder(
      id,
      Number(b.shopId),
      Array.isArray(b.items) ? b.items : [],
      String(b.address ?? ""),
      b.pay === "cash" ? "cash" : "tanga",
      b.note ? String(b.note) : undefined,
      isAdmin(res.locals.telegramId as string),
    );
    if (r.ok && r.notice && opts.notifyMarketOrder) await opts.notifyMarketOrder(r.notice as import("./../bot/market").MarketOrderNotice).catch(() => undefined);
    const { notice: _n, ...pub } = r; // buyer PII (tel/manzil) server-ichida qoladi
    return pub;
  }));
  app.get("/api/shop/market-orders", requireUser, rateLimit(30), withMember2(async (id) => {
    const { myMarketOrders } = await import("../services/marketOrderService");
    return { orders: await myMarketOrders(id) };
  }));
  app.post("/api/shop/market-orders/:id/cancel", requireUser, rateLimit(20), withMember2(async (id, req) => {
    const { cancelMarketOrder } = await import("../services/marketOrderService");
    return await cancelMarketOrder(Number(req.params.id), id); // egalik-guard service ichida
  }));
  // seller/ega paneli uchun (scoped): market-buyurtmalar ro'yxati. V1.7: owner ham `?shopId=`
  // bilan tanlaydi (hali UI'ga ulanmagan — bazarcart hali DARK — lekin flag yoqilganda tayyor turadi).
  app.get("/api/admin/shop/market-orders", requireAdmin, requireShopWrite, async (req, res) => {
    const { adminListMarketOrders } = await import("../services/marketOrderService");
    res.json({ orders: await adminListMarketOrders(req.query?.status ? String(req.query.status) : undefined, resolveProfileShopId(req, res) ?? undefined) });
  });

  // ── 🗣 shop reviews: sharh + 👍/👎 + up to 3 rasm ────────────────────────────────────────────
  app.get("/api/shop/reviews/:productId", requireUser, rateLimit(30), withMember2(async (id, req, res) => {
    const { listReviews } = await import("../services/shopService");
    return listReviews(Number(req.params.productId), id, isAdmin(res.locals.telegramId as string));
  }));
  app.post("/api/shop/review", express.json({ limit: "8mb" }), requireUser, rateLimit(6), withMember2(async (id, req, res) => {
    const { submitReview } = await import("../services/shopService");
    const photos = Array.isArray(req.body?.photos) ? (req.body.photos as unknown[]).filter((p): p is string => typeof p === "string") : undefined;
    const rating = Number.isInteger(req.body?.rating) ? Number(req.body.rating) : undefined; // ⭐ V3.2, additiv-ixtiyoriy
    const r = await submitReview(id, Number(req.body?.productId), String(req.body?.thumb ?? ""), typeof req.body?.text === "string" ? req.body.text : undefined, photos, isAdmin(res.locals.telegramId as string), rating);
    if (r.ok) {
      const { alertAdmins } = await import("../services/economyService");
      const t = req.body?.thumb === "up" ? "👍" : "👎";
      await alertAdmins(`🗣 Yangi sharh (#${Number(req.body?.productId)}): ${t} ${String(req.body?.text ?? "").slice(0, 120)}`).catch(() => undefined);
    }
    return r;
  }));
  app.delete("/api/shop/review/:productId", requireUser, rateLimit(10), withMember2(async (id, req) => {
    const { deleteMyReview } = await import("../services/shopService");
    return deleteMyReview(id, Number(req.params.productId));
  }));
  // review photos ride the same public proxy pattern + the same per-IP throttle map
  const serveReviewPhoto = async (req: Request, res: Response): Promise<void> => {
    const ipKey = String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "?").split(",")[0]!.trim();
    const now = Date.now();
    const h = shopPhotoHits.get(ipKey);
    if (h && now - h.at < 60_000 && h.n >= 120) { res.status(429).end(); return; }
    shopPhotoHits.set(ipKey, h && now - h.at < 60_000 ? { n: h.n + 1, at: h.at } : { n: 1, at: now });
    const { resolveReviewPhoto } = await import("../services/shopService");
    const idx = Math.max(0, Math.min(5, Number(req.params.n ?? 0) || 0));
    const url = await resolveReviewPhoto(Number(req.params.reviewId), idx, req.query.s === "1");
    if (!url) { res.status(404).end(); return; }
    if (url.startsWith("data:")) {
      const m = /^data:([^;]+);base64,(.*)$/.exec(url);
      if (!m) { res.status(404).end(); return; }
      sendImage(req, res, Buffer.from(m[2]!, "base64"), m[1]!);
      return;
    }
    await pipeTelegramFile(res, url, 3600, req);
  };
  app.get("/api/shop/review-photo/:reviewId", serveReviewPhoto);
  app.get("/api/shop/review-photo/:reviewId/:n", serveReviewPhoto);

  // ── 🍽 RESTORAN (feature "restoran", DARK until seed + QABUL) — R1: katalog o'qish only ───────
  // owner-preview: admins browse the REAL catalog while riders see nothing (shop patterni).
  app.get("/api/restoran/list", allowGuest, rateLimit(30), async (_req, res) => {
    const { listActiveRestaurants } = await import("../services/restoranService");
    res.set("Cache-Control", "private, max-age=30");
    res.json({ restaurants: await listActiveRestaurants(isAdmin(res.locals.telegramId as string)) });
  });

  // 🏠 HOME FEED aggregate (feature "newhome", Bosqich 2) — one call: promo banner + image feed +
  // rail flag-state. Reads local DB (shop+restoran views), cached ~30s server-side; no kas, no poller.
  app.get("/api/home/feed", requireUser, rateLimit(30), async (_req, res) => {
    const { getHomeFeed } = await import("../services/homeFeedService");
    res.set("Cache-Control", "private, max-age=30");
    res.json(await getHomeFeed(isAdmin(res.locals.telegramId as string)));
  });

  // 🏠 admin curation (Bosqich 3, feature "homeadmin"): owner-set banner + pinned items. EMPTY = auto.
  app.get("/api/admin/home-featured", requireAdmin, async (_req, res) => {
    const { adminListFeatured } = await import("../services/homeFeedService");
    res.json({ items: await adminListFeatured() });
  });
  app.post("/api/admin/home-featured", requireAdmin, rateLimit(20), async (req, res) => {
    const b = (req.body ?? {}) as { kind?: string; title?: string };
    if (!b.kind || !b.title) { res.status(400).json({ error: "kind + title required" }); return; }
    const { adminCreateFeatured } = await import("../services/homeFeedService");
    res.json(await adminCreateFeatured(b as Parameters<typeof adminCreateFeatured>[0]));
  });
  app.post("/api/admin/home-featured/:id/active", requireAdmin, async (req, res) => {
    const { adminSetFeaturedActive } = await import("../services/homeFeedService");
    await adminSetFeaturedActive(Number(req.params.id), (req.body?.active ?? true) === true);
    res.json({ ok: true });
  });
  app.delete("/api/admin/home-featured/:id", requireAdmin, async (req, res) => {
    const { adminDeleteFeatured } = await import("../services/homeFeedService");
    await adminDeleteFeatured(Number(req.params.id));
    res.json({ ok: true });
  });
  // R2: savat + checkout + FoodOrder — naqd/so'm to'lov (D1), CoinTxn TEGILMAYDI. Bu ikkalasi
  // /api/restoran/:id'DAN OLDIN turishi SHART — aks holda Express "orders"/"order"ni :id sifatida
  // ushlab qoladi (bir marta jonli xato bergan bug: getRestaurantDetail(NaN) → Prisma "id missing").
  app.post("/api/restoran/order", requireUser, rateLimit(10), withMember2(async (id, req, res) => {
    const { createFoodOrder } = await import("../services/restoranService");
    const b = req.body ?? {};
    const items = Array.isArray(b.items) ? (b.items as { menuItemId: unknown; qty: unknown }[]).map((i) => ({ menuItemId: Number(i.menuItemId), qty: Number(i.qty) })) : [];
    const r = await createFoodOrder(
      id, Number(b.restaurantId), items,
      String(b.address ?? ""), String(b.contact ?? ""), String(b.note ?? ""),
      !!b.isPickup, isAdmin(res.locals.telegramId as string),
    );
    if (r.ok && r.notice && opts.notifyRestoranOwner) await opts.notifyRestoranOwner(r.notice).catch(() => undefined);
    const { notice: _n, ...pub } = r; // owner-notice (phone/address) never leaves the server response path
    return pub;
  }));
  app.get("/api/restoran/orders", requireUser, rateLimit(30), withMember2(async (id) => {
    const { myFoodOrders } = await import("../services/restoranService");
    return { orders: await myFoodOrders(id) };
  }));
  // "orders/:id/cancel" has 3 segments after /restoran/ — never collides with the bare :id catch-all
  // below regardless of registration order (Express matches on exact segment count), but kept near
  // the other order routes for readability.
  app.post("/api/restoran/orders/:id/cancel", requireUser, rateLimit(10), withMember2(async (id, req, res) => {
    const { cancelFoodOrder } = await import("../services/restoranService");
    return cancelFoodOrder(id, Number(req.params.id));
  }));
  app.get("/api/restoran/:id", allowGuest, rateLimit(30), async (req, res) => {
    const { getRestaurantDetail } = await import("../services/restoranService");
    res.json(await getRestaurantDetail(Number(req.params.id), isAdmin(res.locals.telegramId as string)));
  });
  app.get("/api/restoran/:id/reviews", requireUser, rateLimit(30), withMember2(async (memberId, req, res) => {
    const { listRestaurantReviews } = await import("../services/restoranService");
    const r = await listRestaurantReviews(Number(req.params.id), memberId, isAdmin(res.locals.telegramId as string));
    const reviews = r.reviews.map((x) => ({ id: x.id, stars: x.stars, text: x.text, createdAt: x.createdAt, mine: x.memberId === memberId, memberName: x.memberId === memberId ? "Siz" : "Mijoz" }));
    return { avgRating: r.avgRating, reviewCount: r.reviewCount, reviews, myReview: reviews.find((x) => x.mine) ?? null };
  }));
  app.post("/api/restoran/:id/review", requireUser, rateLimit(10), withMember2(async (memberId, req, res) => {
    const { submitRestaurantReview } = await import("../services/restoranService");
    return submitRestaurantReview(memberId, Number(req.params.id), Number(req.body?.stars), typeof req.body?.text === "string" ? req.body.text : undefined, isAdmin(res.locals.telegramId as string));
  }));
  app.delete("/api/restoran/:id/review", requireUser, rateLimit(10), withMember2(async (memberId, req) => {
    const { deleteMyRestaurantReview } = await import("../services/restoranService");
    return deleteMyRestaurantReview(memberId, Number(req.params.id));
  }));
  const serveRestoranPhoto = async (req: Request, res: Response): Promise<void> => {
    const { resolveRestaurantPhoto } = await import("../services/restoranService");
    const url = await resolveRestaurantPhoto(Number(req.params.id));
    if (!url) { res.status(404).end(); return; }
    if (url.startsWith("data:")) {
      const m = /^data:([^;]+);base64,(.*)$/.exec(url);
      if (!m) { res.status(404).end(); return; }
      sendImage(req, res, Buffer.from(m[2]!, "base64"), m[1]!);
      return;
    }
    await pipeTelegramFile(res, url, 3600, req);
  };
  app.get("/api/restoran/photo/:id", serveRestoranPhoto);
  const serveMenuItemPhoto = async (req: Request, res: Response): Promise<void> => {
    const { resolveMenuItemPhoto } = await import("../services/restoranService");
    const url = await resolveMenuItemPhoto(Number(req.params.id));
    if (!url) { res.status(404).end(); return; }
    if (url.startsWith("data:")) {
      const m = /^data:([^;]+);base64,(.*)$/.exec(url);
      if (!m) { res.status(404).end(); return; }
      sendImage(req, res, Buffer.from(m[2]!, "base64"), m[1]!);
      return;
    }
    await pipeTelegramFile(res, url, 3600, req);
  };
  app.get("/api/restoran/menuphoto/:id", serveMenuItemPhoto);

  // ── 🎀 RAVELLA (feature "ravella", DARK until seed + QABUL) — bezak konstruktori ───────────────
  // Narx SERVERDA hisoblanadi (RAVELLA_PLAN §7.1) — bu yerda client'dan hech qanday summa
  // O'QILMAYDI, faqat id'lar. owner-preview: ega katalogni QABUL qilgunча mijozlar bo'sh ko'radi.
  // `?p=<token>` — ommaviy sayt uchun FAQAT-O'QISH preview (DARK flagni chetlab o'tadi). Buyurtma
  // yo'llari bu tokenni BILMAYDI: sayt orqali hech kim buyurtma bera olmaydi, faqat ko'radi.
  const ravellaPreview = async (req: Request, res: Response): Promise<boolean> => {
    if (isAdmin(res.locals.telegramId as string)) return true;
    const p = req.query?.p;
    if (typeof p !== "string" || !p) return false;
    const { isRavellaPreviewToken } = await import("../services/ravellaService");
    return isRavellaPreviewToken(p);
  };
  app.get("/api/ravella/catalog", allowGuest, rateLimit(30), async (req, res) => {
    const { getRavellaCatalog } = await import("../services/ravellaService");
    res.set("Cache-Control", "private, max-age=30");
    // memberId halqa-holati uchun (ko'rilganmi) — mehmonda undefined, hammasi "yangi" ko'rinadi
    const { getMemberId } = await import("../services/memberService");
    const memberId = res.locals.telegramId ? (await getMemberId(res.locals.telegramId as string)) ?? undefined : undefined;
    res.json(await getRavellaCatalog(await ravellaPreview(req, res), memberId));
  });

  // 📹 Hikoyalar — ro'yxat mehmonga ham ochiq (ommaviy kontent), "ko'rildi" faqat a'zoga yoziladi
  app.get("/api/ravella/stories", allowGuest, rateLimit(30), async (req, res) => {
    const { listRavellaStories } = await import("../services/ravellaStoryService");
    const { getMemberId } = await import("../services/memberService");
    const memberId = res.locals.telegramId ? (await getMemberId(res.locals.telegramId as string)) ?? undefined : undefined;
    res.json({ stories: await listRavellaStories(memberId, await ravellaPreview(req, res)) });
  });
  app.post("/api/ravella/stories/:id/viewed", requireUser, rateLimit(60), withMember2(async (memberId, req) => {
    const { markRavellaStoryViewed } = await import("../services/ravellaStoryService");
    return markRavellaStoryViewed(Number(req.params.id), memberId);
  }));
  app.get("/api/ravella/story-media/:id", async (req: Request, res: Response) => {
    const { resolveRavellaStoryMedia } = await import("../services/ravellaStoryService");
    const url = await resolveRavellaStoryMedia(Number(req.params.id));
    if (!url) { res.status(404).end(); return; }
    await pipeTelegramFile(res, url, 120, req);
  });
  // "order"/"orders" /api/ravella/item/:id bilan TO'QNASHMAYDI (turli segment) — lekin restoran
  // saboqiga ko'ra buyurtma yo'llari baribir katalog-yo'llaridan OLDIN turadi.
  app.post("/api/ravella/order", requireUser, rateLimit(10), withMember2(async (id, req, res) => {
    const { createRavellaOrder } = await import("../services/ravellaService");
    const b = req.body ?? {};
    const addons = Array.isArray(b.addons)
      ? (b.addons as { addonId: unknown; qty: unknown }[]).map((a) => ({ addonId: Number(a.addonId), qty: Number(a.qty) }))
      : [];
    const r = await createRavellaOrder(id, {
      itemId: Number(b.itemId), addons,
      contact: String(b.contact ?? ""), address: String(b.address ?? ""),
      eventDate: String(b.eventDate ?? ""), note: String(b.note ?? ""),
      useDiscount: b.useDiscount === true,
    }, isAdmin(res.locals.telegramId as string));
    if (r.ok && r.notice && opts.notifyRavellaPartner) await opts.notifyRavellaPartner(r.notice).catch(() => undefined);
    const { notice: _n, ...pub } = r; // hamkor-kartasi (telefon/manzil) javob yo'liga CHIQMAYDI
    return pub;
  }));
  app.get("/api/ravella/orders", requireUser, rateLimit(30), withMember2(async (id) => {
    const { myRavellaOrders } = await import("../services/ravellaService");
    return { orders: await myRavellaOrders(id) };
  }));
  app.post("/api/ravella/orders/:id/cancel", requireUser, rateLimit(10), withMember2(async (id, req) => {
    const { cancelRavellaOrder } = await import("../services/ravellaService");
    return cancelRavellaOrder(id, Number(req.params.id));
  }));
  app.get("/api/ravella/item/:id", allowGuest, rateLimit(30), async (req, res) => {
    const { getRavellaItemDetail } = await import("../services/ravellaService");
    res.json(await getRavellaItemDetail(Number(req.params.id), await ravellaPreview(req, res)));
  });
  const serveRavellaPhoto = (kind: "item" | "addon") => async (req: Request, res: Response): Promise<void> => {
    const svc = await import("../services/ravellaService");
    const url = kind === "item"
      ? await svc.resolveRavellaItemPhoto(Number(req.params.id))
      : await svc.resolveRavellaAddonPhoto(Number(req.params.id));
    if (!url) { res.status(404).end(); return; }
    if (url.startsWith("data:")) {
      const m = /^data:([^;]+);base64,(.*)$/.exec(url);
      if (!m) { res.status(404).end(); return; }
      sendImage(req, res, Buffer.from(m[2]!, "base64"), m[1]!);
      return;
    }
    // ⚠️ Telegram file-havolasi ~1 SOATDA eskiradi. 302'ni bir soat keshlash brauzerga eskirgan
    // manzilni qayta-qayta beradi → mijoz singan rasm ko'radi (2026-07-27 da brauzerda aynan shu
    // yuz berdi: kesh chetlab o'tilganda rasm darhol yuklandi). Shuning uchun YO'NALTIRISH qisqa
    // keshlanadi — rasmning O'ZI baribir Telegram CDN'da keshlanadi, ya'ni tejash yo'qolmaydi.
    // (Xuddi shu naqsh restoran/do'kon/haydovchi-rasm yo'llarida ham bor — alohida tiket.)
    await pipeTelegramFile(res, url, 120, req);
  };
  app.get("/api/ravella/photo/:id", serveRavellaPhoto("item"));
  // karusel rasmi (galereya) — qopqoqdan farqli, o'z id'si bilan
  app.get("/api/ravella/gallery/:id", async (req: Request, res: Response) => {
    const { resolveRavellaGalleryPhoto } = await import("../services/ravellaService");
    const url = await resolveRavellaGalleryPhoto(Number(req.params.id));
    if (!url) { res.status(404).end(); return; }
    if (url.startsWith("data:")) {
      const m = /^data:([^;]+);base64,(.*)$/.exec(url);
      if (!m) { res.status(404).end(); return; }
      sendImage(req, res, Buffer.from(m[2]!, "base64"), m[1]!);
      return;
    }
    await pipeTelegramFile(res, url, 120, req);
  });
  app.get("/api/ravella/addon-photo/:id", serveRavellaPhoto("addon"));

  // ── 🔎 XIZMATLAR (feature "xizmatlar", DARK until seed + QABUL) — moves NO money ──────────────
  // owner-preview everywhere: admins browse/QABUL the real catalog while riders still see nothing.
  const svcPreview = (res: Response) => isAdmin(res.locals.telegramId as string);
  app.get("/api/services/categories", allowGuest, rateLimit(30), async (_req, res) => {
    const { listCategories, popularSearchTags } = await import("../services/serviceDirectory");
    res.set("Cache-Control", "private, max-age=60");
    const preview = svcPreview(res);
    const [categories, popularTags] = await Promise.all([listCategories(preview), popularSearchTags(preview)]);
    res.json({ categories, popularTags });
  });
  app.get("/api/services/list", allowGuest, rateLimit(60), async (req, res) => {
    const { listListings } = await import("../services/serviceDirectory");
    res.set("Cache-Control", "private, max-age=30"); // read-mostly: back/forward nav skips network
    res.json(await listListings({
      categoryId: req.query.cat ? Number(req.query.cat) : undefined,
      q: req.query.q ? String(req.query.q) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      offset: req.query.offset ? Number(req.query.offset) : undefined,
      sort: req.query.sort === "new" ? "new" : undefined,
    }, svcPreview(res)));
  });
  app.get("/api/services/inspected", allowGuest, rateLimit(60), async (req, res) => {
    const { listInspected } = await import("../services/serviceDirectory");
    res.set("Cache-Control", "private, max-age=60");
    res.json({ listings: await listInspected(req.query.limit ? Number(req.query.limit) : undefined, svcPreview(res)) });
  });
  app.get("/api/services/item/:id", allowGuest, rateLimit(60), async (req, res) => {
    const { getListing } = await import("../services/serviceDirectory");
    const item = await getListing(Number(req.params.id), res.locals.telegramId as string, svcPreview(res));
    if (!item) { res.status(404).json({ error: "not_found" }); return; }
    res.set("Cache-Control", "private, max-age=30");
    res.json(item);
  });
  // "Topilmadi" → demand capture: unmet searches recorded for admin recruiting (3/day cap inside)
  app.post("/api/services/request", requireUser, rateLimit(10), withMember2(async (memberId, req, res) => {
    const { submitRequest } = await import("../services/serviceDirectory");
    const m = await prisma.member.findUnique({ where: { id: memberId }, select: { displayName: true, fullName: true } });
    const r = await submitRequest(
      res.locals.telegramId as string,
      m?.displayName || m?.fullName || "Foydalanuvchi",
      String(req.body?.query ?? ""),
      String(req.body?.note ?? ""),
      svcPreview(res),
    );
    if (r.ok && r.notice && opts.notifyServiceDemand) await opts.notifyServiceDemand(r.notice).catch(() => undefined);
    const { notice: _n, ...pub } = r;
    return pub;
  }));
  // "⚑ Raqam ishlamadi" — 1 flag per user; ≥2 unique flags → admin recheck queue
  app.post("/api/services/phone-report", requireUser, rateLimit(10), async (req, res) => {
    const { reportPhoneIssue } = await import("../services/serviceDirectory");
    res.json(await reportPhoneIssue(Number(req.body?.id), res.locals.telegramId as string, svcPreview(res)));
  });
  // 🔖 saqlanganlar — toggle + ro'yxat
  app.post("/api/services/fav", requireUser, rateLimit(30), async (req, res) => {
    const { toggleFavorite } = await import("../services/serviceDirectory");
    res.json(await toggleFavorite(res.locals.telegramId as string, Number(req.body?.id), !!req.body?.on, svcPreview(res)));
  });
  app.get("/api/services/favs", requireUser, rateLimit(30), async (_req, res) => {
    const { listFavorites } = await import("../services/serviceDirectory");
    res.json({ listings: await listFavorites(res.locals.telegramId as string, svcPreview(res)) });
  });
  app.post("/api/services/call", requireUser, rateLimit(30), async (req, res) => {
    const { trackCall } = await import("../services/serviceDirectory");
    res.json(await trackCall(Number(req.body?.id), svcPreview(res)));
  });
  app.post("/api/services/submit", requireUser, rateLimit(5), withMember2(async (memberId, req, res) => {
    const { submitListing } = await import("../services/serviceDirectory");
    const m = await prisma.member.findUnique({ where: { id: memberId }, select: { displayName: true, fullName: true } });
    const r = await submitListing(
      res.locals.telegramId as string,
      m?.displayName || m?.fullName || "Foydalanuvchi",
      req.body as import("@t1067/shared").ServiceSubmitBody,
      svcPreview(res),
    );
    if (r.ok && r.notice && opts.notifyServiceOwner) await opts.notifyServiceOwner(r.notice).catch(() => undefined);
    const { notice: _n, ...pub } = r; // owner-notice never leaves the server response path
    return pub;
  }));
  app.get("/api/services/mine", requireUser, rateLimit(30), async (_req, res) => {
    const { myListings } = await import("../services/serviceDirectory");
    res.json({ listings: await myListings(res.locals.telegramId as string) });
  });
  // 📷 self-serve photo add — owner enriches THEIR OWN listing (submit-time or any time after),
  // no admin bottleneck. Ownership checked in uploadMyServicePhoto (ownerTgId match).
  app.post("/api/services/mine/:id/photo", express.json({ limit: "6mb" }), requireUser, rateLimit(20), async (req, res) => {
    const b = req.body as { mime?: string; base64?: string };
    if (!b?.base64) { res.status(400).json({ ok: false, error: "no image" }); return; }
    const { uploadMyServicePhoto } = await import("../services/serviceDirectory");
    res.json(await uploadMyServicePhoto(Number(req.params.id), res.locals.telegramId as string, Buffer.from(b.base64, "base64"), b.mime || "image/jpeg"));
  });
  app.get("/api/services/reviews", requireUser, rateLimit(60), async (req, res) => {
    const { listReviews } = await import("../services/serviceDirectory");
    res.json({ reviews: await listReviews(Number(req.query.listingId), res.locals.telegramId as string, 20, req.query.offset ? Number(req.query.offset) : 0) });
  });
  app.post("/api/services/review", requireUser, rateLimit(10), withMember2(async (memberId, req, res) => {
    const { upsertReview } = await import("../services/serviceDirectory");
    const m = await prisma.member.findUnique({ where: { id: memberId }, select: { displayName: true, fullName: true } });
    // privacy: reviews show "Dilshod A." — first name + surname initial, never the full name
    const raw = (m?.displayName || m?.fullName || "Foydalanuvchi").trim().split(/\s+/);
    const authorName = raw.length > 1 ? `${raw[0]} ${raw[1]!.charAt(0).toUpperCase()}.` : raw[0]!;
    const b = req.body as { listingId?: number; stars?: number; text?: string };
    return upsertReview(res.locals.telegramId as string, authorName, Number(b?.listingId), Number(b?.stars), String(b?.text ?? ""), svcPreview(res));
  }));
  app.post("/api/services/report", requireUser, rateLimit(10), async (req, res) => {
    const { reportReview } = await import("../services/serviceDirectory");
    res.json(await reportReview(Number(req.body?.reviewId), res.locals.telegramId as string));
  });
  // public listing photo proxy (img tag) — shop-photo clone: file_id → 302 to Telegram CDN
  const svcPhotoHits = new Map<string, { n: number; at: number }>();
  const serveServicePhoto = async (req: Request, res: Response): Promise<void> => {
    const ipKey = String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "?").split(",")[0]!.trim();
    if (svcPhotoHits.size > 10_000) svcPhotoHits.clear();
    const now = Date.now();
    const h = svcPhotoHits.get(ipKey);
    if (h && now - h.at < 60_000 && h.n >= 120) { res.status(429).end(); return; }
    svcPhotoHits.set(ipKey, h && now - h.at < 60_000 ? { n: h.n + 1, at: h.at } : { n: 1, at: now });
    const { resolveServicePhoto } = await import("../services/serviceDirectory");
    const idx = Math.max(0, Math.min(10, Number(req.params.n ?? 0) || 0));
    const url = await resolveServicePhoto(Number(req.params.listingId), idx, req.query.s === "1"); // ?s=1 → ~320px thumb tier
    if (!url) { res.status(404).end(); return; }
    if (url.startsWith("data:")) {
      const m = /^data:([^;]+);base64,(.*)$/.exec(url);
      if (!m) { res.status(404).end(); return; }
      sendImage(req, res, Buffer.from(m[2]!, "base64"), m[1]!);
      return;
    }
    await pipeTelegramFile(res, url, 3600, req);
  };
  app.get("/api/services/photo/:listingId", serveServicePhoto);
  app.get("/api/services/photo/:listingId/:n", serveServicePhoto);

  // ── 📋 E'LONLAR (feature "elonlar", DARK — ELONLAR_PLAN.md E2) — owner-preview mirrors xizmatlar/shop ──
  const elonPreview = (res: Response) => isAdmin(res.locals.telegramId as string);
  app.get("/api/elonlar/ads", requireUser, rateLimit(60), async (req, res) => {
    const { listAds } = await import("../services/classifiedService");
    res.set("Cache-Control", "private, max-age=15");
    res.json(await listAds({
      category: req.query.category ? String(req.query.category) : undefined,
      subtype: req.query.subtype ? String(req.query.subtype) : undefined,
      priceBand: (["arzon", "ortacha", "qimmat"] as const).includes(req.query.price as "arzon") ? (req.query.price as "arzon" | "ortacha" | "qimmat") : undefined,
      q: req.query.q ? String(req.query.q) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      offset: req.query.offset ? Number(req.query.offset) : undefined,
    }, elonPreview(res)));
  });
  app.get("/api/elonlar/ads/:id", requireUser, rateLimit(60), async (req, res) => {
    const { getAd } = await import("../services/classifiedService");
    const item = await getAd(Number(req.params.id), res.locals.telegramId as string, elonPreview(res));
    if (!item) { res.status(404).json({ error: "not_found" }); return; }
    res.json(item);
  });
  app.post("/api/elonlar/ads", requireUser, rateLimit(5), withMember2(async (memberId, req, res) => {
    const { submitAd } = await import("../services/classifiedService");
    const m = await prisma.member.findUnique({ where: { id: memberId }, select: { displayName: true, fullName: true, phone: true } });
    const r = await submitAd(
      res.locals.telegramId as string,
      memberId,
      m?.displayName || m?.fullName || "Foydalanuvchi",
      m?.phone ?? null,
      req.body as import("@t1067/shared").ClassifiedSubmitBody,
      elonPreview(res),
    );
    if (r.ok && r.notice && opts.notifyElonlarOwner) await opts.notifyElonlarOwner(r.notice).catch(() => undefined);
    const { notice: _n, ...pub } = r; // owner-notice never leaves the server response path
    return pub;
  }));
  app.post("/api/elonlar/ads/:id/report", requireUser, rateLimit(10), async (req, res) => {
    const { reportAd } = await import("../services/classifiedService");
    res.json(await reportAd(Number(req.params.id), res.locals.telegramId as string, elonPreview(res)));
  });
  app.post("/api/elonlar/ads/:id/react", requireUser, rateLimit(30), async (req, res) => {
    const { submitReaction } = await import("../services/classifiedService");
    const m = await prisma.telegramUser.findUnique({ where: { id: res.locals.telegramId as string }, select: { member: { select: { displayName: true, fullName: true } } } });
    const name = m?.member?.displayName || m?.member?.fullName || "Foydalanuvchi";
    res.json(await submitReaction(res.locals.telegramId as string, name, Number(req.params.id), req.body as import("@t1067/shared").ClassifiedReactBody, elonPreview(res)));
  });
  app.post("/api/elonlar/ads/:id/contact", requireUser, rateLimit(30), async (req, res) => {
    const { logContact } = await import("../services/classifiedService");
    const m = await prisma.telegramUser.findUnique({ where: { id: res.locals.telegramId as string }, select: { member: { select: { displayName: true, fullName: true } } } });
    const name = m?.member?.displayName || m?.member?.fullName || "Foydalanuvchi";
    const kind = req.body?.kind === "message" ? "message" as const : "call" as const;
    res.json(await logContact(Number(req.params.id), res.locals.telegramId as string, name, kind, elonPreview(res)));
  });
  app.get("/api/elonlar/mine", requireUser, rateLimit(30), async (_req, res) => {
    res.json({ ads: await (await import("../services/classifiedService")).myAds(res.locals.telegramId as string) });
  });
  app.post("/api/elonlar/ads/:id/sold", requireUser, rateLimit(10), async (req, res) => {
    const { markSold } = await import("../services/classifiedService");
    res.json(await markSold(res.locals.telegramId as string, Number(req.params.id)));
  });
  // ⭐ E4 TOP boost — rider o'z aktiv e'lonini 24 soatga TOP qiladi (knob elonTopPrice, flag elontop)
  app.post("/api/elonlar/ads/:id/top", requireUser, rateLimit(10), withMember2(async (memberId, req, res) => {
    const { buyTopBoost } = await import("../services/classifiedService");
    return buyTopBoost(res.locals.telegramId as string, memberId, Number(req.params.id), elonPreview(res));
  }));
  app.post("/api/elonlar/ads/:id/reactivate", requireUser, rateLimit(10), async (req, res) => {
    const { reactivateAd } = await import("../services/classifiedService");
    res.json(await reactivateAd(res.locals.telegramId as string, Number(req.params.id)));
  });
  app.delete("/api/elonlar/ads/:id", requireUser, rateLimit(10), async (req, res) => {
    const { deleteAd } = await import("../services/classifiedService");
    res.json(await deleteAd(res.locals.telegramId as string, Number(req.params.id)));
  });
  // rider self-upload (post-wizard photo step) — ownership check (only the ad's own owner can add)
  app.post("/api/elonlar/ads/:id/photo", express.json({ limit: "6mb" }), requireUser, rateLimit(10), async (req, res) => {
    const adId = Number(req.params.id);
    const ad = await prisma.classifiedAd.findUnique({ where: { id: adId }, select: { tgId: true } });
    if (!ad || ad.tgId.toString() !== (res.locals.telegramId as string)) { res.status(404).json({ error: "not_found" }); return; }
    const b = req.body as { base64?: string; mime?: string };
    if (!b?.base64) { res.status(400).json({ error: "bad_photo" }); return; }
    const { uploadAdPhoto } = await import("../services/classifiedService");
    res.json(await uploadAdPhoto(adId, Buffer.from(b.base64, "base64"), b.mime || "image/jpeg"));
  });
  // public ad photo proxy (img tag) — shop/services-photo clone: file_id → 302 to Telegram CDN
  const elonPhotoHits = new Map<string, { n: number; at: number }>();
  const serveAdPhoto = async (req: Request, res: Response): Promise<void> => {
    const ipKey = String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "?").split(",")[0]!.trim();
    if (elonPhotoHits.size > 10_000) elonPhotoHits.clear();
    const now = Date.now();
    const h = elonPhotoHits.get(ipKey);
    if (h && now - h.at < 60_000 && h.n >= 120) { res.status(429).end(); return; }
    elonPhotoHits.set(ipKey, h && now - h.at < 60_000 ? { n: h.n + 1, at: h.at } : { n: 1, at: now });
    const { resolveAdPhoto } = await import("../services/classifiedService");
    const idx = Math.max(0, Math.min(10, Number(req.params.n ?? 0) || 0));
    const url = await resolveAdPhoto(Number(req.params.adId), idx, req.query.s === "1");
    if (!url) { res.status(404).end(); return; }
    if (url.startsWith("data:")) {
      const m = /^data:([^;]+);base64,(.*)$/.exec(url);
      if (!m) { res.status(404).end(); return; }
      sendImage(req, res, Buffer.from(m[2]!, "base64"), m[1]!);
      return;
    }
    await pipeTelegramFile(res, url, 3600, req);
  };
  app.get("/api/elonlar/photo/:adId", serveAdPhoto);
  app.get("/api/elonlar/photo/:adId/:n", serveAdPhoto);

  app.post("/api/wallet/topup", requireUser, rateLimit(5), async (req, res) => {
    const memberId = await getMemberId(res.locals.telegramId as string);
    if (!memberId) {
      res.status(404).json({ error: "not linked" });
      return;
    }
    const amount = Math.floor(Number((req.body as { amount?: number })?.amount ?? 0));
    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: "amount required" });
      return;
    }
    res.json(await topUpFromBonus(memberId, amount));
  });

  // ── P2P transfer: closed-loop coin moves (capped, burned, ring-guarded) ─────
  app.post("/api/wallet/recipient", requireUser, rateLimit(10), async (req, res) => {
    // rich confirm: name + type + phone + Telegram @username (so the sender sees WHO they pay)
    res.json(await lookupRecipient(String((req.body as { phone?: string })?.phone ?? "")));
  });
  app.post("/api/wallet/transfer", requireUser, rateLimit(5), async (req, res) => {
    const memberId = await getMemberId(res.locals.telegramId as string);
    if (!memberId) {
      res.status(404).json({ error: "not linked" });
      return;
    }
    const b = req.body as { phone?: string; amount?: number; note?: string };
    const amount = Math.floor(Number(b?.amount ?? 0));
    if (!Number.isFinite(amount) || amount <= 0 || !b?.phone) {
      res.status(400).json({ error: "phone and amount required" });
      return;
    }
    const { featureOn } = await import("../services/featureFlags");
    if (!(await featureOn("transfers"))) {
      res.json({ ok: false, reason: "disabled" });
      return;
    }
    res.json(await transfer(memberId, String(b.phone), amount, { note: b.note ? String(b.note) : undefined }));
  });
  // 🚖 Pay the driver by CAR number (Mini App). Rich confirm — exact kas details (name, phone,
  // model, rating) + typo suggestions when the plate doesn't match. This is a FARE payment.
  app.post("/api/wallet/driver-by-car", requireUser, rateLimit(10), async (req, res) => {
    const memberId = await getMemberId(res.locals.telegramId as string);
    res.json(await lookupDriverForPay(String((req.body as { car?: string })?.car ?? ""), memberId));
  });
  app.post("/api/wallet/pay-driver", requireUser, rateLimit(5), async (req, res) => {
    const memberId = await getMemberId(res.locals.telegramId as string);
    if (!memberId) {
      res.status(404).json({ error: "not linked" });
      return;
    }
    const b = req.body as { car?: string; amount?: number };
    const amount = Math.floor(Number(b?.amount ?? 0));
    if (!Number.isFinite(amount) || amount <= 0 || !b?.car) {
      res.status(400).json({ error: "car and amount required" });
      return;
    }
    const { featureOn } = await import("../services/featureFlags");
    if (!(await featureOn("transfers"))) {
      res.json({ ok: false, reason: "disabled" });
      return;
    }
    const driver = await findDriverByCar(String(b.car));
    if (!driver || driver.id === memberId) {
      res.json({ ok: false, reason: "not_found" });
      return;
    }
    // FARE payment (not a tip) — high cap, driver gets the full fare, +commission charged to rider.
    res.json(await transfer(memberId, "", amount, { kind: "fare", toMemberId: driver.id }));
  });
  // 💎 1067 Plus (coin-paid subscription, pure sink)
  app.get("/api/plus", requireUser, withMember2(async (id) => {
    const { PLUS_PRICE } = await import("../services/plusService");
    const m = await prisma.member.findUnique({ where: { id }, select: { plusUntil: true, trips: true } });
    const active = !!m?.plusUntil && m.plusUntil.getTime() > Date.now();
    const hadTrial = !!(await prisma.coinTxn.findFirst({ where: { memberId: id, kind: "plus_sub" } }));
    return { active, until: m?.plusUntil ?? null, price: PLUS_PRICE, trialAvailable: !hadTrial && !m?.plusUntil, canBuy: (m?.trips ?? 0) >= 1 };
  }));
  app.post("/api/plus/subscribe", requireUser, rateLimit(5), withMember2(async (id) => {
    const { featureOn } = await import("../services/featureFlags");
    if (!(await featureOn("plus"))) return { ok: false, reason: "disabled" };
    const { subscribePlus } = await import("../services/plusService");
    return subscribePlus(id);
  }));

  // 👬 Gap (team circles)
  app.get("/api/gap", requireUser, withMember2(async (id) => {
    const { getGapView } = await import("../services/gapService");
    return getGapView(id);
  }));
  app.post("/api/gap/create", requireUser, rateLimit(5), withMember2(async (id, req) => {
    const { featureOn } = await import("../services/featureFlags");
    if (!(await featureOn("gap"))) return { ok: false, reason: "disabled" };
    const { createGap } = await import("../services/gapService");
    return createGap(id, String((req.body as { name?: string })?.name ?? ""));
  }));
  app.post("/api/gap/join", requireUser, rateLimit(5), withMember2(async (id, req) => {
    const { featureOn } = await import("../services/featureFlags");
    if (!(await featureOn("gap"))) return { ok: false, reason: "disabled" };
    const { joinGap } = await import("../services/gapService");
    return joinGap(id, String((req.body as { code?: string })?.code ?? ""));
  }));

  app.get("/api/driver/earnings", requireUser, async (_req, res) => {
    const memberId = await getMemberId(res.locals.telegramId as string);
    if (!memberId) {
      res.status(404).json({ error: "not linked" });
      return;
    }
    res.json(await getDriverEarnings(memberId));
  });

  // 🚕 Driver's OWN rides (the ones they drove) — by plate, since bookingReports is client-indexed.
  app.get("/api/driver/rides", requireUser, async (_req, res) => {
    const memberId = await getMemberId(res.locals.telegramId as string);
    if (!memberId) {
      res.status(404).json({ error: "not linked" });
      return;
    }
    const m = await prisma.member.findUnique({ where: { id: memberId }, select: { type: true, carNumber: true } });
    if (m?.type !== "driver" || !m.carNumber) {
      res.json({ rides: [] });
      return;
    }
    const { getDataSource } = await import("../kas");
    res.json({ rides: await getDataSource().getRidesByCar(m.carNumber, 20) });
  });

  // 🎯 Driver missions (app): live progress + claim. Same service the bot /topshiriq uses.
  app.get("/api/driver/missions", requireUser, async (_req, res) => {
    const memberId = await getMemberId(res.locals.telegramId as string);
    if (!memberId) {
      res.status(404).json({ error: "not linked" });
      return;
    }
    const { getDriverMissions } = await import("../services/driverMissionService");
    res.json(await getDriverMissions(memberId));
  });
  app.post("/api/driver/missions/claim", requireUser, rateLimit(20), async (req, res) => {
    const memberId = await getMemberId(res.locals.telegramId as string);
    if (!memberId) {
      res.status(404).json({ error: "not linked" });
      return;
    }
    const { claimDriverMission } = await import("../services/driverMissionService");
    res.json(await claimDriverMission(memberId, String((req.body as { missionId?: string })?.missionId ?? "")));
  });

  // 🚗 Driver kas account (Mini App): balance + debt + today's rides. No /driver_login — uses the
  // member's already-linked plate + the admin kas client. canPayDebt gates the pay button (qarz flag).
  app.get("/api/driver/account", requireUser, async (_req, res) => {
    const memberId = await getMemberId(res.locals.telegramId as string);
    if (!memberId) {
      res.status(404).json({ error: "not linked" });
      return;
    }
    const { getDriverPanelExtras } = await import("../services/driverReportService");
    res.json(await getDriverPanelExtras(memberId));
  });

  // 💸 Pay kas company debt with tanga. MONEY PATH — atomic hold + refund (driverDebtService).
  // nonce makes a double-submit of the SAME pay-card a no-op. Gated behind the qarz flag.
  app.post("/api/driver/debt/pay", requireUser, rateLimit(10), async (req, res) => {
    const memberId = await getMemberId(res.locals.telegramId as string);
    if (!memberId) {
      res.status(404).json({ error: "not linked" });
      return;
    }
    const body = req.body as { amount?: number; nonce?: string };
    const amount = Math.floor(Number(body?.amount ?? 0));
    const nonce = String(body?.nonce ?? "").slice(0, 64) || "noNonce";
    const { payDebtWithCoins } = await import("../services/driverDebtService");
    res.json(await payDebtWithCoins(memberId, amount, nonce));
  });

  // 📷 Driver's in-car recruit QR — link + PNG data URL + ready-to-share text. Drivers show it to
  // riders; a scan+ride pays the driver. Surfaced in the Mini App so sharing is one tap.
  app.get("/api/driver/qr", requireUser, async (_req, res) => {
    const memberId = await getMemberId(res.locals.telegramId as string);
    if (!memberId) {
      res.status(404).json({ error: "not linked" });
      return;
    }
    const m = await prisma.member.findUnique({ where: { id: memberId }, select: { type: true } });
    if (m?.type !== "driver") {
      res.json({ ok: false, reason: "not_driver" });
      return;
    }
    const { driverQrLink } = await import("../services/recruitService");
    const link = driverQrLink(memberId);
    const QR = await import("qrcode");
    const png = await QR.toDataURL(link, { width: 600, margin: 2 }).catch(() => null);
    const shareText = "1067 Taxi — chaqiring, tejang, bonus yig'ing! 🚕 Mening havolam orqali qo'shiling:";
    res.json({ ok: true, link, png, shareText });
  });

  app.get("/api/missions", requireUser, async (_req, res) => {
    const memberId = await getMemberId(res.locals.telegramId as string);
    if (!memberId) {
      res.status(404).json({ error: "not linked" });
      return;
    }
    res.json(await getMissions(memberId));
  });

  app.post("/api/missions/claim", requireUser, async (req, res) => {
    const memberId = await getMemberId(res.locals.telegramId as string);
    if (!memberId) {
      res.status(404).json({ error: "not linked" });
      return;
    }
    const code = String(req.query.code ?? "");
    res.json(await claimMission(memberId, code));
  });

  app.get("/api/referral", requireUser, async (_req, res) => {
    res.json(await getReferralInfo(res.locals.telegramId as string));
  });

  app.get("/api/weekly", requireUser, async (_req, res) => {
    const memberId = await getMemberId(res.locals.telegramId as string);
    if (!memberId) {
      res.status(404).json({ error: "not linked" });
      return;
    }
    res.json(await getWeeklyBoard(memberId));
  });

  app.get("/api/box", requireUser, async (_req, res) => {
    const memberId = await getMemberId(res.locals.telegramId as string);
    if (!memberId) {
      res.status(404).json({ error: "not linked" });
      return;
    }
    res.json(await getBoxStatus(memberId));
  });

  app.post("/api/box/open", requireUser, async (req, res) => {
    const memberId = await getMemberId(res.locals.telegramId as string);
    if (!memberId) {
      res.status(404).json({ error: "not linked" });
      return;
    }
    res.json(await openBox(memberId));
  });

  // shared helper: resolve the caller's memberId, 404 if not linked
  const withMember = (
    handler: (memberId: number, req: Request, res: Response) => Promise<unknown>,
  ) => async (req: Request, res: Response) => {
    const memberId = await getMemberId(res.locals.telegramId as string);
    if (!memberId) {
      res.status(404).json({ error: "not linked" });
      return;
    }
    res.json(await handler(memberId, req, res));
  };

  // ─── Uber-level booking (map + live tracking) ───────────────────────────────
  app.get("/api/booking/info", requireUser, withMember(async (id, req) => {
    const { featureOn } = await import("../services/featureFlags");
    const [info, flagOn] = await Promise.all([getBookingInfo(id), featureOn("booking3")]);
    // Booking 3.0 ega-ko'z darvozasi: global flag OFF bo'lsa ham EGA yangi oqimni ko'radi
    // (ilovani oddiy ochib — tasdiqdan oldin preview). QABUL → flag global ON → bu ahamiyatsiz.
    const previewer = resolveTelegramId(req) === "6506297119";
    return { ...info, booking3: flagOn || previewer };
  }));
  // V1 living home aggregate: greeting name, usual ride, live cars, balances.
  app.get("/api/home", requireUser, withMember(async (id) => {
    const { getMeByMemberId } = await import("../services/memberService");
    const { nearbyPins } = await import("../services/bookingPlus");
    const { inflateOnline } = await import("@t1067/shared");
    const [info, me, pins] = await Promise.all([
      getBookingInfo(id),
      getMeByMemberId(id),
      nearbyPins().catch(() => ({ pins: [] as { lat: number; lng: number; bearing: number; busy: boolean }[], freeDrivers: 0 })),
    ]);
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const todayRides = await prisma.rideReward.count({ where: { memberId: id, createdAt: { gte: since } } });
    const errored = "error" in info;
    const center = errored ? { lat: 39.045, lng: 65.535 } : info.center; // Koson markazi fallback
    const q = errored ? null : info.quickPickup;
    return {
      name: (me?.member.fullName ?? "").split(" ")[0] || "do'stim",
      coins: me?.coins ?? 0,
      cashback: me?.stats.points ?? 0,
      streak: me?.streak?.current ?? 0,
      freeCars: inflateOnline(pins.freeDrivers), // riders see ~2× free cars (display only)
      carPins: pins.pins.slice(0, 12),
      center,
      usualRide: q ? { id: q.id, name: q.name } : null,
      todayRides,
    };
  }));
  // Account & settings IN the Mini App (mirrors the bot /account): info + notification toggle.
  app.get("/api/account", requireUser, withMember(async (id) => {
    const { getMeByMemberId } = await import("../services/memberService");
    const { isNotifyOff } = await import("../services/notifyService");
    const [me, tu, notifyOff, m] = await Promise.all([
      getMeByMemberId(id),
      prisma.telegramUser.findFirst({ where: { memberId: id }, select: { linkedAt: true, createdAt: true } }),
      isNotifyOff(id),
      prisma.member.findUnique({ where: { id }, select: { phone: true } }),
    ]);
    const phone = m?.phone ?? "";
    return {
      name: me?.member.fullName ?? "",
      phone: phone ? `${phone.slice(0, 4)}•••${phone.slice(-2)}` : "—",
      joined: (tu?.linkedAt ?? tu?.createdAt ?? null)?.toISOString().slice(0, 10) ?? null,
      type: me?.type ?? "client",
      coins: me?.coins ?? 0,
      cashback: me?.stats.points ?? 0,
      streak: me?.streak?.current ?? 0,
      trips: me?.stats.trips ?? 0,
      notifyOff,
    };
  }));
  app.post("/api/account/notify", requireUser, withMember(async (id, req) => {
    const { setNotifyOff } = await import("../services/notifyService");
    const off = !!(req.body as { off?: boolean })?.off;
    await setNotifyOff(id, off);
    return { ok: true, off };
  }));
  // ✏️ user edits their OWN display name (saved to displayName, survives kas sync). "" clears it.
  app.post("/api/account/name", requireUser, rateLimit(10), withMember(async (id, req) => {
    const { setDisplayName } = await import("../services/memberService");
    const name = await setDisplayName(id, String((req.body as { name?: string })?.name ?? ""));
    if (name === null) return { ok: false, reason: "invalid" };
    return { ok: true, name };
  }));
  app.get("/api/booking/active", requireUser, withMember((id) => getActiveBookingFor(id)));
  // "Yana shu yo'l" (NEXT_LEVEL_PLAN 1.1): home-screen 1-tap repeat-route chips
  app.get("/api/booking/recent", requireUser, withMember((id) => getRecentPickups(id)));
  // 🛡 share-my-trip (family safety): POST mints a token (auth'd rider); GET is PUBLIC, read-only,
  // active-only — anyone with the link watches the car + live fare until the trip ends. No PII.
  app.post("/api/track", requireUser, rateLimit(20), withMember(async (id) => {
    const { createTrackToken } = await import("../services/trackService");
    return { token: await createTrackToken(id) };
  }));
  app.get("/api/track/:token", async (req, res) => {
    const { resolveTrack } = await import("../services/trackService");
    res.json(await resolveTrack(String(req.params.token)));
  });
  app.post("/api/booking/search", requireUser, withMember((_id, req) => searchBookingAddress(String((req.body as { q?: string })?.q ?? ""))));
  // M7 center-pin: nearest catalog address to a dragged map point (read-only; booking still by addressId)
  app.post("/api/booking/nearest", requireUser, withMember((id, req) => {
    const b = (req.body ?? {}) as { lat?: number; lng?: number };
    return nearestAddressFor(id, Number(b.lat), Number(b.lng));
  }));
  app.post("/api/booking/create", requireUser, rateLimit(3), withMember((id, req) => createBookingFor(id, req.body as BookingCreateBody)));
  // 1-tap "1067 Now": server resolves the pickup behind the button (rate-limited — real taxis dispatch here)
  app.post("/api/booking/now", requireUser, rateLimit(3), withMember((id, req) => callOneTapFor(id, (req.body ?? {}) as BookingNowBody, "miniapp")));
  // ride history (kas bookingReports) — ALL rides (adaptive pagination: most riders fit one page, so
  // it's a single call; heavy riders fetch more until a short page) + lifetime totals & savings %.
  app.get("/api/booking/history", requireUser, withMember(async (id) => {
    const m = await prisma.member.findUnique({ where: { id }, select: { phone: true } });
    if (!m?.phone) return { rides: [], totals: { count: 0, spent: 0, cashback: 0, savingsPct: 0 } };
    const { getRideHistoryFull } = await import("../services/bookingService");
    return getRideHistoryFull(id, m.phone);
  }));
  app.post("/api/booking/cancel", requireUser, withMember((id) => cancelBookingFor(id)));

  // ─── 🚐 Intercity (nationwide seat booking) — service no-ops when `intercity` OFF ───
  app.get("/api/intercity/cities", requireUser, async (req, res) => res.json(await (await import("../services/intercityService")).listCities(String(req.query?.q ?? ""))));
  app.get("/api/intercity/trips", requireUser, async (req, res) => {
    const { searchTrips } = await import("../services/intercityService");
    const day = req.query?.date ? new Date(String(req.query.date)) : new Date();
    res.json(await searchTrips(Number(req.query?.originId), Number(req.query?.destId), isNaN(day.getTime()) ? new Date() : day));
  });
  app.post("/api/intercity/book", requireUser, rateLimit(5), withMember2(async (id, req) => (await import("../services/intercityService")).bookSeat(id, {
    tripId: Number(req.body?.tripId), seatCount: Number(req.body?.seatCount ?? 1),
    paymentMethod: req.body?.paymentMethod === "PREPAY" ? "PREPAY" : "CASH",
    tangaDiscount: Number(req.body?.tangaDiscount ?? 0),
    boardingCityId: req.body?.boardingCityId ? Number(req.body.boardingCityId) : undefined,
    alightingCityId: req.body?.alightingCityId ? Number(req.body.alightingCityId) : undefined,
  })));
  app.post("/api/intercity/cancel", requireUser, rateLimit(10), withMember2(async (id, req) => (await import("../services/intercityService")).cancelBookingByRider(id, Number(req.body?.bookingId))));
  app.get("/api/intercity/my-active", requireUser, withMember2(async (id) => (await import("../services/intercityService")).getRiderActiveBookings(id)));
  app.get("/api/intercity/my-bookings", requireUser, withMember2(async (id) => (await import("../services/intercityService")).getRiderBookings(id)));
  // driver
  app.post("/api/intercity/trip", requireUser, rateLimit(10), withMember2(async (id, req) => (await import("../services/intercityService")).publishTrip(id, {
    originCityId: Number(req.body?.originCityId), destCityId: Number(req.body?.destCityId),
    scheduledAt: new Date(String(req.body?.scheduledAt)), carCapacity: Number(req.body?.carCapacity ?? 4),
    fareSom: req.body?.fareSom != null ? Number(req.body.fareSom) : undefined, note: req.body?.note ? String(req.body.note) : undefined,
  })));
  app.post("/api/intercity/trip/depart", requireUser, rateLimit(20), withMember2(async (id, req) => (await import("../services/intercityService")).departTrip(id, Number(req.body?.tripId))));
  app.post("/api/intercity/trip/arrive", requireUser, rateLimit(20), withMember2(async (id, req) => (await import("../services/intercityService")).arriveTrip(id, Number(req.body?.tripId))));
  app.post("/api/intercity/trip/cancel", requireUser, rateLimit(20), withMember2(async (id, req) => (await import("../services/intercityService")).driverCancelTrip(id, Number(req.body?.tripId))));
  app.get("/api/intercity/driver/trips", requireUser, withMember2(async (id) => (await import("../services/intercityService")).getDriverTrips(id)));
  app.get("/api/intercity/driver/manifest", requireUser, withMember2(async (id, req) => (await import("../services/intercityService")).getTripManifest(id, Number(req.query?.tripId))));
  app.get("/api/intercity/driver/enrollments", requireUser, withMember2(async (id) => (await import("../services/intercityService")).getDriverEnrollments(id)));
  app.post("/api/intercity/driver/enroll", requireUser, rateLimit(10), withMember2(async (id, req) => (await import("../services/intercityService")).enrollDriver(id, Number(req.body?.cityA), Number(req.body?.cityB), Number(req.body?.carCapacity ?? 4))));
  // admin
  app.get("/api/intercity/admin/trips", requireAdmin, async (req, res) => res.json(await (await import("../services/intercityService")).adminListTrips({ status: req.query?.status ? String(req.query.status) : undefined })));
  app.get("/api/intercity/admin/debts", requireAdmin, async (_req, res) => res.json(await (await import("../services/intercityService")).adminListDebts()));
  app.post("/api/intercity/admin/trip/cancel", requireAdmin, async (req, res) => res.json(await (await import("../services/intercityService")).adminForceCancelTrip(Number(req.body?.tripId))));

  app.post("/api/booking/estimate", requireUser, async (req, res) => {
    const b = req.body as { pickup?: GeoPt; dest?: GeoPt; surcharge?: number };
    if (!b?.pickup || !b?.dest) {
      res.status(400).json({ error: "pickup and dest required" });
      return;
    }
    res.json(await estimateFare(b.pickup, b.dest, Math.floor(Number(b.surcharge ?? 0))));
  });

  // ─── client power-ups: fare + cashback config ───────────────────────────────
  app.get("/api/fare/config", requireUser, async (_req, res) => {
    try {
      res.json(await getFareConfig());
    } catch (e) {
      res.status(502).json({ error: e instanceof Error ? e.message : "kas unavailable" });
    }
  });

  app.get("/api/leaderboard", requireUser, async (req, res) => {
    const id = res.locals.telegramId as string;
    // default to the caller's own member type
    const me = await getMe(id);
    const type = memberType(req, me?.type ?? "client");
    res.json(await getLeaderboard(type, id));
  });

  // ─── admin ──────────────────────────────────────────────────────────────────
  // ── 🗺 Booking 3.0: prediction + live pins + post-ride rating ────────────
  app.get("/api/booking/predict", requireUser, async (req, res) => {
    const { predictFare } = await import("../services/bookingPlus");
    res.json(await predictFare(req.query.address ? String(req.query.address) : undefined));
  });
  app.get("/api/booking/nearby", requireUser, async (_req, res) => {
    const { nearbyPins } = await import("../services/bookingPlus");
    const { inflateOnline } = await import("@t1067/shared");
    const np = await nearbyPins();
    res.json({ ...np, freeDrivers: inflateOnline(np.freeDrivers) }); // riders see ~2× free cars; pins stay real
  });
  // 📷 Driver portrait proxy — resolves Telegram file_id (or override URL) to a live image. Public
  // (no auth) so the Mini App can render it as a plain <img src>. V-NEXT #4: sequential memberIds
  // made the whole driver-photo set enumerable by anyone — now per-IP rate-limited (the regular
  // rateLimit keys on telegramId, which this authless route doesn't have). 30/min covers a real
  // rider's screen (a handful of imgs, browser-cached 1h) while making a full-fleet scrape loud.
  const photoHits = new Map<string, { n: number; resetAt: number }>();
  app.get("/api/driver-photo/:memberId", async (req, res) => {
    const ipKey = String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "?").split(",")[0]!.trim();
    if (photoHits.size > 10_000) photoHits.clear(); // bound memory
    const now = Date.now();
    let b = photoHits.get(ipKey);
    if (!b || now > b.resetAt) { b = { n: 0, resetAt: now + 60_000 }; photoHits.set(ipKey, b); }
    if (++b.n > 30) { res.status(429).end(); return; }
    const id = Math.floor(Number(req.params.memberId));
    if (!id) { res.status(400).end(); return; }
    const { resolveDriverPhoto } = await import("../services/driverPhotoService");
    const p = await resolveDriverPhoto(id);
    if (!p) { res.status(404).end(); return; }
    await pipeTelegramFile(res, p.url, 3600, req); // ~1 soat — Telegram URL TTL bilan bir xil
  });
  app.post("/api/admin/driver-photos/sync", requireAdmin, requireOwner, async (_req, res) => {
    const { syncAllLinkedDriverPhotos } = await import("../services/driverPhotoService");
    res.json(await syncAllLinkedDriverPhotos());
  });
  // 📷 Admin uploads a driver portrait directly from the admin panel — base64 JSON body, ≤5 MB
  // (no multer dep). Server hands the bytes to Telegram via bot.sendPhoto; we keep only the file_id.
  app.post("/api/admin/driver-photo/:driverId", express.json({ limit: "6mb" }), requireAdmin, requireOwner, async (req, res) => {
    const driverId = Math.floor(Number(req.params.driverId));
    const b = (req.body ?? {}) as { mime?: string; base64?: string };
    if (!driverId || !b.base64) { res.status(400).json({ error: "bad request" }); return; }
    const buf = Buffer.from(b.base64, "base64");
    if (buf.length === 0) { res.status(400).json({ error: "empty image" }); return; }
    if (buf.length > 5 * 1024 * 1024) { res.status(413).json({ error: "image too large" }); return; }
    const { uploadDriverPhotoFromBuffer } = await import("../services/driverPhotoService");
    const fileId = await uploadDriverPhotoFromBuffer(driverId, buf, b.mime || "image/jpeg");
    if (!fileId) { res.status(500).json({ error: "telegram upload failed — check BOT_TOKEN + admin id" }); return; }
    res.json({ ok: true, fileId });
  });
  app.delete("/api/admin/driver-photo/:driverId", requireAdmin, requireOwner, async (req, res) => {
    const driverId = Math.floor(Number(req.params.driverId));
    if (!driverId) { res.status(400).json({ error: "bad driverId" }); return; }
    const { clearDriverPhoto } = await import("../services/driverPhotoService");
    await clearDriverPhoto(driverId);
    res.json({ ok: true });
  });
  app.post("/api/booking/rate", requireUser, rateLimit(10), withMember2(async (id, req) => {
    const { rateRide, RATING_TAGS } = await import("../services/bookingPlus");
    const b = req.body as { bookingId?: number; stars?: number; tags?: string[] };
    const r = await rateRide(id, Math.floor(Number(b?.bookingId ?? 0)), Number(b?.stars ?? 0), Array.isArray(b?.tags) ? b.tags.map(String) : []);
    return { ...r, allTags: RATING_TAGS };
  }));

  // ── ⏰ rejali safar + 👨‍👩‍👧 oila ──────────────────────────────────────────
  app.get("/api/booking/scheduled", requireUser, withMember2(async (id) => {
    const { listScheduled, familyOf } = await import("../services/scheduledService");
    return { scheduled: await listScheduled(id), family: await familyOf(id) };
  }));
  app.post("/api/booking/schedule", requireUser, rateLimit(5), withMember2(async (id, req) => {
    const { createScheduled } = await import("../services/scheduledService");
    const b = req.body as { pickupId?: number; pickupName?: string; runAt?: string; forPhone?: string };
    return createScheduled(id, Math.floor(Number(b?.pickupId ?? 0)), String(b?.pickupName ?? ""), String(b?.runAt ?? ""), b?.forPhone ? String(b.forPhone) : undefined);
  }));
  app.post("/api/booking/schedule/cancel", requireUser, rateLimit(10), withMember2(async (id, req) => {
    const { cancelScheduled } = await import("../services/scheduledService");
    return cancelScheduled(id, Math.floor(Number((req.body as { id?: number })?.id ?? 0)));
  }));
  app.post("/api/family/add", requireUser, rateLimit(10), withMember2(async (id, req) => {
    const { addFamily } = await import("../services/scheduledService");
    const b = req.body as { phone?: string; name?: string };
    return addFamily(id, String(b?.phone ?? ""), String(b?.name ?? ""));
  }));
  app.post("/api/family/remove", requireUser, rateLimit(10), withMember2(async (id, req) => {
    const { removeFamily } = await import("../services/scheduledService");
    return removeFamily(id, Math.floor(Number((req.body as { id?: number })?.id ?? 0)));
  }));
  app.post("/api/family/book", requireUser, rateLimit(5), withMember2(async (id, req) => {
    const { bookForFamily } = await import("../services/scheduledService");
    const b = req.body as { familyId?: number; pickupId?: number; pickupName?: string };
    return bookForFamily(id, Math.floor(Number(b?.familyId ?? 0)), Math.floor(Number(b?.pickupId ?? 0)), String(b?.pickupName ?? ""));
  }));


  // ── 🤖 AI support (rules-first; LLM only when owner adds free keys) ──────
  app.post("/api/ai/ask", requireUser, rateLimit(10), withMember2(async (id, req) => {
    const { parseIntent, aiSupport } = await import("../services/ai/intent");
    const text = String((req.body as { text?: string })?.text ?? "").slice(0, 300);
    const intent = parseIntent(text);
    if (intent.type === "faq") return { source: "rules", answer: intent.answer };
    if (intent.type === "book") return { source: "rules", answer: "🚕 Taksi kerakmi? Bosh ekrandagi «Taxi chaqirish» tugmasini bosing!", book: true };
    const llm = await aiSupport(id, text);
    return llm ? { source: "llm", answer: llm } : { source: "none", answer: "☎️ Bu savolga operator yordam beradi: 1067" };
  }));

  // kill-switch flags + mashina fondi + B2B corp accounts
  app.get("/api/admin/features", requireAdmin, async (_req, res) => {
    const { listFeatures, fundTotal } = await import("../services/featureFlags");
    res.json({ features: await listFeatures(), mashinaFund: await fundTotal() });
  });
  app.post("/api/admin/features", requireAdmin, requireOwner, async (req, res) => {
    const { setFeature, FEATURES, listFeatures } = await import("../services/featureFlags");
    const b = req.body as { name?: string; on?: boolean };
    if (!FEATURES.includes(b?.name as never)) {
      res.status(400).json({ error: "unknown feature" });
      return;
    }
    await setFeature(b.name as never, b.on !== false);
    // Flag-o'zgarish logi (2026-07-17 saboq: welcomebonus jimgina o'chirilgan, hech kim bilmagan).
    // Faqat shu owner-endpoint va setFlag.ts alert beradi — setFeature ichiga qo'yilmaydi,
    // aks holda test-skriptlar har flag-toggle'da adminni spamlaydi.
    const { alertAdmins } = await import("../services/economyService");
    await alertAdmins(`⚙️ <b>Flag o'zgardi (admin-panel):</b> <code>${b.name}</code> → ${b.on !== false ? "✅ ON" : "⛔ OFF"}`).catch(() => undefined);
    res.json({ ok: true, features: await listFeatures() });
  });
  // 🧠 Koson AI jamoaviy bilim — moderatsiya (admin panel: pending ro'yxat, tasdiqlash/rad/o'chirish).
  app.get("/api/admin/knowledge", requireAdmin, async (req, res) => {
    const { listByStatus } = await import("../services/ai/knowledgeService");
    const status = (["pending", "approved", "rejected"] as const).find((s) => s === req.query.status) ?? "pending";
    res.json({ status, items: await listByStatus(status) });
  });
  app.post("/api/admin/knowledge/:id/moderate", requireAdmin, requireOwner, rateLimit(30), async (req, res) => {
    const { moderate } = await import("../services/ai/knowledgeService");
    const r = await moderate(Number(req.params.id), (req.body as { approve?: boolean })?.approve !== false, String(res.locals.telegramId));
    res.json(r);
  });
  app.delete("/api/admin/knowledge/:id", requireAdmin, requireOwner, rateLimit(30), async (req, res) => {
    const { deleteKnowledge } = await import("../services/ai/knowledgeService");
    res.json(await deleteKnowledge(Number(req.params.id)));
  });

  // 👔 JAMOA J3 (JAMOA_PLAN.md) — xodimlar paneli. REAL so'm (StaffLedger), tanga EMAS.
  // Hammasi owner-only: oylik ma'lumoti admin-tokenli operatorga ham ko'rinmasligi kerak.
  app.get("/api/admin/staff/overview", requireAdmin, requireOwner, async (_req, res) => {
    const { staffAdminOverview } = await import("../services/staffAdminService");
    res.json(await staffAdminOverview());
  });
  app.get("/api/admin/staff/employee/:id", requireAdmin, requireOwner, async (req, res) => {
    const { staffAdminEmployee } = await import("../services/staffAdminService");
    const r = await staffAdminEmployee(Number(req.params.id), String(req.query.month ?? ""));
    if (!r) { res.status(404).json({ error: "not found" }); return; }
    res.json(r);
  });
  app.post("/api/admin/staff/employee", requireAdmin, requireOwner, rateLimit(60), async (req, res) => {
    const { staffAdminEmployeeSave } = await import("../services/staffAdminService");
    res.json(await staffAdminEmployeeSave(req.body ?? {}));
  });
  app.post("/api/admin/staff/pay", requireAdmin, requireOwner, rateLimit(30), async (req, res) => {
    const { staffAdminPay } = await import("../services/staffAdminService");
    const b = req.body as { employeeId?: number; kind?: string; amount?: number; note?: string; idemKey?: string };
    const r = await staffAdminPay({
      employeeId: Number(b?.employeeId),
      kind: b?.kind as "payout" | "bonus" | "adjust",
      amount: Number(b?.amount),
      note: b?.note,
      idemKey: String(b?.idemKey ?? ""),
      actor: String(res.locals.telegramId ?? "admin"),
    });
    // Xodimga darhol xabar (JAMOA_PLAN §1.2 — "tortishuv qolmaydi"); yuborilmasa ham pul yozildi.
    if (r.ok && r.notifyTelegramId && r.notifyText && opts.sendMessage) {
      await opts.sendMessage(r.notifyTelegramId, r.notifyText).catch(() => undefined);
    }
    res.json({ ok: r.ok, error: r.error });
  });
  app.post("/api/admin/staff/session", requireAdmin, requireOwner, rateLimit(120), async (req, res) => {
    const { staffAdminSessionSet } = await import("../services/staffAdminService");
    const b = (req.body ?? {}) as Record<string, unknown>;
    res.json(await staffAdminSessionSet({ ...(b as object), employeeId: Number(b.employeeId), date: String(b.date ?? ""), actor: String(res.locals.telegramId ?? "admin") } as never));
  });
  app.get("/api/admin/staff/orgs", requireAdmin, requireOwner, async (_req, res) => {
    const { staffAdminOrgs } = await import("../services/staffAdminService");
    res.json({ orgs: await staffAdminOrgs() });
  });
  app.post("/api/admin/staff/org", requireAdmin, requireOwner, rateLimit(20), async (req, res) => {
    const { staffAdminOrgCreate } = await import("../services/staffAdminService");
    const b = req.body as { name?: string; ownerTelegramId?: string };
    res.json(await staffAdminOrgCreate(String(b?.name ?? ""), String(b?.ownerTelegramId ?? "")));
  });
  app.post("/api/admin/staff/org/:id", requireAdmin, requireOwner, rateLimit(60), async (req, res) => {
    const { staffAdminOrgSave } = await import("../services/staffAdminService");
    res.json(await staffAdminOrgSave(Number(req.params.id), (req.body ?? {}) as Record<string, unknown>));
  });
  app.post("/api/admin/staff/calendar", requireAdmin, requireOwner, rateLimit(120), async (req, res) => {
    const { staffAdminCalendarSet } = await import("../services/staffAdminService");
    const b = req.body as { orgId?: number; date?: string; kind?: string | null };
    res.json(await staffAdminCalendarSet(Number(b?.orgId), String(b?.date ?? ""), (b?.kind ?? null) as never));
  });
  // 📄 J5: oy-oxiri hisobot + eski oyliklarni ommaviy kiritish
  app.get("/api/admin/staff/report", requireAdmin, requireOwner, async (req, res) => {
    const { staffAdminMonthReport } = await import("../services/staffAdminService");
    const r = await staffAdminMonthReport(Number(req.query.orgId), String(req.query.month ?? ""));
    if (!r) { res.status(404).json({ error: "org not found" }); return; }
    res.json(r);
  });
  app.post("/api/admin/staff/import", requireAdmin, requireOwner, rateLimit(10), async (req, res) => {
    const { staffAdminBulkImport } = await import("../services/staffAdminService");
    const b = req.body as { orgId?: number; text?: string };
    res.json(await staffAdminBulkImport(Number(b?.orgId), String(b?.text ?? "")));
  });

  // 🎁 Acquisition bonuses — owner sets first-ride / referral / recruit / driver→driver amounts live.
  app.get("/api/admin/bonus-economy", requireAdmin, async (_req, res) => {
    const { BONUS_ECON_KNOBS } = await import("@t1067/shared");
    const { getBonusEcon } = await import("../services/bonusConfig");
    res.json({ knobs: BONUS_ECON_KNOBS, values: await getBonusEcon() });
  });
  app.post("/api/admin/bonus-economy", requireAdmin, requireOwner, async (req, res) => {
    const b = req.body as { key?: string; value?: number };
    const { BONUS_ECON_KNOBS } = await import("@t1067/shared");
    if (!BONUS_ECON_KNOBS.some((k) => k.key === b?.key) || typeof b?.value !== "number") {
      res.status(400).json({ error: "unknown knob or bad value" });
      return;
    }
    const { setBonusEcon } = await import("../services/bonusConfig");
    res.json({ ok: true, values: await setBonusEcon(b.key as string, b.value) });
  });
  // ── 🛍 SHOP admin (owner-gated writes) ────────────────────────────────────────────────────────
  // V1.7: seller-token FAQAT o'z scope'i (sellerShopId majburiy); owner (scope yo'q) `?shopId=`/body
  // `shopId` bilan istalgan do'konni tanlaydi — D2/C1'dagi resolveProfileShopId bilan bir xil naqsh
  // (allaqachon R4'dan o'tgan xavfsizlik-chegara: query faqat scope===undefined bo'lganda ishoniladi).
  const resolveProfileShopId = (req: Request, res: Response): number | null => {
    const scope = res.locals.sellerShopId as number | undefined;
    if (scope !== undefined) return scope;
    const q = Number((req.query.shopId as string | undefined) ?? (req.body as { shopId?: unknown } | undefined)?.shopId);
    return Number.isFinite(q) && q > 0 ? q : null;
  };
  app.get("/api/admin/shop/products", requireAdmin, async (req, res) => {
    const { adminListProducts } = await import("../services/shopService");
    res.json(await adminListProducts(resolveProfileShopId(req, res) ?? undefined)); // owner shopId bo'lmasa = barcha do'konlar
  });
  app.post("/api/admin/shop/products", requireAdmin, requireShopWrite, rateLimit(20), async (req, res) => {
    const { adminCreateProduct, logAudit } = await import("../services/shopService");
    const r = await adminCreateProduct(req.body ?? {}, resolveProfileShopId(req, res) ?? undefined); // seller → O'Z do'koni; owner → tanlagan do'koni
    if (r.ok) void logAudit(String(res.locals.adminRole ?? ""), (res.locals.telegramId as string) ?? null, "create_product", "product", r.id ?? null, (req.body as { name?: string })?.name);
    res.json(r);
  });
  // V1.2: seller o'zgartirmoqchi bo'lgan mahsulot O'Z do'koninikimi — choke-point tekshiruv
  const sellerOwnsProduct = async (res: Response, productId: number): Promise<boolean> => {
    const scope = res.locals.sellerShopId as number | undefined;
    if (scope === undefined) return true; // owner/operator — cheklovsiz
    const { productBelongsToShop } = await import("../services/shopService");
    if (await productBelongsToShop(productId, scope)) return true;
    res.status(403).json({ error: "not_your_shop" });
    return false;
  };
  app.post("/api/admin/shop/products/:id", requireAdmin, requireShopWrite, rateLimit(20), async (req, res) => {
    if (!(await sellerOwnsProduct(res, Number(req.params.id)))) return;
    const { adminEditProduct, logAudit } = await import("../services/shopService");
    const r = await adminEditProduct(Number(req.params.id), req.body ?? {});
    void logAudit(String(res.locals.adminRole ?? ""), (res.locals.telegramId as string) ?? null, "edit_product", "product", Number(req.params.id));
    res.json(r);
  });
  app.post("/api/admin/shop/products/:id/toggle", requireAdmin, requireShopWrite, rateLimit(20), async (req, res) => {
    if (!(await sellerOwnsProduct(res, Number(req.params.id)))) return;
    const { adminToggleProduct } = await import("../services/shopService");
    res.json(await adminToggleProduct(Number(req.params.id), !!req.body?.active));
  });
  app.delete("/api/admin/shop/products/:id", requireAdmin, requireOwner, rateLimit(20), async (req, res) => {
    const { adminDeleteProduct, logAudit } = await import("../services/shopService");
    const r = await adminDeleteProduct(Number(req.params.id));
    void logAudit(String(res.locals.adminRole ?? ""), (res.locals.telegramId as string) ?? null, "delete_product", "product", Number(req.params.id));
    res.json(r);
  });
  app.post("/api/admin/shop/products/:id/photo", express.json({ limit: "6mb" }), requireAdmin, requireShopWrite, async (req, res) => {
    if (!(await sellerOwnsProduct(res, Number(req.params.id)))) return;
    const b = req.body as { mime?: string; base64?: string };
    if (!b?.base64) { res.status(400).json({ error: "no image" }); return; }
    const { uploadProductPhoto } = await import("../services/shopService");
    res.json(await uploadProductPhoto(Number(req.params.id), Buffer.from(b.base64, "base64"), b.mime || "image/jpeg"));
  });
  // 🌍 Open Food Facts: barkod bo'yicha nom/brend/hajm/rasm (ega so'rovi 2026-07-28).
  // Faqat O'QIYDI — hech narsani saqlamaydi; sotuvchi formada ko'radi va o'zi tasdiqlaydi.
  app.get("/api/admin/shop/barcode/:code", requireAdmin, requireShopWrite, rateLimit(30), async (req, res) => {
    const { lookupBarcode } = await import("../services/openFoodService");
    const found = await lookupBarcode(String(req.params.code));
    res.json({ found: !!found, product: found });
  });
  // Rasmni OFF'dan olib mahsulotga qo'shish. Manzil MIJOZDAN OLINMAYDI — server barkod bo'yicha
  // o'zi qaraydi va faqat images.openfoodfacts.org dan yuklaydi (aks holda bu endpoint
  // "istalgan URL'dan rasm tort" ga aylanardi — SSRF va mualliflik muammosi).
  app.post("/api/admin/shop/products/:id/photo-from-barcode", requireAdmin, requireShopWrite, rateLimit(20), async (req, res) => {
    const id = Number(req.params.id);
    if (!(await sellerOwnsProduct(res, id))) return;
    const row = await prisma.product.findUnique({ where: { id }, select: { barcode: true } });
    if (!row?.barcode) { res.json({ ok: false, error: "no_barcode" }); return; }
    const { lookupBarcode, fetchOffImage } = await import("../services/openFoodService");
    const off = await lookupBarcode(row.barcode);
    if (!off?.imageUrl) { res.json({ ok: false, error: "no_image" }); return; }
    const img = await fetchOffImage(off.imageUrl);
    if (!img) { res.json({ ok: false, error: "fetch_failed" }); return; }
    const { uploadProductPhoto } = await import("../services/shopService");
    const r = await uploadProductPhoto(id, img.buf, img.mime);
    await prisma.product.update({ where: { id }, data: { photoCredit: off.credit } }).catch(() => undefined);
    res.json({ ...r, credit: off.credit });
  });
  app.delete("/api/admin/shop/products/:id/photo", requireAdmin, requireShopWrite, async (req, res) => {
    if (!(await sellerOwnsProduct(res, Number(req.params.id)))) return;
    const { clearProductPhotos } = await import("../services/shopService");
    res.json(await clearProductPhotos(Number(req.params.id)));
  });
  // V0.1→V1.2 (BirJoy): buyer PII — owner HAMMASINI ko'radi; shopseller FAQAT o'z do'konining
  // buyurtma/sharhlarini (scoped adminList* — service-qatlamda productId-filtr). Begona seller-token
  // uchun bu ma'lumot 403 EMAS — bo'sh emas, O'Z subset'i: shu tarzda seller panel ham ishlayveradi.
  app.get("/api/admin/shop/orders", requireAdmin, requireShopWrite, async (req, res) => {
    const { adminListPurchases } = await import("../services/shopService");
    res.json({ orders: await adminListPurchases(req.query?.status ? String(req.query.status) : undefined, resolveProfileShopId(req, res) ?? undefined) });
  });
  app.get("/api/admin/shop/reviews", requireAdmin, requireShopWrite, async (req, res) => {
    const { adminListReviews } = await import("../services/shopService");
    res.json({ reviews: await adminListReviews(resolveProfileShopId(req, res) ?? undefined) });
  });
  // 🏪 D2: do'kon-profil (story/e'lon/mahalla/muqova-rasm) — shopseller FAQAT o'z do'koni,
  // owner esa `?shopId=` bilan istalgan do'konni tahrirlaydi (bir nechta do'kon boshqaradigan panel).
  app.get("/api/admin/shop/profile", requireAdmin, requireShopWrite, async (req, res) => {
    const shopId = resolveProfileShopId(req, res);
    if (!shopId) { res.status(400).json({ error: "no_shop" }); return; }
    const { getShopProfile } = await import("../services/shopService");
    const profile = await getShopProfile(shopId, true);
    if (!profile) { res.status(404).json({ error: "not_found" }); return; }
    res.json({ profile });
  });
  app.post("/api/admin/shop/profile", requireAdmin, requireShopWrite, rateLimit(20), async (req, res) => {
    const shopId = resolveProfileShopId(req, res);
    if (!shopId) { res.status(400).json({ error: "no_shop" }); return; }
    const { updateShopProfile, logAudit } = await import("../services/shopService");
    const r = await updateShopProfile(shopId, (req.body ?? {}) as { story?: string; announcement?: string; neighborhood?: string });
    void logAudit(String(res.locals.adminRole ?? ""), (res.locals.telegramId as string) ?? null, "update_profile", "shop", shopId);
    res.json(r);
  });
  app.post("/api/admin/shop/profile/photo", express.json({ limit: "6mb" }), requireAdmin, requireShopWrite, async (req, res) => {
    const shopId = resolveProfileShopId(req, res);
    if (!shopId) { res.status(400).json({ error: "no_shop" }); return; }
    const b = req.body as { mime?: string; base64?: string };
    if (!b?.base64) { res.status(400).json({ error: "no image" }); return; }
    const { uploadShopPhoto } = await import("../services/shopService");
    res.json(await uploadShopPhoto(shopId, Buffer.from(b.base64, "base64"), b.mime || "image/jpeg"));
  });
  // §10.1: "muammoni tuzat" — 1-bosishda pauza + hozirgi SLA-buzilish soni (owner istalgan do'kon,
  // seller FAQAT o'zinikini — resolveProfileShopId bilan bir xil xavfsizlik-chegara).
  app.get("/api/admin/shop/ops-status", requireAdmin, requireShopWrite, async (req, res) => {
    const shopId = resolveProfileShopId(req, res);
    if (!shopId) { res.status(400).json({ error: "no_shop" }); return; }
    const { getShopOpsStatus } = await import("../services/shopService");
    const status = await getShopOpsStatus(shopId);
    if (!status) { res.status(404).json({ error: "not_found" }); return; }
    res.json(status);
  });
  // §10.1: do'kon sog'lik-skori (javob-tezlik+rad%+hikoya-faollik bitta raqamda)
  app.get("/api/admin/shop/health", requireAdmin, requireShopWrite, async (req, res) => {
    const shopId = resolveProfileShopId(req, res);
    if (!shopId) { res.status(400).json({ error: "no_shop" }); return; }
    const { getShopHealthScore } = await import("../services/shopService");
    const health = await getShopHealthScore(shopId);
    if (!health) { res.status(404).json({ error: "not_found" }); return; }
    res.json(health);
  });
  // §10.2: kuzatilmoqda-lekin-olinmayapti — sevimliga qo'shilgan, sotib olinmagan mahsulotlar
  app.get("/api/admin/shop/watched-not-bought", requireAdmin, requireShopWrite, async (req, res) => {
    const shopId = resolveProfileShopId(req, res);
    if (!shopId) { res.status(400).json({ error: "no_shop" }); return; }
    const { listWatchedNotBought } = await import("../services/shopService");
    res.json({ items: await listWatchedNotBought(shopId) });
  });
  app.post("/api/admin/shop/toggle-pause", requireAdmin, requireShopWrite, rateLimit(20), async (req, res) => {
    const shopId = resolveProfileShopId(req, res);
    if (!shopId) { res.status(400).json({ error: "no_shop" }); return; }
    const paused = !!(req.body as { paused?: unknown })?.paused;
    const { toggleShopPause, logAudit } = await import("../services/shopService");
    const r = await toggleShopPause(shopId, paused);
    void logAudit(String(res.locals.adminRole ?? ""), (res.locals.telegramId as string) ?? null, "toggle_pause", "shop", shopId, paused ? "paused" : "unpaused");
    res.json(r);
  });
  app.delete("/api/admin/shop/reviews/:id", requireAdmin, requireOwner, rateLimit(30), async (req, res) => {
    const { adminDeleteReview } = await import("../services/shopService");
    res.json(await adminDeleteReview(Number(req.params.id)));
  });
  // §10.1: mijozlar qidirgan-lekin-topilmagan so'rovlar — owner-wide (aniq do'konga bog'liq emas).
  app.get("/api/admin/shop/demand", requireAdmin, requireOwner, async (_req, res) => {
    const { adminListMarketDemand } = await import("../services/shopService");
    res.json({ demand: await adminListMarketDemand() });
  });
  // §10.1: shop-darajasidagi anomaliya-detektor — g'ayrioddiy rad-etish/sekin-javob do'konlar
  app.get("/api/admin/shop/attention", requireAdmin, requireOwner, async (_req, res) => {
    const { listShopsNeedingAttention } = await import("../services/shopService");
    res.json({ items: await listShopsNeedingAttention() });
  });
  // §10.1: ommaviy e'lon-shablon — BARCHA faol do'konga bir yo'la (owner-only, ko'p-do'kon qulaylik).
  app.post("/api/admin/shop/bulk-announcement", requireAdmin, requireOwner, rateLimit(10), async (req, res) => {
    const text = String((req.body as { text?: unknown })?.text ?? "");
    const { bulkSetAnnouncement, logAudit } = await import("../services/shopService");
    const r = await bulkSetAnnouncement(text);
    void logAudit(String(res.locals.adminRole ?? ""), (res.locals.telegramId as string) ?? null, "bulk_announcement", "shop", null, text.slice(0, 100));
    res.json(r);
  });
  // 💬 C1.6: sotuvchi-inbox (bot-DM'ning zaxira/qo'shimcha yo'li — admin-paneldan ham javob berish).
  app.get("/api/admin/shop/chat/conversations", requireAdmin, requireShopWrite, async (req, res) => {
    const shopId = resolveProfileShopId(req, res);
    if (!shopId) { res.status(400).json({ error: "no_shop" }); return; }
    const { listShopChatConversations } = await import("../services/shopChatService");
    res.json({ convos: await listShopChatConversations(shopId) });
  });
  app.get("/api/admin/shop/chat/messages/:telegramId", requireAdmin, requireShopWrite, async (req, res) => {
    const shopId = resolveProfileShopId(req, res);
    if (!shopId) { res.status(400).json({ error: "no_shop" }); return; }
    const { getShopChatMessages } = await import("../services/shopChatService");
    res.json(await getShopChatMessages(shopId, req.params.telegramId!));
  });
  app.post("/api/admin/shop/chat/reply", requireAdmin, requireShopWrite, rateLimit(30), async (req, res) => {
    const shopId = resolveProfileShopId(req, res);
    if (!shopId) { res.status(400).json({ error: "no_shop" }); return; }
    const b = req.body as { telegramId?: string; text?: string; shopId?: unknown };
    if (!b?.telegramId || !b.text?.trim()) { res.status(400).json({ ok: false }); return; }
    const { sendSellerReplyFromPanel } = await import("../services/shopChatService");
    res.json(await sendSellerReplyFromPanel(shopId, b.telegramId, b.text.trim()));
  });
  // 🎠 D1 (BirJoy): kategoriya-CRUD — karusel boshqaruvi. Owner-only (seller o'z katalogini
  // boshqaradi, GLOBAL taksonomiyani emas).
  app.get("/api/admin/shop/categories", requireAdmin, requireOwner, async (_req, res) => {
    const { adminListCategories } = await import("../services/shopService");
    res.json({ cats: await adminListCategories() });
  });
  app.post("/api/admin/shop/categories", requireAdmin, requireOwner, rateLimit(20), async (req, res) => {
    const { adminCreateCategory } = await import("../services/shopService");
    res.json(await adminCreateCategory(String(req.body?.name ?? ""), req.body?.emoji ? String(req.body.emoji) : undefined));
  });
  app.post("/api/admin/shop/categories/:id", requireAdmin, requireOwner, rateLimit(20), async (req, res) => {
    const { adminEditCategory } = await import("../services/shopService");
    res.json(await adminEditCategory(Number(req.params.id), req.body ?? {}));
  });
  app.delete("/api/admin/shop/categories/:id", requireAdmin, requireOwner, rateLimit(20), async (req, res) => {
    const { adminDeleteCategory } = await import("../services/shopService");
    res.json(await adminDeleteCategory(Number(req.params.id)));
  });
  app.post("/api/admin/shop/categories/:id/icon", express.json({ limit: "6mb" }), requireAdmin, requireOwner, async (req, res) => {
    const b = req.body as { mime?: string; base64?: string };
    if (!b?.base64) { res.status(400).json({ error: "no image" }); return; }
    const { uploadCategoryIcon } = await import("../services/shopService");
    res.json(await uploadCategoryIcon(Number(req.params.id), Buffer.from(b.base64, "base64"), b.mime || "image/jpeg"));
  });

  // ── 🍽 RESTORAN admin (R3: sessiya-navbati + qo'lda holat-boshqaruv) — concierge V1, operator ODAM ──
  app.get("/api/admin/restoran/orders", requireAdmin, async (req, res) => {
    const { adminListFoodOrders } = await import("../services/restoranService");
    res.json({ orders: await adminListFoodOrders(req.query?.status ? String(req.query.status) : undefined) });
  });
  app.post("/api/admin/restoran/orders/:id/call", requireAdmin, rateLimit(30), async (req, res) => {
    const { markOrderCalled } = await import("../services/restoranService");
    res.json(await markOrderCalled(Number(req.params.id)));
  });
  app.post("/api/admin/restoran/orders/:id/accept", requireAdmin, rateLimit(30), async (req, res) => {
    const { acceptFoodOrder } = await import("../services/restoranService");
    const r = await acceptFoodOrder(Number(req.params.id));
    if (r.ok && r.notice && opts.notifyRiderOrderStatus) await opts.notifyRiderOrderStatus(r.notice).catch(() => undefined);
    const { notice: _n, ...pub } = r;
    res.json(pub);
  });
  app.post("/api/admin/restoran/orders/:id/advance", requireAdmin, rateLimit(30), async (req, res) => {
    const { advanceFoodOrderStatus } = await import("../services/restoranService");
    const r = await advanceFoodOrderStatus(Number(req.params.id));
    if (r.ok && r.notice && opts.notifyRiderOrderStatus) await opts.notifyRiderOrderStatus(r.notice).catch(() => undefined);
    const { notice: _n, ...pub } = r;
    res.json(pub);
  });
  app.post("/api/admin/restoran/orders/:id/reject", requireAdmin, rateLimit(30), async (req, res) => {
    const { rejectFoodOrder } = await import("../services/restoranService");
    const r = await rejectFoodOrder(Number(req.params.id), String(req.body?.reason ?? ""));
    if (r.ok && r.notice && opts.notifyRiderOrderRejected) await opts.notifyRiderOrderRejected(r.notice).catch(() => undefined);
    const { notice: _n, ...pub } = r;
    res.json(pub);
  });

  // ── 🍽 RESTORAN admin — R4: restoran+menyu CRUD (§6.1 tezlik: bulk-menyu, nusxalash, inline edit) ──
  app.get("/api/admin/restoran/restaurants", requireAdmin, async (_req, res) => {
    const { adminListRestaurants } = await import("../services/restoranService");
    res.json(await adminListRestaurants());
  });
  app.post("/api/admin/restoran/restaurants", requireAdmin, rateLimit(20), async (req, res) => {
    const { adminCreateRestaurant } = await import("../services/restoranService");
    res.json(await adminCreateRestaurant(req.body ?? {}));
  });
  app.post("/api/admin/restoran/restaurants/:id", requireAdmin, rateLimit(20), async (req, res) => {
    const { adminEditRestaurant } = await import("../services/restoranService");
    res.json(await adminEditRestaurant(Number(req.params.id), req.body ?? {}));
  });
  app.post("/api/admin/restoran/restaurants/:id/toggle", requireAdmin, rateLimit(20), async (req, res) => {
    const { adminToggleRestaurant } = await import("../services/restoranService");
    res.json(await adminToggleRestaurant(Number(req.params.id), !!req.body?.active));
  });
  app.delete("/api/admin/restoran/restaurants/:id", requireAdmin, requireOwner, rateLimit(20), async (req, res) => {
    const { adminDeleteRestaurant } = await import("../services/restoranService");
    res.json(await adminDeleteRestaurant(Number(req.params.id)));
  });
  app.post("/api/admin/restoran/restaurants/:id/photo", express.json({ limit: "6mb" }), requireAdmin, async (req, res) => {
    const b = req.body as { mime?: string; base64?: string };
    if (!b?.base64) { res.status(400).json({ error: "no image" }); return; }
    const { uploadRestaurantPhoto } = await import("../services/restoranService");
    res.json(await uploadRestaurantPhoto(Number(req.params.id), Buffer.from(b.base64, "base64"), b.mime || "image/jpeg"));
  });
  app.post("/api/admin/restoran/menu", requireAdmin, rateLimit(20), async (req, res) => {
    const { adminCreateMenuItem } = await import("../services/restoranService");
    res.json(await adminCreateMenuItem(Number(req.body?.restaurantId), req.body ?? {}));
  });
  app.post("/api/admin/restoran/menu/bulk", requireAdmin, rateLimit(20), async (req, res) => {
    const { adminBulkCreateMenuItems } = await import("../services/restoranService");
    const lines = Array.isArray(req.body?.lines) ? (req.body.lines as unknown[]).filter((l): l is string => typeof l === "string") : [];
    res.json(await adminBulkCreateMenuItems(Number(req.body?.restaurantId), String(req.body?.section ?? "Taomlar"), lines));
  });
  app.post("/api/admin/restoran/menu/:id", requireAdmin, rateLimit(20), async (req, res) => {
    const { adminEditMenuItem } = await import("../services/restoranService");
    res.json(await adminEditMenuItem(Number(req.params.id), req.body ?? {}));
  });
  app.delete("/api/admin/restoran/menu/:id", requireAdmin, rateLimit(20), async (req, res) => {
    const { adminDeleteMenuItem } = await import("../services/restoranService");
    res.json(await adminDeleteMenuItem(Number(req.params.id)));
  });
  app.post("/api/admin/restoran/menu/:id/photo", express.json({ limit: "6mb" }), requireAdmin, async (req, res) => {
    const b = req.body as { mime?: string; base64?: string };
    if (!b?.base64) { res.status(400).json({ error: "no image" }); return; }
    const { uploadMenuItemPhoto } = await import("../services/restoranService");
    res.json(await uploadMenuItemPhoto(Number(req.params.id), Buffer.from(b.base64, "base64"), b.mime || "image/jpeg"));
  });
  // restoran/menu CRUD kartalar+forma menyusi uchun mavjud menyularni ham qaytaradi (nusxalash +
  // tahrirlash) — `adminGetRestaurantDetail` (active=false bo'lsa ham ko'rsatadi, getRestaurantDetail'dan farqli)
  app.get("/api/admin/restoran/restaurants/:id/menu", requireAdmin, async (req, res) => {
    const { adminGetRestaurantDetail } = await import("../services/restoranService");
    const r = await adminGetRestaurantDetail(Number(req.params.id));
    res.json({ items: r.items });
  });

  // ── 🎀 RAVELLA admin — konstruktor CRUD (kategoriya/bezak/qo'shimcha + rasm) + buyurtma navbati ──
  // Bu yerdan ega: rasm qo'yadi, narx yozadi, qaysi qo'shimcha qaysi rasmni chiqarishini belgilaydi.
  app.get("/api/admin/ravella", requireAdmin, async (_req, res) => {
    const { adminListRavella } = await import("../services/ravellaService");
    res.json(await adminListRavella());
  });
  app.post("/api/admin/ravella/partner-chat", requireAdmin, rateLimit(20), async (req, res) => {
    const { setRavellaPartnerChat } = await import("../services/ravellaService");
    res.json(await setRavellaPartnerChat(String(req.body?.chatId ?? "")));
  });
  app.post("/api/admin/ravella/category", requireAdmin, rateLimit(20), async (req, res) => {
    const { adminCreateCategory } = await import("../services/ravellaService");
    res.json(await adminCreateCategory(req.body ?? {}));
  });
  app.post("/api/admin/ravella/category/:id", requireAdmin, rateLimit(20), async (req, res) => {
    const { adminEditCategory } = await import("../services/ravellaService");
    res.json(await adminEditCategory(Number(req.params.id), req.body ?? {}));
  });
  app.delete("/api/admin/ravella/category/:id", requireAdmin, requireOwner, rateLimit(20), async (req, res) => {
    const { adminDeleteCategory } = await import("../services/ravellaService");
    res.json(await adminDeleteCategory(Number(req.params.id)));
  });
  app.post("/api/admin/ravella/item", requireAdmin, rateLimit(20), async (req, res) => {
    const { adminCreateItem } = await import("../services/ravellaService");
    res.json(await adminCreateItem(req.body ?? {}));
  });
  app.post("/api/admin/ravella/item/:id", requireAdmin, rateLimit(20), async (req, res) => {
    const { adminEditItem } = await import("../services/ravellaService");
    res.json(await adminEditItem(Number(req.params.id), req.body ?? {}));
  });
  app.delete("/api/admin/ravella/item/:id", requireAdmin, requireOwner, rateLimit(20), async (req, res) => {
    const { adminDeleteItem } = await import("../services/ravellaService");
    res.json(await adminDeleteItem(Number(req.params.id)));
  });
  app.post("/api/admin/ravella/item/:id/photo", express.json({ limit: "6mb" }), requireAdmin, async (req, res) => {
    const b = req.body as { mime?: string; base64?: string };
    if (!b?.base64) { res.status(400).json({ error: "no image" }); return; }
    const { uploadRavellaItemPhoto } = await import("../services/ravellaService");
    res.json(await uploadRavellaItemPhoto(Number(req.params.id), Buffer.from(b.base64, "base64"), b.mime || "image/jpeg"));
  });
  app.post("/api/admin/ravella/addon", requireAdmin, rateLimit(20), async (req, res) => {
    const { adminCreateAddon } = await import("../services/ravellaService");
    res.json(await adminCreateAddon(req.body ?? {}));
  });
  app.post("/api/admin/ravella/addon/:id", requireAdmin, rateLimit(20), async (req, res) => {
    const { adminEditAddon } = await import("../services/ravellaService");
    res.json(await adminEditAddon(Number(req.params.id), req.body ?? {}));
  });
  app.delete("/api/admin/ravella/addon/:id", requireAdmin, requireOwner, rateLimit(20), async (req, res) => {
    const { adminDeleteAddon } = await import("../services/ravellaService");
    res.json(await adminDeleteAddon(Number(req.params.id)));
  });
  app.post("/api/admin/ravella/addon/:id/photo", express.json({ limit: "6mb" }), requireAdmin, async (req, res) => {
    const b = req.body as { mime?: string; base64?: string };
    if (!b?.base64) { res.status(400).json({ error: "no image" }); return; }
    const { uploadRavellaAddonPhoto } = await import("../services/ravellaService");
    res.json(await uploadRavellaAddonPhoto(Number(req.params.id), Buffer.from(b.base64, "base64"), b.mime || "image/jpeg"));
  });
  app.get("/api/admin/ravella/orders", requireAdmin, async (req, res) => {
    const { adminListRavellaOrders } = await import("../services/ravellaService");
    res.json({ orders: await adminListRavellaOrders(req.query?.status ? String(req.query.status) : undefined) });
  });
  // Holat-o'tishlari: hamkor botdan bosadi, ega esa shu yerdan (bir xil servis funksiyalari —
  // status-guard ikkalasida ham bir xil ishlaydi, ikki tomondan bosilsa faqat bittasi o'tadi).
  app.post("/api/admin/ravella/orders/:id/:action", requireAdmin, rateLimit(30), async (req, res) => {
    const svc = await import("../services/ravellaService");
    const id = Number(req.params.id);
    const action = String(req.params.action);
    const r = action === "accept" ? await svc.acceptRavellaOrder(id)
      : action === "call" ? await svc.markRavellaCalled(id)
      : action === "done" ? await svc.finishRavellaOrder(id)
      : action === "reject" ? await svc.rejectRavellaOrder(id, String(req.body?.reason ?? ""))
      : { ok: false as const, reason: "bad_action" };
    if (r.ok && "memberId" in r && r.memberId && opts.notifyRavellaCustomer) {
      await opts.notifyRavellaCustomer({
        memberId: r.memberId,
        itemName: r.itemName ?? "Ravella",
        newStatus: r.newStatus ?? action,
        cashbackSom: r.cashbackSom,
        reason: action === "reject" ? String(req.body?.reason ?? "") : undefined,
      }).catch(() => undefined);
    }
    res.json(r);
  });

  // ── 🔎 XIZMATLAR admin (owner-gated writes) ───────────────────────────────────────────────────
  app.get("/api/admin/services", requireAdmin, async (req, res) => {
    const { adminListListings } = await import("../services/serviceDirectory");
    res.json(await adminListListings(req.query?.status ? String(req.query.status) : undefined));
  });
  app.post("/api/admin/services", requireAdmin, requireOwner, rateLimit(30), async (req, res) => {
    const { adminCreateListing } = await import("../services/serviceDirectory");
    res.json(await adminCreateListing(req.body));
  });
  app.post("/api/admin/services/:id", requireAdmin, requireOwner, rateLimit(30), async (req, res) => {
    const { adminEditListing } = await import("../services/serviceDirectory");
    res.json(await adminEditListing(Number(req.params.id), req.body));
  });
  app.get("/api/admin/service-categories", requireAdmin, async (_req, res) => {
    const { adminListCategories } = await import("../services/serviceDirectory");
    res.json({ categories: await adminListCategories() });
  });
  app.post("/api/admin/service-categories", requireAdmin, requireOwner, rateLimit(30), async (req, res) => {
    const { adminUpsertCategory } = await import("../services/serviceDirectory");
    res.json(await adminUpsertCategory(req.body));
  });
  app.get("/api/admin/service-reviews", requireAdmin, async (_req, res) => {
    const { adminReviewQueue } = await import("../services/serviceDirectory");
    res.json({ reviews: await adminReviewQueue() });
  });
  app.post("/api/admin/service-reviews/:id", requireAdmin, requireOwner, rateLimit(30), async (req, res) => {
    const { adminModerateReview } = await import("../services/serviceDirectory");
    const action = req.body?.action === "restore" ? "restore" as const : "delete" as const;
    res.json(await adminModerateReview(Number(req.params.id), action));
  });
  app.get("/api/admin/service-requests", requireAdmin, async (req, res) => {
    const { adminListRequests } = await import("../services/serviceDirectory");
    res.json({ requests: await adminListRequests(req.query?.status ? String(req.query.status) : "new") });
  });
  app.post("/api/admin/service-requests/:id", requireAdmin, requireOwner, rateLimit(30), async (req, res) => {
    const { adminSetRequestStatus } = await import("../services/serviceDirectory");
    const st = ["new", "done", "dismissed"].includes(String(req.body?.status)) ? (req.body.status as "new" | "done" | "dismissed") : "done";
    res.json(await adminSetRequestStatus(Number(req.params.id), st));
  });
  app.get("/api/admin/services/:id/prices", requireAdmin, async (req, res) => {
    const { adminGetPrices } = await import("../services/serviceDirectory");
    res.json({ items: await adminGetPrices(Number(req.params.id)) });
  });
  app.post("/api/admin/services/:id/prices", requireAdmin, requireOwner, rateLimit(30), async (req, res) => {
    const { adminSetPrices } = await import("../services/serviceDirectory");
    res.json(await adminSetPrices(Number(req.params.id), Array.isArray(req.body?.items) ? req.body.items : []));
  });
  app.post("/api/admin/services/:id/photo", express.json({ limit: "6mb" }), requireAdmin, requireOwner, async (req, res) => {
    const b = req.body as { mime?: string; base64?: string };
    if (!b?.base64) { res.status(400).json({ error: "no image" }); return; }
    const { uploadServicePhoto } = await import("../services/serviceDirectory");
    res.json(await uploadServicePhoto(Number(req.params.id), Buffer.from(b.base64, "base64"), b.mime || "image/jpeg"));
  });
  app.delete("/api/admin/services/:id/photo", requireAdmin, requireOwner, async (req, res) => {
    const { clearServicePhotos } = await import("../services/serviceDirectory");
    res.json(await clearServicePhotos(Number(req.params.id)));
  });

  // ── 📋 E'LONLAR admin (E3, owner-gated writes) — approve/reject FAQAT Telegram orqali (bot/elonlar.ts),
  // lekin panel'dan tarkibni to'g'irlash (edit/rasm/o'chirish) endi mumkin (raw DB skript o'rniga). ──
  app.get("/api/admin/elonlar", requireAdmin, async (req, res) => {
    const { adminListAds } = await import("../services/classifiedService");
    res.json(await adminListAds(req.query?.status ? String(req.query.status) : undefined));
  });
  app.get("/api/admin/elonlar/:id/viewers", requireAdmin, async (req, res) => {
    const { adminAdViewers } = await import("../services/classifiedService");
    res.json({ viewers: await adminAdViewers(Number(req.params.id)) });
  });
  app.get("/api/admin/elonlar/:id/contacts", requireAdmin, async (req, res) => {
    const { adminAdContacts } = await import("../services/classifiedService");
    res.json({ contacts: await adminAdContacts(Number(req.params.id)) });
  });
  app.get("/api/admin/elonlar/:id/reactions", requireAdmin, async (req, res) => {
    const { adminAdReactions } = await import("../services/classifiedService");
    res.json({ reactions: await adminAdReactions(Number(req.params.id)) });
  });
  app.post("/api/admin/elonlar", requireAdmin, requireOwner, rateLimit(30), async (req, res) => {
    const { adminCreateAd } = await import("../services/classifiedService");
    res.json(await adminCreateAd(req.body));
  });
  app.post("/api/admin/elonlar/:id/archive", requireAdmin, requireOwner, rateLimit(30), async (req, res) => {
    const { adminArchiveAd } = await import("../services/classifiedService");
    res.json(await adminArchiveAd(Number(req.params.id)));
  });
  app.post("/api/admin/elonlar/:id/extend", requireAdmin, requireOwner, rateLimit(30), async (req, res) => {
    const { adminExtendAd } = await import("../services/classifiedService");
    const days = Number(req.body?.days);
    res.json(await adminExtendAd(Number(req.params.id), Number.isFinite(days) && days > 0 ? days : undefined));
  });
  app.post("/api/admin/elonlar/:id/top", requireAdmin, requireOwner, rateLimit(30), async (req, res) => {
    const { adminSetTop } = await import("../services/classifiedService");
    res.json(await adminSetTop(Number(req.params.id), !!req.body?.on));
  });
  app.post("/api/admin/elonlar/:id", requireAdmin, requireOwner, rateLimit(30), async (req, res) => {
    const { adminEditAd } = await import("../services/classifiedService");
    res.json(await adminEditAd(Number(req.params.id), req.body));
  });
  app.delete("/api/admin/elonlar/:id", requireAdmin, requireOwner, rateLimit(30), async (req, res) => {
    const { adminDeleteAd } = await import("../services/classifiedService");
    res.json(await adminDeleteAd(Number(req.params.id)));
  });
  app.post("/api/admin/elonlar/:id/photo", express.json({ limit: "6mb" }), requireAdmin, requireOwner, async (req, res) => {
    const b = req.body as { mime?: string; base64?: string };
    if (!b?.base64) { res.status(400).json({ error: "no image" }); return; }
    const { uploadAdPhoto } = await import("../services/classifiedService");
    res.json(await uploadAdPhoto(Number(req.params.id), Buffer.from(b.base64, "base64"), b.mime || "image/jpeg"));
  });
  app.delete("/api/admin/elonlar/:id/photo", requireAdmin, requireOwner, async (req, res) => {
    const { adminClearAdPhotos } = await import("../services/classifiedService");
    res.json(await adminClearAdPhotos(Number(req.params.id)));
  });

  // 💸 Transfer commission — owner sets the % charged on every transfer/tip/fare (gated by the
  // "komissiya" flag; the knob is live but only bites once that flag is ON).
  app.get("/api/admin/transfer-economy", requireAdmin, async (_req, res) => {
    const { TRANSFER_ECON_KNOBS } = await import("@t1067/shared");
    const { getTransferEcon } = await import("../services/transferService");
    const { featureOn } = await import("../services/featureFlags");
    const { platformEarned } = await import("../services/adminOps");
    res.json({ knobs: TRANSFER_ECON_KNOBS, values: await getTransferEcon(), enabled: await featureOn("komissiya"), earned: await platformEarned() });
  });
  app.post("/api/admin/transfer-economy", requireAdmin, requireOwner, async (req, res) => {
    const b = req.body as { key?: string; value?: number };
    const { TRANSFER_ECON_KNOBS } = await import("@t1067/shared");
    if (!TRANSFER_ECON_KNOBS.some((k) => k.key === b?.key) || typeof b?.value !== "number") {
      res.status(400).json({ error: "unknown knob or bad value" });
      return;
    }
    const { setTransferEcon } = await import("../services/transferService");
    res.json({ ok: true, values: await setTransferEcon(b.key as string, b.value) });
  });
  // ── M1/M3/M4/M6: livemap, member/driver 360, mashina draw, op tokens ─────
  app.get("/api/admin/livemap", requireAdmin, async (_req, res) => {
    const { nearbyPins } = await import("../services/bookingPlus");
    const ds = (await import("../kas")).getDataSource();
    const [pins, bookings] = await Promise.all([nearbyPins(), ds.listActiveBookings().catch(() => [])]);
    res.json({ ...pins, bookings: bookings.map((b) => ({ id: b.id, status: b.status, lat: b.lat, lng: b.lng, address: b.addressName })) });
  });
  app.get("/api/admin/member360", requireAdmin, async (req, res) => {
    const phone = String(req.query.phone ?? "").replace(/\D/g, "").slice(-9);
    if (phone.length !== 9) {
      res.status(400).json({ error: "phone required" });
      return;
    }
    const m = await prisma.member.findFirst({ where: { phone: { endsWith: phone } } });
    if (!m) {
      res.status(404).json({ error: "not found" });
      return;
    }
    const [txns, rides30, items, gap, recruit, ratingCount] = await Promise.all([
      prisma.coinTxn.findMany({ where: { memberId: m.id }, orderBy: { id: "desc" }, take: 30 }),
      prisma.rideReward.count({ where: { memberId: m.id, createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } } }),
      prisma.item.count({ where: { ownerId: m.id } }),
      prisma.gapMember.findUnique({ where: { memberId: m.id }, include: { gap: true } }),
      prisma.driverRecruit.findUnique({ where: { riderMemberId: m.id } }),
      prisma.rideRating.count({ where: { memberId: m.id } }),
    ]);
    res.json({
      member: { id: m.id, name: m.fullName, type: m.type, coins: m.coins, trips: m.trips, riskFlag: m.riskFlag, banned: m.banned, plusUntil: m.plusUntil, tier: m.driverTier, createdAt: m.createdAt },
      rides30,
      items,
      gap: gap ? gap.gap.name : null,
      recruitedByDriver: recruit?.driverId ?? null,
      ratings: ratingCount,
      txns: txns.map((t) => ({ amount: t.amount, kind: t.kind, reason: t.reason, at: t.createdAt })),
    });
  });
  app.get("/api/admin/driver360", requireAdmin, async (req, res) => {
    const car = String(req.query.car ?? "").trim();
    if (!car) {
      res.status(400).json({ error: "car required" });
      return;
    }
    const m = await prisma.member.findFirst({ where: { type: "driver", carNumber: { equals: car, mode: "insensitive" } } });
    const { carRatingSummary } = await import("../services/bookingPlus");
    const rating = await carRatingSummary(car.toUpperCase());
    const recruits = m ? await prisma.driverRecruit.count({ where: { driverId: m.id } }) : 0;
    const fullType = await prisma.itemType.findUnique({ where: { code: "car_full" } });
    const fullCars = m && fullType ? await prisma.item.count({ where: { ownerId: m.id, itemTypeId: fullType.id } }) : 0;
    res.json({
      driver: m ? { id: m.id, name: m.fullName, tier: m.driverTier, coins: m.coins, phone: m.phone } : null,
      rating,
      recruits,
      mashinaTickets: fullCars,
    });
  });
  app.get("/api/admin/mashina", requireAdmin, async (_req, res) => {
    const { fundTotal } = await import("../services/featureFlags");
    const fullType = await prisma.itemType.findUnique({ where: { code: "car_full" } });
    const holders = fullType
      ? await prisma.item.groupBy({ by: ["ownerId"], where: { itemTypeId: fullType.id }, _count: true })
      : [];
    const owners = await prisma.member.findMany({ where: { id: { in: holders.map((h) => h.ownerId) } }, select: { id: true, fullName: true, carNumber: true } });
    const nameOf = new Map(owners.map((o) => [o.id, o]));
    res.json({
      fund: await fundTotal(),
      tickets: holders.map((h) => ({ name: nameOf.get(h.ownerId)?.fullName ?? "?", car: nameOf.get(h.ownerId)?.carNumber ?? "", tickets: h._count })),
      rule: "Yillik o'yin: har to'liq mashina to'plami = 1 chipta. Sovrin hech qachon fonddan oshmaydi.",
    });
  });
  app.get("/api/admin/recruitqr/:driverId", requireAdmin, async (req, res) => {
    const id = Math.floor(Number(req.params.driverId));
    const d = await prisma.member.findUnique({ where: { id } });
    if (!d || d.type !== "driver") {
      res.status(404).json({ error: "driver not found" });
      return;
    }
    const QR = await import("qrcode");
    const png = await QR.toBuffer(`https://t.me/koson1067bot?start=drv_${id}`, { width: 600, margin: 2 });
    res.setHeader("Content-Type", "image/png");
    res.send(png);
  });
  // Printable QR sticker sheet (6-up, A4) for a single driver — open in browser, Ctrl+P
  // Accepts ?token= as fallback (browser window.open can't set headers)
  app.get("/api/admin/driver-sticker/:driverId", (req, res, next) => {
    const qToken = String(req.query.token ?? "");
    if (env.ADMIN_PANEL_TOKEN && qToken === env.ADMIN_PANEL_TOKEN) { res.locals.telegramId = "panel"; res.locals.adminRole = "owner"; return next(); }
    return requireAdmin(req, res, next);
  }, async (req, res) => {
    const id = Math.floor(Number(req.params.driverId));
    const d = await prisma.member.findUnique({ where: { id } });
    if (!d || d.type !== "driver") { res.status(404).send("Driver topilmadi"); return; }
    const QR = await import("qrcode");
    const qrBase64 = (await QR.toBuffer(`https://t.me/koson1067bot?start=drv_${id}`, { width: 800, margin: 2 })).toString("base64");
    const name = d.fullName?.toUpperCase() ?? "HAYDOVCHI";
    const car = d.carNumber ?? "—";
    const card = `
      <div class="card">
        <div class="top-bar"><span class="logo">1067</span><span class="taxi">TAXI 🚖</span></div>
        <div class="body">
          <img class="qr" src="data:image/png;base64,${qrBase64}" alt="QR"/>
          <div class="side">
            <div class="gift">🎁 <b>5 000 so'm</b><br><span>BIRINCHI SAFAR SOVG'ASI</span></div>
            <div class="scan">📲 Shu QR ni skanerlang<br>va taxi chaqiring!</div>
            <div class="car-plate">${car}</div>
            <div class="drv-name">👤 ${name}</div>
          </div>
        </div>
        <div class="foot">Haydovchiga <b>+2 000 tanga</b> bonus · har safardan cashback 💸</div>
      </div>`;
    const html = `<!doctype html><html><head><meta charset="utf-8">
<title>1067 — ${d.fullName} QR Stiker</title>
<style>
@page{size:A4;margin:8mm}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;background:#eee;-webkit-print-color-adjust:exact;print-color-adjust:exact}
@media print{body{background:#fff}}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:6mm;padding:4mm}
.card{background:#fff;border:2.5px solid #e3b81f;border-radius:14px;overflow:hidden;break-inside:avoid}
.top-bar{background:#1a1205;color:#fff;display:flex;justify-content:space-between;align-items:center;padding:6px 14px}
.logo{font-size:20px;font-weight:900;letter-spacing:2px;color:#f59e0b}
.taxi{font-size:13px;font-weight:700}
.body{display:flex;align-items:center;gap:10px;padding:10px 12px}
.qr{width:52mm;height:52mm;flex-shrink:0;border-radius:6px}
.side{flex:1;display:flex;flex-direction:column;gap:8px}
.gift{background:#fff8e0;border:1.5px solid #e3c34d;border-radius:10px;padding:8px 10px;font-size:13px;color:#7a5500;line-height:1.4}
.gift b{font-size:16px;color:#1a1205;display:block}
.scan{font-size:12px;font-weight:700;color:#444;line-height:1.5}
.car-plate{display:inline-block;background:#fff4cf;border:2px solid #e3c34d;border-radius:8px;padding:5px 16px;font-size:18px;font-weight:900;letter-spacing:1.5px;color:#5a4300;text-align:center}
.drv-name{font-size:12px;font-weight:700;color:#333}
.foot{background:#0a7d3c;color:#fff;font-size:11.5px;font-weight:700;padding:6px 12px;text-align:center}
.foot b{color:#ffe08a}
</style></head><body>
<div class="grid">${card.repeat(6)}</div>
</body></html>`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  });

  // role defaults to "operator" (read + announce); "shopseller" unlocks Do'kon CRUD only (requireShopWrite).
  // V1.6b: shopseller + shopId → do'kon-scoped token (multi-vendor); shopId'siz = legacy bare
  // "shopseller" (=shop#1 «BirJoy o'z do'koni», backward-compat).
  app.post("/api/admin/optoken", requireAdmin, requireOwner, async (req, res) => {
    if (req.body?.role === "shopseller" && req.body?.shopId !== undefined) {
      const shopId = Number(req.body.shopId);
      const shop = await prisma.marketShop.findUnique({ where: { id: shopId }, select: { id: true } });
      if (!shop) { res.status(400).json({ ok: false, error: "shop_not_found" }); return; }
      const { getOrCreateSellerToken } = await import("../services/shopService");
      const token = await getOrCreateSellerToken(shopId);
      res.json({ ok: true, token, role: "shopseller" });
      return;
    }
    // 🎧 Super Operator: role "chatops" + a name mints "chatops:<Name>" — requireAdmin's own
    // regex (server.ts, near requireAdmin) parses this back into adminRole="chatops" +
    // res.locals.operatorName, which is what drives the minimal 4-tab shell (see App.tsx).
    if (req.body?.role === "chatops") {
      const name = String(req.body?.name ?? "").trim().slice(0, 40);
      if (!name) { res.status(400).json({ ok: false, error: "name_required" }); return; }
      const token = Array.from({ length: 24 }, () => "abcdefghjkmnpqrstuvwxyz23456789"[Math.floor(Math.random() * 31)]).join("");
      await prisma.appState.create({ data: { key: `oprtoken:${token}`, value: `chatops:${name}` } });
      res.json({ ok: true, token, role: "chatops" });
      return;
    }
    const role = req.body?.role === "shopseller" ? "shopseller" : "operator";
    const token = Array.from({ length: 24 }, () => "abcdefghjkmnpqrstuvwxyz23456789"[Math.floor(Math.random() * 31)]).join("");
    await prisma.appState.create({ data: { key: `oprtoken:${token}`, value: role } });
    res.json({ ok: true, token, role });
  });
  // frontend uses this to tailor the sidebar (e.g. shopseller sees ONLY Do'kon, chatops sees
  // ONLY the Super Operator 4-tab console)
  app.get("/api/admin/whoami", requireAdmin, (_req, res) => {
    res.json({ role: res.locals.adminRole as string, operatorName: res.locals.operatorName as string | undefined });
  });
  // V1.6e: shop-picker uchun qisqa ro'yxat (owner-only) — token-yaratish select'iga xizmat qiladi.
  app.get("/api/admin/market-shops", requireAdmin, requireOwner, async (_req, res) => {
    const shops = await prisma.marketShop.findMany({ orderBy: { id: "asc" }, select: { id: true, name: true, active: true } });
    res.json({ shops });
  });
  // List + revoke operator tokens (owner-only): a leaked/ex-employee token must be killable.
  // V1.6b: shopseller:<shopId> qatorlarga do'kon-nomi qo'shiladi — owner ro'yxatda qaysi tokeni
  // qaysi do'konga tegishli ekanini ko'ra oladi (aks holda barcha shopseller qatorlar bir xil ko'rinardi).
  app.get("/api/admin/optokens", requireAdmin, requireOwner, async (_req, res) => {
    const rows = await prisma.appState.findMany({ where: { key: { startsWith: "oprtoken:" } }, orderBy: { updatedAt: "desc" } });
    const shopIds = rows.map((r) => Number(/^shopseller:(\d+)$/.exec(r.value)?.[1])).filter((n) => Number.isFinite(n));
    const shops = shopIds.length ? await prisma.marketShop.findMany({ where: { id: { in: shopIds } }, select: { id: true, name: true } }) : [];
    const shopNameOf = new Map(shops.map((s) => [s.id, s.name]));
    res.json({
      tokens: rows.map((r) => {
        const m = /^shopseller:(\d+)$/.exec(r.value);
        const shopId = m ? Number(m[1]) : undefined;
        return { token: r.key.slice("oprtoken:".length), role: r.value, shopName: shopId ? shopNameOf.get(shopId) : undefined, createdAt: r.updatedAt.toISOString() };
      }),
    });
  });
  app.delete("/api/admin/optokens/:token", requireAdmin, requireOwner, async (req, res) => {
    const key = `oprtoken:${String(req.params.token)}`;
    const row = await prisma.appState.findUnique({ where: { key }, select: { value: true } });
    // V1.6: shopseller:<shopId> tokenni revoke qilsak, getOrCreateSellerToken'ning deterministik
    // pointer'ini (`sellertoken:<shopId>`) HAM o'chiramiz — aks holda keyingi so'rov o'lik tokenni
    // abadiy qaytarardi (yangisini hech qachon yaratmasdi).
    const m = row ? /^shopseller:(\d+)$/.exec(row.value) : null;
    if (m) await prisma.appState.deleteMany({ where: { key: `sellertoken:${m[1]}` } });
    const del = await prisma.appState.deleteMany({ where: { key } });
    res.json({ ok: del.count > 0 });
  });

  app.get("/api/admin/corps", requireAdmin, async (_req, res) => {
    const { listCorps } = await import("../services/corpService");
    res.json({ corps: await listCorps() });
  });
  app.post("/api/admin/corps", requireAdmin, requireOwner, async (req, res) => {
    const { createCorp } = await import("../services/corpService");
    const b = req.body as { name?: string; cap?: number };
    if (!b?.name) {
      res.status(400).json({ error: "name required" });
      return;
    }
    res.json(await createCorp(String(b.name), Math.floor(Number(b.cap ?? 30))));
  });
  app.post("/api/admin/corps/:id/employees", requireAdmin, requireOwner, async (req, res) => {
    const { addCorpEmployee } = await import("../services/corpService");
    const b = req.body as { phone?: string; name?: string };
    res.json(await addCorpEmployee(Number(req.params.id), String(b?.phone ?? ""), b?.name));
  });
  app.post("/api/admin/corps/:id/balance", requireAdmin, requireOwner, async (req, res) => {
    const { adjustCorpBalance } = await import("../services/corpService");
    res.json(await adjustCorpBalance(Number(req.params.id), Math.floor(Number((req.body as { delta?: number })?.delta ?? 0))));
  });
  app.get("/api/admin/corps/:id/report", requireAdmin, async (req, res) => {
    const { corpReport } = await import("../services/corpService");
    const r = await corpReport(Number(req.params.id));
    if (!r) {
      res.status(404).json({ error: "not found" });
      return;
    }
    res.json(r);
  });

  app.get("/api/admin/stats", requireAdmin, async (req, res) => {
    res.json(await getAdminStats(memberType(req, "driver")));
  });

  app.get("/api/admin/members", requireAdmin, async (req, res) => {
    res.json(await getAdminMembers(memberType(req, "driver")));
  });

  app.get("/api/admin/botusers", requireAdmin, async (_req, res) => {
    res.json(await getBotUsers());
  });

  // ─── 📞 Obzvon: kas1067 driver call panel (operator-accessible, no owner gate) ──────────────
  app.post("/api/admin/calls/sync", requireAdmin, async (_req, res) => {
    const { syncDriverCalls } = await import("../services/driverCallService");
    res.json(await syncDriverCalls());
  });
  app.get("/api/admin/calls", requireAdmin, async (req, res) => {
    const { listDriverCalls } = await import("../services/driverCallService");
    const q = (req.query ?? {}) as Record<string, string | undefined>;
    res.json(await listDriverCalls({ status: q.status, search: q.search, segment: q.segment }));
  });
  app.post("/api/admin/calls/:id", requireAdmin, async (req, res) => {
    const { updateDriverCall } = await import("../services/driverCallService");
    const body = (req.body ?? {}) as { status?: string; note?: string; callbackAt?: string | null };
    res.json(
      await updateDriverCall(Number(req.params.id), {
        status: body.status,
        note: body.note,
        callbackAt: body.callbackAt,
        operator: String(res.locals.adminRole ?? "operator"),
      }),
    );
  });

  // Admin tool: manually link a telegram id to a member by phone (e.g. demo/test accounts).
  app.post("/api/admin/link", requireAdmin, async (req, res) => {
    const body = (req.body ?? {}) as { telegramId?: string; phone?: string };
    if (!body.telegramId || !body.phone) {
      res.status(400).json({ error: "telegramId and phone required" });
      return;
    }
    res.json(await linkByPhone(String(body.telegramId), String(body.phone), {}));
  });

  // ─── v4 admin command center ───────────────────────────────────────────────
  app.get("/api/admin/health", requireAdmin, async (_req, res) => {
    const { getHealth } = await import("../services/adminOps");
    res.json(await getHealth());
  });
  app.get("/api/admin/economy", requireAdmin, async (_req, res) => {
    const { getEconomy } = await import("../services/adminOps");
    res.json(await getEconomy());
  });
  app.get("/api/admin/ball-distribution", requireAdmin, async (_req, res) => {
    const { getBallDistribution } = await import("../services/adminOps");
    res.json(await getBallDistribution());
  });
  app.get("/api/admin/growth", requireAdmin, async (_req, res) => {
    const { getGrowth } = await import("../services/adminOps");
    res.json(await getGrowth());
  });
  // 📈 Kunlik rollup — trend-grafiklarning YAGONA manbai. `DailyStat` jadvali
  // 2026-06-15 dan beri to'planib turadi (rollupService.ts), lekin shu paytgacha
  // uni HECH QANDAY endpoint ko'rsatmagan: faqat backup.ts/testRollup.ts o'qigan.
  // Ya'ni panelda grafik yo'qligining sababi ma'lumot yo'qligi EMAS edi.
  app.get("/api/admin/daily-stats", requireAdmin, async (req, res) => {
    const days = Math.min(180, Math.max(7, Number(req.query.days) || 60));
    const rows = await prisma.dailyStat.findMany({ orderBy: { day: "desc" }, take: days });
    res.json({ days: rows.reverse() });
  });
  app.get("/api/admin/bookings", requireAdmin, async (_req, res) => {
    const { getLiveBookings } = await import("../services/adminOps");
    res.json(await getLiveBookings());
  });
  app.get("/api/admin/audit", requireAdmin, async (_req, res) => {
    const { getAuditLog } = await import("../services/adminOps");
    res.json(await getAuditLog());
  });
  app.get("/api/admin/integrity", requireAdmin, async (_req, res) => {
    const { getIntegrity } = await import("../services/reconciliation");
    res.json(await getIntegrity());
  });
  app.post("/api/admin/heal", requireAdmin, requireOwner, async (req, res) => {
    const { healMember } = await import("../services/reconciliation");
    const id = Math.floor(Number((req.body as { memberId?: number })?.memberId ?? 0));
    if (!id) {
      res.status(400).json({ ok: false, message: "memberId required" });
      return;
    }
    res.json(await healMember(id));
  });
  // ── A4 analytics: north-star + driver distribution (tier gates from data) ──
  app.get("/api/admin/analytics/northstar", requireAdmin, async (_req, res) => {
    const { getNorthStar } = await import("../services/analyticsService");
    res.json(await getNorthStar());
  });
  // 📈 "capturing Koson" acquisition funnel — new riders, 2nd-ride retention, CAC, viral share
  app.get("/api/admin/analytics/funnel", requireAdmin, async (_req, res) => {
    const { getGrowthFunnel } = await import("../services/analyticsService");
    res.json(await getGrowthFunnel());
  });
  // 📊 0.7 measurement baseline: weekly first-ride cohorts × D1/D7/D30 cumulative return
  app.get("/api/admin/analytics/retention", requireAdmin, async (_req, res) => {
    const { getRetentionCohorts } = await import("../services/analyticsService");
    res.json({ cohorts: await getRetentionCohorts() });
  });
  app.get("/api/admin/analytics/drivers", requireAdmin, async (_req, res) => {
    const { getDriverAnalytics } = await import("../services/analyticsService");
    res.json(await getDriverAnalytics());
  });
  // ── T7 / M1 operations pulse + M2 finance center (read-only aggregates) ──
  app.get("/api/admin/pulse", requireAdmin, async (_req, res) => {
    const { getOpsPulse } = await import("../services/adminModules");
    res.json(await getOpsPulse());
  });
  app.get("/api/admin/finance", requireAdmin, async (_req, res) => {
    const { getFinance } = await import("../services/adminModules");
    res.json(await getFinance());
  });
  app.get("/api/admin/recruits", requireAdmin, async (_req, res) => {
    const { recruitStats } = await import("../services/recruitService");
    res.json(await recruitStats());
  });
  app.get("/api/admin/recruits/:driverId", requireAdmin, async (req, res) => {
    const { recruitDetail } = await import("../services/recruitService");
    const id = Math.floor(Number(req.params.driverId));
    if (!id) { res.status(400).json({ error: "bad driverId" }); return; }
    res.json(await recruitDetail(id));
  });
  app.post("/api/admin/unflag", requireAdmin, requireOwner, async (req, res) => {
    const { unflagMember } = await import("../services/reconciliation");
    const id = Math.floor(Number((req.body as { memberId?: number })?.memberId ?? 0));
    if (!id) {
      res.status(400).json({ ok: false, message: "memberId required" });
      return;
    }
    res.json(await unflagMember(id));
  });
  app.post("/api/admin/grant", requireAdmin, requireOwner, rateLimit(10), async (req, res) => {
    const { adminGrant } = await import("../services/adminOps");
    const b = (req.body ?? {}) as { target?: string; amount?: number; reason?: string };
    res.json(await adminGrant(String(b.target ?? ""), Number(b.amount ?? 0), String(b.reason ?? ""), res.locals.telegramId as string));
  });
  // 🪙 Grant/deduct TANGA to the EXACT account by id (any type) — what the panel's "Tanga ±" needs
  // so a grant to a driver lands on the driver, not a same-phone client.
  app.post("/api/admin/grant-coins", requireAdmin, requireOwner, rateLimit(10), async (req, res) => {
    const { adminGrantCoins } = await import("../services/adminOps");
    const b = (req.body ?? {}) as { memberId?: number; amount?: number; reason?: string };
    res.json(await adminGrantCoins(Math.floor(Number(b.memberId ?? 0)), Number(b.amount ?? 0), String(b.reason ?? ""), res.locals.telegramId as string));
  });
  // 🪙 Grant/deduct TANGA by PHONE — the actions-panel "give money" default (spendable tanga, not cashback)
  app.post("/api/admin/grant-tanga", requireAdmin, requireOwner, rateLimit(10), async (req, res) => {
    const { adminGrantCoinsByPhone } = await import("../services/adminOps");
    const b = (req.body ?? {}) as { phone?: string; amount?: number; reason?: string };
    res.json(await adminGrantCoinsByPhone(String(b.phone ?? ""), Number(b.amount ?? 0), String(b.reason ?? ""), res.locals.telegramId as string));
  });
  // 💼 Move an account's OWN tanga → their OWN kas balance, NO daily cap (admin-trusted bypass of the
  // 50 000/day user withdraw cap). Audited + refund-on-kas-failure (see adminMoveToBalance).
  app.post("/api/admin/move-to-balance", requireAdmin, requireOwner, rateLimit(10), async (req, res) => {
    const { adminMoveToBalance } = await import("../services/adminOps");
    const b = (req.body ?? {}) as { memberId?: number; amount?: number };
    res.json(await adminMoveToBalance(Math.floor(Number(b.memberId ?? 0)), Number(b.amount ?? 0), res.locals.telegramId as string));
  });

  // 👑 user management ("boshqaruv"): search · re-link/unlink · link-code · withdrawals
  app.get("/api/admin/users", requireAdmin, async (req, res) => {
    const { adminSearchUsers } = await import("../services/adminUsers");
    res.json(await adminSearchUsers(String(req.query.q ?? "")));
  });
  app.post("/api/admin/users/relink", requireAdmin, requireOwner, rateLimit(20), async (req, res) => {
    const { adminRelink } = await import("../services/adminUsers");
    const b = (req.body ?? {}) as { telegramId?: string; memberId?: number };
    res.json(await adminRelink(String(b.telegramId ?? ""), Number(b.memberId ?? 0)));
  });
  app.post("/api/admin/users/unlink", requireAdmin, requireOwner, rateLimit(20), async (req, res) => {
    const { adminUnlink } = await import("../services/adminUsers");
    const b = (req.body ?? {}) as { telegramId?: string };
    res.json(await adminUnlink(String(b.telegramId ?? "")));
  });
  app.post("/api/admin/linkcode", requireAdmin, rateLimit(20), async (req, res) => {
    const b = (req.body ?? {}) as { phone?: string };
    const phone = String(b.phone ?? "");
    if (!/^\+?\d[\d\s\-()]{8,}$/.test(phone)) {
      res.json({ ok: false, message: "Raqam noto'g'ri" });
      return;
    }
    const { generateLinkCode } = await import("../services/verifyCodeService");
    res.json({ ok: true, code: await generateLinkCode(phone) });
  });
  app.get("/api/admin/withdrawals", requireAdmin, async (req, res) => {
    const { adminWithdrawals } = await import("../services/adminUsers");
    res.json(await adminWithdrawals(Number(req.query.limit ?? 50)));
  });

  // 🎯 Driver missions (panel): list (read) + create/toggle (owner-only, like grant).
  app.get("/api/admin/driver-missions", requireAdmin, async (_req, res) => {
    const { adminListMissions } = await import("../services/driverMissionService");
    res.json(await adminListMissions());
  });
  app.post("/api/admin/driver-missions", requireAdmin, requireOwner, rateLimit(20), async (req, res) => {
    const b = req.body as { title?: string; target?: number; reward?: number };
    const { adminAddMission } = await import("../services/driverMissionService");
    res.json(await adminAddMission(String(b?.title ?? ""), Math.floor(Number(b?.target ?? 0)), Math.floor(Number(b?.reward ?? 0))));
  });
  app.post("/api/admin/driver-missions/toggle", requireAdmin, requireOwner, rateLimit(20), async (req, res) => {
    const b = req.body as { id?: string; active?: boolean };
    const { adminToggleMission } = await import("../services/driverMissionService");
    res.json(await adminToggleMission(String(b?.id ?? ""), !!b?.active));
  });
  app.post("/api/admin/driver-missions/edit", requireAdmin, requireOwner, rateLimit(20), async (req, res) => {
    const b = req.body as { id?: string; title?: string; target?: number; reward?: number };
    const { adminEditMission } = await import("../services/driverMissionService");
    res.json(await adminEditMission(String(b?.id ?? ""), String(b?.title ?? ""), Math.floor(Number(b?.target ?? 0)), Math.floor(Number(b?.reward ?? 0))));
  });
  app.post("/api/admin/driver-missions/delete", requireAdmin, requireOwner, rateLimit(20), async (req, res) => {
    const { adminDeleteMission } = await import("../services/driverMissionService");
    res.json(await adminDeleteMission(String((req.body as { id?: string })?.id ?? "")));
  });

  // 📊 Phase-4 insights — read-only Overview anomaly banner + approval inbox (isolated adminInsights.ts).
  app.get("/api/admin/anomalies", requireAdmin, async (_req, res) => {
    const { getAnomalies } = await import("../services/adminInsights");
    res.json(await getAnomalies());
  });
  // 🏪 §10.1: "Bugungi holat" — owner-only (barcha do'konlar bo'yicha aralash hisob, seller-token
  // uchun ma'nosiz — o'z do'konidan tashqarisini ko'rmaydi).
  app.get("/api/admin/shop/daily-status", requireAdmin, requireOwner, async (_req, res) => {
    const { getShopDailyStatus } = await import("../services/adminInsights");
    res.json(await getShopDailyStatus());
  });
  // §10.1: "Nima o'zgardi" — bugun vs kecha
  app.get("/api/admin/shop/daily-diff", requireAdmin, requireOwner, async (_req, res) => {
    const { getShopDailyDiff } = await import("../services/adminInsights");
    res.json(await getShopDailyDiff());
  });
  // §10.1: "Prognoz-chiziq" — so'nggi 6 haftaning xarid-hajmi
  app.get("/api/admin/shop/weekly-trend", requireAdmin, requireOwner, async (_req, res) => {
    const { getWeeklyOrderTrend } = await import("../services/adminInsights");
    res.json({ points: await getWeeklyOrderTrend() });
  });
  // §10.1: birlashtirilgan moderatsiya-navbat — son-xulosa (harakatlar o'z bo'limlarida qoladi)
  app.get("/api/admin/moderation-summary", requireAdmin, requireOwner, async (_req, res) => {
    const { getModerationQueueSummary } = await import("../services/adminInsights");
    res.json(await getModerationQueueSummary());
  });
  // §10.1: do'kon-boshqaruv audit-jurnali (owner-only — kim/qachon/nima o'zgartirdi)
  app.get("/api/admin/shop/audit-log", requireAdmin, requireOwner, async (_req, res) => {
    const { listAuditLog } = await import("../services/shopService");
    res.json({ items: await listAuditLog() });
  });
  app.get("/api/admin/inbox", requireAdmin, async (_req, res) => {
    const { getApprovalInbox } = await import("../services/adminInsights");
    res.json(await getApprovalInbox());
  });

  // 🎁 PROMO campaigns ("tasks with promises") — admin-configurable, gated by the "promo" flag.
  app.get("/api/admin/campaigns", requireAdmin, async (_req, res) => {
    const { adminListCampaigns } = await import("../services/campaignService");
    const { CAMPAIGN_CONDS } = await import("@t1067/shared");
    const { featureOn } = await import("../services/featureFlags");
    res.json({ campaigns: await adminListCampaigns(), conds: CAMPAIGN_CONDS, enabled: await featureOn("promo") });
  });
  app.post("/api/admin/campaigns", requireAdmin, requireOwner, rateLimit(20), async (req, res) => {
    const b = req.body as { title?: string; emoji?: string; cond?: string; target?: number; windowDays?: number; reward?: number; audience?: string };
    const { CAMPAIGN_CONDS } = await import("@t1067/shared");
    if (!CAMPAIGN_CONDS.some((c) => c.cond === b?.cond)) { res.status(400).json({ ok: false, reason: "bad_cond" }); return; }
    const { adminAddCampaign } = await import("../services/campaignService");
    res.json(await adminAddCampaign({
      title: String(b?.title ?? ""), emoji: b?.emoji ? String(b.emoji) : undefined,
      cond: b!.cond as never, target: Math.floor(Number(b?.target ?? 0)), windowDays: Math.floor(Number(b?.windowDays ?? 0)),
      reward: Math.floor(Number(b?.reward ?? 0)), audience: (b?.audience === "driver" || b?.audience === "all" ? b.audience : "client") as never,
    }));
  });
  app.post("/api/admin/campaigns/toggle", requireAdmin, requireOwner, rateLimit(20), async (req, res) => {
    const b = req.body as { id?: string; active?: boolean };
    const { adminToggleCampaign } = await import("../services/campaignService");
    res.json(await adminToggleCampaign(String(b?.id ?? ""), !!b?.active));
  });
  app.post("/api/admin/campaigns/edit", requireAdmin, requireOwner, rateLimit(20), async (req, res) => {
    const b = req.body as { id?: string; title?: string; emoji?: string; cond?: string; target?: number; windowDays?: number; reward?: number; audience?: string };
    const { adminEditCampaign } = await import("../services/campaignService");
    res.json(await adminEditCampaign(String(b?.id ?? ""), {
      title: b?.title, emoji: b?.emoji, cond: b?.cond as never,
      target: b?.target != null ? Math.floor(Number(b.target)) : undefined,
      windowDays: b?.windowDays != null ? Math.floor(Number(b.windowDays)) : undefined,
      reward: b?.reward != null ? Math.floor(Number(b.reward)) : undefined,
      audience: b?.audience as never,
    }));
  });
  app.post("/api/admin/campaigns/delete", requireAdmin, requireOwner, rateLimit(20), async (req, res) => {
    const { adminDeleteCampaign } = await import("../services/campaignService");
    res.json(await adminDeleteCampaign(String((req.body as { id?: string })?.id ?? "")));
  });

  app.post("/api/admin/announce", requireAdmin, rateLimit(3), async (req, res) => {
    if (!opts.sendMessage) {
      res.json({ ok: false, message: "Bot ulanmagan" });
      return;
    }
    const { adminAnnounce } = await import("../services/adminOps");
    const b = (req.body ?? {}) as { text?: string; segment?: string; days?: number };
    const seg = b.segment === "linked" || b.segment === "dormant" ? b.segment : "all";
    res.json(await adminAnnounce(String(b.text ?? ""), seg, opts.sendMessage, Math.max(1, Math.floor(Number(b.days ?? 14)))));
  });

  // 📢 persistent broadcast history — who received / who did NOT (survives refresh)
  app.get("/api/admin/broadcasts", requireAdmin, async (req, res) => {
    const limit = Math.min(100, Number(req.query.limit) || 50);
    const { getAdminBroadcasts } = await import("../services/adminOps");
    res.json(await getAdminBroadcasts(limit));
  });
  app.get("/api/admin/broadcasts/:id", requireAdmin, async (req, res) => {
    const id = Math.floor(Number(req.params.id));
    if (!(id > 0)) { res.status(400).json({ ok: false, message: "id noto'g'ri" }); return; }
    const { getAdminBroadcastDetail } = await import("../services/adminOps");
    const d = await getAdminBroadcastDetail(id);
    if (!d) { res.status(404).json({ ok: false, message: "topilmadi" }); return; }
    res.json(d);
  });

  // 🎁 bulk grant tanga to a whole segment (owner-gated; capped + idempotent per batch)
  app.post("/api/admin/grant-segment", requireAdmin, requireOwner, rateLimit(3), async (req, res) => {
    const b = (req.body ?? {}) as { segment?: string; amount?: number; reason?: string; days?: number };
    const seg = b.segment === "linked" || b.segment === "dormant" ? b.segment : "all";
    const { adminGrantSegment } = await import("../services/adminOps");
    res.json(await adminGrantSegment(seg, Math.floor(Number(b.amount ?? 0)), String(b.reason ?? ""), String(res.locals.telegramId ?? "admin"), Math.max(1, Math.floor(Number(b.days ?? 14)))));
  });
  // 😴 wake-up: message the dormant segment + optional comeback bonus, one action (owner-gated)
  app.post("/api/admin/wake-up", requireAdmin, requireOwner, rateLimit(3), async (req, res) => {
    if (!opts.sendMessage) { res.json({ ok: false, message: "Bot ulanmagan" }); return; }
    const b = (req.body ?? {}) as { text?: string; bonus?: number; days?: number };
    const { adminWakeUp } = await import("../services/adminOps");
    res.json(await adminWakeUp(String(b.text ?? ""), Math.floor(Number(b.bonus ?? 0)), Math.max(1, Math.floor(Number(b.days ?? 14))), opts.sendMessage, String(res.locals.telegramId ?? "admin")));
  });

  app.get("/api/admin/rides", requireAdmin, async (req, res) => {
    const limit = Math.min(500, Number(req.query.limit) || 150);
    const { getAdminRides } = await import("../services/adminOps");
    res.json(await getAdminRides(limit));
  });

  app.get("/api/admin/driver-debts", requireAdmin, async (_req, res) => {
    const { getAdminDriverDebts } = await import("../services/adminOps");
    res.json(await getAdminDriverDebts());
  });

  app.get("/api/admin/referrals", requireAdmin, async (_req, res) => {
    const { getAdminReferrals } = await import("../services/adminOps");
    res.json(await getAdminReferrals());
  });

  app.get("/api/admin/banned", requireAdmin, async (_req, res) => {
    const { getAdminBanned } = await import("../services/adminOps");
    res.json(await getAdminBanned());
  });

  app.post("/api/admin/ban", requireAdmin, requireOwner, rateLimit(20), async (req, res) => {
    const { memberId, reason } = req.body as { memberId: number; reason?: string };
    if (!memberId) { res.status(400).json({ ok: false, message: "memberId kerak" }); return; }
    const { adminBan } = await import("../services/adminOps");
    res.json(await adminBan(memberId, reason ?? "admin ban"));
  });

  app.post("/api/admin/unban", requireAdmin, requireOwner, rateLimit(20), async (req, res) => {
    const { memberId } = req.body as { memberId: number };
    if (!memberId) { res.status(400).json({ ok: false, message: "memberId kerak" }); return; }
    const { adminUnban } = await import("../services/adminOps");
    res.json(await adminUnban(memberId));
  });

  // 🚫 HARD ban — TOTAL bot lockout (bot + Mini App), a level above /ban (which only freezes cash).
  app.post("/api/admin/hardban", requireAdmin, requireOwner, rateLimit(20), async (req, res) => {
    const { memberId, reason } = req.body as { memberId: number; reason?: string };
    if (!memberId) { res.status(400).json({ ok: false, message: "memberId kerak" }); return; }
    const { banMember } = await import("../services/banService");
    res.json(await banMember(memberId, reason ?? "admin ban", "panel"));
  });

  app.post("/api/admin/hardunban", requireAdmin, requireOwner, rateLimit(20), async (req, res) => {
    const { memberId } = req.body as { memberId: number };
    if (!memberId) { res.status(400).json({ ok: false, message: "memberId kerak" }); return; }
    const { unbanMember } = await import("../services/banService");
    res.json(await unbanMember(memberId, "panel"));
  });

  app.get("/api/admin/withdrawals-tab", requireAdmin, async (req, res) => {
    const limit = Math.min(500, Number(req.query.limit) || 100);
    const { getAdminWithdrawals } = await import("../services/adminOps");
    res.json(await getAdminWithdrawals(limit));
  });

  // 📵 users who blocked the bot (send returned 403; auto-clears when they interact again)
  app.get("/api/admin/blocked", requireAdmin, async (req, res) => {
    const limit = Math.min(1000, Number(req.query.limit) || 500);
    const { getAdminBlocked } = await import("../services/adminOps");
    res.json(await getAdminBlocked(limit));
  });

  // 💸 unified transaction ledger — transfers (who paid whom) + withdrawals (who cashed out)
  app.get("/api/admin/transactions", requireAdmin, async (req, res) => {
    const limit = Math.min(500, Number(req.query.limit) || 200);
    const k = String(req.query.kind ?? "all");
    const kind = (["all", "transfer", "tip", "fare", "withdraw"].includes(k) ? k : "all") as "all" | "transfer" | "tip" | "fare" | "withdraw";
    const { getAdminTransactions } = await import("../services/adminOps");
    res.json(await getAdminTransactions(kind, limit));
  });

  app.get("/api/admin/ratings", requireAdmin, async (_req, res) => {
    const { getAdminRatings } = await import("../services/adminOps");
    res.json(await getAdminRatings());
  });

  app.get("/api/admin/chat/conversations", requireAdmin, async (_req, res) => {
    const { getChatConversations } = await import("../services/adminOps");
    res.json(await getChatConversations());
  });

  app.get("/api/admin/chat/messages/:telegramId", requireAdmin, async (req, res) => {
    const { getChatMessages } = await import("../services/adminOps");
    res.json(await getChatMessages(req.params.telegramId!));
  });

  app.post("/api/admin/chat/reply", requireAdmin, rateLimit(30), async (req, res) => {
    const { telegramId, text } = req.body as { telegramId: string; text: string };
    if (!telegramId || !text?.trim()) { res.status(400).json({ ok: false }); return; }
    const { sendChatReply } = await import("../services/adminOps");
    if (!opts.sendMessage) { res.status(503).json({ ok: false, message: "Bot ulanmagan" }); return; }
    res.json(await sendChatReply(telegramId, text.trim(), opts.sendMessage));
  });

  // 🎧 Super Operator: pause/resume the AI for one conversation (chat-attached entry point —
  // the customer-triggered escalation, operatorPause.ts, already exists; this is the admin-
  // panel-triggered mirror of it).
  app.post("/api/admin/chat/pause", requireAdmin, rateLimit(30), async (req, res) => {
    if (!(await featureOn("operatorAssist"))) { res.status(403).json({ ok: false, message: "O'chirilgan" }); return; }
    const { telegramId, on } = req.body as { telegramId: string; on: boolean };
    if (!telegramId) { res.status(400).json({ ok: false }); return; }
    const { pauseAiForOperator, resumeAiForOperator } = await import("../services/ai/operatorPause");
    if (on) await pauseAiForOperator(telegramId);
    else await resumeAiForOperator(telegramId);
    res.json({ ok: true });
  });

  app.get("/api/admin/msg-history", requireAdmin, async (req, res) => {
    const limit = Math.min(500, Number(req.query.limit) || 200);
    const { getAdminMsgHistory } = await import("../services/adminOps");
    res.json(await getAdminMsgHistory(limit));
  });

  // ── 🎧 Super Operator console (/api/admin/opr/*) ────────────────────────────────────────
  // Chat-attached (memberId resolved from an existing telegramId) AND call-center (memberId
  // resolved/created from a bare phone number, no telegramId) both funnel through the same
  // dispatchAction — see services/operatorConsole.ts for the "why" and the full action list.
  app.post("/api/admin/opr/resolve-phone", requireAdmin, rateLimit(20), async (req, res) => {
    if (!(await featureOn("operatorAssist"))) { res.status(403).json({ ok: false, message: "O'chirilgan" }); return; }
    const { phone, fullName } = req.body as { phone: string; fullName?: string };
    if (!phone || phone.replace(/\D/g, "").length < 9) { res.status(400).json({ ok: false, message: "Raqam noto'g'ri" }); return; }
    const { createLocalMember } = await import("../services/memberService");
    const m = await createLocalMember(phone, fullName || "Mijoz");
    res.json({ ok: true, memberId: m.id, fullName: m.fullName });
  });

  app.post("/api/admin/opr/act", requireAdmin, rateLimit(60), async (req, res) => {
    if (!(await featureOn("operatorAssist"))) { res.status(403).json({ ok: false, message: "O'chirilgan" }); return; }
    const { telegramId, action, params } = req.body as { memberId?: number; telegramId?: string | null; action: string; params?: object };
    let memberId = Number((req.body as { memberId?: number }).memberId) || undefined;
    // chat-attached callers naturally only have telegramId (the open conversation) — resolve
    // memberId server-side rather than making every UI call-site plumb it through separately.
    if (!memberId && telegramId) {
      const tu = await prisma.telegramUser.findUnique({ where: { id: telegramId }, select: { memberId: true } });
      memberId = tu?.memberId ?? undefined;
    }
    if (!memberId || !action) { res.status(400).json({ ok: false, message: "memberId/action kerak" }); return; }
    const { dispatchAction } = await import("../services/operatorConsole");
    const operatorName = String(res.locals.operatorName ?? res.locals.adminRole ?? "operator");
    const result = await dispatchAction(memberId, telegramId || null, action, params ?? {}, operatorName, opts.sendMessage);
    res.json(result);
  });

  app.get("/api/admin/opr/dashboard", requireAdmin, async (_req, res) => {
    if (!(await featureOn("operatorAssist"))) { res.status(403).json({ rows: [] }); return; }
    const { getOpsDashboard } = await import("../services/operatorConsole");
    res.json({ rows: await getOpsDashboard() });
  });

  app.get("/api/admin/opr/health", requireAdmin, async (_req, res) => {
    const { getSystemHealth } = await import("../services/operatorConsole");
    res.json(await getSystemHealth());
  });

  // 🕵️ Jurnal — every dispatchAction() call writes here via the EXISTING logAudit()
  // (shopService.ts, already used for shop moderation) — reused, not a new log table.
  app.get("/api/admin/opr/jurnal", requireAdmin, async (_req, res) => {
    const { listAuditLog } = await import("../services/shopService");
    const rows = (await listAuditLog(200)).filter((r) => r.action.startsWith("opr_"));
    res.json({ items: rows });
  });

  // ── Peak Hours ──────────────────────────────────────────────────────────────
  app.get("/api/admin/peak-hours", requireAdmin, async (_req, res) => {
    const { getPeakHours } = await import("../services/adminOps");
    res.json(await getPeakHours());
  });

  app.post("/api/admin/peak-hours", requireAdmin, rateLimit(20), async (req, res) => {
    const { upsertPeakHour } = await import("../services/adminOps");
    const { id, label, startTime, endTime, bonusTanga, active } = req.body as {
      id?: number; label: string; startTime: string; endTime: string; bonusTanga: number; active: boolean;
    };
    if (!label || !startTime || !endTime || !bonusTanga) return res.status(400).json({ error: "missing fields" });
    if (!opts.sendMessage) return res.status(503).json({ error: "Bot ulanmagan" });
    const sendTg = opts.sendMessage;
    const row = await upsertPeakHour({ id, label, startTime, endTime, bonusTanga: Number(bonusTanga), active: !!active }, sendTg);
    res.json(row);
  });

  app.delete("/api/admin/peak-hours/:id", requireAdmin, rateLimit(20), async (req, res) => {
    const { deletePeakHour } = await import("../services/adminOps");
    await deletePeakHour(Number(req.params.id));
    res.json({ ok: true });
  });

  app.post("/api/admin/sync", requireAdmin, async (_req, res) => {
    const { runSync } = await import("../sync/sync");
    try {
      const summary = await runSync();
      if (opts.afterSync) await opts.afterSync();
      res.json(summary);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  // T2: yagona errorHandler — log + kunlik xato hisoblagich (egaga kunlik hisobotda)
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    console.error(`[api] error ${req.method} ${req.path}:`, err);
    void import("../services/appStateUtil")
      .then(({ atomicIncrement }) => atomicIncrement(`apierr:${new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10)}`, 1))
      .catch(() => undefined);
    if (!res.headersSent) res.status(500).json({ error: "internal" });
  });

  return app;
}
