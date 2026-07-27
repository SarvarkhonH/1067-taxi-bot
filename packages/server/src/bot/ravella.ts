// 🎀 RAVELLA bot-tomoni (RAVELLA_PLAN §4) — hamkor (Zoyir aka) buyurtmani SHU YERDA boshqaradi:
// [✅ Qabul][☎️ Bog'landim][✔ Bajarildi][❌ Rad]. Pul-logikasi ravellaService'da (shartli status-
// o'tishlar + cashback faqat `done`'da) — bu fayl faqat UI + push. Market kartasining naqshi AYNAN.
// Hamkor sozlanmagan bo'lsa karta EGAga tushadi (buyurtma hech qachon "hech kimga" ketmaydi).
import { Bot, Context, InlineKeyboard } from "grammy";
import { formatNumber } from "@t1067/shared";
import { prisma } from "../db";
import type { RavellaOwnerNotice } from "../services/ravellaService";

const OWNER_TG = "6506297119";

// ── 🛠 Hamkor boshqaruvi (ega so'radi 2026-07-27: "bot orqali yozib rasm yuklash imkoniyatini
// Zoyir akaga va faylasufga qulaylik ber"). Admin panelsiz, botning o'zida: bezak qo'shish,
// rasmni almashtirish, qo'shimcha qo'shish. Sessiya xotirada (market.ts wizard naqshi) — bot
// qayta ishga tushsa qoralama yo'qoladi, bu arzon va xavfsiz.
type Step = "cat" | "name" | "desc" | "photo" | "addonName" | "addonPhoto" | "replacePhoto" | "contact" | "story";
interface Draft { step: Step; categoryId?: number; itemId?: number; name?: string; desc?: string; addonId?: number; contactKey?: string }
const drafts = new Map<string, Draft>();

/** bot.ts'dagi `:photo` handleri hamkor (admin ham, haydovchi ham emas) rasmini `next()`siz
 *  yutadi — /hikoya va /elonrasm bilan bo'lgan AYNI xato. Shu yerda kutayotgan bo'lsak chetga oladi. */
