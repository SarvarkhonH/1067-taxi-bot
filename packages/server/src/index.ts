import { webhookCallback, type Bot } from "grammy";
import { env } from "./env";
import { prisma } from "./db";
import { createApiServer } from "./api/server";
import { createBot, notifyCashback, notifyNewAchievements, setupBotCommands } from "./bot/bot";
import { notifyOwnerCashout } from "./bot/cashout";
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
    const msg = err instanceof Error ? err.message : String(err);
    // grammY webhook reply timeout: NON-fatal. When a bot handler runs >10s, grammY abandons the
    // "answer via the webhook response" optimisation and falls back to a normal sendMessage. Telegram
    // already got its 200, so there is no retry/duplicate and the handler finishes in the background.
    // It surfaces here as an unhandledRejection — but alerting the owner on it is pure noise.
    // "query is too old": answerCallbackQuery on an expired/duplicate button tap (Telegram rejects
    // answers after ~15s or a bot restart). The tap's real work already ran; only the ack failed —
    // same noise category, so it must not page the owner either.
    // grammY "Network request for 'X' failed!" = a transient Telegram API connectivity blip
    // (common during a deploy/cold-start). Best-effort calls self-recover; paging the owner is noise.
    if (/(timed out after \d+ ms|webhook|query is too old|query ID is invalid|network request for)/i.test(msg)) return;
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
    if (!bot) return;
    try {
      await bot.api.sendMessage(telegramId, html, { parse_mode: "HTML" });
    } catch (e) {
      // 403 = user blocked/deactivated the bot → mark it so the admin can SEE who blocked
      // (cleared automatically the moment they interact again — see touchTelegramUser).
      const code = (e as { error_code?: number })?.error_code;
      if (code === 403 || /blocked|deactivated|forbidden/i.test(String((e as Error)?.message))) {
        await prisma.telegramUser.update({ where: { id: telegramId }, data: { blockedAt: new Date() } }).catch(() => undefined);
      }
      throw e; // keep existing callers' failure-counting behaviour intact
    }
  };
  const app = createApiServer({
    afterSync: notifyBadges,
    sendMessage: sendTg,
    // Mini-App cash-out → forward to the owner's Telegram (with approve/reject) via the bot.
    // Read `bot` at CALL time (like sendTg) — it's assigned below, after createApiServer runs.
    notifyCashoutOwner: async (notice) => {
      if (bot) await notifyOwnerCashout(bot, notice);
    },
    // 🛍 shop purchase → owner card with [✅ Yetkazildi]/[❌ Rad] (same bot-bound closure pattern)
    notifyShopOwner: async (notice) => {
      if (bot) await (await import("./bot/shop")).notifyOwnerShop(bot, notice);
    },
    // 🔎 self-submitted service listing → owner moderation card [✅ Tasdiqlash]/[❌ Rad]
    notifyServiceOwner: async (notice) => {
      if (bot) await (await import("./bot/xizmatlar")).notifyOwnerService(bot, notice);
    },
    // 🔎 unmet-demand request ("topilmadi") → owner info card (recruiting signal, no buttons)
    notifyServiceDemand: async (notice) => {
      if (bot) await (await import("./bot/xizmatlar")).notifyOwnerDemand(bot, notice);
    },
    // 📋 new pending e'lon → owner moderation card [✅ Chiqarish]/[❌ Rad]
    notifyElonlarOwner: async (notice) => {
      if (bot) await (await import("./bot/elonlar")).notifyOwnerElonlar(bot, notice);
    },
  });
  // economy alerts (withdraws, anomalies) → admins
  const { registerAdminNotifier } = await import("./services/economyService");
  registerAdminNotifier(sendTg);
  // 📣 W1 №2: public-channel sender (jackpot wins + Monday digest). Same sendTg — a channel id is
  // just a chat id. Double-gated inside (KOSON_CHANNEL_ID env + "jackpotpost" flag).
  const { registerChannelSender } = await import("./services/channelService");
  registerChannelSender(sendTg);

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

  // A7 (audit P0): flag ground-truth at boot. Flags exist only as DB rows — a reseeded DB silently
  // reverts every owner-accepted feature to OFF. Log the effective state + alert on any expected-ON
  // flag reading off. A3: also surface unresolved kas-write "sent" markers (crash mid real-money
  // write) — those members' cash door is blocked until the owner resolves what kas actually did.
  void (async () => {
    try {
      const { reconcileFlags } = await import("./services/featureFlags");
      const { missing, effective } = await reconcileFlags();
      console.log("[flags] " + effective.map((x) => `${x.on ? "+" : "-"}${x.name}`).join(" "));
      const { alertAdmins } = await import("./services/economyService");
      if (missing.length) {
        await alertAdmins(`⚠️ <b>Flag-audit (boot):</b> kutilgan ON flaglar O'CHIQ: <b>${missing.join(", ")}</b>\nDB reset bo'lganmi? setFlag.ts bilan qaytaring yoki EXPECTED_ON ro'yxatini yangilang.`).catch(() => undefined);
      }
      const stuck = await prisma.appState.findMany({
        where: { OR: [{ key: { startsWith: "pending:wdsent:" } }, { key: { startsWith: "pending:admmove:" } }] },
        select: { key: true, value: true },
      });
      if (stuck.length) {
        const lines = stuck.map((s) => `<code>${s.key}</code> ${s.value.slice(0, 60)}`).join("\n");
        await alertAdmins(`⚠️ <b>NOANIQ kas-yozuvlar (boot):</b> ${stuck.length} ta — kas balansini tekshirib clearPending.ts bilan yeching:\n${lines}`).catch(() => undefined);
      }
    } catch (e) {
      console.error("[flags] boot reconcile failed:", e);
    }
  })();
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
          const { driverEngageTick, driverQrWeeklyTick } = await import("./services/driverEngageService");
          await driverEngageTick(bot).catch((e) => console.error("[drvpush] failed:", e));
          await driverQrWeeklyTick(bot).catch((e) => console.error("[drvrank] failed:", e));
          const { dispatchLinkReminders } = await import("./services/linkReminderService");
          await dispatchLinkReminders(bot).catch((e) => console.error("[linkReminder] failed:", e));
          const { recomputeDriverTiers } = await import("./services/analyticsService");
          await recomputeDriverTiers().catch((e) => console.error("[tiers] failed:", e));
          // 0.3 sweep-diet: tier-loyalty daily pass moved here from the 5-90s booking sweep — it's a
          // per-DAY mechanic; the in-memory guard makes every tick after the day's first ~free.
          const { runTierLoyaltyDailyAll } = await import("./services/tierLoyaltyService");
          await runTierLoyaltyDailyAll(bot).catch((e) => console.error("[tierdaily] failed:", e));
          const { settleGapsWeekly } = await import("./services/gapService");
          if (new Date(Date.now() + 5 * 3600_000).getUTCDay() === 1) await settleGapsWeekly(bot).catch((e) => console.error("[gap] failed:", e));
        }
        await reapStaleSyncs(30 * 60_000).catch(() => undefined); // watchdog (>30min)
        {
          // V-NEXT #3: daily AppState marker TTL (per-ride idempotency rows >30d) — self-gated once/day
          const { maybeDailyMarkerCleanup } = await import("./services/appStateUtil");
          await maybeDailyMarkerCleanup().catch((e) => console.error("[cleanup] failed:", e));
        }
        {
          // 📣 W1 №2: Monday channel digest (self-gated once/ISO-Monday; no-op while flag/env off)
          const { maybeWeeklyChannelDigest, maybeWeeklyServicesDigest } = await import("./services/channelService");
          await maybeWeeklyChannelDigest().catch((e) => console.error("[channel] digest failed:", e));
          // 🔎 XIZMATLAR P4: same tick, own flag+marker — killing one never silences the other
          await maybeWeeklyServicesDigest().catch((e) => console.error("[channel] services digest failed:", e));
        }
        {
          // 📋 E'LONLAR E3: 2-soatlik moderatsiya SLA eslatma — self-throttled marker, no new poller
          const { elonlarSlaTick, elonlarLifecycleTick } = await import("./services/classifiedService");
          await elonlarSlaTick().catch((e) => console.error("[elonlar] sla tick failed:", e));
          // E4 §7: expiry batch + 2-kun-oldin ogohlantirish + 3-kunlik "sotildimi?" push (bot bo'lmasa ham DB-batch ishlaydi)
          await elonlarLifecycleTick(bot ?? undefined).catch((e) => console.error("[elonlar] lifecycle tick failed:", e));
        }
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
    // ⚠️ early-warning: ride the frequent booking tick (no new poller) to surface a kas 429/login
    // spike to the owner in seconds — long before it cascades into failed bookings. Cheap: reads
    // in-memory counters fed passively by the kas getText chokepoint.
    if (bot) {
      const { maybeAlertKasHealth } = await import("./services/kasHealth");
      const { alertAdmins } = await import("./services/economyService");
      await maybeAlertKasHealth(alertAdmins).catch(() => undefined);
      // 🍽 RESTORAN R3 SLA-sweep (D4/D5: yangi poller YO'Q — mavjud booking tick'iga qo'shildi).
      // kas'ga umuman bog'liq emas — faqat 3+ daq javobsiz FoodOrder'larni operatorlarga eslatadi.
      const { checkRestoranSlaAndAlert } = await import("./services/restoranService");
      await checkRestoranSlaAndAlert(alertAdmins).catch((e) => console.error("[restoran-sla] failed:", e));
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

  // ⚡ instant-status: give the client-socket the bot so a status-change frame can trigger a scoped
  // sweep (armed per-ride at booking creation via armInstant; feature "instantstatus").
  if (bot) {
    const { kasClientSocket } = await import("./services/kasClientSocket");
    kasClientSocket.setBot(bot);
  }

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
