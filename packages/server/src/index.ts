import { webhookCallback, type Bot } from "grammy";
import { env } from "./env";
import { prisma } from "./db";
import { createApiServer } from "./api/server";
import { createBot, notifyNewAchievements, setupBotCommands } from "./bot/bot";
import { notifyOwnerCashout } from "./bot/cashout";
import { runSync } from "./sync/sync";
import { pushBookingUpdates } from "./services/bookingNotifier";
import { maybeSurpriseDrop, payWeeklyPrizes } from "./services/weeklyService";
import { bookingTickDelay, formatNumber, sweepLoop } from "@t1067/shared";
import { coreStreamHealthy, ensureCoreStream, setCoreStreamRecheck, setCoreStreamWake } from "./services/coreStream";
import { attachRideSocket, recheckRideClients } from "./api/rideSocket";
import { featureOn } from "./services/featureFlags";

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
  // P0.2 boot guard: weak default secrets in deployed env (WEBHOOK_URL set).
  // WEBHOOK_SECRET hard-fails (we own the value; rotation is purely our side).
  if (env.WEBHOOK_URL) {
    const WEAK_HOOK = new Set(["", "hook", "default", "secret", "test"]);
    if (WEAK_HOOK.has(env.WEBHOOK_SECRET)) {
      console.error("[FATAL] WEBHOOK_SECRET is default/weak in a deployed env — refusing to start.");
      console.error("   The webhook path /tg/<secret> becomes guessable. Set env WEBHOOK_SECRET=<long random>.");
      process.exit(1);
    }
    // A deployed bot on the mock taxi source would show every passenger invented drivers; one with no
    // service token would have every call to the core refused while looking up and running.
    if (env.KAS_MODE !== "birjoy") {
      console.error("[FATAL] KAS_MODE is not 'birjoy' in a deployed environment — refusing to start on mock taxi data.");
      process.exit(1);
    }
    if (!env.KAS_SERVICE_TOKEN) {
      console.error("[FATAL] KAS_SERVICE_TOKEN is empty — the taxi core would refuse every call. Set it to the core's SERVICE_TOKEN.");
      process.exit(1);
    }
  }
  await reapStaleSyncs(60 * 60_000).catch(() => undefined); // boot cleanup (>1h)
  // 🚫 arm the hard-ban gate BEFORE the server accepts traffic — the bot + API check an in-memory
  // set that must be populated from the DB at boot (a restart would otherwise let banned users back
  // in until the first toggle re-seeds it).
  try {
    const { loadBans } = await import("./services/banService");
    const n = await loadBans();
    console.log(`[ban] hard-ban gate armed — ${n} banned tg id(s)`);
  } catch (e) {
    console.error("[ban] loadBans failed:", e instanceof Error ? e.message : e);
  }

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
    console.log("[taxi] source: taxi core (1067-taxi) — members are matched on demand by phone.");
    // Touch the taxi core once at boot, off the request path, so a wrong URL or token shows up in
    // the log (and the health monitor) at deploy time instead of on the first passenger's order.
    // Fire-and-forget: failures are irrelevant, the normal read path refetches.
    void (async () => {
      try {
        const { getDataSource } = await import("./kas");
        const ds = getDataSource();
        const results = await Promise.allSettled([ds.getCompanyInfo(), ds.getServiceArea(), ds.getBookingAddons()]);
        const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
        if (failed.length === 0) console.log("[taxi] core reachable at boot");
        else console.error(`[taxi] core NOT reachable at boot (${failed.length}/3 failed): ${String(failed[0]!.reason).slice(0, 160)}`);
      } catch (e) {
        console.error("[taxi] core check at boot failed:", e instanceof Error ? e.message : e);
      }
    })();
  }

  // 2. HTTP API for the Mini App + admin dashboard
  const sendTg = async (telegramId: string, html: string) => {
    if (!bot) return;
    try {
      await bot.api.sendMessage(telegramId, html, { parse_mode: "HTML" });
    } catch (e) {
      // 403 = user blocked/deactivated the bot → mark it so the admin can SEE who blocked
      // (cleared automatically the moment they interact again — see touchTelegramUser).
      // BLK-1: aniqlash + yozish endi bitta joyda (pushSend) — broadcast/API yo'li ham
      // xuddi push'lar kabi BlockEvent tarixiga tushadi.
      const { isBlockError, recordBlock } = await import("./services/pushSend");
      if (isBlockError(e)) await recordBlock(telegramId, "api_send");
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
    // 🧺 V2: savat-buyurtma → seller+ega karta [✅ Qabul][🚚][✔][❌] (bot-bound closure)
    notifyMarketOrder: async (notice) => {
      if (bot) await (await import("./bot/market")).notifyMarketOrderCard(bot, notice);
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
    // 🍽 restoran ulanishlari 2026-08-15 da olib tashlandi — tab endi hamkorning tashqi
    // mini-appiga eshik, buyurtma bizda YARATILMAYDI, demak yuboradigan xabar ham yo'q.
    // 🎀 yangi Ravella buyurtmasi → HAMKOR kartasi [✅ Qabul][☎️ Bog'landim][✔ Bajarildi][❌ Rad] (+ega CC)
    notifyRavellaPartner: async (notice) => {
      if (bot) await (await import("./bot/ravella")).notifyRavellaPartner(bot, notice);
    },
    // 🎀 holat o'zgardi → mijozga push (done'da berilgan tanga summasi bilan)
    notifyRavellaCustomer: async (notice) => {
      if (bot) await (await import("./bot/ravella")).notifyRavellaCustomer(bot, notice);
    },
  });
  // economy alerts (withdraws, anomalies) → admins
  const { registerAdminNotifier } = await import("./services/economyService");
  registerAdminNotifier(sendTg);
  // 📣 public-channel sender (e.g. XIZMATLAR weekly digest). Same sendTg — a channel id is
  // just a chat id. Gated inside per-caller (KOSON_CHANNEL_ID env + its own feature flag).
  const { registerChannelSender } = await import("./services/channelService");
  registerChannelSender(sendTg);

  // 3. Telegram bot — webhook in production, long polling locally
  const webhookPath = `/tg/${env.WEBHOOK_SECRET}`;
  if (env.hasBot) {
    bot = createBot();
    // AI providers (restoran owner-notice va h.k.) chuqur servislardan alert yuborishi uchun
    (await import("./botInstance")).setBotInstance(bot);
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
      // 2026-07-25 migration lesson: a restart while the previous process's long-poll is
      // still open Telegram-side answers 409 ("terminated by other getUpdates"). Both
      // branches used to give up after ONE failure — the service stayed `active`, /health
      // still said ok, and the bot silently received nothing until someone noticed. Both
      // now retry with backoff, and the LAST failure is alerted so silence can't hide it.
      const RETRIES = 6;
      const backoff = (n: number): Promise<void> => new Promise((r) => setTimeout(r, Math.min(30_000, 5_000 * 2 ** n)));
      const alertFatal = async (what: string, msg: string): Promise<void> => {
        console.error(`[bot] ${what} gave up: ${msg}`);
        const { alertAdmins } = await import("./services/economyService");
        await alertAdmins(`🛑 <b>Bot ${what} ${RETRIES} urinishdan keyin ham ishlamadi:</b> ${msg}\nBot xabar QABUL QILMAYAPTI — server restart kerak.`).catch(() => undefined);
      };

      if (env.WEBHOOK_URL) {
        const url = `${env.WEBHOOK_URL.replace(/\/$/, "")}${webhookPath}`;
        const allowed = ["message", "callback_query", "my_chat_member", "chat_member"] as const;
        const BOOT_OPTS = { drop_pending_updates: true, allowed_updates: allowed } as const;
        const HEAL_OPTS = { drop_pending_updates: false, allowed_updates: allowed } as const; // mid-run: keep queued msgs
        // 2026-08-16 hodisa: Spaceship DNS oraliq SERVFAIL berdi. Bot yiqilishining IKKI shakli bor —
        // (1) boot'da setWebhook yiqilishi, (2) bot SOG'LOM ishlab turганда webhook keyin o'lishi
        // (o'sha kuni AYNAN shunday bo'ldi). Shuning uchun: boot'da tez o'rnatamiz, SO'NG holatdan
        // qat'i nazar har 5 daqiqada getWebhookInfo bilan kuzatamiz va nosozlikni O'ZI tuzatadi.
        void (async () => {
          let bootOk = false;
          for (let i = 0; i < RETRIES; i++) {
            try {
              await bot.api.setWebhook(url, BOOT_OPTS);
              console.log(`[bot] webhook set → ${url}`);
              bootOk = true;
              break;
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              console.error(`[bot] setWebhook failed (${i + 1}/${RETRIES}): ${msg}`);
              if (i === RETRIES - 1) {
                console.error(`[bot] webhook tez urinishlarda ${RETRIES}× yiqildi — fon kuzatuviga o'tamiz`);
                const { alertAdmins } = await import("./services/economyService");
                await alertAdmins(
                  `⚠️ <b>Bot webhook hali o'rnatilmadi</b> (${RETRIES}× urinish yiqildi): ${msg}\n` +
                    `Sabab ehtimol DNS. Har 5 daqiqada o'zim kuzatib qayta urinaman — tuzalishi bilan O'ZI tiklanadi (restart shart emas).`,
                ).catch(() => undefined);
              } else {
                await backoff(i);
              }
            }
          }
          // ── STEADY-STATE WATCHDOG — HAR DOIM armlanadi (boot muvaffaqiyatidan qat'i nazar), chunki
          // hodisaning asl shakli mid-run webhook o'limi edi. Faqat nosozlikda harakat qiladi: url
          // o'zgargan / last_error bor / bo'sh bo'lsa qayta o'rnatadi. Nosozlik→tuzalish o'tishida
          // BITTADAN alert (spam yo'q). getWebhookInfo'ning o'zi yiqilsa (DNS) — keyingi tsiklga o'tamiz.
          let lastHealthy = bootOk;
          setInterval(() => {
            void (async () => {
              const info = await bot.api.getWebhookInfo().catch(() => null);
              if (!info) return; // getWebhookInfo yiqildi (DNS?) — yolg'on alert bermaymiz, keyingi tsikl
              const healthy = info.url === url && !info.last_error_message;
              if (healthy) {
                if (!lastHealthy) {
                  const { alertAdmins } = await import("./services/economyService");
                  await alertAdmins(`✅ <b>Bot webhook tiklandi</b> — xabar qabul qilinmoqda.`).catch(() => undefined);
                }
                lastHealthy = true;
                return;
              }
              const wasHealthy = lastHealthy;
              lastHealthy = false;
              try {
                await bot.api.setWebhook(url, HEAL_OPTS);
                console.log(`[bot] webhook re-set by watchdog → ${url}`);
              } catch { /* hali yomon oyna — keyingi 5 daqiqada yana */ }
              if (wasHealthy) {
                const { alertAdmins } = await import("./services/economyService");
                await alertAdmins(
                  `⚠️ <b>Bot webhook nosoz aniqlandi</b> (${info.last_error_message || "bo'sh/o'zgargan url"}) — qayta o'rnatyapman, fonda kuzataman.`,
                ).catch(() => undefined);
              }
            })();
          }, 5 * 60_000);
        })();
      } else {
        void (async () => {
          for (let i = 0; i < RETRIES; i++) {
            try {
              // Resolves only when polling stops; a 409 rejects and we retry after backoff.
              await bot.start({ onStart: (info) => console.log(`[bot] @${info.username} polling`) });
              return;
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              console.error(`[bot] polling failed (${i + 1}/${RETRIES}): ${msg}`);
              if (i === RETRIES - 1) { await alertFatal("polling", msg); return; }
              await backoff(i);
            }
          }
        })();
      }
    }
  });

  // 🚕 B qism P0-4: the passenger's ride socket (/api/ride-ws) on the same HTTP server. Flag
  // `corestream`, or the owner's preview; a closed flag answers 4403 and the Mini App keeps polling.
  attachRideSocket(server, async (tgId) => (await featureOn("corestream")) || env.adminIds.includes(tgId));

  // 4. periodic refresh (cashback + badges + weekly payout + surprise drops)
  // Haftalik yutuq / kutilmagan sovg'a / cashback xabarlari. BLK-1: 403 yozib olinadi, lekin
  // xato AVVALGIDEK yuqoriga tashlanadi — chaqiruvchilarning xatti-harakati o'zgarmaydi.
  const notifyUser = async (telegramId: string, html: string) => {
    if (!bot) return;
    try {
      await bot.api.sendMessage(telegramId, html, { parse_mode: "HTML" });
    } catch (e) {
      const { isBlockError, recordBlock } = await import("./services/pushSend");
      if (isBlockError(e)) await recordBlock(telegramId, "reward");
      throw e;
    }
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
  // 👔 JAMOA eslatmalari — DAQIQA aniqligida ("vaxtiga eslatsin", ega 2026-08-01).
  // Bu kas'ga tegmaydigan, faqat lokal-DB o'qiydigan yengil soat: jamoa flag OFF
  // bo'lsa birinchi query'dayoq qaytadi; marker'lar dublikatni oldini oladi.
  // (15-daq tick ichida turganda eslatma 15 daqiqagacha kechikardi.)
  let staffRemindBusy = false;
  setInterval(async () => {
    if (!bot || staffRemindBusy) return;
    staffRemindBusy = true;
    try {
      const { staffRemindersTick } = await import("./services/staffService");
      await staffRemindersTick(bot);
    } catch (e) {
      console.error("[staff] remind failed:", e);
    } finally {
      staffRemindBusy = false;
    }
  }, 60_000);
  let periodicBusy = false;
  let reconcileTick = 0;
  let periodicFails = 0; // 2026-08-16 audit: throttled alert on repeated periodic-tick aborts
  const timer = setInterval(async () => {
    if (periodicBusy) return; // skip if the previous tick is still running
    periodicBusy = true;
    try {
      // Every job in this tick runs whatever the taxi source is. Until 2026-09-17 the whole block
      // sat behind a kas1067-only mode check, so switching to our own core would have
      // silently stopped backups, money recovery, weekly prizes and the rest with no error at all.
      {
        if (env.KAS_MODE === "mock") {
          // offline development only: seed/refresh the demo members
          const s = await runSync().catch((e) => {
            console.error("[sync] mock failed:", e instanceof Error ? e.message : e);
            return null;
          });
          if (s) console.log(`[sync] mock: ${s.membersSeen} members`);
        }
        // 2026-08-16 audit: isolated so one failure can't abort the whole tick.
        try {
          const { evaluateAchievements } = await import("./sync/sync");
          await evaluateAchievements();
          if (bot) await notifyNewAchievements(bot);
        } catch (e) {
          console.error("[achievements/notify] failed:", e instanceof Error ? e.message : e);
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
            if (r && (r.wd || r.tp || r.shopcb || r.stuck)) console.log(`[pending] retried wd=${r.wd} tp=${r.tp} shopcb=${r.shopcb} stuck=${r.stuck}`);
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
          // 🎮 KOSON O'YINI — haftalik sprint-baholash (o'z-ichida idempotent: hafta almashmaguncha
          // no-op) + mavsum-yopilish (ichkarida SEASON_END-darvozasi bor). Ikkalasi ham flag
          // "oyin" ichida gated.
          const { sprintCheck, seasonClose, seasonWarningTick, seasonCloseNotify, seasonDrawNotify, cardMemoryTick } = await import("./services/oyinService");
          await sprintCheck().catch((e) => console.error("[oyin] sprintCheck failed:", e));
          // 🔔 Mavsum yakuni xabarnoma zanjiri (2026-08-12, ega talabi) — yangi poller YO'Q,
          // hammasi shu mavjud tikka qo'shildi. Tartib ahamiyatsiz: har funksiya o'z holatini
          // (mavsum fazasi + durable marker) o'zi tekshiradi, bir-biriga bog'liq emas.
          await seasonWarningTick(bot).catch((e) => console.error("[oyin] seasonWarningTick failed:", e));
          await seasonDrawNotify(bot).catch((e) => console.error("[oyin] seasonDrawNotify failed:", e));
          // 🗓 K7 — "Xotira" eslatmasi (mavsumdan mustaqil, o'zining doimiy markeri bilan)
          await cardMemoryTick(bot).catch((e) => console.error("[oyin] cardMemoryTick failed:", e));
          const oyinClose = await seasonClose().catch((e) => { console.error("[oyin] seasonClose failed:", e); return null; });
          await seasonCloseNotify(bot).catch((e) => console.error("[oyin] seasonCloseNotify failed:", e));
          if (oyinClose && oyinClose.convertedCount > 0) {
            const { alertAdmins } = await import("./services/economyService");
            // ⚠️ Matn 2026-08-03 da TUZATILDI. Avval "jami ${totalTanga} tanga berildi" deb yozardi —
            // ega har mavsum yopilishida shu satrni ko'rardi va u YOLG'ON edi: ball→tanga
            // konvertatsiyasi ega qarori bilan OLIB TASHLANGAN (`seasonClose` endi `grantCoins`
            // umuman chaqirmaydi, `totalTanga` doim 0). Sarflanmagan ball mavsum oxirida KUYADI.
            await alertAdmins(
              `🎮 <b>BirJoy O'yinlar Mavsumi yopildi</b>\n\n` +
              `${oyinClose.convertedCount} a'zoning sarflanmagan balli kuydi (tanga TO'LANMAYDI — ` +
              `konvertatsiya olib tashlangan). Chipta ro'yxati tirajga tayyor.`,
            ).catch(() => undefined);
          }
          const { settleGapsWeekly } = await import("./services/gapService");
          if (new Date(Date.now() + 5 * 3600_000).getUTCDay() === 1) await settleGapsWeekly(bot).catch((e) => console.error("[gap] failed:", e));
          // 👔 JAMOA J4: unutilgan "Ketdim"larni avto-yopish + 21:00 dan keyin har korxona
          // egasiga BITTA kechki xulosa (AppState marker, muvaffaqiyatda) — jamoa flag ichkarida.
          const { staffDailyTick } = await import("./services/staffService");
          await staffDailyTick(bot).catch((e) => console.error("[staff] failed:", e));
        }
        await reapStaleSyncs(30 * 60_000).catch(() => undefined); // watchdog (>30min)
        {
          // V-NEXT #3: daily AppState marker TTL (per-ride idempotency rows >30d) — self-gated once/day
          const { maybeDailyMarkerCleanup } = await import("./services/appStateUtil");
          await maybeDailyMarkerCleanup().catch((e) => console.error("[cleanup] failed:", e));
        }
        {
          // 🔎 XIZMATLAR P4: Monday channel digest (self-gated once/ISO-Monday; no-op while flag/env off)
          const { maybeWeeklyServicesDigest } = await import("./services/channelService");
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
      }
      periodicFails = 0; // tick completed without throwing — clear the failure streak
    } catch (e) {
      console.error("[periodic] failed:", e instanceof Error ? e.message : e);
      // 2026-08-16 audit: this catch used to be console-only, so a persistent failure here
      // (e.g. Postgres down) silently froze ALL background money/backup jobs with no owner signal.
      // Alert on the 1st failure and then ~every 3h so a sustained outage can't hide.
      periodicFails += 1;
      if (periodicFails === 1 || periodicFails % 12 === 0) {
        const { alertAdmins } = await import("./services/economyService");
        await alertAdmins(
          `🛑 <b>Periodic tick yiqildi</b> (${periodicFails}× ket-ket): ${e instanceof Error ? e.message : String(e)}\n` +
            `Ehtimol DB uzilishi — fon joblar (pul-tiklash, zaxira, self-check) to'xtagan bo'lishi mumkin.`,
        ).catch(() => undefined);
      }
    } finally {
      periodicBusy = false;
    }
  }, intervalMs);

  // ADAPTIVE self-scheduling sweep: fast (15s) while any ride is live so "driver found /
  // arrived / started / finished" pings land within ~15s, idle (90s) otherwise to spare kas.
  // ONE sweep (no new poller); ALWAYS re-schedules so it never stops. pushBookingUpdates
  // returns the count of live rides → drives the next delay.
  let bookingBusy = false;
  // 🚕 corestream has two steps, so the owner accepts it on a real phone before anyone else gets it:
  //   · preview (flag off): the stream is on wherever the core allows it, but it wakes the sweep only
  //     for the owner's own rides and the sweep keeps yesterday's 5 s / 15 s — customers see nothing new
  //   · on (flag on): it wakes the sweep for every linked passenger, and the sweep becomes a safety net
  let streamEveryone = false;
  const linkedTail = async (tail9: string): Promise<boolean> =>
    (await prisma.member.count({ where: { phone: { endsWith: tail9 }, telegramUser: { isNot: null } } })) > 0;
  // Preview: the owner's phones, read once per 10 min — not a database query on every order in town.
  let ownerTails: { at: number; set: Set<string> } = { at: 0, set: new Set() };
  const ownerTail = async (tail9: string): Promise<boolean> => {
    if (!env.adminIds.length) return false;
    if (Date.now() - ownerTails.at > 10 * 60_000) {
      const rows = await prisma.member.findMany({ where: { telegramUser: { is: { id: { in: env.adminIds } } } }, select: { phone: true } });
      ownerTails = { at: Date.now(), set: new Set(rows.map((r) => (r.phone ?? "").replace(/\D/g, "").slice(-9)).filter((t) => t.length === 9)) };
    }
    return ownerTails.set.has(tail9);
  };
  const checkCoreStream = (): Promise<void> =>
    featureOn("corestream")
      .then(async (on) => {
        const wasOn = streamEveryone;
        streamEveryone = on;
        // Flag off: in preview the stream stays up (the owner keeps testing), so nobody hears "down" —
        // let every passenger who is no longer allowed go, and their Mini App polls every 3 s again.
        // First, so a failure connecting the stream can never skip it.
        if (wasOn && !on) await recheckRideClients().catch((e) => console.error("[ride-ws] recheck failed:", e));
        await ensureCoreStream({ enabled: on || env.adminIds.length > 0, linked: on ? linkedTail : ownerTail });
      })
      .catch((e) => console.error("[core] stream check failed:", e));
  // One log line whenever the sweep changes pace (D4.7) — the stream's own lines say joined/lost,
  // but in preview the pace does not follow them.
  let paceNet: boolean | null = null;
  const pacedHealthy = (): boolean => {
    const net = streamEveryone && coreStreamHealthy();
    if (net !== paceNet) {
      if (paceNet !== null || net) console.log(net ? "[booking] sweep is a safety net now (20 s / 30 s): the core's stream wakes it" : "[booking] sweep back to 5 s / 15 s");
      paceNet = net;
    }
    return net;
  };
  const tickBody = async (): Promise<{ active: number; awaitingDriver: number }> => {
    let active = 0;
    let awaitingDriver = 0;
    // Connect / disconnect the stream to match its flag. Never awaited into the sweep's timing.
    void checkCoreStream();
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
    // ⚠️ early-warning: ride the frequent booking tick (no new poller) to surface a sick taxi core
    // to the owner in seconds — long before passengers notice. Cheap: reads in-memory counters fed
    // passively by the core chokepoint (kas/birjoy.ts request).
    if (bot) {
      const { maybeAlertCoreHealth } = await import("./services/taxiHealth");
      const { alertAdmins } = await import("./services/economyService");
      await maybeAlertCoreHealth(alertAdmins).catch(() => undefined);
      // 🍽 RESTORAN SLA-sweep 2026-08-15 da olib tashlandi (bizda kutadigan buyurtma yo'q).
      // 🎀 RAVELLA SLA-sweep — bir xil naqsh (yangi poller YO'Q): hamkor javob bermagan
      // buyurtmalar egaga BIR marta eslatiladi (`slaAlertedAt`). Flag OFF → funksiya darhol qaytadi.
      const { checkRavellaSlaAndAlert } = await import("./services/ravellaService");
      await checkRavellaSlaAndAlert(alertAdmins).catch((e) => console.error("[ravella-sla] failed:", e));
      // 🏪 BirJoy V1.5 SLA-sweep — restoran naqshi (yangi poller YO'Q): 15+ daq javobsiz
      // ShopPurchase'lar egaga BIR marta eslatiladi (slaAlertedAt idempotent-marker).
      const { checkShopSlaAndAlert } = await import("./services/shopService");
      // Eslatma endi javob bermagan SOTUVCHIGA ham boradi (avval faqat adminlar bilardi) —
      // `slaAlertedAt` markeri tufayli har buyurtmaga aynan bitta, spam yo'q.
      await checkShopSlaAndAlert(alertAdmins, async (n) => {
        await (await import("./bot/market")).remindMarketOrderPending(bot, n);
      }).catch((e) => console.error("[shop-sla] failed:", e));
      // ⏳ Javobsiz savat-buyurtmani avtomatik yopish + tanga qaytarish (flag `mktexpire`, OFF
      // bo'lsa darrov [] qaytadi). Mijozga har doim sabab bilan xabar boradi — jim qaytarish yo'q.
      const { expireStaleMarketOrders } = await import("./services/marketOrderService");
      const expired = await expireStaleMarketOrders().catch((e) => { console.error("[mkt-expire] failed:", e); return []; });
      for (const x of expired) {
        const tgu = await prisma.telegramUser.findFirst({ where: { memberId: x.memberId }, select: { id: true } }).catch(() => null);
        if (tgu) {
          const money = x.payKind === "cash" ? "Hech qanday pul olinmagan." : `✅ <b>${formatNumber(x.total)} tanga hisobingizga qaytarildi.</b>`;
          // pul qaytgani haqidagi xabar — tranzaksion, force (BLK-1)
          const { pushMessage } = await import("./services/pushSend");
          await pushMessage(bot, tgu.id, "mkt_expire", `⏳ <b>Buyurtma bekor qilindi</b>\n🏬 ${x.shopName}\nDo'kon vaqtida javob bermadi.\n${money}`, { memberId: x.memberId, force: true });
        }
        await alertAdmins(`⏳ <b>Avto-bekor</b> (javobsiz): 🧺 #${x.orderId} · ${x.shopName}`).catch(() => undefined);
      }
      // §10.2: javobsiz-chat ogohlantirish — xuddi shu tick, yangi poller YO'Q
      const { checkUnansweredChatsAndAlert } = await import("./services/shopChatService");
      await checkUnansweredChatsAndAlert(alertAdmins).catch((e) => console.error("[chat-sla] failed:", e));
      // 🔔 AI eslatmalar (airemind, yangi poller YO'Q): ≤90s aniqlikda yetkazish — bitta indeksli
      // Postgres so'rov/iteratsiya, kas'ga 0 so'rov, claim-first (dispatchScheduled naqshi).
      const { deliverDueReminders } = await import("./services/ai/reminderService");
      await deliverDueReminders(bot).catch((e) => console.error("[reminder] deliver failed:", e));
      // 💡 Needs Engine (aineeds, yangi poller YO'Q): proaktiv shaxsiy taklif — o'z guardrail'i
      // (kunlik 2 + haftalik 2 + opt-out + tun-soatlari + tor oyna) ichida, flag OFF bo'lsa darrov qaytadi.
      const { needsEngineTick } = await import("./services/ai/needsEngine");
      await needsEngineTick(bot).catch((e) => console.error("[needs] tick failed:", e));
      // 🔔 V4: bozor hayot-sikli push'lari (mktlife, yangi poller YO'Q) — «qidirganingiz keldi» va
      // «sevimlingiz arzonlashdi». Flag OFF bo'lsa servis darrov bo'sh reja qaytaradi (0 so'rov
      // yuborilmaydi). Cheklovlar servis ichida: 09:00-21:00 Toshkent · kuniga 1 ta · juftlikka
      // bir marta · tick'da 20 ta. Xabar = sabab-qatori + MAVJUD mahsulot kartasi (sendProductCard).
      const { runLifecyclePushes } = await import("./services/marketLifecycleService");
      const life = await runLifecyclePushes(async (memberId, lead, productId) => {
        const tgu = await prisma.telegramUser.findFirst({ where: { memberId }, select: { id: true } }).catch(() => null);
        if (!tgu) return false;
        // BLK-1: bloklagan bo'lsa sabab-qatori ham, karta ham yuborilmaydi (avval ikkalasi bekorga ketardi)
        const { pushMessage } = await import("./services/pushSend");
        if ((await pushMessage(bot, tgu.id, "mkt_life", lead, { memberId })) !== "sent") return false;
        const { sendProductCard } = await import("./bot/shop");
        return await sendProductCard(bot, tgu.id, productId).catch(() => false);
      }).catch((e) => { console.error("[mktlife] failed:", e); return { planned: 0, sent: 0 }; });
      if (life.sent) console.log(`[mktlife] ${life.sent}/${life.planned} push yuborildi`);
    }
    return { active, awaitingDriver };
  };
  // 🚖 SMS-parity speed: while a rider is WAITING for a driver, poll every 5s so "Haydovchi
  // topildi" lands in seconds like the kas SMS. Assigned / in-trip → 15s (arrival is WS-instant).
  // Idle → 90s. One api/bookings call per tick regardless of ride count — cheap at any scale.
  // 🚕 B qism P0-4: the core's stream WAKES this same sweep the moment an order changes (no second
  // sweep, no new poller); with the stream healthy the timer is only a safety net (20 s / 30 s).
  // sweepLoop keeps it ONE chain: a wake during a tick runs one more tick after it, never alongside.
  const bookingSweep = sweepLoop({
    body: tickBody,
    delay: (r) => bookingTickDelay({ ...r, streamHealthy: pacedHealthy() }),
    windowMs: 300, // a burst of nudges (accept → en route) is one sweep
    onError: (e) => console.error("[booking] tick failed:", e),
  });
  setCoreStreamWake(bookingSweep.wake);
  // The admin panel's flag switch: connect or close now, and let the sweep pick its new pace at once.
  setCoreStreamRecheck(() => void checkCoreStream().then(() => bookingSweep.wake()));
  // Always: the ride sweep also carries the market/partner SLA checks, tanga refunds for expired
  // market orders and AI reminders. It used to start only for kas1067 ("live").
  bookingSweep.start(15_000);

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
    bookingSweep.stop();
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
