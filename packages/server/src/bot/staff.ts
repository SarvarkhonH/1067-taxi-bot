// 👔 JAMOA J2 — the employee-facing "Ish" flow: /ish command + three inline
// buttons (Keldim / Ketdim / Hisobim). Visible ONLY to rows in Employee (gate =
// employeeFor: jamoa flag ON + active employee + active org). Zero bot-side
// session state — every tap is a fresh DB round-trip, restart-proof (shop.ts style).
// NOTE: registered SYNCHRONOUSLY in bot.ts — /ish is a command and must land
// before the AI text catch-all (lazy .then() registration = dead command).
import { Bot, Context, InlineKeyboard } from "grammy";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function ishKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Keldim", "ish:in")
    .text("🏁 Ketdim", "ish:out")
    .row()
    .text("📊 Mening hisobim", "ish:acct");
}

// Answer the spinner FIRST (before DB work), reply after; a service throw must
// not leave the button hanging for 30s.
function onTap(action: (tgId: string) => Promise<{ ok: boolean; text: string }>): (ctx: Context) => Promise<void> {
  return async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    const r = await action(String(ctx.from?.id ?? ""));
    await ctx.reply(r.text, { parse_mode: "HTML", reply_markup: r.ok ? ishKeyboard() : undefined }).catch(() => undefined);
  };
}

export function registerStaff(bot: Bot): void {
  bot.command("ish", async (ctx) => {
    const tg = String(ctx.from?.id ?? "");
    if (!tg) return;
    const { employeeFor } = await import("../services/staffService");
    const emp = await employeeFor(tg);
    if (!emp) return; // not an employee (or flag off) — stay silent, no surface leak
    await ctx.reply(
      `👔 <b>${esc(emp.name)}</b> — ${esc(emp.org.name)}\nIsh boshida "Keldim", ketishda "Ketdim" bosing.`,
      { parse_mode: "HTML", reply_markup: ishKeyboard() }
    );
  });

  bot.callbackQuery("ish:in", onTap(async (tg) => (await import("../services/staffService")).staffCheckIn(tg)));
  bot.callbackQuery("ish:out", onTap(async (tg) => (await import("../services/staffService")).staffCheckOut(tg)));
  bot.callbackQuery("ish:acct", onTap(async (tg) => (await import("../services/staffService")).staffMyAccount(tg)));

  // 🌙 J4 — kechki xulosa kartasidagi "✅ Tasdiqlash" (faqat o'sha korxona egasiga o'tadi).
  // Tasdiqlangach tugma olib tashlanadi — kartaning o'zi hujjat bo'lib qoladi.
  bot.callbackQuery(/^ishc:(\d+):(\d{4}-\d{2}-\d{2})$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    const { staffConfirmDay } = await import("../services/staffService");
    const r = await staffConfirmDay(Number(ctx.match[1]), String(ctx.match[2]), String(ctx.from.id));
    if (r.ok) await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => undefined);
    await ctx.reply(r.text, { parse_mode: "HTML" }).catch(() => undefined);
  });
}