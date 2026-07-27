// 📢 Owner broadcast: /elon → type the announcement → preview + confirm → sent to every linked user.
// Owner-only (not in the public command menu). Rate-limited (~22 msg/s) to stay under Telegram's flood
// limit; failures (users who blocked/deleted the bot) are counted, never fatal.
import { Bot, Context, InlineKeyboard } from "grammy";
import { prisma } from "../db";
import { webAppUrl } from "./bot";

/** Mini-app tugmasi uchun manzil — `go=<target>` deep-link (App.tsx GO_MAP o'qiydi). */
function webAppUrlFor(target?: string): string {
  return webAppUrl(target);
}

const OWNER_TG = "6506297119";
const draft = new Map<string, string>(); // owner tg → "" (awaiting text) | the pending announcement

export function registerBroadcast(bot: Bot): void {
  bot.command("elon", async (ctx: Context) => {
    if (String(ctx.from!.id) !== OWNER_TG) return;
    draft.set(OWNER_TG, "");
    await ctx.reply(
      "📢 <b>E'lon (yangilik) yuborish</b>\n\nBarcha foydalanuvchilarga yuboriladigan xabarni yozing.\n<i>HTML mumkin: &lt;b&gt;qalin&lt;/b&gt;, emoji, havola.</i>\n\n❌ Bekor qilish: /bekor",
      { parse_mode: "HTML" },
    );
  });
  // /bekor — matnli VA rasmli e'lon qoralamasini bekor qiladi. BITTA handler: grammY'da next()
  // chaqirmagan handler quyi oqimni to'xtatadi, shuning uchun ikkinchi `command("bekor")` hech
  // qachon ishga tushmasdi (va boshqa modullarning /bekor'i ham yutilib ketardi).
  bot.command("bekor", async (ctx, next) => {
    if (String(ctx.from!.id) !== OWNER_TG) { await next(); return; }
    const hadText = draft.delete(OWNER_TG);
    const hadPhoto = photoDraft.delete(OWNER_TG);
    if (hadText || hadPhoto) await ctx.reply("❌ E'lon bekor qilindi.");
    else await next(); // ega boshqa oqimni (masalan /bekor_sotuvchi) bekor qilmoqchi bo'lishi mumkin
  });

  // capture the announcement text — owner only, only while a draft is awaiting; everyone else next()
  bot.on("message:text", async (ctx, next) => {
    const tg = String(ctx.from.id);
    if (tg !== OWNER_TG || draft.get(tg) !== "") return next();
    const text = ctx.message.text;
    if (text.startsWith("/")) return next(); // a command, not the announcement body
    draft.set(tg, text);
    const count = await prisma.telegramUser.count({ where: { memberId: { not: null } } });
    const kb = new InlineKeyboard().text(`📢 Yuborish (${count} kishi)`, "elon:send").row().text("❌ Bekor", "elon:cancel");
    await ctx.reply(`📢 <b>Ko'rib chiqing — quyidagi xabar ${count} kishiga yuboriladi:</b>\n\n━━━━━━\n${text}\n━━━━━━`, {
      parse_mode: "HTML",
      reply_markup: kb,
    });
  });

  bot.callbackQuery("elon:cancel", async (ctx) => {
    if (String(ctx.from.id) !== OWNER_TG) return;
    draft.delete(OWNER_TG);
    await ctx.answerCallbackQuery({ text: "Bekor qilindi" });
    await ctx.editMessageText("❌ E'lon bekor qilindi.").catch(() => undefined);
  });

  bot.callbackQuery("elon:send", async (ctx) => {
    if (String(ctx.from.id) !== OWNER_TG) return;
    const text = draft.get(OWNER_TG);
    if (!text) {
      await ctx.answerCallbackQuery({ text: "Matn topilmadi" });
      return;
    }
    draft.delete(OWNER_TG);
    await ctx.answerCallbackQuery({ text: "Fonda yuborilmoqda…" });
    const users = await prisma.telegramUser.findMany({ where: { memberId: { not: null } }, select: { id: true } });
    await ctx.editMessageText(`📤 <b>${users.length} kishiga yuborilmoqda…</b> (fonda — tugagach xabar beraman)`, { parse_mode: "HTML" }).catch(() => undefined);
    // Run the send loop in the BACKGROUND. It takes ~users/22 seconds; doing it inside the handler
    // blocked the grammY webhook (10s timeout → unhandledRejection). Detached, the handler returns now.
    void (async () => {
      let ok = 0;
      let fail = 0;
      for (let i = 0; i < users.length; i++) {
        try {
          await bot.api.sendMessage(users[i]!.id, text, { parse_mode: "HTML" });
          ok++;
        } catch {
          fail++;
        }
        if (i % 22 === 21) await new Promise((r) => setTimeout(r, 1000)); // ~22 msg/s, under Telegram's flood limit
      }
      await bot.api
        .sendMessage(OWNER_TG, `✅ <b>E'lon yuborildi</b>\n📬 Yetkazildi: <b>${ok}</b>\n${fail ? `❌ Yetmadi: <b>${fail}</b> (bloklagan/o'chirgan)` : ""}`, { parse_mode: "HTML" })
        .catch(() => undefined);
    })().catch((e) => console.error("[broadcast] failed", e));
  });

  registerPhotoBroadcast(bot);
}

// 🖼 /elonrasm — RASMLI e'lon + mini-app tugmasi (RAVELLA_PLAN §8). Matnli /elon aynan qoladi;
// bu alohida oqim, chunki rasm + izoh + tugma boshqa Telegram metodini (sendPhoto) talab qiladi.
// Xuddi /elon kabi: faqat ega, preview + tasdiq, ~22 msg/s, fon-yuborish, xatolar sanaladi.
interface PhotoDraft { fileId?: string; caption?: string; target?: string; step: "photo" | "caption" }
const photoDraft = new Map<string, PhotoDraft>();

/** bot.ts'dagi haydovchi-rasm handler'i registerBroadcast'dan OLDIN ro'yxatdan o'tadi va sarlavhasiz
 *  admin-rasmini `next()`siz yutadi — /hikoya bilan bo'lgan AYNI xato (market.ts:131 izohi). Shu
 *  yerda kutayotgan bo'lsak, u chetga oladi. */
export function isAwaitingBroadcastPhoto(tgId: string): boolean {
  return photoDraft.get(tgId)?.step === "photo";
}

// Tugma qaysi ekranni ochadi — /elonrasm <target> (default: ilova bosh sahifasi).
// `ravella` deb yozilsa tugma to'g'ridan-to'g'ri Ravella konstruktoriga olib boradi.
function targetLabel(target?: string): string {
  return target === "ravella" ? "🎀 Ravella'ni ochish" : "🚀 Ilovani ochish";
}

function registerPhotoBroadcast(bot: Bot): void {
  bot.command("elonrasm", async (ctx: Context) => {
    if (String(ctx.from!.id) !== OWNER_TG) return;
    const target = (ctx.match as string | undefined)?.trim() || undefined;
    photoDraft.set(OWNER_TG, { step: "photo", target });
    await ctx.reply(
      `🖼 <b>Rasmli e'lon</b>${target ? ` · tugma: <code>${target}</code>` : ""}\n\n` +
        "1) Avval RASMNI yuboring (surat sifatida).\n2) Keyin izoh matnini yozing.\n\n" +
        "<i>Tugmani boshqa ekranga yo'naltirish: /elonrasm ravella</i>\n❌ Bekor qilish: /bekor",
      { parse_mode: "HTML" },
    );
  });

  // rasm — faqat ega va faqat kutilayotgan qadamda; boshqalar next() bilan o'tib ketadi
  bot.on("message:photo", async (ctx, next) => {
    const tg = String(ctx.from.id);
    const d = photoDraft.get(tg);
    if (tg !== OWNER_TG || d?.step !== "photo") return next();
    const sizes = ctx.message.photo;
    d.fileId = sizes[sizes.length - 1]!.file_id; // eng katta o'lcham
    d.step = "caption";
    photoDraft.set(tg, d);
    await ctx.reply("✅ Rasm qabul qilindi. Endi izoh matnini yozing.", { parse_mode: "HTML" });
  });

  bot.on("message:text", async (ctx, next) => {
    const tg = String(ctx.from.id);
    const d = photoDraft.get(tg);
    if (tg !== OWNER_TG || d?.step !== "caption") return next();
    const text = ctx.message.text;
    if (text.startsWith("/")) return next();
    d.caption = text;
    photoDraft.set(tg, d);
    const count = await prisma.telegramUser.count({ where: { memberId: { not: null } } });
    // PREVIEW — ega aynan mijoz ko'radigan ko'rinishni ko'radi (rasm + izoh + tugma)
    await ctx.replyWithPhoto(d.fileId!, {
      caption: `${text}\n\n━━━━━━\n👆 Shu ko'rinishda <b>${count}</b> kishiga ketadi`,
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard()
        .webApp(targetLabel(d.target), webAppUrlFor(d.target)).row()
        .text(`📢 Yuborish (${count} kishi)`, "elonr:send").row()
        .text("❌ Bekor", "elonr:cancel"),
    });
  });

  bot.callbackQuery("elonr:cancel", async (ctx) => {
    if (String(ctx.from.id) !== OWNER_TG) return;
    photoDraft.delete(OWNER_TG);
    await ctx.answerCallbackQuery({ text: "Bekor qilindi" });
    await ctx.editMessageCaption({ caption: "❌ E'lon bekor qilindi." }).catch(() => undefined);
  });

  bot.callbackQuery("elonr:send", async (ctx) => {
    if (String(ctx.from.id) !== OWNER_TG) return;
    const d = photoDraft.get(OWNER_TG);
    if (!d?.fileId || !d.caption) {
      await ctx.answerCallbackQuery({ text: "Rasm yoki matn topilmadi" });
      return;
    }
    photoDraft.delete(OWNER_TG);
    await ctx.answerCallbackQuery({ text: "Fonda yuborilmoqda…" });
    const users = await prisma.telegramUser.findMany({ where: { memberId: { not: null } }, select: { id: true } });
    await ctx.editMessageCaption({ caption: `📤 ${users.length} kishiga yuborilmoqda… (fonda)` }).catch(() => undefined);
    const kb = new InlineKeyboard().webApp(targetLabel(d.target), webAppUrlFor(d.target));
    // /elon bilan bir xil: fon-yuborish (webhook 10s limitini bloklamaslik uchun) + ~22 msg/s
    void (async () => {
      let ok = 0;
      let fail = 0;
      for (let i = 0; i < users.length; i++) {
        try {
          await bot.api.sendPhoto(users[i]!.id, d.fileId!, { caption: d.caption, parse_mode: "HTML", reply_markup: kb });
          ok++;
        } catch {
          fail++;
        }
        if (i % 22 === 21) await new Promise((r) => setTimeout(r, 1000));
      }
      await bot.api
        .sendMessage(OWNER_TG, `✅ <b>Rasmli e'lon yuborildi</b>\n📬 Yetkazildi: <b>${ok}</b>\n${fail ? `❌ Yetmadi: <b>${fail}</b> (bloklagan/o'chirgan)` : ""}`, { parse_mode: "HTML" })
        .catch(() => undefined);
    })().catch((e) => console.error("[broadcast-photo] failed", e));
  });
}
