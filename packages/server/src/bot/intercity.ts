// 🚐 Intercity bot flow — driver publishes/manages trips, rider searches/books seats.
// Gated DARK behind the `intercity` flag (every entry returns early when OFF). Real-money
// fares are shown in so'm and handled by intercityService; tanga is never the fare here.
import { Bot, Context, InlineKeyboard } from "grammy";
import { formatNumber } from "@t1067/shared";
import { prisma } from "../db";
import { getMe } from "../services/memberService";
import { featureOn } from "../services/featureFlags";
import {
  listCities,
  getOrCreateRoute,
  publishTrip,
  searchTrips,
  bookSeat,
  getDriverTrips,
  departTrip,
  arriveTrip,
  driverCancelTrip,
} from "../services/intercityService";

const TASHKENT_OFFSET = 5 * 3_600_000;

type PubSess = { flow: "pub"; step: "from" | "to" | "time" | "seats" | "fare"; fromId?: number; toId?: number; when?: Date; seats?: number; routeFare?: number };
type BookSess = { flow: "book"; step: "from" | "to" | "day"; fromId?: number; toId?: number };
type Sess = (PubSess | BookSess) & { awaitingCity?: "from" | "to" };
const sessions = new Map<string, Sess>();

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildTashkent(tomorrow: boolean, hh: number, mm: number): Date | null {
  if (hh > 23 || mm > 59) return null;
  const nowTk = new Date(Date.now() + TASHKENT_OFFSET);
  const wall = Date.UTC(nowTk.getUTCFullYear(), nowTk.getUTCMonth(), nowTk.getUTCDate() + (tomorrow ? 1 : 0), hh, mm, 0);
  return new Date(wall - TASHKENT_OFFSET);
}
function parseWhen(text: string): Date | null {
  const t = text.toLowerCase();
  const tomorrow = t.includes("ertaga");
  const m = t.match(/(\d{1,2})[:.\s](\d{2})/);
  if (m) return buildTashkent(tomorrow, parseInt(m[1] ?? "", 10), parseInt(m[2] ?? "", 10));
  const h = t.match(/\b(\d{1,2})\b/);
  return h ? buildTashkent(tomorrow, parseInt(h[1] ?? "", 10), 0) : null;
}
function fmtTk(d: Date): string {
  const tk = new Date(d.getTime() + TASHKENT_OFFSET);
  const hh = String(tk.getUTCHours()).padStart(2, "0");
  const mm = String(tk.getUTCMinutes()).padStart(2, "0");
  return `${tk.getUTCDate()}.${String(tk.getUTCMonth() + 1).padStart(2, "0")} ${hh}:${mm}`;
}

async function askCity(ctx: Context, prompt: string): Promise<void> {
  await ctx.reply(`${prompt}\n\n<i>Shahar nomini yozing (masalan: Koson, Toshkent).</i>`, { parse_mode: "HTML" });
}

/** show matching cities as inline buttons; returns true if it handled (asked to pick / re-ask). */
async function presentCityMatches(ctx: Context, query: string): Promise<boolean> {
  const matches = await listCities(query);
  if (matches.length === 0) {
    await ctx.reply("❌ Bunday shahar topilmadi. Qaytadan yozing:");
    return true;
  }
  const kb = new InlineKeyboard();
  for (const c of matches.slice(0, 8)) kb.text(`${c.name}${c.nameRu ? ` (${c.nameRu})` : ""}`, `iccity:${c.id}`).row();
  await ctx.reply("👇 Shaharni tanlang:", { reply_markup: kb });
  return true;
}

