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
import { finishRace, getRaceBoard, startRace } from "../services/raceService";
import { cashoutCrash, startCrash } from "../services/crashService";
import { buyOrUpgradeCar, collectPark, getPark } from "../services/parkService";
import { getFareConfig } from "../services/clientInfoService";
import { acceptDuel, createDuel, listDuels, submitDuelRun } from "../services/duelService";
import { answerQuiz, getQuiz } from "../services/quizService";
import { cancelBookingFor, createBookingFor, estimateFare, getActiveBookingFor, getBookingInfo, searchBookingAddress } from "../services/bookingService";
import type { BookingCreateBody, DuelRunBody, GeoPt, RaceFinishBody } from "@t1067/shared";
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
    res.json(await spinWheel(memberId, { respin: req.query.respin === "1" }));
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
    res.json(await openBox(memberId, { premium: req.query.premium === "1" }));
  });

  // ─── games: racing ────────────────────────────────────────────────────────
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

  app.post("/api/race/create", requireUser, rateLimit(20), withMember((id, req) => startRace(id, Math.floor(Number((req.body as { stake?: number })?.stake ?? 0)))));
  app.post("/api/race/finish", requireUser, withMember((id, req) => finishRace(id, req.body as RaceFinishBody)));
  app.get("/api/race/board", requireUser, withMember((id, req) => getRaceBoard(id, Math.floor(Number(req.query.stake ?? 0)))));

  // ─── games: duel 1v1 ────────────────────────────────────────────────────────
  app.get("/api/duel/list", requireUser, withMember((id) => listDuels(id)));
  app.post("/api/duel/create", requireUser, rateLimit(10), withMember((id, req) => createDuel(id, Math.floor(Number((req.body as { stake?: number })?.stake ?? 0)))));
  app.post("/api/duel/accept", requireUser, rateLimit(10), withMember((id, req) => acceptDuel(id, String((req.body as { duelId?: string })?.duelId ?? ""))));
  app.post("/api/duel/run", requireUser, withMember((id, req) => submitDuelRun(id, req.body as DuelRunBody)));

  // ─── games: daily quiz ──────────────────────────────────────────────────────
  app.get("/api/quiz", requireUser, withMember((id) => getQuiz(id)));
  app.post("/api/quiz/answer", requireUser, withMember((id, req) => {
    const b = req.body as { qIdx?: number; answerIdx?: number };
    return answerQuiz(id, Math.floor(Number(b?.qIdx ?? -1)), Math.floor(Number(b?.answerIdx ?? -1)));
  }));

  // ─── games: crash (Tezlik) ──────────────────────────────────────────────────
  app.post("/api/crash/start", requireUser, rateLimit(20), withMember((id, req) => startCrash(id, Math.floor(Number((req.body as { stake?: number })?.stake ?? 0)))));
  app.post("/api/crash/cashout", requireUser, withMember((id, req) => cashoutCrash(id, String((req.body as { roundId?: string })?.roundId ?? ""))));

  // ─── games: taxi park ───────────────────────────────────────────────────────
  app.get("/api/park", requireUser, withMember((id) => getPark(id)));
  app.post("/api/park/buy", requireUser, withMember((id, req) => buyOrUpgradeCar(id, String((req.body as { car?: string })?.car ?? ""))));
  app.post("/api/park/collect", requireUser, withMember((id) => collectPark(id)));

  // ─── Uber-level booking (map + live tracking) ───────────────────────────────
  app.get("/api/booking/info", requireUser, withMember((id) => getBookingInfo(id)));
  app.get("/api/booking/active", requireUser, withMember((id) => getActiveBookingFor(id)));
  app.post("/api/booking/search", requireUser, withMember((_id, req) => searchBookingAddress(String((req.body as { q?: string })?.q ?? ""))));
  app.post("/api/booking/create", requireUser, withMember((id, req) => createBookingFor(id, req.body as BookingCreateBody)));
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
