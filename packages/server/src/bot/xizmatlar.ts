// 🔎 XIZMATLAR owner side — a self-submitted listing fires a card to the OWNER's Telegram with
// [✅ Tasdiqlash] [❌ Rad]. serviceDirectory owns the status logic (status guard = double-tap /
// ✅→❌ race no-ops). No bot-side session state → restart-proof. shop.ts clone, zero money.
import { Bot, InlineKeyboard } from "grammy";
import { approveListing, rejectListing, type ServiceOwnerNotice } from "../services/serviceDirectory";

const OWNER_TG = "6506297119"; // same single source as cashout.ts / shop.ts

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** New self-submitted listing → owner card. Exported for the API layer (bot-bound closure). */
export async function notifyOwnerService(bot: Bot, n: ServiceOwnerNotice): Promise<void> {
  const kb = new InlineKeyboard().text("✅ Tasdiqlash", `svc:ok:${n.listingId}`).text("❌ Rad", `svc:no:${n.listingId}`);
  await bot.api
    .sendMessage(
      OWNER_TG,
      `🔎 <b>YANGI XIZMAT SO'ROVI</b> #${n.listingId}\n\n` +
        `🏪 <b>${esc(n.name)}</b>\n📂 ${esc(n.categoryName)}\n📞 ${esc(n.phone)}\n` +
        (n.desc ? `📝 ${esc(n.desc.slice(0, 200))}\n` : "") +
        `👤 Yubordi: ${esc(n.submitterName)}\n\n` +
        `<i>✅ — katalogda ko'rinadi. ❌ — rad (yuborgan odamga xabar boradi).</i>`,
      { parse_mode: "HTML", reply_markup: kb },
    )
    .catch(() => undefined);
}

export function registerXizmatlar(bot: Bot): void {
  bot.callbackQuery(/^svc:(ok|no):(\d+)$/, async (ctx) => {
    if (String(ctx.from.id) !== OWNER_TG) {
      await ctx.answerCallbackQuery({ text: "Faqat admin", show_alert: true });
      return;
    }
    const m = ctx.match as RegExpMatchArray;
    const action = m[1];
    const listingId = Number(m[2]);
    const r = action === "ok" ? await approveListing(listingId) : await rejectListing(listingId);
    if (!r.ok) {
      await ctx.answerCallbackQuery({ text: r.reason === "not_found" ? "Topilmadi" : `Allaqachon: ${r.reason}`, show_alert: true });
      return;
    }
    const label = action === "ok" ? "✅ TASDIQLANDI — katalogda" : "❌ RAD ETILDI";
    await ctx.answerCallbackQuery({ text: label });
    await ctx
      .editMessageText(`${(ctx.callbackQuery.message && "text" in ctx.callbackQuery.message ? ctx.callbackQuery.message.text : "") ?? ""}\n\n${label}`)
      .catch(() => undefined);
    if (r.ownerTgId) {
      const msg =
        action === "ok"
          ? `🎉 <b>Xizmatingiz e'lon qilindi!</b>\n🏪 ${esc(r.name ?? "")}\n\nEndi u 1067 katalogida — odamlar sizni topadi va qo'ng'iroq qiladi. «🚀 Ilova» → Xizmatlar → «Mening xizmatlarim»da statistikani ko'rasiz.`
          : `😔 <b>Xizmat so'rovi rad etildi</b>\n🏪 ${esc(r.name ?? "")}\n\nMa'lumotlarni tekshirib (nom, telefon, tavsif) qayta yuborishingiz mumkin.`;
      await bot.api.sendMessage(r.ownerTgId, msg, { parse_mode: "HTML" }).catch(() => undefined);
    }
  });
}
