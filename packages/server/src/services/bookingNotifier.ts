// Live ride experience: ONE card per ride, edited in place through every
// status (was 11-12 separate messages), plus a MOVING driver pin (Telegram
// live location) and an honest queue line. The finish closes the loop with a
// peak-end summary: variable cashback roll BIG + driver tips + rebook.
//
// The 90s sweep is also the ride METER (rideStartedAt → minutes) powering the
// ETA-guess game now and the Garaj earn in Wave B.
import { InlineKeyboard, type Bot } from "grammy";
import { formatNumber, haversineKm } from "@t1067/shared";
import { prisma } from "../db";
import { getDataSource, type ActiveBookingLite, type BookingDriver, type KasDataSource } from "../kas";
import { incrementMission } from "./missionService";

const CITY_KMH = 24;
const SEARCHING = new Set(["in_place", "new", "searching"]);
const CANCELLABLE = new Set(["in_place", "searching", "new", "called", "accepted", "on_the_way"]);

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

interface CardCtx {
  queuePos?: number; // 1-based position among searching orders
  freeDrivers?: number;
  driver?: BookingDriver | null;
  hasGuess?: boolean;
  spinUsed?: boolean;
  garage?: { name: string; emoji: string; amount: number } | null; // live earn estimate
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
 *  dsOverride exists for the sweep-simulation test. */
export async function pushBookingUpdates(bot: Bot, dsOverride?: KasDataSource): Promise<void> {
  const ds = dsOverride ?? getDataSource();
  let bookings: ActiveBookingLite[];
  try {
    bookings = await ds.listActiveBookings();
  } catch {
    return;
  }
  const byPhone = new Map(bookings.map((b) => [b.phoneNorm, b]));
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
    where: { telegramUser: { isNot: null }, phone: { not: null } },
    include: { telegramUser: true },
  });

  for (const m of linked) {
    const norm = m.phone!.replace(/\D/g, "").slice(-9);
    const b = byPhone.get(norm);
    const chatId = m.telegramUser!.id;

    if (b) {
      const isNewRide = m.lastBookingId !== b.id;
      const statusChanged = isNewRide || m.lastBookingStatus !== b.status;
      const driver = b.carNumber ? await driverByCar(b.carNumber) : null;

      const ctx: CardCtx = {
        driver,
        freeDrivers,
        queuePos: SEARCHING.has(b.status) && !b.carNumber ? searchQueue.findIndex((x) => x.id === b.id) + 1 || undefined : undefined,
        hasGuess: !!(await prisma.rideGuess.findUnique({ where: { memberId_bookingId: { memberId: m.id, bookingId: b.id } } }).catch(() => null)),
        spinUsed: !!(await prisma.wheelSpin.findFirst({ where: { memberId: m.id, bookingId: b.id } }).catch(() => null)),
      };
      if (b.status === "started" && m.rideStartedAt) {
        const { equippedEstimate } = await import("./garageService");
        ctx.garage = await equippedEstimate(m.id, (Date.now() - m.rideStartedAt.getTime()) / 60_000).catch(() => null);
      }

      // ride meter: first sighting of "started"
      const rideStartedAt = b.status === "started" && (isNewRide || !m.rideStartedAt) ? new Date() : m.rideStartedAt;

      // ── the ONE live card ──
      let cardId = isNewRide ? null : m.rideCardMsgId;
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

      // ── the moving pin ──
      let pinId = isNewRide ? null : m.liveLocMsgId;
      if (driver?.lat && driver?.lng) {
        if (!pinId) {
          const pin = await bot.api
            .sendLocation(chatId, driver.lat, driver.lng, { live_period: 3600, disable_notification: true })
            .catch(() => null);
          pinId = pin?.message_id ?? null;
        } else {
          await bot.api.editMessageLiveLocation(chatId, pinId, driver.lat, driver.lng).catch(async () => {
            // live period expired or message gone → fresh pin
            const pin = await bot.api
              .sendLocation(chatId, driver!.lat, driver!.lng, { live_period: 3600, disable_notification: true })
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
      await incrementMission(m.id, "daily_ride").catch(() => undefined);
      await incrementMission(m.id, "weekly_rides").catch(() => undefined);
      await import("./weeklyService")
        .then((w) => w.addScore(m.id, "ride"))
        .catch(() => undefined);

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
        const roll = await rollRideCashback(m.id, m.lastBookingId);
        {
          const { fundAddRide } = await import("./featureFlags");
          await fundAddRide(m.lastBookingId).catch(() => null); // 🏆 Mashina fondi: 100 so'm/safar
        }
        if (roll) rollLine = `\n${renderRideRoll(roll)}`;
      } catch (e) {
        console.error("[cashback] roll failed:", e);
      }

      // 💎 ride-drop collectibles: founder (first 100 riders) + district badge
      let questLine = "";
      try {
        const { dropDistrictBadge, mintItem } = await import("./itemService");
        const f = await mintItem(m.id, "founder", { free: true });
        if (f.ok) questLine += `
🌟 <b>Asoschi nishoni</b> — birinchi 100 ichidasiz! (#${f.serial})`;
        // district from the finished ride's pickup (lastPickupId set at dispatch)
        if (m.lastPickupId && m.lastPickupName) {
          const d = await dropDistrictBadge(m.id, m.lastPickupId, m.lastPickupName);
          if (d) questLine += `
📍 Yangi tuman ochildi: <b>${d.name}</b> (${d.total}/10)${d.sayyoh ? " · 🗺 SAYYOH +5000!" : ""}`;
        }
      } catch (e) {
        console.error("[items] drop failed:", e);
      }

      // ⏱ ETA-guess resolution (uses the ride meter)
      const guessLine = await resolveGuess(m.id, m.lastBookingId, m.rideStartedAt).catch(() => "");

      // 🚗 Garaj earn — the equipped car worked while the ride ran
      let garageLine = "";
      if (m.rideStartedAt) {
        try {
          const { earnForRide } = await import("./garageService");
          const e = await earnForRide(m.id, m.lastBookingId, (Date.now() - m.rideStartedAt.getTime()) / 60_000);
          if (e) garageLine = `
🚗 ${e.name} ishladi: <b>+${formatNumber(e.amount)}</b> tanga`;
        } catch (err) {
          console.error("[garage] earn failed:", err);
        }
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
                await grantCoins(driver.id, rebate, "driver_bonus", `Tier-bonus (${driver.driverTier})`, `driver_bonus:${m.id}:${m.lastBookingId}`);
              }
            }
            // quest progress: completed-count only
            await incrementMission(driver.id, "drv_daily_5").catch(() => undefined);
            await incrementMission(driver.id, "drv_weekly_25").catch(() => undefined);
            await incrementMission(driver.id, "drv_weekly_40").catch(() => undefined);
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

      // ── peak-end summary card (message #3 of the ride) ──
      const tipKb = driverId
        ? new InlineKeyboard()
            .text("🙏 500", `tip:${driverId}:500`)
            .text("🙏 1 000", `tip:${driverId}:1000`)
            .text("🙏 2 000", `tip:${driverId}:2000`)
            .row()
            .text("🔁 Yana 1067", "bk:now")
        : new InlineKeyboard().text("🔁 Yana 1067", "bk:now");
      await bot.api
        .sendMessage(
          chatId,
          "🏁 <b>Safaringiz yakunlandi — rahmat!</b>" +
            rollLine +
            guessLine +
            garageLine +
            questLine +
            "\n🎯 Vazifalaringizni «🎁 Bonuslar»da tekshiring." +
            (driverId ? "\n\n🚗 Haydovchiga coin bilan rahmat aytasizmi?" : ""),
          { parse_mode: "HTML", reply_markup: tipKb },
        )
        .catch(() => undefined);

      const { alertAdmins } = await import("./economyService");
      await alertAdmins(`🏁 Safar yakunlandi: <b>${m.fullName}</b>${rollLine ? ` ·${rollLine.replace(/<[^>]+>/g, "")}` : ""}`).catch(() => undefined);
      await prisma.member.update({
        where: { id: m.id },
        data: {
          lastBookingId: null,
          lastBookingStatus: null,
          lastBookingCar: null,
          lastBookingBonus: null,
          rideCardMsgId: null,
          liveLocMsgId: null,
          rideStartedAt: null,
        },
      });
    }
  }
}
