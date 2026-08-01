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
    .text("📊 Mening hisobim", "ish:acct")
    .text("💸 Pul oldim", "ish:pay");
}

// ForceReply-prompt matni = sessiyasiz "wizard": javob-xabar aynan shu promptga
// reply bo'lsa, summa deb qabul qilamiz (bot restartida ham yo'qolmaydi).
const PAY_PROMPT = "💸 Qancha pul oldingiz? Faqat summa yozing (masalan: 500000). Izoh qo'shsangiz bo'ladi: 500000 avans";

// Summa: yaxlit son YOKI 3-xonali guruhlar ("1 000 000"). `[\d\s]+` ochko'z variant
// "100000 2 kun avans"ni 1 000 002 qilib yuborardi (tekshiruv topgan) — endi
// raqam-boshli izoh summaga qo'shilib ketolmaydi.
const PAY_AMOUNT_RE = /^(\d{1,3}(?: \d{3})+|\d+)(?:\s+(.{0,80}))?$/;
const FORCE_REPLY = { force_reply: true as const, input_field_placeholder: "500000 avans" };

function isPayReply(replyTo: unknown, botId: number): boolean {
  const r = replyTo as { from?: { id?: number }; text?: string } | undefined;
  return r?.from?.id === botId && r?.text === PAY_PROMPT;
}

// Answer the spinner FIRST (before DB work), reply after; a service throw must
// not leave the button hanging for 30s. Maosh ma'lumoti FAQAT shaxsiy chatda —
// guruhda bosilsa balans guruhga to'kilardi (tekshiruv topgan).
function onTap(action: (tgId: string) => Promise<{ ok: boolean; text: string }>): (ctx: Context) => Promise<void> {
  return async (ctx) => {
    if (ctx.chat && ctx.chat.type !== "private") {
      await ctx.answerCallbackQuery({ text: "Botga shaxsiy yozing: /ish", show_alert: true }).catch(() => undefined);
      return;
    }
    await ctx.answerCallbackQuery().catch(() => undefined);
    const r = await action(String(ctx.from?.id ?? ""));
    await ctx.reply(r.text, { parse_mode: "HTML", reply_markup: r.ok ? ishKeyboard() : undefined }).catch(() => undefined);
  };
}

/** Egaga bugungi xulosa + ✅ Tasdiqlash (kechki 21:00 kartasining talab-bo'yicha nusxasi). */
async function sendOwnerSummary(ctx: Context, tg: string): Promise<boolean> {
  const { staffOwnerSummary } = await import("../services/staffService");
  const s = await staffOwnerSummary(tg);
  if (!s.ok || !s.text) return false;
  const kb = s.unconfirmed && s.orgId && s.date ? new InlineKeyboard().text("✅ Tasdiqlash", `ishc:${s.orgId}:${s.date}`) : undefined;
  await ctx.reply(s.text, { parse_mode: "HTML", reply_markup: kb }).catch(() => undefined);
  return true;
}

