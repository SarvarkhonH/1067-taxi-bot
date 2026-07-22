// 🏪 BirJoy V1.3 — sotuvchi-onboarding wizard (/sotuvchi) + 🧺 V2 savat-buyurtma kartasi.
// Wizard: lokal do'kon 5 daqiqada DARK vitrina ochadi (active=false), EGA admin-panelda yoqadi.
// Cashout sessions-Map naqshi (in-memory: bot restart = wizard qayta boshlanadi — draft, arzon).
// V2-karta: seller ownerChatId + EGA CC, [✅ Qabul][🚚 Yo'lda][✔ Yetkazdim][❌ Rad] — pul-logika
// marketOrderService'da (shartli-o'tishlar idempotent), bu yerda faqat UI+push.
import { Bot, Context, InlineKeyboard } from "grammy";
import { formatNumber } from "@t1067/shared";
import { prisma } from "../db";
import type { MarketOrderLine, MarketOrderStatus } from "@t1067/shared";

const OWNER_TG = "6506297119";
const ADMIN_PANEL_URL = "https://admin-seven-ebon-95.vercel.app"; // grantShopSeller.ts bilan bir xil manba

/** V1.6: sotuvchiga o'z do'koni-scoped admin-panel havolasini yuborish — mint-yoki-qayta-ishlatish
 *  (idempotent), keyin bitta xabar. Xato bo'lsa jim — chaqiruvchi oqim (tasdiqlash) buzilmasin. */
async function sendSellerPanelLink(bot: Bot, chatId: string, shopId: number, shopName: string): Promise<void> {
  const { getOrCreateSellerToken } = await import("../services/shopService");
  const token = await getOrCreateSellerToken(shopId);
  await bot.api.sendMessage(
    chatId,
    `🔑 <b>Do'koningizni boshqarish havolasi:</b>\n${ADMIN_PANEL_URL}/?key=${token}\n\n` +
      `Kirib «➕ Mahsulot qo'shish» tugmasini bosing, nomi/narxi/soni/rasmini kiriting. ` +
      `Havolani yo'qotib qo'ysangiz — botga <code>/dokonim</code> yozing, qayta yuboriladi.`,
    { parse_mode: "HTML" },
  ).catch(() => undefined);
}

async function tgOf(memberId: number): Promise<string | null> {
  const tu = await prisma.telegramUser.findFirst({ where: { memberId }, select: { id: true } });
  return tu?.id ?? null;
}

// ── 🧺 V2: savat-buyurtma kartasi ────────────────────────────────────────────────────────────────
export interface MarketOrderNotice {
  orderId: number;
  shopId: number;
  shopName: string;
  lines: MarketOrderLine[];
  itemsTotal: number;
  deliveryFee: number;
  total: number;
  payKind: "tanga" | "cash";
  buyerName: string;
  phone: string;
  address: string;
}

async function marketChatsFor(shopId: number): Promise<string[]> {
  const chats = new Set<string>([OWNER_TG]);
  const shop = await prisma.marketShop.findUnique({ where: { id: shopId }, select: { ownerChatId: true, active: true } });
  if (shop?.ownerChatId && shop.active) chats.add(shop.ownerChatId);
  return [...chats];
}

const MO_KB = (orderId: number, status: MarketOrderStatus): InlineKeyboard => {
  const kb = new InlineKeyboard();
  if (status === "pending") kb.text("✅ Qabul", `mo:adv:${orderId}`).text("❌ Rad", `mo:rej:${orderId}`);
  else if (status === "accepted") kb.text("🚚 Yo'lda", `mo:adv:${orderId}`).text("❌ Rad", `mo:rej:${orderId}`);
  else if (status === "delivering") kb.text("✔ Yetkazdim", `mo:adv:${orderId}`).text("❌ Rad", `mo:rej:${orderId}`);
  return kb;
};

export async function notifyMarketOrderCard(bot: Bot, n: MarketOrderNotice): Promise<void> {
  const items = n.lines.map((l) => `  • ${escMkt(l.name.slice(0, 40))} ×${l.qty} — ${formatNumber(l.qty * l.priceTanga)}`).join("\n");
  const payLine = n.payKind === "cash"
    ? `💵 <b>NAQD ${formatNumber(n.total)}</b> so'm (yetkazganda olinadi)`
    : `🪙 <b>${formatNumber(n.total)}</b> tanga (to'landi ✅)`;
  const text =
    `🧺 <b>SAVAT-BUYURTMA</b> #${n.orderId} — <b>${escMkt(n.shopName)}</b>\n\n` +
    `${items}\n` +
    (n.deliveryFee > 0 ? `  🚚 Yetkazish: ${formatNumber(n.deliveryFee)}\n` : "") +
    `\n${payLine}\n👤 ${escMkt(n.buyerName)}\n📞 ${escMkt(n.phone)}\n📍 ${escMkt(n.address)}\n\n` +
    `<i>Har bosqichda tugmani bosing — mijozga avtomatik xabar boradi.</i>`;
  for (const chat of await marketChatsFor(n.shopId)) {
    await bot.api.sendMessage(chat, text, { parse_mode: "HTML", reply_markup: MO_KB(n.orderId, "pending") }).catch(() => undefined);
  }
}