export function registerIntercity(bot: Bot): void {
  const startDriver = async (ctx: Context): Promise<void> => {
    if (!(await featureOn("intercity"))) return;
    const me = await getMe(String(ctx.from!.id));
    if (!me?.member) return;
    const kb = new InlineKeyboard()
      .text("➕ Yangi reys", "ic:newtrip").row()
      .text("🚐 Mening reyslarim", "ic:mytrips").row()
      .text("🔎 Reys qidirish", "ic:search");
    await ctx.reply(
      "🚐 <b>Shaharlararo</b>\n\nViloyatlararo reys e'lon qiling yoki o'rindiq qidiring.",
      { parse_mode: "HTML", reply_markup: kb },
    );
  };
  bot.command("reys", startDriver);
  bot.hears("🚐 Shaharlararo", startDriver);

  // ── entry buttons ──────────────────────────────────────────────────────────
  bot.callbackQuery("ic:newtrip", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    if (!(await featureOn("intercity"))) return;
    sessions.set(String(ctx.from.id), { flow: "pub", step: "from", awaitingCity: "from" });
    await askCity(ctx, "📍 <b>Qaysi shahardan</b> jo'naysiz?");
  });
  bot.callbackQuery("ic:search", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    if (!(await featureOn("intercity"))) return;
    sessions.set(String(ctx.from.id), { flow: "book", step: "from", awaitingCity: "from" });
    await askCity(ctx, "📍 <b>Qayerdan</b> ketasiz?");
  });
  bot.callbackQuery("ic:mytrips", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    if (!(await featureOn("intercity"))) return;
    const me = await getMe(String(ctx.from.id));
    if (!me?.member) return;
    const trips = (await getDriverTrips(me.member.id)) as Array<{ id: number; originCity: { name: string }; destCity: { name: string }; scheduledAt: Date; bookedSeats: number; carCapacity: number; status: string }>;
    if (trips.length === 0) {
      await ctx.reply("Sizda faol reys yo'q. ➕ Yangi reys e'lon qiling.");
      return;
    }
    for (const t of trips) {
      const kb = new InlineKeyboard();
      if (t.status === "OPEN" || t.status === "BOARDING") kb.text("🚀 Jo'nadim", `ictrip:depart:${t.id}`).text("❌ Bekor", `ictrip:cancel:${t.id}`);
      else if (t.status === "DEPARTED") kb.text("✅ Yetib keldim", `ictrip:arrive:${t.id}`);
      await ctx.reply(
        `🚐 <b>${esc(t.originCity.name)} → ${esc(t.destCity.name)}</b>\n🕐 ${fmtTk(t.scheduledAt)} · 💺 ${t.bookedSeats}/${t.carCapacity} · ${t.status}`,
        { parse_mode: "HTML", reply_markup: kb },
      );
    }
  });

  // ── city pick (shared by both flows) ────────────────────────────────────────
  bot.callbackQuery(/^iccity:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    if (!(await featureOn("intercity"))) return;
    const tg = String(ctx.from.id);
    const s = sessions.get(tg);
    if (!s || !s.awaitingCity) return;
    const cityId = Number((ctx.match as RegExpMatchArray)[1]);
    const field = s.awaitingCity;
    if (field === "from") s.fromId = cityId;
    else s.toId = cityId;
    s.awaitingCity = undefined;

    if (s.flow === "pub") {
      if (field === "from") { s.step = "to"; s.awaitingCity = "to"; sessions.set(tg, s); await askCity(ctx, "🎯 <b>Qaysi shaharga</b> borasiz?"); return; }
      // both set → ask time
      s.step = "time"; sessions.set(tg, s);
      await ctx.reply("🕐 <b>Qachon jo'naysiz?</b>\n<i>masalan: 14:00 yoki «ertaga 08:00»</i>", { parse_mode: "HTML" });
      return;
    }
    // book flow
    if (field === "from") { s.step = "to"; s.awaitingCity = "to"; sessions.set(tg, s); await askCity(ctx, "🎯 <b>Qayerga</b> borasiz?"); return; }
    s.step = "day"; sessions.set(tg, s);
    const kb = new InlineKeyboard().text("Bugun", "icday:0").text("Ertaga", "icday:1");
    await ctx.reply("📅 <b>Qaysi kun?</b>", { parse_mode: "HTML", reply_markup: kb });
  });

  // ── rider day pick → show open trips ────────────────────────────────────────
  bot.callbackQuery(/^icday:(0|1)$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    if (!(await featureOn("intercity"))) return;
    const tg = String(ctx.from.id);
    const s = sessions.get(tg);
    if (!s || s.flow !== "book" || !s.fromId || !s.toId) return;
    const day = new Date(Date.now() + TASHKENT_OFFSET);
    if ((ctx.match as RegExpMatchArray)[1] === "1") day.setUTCDate(day.getUTCDate() + 1);
    sessions.delete(tg);
    const trips = (await searchTrips(s.fromId, s.toId, new Date(day.getTime() - TASHKENT_OFFSET))) as Array<{ id: number; scheduledAt: Date; fareSom: number; bookedSeats: number; carCapacity: number; originCity: { name: string }; destCity: { name: string }; driver: { fullName: string | null; displayName: string | null; carNumber: string | null } }>;
    if (trips.length === 0) {
      await ctx.reply("😔 Bu yo'nalishda ochiq reys topilmadi. Keyinroq urinib ko'ring.");
      return;
    }
    for (const t of trips) {
      const free = t.carCapacity - t.bookedSeats;
      const name = t.driver.displayName || t.driver.fullName || "Haydovchi";
      const kb = new InlineKeyboard().text(`💺 Band qilish (${formatNumber(t.fareSom)} so'm)`, `icbk:${t.id}`);
      await ctx.reply(
        `🚐 <b>${esc(t.originCity.name)} → ${esc(t.destCity.name)}</b>\n🕐 ${fmtTk(t.scheduledAt)} · 💺 ${free} o'rin bor\n👤 ${esc(name)}${t.driver.carNumber ? ` · 🚗 ${esc(t.driver.carNumber)}` : ""}\n💵 <b>${formatNumber(t.fareSom)} so'm</b> (naqd)`,
        { parse_mode: "HTML", reply_markup: kb },
      );
    }
  });

  // ── rider books (cash) ──────────────────────────────────────────────────────
  bot.callbackQuery(/^icbk:(\d+)$/, async (ctx) => {
    if (!(await featureOn("intercity"))) { await ctx.answerCallbackQuery().catch(() => undefined); return; }
    const me = await getMe(String(ctx.from.id));
    if (!me?.member) { await ctx.answerCallbackQuery({ text: "Avval ro'yxatdan o'ting", show_alert: true }); return; }
    const tripId = Number((ctx.match as RegExpMatchArray)[1]);
    const res = await bookSeat(me.member.id, { tripId, seatCount: 1, paymentMethod: "CASH" });
    if (!res.ok) {
      const msg = res.error === "no_seats" ? "O'rin qolmadi 😔" : res.error === "trip_closed" ? "Reys yopilgan" : res.error === "own_trip" ? "Bu sizning reysingiz" : "Band qilib bo'lmadi";
      await ctx.answerCallbackQuery({ text: msg, show_alert: true });
      return;
    }
    await ctx.answerCallbackQuery({ text: res.duplicate ? "Allaqachon band qilgansiz" : "✅ Band qilindi!" });
    await ctx.editMessageText("✅ <b>O'rin band qilindi!</b>\nHaydovchi mashina to'lganda xabar beradi. To'lov — mashinada, naqd. 🚗", { parse_mode: "HTML" }).catch(() => undefined);
    // notify the driver
    const trip = await prisma.intercityTrip.findUnique({ where: { id: tripId }, select: { driverId: true, bookedSeats: true, carCapacity: true } });
    if (trip) {
      const dtg = await prisma.telegramUser.findFirst({ where: { memberId: trip.driverId }, select: { id: true } });
      if (dtg) await bot.api.sendMessage(dtg.id, `🔔 <b>Yangi yo'lovchi!</b>\n💺 ${trip.bookedSeats}/${trip.carCapacity} o'rin band.`, { parse_mode: "HTML" }).catch(() => undefined);
    }
  });

  // ── driver manage: depart / arrive / cancel ─────────────────────────────────
  bot.callbackQuery(/^ictrip:(depart|arrive|cancel):(\d+)$/, async (ctx) => {
    if (!(await featureOn("intercity"))) { await ctx.answerCallbackQuery().catch(() => undefined); return; }
    const me = await getMe(String(ctx.from.id));
    if (!me?.member) { await ctx.answerCallbackQuery().catch(() => undefined); return; }
    const m = ctx.match as RegExpMatchArray;
    const action = m[1];
    const tripId = Number(m[2]);
    let riderTgs: string[] = [];
    let label = "";
    if (action === "depart") { const r = await departTrip(me.member.id, tripId); if (!r.ok) { await ctx.answerCallbackQuery({ text: "Bo'lmadi", show_alert: true }); return; } riderTgs = r.riderTgs ?? []; label = "🚀 Yo'lga chiqdingiz"; }
    else if (action === "arrive") { const r = await arriveTrip(me.member.id, tripId); if (!r.ok) { await ctx.answerCallbackQuery({ text: "Bo'lmadi", show_alert: true }); return; } riderTgs = r.riderTgs ?? []; label = "✅ Yetib keldingiz"; }
    else { const r = await driverCancelTrip(me.member.id, tripId); if (!r.ok) { await ctx.answerCallbackQuery({ text: "Bo'lmadi", show_alert: true }); return; } riderTgs = r.riderTgs ?? []; label = "❌ Reys bekor qilindi"; }
    await ctx.answerCallbackQuery({ text: label });
    await ctx.editMessageText(`${label} (#${tripId})`).catch(() => undefined);
    const riderMsg = action === "depart" ? "🚗 <b>Haydovchi yo'lga chiqdi!</b> Omon yo'l 🤲" : action === "arrive" ? "✅ <b>Yetib keldingiz!</b> Rahmat 🚕" : "❌ <b>Reys bekor qilindi.</b> Uzr so'raymiz.";
    for (const tg of riderTgs) await bot.api.sendMessage(tg, riderMsg, { parse_mode: "HTML" }).catch(() => undefined);
  });

  // ── session text capture (city names, time, seats, fare) ────────────────────
  bot.on("message:text", async (ctx, next) => {
    const tg = String(ctx.from.id);
    const s = sessions.get(tg);
    if (!s) return next();
    if (!(await featureOn("intercity"))) { sessions.delete(tg); return; }
    const text = ctx.message.text.trim();

    if (s.awaitingCity) { await presentCityMatches(ctx, text); return; }

    if (s.flow === "pub") {
      if (s.step === "time") {
        const when = parseWhen(text);
        if (!when) { await ctx.reply("❌ Vaqtni tushunmadim. Masalan: 14:00 yoki «ertaga 08:00»"); return; }
        s.when = when; s.step = "seats"; sessions.set(tg, s);
        await ctx.reply("💺 <b>Necha o'rin</b> sotasiz? (1–8)", { parse_mode: "HTML" });
        return;
      }
      if (s.step === "seats") {
        const n = parseInt(text.replace(/\D/g, ""), 10);
        if (!n || n < 1 || n > 8) { await ctx.reply("❌ 1 dan 8 gacha raqam yozing."); return; }
        s.seats = n;
        const route = s.fromId && s.toId ? await getOrCreateRoute(s.fromId, s.toId) : null;
        s.routeFare = route?.defaultFareSom ?? 0; s.step = "fare"; sessions.set(tg, s);
        await ctx.reply(`💵 <b>Narx</b> (1 o'rin, so'm)?${s.routeFare ? `\n<i>Tavsiya: ${formatNumber(s.routeFare)}. «ha» deb yozsangiz shu narx.</i>` : ""}`, { parse_mode: "HTML" });
        return;
      }
      if (s.step === "fare") {
        let fare = s.routeFare ?? 0;
        if (!/^ha$/i.test(text)) { const f = parseInt(text.replace(/\D/g, ""), 10); if (!f || f < 1000) { await ctx.reply("❌ Narxni so'mda yozing (masalan 120000), yoki «ha»."); return; } fare = f; }
        sessions.delete(tg);
        const me = await getMe(tg);
        if (!me?.member || !s.fromId || !s.toId || !s.when || !s.seats) { await ctx.reply("❌ Xatolik. Qaytadan: /reys"); return; }
        const res = await publishTrip(me.member.id, { originCityId: s.fromId, destCityId: s.toId, scheduledAt: s.when, carCapacity: s.seats, fareSom: fare });
        if (!res.ok) { await ctx.reply(res.error === "debt_cap" ? "❌ Qarzingiz limitdan oshgan — avval to'lang." : "❌ Reys e'lon qilinmadi."); return; }
        await ctx.reply(`✅ <b>Reys e'lon qilindi!</b>\n🕐 ${fmtTk(s.when)} · 💺 ${s.seats} o'rin · 💵 ${formatNumber(fare)} so'm\nYo'lovchilar band qilganda xabar beramiz. 🚐`, { parse_mode: "HTML" });
        return;
      }
    }
    return next();
  });
}
