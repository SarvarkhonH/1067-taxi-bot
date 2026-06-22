// 🔑 /driver_login — two-step flow that connects a Telegram user to their kas driver creds.
// Step 1: /driver_login → bot asks for carNumber → POST /api/driverApp/driverLogin/ → kas SMS's
// the driver's registered phone. Step 2: user types the 4-6 digit SMS code → POST
// /api/driverApp/driverConfirmSms/ → kas returns the live secretKey → we seal it (AES-GCM) and
// save to DriverSession. Future driver-side features (qarz, history, queue push) just call
// getDriverSession(memberId) and use the decrypted key.
//
// Auth gating: this command is open to ANY linked member (we don't pre-check Member.type === "driver"
// — kas itself enforces the carNumber+secretKey check, and a non-driver typing a random plate just
// gets a clean error). If you're already linked, re-logging replaces the prior session.
import { Bot, Context, InlineKeyboard } from "grammy";
import { getMe } from "../services/memberService";
import { driverConfirmSms, driverLogin, botDeviceSerial } from "../services/kasDriverApi";
import { saveDriverSession, revokeDriverSession } from "../services/driverAuth";
import { prisma } from "../db";

interface LoginStep {
  step: "awaiting_car" | "awaiting_sms";
  carNumber?: string; // captured at step 1, replayed at confirm
  startedAt: number;
}

// Exported so /start can cancel a half-finished wizard (parity with payDriver).
export const driverLoginFlow = new Map<string, LoginStep>();
const FLOW_TTL_MS = 5 * 60 * 1000; // SMS rarely takes >5 min; abandoned flows clear themselves

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function gcStaleFlows(): void {
  const now = Date.now();
  for (const [id, s] of driverLoginFlow) if (now - s.startedAt > FLOW_TTL_MS) driverLoginFlow.delete(id);
}

export function registerDriverLogin(bot: Bot): void {
  const start = async (ctx: Context): Promise<void> => {
    gcStaleFlows();
    const id = String(ctx.from!.id);
    const me = await getMe(id);
    if (!me?.member.phone) {
      await ctx.reply("Avval /start orqali raqamingizni ulang.");
      return;
    }
    driverLoginFlow.set(id, { step: "awaiting_car", startedAt: Date.now() });
    await ctx.reply(
      "🚗 <b>Haydovchi sifatida kirish</b>\n\nMashina raqamingizni yozing (masalan <code>01A123BC</code>):\n<i>Bekor — /start</i>",
      { parse_mode: "HTML" },
    );
  };
  bot.command("driver_login", start);
  bot.command("haydovchikirish", start); // Uzbek alias

  // /driver_logout — soft-revoke + clear any half-done login flow
  bot.command("driver_logout", async (ctx) => {
    const id = String(ctx.from!.id);
    driverLoginFlow.delete(id);
    const me = await getMe(id);
    if (!me) {
      await ctx.reply("Avval /start orqali ulanish kerak.");
      return;
    }
    await revokeDriverSession(me.member.id);
    await ctx.reply("✅ Haydovchi sessiyasi yopildi. Qayta ulanish: /driver_login");
  });

  // Step inputs — registered BEFORE generic text handlers, falls through when not in flow.
  bot.on("message:text", async (ctx, next) => {
    const id = String(ctx.from!.id);
    const state = driverLoginFlow.get(id);
    if (!state) return next();
    const text = ctx.message.text.trim();
    if (text.startsWith("/")) {
      driverLoginFlow.delete(id);
      return next(); // let /start / other commands take over
    }
    const me = await getMe(id);
    if (!me) {
      driverLoginFlow.delete(id);
      await ctx.reply("Sessiya yo'qoldi — /start qayta urinib ko'ring.");
      return;
    }

    // ── Step 1: car number → request SMS ────────────────────────────────────
    if (state.step === "awaiting_car") {
      const car = text.toUpperCase().replace(/\s+/g, "");
      if (car.length < 4) {
        await ctx.reply("Raqam juda qisqa. Qayta yozing yoki /start bilan bekor qiling.");
        return;
      }
      const r = await driverLogin(car, botDeviceSerial(me.member.id));
      if (!r.ok) {
        driverLoginFlow.delete(id);
        await ctx.reply(
          `❌ Kirish bo'lmadi: ${esc(r.error ?? "noma'lum xato")}\n\nMashina raqami ro'yxatda yo'q yoki kas server javob bermadi. /driver_login bilan qayta urinib ko'ring.`,
          { parse_mode: "HTML" },
        );
        return;
      }
      state.step = "awaiting_sms";
      state.carNumber = car;
      state.startedAt = Date.now(); // restart TTL — SMS may take a minute
      driverLoginFlow.set(id, state);
      const centres = [r.smsCentreNumber1, r.smsCentreNumber2].filter(Boolean).join(", ") || "—";
      await ctx.reply(
        `📩 <b>SMS yuborildi</b>\n\nRaqam: <code>${esc(car)}</code>\nKas raqamlari: <code>${esc(centres)}</code>\n\nKodni yozing (4-6 raqam):\n<i>Bekor — /start</i>`,
        { parse_mode: "HTML" },
      );
      return;
    }

    // ── Step 2: SMS code → confirm + seal ───────────────────────────────────
    if (state.step === "awaiting_sms") {
      const code = text.replace(/\D/g, "");
      if (code.length < 4 || code.length > 6) {
        await ctx.reply("Kod 4-6 raqamli bo'lishi kerak. Qayta yozing yoki /start bilan bekor:");
        return;
      }
      const car = state.carNumber!;
      const r = await driverConfirmSms(car, code);
      if (!r.ok || !r.secretKey) {
        driverLoginFlow.delete(id);
        await ctx.reply(
          `❌ Kod tasdiqlanmadi: ${esc(r.error ?? "noto'g'ri kod")}\n\n/driver_login bilan qayta urinib ko'ring.`,
          { parse_mode: "HTML" },
        );
        return;
      }
      try {
        await saveDriverSession(me.member.id, car, r.secretKey);
      } catch (e) {
        driverLoginFlow.delete(id);
        await ctx.reply(
          `❌ Sessiyani saqlash xato berdi: ${esc(e instanceof Error ? e.message : String(e))}\n\n(Server-tomon konfiguratsiyasi: <code>DRIVER_KEY_AES</code> envi yetishmasligi mumkin.) Adminga ayting.`,
          { parse_mode: "HTML" },
        );
        return;
      }
      // Sync the member's carNumber if we just learned it (only fills empty; never overwrites
      // an existing kas-mirror value). Type stays as kas says — even if `type` is currently
      // "client", a future kas sync will flip them to "driver" once the plate matches.
      try {
        if (!me.member.carNumber) {
          await prisma.member.update({ where: { id: me.member.id }, data: { carNumber: car } });
        }
      } catch {
        /* best-effort — the kas sync will eventually overwrite anyway */
      }
      driverLoginFlow.delete(id);
      await ctx.reply(
        `✅ <b>Haydovchi hisobingiz ulandi</b>\n\nMashina: <code>${esc(car)}</code>\n\nEndi mavjud: /qarz · /safarlarim · /daromad\n<i>Sessiyani yopish — /driver_logout</i>`,
        { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("💸 Qarz", "drv:debt").text("📜 Safarlar", "drv:hist") },
      );
      return;
    }
  });
}
