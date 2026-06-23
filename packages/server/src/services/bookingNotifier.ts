// Live ride experience: ONE card per ride, edited in place through every
// status (was 11-12 separate messages), plus a MOVING driver pin (Telegram
// live location) and an honest queue line. The finish closes the loop with a
// peak-end summary: variable cashback roll BIG + driver tips + rebook.
//
// The 90s sweep is also the ride METER (rideStartedAt → minutes) powering the
// ETA-guess game now and the Garaj earn in Wave B.
import { InlineKeyboard, type Bot } from "grammy";
import type { Prisma } from "@prisma/client";
import { formatNumber, haversineKm } from "@t1067/shared";
import { prisma } from "../db";
import { getDataSource, type ActiveBookingLite, type BookingDriver, type KasDataSource, type RideHistoryItem } from "../kas";
import { incrementMission } from "./missionService";
import { kasMapSocket } from "./kasMapSocket";

const CITY_KMH = 24;
// kas lifecycle: new → take → in_place → delivered. "in_place" is normalized to "started" in the
// kas client (driver at pickup + meter running = in-trip), so it is NOT searching and NOT cancellable.
const SEARCHING = new Set(["new", "searching"]);
const CANCELLABLE = new Set(["searching", "new", "called", "accepted", "on_the_way", "take"]);

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// T3 fix: finish-sweep reward ops (quest increments, weekly score, ETA-guess)
// used to `.catch(() => undefined)` — a transient Neon drop (P1001) SILENTLY
// lost a real user's quest/ETA reward. Now: retry on transient, then LOG (never
// silent). The ops are gated once-per-ride by the `ridefin:` marker, so retry
// can't double-count.
export function isTransient(e: unknown): boolean {
  return /P10(01|08|17)|ECONNRESET|ETIMEDOUT|can't reach|connection|terminat|socket/i.test(String(e));
}
export async function resilient<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
  for (let i = 1; i <= 3; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i < 3 && isTransient(e)) {
        await new Promise((r) => setTimeout(r, 400 * i));
        continue;
      }
      console.error(`[finish] ${label} failed (urinish ${i}/3):`, e instanceof Error ? e.message.split("\n")[0] : e);
      return undefined;
    }
  }
  return undefined;
}

interface CardCtx {
  queuePos?: number; // 1-based position among searching orders
  freeDrivers?: number;
  driver?: BookingDriver | null;
  hasGuess?: boolean;
  spinUsed?: boolean;
  garage?: { name: string; emoji: string; amount: number } | null; // live earn estimate
}

// B5: compact ride progress bar for the live card (mirrors the Mini App RideTimeline).
const TL_STEPS = ["Qabul", "Yo'lda", "Yetdi", "Safar"];
function rideTimeline(status: string): string {
  const idx = status === "started" ? 3 : status === "arrived" ? 2 : 1; // driver assigned → ≥ "Yo'lda"
  return TL_STEPS.map((s, i) => (i < idx ? `✅ ${s}` : i === idx ? `🔵 <b>${s}</b>` : `▫️ ${s}`)).join(" · ");
}

// B6: mirror the official taximeter — show the running fare rounded UP to the next 100 with the
// delta, so the rider sees the round figure they'll hand over (display only; kas keeps the exact).
function roundUp100(n: number): { shown: number; delta: number } {
  const up = Math.ceil(n / 100) * 100;
  return { shown: up, delta: up - n };
}