const RIDER_STATUS_MSG: Record<string, (shopName: string) => string> = {
  accepted: (s) => `✅ <b>Buyurtmangiz qabul qilindi!</b>\n🏬 ${escMkt(s)} tayyorlamoqda.`,
  delivering: (s) => `🚚 <b>Buyurtmangiz yo'lda!</b>\n🏬 ${escMkt(s)} yetkazmoqda — tez orada eshigingizda.`,
  delivered: (s) => `📦 <b>Buyurtmangiz yetkazildi!</b>\n🏬 ${escMkt(s)} — xaridingiz uchun rahmat! 🎉`,
};

function escMkt(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

type Step = "name" | "phone" | "address" | "hours" | "promise" | "category";
interface Draft {
  step: Step;
  name?: string;
  phone?: string;
  address?: string;
  workHours?: string;
  deliveryText?: string;
}
const sessions = new Map<string, Draft>();

/** Bot-bug fix (ega telefonda topdi, 2026-07-22): bot.ts'dagi global «raqamni qo'lda yozib
 *  bo'lmaydi» xavfsizlik-ogohlantirish (`bot.hears(/^\+?\d.../)`) ANCHA OLDINROQ ro'yxatdan o'tgan
 *  va mos kelsa `next()` chaqirmaydi — shuning uchun wizard'ning 2/6-qadami (telefon-raqam so'rash)
 *  hech qachon ishlamasdi: foydalanuvchi raqam yozganda bu global handler uni ushlab qolib, ORQAGA
 *  hisoblanadigan «Boshqa raqam ulash» oqimini ko'rsatardi. Fix: bot.ts shu funksiyani chaqirib,
 *  faol wizard-sessiyasi bo'lsa `next()` bilan o'tkazib yuboradi (ro'yxat-tartibi o'zgarmaydi —
 *  boshqa o'nlab handler'larning nisbiy tartibiga tegilmaydi, faqat bitta aniq to'qnashuv yopiladi). */
export function isInMarketWizard(tg: string): boolean {
  return sessions.has(tg);
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const PROMPTS: Record<Step, string> = {
  name: "🏪 <b>BirJoy'da do'kon ochamiz!</b>\n\n1/6 — Do'kon nomini yozing (masalan: <i>Barakat market</i>):",
  phone: "2/6 — Aloqa telefon raqamingiz (masalan: <i>+99890 123 45 67</i>):",
  address: "3/6 — Do'kon manzili (masalan: <i>Koson sh., Bozor ko'chasi 12</i>):",
  hours: "4/6 — Ish vaqti (masalan: <i>09:00-21:00</i>):",
  promise: "5/6 — Yetkazish-va'dangiz — mijoz kartada shuni ko'radi (masalan: <i>Bugun 2 soatda</i> yoki <i>Ertaga 10:00-14:00</i>):",
  category: "6/6 — Asosiy yo'nalish (masalan: <i>Oziq-ovqat</i>, <i>Elektronika</i>, <i>Kiyim-kechak</i>):",
};

export function registerMarket(bot: Bot): void {
  bot.command("sotuvchi", async (ctx) => {
    const tg = String(ctx.from?.id ?? "");
    if (!tg) return;
    // bitta telegram = bitta do'kon (V1) — qaytadan boshlasa mavjudini ko'rsatamiz
    const mine = await prisma.marketShop.findFirst({ where: { ownerChatId: tg } });
    if (mine) {
      await ctx.reply(
        `🏪 Sizda allaqachon do'kon bor: <b>${esc(mine.name)}</b>\nHolat: ${mine.active ? "✅ faol" : "⏳ ega tasdig'ini kutmoqda"}\n\nSavollar uchun: @koson1067bot egasiga yozing.`,
        { parse_mode: "HTML" },
      );
      return;
    }
    sessions.set(tg, { step: "name" });
    await ctx.reply(PROMPTS.name, { parse_mode: "HTML" });
  });

  // V1.6d: sotuvchi o'z boshqaruv-havolasini istalgan vaqt qayta oladi (chat tarixi
  // yo'qolgan/yangi telefon bo'lsa ham) — faqat O'Z faol do'koni uchun.
  bot.command("dokonim", async (ctx) => {
    const tg = String(ctx.from?.id ?? "");
    if (!tg) return;
    const mine = await prisma.marketShop.findFirst({ where: { ownerChatId: tg } });
    if (!mine) { await ctx.reply("Sizda ro'yxatdan o'tgan do'kon topilmadi. Boshlash uchun: /sotuvchi"); return; }
    if (!mine.active) { await ctx.reply(`🏪 <b>${esc(mine.name)}</b> hali ega tasdig'ini kutmoqda — tasdiqlangach havola avtomatik keladi.`, { parse_mode: "HTML" }); return; }
    await sendSellerPanelLink(bot, tg, mine.id, mine.name);
  });

  bot.command("bekor_sotuvchi", async (ctx) => {
    const tg = String(ctx.from?.id ?? "");
    if (sessions.delete(tg)) await ctx.reply("Wizard bekor qilindi. Qaytadan: /sotuvchi");
  });

  // matn-qadamlar — session-gated; sessiyasi yo'qlar next() bilan o'tib ketadi (boshqa handlerlarga)
  bot.on("message:text", async (ctx: Context, next) => {
    const tg = String(ctx.from?.id ?? "");
    const s = sessions.get(tg);
    if (!s) { await next(); return; }
    const text = (ctx.message?.text ?? "").trim();
    if (text.startsWith("/")) { await next(); return; } // buyruqlar wizard'ni buzmasin

    switch (s.step) {
      case "name": {
        if (text.length < 3) { await ctx.reply("Nom juda qisqa — kamida 3 belgi."); return; }
        s.name = text.slice(0, 60);
        s.step = "phone";
        break;
      }
      case "phone": {
        const digits = text.replace(/[^\d+]/g, "");
        if (digits.replace(/\D/g, "").length < 9) { await ctx.reply("Telefon raqami noto'g'ri ko'rinadi — qayta yozing."); return; }
        s.phone = digits.slice(0, 16);
        s.step = "address";
        break;
      }
      case "address": {
        if (text.length < 5) { await ctx.reply("Manzilni to'liqroq yozing (kamida 5 belgi)."); return; }
        s.address = text.slice(0, 120);
        s.step = "hours";
        break;
      }
      case "hours": {
        s.workHours = text.slice(0, 30);
        s.step = "promise";
        break;
      }
      case "promise": {
        s.deliveryText = text.slice(0, 60);
        s.step = "category";
        break;
      }
      case "category": {
        const category = text.slice(0, 40) || "boshqa";
        sessions.delete(tg);
        const shop = await prisma.marketShop.create({
          data: {
            name: s.name!,
            phone: s.phone!,
            address: s.address ?? null,
            workHours: s.workHours ?? null,
            deliveryText: s.deliveryText ?? null,
            category,
            ownerChatId: tg,
            active: false, // DARK — ega yoqadi
          },
        });
        await ctx.reply(
          `🎉 <b>${esc(shop.name)}</b> ro'yxatga olindi!\n\n⏳ Ega tasdig'idan keyin do'koningiz BirJoy bozorida ochiladi va sizga xabar keladi.\n📦 Buyurtmalar shu chatga tushadi — ✅/🚚/❌ tugmalari bilan boshqarasiz.`,
          { parse_mode: "HTML" },
        );
        // egaga karta: [✅ Tasdiqlash] — 1 bosishda aktivlashtirish
        const kb = new InlineKeyboard().text("✅ Tasdiqlash", `mkt:approve:${shop.id}`).text("❌ Rad", `mkt:deny:${shop.id}`);
        await ctx.api.sendMessage(
          OWNER_TG,
          `🏪 <b>Yangi sotuvchi-ariza</b> #${shop.id}\n\n<b>${esc(shop.name)}</b>\n📞 ${esc(shop.phone)}\n📍 ${esc(shop.address ?? "—")}\n🕐 ${esc(shop.workHours ?? "—")}\n🚚 ${esc(shop.deliveryText ?? "—")}\n📂 ${esc(category)}\nTG: <code>${tg}</code>`,
          { parse_mode: "HTML", reply_markup: kb },
        ).catch(() => undefined);
        return;
      }
    }
    sessions.set(tg, s);
    await ctx.reply(PROMPTS[s.step], { parse_mode: "HTML" });
  });

  // 🧺 V2: savat-buyurtma boshqaruvi — seller yoki ega bosadi (guard marketChatsFor bilan)
  bot.callbackQuery(/^mo:(adv|rej):(\d+)$/, async (ctx) => {
    const [, action, idStr] = ctx.match!;
    const orderId = Number(idStr);
    const order = await prisma.marketOrder.findUnique({ where: { id: orderId }, select: { shopId: true } });
    if (!order) { await ctx.answerCallbackQuery({ text: "Topilmadi" }); return; }
    const allowed = await marketChatsFor(order.shopId);
    if (!allowed.includes(String(ctx.from.id))) { await ctx.answerCallbackQuery({ text: "Faqat admin", show_alert: true }); return; }

    const svc = await import("../services/marketOrderService");
    const r = action === "adv" ? await svc.advanceMarketOrder(orderId) : await svc.rejectMarketOrder(orderId);
    if (!r.ok) {
      await ctx.answerCallbackQuery({ text: r.reason === "retry" ? "Xato — qayta bosing" : `Holat: ${r.reason}`, show_alert: true });
      return;
    }
    const st = r.newStatus!;
    const LABEL: Record<string, string> = { accepted: "✅ QABUL QILINDI", delivering: "🚚 YO'LDA", delivered: "✔ YETKAZILDI", rejected: "❌ RAD ETILDI" };
    await ctx.answerCallbackQuery({ text: LABEL[st] ?? st });
    const orig = ctx.callbackQuery.message && "text" in ctx.callbackQuery.message ? ctx.callbackQuery.message.text ?? "" : "";
    const base = orig.split("\n— — —")[0];
    await ctx.editMessageText(`${base}\n— — —\n${LABEL[st] ?? st}${st === "rejected" && r.payKind !== "cash" ? " (tanga qaytdi)" : ""}`, {
      reply_markup: st === "accepted" || st === "delivering" ? MO_KB(orderId, st) : undefined,
    }).catch(() => undefined);
    // riderga push (transactional — notifyOnce-cap'dan tashqari, restoran naqshi)
    const tg = r.memberId ? await tgOf(r.memberId) : null;
    if (tg) {
      const msg = st === "rejected"
        ? (r.payKind === "cash"
          ? `😔 <b>Buyurtma rad etildi</b>\n🏬 ${escMkt(r.shopName ?? "")}\nHech qanday pul olinmagan.`
          : `😔 <b>Buyurtma rad etildi</b>\n🏬 ${escMkt(r.shopName ?? "")}\n✅ <b>${formatNumber(r.total ?? 0)} tanga hisobingizga qaytarildi.</b>`)
        : RIDER_STATUS_MSG[st]?.(r.shopName ?? "") ?? "";
      if (msg) await ctx.api.sendMessage(tg, msg, { parse_mode: "HTML" }).catch(() => undefined);
    }
  });

  // ega-tasdiqlash callback'lari — faqat ega bosadi
  bot.callbackQuery(/^mkt:(approve|deny):(\d+)$/, async (ctx) => {
    if (String(ctx.from.id) !== OWNER_TG) { await ctx.answerCallbackQuery({ text: "Faqat admin" }); return; }
    const [, action, idStr] = ctx.match!;
    const id = Number(idStr);
    const shop = await prisma.marketShop.findUnique({ where: { id } });
    if (!shop) { await ctx.answerCallbackQuery({ text: "Topilmadi" }); return; }
    if (action === "approve") {
      await prisma.marketShop.update({ where: { id }, data: { active: true } });
      await ctx.editMessageText(`✅ <b>${esc(shop.name)}</b> tasdiqlandi va faollashtirildi.`, { parse_mode: "HTML" });
      if (shop.ownerChatId) {
        await ctx.api.sendMessage(shop.ownerChatId, `🎉 <b>${esc(shop.name)}</b> tasdiqlandi!\n\nBuyurtmalar shu chatga tushadi.`, { parse_mode: "HTML" }).catch(() => undefined);
        // V1.6c: manual owner-step YO'Q — token avto-mint (yoki mavjudi qayta ishlatiladi) + darhol DM
        await sendSellerPanelLink(bot, shop.ownerChatId, shop.id, shop.name);
      }
    } else {
      await prisma.marketShop.delete({ where: { id } }).catch(() => undefined);
      await ctx.editMessageText(`❌ <b>${esc(shop.name)}</b> arizasi rad etildi.`, { parse_mode: "HTML" });
      if (shop.ownerChatId) {
        await ctx.api.sendMessage(shop.ownerChatId, `Afsuski, <b>${esc(shop.name)}</b> arizasi hozircha qabul qilinmadi.`, { parse_mode: "HTML" }).catch(() => undefined);
      }
    }
    await ctx.answerCallbackQuery();
  });
}
