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

  KAS_BASE_URL: z.string().default("http://46.8.176.53/kas1067"),
  KAS_MODE: z.enum(["mock", "live"]).default("mock"),
  KAS_USERNAME: z.string().optional().default(""),
  KAS_PASSWORD: z.string().optional().default(""),
  KAS_BONUS_SECRET_KEY: z.string().optional().default("1303"), // kas1067 bonus-edit secret
  // Bosqich 2: AES-256-GCM key (32 bytes / 64 hex chars) for encrypting driver kas secretKeys at
  // rest. Optional in DEV so typecheck/tests pass; driverAuth throws a clear error if used without
  // it in prod. Generate: openssl rand -hex 32. Render secret — NEVER commit a real value.
  DRIVER_KEY_AES: z.string().optional().default(""),

  KAS_DRIVERS_PATH: z.string().optional().default(""),
  // When "true", the bot actually dispatches taxis via kas1067. Default = dry-run (safe).
  BOOKING_LIVE: z.string().optional().default("false"),
  // When "true", the API trusts X-Debug-Telegram-Id even with a bot token (LOCAL admin/miniapp viewing only).
  ALLOW_DEBUG_AUTH: z.string().optional().default("false"),

  // 📣 Koson public channel (W1 №2 jackpot-shou): "-100…" id yoki "@username". Bo'sh = post yo'q.
  // Bot kanalga ADMIN qilib qo'shilishi shart (ega ops). Flag "jackpotpost" bilan ham gate'lanadi.
  KOSON_CHANNEL_ID: z.string().optional().default(""),

  PORT: z.coerce.number().default(8080),
  PUBLIC_API_URL: z.string().default("http://localhost:8080"),
  // Production: set to the public HTTPS base (e.g. Render URL) to run the bot via webhook (no polling, survives free-tier sleep).
  WEBHOOK_URL: z.string().optional().default(""),
  WEBHOOK_SECRET: z.string().optional().default("hook"),
  SYNC_INTERVAL_MINUTES: z.coerce.number().default(15),
  DATABASE_URL: z.string().default("file:./dev.db"),
});

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
