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

  // 📵 BLK-1: yuborish `pushMessage` orqali — bloklaganga urinilmaydi, 403 esa
  // "link_remind" nomi bilan BlockEvent'ga tushadi (avval bu xato butunlay yo'qolardi).
  const { pushMessage } = await import("./pushSend");
  let sent = 0;
  for (const { id } of pending) {
    const outcome = await pushMessage(
      bot,
      id,
      "link_remind",
      "👋 Siz hali 1067 raqamingizni ulamadingiz.\n\n" +
        "Raqamingizni ulasangiz — <b>+5 000 tanga sovg'a</b> va barcha imkoniyatlar ochiladi 🎁\n\n" +
        "/start — bosing va «📱 Raqamni ulashish» tugmasini tanlang.",
    );
    // Marker faqat haqiqatan yetkazilganda (avvalgi xatti-harakat: throw → marker yo'q)
    if (outcome === "sent") {
      sent++;
      await prisma.appState.create({ data: { key: `${STATE_PREFIX}${id}`, value: "1" } }).catch(() => undefined);
    }
  }

  // HAQIQATAN yetkazilgani sanaladi (avval "nomzod" soni yozilardi — log yolg'on hisoblardi)
  if (pending.length) console.log(`[linkReminder] ${sent}/${pending.length} ta eslatma yuborildi`);
}
