import { Bot, Context, InlineKeyboard, Keyboard } from "grammy";
import { formatNumber, haversineKm } from "@t1067/shared";
import { env } from "../env";
import { getDataSource, type ActiveBooking, type SavedAddress } from "../kas";
import { getMe, getMemberId } from "../services/memberService";
import { getFareConfig } from "../services/clientInfoService";
import { callOneTapFor, cancelBookingFor, getQuickPickup, rememberPickup } from "../services/bookingService";

interface BookingSession {
  awaitingText: boolean;
  clientName: string;
  phone: string;
  addresses: SavedAddress[];
  pickup?: SavedAddress;
}

// In-memory per-user wizard state (transient by design). The 1-tap pickup
// memory lives on Member (DB) — it must survive restarts/deploys.
const sessions = new Map<string, BookingSession>();

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function trunc(s: string, n = 38): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// Uber pattern #1: GPS pickup. Reply keyboard with a native location request.
function pickupKeyboard(): Keyboard {
  return new Keyboard().requestLocation("📍 Joylashuvni yuborish").row().text("✍️ Manzil yozish").text("❌ Bekor").resized().oneTime();
}

function addressKb(addresses: SavedAddress[], lastForUser?: SavedAddress): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (lastForUser) kb.text(`🔁 Yana: ${trunc(lastForUser.name, 28)}`, `bk:last`).row();
  addresses.slice(0, 6).forEach((a, i) => kb.text(`⭐ ${trunc(a.name)}`, `bk:addr:${i}`).row());
  return kb;
}
function confirmKb(): InlineKeyboard {
  return new InlineKeyboard().text("✅ Chaqirish", "bk:confirm").text("❌ Bekor", "bk:cancel");
}

// Uber pattern #3: transparent fare before confirm (kas = taximeter → show the rate card + cashback).
async function confirmText(s: BookingSession): Promise<string> {
  let fare = "";
  try {
    const cfg = await getFareConfig();
    fare =
      `\n🧮 <b>Narx</b> (taximetr):\n` +
      `  • Eng kam: <b>${formatNumber(cfg.minimalPayment)} so'm</b>\n` +
      `  • Har km: <b>${formatNumber(cfg.perKmCity)} so'm</b>\n` +
      `  • 💰 Bu safardan: <b>+${formatNumber(cfg.cashback.perAppRide)} so'm cashback</b>\n`;
  } catch {
    /* fare optional */
  }
  return `🚕 <b>Tasdiqlang</b>\n\n📍 Qayerdan: <b>${esc(s.pickup!.name)}</b>\n📞 ${esc(s.phone)}\n${fare}\nTaxi chaqiraymi?`;
}

// ─── tracking (Uber pattern #2: live driver + ETA + cancel) ───────────────────
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

function etaMin(b: ActiveBooking): number | null {
  if (b.driver?.lat && b.driver?.lng && b.lat && b.lng) {
    return Math.max(1, Math.ceil((haversineKm({ lat: b.driver.lat, lng: b.driver.lng }, { lat: b.lat, lng: b.lng }) / 24) * 60));
  }
  return null;
}

function renderTracking(b: ActiveBooking): string {
  const arrived = ["arrived", "completed", "finished"].includes(b.status);
  const label = b.driver && !arrived ? "🚖 Haydovchi yo'lda" : statusLabel(b.status);
  const eta = etaMin(b);
  const lines = [`${label}${eta && b.driver && !arrived ? ` · ~${eta} daq` : ""}`, "", `📍 Manzil: <b>${esc(b.addressName)}</b>`];
  if (b.driver) {
    lines.push("", `🚗 <b>${esc(b.driver.fullName)}</b>`, `${esc(b.driver.carModel)} · <b>${esc(b.driver.carNumber)}</b>`, `📞 ${esc(b.driver.phone)}`);
    if (b.driver.rating) lines.push(`⭐ ${b.driver.rating.toFixed(1)}`);
  } else {
    lines.push("", "⏳ Haydovchi qidirilyapti — biroz kuting…");
  }
  if (b.clientBonus) lines.push("", `💰 Bu safardan cashback: <b>+${formatNumber(b.clientBonus)} so'm</b>`);
  return lines.join("\n");
}

