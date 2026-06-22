// 💸 /qarz — a logged-in driver sees their kas company debt and settles it with tanga, one tap.
// The pay button carries (amount + the card's message id as nonce) so a double-tap of the same
// card can't double-pay (driverDebtService keys on it). Gated behind the `qarz` flag; if off, the
// command quietly tells the driver it's unavailable.
import { Bot, Context, InlineKeyboard } from "grammy";
import { formatNumber } from "@t1067/shared";
import { getMe } from "../services/memberService";
import { getDriverDebtInfo, payDebtWithCoins } from "../services/driverDebtService";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Build the pay-options keyboard: full debt + up to two smaller presets, each capped at the tanga
// the driver actually has (never offer a button they can't afford).
function payKeyboard(debt: number, coins: number): InlineKeyboard | null {
  const payable = Math.min(debt, coins);
  if (payable < 1) return null;
  const kb = new InlineKeyboard();
  const presets = [payable]; // always offer "pay the max you can"
  for (const chunk of [10_000, 25_000, 50_000]) {
    if (chunk < payable) presets.push(chunk);
  }
  // de-dup + sort descending, max 4 buttons
  const uniq = [...new Set(presets)].sort((a, b) => b - a).slice(0, 4);
  for (const amt of uniq) {
    const label = amt === payable ? `💸 ${formatNumber(amt)} (to'liq)` : `${formatNumber(amt)}`;
    kb.text(label, `qarz:pay:${amt}`).row();
  }
  return kb;
}

async function showDebtCard(ctx: Context): Promise<void> {
  const me = await getMe(String(ctx.from!.id));
  if (!me) {
    await ctx.reply("Avval /start orqali raqamingizni ulang.");
    return;
  }
  const info = await getDriverDebtInfo(me.member.id);
  if (!info.ok) {
    const msg =
      info.reason === "feature_off"
        ? "💸 Qarz to'lash hozircha mavjud emas."
        : info.reason === "not_driver"
          ? "Bu bo'lim faqat 1067 haydovchilari uchun 🚗"
          : "Kas serverdan ma'lumot olinmadi. Birozdan keyin urinib ko'ring.";
    await ctx.reply(msg);
    return;
  }
  const debt = info.debt ?? 0;
  if (debt <= 0) {
    await ctx.reply(`✅ <b>Qarzingiz yo'q!</b>\n\nKas balansingiz: <b>${formatNumber(info.balance ?? 0)} so'm</b> 🎉`, { parse_mode: "HTML" });
    return;
  }
  const kb = payKeyboard(debt, info.coins ?? 0);
  const lines = [
    `💸 <b>Qarzingiz: ${formatNumber(debt)} so'm</b>`,
    `🚗 <code>${esc(info.carNumber ?? "")}</code>`,
    ``,
    `🪙 Tangangiz: <b>${formatNumber(info.coins ?? 0)}</b> (1 tanga = 1 so'm)`,
  ];
  if (!kb) {
    lines.push(``, `⚠️ Qarzni to'lash uchun tanga yetarli emas. Safar qilib tanga to'plang.`);
    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
    return;
  }
  lines.push(``, `Qancha to'laysiz?`);
  await ctx.reply(lines.join("\n"), { parse_mode: "HTML", reply_markup: kb });
}

export function registerDriverDebt(bot: Bot): void {
  bot.command("qarz", showDebtCard);
  bot.callbackQuery("drv:debt", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    await showDebtCard(ctx);
  });

  bot.callbackQuery(/^qarz:pay:(\d+)$/, async (ctx) => {
    const amount = Number(ctx.match[1]);
    const me = await getMe(String(ctx.from!.id));
    if (!me) {
      await ctx.answerCallbackQuery({ text: "Avval /start", show_alert: true }).catch(() => undefined);
      return;
    }
    // Nonce = the message id this button sits on → stable per debt-card → double-tap is a no-op.
    const nonce = ctx.callbackQuery.message?.message_id ?? `t${ctx.update.update_id}`;
    await ctx.answerCallbackQuery({ text: "⏳ To'lov amalga oshirilmoqda…" }).catch(() => undefined);
    const r = await payDebtWithCoins(me.member.id, amount, nonce);
    // Remove the pay buttons so the card can't be tapped again, then report.
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => undefined);
    await ctx.reply(r.message, { parse_mode: "HTML" }).catch(() => undefined);
    if (r.ok) {
      // refresh the figure so the driver sees the new debt
      await showDebtCard(ctx).catch(() => undefined);
    }
  });
}
