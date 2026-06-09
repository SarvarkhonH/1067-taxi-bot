import { Bot, Context, InlineKeyboard } from "grammy";
import { formatNumber } from "@t1067/shared";
import { env } from "../env";
import { getDataSource, type ActiveBooking, type SavedAddress } from "../kas";
import { getMe } from "../services/memberService";

interface BookingSession {
  awaitingText: boolean;
  clientName: string;
  phone: string;
  addresses: SavedAddress[];
  pickup?: SavedAddress;
}

// In-memory booking state per telegram user (fine for a short flow).
const sessions = new Map<string, BookingSession>();

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function trunc(s: string, n = 40): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function addressKb(addresses: SavedAddress[], withType = false): InlineKeyboard {
  const kb = new InlineKeyboard();
  addresses.forEach((a, i) => kb.text(trunc(a.name), `bk:addr:${i}`).row());
  if (withType) kb.text("✍️ Boshqa manzil", "bk:type").row();
  return kb.text("❌ Bekor", "bk:cancel");
}
function confirmKb(): InlineKeyboard {
  return new InlineKeyboard().text("✅ Chaqirish", "bk:confirm").text("❌ Bekor", "bk:cancel");
}
function confirmText(s: BookingSession): string {
  return `🚕 <b>Tasdiqlang</b>\n\n📍 Qayerdan: <b>${esc(s.pickup!.name)}</b>\n📞 ${esc(s.phone)}\n\nTaxi chaqiraymi?`;
}

// ─── tracking ─────────────────────────────────────────────────────────────────
function statusLabel(s: string): string {
  const map: Record<string, string> = {
    in_place: "🔍 Haydovchi qidirilyapti…",
    searching: "🔍 Haydovchi qidirilyapti…",
    new: "🔍 Haydovchi qidirilyapti…",
    called: "🚖 Haydovchi yo'lda",
    accepted: "🚖 Haydovchi yo'lda",
    on_the_way: "🚖 Haydovchi yo'lda",
    arrived: "✅ Haydovchi yetib keldi!",
    started: "🚗 Safar boshlandi",
    completed: "🏁 Safar yakunlandi",
    finished: "🏁 Safar yakunlandi",
  };
  return map[s] ?? `ℹ️ Holat: ${esc(s)}`;
}

function renderTracking(b: ActiveBooking): string {
  const arrived = ["arrived", "completed", "finished"].includes(b.status);
  const label = b.driver && !arrived ? "🚖 Haydovchi yo'lda" : statusLabel(b.status);
  const lines = [label, "", `📍 Manzil: <b>${esc(b.addressName)}</b>`];
  if (b.driver) {
    lines.push(
      "",
      `🚗 <b>${esc(b.driver.fullName)}</b>`,
      `${esc(b.driver.carModel)} · <b>${esc(b.driver.carNumber)}</b>`,
      `📞 ${esc(b.driver.phone)}`,
    );
    if (b.driver.rating) lines.push(`⭐ ${b.driver.rating.toFixed(1)}`);
  } else {
    lines.push("", "⏳ Haydovchi hali tayinlanmadi.");
  }
  if (b.clientBonus) lines.push("", `💰 Bu safardan cashback: <b>+${formatNumber(b.clientBonus)} so'm</b>`);
  return lines.join("\n");
}

function trackingKb(b: ActiveBooking): InlineKeyboard {
  const kb = new InlineKeyboard().text("🔄 Yangilash", "bk:status");
  if (b.driver?.lat && b.driver?.lng) kb.text("🗺 Joylashuv", "bk:loc");
  return kb;
}

async function showTracking(ctx: Context): Promise<void> {
  const me = await getMe(String(ctx.from!.id));
  if (!me?.member.phone) {
    await ctx.reply("Avval telefon raqamingizni ulang — /start.");
    return;
  }
  const b = await getDataSource().getActiveBooking(me.member.phone).catch(() => null);
  if (!b) {
    await ctx.reply("Sizda hozircha faol buyurtma yo'q.\n«🚕 Taxi chaqirish» tugmasini bosing.");
    return;
  }
  await ctx.reply(renderTracking(b), { parse_mode: "HTML", reply_markup: trackingKb(b) });
}

async function startBooking(ctx: Context): Promise<void> {
  const id = String(ctx.from!.id);
  const me = await getMe(id);
  if (!me) {
    await ctx.reply("Avval telefon raqamingizni ulang — /start.");
    return;
  }
  const phone = me.member.phone;
  if (!phone) {
    await ctx.reply("Telefon raqamingiz topilmadi. /start.");
    return;
  }

  await ctx.reply("🔎 Ma'lumotlaringiz olinmoqda…");
  const info = await getDataSource().checkClient(phone).catch(() => null);

  if (info?.activeBooking) {
    await ctx.reply(
      `ℹ️ Sizda faol buyurtma bor:\n📍 ${esc(info.activeBooking.addressName)}\n🕒 ${esc(info.activeBooking.createdDate)}`,
      { parse_mode: "HTML" },
    );
    return;
  }

  const addresses = info?.addresses ?? [];
  sessions.set(id, {
    awaitingText: addresses.length === 0,
    clientName: info?.clientName ?? me.member.fullName,
    phone,
    addresses,
  });

  if (addresses.length) {
    await ctx.reply("🚕 <b>Taxi chaqirish</b>\n\nQayerdan olib ketamiz?", {
      parse_mode: "HTML",
      reply_markup: addressKb(addresses, true),
    });
  } else {
    await ctx.reply("🚕 <b>Taxi chaqirish</b>\n\n✍️ Manzilingizni yozing (masalan: <b>Bunyodkor 12</b>):", {
      parse_mode: "HTML",
    });
  }
}

