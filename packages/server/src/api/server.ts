import crypto from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
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
import { callOneTapFor, cancelBookingFor, createBookingFor, estimateFare, getActiveBookingFor, getBookingInfo, nearestAddressFor, searchBookingAddress } from "../services/bookingService";
import type { BookingCreateBody, BookingNowBody, GeoPt } from "@t1067/shared";
import { validateInitData } from "./telegramAuth";
import { featureOn } from "../services/featureFlags";

export interface ApiOptions {
  afterSync?: () => Promise<void>;
  sendMessage?: (telegramId: string, html: string) => Promise<void>;
  /** Forward a Mini-App cash-out request to the owner's Telegram (bot-bound; set in index.ts). */
  notifyCashoutOwner?: (notice: CashoutOwnerNotice) => Promise<void>;
  /** 🛍 Forward a shop purchase to the owner's Telegram [✅ Yetkazildi]/[❌ Rad] (bot-bound). */
  notifyShopOwner?: (notice: import("../services/shopService").ShopOwnerNotice) => Promise<void>;
  /** 🔎 Forward a self-submitted service listing to the owner's Telegram [✅/❌] (bot-bound). */
  notifyServiceOwner?: (notice: import("../services/serviceDirectory").ServiceOwnerNotice) => Promise<void>;
  /** 🔎 Forward an unmet-demand request ("topilmadi → so'rov") to the owner's Telegram (info-only). */
  notifyServiceDemand?: (notice: import("../services/serviceDirectory").ServiceDemandNotice) => Promise<void>;
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
  res.locals.telegramId = id;
  next();
}

