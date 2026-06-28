import { webhookCallback, type Bot } from "grammy";
import { env } from "./env";
import { prisma } from "./db";
import { createApiServer } from "./api/server";
import { createBot, notifyCashback, notifyNewAchievements, setupBotCommands } from "./bot/bot";
import { refreshLinkedMembers, runSync } from "./sync/sync";
import { pushBookingUpdates } from "./services/bookingNotifier";
import { kasMapSocket } from "./services/kasMapSocket";
import { maybeSurpriseDrop, payWeeklyPrizes } from "./services/weeklyService";

// P0.4: orphaned SyncRun stuck in "running" (crash mid-sync) → mark error.
async function reapStaleSyncs(maxAgeMs: number): Promise<void> {
  const r = await prisma.syncRun.updateMany({
    where: { status: "running", startedAt: { lt: new Date(Date.now() - maxAgeMs) } },
    data: { status: "error", message: "abandoned (watchdog)", finishedAt: new Date() },
  });
  if (r.count) console.log(`[watchdog] reaped ${r.count} stale sync(s)`);
}

async function main(): Promise<void> {
  // T2: global xato tutqichlari — jim yiqilish o'rniga log + egaga alert (throttled 60s)
  let lastCrashAlert = 0;
  const onFatal = (kind: string) => (err: unknown) => {
    console.error(`[${kind}]`, err);
    const now = Date.now();
    if (now - lastCrashAlert > 60_000) {
      lastCrashAlert = now;
      void import("./services/economyService")
        .then(({ alertAdmins }) => alertAdmins(`🛑 Server xatosi (${kind}): ${err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200)}`))
        .catch(() => undefined);
    }
  };
  process.on("unhandledRejection", onFatal("unhandledRejection"));
  process.on("uncaughtException", onFatal("uncaughtException"));

  // one-shot: make sure the Kolleksiya catalog exists (idempotent upserts)
  {
    const { seedItemTypes } = await import("./services/itemService");
    await seedItemTypes().catch((e) => console.error("[items] seed failed:", e));
  }
  // P0.2 boot guard: never honor impersonation auth in a deployed (webhook) env.
  if (env.WEBHOOK_URL && env.allowDebugAuth) {
    console.error("[FATAL] ALLOW_DEBUG_AUTH=true in a deployed environment — refusing to start (impersonation risk).");
    process.exit(1);
  }
  // P0.2 boot guard: weak default secrets in deployed env (Render = WEBHOOK_URL set).
  // — WEBHOOK_SECRET hard-fails (we own the value; rotation is purely our side).
  // — KAS_BONUS_SECRET_KEY warns only (it must match what kas1067 expects; rotating
  //   requires coordination with kas1067 ops — a unilateral hard-fail would crash prod
  //   the moment Render forgets to set the env. The warning surfaces the leak risk
  //   without blocking startup).
  if (env.WEBHOOK_URL) {
    const WEAK_HOOK = new Set(["", "hook", "default", "secret", "test"]);
    if (WEAK_HOOK.has(env.WEBHOOK_SECRET)) {
      console.error("[FATAL] WEBHOOK_SECRET is default/weak in a deployed env — refusing to start.");
      console.error("   The webhook path /tg/<secret> becomes guessable. Set Render env WEBHOOK_SECRET=<long random>.");
      process.exit(1);
    }
    const KNOWN_LEAKED_KAS = new Set(["", "1303"]); // "1303" lives in PUBLIC env.ts default — rotate w/ kas1067 ops
    if (KNOWN_LEAKED_KAS.has(env.KAS_BONUS_SECRET_KEY)) {
      console.warn("⚠️  [WARN] KAS_BONUS_SECRET_KEY is the public-repo default — kas1067 bonus writes are forgeable.");
      console.warn("   Coordinate with kas1067 ops to rotate the secret, then set Render env KAS_BONUS_SECRET_KEY=<new>.");
    }
  }
  await reapStaleSyncs(60 * 60_000).catch(() => undefined); // boot cleanup (>1h)

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
  const sendTg = async (telegramId: string, html: string) => {
    if (bot) await bot.api.sendMessage(telegramId, html, { parse_mode: "HTML" });
  };
  const app = createApiServer({ afterSync: notifyBadges, sendMessage: sendTg });
  // economy alerts (withdraws, anomalies) → admins
  const { registerAdminNotifier } = await import("./services/economyService");
  registerAdminNotifier(sendTg);

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
          await bot.api.setWebhook(`${env.WEBHOOK_URL.replace(/\/$/, "")}${webhookPath}`, {
            drop_pending_updates: true,
            allowed_updates: ["message", "callback_query", "my_chat_member", "chat_member"],
          });
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
  let periodicBusy = false;
  let reconcileTick = 0;
  const timer = setInterval(async () => {
    if (periodicBusy) return; // skip if the previous tick is still running
    periodicBusy = true;
    try {
      if (env.KAS_MODE === "live") {
        const { checked, deltas } = await refreshLinkedMembers();
        if (deltas.length) console.log(`[refresh] ${checked} users → ${deltas.length} cashback updates`);
        if (bot) {
          await notifyCashback(bot, deltas);
          await notifyNewAchievements(bot);
        }
        await payWeeklyPrizes(notifyUser).catch(async (e) => {
          console.error("[weekly] payout failed:", e);
          const { alertAdmins } = await import("./services/economyService");
          await alertAdmins(`🛑 PUL-JOB yiqildi: payWeeklyPrizes — ${e instanceof Error ? e.message : String(e)}`).catch(() => undefined);
        });
        await maybeSurpriseDrop(notifyUser).catch((e) => console.error("[surprise] failed:", e));
        // T8: refresh the local daily rollup (today + yesterday) so week-over-week
        // metrics read from our DB, not impractically deep kas paging. No new poller.
        const { rollupRecentDays } = await import("./services/rollupService");
        await rollupRecentDays().catch((e) => console.error("[rollup] failed:", e));
        if (bot) {
          const { maybeDailyBackup } = await import("./services/backupService");
          await maybeDailyBackup(bot).catch((e) => console.error("[backup] failed:", e));
          const { maybeNightlySelfCheck } = await import("./services/selfCheck");
          await maybeNightlySelfCheck(bot).catch((e) => console.error("[selfcheck] failed:", e));
          const { settleShopsWeekly } = await import("./services/marketService");
          await settleShopsWeekly().catch(async (e) => {
            console.error("[bozor settle] failed:", e);
            const { alertAdmins } = await import("./services/economyService");
            await alertAdmins(`🛑 PUL-JOB yiqildi: settleShopsWeekly — ${e instanceof Error ? e.message : String(e)}`).catch(() => undefined);
          });
          {
            // T0.5 (AUDIT 3.3/3.8 + sellerpay): osilib qolgan pul-markerlarini qayta urish
            const { retryPendingMoney } = await import("./services/coinService");
            const r = await retryPendingMoney().catch((e) => {
              console.error("[pending] failed:", e);
              return null;
            });
            if (r && (r.wd || r.tp || r.stuck)) console.log(`[pending] retried wd=${r.wd} tp=${r.tp} stuck=${r.stuck}`);
          }
          const { dispatchScheduled } = await import("./services/scheduledService");
          await dispatchScheduled(bot).catch((e) => console.error("[sched] failed:", e));
          const { pushEngineTick, weeklyRecap } = await import("./services/notifyService");
          await pushEngineTick(bot).catch((e) => console.error("[push] failed:", e));
          await weeklyRecap(bot).catch((e) => console.error("[recap] failed:", e));
          // 🎁 promo campaigns: grant completions + nudge near-finishers (self-throttled ~hourly, gated by "promo")
          const { campaignTick } = await import("./services/campaignService");
          await campaignTick(bot).catch((e) => console.error("[promo] failed:", e));
          const { driverEngageTick } = await import("./services/driverEngageService");
          await driverEngageTick(bot).catch((e) => console.error("[drvpush] failed:", e));
          const { dispatchLinkReminders } = await import("./services/linkReminderService");
          await dispatchLinkReminders(bot).catch((e) => console.error("[linkReminder] failed:", e));
          const { recomputeDriverTiers } = await import("./services/analyticsService");
          await recomputeDriverTiers().catch((e) => console.error("[tiers] failed:", e));
          const { settleGapsWeekly } = await import("./services/gapService");
          if (new Date(Date.now() + 5 * 3600_000).getUTCDay() === 1) await settleGapsWeekly(bot).catch((e) => console.error("[gap] failed:", e));
        }
        await reapStaleSyncs(30 * 60_000).catch(() => undefined); // watchdog (>30min)
        if (reconcileTick++ % 12 === 0) {
          // money-integrity sweep ~ every 12 ticks (3h at 15min interval)
          const { reconciliationWatch } = await import("./services/reconciliation");
          await reconciliationWatch().catch((e) => console.error("[reconcile] failed:", e));
        }
      } else {
        const s = await runSync();
        await notifyBadges();
        console.log(`[sync] mock: ${s.membersSeen} members`);
      }
    } catch (e) {
      console.error("[periodic] failed:", e instanceof Error ? e.message : e);
    } finally {
      periodicBusy = false;
    }
  }, intervalMs);

  // ADAPTIVE self-scheduling sweep: fast (15s) while any ride is live so "driver found /
  // arrived / started / finished" pings land within ~15s, idle (90s) otherwise to spare kas.
  // ONE sweep (no new poller); ALWAYS re-schedules so it never stops. pushBookingUpdates
  // returns the count of live rides → drives the next delay.
  let bookingBusy = false;
  let bookingStopped = false;
  let bookingTimer: ReturnType<typeof setTimeout> | null = null;
  const tickBooking = async (): Promise<void> => {
    let active = 0;
    let awaitingDriver = 0;
    if (bot && !bookingBusy) {
      bookingBusy = true;
      try {
        ({ active, awaitingDriver } = await pushBookingUpdates(bot));
      } catch (e) {
        console.error("[booking] push failed:", e);
      } finally {
        bookingBusy = false;
      }
    }
    // 🚖 SMS-parity speed: while a rider is WAITING for a driver, poll every 5s so "Haydovchi
    // topildi" lands in seconds like the kas SMS. Assigned / in-trip → 15s (arrival is WS-instant).
    // Idle → 90s. One api/bookings call per tick regardless of ride count — cheap at any scale.
    const delay = awaitingDriver > 0 ? 5_000 : active > 0 ? 15_000 : 90_000;
    if (!bookingStopped) bookingTimer = setTimeout(() => void tickBooking(), delay);
  };
  if (env.KAS_MODE === "live") bookingTimer = setTimeout(() => void tickBooking(), 15_000);

  // 📡 kas map WebSocket — real-time driver positions → INSTANT "arrived" pings (no 15s wait)
  kasMapSocket.start();

  // keep the free-tier instance warm (self-ping) so the Mini App never hits a cold start. Render
  // free spins down after 15 min idle → ping every 5 min so even a single failed ping still beats
  // the threshold. NOTE: a self-ping can't WAKE a sleeping instance (its timers are suspended too);
  // for bulletproof uptime add an EXTERNAL pinger (UptimeRobot/cron-job.org → /health) or upgrade
  // to a paid Render plan.
  const keepAlive = env.WEBHOOK_URL
    ? setInterval(() => {
        void fetch(`${env.WEBHOOK_URL.replace(/\/$/, "")}/health`).catch(() => {});
      }, 5 * 60_000)
    : null;

  const shutdown = async () => {
    console.log("\n[server] shutting down…");
    clearInterval(timer);
    bookingStopped = true;
    if (bookingTimer) clearTimeout(bookingTimer);
    kasMapSocket.stop();
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
