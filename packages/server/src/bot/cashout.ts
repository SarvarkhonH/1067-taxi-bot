// 💵 Real cash-out flow (tanga → plastik card / cash-to-home). The bot only RECORDS a request and
// forwards it to the OWNER's Telegram with [✅ To'landi] [❌ Rad]; the owner pays manually. Card
// numbers are never persisted (only a •••• 1234 mask) and the card-bearing message is deleted.
// Tangas are spent only on owner approval (idempotent). Gated DARK behind the `cashout` flag.
import { Bot, Context, InlineKeyboard } from "grammy";
import { formatNumber } from "@t1067/shared";
import { prisma } from "../db";
import { getMe } from "../services/memberService";
import { featureOn } from "../services/featureFlags";
import {
  createCashout,
  getCashout,
  approveCashout,
  rejectCashout,
  cashoutBalance,
  CASHOUT_CARD_MIN,
  CASHOUT_HOME_MIN,
  type CashoutMethod,
  type CashoutOwnerNotice,
} from "../services/cashoutService";

const OWNER_TG = "6506297119";
// awaiting the rider's input. card flow is 2-step: card number → cardholder name (so the payout can't
// land on the wrong person). cardDigits is held between the two steps.
const sessions = new Map<string, { method: CashoutMethod; cardDigits?: string }>();

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
async function tgOf(memberId: number): Promise<string | null> {
  const tu = await prisma.telegramUser.findFirst({ where: { memberId }, select: { id: true } });
  return tu?.id ?? null;
}

/**
 * Forward a cash-out request to the OWNER's Telegram with the [✅ To'landi] [❌ Rad] buttons.
 * Single source for BOTH entry points — the bot's own /naxt flow AND the Mini App API call it, so
 * the owner sees identical messages and the approve/reject callbacks work the same. Card number /
 * address live ONLY in this message (never persisted). Exported so the API can trigger it via a
 * bot-bound closure passed into createApiServer.
 */
export async function notifyOwnerCashout(bot: Bot, n: CashoutOwnerNotice): Promise<void> {
  const detail =
    n.method === "card"
      ? `💳 Karta: <b>${esc(n.cardFull ?? "")}</b>\n👤 Karta egasi: <b>${esc(n.cardHolder ?? "")}</b>`
      : `🏠 Manzil: <b>${esc(n.address ?? "")}</b>`;
  const kb = new InlineKeyboard().text("✅ To'landi", `cashout:ok:${n.id}`).text("❌ Rad", `cashout:no:${n.id}`);
  await bot.api
    .sendMessage(
      OWNER_TG,
      `💸 <b>NAXT PUL SO'ROVI</b> #${n.id}\n\n👤 <b>${esc(n.name)}</b>\n💰 <b>${formatNumber(n.amount)}</b> tanga (≈${formatNumber(n.amount)} so'm)\n${detail}\n📞 ${esc(n.contact)}\n🚖 Safar: ${n.trips}`,
      { parse_mode: "HTML", reply_markup: kb },
    )
    .catch(() => undefined);
}