export function isAwaitingRavellaPhoto(tgId: string): boolean {
  const d = drafts.get(tgId);
  return d?.step === "photo" || d?.step === "addonPhoto" || d?.step === "replacePhoto" || d?.step === "story";
}

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

  // ── 🛠 /ravella — hamkor paneli: buyurtmalar + katalogni BOTDAN boshqarish ───────────────────
  bot.command("ravella", async (ctx) => {
    const allowed = await ravellaChats();
    if (!allowed.includes(String(ctx.from?.id ?? ""))) return;
    drafts.delete(String(ctx.from!.id));
    const open = await prisma.ravellaOrder.count({ where: { status: { in: ["pending", "accepted", "called"] } } });
    const items = await prisma.ravellaItem.count();
    await ctx.reply(
      `🎀 <b>Ravella boshqaruvi</b>\n\n📦 Ochiq buyurtma: <b>${open}</b>\n🎭 Katalogda: <b>${items}</b> ta bezak`,
      {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard()
          .text("📦 Buyurtmalar", "rvm:orders").row()
          .text("➕ Yangi bezak", "rvm:new").row()
          .text("🖼 Rasm qo'shish (karusel)", "rvm:photo").row()
          .text("➕ Qo'shimcha qo'shish", "rvm:addon").row()
          .text("📹 Hikoya joylash", "rvm:story").row()
          .text("☎️ Aloqa va tarmoqlar", "rvm:contacts"),
      },
    );
  });

  const guard = async (ctx: Context): Promise<boolean> => {
    const allowed = await ravellaChats();
    return allowed.includes(String(ctx.from?.id ?? ""));
  };

  bot.callbackQuery("rvm:orders", async (ctx) => {
    if (!(await guard(ctx))) return;
    await ctx.answerCallbackQuery();
    await showOpenOrders(ctx);
  });

  // «➕ Yangi bezak» → kategoriya tanlash
  bot.callbackQuery("rvm:new", async (ctx) => {
    if (!(await guard(ctx))) return;
    await ctx.answerCallbackQuery();
    const cats = await prisma.ravellaCategory.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, take: 12 });
    if (!cats.length) { await ctx.reply("Avval kategoriya kerak — egaga ayting."); return; }
    const kb = new InlineKeyboard();
    for (const c of cats) kb.text(`${c.emoji} ${c.name}`, `rvm:cat:${c.id}`).row();
    await ctx.reply("Qaysi bo'limga qo'shamiz?", { reply_markup: kb });
  });

  bot.callbackQuery(/^rvm:cat:(\d+)$/, async (ctx) => {
    if (!(await guard(ctx))) return;
    await ctx.answerCallbackQuery();
    drafts.set(String(ctx.from.id), { step: "name", categoryId: Number((ctx.match as unknown as string[])[1]) });
    await ctx.reply("✍️ Bezak nomini yozing.\n<i>Masalan: «Onajon» yozuvi</i>\n\n❌ Bekor: /bekor_ravella", { parse_mode: "HTML" });
  });

  // «🖼 Rasmni almashtirish» / «➕ Qo'shimcha» → bezak tanlash
  const pickItem = async (ctx: Context, action: "photo" | "addon"): Promise<void> => {
    const items = await prisma.ravellaItem.findMany({ orderBy: { id: "asc" }, take: 20, select: { id: true, name: true } });
    if (!items.length) { await ctx.reply("Katalog bo'sh — avval «➕ Yangi bezak»."); return; }
    const kb = new InlineKeyboard();
    for (const i of items) kb.text(i.name.slice(0, 40), `rvm:${action}:${i.id}`).row();
    await ctx.reply(action === "photo" ? "Qaysi bezakka rasm qo'shamiz?" : "Qaysi bezakka qo'shimcha qo'shamiz?", { reply_markup: kb });
  };
  bot.callbackQuery("rvm:photo", async (ctx) => {
    if (!(await guard(ctx))) return;
    await ctx.answerCallbackQuery();
    await pickItem(ctx, "photo");
  });
  bot.callbackQuery("rvm:addon", async (ctx) => {
    if (!(await guard(ctx))) return;
    await ctx.answerCallbackQuery();
    await pickItem(ctx, "addon");
  });
  bot.callbackQuery(/^rvm:(photo|addon):(\d+)$/, async (ctx) => {
    if (!(await guard(ctx))) return;
    await ctx.answerCallbackQuery();
    const [, action, idStr] = ctx.match as unknown as string[];
    const itemId = Number(idStr);
    if (action === "photo") {
      drafts.set(String(ctx.from.id), { step: "replacePhoto", itemId });
      const have = (await (await import("../services/ravellaService")).listRavellaItemPhotoIds(itemId)).length;
      await ctx.reply(
        `📸 Rasmlarni yuboring — <b>ketma-ket bir nechtasini</b> yuborsangiz bo'ladi, mijoz ularni chapga-o'ngga suradi.\n\n` +
          `Hozir bu bezakda: <b>${have}</b> ta rasm.\n\n✅ Tugatish: /tayyor\n🗑 Hammasini o'chirish: /rasmlar_tozala\n❌ Bekor: /bekor_ravella`,
        { parse_mode: "HTML" },
      );
    } else {
      drafts.set(String(ctx.from.id), { step: "addonName", itemId });
      await ctx.reply("✍️ Qo'shimcha nomini yozing.\n<i>Masalan: Salyut</i>\n\n❌ Bekor: /bekor_ravella", { parse_mode: "HTML" });
    }
  });


  // ── ☎️ Aloqa va ijtimoiy tarmoqlar (ega so'radi 2026-07-27: "botdan sozlaymiz") ──────────────
  const CONTACT_LABEL: Record<string, string> = {
    phone: "📞 Telefon", telegram: "✈️ Telegram", instagram: "📸 Instagram",
    youtube: "▶️ YouTube", tiktok: "🎵 TikTok", facebook: "📘 Facebook", website: "🌐 Sayt",
  };

  const contactsScreen = async (ctx: Context): Promise<void> => {
    const { getRavellaContacts, RAVELLA_CONTACT_KEYS } = await import("../services/ravellaService");
    const c = await getRavellaContacts() as Record<string, string | undefined>;
    const lines = RAVELLA_CONTACT_KEYS.map((k) => `${CONTACT_LABEL[k]}: ${c[k] ? esc(c[k]!) : "—"}`);
    const kb = new InlineKeyboard();
    RAVELLA_CONTACT_KEYS.forEach((k, i) => {
      kb.text(CONTACT_LABEL[k]!, `rvm:c:${k}`);
      if (i % 2 === 1) kb.row();
    });
    await ctx.reply(
      `☎️ <b>Aloqa va tarmoqlar</b>\n\n${lines.join("\n")}\n\n<i>Sayt va ilovada shu ikonkalar chiqadi. O'zgartirish uchun tugmani bosing.</i>`,
      { parse_mode: "HTML", reply_markup: kb },
    );
  };

  bot.callbackQuery("rvm:contacts", async (ctx) => {
    if (!(await guard(ctx))) return;
    await ctx.answerCallbackQuery();
    await contactsScreen(ctx);
  });

  bot.callbackQuery(/^rvm:c:([a-z]+)$/, async (ctx) => {
    if (!(await guard(ctx))) return;
    await ctx.answerCallbackQuery();
    const key = (ctx.match as unknown as string[])[1]!;
    drafts.set(String(ctx.from.id), { step: "contact", contactKey: key });
    const hint: Record<string, string> = {
      phone: "+998 90 123 45 67",
      telegram: "@ravella_uz yoki t.me/ravella_uz",
      instagram: "@ravella yoki instagram.com/ravella",
      youtube: "youtube.com/@ravella",
      tiktok: "@ravella",
      facebook: "facebook.com/ravella",
      website: "ravella.uz",
    };
    await ctx.reply(
      `${CONTACT_LABEL[key]} — qiymatini yozing.\n<i>Masalan: ${esc(hint[key] ?? "")}</i>\n\nO'chirish uchun «-» yuboring.\n❌ Bekor: /bekor_ravella`,
      { parse_mode: "HTML" },
    );
  });

  // Butun galereyani tozalash — hamkor "qaytadan yuklayman" deganda

  // ── 📹 Hikoya (RAVELLA_V2_PLAN §5) — oxirgi 10 ta, muddat YO'Q, 11-chisi eskisini siqib chiqaradi ──
  bot.callbackQuery("rvm:story", async (ctx) => {
    if (!(await guard(ctx))) return;
    await ctx.answerCallbackQuery();
    const { listRavellaStories, RAVELLA_STORY_MAX } = await import("../services/ravellaStoryService");
    const list = await listRavellaStories(undefined, true);
    drafts.set(String(ctx.from.id), { step: "story" });
    const kb = new InlineKeyboard();
    if (list.length) kb.text(`🗑 Eng eskisini o'chirish (${list.length}/${RAVELLA_STORY_MAX})`, `rvm:sdel:${list[0]!.id}`);
    await ctx.reply(
      `📹 <b>Hikoya joylash</b>\n\nRasm yoki QISQA video yuboring (30 soniyagacha).\n\n` +
        `Hozir: <b>${list.length}/${RAVELLA_STORY_MAX}</b> ta hikoya.\n` +
        `<i>Muddat yo'q — ${RAVELLA_STORY_MAX} tadan oshsa eng eskisi o'zi o'chadi.</i>\n\n❌ Bekor: /bekor_ravella`,
      { parse_mode: "HTML", reply_markup: list.length ? kb : undefined },
    );
  });

  bot.callbackQuery(/^rvm:sdel:(\d+)$/, async (ctx) => {
    if (!(await guard(ctx))) return;
    const { deleteRavellaStory } = await import("../services/ravellaStoryService");
    await deleteRavellaStory(Number((ctx.match as unknown as string[])[1]));
    await ctx.answerCallbackQuery({ text: "O'chirildi" });
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => undefined);
  });

  /** Hikoya saqlangach ikkalasiga ham bir xil javob — rasm va video yo'llari ajralib ketmasin. */
  const storySaved = async (ctx: Context, r: { ok: boolean; removed: number }): Promise<void> => {
    drafts.delete(String(ctx.from!.id));
    if (!r.ok) { await ctx.reply("❌ Saqlanmadi, qaytadan urinib ko'ring."); return; }
    await ctx.reply(
      `✅ Hikoya joylandi.${r.removed ? ` (${r.removed} ta eng eski hikoya o'chdi — 10 ta chegara)` : ""}\n\nYana joylash: /ravella`,
    );
    if (String(ctx.from!.id) !== OWNER_TG) {
      await bot.api.sendMessage(OWNER_TG, "🎀📹 Ravella yangi hikoya joyladi.").catch(() => undefined);
    }
  };

  // video — hikoya kutilayotgan paytdagina ushlanadi, aks holda next() (boshqa oqimlar buzilmasin)
  bot.on([":video", ":animation", ":video_note"], async (ctx, next) => {
    const d = drafts.get(String(ctx.from?.id ?? ""));
    if (d?.step !== "story") { await next(); return; }
    const v = ctx.message?.video ?? ctx.message?.animation ?? ctx.message?.video_note;
    if (!v) { await next(); return; }
    // ⏱ 30 soniyalik chegara: uzun video hikoya emas — mobil internetda ochilmaydi va odam ketadi
    if (typeof v.duration === "number" && v.duration > 30) {
      await ctx.reply("⚠️ Video 30 soniyadan uzun. Qisqaroq video yuboring.");
      return;
    }
    const { createRavellaStory } = await import("../services/ravellaStoryService");
    await storySaved(ctx, await createRavellaStory({ videoFileId: v.file_id, caption: ctx.message?.caption }));
  });

  bot.command("rasmlar_tozala", async (ctx, next) => {
    const d = drafts.get(String(ctx.from!.id));
    if (!d?.itemId) { await next(); return; }
    const { clearRavellaItemPhotos } = await import("../services/ravellaService");
    await clearRavellaItemPhotos(d.itemId);
    await ctx.reply("🗑 Rasmlar o'chirildi. Endi yangilarini yuboring.");
  });

  bot.command("bekor_ravella", async (ctx) => {
    if (drafts.delete(String(ctx.from!.id))) await ctx.reply("❌ Bekor qilindi.");
  });

  // «rasmsiz tugatish» — qo'shimcha rasmi bo'lmasa
  bot.command("tayyor", async (ctx, next) => {
    if (!drafts.delete(String(ctx.from!.id))) { await next(); return; }
    await ctx.reply("✅ Tayyor. Katalogda ko'rinadi.");
  });

  // matn qadamlari — sessiyasi yo'qlar next() bilan o'tib ketadi (boshqa oqimlar buzilmasin)
  bot.on("message:text", async (ctx, next) => {
    const tg = String(ctx.from.id);
    const d = drafts.get(tg);
    if (!d) { await next(); return; }
    const text = ctx.message.text.trim();
    if (text.startsWith("/")) { await next(); return; }
    const svc = await import("../services/ravellaService");
    if (d.step === "name") {
      d.name = text.slice(0, 80);
      d.step = "desc";
      drafts.set(tg, d);
      await ctx.reply("✍️ Qisqa tavsif yozing (nima kiradi, qayerga mos).\n<i>Kerak bo'lmasa «-» yuboring.</i>", { parse_mode: "HTML" });
      return;
    }
    if (d.step === "desc") {
      d.desc = text === "-" ? "" : text.slice(0, 300);
      d.step = "photo";
      drafts.set(tg, d);
      await ctx.reply("📸 Endi shu bezakning RASMINI yuboring (surat sifatida).");
      return;
    }
    if (d.step === "contact") {
      const r = await svc.setRavellaContact(d.contactKey!, text);
      drafts.delete(tg);
      await ctx.reply(r.ok ? "✅ Saqlandi." : "❌ Noto'g'ri qiymat (telefon kamida 7 raqam bo'lsin).");
      if (r.ok) await contactsScreen(ctx);
      return;
    }
    if (d.step === "addonName") {
      d.name = text.slice(0, 80);
      const r = await svc.adminCreateAddon({ itemId: d.itemId!, name: d.name, priceSom: 0, maxQty: 3 });
      if (!r.ok || !r.id) { drafts.delete(tg); await ctx.reply("❌ Saqlanmadi, qaytadan urinib ko'ring."); return; }
      d.addonId = r.id;
      d.step = "addonPhoto";
      drafts.set(tg, d);
      await ctx.reply(
        `✅ «${esc(d.name)}» qo'shildi.\n\n📸 Endi shu qo'shimcha QO'SHILGAN holatdagi rasmni yuboring — mijoz «+» bosganda katta rasm aynan shunga o'zgaradi.\n\n<i>Rasm bo'lmasa: /tayyor</i>`,
        { parse_mode: "HTML" },
      );
      return;
    }
    await next();
  });

  // rasm qadamlari — session-gated; boshqalar next() bilan o'tadi
  bot.on("message:photo", async (ctx, next) => {
    const tg = String(ctx.from.id);
    const d = drafts.get(tg);
    if (!d || (d.step !== "photo" && d.step !== "addonPhoto" && d.step !== "replacePhoto" && d.step !== "story")) { await next(); return; }
    const sizes = ctx.message.photo;
    const fileId = sizes[sizes.length - 1]!.file_id; // eng katta o'lcham
    if (d.step === "story") {
      const { createRavellaStory } = await import("../services/ravellaStoryService");
      await storySaved(ctx, await createRavellaStory({ photoFileId: fileId, caption: ctx.message.caption }));
      return;
    }
    const svc = await import("../services/ravellaService");

    if (d.step === "photo") {
      const r = await svc.adminCreateItem({ categoryId: d.categoryId!, name: d.name!, basePriceSom: 0, desc: d.desc });
      if (!r.ok || !r.id) { drafts.delete(tg); await ctx.reply("❌ Saqlanmadi."); return; }
      await svc.addRavellaItemPhoto(r.id, fileId);
      await svc.adminEditItem(r.id, { active: true });
      // Sessiya rasm-rejimida qoladi: hamkor shu bezakka yana rasm qo'sha oladi (karusel)
      drafts.set(tg, { step: "replacePhoto", itemId: r.id });
      await ctx.reply(
        `✅ <b>${esc(d.name!)}</b> katalogga qo'shildi va ko'rinmoqda.\n\n📸 Yana rasm yuborsangiz karuselga qo'shiladi. Tugatish: /tayyor`,
        { parse_mode: "HTML" },
      );
      if (tg !== OWNER_TG) {
        await bot.api.sendMessage(OWNER_TG, `🎀 Ravella yangi bezak qo'shdi: <b>${esc(d.name!)}</b>`, { parse_mode: "HTML" }).catch(() => undefined);
      }
      return;
    }
    if (d.step === "replacePhoto") {
      // Sessiya YOPILMAYDI: hamkor ketma-ket bir nechta rasm yuborishi mumkin (karusel).
      // Telegram albom yuborsa ham har surat alohida update bo'lib keladi — hammasi qo'shiladi.
      const r = await svc.addRavellaItemPhoto(d.itemId!, fileId);
      await ctx.reply(
        r.ok ? `✅ ${r.count}-rasm qo'shildi. Yana yuboring yoki /tayyor` : "⚠️ Bu bezakda rasm to'lgan (12 ta). /tayyor",
      );
      return;
    }
    await svc.setRavellaAddonPhotoFileId(d.addonId!, fileId);
    drafts.delete(tg);
    await ctx.reply("✅ Qo'shimcha rasmi saqlandi. Mijoz «+» bosganda shu rasm chiqadi.");
  });
}

/** Ochiq buyurtmalarni kartalar bilan qayta chiqarish (kartani yo'qotib qo'ysa ham topiladi). */
async function showOpenOrders(ctx: Context): Promise<void> {
  {
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
  }
}
