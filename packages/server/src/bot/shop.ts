// 🛍 TANGA SHOP owner side — a purchase fires a card to the OWNER's Telegram with
// [✅ Yetkazildi] [❌ Rad]; reject auto-refunds + restocks (shopService owns the money logic,
// which is idempotent — double-taps and ✅→❌ races are no-ops there). Riders buy in the Mini App,
// so there is ZERO bot-side session state → restart-proof by construction. Cashout.ts clone.
import { Bot, InlineKeyboard } from "grammy";
import { formatNumber } from "@t1067/shared";
import { prisma } from "../db";
import { deliverPurchase, rejectPurchase, resolveProductPhoto, type ShopOwnerNotice } from "../services/shopService";
import { webAppUrl } from "./bot";

const OWNER_TG = "6506297119"; // same single source as cashout.ts

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function tgOf(memberId: number): Promise<string | null> {
  const tu = await prisma.telegramUser.findFirst({ where: { memberId }, select: { id: true } });
  return tu?.id ?? null;
}

/** Shared-product deep-link (t.me/<bot>?start=shop_<id>) lands here: send the cover photo + a
 *  "🛍 Ochish" button that opens the Mini App STRAIGHT on that product's detail sheet (?go=dokon&p=<id>).
 *  Mirrors xizmatlar.ts's sendListingCard, one step richer (photo + direct-open button — a real
 *  product deserves the full card, not just a text pointer). */
export async function sendProductCard(bot: Bot, chatId: string, productId: number): Promise<boolean> {
  const p = await prisma.product.findUnique({ where: { id: productId } });
  if (!p || !p.active) return false;
  const kb = new InlineKeyboard().webApp("🛍 Ochish", webAppUrl("dokon") + "&p=" + productId);
  const disc = p.oldPriceTanga && p.oldPriceTanga > p.priceTanga ? ` (−${Math.round((1 - p.priceTanga / p.oldPriceTanga) * 100)}%, avval ${formatNumber(p.oldPriceTanga)})` : "";
  const caption =
    `🛍 <b>${esc(p.name)}</b>\n🪙 <b>${formatNumber(p.priceTanga)}</b>${disc}\n` +
    (p.description ? `\n${esc(p.description.slice(0, 300))}\n` : "") +
    `\n<i>Do'kondagi barcha mahsulotlar: «🚀 Ilova» → Do'kon</i>`;
  const photoUrl = await resolveProductPhoto(productId, 0).catch(() => null);
  // BLK-1: `force` — o'lchov uchun (403 yoziladi), lekin hech qachon bostirilmaydi: bu karta
  // foydalanuvchi harakati bilan ham chiqadi.
  const { pushSend } = await import("../services/pushSend");
  if (photoUrl) {
    await pushSend(chatId, "shop_card", () => bot.api.sendPhoto(chatId, photoUrl, { caption, parse_mode: "HTML", reply_markup: kb }), { force: true }).then(async (o) => {
      if (o !== "sent") await pushSend(chatId, "shop_card", () => bot.api.sendMessage(chatId, caption, { parse_mode: "HTML", reply_markup: kb }), { force: true });
    });
  } else {
    await pushSend(chatId, "shop_card", () => bot.api.sendMessage(chatId, caption, { parse_mode: "HTML", reply_markup: kb }), { force: true });
  }
  return true;
}

/** Whole-shop deep-link (t.me/<bot>?start=shop) — a simple "🛍 Ochish" straight into the Do'kon tab. */
export async function sendShopCard(bot: Bot, chatId: string): Promise<void> {
  const kb = new InlineKeyboard().webApp("🛍 Do'konni ochish", webAppUrl("dokon"));
  await bot.api
    .sendMessage(chatId, "🛍 <b>1067 Do'kon</b>\nTangangizga (yoki naqd pulga) real mahsulotlar — 1 kunda yetkazamiz!", { parse_mode: "HTML", reply_markup: kb })
    .catch(() => undefined);
}

/** V1.5 (BirJoy): buyurtma-karta MANZILI — mahsulot qaysi do'konniki bo'lsa, o'sha sellerning
 *  Telegram'iga; EGA HAR DOIM CC oladi (pilot-davr nazorati + seller offline bo'lsa buyurtma
 *  yo'qolmaydi). Seller yo'q/ownerChatId bo'sh → faqat ega (bugungi xatti-harakat). */
async function shopChatsFor(orderId: number): Promise<string[]> {
  const chats = new Set<string>([OWNER_TG]);
  const order = await prisma.shopPurchase.findUnique({ where: { id: orderId }, select: { productId: true } });
  if (order) {
    const product = await prisma.product.findUnique({ where: { id: order.productId }, select: { shopId: true } });
    if (product?.shopId) {
      const shop = await prisma.marketShop.findUnique({ where: { id: product.shopId }, select: { ownerChatId: true, active: true } });
      if (shop?.ownerChatId && shop.active) chats.add(shop.ownerChatId);
    }
  }
  return [...chats];
}