// P0.8: lightweight in-memory rate limiter (no dep). Keyed on the resolved
// telegram id (set by requireUser/requireAdmin, which run first).
const rlBuckets = new Map<string, { n: number; resetAt: number }>();
function rateLimit(maxPerMin: number) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    if (rlBuckets.size > 50_000) rlBuckets.clear(); // bound memory
    const key = `${(res.locals.telegramId as string) || "anon"}:${maxPerMin}`;
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
        if (row) {
          res.locals.telegramId = "panel-operator";
          res.locals.adminRole = row.value || "operator";
          next();
        } else {
          res.status(403).json({ error: "forbidden" });
        }
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

  app.get("/api/me", requireUser, async (_req, res) => {
    const [me, booking3, livinghome, intercity, tierloyalty, shopOn, xizmatlarOn] = await Promise.all([
      getMe(res.locals.telegramId as string),
      featureOn("booking3"),
      featureOn("livinghome"),
      featureOn("intercity"),
      featureOn("tierloyalty"),
      featureOn("shop"),
      featureOn("xizmatlar"),
    ]);
    if (!me) { res.json({ linked: false }); return; }
    // 🏅 owner-preview: admins see the tier-loyalty UI even while the global flag is DARK, so the
    // owner can QABUL the screens before go-live. (The real cashback multiplier stays globally gated.)
    const tierPreview = tierloyalty || isAdmin(res.locals.telegramId as string);
    // 🛍 shop owner-preview mirrors it — owner QABULs the shop tab while the flag is DARK
    const shopPreview = shopOn || isAdmin(res.locals.telegramId as string);
    // 🔎 xizmatlar owner-preview mirrors it — owner QABULs the directory while DARK
    const xizmatlarPreview = xizmatlarOn || isAdmin(res.locals.telegramId as string);
    res.json({ ...me, flags: { booking3, livinghome, intercity, tierloyalty: tierPreview, shop: shopPreview, xizmatlar: xizmatlarPreview } });
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
  app.get("/api/shop/products", requireUser, rateLimit(30), async (_req, res) => {
    const { listActiveProducts } = await import("../services/shopService");
    res.set("Cache-Control", "private, max-age=30");
    // owner-preview: admins browse the REAL catalog while the flag is DARK (QABUL flow); riders get []
    res.json({ products: await listActiveProducts(isAdmin(res.locals.telegramId as string)) });
  });
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
      res.set("Content-Type", m[1]!).set("Cache-Control", "public, max-age=3600").send(Buffer.from(m[2]!, "base64"));
      return;
    }
    res.set("Cache-Control", "private, max-age=3600").redirect(302, url);
  };
  app.get("/api/shop/photo/:productId", serveShopPhoto);
  app.get("/api/shop/photo/:productId/:n", serveShopPhoto);

  // ── 🗣 shop reviews: sharh + 👍/👎 + up to 3 rasm ────────────────────────────────────────────
  app.get("/api/shop/reviews/:productId", requireUser, rateLimit(30), withMember2(async (id, req, res) => {
    const { listReviews } = await import("../services/shopService");
    return listReviews(Number(req.params.productId), id, isAdmin(res.locals.telegramId as string));
  }));
  app.post("/api/shop/review", express.json({ limit: "8mb" }), requireUser, rateLimit(6), withMember2(async (id, req, res) => {
    const { submitReview } = await import("../services/shopService");
    const photos = Array.isArray(req.body?.photos) ? (req.body.photos as unknown[]).filter((p): p is string => typeof p === "string") : undefined;
    const r = await submitReview(id, Number(req.body?.productId), String(req.body?.thumb ?? ""), typeof req.body?.text === "string" ? req.body.text : undefined, photos, isAdmin(res.locals.telegramId as string));
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
      res.set("Content-Type", m[1]!).set("Cache-Control", "public, max-age=3600").send(Buffer.from(m[2]!, "base64"));
      return;
    }
    res.set("Cache-Control", "private, max-age=3600").redirect(302, url);
  };
  app.get("/api/shop/review-photo/:reviewId", serveReviewPhoto);
  app.get("/api/shop/review-photo/:reviewId/:n", serveReviewPhoto);

  // ── 🔎 XIZMATLAR (feature "xizmatlar", DARK until seed + QABUL) — moves NO money ──────────────
  // owner-preview everywhere: admins browse/QABUL the real catalog while riders still see nothing.
  const svcPreview = (res: Response) => isAdmin(res.locals.telegramId as string);
  app.get("/api/services/categories", requireUser, rateLimit(30), async (_req, res) => {
    const { listCategories } = await import("../services/serviceDirectory");
    res.set("Cache-Control", "private, max-age=60");
    res.json({ categories: await listCategories(svcPreview(res)) });
  });
  app.get("/api/services/list", requireUser, rateLimit(60), async (req, res) => {
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
  app.get("/api/services/item/:id", requireUser, rateLimit(60), async (req, res) => {
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
      res.set("Content-Type", m[1]!).set("Cache-Control", "public, max-age=3600").send(Buffer.from(m[2]!, "base64"));
      return;
    }
    res.set("Cache-Control", "private, max-age=3600").redirect(302, url);
  };
  app.get("/api/services/photo/:listingId", serveServicePhoto);
  app.get("/api/services/photo/:listingId/:n", serveServicePhoto);

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
    const [info, flagOn, livinghome] = await Promise.all([getBookingInfo(id), featureOn("booking3"), featureOn("livinghome")]);
    // Booking 3.0 ega-ko'z darvozasi: global flag OFF bo'lsa ham EGA yangi oqimni ko'radi
    // (ilovani oddiy ochib — tasdiqdan oldin preview). QABUL → flag global ON → bu ahamiyatsiz.
    const previewer = resolveTelegramId(req) === "6506297119";
    return { ...info, booking3: flagOn || previewer, livinghome };
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
    res.set("Cache-Control", "private, max-age=3600"); // ~1h, matches Telegram URL TTL
    res.redirect(302, p.url);
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
    res.json({ ok: true, features: await listFeatures() });
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
  app.get("/api/admin/shop/products", requireAdmin, async (_req, res) => {
    const { adminListProducts } = await import("../services/shopService");
    res.json(await adminListProducts());
  });
  app.post("/api/admin/shop/products", requireAdmin, requireShopWrite, rateLimit(20), async (req, res) => {
    const { adminCreateProduct } = await import("../services/shopService");
    res.json(await adminCreateProduct(req.body ?? {}));
  });
  app.post("/api/admin/shop/products/:id", requireAdmin, requireShopWrite, rateLimit(20), async (req, res) => {
    const { adminEditProduct } = await import("../services/shopService");
    res.json(await adminEditProduct(Number(req.params.id), req.body ?? {}));
  });
  app.post("/api/admin/shop/products/:id/toggle", requireAdmin, requireShopWrite, rateLimit(20), async (req, res) => {
    const { adminToggleProduct } = await import("../services/shopService");
    res.json(await adminToggleProduct(Number(req.params.id), !!req.body?.active));
  });
  app.delete("/api/admin/shop/products/:id", requireAdmin, requireOwner, rateLimit(20), async (req, res) => {
    const { adminDeleteProduct } = await import("../services/shopService");
    res.json(await adminDeleteProduct(Number(req.params.id)));
  });
  app.post("/api/admin/shop/products/:id/photo", express.json({ limit: "6mb" }), requireAdmin, requireShopWrite, async (req, res) => {
    const b = req.body as { mime?: string; base64?: string };
    if (!b?.base64) { res.status(400).json({ error: "no image" }); return; }
    const { uploadProductPhoto } = await import("../services/shopService");
    res.json(await uploadProductPhoto(Number(req.params.id), Buffer.from(b.base64, "base64"), b.mime || "image/jpeg"));
  });
  app.delete("/api/admin/shop/products/:id/photo", requireAdmin, requireShopWrite, async (req, res) => {
    const { clearProductPhotos } = await import("../services/shopService");
    res.json(await clearProductPhotos(Number(req.params.id)));
  });
  app.get("/api/admin/shop/orders", requireAdmin, async (req, res) => {
    const { adminListPurchases } = await import("../services/shopService");
    res.json({ orders: await adminListPurchases(req.query?.status ? String(req.query.status) : undefined) });
  });
  app.get("/api/admin/shop/reviews", requireAdmin, async (_req, res) => {
    const { adminListReviews } = await import("../services/shopService");
    res.json({ reviews: await adminListReviews() });
  });
  app.delete("/api/admin/shop/reviews/:id", requireAdmin, requireOwner, rateLimit(30), async (req, res) => {
    const { adminDeleteReview } = await import("../services/shopService");
    res.json(await adminDeleteReview(Number(req.params.id)));
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
      member: { id: m.id, name: m.fullName, type: m.type, coins: m.coins, trips: m.trips, riskFlag: m.riskFlag, plusUntil: m.plusUntil, tier: m.driverTier, createdAt: m.createdAt },
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

  // role defaults to "operator" (read + announce); "shopseller" unlocks Do'kon CRUD only (requireShopWrite)
  app.post("/api/admin/optoken", requireAdmin, requireOwner, async (req, res) => {
    const role = req.body?.role === "shopseller" ? "shopseller" : "operator";
    const token = Array.from({ length: 24 }, () => "abcdefghjkmnpqrstuvwxyz23456789"[Math.floor(Math.random() * 31)]).join("");
    await prisma.appState.create({ data: { key: `oprtoken:${token}`, value: role } });
    res.json({ ok: true, token, role });
  });
  // frontend uses this to tailor the sidebar (e.g. shopseller sees ONLY Do'kon)
  app.get("/api/admin/whoami", requireAdmin, (_req, res) => {
    res.json({ role: res.locals.adminRole as string });
  });
  // List + revoke operator tokens (owner-only): a leaked/ex-employee token must be killable.
  app.get("/api/admin/optokens", requireAdmin, requireOwner, async (_req, res) => {
    const rows = await prisma.appState.findMany({ where: { key: { startsWith: "oprtoken:" } }, orderBy: { updatedAt: "desc" } });
    res.json({ tokens: rows.map((r) => ({ token: r.key.slice("oprtoken:".length), role: r.value, createdAt: r.updatedAt.toISOString() })) });
  });
  app.delete("/api/admin/optokens/:token", requireAdmin, requireOwner, async (req, res) => {
    const del = await prisma.appState.deleteMany({ where: { key: `oprtoken:${String(req.params.token)}` } });
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

  app.get("/api/admin/msg-history", requireAdmin, async (req, res) => {
    const limit = Math.min(500, Number(req.query.limit) || 200);
    const { getAdminMsgHistory } = await import("../services/adminOps");
    res.json(await getAdminMsgHistory(limit));
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
