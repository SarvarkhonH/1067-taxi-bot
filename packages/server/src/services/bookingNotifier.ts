import type { Bot } from "grammy";
import { formatNumber } from "@t1067/shared";
import { prisma } from "../db";
import { getDataSource, type ActiveBookingLite } from "../kas";
import { incrementMission } from "./missionService";

function statusPush(b: ActiveBookingLite): string {
  const assigned = !!b.carNumber;
  let head: string;
  switch (b.status) {
    case "in_place":
    case "new":
    case "searching":
      head = assigned ? "🚖 Haydovchi yo'lga chiqdi!" : "🔍 Haydovchi qidirilyapti…";
      break;
    case "called":
    case "accepted":
    case "on_the_way":
      head = "🚖 Haydovchi yo'lda!";
      break;
    case "arrived":
      head = "✅ Haydovchingiz yetib keldi!";
      break;
    case "started":
      head = "🚗 Safar boshlandi";
      break;
    default:
      head = `ℹ️ Buyurtma holati: ${b.status}`;
  }
  let s = `${head}\n📍 ${b.addressName}`;
  if (assigned) s += `\n🚘 Mashina: <b>${b.carNumber}</b>`;
  if (b.clientBonus) s += `\n💰 Bu safardan: <b>+${formatNumber(b.clientBonus)} so'm</b>`;
  return `${s}\n\nBatafsil: «📍 Buyurtmam»`;
}

/** Poll active bookings and push status changes to linked users (real-time ride tracking). */
export async function pushBookingUpdates(bot: Bot): Promise<void> {
  let bookings: ActiveBookingLite[];
  try {
    bookings = await getDataSource().listActiveBookings();
  } catch {
    return;
  }
  const byPhone = new Map(bookings.map((b) => [b.phoneNorm, b]));

  const linked = await prisma.member.findMany({
    where: { telegramUser: { isNot: null }, phone: { not: null } },
    include: { telegramUser: true },
  });

  for (const m of linked) {
    const norm = m.phone!.replace(/\D/g, "").slice(-9);
    const b = byPhone.get(norm);
    const chatId = m.telegramUser!.id;
    if (b) {
      if (m.lastBookingId !== b.id || m.lastBookingStatus !== b.status) {
        await bot.api.sendMessage(chatId, statusPush(b), { parse_mode: "HTML" }).catch(() => undefined);
        // admins know every booking session: alert on a NEW order from a bot user
        if (m.lastBookingId !== b.id) {
          const { alertAdmins } = await import("./economyService");
          await alertAdmins(`🚖 Yangi buyurtma: <b>${m.fullName}</b> → ${b.addressName}${b.carNumber ? ` · ${b.carNumber}` : " · haydovchi qidirilyapti"}`).catch(() => undefined);
        }
        await prisma.member.update({
          where: { id: m.id },
          data: {
            lastBookingId: b.id,
            lastBookingStatus: b.status,
            ...(b.carNumber ? { lastBookingCar: b.carNumber } : {}),
            // capture the fare-derived cashback NOW — kas drops the booking
            // from its active list on finish, taking clientBonus with it
            ...(b.clientBonus ? { lastBookingBonus: b.clientBonus } : {}),
          },
        });
      }
    } else if (m.lastBookingId) {
      // ride just finished → credit the ride quests + league score
      await incrementMission(m.id, "daily_ride").catch(() => undefined);
      await incrementMission(m.id, "weekly_rides").catch(() => undefined);
      await import("./weeklyService")
        .then((w) => w.addScore(m.id, "ride"))
        .catch(() => undefined);

      // 🎲 variable cashback roll (idempotent per ride; base captured mid-ride)
      let rollLine = "";
      try {
        const { rollRideCashback, renderRideRoll } = await import("./cashbackService");
        const roll = await rollRideCashback(m.id, m.lastBookingId);
        if (roll) rollLine = `\n${renderRideRoll(roll)}`;
      } catch (e) {
        console.error("[cashback] roll failed:", e);
      }

      // 🚗 flat driver thank-you per completed trip (idempotent, daily-capped)
      let driverId: number | null = null;
      if (m.lastBookingCar) {
        const driver = await prisma.member.findFirst({
          where: { type: "driver", carNumber: m.lastBookingCar },
          select: { id: true },
        });
        if (driver && driver.id !== m.id) {
          driverId = driver.id;
          try {
            const { DRIVER_DAILY_BONUS_CAP, DRIVER_RIDE_BONUS } = await import("@t1067/shared");
            const since = new Date(Date.now() - 24 * 3600 * 1000);
            const today = await prisma.coinTxn.aggregate({
              where: { memberId: driver.id, kind: "driver_bonus", createdAt: { gte: since } },
              _sum: { amount: true },
            });
            if ((today._sum.amount ?? 0) + DRIVER_RIDE_BONUS <= DRIVER_DAILY_BONUS_CAP) {
              const { grantCoins } = await import("./coinService");
              await grantCoins(driver.id, DRIVER_RIDE_BONUS, "driver_bonus", "Safar uchun rahmat-bonus", `driver_bonus:${m.id}:${m.lastBookingId}`);
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
                .sendMessage(chatId, `🎁 Taklif sovg'asi ochildi: <b>+${formatNumber(ref.rewardReferee)} coin</b> — birinchi safaringiz muborak!`, { parse_mode: "HTML" })
                .catch(() => undefined);
            }
          }
          const refTg = await prisma.telegramUser.findUnique({ where: { id: ref.referrerId } });
          if (refTg?.memberId && ref.rewardReferrer > 0) {
            const g = await grantCoins(refTg.memberId, ref.rewardReferrer, "referral", `Do'stingiz birinchi safarini qildi 🚕`, `ref_ride:${ref.id}`);
            if (g.ok) {
              await bot.api
                .sendMessage(refTg.id, `🎉 Taklif qilgan do'stingiz birinchi safarini qildi!\n👥 Sizga <b>+${formatNumber(ref.rewardReferrer)} coin</b> tushdi.`, { parse_mode: "HTML" })
                .catch(() => undefined);
            }
          }
          await prisma.referral.update({ where: { id: ref.id }, data: { referrerPaidAt: new Date() } });
        }
      } catch (e) {
        console.error("[referral_ride] failed:", e);
      }

      // tip buttons when we know which driver drove (rider's own coins, closed-loop)
      const tipKb = driverId
        ? { inline_keyboard: [[500, 1000, 2000].map((a) => ({ text: `🙏 ${formatNumber(a)} coin`, callback_data: `tip:${driverId}:${a}` }))] }
        : undefined;
      await bot.api
        .sendMessage(
          chatId,
          "🏁 Safaringiz yakunlandi! Rahmat 🙌" +
            rollLine +
            "\n🎯 Vazifalaringizni tekshiring — mukofot kutyapti!" +
            (tipKb ? "\n\n🚗 Haydovchiga coin bilan rahmat aytasizmi?" : ""),
          { parse_mode: "HTML", ...(tipKb ? { reply_markup: tipKb } : {}) },
        )
        .catch(() => undefined);
      const { alertAdmins } = await import("./economyService");
      await alertAdmins(`🏁 Safar yakunlandi: <b>${m.fullName}</b>${rollLine ? ` ·${rollLine.replace(/<[^>]+>/g, "")}` : ""}`).catch(() => undefined);
      await prisma.member.update({
        where: { id: m.id },
        data: { lastBookingId: null, lastBookingStatus: null, lastBookingCar: null, lastBookingBonus: null },
      });
    }
  }
}
