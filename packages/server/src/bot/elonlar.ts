// 📋 E'LONLAR owner side — a submitted ad fires a card to the OWNER's Telegram with [✅ Chiqarish]
// [❌ Rad]. classifiedService owns the status logic (status guard = double-tap / ✅→❌ race no-ops,
// refund idempotency key physically prevents double-pay). xizmatlar.ts clone.
import { Bot, InlineKeyboard } from "grammy";
import { approveAd, markSold, rejectAd, type ClassifiedOwnerNotice } from "../services/classifiedService";
import { formatNumber } from "@t1067/shared";

const OWNER_TG = "6506297119"; // same single source as cashout.ts / shop.ts / xizmatlar.ts

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** New pending ad → owner moderation card. Exported for the API layer (bot-bound closure). */
export async function notifyOwnerElonlar(bot: Bot, n: ClassifiedOwnerNotice): Promise<void> {
  const kb = new InlineKeyboard().text("✅ Chiqarish", `elonlar:ok:${n.adId}`).text("❌ Rad", `elonlar:no:${n.adId}`);
  await bot.api
    .sendMessage(
      OWNER_TG,
      `📋 <b>YANGI E'LON</b> #${n.adId}\n\n` +
        `${esc(n.categoryLabel)}\n<b>${esc(n.title)}</b>\n` +
        (n.priceSom ? `💰 ${formatNumber(n.priceSom)} so'm\n` : "💰 Kelishiladi\n") +
        `📞 ${esc(n.phone)}\n👤 Yubordi: ${esc(n.submitterName)}\n\n` +
        `<i>✅ — doskada ko'rinadi. ❌ — rad (to'langan tanga avto-qaytadi).</i>`,
      { parse_mode: "HTML", reply_markup: kb },
    )
    .catch(() => undefined);
}

export function registerElonlar(bot: Bot): void {
  bot.callbackQuery(/^elonlar:(ok|no):(\d+)$/, async (ctx) => {
    if (String(ctx.from.id) !== OWNER_TG) {
      await ctx.answerCallbackQuery({ text: "Faqat admin", show_alert: true });
      return;
    }
    const m = ctx.match as RegExpMatchArray;
    const action = m[1];
    const adId = Number(m[2]);
    const r = action === "ok" ? await approveAd(adId) : await rejectAd(adId);
    if (!r.ok) {
      await ctx.answerCallbackQuery({ text: r.reason === "not_found" ? "Topilmadi" : `Allaqachon: ${r.reason}`, show_alert: true });
      return;
    }
    const label = action === "ok" ? "✅ CHIQARILDI — doskada" : "❌ RAD ETILDI (tanga qaytarildi)";
    await ctx.answerCallbackQuery({ text: label });
    await ctx
      .editMessageText(`${(ctx.callbackQuery.message && "text" in ctx.callbackQuery.message ? ctx.callbackQuery.message.text : "") ?? ""}\n\n${label}`, { parse_mode: "HTML" })
      .catch(() => undefined);
    if (r.tgId) {
      const msg =
        action === "ok"
          ? `🎉 <b>E'loningiz chiqdi!</b>\n📋 ${esc(r.title ?? "")}\n\nEndi u E'lonlar doskasida — odamlar ko'rib qo'ng'iroq qilishadi. «Mening e'lonlarim»da statistikani ko'rasiz.`
          : `😔 <b>E'loningiz rad etildi</b>\n📋 ${esc(r.title ?? "")}\n\nTo'langan tanga (bo'lsa) qaytarildi. Ma'lumotlarni tekshirib qayta yuborishingiz mumkin.`;
      await bot.api.sendMessage(r.tgId, msg, { parse_mode: "HTML" }).catch(() => undefined);
    }
  });

  // §7 "chirigan doska" himoyasi — 3-kunlik 1-tap "hali sotilmadimi?" javobi (egasi o'zi bosadi,
  // admin emas — ctx.from.id ad.tgId'ga teng bo'lishi shart).
  bot.callbackQuery(/^elonlar:(keep|sold):(\d+)$/, async (ctx) => {
    const m = ctx.match as RegExpMatchArray;
    const action = m[1];
    const adId = Number(m[2]);
    if (action === "keep") {
      await ctx.answerCallbackQuery({ text: "✅ Faol qoldi" });
      await ctx.editMessageText("✅ E'lon faol qoldi — rahmat!").catch(() => undefined);
      return;
    }
    const r = await markSold(String(ctx.from.id), adId);
    if (!r.ok) {
      await ctx.answerCallbackQuery({ text: "Bu sizning e'loningiz emas yoki allaqachon yopilgan", show_alert: true });
      return;
    }
    await ctx.answerCallbackQuery({ text: "🤝 Tabriklaymiz!" });
    await ctx.editMessageText("🤝 <b>Tabriklaymiz — sotilgan deb belgilandi!</b>", { parse_mode: "HTML" }).catch(() => undefined);
  });
}
