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
    await ctx.reply("Avval /driver_login orqali haydovchi hisobingizni ulang.");
    return;
  }
  if (!r.rides?.length) {
    await ctx.reply(`🚗 <b>Bugun safar yo'q</b>\n\n<code>${esc(r.carNumber ?? "")}</code>`, { parse_mode: "HTML" });
    return;
  }
  const lines = [`🚗 <b>Bugungi safarlar: ${r.count}</b>`, `💰 Jami: <b>${formatNumber(r.totalFare ?? 0)} so'm</b>`, ``];
  for (const ride of r.rides.slice(0, 15)) {
    const km = (ride.distance / 1000).toFixed(1);
    const emoji = RIDE_STATUS[ride.status] ?? "•";
    lines.push(`${emoji} ${esc(ride.addressName)} — <b>${formatNumber(ride.payment)}</b> · ${km}km · ${ride.time}daq`);
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
    await ctx.reply("Avval /driver_login orqali haydovchi hisobingizni ulang.");
    return;
  }
  const lines = [`💰 <b>Bugungi daromad</b>`, `🚗 <code>${esc(r.carNumber ?? "")}</code>`, ``];
  lines.push(`🟢 Ishlab topdingiz: <b>${formatNumber(r.earnedToday ?? 0)} so'm</b>`);
  if ((r.debtPaidToday ?? 0) > 0) lines.push(`💸 Qarz to'landi: <b>${formatNumber(r.debtPaidToday ?? 0)} so'm</b>`);
  if (r.latestBalance != null) lines.push(`👛 Balans: <b>${formatNumber(r.latestBalance)} so'm</b>`);
  if (r.latestDebt != null && r.latestDebt > 0) lines.push(`⚠️ Qarz: <b>${formatNumber(r.latestDebt)} so'm</b> — /qarz`);
  if (r.ledger?.length) {
    lines.push(``, `<b>So'nggi harakatlar:</b>`);
    for (const row of r.ledger.slice(0, 8)) {
      const sign = row.newBalance >= row.oldBalance ? "➕" : "➖";
      const delta = Math.abs(row.newBalance - row.oldBalance);
      const label = row.type === "debt" ? "Qarz" : row.addressName || row.type;
      lines.push(`${sign} ${esc(label)}: <b>${formatNumber(delta)}</b>`);
    }
  } else {
    lines.push(``, `<i>Bugun harakat yo'q.</i>`);
  }
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
