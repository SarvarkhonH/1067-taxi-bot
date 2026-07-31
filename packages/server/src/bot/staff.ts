// 👔 JAMOA J2 — the employee-facing "Ish" flow: /ish command + three inline
// buttons (Keldim / Ketdim / Hisobim). Visible ONLY to rows in Employee (gate =
// employeeFor: jamoa flag ON + active employee + active org). Zero bot-side
// session state — every tap is a fresh DB round-trip, restart-proof (shop.ts style).
import { Bot, InlineKeyboard } from "grammy";

function ishKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Keldim", "ish:in")
    .text("🏁 Ketdim", "ish:out")
    .row()
    .text("📊 Mening hisobim", "ish:acct");
}

export function registerStaff(bot: Bot): void {
  bot.command("ish", async (ctx) => {
    const tg = String(ctx.from?.id ?? "");
    if (!tg) return;
    const { employeeFor } = await import("../services/staffService");
    const emp = await employeeFor(tg);
    if (!emp) return; // not an employee (or flag off) — stay silent, no surface leak
    await ctx.reply(
      `👔 <b>${emp.name}</b> — ${emp.org.name}\nIsh boshida "Keldim", ketishda "Ketdim" bosing.`,
      { parse_mode: "HTML", reply_markup: ishKeyboard() }
    );
  });

  bot.callbackQuery("ish:in", async (ctx) => {
    const { staffCheckIn } = await import("../services/staffService");
    const r = await staffCheckIn(String(ctx.from.id));
    await ctx.answerCallbackQuery();
    await ctx.reply(r.text, { parse_mode: "HTML", reply_markup: r.ok ? ishKeyboard() : undefined });
  });

  bot.callbackQuery("ish:out", async (ctx) => {
    const { staffCheckOut } = await import("../services/staffService");
    const r = await staffCheckOut(String(ctx.from.id));
    await ctx.answerCallbackQuery();
    await ctx.reply(r.text, { parse_mode: "HTML", reply_markup: r.ok ? ishKeyboard() : undefined });
  });

  bot.callbackQuery("ish:acct", async (ctx) => {
    const { staffMyAccount } = await import("../services/staffService");
    const r = await staffMyAccount(String(ctx.from.id));
    await ctx.answerCallbackQuery();
    await ctx.reply(r.text, { parse_mode: "HTML", reply_markup: r.ok ? ishKeyboard() : undefined });
  });
}