export function registerCashout(bot: Bot): void {
  const start = async (ctx: Context): Promise<void> => {
    if (!(await featureOn("cashout"))) return;
    const me = await getMe(String(ctx.from!.id));
    if (!me?.member) return;
    const bal = await cashoutBalance(me.member.id);
    if (bal < CASHOUT_CARD_MIN) {
      await ctx.reply(
        `💵 <b>Naxt pul olish</b>\n\nBalansingiz: <b>${formatNumber(bal)} tanga</b>\nNaxt pul olish uchun kamida <b>${formatNumber(CASHOUT_CARD_MIN)} tanga</b> kerak.`,
        { parse_mode: "HTML" },
      );
      return;
    }
    const kb = new InlineKeyboard().text(`💳 Plastik kartaga (${formatNumber(bal)})`, "cashout:card");
    if (bal >= CASHOUT_HOME_MIN) kb.row().text(`🏠 Naxt uyga (${formatNumber(bal)})`, "cashout:home");
    await ctx.reply(
      `💵 <b>Naxt pul olish</b>\n\nBalansingiz: <b>${formatNumber(bal)} tanga</b> (≈${formatNumber(bal)} so'm)\n\nQanday olasiz? 👇`,
      { parse_mode: "HTML", reply_markup: kb },
    );
  };
  bot.command("naxt", start);
  bot.hears("💵 Naxt pul", start);
  bot.hears("💵 Naxt pul olish", start);

  bot.callbackQuery("cashout:card", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    if (!(await featureOn("cashout"))) return;
    sessions.set(String(ctx.from.id), { method: "card" });
    await ctx.reply(
      "💳 <b>Karta raqamingizni yuboring</b> (16 raqam):\n\n🔒 <i>Karta raqami saqlanmaydi — faqat to'lov uchun administratorga boradi.</i>",
      { parse_mode: "HTML" },
    );
  });
  bot.callbackQuery("cashout:home", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    if (!(await featureOn("cashout"))) return;
    sessions.set(String(ctx.from.id), { method: "home" });
    await ctx.reply("🏠 <b>Manzilingizni yozing</b> (ko'cha, uy — pulni qayerga yetkazamiz):", { parse_mode: "HTML" });
  });

  // capture the card / name / address — session-gated; everyone else passes through via next()
  bot.on("message:text", async (ctx, next) => {
    const tg = String(ctx.from.id);
    const s = sessions.get(tg);
    if (!s) return next();
    if (!(await featureOn("cashout"))) {
      sessions.delete(tg);
      return;
    }
    const text = ctx.message.text.trim();

    // STEP A (card only): capture the card number → then ask for the cardholder's name
    if (s.method === "card" && !s.cardDigits) {
      const digits = text.replace(/\D/g, "");
      if (digits.length < 16 || digits.length > 19) {
        sessions.delete(tg);
        await ctx.reply("❌ Karta raqami noto'g'ri (16 raqam bo'lishi kerak). Qaytadan: /naxt");
        return;
      }
      s.cardDigits = digits;
      sessions.set(tg, s);
      await ctx.deleteMessage().catch(() => undefined); // privacy — drop the message carrying the full card
      await ctx.reply("👤 <b>Karta egasining ism-familiyasini</b> yozing:\n<i>(pul boshqa odamga ketmasligi uchun)</i>", { parse_mode: "HTML" });
      return;
    }

    // FINAL STEP: everything captured → create the request
    sessions.delete(tg);
    const me = await getMe(tg);
    if (!me?.member) return;
    const bal = await cashoutBalance(me.member.id);
    if (bal < CASHOUT_CARD_MIN) {
      await ctx.reply("❌ Balansingiz yetarli emas.");
      return;
    }
    const phone = me.member.phone ?? "—";
    const name = me.member.fullName ?? "Mijoz";

    let mask: string;
    let cardFull: string | undefined;
    let cardHolder: string | undefined;
    let address: string | undefined;
    if (s.method === "card") {
      const holder = text.slice(0, 60);
      mask = `•••• ${s.cardDigits!.slice(-4)} · ${holder}`;
      cardFull = s.cardDigits;
      cardHolder = holder;
    } else {
      if (text.length < 5) {
        await ctx.reply("❌ Manzil juda qisqa. Qaytadan: /naxt");
        return;
      }
      mask = text.slice(0, 120);
      address = text;
    }

    const { id } = await createCashout(me.member.id, bal, s.method, mask, phone);
    await notifyOwnerCashout(bot, { id, name, amount: bal, method: s.method, contact: phone, trips: me.stats.trips, cardFull, cardHolder, address });
    await ctx.reply(
      `✅ <b>So'rovingiz yuborildi!</b>\n\n💰 ${formatNumber(bal)} tanga · ${s.method === "card" ? "💳 plastik kartaga" : "🏠 naxt uyga"}\nTez orada bog'lanamiz va pulingizni o'tkazamiz 💸`,
      { parse_mode: "HTML" },
    );
  });

  // owner decision — OWNER only
  bot.callbackQuery(/^cashout:(ok|no):(\d+)$/, async (ctx) => {
    if (String(ctx.from.id) !== OWNER_TG) {
      await ctx.answerCallbackQuery({ text: "Faqat admin", show_alert: true });
      return;
    }
    const m = ctx.match as RegExpMatchArray;
    const action = m[1];
    const id = Number(m[2]);
    const r = await getCashout(id);
    if (!r) {
      await ctx.answerCallbackQuery({ text: "Topilmadi", show_alert: true });
      return;
    }
    if (action === "ok") {
      const res = await approveCashout(id);
      if (!res.ok) {
        await ctx.answerCallbackQuery({
          text: res.reason === "insufficient" ? "Balans yetarli emas (mijoz sarflagan)" : `Holat: ${res.reason}`,
          show_alert: true,
        });
        return;
      }
      await ctx.answerCallbackQuery({ text: "✅ To'landi" });
      await ctx
        .editMessageText(`✅ <b>TO'LANDI</b> #${id}\n👤 ${esc(r.member.fullName ?? "")} · 💰 ${formatNumber(r.amount)} tanga`, { parse_mode: "HTML" })
        .catch(() => undefined);
      const tu = await tgOf(r.memberId);
      if (tu)
        await bot.api
          .sendMessage(tu, `✅ <b>Pulingiz o'tkazildi!</b>\n💰 ${formatNumber(r.amount)} tanga (≈${formatNumber(r.amount)} so'm)\nRahmat — yana xizmatingizdamiz 🚕`, { parse_mode: "HTML" })
          .catch(() => undefined);
    } else {
      const res = await rejectCashout(id);
      await ctx.answerCallbackQuery({ text: "❌ Rad etildi" });
      await ctx.editMessageText(`❌ <b>RAD ETILDI</b> #${id}`, { parse_mode: "HTML" }).catch(() => undefined);
      if (res.ok) {
        const tu = await tgOf(r.memberId);
        if (tu)
          await bot.api.sendMessage(tu, "❌ Naxt pul so'rovingiz rad etildi. Savol bo'lsa — administrator bilan bog'laning.", { parse_mode: "HTML" }).catch(() => undefined);
      }
    }
  });
}