export function registerStaff(bot: Bot): void {
  bot.command("ish", async (ctx) => {
    const tg = String(ctx.from?.id ?? "");
    if (!tg || ctx.chat.type !== "private") return; // guruhda jim — maosh sirti yo'q
    const { employeeFor } = await import("../services/staffService");
    const emp = await employeeFor(tg);
    if (emp) {
      await ctx.reply(
        `👔 <b>${esc(emp.name)}</b> — ${esc(emp.org.name)}\nIsh boshida "Keldim", ketishda "Ketdim" bosing.`,
        { parse_mode: "HTML", reply_markup: ishKeyboard() }
      );
      return;
    }
    // Xodim emas, lekin KORXONA EGASI bo'lishi mumkin — unga jim qolish noto'g'ri
    // (2026-08-01: ega /ish yozdi, bot mutlaqo javob bermadi). Boshqalarga — jim.
    await sendOwnerSummary(ctx, tg);
  });

  // 📋 Egaga bugungi xulosa TALAB BO'YICHA (21:00 ni kutmasdan) + ✅ Tasdiqlash.
  bot.command("jamoa", async (ctx) => {
    const tg = String(ctx.from?.id ?? "");
    if (!tg || ctx.chat.type !== "private") return;
    await sendOwnerSummary(ctx, tg);
  });

  bot.callbackQuery("ish:in", onTap(async (tg) => (await import("../services/staffService")).staffCheckIn(tg)));
  bot.callbackQuery("ish:out", onTap(async (tg) => (await import("../services/staffService")).staffCheckOut(tg)));
  bot.callbackQuery("ish:acct", onTap(async (tg) => (await import("../services/staffService")).staffMyAccount(tg)));

  // 💸 Xodim "Pul oldim" bosdi → ForceReply-prompt (sessiyasiz, faqat shaxsiy chat).
  bot.callbackQuery("ish:pay", async (ctx) => {
    if (ctx.chat && ctx.chat.type !== "private") {
      await ctx.answerCallbackQuery({ text: "Botga shaxsiy yozing: /ish", show_alert: true }).catch(() => undefined);
      return;
    }
    await ctx.answerCallbackQuery().catch(() => undefined);
    const { employeeFor } = await import("../services/staffService");
    if (!(await employeeFor(String(ctx.from.id)))) return;
    await ctx.reply(PAY_PROMPT, { reply_markup: FORCE_REPLY }).catch(() => undefined);
  });

  // Promptga javob-xabar = summa. next() bilan o'tkazuvchan: bizniki bo'lmasa
  // keyingi handlerlarga (AI va h.k.) tegmaydi.
  bot.on("message:text", async (ctx, next) => {
    if (!isPayReply(ctx.message.reply_to_message, ctx.me.id) || ctx.chat.type !== "private") { await next(); return; }
    const m = PAY_AMOUNT_RE.exec(ctx.message.text.trim());
    const amount = m ? Number((m[1] ?? "").replace(/\s/g, "")) : NaN;
    const note = m?.[2]?.trim() ?? "";
    const { staffSelfPayout } = await import("../services/staffService");
    const r = await staffSelfPayout(String(ctx.from.id), amount, note, `${ctx.chat.id}:${ctx.message.message_id}`);
    // Xato bo'lsa YANA ForceReply — xodim qayta yozgani promptga reply bo'lib qoladi
    // (aks holda ikkinchi urinish AI catch-all'ga tushib yo'qolardi).
    await ctx.reply(r.text, { parse_mode: "HTML", reply_markup: r.ok ? ishKeyboard() : FORCE_REPLY }).catch(() => undefined);
    if (r.ok && r.owner) {
      const kb = new InlineKeyboard().text("❌ Bekor qilish", `ishx:${r.owner.ledgerId}`);
      if (r.owner.chatId === String(ctx.from.id)) {
        // Ega o'zi xodim (o'zi-o'ziga yozdi) — alohida karta shart emas, bekor tugmasi shu yerda
        await ctx.reply("Bekor qilish kerak bo'lsa:", { reply_markup: kb }).catch(() => undefined);
      } else {
        await ctx.api.sendMessage(r.owner.chatId, r.owner.text, { parse_mode: "HTML", reply_markup: kb }).catch((e) => {
          // Ega kartasi — nazoratning YAGONA kanali; jim yutilmaydi (tekshiruv topgan)
          console.error(`[staff] self-payout ega-kartasi yuborilmadi (ega=${r.owner?.chatId}, ledger=${r.owner?.ledgerId}):`, e);
        });
      }
    }
  });

  // Promptga RASM bilan javob (chek fotosi) — message:text otilmaydi; jim o'lik
  // tugamasin: matn so'raymiz (yana ForceReply bilan).
  bot.on("message:photo", async (ctx, next) => {
    if (!isPayReply(ctx.message.reply_to_message, ctx.me.id) || ctx.chat.type !== "private") { await next(); return; }
    await ctx.reply("Faqat matn bilan yozing, masalan: 500000 avans", { reply_markup: FORCE_REPLY }).catch(() => undefined);
  });

  // Ega ❌ Bekor bosdi — xodim o'zi yozgan payout o'chiriladi, xodimga xabar.
  bot.callbackQuery(/^ishx:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => undefined);
    const { staffSelfPayoutCancel } = await import("../services/staffService");
    const r = await staffSelfPayoutCancel(Number(ctx.match[1]), String(ctx.from.id));
    if (r.ok) await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => undefined);
    await ctx.reply(r.text, { parse_mode: "HTML" }).catch(() => undefined);
    if (r.ok && r.employee) await ctx.api.sendMessage(r.employee.chatId, r.employee.text, { parse_mode: "HTML" }).catch(() => undefined);
  });

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