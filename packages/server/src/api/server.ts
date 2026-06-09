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
import { getReferralInfo } from "../services/referralService";
import { validateInitData } from "./telegramAuth";

export interface ApiOptions {
  afterSync?: () => Promise<void>;
}

function memberType(req: Request, fallback: MemberType): MemberType {
  const t = req.query.type;
  return t === "client" || t === "driver" ? t : fallback;
}

function resolveTelegramId(req: Request): string | null {
  const initData = (req.header("X-Telegram-Init-Data") as string) || (req.query.initData as string) || "";
  const dbg = req.header("X-Debug-Telegram-Id");
  const ua = (req.header("User-Agent") || "").slice(0, 50);
  if (initData && env.BOT_TOKEN) {
    const res = validateInitData(initData, env.BOT_TOKEN);
    console.log(`[auth] ${req.path} initData.len=${initData.length} ok=${res.ok} reason=${res.reason ?? "-"} user=${res.user?.id ?? "-"} ua="${ua}"`);
    return res.ok && res.user ? String(res.user.id) : null;
  }
  console.log(`[auth] ${req.path} NO initData (debugHdr=${dbg ?? "-"}, hasBot=${env.hasBot}, allowDebug=${env.allowDebugAuth}) ua="${ua}"`);
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

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
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

  // Temporary diagnostic: tests Render -> kas1067 reachability. Gated by the webhook secret.
  app.get("/debug/kas", async (req, res) => {
    if (req.query.key !== env.WEBHOOK_SECRET) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const { getDataSource } = await import("../kas");
    const t0 = Date.now();
    try {
      const members = await getDataSource().fetchByPhone(String(req.query.phone ?? "998978072233"));
      res.json({ ok: true, ms: Date.now() - t0, found: members.length, names: members.map((m) => m.fullName) });
    } catch (e) {
      res.json({ ok: false, ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e) });
    }
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

  app.post("/api/wheel", requireUser, async (_req, res) => {
    const memberId = await getMemberId(res.locals.telegramId as string);
    if (!memberId) {
      res.status(404).json({ error: "not linked" });
      return;
    }
    res.json(await spinWheel(memberId));
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