function renderRideCard(b: ActiveBookingLite, c: CardCtx): string {
  const lines: string[] = ["🚕 <b>1067 · SAFAR</b>", "━━━━━━━━━━━━"];
  const d = c.driver;
  if (SEARCHING.has(b.status) && !b.carNumber) {
    lines.push("🔍 <b>Haydovchi qidirilyapti…</b>");
    if (c.queuePos) {
      lines.push(`📊 Navbatda: <b>${c.queuePos}-chi</b>${c.freeDrivers ? ` · bo'sh mashinalar: ${c.freeDrivers}` : ""}`);
    }
  } else if (b.status === "arrived") {
    lines.push("✅ <b>Haydovchingiz yetib keldi — chiqing!</b>");
  } else if (b.status === "started") {
    lines.push("🚗 <b>Safardasiz…</b> pastdagi o'yinlarni sinang 👇");
    // 🧾 live taximeter — drivers/byCarNumber.taximeterPayment is the running fare (kas API). The
    // card is edited every tick during the ride, so the rider watches the meter climb in real time.
    if (d?.meterPayment && d.meterPayment > 0) {
      const r = roundUp100(d.meterPayment);
      lines.push(`🧾 Taksometr: <b>${formatNumber(r.shown)} so'm</b>${r.delta ? ` (+${r.delta})` : ""} · hisoblanyapti`);
    }
    if (c.garage) lines.push(`${c.garage.emoji} ${esc(c.garage.name)} ishlayapti: <b>+${c.garage.amount}</b> tanga`);
  } else {
    let eta = "";
    if (d?.lat && d?.lng && b.lat && b.lng) {
      const min = Math.max(1, Math.ceil((haversineKm({ lat: d.lat, lng: d.lng }, { lat: b.lat, lng: b.lng }) / CITY_KMH) * 60));
      eta = ` · ~${min} daq`;
    }
    lines.push(`🟢 <b>Haydovchi yo'lda</b>${eta}`);
  }
  if (d) {
    lines.push(rideTimeline(b.status)); // B5: Qabul → Yo'lda → Yetdi → Safar
    lines.push(`🚘 ${esc(d.fullName)} · ${esc(d.carModel)} · <b>${esc(d.carNumber)}</b>${d.rating ? ` ⭐${d.rating.toFixed(1)}` : ""}`);
    if (d.phone) lines.push(`📞 ${esc(d.phone)}`);
  }
  lines.push(`📍 ${esc(b.addressName)}`);
  if (b.clientBonus) lines.push(`💰 Bu safardan: <b>+${formatNumber(b.clientBonus)} so'm</b> cashback`);
  if (d?.lat && d?.lng) lines.push("🗺 Pastdagi xaritada mashina jonli — joylashuv ~1.5 daqiqada yangilanadi");
  lines.push("━━━━━━━━━━━━");
  return lines.join("\n");
}

function rideCardKb(b: ActiveBookingLite, c: CardCtx): InlineKeyboard | undefined {
  const kb = new InlineKeyboard();
  let any = false;
  if (b.status === "started") {
    if (!c.spinUsed) {
      kb.text("🎡 Omadni sina (har spin yutadi!)", "wheel:ride").row();
      any = true;
    }
    if (!c.hasGuess) {
      kb.text("⏱ Necha daqiqada yetamiz?", "noop").row();
      kb.text("<6", "guess:lt6").text("6-9", "guess:6-9").text("10-14", "guess:10-14").text("15+", "guess:15p").row();
      any = true;
    }
  } else if (c.driver) {
    // en-route (driver assigned, coming): 📞 call (callback → tap-to-call number;
    // tel: inline buttons are rejected by Telegram — proven) + 🛡 share trip. ✖ added below.
    kb.text("📞 Qo'ng'iroq", "bk:call");
    const share = `🚕 Men 1067 taxida ketyapman${b.carNumber ? ` — mashina ${b.carNumber}` : ""}. Kuzating: @koson1067bot`;
    kb.url("🛡 Ulashish", `https://t.me/share/url?url=${encodeURIComponent("https://t.me/koson1067bot")}&text=${encodeURIComponent(share)}`);
    kb.row();
    any = true;
  }
  if (CANCELLABLE.has(b.status)) {
    kb.text("✖ Bekor qilish", "bk:cancelride");
    any = true;
  }
  return any ? kb : undefined;
}

/** Resolve the ETA-guess at ride end: band vs measured minutes, +50 if right. */
async function resolveGuess(memberId: number, bookingId: number, startedAt: Date | null): Promise<string> {
  if (!startedAt) return "";
  const guess = await prisma.rideGuess.findUnique({ where: { memberId_bookingId: { memberId, bookingId } } });
  if (!guess) return "";
  const min = (Date.now() - startedAt.getTime()) / 60_000;
  const hit =
    (guess.guessBand === "<6" && min < 6) ||
    (guess.guessBand === "6-9" && min >= 6 && min < 10) ||
    (guess.guessBand === "10-14" && min >= 10 && min < 15) ||
    (guess.guessBand === "15+" && min >= 15);
  if (!hit) return `\n⏱ Taxmin: ${guess.guessBand} — bu safar to'g'ri kelmadi (${Math.round(min)} daq)`;
  await prisma.rideGuess.update({ where: { id: guess.id }, data: { won: true } });
  const { grantRideCoins } = await import("./coinService");
  const g = await grantRideCoins(memberId, bookingId, 50, "guess", "⏱ Vaqtni topdingiz!", "guess");
  return g.ok ? `\n⏱ Vaqtni TOPDINGIZ (${Math.round(min)} daq): <b>+50 tanga</b>` : "";
}

/** Poll active bookings; maintain ONE live card + moving pin per ride.
 *  dsOverride + opts.memberScope exist for the sweep-simulation tests: the sweep
 *  processes EVERY linked member, so a test on a shared DB would otherwise grant/
 *  clear state for real members and count their finish cards (flaky + prod-unsafe).
 *  memberScope narrows the member set to the test's own rows — hermetic on any DB. */
export async function pushBookingUpdates(
  bot: Bot,
  dsOverride?: KasDataSource,
  opts?: { memberScope?: Prisma.MemberWhereInput },
): Promise<{ active: number; awaitingDriver: number }> {
  const ds = dsOverride ?? getDataSource();
  let bookings: ActiveBookingLite[];
  try {
    bookings = await ds.listActiveBookings();
  } catch {
    return { active: 0, awaitingDriver: 0 };
  }
  // newest order per phone WINS: kas ids are monotonic, so a lingering OLD booking (one that never
  // left kas's active list) must never shadow the rider's CURRENT order. Map-from-array kept the
  // LAST array entry, which could be the stale one → the bot announced the WRONG taxi. Fixed here.
  const byPhone = new Map<string, ActiveBookingLite>();
  for (const bk of bookings) {
    const prev = byPhone.get(bk.phoneNorm);
    if (!prev || bk.id > prev.id) byPhone.set(bk.phoneNorm, bk);
  }
  // honest queue: searching orders in arrival order (kas ids are monotonic)
  const searchQueue = bookings.filter((x) => SEARCHING.has(x.status) && !x.carNumber).sort((a, b) => a.id - b.id);
  let freeDrivers: number | undefined;
  try {
    freeDrivers = (await ds.getMainReport()).onlineDrivers || undefined;
  } catch {
    /* optional */
  }
  // one driver lookup per car per tick (shared across members)
  const driverCache = new Map<string, BookingDriver | null>();
  const driverByCar = async (car: string): Promise<BookingDriver | null> => {
    if (!car) return null;
    if (!driverCache.has(car)) driverCache.set(car, await ds.getDriverByCar(car).catch(() => null));
    return driverCache.get(car) ?? null;
  };

  const linked = await prisma.member.findMany({
    where: { telegramUser: { isNot: null }, phone: { not: null }, ...(opts?.memberScope ?? {}) },
    include: { telegramUser: true },
  });

  // 🏘 GARAJ v2: mahalla weekly league reset/award runs BEFORE the member loop so
  // the first sweep of a new ISO week snapshots + resets the just-closed week first,
  // then this sweep's rides accrue into the fresh week (no self-wipe). Idempotent via
  // MahallaWeeklyResult (presence = settled); later sweeps no-op. OFF-safe.
  try {
    const { closedWeekKey, settleMahallaWeek, settleExhibition } = await import("./garajService");
    await settleMahallaWeek(closedWeekKey());
    await settleExhibition(closedWeekKey()); // #8: award last week's top-voted car (idempotent)
  } catch (e) {
    console.error("[garaj] weekly settle failed:", e);
  }

  for (const m of linked) {
    // T8 hardening: isolate each member — one member's transient (e.g. a Postgres blip on a
    // bare member.update) must NOT skip the rest of this 90s tick for everyone else. Next
    // tick re-runs; every money op below is idempotent/resilient, so no double/lost grants.
    try {
    const norm = m.phone!.replace(/\D/g, "").slice(-9);
    const b = byPhone.get(norm);
    const chatId = m.telegramUser!.id;

    if (b) {
      const isNewRide = m.lastBookingId !== b.id;
      const statusChanged = isNewRide || m.lastBookingStatus !== b.status;
      const driver = b.carNumber ? await driverByCar(b.carNumber) : null;
      // trace which booking/car the bot resolved for this member — proves the correct taxi vs the
      // stale-booking bug. Logged only on a transition so Render logs stay readable.
      if (isNewRide || statusChanged) {
        console.log(
          `[booking] m${m.id} → b${b.id} ${b.status} car=${b.carNumber || "—"} drv=${driver?.fullName || "—"} (prev b${m.lastBookingId ?? "—"} car=${m.lastBookingCar ?? "—"})`,
        );
      }

      // T2 (AUDIT 2.2): 2 ketma-ket so'rov → 1 parallel to'lqin (faol-safar a'zosiga)
      const [guessRow, spinRow] = await Promise.all([
        prisma.rideGuess.findUnique({ where: { memberId_bookingId: { memberId: m.id, bookingId: b.id } } }).catch(() => null),
        prisma.wheelSpin.findFirst({ where: { memberId: m.id, bookingId: b.id } }).catch(() => null),
      ]);
      const ctx: CardCtx = {
        driver,
        freeDrivers,
        queuePos: SEARCHING.has(b.status) && !b.carNumber ? searchQueue.findIndex((x) => x.id === b.id) + 1 || undefined : undefined,
        hasGuess: !!guessRow,
        spinUsed: !!spinRow,
      };
      if (b.status === "started" && m.rideStartedAt) {
        const { equippedEstimate } = await import("./garageService");
        ctx.garage = await equippedEstimate(m.id, (Date.now() - m.rideStartedAt.getTime()) / 60_000).catch(() => null);
      }

      // ride meter: first sighting of "started"
      const rideStartedAt = b.status === "started" && (isNewRide || !m.rideStartedAt) ? new Date() : m.rideStartedAt;

      // ── the ONE live card ──
      // Adopt a PENDING bot-order card: an in-bot order stores its confirmation message id as
      // rideCardMsgId with lastBookingId=null, so the sweep EDITS that message in place — the
      // confirmation BECOMES the live card (no separate message, no manual refresh). A genuinely
      // different new ride (lastBookingId still holds the OLD id) starts a fresh card as before.
      let cardId = isNewRide && m.lastBookingId !== null ? null : m.rideCardMsgId;
      if (!cardId) {
        const sent = await bot.api
          .sendMessage(chatId, renderRideCard(b, ctx), { parse_mode: "HTML", reply_markup: rideCardKb(b, ctx) })
          .catch(() => null);
        cardId = sent?.message_id ?? null;
      } else if (statusChanged || b.status === "started" || driver) {
        // edit in place (statuses + moving ETA); ignore "not modified"
        await bot.api
          .editMessageText(chatId, cardId, renderRideCard(b, ctx), { parse_mode: "HTML", reply_markup: rideCardKb(b, ctx) })
          .catch(() => undefined);
      }

      // PING on the key transition — the card EDIT above is SILENT (Telegram edits don't notify),
      // so without this the rider never notices the driver arrived. Fires ONCE per transition
      // (lastBookingStatus gates statusChanged, updated below).
      if (statusChanged && cardId && b.status === "arrived") {
        const car = b.carNumber ? ` · <b>${esc(b.carNumber)}</b>` : "";
        const ph = ctx.driver?.phone ? ` · 📞 ${esc(ctx.driver.phone)}` : "";
        const bonus = b.clientBonus ? `\n💰 +${formatNumber(b.clientBonus)} so'm cashback · narx taksometr bo'yicha` : "\n💰 narx taksometr bo'yicha";
        await bot.api
          .sendMessage(chatId, `🚖 <b>Haydovchingiz keldi — kutyapti, chiqing!</b>\n🚘 ${esc(ctx.driver?.carModel ?? "Mashina")}${car}${ph}${bonus}`, { parse_mode: "HTML" })
          .catch(() => undefined);
      } else if (statusChanged && cardId && b.status === "started") {
        // arrival ping. kas "in_place"→"started" OR the map-socket geofence, whichever the rider
        // hits FIRST: a wsarrived:<id> marker (idempotent create) makes exactly ONE of them ping.
        let firstArrival = true;
        try {
          await prisma.appState.create({ data: { key: `wsarrived:${b.id}`, value: "1" } });
        } catch {
          firstArrival = false; // the map socket already pinged this ride
        }
        if (firstArrival) {
          const car = driver ? `\n🚘 ${esc(driver.carModel)} · <b>${esc(driver.carNumber)}</b>` : b.carNumber ? `\n🚘 <b>${esc(b.carNumber)}</b>` : "";
          await bot.api.sendMessage(chatId, `🚕 <b>Haydovchingiz YETIB KELDI — chiqing!</b>${car}`, { parse_mode: "HTML" }).catch(() => undefined);
        }
      } else if (cardId && b.carNumber && b.carNumber !== m.lastBookingCar && b.status !== "arrived" && b.status !== "started") {
        // 🚖 driver JUST assigned — a car appeared (or CHANGED) for THIS ride. Gate on the car
        // DIFFERING from the one last recorded, NOT on "member never had a car": a previous ride
        // left lastBookingCar set, so the old `!m.lastBookingCar` gate silently suppressed this
        // ping for every later ride ("kim qabul qildi" never arrived). Fires on the first sighting
        // too (new ride's car ≠ stale old car). Next tick sets lastBookingCar → no re-fire.
        const eta =
          driver?.lat && driver?.lng && b.lat && b.lng
            ? ` · ~${Math.max(1, Math.ceil((haversineKm({ lat: driver.lat, lng: driver.lng }, { lat: b.lat, lng: b.lng }) / CITY_KMH) * 60))} daq`
            : "";
        const name = driver?.fullName ? `\n👤 ${esc(driver.fullName)}${driver.rating ? ` ⭐${driver.rating.toFixed(1)}` : ""}` : "";
        const ph = driver?.phone ? `\n📞 ${esc(driver.phone)}` : "";
        await bot.api
          .sendMessage(chatId, `🚖 <b>Haydovchi topildi — yo'lda!</b>${eta}${name}\n🚘 ${esc(driver?.carModel ?? "Mashina")} · <b>${esc(b.carNumber)}</b>${ph}`, { parse_mode: "HTML" })
          .catch(() => undefined);
      }

      // 📡 register the assigned car with the kas map WebSocket → INSTANT "arrived" ping the moment
      // it reaches the pickup (no 15s wait). The wsarrived:<id> marker coordinates with the
      // started-ping above so exactly one fires. Re-armed per booking (no unregister needed).
      if (b.carNumber && b.lat && b.lng) {
        const bid2 = b.id;
        const chat2 = chatId;
        const carLine = driver ? `\n🚘 ${esc(driver.carModel)} · <b>${esc(driver.carNumber)}</b>` : `\n🚘 <b>${esc(b.carNumber)}</b>`;
        kasMapSocket.register(b.carNumber, b.id, { lat: b.lat, lng: b.lng }, () => {
          void (async () => {
            try {
              await prisma.appState.create({ data: { key: `wsarrived:${bid2}`, value: "1" } });
            } catch {
              return; // started-ping already fired for this ride
            }
            await bot.api.sendMessage(chat2, `🚕 <b>Haydovchingiz YETIB KELDI — chiqing!</b>${carLine}`, { parse_mode: "HTML" }).catch(() => undefined);
          })();
        });
      }

      // ── the moving pin ── ONE live-location message per ride, EDITED in place (Telegram slides
      // the dot). Position comes from the real-time map socket (updates every few seconds) with the
      // kas API driver position as fallback. We must NEVER send a fresh location each tick.
      const wsPos = b.carNumber ? kasMapSocket.position(b.carNumber) : null;
      const pinLat = wsPos?.lat ?? driver?.lat;
      const pinLng = wsPos?.lng ?? driver?.lng;
      let pinId = isNewRide ? null : m.liveLocMsgId;
      if (typeof pinLat === "number" && typeof pinLng === "number") {
        if (!pinId) {
          const pin = await bot.api
            .sendLocation(chatId, pinLat, pinLng, { live_period: 3600, disable_notification: true })
            .catch(() => null);
          pinId = pin?.message_id ?? null;
        } else {
          await bot.api.editMessageLiveLocation(chatId, pinId, pinLat, pinLng).catch(async (e) => {
            // "message is not modified" = the car hasn't moved since the last tick → the pin is
            // ALREADY correct, do nothing. (Re-sending a fresh location here was the bug that
            // spammed a new pin every 15 s.) Only a genuinely gone/expired message gets a fresh pin.
            const msg = e instanceof Error ? e.message : String(e);
            if (/not modified/i.test(msg)) return;
            const pin = await bot.api
              .sendLocation(chatId, pinLat, pinLng, { live_period: 3600, disable_notification: true })
              .catch(() => null);
            pinId = pin?.message_id ?? pinId;
          });
        }
      }

      if (isNewRide) {
        const { alertAdmins } = await import("./economyService");
        await alertAdmins(`🚖 Yangi buyurtma: <b>${m.fullName}</b> → ${b.addressName}${b.carNumber ? ` · ${b.carNumber}` : " · haydovchi qidirilyapti"}`).catch(() => undefined);
      }

      if (statusChanged || cardId !== m.rideCardMsgId || pinId !== m.liveLocMsgId || rideStartedAt !== m.rideStartedAt) {
        await prisma.member.update({
          where: { id: m.id },
          data: {
            lastBookingId: b.id,
            lastBookingStatus: b.status,
            rideCardMsgId: cardId,
            liveLocMsgId: pinId,
            rideStartedAt,
            ...(b.carNumber ? { lastBookingCar: b.carNumber } : {}),
            ...(b.clientBonus ? { lastBookingBonus: b.clientBonus } : {}),
          },
        });
      }
    } else if (m.lastBookingId) {
      // ── ride finished ──
      // T4 fix: each quest/score increment is now IDEMPOTENT per ride via its own
      // rideKey marker (atomic marker+upsert in incrementMission/addScore). No
      // fragile firstFinish gate — a transient just makes resilient() retry the
      // atomic tx; a re-entry is a P2002 no-op. Zero double-count, zero silent loss.
      const bid = m.lastBookingId;
      // P0 (QA fleet): the kas active list drops a booking on BOTH completion AND cancellation,
      // so this "finished" branch can't tell them apart — a CANCELLED ride would otherwise pay
      // out cashback/garage/fund and send a "yakunlandi" card. Guard on a POSITIVE completion
      // signal: the ride must have reached "started" (passenger in the car) AND its last status
      // must not be a cancel. Otherwise clear the ride state but fire NO rewards / finish card.
      const CANCEL_STATUSES = ["cancel_by_operator", "cancel_by_server", "take_back", "cancel"];
      if (!m.rideStartedAt || CANCEL_STATUSES.includes(m.lastBookingStatus ?? "")) {
        if (m.rideCardMsgId) {
          await bot.api.editMessageText(chatId, m.rideCardMsgId, "❌ <b>Buyurtma bekor qilindi</b>", { parse_mode: "HTML" }).catch(() => undefined);
        }
        if (m.liveLocMsgId) {
          await bot.api.stopMessageLiveLocation(chatId, m.liveLocMsgId).catch(() => undefined);
        }
        await prisma.member.update({
          where: { id: m.id },
          data: { lastBookingId: null, lastBookingStatus: null, lastBookingCar: null, lastBookingBonus: null, rideCardMsgId: null, liveLocMsgId: null, rideStartedAt: null },
        });
        continue;
      }
      {
        await resilient("daily_ride", () => incrementMission(m.id, "daily_ride", 1, `qinc:${m.id}:daily_ride:${bid}`));
        await resilient("weekly_rides", () => incrementMission(m.id, "weekly_rides", 1, `qinc:${m.id}:weekly_rides:${bid}`));
        await resilient("addScore", async () => {
          const w = await import("./weeklyService");
          await w.addScore(m.id, "ride", `qscore:${m.id}:${bid}`);
        });
      }

      // 🎰 BARABAN: grant a 5-minute spin token for THIS finished ride + fire an immediate
      // notification. No coin emission here (the win lands later, on /baraban spin, via
      // grantCoins OUTSIDE the 350 clamp). Token grant is idempotent per ride (re-entry keeps
      // the existing token), so the sweep re-running can't reset the clock. Gated by "baraban"
      // (DEFAULT_OFF → dark until owner QABUL). No new poller — rides on this sweep.
      try {
        const { featureOn } = await import("./featureFlags");
        if (await featureOn("baraban")) {
          const { grantWheelToken } = await import("./rideWheelService");
          // only NOTIFY on the FIRST processing of this ride (token grant is idempotent, but the
          // bot message is not — a fresh token here means we haven't pinged for this ride yet)
          const before = await prisma.appState.findUnique({ where: { key: `barabantoken:${m.id}` } }).catch(() => null);
          const firstForRide = (() => {
            try {
              return !before || (JSON.parse(before.value) as { bookingId?: number }).bookingId !== bid;
            } catch {
              return true;
            }
          })();
          await resilient("baraban_token", () => grantWheelToken(m.id, bid));
          if (firstForRide) {
            await bot.api
              .sendMessage(
                chatId,
                "🎰 <b>Safar tugadi!</b> 5 daqiqa ichida barabanni aylantiring — tanga yutib oling! /baraban",
                { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("🎰 Aylantirish", "baraban:spin") },
              )
              .catch(() => undefined);
          }
        }
      } catch (e) {
        console.error("[baraban] token/notify failed:", e);
      }

      // freeze the card + stop the pin
      if (m.rideCardMsgId) {
        await bot.api
          .editMessageText(chatId, m.rideCardMsgId, "🏁 <b>Safar yakunlandi</b> — pastda natijangiz 👇", { parse_mode: "HTML" })
          .catch(() => undefined);
      }
      if (m.liveLocMsgId) {
        await bot.api.stopMessageLiveLocation(chatId, m.liveLocMsgId).catch(() => undefined);
      }

      // 🎲 variable cashback roll (idempotent per ride)
      let rollLine = "";
      try {
        const { rollRideCashback, renderRideRoll } = await import("./cashbackService");
        const roll = await resilient("cashback-roll", () => rollRideCashback(m.id, m.lastBookingId!)); // idempotent: RideReward unique
        {
          const { fundAddRide } = await import("./featureFlags");
          await resilient("fund", () => fundAddRide(m.lastBookingId!)); // 🏆 Mashina fondi (idempotent: fundride marker)
        }
        if (roll) rollLine = `\n${renderRideRoll(roll)}`;
      } catch (e) {
        console.error("[cashback] roll failed:", e);
      }

      // 💎 ride-drop collectibles: founder (first 100 riders) + district badge
      let questLine = "";
      try {
        const { dropDistrictBadge, mintItem } = await import("./itemService");
        const f = await resilient("founder", () => mintItem(m.id, "founder", { free: true })); // idempotent: one-per-member
        if (f?.ok) questLine += `
🌟 <b>Asoschi nishoni</b> — birinchi 100 ichidasiz! (#${f.serial})`;
        // district from the finished ride's pickup (lastPickupId set at dispatch)
        if (m.lastPickupId && m.lastPickupName) {
          const d = await resilient("district", () => dropDistrictBadge(m.id, m.lastPickupId!, m.lastPickupName!)); // idempotent: marker
          if (d) questLine += `
📍 Yangi tuman ochildi: <b>${d.name}</b> (${d.total}/10)${d.sayyoh ? " · 🗺 SAYYOH +5000!" : ""}`;
        }
      } catch (e) {
        console.error("[items] drop failed:", e);
      }

      // ⏱ ETA-guess resolution (uses the ride meter)
      // resolveGuess's grant is idempotent (grantRideCoins key) → retry-safe
      const guessLine = (await resilient("guess", () => resolveGuess(m.id, m.lastBookingId!, m.rideStartedAt))) ?? "";

      // 🚗 Garaj earn — the equipped car worked while the ride ran
      let garageLine = "";
      if (m.rideStartedAt) {
        try {
          const { earnForRide } = await import("./garageService");
          const e = await resilient("garage", () => earnForRide(m.id, m.lastBookingId!, (Date.now() - m.rideStartedAt!.getTime()) / 60_000)); // idempotent: garage:<m>:<b>
          if (e) garageLine = `
🚗 ${e.name} ishladi: <b>+${formatNumber(e.amount)}</b> tanga`;
        } catch (err) {
          console.error("[garage] earn failed:", err);
        }
      }

      // 🏆 GARAJ v2: ride → game raw-material drop. Idempotent per ride via the
      // GarajRideDrop unique; NO coin emission (the 350 clamp is untouched);
      // gated by feature "garajx". No new poller — rides on this sweep.
      try {
        const { processRideDrop, updateStreakOnRide, addMahallaScore } = await import("./garajService");
        const fresh = await resilient("garaj_drop", () => processRideDrop(m.id, m.lastBookingId!, m.rideStartedAt));
        // once-per-ride W5 hooks — only on the FIRST processing of this ride (the
        // finish block re-runs across sweeps, so these must not be re-counted).
        if (fresh) {
          const rideDate = new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10); // Tashkent day
          await resilient("garaj_streak", () => updateStreakOnRide(m.id, rideDate));
          if (m.rideStartedAt) {
            const mins = (Date.now() - m.rideStartedAt.getTime()) / 60_000;
            await resilient("garaj_mahalla", () => addMahallaScore(m.id, mins));
          }
        }
      } catch (e) {
        console.error("[garaj] ride-drop failed:", e);
      }

      // 🪙 Garaj tanga from REAL rides only (≤8/ride). ONE currency now: a game faucet
      // OUTSIDE the 350/ride clamp (grantKozacha → grantCoins, which is NOT clamped).
      // The key tail is NON-numeric (`g<m>r<b>`) so it can NEVER match the ride-clamp
      // suffix `:<memberId>:<bookingId>` — this grant must stay outside that aggregate.
      // Gated by feature "kozacha".
      try {
        const { featureOn } = await import("./featureFlags");
        if (m.rideStartedAt && (await featureOn("kozacha"))) {
          const { grantKozacha } = await import("./garajService");
          const mins = Math.min(8, Math.floor((Date.now() - m.rideStartedAt.getTime()) / 60_000));
          if (mins > 0) await resilient("garaj_tanga", () => grantKozacha(m.id, mins, "ride", `garajtanga:ride:g${m.id}r${m.lastBookingId}`));
        }
      } catch (e) {
        console.error("[garaj tanga] earn failed:", e);
      }

      // 🥇 tier-based driver rebate (replaces the flat bonus; weekly tier job
      // sets driverTier from measured percentiles) + quest progress
      let driverId: number | null = null;
      if (m.lastBookingCar) {
        const driver = await prisma.member.findFirst({
          where: { type: "driver", carNumber: m.lastBookingCar },
          select: { id: true, driverTier: true },
        });
        if (driver && driver.id !== m.id) {
          driverId = driver.id;
          try {
            const { DRIVER_DAILY_BONUS_CAP, DRIVER_TIER_REBATE } = await import("@t1067/shared");
            const rebate = DRIVER_TIER_REBATE[driver.driverTier] ?? 0;
            if (rebate > 0) {
              const since = new Date(Date.now() - 24 * 3600 * 1000);
              const today = await prisma.coinTxn.aggregate({
                where: { memberId: driver.id, kind: "driver_bonus", createdAt: { gte: since } },
                _sum: { amount: true },
              });
              if ((today._sum.amount ?? 0) + rebate <= DRIVER_DAILY_BONUS_CAP) {
                const { grantCoins } = await import("./coinService");
                await resilient("driver_bonus", () => grantCoins(driver.id, rebate, "driver_bonus", `Tier-bonus (${driver.driverTier})`, `driver_bonus:${m.id}:${m.lastBookingId}`)); // idempotent key
              }
            }
            // quest progress: completed-count only (idempotent per ride via rideKey)
            await resilient("drv_daily_5", () => incrementMission(driver.id, "drv_daily_5", 1, `qinc:${driver.id}:drv_daily_5:${m.lastBookingId}`));
            await resilient("drv_weekly_25", () => incrementMission(driver.id, "drv_weekly_25", 1, `qinc:${driver.id}:drv_weekly_25:${m.lastBookingId}`));
            await resilient("drv_weekly_40", () => incrementMission(driver.id, "drv_weekly_40", 1, `qinc:${driver.id}:drv_weekly_40:${m.lastBookingId}`));
            // 🔧 XIII-1: random car part for the driver's completed ride
            try {
              const { dropCarPart } = await import("./itemService");
              const drop = await dropCarPart(driver.id, m.lastBookingId);
              if (drop?.fullCar) {
                const dtg = await prisma.telegramUser.findFirst({ where: { memberId: driver.id } });
                if (dtg) {
                  await bot.api
                    .sendMessage(dtg.id, "🚙 <b>TABRIKLAYMIZ!</b> 20 qismni yig'ib TO'LIQ MASHINA yasadingiz!\nYillik katta o'yinda chiptangiz bor. 🏆", { parse_mode: "HTML" })
                    .catch(() => undefined);
                }
              }
            } catch (e) {
              console.error("[partdrop] failed:", e);
            }
            // 🚖 recruit revshare: this rider was recruited by a driver's QR
            try {
              const { payRecruitRevshare } = await import("./recruitService");
              await payRecruitRevshare(m.id, m.lastBookingId);
            } catch (e) {
              console.error("[recruit] revshare failed:", e);
            }
            // 🚖 driver→driver milestone: the DRIVER who drove this ride may have been recruited by
            // another driver — count toward 10 rides; pay the recruiter 5000 once (flag drvrecruit, DARK).
            try {
              const { payDriverRecruitMilestone } = await import("./recruitService");
              const r = await payDriverRecruitMilestone(driver.id, m.lastBookingId!);
              if (r.paid && r.recruiterTelegramId) {
                await bot.api
                  .sendMessage(
                    r.recruiterTelegramId,
                    `🚖 <b>Tabriklaymiz!</b>\nOlib kelgan haydovchingiz <b>10 ta safar</b> qildi — sizga <b>+${formatNumber(r.amount ?? 0)} tanga</b> tushdi! 🎉`,
                    { parse_mode: "HTML" },
                  )
                  .catch(() => undefined);
              }
            } catch (e) {
              console.error("[drvrecruit] milestone failed:", e);
            }
          } catch (e) {
            console.error("[driver_bonus] failed:", e);
          }
        }
      }

      // 👥 deferred referral payout: BOTH sides unlock on the invited friend's
      // first REAL ride (kills the burner-account referral mint entirely)
      try {
        const ref = await prisma.referral.findFirst({
          where: { refereeMemberId: m.id, referrerPaidAt: null },
        });
        if (ref) {
          const { grantCoins } = await import("./coinService");
          if (ref.rewardReferee > 0) {
            const g = await grantCoins(m.id, ref.rewardReferee, "referral", "Do'st taklifi — birinchi safaringiz uchun 🎁", `ref_referee_ride:${ref.id}`);
            if (g.ok) {
              await bot.api
                .sendMessage(chatId, `🎁 Taklif sovg'asi ochildi: <b>+${formatNumber(ref.rewardReferee)} tanga</b> — birinchi safaringiz muborak!`, { parse_mode: "HTML" })
                .catch(() => undefined);
            }
          }
          const refTg = await prisma.telegramUser.findUnique({ where: { id: ref.referrerId } });
          if (refTg?.memberId && ref.rewardReferrer > 0) {
            const g = await grantCoins(refTg.memberId, ref.rewardReferrer, "referral", `Do'stingiz birinchi safarini qildi 🚕`, `ref_ride:${ref.id}`);
            if (g.ok) {
              await bot.api
                .sendMessage(refTg.id, `🎉 Taklif qilgan do'stingiz birinchi safarini qildi!\n👥 Sizga <b>+${formatNumber(ref.rewardReferrer)} tanga</b> tushdi.`, { parse_mode: "HTML" })
                .catch(() => undefined);
            }
          }
          // T0.5 (AUDIT 3.2): convergence order — grants FIRST (idempotent
          // per-referral keys block double-pay), paidAt LAST. If this update
          // dies, the next sweep re-runs: grants skip as duplicates, update
          // retries. NOTE: keys are deliberately ride-AGNOSTIC — a bookingId
          // suffix would mint a fresh key on the friend's next ride and pay twice.
          await prisma.referral.update({ where: { id: ref.id }, data: { referrerPaidAt: new Date() } });
        }
      } catch (e) {
        console.error("[referral_ride] failed:", e);
        // AUDIT 3.10: anything beyond idempotent-duplicate is money-path noise the owner must see
        const { alertAdmins } = await import("./economyService");
        await alertAdmins(`⚠️ Referral payout xatosi (member ${m.id}): ${e instanceof Error ? e.message : String(e)}`).catch(() => undefined);
      }

      // 🎁 Universal birinchi-safar bonusi (flag "welcomebonus", default DARK). Referral (ref_) yoki
      // QR (drv_) bilan kelmagan — oddiy /start yoki eski 1067 mijozi — ham birinchi safarida shu
      // bonusni oladi. Shunda HAR yangi user aynan BITTA 5000 tanga oladi (referral/recruit/welcome —
      // bittasi, ikkitasi emas). grantCoins → klampdan TASHQARI (referee bonusi kabi); idempotent
      // (welcome_first_ride:<m>); FAQAT botdagi birinchi safar (eski riderlarga retroaktiv emas).
      try {
        const { featureOn } = await import("./featureFlags");
        if (await featureOn("welcomebonus")) {
          const priorRides = await prisma.rideReward.count({ where: { memberId: m.id, bookingId: { not: m.lastBookingId! } } });
          if (priorRides === 0) {
            const referred = (await prisma.referral.findFirst({ where: { refereeMemberId: m.id }, select: { id: true } })) !== null;
            const tu = await prisma.telegramUser.findFirst({ where: { memberId: m.id }, select: { referredByCode: true } });
            const code = tu?.referredByCode ?? "";
            // client-recruit is `drv_<id>`; the driver-recruit `drvdrv_<id>` must NOT count here (a
            // driver-candidate link that ends up a client still deserves the client welcome bonus).
            const recruited = code.startsWith("drv_") && !code.startsWith("drvdrv_");
            if (!referred && !recruited) {
              const { grantCoins } = await import("./coinService");
              const { REFEREE_REWARD } = await import("./referralService");
              const g = await grantCoins(m.id, REFEREE_REWARD, "referral", "🎁 Birinchi safaringiz uchun sovg'a!", `welcome_first_ride:${m.id}`);
              if (g.ok) {
                await bot.api
                  .sendMessage(chatId, `🎁 <b>Birinchi safaringiz muborak!</b>\nSovg'a: <b>+${formatNumber(REFEREE_REWARD)} tanga</b> hisobingizga tushdi 🚕`, { parse_mode: "HTML" })
                  .catch(() => undefined);
              }
            }
          }
        }
      } catch (e) {
        console.error("[welcome_bonus] failed:", e);
      }

      // 🔥 streak line for the peak-end card (read-only; safe on transient)
      const streak = await prisma.streak.findUnique({ where: { memberId: m.id } }).catch(() => null);
      const streakLine = streak?.current ? `\n🔥 Streak: <b>${streak.current} kun</b> — davom eting!` : "";

      // 🧾 yo'l haqi — the completed ride's FINAL fare from kas (like the kas1067 SMS), shown
      // at the end next to the bonus. Read-only (no money path); matched to THIS booking by id
      // and omitted gracefully if kas hasn't posted the payment yet.
      let fareLine = "";
      let fareAmount = 0; // raw fare → powers the one-tap "pay the fare with tanga" button below
      try {
        const hist = await resilient("fare", () => ds.getRideHistory(m.phone!, 6));
        const done = matchFareRow(hist ?? [], bid, m.lastBookingCar ?? undefined);
        if (done && done.payment > 0) {
          fareAmount = Math.floor(done.payment);
          const km = done.distance ? ` · 📏 ${done.distance} km` : "";
          const mins = done.time ? ` · ⏱ ${done.time} daq` : "";
          fareLine = `\n🧾 Yo'l haqi: <b>${formatNumber(done.payment)} so'm</b>${km}${mins}`;
        }
      } catch (e) {
        console.error("[fare] lookup failed:", e instanceof Error ? e.message : e);
      }
      // 🧾 SMS-parity: kas often finalizes the fare a few seconds AFTER the booking leaves the active
      // list, so done.payment can be 0 right here. Log the value seen, and if the fare wasn't ready
      // mark the ride pending → resolvePendingFares (same sweep, later ticks) sends "Yo'l haqi: …"
      // the moment kas posts the payment — a separate message, exactly like the kas SMS.
      console.log(`[fare] m${m.id} b${bid} payment=${fareAmount} ${fareLine ? "shown-in-card" : "PENDING"}`);
      if (!fareLine) {
        // carry carNumber + finish time so resolvePendingFares can match the right report row
        await prisma.appState
          .create({ data: { key: `farepending:${bid}`, value: `${chatId}|${m.phone}|0|${m.lastBookingCar ?? ""}|${Date.now()}` } })
          .catch(() => undefined); // already pending → idempotent
      }

      // ── peak-end summary card (message #3 of the ride) ──
      // P1 (QA fleet): the finish card was RE-SENT on a PG transient (the branch re-entered
      // before the state-clear below). Gate the card + admin alert on a per-ride marker → sent
      // at most ONCE. The rewards above stay retry-able (idempotent) so a transient never loses
      // money — only the duplicate message is suppressed.
      let cardSent = false;
      try {
        await prisma.appState.create({ data: { key: `finishcard:${bid}`, value: "1" } });
      } catch {
        cardSent = true; // marker exists → card already sent on a prior (transient) pass
      }
      if (!cardSent) {
        const tipKb = new InlineKeyboard();
        // 🪙 one-tap "pay the fare with tanga" → reuses the tip transfer (rider's tanga → driver as tanga).
        // Only when BOTH the driver member id AND the fare are known (graceful: no button otherwise).
        const canPayFare = driverId != null && fareAmount > 0;
        if (canPayFare) tipKb.text(`🪙 Yo'l haqini to'la (${formatNumber(fareAmount)})`, `payfare:${driverId}:${fareAmount}`).row();
        if (driverId) {
          tipKb
            .text("🙏 500", `tip:${driverId}:500`)
            .text("🙏 1 000", `tip:${driverId}:1000`)
            .text("🙏 2 000", `tip:${driverId}:2000`)
            .row();
        }
        tipKb.text("🔁 Yana 1067", "bk:now");
        await bot.api
          .sendMessage(
            chatId,
            "🏁 <b>Safaringiz yakunlandi — rahmat!</b>" +
              fareLine +
              rollLine +
              guessLine +
              garageLine +
              streakLine +
              questLine +
              "\n🎯 Vazifalaringizni «🎁 Bonuslar»da tekshiring." +
              (canPayFare ? "\n\n🪙 Yo'l haqini tanga bilan to'lashingiz mumkin 👇" : driverId ? "\n\n🚗 Haydovchiga tanga bilan rahmat aytasizmi?" : ""),
            { parse_mode: "HTML", reply_markup: tipKb },
          )
          .catch(() => undefined);
        const { alertAdmins } = await import("./economyService");
        await alertAdmins(`🏁 Safar yakunlandi: <b>${m.fullName}</b>${rollLine ? ` ·${rollLine.replace(/<[^>]+>/g, "")}` : ""}`).catch(() => undefined);
      }
      // P1 (QA fleet): keep lastBookingCar after a COMPLETED ride so the Mini App rating (which
      // arrives after this clear) can still attribute stars to the driver's car. lastBookingId is
      // cleared (finish won't re-trigger); the next ride overwrites lastBookingCar.
      await prisma.member.update({
        where: { id: m.id },
        data: {
          lastBookingId: null,
          lastBookingStatus: null,
          lastBookingBonus: null,
          rideCardMsgId: null,
          liveLocMsgId: null,
          rideStartedAt: null,
        },
      });
    }
    } catch (e) {
      console.error(`[sweep] member ${m.id} skipped this tick:`, e instanceof Error ? e.message.split("\n")[0] : e);
    }
  }

  // 🔨 GARAJ v2: settle due auctions once per sweep (no new poller; no-ops when "garajx" OFF).
  try {
    const { settleAuctions } = await import("./garajService");
    await settleAuctions();
  } catch (e) {
    console.error("[garaj] auction settle failed:", e);
  }

  // 📈 GARAJ v2 #3: recompute demand waves (self-guarded to ≤ every 15 min via an
  // AppState nextRecalcAt timestamp — cheap no-op on most sweeps; OFF-safe).
  try {
    const { recomputeDemand } = await import("./garajService");
    await recomputeDemand();
  } catch (e) {
    console.error("[garaj] demand recompute failed:", e);
  }

  // 🏭 GARAJ v2 #5: apply finished Workshop craft jobs (idempotent; frees the slot). No new
  // poller — piggybacks this sweep. OFF-safe (no-ops when "garajx" is off).
  try {
    const { settleCraftJobs } = await import("./garajService");
    await settleCraftJobs();
  } catch (e) {
    console.error("[garaj] craft settle failed:", e);
  }

  // 🔥 P-Fuel-C: fuel-push sweep. Per-car 30% warn + 0% empty triggers, 1×/car/day, Tashkent
  // quiet-hours (23:00–07:00) DEFER (not silent — sent at 07:00 next morning). No new poller.
  // Hard cap: ≤2 fuel pushes/owner/day. OFF-safe (motorolami flag + pushFeatureOn knob).
  try {
    const { sweepFuelPushes } = await import("./garajService");
    await sweepFuelPushes(async (chatId, html) => {
      await bot.api.sendMessage(chatId, html, { parse_mode: "HTML" }).catch(() => undefined);
    });
  } catch (e) {
    console.error("[garaj] fuel push failed:", e);
  }

  // 🧾 SMS-parity: deliver any ride fares kas finalized AFTER the finish card was sent. Piggybacks
  // this sweep (no new poller) — sends "Yo'l haqi: …" the moment kas posts the payment, then clears.
  try {
    await resolvePendingFares(bot, ds);
  } catch (e) {
    console.error("[fare] pending resolve failed:", e);
  }

  // tier the next sweep (no extra kas call — reuse byPhone): a rider still WAITING for a driver
  // (active booking, no car assigned yet) → poll 5s so "Haydovchi topildi" lands in seconds like the
  // kas SMS; any active ride (assigned / in-trip — arrival is WS-instant) → 15s; idle → 90s.
  const activeMembers = linked.filter((m) => m.phone && byPhone.has(m.phone.replace(/\D/g, "").slice(-9)));
  const awaitingDriver = activeMembers.filter((m) => {
    const b = byPhone.get(m.phone!.replace(/\D/g, "").slice(-9));
    return b ? !b.carNumber : false;
  }).length;
  return { active: activeMembers.length, awaitingDriver };
}

