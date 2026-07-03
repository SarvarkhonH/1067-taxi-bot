// Live ride experience: ONE card per ride, edited in place through every
// status (was 11-12 separate messages), plus a MOVING driver pin (Telegram
// live location) and an honest queue line. The finish closes the loop with a
// peak-end summary: variable cashback roll BIG + driver tips + rebook.
//
// The 90s sweep is also the ride METER (rideStartedAt → minutes) powering the
// ETA-guess game.
import { InlineKeyboard, type Bot } from "grammy";
import type { Prisma } from "@prisma/client";
import { formatNumber, haversineKm, inflateOnline } from "@t1067/shared";
import { prisma } from "../db";
import { getDataSource, type ActiveBookingLite, type BookingDriver, type KasDataSource, type RideHistoryItem } from "../kas";
import { incrementMission } from "./missionService";
import { kasMapSocket } from "./kasMapSocket";
import { resolveDisplayName } from "./memberService";
import { markRideActive } from "./tierLoyaltyService";

const CITY_KMH = 24;
// kas lifecycle: new → take → in_place → delivered. "in_place" is normalized to "started" in the
// kas client (driver at pickup + meter running = in-trip), so it is NOT searching and NOT cancellable.
const SEARCHING = new Set(["new", "searching"]);
// 0.3 sweep-diet: wait-comp markers already written this process-lifetime (see the create below)
const waitMarkerSeen = new Set<string>();
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
  trackCta?: boolean; // "trackcta" flag: share button mints the LIVE track link (bk:track)
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
  if (b.status === "new" || (SEARCHING.has(b.status) && !b.carNumber)) {
    // "new" = the order is being OFFERED to drivers — NOT yet accepted (acceptance is "take").
    // So never render it as «yo'lda»: a candidate car → "taklif qilinmoqda", otherwise "qidirilyapti".
    lines.push(b.status === "new" && b.carNumber ? "📤 <b>Haydovchiga taklif qilinmoqda…</b>" : "🔍 <b>Haydovchi qidirilyapti…</b>");
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
    if (c.trackCta) {
      // mid-ride is when family wants to watch — mint the live link on tap (bk:track)
      kb.text("🛡 Oilaga jonli kuzatuv yuborish", "bk:track").row();
      any = true;
    }
  } else if (c.driver) {
    // en-route (driver assigned, coming): 📞 call (callback → tap-to-call number;
    // tel: inline buttons are rejected by Telegram — proven) + 🛡 share trip. ✖ added below.
    kb.text("📞 Qo'ng'iroq", "bk:call");
    if (c.trackCta) {
      // trackcta: share becomes a callback minting the REAL live-track link (viral loop)
      kb.text("🛡 Jonli kuzatuv", "bk:track");
    } else {
      const share = `🚕 Men 1067 taxida ketyapman${b.carNumber ? ` — mashina ${b.carNumber}` : ""}. Kuzating: @koson1067bot`;
      kb.url("🛡 Ulashish", `https://t.me/share/url?url=${encodeURIComponent("https://t.me/koson1067bot")}&text=${encodeURIComponent(share)}`);
    }
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
    const onlineReal = (await ds.getMainReport()).onlineDrivers;
    freeDrivers = onlineReal ? inflateOnline(onlineReal) : undefined; // riders see ~2× (display only; dispatch uses real)
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

  // 0.3 sweep-diet: fetch ONLY sweep-relevant members — someone with a live kas booking right now
  // (phone matches the active list) or unfinished ride state to close out (lastBookingId set).
  // Previously this pulled EVERY linked member (N rows + N loop bodies) every 5-90s tick; idle
  // members have nothing to do here. (The tier-loyalty daily pass that used to ride this loop for
  // all members moved to the 15-min tick — runTierLoyaltyDailyAll.)
  const activeNorms = [...byPhone.keys()].filter(Boolean);
  // one flag read per tick (30s-cached anyway) — every card this tick renders the same share button
  const trackCta = await import("./featureFlags").then((f) => f.featureOn("trackcta")).catch(() => false);
  const linked = await prisma.member.findMany({
    where: {
      telegramUser: { isNot: null },
      phone: { not: null },
      ...(opts?.memberScope ?? {}),
      OR: [{ lastBookingId: { not: null } }, ...activeNorms.map((p) => ({ phone: { endsWith: p } }))],
    },
    include: { telegramUser: true },
  });

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
      // "new" = the booking is being OFFERED (not accepted) — don't show kas's candidate car as the
      // assigned driver (no pin, no "topildi" ping, no ETA). Only "take"+ has a real driver.
      const driver = b.carNumber && b.status !== "new" ? await driverByCar(b.carNumber) : null;
      // trace which booking/car the bot resolved for this member — proves the correct taxi vs the
      // stale-booking bug. Logged only on a transition so Render logs stay readable.
      if (isNewRide || statusChanged) {
        console.log(
          `[booking] m${m.id} → b${b.id} ${b.status} car=${b.carNumber || "—"} drv=${driver?.fullName || "—"} (prev b${m.lastBookingId ?? "—"} car=${m.lastBookingCar ?? "—"})`,
        );
      }

      // 🪙 wait-comp timing markers (feature "waitcomp"): server-side, sweep-resolution timestamps —
      // NEVER trust the client for money-relevant elapsed time. First tick in each phase wins (unique
      // key); the in-memory seen-set stops the sweep from re-attempting a guaranteed-P2002 INSERT on
      // every later tick (0.3 sweep-diet — this was one failed write per active ride per 5s). A
      // restart just costs one extra attempt per live ride; the unique key stays the real guard.
      {
        const wkey = `${SEARCHING.has(b.status) ? "waitstart" : "waitfound"}:${b.id}`;
        if (!waitMarkerSeen.has(wkey)) {
          if (waitMarkerSeen.size > 5000) waitMarkerSeen.clear(); // bound memory
          await prisma.appState
            .create({ data: { key: wkey, value: String(Date.now()) } })
            .then(() => waitMarkerSeen.add(wkey))
            .catch(() => waitMarkerSeen.add(wkey)); // P2002 = already there → equally "seen"
        }
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
        trackCta,
      };

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
      } else if (cardId && b.carNumber && b.carNumber !== m.lastBookingCar && b.status !== "new" && b.status !== "arrived" && b.status !== "started") {
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
        await alertAdmins(`🚖 Yangi buyurtma: <b>${resolveDisplayName(m.displayName || m.fullName, m.telegramUser)}</b> → ${b.addressName}${b.carNumber ? ` · ${b.carNumber}` : " · haydovchi qidirilyapti"}`).catch(() => undefined);
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
            ...(b.carNumber && b.status !== "new" ? { lastBookingCar: b.carNumber } : {}), // don't record a "new" candidate as the assigned car
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
        // 🎁 "topilmadi" vaucheri (feature "waitcomp"): the search DIED while still SEARCHING — no
        // driver ever accepted (status never left new/searching). The wait must not be for nothing:
        // record a next-ride voucher worth the same ramp amount + apologize honestly. NOT paid now —
        // paying cash on a failed search would be an open farm (order→wait→cancel→collect); the
        // voucher pays only on the next COMPLETED ride, which is also the come-back-next-time hook.
        if (SEARCHING.has(m.lastBookingStatus ?? "") && bid) {
          try {
            const startRow = await prisma.appState.findUnique({ where: { key: `waitstart:${bid}` } });
            const start = startRow ? Number(startRow.value) : NaN;
            if (Number.isFinite(start)) {
              const waitSeconds = Math.floor((Date.now() - start) / 1000);
              const { noteWaitVoucher } = await import("./cashbackService");
              const worth = (await resilient("waitvoucher", () => noteWaitVoucher(m.id, bid!, waitSeconds))) ?? 0;
              if (worth > 0) {
                await bot.api
                  .sendMessage(
                    chatId,
                    `😔 <b>Uzr — bu safar mashina topib bera olmadik.</b>\n` +
                      `Kutganingiz bekor ketmaydi: <b>+${formatNumber(worth)} tanga</b> keyingi safaringizda avtomatik qo'shiladi. 🚕`,
                    { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("🔁 Qayta chaqirish", "bk:now") },
                  )
                  .catch(() => undefined);
              }
            }
          } catch (e) {
            console.error("[waitvoucher] note failed:", e);
          }
        }
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
        // 🏅 a real finished ride is a decay-grace reset (flag-gated, client-only)
        await markRideActive(m.id, m.type);
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

      // 🪙 wait compensation (feature "waitcomp"): PASSIVE tanga for the search time before a
      // driver accepted — the wait itself earns, no game (owner rejected the tap-game). Server-timed
      // via the waitstart/waitfound markers captured above (never client-reported time). Idempotent
      // per ride (WaitCompReward unique) + its own daily company budget — see cashbackService.
      // Also redeems a pending "topilmadi" voucher from a PREVIOUS failed search — this completed
      // ride is exactly the come-back moment the voucher was minted for.
      let waitCompLine = "";
      try {
        const [startRow, foundRow] = await Promise.all([
          prisma.appState.findUnique({ where: { key: `waitstart:${bid}` } }),
          prisma.appState.findUnique({ where: { key: `waitfound:${bid}` } }),
        ]);
        const start = startRow ? Number(startRow.value) : NaN;
        const found = foundRow ? Number(foundRow.value) : NaN;
        const { awardWaitComp, redeemWaitVoucher } = await import("./cashbackService");
        if (Number.isFinite(start) && Number.isFinite(found) && found > start) {
          const waitSeconds = Math.floor((found - start) / 1000);
          const paid = (await resilient("waitcomp", () => awardWaitComp(m.id, bid!, waitSeconds))) ?? 0;
          if (paid > 0) waitCompLine = `\n🪙 Kutish kompensatsiyasi: <b>+${formatNumber(paid)} tanga</b>`;
        }
        const voucher = (await resilient("waitvoucher-redeem", () => redeemWaitVoucher(m.id))) ?? 0;
        if (voucher > 0) waitCompLine += `\n🎁 O'tgan safargi uzrimiz: <b>+${formatNumber(voucher)} tanga</b> — qaytganingiz uchun rahmat!`;
      } catch (e) {
        console.error("[waitcomp] award failed:", e);
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
          // (driver welcome MOVED to JOIN — grantJoinWelcome on link, same as riders)
          try {
            const { DRIVER_DAILY_BONUS_CAP, DRIVER_TIER_REBATE } = await import("@t1067/shared");
            const { getBonusEcon } = await import("./bonusConfig");
            const econ = await getBonusEcon();
            const rebateByTier: Record<string, number> = {
              Bronza: 0,
              Kumush: econ.tierKumush ?? DRIVER_TIER_REBATE.Kumush ?? 50,
              Oltin: econ.tierOltin ?? DRIVER_TIER_REBATE.Oltin ?? 100,
              Olmos: econ.tierOlmos ?? DRIVER_TIER_REBATE.Olmos ?? 200,
            };
            const rebate = rebateByTier[driver.driverTier] ?? 0;
            if (rebate > 0) {
              const since = new Date(Date.now() - 24 * 3600 * 1000);
              const today = await prisma.coinTxn.aggregate({
                where: { memberId: driver.id, kind: "driver_bonus", createdAt: { gte: since } },
                _sum: { amount: true },
              });
              if ((today._sum.amount ?? 0) + rebate <= (econ.driverDailyCap ?? DRIVER_DAILY_BONUS_CAP)) {
                const { grantCoins } = await import("./coinService");
                await resilient("driver_bonus", () => grantCoins(driver.id, rebate, "driver_bonus", `Tier-bonus (${driver.driverTier})`, `driver_bonus:${m.id}:${m.lastBookingId}`)); // idempotent key
              }
            }
            // 🔥 Peak-hour bonus: driver earns extra tanga if ride completes in an active window
            try {
              const { getActivePeakBonus } = await import("./adminOps");
              const pkBonus = await getActivePeakBonus(Date.now());
              if (pkBonus > 0) {
                const { grantCoins } = await import("./coinService");
                const pkKey = `peak_bonus:${driver.id}:${m.lastBookingId}`;
                const existing = await prisma.coinTxn.findUnique({ where: { idempotencyKey: pkKey } }).catch(() => null);
                if (!existing) {
                  await grantCoins(driver.id, pkBonus, "peak_bonus", `🔥 Pik vaqt bonus`, pkKey);
                  const dtg = await prisma.telegramUser.findFirst({ where: { memberId: driver.id } });
                  if (dtg) await bot.api.sendMessage(dtg.id, `🔥 <b>Pik vaqt bonus!</b>\n💰 <b>+${pkBonus.toLocaleString("ru-RU")} tanga</b> — pik vaqtda buyurtma topshirdingiz!`, { parse_mode: "HTML" }).catch(() => undefined);
                }
              }
            } catch (e) {
              console.error("[peak bonus] failed:", e);
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

      // 🎁 Welcome bonus MOVED to JOIN — every new user (client OR driver) now gets the 5000 the
      // moment they link their phone (grantJoinWelcome in memberService.linkByPhone), no ride needed.
      // Was here on first ride; removed so nobody is double-paid (join-grant + ride-grant).

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
          const km = done.distance ? ` · 📏 ${(done.distance / 1000).toFixed(1)} km` : ""; // kas distance is METRES
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
              waitCompLine +
              guessLine +
              streakLine +
              questLine +
              "\n🎯 Vazifalaringizni «🎁 Bonuslar»da tekshiring." +
              (canPayFare ? "\n\n🪙 Yo'l haqini tanga bilan to'lashingiz mumkin 👇" : driverId ? "\n\n🚗 Haydovchiga tanga bilan rahmat aytasizmi?" : ""),
            { parse_mode: "HTML", reply_markup: tipKb },
          )
          .catch(() => undefined);
        const { alertAdmins } = await import("./economyService");
        await alertAdmins(`🏁 Safar yakunlandi: <b>${resolveDisplayName(m.displayName || m.fullName, m.telegramUser)}</b>${rollLine ? ` ·${rollLine.replace(/<[^>]+>/g, "")}` : ""}`).catch(() => undefined);
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

  // 🚐 Intercity trip transitions (OPEN→BOARDING→DEPARTED→COMPLETED / EXPIRED) + rider pushes.
  // Piggybacks this sweep (no new poller); OFF-safe (no-ops when `intercity` flag is OFF).
  try {
    const { sweepIntercityTrips } = await import("./intercityService");
    await sweepIntercityTrips(async (chatId, html) => {
      await bot.api.sendMessage(chatId, html, { parse_mode: "HTML" }).catch(() => undefined);
    });
  } catch (e) {
    console.error("[intercity] sweep failed:", e);
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
            const km = ride.distance ? ` · 📏 ${(ride.distance / 1000).toFixed(1)} km` : ""; // kas distance is METRES
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
