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
import { buyListing, listShops, myOrders, myShop, redeemVoucher } from "../services/marketService";
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

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  // desktop dashboard (no Telegram): a strong shared token grants admin access
  const token = req.header("X-Admin-Token");
  if (env.ADMIN_PANEL_TOKEN && token && token === env.ADMIN_PANEL_TOKEN) {
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

export function createApiServer(opts: ApiOptions = {}) {
  const app = express();
  app.use(cors());
  app.use(compression()); // T2: gzip har javobga — WAN'da payload kichrayadi (telefon uchun)
  app.use(express.json());
  app.set("etag", "strong"); // T2: shartli so'rovlar uchun ETag (304)

  app.get("/health", (_req, res) => {
    res.json({ ok: true, mode: env.KAS_MODE, bot: env.hasBot });
  });

  // 🏆 GARAJ v2 — the new dedicated restoration game. Service no-ops when feature
  // "garajx" is OFF (DEFAULT_OFF), so these are safe to ship dark before QABUL.
  app.get("/api/garaj/state", requireUser, withMember2(async (id) => (await import("../services/garajService")).getGarajState(id)));
  app.post("/api/garaj/acquire", requireUser, rateLimit(20), withMember2(async (id, req) => (await import("../services/garajService")).acquireCar(id, String(req.body?.carCode ?? ""))));
  app.post("/api/garaj/diagnose", requireUser, rateLimit(20), withMember2(async (id, req) => (await import("../services/garajService")).diagnoseCar(id, Number(req.body?.garajCarId), req.body?.tier === "EXPERT" ? "EXPERT" : req.body?.tier === "TOOL" ? "TOOL" : "VISUAL")));
  app.post("/api/garaj/repair", requireUser, rateLimit(20), withMember2(async (id, req) => (await import("../services/garajService")).completeRepairTask(id, Number(req.body?.garajCarId), String(req.body?.taskCode ?? "oil_change"), req.body?.style, req.body?.quality)));
  app.post("/api/garaj/repair-zone", requireUser, rateLimit(30), withMember2(async (id, req) => (await import("../services/garajService")).repairZone(id, Number(req.body?.garajCarId), String(req.body?.zone ?? ""), String(req.body?.partTier ?? "STD"), req.body?.style, req.body?.quality)));
  app.post("/api/garaj/craft", requireUser, rateLimit(20), withMember2(async (id, req) => (await import("../services/garajService")).garajCraft(id, Number(req.body?.garajCarId), String(req.body?.station ?? ""))));
  app.post("/api/garaj/craft/speedup", requireUser, rateLimit(20), withMember2(async (id) => (await import("../services/garajService")).garajCraftSpeedup(id)));
  app.post("/api/garaj/flip", requireUser, rateLimit(10), withMember2(async (id, req) => (await import("../services/garajService")).flipCar(id, Number(req.body?.garajCarId), req.body?.buyerArchetype)));
  app.post("/api/garaj/onboard/finish", requireUser, rateLimit(10), withMember2(async (id, _req, res) => (await import("../services/garajService")).garajOnboardFinish(id, String(res.locals.telegramId ?? ""))));
  app.post("/api/garaj/kozshop/buy", requireUser, rateLimit(20), withMember2(async (id, req) => (await import("../services/garajService")).garajKozachaBuy(id, String(req.body?.itemCode ?? ""), Number(req.body?.garajCarId))));
  app.get("/api/garaj/bazaar", requireUser, withMember2(async (id) => (await import("../services/garajService")).getBazaar(id)));
  app.post("/api/garaj/bazaar/list", requireUser, rateLimit(10), withMember2(async (id, req) => (await import("../services/garajService")).garajBazaarList(id, Number(req.body?.garajCarId), Number(req.body?.askPrice))));
  app.post("/api/garaj/bazaar/buy", requireUser, rateLimit(10), withMember2(async (id, req) => (await import("../services/garajService")).garajBazaarBuy(id, Number(req.body?.listingId))));
  app.post("/api/garaj/bazaar/unlist", requireUser, rateLimit(10), withMember2(async (id, req) => (await import("../services/garajService")).garajBazaarUnlist(id, Number(req.body?.listingId))));
  app.get("/api/garaj/history", requireUser, withMember2(async (id) => (await import("../services/garajService")).getGarajHistory(id)));
  app.get("/api/garaj/collection", requireUser, withMember2(async (id, req) => (await import("../services/garajService")).getMemberCollection(id, Number(req.query?.memberId))));
  app.post("/api/garaj/tow/claim", requireUser, rateLimit(10), withMember2(async (id, req) => (await import("../services/garajService")).claimTowedCar(id, Number(req.body?.dropId))));
  app.post("/api/garaj/tow/decline", requireUser, rateLimit(20), withMember2(async (id, req) => (await import("../services/garajService")).declineTowedCar(id, Number(req.body?.dropId))));
  app.get("/api/garaj/auctions", requireUser, withMember2(async (id) => (await import("../services/garajService")).getAuctions(id)));
  app.post("/api/garaj/auction/create", requireUser, rateLimit(10), withMember2(async (id, req) => (await import("../services/garajService")).garajAuctionCreate(id, Number(req.body?.garajCarId), Number(req.body?.minBid))));
  app.post("/api/garaj/auction/bid", requireUser, rateLimit(20), withMember2(async (id, req) => (await import("../services/garajService")).garajAuctionBid(id, Number(req.body?.auctionId), Number(req.body?.amount))));
  // W5 meta + social
  app.post("/api/garaj/cipher", requireUser, rateLimit(20), withMember2(async (id, req) => (await import("../services/garajService")).garajCipherGuess(id, String(req.body?.guess ?? ""))));
  app.post("/api/garaj/box/collect", requireUser, rateLimit(10), withMember2(async (id) => (await import("../services/garajService")).collectOfflineBox(id)));
  app.post("/api/garaj/comeback", requireUser, rateLimit(10), withMember2(async (id) => (await import("../services/garajService")).garajComebackBonus(id)));
  app.post("/api/garaj/prestige", requireUser, rateLimit(5), withMember2(async (id) => (await import("../services/garajService")).garajPrestige(id)));
  app.get("/api/garaj/hall", requireUser, withMember2(async () => (await import("../services/garajService")).getHallOfFame()));
  app.get("/api/garaj/mahalla/league", requireUser, withMember2(async (id) => (await import("../services/garajService")).getMahallaLeague(id)));
  app.post("/api/garaj/mahalla/create", requireUser, rateLimit(5), withMember2(async (id, req) => (await import("../services/garajService")).mahallaCreate(id, String(req.body?.name ?? ""))));
  app.post("/api/garaj/mahalla/join", requireUser, rateLimit(10), withMember2(async (id, req) => (await import("../services/garajService")).mahallaJoin(id, String(req.body?.code ?? ""))));
  app.post("/api/garaj/mahalla/leave", requireUser, rateLimit(10), withMember2(async (id) => (await import("../services/garajService")).mahallaLeave(id)));
  app.post("/api/garaj/exhibition/submit", requireUser, rateLimit(10), withMember2(async (id, req) => (await import("../services/garajService")).exhibitionSubmit(id, Number(req.body?.garajCarId))));
  app.post("/api/garaj/exhibition/vote", requireUser, rateLimit(20), withMember2(async (id, req) => (await import("../services/garajService")).exhibitionVote(id, Number(req.body?.entryId))));
  app.get("/api/garaj/museum", requireUser, withMember2(async (id) => (await import("../services/garajService")).getMuseum(id)));
  // 🌍 MOTOR OLAMI (v3, gated by "motorolami") — passive «Yig'ish» + public profile
  app.post("/api/garaj/motor/collect", requireUser, rateLimit(30), withMember2(async (id, req) => (await import("../services/garajService")).motorCollect(id, req.body?.garajCarId ? Number(req.body.garajCarId) : undefined)));
  app.post("/api/garaj/motor/refuel", requireUser, rateLimit(20), withMember2(async (id, req) => (await import("../services/garajService")).motorRefuel(id, Number(req.body?.garajCarId))));
  // 🏛 P1-B — 1067 Ofis market-maker endpoints (always-on buyer; daily budget; supply burn)
  app.get("/api/garaj/ofis/stats", requireUser, async (_req, res) => res.json(await (await import("../services/garajService")).getOfisStats()));
  app.get("/api/garaj/ofis/bid/:carId", requireUser, async (req, res) => {
    const r = await (await import("../services/garajService")).getOfisBid(Number(req.params?.carId));
    res.json(r ?? { error: "not_found" });
  });
  app.post("/api/garaj/ofis/sell", requireUser, rateLimit(10), withMember2(async (id, req) => (await import("../services/garajService")).ofisSellToOfis(id, Number(req.body?.garajCarId))));
  // 🪪 P1-D — slot system
  app.get("/api/garaj/slot/status", requireUser, withMember2(async (id) => (await import("../services/garajService")).getSlotStatus(id)));
  app.post("/api/garaj/slot/purchase", requireUser, rateLimit(5), withMember2(async (id) => (await import("../services/garajService")).purchaseSlot(id)));
  app.post("/api/garaj/slot/refund", requireUser, rateLimit(5), withMember2(async (id) => (await import("../services/garajService")).refundSlot(id)));
  // 🔍 P1-E — CarCheck (pay-for-truth) + sotuvchi reputatsiyasi
  app.post("/api/garaj/carcheck", requireUser, rateLimit(15), withMember2(async (id, req) => (await import("../services/garajService")).getCarCheck(id, Number(req.body?.garajCarId), (req.body?.tier === "EKSPERT" ? "EKSPERT" : req.body?.tier === "PREMIUM" ? "PREMIUM" : "ODDIY"))));
  app.post("/api/garaj/rate-seller", requireUser, rateLimit(10), withMember2(async (id, req) => (await import("../services/garajService")).rateSeller(id, Number(req.body?.listingId), Number(req.body?.stars))));
  // ✨ P1-F — ORZU board (global Top + per-model #1)
  app.get("/api/garaj/orzu", requireUser, rateLimit(20), withMember2(async (id) => (await import("../services/garajService")).getOrzuBoard(id)));
  // 🔗 P2-A — Merge mechanic (sacrifice 1 active car to promote another; supply drops by 1)
  app.post("/api/garaj/merge", requireUser, rateLimit(5), withMember2(async (id, req) => (await import("../services/garajService")).mergeCars(id, Number(req.body?.keepCarId), Number(req.body?.sacrificeCarId))));
  // 🚀 P2-C — Speeder booster (10-day, ×N admin-tunable, limited daily stock)
  app.get("/api/garaj/speeder/state", requireUser, withMember2(async (id) => (await import("../services/garajService")).getSpeederState(id)));
  app.post("/api/garaj/speeder/buy", requireUser, rateLimit(5), withMember2(async (id, req) => (await import("../services/garajService")).purchaseSpeeder(id, Number(req.body?.garajCarId))));
  // 🔧 P2-deep-5 — Limited-event parts (detallar): mint (event-gated, hard cap) + install/uninstall
  app.get("/api/garaj/parts", requireUser, withMember2(async (id) => (await import("../services/garajService")).getPartsState(id)));
  app.post("/api/garaj/parts/mint", requireUser, rateLimit(10), withMember2(async (id, req) => (await import("../services/garajService")).mintPart(id, String(req.body?.partCode ?? ""))));
  app.post("/api/garaj/parts/install", requireUser, rateLimit(15), withMember2(async (id, req) => (await import("../services/garajService")).installPart(id, Number(req.body?.partId), Number(req.body?.garajCarId))));
  app.post("/api/garaj/parts/uninstall", requireUser, rateLimit(15), withMember2(async (id, req) => (await import("../services/garajService")).uninstallPart(id, Number(req.body?.partId))));
  // 🚗 FAZA2 — model-upgrade ladder (Tiko→Damas→…, #serial saqlanadi). Pure tanga sink. Flag carupgrade.
  app.post("/api/garaj/upgrade-model", requireUser, rateLimit(10), withMember2(async (id, req) => (await import("../services/garajService")).upgradeCarModel(id, Number(req.body?.garajCarId))));
  // 🛠 P2-deep-6 — Detal-bozori (parts P2P market): browse + list + buy + cancel
  app.get("/api/garaj/parts/bazaar", requireUser, withMember2(async (id) => (await import("../services/garajService")).getPartBazaar(id)));
  app.post("/api/garaj/parts/list", requireUser, rateLimit(10), withMember2(async (id, req) => (await import("../services/garajService")).listPart(id, Number(req.body?.partId), Number(req.body?.askPrice))));
  app.post("/api/garaj/parts/buy", requireUser, rateLimit(10), withMember2(async (id, req) => (await import("../services/garajService")).buyPart(id, Number(req.body?.listingId))));
  app.post("/api/garaj/parts/unlist", requireUser, rateLimit(10), withMember2(async (id, req) => (await import("../services/garajService")).cancelPartListing(id, Number(req.body?.listingId))));
  app.get("/api/garaj/profile/:id", requireUser, withMember2(async (id, req) => (await import("../services/garajService")).getPublicProfile(id, req.params?.id === "me" ? id : Number(req.params?.id))));

  app.get("/api/me", requireUser, async (_req, res) => {
    const [me, booking3, garajx, tolqin, livinghome, intercity, tierloyalty] = await Promise.all([
      getMe(res.locals.telegramId as string),
      featureOn("booking3"),
      featureOn("garajx"),
      featureOn("tolqin"),
      featureOn("livinghome"),
      featureOn("intercity"),
      featureOn("tierloyalty"),
    ]);
    if (!me) { res.json({ linked: false }); return; }
    // 🏅 owner-preview: admins see the tier-loyalty UI even while the global flag is DARK, so the
    // owner can QABUL the screens before go-live. (The real cashback multiplier stays globally gated.)
    const tierPreview = tierloyalty || isAdmin(res.locals.telegramId as string);
    res.json({ ...me, flags: { booking3, garajx, tolqin, livinghome, intercity, tierloyalty: tierPreview } });
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
    const { id } = await createCashout(me.member.id, bal, method, mask, phone);
    const notice: CashoutOwnerNotice = { id, name: me.member.fullName ?? "Mijoz", amount: bal, method, contact: phone, trips: me.stats.trips, cardFull, cardHolder, address };
    if (opts.notifyCashoutOwner) await opts.notifyCashoutOwner(notice).catch(() => undefined);
    res.json({ ok: true, id, amount: bal, method });
  });

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
  // ── 💎 Kolleksiya ────────────────────────────────────────────────────────
  app.get("/api/items", requireUser, withMember2(async (id) => {
    const { getCollection } = await import("../services/itemService");
    return getCollection(id);
  }));
  app.post("/api/items/mint", requireUser, rateLimit(10), withMember2(async (id, req) => {
    const { featureOn } = await import("../services/featureFlags");
    if (!(await featureOn("items"))) return { ok: false, reason: "disabled" };
    const { mintItem } = await import("../services/itemService");
    return mintItem(id, String((req.body as { code?: string })?.code ?? ""));
  }));
  app.post("/api/items/list", requireUser, rateLimit(10), withMember2(async (id, req) => {
    const { listItem } = await import("../services/itemService");
    const b = req.body as { itemId?: number; price?: number };
    return listItem(id, Math.floor(Number(b?.itemId ?? 0)), Math.floor(Number(b?.price ?? 0)));
  }));
  app.post("/api/items/unlist", requireUser, rateLimit(10), withMember2(async (id, req) => {
    const { unlistItem } = await import("../services/itemService");
    return { ok: await unlistItem(id, Math.floor(Number((req.body as { itemId?: number })?.itemId ?? 0))) };
  }));
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

  app.post("/api/items/buy", requireUser, rateLimit(10), withMember2(async (id, req) => {
    const { buyListedItem } = await import("../services/itemService");
    return buyListedItem(id, Math.floor(Number((req.body as { listingId?: number })?.listingId ?? 0)));
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

  // ── 🏪 Bozor: spendable-cashback marketplace (ABSORB MVP — zero cash risk) ──
  app.get("/api/market/shops", requireUser, async (_req, res) => {
    res.json(await listShops());
  });
  app.post("/api/market/buy", requireUser, rateLimit(10), async (req, res) => {
    const memberId = await getMemberId(res.locals.telegramId as string);
    if (!memberId) {
      res.status(404).json({ error: "not linked" });
      return;
    }
    const listingId = Math.floor(Number((req.body as { listingId?: number })?.listingId ?? 0));
    if (!listingId) {
      res.status(400).json({ error: "listingId required" });
      return;
    }
    res.json(await buyListing(memberId, listingId));
  });
  app.get("/api/market/orders", requireUser, async (_req, res) => {
    const memberId = await getMemberId(res.locals.telegramId as string);
    if (!memberId) {
      res.status(404).json({ error: "not linked" });
      return;
    }
    res.json(await myOrders(memberId));
  });
  // shop owner marks a voucher used (their linked phone is the gate)
  app.post("/api/market/redeem", requireUser, rateLimit(10), async (req, res) => {
    const memberId = await getMemberId(res.locals.telegramId as string);
    if (!memberId) {
      res.status(404).json({ error: "not linked" });
      return;
    }
    const member = await prisma.member.findUnique({ where: { id: memberId }, select: { phone: true } });
    const code = String((req.body as { code?: string })?.code ?? "");
    res.json(await redeemVoucher(code, member?.phone ?? "none"));
  });
  // shop owner panel: pending vouchers for the shop matching my phone
  app.get("/api/market/myshop", requireUser, async (_req, res) => {
    const memberId = await getMemberId(res.locals.telegramId as string);
    if (!memberId) {
      res.status(404).json({ error: "not linked" });
      return;
    }
    const member = await prisma.member.findUnique({ where: { id: memberId }, select: { phone: true } });
    res.json(member?.phone ? await myShop(member.phone) : null);
  });
  // admin: manage shops/listings (manual KYC — owner knows Koson businesses)
  // AUDIT 1.2 (ega qarori): admin UI'da formasi hali yo'q — T7 da qo'shiladi; endpoint qoladi.
  app.post("/api/admin/market/shop", requireAdmin, requireOwner, async (req, res) => {
    const b = req.body as { name?: string; emoji?: string; category?: string; ownerPhone?: string };
    if (!b?.name) {
      res.status(400).json({ error: "name required" });
      return;
    }
    res.json(await prisma.shop.create({ data: { name: b.name, emoji: b.emoji ?? "🏪", category: b.category ?? "boshqa", ownerPhone: b.ownerPhone ?? null } }));
  });
  // admin: flip a shop's settlement mode (trust ladder: absorb → redeem)
  app.post("/api/admin/market/shopmode", requireAdmin, requireOwner, async (req, res) => {
    const b = req.body as { shopId?: number; settlementMode?: string; spread?: number; dailyCapCoins?: number };
    if (!b?.shopId || !["absorb", "redeem"].includes(String(b.settlementMode))) {
      res.status(400).json({ error: "shopId and settlementMode (absorb|redeem) required" });
      return;
    }
    const spread = Math.min(0.3, Math.max(0.05, Number(b.spread ?? 0.12)));
    res.json(
      await prisma.shop.update({
        where: { id: b.shopId },
        data: { settlementMode: String(b.settlementMode), spread, ...(b.dailyCapCoins ? { dailyCapCoins: Math.floor(Number(b.dailyCapCoins)) } : {}) },
      }),
    );
  });
  app.post("/api/admin/market/listing", requireAdmin, requireOwner, async (req, res) => {
    const b = req.body as { shopId?: number; title?: string; emoji?: string; priceCoins?: number; perUserLimit?: number };
    const priceCoins = Math.floor(Number(b?.priceCoins ?? 0));
    if (!b?.shopId || !b?.title || priceCoins <= 0) {
      res.status(400).json({ error: "shopId, title, priceCoins required" });
      return;
    }
    res.json(
      await prisma.listing.create({
        data: { shopId: b.shopId, title: b.title, emoji: b.emoji ?? "🎁", priceCoins, perUserLimit: Math.max(1, Math.floor(Number(b.perUserLimit ?? 3))) },
      }),
    );
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
    const [info, flagOn, livinghome, tolqin, garajx] = await Promise.all([getBookingInfo(id), featureOn("booking3"), featureOn("livinghome"), featureOn("tolqin"), featureOn("garajx")]);
    // Booking 3.0 ega-ko'z darvozasi: global flag OFF bo'lsa ham EGA yangi oqimni ko'radi
    // (ilovani oddiy ochib — tasdiqdan oldin preview). QABUL → flag global ON → bu ahamiyatsiz.
    const previewer = resolveTelegramId(req) === "6506297119";
    return { ...info, booking3: flagOn || previewer, livinghome: livinghome || previewer, tolqin: tolqin || previewer, garajx: garajx || previewer };
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
  // V5 mahalla league (gap-vs-gap weekly) — gated behind feature:mahalla.
  app.get("/api/mahalla", requireUser, withMember(async (id) => {
    const { featureOn } = await import("../services/featureFlags");
    if (!(await featureOn("mahalla"))) return { off: true, week: "", gaps: [], me: null };
    const { getMahallaBoard } = await import("../services/mahallaService");
    return { off: false, ...(await getMahallaBoard(id)) };
  }));
  // V4 Yashil to'lqin skill game (tanga-only, ride-scaled hard daily cap) — gated.
  app.post("/api/tolqin/start", requireUser, withMember(async (id) => {
    const { featureOn } = await import("../services/featureFlags");
    if (!(await featureOn("tolqin"))) return { off: true, token: "" };
    const { startTolqinRun } = await import("../services/tolqinService");
    return { off: false, ...(await startTolqinRun(id)) };
  }));
  app.post("/api/tolqin/finish", requireUser, withMember(async (id, req) => {
    const { featureOn } = await import("../services/featureFlags");
    if (!(await featureOn("tolqin"))) return { off: true, ok: false, granted: 0 };
    const { finishTolqinRun } = await import("../services/tolqinService");
    const b = req.body as { token?: string; score?: number };
    return finishTolqinRun(id, String(b?.token ?? ""), Number(b?.score ?? 0));
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

  // ── 🚗 Garaj: ride-to-earn cars ──────────────────────────────────────────
  app.get("/api/garage", requireUser, withMember(async (id) => {
    const { getGarage } = await import("../services/garageService");
    return getGarage(id);
  }));
  app.post("/api/garage/buy", requireUser, rateLimit(10), withMember(async (id, req) => {
    const { buyCar } = await import("../services/garageService");
    return buyCar(id, String((req.body as { car?: string })?.car ?? ""));
  }));
  app.post("/api/garage/equip", requireUser, rateLimit(20), withMember(async (id, req) => {
    const { equipCar } = await import("../services/garageService");
    return { ok: await equipCar(id, String((req.body as { car?: string })?.car ?? "")) };
  }));
  app.post("/api/garage/service", requireUser, rateLimit(10), withMember(async (id, req) => {
    const { serviceCar } = await import("../services/garageService");
    return serviceCar(id, String((req.body as { car?: string })?.car ?? ""));
  }));
  app.post("/api/garage/upgrade", requireUser, rateLimit(10), withMember(async (id, req) => {
    const { upgradeCar } = await import("../services/garageService");
    return upgradeCar(id, String((req.body as { car?: string })?.car ?? ""));
  }));

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
  // (no auth) so the Mini App can render it as a plain <img src>; the URL is unguessable in practice
  // because the memberId is only emitted on bookings the rider is part of. Cached 1h on the rider.
  app.get("/api/driver-photo/:memberId", async (req, res) => {
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

  // ── 🤝 Virtual bozor v2: escrowed offers/barter + per-deal chat ──────────
  app.get("/api/trade", requireUser, withMember2(async (id) => {
    const { myTrades } = await import("../services/tradeService");
    return myTrades(id);
  }));
  app.post("/api/trade/offer", requireUser, rateLimit(10), withMember2(async (id, req) => {
    const { featureOn } = await import("../services/featureFlags");
    if (!(await featureOn("items"))) return { ok: false, reason: "disabled" };
    const { makeOffer } = await import("../services/tradeService");
    const b = req.body as { itemId?: number; coins?: number; offerItemId?: number };
    return makeOffer(id, Math.floor(Number(b?.itemId ?? 0)), Math.floor(Number(b?.coins ?? 0)), b?.offerItemId ? Math.floor(Number(b.offerItemId)) : undefined);
  }));
  app.post("/api/trade/accept", requireUser, rateLimit(10), withMember2(async (id, req) => {
    const { acceptOffer } = await import("../services/tradeService");
    return acceptOffer(id, Math.floor(Number((req.body as { offerId?: number })?.offerId ?? 0)));
  }));
  app.post("/api/trade/cancel", requireUser, rateLimit(10), withMember2(async (id, req) => {
    const { cancelOffer } = await import("../services/tradeService");
    return cancelOffer(id, Math.floor(Number((req.body as { offerId?: number })?.offerId ?? 0)));
  }));
  app.post("/api/trade/message", requireUser, rateLimit(20), withMember2(async (id, req) => {
    const { sendTradeMessage } = await import("../services/tradeService");
    const b = req.body as { offerId?: number; text?: string };
    return sendTradeMessage(id, Math.floor(Number(b?.offerId ?? 0)), String(b?.text ?? ""));
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
  // 🎛 MOTOR OLAMI operator economy — owner controls fuel/earn/speeder prices live (clamped)
  app.get("/api/admin/motor-economy", requireAdmin, async (_req, res) => {
    const { MOTOR_ECON_KNOBS } = await import("@t1067/shared");
    const { getMotorEcon } = await import("../services/garajService");
    res.json({ knobs: MOTOR_ECON_KNOBS, values: await getMotorEcon() });
  });
  app.post("/api/admin/motor-economy", requireAdmin, requireOwner, async (req, res) => {
    const b = req.body as { key?: string; value?: number };
    const { MOTOR_ECON_KNOBS } = await import("@t1067/shared");
    if (!MOTOR_ECON_KNOBS.some((k) => k.key === b?.key) || typeof b?.value !== "number") {
      res.status(400).json({ error: "unknown knob or bad value" });
      return;
    }
    const { setMotorEcon } = await import("../services/garajService");
    res.json({ ok: true, values: await setMotorEcon(b.key as string, b.value) });
  });
  // 🔧 P2-deep-5 — limited-event parts: read state (any admin) + open/close a mint event (owner-only).
  // Opening a part's event = that part becomes mintable for ALL users → owner-gated go-live lever.
  app.get("/api/admin/part-events", requireAdmin, async (_req, res) => {
    const { getPartEvents } = await import("../services/garajService");
    res.json({ events: await getPartEvents() });
  });
  app.post("/api/admin/part-event", requireAdmin, requireOwner, async (req, res) => {
    const b = req.body as { code?: string; open?: boolean };
    const { MOTOR_PARTS } = await import("@t1067/shared");
    if (!MOTOR_PARTS.some((p) => p.code === b?.code) || typeof b?.open !== "boolean") {
      res.status(400).json({ error: "unknown part or bad open flag" });
      return;
    }
    const { setPartMintEvent, getPartEvents } = await import("../services/garajService");
    await setPartMintEvent(b.code as string, b.open);
    res.json({ ok: true, events: await getPartEvents() });
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
  app.post("/api/admin/optoken", requireAdmin, requireOwner, async (_req, res) => {
    const token = Array.from({ length: 24 }, () => "abcdefghjkmnpqrstuvwxyz23456789"[Math.floor(Math.random() * 31)]).join("");
    await prisma.appState.create({ data: { key: `oprtoken:${token}`, value: "operator" } });
    res.json({ ok: true, token, role: "operator" });
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