export function registerBooking(bot: Bot): void {
  bot.hears("🚕 Taxi chaqirish", (ctx) => startBooking(ctx));
  bot.command("book", (ctx) => startBooking(ctx));
  bot.hears("📍 Buyurtmam", (ctx) => showTracking(ctx));
  bot.command("status", (ctx) => showTracking(ctx));

  bot.callbackQuery("bk:status", async (ctx) => {
    await ctx.answerCallbackQuery("Yangilandi");
    const me = await getMe(String(ctx.from.id));
    if (!me?.member.phone) return;
    const b = await getDataSource().getActiveBooking(me.member.phone).catch(() => null);
    if (!b) {
      await ctx.editMessageText("Sizda faol buyurtma yo'q.");
      return;
    }
    await ctx.editMessageText(renderTracking(b), { parse_mode: "HTML", reply_markup: trackingKb(b) });
  });

  bot.callbackQuery("bk:loc", async (ctx) => {
    const me = await getMe(String(ctx.from.id));
    const b = me?.member.phone ? await getDataSource().getActiveBooking(me.member.phone).catch(() => null) : null;
    if (b?.driver?.lat && b.driver?.lng) {
      await ctx.answerCallbackQuery();
      await ctx.replyWithLocation(b.driver.lat, b.driver.lng);
    } else {
      await ctx.answerCallbackQuery("Joylashuv hozir mavjud emas");
    }
  });

  bot.callbackQuery(/^bk:addr:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const s = sessions.get(String(ctx.from.id));
    const addr = s?.addresses[Number(ctx.match[1])];
    if (!s || !addr) return;
    s.pickup = addr;
    s.awaitingText = false;
    await ctx.editMessageText(confirmText(s), { parse_mode: "HTML", reply_markup: confirmKb() });
  });

  bot.callbackQuery("bk:type", async (ctx) => {
    await ctx.answerCallbackQuery();
    const s = sessions.get(String(ctx.from.id));
    if (!s) return;
    s.awaitingText = true;
    await ctx.editMessageText("✍️ Manzilingizni yozing (masalan: <b>Bunyodkor 12</b>):", { parse_mode: "HTML" });
  });

  bot.callbackQuery("bk:cancel", async (ctx) => {
    sessions.delete(String(ctx.from.id));
    await ctx.answerCallbackQuery("Bekor qilindi");
    await ctx.editMessageText("❌ Buyurtma bekor qilindi.");
  });

  bot.callbackQuery("bk:confirm", async (ctx) => {
    await ctx.answerCallbackQuery();
    const id = String(ctx.from.id);
    const s = sessions.get(id);
    if (!s?.pickup) return;
    const req = {
      clientName: s.clientName,
      addressName: s.pickup.name,
      addressId: s.pickup.id,
      phoneNumber: s.phone,
      additionalPayment: 0,
    };
    sessions.delete(id);

    if (!env.bookingLive) {
      await ctx.editMessageText(
        `🧪 <b>TEST rejimi</b> — haqiqiy taxi chaqirilmadi.\n\nQuyidagi buyurtma yuborilardi:\n👤 ${esc(req.clientName)}\n📍 ${esc(req.addressName)}\n📞 ${esc(req.phoneNumber)}\n\n<i>Jonli qilish: .env da BOOKING_LIVE=true</i>`,
        { parse_mode: "HTML" },
      );
      return;
    }

    await ctx.editMessageText("⏳ Buyurtma yuborilyapti…");
    const res = await getDataSource().createBooking(req);
    if (res.ok) {
      await ctx.editMessageText(
        `✅ <b>Buyurtma qabul qilindi!</b>\n📍 ${esc(req.addressName)}\n\nHaydovchi qidirilyapti… 🔍`,
        { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("🔄 Holatni ko'rish", "bk:status") },
      );
    } else {
      await ctx.editMessageText(`⚠️ Buyurtma yuborilmadi: ${esc(res.message ?? "xatolik")}`, { parse_mode: "HTML" });
    }
  });

  // free-text address input — only acts while a booking is awaiting an address
  bot.on("message:text", async (ctx, next) => {
    const s = sessions.get(String(ctx.from!.id));
    if (!s || !s.awaitingText) return next();
    const results = await getDataSource().searchAddresses(ctx.message.text).catch(() => []);
    if (!results.length) {
      await ctx.reply("Topilmadi. Boshqacha yozib ko'ring:");
      return;
    }
    s.addresses = results;
    s.awaitingText = false;
    await ctx.reply("📍 Manzilni tanlang:", { reply_markup: addressKb(results) });
  });
}
