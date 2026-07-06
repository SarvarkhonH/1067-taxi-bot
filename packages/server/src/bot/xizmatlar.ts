// 🔎 XIZMATLAR owner side — a self-submitted listing fires a card to the OWNER's Telegram with
// [✅ Tasdiqlash] [❌ Rad]. serviceDirectory owns the status logic (status guard = double-tap /
// ✅→❌ race no-ops). No bot-side session state → restart-proof. shop.ts clone, zero money.
import { Bot, InlineKeyboard } from "grammy";
import { approveListing, rejectListing, type ServiceDemandNotice, type ServiceOwnerNotice } from "../services/serviceDirectory";
import { prisma } from "../db";

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

/** "Topilmadi" demand request → owner info card (the recruiting signal — no buttons needed). */
export async function notifyOwnerDemand(bot: Bot, n: ServiceDemandNotice): Promise<void> {
  await bot.api
    .sendMessage(
      OWNER_TG,
      `🔎 <b>TOPILMAGAN XIZMAT SO'ROVI</b> #${n.requestId}\n\n` +
        `🔍 Qidiruv: <b>${esc(n.query)}</b>\n` +
        (n.note ? `📝 Izoh: ${esc(n.note)}\n` : "") +
        `👤 ${esc(n.submitterName)}\n\n` +
        `<i>Shu xizmatni katalogga qo'shsangiz — talab tayyor. Admin panel → Xizmatlar → So'rovlar.</i>`,
      { parse_mode: "HTML" },
    )
    .catch(() => undefined);
}

/** /start svc_<id> — a shared listing deep-link: reply with the listing card (name/rating/phone).
 *  Returns false when the listing is missing/inactive so /start falls through to the normal flow. */
export async function sendListingCard(bot: Bot, chatId: string, listingId: number): Promise<boolean> {
  const l = await prisma.serviceListing.findUnique({ where: { id: listingId }, include: { category: { select: { name: true, emoji: true } } } }).catch(() => null);
  if (!l || l.status !== "active") return false;
  void prisma.serviceListing.update({ where: { id: listingId }, data: { viewCount: { increment: 1 } } }).catch(() => undefined);
  const stars = l.reviewCount > 0 ? `⭐ ${Math.round(l.avgRating * 10) / 10} (${l.reviewCount} baho) · ` : "";
  await bot.api
    .sendMessage(
      chatId,
      `${l.category.emoji || "🏪"} <b>${esc(l.name)}</b>${l.verified ? " ✅" : ""}\n` +
        `${stars}${esc(l.category.name)}\n\n` +
        `📞 <b>${esc(l.phone)}</b>${l.phone2 ? `\n📞 ${esc(l.phone2)}` : ""}\n` +
        (l.workHours ? `🕒 ${esc(l.workHours)}\n` : "") +
        (l.address ? `📍 ${esc(l.address)}\n` : "") +
        (l.desc ? `\n${esc(l.desc.slice(0, 200))}\n` : "") +
        `\n<i>Barcha Koson xizmatlari: «🚀 Ilova» → Xizmatlar</i>`,
      { parse_mode: "HTML" },
    )
    .catch(() => undefined);
  return true;
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
