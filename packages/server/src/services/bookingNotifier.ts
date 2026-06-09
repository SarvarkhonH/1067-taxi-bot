import type { Bot } from "grammy";
import { formatNumber } from "@t1067/shared";
import { prisma } from "../db";
import { getDataSource, type ActiveBookingLite } from "../kas";

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
        await prisma.member.update({ where: { id: m.id }, data: { lastBookingId: b.id, lastBookingStatus: b.status } });
      }
    } else if (m.lastBookingId) {
      await bot.api
        .sendMessage(chatId, "🏁 Safaringiz yakunlandi! Rahmat 🙌\nCashback tez orada hisobingizda ko'rinadi.", { parse_mode: "HTML" })
        .catch(() => undefined);
      await prisma.member.update({ where: { id: m.id }, data: { lastBookingId: null, lastBookingStatus: null } });
    }
  }
}
