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
  isAdmin,
} from "../services/memberService";
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
  if (initData && env.BOT_TOKEN) {
    const res = validateInitData(initData, env.BOT_TOKEN);
    return res.ok && res.user ? String(res.user.id) : null;
  }
  // Dev fallback: trust a debug header for local admin/miniapp viewing.
  if (!env.hasBot || env.allowDebugAuth) {
    const dbg = req.header("X-Debug-Telegram-Id");
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

  app.get("/api/me", requireUser, async (_req, res) => {
    const me = await getMe(res.locals.telegramId as string);
    res.json(me ?? { linked: false });
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
