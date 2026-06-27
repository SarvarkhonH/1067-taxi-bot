import type { Bot } from "grammy";
import { prisma } from "../db";

const REMIND_AFTER_MS = 24 * 60 * 60_000; // 24 soat
const STATE_PREFIX = "remind24:";

export async function dispatchLinkReminders(bot: Bot): Promise<void> {
  const cutoff = new Date(Date.now() - REMIND_AFTER_MS);

  // Ulashilmagan, 24 soatdan oshgan TelegramUser'lar
  const candidates = await prisma.telegramUser.findMany({
    where: { memberId: null, createdAt: { lt: cutoff } },
    select: { id: true },
  });
  if (!candidates.length) return;

  // Allaqachon eslatma yuborilganlarni filtr
  const sentKeys = await prisma.appState.findMany({
    where: { key: { in: candidates.map((c) => `${STATE_PREFIX}${c.id}`) } },
    select: { key: true },
  });
  const sentSet = new Set(sentKeys.map((k) => k.key));

  const pending = candidates.filter((c) => !sentSet.has(`${STATE_PREFIX}${c.id}`));
  if (!pending.length) return;

  for (const { id } of pending) {
    try {
      await bot.api.sendMessage(
        id,
        "👋 Siz hali 1067 raqamingizni ulamadingiz.\n\n" +
          "Raqamingizni ulasangiz — <b>+5 000 tanga sovg'a</b> va barcha imkoniyatlar ochiladi 🎁\n\n" +
          "/start — bosing va «📱 Raqamni ulashish» tugmasini tanlang.",
        { parse_mode: "HTML" },
      );
      await prisma.appState.create({ data: { key: `${STATE_PREFIX}${id}`, value: "1" } }).catch(() => undefined);
    } catch {
      // Foydalanuvchi botni bloklagan bo'lishi mumkin — o'tkazib yuboramiz
    }
  }

  if (pending.length) console.log(`[linkReminder] ${pending.length} ta eslatma yuborildi`);
}