function trackingKb(b: ActiveBooking): InlineKeyboard {
  const kb = new InlineKeyboard().text("🔄 Yangilash", "bk:status");
  if (b.driver?.lat && b.driver?.lng) kb.text("🗺 Joylashuv", "bk:loc");
  const cancellable = ["in_place", "searching", "new", "called", "accepted", "on_the_way"].includes(b.status);
  if (cancellable) kb.row().text("✖ Buyurtmani bekor qilish", "bk:cancelride");
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

async function startBooking(ctx: Context, opts: { forceFull?: boolean } = {}): Promise<void> {
  const id = String(ctx.from!.id);
  const me = await getMe(id);
  if (!me?.member.phone) {
    await ctx.reply("Avval telefon raqamingizni ulang — /start.");
    return;
  }
  const phone = me.member.phone;

  const info = await getDataSource().checkClient(phone).catch(() => null);
  if (info?.activeBooking) {
    await ctx.reply(`ℹ️ Sizda faol buyurtma bor:\n📍 ${esc(info.activeBooking.addressName)}\n\n«📍 Buyurtmam» — holatini ko'ring.`, { parse_mode: "HTML" });
    return;
  }

  const addresses = info?.addresses ?? [];
  sessions.set(id, { awaitingText: false, clientName: info?.clientName ?? me.member.fullName, phone, addresses });

  // 1-tap: returning rider gets one big CTA — pickup resolved behind the button
  const quick = opts.forceFull ? null : await getQuickPickup(me.member.id).catch(() => null);
  if (quick) {
    const kb = new InlineKeyboard()
      .text(`🚕 Chaqirish — ${trunc(quick.name, 26)}`, "bk:now")
      .row()
      .text("📍 Boshqa manzil", "bk:other");
    await ctx.reply(`🚕 <b>1067 tayyor!</b>\n\n📍 <b>${esc(quick.name)}</b> dan olib ketamizmi?`, { parse_mode: "HTML", reply_markup: kb });
    return;
  }

  // first-timer: GPS-first, then saved quick-picks
  await ctx.reply("🚕 <b>Qayerdan olib ketamiz?</b>\n\n📍 Joylashuvingizni yuboring — eng tez yo'l. Yoki manzilni tanlang/yozing 👇", {
    parse_mode: "HTML",
    reply_markup: pickupKeyboard(),
  });
  if (addresses.length) {
    await ctx.reply("⭐ Tez tanlash:", { reply_markup: addressKb(addresses) });
  }
}

/** Nearest saved address to a GPS point (within ~1.2km), so kas gets a real addressId. */
function nearestAddress(addresses: SavedAddress[], lat: number, lng: number): SavedAddress | null {
  let best: SavedAddress | null = null;
  let bestKm = 1.2;
  for (const a of addresses) {
    if (a.lat == null || a.lng == null) continue;
    const km = haversineKm({ lat, lng }, { lat: a.lat, lng: a.lng });
    if (km < bestKm) {
      bestKm = km;
      best = a;
    }
  }
  return best;
}

async function showConfirm(ctx: Context, s: BookingSession): Promise<void> {
  await ctx.reply(await confirmText(s), { parse_mode: "HTML", reply_markup: confirmKb() });
}

export function registerBooking(bot: Bot): void {
  bot.hears("🚕 Taxi chaqirish", (ctx) => startBooking(ctx));
  bot.command("book", (ctx) => startBooking(ctx));
  bot.hears("📍 Buyurtmam", (ctx) => showTracking(ctx));
  bot.command("status", (ctx) => showTracking(ctx));
  bot.command("qayta", (ctx) => startBooking(ctx)); // returning rider lands on the 1-tap card

  // 📜 ride history (kas bookingReports)
  bot.command("tarix", async (ctx) => {
    const me = await getMe(String(ctx.from!.id));
    if (!me?.member.phone) {
      await ctx.reply("Avval telefon raqamingizni ulang — /start.");
      return;
    }
    const rides = await getDataSource().getRideHistory(me.member.phone, 8).catch(() => []);
    if (!rides.length) {
      await ctx.reply("📜 Safar tarixi topilmadi.");
      return;
    }
    const lines = rides.map((r) => {
      const d = r.at ? new Date(r.at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
      const done = ["delivered", "completed", "finished"].includes(r.status) ? "🏁" : ["cancel_by_operator", "cancel_by_server"].includes(r.status) ? "✖" : "🚖";
      return `${done} <b>${esc(r.addressName)}</b> · ${d}${r.cashback ? ` · 💰+${formatNumber(r.cashback)}` : ""}`;
    });
    await ctx.reply(`📜 <b>Oxirgi safarlaringiz</b>\n\n${lines.join("\n")}`, { parse_mode: "HTML" });
  });

  // the 1-tap dispatch — pickup resolved server-side, real taxi sent
  bot.callbackQuery("bk:now", async (ctx) => {
    const memberId = await getMemberId(String(ctx.from.id));
    if (!memberId) {
      await ctx.answerCallbackQuery();
      return;
    }
    await ctx.answerCallbackQuery();
    await ctx.editMessageText("⏳ Buyurtma yuborilyapti…").catch(() => undefined);
    const r = await callOneTapFor(memberId, {});
    if (r.state === "dispatched" || r.state === "test") {
      const note = r.state === "test" ? "\n\n<i>(Hozir test rejimi)</i>" : "\n\n🔍 Haydovchi qidirilyapti…";
      await ctx.editMessageText(`✅ <b>Buyurtma qabul qilindi!</b>\n📍 ${esc(r.pickupName ?? "")}${note}`, {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard().text("🔄 Holat", "bk:status"),
      });
    } else if (r.state === "active") {
      await ctx.editMessageText(`ℹ️ Sizda allaqachon faol buyurtma bor:\n📍 ${esc(r.booking?.addressName ?? "")}`, {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard().text("🔄 Holat", "bk:status"),
      });
    } else if (r.state === "throttled") {
      await ctx.editMessageText(`⏳ ${esc(r.message ?? "Bir daqiqa kuting")}`).catch(() => undefined);
    } else if (r.state === "need_pickup") {
      await ctx.editMessageText("📍 Manzil topilmadi — quyidan tanlang:").catch(() => undefined);
      await startBooking(ctx);
    } else if (r.state === "confirm_required") {
      await ctx.editMessageText(`⚠️ ${esc(r.message ?? "Manzilni tasdiqlab chaqiring")}`).catch(() => undefined);
      await startBooking(ctx, { forceFull: true });
    } else {
      await ctx.editMessageText(`⚠️ Yuborilmadi: ${esc(r.message ?? "xatolik")}`, { parse_mode: "HTML" }).catch(() => undefined);
    }
  });

  // "boshqa manzil" — drop into the full picker (GPS / saved / typed)
  bot.callbackQuery("bk:other", async (ctx) => {
    await ctx.answerCallbackQuery();
    const id = String(ctx.from.id);
    const s = sessions.get(id);
    await ctx.editMessageText("📍 Boshqa manzil tanlang:").catch(() => undefined);
    await ctx.reply("📍 Joylashuvingizni yuboring — eng tez yo'l. Yoki manzilni tanlang/yozing 👇", { reply_markup: pickupKeyboard() });
    if (s?.addresses.length) await ctx.reply("⭐ Tez tanlash:", { reply_markup: addressKb(s.addresses) });
  });

  bot.hears("✍️ Manzil yozish", async (ctx) => {
    const s = sessions.get(String(ctx.from!.id));
    if (!s) return;
    s.awaitingText = true;
    await ctx.reply("✍️ Manzilni yozing (masalan: <b>Bunyodkor 12</b>):", { parse_mode: "HTML" });
  });
  bot.hears("❌ Bekor", async (ctx) => {
    sessions.delete(String(ctx.from!.id));
    await ctx.reply("❌ Bekor qilindi.");
  });

  // Uber pattern #1: GPS pickup → nearest saved address → confirm.
  bot.on("message:location", async (ctx) => {
    const id = String(ctx.from!.id);
    const s = sessions.get(id);
    if (!s) return;
    const { latitude, longitude } = ctx.message.location;
    const near = nearestAddress(s.addresses, latitude, longitude);
    if (near) {
      s.pickup = near;
      await ctx.reply(`📍 Sizga eng yaqin: <b>${esc(near.name)}</b>`, { parse_mode: "HTML" });
      await showConfirm(ctx, s);
    } else {
      s.awaitingText = true;
      await ctx.reply("📍 Joylashuvingizga yaqin saqlangan manzil topilmadi.\n✍️ Manzilni yozib qidiring:");
    }
  });

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

  // 📞 en-route call: surface the driver's number as tap-to-call text
  // (tel: inline buttons are rejected by Telegram; plain numbers auto-linkify on mobile).
  bot.callbackQuery("bk:call", async (ctx) => {
    const me = await getMe(String(ctx.from.id));
    const b = me?.member.phone ? await getDataSource().getActiveBooking(me.member.phone).catch(() => null) : null;
    if (b?.driver?.phone) {
      await ctx.answerCallbackQuery();
      await ctx.reply(`📞 Haydovchi: ${b.driver.phone}\n<i>Raqamga bosib qo'ng'iroq qiling</i>`, { parse_mode: "HTML" });
    } else {
      await ctx.answerCallbackQuery({ text: "Haydovchi raqami hozir mavjud emas", show_alert: true });
    }
  });

  // ⏱ ETA-guess from the live ride card (one guess per ride, +50 if right)
  bot.callbackQuery("noop", (ctx) => ctx.answerCallbackQuery());
  bot.callbackQuery(/^guess:(lt6|6-9|10-14|15p)$/, async (ctx) => {
    const memberId = await getMemberId(String(ctx.from.id));
    if (!memberId) {
      await ctx.answerCallbackQuery();
      return;
    }
    const band = ctx.match[1] === "lt6" ? "<6" : ctx.match[1] === "15p" ? "15+" : ctx.match[1]!;
    const { getActiveBookingFor } = await import("../services/bookingService");
    const active = await getActiveBookingFor(memberId).catch(() => null);
    if (!active || active.status !== "started") {
      await ctx.answerCallbackQuery({ text: "Taxmin faqat safar paytida 🚕" });
      return;
    }
    const { prisma } = await import("../db");
    try {
      await prisma.rideGuess.create({ data: { memberId, bookingId: active.id, guessBand: band } });
      await ctx.answerCallbackQuery({ text: `⏱ Taxminingiz: ${band} daqiqa — yetib borganda bilamiz!` });
    } catch {
      await ctx.answerCallbackQuery({ text: "Bu safarga taxmin qilingansiz ✅" });
    }
  });

  // 🙏 tip the driver after a ride — rider's own coins move, closed-loop
  bot.callbackQuery(/^tip:(\d+):(\d+)$/, async (ctx) => {
    const riderId = await getMemberId(String(ctx.from.id));
    if (!riderId) {
      await ctx.answerCallbackQuery();
      return;
    }
    const driverId = Number(ctx.match[1]);
    const amount = Number(ctx.match[2]);
    const { transfer } = await import("../services/transferService");
    const r = await transfer(riderId, "", amount, { kind: "tip", toMemberId: driverId });
    if (r.ok) {
      await ctx.answerCallbackQuery({ text: `🙏 ${formatNumber(amount)} tanga yuborildi!` });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => undefined);
      await ctx.reply(`🙏 Rahmat! <b>${esc(r.toName ?? "Haydovchi")}</b>ga <b>${formatNumber(amount)} tanga</b> yuborildi 🚗`, { parse_mode: "HTML" }).catch(() => undefined);
      // tell the driver
      const { prisma } = await import("../db");
      const tg = await prisma.telegramUser.findUnique({ where: { memberId: driverId } });
      if (tg) {
        await ctx.api
          .sendMessage(tg.id, `🙏 Mijoz sizga <b>+${formatNumber(r.received)} tanga</b> rahmat yubordi! 🚗\n«🚗 Haydovchi paneli»da ko'ring.`, { parse_mode: "HTML" })
          .catch(() => undefined);
      }
    } else {
      const msgs: Record<string, string> = {
        insufficient: "Tanga yetarli emas",
        account_too_new: "Hisobingiz hali juda yangi (48 soat kutiladi)",
        daily_sent_cap: "Bugungi o'tkazma limiti tugadi",
        daily_received_cap: "Haydovchining bugungi limiti to'ldi",
        ring: "Bu amal hozircha bloklangan",
      };
      await ctx.answerCallbackQuery({ text: msgs[r.reason ?? ""] ?? "Yuborilmadi", show_alert: true });
    }
  });

  bot.callbackQuery("bk:cancelride", async (ctx) => {
    const memberId = await getMemberId(String(ctx.from.id));
    if (!memberId) {
      await ctx.answerCallbackQuery();
      return;
    }
    const r = await cancelBookingFor(memberId);
    await ctx.answerCallbackQuery({ text: r.ok ? "Bekor qilindi" : r.reason === "too_late" ? "Haydovchi keldi — bo'lmaydi" : "Bekor qilinmadi", show_alert: true });
    if (r.ok) await ctx.editMessageText("✖ Buyurtma bekor qilindi.").catch(() => undefined);
  });

  bot.callbackQuery("bk:last", async (ctx) => {
    await ctx.answerCallbackQuery();
    const id = String(ctx.from.id);
    const s = sessions.get(id);
    const memberId = await getMemberId(id);
    const last = memberId ? await getQuickPickup(memberId).catch(() => null) : null;
    if (!s || !last) return;
    s.pickup = { id: last.id, name: last.name, lat: last.lat, lng: last.lng };
    await showConfirm(ctx, s);
  });

  bot.callbackQuery(/^bk:addr:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const s = sessions.get(String(ctx.from.id));
    const addr = s?.addresses[Number(ctx.match[1])];
    if (!s || !addr) return;
    s.pickup = addr;
    await showConfirm(ctx, s);
  });

  bot.callbackQuery("bk:cancel", async (ctx) => {
    sessions.delete(String(ctx.from.id));
    await ctx.answerCallbackQuery("Bekor qilindi");
    await ctx.editMessageText("❌ Buyurtma bekor qilindi.").catch(() => undefined);
  });

  bot.callbackQuery("bk:confirm", async (ctx) => {
    await ctx.answerCallbackQuery();
    const id = String(ctx.from.id);
    const s = sessions.get(id);
    if (!s?.pickup) return;
    // persist the 1-tap memory (survives restarts; next time = one button)
    const memberId = await getMemberId(id);
    if (memberId) await rememberPickup(memberId, s.pickup, "bot").catch(() => undefined);
    const req = { clientName: s.clientName, addressName: s.pickup.name, addressId: s.pickup.id, phoneNumber: s.phone, additionalPayment: 0 };
    sessions.delete(id);

    if (!env.bookingLive) {
      await ctx.editMessageText(`✅ <b>Buyurtma ko'rsatildi</b>\n📍 ${esc(req.addressName)}\n\n<i>(Hozir test rejimi)</i>`, { parse_mode: "HTML" });
      return;
    }
    await ctx.editMessageText("⏳ Buyurtma yuborilyapti…");
    const res = await getDataSource().createBooking(req);
    if (res.ok) {
      await ctx.editMessageText(`✅ <b>Buyurtma qabul qilindi!</b>\n📍 ${esc(req.addressName)}\n\n🔍 Haydovchi qidirilyapti…`, {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard().text("🔄 Holat", "bk:status"),
      });
    } else {
      await ctx.editMessageText(`⚠️ Yuborilmadi: ${esc(res.message ?? "xatolik")}`, { parse_mode: "HTML" });
    }
  });

  // free-text address search — only while a booking is awaiting an address
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
