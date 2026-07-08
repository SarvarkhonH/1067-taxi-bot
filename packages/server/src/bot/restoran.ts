// 🍽 RESTORAN owner side — CONCIERGE V1 (RESTORAN_PLAN §0): operator harakati Telegram tugmalari
// EMAS, admin panel ("Restoran" tab, R3) orqali. Shuning uchun bu yerda shop.ts'dagi kabi
// [✅/❌] InlineKeyboard YO'Q — faqat "yangi buyurtma keldi, admin panelga kir" ma'lumot xabari.
import { Bot } from "grammy";
import { formatNumber } from "@t1067/shared";
import type { FoodOrderOwnerNotice } from "../services/restoranService";

const OWNER_TG = "6506297119"; // same single source as shop.ts/cashout.ts

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
