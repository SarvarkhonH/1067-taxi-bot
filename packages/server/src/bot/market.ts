// 🏪 BirJoy V1.3 — sotuvchi-onboarding wizard (/sotuvchi). Lokal do'kon 5 daqiqada DARK vitrina
// ochadi (active=false), EGA admin-panelda ko'rib yoqadi. Cashout sessions-Map naqshi (in-memory:
// bot restart = wizard qayta boshlanadi — buyurtma emas, draft, yo'qotish arzon). Flag `bazar`
// SHART EMAS wizard uchun (DARK vitrina baribir ko'rinmaydi) — lekin e'lon-matni flag'ga ishora qiladi.
import { Bot, Context, InlineKeyboard } from "grammy";
import { prisma } from "../db";

const OWNER_TG = "6506297119";

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
        await ctx.api.sendMessage(shop.ownerChatId, `🎉 <b>${esc(shop.name)}</b> tasdiqlandi!\n\nEndi mahsulotlaringizni qo'shish uchun ega sizga admin-havola yuboradi. Buyurtmalar shu chatga tushadi.`, { parse_mode: "HTML" }).catch(() => undefined);
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
