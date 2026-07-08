// 🍽 RESTORAN owner side — CONCIERGE V1 (RESTORAN_PLAN §0): operator harakati Telegram tugmalari
// EMAS, admin panel ("Restoran" tab, R3) orqali. Shuning uchun bu yerda shop.ts'dagi kabi
// [✅/❌] InlineKeyboard YO'Q — faqat "yangi buyurtma keldi, admin panelga kir" ma'lumot xabari.
import { Bot } from "grammy";
import { formatNumber } from "@t1067/shared";
import { prisma } from "../db";
import type { FoodOrderOwnerNotice } from "../services/restoranService";

const OWNER_TG = "6506297119"; // same single source as shop.ts/cashout.ts

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function tgOf(memberId: number): Promise<string | null> {
  const tu = await prisma.telegramUser.findFirst({ where: { memberId }, select: { id: true } });
  return tu?.id ?? null;
}

export async function notifyOwnerNewFoodOrder(bot: Bot, n: FoodOrderOwnerNotice): Promise<void> {
  const deliveryLine = n.isPickup ? "🚶 Olib ketish" : `🛵 ${esc(n.address)}`;
  await bot.api
    .sendMessage(
      OWNER_TG,
      `🍽 <b>YANGI RESTORAN BUYURTMASI</b> #${n.orderId}\n\n` +
        `🏪 <b>${esc(n.restaurantName)}</b> · ☎ ${esc(n.restaurantPhone)}\n` +
        `🍲 ${esc(n.itemsText)}\n` +
        `💵 <b>${formatNumber(n.totalSom)}</b> so'm (naqd)\n` +
        `${deliveryLine}\n` +
        `👤 ${esc(n.buyerName)} · 📞 ${esc(n.contact)}\n` +
        (n.note ? `💬 ${esc(n.note)}\n` : "") +
        `\n<i>Restoranga qo'ng'iroq qiling, keyin admin panel → Restoran'da holatni belgilang.</i>`,
      { parse_mode: "HTML" },
    )
    .catch(() => undefined);
}

// 📣 qulaylik #1: mijozga jonli-his beruvchi push — "Har holat o'tishida mijozga push" (RESTORAN_PLAN
// §3). Operator admin panelda tugma bosadi → mijoz shu zahoti botdan xabar oladi (poll'ni kutmasdan).
const STATUS_TEXT: Record<string, string> = {
  accepted: "✅ Buyurtmangiz qabul qilindi! Tez orada tayyorlanadi.",
  preparing: "🍳 Taomingiz tayyorlanmoqda...",
  delivering: "🛵 Buyurtmangiz yo'lda!",
  delivered: "✅ Buyurtmangiz yetkazildi. Yoqimli ishtaha!",
};

export async function notifyRiderOrderStatus(bot: Bot, n: { memberId: number; restaurantName: string; newStatus: string }): Promise<void> {
  const tg = await tgOf(n.memberId);
  if (!tg) return;
  const text = STATUS_TEXT[n.newStatus];
  if (!text) return;
  await bot.api.sendMessage(tg, `🍽 <b>${esc(n.restaurantName)}</b>\n${text}`, { parse_mode: "HTML" }).catch(() => undefined);
}

export async function notifyRiderOrderRejected(bot: Bot, n: { memberId: number; restaurantName: string; reason: string }): Promise<void> {
  const tg = await tgOf(n.memberId);
  if (!tg) return;
  await bot.api
    .sendMessage(tg, `🍽 <b>${esc(n.restaurantName)}</b>\n❌ Afsuski, buyurtmangiz rad etildi.\nSabab: ${esc(n.reason)}`, { parse_mode: "HTML" })
    .catch(() => undefined);
}
