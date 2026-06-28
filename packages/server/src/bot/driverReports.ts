// 📊 /safarlarim + /daromad + /daraja — driver stats and tier progress.
import { Bot, Context } from "grammy";
import { formatNumber, DRIVER_TIER_REBATE } from "@t1067/shared";
import { getMe } from "../services/memberService";
import { getDriverRidesToday, getDriverEarningsToday } from "../services/driverReportService";
import { prisma } from "../db";
import { recentReports } from "../services/analyticsService";

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

// Tier thresholds — same defaults as analyticsService; dynamic thresholds are stored in AppState.
const DEFAULT_T = { kumush: 2, oltin: 3, olmos: 5 };
async function getTierThresholds(): Promise<{ kumush: number; oltin: number; olmos: number }> {
  try {
    const row = await prisma.appState.findUnique({ where: { key: "driver_tier_thresholds" } });
    if (row) return JSON.parse(row.value) as typeof DEFAULT_T;
  } catch { /* ignore */ }
  return DEFAULT_T;
}

function progressBar(current: number, max: number, len = 10): string {
  const filled = Math.min(len, Math.round((current / max) * len));
  return "█".repeat(filled) + "░".repeat(len - filled);
}

const TIER_EMOJI: Record<string, string> = { Bronza: "🥉", Kumush: "🥈", Oltin: "🥇", Olmos: "💎" };
const TIER_ORDER = ["Bronza", "Kumush", "Oltin", "Olmos"] as const;

async function showTier(ctx: Context): Promise<void> {
  const me = await getMe(String(ctx.from!.id));
  if (!me) { await ctx.reply("Avval /start orqali raqamingizni ulang."); return; }
  const m = await prisma.member.findUnique({ where: { id: me.member.id }, select: { id: true, type: true, carNumber: true, driverTier: true } });
  if (!m || m.type !== "driver") {
    await ctx.reply("Bu bo'lim faqat 1067 haydovchilari uchun 🚗");
    return;
  }
  const t = await getTierThresholds();
  // count this week's rides from kas reports
  const WEEK_MS = 7 * 86_400_000;
  const since = Date.now() - WEEK_MS;
  const rows = await recentReports().catch(() => []);
  const DONE = new Set(["delivered", "completed", "finished"]);
  const weekRides = rows.filter((r) => r.carNumber === m.carNumber && DONE.has(r.status) && Date.parse(r.at) >= since).length;

  const tier = m.driverTier ?? "Bronza";
  const tierIdx = TIER_ORDER.indexOf(tier as (typeof TIER_ORDER)[number]);
  const nextTier = TIER_ORDER[tierIdx + 1];
  const nextThreshold = nextTier === "Kumush" ? t.kumush : nextTier === "Oltin" ? t.oltin : nextTier === "Olmos" ? t.olmos : null;
  const rebate = DRIVER_TIER_REBATE[tier as keyof typeof DRIVER_TIER_REBATE] ?? 0;

  const lines: string[] = [
    `${TIER_EMOJI[tier] ?? "🏅"} <b>Sizning darajangiz: ${tier}</b>`,
    ``,
    `🚗 Bu hafta: <b>${weekRides} ta safar</b>`,
  ];

  if (nextTier && nextThreshold !== null) {
    const remaining = Math.max(0, nextThreshold - weekRides);
    const bar = progressBar(weekRides, nextThreshold);
    lines.push(`📊 <code>${bar}</code> ${weekRides}/${nextThreshold}`);
    lines.push(remaining > 0
      ? `➡️ <b>${nextTier}</b> darajasi uchun yana <b>${remaining} ta safar</b>`
      : `✅ <b>${nextTier}</b> darajasiga o'tishga tayyorsiz!`);
  } else {
    lines.push(`🏆 Eng yuqori daraja — davom eting!`);
  }

  lines.push(``);
  lines.push(`💰 Har safar uchun bonus: <b>${rebate > 0 ? `+${formatNumber(rebate)} 🪙` : "Kumush darajasidan boshlanadi"}</b>`);
  lines.push(``);
  lines.push(`<b>Daraja chegaralari:</b>`);
  lines.push(`🥉 Bronza: 0–${t.kumush - 1} safar · 0 🪙/safar`);
  lines.push(`🥈 Kumush: ${t.kumush}+ safar · +${DRIVER_TIER_REBATE.Kumush} 🪙/safar`);
  lines.push(`🥇 Oltin: ${t.oltin}+ safar · +${DRIVER_TIER_REBATE.Oltin} 🪙/safar`);
  lines.push(`💎 Olmos: ${t.olmos}+ safar · +${DRIVER_TIER_REBATE.Olmos} 🪙/safar`);
  lines.push(``);
  lines.push(`<i>Daraja har dushanba yangilanadi</i>`);

  await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
}

export function registerDriverReports(bot: Bot): void {
  bot.command("safarlarim", showRides);
  bot.command("daromad", showEarnings);
  bot.command("daraja", showTier);
  bot.callbackQuery("drv:hist", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    await showRides(ctx);
  });
  bot.callbackQuery("drv:earn", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    await showEarnings(ctx);
  });
  bot.callbackQuery("drv:tier", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    await showTier(ctx);
  });
}
