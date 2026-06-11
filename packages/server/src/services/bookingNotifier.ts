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
          data: { lastBookingId: b.id, lastBookingStatus: b.status, ...(b.carNumber ? { lastBookingCar: b.carNumber } : {}) },
        });
      }
    } else if (m.lastBookingId) {
      // ride just finished → credit the ride quests + league score
      await incrementMission(m.id, "daily_ride").catch(() => undefined);
      await incrementMission(m.id, "weekly_rides").catch(() => undefined);
      await import("./weeklyService")
        .then((w) => w.addScore(m.id, "ride"))
        .catch(() => undefined);
      // tip buttons when we know which driver drove (rider's own coins, closed-loop)
      let tipKb: { inline_keyboard: { text: string; callback_data: string }[][] } | undefined;
      if (m.lastBookingCar) {
        const driver = await prisma.member.findFirst({
          where: { type: "driver", carNumber: m.lastBookingCar },
          select: { id: true },
        });
        if (driver && driver.id !== m.id) {
          tipKb = {
            inline_keyboard: [[1000, 2000, 5000].map((a) => ({ text: `🙏 ${formatNumber(a)} coin`, callback_data: `tip:${driver.id}:${a}` }))],
          };
        }
      }
      await bot.api
        .sendMessage(
          chatId,
          "🏁 Safaringiz yakunlandi! Rahmat 🙌\nCashback tez orada hisobingizda ko'rinadi.\n🎯 Vazifalaringizni tekshiring — mukofot kutyapti!" +
            (tipKb ? "\n\n🚗 Haydovchiga coin bilan rahmat aytasizmi?" : ""),
          { parse_mode: "HTML", ...(tipKb ? { reply_markup: tipKb } : {}) },
        )
        .catch(() => undefined);
      const { alertAdmins } = await import("./economyService");
      await alertAdmins(`🏁 Safar yakunlandi: <b>${m.fullName}</b>`).catch(() => undefined);
      await prisma.member.update({ where: { id: m.id }, data: { lastBookingId: null, lastBookingStatus: null, lastBookingCar: null } });
    }
  }
}