/** New purchase → owner card. Exported for the API layer (bot-bound closure, cashout pattern). */
export async function notifyOwnerShop(bot: Bot, n: ShopOwnerNotice): Promise<void> {
  const kb = new InlineKeyboard().text("✅ Yetkazildi", `shop:ok:${n.orderId}`).text("❌ Rad", `shop:no:${n.orderId}`);
  const payLine = n.payKind === "cash"
    ? `📦 <b>${esc(n.productName)}</b> — <b>${formatNumber(n.priceTanga)}</b> so'm 💵 <b>NAQD (yetkazganda olinadi)</b>\n`
    : `📦 <b>${esc(n.productName)}</b> — <b>${formatNumber(n.priceTanga)}</b> tanga (to'landi ✅)\n`;
  const hint = n.payKind === "cash"
    ? `<i>Yetkazib pulni olgach ✅ bosing. ❌ Rad — faqat ombor qaytadi (pul olinmagan).</i>`
    : `<i>Yetkazib bo'lgach ✅ bosing. ❌ Rad — tanga avtomatik qaytadi.</i>`;
  const text =
    `🛍 <b>DO'KON BUYURTMASI</b> #${n.orderId}\n\n` +
    payLine +
    `👤 ${esc(n.buyerName)}\n📞 ${esc(n.phone)}\n📍 ${esc(n.address)}\n\n` +
    hint;
  for (const chat of await shopChatsFor(n.orderId)) {
    await bot.api.sendMessage(chat, text, { parse_mode: "HTML", reply_markup: kb }).catch(() => undefined);
  }
}

export function registerShop(bot: Bot): void {
  bot.callbackQuery(/^shop:(ok|no):(\d+)$/, async (ctx) => {
    const m = ctx.match as RegExpMatchArray;
    const action = m[1];
    const orderId = Number(m[2]);
    // V1.5: ega YOKI shu buyurtma-do'konining selleri bosadi (karta faqat shu ikkoviga boradi,
    // lekin callback_data taxmin qilinishi mumkin — server-tomonda qatiy tekshiruv shart)
    const allowed = await shopChatsFor(orderId);
    if (!allowed.includes(String(ctx.from.id))) {
      await ctx.answerCallbackQuery({ text: "Faqat admin", show_alert: true });
      return;
    }

    if (action === "ok") {
      const r = await deliverPurchase(orderId);
      if (!r.ok) {
        await ctx.answerCallbackQuery({ text: r.reason === "not_found" ? "Topilmadi" : `Allaqachon: ${r.reason}`, show_alert: true });
        return;
      }
      await ctx.answerCallbackQuery({ text: "✅ Yetkazildi deb belgilandi" });
      await ctx.editMessageText(`${(ctx.callbackQuery.message && "text" in ctx.callbackQuery.message ? ctx.callbackQuery.message.text : "") ?? ""}\n\n✅ YETKAZILDI`).catch(() => undefined);
      const tg = r.memberId ? await tgOf(r.memberId) : null;
      if (tg) {
        await bot.api
          .sendMessage(tg, `📦 <b>Buyurtmangiz yetkazildi!</b>\n🛍 ${esc(r.productName ?? "")}\n\nXaridingiz uchun rahmat! 🚕`, { parse_mode: "HTML" })
          .catch(() => undefined);
      }
      return;
    }

    // ❌ Rad — refund + restock (idempotent in shopService)
    const r = await rejectPurchase(orderId);
    if (!r.ok) {
      await ctx.answerCallbackQuery({ text: r.reason === "not_found" ? "Topilmadi" : `Allaqachon: ${r.reason}`, show_alert: true });
      return;
    }
    const isCash = r.payKind === "cash";
    await ctx.answerCallbackQuery({ text: isCash ? "❌ Rad etildi" : "❌ Rad — tanga qaytarildi" });
    await ctx.editMessageText(`${(ctx.callbackQuery.message && "text" in ctx.callbackQuery.message ? ctx.callbackQuery.message.text : "") ?? ""}\n\n❌ RAD ETILDI${isCash ? "" : " (tanga qaytdi)"}`).catch(() => undefined);
    const tg = r.memberId ? await tgOf(r.memberId) : null;
    if (tg) {
      await bot.api
        .sendMessage(
          tg,
          isCash
            ? `😔 <b>Buyurtma rad etildi</b>\n🛍 ${esc(r.productName ?? "")}\n\nHech qanday pul olinmagan. «🚀 Ilova» → Do'kon'dan boshqa mahsulot tanlashingiz mumkin.`
            : `😔 <b>Buyurtma rad etildi</b>\n🛍 ${esc(r.productName ?? "")}\n\n✅ <b>${formatNumber(r.amount ?? 0)} tanga hisobingizga qaytarildi</b> — «🚀 Ilova» → Do'kon'dan boshqa mahsulot tanlashingiz mumkin.`,
          { parse_mode: "HTML" },
        )
        .catch(() => undefined);
    }
  });
}
