import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
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
import { findRecipientByPhone, getDriverEarnings, transfer } from "../services/transferService";
import { buyListing, listShops, myOrders, myShop, redeemVoucher } from "../services/marketService";
import { prisma } from "../db";
import { getFareConfig } from "../services/clientInfoService";
import { callOneTapFor, cancelBookingFor, createBookingFor, estimateFare, getActiveBookingFor, getBookingInfo, searchBookingAddress } from "../services/bookingService";
import type { BookingCreateBody, BookingNowBody, GeoPt } from "@t1067/shared";
import { validateInitData } from "./telegramAuth";

export interface ApiOptions {
  afterSync?: () => Promise<void>;
  sendMessage?: (telegramId: string, html: string) => Promise<void>;
}

function memberType(req: Request, fallback: MemberType): MemberType {
  const t = req.query.type;
  return t === "client" || t === "driver" ? t : fallback;
}

function resolveTelegramId(req: Request): string | null {
  const initData = (req.header("X-Telegram-Init-Data") as string) || (req.query.initData as string) || "";
  const dbg = req.header("X-Debug-Telegram-Id");
  if (initData && env.BOT_TOKEN) {
    const res = validateInitData(initData, env.BOT_TOKEN);
    if (env.allowDebugAuth) {
      const u = res.user?.id ? `***${String(res.user.id).slice(-3)}` : "-";
      console.log(`[auth] ${req.path} ok=${res.ok} reason=${res.reason ?? "-"} user=${u}`);
    }
    return res.ok && res.user ? String(res.user.id) : null;
  }
  if (!env.hasBot || env.allowDebugAuth) {
    if (dbg) return dbg;
  }
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

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  // desktop dashboard (no Telegram): a strong shared token grants admin access
  const token = req.header("X-Admin-Token");
  if (env.ADMIN_PANEL_TOKEN && token && token === env.ADMIN_PANEL_TOKEN) {
    res.locals.telegramId = "panel";
    next();
    return;
  }
  const id = resolveTelegramId(req);
  if (!id || !isAdmin(id)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  res.locals.telegramId = id;
  next();
}

export function createApiServer(opts: ApiOptions = {}) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true, mode: env.KAS_MODE, bot: env.hasBot });
  });

  app.get("/api/me", requireUser, async (_req, res) => {
    const me = await getMe(res.locals.telegramId as string);
    res.json(me ?? { linked: false });
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
    res.json(await spinWheel(memberId));
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
    const r = await findRecipientByPhone(String((req.body as { phone?: string })?.phone ?? ""));
    res.json(r ? { found: true, name: r.fullName, type: r.type } : { found: false });
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
    res.json(await transfer(memberId, String(b.phone), amount, { note: b.note ? String(b.note) : undefined }));
  });
  app.get("/api/driver/earnings", requireUser, async (_req, res) => {
    const memberId = await getMemberId(res.locals.telegramId as string);
    if (!memberId) {
      res.status(404).json({ error: "not linked" });
      return;
    }
    res.json(await getDriverEarnings(memberId));
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
  app.post("/api/admin/market/shop", requireAdmin, async (req, res) => {
    const b = req.body as { name?: string; emoji?: string; category?: string; ownerPhone?: string };
    if (!b?.name) {
      res.status(400).json({ error: "name required" });
      return;
    }
    res.json(await prisma.shop.create({ data: { name: b.name, emoji: b.emoji ?? "🏪", category: b.category ?? "boshqa", ownerPhone: b.ownerPhone ?? null } }));
  });
  // admin: flip a shop's settlement mode (trust ladder: absorb → redeem)
  app.post("/api/admin/market/shopmode", requireAdmin, async (req, res) => {
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
  app.post("/api/admin/market/listing", requireAdmin, async (req, res) => {
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
  app.get("/api/booking/info", requireUser, withMember((id) => getBookingInfo(id)));
  app.get("/api/booking/active", requireUser, withMember((id) => getActiveBookingFor(id)));
  app.post("/api/booking/search", requireUser, withMember((_id, req) => searchBookingAddress(String((req.body as { q?: string })?.q ?? ""))));
  app.post("/api/booking/create", requireUser, withMember((id, req) => createBookingFor(id, req.body as BookingCreateBody)));
  // 1-tap "1067 Now": server resolves the pickup behind the button (rate-limited — real taxis dispatch here)
  app.post("/api/booking/now", requireUser, rateLimit(3), withMember((id, req) => callOneTapFor(id, (req.body ?? {}) as BookingNowBody)));
  // ride history (kas bookingReports, newest first)
  app.get("/api/booking/history", requireUser, withMember(async (id) => {
    const m = await prisma.member.findUnique({ where: { id }, select: { phone: true } });
    if (!m?.phone) return [];
    const { getDataSource } = await import("../kas");
    return getDataSource().getRideHistory(m.phone, 10);
  }));
  app.post("/api/booking/cancel", requireUser, withMember((id) => cancelBookingFor(id)));
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
  app.post("/api/admin/heal", requireAdmin, async (req, res) => {
    const { healMember } = await import("../services/reconciliation");
    const id = Math.floor(Number((req.body as { memberId?: number })?.memberId ?? 0));
    if (!id) {
      res.status(400).json({ ok: false, message: "memberId required" });
      return;
    }
    res.json(await healMember(id));
  });
  app.post("/api/admin/unflag", requireAdmin, async (req, res) => {
    const { unflagMember } = await import("../services/reconciliation");
    const id = Math.floor(Number((req.body as { memberId?: number })?.memberId ?? 0));
    if (!id) {
      res.status(400).json({ ok: false, message: "memberId required" });
      return;
    }
    res.json(await unflagMember(id));
  });
  app.post("/api/admin/grant", requireAdmin, rateLimit(10), async (req, res) => {
    const { adminGrant } = await import("../services/adminOps");
    const b = (req.body ?? {}) as { target?: string; amount?: number; reason?: string };
    res.json(await adminGrant(String(b.target ?? ""), Number(b.amount ?? 0), String(b.reason ?? ""), res.locals.telegramId as string));
  });
  app.post("/api/admin/announce", requireAdmin, rateLimit(3), async (req, res) => {
    if (!opts.sendMessage) {
      res.json({ ok: false, message: "Bot ulanmagan" });
      return;
    }
    const { adminAnnounce } = await import("../services/adminOps");
    const b = (req.body ?? {}) as { text?: string; segment?: "all" | "linked" };
    res.json(await adminAnnounce(String(b.text ?? ""), b.segment === "linked" ? "linked" : "all", opts.sendMessage));
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

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error("[api] error:", err);
    res.status(500).json({ error: "internal" });
  });

  return app;
}
