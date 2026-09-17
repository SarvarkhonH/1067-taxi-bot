import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// Load the repo-root .env (also injected by dotenv-cli in the npm scripts; this
// is the fallback for `tsx src/...` runs without the wrapper).
const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(here, "../../..");
config({ path: resolve(repoRoot, ".env") });

const schema = z.object({
  BOT_TOKEN: z.string().optional().default(""),
  BOT_USERNAME: z.string().optional().default("koson1067bot"), // for referral deep links
  // Prod Mini App URL. Default is the REAL prod app (not localhost): if Render ever leaves
  // this unset, the bot must still open the live Mini App — a localhost default makes
  // canWebApp=false → the menu shows NO web-app buttons → the whole Mini App is unreachable.
  // Local dev overrides it via .env (TELEGRAM_WEBAPP_URL=http://localhost:5173).
  TELEGRAM_WEBAPP_URL: z.string().default("https://app.birjoy.online"),
  ADMIN_TELEGRAM_IDS: z.string().optional().default(""),
  ADMIN_PANEL_TOKEN: z.string().optional().default(""), // desktop admin dashboard auth (no Telegram initData)
  // Seller-facing dashboard origin. Sellers get `${ADMIN_PANEL_URL}/?key=<token>` in Telegram
  // (market.ts, grantShopSeller.ts) — it was hardcoded to the Vercel host and survived the
  // 2026-07-25 migration pointing at the dead API, so every seller link handed out was broken.
  // Env-driven now: one place to change if the domain ever moves again.
  ADMIN_PANEL_URL: z.string().default("https://admin.birjoy.online"),

  // The taxi dispatch the bot talks to: "birjoy" = our own core (1067-taxi) over HTTP,
  // "mock" = offline stand-in for development and the simulators. kas1067 ("live") was removed
  // on 2026-09-17 — see the refusal below the schema.
  KAS_MODE: z.enum(["mock", "birjoy"]).default("mock"),
  KAS_BIRJOY_URL: z.string().optional().default("http://127.0.0.1:4000/api/v1"),
  KAS_SERVICE_TOKEN: z.string().optional().default(""),
  // Shared secret for the 1067-taxi (B) → BirJoy (A) driver-OTP bridge. B sends
  // it in the X-Service-Token header; A's /api/internal/driver-otp route fails
  // CLOSED when this is empty (so the route is inert until the owner sets it on
  // the live env, matching B's SERVICE_TOKEN).
  TAXI_SERVICE_TOKEN: z.string().optional().default(""),
  // Bosqich 2: AES-256-GCM key (32 bytes / 64 hex chars) for encrypting driver kas secretKeys at
  // rest. Optional in DEV so typecheck/tests pass; driverAuth throws a clear error if used without
  // it in prod. Generate: openssl rand -hex 32. Render secret — NEVER commit a real value.
  DRIVER_KEY_AES: z.string().optional().default(""),

  // When "true", the bot actually dispatches taxis through the core. Default = dry-run (safe).
  BOOKING_LIVE: z.string().optional().default("false"),
  // When "true", the API trusts X-Debug-Telegram-Id even with a bot token (LOCAL admin/miniapp viewing only).
  ALLOW_DEBUG_AUTH: z.string().optional().default("false"),

  // 📣 Koson public channel (masalan XIZMATLAR haftalik digest): "-100…" id yoki "@username".
  // Bo'sh = post yo'q. Bot kanalga ADMIN qilib qo'shilishi shart (ega ops). Har initsiativa o'z
  // feature flagi bilan ham gate'lanadi.
  KOSON_CHANNEL_ID: z.string().optional().default(""),

  PORT: z.coerce.number().default(8080),
  PUBLIC_API_URL: z.string().default("http://localhost:8080"),
  // Production: set to the public HTTPS base (e.g. Render URL) to run the bot via webhook (no polling, survives free-tier sleep).
  WEBHOOK_URL: z.string().optional().default(""),
  WEBHOOK_SECRET: z.string().optional().default("hook"),
  SYNC_INTERVAL_MINUTES: z.coerce.number().default(15),
  DATABASE_URL: z.string().default("file:./dev.db"),
});

// A leftover KAS_MODE=live would otherwise surface as zod's generic enum error. Say what happened
// and what to set instead: the process is refusing to start, and whoever reads the log at that
// moment is in the middle of a deploy.
if (String(process.env.KAS_MODE ?? "").trim() === "live") {
  throw new Error(
    "KAS_MODE=live is no longer supported — kas1067 was removed on 2026-09-17. " +
      "Set KAS_MODE=birjoy with KAS_BIRJOY_URL and KAS_SERVICE_TOKEN (the taxi core's SERVICE_TOKEN).",
  );
}

const parsed = schema.parse(process.env);

export const env = {
  ...parsed,
  adminIds: parsed.ADMIN_TELEGRAM_IDS.split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  hasBot: parsed.BOT_TOKEN.length > 0,
  bookingLive: parsed.BOOKING_LIVE === "true",
  allowDebugAuth: parsed.ALLOW_DEBUG_AUTH === "true",
};

export type Env = typeof env;
