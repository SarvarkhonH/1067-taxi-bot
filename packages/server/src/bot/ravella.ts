// 🎀 RAVELLA bot-tomoni (RAVELLA_PLAN §4) — hamkor (Zoyir aka) buyurtmani SHU YERDA boshqaradi:
// [✅ Qabul][☎️ Bog'landim][✔ Bajarildi][❌ Rad]. Pul-logikasi ravellaService'da (shartli status-
// o'tishlar + cashback faqat `done`'da) — bu fayl faqat UI + push. Market kartasining naqshi AYNAN.
// Hamkor sozlanmagan bo'lsa karta EGAga tushadi (buyurtma hech qachon "hech kimga" ketmaydi).
import { Bot, Context, InlineKeyboard } from "grammy";
import { formatNumber } from "@t1067/shared";
import { prisma } from "../db";
import type { RavellaOwnerNotice } from "../services/ravellaService";

const OWNER_TG = "6506297119";

function esc(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function tgOf(memberId: number): Promise<string | null> {
  const tu = await prisma.telegramUser.findFirst({ where: { memberId }, select: { id: true } });
  return tu?.id ?? null;
}

/** Kim bosishi mumkin: hamkor (sozlangan bo'lsa) + ega. Bitta joyda — callback-guard ham,
 *  yuborish-ro'yxati ham shundan o'qiladi (ikkisi ajralib qolmasin). */
async function ravellaChats(): Promise<string[]> {
  const { getRavellaPartnerChats } = await import("../services/ravellaService");
  const chats = new Set<string>([OWNER_TG]);
  for (const id of await getRavellaPartnerChats()) chats.add(id);
  return [...chats];
}

const KB = (orderId: number, status: string): InlineKeyboard | undefined => {
  const kb = new InlineKeyboard();
  if (status === "pending") kb.text("✅ Qabul qilaman", `rv:acc:${orderId}`).text("❌ Rad", `rv:rej:${orderId}`).row().text("☎️ Bog'landim", `rv:call:${orderId}`);
  else if (status === "accepted") kb.text("☎️ Bog'landim", `rv:call:${orderId}`).text("✔ Bajarildi", `rv:done:${orderId}`).row().text("❌ Rad", `rv:rej:${orderId}`);
  else if (status === "called") kb.text("✔ Bajarildi", `rv:done:${orderId}`).text("❌ Rad", `rv:rej:${orderId}`);
  else return undefined;
  return kb;
};

const STATUS_LABEL: Record<string, string> = {
  accepted: "✅ QABUL QILINDI",
  called: "☎️ BOG'LANILDI",
  done: "✔ BAJARILDI",
  rejected: "❌ RAD ETILDI",
};

function orderCard(n: RavellaOwnerNotice): string {
  const disc = n.discountSom > 0
    ? `💰 ${formatNumber(n.subtotalSom)} → <b>${formatNumber(n.totalSom)} so'm</b> (BirJoy −${formatNumber(n.discountSom)})`
    : `💰 <b>${formatNumber(n.totalSom)} so'm</b>`;
  return [
    `🎀 <b>Yangi buyurtma #${n.orderId}</b>`,
    ``,
    `🎭 ${esc(n.itemName)}`,
    `➕ ${esc(n.addonsText)}`,
    disc,
    ``,
    `👤 ${esc(n.buyerName)} · ☎️ ${esc(n.contact)}`,
    `📍 ${esc(n.address)}`,
    n.eventDate && n.eventDate !== "—" ? `📅 ${esc(n.eventDate)}` : "",
    n.note ? `📝 ${esc(n.note)}` : "",
  ].filter(Boolean).join("\n");
}

/** Yangi buyurtma → hamkorga + egaga. server.ts `notifyRavellaPartner` hook'i shuni chaqiradi. */
export async function notifyRavellaPartner(bot: Bot, n: RavellaOwnerNotice): Promise<void> {
  const text = orderCard(n);
  for (const chat of await ravellaChats()) {
    await bot.api.sendMessage(chat, text, { parse_mode: "HTML", reply_markup: KB(n.orderId, "pending") }).catch(() => undefined);
  }
}

/** Holat o'zgardi → MIJOZGA push. Har o'tish uchun bitta aniq jumla (minimalizm qoidasi). */
export async function notifyRavellaCustomer(
  bot: Bot,
  n: { memberId: number; itemName: string; newStatus: string; cashbackSom?: number; reason?: string },
): Promise<void> {
  const tg = await tgOf(n.memberId);
  if (!tg) return;
  const item = esc(n.itemName);
  const msg = n.newStatus === "accepted"
    ? `✅ <b>Ravella buyurtmangizni qabul qildi</b>\n🎭 ${item}\nTez orada siz bilan bog'lanishadi.`
    : n.newStatus === "called"
      ? `☎️ <b>Ravella siz bilan bog'lanmoqda</b>\n🎭 ${item}`
      : n.newStatus === "done"
        ? `🎉 <b>Buyurtmangiz bajarildi</b>\n🎭 ${item}` + (n.cashbackSom && n.cashbackSom > 0 ? `\n🪙 <b>+${formatNumber(n.cashbackSom)} tanga</b> hisobingizga qaytdi!` : "")
        : n.newStatus === "rejected"
          ? `😔 <b>Buyurtma rad etildi</b>\n🎭 ${item}${n.reason ? `\nSabab: ${esc(n.reason)}` : ""}\nHech qanday pul olinmagan.`
          : "";
  if (msg) await bot.api.sendMessage(tg, msg, { parse_mode: "HTML" }).catch(() => undefined);
}

export function registerRavella(bot: Bot): void {
  bot.callbackQuery(/^rv:(acc|call|done|rej):(\d+)$/, async (ctx: Context) => {
    const [, action, idStr] = ctx.match as unknown as string[];
    const orderId = Number(idStr);
    const allowed = await ravellaChats();
    if (!allowed.includes(String(ctx.from?.id ?? ""))) {
      await ctx.answerCallbackQuery({ text: "Bu tugma Ravella uchun", show_alert: true });
      return;
    }
    const svc = await import("../services/ravellaService");
    const r = action === "acc" ? await svc.acceptRavellaOrder(orderId)
      : action === "call" ? await svc.markRavellaCalled(orderId)
        : action === "done" ? await svc.finishRavellaOrder(orderId)
          : await svc.rejectRavellaOrder(orderId, "Hamkor rad etdi");
    if (!r.ok) {
      await ctx.answerCallbackQuery({ text: `Holat: ${r.reason ?? "o'zgarmadi"}`, show_alert: true });
      return;
    }
    const st = r.newStatus!;
    await ctx.answerCallbackQuery({ text: STATUS_LABEL[st] ?? st });
    // kartaning tepasi saqlanadi, pastiga holat yoziladi (market kartasi bilan bir xil his)
    const orig = ctx.callbackQuery?.message && "text" in ctx.callbackQuery.message ? ctx.callbackQuery.message.text ?? "" : "";
    const base = orig.split("\n— — —")[0];
    const tail = st === "done" && r.cashbackSom ? `${STATUS_LABEL[st]} (mijozga +${formatNumber(r.cashbackSom)} tanga)` : STATUS_LABEL[st] ?? st;
    await ctx.editMessageText(`${base}\n— — —\n${tail}`, { parse_mode: "HTML", reply_markup: KB(orderId, st) }).catch(() => undefined);
    if (r.memberId) {
      await notifyRavellaCustomer(bot, {
        memberId: r.memberId,
        itemName: r.itemName ?? "Ravella",
        newStatus: st,
        cashbackSom: r.cashbackSom,
        reason: action === "rej" ? "Hamkor rad etdi" : undefined,
      });
    }
  });

  // /ravella — hamkor va ega uchun: bugungi jonli buyurtmalar (kartani yo'qotib qo'ysa qayta ochadi)
  bot.command("ravella", async (ctx) => {
    const allowed = await ravellaChats();
    if (!allowed.includes(String(ctx.from?.id ?? ""))) return;
    const rows = await prisma.ravellaOrder.findMany({
      where: { status: { in: ["pending", "accepted", "called"] } },
      orderBy: { id: "desc" },
      take: 10,
    });
    if (!rows.length) {
      await ctx.reply("🎀 Hozircha ochiq buyurtma yo'q.");
      return;
    }
    for (const o of rows) {
      const addons = Array.isArray(o.addonsJson) ? (o.addonsJson as { name: string; qty: number }[]) : [];
      await ctx.reply(
        orderCard({
          orderId: o.id,
          itemName: o.itemName,
          addonsText: addons.length ? addons.map((a) => `${a.name} ×${a.qty}`).join(", ") : "—",
          subtotalSom: o.subtotalSom,
          discountSom: o.discountSom,
          totalSom: o.totalSom,
          buyerName: "Mijoz",
          contact: o.contact,
          address: o.address,
          eventDate: o.eventDate ?? "—",
          note: o.note,
        }),
        { parse_mode: "HTML", reply_markup: KB(o.id, o.status) },
      ).catch(() => undefined);
    }
  });
}
