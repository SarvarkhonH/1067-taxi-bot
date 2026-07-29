// 📢 Bir martalik: haydovchilarga "ilovani yangilang" xabari — 2026-07-29 versiya-drift tuzatishidan
// keyin (webAppUrl.ts, §75 davomi). Haydovchilar smena boshida Mini App'ni ochib, soatlab
// background'ga o'tkazmasdan ochiq ushlaydi — versiya-qorovulning yangi 60s davriy tekshiruvi FAQAT
// bugundan keyin ochilgan/qayta ochilgan sessiyalarni tuzatadi; hozir ALLAQACHON ochiq turgan eski
// sessiyalar (masalan mashinaga o'rnatilgan telefon) baribir eski JS bilan qoladi — ularga faqat
// yangi (versiyali) URL bilan qayta ochish tugmasi yordam beradi.
// FAQAT haydovchilarga (Member.type='driver'), bloklamagan + ban'siz. Rate-limit ~22/s (broadcast.ts
// bilan bir xil qoida). Yugurtirish: npx dotenv -e ../../.env -- npx tsx src/scripts/notifyDriversRefresh.ts
import { Bot, InlineKeyboard } from "grammy";
import { prisma } from "../db";
import { env } from "../env";
import { webAppUrl, canWebApp } from "../bot/webAppUrl";

const OWNER_TG = "6506297119";

async function main(): Promise<void> {
  if (!env.BOT_TOKEN) { console.error("BOT_TOKEN yo'q"); process.exit(1); }
  if (!canWebApp) { console.error("TELEGRAM_WEBAPP_URL https:// bilan boshlanmaydi — web_app tugma ishlamaydi"); process.exit(1); }
  const bot = new Bot(env.BOT_TOKEN); // faqat API uchun — polling ISHGA TUSHIRILMAYDI

  const drivers = await prisma.telegramUser.findMany({
    where: { blockedAt: null, member: { type: "driver", banned: false } },
    select: { id: true },
  });
  console.log(`Yuborish: ${drivers.length} haydovchiga`);

  const text =
    "🔄 <b>Ilova yangilandi</b>\n\nIlovada bir necha tuzatish chiqdi. Pastdagi tugmani bosib qayta oching — " +
    "yangi versiya avtomatik yuklanadi.";
  const kb = new InlineKeyboard().webApp("🚀 Ilovani yangilash", webAppUrl("driver"));

  let ok = 0;
  let fail = 0;
  for (let i = 0; i < drivers.length; i++) {
    try {
      await bot.api.sendMessage(drivers[i]!.id, text, { parse_mode: "HTML", reply_markup: kb });
      ok++;
    } catch (e) {
      fail++;
      console.error(`  fail tg=${drivers[i]!.id}:`, e instanceof Error ? e.message : e);
    }
    if (i % 22 === 21) await new Promise((r) => setTimeout(r, 1000)); // ~22 msg/s, Telegram flood limitidan past
  }

  console.log(`\nYetkazildi: ${ok} · Yetmadi: ${fail}`);
  await bot.api
    .sendMessage(OWNER_TG, `📢 <b>Haydovchilarga yangilanish xabari yuborildi</b>\n📬 Yetkazildi: <b>${ok}</b>\n${fail ? `❌ Yetmadi: <b>${fail}</b>` : ""}`, { parse_mode: "HTML" })
    .catch(() => undefined);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
