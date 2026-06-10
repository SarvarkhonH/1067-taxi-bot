import { webhookCallback, type Bot } from "grammy";
import { env } from "./env";
import { prisma } from "./db";
import { createApiServer } from "./api/server";
import { createBot, notifyCashback, notifyNewAchievements, setupBotCommands } from "./bot/bot";
import { refreshLinkedMembers, runSync } from "./sync/sync";
import { pushBookingUpdates } from "./services/bookingNotifier";
import { maybeSurpriseDrop, payWeeklyPrizes } from "./services/weeklyService";

async function main(): Promise<void> {
  let bot: Bot | null = null;
  const notifyBadges = async () => {
    if (bot) await notifyNewAchievements(bot);
  };

  // 1. startup data
  if (env.KAS_MODE === "mock") {
    try {
      const s = await runSync();
      console.log(`[sync] startup (mock): ${s.membersSeen} members`);
    } catch (e) {
      console.error("[sync] startup failed:", e instanceof Error ? e.message : e);
    }
  } else {
    console.log("[sync] live mode — on-demand per-user lookup, no bulk scan on kas1067.");
  }

  // 2. HTTP API for the Mini App + admin dashboard
  const app = createApiServer({ afterSync: notifyBadges });

  // 3. Telegram bot — webhook in production, long polling locally
  const webhookPath = `/tg/${env.WEBHOOK_SECRET}`;
  if (env.hasBot) {
    bot = createBot();
    if (env.WEBHOOK_URL) {
      app.use(webhookPath, webhookCallback(bot, "express"));
    }
  } else {
    console.log("[bot] BOT_TOKEN not set — bot disabled (API still runs).");
  }

  const server = app.listen(env.PORT, async () => {
    console.log(`[api] listening on http://localhost:${env.PORT}`);
    if (bot) {
      await setupBotCommands(bot);
      if (env.WEBHOOK_URL) {
        try {
          await bot.api.setWebhook(`${env.WEBHOOK_URL.replace(/\/$/, "")}${webhookPath}`, { drop_pending_updates: true });
          console.log(`[bot] webhook set → ${env.WEBHOOK_URL}${webhookPath}`);
        } catch (e) {
          console.error("[bot] setWebhook failed:", e instanceof Error ? e.message : e);
        }
      } else {
        void bot.start({ onStart: (i) => console.log(`[bot] @${i.username} polling`) });
      }
    }
  });

  // 4. periodic refresh (cashback + badges + weekly payout + surprise drops)
  const notifyUser = async (telegramId: string, html: string) => {
    if (bot) await bot.api.sendMessage(telegramId, html, { parse_mode: "HTML" });
  };
  const intervalMs = Math.max(1, env.SYNC_INTERVAL_MINUTES) * 60_000;
  const timer = setInterval(async () => {
    try {
      if (env.KAS_MODE === "live") {
        const { checked, deltas } = await refreshLinkedMembers();
        if (deltas.length) console.log(`[refresh] ${checked} users → ${deltas.length} cashback updates`);
        if (bot) {
          await notifyCashback(bot, deltas);
          await notifyNewAchievements(bot);
        }
        await payWeeklyPrizes(notifyUser).catch((e) => console.error("[weekly] payout failed:", e));
        await maybeSurpriseDrop(notifyUser).catch((e) => console.error("[surprise] failed:", e));
      } else {
        const s = await runSync();
        await notifyBadges();
        console.log(`[sync] mock: ${s.membersSeen} members`);
      }
    } catch (e) {
      console.error("[periodic] failed:", e instanceof Error ? e.message : e);
    }
  }, intervalMs);

  // real-time ride status: poll active bookings often, push status changes
  const bookingTimer =
    env.KAS_MODE === "live"
      ? setInterval(() => {
          if (bot) void pushBookingUpdates(bot).catch((e) => console.error("[booking] push failed:", e));
        }, 90_000)
      : null;

  // keep the free-tier instance warm (self-ping) so the Mini App never hits a cold start
  const keepAlive = env.WEBHOOK_URL
    ? setInterval(() => {
        void fetch(`${env.WEBHOOK_URL.replace(/\/$/, "")}/health`).catch(() => {});
      }, 10 * 60_000)
    : null;

  const shutdown = async () => {
    console.log("\n[server] shutting down…");
    clearInterval(timer);
    if (bookingTimer) clearInterval(bookingTimer);
    if (keepAlive) clearInterval(keepAlive);
    server.close();
    if (bot && !env.WEBHOOK_URL) await bot.stop();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