// Match the just-finished ride to a kas bookingReports row to read its FINAL fare. kas history uses
// a SEPARATE id space from the live booking id (booking 47115 ↔ report 133373) and exposes NO link
// field, so `h.id === bid` almost never matches — that's why the fare message went missing. Match by
// the driver's car instead (history is id-desc → first hit = most recent ride with that car); fall
// back to the most recent paid ride that isn't stale (within ~1h of finish) when the car is unknown.
function matchFareRow(hist: RideHistoryItem[], bid: number, carNumber?: string, sinceMs?: number): RideHistoryItem | undefined {
  const norm = (s: string | undefined) => (s ?? "").replace(/\s/g, "").toUpperCase();
  const paid = hist.filter((h) => h.payment > 0);
  const byId = paid.find((h) => h.id === bid);
  if (byId) return byId; // harmless if a config ever does share ids
  if (carNumber) {
    const car = paid.find((h) => norm(h.carNumber) === norm(carNumber));
    if (car) return car;
  }
  const fresh = sinceMs ? paid.filter((h) => { const t = Date.parse(h.at); return !Number.isFinite(t) || t >= sinceMs - 60 * 60 * 1000; }) : paid;
  return fresh[0]; // most recent paid ride (id-desc)
}

// 🧾 Deliver ride fares that kas finalized AFTER the finish card was sent (SMS-parity). Called once
// per sweep from pushBookingUpdates — NOT a new poller. A `farepending:<bid>` marker
// (chatId|phone|attempts|carNumber|createMs, created at finish when the fare wasn't ready) drives it:
// re-query kas and, the moment a payment posts, send "Yo'l haqi: …" exactly once (a faredone:<bid>
// claim guards a finish re-entry) then clear the marker. Gives up after FARE_MAX_ATTEMPTS sweeps.
const FARE_MAX_ATTEMPTS = 20;
async function resolvePendingFares(bot: Bot, ds: KasDataSource): Promise<void> {
  const pending = await prisma.appState.findMany({ where: { key: { startsWith: "farepending:" } } });
  for (const p of pending) {
    const bid = Number(p.key.split(":")[1] ?? 0);
    const [chatId, phone, attRaw, carRaw, sinceRaw] = p.value.split("|");
    const attempts = Number(attRaw ?? 0);
    const carNumber = carRaw || undefined; // absent on pre-fix markers
    const sinceMs = Number(sinceRaw) || undefined;
    let settled = !chatId || !phone || !bid; // malformed marker → drop it
    if (!settled) {
      try {
        const hist = await ds.getRideHistory(phone!, 6);
        const ride = matchFareRow(hist ?? [], bid, carNumber, sinceMs);
        if (ride && ride.payment > 0) {
          let firstSend = true;
          try {
            await prisma.appState.create({ data: { key: `faredone:${bid}`, value: "1" } });
          } catch {
            firstSend = false; // a prior pass already delivered this fare
          }
          if (firstSend) {
            const km = ride.distance ? ` · 📏 ${ride.distance} km` : "";
            const mins = ride.time ? ` · ⏱ ${ride.time} daq` : "";
            await bot.api
              .sendMessage(chatId!, `🧾 <b>Yo'l haqi: ${formatNumber(ride.payment)} so'm</b>${km}${mins}`, { parse_mode: "HTML" })
              .catch(() => undefined);
          }
          settled = true;
        }
      } catch {
        /* kas blip — retry next sweep */
      }
    }
    if (settled || attempts + 1 >= FARE_MAX_ATTEMPTS) {
      await prisma.appState.delete({ where: { key: p.key } }).catch(() => undefined);
    } else {
      await prisma.appState.update({ where: { key: p.key }, data: { value: `${chatId}|${phone}|${attempts + 1}|${carRaw ?? ""}|${sinceRaw ?? ""}` } }).catch(() => undefined);
    }
  }
}
