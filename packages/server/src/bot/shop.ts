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
  if (photoUrl) {
    await bot.api.sendPhoto(chatId, photoUrl, { caption, parse_mode: "HTML", reply_markup: kb }).catch(async () => {
      await bot.api.sendMessage(chatId, caption, { parse_mode: "HTML", reply_markup: kb }).catch(() => undefined);
    });
  } else {
    await bot.api.sendMessage(chatId, caption, { parse_mode: "HTML", reply_markup: kb }).catch(() => undefined);
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

/** New purchase → owner card. Exported for the API layer (bot-bound closure, cashout pattern). */
export async function notifyOwnerShop(bot: Bot, n: ShopOwnerNotice): Promise<void> {
  const kb = new InlineKeyboard().text("✅ Yetkazildi", `shop:ok:${n.orderId}`).text("❌ Rad", `shop:no:${n.orderId}`);
  const payLine = n.payKind === "cash"
    ? `📦 <b>${esc(n.productName)}</b> — <b>${formatNumber(n.priceTanga)}</b> so'm 💵 <b>NAQD (yetkazganda olinadi)</b>\n`
    : `📦 <b>${esc(n.productName)}</b> — <b>${formatNumber(n.priceTanga)}</b> tanga (to'landi ✅)\n`;
  const hint = n.payKind === "cash"
    ? `<i>Yetkazib pulni olgach ✅ bosing. ❌ Rad — faqat ombor qaytadi (pul olinmagan).</i>`
    : `<i>Yetkazib bo'lgach ✅ bosing. ❌ Rad — tanga avtomatik qaytadi.</i>`;
  await bot.api
    .sendMessage(
      OWNER_TG,
      `🛍 <b>DO'KON BUYURTMASI</b> #${n.orderId}\n\n` +
        payLine +
        `👤 ${esc(n.buyerName)}\n📞 ${esc(n.phone)}\n📍 ${esc(n.address)}\n\n` +
        hint,
      { parse_mode: "HTML", reply_markup: kb },
    )
    .catch(() => undefined);
}

export function registerShop(bot: Bot): void {
  bot.callbackQuery(/^shop:(ok|no):(\d+)$/, async (ctx) => {
    if (String(ctx.from.id) !== OWNER_TG) {
      await ctx.answerCallbackQuery({ text: "Faqat admin", show_alert: true });
      return;
    }
    const m = ctx.match as RegExpMatchArray;
    const action = m[1];
    const orderId = Number(m[2]);

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
