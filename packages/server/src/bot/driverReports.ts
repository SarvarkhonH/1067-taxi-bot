// 📊 /safarlarim + /daromad — a logged-in driver sees today's rides and earnings, pulled from kas
// with their own creds (Bosqich 4). Read-only; if not logged in, points to /driver_login.
import { Bot, Context } from "grammy";
import { formatNumber } from "@t1067/shared";
import { getMe } from "../services/memberService";
import { getDriverRidesToday, getDriverEarningsToday } from "../services/driverReportService";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const RIDE_STATUS: Record<string, string> = { delivered: "✅", cancel: "✖️", cancelled: "✖️" };

async function showRides(ctx: Context): Promise<void> {
  const me = await getMe(String(ctx.from!.id));
  if (!me) {
    await ctx.reply("Avval /start orqali raqamingizni ulang.");
    return;
  }
  const r = await getDriverRidesToday(me.member.id);
  if (!r.ok) {
    await ctx.reply("Bu bo'lim faqat 1067 haydovchilari uchun 🚗");
    return;
  }
  if (!r.rides?.length) {
    await ctx.reply(`🚗 <b>Bugun safar yo'q</b>\n\n<code>${esc(r.carNumber ?? "")}</code>`, { parse_mode: "HTML" });
    return;
  }
  const lines = [`🚗 <b>Bugungi safarlar: ${r.count}</b>`, `💰 Jami: <b>${formatNumber(r.totalFare ?? 0)} so'm</b>`, ``];
  for (const ride of r.rides.slice(0, 15)) {
    const km = ride.distance ? (ride.distance / 1000).toFixed(1) + "km · " : "";
    const mins = ride.time ? `${ride.time}daq` : "";
    const emoji = RIDE_STATUS[ride.status] ?? "•";
    lines.push(`${emoji} ${esc(ride.addressName)} — <b>${formatNumber(ride.payment)}</b> · ${km}${mins}`);
  }
  if (r.rides.length > 15) lines.push(`<i>…va yana ${r.rides.length - 15} ta</i>`);
  await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
}

async function showEarnings(ctx: Context): Promise<void> {
  const me = await getMe(String(ctx.from!.id));
  if (!me) {
    await ctx.reply("Avval /start orqali raqamingizni ulang.");
    return;
  }
  const r = await getDriverEarningsToday(me.member.id);
  if (!r.ok) {
    await ctx.reply("Bu bo'lim faqat 1067 haydovchilari uchun 🚗");
    return;
  }
  const lines = [`💰 <b>Bugungi daromad</b>`, `🚗 <code>${esc(r.carNumber ?? "")}</code>`, ``];
  lines.push(`🟢 Bugun ishlab topdingiz: <b>${formatNumber(r.earnedToday ?? 0)} so'm</b>`);
  if ((r.debtPaidToday ?? 0) > 0) lines.push(`💸 Bugun qarz to'ladingiz: <b>${formatNumber(r.debtPaidToday ?? 0)} so'm</b>`);
  if (r.balance != null) lines.push(`👛 Kas balans: <b>${formatNumber(r.balance)} so'm</b>`);
  if (r.debt != null && r.debt > 0) lines.push(`⚠️ Qarz: <b>${formatNumber(r.debt)} so'm</b> — /qarz`);
  await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
}

export function registerDriverReports(bot: Bot): void {
  bot.command("safarlarim", showRides);
  bot.command("daromad", showEarnings);
  bot.callbackQuery("drv:hist", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    await showRides(ctx);
  });
  bot.callbackQuery("drv:earn", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    await showEarnings(ctx);
  });
}
